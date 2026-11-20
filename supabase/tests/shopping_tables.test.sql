-- Shopping items and contributions (spec 0003, T3). Check state (checked, checked_at,
-- checked_by, check_seq, not_available) changes only through the store RPCs of T4: a client
-- cannot set it on insert or change it by update. One open item per article and list.
begin;
\ir _helpers.psql
select plan(17);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

insert into fx (key, id) values
  ('anna', tests.create_user('anna@example.com', 'Anna')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('A', array[tests.fx('anna')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')]));
insert into fx (key) values ('article_a'), ('list_a'), ('list_a2'), ('item_a');

insert into public.articles (id, household_id, name, name_key)
values (tests.fx('article_a'), tests.fx('home_a'), 'Milch', 'milch');
insert into public.shopping_lists (id, household_id, name) values
  (tests.fx('list_a'), tests.fx('home_a'), 'Standardliste'),
  (tests.fx('list_a2'), tests.fx('home_a'), 'Grillen');

-- ===================== Check state belongs to the store RPCs =====================
select tests.authenticate_as(tests.fx('anna'));
select throws_ok(
  format($$ insert into public.shopping_items (household_id, list_id, article_id, checked) values (%L, %L, %L, true) $$,
         tests.fx('home_a'), tests.fx('list_a'), tests.fx('article_a')),
  '42501', null, 'T3 shopping_items: a client cannot insert an item as checked');
select throws_ok(
  format($$ insert into public.shopping_items (household_id, list_id, article_id, check_seq) values (%L, %L, %L, 7) $$,
         tests.fx('home_a'), tests.fx('list_a'), tests.fx('article_a')),
  '42501', null, 'T3 shopping_items: a client cannot insert check_seq');
select throws_ok(
  format($$ insert into public.shopping_items (household_id, list_id, article_id, not_available) values (%L, %L, %L, true) $$,
         tests.fx('home_a'), tests.fx('list_a'), tests.fx('article_a')),
  '42501', null, 'T3 shopping_items: a client cannot insert not_available');
insert into public.shopping_items (id, household_id, list_id, article_id)
values (tests.fx('item_a'), tests.fx('home_a'), tests.fx('list_a'), tests.fx('article_a'));
select results_eq(
  format($$ select checked, checked_at, checked_by, check_seq, not_available from public.shopping_items where id = %L $$,
         tests.fx('item_a')),
  $$ values (false, null::timestamptz, null::uuid, 0, false) $$,
  'T3 shopping_items: a new item is open, unseen and available');

select throws_ok(
  format($$ update public.shopping_items set checked = true where id = %L $$, tests.fx('item_a')),
  '42501', null, 'T3 shopping_items: a client cannot check an item by update');
select throws_ok(
  format($$ update public.shopping_items set checked_at = now() where id = %L $$, tests.fx('item_a')),
  '42501', null, 'T3 shopping_items: a client cannot write checked_at');
select throws_ok(
  format($$ update public.shopping_items set checked_by = %L where id = %L $$, tests.fx('anna'), tests.fx('item_a')),
  '42501', null, 'T3 shopping_items: a client cannot write checked_by');
select throws_ok(
  format($$ update public.shopping_items set check_seq = 99 where id = %L $$, tests.fx('item_a')),
  '42501', null, 'T3 shopping_items: a client cannot write check_seq');
select throws_ok(
  format($$ update public.shopping_items set not_available = true where id = %L $$, tests.fx('item_a')),
  '42501', null, 'T3 shopping_items: a client cannot write not_available');

-- Defence in depth: even if a grant slipped in, a direct insert by the API role is forced open.
select tests.clear_authentication();
grant insert (checked, checked_at, checked_by, check_seq, not_available) on public.shopping_items to authenticated;
select tests.authenticate_as(tests.fx('anna'));
insert into public.shopping_items (household_id, list_id, article_id, checked, checked_at, checked_by, check_seq, not_available)
values (tests.fx('home_a'), tests.fx('list_a2'), tests.fx('article_a'), true, now(), tests.fx('anna'), 5, true);
select results_eq(
  format($$ select checked, checked_at, checked_by, check_seq, not_available from public.shopping_items where list_id = %L $$,
         tests.fx('list_a2')),
  $$ values (false, null::timestamptz, null::uuid, 0, false) $$,
  'T3 shopping_items: a direct insert by a client is forced to open, check_seq 0, available');
select tests.clear_authentication();
revoke insert (checked, checked_at, checked_by, check_seq, not_available) on public.shopping_items from authenticated;

-- ===================== One open item per article and list =====================
select tests.authenticate_as(tests.fx('anna'));
select throws_ok(
  format($$ insert into public.shopping_items (household_id, list_id, article_id) values (%L, %L, %L) $$,
         tests.fx('home_a'), tests.fx('list_a'), tests.fx('article_a')),
  '23505', null, 'T3 shopping_items: a second open item for the same article on a list is rejected');

-- The store RPCs (T4) check items; here postgres stands in for them.
select tests.clear_authentication();
update public.shopping_items set checked = true, checked_at = now(), checked_by = tests.fx('anna'), check_seq = 1
where id = tests.fx('item_a');
select tests.authenticate_as(tests.fx('anna'));
select lives_ok(
  format($$ insert into public.shopping_items (household_id, list_id, article_id) values (%L, %L, %L) $$,
         tests.fx('home_a'), tests.fx('list_a'), tests.fx('article_a')),
  'T3 shopping_items: an open item next to a checked one for the same article is allowed');
select tests.clear_authentication();
select throws_ok(
  format($$ update public.shopping_items set checked = false where id = %L $$, tests.fx('item_a')),
  '23505', null, 'T3 shopping_items: unchecking cannot create a second open item (the RPC must merge)');
select throws_ok(
  format($$ update public.shopping_items set checked_by = %L where id = %L $$, tests.fx('ben'), tests.fx('item_a')),
  '23503', null, 'T3 shopping_items: checked_by must be a member of the household');

-- ===================== Contributions =====================
select tests.authenticate_as(tests.fx('anna'));
insert into public.shopping_contributions (household_id, item_id, source, count, qty, unit, note)
values (tests.fx('home_a'), tests.fx('item_a'), jsonb_build_object('kind', 'recipe', 'recipeId', gen_random_uuid(), 'label', 'Dal'),
        null, 500, 'g', 'Bio');
select throws_ok(
  format($$ insert into public.shopping_contributions (household_id, item_id, source, count) values (%L, %L, '{"kind": "manual"}', 0) $$,
         tests.fx('home_a'), tests.fx('item_a')),
  '23514', null, 'T3 shopping_contributions: count must be positive');
select throws_ok(
  format($$ insert into public.shopping_contributions (household_id, item_id, source) values (%L, %L, '{"kind": "recipe"}') $$,
         tests.fx('home_a'), tests.fx('item_a')),
  '23514', null, 'T3 shopping_contributions: a recipe source needs its recipe id and label');
delete from public.shopping_items where id = tests.fx('item_a');
select results_eq(
  $$ select table_name, count(*)::int from public.deleted_records group by table_name order by table_name $$,
  $$ values ('shopping_contributions', 1), ('shopping_items', 1) $$,
  'AC-015 shopping_items: deleting an item deletes its contributions, each with a tombstone');

select * from finish();
rollback;
