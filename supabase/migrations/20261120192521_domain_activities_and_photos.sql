-- Spec 0004 — activities (+ per-person favourites and ratings), activities in the meal plan, own
-- photos for activities and recipes.
--
-- * activities follow the restaurant pattern (spec 0003, T3c). name_key is computed by the client
--   with core normalizeText (duplicate check AC-008, like articles); it may be longer than the
--   name (ä → ae), hence 240. created_by is the caller (trigger, like feedback.author_id), never
--   updatable, and cleared when the person is removed from the household.
-- * Favourites and ratings: no write grants, written only by the set_activity_* RPCs for
--   auth.uid() (REQ-007, like restaurants).
-- * photo_path (activities, recipes) names the object in the private storage bucket
--   household-media (migration storage_household_media): <household_id>/<activities|recipes>/<id>/<file>.
--   The check keeps a row from pointing at another household's or another row's photo.
--   Uploading, replacing and deleting the object is the client's job through the Storage API (the
--   database cannot delete stored files). recipes.photo stays the bundled sample photo, used when
--   photo_path is null.
-- * meal_plan_entries: kind 'activity' with activity_id (on delete restrict, like recipe_id and
--   restaurant_id: a planned activity must not silently vanish from the plan) and an optional note
--   (≤ 120 characters, only on activity entries; shown as "Eislaufen (note)", REQ-005).

-- ---------------------------------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------------------------------

-- maps_url is opened by the app ("Route"), so only https links are stored.
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null
    constraint activities_name_valid check (btrim(name) <> '' and char_length(name) <= 120),
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
    char_length(photo_path) <= 300
    and photo_path ~ ('^' || household_id::text || '/activities/' || id::text || '/[^/]+$')),
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
  stars smallint not null
    constraint activity_ratings_stars_valid check (stars between 1 and 5),
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

create function private.set_activity_rating(p_activity_id uuid, p_stars smallint)
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
  elsif p_stars not between 1 and 5 then
    raise exception 'invalid_stars' using errcode = '22023';
  else
    insert into public.activity_ratings as r (household_id, activity_id, member_id, stars)
    values (v_household_id, p_activity_id, auth.uid(), p_stars)
    on conflict (household_id, activity_id, member_id) do update
      set stars = excluded.stars
      where r.stars is distinct from excluded.stars;
  end if;
end
$$;

grant execute on function private.set_activity_favorite(uuid, boolean) to authenticated;
grant execute on function private.set_activity_rating(uuid, smallint) to authenticated;

create function public.set_activity_favorite(activity_id uuid, favorite boolean)
returns void
language sql
set search_path = ''
as $$ select private.set_activity_favorite($1, $2) $$;

create function public.set_activity_rating(activity_id uuid, stars smallint)
returns void
language sql
set search_path = ''
as $$ select private.set_activity_rating($1, $2) $$;

grant execute on function public.set_activity_favorite(uuid, boolean) to authenticated;
grant execute on function public.set_activity_rating(uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- meal_plan_entries: activities with a note
-- ---------------------------------------------------------------------------------------------

-- The kind checks are replaced as a whole; the rules for the existing kinds are unchanged.
alter table public.meal_plan_entries
  add column activity_id uuid,
  add column note text
    constraint meal_plan_entries_note_length check (char_length(note) <= 120),
  drop constraint meal_plan_entries_kind_known,
  add constraint meal_plan_entries_kind_known
    check (kind in ('recipe', 'text', 'leftovers', 'restaurant', 'activity')),
  drop constraint meal_plan_entries_kind_complete,
  add constraint meal_plan_entries_kind_complete check (
    case kind
      when 'recipe' then recipe_id is not null
      when 'restaurant' then restaurant_id is not null
      when 'text' then text is not null and btrim(text) <> ''
      when 'leftovers' then recipe_id is not null or leftovers_of_entry_id is not null
      when 'activity' then activity_id is not null
      else false
    end),
  add constraint meal_plan_entries_note_only_activity check (note is null or kind = 'activity'),
  add constraint meal_plan_entries_activity_fkey foreign key (household_id, activity_id)
    references public.activities (household_id, id) on delete restrict;

create index meal_plan_entries_household_id_activity_id_idx on public.meal_plan_entries (household_id, activity_id);

grant insert (activity_id, note), update (activity_id, note) on public.meal_plan_entries to authenticated;

-- ---------------------------------------------------------------------------------------------
-- recipes: own photo
-- ---------------------------------------------------------------------------------------------

alter table public.recipes
  add column photo_path text,
  add constraint recipes_photo_path_valid check (
    char_length(photo_path) <= 300
    and photo_path ~ ('^' || household_id::text || '/recipes/' || id::text || '/[^/]+$'));

grant insert (photo_path), update (photo_path) on public.recipes to authenticated;
