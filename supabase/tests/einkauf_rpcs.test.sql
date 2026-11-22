-- Spec 0025 "Einkauf": one item per article, "auf der Liste abgehakt" (checked_on_list), the
-- amount "von Hand" (set_manual_amount), removing single origins (remove_item_contributions),
-- restoring at the same place (created_at kept), deleting an article with its checked item,
-- a new store that copies another (create_store) and a deleted area leaving the stores.
begin;
\ir _helpers.psql
select plan(67);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

create temp table kept (key text primary key, value jsonb) on commit drop;
grant select, insert, update on kept to anon, authenticated;
create function tests.kept(p_key text) returns jsonb language sql stable
as $$ select value from kept where key = p_key $$;
grant execute on function tests.kept(text) to anon, authenticated;

-- Contributions of an item as (kind, count, qty, unit), ordered for comparison.
create function tests.amounts(p_item uuid)
returns table (kind text, count int, qty numeric, unit text)
language sql stable
as $$ select c.source ->> 'kind', c.count, c.qty, c.unit from public.shopping_contributions c
      where c.item_id = p_item order by c.created_at, c.id $$;
grant execute on function tests.amounts(uuid) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values
  ('bier'), ('moehren'), ('reibekaese'), ('milch'), ('brot'), ('tee'),
  ('item_bier'), ('item_moehren'), ('item_reibe'), ('item_milch'), ('item_brot'), ('item_tee'),
  ('c_bier'), ('c_moehren_recipe'), ('c_moehren_manual'), ('c_reibe'), ('c_milch'), ('c_brot'), ('c_tee'),
  ('c_milch_new'), ('lasagne'),
  ('drogerie'), ('obst'), ('rewe'), ('dm'), ('store_b'), ('rossmann'), ('lidl');

insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('bier'), tests.fx('home_a'), 'Bier', 'bier'),
  (tests.fx('moehren'), tests.fx('home_a'), 'Möhren', 'mohren'),
  (tests.fx('reibekaese'), tests.fx('home_a'), 'Reibekäse', 'reibekase'),
  (tests.fx('milch'), tests.fx('home_a'), 'Milch', 'milch'),
  (tests.fx('brot'), tests.fx('home_a'), 'Brot', 'brot'),
  (tests.fx('tee'), tests.fx('home_b'), 'Tee', 'tee');
-- created_at decides the place on the list; the trigger would set now() for all of them.
alter table public.shopping_items disable trigger shopping_items_set_timestamps;
alter table public.shopping_contributions disable trigger shopping_contributions_set_timestamps;
insert into public.shopping_items (id, household_id, article_id, checked, checked_at, checked_by, check_seq, created_at) values
  (tests.fx('item_bier'), tests.fx('home_a'), tests.fx('bier'), false, null, null, 0, '2026-11-20T10:00:00Z'),
  (tests.fx('item_moehren'), tests.fx('home_a'), tests.fx('moehren'), false, null, null, 0, '2026-11-20T10:01:00Z'),
  (tests.fx('item_reibe'), tests.fx('home_a'), tests.fx('reibekaese'), false, null, null, 0, '2026-11-20T10:02:00Z'),
  (tests.fx('item_milch'), tests.fx('home_a'), tests.fx('milch'), false, null, null, 0, '2026-11-20T10:03:00Z'),
  (tests.fx('item_brot'), tests.fx('home_a'), tests.fx('brot'), true, now(), tests.fx('nadja'), 1, '2026-11-20T10:04:00Z'),
  (tests.fx('item_tee'), tests.fx('home_b'), tests.fx('tee'), false, null, null, 0, '2026-11-20T10:05:00Z');
