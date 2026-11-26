-- Spec 0046 "Rezept-Mediengalerie mit mehreren Videos".
--
-- * recipes.videos: the recipe's videos in the order they were saved, a list of
--   {path, url?, poster?}: path names the MP4 in household-videos
--   (<household_id>/recipes/<recipe id>/<uuid>.mp4, spec 0043), url the link it came from, poster
--   its still in household-media (<household_id>/recipes/<recipe id>/<uuid>.jpg, like a photo).
--   At most 10, each path and each url once, only for kind = 'recipe' (recipes_videos_valid).
--   Synced like every recipe column; restore_recipe brings it back with the recipe.
-- * Written only through add_recipe_video (fetch-video as the caller), set_recipe_video_poster
--   and remove_recipe_video (the app): security definer, each checks the caller's membership and
--   touches only the recipe of that household, and the check decides the shape. Each changes the
--   list in one statement, so two devices saving two links at once lose nothing. No column grant,
--   not in the allowlist of apply_changes.
-- * video_path (spec 0043) is carried over into videos and from now on only null
--   (expand → migrate → contract, spec 0046 Entscheidung 5): the column and its allowlist entry
--   stay until every branch of batch 3 is on develop, because those still send it on insert.
-- * The nightly sweep reads videos: video_orphans keeps every video a recipe or a restorable
--   deletion names, media_orphans every poster they name.
-- Breaking only for the unreleased spec 0043 (video_path); the bucket layout is unchanged.

-- ---------------------------------------------------------------------------------------------
-- recipes.videos
-- ---------------------------------------------------------------------------------------------

-- True for a valid list of videos of the recipe p_recipe_id of p_household_id (see the header).
-- Plpgsql, so each element is checked for its type before it is read.
create function private.recipe_videos_valid(p_videos jsonb, p_kind text, p_household_id uuid, p_recipe_id uuid)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- Only hex digits, '-' and '/': safe to put into a pattern.
  v_folder text := '^' || p_household_id::text || '/recipes/' || p_recipe_id::text
                   || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.';
  v_video jsonb;
  v_paths text[] := '{}';
  v_urls text[] := '{}';
begin
  if jsonb_typeof(p_videos) is distinct from 'array' or jsonb_array_length(p_videos) > 10 then
    return false;
  end if;
  if jsonb_array_length(p_videos) > 0 and p_kind is distinct from 'recipe' then
    return false;
  end if;
  for v_video in select e.value from jsonb_array_elements(p_videos) e loop
    -- Its own check first: SQL does not promise to evaluate an OR from left to right.
    if jsonb_typeof(v_video) is distinct from 'object' then
      return false;
    end if;
    if exists (select 1 from jsonb_object_keys(v_video) k where k not in ('path', 'url', 'poster'))
       or jsonb_typeof(v_video -> 'path') is distinct from 'string'
       or (v_video ->> 'path') !~ (v_folder || 'mp4$')
       or (v_video ->> 'path') = any (v_paths) then
      return false;
    end if;
    v_paths := v_paths || (v_video ->> 'path');
    if v_video ? 'url' then
      if jsonb_typeof(v_video -> 'url') is distinct from 'string'
         or not private.is_web_url(v_video ->> 'url')
         or (v_video ->> 'url') = any (v_urls) then
        return false;
      end if;
      v_urls := v_urls || (v_video ->> 'url');
    end if;
    if v_video ? 'poster'
       and (jsonb_typeof(v_video -> 'poster') is distinct from 'string'
            or (v_video ->> 'poster') !~ (v_folder || 'jpg$')) then
      return false;
    end if;
  end loop;
  return true;
end
$$;

revoke all on function private.recipe_videos_valid(jsonb, text, uuid, uuid) from public, anon;
grant execute on function private.recipe_videos_valid(jsonb, text, uuid, uuid) to authenticated;

alter table public.recipes
  add column videos jsonb not null default '[]',
  add constraint recipes_videos_valid check (private.recipe_videos_valid(videos, kind, household_id, id));

-- No column grant: only the functions below write it (security definer, Entscheidung 2), never
-- apply_changes or a direct update.

-- ---------------------------------------------------------------------------------------------
-- The video of spec 0043 (AC-001)
-- ---------------------------------------------------------------------------------------------

