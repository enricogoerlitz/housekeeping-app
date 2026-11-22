-- Chores (spec 0011, REQ-005 to REQ-010): events are booked only by the domain op complete_chore
-- (a condition on the state the device saw, the state before it recorded on the event) and
-- removed only by remove_chore_event (restores that state for the latest booked event); the
-- recurrence "bei Bedarf" is never due. Negative paths: stale state, invalid input, another
-- household, signed out, direct writes past the domain ops.
begin;
\ir _helpers.psql
select plan(75);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;

create function tests.apply(p_household text, p_ops jsonb) returns jsonb language sql
as $$ select public.apply_changes(tests.fx(p_household), p_ops) $$;
create function tests.apply_sql(p_household text, p_ops jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx(p_household), p_ops) $$;

-- A complete_chore op. Without p_seen the chore's current state and its latest booked event (as
-- the caller reads them) are sent.
create function tests.completion(
  p_chore text, p_event text, p_kind text, p_done_on date, p_done_by text,
  p_next_due_on date, p_next_assignee text, p_seen jsonb default null
) returns jsonb
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
    from public.chores c where c.id = tests.fx(p_chore);
  end if;
  return jsonb_build_object('kind', 'complete_chore', 'completion', jsonb_build_object(
    'chore_id', tests.fx(p_chore), 'event_id', tests.fx(p_event), 'kind', p_kind, 'done_on', p_done_on,
    'done_by', tests.fx(p_done_by), 'seen', coalesce(v_seen, '{}'::jsonb), 'next_due_on', p_next_due_on,
    'next_assignee_id', tests.fx(p_next_assignee)));
end
$$;

-- A complete_chore op whose completion is changed by p_patch (keys set to the given values, or
-- removed when the value is JSON null and p_remove is true).
create function tests.completion_with(p_op jsonb, p_patch jsonb, p_remove text[] default '{}') returns jsonb
language sql
as $$ select jsonb_build_object('kind', 'complete_chore', 'completion', ((p_op -> 'completion') || p_patch) - p_remove) $$;

create function tests.removal(p_event text) returns jsonb language sql
as $$ select jsonb_build_object('kind', 'remove_chore_event', 'id', tests.fx(p_event)) $$;

-- next_due_on, last_done_on and next_assignee_id of a chore (as the caller reads it).
create function tests.state(p_chore text) returns jsonb language sql
as $$
  select jsonb_build_object('next_due_on', c.next_due_on, 'last_done_on', c.last_done_on,
                            'next_assignee_id', c.next_assignee_id)
  from public.chores c where c.id = tests.fx(p_chore)
$$;

create function tests.st(p_next_due_on date, p_last_done_on date, p_next_assignee text) returns jsonb language sql
as $$
  select jsonb_build_object('next_due_on', p_next_due_on, 'last_done_on', p_last_done_on,
                            'next_assignee_id', tests.fx(p_next_assignee))
$$;

-- The error a statement raises: {code, message, detail}, or null when it succeeds.
create function tests.error_of(p_sql text) returns jsonb language plpgsql
as $$
declare
  v_code text;
  v_message text;
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail;
  return jsonb_build_object('code', v_code, 'message', v_message, 'detail', v_detail);
end
$$;

-- An event row without its server columns.
create function tests.event(p_event text) returns jsonb language sql
as $$
  select to_jsonb(e) - array['id', 'household_id', 'created_at', 'updated_at']
  from public.chore_events e where e.id = tests.fx(p_event)
$$;

grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('A', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')]));
insert into fx (key) values
  ('bett'), ('bad'), ('kueche'), ('fenster'), ('glueh'), ('keller'), ('bad_fri'), ('neu'), ('bad_b'),
  ('pflanzen'), ('ev_p1'), ('ev_p_n'), ('ev_p_e'), ('ev_bett1'), ('ev_bett2'), ('ev_bad_n'), ('ev_bad_e'), ('ev_k'), ('ev_keller'), ('ev_glueh'),
  ('ev_f1'), ('ev_f2'), ('ev_old'), ('ev_new'), ('ev_neu'), ('ev_seed'), ('ev_x'), ('zwei');
-- Two bookings of one chore in one call: the first one has the larger id, so only the booking
-- time can make the second one the latest booked.
insert into fx (key, id) values
  ('ev_z1', 'ffffffff-ffff-4fff-bfff-ffffffffffff'), ('ev_z2', '00000000-0000-4000-8000-000000000001');

-- ---------- Fixtures (as postgres); today = current_date (server date) ----------
insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on, next_assignee_id, last_done_on) values
  (tests.fx('bett'), tests.fx('home_a'), 'Bettwäsche wechseln', '{"type": "flexible", "everyDays": 14}',
   jsonb_build_object('type', 'rotating', 'memberIds', array[tests.fx('enrico'), tests.fx('nadja')]),
   current_date + 4, tests.fx('enrico'), current_date - 10),
  (tests.fx('bad'), tests.fx('home_a'), 'Bad putzen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
   jsonb_build_object('type', 'rotating', 'memberIds', array[tests.fx('enrico'), tests.fx('nadja')]),
   current_date, tests.fx('enrico'), current_date - 7),
  (tests.fx('kueche'), tests.fx('home_a'), 'Küche wischen', '{"type": "weekly", "every": 1, "weekdays": [6]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('nadja')), current_date + 1, tests.fx('nadja'), null),
  (tests.fx('fenster'), tests.fx('home_a'), 'Fenster Küche', '{"type": "monthly", "day": 1}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), current_date + 5, tests.fx('enrico'), null),
  (tests.fx('glueh'), tests.fx('home_a'), 'Glühbirne Flur tauschen', '{"type": "once"}', '{"type": "anyone"}',
   null, null, null),
  (tests.fx('keller'), tests.fx('home_a'), 'Keller aufräumen', '{"type": "asNeeded"}', '{"type": "anyone"}',
   null, null, null),
  (tests.fx('bad_fri'), tests.fx('home_a'), 'Bad putzen freitags', '{"type": "weekly", "every": 1, "weekdays": [5]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), current_date, tests.fx('enrico'), current_date - 7),
  (tests.fx('bad_b'), tests.fx('home_b'), 'Bad', '{"type": "flexible", "everyDays": 7}', '{"type": "anyone"}',
   null, null, null),
  (tests.fx('pflanzen'), tests.fx('home_a'), 'Pflanzen gießen', '{"type": "flexible", "everyDays": 3}', '{"type": "anyone"}',
   current_date + 3, null, current_date),
  (tests.fx('zwei'), tests.fx('home_a'), 'Staubsaugen', '{"type": "flexible", "everyDays": 7}', '{"type": "anyone"}',
   current_date, null, null);
insert into public.chore_events (id, household_id, chore_id, title, kind, done_on, done_by) values
  (tests.fx('ev_f1'), tests.fx('home_a'), tests.fx('fenster'), 'Fenster Küche', 'done', current_date - 30, tests.fx('enrico')),
  (tests.fx('ev_f2'), tests.fx('home_a'), tests.fx('fenster'), 'Fenster Küche', 'done', current_date - 60, tests.fx('nadja'));
-- An older event of bad_fri, booked a week ago (timestamps set by hand), with a recorded state
-- that must not come back when it is removed (AC-060, second case).
alter table public.chore_events disable trigger chore_events_set_timestamps;
alter table public.chore_events disable trigger chore_events_stamp_booking;
insert into public.chore_events (id, household_id, chore_id, title, kind, done_on, done_by, prev_next_due_on,
                                 prev_last_done_on, prev_next_assignee_id, prev_recorded, created_at, updated_at)
values (tests.fx('ev_old'), tests.fx('home_a'), tests.fx('bad_fri'), 'Bad putzen freitags', 'done', current_date - 7,
        tests.fx('enrico'), current_date - 7, current_date - 14, tests.fx('enrico'), true,
        now() - interval '7 days', now() - interval '7 days');
-- "Pflanzen gießen" (flexible, anyone) was already done this morning: booking it again today leaves
-- date, last time and person exactly as they are.
insert into public.chore_events (id, household_id, chore_id, title, kind, done_on, done_by, created_at, updated_at)
values (tests.fx('ev_p1'), tests.fx('home_a'), tests.fx('pflanzen'), 'Pflanzen gießen', 'done', current_date,
        tests.fx('enrico'), now() - interval '1 hour', now() - interval '1 hour');
alter table public.chore_events enable trigger chore_events_set_timestamps;
alter table public.chore_events enable trigger chore_events_stamp_booking;

-- ===================== Booking (AC-036, AC-038) =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(
  tests.apply('home_a', jsonb_build_array(
    tests.completion('bett', 'ev_bett1', 'done', current_date, 'nadja', current_date + 14, 'enrico'))),
  jsonb_build_object('applied', 1, 'results', jsonb_build_array(jsonb_build_object('event_id', tests.fx('ev_bett1')))),
  'AC-036 complete_chore: booking returns the event id');
select is(tests.state('bett'), tests.st(current_date + 14, current_date, 'enrico'),
  'AC-036 complete_chore: done sets the next date, last_done_on and the next person');
select is(tests.event('ev_bett1'),
  jsonb_build_object('chore_id', tests.fx('bett'), 'title', 'Bettwäsche wechseln', 'kind', 'done',
                     'done_on', current_date, 'done_by', tests.fx('nadja'), 'prev_next_due_on', current_date + 4,
                     'prev_last_done_on', current_date - 10, 'prev_next_assignee_id', tests.fx('enrico'),
                     'prev_recorded', true),
  'AC-036 complete_chore: the event takes its title from the chore and records the state before it');
select tests.apply('home_a', jsonb_build_array(
  tests.completion('bett', 'ev_bett2', 'done', current_date - 1, 'enrico', current_date + 14, 'nadja')));
select is(tests.state('bett'), tests.st(current_date + 14, current_date, 'nadja'),
  'AC-038 complete_chore: an entry for yesterday does not set last_done_on back');
select is(tests.event('ev_bett2') ->> 'prev_last_done_on', current_date::text,
  'AC-060 complete_chore: the recorded state comes from the locked row, not from the device');

-- ===================== Someone else was faster (AC-031) =====================
select tests.authenticate_as(tests.fx('nadja'));
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('bad', 'ev_bad_n', 'done', current_date, 'nadja', current_date + 7, 'enrico'))),
  'AC-031 complete_chore: Nadja books "Bad putzen"');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  tests.error_of(tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('bad', 'ev_bad_e', 'done', current_date, 'enrico', current_date + 7, 'nadja',
                     tests.st(current_date, current_date - 7, 'enrico'))))) - 'detail',
  '{"code": "P0001", "message": "already_done"}'::jsonb,
  'AC-031 complete_chore: Enrico''s booking with the old state is rejected with already_done');
