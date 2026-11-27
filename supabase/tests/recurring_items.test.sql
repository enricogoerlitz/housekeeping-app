-- Spec 0060 — Dauerposten. Covers on the server AC-012 to AC-020, AC-025 and AC-028 to AC-030:
-- tenant isolation of recurring_items, invalid values, last_added_on written only by the server,
-- the due rule (same examples as packages/core/src/recurring-items.test.ts), the scheduler with an
-- injected time (once per day, not while open, reopen, merge with other origins, time zone,
-- paused), "Aus Kalender" marking its day, delete and merge of the article, sync_pull and the
-- pg_cron job.
begin;
\ir _helpers.psql
select plan(75);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
create function tests.ops_sql(p_ops jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx('home_a'), p_ops) $$;
create function tests.insert_sql(p_row jsonb) returns text language sql stable
as $$ select tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'recurring_items',
  'row', jsonb_build_object('article_id', tests.fx('klopapier'), 'rule', '{"type": "weekly", "every": 1, "weekdays": [6]}'::jsonb,
                            'starts_on', '2026-11-27') || p_row))) $$;
-- The contributions of the open item of an article, as "kind:amount" by kind (one transaction: equal created_at).
create function tests.on_list(p_article text) returns text language sql stable
as $$ select string_agg(coalesce(c.source ->> 'kind', '') || ':' || coalesce(c.count::text, c.qty::text || c.unit, ''), ', '
                        order by c.source ->> 'kind', c.id)
      from public.shopping_items i
      join public.shopping_contributions c on c.item_id = i.id
      where i.article_id = tests.fx(p_article) and not i.checked $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')])),
  ('home_ny', tests.create_household('New York', array[tests.fx('ben')]));
update public.households set timezone = 'Europe/Berlin' where id in (tests.fx('home_a'), tests.fx('home_b'));
update public.households set timezone = 'America/New_York' where id = tests.fx('home_ny');
insert into fx (key) values
  ('cola'), ('milch'), ('klopapier'), ('coca'), ('cola_b'), ('cola_ny'), ('row'),
  ('r_cola'), ('r_milch'), ('r_coca'), ('r_b'), ('r_ny'), ('item_milch'), ('item_cola');
insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('cola'), tests.fx('home_a'), 'Cola', 'cola'),
  (tests.fx('milch'), tests.fx('home_a'), 'Milch', 'milch'),
  (tests.fx('klopapier'), tests.fx('home_a'), 'Klopapier', 'klopapier'),
  (tests.fx('coca'), tests.fx('home_a'), 'Coca Cola', 'coca cola'),
  (tests.fx('cola_b'), tests.fx('home_b'), 'Cola', 'cola'),
  (tests.fx('cola_ny'), tests.fx('home_ny'), 'Cola', 'cola');

-- ===================== Tenant isolation (AC-028) =====================
select tests.tenant_isolation('recurring_items',
  jsonb_build_object('id', tests.fx('row'), 'household_id', tests.fx('home_a'), 'article_id', tests.fx('klopapier'),
                     'count', 1, 'rule', '{"type": "weekly", "every": 1, "weekdays": [6]}'::jsonb,
                     'starts_on', '2026-11-27'),
  '{"count": 2, "paused": true}',
  tests.fx('enrico'), tests.fx('ben'));

-- ===================== Writing through apply_changes, invalid values (AC-029) =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.insert_sql(jsonb_build_object('id', tests.fx('r_cola'), 'article_id', tests.fx('cola'), 'count', 2)),
  'AC-002 apply_changes: a member creates "Cola 2×" weekly on Saturday');
select is((select updated_at > '2000-01-01' from public.recurring_items where id = tests.fx('r_cola')), true,
  'AC-002: the server sets updated_at');
select throws_ok(tests.insert_sql('{"rule": {"type": "yearly"}}'), '23514', null,
  'AC-029: "jährlich" is refused');
select throws_ok(tests.insert_sql('{"rule": {"type": "weekly", "every": 1, "weekdays": [8]}}'), '23514', null,
  'AC-029: weekday 8 is refused');
select throws_ok(tests.insert_sql('{"rule": {"type": "weekly", "every": 0, "weekdays": [6]}}'), '23514', null,
  'AC-029: every 0 weeks is refused');
select throws_ok(tests.insert_sql('{"count": 0}'), '23514', null, 'AC-029: amount 0 is refused');
select throws_ok(tests.insert_sql(jsonb_build_object('note', repeat('x', 201))), '23514', null,
  'AC-029: a Zusatz over 200 characters is refused');
select throws_ok(tests.insert_sql(jsonb_build_object('article_id', tests.fx('cola_b'))), '23503', null,
  'AC-029: an article of another household is refused');
