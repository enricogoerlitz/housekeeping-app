-- Baseline (ADR-0012) — identity: profiles, households, memberships, invitations; the sign-up
-- gate (before_user_created hook), account bootstrap (auth.users trigger) and the household RPCs.
--
-- Writes to households, memberships and invitations go only through the RPCs below
-- (security definer, checked against auth.uid()); the API roles get no insert/delete grants.
-- Public RPCs are thin security-invoker wrappers so PostgREST can see them; the logic lives in
-- private. Invitations are always accepted explicitly (accept_invitation): the auth.users
-- trigger only creates the profile.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

-- One row per account, created by private.handle_new_user(). No household_id: visible to the
-- person herself and to the members of her households.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null
    constraint profiles_name_length check (char_length(name) between 1 and 80),
  email text not null
    constraint profiles_email_lowercase check (email = lower(email)),
  color text not null
    constraint profiles_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$'),
  diet_preference text not null default 'flexible'
    constraint profiles_diet_preference_valid check (diet_preference in ('vegan', 'vegetarian', 'flexible')),
  dislikes text[] not null default '{}'
    constraint profiles_dislikes_size check (cardinality(dislikes) <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (email);

-- The household itself (no household_id). meal_slots: [{id: uuid, name: 1–40 chars, sort: number}].
-- default_store_id gets its composite foreign key in the catalog migration. The shopping list is the
-- household's shopping_items (ADR-0012); there is no list row.
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint households_name_valid check (char_length(name) between 1 and 80 and name = btrim(name)),
  meal_slots jsonb not null default '[]'
    constraint households_meal_slots_valid check (
      case
        when jsonb_typeof(meal_slots) = 'array' then
          jsonb_array_length(meal_slots) <= 10
          and not jsonb_path_exists(
            meal_slots,
            '$[*] ? (!(@.id.type() == "string"
                       && @.id like_regex "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
                       && @.name.type() == "string" && @.name like_regex "^.{1,40}$"
                       && @.sort.type() == "number"))'
          )
        else false
      end
    ),
  default_store_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, profile_id)
);

create index household_members_profile_id_household_id_idx
  on public.household_members (profile_id, household_id);
create index household_members_household_id_updated_at_idx
  on public.household_members (household_id, updated_at);

create function private.is_valid_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_email is not null
    and char_length(p_email) <= 254
    and p_email ~ '^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$'
$$;

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email text not null
    constraint household_invitations_email_valid check (email = lower(email) and private.is_valid_email(email)),
  invited_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_invitations_household_id_email_key unique (household_id, email),
  constraint household_invitations_household_id_id_key unique (household_id, id)
);

create index household_invitations_household_id_updated_at_idx
  on public.household_invitations (household_id, updated_at);
create index household_invitations_open_email_idx
  on public.household_invitations (email) where accepted_at is null;
create index household_invitations_invited_by_idx on public.household_invitations (invited_by);

-- ---------------------------------------------------------------------------------------------
-- Membership helpers (used by every household policy)
-- ---------------------------------------------------------------------------------------------

-- The caller's household ids. Use in policies as `household_id in (select private.my_household_ids())`
-- so it runs once per statement, not per row.
create function private.my_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id from public.household_members m where m.profile_id = (select auth.uid())
$$;

-- The caller's (lowercased) email from her profile, for invitation policies and RPCs.
create function private.my_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.email from public.profiles p where p.id = (select auth.uid())
$$;

grant execute on function private.my_household_ids() to authenticated;
grant execute on function private.my_email() to authenticated;

-- Raises `invalid_member` (23503, like a foreign key) unless every id is a member of the
-- household. Security invoker on purpose: under RLS a caller sees only the memberships of her own
-- households, so the check cannot be used to probe another household's members. Called by the
-- member-check triggers of tables whose person references are arrays or JSON (single columns use
-- composite foreign keys to household_members instead).
create function private.assert_members(p_household_id uuid, p_profile_ids uuid[])
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(p_profile_ids) as p (id)
    where p.id is null
       or not exists (
         select 1 from public.household_members m
         where m.household_id = p_household_id and m.profile_id = p.id
       )
  ) then
    raise exception 'invalid_member' using errcode = '23503';
  end if;
end
$$;

