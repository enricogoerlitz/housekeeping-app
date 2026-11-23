-- Spec 0031, REQ-017 — small schema cleanups: household_members and household_invitations come in
-- full on every pull and need no tombstones and no delta index (D-05); no profiles_email_idx, a
-- plain households_default_store_fkey (D-06); an index for the calendar's date queries (D-09);
-- begin_household_deletion instead of household_media_names (D-12); packing_items.per_day is
-- per_day_quantity, and maps_url of restaurants and activities follows private.is_web_url (D-13).
-- Covers AC-043–AC-045 and the negative tests (invalid links, a removed member).
begin;
\ir _helpers.psql
select plan(24);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
create function tests.apply_sql(p_ops jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx('home'), p_ops) $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')]));
insert into fx (key) values ('invitation'), ('mallorca'), ('lb'), ('socken'), ('enzo'), ('eislaufen');

insert into public.household_invitations (id, household_id, email, invited_by)
values (tests.fx('invitation'), tests.fx('home'), 'mia@example.com', tests.fx('enrico'));
insert into public.trips (id, household_id, from_on, to_on, note)
values (tests.fx('mallorca'), tests.fx('home'), '2026-12-12', '2026-12-15', 'Mallorca');
insert into public.packing_list_bags (id, household_id, trip_id, name, sort)
values (tests.fx('lb'), tests.fx('home'), tests.fx('mallorca'), 'Kleidung', 0);

-- ===================== D-05: small tables without tombstones (AC-043) =====================
select hasnt_trigger('public', 'household_members', 'household_members_record_deletion',
  'D-05: household_members writes no tombstones');
select hasnt_trigger('public', 'household_invitations', 'household_invitations_record_deletion',
  'D-05: household_invitations writes no tombstones');
select hasnt_index('public', 'household_members', 'household_members_household_id_updated_at_idx',
  'D-05: household_members has no delta index');
select hasnt_index('public', 'household_invitations', 'household_invitations_household_id_updated_at_idx',
  'D-05: household_invitations has no delta index');
delete from public.household_members where household_id = tests.fx('home') and profile_id = tests.fx('nadja');
delete from public.household_invitations where id = tests.fx('invitation');
select is(
  (select count(*)::int from public.deleted_records
   where table_name in ('household_members', 'household_invitations')),
  0, 'AC-043: removing a member and withdrawing an invitation leave no entry in deleted_records');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  (select jsonb_build_object(
     'members', (select jsonb_agg(m -> 'profile_id') from jsonb_array_elements(p -> 'small' -> 'household_members') m),
     'invitations', jsonb_array_length(p -> 'small' -> 'household_invitations'))
   from public.sync_pull(jsonb_build_object('households', jsonb_build_object(tests.fx('home'), '{"full": true}'))) p),
  jsonb_build_object('members', jsonb_build_array(tests.fx('enrico')), 'invitations', 0),
  'AC-043: the next pull of the other device has neither Nadja nor the invitation (small tables come in full)');
select tests.clear_authentication();

-- ===================== D-06, D-09: indexes and the store reference =====================
select hasnt_index('public', 'profiles', 'profiles_email_idx', 'D-06: profiles_email_idx is gone');
select is(
  (select condeferrable from pg_catalog.pg_constraint where conname = 'households_default_store_fkey'), false,
  'D-06: households_default_store_fkey is not deferrable');
select has_index('public', 'meal_plan_entries', 'meal_plan_entries_household_id_date_idx', array['household_id', 'date'],
  'D-09: meal_plan_entries has an index on (household_id, date)');

-- ===================== D-12: begin_household_deletion (AC-045) =====================
select has_function('public', 'begin_household_deletion', array['uuid'],
  'AC-045: public.begin_household_deletion(uuid) exists');
select hasnt_function('public', 'household_media_names', array['uuid'], 'AC-045: public.household_media_names is gone');
select hasnt_function('private', 'household_media_names', array['uuid'], 'AC-045: private.household_media_names is gone');
select tests.authenticate_as_anon();
select throws_ok(format('select public.begin_household_deletion(%L)', tests.fx('home')), '42501', null,
  'AC-045 begin_household_deletion: anon cannot call it');
select tests.authenticate_as(tests.fx('nadja'));
select throws_ok(format('select public.begin_household_deletion(%L)', tests.fx('home')), '42501', 'not_member',
  'AC-045 begin_household_deletion: a removed member cannot start the deletion');
select tests.authenticate_as(tests.fx('enrico'));
select is((select count(*)::int from public.begin_household_deletion(tests.fx('home'))), 0,
  'AC-045 begin_household_deletion: the last member gets the names of the photos (none here)');
select tests.clear_authentication();

-- ===================== D-13: per_day_quantity =====================
select has_column('public', 'packing_items', 'per_day_quantity', 'D-13: packing_items.per_day_quantity exists');
select hasnt_column('public', 'packing_items', 'per_day', 'D-13: packing_items.per_day is gone');
select has_column('public', 'packing_bag_items', 'per_day', 'D-13: the flag per_day of a Reisetasche stays');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.apply_sql(jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'packing_items', 'row',
    jsonb_build_object('id', tests.fx('socken'), 'list_bag_id', tests.fx('lb'), 'name', 'Socken', 'quantity', 1,
                       'per_day_quantity', 2, 'sort', 0)))),
  'D-13 apply_changes: a Packstück with 2 je Tag is inserted with per_day_quantity');
select is((select quantity from public.packing_items where id = tests.fx('socken')), 8,
  'D-13: 2 je Tag for 4 days are 8');

-- ===================== D-13: maps_url (AC-044) =====================
select lives_ok(tests.apply_sql(jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'activities', 'row',
    jsonb_build_object('id', tests.fx('eislaufen'), 'name', 'Eislaufen', 'name_key', 'eislaufen',
                       'maps_url', 'http://maps.google.com/?q=Eisstadion')))),
  'AC-044 activities: a map link http://maps.google.com/… is accepted');
select lives_ok(tests.apply_sql(jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'restaurants', 'row',
    jsonb_build_object('id', tests.fx('enzo'), 'name', 'Trattoria Da Enzo',
                       'maps_url', 'http://maps.google.com/?q=Enzo')))),
  'AC-044 restaurants: … like for a restaurant');
select throws_ok(tests.apply_sql(jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'activities',
    'id', tests.fx('eislaufen'), 'changes', jsonb_build_object('maps_url', 'https://maps.google.com/?q=Eis stadion')))),
  '23514', null, 'AC-044 activities: a link with a space is refused (private.is_web_url)');
select throws_ok(tests.apply_sql(jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'restaurants',
    'id', tests.fx('enzo'), 'changes', jsonb_build_object('maps_url', 'https://localhost')))),
  '23514', null, 'AC-044 restaurants: a link without a dot in the host is refused, like for an activity');

select * from finish();
rollback;
