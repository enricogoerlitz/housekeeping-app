-- List editing RPCs of spec 0006: + and − per tap (adjust_item_count, REQ-003), the note of a
-- whole item via apply_changes (AC-021), removing while someone checks (AC-026), clearing the
-- whole list with undo (clear_shopping_list + restore_cleared_items, REQ-006, AC-035…AC-038).
begin;
\ir _helpers.psql
select plan(57);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- Results kept for later calls (removed item of adjust_item_count, cleared list).
create temp table kept (key text primary key, value jsonb) on commit drop;
grant select, insert on kept to anon, authenticated;
create function tests.kept(p_key text) returns jsonb language sql stable
as $$ select value from kept where key = p_key $$;
grant execute on function tests.kept(text) to anon, authenticated;

-- Contributions of an item as (kind, count, qty), ordered for comparison.
create function tests.amounts(p_item uuid)
returns table (kind text, count int, qty numeric)
language sql stable
as $$ select c.source ->> 'kind', c.count, c.qty from public.shopping_contributions c
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
  ('lasagne'), ('kuchen'), ('pfannkuchen'), ('suppe'),
  ('zwiebeln'), ('eier'), ('milch'), ('moehren'), ('brot'), ('kaese'), ('tee'),
  ('item_zw'), ('item_eier'), ('item_milch'), ('item_moehren'), ('item_brot'), ('item_kaese'), ('item_b'),
  ('c_zw'), ('c_eier_kuchen'), ('c_eier_pfann'), ('c_milch'), ('c_moehren'), ('c_brot'), ('c_k1'), ('c_k2'), ('c_b'),
  ('item_milch_new'), ('c_milch_new'), ('item_brot_new'), ('c_brot_new');

insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('zwiebeln'), tests.fx('home_a'), 'Zwiebeln', 'zwiebeln'),
  (tests.fx('eier'), tests.fx('home_a'), 'Eier', 'eier'),
  (tests.fx('milch'), tests.fx('home_a'), 'Milch', 'milch'),
  (tests.fx('moehren'), tests.fx('home_a'), 'Möhren', 'mohren'),
  (tests.fx('brot'), tests.fx('home_a'), 'Brot', 'brot'),
  (tests.fx('kaese'), tests.fx('home_a'), 'Käse', 'kase'),
  (tests.fx('tee'), tests.fx('home_b'), 'Tee', 'tee');
insert into public.shopping_items (id, household_id, article_id, checked, checked_at, checked_by, check_seq) values
  (tests.fx('item_zw'), tests.fx('home_a'), tests.fx('zwiebeln'), false, null, null, 0),
  (tests.fx('item_eier'), tests.fx('home_a'), tests.fx('eier'), false, null, null, 0),
  (tests.fx('item_milch'), tests.fx('home_a'), tests.fx('milch'), false, null, null, 0),
  (tests.fx('item_moehren'), tests.fx('home_a'), tests.fx('moehren'), false, null, null, 0),
  (tests.fx('item_brot'), tests.fx('home_a'), tests.fx('brot'), true, now(), tests.fx('nadja'), 1),
  (tests.fx('item_kaese'), tests.fx('home_a'), tests.fx('kaese'), false, null, null, 0),
  (tests.fx('item_b'), tests.fx('home_b'), tests.fx('tee'), false, null, null, 0);