select throws_ok(tests.insert_sql('{"last_added_on": "2026-11-28"}'), '22023', 'invalid_change',
  'AC-029 apply_changes: last_added_on cannot be sent');
select throws_ok(format($$ update public.recurring_items set last_added_on = '2026-11-28' where id = %L $$, tests.fx('r_cola')),
  '42501', null, 'AC-029 PostgREST: last_added_on cannot be updated');
select throws_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'recurring_items',
    'id', tests.fx('r_cola'), 'changes', jsonb_build_object('article_id', tests.fx('milch'))))),
  '22023', 'invalid_change', 'Decision 11: a Dauerposten keeps its article');
select throws_ok(tests.insert_sql(jsonb_build_object('article_id', tests.fx('cola'))), '23505', null,
  'AC-008: a second Dauerposten for "Cola" is refused');
select lives_ok(tests.insert_sql(jsonb_build_object('id', tests.fx('r_milch'), 'article_id', tests.fx('milch'), 'count', 1)),
  'AC-016: "Milch 1×" weekly on Saturday');
select tests.clear_authentication();
select tests.authenticate_as_anon();
select throws_ok(tests.insert_sql(jsonb_build_object('article_id', tests.fx('coca'))), '42501', null,
  'AC-028: a signed-out caller cannot write through apply_changes');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.insert_sql(jsonb_build_object('article_id', tests.fx('coca'))), '42501', 'not_member',
  'AC-028: Ben cannot write into the household of Enrico and Nadja');
select tests.clear_authentication();

-- ===================== The due rule (AC-018, AC-019; same examples as core) =====================
select is(private.recurring_item_due('{"type": "weekly", "every": 1, "weekdays": [6]}', '2026-11-27', '2026-11-28'), true,
  'AC-013: weekly on Saturday is due on Sa 28.11.');
select is(private.recurring_item_due('{"type": "weekly", "every": 1, "weekdays": [6]}', '2026-11-27', '2026-11-29'), false,
  'AC-013: not on So 29.11.');
select is(private.recurring_item_due('{"type": "weekly", "every": 2, "weekdays": [6]}', '2026-11-27', '2026-12-05'), false,
  'AC-018: every 2 weeks is not due on 5.12.');
select is(private.recurring_item_due('{"type": "weekly", "every": 2, "weekdays": [6]}', '2026-11-27', '2026-12-12'), true,
  'AC-018: every 2 weeks is due on 12.12.');
select is(private.recurring_item_due('{"type": "weekly", "every": 1, "weekdays": [6]}', '2026-11-29', '2026-11-28'), false,
  'AC-018: nothing before the start');
select is(array[private.recurring_item_due('{"type": "monthly", "day": 31}', '2026-11-01', '2026-11-30'),
                private.recurring_item_due('{"type": "monthly", "day": 31}', '2026-11-01', '2026-12-31'),
                private.recurring_item_due('{"type": "monthly", "day": 31}', '2026-11-01', '2027-02-28'),
                private.recurring_item_due('{"type": "monthly", "day": 31}', '2026-11-01', '2026-12-30')],
  array[true, true, true, false], 'AC-019: monthly on the 31st falls on the last day of shorter months');

-- ===================== The scheduler (AC-013 to AC-017, AC-020) =====================
select is(private.add_due_recurring_items(tests.berlin('2026-11-27 23:05')), 0,
  'AC-018: on Friday nothing is due');
select is(tests.on_list('cola'), null, 'AC-018: Cola is not on the list on Friday');
select is(private.add_due_recurring_items(tests.berlin('2026-11-28 00:05')), 2,
  'AC-013: the run on Sa 28.11. 00:05 brings Cola and Milch');
select is(tests.on_list('cola'), 'recurring:2', 'AC-013: "Cola 2×" with Herkunft "regelmäßig"');
select is((select c.source ->> 'on' from public.shopping_contributions c join public.shopping_items i on i.id = c.item_id
           where i.article_id = tests.fx('cola')), '2026-11-28', 'AC-013: the contribution names its day');
select is((select last_added_on from public.recurring_items where id = tests.fx('r_cola')), '2026-11-28'::date,
  'AC-014: the day is marked on the Dauerposten');
select is(private.add_due_recurring_items(tests.berlin('2026-11-28 01:05')), 0,
  'AC-014: the next run on the same day adds nothing');

-- AC-014: bought and cleared at 10:00, the run at 11:05 brings nothing back.
delete from public.shopping_items where article_id = tests.fx('cola');
select is(private.add_due_recurring_items(tests.berlin('2026-11-28 11:05')), 0,
  'AC-014: after "Fertig" the run at 11:05 brings no Cola');
