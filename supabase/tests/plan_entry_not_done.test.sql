-- Spec 0020, REQ-008: "Nicht gemacht" is meal_plan_entries.not_done (formerly not_cooked) and can
-- be set and taken back through apply_changes (AC-036, AC-037). Negative tests of the risk table:
-- foreign household, signed out, invalid value, the old name, a deleted entry (AC-039).
begin;
\ir _helpers.psql
select plan(10);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

create function tests.patch_sql(p_household text, p_entry text, p_changes jsonb) returns text language sql stable
as $$
  select format('select public.apply_changes(%L, %L)', tests.fx(p_household),
                jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'meal_plan_entries',
                                                     'id', tests.fx(p_entry), 'changes', p_changes)))
$$;
grant execute on function tests.patch_sql(text, text, jsonb) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico')])),
  ('other', tests.create_household('B', array[tests.fx('ben')]));
insert into fx (key) values ('slot'), ('eislaufen'), ('gone');

update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('slot'), 'name', 'Vormittag', 'sort', 0))
where id = tests.fx('home');
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, text) values
  (tests.fx('eislaufen'), tests.fx('home'), '2026-11-22', tests.fx('slot'), 'text', 'Eislaufen');

select hasnt_column('public', 'meal_plan_entries', 'not_cooked', 'REQ-008: the old column not_cooked is gone');
select col_default_is('public', 'meal_plan_entries', 'not_done', 'false', 'REQ-008: not_done defaults to false');

select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.patch_sql('home', 'eislaufen', '{"not_done": true}'),
  'AC-036: a member marks "Eislaufen" as not done');
select is((select not_done from public.meal_plan_entries where id = tests.fx('eislaufen')), true,
  'AC-036: … and it is stored');
select lives_ok(tests.patch_sql('home', 'eislaufen', '{"not_done": false}'),
  'AC-036/AC-037: "Rückgängig" and the switch take it back');
select throws_ok(tests.patch_sql('home', 'eislaufen', '{"not_done": "ja"}'),
  '22P02', null, 'REQ-008: an invalid value is rejected');
select throws_ok(tests.patch_sql('home', 'eislaufen', '{"not_cooked": true}'),
  '22023', 'invalid_change', 'REQ-008: the old name not_cooked is not writable');
select throws_ok(tests.patch_sql('home', 'gone', '{"not_done": true}'),
  'P0002', 'row_not_found', 'AC-039: marking an entry deleted meanwhile is refused');

select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.patch_sql('home', 'eislaufen', '{"not_done": true}'),
  '42501', 'not_member', 'REQ-008: a member of another household cannot mark the entry');

select tests.authenticate_as_anon();
select throws_ok(tests.patch_sql('home', 'eislaufen', '{"not_done": true}'),
  '42501', null, 'REQ-008: a signed-out caller cannot mark the entry');

select * from finish();
rollback;