select is(
  (tests.error_of(tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('bad', 'ev_bad_e', 'done', current_date, 'enrico', current_date + 7, 'nadja',
                     tests.st(current_date, current_date - 7, 'enrico'))))) ->> 'detail')::jsonb,
  jsonb_build_object('done_by', tests.fx('nadja'),
                     'done_at', (select created_at from public.chore_events where id = tests.fx('ev_bad_n'))),
  'AC-031 complete_chore: already_done names who booked it and when');
select is(
  (select count(*)::int from public.chore_events where chore_id = tests.fx('bad') and done_on = current_date), 1,
  'AC-031 complete_chore: there is no second event');
select is(tests.state('bad'), tests.st(current_date + 7, current_date, 'enrico'),
  'AC-031 complete_chore: the next date moved on only once');

-- A flexible chore for anyone looks the same after a second booking on the same day; only the
-- latest booked event the device saw tells the two bookings apart (AC-031).
select tests.authenticate_as(tests.fx('nadja'));
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('pflanzen', 'ev_p_n', 'done', current_date, 'nadja', current_date + 3, null))),
  'AC-031 complete_chore: Nadja books "Pflanzen gießen" again today, having seen this morning''s event');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  tests.error_of(tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('pflanzen', 'ev_p_e', 'done', current_date, 'enrico', current_date + 3, null,
                     tests.st(current_date + 3, current_date, null)
                       || jsonb_build_object('latest_event_id', tests.fx('ev_p1')))))),
  jsonb_build_object('code', 'P0001', 'message', 'already_done', 'detail',
    jsonb_build_object('done_by', tests.fx('nadja'),
                       'done_at', (select created_at from public.chore_events where id = tests.fx('ev_p_n')))::text),
  'AC-031 complete_chore: the same state but a newer event than the one seen is already_done, naming Nadja');
