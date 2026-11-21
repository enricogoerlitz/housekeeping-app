-- Areas and stores of a household (spec 0007, T1): unique area names per household (AC-052),
-- merge_areas (AC-054), deleting an area or a store (AC-045, AC-055, AC-056) and the refusals for
-- another household and a signed-out caller (AC-056).
begin;
\ir _helpers.psql
select plan(29);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values
  ('getraenke'), ('kuehlung'), ('drogerie'), ('drogerie_hygiene'), ('tierbedarf'), ('deko'), ('keller'),
  ('rewe'), ('aldi'), ('store_b'), ('katzenfutter');

insert into public.areas (id, household_id, name, sort) values
  (tests.fx('getraenke'), tests.fx('home_a'), 'Getränke', 0),
  (tests.fx('kuehlung'), tests.fx('home_a'), 'Kühlung', 1),
  (tests.fx('drogerie'), tests.fx('home_a'), 'Drogerie', 2),
  (tests.fx('drogerie_hygiene'), tests.fx('home_a'), 'Drogerie & Hygiene', 3),
  (tests.fx('tierbedarf'), tests.fx('home_a'), 'Tierbedarf', 4),
  (tests.fx('deko'), tests.fx('home_a'), 'Deko', 5),
  (tests.fx('keller'), tests.fx('home_b'), 'Keller', 0);
-- 12 articles in Drogerie, 20 in Drogerie & Hygiene, 2 in Tierbedarf.
insert into public.articles (household_id, name, name_key, area_id)
select tests.fx('home_a'), 'Drogerie ' || i, 'drogerie ' || i, tests.fx('drogerie') from generate_series(1, 12) i;
insert into public.articles (household_id, name, name_key, area_id)
select tests.fx('home_a'), 'Hygiene ' || i, 'hygiene ' || i, tests.fx('drogerie_hygiene') from generate_series(1, 20) i;
insert into public.articles (id, household_id, name, name_key, area_id) values
  (tests.fx('katzenfutter'), tests.fx('home_a'), 'Katzenfutter', 'katzenfutter', tests.fx('tierbedarf'));
insert into public.articles (household_id, name, name_key, area_id) values
  (tests.fx('home_a'), 'Katzenstreu', 'katzenstreu', tests.fx('tierbedarf')),
  (tests.fx('home_b'), 'Kartoffeln', 'kartoffeln', tests.fx('keller'));
insert into public.stores (id, household_id, name, area_order, hidden_area_ids) values
  (tests.fx('rewe'), tests.fx('home_a'), 'Rewe Südstadt',
   array[tests.fx('getraenke'), tests.fx('drogerie'), tests.fx('drogerie_hygiene'), tests.fx('tierbedarf')],
   array[tests.fx('drogerie')]),
  (tests.fx('aldi'), tests.fx('home_a'), 'Aldi Nord',
   array[tests.fx('drogerie_hygiene'), tests.fx('drogerie'), tests.fx('getraenke')],
   array[tests.fx('drogerie_hygiene')]),
  (tests.fx('store_b'), tests.fx('home_b'), 'Edeka', array[tests.fx('keller')], '{}');
update public.households set default_store_id = tests.fx('rewe') where id = tests.fx('home_a');

-- ===================== Unique area names (AC-052) =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format($$ insert into public.areas (household_id, name) values (%L, 'getränke') $$, tests.fx('home_a')),
  '23505', null,
  'AC-052 areas: a second "getränke" next to "Getränke" is rejected');
select throws_ok(
  format($$ update public.areas set name = 'Getränke' where id = %L $$, tests.fx('kuehlung')),
  '23505', null,
  'AC-052 areas: renaming "Kühlung" to "Getränke" is rejected');
select lives_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'patch', 'table', 'areas', 'id', tests.fx('kuehlung'),
                       'changes', jsonb_build_object('name', 'Kühlregal')))),
  'AC-052 apply_changes: renaming "Kühlung" to "Kühlregal" works');
select tests.authenticate_as(tests.fx('ben'));
select lives_ok(
  format($$ insert into public.areas (household_id, name) values (%L, 'Getränke') $$, tests.fx('home_b')),
  'AC-052 areas: another household may have its own "Getränke"');

-- ===================== merge_areas: refused (AC-056) =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format('select public.merge_areas(%L, %L)', tests.fx('keller'), tests.fx('getraenke')),
  'P0002', 'area_not_found',
  'AC-056 merge_areas: a source of another household is not found');
select throws_ok(
  format('select public.merge_areas(%L, %L)', tests.fx('getraenke'), tests.fx('keller')),
  'P0002', 'area_not_found',
  'AC-056 merge_areas: a target of another household is not found');
select throws_ok(
  format('select public.merge_areas(%L, %L)', tests.fx('drogerie'), gen_random_uuid()),
  'P0002', 'area_not_found',
  'AC-054 merge_areas: an unknown target is not found');
select throws_ok(
  format('select public.merge_areas(%L, %L)', tests.fx('drogerie'), tests.fx('drogerie')),
  '22023', 'invalid_value',
  'AC-054 merge_areas: an area cannot be merged with itself');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format('select public.merge_areas(%L, %L)', tests.fx('drogerie'), tests.fx('drogerie_hygiene')),
  'P0002', 'area_not_found',
  'AC-056 merge_areas: a member of another household finds neither area');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.merge_areas(%L, %L)', tests.fx('keller'), tests.fx('getraenke')),
  '42501', null,
  'AC-056 merge_areas: anon cannot call it');

