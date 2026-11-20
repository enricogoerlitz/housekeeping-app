-- Spec 0003, T3d — chores and their history (chore_events).
--
-- Person references must be members of the row's household: next_assignee_id and done_by by
-- composite foreign keys to household_members (cleared when the person is removed, so the
-- history stays), the member ids inside `assignment` by a trigger.

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
      and coalesce(recurrence ->> 'type', '') in ('once', 'weekly', 'monthly', 'everyMonths', 'flexible')
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
create table public.chore_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  chore_id uuid,
  title text not null
    constraint chore_events_title_valid check (btrim(title) <> '' and char_length(title) <= 200),
  kind text not null
    constraint chore_events_kind_valid check (kind in ('done', 'skipped', 'spontaneous')),
  done_on date not null,
  done_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chore_events_household_id_id_key unique (household_id, id),
  constraint chore_events_chore_fkey foreign key (household_id, chore_id)
    references public.chores (household_id, id) on delete set null (chore_id),
  constraint chore_events_done_by_fkey foreign key (household_id, done_by)
    references public.household_members (household_id, profile_id) on delete set null (done_by)
);

create index chore_events_household_id_updated_at_idx on public.chore_events (household_id, updated_at);
create index chore_events_household_id_chore_id_idx on public.chore_events (household_id, chore_id);
create index chore_events_household_id_done_by_idx on public.chore_events (household_id, done_by);

grant select, delete on public.chore_events to authenticated;
grant insert (id, household_id, chore_id, title, kind, done_on, done_by) on public.chore_events to authenticated;
grant update (chore_id, title, kind, done_on, done_by) on public.chore_events to authenticated;
select private.attach_household_policies('public.chore_events');
select private.attach_sync_triggers('public.chore_events');