select is(tests.on_list('cola'), null, 'AC-014: Cola stays off the list');

-- AC-015: Milch from last Saturday is still open on the next Saturday: no second contribution.
select is(private.add_due_recurring_items(tests.berlin('2026-12-05 00:05')), 1,
  'AC-015: on Sa 5.12. only Cola comes (Milch is still open)');
select is(tests.on_list('milch'), 'recurring:1', 'AC-015: Milch keeps one contribution "regelmäßig"');
select is((select last_added_on from public.recurring_items where id = tests.fx('r_milch')), '2026-12-05'::date,
  'AC-015: the day is marked anyway');

-- AC-016: Milch open from "von Hand" (after the old one was bought) gets the contribution.
delete from public.shopping_items where article_id = tests.fx('milch');
insert into public.shopping_items (id, household_id, article_id) values (tests.fx('item_milch'), tests.fx('home_a'), tests.fx('milch'));
insert into public.shopping_contributions (household_id, item_id, source, count)
values (tests.fx('home_a'), tests.fx('item_milch'), '{"kind": "manual"}', 1);
-- AC-017: Cola checked (not cleared).
update public.shopping_items set checked = true, checked_at = now() where article_id = tests.fx('cola');
select is(private.add_due_recurring_items(tests.berlin('2026-12-12 00:05')), 2,
  'AC-016, AC-017: the run on Sa 12.12. brings Milch and Cola');
select is(tests.on_list('milch'), 'manual:1, recurring:1', 'AC-016: "Milch" with "von Hand: 1× · regelmäßig: 1×"');
select is(tests.on_list('cola'), 'recurring:2', 'AC-017: Cola is open again with only "regelmäßig: 2×"');
select is((select count(*)::int from public.shopping_items where article_id = tests.fx('cola')), 1,
  'AC-017: still one item per article');

-- AC-018: paused.
update public.recurring_items set paused = true where id = tests.fx('r_cola');
delete from public.shopping_items where article_id = tests.fx('cola');
select is(private.add_due_recurring_items(tests.berlin('2026-12-19 00:05')), 0,
  'AC-018: a paused Dauerposten brings nothing (and Milch is still open)');
select is(tests.on_list('cola'), null, 'AC-018: no Cola while paused');
update public.recurring_items set paused = false where id = tests.fx('r_cola');

-- AC-020: a household in New York gets its Saturday after its own midnight.
insert into public.recurring_items (id, household_id, article_id, count, rule, starts_on) values
  (tests.fx('r_ny'), tests.fx('home_ny'), tests.fx('cola_ny'), 1, '{"type": "weekly", "every": 1, "weekdays": [6]}', '2026-11-27');
select is(private.add_due_recurring_items(tests.berlin('2026-11-28 02:05')), 0,
  'AC-020: at 02:05 Berlin it is still Friday 20:05 in New York');
select is(private.add_due_recurring_items(tests.berlin('2026-11-28 06:05')), 1,
  'AC-020: at 06:05 Berlin (00:05 New York) Cola comes there');
select is((select household_id from public.shopping_items where article_id = tests.fx('cola_ny')), tests.fx('home_ny'),
  'AC-020: on the list of its own household');
update public.households set timezone = 'Mars/Olympus' where id = tests.fx('home_ny');
select lives_ok($$ select private.add_due_recurring_items(tests.berlin('2026-12-26 08:05')) $$,
  'Security check: a household with an unknown time zone does not stop the run for the others');
select is(tests.on_list('cola'), 'recurring:2', 'Security check: the others still get theirs (Cola on Sa 26.12.)');
update public.households set timezone = 'America/New_York' where id = tests.fx('home_ny');

-- ===================== "Aus Kalender" marks its day (AC-025, AC-030) =====================
-- Run in the real today: the trigger only takes days from yesterday to eight days ahead.
update public.recurring_items set last_added_on = null where id = tests.fx('r_cola');
delete from public.shopping_items where article_id = tests.fx('cola');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'add_contributions', 'entries', jsonb_build_array(
    jsonb_build_object('client_item_id', tests.fx('item_cola'), 'client_article_id', tests.fx('cola'),
                       'article_name', 'Cola', 'name_key', 'cola',
                       'contributions', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'count', 2,
                         'source', jsonb_build_object('kind', 'recurring', 'recurringItemId', tests.fx('r_cola'),
                                                      'on', ((now() at time zone 'Europe/Berlin')::date + 1)::text)))))))),
  'AC-024: "Übernehmen" puts the chosen Dauerposten on the list');
select tests.clear_authentication();
select is((select last_added_on from public.recurring_items where id = tests.fx('r_cola')),
  (now() at time zone 'Europe/Berlin')::date + 1, 'AC-025: its day counts as brought');
