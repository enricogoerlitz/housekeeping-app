// Recipe commands (spec 0003): edits on the diff path (new articles ride in the
// same changeset), favourites and ratings per member over their RPCs.
import {
  addIngredientRows,
  addStep,
  addVariant,
  chooseRowArticle,
  moveStep,
  newIngredientRow,
  removeIngredient,
  removeVariant,
  searchArticleCatalog,
  sectionDraft,
  setDefaultVariant,
  setRowShoppingRule,
  sortRecipes,
  updateIngredientRow,
  type IngredientRow,
  type Recipe,
} from '@housekeeping/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { H, TODAY, withBackend } from './backend-test-helpers';
import {
  adoptStarterRecipes,
  createRecipe,
  deleteRecipe,
  discardRecipePhoto,
  listStarterRecipes,
  rateRecipe,
  replaceIngredient,
  saveRecipeSection,
  toggleFavorite,
} from './commands-recipes';
import { updateArticle } from './commands-articles';
import { addPlanEntry } from './commands-plan';
import { starterCatalogEntries } from './starter/entries';
import { ENRICO, NADJA, SLOT_DINNER } from './seed/demo';
import { getData, OfflineError, snapshot } from './store';
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
  it('an assistant replacement patches only the recipe', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    const [, second] = recipe.ingredients;
    if (!second) throw new Error('fixture');
    replaceIngredient(recipe.id, second.id, '3 Zwiebeln');
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0)).toEqual([
      expect.objectContaining({ kind: 'patch', table: 'recipes', id: recipe.id }),
    ]);
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
});

