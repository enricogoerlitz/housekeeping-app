import {
  contributionsFromEntry,
  findArticleByName,
  normalizeText,
  parseSmartInput,
  summarizeItem,
  weekdayShort,
  type Id,
  type PlannedContribution,
  type ShoppingContribution,
  type ShoppingItem,
  type ShoppingList,
  type Store,
} from '@housekeeping/core';

import { resolveArticle } from './commands-household';
import {
  addLocally,
  addTextLocally,
  contributionIds,
  typedContribution,
  type AddedItem,
} from './list-additions';
import { indexById } from './queries';
import {
  commit,
  getData,
  getState,
  isBackendMode,
  isBackendOffline,
  newId,
  nowISO,
  updateData,
} from './store';
import { ClearedItemsSchema, type AddEntry } from './transport';

export type { AddedItem } from './list-additions';

// ---------- Contributions on a list (server merge, ADR-0011) ----------

/**
 * A command that puts things on one list: shown at once, sent as one `add_shopping_contributions`
 * call (one transaction); undo removes exactly these contributions again.
 */
function putOnList<T>(listId: Id, run: () => { result: T; entries: AddEntry[] }): T {
  return commit(
    {
      path: 'rpc',
      send: (transport, context) =>
        transport.addShoppingContributions(listId, context.result.entries),
      inverse: (transport, context) =>
        transport.removeContributions(contributionIds(context.result.entries)),
    },
    run,
  ).result;
}

/**
 * Offline in the store: adding is one of the four store actions (ADR-0008 addendum). The queue
 * shows it at once; the id returned is the item it lands on, a new one keeps the client id until
 * the server answered.
 */
function queueAdd(listId: Id, name: string, contribution: ShoppingContribution): AddedItem {
  const data = getData();
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const existing = findArticleByName(trimmed, data.articles);
  const articleName = existing?.name ?? trimmed;
  const clientItemId = newId('item');
  const onList = existing
    ? data.items.filter((item) => item.listId === listId && item.articleId === existing.id)
    : [];
  const itemId =
    onList.find((item) => !item.checked)?.id ??
    onList.find((item) => item.checked)?.id ??
    clientItemId;
  commit(
    {
      path: 'queue',
      action: {
        kind: 'add',
        listId,
        clientItemId,
        clientArticleId: existing?.id ?? newId('art'),
        contributions: [
          {
            clientContributionId: contribution.id,
            articleName,
            nameKey: normalizeText(articleName),
            count: contribution.count,
            qty: contribution.qty,
            unit: contribution.unit,
            note: contribution.note,
          },
        ],
      },
    },
    () => undefined,
  );
  return { itemId, articleName, createdArticle: !existing };
}

/**
 * Adds what was typed into the list: "2 Käse (Gouda oder Emmentaler)", "500 g Möhren", "Milch".
 * An article that is already open on the list gets the amount added instead of a second row.
 * Returns null for empty input. Works offline too (store queue).
 */
export function addShoppingItemFromText(listId: Id, text: string): AddedItem | null {
  if (isBackendMode() && isBackendOffline()) {
    const typed = typedContribution(text);
    return typed ? queueAdd(listId, typed.name, typed.contribution) : null;
  }
  if (!parseSmartInput(text)) return null;
  return putOnList(listId, () => {
    const local = addTextLocally(listId, text);
    if (!local) throw new Error('Nothing to add');
    return { result: local.added, entries: [local.entry] };
  });
}

/** Checking works offline too (store queue); such changes are marked until the next sync. */
export function setItemChecked(itemId: Id, checked: boolean): void {
  commit({ path: 'queue', action: { kind: 'check', itemId, checked } }, () => {
    const state = getState();
    updateData((data) => ({
      ...data,
      items: data.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              checked,
              checkedAt: checked ? nowISO() : undefined,
              checkedBy: checked ? state.currentMemberId : undefined,
              notAvailable: checked ? undefined : item.notAvailable,
              pendingSync: state.offline ? true : item.pendingSync,
            }
          : item,
      ),
    }));
  });
}

/** "Nicht da": the item stays open and moves to "Woanders kaufen". A store action. */
export function setItemNotAvailable(itemId: Id, notAvailable: boolean): void {
  commit({ path: 'queue', action: { kind: 'notAvailable', itemId, value: notAvailable } }, () => {
    const offline = getState().offline;
    updateData((data) => ({
      ...data,
      items: data.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              notAvailable: notAvailable || undefined,
              pendingSync: offline ? true : item.pendingSync,
            }
          : item,
      ),
    }));
  });
}

