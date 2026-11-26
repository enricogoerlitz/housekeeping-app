-- Spec 0027 "Verwalten und Konto": withdrawing invitations and the open-only lifecycle (REQ-001),
-- the own profile through update_profile (REQ-003), renaming (REQ-004), deleting a household as
-- its last member with its photos first (REQ-005) and feedback only for its author (REQ-006).
-- Negative paths throughout: a foreign household, signed out, invalid input, the failure path.
begin;
\ir _helpers.psql
select plan(93);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;
create function tests.apply_sql(p_household text, p_ops jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx(p_household), p_ops) $$;
grant execute on function tests.apply_sql(text, jsonb) to anon, authenticated;

-- p_user_metadata as Google sends it; the hook is called directly like Supabase Auth does.
create function pg_temp.admits(p_email text) returns boolean language sql as $$
  select private.before_user_created_hook(jsonb_build_object(
    'user', jsonb_build_object('email', p_email, 'app_metadata', '{"provider": "google"}'::jsonb,
                               'user_metadata', '{"email_verified": true}'::jsonb))) = '{}'::jsonb
$$;

select set_config('storage.allow_delete_query', 'true', true);

-- Rows of p_household_id per table that has a household_id column (public and private).
create function tests.household_row_counts(p_household_id uuid) returns table (t text, n int)
language plpgsql as $$
declare
  r record;
begin
  for r in
    select c.table_schema as s, c.table_name as name
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.column_name = 'household_id' and c.table_schema in ('public', 'private') and tb.table_type = 'BASE TABLE'
  loop
    t := r.s || '.' || r.name;
    execute format('select count(*)::int from %I.%I where household_id = $1', r.s, r.name) into n using p_household_id;
    return next;
  end loop;
end
$$;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('wg', tests.create_household('WG Köln', array[tests.fx('enrico')])),
  ('ben_home', tests.create_household('Ben', array[tests.fx('ben')]));
insert into fx (key) values ('inv_lisa'), ('inv_nadja_wg'), ('inv_tom_home'), ('inv_tom_wg'), ('unknown');
insert into public.household_invitations (id, household_id, email, invited_by) values
  (tests.fx('inv_lisa'), tests.fx('home'), 'lisa@example.com', tests.fx('enrico')),
  (tests.fx('inv_nadja_wg'), tests.fx('wg'), 'nadja@example.com', tests.fx('enrico')),
  (tests.fx('inv_tom_home'), tests.fx('home'), 'tom@example.com', tests.fx('enrico')),
  (tests.fx('inv_tom_wg'), tests.fx('wg'), 'tom@example.com', tests.fx('enrico'));

-- ===================== REQ-001: withdrawing invitations =====================
select hasnt_column('public', 'household_invitations', 'accepted_at',
  'Decision 1: an invitation has no state "accepted"; it lives only while open');

select tests.authenticate_as(tests.fx('nadja'));
select throws_ok(
  format('select public.withdraw_invitation(%L)', tests.fx('inv_nadja_wg')),
  'P0002', 'invitation_not_found',
  'AC-004: Nadja cannot withdraw an invitation of "WG Köln", where she is no member');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format('select public.withdraw_invitation(%L)', tests.fx('unknown')),
  'P0002', 'invitation_not_found',
  'AC-004: an unknown id is invitation_not_found');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.withdraw_invitation(%L)', tests.fx('inv_lisa')),
  '42501', null,
  'AC-004: signed out nobody withdraws');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.household_invitations where household_id in (tests.fx('home'), tests.fx('wg'))),
  4,
  'AC-004: the refused calls changed nothing');

select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  format('select public.withdraw_invitation(%L)', tests.fx('inv_lisa')),
  'AC-001: Enrico withdraws the invitation to lisa@example.com');
select is(
  (select count(*)::int from public.household_invitations where id = tests.fx('inv_lisa')),
  0,
  'AC-001: the invitation is gone');
