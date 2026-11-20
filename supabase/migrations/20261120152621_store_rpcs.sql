-- Spec 0003, T4 — store and list RPCs.
--
-- The four store-mode actions that work offline (ADR-0008 addendum) are one RPC each, replayed
-- by the store queue: set_shopping_item_checked, set_shopping_item_not_available,
-- add_shopping_contributions and assign_article_area. Plus the list actions that change several
-- rows at once: clear_checked_items and remove_contributions (undo of adding).
--
-- * The check state (checked, checked_at, checked_by, check_seq, not_available) has no client
--   grant, so the functions writing it are security definer and check membership themselves.
--   "Checking wins": unchecking applies only while check_seq still equals the value the device
--   saw (docs/architecture/sync.md, "Nachtrag Spec 0003").
-- * Store actions on a row that no longer exists (or is not visible) return null instead of an
--   error, so a replayed queue entry is dropped silently (AC-025).
-- * Everything else is security invoker: RLS decides.
-- * Adding and unchecking serialise per (list, article) with a transaction advisory lock, so two
--   devices adding "Brot" at once end with one item (AC-023).

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

-- Serialises changes to the items of one article on one list until the transaction ends.
-- Called only from the definer functions below; not granted to the API roles.
create function private.lock_list_article(p_list_id uuid, p_article_id uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_list_id::text || ':' || p_article_id::text, 0));
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

  perform private.lock_list_article(v_item.list_id, v_item.article_id);
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
    where i.list_id = v_item.list_id and i.article_id = v_item.article_id and not i.checked
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

-- Puts contributions on a list. Entries (≤ 200, each with 1–100 contributions):
--   [{"client_item_id": uuid, "client_article_id": uuid, "article_name": text, "name_key": text,
--     "contributions": [{"id": uuid, "source": jsonb, "count", "qty", "unit", "note"}]}]
-- Per entry, in order:
-- 1. A repeat (a contribution id already exists): the entry is already applied; missing
--    contributions of it go to the same item, nothing is reopened.
-- 2. The article: by name_key, else by name_key in synonym_keys, else a new article with the
--    client's id (diet unknown, no area). Keys are computed by the client (core normalizeText).
-- 3. The item, under a lock per (list, article): the open item, else the most recently checked
--    item reopened (check, "nicht da" and its bought contributions cleared; core
--    addContribution), else a new item with the client's id.
-- A client id already used by another row is replaced by a fresh one; the result maps it.
-- Returns [{"client_item_id", "item_id", "client_article_id", "article_id"}] in entry order.
create function private.add_shopping_contributions(p_list_id uuid, p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
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

  select l.household_id into v_household_id
  from public.shopping_lists l
  where l.id = p_list_id and l.household_id in (select private.my_household_ids());
  if v_household_id is null then
    raise exception 'list_not_found' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'invalid_entries' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) > 200 then
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
      perform private.lock_list_article(p_list_id, v_article_id);
      select i.id into v_item_id
      from public.shopping_items i
      where i.list_id = p_list_id and i.article_id = v_article_id and not i.checked
      for update;
      if v_item_id is null then
        select i.id into v_item_id
        from public.shopping_items i
        where i.list_id = p_list_id and i.article_id = v_article_id and i.checked
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
          insert into public.shopping_items (id, household_id, list_id, article_id)
          values (
            case when exists (select 1 from public.shopping_items i where i.id = v_client_item_id)
                 then gen_random_uuid() else v_client_item_id end,
            v_household_id, p_list_id, v_article_id)
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

-- Deletes contributions (≤ 200 ids), then the items they emptied; items that were already empty
-- are left alone. Ids of other households are ignored (RLS). p_household_id limits the call to
-- one household (apply_changes); null = all of the caller's households. Returns how many
-- contributions were deleted. Security invoker.
create function private.remove_contributions(p_ids uuid[], p_household_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_item_ids uuid[];
begin
  if cardinality(p_ids) > 200 then
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

create function public.add_shopping_contributions(p_list_id uuid, p_entries jsonb)
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

-- Deletes the checked items of a list ("Fertig" in store mode) and returns them with their
-- contributions, [{"item": {row}, "contributions": [{row}, …]}, …], so the client can undo with
-- inserts. An item reopened meanwhile is no longer checked and stays. Security invoker.
create function public.clear_checked_items(p_list_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not exists (select 1 from public.shopping_lists l where l.id = p_list_id) then
    raise exception 'list_not_found' using errcode = 'P0002';
  end if;

  -- The contributions are read from the statement's snapshot, before the cascade removes them.
  with deleted as (
    delete from public.shopping_items i
    where i.list_id = p_list_id and i.checked
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

grant execute on function public.set_shopping_item_checked(uuid, boolean, integer) to authenticated;
grant execute on function public.set_shopping_item_not_available(uuid, boolean) to authenticated;
grant execute on function public.add_shopping_contributions(uuid, jsonb) to authenticated;
grant execute on function public.remove_contributions(uuid[]) to authenticated;
grant execute on function public.assign_article_area(uuid, uuid) to authenticated;
grant execute on function public.clear_checked_items(uuid) to authenticated;
