-- Spec 0043 "Rezeptvideo aus TikTok speichern und abspielen".
--
-- * recipes.video_path: the recipe's own video in the private bucket household-videos, at most one
--   per recipe, only for kind = 'recipe'. Named <household_id>/recipes/<recipe id>/<uuid>.mp4 like
--   photo_path names a photo; members write it through apply_changes (column grants and the
--   allowlist): the edge function fetch-video sets it as the caller, "Video entfernen" clears it.
--   Synced like every recipe column; restore_recipe brings it back with the recipe.
-- * Bucket household-videos: private, 50 MiB (the global storage limit of the hosted free plan),
--   video/mp4 only. Policies like household-media: a member reads, uploads and deletes the
--   objects of her own households (no update: a video is never overwritten); anon has none.
--   A name of another shape is refused like a foreign one, never with a cast error.
-- * Deleting: begin_household_deletion also returns the household's video names (the app deletes
--   them from household-videos, telling them apart by .mp4), delete_household refuses with
--   media_remaining while videos are left, and the nightly sweep (spec 0039) also sends the
--   videos no recipe and no deletion snapshot names, older than one day, as "videos" to
--   media-sweep.
-- Additive: a nullable column, a new bucket, no backfill.

-- ---------------------------------------------------------------------------------------------
-- recipes.video_path
-- ---------------------------------------------------------------------------------------------

alter table public.recipes
  add column video_path text,
  add constraint recipes_video_path_valid check (
    video_path is null
    or (kind = 'recipe'
        and video_path ~ ('^' || household_id::text || '/recipes/' || id::text
                          || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$')));

grant insert (video_path) on public.recipes to authenticated;
grant update (video_path) on public.recipes to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Bucket household-videos
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('household-videos', 'household-videos', false, 52428800, '{video/mp4}')
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- The household of an object name in household-videos, or null if the name is not
-- <household_id>/recipes/<recipe id>/<uuid>.mp4. Parses by regex before casting, so no name can
-- make a policy raise. Called by the storage.objects policies as the caller.
create function private.video_household_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/recipes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$'
      then split_part(p_name, '/', 1)::uuid
  end
$$;

revoke all on function private.video_household_id(text) from public, anon;
grant execute on function private.video_household_id(text) to authenticated;

create policy household_videos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'household-videos'
    and private.video_household_id(name) in (select private.my_household_ids())
  );

create policy household_videos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'household-videos'
    and private.video_household_id(name) in (select private.my_household_ids())
  );

create policy household_videos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'household-videos'
    and private.video_household_id(name) in (select private.my_household_ids())
  );

-- ---------------------------------------------------------------------------------------------
-- Deleting a household: its videos too (AC-010)
-- ---------------------------------------------------------------------------------------------

-- Unchanged from 20261122181410 (household_media_names, renamed in 20261123070918) except that
-- the names of the household's videos come back too.
create or replace function private.begin_household_deletion(p_household_id uuid)
returns setof text
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.profile_id = auth.uid()
  ) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if (select count(*) from public.household_members m where m.household_id = p_household_id) > 1 then
    raise exception 'not_last_member' using errcode = 'P0001';
  end if;
  perform private.close_household_for_deletion(p_household_id);

  return query
    select o.name from storage.objects o
    where o.bucket_id in ('household-media', 'household-videos')
      and o.name like p_household_id::text || '/%'
    order by o.name;
end
$$;

-- Unchanged from 20261122181410 except that stored videos count as media_remaining too.
create or replace function private.delete_household(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  perform 1 from public.households h where h.id = p_household_id for update;

  if not exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.profile_id = v_uid
  ) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if (select count(*) from public.household_members m where m.household_id = p_household_id) > 1 then
    raise exception 'not_last_member' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from storage.objects o
    where o.bucket_id in ('household-media', 'household-videos')
      and o.name like p_household_id::text || '/%'
  ) then
    raise exception 'media_remaining' using errcode = 'P0001';
  end if;

  delete from public.households h where h.id = p_household_id;
  delete from public.deleted_records d where d.household_id = p_household_id;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- The nightly sweep: videos too (AC-011)
-- ---------------------------------------------------------------------------------------------