insert into public.shopping_contributions (id, household_id, item_id, source, count, qty, unit, created_at) values
  (tests.fx('c_bier'), tests.fx('home_a'), tests.fx('item_bier'), '{"kind": "manual"}', null, 2, 'Kasten', '2026-11-20T10:00:00Z'),
  (tests.fx('c_moehren_recipe'), tests.fx('home_a'), tests.fx('item_moehren'),
   jsonb_build_object('kind', 'recipe', 'recipeId', tests.fx('lasagne'), 'label', 'Lasagne (Mo)'), 1, null, null, '2026-11-20T10:01:00Z'),
  (tests.fx('c_moehren_manual'), tests.fx('home_a'), tests.fx('item_moehren'), '{"kind": "manual"}', null, 500, 'g', '2026-11-20T10:01:30Z'),
  (tests.fx('c_reibe'), tests.fx('home_a'), tests.fx('item_reibe'),
   jsonb_build_object('kind', 'recipe', 'recipeId', tests.fx('lasagne'), 'label', 'Lasagne (Mo)'), null, 75, 'g', '2026-11-20T10:02:00Z'),
  (tests.fx('c_milch'), tests.fx('home_a'), tests.fx('item_milch'), '{"kind": "manual"}', 1, null, null, '2026-11-20T10:03:00Z'),
  (tests.fx('c_brot'), tests.fx('home_a'), tests.fx('item_brot'), '{"kind": "manual"}', 1, null, null, '2026-11-20T10:04:00Z'),
  (tests.fx('c_tee'), tests.fx('home_b'), tests.fx('item_tee'), '{"kind": "manual"}', 1, null, null, '2026-11-20T10:05:00Z');
alter table public.shopping_items enable trigger shopping_items_set_timestamps;
alter table public.shopping_contributions enable trigger shopping_contributions_set_timestamps;

insert into public.areas (id, household_id, name, sort) values
  (tests.fx('drogerie'), tests.fx('home_a'), 'Drogerie', 1),
  (tests.fx('obst'), tests.fx('home_a'), 'Obst & Gemüse', 2);
insert into public.stores (id, household_id, name, area_order, hidden_area_ids) values
  (tests.fx('rewe'), tests.fx('home_a'), 'Rewe Südstadt', array[tests.fx('obst'), tests.fx('drogerie')], array[tests.fx('drogerie')]),
  (tests.fx('dm'), tests.fx('home_a'), 'dm', array[tests.fx('drogerie'), tests.fx('obst')], array[tests.fx('obst')]),
  (tests.fx('store_b'), tests.fx('home_b'), 'Edeka', '{}', '{}');

-- ===================== Schema =====================
select throws_ok(
  format($$ insert into public.shopping_items (household_id, article_id) values (%L, %L) $$,
         tests.fx('home_a'), tests.fx('brot')),
  '23505', null,
  'S-03 shopping_items: an article has at most one item, also next to a checked one');
select throws_ok(
  format($$ insert into public.shopping_contributions (household_id, item_id, source) values (%L, %L, '{"kind": "recurring"}') $$,
         tests.fx('home_a'), tests.fx('item_milch')),
  '23514', null,
  'Entfällt: the source "recurring" is no longer allowed');
select col_not_null('public', 'shopping_items', 'checked_on_list',
  'AC-025 shopping_items.checked_on_list exists and is not null');
select col_default_is('public', 'shopping_items', 'checked_on_list', 'false',
  'AC-025 shopping_items.checked_on_list starts false');

-- ===================== AC-022, AC-025: checked on the list =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(
  (public.set_shopping_item_checked(tests.fx('item_milch'), true, 0, true) ->> 'checked')::boolean, true,
  'AC-022 set_shopping_item_checked: Milch is checked on the list');
select is(
  (select checked_on_list from public.shopping_items where id = tests.fx('item_milch')), true,
  'AC-025 set_shopping_item_checked: the check is marked "auf der Liste abgehakt"');
select is(
  (public.set_shopping_item_checked(tests.fx('item_milch'), false, 1, false) ->> 'checked')::boolean, false,
  'AC-022 set_shopping_item_checked: "Rückgängig" reopens Milch');
select is(
  (select checked_on_list from public.shopping_items where id = tests.fx('item_milch')), false,
  'AC-025 set_shopping_item_checked: reopening clears the mark');
select is(
  (public.set_shopping_item_checked(tests.fx('item_milch'), true, 2) ->> 'checked')::boolean, true,
  'AC-025 set_shopping_item_checked: a check in the store (queue entry without onList) still works');
select is(
  (select checked_on_list from public.shopping_items where id = tests.fx('item_milch')), false,
  'AC-025 set_shopping_item_checked: a check in the store is not "auf der Liste abgehakt"');
select is(
  (public.set_shopping_item_checked(tests.fx('item_milch'), true, 3, true) ->> 'checked')::boolean, true,
  'AC-025 set_shopping_item_checked: checking a checked item again changes nothing');
