-- Baseline (ADR-0012) — recipes, plus per-person favourites and ratings, collections and the
-- recipes they contain (spec 0009), and deleting a recipe with "Rückgängig" (spec 0008).
--
-- A collection ("Sammlung", spec 0009) is a row of recipes with kind 'collection': rating,
-- favourite, photo, planning and deleting work as for a recipe. The kind is set on insert and never
-- changes, and a collection has none of the recipe fields (check recipes_kind_fields).
-- collection_recipes holds the recipes a collection contains.
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
  -- 'recipe' or 'collection' (spec 0009, E2). Insert only: no update grant, not in the patch
  -- allowlist of apply_changes, and the trigger recipes_kind_immutable for every other path.
  kind text not null default 'recipe'
    constraint recipes_kind_valid check (kind in ('recipe', 'collection')),
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
  -- Null only for a collection (recipes_kind_fields); the default is for recipes, so a collection
  -- is inserted with course null.
  course text default 'main'
    constraint recipes_course_valid check (course in ('breakfast', 'main', 'side', 'dessert', 'snack', 'drink')),
  cuisine text
    constraint recipes_cuisine_length check (char_length(cuisine) <= 80),
  tags text[] not null default '{}'
    constraint recipes_tags_size check (cardinality(tags) <= 30 and char_length(array_to_string(tags, '')) <= 1000),
  -- Each variant is an object with a name of 1–60 characters (spec 0008, E8); other keys are the
  -- client's (core RecipeVariant). At most 20 variants and 20 000 bytes.
  variants jsonb not null default '[]'
    constraint recipes_variants_valid check (
      case
        when jsonb_typeof(variants) = 'array' then
          jsonb_array_length(variants) <= 20
          and octet_length(variants::text) <= 20000
          and not jsonb_path_exists(
            variants, '$[*] ? (!(@.type() == "object" && @.name.type() == "string" && @.name like_regex "^.{1,60}$"))')
        else false
      end
    ),
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
                  || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')),
  -- A recipe has a course. A collection has no course, time, cuisine, tags, variants, steps or lead
  -- time, and no own ingredient names a variant (spec 0009, E3).
  constraint recipes_kind_fields check (
    case kind
      when 'recipe' then course is not null
      when 'collection' then
        course is null and total_minutes is null and cuisine is null and tags = '{}' and variants = '[]'
        and steps = '[]' and lead_time is null
        and not jsonb_path_exists(ingredients, '$[*] ? (@.variantId != null)')
      else true
    end)
);

create index recipes_household_id_updated_at_idx on public.recipes (household_id, updated_at);

-- No delete grant: a recipe is deleted only by delete_recipe (spec 0008, E2), so every deletion
-- keeps the meal plan consistent and can be undone. Deleting the household still cascades.
grant select on public.recipes to authenticated;
grant insert (id, household_id, kind, title, photo, photo_path, description, servings, total_minutes, course, cuisine,
              tags, variants, ingredients, steps, lead_time, notes, last_cooked_on, cooked_count, source)
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

-- Before update of kind, for each row (spec 0009, E2): the kind never changes, for any role. A
-- member cannot update the column at all (no grant); this covers the security definer paths and
-- the superuser, so a recipe can never become a collection and slip past check_collection_recipe.
create function private.recipes_kind_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'kind_immutable' using errcode = '22023';
  end if;
  return new;
end
$$;

create trigger recipes_kind_immutable before update of kind on public.recipes
  for each row execute function private.recipes_kind_immutable();

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
-- collection_recipes (spec 0009, E4; glossary "Enthaltenes Rezept")
-- ---------------------------------------------------------------------------------------------

