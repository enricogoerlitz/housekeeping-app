-- Spec 0041 — activity kinds, own symbol, "Merken", series and their exceptions. Covers AC-001 to
-- AC-005 and AC-012 on the server, the tenant isolation of the three new tables (AC-004) and the
-- risk table: foreign household, signed out, a series pointing at a foreign activity, invalid
-- rules and symbols, the delta sync (updated_at, tombstones, sync_pull) and "Rückgängig" of a
-- deleted activity with its series.
begin;
\ir _helpers.psql
select plan(113);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
create function tests.ops_sql(p_ops jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx('home_a'), p_ops) $$;
create function tests.series_sql(p_rule jsonb) returns text language sql stable
as $$ select format(
  'insert into public.activity_series (household_id, activity_id, rule, starts_on, slot_id) values (%L, %L, %L, %L, %L)',
  tests.fx('home_a'), tests.fx('bouldern'), p_rule, '2026-12-01', tests.fx('slot')) $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values
  ('slot'), ('slot_b'), ('bouldern'), ('kino_b'), ('wellness'), ('series'), ('series_b'), ('exception'),
  ('k_row'), ('s_row'), ('x_row'), ('new_series');

update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('slot'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('home_a');
update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('slot_b'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('home_b');
insert into fx (key, id)
select 'kultur', k.id from public.activity_kinds k where k.household_id = tests.fx('home_a') and k.name = 'Kultur';
insert into fx (key, id)
select 'sport', k.id from public.activity_kinds k where k.household_id = tests.fx('home_a') and k.name = 'Sport';
insert into public.activities (id, household_id, name, name_key, kind_id) values
  (tests.fx('bouldern'), tests.fx('home_a'), 'Bouldern', 'bouldern', tests.fx('kultur')),
  (tests.fx('kino_b'), tests.fx('home_b'), 'Kino', 'kino', null);

-- ===================== Default kinds (REQ-001) =====================
select is(
  (select array_agg(k.name || ':' || k.icon order by k.name) from public.activity_kinds k
   where k.household_id = tests.fx('home_b')),
  array['Ausflug:map', 'Essen gehen:utensils', 'Geburtstag:cake', 'Kultur:drama', 'Reise:plane',
        'Sonstiges:sparkles', 'Sport:dumbbell', 'Treffen:users'],
  'REQ-001: a new household has the eight default kinds with their symbols');
select lives_ok($$ select private.seed_activity_kinds(tests.fx('home_a')) $$,
  'REQ-001: seeding the defaults again changes nothing (the migration backfill)');
select is((select count(*)::int from public.activity_kinds where household_id = tests.fx('home_a')), 8,
  'REQ-001: seeding twice keeps one kind per name');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  (select count(*)::int from public.activity_kinds k
   where k.household_id = tests.fx('home_a')), 8,
  'REQ-001: a member reads the kinds of her household');
select is((select remembered from public.activities where id = tests.fx('bouldern')), true,
  'REQ-004: an activity is remembered by default');

-- ===================== Tenant isolation of the new tables (AC-004) =====================
select tests.clear_authentication();
select tests.tenant_isolation('activity_kinds',
  jsonb_build_object('id', tests.fx('k_row'), 'household_id', tests.fx('home_a'), 'name', 'Wellness',
                     'name_key', 'wellness', 'icon', 'bath'),
  '{"name": "Sauna", "name_key": "sauna", "icon": "waves"}',
  tests.fx('enrico'), tests.fx('ben'));
select tests.clear_authentication();
select tests.tenant_isolation('activity_series',
  jsonb_build_object('id', tests.fx('s_row'), 'household_id', tests.fx('home_a'), 'activity_id', tests.fx('bouldern'),
                     'rule', '{"type": "weekly", "every": 1, "weekdays": [2]}'::jsonb, 'starts_on', '2026-12-01',
                     'slot_id', tests.fx('slot'), 'starts_at', '18:00', 'eater_ids', array[tests.fx('enrico')],
                     'guests', 2),
  '{"starts_at": "19:00", "ends_on": "2027-03-31"}',
  tests.fx('enrico'), tests.fx('ben'));
select tests.clear_authentication();
insert into public.activity_series (id, household_id, activity_id, rule, starts_on, slot_id, starts_at) values
  (tests.fx('series'), tests.fx('home_a'), tests.fx('bouldern'), '{"type": "weekly", "every": 1, "weekdays": [2]}',
   '2026-12-01', tests.fx('slot'), '18:00');
select tests.tenant_isolation('activity_series_exceptions',
  jsonb_build_object('id', tests.fx('x_row'), 'household_id', tests.fx('home_a'), 'series_id', tests.fx('series'),
                     'on_date', '2026-12-08'),
  '{"moved_to": "2026-12-09", "starts_at": "19:00"}',
  tests.fx('enrico'), tests.fx('ben'));

-- ===================== Kinds and symbols (AC-001, AC-002, AC-005) =====================
select tests.authenticate_as(tests.fx('nadja'));
select lives_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'activity_kinds',
  'row', jsonb_build_object('id', tests.fx('wellness'), 'name', 'Wellness', 'name_key', 'wellness', 'icon', 'bath')))),
  'AC-002 apply_changes: a member creates the kind "Wellness" with a symbol');
