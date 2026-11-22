-- The scheduler's candidates at a fixed time (spec 0013, Task 2): private.notification_candidates
-- decides what is due, for whom and with which text, link and expiry, in the household's local
-- time. Example day: Friday, 20.11.2026, household "Enrico & Nadja" in Europe/Berlin.
begin;
\ir _helpers.psql
select plan(67);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;

-- The candidates of the test household at a local Berlin time, with the person as E or N.
create function tests.c(p_local timestamp)
returns table (who text, kind text, dedupe_key text, due_at timestamptz, expires_at timestamptz, title text,
               body text, url text)
language sql
as $$
  select case c.profile_id when tests.fx('enrico') then 'E' when tests.fx('nadja') then 'N' else '?' end,
         c.kind, c.dedupe_key, c.due_at, c.expires_at, c.title, c.body, c.url
  from private.notification_candidates(tests.berlin(p_local)) c
  where c.household_id = tests.fx('home')
$$;
-- Every candidate of the household on ticks between two local times. Every 30 minutes by default:
-- a message is a candidate for 30 minutes after its time, so these ticks see every message of
-- the range at least once; '5 minutes' gives every real tick.
create function tests.c_between(p_from timestamp, p_to timestamp, p_step interval default '30 minutes')
returns table (tick timestamp, who text, kind text, dedupe_key text, title text, body text, url text)
language sql
as $$
  select t, c.who, c.kind, c.dedupe_key, c.title, c.body, c.url
  from generate_series(p_from, p_to, p_step) t, tests.c(t) c
$$;
create function tests.body(p_local timestamp, p_who text, p_kind text) returns text language sql
as $$ select string_agg(c.body, ' | ' order by c.body) from tests.c(p_local) c where c.who = p_who and c.kind = p_kind $$;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')]));
insert into fx (key) values
  ('s_morgen'), ('s_vor'), ('s_mittag'), ('s_abend'),
  ('a_boulder'), ('a_eis'), ('a_kino'), ('r_lasagne'), ('r_hummus'), ('enzo'),
  ('e_boulder'), ('e_lasagne'), ('e_hummus'), ('e_eis'), ('e_enzo'), ('e_kino'),
  ('c_bad'), ('c_fenster'), ('c_muell'), ('c_blumen'), ('c_matratze'), ('c_kueche'), ('c_paket'),
  ('away'), ('ghost');

update public.households
set meal_slots = jsonb_build_array(
  jsonb_build_object('id', tests.fx('s_morgen'), 'name', 'Frühstück', 'sort', 0),
  jsonb_build_object('id', tests.fx('s_vor'), 'name', 'Vormittag', 'sort', 1),
  jsonb_build_object('id', tests.fx('s_abend'), 'name', 'Abend', 'sort', 3),
  jsonb_build_object('id', tests.fx('s_mittag'), 'name', 'Mittag', 'sort', 2))
where id = tests.fx('home');
insert into public.activities (id, household_id, name, name_key, description) values
  (tests.fx('a_boulder'), tests.fx('home'), 'Bouldern', 'bouldern', 'GEHEIM-Beschreibung'),
  (tests.fx('a_eis'), tests.fx('home'), 'Eislaufen', 'eislaufen', null),
  (tests.fx('a_kino'), tests.fx('home'), 'Kino', 'kino', null);
insert into public.recipes (id, household_id, title, notes, lead_time) values
  (tests.fx('r_lasagne'), tests.fx('home'), 'Lasagne', 'GEHEIM-Rezeptnotiz', null),
  (tests.fx('r_hummus'), tests.fx('home'), 'Hummus', null, '{"text": "Kichererbsen einweichen", "hoursBefore": 12}');