describe('ingredients with an article (spec 0007, through the section "Zutaten")', () => {
  const articleByName = (name: string) => {
    const found = getData().articles.find((article) => article.name === name);
    if (!found) throw new Error(`article ${name} missing`);
    return found;
  };
  const lastIngredient = (recipeId: string) => recipeById(recipeId)?.ingredients.at(-1);
  /** "+ Zutat" in the section, then "Fertig". */
  const addRow = (recipe: Recipe, row: Partial<IngredientRow>) =>
    saveRecipeSection(
      recipe.id,
      addIngredientRows(sectionDraft(recipe, 'ingredients'), [
        { ...newIngredientRow(`k-${Math.random()}`), ...row },
      ]),
    );

  it('AC-001: the chosen article goes into the recipe; the rule follows the amount', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    const coconut = articleByName('Kokosmilch');
    addRow(recipe, { amountText: '400 ml', article: { kind: 'article', articleId: coconut.id } });
    await fx.settle();
    expect(opsOf(0)).toEqual([expect.objectContaining({ kind: 'patch', table: 'recipes' })]);
    expect(lastIngredient(recipe.id)).toMatchObject({
      articleId: coconut.id,
      amount: { text: '400 ml', qty: 400, unit: 'ml' },
      shoppingRule: 'recipeAmount',
    });
  });

  it('AC-002: "„Drachenfrucht“ neu anlegen" creates the article in the same call', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    addRow(recipe, { article: { kind: 'new', name: 'Drachenfrucht' } });
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
    expect(lastIngredient(recipe.id)?.articleId).toBe(articleByName('Drachenfrucht').id);
    expect(fx.server.row(H, 'articles', articleByName('Drachenfrucht').id)).toMatchObject({
      name_key: 'drachenfrucht',
    });
  });

  it('AC-002: "neu anlegen" with the name of an existing article uses that article', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    const count = getData().articles.length;
    addRow(recipe, { article: { kind: 'new', name: 'Kokosmilch' } });
    await fx.settle();
    expect(getData().articles).toHaveLength(count);
    expect(lastIngredient(recipe.id)?.articleId).toBe(articleByName('Kokosmilch').id);
  });

  it('AC-003: a starter hit becomes the household article with its data, in the same call', async () => {
    const grapefruit = fx.server.rows(H, 'articles').find((row) => row.name === 'Grapefruit');
    if (!grapefruit) throw new Error('fixture');
    fx.server.deleteRow(H, 'articles', grapefruit.id);
    await fx.startEnrico();
    const [hit] = searchArticleCatalog('Grapef', getData().articles, starterCatalogEntries).matches;
    if (!hit) throw new Error('fixture');
    const recipe = firstRecipe();
    addRow(recipe, { article: { kind: 'hit', hit: hit.item } });
    await fx.settle();
    expect(fx.calls).toHaveLength(1);
    expect(articleByName('Grapefruit')).toMatchObject({ synonyms: ['Pampelmuse'], diet: 'vegan' });
    expect(lastIngredient(recipe.id)?.articleId).toBe(articleByName('Grapefruit').id);
  });

  it('E4: undoing an ingredient with a new article takes the ingredient back; the article stays', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    const restore = snapshot();
    addRow(recipe, { article: { kind: 'new', name: 'Drachenfrucht' } });
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
    const flour = articleByName('Mehl');
    updateArticle(flour.id, { defaultShoppingRule: 'recipeAmount' });
    addRow(firstRecipe(), { article: { kind: 'article', articleId: flour.id } });
    expect(lastIngredient(firstRecipe().id)?.shoppingRule).toBe('recipeAmount');
    await fx.settle();
    fx.clearCalls();

    addRow(firstRecipe(), {
      article: { kind: 'article', articleId: flour.id },
      shoppingRule: 'skip',
      shoppingRuleChosen: true,
    });
    await fx.settle();
    expect(opsOf(0).map((op) => [op.kind, 'table' in op ? op.table : ''])).toEqual([
      ['patch', 'articles'],
      ['patch', 'recipes'],
    ]);
    expect(fx.server.row(H, 'articles', flour.id)).toMatchObject({ default_shopping_rule: 'skip' });
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
    const saved = addRow(recipe, {
      article: { kind: 'article', articleId: articleByName('Mango').id },
    });
    await fx.settle();
    await expect(saved?.confirmed).rejects.toMatchObject({ code: 'ingredient_article_invalid' });
    expect(recipeById(recipe.id)?.ingredients).toEqual(recipe.ingredients);
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
  });

  it('AC-006: a row whose article is gone locally stays open and sends nothing', async () => {
    await fx.startEnrico();
    const saved = addRow(firstRecipe(), { article: { kind: 'article', articleId: 'a-gone' } });
    expect(saved?.open).toHaveLength(1);
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('AC-001: editing an ingredient can remove its amount', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    const ingredient = recipe.ingredients.find((candidate) => candidate.amount);
    if (!ingredient) throw new Error('fixture');
    saveRecipeSection(
      recipe.id,
      updateIngredientRow(sectionDraft(recipe, 'ingredients'), ingredient.id, { amountText: '' }),
    );
    await fx.settle();
    const saved = recipeById(recipe.id)?.ingredients.find((row) => row.id === ingredient.id);
    expect(saved).not.toHaveProperty('amount');
    expect(saved?.articleId).toBe(ingredient.articleId);
  });

  it('AC-011, AC-012: Hinweis and Einkaufs-Zusatz are separate fields; blank removes them', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    const [first] = recipe.ingredients;
    if (!first) throw new Error('fixture');
    saveRecipeSection(
      recipe.id,
      updateIngredientRow(sectionDraft(recipe, 'ingredients'), first.id, {
        prepNote: ' fein gehackt ',
        shoppingNote: 'Bio',
      }),
    );
    expect(recipeById(recipe.id)?.ingredients[0]).toMatchObject({
      prepNote: 'fein gehackt',
      shoppingNote: 'Bio',
    });
    const noted = recipeById(recipe.id);
    if (!noted) throw new Error('fixture');
    saveRecipeSection(
      recipe.id,
      updateIngredientRow(sectionDraft(noted, 'ingredients'), first.id, { prepNote: '  ' }),
    );
    expect(recipeById(recipe.id)?.ingredients[0]).not.toHaveProperty('prepNote');
    expect(() =>
      saveRecipeSection(
        recipe.id,
        updateIngredientRow(sectionDraft(noted, 'ingredients'), first.id, {
          prepNote: 'x'.repeat(201),
        }),
      ),
    ).toThrow('Höchstens 200 Zeichen');
  });

  it('spec 0007 "Zutat entfernen": ⋯ → "Entfernen" and "Fertig" remove the ingredient', async () => {
    await fx.startEnrico();
    const recipe = firstRecipe();
    const [first] = recipe.ingredients;
    if (!first) throw new Error('fixture');
    saveRecipeSection(recipe.id, removeIngredient(sectionDraft(recipe, 'ingredients'), first.id));
    await fx.settle();
    expect(opsOf(0)).toEqual([
      expect.objectContaining({ kind: 'patch', table: 'recipes', id: recipe.id }),
    ]);
    const stored = fx.server.row(H, 'recipes', recipe.id)?.ingredients as { id: string }[];
    expect(stored.map((ingredient) => ingredient.id)).not.toContain(first.id);
    expect(stored).toHaveLength(recipe.ingredients.length - 1);
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

// ---------- spec 0008: sections, deletion, photo ----------

describe('spec 0008: saving a section (REQ-007, REQ-008, E7, E10)', () => {
  const byTitle = (title: string) => {
    const recipe = getData().recipes.find((candidate) => candidate.title === title);
    if (!recipe) throw new Error(`recipe ${title} missing`);
    return recipe;
  };
  const articleByName = (name: string) => {
    const found = getData().articles.find((article) => article.name === name);
    if (!found) throw new Error(`article ${name} missing`);
    return found;
  };
  const tablesOf = (index: number) =>
    opsOf(index).map((op) => [op.kind, 'table' in op ? op.table : op.kind]);

  it('AC-023, AC-029: notes send one apply_changes with only notes; Nadja’s title stays', async () => {
    const engine = await fx.startEnrico();
    const nadja = await fx.startNadja();
    const lasagne = byTitle('Lasagne');
    const draft = { ...sectionDraft(lasagne, 'notes'), notes: 'Mit doppelt Béchamel noch besser.' };
    await fx.server
      .transport(NADJA)
      .applyChanges(H, [
        { kind: 'patch', table: 'recipes', id: lasagne.id, changes: { title: 'Lasagne al forno' } },
      ]);
    await engine.pull();
    const saved = saveRecipeSection(lasagne.id, draft);
    expect(saved?.open).toEqual([]);
    await fx.settle(nadja);
    await expect(saved?.confirmed).resolves.toBeUndefined();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0)).toEqual([
      {
        kind: 'patch',
        table: 'recipes',
        id: lasagne.id,
        changes: { notes: 'Mit doppelt Béchamel noch besser.' },
      },
    ]);
    expect(fx.server.row(H, 'recipes', lasagne.id)).toMatchObject({
      title: 'Lasagne al forno',
      notes: 'Mit doppelt Béchamel noch besser.',
    });
    expect(fx.nadjaData(nadja).recipes.find((recipe) => recipe.id === lasagne.id)?.notes).toBe(
      'Mit doppelt Béchamel noch besser.',
    );
  });

  it('AC-025: the head sets servings 6 and 45 minutes; the amounts stay as stored', async () => {
    await fx.startEnrico();
    const lasagne = byTitle('Lasagne');
    const draft = { ...sectionDraft(lasagne, 'head'), servings: '6', totalMinutes: '45' };
    saveRecipeSection(lasagne.id, draft);
    await fx.settle();
    expect(opsOf(0)).toEqual([
      {
        kind: 'patch',
        table: 'recipes',
        id: lasagne.id,
        changes: { servings: 6, total_minutes: 45 },
      },
    ]);
    expect(recipeById(lasagne.id)).toMatchObject({ servings: 6, totalMinutes: 45 });
    expect(recipeById(lasagne.id)?.ingredients).toEqual(lasagne.ingredients);
  });

  it('AC-026: an empty title writes nothing and keeps "Lasagne"', async () => {
    await fx.startEnrico();
    const lasagne = byTitle('Lasagne');
    const draft = { ...sectionDraft(lasagne, 'head'), title: '  ' };
    expect(() => saveRecipeSection(lasagne.id, draft)).toThrow('Titel fehlt');
    await fx.settle();
    expect(fx.calls).toEqual([]);
    expect(recipeById(lasagne.id)?.title).toBe('Lasagne');
  });

  it('AC-027: steps in the new order and the Vorlauf in one patch', async () => {
    await fx.startEnrico();
    const lasagne = byTitle('Lasagne');
    const [first] = lasagne.steps;
    if (!first) throw new Error('fixture');
    let draft = sectionDraft(lasagne, 'steps');
    draft = moveStep(draft, first.id, lasagne.steps.length);
    draft = addStep(draft, 'Mit Olivenöl servieren', 'step-new');
    draft = { ...draft, leadTimeText: 'Kichererbsen einweichen', leadTimeHours: '12' };
    saveRecipeSection(lasagne.id, draft);
    await fx.settle();
    expect(opsOf(0)).toHaveLength(1);
    const row = fx.server.row(H, 'recipes', lasagne.id);
    expect((row?.steps as { text: string }[]).map((step) => step.text)).toEqual([
      ...lasagne.steps.slice(1).map((step) => step.text),
      first.text,
      'Mit Olivenöl servieren',
    ]);
    expect(row?.lead_time).toEqual({ text: 'Kichererbsen einweichen', hoursBefore: 12 });
  });

  it('AC-030, AC-032: new article and recipe patch in one call; the orange row stays open, then saves', async () => {
    await fx.startEnrico();
    const dal = byTitle('Linsen-Dal');
    let draft = sectionDraft(dal, 'ingredients');
    draft = addIngredientRows(draft, [
      {
        ...newIngredientRow('k-coconut'),
        amountText: '200 ml',
        article: { kind: 'article', articleId: articleByName('Kokosmilch').id },
      },
      { ...newIngredientRow('k-mango'), amountText: '1', article: { kind: 'new', name: 'Mango' } },
      { ...newIngredientRow('k-fenugreek'), name: 'Bockshornklee', amountText: '1 TL' },
    ]);
    const first = saveRecipeSection(dal.id, draft);
    expect(first?.open.map((row) => row.key)).toEqual(['k-fenugreek']);
    await fx.settle();
    expect(fx.calls).toHaveLength(1);
    expect(recipeById(dal.id)?.ingredients).toHaveLength(dal.ingredients.length + 2);
    expect(recipeById(dal.id)?.ingredients.at(-2)).toMatchObject({
      articleId: articleByName('Kokosmilch').id,
      amount: { text: '200 ml', qty: 200, unit: 'ml' },
    });

    // The section reopens from the saved recipe with the open rows, never with the old draft.
    const saved = recipeById(dal.id);
    if (!saved || !first?.reopened) throw new Error('fixture');
    expect(first.reopened).toEqual(
      addIngredientRows(sectionDraft(saved, 'ingredients'), first.open),
    );
    const reopened = chooseRowArticle(first.reopened, 'k-fenugreek', {
      kind: 'new',
      name: 'Bockshornklee',
    });
    const second = saveRecipeSection(dal.id, reopened);
    expect(second?.open).toEqual([]);
    expect(second?.reopened).toBeUndefined();
    await fx.settle();
    expect(tablesOf(1)).toEqual([
      ['insert', 'articles'],
      ['patch', 'recipes'],
    ]);
    expect(recipeById(dal.id)?.ingredients).toHaveLength(dal.ingredients.length + 3);
    expect(recipeById(dal.id)?.ingredients.at(-1)?.articleId).toBe(
      articleByName('Bockshornklee').id,
    );
  });

  it('AC-031, E7: Zusatz and Hinweis; a chosen rule goes to the article in the same call', async () => {
    await fx.startEnrico();
    const dal = byTitle('Linsen-Dal');
    const [first] = dal.ingredients;
    if (!first) throw new Error('fixture');
    let draft = sectionDraft(dal, 'ingredients');
    draft = updateIngredientRow(draft, first.id, { shoppingNote: 'rot', prepNote: 'fein gehackt' });
    draft = setRowShoppingRule(draft, first.id, 'skip');
    saveRecipeSection(dal.id, draft);
    await fx.settle();
    expect(tablesOf(0)).toEqual([
      ['patch', 'articles'],
      ['patch', 'recipes'],
    ]);
    expect(recipeById(dal.id)?.ingredients[0]).toMatchObject({
      shoppingNote: 'rot',
      prepNote: 'fein gehackt',
      shoppingRule: 'skip',
    });
    expect(fx.server.row(H, 'articles', first.articleId)).toMatchObject({
      default_shopping_rule: 'skip',
    });
  });

  it('spec 0007 AC-004: the head keeps its new title when the ingredients leave an orange row', async () => {
    await fx.startEnrico();
    const dal = byTitle('Linsen-Dal');
    saveRecipeSection(dal.id, { ...sectionDraft(dal, 'head'), title: 'Dal mit Spinat' });
    const draft = addIngredientRows(sectionDraft(dal, 'ingredients'), [
      { ...newIngredientRow('k-open'), name: 'Bockshornklee' },
    ]);
    expect(saveRecipeSection(dal.id, draft)?.open).toHaveLength(1);
    await fx.settle();
    // Nothing changed in the ingredients: only the head was sent.
    expect(fx.calls).toHaveLength(1);
    expect(fx.server.row(H, 'recipes', dal.id)).toMatchObject({ title: 'Dal mit Spinat' });
    expect(recipeById(dal.id)?.ingredients).toEqual(dal.ingredients);
  });

  it('AC-033, E10: removing a variant patches recipe and plan entries in one call', async () => {
    await fx.startEnrico();
    const curry = byTitle('Mango-Curry');
    const tofu = curry.variants.find((variant) => variant.name === 'mit Tofu');
    const chicken = curry.variants.find((variant) => variant.name === 'mit Hähnchen');
    if (!tofu || !chicken) throw new Error('fixture');
    const entryId = addPlanEntry({
      date: '2026-11-23',
      slotId: SLOT_DINNER,
      kind: 'recipe',
      recipeId: curry.id,
      eaterIds: [ENRICO, NADJA],
      portions: 2,
      variants: [
        { variantId: chicken.id, portions: 1 },
        { variantId: tofu.id, portions: 1 },
      ],
    });
    await fx.settle();
    fx.clearCalls();

    let draft = sectionDraft(curry, 'ingredients');
    draft = addVariant(draft, 'mit Garnelen', 'v-prawns');
    draft = addIngredientRows(draft, [
      {
        ...newIngredientRow('k-prawns'),
        amountText: '300 g',
        article: { kind: 'new', name: 'Garnelen' },
        variantId: 'v-prawns',
      },
    ]);
    draft = setDefaultVariant(draft, 'v-prawns');
    saveRecipeSection(curry.id, draft);
    await fx.settle();
    expect(recipeById(curry.id)?.variants.find((variant) => variant.isDefault)?.name).toBe(
      'mit Garnelen',
    );

    const current = recipeById(curry.id);
    if (!current) throw new Error('fixture');
    saveRecipeSection(curry.id, removeVariant(sectionDraft(current, 'ingredients'), chicken.id));
    await fx.settle();
    expect(fx.calls).toHaveLength(2);
    // The seed plans Mango-Curry with chicken too: every such entry rides in the same call.
    const [recipeOp, ...entryOps] = opsOf(1);
    expect(recipeOp).toMatchObject({ kind: 'patch', table: 'recipes', id: curry.id });
    expect(entryOps.length).toBeGreaterThan(0);
    expect(entryOps.every((op) => op.kind === 'patch' && op.table === 'meal_plan_entries')).toBe(
      true,
    );
    expect(entryOps).toContainEqual(expect.objectContaining({ id: entryId }));
    const after = recipeById(curry.id);
    expect(after?.variants.map((variant) => variant.name)).toEqual(['mit Tofu', 'mit Garnelen']);
    expect(after?.ingredients.some((ingredient) => ingredient.variantId === chicken.id)).toBe(
      false,
    );
    expect(fx.server.row(H, 'meal_plan_entries', entryId)?.variants).toEqual([
      { variantId: tofu.id, portions: 1 },
      { variantId: 'v-prawns', portions: 1 },
    ]);
  });

  it('E10: more than 200 operations are refused by the server; everything jumps back with the hint', async () => {
    const engine = await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const curry = byTitle('Mango-Curry');
    const chicken = curry.variants.find((variant) => variant.name === 'mit Hähnchen');
    if (!chicken) throw new Error('fixture');
    fx.server.insertRows(H, {
      meal_plan_entries: Array.from({ length: 200 }, (_, index) => ({
        id: `e-bulk-${index}`,
        date: '2026-11-23',
        slot_id: SLOT_DINNER,
        kind: 'recipe',
        recipe_id: curry.id,
        eater_ids: [ENRICO],
        guests: 0,
        portions: 1,
        variants: [{ variantId: chicken.id, portions: 1 }],
        sort: index,
        not_cooked: false,
      })),
    });
    await engine.pull();
    const saved = saveRecipeSection(
      curry.id,
      removeVariant(sectionDraft(curry, 'ingredients'), chicken.id),
    );
    expect(recipeById(curry.id)?.variants).toHaveLength(1);
    await fx.settle();
    await expect(saved?.confirmed).rejects.toMatchObject({ code: 'too_many_changes' });
    expect(recipeById(curry.id)?.variants).toHaveLength(2);
    expect(getData().planEntries.find((entry) => entry.id === 'e-bulk-0')?.variants).toEqual([
      { variantId: chicken.id, portions: 1 },
    ]);
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
  });

  it('E7: a refusal rejects `confirmed` and the recipe jumps back with the hint', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const lasagne = byTitle('Lasagne');
    fx.server.failNext('apply_changes', new TransportError('permanent', 'boom', 400));
    const saved = saveRecipeSection(lasagne.id, {
      ...sectionDraft(lasagne, 'notes'),
      notes: 'Neu',
    });
    expect(recipeById(lasagne.id)?.notes).toBe('Neu');
    await fx.settle();
    await expect(saved?.confirmed).rejects.toMatchObject({ code: 'boom' });
    expect(recipeById(lasagne.id)?.notes).toBe(lasagne.notes);
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
  });

  it('negative: a recipe that is gone sends nothing; offline throws OfflineError', async () => {
    const engine = await fx.startEnrico();
    const lasagne = byTitle('Lasagne');
    const draft = { ...sectionDraft(lasagne, 'notes'), notes: 'Neu' };
    fx.environment.setOnline(false);
    expect(() => saveRecipeSection(lasagne.id, draft)).toThrow(OfflineError);
    fx.environment.setOnline(true);
    await fx.settle();
    await fx.server.transport(NADJA).deleteRecipe(lasagne.id, TODAY);
    await engine.pull();
    expect(saveRecipeSection(lasagne.id, draft)).toBeNull();
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('negative: nothing changed sends nothing and is confirmed at once', async () => {
    await fx.startEnrico();
    const lasagne = byTitle('Lasagne');
    const saved = saveRecipeSection(lasagne.id, sectionDraft(lasagne, 'classification'));
    await expect(saved?.confirmed).resolves.toBeUndefined();
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });
});

describe('spec 0008: deleting a recipe (REQ-012, E3 to E5)', () => {
  const halloumi = () => {
    const recipe = getData().recipes.find((candidate) => candidate.title === 'Halloumi-Pfanne');
    if (!recipe) throw new Error('fixture');
    return recipe;
  };
  const planned = (recipeId: string, date: string | null) =>
    addPlanEntry({
      date,
      slotId: SLOT_DINNER,
      kind: 'recipe',
      recipeId,
      eaterIds: [ENRICO, NADJA],
    });
  const PHOTO = `${H}/recipes/rec-halloumi-pfanne/0b6f7a3e-1c1d-4a5e-9f00-123456789abc.jpg`;

  /** Halloumi-Pfanne on Mon 16.11. and Sat 21.11., with Nadja's 5 stars and her favourite. */
  async function arrange() {
    const engine = await fx.startEnrico();
    const recipe = halloumi();
    const monday = planned(recipe.id, '2026-11-16');
    const saturday = planned(recipe.id, '2026-11-21');
    await fx.server.transport(NADJA).setRecipeRating(recipe.id, 5);
    await fx.server.transport(NADJA).setRecipeFavorite(recipe.id, true);
    fx.server.insertRows(H, {
      recipes: [{ ...fx.server.row(H, 'recipes', recipe.id), id: recipe.id, photo_path: PHOTO }],
    });
    await fx.settle();
    await engine.pull();
    fx.clearCalls();
    return { recipe: halloumi(), monday, saturday };
  }

  it('AC-043: gone at once, Saturday removed, Monday free text; one delete_recipe call; Nadja sees it', async () => {
    const { recipe, monday, saturday } = await arrange();
    const nadja = await fx.startNadja();
    expect(deleteRecipe(recipe.id)).toMatchObject({ recipeId: recipe.id, photoPath: PHOTO });
    expect(recipeById(recipe.id)).toBeUndefined();
    expect(getData().planEntries.find((entry) => entry.id === saturday)).toBeUndefined();
    expect(getData().planEntries.find((entry) => entry.id === monday)).toMatchObject({
      kind: 'text',
      text: 'Halloumi-Pfanne',
      recipeId: undefined,
      variants: [],
    });
    await fx.settle(nadja);
    expect(fx.calls).toEqual([{ fn: 'deleteRecipe', args: [recipe.id, TODAY] }]);
    expect(fx.server.row(H, 'recipes', recipe.id)).toBeUndefined();
    expect(recipeById(recipe.id)).toBeUndefined();
    expect(fx.nadjaData(nadja).recipes.some((candidate) => candidate.id === recipe.id)).toBe(false);
    expect(fx.nadjaData(nadja).planEntries.find((entry) => entry.id === monday)).toMatchObject({
      kind: 'text',
      text: 'Halloumi-Pfanne',
    });
  });

  it('AC-044: "Rückgängig" sends restore_recipe; ratings, favourite, photo and both entries come back', async () => {
    const { recipe, monday, saturday } = await arrange();
    const nadja = await fx.startNadja();
    const restore = snapshot();
    deleteRecipe(recipe.id);
    await fx.settle(nadja);
    restore();
    expect(recipeById(recipe.id)).toMatchObject({ ratings: { [NADJA]: 5 }, photoPath: PHOTO });
    await fx.settle(nadja);
    expect(fx.calls).toEqual([
      { fn: 'deleteRecipe', args: [recipe.id, TODAY] },
      { fn: 'restoreRecipe', args: [recipe.id] },
    ]);
    expect(recipeById(recipe.id)).toMatchObject({
      ratings: { [NADJA]: 5 },
      favoriteOf: [NADJA],
      photoPath: PHOTO,
    });
    for (const id of [monday, saturday]) {
      expect(getData().planEntries.find((entry) => entry.id === id)).toMatchObject({
        kind: 'recipe',
        recipeId: recipe.id,
      });
    }
    expect(
      fx.nadjaData(nadja).recipes.find((candidate) => candidate.id === recipe.id)?.ratings,
    ).toEqual({ [NADJA]: 5 });
  });

  it('AC-045: a refusal brings recipe and calendar back unchanged, with the hint', async () => {
    const { recipe, monday, saturday } = await arrange();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const before = getData().planEntries;
    fx.server.failNext('delete_recipe', new TransportError('permanent', 'boom', 400));
    const deletion = deleteRecipe(recipe.id);
    await fx.settle();
    await expect(deletion?.confirmed).rejects.toMatchObject({ code: 'boom' });
    expect(recipeById(recipe.id)).toEqual(recipe);
    for (const id of [monday, saturday]) {
      expect(getData().planEntries.find((entry) => entry.id === id)).toEqual(
        before.find((entry) => entry.id === id),
      );
    }
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
  });

  it('E5: the photo is removed after the deletion went through, never after undo or a refusal', async () => {
    const { recipe } = await arrange();
    const deletion = deleteRecipe(recipe.id);
    if (!deletion) throw new Error('fixture');
    await fx.settle();
    await discardRecipePhoto(deletion);
    expect(fx.calls.map((call) => call.fn)).toEqual(['deleteRecipe', 'removeMedia']);
    expect(fx.calls[1]?.args).toEqual([[PHOTO]]);
  });

  it('E5: after "Rückgängig" the photo stays', async () => {
    const { recipe } = await arrange();
    const restore = snapshot();
    const deletion = deleteRecipe(recipe.id);
    if (!deletion) throw new Error('fixture');
    await fx.settle();
    restore();
    await discardRecipePhoto(deletion);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['deleteRecipe', 'restoreRecipe']);
  });

  it('E5: after a refused deletion the photo stays', async () => {
    const { recipe } = await arrange();
    fx.server.failNext('delete_recipe', new TransportError('permanent', 'boom', 400));
    const deletion = deleteRecipe(recipe.id);
    if (!deletion) throw new Error('fixture');
    await fx.settle();
    await discardRecipePhoto(deletion);
    expect(fx.calls.map((call) => call.fn)).toEqual(['deleteRecipe']);
  });

  it('negative: offline throws OfflineError and sends nothing; an unknown recipe does nothing', async () => {
    const { recipe } = await arrange();
    fx.environment.setOnline(false);
    expect(() => deleteRecipe(recipe.id)).toThrow(OfflineError);
    expect(recipeById(recipe.id)).toBeDefined();
    fx.environment.setOnline(true);
    expect(deleteRecipe('rec-unknown')).toBeUndefined();
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('negative: a recipe of another household cannot be deleted (recipe_not_found)', async () => {
    await fx.startEnrico();
    await expect(
      fx.server.transport('u-stranger').deleteRecipe(halloumi().id, TODAY),
    ).rejects.toMatchObject({ code: 'recipe_not_found' });
    expect(fx.server.row(H, 'recipes', halloumi().id)).toBeDefined();
  });
});
