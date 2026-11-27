-- Spec 0060 "Dauerposten" (critical path: new synced table, RLS, sync, pg_cron). Additive only.
--
-- * recurring_items ("Dauerposten"): an article of the household with amount, Zusatz and rhythm
--   (the series rule of spec 0041 without "yearly"), paused or active; at most one per article.
--   last_added_on (the last day it came onto the list) is written only by the server: no grant,
--   not in the allowlist of apply_changes.
-- * shopping_contributions.source may be {"kind": "recurring", "recurringItemId", "on"} again
--   (spec 0025 had dropped the never built "recurring"; it comes back with the Dauerposten and its
--   day). Saving one marks its day on the Dauerposten (trigger, Decision 7).
-- * private.add_due_recurring_items(p_now): every hour (pg_cron "add-due-recurring-items", minute
--   5) puts every active Dauerposten that is due today in its household's time zone onto the list,
--   once per day, by the rules of adding (spec 0025, REQ-013); not when it is still open there.
--   No secret, no pg_net.
-- * apply_changes, sync_pull: the new table. merge_articles: the Dauerposten of the source goes to
--   the target when the target has none.

-- ---------------------------------------------------------------------------------------------
-- The due rule (twin of matchesRule in packages/core/src/activity-series.ts, Decision 4)
-- ---------------------------------------------------------------------------------------------

