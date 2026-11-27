-- Spec 0059 "Nichts verpassen": "Erinnern" at a series (REQ-003) and "Vorwarnung" at a chore
-- (REQ-004). Additive only (rule 30-database): new nullable columns with checks, their column
-- grants, apply_changes with them in its allowlist, and restore_activity carrying them.
--
-- * activity_series.reminder_day_offset / reminder_at / reminder_text: the reminder of every
--   Termin, the same shape as at meal_plan_entries (spec 0017) with a Vorlauf of 0 to 30 days
--   (Decision 3). No "in the past" trigger: a series repeats (Decision 2).
-- * chores.notice_days_before: the Vorwarnung, 1 to 60 days before the Termin (Decision 3); at
--   most 60 keeps the keys of the bell within the 367 days acknowledge_notices accepts.
-- * The released 2026.11.2 knows none of these and never writes them (Decision 10): no minimum
--   version. The columns reach the devices through sync_pull (to_jsonb of the row) unchanged.
-- * apply_changes is unchanged from 20261126211710 except the new
--   allowlist entries and their comment; restore_activity is unchanged from 20261126111313 except
--   the three series columns ("Rückgängig" keeps the reminder, Decision 11).

-- ---------------------------------------------------------------------------------------------
-- activity_series: "Erinnern"
-- ---------------------------------------------------------------------------------------------

alter table public.activity_series
  add column reminder_day_offset smallint
    constraint activity_series_reminder_day_offset_valid check (reminder_day_offset between 0 and 30),
  add column reminder_at time
    constraint activity_series_reminder_at_five_minutes check (private.is_five_minute_time(reminder_at)),
  add column reminder_text text
    constraint activity_series_reminder_text_valid check (
      char_length(reminder_text) between 1 and 80 and reminder_text = btrim(reminder_text)
      -- As meal_plan_entries_reminder_text_valid: C0, DEL, C1 and the invisible or
      -- direction-changing characters; no locale dependence.
      and reminder_text !~ '[\u0001-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]'),
  add constraint activity_series_reminder_complete check ((reminder_day_offset is null) = (reminder_at is null)),
  add constraint activity_series_reminder_text_needs_time check (reminder_text is null or reminder_at is not null);

grant insert (reminder_day_offset, reminder_at, reminder_text) on public.activity_series to authenticated;
grant update (reminder_day_offset, reminder_at, reminder_text) on public.activity_series to authenticated;

-- ---------------------------------------------------------------------------------------------
-- chores: "Vorwarnung"
-- ---------------------------------------------------------------------------------------------

alter table public.chores
  add column notice_days_before smallint
    constraint chores_notice_days_before_valid check (notice_days_before between 1 and 60);

grant insert (notice_days_before) on public.chores to authenticated;
grant update (notice_days_before) on public.chores to authenticated;

