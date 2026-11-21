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
- **Two online-only reads:** the person's own push subscriptions ("Deine Geräte") come from
  `list_push_subscriptions`, never from the cache, and show an offline hint without network
  (ADR-0014). Push subscriptions and the delivery log are never synced. Notification settings
  are a normal synced table, readable only by the member herself.
- The version check reads `/version.json` (`cache: 'no-store'`, never from the service worker
  cache) and `public.min_app_version()` online, at start and on returning to the foreground
  (ADR-0015). Without network it does nothing: no hint, no error, no lock. Below the minimum
  version, write commands are disabled as when offline and the store queue is held; reads and the
  delta sync continue.
- **Writes are online.** They go straight to Supabase (API or RPC), followed by a delta sync. When
  offline, write actions are disabled with a clear hint. They are never queued silently.
- **Offline writes exist only in store mode and for packing**: check/uncheck ("checking wins"),
  "not here", add item, assign area (ADR-0008 addendum); packing / unpacking a packing item, also
  "Alles einpacken" and "Für die Rückreise zurücksetzen" (ADR-0013, "checking wins" via
  `pack_seq`). They go through the store queue, one RPC per action; a contiguous run of packing
  entries of one household goes as one `set_packing_items_packed` call. Adding another offline
  write needs a spec and an ADR addendum.
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
