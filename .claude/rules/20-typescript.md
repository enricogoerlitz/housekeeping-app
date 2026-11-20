---
paths:
  - '**/*.ts'
  - '**/*.tsx'
---

# TypeScript

- `strict` everywhere; `noUncheckedIndexedAccess` in packages. No `any`, no `@ts-ignore`. If a
  type is genuinely unknown, use `unknown` and narrow it.
- Validate data crossing a boundary with Zod and derive the type from the schema
  (`z.infer<typeof Schema>`). Do not hand-write a type that a schema already describes.
- Prefer plain functions and plain data. A class needs a reason (e.g. a stateful client).
- Name things with the glossary's code identifiers (`.agents/glossary.md`). German domain term in
  docs and UI, English identifier in code.
- One feature folder owns its components, hooks and screens: `apps/app/src/features/<feature>/`.
  Routes in `apps/app/src/app/` stay thin and delegate to feature components.
- Imports: workspace packages by name (`@housekeeping/core`), app-internal via `@/`. No deep
  imports into another package's `src/`.
- Formatting is Prettier's job; do not hand-format. Run `pnpm format` before committing.
- Comments explain why, not what. No commented-out code.
