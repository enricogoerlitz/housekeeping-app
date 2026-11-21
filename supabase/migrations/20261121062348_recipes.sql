-- Baseline (ADR-0012) — recipes, plus per-person favourites and ratings, and deleting a recipe
-- with "Rückgängig" (spec 0008).
--
-- Favourites and ratings belong to one person each. Members never write them directly (no write
-- grants); set_recipe_favorite / set_recipe_rating write them for auth.uid() in the recipe's
-- household. They are security definer because a security invoker function would need write
-- grants on the tables, and those grants would open the direct path the RPCs exist to close.

-- ---------------------------------------------------------------------------------------------
-- recipes
-- ---------------------------------------------------------------------------------------------

-- variants, ingredients and steps are JSON arrays in the shape of the core types; the ingredient
-- list is one field (concurrent edits: last write wins, spec 0003 decision 8). Every ingredient
-- points at an article of the household (trigger recipes_check_ingredients below).
-- photo is the bundled sample photo, used when photo_path is null. photo_path names the own photo
-- in the private storage bucket household-media (storage migration):
-- <household_id>/recipes/<id>/<uuid>.jpg — the check keeps a row from pointing at another
-- household's or another row's photo, and allows no other file name. Uploading, replacing and
-- deleting the object is the client's job through the Storage API.
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null
    constraint recipes_title_valid check (btrim(title) <> '' and char_length(title) <= 200),
  photo text
    constraint recipes_photo_length check (char_length(photo) <= 200),
  photo_path text,
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
  constraint recipes_household_id_id_key unique (household_id, id),
  constraint recipes_photo_path_valid check (
    photo_path ~ ('^' || household_id::text || '/recipes/' || id::text
                  || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'))
);

create index recipes_household_id_updated_at_idx on public.recipes (household_id, updated_at);

-- No delete grant: a recipe is deleted only by delete_recipe (spec 0008, E2), so every deletion
-- keeps the meal plan consistent and can be undone. Deleting the household still cascades.
grant select on public.recipes to authenticated;
grant insert (id, household_id, title, photo, photo_path, description, servings, total_minutes, course, cuisine, tags,
              variants, ingredients, steps, lead_time, notes, last_cooked_on, cooked_count, source)
  on public.recipes to authenticated;
grant update (title, photo, photo_path, description, servings, total_minutes, course, cuisine, tags,
              variants, ingredients, steps, lead_time, notes, last_cooked_on, cooked_count, source)
  on public.recipes to authenticated;
select private.attach_household_policies('public.recipes');
select private.attach_sync_triggers('public.recipes');

-- Before insert, or update of ingredients, for each row (spec 0007, REQ-001): every ingredient is
-- an object whose articleId is the canonical (lower-case) UUID of an article of the recipe's
-- household, and whose optional prepNote ("Hinweis") is text of at most 200 characters. Other keys
-- are the client's (core RecipeIngredient) and not checked here. Anything else is
-- ingredient_article_invalid (23503) and the whole statement fails. The articles are read
-- `for key share`, so delete_article and merge_articles (`for update`) cannot remove one while
-- this change is in flight. Security invoker: an article of another household is not visible and
-- counts as missing. Deleting a household or an article never fires this trigger.
create function private.check_recipe_ingredients()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_article_ids uuid[];
  v_found integer;
begin
  if exists (
    select 1 from jsonb_array_elements(new.ingredients) e
    where jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e -> 'articleId') is distinct from 'string'
       or (e ->> 'articleId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (e ? 'prepNote' and (jsonb_typeof(e -> 'prepNote') <> 'string' or char_length(e ->> 'prepNote') > 200))
  ) then
    raise exception 'ingredient_article_invalid' using errcode = '23503';
  end if;

  v_article_ids := array(select distinct (e ->> 'articleId')::uuid from jsonb_array_elements(new.ingredients) e);
  select count(*)::integer into v_found
  from (
    select a.id from public.articles a
    where a.household_id = new.household_id and a.id = any (v_article_ids)
    for key share
  ) found;
  if v_found <> cardinality(v_article_ids) then
    raise exception 'ingredient_article_invalid' using errcode = '23503';
  end if;
  return new;
end
$$;

create trigger recipes_check_ingredients before insert or update of ingredients on public.recipes
  for each row execute function private.check_recipe_ingredients();

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
  -- 0.5 to 5 in half steps (spec 0011, REQ-004).
  stars numeric(2,1) not null
    constraint recipe_ratings_stars_valid check (stars between 0.5 and 5 and stars * 2 = trunc(stars * 2)),
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

-- Sets the caller's rating (0.5–5 stars in half steps) or removes it (null). Always writes, also
-- the same value again, so updated_at says when the caller last rated ("Wie war's?", spec 0011,
-- Offene Frage 7). The restaurant and activity ratings follow the same rules.
create function private.set_recipe_rating(p_recipe_id uuid, p_stars numeric)
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
  elsif not (p_stars between 0.5 and 5 and p_stars * 2 = trunc(p_stars * 2)) then
    -- Checked before the value meets numeric(2,1), which would round 4.25 to 4.3 silently.
    raise exception 'invalid_stars' using errcode = '22023';
  else
    insert into public.recipe_ratings as r (household_id, recipe_id, member_id, stars)
    values (v_household_id, p_recipe_id, auth.uid(), p_stars)
    on conflict (household_id, recipe_id, member_id) do update
      set stars = excluded.stars;
  end if;
end
$$;

grant execute on function private.set_recipe_favorite(uuid, boolean) to authenticated;
grant execute on function private.set_recipe_rating(uuid, numeric) to authenticated;

create function public.set_recipe_favorite(recipe_id uuid, favorite boolean)
returns void
language sql
set search_path = ''
as $$ select private.set_recipe_favorite($1, $2) $$;

create function public.set_recipe_rating(recipe_id uuid, stars numeric)
returns void
language sql
set search_path = ''
as $$ select private.set_recipe_rating($1, $2) $$;

grant execute on function public.set_recipe_favorite(uuid, boolean) to authenticated;
grant execute on function public.set_recipe_rating(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Deleting a recipe and "Rückgängig" (spec 0008, REQ-012, plan E1–E6)
-- ---------------------------------------------------------------------------------------------

-- The snapshot delete_recipe keeps for restore_recipe: the recipe row, its ratings and favourites,
-- the old values of the plan entries it turned into free text and the removed plan entries in
-- full. Only the server reads it (ratings of others must not come from a device): schema private,
-- RLS on without policies, no grants, not synced. One snapshot per recipe; deleting the same id
-- again replaces it. Kept for 1 hour: purged by every delete_recipe of the household and nightly.
create table private.recipe_deletions (
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null,
  deleted_by uuid not null,
  deleted_at timestamptz not null default now(),
  snapshot jsonb not null,
  primary key (household_id, recipe_id)
);

create index recipe_deletions_deleted_at_idx on private.recipe_deletions (deleted_at);

alter table private.recipe_deletions enable row level security;
revoke all on private.recipe_deletions from public, anon, authenticated;

-- "Löschen" (AC-043). p_today is the device's date as the UI shows it; only current_date ± 1 day
-- is accepted. In one transaction:
-- * the recipe is locked first, then its plan entries (a concurrent "Einplanen" waits for the
--   lock and then fails its foreign key with 23503, E6); no article is locked;
-- * expired snapshots of the household are purged, then the snapshot is written;
-- * entries up to and including p_today become free text with the title (leftovers: "Reste von
--   <title>"), recipe_id null, variants []; eaters, portions, cook and "nicht gekocht" stay;
-- * later and "vorgemerkt" (date null) entries are deleted;
-- * the recipe is deleted; ratings and favourites go by cascade (with tombstones).
-- Shopping contributions are not touched (their source names the recipe as text, spec 0006).
-- Returns {"converted": n, "removed": m}.
-- Errors: not_authenticated (42501), recipe_not_found (P0002, also for another household's
-- recipe), invalid_value (22023, p_today missing or more than one day off).
create function private.delete_recipe(p_recipe_id uuid, p_today date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := private.my_recipe_household_id(p_recipe_id);
  v_recipe public.recipes;
  v_converted jsonb;
  v_removed jsonb;
begin
  if p_today is null or p_today not between current_date - 1 and current_date + 1 then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  select r.* into v_recipe
  from public.recipes r
  where r.household_id = v_household_id and r.id = p_recipe_id
  for update;
  if not found then
    -- Deleted by someone else while this call waited for the lock.
    raise exception 'recipe_not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.meal_plan_entries e
  where e.household_id = v_household_id and e.recipe_id = p_recipe_id
  for update;

  delete from private.recipe_deletions d
  where d.household_id = v_household_id and d.deleted_at <= now() - interval '1 hour';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'kind', e.kind, 'recipe_id', e.recipe_id, 'text', e.text, 'variants', e.variants,
           'new_text', case when e.kind = 'leftovers' then 'Reste von ' || v_recipe.title else v_recipe.title end)
           order by e.id) filter (where e.date <= p_today), '[]'),
         coalesce(jsonb_agg(to_jsonb(e) order by e.id) filter (where e.date is null or e.date > p_today), '[]')
  into v_converted, v_removed
  from public.meal_plan_entries e
  where e.household_id = v_household_id and e.recipe_id = p_recipe_id;

  insert into private.recipe_deletions as d (household_id, recipe_id, deleted_by, deleted_at, snapshot)
  values (v_household_id, p_recipe_id, auth.uid(), now(), jsonb_build_object(
    'recipe', to_jsonb(v_recipe),
    'ratings', (select coalesce(jsonb_agg(jsonb_build_object('member_id', r.member_id, 'stars', r.stars)), '[]')
                from public.recipe_ratings r
                where r.household_id = v_household_id and r.recipe_id = p_recipe_id),
    'favorites', (select coalesce(jsonb_agg(f.member_id), '[]')
                  from public.recipe_favorites f
                  where f.household_id = v_household_id and f.recipe_id = p_recipe_id),
    'converted', v_converted,
    'removed', v_removed))
  on conflict (household_id, recipe_id) do update
    set deleted_by = excluded.deleted_by, deleted_at = excluded.deleted_at, snapshot = excluded.snapshot;

  update public.meal_plan_entries e
  set kind = 'text', recipe_id = null, variants = '[]', text = c.new_text
  from jsonb_to_recordset(v_converted) c (id uuid, new_text text)
  where e.household_id = v_household_id and e.id = c.id;

  delete from public.meal_plan_entries e
  where e.household_id = v_household_id
    and e.id in (select (x ->> 'id')::uuid from jsonb_array_elements(v_removed) x);

  delete from public.recipes r where r.household_id = v_household_id and r.id = p_recipe_id;

  return jsonb_build_object('converted', jsonb_array_length(v_converted), 'removed', jsonb_array_length(v_removed));
end
$$;

-- "Rückgängig" (AC-044): only for the person who deleted, while she is a member of the household,
-- and within 1 hour of the deletion; the device sends only the id. In one transaction:
-- * the recipe comes back with the same id (photo_path included); the ingredient check runs again;
-- * ratings and favourites of people who are still members;
-- * the removed entries (existing ids are left alone), eaters only current members, the cook
--   cleared if no longer a member, a leftovers link cleared if its source is gone;
-- * the free-text entries become recipe entries again, but only while they are still unchanged
--   free text with the text delete_recipe wrote;
-- * the snapshot is deleted.
-- Returns true, or false (and changes nothing) when the recipe exists again already.
-- Errors: not_authenticated (42501), recipe_not_restorable (P0002: no snapshot of the caller in
-- one of her households, older than 1 hour, or already restored), plus whatever a check raises
-- when an article or a meal slot is gone in between (e.g. ingredient_article_invalid, invalid_slot,
-- 23503) — then nothing is restored.
create function private.restore_recipe(p_recipe_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deletion private.recipe_deletions;
  v_snapshot jsonb;
  v_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select d.* into v_deletion
  from private.recipe_deletions d
  join public.household_members m on m.household_id = d.household_id and m.profile_id = auth.uid()
  where d.recipe_id = p_recipe_id and d.deleted_by = auth.uid() and d.deleted_at > now() - interval '1 hour'
  for update of d;
  if not found then
    raise exception 'recipe_not_restorable' using errcode = 'P0002';
  end if;
  v_snapshot := v_deletion.snapshot;
  v_household_id := v_deletion.household_id;

  if exists (select 1 from public.recipes r where r.id = p_recipe_id) then
    return false;
  end if;

  insert into public.recipes (id, household_id, title, photo, photo_path, description, servings, total_minutes,
                              course, cuisine, tags, variants, ingredients, steps, lead_time, notes, last_cooked_on,
                              cooked_count, source)
  select r.id, v_household_id, r.title, r.photo, r.photo_path, r.description, r.servings, r.total_minutes,
         r.course, r.cuisine, r.tags, r.variants, r.ingredients, r.steps, r.lead_time, r.notes, r.last_cooked_on,
         r.cooked_count, r.source
  from jsonb_populate_record(null::public.recipes, v_snapshot -> 'recipe') r;

  insert into public.recipe_ratings (household_id, recipe_id, member_id, stars)
  select v_household_id, p_recipe_id, x.member_id, x.stars
  from jsonb_to_recordset(v_snapshot -> 'ratings') x (member_id uuid, stars numeric)
  where exists (select 1 from public.household_members m
                where m.household_id = v_household_id and m.profile_id = x.member_id);

  insert into public.recipe_favorites (household_id, recipe_id, member_id)
  select v_household_id, p_recipe_id, x.member_id
  from jsonb_array_elements_text(v_snapshot -> 'favorites') f (member_id_text)
  cross join lateral (select f.member_id_text::uuid as member_id) x
  where exists (select 1 from public.household_members m
                where m.household_id = v_household_id and m.profile_id = x.member_id);

  insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, restaurant_id, activity_id,
                                        text, note, leftovers_of_entry_id, eater_ids, guests, portions, variants,
                                        cook_id, sort, not_cooked)
  select e.id, v_household_id, e.date, e.slot_id, e.kind, e.recipe_id, e.restaurant_id, e.activity_id,
         e.text, e.note,
         case when e.leftovers_of_entry_id is null
                or exists (select 1 from public.meal_plan_entries s
                           where s.household_id = v_household_id and s.id = e.leftovers_of_entry_id)
                or exists (select 1 from jsonb_array_elements(v_snapshot -> 'removed') s
                           where (s ->> 'id')::uuid = e.leftovers_of_entry_id)
              then e.leftovers_of_entry_id end,
         array(select u.id from unnest(e.eater_ids) with ordinality u (id, ord)
               where exists (select 1 from public.household_members m
                             where m.household_id = v_household_id and m.profile_id = u.id)
               order by u.ord),
         e.guests, e.portions, e.variants,
         case when exists (select 1 from public.household_members m
                           where m.household_id = v_household_id and m.profile_id = e.cook_id)
              then e.cook_id end,
         e.sort, e.not_cooked
  from jsonb_populate_recordset(null::public.meal_plan_entries, v_snapshot -> 'removed') e
  on conflict (id) do nothing;

  update public.meal_plan_entries e
  set kind = c.kind, recipe_id = c.recipe_id, text = c.text, variants = c.variants
  from jsonb_to_recordset(v_snapshot -> 'converted') c (id uuid, kind text, recipe_id uuid, text text, variants jsonb,
                                                        new_text text)
  where e.household_id = v_household_id and e.id = c.id
    and e.kind = 'text' and e.recipe_id is null and e.text = c.new_text;

  delete from private.recipe_deletions d
  where d.household_id = v_household_id and d.recipe_id = p_recipe_id;
  return true;
end
$$;

grant execute on function private.delete_recipe(uuid, date) to authenticated;
grant execute on function private.restore_recipe(uuid) to authenticated;

create function public.delete_recipe(recipe_id uuid, today date)
returns jsonb
language sql
set search_path = ''
as $$ select private.delete_recipe($1, $2) $$;

create function public.restore_recipe(recipe_id uuid)
returns boolean
language sql
set search_path = ''
as $$ select private.restore_recipe($1) $$;

grant execute on function public.delete_recipe(uuid, date) to authenticated;
grant execute on function public.restore_recipe(uuid) to authenticated;

-- Retention: a snapshot older than 1 hour can no longer be restored.
create function private.purge_recipe_deletions()
returns void
language sql
set search_path = ''
as $$
  delete from private.recipe_deletions where deleted_at <= now() - interval '1 hour';
$$;

select cron.schedule('purge-recipe-deletions', '20 3 * * *', 'select private.purge_recipe_deletions()');