select is(
  (select count(*)::int from public.deleted_records
   where table_name = 'household_invitations' and record_id = tests.fx('inv_lisa')::text),
  0,
  'AC-001 (spec 0031, AC-043): no tombstone, the devices get the invitations in full on every pull');
select tests.clear_authentication();
select ok(not pg_temp.admits('lisa@example.com'),
  'AC-001: signing in with Google afterwards creates no account (not_invited)');

-- AC-002: Nadja has an account and sees the invitation to "WG Köln" until it is withdrawn.
select tests.authenticate_as(tests.fx('nadja'));
select results_eq(
  $$ select name from public.households order by name $$,
  $$ values ('Enrico & Nadja'), ('WG Köln') $$,
  'AC-002: before, Nadja reads the household she is invited to');
select tests.authenticate_as(tests.fx('enrico'));
select public.withdraw_invitation(tests.fx('inv_nadja_wg'));
select tests.authenticate_as(tests.fx('nadja'));
select is(
  (select count(*)::int from public.household_invitations where email = 'nadja@example.com'),
  0,
  'AC-002: after withdrawing Nadja sees no invitation');
select results_eq(
  $$ select name from public.households $$,
  $$ values ('Enrico & Nadja') $$,
  'AC-002: … and no row of "WG Köln"');
select throws_ok(
  format('select public.accept_invitation(%L)', tests.fx('inv_nadja_wg')),
  'P0002', 'invitation_not_found',
  'AC-002: "Annehmen" of the withdrawn invitation is invitation_not_found');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.household_members
   where household_id = tests.fx('wg') and profile_id = tests.fx('nadja')),
  0,
  'AC-002: Nadja did not become a member');

-- AC-005: Tom is invited twice; one is withdrawn.
select tests.authenticate_as(tests.fx('enrico'));
select public.withdraw_invitation(tests.fx('inv_tom_home'));
select tests.clear_authentication();
select ok(pg_temp.admits('tom@example.com'),
  'AC-005: the remaining invitation to "WG Köln" still lets Tom sign in');
insert into fx (key, id) values ('tom', tests.create_user('tom@example.com', 'Tom'));
select tests.authenticate_as(tests.fx('tom'));
select results_eq(
  $$ select household_id from public.household_invitations $$,
  format($$ values (%L::uuid) $$, tests.fx('wg')),
  'AC-005: Tom sees only the invitation to "WG Köln"');

-- AC-003: accepting deletes the invitation; a withdraw after it finds nothing, no half membership.
select is(public.accept_invitation(tests.fx('inv_tom_wg')), tests.fx('wg'),
  'AC-003: Tom accepts first');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format('select public.withdraw_invitation(%L)', tests.fx('inv_tom_wg')),
  'P0002', 'invitation_not_found',
  'AC-003: the withdraw that comes second sees invitation_not_found');
select tests.clear_authentication();
select ok(
  exists (select 1 from public.household_members where household_id = tests.fx('wg') and profile_id = tests.fx('tom'))
  and not exists (select 1 from public.household_invitations where id = tests.fx('inv_tom_wg')),
  'AC-003: Tom is a full member and the invitation is gone');
select ok(
  pg_get_functiondef('private.accept_invitation(uuid)'::regprocedure) ~ 'for update'
  and pg_get_functiondef('private.delete_household(uuid)'::regprocedure) ~ 'for update',
  'AC-022: accept_invitation and delete_household lock the same household row');

-- ===================== REQ-003: the own profile =====================
select tests.authenticate_as(tests.fx('nadja'));
select lives_ok(
  $$ select public.update_profile('  Nadja K. ', '#2F7F7A', 'vegetarian', array['Koriander']) $$,
  'AC-009: Nadja saves "Nadja K.", Petrol, vegetarisch and "Koriander"');