-- Weekly: one of the weekdays (1 = Monday) in a week that is a multiple of "every" weeks after the
-- week of p_starts_on. Monthly: the day, or the last day of a shorter month. Never before the start.
create function private.recurring_item_due(p_rule jsonb, p_starts_on date, p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_day >= p_starts_on
    and case p_rule ->> 'type'
      when 'weekly' then
        (p_rule -> 'weekdays') @> pg_catalog.to_jsonb(extract(isodow from p_day)::integer)
        and ((date_trunc('week', p_day)::date - date_trunc('week', p_starts_on)::date) / 7)
            % greatest((p_rule ->> 'every')::integer, 1) = 0
      when 'monthly' then
        extract(day from p_day)::integer = least(
          (p_rule ->> 'day')::integer,
          extract(day from date_trunc('month', p_day) + interval '1 month - 1 day')::integer)
      else false
    end
$$;

revoke all on function private.recurring_item_due(jsonb, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- recurring_items
-- ---------------------------------------------------------------------------------------------

-- Deleting the article deletes its Dauerposten (with tombstone); merge_articles moves it first.
create table public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  article_id uuid not null,
  count integer
    constraint recurring_items_count_valid check (count between 1 and 10000),
  qty numeric
    constraint recurring_items_qty_valid check (qty > 0 and qty <= 1000000),
  unit text
    constraint recurring_items_unit_length check (char_length(unit) <= 20),
  note text
    constraint recurring_items_note_length check (char_length(note) <= 200),
    constraint recurring_items_note_no_control check (note !~ '[[:cntrl:]]'),
  rule jsonb not null
    constraint recurring_items_rule_valid check (private.is_series_rule(rule) and rule ->> 'type' <> 'yearly'),
  starts_on date not null
    constraint recurring_items_starts_on_valid check (starts_on between date '2000-01-01' and date '2999-12-31'),
  paused boolean not null default false,
  last_added_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_items_household_id_id_key unique (household_id, id),
  constraint recurring_items_one_per_article unique (household_id, article_id),
  constraint recurring_items_amount_one_kind check (count is null or (qty is null and unit is null)),
  constraint recurring_items_unit_needs_qty check (unit is null or qty is not null),
  constraint recurring_items_article_fkey foreign key (household_id, article_id)
    references public.articles (household_id, id) on delete cascade
);

create index recurring_items_household_id_updated_at_idx on public.recurring_items (household_id, updated_at);

grant select, delete on public.recurring_items to authenticated;
grant insert (id, household_id, article_id, count, qty, unit, note, rule, starts_on, paused)
  on public.recurring_items to authenticated;
grant update (count, qty, unit, note, rule, starts_on, paused) on public.recurring_items to authenticated;
select private.attach_household_policies('public.recurring_items');
select private.attach_sync_triggers('public.recurring_items');

-- ---------------------------------------------------------------------------------------------
-- shopping_contributions: "recurring" with its Dauerposten and day
-- ---------------------------------------------------------------------------------------------

alter table public.shopping_contributions
  drop constraint shopping_contributions_source_valid,
  add constraint shopping_contributions_source_valid check (
    jsonb_typeof(source) = 'object'
    and case coalesce(source ->> 'kind', '')
      when 'manual' then true
      when 'recipe' then coalesce(jsonb_typeof(source -> 'recipeId') = 'string'
                                  and jsonb_typeof(source -> 'label') = 'string', false)
      when 'recurring' then coalesce(
        jsonb_typeof(source -> 'recurringItemId') = 'string'
        and (source ->> 'recurringItemId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        and jsonb_typeof(source -> 'on') = 'string'
        and (source ->> 'on') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', false)
      else false
    end
    and octet_length(source::text) <= 1000);

-- After a contribution "regelmäßig" is saved (the scheduler, "Aus Kalender", a restore): its day
-- counts as brought, so the scheduler does not add it again that day (Decision 7). Only a
-- Dauerposten of the contribution's own household and only days from yesterday to eight days
-- ahead in its time zone (AC-030); anything else changes nothing. Security definer: members have
-- no grant on last_added_on.
create function private.recurring_contribution_marks_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_on date;
begin
  if new.source ->> 'kind' is distinct from 'recurring' then
    return null;
  end if;
  begin
    v_on := (new.source ->> 'on')::date;
  exception when others then
    return null;
  end;
  update public.recurring_items r
  set last_added_on = v_on
  from public.households h
  where r.id = (new.source ->> 'recurringItemId')::uuid
    and r.household_id = new.household_id
    and h.id = r.household_id
    and v_on between (now() at time zone h.timezone)::date - 1 and (now() at time zone h.timezone)::date + 8
    and (r.last_added_on is null or r.last_added_on < v_on);
  return null;
end
$$;

revoke all on function private.recurring_contribution_marks_day() from public, anon, authenticated;

create trigger shopping_contributions_recurring_marks_day after insert on public.shopping_contributions
  for each row execute function private.recurring_contribution_marks_day();

-- ---------------------------------------------------------------------------------------------
-- The scheduler
-- ---------------------------------------------------------------------------------------------

-- Puts every active Dauerposten that is due on its household's day at p_now onto the list, unless
-- it already came that day (last_added_on). Per Dauerposten, under the lock per (household,
-- article) of the store actions: when the open item of the article still has a contribution of it,
-- nothing is added (AC-015); else an open item gets the contribution, a checked one is reopened
-- with only it (core addContribution), without one a new item is created. Either way the day is
-- marked. Returns the number of contributions added. Run by pg_cron only.
create function private.add_due_recurring_items(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due record;
  v_last date;
  v_item_id uuid;
  v_checked boolean;
  v_added integer := 0;
begin
  for v_due in
    -- "Today" per household, only for zones Postgres knows: one invalid value never stops the run
    -- for everyone (as Decision 16 of spec 0013). Materialized, so the conversion runs only on
    -- rows that passed the filter.
    with days as materialized (
      select h.id as household_id, (p_now at time zone h.timezone)::date as today
      from public.households h
      where h.timezone in (select z.name from pg_catalog.pg_timezone_names z)
    )
    select r.id, r.household_id, r.article_id, d.today
    from public.recurring_items r
    join days d on d.household_id = r.household_id
    where not r.paused
      and private.recurring_item_due(r.rule, r.starts_on, d.today)
      and (r.last_added_on is null or r.last_added_on < d.today)
    order by r.household_id, r.article_id
  loop
    perform private.lock_household_article(v_due.household_id, v_due.article_id);
    -- Again under the lock: a run or a member may have brought it meanwhile, or paused it.
    select r.last_added_on into v_last
    from public.recurring_items r
    where r.id = v_due.id and not r.paused
    for update;
    if not found or v_last >= v_due.today then
      continue;
    end if;

    v_item_id := null;
    v_checked := null;
    select i.id, i.checked into v_item_id, v_checked
    from public.shopping_items i
    where i.household_id = v_due.household_id and i.article_id = v_due.article_id
    for update;

    if v_item_id is null or v_checked or not exists (
      select 1 from public.shopping_contributions c
      where c.household_id = v_due.household_id and c.item_id = v_item_id
        and c.source ->> 'kind' = 'recurring' and c.source ->> 'recurringItemId' = v_due.id::text
    ) then
      if v_item_id is not null and v_checked then
        delete from public.shopping_contributions c
        where c.household_id = v_due.household_id and c.item_id = v_item_id;
        update public.shopping_items i
        set checked = false, checked_at = null, checked_by = null, not_available = false,
            checked_on_list = false, check_seq = i.check_seq + 1
        where i.id = v_item_id;
      elsif v_item_id is null then
        insert into public.shopping_items (household_id, article_id)
        values (v_due.household_id, v_due.article_id)
        returning id into v_item_id;
      end if;
      insert into public.shopping_contributions (household_id, item_id, source, count, qty, unit, note)
      select r.household_id, v_item_id,
             jsonb_build_object('kind', 'recurring', 'recurringItemId', r.id::text, 'on', v_due.today::text),
             r.count, r.qty, r.unit, r.note
      from public.recurring_items r
      where r.id = v_due.id;
      v_added := v_added + 1;
    end if;

    update public.recurring_items r set last_added_on = v_due.today where r.id = v_due.id;
  end loop;
  return v_added;
end
$$;

revoke all on function private.add_due_recurring_items(timestamptz) from public, anon, authenticated;

select cron.schedule('add-due-recurring-items', '5 * * * *', 'select private.add_due_recurring_items()');

-- ---------------------------------------------------------------------------------------------
-- apply_changes: recurring_items (otherwise unchanged from 20261126211710)
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
  -- A Dauerposten keeps its article; last_added_on is the server's (spec 0060, Decision 7).
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
                              "patch":  [], "delete": false},
    "recurring_items":  {"insert": ["id", "household_id", "article_id", "count", "qty", "unit", "note", "rule",
                                    "starts_on", "paused"],
                         "patch":  ["count", "qty", "unit", "note", "rule", "starts_on", "paused"], "delete": true},
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
-- sync_pull: recurring_items (otherwise unchanged from 20261126111313)
-- ---------------------------------------------------------------------------------------------

create or replace function public.sync_pull(p_request jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  -- The synced household tables (db-handoff T6, spec 0004; packing tables spec 0012; collection_recipes
  -- spec 0009; notification_settings spec 0013, where RLS returns only the caller's own row; trips and
  -- trip_members spec 0022; activity_kinds, activity_series, activity_series_exceptions spec 0041;
  -- recurring_items spec 0060).
  -- Small tables are listed separately below.
  c_tables constant text[] := array[
    'areas', 'articles', 'stores',
    'recipes', 'recipe_favorites', 'recipe_ratings', 'collection_recipes',
    'restaurants', 'restaurant_favorites', 'restaurant_ratings',
    'activities', 'activity_favorites', 'activity_ratings',
    'activity_kinds', 'activity_series', 'activity_series_exceptions',
    'trips', 'trip_members', 'feedback', 'feedback_votes',
    'packing_bags', 'packing_bag_items', 'packing_list_bags', 'packing_items',
    'chores', 'chore_events', 'meal_plan_entries', 'notification_settings',
    'recurring_items', 'shopping_items', 'shopping_contributions'];

  v_household_id uuid;
  v_request jsonb;
  v_full boolean;
  v_since jsonb;
  v_table text;
  v_table_rows jsonb;
  v_rows jsonb;
  v_tombstones jsonb;
  v_households jsonb := '{}';
begin
  if jsonb_typeof(p_request) is distinct from 'object'
     or jsonb_typeof(p_request -> 'households') is distinct from 'object' then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  for v_household_id, v_request in
    select h.id, r.value
    from jsonb_each(p_request -> 'households') r
    join private.my_household_ids() h (id) on h.id::text = lower(r.key)
  loop
    v_full := v_request ->> 'full' is distinct from 'false';
    v_since := case when not v_full and jsonb_typeof(v_request -> 'since') = 'object'
                    then v_request -> 'since' else '{}'::jsonb end;

    v_rows := '{}';
    foreach v_table in array c_tables loop
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t '
        'where t.household_id = $1 and ($2::timestamptz is null or t.updated_at > $2)',
        v_table)
      into v_table_rows
      using v_household_id, (v_since ->> v_table)::timestamptz;
      v_rows := v_rows || jsonb_build_object(v_table, v_table_rows);
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object('table', d.table_name, 'id', d.record_id, 'deletedAt', d.deleted_at)
                              order by d.deleted_at), '[]'::jsonb)
    into v_tombstones
    from public.deleted_records d
    where d.household_id = v_household_id
      and d.table_name = any (c_tables)
      and (not v_since ? d.table_name or d.deleted_at > (v_since ->> d.table_name)::timestamptz);

    v_households := v_households || jsonb_build_object(v_household_id::text, jsonb_build_object(
      'full', v_full, 'rows', v_rows, 'tombstones', v_tombstones));
  end loop;

  return jsonb_build_object(
    'serverTime', now(),
    'small', jsonb_build_object(
      'profiles', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) from public.profiles p),
      'households', (select coalesce(jsonb_agg(to_jsonb(h) order by h.id), '[]'::jsonb) from public.households h),
      'household_members', (select coalesce(jsonb_agg(to_jsonb(m) order by m.household_id, m.profile_id), '[]'::jsonb)
                            from public.household_members m),
      'household_invitations', (select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb)
                                from public.household_invitations i)),
    'households', v_households);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- merge_articles: the Dauerposten moves with the article (otherwise unchanged from 20261122192847)