export function removeShoppingItem(itemId: Id): void {
  const item = getData().items.find((candidate) => candidate.id === itemId);
  if (!item) return;
  commit(
    {
      path: 'diff',
      maxDeletes: { shopping_items: 1, shopping_contributions: item.contributions.length },
    },
    () =>
      updateData((data) => ({
        ...data,
        items: data.items.filter((candidate) => candidate.id !== itemId),
      })),
  );
}

/**
 * Removes the checked items of a list ("Erledigt leeren"): its own RPC, as it deletes by a
 * condition the server checks. Undo puts back exactly what the server removed.
 */
export function clearCheckedItems(listId: Id): number {
  const count = getData().items.filter((item) => item.listId === listId && item.checked).length;
  if (count === 0) return 0;
  commit(
    {
      path: 'rpc',
      send: (transport) => transport.clearCheckedItems(listId),
      inverse: async (transport, _context, response) => {
        const cleared = ClearedItemsSchema.safeParse(response);
        return cleared.success && cleared.data.length > 0
          ? transport.restoreClearedItems(listId, cleared.data)
          : 0;
      },
    },
    () =>
      updateData((data) => ({
        ...data,
        items: data.items.filter((item) => !(item.listId === listId && item.checked)),
      })),
  );
  return count;
}

export function createShoppingList(name: string): Id {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name fehlt');
  const list: ShoppingList = { id: newId('list'), name: trimmed, isDefault: false };
  commit({ path: 'diff' }, () => updateData((data) => ({ ...data, lists: [...data.lists, list] })));
  return list.id;
}

/** Chooses the store a list is sorted for; undefined = no store. */
export function setListStore(listId: Id, storeId: Id | undefined): void {
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      lists: data.lists.map((list) => (list.id === listId ? { ...list, storeId } : list)),
    })),
  );
}

// ---------- From the meal plan, with the pantry check ----------

/** Ids of plan entries that already have a contribution on some list. */
export function entryIdsOnLists(): Set<Id> {
  const ids = new Set<Id>();
  for (const item of getData().items) {
    for (const contribution of item.contributions) {
      if (contribution.source.kind === 'recipe' && contribution.source.entryId)
        ids.add(contribution.source.entryId);
    }
  }
  return ids;
}

export interface PantryCheckRow {
  /** Undefined for ingredients without an article; those cannot be put on the list. */
  articleId?: Id;
  name: string;
  /** "400 ml", "2×" … summed over all selected dishes. */
  amount: string;
  /** "Mango-Curry (Mi)". */
  sources: string[];
  /** "Vorrat" articles start unchecked. */
  isPantry: boolean;
  contributions: PlannedContribution[];
}

/** One row per article for the pantry check, summed over the given plan entries. */
export function pantryCheckRows(entryIds: Id[]): PantryCheckRow[] {
  const data = getData();
  const articlesById = indexById(data.articles);
  const recipesById = indexById(data.recipes);
  const rows = new Map<string, PantryCheckRow>();
  for (const entry of data.planEntries) {
    if (!entryIds.includes(entry.id) || entry.kind !== 'recipe' || !entry.recipeId) continue;
    const recipe = recipesById[entry.recipeId];
    if (!recipe) continue;
    const dayLabel = entry.date ? weekdayShort(entry.date) : 'vorgemerkt';
    for (const contribution of contributionsFromEntry(entry, recipe, articlesById, dayLabel)) {
      const key = contribution.articleId ?? `text:${contribution.name}`;
      const row = rows.get(key) ?? {
        articleId: contribution.articleId,
        name: contribution.articleId
          ? (articlesById[contribution.articleId]?.name ?? contribution.name)
          : contribution.name,
        amount: '',
        sources: [],
        isPantry: contribution.isPantry,
        contributions: [],
      };
      row.contributions.push(contribution);
      if (!row.sources.includes(contribution.label)) row.sources.push(contribution.label);
      rows.set(key, row);
    }
  }
  return [...rows.values()].map((row) => ({
    ...row,
    amount: summarizeItem({
      id: 'preview',
      listId: 'preview',
      articleId: row.articleId ?? 'preview',
      contributions: row.contributions.map((contribution, index) =>
        toContribution(contribution, `preview-${index}`),
      ),
      checked: false,
      createdAt: '',
    }).amount,
  }));
}

