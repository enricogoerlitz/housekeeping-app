// The store queue (ADR-0008 addendum, ADR-0013): the offline actions of store mode and packing,
// one RPC per action, a run of pack entries as one set_packing_items_packed call.
import {
  applyQueue,
  enqueue,
  remapQueue,
  requeue,
  type PackEntry,
  type Row,
  type StoreQueueEntry,
  type TableRows,
} from '@housekeeping/core';

import type { EngineContext } from './engine-context';
import { unsent } from './engine-context';
import { persistQueue } from './engine-persistence';
import type { StoreAction } from './store';
import { isNetworkFailure, isTransient, TransportError, type AddEntry } from './transport';

function toAddEntry(entry: Extract<StoreQueueEntry, { kind: 'add' }>): AddEntry {
  const first = entry.contributions[0];
  return {
    client_item_id: entry.clientItemId,
    client_article_id: entry.clientArticleId,
    article_name: first?.articleName ?? '',
    name_key: first?.nameKey ?? '',
    contributions: entry.contributions.map((contribution) => ({
      id: contribution.clientContributionId,
      source: { kind: 'manual' },
      count: contribution.count ?? null,
      qty: contribution.qty ?? null,
      unit: contribution.unit ?? null,
      note: contribution.note ?? null,
    })),
  };
}

function withSeq(
  ctx: EngineContext,
  entry: StoreQueueEntry,
  from: StoreQueueEntry,
): StoreQueueEntry {
  const value = ctx.entrySeq.get(from);
  if (value !== undefined && !ctx.entrySeq.has(entry)) ctx.entrySeq.set(entry, value);
  return entry;
}

/** Items with a store action that has not been answered yet (the small dot). */
export function pendingItemIds(
  ctx: EngineContext,
  base: TableRows,
  householdId: string,
): Set<string> {
  const after = applyQueue(base, unsent(ctx), householdId);
  const ids = new Set<string>();
  if (after === base) return ids;
  for (const [id, row] of Object.entries(after.shopping_items ?? {})) {
    if (base.shopping_items?.[id] !== row) ids.add(id);
  }
  for (const [id, row] of Object.entries(after.shopping_contributions ?? {})) {
    if (base.shopping_contributions?.[id] !== row) ids.add(String(row.item_id));
  }
  return ids;
}

export function scheduleRetry(ctx: EngineContext): void {
  if (ctx.retryTimer) return;
  const { retryDelays } = ctx;
  const delay = retryDelays[Math.min(ctx.retryAttempt, retryDelays.length - 1)] ?? 30_000;
  ctx.retryAttempt += 1;
  ctx.retryTimer = setTimeout(() => {
    ctx.retryTimer = undefined;
    void ctx.drain();
  }, delay);
}

export function noteFailure(ctx: EngineContext, error: unknown): void {
  if (isNetworkFailure(error) && !ctx.transport.isBlocked()) ctx.networkFailed = true;
}

export function noteSuccess(ctx: EngineContext): void {
  if (ctx.networkFailed) {
    ctx.networkFailed = false;
    ctx.rebuild();
  }
}

function rewriteQueue(
  ctx: EngineContext,
  rewrite: (entries: StoreQueueEntry[]) => StoreQueueEntry[],
): void {
  const before = ctx.queue;
  const after = rewrite(before);
  ctx.queue = after.map((entry, index) => {
    const from = before[index];
    return from ? withSeq(ctx, entry, from) : entry;
  });
}

/**
 * Sends the first store-queue entry, or the run of pack entries at the front as one
 * set_packing_items_packed call (ADR-0013). False when it has to wait (transient failure).
 */
