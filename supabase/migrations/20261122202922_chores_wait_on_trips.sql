-- Spec 0026 — chores: Termine, Später, Nachtragen und Reisen.
--
-- * Trips move chores (REQ-011 to REQ-014): a stored date waits for the first day somebody who can
--   do the chore is at home ("frei"); an alternating chore goes to the next person of the rotation
--   who is at home. Nothing is stored. The rules are those of packages/core (chore-schedule.ts,
--   ADR-0014); notification_parity.test.sql checks both with the same fixtures and names.
--   Only trips of the chore's own household count (trips / trip_members of spec 0022).
-- * Flexible chores count from next_due_on (decision 7), else from the last time.
-- * The daily summary says "fällig seit gestern" / "fällig seit n Tagen" instead of
--   "überfällig"; chore reminders fire on the day after trips at the chore's time.
-- * complete_chore accepts days from current_date - 31 to + 1 (REQ-007, decision 11).
-- * change_chore_event_day: a new domain op of apply_changes moves an entry to another day; for
--   the latest booked entry of a chore that still exists the chore's date and last time follow.
-- * chore_assignees takes the day (the stand-in depends on it); the old signature is dropped.

-- ---------------------------------------------------------------------------------------------
-- The trip rule (core canDoChoreOn, firstFreeDay, storedDueOn, choreDueOn, flexibleProgress,
-- choreDueState, choreShownOn, choreTurn, choreDueLabel)
-- ---------------------------------------------------------------------------------------------

-- The rotation in its order, only people who are members of the chore's household.
create function private.chore_rotation(p_chore public.chores)
returns table (member_id uuid, pos bigint)
language sql
stable
set search_path = ''
as $$
  select m.profile_id, x.ord
  from jsonb_array_elements_text(
         case when (p_chore).assignment ->> 'type' = 'rotating'
                   and jsonb_typeof((p_chore).assignment -> 'memberIds') = 'array'
              then (p_chore).assignment -> 'memberIds' else '[]' end) with ordinality x (e, ord)
  join public.household_members m
    on m.household_id = (p_chore).household_id and m.profile_id = private.try_uuid(x.e)
  order by x.ord
$$;

-- core canDoChoreOn: somebody who can do the chore is at home that day. Fixed: the fixed person;
-- rotating: anyone of the rotation; anyone: anyone of the household; together: everyone. Nobody
-- to wait for counts as free. "Away" is private.is_silent: on a trip of this household.
create function private.chore_can_do_on(p_chore public.chores, p_day date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.trips t
                     where t.household_id = (p_chore).household_id and p_day between t.from_on and t.to_on) then true
    when (p_chore).assignment ->> 'type' = 'fixed' then
      not private.is_silent((p_chore).household_id,
                            coalesce((p_chore).next_assignee_id, private.try_uuid((p_chore).assignment ->> 'memberId')),
                            p_day)
    when (p_chore).assignment ->> 'type' = 'rotating' then
      not exists (select 1 from private.chore_rotation(p_chore))
      or exists (select 1 from private.chore_rotation(p_chore) r
                 where not private.is_silent((p_chore).household_id, r.member_id, p_day))
    when (p_chore).assignment ->> 'type' = 'together' then
      not exists (select 1 from public.household_members m
                  where m.household_id = (p_chore).household_id
                    and private.is_silent(m.household_id, m.profile_id, p_day))
    else
      not exists (select 1 from public.household_members m where m.household_id = (p_chore).household_id)
      or exists (select 1 from public.household_members m
                 where m.household_id = (p_chore).household_id
                   and not private.is_silent(m.household_id, m.profile_id, p_day))
  end
$$;

-- core firstFreeDay: the first free day from p_from on; gives up after MAX_WAIT_DAYS = 400 days.
-- A day after p_from can only become free the day after a trip of the household ends, so only
-- p_from and those days are checked (the same result as core's day-by-day search, but bounded by
-- the number of trips rather than days: the scheduler runs this for every chore on every tick).
create function private.chore_first_free_day(p_chore public.chores, p_from date)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  c_max_wait_days constant integer := 400;
  v_day date;