select is(
  (select count(*)::int from public.chore_events where chore_id = tests.fx('pflanzen')), 2,
  'AC-031 complete_chore: … and Enrico''s booking adds no third event');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('pflanzen', 'ev_p_e', 'done', current_date, 'enrico', current_date + 3, null,
                     tests.state('pflanzen') || '{"latest_event_id": 7}'::jsonb))),
  '22023', 'invalid_change', 'complete_chore: a latest_event_id that is not an id is invalid');

-- ===================== The chore changed without an event =====================
select tests.apply('home_a', jsonb_build_array(jsonb_build_object(
  'kind', 'patch', 'table', 'chores', 'id', tests.fx('kueche'), 'changes', jsonb_build_object('next_due_on', current_date + 3))));
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('kueche', 'ev_k', 'done', current_date, 'enrico', current_date + 7, 'nadja',
                     tests.st(current_date + 1, null, 'nadja')))),
  'P0001', 'chore_changed', 'complete_chore: a changed date without an event on that day is chore_changed');
select is(tests.event('ev_k'), null, 'complete_chore: … and nothing is booked');

-- ===================== "Bei Bedarf" (AC-043 to AC-045) =====================
select throws_ok(
  format('update public.chores set next_due_on = current_date where id = %L', tests.fx('keller')),
  '23514', null, 'AC-043 chores: an asNeeded chore never has a due date');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'chores', 'row', jsonb_build_object(
    'title', 'Fenster putzen', 'recurrence', '{"type": "asNeeded"}'::jsonb, 'assignment', '{"type": "anyone"}'::jsonb,
    'next_due_on', current_date)))),
  '23514', null, 'AC-043 apply_changes: an asNeeded chore cannot be created with a due date');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('keller', 'ev_keller', 'done', current_date, 'enrico', current_date + 7, null))),
  '22023', 'invalid_change', 'AC-044 complete_chore: a next date for an asNeeded chore is invalid');
select tests.apply('home_a', jsonb_build_array(
  tests.completion('keller', 'ev_keller', 'done', current_date, 'enrico', null, null)));
select is(tests.state('keller'), tests.st(null, current_date, null),
  'AC-044 complete_chore: done sets last_done_on and leaves an asNeeded chore without a date');
select tests.apply('home_a', jsonb_build_array(jsonb_build_object(
  'kind', 'patch', 'table', 'chores', 'id', tests.fx('fenster'),
  'changes', jsonb_build_object('recurrence', '{"type": "asNeeded"}'::jsonb, 'next_due_on', null))));
select is(
  (select count(*)::int from public.chore_events where chore_id = tests.fx('fenster')), 2,
  'AC-045 chores: switching to asNeeded keeps the chore''s two events');

-- ===================== Kinds =====================
select tests.clear_authentication();
select throws_ok(
  format($$ insert into public.chore_events (household_id, title, kind, done_on) values (%L, 'Keller aufgeräumt', 'spontaneous', current_date) $$,
         tests.fx('home_a')),
  '23514', null, 'spec 0011 chore_events: the kind "spontaneous" no longer exists');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('keller', 'ev_x', 'spontaneous', current_date, 'enrico', null, null))),
  '22023', 'invalid_change', 'spec 0011 complete_chore: only done and skipped can be booked');

