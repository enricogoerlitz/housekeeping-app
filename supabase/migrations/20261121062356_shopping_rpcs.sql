-- Baseline (ADR-0012) — store and list RPCs. The shopping list is the set of items of a household,
-- so the list actions take the household id.
--
-- The four store-mode actions that work offline (ADR-0008 addendum) are one RPC each, replayed
-- by the store queue: set_shopping_item_checked, set_shopping_item_not_available,
-- add_shopping_contributions and assign_article_area. Plus the list actions that change several
-- rows at once: clear_checked_items, clear_shopping_list, restore_cleared_items (undo of both),
-- remove_contributions (undo of adding) and adjust_item_count (+ and − on "Liste").
--
-- * The check state (checked, checked_at, checked_by, check_seq, not_available) has no client
--   grant, so the functions writing it are security definer and check membership themselves.
--   "Checking wins": unchecking applies only while check_seq still equals the value the device
--   saw (docs/architecture/sync.md, "Nachtrag Spec 0003").
-- * Store actions on a row that no longer exists (or is not visible) return null instead of an
--   error, so a replayed queue entry is dropped silently.
-- * Everything else is security invoker: RLS decides.
-- * Adding, unchecking and restoring serialise per (household, article) with a transaction
--   advisory lock, so two devices adding "Brot" at once end with one item.
-- * A household id the caller is not a member of is refused with not_member (42501) — also by the
--   security invoker list actions, so a foreign id never silently returns an empty result.

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

-- Serialises changes to the items of one article in one household until the transaction ends.
-- Called only from the definer functions below; not granted to the API roles.
create function private.lock_household_article(p_household_id uuid, p_article_id uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_household_id::text || ':' || p_article_id::text, 0));
$$;

-- ---------------------------------------------------------------------------------------------
-- set_shopping_item_checked
-- ---------------------------------------------------------------------------------------------

