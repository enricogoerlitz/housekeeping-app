---
name: db-change
description: Make a schema change end to end - Supabase migration, Row Level Security policies, pgTAP tenant-isolation test, sync stream configuration, local PowerSync client schema and generated types - so no step is forgotten. Use whenever a table, column, index, policy or database function is added or changed, or when a spec's plan contains database work.
argument-hint: "[short description of the change]"
---

# DB change

A schema change in this app touches up to six places. Forgetting one fails silently: a table
without a policy is open, a table without a sync stream never reaches the device, a column missing
from the client schema is invisible offline. This skill walks all six, every time.

Load `supabase-postgres-best-practices` and `powersync` before starting. Read
`.claude/rules/30-database.md`, `.claude/rules/31-sync.md` and `docs/architecture/sync.md`.

## Before you write anything

- Which spec and requirement does this serve? No requirement → stop and report.
- Is it **additive** (new table, new nullable column, new index) or **breaking** (rename, drop,
  type change, new NOT NULL without default)? Breaking changes need expand → migrate → contract
  across releases; write that sequence into the plan and confirm it with the user first.
- Does a released app version read what you change? Then the old shape must keep working.

If the project's household helpers (membership check function, `updated_at` trigger, sync stream
file) do not exist yet, you are in the first data spec: create them as part of it, with tests.
If something here contradicts what exists, stop and ask.

## The six steps

### 1. Migration

```bash
pnpm exec supabase migration new <snake_case_name>
```

Table shape per `30-database.md`: client-generated `uuid` id, `household_id` + index,
`created_at`, `updated_at` with trigger, constraints that encode the domain (not null, checks,
foreign keys with a deliberate `on delete`).

### 2. Row Level Security

`alter table … enable row level security;` and one policy per operation. Select, update and
delete check membership of `household_id`; insert and update use `with check` so a row can neither
be created in nor moved into a foreign household. Use the existing membership function — never
copy the membership query into each policy.

### 3. pgTAP test

`supabase/tests/<table>.test.sql`. At minimum:

- a member can select, insert, update, delete what the spec allows;
- a member of another household sees zero rows and cannot insert, update or delete;
- a signed-out (`anon`) caller can do nothing;
- an update cannot change `household_id` to a foreign household.

Write the test first and run it red: `pnpm exec supabase test db`.

### 4. Sync configuration

Add the table to the sync streams so that each user receives exactly the rows of their
households — the same rule as RLS, expressed for PowerSync. Check the replication publication
includes the table.

### 5. Client schema and types

- Add the table/columns to the PowerSync client schema in `packages/api`.
- Regenerate database types: `pnpm exec supabase gen types typescript --local` into the location
  `packages/api` uses.
- If domain types in `packages/core` change, update them and their tests.

### 6. Verify

```bash
pnpm exec supabase db reset      # applies all migrations + seed from scratch
pnpm exec supabase test db       # pgTAP
pnpm check                       # lint, typecheck, unit tests
```

All green, then commit migration, test, sync config and client schema **together** in one commit
with `Spec: NNNN`.

## Report

Name the table/columns, the policies, the test file and its result, the sync stream change, and
whether the change is additive or which expand/contract stage it is.

## Do not

- Do not edit a committed migration. Write a new one.
- Do not disable RLS "for now", not even locally.
- Do not use the `service_role` key to make a test pass.
- Do not sync a table that has no RLS, or a column the user must not see.