insert into public.restaurants (id, household_id, name, address, notes)
values (tests.fx('enzo'), tests.fx('home'), 'Trattoria Da Enzo', 'Hauptstraße 1', 'GEHEIM-Restaurantnotiz');
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, restaurant_id, activity_id,
                                      note, eater_ids, cook_id, reserved_at) values
  (tests.fx('e_boulder'), tests.fx('home'), '2026-11-20', tests.fx('s_vor'), 'activity', null, null, tests.fx('a_boulder'),
   null, '{}', null, null),
  (tests.fx('e_lasagne'), tests.fx('home'), '2026-11-20', tests.fx('s_abend'), 'recipe', tests.fx('r_lasagne'), null, null,
   null, array[tests.fx('enrico')], tests.fx('enrico'), null),
  (tests.fx('e_hummus'), tests.fx('home'), '2026-11-21', tests.fx('s_mittag'), 'recipe', tests.fx('r_hummus'), null, null,
   null, array[tests.fx('enrico'), tests.fx('nadja')], tests.fx('enrico'), null),
  (tests.fx('e_eis'), tests.fx('home'), '2026-11-21', tests.fx('s_vor'), 'activity', null, null, tests.fx('a_eis'),
   'Hohenschönhausen', '{}', null, null),
  (tests.fx('e_enzo'), tests.fx('home'), '2026-11-21', tests.fx('s_abend'), 'restaurant', null, tests.fx('enzo'), null,
   null, '{}', null, '19:30');
insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on, next_assignee_id, due_time) values
  (tests.fx('c_bad'), tests.fx('home'), 'Bad putzen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), '2026-11-20', null, null),
  (tests.fx('c_fenster'), tests.fx('home'), 'Fenster Wohnzimmer', '{"type": "weekly", "every": 1, "weekdays": [3]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('nadja')), '2026-11-18', null, '10:00'),
  (tests.fx('c_muell'), tests.fx('home'), 'Müll rausbringen', '{"type": "weekly", "every": 1, "weekdays": [7]}',
   jsonb_build_object('type', 'rotating', 'memberIds', jsonb_build_array(tests.fx('enrico'), tests.fx('nadja'))),
   '2026-11-22', tests.fx('enrico'), '19:00'),
  (tests.fx('c_kueche'), tests.fx('home'), 'Fenster Küche', '{"type": "asNeeded"}', '{"type": "anyone"}', null, null, '10:00');
update public.notification_settings
set daily_summary_enabled = true, activities_eve_enabled = true
where household_id = tests.fx('home');

-- ===================== Daily summary (AC-015 to AC-018) =====================
select is(
  tests.body('2026-11-20 07:30', 'E', 'daily_summary'),
  'Heute: Bouldern (Vormittag) · Lasagne (Abend, du kochst) · Bad putzen (du) · Für morgen: Kichererbsen einweichen',
  'AC-015 daily summary: Enrico''s text at 7:30');
select is(tests.body('2026-11-20 07:25', 'E', 'daily_summary'), null,
  'AC-015 daily summary: the 7:25 tick sends nothing yet');
select is(
  (select jsonb_build_object('title', c.title, 'key', c.dedupe_key, 'due', c.due_at, 'expires', c.expires_at, 'url', c.url)
   from tests.c('2026-11-20 07:30') c where c.who = 'E' and c.kind = 'daily_summary'),
  jsonb_build_object('title', 'Housekeeping',
                     'key', format('daily:%s:%s:2026-11-20', tests.fx('home'), tests.fx('enrico')),
                     'due', tests.berlin('2026-11-20 07:30'), 'expires', tests.berlin('2026-11-21 00:00'),
                     'url', '/?haushalt=' || tests.fx('home')),
  'Decisions 6, 12, 13 daily summary: title, unique key, due time, expiry at midnight and the link to the Übersicht');
select is(
  tests.body('2026-11-20 07:30', 'N', 'daily_summary'),
  'Heute: Bouldern (Vormittag) · Fenster Wohnzimmer (du, überfällig)',
  'AC-016, AC-018 daily summary: Nadja gets only her part, the overdue window included');
select is(
  (select array_agg(distinct c.tick order by c.tick) from tests.c_between('2026-11-20 07:00', '2026-11-20 08:30', '5 minutes') c
   where c.who = 'E' and c.kind = 'daily_summary'),
  array['2026-11-20 07:30', '2026-11-20 07:35', '2026-11-20 07:40', '2026-11-20 07:45', '2026-11-20 07:50',
        '2026-11-20 07:55', '2026-11-20 08:00']::timestamp[],
  'Decision 5 daily summary: a candidate from its time up to and including 30 minutes later, never later');
select is(
  (select count(*)::int from tests.c_between('2026-11-20 00:00', '2026-11-21 00:00') c
   where c.dedupe_key like 'chore:' || tests.fx('c_fenster') || '%'),
  0,
  'AC-018 chore reminder: the overdue "Fenster Wohnzimmer" never gets its own reminder');

update public.notification_settings set daily_summary_parts = '{chores}'
where member_id = tests.fx('enrico') and household_id = tests.fx('home');
update public.chores set next_due_on = '2026-11-27' where id = tests.fx('c_bad');
select is(tests.body('2026-11-20 07:30', 'E', 'daily_summary'), null,
  'AC-017 daily summary: only "Aufgaben" chosen and nothing due → no message, although Lasagne is planned');
update public.chores set next_due_on = '2026-11-20' where id = tests.fx('c_bad');
select is(tests.body('2026-11-20 07:30', 'E', 'daily_summary'), 'Heute: Bad putzen (du)',
  'AC-017 daily summary: only the chosen part');
update public.notification_settings set daily_summary_parts = '{meals,activities,chores,prep}'
where member_id = tests.fx('enrico') and household_id = tests.fx('home');

update public.notification_settings set daily_summary_enabled = false where member_id = tests.fx('nadja');
select is(tests.body('2026-11-20 07:30', 'N', 'daily_summary'), null,
  'AC-014 daily summary: switched off means silent');
update public.notification_settings set daily_summary_enabled = true where member_id = tests.fx('nadja');

-- The other forms of the summary on Saturday: activity with Zusatz, recipe, restaurant with time,
-- overdue chore; leftovers and free text on Sunday with a chore at a time and an "anyone" chore.
select is(
  tests.body('2026-11-21 07:30', 'E', 'daily_summary'),
  'Heute: Eislaufen (Hohenschönhausen, Vormittag) · Hummus (Mittag, du kochst) · Trattoria Da Enzo (Abend, 19:30) · Bad putzen (du, überfällig)',
  'Decision 11 daily summary: activity with Zusatz, cook, reservation time and an overdue chore, in the order of the day');
insert into public.meal_plan_entries (household_id, date, slot_id, kind, recipe_id, leftovers_of_entry_id, text, eater_ids, sort)
values (tests.fx('home'), '2026-11-22', tests.fx('s_mittag'), 'leftovers', tests.fx('r_lasagne'), tests.fx('e_lasagne'), null, '{}', 0),
       (tests.fx('home'), '2026-11-22', tests.fx('s_morgen'), 'text', null, null, 'Pfannkuchen', '{}', 0);
insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on)
values (tests.fx('c_blumen'), tests.fx('home'), 'Blumen gießen', '{"type": "weekly", "every": 1, "weekdays": [7]}',
        '{"type": "anyone"}', '2026-11-22');
update public.chores set next_due_on = '2026-11-29' where id = tests.fx('c_bad');
select is(
  tests.body('2026-11-22 07:30', 'N', 'daily_summary'),
  'Heute: Pfannkuchen (Frühstück) · Reste: Lasagne (Mittag) · Fenster Wohnzimmer (du, überfällig) · Blumen gießen',
  'Decision 11 daily summary: free text, leftovers, overdue first (without its time), "anyone" without "du", not someone else''s turn');
select is(
  tests.body('2026-11-22 07:30', 'E', 'daily_summary'),
  'Heute: Pfannkuchen (Frühstück) · Reste: Lasagne (Mittag) · Blumen gießen · Müll rausbringen (du, 19:00)',
  'Decision 11 daily summary: Enrico''s turn at the rotation shows "du" and the time');
update public.chores set next_due_on = '2026-11-20' where id = tests.fx('c_bad');
delete from public.chores where id = tests.fx('c_blumen');

-- A collection (spec 0009) is a recipe of the kind "Sammlung": the part "Essen" names it like a
-- recipe, with its own title (Überschneidungen, plan 0013).
insert into fx (key) values ('r_tapas'), ('e_tapas');
insert into public.recipes (id, household_id, kind, title, course)
values (tests.fx('r_tapas'), tests.fx('home'), 'collection', 'Tapas-Abend', null);
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, eater_ids, cook_id)
values (tests.fx('e_tapas'), tests.fx('home'), '2026-11-23', tests.fx('s_abend'), 'recipe', tests.fx('r_tapas'), '{}',
        tests.fx('nadja'));
update public.notification_settings set daily_summary_parts = '{meals}' where household_id = tests.fx('home');
select is(tests.body('2026-11-23 07:30', 'E', 'daily_summary'), 'Heute: Tapas-Abend (Abend)',
  'Decision 9 daily summary: a collection in "Essen" is named like a recipe');
