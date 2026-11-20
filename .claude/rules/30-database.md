---
paths:
  - 'supabase/**'
---

# Database

Postgres in Supabase is the source of truth. Load the `supabase-postgres-best-practices` skill
before writing schema, and use the `db-change` skill for every schema change — it walks through
all places a change touches.

## Every table

- `id uuid primary key default gen_random_uuid()`. The client may supply the id (optimistic UI);
  the server default covers everything else.
- `household_id uuid not null` referencing the household, indexed. Exception: tables that define
  membership itself.
- `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
  set **by trigger on every update** — never by the client. The delta sync depends on it.
- A delete trigger writing into `deleted_records`, so deletions reach the devices.
- Explicit grants in the migration (the hosted project does not auto-grant new tables to the API):
  `authenticated` gets only the operations the spec needs, `anon` gets nothing.
- Row Level Security enabled, with separate policies for select, insert, update and delete.
- A pgTAP test proving: a member can do what the spec allows; a member of another household and a
  signed-out user can do nothing.
- Registered in the delta sync (see `31-sync.md`).

## Migrations

- Create with `pnpm exec supabase migration new <snake_case_name>`. Never edit a migration that
  has been committed — write a new one.
- Changes are **expand → migrate → contract**: add the new column, backfill, and drop the old one
  only when no released app version reads it any more. Installed apps update late.
- Never rename a column or table in place. Add, copy, switch, drop later.
- No destructive change without saying so explicitly in the plan.

## Naming

`snake_case`, plural table names (`recipes`, `shopping_items`), foreign keys `<entity>_id`.
Identifiers follow the glossary.
