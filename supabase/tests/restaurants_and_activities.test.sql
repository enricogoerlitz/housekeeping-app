-- Spec 0024 — restaurants and activities: website (REQ-003), the restaurant photo and its storage
-- folder (REQ-004), deleting with "Rückgängig" (REQ-010). Covers AC-010, AC-015, AC-034–AC-038 on
-- the server and the negative tests of the risk table: signed out, foreign household, another
-- person restoring, deleting around the RPC, concurrent planning, invalid input.
begin;
\ir _helpers.psql
select plan(71);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- An object name as the client builds it: <household_id>/<kind>/<row id>/<uuid>.jpg.
create function tests.media(p_household text, p_kind text, p_row text, p_file text) returns text language sql stable
as $$ select tests.fx(p_household) || '/' || p_kind || '/' || tests.fx(p_row) || '/' || md5(p_file)::uuid || '.jpg' $$;
create function tests.upload_sql(p_name text) returns text language sql stable
as $$ select format('insert into storage.objects (bucket_id, name, metadata) values (%L, %L, %L)',
                    'household-media', p_name, '{"mimetype": "image/jpeg", "size": 1000}') $$;
create function tests.call_sql(p_function text, p_key text, p_today date default current_date) returns text
language sql stable
as $$ select case when p_function like 'delete_%'
                  then format('select public.%s(%L, %L)', p_function, tests.fx(p_key), p_today)
                  else format('select public.%s(%L)', p_function, tests.fx(p_key)) end $$;
create function tests.patch_sql(p_table text, p_key text, p_changes jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(jsonb_build_object(
  'kind', 'patch', 'table', p_table, 'id', tests.fx(p_key), 'changes', p_changes))) $$;
-- One plan entry as comparable JSON, without the server timestamps.
create function tests.entry(p_key text) returns jsonb language sql stable
as $$ select to_jsonb(e) - 'created_at' - 'updated_at' from public.meal_plan_entries e where e.id = tests.fx(p_key) $$;
grant execute on all functions in schema tests to anon, authenticated;

select set_config('storage.allow_delete_query', 'true', true);

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values
  ('slot'), ('slot_b'), ('enzo'), ('pho'), ('enzo_b'), ('eislaufen'), ('bouldern'), ('e_past'), ('e_future'),
  ('e_noted'), ('e_pho'), ('e_eis_past'), ('e_eis_future'), ('e_new'), ('photo');

