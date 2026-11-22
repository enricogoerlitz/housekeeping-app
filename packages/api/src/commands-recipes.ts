import {
  addIngredientRows,
  addPastedRows,
  findArticleByName,
  ingredientRowOf,
  isHalfStar,
  newEntryTitleProblem,
  newRecipe,
  parseIngredientBlock,
  placeIngredientRow,
  recipeDeletionEffect,
  removeIngredient,
  resolveIngredientArticles,
  sectionDraft,
  sectionPatch,
  validateSectionDraft,
  type Article,
  type DraftArticle,
  type Id,
  type IngredientRow,
  type IngredientsDraft,
  type Recipe,
  type RecipeKind,
  type RecipeSectionDraft,
  type ShoppingRule,
} from '@housekeeping/core';

import { catalogChoice, createArticle, insertArticles } from './commands-articles';
import { INVALID_STARS } from './commands-restaurants';
import { removeQuietly } from './photos-remote';
import { starterCatalogEntries } from './starter/entries';
import {
  commit,
  commitConfirmed,
  getData,
  getState,
  isOffline,
  newId,
  nowISO,
  OfflineError,
  peekState,
  updateData,
} from './store';
import { TransportError } from './transport';

function patchRecipe(recipeId: Id, patch: (recipe: Recipe) => Recipe): void {
  updateData((data) => ({
    ...data,
    recipes: data.recipes.map((recipe) => (recipe.id === recipeId ? patch(recipe) : recipe)),
  }));
}

/**
 * Quick creation: a title is enough, everything else can follow later. `kind` "collection"
 * creates a collection (spec 0009, AC-001, AC-002): without course, sent with course null (E3).
 * Throws "Titel fehlt" (AC-003) or "Höchstens 200 Zeichen" before anything changes.
 */
export function createRecipe(input: { title: string; servings?: number; kind?: RecipeKind }): Id {
  const problem = newEntryTitleProblem(input.title);
  if (problem) throw new Error(problem);
  return commit({ path: 'diff' }, () => {
    const recipe = newRecipe({
      id: newId(),
      kind: input.kind ?? 'recipe',
      title: input.title,
      servings: input.servings ?? 2,
      createdAt: nowISO(),
    });
    updateData((data) => ({ ...data, recipes: [recipe, ...data.recipes] }));
    return recipe.id;
  });
}

/**
 * "Neu" → "Rezept" with "Zutaten einfügen" (spec 0008, AC-021; spec 0018, REQ-001): the recipe and
 * its pasted rows with an article in one change, so they never depend on the recipe page picking
 * them up (E-01). New and starter articles ride in the same call. Returns the rows the page opens
 * in the section "Zutaten": those without an article, or every row when the rows have a problem
 * (a Hinweis over the limit), so the section shows it. Throws like createRecipe and OfflineError.
 */
export function createRecipeWithIngredients(
  input: { title: string },
  rows: readonly IngredientRow[],
): { recipeId: Id; open: IngredientRow[] } {
  const problem = newEntryTitleProblem(input.title);
  if (problem) throw new Error(problem);
  if (isOffline()) throw new OfflineError();
  return commit({ path: 'diff' }, () => {
    const recipeId = createRecipe({ title: input.title, kind: 'recipe' });
    const recipe = getData().recipes.find((candidate) => candidate.id === recipeId);
    if (!recipe || rows.length === 0) return { recipeId, open: [] };
    const draft = addPastedRows(sectionDraft(recipe, 'ingredients'), rows);
    if (validateSectionDraft(draft).length > 0) return { recipeId, open: [...rows] };
    return { recipeId, open: saveRecipeSection(recipeId, draft)?.open ?? [] };
  });
}

export function updateRecipe(
  recipeId: Id,
  patch: Partial<
    Pick<
      Recipe,
      'title' | 'servings' | 'totalMinutes' | 'course' | 'description' | 'notes' | 'tags'
    >
  >,
): void {
  if (patch.title !== undefined && !patch.title.trim()) throw new Error('Titel fehlt');
  if (patch.servings !== undefined && patch.servings < 1)
    throw new Error('Mindestens eine Portion');
  commit({ path: 'diff' }, () => patchRecipe(recipeId, (recipe) => ({ ...recipe, ...patch })));
}

/**
 * The articles for names nobody chose an article for (REQ-004, E1): name or synonym, then the
 * starter catalog, otherwise a new article "Neu aus Rezepten". Inside the running command, so new
 * articles ride in its change. Returns the article per name, in order.
 */
function articlesForNames(names: readonly string[]): Article[] {
  const data = getData();
  const { articleIds, created } = resolveIngredientArticles(names, {
    articles: data.articles,
    catalog: starterCatalogEntries,
    areas: data.areas,
    newId,
  });
  insertArticles(created);
  const byId = new Map(getData().articles.map((article) => [article.id, article]));
  return articleIds.map((id) => {
    const article = byId.get(id);
    if (!article) throw new Error(`Article ${id} missing`);
    return article;
  });
}