select results_eq(
  format($$ select name, email, color, diet_preference, dislikes from public.profiles where id = %L $$, tests.fx('nadja')),
  $$ values ('Nadja K.', 'nadja@example.com', '#2F7F7A', 'vegetarian', array['Koriander']) $$,
  'AC-009: the profile holds the trimmed name and the new values; the email stays');
select tests.authenticate_as(tests.fx('enrico'));
select results_eq(
  format($$ select name, diet_preference, dislikes from public.profiles where id = %L $$, tests.fx('nadja')),
  $$ values ('Nadja K.', 'vegetarian', array['Koriander']) $$,
  'AC-009: Enrico reads Nadja''s new profile');

select tests.authenticate_as(tests.fx('nadja'));
select throws_ok($$ select public.update_profile('', '#2F7F7A', 'vegetarian', '{}') $$,
  '22023', 'invalid_name', 'AC-012: an empty name is refused');
select throws_ok($$ select public.update_profile('   ', '#2F7F7A', 'vegetarian', '{}') $$,
  '22023', 'invalid_name', 'AC-012: a name of spaces is refused');
select throws_ok(format($$ select public.update_profile(%L, '#2F7F7A', 'vegetarian', '{}') $$, repeat('n', 81)),
  '22023', 'invalid_name', 'AC-012: 81 characters are refused');
select throws_ok($$ select public.update_profile('Nadja', '#000000', 'vegetarian', '{}') $$,
  '22023', 'invalid_color', 'AC-012: "#000000" is not one of the eight colours');
select throws_ok($$ select public.update_profile('Nadja', '#2F7F7A', 'pescetarian', '{}') $$,
  '22023', 'invalid_diet', 'AC-012: "pescetarisch" is refused');
select throws_ok(format($$ select public.update_profile('Nadja', '#2F7F7A', 'vegan', array[%L]) $$, repeat('k', 41)),
  '22023', 'invalid_dislikes', 'AC-012: a dislike of 41 characters is refused');
select throws_ok(
  $$ select public.update_profile('Nadja', '#2F7F7A', 'vegan', array(select 'Zutat ' || n from generate_series(1, 51) n)) $$,
  '22023', 'invalid_dislikes', 'AC-012: 51 dislikes are refused');
select throws_ok($$ select public.update_profile('Nadja', '#2F7F7A', 'vegan', array['Koriander', 'koriander']) $$,
  '22023', 'invalid_dislikes', 'AC-010: "koriander" next to "Koriander" is a duplicate');
select throws_ok($$ select public.update_profile('Nadja', '#2F7F7A', 'vegan', array[' Koriander']) $$,
  '22023', 'invalid_dislikes', 'AC-012: an untrimmed dislike is refused');
select throws_ok($$ select public.update_profile('Nadja', '#2F7F7A', 'vegan', array['']) $$,
  '22023', 'invalid_dislikes', 'AC-012: an empty dislike is refused');
select throws_ok($$ select public.update_profile('Nadja', '#2F7F7A', 'vegan', null) $$,
  '22023', 'invalid_dislikes', 'AC-012: missing dislikes are refused');
select throws_ok($$ select public.update_profile('Nadja', '#2F7F7A', 'vegan', array['Kohl', null]) $$,
  '22023', 'invalid_dislikes', 'AC-012: a null among the dislikes is refused (security check 22.11.2026)');
select lives_ok(
  $$ select public.update_profile('Nadja K.', '#2F7F7A', 'vegetarian', array(select 'Zutat ' || n from generate_series(1, 50) n)) $$,
  'AC-010: 50 dislikes are allowed');
select tests.authenticate_as_anon();
select throws_ok($$ select public.update_profile('Anon', '#2F7F7A', 'vegan', '{}') $$,
  '42501', null, 'AC-012: signed out nobody changes a profile');
select tests.clear_authentication();
select results_eq(
  format($$ select name, color from public.profiles where id = %L $$, tests.fx('enrico')),
  $$ values ('Enrico', private.profile_color(tests.fx('enrico'))) $$,
  'AC-012: Enrico''s profile is untouched (update_profile writes only the caller''s row)');
