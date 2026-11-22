-- Parity of the chore rules in SQL with packages/core (spec 0013, Decision 10; ADR-0014: the
-- rules exist twice, so a change in one place needs the other). The cases and their names are
-- those of `dueChores` in overview.test.ts ("AC-032: choresOfDay", today = Friday 20.11.2026) and
-- of `choreMemberIds` in chores.test.ts.
--
-- private.chore_assignees follows Decision 9 of the plan, which differs from choreMemberIds in
-- two cases on purpose: a rotation with a next person reminds only that person (AC-023), and
-- "egal wer" means everyone (empty array), where choreMemberIds returns nobody.
--
-- Spec 0017 (plan, Decision 3): private.plan_entry_title and private.entry_reminder_body against
-- `planEntryTitle` and `reminderMessage` in reminder.test.ts, with the same cases and names.
begin;
\ir _helpers.psql
select plan(49);

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

-- ===================== reminderMessage (reminder.test.ts, spec 0017) =====================
select is(private.entry_reminder_body('Lasagne', 0, '2026-11-28', 'Abend', null, null),
  'Erinnerung: Lasagne · heute Abend',
  'AC-016 reminderMessage parity: on the day, "Erinnerung: Lasagne · heute Abend"');
select is(private.entry_reminder_body('Lasagne', 1, '2026-11-28', 'Abend', null, 'Fleisch auftauen'),
  'Erinnerung: Lasagne · morgen Abend · Fleisch auftauen',
  'AC-014 reminderMessage parity: the day before with text');
select is(private.entry_reminder_body('Lasagne', 2, '2026-11-28', 'Abend', null, null),
  'Erinnerung: Lasagne · Sa 28.11., Abend',
  'REQ-005 reminderMessage parity: further ahead with weekday and date, "Sa 28.11., Abend"');
select is(private.entry_reminder_body('Lasagne', 3, '2027-03-05', 'Abend', null, null),
  'Erinnerung: Lasagne · Fr 5.3., Abend',
  'REQ-005 reminderMessage parity: day and month without leading zeros, "Fr 5.3., Abend"');
select is(private.entry_reminder_body('Lasagne', 1, '2026-11-29', 'Mittag', null, null),
  'Erinnerung: Lasagne · morgen Mittag',
  'AC-019 reminderMessage parity: "Erinnerung: Lasagne · morgen Mittag"');
select is(private.entry_reminder_body('Eislaufen (Hohenschönhausen)', 0, '2026-11-29', 'Vormittag', null, null),
  'Erinnerung: Eislaufen (Hohenschönhausen) · heute Vormittag',
  'REQ-004 reminderMessage parity: an activity is named with its Zusatz');
select is(private.entry_reminder_body('Lasagne', 0, '2026-11-28', '', null, null),
  'Erinnerung: Lasagne · heute',
  'REQ-005 reminderMessage parity: without a (known) Tageszeit it is left out (today)');
select is(private.entry_reminder_body('Lasagne', 1, '2026-11-28', null, null, 'Käse'),
  'Erinnerung: Lasagne · morgen · Käse',
  'REQ-005 reminderMessage parity: without a (known) Tageszeit it is left out (the day before, with text)');
select is(private.entry_reminder_body('Lasagne', 2, '2026-11-28', '', null, null),
  'Erinnerung: Lasagne · Sa 28.11.',
  'REQ-005 reminderMessage parity: without a (known) Tageszeit it is left out (with the date)');
select is(char_length(private.entry_reminder_body(repeat('L', 500), 1, '2026-11-28', 'Abend', null, 'Käse')), 400,
  'REQ-005 reminderMessage parity: a very long name is shortened to at most 400 characters');
select ok(private.entry_reminder_body(repeat('L', 500), 1, '2026-11-28', 'Abend', null, 'Käse')
            like 'Erinnerung: LLL%L… · morgen Abend · Käse',
  'REQ-005 reminderMessage parity: only the name is cut, with "…"');
select is(private.entry_reminder_body(repeat('N', 400 - 12 - 14), 0, '2026-11-28', 'Abend', null, null),
  'Erinnerung: ' || repeat('N', 400 - 12 - 14) || ' · heute Abend',
  'REQ-005 reminderMessage parity: a name that fits exactly is not shortened');
select is(char_length(private.entry_reminder_body(repeat('🍝', 500), 0, '2026-11-28', 'Abend', null, null)), 400,
  'REQ-005 reminderMessage parity: shortening counts characters, not UTF-16 units');

-- Spec 0021, REQ-014: with a time the message names it instead of the Tageszeit.
select is(private.entry_reminder_body('Trattoria Da Enzo', 0, '2026-11-28', 'Abend', '19:30', null),
  'Erinnerung: Trattoria Da Enzo · heute 19:30',
  'AC-037 reminderMessage parity: with a time, "Erinnerung: Trattoria Da Enzo · heute 19:30"');
select is(private.entry_reminder_body('Trattoria Da Enzo', 1, '2026-11-28', 'Abend', '19:30', null),
  'Erinnerung: Trattoria Da Enzo · morgen 19:30',
  'REQ-014 reminderMessage parity: the day before with the time, "morgen 19:30"');
