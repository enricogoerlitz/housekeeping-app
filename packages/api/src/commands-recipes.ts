import {
  defaultShoppingRuleFor,
  findArticleByName,
  isHalfStar,
  parseIngredientBlock,
  resolveIngredientArticles,
  type Amount,
  type Article,
  type CatalogHit,
  type Id,
  type Recipe,
  type RecipeIngredient,
  type ShoppingRule,
} from '@housekeeping/core';

import { catalogChoice, createArticle, insertArticles } from './commands-articles';
import { INVALID_STARS } from './commands-restaurants';
import { buildRecipe } from './seed/demo';
import { seedRecipes } from './seed/recipes-data';
import { starterCatalogEntries } from './starter/entries';
import { commit, commitConfirmed, getData, getState, newId, nowISO, updateData } from './store';

/** recipes_check_ingredients: the "Hinweis" of an ingredient. */
export const PREP_NOTE_MAX_LENGTH = 200;

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
 * Adds ingredients from a pasted or dictated block, one per line ("200 ml Kokosmilch"), without a
 * person choosing the articles: each name gets its article by the rule of REQ-004 (new ones are
 * "Neu aus Rezepten"). Returns the number of ingredients added.
 */
export function addIngredientsFromText(recipeId: Id, text: string, variantId?: Id): number {
  const parsed = parseIngredientBlock(text);
  if (parsed.length === 0) return 0;
  // New articles ride in the same change as the recipe.
  return commit({ path: 'diff' }, () => {
    const articles = articlesForNames(parsed.map((line) => line.name));
    const ingredients: RecipeIngredient[] = parsed.map((line, index) => {
      const article = articles[index];
      if (!article) throw new Error('Article missing');
      return {
        id: newId(),
        articleId: article.id,
        amount: line.amount,
        variantId,
        shoppingRule: defaultShoppingRuleFor(article, line.amount),
      };
    });
    patchRecipe(recipeId, (recipe) => ({
      ...recipe,
      ingredients: [...recipe.ingredients, ...ingredients],
    }));
    return ingredients.length;
  });
}

/** How an ingredient gets its article in "Suchen oder anlegen" (REQ-001). */
export type IngredientArticleChoice =
  /** An article of the household. */
  | { articleId: Id }
  /** A hit of core searchArticleCatalog; a starter entry becomes a household article (AC-003). */
  | { hit: CatalogHit<Article> }
  /** "„Drachenfrucht“ neu anlegen" (AC-002): an article that exists by that name is used. */
  | { newName: string };

export interface IngredientInput {
  article: IngredientArticleChoice;
  amount?: Amount;
  /**
   * Set when the person chose the rule: it also becomes the article's Standard-Einkaufsregel in
   * the same change (E7). Without it the article's rule is preselected (AC-005).
   */
  shoppingRule?: ShoppingRule;
  /** Einkaufs-Zusatz, goes to the list ("Philadelphia"). */
  shoppingNote?: string;
  /** Hinweis, only for cooking ("fein gehackt"); at most 200 characters. */
  prepNote?: string;
  variantId?: Id;
  group?: string;
}

function noteOf(text: string | undefined, max?: number): string | undefined {
  const trimmed = text?.replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  if (max !== undefined && Array.from(trimmed).length > max) {
    throw new Error(`Höchstens ${max} Zeichen`);
  }
  return trimmed;
}

/** The article of a choice, created inside the running command when needed. */
function chosenArticle(choice: IngredientArticleChoice): Article {
  if ('hit' in choice) return catalogChoice(choice.hit);
  if ('newName' in choice) {
    const existing = findArticleByName(choice.newName, getData().articles);
    if (existing) return existing;
    const id = createArticle({ name: choice.newName });
    const created = getData().articles.find((article) => article.id === id);
    if (!created) throw new Error('Name fehlt');
    return created;
  }
  const article = getData().articles.find((candidate) => candidate.id === choice.articleId);
  if (!article) throw new Error('Den Artikel gibt es nicht mehr.');
  return article;
}

/** E7: a rule chosen at an ingredient becomes the article's Standard-Einkaufsregel. */
function rememberRule(article: Article, rule: ShoppingRule | undefined): void {
  if (rule === undefined || article.defaultShoppingRule === rule) return;
  updateData((data) => ({
    ...data,
    articles: data.articles.map((candidate) =>
      candidate.id === article.id ? { ...candidate, defaultShoppingRule: rule } : candidate,
    ),
  }));
}

function ingredientFrom(input: IngredientInput): RecipeIngredient {
  const article = chosenArticle(input.article);
  rememberRule(article, input.shoppingRule);
  const ingredient: RecipeIngredient = {
    id: newId(),
    articleId: article.id,
    shoppingRule: input.shoppingRule ?? defaultShoppingRuleFor(article, input.amount),
  };
  if (input.amount) ingredient.amount = input.amount;
  const shoppingNote = noteOf(input.shoppingNote);
  if (shoppingNote) ingredient.shoppingNote = shoppingNote;
  const prepNote = noteOf(input.prepNote, PREP_NOTE_MAX_LENGTH);
  if (prepNote) ingredient.prepNote = prepNote;
  if (input.variantId) ingredient.variantId = input.variantId;
  if (input.group) ingredient.group = input.group;
  return ingredient;
}

