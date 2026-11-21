-- Schema linter: structural rules every table and function in the API schemas must follow.
-- A new table or function that breaks a rule makes this file fail, so a forgotten policy, grant,
-- trigger or search_path never reaches production silently. Exceptions are listed explicitly.
begin;
\ir _helpers.psql
select plan(14);

-- Tables in public that are not scoped by household_id (reviewed exceptions).
create temp table lint_tables_without_household_id (name text primary key);
insert into lint_tables_without_household_id values
  ('profiles'),     -- one row per person, visible to co-members
  ('households'),   -- is the household itself
  ('ai_usage');     -- per person quota, no grants, not synced (T7)

-- Tables with household_id that are not synced rows themselves (no sync triggers).
create temp table lint_household_tables_without_sync (name text primary key);
insert into lint_household_tables_without_sync values
  ('deleted_records'); -- the tombstone log itself

-- Functions in private that authenticated may execute (used by RLS policies or as RPC bodies).
create temp table lint_private_functions_for_authenticated (signature text primary key);
insert into lint_private_functions_for_authenticated values
  ('private.my_household_ids()'),
  ('private.my_email()'),
  ('private.household_id_from_topic(text)'),
  ('private.create_household(text,jsonb)'),
  ('private.invite_member(uuid,text)'),
  ('private.accept_invitation(uuid)'),
  ('private.decline_invitation(uuid)'),
  ('private.remove_member(uuid,uuid)'),
  ('private.assert_members(uuid,uuid[])'), -- security invoker, called by member-check triggers
  ('private.set_recipe_favorite(uuid,boolean)'),
  ('private.set_recipe_rating(uuid,numeric)'),
  ('private.set_restaurant_favorite(uuid,boolean)'),
  ('private.set_restaurant_rating(uuid,numeric)'),
  ('private.set_activity_favorite(uuid,boolean)'),
  ('private.set_activity_rating(uuid,numeric)'),
  ('private.media_household_id(text)'), -- used by the storage.objects policies (spec 0004)
  ('private.set_feedback_vote(uuid,boolean)'),
  ('private.set_shopping_item_checked(uuid,boolean,integer)'),
  ('private.set_shopping_item_not_available(uuid,boolean)'),
  ('private.add_shopping_contributions(uuid,jsonb)'),
  ('private.remove_contributions(uuid[],uuid)'), -- security invoker, shared with apply_changes
  ('private.consume_ai_quota(text,integer)'),
  ('private.restore_cleared_items(uuid,jsonb)'),
  ('private.delete_article(uuid)'),         -- spec 0007: the only way to delete an article
  ('private.merge_articles(uuid,uuid)'),    -- spec 0007
  ('private.complete_chore(uuid,jsonb)'),   -- spec 0011: domain op of apply_changes, the only way to book
  ('private.remove_chore_event(uuid,uuid)'), -- spec 0011: domain op of apply_changes, the only way to remove
  ('private.delete_recipe(uuid,date)'),     -- spec 0008: the only way to delete a recipe
  ('private.restore_recipe(uuid)'),         -- spec 0008: "Rückgängig" of delete_recipe
  ('private.assert_restorable_size(jsonb)'); -- security invoker, a size check without data access

create temp view lint_public_tables as
  select c.oid, c.relname as name, c.relrowsecurity as rls
  from pg_catalog.pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p');

create temp view lint_household_tables as
  select t.oid, t.name
  from lint_public_tables t
  where exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = t.oid and a.attname = 'household_id' and not a.attisdropped
  )
  and t.name not in (select name from lint_household_tables_without_sync);

