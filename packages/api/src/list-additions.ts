// Putting contributions on the household's shopping list (ADR-0011, ADR-0012): the local effect, done inside a command, and the
// add entries that make the server do the same (`add_shopping_contributions`, merged there). Used
// by the shopping commands and the assistant; not part of the app's interface.
import {
  addContribution,
  normalizeText,
  parseSmartInput,
  withExactArticleName,
  type Article,
  type EntryAddition,
  type Id,
  type RowOp,
  type ShoppingItem,
  type ShoppingContribution,
} from '@housekeeping/core';

import { diffHousehold, sendable, withoutPassedReminders } from './changes';
import { resolveArticle } from './commands-articles';
import {
  commitConfirmed,
  getData,
  newId,
  nowISO,
  OfflineError,
  updateData,
  type CommitSpec,
  type HouseholdData,
} from './store';
import type { AddEntry, ChangeOp } from './transport';

function appendContribution(
  articleId: Id,
  contribution: ShoppingContribution,
  itemId: Id = newId(),
): Id {
  let resultId = itemId;
  updateData((data) => {
    const items = addContribution(data.items, articleId, contribution, itemId, nowISO());
    const target = items.find((item) => item.articleId === articleId && !item.checked);
    if (target) resultId = target.id;
    return { ...data, items };
  });
  return resultId;
}

export interface AddedItem {
  itemId: Id;
  articleName: string;
  /** True when the name was new and an article was created for it. */
  createdArticle: boolean;
}

/** JSON as it goes over the wire: no undefined values. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Puts contributions for one article on the list locally and returns the add entry that does the
 * same on the server (`add_shopping_contributions`), which merges into the open item there.
 * Runs inside a command. The local item id is the open item's, or `clientItemId` for a new one.
 */
export function addLocally(
  article: Article,
  contributions: ShoppingContribution[],
): { itemId: Id; entry: AddEntry } {
  const clientItemId = newId();
  let itemId = clientItemId;
  for (const contribution of contributions) {
    itemId = appendContribution(article.id, contribution, clientItemId);
  }
  return { itemId, entry: addEntry(article, clientItemId, contributions) };
}

/** The add entry for contributions on one article's item (`add_shopping_contributions`). */
function addEntry(
  article: Article,
  clientItemId: Id,
  contributions: readonly ShoppingContribution[],
): AddEntry {
  return {
    client_item_id: clientItemId,
    client_article_id: article.id,
    article_name: article.name,
    name_key: normalizeText(article.name),
    contributions: contributions.map((contribution) => ({
      id: contribution.id,
      source: plain(contribution.source),
      count: contribution.count ?? null,
      qty: contribution.qty ?? null,
      unit: contribution.unit ?? null,
      note: contribution.note ?? null,
    })),
  };
}

/**
 * The `apply_changes` domain operation that makes the server's list follow plan entries (spec
 * 0021, REQ-007, REQ-015): their contributions on open items go and `additions` (what core's
 * recomputeEntryContributions added locally) come, one call however many there are.
 */
function entryListOp(entryIds: readonly Id[], additions: readonly EntryAddition[]): ChangeOp {
  const articles = getData().articles;
  return {
    kind: 'replace_entry_contributions',
    entry_ids: [...entryIds],
    entries: additions.flatMap((addition) => {
      const article = articles.find((candidate) => candidate.id === addition.articleId);
      return article ? [addEntry(article, addition.itemId, addition.contributions)] : [];
    }),
  };
}

export const contributionIds = (entries: readonly AddEntry[]) =>
  entries.flatMap((entry) => entry.contributions.map((contribution) => contribution.id));

/**
 * The `apply_changes` domain operation for list additions made inside a larger command: one op,
 * the entries land on the shopping list of the call's household. None without entries.
 */
export function addContributionOps(entries: readonly AddEntry[]): ChangeOp[] {
  return entries.length > 0 ? [{ kind: 'add_contributions', entries: [...entries] }] : [];
}