select is(private.entry_reminder_body('Trattoria Da Enzo', 3, '2026-11-28', 'Abend', '09:05', 'Tisch'),
  'Erinnerung: Trattoria Da Enzo · Sa 28.11., 9:05 · Tisch',
  'REQ-014 reminderMessage parity: further ahead "Sa 28.11., 9:05", the time without a leading zero');

-- ===================== planEntryTitle (reminder.test.ts, spec 0017) =====================
insert into fx (key) values ('r_lasagne'), ('rest1'), ('act1'), ('src'), ('src_planless'), ('slot');
update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('slot'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('home');
insert into public.recipes (id, household_id, title) values (tests.fx('r_lasagne'), tests.fx('home'), 'Lasagne');
insert into public.restaurants (id, household_id, name) values (tests.fx('rest1'), tests.fx('home'), 'Mama Lu');
insert into public.activities (id, household_id, name, name_key)
values (tests.fx('act1'), tests.fx('home'), 'Eislaufen', 'eislaufen');
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id) values
  (tests.fx('src'), tests.fx('home'), '2026-11-26', tests.fx('slot'), 'recipe', tests.fx('r_lasagne')),
  (tests.fx('src_planless'), tests.fx('home'), null, tests.fx('slot'), 'recipe', tests.fx('r_lasagne'));
-- The name of an entry given by its columns (not stored: references may point nowhere, the kind
-- may be one this version does not know).
create function tests.title(p_entry jsonb) returns text language sql
as $$
  select private.plan_entry_title(jsonb_populate_record(null::public.meal_plan_entries,
    jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home'), 'slot_id', tests.fx('slot'),
                       'kind', 'recipe') || p_entry))
$$;

select is(tests.title(jsonb_build_object('recipe_id', tests.fx('r_lasagne'))), 'Lasagne',
  'REQ-004 planEntryTitle parity: a recipe is named by its title');
select is(tests.title(jsonb_build_object('recipe_id', gen_random_uuid())), 'Rezept',
  'REQ-004 planEntryTitle parity: a recipe that is gone is "Rezept"');
select is(tests.title('{"kind": "text", "text": "Pizza"}'), 'Pizza',
  'REQ-004 planEntryTitle parity: free text is named by its text');
select is(tests.title('{"kind": "text"}'), '',
  'REQ-004 planEntryTitle parity: free text without a text is empty');
select is(tests.title(jsonb_build_object('kind', 'leftovers', 'leftovers_of_entry_id', tests.fx('src'))),
  'Reste von Donnerstag',
  'REQ-004 planEntryTitle parity: leftovers name the weekday of their source');
select is(tests.title(jsonb_build_object('kind', 'leftovers', 'leftovers_of_entry_id', gen_random_uuid())),
  'Reste',
  'REQ-004 planEntryTitle parity: leftovers of a source that is gone are "Reste"');
select is(tests.title(jsonb_build_object('kind', 'leftovers', 'leftovers_of_entry_id', tests.fx('src_planless'))),
  'Reste',
  'REQ-004 planEntryTitle parity: leftovers of a source without a day are "Reste"');
select is(tests.title(jsonb_build_object('kind', 'restaurant', 'restaurant_id', tests.fx('rest1'), 'text', 'Alt')),
  'Mama Lu',
  'REQ-004 planEntryTitle parity: a restaurant by its name');
select is(tests.title(jsonb_build_object('kind', 'restaurant', 'restaurant_id', gen_random_uuid(), 'text', 'Alt')),
  'Alt',
  'REQ-004 planEntryTitle parity: a restaurant that is gone by the text');
select is(tests.title('{"kind": "restaurant"}'), 'Restaurant',
  'REQ-004 planEntryTitle parity: a restaurant without name and text is "Restaurant"');
select is(tests.title(jsonb_build_object('kind', 'activity', 'activity_id', tests.fx('act1'), 'note', 'Hohenschönhausen')),
  'Eislaufen (Hohenschönhausen)',
  'REQ-004 planEntryTitle parity: an activity with its Zusatz, "Eislaufen (Hohenschönhausen)"');
select is(tests.title('{"kind": "activity", "text": "Zoo"}'), 'Zoo',
  'REQ-004 planEntryTitle parity: an activity without its row by the text');
select is(tests.title('{"kind": "activity", "note": "  "}'), 'Aktivität',
  'REQ-004 planEntryTitle parity: a blank Zusatz is no Zusatz; without name and text "Aktivität"');
select is(tests.title('{"kind": "party", "text": "Neu"}'), 'Neu',
  'planEntryTitle parity: falls back to the text for a kind this version does not know');

select is(tests.title(jsonb_build_object('recipe_id', tests.fx('r_lasagne'), 'note', 'doppelte Menge')),
  'Lasagne (doppelte Menge)',
  'AC-023 planEntryTitle parity: every kind carries its Zusatz, "Lasagne (doppelte Menge)"');
select is(tests.title(jsonb_build_object('kind', 'restaurant', 'restaurant_id', tests.fx('rest1'), 'note', 'Tisch für 6')),
  'Mama Lu (Tisch für 6)',
  'AC-023 planEntryTitle parity: a restaurant with its Zusatz');

select * from finish();
rollback;
