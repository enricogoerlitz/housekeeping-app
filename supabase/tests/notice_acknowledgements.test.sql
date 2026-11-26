-- Spec 0051 — Mitteilungen in der App statt Push. Web Push is gone (AC-001, AC-002); the
-- acknowledgements of the in-app notices live in the member's own row of notification_settings and
-- change only through acknowledge_notices (AC-022 to AC-025, Decisions 7 and 8).
begin;
\ir _helpers.psql
select plan(33);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- Today and a day relative to it on the household's clock (Europe/Berlin), as the RPC sees it.
create function tests.day(p_offset int default 0) returns text language sql stable
as $$ select to_char((now() at time zone 'Europe/Berlin')::date + p_offset, 'YYYY-MM-DD') $$;
grant execute on function tests.day(int) to anon, authenticated;

create function tests.acks(p_member text) returns text[] language sql stable security definer
set search_path = ''
as $$
  select s.acknowledged_notices from public.notification_settings s
  where s.household_id = tests.fx('home') and s.member_id = tests.fx(p_member)
$$;
grant execute on function tests.acks(text) to anon, authenticated;

create function tests.ack_sql(p_household text, p_keys text[]) returns text language sql stable
as $$ select format('select public.acknowledge_notices(%L, %L)', tests.fx(p_household), p_keys) $$;
grant execute on function tests.ack_sql(text, text[]) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')]));
insert into fx (key) values ('muell'), ('pizza');

-- ===================== AC-001, AC-002: Web Push is gone =====================
select hasnt_table('private', 'push_subscriptions', 'AC-001: private.push_subscriptions is gone');
select hasnt_table('private', 'notification_deliveries', 'AC-001: private.notification_deliveries is gone');
select is((select count(*)::int from cron.job
           where jobname in ('notification-tick', 'purge-notification-deliveries')), 0,
  'AC-001: the notification tick and its purge job are unscheduled');
select is((select count(*)::int from vault.secrets where name in ('push_send_secret', 'push_send_url')), 0,
  'AC-001: the Vault has no push entries');
select hasnt_function('public', 'register_push_subscription', 'AC-002: register_push_subscription is gone');
select hasnt_function('public', 'list_push_subscriptions', 'AC-002: list_push_subscriptions is gone');
select hasnt_function('public', 'send_test_push', 'AC-002: send_test_push is gone');
select hasnt_function('private', 'run_notification_tick', 'AC-001: the scheduler is gone');
select hasnt_function('private', 'chore_due_state', 'Decision 11: the SQL twins of the chore rules are gone');
select has_function('private', 'is_silent', array['uuid', 'uuid', 'date'],
  'Decision 11: is_silent stays (chores wait on trips)');
select is(public.min_app_version(), '2026.11.2', 'Decision 10, superseded by spec 0053: 2026.11.2 stays unlocked, the release may go out');

-- ===================== AC-022: acknowledging in the own row =====================
select is(tests.acks('enrico'), '{}'::text[], 'REQ-005: a member starts without acknowledgements');
alter table public.notification_settings disable trigger notification_settings_set_timestamps;
update public.notification_settings set updated_at = '2026-01-01T00:00:00Z' where household_id = tests.fx('home');
alter table public.notification_settings enable trigger notification_settings_set_timestamps;

select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.ack_sql('home', array['chore:' || tests.fx('muell') || ':' || tests.day()]),
  'AC-022 acknowledge_notices: Enrico acknowledges a notice');
select tests.clear_authentication();
select is(tests.acks('enrico'), array['chore:' || tests.fx('muell') || ':' || tests.day()],
  'AC-022 acknowledge_notices: the key is in Enrico''s row');
select ok((select updated_at > '2026-01-02' from public.notification_settings
           where household_id = tests.fx('home') and member_id = tests.fx('enrico')),
  'AC-022 acknowledge_notices: updated_at moves on, so the other devices pull the row');
select is(tests.acks('nadja'), '{}'::text[], 'AC-022 acknowledge_notices: Nadja''s row is unchanged');

select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.ack_sql('home', array[
    'chore:' || tests.fx('muell') || ':' || tests.day(),
    'entry:' || tests.fx('pizza') || ':1730:' || tests.day()]),
  'AC-018 acknowledge_notices: a second device adds to the first');
