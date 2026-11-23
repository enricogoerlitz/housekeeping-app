-- Spec 0031, REQ-016 — deleting a chore and "Rückgängig" on the server: delete_chore keeps a
-- snapshot of the chore and the ids of its entries in private.deletions (kind chore), the entries
-- stay in the history without the link; restore_chore brings the chore back with its id and
-- created_at and links exactly those entries again, for the person who deleted, within 1 hour.
-- Members cannot set chore_id of an entry any more (no grant, not in the allowlist). Covers
-- AC-040–AC-042 and the risk table: foreign household, anon, an expired snapshot, invalid input.
begin;
\ir _helpers.psql
select plan(26);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;
create function tests.delete_sql(p_key text) returns text language sql stable
as $$ select format('select public.delete_chore(%L)', tests.fx(p_key)) $$;
create function tests.restore_sql(p_key text) returns text language sql stable
as $$ select format('select public.restore_chore(%L)', tests.fx(p_key)) $$;
create function tests.patch_sql(p_event text, p_changes jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(jsonb_build_object(
  'kind', 'patch', 'table', 'chore_events', 'id', tests.fx(p_event), 'changes', p_changes))) $$;
-- The events linked to a chore, by fixture key.
create function tests.linked(p_chore text) returns text[] language sql stable
as $$ select coalesce(array_agg(f.key order by f.key), '{}') from public.chore_events e join fx f on f.id = e.id
      where e.chore_id = tests.fx(p_chore) $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values
  ('kueche'), ('bad'), ('flur_b'), ('ev_k1'), ('ev_k2'), ('ev_k3'), ('ev_bad'), ('ev_orphan'), ('ev_b');

insert into public.chores (id, household_id, title, room, recurrence, assignment, effort, next_due_on,
                           next_assignee_id, due_time) values
  (tests.fx('kueche'), tests.fx('home_a'), 'Küche wischen', 'Küche', '{"type": "weekly", "every": 1, "weekdays": [6]}',
   jsonb_build_object('type', 'rotating', 'memberIds', array[tests.fx('enrico'), tests.fx('nadja')]), 2,
   current_date + 3, tests.fx('nadja'), '19:00'),
  (tests.fx('bad'), tests.fx('home_a'), 'Bad putzen', null, '{"type": "flexible", "everyDays": 7}',
   '{"type": "anyone"}', 1, current_date + 1, null, null),
  (tests.fx('flur_b'), tests.fx('home_b'), 'Flur fegen', null, '{"type": "flexible", "everyDays": 7}',
   '{"type": "anyone"}', 1, current_date + 1, null, null);
insert into public.chore_events (id, household_id, chore_id, title, kind, done_on, done_by) values
  (tests.fx('ev_k1'), tests.fx('home_a'), tests.fx('kueche'), 'Küche wischen', 'done', current_date - 14, tests.fx('enrico')),
  (tests.fx('ev_k2'), tests.fx('home_a'), tests.fx('kueche'), 'Küche wischen', 'skipped', current_date - 7, tests.fx('nadja')),
  (tests.fx('ev_k3'), tests.fx('home_a'), tests.fx('kueche'), 'Küche wischen', 'done', current_date, tests.fx('nadja')),
  (tests.fx('ev_bad'), tests.fx('home_a'), tests.fx('bad'), 'Bad putzen', 'done', current_date - 2, tests.fx('enrico')),
  (tests.fx('ev_orphan'), tests.fx('home_a'), null, 'Fenster putzen', 'done', current_date - 30, tests.fx('enrico')),
  (tests.fx('ev_b'), tests.fx('home_b'), tests.fx('flur_b'), 'Flur fegen', 'done', current_date - 1, tests.fx('ben'));

-- "Küche wischen" was created long ago.
alter table public.chores disable trigger chores_set_timestamps;
update public.chores set created_at = '2026-01-15 09:00+00' where id = tests.fx('kueche');
alter table public.chores enable trigger chores_set_timestamps;

create temp table original on commit drop as
  select to_jsonb(c) - 'updated_at' as doc from public.chores c where c.id = tests.fx('kueche');
grant select on original to authenticated;

-- ===================== AC-042: signed out =====================
select tests.authenticate_as_anon();
select throws_ok(tests.delete_sql('kueche'), '42501', null, 'AC-042 delete_chore: anon cannot call it');
select throws_ok(tests.restore_sql('kueche'), '42501', null, 'AC-042 restore_chore: anon cannot call it');

-- ===================== AC-042: foreign household =====================
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.delete_sql('kueche'), 'P0002', 'chore_not_found',
  'AC-042 delete_chore: a member of another household gets chore_not_found');
select throws_ok(tests.restore_sql('kueche'), 'P0002', 'chore_not_restorable',
  'AC-042 restore_chore: without a snapshot of the caller nothing is restorable');
select throws_ok(format('select public.delete_chore(%L)', gen_random_uuid()), 'P0002', 'chore_not_found',
  'AC-042 delete_chore: a missing chore gives the same answer (existence is not revealed)');