select is(
  (select checked_on_list from public.shopping_items where id = tests.fx('item_milch')), false,
  'AC-025 set_shopping_item_checked: the earlier check keeps its mark');

-- AC-042: adding a checked article reopens the one item with the new amount.
select public.add_shopping_contributions(tests.fx('home_a'), jsonb_build_array(
  jsonb_build_object('client_item_id', gen_random_uuid(), 'client_article_id', gen_random_uuid(),
                     'article_name', 'Milch', 'name_key', 'milch',
                     'contributions', jsonb_build_array(jsonb_build_object('id', tests.fx('c_milch_new'), 'source', '{"kind": "manual"}'::jsonb, 'count', 2)))));
select results_eq(
  format($$ select id, checked, checked_on_list from public.shopping_items where article_id = %L $$, tests.fx('milch')),
  format($$ values (%L::uuid, false, false) $$, tests.fx('item_milch')),
  'AC-042 add_shopping_contributions: Milch is one open item again');
select results_eq(
  format('select * from tests.amounts(%L)', tests.fx('item_milch')),
  $$ values ('manual', 2, null::numeric, null::text) $$,
  'AC-042 add_shopping_contributions: only the new amount counts');

select tests.authenticate_as(tests.fx('ben'));
select is(
  public.set_shopping_item_checked(tests.fx('item_bier'), true, 0, true), null,
  'AC-025 set_shopping_item_checked: Ben cannot check an item of another household');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.set_shopping_item_checked(%L, true, 0, true)', tests.fx('item_bier')),
  '42501', null, 'AC-025 set_shopping_item_checked: anon cannot call it');
select tests.clear_authentication();
select is(
  (select checked from public.shopping_items where id = tests.fx('item_bier')), false,
  'AC-025 set_shopping_item_checked: Bier is still open');

-- ===================== AC-009, AC-010, AC-012, AC-013: "Von Hand" =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.set_manual_amount(tests.fx('item_bier'), null, 1, 'Kasten') ->> 'removed', 'false',
  'AC-009 set_manual_amount: Bier stays on the list');
select results_eq(
  format('select id, count, qty, unit from public.shopping_contributions where item_id = %L', tests.fx('item_bier')),
  format($$ values (%L::uuid, null::int, 1::numeric, 'Kasten'::text) $$, tests.fx('c_bier')),
  'AC-009 set_manual_amount: "von Hand: 1 Kasten" replaces "2 Kasten" in the same contribution');
select lives_ok(
  format('select public.set_manual_amount(%L, null, 1, %L)', tests.fx('item_moehren'), 'kg'),
  'AC-010 set_manual_amount: "Von Hand" = "1 kg"');
select results_eq(
  format('select * from tests.amounts(%L)', tests.fx('item_moehren')),
  $$ values ('recipe', 1, null::numeric, null::text), ('manual', null, 1::numeric, 'kg'::text) $$,
  'AC-010 set_manual_amount: Möhren 1× · 1 kg, the origin from the recipe stays');
select lives_ok(
  format('select public.set_manual_amount(%L, 3, null, null)', tests.fx('item_moehren')),
  'AC-010 set_manual_amount: a count replaces the quantity');
select results_eq(
  format('select * from tests.amounts(%L)', tests.fx('item_moehren')),
  $$ values ('recipe', 1, null::numeric, null::text), ('manual', 3, null::numeric, null::text) $$,
  'AC-010 set_manual_amount: Möhren 1× from the recipe and 3× von Hand');
select throws_ok(
  format('select public.set_manual_amount(%L, 0, null, null)', tests.fx('item_moehren')),
  '22023', 'invalid_value', 'AC-012 set_manual_amount: 0× is refused');
select throws_ok(
  format('select public.set_manual_amount(%L, 2, 500, %L)', tests.fx('item_moehren'), 'g'),
  '22023', 'invalid_value', 'AC-012 set_manual_amount: a count and a quantity together are refused');
select throws_ok(
  format('select public.set_manual_amount(%L, null, null, %L)', tests.fx('item_moehren'), 'g'),
  '22023', 'invalid_value', 'AC-012 set_manual_amount: a unit without a quantity is refused');