-- The videos list for an old video_path: the video with the recipe's first https TikTok link as
-- its source (fetch-video only took those), without a source when there is none.
create function private.videos_from_video_path(p_video_path text, p_links jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_video_path is null then '[]'::jsonb
    else jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'path', p_video_path,
      'url', (select l.value ->> 'url'
              from jsonb_array_elements(case when jsonb_typeof(p_links) = 'array' then p_links else '[]' end)
                   with ordinality l (value, n)
              where jsonb_typeof(l.value -> 'url') = 'string'
                and (l.value ->> 'url') ~* '^https://([a-z0-9-]+\.)*tiktok\.com([/?#]|$)'
              order by l.n
              limit 1))))
  end
$$;

revoke all on function private.videos_from_video_path(text, jsonb) from public, anon, authenticated;

update public.recipes r
set videos = private.videos_from_video_path(r.video_path, r.links), video_path = null
where r.video_path is not null;

-- Snapshots of deleted recipes ("Rückgängig" for an hour) carry the list too.
update private.deletions d
set snapshot = jsonb_set(d.snapshot #- '{recipe,video_path}', '{recipe,videos}',
                         private.videos_from_video_path(d.snapshot -> 'recipe' ->> 'video_path',
                                                        d.snapshot -> 'recipe' -> 'links'))
where d.kind = 'recipe' and jsonb_typeof(d.snapshot -> 'recipe') = 'object' and d.snapshot -> 'recipe' ? 'video_path';

alter table public.recipes
  add constraint recipes_video_path_retired check (video_path is null);

-- ---------------------------------------------------------------------------------------------
-- Writing the list (Entscheidung 2)
-- ---------------------------------------------------------------------------------------------

-- "Video speichern" (fetch-video as the caller, AC-002, AC-006): appends {path, url?}; false when
-- the recipe has that path or that link's video already (or the caller cannot see the recipe).
create function private.add_recipe_video(p_household_id uuid, p_recipe_id uuid, p_video jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if jsonb_typeof(p_video) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_video) k where k not in ('path', 'url')) then
    raise exception 'invalid_change' using errcode = '22023';
  end if;
  update public.recipes r
  set videos = r.videos || jsonb_build_array(p_video)
  where r.household_id = p_household_id and r.id = p_recipe_id
    and not exists (
      select 1 from jsonb_array_elements(r.videos) v
      where v ->> 'path' = p_video ->> 'path'
         or (p_video ? 'url' and v ->> 'url' = p_video ->> 'url'));
  return found;
end
$$;

