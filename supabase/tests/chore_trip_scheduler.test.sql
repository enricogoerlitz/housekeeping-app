-- The scheduler moves chores with trips (spec 0026, REQ-009, REQ-012, REQ-014): the daily summary
-- and the reminder of chores with a time use the date after trips and the stand-in of a rotation;
-- the summary says "fällig seit …" instead of "überfällig". Household "Enrico & Nadja" in
-- Europe/Berlin; "Urlaub Mallorca" 4.–10.12.2026 for both, "Dienstreise Hamburg" 18.–19.12.2026
-- only Enrico.
begin;
\ir _helpers.psql
select plan(12);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;

-- The candidates of the test household at a local Berlin time, with the person as E or N.
create function tests.c(p_local timestamp)
returns table (who text, kind text, dedupe_key text, body text)
language sql
as $$
  select case c.profile_id when tests.fx('enrico') then 'E' when tests.fx('nadja') then 'N' else '?' end,
         c.kind, c.dedupe_key, c.body
  from private.notification_candidates(tests.berlin(p_local)) c
  where c.household_id = tests.fx('home')
$$;
-- The reminders of one chore at a local time: "E: …" per person.
create function tests.reminders(p_local timestamp, p_chore text) returns text language sql
as $$
  select string_agg(c.who || ': ' || c.body, ' | ' order by c.who)
  from tests.c(p_local) c
  where c.kind = 'chore_reminder' and c.dedupe_key like 'chore:' || tests.fx(p_chore) || ':%'
$$;
create function tests.summary(p_local timestamp, p_who text) returns text language sql
as $$ select c.body from tests.c(p_local) c where c.who = p_who and c.kind = 'daily_summary' $$;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')]));
insert into fx (key) values
  ('mallorca'), ('hamburg'), ('fenster'), ('muell_alt'), ('bad'), ('muell_egal'), ('bad_r'), ('muell_e');

update public.notification_settings
set daily_summary_enabled = true, daily_summary_at = '07:30', daily_summary_parts = '{chores}',
    chore_reminders_enabled = true
where household_id = tests.fx('home');

-- ===================== AC-029: the daily summary says "fällig seit …" =====================
insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on, next_assignee_id) values
  (tests.fx('fenster'), tests.fx('home'), 'Fenster Wohnzimmer', '{"type": "weekly", "every": 1, "weekdays": [6]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), '2026-11-21', tests.fx('enrico')),
  (tests.fx('muell_alt'), tests.fx('home'), 'Müll rausbringen', '{"type": "weekly", "every": 1, "weekdays": [4]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), '2026-11-19', tests.fx('enrico')),
  (tests.fx('bad'), tests.fx('home'), 'Bad putzen', '{"type": "weekly", "every": 1, "weekdays": [7]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), '2026-11-22', tests.fx('enrico'));
select is(tests.summary('2026-11-22 07:30', 'E'),
  'Heute: Fenster Wohnzimmer (du, fällig seit gestern) · Müll rausbringen (du, fällig seit 3 Tagen) · Bad putzen (du)',
  'AC-029: Enrico''s summary at 7:30 names how long each chore is open, never "überfällig"');
delete from public.chores where id in (tests.fx('fenster'), tests.fx('muell_alt'), tests.fx('bad'));

insert into public.trips (id, household_id, from_on, to_on, note) values
  (tests.fx('mallorca'), tests.fx('home'), '2026-12-04', '2026-12-10', 'Urlaub Mallorca'),
  (tests.fx('hamburg'), tests.fx('home'), '2026-12-18', '2026-12-19', 'Dienstreise Hamburg');
insert into public.trip_members (household_id, trip_id, member_id) values
  (tests.fx('home'), tests.fx('mallorca'), tests.fx('enrico')),
  (tests.fx('home'), tests.fx('mallorca'), tests.fx('nadja')),
  (tests.fx('home'), tests.fx('hamburg'), tests.fx('enrico'));

-- ===================== AC-053: "egal wer" waits for the end of the trip =====================
insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on, due_time) values
  (tests.fx('muell_egal'), tests.fx('home'), 'Müll rausbringen', '{"type": "weekly", "every": 1, "weekdays": [6]}',
   '{"type": "anyone"}', '2026-12-05', '19:00');
select is(
  (select count(*)::int
   from generate_series('2026-12-04 19:00'::timestamp, '2026-12-10 19:00'::timestamp, '1 day') t,
        tests.c(t) c
   where c.kind = 'chore_reminder'),
  0, 'AC-053: no reminder 4.–10.12.');
select is(tests.reminders('2026-12-11 19:00', 'muell_egal'),
  'E: Müll rausbringen · 19:00 | N: Müll rausbringen · 19:00',
  'AC-053: on Fri 11.12. at 19:00 both get "Müll rausbringen · 19:00"');
select is(
  (select c.dedupe_key from tests.c('2026-12-11 19:00') c where c.who = 'E' and c.kind = 'chore_reminder'),
  format('chore:%s:2026-12-11', tests.fx('muell_egal')),
  'AC-053: the key names the chore and the new day');
select is(tests.summary('2026-12-05 07:30', 'E'), null,
  'REQ-013: during the trip of the whole household the summary has no chore');
delete from public.chores where id = tests.fx('muell_egal');

-- ===================== AC-054: the stand-in of a rotation =====================
insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on, next_assignee_id, due_time) values
  (tests.fx('bad_r'), tests.fx('home'), 'Bad putzen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
   jsonb_build_object('type', 'rotating', 'memberIds', jsonb_build_array(tests.fx('enrico'), tests.fx('nadja'))),
   '2026-12-18', tests.fx('enrico'), '10:00');
select is(tests.reminders('2026-12-18 10:00', 'bad_r'), 'N: Bad putzen · 10:00 · du bist dran',
  'AC-054: on Fri 18.12. at 10:00 Nadja gets "Bad putzen · 10:00 · du bist dran", Enrico nothing');
select is(tests.summary('2026-12-18 07:30', 'N'), 'Heute: Bad putzen (du, 10:00)',
  'AC-054: Nadja''s summary names "Bad putzen (du, 10:00)"');
select is(tests.summary('2026-12-18 07:30', 'E'), null,
  'AC-054: Enrico is away and gets nothing (spec 0013, AC-035)');
select is(tests.summary('2026-12-16 07:30', 'N'), null,
  'AC-054: before its day the chore is in nobody''s summary');
delete from public.chores where id = tests.fx('bad_r');

-- ===================== AC-055: fixed waits for the person =====================
insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on, next_assignee_id, due_time) values
  (tests.fx('muell_e'), tests.fx('home'), 'Müll rausbringen', '{"type": "weekly", "every": 1, "weekdays": [6]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), '2026-12-19', tests.fx('enrico'), '19:00');
select is(tests.reminders('2026-12-19 19:00', 'muell_e'), null, 'AC-055: on Sat 19.12. nobody');
select is(tests.reminders('2026-12-20 19:00', 'muell_e'), 'E: Müll rausbringen · 19:00 · du bist dran',
  'AC-055: on Sun 20.12. at 19:00 Enrico gets "Müll rausbringen · 19:00 · du bist dran"');
select is(tests.summary('2026-12-21 07:30', 'E'), 'Heute: Müll rausbringen (du, fällig seit gestern)',
  'AC-055: the next day the summary counts from the day after the trip');

select * from finish();
rollback;