select is(
  private.profile_palette(),
  array['#3E6C8E', '#A8456B', '#5B7F3A', '#B5652B', '#6A4C93', '#2F7F7A', '#8C6D1F', '#9C3D3D'],
  'Decision 9: the palette is the same as PROFILE_COLORS in packages/core');
select throws_ok(
  format($$ update public.profiles set color = '#000000' where id = %L $$, tests.fx('enrico')),
  '23514', null, 'Decision 9: the database itself refuses a colour outside the palette');
select throws_ok(
  format($$ update public.profiles set dislikes = '{Koriander,KORIANDER}' where id = %L $$, tests.fx('enrico')),
  '23514', null, 'AC-012: the database itself refuses duplicate dislikes');
select is(
  has_table_privilege('authenticated', 'public.profiles', 'update')
  or has_any_column_privilege('authenticated', 'public.profiles', 'update'),
  false,
  'AC-012: no direct update grant on profiles any more (only update_profile)');

-- ===================== REQ-004: renaming =====================
select tests.authenticate_as(tests.fx('nadja'));
select throws_ok(
  tests.apply_sql('wg', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'households', 'id', tests.fx('wg'), 'changes', '{"name": "Gekapert"}'::jsonb))),
  '42501', 'not_member', 'AC-016: Nadja cannot rename "WG Köln" through apply_changes');
select is(
  tests.affected(format($$ update public.households set name = 'Gekapert' where id = %L $$, tests.fx('wg'))),
  0, 'AC-016: … nor directly');
select lives_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'households', 'id', tests.fx('home'), 'changes', '{"name": "Kuschelnest"}'::jsonb))),
  'AC-014: a member renames her household');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'households', 'id', tests.fx('home'), 'changes', '{"name": " "}'::jsonb))),
  '23514', null, 'AC-015: a name of spaces is refused');
select tests.clear_authentication();
select is((select name from public.households where id = tests.fx('wg')), 'WG Köln',
  'AC-016: "WG Köln" keeps its name');

-- ===================== REQ-005: deleting a household =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(format('select public.delete_household(%L)', tests.fx('home')),
  'P0001', 'not_last_member', 'AC-021: "Kuschelnest" has two members: not_last_member');
select throws_ok(format('select * from public.begin_household_deletion(%L)', tests.fx('home')),
  'P0001', 'not_last_member',
  'AC-022: the photo list is refused too, so the app deletes no photo of a household that stays');
select throws_ok(format('select public.delete_household(%L)', tests.fx('wg')),
  'P0001', 'not_last_member', 'AC-022: Tom joined meanwhile: deleting "WG Köln" is refused');
select tests.clear_authentication();
delete from public.household_members where household_id = tests.fx('wg') and profile_id = tests.fx('tom');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(format('select public.delete_household(%L)', tests.fx('wg')),
  '42501', 'not_member', 'AC-021: Ben (foreign) gets not_member');
select tests.authenticate_as_anon();
select throws_ok(format('select public.delete_household(%L)', tests.fx('wg')),
  '42501', null, 'AC-021: signed out it is refused');
select throws_ok(format('select * from public.begin_household_deletion(%L)', tests.fx('wg')),
  '42501', null, 'AC-021: signed out nobody lists the photos');
select tests.clear_authentication();
select is((select count(*)::int from public.households where id in (tests.fx('home'), tests.fx('wg'))), 2,
  'AC-021: nothing was deleted');

-- Fill "WG Köln": a row in every table that holds household data, photos in the storage.
insert into fx (key) values ('slot'), ('area'), ('article'), ('store'), ('recipe'), ('collection'),
  ('restaurant'), ('activity'), ('trip'), ('feedback'), ('chore'), ('event'), ('entry'),
  ('item'), ('bag'), ('bag_item'), ('list_bag'), ('packing_item'), ('series');