-- ===================== Renaming or deleting a foreign area (AC-056) =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(
  tests.affected(format($$ update public.areas set name = 'Vorrat' where id = %L $$, tests.fx('keller'))), 0,
  'AC-056 areas: Enrico cannot rename "Keller" of WG Köln');
select is(
  tests.affected(format('delete from public.areas where id = %L', tests.fx('keller'))), 0,
  'AC-056 areas: Enrico cannot delete "Keller" of WG Köln');
select throws_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_b'), jsonb_build_array(
    jsonb_build_object('kind', 'delete', 'table', 'areas', 'id', tests.fx('keller')))),
  '42501', 'not_member',
  'AC-056 apply_changes: Enrico cannot write into WG Köln');
select tests.authenticate_as_anon();
select throws_ok(
  format($$ update public.areas set name = 'Vorrat' where id = %L $$, tests.fx('keller')),
  '42501', null,
  'AC-056 areas: anon cannot rename an area');
select throws_ok(
  format('delete from public.areas where id = %L', tests.fx('keller')),
  '42501', null,
  'AC-056 areas: anon cannot delete an area');
select tests.clear_authentication();
select results_eq(
  format($$ select a.name, (select count(*)::int from public.articles ar where ar.area_id = a.id),
                   (select s.area_order from public.stores s where s.id = %L)
            from public.areas a where a.id = %L $$, tests.fx('store_b'), tests.fx('keller')),
  format($$ values ('Keller'::text, 1, array[%L::uuid]) $$, tests.fx('keller')),
  'AC-056 areas: "Keller" is unchanged, with its article and its place in the store');

-- ===================== merge_areas: Drogerie into Drogerie & Hygiene (AC-054) =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.merge_areas(tests.fx('drogerie'), tests.fx('drogerie_hygiene')), 12,
  'AC-054 merge_areas: 12 articles moved');
select is(
  (select count(*)::int from public.articles where area_id = tests.fx('drogerie_hygiene')), 32,
  'AC-054 merge_areas: "Drogerie & Hygiene" has 32 articles');
select is(
  (select count(*)::int from public.areas where id = tests.fx('drogerie')), 0,
  'AC-054 merge_areas: "Drogerie" is gone');
select is(
  (select count(*)::int from public.deleted_records where table_name = 'areas' and record_id = tests.fx('drogerie')::text), 1,
  'AC-054 merge_areas: the deletion leaves a tombstone');
select results_eq(
  format($$ select id, area_order, hidden_area_ids from public.stores where id in (%L, %L) order by name $$,
         tests.fx('rewe'), tests.fx('aldi')),
  format($$ values (%L::uuid, array[%L::uuid, %L::uuid], array[%L::uuid]),
                   (%L::uuid, array[%L::uuid, %L::uuid, %L::uuid], '{}'::uuid[]) $$,
         tests.fx('aldi'), tests.fx('drogerie_hygiene'), tests.fx('getraenke'), tests.fx('drogerie_hygiene'),
         tests.fx('rewe'), tests.fx('getraenke'), tests.fx('drogerie_hygiene'), tests.fx('tierbedarf')),
  'AC-054 merge_areas: "Drogerie" is in no store any more; the target keeps its place and visibility');

-- ===================== Deleting an area (AC-055, AC-056) =====================
select tests.clear_authentication();
alter table public.articles disable trigger articles_set_timestamps;
update public.articles set updated_at = '2026-01-01T00:00:00Z' where area_id = tests.fx('tierbedarf');
alter table public.articles enable trigger articles_set_timestamps;
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'delete', 'table', 'areas', 'id', tests.fx('tierbedarf')),
    jsonb_build_object('kind', 'patch', 'table', 'stores', 'id', tests.fx('rewe'),
                       'changes', jsonb_build_object('area_order', jsonb_build_array(tests.fx('getraenke'),
                                                                                     tests.fx('drogerie_hygiene')))))),
  'AC-055 apply_changes: deleting an area and removing it from the walking order is one changeset');
select results_eq(
  format($$ select count(*)::int, bool_and(area_id is null), bool_and(updated_at > '2026-01-01T00:00:00Z')
            from public.articles where id = %L or name = 'Katzenstreu' $$, tests.fx('katzenfutter')),
  $$ values (2, true, true) $$,
  'AC-055 areas: the two articles of "Tierbedarf" are without area, with a new updated_at for the delta sync');
select lives_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'delete', 'table', 'areas', 'id', tests.fx('deko')))),
  'AC-056 apply_changes: the empty area "Deko" is deleted');
select lives_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'insert', 'table', 'areas', 'row', jsonb_build_object(
      'id', tests.fx('deko'), 'name', 'Deko', 'sort', 5)))),
  'AC-056 apply_changes: "Rückgängig" inserts "Deko" again with its id');

-- ===================== Deleting a store (AC-045) =====================
select lives_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'delete', 'table', 'stores', 'id', tests.fx('rewe')))),
  'AC-045 apply_changes: the default store is deleted');
select is(
  (select default_store_id from public.households where id = tests.fx('home_a')), null::uuid,
  'AC-045 households: the household has no default store any more');
select tests.authenticate_as(tests.fx('ben'));
select is(
  tests.affected(format('delete from public.stores where id = %L', tests.fx('aldi'))), 0,
  'AC-045 stores: a member of another household deletes nothing');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.stores where id = tests.fx('aldi')), 1,
  'AC-045 stores: the other store still exists');

select * from finish();
rollback;
