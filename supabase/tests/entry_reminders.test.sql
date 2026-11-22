-- Reminders on plan entries (spec 0017, Task 1): three columns on meal_plan_entries, written only
-- through apply_changes like every other entry field. Members set, change and clear them; a
-- foreign household and anon cannot; the database refuses invalid values and a time in the past;
-- moving keeps them, "Vormerken" clears them and undo restores them. The per-person switch
-- entry_reminders_enabled lives in notification_settings. Dates are relative to today (Berlin), so
-- the "not in the past" check holds whenever the test runs.
begin;
\ir _helpers.psql
select plan(57);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- A day relative to today in the household's time zone.
create function tests.d(p_days integer) returns date language sql stable
as $$ select (now() at time zone 'Europe/Berlin')::date + p_days $$;
grant execute on function tests.d(integer) to anon, authenticated;

create function tests.apply_sql(p_household text, p_ops jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx(p_household), p_ops) $$;
grant execute on function tests.apply_sql(text, jsonb) to anon, authenticated;

-- One patch of an entry through apply_changes.
create function tests.patch_sql(p_entry text, p_changes jsonb, p_household text default 'home') returns text
language sql stable
as $$
  select tests.apply_sql(p_household, jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'meal_plan_entries', 'id', tests.fx(p_entry), 'changes', p_changes)))
$$;
grant execute on function tests.patch_sql(text, jsonb, text) to anon, authenticated;

-- The reminder of an entry as {offset, at, text}, read as postgres.
create function tests.reminder(p_entry text) returns jsonb language sql stable security definer
as $$
  select jsonb_build_object('date', e.date, 'offset', e.reminder_day_offset, 'at', e.reminder_at, 'text', e.reminder_text)
  from public.meal_plan_entries e where e.id = tests.fx(p_entry)
$$;
grant execute on function tests.reminder(text) to anon, authenticated;

create function tests.r(p_date date, p_offset integer, p_at text, p_text text) returns jsonb language sql immutable
as $$ select jsonb_build_object('date', p_date, 'offset', p_offset, 'at', p_at::time, 'text', p_text) $$;
grant execute on function tests.r(date, integer, text, text) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('jana', tests.create_user('jana@example.com', 'Jana'));
insert into fx (key, id) values
  ('home', tests.create_household('Görlitz', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('schmidt', tests.create_household('Schmidt', array[tests.fx('jana')]));
insert into fx (key) values ('abend'), ('lasagne'), ('e_lasagne'), ('e_curry'), ('e_shakshuka'), ('e_new'), ('e_far'),
  ('e_later');
update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('abend'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('home');
insert into public.recipes (id, household_id, title) values (tests.fx('lasagne'), tests.fx('home'), 'Lasagne');
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, text) values
  (tests.fx('e_lasagne'), tests.fx('home'), tests.d(6), tests.fx('abend'), 'recipe', tests.fx('lasagne'), null),
  (tests.fx('e_curry'), tests.fx('home'), tests.d(0), tests.fx('abend'), 'text', null, 'Curry'),
  (tests.fx('e_shakshuka'), tests.fx('home'), null, tests.fx('abend'), 'text', null, 'Shakshuka'),
  (tests.fx('e_far'), tests.fx('home'), tests.d(400), tests.fx('abend'), 'text', null, 'Geburtstag');
update public.meal_plan_entries set updated_at = now() - interval '1 day' where id = tests.fx('e_lasagne');

-- ===================== Set, change, clear (AC-005, AC-006, AC-009) =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  tests.patch_sql('e_lasagne', '{"reminder_day_offset": 1, "reminder_at": "18:00", "reminder_text": "Fleisch auftauen"}'),
  'AC-005 apply_changes: a member sets a reminder on an entry');
select is(tests.reminder('e_lasagne'), tests.r(tests.d(6), 1, '18:00', 'Fleisch auftauen'),
  'AC-005 meal_plan_entries: offset, time and text are stored');
select is((select updated_at from public.meal_plan_entries where id = tests.fx('e_lasagne')), now(),
  'AC-005 meal_plan_entries: the server sets updated_at, so the reminder reaches the other devices');
select lives_ok(tests.patch_sql('e_lasagne', '{"reminder_day_offset": 0, "reminder_at": "17:00"}'),
  'AC-009 apply_changes: day and time are changed');
select is(tests.reminder('e_lasagne'), tests.r(tests.d(6), 0, '17:00', 'Fleisch auftauen'),
  'AC-009 meal_plan_entries: the change is stored, the text stays');
select lives_ok(tests.patch_sql('e_lasagne', '{"reminder_day_offset": null, "reminder_at": null, "reminder_text": null}'),
  'AC-006 apply_changes: switching the reminder off clears all three fields');
select is(tests.reminder('e_lasagne'), tests.r(tests.d(6), null, null, null),
  'AC-006 meal_plan_entries: no reminder left');
select lives_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'meal_plan_entries', 'row',
    jsonb_build_object('id', tests.fx('e_new'), 'date', tests.d(3), 'slot_id', tests.fx('abend'), 'kind', 'text',
                       'text', 'Pizza', 'reminder_day_offset', 1, 'reminder_at', '09:00')))),
  'AC-002 apply_changes: an entry is added with its reminder in one insert');
