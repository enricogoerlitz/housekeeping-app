import {
  adjustItemCount as countAdjustment,
  applyContributionChanges,
  contributionsFromEntry,
  findArticleByName,
  normalizeText,
  parseSmartInput,
  recipeSource,
  summarizeItem,
  weekdayShort,
  type Id,
  type MealPlanEntry,
  type PlanEntryVariant,
  type PlannedContribution,
  type ShoppingContribution,
  type ShoppingItem,
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
  isOffline,
  newId,
  queueStoreAction,
  rememberShoppingStore,
  updateData,
  type CommitSpec,
} from './store';
import { AdjustResultSchema, ClearedItemsSchema, type AddEntry } from './transport';

export type { AddedItem } from './list-additions';

// ---------- Contributions on the list (server merge, ADR-0011) ----------

/**
 * A command that puts things on the household's shopping list (ADR-0012: the household's items):
 * shown at once, sent as one `add_shopping_contributions` call (one transaction); undo removes
 * exactly these contributions again.
 */
function putOnList<T>(run: () => { result: T; entries: AddEntry[] }): T {
  return commit(
    {
      path: 'rpc',
      send: (transport, context) =>
        transport.addShoppingContributions(context.householdId, context.result.entries),
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
function queueAdd(name: string, contribution: ShoppingContribution): AddedItem {
  const data = getData();
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const existing = findArticleByName(trimmed, data.articles);
  const articleName = existing?.name ?? trimmed;
  const clientItemId = newId();
  const onList = existing ? data.items.filter((item) => item.articleId === existing.id) : [];
  const itemId =
    onList.find((item) => !item.checked)?.id ??
    onList.find((item) => item.checked)?.id ??
    clientItemId;
  queueStoreAction({
    kind: 'add',
    householdId: getState().activeHouseholdId,
    clientItemId,
    clientArticleId: existing?.id ?? newId(),
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
  });
  return { itemId, articleName, createdArticle: !existing };
}

/**
 * Adds what was typed into the list: "2 Käse (Gouda oder Emmentaler)", "500 g Möhren", "Milch".
 * An article that is already open on the list gets the amount added instead of a second row.
 * Returns null for empty input. Works offline too (store queue).
 */
export function addShoppingItemFromText(text: string): AddedItem | null {
  if (isOffline()) {
    const typed = typedContribution(text);
    return typed ? queueAdd(typed.name, typed.contribution) : null;
  }
  if (!parseSmartInput(text)) return null;
  return putOnList(() => {
    const local = addTextLocally(text);
    if (!local) throw new Error('Nothing to add');
    return { result: local.added, entries: [local.entry] };
  });
}

/** Checking works offline too (store queue); such changes are marked until the next sync. */
export function setItemChecked(itemId: Id, checked: boolean): void {
  queueStoreAction({ kind: 'check', itemId, checked });
}

/** "Nicht da": the item stays open and moves to "Woanders kaufen". A store action. */
export function setItemNotAvailable(itemId: Id, notAvailable: boolean): void {
  queueStoreAction({ kind: 'notAvailable', itemId, value: notAvailable });
}

/** Removes an item with all its contributions; undo with `snapshot()` (AC-025). Online only. */
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

/** Undo of a clearing RPC: puts back exactly what the server removed (restore_cleared_items). */
const restoreCleared: Extract<CommitSpec<unknown>, { path: 'rpc' }>['inverse'] = async (
  transport,
  context,
  response,
) => {
  const cleared = ClearedItemsSchema.safeParse(response);
  return cleared.success && cleared.data.length > 0
    ? transport.restoreClearedItems(context.householdId, cleared.data)
    : 0;
};

/** Removes the items matching `cleared` from the list with its own RPC; returns how many. */
function clearItems(
  cleared: (item: ShoppingItem) => boolean,
  send: Extract<CommitSpec<void>, { path: 'rpc' }>['send'],
): number {
  const count = getData().items.filter(cleared).length;
  if (count === 0) return 0;
  commit({ path: 'rpc', send, inverse: restoreCleared }, () =>
    updateData((data) => ({ ...data, items: data.items.filter((item) => !cleared(item)) })),
  );
  return count;
}

/**
 * Removes the checked items ("Erledigt leeren"): its own RPC, as it deletes by a condition the
 * server checks. Undo with `snapshot()` puts back exactly what the server removed. Online only.
 */
export function clearCheckedItems(): number {
  return clearItems(
    (item) => item.checked,
    (transport, context) => transport.clearCheckedItems(context.householdId),
  );
}

/**
 * "Liste leeren …" (AC-035): every item, open and checked, also those from the calendar. Undo
 * with `snapshot()`: the items come back with their contributions and join items of the same
 * article that were added meanwhile (AC-037). Online only.
 */
export function clearShoppingList(): number {
  return clearItems(
    () => true,
    (transport, context) => transport.clearShoppingList(context.householdId),
  );
}

// ---------- + and −, Zusatz ----------

export interface CountChange {
  /** The item's count afterwards (0 when removed). */
  count: number;
  /** − on 1× removed the item: offer "Rückgängig" (AC-015). */
  removed: boolean;
}

/**
 * One tap on + or − on "Liste" (REQ-003), one `adjust_item_count` call: + raises the share "von
 * Hand", − lowers it first, then the most recent other contribution; − on 1× removes the item,
 * and `snapshot()` taken before brings it back. Null when the step is not possible (an item with
 * quantities, 99× reached, unknown item). Online only.
 */
export function adjustItemCount(itemId: Id, delta: 1 | -1): CountChange | null {
  const item = getData().items.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  const step = countAdjustment(item, delta, newId());
  if (!step) return null;
  const removed = step.removesItem;
  return commit<CountChange>(
    {
      path: 'rpc',
      send: (transport) => transport.adjustItemCount(itemId, delta),
      // Only a removal is undone; a + that someone else's tap turned into no removal is not.
      ...(removed
        ? {
            inverse: async (transport, context, response) => {
              const answer = AdjustResultSchema.safeParse(response);
              return answer.success && answer.data?.removed
                ? transport.restoreClearedItems(context.householdId, [
                    { item: answer.data.item, contributions: answer.data.contributions },
                  ])
                : 0;
            },
          }
        : {}),
    },
    () => {
      updateData((data) => ({
        ...data,
        items: removed
          ? data.items.filter((candidate) => candidate.id !== itemId)
          : data.items.map((candidate) =>
              candidate.id === itemId
                ? applyContributionChanges(candidate, step.changes)
                : candidate,
            ),
      }));
      return { count: step.count, removed };
    },
  );
}

/** shopping_contributions_note_length in the database (AC-022). */
export const ITEM_NOTE_MAX_LENGTH = 200;

/**
 * The Zusatz of a whole item (AC-021): set on every contribution, null or blank clears it. One
 * `apply_changes` call; the last change wins. Online only.
 */
export function setItemNote(itemId: Id, note: string | null): void {
  const value = note?.trim() || undefined;
  if (value !== undefined && value.length > ITEM_NOTE_MAX_LENGTH) {
    throw new Error(`Höchstens ${ITEM_NOTE_MAX_LENGTH} Zeichen`);
  }
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      items: data.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              contributions: item.contributions.map((contribution) => ({
                ...contribution,
                note: value,
              })),
            }
          : item,
      ),
    })),
  );
}

