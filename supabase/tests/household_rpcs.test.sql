-- Household RPCs (spec 0003, T2): create_household (AC-010), invite_member (AC-008, AC-009),
-- accept_invitation / decline_invitation (decision 7: every invited person accepts herself) and
-- remove_member (AC-012).
begin;
\ir _helpers.psql
select plan(57);

create temp table fx (key text primary key, id uuid) on commit drop;
grant select, insert on fx to anon, authenticated;
insert into fx values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('carla', tests.create_user('carla@example.com', 'Carla')),
  ('ben', tests.create_user('ben@example.com', 'Ben')),
  ('dora', tests.create_user('dora@example.com', 'Dora'));
insert into fx values
  ('home', tests.create_household('Enrico & Carla', array[(select id from fx where key = 'enrico'), (select id from fx where key = 'carla')])),
  ('ben_home', tests.create_household('Ben', array[(select id from fx where key = 'ben')]));

-- Minimal starter in the shape the app sends (see the migration for the format).
create temp table starter (doc jsonb) on commit drop;
grant select on starter to anon, authenticated;
insert into starter values ('{
  "areas": [{"key": "obst-gemuese", "name": "Obst & Gemüse"}, {"key": "gewuerze-oel", "name": "Gewürze & Öl"}],
  "articles": [{"name": "Äpfel", "name_key": "aepfel", "synonyms": ["Apfel"], "synonym_keys": ["apfel"],
                "area": "obst-gemuese", "diet": "vegan", "is_pantry": false},
               {"name": "Olivenöl", "name_key": "olivenol", "synonyms": [], "synonym_keys": [],
                "area": "gewuerze-oel", "diet": "vegan", "is_pantry": true},
               {"name": "Geschenkpapier", "name_key": "geschenkpapier", "synonyms": [], "synonym_keys": [],
                "area": null, "diet": "unknown", "is_pantry": false}]
}');

-- ===================== create_household (AC-010) =====================
select tests.authenticate_as((select id from fx where key = 'enrico'));
insert into fx values ('wg', public.create_household('  WG Köln  ', (select doc from starter)));

