-- contract: packing_items.per_day heißt per_day_quantity, household_media_names heißt begin_household_deletion (Spec 0031), keine Kompatibilität mit 2026.11.1; min_app_version: 2026.11.1
-- Spec 0031, REQ-017 — small schema cleanups (D-05, D-06, D-09, D-12, D-13). Clean target before
-- the first productively used version (spec 0031, Decision 2): no expand/contract.
--
-- * D-05: household_members and household_invitations are small tables that sync_pull sends in
--   full on every pull ("small"), so a removed member or a withdrawn invitation is gone on the
--   next pull. They need no tombstones and no (household_id, updated_at) index (AC-043).
-- * D-06: profiles_email_idx goes (nothing looks profiles up by e-mail), and
--   households_default_store_fkey is a plain foreign key (no RPC swaps rows).
-- * D-09: an index on meal_plan_entries (household_id, date) for the calendar's day queries.
-- * D-12: household_media_names is begin_household_deletion: it closes the household for new
--   members and returns the names of its photos (AC-045).
-- * D-13: packing_items.per_day is per_day_quantity (the quantity per day of the trip; the flag
--   per_day of a Reisetasche stays), in the triggers, adopt_bag_changes, restore_packing_items and
--   the allowlist of apply_changes. maps_url of restaurants and activities follows
--   private.is_web_url, the rule core parseMapsLink accepts (AC-044).
--
-- The functions below are unchanged apart from the column (packing_items_before_insert and
-- recalc_packing_quantities from 20261122190000_trips, packing_items_before_update,
-- adopt_bag_changes and restore_packing_items from 20261122190100_packing_list_edit, apply_changes
-- from 20261123070739_delete_chore).

-- ---------------------------------------------------------------------------------------------
-- D-05: small tables come in full
-- ---------------------------------------------------------------------------------------------

drop trigger household_members_record_deletion on public.household_members;
drop trigger household_invitations_record_deletion on public.household_invitations;
drop index public.household_members_household_id_updated_at_idx;
drop index public.household_invitations_household_id_updated_at_idx;

comment on table public.household_members is
  'Small table: sync_pull sends it in full on every pull, so it has no tombstones and no delta index (spec 0031, D-05).';
comment on table public.household_invitations is
  'Small table: sync_pull sends it in full on every pull, so it has no tombstones and no delta index (spec 0031, D-05).';

-- ---------------------------------------------------------------------------------------------
-- D-06, D-09: indexes and the default store
-- ---------------------------------------------------------------------------------------------

drop index public.profiles_email_idx;
alter table public.households alter constraint households_default_store_fkey not deferrable;
create index meal_plan_entries_household_id_date_idx on public.meal_plan_entries (household_id, date);

-- ---------------------------------------------------------------------------------------------
-- D-12: begin_household_deletion
-- ---------------------------------------------------------------------------------------------

drop function public.household_media_names(uuid);
alter function private.household_media_names(uuid) rename to begin_household_deletion;

create function public.begin_household_deletion(household_id uuid)
returns setof text
language sql
set search_path = ''
as $$ select private.begin_household_deletion($1) $$;

