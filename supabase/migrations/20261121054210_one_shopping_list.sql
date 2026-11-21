-- Spec 0006, REQ-001 — one shopping list per household (D25).
--
-- 1. merge_shopping_lists() folds every further list of a household into its list (target:
--    households.default_list_id, else the list marked is_default, else the oldest), in this
--    migration's transaction and under a table lock, so nothing is written meanwhile:
--    * an open item moves to the target and keeps its id (queued checks still hit it, AC-002,
--      AC-004);
--    * if the target already has an open item of that article, the contributions move into it one
--      by one (ids, sources, amounts and notes unchanged) and the emptied item is deleted;
--    * checked items of the other lists were bought and are deleted, then the other lists.
--    Every deletion leaves its tombstone through the existing triggers; moved rows get a new
--    updated_at, so the delta sync delivers both. Everything stays inside one household_id.
--    Idempotent: with one list per household it changes nothing. Kept (not granted to anyone) so
--    the pgTAP test can run it against a multi-list fixture.
-- 2. At most one list per household: unique (household_id). Members can no longer insert or
--    delete lists (no grant, not in the apply_changes allowlist); an older app that tries gets an
--    error. Renaming stays allowed. create_household already creates exactly one list.
-- 3. shopping_lists.is_default and store_id are no longer read by the app; they stay for now
--    (expand → contract) and are dropped by a later migration.

-- ---------------------------------------------------------------------------------------------
-- 1. Merge
-- ---------------------------------------------------------------------------------------------

create function private.merge_shopping_lists()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_household record;
  v_target_id uuid;
  v_item record;
  v_open_id uuid;
begin
  -- Reads go on; writes to the lists wait until the merge has committed.
  lock table public.shopping_lists, public.shopping_items, public.shopping_contributions in exclusive mode;

  for v_household in
    select h.id, h.default_list_id
    from public.households h
    where (h.default_list_id is null
           and exists (select 1 from public.shopping_lists l where l.household_id = h.id))
       or exists (select 1 from public.shopping_lists l
                  where l.household_id = h.id and l.id is distinct from h.default_list_id)
    order by h.id
  loop
    v_target_id := coalesce(v_household.default_list_id, (
      select l.id from public.shopping_lists l
      where l.household_id = v_household.id
      order by l.is_default desc, l.created_at, l.id
      limit 1));
    if v_household.default_list_id is null then
      update public.households h set default_list_id = v_target_id where h.id = v_household.id;
    end if;

    -- Open items of the other lists, oldest first; each one moves or joins the open item.
    for v_item in
      select i.id, i.article_id
      from public.shopping_items i
      where i.household_id = v_household.id and i.list_id <> v_target_id and not i.checked
      order by i.created_at, i.id
    loop
      select i.id into v_open_id
      from public.shopping_items i
      where i.household_id = v_household.id and i.list_id = v_target_id
        and i.article_id = v_item.article_id and not i.checked;
      if v_open_id is null then
        update public.shopping_items i set list_id = v_target_id where i.id = v_item.id;
      else
        update public.shopping_contributions c set item_id = v_open_id
        where c.household_id = v_household.id and c.item_id = v_item.id;
        delete from public.shopping_items i where i.id = v_item.id;
      end if;
    end loop;

    -- What is left on the other lists is checked (bought); it goes with the lists.
    delete from public.shopping_items i
    where i.household_id = v_household.id and i.list_id <> v_target_id;
    delete from public.shopping_lists l
    where l.household_id = v_household.id and l.id <> v_target_id;
  end loop;
end
$$;

select private.merge_shopping_lists();

-- ---------------------------------------------------------------------------------------------
-- 2. At most one list per household
-- ---------------------------------------------------------------------------------------------

alter table public.shopping_lists
  add constraint shopping_lists_household_id_key unique (household_id);

-- Revoking the table privilege also revokes the column-level insert grant.
revoke insert, delete on public.shopping_lists from authenticated;

-- ---------------------------------------------------------------------------------------------
-- apply_changes
-- ---------------------------------------------------------------------------------------------

-- Copied from 20261120192522_sync_activities.sql; changed only: shopping_lists has no insert and
-- no delete any more, and a table without insert columns rejects every insert (also an empty row).
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
    "shopping_lists":   {"insert": [],
                         "patch":  ["name", "is_default", "store_id"], "delete": false},
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
      if jsonb_array_length(v_rules -> 'insert') = 0
         or jsonb_typeof(v_row) is distinct from 'object'
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