select results_eq(
  $$ select name from public.households where id = (select id from fx where key = 'wg') $$,
  $$ values ('WG Köln') $$,
  'AC-010: create_household creates the household with the trimmed name and returns its id'
);
select results_eq(
  $$ select profile_id from public.household_members where household_id = (select id from fx where key = 'wg') $$,
  $$ select id from fx where key = 'enrico' $$,
  'AC-010: the creator is the only member'
);
select results_eq(
  $$ select s ->> 'name', (s ->> 'sort')::int, (s ->> 'id')::uuid is not null
     from public.households h, jsonb_array_elements(h.meal_slots) s
     where h.id = (select id from fx where key = 'wg') order by (s ->> 'sort')::int $$,
  $$ values ('Vormittag', 0, true), ('Mittag', 1, true), ('Abend', 2, true) $$,
  'AC-010: the household has the meal slots Vormittag, Mittag and Abend (spec 0004 AC-001)'
);
select results_eq(
  $$ select name, sort from public.areas where household_id = (select id from fx where key = 'wg') order by sort $$,
  $$ values ('Obst & Gemüse', 0), ('Gewürze & Öl', 1) $$,
  'AC-010: the starter areas are created in the given order'
);
select results_eq(
  $$ select ar.name, ar.name_key, ar.synonyms, ar.synonym_keys, a.name, ar.diet, ar.is_pantry
     from public.articles ar left join public.areas a on a.id = ar.area_id
     where ar.household_id = (select id from fx where key = 'wg') order by ar.name_key $$,
  $$ values ('Äpfel', 'aepfel', array['Apfel'], array['apfel'], 'Obst & Gemüse', 'vegan', false),
            ('Geschenkpapier', 'geschenkpapier', '{}'::text[], '{}'::text[], null, 'unknown', false),
            ('Olivenöl', 'olivenol', '{}'::text[], '{}'::text[], 'Gewürze & Öl', 'vegan', true) $$,
  'AC-010: the starter catalog is created with keys, synonyms and areas from the starter'
);
select hasnt_table(
  'public', 'shopping_lists',
  'AC-010 (ADR-0012): create_household creates no list; the shopping list is the household''s items'
);
select throws_ok(
  $$ select public.create_household('X', '{"areas": [], "articles": [{"name": "Äpfel", "name_key": "apfel", "area": "nirgends"}]}') $$,
  '22023', 'invalid_starter',
  'AC-010: an article pointing to an unknown starter area is rejected'
);
select throws_ok(
  $$ select public.create_household('X', '{"areas": [], "articles": [{"name": "Äpfel", "name_key": "apfel"},
                                                                     {"name": "Apfel", "name_key": "apfel"}]}') $$,
  '22023', 'invalid_starter',
  'AC-010: two starter articles with the same name_key are rejected'
);
select throws_ok(
  $$ select public.create_household('X', '{"areas": [{"key": "a", "name": ""}], "articles": []}') $$,
  '22023', 'invalid_starter',
  'AC-010: a starter area without a name is rejected'
);
select throws_ok(
  $$ select public.create_household('X', '{"areas": [], "articles": [{"name": "Tofu", "name_key": "tofu", "diet": "carnivore"}]}') $$,
  '22023', 'invalid_starter',
  'AC-010: a starter article with an unknown diet is rejected'
);
select throws_ok(
  $$ select public.create_household('X', '{"areas": [], "articles": [{"name": "Milch", "name_key": "milch"},
                                                                     {"name": "Hafermilch", "name_key": "hafermilch",
                                                                      "synonyms": ["Milch"], "synonym_keys": ["milch"]}]}') $$,
  '22023', 'invalid_starter',
  'E6 (spec 0007): a starter synonym equal to the name of another starter article is rejected'
);
select throws_ok(
  $$ select public.create_household('X', '{"areas": [], "articles": [{"name": "Milch", "name_key": "milch",
                                                                      "synonyms": ["MILCH"], "synonym_keys": ["milch"]}]}') $$,
  '22023', 'invalid_starter',
  'E6 (spec 0007): a starter synonym equal to the article''s own name is rejected'
);
select throws_ok(
  $$ select public.create_household('X', '{"areas": [{"key": "a", "name": "Obst"}, {"key": "b", "name": "obst"}], "articles": []}') $$,
  '22023', 'invalid_starter',
  'AC-052 (spec 0007): two starter areas with the same name are rejected'
);
select throws_ok(
  $$ select public.create_household('   ', (select doc from starter)) $$,
  '22023', 'invalid_name',
  'AC-010: an empty name is rejected'
);
select throws_ok(
  $$ select public.create_household(repeat('x', 81), (select doc from starter)) $$,
  '22023', 'invalid_name',
  'AC-010: a name over 80 characters is rejected'
);
select throws_ok(
  $$ select public.create_household('X', null) $$,
  '22023', 'invalid_starter',
  'AC-010: a missing starter is rejected'
);
select throws_ok(
  $$ select public.create_household('X', '[]') $$,
  '22023', 'invalid_starter',
  'AC-010: a starter that is not an object is rejected'
);
select throws_ok(
  $$ select public.create_household('X', '{"areas": {}, "articles": []}') $$,
  '22023', 'invalid_starter',
  'AC-010: starter areas must be an array'
);
select throws_ok(
  $$ select public.create_household('X', jsonb_build_object(
       'areas', '[]'::jsonb,
       'articles', (select jsonb_agg(jsonb_build_object('name', 'a' || i)) from generate_series(1, 2001) i))) $$,
  '22023', 'invalid_starter',
  'AC-010: more than 2000 starter articles are rejected'
);
select throws_ok(
  $$ select public.create_household('X', jsonb_build_object(
       'areas', '[]'::jsonb,
       'articles', jsonb_build_array(jsonb_build_object('name', repeat('x', 600000))))) $$,
  '22023', 'invalid_starter',
  'AC-010: a starter larger than 512 KB is rejected'
);
select is(
  (select count(*)::int from public.households where name = 'X'),
  0,
  'AC-010: a rejected create_household leaves nothing behind'
);
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.create_household('Anon', '{"areas": [], "articles": []}') $$,
  '42501', null,
  'AC-005: anon cannot create a household'
);