select is(tests.body('2026-11-23 07:30', 'N', 'daily_summary'), 'Heute: Tapas-Abend (Abend, du kochst)',
  'Decision 9 daily summary: … with "du kochst" for its cook');
update public.notification_settings set daily_summary_parts = '{meals,activities,chores,prep}'
where household_id = tests.fx('home');
delete from public.meal_plan_entries where id = tests.fx('e_tapas');
delete from public.recipes where id = tests.fx('r_tapas');

-- No control characters in what flows into a message (security check 0013, finding 3; like
-- push_subscriptions.device_label): a line break or tab would break the text on the lock screen.
select throws_ok(format('update public.chores set title = %L where id = %L', E'Müll\nraus', tests.fx('c_muell')),
  '23514', null, 'Security check chores: a title with a line break is refused');
select throws_ok(format('update public.activities set name = %L where id = %L', E'Kino\tAbend', tests.fx('a_kino')),
  '23514', null, 'Security check activities: a name with a tab is refused');
select throws_ok(format('update public.restaurants set name = %L where id = %L', E'Enzo\r', tests.fx('enzo')),
  '23514', null, 'Security check restaurants: a name with a carriage return is refused');
select throws_ok(format('update public.meal_plan_entries set note = %L where id = %L', E'Hohen\u0007schönhausen', tests.fx('e_eis')),
  '23514', null, 'Security check meal_plan_entries: a Zusatz with a control character is refused');
insert into fx (key) values ('e_text');
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, text, eater_ids, sort)
values (tests.fx('e_text'), tests.fx('home'), '2026-11-24', tests.fx('s_morgen'), 'text', 'Pfannkuchen', '{}', 0);
select throws_ok(format('update public.meal_plan_entries set text = %L where id = %L', E'Pfann\nkuchen', tests.fx('e_text')),
  '23514', null, 'Security check meal_plan_entries: a free text with a line break is refused');
delete from public.meal_plan_entries where id = tests.fx('e_text');
select lives_ok(format('update public.chores set title = %L where id = %L', 'Müll rausbringen · Bio', tests.fx('c_muell')),
  'Security check chores: ordinary text with a middle dot stays allowed');
update public.chores set title = 'Müll rausbringen' where id = tests.fx('c_muell');

-- At most 400 characters, cut at a separator.
insert into public.meal_plan_entries (household_id, date, slot_id, kind, text, eater_ids, sort)
select tests.fx('home'), '2026-11-25', tests.fx('s_mittag'), 'text', 'Gericht ' || n || ' ' || repeat('x', 50), '{}', n
from generate_series(1, 12) n;
select ok(
  (select char_length(b) <= 400 and b like 'Heute: Gericht 1 %' and b like '% · …'
   from tests.body('2026-11-25 07:30', 'E', 'daily_summary') b),
  'Decision 11 daily summary: at most 400 characters, ending with " · …"');

-- ===================== Activities the evening before (AC-019 to AC-021) =====================
select is(
  (select string_agg(c.who || ': ' || c.body, ' | ' order by c.who) from tests.c('2026-11-20 19:00') c
   where c.kind = 'activities_eve'),
  'E: Morgen: Eislaufen (Hohenschönhausen), Vormittag | N: Morgen: Eislaufen (Hohenschönhausen), Vormittag',
  'AC-019 activities eve: both get the message the evening before');
select is(
  (select jsonb_build_object('key', c.dedupe_key, 'expires', c.expires_at, 'url', c.url)
   from tests.c('2026-11-20 19:00') c where c.who = 'E' and c.kind = 'activities_eve'),
  jsonb_build_object('key', format('eve:%s:%s:2026-11-20', tests.fx('home'), tests.fx('enrico')),
                     'expires', tests.berlin('2026-11-21 00:00'),
                     'url', format('/kalender?tag=2026-11-21&eintrag=%s&haushalt=%s', tests.fx('e_eis'), tests.fx('home'))),
  'Decisions 6, 12, 13 activities eve: key, expiry and the link to the one entry');
select is(tests.body('2026-11-20 18:55', 'E', 'activities_eve'), null, 'AC-019 activities eve: not before 19:00');