update public.households set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('slot'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('wg');
insert into public.areas (id, household_id, name) values (tests.fx('area'), tests.fx('wg'), 'Obst');
insert into public.articles (id, household_id, name, name_key, area_id)
values (tests.fx('article'), tests.fx('wg'), 'Äpfel', 'aepfel', tests.fx('area'));
insert into public.stores (id, household_id, name) values (tests.fx('store'), tests.fx('wg'), 'Rewe');
update public.households set default_store_id = tests.fx('store') where id = tests.fx('wg');
insert into public.recipes (id, household_id, title) values (tests.fx('recipe'), tests.fx('wg'), 'Lasagne');
insert into public.recipes (id, household_id, kind, title, course) values (tests.fx('collection'), tests.fx('wg'), 'collection', 'Grillabend', null);
insert into public.collection_recipes (household_id, collection_id, recipe_id)
values (tests.fx('wg'), tests.fx('collection'), tests.fx('recipe'));
insert into public.recipe_favorites (household_id, recipe_id, member_id) values (tests.fx('wg'), tests.fx('recipe'), tests.fx('enrico'));
insert into public.recipe_ratings (household_id, recipe_id, member_id, stars) values (tests.fx('wg'), tests.fx('recipe'), tests.fx('enrico'), 4);
insert into public.restaurants (id, household_id, name) values (tests.fx('restaurant'), tests.fx('wg'), 'Trattoria Da Enzo');
insert into public.restaurant_favorites (household_id, restaurant_id, member_id) values (tests.fx('wg'), tests.fx('restaurant'), tests.fx('enrico'));
insert into public.restaurant_ratings (household_id, restaurant_id, member_id, stars) values (tests.fx('wg'), tests.fx('restaurant'), tests.fx('enrico'), 5);
insert into public.activities (id, household_id, name, name_key, created_by)
values (tests.fx('activity'), tests.fx('wg'), 'Eislaufen', 'eislaufen', tests.fx('enrico'));
insert into public.activity_favorites (household_id, activity_id, member_id) values (tests.fx('wg'), tests.fx('activity'), tests.fx('enrico'));
insert into public.activity_ratings (household_id, activity_id, member_id, stars) values (tests.fx('wg'), tests.fx('activity'), tests.fx('enrico'), 3);
insert into public.activity_series (id, household_id, activity_id, rule, starts_on, slot_id)
values (tests.fx('series'), tests.fx('wg'), tests.fx('activity'), '{"type": "yearly"}', '2027-03-14', tests.fx('slot'));
insert into public.activity_series_exceptions (household_id, series_id, on_date)
values (tests.fx('wg'), tests.fx('series'), '2028-03-14');
insert into public.trips (id, household_id, from_on, to_on)
values (tests.fx('trip'), tests.fx('wg'), '2026-12-01', '2026-12-03');
insert into public.trip_members (household_id, trip_id, member_id) values (tests.fx('wg'), tests.fx('trip'), tests.fx('enrico'));
insert into public.feedback (id, household_id, kind, text, author_id)
values (tests.fx('feedback'), tests.fx('wg'), 'idea', 'Dunkler Modus', tests.fx('enrico'));
insert into public.feedback_votes (household_id, feedback_id, member_id) values (tests.fx('wg'), tests.fx('feedback'), tests.fx('enrico'));
insert into public.chores (id, household_id, title, recurrence, assignment, next_assignee_id)
values (tests.fx('chore'), tests.fx('wg'), 'Bad putzen', '{"type": "asNeeded"}', '{"type": "anyone"}', tests.fx('enrico'));
insert into public.chore_events (id, household_id, chore_id, title, kind, done_on, done_by)
values (tests.fx('event'), tests.fx('wg'), tests.fx('chore'), 'Bad putzen', 'done', current_date, tests.fx('enrico'));
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, cook_id)
values (tests.fx('entry'), tests.fx('wg'), current_date + 1, tests.fx('slot'), 'recipe', tests.fx('recipe'), tests.fx('enrico'));
insert into public.shopping_items (id, household_id, article_id) values (tests.fx('item'), tests.fx('wg'), tests.fx('article'));
insert into public.shopping_contributions (household_id, item_id) values (tests.fx('wg'), tests.fx('item'));
insert into public.packing_bags (id, household_id, name, member_id) values (tests.fx('bag'), tests.fx('wg'), 'Kulturbeutel', tests.fx('enrico'));
insert into public.packing_bag_items (id, household_id, bag_id, name) values (tests.fx('bag_item'), tests.fx('wg'), tests.fx('bag'), 'Zahnbürste');
insert into public.packing_list_bags (id, household_id, trip_id, bag_id, name, member_id)
values (tests.fx('list_bag'), tests.fx('wg'), tests.fx('trip'), tests.fx('bag'), 'Kulturbeutel', tests.fx('enrico'));
insert into public.packing_items (id, household_id, list_bag_id, name)
values (tests.fx('packing_item'), tests.fx('wg'), tests.fx('list_bag'), 'Zahnbürste');
insert into public.household_invitations (household_id, email, invited_by) values (tests.fx('wg'), 'tom@example.com', tests.fx('enrico'));
insert into private.deletions (household_id, kind, target_id, deleted_by, snapshot)
values (tests.fx('wg'), 'recipe', gen_random_uuid(), tests.fx('enrico'), '{}');
insert into public.deleted_records (household_id, table_name, record_id) values (tests.fx('wg'), 'recipes', gen_random_uuid());
-- The same in "Kuschelnest", which must stay.
insert into public.recipes (household_id, title) values (tests.fx('home'), 'Mango-Curry');

