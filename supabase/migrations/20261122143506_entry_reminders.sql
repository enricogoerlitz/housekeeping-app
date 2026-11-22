-- Spec 0017 — reminders on plan entries (ADR-0014 addendum 22.11.2026). Additive only (rule
-- 30-database, first release v2026.11.1): new nullable columns, a new settings column with a
-- default, two triggers, an index, a widened check, and the functions that must know the new
-- columns replaced with `create or replace` (apply_changes, the scheduler).
--
-- * A reminder is three columns on the entry (plan, Decision 1): at most one per entry, and
--   moving, undo and delete carry it without another write. reminder_day_offset is "days before
--   the day of the entry" (0 to 366, Offene Frage 7), reminder_at the time in the household's
--   zone (5-minute steps), reminder_text an optional text for the message (1 to 80 characters,
--   no edge spaces, no control characters; it flows into the message, never into the log).
-- * Offset and time only together, text only with a time, a reminder only on an entry with a day.
-- * "Vormerken" (date becomes null) clears the reminder by trigger, so v2026.11.1, which does
--   not know the columns and patches only date = null, cannot leave one behind.
-- * Setting or changing the reminder on the same day, and adding an entry with one, is refused
--   with reminder_in_past (22023) unless the moment lies in the future. Moving the entry (date
--   changes) is never refused (AC-022), and neither is undo after "Vormerken" (AC-023).
-- * The new columns reach the devices through sync_pull (to_jsonb of the row) without a change.

-- ---------------------------------------------------------------------------------------------
-- meal_plan_entries: the reminder
-- ---------------------------------------------------------------------------------------------

alter table public.meal_plan_entries
  add column reminder_day_offset smallint
    constraint meal_plan_entries_reminder_day_offset_valid check (reminder_day_offset between 0 and 366),
  add column reminder_at time
    constraint meal_plan_entries_reminder_at_five_minutes check (private.is_five_minute_time(reminder_at)),
  add column reminder_text text
    constraint meal_plan_entries_reminder_text_valid check (
      char_length(reminder_text) between 1 and 80 and reminder_text = btrim(reminder_text)
      and reminder_text !~ '[[:cntrl:]]'),
  add constraint meal_plan_entries_reminder_complete check ((reminder_day_offset is null) = (reminder_at is null)),
  add constraint meal_plan_entries_reminder_text_needs_time check (reminder_text is null or reminder_at is not null),
  add constraint meal_plan_entries_reminder_needs_date check (reminder_at is null or date is not null);

-- The scheduler looks for the reminders a household sends today or yesterday (local time).
create index meal_plan_entries_reminder_send_day_idx
  on public.meal_plan_entries (household_id, (date - reminder_day_offset))
  where reminder_at is not null;

-- Before update of date: back to "Vorgemerkt" clears the reminder.
create function private.meal_plan_entries_clear_reminder()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.date is null and old.date is not null then
    new.reminder_day_offset := null;
    new.reminder_at := null;
    new.reminder_text := null;
  end if;
  return new;
end
$$;

create trigger meal_plan_entries_clear_reminder before update of date on public.meal_plan_entries
  for each row execute function private.meal_plan_entries_clear_reminder();

-- Before insert, or before an update of the reminder on the same day: the moment must lie in the
-- future, in the household's time zone. Security invoker: reads the household under the caller's
-- RLS. Incomplete values are left to the check constraints.
create function private.meal_plan_entries_check_reminder()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_timezone text;
begin
  if new.reminder_at is null or new.reminder_day_offset is null or new.date is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (new.date is distinct from old.date
          or (new.reminder_day_offset is not distinct from old.reminder_day_offset
              and new.reminder_at is not distinct from old.reminder_at)) then
    return new;
  end if;
  select h.timezone into v_timezone from public.households h where h.id = new.household_id;
  if ((new.date - new.reminder_day_offset) + new.reminder_at) at time zone v_timezone <= pg_catalog.now() then
    raise exception 'reminder_in_past' using errcode = '22023';
  end if;
  return new;
end
$$;

create trigger meal_plan_entries_check_reminder
  before insert or update of date, reminder_day_offset, reminder_at on public.meal_plan_entries
  for each row execute function private.meal_plan_entries_check_reminder();

grant insert (reminder_day_offset, reminder_at, reminder_text) on public.meal_plan_entries to authenticated;
grant update (reminder_day_offset, reminder_at, reminder_text) on public.meal_plan_entries to authenticated;

-- ---------------------------------------------------------------------------------------------
-- notification_settings, notification_deliveries
-- ---------------------------------------------------------------------------------------------

-- "Erinnerungen an Einträgen" (REQ-007): on at the start, for every member, without a time.
alter table public.notification_settings
  add column entry_reminders_enabled boolean not null default true;
grant update (entry_reminders_enabled) on public.notification_settings to authenticated;

