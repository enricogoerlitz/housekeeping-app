-- Push subscriptions and "Probe senden" (spec 0013, Task 2): they belong to a person, live in
-- schema private without grants and are reached only through RPCs that filter by auth.uid()
-- (AC-043). The list never returns an address or a key (AC-004, AC-041); only known push
-- services are accepted (AC-044); at most 10 devices and 3 probes in 10 minutes. Members reach
-- neither pg_net nor the Vault (AC-046).
begin;
\ir _helpers.psql
select plan(69);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

create temp table ids (key text primary key, id uuid) on commit drop;
grant select, insert, update on ids to authenticated;
grant select on ids to anon;

create function tests.chrome() returns text language sql immutable
as $$ select 'https://fcm.googleapis.com/fcm/send/enrico-chrome' $$;
create function tests.firefox() returns text language sql immutable
as $$ select 'https://updates.push.services.mozilla.com/wpush/v2/enrico-firefox' $$;
create function tests.register_sql(p_endpoint text, p_p256dh text default tests.p256dh(),
                                   p_auth text default tests.push_auth(), p_label text default 'Mac · Chrome')
returns text language sql immutable
as $$ select format('select public.register_push_subscription(%L, %L, %L, %L)', p_endpoint, p_p256dh, p_auth, p_label) $$;
-- As postgres: how many subscriptions a person has (the API roles cannot look).
create function tests.subscription_count(p_profile uuid) returns int language sql stable security definer
set search_path = ''
as $$ select count(*)::int from private.push_subscriptions s where s.profile_id = p_profile $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')]));
select tests.clear_push_vault();

-- ===================== Register and list (AC-004) =====================
select tests.authenticate_as(tests.fx('enrico'));
insert into ids values ('chrome', public.register_push_subscription(tests.chrome(), tests.p256dh(), tests.push_auth(),
                                                                    'Mac · Chrome'));
select isnt((select id from ids where key = 'chrome'), null, 'AC-004 register_push_subscription: returns the id');
insert into ids values ('firefox', public.register_push_subscription(tests.firefox(), tests.p256dh(), tests.push_auth(),
                                                                     'Mac · Firefox'));
select is(
  (select array_agg(l.device_label || ' · ' || l.status || ' · ' || l.is_current order by l.device_label)
   from public.list_push_subscriptions(tests.firefox()) l),
  array['Mac · Chrome · active · false', 'Mac · Firefox · active · true'],
  'AC-041 list_push_subscriptions: both devices, "dieses Gerät" is the one with the given address');
select is(
  (select array_agg(k order by k) from public.list_push_subscriptions(tests.chrome()) l,
          jsonb_object_keys(to_jsonb(l)) k
   where l.device_label = 'Mac · Chrome'),
  array['created_at', 'device_label', 'id', 'is_current', 'last_success_at', 'status'],
  'AC-004 list_push_subscriptions: never an address or a key');
select is(
  (select count(*)::int from public.list_push_subscriptions() l where l.is_current), 0,
  'AC-004 list_push_subscriptions: without an address no row is "dieses Gerät"');
select lives_ok(
  tests.register_sql(tests.chrome(), p_label => 'Mac · Chrome'),
  'AC-039 register_push_subscription: registering the same address again is fine');
select is(tests.subscription_count(tests.fx('enrico')), 2,
  'AC-039 register_push_subscription: the same address stays one subscription');

-- ===================== This device off (AC-008) =====================
select lives_ok(
  format('select public.set_push_subscription_enabled(%L, false)', tests.chrome()),
  'AC-008 set_push_subscription_enabled: Enrico switches Chrome off');
select is(
  (select array_agg(l.device_label || ' · ' || l.status order by l.device_label) from public.list_push_subscriptions() l),
  array['Mac · Chrome · off', 'Mac · Firefox · active'],
  'AC-008 list_push_subscriptions: only Chrome is off, it stays in "Deine Geräte"');
select throws_ok(
  format('select public.set_push_subscription_enabled(%L, true)', 'https://fcm.googleapis.com/fcm/send/unknown'),
  'P0002', 'not_found', 'AC-008 set_push_subscription_enabled: an unknown address is not_found');

-- ===================== Another person (AC-043) =====================
select tests.authenticate_as(tests.fx('nadja'));
select is((select count(*)::int from public.list_push_subscriptions(tests.chrome())), 0,
  'AC-043 list_push_subscriptions: Nadja does not see Enrico''s devices, not even with his address');
select throws_ok(
  format('select public.set_push_subscription_enabled(%L, true)', tests.chrome()),
  'P0002', 'not_found', 'AC-043 set_push_subscription_enabled: Nadja cannot switch Enrico''s device');