-- Rule table (sync.md):
--   not checked + check                         → checked (check_seq + 1, checked_by = caller)
--   checked     + check                         → unchanged
--   checked     + uncheck, check_seq = seen     → not checked (check_seq + 1)
--   checked     + uncheck, check_seq ≠ seen     → stays checked ("checking wins")
--   not checked + uncheck                       → unchanged
--   item gone or in another household           → null
-- Unchecking while another open item of the same article is on the list moves the contributions
-- into that open item and deletes the checked one; the result then names the open item.
create function private.set_shopping_item_checked(p_item_id uuid, p_checked boolean, p_seen_check_seq integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.shopping_items;
  v_open_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_checked is null then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  select i.* into v_item
  from public.shopping_items i
  where i.id = p_item_id and i.household_id in (select private.my_household_ids());
  if not found then
    return null;
  end if;

  perform private.lock_household_article(v_item.household_id, v_item.article_id);
  select i.* into v_item from public.shopping_items i where i.id = p_item_id for update;
  if not found then
    return null;
  end if;

  if p_checked then
    if not v_item.checked then
      update public.shopping_items i
      set checked = true, checked_at = now(), checked_by = v_uid, check_seq = i.check_seq + 1
      where i.id = p_item_id
      returning i.* into v_item;
    end if;
  elsif v_item.checked and v_item.check_seq = p_seen_check_seq then
    select i.id into v_open_id
    from public.shopping_items i
    where i.household_id = v_item.household_id and i.article_id = v_item.article_id and not i.checked
    for update;

    if v_open_id is null then
      update public.shopping_items i
      set checked = false, checked_at = null, checked_by = null, check_seq = i.check_seq + 1
      where i.id = p_item_id
      returning i.* into v_item;
    else
      update public.shopping_contributions c
      set item_id = v_open_id
      where c.household_id = v_item.household_id and c.item_id = p_item_id;
      delete from public.shopping_items i where i.id = p_item_id;
      select i.* into v_item from public.shopping_items i where i.id = v_open_id;
    end if;
  end if;

  return jsonb_build_object('item_id', v_item.id, 'checked', v_item.checked, 'check_seq', v_item.check_seq);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- set_shopping_item_not_available
-- ---------------------------------------------------------------------------------------------

-- Marks an item as "nicht da" (true) or takes that back (false). Null when the item is gone or
-- belongs to another household.
create function private.set_shopping_item_not_available(p_item_id uuid, p_value boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_value is null then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  update public.shopping_items i
  set not_available = p_value
  where i.id = p_item_id and i.household_id in (select private.my_household_ids())
  returning jsonb_build_object('item_id', i.id, 'not_available', i.not_available) into v_result;
  return v_result;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- add_shopping_contributions
-- ---------------------------------------------------------------------------------------------

-- Puts contributions on the household's shopping list. Entries (≤ 200, each with 1–100 contributions, ≤ 1000
-- contributions in all):
--   [{"client_item_id": uuid, "client_article_id": uuid, "article_name": text, "name_key": text,
--     "contributions": [{"id": uuid, "source": jsonb, "count", "qty", "unit", "note"}]}]
-- Per entry, in order:
-- 1. A repeat (a contribution id already exists): the entry is already applied; missing
--    contributions of it go to the same item, nothing is reopened.
-- 2. The article: by name_key, else by name_key in synonym_keys, else a new article with the
--    client's id (diet unknown, no area). Keys are computed by the client (core normalizeText).
-- 3. The item, under a lock per (household, article): the open item, else the most recently checked
--    item reopened (check, "nicht da" and its bought contributions cleared; core
--    addContribution), else a new item with the client's id.
-- A client id already used by another row is replaced by a fresh one; the result maps it.
-- Returns [{"client_item_id", "item_id", "client_article_id", "article_id"}] in entry order.
create function private.add_shopping_contributions(p_household_id uuid, p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := p_household_id;
  v_entry jsonb;
  v_contributions jsonb;
  v_contribution_ids uuid[];
  v_client_item_id uuid;
  v_client_article_id uuid;
  v_name_key text;
  v_article_id uuid;
  v_item_id uuid;
  v_result jsonb := '[]';
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'invalid_entries' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) > 200
     or (select count(*)
         from jsonb_array_elements(p_entries) e
         cross join lateral jsonb_array_elements(case when jsonb_typeof(e -> 'contributions') = 'array'
                                                      then e -> 'contributions' else '[]' end) c) > 1000 then
    raise exception 'too_many_changes' using errcode = '22023';
  end if;

  for v_entry in select e.value from jsonb_array_elements(p_entries) e loop
    v_contributions := v_entry -> 'contributions';
    if jsonb_typeof(v_entry) <> 'object'
       or jsonb_typeof(v_entry -> 'client_item_id') is distinct from 'string'
       or jsonb_typeof(v_entry -> 'client_article_id') is distinct from 'string'
       or jsonb_typeof(v_entry -> 'article_name') is distinct from 'string'
       or jsonb_typeof(v_entry -> 'name_key') is distinct from 'string'
       or jsonb_typeof(v_contributions) is distinct from 'array'
       or jsonb_array_length(v_contributions) not between 1 and 100
       or jsonb_path_exists(v_contributions, '$[*] ? (!(@.id.type() == "string"))') then
      raise exception 'invalid_entries' using errcode = '22023';
    end if;
    begin
      v_client_item_id := (v_entry ->> 'client_item_id')::uuid;
      v_client_article_id := (v_entry ->> 'client_article_id')::uuid;
      v_contribution_ids := array(select (c ->> 'id')::uuid from jsonb_array_elements(v_contributions) c);
    exception when invalid_text_representation then
      raise exception 'invalid_entries' using errcode = '22023';
    end;
    v_name_key := v_entry ->> 'name_key';

    -- 1. A repeat of an entry that was already applied.
    if exists (
      select 1 from public.shopping_contributions c
      where c.id = any (v_contribution_ids) and c.household_id <> v_household_id
    ) then
      raise exception 'invalid_entries' using errcode = '22023';
    end if;
    select c.item_id, i.article_id into v_item_id, v_article_id
    from public.shopping_contributions c
    join public.shopping_items i on i.household_id = c.household_id and i.id = c.item_id
    where c.id = any (v_contribution_ids)
    limit 1;

    if v_item_id is null then
      -- 2. The article.
      select a.id into v_article_id
      from public.articles a
      where a.household_id = v_household_id and a.name_key = v_name_key;
      if v_article_id is null then
        select a.id into v_article_id
        from public.articles a
        where a.household_id = v_household_id and v_name_key = any (a.synonym_keys)
        order by a.created_at, a.id
        limit 1;
      end if;
      if v_article_id is null then
        insert into public.articles (id, household_id, name, name_key)
        values (
          case when exists (select 1 from public.articles a where a.id = v_client_article_id)
               then gen_random_uuid() else v_client_article_id end,
          v_household_id, btrim(v_entry ->> 'article_name'), v_name_key)
        on conflict (household_id, name_key) do nothing
        returning id into v_article_id;
        if v_article_id is null then
          -- Created by a concurrent transaction that has committed meanwhile.
          select a.id into v_article_id
          from public.articles a
          where a.household_id = v_household_id and a.name_key = v_name_key;
        end if;
      end if;

      -- 3. The item.
      perform private.lock_household_article(v_household_id, v_article_id);
      select i.id into v_item_id
      from public.shopping_items i
      where i.household_id = v_household_id and i.article_id = v_article_id and not i.checked
      for update;
      if v_item_id is null then
        select i.id into v_item_id
        from public.shopping_items i
        where i.household_id = v_household_id and i.article_id = v_article_id and i.checked
        order by i.checked_at desc nulls last, i.id
        limit 1
        for update;
        if v_item_id is not null then
          delete from public.shopping_contributions c
          where c.household_id = v_household_id and c.item_id = v_item_id;
          update public.shopping_items i
          set checked = false, checked_at = null, checked_by = null, not_available = false,
              check_seq = i.check_seq + 1
          where i.id = v_item_id;
        else
          insert into public.shopping_items (id, household_id, article_id)
          values (
            case when exists (select 1 from public.shopping_items i where i.id = v_client_item_id)
                 then gen_random_uuid() else v_client_item_id end,
            v_household_id, v_article_id)
          returning id into v_item_id;
        end if;
      end if;
    end if;

    insert into public.shopping_contributions (id, household_id, item_id, source, count, qty, unit, note)
    select (c ->> 'id')::uuid,
           v_household_id,
           v_item_id,
           coalesce(nullif(c -> 'source', 'null'::jsonb), '{"kind": "manual"}'::jsonb),
           (c ->> 'count')::integer,
           (c ->> 'qty')::numeric,
           c ->> 'unit',
           c ->> 'note'
    from jsonb_array_elements(v_contributions) c
    on conflict do nothing;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'client_item_id', v_client_item_id, 'item_id', v_item_id,
      'client_article_id', v_client_article_id, 'article_id', v_article_id));
    v_item_id := null;
    v_article_id := null;
  end loop;

  return v_result;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- remove_contributions