-- ===================== invite_member (AC-008, AC-009) =====================
select tests.authenticate_as((select id from fx where key = 'enrico'));
insert into fx values ('inv_nadja', public.invite_member((select id from fx where key = 'home'), '  Nadja@Example.COM '));
select results_eq(
  $$ select household_id, email, invited_by, accepted_at from public.household_invitations
     where id = (select id from fx where key = 'inv_nadja') $$,
  $$ select (select id from fx where key = 'home'), 'nadja@example.com',
            (select id from fx where key = 'enrico'), null::timestamptz $$,
  'AC-008: invite_member stores the lowercased address as an open invitation by the caller'
);
select is(
  public.invite_member((select id from fx where key = 'home'), 'nadja@example.com'),
  (select id from fx where key = 'inv_nadja'),
  'AC-008: inviting the same address again returns the existing invitation'
);
select throws_ok(
  $$ select public.invite_member((select id from fx where key = 'home'), 'nadja@') $$,
  '22023', 'invalid_email',
  'AC-009: "nadja@" is rejected as invalid_email'
);
select throws_ok(
  $$ select public.invite_member((select id from fx where key = 'home'), 'nadja@example') $$,
  '22023', 'invalid_email',
  'AC-009: an address without a dot in the domain is rejected'
);
select throws_ok(
  $$ select public.invite_member((select id from fx where key = 'home'), 'na dja@example.com') $$,
  '22023', 'invalid_email',
  'AC-009: an address with a space is rejected'
);
select throws_ok(
  $$ select public.invite_member((select id from fx where key = 'home'), repeat('a', 250) || '@example.com') $$,
  '22023', 'invalid_email',
  'AC-009: an address longer than 254 characters is rejected'
);
select throws_ok(
  $$ select public.invite_member((select id from fx where key = 'home'), null) $$,
  '22023', 'invalid_email',
  'AC-009: a missing address is rejected'
);
select is(
  (select count(*)::int from public.household_invitations
   where household_id = (select id from fx where key = 'home')),
  1,
  'AC-009: nothing is stored for an invalid address'
);
select throws_ok(
  $$ select public.invite_member((select id from fx where key = 'home'), 'Carla@example.com') $$,
  '23505', 'already_member',
  'T2: inviting someone who is already a member is rejected'
);
select tests.authenticate_as((select id from fx where key = 'ben'));
select throws_ok(
  $$ select public.invite_member((select id from fx where key = 'home'), 'friend@example.com') $$,
  '42501', 'not_member',
  'AC-011: a non-member cannot invite into a foreign household'
);
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.invite_member((select id from fx where key = 'home'), 'friend@example.com') $$,
  '42501', null,
  'AC-005: anon cannot invite'
);
select tests.clear_authentication();

-- A new account with that address sees the invitation and accepts it herself (AC-008).
insert into fx values ('nadja', tests.create_user('nadja@example.com', 'Nadja'));
select ok(
  not exists (select 1 from public.household_members
              where household_id = (select id from fx where key = 'home')
                and profile_id = (select id from fx where key = 'nadja')),
  'AC-008: signing up with the invited address does not make Nadja a member yet'
);
select tests.authenticate_as((select id from fx where key = 'nadja'));
select is(
  public.accept_invitation((select id from fx where key = 'inv_nadja')),
  (select id from fx where key = 'home'),
  'AC-008: Nadja accepts the invitation'
);
select tests.clear_authentication();
select ok(
  exists (select 1 from public.household_members
          where household_id = (select id from fx where key = 'home')
            and profile_id = (select id from fx where key = 'nadja')),
  'AC-008: after accepting Nadja is a member'
);