select is(
  public.remove_push_subscription((select id from ids where key = 'chrome')), false,
  'AC-043 remove_push_subscription: a foreign id gives false');
select lives_ok(
  format('select public.unregister_push_subscription(%L)', 'https://fcm.googleapis.com/fcm/send/unknown'),
  'AC-042 unregister_push_subscription: an unknown address is no error');
select is(tests.subscription_count(tests.fx('enrico')), 2,
  'AC-043 remove_push_subscription: Enrico''s devices are untouched');
select tests.authenticate_as(tests.fx('ben'));
select is(
  public.remove_push_subscription((select id from ids where key = 'firefox')), false,
  'AC-043 remove_push_subscription: a member of another household gets false too');

-- Direct access to the tables.
select tests.authenticate_as(tests.fx('nadja'));
select throws_ok('select * from private.push_subscriptions', '42501', null,
  'AC-043 push_subscriptions: no direct read');
select throws_ok(
  format($$ insert into private.push_subscriptions (profile_id, endpoint, p256dh, auth, device_label)
            values (%L, 'https://fcm.googleapis.com/fcm/send/x', %L, %L, 'x') $$,
         tests.fx('nadja'), tests.p256dh(), tests.push_auth()),
  '42501', null, 'AC-043 push_subscriptions: no direct insert');
select throws_ok('update private.push_subscriptions set enabled = false', '42501', null,
  'AC-043 push_subscriptions: no direct update');
select throws_ok('delete from private.push_subscriptions', '42501', null,
  'AC-043 push_subscriptions: no direct delete');
select throws_ok('select * from private.notification_deliveries', '42501', null,
  'AC-046 notification_deliveries: a member cannot read the delivery log');

-- ===================== Signed out (AC-043) =====================
select tests.authenticate_as_anon();
select throws_ok(tests.register_sql('https://fcm.googleapis.com/fcm/send/anon'), '42501', null,
  'AC-043 register_push_subscription: anon cannot register');
select throws_ok(format('select public.set_push_subscription_enabled(%L, false)', tests.chrome()), '42501', null,
  'AC-043 set_push_subscription_enabled: anon is refused');
select throws_ok(format('select public.unregister_push_subscription(%L)', tests.chrome()), '42501', null,
  'AC-043 unregister_push_subscription: anon is refused');
select throws_ok(format('select public.remove_push_subscription(%L)', (select id from ids where key = 'chrome')),
  '42501', null, 'AC-043 remove_push_subscription: anon is refused');
select throws_ok('select * from public.list_push_subscriptions()', '42501', null,
  'AC-043 list_push_subscriptions: anon is refused');
select throws_ok(format('select public.send_test_push(%L)', tests.chrome()), '42501', null,
  'AC-043 send_test_push: anon cannot trigger a probe');
select throws_ok('select * from private.push_subscriptions', '42501', null,
  'AC-043 push_subscriptions: anon cannot read');
select tests.clear_authentication();
select is(tests.subscription_count(tests.fx('enrico')), 2,
  'AC-043 signed out: nothing changed');

-- An authenticated session without a user (e.g. a malformed token) is refused as not_authenticated.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(tests.register_sql('https://fcm.googleapis.com/fcm/send/nobody'), '42501', 'not_authenticated',
  'AC-043 register_push_subscription: no user, no subscription');

-- ===================== Invalid subscriptions (AC-044) =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.register_sql('http://127.0.0.1:54321/x'), '22023', 'invalid_subscription',
  'AC-044 register_push_subscription: a local http address is refused');
select throws_ok(tests.register_sql('https://evil.example/x'), '22023', 'invalid_subscription',
  'AC-044 register_push_subscription: an address of no known push service is refused');
select throws_ok(tests.register_sql('https://fcm.googleapis.com:8443/fcm/send/x'), '22023', 'invalid_subscription',
  'AC-044 register_push_subscription: no port');
select throws_ok(tests.register_sql('https://user@fcm.googleapis.com/fcm/send/x'), '22023', 'invalid_subscription',
  'AC-044 register_push_subscription: no credentials in the address');
select throws_ok(tests.register_sql('https://fcm.googleapis.com.evil.example/x'), '22023', 'invalid_subscription',
  'AC-044 register_push_subscription: a look-alike host is refused');
select throws_ok(tests.register_sql('https://fcm.googleapis.com/' || repeat('x', 1024)), '22023', 'invalid_subscription',
  'AC-044 register_push_subscription: at most 1024 characters');
