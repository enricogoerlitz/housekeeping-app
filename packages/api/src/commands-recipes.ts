import {
  addIngredientRows,
  findArticleByName,
  isHalfStar,
  parseIngredientBlock,
  recipeDeletionEffect,
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
  type RecipeSectionDraft,
  type ShoppingRule,
} from '@housekeeping/core';

import { catalogChoice, createArticle, insertArticles } from './commands-articles';
import { INVALID_STARS } from './commands-restaurants';
import { removeQuietly } from './photos-remote';
import { buildRecipe } from './seed/demo';
import { seedRecipes } from './seed/recipes-data';
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

/** Quick creation: a title is enough, everything else can follow later. */
export function createRecipe(input: { title: string; servings?: number; source?: string }): Id {
  const title = input.title.trim();
  if (!title) throw new Error('Titel fehlt');
  return commit({ path: 'diff' }, () => {
    const recipe: Recipe = {
      id: newId(),
      title,
      servings: input.servings ?? 2,
      course: 'main',
      tags: [],
      variants: [],
      ingredients: [],
      steps: [],
      favoriteOf: [],
      ratings: {},
      cookedCount: 0,
      createdAt: nowISO(),
      source: input.source,
    };
    updateData((data) => ({ ...data, recipes: [recipe, ...data.recipes] }));
    return recipe.id;
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
  if (!getData().recipes.some((recipe) => recipe.id === recipeId)) return null;
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

// ---------- Deleting (spec 0008, REQ-012, E1 to E5) ----------

export interface RecipeDeletion {
  recipeId: Id;
  /** The recipe's own photo; discardRecipePhoto removes it once "Rückgängig" expired (E5). */
  photoPath?: string;
  /** Resolves once the server deleted the recipe; rejects when it refused (the recipe is back). */
  confirmed: Promise<void>;
}

/**
 * "Löschen" (AC-043): one delete_recipe call with the device's date. Shown at once as the server
 * will do it (core recipeDeletionEffect): the recipe with its ratings and favourites is gone,
 * entries up to today are free text, later and noted ones are gone. `snapshot()` taken before
 * undoes it with restore_recipe (AC-044); a refusal jumps back with the general hint (AC-045),
 * also when restore_recipe answers false.
 * Throws OfflineError; undefined for a recipe that is not there.
 */
export function deleteRecipe(recipeId: Id): RecipeDeletion | undefined {
  const recipe = getData().recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) return undefined;
  if (isOffline()) throw new OfflineError();
  const today = getState().today;
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
      updateData((data) => {
        const effect = recipeDeletionEffect(data.planEntries, recipe, today);
        const converted = new Map(effect.converted.map((entry) => [entry.id, entry]));
        const removed = new Set(effect.removedIds);
        return {
          ...data,
          recipes: data.recipes.filter((candidate) => candidate.id !== recipeId),
          planEntries: data.planEntries.flatMap((entry) =>
            removed.has(entry.id) ? [] : [converted.get(entry.id) ?? entry],
          ),
        };
      }),
  );
  confirmed.catch(() => {});
  return { recipeId, photoPath: recipe.photoPath, confirmed };
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

export interface StarterRecipeInfo {
  key: string;
  title: string;
  photo?: string;
  totalMinutes: number;
  description: string;
  /** Already in this household's recipe book. */
  adopted: boolean;
}

/** The bundled starter recipes with a flag whether this household already has them. */
export function listStarterRecipes(): StarterRecipeInfo[] {
  const titles = new Set(getData().recipes.map((recipe) => recipe.title));
  return seedRecipes.map((seed) => ({
    key: seed.key,
    title: seed.title,
    photo: seed.photo,
    totalMinutes: seed.totalMinutes,
    description: seed.description,
    adopted: titles.has(seed.title),
  }));
}

/**
 * Copies starter recipes into the household's recipe book; they are normal recipes afterwards.
 * An article the household lacks follows the rule of REQ-004 (starter catalog, else "Neu aus
 * Rezepten"), in the same change.
 */
export function adoptStarterRecipes(keys: string[]): number {
  const titles = new Set(getData().recipes.map((recipe) => recipe.title));
  const chosen = seedRecipes.filter((seed) => keys.includes(seed.key) && !titles.has(seed.title));
  if (chosen.length === 0) return 0;
  commit({ path: 'diff' }, () => {
    articlesForNames(chosen.flatMap((seed) => seed.ingredients.map((entry) => entry.article)));
    const articles = getData().articles;
    const adopted = chosen.map((seed) => ({
      ...buildRecipe(seed, articles, nowISO()),
      id: newId(),
    }));
    updateData((current) => ({ ...current, recipes: [...adopted, ...current.recipes] }));
  });
  return chosen.length;
}
