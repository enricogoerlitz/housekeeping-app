-- sync_pull (spec 0003, T6): the delta sync read path. Security invoker, so RLS decides what
-- reaches a device: only the caller's households, tombstones of those households after the
-- cursor, small tables in full. Shape = core PullResult (packages/core/src/sync-delta.ts).
begin;
\ir _helpers.psql
select plan(37);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- A request for the given households: full, or a delta with the given since map.
create function tests.pull_full(variadic p_households text[]) returns jsonb language sql
as $$
  select public.sync_pull(jsonb_build_object('households',
    (select jsonb_object_agg(tests.fx(h), '{"full": true}'::jsonb) from unnest(p_households) h)))
$$;
create function tests.pull_since(p_household text, p_since jsonb) returns jsonb language sql
as $$
  select public.sync_pull(jsonb_build_object('households',
    jsonb_build_object(tests.fx(p_household), jsonb_build_object('full', false, 'since', p_since))))
$$;
grant execute on function tests.pull_full(text[]) to anon, authenticated;
grant execute on function tests.pull_since(text, jsonb) to anon, authenticated;

-- Pull results kept for several assertions (created here: the API roles cannot create tables).
create temp table pulled (r jsonb) on commit drop;
create temp table pulled_ines (r jsonb) on commit drop;
create temp table pulled_nadja (r jsonb) on commit drop;
grant select, insert on pulled, pulled_ines, pulled_nadja to authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben')),
  ('ines', tests.create_user('ines@example.com', 'Ines'));
