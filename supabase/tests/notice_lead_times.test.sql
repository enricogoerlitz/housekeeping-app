-- Spec 0059 "Nichts verpassen" — "Erinnern" at a series (activity_series.reminder_*, REQ-003) and
-- "Vorwarnung" at a chore (chores.notice_days_before, REQ-004). Covers AC-016, AC-017, AC-024 and
-- the risk table: the checks, writing through apply_changes and directly, another household,
-- signed out and "Rückgängig" of a deleted activity keeping the
-- reminder of its series.
begin;
\ir _helpers.psql
select plan(30);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
create function tests.patch_sql(p_household text, p_table text, p_id text, p_changes jsonb) returns text
language sql stable
as $$
  select format('select public.apply_changes(%L, %L)', tests.fx(p_household),
                jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', p_table, 'id', tests.fx(p_id),
                                                     'changes', p_changes)))
$$;
create function tests.series_reminder(p_series text) returns text language sql stable
as $$
  select concat_ws(' ', s.reminder_day_offset, s.reminder_at, s.reminder_text)
  from public.activity_series s where s.id = tests.fx(p_series)
$$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values ('slot'), ('mama'), ('birthday'), ('new_series'), ('vertrag'), ('new_chore');

update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('slot'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('home');
insert into public.activities (id, household_id, name, name_key)
values (tests.fx('mama'), tests.fx('home'), 'Geburtstag Mama', 'geburtstag mama');
insert into public.activity_series (id, household_id, activity_id, rule, starts_on, slot_id)
values (tests.fx('birthday'), tests.fx('home'), tests.fx('mama'), '{"type": "yearly"}', '2020-12-03', tests.fx('slot'));
insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on)
values (tests.fx('vertrag'), tests.fx('home'), 'Handyvertrag kündigen', '{"type": "once"}', '{"type": "anyone"}',
        '2026-12-15');

-- ===================== The columns =====================
select has_column('public', 'activity_series', 'reminder_day_offset', 'REQ-003: a series has a Vorlauf');
select has_column('public', 'activity_series', 'reminder_at', 'REQ-003: a series has a reminder time');
select has_column('public', 'activity_series', 'reminder_text', 'REQ-003: a series has a reminder text');
select has_column('public', 'chores', 'notice_days_before', 'REQ-004: a chore has a Vorwarnung');
select is(tests.series_reminder('birthday'), '', 'REQ-003: a series has no reminder by default');

-- ===================== Writing through apply_changes (AC-015, AC-018) =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.patch_sql('home', 'activity_series', 'birthday',
  '{"reminder_day_offset": 7, "reminder_at": "18:00", "reminder_text": "Geschenk besorgen"}'),
  'AC-015: Enrico sets "1 Woche vorher, 18:00, Geschenk besorgen" at the series');
select is(tests.series_reminder('birthday'), '7 18:00:00 Geschenk besorgen',
  'AC-015: the series carries the reminder');
select lives_ok(format($$ select public.apply_changes(%L, %L) $$, tests.fx('home'), jsonb_build_array(
  jsonb_build_object('kind', 'insert', 'table', 'activity_series', 'row', jsonb_build_object(
    'id', tests.fx('new_series'), 'activity_id', tests.fx('mama'), 'rule', '{"type": "yearly"}'::jsonb,
    'starts_on', '2027-12-03', 'slot_id', tests.fx('slot'), 'reminder_day_offset', 0, 'reminder_at', '08:00')))),
  'AC-015: "Serie bearbeiten" starts the next series with its reminder (insert)');
select lives_ok(tests.patch_sql('home', 'chores', 'vertrag', '{"notice_days_before": 30}'),
  'AC-018: Enrico sets the Vorwarnung "1 Monat"');
select lives_ok(format($$ select public.apply_changes(%L, %L) $$, tests.fx('home'), jsonb_build_array(
  jsonb_build_object('kind', 'insert', 'table', 'chores', 'row', jsonb_build_object(
    'id', tests.fx('new_chore'), 'title', 'Kfz-Versicherung', 'recurrence', '{"type": "once"}'::jsonb,
    'assignment', '{"type": "anyone"}'::jsonb, 'next_due_on', '2026-12-31', 'notice_days_before', 14)))),
  'AC-018: a new chore is created with a Vorwarnung');
