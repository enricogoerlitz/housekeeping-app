import {
  addContribution,
  contributionsFromEntry,
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
import { indexById } from './queries';
import { getData, getState, newId, nowISO, updateData } from './store';

function appendContribution(listId: Id, articleId: Id, contribution: ShoppingContribution): Id {
  const itemId = newId('item');
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

/**
 * Adds what was typed into the list: "2 Käse (Gouda oder Emmentaler)", "500 g Möhren", "Milch".
 * An article that is already open on the list gets the amount added instead of a second row.
 * Returns null for empty input.
 */
export function addShoppingItemFromText(listId: Id, text: string): AddedItem | null {
  const parsed = parseSmartInput(text);
  if (!parsed) return null;
  const { article, created } = resolveArticle(parsed.name);
  const itemId = appendContribution(listId, article.id, {
    id: newId('contrib'),
    source: { kind: 'manual' },
    // No number typed means one: a second "Milch" then adds up to 2×.
    count: parsed.qty === undefined ? (parsed.count ?? 1) : undefined,
    qty: parsed.qty,
    unit: parsed.unit,
    note: parsed.note,
  });
  return { itemId, articleName: article.name, createdArticle: created };
}

/** Checking works offline too; such changes are marked until the next sync. */
export function setItemChecked(itemId: Id, checked: boolean): void {
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
}

/** "Nicht da": the item stays open and moves to "Woanders kaufen". */
export function setItemNotAvailable(itemId: Id, notAvailable: boolean): void {
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
}

export function removeShoppingItem(itemId: Id): void {
  updateData((data) => ({ ...data, items: data.items.filter((item) => item.id !== itemId) }));
}

/** Removes the checked items of a list ("Erledigt leeren"). */
export function clearCheckedItems(listId: Id): number {
  const before = getData().items.length;
  updateData((data) => ({
    ...data,
    items: data.items.filter((item) => !(item.listId === listId && item.checked)),
  }));
  return before - getData().items.length;
}

export function createShoppingList(name: string): Id {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name fehlt');
  const list: ShoppingList = { id: newId('list'), name: trimmed, isDefault: false };
  updateData((data) => ({ ...data, lists: [...data.lists, list] }));
  return list.id;
}

/** Chooses the store a list is sorted for; undefined = no store. */
export function setListStore(listId: Id, storeId: Id | undefined): void {
  updateData((data) => ({
    ...data,
    lists: data.lists.map((list) => (list.id === listId ? { ...list, storeId } : list)),
  }));
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

/** Puts the rows the user kept in the pantry check on the list. Returns the number of articles. */
export function addPlannedToList(listId: Id, rows: PantryCheckRow[]): number {
  let added = 0;
  for (const row of rows) {
    if (!row.articleId) continue;
    for (const planned of row.contributions) {
      appendContribution(listId, row.articleId, toContribution(planned, newId('contrib')));
    }
    added += 1;
  }
  return added;
}

/** "Ist alle": puts one ingredient of a recipe on the default list. */
export function addIngredientToList(recipeId: Id, ingredientId: Id): AddedItem | null {
  const data = getData();
  const recipe = data.recipes.find((candidate) => candidate.id === recipeId);
  const ingredient = recipe?.ingredients.find((candidate) => candidate.id === ingredientId);
  if (!recipe || !ingredient) return null;
  const { article, created } = ingredient.articleId
    ? { article: indexById(data.articles)[ingredient.articleId], created: false }
    : resolveArticle(ingredient.name);
  if (!article) return null;
  const itemId = appendContribution(data.household.defaultListId, article.id, {
    id: newId('contrib'),
    source: { kind: 'manual' },
    count: 1,
  });
  return { itemId, articleName: article.name, createdArticle: created };
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
  updateData((current) => ({ ...current, stores: [...current.stores, store] }));
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
  updateData((data) => ({
    ...data,
    stores: data.stores.map((store) => {
      if (store.id !== storeId) return store;
      const order = fullAreaOrder(store).filter((id) => id !== areaId);
      const index = Math.max(0, Math.min(order.length, toIndex));
      order.splice(index, 0, areaId);
      return { ...store, areaOrder: order };
    }),
  }));
}

export function setStoreAreaHidden(storeId: Id, areaId: Id, hidden: boolean): void {
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
  }));
}
