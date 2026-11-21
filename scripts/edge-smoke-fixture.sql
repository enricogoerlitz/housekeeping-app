-- Local-only fixture for scripts/edge-smoke.mjs. Runs as the postgres superuser against the local
-- stack (`docker exec -i supabase_db_<project> psql -U postgres`). Never run it against a hosted
-- project. The password is a fake test value, not a secret.
--
--   psql -v cleanup=false -f scripts/edge-smoke-fixture.sql   -- (re)create the fixture
--   psql -v cleanup=true  -f scripts/edge-smoke-fixture.sql   -- remove it
\set ON_ERROR_STOP on

begin;

-- Remove what an earlier run left behind: the smoke households (cascades to their rows), then the
-- account (cascades to profile, memberships and ai_usage).
delete from public.households h
where exists (
  select 1 from public.household_members m
  join auth.users u on u.id = m.profile_id
  where m.household_id = h.id and u.email = 'edge-smoke@example.com'
);
delete from auth.users where email = 'edge-smoke@example.com';

\if :cleanup
\else
-- The account. Direct inserts bypass the before_user_created hook (that only runs inside GoTrue);
-- the on-insert trigger still creates the profile. Token columns must be '' (GoTrue cannot read
-- NULL there).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-00000000e5e5',
  'authenticated', 'authenticated', 'edge-smoke@example.com',
  extensions.crypt('fake-smoke-password-not-secret', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', '{"full_name": "Smoke Test"}', now(), now(),
  '', '', '', '', '', '', '', ''
);
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'e0000000-0000-4000-8000-00000000e5e5', 'e0000000-0000-4000-8000-00000000e5e5',
  'email',
  '{"sub": "e0000000-0000-4000-8000-00000000e5e5", "email": "edge-smoke@example.com", "email_verified": true}',
  now(), now(), now()
);

-- The household, created by the real RPC as that user (meal slots).
select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub": "e0000000-0000-4000-8000-00000000e5e5", "role": "authenticated"}',
  true
);
select public.create_household('Smoke-Haushalt', '{"areas": [], "articles": []}') as household_id
\gset

-- One small recipe in the stored shape (camelCase JSON, see packages/core/src/types.ts).
insert into public.recipes (household_id, title, servings, total_minutes, course, cuisine, tags,
                            variants, ingredients, steps)
values (
  :'household_id', 'Tofu-Pfanne mit Brokkoli', 2, 25, 'main', 'asiatisch', '{schnell,vegan}',
  '[{"id": "7b0f5c1e-0000-4000-8000-000000000001", "name": "Scharf", "isDefault": false}]',
  '[{"id": "7b0f5c1e-0000-4000-8000-000000000011", "name": "Räuchertofu",
     "amount": {"text": "200 g", "qty": 200, "unit": "g"}, "shoppingRule": "count"},
    {"id": "7b0f5c1e-0000-4000-8000-000000000012", "name": "Brokkoli",
     "amount": {"text": "1 Kopf", "qty": 1, "unit": "Kopf"}, "shoppingRule": "count"},
    {"id": "7b0f5c1e-0000-4000-8000-000000000013", "name": "Chili",
     "amount": {"text": "1"}, "variantId": "7b0f5c1e-0000-4000-8000-000000000001",
     "shoppingRule": "count"}]',
  '[{"id": "7b0f5c1e-0000-4000-8000-000000000021", "text": "Tofu anbraten, Brokkoli dazu."}]'
);
\endif

commit;
