-- The scheduler for reminders on plan entries (spec 0017, Task 2): private.notification_candidates
-- at a fixed time decides who gets which entry reminder with which text, link and expiry, in the
-- household's local time; run_notification_tick writes it once per device with high urgency and
-- never logs its text. Example week of the spec: household "Görlitz" with Enrico and Nadja in
-- Europe/Berlin, "Lasagne" on Saturday, 28.11.2026, evening.
begin;
\ir _helpers.psql
select plan(40);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;

-- The entry reminders of a household at a local Berlin time, with the person as E, N or J.
create function tests.c(p_local timestamp, p_household text default 'home')
returns table (who text, dedupe_key text, due_at timestamptz, expires_at timestamptz, title text, body text, url text)
language sql
as $$
  select case c.profile_id when tests.fx('enrico') then 'E' when tests.fx('nadja') then 'N'
                           when tests.fx('jana') then 'J' else '?' end,
         c.dedupe_key, c.due_at, c.expires_at, c.title, c.body, c.url
  from private.notification_candidates(tests.berlin(p_local)) c
  where c.household_id = tests.fx(p_household) and c.kind = 'entry_reminder'
$$;
-- "E: <body> | N: <body>" at a local time.
create function tests.msgs(p_local timestamp, p_household text default 'home') returns text language sql
as $$ select string_agg(c.who || ': ' || c.body, ' | ' order by c.who, c.body) from tests.c(p_local, p_household) c $$;
-- The text of one entry's reminder at a local time (the same for every recipient).
create function tests.body_of(p_local timestamp, p_entry text) returns text language sql
as $$
  select min(c.body) from tests.c(p_local) c where c.dedupe_key like 'entry:' || tests.fx(p_entry) || ':%'
$$;
create function tests.reminder(p_entry text, p_offset integer, p_at time, p_text text default null) returns void
language sql
as $$
  update public.meal_plan_entries
  set reminder_day_offset = p_offset, reminder_at = p_at, reminder_text = p_text
  where id = tests.fx(p_entry)
