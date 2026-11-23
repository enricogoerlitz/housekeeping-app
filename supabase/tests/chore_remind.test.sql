-- „Erinnern“ per chore (spec 0027, REQ-009): chores.remind_at_due_time is on by default, can be
-- off only with a time (chores_remind_needs_time), is written through apply_changes like the time,
-- and the scheduler reminds only chores with it on; the daily summary names them either way.
-- Negative paths: off without a time, another household, signed out. Parity with
-- remindAtDueTimeFor in packages/core/src/notifications.test.ts (AC-038).
begin;
\ir _helpers.psql
select plan(17);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;

create function tests.patch_sql(p_household text, p_chore text, p_changes jsonb) returns text language sql stable
as $$
  select format('select public.apply_changes(%L, %L)', tests.fx(p_household),
                jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'chores', 'id', tests.fx(p_chore),
                                                     'changes', p_changes)))
$$;
create function tests.remind(p_chore text) returns boolean language sql stable
as $$ select c.remind_at_due_time from public.chores c where c.id = tests.fx(p_chore) $$;

-- The candidates of the household at a local Berlin time, with the person as E or N.
create function tests.c(p_local timestamp)
returns table (who text, kind text, body text)
language sql
as $$
  select case c.profile_id when tests.fx('enrico') then 'E' when tests.fx('nadja') then 'N' else '?' end,
         c.kind, c.body
  from private.notification_candidates(tests.berlin(p_local)) c
  where c.household_id = tests.fx('home')
$$;

grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')]));
insert into fx (key) values ('muell'), ('bad');

update public.notification_settings
set daily_summary_enabled = true, daily_summary_at = '07:30', daily_summary_parts = '{chores}',
    chore_reminders_enabled = true
where household_id = tests.fx('home');

insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on, next_assignee_id, due_time)
values
  (tests.fx('muell'), tests.fx('home'), 'Müll rausbringen', '{"type": "weekly", "every": 1, "weekdays": [7]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), '2026-11-22', tests.fx('enrico'), '19:00'),
  (tests.fx('bad'), tests.fx('home'), 'Bad putzen', '{"type": "weekly", "every": 1, "weekdays": [7]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), '2026-11-29', tests.fx('enrico'), null);

-- ===================== The column =====================
select col_not_null('public', 'chores', 'remind_at_due_time', 'REQ-009: remind_at_due_time is not null');
select col_default_is('public', 'chores', 'remind_at_due_time', 'true',
  'AC-035: a chore reminds by default ("Erinnern" an)');

-- ===================== Writing it (AC-035, AC-038) =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.patch_sql('home', 'muell', '{"remind_at_due_time": false}'),
  'AC-035: Enrico switches "Erinnern" off for "Müll rausbringen · 19:00"');
select tests.authenticate_as(tests.fx('nadja'));
select is(tests.remind('muell'), false, 'AC-035: Nadja sees "Erinnern" off');
select is((select c.due_time from public.chores c where c.id = tests.fx('muell')), '19:00'::time,
  'AC-035: the time stays and is shown');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.patch_sql('home', 'bad', '{"remind_at_due_time": false}'),
  '23514', null, 'AC-038: "Erinnern" off without a time is refused');
select throws_ok(tests.patch_sql('home', 'muell', '{"due_time": null}'),
  '23514', null, 'AC-038: removing the time of a silent chore without switching it on is refused');

-- ===================== The scheduler (AC-036) =====================
select tests.clear_authentication();
select is(
  (select count(*)::int from tests.c('2026-11-22 19:00') c where c.kind = 'chore_reminder'), 0,
  'AC-036: "Erinnern" off, both "Aufgaben mit Uhrzeit" on: at 19:00 nobody gets a message');
select is(
  (select c.body from tests.c('2026-11-22 07:30') c where c.who = 'E' and c.kind = 'daily_summary'),
  'Heute: Müll rausbringen (du, 19:00)',
  'AC-036: the daily summary still names the chore with its time');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.patch_sql('home', 'muell', '{"remind_at_due_time": true}'),
  'AC-036: Enrico switches "Erinnern" on again');
select tests.clear_authentication();
select is(
  (select string_agg(c.who || ': ' || c.body, ' | ' order by c.who) from tests.c('2026-11-22 19:00') c
   where c.kind = 'chore_reminder'),
  'E: Müll rausbringen · 19:00 · du bist dran',
  'AC-036 (spec 0013, AC-023): with "Erinnern" on, Enrico is reminded at 19:00');

-- ===================== Removing the time (AC-038) =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.patch_sql('home', 'muell', '{"remind_at_due_time": false}'), 'AC-038: off again');
select lives_ok(tests.patch_sql('home', 'muell', '{"due_time": null, "remind_at_due_time": true}'),
  'AC-038: removing the time switches "Erinnern" on in the same change, so 18:00 later reminds');

-- ===================== Another household, signed out =====================
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.patch_sql('home', 'muell', '{"remind_at_due_time": true}'),
  '42501', 'not_member', 'AC-038: a member of another household cannot change "Erinnern"');
select is(tests.affected(format('update public.chores set remind_at_due_time = true where id = %L', tests.fx('muell'))),
  0, 'AC-038: a direct update from another household changes no row');
select tests.authenticate_as_anon();
select throws_ok(format('update public.chores set remind_at_due_time = true where id = %L', tests.fx('muell')),
  '42501', null, 'REQ-009: signed out nothing can be changed');

-- ===================== Parity with core remindAtDueTimeFor (AC-038) =====================
-- The cases of remindAtDueTimeFor in notifications.test.ts: the check keeps exactly what the core
-- saves — "off" with a time stays off, without a time only "on" is accepted.
select tests.clear_authentication();
create function tests.accepted(p_time time, p_remind boolean) returns boolean language plpgsql
as $$
begin
  insert into public.chores (household_id, title, recurrence, assignment, next_due_on, due_time, remind_at_due_time)
  values (tests.fx('home'), 'Probe', '{"type": "weekly", "every": 1, "weekdays": [1]}', '{"type": "anyone"}',
          '2026-11-23', p_time, p_remind);
  raise exception 'probe_done';
exception
  when check_violation then return false;
  when raise_exception then return true;
end
$$;
select is(
  array[tests.accepted('19:00', false), tests.accepted('19:00', true), tests.accepted(null, false),
        tests.accepted(null, true)],
  array[true, true, false, true],
  'AC-038 parity: (no time, off) is the only refused pair, the one remindAtDueTimeFor never saves');

select * from finish();
rollback;