-- ---------------------------------------------------------------------------------------------
-- apply_changes: with the new columns
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
  -- Notification settings rows are created by the server; their acknowledged notices are written
  -- only by acknowledge_notices (spec 0051, Decision 7). households.timezone is never written (D16).
  -- A plan entry's time is starts_at (spec 0021); the reservation reminder is gone.
  -- Restaurants and activities are deleted only by delete_restaurant / delete_activity (spec 0024).
  -- "Nicht gemacht" is not_done on every kind (spec 0020, REQ-008).
  -- An activity's kind, own symbol and "Merken" are patched; kinds, series and their exceptions
  -- are written directly, a series keeps its activity (spec 0041).
  -- A trip may be a draft ("Entwurf", spec 0030, REQ-004): draft is set on insert and patched.
  -- The meal slots of a household are set by create_household and not written by members, and the
  -- bundled sample photo of a recipe (photo) is set only by the seed (spec 0031, REQ-014, REQ-026).
  -- A recipe's videos are written only by add_recipe_video, set_recipe_video_poster and
  -- remove_recipe_video (spec 0046).
  -- "Erinnern" of a series (reminder_*) and "Vorwarnung" of a chore (notice_days_before) are
  -- written like the other columns (spec 0059).
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
                                    "steps", "lead_time", "notes", "last_cooked_on", "cooked_count", "links"],
                         "patch":  ["title", "photo_path", "description", "servings", "total_minutes", "course",
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
                                    "address", "lat", "lng", "maps_url", "website_url", "created_by", "kind_id", "icon",
                                    "remembered"],
                         "patch":  ["name", "name_key", "description", "photo_path", "place_name", "address", "lat",
                                    "lng", "maps_url", "website_url", "kind_id", "icon", "remembered"], "delete": false},
    "activity_kinds":   {"insert": ["id", "household_id", "name", "name_key", "icon"],
                         "patch":  ["name", "name_key", "icon"], "delete": true},
    "activity_series":  {"insert": ["id", "household_id", "activity_id", "rule", "starts_on", "ends_on", "slot_id",
                                    "starts_at", "note", "eater_ids", "guests", "reminder_day_offset", "reminder_at",
                                    "reminder_text"],
                         "patch":  ["rule", "starts_on", "ends_on", "slot_id", "starts_at", "note", "eater_ids",
                                    "guests", "reminder_day_offset", "reminder_at", "reminder_text"], "delete": true},
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
                                    "remind_at_due_time", "notice_days_before"],
                         "patch":  ["title", "room", "recurrence", "assignment", "effort", "next_due_on",
                                    "next_assignee_id", "last_done_on", "active_months", "due_time",
                                    "remind_at_due_time", "notice_days_before"], "delete": true},
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
                              "patch":  [], "delete": false},
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

-- ---------------------------------------------------------------------------------------------
-- restore_activity: the series come back with their reminder
-- ---------------------------------------------------------------------------------------------

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
                                 lng, maps_url, website_url, created_at, kind_id, icon, remembered)
  select a.id, v_household_id, a.name, a.name_key, a.description, a.photo_path, a.place_name, a.address, a.lat,
         a.lng, a.maps_url, a.website_url, a.created_at,
         case when exists (select 1 from public.activity_kinds k
                           where k.household_id = v_household_id and k.id = a.kind_id) then a.kind_id end,
         a.icon, coalesce(a.remembered, true)
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

  insert into public.activity_series (id, household_id, activity_id, rule, starts_on, ends_on, slot_id, starts_at,
                                      note, eater_ids, guests, reminder_day_offset, reminder_at, reminder_text)
  select s.id, v_household_id, p_activity_id, s.rule, s.starts_on, s.ends_on, s.slot_id, s.starts_at, s.note,
         array(select u.id from unnest(s.eater_ids) with ordinality u (id, ord)
               where exists (select 1 from public.household_members m
                             where m.household_id = v_household_id and m.profile_id = u.id)
               order by u.ord),
         s.guests, s.reminder_day_offset, s.reminder_at, s.reminder_text
  from jsonb_populate_recordset(null::public.activity_series, coalesce(v_snapshot -> 'series', '[]')) s
  where exists (select 1 from public.households h, jsonb_array_elements(h.meal_slots) x
                where h.id = v_household_id and (x ->> 'id')::uuid = s.slot_id)
  on conflict (id) do nothing;

  insert into public.activity_series_exceptions (id, household_id, series_id, on_date, moved_to, slot_id, starts_at)
  select x.id, v_household_id, x.series_id, x.on_date, x.moved_to,
         case when exists (select 1 from public.households h, jsonb_array_elements(h.meal_slots) y
                           where h.id = v_household_id and (y ->> 'id')::uuid = x.slot_id) then x.slot_id end,
         x.starts_at
  from jsonb_populate_recordset(null::public.activity_series_exceptions, coalesce(v_snapshot -> 'exceptions', '[]')) x
  where exists (select 1 from public.activity_series s where s.household_id = v_household_id and s.id = x.series_id)
  on conflict (id) do nothing;

  perform private.restore_plan_entries(v_household_id, v_snapshot -> 'removed');
  perform private.restore_converted_entries(v_household_id, v_snapshot -> 'converted');

  delete from private.deletions d
  where d.household_id = v_household_id and d.kind = 'activity' and d.target_id = p_activity_id;
  return true;
end
$$;