revoke all on function public.begin_household_deletion(uuid) from public, anon;
grant execute on function public.begin_household_deletion(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- D-13: maps_url
-- ---------------------------------------------------------------------------------------------

alter table public.restaurants
  drop constraint restaurants_maps_url_valid,
  add constraint restaurants_maps_url_valid check (maps_url is null or private.is_web_url(maps_url));
alter table public.activities
  drop constraint activities_maps_url_valid,
  add constraint activities_maps_url_valid check (maps_url is null or private.is_web_url(maps_url));

-- ---------------------------------------------------------------------------------------------
-- D-13: packing_items.per_day_quantity
-- ---------------------------------------------------------------------------------------------

alter table public.packing_items rename column per_day to per_day_quantity;
alter table public.packing_items rename constraint packing_items_per_day_valid to packing_items_per_day_quantity_valid;
alter table public.packing_items
  rename constraint packing_items_per_day_quantity to packing_items_per_day_quantity_needs_quantity;

create or replace function private.packing_items_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_days integer;
begin
  if current_user = 'authenticated' then
    new.packed := false;
    new.packed_at := null;
    new.packed_by := null;
    new.pack_seq := 0;
  end if;
  if new.per_day_quantity is not null then
    select t.to_on - t.from_on + 1 into v_days
    from public.packing_list_bags b
    join public.trips t on t.household_id = b.household_id and t.id = b.trip_id
    where b.household_id = new.household_id and b.id = new.list_bag_id;
    if v_days is not null then
      -- In bigint: per_day_quantity × days overflows integer for absurdly long trips.
      new.quantity := least(new.per_day_quantity::bigint * v_days, 9999)::integer;
    end if;
  end if;
  return new;
end
$$;

create or replace function private.recalc_packing_quantities(p_household_id uuid, p_trip_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.packing_items i
  set quantity = least(i.per_day_quantity::bigint * (t.to_on - t.from_on + 1), 9999)::integer
  from public.packing_list_bags b
  join public.trips t on t.household_id = b.household_id and t.id = b.trip_id
  where b.household_id = p_household_id and b.trip_id = p_trip_id
    and i.household_id = b.household_id and i.list_bag_id = b.id
    and i.per_day_quantity is not null and not i.packed
    and i.quantity is distinct from least(i.per_day_quantity::bigint * (t.to_on - t.from_on + 1), 9999)::integer;
$$;

create or replace function private.packing_items_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_days integer;
begin
  if new.per_day_quantity is not null then
    select t.to_on - t.from_on + 1 into v_days
    from public.packing_list_bags b
    join public.trips t on t.household_id = b.household_id and t.id = b.trip_id
    where b.household_id = new.household_id and b.id = new.list_bag_id;
    if v_days is not null then
      new.quantity := least(new.per_day_quantity::bigint * v_days, 9999)::integer;
    end if;
  end if;
  return new;
end
$$;

-- p_change: {"list_bag_id": uuid, "insert": [{id, name, quantity, per_day_quantity, sort,
-- bag_item_id, from_bag}], "update": [{id, name, quantity, per_day_quantity}], "delete": [id]}.
create or replace function private.adopt_bag_changes(p_household_id uuid, p_change jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  c_insert_keys constant text[] := array['id', 'name', 'quantity', 'per_day_quantity', 'sort', 'bag_item_id',
                                         'from_bag'];
  c_update_keys constant text[] := array['id', 'name', 'quantity', 'per_day_quantity'];
  v_list_bag_id uuid;
  v_element jsonb;
  v_item public.packing_items;
  v_ids uuid[];
  v_inserted integer := 0;
  v_updated integer := 0;
  v_deleted integer := 0;
  v_count integer;
begin
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if jsonb_typeof(p_change) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_change) k where k <> all (array['list_bag_id', 'insert', 'update', 'delete']))
     or jsonb_typeof(p_change -> 'list_bag_id') is distinct from 'string'
     or jsonb_typeof(coalesce(p_change -> 'insert', '[]')) is distinct from 'array'
     or jsonb_typeof(coalesce(p_change -> 'update', '[]')) is distinct from 'array'
     or jsonb_typeof(coalesce(p_change -> 'delete', '[]')) is distinct from 'array' then
    raise exception 'invalid_change' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_change -> 'insert', '[]')) + jsonb_array_length(coalesce(p_change -> 'update', '[]'))
     + jsonb_array_length(coalesce(p_change -> 'delete', '[]')) > 200 then
    raise exception 'too_many_changes' using errcode = '22023';
  end if;
  begin
    v_list_bag_id := (p_change ->> 'list_bag_id')::uuid;
    v_ids := array(select x::uuid from jsonb_array_elements_text(coalesce(p_change -> 'delete', '[]')) x);
  exception when data_exception then
    raise exception 'invalid_change' using errcode = '22023';
  end;
  if not exists (select 1 from public.packing_list_bags b where b.household_id = p_household_id and b.id = v_list_bag_id) then
    raise exception 'invalid_change' using errcode = '22023';
  end if;

  for v_element in select e.value from jsonb_array_elements(coalesce(p_change -> 'insert', '[]')) e loop
    if jsonb_typeof(v_element) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(v_element) k where k <> all (c_insert_keys)) then
      raise exception 'invalid_change' using errcode = '22023';
    end if;
    begin
      v_item := jsonb_populate_record(null::public.packing_items, v_element);
    exception when data_exception then
      raise exception 'invalid_change' using errcode = '22023';
    end;
    if v_item.id is null or v_item.name is null then
      raise exception 'invalid_change' using errcode = '22023';
    end if;
    insert into public.packing_items (id, household_id, list_bag_id, name, quantity, per_day_quantity, sort,
                                      bag_item_id, from_bag)
    values (v_item.id, p_household_id, v_list_bag_id, v_item.name, v_item.quantity, v_item.per_day_quantity,
            coalesce(v_item.sort, 0), v_item.bag_item_id, coalesce(v_item.from_bag, true));
    v_inserted := v_inserted + 1;
  end loop;

  for v_element in select e.value from jsonb_array_elements(coalesce(p_change -> 'update', '[]')) e loop
    if jsonb_typeof(v_element) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(v_element) k where k <> all (c_update_keys))
       or not v_element ? 'id' or not v_element ? 'name' then
      raise exception 'invalid_change' using errcode = '22023';
    end if;
    begin
      v_item := jsonb_populate_record(null::public.packing_items, v_element);
    exception when data_exception then
      raise exception 'invalid_change' using errcode = '22023';
    end;
    update public.packing_items i
    set name = v_item.name, quantity = v_item.quantity, per_day_quantity = v_item.per_day_quantity
    where i.household_id = p_household_id and i.list_bag_id = v_list_bag_id and i.id = v_item.id
      and not i.packed;
    get diagnostics v_count = row_count;
    v_updated := v_updated + v_count;
  end loop;

  delete from public.packing_items i
  where i.household_id = p_household_id and i.list_bag_id = v_list_bag_id and i.id = any (v_ids)
    and not i.packed;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'deleted', v_deleted);