/**
 * Adds ingredients whose article a person chose (REQ-001, REQ-002: the lines of a pasted block
 * that have one, AC-010). A new or starter article rides in the same change. Online only. Returns
 * the number added.
 */
export function addIngredients(recipeId: Id, inputs: readonly IngredientInput[]): number {
  if (inputs.length === 0) return 0;
  return commit({ path: 'diff' }, () => appendIngredients(recipeId, inputs));
}

function appendIngredients(recipeId: Id, inputs: readonly IngredientInput[]): number {
  const ingredients = inputs.map(ingredientFrom);
  patchRecipe(recipeId, (recipe) => ({
    ...recipe,
    ingredients: [...recipe.ingredients, ...ingredients],
  }));
  return ingredients.length;
}

/**
 * addIngredients for the draft lines of the editor: shown at once like addIngredients; the promise
 * resolves once the server took them and rejects when it refused them (e.g. an article deleted
 * meanwhile) or when they failed locally (offline, an article that is gone), so the lines can turn
 * orange again.
 */
export function addIngredientsConfirmed(
  recipeId: Id,
  inputs: readonly IngredientInput[],
): Promise<number> {
  if (inputs.length === 0) return Promise.resolve(0);
  return commitConfirmed({ path: 'diff' }, () => appendIngredients(recipeId, inputs));
}

/** "+ Zutat" (AC-001 to AC-005): one ingredient; returns its id. */
export function addIngredient(recipeId: Id, input: IngredientInput): Id {
  return commit({ path: 'diff' }, () => {
    const ingredient = ingredientFrom(input);
    patchRecipe(recipeId, (recipe) => ({
      ...recipe,
      ingredients: [...recipe.ingredients, ingredient],
    }));
    return ingredient.id;
  });
}

/**
 * Changes an ingredient: its article, amount, rule (E7: goes to the article too), Einkaufs-Zusatz
 * or Hinweis; blank text removes a note, `amount: undefined` the amount. Online only.
 */
export function updateIngredient(
  recipeId: Id,
  ingredientId: Id,
  patch: Partial<Omit<IngredientInput, 'variantId' | 'group'>>,
): void {
  commit({ path: 'diff' }, () => {
    const recipe = getData().recipes.find((candidate) => candidate.id === recipeId);
    const current = recipe?.ingredients.find((candidate) => candidate.id === ingredientId);
    if (!recipe || !current) throw new Error('Die Zutat gibt es nicht mehr.');
    const next: RecipeIngredient = { ...current };
    if (patch.article) {
      next.articleId = chosenArticle(patch.article).id;
    }
    if ('amount' in patch) {
      if (patch.amount) next.amount = patch.amount;
      else delete next.amount;
    }
    if (patch.shoppingRule) {
      next.shoppingRule = patch.shoppingRule;
      const article = getData().articles.find((candidate) => candidate.id === next.articleId);
      if (article) rememberRule(article, patch.shoppingRule);
    }
    if ('shoppingNote' in patch) {
      const note = noteOf(patch.shoppingNote);
      if (note) next.shoppingNote = note;
      else delete next.shoppingNote;
    }
    if ('prepNote' in patch) {
      const note = noteOf(patch.prepNote, PREP_NOTE_MAX_LENGTH);
      if (note) next.prepNote = note;
      else delete next.prepNote;
    }
    patchRecipe(recipeId, (own) => ({
      ...own,
      ingredients: own.ingredients.map((ingredient) =>
        ingredient.id === ingredientId ? next : ingredient,
      ),
    }));
  });
}

/** Sets the default shopping note of an ingredient ("Philadelphia"); empty text removes it. */
export function setIngredientShoppingNote(recipeId: Id, ingredientId: Id, note: string): void {
  const trimmed = note.trim();
  commit({ path: 'diff' }, () =>
    patchRecipe(recipeId, (recipe) => ({
      ...recipe,
      ingredients: recipe.ingredients.map((ingredient) =>
        ingredient.id === ingredientId
          ? { ...ingredient, shoppingNote: trimmed || undefined }
          : ingredient,
      ),
    })),
  );
}

export function removeIngredient(recipeId: Id, ingredientId: Id): void {
  commit({ path: 'diff' }, () =>
    patchRecipe(recipeId, (recipe) => ({
      ...recipe,
      ingredients: recipe.ingredients.filter((ingredient) => ingredient.id !== ingredientId),
    })),
  );
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

export function addStep(recipeId: Id, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  commit({ path: 'diff' }, () =>
    patchRecipe(recipeId, (recipe) => ({
      ...recipe,
      steps: [...recipe.steps, { id: newId(), text: trimmed }],
    })),
  );
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
