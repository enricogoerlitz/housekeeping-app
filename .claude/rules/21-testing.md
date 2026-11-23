---
paths:
  - 'apps/**'
  - 'packages/**'
  - 'supabase/**'
  - '**/*.test.ts'
  - '**/*.test.tsx'
---

# Testing

Test first, and show it red before it goes green. A test that never failed proves nothing.

## Which layer, which tool

| Layer            | Tool                                 | What belongs here                                                                          |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `packages/core`  | Vitest                               | Domain logic: merging list contributions, units, ordering, scaling. Most tests live here.  |
| `supabase/tests` | pgTAP (`pnpm exec supabase test db`) | RLS and tenant isolation, constraints, database functions                                  |
| `packages/api`   | Vitest                               | Mapping between local rows and domain types; upload error classification                   |
| `packages/ui`    | Vitest, jsdom, react-native-web      | Components: roles, names, states, keyboard (`*.test.tsx`); pure layout logic (`*.test.ts`) |
| `apps/app`, web  | Playwright                           | The app end to end; screenshots via `/ui-verify`                                           |

Push logic down: if a component test is hard to write, the logic probably belongs in `core`.

## Coverage

`core`, `api` and `ui` measure every source file in `pnpm test` and `pnpm check` and fail below
80 % of the lines (`vitest.config.*`, guarded by `scripts/ci/coverage.test.mjs`). Reach it with
tests that prove behaviour, never with exclusions: only tests, test helpers and generated types are
excluded, each with its reason in the config. `apps/app` has no gate; the e2e suite covers it.
Single test files (`pnpm --filter … exec vitest run <file>`) run without coverage.

## Conventions

- Test files sit next to the code: `merge-items.ts` → `merge-items.test.ts`.
- Test names start with the criterion they prove: `it('AC-007: …')`. Tests without a criterion
  are fine for internal helpers, but say what behaviour they pin.
- Every requirement gets its failure case: invalid input, foreign household, offline, empty state.
- No network in unit tests. No sleeps; use fake timers.
- Offline and sync behaviour is tested as pure logic in `core` wherever possible (conflict rules,
  merge rules), not through a running sync service.
