-- AI quota (spec 0003, T7): ai_usage counts per person and Berlin day; consume_ai_quota charges
-- it atomically before any paid AI call (AC-030). Limits: 200 requests and 20 speech tokens.
-- ai_usage has RLS on and no grants: only the function touches it.
begin;
\ir _helpers.psql
select plan(21);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- Today in Berlin, the day the quota counts in.
create function tests.berlin_today() returns date language sql stable
as $$ select (now() at time zone 'Europe/Berlin')::date $$;

-- Calls consume_ai_quota p_times times with amount 1; true if every call was allowed.
create function tests.consume_times(p_kind text, p_times int) returns boolean language plpgsql
as $$
declare
  v_all boolean := true;
begin
  for i in 1 .. p_times loop
    v_all := public.consume_ai_quota(p_kind, 1) and v_all;
  end loop;
  return v_all;
end
$$;
grant execute on function tests.consume_times(text, int) to authenticated;

insert into fx (key, id) values
  ('anna', tests.create_user('anna@example.com', 'Anna')),
  ('carla', tests.create_user('carla@example.com', 'Carla')),
  ('dora', tests.create_user('dora@example.com', 'Dora'));

-- ===================== Requests =====================
select tests.authenticate_as(tests.fx('anna'));
select is(public.consume_ai_quota('request', 1), true, 'AC-030 consume_ai_quota: the first request of the day is allowed');
select is(tests.consume_times('request', 199), true, 'AC-030 consume_ai_quota: up to 200 requests a day are allowed');
select is(public.consume_ai_quota('request', 1), false, 'AC-030 consume_ai_quota: the 201st request is refused');
select tests.clear_authentication();
select results_eq(
  format($$ select day, requests, speech_tokens from public.ai_usage where profile_id = %L $$, tests.fx('anna')),
  $$ values (tests.berlin_today(), 200, 0) $$,
  'AC-030 consume_ai_quota: one row per person and Berlin day; a refused call counts nothing');

-- ===================== Speech tokens =====================
select tests.authenticate_as(tests.fx('anna'));
select is(tests.consume_times('speech', 20), true, 'AC-030 consume_ai_quota: up to 20 speech tokens a day are allowed');
select is(public.consume_ai_quota('speech', 1), false, 'AC-030 consume_ai_quota: the 21st speech token is refused');

-- ===================== Atomic: no partial consumption =====================
select tests.authenticate_as(tests.fx('carla'));
select is(public.consume_ai_quota('request', 198), true, 'T7 consume_ai_quota: an amount within the limit is allowed');
select is(public.consume_ai_quota('request', 5), false, 'T7 consume_ai_quota: an amount over the rest of the limit is refused …');
select is(public.consume_ai_quota('request', 2), true, 'T7 consume_ai_quota: … without consuming part of it');
select is(public.consume_ai_quota('speech', 21), false, 'T7 consume_ai_quota: an amount over the whole limit is refused');
select tests.clear_authentication();
select results_eq(
  format($$ select requests, speech_tokens from public.ai_usage where profile_id = %L $$, tests.fx('carla')),
  $$ values (200, 0) $$,
  'T7 consume_ai_quota: Carla has exactly what was allowed');
select results_eq(
  format($$ select requests, speech_tokens from public.ai_usage where profile_id = %L $$, tests.fx('anna')),
  $$ values (200, 20) $$,
  'T7 consume_ai_quota: Carla''s calls did not touch Anna''s row');

-- ===================== Next day =====================
insert into public.ai_usage (profile_id, day, requests, speech_tokens)
values (tests.fx('dora'), tests.berlin_today() - 1, 200, 20);
select tests.authenticate_as(tests.fx('dora'));
select is(public.consume_ai_quota('request', 1), true, 'T7 consume_ai_quota: a new day starts fresh (requests)');
select is(public.consume_ai_quota('speech', 1), true, 'T7 consume_ai_quota: a new day starts fresh (speech)');

-- ===================== Invalid input =====================
select throws_ok($$ select public.consume_ai_quota('image', 1) $$, '22023', 'invalid_kind',
  'T7 consume_ai_quota: an unknown kind is rejected');
select throws_ok($$ select public.consume_ai_quota(null, 1) $$, '22023', 'invalid_kind',
  'T7 consume_ai_quota: a missing kind is rejected');
select throws_ok($$ select public.consume_ai_quota('request', 0) $$, '22023', 'invalid_amount',
  'T7 consume_ai_quota: amount 0 is rejected');
select throws_ok($$ select public.consume_ai_quota('request', -5) $$, '22023', 'invalid_amount',
  'T7 consume_ai_quota: a negative amount is rejected (it would refill the quota)');

-- ===================== Own row only, no direct access, anon =====================
select throws_ok($$ select * from public.ai_usage $$, '42501', null,
  'T7 ai_usage: a member cannot read the table directly');
select throws_ok(
  format($$ update public.ai_usage set requests = 0 where profile_id = %L $$, tests.fx('dora')),
  '42501', null, 'T7 ai_usage: a member cannot reset her counter directly');
select tests.authenticate_as_anon();
select throws_ok($$ select public.consume_ai_quota('request', 1) $$, '42501', null,
  'AC-005 consume_ai_quota: anon cannot call it');

select * from finish();
rollback;