select is(tests.on_list('cola'), 'recurring:2', 'AC-024: "Cola 2×" with "regelmäßig: 2×"');

select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'add_contributions', 'entries', jsonb_build_array(
    jsonb_build_object('client_item_id', gen_random_uuid(), 'client_article_id', tests.fx('cola'),
                       'article_name', 'Cola', 'name_key', 'cola',
                       'contributions', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'count', 1,
                         'source', jsonb_build_object('kind', 'recurring', 'recurringItemId', tests.fx('r_cola'),
                                                      'on', ((now() at time zone 'Europe/Berlin')::date + 21)::text)))))))),
  'AC-030: a contribution with a day in three weeks is stored');
select tests.clear_authentication();
select is((select last_added_on from public.recurring_items where id = tests.fx('r_cola')),
  (now() at time zone 'Europe/Berlin')::date + 1, 'AC-030: a day in three weeks marks nothing');

insert into public.recurring_items (id, household_id, article_id, count, rule, starts_on) values
  (tests.fx('r_b'), tests.fx('home_b'), tests.fx('cola_b'), 1, '{"type": "weekly", "every": 1, "weekdays": [6]}', '2026-11-27');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.ops_sql(jsonb_build_array(jsonb_build_object('kind', 'add_contributions', 'entries', jsonb_build_array(
    jsonb_build_object('client_item_id', gen_random_uuid(), 'client_article_id', tests.fx('milch'),
                       'article_name', 'Milch', 'name_key', 'milch',
                       'contributions', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'count', 1,
                         'source', jsonb_build_object('kind', 'recurring', 'recurringItemId', tests.fx('r_b'),
                                                      'on', (now() at time zone 'Europe/Berlin')::date::text)))))))),
  'AC-030: a contribution naming the Dauerposten of another household is stored in the own household');
select tests.clear_authentication();
select is((select last_added_on from public.recurring_items where id = tests.fx('r_b')), null::date,
  'AC-030: the Dauerposten of another household is untouched');
select throws_ok(format($$ insert into public.shopping_contributions (household_id, item_id, source)
                          values (%L, %L, '{"kind": "recurring", "recurringItemId": "x", "on": "2026-11-28"}') $$,
                        tests.fx('home_a'), tests.fx('item_milch')),
  '23514', null, 'AC-029: a source "recurring" without a valid id is refused');

-- ===================== Article deleted or merged (AC-012) =====================
insert into public.recurring_items (id, household_id, article_id, count, rule, starts_on) values
  (tests.fx('r_coca'), tests.fx('home_a'), tests.fx('coca'), 6, '{"type": "weekly", "every": 1, "weekdays": [5]}', '2026-11-27');
delete from public.shopping_items where household_id = tests.fx('home_a') and article_id = tests.fx('cola');
delete from public.recurring_items where id = tests.fx('r_cola');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(format('select public.merge_articles(%L, %L)', tests.fx('coca'), tests.fx('cola')),
  'AC-012: "Coca Cola" is merged into "Cola"');
select tests.clear_authentication();
select is((select article_id from public.recurring_items where id = tests.fx('r_coca')), tests.fx('cola'),
  'AC-012: the Dauerposten of "Coca Cola" now belongs to "Cola", which had none');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(format('select public.delete_article(%L)', tests.fx('cola')), 'AC-012: "Cola" is deleted');
select tests.clear_authentication();
select is((select count(*)::int from public.recurring_items where id = tests.fx('r_coca')), 0,
  'AC-012: its Dauerposten goes with it');
select is((select count(*)::int from public.deleted_records where table_name = 'recurring_items' and record_id = tests.fx('r_coca')::text), 1,
  'AC-012: with a tombstone for the devices');

-- ===================== Sync and scheduler (REQ-006) =====================
select tests.authenticate_as(tests.fx('nadja'));
select is(jsonb_array_length(public.sync_pull(jsonb_build_object('households', jsonb_build_object(tests.fx('home_a'), '{}'::jsonb)))
            -> 'households' -> tests.fx('home_a')::text -> 'rows' -> 'recurring_items'), 1,
  'REQ-006 sync_pull: Nadja gets the Dauerposten of her household (Milch)');
select tests.clear_authentication();
select is((select schedule || ' ' || command from cron.job where jobname = 'add-due-recurring-items'),
  '5 * * * * select private.add_due_recurring_items()', 'Decision 3: pg_cron runs the scheduler every hour at minute 5');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok('select private.add_due_recurring_items()', '42501', null,
  'REQ-006: a member cannot run the scheduler');

select * from finish();
rollback;
