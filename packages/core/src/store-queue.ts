// Store queue (ADR-0008 addendum, docs/architecture/sync.md): the four store-mode actions that
// work offline. Entries are kept on the device, take effect locally at once and are sent later,
// one RPC each, in order.
import { z } from 'zod';

import type { Row, TableRows } from './sync-delta';

const QueuedContributionSchema = z.object({
  clientContributionId: z.string().min(1),
  articleName: z.string().min(1),
  /** `normalizeText(articleName)`; the server resolves the article with it. */
  nameKey: z.string().min(1),
  count: z.number().optional(),
  qty: z.number().optional(),
  unit: z.string().optional(),
  note: z.string().optional(),
});

const AddEntrySchema = z
  .object({
    kind: z.literal('add'),
    /** The household whose shopping list gets the contributions. */
    householdId: z.string().min(1),
    /** Id of the item if a new one is needed; replaced by the server's id via remapQueue. */
    clientItemId: z.string().min(1),
    /** Id of the article if no article has this name yet; replaced like clientItemId. */
    clientArticleId: z.string().min(1),
    /** All for the same article (same nameKey). */
    contributions: z.array(QueuedContributionSchema),
  })
  .refine(namesOneArticle);

/**
 * One entry of the store queue. The queue is stored on the device and read back after a reload
 * or an app update, so a stored entry is input: it is parsed with this schema, never cast.
 */
export const StoreQueueEntrySchema = z.union([
  z.object({
    kind: z.literal('check'),
    itemId: z.string().min(1),
    checked: z.boolean(),
    seenCheckSeq: z.number().int().nonnegative(),
  }),
  z.object({ kind: z.literal('notAvailable'), itemId: z.string().min(1), value: z.boolean() }),
  AddEntrySchema,
  z.object({
    kind: z.literal('assignArea'),
    articleId: z.string().min(1),
    areaId: z.string().min(1).nullable(),
  }),
]);

export type QueuedContribution = z.infer<typeof QueuedContributionSchema>;
export type StoreQueueEntry = z.infer<typeof StoreQueueEntrySchema>;

function namesOneArticle(entry: { contributions: readonly QueuedContribution[] }): boolean {
  return new Set(entry.contributions.map((contribution) => contribution.nameKey)).size === 1;
}

/**
 * The stored queue as read from the device: the entries that parse, in order, and how many did
 * not. A lost entry is a lost action, so the caller must tell the user (never drop silently).
 */
export function parseStoredQueue(stored: unknown): { entries: StoreQueueEntry[]; dropped: number } {
  if (stored === undefined) return { entries: [], dropped: 0 };
  if (!Array.isArray(stored)) return { entries: [], dropped: 1 };
  const entries: StoreQueueEntry[] = [];
  for (const candidate of stored) {
    const parsed = StoreQueueEntrySchema.safeParse(candidate);
    if (parsed.success) entries.push(parsed.data);
  }
  return { entries, dropped: stored.length - entries.length };
}

type ToggleEntry = Extract<StoreQueueEntry, { kind: 'check' | 'notAvailable' }>;

function targetOf(entry: StoreQueueEntry): string | undefined {
  if (entry.kind === 'check' || entry.kind === 'notAvailable') return entry.itemId;
  if (entry.kind === 'assignArea') return entry.articleId;
  return undefined;
}

function toggleValue(entry: ToggleEntry): boolean {
  return entry.kind === 'check' ? entry.checked : entry.value;
}

function baseValue(entry: StoreQueueEntry, base: Row | undefined): unknown {
  if (!base) return undefined;
  if (entry.kind === 'check') return base.checked === true;
  if (entry.kind === 'notAvailable') return base.not_available === true;
  if (entry.kind === 'assignArea') return base.area_id ?? null;
  return undefined;
}

function entryValue(entry: StoreQueueEntry): unknown {
  if (entry.kind === 'assignArea') return entry.areaId;
  if (entry.kind === 'add') return undefined;
  return toggleValue(entry);
}

function assertOneArticle(entry: Extract<StoreQueueEntry, { kind: 'add' }>): void {
  if (!namesOneArticle(entry)) throw new Error('An add entry must name exactly one article.');
}

/**
 * Appends an entry, collapsing repeated actions on the same item or article into the final state:
 * - an entry whose value equals the base state is not queued (`baseState` = the item's or
 *   article's server row; undefined for things created offline);
 * - a toggle back to the state the item had when first queued removes the queued entry;
 * - a new area replaces the queued one, and disappears when it equals the base area;
 * - entries are never merged across an `add`, so their order relative to it is kept.
 * The entry that is being sent must already be out of the queue, so it is never merged into.
 */
