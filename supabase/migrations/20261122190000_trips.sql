-- contract: absences entfällt, Reisen ersetzen Abwesenheiten (Spec 0022); min_app_version: 2026.11.1
-- Spec 0022 (REQ-014, REQ-015) — "Reise" is the one term: trips + trip_members replace absences.
-- Clean target before v1 (review wave 2): no expand/contract, absences is dropped here.
--
-- * trips: one row per Reise (period and note); one stripe, one packing list.
-- * trip_members: one row per person of a trip. Composite foreign keys keep trip and person in
--   the household of the row. Only inserted and deleted (no update grant). "Ganzer Haushalt" is
--   derived (every member is on it), so somebody joining later is not on older trips (AC-045).
-- * A trip has at least one person: a deferred check refuses a trip that ends a transaction
--   without one (AC-043). When the last person leaves the household, the trip goes with its
--   packing list (AC-044); removing the last person of a trip otherwise is refused.
-- * packing_list_bags.absence_id becomes trip_id and is no longer patched: the packing list stays
--   with its trip, whoever is on it (decision 1). The "je Tag" quantities follow the trip's period.
-- * private.is_silent, apply_changes and sync_pull read the new tables.
-- * Existing absences become trips under the same id (a whole-household absence gets every
--   current member), so their packing lists stay attached.

-- ---------------------------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------------------------

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_on date not null,
  to_on date not null,
  note text
    constraint trips_note_length check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_household_id_id_key unique (household_id, id),
  constraint trips_range_valid check (to_on >= from_on)
);

create index trips_household_id_updated_at_idx on public.trips (household_id, updated_at);

grant select, delete on public.trips to authenticated;
grant insert (id, household_id, from_on, to_on, note) on public.trips to authenticated;
grant update (from_on, to_on, note) on public.trips to authenticated;

-- ---------------------------------------------------------------------------------------------
-- trip_members
-- ---------------------------------------------------------------------------------------------

create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null,
  member_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_members_household_id_id_key unique (household_id, id),
  constraint trip_members_household_id_trip_id_member_id_key unique (household_id, trip_id, member_id),
  constraint trip_members_trip_fkey foreign key (household_id, trip_id)
    references public.trips (household_id, id) on delete cascade,
  constraint trip_members_member_fkey foreign key (household_id, member_id)
    references public.household_members (household_id, profile_id) on delete cascade
);

create index trip_members_household_id_updated_at_idx on public.trip_members (household_id, updated_at);
create index trip_members_household_id_member_id_idx on public.trip_members (household_id, member_id);

grant select, delete on public.trip_members to authenticated;
grant insert (id, household_id, trip_id, member_id) on public.trip_members to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Absences become trips (same ids), packing lists move along
-- ---------------------------------------------------------------------------------------------

insert into public.trips (id, household_id, from_on, to_on, note, created_at)
select a.id, a.household_id, a.from_on, a.to_on, a.note, a.created_at from public.absences a;

insert into public.trip_members (household_id, trip_id, member_id)
select a.household_id, a.id, coalesce(a.member_id, m.profile_id)
from public.absences a
join public.household_members m on m.household_id = a.household_id
  and (a.member_id is null or m.profile_id = a.member_id)
group by 1, 2, 3;

-- An absence without anybody left cannot become a trip.
delete from public.trips t
where not exists (select 1 from public.trip_members m where m.household_id = t.household_id and m.trip_id = t.id);

drop trigger packing_list_bags_recalc on public.packing_list_bags;
drop function private.packing_list_bags_recalc();

alter table public.packing_list_bags add column trip_id uuid;
update public.packing_list_bags set trip_id = absence_id;
delete from public.packing_list_bags b
where not exists (select 1 from public.trips t where t.household_id = b.household_id and t.id = b.trip_id);
alter table public.packing_list_bags
  alter column trip_id set not null,
  drop column absence_id,
  add constraint packing_list_bags_trip_fkey foreign key (household_id, trip_id)
    references public.trips (household_id, id) on delete cascade;

create unique index packing_list_bags_household_id_trip_id_bag_id_idx
  on public.packing_list_bags (household_id, trip_id, bag_id) where bag_id is not null;
create index packing_list_bags_household_id_trip_id_idx on public.packing_list_bags (household_id, trip_id);

-- Dropping absence_id dropped its grants; trip_id is set on insert only.
grant insert (trip_id) on public.packing_list_bags to authenticated;

drop trigger absences_recalc_packing on public.absences;
drop function private.absences_recalc_packing();
drop function private.recalc_packing_quantities(uuid, uuid);
drop table public.absences;

