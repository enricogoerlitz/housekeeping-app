-- Spec 0041 — activities: kinds with a symbol, a rhythm, "Merken" (critical path: new synced
-- tables, migration, sync). Additive only: three new tables, three new columns with defaults, new
-- definitions of functions.
--
-- * activity_kinds ("Aktivitätsart", REQ-001): name and symbol per household. Every household gets
--   the eight default kinds: existing ones here, new ones by the trigger on households (covers
--   create_household, the seed, prod-bootstrap and the reset of spec 0028). Deleting a kind keeps
--   its activities without a kind (on delete set null), AC-003.
-- * activities.kind_id, activities.icon ("eigenes Symbol", REQ-002), activities.remembered
--   ("Merken", REQ-004; every existing activity is remembered).
-- * Symbols come from a fixed list (Entscheidung 5): private.is_activity_icon, the same names as
--   ACTIVITY_ICONS in packages/core/src/activity-kinds.ts.
-- * activity_series ("Serie", REQ-003): the rule (jsonb, private.is_series_rule, the same shape as
--   SeriesRule in packages/core/src/activity-series.ts), start, end ("bis" or null = "dauerhaft"),
--   Tageszeit, Uhrzeit, Zusatz and people (members and guests, REQ-005). Occurrences are computed
--   on the device for the visible range; nothing is written ahead (Entscheidung 3).
-- * activity_series_exceptions: one occurrence "abgesagt" (moved_to null) or "verschoben" (to
--   moved_to, optionally another Tageszeit and Uhrzeit). "Serie bearbeiten" ends the series
--   yesterday and starts a new one today in one apply_changes call; future exceptions move to
--   the new series (series_id is patched).
-- * apply_changes, sync_pull: the new tables. delete_activity / restore_activity keep the series
--   and their exceptions in the snapshot, so "Rückgängig" brings them back, and restore the new
--   columns.

-- ---------------------------------------------------------------------------------------------
-- Validation shared by check constraints (granted: the checks run as the caller)
-- ---------------------------------------------------------------------------------------------