insert into public.trips (id, household_id, from_on, to_on, note)
values (tests.fx('away'), tests.fx('home'), '2026-11-21', '2026-11-26', 'GEHEIM-Reise');
insert into public.trip_members (household_id, trip_id, member_id)
values (tests.fx('home'), tests.fx('away'), tests.fx('nadja'));
select is(
  (select string_agg(c.who, ',' order by c.who) from tests.c('2026-11-20 19:00') c where c.kind = 'activities_eve'),
  'E', 'AC-020 activities eve: Nadja is away on the day of the activity, only Enrico gets it');
delete from public.trips where id = tests.fx('away');

insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, activity_id, eater_ids)
values (tests.fx('e_kino'), tests.fx('home'), '2026-11-21', tests.fx('s_abend'), 'activity', tests.fx('a_kino'), '{}');
select is(
  (select jsonb_build_object('n', count(*), 'body', min(c.body), 'url', min(c.url))
   from tests.c('2026-11-20 19:00') c where c.who = 'E' and c.kind = 'activities_eve'),
  jsonb_build_object('n', 1, 'body', 'Morgen: Eislaufen (Hohenschönhausen), Vormittag · Kino, Abend',
                     'url', format('/kalender?tag=2026-11-21&haushalt=%s', tests.fx('home'))),
  'AC-021 activities eve: one message for several activities, linked to the day');
select is(tests.body('2026-11-21 19:00', 'E', 'activities_eve'), null,
  'AC-021 activities eve: no activity tomorrow, no message');

-- ===================== Chores at a time (AC-022 to AC-026) =====================
select is(
  (select string_agg(c.who || ': ' || c.body, ' | ' order by c.who) from tests.c('2026-11-22 19:00') c
   where c.kind = 'chore_reminder'),
  'E: Müll rausbringen · 19:00 · du bist dran',
  'AC-023 chore reminder: only Enrico, whose turn it is');
select is(
  (select jsonb_build_object('key', c.dedupe_key, 'expires', c.expires_at, 'url', c.url)
   from tests.c('2026-11-22 19:00') c where c.kind = 'chore_reminder'),
  jsonb_build_object('key', format('chore:%s:2026-11-22', tests.fx('c_muell')),
                     'expires', tests.berlin('2026-11-23 00:00'),
                     'url', format('/haushalt?aufgabe=%s&haushalt=%s', tests.fx('c_muell'), tests.fx('home'))),
  'Decisions 6, 12, 13 chore reminder: key, expiry at midnight and the link to the chore');
update public.chores set next_assignee_id = null where id = tests.fx('c_muell');
select is(
  (select string_agg(c.who, ',' order by c.who) from tests.c('2026-11-22 19:00') c where c.kind = 'chore_reminder'),
  'E,N', 'Decision 9 chore reminder: a rotation without a next person reminds everyone in it');
update public.chores set next_assignee_id = tests.fx('enrico') where id = tests.fx('c_muell');

update public.notification_settings set chore_reminders_enabled = false where member_id = tests.fx('enrico');
select is(
  (select count(*)::int from tests.c('2026-11-22 19:00') c where c.kind = 'chore_reminder'), 0,
  'AC-014 chore reminder: Enrico switched chore reminders off, none of his devices gets one');
update public.notification_settings set chore_reminders_enabled = true where member_id = tests.fx('enrico');

insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on, due_time) values
  (tests.fx('c_blumen'), tests.fx('home'), 'Blumen gießen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
   '{"type": "anyone"}', '2026-11-20', '18:00'),
  (tests.fx('c_matratze'), tests.fx('home'), 'Matratze drehen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
   '{"type": "together"}', '2026-11-20', '18:00');
select is(
  (select string_agg(c.who || ': ' || c.body, ' | ' order by c.who, c.body) from tests.c('2026-11-20 18:00') c
   where c.kind = 'chore_reminder'),
  'E: Blumen gießen · 18:00 | E: Matratze drehen · 18:00 | N: Blumen gießen · 18:00 | N: Matratze drehen · 18:00',
  'AC-024 chore reminder: "egal wer" and "zu zweit" go to both, without "du bist dran"');

update public.chores set next_due_on = '2026-11-29', last_done_on = '2026-11-22' where id = tests.fx('c_muell');
select is((select count(*)::int from tests.c('2026-11-22 19:00') c where c.kind = 'chore_reminder'), 0,
  'AC-025 chore reminder: done before the time → the next date moved, no reminder');