begin
  if p_from is null then
    return null;
  end if;
  for v_day in
    select p_from
    union
    select t.to_on + 1
    from public.trips t
    where t.household_id = (p_chore).household_id
      and t.to_on + 1 > p_from and t.to_on + 1 < p_from + c_max_wait_days
    order by 1
  loop
    if private.chore_can_do_on(p_chore, v_day) then
      return v_day;
    end if;
  end loop;
  return p_from + c_max_wait_days;
end
$$;

-- core flexibleEvery: the whole days of a flexible interval, at least 1; null for other rhythms.
create function private.chore_every_days(p_chore public.chores)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when (p_chore).recurrence ->> 'type' = 'flexible'
                   and jsonb_typeof((p_chore).recurrence -> 'everyDays') = 'number'
              then greatest(1, floor(((p_chore).recurrence ->> 'everyDays')::numeric))::integer end
$$;

-- core storedDueOn: next_due_on; a flexible chore without one counts from its last time.
create function private.chore_stored_due_on(p_chore public.chores)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when (p_chore).recurrence ->> 'type' = 'asNeeded' then null
    when (p_chore).next_due_on is not null then (p_chore).next_due_on
    else (p_chore).last_done_on + private.chore_every_days(p_chore)
  end
$$;

-- core choreDueOn: "Termin nach REQ-011" and the day overdue days count from ("Zähltag").
create function private.chore_count_day(p_chore public.chores)
returns date
language sql
stable
set search_path = ''
as $$ select private.chore_first_free_day(p_chore, private.chore_stored_due_on(p_chore)) $$;

-- core flexibleProgress: the share of the interval passed on p_day, counted back from the stored
-- date (decision 7); 1 without an interval or a date.
create function private.chore_flexible_progress(p_chore public.chores, p_day date)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof((p_chore).recurrence -> 'everyDays') is distinct from 'number'
      or ((p_chore).recurrence ->> 'everyDays')::numeric <= 0 then 1
    when private.chore_stored_due_on(p_chore) is null then 1
    else greatest(0, p_day - (private.chore_stored_due_on(p_chore) - private.chore_every_days(p_chore)))::numeric
         / private.chore_every_days(p_chore)
  end
$$;

-- core choreDueState: 'overdue', 'today', 'flexible_due' (FLEXIBLE_DUE_FROM = 0.8 of the
-- interval passed) or null (not due, paused, "bei Bedarf", or nobody who can do it is at home).
create or replace function private.chore_due_state(p_chore public.chores, p_day date)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when (p_chore).recurrence ->> 'type' = 'asNeeded' then null
    when private.chore_is_paused(p_chore, p_day) then null
    when not private.chore_can_do_on(p_chore, p_day) then null
    when (p_chore).recurrence ->> 'type' = 'flexible' then
      case when private.chore_flexible_progress(p_chore, p_day) >= 0.8 then 'flexible_due' end
    when private.chore_count_day(p_chore) is null then null
    when private.chore_count_day(p_chore) = p_day then 'today'
    when private.chore_count_day(p_chore) < p_day then 'overdue'
  end
$$;

-- core choreShownOn: p_day while the chore is due, else the first free day from the later of its
-- Zähltag and p_day; whose turn it is counts for this day (decision 16).
create function private.chore_shown_day(p_chore public.chores, p_day date)
returns date
language sql
stable
set search_path = ''
as $$
  select case
    when private.chore_due_state(p_chore, p_day) is not null then p_day
    else private.chore_first_free_day(p_chore, greatest(coalesce(private.chore_count_day(p_chore), p_day), p_day))
  end
$$;