create function private.is_activity_icon(p_icon text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_icon = any (array[
    'mountain', 'cake', 'gift', 'party-popper', 'dumbbell', 'bike', 'footprints', 'volleyball', 'trophy',
    'waves', 'sailboat', 'snowflake', 'tent', 'trees', 'flower-2', 'sun', 'map', 'map-pin', 'plane',
    'train-front', 'car', 'luggage', 'drama', 'music', 'film', 'landmark', 'palette', 'book-open', 'camera',
    'ticket', 'utensils', 'coffee', 'wine', 'ice-cream-cone', 'users', 'heart', 'dog', 'gamepad-2', 'bath',
    'sparkles'])
$$;

-- {"type": "weekly", "every": 1–52, "weekdays": [1–7, each once]} | {"type": "monthly", "day": 1–31}
-- | {"type": "yearly"} (on the day and month of the start), with no other keys.
create function private.is_series_rule(p_rule jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_keys text[];
begin
  if jsonb_typeof(p_rule) is distinct from 'object' then
    return false;
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_rule) k;
  case p_rule ->> 'type'
    when 'weekly' then
      return v_keys = array['every', 'type', 'weekdays']
        and jsonb_typeof(p_rule -> 'every') = 'number' and (p_rule ->> 'every') ~ '^[0-9]{1,2}$'
        and (p_rule ->> 'every')::integer between 1 and 52
        and jsonb_typeof(p_rule -> 'weekdays') = 'array'
        and jsonb_array_length(p_rule -> 'weekdays') between 1 and 7
        and not exists (select 1 from jsonb_array_elements(p_rule -> 'weekdays') w
                        where jsonb_typeof(w) <> 'number' or w::text !~ '^[1-7]$')
        and (select count(distinct w::text) from jsonb_array_elements(p_rule -> 'weekdays') w)
            = jsonb_array_length(p_rule -> 'weekdays');
    when 'monthly' then
      return v_keys = array['day', 'type']
        and jsonb_typeof(p_rule -> 'day') = 'number' and (p_rule ->> 'day') ~ '^[0-9]{1,2}$'
        and (p_rule ->> 'day')::integer between 1 and 31;
    when 'yearly' then
      return v_keys = array['type'];
    else
      return false;
  end case;
end
$$;

grant execute on function private.is_activity_icon(text) to authenticated;
grant execute on function private.is_series_rule(jsonb) to authenticated;

-- A slot_id must be one of the household's meal slots (like meal_plan_entries_check_refs).
-- Security invoker: reads the household under the caller's RLS.
create function private.assert_meal_slot(p_household_id uuid, p_slot_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.households h, jsonb_array_elements(h.meal_slots) s
    where h.id = p_household_id and (s ->> 'id')::uuid = p_slot_id
  ) then
    raise exception 'invalid_slot' using errcode = '23503';
  end if;
end
$$;

grant execute on function private.assert_meal_slot(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- activity_kinds
-- ---------------------------------------------------------------------------------------------

-- name_key is computed by the client with core normalizeText (duplicate check, like activities).
create table public.activity_kinds (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null
    constraint activity_kinds_name_valid check (btrim(name) <> '' and char_length(name) <= 40 and name !~ '[[:cntrl:]]'),
  name_key text not null
    constraint activity_kinds_name_key_valid check (name_key <> '' and char_length(name_key) <= 80),
  icon text not null
    constraint activity_kinds_icon_valid check (private.is_activity_icon(icon)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_kinds_household_id_id_key unique (household_id, id),
  constraint activity_kinds_household_id_name_key_key unique (household_id, name_key)
);

create index activity_kinds_household_id_updated_at_idx on public.activity_kinds (household_id, updated_at);

grant select, delete on public.activity_kinds to authenticated;
grant insert (id, household_id, name, name_key, icon) on public.activity_kinds to authenticated;
grant update (name, name_key, icon) on public.activity_kinds to authenticated;
select private.attach_household_policies('public.activity_kinds');
select private.attach_sync_triggers('public.activity_kinds');

-- The default kinds of a household (REQ-001). Runs as the inserting role: create_household and
-- the seed run as postgres.
create function private.seed_activity_kinds(p_household_id uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.activity_kinds (household_id, name, name_key, icon)
  select p_household_id, k.name, k.name_key, k.icon
  from (values ('Geburtstag', 'geburtstag', 'cake'),
               ('Sport', 'sport', 'dumbbell'),
               ('Ausflug', 'ausflug', 'map'),
               ('Kultur', 'kultur', 'drama'),
               ('Essen gehen', 'essen gehen', 'utensils'),
               ('Treffen', 'treffen', 'users'),
               ('Reise', 'reise', 'plane'),
               ('Sonstiges', 'sonstiges', 'sparkles')) k (name, name_key, icon)
  on conflict (household_id, name_key) do nothing;
$$;

create function private.households_seed_activity_kinds()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.seed_activity_kinds(new.id);
  return null;
end
$$;

create trigger households_seed_activity_kinds after insert on public.households
  for each row execute function private.households_seed_activity_kinds();

select private.seed_activity_kinds(h.id) from public.households h;

-- ---------------------------------------------------------------------------------------------
-- activities: kind, own symbol, "Merken"
-- ---------------------------------------------------------------------------------------------

alter table public.activities
  add column kind_id uuid,
  add column icon text
    constraint activities_icon_valid check (icon is null or private.is_activity_icon(icon)),
  add column remembered boolean not null default true,
  add constraint activities_kind_fkey foreign key (household_id, kind_id)
    references public.activity_kinds (household_id, id) on delete set null (kind_id);

create index activities_household_id_kind_id_idx on public.activities (household_id, kind_id);

grant insert (kind_id, icon, remembered), update (kind_id, icon, remembered) on public.activities to authenticated;

-- ---------------------------------------------------------------------------------------------
-- activity_series
-- ---------------------------------------------------------------------------------------------

create table public.activity_series (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  activity_id uuid not null,
  rule jsonb not null
    constraint activity_series_rule_valid check (private.is_series_rule(rule)),
  starts_on date not null
    constraint activity_series_starts_on_valid check (starts_on between date '1900-01-01' and date '2999-12-31'),
  ends_on date
    constraint activity_series_ends_on_valid check (ends_on <= date '2999-12-31'),
  slot_id uuid not null,
  starts_at time
    constraint activity_series_starts_at_five_minutes check (private.is_five_minute_time(starts_at)),
  note text
    constraint activity_series_note_length check (char_length(note) <= 120),
    constraint activity_series_note_no_control check (note !~ '[[:cntrl:]]'),
  eater_ids uuid[] not null default '{}'
    constraint activity_series_eater_ids_size check (cardinality(eater_ids) <= 50),
  guests integer not null default 0
    constraint activity_series_guests_valid check (guests between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_series_household_id_id_key unique (household_id, id),
  constraint activity_series_period_valid check (ends_on is null or ends_on >= starts_on),
  constraint activity_series_activity_fkey foreign key (household_id, activity_id)
    references public.activities (household_id, id) on delete cascade
);

create index activity_series_household_id_updated_at_idx on public.activity_series (household_id, updated_at);
create index activity_series_household_id_activity_id_idx on public.activity_series (household_id, activity_id);

-- Before insert or update: the slot must be the household's; people newly added must be members
-- (unchanged values are not re-checked, like meal_plan_entries_check_refs).
create function private.activity_series_check_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.slot_id is distinct from old.slot_id then
    perform private.assert_meal_slot(new.household_id, new.slot_id);
  end if;
  perform private.assert_members(
    new.household_id,
    array(
      select unnest(new.eater_ids)
      except
      select unnest(case when tg_op = 'UPDATE' then old.eater_ids else '{}'::uuid[] end)
    )
  );
  return new;
end
$$;

create trigger activity_series_check_refs before insert or update of slot_id, eater_ids
  on public.activity_series
  for each row execute function private.activity_series_check_refs();

grant select, delete on public.activity_series to authenticated;
grant insert (id, household_id, activity_id, rule, starts_on, ends_on, slot_id, starts_at, note, eater_ids, guests)
  on public.activity_series to authenticated;
grant update (rule, starts_on, ends_on, slot_id, starts_at, note, eater_ids, guests)
  on public.activity_series to authenticated;
select private.attach_household_policies('public.activity_series');
select private.attach_sync_triggers('public.activity_series');

-- ---------------------------------------------------------------------------------------------
-- activity_series_exceptions
-- ---------------------------------------------------------------------------------------------

-- on_date is the occurrence as the rule gives it; moved_to null = "abgesagt". A moved occurrence
-- may get another Tageszeit (slot_id) and Uhrzeit (starts_at); null keeps the series' value.
create table public.activity_series_exceptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  series_id uuid not null,
  on_date date not null,
  moved_to date
    constraint activity_series_exceptions_moved_to_valid check (moved_to between date '1900-01-01' and date '2999-12-31'),
  slot_id uuid,
  starts_at time
    constraint activity_series_exceptions_starts_at_five_minutes check (private.is_five_minute_time(starts_at)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_series_exceptions_household_id_id_key unique (household_id, id),
  constraint activity_series_exceptions_one_per_occurrence unique (household_id, series_id, on_date),
  constraint activity_series_exceptions_cancel_plain check (moved_to is not null or (slot_id is null and starts_at is null)),
  constraint activity_series_exceptions_series_fkey foreign key (household_id, series_id)
    references public.activity_series (household_id, id) on delete cascade
);

create index activity_series_exceptions_household_id_updated_at_idx
  on public.activity_series_exceptions (household_id, updated_at);

create function private.activity_series_exceptions_check_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slot_id is not null and (tg_op = 'INSERT' or new.slot_id is distinct from old.slot_id) then
    perform private.assert_meal_slot(new.household_id, new.slot_id);
  end if;
  return new;
end
$$;

create trigger activity_series_exceptions_check_refs before insert or update of slot_id
  on public.activity_series_exceptions
  for each row execute function private.activity_series_exceptions_check_refs();

grant select, delete on public.activity_series_exceptions to authenticated;
grant insert (id, household_id, series_id, on_date, moved_to, slot_id, starts_at)
  on public.activity_series_exceptions to authenticated;
grant update (series_id, moved_to, slot_id, starts_at) on public.activity_series_exceptions to authenticated;
select private.attach_household_policies('public.activity_series_exceptions');
select private.attach_sync_triggers('public.activity_series_exceptions');

-- ---------------------------------------------------------------------------------------------
-- delete_activity / restore_activity: with the series (otherwise unchanged)
-- ---------------------------------------------------------------------------------------------

-- From 20261122212500_restaurants_and_activities; the snapshot also holds the activity's series
-- and their exceptions, which go with the activity by cascade (with tombstones).
create or replace function private.delete_activity(p_activity_id uuid, p_today date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := private.my_activity_household_id(p_activity_id);
  v_activity public.activities;
  v_converted jsonb;
  v_removed jsonb;
begin
  perform private.check_today(p_today);

  select a.* into v_activity
  from public.activities a
  where a.household_id = v_household_id and a.id = p_activity_id
  for update;
  if not found then
    raise exception 'activity_not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.meal_plan_entries e
  where e.household_id = v_household_id and e.activity_id = p_activity_id
  for update;

  delete from private.deletions d
  where d.household_id = v_household_id and d.deleted_at <= now() - interval '1 hour';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'kind', e.kind, 'restaurant_id', e.restaurant_id, 'activity_id', e.activity_id,
           'text', e.text, 'note', e.note, 'starts_at', e.starts_at,
           'new_text', v_activity.name || coalesce(' (' || nullif(e.note, '') || ')', ''))
           order by e.id), '[]')
  into v_converted
  from public.meal_plan_entries e
  where e.household_id = v_household_id and e.activity_id = p_activity_id and e.date <= p_today;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]')
  into v_removed
  from public.meal_plan_entries e
  where e.household_id = v_household_id and e.activity_id = p_activity_id
    and (e.date is null or e.date > p_today);

  insert into private.deletions as d (household_id, kind, target_id, deleted_by, deleted_at, snapshot)
  values (v_household_id, 'activity', p_activity_id, auth.uid(), now(), jsonb_build_object(
    'activity', to_jsonb(v_activity),
    'ratings', (select coalesce(jsonb_agg(jsonb_build_object('member_id', r.member_id, 'stars', r.stars)), '[]')
                from public.activity_ratings r
                where r.household_id = v_household_id and r.activity_id = p_activity_id),
    'favorites', (select coalesce(jsonb_agg(f.member_id), '[]')
                  from public.activity_favorites f
                  where f.household_id = v_household_id and f.activity_id = p_activity_id),
    'series', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]')
               from public.activity_series s
               where s.household_id = v_household_id and s.activity_id = p_activity_id),
    'exceptions', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]')
                   from public.activity_series_exceptions x
                   join public.activity_series s on s.household_id = x.household_id and s.id = x.series_id
                   where s.household_id = v_household_id and s.activity_id = p_activity_id),
    'converted', v_converted,
    'removed', v_removed))
  on conflict (household_id, kind, target_id) do update
    set deleted_by = excluded.deleted_by, deleted_at = excluded.deleted_at, snapshot = excluded.snapshot;

  update public.meal_plan_entries e
  set kind = 'text', activity_id = null, starts_at = null, note = null, text = c.new_text
  from jsonb_to_recordset(v_converted) c (id uuid, new_text text)
  where e.household_id = v_household_id and e.id = c.id;

  delete from public.meal_plan_entries e
  where e.household_id = v_household_id
    and e.id in (select (x ->> 'id')::uuid from jsonb_array_elements(v_removed) x);

  delete from public.activities a where a.household_id = v_household_id and a.id = p_activity_id;

  return jsonb_build_object('converted', jsonb_array_length(v_converted), 'removed', jsonb_array_length(v_removed));
