import {
  adjustItemCount as countAdjustment,
  AMOUNT_NOT_RECOGNIZED,
  applyContributionChanges,
  itemCount,
  collectionContributions,
  contentsInBook,
  contributionsFromEntry,
  findArticleByName,
  normalizeText,
  parseItemAmount,
  parseSmartInput,
  recipeSource,
  summarizeItem,
  weekdayShort,
  type Article,
  type Id,
  type ItemAmount,
  type MealPlanEntry,
  type PlanEntryVariant,
  type PlannedContribution,
  type Recipe,
  type RecipeBook,
  type ShoppingContribution,
  type ShoppingItem,
} from '@housekeeping/core';

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
import {
  AdjustResultSchema,
  ClearedItemsSchema,
  ManualAmountResultSchema,
  TransportError,
  type AddEntry,
} from './transport';

export type { AddedItem } from './list-additions';

// ---------- Contributions on the list (server merge, ADR-0011) ----------

/**
 * The hint when the article was deleted on another device while this addition was on its way
 * (delete_article and add_shopping_contributions racing: the item's foreign key fails, 23503).
 * Not retried; typing the name again creates the article anew.
 */
export const ARTICLE_GONE_MESSAGE = 'Den Artikel gibt es nicht mehr – bitte noch einmal hinzufügen';

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
      rejectedMessage: (error) =>
        error instanceof TransportError && error.code === '23503'
          ? ARTICLE_GONE_MESSAGE
          : undefined,
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

/**
 * Checking works offline too (store queue); such changes are marked until the next sync. On
 * "Liste" (swipe right, "Als erledigt markieren") it is the same store action with `onList`, so it
 * shows no "kauft gerade ein" (spec 0025, REQ-006).
 */
export function setItemChecked(
  itemId: Id,
  checked: boolean,
  options: { onList?: boolean } = {},
): void {
  queueStoreAction({ kind: 'check', itemId, checked, onList: options.onList === true });
}

/** "Nicht da": the item stays open and moves to "Woanders kaufen". A store action. */
export function setItemNotAvailable(itemId: Id, notAvailable: boolean): void {
  queueStoreAction({ kind: 'notAvailable', itemId, value: notAvailable });
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

export interface ItemRemoval {
  /** The last contribution went, so the item is off the list ("Reibekäse entfernt"). */
  removed: boolean;
}

/**
 * ✕ at an origin in "Posten bearbeiten" (spec 0025, AC-010, AC-011): these contributions go, the
 * item with them when nothing is left. One remove_item_contributions call; `snapshot()` taken
 * before brings them back at their place (restore keeps created_at). Null when the item is gone.
 * Online only.
 */
export function removeItemOrigin(itemId: Id, contributionIds: readonly Id[]): ItemRemoval | null {
  const item = getData().items.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  const ids = new Set(contributionIds);
  const kept = item.contributions.filter((contribution) => !ids.has(contribution.id));
  if (kept.length === item.contributions.length) return { removed: false };
  const removed = kept.length === 0;
  return commit(
    {
      path: 'rpc',
      send: (transport) => transport.removeItemContributions(itemId, [...ids]),
      inverse: restoreCleared,
    },
    () => {
      updateData((data) => ({
        ...data,
        items: removed
          ? data.items.filter((candidate) => candidate.id !== itemId)
          : data.items.map((candidate) =>
              candidate.id === itemId ? { ...candidate, contributions: kept } : candidate,
            ),
      }));
      return { removed };
    },
  );
}

/**
 * Removes an item with all its contributions (swipe left, "Entfernen"); undo with `snapshot()`
 * puts it back at its place (spec 0025, AC-020). Online only.
 */
export function removeShoppingItem(itemId: Id): void {
  const item = getData().items.find((candidate) => candidate.id === itemId);
  if (!item || item.contributions.length === 0) return;
  removeItemOrigin(
    itemId,
    item.contributions.map((contribution) => contribution.id),
  );
}

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
 * quantities, 99× reached, unknown item). Online only, except + (spec 0019, AC-030).
 */