select is(tests.reminder('e_new'), tests.r(tests.d(3), 1, '09:00', null),
  'AC-002 meal_plan_entries: the new entry carries the reminder');
select lives_ok(tests.patch_sql('e_far', '{"reminder_day_offset": 366, "reminder_at": "08:00"}'),
  'Offene Frage 7: 366 days ahead is allowed');
select lives_ok(tests.patch_sql('e_lasagne', jsonb_build_object('reminder_day_offset', 1, 'reminder_at', '18:00',
                                                              'reminder_text', repeat('x', 80))),
  'AC-015 meal_plan_entries: 80 characters of text are allowed');
select lives_ok(tests.patch_sql('e_lasagne', '{"reminder_text": "Fleisch auftauen"}'),
  'AC-014 apply_changes: the text alone is changed');

-- ===================== Foreign household and anon =====================
select tests.authenticate_as(tests.fx('jana'));
select throws_ok(tests.patch_sql('e_lasagne', '{"reminder_at": "19:00"}'), '42501', 'not_member',
  'Threat model apply_changes: a member of another household cannot write into it');
select throws_ok(tests.patch_sql('e_lasagne', '{"reminder_at": "19:00"}', 'schmidt'), 'P0002', 'row_not_found',
  'Threat model apply_changes: … nor reach the entry through her own household');
select is(tests.affected(format($$ update public.meal_plan_entries set reminder_at = '19:00' where id = %L $$,
                                tests.fx('e_lasagne'))), 0,
  'Threat model meal_plan_entries: a direct update from another household changes nothing');
select is(tests.affected(format($$ select reminder_text from public.meal_plan_entries where id = %L $$,
                                tests.fx('e_lasagne'))), 0,
  'Threat model meal_plan_entries: another household does not read the reminder text');
select tests.authenticate_as_anon();
select throws_ok(tests.patch_sql('e_lasagne', '{"reminder_at": "19:00"}'), '42501', null,
  'Threat model apply_changes: anon cannot set a reminder');
select throws_ok(format($$ update public.meal_plan_entries set reminder_at = '19:00' where id = %L $$, tests.fx('e_lasagne')),
  '42501', null, 'Threat model meal_plan_entries: anon cannot update directly');
select tests.clear_authentication();
select is(tests.reminder('e_lasagne'), tests.r(tests.d(6), 1, '18:00', 'Fleisch auftauen'),
  'Threat model meal_plan_entries: the reminder is unchanged');

-- ===================== Invalid input (AC-012, AC-013, AC-015) =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.patch_sql('e_lasagne', '{"reminder_at": "17:03"}'), '23514', null,
  'AC-013 meal_plan_entries: 17:03 is not a 5-minute step');
select throws_ok(tests.patch_sql('e_lasagne', '{"reminder_at": "17:00:30"}'), '23514', null,
  'AC-013 meal_plan_entries: seconds are not allowed');
select throws_ok(tests.patch_sql('e_lasagne', '{"reminder_day_offset": -1}'), '23514', null,
  'AC-013 meal_plan_entries: a reminder after the day of the entry is refused');
select throws_ok(tests.patch_sql('e_far', '{"reminder_day_offset": 367}'), '23514', null,
  'Offene Frage 7: more than 366 days ahead is refused');