-- created_at decides "most recently added"; the trigger would set now() for all of them.
alter table public.shopping_contributions disable trigger shopping_contributions_set_timestamps;
insert into public.shopping_contributions (id, household_id, item_id, source, count, qty, unit, created_at) values
  (tests.fx('c_zw'), tests.fx('home_a'), tests.fx('item_zw'),
   jsonb_build_object('kind', 'recipe', 'recipeId', tests.fx('lasagne'), 'label', 'Lasagne (Fr)'), 1, null, null, now() - interval '3 hours'),
  (tests.fx('c_eier_kuchen'), tests.fx('home_a'), tests.fx('item_eier'),
   jsonb_build_object('kind', 'recipe', 'recipeId', tests.fx('kuchen'), 'label', 'Kuchen (Mi)'), 1, null, null, now() - interval '2 hours'),
  (tests.fx('c_eier_pfann'), tests.fx('home_a'), tests.fx('item_eier'),
   jsonb_build_object('kind', 'recipe', 'recipeId', tests.fx('pfannkuchen'), 'label', 'Pfannkuchen (Sa)'), 1, null, null, now() - interval '1 hour'),
  (tests.fx('c_milch'), tests.fx('home_a'), tests.fx('item_milch'), '{"kind": "manual"}', 1, null, null, now() - interval '3 hours'),
  (tests.fx('c_moehren'), tests.fx('home_a'), tests.fx('item_moehren'),
   jsonb_build_object('kind', 'recipe', 'recipeId', tests.fx('suppe'), 'label', 'Kürbissuppe (Sa)'), null, 500, 'g', now() - interval '3 hours'),
  (tests.fx('c_brot'), tests.fx('home_a'), tests.fx('item_brot'), '{"kind": "manual"}', 1, null, null, now() - interval '3 hours'),
  (tests.fx('c_k1'), tests.fx('home_a'), tests.fx('item_kaese'), '{"kind": "manual"}', 1, null, null, now() - interval '3 hours'),
  (tests.fx('c_k2'), tests.fx('home_a'), tests.fx('item_kaese'),
   jsonb_build_object('kind', 'recipe', 'recipeId', tests.fx('lasagne'), 'label', 'Lasagne (Fr)'), 1, null, null, now() - interval '2 hours'),
  (tests.fx('c_b'), tests.fx('home_b'), tests.fx('item_b'), '{"kind": "manual"}', 1, null, null, now() - interval '3 hours');
alter table public.shopping_contributions enable trigger shopping_contributions_set_timestamps;

-- ===================== adjust_item_count: + =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.adjust_item_count(tests.fx('item_zw'), 1),
  jsonb_build_object('item_id', tests.fx('item_zw'), 'count', 2, 'removed', false),
  'AC-014 adjust_item_count: + on 1× from a recipe gives 2×');
select results_eq(
  format('select * from tests.amounts(%L)', tests.fx('item_zw')),
  $$ values ('recipe', 1, null::numeric), ('manual', 1, null::numeric) $$,
  'AC-014 adjust_item_count: + adds a "von Hand" contribution with 1×, the recipe part stays');
select is(
  public.adjust_item_count(tests.fx('item_zw'), 1) ->> 'count', '3',
  'AC-014 adjust_item_count: a second + counts too');
select results_eq(
  format('select * from tests.amounts(%L)', tests.fx('item_zw')),
  $$ values ('recipe', 1, null::numeric), ('manual', 2, null::numeric) $$,
  'AC-014 adjust_item_count: a second + increases the existing "von Hand" contribution');

-- ===================== adjust_item_count: − =====================
select is(
  public.adjust_item_count(tests.fx('item_zw'), -1) ->> 'count', '2',
  'AC-015 adjust_item_count: − decreases the "von Hand" part first');
select is(
  public.adjust_item_count(tests.fx('item_zw'), -1),
  jsonb_build_object('item_id', tests.fx('item_zw'), 'count', 1, 'removed', false),
  'AC-015 adjust_item_count: − on "Lasagne (Fr): 1× · von Hand: 1×" gives 1×');
select results_eq(
  format('select * from tests.amounts(%L)', tests.fx('item_zw')),
  $$ values ('recipe', 1, null::numeric) $$,
  'AC-015 adjust_item_count: the emptied "von Hand" contribution is deleted, the origin is "Lasagne (Fr): 1×"');
select is(
  (select count(*)::int from public.deleted_records
   where table_name = 'shopping_contributions' and household_id = tests.fx('home_a')), 1,
  'AC-015 adjust_item_count: the deleted contribution leaves a tombstone');
insert into kept values ('removed_zw', public.adjust_item_count(tests.fx('item_zw'), -1));
select is(
  tests.kept('removed_zw') - 'item' - 'contributions',
  jsonb_build_object('item_id', tests.fx('item_zw'), 'count', 0, 'removed', true),
  'AC-015 adjust_item_count: − on 1× removes the item');
select is(
  (select count(*)::int from public.shopping_items where id = tests.fx('item_zw')), 0,
  'AC-015 adjust_item_count: the item is gone from the list');
select results_eq(
  $$ select (tests.kept('removed_zw') -> 'item' ->> 'id')::uuid, (c ->> 'id')::uuid, (c ->> 'count')::int
     from jsonb_array_elements(tests.kept('removed_zw') -> 'contributions') c $$,
  format($$ values (%L::uuid, %L::uuid, 1) $$, tests.fx('item_zw'), tests.fx('c_zw')),
  'AC-015 adjust_item_count: the result holds the item and its contributions as they were before the tap');