-- One row per recipe a collection contains. servings null = as many as the collection, variant_id
-- null = the recipe's default variant (a variant the recipe no longer has counts as the default,
-- Offene Frage 4). A recipe is at most once in a collection. Both links are composite foreign keys
-- into the row's household, so nothing crosses households (23503, AC-011). Deleting the
-- collection or the recipe deletes the row (with a tombstone); delete_recipe keeps the rows in its
-- snapshot for "Rückgängig". collection_id and recipe_id never change (no update grant).
create table public.collection_recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  collection_id uuid not null,
  recipe_id uuid not null,
  servings integer
    constraint collection_recipes_servings_valid check (servings between 1 and 100),
  variant_id text
    constraint collection_recipes_variant_id_valid check (char_length(variant_id) between 1 and 64),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_recipes_household_id_id_key unique (household_id, id),
  constraint collection_recipes_recipe_once unique (household_id, collection_id, recipe_id),
  constraint collection_recipes_collection_fkey foreign key (household_id, collection_id)
    references public.recipes (household_id, id) on delete cascade,
  constraint collection_recipes_recipe_fkey foreign key (household_id, recipe_id)
    references public.recipes (household_id, id) on delete cascade
);

create index collection_recipes_household_id_updated_at_idx on public.collection_recipes (household_id, updated_at);
-- "In which collections is this recipe?" and the foreign key on recipe_id; the collection side
-- is covered by collection_recipes_recipe_once.
create index collection_recipes_household_id_recipe_id_idx on public.collection_recipes (household_id, recipe_id);

grant select, delete on public.collection_recipes to authenticated;
grant insert (id, household_id, collection_id, recipe_id, servings, variant_id, sort)
  on public.collection_recipes to authenticated;
grant update (servings, variant_id, sort) on public.collection_recipes to authenticated;
select private.attach_household_policies('public.collection_recipes');
select private.attach_sync_triggers('public.collection_recipes');

