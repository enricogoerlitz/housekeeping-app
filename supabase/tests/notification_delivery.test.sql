-- The tick and the delivery log (spec 0013, Task 2): run_notification_tick writes each due
-- message once per active device (AC-032) and hands it to push-send in bundles of at most 50
-- through pg_net; the next tick reads the answers (AC-039); old log rows are purged; members can
-- neither run the scheduler nor read the log (AC-046). pg_net is not called for real: the
-- requests stay in net.http_request_queue and are rolled back with the test, and answers are
-- written into net._http_response by hand.
begin;
\ir _helpers.psql
select plan(46);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

create function tests.tick(p_local timestamp) returns integer language sql
as $$ select private.run_notification_tick(tests.berlin(p_local)) $$;
create function tests.deliveries(p_who uuid) returns table (subscription text, kind text, status text)
language sql stable
as $$
  select s.device_label, d.kind, d.status
  from private.notification_deliveries d join private.push_subscriptions s on s.id = d.subscription_id
  where d.profile_id = p_who
  order by s.device_label, d.kind
$$;
create function tests.delivery_id(p_label text, p_kind text) returns bigint language sql stable
as $$
  select d.id from private.notification_deliveries d join private.push_subscriptions s on s.id = d.subscription_id
  where s.device_label = p_label and d.kind = p_kind
$$;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')]));
insert into fx (key) values ('slot'), ('boulder'), ('e_boulder'), ('c_blumen');
update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('slot'), 'name', 'Vormittag', 'sort', 0))
where id = tests.fx('home');
insert into public.activities (id, household_id, name, name_key) values (tests.fx('boulder'), tests.fx('home'), 'Bouldern', 'bouldern');
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, activity_id)
values (tests.fx('e_boulder'), tests.fx('home'), '2026-11-20', tests.fx('slot'), 'activity', tests.fx('boulder'));
insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on, due_time)
values (tests.fx('c_blumen'), tests.fx('home'), 'Blumen gießen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
        '{"type": "anyone"}', '2026-11-20', '18:00');
update public.notification_settings set daily_summary_enabled = true, daily_summary_parts = '{activities}'
where household_id = tests.fx('home') and member_id = tests.fx('enrico');

insert into fx (key, id) values
  ('chrome', tests.add_push_subscription(tests.fx('enrico'), 'chrome')),
  ('firefox', tests.add_push_subscription(tests.fx('enrico'), 'firefox')),
  ('off', tests.add_push_subscription(tests.fx('enrico'), 'off', false)),
  ('gone', tests.add_push_subscription(tests.fx('enrico'), 'gone')),
  ('laptop', tests.add_push_subscription(tests.fx('nadja'), 'laptop'));
update private.push_subscriptions set gone_at = now() where id = tests.fx('gone');

create temp table queue_before on commit drop as select coalesce(max(id), 0) as id from net.http_request_queue;
create temp view new_requests as
  select q.id, q.url, q.headers, convert_from(q.body, 'utf8')::jsonb as body
  from net.http_request_queue q where q.id > (select id from queue_before);

-- ===================== Without the Vault entries nothing happens (Decision 22) =====================
select tests.clear_push_vault();
select is(tests.tick('2026-11-20 07:30'), 0, 'Decision 22 tick: without the Vault entries nothing is planned');
select is((select count(*)::int from private.notification_deliveries where household_id = tests.fx('home')), 0,
  'Decision 22 tick: … and nothing is written into the log');
select is((select count(*)::int from new_requests), 0, 'Decision 22 tick: … and push-send is not called');

-- ===================== One row per active device (AC-008, AC-032, AC-039) =====================
select tests.set_push_vault();
select is(tests.tick('2026-11-20 07:30'), 2, 'AC-012 tick: the daily summary goes to Enrico''s two active devices');
select is(
  (select array_agg(t.subscription || ' · ' || t.kind || ' · ' || t.status) from tests.deliveries(tests.fx('enrico')) t),
  array['chrome · daily_summary · pending', 'firefox · daily_summary · pending'],
  'AC-008, AC-039 tick: the device switched off and the unreachable one get nothing');
select is(
  (select jsonb_build_object('n', count(*), 'url', min(r.url), 'messages', min(jsonb_array_length(r.body -> 'messages')))
   from new_requests r),
  jsonb_build_object('n', 1, 'url', 'http://push-send.test/functions/v1/push-send', 'messages', 2),
  'Decision 22 tick: one call to push-send for both messages');