end
$$;

-- From 20261123070546_restore_keep_created_at; also puts back kind (while it exists), symbol,
-- "Merken", the series (eaters only current members, only with a slot that still exists) and
-- their exceptions (a removed slot falls back to the series' one). A snapshot from before this
-- migration has no series.
create or replace function private.restore_activity(p_activity_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deletion private.deletions := private.my_deletion('activity', p_activity_id);
  v_snapshot jsonb := v_deletion.snapshot;
  v_household_id uuid := v_deletion.household_id;
  v_existing_household_id uuid;
  v_created_by uuid := (v_snapshot -> 'activity' ->> 'created_by')::uuid;
begin
  select a.household_id into v_existing_household_id from public.activities a where a.id = p_activity_id;
  if v_existing_household_id = v_household_id then
    return false;
  elsif v_existing_household_id is not null then
    raise exception 'activity_not_restorable' using errcode = 'P0002';
  end if;

  perform pg_catalog.set_config('housekeeping.keep_created_at', 'on', true);
  insert into public.activities (id, household_id, name, name_key, description, photo_path, place_name, address, lat,
                                 lng, maps_url, website_url, created_at, kind_id, icon, remembered)
  select a.id, v_household_id, a.name, a.name_key, a.description, a.photo_path, a.place_name, a.address, a.lat,
         a.lng, a.maps_url, a.website_url, a.created_at,
         case when exists (select 1 from public.activity_kinds k
                           where k.household_id = v_household_id and k.id = a.kind_id) then a.kind_id end,
         a.icon, coalesce(a.remembered, true)
  from jsonb_populate_record(null::public.activities, v_snapshot -> 'activity') a;
  perform pg_catalog.set_config('housekeeping.keep_created_at', 'off', true);
  update public.activities a
  set created_by = case when exists (select 1 from public.household_members m
                                     where m.household_id = v_household_id and m.profile_id = v_created_by)
                        then v_created_by end
  where a.household_id = v_household_id and a.id = p_activity_id;

  insert into public.activity_ratings (household_id, activity_id, member_id, stars)
  select v_household_id, p_activity_id, x.member_id, x.stars
  from jsonb_to_recordset(v_snapshot -> 'ratings') x (member_id uuid, stars numeric)
  where exists (select 1 from public.household_members m
                where m.household_id = v_household_id and m.profile_id = x.member_id);

  insert into public.activity_favorites (household_id, activity_id, member_id)
  select v_household_id, p_activity_id, f.member_id::uuid
  from jsonb_array_elements_text(v_snapshot -> 'favorites') f (member_id)
  where exists (select 1 from public.household_members m
                where m.household_id = v_household_id and m.profile_id = f.member_id::uuid);

  insert into public.activity_series (id, household_id, activity_id, rule, starts_on, ends_on, slot_id, starts_at,
                                      note, eater_ids, guests)
  select s.id, v_household_id, p_activity_id, s.rule, s.starts_on, s.ends_on, s.slot_id, s.starts_at, s.note,
         array(select u.id from unnest(s.eater_ids) with ordinality u (id, ord)
               where exists (select 1 from public.household_members m
                             where m.household_id = v_household_id and m.profile_id = u.id)
               order by u.ord),
         s.guests
  from jsonb_populate_recordset(null::public.activity_series, coalesce(v_snapshot -> 'series', '[]')) s
  where exists (select 1 from public.households h, jsonb_array_elements(h.meal_slots) x
                where h.id = v_household_id and (x ->> 'id')::uuid = s.slot_id)
  on conflict (id) do nothing;

  insert into public.activity_series_exceptions (id, household_id, series_id, on_date, moved_to, slot_id, starts_at)
  select x.id, v_household_id, x.series_id, x.on_date, x.moved_to,
         case when exists (select 1 from public.households h, jsonb_array_elements(h.meal_slots) y
                           where h.id = v_household_id and (y ->> 'id')::uuid = x.slot_id) then x.slot_id end,
         x.starts_at
  from jsonb_populate_recordset(null::public.activity_series_exceptions, coalesce(v_snapshot -> 'exceptions', '[]')) x
  where exists (select 1 from public.activity_series s where s.household_id = v_household_id and s.id = x.series_id)
  on conflict (id) do nothing;

  perform private.restore_plan_entries(v_household_id, v_snapshot -> 'removed');
  perform private.restore_converted_entries(v_household_id, v_snapshot -> 'converted');

  delete from private.deletions d
  where d.household_id = v_household_id and d.kind = 'activity' and d.target_id = p_activity_id;
  return true;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- apply_changes: the new tables and columns (otherwise unchanged from 20261123070918_schema_cleanup)
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
  -- An activity's kind, own symbol and "Merken" are patched; kinds, series and their exceptions
  -- are written directly, a series keeps its activity (spec 0041).
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
                                    "address", "lat", "lng", "maps_url", "website_url", "created_by", "kind_id", "icon",
                                    "remembered"],
                         "patch":  ["name", "name_key", "description", "photo_path", "place_name", "address", "lat",
                                    "lng", "maps_url", "website_url", "kind_id", "icon", "remembered"], "delete": false},
    "activity_kinds":   {"insert": ["id", "household_id", "name", "name_key", "icon"],
                         "patch":  ["name", "name_key", "icon"], "delete": true},
    "activity_series":  {"insert": ["id", "household_id", "activity_id", "rule", "starts_on", "ends_on", "slot_id",
                                    "starts_at", "note", "eater_ids", "guests"],
                         "patch":  ["rule", "starts_on", "ends_on", "slot_id", "starts_at", "note", "eater_ids",
                                    "guests"], "delete": true},
    "activity_series_exceptions": {"insert": ["id", "household_id", "series_id", "on_date", "moved_to", "slot_id",
                                              "starts_at"],
                                   "patch":  ["series_id", "moved_to", "slot_id", "starts_at"], "delete": true},
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

-- ---------------------------------------------------------------------------------------------
-- sync_pull: the new tables (otherwise unchanged from 20261122190000_trips)
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
  -- trip_members spec 0022; activity_kinds, activity_series, activity_series_exceptions spec 0041).
  -- Small tables are listed separately below.
  c_tables constant text[] := array[
    'areas', 'articles', 'stores',
    'recipes', 'recipe_favorites', 'recipe_ratings', 'collection_recipes',
    'restaurants', 'restaurant_favorites', 'restaurant_ratings',
    'activities', 'activity_favorites', 'activity_ratings',
    'activity_kinds', 'activity_series', 'activity_series_exceptions',
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