-- Functions in public/private that belong to us (not to an extension).
create temp view lint_functions as
  select p.oid, n.nspname as schema, p.oid::regprocedure::text as signature, p.prosecdef,
         p.proconfig, p.proacl
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and not exists (
      select 1 from pg_catalog.pg_depend d
      where d.classid = 'pg_catalog.pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    );

-- 1
select is_empty(
  $$ select name from lint_public_tables where not rls $$,
  'every table in public has row level security enabled'
);

-- 2
select is_empty(
  $$ select c.relname from pg_catalog.pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
       and (
         has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
         or (c.relkind <> 'S' and has_any_column_privilege('anon', c.oid, 'select,insert,update,references'))
         or (c.relkind = 'S' and has_sequence_privilege('anon', c.oid, 'usage,select,update'))
       ) $$,
  'anon has no privilege on any relation in public'
);

-- 3
select is_empty(
  $$ select name from lint_public_tables
     where name not in (select name from lint_tables_without_household_id)
       and name not in (select name from lint_household_tables_without_sync)
       and oid not in (select oid from lint_household_tables) $$,
  'every table in public is household-scoped or a listed exception'
);

-- 4
select is_empty(
  $$ select t.name from lint_public_tables t
     where exists (select 1 from pg_catalog.pg_attribute a
                   where a.attrelid = t.oid and a.attname = 'updated_at' and not a.attisdropped)
       and not exists (
         select 1 from pg_catalog.pg_trigger g
         where g.tgrelid = t.oid and not g.tgisinternal
           and g.tgfoid = 'private.set_timestamps()'::regprocedure
           and g.tgtype & (1 | 2 | 4 | 16) = (1 | 2 | 4 | 16) -- row, before, insert, update
       ) $$,
  'every table with updated_at has the set_timestamps trigger before insert and update'
);

-- 5
select is_empty(
  $$ select t.name from lint_household_tables t
     where not exists (
       select 1 from pg_catalog.pg_trigger g
       where g.tgrelid = t.oid and not g.tgisinternal
         and g.tgfoid = 'private.record_deletion()'::regprocedure
         and g.tgtype & (1 | 8) = (1 | 8) and g.tgtype & 2 = 0 -- row, delete, after
     ) $$,
  'every household-scoped table records deletions into deleted_records'
);

-- 6
select is_empty(
  $$ select t.name from lint_household_tables t
     where (
       select coalesce(bit_or(g.tgtype), 0) & (4 | 8 | 16)
       from pg_catalog.pg_trigger g
       where g.tgrelid = t.oid and not g.tgisinternal
         and g.tgfoid = 'private.notify_household()'::regprocedure
         and g.tgtype & 1 = 0 -- statement level
     ) <> (4 | 8 | 16) $$,
  'every household-scoped table notifies its household on insert, update and delete'
);

-- 7
select is_empty(
  $$ select t.name from lint_household_tables t
     where not exists (
       select 1 from pg_catalog.pg_index i
       where i.indrelid = t.oid
         and i.indkey[0] = (select attnum from pg_catalog.pg_attribute
                            where attrelid = t.oid and attname = 'household_id')
         and i.indkey[1] = (select attnum from pg_catalog.pg_attribute
                            where attrelid = t.oid and attname = 'updated_at')
     ) $$,
  'every household-scoped table has an index on (household_id, updated_at)'
);

-- 8
select is_empty(
  $$ select t.name from lint_household_tables t
     where exists (select 1 from pg_catalog.pg_attribute a
                   where a.attrelid = t.oid and a.attname = 'id' and not a.attisdropped)
       and not exists (
         select 1 from pg_catalog.pg_constraint c
         where c.conrelid = t.oid and c.contype in ('u', 'p')
           and (select array_agg(a.attname::text order by a.attname)
                from pg_catalog.pg_attribute a
                where a.attrelid = t.oid and a.attnum = any (c.conkey)) = array['household_id', 'id']
       ) $$,
  'every household-scoped table with an id has unique (household_id, id)'
);

-- 9
select is_empty(
  $$ select c.conname from pg_catalog.pg_constraint c
     join lint_household_tables src on src.oid = c.conrelid
     join lint_household_tables dst on dst.oid = c.confrelid
     where c.contype = 'f'
       and not (
         (select attnum from pg_catalog.pg_attribute
          where attrelid = c.conrelid and attname = 'household_id') = any (c.conkey)
         and (select attnum from pg_catalog.pg_attribute
              where attrelid = c.confrelid and attname = 'household_id') = any (c.confkey)
       ) $$,
  'foreign keys between household-scoped tables include household_id'
);

-- 10
select is_empty(
  $$ select signature from lint_functions
     where not coalesce('search_path=""' = any (proconfig), false) $$,
  'every function in public and private sets search_path to empty'
);

-- 11
select is_empty(
  $$ select signature from lint_functions where has_function_privilege('anon', oid, 'execute') $$,
  'anon cannot execute any function in public or private'
);

-- 12
select is_empty(
  $$ select f.signature from lint_functions f, aclexplode(f.proacl) a
     where a.grantee = 0 and a.privilege_type = 'EXECUTE' $$,
  'no function in public or private is executable by PUBLIC'
);

-- 13
select is_empty(
  $$ select f.signature from lint_functions f
     where f.schema = 'private'
       and has_function_privilege('authenticated', f.oid, 'execute')
       and f.signature not in (select signature from lint_private_functions_for_authenticated) $$,
  'authenticated executes only the reviewed functions in private'
);

-- 14
select is_empty(
  $$ select n.nspname from pg_catalog.pg_namespace n
     where n.nspname = 'private'
       and (has_schema_privilege('anon', n.oid, 'usage')
            or has_schema_privilege('anon', n.oid, 'create')
            or has_schema_privilege('authenticated', n.oid, 'create')) $$,
  'schema private is not usable by anon and not writable by the API roles'
);

select * from finish();
rollback;
