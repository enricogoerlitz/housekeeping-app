// Recipe commands (spec 0003): edits on the diff path (new articles ride in the
// same changeset), favourites and ratings per member over their RPCs.
import { searchArticleCatalog, sortRecipes } from '@housekeeping/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { H, withBackend } from './backend-test-helpers';
import {
  addIngredient,
  addIngredients,
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
  updateIngredient,
} from './commands-recipes';
import { updateArticle } from './commands-articles';
import { starterCatalogEntries } from './starter/entries';
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

describe('ingredients with an article (spec 0007)', () => {
  const articleByName = (name: string) => {
    const found = getData().articles.find((article) => article.name === name);
    if (!found) throw new Error(`article ${name} missing`);
    return found;
  };
  const lastIngredient = (recipeId: string) => recipeById(recipeId)?.ingredients.at(-1);

  it('AC-001: the chosen article goes into the recipe; the rule follows the amount', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    const coconut = articleByName('Kokosmilch');
    const id = addIngredient(recipe.id, {
      article: { articleId: coconut.id },
      amount: { text: '400 ml', qty: 400, unit: 'ml' },
    });
    await fx.settle();
    expect(opsOf(0)).toEqual([expect.objectContaining({ kind: 'patch', table: 'recipes' })]);
    expect(lastIngredient(recipe.id)).toMatchObject({
      id,
      articleId: coconut.id,
      amount: { text: '400 ml' },
      shoppingRule: 'recipeAmount',
    });
  });

  it('AC-002: "„Drachenfrucht“ neu anlegen" creates the article in the same call', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    addIngredient(recipe.id, { article: { newName: 'Drachenfrucht' } });
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0).map((op) => [op.kind, 'table' in op ? op.table : ''])).toEqual([
      ['insert', 'articles'],
      ['patch', 'recipes'],
    ]);
    expect(articleByName('Drachenfrucht')).toMatchObject({
      diet: 'unknown',
      isPantry: false,
      needsReview: false,
    });
    expect(articleByName('Drachenfrucht').areaId).toBeUndefined();
    expect(lastIngredient(recipe.id)?.articleId).toBe(articleByName('Drachenfrucht').id);
    expect(() => addIngredient(recipe.id, { article: { newName: ' ' } })).toThrow('Name fehlt');
  });

  it('AC-003: a starter hit becomes the household article with its data, in the same call', async () => {
    const grapefruit = fx.server.rows(H, 'articles').find((row) => row.name === 'Grapefruit');
    if (!grapefruit) throw new Error('fixture');
    fx.server.deleteRow(H, 'articles', grapefruit.id);
    await fx.startEnrico();
    const [hit] = searchArticleCatalog('Grapef', getData().articles, starterCatalogEntries).matches;
    if (!hit) throw new Error('fixture');
    const recipe = firstRecipe();
    addIngredient(recipe.id, { article: { hit: hit.item } });
    await fx.settle();
    expect(fx.calls).toHaveLength(1);
    expect(articleByName('Grapefruit')).toMatchObject({ synonyms: ['Pampelmuse'], diet: 'vegan' });
    expect(lastIngredient(recipe.id)?.articleId).toBe(articleByName('Grapefruit').id);
  });

  it('E4: undoing an ingredient with a new article takes the ingredient back; the article stays', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    const restore = snapshot();
    addIngredient(recipe.id, { article: { newName: 'Drachenfrucht' } });
    await fx.settle();
    restore();
    await fx.settle();
    expect(opsOf(1)).toEqual([expect.objectContaining({ kind: 'patch', table: 'recipes' })]);
    expect(fx.server.row(H, 'recipes', recipe.id)?.ingredients).toHaveLength(
      recipe.ingredients.length,
    );
    expect(articleByName('Drachenfrucht')).toBeDefined();
  });

  it('AC-005, E7: the article’s rule is preselected; a rule chosen at the ingredient goes to the article', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    const flour = articleByName('Mehl');
    updateArticle(flour.id, { defaultShoppingRule: 'recipeAmount' });
    addIngredient(recipe.id, { article: { articleId: flour.id } });
    expect(lastIngredient(recipe.id)?.shoppingRule).toBe('recipeAmount');
    await fx.settle();
    fx.clearCalls();

    addIngredient(recipe.id, { article: { articleId: flour.id }, shoppingRule: 'skip' });
    await fx.settle();
    expect(opsOf(0).map((op) => [op.kind, 'table' in op ? op.table : ''])).toEqual([
      ['patch', 'articles'],
      ['patch', 'recipes'],
    ]);
    expect(fx.server.row(H, 'articles', flour.id)).toMatchObject({ default_shopping_rule: 'skip' });
  });

  it('AC-010: several lines with their article are one call', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    const count = recipe.ingredients.length;
    expect(
      addIngredients(recipe.id, [
        {
          article: { articleId: articleByName('Kokosmilch').id },
          amount: { text: '200 ml', qty: 200, unit: 'ml' },
        },
        { article: { articleId: articleByName('Mango').id }, amount: { text: '1', qty: 1 } },
        { article: { newName: 'Drachenfrüchte' }, amount: { text: '2', qty: 2 } },
      ]),
    ).toBe(3);
    await fx.settle();
    expect(fx.calls).toHaveLength(1);
    expect(recipeById(recipe.id)?.ingredients).toHaveLength(count + 3);
  });

  it('AC-006: an ingredient the server refuses leaves the recipe as it was, with the hint', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const recipe = firstRecipe();
    fx.server.failNext(
      'apply_changes',
      new TransportError('permanent', 'ingredient_article_invalid', 409),
    );
    addIngredient(recipe.id, { article: { articleId: articleByName('Mango').id } });
    await fx.settle();
    expect(recipeById(recipe.id)?.ingredients).toEqual(recipe.ingredients);
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
  });

  it('AC-006: an article that is gone locally is refused before sending', async () => {
    await fx.startEnrico();
    expect(() => addIngredient(firstRecipe().id, { article: { articleId: 'a-gone' } })).toThrow();
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('AC-011, AC-012: Hinweis and Einkaufs-Zusatz are separate fields of the ingredient', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    const [first] = recipe.ingredients;
    if (!first) throw new Error('fixture');
    updateIngredient(recipe.id, first.id, { prepNote: ' fein gehackt ', shoppingNote: 'Bio' });
    await fx.settle();
    expect(recipeById(recipe.id)?.ingredients[0]).toMatchObject({
      prepNote: 'fein gehackt',
      shoppingNote: 'Bio',
    });
    updateIngredient(recipe.id, first.id, { prepNote: '  ' });
    expect(recipeById(recipe.id)?.ingredients[0]).not.toHaveProperty('prepNote');
    expect(() => updateIngredient(recipe.id, first.id, { prepNote: 'x'.repeat(201) })).toThrow(
      'Höchstens 200 Zeichen',
    );
  });

  it('AC-015, AC-017: an assistant replacement resolves synonyms; an unknown name is new "Neu aus Rezepten"', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    const [first, second] = recipe.ingredients;
    if (!first || !second) throw new Error('fixture');
    replaceIngredient(recipe.id, first.id, '3 Karotten');
    replaceIngredient(recipe.id, second.id, '200 ml Milchkokos');
    await fx.settle();
    const ingredients = recipeById(recipe.id)?.ingredients ?? [];
    expect(ingredients[0]?.articleId).toBe(articleByName('Möhren').id);
    expect(articleByName('Milchkokos')).toMatchObject({ needsReview: true, diet: 'unknown' });
    expect(ingredients[1]?.articleId).toBe(articleByName('Milchkokos').id);
  });

  it('AC-016: adopting a starter recipe re-creates a missing article from the starter catalog', async () => {
    const engine = await fx.startEnrico();
    const data = getData();
    const starter = listStarterRecipes().find((candidate) => {
      const own = data.recipes.find((recipe) => recipe.title === candidate.title);
      return own && !data.planEntries.some((entry) => entry.recipeId === own.id);
    });
    const own = data.recipes.find((recipe) => recipe.title === starter?.title);
    const [first] = own?.ingredients ?? [];
    const article = data.articles.find((candidate) => candidate.id === first?.articleId);
    if (!starter || !own || !article) throw new Error('fixture');
    fx.server.deleteRow(H, 'recipes', own.id);
    // The household renamed the article: the starter entry is free again.
    fx.server.insertRows(H, {
      articles: [
        {
          ...fx.server.row(H, 'articles', article.id),
          id: article.id,
          name: `${article.name} (alt)`,
          name_key: `${article.name.toLowerCase()} alt`,
          synonyms: [],
          synonym_keys: [],
        },
      ],
    });
    await engine.pull();
    expect(adoptStarterRecipes([starter.key])).toBe(1);
    await fx.settle();
    expect(opsOf(0).map((op) => [op.kind, 'table' in op ? op.table : ''])).toEqual([
      ['insert', 'articles'],
      ['insert', 'recipes'],
    ]);
    const created = articleByName(article.name);
    expect(created).toMatchObject({ needsReview: false, isPantry: article.isPantry });
    const adopted = getData().recipes.find((recipe) => recipe.title === starter.title);
    expect(adopted?.ingredients[0]?.articleId).toBe(created.id);
  });
});
