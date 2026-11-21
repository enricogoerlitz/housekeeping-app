import { COLLECTION_LIMITS, type CollectionContent } from './collections';
import { RECIPE_LIMITS } from './recipe-editor';
import { recipeCountLabel } from './recipe-list';
import { searchRecipes } from './recipes';
import type { Article, CollectionRecipe, Id, Recipe, RecipeKind } from './types';

// Editing a collection (spec 0009): the window "Neu", the draft of "Enthält" and the windows
// "Rezepte zu …" and "Zu Sammlung hinzufügen". Own ingredients, head and notes are edited like a
// recipe's sections (recipe-editor.ts).

/** "Höchstens 50 Rezepte je Sammlung" (E15). */
export const COLLECTION_FULL = `Höchstens ${COLLECTION_LIMITS.recipes} Rezepte je Sammlung`;

// ---------- Window "Neu" ----------

/** The choice chips of the window "Neu" (AC-001, AC-002). */
export const NEW_ENTRY_KINDS: readonly { value: RecipeKind; label: string }[] = [
  { value: 'recipe', label: 'Rezept' },
  { value: 'collection', label: 'Sammlung' },
];

/** "Zutaten einfügen" is offered for a recipe only (E16). */
export function newEntryTakesIngredients(kind: RecipeKind): boolean {
  return kind === 'recipe';
}

/** What keeps "Anlegen" from creating: "Titel fehlt" (AC-003), "Höchstens 200 Zeichen". */
export function newEntryTitleProblem(title: string): string | undefined {
  const trimmed = title.trim();
  if (trimmed === '') return 'Titel fehlt';
  if (Array.from(trimmed).length > RECIPE_LIMITS.title) {
    return `Höchstens ${RECIPE_LIMITS.title} Zeichen`;
  }
  return undefined;
}

/**
 * A new, empty recipe of the given kind with the title trimmed. A recipe starts as "Hauptgericht";
 * a collection has no course nor any other field a collection does not have (E3).
 */
export function newRecipe(input: {
  id: Id;
  kind: RecipeKind;
  title: string;
  servings: number;
  createdAt: string;
  source?: string;
}): Recipe {
  const recipe: Recipe = {
    id: input.id,
    kind: input.kind,
    title: input.title.trim(),
    servings: input.servings,
    tags: [],
    variants: [],
    ingredients: [],
    steps: [],
    favoriteOf: [],
    ratings: {},
    cookedCount: 0,
    createdAt: input.createdAt,
  };
  if (input.kind === 'recipe') recipe.course = 'main';
  if (input.source !== undefined) recipe.source = input.source;
  return recipe;
}

// ---------- "Enthält" ----------

/** One row of "Enthält" while it is edited. */
export interface ContentsRow {
  /** The CollectionRecipe row. */
  id: Id;
  recipeId: Id;
  /** Portions as typed; blank = "übernimmt" the portions of the collection. */
  servings: string;
  /** Undefined = the recipe's default variant. */
  variantId?: Id;
}

export interface ContentsDraft {
  collectionId: Id;
  rows: ContentsRow[];
  /** The rows when the section was opened: only what changed since then is sent. */
  base: CollectionRecipe[];
}

/**
 * The draft of "Enthält" as stored, in its order. A chosen variant the recipe no longer has is
 * shown as the default and saved as such (Offene Frage 4 A).
 */
export function contentsDraft(
  collection: Pick<Recipe, 'id'>,
  contents: readonly CollectionContent[],
): ContentsDraft {
  return {
    collectionId: collection.id,
    rows: contents.map(({ row, recipe }) => {
      const draftRow: ContentsRow = {
        id: row.id,
        recipeId: row.recipeId,
        servings: row.servings === undefined ? '' : String(row.servings),
      };
      if (recipe.variants.some((variant) => variant.id === row.variantId)) {
        draftRow.variantId = row.variantId;
      }
      return draftRow;
    }),
    base: contents.map((content) => content.row),
  };
}

function mapRow(
  draft: ContentsDraft,
  rowId: Id,
  change: (row: ContentsRow) => ContentsRow,
): ContentsDraft {
  return { ...draft, rows: draft.rows.map((row) => (row.id === rowId ? change(row) : row)) };
}

/** "Nach oben", "Nach unten" or dragging: the row moves to `toIndex` (clamped). */
export function moveContent(draft: ContentsDraft, rowId: Id, toIndex: number): ContentsDraft {
  const from = draft.rows.findIndex((row) => row.id === rowId);
  const moving = draft.rows[from];
  if (moving === undefined) return draft;
  const rest = draft.rows.filter((row) => row.id !== rowId);
  const index = Math.max(0, Math.min(toIndex, rest.length));
  return { ...draft, rows: [...rest.slice(0, index), moving, ...rest.slice(index)] };
}

/** Takes the recipe out of the collection; the recipe itself stays. */
export function removeContent(draft: ContentsDraft, rowId: Id): ContentsDraft {
  return { ...draft, rows: draft.rows.filter((row) => row.id !== rowId) };
}