-- The queue is readable by every role Supabase creates (net.http_request_queue): it must never
-- hold the shared secret, only a signature of exactly this body (security check 0013, finding 1).
select is(
  (select count(*)::int from net.http_request_queue q
   where q.id > (select id from queue_before)
     and (q.headers ? 'x-push-secret' or q.headers::text like '%test-push-secret%'
          or convert_from(q.body, 'utf8') like '%test-push-secret%')),
  0, 'Decision 22 tick: the queued request holds no shared secret');
select ok(
  (select r.headers ->> 'x-push-signature'
          = encode(extensions.hmac((r.headers ->> 'x-push-timestamp') || '.' || convert_from(q.body, 'utf8'),
                                   'test-push-secret', 'sha256'), 'hex')
   from new_requests r join net.http_request_queue q on q.id = r.id),
  'Decision 22 tick: x-push-signature is HMAC-SHA256 over "<timestamp>.<body>" with the Vault secret');
select ok(
  (select (r.headers ->> 'x-push-timestamp') ~ '^\d{10}$'
      and abs((r.headers ->> 'x-push-timestamp')::bigint - extract(epoch from clock_timestamp())::bigint) <= 60
   from new_requests r),
  'Decision 22 tick: x-push-timestamp is the current Unix time in seconds (real clock, not p_now)');
select is(
  (select m - 'id' - 'endpoint' from new_requests r, jsonb_array_elements(r.body -> 'messages') m
   where m ->> 'endpoint' = 'https://fcm.googleapis.com/fcm/send/chrome'),
  jsonb_build_object('keys', jsonb_build_object('p256dh', tests.p256dh(), 'auth', tests.push_auth()),
                     'ttl', 16 * 3600 + 30 * 60, 'urgency', 'normal',
                     'notification', jsonb_build_object('title', 'Housekeeping', 'body', 'Heute: Bouldern (Vormittag)',
                                                        'url', '/?haushalt=' || tests.fx('home'))),
  'AC-040, Decision 13 tick: a message holds only the keys, TTL until midnight, urgency and title, text and link');
select is(
  (select (m ->> 'id')::bigint from new_requests r, jsonb_array_elements(r.body -> 'messages') m
   where m ->> 'endpoint' = 'https://fcm.googleapis.com/fcm/send/chrome'),
  tests.delivery_id('chrome', 'daily_summary'),
  'Decision 23 tick: the message id is the log id, so the answer finds its row');
select is(
  (select array_agg(distinct d.request_id) from private.notification_deliveries d where d.household_id = tests.fx('home')),
  (select array_agg(r.id) from new_requests r),
  'Decision 23 tick: the log rows remember the pg_net request');
select ok(
  (select bool_and(not (d ? 'body') and not (d ? 'title') and not (d ? 'endpoint'))
   from private.notification_deliveries x, to_jsonb(x) d),
  'Decision 6 log: no content and no address is stored in the log');

select is(tests.tick('2026-11-20 07:30'), 0, 'AC-032 tick: the same tick again sends nothing');
select is(tests.tick('2026-11-20 07:35'), 0, 'AC-032 tick: the next tick sends nothing either');
select is((select count(*)::int from private.notification_deliveries where household_id = tests.fx('home')), 2,
  'AC-032 log: exactly one row per device');
select is((select count(*)::int from new_requests), 1, 'AC-032 tick: push-send was called once');
select throws_ok(
  format($$ insert into private.notification_deliveries (dedupe_key, subscription_id, profile_id, kind, due_at, status)
            values ('daily:%s:%s:2026-11-20', %L, %L, 'daily_summary', now(), 'pending') $$,
         tests.fx('home'), tests.fx('enrico'), tests.fx('chrome'), tests.fx('enrico')),
  '23505', null, 'AC-032 log: the key is unique per device');

update public.notification_settings set daily_summary_at = '08:00'
where household_id = tests.fx('home') and member_id = tests.fx('enrico');
select is(tests.tick('2026-11-20 08:00'), 0, 'AC-032 tick: changing the time to 8:00 at 7:45 sends no second summary');

-- ===================== Answers of push-send (Decision 23, AC-039) =====================
insert into net._http_response (id, status_code, content_type, content, timed_out, created)
select r.id, 200, 'application/json', jsonb_build_object('results', jsonb_build_array(
         jsonb_build_object('id', tests.delivery_id('chrome', 'daily_summary'), 'status', 201),
         jsonb_build_object('id', tests.delivery_id('firefox', 'daily_summary'), 'status', 410)))::text, false, now()
