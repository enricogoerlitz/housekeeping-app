-- Spec 0003, T3b — recipes, plus per-person favourites and ratings.
--
-- Favourites and ratings belong to one person each. Members never write them directly (no write
-- grants); set_recipe_favorite / set_recipe_rating write them for auth.uid() in the recipe's
-- household. They are security definer because a security invoker function would need write
-- grants on the tables, and those grants would open the direct path the RPCs exist to close.

-- ---------------------------------------------------------------------------------------------
-- recipes
-- ---------------------------------------------------------------------------------------------

-- variants, ingredients and steps are JSON arrays in the shape of the core types; the ingredient
-- list is one field (concurrent edits: last write wins, spec 0003 decision 8).
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null
    constraint recipes_title_valid check (btrim(title) <> '' and char_length(title) <= 200),
  photo text
    constraint recipes_photo_length check (char_length(photo) <= 200),
  description text
    constraint recipes_description_length check (char_length(description) <= 4000),
  servings integer not null default 2
    constraint recipes_servings_valid check (servings between 1 and 100),
  total_minutes integer
    constraint recipes_total_minutes_valid check (total_minutes between 0 and 10000),
  course text not null default 'main'
    constraint recipes_course_valid check (course in ('breakfast', 'main', 'side', 'dessert', 'snack', 'drink')),
  cuisine text
    constraint recipes_cuisine_length check (char_length(cuisine) <= 80),
  tags text[] not null default '{}'
    constraint recipes_tags_size check (cardinality(tags) <= 30 and char_length(array_to_string(tags, '')) <= 1000),
  variants jsonb not null default '[]'
    constraint recipes_variants_valid check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) <= 20),
  ingredients jsonb not null default '[]'
    constraint recipes_ingredients_valid check (
      jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) <= 300
      and octet_length(ingredients::text) <= 200000),
  steps jsonb not null default '[]'
    constraint recipes_steps_valid check (
      jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 100
      and octet_length(steps::text) <= 200000),
  lead_time jsonb
    constraint recipes_lead_time_valid check (jsonb_typeof(lead_time) = 'object' and octet_length(lead_time::text) <= 1000),
  notes text
    constraint recipes_notes_length check (char_length(notes) <= 4000),
  last_cooked_on date,
  cooked_count integer not null default 0
    constraint recipes_cooked_count_valid check (cooked_count >= 0),
  source text
    constraint recipes_source_length check (char_length(source) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipes_household_id_id_key unique (household_id, id)
);

create index recipes_household_id_updated_at_idx on public.recipes (household_id, updated_at);

grant select, delete on public.recipes to authenticated;
grant insert (id, household_id, title, photo, description, servings, total_minutes, course, cuisine, tags,
              variants, ingredients, steps, lead_time, notes, last_cooked_on, cooked_count, source)
  on public.recipes to authenticated;
grant update (title, photo, description, servings, total_minutes, course, cuisine, tags,
              variants, ingredients, steps, lead_time, notes, last_cooked_on, cooked_count, source)
  on public.recipes to authenticated;
select private.attach_household_policies('public.recipes');
select private.attach_sync_triggers('public.recipes');

-- ---------------------------------------------------------------------------------------------
-- recipe_favorites, recipe_ratings
-- ---------------------------------------------------------------------------------------------

-- Deleting the recipe or removing the member deletes the row (with a tombstone keyed
-- recipe_id:member_id).
create table public.recipe_favorites (
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null,
  member_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, recipe_id, member_id),
  constraint recipe_favorites_recipe_fkey foreign key (household_id, recipe_id)
    references public.recipes (household_id, id) on delete cascade,
  constraint recipe_favorites_member_fkey foreign key (household_id, member_id)
    references public.household_members (household_id, profile_id) on delete cascade
);

create index recipe_favorites_household_id_updated_at_idx on public.recipe_favorites (household_id, updated_at);
create index recipe_favorites_household_id_member_id_idx on public.recipe_favorites (household_id, member_id);