// ---------- Store in "Einkaufen" ----------

/**
 * The store chosen in "Wo kaufst du ein?" (AC-041); null = "Ohne Markt – nach Bereichen". Kept
 * only on this device, per household, and cleared at sign-out (AC-042). Works offline.
 */
export function chooseShoppingStore(storeId: Id | null): void {
  rememberShoppingStore(storeId);
}

// ---------- From the meal plan or any recipe, with the pantry check ----------

export interface PantryCheckRow {
  /** Undefined for ingredients without an article; those cannot be put on the list. */
  articleId?: Id;
  name: string;
  /** "400 ml", "2×" … summed over all selected dishes. */
  amount: string;
  /** "Mango-Curry (Mi)" from the calendar, "Mango-Curry" for a recipe chosen directly. */
  sources: string[];
  /** "Vorrat" articles start unchecked. */
  isPantry: boolean;
  /** From a recipe chosen directly, `entryId` is empty: there is no plan entry. */
  contributions: PlannedContribution[];
}

/** A recipe put on the list without a plan entry (recipe page, "Rezept wählen …"; REQ-010). */
export interface PantryRecipe {
  recipeId: Id;
  portions: number;
  /** Portions per variant, like a plan entry; empty or missing = the default variant. */
  variants?: PlanEntryVariant[];
}