export function typedContribution(
  text: string,
): { name: string; contribution: ShoppingContribution } | null {
  const typed = parseSmartInput(text);
  if (!typed) return null;
  // "2 Mozzarella (Fior di Latte)" is that article when it exists (spec 0025, AC-034).
  const parsed = withExactArticleName(typed, getData().articles);
  return {
    name: parsed.name,
    contribution: {
      id: newId(),
      source: { kind: 'manual' },
      // No number typed means one: a second "Milch" then adds up to 2×.
      count: parsed.qty === undefined ? (parsed.count ?? 1) : undefined,
      qty: parsed.qty,
      unit: parsed.unit,
      note: parsed.note,
    },
  };
}

/** The local part of adding typed text: resolves the article and appends (inside a command). */
export function addTextLocally(text: string): { added: AddedItem; entry: AddEntry } | null {
  const typed = typedContribution(text);
  if (!typed) return null;
  const { article, created } = resolveArticle(typed.name);
  const { itemId, entry } = addLocally(article, [typed.contribution]);
  return { added: { itemId, articleName: article.name, createdArticle: created }, entry };
}

/** What commitEntriesWithList sends, and what its undo sends. */
interface EntryListChange<T> {
  value: T;
  ops: ChangeOp[];
  undoRows: RowOp[];
  undoList: ChangeOp;
}

/** The contributions of these entries on open items, as add entries on their items (undo). */
function entryContributionsOf(items: readonly ShoppingItem[], entryIds: readonly Id[]) {
  return items.flatMap((item): EntryAddition[] => {
    if (item.checked) return [];
    const contributions = item.contributions.filter(
      (c) =>
        c.source.kind === 'recipe' &&
        c.source.entryId !== undefined &&
        entryIds.includes(c.source.entryId),
    );
    return contributions.length > 0
      ? [{ articleId: item.articleId, itemId: item.id, contributions }]
      : [];
  });
}

/**
 * Plan entries and the shopping list in one `apply_changes` call (spec 0021, REQ-007, REQ-015;
 * ADR-0011, all or nothing): `changeEntries` changes the entries' rows (sent as the diff path
 * would, deletes declared in `maxDeletes`), then the list becomes `list.items`, on the server
 * through one `replace_entry_contributions` for `entryIds` — however many contributions that is.
 * Undo puts the rows back (without reminders that have passed, spec 0017) and the entries' old
 * contributions with them. With `confirmed` it resolves once the server took it.
 */
export function commitEntriesWithList<T>(
  options: {
    entryIds: readonly Id[];
    maxDeletes?: Partial<Record<string, number>>;
    rejectedMessage?: (error: unknown) => string | undefined;
  },
  changeEntries: () => T,
  list: (data: HouseholdData) => { items: ShoppingItem[]; additions: EntryAddition[] },
): { value: T; confirmed: Promise<unknown> } {
  const spec: CommitSpec<EntryListChange<T>> = {
    path: 'rpc',
    send: (transport, context) => transport.applyChanges(context.householdId, context.result.ops),
    inverse: (transport, context) => {
      const timeZone = getData().household.timeZone;
      return transport.applyChanges(context.householdId, [
        ...withoutPassedReminders(sendable(context.result.undoRows), new Date(), timeZone),
        context.result.undoList,
      ]);
    },
    rejectedMessage: options.rejectedMessage,
  };
  const run = (): EntryListChange<T> => {
    const before = getData();
    const value = changeEntries();
    const rows = getData();
    const { send, sendInverse } = diffHousehold(before, rows, {
      mode: 'send',
      maxDeletes: options.maxDeletes,
    });
    const next = list(rows);
    updateData((data) => ({ ...data, items: next.items }));
    return {
      value,
      ops: [...sendable(send), entryListOp(options.entryIds, next.additions)],
      undoRows: sendInverse,
      undoList: entryListOp(options.entryIds, entryContributionsOf(before.items, options.entryIds)),
    };
  };
  // commitConfirmed is async: what it throws before sending (offline, a failing command) is
  // thrown here again, like commit does.
  let ran: { value: T } | undefined;
  let failure: unknown = new OfflineError();
  const confirmed = commitConfirmed(spec, () => {
    try {
      const result = run();
      ran = { value: result.value };
      return result;
    } catch (error) {
      failure = error;
      throw error;
    }
  });
  // A caller that does not wait may ignore it; a refusal is reported through onWriteRejected.
  confirmed.catch(() => {});
  if (!ran) throw failure;
  return { value: ran.value, confirmed };
}