-- core choreTurn (actingId): fixed → the fixed person; rotating → the regular person (the next
-- person when she is in the rotation, else its first), or when she is away on the shown day the
-- next one of the rotation who is at home; else null.
create function private.chore_acting_assignee(p_chore public.chores, p_day date)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_rotation uuid[];
  v_regular uuid;
  v_day date;
  v_start integer;
  v_id uuid;
begin
  if (p_chore).assignment ->> 'type' = 'fixed' then
    return coalesce((p_chore).next_assignee_id, private.try_uuid((p_chore).assignment ->> 'memberId'));
  end if;
  if (p_chore).assignment ->> 'type' is distinct from 'rotating' then
    return null;
  end if;
  select array_agg(r.member_id order by r.pos) into v_rotation from private.chore_rotation(p_chore) r;
  if v_rotation is null then
    return null;
  end if;
  v_regular := case when (p_chore).next_assignee_id = any (v_rotation) then (p_chore).next_assignee_id
                    else v_rotation[1] end;
  v_day := private.chore_shown_day(p_chore, p_day);
  v_start := array_position(v_rotation, v_regular);
  for v_offset in 0 .. cardinality(v_rotation) - 1 loop
    v_id := v_rotation[((v_start - 1 + v_offset) % cardinality(v_rotation)) + 1];
    if not private.is_silent((p_chore).household_id, v_id, v_day) then
      return v_id;
    end if;
  end loop;
  return v_regular;
end
$$;

-- Who is reminded of a chore on p_day (spec 0013, Decision 9; spec 0026, REQ-012): fixed → the
-- fixed person; rotating → who does it that day (the stand-in for someone away), without a next
-- person everyone in the rotation; anyone and together → empty, meaning all members. Ids that are
-- no (longer) members drop out when joined with the members.
create function private.chore_assignees(p_chore public.chores, p_day date)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select case (p_chore).assignment ->> 'type'
    when 'fixed' then array_remove(array[private.chore_acting_assignee(p_chore, p_day)], null)
    when 'rotating' then
      case when (p_chore).next_assignee_id is not null
           then array[coalesce(private.chore_acting_assignee(p_chore, p_day), (p_chore).next_assignee_id)]
           else array(select private.try_uuid(e)
                      from jsonb_array_elements_text(
                        case when jsonb_typeof((p_chore).assignment -> 'memberIds') = 'array'
                             then (p_chore).assignment -> 'memberIds' else '[]' end) with ordinality x (e, ord)
                      where private.try_uuid(e) is not null
                      order by ord)
      end
    else '{}'::uuid[]
  end
$$;

-- core choreDayLabel: "Fr 11.12.", with the year when it is not the year of p_today.
create function private.chore_day_label(p_day date, p_today date)
returns text
language sql
immutable
set search_path = ''
as $$
  select private.weekday_short(p_day) || ' ' || to_char(p_day, 'FMDD.FMMM.')
         || case when extract(year from p_day) <> extract(year from p_today) then to_char(p_day, 'YYYY') else '' end
$$;

-- core choreDueLabel (REQ-009): "heute", "heute, nach der Reise", "fällig seit gestern",
-- "fällig seit n Tagen", "nach der Reise am Fr 11.12.", "jetzt fällig", "bald fällig"; null when
-- there is nothing to say. The daily summary uses it for overdue chores.
create function private.chore_due_text(p_chore public.chores, p_day date)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_state text;
  v_stored date;
  v_due date;
  v_next date;