end
$$;

create or replace function private.restore_packing_items(p_household_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_keys constant text[] := array['id', 'list_bag_id', 'name', 'quantity', 'per_day_quantity', 'sort', 'packed',
                                  'packed_at', 'packed_by', 'pack_seq', 'bag_item_id', 'from_bag'];
  v_element jsonb;
  v_item public.packing_items;
  v_packed boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid_change' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'too_many_changes' using errcode = '22023';
  end if;

  for v_element in select e.value from jsonb_array_elements(p_items) e loop
    if jsonb_typeof(v_element) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(v_element) k where k <> all (c_keys)) then
      raise exception 'invalid_change' using errcode = '22023';
    end if;
    begin
      v_item := jsonb_populate_record(null::public.packing_items, v_element);
    exception when data_exception then
      raise exception 'invalid_change' using errcode = '22023';
    end;
    if v_item.id is null or v_item.list_bag_id is null or v_item.name is null then
      raise exception 'invalid_change' using errcode = '22023';
    end if;
    v_packed := coalesce(v_item.packed, false);

    insert into public.packing_items
      (id, household_id, list_bag_id, name, quantity, per_day_quantity, sort, packed, packed_at, packed_by, pack_seq,
       bag_item_id, from_bag)
    values (
      v_item.id, p_household_id, v_item.list_bag_id, v_item.name, v_item.quantity, v_item.per_day_quantity,
      coalesce(v_item.sort, 0), v_packed,
      case when v_packed then least(coalesce(v_item.packed_at, now()), now()) end,
      case when v_packed then v_item.packed_by end,
      least(greatest(coalesce(v_item.pack_seq, 0), 0), 999000), v_item.bag_item_id, coalesce(v_item.from_bag, false));
  end loop;

  return jsonb_build_object('restored', jsonb_array_length(p_items));
end
$$;

-- ---------------------------------------------------------------------------------------------
-- The minimum app version stays the latest published one (scripts/ci/migrations.mjs,
-- scripts/release/version.mjs); the new base of spec 0031, REQ-001 raises it. Grants stay.
-- ---------------------------------------------------------------------------------------------

create or replace function public.min_app_version()
returns text
language sql
stable
set search_path = ''
as $$
  select '2026.11.1'::text
$$;

