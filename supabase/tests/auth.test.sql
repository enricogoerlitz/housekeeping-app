-- Sign-up gate and account bootstrap (spec 0003, T2): the before_user_created hook (AC-002) and
-- the auth.users trigger that creates the profile and turns invitations into memberships (AC-008).
begin;
\ir _helpers.psql
select plan(19);

create temp table fx (key text primary key, id uuid) on commit drop;
insert into fx values ('enrico', tests.create_user('enrico@example.com', 'Enrico'));
insert into fx values ('home', tests.create_household('Enrico & Nadja', array[(select id from fx where key = 'enrico')]));
insert into fx values ('wg', tests.create_household('WG Köln', array[(select id from fx where key = 'enrico')]));
insert into public.household_invitations (household_id, email, invited_by) values
  ((select id from fx where key = 'home'), 'nadja@example.com', (select id from fx where key = 'enrico')),
  ((select id from fx where key = 'wg'), 'nadja@example.com', (select id from fx where key = 'enrico')),
  ((select id from fx where key = 'home'), 'old@example.com', (select id from fx where key = 'enrico'));
update public.household_invitations set accepted_at = now() - interval '1 day' where email = 'old@example.com';

create function pg_temp.hook_event(p_email text, p_provider text) returns jsonb language sql as $$
  select jsonb_build_object(
    'metadata', jsonb_build_object('name', 'before-user-created', 'uuid', gen_random_uuid()),
    'user', jsonb_build_object(
      'id', gen_random_uuid(), 'aud', 'authenticated', 'role', '', 'email', p_email,
      'app_metadata', case when p_provider is null then '{}'::jsonb
                           else jsonb_build_object('provider', p_provider, 'providers', jsonb_build_array(p_provider)) end,
      'user_metadata', '{}'::jsonb, 'identities', '[]'::jsonb, 'is_anonymous', false
    )
  )
$$;

-- ---------- Hook: invitation and Google required (AC-002) ----------
select is(
  private.before_user_created_hook(pg_temp.hook_event('stranger@example.com', 'google')),
  '{"error": {"http_code": 403, "message": "not_invited"}}'::jsonb,
  'AC-002: the hook rejects a Google address that is not invited (403 not_invited)'
);
select is(
  private.before_user_created_hook(pg_temp.hook_event('nadja@example.com', 'email')),
  '{"error": {"http_code": 403, "message": "not_invited"}}'::jsonb,
  'AC-002: the hook rejects an invited address that signs up with email and password'
);
select is(
  private.before_user_created_hook(pg_temp.hook_event('nadja@example.com', null)),
  '{"error": {"http_code": 403, "message": "not_invited"}}'::jsonb,
  'AC-002: the hook rejects a sign-up without a provider'
);
select is(
  private.before_user_created_hook(pg_temp.hook_event('old@example.com', 'google')),
  '{"error": {"http_code": 403, "message": "not_invited"}}'::jsonb,
  'AC-002: an invitation that was already accepted does not admit a new account'
);
select is(
  private.before_user_created_hook(pg_temp.hook_event(null, 'google')),
  '{"error": {"http_code": 403, "message": "not_invited"}}'::jsonb,
  'AC-002: the hook rejects a sign-up without an email address'
);
select is(
  private.before_user_created_hook(pg_temp.hook_event('Nadja@Example.COM', 'google')),
  '{}'::jsonb,
  'AC-001: the hook admits an invited Google address, ignoring case'
);

-- ---------- Hook privileges ----------
select ok(
  has_function_privilege('supabase_auth_admin', 'private.before_user_created_hook(jsonb)', 'execute')
  and has_schema_privilege('supabase_auth_admin', 'private', 'usage'),
  'T2: supabase_auth_admin can run the hook'
);
select ok(
  not has_function_privilege('authenticated', 'private.before_user_created_hook(jsonb)', 'execute')
  and not has_function_privilege('anon', 'private.before_user_created_hook(jsonb)', 'execute'),
  'T2: the API roles cannot run the hook'
);
select ok(
  has_column_privilege('supabase_auth_admin', 'public.household_invitations', 'email', 'select')
  and has_column_privilege('supabase_auth_admin', 'public.household_invitations', 'accepted_at', 'select')
  and not has_column_privilege('supabase_auth_admin', 'public.household_invitations', 'household_id', 'select')
  and not has_table_privilege('supabase_auth_admin', 'public.household_invitations', 'insert,update,delete'),
  'T2: supabase_auth_admin may only read email and accepted_at of invitations'
);
select is(
  (select array_agg(p.cmd::text || ' to ' || array_to_string(p.roles, ','))
   from pg_catalog.pg_policies p
   where p.schemaname = 'public' and p.tablename = 'household_invitations'
     and p.roles @> array['supabase_auth_admin'::name]),
  array['SELECT to supabase_auth_admin'],
  'T2: the only policy for supabase_auth_admin is a select policy'
);
select is(
  (select prosecdef from pg_proc where oid = 'private.before_user_created_hook(jsonb)'::regprocedure),
  false,
  'T2: the hook runs with the rights of supabase_auth_admin (security invoker)'
);

-- ---------- Account bootstrap (auth.users trigger) ----------
insert into fx values ('nadja', tests.create_user('Nadja@Example.com', 'Nadja Beispiel'));

select results_eq(
  $$ select name, email, diet_preference, dislikes from public.profiles
     where id = (select id from fx where key = 'nadja') $$,
  $$ values ('Nadja Beispiel', 'nadja@example.com', 'flexible', '{}'::text[]) $$,
  'T2: a new account gets a profile with its Google name and the lowercased email'
);
select is(
  (select color from public.profiles where id = (select id from fx where key = 'nadja')),
  private.profile_color((select id from fx where key = 'nadja')),
  'T2: the profile colour is chosen deterministically from the account id'
);
select ok(
  private.profile_color((select id from fx where key = 'nadja')) = any (
    array['#3E6C8E', '#A8456B', '#5B7F3A', '#B5652B', '#6A4C93', '#2F7F7A', '#8C6D1F', '#9C3D3D']
  ),
  'T2: the profile colour comes from the fixed palette'
);
select results_eq(
  $$ select household_id from public.household_members
     where profile_id = (select id from fx where key = 'nadja') order by household_id $$,
  $$ select id from fx where key in ('home', 'wg') order by id $$,
  'AC-008: a new account becomes a member of every household that invited its address'
);
select is(
  (select count(*)::int from public.household_invitations
   where email = 'nadja@example.com' and accepted_at = now()),
  2,
  'AC-008: those invitations are marked as accepted'
);

insert into fx values ('meta_name', tests.create_user('kai@example.com'));
select is(
  (select name from public.profiles where id = (select id from fx where key = 'meta_name')),
  'kai',
  'T2: without a name in the metadata the profile name falls back to the local part of the email'
);

insert into fx values ('test_account', tests.create_user('test-enrico@example.com', 'Enrico (Test)', 'email'));
select is(
  (select count(*)::int from public.household_members
   where profile_id = (select id from fx where key = 'test_account')),
  0,
  'T2: an account without invitation (seeded test account) gets a profile but no membership'
);
select is(
  (select count(*)::int from public.household_invitations
   where email = 'old@example.com' and accepted_at < now()),
  1,
  'T2: invitations for other addresses stay untouched'
);

select * from finish();
rollback;
