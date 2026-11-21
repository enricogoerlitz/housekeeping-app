-- Baseline (ADR-0012) — activities (+ per-person favourites and ratings) and the meal plan.
--
-- * activities follow the restaurant pattern. name_key is computed by the client with core
--   normalizeText (duplicate check, like articles); it may be longer than the name (ä → ae),
--   hence 240. created_by is the caller (trigger, like feedback.author_id), never updatable, and
--   cleared when the person is removed from the household.
-- * Favourites and ratings: no write grants, written only by the set_activity_* RPCs for
--   auth.uid() (like restaurants).
-- * photo_path names the own photo in the private storage bucket household-media (storage
--   migration): <household_id>/activities/<id>/<uuid>.jpg. The check keeps a row from pointing at
--   another household's or another row's photo, and allows no other file name. Uploading,
--   replacing and deleting the object is the client's job through the Storage API (the database
--   cannot delete stored files).

-- ---------------------------------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------------------------------

-- maps_url is opened by the app ("Route"), so only https links are stored.
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null
    -- No control characters: the name flows into notifications (spec 0013, security check).
    constraint activities_name_valid check (btrim(name) <> '' and char_length(name) <= 120 and name !~ '[[:cntrl:]]'),
  name_key text not null
    constraint activities_name_key_valid check (name_key <> '' and char_length(name_key) <= 240),
  description text
    constraint activities_description_length check (char_length(description) <= 4000),
  photo_path text,
  place_name text
    constraint activities_place_name_length check (char_length(place_name) <= 200),
  address text
    constraint activities_address_length check (char_length(address) <= 300),
  lat double precision
    constraint activities_lat_valid check (lat between -90 and 90),
  lng double precision
    constraint activities_lng_valid check (lng between -180 and 180),
  maps_url text
    constraint activities_maps_url_valid check (char_length(maps_url) <= 2000 and maps_url ~* '^https://'),
  tags text[] not null default '{}'
    constraint activities_tags_size check (cardinality(tags) <= 30 and char_length(array_to_string(tags, '')) <= 1000),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_household_id_id_key unique (household_id, id),
  constraint activities_household_id_name_key_key unique (household_id, name_key),
  constraint activities_location_complete check ((lat is null) = (lng is null)),

  constraint activities_photo_path_valid check (
    photo_path ~ ('^' || household_id::text || '/activities/' || id::text
                  || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')),

  constraint activities_created_by_fkey foreign key (household_id, created_by)
    references public.household_members (household_id, profile_id) on delete set null (created_by)
);

create index activities_household_id_updated_at_idx on public.activities (household_id, updated_at);
create index activities_household_id_created_by_idx on public.activities (household_id, created_by);

-- Before insert: the creator is the signed-in caller, whatever the client sent. Without a user
-- (seed, maintenance as postgres) the given value stays.
create function private.activities_set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end
$$;

create trigger activities_set_created_by before insert on public.activities
  for each row execute function private.activities_set_created_by();

-- created_by may be sent on insert (it is overwritten), never updated.
grant select, delete on public.activities to authenticated;
grant insert (id, household_id, name, name_key, description, photo_path, place_name, address, lat, lng, maps_url,
              tags, created_by)
  on public.activities to authenticated;
grant update (name, name_key, description, photo_path, place_name, address, lat, lng, maps_url, tags)
  on public.activities to authenticated;
select private.attach_household_policies('public.activities');
select private.attach_sync_triggers('public.activities');

-- ---------------------------------------------------------------------------------------------
-- activity_favorites, activity_ratings
-- ---------------------------------------------------------------------------------------------

-- Deleting the activity or removing the member deletes the row (with a tombstone keyed
-- activity_id:member_id).
create table public.activity_favorites (
  household_id uuid not null references public.households (id) on delete cascade,
  activity_id uuid not null,
  member_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, activity_id, member_id),
  constraint activity_favorites_activity_fkey foreign key (household_id, activity_id)
    references public.activities (household_id, id) on delete cascade,
  constraint activity_favorites_member_fkey foreign key (household_id, member_id)
    references public.household_members (household_id, profile_id) on delete cascade
);

create index activity_favorites_household_id_updated_at_idx on public.activity_favorites (household_id, updated_at);
create index activity_favorites_household_id_member_id_idx on public.activity_favorites (household_id, member_id);

create table public.activity_ratings (
  household_id uuid not null references public.households (id) on delete cascade,
  activity_id uuid not null,
  member_id uuid not null,
  -- 0.5 to 5 in half steps (spec 0011, REQ-004).
  stars numeric(2,1) not null
    constraint activity_ratings_stars_valid check (stars between 0.5 and 5 and stars * 2 = trunc(stars * 2)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, activity_id, member_id),
  constraint activity_ratings_activity_fkey foreign key (household_id, activity_id)
    references public.activities (household_id, id) on delete cascade,
  constraint activity_ratings_member_fkey foreign key (household_id, member_id)
    references public.household_members (household_id, profile_id) on delete cascade
);

