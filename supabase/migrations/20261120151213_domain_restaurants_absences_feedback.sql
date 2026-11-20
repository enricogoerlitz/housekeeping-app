-- Spec 0003, T3c — restaurants (+ per-person favourites and ratings), absences, feedback
-- (+ per-person votes).
--
-- Favourites, ratings and votes follow the recipe pattern (T3b): no write grants, written only
-- by security definer set_* RPCs for auth.uid().

-- ---------------------------------------------------------------------------------------------
-- restaurants
-- ---------------------------------------------------------------------------------------------

-- maps_url is opened by the app ("Route"), so only http(s) links are stored.
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null
    constraint restaurants_name_valid check (btrim(name) <> '' and char_length(name) <= 200),
  address text
    constraint restaurants_address_length check (char_length(address) <= 500),
  lat double precision
    constraint restaurants_lat_valid check (lat between -90 and 90),
  lng double precision
    constraint restaurants_lng_valid check (lng between -180 and 180),
  maps_url text
    constraint restaurants_maps_url_valid check (char_length(maps_url) <= 2000 and maps_url ~* '^https?://'),
  cuisine text
    constraint restaurants_cuisine_length check (char_length(cuisine) <= 80),
  price_level smallint
    constraint restaurants_price_level_valid check (price_level between 1 and 4),
  tags text[] not null default '{}'
    constraint restaurants_tags_size check (cardinality(tags) <= 30 and char_length(array_to_string(tags, '')) <= 1000),
  notes text
    constraint restaurants_notes_length check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurants_household_id_id_key unique (household_id, id),
  constraint restaurants_location_complete check ((lat is null) = (lng is null))
);

create index restaurants_household_id_updated_at_idx on public.restaurants (household_id, updated_at);

grant select, delete on public.restaurants to authenticated;
grant insert (id, household_id, name, address, lat, lng, maps_url, cuisine, price_level, tags, notes)
  on public.restaurants to authenticated;
grant update (name, address, lat, lng, maps_url, cuisine, price_level, tags, notes)
  on public.restaurants to authenticated;
select private.attach_household_policies('public.restaurants');
select private.attach_sync_triggers('public.restaurants');

create table public.restaurant_favorites (
  household_id uuid not null references public.households (id) on delete cascade,
  restaurant_id uuid not null,
  member_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, restaurant_id, member_id),
  constraint restaurant_favorites_restaurant_fkey foreign key (household_id, restaurant_id)
    references public.restaurants (household_id, id) on delete cascade,
  constraint restaurant_favorites_member_fkey foreign key (household_id, member_id)
    references public.household_members (household_id, profile_id) on delete cascade
);

create index restaurant_favorites_household_id_updated_at_idx on public.restaurant_favorites (household_id, updated_at);
create index restaurant_favorites_household_id_member_id_idx on public.restaurant_favorites (household_id, member_id);

create table public.restaurant_ratings (
  household_id uuid not null references public.households (id) on delete cascade,
  restaurant_id uuid not null,
  member_id uuid not null,
  stars smallint not null
    constraint restaurant_ratings_stars_valid check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, restaurant_id, member_id),
  constraint restaurant_ratings_restaurant_fkey foreign key (household_id, restaurant_id)
    references public.restaurants (household_id, id) on delete cascade,
  constraint restaurant_ratings_member_fkey foreign key (household_id, member_id)
    references public.household_members (household_id, profile_id) on delete cascade
);

create index restaurant_ratings_household_id_updated_at_idx on public.restaurant_ratings (household_id, updated_at);
create index restaurant_ratings_household_id_member_id_idx on public.restaurant_ratings (household_id, member_id);

alter table public.restaurant_favorites enable row level security;
alter table public.restaurant_ratings enable row level security;
grant select on public.restaurant_favorites to authenticated;
grant select on public.restaurant_ratings to authenticated;
create policy restaurant_favorites_select on public.restaurant_favorites for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy restaurant_ratings_select on public.restaurant_ratings for select to authenticated
  using (household_id in (select private.my_household_ids()));