function toContribution(planned: PlannedContribution, id: Id): ShoppingContribution {
  return {
    id,
    source: {
      kind: 'recipe',
      recipeId: planned.recipeId,
      entryId: planned.entryId,
      label: planned.label,
    },
    count: planned.count,
    qty: planned.qty,
    unit: planned.unit,
    note: planned.note,
  };
}

/**
 * Puts the rows the user kept in the pantry check on the list. Returns the number of articles.
 * All rows are one transaction (AC-020).
 */
export function addPlannedToList(listId: Id, rows: PantryCheckRow[]): number {
  const articles = indexById(getData().articles);
  const kept = rows.filter((row) => row.articleId && articles[row.articleId]);
  if (kept.length === 0) return 0;
  return putOnList(listId, () => ({
    result: kept.length,
    entries: kept.map((row) => {
      const article = articles[row.articleId ?? ''];
      if (!article) throw new Error(`Article ${row.articleId ?? ''} missing`);
      return addLocally(
        listId,
        article,
        row.contributions.map((planned) => toContribution(planned, newId('contrib'))),
      ).entry;
    }),
  }));
}

/** "Ist alle": puts one ingredient of a recipe on the default list. */
export function addIngredientToList(recipeId: Id, ingredientId: Id): AddedItem | null {
  const data = getData();
  const recipe = data.recipes.find((candidate) => candidate.id === recipeId);
  const ingredient = recipe?.ingredients.find((candidate) => candidate.id === ingredientId);
  if (!recipe || !ingredient) return null;
  if (ingredient.articleId && !indexById(data.articles)[ingredient.articleId]) return null;
  const listId = data.household.defaultListId;
  return putOnList(listId, () => {
    const { article, created } = ingredient.articleId
      ? { article: indexById(getData().articles)[ingredient.articleId], created: false }
      : resolveArticle(ingredient.name);
    if (!article) throw new Error(`Article ${ingredient.articleId ?? ''} missing`);
    const { itemId, entry } = addLocally(listId, article, [
      {
        id: newId('contrib'),
        source: { kind: 'manual' },
        count: 1,
        ...(ingredient.shoppingNote ? { note: ingredient.shoppingNote } : {}),
      },
    ]);
    return {
      result: { itemId, articleName: article.name, createdArticle: created },
      entries: [entry],
    };
  });
}

/** Open and checked items of one list, in creation order. */
export function splitItems(
  items: ShoppingItem[],
  listId: Id,
): { open: ShoppingItem[]; done: ShoppingItem[] } {
  const own = items.filter((item) => item.listId === listId);
  return { open: own.filter((item) => !item.checked), done: own.filter((item) => item.checked) };
}

// ---------- Stores ----------

export function createStore(name: string): Id {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name fehlt');
  const data = getData();
  const store: Store = {
    id: newId('store'),
    name: trimmed,
    areaOrder: [...data.areas].sort((a, b) => a.sort - b.sort).map((area) => area.id),
    hiddenAreaIds: [],
  };
  commit({ path: 'diff' }, () =>
    updateData((current) => ({ ...current, stores: [...current.stores, store] })),
  );
  return store.id;
}

/** The complete walking order of a store: its own order, then the remaining areas. */
export function fullAreaOrder(store: Store): Id[] {
  const rest = [...getData().areas]
    .sort((a, b) => a.sort - b.sort)
    .map((area) => area.id)
    .filter((id) => !store.areaOrder.includes(id));
  return [...store.areaOrder, ...rest];
}

/** Moves an area to a new position in the store's walking order. */
export function moveStoreArea(storeId: Id, areaId: Id, toIndex: number): void {
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      stores: data.stores.map((store) => {
        if (store.id !== storeId) return store;
        const order = fullAreaOrder(store).filter((id) => id !== areaId);
        const index = Math.max(0, Math.min(order.length, toIndex));
        order.splice(index, 0, areaId);
        return { ...store, areaOrder: order };
      }),
    })),
  );
}

export function setStoreAreaHidden(storeId: Id, areaId: Id, hidden: boolean): void {
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      stores: data.stores.map((store) =>
        store.id === storeId
          ? {
              ...store,
              hiddenAreaIds: hidden
                ? [...new Set([...store.hiddenAreaIds, areaId])]
                : store.hiddenAreaIds.filter((id) => id !== areaId),
            }
          : store,
      ),
    })),
  );
}