select is(
  public.restore_cleared_items(tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('item', tests.kept('removed_zw') -> 'item', 'contributions', tests.kept('removed_zw') -> 'contributions'))),
  1,
  'AC-015 adjust_item_count: "Rückgängig" restores the removed item');
select results_eq(
  format($$ select i.checked, a.kind, a.count from public.shopping_items i, tests.amounts(i.id) a where i.id = %L $$, tests.fx('item_zw')),
  $$ values (false, 'recipe', 1) $$,
  'AC-015 adjust_item_count: the item is back open with the origin "Lasagne (Fr): 1×"');

select is(
  public.adjust_item_count(tests.fx('item_eier'), -1) ->> 'count', '1',
  'AC-016 adjust_item_count: − on two recipe contributions gives 1×');
select results_eq(
  format('select c.id from public.shopping_contributions c where c.item_id = %L', tests.fx('item_eier')),
  format($$ values (%L::uuid) $$, tests.fx('c_eier_kuchen')),
  'AC-016 adjust_item_count: − takes the most recently added recipe contribution ("Pfannkuchen (Sa)")');

-- ===================== AC-017: every tap counts =====================
select is(
  public.adjust_item_count(tests.fx('item_milch'), 1) ->> 'count', '2',
  'AC-017 adjust_item_count: Enrico''s + on Milch');
select tests.authenticate_as(tests.fx('nadja'));
select is(
  public.adjust_item_count(tests.fx('item_milch'), 1) ->> 'count', '3',
  'AC-017 adjust_item_count: Nadja''s + right after Enrico''s is added, not overwritten');
select results_eq(
  format('select * from tests.amounts(%L)', tests.fx('item_milch')),
  $$ values ('manual', 3, null::numeric) $$,
  'AC-017 adjust_item_count: Milch has 3× in one "von Hand" contribution');

-- ===================== Bounds and invalid input =====================
select tests.clear_authentication();
update public.shopping_contributions set count = 98 where id = tests.fx('c_milch');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.adjust_item_count(tests.fx('item_milch'), 1) ->> 'count', '99',
  'AC-017 adjust_item_count: + up to 99× is allowed');
select throws_ok(
  format('select public.adjust_item_count(%L, 1)', tests.fx('item_milch')),
  '22023', 'invalid_value', 'AC-017 adjust_item_count: + beyond 99× is rejected');
select throws_ok(
  format('select public.adjust_item_count(%L, 0)', tests.fx('item_milch')),
  '22023', 'invalid_value', 'AC-017 adjust_item_count: a delta of 0 is rejected');
select throws_ok(
  format('select public.adjust_item_count(%L, null)', tests.fx('item_milch')),
  '22023', 'invalid_value', 'AC-017 adjust_item_count: a missing delta is rejected');
select throws_ok(
  format('select public.adjust_item_count(%L, -100)', tests.fx('item_milch')),
  '22023', 'invalid_value', 'AC-017 adjust_item_count: −100 is rejected');
select throws_ok(
  format('select public.adjust_item_count(%L, -2)', tests.fx('item_eier')),
  '22023', 'invalid_value', 'AC-017 adjust_item_count: − below 0× is rejected');
select throws_ok(
  format('select public.adjust_item_count(%L, -1)', tests.fx('item_moehren')),
  '22023', 'invalid_value', 'AC-018 adjust_item_count: − on a quantity without a count is rejected');
select results_eq(
  format('select * from tests.amounts(%L)', tests.fx('item_moehren')),
  $$ values ('recipe', null::int, 500::numeric) $$,
  'AC-018 adjust_item_count: the quantity "500 g" is never changed by + or −');
select is(
  public.adjust_item_count(gen_random_uuid(), 1), null,
  'AC-027 adjust_item_count: an item that is gone gives null');

-- ===================== Foreign household, anon =====================
select tests.authenticate_as(tests.fx('ben'));
select is(
  public.adjust_item_count(tests.fx('item_milch'), -1), null,
  'AC-038 adjust_item_count: an item of another household gives null');
select tests.clear_authentication();
select is(
  (select count from public.shopping_contributions where id = tests.fx('c_milch')), 99,
  'AC-038 adjust_item_count: the item of the other household is unchanged');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.adjust_item_count(%L, 1)', tests.fx('item_milch')),
  '42501', null, 'AC-038 adjust_item_count: anon cannot call it');