export function enqueue(
  queue: readonly StoreQueueEntry[],
  entry: StoreQueueEntry,
  baseState: Row | undefined,
): StoreQueueEntry[] {
  if (entry.kind === 'add') {
    assertOneArticle(entry);
    return [...queue, entry];
  }
  const target = targetOf(entry);

  let previousIndex = -1;
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const candidate = queue[index];
    if (!candidate || candidate.kind === 'add') break;
    if (candidate.kind === entry.kind && targetOf(candidate) === target) {
      previousIndex = index;
      break;
    }
  }

  const previous = queue[previousIndex];
  if (!previous) {
    // Behind an add, an earlier entry for the same target will still change the server state, so
    // the base state says nothing about whether this one is needed.
    const queuedBeforeAdd = queue.some(
      (candidate) => candidate.kind === entry.kind && targetOf(candidate) === target,
    );
    if (!queuedBeforeAdd && baseState && baseValue(entry, baseState) === entryValue(entry)) {
      return [...queue];
    }
    return [...queue, entry];
  }

  const without = queue.filter((_, index) => index !== previousIndex);
  if (entry.kind === 'assignArea') {
    if (baseState && baseValue(entry, baseState) === entry.areaId) return without;
    return queue.map((candidate, index) => (index === previousIndex ? entry : candidate));
  }
  // A queued toggle only exists while it differs from the state when it was queued, so the
  // opposite value is that state again: nothing left to send.
  if (entryValue(previous) !== entryValue(entry)) return without;
  return [...queue];
}

/** Rewrites temporary ids (items and articles created offline) to the ids the server returned. */
export function remapQueue(
  queue: readonly StoreQueueEntry[],
  ids: Readonly<Record<string, string>>,
): StoreQueueEntry[] {
  return queue.map((entry) => {
    if (entry.kind === 'check' || entry.kind === 'notAvailable') {
      const itemId = ids[entry.itemId];
      return itemId === undefined ? entry : { ...entry, itemId };
    }
    if (entry.kind === 'assignArea') {
      const articleId = ids[entry.articleId];
      return articleId === undefined ? entry : { ...entry, articleId };
    }
    return entry;
  });
}

function withRow(tables: TableRows, table: string, row: Row): TableRows {
  return { ...tables, [table]: { ...tables[table], [row.id]: row } };
}

function findArticle(tables: TableRows, nameKey: string): Row | undefined {
  return Object.values(tables.articles ?? {}).find(
    (article) =>
      article.name_key === nameKey ||
      (Array.isArray(article.synonym_keys) && article.synonym_keys.includes(nameKey)),
  );
}

function addEffect(
  entry: Extract<StoreQueueEntry, { kind: 'add' }>,
  tables: TableRows,
  householdId: string,
): TableRows {
  const first = entry.contributions[0];
  if (!first || entry.householdId !== householdId) return tables;

  let next = tables;
  let article = findArticle(next, first.nameKey);
  if (!article) {
    article = {
      id: entry.clientArticleId,
      name: first.articleName,
      name_key: first.nameKey,
      synonym_keys: [],
      area_id: null,
    };
    next = withRow(next, 'articles', article);
  }

  // Same rules as addContribution: append to the open item, else reopen a checked one with only
  // the new contributions (old ones were bought, "nicht da" belonged to that trip), else create.
  const forArticle = Object.values(next.shopping_items ?? {}).filter(
    (item) => item.article_id === article.id,
  );
  const open = forArticle.find((item) => item.checked !== true);
  const checked = forArticle.find((item) => item.checked === true);
  let itemId: string;
  if (open) {
    itemId = open.id;
  } else if (checked) {
    itemId = checked.id;
    next = withRow(next, 'shopping_items', {
      ...checked,
      checked: false,
      checked_at: null,
      checked_by: null,
      not_available: false,
    });
    const kept = Object.entries(next.shopping_contributions ?? {}).filter(
      ([, contribution]) => contribution.item_id !== itemId,
    );
    next = { ...next, shopping_contributions: Object.fromEntries(kept) };
  } else {
    itemId = entry.clientItemId;
    next = withRow(next, 'shopping_items', {
      id: itemId,
      household_id: entry.householdId,
      article_id: article.id,
      checked: false,
      checked_at: null,
      checked_by: null,
      check_seq: 0,
      not_available: false,
    });
  }

  for (const contribution of entry.contributions) {
    next = withRow(next, 'shopping_contributions', {
      id: contribution.clientContributionId,
      item_id: itemId,
      source: { kind: 'manual' },
      count: contribution.count ?? null,
      qty: contribution.qty ?? null,
      unit: contribution.unit ?? null,
      note: contribution.note ?? null,
    });
  }
  return next;
}

/**
 * How one entry changes the visible rows (`shopping_items`, `shopping_contributions`,
 * `articles`) of the household `householdId` (`tables` are its rows). An entry whose item or
 * article no longer exists changes nothing (AC-025); an add for another household neither.
 */
export function queueEffect(
  entry: StoreQueueEntry,
  tables: TableRows,
  householdId: string,
): TableRows {
  if (entry.kind === 'add') return addEffect(entry, tables, householdId);
  if (entry.kind === 'assignArea') {
    const article = tables.articles?.[entry.articleId];
    return article ? withRow(tables, 'articles', { ...article, area_id: entry.areaId }) : tables;
  }
  const item = tables.shopping_items?.[entry.itemId];
  if (!item) return tables;
  if (entry.kind === 'notAvailable') {
    return withRow(tables, 'shopping_items', { ...item, not_available: entry.value });
  }
  const cleared = entry.checked ? {} : { checked_at: null, checked_by: null };
  return withRow(tables, 'shopping_items', { ...item, checked: entry.checked, ...cleared });
}

/** All entries applied in order: what the store queue adds to the household's server rows. */
export function applyQueue(
  tables: TableRows,
  queue: readonly StoreQueueEntry[],
  householdId: string,
): TableRows {
  return queue.reduce((rows, entry) => queueEffect(entry, rows, householdId), tables);
}
