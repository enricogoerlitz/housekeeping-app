-- Spec 0003, T3f — shopping items and their contributions.
--
-- The check state of an item (checked, checked_at, checked_by, check_seq, not_available) is
-- changed only by the store RPCs (T4), which enforce "checking wins" with check_seq (sync.md,
-- "Nachtrag Spec 0003"). Clients get no insert or update grant on these columns, and a trigger
-- forces a direct insert by the API role to the open state as a second line of defence.
-- At most one open item per article and list; checked items of the same article may coexist.

-- ---------------------------------------------------------------------------------------------
-- shopping_items
-- ---------------------------------------------------------------------------------------------

-- Deleting a list deletes its items. An article on a list cannot be deleted (restrict): the
-- item would lose its name; the client removes the items first, in the same RPC.
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  list_id uuid not null,
  article_id uuid not null,
  checked boolean not null default false,
  checked_at timestamptz,
  checked_by uuid,
  check_seq integer not null default 0
    constraint shopping_items_check_seq_valid check (check_seq >= 0),
  not_available boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_items_household_id_id_key unique (household_id, id),
  constraint shopping_items_list_fkey foreign key (household_id, list_id)
    references public.shopping_lists (household_id, id) on delete cascade,
  constraint shopping_items_article_fkey foreign key (household_id, article_id)
    references public.articles (household_id, id) on delete restrict,
  constraint shopping_items_checked_by_fkey foreign key (household_id, checked_by)
    references public.household_members (household_id, profile_id) on delete set null (checked_by)
);

create index shopping_items_household_id_updated_at_idx on public.shopping_items (household_id, updated_at);
create index shopping_items_household_id_list_id_idx on public.shopping_items (household_id, list_id);
create index shopping_items_household_id_article_id_idx on public.shopping_items (household_id, article_id);
create index shopping_items_household_id_checked_by_idx on public.shopping_items (household_id, checked_by);
-- One open item per article and list (target of the merge in add_shopping_contributions, T4).
create unique index shopping_items_open_article_idx on public.shopping_items (list_id, article_id)
  where not checked;

-- Before insert: an item inserted directly by the API role starts open, unseen and available.
-- The store RPCs (security definer, run as the owner) and the seed are not affected.
create function private.shopping_items_insert_open()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.checked := false;
    new.checked_at := null;
    new.checked_by := null;
    new.check_seq := 0;
    new.not_available := false;
  end if;
  return new;
end
$$;

create trigger shopping_items_insert_open before insert on public.shopping_items
  for each row execute function private.shopping_items_insert_open();

grant select, delete on public.shopping_items to authenticated;
grant insert (id, household_id, list_id, article_id) on public.shopping_items to authenticated;
grant update (list_id, article_id) on public.shopping_items to authenticated;
select private.attach_household_policies('public.shopping_items');
select private.attach_sync_triggers('public.shopping_items');

-- ---------------------------------------------------------------------------------------------
-- shopping_contributions
-- ---------------------------------------------------------------------------------------------

-- One reason an item is on the list (core ContributionSource): manual, recurring, or a recipe
-- (recipeId, optional entryId, label). The ids inside source are not foreign keys: the
-- contribution keeps its label when the recipe or plan entry is gone.
create table public.shopping_contributions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid not null,
  source jsonb not null default '{"kind": "manual"}'
    constraint shopping_contributions_source_valid check (
      jsonb_typeof(source) = 'object'
      and case coalesce(source ->> 'kind', '')
        when 'manual' then true
        when 'recurring' then true
        when 'recipe' then coalesce(jsonb_typeof(source -> 'recipeId') = 'string'
                                    and jsonb_typeof(source -> 'label') = 'string', false)
        else false
      end
      and octet_length(source::text) <= 1000),
  count integer
    constraint shopping_contributions_count_valid check (count between 1 and 10000),
  qty numeric
    constraint shopping_contributions_qty_valid check (qty > 0 and qty <= 1000000),
  unit text
    constraint shopping_contributions_unit_length check (char_length(unit) <= 20),
  note text
    constraint shopping_contributions_note_length check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_contributions_household_id_id_key unique (household_id, id),
  constraint shopping_contributions_item_fkey foreign key (household_id, item_id)
    references public.shopping_items (household_id, id) on delete cascade
);

create index shopping_contributions_household_id_updated_at_idx
  on public.shopping_contributions (household_id, updated_at);
create index shopping_contributions_household_id_item_id_idx
  on public.shopping_contributions (household_id, item_id);

grant select, delete on public.shopping_contributions to authenticated;
grant insert (id, household_id, item_id, source, count, qty, unit, note)
  on public.shopping_contributions to authenticated;
grant update (item_id, source, count, qty, unit, note) on public.shopping_contributions to authenticated;
select private.attach_household_policies('public.shopping_contributions');
select private.attach_sync_triggers('public.shopping_contributions');
