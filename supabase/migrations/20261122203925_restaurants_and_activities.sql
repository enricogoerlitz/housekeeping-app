-- Spec 0024 — restaurants and activities: website, a photo for restaurants, deleting both with
-- "Rückgängig" (critical path: deletion, storage policies, migration). Clean target before the
-- first productively used version (wave 2 rules, docs/specs/README.md): no expand/contract.
--
-- * restaurants.website_url, activities.website_url: optional, checked by private.is_web_url
--   (spec 0023), the same rule packages/core web-link.ts applies on the device (REQ-003).
-- * restaurants.photo_path: the own photo in household-media, like activities:
--   <household_id>/restaurants/<id>/<uuid>.jpg; private.media_household_id allows the folder
--   restaurants (REQ-004). The database never deletes stored files: the app deletes the old file
--   after switching or removing photo_path, and the photo of a deleted restaurant or activity only
--   once its "Rückgängig" expired and the server confirmed the deletion (spec 0008, E5; this
--   replaces "before deleting an activity" in the header of the storage migration).
-- * activities.tags goes (never set by the app).
-- * private.deletions holds the snapshot of every deletion with "Rückgängig" (recipe, restaurant,
--   activity), keyed by household, kind and id; private.recipe_deletions moves into it, and
--   delete_recipe / restore_recipe use it with unchanged behaviour. Only the server reads it
--   (ratings of others): schema private, RLS on without policies, no grants, not synced; kept for
--   1 hour, purged by every deletion of the household and hourly (job purge-deletions instead of
--   purge-recipe-deletions).
-- * delete_restaurant / restore_restaurant, delete_activity / restore_activity (REQ-010): like
--   delete_recipe. Entries up to and including p_today become free text with the name and the
--   Zusatz ("Eislaufen (Halle Nord)"; the time goes, free text has none; the reminder stays), later and "vorgemerkt" entries are deleted, the row is deleted, favourites
--   and ratings go by cascade (with tombstones). "Rückgängig" only for the person who deleted,
--   while a member, within 1 hour.
-- * No delete grant on restaurants and activities any more; apply_changes refuses their delete
--   (allowlist "delete": false) and patches website_url, photo_path and tags (restaurants).

-- ---------------------------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------------------------