export function adjustItemCount(itemId: Id, delta: 1 | -1): CountChange | null {
  const data = getData();
  const item = data.items.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  const step = countAdjustment(item, delta, newId());
  if (!step) return null;
  // Offline "+" is the store action "Posten hinzufügen" (spec 0019, Decision 10, AC-030): one
  // more of the article, by name, so a deleted item comes back as a new one (AC-031).
  if (delta === 1 && isOffline()) {
    const name = data.articles.find((article) => article.id === item.articleId)?.name;
    if (!name) return null;
    queueAdd(name, { id: newId(), source: { kind: 'manual' }, count: 1 });
    return { count: step.count, removed: false };
  }
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

/**
 * "Von Hand" in "Posten bearbeiten" (spec 0025, REQ-003): "1 Kasten", "2", or empty for none
 * replaces every manual contribution of the item by one; origins from recipes stay. Throws
 * AMOUNT_NOT_RECOGNIZED for "viel". Without any contribution left the item is removed, and
 * `snapshot()` taken before brings it back. Null when the item is gone (AC-013). Online only.
 */
export function setManualAmount(itemId: Id, text: string): ItemRemoval | null {
  const amount = parseItemAmount(text);
  if (amount === undefined) throw new Error(AMOUNT_NOT_RECOGNIZED);
  const item = getData().items.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  const empty = amount.count === undefined && amount.qty === undefined;
  const manual = item.contributions.filter((contribution) => contribution.source.kind === 'manual');
  const first = manual[0];
  const others = item.contributions.filter((contribution) => contribution.source.kind !== 'manual');
  const replacement: ShoppingContribution[] = empty
    ? []
    : [
        {
          ...(first ?? { id: newId(), source: { kind: 'manual' } }),
          count: amount.count,
          qty: amount.qty,
          unit: amount.unit,
        },
      ];
  // The earliest manual contribution keeps its place among the origins, like the server.
  const contributions = first
    ? item.contributions.flatMap((contribution) =>
        contribution === first
          ? replacement
          : contribution.source.kind === 'manual'
            ? []
            : [contribution],
      )
    : [...others, ...replacement];
  const removed = contributions.length === 0;
  return commit(
    {
      path: 'rpc',
      send: (transport) => transport.setManualAmount(itemId, amount),
      inverse: async (transport, context, response) => {
        const answer = ManualAmountResultSchema.safeParse(response);
        return answer.success && answer.data?.removed
          ? transport.restoreClearedItems(context.householdId, [
              { item: answer.data.item, contributions: answer.data.contributions },
            ])
          : 0;
      },
    },
    () => {
      updateData((data) => ({
        ...data,
        items: removed
          ? data.items.filter((candidate) => candidate.id !== itemId)
          : data.items.map((candidate) =>
              candidate.id === itemId ? { ...candidate, contributions } : candidate,
            ),
      }));
      return { removed };
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
  articleId: Id;
  /** The article's name. */
  name: string;
  /** "400 ml", "2×" … summed over all selected dishes. */
  amount: string;
  /** "Mango-Curry (Mi)" from the calendar, "Mango-Curry" for a recipe chosen directly. */
  sources: string[];
  /** "Vorrat" articles start unchecked. */
  isPantry: boolean;
  /** The amount as a pure count ("2×"), for "− n× +"; undefined for quantities (spec 0025). */
  count?: number;
  /** "schon auf der Liste: 1×": the article's open item on the list (spec 0025, AC-027). */
  onList?: string;
  /** From a recipe chosen directly, `entryId` is empty: there is no plan entry. */
  contributions: PlannedContribution[];
}

/** The amount shown on a pantry-check row and, for pure counts, the count. */
function rowAmount(row: Pick<PantryCheckRow, 'articleId' | 'contributions'>): {
  amount: string;
  count?: number;
} {
  const preview: ShoppingItem = {
    id: 'preview',
    articleId: row.articleId,
    contributions: row.contributions.map((contribution, index) =>
      toContribution(contribution, `preview-${index}`),
    ),
    checked: false,
    createdAt: '',
  };
  const count = itemCount(preview);
  return { amount: summarizeItem(preview).amount, ...(count === undefined ? {} : { count }) };
}

/**
 * A changed amount on a pantry-check row (spec 0025, REQ-007, Decision 4): the first contribution
 * carries it, the others keep their origin without an amount, so "steht schon auf der Liste"
 * still knows every dish. Returns a new row.
 */
export function withPantryAmount(row: PantryCheckRow, amount: ItemAmount): PantryCheckRow {
  const contributions = row.contributions.map((contribution, index) => {
    const { count: _count, qty: _qty, unit: _unit, ...origin } = contribution;
    return index === 0 ? { ...origin, ...amount } : origin;
  });
  const { count: _old, ...rest } = row;
  return { ...rest, contributions, ...rowAmount({ articleId: row.articleId, contributions }) };
}

/**
 * A recipe put on the list without a plan entry (recipe page, "Rezept wählen …"; REQ-010). For a
 * collection (spec 0009) `portions` are those of the collection from its page, and `variants` do
 * not apply: each contained recipe uses the variant chosen in the collection.
 */
export interface PantryRecipe {
  recipeId: Id;
  portions: number;
  /** Portions per variant, like a plan entry; empty or missing = the default variant. */
  variants?: PlanEntryVariant[];
}

/**
 * What a collection brings for these portions (core collectionContributions, spec 0009, E6): own
 * ingredients with Herkunft "Grillabend", contained ones "Grillabend · Kartoffelsalat", from a
 * plan entry with the day "(Sa)".
 */
function collectionPlanned(
  collection: Recipe,
  book: RecipeBook,
  articlesById: Record<Id, Article>,
  portions: number,
  entry?: MealPlanEntry,
): PlannedContribution[] {
  return collectionContributions(collection, contentsInBook(collection, book), articlesById, {
    portions,
    ...(entry ? { entry } : {}),
  });
}

/** What a chosen recipe brings, with the title alone as Herkunft ("Mango-Curry", no day). */
function recipeContributions(
  chosen: PantryRecipe,
  data: ReturnType<typeof getData>,
  book: RecipeBook,
): PlannedContribution[] {
  const recipe = book.recipesById[chosen.recipeId];
  if (!recipe) return [];
  const articlesById = indexById(data.articles);
  if (recipe.kind === 'collection') {
    return collectionPlanned(recipe, book, articlesById, chosen.portions);
  }
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
  return contributionsFromEntry(entry, recipe, articlesById, '').map((contribution) => ({
    ...contribution,
    label,
  }));
}

/**
 * One row per article for the pantry check, summed over the given plan entries and recipes
 * chosen directly (for the recipe page and collections: specs 0008, 0009). A collection brings
 * its own ingredients and those of its recipes, scaled to the planned portions (AC-014, AC-025).
 */
export function pantryCheckRows(
  entryIds: Id[],
  recipes: readonly PantryRecipe[] = [],
): PantryCheckRow[] {
  const data = getData();
  const articlesById = indexById(data.articles);
  const book: RecipeBook = {
    recipesById: indexById(data.recipes),
    collectionRecipes: data.collectionRecipes,
  };
  const planned: PlannedContribution[] = [];
  for (const entry of data.planEntries) {
    if (!entryIds.includes(entry.id) || entry.kind !== 'recipe' || !entry.recipeId) continue;
    const recipe = book.recipesById[entry.recipeId];
    if (!recipe) continue;
    if (recipe.kind === 'collection') {
      planned.push(...collectionPlanned(recipe, book, articlesById, entry.portions, entry));
      continue;
    }
    const dayLabel = entry.date ? weekdayShort(entry.date) : 'vorgemerkt';
    planned.push(...contributionsFromEntry(entry, recipe, articlesById, dayLabel));
  }
  for (const chosen of recipes) planned.push(...recipeContributions(chosen, data, book));

  const rows = new Map<Id, PantryCheckRow>();
  for (const contribution of planned) {
    // An article deleted on another device before this one synced has nothing to put on the list.
    const article = articlesById[contribution.articleId];
    if (!article) continue;
    const row = rows.get(article.id) ?? {
      articleId: article.id,
      name: article.name,
      amount: '',
      sources: [],
      isPantry: contribution.isPantry,
      contributions: [],
    };
    row.contributions.push(contribution);
    if (!row.sources.includes(contribution.label)) row.sources.push(contribution.label);
    rows.set(article.id, row);
  }
  const openByArticle = new Map(
    data.items.filter((item) => !item.checked).map((item) => [item.articleId, item]),
  );
  return [...rows.values()].map((row) => {
    const open = openByArticle.get(row.articleId);
    const onList = open ? summarizeItem(open).amount : undefined;
    return { ...row, ...rowAmount(row), ...(onList ? { onList } : {}) };
  });
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
  const kept = rows.filter((row) => articles[row.articleId]);
  if (kept.length === 0) return 0;
  return putOnList(() => ({
    result: kept.length,
    entries: kept.map((row) => {
      const article = articles[row.articleId];
      if (!article) throw new Error(`Article ${row.articleId} missing`);
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
  const article = ingredient && indexById(data.articles)[ingredient.articleId];
  if (!recipe || !ingredient || !article) return null;
  return putOnList(() => {
    const { itemId, entry } = addLocally(article, [
      {
        id: newId(),
        source: { kind: 'manual' },
        count: 1,
        ...(ingredient.shoppingNote ? { note: ingredient.shoppingNote } : {}),
      },
    ]);
    return {
      result: { itemId, articleName: article.name, createdArticle: false },
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
