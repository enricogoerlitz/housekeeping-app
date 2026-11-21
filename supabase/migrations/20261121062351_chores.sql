-- Baseline (ADR-0012) — chores and their history (chore_events).
--
-- Person references must be members of the row's household: next_assignee_id, done_by and
-- prev_next_assignee_id by composite foreign keys to household_members (cleared when the person
-- is removed, so the history stays), the member ids inside `assignment` by a trigger.
--
-- Events are booked only by complete_chore and removed only by remove_chore_event, two domain ops
-- of apply_changes (spec 0011): members have no insert or delete grant on chore_events. Booking
-- is conditional on the chore state the device saw and records the state before it on the event
-- (prev_*), so removing the latest booked event can restore it. Next date and next person are
-- computed by core (ADR-0011); the database only checks the bounds.

-- ---------------------------------------------------------------------------------------------
-- chores
-- ---------------------------------------------------------------------------------------------

-- recurrence / assignment are the core Recurrence / Assignment unions; the checks pin the
-- discriminator and the member fields, the client validates the rest (Zod).
create table public.chores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null
    constraint chores_title_valid check (btrim(title) <> '' and char_length(title) <= 200),
  room text
    constraint chores_room_length check (char_length(room) <= 80),
  recurrence jsonb not null
    constraint chores_recurrence_valid check (
      jsonb_typeof(recurrence) = 'object'
      and coalesce(recurrence ->> 'type', '') in ('once', 'weekly', 'monthly', 'everyMonths', 'flexible', 'asNeeded')
      and octet_length(recurrence::text) <= 1000),
  assignment jsonb not null
    constraint chores_assignment_valid check (
      jsonb_typeof(assignment) = 'object'
      and case coalesce(assignment ->> 'type', '')
        when 'fixed' then coalesce(jsonb_typeof(assignment -> 'memberId') = 'string', false)
        when 'rotating' then coalesce(jsonb_typeof(assignment -> 'memberIds') = 'array'
                                      and jsonb_array_length(assignment -> 'memberIds') between 1 and 20, false)
        when 'anyone' then true
        when 'together' then true
        else false
      end
      and octet_length(assignment::text) <= 2000),
  effort smallint not null default 1
    constraint chores_effort_valid check (effort between 1 and 3),
  next_due_on date,
  next_assignee_id uuid,
  last_done_on date,
  -- null = all year.
  active_months smallint[]
    constraint chores_active_months_valid check (
      cardinality(active_months) between 1 and 12
      and active_months <@ '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- "Bei Bedarf" is never due (spec 0011, REQ-007).
  constraint chores_as_needed_never_due check (recurrence ->> 'type' <> 'asNeeded' or next_due_on is null),
  constraint chores_household_id_id_key unique (household_id, id),
  constraint chores_next_assignee_fkey foreign key (household_id, next_assignee_id)
    references public.household_members (household_id, profile_id) on delete set null (next_assignee_id)
);

create index chores_household_id_updated_at_idx on public.chores (household_id, updated_at);
create index chores_household_id_next_assignee_id_idx on public.chores (household_id, next_assignee_id);

-- Before insert or update: member ids newly put into `assignment` must be members. Ids already
-- there are not re-checked, so a removed member left in a rotation does not block other edits.
create function private.chores_check_members()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_added uuid[];
begin
  with assignments (assignment, is_new) as (
    values (new.assignment, true), (case when tg_op = 'UPDATE' then old.assignment end, false)
  ), member_ids as (
    select a.is_new, a.assignment ->> 'memberId' as id
    from assignments a where a.assignment ->> 'type' = 'fixed'
    union all
    select a.is_new, e.id
    from assignments a,
         jsonb_array_elements_text(
           case when a.assignment ->> 'type' = 'rotating' then a.assignment -> 'memberIds' else '[]' end
         ) as e (id)
  )
  select coalesce(array_agg(n.id::uuid), '{}') into v_added
  from member_ids n
  where n.is_new
    and not exists (select 1 from member_ids o where not o.is_new and o.id = n.id);

  perform private.assert_members(new.household_id, v_added);
  return new;
