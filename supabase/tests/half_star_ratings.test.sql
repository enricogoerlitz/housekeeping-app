-- Ratings in half steps (spec 0011, REQ-004): recipes, restaurants and activities store 0.5 to 5
-- stars in steps of 0.5; whole seed values read unchanged (AC-025); anything else is rejected
-- before it could be rounded, and the old value stays (AC-026); confirming the same value again
-- counts as rating (updated_at rises, Offene Frage 7); only the caller's own rating, only in her
-- household (AC-027).
begin;
\ir _helpers.psql
select plan(64);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('A', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')]));
insert into fx (key) values ('recipe'), ('restaurant'), ('activity');

insert into public.recipes (id, household_id, title, servings, course)
values (tests.fx('recipe'), tests.fx('home_a'), 'Mango-Curry', 2, 'main');
insert into public.restaurants (id, household_id, name)
values (tests.fx('restaurant'), tests.fx('home_a'), 'Trattoria Da Enzo');
insert into public.activities (id, household_id, name, name_key)
values (tests.fx('activity'), tests.fx('home_a'), 'Bouldern', 'bouldern');

-- The rating suite for one kind (recipe, restaurant, activity): table <kind>_ratings, RPC
-- set_<kind>_rating(<kind>_id, stars), error <kind>_not_found. Returns 20 results; call as postgres.
create function tests.half_star_suite(p_kind text, p_target uuid, p_enrico uuid, p_nadja uuid, p_ben uuid)
returns setof text
language plpgsql
as $$
declare
  v_table text := format('public.%I', p_kind || '_ratings');
  v_column text := p_kind || '_id';
  v_set text := format('select public.%I(%L, %%s)', 'set_' || p_kind || '_rating', p_target);
  v_stars text := format('select stars from %s where %I = %L and member_id = %%L', v_table, v_column, p_target);
  v_invalid text;
begin
  perform tests.authenticate_as(p_enrico);
  execute format(v_set, '4.5');
  return next is((select r from tests.scalar_numeric(format(v_stars, p_enrico)) r), 4.5,
    format('AC-017 set_%s_rating: 4.5 stars are stored', p_kind));
  execute format(v_set, '0.5');
  return next is((select r from tests.scalar_numeric(format(v_stars, p_enrico)) r), 0.5,
    format('AC-026 set_%s_rating: 0.5 stars are the lowest rating', p_kind));
  execute format(v_set, '4');
  return next is((select r from tests.scalar_numeric(format(v_stars, p_enrico)) r), 4.0,
    format('AC-025 set_%s_rating: a whole value is stored as it is (4 = 4.0)', p_kind));

  foreach v_invalid in array array['4.3', '4.25', '0', '5.5', '-1', $q$'NaN'::numeric$q$, $q$'Infinity'::numeric$q$] loop
    return next throws_ok(format(v_set, v_invalid), '22023', 'invalid_stars',
      format('AC-026 set_%s_rating: %s stars are rejected, not rounded', p_kind, v_invalid));
  end loop;
  return next is((select r from tests.scalar_numeric(format(v_stars, p_enrico)) r), 4.0,
    format('AC-026 set_%s_rating: after the rejected values the old rating stays', p_kind));

  -- Same value again: the row is written, so updated_at rises (Offene Frage 7).
  perform tests.clear_authentication();
  execute format('alter table %s disable trigger %I', v_table, p_kind || '_ratings_set_timestamps');
  execute format('update %s set updated_at = %L where %I = %L', v_table, '2026-01-01T00:00:00Z', v_column, p_target);
  execute format('alter table %s enable trigger %I', v_table, p_kind || '_ratings_set_timestamps');
  perform tests.authenticate_as(p_enrico);
  execute format(v_set, '4');
  return next ok(
    (select r from tests.scalar_bool(format('select updated_at > %L from %s where %I = %L and member_id = %L',
                                            '2026-01-01T00:00:00Z', v_table, v_column, p_target, p_enrico)) r),
    format('Offene Frage 7 set_%s_rating: confirming the same value again raises updated_at', p_kind));

  -- Only the own rating (AC-027).
  perform tests.authenticate_as(p_nadja);
  execute format(v_set, '5');
  perform tests.authenticate_as(p_enrico);
  return next throws_ok(
    format('update %s set stars = 1 where member_id = %L', v_table, p_nadja), '42501', null,
    format('AC-027 %s_ratings: Enrico cannot change Nadja''s rating directly', p_kind));
  return next throws_ok(
    format('insert into %s (household_id, %I, member_id, stars) select household_id, %I, %L, 1 from %s limit 1',
           v_table, v_column, v_column, p_nadja, v_table), '42501', null,
    format('AC-027 %s_ratings: Enrico cannot write a rating in Nadja''s name', p_kind));
  return next throws_ok(
    format('delete from %s where member_id = %L', v_table, p_nadja), '42501', null,
    format('AC-027 %s_ratings: Enrico cannot delete Nadja''s rating', p_kind));
  execute format(v_set, '3.5');
  return next is((select r from tests.scalar_numeric(format(v_stars, p_nadja)) r), 5.0,
    format('AC-027 set_%s_rating: the RPC changes only the caller''s rating, Nadja''s 5 stay', p_kind));

  -- Another household and signed out (AC-027).
  perform tests.authenticate_as(p_ben);
  return next throws_ok(format(v_set, '4.5'), 'P0002', p_kind || '_not_found',
    format('AC-027 set_%s_rating: a member of another household cannot rate', p_kind));
  return next is(
    tests.affected(format('select 1 from %s where %I = %L', v_table, v_column, p_target)), 0,
    format('AC-027 %s_ratings: a member of another household reads no rating', p_kind));
  perform tests.authenticate_as_anon();
  return next throws_ok(format(v_set, '4.5'), '42501', null,
    format('AC-027 set_%s_rating: anon cannot rate', p_kind));
  return next throws_ok(format('select stars from %s', v_table), '42501', null,
    format('AC-027 %s_ratings: anon cannot read ratings', p_kind));

  perform tests.clear_authentication();
end
$$;

-- One value from a query, run as the current role.
create function tests.scalar_numeric(p_sql text) returns numeric language plpgsql
as $$ declare v numeric; begin execute p_sql into v; return v; end $$;
create function tests.scalar_bool(p_sql text) returns boolean language plpgsql
as $$ declare v boolean; begin execute p_sql into v; return v; end $$;
grant execute on all functions in schema tests to anon, authenticated;

-- ===================== AC-025: whole seed ratings read unchanged =====================
-- The local seed (supabase/seed.sql) holds only whole ratings; they read as the same number.
select ok(
  (select count(*) > 0 and bool_and(stars = trunc(stars) and to_jsonb(stars) = to_jsonb(trunc(stars)::int))
   from public.recipe_ratings),
  'AC-025 recipe_ratings: the whole seed ratings read unchanged (4 = 4.0)');
select ok(
  (select count(*) > 0 and bool_and(stars = trunc(stars) and to_jsonb(stars) = to_jsonb(trunc(stars)::int))
   from public.restaurant_ratings),
  'AC-025 restaurant_ratings: the whole seed ratings read unchanged');
select ok(
  (select count(*) > 0 and bool_and(stars = trunc(stars) and to_jsonb(stars) = to_jsonb(trunc(stars)::int))
   from public.activity_ratings),
  'AC-025 activity_ratings: the whole seed ratings read unchanged');

-- ===================== The column itself =====================
select throws_ok(
  format($$ insert into public.recipe_ratings (household_id, recipe_id, member_id, stars) values (%L, %L, %L, 4.3) $$,
         tests.fx('home_a'), tests.fx('recipe'), tests.fx('enrico')),
  '23514', null, 'AC-026 recipe_ratings: the column check rejects 4.3 even without the RPC');

-- ===================== Per kind =====================
select * from tests.half_star_suite('recipe', tests.fx('recipe'), tests.fx('enrico'), tests.fx('nadja'), tests.fx('ben'));
select * from tests.half_star_suite('restaurant', tests.fx('restaurant'), tests.fx('enrico'), tests.fx('nadja'), tests.fx('ben'));
select * from tests.half_star_suite('activity', tests.fx('activity'), tests.fx('enrico'), tests.fx('nadja'), tests.fx('ben'));

select * from finish();
rollback;
