-- Parity of the chore rules in SQL with packages/core (spec 0013, Decision 10; ADR-0014: the
-- rules exist twice, so a change in one place needs the other). The cases and their names are
-- those of `dueChores` in overview.test.ts ("AC-032: choresOfDay", today = Friday 20.11.2026) and
-- of `choreMemberIds` in chores.test.ts.
--
-- private.chore_assignees follows Decision 9 of the plan, which differs from choreMemberIds in
-- two cases on purpose: a rotation with a next person reminds only that person (AC-023), and
-- "egal wer" means everyone (empty array), where choreMemberIds returns nobody.
begin;
\ir _helpers.psql
select plan(17);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
create function tests.state(p_key text, p_day date default '2026-11-20') returns text language sql
as $$ select private.chore_due_state(c, p_day) from public.chores c where c.id = tests.fx(p_key) $$;
create function tests.assignees(p_key text) returns uuid[] language sql
as $$ select private.chore_assignees(c) from public.chores c where c.id = tests.fx(p_key) $$;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')]));
insert into fx (key) values
  ('kueche'), ('bad'), ('muell'), ('bett'), ('pflanzen'), ('fk'), ('sommer'),
  ('next_nadja'), ('fixed'), ('together'), ('anyone'), ('rotating'), ('rotating_next');

-- The fixtures of overview.test.ts, "AC-032: choresOfDay".
insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on, next_assignee_id, last_done_on,
                           active_months) values
  (tests.fx('kueche'), tests.fx('home'), 'Küche wischen', '{"type": "weekly", "every": 1, "weekdays": [6]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), '2026-11-21', tests.fx('enrico'), null, null),
  (tests.fx('bad'), tests.fx('home'), 'Bad putzen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), '2026-11-20', null, null, null),
  (tests.fx('muell'), tests.fx('home'), 'Müll rausbringen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), '2026-11-18', null, null, null),
  (tests.fx('bett'), tests.fx('home'), 'Bettwäsche wechseln', '{"type": "flexible", "everyDays": 10}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), null, null, '2026-11-12', null),
  (tests.fx('pflanzen'), tests.fx('home'), 'Pflanzen gießen', '{"type": "flexible", "everyDays": 10}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), null, null, '2026-11-15', null),
  (tests.fx('fk'), tests.fx('home'), 'Fenster Küche', '{"type": "asNeeded"}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), null, null, null, null),
  (tests.fx('sommer'), tests.fx('home'), 'Rasen mähen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), '2026-11-20', null, null, '{4,5,6,7,8,9}');

-- ===================== dueChores (overview.test.ts, AC-028 / AC-032) =====================
select is(tests.state('muell'), 'overdue', 'dueChores parity: "Müll rausbringen" (due 18.11.) is overdue');
select is(tests.state('bad'), 'today', 'dueChores parity: "Bad putzen" is due today');
select is(tests.state('bett'), 'flexible_due', 'dueChores parity: "Bettwäsche wechseln" (8 of 10 days, FLEXIBLE_DUE_FROM 0.8) is nearly due');
select is(tests.state('pflanzen'), null, 'dueChores parity: "Pflanzen gießen" (5 of 10 days) is not due');
select is(tests.state('kueche'), null, 'dueChores parity: "Küche wischen" on Saturday is not due on Friday');
select is(tests.state('fk'), null, 'dueChores parity: "bei Bedarf" never shows up');
select is(tests.state('sommer'), null, 'dueChores parity: a chore outside its active months is paused');
select is(tests.state('kueche', '2026-11-21'), 'today', 'dueChores parity: "Küche wischen" is due on Saturday');
update public.chores set last_done_on = null where id = tests.fx('pflanzen');
select is(tests.state('pflanzen'), 'flexible_due', 'flexibleProgress parity: a flexible chore never done is due right away');
select is(
  (select array_agg(c.title order by case private.chore_due_state(c, '2026-11-20')
                                        when 'overdue' then 0 when 'today' then 1 else 2 end, c.title)
   from public.chores c
   where c.household_id = tests.fx('home') and c.id <> tests.fx('pflanzen')
     and private.chore_due_state(c, '2026-11-20') is not null),
  array['Müll rausbringen', 'Bad putzen', 'Bettwäsche wechseln'],
  'AC-028 dueChores parity: overdue, due and nearly due flexible chores in this order, never "bei Bedarf"');

-- ===================== choreMemberIds (chores.test.ts) =====================
insert into fx (key, id) values ('weg', gen_random_uuid());
insert into public.chores (id, household_id, title, recurrence, assignment, next_assignee_id) values
  (tests.fx('next_nadja'), tests.fx('home'), 'Bad putzen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), tests.fx('nadja')),
  (tests.fx('fixed'), tests.fx('home'), 'Bad putzen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), null),
  (tests.fx('together'), tests.fx('home'), 'Bad putzen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
   '{"type": "together"}', null),
  (tests.fx('anyone'), tests.fx('home'), 'Bad putzen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
   '{"type": "anyone"}', null),
  (tests.fx('rotating_next'), tests.fx('home'), 'Staubsaugen', '{"type": "weekly", "every": 1, "weekdays": [6]}',
   jsonb_build_object('type', 'rotating', 'memberIds', jsonb_build_array(tests.fx('enrico'), tests.fx('nadja'))),
   tests.fx('nadja'));
-- A rotation with a removed member ('weg'): written as postgres, the member check only guards the API.
alter table public.chores disable trigger chores_check_members;
insert into public.chores (id, household_id, title, recurrence, assignment) values
  (tests.fx('rotating'), tests.fx('home'), 'Bad putzen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
   jsonb_build_object('type', 'rotating', 'memberIds', jsonb_build_array(tests.fx('enrico'), tests.fx('weg'))));
alter table public.chores enable trigger chores_check_members;

select is(tests.assignees('next_nadja'), array[tests.fx('nadja')],
  'choreMemberIds parity: shows the next assignee');
select is(tests.assignees('fixed'), array[tests.fx('enrico')],
  'choreMemberIds parity: a fixed chore without a next assignee is the fixed member''s');
select is(tests.assignees('together'), '{}'::uuid[],
  'choreMemberIds parity: everyone for "together" (empty = all members)');
select is(tests.assignees('anyone'), '{}'::uuid[],
  'Decision 9 (differs from choreMemberIds): "egal wer" reminds everyone (empty = all members)');
select is(tests.assignees('rotating'), array[tests.fx('enrico'), tests.fx('weg')],
  'choreMemberIds parity: a rotation without a next person is everyone in it (unknown ids drop out when joined with the members)');
select is(tests.assignees('rotating_next'), array[tests.fx('nadja')],
  'Decision 9 (differs from choreMemberIds): a rotation with a next person is only that person (AC-023)');
delete from public.household_members where household_id = tests.fx('home') and profile_id = tests.fx('nadja');
select is(tests.assignees('next_nadja'), array[tests.fx('enrico')],
  'choreMemberIds parity: a removed next assignee falls back to the fixed member (next_assignee_id is cleared)');

select * from finish();
rollback;