insert into fx (key, id) values
  ('home_a', tests.create_household('A', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')])),
  ('home_c', tests.create_household('C', array[tests.fx('ines')]));
insert into public.household_invitations (household_id, email, invited_by)
values (tests.fx('home_a'), 'ines@example.com', tests.fx('enrico'));
insert into fx (key) values ('area_old'), ('area_new'), ('area_b'), ('recipe_a'), ('article_a');

insert into public.areas (id, household_id, name) values
  (tests.fx('area_old'), tests.fx('home_a'), 'Alt'),
  (tests.fx('area_new'), tests.fx('home_a'), 'Neu'),
  (tests.fx('area_b'), tests.fx('home_b'), 'Fremd');
insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('article_a'), tests.fx('home_a'), 'Milch', 'milch');
insert into public.recipes (id, household_id, title) values (tests.fx('recipe_a'), tests.fx('home_a'), 'Dal');
insert into public.recipe_favorites (household_id, recipe_id, member_id)
values (tests.fx('home_a'), tests.fx('recipe_a'), tests.fx('nadja'));
-- One area changed long ago (the trigger always sets now(), so it is bypassed for the fixture).
alter table public.areas disable trigger areas_set_timestamps;
update public.areas set updated_at = '2026-01-01T00:00:00Z' where id = tests.fx('area_old');
alter table public.areas enable trigger areas_set_timestamps;
insert into public.deleted_records (household_id, table_name, record_id, deleted_at) values
  (tests.fx('home_a'), 'areas', 'gone-old', '2026-01-01T00:00:00Z'),
  (tests.fx('home_a'), 'areas', 'gone-new', now()),
  (tests.fx('home_a'), 'recipe_favorites', 'r:m', now()),
  (tests.fx('home_a'), 'household_members', 'someone', now()),
  (tests.fx('home_b'), 'areas', 'gone-b', now());

-- ===================== Full pull =====================
select tests.authenticate_as(tests.fx('enrico'));
insert into pulled select tests.pull_full('home_a', 'home_b');

select is(
  (select (r ->> 'serverTime')::timestamptz from pulled), now(),
  'T6 sync_pull: serverTime is the server''s time');
select is(
  (select array_agg(k order by k) from pulled, jsonb_object_keys(r -> 'households') k),
  array[tests.fx('home_a')::text],
  'AC-011 sync_pull: a household the caller is not a member of is ignored');
select is(
  (select r -> 'households' -> tests.fx('home_a')::text ->> 'full' from pulled), 'true',
  'T6 sync_pull: a full request is answered as full');
select is(
  (select array_agg(k order by k) from pulled, jsonb_object_keys(r -> 'households' -> tests.fx('home_a')::text -> 'rows') k),
  array['activities', 'activity_favorites', 'activity_kinds', 'activity_ratings', 'activity_series',
        'activity_series_exceptions', 'areas', 'articles', 'chore_events', 'chores',
        'collection_recipes', 'feedback', 'feedback_votes', 'meal_plan_entries', 'notification_settings',
        'packing_bag_items', 'packing_bags', 'packing_items', 'packing_list_bags',
        'recipe_favorites', 'recipe_ratings', 'recipes', 'recurring_items', 'restaurant_favorites', 'restaurant_ratings',
        'restaurants',
        'shopping_contributions', 'shopping_items', 'stores', 'trip_members', 'trips'],
  'T6 sync_pull: every synced household table is answered');
select ok(
  (select not (r -> 'households' -> tests.fx('home_a')::text -> 'rows' ? 'shopping_lists')
          and not exists (select 1 from jsonb_array_elements(r -> 'small' -> 'households') h where h ? 'default_list_id')
   from pulled),
  'ADR-0012 sync_pull: no shopping_lists key and no default_list_id');
select is(
  (select array_agg(e ->> 'name' order by e ->> 'name') from pulled,
          jsonb_array_elements(r -> 'households' -> tests.fx('home_a')::text -> 'rows' -> 'areas') e),
  array['Alt', 'Neu'],
  'T6 sync_pull: a full pull returns all rows of the household and none of another');
select is(
  (select r -> 'households' -> tests.fx('home_a')::text -> 'rows' -> 'articles' -> 0
   from pulled),
  (select to_jsonb(a) from public.articles a where a.id = tests.fx('article_a')),
  'T6 sync_pull: a row is returned with all its columns, as the table has them');
select is(
  (select r -> 'households' -> tests.fx('home_a')::text -> 'rows' -> 'recipe_favorites' from pulled),
  jsonb_build_array(jsonb_build_object(
    'household_id', tests.fx('home_a'), 'recipe_id', tests.fx('recipe_a'), 'member_id', tests.fx('nadja'),
    'created_at', (select created_at from public.recipe_favorites), 'updated_at', (select updated_at from public.recipe_favorites))),
  'T6 sync_pull: composite-key rows are returned as they are (no id column)');
select is(
  (select array_agg(e ->> 'id' order by e ->> 'id') from pulled,
          jsonb_array_elements(r -> 'households' -> tests.fx('home_a')::text -> 'tombstones') e),
  array['gone-new', 'gone-old', 'r:m'],
  'AC-015 sync_pull: a full pull returns the household''s tombstones of synced tables only');
select ok(
  (select jsonb_path_exists(r, '$.households.*.tombstones[*] ? (@.table == "areas" && @.deletedAt.type() == "string")')
   from pulled),
  'T6 sync_pull: tombstones carry table, id and deletedAt');

-- Small tables.
select is(
  (select array_agg(e ->> 'name' order by e ->> 'name') from pulled, jsonb_array_elements(r -> 'small' -> 'profiles') e),
  array['Enrico', 'Nadja'],
  'T6 sync_pull: small.profiles holds the caller and her co-members');
select is(
  (select array_agg(e ->> 'name' order by e ->> 'name') from pulled, jsonb_array_elements(r -> 'small' -> 'households') e),
  array['A'],
  'T6 sync_pull: small.households holds the caller''s households');
select is(
  (select count(*)::int from pulled, jsonb_array_elements(r -> 'small' -> 'household_members') e
   where e ->> 'household_id' = tests.fx('home_a')::text), 2,
  'T6 sync_pull: small.household_members holds the memberships of her households');
select is(
  (select array_agg(e ->> 'email') from pulled, jsonb_array_elements(r -> 'small' -> 'household_invitations') e),
  array['ines@example.com'],
  'T6 sync_pull: small.household_invitations holds her households'' invitations');

-- ===================== Delta pull =====================
select is(
  (select array_agg(e ->> 'name') from jsonb_array_elements(
     tests.pull_since('home_a', jsonb_build_object('areas', '2026-06-01T00:00:00Z'))
       -> 'households' -> tests.fx('home_a')::text -> 'rows' -> 'areas') e),
  array['Neu'],
  'T6 sync_pull: a delta returns only rows changed after since');
select is(
  tests.pull_since('home_a', jsonb_build_object('areas', '2026-06-01T00:00:00Z'))
    -> 'households' -> tests.fx('home_a')::text ->> 'full',
  'false',
  'T6 sync_pull: a delta request is answered as not full');
select is(
  (select array_agg(e ->> 'id' order by e ->> 'id') from jsonb_array_elements(
     tests.pull_since('home_a', jsonb_build_object('areas', '2026-06-01T00:00:00Z', 'recipe_favorites', now()))
       -> 'households' -> tests.fx('home_a')::text -> 'tombstones') e),
  array['gone-new'],
  'AC-015 sync_pull: a delta returns only tombstones after since');
select is(
  jsonb_array_length(tests.pull_since('home_a', jsonb_build_object('areas', '2026-06-01T00:00:00Z'))
    -> 'households' -> tests.fx('home_a')::text -> 'rows' -> 'articles'), 1,
  'T6 sync_pull: a table missing from since is returned in full');
select is(
  (select array_agg(e ->> 'id' order by e ->> 'id') from jsonb_array_elements(
     tests.pull_since('home_a', jsonb_build_object('areas', now()))
       -> 'households' -> tests.fx('home_a')::text -> 'tombstones') e),
  array['r:m'],
  'T6 sync_pull: … including its tombstones');
select is(
  jsonb_array_length(tests.pull_since('home_a', jsonb_build_object('areas', now(), 'articles', now()))
    -> 'households' -> tests.fx('home_a')::text -> 'rows' -> 'areas'), 0,
  'T6 sync_pull: nothing changed → empty arrays');
select throws_ok(
  $$ select public.sync_pull('{"households": []}') $$,
  '22023', 'invalid_request', 'T6 sync_pull: a malformed request is rejected');

-- ===================== Invited, removed, foreign, anon =====================
select tests.authenticate_as(tests.fx('ines'));
insert into pulled_ines select tests.pull_full('home_a', 'home_c');
select is(
  (select array_agg(k) from pulled_ines, jsonb_object_keys(r -> 'households') k),
  array[tests.fx('home_c')::text],
  'T6 sync_pull: an invited household (not yet a member) gets no household data');
select is(
  (select array_agg(e ->> 'name' order by e ->> 'name') from pulled_ines, jsonb_array_elements(r -> 'small' -> 'households') e),
  array['A', 'C'],
  'T6 sync_pull: … it appears in small.households (to accept the invitation) …');
select is(
  (select array_agg(distinct e ->> 'household_id') from pulled_ines, jsonb_array_elements(r -> 'small' -> 'household_members') e),
  array[tests.fx('home_c')::text],
  'T6 sync_pull: … but not in small.household_members');
select is(
  (select array_agg(e ->> 'household_id') from pulled_ines, jsonb_array_elements(r -> 'small' -> 'household_invitations') e),
  array[tests.fx('home_a')::text],
  'T6 sync_pull: … and her open invitation is listed');

-- AC-012: Nadja is removed from A.
select tests.clear_authentication();
delete from public.household_members where household_id = tests.fx('home_a') and profile_id = tests.fx('nadja');
select tests.authenticate_as(tests.fx('nadja'));
insert into pulled_nadja select tests.pull_full('home_a');
select is(
  (select r -> 'households' from pulled_nadja), '{}'::jsonb,
  'AC-012 sync_pull: a removed member gets nothing for the household');
select is(
  (select jsonb_array_length(r -> 'small' -> 'household_members') + jsonb_array_length(r -> 'small' -> 'households')
   from pulled_nadja), 0,
  'AC-012 sync_pull: … and no longer sees it in small.household_members or small.households');

select tests.authenticate_as(tests.fx('ben'));
select is(
  (select array_agg(e ->> 'id') from jsonb_array_elements(
     tests.pull_full('home_b') -> 'households' -> tests.fx('home_b')::text -> 'tombstones') e),
  array['gone-b'],
  'AC-011 sync_pull: tombstones come only from the own household');

-- ===================== Activities (spec 0004) =====================
select tests.clear_authentication();
insert into fx (key) values ('act_a'), ('act_gone'), ('act_b');
insert into public.activities (id, household_id, name, name_key) values
  (tests.fx('act_a'), tests.fx('home_a'), 'Eislaufen', 'eislaufen'),
  (tests.fx('act_gone'), tests.fx('home_a'), 'Kino', 'kino'),
  (tests.fx('act_b'), tests.fx('home_b'), 'Bouldern', 'bouldern');
insert into public.activity_favorites (household_id, activity_id, member_id)
values (tests.fx('home_a'), tests.fx('act_a'), tests.fx('enrico'));
insert into public.activity_ratings (household_id, activity_id, member_id, stars)
values (tests.fx('home_a'), tests.fx('act_a'), tests.fx('enrico'), 4.5);
delete from public.activities where id = tests.fx('act_gone');
delete from public.activity_favorites where activity_id = tests.fx('act_a');

select tests.authenticate_as(tests.fx('enrico'));
select is(
  (select array_agg(e ->> 'name') from jsonb_array_elements(
     tests.pull_full('home_a') -> 'households' -> tests.fx('home_a')::text -> 'rows' -> 'activities') e),
  array['Eislaufen'],
  'AC-004 sync_pull: activities of the household are pulled, none of another household');
select is(
  (select array_agg((e ->> 'member_id') || ':' || (e ->> 'stars')) from jsonb_array_elements(
     tests.pull_full('home_a') -> 'households' -> tests.fx('home_a')::text -> 'rows' -> 'activity_ratings') e),
  array[tests.fx('enrico') || ':4.5'],
  'AC-020 sync_pull: activity ratings are pulled per person, half stars included (spec 0011, AC-017)');
select is(
  jsonb_array_length(tests.pull_full('home_a') -> 'households' -> tests.fx('home_a')::text -> 'rows' -> 'activity_favorites'),
  0,
  'AC-020 sync_pull: activity_favorites is answered (empty after the favourite was removed)');
select is(
  (select array_agg((e ->> 'table') || '/' || (e ->> 'id') order by e ->> 'table') from jsonb_array_elements(
     tests.pull_full('home_a') -> 'households' -> tests.fx('home_a')::text -> 'tombstones') e
   where e ->> 'table' like 'activit%'),
  array['activities/' || tests.fx('act_gone'), 'activity_favorites/' || tests.fx('act_a') || ':' || tests.fx('enrico')],
  'AC-015 sync_pull: deleted activities and favourites arrive as tombstones (composite key activity_id:member_id)');
select is(
  (select jsonb_array_length(r -> 'rows' -> 'activities') + jsonb_array_length(r -> 'rows' -> 'activity_ratings')
          + (select count(*)::int from jsonb_array_elements(r -> 'tombstones') e where e ->> 'table' like 'activit%')
   from (select tests.pull_since('home_a', jsonb_build_object(
           'activities', now(), 'activity_favorites', now(), 'activity_ratings', now()))
           -> 'households' -> tests.fx('home_a')::text as r) x),
  0,
  'T6 sync_pull: a delta after the last change returns no activity rows or tombstones');
select tests.authenticate_as(tests.fx('ben'));
select is(
  (select array_agg(e ->> 'name') from jsonb_array_elements(
     tests.pull_full('home_b') -> 'households' -> tests.fx('home_b')::text -> 'rows' -> 'activities') e),
  array['Bouldern'],
  'AC-012 sync_pull: another household gets only its own activities');

-- Spec 0011: a chore event reaches the device with the state before it (read-only for the client).
select tests.clear_authentication();
insert into fx (key) values ('chore_a'), ('event_a');
insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on)
values (tests.fx('chore_a'), tests.fx('home_a'), 'Bad putzen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
        '{"type": "anyone"}', current_date);
