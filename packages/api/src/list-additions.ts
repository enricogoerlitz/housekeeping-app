// Putting contributions on a list (ADR-0011): the local effect, done inside a command, and the
// add entries that make the server do the same (`add_shopping_contributions`, merged there). Used
// by the shopping commands and the assistant; not part of the app's interface.
import {
  addContribution,
  normalizeText,
  parseSmartInput,
  type Article,
  type Id,
  type ShoppingContribution,
} from '@housekeeping/core';

import { resolveArticle } from './commands-household';
import { getState, newId, nowISO, updateData } from './store';
import type { AddEntry, ChangeOp } from './transport';

export function appendContribution(
  listId: Id,
  articleId: Id,
  contribution: ShoppingContribution,
  itemId: Id = newId('item'),
): Id {
  let resultId = itemId;
  updateData((data) => {
    const items = addContribution(data.items, listId, articleId, contribution, itemId, nowISO());
    const target = items.find(
      (item) => item.listId === listId && item.articleId === articleId && !item.checked,
    );
    if (target) resultId = target.id;
    const offline = getState().offline;
    return {
      ...data,
      items: offline
        ? items.map((item) => (item.id === resultId ? { ...item, pendingSync: true } : item))
        : items,
    };
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
 * Puts contributions for one article on a list locally and returns the add entry that does the
 * same on the server (`add_shopping_contributions`), which merges into the open item there.
 * Runs inside a command. The local item id is the open item's, or `clientItemId` for a new one.
 */
export function addLocally(
  listId: Id,
  article: Article,
  contributions: ShoppingContribution[],
): { itemId: Id; entry: AddEntry } {
  const clientItemId = newId('item');
  let itemId = clientItemId;
  for (const contribution of contributions) {
    itemId = appendContribution(listId, article.id, contribution, clientItemId);
  }
  return {
    itemId,
    entry: {
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
    },
  };
}

export const contributionIds = (entries: readonly AddEntry[]) =>
  entries.flatMap((entry) => entry.contributions.map((contribution) => contribution.id));

/** The `apply_changes` domain operations for list additions made inside a larger command. */
export function addContributionOps(additions: { listId: Id; entry: AddEntry }[]): ChangeOp[] {
  const byList = new Map<Id, AddEntry[]>();
  for (const { listId, entry } of additions) {
    byList.set(listId, [...(byList.get(listId) ?? []), entry]);
  }
  return [...byList].map(([listId, entries]) => ({
    kind: 'add_contributions',
    list_id: listId,
    entries,
  }));
}

export function typedContribution(
  text: string,
): { name: string; contribution: ShoppingContribution } | null {
  const parsed = parseSmartInput(text);
  if (!parsed) return null;
  return {
    name: parsed.name,
    contribution: {
      id: newId('contrib'),
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
export function addTextLocally(
  listId: Id,
  text: string,
): { added: AddedItem; entry: AddEntry } | null {
  const typed = typedContribution(text);
  if (!typed) return null;
  const { article, created } = resolveArticle(typed.name);
  const { itemId, entry } = addLocally(listId, article, [typed.contribution]);
  return { added: { itemId, articleName: article.name, createdArticle: created }, entry };
}
