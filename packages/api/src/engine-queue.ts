// The outbox of the sync engine (ADR-0011): changesets of the commands in one FIFO with the store
// queue, shown on top of the cache until a pull contains them, and their undo.
import { packBatch, rejectFrom, type RowOp, type StoreQueueEntry } from '@housekeeping/core';

import { diffHousehold, sendable, withoutPassedReminders } from './changes';
import {
  canReachServer,
  report,
  WRITE_REJECTED_MESSAGE,
  writesDisabled,
  type EngineContext,
  type OutboxCommit,
} from './engine-context';
import { noteFailure, noteSuccess, sendEntry } from './engine-store-queue';
import { OfflineError, type AppState, type CommitOutcome, type CommitSpec } from './store';
import { isTransient } from './transport';

const HISTORY_LIMIT = 100;

async function sendCommit(ctx: EngineContext, entry: OutboxCommit): Promise<void> {
  entry.changeset = { ...entry.changeset, status: 'sent' };
  try {
    entry.response = await entry.send(ctx.transport);
    noteSuccess(ctx);
    entry.changeset = {
      ...entry.changeset,
      status: 'confirmed',
      confirmedAt: ctx.startedGeneration,
    };
    report(entry);
  } catch (error) {
    if (isTransient(error)) {
      noteFailure(ctx, error);
      entry.unknownOutcome = true;
      entry.changeset = {
        ...entry.changeset,
        status: 'confirmed',
        confirmedAt: ctx.startedGeneration,
      };
    } else {
      const { dropped } = rejectFrom(
        ctx.commits.map((candidate) => candidate.changeset),
        entry.changeset.id,
      );
      const droppedIds = new Set(dropped.map((changeset) => changeset.id));
      for (const candidate of ctx.commits) {
        if (!droppedIds.has(candidate.changeset.id)) continue;
        candidate.rejected = true;
        report(candidate, error);
      }
      ctx.commits = ctx.commits.filter((candidate) => !droppedIds.has(candidate.changeset.id));
      ctx.rebuild();
      ctx.options.onWriteRejected?.(entry.rejectedMessage?.(error) ?? WRITE_REJECTED_MESSAGE);
      return;
    }
  }
  void ctx.requestPull();
}

async function step(ctx: EngineContext): Promise<boolean> {
  if (!ctx.running || !canReachServer(ctx)) return false;
  const next = ctx.commits.find((entry) => entry.changeset.status === 'pending');
  const head = ctx.queue[0];
  if (!next && !head) return false;
  const seqOf = (entry: StoreQueueEntry) => ctx.entrySeq.get(entry) ?? Number.POSITIVE_INFINITY;
  if (next && (!head || next.seq < seqOf(head))) {
    await sendCommit(ctx, next);
    return true;
  }
  // A held queue also holds the changes queued after its head (FIFO); releasing drains.
  if (!head || ctx.versionGate.queueHeld()) return false;
  // A run of pack entries never overtakes a change queued after its first entry (FIFO).
  const run = packBatch(ctx.queue).filter((_, index, all) =>
    all.slice(0, index + 1).every((entry) => !next || seqOf(entry) < next.seq),
  );
  return sendEntry(ctx, head, run);
}

/** Sends outbox and store queue in order until both wait or are empty. */
export function drain(ctx: EngineContext): Promise<void> {
  if (ctx.drainPromise) {
    ctx.drainAgain = true;
    return ctx.drainPromise;
  }
  ctx.drainPromise = (async () => {
    try {
      while (ctx.running) {
        ctx.drainAgain = false;
        if (!(await step(ctx)) && !ctx.drainAgain) break;
      }
    } finally {
      ctx.drainPromise = undefined;
    }
  })();
  return ctx.drainPromise;
}

/** The store holds the command's own result; the engine's view (same rows) replaces it. */
function republish(ctx: EngineContext): void {
  ctx.rebuild();
  if (ctx.appState) ctx.options.onStateChange?.(ctx.appState);
}

export function recordChange<T>(
  ctx: EngineContext,
  spec: CommitSpec<T>,
  before: AppState,
  after: AppState,
  result: T,
  onOutcome?: CommitOutcome,
): void {
  const householdId = before.activeHouseholdId;
  const old = before.households[householdId];
  const next = after.households[householdId];
  if (!old || !next) throw new Error(`Household ${householdId} is not loaded`);
  const change =
    old === next
      ? { ops: [], inverse: [], send: [], sendInverse: [] }
      : diffHousehold(old, next, {
          mode: spec.path === 'diff' ? 'send' : 'local',
          maxDeletes: spec.path === 'diff' ? spec.maxDeletes : undefined,
        });
  if (spec.path === 'diff' && change.send.length === 0) {
    republish(ctx);
    onOutcome?.();
    return;
  }
  ctx.seq += 1;
  const seq = ctx.seq;
  const context = { result, householdId, ops: change.ops };
  const entry: OutboxCommit = {
    seq,
    onOutcome,
    rejectedMessage: spec.rejectedMessage,
    changeset: { id: `changeset-${seq}`, householdId, ops: change.ops, status: 'pending' },
    send:
      spec.path === 'diff'
        ? (wire) => {
            const ops = sendable(change.send);
            return spec.send
              ? spec.send(wire, householdId, ops)
              : wire.applyChanges(householdId, ops);
          }
        : (wire) => spec.send(wire, context),
  };
  if (spec.path === 'diff') {
    // Nothing to undo (e.g. only an article was created, which undo keeps): no empty call.
    if (change.sendInverse.length > 0) {
      entry.inverse = {
        ops: change.inverse,
        send: (wire) => wire.applyChanges(householdId, sendable(change.sendInverse)),
        sendOps: change.sendInverse,
      };
    }
  } else if (spec.inverse) {
    const inverse = spec.inverse;
    entry.inverse = {
      ops: change.inverse,
      send: (wire) => inverse(wire, context, entry.response),
    };
  }
  ctx.commits.push(entry);
  ctx.history = [...ctx.history, entry].slice(-HISTORY_LIMIT);
  republish(ctx);
  void drain(ctx);
}

/** "Rückgängig": sends the inverse of every own change since now, newest first. */
export function undoable(ctx: EngineContext): () => void {
  const mark = ctx.seq;
  return () => {
    if (writesDisabled(ctx)) throw new OfflineError();
    const own = ctx.history.filter((entry) => entry.seq > mark && !entry.rejected).reverse();
    const now = new Date();
    for (const entry of own) {
      const { inverse } = entry;
      if (!inverse) continue;
      const { householdId } = entry.changeset;
      const timeZone = ctx.appState?.households[householdId]?.household.timeZone;
      const { sendOps } = inverse;
      // Spec 0017, REQ-006: an entry inserted again keeps only a reminder still to come.
      const passed = (ops: RowOp[]) =>
        timeZone === undefined ? ops : withoutPassedReminders(ops, now, timeZone);
      ctx.seq += 1;
      const seq = ctx.seq;
      ctx.commits.push({
        seq,
        changeset: {
          id: `changeset-${seq}`,
          householdId,
          ops: sendOps ? passed(inverse.ops) : inverse.ops,
          status: 'pending',
        },
        send: sendOps
          ? (wire) => wire.applyChanges(householdId, sendable(passed(sendOps)))
          : inverse.send,
      });
    }
    ctx.rebuild();
    void drain(ctx);
  };
}