select tests.authenticate_as(tests.fx('enrico'));
select public.apply_changes(tests.fx('home_a'), jsonb_build_array(jsonb_build_object(
  'kind', 'complete_chore', 'completion', jsonb_build_object(
    'chore_id', tests.fx('chore_a'), 'event_id', tests.fx('event_a'), 'kind', 'done', 'done_on', current_date,
    'done_by', tests.fx('enrico'), 'seen', jsonb_build_object('next_due_on', current_date),
    'next_due_on', current_date + 7))));
select is(
  (select e - array['id', 'household_id', 'created_at', 'updated_at'] from jsonb_array_elements(
     tests.pull_full('home_a') -> 'households' -> tests.fx('home_a')::text -> 'rows' -> 'chore_events') e),
  jsonb_build_object('chore_id', tests.fx('chore_a'), 'title', 'Bad putzen', 'kind', 'done', 'done_on', current_date,
                     'done_by', tests.fx('enrico'), 'prev_next_due_on', current_date, 'prev_last_done_on', null,
                     'prev_next_assignee_id', null, 'prev_recorded', true),
  'spec 0011 sync_pull: a chore event is pulled with the recorded state before it');

-- The 2-minute safety window of the delta sync assumes no statement runs longer than 8 s.
select ok(
  (select 'statement_timeout=8s' = any (r.rolconfig) from pg_catalog.pg_roles r where r.rolname = 'authenticated'),
  'T6 sync_pull: statement_timeout for authenticated is 8 s (covered by the safety window)');

select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.sync_pull('{"households": {}}') $$,
  '42501', null, 'AC-005 sync_pull: anon gets nothing');

select * from finish();
rollback;
