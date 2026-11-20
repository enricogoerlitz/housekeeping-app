-- Spec 0004 — the activity tables and the new columns in the delta sync and the generic write path.
--
-- * sync_pull also answers activities, activity_favorites and activity_ratings (composite key
--   activity_id:member_id, like the restaurant tables).
-- * apply_changes: allowlist entries for activities (insert, patch, delete; created_by only on
--   insert, overwritten by its trigger) and the new columns meal_plan_entries.activity_id / note
--   and recipes.photo_path. activity_favorites / activity_ratings stay RPC-only.
-- Both bodies are copied unchanged otherwise (apply_changes from 20261120182725, sync_pull from
-- 20261120153257); all limits stay as they are.

-- ---------------------------------------------------------------------------------------------
-- sync_pull
-- ---------------------------------------------------------------------------------------------

create or replace function public.sync_pull(p_request jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  -- The synced household tables (db-handoff T6, spec 0004). Small tables are listed separately below.
  c_tables constant text[] := array[
    'areas', 'articles', 'stores', 'shopping_lists',
    'recipes', 'recipe_favorites', 'recipe_ratings',
    'restaurants', 'restaurant_favorites', 'restaurant_ratings',
    'activities', 'activity_favorites', 'activity_ratings',
    'absences', 'feedback', 'feedback_votes',
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
-- ---------------------------------------------------------------------------------------------

create or replace function public.apply_changes(p_household_id uuid, p_ops jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  -- table → columns an insert may set, columns a patch may set, whether rows may be deleted.
  -- household_id may be sent on insert but must equal p_household_id; it is always forced.
  -- created_by (activities) and author_id (feedback) are overwritten by their insert triggers.
  c_allowlist constant jsonb := $json${
    "areas":            {"insert": ["id", "household_id", "name", "sort"],
                         "patch":  ["name", "sort"], "delete": true},
    "articles":         {"insert": ["id", "household_id", "name", "name_key", "synonyms", "synonym_keys",
                                    "area_id", "diet", "is_pantry"],
                         "patch":  ["name", "name_key", "synonyms", "synonym_keys", "area_id", "diet",
                                    "is_pantry"], "delete": true},
    "stores":           {"insert": ["id", "household_id", "name", "area_order", "hidden_area_ids"],
                         "patch":  ["name", "area_order", "hidden_area_ids"], "delete": true},
    "shopping_lists":   {"insert": ["id", "household_id", "name", "is_default", "store_id"],
                         "patch":  ["name", "is_default", "store_id"], "delete": true},
    "recipes":          {"insert": ["id", "household_id", "title", "photo", "photo_path", "description", "servings",
                                    "total_minutes", "course", "cuisine", "tags", "variants", "ingredients",
                                    "steps", "lead_time", "notes", "last_cooked_on", "cooked_count", "source"],
                         "patch":  ["title", "photo", "photo_path", "description", "servings", "total_minutes", "course",
                                    "cuisine", "tags", "variants", "ingredients", "steps", "lead_time", "notes",
                                    "last_cooked_on", "cooked_count", "source"], "delete": true},
    "restaurants":      {"insert": ["id", "household_id", "name", "address", "lat", "lng", "maps_url", "cuisine",
                                    "price_level", "tags", "notes"],
                         "patch":  ["name", "address", "lat", "lng", "maps_url", "cuisine", "price_level", "tags",
                                    "notes"], "delete": true},
    "activities":       {"insert": ["id", "household_id", "name", "name_key", "description", "photo_path", "place_name",
                                    "address", "lat", "lng", "maps_url", "tags", "created_by"],
                         "patch":  ["name", "name_key", "description", "photo_path", "place_name", "address", "lat",
                                    "lng", "maps_url", "tags"], "delete": true},
    "absences":         {"insert": ["id", "household_id", "member_id", "from_on", "to_on", "note"],
                         "patch":  ["member_id", "from_on", "to_on", "note"], "delete": true},
    "feedback":         {"insert": ["id", "household_id", "kind", "text", "status", "author_id", "screen", "reason",
                                    "spec_ref"],
                         "patch":  ["kind", "text", "status", "screen", "reason", "spec_ref"], "delete": true},
    "chores":           {"insert": ["id", "household_id", "title", "room", "recurrence", "assignment", "effort",
                                    "next_due_on", "next_assignee_id", "last_done_on", "active_months"],
                         "patch":  ["title", "room", "recurrence", "assignment", "effort", "next_due_on",
                                    "next_assignee_id", "last_done_on", "active_months"], "delete": true},
    "chore_events":     {"insert": ["id", "household_id", "chore_id", "title", "kind", "done_on", "done_by"],
                         "patch":  ["chore_id", "title", "kind", "done_on", "done_by"], "delete": true},
    "meal_plan_entries": {"insert": ["id", "household_id", "date", "slot_id", "kind", "recipe_id", "restaurant_id",
                                     "activity_id", "text", "note", "leftovers_of_entry_id", "eater_ids", "guests",
                                     "portions", "variants", "cook_id", "sort", "not_cooked"],
                          "patch":  ["date", "slot_id", "kind", "recipe_id", "restaurant_id", "activity_id", "text",
                                     "note", "leftovers_of_entry_id", "eater_ids", "guests", "portions", "variants",
                                     "cook_id", "sort", "not_cooked"], "delete": true},
    "shopping_items":   {"insert": ["id", "household_id", "list_id", "article_id"],
                         "patch":  ["list_id", "article_id"], "delete": true},
    "shopping_contributions": {"insert": ["id", "household_id", "item_id", "source", "count", "qty", "unit", "note"],
                               "patch":  ["item_id", "source", "count", "qty", "unit", "note"], "delete": true},
    "households":       {"insert": [],
                         "patch":  ["name", "meal_slots", "default_list_id", "default_store_id"], "delete": false}
  }$json$;
  c_max_ops constant integer := 200;
  c_max_deletes constant integer := 20;
  c_max_contributions constant integer := 500;

  v_op jsonb;
  v_kind text;
  v_table text;
  v_rules jsonb;
  v_row jsonb;
  v_changes jsonb;
  v_id uuid;
  v_columns text;
  v_select text;
  v_set text;
  v_count integer;
  v_list_id uuid;
  v_ids uuid[];
  v_results jsonb := '[]';
  v_op_count integer;
  v_delete_count integer;
  v_contribution_count integer;
begin
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if jsonb_typeof(p_ops) is distinct from 'array' then
    raise exception 'invalid_change' using errcode = '22023';
  end if;
  -- A domain op counts as its elements: every id of remove_contributions is a delete and an op,
  -- every entry of add_contributions is an op. The contributions of all entries are capped too.
  select coalesce(sum(case when o ->> 'kind' = 'remove_contributions' and jsonb_typeof(o -> 'ids') = 'array'
                             then greatest(jsonb_array_length(o -> 'ids'), 1)
                           when o ->> 'kind' = 'add_contributions' and jsonb_typeof(o -> 'entries') = 'array'
                             then greatest(jsonb_array_length(o -> 'entries'), 1)
                           else 1 end), 0),
         count(*) filter (where o ->> 'kind' = 'delete')
           + coalesce(sum(jsonb_array_length(o -> 'ids'))
                        filter (where o ->> 'kind' = 'remove_contributions' and jsonb_typeof(o -> 'ids') = 'array'), 0),
         coalesce(sum(c.contributions), 0)
  into v_op_count, v_delete_count, v_contribution_count
  from jsonb_array_elements(p_ops) o
  cross join lateral (
    select count(*) as contributions
    from jsonb_array_elements(case when o ->> 'kind' = 'add_contributions' and jsonb_typeof(o -> 'entries') = 'array'
                                   then o -> 'entries' else '[]' end) e
    cross join lateral jsonb_array_elements(case when jsonb_typeof(e -> 'contributions') = 'array'
                                                 then e -> 'contributions' else '[]' end) x
  ) c;
  if v_op_count > c_max_ops or v_delete_count > c_max_deletes or v_contribution_count > c_max_contributions then
    raise exception 'too_many_changes' using errcode = '22023';
  end if;

  for v_op in select o.value from jsonb_array_elements(p_ops) o loop
    if jsonb_typeof(v_op) is distinct from 'object' then
      raise exception 'invalid_change' using errcode = '22023';
    end if;
    v_kind := v_op ->> 'kind';

    -- Domain ops: the same internal functions as the store/list RPCs (T4).
    if v_kind = 'add_contributions' then
      v_list_id := (v_op ->> 'list_id')::uuid;
      if not exists (
        select 1 from public.shopping_lists l where l.id = v_list_id and l.household_id = p_household_id
      ) then
        raise exception 'list_not_found' using errcode = 'P0002';
      end if;
      v_results := v_results || jsonb_build_array(private.add_shopping_contributions(v_list_id, v_op -> 'entries'));
      continue;
    elsif v_kind = 'remove_contributions' then
      if jsonb_typeof(v_op -> 'ids') is distinct from 'array' then
        raise exception 'invalid_change' using errcode = '22023';
      end if;
      v_ids := array(select x::uuid from jsonb_array_elements_text(v_op -> 'ids') x);
      v_results := v_results || jsonb_build_array(private.remove_contributions(v_ids, p_household_id));
      continue;
    end if;

    -- Row ops: the table must be a key of the allowlist (exact match, so no quoting tricks).
    v_table := case when jsonb_typeof(v_op -> 'table') = 'string' then v_op ->> 'table' end;
    v_rules := c_allowlist -> v_table;
    if v_rules is null or v_kind is null or v_kind not in ('insert', 'patch', 'delete') then
      raise exception 'invalid_change' using errcode = '22023';
    end if;

    if v_kind = 'insert' then
      v_row := v_op -> 'row';
      if jsonb_typeof(v_row) is distinct from 'object'
         or exists (select 1 from jsonb_object_keys(v_row) k where not (v_rules -> 'insert') ? k)
         or (v_row ? 'household_id' and lower(v_row ->> 'household_id') is distinct from p_household_id::text) then
        raise exception 'invalid_change' using errcode = '22023';
      end if;
      v_row := v_row || jsonb_build_object('household_id', p_household_id);
      select string_agg(format('%I', k), ', '), string_agg(format('r.%I', k), ', ')
      into v_columns, v_select
      from jsonb_object_keys(v_row) k;
      execute format(
        'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) r',
        v_table, v_columns, v_select, v_table)
      using v_row;

    elsif v_kind = 'patch' then
      v_changes := v_op -> 'changes';
      if jsonb_typeof(v_op -> 'id') is distinct from 'string'
         or jsonb_typeof(v_changes) is distinct from 'object'
         or v_changes = '{}'::jsonb
         or exists (select 1 from jsonb_object_keys(v_changes) k where not (v_rules -> 'patch') ? k) then
        raise exception 'invalid_change' using errcode = '22023';
      end if;
      v_id := (v_op ->> 'id')::uuid;
      if v_table = 'households' and v_id <> p_household_id then
        raise exception 'invalid_change' using errcode = '22023';
      end if;
      select string_agg(format('%1$I = r.%1$I', k), ', ') into v_set from jsonb_object_keys(v_changes) k;
      execute format(
        'update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r '
        'where t.id = $2 and t.%I = $3',
        v_table, v_set, v_table, case when v_table = 'households' then 'id' else 'household_id' end)
      using v_changes, v_id, p_household_id;
      get diagnostics v_count = row_count;
      if v_count = 0 then
        raise exception 'row_not_found' using errcode = 'P0002';
      end if;

    else -- delete; a row that is already gone is fine (undo, or deleted by someone else)
      if not (v_rules -> 'delete')::boolean or jsonb_typeof(v_op -> 'id') is distinct from 'string' then
        raise exception 'invalid_change' using errcode = '22023';
      end if;
      execute format('delete from public.%I t where t.id = $1 and t.household_id = $2', v_table)
      using (v_op ->> 'id')::uuid, p_household_id;
    end if;
  end loop;

  return jsonb_build_object('applied', jsonb_array_length(p_ops), 'results', v_results);
end
$$;
