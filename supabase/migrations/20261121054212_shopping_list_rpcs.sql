-- Spec 0006 — list editing RPCs and the store queue across the list merge.
--
-- * adjust_item_count(item, delta): + and − on "Liste", one call per tap, atomic under the item's
--   row lock, so two devices tapping at once both count (AC-017). + adds to the most recent
--   "von Hand" contribution with a count (or creates one); − takes from "von Hand" first, then
--   from the most recently added other contributions (REQ-003, open question 4a). Quantities
--   ("500 g") are never changed. + stops at 99×, − at 0×; at 0 without any quantity
--   left the item is removed and returned for "Rückgängig" (AC-015). Security invoker: RLS
--   decides, a foreign or vanished item gives null (like the store actions, AC-027).
-- * clear_shopping_list(list): deletes every item of the list, open and checked, and returns them
--   like clear_checked_items for the undo (AC-035, open question 3). Security invoker.
-- * restore_cleared_items: open items come back open, checked ones checked. An open item whose
--   article is open on the list again meanwhile (someone added it) is not restored as a second
--   item: its contributions join the open item (AC-037). Up to 1000 items, so the undo of any
--   cleared list is one call.
-- * add_shopping_contributions: a list id that was merged away (spec 0006, migration
--   20261121054210) resolves through its tombstone to the household's one list (AC-004).
--   Unchanged otherwise (body from 20261120183022).
-- Editing the note of a whole item (AC-021) needs nothing new: apply_changes patches `note` on
-- each of its contributions in one call.

-- ---------------------------------------------------------------------------------------------
-- add_shopping_contributions
-- ---------------------------------------------------------------------------------------------

create or replace function private.add_shopping_contributions(p_list_id uuid, p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_list_id uuid;
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

  select l.household_id, l.id into v_household_id, v_list_id
  from public.shopping_lists l
  where l.id = p_list_id and l.household_id in (select private.my_household_ids());
  if v_household_id is null then
    -- A list merged away by spec 0006: a queued entry of a device that still knows it lands on
    -- the one list of that household (AC-004). Only while the tombstone exists (30 days).
    select l.household_id, l.id into v_household_id, v_list_id
    from public.deleted_records d
    join public.shopping_lists l on l.household_id = d.household_id
    where d.table_name = 'shopping_lists' and d.record_id = p_list_id::text
      and d.household_id in (select private.my_household_ids())
    order by d.deleted_at desc
    limit 1;
  end if;
  if v_household_id is null then
    raise exception 'list_not_found' using errcode = 'P0002';
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
      perform private.lock_list_article(v_list_id, v_article_id);
      select i.id into v_item_id
      from public.shopping_items i
      where i.list_id = v_list_id and i.article_id = v_article_id and not i.checked
      for update;
      if v_item_id is null then
        select i.id into v_item_id
        from public.shopping_items i
        where i.list_id = v_list_id and i.article_id = v_article_id and i.checked
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
            v_household_id, v_list_id, v_article_id)
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
-- restore_cleared_items
-- ---------------------------------------------------------------------------------------------

-- From 20261120182725; changed: the check state of the entry decides (missing = checked, as
-- before), an open entry joins an open item of the same article, up to 1000 items. Returns how
-- many entries were restored (inserted, or joined with at least one new contribution).
create or replace function private.restore_cleared_items(p_list_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
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

  select l.household_id into v_household_id
  from public.shopping_lists l
  where l.id = p_list_id and l.household_id in (select private.my_household_ids());
  if v_household_id is null then
    raise exception 'list_not_found' using errcode = 'P0002';
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
       or v_item.list_id is distinct from p_list_id
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
      perform private.lock_list_article(p_list_id, v_item.article_id);
      select i.id into v_target_id
      from public.shopping_items i
      where i.list_id = p_list_id and i.article_id = v_item.article_id and not i.checked
      for update;
    end if;

    if v_target_id is null then
      insert into public.shopping_items
        (id, household_id, list_id, article_id, checked, checked_at, checked_by, check_seq, not_available)
      values (
        v_item.id, v_household_id, p_list_id, v_item.article_id, v_checked,
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

-- ---------------------------------------------------------------------------------------------
-- clear_shopping_list
-- ---------------------------------------------------------------------------------------------

-- Deletes every item of a list ("Liste leeren …") and returns them with their contributions,
-- [{"item": {row}, "contributions": [{row}, …]}, …], for restore_cleared_items. Security invoker.
create function public.clear_shopping_list(p_list_id uuid)
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
    where i.list_id = p_list_id
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

grant execute on function public.clear_shopping_list(uuid) to authenticated;
grant execute on function public.adjust_item_count(uuid, integer) to authenticated;