update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('slot'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('home_a');
update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('slot_b'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('home_b');
insert into public.restaurants (id, household_id, name, cuisine, price_level, address, tags, notes, website_url,
                                photo_path) values
  (tests.fx('enzo'), tests.fx('home_a'), 'Trattoria Da Enzo', 'Italienisch', 2, 'Severinstraße 12, Köln', '{pasta}',
   'Trüffelpasta!', 'https://trattoria-da-enzo.de', tests.media('home_a', 'restaurants', 'enzo', 'enzo')),
  (tests.fx('pho'), tests.fx('home_a'), 'Pho Saigon', null, null, null, '{}', null, null, null),
  (tests.fx('enzo_b'), tests.fx('home_b'), 'Enzo B', null, null, null, '{}', null, null, null);
insert into public.restaurant_ratings (household_id, restaurant_id, member_id, stars) values
  (tests.fx('home_a'), tests.fx('enzo'), tests.fx('enrico'), 4.5),
  (tests.fx('home_a'), tests.fx('enzo'), tests.fx('nadja'), 4);
insert into public.restaurant_favorites (household_id, restaurant_id, member_id) values
  (tests.fx('home_a'), tests.fx('enzo'), tests.fx('nadja'));
insert into public.activities (id, household_id, name, name_key, photo_path, website_url, created_by) values
  (tests.fx('eislaufen'), tests.fx('home_a'), 'Eislaufen', 'eislaufen',
   tests.media('home_a', 'activities', 'eislaufen', 'eis'), null, tests.fx('nadja')),
  (tests.fx('bouldern'), tests.fx('home_a'), 'Bouldern', 'bouldern', null, null, tests.fx('nadja'));
insert into public.activity_ratings (household_id, activity_id, member_id, stars) values
  (tests.fx('home_a'), tests.fx('eislaufen'), tests.fx('enrico'), 5);
insert into public.meal_plan_entries
  (id, household_id, date, slot_id, kind, restaurant_id, activity_id, note, starts_at, eater_ids, guests, sort) values
  (tests.fx('e_past'), tests.fx('home_a'), current_date - 19, tests.fx('slot'), 'restaurant', tests.fx('enzo'), null,
   null, null, array[tests.fx('enrico'), tests.fx('nadja')], 0, 0),
  (tests.fx('e_future'), tests.fx('home_a'), current_date + 6, tests.fx('slot'), 'restaurant', tests.fx('enzo'), null,
   null, '19:30', array[tests.fx('enrico'), tests.fx('nadja')], 1, 0),
  (tests.fx('e_noted'), tests.fx('home_a'), null, tests.fx('slot'), 'restaurant', tests.fx('enzo'), null,
   null, null, array[tests.fx('enrico')], 0, 0),
  (tests.fx('e_pho'), tests.fx('home_a'), current_date - 3, tests.fx('slot'), 'restaurant', tests.fx('pho'), null,
   null, null, '{}', 0, 0),
  (tests.fx('e_eis_past'), tests.fx('home_a'), current_date - 14, tests.fx('slot'), 'activity', null,
   tests.fx('eislaufen'), 'Halle Nord', null, '{}', 0, 0),
  (tests.fx('e_eis_future'), tests.fx('home_a'), current_date + 13, tests.fx('slot'), 'activity', null,
   tests.fx('eislaufen'), null, null, '{}', 0, 1);

alter table public.restaurants disable trigger restaurants_set_timestamps;
update public.restaurants set created_at = '2026-01-15 09:00+00' where id = tests.fx('enzo');
alter table public.restaurants enable trigger restaurants_set_timestamps;

create temp table original on commit drop as
  select 'enzo' as key, to_jsonb(r) - 'updated_at' as doc from public.restaurants r where r.id = tests.fx('enzo')
  union all
  select 'eislaufen', to_jsonb(a) - 'updated_at' from public.activities a where a.id = tests.fx('eislaufen')
  union all
  select k, tests.entry(k) from unnest(array['e_past', 'e_future', 'e_noted', 'e_eis_past', 'e_eis_future']) k;
grant select on original to authenticated;

-- ===================== Website (REQ-003, AC-010) =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.patch_sql('restaurants', 'pho', '{"website_url": "javascript:alert(1)"}'), '23514', null,
  'AC-010 restaurants: javascript: is refused as website');
select throws_ok(tests.patch_sql('restaurants', 'pho', '{"website_url": "https://enzo.de/ x"}'), '23514', null,
  'AC-010 restaurants: a website with a space is refused');
select throws_ok(tests.patch_sql('activities', 'bouldern', '{"website_url": "ftp://enzo.de"}'), '23514', null,
  'AC-010 activities: ftp: is refused as website');
select lives_ok(tests.patch_sql('activities', 'bouldern', '{"website_url": "https://www.eisstadion-koeln.de"}'),
  'AC-011 activities: a website with https is stored');
select lives_ok(tests.patch_sql('activities', 'bouldern', '{"website_url": null}'),
  'AC-011 activities: the website can be cleared');
select lives_ok(tests.patch_sql('restaurants', 'pho', '{"website_url": "https://pho-saigon.de", "tags": ["suppe"]}'),
  'REQ-001 restaurants: website and tags are patched through apply_changes');

-- ===================== Photo path (REQ-004, AC-015) =====================
select lives_ok(tests.patch_sql('restaurants', 'pho', jsonb_build_object('photo_path',
                  tests.media('home_a', 'restaurants', 'pho', 'neu'))),
  'AC-012 restaurants: the own folder is accepted as photo_path');
select throws_ok(tests.patch_sql('restaurants', 'pho', jsonb_build_object('photo_path',
                   tests.media('home_b', 'restaurants', 'pho', 'x'))), '23514', null,
  'AC-015 restaurants: a path in another household is refused');
select throws_ok(tests.patch_sql('restaurants', 'pho', jsonb_build_object('photo_path',
                   tests.media('home_a', 'restaurants', 'enzo', 'x'))), '23514', null,
  'AC-015 restaurants: the folder of another restaurant is refused');
select throws_ok(tests.patch_sql('restaurants', 'pho', jsonb_build_object('photo_path',
                   tests.media('home_a', 'activities', 'pho', 'x'))), '23514', null,
  'AC-015 restaurants: the folder of activities is refused');
select throws_ok(tests.patch_sql('restaurants', 'pho', jsonb_build_object('photo_path',
                   tests.fx('home_a') || '/restaurants/' || tests.fx('pho') || '/foto.png')), '23514', null,
  'AC-015 restaurants: another file name is refused');

-- Storage: the folder restaurants.
select lives_ok(tests.upload_sql(tests.media('home_a', 'restaurants', 'pho', 'neu')),
  'AC-012 storage: a member uploads into the restaurants folder of her household');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.upload_sql(tests.media('home_a', 'restaurants', 'pho', 'fremd')), '42501', null,
  'AC-015 storage: a foreign household cannot upload into the restaurants folder');