-- Contract (scripts/ci/migrations.mjs): the minimum app version stays the latest published one;
-- it may not exceed it (scripts/release/version.mjs). Grants of the function stay.
create or replace function public.min_app_version()
returns text
language sql
stable
set search_path = ''
as $$
  select '2026.11.1'::text
$$;

select private.attach_household_policies('public.trips');
select private.attach_sync_triggers('public.trips');
select private.attach_household_policies('public.trip_members');
select private.attach_sync_triggers('public.trip_members');

-- ---------------------------------------------------------------------------------------------
-- At least one person (AC-043), the last one leaving the household (AC-044)
-- ---------------------------------------------------------------------------------------------

-- Deferred to the end of the transaction, so one apply_changes call inserts the trip and then
-- its people. A trip deleted in the same transaction is fine.
create function private.trips_need_member()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.trips t where t.household_id = new.household_id and t.id = new.id)
     and not exists (select 1 from public.trip_members m
                     where m.household_id = new.household_id and m.trip_id = new.id) then
    raise exception 'trip_without_members' using errcode = '23514';
  end if;
  return null;
end
$$;

create constraint trigger trips_need_member after insert on public.trips
  deferrable initially deferred
  for each row execute function private.trips_need_member();

-- After the last person of a trip is gone: when she left the household, the trip goes with its
-- packing list (cascades, tombstones); otherwise the change is refused. Security definer: the
-- person who removed herself is no member any more when this runs at the end of the transaction.
create function private.trip_members_last_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.trips t where t.household_id = old.household_id and t.id = old.trip_id)
     or exists (select 1 from public.trip_members m
                where m.household_id = old.household_id and m.trip_id = old.trip_id) then
    return null;
  end if;
  if exists (select 1 from public.household_members hm
             where hm.household_id = old.household_id and hm.profile_id = old.member_id) then
    raise exception 'trip_without_members' using errcode = '23514';
  end if;
  delete from public.trips t where t.household_id = old.household_id and t.id = old.trip_id;
  return null;
end
$$;

revoke execute on function private.trip_members_last_gone() from public, anon, authenticated;

create constraint trigger trip_members_last_gone after delete on public.trip_members
  deferrable initially deferred
  for each row execute function private.trip_members_last_gone();

-- ---------------------------------------------------------------------------------------------
-- "Je Tag" from the trip
-- ---------------------------------------------------------------------------------------------

-- As before (packing migration), with the trip of the bag instead of the absence.
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
  if new.per_day is not null then
    select t.to_on - t.from_on + 1 into v_days
    from public.packing_list_bags b
    join public.trips t on t.household_id = b.household_id and t.id = b.trip_id
    where b.household_id = new.household_id and b.id = new.list_bag_id;
    if v_days is not null then
      -- In bigint: per_day × days overflows integer for absurdly long trips.
      new.quantity := least(new.per_day::bigint * v_days, 9999)::integer;
    end if;
  end if;
  return new;
end
$$;