alter table public.restaurants
  add column website_url text
    constraint restaurants_website_url_valid check (website_url is null or private.is_web_url(website_url)),
  add column photo_path text,
  add constraint restaurants_photo_path_valid check (
    photo_path ~ ('^' || household_id::text || '/restaurants/' || id::text
                  || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'));

alter table public.activities
  add column website_url text
    constraint activities_website_url_valid check (website_url is null or private.is_web_url(website_url)),
  drop column tags;

revoke delete on public.restaurants from authenticated;
revoke delete on public.activities from authenticated;
grant insert (website_url, photo_path), update (website_url, photo_path) on public.restaurants to authenticated;
grant insert (website_url), update (website_url) on public.activities to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Storage: the folder restaurants
-- ---------------------------------------------------------------------------------------------

-- The household of an object name in household-media, or null if the name is not
-- <household_id>/<activities|recipes|restaurants>/<row id>/<uuid>.jpg. Parses by regex before
-- casting, so no name can make a policy raise.
create or replace function private.media_household_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(activities|recipes|restaurants)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
      then split_part(p_name, '/', 1)::uuid
  end
$$;

-- ---------------------------------------------------------------------------------------------
-- private.deletions (replaces private.recipe_deletions)
-- ---------------------------------------------------------------------------------------------

create table private.deletions (
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null
    constraint deletions_kind_known check (kind in ('recipe', 'restaurant', 'activity')),
  target_id uuid not null,
  deleted_by uuid not null,
  deleted_at timestamptz not null default now(),
  snapshot jsonb not null,
  primary key (household_id, kind, target_id)
);

create index deletions_deleted_at_idx on private.deletions (deleted_at);

alter table private.deletions enable row level security;
revoke all on private.deletions from public, anon, authenticated;

insert into private.deletions (household_id, kind, target_id, deleted_by, deleted_at, snapshot)
select d.household_id, 'recipe', d.recipe_id, d.deleted_by, d.deleted_at, d.snapshot
from private.recipe_deletions d;

select cron.unschedule('purge-recipe-deletions');
drop function private.purge_recipe_deletions();

-- Retention: a snapshot older than 1 hour can no longer be restored and holds ratings of others;
-- purged every hour, so none outlives it by more than about an hour.
create function private.purge_deletions()
returns void
language sql
set search_path = ''
as $$
  delete from private.deletions where deleted_at <= now() - interval '1 hour';
$$;

select cron.schedule('purge-deletions', '20 * * * *', 'select private.purge_deletions()');

-- Before insert of a row put back by a restore function: created_at is the original one from the
-- snapshot, handed over in the transaction-local setting private.restore_created_at (at most
-- now()); like recipes_stamp_restored. The trigger names sort after <table>_set_timestamps
-- (before triggers fire in name order). Never for the API role.
create function private.stamp_restored()
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

create trigger restaurants_stamp_restored before insert on public.restaurants
  for each row execute function private.stamp_restored();
create trigger activities_stamp_restored before insert on public.activities
  for each row execute function private.stamp_restored();

-- ---------------------------------------------------------------------------------------------
-- Shared parts of deleting and restoring
-- ---------------------------------------------------------------------------------------------

-- Puts removed plan entries back as the snapshot holds them (all columns, existing ids left
-- alone): eaters only current members in their order, the cook cleared if no longer a member, a
-- leftovers link cleared if its source is neither there nor among the removed entries.
create function private.restore_plan_entries(p_household_id uuid, p_removed jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.meal_plan_entries
  select (jsonb_populate_record(null::public.meal_plan_entries, e || jsonb_build_object(
    'household_id', p_household_id,
    'leftovers_of_entry_id',
      case when (e ->> 'leftovers_of_entry_id') is null
             or exists (select 1 from public.meal_plan_entries s
                        where s.household_id = p_household_id and s.id = (e ->> 'leftovers_of_entry_id')::uuid)
             or exists (select 1 from jsonb_array_elements(p_removed) s
                        where s ->> 'id' = e ->> 'leftovers_of_entry_id')
           then e -> 'leftovers_of_entry_id' else 'null'::jsonb end,
    'eater_ids', to_jsonb(array(
      select u.id from jsonb_array_elements_text(coalesce(e -> 'eater_ids', '[]')) with ordinality u (id, ord)
      where exists (select 1 from public.household_members m
                    where m.household_id = p_household_id and m.profile_id = u.id::uuid)
      order by u.ord)),
    'cook_id',
      case when exists (select 1 from public.household_members m
                        where m.household_id = p_household_id and m.profile_id = (e ->> 'cook_id')::uuid)
           then e -> 'cook_id' else 'null'::jsonb end))).*
  from jsonb_array_elements(p_removed) e
  on conflict (id) do nothing;
$$;

-- Restaurant and activity entries turned into free text become what they were, but only while
-- they are still unchanged free text with the text the deletion wrote (AC-037).
create function private.restore_converted_entries(p_household_id uuid, p_converted jsonb)
returns void
language sql
set search_path = ''
as $$
  update public.meal_plan_entries e
  set kind = c.kind, restaurant_id = c.restaurant_id, activity_id = c.activity_id, text = c.text, note = c.note,
      reserved_at = c.reserved_at
  from jsonb_populate_recordset(null::public.meal_plan_entries, p_converted) c,
       jsonb_to_recordset(p_converted) n (id uuid, new_text text)
  where n.id = c.id and e.household_id = p_household_id and e.id = c.id
    and e.kind = 'text' and e.recipe_id is null and e.restaurant_id is null and e.activity_id is null
    and e.text = n.new_text and e.note is null;
$$;

-- The deletion of the caller that can still be undone, locked; kind_not_restorable otherwise.
create function private.my_deletion(p_kind text, p_target_id uuid)
returns private.deletions
language plpgsql
set search_path = ''
as $$
declare
  v_deletion private.deletions;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select d.* into v_deletion
  from private.deletions d
  join public.household_members m on m.household_id = d.household_id and m.profile_id = auth.uid()
  where d.kind = p_kind and d.target_id = p_target_id and d.deleted_by = auth.uid()
    and d.deleted_at > now() - interval '1 hour'
  for update of d;
  if not found then
    raise exception '%', p_kind || '_not_restorable' using errcode = 'P0002';
  end if;
  return v_deletion;
end
$$;

-- p_today is the device's date as the UI shows it; only current_date ± 1 day is accepted.
create function private.check_today(p_today date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_today is null or p_today not between current_date - 1 and current_date + 1 then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- delete_recipe / restore_recipe on private.deletions (otherwise unchanged)
-- ---------------------------------------------------------------------------------------------

create or replace function private.delete_recipe(p_recipe_id uuid, p_today date)
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
  perform private.check_today(p_today);

  select r.* into v_recipe
  from public.recipes r
  where r.household_id = v_household_id and r.id = p_recipe_id
  for update;
  if not found then
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

  delete from private.deletions d
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
  perform 1 from public.meal_plan_entries e
  where e.household_id = v_household_id and e.id = any (v_removed_ids)
  for update;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]')
  into v_removed
  from public.meal_plan_entries e
  where e.household_id = v_household_id and e.id = any (v_removed_ids);

  insert into private.deletions as d (household_id, kind, target_id, deleted_by, deleted_at, snapshot)
  values (v_household_id, 'recipe', p_recipe_id, auth.uid(), now(), jsonb_build_object(
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
  on conflict (household_id, kind, target_id) do update
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

create or replace function private.restore_recipe(p_recipe_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deletion private.deletions := private.my_deletion('recipe', p_recipe_id);
  v_snapshot jsonb := v_deletion.snapshot;
  v_household_id uuid := v_deletion.household_id;
  v_existing_household_id uuid;
begin
  select r.household_id into v_existing_household_id from public.recipes r where r.id = p_recipe_id;
  if v_existing_household_id = v_household_id then
    return false;
  elsif v_existing_household_id is not null then
    raise exception 'recipe_not_restorable' using errcode = 'P0002';
  end if;

  perform pg_catalog.set_config('private.restore_created_at', coalesce(v_snapshot -> 'recipe' ->> 'created_at', ''), true);
  insert into public.recipes (id, household_id, kind, title, photo, photo_path, description, servings, total_minutes,
                              course, cuisine, tags, variants, ingredients, steps, lead_time, notes, last_cooked_on,
                              cooked_count, links)
  select r.id, v_household_id, r.kind, r.title, r.photo, r.photo_path, r.description, r.servings, r.total_minutes,
         r.course, r.cuisine, r.tags, r.variants, r.ingredients, r.steps, r.lead_time, r.notes, r.last_cooked_on,
         r.cooked_count, r.links
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
  on conflict (household_id, collection_id, recipe_id) do nothing;

  perform private.restore_plan_entries(v_household_id, v_snapshot -> 'removed');

  update public.meal_plan_entries e
  set kind = c.kind, recipe_id = c.recipe_id, text = c.text, variants = c.variants
  from jsonb_to_recordset(v_snapshot -> 'converted') c (id uuid, kind text, recipe_id uuid, text text, variants jsonb,
                                                        new_text text)
  where e.household_id = v_household_id and e.id = c.id
    and e.kind = 'text' and e.recipe_id is null and e.text = c.new_text;

  delete from private.deletions d
  where d.household_id = v_household_id and d.kind = 'recipe' and d.target_id = p_recipe_id;
  return true;
end
$$;

drop table private.recipe_deletions;

-- ---------------------------------------------------------------------------------------------
-- delete_restaurant / restore_restaurant
-- ---------------------------------------------------------------------------------------------

-- "Löschen" (REQ-010, AC-034). In one transaction: the restaurant is locked first, then its plan
-- entries (a concurrent "Einplanen" waits and then fails its foreign key with 23503); expired
-- snapshots of the household are purged and the snapshot is written; entries up to and including
-- p_today become free text with the name (no time: free text has none), later and "vorgemerkt"
-- ones are deleted; the restaurant is deleted, favourites and ratings by cascade.
-- Returns {"converted": n, "removed": m}.
-- Errors: not_authenticated (42501), restaurant_not_found (P0002, also for another household's),
-- invalid_value (22023, p_today missing or more than one day off).
create function private.delete_restaurant(p_restaurant_id uuid, p_today date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := private.my_restaurant_household_id(p_restaurant_id);
  v_restaurant public.restaurants;
  v_converted jsonb;
  v_removed jsonb;
begin
  perform private.check_today(p_today);

  select r.* into v_restaurant
  from public.restaurants r
  where r.household_id = v_household_id and r.id = p_restaurant_id
  for update;
  if not found then
    raise exception 'restaurant_not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.meal_plan_entries e
  where e.household_id = v_household_id and e.restaurant_id = p_restaurant_id
  for update;

  delete from private.deletions d
  where d.household_id = v_household_id and d.deleted_at <= now() - interval '1 hour';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'kind', e.kind, 'restaurant_id', e.restaurant_id, 'activity_id', e.activity_id,
           'text', e.text, 'note', e.note, 'reserved_at', e.reserved_at,
           'new_text', v_restaurant.name || coalesce(' (' || nullif(e.note, '') || ')', ''))
           order by e.id), '[]')
  into v_converted
  from public.meal_plan_entries e
  where e.household_id = v_household_id and e.restaurant_id = p_restaurant_id and e.date <= p_today;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]')
  into v_removed
  from public.meal_plan_entries e
  where e.household_id = v_household_id and e.restaurant_id = p_restaurant_id
    and (e.date is null or e.date > p_today);

  insert into private.deletions as d (household_id, kind, target_id, deleted_by, deleted_at, snapshot)
  values (v_household_id, 'restaurant', p_restaurant_id, auth.uid(), now(), jsonb_build_object(
    'restaurant', to_jsonb(v_restaurant),
    'ratings', (select coalesce(jsonb_agg(jsonb_build_object('member_id', r.member_id, 'stars', r.stars)), '[]')
                from public.restaurant_ratings r
                where r.household_id = v_household_id and r.restaurant_id = p_restaurant_id),
    'favorites', (select coalesce(jsonb_agg(f.member_id), '[]')
                  from public.restaurant_favorites f
                  where f.household_id = v_household_id and f.restaurant_id = p_restaurant_id),
    'converted', v_converted,
    'removed', v_removed))
  on conflict (household_id, kind, target_id) do update
    set deleted_by = excluded.deleted_by, deleted_at = excluded.deleted_at, snapshot = excluded.snapshot;

  update public.meal_plan_entries e
  set kind = 'text', restaurant_id = null, reserved_at = null, note = null, text = c.new_text
  from jsonb_to_recordset(v_converted) c (id uuid, new_text text)
  where e.household_id = v_household_id and e.id = c.id;

  delete from public.meal_plan_entries e
  where e.household_id = v_household_id
    and e.id in (select (x ->> 'id')::uuid from jsonb_array_elements(v_removed) x);

  delete from public.restaurants r where r.household_id = v_household_id and r.id = p_restaurant_id;

  return jsonb_build_object('converted', jsonb_array_length(v_converted), 'removed', jsonb_array_length(v_removed));
end
$$;

-- "Rückgängig" (AC-035, AC-037, AC-038): only for the person who deleted, while she is a member,
-- within 1 hour. The restaurant comes back with the same id and its original created_at, with
-- the ratings and favourites of people who are still members, the removed entries and the free
-- text entries that are still unchanged. Returns true, or false when the restaurant exists again
-- in the same household. Errors: not_authenticated (42501), restaurant_not_restorable (P0002; also
-- when the id is taken in another household meanwhile), plus whatever a check raises.
create function private.restore_restaurant(p_restaurant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deletion private.deletions := private.my_deletion('restaurant', p_restaurant_id);
  v_snapshot jsonb := v_deletion.snapshot;
  v_household_id uuid := v_deletion.household_id;
  v_existing_household_id uuid;
begin
  select r.household_id into v_existing_household_id from public.restaurants r where r.id = p_restaurant_id;
  if v_existing_household_id = v_household_id then
    return false;
  elsif v_existing_household_id is not null then
    raise exception 'restaurant_not_restorable' using errcode = 'P0002';
  end if;

  perform pg_catalog.set_config('private.restore_created_at',
                                coalesce(v_snapshot -> 'restaurant' ->> 'created_at', ''), true);
  insert into public.restaurants (id, household_id, name, address, lat, lng, maps_url, cuisine, price_level, tags,
                                  notes, website_url, photo_path)
  select r.id, v_household_id, r.name, r.address, r.lat, r.lng, r.maps_url, r.cuisine, r.price_level, r.tags,
         r.notes, r.website_url, r.photo_path
  from jsonb_populate_record(null::public.restaurants, v_snapshot -> 'restaurant') r;
  perform pg_catalog.set_config('private.restore_created_at', '', true);

  insert into public.restaurant_ratings (household_id, restaurant_id, member_id, stars)
  select v_household_id, p_restaurant_id, x.member_id, x.stars
  from jsonb_to_recordset(v_snapshot -> 'ratings') x (member_id uuid, stars numeric)
  where exists (select 1 from public.household_members m
                where m.household_id = v_household_id and m.profile_id = x.member_id);

  insert into public.restaurant_favorites (household_id, restaurant_id, member_id)
  select v_household_id, p_restaurant_id, f.member_id::uuid
  from jsonb_array_elements_text(v_snapshot -> 'favorites') f (member_id)
  where exists (select 1 from public.household_members m
                where m.household_id = v_household_id and m.profile_id = f.member_id::uuid);

  perform private.restore_plan_entries(v_household_id, v_snapshot -> 'removed');
  perform private.restore_converted_entries(v_household_id, v_snapshot -> 'converted');

  delete from private.deletions d
  where d.household_id = v_household_id and d.kind = 'restaurant' and d.target_id = p_restaurant_id;
  return true;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- delete_activity / restore_activity
-- ---------------------------------------------------------------------------------------------

-- Like delete_restaurant (AC-036); the free text carries the Zusatz: "Eislaufen (Halle Nord)".
-- Errors: not_authenticated (42501), activity_not_found (P0002), invalid_value (22023).
create function private.delete_activity(p_activity_id uuid, p_today date)
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
           'text', e.text, 'note', e.note, 'reserved_at', e.reserved_at,
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
    'converted', v_converted,
    'removed', v_removed))
  on conflict (household_id, kind, target_id) do update
    set deleted_by = excluded.deleted_by, deleted_at = excluded.deleted_at, snapshot = excluded.snapshot;

  update public.meal_plan_entries e
  set kind = 'text', activity_id = null, reserved_at = null, note = null, text = c.new_text
  from jsonb_to_recordset(v_converted) c (id uuid, new_text text)
  where e.household_id = v_household_id and e.id = c.id;

  delete from public.meal_plan_entries e
  where e.household_id = v_household_id
    and e.id in (select (x ->> 'id')::uuid from jsonb_array_elements(v_removed) x);

  delete from public.activities a where a.household_id = v_household_id and a.id = p_activity_id;

  return jsonb_build_object('converted', jsonb_array_length(v_converted), 'removed', jsonb_array_length(v_removed));
end
$$;

-- Like restore_restaurant. The creator comes back while she is a member (the insert trigger sets
-- the caller, so it is put back afterwards). A name taken by another activity meanwhile fails the
-- restore (23505) and changes nothing.
create function private.restore_activity(p_activity_id uuid)
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

  perform pg_catalog.set_config('private.restore_created_at',
                                coalesce(v_snapshot -> 'activity' ->> 'created_at', ''), true);
  insert into public.activities (id, household_id, name, name_key, description, photo_path, place_name, address, lat,
                                 lng, maps_url, website_url)
  select a.id, v_household_id, a.name, a.name_key, a.description, a.photo_path, a.place_name, a.address, a.lat,
         a.lng, a.maps_url, a.website_url
  from jsonb_populate_record(null::public.activities, v_snapshot -> 'activity') a;
  perform pg_catalog.set_config('private.restore_created_at', '', true);
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

  perform private.restore_plan_entries(v_household_id, v_snapshot -> 'removed');
  perform private.restore_converted_entries(v_household_id, v_snapshot -> 'converted');

  delete from private.deletions d
  where d.household_id = v_household_id and d.kind = 'activity' and d.target_id = p_activity_id;
  return true;
end
$$;

grant execute on function private.delete_restaurant(uuid, date) to authenticated;
grant execute on function private.restore_restaurant(uuid) to authenticated;
grant execute on function private.delete_activity(uuid, date) to authenticated;
grant execute on function private.restore_activity(uuid) to authenticated;

create function public.delete_restaurant(restaurant_id uuid, today date)
returns jsonb
language sql
set search_path = ''
as $$ select private.delete_restaurant($1, $2) $$;

create function public.restore_restaurant(restaurant_id uuid)
returns boolean
language sql
set search_path = ''
as $$ select private.restore_restaurant($1) $$;

create function public.delete_activity(activity_id uuid, today date)
returns jsonb
language sql
set search_path = ''
as $$ select private.delete_activity($1, $2) $$;

create function public.restore_activity(activity_id uuid)
returns boolean
language sql
set search_path = ''
as $$ select private.restore_activity($1) $$;

grant execute on function public.delete_restaurant(uuid, date) to authenticated;
grant execute on function public.restore_restaurant(uuid) to authenticated;
grant execute on function public.delete_activity(uuid, date) to authenticated;
grant execute on function public.restore_activity(uuid) to authenticated;

-- >>> apply_changes
-- ---------------------------------------------------------------------------------------------
-- apply_changes: website_url, photo_path; no delete of restaurants and activities (otherwise
-- unchanged from 20261122192741_recipe_links_and_non_food)
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
  -- set_packing_items_packed and restore_packing_items; a packing item's name, quantity, "je Tag"
  -- and link to its Reisetasche are patched (spec 0022, REQ-009).
  -- A trip keeps its people in trip_members, which are only inserted and deleted; a bag of a
  -- packing list stays at its trip (spec 0022, Daten).
  -- Notification settings rows are created by the server and only patched, and RLS lets a member
  -- patch only her own row (spec 0013, Decision 3). households.timezone is never written (D16).
  -- Restaurants and activities are deleted only by delete_restaurant / delete_activity (spec 0024).
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
                                    "steps", "lead_time", "notes", "last_cooked_on", "cooked_count", "links"],
                         "patch":  ["title", "photo", "photo_path", "description", "servings", "total_minutes", "course",
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
    "packing_items":    {"insert": ["id", "household_id", "list_bag_id", "name", "quantity", "per_day", "sort",
                                    "bag_item_id", "from_bag"],
                         "patch":  ["name", "quantity", "per_day", "bag_item_id", "from_bag"], "delete": true},
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
  -- every entry of add_contributions, every item of restore_packing_items and every element of
  -- adopt_bag_changes is an op (its deletes count as deletes). The
  -- contributions of all entries are capped too.
  -- complete_chore counts as a delete: done of a one-off chore deletes it, which is known only
  -- once the chore is locked.
  select coalesce(sum(case when o ->> 'kind' = 'remove_contributions' and jsonb_typeof(o -> 'ids') = 'array'
                             then greatest(jsonb_array_length(o -> 'ids'), 1)
                           when o ->> 'kind' = 'add_contributions' and jsonb_typeof(o -> 'entries') = 'array'
                             then greatest(jsonb_array_length(o -> 'entries'), 1)
                           when o ->> 'kind' = 'restore_packing_items' and jsonb_typeof(o -> 'items') = 'array'
                             then greatest(jsonb_array_length(o -> 'items'), 1)
                           when o ->> 'kind' = 'adopt_bag_changes' and jsonb_typeof(o -> 'change') = 'object'
                             then greatest(coalesce(jsonb_array_length(case when jsonb_typeof(o -> 'change' -> 'insert') = 'array' then o -> 'change' -> 'insert' end), 0)
                                           + coalesce(jsonb_array_length(case when jsonb_typeof(o -> 'change' -> 'update') = 'array' then o -> 'change' -> 'update' end), 0)
                                           + coalesce(jsonb_array_length(case when jsonb_typeof(o -> 'change' -> 'delete') = 'array' then o -> 'change' -> 'delete' end), 0), 1)
                           else 1 end), 0),
         count(*) filter (where o ->> 'kind' in ('delete', 'complete_chore', 'remove_chore_event'))
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
-- <<< apply_changes
