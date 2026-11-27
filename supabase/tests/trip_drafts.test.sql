-- Spec 0030, REQ-004: a trip can be a draft ("Entwurf", trips.draft). A draft is shown but has no
-- effect: nobody on it is silent and chores do not wait for it (AC-013, AC-015). Negative tests of
-- the risk table: foreign household, signed out, invalid value (AC-017).
begin;
\ir _helpers.psql
select plan(11);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

create function tests.ops_sql(p_household text, p_op jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx(p_household), jsonb_build_array(p_op)) $$;
grant execute on function tests.ops_sql(text, jsonb) to anon, authenticated;

create function tests.patch_trip(p_household text, p_changes jsonb) returns text language sql stable
as $$
  select tests.ops_sql(p_household, jsonb_build_object('kind', 'patch', 'table', 'trips',
                                                       'id', tests.fx('mallorca'), 'changes', p_changes))
$$;
grant execute on function tests.patch_trip(text, jsonb) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('other', tests.create_household('B', array[tests.fx('ben')]));
insert into fx (key) values ('mallorca'), ('bad');

select col_default_is('public', 'trips', 'draft', 'false', 'REQ-004: a trip is confirmed unless marked as draft');

-- ===================== AC-012: a member saves a draft =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  tests.ops_sql('home', jsonb_build_object('kind', 'insert', 'table', 'trips', 'row',
    jsonb_build_object('id', tests.fx('mallorca'), 'household_id', tests.fx('home'),
                       'from_on', '2026-12-12', 'to_on', '2026-12-19', 'note', 'Mallorca', 'draft', true))),
  'AC-012: a member saves "Mallorca" as a draft');
select lives_ok(
  tests.ops_sql('home', jsonb_build_object('kind', 'insert', 'table', 'trip_members', 'row',
    jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home'),
                       'trip_id', tests.fx('mallorca'), 'member_id', tests.fx('nadja')))),
  'AC-012: … with Nadja on it');
select is((select draft from public.trips where id = tests.fx('mallorca')), true, 'AC-012: … and it is stored as a draft');
select tests.clear_authentication();

-- ===================== AC-013: a draft has no effect =====================
select is(private.is_silent(tests.fx('home'), tests.fx('nadja'), '2026-12-14'), false,
  'AC-013: Nadja''s notifications still come during her draft');

-- ===================== AC-014: confirming the draft makes it count =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.patch_trip('home', '{"draft": false}'), 'AC-014: a member confirms the trip');
select tests.clear_authentication();
select is(private.is_silent(tests.fx('home'), tests.fx('nadja'), '2026-12-14'), true,
  'AC-014: now Nadja is quiet during the trip');

-- ===================== AC-015: back to draft =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.patch_trip('home', '{"draft": true}'), 'AC-015: a member turns the trip back into a draft');
select throws_ok(tests.patch_trip('home', '{"draft": "ja"}'), '22P02', null, 'REQ-004: an invalid value is rejected');
select tests.clear_authentication();

-- ===================== AC-017: foreign household and signed out =====================
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.patch_trip('home', '{"draft": false}'), '42501', 'not_member',
  'AC-017: a member of another household cannot confirm our trip');

select tests.authenticate_as_anon();
select throws_ok(tests.patch_trip('home', '{"draft": false}'), '42501', null,
  'AC-017: a signed-out caller cannot change draft');

select * from finish();
rollback;