-- ---------------------------------------------------------------------------------------------
-- apply_changes: per_day_quantity
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
  -- Feedback: status, reason and spec_ref are the developer's; RLS lets only the author patch
  -- (while new) or delete (spec 0027, REQ-006).
  -- Articles are deleted only by delete_article and merge_articles (spec 0007, E4).
  -- Recipes are deleted only by delete_recipe (spec 0008, E2). The kind of a recipe (recipe or
  -- collection) is set on insert and never patched (spec 0009, E2). A collection_recipes row keeps
  -- its collection and its recipe; only servings, variant and order change (spec 0009, E4).
  -- Chore events are booked and removed only by complete_chore / remove_chore_event (spec 0011);
  -- their day changes only by change_chore_event_day (spec 0026, REQ-007), their chore only by
  -- delete_chore / restore_chore (spec 0031, REQ-016); members patch "Erledigt von".
  -- „Erinnern“ is the chore column remind_at_due_time (spec 0027, REQ-009).
  -- The packed state of packing items (packed, packed_at, packed_by, pack_seq) is written only by
  -- set_packing_items_packed and restore_packing_items; a packing item's name, quantity, "je Tag"
  -- (per_day_quantity, spec 0031) and link to its Reisetasche are patched (spec 0022, REQ-009).
  -- A trip keeps its people in trip_members, which are only inserted and deleted; a bag of a
  -- packing list stays at its trip (spec 0022, Daten).
  -- Notification settings rows are created by the server and only patched, and RLS lets a member
  -- patch only her own row (spec 0013, Decision 3). households.timezone is never written (D16).
  -- A plan entry's time is starts_at (spec 0021); the reservation reminder is gone.
  -- Restaurants and activities are deleted only by delete_restaurant / delete_activity (spec 0024).
  -- "Nicht gemacht" is not_done on every kind (spec 0020, REQ-008).
  -- A trip may be a draft ("Entwurf", spec 0030, REQ-004): draft is set on insert and patched.
  -- The meal slots of a household are set by create_household and not written by members, and the
  -- bundled sample photo of a recipe (photo) is set only by the seed (spec 0031, REQ-014, REQ-026).
  c_allowlist constant jsonb := $json${
    "areas":            {"insert": ["id", "household_id", "name", "sort"],
                         "patch":  ["name", "sort"], "delete": true},
    "articles":         {"insert": ["id", "household_id", "name", "name_key", "synonyms", "synonym_keys",
                                    "area_id", "diet", "is_pantry", "default_shopping_rule", "needs_review"],
                         "patch":  ["name", "name_key", "synonyms", "synonym_keys", "area_id", "diet",
                                    "is_pantry", "default_shopping_rule", "needs_review"], "delete": false},
    "stores":           {"insert": ["id", "household_id", "name", "area_order", "hidden_area_ids"],
                         "patch":  ["name", "area_order", "hidden_area_ids"], "delete": true},
    "recipes":          {"insert": ["id", "household_id", "kind", "title", "photo_path", "description",
                                    "servings", "total_minutes", "course", "cuisine", "tags", "variants", "ingredients",
                                    "steps", "lead_time", "notes", "last_cooked_on", "cooked_count", "links"],
                         "patch":  ["title", "photo_path", "description", "servings", "total_minutes", "course",
                                    "cuisine", "tags", "variants", "ingredients", "steps", "lead_time", "notes",
                                    "last_cooked_on", "cooked_count", "links"], "delete": false},
    "collection_recipes": {"insert": ["id", "household_id", "collection_id", "recipe_id", "servings", "variant_id",
                                      "sort"],
                           "patch":  ["servings", "variant_id", "sort"], "delete": true},
    "restaurants":      {"insert": ["id", "household_id", "name", "address", "lat", "lng", "maps_url", "cuisine",
                                    "price_level", "tags", "notes", "website_url", "photo_path"],
                         "patch":  ["name", "address", "lat", "lng", "maps_url", "cuisine", "price_level", "tags",
                                    "notes", "website_url", "photo_path"], "delete": false},
    "activities":       {"insert": ["id", "household_id", "name", "name_key", "description", "photo_path", "place_name",
                                    "address", "lat", "lng", "maps_url", "website_url", "created_by"],
                         "patch":  ["name", "name_key", "description", "photo_path", "place_name", "address", "lat",
                                    "lng", "maps_url", "website_url"], "delete": false},
    "trips":            {"insert": ["id", "household_id", "from_on", "to_on", "note", "draft"],
                         "patch":  ["from_on", "to_on", "note", "draft"], "delete": true},
    "trip_members":     {"insert": ["id", "household_id", "trip_id", "member_id"],
                         "patch":  [], "delete": true},
    "packing_bags":     {"insert": ["id", "household_id", "name", "member_id", "sort"],
                         "patch":  ["name", "member_id", "sort"], "delete": true},
    "packing_bag_items": {"insert": ["id", "household_id", "bag_id", "name", "quantity", "per_day", "sort"],
                          "patch":  ["name", "quantity", "per_day", "sort"], "delete": true},
    "packing_list_bags": {"insert": ["id", "household_id", "trip_id", "bag_id", "name", "member_id", "sort"],
                          "patch":  ["bag_id", "sort"], "delete": true},
    "packing_items":    {"insert": ["id", "household_id", "list_bag_id", "name", "quantity", "per_day_quantity",
                                    "sort", "bag_item_id", "from_bag"],
                         "patch":  ["name", "quantity", "per_day_quantity", "bag_item_id", "from_bag"],
                         "delete": true},
    "feedback":         {"insert": ["id", "household_id", "kind", "text", "author_id", "screen"],
                         "patch":  ["kind", "text"], "delete": true},
    "chores":           {"insert": ["id", "household_id", "title", "room", "recurrence", "assignment", "effort",
                                    "next_due_on", "next_assignee_id", "last_done_on", "active_months", "due_time",
                                    "remind_at_due_time"],
                         "patch":  ["title", "room", "recurrence", "assignment", "effort", "next_due_on",
                                    "next_assignee_id", "last_done_on", "active_months", "due_time",
                                    "remind_at_due_time"], "delete": true},
    "chore_events":     {"insert": [],
                         "patch":  ["done_by"], "delete": false},
    "meal_plan_entries": {"insert": ["id", "household_id", "date", "slot_id", "kind", "recipe_id", "restaurant_id",
                                     "activity_id", "text", "note", "leftovers_of_entry_id", "eater_ids", "guests",
                                     "portions", "variants", "cook_id", "sort", "not_done", "starts_at",
                                     "reminder_day_offset", "reminder_at", "reminder_text"],
                          "patch":  ["date", "slot_id", "kind", "recipe_id", "restaurant_id", "activity_id", "text",
                                     "note", "leftovers_of_entry_id", "eater_ids", "guests", "portions", "variants",
                                     "cook_id", "sort", "not_done", "starts_at", "reminder_day_offset", "reminder_at",
                                     "reminder_text"],
                          "delete": true},
    "notification_settings": {"insert": [],
                              "patch":  ["daily_summary_enabled", "daily_summary_at", "daily_summary_parts",
                                         "activities_eve_enabled", "activities_eve_at", "chore_reminders_enabled",
                                         "entry_reminders_enabled"], "delete": false},
    "shopping_items":   {"insert": ["id", "household_id", "article_id"],
                         "patch":  ["article_id"], "delete": true},
    "shopping_contributions": {"insert": ["id", "household_id", "item_id", "source", "count", "qty", "unit", "note"],
                               "patch":  ["item_id", "source", "count", "qty", "unit", "note"], "delete": true},
    "households":       {"insert": [],
                         "patch":  ["name", "default_store_id"], "delete": false}
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
  -- every entry of add_contributions, every item of restore_packing_items and every element of
  -- adopt_bag_changes is an op (its deletes count as deletes). replace_entry_contributions counts
  -- as its entries and as one delete (spec 0021, REQ-007). The
  -- contributions of all entries are capped too.
  -- complete_chore counts as a delete: done of a one-off chore deletes it, which is known only
  -- once the chore is locked.
  select coalesce(sum(case when o ->> 'kind' = 'remove_contributions' and jsonb_typeof(o -> 'ids') = 'array'
                             then greatest(jsonb_array_length(o -> 'ids'), 1)
                           when o ->> 'kind' in ('add_contributions', 'replace_entry_contributions')
                                and jsonb_typeof(o -> 'entries') = 'array'
                             then greatest(jsonb_array_length(o -> 'entries'), 1)
                           when o ->> 'kind' = 'restore_packing_items' and jsonb_typeof(o -> 'items') = 'array'
                             then greatest(jsonb_array_length(o -> 'items'), 1)
                           when o ->> 'kind' = 'adopt_bag_changes' and jsonb_typeof(o -> 'change') = 'object'
                             then greatest(coalesce(jsonb_array_length(case when jsonb_typeof(o -> 'change' -> 'insert') = 'array' then o -> 'change' -> 'insert' end), 0)
                                           + coalesce(jsonb_array_length(case when jsonb_typeof(o -> 'change' -> 'update') = 'array' then o -> 'change' -> 'update' end), 0)
                                           + coalesce(jsonb_array_length(case when jsonb_typeof(o -> 'change' -> 'delete') = 'array' then o -> 'change' -> 'delete' end), 0), 1)
                           else 1 end), 0),
         count(*) filter (where o ->> 'kind' in ('delete', 'complete_chore', 'remove_chore_event',
                                                 'replace_entry_contributions'))
           + coalesce(sum(jsonb_array_length(o -> 'ids'))
                        filter (where o ->> 'kind' = 'remove_contributions' and jsonb_typeof(o -> 'ids') = 'array'), 0)
           + coalesce(sum(jsonb_array_length(o -> 'change' -> 'delete'))
                        filter (where o ->> 'kind' = 'adopt_bag_changes' and jsonb_typeof(o -> 'change') = 'object'
                                  and jsonb_typeof(o -> 'change' -> 'delete') = 'array'), 0),
         coalesce(sum(c.contributions), 0)
  into v_op_count, v_delete_count, v_contribution_count
  from jsonb_array_elements(p_ops) o
  cross join lateral (
    select count(*) as contributions
    from jsonb_array_elements(case when o ->> 'kind' in ('add_contributions', 'replace_entry_contributions')
                                        and jsonb_typeof(o -> 'entries') = 'array'
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

    -- Domain ops: the same internal functions as the store/list RPCs; add_contributions puts the
    -- entries on the shopping list of p_household_id.
    if v_kind = 'add_contributions' then
      v_results := v_results || jsonb_build_array(private.add_shopping_contributions(p_household_id, v_op -> 'entries'));
      continue;
    elsif v_kind = 'change_chore_event_day' then
      v_results := v_results || jsonb_build_array(private.change_chore_event_day(p_household_id, v_op -> 'change'));
      continue;
    elsif v_kind = 'replace_entry_contributions' then
      v_results := v_results || jsonb_build_array(
        private.replace_entry_contributions(p_household_id, v_op -> 'entry_ids', v_op -> 'entries'));
      continue;
    elsif v_kind = 'remove_contributions' then
      if jsonb_typeof(v_op -> 'ids') is distinct from 'array' then
        raise exception 'invalid_change' using errcode = '22023';
      end if;
      v_ids := array(select x::uuid from jsonb_array_elements_text(v_op -> 'ids') x);
      v_results := v_results || jsonb_build_array(private.remove_contributions(v_ids, p_household_id));
      continue;
    elsif v_kind = 'complete_chore' then
      v_results := v_results || jsonb_build_array(private.complete_chore(p_household_id, v_op -> 'completion'));
      continue;
    elsif v_kind = 'remove_chore_event' then
      if jsonb_typeof(v_op -> 'id') is distinct from 'string' then
        raise exception 'invalid_change' using errcode = '22023';
      end if;
      v_results := v_results || jsonb_build_array(private.remove_chore_event(p_household_id, (v_op ->> 'id')::uuid));
      continue;
    elsif v_kind = 'restore_packing_items' then
      v_results := v_results || jsonb_build_array(private.restore_packing_items(p_household_id, v_op -> 'items'));
      continue;
    elsif v_kind = 'adopt_bag_changes' then
      v_results := v_results || jsonb_build_array(private.adopt_bag_changes(p_household_id, v_op -> 'change'));
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