-- The new kind in the log; its dedupe_key is entry:<entry>:<send day>:<HH:MM>.
alter table private.notification_deliveries
  drop constraint notification_deliveries_kind_known,
  add constraint notification_deliveries_kind_known check (
    kind in ('daily_summary', 'activities_eve', 'chore_reminder', 'reservation_reminder', 'entry_reminder', 'test'));

-- ---------------------------------------------------------------------------------------------
-- apply_changes: the allowlist knows the new columns (otherwise unchanged)
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
  -- Articles are deleted only by delete_article and merge_articles (spec 0007, E4).
  -- Recipes are deleted only by delete_recipe (spec 0008, E2). The kind of a recipe (recipe or
  -- collection) is set on insert and never patched (spec 0009, E2). A collection_recipes row keeps
  -- its collection and its recipe; only servings, variant and order change (spec 0009, E4).
  -- Chore events are booked and removed only by complete_chore / remove_chore_event (spec 0011).
  -- The packed state of packing items (packed, packed_at, packed_by, pack_seq) is written only by
  -- set_packing_items_packed and restore_packing_items; packing items are never patched (spec 0012).
  -- Notification settings rows are created by the server and only patched, and RLS lets a member
  -- patch only her own row (spec 0013, Decision 3). households.timezone is never written (D16).
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
                                    "steps", "lead_time", "notes", "last_cooked_on", "cooked_count", "source"],
                         "patch":  ["title", "photo", "photo_path", "description", "servings", "total_minutes", "course",
                                    "cuisine", "tags", "variants", "ingredients", "steps", "lead_time", "notes",
                                    "last_cooked_on", "cooked_count", "source"], "delete": false},
    "collection_recipes": {"insert": ["id", "household_id", "collection_id", "recipe_id", "servings", "variant_id",
                                      "sort"],
                           "patch":  ["servings", "variant_id", "sort"], "delete": true},
    "restaurants":      {"insert": ["id", "household_id", "name", "address", "lat", "lng", "maps_url", "cuisine",
                                    "price_level", "tags", "notes"],
                         "patch":  ["name", "address", "lat", "lng", "maps_url", "cuisine", "price_level", "tags",
                                    "notes"], "delete": true},
    "activities":       {"insert": ["id", "household_id", "name", "name_key", "description", "photo_path", "place_name",
                                    "address", "lat", "lng", "maps_url", "tags", "created_by"],
                         "patch":  ["name", "name_key", "description", "photo_path", "place_name", "address", "lat",
                                    "lng", "maps_url", "tags"], "delete": true},
    "absences":         {"insert": ["id", "household_id", "member_id", "from_on", "to_on", "note"],
                         "patch":  ["member_id", "from_on", "to_on", "note"], "delete": true},
    "packing_bags":     {"insert": ["id", "household_id", "name", "member_id", "sort"],
                         "patch":  ["name", "member_id", "sort"], "delete": true},
    "packing_bag_items": {"insert": ["id", "household_id", "bag_id", "name", "quantity", "per_day", "sort"],
                          "patch":  ["name", "quantity", "per_day", "sort"], "delete": true},
    "packing_list_bags": {"insert": ["id", "household_id", "absence_id", "bag_id", "name", "member_id", "sort"],
                          "patch":  ["absence_id", "bag_id", "sort"], "delete": true},
    "packing_items":    {"insert": ["id", "household_id", "list_bag_id", "name", "quantity", "per_day", "sort"],
                         "patch":  [], "delete": true},
    "feedback":         {"insert": ["id", "household_id", "kind", "text", "status", "author_id", "screen", "reason",
                                    "spec_ref"],
                         "patch":  ["kind", "text", "status", "screen", "reason", "spec_ref"], "delete": true},
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
  -- every entry of add_contributions and every item of restore_packing_items is an op. The
  -- contributions of all entries are capped too.
  -- complete_chore counts as a delete: done of a one-off chore deletes it, which is known only
  -- once the chore is locked.
  select coalesce(sum(case when o ->> 'kind' = 'remove_contributions' and jsonb_typeof(o -> 'ids') = 'array'
                             then greatest(jsonb_array_length(o -> 'ids'), 1)
                           when o ->> 'kind' = 'add_contributions' and jsonb_typeof(o -> 'entries') = 'array'
                             then greatest(jsonb_array_length(o -> 'entries'), 1)
                           when o ->> 'kind' = 'restore_packing_items' and jsonb_typeof(o -> 'items') = 'array'
                             then greatest(jsonb_array_length(o -> 'items'), 1)
                           else 1 end), 0),
         count(*) filter (where o ->> 'kind' in ('delete', 'complete_chore', 'remove_chore_event'))
           + coalesce(sum(jsonb_array_length(o -> 'ids'))
                        filter (where o ->> 'kind' = 'remove_contributions' and jsonb_typeof(o -> 'ids') = 'array'), 0),
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