-- Before insert, for each row (spec 0009, E4, AC-009, E15): the container is a collection and the
-- contained row is a recipe (so a collection never contains a collection or itself), and a
-- collection holds at most 50 recipes. Both rows are read in the household of the new row. If one
-- is missing (another household's, or deleted) the trigger lets the foreign key fail with 23503,
-- so it reveals nothing about other rows. Security invoker: RLS applies as for the caller. Checked
-- on insert only, because the kind is immutable and the links cannot be updated. Two concurrent
-- inserts may end slightly above 50; accepted, the limit guards against faulty clients only.
-- Errors: collection_recipe_kind_invalid (23514), too_many_collection_recipes (23514).
create function private.check_collection_recipe()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_collection_kind text;
  v_recipe_kind text;
begin
  select r.kind into v_collection_kind
  from public.recipes r
  where r.household_id = new.household_id and r.id = new.collection_id;
  select r.kind into v_recipe_kind
  from public.recipes r
  where r.household_id = new.household_id and r.id = new.recipe_id;
  if v_collection_kind is null or v_recipe_kind is null then
    return new;
  end if;
  if v_collection_kind <> 'collection' or v_recipe_kind <> 'recipe' then
    raise exception 'collection_recipe_kind_invalid' using errcode = '23514';
  end if;
  if (select count(*) from public.collection_recipes c
      where c.household_id = new.household_id and c.collection_id = new.collection_id) >= 50 then
    raise exception 'too_many_collection_recipes' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger collection_recipes_check before insert on public.collection_recipes
  for each row execute function private.check_collection_recipe();

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
-- the old values of the plan entries it turned into free text, the removed plan entries in full
-- and its collection_recipes rows in full (as collection and as contained recipe, spec 0009). Only the server reads it (ratings of others must not come from a device): schema private,
-- RLS on without policies, no grants, not synced. One snapshot per recipe; deleting the same id
-- again replaces it. Kept for 1 hour: purged by every delete_recipe of the household and hourly.
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
-- * the recipe is locked first, then its plan entries, then its collection_recipes rows (as
--   collection and as contained recipe), then the leftovers without a recipe that go with removed
--   entries (a concurrent "Einplanen", "Reste" or putting it into a collection waits for the lock
--   and then fails its foreign key with 23503, E6; spec 0009, E11); no article is locked;
-- * expired snapshots of the household are purged, then the snapshot is written;
-- * entries up to and including p_today become free text with the title (leftovers: "Reste von
--   <title>"), recipe_id null, variants []; eaters, portions, cook and "nicht gekocht" stay;
-- * later and "vorgemerkt" (date null) entries are deleted, and with them leftovers that name no
--   recipe and point to a deleted entry (also leftovers of those): without dish and recipe they
--   would break meal_plan_entries_kind_complete once their link is cleared;
-- * the recipe is deleted; ratings, favourites and collection_recipes rows go by cascade (with
--   tombstones). Deleting a collection leaves the recipes it contains alone.
-- Shopping contributions are not touched (their source names the recipe as text, spec 0006).
-- Returns {"converted": n, "removed": m, "collections": k}, k = the number of collections of the
-- household the recipe was removed from (0 for a collection).
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
  v_removed_ids uuid[];
  v_removed jsonb;
  v_collection_recipes jsonb;
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
  select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]')
  into v_collection_recipes
  from (
    select c.* from public.collection_recipes c
    where c.household_id = v_household_id and (c.collection_id = p_recipe_id or c.recipe_id = p_recipe_id)
    for update
  ) c;

  delete from private.recipe_deletions d
  where d.household_id = v_household_id and d.deleted_at <= now() - interval '1 hour';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'kind', e.kind, 'recipe_id', e.recipe_id, 'text', e.text, 'variants', e.variants,
           'new_text', case when e.kind = 'leftovers' then 'Reste von ' || v_recipe.title else v_recipe.title end)
           order by e.id), '[]')
  into v_converted
  from public.meal_plan_entries e
  where e.household_id = v_household_id and e.recipe_id = p_recipe_id and e.date <= p_today;

  v_removed_ids := array(
    with recursive removed (id) as (
      select e.id from public.meal_plan_entries e
      where e.household_id = v_household_id and e.recipe_id = p_recipe_id and (e.date is null or e.date > p_today)
      union
      select l.id from public.meal_plan_entries l
      join removed r on l.leftovers_of_entry_id = r.id
      where l.household_id = v_household_id and l.kind = 'leftovers' and l.recipe_id is null
    )
    select r.id from removed r);
  -- The leftovers found this way have no recipe_id and are not locked yet: lock them before they
  -- go into the snapshot, so a concurrent change cannot slip in between reading and deleting.
  perform 1 from public.meal_plan_entries e
  where e.household_id = v_household_id and e.id = any (v_removed_ids)
  for update;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]')
  into v_removed
  from public.meal_plan_entries e
  where e.household_id = v_household_id and e.id = any (v_removed_ids);

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
    'removed', v_removed,
    'collection_recipes', v_collection_recipes))
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

  return jsonb_build_object(
    'converted', jsonb_array_length(v_converted),
    'removed', jsonb_array_length(v_removed),
    'collections', (select count(*)::integer from jsonb_array_elements(v_collection_recipes) c
                    where (c ->> 'recipe_id')::uuid = p_recipe_id));
end
$$;