select tests.authenticate_as(tests.fx('enrico'));
select is((select icon from public.activity_kinds where id = tests.fx('wellness')), 'bath',
  'AC-002: the new kind belongs to the whole household');
select throws_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'activity_kinds',
  'row', jsonb_build_object('name', 'wellness', 'name_key', 'wellness', 'icon', 'bath')))), '23505', null,
  'AC-002: the same name twice is refused');
select throws_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'activity_kinds',
  'row', jsonb_build_object('name', 'Yoga', 'name_key', 'yoga', 'icon', 'skull')))), '23514', null,
  'Entscheidung 5: a symbol outside the fixed list is refused for a kind');
select throws_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'activity_kinds',
  'row', jsonb_build_object('name', E'Yo\nga', 'name_key', 'yoga', 'icon', 'heart')))), '23514', null,
  'REQ-001: a kind name with a control character is refused');
select lives_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'activities',
  'id', tests.fx('bouldern'), 'changes', jsonb_build_object('kind_id', tests.fx('sport'), 'icon', 'mountain')))),
  'AC-001, AC-005 apply_changes: kind and own symbol of an activity are patched');
select throws_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'activities',
  'id', tests.fx('bouldern'), 'changes', '{"icon": "javascript"}'::jsonb))), '23514', null,
  'Entscheidung 5: an own symbol outside the fixed list is refused');
select lives_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'activities',
  'id', tests.fx('bouldern'), 'changes', '{"remembered": false}'::jsonb))),
  'AC-012 apply_changes: "Merken" is switched off');
select is((select remembered from public.activities where id = tests.fx('bouldern')), false,
  'AC-012: the activity is no longer remembered');
select tests.clear_authentication();
select throws_ok(
  format('update public.activities set kind_id = %L where id = %L',
         (select id from public.activity_kinds where household_id = tests.fx('home_b') limit 1), tests.fx('bouldern')),
  '23503', null,
  'AC-004: an activity cannot get a kind of another household');

-- AC-003: deleting a kind keeps its activities, without a kind, and the change reaches the devices.
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'activities',
  'id', tests.fx('bouldern'), 'changes', jsonb_build_object('kind_id', tests.fx('kultur'))))),
  'AC-003: Bouldern gets the kind Kultur');
select tests.clear_authentication();
alter table public.activities disable trigger activities_set_timestamps;
update public.activities set updated_at = now() - interval '1 day' where id = tests.fx('bouldern');
alter table public.activities enable trigger activities_set_timestamps;
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'delete', 'table', 'activity_kinds',
  'id', tests.fx('kultur')))),
  'AC-003 apply_changes: a member deletes the kind Kultur');
select is((select kind_id from public.activities where id = tests.fx('bouldern')), null,
  'AC-003: its activity stays, without a kind');