create table public.recipe_ratings (
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null,
  member_id uuid not null,
  stars smallint not null
    constraint recipe_ratings_stars_valid check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, recipe_id, member_id),
  constraint recipe_ratings_recipe_fkey foreign key (household_id, recipe_id)
    references public.recipes (household_id, id) on delete cascade,
  constraint recipe_ratings_member_fkey foreign key (household_id, member_id)
    references public.household_members (household_id, profile_id) on delete cascade
);

create index recipe_ratings_household_id_updated_at_idx on public.recipe_ratings (household_id, updated_at);
create index recipe_ratings_household_id_member_id_idx on public.recipe_ratings (household_id, member_id);

alter table public.recipe_favorites enable row level security;
alter table public.recipe_ratings enable row level security;
grant select on public.recipe_favorites to authenticated;
grant select on public.recipe_ratings to authenticated;
create policy recipe_favorites_select on public.recipe_favorites for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy recipe_ratings_select on public.recipe_ratings for select to authenticated
  using (household_id in (select private.my_household_ids()));
select private.attach_sync_triggers('public.recipe_favorites', array['recipe_id', 'member_id']);
select private.attach_sync_triggers('public.recipe_ratings', array['recipe_id', 'member_id']);

-- ---------------------------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------------------------

-- The household of a recipe the caller can see, or recipe_not_found (also for another
-- household's recipe, so existence is not revealed).
create function private.my_recipe_household_id(p_recipe_id uuid)
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
  from public.recipes r
  join public.household_members m on m.household_id = r.household_id and m.profile_id = auth.uid()
  where r.id = p_recipe_id;
  if v_household_id is null then
    raise exception 'recipe_not_found' using errcode = 'P0002';
  end if;
  return v_household_id;
end
$$;

-- Marks (true) or unmarks (false) the recipe as the caller's favourite. Idempotent.
create function private.set_recipe_favorite(p_recipe_id uuid, p_favorite boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := private.my_recipe_household_id(p_recipe_id);
begin
  if p_favorite is null then
    raise exception 'invalid_favorite' using errcode = '22023';
  end if;
  if p_favorite then
    insert into public.recipe_favorites (household_id, recipe_id, member_id)
    values (v_household_id, p_recipe_id, auth.uid())
    on conflict do nothing;
  else
    delete from public.recipe_favorites f
    where f.household_id = v_household_id and f.recipe_id = p_recipe_id and f.member_id = auth.uid();
  end if;
end
$$;

-- Sets the caller's rating (1–5 stars) or removes it (null). Idempotent.
create function private.set_recipe_rating(p_recipe_id uuid, p_stars smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := private.my_recipe_household_id(p_recipe_id);
begin
  if p_stars is null then
    delete from public.recipe_ratings r
    where r.household_id = v_household_id and r.recipe_id = p_recipe_id and r.member_id = auth.uid();
  elsif p_stars not between 1 and 5 then
    raise exception 'invalid_stars' using errcode = '22023';
  else
    insert into public.recipe_ratings as r (household_id, recipe_id, member_id, stars)
    values (v_household_id, p_recipe_id, auth.uid(), p_stars)
    on conflict (household_id, recipe_id, member_id) do update
      set stars = excluded.stars
      where r.stars is distinct from excluded.stars;
  end if;
end
$$;

grant execute on function private.set_recipe_favorite(uuid, boolean) to authenticated;
grant execute on function private.set_recipe_rating(uuid, smallint) to authenticated;

create function public.set_recipe_favorite(recipe_id uuid, favorite boolean)
returns void
language sql
set search_path = ''
as $$ select private.set_recipe_favorite($1, $2) $$;

create function public.set_recipe_rating(recipe_id uuid, stars smallint)
returns void
language sql
set search_path = ''
as $$ select private.set_recipe_rating($1, $2) $$;

grant execute on function public.set_recipe_favorite(uuid, boolean) to authenticated;
grant execute on function public.set_recipe_rating(uuid, smallint) to authenticated;