-- "Rückgängig" (AC-044): only for the person who deleted, while she is a member of the household,
-- and within 1 hour of the deletion; the device sends only the id. In one transaction:
-- * the recipe comes back with the same id (photo_path and kind included) and its original
--   created_at (trigger recipes_stamp_restored); the ingredient check runs again;
-- * ratings and favourites of people who are still members;
-- * its collection_recipes rows with their ids, servings, variant and order, but only those whose
--   other side (collection or contained recipe) still exists in the household; a row whose recipe
--   is in that collection again by now is left alone (spec 0009, E11). check_collection_recipe runs
--   again: a collection that holds 50 recipes by now makes the whole restore fail;
-- * the removed entries (existing ids are left alone), eaters only current members, the cook
--   cleared if no longer a member, a leftovers link cleared if its source is gone;
-- * the free-text entries become recipe entries again, but only while they are still unchanged
--   free text with the text delete_recipe wrote;
-- * the snapshot is deleted.
-- Returns true, or false (and changes nothing) when the recipe exists again already in the same
-- household (put back by other means).
-- Errors: not_authenticated (42501), recipe_not_restorable (P0002: no snapshot of the caller in
-- one of her households, older than 1 hour, already restored, or the id is taken by a recipe of
-- another household meanwhile), plus whatever a check raises
-- when an article or a meal slot is gone in between (e.g. ingredient_article_invalid, invalid_slot,
-- 23503), a collection is full (too_many_collection_recipes) or a row id is taken in another
-- household meanwhile (23505) — then nothing is restored.
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
  v_existing_household_id uuid;
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

  -- Recipe ids are unique across households. Back in this household: nothing to do. Taken in
  -- another one (e.g. by a former member who saw the id): refused, never reported as success.
  select r.household_id into v_existing_household_id from public.recipes r where r.id = p_recipe_id;
  if v_existing_household_id = v_household_id then
    return false;
  elsif v_existing_household_id is not null then
    raise exception 'recipe_not_restorable' using errcode = 'P0002';
  end if;

  perform pg_catalog.set_config('private.restore_created_at', coalesce(v_snapshot -> 'recipe' ->> 'created_at', ''), true);
  insert into public.recipes (id, household_id, kind, title, photo, photo_path, description, servings, total_minutes,
                              course, cuisine, tags, variants, ingredients, steps, lead_time, notes, last_cooked_on,
                              cooked_count, source)
  select r.id, v_household_id, r.kind, r.title, r.photo, r.photo_path, r.description, r.servings, r.total_minutes,
         r.course, r.cuisine, r.tags, r.variants, r.ingredients, r.steps, r.lead_time, r.notes, r.last_cooked_on,
         r.cooked_count, r.source
  from jsonb_populate_record(null::public.recipes, v_snapshot -> 'recipe') r;
  perform pg_catalog.set_config('private.restore_created_at', '', true);

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

  insert into public.collection_recipes (id, household_id, collection_id, recipe_id, servings, variant_id, sort)
  select c.id, v_household_id, c.collection_id, c.recipe_id, c.servings, c.variant_id, c.sort
  from jsonb_populate_recordset(null::public.collection_recipes, v_snapshot -> 'collection_recipes') c
  where exists (select 1 from public.recipes r
                where r.household_id = v_household_id
                  and r.id = case when c.collection_id = p_recipe_id then c.recipe_id else c.collection_id end)
  order by c.collection_id, c.sort, c.id
  -- Only "already contained again" is skipped. A row id taken in the meantime (ids are unique
  -- across households) fails loudly with 23505 instead of silently dropping the row.
  on conflict (household_id, collection_id, recipe_id) do nothing;

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

-- Before insert of the recipe by restore_recipe: created_at is the original one from the snapshot,
-- handed over in the transaction-local setting private.restore_created_at (at most now()).
-- set_timestamps sets created_at := now() on every insert and keeps it on update, so the value
-- can only be put back here; the name sorts after recipes_set_timestamps (before triggers fire in
-- name order). Never for the API role: a member's insert always gets the server time.
create function private.recipes_stamp_restored()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_created_at text := nullif(pg_catalog.current_setting('private.restore_created_at', true), '');
begin
  if current_user <> 'authenticated' and v_created_at is not null then
    new.created_at := least(v_created_at::timestamptz, now());
  end if;
  return new;
end
$$;

create trigger recipes_stamp_restored before insert on public.recipes
  for each row execute function private.recipes_stamp_restored();

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

-- Retention: a snapshot older than 1 hour can no longer be restored, and holds ratings of others;
-- purged every hour, so none outlives it by more than about an hour.
create function private.purge_recipe_deletions()
returns void
language sql
set search_path = ''
as $$
  delete from private.recipe_deletions where deleted_at <= now() - interval '1 hour';
$$;

select cron.schedule('purge-recipe-deletions', '20 * * * *', 'select private.purge_recipe_deletions()');
