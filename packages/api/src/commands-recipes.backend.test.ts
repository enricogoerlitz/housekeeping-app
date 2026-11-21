// Recipe commands (spec 0003): edits on the diff path (new articles ride in the
// same changeset), favourites and ratings per member over their RPCs.
import { sortRecipes } from '@housekeeping/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { H, withBackend } from './backend-test-helpers';
import {
  addIngredientsFromText,
  addStep,
  adoptStarterRecipes,
  createRecipe,
  listStarterRecipes,
  rateRecipe,
  removeIngredient,
  replaceIngredient,
  setIngredientShoppingNote,
  toggleFavorite,
} from './commands-recipes';
import { ENRICO } from './seed/demo';
import { getData, snapshot } from './store';
import { articleName } from './test-helpers';
import { TransportError, type ChangeOp } from './transport';

const fx = withBackend();

const firstRecipe = () => {
  const recipe = getData().recipes.find((candidate) => candidate.ingredients.length > 1);
  if (!recipe) throw new Error('fixture');
  return recipe;
};
const recipeById = (id: string) => getData().recipes.find((recipe) => recipe.id === id);
const opsOf = (index: number) => (fx.calls[index]?.args[1] ?? []) as ChangeOp[];

describe('diff path', () => {
  it('ingredients with a new name: the article insert and the recipe patch are one call', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    expect(addIngredientsFromText(recipe.id, '200 g Drachenfrucht\n1 Zwiebel')).toBe(2);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0).map((op) => [op.kind, 'table' in op ? op.table : ''])).toEqual([
      ['insert', 'articles'],
      ['patch', 'recipes'],
    ]);
    const article = getData().articles.find((candidate) => candidate.name === 'Drachenfrucht');
    expect(fx.server.row(H, 'articles', article?.id ?? '')).toMatchObject({
      name_key: 'drachenfrucht',
    });
    expect(recipeById(recipe.id)?.ingredients).toHaveLength(recipe.ingredients.length + 2);
  });

  it('note, replace, remove and step each patch only the recipe', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    const [first, second] = recipe.ingredients;
    if (!first || !second) throw new Error('fixture');
    setIngredientShoppingNote(recipe.id, first.id, 'Bio');
    replaceIngredient(recipe.id, second.id, '3 Zwiebeln');
    removeIngredient(recipe.id, first.id);
    addStep(recipe.id, 'Abschmecken');
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(Array(4).fill('applyChanges'));
    for (const index of [0, 1, 2, 3]) {
      expect(opsOf(index)).toEqual([
        expect.objectContaining({ kind: 'patch', table: 'recipes', id: recipe.id }),
      ]);
    }
    expect(fx.server.row(H, 'recipes', recipe.id)?.steps).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'Abschmecken' })]),
    );
  });

  it('adopting a starter recipe inserts it in one call', async () => {
    const engine = await fx.startEnrico();
    const data = getData();
    const starter = listStarterRecipes().find((candidate) => {
      const own = data.recipes.find((recipe) => recipe.title === candidate.title);
      return own && !data.planEntries.some((entry) => entry.recipeId === own.id);
    });
    const own = data.recipes.find((recipe) => recipe.title === starter?.title);
    if (!starter || !own) throw new Error('fixture');
    fx.server.deleteRow(H, 'recipes', own.id);
    await engine.pull();
    expect(adoptStarterRecipes([starter.key])).toBe(1);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0)).toEqual([expect.objectContaining({ kind: 'insert', table: 'recipes' })]);
    expect(fx.server.rows(H, 'recipes').some((row) => row.title === starter.title)).toBe(true);
  });
});

describe('per member (rpc path)', () => {
  it('favourite: its RPC, shown at once, undo sends the opposite', async () => {
    await fx.startEnrico();
    const recipe = getData().recipes.find((candidate) => !candidate.favoriteOf.includes(ENRICO));
    if (!recipe) throw new Error('fixture');
    const restore = snapshot();
    toggleFavorite(recipe.id);
    expect(recipeById(recipe.id)?.favoriteOf).toContain(ENRICO);
    await fx.settle();
    expect(fx.calls).toEqual([{ fn: 'setRecipeFavorite', args: [recipe.id, true] }]);
    expect(fx.server.row(H, 'recipe_favorites', `${recipe.id}:${ENRICO}`)).toBeDefined();
    restore();
    await fx.settle();
    expect(fx.calls[1]).toEqual({ fn: 'setRecipeFavorite', args: [recipe.id, false] });
    expect(recipeById(recipe.id)?.favoriteOf).not.toContain(ENRICO);
  });

  it('rating: its RPC; undo restores the previous rating (none = null)', async () => {
    await fx.startEnrico();
    const recipe = getData().recipes.find((candidate) => candidate.ratings[ENRICO] === undefined);
    if (!recipe) throw new Error('fixture');
    const restore = snapshot();
    rateRecipe(recipe.id, 4);
    expect(recipeById(recipe.id)?.ratings[ENRICO]).toBe(4);
    await fx.settle();
    expect(fx.calls).toEqual([{ fn: 'setRecipeRating', args: [recipe.id, 4] }]);
    restore();
    await fx.settle();
    expect(fx.calls[1]).toEqual({ fn: 'setRecipeRating', args: [recipe.id, null] });
    expect(recipeById(recipe.id)?.ratings[ENRICO]).toBeUndefined();
  });

  it('AC-019: a rejected favourite jumps back', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const recipe = getData().recipes.find((candidate) => !candidate.favoriteOf.includes(ENRICO));
    if (!recipe) throw new Error('fixture');
    fx.server.failNext(
      'set_recipe_favorite',
      new TransportError('permanent', 'recipe_not_found', 404),
    );
    toggleFavorite(recipe.id);
    await fx.settle();
    expect(recipeById(recipe.id)?.favoriteOf).not.toContain(ENRICO);
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
  });
});

describe('recipe commands: input and local effect', () => {
  beforeEach(async () => {
    await fx.startEnrico();
  });

  it('AC-021: a new recipe with a title comes first when sorted by "Neu"; no title fails', () => {
    vi.setSystemTime(new Date('2026-11-20T11:00:00Z'));
    const id = createRecipe({ title: '  Linsen-Curry  ' });
    expect(sortRecipes(getData().recipes, 'new')[0]).toMatchObject({ id, title: 'Linsen-Curry' });
    expect(() => createRecipe({ title: ' ' })).toThrow('Titel fehlt');
  });

  it('AC-022: a pasted block becomes three ingredients linked to articles', () => {
    const id = createRecipe({ title: 'Test' });
    expect(addIngredientsFromText(id, '200 ml Kokosmilch\n1 Mango\n1 Prise Salz')).toBe(3);
    const rows = (recipeById(id)?.ingredients ?? []).map((ingredient) => [
      ingredient.amount?.text,
      ingredient.articleId && articleName(ingredient.articleId),
    ]);
    expect(rows).toEqual([
      ['200 ml', 'Kokosmilch'],
      ['1', 'Mango'],
      ['1 Prise', 'Salz'],
    ]);
    expect(addIngredientsFromText(id, '\n  \n')).toBe(0);
  });
});