select tests.clear_authentication();
select is((select array_agg(k order by k) from unnest(tests.acks('enrico')) k),
  array['chore:' || tests.fx('muell') || ':' || tests.day(), 'entry:' || tests.fx('pizza') || ':1730:' || tests.day()],
  'AC-018 acknowledge_notices: both keys, each once');

-- ===================== AC-023: older than 14 days falls away =====================
update public.notification_settings
set acknowledged_notices = array['cook:old:' || tests.day(-15), 'cook:edge:' || tests.day(-14)]
where household_id = tests.fx('home') and member_id = tests.fx('enrico');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.ack_sql('home', array['cook:new:' || tests.day()]), 'AC-023: Enrico acknowledges again');
select tests.clear_authentication();
select is((select array_agg(k order by k) from unnest(tests.acks('enrico')) k),
  array['cook:edge:' || tests.day(-14), 'cook:new:' || tests.day()],
  'AC-023: the acknowledgement of 15 days ago is gone, the one of 14 days ago stays');

-- At most 400 in the row: the oldest fall away first.
update public.notification_settings
set acknowledged_notices = array(select 'cook:k' || n || ':' || tests.day(-1) from generate_series(1, 399) n)
                           || ('cook:oldest:' || tests.day(-2))
where household_id = tests.fx('home') and member_id = tests.fx('enrico');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.ack_sql('home', array['cook:today:' || tests.day()]), 'Decision 7: a full row takes one more');
select tests.clear_authentication();
select is(cardinality(tests.acks('enrico')), 400, 'Decision 7: the row keeps at most 400 keys');
select ok(not ('cook:oldest:' || tests.day(-2)) = any (tests.acks('enrico'))
          and ('cook:today:' || tests.day()) = any (tests.acks('enrico')),
  'Decision 7: the oldest key made room for the new one');

-- ===================== AC-024: refused calls change nothing =====================
update public.notification_settings set acknowledged_notices = '{}'
where household_id = tests.fx('home') and member_id = tests.fx('enrico');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.ack_sql('home', array['x']), '22023', 'invalid_notice',
  'AC-024: a key without kind and day is refused');
select throws_ok(tests.ack_sql('home', array['cook:' || repeat('a', 50) || ':' || repeat('b', 50) || ':'
                                             || repeat('c', 50) || ':' || repeat('d', 50) || ':' || tests.day()]),
  '22023', 'invalid_notice', 'AC-024: a key longer than 200 characters is refused');
select throws_ok(tests.ack_sql('home', array(select 'cook:k' || n || ':' || tests.day() from generate_series(1, 101) n)),
  '22023', 'invalid_notice', 'AC-024: more than 100 keys at once are refused');
select throws_ok(tests.ack_sql('home', array['cook:a:9999-12-31']), '22023', 'invalid_notice',
  'AC-024: a day further ahead than any reminder is refused');
select throws_ok(format('select public.acknowledge_notices(%L, %L)', tests.fx('home_b'),
                        array['cook:a:' || tests.day()]),
  'P0002', 'not_found', 'AC-024: Enrico cannot acknowledge in a household he is not a member of');

select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.ack_sql('home', array['cook:a:' || tests.day()]), 'P0002', 'not_found',
  'AC-024: a member of another household cannot acknowledge in Enrico''s household');

select tests.authenticate_as_anon();
select throws_ok(tests.ack_sql('home', array['cook:a:' || tests.day()]), '42501', null,
  'AC-024: a signed-out caller cannot call acknowledge_notices');
select tests.clear_authentication();
select is(tests.acks('enrico'), '{}'::text[], 'AC-024: nothing of the refused calls arrived');

-- ===================== AC-025: no way around the RPC =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format($$ update public.notification_settings set acknowledged_notices = '{"cook:a:2026-11-20"}'
            where household_id = %L and member_id = %L $$, tests.fx('home'), tests.fx('enrico')),
  '42501', null, 'AC-025: a member cannot write acknowledged_notices directly');
select tests.authenticate_as(tests.fx('nadja'));
select is(tests.affected(format('select 1 from public.notification_settings where member_id = %L',
                                tests.fx('enrico'))), 0,
  'AC-025: Nadja does not read Enrico''s acknowledgements');

select * from finish();
rollback;
