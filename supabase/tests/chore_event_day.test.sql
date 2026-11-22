-- Moving a history entry to another day (spec 0026, REQ-007): the domain op
-- change_chore_event_day of apply_changes. For the latest booked entry of a chore that still
-- exists, the chore's date and last time follow; otherwise only the day changes. Negative paths:
-- outside the 30-day window (with the server's buffer), a stale state, an entry removed meanwhile,
-- another household, signed out, a direct write of done_on.
begin;
\ir _helpers.psql
select plan(19);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;

create function tests.apply_sql(p_household text, p_ops jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx(p_household), p_ops) $$;

-- A change_chore_event_day op; without p_seen the chore's current state and its latest booked
-- event (as the caller reads them) are sent.
create function tests.day_change(p_event text, p_done_on date, p_next_due_on date, p_seen jsonb default null)
returns jsonb
language plpgsql
as $$
declare
  v_seen jsonb := p_seen;
begin
  if v_seen is null then
    select jsonb_build_object('next_due_on', c.next_due_on, 'last_done_on', c.last_done_on,
                              'next_assignee_id', c.next_assignee_id,
                              'latest_event_id', (select e.id from public.chore_events e where e.chore_id = c.id
                                                  order by e.created_at desc, e.id desc limit 1))
    into v_seen
    from public.chore_events ev join public.chores c on c.id = ev.chore_id
    where ev.id = tests.fx(p_event);
  end if;
  return jsonb_build_object('kind', 'change_chore_event_day', 'change',
    jsonb_strip_nulls(jsonb_build_object('event_id', tests.fx(p_event), 'done_on', p_done_on,
                                         'next_due_on', p_next_due_on, 'seen', v_seen)));
end
$$;

create function tests.chore_state(p_chore text) returns jsonb language sql
as $$
  select jsonb_build_object('next_due_on', c.next_due_on, 'last_done_on', c.last_done_on)
  from public.chores c where c.id = tests.fx(p_chore)
$$;

create function tests.day_of(p_event text) returns date language sql
as $$ select e.done_on from public.chore_events e where e.id = tests.fx(p_event) $$;

grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('A', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')]));
insert into fx (key) values ('bett'), ('ev_old'), ('ev_new'), ('ev_orphan'), ('ev_b'), ('bett_b');

-- "Bettwäsche wechseln" (etwa 14 Tage): booked 16 days ago, then 2 days ago by Nadja.
insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on, last_done_on) values
  (tests.fx('bett'), tests.fx('home_a'), 'Bettwäsche wechseln', '{"type": "flexible", "everyDays": 14}',
   '{"type": "anyone"}', current_date + 12, current_date - 2),
  (tests.fx('bett_b'), tests.fx('home_b'), 'Bettwäsche', '{"type": "flexible", "everyDays": 14}',
   '{"type": "anyone"}', current_date + 12, current_date - 2);
insert into public.chore_events (id, household_id, chore_id, title, kind, done_on, done_by,
                                 prev_next_due_on, prev_last_done_on, prev_recorded) values
  (tests.fx('ev_old'), tests.fx('home_a'), tests.fx('bett'), 'Bettwäsche wechseln', 'done', current_date - 16,
   tests.fx('enrico'), current_date - 16, current_date - 30, true);
insert into public.chore_events (id, household_id, chore_id, title, kind, done_on, done_by,
                                 prev_next_due_on, prev_last_done_on, prev_recorded) values
  (tests.fx('ev_new'), tests.fx('home_a'), tests.fx('bett'), 'Bettwäsche wechseln', 'done', current_date - 2,
   tests.fx('nadja'), current_date - 2, current_date - 16, true),
  (tests.fx('ev_orphan'), tests.fx('home_a'), null, 'Keller aufräumen', 'done', current_date - 3,
   tests.fx('enrico'), null, null, false),
  (tests.fx('ev_b'), tests.fx('home_b'), tests.fx('bett_b'), 'Bettwäsche', 'done', current_date - 2,
   tests.fx('ben'), null, null, false);

select tests.authenticate_as(tests.fx('enrico'));

-- ===================== The latest entry moves the chore (AC-021) =====================
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(tests.day_change('ev_new', current_date - 4, current_date + 10))),
  'AC-021 change_chore_event_day: the latest entry moves to another day');
