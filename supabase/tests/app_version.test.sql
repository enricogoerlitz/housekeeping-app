-- Minimum app version (spec 0014, REQ-004, Decision 9): public.min_app_version() names the oldest
-- app version that may still work with this server. Signed-out and signed-in callers read it
-- (the app asks before sign-in, too); nobody can change it through the API — only a migration
-- replaces the function.
begin;
\ir _helpers.psql
select plan(12);

create temp table fx (key text primary key, id uuid) on commit drop;
grant select on fx to anon, authenticated;
insert into fx values ('anna', tests.create_user('anna@example.com', 'Anna'));

-- ---------- Shape ----------
select has_function('public', 'min_app_version', array[]::text[], 'AC-025: public.min_app_version() exists');
select function_returns('public', 'min_app_version', array[]::text[], 'text', 'AC-025: it returns text');
select ok(
  (select p.provolatile = 's' and not p.prosecdef
   from pg_catalog.pg_proc p where p.oid = 'public.min_app_version()'::regprocedure),
  'AC-025: it is stable and runs as the caller (no security definer, reads no data)'
);

-- ---------- Privileges ----------
select ok(
  has_function_privilege('anon', 'public.min_app_version()', 'execute'),
  'AC-025: anon may execute min_app_version'
);
select ok(
  has_function_privilege('authenticated', 'public.min_app_version()', 'execute'),
  'AC-025: authenticated may execute min_app_version'
);
select is_empty(
  $$ select 1 from pg_catalog.pg_proc p, aclexplode(p.proacl) a
     where p.oid = 'public.min_app_version()'::regprocedure
       and a.grantee = 0 and a.privilege_type = 'EXECUTE' $$,
  'AC-025: PUBLIC has no execute grant on min_app_version'
);

-- ---------- Value ----------
select is(public.min_app_version(), '2026.11.1', 'AC-025: the minimum version is the latest published one, raised by the contract of spec 0027');

select tests.authenticate_as_anon();
select matches(
  public.min_app_version(),
  '^\d{4}\.(1[0-2]|[1-9])\.[1-9]\d*$',
  'AC-025: anon reads a version in the format JJJJ.M.N'
);
select throws_ok(
  $$ create or replace function public.min_app_version() returns text language sql
     set search_path = '' as $f$ select '2099.1.1'::text $f$ $$,
  '42501',
  null,
  'AC-025: anon cannot replace min_app_version'
);

select tests.authenticate_as((select id from fx where key = 'anna'));
select matches(
  public.min_app_version(),
  '^\d{4}\.(1[0-2]|[1-9])\.[1-9]\d*$',
  'AC-025: authenticated reads a version in the format JJJJ.M.N'
);
select throws_ok(
  $$ create or replace function public.min_app_version() returns text language sql
     set search_path = '' as $f$ select '2099.1.1'::text $f$ $$,
  '42501',
  null,
  'AC-025: authenticated cannot replace min_app_version'
);
select throws_ok(
  $$ drop function public.min_app_version() $$,
  '42501',
  null,
  'AC-025: authenticated cannot drop min_app_version'
);

select * from finish();
rollback;