select ok((select updated_at > now() - interval '1 minute' from public.activities where id = tests.fx('bouldern')),
  'AC-003: clearing the kind bumps the activity''s updated_at (the delta sync sees it)');
select is((select count(*)::int from public.deleted_records
           where table_name = 'activity_kinds' and record_id = tests.fx('kultur')::text), 1,
  'AC-003: the deleted kind leaves a tombstone members read');

-- ===================== Series (REQ-003) =====================
select tests.clear_authentication();
select throws_ok(tests.series_sql('{"type": "weekly", "every": 0, "weekdays": [2]}'), '23514', null,
  'REQ-003: a weekly rule needs every ≥ 1');
select throws_ok(tests.series_sql('{"type": "weekly", "every": 1, "weekdays": []}'), '23514', null,
  'REQ-003: a weekly rule needs a weekday');
select throws_ok(tests.series_sql('{"type": "weekly", "every": 1, "weekdays": [2, 2]}'), '23514', null,
  'REQ-003: a weekday counts once');
select throws_ok(tests.series_sql('{"type": "weekly", "every": 1, "weekdays": [8]}'), '23514', null,
  'REQ-003: weekdays are 1 to 7');
select throws_ok(tests.series_sql('{"type": "monthly", "day": 32}'), '23514', null,
  'REQ-003: a monthly day is 1 to 31');
select throws_ok(tests.series_sql('{"type": "yearly", "x": 1}'), '23514', null,
  'REQ-003: a rule has no other keys');
select throws_ok(tests.series_sql('{"type": "daily"}'), '23514', null,
  'REQ-003: an unknown rhythm is refused');
select throws_ok(tests.series_sql('"weekly"'), '23514', null,
  'REQ-003: a rule is an object');
select lives_ok(tests.series_sql('{"type": "yearly"}'), 'AC-006: a yearly rule is stored');
select lives_ok(tests.series_sql('{"type": "monthly", "day": 31}'), 'REQ-003: a monthly rule is stored');
select lives_ok(tests.series_sql('{"type": "weekly", "every": 2, "weekdays": [1, 4]}'),
  'REQ-003: "alle 2 Wochen" on two weekdays is stored');
select throws_ok(
  format('update public.activity_series set ends_on = %L where id = %L', '2026-11-30', tests.fx('series')),
  '23514', null, 'REQ-003: the end is not before the start');
select throws_ok(
  format('update public.activity_series set slot_id = %L where id = %L', tests.fx('slot_b'), tests.fx('series')),
  '23503', 'invalid_slot', 'REQ-003: the Tageszeit is one of the household''s');
select throws_ok(
  format('update public.activity_series set eater_ids = array[%L]::uuid[] where id = %L', tests.fx('ben'), tests.fx('series')),
  '23503', 'invalid_member', 'AC-014: only members of the household can be "dabei"');
select throws_ok(
  format('update public.activity_series set starts_at = %L where id = %L', '18:03', tests.fx('series')),
  '23514', null, 'REQ-003: the Uhrzeit is in five-minute steps');

-- Risk: a series pointing at a foreign activity.
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format('insert into public.activity_series (household_id, activity_id, rule, starts_on, slot_id) values (%L, %L, %L, %L, %L)',
         tests.fx('home_b'), tests.fx('bouldern'), '{"type": "yearly"}', '2027-03-14', tests.fx('slot_b')),
  '23503', null, 'Risiko: a series of household B cannot point at an activity of household A');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format('insert into public.activity_series (household_id, activity_id, rule, starts_on, slot_id) values (%L, %L, %L, %L, %L)',
         tests.fx('home_a'), tests.fx('kino_b'), '{"type": "yearly"}', '2027-03-14', tests.fx('slot')),
  '23503', null, 'Risiko: a series of household A cannot point at an activity of household B');
select throws_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'activity_series',
  'id', tests.fx('series'), 'changes', jsonb_build_object('activity_id', tests.fx('kino_b'))))), '22023', 'invalid_change',
  'Risiko apply_changes: a series keeps its activity');