/** What a chosen recipe brings, with the title alone as Herkunft ("Mango-Curry", no day). */
function recipeContributions(
  chosen: PantryRecipe,
  data: ReturnType<typeof getData>,
): PlannedContribution[] {
  const recipe = indexById(data.recipes)[chosen.recipeId];
  if (!recipe) return [];
  const entry: MealPlanEntry = {
    id: '',
    date: null,
    slotId: '',
    kind: 'recipe',
    recipeId: recipe.id,
    eaterIds: [],
    guests: 0,
    portions: chosen.portions,
    variants: chosen.variants ?? [],
    sort: 0,
  };
  const { label } = recipeSource(recipe);
  return contributionsFromEntry(entry, recipe, indexById(data.articles), '').map(
    (contribution) => ({ ...contribution, label }),
  );
}

/**
 * One row per article for the pantry check, summed over the given plan entries and recipes
 * chosen directly (for the recipe page and, later, collections: specs 0008, 0009).
 */
export function pantryCheckRows(
  entryIds: Id[],
  recipes: readonly PantryRecipe[] = [],
): PantryCheckRow[] {
  const data = getData();
  const articlesById = indexById(data.articles);
  const recipesById = indexById(data.recipes);
  const planned: PlannedContribution[] = [];
  for (const entry of data.planEntries) {
    if (!entryIds.includes(entry.id) || entry.kind !== 'recipe' || !entry.recipeId) continue;
    const recipe = recipesById[entry.recipeId];
    if (!recipe) continue;
    const dayLabel = entry.date ? weekdayShort(entry.date) : 'vorgemerkt';
    planned.push(...contributionsFromEntry(entry, recipe, articlesById, dayLabel));
  }
  for (const chosen of recipes) planned.push(...recipeContributions(chosen, data));

  const rows = new Map<string, PantryCheckRow>();
  for (const contribution of planned) {
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
  return [...rows.values()].map((row) => ({
    ...row,
    amount: summarizeItem({
      id: 'preview',
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
    source: planned.entryId
      ? {
          kind: 'recipe',
          recipeId: planned.recipeId,
          entryId: planned.entryId,
          label: planned.label,
        }
      : { kind: 'recipe', recipeId: planned.recipeId, label: planned.label },
    count: planned.count,
    qty: planned.qty,
    unit: planned.unit,
    note: planned.note,
  };
}

/**
 * Puts the rows the user kept in the pantry check on the list. Returns the number of articles.
 * All rows are one transaction (AC-020). Online only.
 */
export function addPlannedToList(rows: PantryCheckRow[]): number {
  const articles = indexById(getData().articles);
  const kept = rows.filter((row) => row.articleId && articles[row.articleId]);
  if (kept.length === 0) return 0;
  return putOnList(() => ({
    result: kept.length,
    entries: kept.map((row) => {
      const article = articles[row.articleId ?? ''];
      if (!article) throw new Error(`Article ${row.articleId ?? ''} missing`);
      return addLocally(
        article,
        row.contributions.map((planned) => toContribution(planned, newId())),
      ).entry;
    }),
  }));
}

/** "Ist alle": puts one ingredient of a recipe on the list. */
export function addIngredientToList(recipeId: Id, ingredientId: Id): AddedItem | null {
  const data = getData();
  const recipe = data.recipes.find((candidate) => candidate.id === recipeId);
  const ingredient = recipe?.ingredients.find((candidate) => candidate.id === ingredientId);
  if (!recipe || !ingredient) return null;
  if (ingredient.articleId && !indexById(data.articles)[ingredient.articleId]) return null;
  return putOnList(() => {
    const { article, created } = ingredient.articleId
      ? { article: indexById(getData().articles)[ingredient.articleId], created: false }
      : resolveArticle(ingredient.name);
    if (!article) throw new Error(`Article ${ingredient.articleId ?? ''} missing`);
    const { itemId, entry } = addLocally(article, [
      {
        id: newId(),
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

/** Open and checked items of the list, in creation order. */
export function splitItems(items: ShoppingItem[]): { open: ShoppingItem[]; done: ShoppingItem[] } {
  return {
    open: items.filter((item) => !item.checked),
    done: items.filter((item) => item.checked),
  };
}

// ---------- Stores ----------

export function createStore(name: string): Id {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name fehlt');
  const data = getData();
  const store: Store = {
    id: newId(),
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