select is((select count(*)::int from storage.objects where name like tests.fx('home_a') || '/restaurants/%'), 0,
  'AC-015 storage: a foreign household reads no restaurant photo');
select is(tests.affected(format('delete from storage.objects where name = %L',
                                tests.media('home_a', 'restaurants', 'pho', 'neu'))), 0,
  'AC-015 storage: a foreign household deletes no restaurant photo');
select tests.authenticate_as_anon();
select throws_ok(tests.upload_sql(tests.media('home_a', 'restaurants', 'pho', 'anon')), '42501', null,
  'AC-015 storage: anon cannot upload a restaurant photo');
select tests.authenticate_as(tests.fx('nadja'));
select is((select count(*)::int from storage.objects where name = tests.media('home_a', 'restaurants', 'pho', 'neu')), 1,
  'AC-012 storage: another member reads the restaurant photo');

-- ===================== Around the RPC (AC-038) =====================
select tests.authenticate_as_anon();
select throws_ok(tests.call_sql('delete_restaurant', 'enzo'), '42501', null,
  'AC-038 delete_restaurant: anon cannot call it');
select throws_ok(tests.call_sql('restore_restaurant', 'enzo'), '42501', null,
  'AC-038 restore_restaurant: anon cannot call it');
select throws_ok(tests.call_sql('delete_activity', 'eislaufen'), '42501', null,
  'AC-038 delete_activity: anon cannot call it');
select throws_ok(tests.call_sql('restore_activity', 'eislaufen'), '42501', null,
  'AC-038 restore_activity: anon cannot call it');

select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.call_sql('delete_restaurant', 'enzo'), 'P0002', 'restaurant_not_found',
  'AC-038 delete_restaurant: a foreign household gets restaurant_not_found');
select throws_ok(tests.call_sql('delete_activity', 'eislaufen'), 'P0002', 'activity_not_found',
  'AC-038 delete_activity: a foreign household gets activity_not_found');

select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(format('delete from public.restaurants where id = %L', tests.fx('pho')), '42501', null,
  'AC-038 restaurants: a member cannot delete directly');
select throws_ok(format('delete from public.activities where id = %L', tests.fx('bouldern')), '42501', null,
  'AC-038 activities: a member cannot delete directly');
select throws_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'),
         jsonb_build_array(jsonb_build_object('kind', 'delete', 'table', 'restaurants', 'id', tests.fx('pho')))),
  '22023', 'invalid_change', 'AC-038 apply_changes: restaurants cannot be deleted through it');
select throws_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'),
         jsonb_build_array(jsonb_build_object('kind', 'delete', 'table', 'activities', 'id', tests.fx('bouldern')))),
  '22023', 'invalid_change', 'AC-038 apply_changes: activities cannot be deleted through it');
select throws_ok('select * from private.deletions', '42501', null,
  'AC-038 deletions: authenticated cannot read the snapshots');
select throws_ok(tests.call_sql('delete_restaurant', 'enzo', current_date - 2), '22023', 'invalid_value',
  'AC-038 delete_restaurant: a day more than one day off is refused');
select throws_ok(format('select public.delete_activity(%L, null)', tests.fx('eislaufen')), '22023', 'invalid_value',
  'AC-038 delete_activity: a missing day is refused');
select throws_ok(tests.call_sql('restore_restaurant', 'enzo'), 'P0002', 'restaurant_not_restorable',
  'AC-038 restore_restaurant: nothing to restore before a deletion');

-- ===================== Deleting a restaurant (AC-034) =====================
select is(public.delete_restaurant(tests.fx('pho'), current_date), '{"converted": 1, "removed": 0}'::jsonb,
  'AC-034 delete_restaurant: Pho Saigon with one past entry, nothing removed');
select is((select count(*)::int from public.restaurants where id = tests.fx('pho')), 0,
  'AC-034 delete_restaurant: Pho Saigon is gone');

-- Enzo, as the device does it.
select is(public.delete_restaurant(tests.fx('enzo'), current_date), '{"converted": 1, "removed": 2}'::jsonb,
  'AC-034 delete_restaurant: one entry becomes free text, the later and the noted one go');