-- ===================== A one-off chore =====================
select tests.apply('home_a', jsonb_build_array(
  tests.completion('glueh', 'ev_glueh', 'done', current_date, 'enrico', null, null)));
select is((select count(*)::int from public.chores where id = tests.fx('glueh')), 0,
  'complete_chore: done deletes a one-off chore');
select ok(
  exists (select 1 from public.deleted_records where table_name = 'chores' and record_id = tests.fx('glueh')::text)
  and (select chore_id is null and title = 'Glühbirne Flur tauschen' from public.chore_events where id = tests.fx('ev_glueh')),
  'complete_chore: the one-off chore leaves a tombstone, its event stays with its title');

-- ===================== New chore and event in one call (AC-039) =====================
select tests.apply('home_a', jsonb_build_array(
  jsonb_build_object('kind', 'insert', 'table', 'chores', 'row', jsonb_build_object(
    'id', tests.fx('neu'), 'title', 'Fenster putzen', 'recurrence', '{"type": "asNeeded"}'::jsonb,
    'assignment', '{"type": "anyone"}'::jsonb)),
  tests.completion('neu', 'ev_neu', 'done', current_date, 'enrico', null, null, '{}'::jsonb)));
select ok(
  (select title = 'Fenster putzen' and chore_id = tests.fx('neu') from public.chore_events where id = tests.fx('ev_neu'))
  and tests.state('neu') = tests.st(null, current_date, null),
  'AC-039 apply_changes: a new asNeeded chore and its first event in one call');

-- ===================== Deleting a chore (AC-053, AC-054) =====================
select tests.apply('home_a', jsonb_build_array(jsonb_build_object('kind', 'delete', 'table', 'chores', 'id', tests.fx('bett'))));
select is(
  (select count(*)::int from public.chore_events
   where id in (tests.fx('ev_bett1'), tests.fx('ev_bett2')) and chore_id is null and title = 'Bettwäsche wechseln'), 2,
  'AC-053 chores: deleting a chore keeps its events with their title');
select ok(
  exists (select 1 from public.deleted_records where table_name = 'chores' and record_id = tests.fx('bett')::text),
  'AC-053 chores: the deleted chore leaves a tombstone for all devices');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'chores', 'id', tests.fx('bett'), 'changes', jsonb_build_object('title', 'Bettwäsche')))),
  'P0002', 'row_not_found', 'AC-054 apply_changes: editing a chore deleted in the meantime does not create it again');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('bett', 'ev_x', 'done', current_date, 'enrico', current_date + 14, 'nadja', '{}'::jsonb))),
  'P0002', 'chore_not_found', 'AC-054 complete_chore: booking a chore deleted in the meantime is chore_not_found');

-- "Rückgängig" inserts the chore again and links its events: chore_id may go from null to a
-- chore, never from one chore to another (remove_chore_event would restore the wrong chore).
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'insert', 'table', 'chores', 'row', jsonb_build_object(
      'id', tests.fx('bett'), 'title', 'Bettwäsche wechseln', 'recurrence', '{"type": "flexible", "everyDays": 14}'::jsonb,
      'assignment', '{"type": "anyone"}'::jsonb, 'next_due_on', current_date + 14, 'last_done_on', current_date)),
    jsonb_build_object('kind', 'patch', 'table', 'chore_events', 'id', tests.fx('ev_bett1'),
                       'changes', jsonb_build_object('chore_id', tests.fx('bett'))))),
  'AC-053 apply_changes: "Rückgängig" links an event of a deleted chore to the restored chore');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'chore_events', 'id', tests.fx('ev_bett1'), 'changes', jsonb_build_object('chore_id', tests.fx('bad'))))),
  '22023', 'invalid_change', 'spec 0011 chore_events: an event cannot be moved to another chore of the household');
