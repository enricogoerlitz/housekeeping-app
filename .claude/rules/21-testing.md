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

| Layer            | Tool                                     | What belongs here                                                                         |
| ---------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/core`  | Vitest                                   | Domain logic: merging list contributions, units, ordering, scaling. Most tests live here. |
| `supabase/tests` | pgTAP (`pnpm exec supabase test db`)     | RLS and tenant isolation, constraints, database functions                                 |
| `packages/api`   | Vitest                                   | Mapping between local rows and domain types; upload error classification                  |
| `apps/app`       | jest-expo + React Native Testing Library | Component behaviour that matters to a user (introduced with the first UI spec)            |
| Web, end to end  | Playwright                               | A few critical flows; screenshots via `/ui-verify`                                        |

Push logic down: if a component test is hard to write, the logic probably belongs in `core`.

## Conventions

- Test files sit next to the code: `merge-items.ts` → `merge-items.test.ts`.
- Test names start with the criterion they prove: `it('AC-007: …')`. Tests without a criterion
  are fine for internal helpers, but say what behaviour they pin.
- Every requirement gets its failure case: invalid input, foreign household, offline, empty state.
- No network in unit tests. No sleeps; use fake timers.
- Offline and sync behaviour is tested as pure logic in `core` wherever possible (conflict rules,
  merge rules), not through a running sync service.