end
$$;

create trigger chores_check_members before insert or update of assignment on public.chores
  for each row execute function private.chores_check_members();

grant select, delete on public.chores to authenticated;
grant insert (id, household_id, title, room, recurrence, assignment, effort, next_due_on, next_assignee_id,
              last_done_on, active_months)
  on public.chores to authenticated;
grant update (title, room, recurrence, assignment, effort, next_due_on, next_assignee_id, last_done_on,
              active_months)
  on public.chores to authenticated;
select private.attach_household_policies('public.chores');
select private.attach_sync_triggers('public.chores');

-- ---------------------------------------------------------------------------------------------
-- chore_events
-- ---------------------------------------------------------------------------------------------

-- Deleting the chore keeps its history: chore_id is cleared (column list, so household_id
-- stays). done_by is cleared when the person is removed from the household.
-- prev_* is the chore's state before the event, set only by complete_chore from the locked chore
-- row (prev_recorded = true); events from elsewhere (the seed) have prev_recorded = false.
create table public.chore_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  chore_id uuid,
  title text not null
    constraint chore_events_title_valid check (btrim(title) <> '' and char_length(title) <= 200),
  kind text not null
    constraint chore_events_kind_valid check (kind in ('done', 'skipped')),
  done_on date not null,
  done_by uuid,
  prev_next_due_on date,
  prev_last_done_on date,
  prev_next_assignee_id uuid,
  prev_recorded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chore_events_household_id_id_key unique (household_id, id),
  constraint chore_events_chore_fkey foreign key (household_id, chore_id)
    references public.chores (household_id, id) on delete set null (chore_id),
  constraint chore_events_done_by_fkey foreign key (household_id, done_by)
    references public.household_members (household_id, profile_id) on delete set null (done_by),
  constraint chore_events_prev_next_assignee_fkey foreign key (household_id, prev_next_assignee_id)
    references public.household_members (household_id, profile_id) on delete set null (prev_next_assignee_id)
);

create index chore_events_household_id_updated_at_idx on public.chore_events (household_id, updated_at);
create index chore_events_household_id_chore_id_idx on public.chore_events (household_id, chore_id);
create index chore_events_household_id_done_by_idx on public.chore_events (household_id, done_by);
create index chore_events_household_id_prev_next_assignee_id_idx
  on public.chore_events (household_id, prev_next_assignee_id);

-- Members change "Erledigt von" and re-link an event to a chore restored by "Rückgängig"
-- (spec 0011, AC-053, AC-059); everything else goes through complete_chore / remove_chore_event.
grant select on public.chore_events to authenticated;
grant update (chore_id, done_by) on public.chore_events to authenticated;
select private.attach_household_policies('public.chore_events');
select private.attach_sync_triggers('public.chore_events');

-- ---------------------------------------------------------------------------------------------
-- complete_chore, remove_chore_event (domain ops of apply_changes, spec 0011)
-- ---------------------------------------------------------------------------------------------