begin
  if (p_chore).recurrence ->> 'type' = 'asNeeded' or private.chore_is_paused(p_chore, p_day) then
    return null;
  end if;
  v_state := private.chore_due_state(p_chore, p_day);
  if v_state = 'flexible_due' then
    return case when private.chore_flexible_progress(p_chore, p_day) >= 1 then 'jetzt fällig' else 'bald fällig' end;
  end if;
  v_stored := private.chore_stored_due_on(p_chore);
  v_due := private.chore_count_day(p_chore);
  if v_state = 'overdue' then
    return case when p_day - v_due = 1 then 'fällig seit gestern' else 'fällig seit ' || (p_day - v_due) || ' Tagen' end;
  end if;
  v_next := case when v_state is not null then v_due else private.chore_shown_day(p_chore, p_day) end;
  if v_state = 'today' then
    return case when v_next is distinct from v_stored then 'heute, nach der Reise' else 'heute' end;
  end if;
  if (p_chore).recurrence ->> 'type' = 'flexible' then
    if private.chore_flexible_progress(p_chore, p_day) < 0.8 or private.chore_can_do_on(p_chore, p_day) then
      return null;
    end if;
    return 'nach der Reise am ' || private.chore_day_label(private.chore_first_free_day(p_chore, p_day), p_day);
  end if;
  if v_stored is null or v_next = v_stored then
    return null;
  end if;
  return 'nach der Reise am ' || private.chore_day_label(v_next, p_day);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Notifications by the same rule (REQ-014)
