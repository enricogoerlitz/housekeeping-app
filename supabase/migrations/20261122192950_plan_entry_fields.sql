-- Spec 0021 — the calendar's entries edited in full (critical path: migration, scheduler). Clean
-- target before the first productively used version (wave 2 rules): no expand/contract.
--
-- * meal_plan_entries.reserved_at becomes starts_at, "Uhrzeit (optional)": 5-minute steps, only on
--   restaurants and activities (REQ-013). remind_minutes_before is gone with the reservation
--   reminder; the one reminder of an entry is that of spec 0017 (REQ-014).
-- * The Zusatz (note) is allowed on every kind (REQ-008); its length and control-character checks
--   stay. Free text, portions, guests and eaters keep their checks (AC-018, AC-024).
-- * notification_settings.reservation_reminders_enabled, private.reservation_reminder_candidates
--   and the kind reservation_reminder in the delivery log are gone (AC-039).
-- * The scheduler names the Zusatz of every kind (plan_entry_title) and the time instead of the
--   Tageszeit in the entry reminder ("Erinnerung: Trattoria Da Enzo · heute 19:30"); the daily
--   summary and the evening before carry Zusatz and time ("Eislaufen (Hohenschönhausen,
--   Vormittag, 10:30)", "Morgen: Eislaufen (Hohenschönhausen), Vormittag, 10:30").
-- * apply_changes: the allowlist knows starts_at and loses the dropped columns.

-- ---------------------------------------------------------------------------------------------
-- The reservation reminder goes first: its function reads the columns that go.
-- ---------------------------------------------------------------------------------------------

create or replace function private.notification_candidates(p_now timestamptz)
returns table (household_id uuid, profile_id uuid, kind text, dedupe_key text, due_at timestamptz,
               expires_at timestamptz, title text, body text, url text)
language sql
stable
set search_path = ''
as $$
  select * from private.daily_summary_candidates(p_now)
  union all
  select * from private.activities_eve_candidates(p_now)
  union all
  select * from private.chore_reminder_candidates(p_now)
  union all
  select * from private.entry_reminder_candidates(p_now)
$$;

drop function private.reservation_reminder_candidates(timestamptz);

delete from private.notification_deliveries where kind = 'reservation_reminder';
alter table private.notification_deliveries
  drop constraint notification_deliveries_kind_known,
  add constraint notification_deliveries_kind_known check (
    kind in ('daily_summary', 'activities_eve', 'chore_reminder', 'entry_reminder', 'test'));

alter table public.notification_settings drop column reservation_reminders_enabled;

-- ---------------------------------------------------------------------------------------------
-- meal_plan_entries: starts_at, the Zusatz on every kind
-- ---------------------------------------------------------------------------------------------

alter table public.meal_plan_entries
  drop constraint meal_plan_entries_note_only_activity,
  drop constraint meal_plan_entries_reservation_only_restaurant,
  drop constraint meal_plan_entries_reserved_at_five_minutes,
  drop column remind_minutes_before;
alter table public.meal_plan_entries rename column reserved_at to starts_at;
alter table public.meal_plan_entries
  add constraint meal_plan_entries_starts_at_five_minutes check (private.is_five_minute_time(starts_at)),
  add constraint meal_plan_entries_starts_at_only_timed
    check (starts_at is null or kind in ('restaurant', 'activity')),
  -- Free text and Zusatz now name every kind in notifications: besides the control characters
  -- (text_no_control, note_no_control) also the invisible or direction-changing ones, exactly as
  -- for reminder_text (security check 22.11.2026).
  add constraint meal_plan_entries_text_no_format
    check (text !~ '[\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]'),
  add constraint meal_plan_entries_note_no_format
    check (note !~ '[\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]');