-- The poster of the video p_path (AC-012); false when the recipe has no such video, the video
-- has a poster already (never replaced, so no file is left without a reference), or p_poster is
-- the recipe's photo or another video's poster (removing a video deletes its poster).
create function private.set_recipe_video_poster(p_household_id uuid, p_recipe_id uuid, p_path text, p_poster text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  update public.recipes r
  set videos = (
    select jsonb_agg(case when e.value ->> 'path' = p_path
                          then e.value || jsonb_build_object('poster', p_poster)
                          else e.value end order by e.n)
    from jsonb_array_elements(r.videos) with ordinality e (value, n))
  where r.household_id = p_household_id and r.id = p_recipe_id
    and exists (select 1 from jsonb_array_elements(r.videos) v
                where v ->> 'path' = p_path and not v ? 'poster')
    and r.photo_path is distinct from p_poster
    and not exists (select 1 from jsonb_array_elements(r.videos) v where v ->> 'poster' = p_poster);
  return found;
end
$$;

-- "Video entfernen" (AC-017): takes the video p_path out of the list and returns it, so the app
-- deletes its files; null when the recipe has no such video.
create function private.remove_recipe_video(p_household_id uuid, p_recipe_id uuid, p_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed jsonb;
begin
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  select v.value into v_removed
  from public.recipes r
  cross join lateral jsonb_array_elements(r.videos) v
  where r.household_id = p_household_id and r.id = p_recipe_id and v.value ->> 'path' = p_path
  for update of r;
  if v_removed is null then
    return null;
  end if;
  update public.recipes r
  set videos = coalesce((
    select jsonb_agg(e.value order by e.n)
    from jsonb_array_elements(r.videos) with ordinality e (value, n)
    where e.value ->> 'path' is distinct from p_path), '[]')
  where r.household_id = p_household_id and r.id = p_recipe_id;
  return v_removed;
end
$$;

revoke all on function private.add_recipe_video(uuid, uuid, jsonb) from public, anon;
revoke all on function private.set_recipe_video_poster(uuid, uuid, text, text) from public, anon;
revoke all on function private.remove_recipe_video(uuid, uuid, text) from public, anon;
grant execute on function private.add_recipe_video(uuid, uuid, jsonb) to authenticated;
grant execute on function private.set_recipe_video_poster(uuid, uuid, text, text) to authenticated;
grant execute on function private.remove_recipe_video(uuid, uuid, text) to authenticated;

create function public.add_recipe_video(p_household_id uuid, p_recipe_id uuid, p_video jsonb)
returns boolean
language sql
set search_path = ''
as $$ select private.add_recipe_video($1, $2, $3) $$;

create function public.set_recipe_video_poster(p_household_id uuid, p_recipe_id uuid, p_path text, p_poster text)
returns boolean
language sql
set search_path = ''
as $$ select private.set_recipe_video_poster($1, $2, $3, $4) $$;

create function public.remove_recipe_video(p_household_id uuid, p_recipe_id uuid, p_path text)
returns jsonb
language sql
set search_path = ''
as $$ select private.remove_recipe_video($1, $2, $3) $$;

revoke all on function public.add_recipe_video(uuid, uuid, jsonb) from public, anon;
revoke all on function public.set_recipe_video_poster(uuid, uuid, text, text) from public, anon;
revoke all on function public.remove_recipe_video(uuid, uuid, text) from public, anon;
grant execute on function public.add_recipe_video(uuid, uuid, jsonb) to authenticated;
grant execute on function public.set_recipe_video_poster(uuid, uuid, text, text) to authenticated;
grant execute on function public.remove_recipe_video(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- restore_recipe: the videos come back with the recipe. Unchanged from 20261126144439 except
-- videos instead of video_path.
-- ---------------------------------------------------------------------------------------------

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
                              cooked_count, links, videos, created_at)
  select r.id, v_household_id, r.kind, r.title, r.photo, r.photo_path, r.description, r.servings, r.total_minutes,
         r.course, r.cuisine, r.tags, r.variants, r.ingredients, r.steps, r.lead_time, r.notes, r.last_cooked_on,
         r.cooked_count, r.links, coalesce(r.videos, '[]'), r.created_at
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


-- ---------------------------------------------------------------------------------------------
-- The nightly sweep (AC-019)
-- ---------------------------------------------------------------------------------------------

-- Unchanged from 20261126144439 except that a video counts as used when a recipe's videos or a
-- restorable deletion's snapshot names it.
create or replace function private.video_orphans(p_now timestamptz)
returns setof text
language sql
stable
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'household-videos'
    and private.video_household_id(o.name) is not null
    and o.created_at < p_now - interval '1 day'
    and not exists (
      select 1 from public.recipes r
      where r.household_id = private.video_household_id(o.name)
        and r.videos @> jsonb_build_array(jsonb_build_object('path', o.name)))
    and not exists (
      select 1 from private.deletions d
      where d.household_id = private.video_household_id(o.name)
        and d.kind = 'recipe'
        and d.snapshot -> 'recipe' -> 'videos' @> jsonb_build_array(jsonb_build_object('path', o.name)))
  order by o.created_at, o.name
  limit 500
$$;

-- Unchanged from 20261126111754 except that a video's poster counts as used too.
create or replace function private.media_orphans(p_now timestamptz)
returns setof text
language sql
stable
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'household-media'
    and private.media_household_id(o.name) is not null
    and o.created_at < p_now - interval '1 day'
    and not exists (select 1 from public.recipes r where r.photo_path = o.name)
    and not exists (select 1 from public.activities a where a.photo_path = o.name)
    and not exists (select 1 from public.restaurants r where r.photo_path = o.name)
    and not exists (
      select 1 from public.recipes r
      where r.household_id = private.media_household_id(o.name)
        and r.videos @> jsonb_build_array(jsonb_build_object('poster', o.name)))
    and not exists (
      select 1 from private.deletions d
      where d.household_id = private.media_household_id(o.name)
        and (d.snapshot -> d.kind ->> 'photo_path' = o.name
             or (d.kind = 'recipe'
                 and d.snapshot -> 'recipe' -> 'videos' @> jsonb_build_array(jsonb_build_object('poster', o.name)))))
  order by o.created_at, o.name
  limit 500
$$;

revoke all on function private.video_orphans(timestamptz) from public, anon, authenticated;
revoke all on function private.media_orphans(timestamptz) from public, anon, authenticated;
