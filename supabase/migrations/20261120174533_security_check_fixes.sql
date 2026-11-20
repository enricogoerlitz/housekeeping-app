-- Spec 0003 — fixes from the security check (plan.md, "Security-Check").
--
-- 1. Invitations are always accepted explicitly (AC-008, decision 7): the auth.users trigger only
--    creates the profile. New and existing accounts join with accept_invitation and refuse with
--    decline_invitation. Otherwise any member of any household could invite an address and see
--    the profile of the account that signs up with it.
-- 2. The before_user_created hook also requires that Google verified the address:
--    user.user_metadata.email_verified must be the boolean true. Supabase Auth copies the
--    provider's claims into user_metadata (supabase/auth internal/api/provider Claims,
--    `email_verified`); missing, false or any other value → not_invited.
-- 3. restore_cleared_items takes the check fields from the client, so it now bounds them:
--    checked_at ≤ now(), check_seq clamped to 0…1000000 (new check constraint on the column),
--    checked_by only while a current member (unchanged).
-- 4. apply_changes counts every id of a remove_contributions op as a delete and as an op, so the
--    limits (≤ 200 ops, ≤ 20 deletes) cannot be bypassed through the domain op. The limits guard
--    against client bugs, not against members: a member may delete rows through the API anyway
--    (docs/architecture/sync.md, Nachtrag "Vertrauensmodell").

-- ---------------------------------------------------------------------------------------------
-- 1. Account bootstrap: profile only
-- ---------------------------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(new.email));
  v_name text;
begin
  v_name := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(v_email, '@', 1), '')
  ), 80);

  insert into public.profiles (id, name, email, color)
  values (new.id, v_name, v_email, private.profile_color(new.id));

  return new;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Sign-up gate: invitation, Google and a verified address
-- ---------------------------------------------------------------------------------------------

create or replace function private.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_email text := lower(btrim(event -> 'user' ->> 'email'));
  v_provider text := event -> 'user' -> 'app_metadata' ->> 'provider';
  v_verified jsonb := event -> 'user' -> 'user_metadata' -> 'email_verified';
begin
  if v_provider = 'google'
     and v_verified = 'true'::jsonb
     and v_email is not null
     and exists (
       select 1 from public.household_invitations i
       where i.email = v_email and i.accepted_at is null
     ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'not_invited'));
end
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. restore_cleared_items: bounded check fields
-- ---------------------------------------------------------------------------------------------

-- 1000000 changes of one item are far beyond real use; the store RPCs raise 23514 past it.
alter table public.shopping_items drop constraint shopping_items_check_seq_valid;
alter table public.shopping_items add constraint shopping_items_check_seq_valid
  check (check_seq between 0 and 1000000);

-- Unchanged except: checked_at is at most now(), check_seq is clamped to 0…1000000.
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
      least(coalesce(v_item.checked_at, now()), now()),
      (select m.profile_id from public.household_members m
       where m.household_id = v_household_id and m.profile_id = v_item.checked_by),
      least(greatest(coalesce(v_item.check_seq, 0), 0), 1000000),
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


-- ---------------------------------------------------------------------------------------------
-- 4. apply_changes: remove_contributions ids count toward the limits
-- ---------------------------------------------------------------------------------------------

-- Unchanged except the limit check at the top.
create or replace function public.apply_changes(p_household_id uuid, p_ops jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  -- table → columns an insert may set, columns a patch may set, whether rows may be deleted.
  -- household_id may be sent on insert but must equal p_household_id; it is always forced.
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
    "recipes":          {"insert": ["id", "household_id", "title", "photo", "description", "servings",
                                    "total_minutes", "course", "cuisine", "tags", "variants", "ingredients",
                                    "steps", "lead_time", "notes", "last_cooked_on", "cooked_count", "source"],
                         "patch":  ["title", "photo", "description", "servings", "total_minutes", "course",
                                    "cuisine", "tags", "variants", "ingredients", "steps", "lead_time", "notes",
                                    "last_cooked_on", "cooked_count", "source"], "delete": true},
    "restaurants":      {"insert": ["id", "household_id", "name", "address", "lat", "lng", "maps_url", "cuisine",
                                    "price_level", "tags", "notes"],
                         "patch":  ["name", "address", "lat", "lng", "maps_url", "cuisine", "price_level", "tags",
                                    "notes"], "delete": true},
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
                                     "text", "leftovers_of_entry_id", "eater_ids", "guests", "portions", "variants",
                                     "cook_id", "sort", "not_cooked"],
                          "patch":  ["date", "slot_id", "kind", "recipe_id", "restaurant_id", "text",
                                     "leftovers_of_entry_id", "eater_ids", "guests", "portions", "variants",
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
begin
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if jsonb_typeof(p_ops) is distinct from 'array' then
    raise exception 'invalid_change' using errcode = '22023';
  end if;
  -- Every id of a remove_contributions op is a delete and an op of its own.
  select jsonb_array_length(p_ops) + coalesce(sum(r.ids), 0),
         count(*) filter (where o ->> 'kind' = 'delete') + coalesce(sum(r.ids), 0)
  into v_op_count, v_delete_count
  from jsonb_array_elements(p_ops) o
  cross join lateral (
    select case when o ->> 'kind' = 'remove_contributions' and jsonb_typeof(o -> 'ids') = 'array'
                then jsonb_array_length(o -> 'ids') end as ids
  ) r;
  if v_op_count > c_max_ops or v_delete_count > c_max_deletes then
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