-- ---------------------------------------------------------------------------------------------
-- apply_changes: the allowlist (otherwise unchanged from packing_list_edit)
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
  -- A plan entry's time is starts_at (spec 0021); the reservation reminder is gone.
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
                                     "portions", "variants", "cook_id", "sort", "not_cooked", "starts_at",
                                     "reminder_day_offset", "reminder_at", "reminder_text"],
                          "patch":  ["date", "slot_id", "kind", "recipe_id", "restaurant_id", "activity_id", "text",
                                     "note", "leftovers_of_entry_id", "eater_ids", "guests", "portions", "variants",
                                     "cook_id", "sort", "not_cooked", "starts_at", "reminder_day_offset", "reminder_at",
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

-- ---------------------------------------------------------------------------------------------
-- Scheduler texts
-- ---------------------------------------------------------------------------------------------

-- The name of an entry as the calendar shows it (core planEntryTitle): recipe title,
-- "Reste von <Wochentag>" (or "Reste"), the restaurant's or activity's name, otherwise the free
-- text; every kind with its Zusatz in parentheses, "Lasagne (doppelte Menge)" (spec 0021, REQ-008).
create or replace function private.plan_entry_title(p_entry public.meal_plan_entries)
returns text
language sql
stable
set search_path = ''
as $$
  select case (p_entry).kind
    when 'recipe' then coalesce(
      (select rc.title from public.recipes rc where rc.household_id = (p_entry).household_id and rc.id = (p_entry).recipe_id),
      'Rezept')
    when 'leftovers' then coalesce(
      (select 'Reste von ' || private.weekday_long(src.date) from public.meal_plan_entries src
       where src.household_id = (p_entry).household_id and src.id = (p_entry).leftovers_of_entry_id and src.date is not null),
      'Reste')
    when 'restaurant' then coalesce(
      (select r.name from public.restaurants r where r.household_id = (p_entry).household_id and r.id = (p_entry).restaurant_id),
      (p_entry).text, 'Restaurant')
    when 'activity' then coalesce(
      (select a.name from public.activities a where a.household_id = (p_entry).household_id and a.id = (p_entry).activity_id),
      (p_entry).text, 'Aktivität')
    else coalesce((p_entry).text, '')
  end
  || coalesce(' (' || nullif(btrim((p_entry).note), '') || ')', '')
$$;

-- "Erinnerung: <Name> · <Wann>[ · <Text>]" (spec 0017, REQ-005; spec 0021, REQ-014). <Wann> is
-- "heute <X>" on the day of the entry, "morgen <X>" the day before, otherwise
-- "<Mo> <T>.<M>., <X>", where <X> is the entry's time ("19:30", "9:05") or else its Tageszeit;
-- without either it is left out. A long name is cut with "…" so the message has at most 400
-- characters. Same as core reminderMessage (parity test).
drop function private.entry_reminder_body(text, integer, date, text, text);
create function private.entry_reminder_body(p_name text, p_day_offset integer, p_entry_date date, p_slot_name text,
                                            p_starts_at time, p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  c_max constant integer := 400;
  c_prefix constant text := 'Erinnerung: ';
  v_at text := coalesce(private.format_time(p_starts_at), nullif(p_slot_name, ''));
  v_rest text;
  v_room integer;
begin
  v_rest := ' · '
    || case p_day_offset
         when 0 then 'heute' || coalesce(' ' || v_at, '')
         when 1 then 'morgen' || coalesce(' ' || v_at, '')
         else private.weekday_short(p_entry_date) || ' ' || to_char(p_entry_date, 'FMDD.FMMM.')
              || coalesce(', ' || v_at, '')
       end
    || coalesce(' · ' || p_text, '');
  v_room := c_max - char_length(c_prefix) - char_length(v_rest);
  if char_length(p_name) > v_room then
    return c_prefix || left(p_name, greatest(v_room - 1, 0)) || '…' || v_rest;
  end if;
  return c_prefix || p_name || v_rest;
end
$$;

create or replace function private.entry_reminder_candidates(p_now timestamptz)
returns table (household_id uuid, profile_id uuid, kind text, dedupe_key text, due_at timestamptz,
               expires_at timestamptz, title text, body text, url text)
language sql
stable
set search_path = ''
as $$
  with due as (
    select e, h.timezone, d.day, (d.day + e.reminder_at) at time zone h.timezone as due_at
    from private.notification_households(p_now) h
    cross join lateral (values (h.today - 1), (h.today)) d (day)
    join public.meal_plan_entries e
      on e.household_id = h.household_id and e.reminder_at is not null and e.date - e.reminder_day_offset = d.day
  ), message as (
    select (due.e).id, (due.e).household_id, (due.e).date, (due.e).kind, (due.e).eater_ids, (due.e).reminder_at,
           due.timezone, due.day, due.due_at,
           private.entry_reminder_body(private.plan_entry_title(due.e), (due.e).reminder_day_offset, (due.e).date,
                                       sl.name, (due.e).starts_at, (due.e).reminder_text) as body
    from due
    left join lateral (select p.name from private.meal_slot_positions((due.e).household_id) p
                       where p.slot_id = (due.e).slot_id limit 1) sl on true
    where due.due_at <= p_now and due.due_at >= p_now - interval '30 minutes'
      and not exists (select 1 from private.notification_deliveries nd
                      where nd.dedupe_key = format('entry:%s:%s:%s', (due.e).id, due.day,
                                                   to_char((due.e).reminder_at, 'HH24:MI')))
  ), capped as (
    -- Security check 22.11.2026: at most 50 entries per household and tick, so one household
    -- cannot crowd out the others; the rest goes out with the next ticks of the 30-minute window.
    select message.*, row_number() over (partition by message.household_id order by message.due_at, message.id) as n
    from message
  )
  select message.household_id, m.profile_id, 'entry_reminder',
         format('entry:%s:%s:%s', message.id, message.day, to_char(message.reminder_at, 'HH24:MI')), message.due_at,
         (message.day + 1)::timestamp at time zone message.timezone, 'Housekeeping', message.body,
         format('/kalender?tag=%s&eintrag=%s&haushalt=%s', message.date, message.id, message.household_id)
  from capped message
  join public.household_members m on m.household_id = message.household_id
  join public.notification_settings s
    on s.household_id = m.household_id and s.member_id = m.profile_id and s.entry_reminders_enabled
  where message.n <= 50
    and (message.kind = 'activity' or cardinality(message.eater_ids) = 0 or m.profile_id = any (message.eater_ids))
    and not private.is_silent(message.household_id, m.profile_id, message.day)
    and not private.is_silent(message.household_id, m.profile_id, message.date)
$$;

-- The daily summary: Zusatz and time with every entry (REQ-008, REQ-013).
create or replace function private.daily_summary_body(p_household_id uuid, p_profile_id uuid, p_day date, p_parts text[])
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_day text[];
  v_chores text[];
  v_prep text[];
  v_segments text[];
begin
  select coalesce(array_agg(x.segment order by x.pos, x.kind_rank, x.sort, x.id), '{}')
  into v_day
  from (
    select e.id, e.sort, coalesce(sl.pos, 2147483647) as pos,
           case e.kind when 'activity' then 0 when 'restaurant' then 2 else 1 end as kind_rank,
           case e.kind
             when 'activity' then a.name || private.parenthesize(array[e.note, sl.name, private.format_time(e.starts_at)])
             when 'restaurant' then r.name || private.parenthesize(array[e.note, sl.name, private.format_time(e.starts_at)])
             else
               case e.kind
                 when 'leftovers' then 'Reste: ' || coalesce(rc.title, src_rc.title, src.text, 'Reste')
                 when 'text' then e.text
                 else rc.title
               end
               || private.parenthesize(array[e.note, sl.name, case when e.cook_id = p_profile_id then 'du kochst' end])
           end as segment
    from public.meal_plan_entries e
    left join private.meal_slot_positions(p_household_id) sl on sl.slot_id = e.slot_id
    left join public.activities a on a.household_id = e.household_id and a.id = e.activity_id
    left join public.restaurants r on r.household_id = e.household_id and r.id = e.restaurant_id
    left join public.recipes rc on rc.household_id = e.household_id and rc.id = e.recipe_id
    left join public.meal_plan_entries src on src.household_id = e.household_id and src.id = e.leftovers_of_entry_id
    left join public.recipes src_rc on src_rc.household_id = src.household_id and src_rc.id = src.recipe_id
    where e.household_id = p_household_id and e.date = p_day
      and ((e.kind = 'activity' and 'activities' = any (p_parts))
           or (e.kind <> 'activity' and 'meals' = any (p_parts)
               and (cardinality(e.eater_ids) = 0 or p_profile_id = any (e.eater_ids))))
  ) x
  where x.segment is not null;

  select coalesce(array_agg(x.segment order by x.rank, x.title, x.id), '{}')
  into v_chores
  from (
    select c.id, c.title,
           case st.state when 'overdue' then 0 when 'today' then 1 else 2 end as rank,
           c.title || private.parenthesize(array[
             case when c.assignment ->> 'type' in ('fixed', 'rotating') then 'du' end,
             case when c.next_due_on = p_day then private.format_time(c.due_time) end,
             case when st.state = 'overdue' then 'überfällig' end]) as segment
    from public.chores c
    cross join lateral (select private.chore_due_state(c, p_day) as state, private.chore_assignees(c) as assignees) st
    where 'chores' = any (p_parts)
      and c.household_id = p_household_id
      and st.state is not null
      and (cardinality(st.assignees) = 0 or p_profile_id = any (st.assignees))
  ) x;

  select coalesce(array_agg(btrim(rc.lead_time ->> 'text') order by coalesce(sl.pos, 2147483647), e.sort, e.id), '{}')
  into v_prep
  from public.meal_plan_entries e
  join public.recipes rc on rc.household_id = e.household_id and rc.id = e.recipe_id
  left join private.meal_slot_positions(p_household_id) sl on sl.slot_id = e.slot_id
  where 'prep' = any (p_parts)
    and e.household_id = p_household_id and e.date = p_day + 1 and e.kind = 'recipe'
    and coalesce(btrim(rc.lead_time ->> 'text'), '') <> ''
    and (e.cook_id = p_profile_id
         or (e.cook_id is null and (cardinality(e.eater_ids) = 0 or p_profile_id = any (e.eater_ids))));

  v_segments := v_day || v_chores;
  if cardinality(v_prep) > 0 then
    v_segments := v_segments || ('Für morgen: ' || array_to_string(v_prep, ', '));
  end if;
  return private.notification_text(case when cardinality(v_day || v_chores) > 0 then 'Heute: ' else '' end, v_segments);
end
$$;

-- The evening before: "Morgen: Eislaufen (Hohenschönhausen), Vormittag, 10:30" (REQ-013).
create or replace function private.activities_eve_candidates(p_now timestamptz)
returns table (household_id uuid, profile_id uuid, kind text, dedupe_key text, due_at timestamptz,
               expires_at timestamptz, title text, body text, url text)
language sql
stable
set search_path = ''
as $$
  with due as (
    select h.household_id, h.timezone, s.member_id, d.day,
           (d.day + s.activities_eve_at) at time zone h.timezone as due_at
    from private.notification_households(p_now) h
    join public.notification_settings s on s.household_id = h.household_id and s.activities_eve_enabled
    join public.household_members m on m.household_id = s.household_id and m.profile_id = s.member_id
    cross join lateral (values (h.today - 1), (h.today)) d (day)
  ), tomorrow as (
    select dd.household_id, dd.day, count(*) as n, (array_agg(x.id order by x.pos, x.sort, x.id))[1] as first_id,
           array_agg(x.segment order by x.pos, x.sort, x.id) as segments
    from (select distinct due.household_id, due.day from due
          where due.due_at <= p_now and due.due_at >= p_now - interval '30 minutes') dd
    join lateral (
      select e.id, e.sort, coalesce(sl.pos, 2147483647) as pos,
             a.name || coalesce(' (' || nullif(e.note, '') || ')', '') || coalesce(', ' || sl.name, '')
               || coalesce(', ' || private.format_time(e.starts_at), '') as segment
      from public.meal_plan_entries e
      join public.activities a on a.household_id = e.household_id and a.id = e.activity_id
      left join private.meal_slot_positions(dd.household_id) sl on sl.slot_id = e.slot_id
      where e.household_id = dd.household_id and e.date = dd.day + 1 and e.kind = 'activity'
    ) x on true
    group by dd.household_id, dd.day
  )
  select due.household_id, due.member_id, 'activities_eve',
         format('eve:%s:%s:%s', due.household_id, due.member_id, due.day), due.due_at,
         (due.day + 1)::timestamp at time zone due.timezone, 'Housekeeping',
         private.notification_text('Morgen: ', t.segments),
         case when t.n = 1 then format('/kalender?tag=%s&eintrag=%s&haushalt=%s', due.day + 1, t.first_id, due.household_id)
              else format('/kalender?tag=%s&haushalt=%s', due.day + 1, due.household_id) end
  from due
  join tomorrow t on t.household_id = due.household_id and t.day = due.day
  where due.due_at <= p_now and due.due_at >= p_now - interval '30 minutes'
    and not private.is_silent(due.household_id, due.member_id, due.day)
    and not private.is_silent(due.household_id, due.member_id, due.day + 1)
$$;

-- Unchanged except the urgency: the reservation reminder is gone.
create or replace function private.run_notification_tick(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config record;
  v_messages jsonb;
  v_count integer;
  v_bundle jsonb;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('housekeeping.notification_tick', 0)) then
    return 0;
  end if;

  perform private.collect_push_responses(p_now);

  select * into v_config from private.push_send_config();
  if v_config.url is null or v_config.secret is null then
    raise warning 'push_not_configured';
    return 0;
  end if;

  with candidates as (
    select * from private.notification_candidates(p_now)
  ), inserted as (
    insert into private.notification_deliveries (dedupe_key, subscription_id, profile_id, household_id, kind, due_at)
    select c.dedupe_key, s.id, c.profile_id, c.household_id, c.kind, c.due_at
    from candidates c
    join private.push_subscriptions s on s.profile_id = c.profile_id and s.enabled and s.gone_at is null
    on conflict (dedupe_key, subscription_id) do nothing
    returning id, subscription_id, profile_id, dedupe_key
  )
  select coalesce(jsonb_agg(private.push_message(
           i.id, s, extract(epoch from c.expires_at - p_now)::integer,
           case when c.kind in ('chore_reminder', 'entry_reminder') then 'high' else 'normal' end,
           c.title, c.body, c.url) order by i.id), '[]')
  into v_messages
  from inserted i
  join private.push_subscriptions s on s.id = i.subscription_id
  join candidates c on c.dedupe_key = i.dedupe_key and c.profile_id = i.profile_id;

  v_count := jsonb_array_length(v_messages);
  for v_bundle in select b from private.push_bundles(v_messages) b loop
    perform private.post_push_bundle(v_config.url, v_config.secret, v_bundle);
  end loop;
  return v_count;
end
$$;