select private.attach_sync_triggers('public.restaurant_favorites', array['restaurant_id', 'member_id']);
select private.attach_sync_triggers('public.restaurant_ratings', array['restaurant_id', 'member_id']);

-- ---------------------------------------------------------------------------------------------
-- absences
-- ---------------------------------------------------------------------------------------------

-- member_id null = the whole household is away. A member's own absences go when she is removed.
create table public.absences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid,
  from_on date not null,
  to_on date not null,
  note text
    constraint absences_note_length check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint absences_household_id_id_key unique (household_id, id),
  constraint absences_range_valid check (to_on >= from_on),
  constraint absences_member_fkey foreign key (household_id, member_id)
    references public.household_members (household_id, profile_id) on delete cascade
);

create index absences_household_id_updated_at_idx on public.absences (household_id, updated_at);
create index absences_household_id_member_id_idx on public.absences (household_id, member_id);

grant select, delete on public.absences to authenticated;
grant insert (id, household_id, member_id, from_on, to_on, note) on public.absences to authenticated;
grant update (member_id, from_on, to_on, note) on public.absences to authenticated;
select private.attach_household_policies('public.absences');
select private.attach_sync_triggers('public.absences');

-- ---------------------------------------------------------------------------------------------
-- feedback
-- ---------------------------------------------------------------------------------------------

-- author_id is the person who wrote it: set to auth.uid() on insert, never updatable (no column
-- grant). It becomes null when the author is removed from the household.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null
    constraint feedback_kind_valid check (kind in ('idea', 'problem', 'praise')),
  text text not null
    constraint feedback_text_valid check (btrim(text) <> '' and char_length(text) <= 4000),
  status text not null default 'new'
    constraint feedback_status_valid check (status in ('new', 'accepted', 'rejected', 'done')),
  author_id uuid,
  screen text
    constraint feedback_screen_length check (char_length(screen) <= 200),
  reason text
    constraint feedback_reason_length check (char_length(reason) <= 4000),
  spec_ref text
    constraint feedback_spec_ref_length check (char_length(spec_ref) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_household_id_id_key unique (household_id, id),
  constraint feedback_author_fkey foreign key (household_id, author_id)
    references public.household_members (household_id, profile_id) on delete set null (author_id)
);

create index feedback_household_id_updated_at_idx on public.feedback (household_id, updated_at);
create index feedback_household_id_author_id_idx on public.feedback (household_id, author_id);

-- Before insert: the author is the signed-in caller, whatever the client sent. Without a user
-- (seed, maintenance as postgres) the given value stays.
create function private.feedback_set_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.author_id := coalesce(auth.uid(), new.author_id);
  return new;
end
$$;

create trigger feedback_set_author before insert on public.feedback
  for each row execute function private.feedback_set_author();

grant select, delete on public.feedback to authenticated;
grant insert (id, household_id, kind, text, status, author_id, screen, reason, spec_ref)
  on public.feedback to authenticated;
grant update (kind, text, status, screen, reason, spec_ref) on public.feedback to authenticated;
select private.attach_household_policies('public.feedback');
select private.attach_sync_triggers('public.feedback');

create table public.feedback_votes (
  household_id uuid not null references public.households (id) on delete cascade,
  feedback_id uuid not null,
  member_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, feedback_id, member_id),
  constraint feedback_votes_feedback_fkey foreign key (household_id, feedback_id)
    references public.feedback (household_id, id) on delete cascade,
  constraint feedback_votes_member_fkey foreign key (household_id, member_id)
    references public.household_members (household_id, profile_id) on delete cascade
);

create index feedback_votes_household_id_updated_at_idx on public.feedback_votes (household_id, updated_at);
create index feedback_votes_household_id_member_id_idx on public.feedback_votes (household_id, member_id);

alter table public.feedback_votes enable row level security;
grant select on public.feedback_votes to authenticated;
create policy feedback_votes_select on public.feedback_votes for select to authenticated
  using (household_id in (select private.my_household_ids()));
select private.attach_sync_triggers('public.feedback_votes', array['feedback_id', 'member_id']);