select lives_ok(tests.register_sql('https://wns2-par02p.notify.windows.com/w/?token=abc%2Bdef', p_label => 'Windows · Edge'),
  'Decision 20 register_push_subscription: Windows push addresses are accepted');
select throws_ok(tests.register_sql('https://fcm.googleapis.com/fcm/send/k1', p_p256dh => 'B' || repeat('A', 40)),
  '22023', 'invalid_subscription', 'AC-044 register_push_subscription: a broken p256dh key is refused');
select throws_ok(tests.register_sql('https://fcm.googleapis.com/fcm/send/k2', p_auth => repeat('+', 22)),
  '22023', 'invalid_subscription', 'AC-044 register_push_subscription: a broken auth secret is refused');
select throws_ok(tests.register_sql('https://fcm.googleapis.com/fcm/send/k3', p_label => '  '),
  '22023', 'invalid_subscription', 'Decision 20 register_push_subscription: the device name is not empty');
select throws_ok(tests.register_sql('https://fcm.googleapis.com/fcm/send/k4', p_label => repeat('x', 61)),
  '22023', 'invalid_subscription', 'Decision 20 register_push_subscription: the device name has at most 60 characters');
select is(tests.subscription_count(tests.fx('enrico')), 3,
  'AC-044 register_push_subscription: nothing invalid was stored');

-- ===================== Moving an address, limits =====================
select tests.authenticate_as(tests.fx('nadja'));
select lives_ok(tests.register_sql(tests.firefox(), p_label => 'Mac · Firefox'),
  'Decision 19 register_push_subscription: Nadja signs in on Enrico''s Firefox and registers it');
select is(tests.subscription_count(tests.fx('nadja')), 1,
  'Decision 19 register_push_subscription: the address now belongs to Nadja');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  (select array_agg(l.device_label order by l.device_label) from public.list_push_subscriptions(tests.firefox()) l),
  array['Mac · Chrome', 'Windows · Edge'],
  'Decision 19 list_push_subscriptions: Enrico no longer sees the moved device');

select tests.authenticate_as(tests.fx('ben'));
select lives_ok(
  $$ select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/ben-' || n, tests.p256dh(),
                                              tests.push_auth(), 'Gerät ' || n)
     from generate_series(1, 10) n $$,
  'Decision 20 register_push_subscription: ten devices are fine');
select throws_ok(tests.register_sql('https://fcm.googleapis.com/fcm/send/ben-11'), '22023', 'too_many_devices',
  'Decision 20 register_push_subscription: the eleventh device is refused');
select lives_ok(tests.register_sql('https://fcm.googleapis.com/fcm/send/ben-3'),
  'Decision 20 register_push_subscription: re-registering one of the ten still works');

-- ===================== Remove and unregister (AC-041, AC-042) =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(public.remove_push_subscription((select id from ids where key = 'chrome')), true,
  'AC-041 remove_push_subscription: Enrico removes Chrome');
select is(
  (select array_agg(l.device_label) from public.list_push_subscriptions() l), array['Windows · Edge'],
  'AC-041 list_push_subscriptions: Chrome is gone from the list');
select lives_ok(
  format('select public.unregister_push_subscription(%L)', 'https://wns2-par02p.notify.windows.com/w/?token=abc%2Bdef'),
  'AC-042 unregister_push_subscription: signing out removes this device');
select is(tests.subscription_count(tests.fx('enrico')), 0,
  'AC-042 unregister_push_subscription: Enrico has no device left');

-- A device the push service called gone comes back active when it registers again (AC-039).
insert into ids values ('chrome2', public.register_push_subscription(tests.chrome(), tests.p256dh(), tests.push_auth(),
                                                                     'Mac · Chrome'));
select tests.clear_authentication();
update private.push_subscriptions set gone_at = now(), failure_count = 3 where id = (select id from ids where key = 'chrome2');
select tests.authenticate_as(tests.fx('enrico'));
select is((select l.status from public.list_push_subscriptions() l), 'unreachable',
  'AC-039 list_push_subscriptions: a gone device is "nicht erreichbar"');
select lives_ok(tests.register_sql(tests.chrome()), 'AC-039 register_push_subscription: the device registers again');
select is((select l.status from public.list_push_subscriptions() l), 'active',
  'AC-039 list_push_subscriptions: … and is active again');

-- ===================== Probe senden (AC-009, AC-010) =====================
select throws_ok(format('select public.send_test_push(%L)', tests.chrome()), 'P0001', 'push_not_configured',
  'Decision 22 send_test_push: without the Vault entries the probe says push_not_configured');
