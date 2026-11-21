-- Shopping items and contributions (spec 0003, T3). Check state (checked, checked_at,
-- checked_by, check_seq, not_available) changes only through the store RPCs of T4: a client
-- cannot set it on insert or change it by update. Items belong to the household: there is no list
-- table (ADR-0012), and a household has at most one open item per article.
begin;
\ir _helpers.psql
select plan(22);

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
insert into fx (key) values ('article_a'), ('article_a2'), ('article_b'), ('item_a');

insert into public.articles (id, household_id, name, name_key)
values (tests.fx('article_a'), tests.fx('home_a'), 'Milch', 'milch'),
       (tests.fx('article_a2'), tests.fx('home_a'), 'Butter', 'butter');
insert into public.articles (id, household_id, name, name_key)
values (tests.fx('article_b'), tests.fx('home_b'), 'Milch', 'milch');

-- ===================== No list table =====================
select hasnt_table('public', 'shopping_lists', 'ADR-0012: there is no table shopping_lists');
select hasnt_column('public', 'households', 'default_list_id', 'ADR-0012: households has no default_list_id');
select hasnt_column('public', 'shopping_items', 'list_id', 'ADR-0012: shopping_items has no list_id');
select is(
  (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'shopping_items_open_article_idx'),
  'CREATE UNIQUE INDEX shopping_items_open_article_idx ON public.shopping_items USING btree (household_id, article_id) WHERE (NOT checked)',
  'ADR-0012 shopping_items: the open item is unique per household and article');

-- ===================== Check state belongs to the store RPCs =====================
select tests.authenticate_as(tests.fx('anna'));
select throws_ok(
  format($$ insert into public.shopping_items (household_id, article_id, checked) values (%L, %L, true) $$,
         tests.fx('home_a'), tests.fx('article_a')),
  '42501', null, 'T3 shopping_items: a client cannot insert an item as checked');
select throws_ok(
  format($$ insert into public.shopping_items (household_id, article_id, check_seq) values (%L, %L, 7) $$,
         tests.fx('home_a'), tests.fx('article_a')),
  '42501', null, 'T3 shopping_items: a client cannot insert check_seq');
select throws_ok(
  format($$ insert into public.shopping_items (household_id, article_id, not_available) values (%L, %L, true) $$,
         tests.fx('home_a'), tests.fx('article_a')),
  '42501', null, 'T3 shopping_items: a client cannot insert not_available');
insert into public.shopping_items (id, household_id, article_id)
values (tests.fx('item_a'), tests.fx('home_a'), tests.fx('article_a'));
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
insert into public.shopping_items (household_id, article_id, checked, checked_at, checked_by, check_seq, not_available)
values (tests.fx('home_a'), tests.fx('article_a2'), true, now(), tests.fx('anna'), 5, true);
select results_eq(
  format($$ select checked, checked_at, checked_by, check_seq, not_available from public.shopping_items where article_id = %L $$,
         tests.fx('article_a2')),
  $$ values (false, null::timestamptz, null::uuid, 0, false) $$,
  'T3 shopping_items: a direct insert by a client is forced to open, check_seq 0, available');
select tests.clear_authentication();
revoke insert (checked, checked_at, checked_by, check_seq, not_available) on public.shopping_items from authenticated;

-- ===================== One open item per article and household =====================
select tests.authenticate_as(tests.fx('anna'));
select throws_ok(
  format($$ insert into public.shopping_items (household_id, article_id) values (%L, %L) $$,
         tests.fx('home_a'), tests.fx('article_a')),
  '23505', null, 'ADR-0012 shopping_items: a second open Milch in the same household is rejected');

-- The store RPCs (T4) check items; here postgres stands in for them.
select tests.clear_authentication();
update public.shopping_items set checked = true, checked_at = now(), checked_by = tests.fx('anna'), check_seq = 1
where id = tests.fx('item_a');
select tests.authenticate_as(tests.fx('anna'));
select lives_ok(
  format($$ insert into public.shopping_items (household_id, article_id) values (%L, %L) $$,
         tests.fx('home_a'), tests.fx('article_a')),
  'ADR-0012 shopping_items: an open Milch next to a checked one in the same household is allowed');
select tests.authenticate_as(tests.fx('ben'));
select lives_ok(
  format($$ insert into public.shopping_items (household_id, article_id) values (%L, %L) $$,
         tests.fx('home_b'), tests.fx('article_b')),
  'ADR-0012 shopping_items: household B has its own open Milch while A has one');
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