/**
 * The household article of a draft row (spec 0007, `DraftArticle`), created inside the running
 * command when needed: a starter hit becomes a household article (AC-003), "„Drachenfrucht“ neu
 * anlegen" uses an article that exists by that name, else creates it (AC-002).
 */
function chosenArticle(choice: DraftArticle): Article {
  if (choice.kind === 'hit') return catalogChoice(choice.hit);
  const existing = findArticleByName(choice.name, getData().articles);
  if (existing) return existing;
  const id = createArticle({ name: choice.name });
  const created = getData().articles.find((article) => article.id === id);
  if (!created) throw new Error('Name fehlt');
  return created;
}

/** E7: a rule chosen at an ingredient becomes the article's Standard-Einkaufsregel. */
function rememberRule(article: Article, rule: ShoppingRule): void {
  if (article.defaultShoppingRule === rule) return;
  updateData((data) => ({
    ...data,
    articles: data.articles.map((candidate) =>
      candidate.id === article.id ? { ...candidate, defaultShoppingRule: rule } : candidate,
    ),
  }));
}

/**
 * Replaces one ingredient's article and amount text (assistant proposals): nobody chose the
 * article, so it follows the rule of REQ-004 (a new one is "Neu aus Rezepten").
 */
export function replaceIngredient(recipeId: Id, ingredientId: Id, line: string): void {
  const [parsed] = parseIngredientBlock(line);
  if (!parsed) throw new Error('Die Zutat fehlt.');
  commit({ path: 'diff' }, () => {
    const [article] = articlesForNames([parsed.name]);
    if (!article) throw new Error('Article missing');
    patchRecipe(recipeId, (recipe) => ({
      ...recipe,
      ingredients: recipe.ingredients.map((ingredient) =>
        ingredient.id === ingredientId
          ? {
              ...ingredient,
              articleId: article.id,
              amount: parsed.amount ?? ingredient.amount,
            }
          : ingredient,
      ),
    }));
  });
}

// ---------- Sections of the recipe page (spec 0008, REQ-007, REQ-008, E7 to E10) ----------

export interface SectionSave {
  /** Rows without an article: not saved, the section stays open with them (AC-032). */
  open: IngredientRow[];
  /**
   * With open rows: the section to show next, the saved recipe plus the open rows. The page opens
   * it instead of the draft it sent, so "Fertig" never sends the saved rows twice.
   */
  reopened?: IngredientsDraft;
  /**
   * Resolves once the server took the change (at once when nothing changed); rejects with the
   * server's error when it refused it. The change shows at once; a refusal jumps back and the
   * general hint appears (onWriteRejected), so the section can reopen with its draft (E7).
   */
  confirmed: Promise<void>;
}

/**
 * "Fertig", another pen or leaving the page (E7): the draft's section as one apply_changes call
 * with only the columns it changed since it was opened (AC-029). New and starter articles, the
 * articles' Standard-Einkaufsregel and the plan entries of a removed variant (E10) ride in the
 * same call. Throws the first problem of the draft ("Titel fehlt", AC-026) and OfflineError
 * before anything changes; null when the recipe is gone (nothing is sent). For leaving the page
 * pass core savablePart(draft). The only way the app writes a recipe's fields (E9).
 */
export function saveRecipeSection(recipeId: Id, draft: RecipeSectionDraft): SectionSave | null {
  const [problem] = validateSectionDraft(draft);
  if (problem) throw new Error(problem.message);
  const target = getData().recipes.find((recipe) => recipe.id === recipeId);
  if (!target) return null;
  assertSectionFits(target, draft);
  if (isOffline()) throw new OfflineError();
  let open: IngredientRow[] = [];
  let failure: unknown;
  const confirmed = commitConfirmed({ path: 'diff' }, () => {
    try {
      const data = getData();
      const recipe = data.recipes.find((candidate) => candidate.id === recipeId);
      if (!recipe) throw new Error('Rezept nicht gefunden');
      const patch = sectionPatch(recipe, draft, {
        articles: data.articles,
        createArticle: chosenArticle,
        newId,
        entries: data.planEntries,
      });
      open = patch.open;
      for (const { articleId, rule } of patch.rules) {
        const article = getData().articles.find((candidate) => candidate.id === articleId);
        if (article) rememberRule(article, rule);
      }
      patchRecipe(recipeId, (current) => ({ ...current, ...patch.recipe }));
      if (patch.entries.length > 0) {
        const changed = new Map(patch.entries.map((entry) => [entry.id, entry]));
        updateData((current) => ({
          ...current,
          planEntries: current.planEntries.map((entry) => changed.get(entry.id) ?? entry),
        }));
      }
    } catch (error) {
      failure = error;
      throw error;
    }
  });
  // The caller may not wait for it; a refusal is reported through onWriteRejected anyway.
  confirmed.catch(() => {});
  if (failure !== undefined) throw failure;
  const saved = getData().recipes.find((recipe) => recipe.id === recipeId);
  if (open.length === 0 || !saved) return { open, confirmed };
  return { open, reopened: addIngredientRows(sectionDraft(saved, 'ingredients'), open), confirmed };
}