select throws_ok(tests.patch_sql('e_lasagne', jsonb_build_object('reminder_text', repeat('x', 81))), '23514', null,
  'AC-015 meal_plan_entries: 81 characters are refused');
select throws_ok(tests.patch_sql('e_lasagne', jsonb_build_object('reminder_text', E'Fleisch\nauftauen')), '23514', null,
  'AC-015 meal_plan_entries: a line break is refused');
select throws_ok(tests.patch_sql('e_lasagne', jsonb_build_object('reminder_text', E'Fleisch\tauftauen')), '23514', null,
  'REQ-004 meal_plan_entries: a tab is refused');
select throws_ok(tests.patch_sql('e_lasagne', jsonb_build_object('reminder_text', E'Fleisch \u202Eauftauen')), '23514', null,
  'AC-015 meal_plan_entries: a reminder text with a direction override is refused');
select throws_ok(tests.patch_sql('e_lasagne', jsonb_build_object('reminder_text', E'Fleisch\u200Bauftauen')), '23514', null,
  'AC-015 meal_plan_entries: a reminder text with an invisible character is refused');
select throws_ok(tests.patch_sql('e_lasagne', '{"reminder_text": " Fleisch auftauen"}'), '23514', null,
  'REQ-004 meal_plan_entries: a space at the start is refused');
select throws_ok(tests.patch_sql('e_lasagne', '{"reminder_text": "Fleisch auftauen "}'), '23514', null,
  'REQ-004 meal_plan_entries: a space at the end is refused');
select throws_ok(tests.patch_sql('e_lasagne', '{"reminder_text": ""}'), '23514', null,
  'REQ-004 meal_plan_entries: an empty text is refused (no text is null)');
select throws_ok(tests.patch_sql('e_lasagne', '{"reminder_at": null}'), '23514', null,
  'Decision 1 meal_plan_entries: an offset without a time is refused');
select throws_ok(tests.patch_sql('e_lasagne', '{"reminder_day_offset": null, "reminder_at": null}'), '23514', null,
  'Decision 1 meal_plan_entries: a text without a time is refused');
select throws_ok(tests.patch_sql('e_shakshuka', '{"reminder_day_offset": 0, "reminder_at": "17:00"}'), '23514', null,
  'AC-007 meal_plan_entries: an entry without a day cannot get a reminder');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'meal_plan_entries', 'row',
    jsonb_build_object('date', null, 'slot_id', tests.fx('abend'), 'kind', 'text', 'text', 'Suppe',
                       'reminder_day_offset', 0, 'reminder_at', '17:00')))),
  '23514', null, 'AC-003 meal_plan_entries: a vorgemerkt entry is not added with a reminder');
select throws_ok(tests.patch_sql('e_curry', '{"reminder_day_offset": 1, "reminder_at": "18:00"}'), '22023',
  'reminder_in_past', 'AC-011, AC-013 meal_plan_entries: a reminder the day before today is refused');
select throws_ok(tests.patch_sql('e_curry', '{"reminder_day_offset": 0, "reminder_at": "00:00"}'), '22023',
  'reminder_in_past', 'AC-011 meal_plan_entries: a reminder earlier today is refused');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'meal_plan_entries', 'row',
    jsonb_build_object('date', tests.d(0), 'slot_id', tests.fx('abend'), 'kind', 'text', 'text', 'Suppe',
                       'reminder_day_offset', 2, 'reminder_at', '17:00')))),
  '22023', 'reminder_in_past', 'AC-011 meal_plan_entries: an entry is not added with a reminder in the past');
select tests.clear_authentication();
select is(tests.reminder('e_lasagne'), tests.r(tests.d(6), 1, '18:00', 'Fleisch auftauen'),
  'AC-013 meal_plan_entries: after every refused call the reminder is as it was');

-- ===================== Moving, Vormerken, undo, delete (REQ-006) =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.patch_sql('e_lasagne', jsonb_build_object('date', tests.d(7))),
  'AC-021 apply_changes: the entry is moved');
select is(tests.reminder('e_lasagne'), tests.r(tests.d(7), 1, '18:00', 'Fleisch auftauen'),
  'AC-021 meal_plan_entries: offset, time and text move with it');