$$;
create function tests.tick(p_local timestamp) returns integer language sql
as $$ select private.run_notification_tick(tests.berlin(p_local)) $$;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('jana', tests.create_user('jana@example.com', 'Jana'));
insert into fx (key, id) values
  ('home', tests.create_household('Görlitz', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('schmidt', tests.create_household('Schmidt', array[tests.fx('jana')]));
insert into fx (key) values
  ('s_vor'), ('s_mittag'), ('s_abend'), ('s_gone'), ('s_jana'), ('r_lasagne'), ('a_eis'), ('enzo'),
  ('e_lasagne'), ('e_sonntag'), ('e_eis'), ('e_reste'), ('e_enzo'), ('e_lang'), ('e_ohne_slot'), ('e_dst'), ('e_jana'),
  ('away');

update public.households
set meal_slots = jsonb_build_array(
  jsonb_build_object('id', tests.fx('s_vor'), 'name', 'Vormittag', 'sort', 0),
  jsonb_build_object('id', tests.fx('s_mittag'), 'name', 'Mittag', 'sort', 1),
  jsonb_build_object('id', tests.fx('s_abend'), 'name', 'Abend', 'sort', 2),
  jsonb_build_object('id', tests.fx('s_gone'), 'name', 'Spät', 'sort', 3))
where id = tests.fx('home');
update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('s_jana'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('schmidt');
insert into public.recipes (id, household_id, title, notes)
values (tests.fx('r_lasagne'), tests.fx('home'), 'Lasagne', 'GEHEIM-Rezeptnotiz');
insert into public.activities (id, household_id, name, name_key, description)
values (tests.fx('a_eis'), tests.fx('home'), 'Eislaufen', 'eislaufen', 'GEHEIM-Beschreibung');
insert into public.restaurants (id, household_id, name, notes)
values (tests.fx('enzo'), tests.fx('home'), 'Trattoria Da Enzo', 'GEHEIM-Restaurantnotiz');

-- The fixtures lie on fixed days; the check "not in the past at the time of setting" uses the
-- real clock and is tested in entry_reminders.test.sql. Here the scheduler gets its time as p_now.
alter table public.meal_plan_entries disable trigger meal_plan_entries_check_reminder;
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, restaurant_id, activity_id,
                                      leftovers_of_entry_id, text, note, eater_ids) values
  (tests.fx('e_lasagne'), tests.fx('home'), '2026-11-28', tests.fx('s_abend'), 'recipe', tests.fx('r_lasagne'), null, null,
   null, null, null, array[tests.fx('enrico'), tests.fx('nadja')]),
  (tests.fx('e_eis'), tests.fx('home'), '2026-11-29', tests.fx('s_vor'), 'activity', null, null, tests.fx('a_eis'),
   null, null, 'Hohenschönhausen', array[tests.fx('enrico')]),
  (tests.fx('e_reste'), tests.fx('home'), '2026-11-30', tests.fx('s_mittag'), 'leftovers', tests.fx('r_lasagne'), null,
   null, tests.fx('e_lasagne'), null, null, '{}'),
  (tests.fx('e_enzo'), tests.fx('home'), '2026-12-01', tests.fx('s_abend'), 'restaurant', null, tests.fx('enzo'), null,
   null, null, null, '{}'),
  (tests.fx('e_lang'), tests.fx('home'), '2026-12-02', tests.fx('s_abend'), 'text', null, null, null,
   null, repeat('Lang', 125), null, '{}'),
  (tests.fx('e_ohne_slot'), tests.fx('home'), '2026-12-03', tests.fx('s_gone'), 'text', null, null, null,
   null, 'Pfannkuchen', null, '{}'),
  (tests.fx('e_dst'), tests.fx('home'), '2027-03-28', tests.fx('s_abend'), 'text', null, null, null,
   null, 'Osterbraten', null, '{}'),
  (tests.fx('e_jana'), tests.fx('schmidt'), '2026-11-28', tests.fx('s_jana'), 'text', null, null, null,
   null, 'Suppe', null, '{}');
update public.households
set meal_slots = meal_slots - 3
where id = tests.fx('home');
select tests.reminder('e_lasagne', 0, '17:00');

-- ===================== AC-016: on time, with the jump to the entry =====================
select is(tests.msgs('2026-11-28 17:00'), 'E: Erinnerung: Lasagne · heute Abend | N: Erinnerung: Lasagne · heute Abend',
  'AC-016 entry reminder: both eaters get "Erinnerung: Lasagne · heute Abend" at 17:00');
select is(
  (select jsonb_build_object('title', c.title, 'key', c.dedupe_key, 'due', c.due_at, 'expires', c.expires_at, 'url', c.url)
   from tests.c('2026-11-28 17:00') c where c.who = 'N'),
  jsonb_build_object('title', 'Housekeeping', 'key', format('entry:%s:2026-11-28:17:00', tests.fx('e_lasagne')),
                     'due', tests.berlin('2026-11-28 17:00'), 'expires', tests.berlin('2026-11-29 00:00'),
                     'url', format('/kalender?tag=2026-11-28&eintrag=%s&haushalt=%s', tests.fx('e_lasagne'), tests.fx('home'))),
  'AC-016, Decision 3 entry reminder: title, key with send day and time, expiry at the end of the send day, link to the entry');
select is(tests.msgs('2026-11-28 16:55'), null, 'AC-016 entry reminder: nothing before 17:00');

-- ===================== AC-018: once, never late =====================
select is(
  (select array_agg(t order by t) from generate_series('2026-11-28 16:30'::timestamp, '2026-11-28 18:00', '5 minutes') t
   where exists (select 1 from tests.c(t) c where c.who = 'E')),
  array['2026-11-28 17:00', '2026-11-28 17:05', '2026-11-28 17:10', '2026-11-28 17:15', '2026-11-28 17:20',
        '2026-11-28 17:25', '2026-11-28 17:30']::timestamp[],
  'AC-018 entry reminder: a candidate from its time up to and including 30 minutes later');
select is(tests.msgs('2026-11-28 17:35'), null,
  'AC-018 entry reminder: the tick at 17:35 after a pause sends nothing any more (35 minutes late)');

-- ===================== AC-017: only who eats along =====================
update public.meal_plan_entries set eater_ids = array[tests.fx('nadja')] where id = tests.fx('e_lasagne');
select is(tests.msgs('2026-11-28 17:00'), 'N: Erinnerung: Lasagne · heute Abend',
  'AC-017 entry reminder: only Nadja eats along, Enrico gets nothing');
update public.meal_plan_entries set eater_ids = '{}' where id = tests.fx('e_lasagne');
select is((select count(*)::int from tests.c('2026-11-28 17:00')), 2,
  'REQ-005 entry reminder: without "Wer isst mit?" every member gets it');
update public.meal_plan_entries set eater_ids = array[tests.fx('enrico'), tests.fx('nadja')] where id = tests.fx('e_lasagne');

-- ===================== The text (REQ-005, AC-014) =====================
select tests.reminder('e_lasagne', 1, '18:00', 'Fleisch auftauen');
select is(tests.msgs('2026-11-27 18:00'),
  'E: Erinnerung: Lasagne · morgen Abend · Fleisch auftauen | N: Erinnerung: Lasagne · morgen Abend · Fleisch auftauen',
  'AC-014 entry reminder: the day before with "morgen" and the text');
select is((select c.dedupe_key from tests.c('2026-11-27 18:00') c where c.who = 'E'),
  format('entry:%s:2026-11-27:18:00', tests.fx('e_lasagne')), 'Decision 3 entry reminder: the key names the send day');
select is(tests.msgs('2026-11-28 17:00'), null, 'AC-009 entry reminder: changed to the day before, nothing at the old time');
select tests.reminder('e_lasagne', 2, '09:00');
select is(tests.msgs('2026-11-26 09:00'), 'E: Erinnerung: Lasagne · Sa 28.11., Abend | N: Erinnerung: Lasagne · Sa 28.11., Abend',
  'AC-010 entry reminder: two days before with weekday and date');
select tests.reminder('e_lasagne', 0, '17:00');

select tests.reminder('e_eis', 0, '08:00');
select is(tests.msgs('2026-11-29 08:00'),
  'E: Erinnerung: Eislaufen (Hohenschönhausen) · heute Vormittag | N: Erinnerung: Eislaufen (Hohenschönhausen) · heute Vormittag',
  'REQ-004, Offene Frage 5 entry reminder: an activity with its Zusatz, for every member whatever "Wer isst mit?" says');
select tests.reminder('e_reste', 1, '19:00');
select is(tests.body_of('2026-11-29 19:00', 'e_reste'), 'Erinnerung: Reste von Samstag · morgen Mittag',
  'REQ-005 entry reminder: leftovers named as in the calendar');
select tests.reminder('e_enzo', 5, '12:00');
select is(tests.body_of('2026-11-26 12:00', 'e_enzo'), 'Erinnerung: Trattoria Da Enzo · Di 1.12., Abend',
  'REQ-005 entry reminder: a restaurant by its name; German weekday names, never the locale; no leading zeros');
select tests.reminder('e_ohne_slot', 3, '10:00');
select is(tests.body_of('2026-11-30 10:00', 'e_ohne_slot'), 'Erinnerung: Pfannkuchen · Do 3.12.',
  'REQ-005 entry reminder: a removed meal slot leaves out the Tageszeit');
select tests.reminder('e_lang', 0, '17:00', repeat('x', 80));
select ok(
  (select char_length(b) = 400 and b like 'Erinnerung: LangLang%' and b like '%… · heute Abend · ' || repeat('x', 80)
   from (select tests.body_of('2026-12-02 17:00', 'e_lang') as b) x),
  'REQ-005 entry reminder: a very long name is cut with "…", so the message has at most 400 characters');

-- ===================== AC-019: silent while away =====================
select tests.reminder('e_lasagne', null, null);
update public.meal_plan_entries set date = '2026-11-29', slot_id = tests.fx('s_mittag') where id = tests.fx('e_lasagne');
select tests.reminder('e_lasagne', 1, '18:00');
insert into public.absences (id, household_id, member_id, from_on, to_on, note)
values (tests.fx('away'), tests.fx('home'), tests.fx('enrico'), '2026-11-27', '2026-11-28', 'GEHEIM-Reise');
select is(tests.msgs('2026-11-28 18:00'), 'N: Erinnerung: Lasagne · morgen Mittag',
  'AC-019 entry reminder: Enrico is away on the send day, only Nadja gets it');
update public.absences set from_on = '2026-11-29', to_on = '2026-11-29' where id = tests.fx('away');
select is(tests.msgs('2026-11-28 18:00'), 'N: Erinnerung: Lasagne · morgen Mittag',
  'REQ-005 entry reminder: away on the day of the entry is silent too');
update public.absences set member_id = null where id = tests.fx('away');
select is(tests.msgs('2026-11-28 18:00'), null, 'REQ-005 entry reminder: the whole household is away → nobody');
delete from public.absences where id = tests.fx('away');

-- ===================== AC-021: moving takes the reminder along =====================
update public.meal_plan_entries set date = '2026-11-28', slot_id = tests.fx('s_abend') where id = tests.fx('e_lasagne');
select is((select count(*)::int from tests.c('2026-11-27 18:00')), 2, 'AC-021 entry reminder: before the move, Friday 18:00');
update public.meal_plan_entries set date = '2026-11-29', slot_id = tests.fx('s_mittag') where id = tests.fx('e_lasagne');
select is(tests.msgs('2026-11-27 18:00'), null, 'AC-021 entry reminder: after the move nothing on Friday at 18:00');
select is(tests.msgs('2026-11-28 18:00'),
  'E: Erinnerung: Lasagne · morgen Mittag | N: Erinnerung: Lasagne · morgen Mittag',
  'AC-021 entry reminder: … but on Saturday at 18:00 with "morgen Mittag"');
select is((select min(c.dedupe_key) from tests.c('2026-11-28 18:00') c),
  format('entry:%s:2026-11-28:18:00', tests.fx('e_lasagne')),
  'Decision 3 entry reminder: the moved reminder has a new key, so it is sent again');
update public.meal_plan_entries set date = null where id = tests.fx('e_lasagne');
select is(tests.msgs('2026-11-28 18:00'), null, 'AC-023 entry reminder: put back into "Vorgemerkt" nothing is sent');
update public.meal_plan_entries set date = '2026-11-28', slot_id = tests.fx('s_abend') where id = tests.fx('e_lasagne');
select tests.reminder('e_lasagne', 0, '17:00');

-- ===================== AC-025: the kind switched off =====================
update public.notification_settings set entry_reminders_enabled = false where member_id = tests.fx('enrico');
select is(tests.msgs('2026-11-28 17:00'), 'N: Erinnerung: Lasagne · heute Abend',
  'AC-025 entry reminder: Enrico switched the kind off, only Nadja gets it');
update public.notification_settings set entry_reminders_enabled = true where member_id = tests.fx('enrico');

-- ===================== AC-033: time zone and daylight saving =====================
select tests.reminder('e_dst', 0, '18:00');
select is(
  (select c.due_at from private.notification_candidates('2027-03-28 16:00:00+00') c
   where c.household_id = tests.fx('home') and c.profile_id = tests.fx('enrico') and c.kind = 'entry_reminder'),
  '2027-03-28 16:00:00+00'::timestamptz,
  'AC-033 entry reminder: on the day summer time begins 18:00 is 16:00 UTC');
select is(
  (select count(*)::int from private.notification_candidates('2027-03-28 17:00:00+00') c
   where c.household_id = tests.fx('home') and c.kind = 'entry_reminder'),
  0, 'AC-033 entry reminder: … not at 18:00 winter time (an hour late)');
select tests.reminder('e_dst', 1, '18:00');
select is(
  (select c.due_at from private.notification_candidates('2027-03-27 17:00:00+00') c
   where c.household_id = tests.fx('home') and c.profile_id = tests.fx('enrico') and c.kind = 'entry_reminder'),
  '2027-03-27 17:00:00+00'::timestamptz,
  'AC-033 entry reminder: the day before, still winter time, 18:00 is 17:00 UTC');
select is(
  (select c.expires_at from private.notification_candidates('2027-03-27 17:00:00+00') c
   where c.household_id = tests.fx('home') and c.profile_id = tests.fx('enrico') and c.kind = 'entry_reminder'),
  '2027-03-27 23:00:00+00'::timestamptz,
  'Decision 3 entry reminder: it expires at local midnight of the send day');

-- ===================== AC-040 and the ADR-0014 addendum: content =====================
select is_empty(
  $$ select c.body from generate_series('2026-11-22 00:00'::timestamp, '2026-12-04 00:00', '30 minutes') t, tests.c(t) c
     where c.body ~ '@|GEHEIM' or c.url ~ '@|GEHEIM' $$,
  'AC-040 entry reminder: no e-mail address, no note of a recipe, restaurant, activity or trip');
select is_empty(
  $$ select c.url from generate_series('2026-11-22 00:00'::timestamp, '2026-12-04 00:00', '30 minutes') t, tests.c(t) c
     where c.url !~ '^/kalender\?tag=\d{4}-\d{2}-\d{2}&eintrag=[0-9a-f-]{36}&haushalt=[0-9a-f-]{36}$' $$,
  'Decision 12 entry reminder: every link opens the entry in the calendar');

-- ===================== AC-020: deleted, left, foreign household =====================
select tests.reminder('e_jana', 0, '17:00', 'Brot holen');
select is(tests.msgs('2026-11-28 17:00', 'schmidt'), 'J: Erinnerung: Suppe · heute Abend · Brot holen',
  'AC-020 entry reminder: Jana gets the reminder of her own household');
select is(
  (select count(*)::int from private.notification_candidates(tests.berlin('2026-11-28 17:00')) c
   where c.kind = 'entry_reminder'
     and ((c.profile_id = tests.fx('jana') and c.household_id <> tests.fx('schmidt'))
          or (c.profile_id <> tests.fx('jana') and c.household_id = tests.fx('schmidt')))),
  0, 'AC-020 entry reminder: nobody gets a reminder of another household');

-- ===================== The tick: once per device, high, no text in the log =====================
select tests.set_push_vault();
insert into fx (key, id) values
  ('chrome', tests.add_push_subscription(tests.fx('enrico'), 'chrome')),
  ('firefox', tests.add_push_subscription(tests.fx('enrico'), 'firefox')),
  ('laptop', tests.add_push_subscription(tests.fx('nadja'), 'laptop'));
create temp table queue_before on commit drop as select coalesce(max(id), 0) as id from net.http_request_queue;
select tests.reminder('e_lasagne', 0, '17:00', 'Käse kaufen');
select is(tests.tick('2026-11-28 17:00'), 3, 'AC-016 tick: one message for each of the three devices');
select is(tests.tick('2026-11-28 17:05'), 0, 'AC-018 tick: the tick at 17:05 sends nothing again');
select is(
  (select array_agg(x.n order by x.n) from (
     select count(*)::int as n from private.notification_deliveries d
     where d.kind = 'entry_reminder' and d.household_id = tests.fx('home')
     group by d.subscription_id) x),
  array[1, 1, 1], 'AC-018 tick: exactly one log row per device');
select is(
  (select jsonb_agg(distinct jsonb_build_object('urgency', m ->> 'urgency', 'ttl', m -> 'ttl', 'body', m -> 'notification' ->> 'body'))
   from net.http_request_queue q, jsonb_array_elements(convert_from(q.body, 'utf8')::jsonb -> 'messages') m
   where q.id > (select id from queue_before)),
  jsonb_build_array(jsonb_build_object('urgency', 'high', 'ttl', 7 * 3600,
                                       'body', 'Erinnerung: Lasagne · heute Abend · Käse kaufen')),
  'Offene Frage 8, Decision 3 tick: high urgency, valid until midnight, the text only in the message');
select is(
  (select count(*)::int from private.notification_deliveries d where to_jsonb(d)::text ~ 'Käse|Lasagne|Erinnerung'),
  0, 'ADR-0014 addendum: the delivery log never holds the text');

delete from public.meal_plan_entries where id = tests.fx('e_lasagne');
select is(tests.msgs('2026-11-28 17:00'), null, 'AC-020 entry reminder: a deleted entry sends nothing');
select tests.reminder('e_eis', 0, '08:00');
delete from public.household_members where household_id = tests.fx('home') and profile_id = tests.fx('nadja');
select is(tests.msgs('2026-11-29 08:00'), 'E: Erinnerung: Eislaufen (Hohenschönhausen) · heute Vormittag',
  'AC-020 entry reminder: Nadja left the household, only Enrico gets it');

alter table public.meal_plan_entries enable trigger meal_plan_entries_check_reminder;

select * from finish();
rollback;