update public.chores set next_due_on = '2026-11-22', last_done_on = null, due_time = null where id = tests.fx('c_muell');
select is((select count(*)::int from tests.c('2026-11-22 19:00') c where c.kind = 'chore_reminder'), 0,
  'AC-025 chore reminder: without a time no reminder');
update public.chores set due_time = '19:00' where id = tests.fx('c_muell');
select is(
  (select count(*)::int from tests.c_between('2026-11-20 00:00', '2026-11-23 00:00') c
   where c.dedupe_key like 'chore:' || tests.fx('c_kueche') || '%'),
  0, 'AC-025 chore reminder: "bei Bedarf" with a time is never reminded');

update public.chores set active_months = '{6,7,8}' where id = tests.fx('c_muell');
select is((select count(*)::int from tests.c('2026-11-22 19:00') c where c.kind = 'chore_reminder'), 0,
  'Decision 10 chore reminder: a paused chore is not reminded');
update public.chores set active_months = null where id = tests.fx('c_muell');

update public.chores set due_time = '10:00' where id = tests.fx('c_bad');
insert into public.trips (id, household_id, from_on, to_on)
values (tests.fx('away'), tests.fx('home'), '2026-11-20', '2026-11-20');
insert into public.trip_members (household_id, trip_id, member_id)
values (tests.fx('home'), tests.fx('away'), tests.fx('enrico'));
select is(
  (select count(*)::int from tests.c('2026-11-20 10:00') c where c.dedupe_key like 'chore:' || tests.fx('c_bad') || '%'),
  0, 'AC-026 chore reminder: fixed to Enrico and Enrico is away → nobody');
delete from public.trips where id = tests.fx('away');
select is(tests.body('2026-11-20 10:00', 'E', 'chore_reminder'), 'Bad putzen · 10:00 · du bist dran',
  'AC-026 chore reminder: … and without the trip Enrico gets it');
update public.chores set due_time = null where id = tests.fx('c_bad');

-- ===================== Reservations (AC-027 to AC-031) =====================
select is(
  (select string_agg(c.who || ': ' || c.body, ' | ' order by c.who) from tests.c('2026-11-21 17:30') c
   where c.kind = 'reservation_reminder'),
  'E: Trattoria Da Enzo um 19:30 · in 2 Stunden · Route › | N: Trattoria Da Enzo um 19:30 · in 2 Stunden · Route ›',
  'AC-028 reservation: both eat along, both get it 2 hours before');
select is(
  (select jsonb_build_object('key', c.dedupe_key, 'expires', c.expires_at, 'url', c.url)
   from tests.c('2026-11-21 17:30') c where c.who = 'E' and c.kind = 'reservation_reminder'),
  jsonb_build_object('key', format('reservation:%s:2026-11-21:19:30', tests.fx('e_enzo')),
                     'expires', tests.berlin('2026-11-21 19:30'),
                     'url', format('/kalender?tag=2026-11-21&eintrag=%s&haushalt=%s', tests.fx('e_enzo'), tests.fx('home'))),
  'Decisions 6, 12, 13 reservation: key with the time, expiry at the reservation, link to the entry');
select is(tests.body('2026-11-21 17:25', 'E', 'reservation_reminder'), null, 'AC-028 reservation: not before 17:30');
update public.meal_plan_entries set eater_ids = array[tests.fx('enrico')] where id = tests.fx('e_enzo');
select is(
  (select string_agg(c.who, ',') from tests.c('2026-11-21 17:30') c where c.kind = 'reservation_reminder'), 'E',
  'AC-028 reservation: Nadja does not eat along → only Enrico');
update public.meal_plan_entries set eater_ids = '{}' where id = tests.fx('e_enzo');

update public.meal_plan_entries set remind_minutes_before = 60 where id = tests.fx('e_enzo');
select is(tests.body('2026-11-21 17:30', 'E', 'reservation_reminder'), null,
  'AC-029 reservation: with "1 h vorher" nothing at 17:30');
select is(tests.body('2026-11-21 18:30', 'E', 'reservation_reminder'), 'Trattoria Da Enzo um 19:30 · in 1 Stunde · Route ›',
  'AC-029 reservation: at 18:30 with "in 1 Stunde"');
update public.meal_plan_entries set remind_minutes_before = 30 where id = tests.fx('e_enzo');
update public.restaurants set address = null where id = tests.fx('enzo');
select is(tests.body('2026-11-21 19:00', 'E', 'reservation_reminder'), 'Trattoria Da Enzo um 19:30 · in 30 Minuten',
  'Decision 11 reservation: "in 30 Minuten", and no "Route" without a place');
