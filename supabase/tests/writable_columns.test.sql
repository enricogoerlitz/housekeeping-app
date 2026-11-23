-- Spec 0031, REQ-014 and REQ-026 — households.meal_slots and recipes.photo are not writable by
-- members any more: neither the column grant nor the allowlist of apply_changes has them.
-- create_household still sets the three meal slots, the seed still sets photo (as postgres). The
-- grants of the API role and the allowlist of apply_changes stay identical for every table.
-- Covers AC-037 and the negative tests of the risk table (permission denied for meal_slots and
-- photo).
begin;
\ir _helpers.psql
select plan(11);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select, insert on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;
create function tests.patch_sql(p_table text, p_id uuid, p_changes jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx('home'), jsonb_build_array(jsonb_build_object(
  'kind', 'patch', 'table', p_table, 'id', p_id, 'changes', p_changes))) $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values ('enrico', tests.create_user('enrico@example.com', 'Enrico'));
insert into fx (key) values ('lasagne'), ('curry');

select tests.authenticate_as(tests.fx('enrico'));
insert into fx (key, id) values ('home', public.create_household('Enrico & Nadja', '{"areas": [], "articles": []}'));
select tests.clear_authentication();
insert into public.recipes (id, household_id, title, photo)
values (tests.fx('lasagne'), tests.fx('home'), 'Lasagne', 'lasagne.jpg');
create temp table slots_before on commit drop as select meal_slots from public.households where id = tests.fx('home');

-- ===================== AC-037: meal_slots =====================
select is((select jsonb_array_length(meal_slots) from slots_before), 3,
  'REQ-014 create_household: a new household still gets its three meal slots');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.patch_sql('households', tests.fx('home'), '{"meal_slots": []}'), '22023', 'invalid_change',
  'AC-037 apply_changes: a member cannot patch meal_slots');
select throws_ok(format($$ update public.households set meal_slots = '[]' where id = %L $$, tests.fx('home')),
  '42501', null, 'AC-037 PostgREST: a member cannot update meal_slots');
select lives_ok(tests.patch_sql('households', tests.fx('home'), '{"name": "Zuhause"}'),
  'REQ-014 apply_changes: the name of the household is still patched');
select tests.clear_authentication();
select is((select meal_slots from public.households where id = tests.fx('home')), (select meal_slots from slots_before),
  'AC-037: the meal slots are unchanged');

-- ===================== REQ-026: recipes.photo =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.patch_sql('recipes', tests.fx('lasagne'), '{"photo": "curry.jpg"}'), '22023', 'invalid_change',
  'REQ-026 apply_changes: a member cannot patch photo');
select throws_ok(
  format($$ select public.apply_changes(%L, %L) $$, tests.fx('home'), jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'recipes',
    'row', jsonb_build_object('id', tests.fx('curry'), 'title', 'Curry', 'photo', 'curry.jpg')))),
  '22023', 'invalid_change', 'REQ-026 apply_changes: a member cannot insert a recipe with photo');
select throws_ok(format($$ update public.recipes set photo = 'curry.jpg' where id = %L $$, tests.fx('lasagne')),
  '42501', null, 'REQ-026 PostgREST: a member cannot update photo');
select throws_ok(
  format($$ insert into public.recipes (id, household_id, title, photo) values (%L, %L, 'Curry', 'curry.jpg') $$,
         tests.fx('curry'), tests.fx('home')),
  '42501', null, 'REQ-026 PostgREST: a member cannot insert photo');
select tests.clear_authentication();
select is((select photo from public.recipes where id = tests.fx('lasagne')), 'lasagne.jpg',
  'REQ-026: the seed photo of the recipe stays');

-- ===================== Grants and allowlist stay identical =====================
-- Per table of the allowlist: insert columns = insert grants, patch columns = update grants,
-- "delete" = delete grant of authenticated.
select is_empty($$
  with allowlist as (
    select (regexp_match(pg_get_functiondef('public.apply_changes(uuid, jsonb)'::regprocedure),
                         '\$json\$(.*)\$json\$', 's'))[1]::jsonb as doc
  ), rules as (
    select r.key as tbl, r.value as rules from allowlist, jsonb_each(allowlist.doc) r
  ), compared as (
    select tbl, 'insert' as op,
           array(select x from jsonb_array_elements_text(rules -> 'insert') x order by x) as allowed,
           array(select p.column_name::text from information_schema.column_privileges p
                 where p.table_schema = 'public' and p.table_name = tbl and p.grantee = 'authenticated'
                   and p.privilege_type = 'INSERT' order by 1) as granted
    from rules
    union all
    select tbl, 'patch',
           array(select x from jsonb_array_elements_text(rules -> 'patch') x order by x),
           array(select p.column_name::text from information_schema.column_privileges p
                 where p.table_schema = 'public' and p.table_name = tbl and p.grantee = 'authenticated'
                   and p.privilege_type = 'UPDATE' order by 1)
    from rules
    union all
    select tbl, 'delete', array[rules ->> 'delete'],
           array[has_table_privilege('authenticated', format('public.%I', tbl), 'delete')::text]
    from rules
  )
  select tbl, op, allowed, granted from compared where allowed is distinct from granted
$$, 'REQ-014: column grants of authenticated and the allowlist of apply_changes are identical');

select * from finish();
rollback;