/**
 * Spec 0009, E3, E13: a collection has only head, own ingredients and notes, and a draft checked
 * as the other kind (a recipe's head with time) never goes out; the server would refuse it.
 */
function assertSectionFits(recipe: Recipe, draft: RecipeSectionDraft): void {
  if (recipe.kind === 'collection') {
    if (draft.section === 'classification') throw new Error('Eine Sammlung hat keine Einordnung');
    if (draft.section === 'steps') throw new Error('Eine Sammlung hat keine Zubereitung');
  }
  if ('kind' in draft && draft.kind !== recipe.kind) {
    throw new Error('Der Abschnitt passt nicht zur Art');
  }
}

// ---------- One ingredient from the read view (spec 0023, REQ-002, Decision 7) ----------

export interface IngredientSave {
  /** Resolves once the server took the change; rejects when it refused (the change jumps back). */
  confirmed: Promise<void>;
  /** "Rückgängig" in the notice: the ingredient as it was, in its place. */
  undo: () => void;
}

/**
 * "Zutat bearbeiten" from the read view: the row (core ingredientRowOf, changed in the window)
 * saved at once as the section "Zutaten" with only this row changed, so the notice "Zutat
 * gespeichert" can offer "Rückgängig". A new or starter article rides in the same call. Throws a
 * problem of the row ("Höchstens 60 Zeichen") and OfflineError before anything changes; null when
 * the recipe or the ingredient is gone.
 */
export function saveIngredient(recipeId: Id, row: IngredientRow): IngredientSave | null {
  const recipe = getData().recipes.find((candidate) => candidate.id === recipeId);
  const previous =
    recipe && row.ingredientId ? ingredientRowOf(recipe, row.ingredientId) : undefined;
  if (!recipe || !previous) return null;
  const saved = saveRecipeSection(
    recipeId,
    placeIngredientRow(sectionDraft(recipe, 'ingredients'), row),
  );
  if (!saved) return null;
  return { confirmed: saved.confirmed, undo: () => putIngredientBack(recipeId, previous) };
}

/** "Entfernen" in the ⋯ of an ingredient on the read view: "Linsen entfernt" · "Rückgängig". */
export function removeRecipeIngredient(recipeId: Id, ingredientId: Id): IngredientSave | null {
  const recipe = getData().recipes.find((candidate) => candidate.id === recipeId);
  const index = recipe?.ingredients.findIndex((ingredient) => ingredient.id === ingredientId) ?? -1;
  const previous = recipe ? ingredientRowOf(recipe, ingredientId) : undefined;
  if (!recipe || !previous || index === -1) return null;
  const saved = saveRecipeSection(
    recipeId,
    removeIngredient(sectionDraft(recipe, 'ingredients'), ingredientId),
  );
  if (!saved) return null;
  return { confirmed: saved.confirmed, undo: () => putIngredientBack(recipeId, previous, index) };
}

/** "Rückgängig": the row as it was, on the recipe as it is now (other changes stay). */
function putIngredientBack(recipeId: Id, row: IngredientRow, index?: number): void {
  const recipe = getData().recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) return;
  saveRecipeSection(recipeId, placeIngredientRow(sectionDraft(recipe, 'ingredients'), row, index));
}

// ---------- Deleting (spec 0008, REQ-012, E1 to E5) ----------

export interface RecipeDeletion {
  recipeId: Id;
  /**
   * How many planned entries go (later days, noted ones and leftovers depending on them), counted
   * from the cache like the server does (spec 0023, REQ-012): core deletedNotice.
   */
  entries: number;
  /**
   * How many collections the recipe was taken out of, counted from the cache (spec 0009, AC-033):
   * core deletedNotice. 0 for a collection.
   */
  collections: number;
  /** The recipe's own photo; discardRecipePhoto removes it once "Rückgängig" expired (E5). */
  photoPath?: string;
  /** Resolves once the server deleted the recipe; rejects when it refused (the recipe is back). */
  confirmed: Promise<void>;
}