-- Books one event of a chore of p_household_id ("done" or "skipped"). p_op:
--   {chore_id, event_id, kind, done_on, done_by,
--    seen: {next_due_on, last_done_on, next_assignee_id},  -- the chore state the device saw
--    next_due_on, next_assignee_id}                         -- the new state, computed by core
-- The chore is locked; when it no longer matches `seen`, nothing is written: already_done
-- (P0001, detail = {"done_by", "done_at"}) when a "done" event of the chore on done_on exists,
-- else chore_changed (P0001). The event's title comes from the chore, prev_* from the locked row.
-- done sets last_done_on = greatest(last_done_on, done_on), next_due_on and next_assignee_id;
-- skipped sets only next_due_on; done of a one-off chore deletes it (the event stays, chore_id is
-- cleared). Errors: not_authenticated / not_member (42501), invalid_change (22023) for a
-- malformed op, a kind other than done/skipped, done_on outside today - 3 … today + 1 (server
-- date), next_due_on not after done_on or set for an asNeeded chore; chore_not_found (P0002),
-- also for a chore of another household; 23503 for a person outside the household.
-- Returns {"event_id"}.
create function private.complete_chore(p_household_id uuid, p_op jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_keys constant text[] := array['chore_id', 'event_id', 'kind', 'done_on', 'done_by', 'seen', 'next_due_on',
                                  'next_assignee_id'];
  c_seen_keys constant text[] := array['next_due_on', 'last_done_on', 'next_assignee_id'];
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
     or v_kind is null or v_kind not in ('done', 'skipped') then
    raise exception 'invalid_change' using errcode = '22023';
  end if;
  v_event_id := (p_op ->> 'event_id')::uuid;
  v_done_on := (p_op ->> 'done_on')::date;
  v_done_by := (p_op ->> 'done_by')::uuid;
  v_next_due_on := (p_op ->> 'next_due_on')::date;
  v_next_assignee_id := (p_op ->> 'next_assignee_id')::uuid;
  if v_done_on not between current_date - 3 and current_date + 1 or v_next_due_on <= v_done_on then
    raise exception 'invalid_change' using errcode = '22023';
  end if;

  select * into v_chore
  from public.chores c
  where c.household_id = p_household_id and c.id = (p_op ->> 'chore_id')::uuid
  for update;
  if not found then
    raise exception 'chore_not_found' using errcode = 'P0002';
  end if;

  if (v_seen ->> 'next_due_on')::date is distinct from v_chore.next_due_on
     or (v_seen ->> 'last_done_on')::date is distinct from v_chore.last_done_on
     or (v_seen ->> 'next_assignee_id')::uuid is distinct from v_chore.next_assignee_id then
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

-- Removes one event of p_household_id. When it is the latest booked event (created_at, then id)
-- of its chore, the chore still exists and the event recorded the state before it, next_due_on
-- (left empty for a chore that is asNeeded by now), last_done_on and next_assignee_id come back
-- from prev_*. The tombstone reaches all devices; a later patch of the event is row_not_found
-- ("Entfernen gewinnt", spec 0011). Errors: not_authenticated / not_member (42501),
-- chore_event_not_found (P0002), also for an event of another household. Returns {"restored"}.
create function private.remove_chore_event(p_household_id uuid, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.chore_events;
  v_restored boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  -- Event first, then the chore: the same order as an "Erledigt von" change in one apply_changes call.
  select * into v_event
  from public.chore_events e
  where e.household_id = p_household_id and e.id = p_event_id
  for update;
  if not found then
    raise exception 'chore_event_not_found' using errcode = 'P0002';
  end if;

  if v_event.chore_id is not null and v_event.prev_recorded then
    perform 1 from public.chores c
    where c.household_id = p_household_id and c.id = v_event.chore_id
    for update;
    if found and not exists (
      select 1 from public.chore_events e
      where e.household_id = p_household_id and e.chore_id = v_event.chore_id
        and (e.created_at, e.id) > (v_event.created_at, v_event.id)
    ) then
      update public.chores c
      set next_due_on = case when c.recurrence ->> 'type' = 'asNeeded' then null else v_event.prev_next_due_on end,
          last_done_on = v_event.prev_last_done_on,
          next_assignee_id = v_event.prev_next_assignee_id
      where c.household_id = p_household_id and c.id = v_event.chore_id;
      v_restored := true;
    end if;
  end if;

  delete from public.chore_events e where e.household_id = p_household_id and e.id = p_event_id;
  return jsonb_build_object('restored', v_restored);
end
$$;

-- Called by apply_changes (security invoker) as the member; PostgREST does not expose private.
grant execute on function private.complete_chore(uuid, jsonb) to authenticated;
grant execute on function private.remove_chore_event(uuid, uuid) to authenticated;