select is((select count(*)::int from public.restaurants where id = tests.fx('enzo')), 0,
  'AC-034 delete_restaurant: the restaurant is gone');
select is(tests.entry('e_past') - 'household_id' - 'id',
  (select o.doc - 'household_id' - 'id' from original o where o.key = 'e_past')
    || '{"kind": "text", "restaurant_id": null, "text": "Trattoria Da Enzo"}',
  'AC-034 delete_restaurant: the past entry is free text with the name, eaters kept');
select is((select count(*)::int from public.meal_plan_entries where id in (tests.fx('e_future'), tests.fx('e_noted'))),
  0, 'AC-034 delete_restaurant: the later and the noted entry are gone');
select is((select count(*)::int from public.restaurant_ratings where restaurant_id = tests.fx('enzo'))
          + (select count(*)::int from public.restaurant_favorites where restaurant_id = tests.fx('enzo')), 0,
  'AC-034 delete_restaurant: ratings and favourites go with it');
select is((select count(*)::int from public.deleted_records
           where household_id = tests.fx('home_a')
             and (table_name, record_id) in (('restaurants', tests.fx('enzo')::text),
                                             ('meal_plan_entries', tests.fx('e_future')::text),
                                             ('restaurant_ratings', tests.fx('enzo') || ':' || tests.fx('nadja')),
                                             ('restaurant_favorites', tests.fx('enzo') || ':' || tests.fx('nadja')))),
  4, 'AC-034 delete_restaurant: tombstones reach the other devices');

-- A concurrent "Einplanen" after the deletion fails its foreign key.
select throws_ok(format($$ insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, restaurant_id)
                           values (%L, %L, current_date + 1, %L, 'restaurant', %L) $$,
                        tests.fx('e_new'), tests.fx('home_a'), tests.fx('slot'), tests.fx('enzo')), '23503', null,
  'AC-020 meal_plan_entries: planning a deleted restaurant fails its foreign key');

-- ===================== Restoring (AC-035, AC-037, AC-038) =====================
select tests.authenticate_as(tests.fx('nadja'));
select throws_ok(tests.call_sql('restore_restaurant', 'enzo'), 'P0002', 'restaurant_not_restorable',
  'AC-038 restore_restaurant: another member of the household cannot restore Enrico''s deletion');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.call_sql('restore_restaurant', 'enzo'), 'P0002', 'restaurant_not_restorable',
  'AC-038 restore_restaurant: a foreign household cannot restore it');

-- Nadja changes the free text of Pho Saigon before Enrico's "Rückgängig" (AC-037).
select tests.authenticate_as(tests.fx('nadja'));
update public.meal_plan_entries set text = 'Pizza bei Enzo' where id = tests.fx('e_pho');
select tests.authenticate_as(tests.fx('enrico'));
select is(public.restore_restaurant(tests.fx('pho')), true, 'AC-037 restore_restaurant: Pho Saigon comes back');
select is((select kind || ':' || text from public.meal_plan_entries where id = tests.fx('e_pho')), 'text:Pizza bei Enzo',
  'AC-037 restore_restaurant: the changed free text stays as it is');

select is(public.restore_restaurant(tests.fx('enzo')), true, 'AC-035 restore_restaurant: Enzo comes back');
select is((select to_jsonb(r) - 'updated_at' from public.restaurants r where r.id = tests.fx('enzo')),
  (select doc from original where key = 'enzo'),
  'AC-035 restore_restaurant: every field, the photo path and created_at are back');
select is((select jsonb_object_agg(member_id, stars) from public.restaurant_ratings where restaurant_id = tests.fx('enzo')),
  jsonb_build_object(tests.fx('enrico'), 4.5, tests.fx('nadja'), 4.0),
  'AC-035 restore_restaurant: both ratings are back');
select is((select array_agg(member_id) from public.restaurant_favorites where restaurant_id = tests.fx('enzo')),
  array[tests.fx('nadja')], 'AC-035 restore_restaurant: the favourite is back');
select is(tests.entry('e_future'), (select doc from original where key = 'e_future'),
  'AC-035 restore_restaurant: the later entry with 19:30 is back');
select is(tests.entry('e_noted'), (select doc from original where key = 'e_noted'),
  'AC-035 restore_restaurant: the noted entry is back');
select is(tests.entry('e_past'), (select doc from original where key = 'e_past'),
  'AC-035 restore_restaurant: the past entry is a restaurant entry again');