-- ===================== accept / decline for existing accounts (decision 7) =====================
select tests.authenticate_as((select id from fx where key = 'enrico'));
insert into fx values ('inv_dora', public.invite_member((select id from fx where key = 'home'), 'dora@example.com'));
select tests.clear_authentication();
select ok(
  not exists (select 1 from public.household_members
              where household_id = (select id from fx where key = 'home')
                and profile_id = (select id from fx where key = 'dora')),
  'T2: inviting an existing account does not make it a member yet'
);

select tests.authenticate_as((select id from fx where key = 'ben'));
select throws_ok(
  $$ select public.accept_invitation((select id from fx where key = 'inv_dora')) $$,
  'P0002', 'invitation_not_found',
  'T2: nobody can accept an invitation addressed to someone else'
);
select throws_ok(
  $$ select public.decline_invitation((select id from fx where key = 'inv_dora')) $$,
  'P0002', 'invitation_not_found',
  'T2: nobody can decline an invitation addressed to someone else'
);

select tests.authenticate_as((select id from fx where key = 'dora'));
select is(
  public.accept_invitation((select id from fx where key = 'inv_dora')),
  (select id from fx where key = 'home'),
  'T2: the invited account accepts and gets the household id back'
);
select tests.clear_authentication();
select ok(
  exists (select 1 from public.household_members
          where household_id = (select id from fx where key = 'home')
            and profile_id = (select id from fx where key = 'dora'))
  and (select accepted_at = now() from public.household_invitations where id = (select id from fx where key = 'inv_dora')),
  'T2: after accepting she is a member and the invitation is marked accepted'
);
select tests.authenticate_as((select id from fx where key = 'dora'));
select throws_ok(
  $$ select public.accept_invitation((select id from fx where key = 'inv_dora')) $$,
  'P0002', 'invitation_not_found',
  'T2: an accepted invitation cannot be accepted twice'
);

select tests.authenticate_as((select id from fx where key = 'ben'));
insert into fx values ('inv_carla', public.invite_member((select id from fx where key = 'ben_home'), 'carla@example.com'));
select tests.authenticate_as((select id from fx where key = 'carla'));
select lives_ok(
  $$ select public.decline_invitation((select id from fx where key = 'inv_carla')) $$,
  'T2: the invited account can decline'
);
select tests.authenticate_as((select id from fx where key = 'ben'));
select results_eq(
  $$ select (select count(*)::int from public.household_invitations where email = 'carla@example.com'),
            (select count(*)::int from public.deleted_records where table_name = 'household_invitations') $$,
  $$ values (0, 1) $$,
  'T2: a declined invitation is gone and leaves a tombstone for the household'
);

-- ===================== remove_member (AC-012) =====================
select tests.authenticate_as((select id from fx where key = 'enrico'));
select lives_ok(
  $$ select public.remove_member((select id from fx where key = 'home'), (select id from fx where key = 'carla')) $$,
  'AC-012: a member removes another member'
);
select results_eq(
  $$ select record_id from public.deleted_records where table_name = 'household_members' $$,
  $$ select id::text from fx where key = 'carla' $$,
  'AC-012: the removal leaves a membership tombstone (record_id = profile_id) for the remaining members'
);

select tests.authenticate_as((select id from fx where key = 'carla'));
select results_eq(
  $$ select (select count(*)::int from public.households where id = (select id from fx where key = 'home')),
            (select count(*)::int from public.household_members where household_id = (select id from fx where key = 'home')),
            (select count(*)::int from public.deleted_records where household_id = (select id from fx where key = 'home')) $$,
  $$ values (0, 0, 0) $$,
  'AC-012: the removed member no longer sees the household, its members or its tombstones'
);
select throws_ok(
  $$ select public.remove_member((select id from fx where key = 'home'), (select id from fx where key = 'enrico')) $$,
  '42501', 'not_member',
  'AC-012: a removed member cannot remove others'
);