select throws_ok(
  format('select public.set_manual_amount(%L, null, -1, %L)', tests.fx('item_moehren'), 'g'),
  '22023', 'invalid_value', 'AC-012 set_manual_amount: a negative quantity is refused');
select is(
  public.set_manual_amount(gen_random_uuid(), 1, null, null), null,
  'AC-013 set_manual_amount: an item that is gone gives null, no error');
-- Empty "Von Hand" on an item with nothing else removes it, returned for the undo.
insert into kept values ('milch', public.set_manual_amount(tests.fx('item_milch'), null, null, null));
select is(
  tests.kept('milch') ->> 'removed', 'true',
  'AC-009 set_manual_amount: an empty "Von Hand" without other origins removes the item');
select is(
  (select count(*)::int from public.shopping_items where id = tests.fx('item_milch')), 0,
  'AC-009 set_manual_amount: Milch is gone');
select is(
  public.restore_cleared_items(tests.fx('home_a'),
    jsonb_build_array(jsonb_build_object('item', tests.kept('milch') -> 'item', 'contributions', tests.kept('milch') -> 'contributions'))), 1,
  'AC-020 restore_cleared_items: "Rückgängig" brings Milch back');
select is(
  (select created_at from public.shopping_items where id = tests.fx('item_milch')), '2026-11-20T10:03:00Z'::timestamptz,
  'AC-020 restore_cleared_items: Milch is back at its earlier place (created_at kept)');

select tests.authenticate_as(tests.fx('ben'));
select is(
  public.set_manual_amount(tests.fx('item_bier'), 5, null, null), null,
  'AC-009 set_manual_amount: Ben cannot change an item of another household');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.set_manual_amount(%L, 5, null, null)', tests.fx('item_bier')),
  '42501', null, 'AC-009 set_manual_amount: anon cannot call it');
select tests.clear_authentication();
select results_eq(
  format('select qty from public.shopping_contributions where item_id = %L', tests.fx('item_bier')),
  $$ values (1::numeric) $$,
  'AC-009 set_manual_amount: Bier still has 1 Kasten');

-- ===================== AC-010, AC-011, AC-013: ✕ per origin =====================
select tests.authenticate_as(tests.fx('enrico'));
insert into kept values ('lasagne', public.remove_item_contributions(tests.fx('item_moehren'), array[tests.fx('c_moehren_recipe')]));
select results_eq(
  format('select * from tests.amounts(%L)', tests.fx('item_moehren')),
  $$ values ('manual', 3, null::numeric, null::text) $$,
  'AC-010 remove_item_contributions: ✕ at "Lasagne (Mo)" leaves only "von Hand"');
select is(
  jsonb_array_length(tests.kept('lasagne') -> 0 -> 'contributions'), 1,
  'AC-010 remove_item_contributions: returns the item with the removed contribution for the undo');
select is(
  public.restore_cleared_items(tests.fx('home_a'), tests.kept('lasagne')), 1,
  'AC-010 restore_cleared_items: "Rückgängig" puts "Lasagne (Mo)" back on Möhren');
select results_eq(
  format('select * from tests.amounts(%L)', tests.fx('item_moehren')),
  $$ values ('recipe', 1, null::numeric, null::text), ('manual', 3, null::numeric, null::text) $$,
  'AC-010 restore_cleared_items: the origin is back in its order');
insert into kept values ('reibe', public.remove_item_contributions(tests.fx('item_reibe'), array[tests.fx('c_reibe')]));
select is(
  (select count(*)::int from public.shopping_items where id = tests.fx('item_reibe')), 0,
  'AC-011 remove_item_contributions: the last origin removes Reibekäse');
select is(
  public.restore_cleared_items(tests.fx('home_a'), tests.kept('reibe')), 1,
  'AC-011 restore_cleared_items: "Rückgängig" brings Reibekäse back');
select is(
  (select created_at from public.shopping_items where id = tests.fx('item_reibe')), '2026-11-20T10:02:00Z'::timestamptz,
  'AC-011 restore_cleared_items: Reibekäse is back at the same place');
select is(
  public.remove_item_contributions(tests.fx('item_bier'), array[tests.fx('c_moehren_manual')]), '[]'::jsonb,
  'AC-010 remove_item_contributions: a contribution of another item is ignored');