-- ===================== AC-021: the note of a whole item =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  format($$ select public.apply_changes(%L, %L) $$, tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'patch', 'table', 'shopping_contributions', 'id', tests.fx('c_k1'), 'changes', '{"note": "laktosefrei"}'::jsonb),
    jsonb_build_object('kind', 'patch', 'table', 'shopping_contributions', 'id', tests.fx('c_k2'), 'changes', '{"note": "laktosefrei"}'::jsonb))),
  'AC-021 apply_changes: the note is patched on every contribution of the item in one call');
select results_eq(
  format('select note from public.shopping_contributions where item_id = %L', tests.fx('item_kaese')),
  $$ values ('laktosefrei'), ('laktosefrei') $$,
  'AC-021 apply_changes: every contribution has the new note');
select lives_ok(
  format($$ select public.apply_changes(%L, %L) $$, tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'patch', 'table', 'shopping_contributions', 'id', tests.fx('c_k1'), 'changes', '{"note": null}'::jsonb),
    jsonb_build_object('kind', 'patch', 'table', 'shopping_contributions', 'id', tests.fx('c_k2'), 'changes', '{"note": null}'::jsonb))),
  'AC-021 apply_changes: the note can be cleared again');
select is(
  (select count(*)::int from public.shopping_contributions where item_id = tests.fx('item_kaese') and note is null), 2,
  'AC-021 apply_changes: no contribution keeps a note');
select throws_ok(
  format($$ select public.apply_changes(%L, %L) $$, tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'patch', 'table', 'shopping_contributions', 'id', tests.fx('c_k1'),
                       'changes', jsonb_build_object('note', repeat('x', 201))))),
  '23514', null, 'AC-022 apply_changes: a note of 201 characters is rejected');

-- ===================== AC-026: removed while someone checks =====================
select lives_ok(
  format($$ select public.apply_changes(%L, %L) $$, tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'delete', 'table', 'shopping_items', 'id', tests.fx('item_kaese')))),
  'AC-026 apply_changes: Enrico removes Käse');
select tests.authenticate_as(tests.fx('nadja'));
select is(
  public.set_shopping_item_checked(tests.fx('item_kaese'), true, 0), null,
  'AC-026 set_shopping_item_checked: Nadja''s queued check of the removed item is dropped without an error');
select is(
  (select count(*)::int from public.shopping_items where id = tests.fx('item_kaese')), 0,
  'AC-026 set_shopping_item_checked: the removed item stays removed');

-- ===================== clear_shopping_list: foreign household, anon =====================
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format('select public.clear_shopping_list(%L)', tests.fx('home_a')),
  '42501', 'not_member', 'AC-038 clear_shopping_list: the shopping list of another household is refused (not_member)');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.shopping_items where household_id = tests.fx('home_a')), 5,
  'AC-038 clear_shopping_list: no item of the other household was removed');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.clear_shopping_list(%L)', tests.fx('home_a')),
  '42501', null, 'AC-038 clear_shopping_list: anon cannot call it');

-- ===================== AC-035: clear the list =====================
-- home_a: Zwiebeln, Eier, Milch, Möhren open; Brot checked.
select tests.clear_authentication();
create temp table before_clear on commit drop as
  select i.*, (select jsonb_agg(to_jsonb(c) order by c.created_at, c.id) from public.shopping_contributions c where c.item_id = i.id) as contributions
  from public.shopping_items i where i.household_id = tests.fx('home_a');
grant select on before_clear to authenticated;
select tests.authenticate_as(tests.fx('enrico'));
insert into kept values ('cleared', public.clear_shopping_list(tests.fx('home_a')));
select is(
  tests.kept('cleared'),
  (select jsonb_agg(jsonb_build_object('item', to_jsonb(b) - 'contributions', 'contributions', b.contributions)
                    order by b.created_at, b.id) from before_clear b),
  'AC-035 clear_shopping_list: returns every item, open and checked, with its contributions');
select is(
  (select count(*)::int from public.shopping_items where household_id = tests.fx('home_a'))
    + (select count(*)::int from public.shopping_contributions where household_id = tests.fx('home_a')),
  0,
  'AC-035 clear_shopping_list: the list is empty, the contributions are gone');
select is(
  (select count(distinct d.record_id)::int from public.deleted_records d join before_clear b on d.record_id = b.id::text
   where d.table_name = 'shopping_items'),
  5,
  'AC-035 clear_shopping_list: every removed item leaves a tombstone, so it disappears for Nadja too');