select lives_ok(tests.patch_sql('e_lasagne', jsonb_build_object('date', tests.d(0))),
  'AC-022 apply_changes: moving it to today is allowed, although the reminder is then in the past');
select lives_ok(tests.patch_sql('e_lasagne', jsonb_build_object('date', tests.d(6))),
  'AC-022 apply_changes: undo moves it back');
select is(tests.reminder('e_lasagne'), tests.r(tests.d(6), 1, '18:00', 'Fleisch auftauen'),
  'AC-022 meal_plan_entries: … with the reminder');
select lives_ok(tests.patch_sql('e_lasagne', '{"date": null}'),
  'AC-023 apply_changes: a patch of only date = null (also from v2026.11.1) puts it into "Vorgemerkt"');
select is(tests.reminder('e_lasagne'), tests.r(null, null, null, null),
  'AC-023 meal_plan_entries: "Vormerken" clears the reminder');
select lives_ok(
  tests.patch_sql('e_lasagne', jsonb_build_object('date', tests.d(6), 'reminder_day_offset', 1, 'reminder_at', '18:00',
                                                  'reminder_text', 'Fleisch auftauen')),
  'AC-023 apply_changes: undo restores day and reminder in one patch');
select is(tests.reminder('e_lasagne'), tests.r(tests.d(6), 1, '18:00', 'Fleisch auftauen'),
  'AC-023 meal_plan_entries: … the reminder is back');
select lives_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object('kind', 'delete', 'table', 'meal_plan_entries',
                                                               'id', tests.fx('e_lasagne')))),
  'AC-024 apply_changes: the entry is removed');
select is(tests.affected(format($$ select 1 from public.deleted_records where table_name = 'meal_plan_entries'
                                   and record_id = %L $$, tests.fx('e_lasagne'))), 1,
  'AC-024 meal_plan_entries: the delete leaves a tombstone, so the reminder disappears on every device');

-- ===================== The per-person switch (REQ-007, AC-027) =====================
select is((select entry_reminders_enabled from public.notification_settings where member_id = tests.fx('enrico')), true,
  'REQ-007 notification_settings: "Erinnerungen an Einträgen" is on at the start');
select lives_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'notification_settings',
    'id', (select id from public.notification_settings where member_id = tests.fx('enrico')),
    'changes', jsonb_build_object('entry_reminders_enabled', false)))),
  'AC-025 apply_changes: Enrico switches the kind off for himself');
select tests.clear_authentication();
insert into fx (key, id) values
  ('enrico_settings', (select id from public.notification_settings where member_id = tests.fx('enrico')));
select tests.authenticate_as(tests.fx('nadja'));
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'notification_settings',
    'id', tests.fx('enrico_settings'), 'changes', jsonb_build_object('entry_reminders_enabled', true)))),
  'P0002', 'row_not_found', 'AC-027 apply_changes: Nadja cannot switch Enrico''s kind');
select tests.clear_authentication();
select is((select entry_reminders_enabled from public.notification_settings where id = tests.fx('enrico_settings')), false,
  'AC-027 notification_settings: Enrico''s setting stays as he set it');

-- ===================== Sync, scheduler index, log kind =====================
select tests.authenticate_as(tests.fx('nadja'));
select is(
  (select e -> 'reminder_at'
   from jsonb_array_elements(public.sync_pull(jsonb_build_object('households',
          jsonb_build_object(tests.fx('home'), '{"full": true}'::jsonb))) -> 'households' -> tests.fx('home')::text
          -> 'rows' -> 'meal_plan_entries') e
   where e ->> 'id' = tests.fx('e_new')::text),
  '"09:00:00"'::jsonb, 'REQ-002 sync_pull: the reminder reaches the devices of the household');
select tests.clear_authentication();
select has_index('public', 'meal_plan_entries', 'meal_plan_entries_reminder_send_day_idx',
  'Decision 2 meal_plan_entries: the scheduler finds reminders by household and send day');
select lives_ok(
  format($$ insert into private.notification_deliveries (dedupe_key, profile_id, household_id, kind, due_at)
            values ('entry:x', %L, %L, 'entry_reminder', now()) $$, tests.fx('enrico'), tests.fx('home')),
  'Decision 2 notification_deliveries: the log knows the kind entry_reminder');

select * from finish();
rollback;