select is(
  (select array_agg(t order by t) from tests.household_row_counts(tests.fx('wg')) where n = 0),
  null,
  'AC-019: the fixture fills every table with household data (a new table must be added here)');

-- Photos: one an activity has, a recipe's, a restaurant's (spec 0024), and one in a sub-folder the
-- storage policies do not know.
insert into storage.objects (bucket_id, name) values
  ('household-media', tests.fx('wg') || '/activities/' || tests.fx('activity') || '/' || gen_random_uuid() || '.jpg'),
  ('household-media', tests.fx('wg') || '/recipes/' || tests.fx('recipe') || '/' || gen_random_uuid() || '.jpg'),
  ('household-media', tests.fx('wg') || '/restaurants/' || tests.fx('restaurant') || '/' || gen_random_uuid() || '.jpg'),
  ('household-media', tests.fx('wg') || '/notes/' || tests.fx('restaurant') || '/' || gen_random_uuid() || '.jpg'),
  ('household-media', tests.fx('home') || '/recipes/' || gen_random_uuid() || '/' || gen_random_uuid() || '.jpg');

select tests.clear_authentication();
insert into public.household_invitations (household_id, email, invited_by)
values (tests.fx('wg'), 'mia@example.com', tests.fx('enrico'));
select tests.authenticate_as(tests.fx('enrico'));
select is(
  (select count(*)::int from public.begin_household_deletion(tests.fx('wg'))),
  3,
  'REQ-005: begin_household_deletion lists the photos Enrico may delete (activities, recipes, restaurants)');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.household_invitations where household_id = tests.fx('wg')),
  0,
  'AC-022: listing the photos for deletion drops the open invitations, so nobody joins while they go');
select tests.authenticate_as(tests.fx('enrico'));
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(format('select * from public.begin_household_deletion(%L)', tests.fx('wg')),
  '42501', 'not_member', 'AC-021: Ben lists no photo of "WG Köln" (not_member)');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(format('select public.delete_household(%L)', tests.fx('wg')),
  'P0001', 'media_remaining', 'AC-021: while photos are stored: media_remaining');