/** Own portions as typed; blank = "übernimmt". */
export function setContentServings(
  draft: ContentsDraft,
  rowId: Id,
  servings: string,
): ContentsDraft {
  return mapRow(draft, rowId, (row) => ({ ...row, servings }));
}

/** The variant of the recipe in this collection; undefined = its default. */
export function setContentVariant(
  draft: ContentsDraft,
  rowId: Id,
  variantId: Id | undefined,
): ContentsDraft {
  return mapRow(draft, rowId, (row) => {
    const next = { ...row };
    if (variantId === undefined) delete next.variantId;
    else next.variantId = variantId;
    return next;
  });
}

export interface ContentsProblem {
  field: 'servings' | 'removed';
  /** The row for `servings`. */
  key?: Id;
  message: string;
}

function typedServings(text: string): number | undefined {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

function removedIds(draft: ContentsDraft): Id[] {
  const kept = new Set(draft.rows.map((row) => row.id));
  return draft.base.filter((row) => !kept.has(row.id)).map((row) => row.id);
}

/**
 * What keeps "Fertig" from saving: "1 bis 100 Portionen" per row (AC-017) and more than 20
 * recipes removed at once, the limit of one apply_changes (E15). [] = the draft can be saved.
 */
export function validateContentsDraft(draft: ContentsDraft): ContentsProblem[] {
  const problems: ContentsProblem[] = [];
  for (const row of draft.rows) {
    if (row.servings.trim() === '') continue;
    const servings = typedServings(row.servings);
    if (
      servings === undefined ||
      servings < RECIPE_LIMITS.servingsMin ||
      servings > RECIPE_LIMITS.servingsMax
    ) {
      problems.push({ field: 'servings', key: row.id, message: '1 bis 100 Portionen' });
    }
  }
  if (removedIds(draft).length > COLLECTION_LIMITS.removeAtOnce) {
    problems.push({
      field: 'removed',
      message: `Höchstens ${COLLECTION_LIMITS.removeAtOnce} Rezepte auf einmal entfernen`,
    });
  }
  return problems;
}

/**
 * What leaving the page or opening another pen saves of "Enthält" (spec 0008, E7): the draft when
 * it is valid; a row with invalid portions keeps its stored portions and the rest is saved; more
 * than 20 removed at once saves nothing (undefined).
 */
export function savableContents<T extends ContentsDraft>(draft: T): T | undefined {
  const problems = validateContentsDraft(draft);
  if (problems.length === 0) return draft;
  if (problems.some((problem) => problem.field === 'removed')) return undefined;
  const invalid = new Set(problems.map((problem) => problem.key));
  const stored = new Map(draft.base.map((row) => [row.id, row]));
  return {
    ...draft,
    rows: draft.rows.map((row) => {
      if (!invalid.has(row.id)) return row;
      const servings = stored.get(row.id)?.servings;
      return { ...row, servings: servings === undefined ? '' : String(servings) };
    }),
  };
}

/**
 * True when a row the draft still shows was removed meanwhile on another device (the sync brought
 * the tombstone before "Fertig"). Its changes would go nowhere, so the section says "Hat nicht
 * geklappt – bitte noch einmal versuchen" and opens again with the current rows (conflict table).
 * Rows the draft removes as well, and rows added meanwhile, do not count.
 */
export function contentsRowsGone(
  draft: ContentsDraft,
  current: readonly Pick<CollectionRecipe, 'id'>[],
): boolean {
  const ids = new Set(current.map((row) => row.id));
  return draft.rows.some((row) => !ids.has(row.id));
}

/** Columns of a row "Fertig" changes; a key holding undefined clears the column. */
export type CollectionRecipePatch = Partial<
  Pick<CollectionRecipe, 'servings' | 'variantId' | 'sort'>
>;

export type CollectionRecipeChange =
  { type: 'patch'; id: Id; values: CollectionRecipePatch } | { type: 'delete'; id: Id };

function bySortThenId(a: CollectionRecipe, b: CollectionRecipe): number {
  return a.sort - b.sort || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * The row operations "Fertig" sends as one apply_changes (E12): for each row only the columns
 * changed since the section was opened, then the removed rows. A new `sort` (the position) goes
 * out only when the order changed, and then only for the rows whose `sort` differs from their
 * position. Throws for a draft with problems: check it with validateContentsDraft first.
 */
export function contentsChanges(draft: ContentsDraft): CollectionRecipeChange[] {
  if (validateContentsDraft(draft).length > 0) throw new Error('„Enthält“ ist nicht gültig.');
  const stored = new Map(draft.base.map((row) => [row.id, row]));
  const kept = draft.rows.flatMap((row) => {
    const base = stored.get(row.id);
    return base === undefined ? [] : [{ row, base }];
  });
  const storedOrder = kept
    .map(({ base }) => base)
    .sort(bySortThenId)
    .map((row) => row.id);
  const reordered = kept.some(({ row }, index) => storedOrder[index] !== row.id);

  const changes: CollectionRecipeChange[] = [];
  kept.forEach(({ row, base }, index) => {
    const values: CollectionRecipePatch = {};
    const servings = row.servings.trim() === '' ? undefined : typedServings(row.servings);
    if (servings !== base.servings) values.servings = servings;
    if (row.variantId !== base.variantId) values.variantId = row.variantId;
    if (reordered && base.sort !== index) values.sort = index;
    if (Object.keys(values).length > 0) changes.push({ type: 'patch', id: row.id, values });
  });
  for (const id of removedIds(draft)) changes.push({ type: 'delete', id });
  return changes;
}

// ---------- Window "Rezepte zu „Grillabend““ ----------

export interface RecipePickerRow {
  recipe: Recipe;
  /** False for a recipe already contained, or once the limit is reached (and not ticked). */
  selectable: boolean;
  /** "schon enthalten" (AC-010). */
  note?: string;
}

export interface RecipePickerRows {
  rows: RecipePickerRow[];
  /** Contained plus ticked reach 50: show COLLECTION_FULL, nothing more can be ticked (E15). */
  limitReached: boolean;
}

/**
 * The rows of the window "Rezepte zu …" (E16): the search over recipes of the kind "Rezept" only
 * (AC-009) in the given order; contained ones with "schon enthalten" (AC-010). `selected` are the
 * ticked recipe ids.
 */
export function recipePickerRows(
  collection: Pick<Recipe, 'id'>,
  recipes: readonly Recipe[],
  collectionRecipes: readonly CollectionRecipe[],
  query: string,
  articlesById: Record<Id, Article>,
  selected: ReadonlySet<Id>,
): RecipePickerRows {
  const rows = collectionRecipes.filter((row) => row.collectionId === collection.id);
  const contained = new Set(rows.map((row) => row.recipeId));
  const ticked = [...selected].filter((id) => !contained.has(id)).length;
  const limitReached = rows.length + ticked >= COLLECTION_LIMITS.recipes;
  const plain = recipes.filter((recipe) => recipe.kind === 'recipe');
  return {
    limitReached,
    rows: searchRecipes(query, plain, articlesById).map((recipe): RecipePickerRow => {
      if (contained.has(recipe.id)) {
        return { recipe, selectable: false, note: 'schon enthalten' };
      }
      return { recipe, selectable: selected.has(recipe.id) || !limitReached };
    }),
  };
}

/** The foot of the window: "2 Rezepte übernehmen", "1 Rezept übernehmen". */
export function takeOverLabel(count: number): string {
  return `${recipeCountLabel(count)} übernehmen`;
}

/**
 * The rows for recipes put into a collection (AC-006, AC-008): at the end in the given order,
 * taking the portions of the collection and the default variant. A recipe already contained or
 * given twice is added once (AC-010). Throws COLLECTION_FULL beyond 50 recipes (E15).
 */
export function newCollectionRecipes(
  collectionId: Id,
  recipeIds: readonly Id[],
  collectionRecipes: readonly CollectionRecipe[],
  newId: () => Id,
): CollectionRecipe[] {
  const rows = collectionRecipes.filter((row) => row.collectionId === collectionId);
  const contained = new Set(rows.map((row) => row.recipeId));
  const added = [...new Set(recipeIds)].filter((id) => !contained.has(id));
  if (rows.length + added.length > COLLECTION_LIMITS.recipes) throw new Error(COLLECTION_FULL);
  const first = rows.reduce((next, row) => Math.max(next, row.sort + 1), 0);
  return added.map((recipeId, index) => ({
    id: newId(),
    collectionId,
    recipeId,
    sort: first + index,
  }));
}

// ---------- Window "Zu Sammlung hinzufügen" ----------

export interface CollectionChoice {
  collection: Recipe;
  selectable: boolean;
  /** "enthält es schon" (AC-010) or COLLECTION_FULL. */
  note?: string;
}

/**
 * The collections offered on a recipe page (AC-008, AC-010), A to Z: one that contains the recipe
 * already says "enthält es schon", a full one COLLECTION_FULL; neither can be chosen.
 */
export function collectionChoices(
  recipeId: Id,
  recipes: readonly Recipe[],
  collectionRecipes: readonly CollectionRecipe[],
): CollectionChoice[] {
  return recipes
    .filter((recipe) => recipe.kind === 'collection')
    .sort((a, b) => a.title.localeCompare(b.title, 'de'))
    .map((collection): CollectionChoice => {
      const rows = collectionRecipes.filter((row) => row.collectionId === collection.id);
      if (rows.some((row) => row.recipeId === recipeId)) {
        return { collection, selectable: false, note: 'enthält es schon' };
      }
      if (rows.length >= COLLECTION_LIMITS.recipes) {
        return { collection, selectable: false, note: COLLECTION_FULL };
      }
      return { collection, selectable: true };
    });
}

/** The notice after choosing: "Zu „Grillabend“ hinzugefügt" (AC-008). */
export function addedToCollectionLabel(title: string): string {
  return `Zu „${title}“ hinzugefügt`;
}