grant execute on function private.assert_members(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Grants and Row Level Security
-- ---------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invitations enable row level security;

-- profiles: read self and co-members; update only the own row, only personal fields.
grant select on public.profiles to authenticated;
grant update (name, color, diet_preference, dislikes) on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select m.profile_id from public.household_members m
      where m.household_id in (select private.my_household_ids())
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- households: members read and edit; an invited person reads the household she is invited to
-- (to decide whether to accept). Created only by create_household, never deleted via the API.
grant select on public.households to authenticated;
grant update (name, meal_slots, default_store_id) on public.households to authenticated;

create policy households_select on public.households for select to authenticated
  using (
    id in (select private.my_household_ids())
    or id in (
      select i.household_id from public.household_invitations i
      where i.email = (select private.my_email()) and i.accepted_at is null
    )
  );
create policy households_update on public.households for update to authenticated
  using (id in (select private.my_household_ids()))
  with check (id in (select private.my_household_ids()));

-- household_members: read only; written by the RPCs and the auth trigger.
grant select on public.household_members to authenticated;

create policy household_members_select on public.household_members for select to authenticated
  using (household_id in (select private.my_household_ids()));

-- household_invitations: members read their households' invitations; an invited person reads
-- her own open invitations. Written only by the RPCs and the auth trigger.
grant select on public.household_invitations to authenticated;

create policy household_invitations_select on public.household_invitations for select to authenticated
  using (
    household_id in (select private.my_household_ids())
    or (email = (select private.my_email()) and accepted_at is null)
  );

-- deleted_records (table from the foundation migration): members read their households' tombstones.
create policy deleted_records_select on public.deleted_records for select to authenticated
  using (household_id in (select private.my_household_ids()));

-- Realtime: members may receive broadcasts on the private topic of their households. No insert
-- policy: clients never send; only private.notify_household() does (as table owner).
create policy realtime_messages_select_household on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and private.household_id_from_topic((select realtime.topic())) in (select private.my_household_ids())
  );

-- ---------------------------------------------------------------------------------------------
-- Sync triggers
-- ---------------------------------------------------------------------------------------------

create trigger profiles_set_timestamps before insert or update on public.profiles
  for each row execute function private.set_timestamps();
create trigger households_set_timestamps before insert or update on public.households
  for each row execute function private.set_timestamps();
create trigger household_members_set_timestamps before insert or update on public.household_members
  for each row execute function private.set_timestamps();
create trigger household_invitations_set_timestamps before insert or update on public.household_invitations
  for each row execute function private.set_timestamps();

-- Removing a member leaves a tombstone (record_id = profile_id) for the remaining members. The
-- removed person's devices cannot read it; they learn it from the membership list that sync_pull
-- returns in full on every pull, and drop the household (sync.md, "Verlust der Mitgliedschaft").
create trigger household_members_record_deletion after delete on public.household_members
  for each row execute function private.record_deletion('profile_id');
create trigger household_invitations_record_deletion after delete on public.household_invitations
  for each row execute function private.record_deletion();

create trigger households_notify_insert after insert on public.households
  referencing new table as new_rows
  for each statement execute function private.notify_household('id');
create trigger households_notify_update after update on public.households
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.notify_household('id');
create trigger households_notify_delete after delete on public.households
  referencing old table as old_rows
  for each statement execute function private.notify_household('id');

create trigger household_members_notify_insert after insert on public.household_members
  referencing new table as new_rows
  for each statement execute function private.notify_household();
create trigger household_members_notify_update after update on public.household_members
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.notify_household();
create trigger household_members_notify_delete after delete on public.household_members
  referencing old table as old_rows
  for each statement execute function private.notify_household();

create trigger household_invitations_notify_insert after insert on public.household_invitations
  referencing new table as new_rows
  for each statement execute function private.notify_household();
create trigger household_invitations_notify_update after update on public.household_invitations
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.notify_household();
create trigger household_invitations_notify_delete after delete on public.household_invitations
  referencing old table as old_rows
  for each statement execute function private.notify_household();

-- A changed profile (name, colour, …) signals every household the person belongs to.
create function private.notify_profile_households()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  for v_household_id in
    select distinct m.household_id
    from public.household_members m
    where m.profile_id in (select r.id from new_rows r)
  loop
    perform realtime.send(
      jsonb_build_object('table', tg_table_name),
      'changed',
      'household:' || v_household_id,
      true
    );
  end loop;
  return null;
end
$$;

create trigger profiles_notify_update after update on public.profiles
  referencing new table as new_rows
  for each statement execute function private.notify_profile_households();

-- ---------------------------------------------------------------------------------------------
-- Sign-up gate: Supabase Auth hook "before_user_created"
-- ---------------------------------------------------------------------------------------------

-- Admits a new account only for provider google, an address Google verified
-- (user.user_metadata.email_verified is the boolean true; Supabase Auth copies the provider's
-- claims there) AND an open invitation for its (lowercased) email. Everything else is rejected
-- with 403 and the code `not_invited`, which the app shows in German. Runs as
-- supabase_auth_admin (security invoker) with column-level read access to invitations. Payload:
-- https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
-- (provider in user.app_metadata.provider).
create function private.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_email text := lower(btrim(event -> 'user' ->> 'email'));
  v_provider text := event -> 'user' -> 'app_metadata' ->> 'provider';
  v_verified jsonb := event -> 'user' -> 'user_metadata' -> 'email_verified';
begin
  if v_provider = 'google'
     and v_verified = 'true'::jsonb
     and v_email is not null
     and exists (
       select 1 from public.household_invitations i
       where i.email = v_email and i.accepted_at is null
     ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'not_invited'));
end
$$;

grant usage on schema private to supabase_auth_admin;
grant execute on function private.before_user_created_hook(jsonb) to supabase_auth_admin;
grant select (email, accepted_at) on public.household_invitations to supabase_auth_admin;
create policy household_invitations_select_auth_admin on public.household_invitations
  for select to supabase_auth_admin using (true);