select throws_ok(
  format('update public.activity_series set activity_id = %L where id = %L', tests.fx('kino_b'), tests.fx('series')),
  '42501', null, 'Risiko PostgREST: a series keeps its activity');

-- AC-009: "Serie bearbeiten" as one apply_changes call: end yesterday, start a new series today,
-- move the future exceptions.
select lives_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'activity_series_exceptions',
  'row', jsonb_build_object('id', tests.fx('exception'), 'series_id', tests.fx('series'), 'on_date', '2026-12-15')))),
  'AC-008 apply_changes: a member cancels one occurrence');
select throws_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'activity_series_exceptions',
  'row', jsonb_build_object('series_id', tests.fx('series'), 'on_date', '2026-12-15', 'moved_to', '2026-12-16')))),
  '23505', null, 'AC-008: one exception per occurrence');
select throws_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'activity_series_exceptions',
  'row', jsonb_build_object('series_id', tests.fx('series'), 'on_date', '2026-12-22', 'starts_at', '19:00')))),
  '23514', null, 'AC-008: a cancelled occurrence has no time of its own');
select throws_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'activity_series_exceptions',
  'row', jsonb_build_object('series_id', tests.fx('series'), 'on_date', '2026-12-22', 'moved_to', '2026-12-23',
                            'slot_id', tests.fx('slot_b'))))),
  '23503', 'invalid_slot', 'AC-008: a moved occurrence keeps to the household''s Tageszeiten');
select lives_ok(tests.ops_sql(jsonb_build_array(
  jsonb_build_object('kind', 'patch', 'table', 'activity_series', 'id', tests.fx('series'),
                     'changes', '{"ends_on": "2026-12-09"}'::jsonb),
  jsonb_build_object('kind', 'insert', 'table', 'activity_series', 'row', jsonb_build_object(
    'id', tests.fx('new_series'), 'activity_id', tests.fx('bouldern'),
    'rule', '{"type": "weekly", "every": 1, "weekdays": [2]}'::jsonb, 'starts_on', '2026-12-10',
    'slot_id', tests.fx('slot'), 'starts_at', '19:00')),
  jsonb_build_object('kind', 'patch', 'table', 'activity_series_exceptions', 'id', tests.fx('exception'),
                     'changes', jsonb_build_object('series_id', tests.fx('new_series'))))),
  'AC-009 apply_changes: ending the series, starting the new one and moving its exception is one call');
select is(
  (select array_agg(s.starts_on || ' ' || coalesce(s.ends_on::text, '-') || ' ' || s.starts_at order by s.starts_on)
   from public.activity_series s where s.id in (tests.fx('series'), tests.fx('new_series'))),
  array['2026-12-01 2026-12-09 18:00:00', '2026-12-10 - 19:00:00'],
  'AC-009: the past keeps 18:00, the future has 19:00');
select is((select series_id from public.activity_series_exceptions where id = tests.fx('exception')), tests.fx('new_series'),
  'AC-009: the future exception belongs to the new series');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_b'), jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'activity_series_exceptions', 'id', tests.fx('exception'),
    'changes', jsonb_build_object('series_id', tests.fx('series_b'))))),
  'P0002', 'row_not_found', 'AC-004: a member of another household cannot touch the exception');

-- ===================== Delta sync =====================
select tests.clear_authentication();
alter table public.activity_series disable trigger activity_series_set_timestamps;
update public.activity_series set updated_at = now() - interval '1 day' where id = tests.fx('new_series');
alter table public.activity_series enable trigger activity_series_set_timestamps;
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'activity_series',
  'id', tests.fx('new_series'), 'changes', jsonb_build_object('eater_ids', array[tests.fx('enrico')], 'guests', 2)))),
  'AC-014 apply_changes: Enrico and 2 guests are "dabei"');
select ok((select updated_at > now() - interval '1 minute' from public.activity_series where id = tests.fx('new_series')),
  'Sync: an update bumps updated_at of the series');