-- ---------------------------------------------------------------------------------------------

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
             when 'activity' then a.name || private.parenthesize(array[e.note, sl.name])
             when 'restaurant' then r.name || private.parenthesize(array[sl.name, private.format_time(e.reserved_at)])
             else
               case e.kind
                 when 'leftovers' then 'Reste: ' || coalesce(rc.title, src_rc.title, src.text, 'Reste')
                 when 'text' then e.text
                 else rc.title
               end
               || private.parenthesize(array[sl.name, case when e.cook_id = p_profile_id then 'du kochst' end])
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

  -- Spec 0026 (REQ-009, REQ-011, REQ-012): due after trips, the stand-in of a rotation, "fällig
  -- seit …" instead of "überfällig", in the order of core dueChores.
  select coalesce(array_agg(x.segment order by x.rank, x.overdue_since desc nulls last, x.stored, x.title, x.id), '{}')
  into v_chores
  from (
    select c.id, c.title,
           case st.state when 'overdue' then 0 when 'today' then 1 else 2 end as rank,
           case when st.state = 'overdue' then private.chore_count_day(c) end as overdue_since,
           private.chore_stored_due_on(c) as stored,
           c.title || private.parenthesize(array[
             case when c.assignment ->> 'type' in ('fixed', 'rotating') then 'du' end,
             case when st.state = 'today' then private.format_time(c.due_time) end,
             case when st.state = 'overdue' then private.chore_due_text(c, p_day) end]) as segment
    from public.chores c
    cross join lateral (select private.chore_due_state(c, p_day) as state, private.chore_assignees(c, p_day) as assignees) st
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


create or replace function private.chore_reminder_candidates(p_now timestamptz)
returns table (household_id uuid, profile_id uuid, kind text, dedupe_key text, due_at timestamptz,
               expires_at timestamptz, title text, body text, url text)
language sql
stable
set search_path = ''
as $$
  with due as (
    select c.id, c.household_id, c.title, c.due_time, c.assignment ->> 'type' as assignment_type,
           private.chore_assignees(c, d.day) as assignees, h.timezone, d.day,
           (d.day + c.due_time) at time zone h.timezone as due_at
    from private.notification_households(p_now) h
    join public.chores c on c.household_id = h.household_id
    cross join lateral (values (h.today - 1), (h.today)) d (day)
    where c.due_time is not null
      and c.recurrence ->> 'type' <> 'asNeeded'
      and not private.chore_is_paused(c, d.day)
      -- Spec 0026: the day after trips (REQ-011); a chore with a time always has a date.
      and c.next_due_on is not null
      and private.chore_count_day(c) = d.day
  )
  select due.household_id, m.profile_id, 'chore_reminder',
         format('chore:%s:%s', due.id, due.day), due.due_at,
         (due.day + 1)::timestamp at time zone due.timezone, 'Housekeeping',
         left(due.title || ' · ' || private.format_time(due.due_time)
              || case when due.assignment_type in ('fixed', 'rotating') then ' · du bist dran' else '' end, 400),
         format('/haushalt?aufgabe=%s&haushalt=%s', due.id, due.household_id)
  from due
  join public.household_members m on m.household_id = due.household_id
  join public.notification_settings s
    on s.household_id = m.household_id and s.member_id = m.profile_id and s.chore_reminders_enabled
  where due.due_at <= p_now and due.due_at >= p_now - interval '30 minutes'
    and (cardinality(due.assignees) = 0 or m.profile_id = any (due.assignees))
    and not private.is_silent(due.household_id, m.profile_id, due.day)
$$;


-- The callers above take the day now.
drop function private.chore_assignees(public.chores);

-- ---------------------------------------------------------------------------------------------
-- complete_chore: 30 days back (REQ-007, decision 11); unchanged otherwise
-- ---------------------------------------------------------------------------------------------

create or replace function private.complete_chore(p_household_id uuid, p_op jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_keys constant text[] := array['chore_id', 'event_id', 'kind', 'done_on', 'done_by', 'seen', 'next_due_on',
                                  'next_assignee_id'];
  c_seen_keys constant text[] := array['next_due_on', 'last_done_on', 'next_assignee_id', 'latest_event_id'];
  v_chore public.chores;
  v_seen jsonb := p_op -> 'seen';
  v_kind text := p_op ->> 'kind';
  v_event_id uuid;
  v_done_on date;
  v_done_by uuid;
  v_next_due_on date;
  v_next_assignee_id uuid;
  v_other record;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  if jsonb_typeof(p_op) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_op) k where k <> all (c_keys))
     or jsonb_typeof(p_op -> 'chore_id') is distinct from 'string'
     or jsonb_typeof(p_op -> 'event_id') is distinct from 'string'
     or jsonb_typeof(p_op -> 'done_on') is distinct from 'string'
     or jsonb_typeof(p_op -> 'done_by') is distinct from 'string'
     or jsonb_typeof(coalesce(p_op -> 'next_due_on', 'null')) not in ('string', 'null')
     or jsonb_typeof(coalesce(p_op -> 'next_assignee_id', 'null')) not in ('string', 'null')
     or jsonb_typeof(v_seen) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(v_seen) k where k <> all (c_seen_keys))
     or jsonb_typeof(coalesce(v_seen -> 'latest_event_id', 'null')) not in ('string', 'null')
     or v_kind is null or v_kind not in ('done', 'skipped') then
    raise exception 'invalid_change' using errcode = '22023';
  end if;
  v_event_id := (p_op ->> 'event_id')::uuid;
  v_done_on := (p_op ->> 'done_on')::date;
  v_done_by := (p_op ->> 'done_by')::uuid;
  v_next_due_on := (p_op ->> 'next_due_on')::date;
  v_next_assignee_id := (p_op ->> 'next_assignee_id')::uuid;
  if v_done_on not between current_date - 31 and current_date + 1 or v_next_due_on <= v_done_on then
    raise exception 'invalid_change' using errcode = '22023';
  end if;

  select * into v_chore
  from public.chores c
  where c.household_id = p_household_id and c.id = (p_op ->> 'chore_id')::uuid
  for update;
  if not found then
    raise exception 'chore_not_found' using errcode = 'P0002';
  end if;

  -- The latest booked event as well: a second booking of a flexible chore for anyone on the same
  -- day leaves date, last time and person exactly as they were (AC-031).
  if (v_seen ->> 'next_due_on')::date is distinct from v_chore.next_due_on
     or (v_seen ->> 'last_done_on')::date is distinct from v_chore.last_done_on
     or (v_seen ->> 'next_assignee_id')::uuid is distinct from v_chore.next_assignee_id
     or (v_seen ->> 'latest_event_id')::uuid is distinct from (
       select e.id from public.chore_events e
       where e.household_id = p_household_id and e.chore_id = v_chore.id
       order by e.created_at desc, e.id desc
       limit 1) then
    select e.done_by, e.created_at into v_other
    from public.chore_events e
    where e.household_id = p_household_id and e.chore_id = v_chore.id and e.kind = 'done' and e.done_on = v_done_on
    order by e.created_at desc, e.id desc
    limit 1;
    if found then
      raise exception 'already_done' using errcode = 'P0001',
        detail = jsonb_build_object('done_by', v_other.done_by, 'done_at', v_other.created_at)::text;
    end if;
    raise exception 'chore_changed' using errcode = 'P0001';
  end if;

  if v_chore.recurrence ->> 'type' = 'asNeeded' and v_next_due_on is not null then
    raise exception 'invalid_change' using errcode = '22023';
  end if;

  insert into public.chore_events (id, household_id, chore_id, title, kind, done_on, done_by,
                                   prev_next_due_on, prev_last_done_on, prev_next_assignee_id, prev_recorded)
  values (v_event_id, p_household_id, v_chore.id, v_chore.title, v_kind, v_done_on, v_done_by,
          v_chore.next_due_on, v_chore.last_done_on, v_chore.next_assignee_id, true);

  if v_kind = 'done' and v_chore.recurrence ->> 'type' = 'once' then
    delete from public.chores c where c.household_id = p_household_id and c.id = v_chore.id;
  elsif v_kind = 'done' then
    update public.chores c
    set last_done_on = greatest(c.last_done_on, v_done_on),
        next_due_on = v_next_due_on,
        next_assignee_id = v_next_assignee_id
    where c.household_id = p_household_id and c.id = v_chore.id;
  else
    update public.chores c
    set next_due_on = v_next_due_on
    where c.household_id = p_household_id and c.id = v_chore.id;
  end if;

  return jsonb_build_object('event_id', v_event_id);