-- ---------------------------------------------------------------------------------------------
-- Account bootstrap: profile + invitations → memberships
-- ---------------------------------------------------------------------------------------------

-- Fixed avatar palette; the colour follows from the account id, so it is stable and needs no state.
create function private.profile_color(p_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['#3E6C8E', '#A8456B', '#5B7F3A', '#B5652B', '#6A4C93', '#2F7F7A', '#8C6D1F', '#9C3D3D'])
    [1 + get_byte(uuid_send(p_id), 15) % 8]
$$;

-- Creates the profile of a new account. Memberships come only from accept_invitation.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(new.email));
  v_name text;
begin
  v_name := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(v_email, '@', 1), '')
  ), 80);

  insert into public.profiles (id, name, email, color)
  values (new.id, v_name, v_email, private.profile_color(new.id));

  return new;
end
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------------------------

-- Creates a household with the caller as its first member, the meal slots Vormittag, Mittag and
-- Abend, and the starter content (private.apply_starter, catalog migration).
create function private.create_household(p_name text, p_starter jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name);
  v_household_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  insert into public.households (name, meal_slots)
  values (v_name, jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'name', 'Vormittag', 'sort', 0),
    jsonb_build_object('id', gen_random_uuid(), 'name', 'Mittag', 'sort', 1),
    jsonb_build_object('id', gen_random_uuid(), 'name', 'Abend', 'sort', 2)
  ))
  returning id into v_household_id;

  insert into public.household_members (household_id, profile_id) values (v_household_id, v_uid);

  perform private.apply_starter(v_household_id, p_starter);
  return v_household_id;
end
$$;

-- Invites an address into a household the caller belongs to. Returns the invitation id; inviting
-- the same address again returns the existing invitation (and reopens an accepted one, e.g.
-- after the person was removed). An existing account stays invited until it accepts.
create function private.invite_member(p_household_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_invitation_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.profile_id = v_uid
  ) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if not private.is_valid_email(v_email) then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.household_members m
    join public.profiles p on p.id = m.profile_id
    where m.household_id = p_household_id and p.email = v_email
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  insert into public.household_invitations (household_id, email, invited_by)
  values (p_household_id, v_email, v_uid)
  on conflict (household_id, email)
    do update set accepted_at = null, invited_by = excluded.invited_by
  returning id into v_invitation_id;

  return v_invitation_id;
end
$$;

-- An existing account accepts an open invitation addressed to its email. Returns the household id.
create function private.accept_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  update public.household_invitations i
  set accepted_at = now()
  where i.id = p_invitation_id
    and i.email = (select p.email from public.profiles p where p.id = v_uid)
    and i.accepted_at is null
  returning i.household_id into v_household_id;

  if v_household_id is null then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  insert into public.household_members (household_id, profile_id)
  values (v_household_id, v_uid)
  on conflict do nothing;

  return v_household_id;
end
$$;

-- An existing account declines (deletes) an open invitation addressed to its email.
create function private.decline_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  delete from public.household_invitations i
  where i.id = p_invitation_id
    and i.email = (select p.email from public.profiles p where p.id = v_uid)
    and i.accepted_at is null;

  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
end
$$;

-- A member removes another member or leaves herself. The last member cannot leave (AC-012).
-- The household row is locked so two members removing each other cannot both succeed.
create function private.remove_member(p_household_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  perform 1 from public.households h where h.id = p_household_id for update;

  if not exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.profile_id = v_uid
  ) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.profile_id = p_profile_id
  ) then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.household_members m where m.household_id = p_household_id) <= 1 then
    raise exception 'last_member' using errcode = 'P0001';
  end if;

  delete from public.household_members m
  where m.household_id = p_household_id and m.profile_id = p_profile_id;
end
$$;

grant execute on function private.create_household(text, jsonb) to authenticated;
grant execute on function private.invite_member(uuid, text) to authenticated;
grant execute on function private.accept_invitation(uuid) to authenticated;
grant execute on function private.decline_invitation(uuid) to authenticated;
grant execute on function private.remove_member(uuid, uuid) to authenticated;

-- Public wrappers (PostgREST exposes only public). Parameter names are the RPC argument names.
create function public.create_household(name text, starter jsonb)
returns uuid
language sql
set search_path = ''
as $$ select private.create_household($1, $2) $$;

create function public.invite_member(household_id uuid, email text)
returns uuid
language sql
set search_path = ''
as $$ select private.invite_member($1, $2) $$;

create function public.accept_invitation(invitation_id uuid)
returns uuid
language sql
set search_path = ''
as $$ select private.accept_invitation($1) $$;

create function public.decline_invitation(invitation_id uuid)
returns void
language sql
set search_path = ''
as $$ select private.decline_invitation($1) $$;

create function public.remove_member(household_id uuid, profile_id uuid)
returns void
language sql
set search_path = ''
as $$ select private.remove_member($1, $2) $$;

grant execute on function public.create_household(text, jsonb) to authenticated;
grant execute on function public.invite_member(uuid, text) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.decline_invitation(uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