select is(
  public.remove_item_contributions(gen_random_uuid(), array[tests.fx('c_bier')]), null,
  'AC-013 remove_item_contributions: an item that is gone gives null, no error');
select throws_ok(
  format('select public.remove_item_contributions(%L, %L::uuid[])', tests.fx('item_bier'), '{}'),
  '22023', 'invalid_value', 'AC-010 remove_item_contributions: no ids is refused');
-- A restored entry from the future does not jump ahead of everything.
update kept set value = jsonb_set(value, '{0,item,created_at}', '"2999-01-01T00:00:00Z"') where key = 'reibe';
select lives_ok(
  format('select public.remove_item_contributions(%L, array[%L]::uuid[])', tests.fx('item_reibe'), tests.fx('c_reibe')),
  'AC-011 remove_item_contributions: Reibekäse removed again');
select lives_ok(
  format('select public.restore_cleared_items(%L, %L)', tests.fx('home_a'), tests.kept('reibe')),
  'AC-011 restore_cleared_items: restoring an entry dated in the future');
select ok(
  (select created_at <= now() from public.shopping_items where id = tests.fx('item_reibe')),
  'AC-011 restore_cleared_items: created_at is never later than now()');
select tests.authenticate_as(tests.fx('ben'));
select is(
  public.remove_item_contributions(tests.fx('item_bier'), array[tests.fx('c_bier')]), null,
  'AC-010 remove_item_contributions: Ben cannot remove an origin in another household');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.remove_item_contributions(%L, array[%L]::uuid[])', tests.fx('item_bier'), tests.fx('c_bier')),
  '42501', null, 'AC-010 remove_item_contributions: anon cannot call it');

-- ===================== AC-047, AC-048: deleting an article =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.delete_article(tests.fx('brot')) ->> 'name', 'Brot',
  'AC-047 delete_article: Brot, only checked on the list, is deleted');
select is(
  (select count(*)::int from public.shopping_items where article_id = tests.fx('brot')), 0,
  'AC-047 delete_article: its checked item goes with it');
select throws_ok(
  format('select public.delete_article(%L)', tests.fx('milch')),
  'P0001', 'article_in_use', 'AC-048 delete_article: Milch is open on the list');

-- ===================== AC-050, AC-051: a new store =====================
select is(
  public.create_store(tests.fx('home_a'), tests.fx('rossmann'), 'Rossmann', tests.fx('dm')) ->> 'name', 'Rossmann',
  'AC-050 create_store: "Rossmann" is created');
select results_eq(
  format('select area_order, hidden_area_ids from public.stores where id = %L', tests.fx('rossmann')),
  format('select area_order, hidden_area_ids from public.stores where id = %L', tests.fx('dm')),
  'AC-050 create_store: walking order and hidden areas are those of dm');
update public.stores set hidden_area_ids = '{}' where id = tests.fx('dm');
select results_eq(
  format('select hidden_area_ids from public.stores where id = %L', tests.fx('rossmann')),
  format($$ values (array[%L]::uuid[]) $$, tests.fx('obst')),
  'AC-050 create_store: later changes to dm do not reach Rossmann');
select results_eq(
  format('select area_order, hidden_area_ids from public.stores where id = %L',
         public.create_store(tests.fx('home_a'), tests.fx('lidl'), 'Lidl', null) ->> 'id'),
  format($$ values (array[%L, %L]::uuid[], '{}'::uuid[]) $$, tests.fx('drogerie'), tests.fx('obst')),
  'AC-051 create_store: without a choice the areas in their own order, nothing hidden');
select throws_ok(
  format('select public.create_store(%L, gen_random_uuid(), %L, %L)', tests.fx('home_a'), 'Netto', tests.fx('store_b')),
  'P0002', 'store_not_found', 'AC-050 create_store: a store of another household cannot be copied');
select throws_ok(
  format('select public.create_store(%L, gen_random_uuid(), %L, null)', tests.fx('home_b'), 'Netto'),
  '42501', 'not_member', 'AC-050 create_store: not in another household');
select throws_ok(
  format('select public.create_store(%L, gen_random_uuid(), %L, null)', tests.fx('home_a'), '  '),
  '23514', null, 'AC-050 create_store: a blank name is refused');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.create_store(%L, gen_random_uuid(), %L, null)', tests.fx('home_a'), 'Netto'),
  '42501', null, 'AC-050 create_store: anon cannot call it');