update public.restaurants set address = 'Hauptstraße 1' where id = tests.fx('enzo');
update public.meal_plan_entries set remind_minutes_before = 120 where id = tests.fx('e_enzo');

select is(tests.body('2026-11-21 18:30', 'E', 'reservation_reminder'), null,
  'AC-031 reservation: entered at 18:30 for 19:30 with 2 h → 17:30 is more than 30 minutes ago, nothing');
select is(tests.body('2026-11-21 17:55', 'E', 'reservation_reminder'), 'Trattoria Da Enzo um 19:30 · in 2 Stunden · Route ›',
  'Decision 5 reservation: 25 minutes late is still sent');
select is(tests.body('2026-11-21 18:00', 'E', 'reservation_reminder'), 'Trattoria Da Enzo um 19:30 · in 2 Stunden · Route ›',
  'Decision 5 reservation: exactly 30 minutes late is still sent');
select is(tests.body('2026-11-21 18:01', 'E', 'reservation_reminder'), null,
  'AC-031, Decision 5 reservation: more than 30 minutes late is dropped');

-- ===================== Time zone and daylight saving (AC-033) =====================
insert into public.meal_plan_entries (household_id, date, slot_id, kind, text, eater_ids)
values (tests.fx('home'), '2027-03-28', tests.fx('s_morgen'), 'text', 'Brunch', '{}'),
       (tests.fx('home'), '2027-03-29', tests.fx('s_morgen'), 'text', 'Müsli', '{}');
select is(
  (select c.due_at from private.notification_candidates('2027-03-28 05:30:00+00') c
   where c.household_id = tests.fx('home') and c.profile_id = tests.fx('enrico') and c.kind = 'daily_summary'),
  '2027-03-28 05:30:00+00'::timestamptz,
  'AC-033 daily summary: on the day summer time begins it comes at 7:30 local time (05:30 UTC)');
select is(
  (select count(*)::int from private.notification_candidates('2027-03-28 06:30:00+00') c
   where c.household_id = tests.fx('home') and c.profile_id = tests.fx('enrico') and c.kind = 'daily_summary'),
  0, 'AC-033 daily summary: … not at 7:30 winter time');
select is(
  (select c.due_at from private.notification_candidates('2027-03-29 05:30:00+00') c
   where c.household_id = tests.fx('home') and c.profile_id = tests.fx('enrico') and c.kind = 'daily_summary'),
  '2027-03-29 05:30:00+00'::timestamptz, 'AC-033 daily summary: on Monday again at 7:30 local time');

insert into fx (key, id) values ('vera', tests.create_user('vera@example.com', 'Vera'));
insert into fx (key, id) values ('mars', tests.create_household('Mars', array[tests.fx('vera')]));
insert into fx (key) values ('s_mars');
update public.households
set timezone = 'Mars/Olympus_Mons',
    meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('s_mars'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('mars');
insert into public.meal_plan_entries (household_id, date, slot_id, kind, text, eater_ids)
values (tests.fx('mars'), '2026-11-20', tests.fx('s_mars'), 'text', 'Suppe', '{}');
update public.notification_settings set daily_summary_enabled = true where member_id = tests.fx('vera');
select is(
  (select count(*)::int from private.notification_candidates(tests.berlin('2026-11-20 07:30')) c
   where c.household_id in (tests.fx('home'), tests.fx('mars')) and c.kind = 'daily_summary'),
  2, 'Decision 16 time zone: a household with an unknown zone is skipped, the others still get theirs');

-- ===================== Too late is dropped (AC-034) =====================
insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on, due_time)
values (tests.fx('c_paket'), tests.fx('home'), 'Paket abholen', '{"type": "once", "date": "2026-11-20"}',
        jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), '2026-11-20', '08:45');
select is(tests.body('2026-11-20 09:00', 'E', 'daily_summary'), null,
  'AC-034 daily summary: the tick at 9:00 after a pause sends no summary for 7:30');
select is(tests.body('2026-11-20 09:00', 'E', 'chore_reminder'), 'Paket abholen · 8:45 · du bist dran',
  'AC-034 chore reminder: "Paket abholen" at 8:45 still comes at 9:00');