-- Recalculates the open "je Tag" packing items of one trip from its current period; packed items
-- keep their quantity. Only rows whose quantity changes are written. Called only from the trigger
-- below, after an update RLS has already allowed. Not granted to the API roles.
create function private.recalc_packing_quantities(p_household_id uuid, p_trip_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.packing_items i
  set quantity = least(i.per_day::bigint * (t.to_on - t.from_on + 1), 9999)::integer
  from public.packing_list_bags b
  join public.trips t on t.household_id = b.household_id and t.id = b.trip_id
  where b.household_id = p_household_id and b.trip_id = p_trip_id
    and i.household_id = b.household_id and i.list_bag_id = b.id
    and i.per_day is not null and not i.packed
    and i.quantity is distinct from least(i.per_day::bigint * (t.to_on - t.from_on + 1), 9999)::integer;
$$;

revoke execute on function private.recalc_packing_quantities(uuid, uuid) from public, anon, authenticated;

-- After from_on or to_on of a trip changed (AC-011). Security definer: members have no update
-- grant on the quantity of packing items.
create function private.trips_recalc_packing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recalc_packing_quantities(new.household_id, new.id);
  return null;
end
$$;

revoke execute on function private.trips_recalc_packing() from public, anon, authenticated;

create trigger trips_recalc_packing after update of from_on, to_on on public.trips
  for each row when (old.from_on is distinct from new.from_on or old.to_on is distinct from new.to_on)
  execute function private.trips_recalc_packing();

-- ---------------------------------------------------------------------------------------------
-- Quiet notifications read trip_members (AC-045)
-- ---------------------------------------------------------------------------------------------

-- The person is on a trip that day. Members who joined later are not on older trips.
create or replace function private.is_silent(p_household_id uuid, p_profile_id uuid, p_day date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members m
    join public.trips t on t.household_id = m.household_id and t.id = m.trip_id
    where m.household_id = p_household_id
      and m.member_id = p_profile_id
      and p_day between t.from_on and t.to_on
  )
$$;

-- ---------------------------------------------------------------------------------------------
-- apply_changes: trips and trip_members in the allowlist; packing_list_bags.trip_id not patched
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
  -- Chore events are booked and removed only by complete_chore / remove_chore_event (spec 0011).
  -- The packed state of packing items (packed, packed_at, packed_by, pack_seq) is written only by
  -- set_packing_items_packed and restore_packing_items; packing items are never patched (spec 0012).
  -- A trip keeps its people in trip_members, which are only inserted and deleted; a bag of a
  -- packing list stays at its trip (spec 0022, Daten).
  -- Notification settings rows are created by the server and only patched, and RLS lets a member
  -- patch only her own row (spec 0013, Decision 3). households.timezone is never written (D16).
  c_allowlist constant jsonb := $json${
    "areas":            {"insert": ["id", "household_id", "name", "sort"],
                         "patch":  ["name", "sort"], "delete": true},
    "articles":         {"insert": ["id", "household_id", "name", "name_key", "synonyms", "synonym_keys",
                                    "area_id", "diet", "is_pantry", "default_shopping_rule", "needs_review"],
                         "patch":  ["name", "name_key", "synonyms", "synonym_keys", "area_id", "diet",
                                    "is_pantry", "default_shopping_rule", "needs_review"], "delete": false},
    "stores":           {"insert": ["id", "household_id", "name", "area_order", "hidden_area_ids"],
                         "patch":  ["name", "area_order", "hidden_area_ids"], "delete": true},
    "recipes":          {"insert": ["id", "household_id", "kind", "title", "photo", "photo_path", "description",
                                    "servings", "total_minutes", "course", "cuisine", "tags", "variants", "ingredients",
                                    "steps", "lead_time", "notes", "last_cooked_on", "cooked_count", "source"],
                         "patch":  ["title", "photo", "photo_path", "description", "servings", "total_minutes", "course",
                                    "cuisine", "tags", "variants", "ingredients", "steps", "lead_time", "notes",
                                    "last_cooked_on", "cooked_count", "source"], "delete": false},
    "collection_recipes": {"insert": ["id", "household_id", "collection_id", "recipe_id", "servings", "variant_id",
                                      "sort"],
                           "patch":  ["servings", "variant_id", "sort"], "delete": true},
    "restaurants":      {"insert": ["id", "household_id", "name", "address", "lat", "lng", "maps_url", "cuisine",
                                    "price_level", "tags", "notes"],
                         "patch":  ["name", "address", "lat", "lng", "maps_url", "cuisine", "price_level", "tags",
                                    "notes"], "delete": true},
    "activities":       {"insert": ["id", "household_id", "name", "name_key", "description", "photo_path", "place_name",
                                    "address", "lat", "lng", "maps_url", "tags", "created_by"],
                         "patch":  ["name", "name_key", "description", "photo_path", "place_name", "address", "lat",
                                    "lng", "maps_url", "tags"], "delete": true},
    "trips":            {"insert": ["id", "household_id", "from_on", "to_on", "note"],
                         "patch":  ["from_on", "to_on", "note"], "delete": true},
    "trip_members":     {"insert": ["id", "household_id", "trip_id", "member_id"],
                         "patch":  [], "delete": true},
    "packing_bags":     {"insert": ["id", "household_id", "name", "member_id", "sort"],
                         "patch":  ["name", "member_id", "sort"], "delete": true},
    "packing_bag_items": {"insert": ["id", "household_id", "bag_id", "name", "quantity", "per_day", "sort"],
                          "patch":  ["name", "quantity", "per_day", "sort"], "delete": true},
    "packing_list_bags": {"insert": ["id", "household_id", "trip_id", "bag_id", "name", "member_id", "sort"],
                          "patch":  ["bag_id", "sort"], "delete": true},
    "packing_items":    {"insert": ["id", "household_id", "list_bag_id", "name", "quantity", "per_day", "sort"],
                         "patch":  [], "delete": true},
    "feedback":         {"insert": ["id", "household_id", "kind", "text", "author_id", "screen"],
                         "patch":  ["kind", "text"], "delete": true},
    "chores":           {"insert": ["id", "household_id", "title", "room", "recurrence", "assignment", "effort",
                                    "next_due_on", "next_assignee_id", "last_done_on", "active_months", "due_time"],
                         "patch":  ["title", "room", "recurrence", "assignment", "effort", "next_due_on",
                                    "next_assignee_id", "last_done_on", "active_months", "due_time"], "delete": true},
    "chore_events":     {"insert": [],
                         "patch":  ["chore_id", "done_by"], "delete": false},
    "meal_plan_entries": {"insert": ["id", "household_id", "date", "slot_id", "kind", "recipe_id", "restaurant_id",
                                     "activity_id", "text", "note", "leftovers_of_entry_id", "eater_ids", "guests",
                                     "portions", "variants", "cook_id", "sort", "not_cooked", "reserved_at",
                                     "remind_minutes_before", "reminder_day_offset", "reminder_at", "reminder_text"],
                          "patch":  ["date", "slot_id", "kind", "recipe_id", "restaurant_id", "activity_id", "text",
                                     "note", "leftovers_of_entry_id", "eater_ids", "guests", "portions", "variants",
                                     "cook_id", "sort", "not_cooked", "reserved_at", "remind_minutes_before",
                                     "reminder_day_offset", "reminder_at", "reminder_text"],
                          "delete": true},
    "notification_settings": {"insert": [],
                              "patch":  ["daily_summary_enabled", "daily_summary_at", "daily_summary_parts",
                                         "activities_eve_enabled", "activities_eve_at", "chore_reminders_enabled",
                                         "reservation_reminders_enabled", "entry_reminders_enabled"], "delete": false},
    "shopping_items":   {"insert": ["id", "household_id", "article_id"],
                         "patch":  ["article_id"], "delete": true},
    "shopping_contributions": {"insert": ["id", "household_id", "item_id", "source", "count", "qty", "unit", "note"],
                               "patch":  ["item_id", "source", "count", "qty", "unit", "note"], "delete": true},
    "households":       {"insert": [],
                         "patch":  ["name", "meal_slots", "default_store_id"], "delete": false}
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
  -- every entry of add_contributions and every item of restore_packing_items is an op. The
  -- contributions of all entries are capped too.
  -- complete_chore counts as a delete: done of a one-off chore deletes it, which is known only
  -- once the chore is locked.
  select coalesce(sum(case when o ->> 'kind' = 'remove_contributions' and jsonb_typeof(o -> 'ids') = 'array'
                             then greatest(jsonb_array_length(o -> 'ids'), 1)
                           when o ->> 'kind' = 'add_contributions' and jsonb_typeof(o -> 'entries') = 'array'
                             then greatest(jsonb_array_length(o -> 'entries'), 1)
                           when o ->> 'kind' = 'restore_packing_items' and jsonb_typeof(o -> 'items') = 'array'
                             then greatest(jsonb_array_length(o -> 'items'), 1)
                           else 1 end), 0),
         count(*) filter (where o ->> 'kind' in ('delete', 'complete_chore', 'remove_chore_event'))
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

    -- Domain ops: the same internal functions as the store/list RPCs; add_contributions puts the
    -- entries on the shopping list of p_household_id.
    if v_kind = 'add_contributions' then
      v_results := v_results || jsonb_build_array(private.add_shopping_contributions(p_household_id, v_op -> 'entries'));
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

-- ---------------------------------------------------------------------------------------------
-- sync_pull: trips and trip_members instead of absences
-- ---------------------------------------------------------------------------------------------

create or replace function public.sync_pull(p_request jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  -- The synced household tables (db-handoff T6, spec 0004; packing tables spec 0012; collection_recipes
  -- spec 0009; notification_settings spec 0013, where RLS returns only the caller's own row; trips and
  -- trip_members spec 0022).
  -- Small tables are listed separately below.
  c_tables constant text[] := array[
    'areas', 'articles', 'stores',
    'recipes', 'recipe_favorites', 'recipe_ratings', 'collection_recipes',
    'restaurants', 'restaurant_favorites', 'restaurant_ratings',
    'activities', 'activity_favorites', 'activity_ratings',
    'trips', 'trip_members', 'feedback', 'feedback_votes',
    'packing_bags', 'packing_bag_items', 'packing_list_bags', 'packing_items',
    'chores', 'chore_events', 'meal_plan_entries', 'notification_settings',
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