select throws_ok(tests.call_sql('restore_restaurant', 'enzo'), 'P0002', 'restaurant_not_restorable',
  'AC-038 restore_restaurant: a snapshot restores only once');

-- ===================== Deleting an activity (AC-036) =====================
select is(public.delete_activity(tests.fx('eislaufen'), current_date), '{"converted": 1, "removed": 1}'::jsonb,
  'AC-036 delete_activity: one entry becomes free text, the later one goes');
select is((select kind || ':' || text || ':' || coalesce(note, '-') from public.meal_plan_entries
           where id = tests.fx('e_eis_past')),
  'text:Eislaufen (Halle Nord):-', 'AC-036 delete_activity: the free text carries the Zusatz');
select is((select count(*)::int from public.meal_plan_entries where id = tests.fx('e_eis_future')), 0,
  'AC-036 delete_activity: the later entry is gone');
select is((select count(*)::int from public.activities where id = tests.fx('eislaufen'))
          + (select count(*)::int from public.activity_ratings where activity_id = tests.fx('eislaufen')), 0,
  'AC-036 delete_activity: the activity and its rating are gone');

select tests.authenticate_as(tests.fx('nadja'));
select throws_ok(tests.call_sql('restore_activity', 'eislaufen'), 'P0002', 'activity_not_restorable',
  'AC-038 restore_activity: another member cannot restore Enrico''s deletion');
select tests.authenticate_as(tests.fx('enrico'));
select is(public.restore_activity(tests.fx('eislaufen')), true, 'AC-036 restore_activity: Eislaufen comes back');
select is((select to_jsonb(a) - 'updated_at' from public.activities a where a.id = tests.fx('eislaufen')),
  (select doc from original where key = 'eislaufen'),
  'AC-036 restore_activity: every field, photo, creator Nadja and created_at are back');
select is(tests.entry('e_eis_past'), (select doc from original where key = 'e_eis_past'),
  'AC-036 restore_activity: the past entry is "Eislaufen" with Zusatz "Halle Nord" again');
select is(tests.entry('e_eis_future'), (select doc from original where key = 'e_eis_future'),
  'AC-036 restore_activity: the later entry is back');
select is((select stars from public.activity_ratings where activity_id = tests.fx('eislaufen')), 5.0,
  'AC-036 restore_activity: the rating is back');

-- Deleted again and not restored within the hour: refused, and purged by the hourly job.
select is(public.delete_activity(tests.fx('eislaufen'), current_date) ->> 'converted', '1', 'setup');
reset role;
update private.deletions set deleted_at = now() - interval '61 minutes' where target_id = tests.fx('eislaufen');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.call_sql('restore_activity', 'eislaufen'), 'P0002', 'activity_not_restorable',
  'REQ-010 restore_activity: after one hour nothing is restorable');
reset role;
select private.purge_deletions();
select is((select count(*)::int from private.deletions where target_id = tests.fx('eislaufen')), 0,
  'REQ-010 purge_deletions: an expired snapshot is purged');
select is((select count(*)::int from cron.job where jobname = 'purge-deletions'), 1,
  'REQ-010 purge-deletions: the hourly job exists');
select is((select count(*)::int from cron.job where jobname = 'purge-recipe-deletions'), 0,
  'REQ-010 purge-recipe-deletions: the old job is gone');
select is((select count(*)::int from pg_catalog.pg_tables where schemaname = 'private' and tablename = 'recipe_deletions'),
  0, 'REQ-010 recipe_deletions: the table moved into private.deletions');

-- The foreign household is untouched.
select is((select count(*)::int from public.restaurants where household_id = tests.fx('home_b')), 1,
  'AC-038 the foreign household keeps its restaurant');

-- Definer functions and helpers.
select is(
  (select count(*)::int from pg_catalog.pg_proc p
   where p.oid in ('private.delete_restaurant(uuid,date)'::regprocedure, 'private.restore_restaurant(uuid)'::regprocedure,
                   'private.delete_activity(uuid,date)'::regprocedure, 'private.restore_activity(uuid)'::regprocedure)
     and p.prosecdef and 'search_path=""' = any (p.proconfig)),
  4, 'AC-038 delete/restore_restaurant, delete/restore_activity: security definer with an empty search_path');
select ok(
  not has_function_privilege('authenticated', 'private.restore_plan_entries(uuid,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.restore_converted_entries(uuid,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.my_deletion(text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.purge_deletions()', 'execute'),
  'AC-038 the helpers of deleting and restoring are not callable by the API roles');

select * from finish();
rollback;