end
$$;


-- ---------------------------------------------------------------------------------------------
-- Booking 30 days back and moving an entry (REQ-007)
-- ---------------------------------------------------------------------------------------------

-- Moves one event of p_household_id to another day (spec 0026, REQ-007). p_op:
--   {event_id, done_on,
--    seen: {next_due_on, last_done_on, next_assignee_id, latest_event_id},  -- as complete_chore
--    next_due_on}                                -- the chore's new date, computed by core
-- The event is locked, then its chore. When the chore exists, it must still show `seen` (else
-- chore_changed, P0001). Only for the latest booked event (created_at, then id) of the chore that
-- recorded its state before (prev_recorded) the chore follows: next_due_on as sent (null for a
-- chore that is asNeeded by now), last_done_on = greatest(prev_last_done_on, done_on) for done,
-- unchanged for skipped; the person stays. Otherwise only done_on changes.
-- Errors: not_authenticated / not_member (42501); invalid_change (22023) for a malformed op,
-- done_on outside current_date - 31 … + 1, next_due_on not after done_on; chore_event_not_found
-- (P0002), also for an event of another household or one removed meanwhile (AC-023).
-- Returns {"event_id", "moved_chore"}.
create function private.change_chore_event_day(p_household_id uuid, p_op jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_keys constant text[] := array['event_id', 'done_on', 'seen', 'next_due_on'];
  c_seen_keys constant text[] := array['next_due_on', 'last_done_on', 'next_assignee_id', 'latest_event_id'];
  v_seen jsonb := p_op -> 'seen';
  v_event public.chore_events;
  v_chore public.chores;
  v_done_on date;
  v_next_due_on date;
  v_latest uuid;
  v_moved boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  if jsonb_typeof(p_op) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_op) k where k <> all (c_keys))
     or jsonb_typeof(p_op -> 'event_id') is distinct from 'string'
     or jsonb_typeof(p_op -> 'done_on') is distinct from 'string'
     or jsonb_typeof(coalesce(p_op -> 'next_due_on', 'null')) not in ('string', 'null')
     or jsonb_typeof(coalesce(v_seen, 'null')) not in ('object', 'null')
     or (jsonb_typeof(v_seen) = 'object'
         and (exists (select 1 from jsonb_object_keys(v_seen) k where k <> all (c_seen_keys))
              or jsonb_typeof(coalesce(v_seen -> 'latest_event_id', 'null')) not in ('string', 'null'))) then
    raise exception 'invalid_change' using errcode = '22023';
  end if;
  v_done_on := (p_op ->> 'done_on')::date;
  v_next_due_on := (p_op ->> 'next_due_on')::date;
  if v_done_on not between current_date - 31 and current_date + 1 or v_next_due_on <= v_done_on then
    raise exception 'invalid_change' using errcode = '22023';
  end if;

  -- Event first, then the chore: the same order as remove_chore_event.
  select * into v_event
  from public.chore_events e
  where e.household_id = p_household_id and e.id = (p_op ->> 'event_id')::uuid
  for update;
  if not found then
    raise exception 'chore_event_not_found' using errcode = 'P0002';
  end if;

  if v_event.chore_id is not null then
    select * into v_chore
    from public.chores c
    where c.household_id = p_household_id and c.id = v_event.chore_id
    for update;
  end if;

  if v_chore.id is not null then
    select e.id into v_latest
    from public.chore_events e
    where e.household_id = p_household_id and e.chore_id = v_chore.id
    order by e.created_at desc, e.id desc
    limit 1;
    if v_seen is null
       or (v_seen ->> 'next_due_on')::date is distinct from v_chore.next_due_on
       or (v_seen ->> 'last_done_on')::date is distinct from v_chore.last_done_on
       or (v_seen ->> 'next_assignee_id')::uuid is distinct from v_chore.next_assignee_id
       or (v_seen ->> 'latest_event_id')::uuid is distinct from v_latest then
      raise exception 'chore_changed' using errcode = 'P0001';
    end if;
    if v_latest = v_event.id and v_event.prev_recorded then
      update public.chores c
      set next_due_on = case when c.recurrence ->> 'type' = 'asNeeded' then null else v_next_due_on end,
          last_done_on = case when v_event.kind = 'done' then greatest(v_event.prev_last_done_on, v_done_on)
                              else c.last_done_on end
      where c.household_id = p_household_id and c.id = v_chore.id;
      v_moved := true;
    end if;
  end if;

  update public.chore_events e
  set done_on = v_done_on
  where e.household_id = p_household_id and e.id = v_event.id;
  return jsonb_build_object('event_id', v_event.id, 'moved_chore', v_moved);
end
$$;

-- Called by apply_changes (security invoker) as the member; PostgREST does not expose private.
grant execute on function private.change_chore_event_day(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- apply_changes: the domain op change_chore_event_day {change}
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
  -- their day changes only by change_chore_event_day (spec 0026, REQ-007).
  -- The packed state of packing items (packed, packed_at, packed_by, pack_seq) is written only by
  -- set_packing_items_packed and restore_packing_items; a packing item's name, quantity, "je Tag"
  -- and link to its Reisetasche are patched (spec 0022, REQ-009).
  -- A trip keeps its people in trip_members, which are only inserted and deleted; a bag of a
  -- packing list stays at its trip (spec 0022, Daten).
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
                                    "steps", "lead_time", "notes", "last_cooked_on", "cooked_count", "links"],
                         "patch":  ["title", "photo", "photo_path", "description", "servings", "total_minutes", "course",
                                    "cuisine", "tags", "variants", "ingredients", "steps", "lead_time", "notes",
                                    "last_cooked_on", "cooked_count", "links"], "delete": false},
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
    elsif v_kind = 'change_chore_event_day' then
      v_results := v_results || jsonb_build_array(private.change_chore_event_day(p_household_id, v_op -> 'change'));
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

