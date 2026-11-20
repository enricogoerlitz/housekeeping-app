-- Spec 0003 — undo of "Erledigt leeren" and retention of the AI quota counters.
--
-- * restore_cleared_items puts the items clear_checked_items deleted back on their list, still
--   checked. The check state has no client grant (T3/T4), so apply_changes cannot restore it;
--   this RPC is security definer and checks membership itself.
-- * ai_usage keeps one row per person and day; rows older than 90 days are purged daily.

-- ---------------------------------------------------------------------------------------------
-- restore_cleared_items
-- ---------------------------------------------------------------------------------------------

-- p_items is exactly what clear_checked_items returned: [{"item": {row}, "contributions": [{row}]}].
-- Every item must belong to p_list_id (and so to its household), every contribution to its item;
-- otherwise invalid_entries and nothing is restored. ≤ 200 items (too_many_changes).
-- Items come back with their id, article, checked = true, checked_at, check_seq and
-- not_available as given; checked_by only while that person is still a member (else null).
-- An item whose id exists already is skipped, contributions use on conflict do nothing, so a
-- repeated call restores nothing twice. created_at / updated_at are set by the server.
-- Returns the number of items restored.
create function private.restore_cleared_items(p_list_id uuid, p_items jsonb)
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
  v_inserted integer;
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
  if jsonb_array_length(p_items) > 200 then
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

    insert into public.shopping_items
      (id, household_id, list_id, article_id, checked, checked_at, checked_by, check_seq, not_available)
    values (
      v_item.id, v_household_id, p_list_id, v_item.article_id, true,
      coalesce(v_item.checked_at, now()),
      (select m.profile_id from public.household_members m
       where m.household_id = v_household_id and m.profile_id = v_item.checked_by),
      coalesce(v_item.check_seq, 0),
      coalesce(v_item.not_available, false))
    on conflict do nothing;
    get diagnostics v_inserted = row_count;
    v_count := v_count + v_inserted;

    -- Only onto the item of this household (skipped above if its id is taken elsewhere).
    insert into public.shopping_contributions (id, household_id, item_id, source, count, qty, unit, note)
    select c.id, v_household_id, c.item_id, coalesce(c.source, '{"kind": "manual"}'::jsonb),
           c.count, c.qty, c.unit, c.note
    from unnest(v_contributions) c
    where exists (
      select 1 from public.shopping_items i where i.household_id = v_household_id and i.id = v_item.id
    )
    on conflict do nothing;
  end loop;

  return v_count;
end
$$;

grant execute on function private.restore_cleared_items(uuid, jsonb) to authenticated;

create function public.restore_cleared_items(p_list_id uuid, p_items jsonb)
returns integer
language sql
set search_path = ''
as $$ select private.restore_cleared_items($1, $2) $$;

grant execute on function public.restore_cleared_items(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- ai_usage retention
-- ---------------------------------------------------------------------------------------------

create function private.purge_ai_usage()
returns void
language sql
set search_path = ''
as $$
  delete from public.ai_usage where day < (now() at time zone 'Europe/Berlin')::date - 90;
$$;

select cron.schedule('purge-ai-usage', '20 3 * * *', 'select private.purge_ai_usage()');