delete from public.chores where id = tests.fx('c_paket');

-- ===================== Silent while away (AC-035) =====================
insert into public.trips (id, household_id, from_on, to_on)
values (tests.fx('away'), tests.fx('home'), '2026-11-21', '2026-11-26');
insert into public.trip_members (household_id, trip_id, member_id)
values (tests.fx('home'), tests.fx('away'), tests.fx('enrico'));
select is(
  (select count(*)::int from tests.c_between('2026-11-20 19:00', '2026-11-27 00:00') c where c.who = 'E'),
  0, 'AC-035 silent: Enrico gets nothing while away, nor the evening before (AC-020), not even his chores');
select is(
  (select string_agg(distinct c.kind, ',' order by c.kind) from tests.c_between('2026-11-21 00:00', '2026-11-23 00:00') c
   where c.who = 'N'),
  'daily_summary,reservation_reminder',
  'AC-035 silent: Nadja gets her messages as usual');
select is(
  (select count(*)::int from tests.c('2026-11-22 19:00') c where c.kind = 'chore_reminder'), 0,
  'AC-035 silent: Enrico''s turn at "Müll rausbringen" is not handed to Nadja');
insert into public.trip_members (household_id, trip_id, member_id)
values (tests.fx('home'), tests.fx('away'), tests.fx('nadja'));
select is(
  (select count(*)::int from tests.c_between('2026-11-21 00:00', '2026-11-27 00:00') c), 0,
  'AC-035 silent: the whole household is away → nobody gets anything');
delete from public.trips where id = tests.fx('away');

-- ===================== AC-040: minimal content =====================
select is_empty(
  $$ select c.body from tests.c_between('2026-11-20 00:00', '2026-11-23 00:00') c
     where c.body ~ '@|GEHEIM' or c.url ~ '@|GEHEIM' $$,
  'AC-040 content: no e-mail address, no note of a recipe, restaurant, activity or trip');
select is_empty(
  format($$ select c.url from tests.c_between('2026-11-20 00:00', '2026-11-23 00:00') c
            where (c.who = 'E' and c.url like '%%%s%%') or (c.who = 'N' and c.url like '%%%s%%') $$,
         tests.fx('nadja'), tests.fx('enrico')),
  'AC-040 content: no link carries the id of another member');
select is_empty(
  $$ select c.url from tests.c_between('2026-11-20 00:00', '2026-11-23 00:00') c
     where c.url !~ '^/(\?haushalt=[0-9a-f-]{36}|haushalt\?aufgabe=[0-9a-f-]{36}&haushalt=[0-9a-f-]{36}|kalender\?tag=\d{4}-\d{2}-\d{2}(&eintrag=[0-9a-f-]{36})?&haushalt=[0-9a-f-]{36})$' $$,
  'Decision 12 links: every link has one of the known forms');
select is_empty(
  $$ select c.title from tests.c_between('2026-11-20 00:00', '2026-11-23 00:00') c where c.title <> 'Housekeeping' $$,
  'Decision 11 title: every message is titled "Housekeeping"');

-- ===================== AC-036: after leaving the household =====================
delete from public.household_members where household_id = tests.fx('home') and profile_id = tests.fx('nadja');
select is(
  (select count(*)::int from tests.c_between('2026-11-20 00:00', '2026-11-23 00:00') c where c.who = 'N'), 0,
  'AC-036 removed member: Nadja gets nothing from the household any more');
select isnt(
  (select count(*)::int from tests.c_between('2026-11-20 07:00', '2026-11-20 08:00') c where c.who = 'E'), 0,
  'AC-036 removed member: Enrico still does');
select is(
  (select count(*)::int from private.notification_candidates(tests.berlin('2026-11-20 07:30')) c
   where c.profile_id = tests.fx('nadja')), 0,
  'AC-036 removed member: no candidate for Nadja in any household');

-- Settings off for a kind means nothing of that kind (AC-014 for the other kinds).
update public.notification_settings set activities_eve_enabled = false, reservation_reminders_enabled = false
where member_id = tests.fx('enrico');
select is(
  (select count(*)::int from tests.c_between('2026-11-20 17:00', '2026-11-21 19:30') c
   where c.kind in ('activities_eve', 'reservation_reminder')),
  0, 'AC-014 switched off: no activities eve and no reservation reminder');

select * from finish();
rollback;
