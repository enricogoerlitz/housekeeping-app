-- Spec 0042, REQ-002 — the map link of a store (stores.maps_url): members of the household read it
-- and write it through apply_changes (insert and patch) or directly (column grants); only http(s)
-- links up to 2000 characters; a member of another household and a signed-out caller neither read
-- nor write it. Covers AC-003 (on the server) and AC-004.
begin;
\ir _helpers.psql
select plan(12);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
create function tests.ops_sql(p_household text, p_op jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx(p_household), jsonb_build_array(p_op)) $$;
create function tests.patch_sql(p_household text, p_key text, p_changes jsonb) returns text language sql stable
as $$ select tests.ops_sql(p_household, jsonb_build_object(
  'kind', 'patch', 'table', 'stores', 'id', tests.fx(p_key), 'changes', p_changes)) $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values ('edeka'), ('rewe'), ('aldi_b');
insert into public.stores (id, household_id, name) values
  (tests.fx('edeka'), tests.fx('home_a'), 'Edeka Mitte'),
  (tests.fx('aldi_b'), tests.fx('home_b'), 'Aldi Nord');

-- ===================== a member writes and reads (AC-003) =====================
select tests.authenticate_as(tests.fx('nadja'));
select lives_ok(
  tests.patch_sql('home_a', 'edeka', '{"maps_url": "https://maps.app.goo.gl/abc"}'),
  'AC-003: a member sets the map link of a store through apply_changes');
select lives_ok(
  tests.ops_sql('home_a', jsonb_build_object('kind', 'insert', 'table', 'stores', 'row', jsonb_build_object(
    'id', tests.fx('rewe'), 'household_id', tests.fx('home_a'), 'name', 'Rewe',
    'maps_url', 'https://www.google.com/maps/place/Rewe/@52.5,13.4,17z'))),
  'AC-003: a new store comes with its map link');
select results_eq(
  $$ select name, maps_url from public.stores order by name $$,
  $$ values ('Edeka Mitte', 'https://maps.app.goo.gl/abc'),
            ('Rewe', 'https://www.google.com/maps/place/Rewe/@52.5,13.4,17z') $$,
  'AC-003: members read the map links of their stores');
select is(
  tests.affected(format('update public.stores set maps_url = %L where id = %L',
                        'https://maps.apple.com/?q=Edeka', tests.fx('edeka'))),
  1,
  'AC-003: the column grant lets a member update the link directly too');
select lives_ok(
  tests.patch_sql('home_a', 'edeka', '{"maps_url": null}'),
  'AC-003: a member removes the map link again');

-- ===================== invalid links =====================
select throws_ok(
  tests.patch_sql('home_a', 'edeka', '{"maps_url": "javascript:alert(1)"}'), '23514', null,
  'REQ-002: only http(s) links are stored');
select throws_ok(
  tests.patch_sql('home_a', 'edeka', jsonb_build_object('maps_url', 'https://' || repeat('a', 2000))), '23514', null,
  'REQ-002: a link is at most 2000 characters');

-- ===================== another household and signed out (AC-004) =====================
select tests.clear_authentication();
update public.stores set maps_url = 'https://maps.app.goo.gl/edeka' where id = tests.fx('edeka');
select tests.authenticate_as(tests.fx('ben'));
select is_empty(
  format('select maps_url from public.stores where id = %L', tests.fx('edeka')),
  'AC-004: a member of another household cannot read the map link');
select throws_ok(
  tests.patch_sql('home_b', 'edeka', '{"maps_url": "https://evil.example"}'), 'P0002', 'row_not_found',
  'AC-004: a member of another household cannot change it through apply_changes');
select is(
  tests.affected(format('update public.stores set maps_url = %L where id = %L',
                        'https://evil.example', tests.fx('edeka'))),
  0,
  'AC-004: nor directly');

select tests.authenticate_as_anon();
select throws_ok(
  format('select maps_url from public.stores where id = %L', tests.fx('edeka')), '42501', null,
  'AC-004: signed out cannot read stores');

select tests.clear_authentication();
select is(
  (select maps_url from public.stores where id = tests.fx('edeka')),
  'https://maps.app.goo.gl/edeka',
  'AC-004: the link is unchanged');

select * from finish();
rollback;