select tests.clear_authentication();
select tests.set_push_vault();
create temp table queue_before on commit drop as select coalesce(max(id), 0) as id from net.http_request_queue;
insert into ids values ('nadja_dev', tests.add_push_subscription(tests.fx('nadja'), 'nadja-laptop'));

select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(format('select public.send_test_push(%L)', tests.chrome()), 'AC-009 send_test_push: Enrico sends a probe');
select tests.clear_authentication();
select is(
  (select array_agg(d.kind || ' · ' || d.status) from private.notification_deliveries d
   where d.profile_id in (tests.fx('enrico'), tests.fx('nadja'))),
  array['test · pending'],
  'AC-009 send_test_push: exactly one delivery, for this device only');
select is(
  (select jsonb_build_object(
     'url', q.url, 'secret', q.headers ->> 'x-push-secret',
     'messages', jsonb_array_length(convert_from(q.body, 'utf8')::jsonb -> 'messages'),
     'endpoint', convert_from(q.body, 'utf8')::jsonb -> 'messages' -> 0 ->> 'endpoint',
     'notification', convert_from(q.body, 'utf8')::jsonb -> 'messages' -> 0 -> 'notification')
   from net.http_request_queue q where q.id > (select id from queue_before)),
  jsonb_build_object('url', 'http://push-send.test/functions/v1/push-send', 'secret', 'test-push-secret',
                     'messages', 1, 'endpoint', tests.chrome(),
                     'notification', jsonb_build_object('title', 'Housekeeping',
                                                        'body', 'Probe: So sehen deine Benachrichtigungen aus.',
                                                        'url', '/einstellungen/benachrichtigungen')),
  'AC-009 send_test_push: one call to push-send with this device''s address and the probe text');
select is(
  (select d.request_id from private.notification_deliveries d where d.kind = 'test' and d.profile_id = tests.fx('enrico')),
  (select max(q.id) from net.http_request_queue q),
  'Decision 23 send_test_push: the delivery remembers its pg_net request for the answer');

select tests.authenticate_as(tests.fx('nadja'));
select throws_ok(format('select public.send_test_push(%L)', tests.chrome()), 'P0002', 'not_found',
  'AC-043 send_test_push: Nadja cannot send to Enrico''s device');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(format('select public.send_test_push(%L)', tests.chrome()), 'Decision 20 send_test_push: second probe');
select lives_ok(format('select public.send_test_push(%L)', tests.chrome()), 'Decision 20 send_test_push: third probe');
select throws_ok(format('select public.send_test_push(%L)', tests.chrome()), '22023', 'rate_limited',
  'Decision 20 send_test_push: the fourth probe within 10 minutes is refused');
select lives_ok(format('select public.set_push_subscription_enabled(%L, false)', tests.chrome()),
  'AC-010 send_test_push: Enrico switches this device off');
select throws_ok(format('select public.send_test_push(%L)', tests.chrome()), 'P0002', 'not_found',
  'AC-010 send_test_push: a device that is off gets no probe');
select tests.clear_authentication();
select is((select count(*)::int from net.http_request_queue q where q.id > (select id from queue_before)), 3,
  'Decision 20 send_test_push: three probes, three calls');

-- ===================== pg_net and the Vault are out of reach (AC-046) =====================
-- Supabase's pg_net grants schema net and net.http_post to anon and authenticated, as its owner
-- supabase_admin; a migration (run as postgres) cannot take that back. The API exposes only the
-- schemas public and graphql_public (config.toml [api] schemas), so these checks pin what keeps
-- pg_net out of reach: nothing callable through the API calls net.*, except the reviewed RPC
-- send_test_push, which posts only to the Vault's push_send_url.
select is_empty(
  $$ select p.oid::regprocedure::text from pg_catalog.pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'graphql_public'::regnamespace)
       and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
       and p.prosrc ~ '\mnet\.' $$,
  'AC-046 pg_net: no function the API exposes calls pg_net directly');
select is_empty(
  $$ select p.oid::regprocedure::text from pg_catalog.pg_proc p
     where p.pronamespace = 'private'::regnamespace
       and has_function_privilege('authenticated', p.oid, 'execute')
       and p.prosrc ~ '\mnet\.|post_push_bundle'
       and p.oid <> 'private.send_test_push(text)'::regprocedure $$,
  'AC-046 pg_net: of the private functions members may execute, only send_test_push reaches pg_net');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok('select * from vault.decrypted_secrets', '42501', null,
  'AC-046 vault: a member cannot read the Vault');

select * from finish();
rollback;
