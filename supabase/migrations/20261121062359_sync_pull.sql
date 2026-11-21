-- Baseline (ADR-0012) — sync_pull: the read path of the delta sync (docs/architecture/sync.md).
--
-- Security invoker: every row goes through RLS as the caller, exactly like a direct API read
-- (10-security: never a sync path that bypasses RLS). One call answers core's PullRequest with a
-- PullResult (packages/core/src/sync-delta.ts):
--   request  {"households": {"<id>": {"full": true} | {"full": false, "since": {"<table>": "<ts>"}}}}
--   response {"serverTime": ts,
--             "small": {"profiles": [...], "households": [...], "household_members": [...],
--                       "household_invitations": [...]},
--             "households": {"<id>": {"full": bool, "rows": {"<table>": [row, ...]},
--                                     "tombstones": [{"table", "id", "deletedAt"}]}}}
-- * Small tables come in full on every pull: their visibility changes without updated_at.
-- * Households the caller is not a member of are left out silently (removed, foreign, or only
--   invited; an invited household appears in small.households and small.household_invitations).
-- * Rows with updated_at > since[table], tombstones with deleted_at > since[table]; a table
--   missing from since (or a full request) is answered in full. Rows are the table's columns;
--   composite-key tables have no id column (the client keys them like deleted_records.record_id).

create function public.sync_pull(p_request jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  -- The synced household tables (db-handoff T6, spec 0004; packing tables spec 0012). Small tables are listed separately below.
  c_tables constant text[] := array[
    'areas', 'articles', 'stores',
    'recipes', 'recipe_favorites', 'recipe_ratings',
    'restaurants', 'restaurant_favorites', 'restaurant_ratings',
    'activities', 'activity_favorites', 'activity_ratings',
    'absences', 'feedback', 'feedback_votes',
    'packing_bags', 'packing_bag_items', 'packing_list_bags', 'packing_items',
    'chores', 'chore_events', 'meal_plan_entries',
    'shopping_items', 'shopping_contributions'];

  v_household_id uuid;
  v_request jsonb;
  v_full boolean;
  v_since jsonb;
  v_table text;
  v_table_rows jsonb;
  v_rows jsonb;
  v_tombstones jsonb;
  v_households jsonb := '{}';
begin
  if jsonb_typeof(p_request) is distinct from 'object'
     or jsonb_typeof(p_request -> 'households') is distinct from 'object' then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  for v_household_id, v_request in
    select h.id, r.value
    from jsonb_each(p_request -> 'households') r
    join private.my_household_ids() h (id) on h.id::text = lower(r.key)
  loop
    v_full := v_request ->> 'full' is distinct from 'false';
    v_since := case when not v_full and jsonb_typeof(v_request -> 'since') = 'object'
                    then v_request -> 'since' else '{}'::jsonb end;

    v_rows := '{}';
    foreach v_table in array c_tables loop
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t '
        'where t.household_id = $1 and ($2::timestamptz is null or t.updated_at > $2)',
        v_table)
      into v_table_rows
      using v_household_id, (v_since ->> v_table)::timestamptz;
      v_rows := v_rows || jsonb_build_object(v_table, v_table_rows);
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object('table', d.table_name, 'id', d.record_id, 'deletedAt', d.deleted_at)
                              order by d.deleted_at), '[]'::jsonb)
    into v_tombstones
    from public.deleted_records d
    where d.household_id = v_household_id
      and d.table_name = any (c_tables)
      and (not v_since ? d.table_name or d.deleted_at > (v_since ->> d.table_name)::timestamptz);

    v_households := v_households || jsonb_build_object(v_household_id::text, jsonb_build_object(
      'full', v_full, 'rows', v_rows, 'tombstones', v_tombstones));
  end loop;

  return jsonb_build_object(
    'serverTime', now(),
    'small', jsonb_build_object(
      'profiles', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) from public.profiles p),
      'households', (select coalesce(jsonb_agg(to_jsonb(h) order by h.id), '[]'::jsonb) from public.households h),
      'household_members', (select coalesce(jsonb_agg(to_jsonb(m) order by m.household_id, m.profile_id), '[]'::jsonb)
                            from public.household_members m),
      'household_invitations', (select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb)
                                from public.household_invitations i)),
    'households', v_households);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- apply_changes

grant execute on function public.sync_pull(jsonb) to authenticated;
