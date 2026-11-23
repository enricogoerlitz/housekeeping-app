-- Spec 0031, REQ-013 (D-02) — one way to keep created_at when a restore puts a row back:
-- set_timestamps with the transaction setting housekeeping.keep_created_at (spec 0025), which only
-- the function owner (postgres) can use. restore_recipe, restore_restaurant and restore_activity
-- set it around their insert and name the snapshot's created_at; the triggers
-- recipes/restaurants/activities_stamp_restored, their functions and the setting
-- private.restore_created_at go. Everything else of the three functions is unchanged (restore_recipe
-- from 20261122213200_delete_recipe_with_list, the other two from 20261122212500).

drop trigger recipes_stamp_restored on public.recipes;
drop trigger restaurants_stamp_restored on public.restaurants;
drop trigger activities_stamp_restored on public.activities;
drop function private.recipes_stamp_restored();
drop function private.stamp_restored();

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

  perform pg_catalog.set_config('housekeeping.keep_created_at', 'on', true);
  insert into public.recipes (id, household_id, kind, title, photo, photo_path, description, servings, total_minutes,
                              course, cuisine, tags, variants, ingredients, steps, lead_time, notes, last_cooked_on,
                              cooked_count, links, created_at)
  select r.id, v_household_id, r.kind, r.title, r.photo, r.photo_path, r.description, r.servings, r.total_minutes,
         r.course, r.cuisine, r.tags, r.variants, r.ingredients, r.steps, r.lead_time, r.notes, r.last_cooked_on,
         r.cooked_count, r.links, r.created_at
  from jsonb_populate_record(null::public.recipes, v_snapshot -> 'recipe') r;
  perform pg_catalog.set_config('housekeeping.keep_created_at', 'off', true);

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

  -- The ingredients taken off the list with the recipe come back (spec 0023, Decision 15).
  if jsonb_array_length(coalesce(v_snapshot -> 'list', '[]')) > 0 then
    perform private.restore_cleared_items(v_household_id, v_snapshot -> 'list');
  end if;

  delete from private.deletions d
  where d.household_id = v_household_id and d.kind = 'recipe' and d.target_id = p_recipe_id;
  return true;
end
$$;

create or replace function private.restore_restaurant(p_restaurant_id uuid)
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

  perform pg_catalog.set_config('housekeeping.keep_created_at', 'on', true);
  insert into public.restaurants (id, household_id, name, address, lat, lng, maps_url, cuisine, price_level, tags,
                                  notes, website_url, photo_path, created_at)
  select r.id, v_household_id, r.name, r.address, r.lat, r.lng, r.maps_url, r.cuisine, r.price_level, r.tags,
         r.notes, r.website_url, r.photo_path, r.created_at
  from jsonb_populate_record(null::public.restaurants, v_snapshot -> 'restaurant') r;
  perform pg_catalog.set_config('housekeeping.keep_created_at', 'off', true);

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
                                 lng, maps_url, website_url, created_at)
  select a.id, v_household_id, a.name, a.name_key, a.description, a.photo_path, a.place_name, a.address, a.lat,
         a.lng, a.maps_url, a.website_url, a.created_at
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

  perform private.restore_plan_entries(v_household_id, v_snapshot -> 'removed');
  perform private.restore_converted_entries(v_household_id, v_snapshot -> 'converted');

  delete from private.deletions d
  where d.household_id = v_household_id and d.kind = 'activity' and d.target_id = p_activity_id;
  return true;
end
$$;