select throws_ok(
  format('update public.chore_events set chore_id = null where id = %L', tests.fx('ev_bett1')),
  '22023', 'invalid_change', 'spec 0011 chore_events: the link to an existing chore cannot be cleared directly');

-- ===================== "Erledigt von" (AC-059) =====================
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'patch', 'table', 'chore_events', 'id', tests.fx('ev_bad_n'),
                       'changes', jsonb_build_object('done_by', tests.fx('enrico'))),
    jsonb_build_object('kind', 'patch', 'table', 'chores', 'id', tests.fx('bad'),
                       'changes', jsonb_build_object('next_assignee_id', tests.fx('nadja'))))),
  'AC-059 apply_changes: "Erledigt von" and the next person change in one call');
select ok(
  (select done_by = tests.fx('enrico') from public.chore_events where id = tests.fx('ev_bad_n'))
  and tests.state('bad') ->> 'next_assignee_id' = tests.fx('nadja')::text,
  'AC-059 chore_events: the event shows Enrico, Nadja is next');

-- ===================== Removing an event (AC-060) =====================
select tests.apply('home_a', jsonb_build_array(
  tests.completion('bad_fri', 'ev_new', 'done', current_date, 'enrico', current_date + 7, 'enrico')));
select is(
  tests.apply('home_a', jsonb_build_array(tests.removal('ev_old'))),
  '{"applied": 1, "results": [{"restored": false}]}'::jsonb,
  'AC-060 remove_chore_event: removing an older event restores nothing');
select is(tests.state('bad_fri'), tests.st(current_date + 7, current_date, 'enrico'),
  'AC-060 remove_chore_event: … next date and person stay');
select ok(
  tests.event('ev_old') is null
  and exists (select 1 from public.deleted_records where table_name = 'chore_events' and record_id = tests.fx('ev_old')::text),
  'AC-060 remove_chore_event: the event is gone, with a tombstone for all devices');
select is(
  tests.apply('home_a', jsonb_build_array(tests.removal('ev_new'))),
  '{"applied": 1, "results": [{"restored": true}]}'::jsonb,
  'AC-060 remove_chore_event: removing the latest booked event restores the state before it');
select is(tests.state('bad_fri'), tests.st(current_date, current_date - 7, 'enrico'),
  'AC-060 remove_chore_event: "Bad putzen" is due today again, Enrico''s turn');
select is(
  tests.apply('home_a', jsonb_build_array(tests.removal('ev_glueh'))),
  '{"applied": 1, "results": [{"restored": false}]}'::jsonb,
  'Offene Frage 9 remove_chore_event: the event of a deleted chore is only removed');
select tests.clear_authentication();
insert into public.chore_events (id, household_id, chore_id, title, kind, done_on, done_by)
values (tests.fx('ev_seed'), tests.fx('home_a'), tests.fx('kueche'), 'Küche wischen', 'done', current_date, tests.fx('nadja'));
select tests.authenticate_as(tests.fx('enrico'));
select ok(
  tests.apply('home_a', jsonb_build_array(tests.removal('ev_seed'))) -> 'results' = '[{"restored": false}]'::jsonb
  and tests.state('kueche') = tests.st(current_date + 3, null, 'nadja'),
  'AC-060 remove_chore_event: an event without a recorded state is only removed');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(tests.removal('ev_new'))),
  'P0002', 'chore_event_not_found', 'AC-060 remove_chore_event: an event that is already gone is not found');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'chore_events', 'id', tests.fx('ev_new'), 'changes', jsonb_build_object('done_by', tests.fx('nadja'))))),
  'P0002', 'row_not_found', 'spec 0011 conflicts: removing wins against a later change of the event');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'remove_chore_event'))),
  '22023', 'invalid_change', 'remove_chore_event: an op without id is invalid');