-- ---------------------------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------------------------

-- The household of a restaurant / feedback entry the caller can see, or *_not_found.
create function private.my_restaurant_household_id(p_restaurant_id uuid)
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
  select r.household_id into v_household_id
  from public.restaurants r
  join public.household_members m on m.household_id = r.household_id and m.profile_id = auth.uid()
  where r.id = p_restaurant_id;
  if v_household_id is null then
    raise exception 'restaurant_not_found' using errcode = 'P0002';
  end if;
  return v_household_id;
end
$$;

create function private.my_feedback_household_id(p_feedback_id uuid)
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
  select f.household_id into v_household_id
  from public.feedback f
  join public.household_members m on m.household_id = f.household_id and m.profile_id = auth.uid()
  where f.id = p_feedback_id;
  if v_household_id is null then
    raise exception 'feedback_not_found' using errcode = 'P0002';
  end if;
  return v_household_id;
end
$$;

create function private.set_restaurant_favorite(p_restaurant_id uuid, p_favorite boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := private.my_restaurant_household_id(p_restaurant_id);
begin
  if p_favorite is null then
    raise exception 'invalid_favorite' using errcode = '22023';
  end if;
  if p_favorite then
    insert into public.restaurant_favorites (household_id, restaurant_id, member_id)
    values (v_household_id, p_restaurant_id, auth.uid())
    on conflict do nothing;
  else
    delete from public.restaurant_favorites f
    where f.household_id = v_household_id and f.restaurant_id = p_restaurant_id and f.member_id = auth.uid();
  end if;
end
$$;

create function private.set_restaurant_rating(p_restaurant_id uuid, p_stars smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := private.my_restaurant_household_id(p_restaurant_id);
begin
  if p_stars is null then
    delete from public.restaurant_ratings r
    where r.household_id = v_household_id and r.restaurant_id = p_restaurant_id and r.member_id = auth.uid();
  elsif p_stars not between 1 and 5 then
    raise exception 'invalid_stars' using errcode = '22023';
  else
    insert into public.restaurant_ratings as r (household_id, restaurant_id, member_id, stars)
    values (v_household_id, p_restaurant_id, auth.uid(), p_stars)
    on conflict (household_id, restaurant_id, member_id) do update
      set stars = excluded.stars
      where r.stars is distinct from excluded.stars;
  end if;
end
$$;

-- "+1" on a feedback entry (true) or taking it back (false). Idempotent.
create function private.set_feedback_vote(p_feedback_id uuid, p_voted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := private.my_feedback_household_id(p_feedback_id);
begin
  if p_voted is null then
    raise exception 'invalid_vote' using errcode = '22023';
  end if;
  if p_voted then
    insert into public.feedback_votes (household_id, feedback_id, member_id)
    values (v_household_id, p_feedback_id, auth.uid())
    on conflict do nothing;
  else
    delete from public.feedback_votes v
    where v.household_id = v_household_id and v.feedback_id = p_feedback_id and v.member_id = auth.uid();
  end if;
end
$$;

grant execute on function private.set_restaurant_favorite(uuid, boolean) to authenticated;
grant execute on function private.set_restaurant_rating(uuid, smallint) to authenticated;
grant execute on function private.set_feedback_vote(uuid, boolean) to authenticated;

create function public.set_restaurant_favorite(restaurant_id uuid, favorite boolean)
returns void
language sql
set search_path = ''
as $$ select private.set_restaurant_favorite($1, $2) $$;

create function public.set_restaurant_rating(restaurant_id uuid, stars smallint)
returns void
language sql
set search_path = ''
as $$ select private.set_restaurant_rating($1, $2) $$;

create function public.set_feedback_vote(feedback_id uuid, voted boolean)
returns void
language sql
set search_path = ''
as $$ select private.set_feedback_vote($1, $2) $$;

grant execute on function public.set_restaurant_favorite(uuid, boolean) to authenticated;
grant execute on function public.set_restaurant_rating(uuid, smallint) to authenticated;
grant execute on function public.set_feedback_vote(uuid, boolean) to authenticated;