select tests.authenticate_as(tests.fx('nadja'));
select is((select notice_days_before::int from public.chores where id = tests.fx('vertrag')), 30,
  'AC-018: Nadja reads the Vorwarnung');

-- ===================== The checks (AC-016, AC-017, AC-024) =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.patch_sql('home', 'activity_series', 'birthday', '{"reminder_day_offset": 31}'),
  '23514', null, 'AC-017: a Vorlauf of 31 days is refused');
select throws_ok(tests.patch_sql('home', 'activity_series', 'birthday', '{"reminder_day_offset": -1}'),
  '23514', null, 'AC-017: a negative Vorlauf is refused');
select throws_ok(tests.patch_sql('home', 'activity_series', 'birthday', '{"reminder_day_offset": null}'),
  '23514', null, 'AC-017: a time without a Vorlauf is refused');
select throws_ok(tests.patch_sql('home', 'activity_series', 'birthday', '{"reminder_at": "18:03"}'),
  '23514', null, 'AC-017: a time off the five-minute grid is refused');
select throws_ok(tests.patch_sql('home', 'activity_series', 'birthday', jsonb_build_object('reminder_text', repeat('x', 81))),
  '23514', null, 'AC-016: a text of 81 characters is refused');
select throws_ok(tests.patch_sql('home', 'activity_series', 'birthday', jsonb_build_object('reminder_text', E'a\nb')),
  '23514', null, 'AC-016: a control character is refused');
select throws_ok(tests.patch_sql('home', 'activity_series', 'birthday',
  '{"reminder_day_offset": null, "reminder_at": null}'),
  '23514', null, 'AC-016: a text without a time is refused');
select lives_ok(tests.patch_sql('home', 'activity_series', 'birthday',
  '{"reminder_day_offset": null, "reminder_at": null, "reminder_text": null}'),
  'REQ-003: switching "Erinnern" off clears all three');
select throws_ok(tests.patch_sql('home', 'chores', 'vertrag', '{"notice_days_before": 0}'),
  '23514', null, 'AC-024: a Vorwarnung of 0 days is refused');
select throws_ok(tests.patch_sql('home', 'chores', 'vertrag', '{"notice_days_before": 61}'),
  '23514', null, 'AC-024: a Vorwarnung of 61 days is refused');

-- ===================== Another household, signed out =====================
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.patch_sql('home', 'activity_series', 'birthday', '{"reminder_day_offset": 1, "reminder_at": "18:00"}'),
  '42501', 'not_member', 'Risiken: a member of another household cannot set the reminder of a series');
select is(tests.affected(format('update public.chores set notice_days_before = 3 where id = %L', tests.fx('vertrag'))),
  0, 'Risiken: a direct update from another household changes no chore');
select is((select count(*)::int from public.activity_series where household_id = tests.fx('home')), 0,
  'Risiken: another household sees no series');
select tests.authenticate_as_anon();
select throws_ok(format('update public.activity_series set reminder_day_offset = 1 where id = %L', tests.fx('birthday')),
  '42501', null, 'Risiken: signed out the reminder of a series cannot be changed');
select throws_ok(format('update public.chores set notice_days_before = 3 where id = %L', tests.fx('vertrag')),
  '42501', null, 'Risiken: signed out the Vorwarnung cannot be changed');

-- ===================== Direct writes of members (column grants) =====================
select tests.authenticate_as(tests.fx('nadja'));
select is(tests.affected(format(
  'update public.activity_series set reminder_day_offset = 3, reminder_at = %L where id = %L', '09:00', tests.fx('birthday'))),
  1, 'REQ-003: a member may write the reminder columns directly (grant)');

-- ===================== Rückgängig after "Aktivität löschen" (Decision 11) =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(format('select public.delete_activity(%L, current_date)', tests.fx('mama')),
  'Decision 11: Geburtstag Mama is deleted with its series');
select is((select public.restore_activity(tests.fx('mama'))), true, 'Decision 11: Rückgängig brings it back');
select is(tests.series_reminder('birthday'), '3 09:00:00',
  'Decision 11: the series comes back with its reminder');

select * from finish();
rollback;
