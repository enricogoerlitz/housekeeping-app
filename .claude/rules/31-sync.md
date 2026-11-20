---
paths:
  - 'packages/api/**'
  - 'supabase/**'
  - 'powersync/**'
---

# Sync

The full concept is in `docs/architecture/sync.md`; load the `powersync` skill before working
here. These rules are the part that must never be violated.

- **Reads are local.** UI code queries the local database (reactive queries). It never awaits a
  network request to show daily-use data.
- **Writes are local.** Every mutation writes to the local database in a transaction; the upload
  queue carries it to Supabase. No feature calls Supabase directly for data it also syncs.
- **Online-only is the exception** and must be named in the spec: sign-in, creating or joining a
  household, invitations. These show a clear offline state instead of failing silently.
- **Upload sends only changed columns** (PATCH semantics), so concurrent edits of different
  fields both survive.
- **The upload queue never blocks.** Transient errors (offline, 5xx, timeout) retry with backoff.
  Permanent errors (4xx: RLS denied, constraint violated) drop the operation, record it locally
  and surface a hint in the UI.
- **No stored aggregates that two devices edit.** Store contributions per source and compute
  totals when reading.
- **Order with fractional keys**, never by renumbering positions.
- **Natural keys get deterministic ids** where two devices may create the same thing offline
  (e.g. an article by name): see the sync concept.
- **The client schema only grows.** Add tables and columns; never remove or rename what a released
  app version still reads.
- **Sync streams filter by household membership**, mirroring RLS exactly.