export async function sendEntry(
  ctx: EngineContext,
  entry: StoreQueueEntry,
  run: readonly PackEntry[],
): Promise<boolean> {
  const { transport } = ctx;
  const sent: StoreQueueEntry[] = run.length > 0 ? [...run] : [entry];
  ctx.queue = ctx.queue.slice(sent.length);
  ctx.inFlight = sent;
  void persistQueue(ctx);
  try {
    const ids: Record<string, string> = {};
    if (entry.kind === 'check') {
      const answer = await transport.setItemChecked(
        entry.itemId,
        entry.checked,
        entry.seenCheckSeq,
        entry.onList,
      );
      if (answer) {
        ctx.knownCheckSeq.set(answer.item_id, answer.check_seq);
        if (answer.item_id !== entry.itemId) ids[entry.itemId] = answer.item_id;
        // Later toggles of the same item were queued against the seq before this one.
        rewriteQueue(ctx, (entries) =>
          entries.map((candidate) =>
            candidate.kind === 'check' && candidate.itemId === entry.itemId
              ? { ...candidate, seenCheckSeq: answer.check_seq }
              : candidate,
          ),
        );
      }
    } else if (entry.kind === 'notAvailable') {
      await transport.setItemNotAvailable(entry.itemId, entry.value);
    } else if (entry.kind === 'assignArea') {
      await transport.assignArticleArea(entry.articleId, entry.areaId);
    } else if (entry.kind === 'pack') {
      const answer = await transport.setPackingItemsPacked(
        entry.householdId,
        run.map((packing) => ({
          item_id: packing.itemId,
          packed: packing.packed,
          seen_pack_seq: packing.seenPackSeq,
        })),
      );
      // Packstücke missing from the answer are gone meanwhile: their entries are done (AC-024).
      // The counters are known before anything else can be queued, so a later unpack of the
      // same Packstück carries the new one.
      const seqs = new Map(answer.map((row) => [row.item_id, row.pack_seq]));
      for (const [itemId, packSeq] of seqs) ctx.knownPackSeq.set(itemId, packSeq);
      rewriteQueue(ctx, (entries) =>
        entries.map((candidate) => {
          const packSeq = candidate.kind === 'pack' ? seqs.get(candidate.itemId) : undefined;
          return candidate.kind === 'pack' && packSeq !== undefined
            ? { ...candidate, seenPackSeq: packSeq }
            : candidate;
        }),
      );
    } else {
      const [answer] = await transport.addShoppingContributions(entry.householdId, [
        toAddEntry(entry),
      ]);
      if (answer && answer.item_id !== entry.clientItemId) {
        ids[entry.clientItemId] = answer.item_id;
      }
      if (answer && answer.article_id !== entry.clientArticleId) {
        ids[entry.clientArticleId] = answer.article_id;
      }
    }
    if (Object.keys(ids).length > 0) rewriteQueue(ctx, (entries) => remapQueue(entries, ids));
    noteSuccess(ctx);
    ctx.retryAttempt = 0;
    for (const done of sent) ctx.settling.push({ entry: done, confirmedAt: ctx.startedGeneration });
    ctx.inFlight = [];
    void persistQueue(ctx);
    ctx.rebuild();
    void ctx.requestPull();
    return true;
  } catch (error) {
    ctx.inFlight = [];
    if (isTransient(error)) {
      noteFailure(ctx, error);
      // Back in front, merged with entries queued meanwhile, so counter entries cancel.
      ctx.queue = requeue(sent, ctx.queue);
      void persistQueue(ctx);
      ctx.rebuild();
      scheduleRetry(ctx);
      return false;
    }
    // Permanent: dropped and logged, never blocking the queue (sync.md). No row data in logs.
    console.warn(
      `Store action dropped: ${error instanceof TransportError ? error.code : 'unknown'}`,
    );
    void persistQueue(ctx);
    ctx.rebuild();
    return true;
  }
}

function expectedRow(
  ctx: EngineContext,
  table: string,
  id: string,
): { server?: Row; expected?: Row } {
  for (const householdId of ctx.cache?.householdIds ?? []) {
    const tables = ctx.cache?.households[householdId]?.tables;
    if (!tables) continue;
    const confirmed = applyQueue(
      tables,
      [...ctx.settling.map((settled) => settled.entry), ...ctx.inFlight],
      householdId,
    );
    const expected = confirmed[table]?.[id];
    if (expected) return { server: tables[table]?.[id], expected };
  }
  return {};
}

export function enqueueStoreAction(ctx: EngineContext, action: StoreAction): void {
  let entry: StoreQueueEntry;
  let baseRow: Row | undefined;
  if (action.kind === 'check') {
    const { server, expected } = expectedRow(ctx, 'shopping_items', action.itemId);
    const seen = Math.max(
      Number(server?.check_seq ?? 0),
      ctx.knownCheckSeq.get(action.itemId) ?? 0,
    );
    entry = { ...action, onList: action.onList ?? false, seenCheckSeq: seen };
    baseRow = expected;
  } else if (action.kind === 'notAvailable') {
    entry = action;
    baseRow = expectedRow(ctx, 'shopping_items', action.itemId).expected;
  } else if (action.kind === 'assignArea') {
    entry = action;
    baseRow = expectedRow(ctx, 'articles', action.articleId).expected;
  } else if (action.kind === 'pack') {
    // The counter the device last saw: the cached row, or a newer answer to its own pack entry.
    // The expected row includes the run in flight, so an unpack queued meanwhile ("Rückgängig")
    // is kept instead of being taken for "no change" (ADR-0013).
    const { server, expected } = expectedRow(ctx, 'packing_items', action.itemId);
    const seen = Math.max(Number(server?.pack_seq ?? 0), ctx.knownPackSeq.get(action.itemId) ?? 0);
    entry = { ...action, seenPackSeq: seen };
    baseRow = expected;
  } else {
    entry = action;
  }
  const next = enqueue(ctx.queue, entry, baseRow);
  for (const candidate of next)
    if (!ctx.entrySeq.has(candidate)) ctx.entrySeq.set(candidate, ++ctx.seq);
  ctx.queue = next;
  void persistQueue(ctx);
  ctx.rebuild();
  // Sent after the current task: entries queued together ("Alles einpacken", one per
  // Packstück) leave as one run instead of the first one alone (ADR-0013).
  if (ctx.drainScheduled) return;
  ctx.drainScheduled = true;
  queueMicrotask(() => {
    ctx.drainScheduled = false;
    void ctx.drain();
  });
}