-- ===================== merge_articles: one item per article =====================
select tests.clear_authentication();
insert into fx (key) values ('kaese_alt'), ('kaese'), ('saft_alt'), ('saft'),
  ('item_kaese_alt'), ('item_kaese'), ('item_saft_alt'), ('item_saft'), ('c_kaese_alt'), ('c_kaese'), ('c_saft_alt'), ('c_saft');
insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('kaese_alt'), tests.fx('home_a'), 'Kaese', 'kaese'),
  (tests.fx('kaese'), tests.fx('home_a'), 'Käse', 'kase'),
  (tests.fx('saft_alt'), tests.fx('home_a'), 'Apfelsaft trüb', 'apfelsaft trub'),
  (tests.fx('saft'), tests.fx('home_a'), 'Apfelsaft', 'apfelsaft');
insert into public.shopping_items (id, household_id, article_id, checked, checked_at, checked_by, check_seq) values
  (tests.fx('item_kaese_alt'), tests.fx('home_a'), tests.fx('kaese_alt'), false, null, null, 0),
  (tests.fx('item_kaese'), tests.fx('home_a'), tests.fx('kaese'), true, now(), tests.fx('nadja'), 1),
  (tests.fx('item_saft_alt'), tests.fx('home_a'), tests.fx('saft_alt'), true, now(), tests.fx('nadja'), 1),
  (tests.fx('item_saft'), tests.fx('home_a'), tests.fx('saft'), false, null, null, 0);
insert into public.shopping_contributions (id, household_id, item_id, source, count) values
  (tests.fx('c_kaese_alt'), tests.fx('home_a'), tests.fx('item_kaese_alt'), '{"kind": "manual"}', 2),
  (tests.fx('c_kaese'), tests.fx('home_a'), tests.fx('item_kaese'), '{"kind": "manual"}', 1),
  (tests.fx('c_saft_alt'), tests.fx('home_a'), tests.fx('item_saft_alt'), '{"kind": "manual"}', 1),
  (tests.fx('c_saft'), tests.fx('home_a'), tests.fx('item_saft'), '{"kind": "manual"}', 3);
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.merge_articles(tests.fx('kaese_alt'), tests.fx('kaese')), '{"recipes": 0, "items": 1}'::jsonb,
  'S-03 merge_articles: the open source item goes into the checked target item');
select results_eq(
  format($$ select i.id, i.checked, (select array_agg(c.id) from public.shopping_contributions c where c.item_id = i.id)
            from public.shopping_items i where i.article_id = %L $$, tests.fx('kaese')),
  format($$ values (%L::uuid, false, array[%L::uuid]) $$, tests.fx('item_kaese'), tests.fx('c_kaese_alt')),
  'S-03 merge_articles: Käse is open again with only the need of the source');
select is(
  (select replaced_by from public.deleted_records where table_name = 'shopping_items' and record_id = tests.fx('item_kaese_alt')::text),
  tests.fx('item_kaese')::text,
  'S-03 merge_articles: the tombstone of the source item names the target item');
select lives_ok(
  format('select public.merge_articles(%L, %L)', tests.fx('saft_alt'), tests.fx('saft')),
  'S-03 merge_articles: a checked source item next to an open target item');
select results_eq(
  format($$ select i.id, i.checked, (select array_agg(c.id) from public.shopping_contributions c where c.item_id = i.id)
            from public.shopping_items i where i.article_id = %L $$, tests.fx('saft')),
  format($$ values (%L::uuid, false, array[%L::uuid]) $$, tests.fx('item_saft'), tests.fx('c_saft')),
  'S-03 merge_articles: the open Apfelsaft stays as it was, the bought one adds nothing');

-- ===================== A deleted area leaves every store =====================
select tests.authenticate_as(tests.fx('enrico'));
delete from public.areas where id = tests.fx('drogerie');
select is_empty(
  format($$ select id from public.stores where %L = any (area_order) or %L = any (hidden_area_ids) $$,
         tests.fx('drogerie'), tests.fx('drogerie')),
  'Daten: a deleted area leaves the walking order and the hidden areas of every store');

select * from finish();
rollback;