-- AC-023: part of the photos is gone (network lost), the database step is refused again.
select is(
  tests.affected(format($$ delete from storage.objects where bucket_id = 'household-media' and name like %L $$,
                        tests.fx('wg') || '/activities/%')),
  1, 'AC-023: the app deleted one photo before the network broke');
select throws_ok(format('select public.delete_household(%L)', tests.fx('wg')),
  'P0001', 'media_remaining', 'AC-023: the household stays while photos remain');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.recipes where household_id = tests.fx('wg')),
  2, 'AC-023: "WG Köln" is still there with all rows');
select is(
  (select count(*)::int from public.households where id = tests.fx('wg')),
  1, 'AC-023: the household row exists');

-- The second attempt removes the rest; a sub-folder the member cannot list still blocks.
select tests.authenticate_as(tests.fx('enrico'));
select is(
  tests.affected(format($$ delete from storage.objects where bucket_id = 'household-media' and name like %L $$,
                        tests.fx('wg') || '/%')),
  2, 'AC-023: the second attempt deletes the remaining photos the app lists');
select throws_ok(format('select public.delete_household(%L)', tests.fx('wg')),
  'P0001', 'media_remaining', 'REQ-005: a photo in any other sub-folder of the household still blocks');
select tests.clear_authentication();
delete from storage.objects where bucket_id = 'household-media' and name like tests.fx('wg') || '/notes/%';

select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(format('select public.delete_household(%L)', tests.fx('wg')),
  'AC-019: the last member deletes "WG Köln"');
select tests.clear_authentication();
select is(
  (select array_agg(t order by t) from tests.household_row_counts(tests.fx('wg')) where n > 0),
  null,
  'AC-019: no table holds a row of "WG Köln" any more, not even deleted_records');
select is((select count(*)::int from public.households where id = tests.fx('wg')), 0,
  'AC-019: the household row is gone');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'household-media' and name like tests.fx('wg') || '/%'),
  0, 'AC-019: no object under its photo folder');
select is(
  (select count(*)::int from public.household_invitations where email = 'tom@example.com'),
  0, 'AC-020: the invitation to Tom expired with the household');
select ok(not pg_temp.admits('tom@example.com'),
  'AC-020: no invitation lets Tom in any more');
select ok(
  exists (select 1 from public.profiles where id = tests.fx('enrico'))
  and (select count(*) from public.recipes where household_id = tests.fx('home')) = 1
  and exists (select 1 from storage.objects where bucket_id = 'household-media' and name like tests.fx('home') || '/%'),
  'AC-020: account, profile and the other household with its photos stay');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(format('select public.delete_household(%L)', tests.fx('wg')),
  '42501', 'not_member', 'AC-021: a repeated call after deleting is not_member');
select tests.clear_authentication();

-- ===================== REQ-006: feedback only for its author =====================
insert into fx (key) values ('fb_enrico'), ('fb_nadja'), ('fb_accepted');
insert into public.feedback (id, household_id, kind, text, author_id) values
  (tests.fx('fb_enrico'), tests.fx('home'), 'idea', 'Einkaufsliste nach Markt sortieren', tests.fx('enrico')),
  (tests.fx('fb_nadja'), tests.fx('home'), 'problem', 'Knopf zu klein', tests.fx('nadja'));
insert into public.feedback (id, household_id, kind, text, author_id, status) values
  (tests.fx('fb_accepted'), tests.fx('home'), 'idea', 'Dunkler Modus', tests.fx('enrico'), 'accepted');
insert into public.feedback_votes (household_id, feedback_id, member_id) values (tests.fx('home'), tests.fx('fb_enrico'), tests.fx('nadja'));

select tests.authenticate_as(tests.fx('enrico'));
select is(
  tests.affected(format($$ update public.feedback set text = 'Einkaufsliste nach Laufreihenfolge sortieren' where id = %L $$,
                        tests.fx('fb_enrico'))),
  1, 'AC-025: Enrico changes the text of his new entry');