select is(tests.day_of('ev_new'), current_date - 4, 'AC-021 change_chore_event_day: the entry has the new day');
select is(tests.chore_state('bett'),
  jsonb_build_object('next_due_on', current_date + 10, 'last_done_on', current_date - 4),
  'AC-021 change_chore_event_day: next date as computed, last time from the recorded state and the new day');

-- ===================== An older entry only changes its day (AC-022) =====================
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(tests.day_change('ev_old', current_date - 17, null))),
  'AC-022 change_chore_event_day: an older entry moves');
select is(tests.day_of('ev_old'), current_date - 17, 'AC-022 change_chore_event_day: its day changes');
select is(tests.chore_state('bett'),
  jsonb_build_object('next_due_on', current_date + 10, 'last_done_on', current_date - 4),
  'AC-022 change_chore_event_day: the chore stays as it was');

-- An entry of a deleted chore needs no seen state.
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(tests.day_change('ev_orphan', current_date - 31, null, null))),
  'AC-020 change_chore_event_day: an entry of a deleted chore moves to today - 31 (the server''s buffer)');

-- ===================== Bounds and invalid input (AC-020) =====================
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(tests.day_change('ev_old', current_date - 32, null))),
  '22023', 'invalid_change', 'AC-020 change_chore_event_day: a day before today - 31 is invalid');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(tests.day_change('ev_old', current_date + 2, null))),
  '22023', 'invalid_change', 'AC-020 change_chore_event_day: a day after today + 1 is invalid');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(tests.day_change('ev_new', current_date - 4, current_date - 4))),
  '22023', 'invalid_change', 'change_chore_event_day: a next date not after the day is invalid');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'change_chore_event_day',
    'change', jsonb_build_object('event_id', tests.fx('ev_old'), 'done_on', current_date, 'next_assignee_id', tests.fx('ben'))))),
  '22023', 'invalid_change', 'change_chore_event_day: unknown keys are invalid (the person cannot be sent)');

-- ===================== Stale state and a removed entry (AC-023) =====================
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(tests.day_change('ev_new', current_date - 5, current_date + 9,
    jsonb_build_object('next_due_on', current_date + 12, 'last_done_on', current_date - 2,
                       'next_assignee_id', null, 'latest_event_id', tests.fx('ev_new'))))),
  'P0001', 'chore_changed', 'change_chore_event_day: a state the chore no longer has is rejected');
select tests.authenticate_as(tests.fx('nadja'));
select lives_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'),
         jsonb_build_array(jsonb_build_object('kind', 'remove_chore_event', 'id', tests.fx('ev_old')))),
  'AC-023: Nadja removes the entry');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'change_chore_event_day',
    'change', jsonb_build_object('event_id', tests.fx('ev_old'), 'done_on', current_date - 3)))),
  'P0002', 'chore_event_not_found', 'AC-023 change_chore_event_day: an entry removed meanwhile is not found');

-- ===================== Another household, signed out, past the domain op =====================
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'change_chore_event_day',
    'change', jsonb_build_object('event_id', tests.fx('ev_b'), 'done_on', current_date - 3)))),
  'P0002', 'chore_event_not_found', 'AC-023 change_chore_event_day: an entry of another household is not found');
select throws_ok(
  tests.apply_sql('home_b', jsonb_build_array(jsonb_build_object('kind', 'change_chore_event_day',
    'change', jsonb_build_object('event_id', tests.fx('ev_b'), 'done_on', current_date - 3)))),
  '42501', 'not_member', 'AC-023 change_chore_event_day: a member of another household cannot move in it');
select throws_ok(
  format('select private.change_chore_event_day(%L, %L)', tests.fx('home_b'),
         jsonb_build_object('event_id', tests.fx('ev_b'), 'done_on', current_date - 3)),
  '42501', 'not_member', 'AC-023 private.change_chore_event_day: called directly, it checks the membership itself');
select throws_ok(
  format('update public.chore_events set done_on = %L where id = %L', current_date - 5, tests.fx('ev_new')),
  '42501', null, 'spec 0026 chore_events: done_on cannot be written directly');

select tests.authenticate_as_anon();
select throws_ok(
  format('select private.change_chore_event_day(%L, %L)', tests.fx('home_a'),
         jsonb_build_object('event_id', tests.fx('ev_new'), 'done_on', current_date - 3)),
  '42501', null, 'AC-023 private.change_chore_event_day: anon cannot call it');

select * from finish();
rollback;