-- ---------------------------------------------------------------------------------------------

-- Deletes contributions (≤ 1000 ids, so the undo of any accepted addition is one call), then the
-- items they emptied; items that were already empty are left alone. Ids of other households are
-- ignored (RLS). p_household_id limits the call to one household (apply_changes); null = all of
-- the caller's households. Returns how many contributions were deleted. Security invoker.
create function private.remove_contributions(p_ids uuid[], p_household_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_item_ids uuid[];
begin
  if cardinality(p_ids) > 1000 then
    raise exception 'too_many_changes' using errcode = '22023';
  end if;

  with removed as (
    delete from public.shopping_contributions c
    where c.id = any (p_ids) and (p_household_id is null or c.household_id = p_household_id)
    returning c.item_id
  )
  select count(*)::integer, array_agg(distinct r.item_id) into v_count, v_item_ids from removed r;

  delete from public.shopping_items i
  where i.id = any (v_item_ids)
    and not exists (
      select 1 from public.shopping_contributions c
      where c.household_id = i.household_id and c.item_id = i.id
    );

  return v_count;
end
$$;

grant execute on function private.set_shopping_item_checked(uuid, boolean, integer) to authenticated;
grant execute on function private.set_shopping_item_not_available(uuid, boolean) to authenticated;
grant execute on function private.add_shopping_contributions(uuid, jsonb) to authenticated;
grant execute on function private.remove_contributions(uuid[], uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------------------------

create function public.set_shopping_item_checked(p_item_id uuid, p_checked boolean, p_seen_check_seq integer)
returns jsonb
language sql
set search_path = ''
as $$ select private.set_shopping_item_checked($1, $2, $3) $$;

create function public.set_shopping_item_not_available(p_item_id uuid, p_value boolean)
returns jsonb
language sql
set search_path = ''
as $$ select private.set_shopping_item_not_available($1, $2) $$;

create function public.add_shopping_contributions(p_household_id uuid, p_entries jsonb)
returns jsonb
language sql
set search_path = ''
as $$ select private.add_shopping_contributions($1, $2) $$;

create function public.remove_contributions(p_ids uuid[])
returns integer
language sql
set search_path = ''
as $$ select private.remove_contributions($1, null) $$;

-- Assigns an area to an article (null removes it). Null when the article or the area is gone or
-- belongs to another household, so a replayed queue entry is dropped. Security invoker: members
-- may update articles.area_id.
create function public.assign_article_area(p_article_id uuid, p_area_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_area_id is not null and not exists (
    select 1 from public.areas a
    join public.articles ar on ar.household_id = a.household_id
    where a.id = p_area_id and ar.id = p_article_id
  ) then
    return null;
  end if;

  update public.articles a
  set area_id = p_area_id
  where a.id = p_article_id
  returning jsonb_build_object('article_id', a.id, 'area_id', a.area_id) into v_result;
  return v_result;
end
$$;

-- Deletes the checked items of the household's shopping list ("Fertig" in store mode) and returns
-- them with their contributions, [{"item": {row}, "contributions": [{row}, …]}, …], for
-- restore_cleared_items. An item reopened meanwhile is no longer checked and stays. Security
-- invoker.
create function public.clear_checked_items(p_household_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  -- The contributions are read from the statement's snapshot, before the cascade removes them.
  with deleted as (
    delete from public.shopping_items i
    where i.household_id = p_household_id and i.checked
    returning i.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'item', to_jsonb(d),
           'contributions', coalesce((
             select jsonb_agg(to_jsonb(c) order by c.created_at, c.id)
             from public.shopping_contributions c
             where c.household_id = d.household_id and c.item_id = d.id), '[]'::jsonb))
         order by d.created_at, d.id), '[]'::jsonb)
  into v_result
  from deleted d;

  return v_result;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- restore_cleared_items
-- ---------------------------------------------------------------------------------------------

-- Undo of clear_checked_items and clear_shopping_list. p_items is exactly what they returned:
-- [{"item": {row}, "contributions": [{row}]}]. Every item must belong to p_household_id, every
-- contribution to its item; otherwise invalid_entries and nothing is restored. ≤ 1000 items
-- (too_many_changes), so the undo of any cleared list is one call.
-- The check state of the entry decides (missing = checked): checked items come back checked with
-- checked_at ≤ now(), check_seq clamped to 0…999000 (room for checks after a restore) and
-- checked_by only while that person is still a member; open items come back open. An open item
-- whose article is open on the list again meanwhile (someone added it) is not restored as a second
-- item: its contributions join the open item. An item whose id exists already is skipped,
-- contributions use on conflict do nothing, so a repeated call restores nothing twice.
-- created_at / updated_at are set by the server. Returns how many entries were restored
-- (inserted, or joined with at least one new contribution).
create function private.restore_cleared_items(p_household_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := p_household_id;
  v_entry jsonb;
  v_item public.shopping_items;
  v_contributions public.shopping_contributions[];
  v_checked boolean;
  v_target_id uuid;
  v_inserted integer;
  v_added integer;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'invalid_entries' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 1000 then
    raise exception 'too_many_changes' using errcode = '22023';
  end if;

  for v_entry in select e.value from jsonb_array_elements(p_items) e loop
    if jsonb_typeof(v_entry) is distinct from 'object'
       or jsonb_typeof(v_entry -> 'item') is distinct from 'object'
       or jsonb_typeof(coalesce(v_entry -> 'contributions', '[]')) is distinct from 'array'
       or jsonb_path_exists(coalesce(v_entry -> 'contributions', '[]'), '$[*] ? (@.type() != "object")') then
      raise exception 'invalid_entries' using errcode = '22023';
    end if;
    begin
      v_item := jsonb_populate_record(null::public.shopping_items, v_entry -> 'item');
      v_contributions := array(
        select jsonb_populate_record(null::public.shopping_contributions, c)
        from jsonb_array_elements(coalesce(v_entry -> 'contributions', '[]')) c);
    exception when data_exception then
      raise exception 'invalid_entries' using errcode = '22023';
    end;
    if v_item.id is null
       or v_item.article_id is null
       or v_item.household_id is distinct from v_household_id
       or exists (
         select 1 from unnest(v_contributions) c
         where c.id is null or c.item_id is distinct from v_item.id or c.household_id is distinct from v_household_id
       ) then
      raise exception 'invalid_entries' using errcode = '22023';
    end if;
    v_checked := coalesce(v_item.checked, true);
    v_target_id := null;
    v_inserted := 0;

    if not v_checked then
      -- Same lock as adding and unchecking: one open item per article, also while restoring.
      perform private.lock_household_article(v_household_id, v_item.article_id);
      select i.id into v_target_id
      from public.shopping_items i
      where i.household_id = v_household_id and i.article_id = v_item.article_id and not i.checked
      for update;
    end if;

    if v_target_id is null then
      insert into public.shopping_items
        (id, household_id, article_id, checked, checked_at, checked_by, check_seq, not_available)
      values (
        v_item.id, v_household_id, v_item.article_id, v_checked,
        case when v_checked then least(coalesce(v_item.checked_at, now()), now()) end,
        case when v_checked then
          (select m.profile_id from public.household_members m
           where m.household_id = v_household_id and m.profile_id = v_item.checked_by) end,
        least(greatest(coalesce(v_item.check_seq, 0), 0), 999000),
        coalesce(v_item.not_available, false))
      on conflict do nothing;
      get diagnostics v_inserted = row_count;
      -- Only onto the item of this household (skipped if its id is taken elsewhere).
      select i.id into v_target_id
      from public.shopping_items i
      where i.household_id = v_household_id and i.id = v_item.id;
    end if;

    insert into public.shopping_contributions (id, household_id, item_id, source, count, qty, unit, note)
    select c.id, v_household_id, v_target_id, coalesce(c.source, '{"kind": "manual"}'::jsonb),
           c.count, c.qty, c.unit, c.note
    from unnest(v_contributions) c
    where v_target_id is not null
    on conflict do nothing;
    get diagnostics v_added = row_count;

    if v_inserted > 0 or (v_target_id is distinct from v_item.id and v_added > 0) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end
$$;

grant execute on function private.restore_cleared_items(uuid, jsonb) to authenticated;

create function public.restore_cleared_items(p_household_id uuid, p_items jsonb)
returns integer
language sql
set search_path = ''
as $$ select private.restore_cleared_items($1, $2) $$;

grant execute on function public.restore_cleared_items(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- clear_shopping_list
-- ---------------------------------------------------------------------------------------------

-- Deletes every item of the household's shopping list ("Liste leeren …"), open and checked, and
-- returns them with their contributions, [{"item": {row}, "contributions": [{row}, …]}, …], for
-- restore_cleared_items. Security invoker.
create function public.clear_shopping_list(p_household_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  -- The contributions are read from the statement's snapshot, before the cascade removes them.
  with deleted as (
    delete from public.shopping_items i
    where i.household_id = p_household_id
    returning i.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'item', to_jsonb(d),
           'contributions', coalesce((
             select jsonb_agg(to_jsonb(c) order by c.created_at, c.id)
             from public.shopping_contributions c
             where c.household_id = d.household_id and c.item_id = d.id), '[]'::jsonb))
         order by d.created_at, d.id), '[]'::jsonb)
  into v_result
  from deleted d;

  return v_result;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- adjust_item_count
-- ---------------------------------------------------------------------------------------------

-- One tap on + (p_delta > 0) or − (p_delta < 0), |p_delta| ≤ 99. Returns
--   {"item_id", "count", "removed": false}                       the counted total afterwards
--   {"item_id", "count": 0, "removed": true, "item", "contributions"}  item and contributions as
--                                                                 they were before, for the undo
--   null                                                          item gone or not visible
-- invalid_value (22023): delta 0, null or beyond ±99; + above 99× or − below 0× in total.
create function public.adjust_item_count(p_item_id uuid, p_delta integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_item public.shopping_items;
  v_before jsonb;
  v_total integer;
  v_left integer;
  v_contribution record;
  v_manual_id uuid;
begin
  if p_delta is null or p_delta = 0 or p_delta not between -99 and 99 then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  -- The row lock serialises taps on this item (and adding to it), so no tap is lost.
  select i.* into v_item from public.shopping_items i where i.id = p_item_id for update;
  if not found then
    return null;
  end if;

  select coalesce(sum(c.count), 0)::integer into v_total
  from public.shopping_contributions c
  where c.household_id = v_item.household_id and c.item_id = v_item.id;
  -- + never goes above 99×, − never below 0× (a larger total from recipes can still go down).
  if v_total + p_delta < 0 or (p_delta > 0 and v_total + p_delta > 99) then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  if p_delta > 0 then
    select c.id into v_manual_id
    from public.shopping_contributions c
    where c.household_id = v_item.household_id and c.item_id = v_item.id
      and c.source ->> 'kind' = 'manual' and c.count is not null
    order by c.created_at desc, c.id desc
    limit 1;
    if v_manual_id is null then
      insert into public.shopping_contributions (household_id, item_id, source, count)
      values (v_item.household_id, v_item.id, '{"kind": "manual"}', p_delta);
    else
      update public.shopping_contributions c set count = c.count + p_delta where c.id = v_manual_id;
    end if;
    return jsonb_build_object('item_id', v_item.id, 'count', v_total + p_delta, 'removed', false);
  end if;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at, c.id), '[]'::jsonb) into v_before
  from public.shopping_contributions c
  where c.household_id = v_item.household_id and c.item_id = v_item.id;

  -- "von Hand" first, then the most recently added contribution.
  v_left := -p_delta;
  for v_contribution in
    select c.id, c.count
    from public.shopping_contributions c
    where c.household_id = v_item.household_id and c.item_id = v_item.id and c.count is not null
    order by (c.source ->> 'kind' = 'manual') desc, c.created_at desc, c.id desc
  loop
    exit when v_left = 0;
    if v_contribution.count <= v_left then
      v_left := v_left - v_contribution.count;
      if exists (select 1 from public.shopping_contributions c where c.id = v_contribution.id and c.qty is not null) then
        update public.shopping_contributions c set count = null where c.id = v_contribution.id;
      else
        delete from public.shopping_contributions c where c.id = v_contribution.id;
      end if;
    else
      update public.shopping_contributions c set count = c.count - v_left where c.id = v_contribution.id;
      v_left := 0;
    end if;
  end loop;

  if not exists (
    select 1 from public.shopping_contributions c
    where c.household_id = v_item.household_id and c.item_id = v_item.id
  ) then
    delete from public.shopping_items i where i.id = v_item.id;
    return jsonb_build_object('item_id', v_item.id, 'count', 0, 'removed', true,
                              'item', to_jsonb(v_item), 'contributions', v_before);
  end if;
  return jsonb_build_object('item_id', v_item.id, 'count', v_total + p_delta, 'removed', false);
end
$$;

grant execute on function public.set_shopping_item_checked(uuid, boolean, integer) to authenticated;
grant execute on function public.set_shopping_item_not_available(uuid, boolean) to authenticated;
grant execute on function public.add_shopping_contributions(uuid, jsonb) to authenticated;
grant execute on function public.remove_contributions(uuid[]) to authenticated;
grant execute on function public.assign_article_area(uuid, uuid) to authenticated;
grant execute on function public.clear_checked_items(uuid) to authenticated;

grant execute on function public.clear_shopping_list(uuid) to authenticated;
grant execute on function public.adjust_item_count(uuid, integer) to authenticated;