select results_eq(
  format($$ select kind, text, status, (select count(*)::int from public.feedback_votes where feedback_id = %1$L)
            from public.feedback where id = %1$L $$, tests.fx('fb_enrico')),
  $$ values ('idea', 'Einkaufsliste nach Laufreihenfolge sortieren', 'new', 1) $$,
  'AC-025: kind, status and the "+1" stay');
select throws_ok(
  format($$ update public.feedback set text = ' ' where id = %L $$, tests.fx('fb_enrico')),
  '23514', null, 'AC-025: an empty text cannot be saved');
select throws_ok(format($$ update public.feedback set status = 'done' where id = %L $$, tests.fx('fb_enrico')),
  '42501', null, 'AC-027: not even the author sets the status');
select throws_ok(format($$ update public.feedback set reason = 'x' where id = %L $$, tests.fx('fb_enrico')),
  '42501', null, 'AC-027: … or the reason');
select throws_ok(format($$ update public.feedback set spec_ref = '0027' where id = %L $$, tests.fx('fb_enrico')),
  '42501', null, 'AC-027: … or the spec reference');
select throws_ok(
  format($$ insert into public.feedback (household_id, kind, text, status) values (%L, 'idea', 'x', 'done') $$, tests.fx('home')),
  '42501', null, 'AC-027: a new entry cannot bring its own status');
select is(
  tests.affected(format($$ update public.feedback set text = 'Gekapert' where id = %L $$, tests.fx('fb_nadja'))),
  0, 'AC-027: Enrico cannot change Nadja''s entry');
select is(
  tests.affected(format($$ delete from public.feedback where id = %L $$, tests.fx('fb_nadja'))),
  0, 'AC-027: … nor delete it');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'feedback', 'id', tests.fx('fb_nadja'), 'changes', '{"text": "Gekapert"}'::jsonb))),
  'P0002', 'row_not_found', 'AC-027: apply_changes finds no own entry to patch');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'feedback', 'id', tests.fx('fb_enrico'), 'changes', '{"status": "done"}'::jsonb))),
  '22023', 'invalid_change', 'AC-027: apply_changes does not patch the status');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'feedback', 'row',
    jsonb_build_object('id', gen_random_uuid(), 'kind', 'idea', 'text', 'x', 'status', 'done')))),
  '22023', 'invalid_change', 'AC-027: apply_changes does not insert a status');
select is(
  tests.affected(format($$ update public.feedback set text = 'Heller Modus' where id = %L $$, tests.fx('fb_accepted'))),
  0, 'AC-027: the text of an accepted entry stays');
select is(
  tests.affected(format($$ delete from public.feedback where id = %L $$, tests.fx('fb_accepted'))),
  1, 'AC-027: the author deletes his accepted entry');
select is(
  tests.affected(format($$ delete from public.feedback where id = %L $$, tests.fx('fb_enrico'))),
  1, 'AC-026: Enrico deletes his entry');
select tests.authenticate_as(tests.fx('nadja'));
select is(
  (select count(*)::int from public.feedback_votes where feedback_id = tests.fx('fb_enrico')),
  0, 'AC-026: Nadja''s "+1" went with it');
select is(
  (select count(*)::int from public.deleted_records where table_name = 'feedback' and record_id = tests.fx('fb_enrico')::text),
  1, 'AC-026: Nadja''s devices drop it after the next sync');
select tests.authenticate_as(tests.fx('ben'));
select is(
  tests.affected(format($$ update public.feedback set text = 'x' where id = %L $$, tests.fx('fb_nadja'))),
  0, 'AC-027: a member of another household changes nothing');
select tests.authenticate_as_anon();
select throws_ok(format($$ update public.feedback set text = 'x' where id = %L $$, tests.fx('fb_nadja')),
  '42501', null, 'AC-027: signed out every change is refused');
select throws_ok(format($$ delete from public.feedback where id = %L $$, tests.fx('fb_nadja')),
  '42501', null, 'AC-027: … also deleting');

select * from finish();
rollback;