select ok(
  (select (public.sync_pull(jsonb_build_object('households', jsonb_build_object(tests.fx('home_a'), '{"full": true}'::jsonb)))
           -> 'households' -> tests.fx('home_a')::text -> 'rows') ?& array['activity_kinds', 'activity_series',
                                                                           'activity_series_exceptions']),
  'Sync: sync_pull sends the three new tables');
select is(
  (select jsonb_array_length(public.sync_pull(jsonb_build_object('households',
     jsonb_build_object(tests.fx('home_a'), '{"full": true}'::jsonb))) -> 'households' -> tests.fx('home_a')::text
     -> 'rows' -> 'activity_kinds')),
  8, 'Sync: a full pull brings the kinds of the household');
select tests.authenticate_as(tests.fx('ben'));
select is(
  (select jsonb_array_length(public.sync_pull(jsonb_build_object('households',
     jsonb_build_object(tests.fx('home_b'), '{"full": true}'::jsonb))) -> 'households' -> tests.fx('home_b')::text
     -> 'rows' -> 'activity_series')),
  0, 'AC-004 Sync: another household pulls none of our series');
select tests.authenticate_as_anon();
select throws_ok($$ select count(*) from public.activity_kinds $$, '42501', null,
  'AC-004: signed out, the kinds are not readable');
select throws_ok($$ select count(*) from public.activity_series $$, '42501', null,
  'AC-004: signed out, the series are not readable');

-- ===================== delete_activity / restore_activity with the series =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'activities',
  'id', tests.fx('bouldern'), 'changes', jsonb_build_object('kind_id', tests.fx('sport'), 'icon', 'mountain',
                                                            'remembered', false)))),
  'REQ-002: Bouldern gets kind, symbol and "Merken" back before the deletion');
select lives_ok(format('select public.delete_activity(%L, current_date)', tests.fx('bouldern')),
  'Löschen: Bouldern is deleted with its series');
select is((select count(*)::int from public.activity_series where activity_id = tests.fx('bouldern')), 0,
  'Löschen: the series go with the activity');
select is((select count(*)::int from public.deleted_records
           where table_name in ('activity_series', 'activity_series_exceptions')
             and record_id in (tests.fx('series')::text, tests.fx('new_series')::text, tests.fx('exception')::text)), 3,
  'Löschen: series and exception leave tombstones');
select is((select count(*)::int from public.activity_series_exceptions where id = tests.fx('exception')), 0,
  'Löschen: the exceptions go with their series');
select tests.authenticate_as(tests.fx('nadja'));
select throws_ok(format('select public.restore_activity(%L)', tests.fx('bouldern')), 'P0002', 'activity_not_restorable',
  'Rückgängig: only the person who deleted restores');
select tests.authenticate_as(tests.fx('enrico'));
select is((select public.restore_activity(tests.fx('bouldern'))), true, 'Rückgängig: Bouldern comes back');
select is(
  (select kind_id::text || ' ' || icon || ' ' || remembered from public.activities where id = tests.fx('bouldern')),
  tests.fx('sport')::text || ' mountain false',
  'Rückgängig: kind, own symbol and "Merken" come back');
select is((select count(*)::int from public.activity_series where activity_id = tests.fx('bouldern')), 5,
  'Rückgängig: the series come back');
select is((select eater_ids from public.activity_series where id = tests.fx('new_series')), array[tests.fx('enrico')],
  'Rückgängig: the people of a series come back');
select is((select series_id from public.activity_series_exceptions where id = tests.fx('exception')), tests.fx('new_series'),
  'Rückgängig: the exception comes back with its series');

-- A deleted kind meanwhile: the activity comes back without it.
select lives_ok(format('select public.delete_activity(%L, current_date)', tests.fx('bouldern')),
  'Löschen: Bouldern is deleted again');
select tests.clear_authentication();
delete from public.activity_kinds where id = tests.fx('sport');
select tests.authenticate_as(tests.fx('enrico'));
select is((select public.restore_activity(tests.fx('bouldern'))), true, 'Rückgängig: Bouldern comes back again');
select is((select kind_id from public.activities where id = tests.fx('bouldern')), null,
  'Rückgängig: a kind deleted meanwhile is not put back');

select * from finish();
rollback;
