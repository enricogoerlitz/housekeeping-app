# Copilot instructions

Read `AGENTS.md` first — it is the single source of truth (rules, commands, workflow, package boundaries). The
current hand-over with the working method and open work is `docs/handover/2026-11-28-copilot.md`.

Essentials that are easy to miss:

- Answer Enrico in German; code, identifiers and commits in English. Specs and UI copy in German.
- Work from a spec in `docs/specs/NNNN-slug/spec.md`; tests first and shown red; tick tasks and write "Nachweis".
- Never read `.env` or secret files; load env only via `set -a; . ./.env; set +a; <cmd>`.
- Never reset the shared local Supabase stack except with `pnpm db:reset` (it re-invites the owner). Single e2e
  files locally only with `E2E_SKIP_RESET=1`.
- No full e2e per change: the full suite runs once right before a production release (`release.yml` runs it too).
  The security check (`.claude/skills/security-check/SKILL.md`) runs once over the release diff.
- Branch from `develop`, PR to `develop`, squash-merge after green CI. Never push or merge to `main` unless Enrico
  explicitly allows the release (release PR develop → main, merge commit).
- The skills in `.claude/skills/*/SKILL.md` describe repeatable procedures (spec, db-change, ui-verify,
  security-check, recipe-crud, adr, glossary). Open and follow the matching one.
- UI work: check desktop (Playwright) and phone (iPhone simulator via `scripts/ios-sim/`), light and dark; Enrico's
  UX yardstick is in `docs/handover/2026-11-28-copilot.md`.