-- Videos of household-videos created more than one day before p_now that no recipe names in
-- video_path and no snapshot of a recipe deletion names (its "Rückgängig" can still bring the
-- recipe back). Oldest first, at most 500 per run.
create function private.video_orphans(p_now timestamptz)
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
    and not exists (select 1 from public.recipes r where r.video_path = o.name)
    and not exists (
      select 1 from private.deletions d
      where d.household_id = private.video_household_id(o.name)
        and d.kind = 'recipe'
        and d.snapshot -> 'recipe' ->> 'video_path' = o.name)
  order by o.created_at, o.name
  limit 500
$$;

-- Unchanged from 20261126111754 except that the videos go along as "videos" (media-sweep deletes
-- them from household-videos) and the count includes them.
create or replace function private.run_media_orphan_sweep(p_now timestamptz default now())
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_config record;
  v_names jsonb;
  v_videos jsonb;
  v_body jsonb;
  v_timestamp text;
begin
  select * into v_config from private.media_sweep_config();
  if v_config.url is null or v_config.secret is null then
    raise warning 'media_sweep_not_configured';
    return 0;
  end if;

  select coalesce(jsonb_agg(n order by n), '[]') into v_names from private.media_orphans(p_now) n;
  select coalesce(jsonb_agg(n order by n), '[]') into v_videos from private.video_orphans(p_now) n;
  if jsonb_array_length(v_names) + jsonb_array_length(v_videos) = 0 then
    return 0;
  end if;

  v_body := jsonb_build_object('names', v_names, 'videos', v_videos);
  v_timestamp := extract(epoch from pg_catalog.clock_timestamp())::bigint::text;
  perform net.http_post(
    url := v_config.url,
    body := v_body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sweep-timestamp', v_timestamp,
      'x-sweep-signature', encode(extensions.hmac(v_timestamp || '.' || v_body::text, v_config.secret, 'sha256'), 'hex')),
    timeout_milliseconds := 60000);
  return jsonb_array_length(v_names) + jsonb_array_length(v_videos);
end
$$;

revoke all on function private.video_orphans(timestamptz) from public, anon, authenticated;
revoke all on function private.run_media_orphan_sweep(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- restore_recipe: the video comes back with the recipe. Unchanged from 20261123070546 except
-- video_path.
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
                              cooked_count, links, video_path, created_at)
  select r.id, v_household_id, r.kind, r.title, r.photo, r.photo_path, r.description, r.servings, r.total_minutes,
         r.course, r.cuisine, r.tags, r.variants, r.ingredients, r.steps, r.lead_time, r.notes, r.last_cooked_on,
         r.cooked_count, r.links, r.video_path, r.created_at
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
-- apply_changes: recipes.video_path (insert and patch). Unchanged from 20261126111336 (spec 0042)
-- except the recipes rule.
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
  -- A recipe's video (video_path) is set by fetch-video as the caller and cleared by "Video
  -- entfernen" (spec 0043).
  c_allowlist constant jsonb := $json${
    "areas":            {"insert": ["id", "household_id", "name", "sort"],
                         "patch":  ["name", "sort"], "delete": true},
    "articles":         {"insert": ["id", "household_id", "name", "name_key", "synonyms", "synonym_keys",
                                    "area_id", "diet", "is_pantry", "default_shopping_rule", "needs_review"],
                         "patch":  ["name", "name_key", "synonyms", "synonym_keys", "area_id", "diet",
                                    "is_pantry", "default_shopping_rule", "needs_review"], "delete": false},
    "stores":           {"insert": ["id", "household_id", "name", "area_order", "hidden_area_ids", "maps_url"],
                         "patch":  ["name", "area_order", "hidden_area_ids", "maps_url"], "delete": true},
    "recipes":          {"insert": ["id", "household_id", "kind", "title", "photo_path", "description",
                                    "servings", "total_minutes", "course", "cuisine", "tags", "variants", "ingredients",
                                    "steps", "lead_time", "notes", "last_cooked_on", "cooked_count", "links", "video_path"],
                         "patch":  ["title", "photo_path", "description", "servings", "total_minutes", "course",
                                    "cuisine", "tags", "variants", "ingredients", "steps", "lead_time", "notes",
                                    "last_cooked_on", "cooked_count", "links", "video_path"], "delete": false},
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