select is(
  public.clear_shopping_list(tests.fx('home_a')), '[]'::jsonb,
  'AC-035 clear_shopping_list: an empty list gives an empty array');
select throws_ok(
  format('select public.clear_shopping_list(%L)', tests.fx('home_b')),
  '42501', 'not_member', 'AC-038 clear_shopping_list: Enrico cannot clear the list of "WG Köln" (not_member)');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.shopping_items where household_id = tests.fx('home_b')), 1,
  'AC-038 clear_shopping_list: the list of "WG Köln" keeps its item');

-- ===================== AC-037: undo after someone added =====================
select tests.authenticate_as(tests.fx('nadja'));
select public.add_shopping_contributions(tests.fx('home_a'), jsonb_build_array(
  jsonb_build_object('client_item_id', tests.fx('item_milch_new'), 'client_article_id', gen_random_uuid(),
                     'article_name', 'Milch', 'name_key', 'milch',
                     'contributions', jsonb_build_array(jsonb_build_object('id', tests.fx('c_milch_new'), 'source', '{"kind": "manual"}'::jsonb, 'count', 1))),
  jsonb_build_object('client_item_id', tests.fx('item_brot_new'), 'client_article_id', gen_random_uuid(),
                     'article_name', 'Brot', 'name_key', 'brot',
                     'contributions', jsonb_build_array(jsonb_build_object('id', tests.fx('c_brot_new'), 'source', '{"kind": "manual"}'::jsonb, 'count', 1)))));
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.restore_cleared_items(tests.fx('home_a'), tests.kept('cleared')), 5,
  'AC-037 restore_cleared_items: every cleared item is restored');
select results_eq(
  format($$ select i.id, i.checked, (select array_agg(c.id order by c.id) from public.shopping_contributions c where c.item_id = i.id)
            from public.shopping_items i where i.household_id = %L and i.article_id = %L $$, tests.fx('home_a'), tests.fx('milch')),
  format($$ values (%L::uuid, false, (select array_agg(x order by x) from unnest(array[%L::uuid, %L::uuid]) x)) $$,
         tests.fx('item_milch_new'), tests.fx('c_milch'), tests.fx('c_milch_new')),
  'AC-037 restore_cleared_items: Milch is one open item with my earlier and Nadja''s new contribution');
select is(
  (select sum(count)::int from public.shopping_contributions where item_id = tests.fx('item_milch_new')), 100,
  'AC-037 restore_cleared_items: the counts of both contributions add up');
select results_eq(
  format($$ select id, checked from public.shopping_items where household_id = %L and article_id = %L order by checked $$,
         tests.fx('home_a'), tests.fx('brot')),
  format($$ values (%L::uuid, false), (%L::uuid, true) $$, tests.fx('item_brot_new'), tests.fx('item_brot')),
  'AC-037 restore_cleared_items: a checked item comes back checked, next to the open item of the same article');
select results_eq(
  format($$ select id, checked from public.shopping_items where id in (%L, %L, %L) order by id $$,
         tests.fx('item_zw'), tests.fx('item_eier'), tests.fx('item_moehren')),
  format($$ select * from (values (%L::uuid, false), (%L::uuid, false), (%L::uuid, false)) v order by 1 $$,
         tests.fx('item_zw'), tests.fx('item_eier'), tests.fx('item_moehren')),
  'AC-037 restore_cleared_items: open items come back open with their ids');
select is(
  (select count(*)::int from public.shopping_contributions where household_id = tests.fx('home_a')), 7,
  'AC-037 restore_cleared_items: every contribution is back, none twice');
select is(
  public.restore_cleared_items(tests.fx('home_a'), tests.kept('cleared')), 0,
  'AC-037 restore_cleared_items: a repeated undo restores nothing');
select is(
  (select count(*)::int from public.shopping_items where household_id = tests.fx('home_a'))
    + (select count(*)::int from public.shopping_contributions where household_id = tests.fx('home_a')),
  6 + 7,
  'AC-037 restore_cleared_items: a repeated undo duplicates no item and no contribution');

-- ===================== ADR-0012: no list =====================
select hasnt_function('private', 'merge_shopping_lists', 'ADR-0012: the list merge is gone');
select has_function('private', 'lock_household_article', array['uuid', 'uuid'],
  'ADR-0012: adding, unchecking and restoring lock per household and article');

select * from finish();
rollback;
