---
paths:
  - 'supabase/**'
---

# Database

Postgres in Supabase is the source of truth. Load the `supabase-postgres-best-practices` skill
before writing schema, and use the `db-change` skill for every schema change — it walks through
all places a change touches.

## Every table

- `id uuid primary key` — generated **on the client** (offline creation). A server default is
  allowed as a fallback, never relied upon.
- `household_id uuid not null` referencing the household, indexed. Exception: tables that define
  membership itself.
- `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
  maintained by trigger.
- Row Level Security enabled, with separate policies for select, insert, update and delete.
- A pgTAP test proving: a member can do what the spec allows; a member of another household and a
  signed-out user can do nothing.
- Part of the sync configuration (see `31-sync.md`).

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