from new_requests r;
select lives_ok($$ select private.collect_push_responses() $$, 'Decision 23 collect: the answers are read');
select is(
  (select array_agg(t.subscription || ' · ' || t.status) from tests.deliveries(tests.fx('enrico')) t),
  array['chrome · sent', 'firefox · gone'],
  'Decision 23 collect: 201 → sent, 410 → gone');
select is(
  (select jsonb_build_object('chrome_success', c.last_success_at is not null, 'chrome_gone', c.gone_at is not null,
                             'firefox_gone', f.gone_at is not null, 'http', d.http_status)
   from private.push_subscriptions c, private.push_subscriptions f, private.notification_deliveries d
   where c.id = tests.fx('chrome') and f.id = tests.fx('firefox') and d.id = tests.delivery_id('firefox', 'daily_summary')),
  jsonb_build_object('chrome_success', true, 'chrome_gone', false, 'firefox_gone', true, 'http', 410),
  'AC-039 collect: the gone subscription is switched off, the other one remembers its success');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  (select array_agg(l.device_label || ' · ' || l.status order by l.device_label) from public.list_push_subscriptions() l),
  array['chrome · active', 'firefox · unreachable', 'gone · unreachable', 'off · off'],
  'AC-039 list_push_subscriptions: "Deine Geräte" shows Firefox as "nicht erreichbar"');
select tests.clear_authentication();

-- The chore at 18:00 goes to both people; Firefox is gone now (AC-039).
select is(tests.tick('2026-11-20 18:00'), 2, 'AC-039 tick: the gone device gets no further message');
select is(
  (select array_agg(t.subscription || ' · ' || t.kind) from tests.deliveries(tests.fx('enrico')) t where t.status = 'pending'),
  array['chrome · chore_reminder'], 'AC-039 tick: only Chrome for Enrico');
insert into net._http_response (id, status_code, content_type, content, timed_out, created)
select max(r.id), 200, 'application/json', jsonb_build_object('results', jsonb_build_array(
         jsonb_build_object('id', tests.delivery_id('chrome', 'chore_reminder'), 'status', 500),
         jsonb_build_object('id', tests.delivery_id('laptop', 'chore_reminder'), 'status', 'rejected')))::text, false, now()
from new_requests r;
select private.collect_push_responses();
select is(
  (select array_agg(d.status || ' · ' || coalesce(d.http_status::text, '-') order by d.subscription_id = tests.fx('laptop'))
   from private.notification_deliveries d where d.kind = 'chore_reminder'),
  array['failed · 500', 'failed · -'],
  'Decision 7 collect: an error of the push service or a rejected address is failed, not retried');
select is(
  (select array_agg(s.failure_count order by s.device_label) from private.push_subscriptions s
   where s.id in (tests.fx('chrome'), tests.fx('laptop'))),
  array[1, 1], 'Decision 23 collect: failures are counted per device');

-- push-send itself failing, or no answer after an hour.
update public.chores set next_due_on = '2026-11-21', due_time = '09:00' where id = tests.fx('c_blumen');
select is(tests.tick('2026-11-21 09:00'), 2, 'Decision 23 tick: the next reminder is planned');
insert into net._http_response (id, status_code, content_type, content, timed_out, created)
select max(r.id), 401, 'application/json', '{"error": "unauthorized"}', false, now() from new_requests r;
select private.collect_push_responses();
select is(
  (select count(*)::int from private.notification_deliveries d where d.kind = 'chore_reminder' and d.status = 'failed'), 4,
  'Decision 23 collect: push-send answering with an error fails the whole bundle');
update public.chores set next_due_on = '2026-11-22', due_time = '09:00' where id = tests.fx('c_blumen');
select is(tests.tick('2026-11-22 09:00'), 2, 'Decision 23 tick: another reminder');
select private.collect_push_responses(now() + interval '59 minutes');
select is(
  (select count(*)::int from private.notification_deliveries d where d.status = 'pending'), 2,
  'Decision 23 collect: without an answer it stays pending for up to an hour');
select private.collect_push_responses(now() + interval '61 minutes');
select is(
  (select count(*)::int from private.notification_deliveries d where d.status = 'pending'), 0,
  'Decision 23 collect: after an hour without an answer it is failed');

-- ===================== Bundles of at most 50 =====================
insert into private.push_subscriptions (profile_id, endpoint, p256dh, auth, device_label)
select tests.fx('enrico'), 'https://fcm.googleapis.com/fcm/send/many-' || n, tests.p256dh(), tests.push_auth(), 'many ' || n
from generate_series(1, 59) n;
create temp table before_bundle on commit drop as select coalesce(max(id), 0) as id from net.http_request_queue;
update public.chores set next_due_on = '2026-11-23', due_time = '09:00' where id = tests.fx('c_blumen');
select is(tests.tick('2026-11-23 09:00'), 61, 'Decision 20 tick: 60 devices of Enrico and Nadja''s laptop');
select is(
  (select array_agg(jsonb_array_length(convert_from(q.body, 'utf8')::jsonb -> 'messages') order by q.id)
   from net.http_request_queue q where q.id > (select id from before_bundle)),
  array[50, 11], 'Decision 20 tick: bundles of at most 50 messages');

