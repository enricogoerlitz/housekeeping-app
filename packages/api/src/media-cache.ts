// The photos kept on the device (spec 0004, AC-011): one entry per photo next to the cache in the
// user's device storage, plus an index for the size budget. Shared by the photo flow
// (photos-remote.ts) and the sync engine (backend.ts), which drops the photos of a household the
// user lost together with that household's cache. Index updates are read-modify-write, so both go
// through one queue.
import type { Storage } from './storage';

export interface MediaIndexEntry {
  path: string;
  size: number;
  /** When it was stored (ms): the oldest go first. */
  at: number;
}

export const mediaKey = (path: string) => `media:${path}`;
export const MEDIA_INDEX_KEY = 'media-index';

/** The household of a photo path: its first folder. */
export const mediaHouseholdId = (path: string) => path.split('/')[0] ?? '';

export function readMediaIndex(value: unknown): MediaIndexEntry[] {
  return Array.isArray(value) ? (value as MediaIndexEntry[]) : [];
}

/**
 * Which stored photos stay: none of households no longer on the device, then the oldest go until
 * the rest fits the budget. `kept` keeps the order of the index.
 */
export function evictMedia(
  index: readonly MediaIndexEntry[],
  budgetBytes: number,
  householdIds: ReadonlySet<string>,
): { kept: MediaIndexEntry[]; dropped: string[] } {
  const dropped = new Set<string>();
  for (const entry of index) {
    if (!householdIds.has(mediaHouseholdId(entry.path))) dropped.add(entry.path);
  }
  let total = index.reduce((sum, entry) => (dropped.has(entry.path) ? sum : sum + entry.size), 0);
  for (const entry of [...index].sort((a, b) => a.at - b.at)) {
    if (total <= budgetBytes) break;
    if (dropped.has(entry.path)) continue;
    dropped.add(entry.path);
    total -= entry.size;
  }
  return { kept: index.filter((entry) => !dropped.has(entry.path)), dropped: [...dropped] };
}

let mediaQueue: Promise<unknown> = Promise.resolve();
/** Runs index updates one at a time. */
export function serially<T>(task: () => Promise<T>): Promise<T> {
  const run = mediaQueue.then(task, task);
  mediaQueue = run.catch(() => undefined);
  return run;
}

/**
 * Deletes the stored photos of every household not in `householdIds` (a household the user lost),
 * the bytes and their index entries — not only hiding them.
 */
export function dropMediaOutside(
  storage: Storage,
  householdIds: ReadonlySet<string>,
): Promise<void> {
  return serially(async () => {
    const index = readMediaIndex(await storage.get(MEDIA_INDEX_KEY));
    const kept = index.filter((entry) => householdIds.has(mediaHouseholdId(entry.path)));
    if (kept.length === index.length) return;
    await storage.setMany([[MEDIA_INDEX_KEY, kept]]);
    await storage.del(
      index.filter((entry) => !kept.includes(entry)).map((entry) => mediaKey(entry.path)),
    );
  });
}