-- ===================== Two bookings in one call =====================
-- The second booking sees the first one; it is the latest booked by its booking time, not by id.
select tests.apply('home_a', jsonb_build_array(
  tests.completion('zwei', 'ev_z1', 'done', current_date - 1, 'enrico', current_date + 6, null),
  tests.completion('zwei', 'ev_z2', 'done', current_date, 'nadja', current_date + 7, null,
                   tests.st(current_date + 6, current_date - 1, null) || jsonb_build_object('latest_event_id', tests.fx('ev_z1')))));
select ok(
  (select created_at from public.chore_events where id = tests.fx('ev_z2'))
    > (select created_at from public.chore_events where id = tests.fx('ev_z1')),
  'complete_chore: the second booking in one call is booked later');
select is(
  tests.apply('home_a', jsonb_build_array(tests.removal('ev_z2'))),
  '{"applied": 1, "results": [{"restored": true}]}'::jsonb,
  'AC-060 remove_chore_event: the second booking of one call is the latest booked');
select is(tests.state('zwei'), tests.st(current_date + 6, current_date - 1, null),
  'AC-060 remove_chore_event: … the state after the first booking comes back');

-- ===================== Delete limit =====================
-- Booking a one-off chore deletes it; that is known only under the lock, so every booking counts.
insert into public.chores (household_id, title, recurrence, assignment)
select tests.fx('home_a'), 'Einmalig ' || n, '{"type": "once"}', '{"type": "anyone"}' from generate_series(1, 21) n;
select throws_ok(
  tests.apply_sql('home_a', (
    select jsonb_agg(jsonb_build_object('kind', 'complete_chore', 'completion', jsonb_build_object(
      'chore_id', c.id, 'event_id', gen_random_uuid(), 'kind', 'done', 'done_on', current_date,
      'done_by', tests.fx('enrico'), 'seen', '{}'::jsonb)))
    from public.chores c where c.title like 'Einmalig %')),
  '22023', 'too_many_changes', 'T5 apply_changes: 21 bookings count as 21 deletes and are rejected');
select is((select count(*)::int from public.chores where title like 'Einmalig %'), 21,
  'T5 apply_changes: … no one-off chore is deleted');

-- ===================== Skipping =====================
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('kueche', 'ev_k', 'skipped', current_date - 3, 'nadja', current_date + 4, 'enrico'))),
  'complete_chore: skipped is accepted for three days ago');
select is(tests.state('kueche'), tests.st(current_date + 4, null, 'nadja'),
  'complete_chore: skipped moves only the date (person and last_done_on stay)');

-- ===================== Invalid input =====================
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('kueche', 'ev_x', 'done', current_date - 32, 'nadja', current_date + 7, 'nadja'))),
  '22023', 'invalid_change', 'spec 0026 AC-020 complete_chore: a day before today - 31 is invalid');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('kueche', 'ev_x', 'done', current_date + 2, 'nadja', current_date + 7, 'nadja'))),
  '22023', 'invalid_change', 'Offene Frage 10 complete_chore: a day after today + 1 is invalid');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('kueche', 'ev_x', 'done', current_date, 'nadja', current_date, 'nadja'))),
  '22023', 'invalid_change', 'complete_chore: a next date not after the day is invalid');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('kueche', 'ev_x', 'forgotten', current_date, 'nadja', current_date + 7, 'nadja'))),
  '22023', 'invalid_change', 'complete_chore: an unknown kind is invalid');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(tests.completion_with(
    tests.completion('kueche', 'ev_x', 'done', current_date, 'nadja', current_date + 7, 'nadja'), '{}', array['seen']))),
  '22023', 'invalid_change', 'complete_chore: an op without the seen state is invalid');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(tests.completion_with(
    tests.completion('kueche', 'ev_x', 'done', current_date, 'nadja', current_date + 7, 'nadja'),
    jsonb_build_object('prev_next_due_on', '2020-01-01', 'prev_recorded', true)))),
  '22023', 'invalid_change', 'spec 0011 attack: the device cannot send the state before the event');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(tests.completion_with(
    tests.completion('kueche', 'ev_x', 'done', current_date, 'nadja', current_date + 7, 'nadja'),
    jsonb_build_object('title', 'Etwas anderes')))),
  '22023', 'invalid_change', 'complete_chore: the title cannot be sent (it comes from the chore)');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(tests.completion_with(
    tests.completion('kueche', 'ev_x', 'done', current_date, 'nadja', current_date + 7, 'nadja'), '{}', array['done_by']))),
  '22023', 'invalid_change', 'complete_chore: an op without done_by is invalid');
