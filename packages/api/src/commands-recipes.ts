import {
  parseIngredientBlock,
  findArticleByName,
  type Id,
  type Recipe,
  type RecipeIngredient,
} from '@housekeeping/core';

import { resolveArticle } from './commands-household';
import { buildRecipe } from './seed/demo';
import { seedRecipes } from './seed/recipes-data';
import { commit, getData, getState, newId, nowISO, updateData } from './store';

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
      id: newId('rec'),
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
 * Adds ingredients from a pasted or dictated block, one per line ("200 ml Kokosmilch").
 * Names are matched to articles; unknown names become new articles.
 * Returns the number of ingredients added.
 */
export function addIngredientsFromText(recipeId: Id, text: string, variantId?: Id): number {
  const parsed = parseIngredientBlock(text);
  if (parsed.length === 0) return 0;
  const ingredients: RecipeIngredient[] = parsed.map((line) => {
    const { article } = resolveArticle(line.name);
    return {
      id: newId('ing'),
      articleId: article.id,
      name: line.name,
      amount: line.amount,
      variantId,
      shoppingRule: article.isPantry ? 'count' : line.amount?.unit ? 'recipeAmount' : 'count',
    };
  });
  patchRecipe(recipeId, (recipe) => ({
    ...recipe,
    ingredients: [...recipe.ingredients, ...ingredients],
  }));
  return ingredients.length;
}

/** Sets the default shopping note of an ingredient ("Philadelphia"); empty text removes it. */
export function setIngredientShoppingNote(recipeId: Id, ingredientId: Id, note: string): void {
  const trimmed = note.trim();
  patchRecipe(recipeId, (recipe) => ({
    ...recipe,
    ingredients: recipe.ingredients.map((ingredient) =>
      ingredient.id === ingredientId
        ? { ...ingredient, shoppingNote: trimmed || undefined }
        : ingredient,
    ),
  }));
}

export function removeIngredient(recipeId: Id, ingredientId: Id): void {
  patchRecipe(recipeId, (recipe) => ({
    ...recipe,
    ingredients: recipe.ingredients.filter((ingredient) => ingredient.id !== ingredientId),
  }));
}

/** Replaces one ingredient's article and amount text (used by assistant proposals). */
export function replaceIngredient(recipeId: Id, ingredientId: Id, line: string): void {
  const [parsed] = parseIngredientBlock(line);
  if (!parsed) throw new Error('Die Zutat fehlt.');
  const { article } = resolveArticle(parsed.name);
  patchRecipe(recipeId, (recipe) => ({
    ...recipe,
    ingredients: recipe.ingredients.map((ingredient) =>
      ingredient.id === ingredientId
        ? {
            ...ingredient,
            articleId: article.id,
            name: parsed.name,
            amount: parsed.amount ?? ingredient.amount,
          }
        : ingredient,
    ),
  }));
}

export function addStep(recipeId: Id, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  patchRecipe(recipeId, (recipe) => ({
    ...recipe,
    steps: [...recipe.steps, { id: newId('step'), text: trimmed }],
  }));
}

export function toggleFavorite(recipeId: Id): void {
  const me = getState().currentMemberId;
  patchRecipe(recipeId, (recipe) => ({
    ...recipe,
    favoriteOf: recipe.favoriteOf.includes(me)
      ? recipe.favoriteOf.filter((id) => id !== me)
      : [...recipe.favoriteOf, me],
  }));
}

export function rateRecipe(recipeId: Id, stars: number): void {
  const me = getState().currentMemberId;
  const value = Math.max(1, Math.min(5, Math.round(stars)));
  patchRecipe(recipeId, (recipe) => ({ ...recipe, ratings: { ...recipe.ratings, [me]: value } }));
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

/** Copies starter recipes into the household's recipe book; they are normal recipes afterwards. */
export function adoptStarterRecipes(keys: string[]): number {
  const data = getData();
  const titles = new Set(data.recipes.map((recipe) => recipe.title));
  const adopted = seedRecipes
    .filter((seed) => keys.includes(seed.key) && !titles.has(seed.title))
    .map((seed) => ({ ...buildRecipe(seed, data.articles, nowISO()), id: newId('rec') }));
  if (adopted.length === 0) return 0;
  updateData((current) => ({ ...current, recipes: [...adopted, ...current.recipes] }));
  return adopted.length;
}

/** Article of an ingredient by its written name, when the ingredient was not linked yet. */
export function articleForIngredientName(name: string) {
  return findArticleByName(name, getData().articles);
}
