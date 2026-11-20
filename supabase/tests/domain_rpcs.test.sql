-- Per-person rows (spec 0003, T3): favourites, ratings and feedback votes are written only by the
-- set_* RPCs, always for the caller; feedback.author_id is the caller and cannot be changed.
begin;
\ir _helpers.psql
select plan(32);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

insert into fx (key, id) values
  ('anna', tests.create_user('anna@example.com', 'Anna')),
  ('carla', tests.create_user('carla@example.com', 'Carla')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('A', array[tests.fx('anna'), tests.fx('carla')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')]));
insert into fx (key) values ('recipe_a'), ('restaurant_a'), ('feedback_a');

insert into public.recipes (id, household_id, title, servings, course)
values (tests.fx('recipe_a'), tests.fx('home_a'), 'Dal', 2, 'main');
insert into public.restaurants (id, household_id, name)
values (tests.fx('restaurant_a'), tests.fx('home_a'), 'Roma');
insert into public.feedback (id, household_id, kind, text, author_id)
values (tests.fx('feedback_a'), tests.fx('home_a'), 'idea', 'Dunkler Modus', tests.fx('carla'));

-- ===================== Recipe favourites and ratings =====================
select tests.authenticate_as(tests.fx('anna'));
select lives_ok(
  format($$ select public.set_recipe_favorite(%L, true) $$, tests.fx('recipe_a')),
  'T3 set_recipe_favorite: a member marks a recipe as favourite');
select lives_ok(
  format($$ select public.set_recipe_favorite(%L, true) $$, tests.fx('recipe_a')),
  'T3 set_recipe_favorite: marking it again is harmless');
select results_eq(
  'select household_id, recipe_id, member_id from public.recipe_favorites',
  format($$ values (%L::uuid, %L::uuid, %L::uuid) $$, tests.fx('home_a'), tests.fx('recipe_a'), tests.fx('anna')),
  'T3 set_recipe_favorite: the favourite belongs to the caller and the recipe''s household');
select public.set_recipe_rating(tests.fx('recipe_a'), 4::smallint);
select public.set_recipe_rating(tests.fx('recipe_a'), 5::smallint);
select results_eq(
  'select member_id, stars from public.recipe_ratings',
  format($$ values (%L::uuid, 5::smallint) $$, tests.fx('anna')),
  'T3 set_recipe_rating: rating again replaces the caller''s stars');
select throws_ok(
  format($$ select public.set_recipe_rating(%L, 6::smallint) $$, tests.fx('recipe_a')),
  '22023', 'invalid_stars', 'T3 set_recipe_rating: more than 5 stars are rejected');
select throws_ok(
  format($$ select public.set_recipe_rating(%L, 0::smallint) $$, tests.fx('recipe_a')),
  '22023', 'invalid_stars', 'T3 set_recipe_rating: 0 stars are rejected');

select tests.authenticate_as(tests.fx('carla'));
select public.set_recipe_rating(tests.fx('recipe_a'), 2::smallint);
select results_eq(
  'select member_id, stars from public.recipe_ratings order by stars',
  format($$ values (%L::uuid, 2::smallint), (%L::uuid, 5::smallint) $$, tests.fx('carla'), tests.fx('anna')),
  'T3 set_recipe_rating: ratings are kept per person');
select public.set_recipe_rating(tests.fx('recipe_a'), null);
select public.set_recipe_favorite(tests.fx('recipe_a'), false);
select results_eq(
  'select member_id from public.recipe_ratings',
  format($$ values (%L::uuid) $$, tests.fx('anna')),
  'T3 set_recipe_rating: null removes only the caller''s rating');
select is(
  (select count(*)::int from public.recipe_favorites), 1,
  'T3 set_recipe_favorite: false removes only the caller''s favourite (Carla had none)');
select throws_ok(
  format($$ update public.recipe_ratings set stars = 1 where member_id = %L $$, tests.fx('anna')),
  '42501', null, 'T3 recipe_ratings: a member cannot change someone else''s rating directly');

select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format($$ select public.set_recipe_favorite(%L, true) $$, tests.fx('recipe_a')),
  'P0002', 'recipe_not_found', 'AC-011 set_recipe_favorite: a recipe of another household is not found');
select throws_ok(
  format($$ select public.set_recipe_rating(%L, 1::smallint) $$, tests.fx('recipe_a')),
  'P0002', 'recipe_not_found', 'AC-011 set_recipe_rating: a recipe of another household is not found');
select tests.authenticate_as_anon();
select throws_ok(
  format($$ select public.set_recipe_favorite(%L, true) $$, tests.fx('recipe_a')),
  '42501', null, 'AC-005 set_recipe_favorite: anon cannot call it');
select throws_ok(
  format($$ select public.set_recipe_rating(%L, 1::smallint) $$, tests.fx('recipe_a')),
  '42501', null, 'AC-005 set_recipe_rating: anon cannot call it');

select tests.authenticate_as(tests.fx('anna'));
select results_eq(
  $$ select table_name, record_id from public.deleted_records order by table_name $$,
  format($$ values ('recipe_ratings', %L) $$, tests.fx('recipe_a') || ':' || tests.fx('carla')),
  'AC-015 recipe_ratings: removing a rating leaves a tombstone keyed recipe_id:member_id');
select tests.authenticate_as(tests.fx('ben'));
select is(
  (select count(*)::int from public.deleted_records), 0,
  'AC-011 recipe_ratings: a member of another household does not see the tombstone');

-- ===================== Restaurant favourites and ratings =====================
select tests.authenticate_as(tests.fx('anna'));
select public.set_restaurant_favorite(tests.fx('restaurant_a'), true);
select public.set_restaurant_rating(tests.fx('restaurant_a'), 3::smallint);
select results_eq(
  $$ select f.member_id, r.member_id, r.stars from public.restaurant_favorites f, public.restaurant_ratings r $$,
  format($$ values (%L::uuid, %L::uuid, 3::smallint) $$, tests.fx('anna'), tests.fx('anna')),
  'T3 set_restaurant_favorite / set_restaurant_rating: written for the caller');
select throws_ok(
  format($$ select public.set_restaurant_rating(%L, 9::smallint) $$, tests.fx('restaurant_a')),
  '22023', 'invalid_stars', 'T3 set_restaurant_rating: more than 5 stars are rejected');
select public.set_restaurant_favorite(tests.fx('restaurant_a'), false);
select public.set_restaurant_rating(tests.fx('restaurant_a'), null);
select results_eq(
  $$ select table_name, record_id from public.deleted_records
     where table_name like 'restaurant%' order by table_name $$,
  format($$ values ('restaurant_favorites', %1$L), ('restaurant_ratings', %1$L) $$,
         tests.fx('restaurant_a') || ':' || tests.fx('anna')),
  'AC-015 restaurant_*: removing a favourite or rating leaves tombstones keyed restaurant_id:member_id');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format($$ select public.set_restaurant_favorite(%L, true) $$, tests.fx('restaurant_a')),
  'P0002', 'restaurant_not_found', 'AC-011 set_restaurant_favorite: a restaurant of another household is not found');
select throws_ok(
  format($$ select public.set_restaurant_rating(%L, 2::smallint) $$, tests.fx('restaurant_a')),
  'P0002', 'restaurant_not_found', 'AC-011 set_restaurant_rating: a restaurant of another household is not found');

-- ===================== Feedback and votes =====================
select tests.authenticate_as(tests.fx('anna'));
insert into public.feedback (household_id, kind, text, author_id)
values (tests.fx('home_a'), 'problem', 'Knopf zu klein', tests.fx('carla'));
select results_eq(
  $$ select author_id, status from public.feedback where text = 'Knopf zu klein' $$,
  format($$ values (%L::uuid, 'new') $$, tests.fx('anna')),
  'T3 feedback: author_id is the caller, whatever the client sends, and status starts as new');
select throws_ok(
  format($$ update public.feedback set author_id = %L where text = 'Knopf zu klein' $$, tests.fx('carla')),
  '42501', null, 'T3 feedback: author_id cannot be changed');
select lives_ok(
  $$ update public.feedback set status = 'accepted', reason = 'Kommt in Spec 0004' where text = 'Knopf zu klein' $$,
  'T3 feedback: a member sets status and reason');

select public.set_feedback_vote(tests.fx('feedback_a'), true);
select public.set_feedback_vote(tests.fx('feedback_a'), true);
select results_eq(
  'select feedback_id, member_id from public.feedback_votes',
  format($$ values (%L::uuid, %L::uuid) $$, tests.fx('feedback_a'), tests.fx('anna')),
  'T3 set_feedback_vote: one vote per person, written for the caller');
select public.set_feedback_vote(tests.fx('feedback_a'), false);
select is(
  (select count(*)::int from public.feedback_votes), 0,
  'T3 set_feedback_vote: false takes the vote back');
select is(
  (select count(*)::int from public.deleted_records
   where table_name = 'feedback_votes' and record_id = tests.fx('feedback_a') || ':' || tests.fx('anna')),
  1,
  'AC-015 feedback_votes: taking a vote back leaves a tombstone keyed feedback_id:member_id');
select throws_ok(
  format($$ insert into public.feedback_votes (household_id, feedback_id, member_id) values (%L, %L, %L) $$,
         tests.fx('home_a'), tests.fx('feedback_a'), tests.fx('carla')),
  '42501', null, 'T3 feedback_votes: nobody votes for someone else directly');

select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format($$ select public.set_feedback_vote(%L, true) $$, tests.fx('feedback_a')),
  'P0002', 'feedback_not_found', 'AC-011 set_feedback_vote: feedback of another household is not found');
select throws_ok(
  format($$ insert into public.feedback (household_id, kind, text) values (%L, 'idea', 'X') $$, tests.fx('home_a')),
  '42501', null, 'AC-011 feedback: a member of another household cannot write feedback there');
select tests.authenticate_as_anon();
select throws_ok(
  format($$ select public.set_feedback_vote(%L, true) $$, tests.fx('feedback_a')),
  '42501', null, 'AC-005 set_feedback_vote: anon cannot call it');

-- Deleting the parent removes the per-person rows and leaves their tombstones.
select tests.authenticate_as(tests.fx('anna'));
select public.set_recipe_favorite(tests.fx('recipe_a'), true);
delete from public.recipes where id = tests.fx('recipe_a');
select is(
  (select count(*)::int from public.deleted_records where table_name in ('recipe_favorites', 'recipe_ratings')
     and record_id = tests.fx('recipe_a') || ':' || tests.fx('anna')),
  2,
  'AC-015 recipes: deleting a recipe removes its favourites and ratings and leaves their tombstones');

select * from finish();
rollback;