-- ---------------------------------------------------------------------------------------------

create or replace function private.merge_articles(p_source_id uuid, p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_source public.articles;
  v_target public.articles;
  v_source_item public.shopping_items;
  v_target_item public.shopping_items;
  v_recipes integer;
  v_items integer := 0;
  v_synonyms text[];
  v_synonym_keys text[];
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_source_id is null or p_target_id is null or p_source_id = p_target_id then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  select a.household_id into v_household_id
  from public.articles a
  where a.id = p_source_id and a.household_id in (select private.my_household_ids());
  if v_household_id is null
     or not exists (select 1 from public.articles a where a.id = p_target_id and a.household_id = v_household_id) then
    raise exception 'article_not_found' using errcode = 'P0002';
  end if;

  perform private.lock_household_article(v_household_id, least(p_source_id, p_target_id));
  perform private.lock_household_article(v_household_id, greatest(p_source_id, p_target_id));
  -- The recipes of the source before the articles: an ingredient change locks its recipe row and
  -- then reads the articles `for key share` (recipes_check_ingredients). Taking the locks in the
  -- same order means one waits for the other instead of a deadlock (40P01).
  perform 1 from public.recipes r
  where r.household_id = v_household_id
    and r.ingredients @> jsonb_build_array(jsonb_build_object('articleId', p_source_id::text))
  order by r.id
  for update;
  perform 1 from public.articles a where a.id in (p_source_id, p_target_id) order by a.id for update;
  select a.* into v_source from public.articles a where a.id = p_source_id and a.household_id = v_household_id;
  select a.* into v_target from public.articles a where a.id = p_target_id and a.household_id = v_household_id;
  if v_source.id is null or v_target.id is null then
    raise exception 'article_not_found' using errcode = 'P0002';
  end if;

  -- 1. Recipes.
  update public.recipes r
  set ingredients = (
    select jsonb_agg(case when x.e ->> 'articleId' = p_source_id::text
                          then jsonb_set(x.e, '{articleId}', to_jsonb(p_target_id::text))
                          else x.e end
                     order by x.ord)
    from jsonb_array_elements(r.ingredients) with ordinality as x (e, ord))
  where r.household_id = v_household_id
    and r.ingredients @> jsonb_build_array(jsonb_build_object('articleId', p_source_id::text));
  get diagnostics v_recipes = row_count;

  -- 2. The item of the source.
  select i.* into v_source_item
  from public.shopping_items i
  where i.household_id = v_household_id and i.article_id = p_source_id
  for update;
  select i.* into v_target_item
  from public.shopping_items i
  where i.household_id = v_household_id and i.article_id = p_target_id
  for update;
  if v_source_item.id is not null and v_target_item.id is null then
    update public.shopping_items i set article_id = p_target_id where i.id = v_source_item.id;
    v_items := 1;
  elsif v_source_item.id is not null then
    if not v_source_item.checked then
      if v_target_item.checked then
        delete from public.shopping_contributions c
        where c.household_id = v_household_id and c.item_id = v_target_item.id;
        update public.shopping_items i
        set checked = false, checked_at = null, checked_by = null, not_available = false,
            checked_on_list = false, check_seq = i.check_seq + 1
        where i.id = v_target_item.id;
      end if;
      update public.shopping_contributions c
      set item_id = v_target_item.id
      where c.household_id = v_household_id and c.item_id = v_source_item.id;
    end if;
    delete from public.shopping_items i where i.id = v_source_item.id;
    update public.deleted_records d
    set replaced_by = v_target_item.id::text
    where d.household_id = v_household_id and d.table_name = 'shopping_items'
      and d.record_id = v_source_item.id::text and d.replaced_by is null;
    v_items := 1;
  end if;

  -- 2b. The Dauerposten of the source (spec 0060, AC-012): to the target when it has none; else it
  -- goes with the source (cascade, with tombstone).
  update public.recurring_items r
  set article_id = p_target_id
  where r.household_id = v_household_id and r.article_id = p_source_id
    and not exists (select 1 from public.recurring_items t
                    where t.household_id = v_household_id and t.article_id = p_target_id);

  -- 3. Empty values of the target.
  update public.articles a
  set area_id = coalesce(a.area_id, v_source.area_id),
      diet = case when a.diet = 'unknown' then v_source.diet else a.diet end,
      default_shopping_rule = coalesce(a.default_shopping_rule, v_source.default_shopping_rule),
      needs_review = false
  where a.id = p_target_id;

  -- 4. The source.
  delete from public.articles a where a.id = p_source_id;

  -- 5. Names of the source as synonyms of the target, in order, without duplicate keys.
  select coalesce(array_agg(n.synonym order by n.ord), '{}'), coalesce(array_agg(n.key order by n.ord), '{}')
  into v_synonyms, v_synonym_keys
  from (
    select distinct on (c.key) c.synonym, c.key, c.ord
    from (
      select t.synonym, t.key, t.ord
      from unnest(v_target.synonyms, v_target.synonym_keys) with ordinality as t (synonym, key, ord)
      union all
      select v_source.name, v_source.name_key, 1000
      union all
      select s.synonym, s.key, 1000 + s.ord
      from unnest(v_source.synonyms, v_source.synonym_keys) with ordinality as s (synonym, key, ord)
    ) c
    where c.key is not null and c.synonym is not null and c.key <> v_target.name_key
    order by c.key, c.ord
  ) n;
  -- The limits of articles_synonyms_size and articles_synonym_keys_size, named like the count.
  if cardinality(v_synonyms) > 30
     or char_length(array_to_string(v_synonyms, '')) > 2000
     or char_length(array_to_string(v_synonym_keys, '')) > 2000 then
    raise exception 'too_many_synonyms' using errcode = '22023';
  end if;
  update public.articles a
  set synonyms = v_synonyms, synonym_keys = v_synonym_keys
  where a.id = p_target_id;

  return jsonb_build_object('recipes', v_recipes, 'items', v_items);
end
$$;