-- ===================== Purge and cron jobs =====================
insert into private.notification_deliveries (dedupe_key, subscription_id, profile_id, kind, due_at, status, created_at)
values ('test:old', tests.fx('chrome'), tests.fx('enrico'), 'test', now() - interval '31 days', 'sent', now() - interval '31 days'),
       ('test:young', tests.fx('chrome'), tests.fx('enrico'), 'test', now() - interval '29 days', 'sent', now() - interval '29 days');
update private.push_subscriptions set gone_at = now() - interval '31 days' where id = tests.fx('gone');
select private.purge_notification_deliveries();
select is(
  (select array_agg(d.dedupe_key order by d.dedupe_key) from private.notification_deliveries d where d.kind = 'test'),
  array['test:young'], 'Decision 23 purge: log rows older than 30 days are deleted, younger ones stay');
select is(
  (select array_agg(s.device_label order by s.device_label) from private.push_subscriptions s
   where s.id in (tests.fx('gone'), tests.fx('firefox'))),
  array['firefox'], 'Decision 23 purge: subscriptions gone for 30 days are deleted');
select is(
  (select array_agg(j.jobname || ' ' || j.schedule || ' ' || j.command order by j.jobname) from cron.job j
   where j.jobname in ('notification-tick', 'purge-notification-deliveries')),
  array['notification-tick */5 * * * * select private.run_notification_tick()',
        'purge-notification-deliveries 35 3 * * * select private.purge_notification_deliveries()'],
  'Cron: the tick runs every 5 minutes, the purge nightly');

-- ===================== Bundles: at most 50 messages and 100 KB (security check 0013, finding 3) =====================
-- push-send accepts 128 KB; the tick stays below it with headroom. Synthetic messages of about
-- 2.7 KB each (a 1000-character address, a 400-character text of three-byte characters and a
-- 500-character link).
create temp table bundles on commit drop as
  select b.ord, jsonb_array_length(b.bundle) as n, octet_length(jsonb_build_object('messages', b.bundle)::text) as bytes,
         b.bundle
  from private.push_bundles((
    select jsonb_agg(jsonb_build_object('id', i, 'endpoint', 'https://fcm.googleapis.com/' || repeat('x', 1000),
                                        'notification', jsonb_build_object('body', repeat('€', 400), 'url', '/' || repeat('x', 499)))
                      order by i)
    from generate_series(1, 60) i)) with ordinality b (bundle, ord);
select ok((select bool_and(b.bytes <= 100 * 1024) from bundles b),
  'Bundles: no call to push-send carries more than 100 KB');
select ok((select b.n < 50 from bundles b where b.ord = 1), 'Bundles: 60 large messages are split by size, not only by count');
select is(
  (select array_agg((m ->> 'id')::int order by b.ord, x.pos)
   from bundles b, jsonb_array_elements(b.bundle) with ordinality x (m, pos)),
  (select array_agg(i order by i) from generate_series(1, 60) i),
  'Bundles: every message once, in order');
select is(
  (select array_agg(jsonb_array_length(b.bundle) order by b.ord)
   from private.push_bundles((select jsonb_agg(jsonb_build_object('id', i) order by i) from generate_series(1, 120) i))
        with ordinality b (bundle, ord)),
  array[50, 50, 20], 'Bundles: small messages go 50 at a time');
select is_empty($$ select * from private.push_bundles('[]'::jsonb) $$, 'Bundles: no messages, no call');

-- ===================== Rights (AC-046) =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok('select private.run_notification_tick()', '42501', null,
  'AC-046 run_notification_tick: a member cannot run the scheduler');
select throws_ok('select * from private.notification_candidates(now())', '42501', null,
  'AC-046 notification_candidates: a member cannot read the candidates');
select tests.authenticate_as_anon();
select throws_ok('select private.run_notification_tick()', '42501', null,
  'AC-046 run_notification_tick: anon cannot run the scheduler');
select throws_ok('select * from private.notification_deliveries', '42501', null,
  'AC-046 notification_deliveries: anon cannot read the log');
select tests.clear_authentication();

select * from finish();
rollback;