select tests.authenticate_as((select id from fx where key = 'ben'));
select throws_ok(
  $$ select public.remove_member((select id from fx where key = 'home'), (select id from fx where key = 'enrico')) $$,
  '42501', 'not_member',
  'AC-011: a member of another household cannot remove anyone'
);
select throws_ok(
  $$ select public.remove_member((select id from fx where key = 'ben_home'), (select id from fx where key = 'ben')) $$,
  'P0001', 'last_member',
  'AC-012: the last member cannot leave'
);
select throws_ok(
  $$ select public.remove_member((select id from fx where key = 'ben_home'), (select id from fx where key = 'dora')) $$,
  'P0002', 'member_not_found',
  'AC-012: removing someone who is not a member fails'
);

select tests.authenticate_as((select id from fx where key = 'dora'));
select lives_ok(
  $$ select public.remove_member((select id from fx where key = 'home'), (select id from fx where key = 'dora')) $$,
  'AC-012: a member can leave a household herself'
);

select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.remove_member((select id from fx where key = 'home'), (select id from fx where key = 'enrico')) $$,
  '42501', null,
  'AC-005: anon cannot remove members'
);
select tests.clear_authentication();
select results_eq(
  $$ select profile_id from public.household_members
     where household_id = (select id from fx where key = 'home') order by profile_id $$,
  $$ select id from fx where key in ('enrico', 'nadja') order by id $$,
  'AC-012: only the expected members remain'
);

-- ===================== Deleting a household (spec 0007, T1) =====================
-- Nothing deletes a household through the API; when the server deletes one (as postgres), the new
-- article and ingredient checks must not stand in the way of the cascade.
insert into fx values ('wg_recipe', gen_random_uuid()), ('wg_item', gen_random_uuid());
insert into public.recipes (id, household_id, title, ingredients)
select (select id from fx where key = 'wg_recipe'), h.id, 'Apfelkuchen',
       jsonb_build_array(jsonb_build_object('id', 'i1', 'articleId', a.id::text, 'shoppingRule', 'count',
                                            'prepNote', 'geschält'))
from fx h join public.articles a on a.household_id = h.id and a.name_key = 'aepfel'
where h.key = 'wg';
insert into public.shopping_items (id, household_id, article_id)
select (select id from fx where key = 'wg_item'), a.household_id, a.id
from public.articles a where a.household_id = (select id from fx where key = 'wg') and a.name_key = 'aepfel';
insert into public.shopping_contributions (household_id, item_id)
select (select id from fx where key = 'wg'), (select id from fx where key = 'wg_item');
insert into private.recipe_deletions (household_id, recipe_id, deleted_by, snapshot)
select (select id from fx where key = 'wg'), gen_random_uuid(), (select id from fx where key = 'enrico'), '{}';
select lives_ok(
  $$ delete from public.households where id = (select id from fx where key = 'wg') $$,
  'T1 households: a household with recipes, articles and items on the list can be deleted'
);
select is(
  (select count(*)::int from public.articles where household_id = (select id from fx where key = 'wg'))
  + (select count(*)::int from public.recipes where household_id = (select id from fx where key = 'wg'))
  + (select count(*)::int from public.shopping_items where household_id = (select id from fx where key = 'wg'))
  + (select count(*)::int from public.areas where household_id = (select id from fx where key = 'wg')),
  0,
  'T1 households: its articles, recipes, items and areas are gone'
);
select is(
  (select count(*)::int from private.recipe_deletions where household_id = (select id from fx where key = 'wg')),
  0,
  'spec 0008 T1 households: the snapshots of deleted recipes go with the household'
);

select * from finish();
rollback;
