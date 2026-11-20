---
paths:
  - 'packages/api/**'
  - 'packages/core/**'
  - 'supabase/**'
---

# Sync

The concept is in `docs/architecture/sync.md` (ADR-0008). These rules must never be violated.

- **Reads come from the local cache.** UI code reads reactively from the cache in `packages/api`.
  It never awaits a network request to show data.
- **Writes are online.** They go straight to Supabase (API or RPC), followed by a delta sync. When
  offline, write actions are disabled with a clear hint. They are never queued silently.
- **The only offline write is checking shopping items.** It goes through the check queue and the
  check RPC, rule "checking wins". Adding another offline write needs a spec and an ADR.
- **Multi-row actions are one RPC in one transaction.** No client-side sequences of writes that
  can stop halfway.
- **Every synced table has a server-set `updated_at`** (trigger) and a delete trigger into
  `deleted_records`. Without both, the delta sync silently misses changes.
- **The cursor advances only after a sync step fully succeeded**, and every delta query overlaps by
  the safety window. Applying the same row twice must be harmless (upsert).
- **The cache is disposable.** Changing its shape bumps the cache version and triggers a full load.
  Never migrate cache data in place.
- **Realtime is only a signal** that triggers the normal delta sync. Never apply realtime payloads
  to the cache directly.
- **Sync and merge logic are pure functions in `packages/core`** with unit tests. `packages/api`
  only does I/O.
- **Sign-out clears the cache and the check queue.**