/**
 * "Löschen" (AC-043): one delete_recipe call with the device's date. Shown at once as the server
 * will do it (core recipeDeletionEffect): the recipe with its ratings and favourites is gone,
 * entries up to today are free text, later and noted ones are gone, and so are its rows as a
 * collection or as a contained recipe (spec 0009, AC-032, AC-033; the recipes of a deleted
 * collection stay). "Rückgängig" brings the rows back with portions, variant and order. `snapshot()` taken before
 * undoes it with restore_recipe (AC-044); a refusal jumps back with the general hint (AC-045),
 * also when restore_recipe answers false.
 * Throws OfflineError; undefined for a recipe that is not there.
 */
export function deleteRecipe(recipeId: Id): RecipeDeletion | undefined {
  const recipe = getData().recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) return undefined;
  if (isOffline()) throw new OfflineError();
  const today = getState().today;
  const data = getData();
  const effect = recipeDeletionEffect(data.planEntries, recipe, today, data.collectionRecipes);
  const confirmed = commitConfirmed(
    {
      path: 'rpc',
      send: (transport) => transport.deleteRecipe(recipeId, today),
      // false: the recipe is back by other means (same id, same household). Nothing was
      // restored, so "Rückgängig" did not happen; it is refused like any other refusal.
      inverse: async (transport) => {
        if (!(await transport.restoreRecipe(recipeId))) {
          throw new TransportError('permanent', 'recipe_not_restorable');
        }
      },
    },
    () =>
      updateData((current) => {
        const now = recipeDeletionEffect(
          current.planEntries,
          recipe,
          today,
          current.collectionRecipes,
        );
        const converted = new Map(now.converted.map((entry) => [entry.id, entry]));
        const removed = new Set(now.removedIds);
        const removedRows = new Set(now.removedCollectionRecipeIds);
        return {
          ...current,
          recipes: current.recipes.filter((candidate) => candidate.id !== recipeId),
          collectionRecipes: current.collectionRecipes.filter((row) => !removedRows.has(row.id)),
          planEntries: current.planEntries.flatMap((entry) =>
            removed.has(entry.id) ? [] : [converted.get(entry.id) ?? entry],
          ),
        };
      }),
  );
  confirmed.catch(() => {});
  return {
    recipeId,
    entries: effect.removedIds.length,
    collections: effect.collections,
    photoPath: recipe.photoPath,
    confirmed,
  };
}

/**
 * E5: removes the own photo of a deleted recipe when the notice "… gelöscht · Rückgängig" runs
 * out (toast onExpire) — only after the server took the deletion and while the recipe has not
 * come back ("Rückgängig"). Never throws; a file that cannot be removed stays in the household's
 * folder.
 */
export async function discardRecipePhoto(deletion: RecipeDeletion): Promise<void> {
  const path = deletion.photoPath;
  if (!path) return;
  try {
    await deletion.confirmed;
  } catch {
    return;
  }
  const state = peekState();
  if (!state) return;
  const inUse = Object.values(state.households).some((data) =>
    data.recipes.some((recipe) => recipe.id === deletion.recipeId || recipe.photoPath === path),
  );
  if (!inUse) await removeQuietly(path);
}

/** Favourites are per person: their own RPC; undo sends the opposite. */
export function toggleFavorite(recipeId: Id): void {
  const me = getState().currentMemberId;
  const recipe = getData().recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) return;
  const favorite = !recipe.favoriteOf.includes(me);
  commit(
    {
      path: 'rpc',
      send: (transport) => transport.setRecipeFavorite(recipeId, favorite),
      inverse: (transport) => transport.setRecipeFavorite(recipeId, !favorite),
    },
    () =>
      patchRecipe(recipeId, (current) => ({
        ...current,
        favoriteOf: favorite
          ? [...current.favoriteOf, me]
          : current.favoriteOf.filter((id) => id !== me),
      })),
  );
}

/**
 * Ratings are per person: their own RPC; undo restores the previous rating (or none). Half steps
 * from 0,5 to 5 (spec 0011); anything else is refused before sending, never rounded (AC-026).
 * The same value again is a rating too: it is sent, and ratedAt moves on (Offene Frage 7).
 */
export function rateRecipe(recipeId: Id, stars: number): void {
  const me = getState().currentMemberId;
  const recipe = getData().recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) return;
  if (!isHalfStar(stars)) throw new Error(INVALID_STARS);
  const value = stars;
  const previous = recipe.ratings[me] ?? null;
  commit(
    {
      path: 'rpc',
      send: (transport) => transport.setRecipeRating(recipeId, value),
      inverse: (transport) => transport.setRecipeRating(recipeId, previous),
    },
    () =>
      patchRecipe(recipeId, (current) => ({
        ...current,
        ratings: { ...current.ratings, [me]: value },
        ratedAt: { ...current.ratedAt, [me]: nowISO() },
      })),
  );
}