select throws_ok('select public.delete_chore(null)', 'P0002', 'chore_not_found',
  'AC-042 delete_chore: no id is refused like a missing chore');
select tests.clear_authentication();
select is(tests.linked('kueche'), array['ev_k1', 'ev_k2', 'ev_k3'],
  'AC-042: after the refused calls "Küche wischen" still has its three entries');

-- ===================== AC-040: delete =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.delete_sql('kueche'), 'AC-040 delete_chore: Enrico deletes "Küche wischen"');
select is(tests.affected(format('select 1 from public.chores where id = %L', tests.fx('kueche'))), 0,
  'AC-040 delete_chore: the chore is gone');
select results_eq(
  format($$ select title, chore_id from public.chore_events where id in (%L, %L, %L) order by done_on $$,
         tests.fx('ev_k1'), tests.fx('ev_k2'), tests.fx('ev_k3')),
  $$ values ('Küche wischen', null::uuid), ('Küche wischen', null), ('Küche wischen', null) $$,
  'AC-040 delete_chore: its three entries stay in the history with their title, without the link');
select is(tests.linked('bad'), array['ev_bad'], 'AC-040 delete_chore: other chores keep their entries');
select tests.clear_authentication();
select is(
  (select jsonb_build_object('kind', d.kind, 'deleted_by', d.deleted_by,
                             'events', (select jsonb_agg(x order by x) from jsonb_array_elements_text(d.snapshot -> 'event_ids') x))
   from private.deletions d where d.target_id = tests.fx('kueche')),
  jsonb_build_object('kind', 'chore', 'deleted_by', tests.fx('enrico'),
                     'events', (select jsonb_agg(id::text order by id::text) from fx where key in ('ev_k1', 'ev_k2', 'ev_k3'))),
  'AC-040 delete_chore: the snapshot holds the chore and exactly its three entries');
select is((select count(*)::int from public.deleted_records where record_id = tests.fx('kueche')::text), 1,
  'AC-040 delete_chore: the deletion reaches the devices (tombstone)');

-- ===================== AC-041: entries cannot be re-linked by a member =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.patch_sql('ev_orphan', jsonb_build_object('chore_id', tests.fx('bad'))), '22023', 'invalid_change',
  'AC-041 apply_changes: an orphaned entry cannot be given to another chore');
select throws_ok(tests.patch_sql('ev_k1', jsonb_build_object('chore_id', tests.fx('bad'))), '22023', 'invalid_change',
  'AC-041 apply_changes: an entry of the deleted chore cannot be given to another chore');
select throws_ok(
  format('update public.chore_events set chore_id = %L where id = %L', tests.fx('bad'), tests.fx('ev_orphan')),
  '42501', null, 'AC-041 PostgREST: a member cannot update chore_id');
select lives_ok(tests.patch_sql('ev_k1', jsonb_build_object('done_by', tests.fx('nadja'))),
  'REQ-016 apply_changes: "Erledigt von" of an entry is still patched');

-- ===================== Only the person who deleted =====================
select tests.authenticate_as(tests.fx('nadja'));
select throws_ok(tests.restore_sql('kueche'), 'P0002', 'chore_not_restorable',
  'REQ-016 restore_chore: only the person who deleted can undo it');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.restore_sql('kueche'), 'P0002', 'chore_not_restorable',
  'AC-042 restore_chore: a member of another household cannot restore it');

-- ===================== AC-040: "Rückgängig" =====================
select tests.authenticate_as(tests.fx('enrico'));
select is((select public.restore_chore(tests.fx('kueche'))), true, 'AC-040 restore_chore: returns true');
select tests.clear_authentication();
select is((select to_jsonb(c) - 'updated_at' from public.chores c where c.id = tests.fx('kueche')),
  (select doc from original),
  'AC-040 restore_chore: the chore is back with the same id, every field and its created_at');
select is(tests.linked('kueche'), array['ev_k1', 'ev_k2', 'ev_k3'],
  'AC-040 restore_chore: exactly these three entries hang on it again');
select is((select chore_id from public.chore_events where id = tests.fx('ev_orphan')), null,
  'AC-040 restore_chore: an entry that was orphaned before stays orphaned');
select is((select count(*)::int from private.deletions where target_id = tests.fx('kueche')), 0,
  'AC-040 restore_chore: the snapshot is gone');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.restore_sql('kueche'), 'P0002', 'chore_not_restorable',
  'REQ-016 restore_chore: a second call is not restorable');

-- ===================== Expired snapshot =====================
select public.delete_chore(tests.fx('kueche'));
select tests.clear_authentication();
update private.deletions set deleted_at = now() - interval '61 minutes' where target_id = tests.fx('kueche');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.restore_sql('kueche'), 'P0002', 'chore_not_restorable',
  'REQ-016 restore_chore: after one hour "Rückgängig" is gone');

select * from finish();
rollback;