select throws_ok(
  tests.apply_sql('home_a', '[{"kind": "complete_chore", "completion": "x"}]'),
  '22023', 'invalid_change', 'complete_chore: a completion that is not an object is invalid');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('kueche', 'ev_x', 'done', current_date, 'ben', current_date + 7, 'nadja'))),
  '23503', null, 'complete_chore: done_by outside the household is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('kueche', 'ev_x', 'done', current_date, 'nadja', current_date + 7, 'ben'))),
  '23503', null, 'complete_chore: a next person outside the household is rejected');

-- ===================== Another household, signed out, past the domain ops (AC-055) =====================
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.completion('kueche', 'ev_x', 'done', current_date, 'ben', current_date + 7, null, '{}'::jsonb))),
  '42501', 'not_member', 'AC-055 complete_chore: a member of another household cannot book in it');
select throws_ok(
  tests.apply_sql('home_b', jsonb_build_array(
    tests.completion('kueche', 'ev_x', 'done', current_date, 'ben', current_date + 7, null, '{}'::jsonb))),
  'P0002', 'chore_not_found', 'AC-055 complete_chore: a chore of another household is not found');
select throws_ok(
  tests.apply_sql('home_b', jsonb_build_array(tests.removal('ev_bad_n'))),
  'P0002', 'chore_event_not_found', 'AC-055 remove_chore_event: an event of another household is not found');
select is(
  (select count(*)::int from public.chore_events where household_id = tests.fx('home_a')), 0,
  'AC-055 chore_events: a member of another household reads no events');

select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format('select private.complete_chore(%L, %L)', tests.fx('home_b'),
         tests.completion('bad_b', 'ev_x', 'done', current_date, 'enrico', null, null, '{}'::jsonb) -> 'completion'),
  '42501', 'not_member', 'AC-055 private.complete_chore: called directly, it checks the membership itself');
select throws_ok(
  format('select private.remove_chore_event(%L, %L)', tests.fx('home_b'), tests.fx('ev_bad_n')),
  '42501', 'not_member', 'AC-055 private.remove_chore_event: called directly, it checks the membership itself');
select throws_ok(
  format($$ insert into public.chore_events (household_id, chore_id, title, kind, done_on, done_by)
            values (%L, %L, 'Bad putzen', 'done', current_date, %L) $$, tests.fx('home_a'), tests.fx('bad'), tests.fx('enrico')),
  '42501', null, 'spec 0011 chore_events: a member cannot insert an event directly');
select throws_ok(
  format('delete from public.chore_events where id = %L', tests.fx('ev_bad_n')),
  '42501', null, 'spec 0011 chore_events: a member cannot delete an event directly');
select throws_ok(
  format('update public.chore_events set prev_recorded = true, prev_next_due_on = %L where id = %L', '2020-01-01', tests.fx('ev_bad_n')),
  '42501', null, 'spec 0011 chore_events: a member cannot write the recorded state directly');

select tests.authenticate_as_anon();
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(tests.removal('ev_bad_n'))),
  '42501', null, 'AC-055 apply_changes: anon cannot book or remove');
select throws_ok(
  format('select private.complete_chore(%L, %L)', tests.fx('home_a'), '{}'),
  '42501', null, 'AC-055 private.complete_chore: anon cannot call it');
select throws_ok(
  format('select private.remove_chore_event(%L, %L)', tests.fx('home_a'), tests.fx('ev_bad_n')),
  '42501', null, 'AC-055 private.remove_chore_event: anon cannot call it');

select * from finish();
rollback;