create index activity_ratings_household_id_updated_at_idx on public.activity_ratings (household_id, updated_at);
create index activity_ratings_household_id_member_id_idx on public.activity_ratings (household_id, member_id);

alter table public.activity_favorites enable row level security;
alter table public.activity_ratings enable row level security;
grant select on public.activity_favorites to authenticated;
grant select on public.activity_ratings to authenticated;
create policy activity_favorites_select on public.activity_favorites for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy activity_ratings_select on public.activity_ratings for select to authenticated
  using (household_id in (select private.my_household_ids()));
select private.attach_sync_triggers('public.activity_favorites', array['activity_id', 'member_id']);
select private.attach_sync_triggers('public.activity_ratings', array['activity_id', 'member_id']);

-- ---------------------------------------------------------------------------------------------
-- RPCs (like set_restaurant_favorite / set_restaurant_rating)
-- ---------------------------------------------------------------------------------------------

-- The household of an activity the caller can see, or activity_not_found.
create function private.my_activity_household_id(p_activity_id uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select a.household_id into v_household_id
  from public.activities a
  join public.household_members m on m.household_id = a.household_id and m.profile_id = auth.uid()
  where a.id = p_activity_id;
  if v_household_id is null then
    raise exception 'activity_not_found' using errcode = 'P0002';
  end if;
  return v_household_id;
end
$$;

create function private.set_activity_favorite(p_activity_id uuid, p_favorite boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := private.my_activity_household_id(p_activity_id);
begin
  if p_favorite is null then
    raise exception 'invalid_favorite' using errcode = '22023';
  end if;
  if p_favorite then
    insert into public.activity_favorites (household_id, activity_id, member_id)
    values (v_household_id, p_activity_id, auth.uid())
    on conflict do nothing;
  else
    delete from public.activity_favorites f
    where f.household_id = v_household_id and f.activity_id = p_activity_id and f.member_id = auth.uid();
  end if;
end
$$;

create function private.set_activity_rating(p_activity_id uuid, p_stars numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := private.my_activity_household_id(p_activity_id);
begin
  if p_stars is null then
    delete from public.activity_ratings r
    where r.household_id = v_household_id and r.activity_id = p_activity_id and r.member_id = auth.uid();
  elsif not (p_stars between 0.5 and 5 and p_stars * 2 = trunc(p_stars * 2)) then
    -- Checked before the value meets numeric(2,1), which would round 4.25 to 4.3 silently.
    raise exception 'invalid_stars' using errcode = '22023';
  else
    insert into public.activity_ratings as r (household_id, activity_id, member_id, stars)
    values (v_household_id, p_activity_id, auth.uid(), p_stars)
    on conflict (household_id, activity_id, member_id) do update
      set stars = excluded.stars;
  end if;
end
$$;

grant execute on function private.set_activity_favorite(uuid, boolean) to authenticated;
grant execute on function private.set_activity_rating(uuid, numeric) to authenticated;

create function public.set_activity_favorite(activity_id uuid, favorite boolean)
returns void
language sql
set search_path = ''
as $$ select private.set_activity_favorite($1, $2) $$;

create function public.set_activity_rating(activity_id uuid, stars numeric)
returns void
language sql
set search_path = ''
as $$ select private.set_activity_rating($1, $2) $$;

grant execute on function public.set_activity_favorite(uuid, boolean) to authenticated;
grant execute on function public.set_activity_rating(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- meal_plan_entries
-- ---------------------------------------------------------------------------------------------

-- * date null = "vorgemerkt" (planned without a day).
-- * slot_id is the id of one of the household's meal_slots (JSON in households, so a trigger
--   checks it instead of a foreign key).
-- * kind decides which reference is required. recipe_id / restaurant_id / activity_id use `on
--   delete restrict`: a planned or cooked meal must not silently vanish or lose what it was, and a
--   cleared reference would violate the kind check anyway. Deleting a recipe, restaurant or
--   activity that is in the plan therefore needs the entries removed or changed first, in the
--   same RPC.
-- * note (≤ 120 characters) only on activity entries; shown as "Eislaufen (note)".
-- * leftovers_of_entry_id is cleared when the source entry is deleted; leftovers keep their
--   recipe_id (the client copies it from the source), so they stay valid.
-- * cook_id is cleared when the person is removed; eater_ids are checked by trigger.
-- * reserved_at (time of day, 5-minute steps) only on restaurant entries, with the reminder
--   remind_minutes_before (spec 0013, REQ-008, D43); the reminder value exists on every row and
--   only matters with a reservation.
create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  date date,
  slot_id uuid not null,
  kind text not null
    constraint meal_plan_entries_kind_known
      check (kind in ('recipe', 'text', 'leftovers', 'restaurant', 'activity')),
  recipe_id uuid,
  restaurant_id uuid,
  activity_id uuid,
  text text
    constraint meal_plan_entries_text_length check (char_length(text) <= 500),
    -- Free text and Zusatz flow into notifications (spec 0013, security check).
    constraint meal_plan_entries_text_no_control check (text !~ '[[:cntrl:]]'),
  note text
    constraint meal_plan_entries_note_length check (char_length(note) <= 120),
    constraint meal_plan_entries_note_no_control check (note !~ '[[:cntrl:]]'),
  leftovers_of_entry_id uuid,
  eater_ids uuid[] not null default '{}'
    constraint meal_plan_entries_eater_ids_size check (cardinality(eater_ids) <= 50),
  guests integer not null default 0
    constraint meal_plan_entries_guests_valid check (guests between 0 and 100),
  portions integer not null default 0
    constraint meal_plan_entries_portions_valid check (portions between 0 and 1000),
  variants jsonb not null default '[]'
    constraint meal_plan_entries_variants_valid check (
      jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) <= 20
      and octet_length(variants::text) <= 4000),
  cook_id uuid,
  sort integer not null default 0,
  not_cooked boolean not null default false,
  reserved_at time
    constraint meal_plan_entries_reserved_at_five_minutes check (private.is_five_minute_time(reserved_at)),
  remind_minutes_before smallint not null default 120
    constraint meal_plan_entries_remind_minutes_before_valid check (remind_minutes_before in (30, 60, 120, 180, 240)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_plan_entries_household_id_id_key unique (household_id, id),
  constraint meal_plan_entries_kind_complete check (
    case kind
      when 'recipe' then recipe_id is not null
      when 'restaurant' then restaurant_id is not null
      when 'text' then text is not null and btrim(text) <> ''
      when 'leftovers' then recipe_id is not null or leftovers_of_entry_id is not null
      when 'activity' then activity_id is not null
      else false
    end),
  constraint meal_plan_entries_note_only_activity check (note is null or kind = 'activity'),
  constraint meal_plan_entries_reservation_only_restaurant check (reserved_at is null or kind = 'restaurant'),
  constraint meal_plan_entries_recipe_fkey foreign key (household_id, recipe_id)
    references public.recipes (household_id, id) on delete restrict,
  constraint meal_plan_entries_restaurant_fkey foreign key (household_id, restaurant_id)
    references public.restaurants (household_id, id) on delete restrict,
  constraint meal_plan_entries_activity_fkey foreign key (household_id, activity_id)
    references public.activities (household_id, id) on delete restrict,
  constraint meal_plan_entries_leftovers_fkey foreign key (household_id, leftovers_of_entry_id)
    references public.meal_plan_entries (household_id, id) on delete set null (leftovers_of_entry_id),
  constraint meal_plan_entries_cook_fkey foreign key (household_id, cook_id)
    references public.household_members (household_id, profile_id) on delete set null (cook_id)
);

create index meal_plan_entries_household_id_updated_at_idx on public.meal_plan_entries (household_id, updated_at);
create index meal_plan_entries_household_id_recipe_id_idx on public.meal_plan_entries (household_id, recipe_id);
create index meal_plan_entries_household_id_restaurant_id_idx on public.meal_plan_entries (household_id, restaurant_id);
create index meal_plan_entries_household_id_activity_id_idx on public.meal_plan_entries (household_id, activity_id);
create index meal_plan_entries_household_id_leftovers_idx
  on public.meal_plan_entries (household_id, leftovers_of_entry_id);
create index meal_plan_entries_household_id_cook_id_idx on public.meal_plan_entries (household_id, cook_id);

-- Before insert or update: a new or changed slot_id must be one of the household's meal slots;
-- people newly added to eater_ids must be members. Unchanged values are not re-checked, so a
-- removed slot or member does not block other edits of old entries. Security invoker: reads the
-- household and its members under the caller's RLS.
create function private.meal_plan_entries_check_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.slot_id is distinct from old.slot_id then
    if not exists (
      select 1
      from public.households h, jsonb_array_elements(h.meal_slots) s
      where h.id = new.household_id and (s ->> 'id')::uuid = new.slot_id
    ) then
      raise exception 'invalid_slot' using errcode = '23503';
    end if;
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

create trigger meal_plan_entries_check_refs before insert or update of slot_id, eater_ids
  on public.meal_plan_entries
  for each row execute function private.meal_plan_entries_check_refs();

grant select, delete on public.meal_plan_entries to authenticated;
grant insert (id, household_id, date, slot_id, kind, recipe_id, restaurant_id, activity_id, text, note,
              leftovers_of_entry_id,
              eater_ids, guests, portions, variants, cook_id, sort, not_cooked, reserved_at, remind_minutes_before)
  on public.meal_plan_entries to authenticated;
grant update (date, slot_id, kind, recipe_id, restaurant_id, activity_id, text, note, leftovers_of_entry_id,
              eater_ids, guests, portions, variants, cook_id, sort, not_cooked, reserved_at, remind_minutes_before)
  on public.meal_plan_entries to authenticated;
select private.attach_household_policies('public.meal_plan_entries');
select private.attach_sync_triggers('public.meal_plan_entries');
