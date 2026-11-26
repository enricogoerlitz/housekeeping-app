// Spec 0037, REQ-001: the recipe page saved in one step (AC-003, AC-004, AC-006) and the time of
// a collection (REQ-005, AC-016), against the fake server.
import {
  contentsInBook,
  newIngredientRow,
  pageDraft,
  withSection,
  type PageDraft,
  type Recipe,
} from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { H, withBackend } from './backend-test-helpers';
import { createCollection } from './commands-collections';
import { saveRecipePage } from './commands-recipe-page';
import { NADJA } from './seed/demo';
import { getData, OfflineError, simulateOffline } from './store';
import { TransportError, type ChangeOp } from './transport';

const fx = withBackend();
const byTitle = (title: string): Recipe => {
  const recipe = getData().recipes.find((candidate) => candidate.title === title);
  if (!recipe) throw new Error(`recipe ${title} missing`);
  return recipe;
};
const recipeById = (id: string) => getData().recipes.find((recipe) => recipe.id === id);
const contentsOf = (collectionId: string) => {
  const collection = recipeById(collectionId);
  if (!collection) throw new Error('collection missing');
  const data = getData();
  return contentsInBook(collection, {
    recipesById: Object.fromEntries(data.recipes.map((recipe) => [recipe.id, recipe])),
    collectionRecipes: data.collectionRecipes,
  });
};
const articleId = (name: string) => {
  const article = getData().articles.find((candidate) => candidate.name === name);
  if (!article) throw new Error(`article ${name} missing`);
  return article.id;
};

/** Title "Omas Lasagne" and a new ingredient, as in AC-003. */
function edited(recipe: Recipe): PageDraft {
  const page = pageDraft(recipe, []);
  const titled = withSection(page, { ...page.head, title: `Omas ${recipe.title}` });
  return withSection(titled, {
    ...titled.ingredients,
    rows: [
      ...titled.ingredients.rows,
      {
        ...newIngredientRow('neu-zimt'),
        amountText: '1 TL',
        article: { kind: 'article', articleId: articleId('Zimt') },
      },
    ],
  });
}

describe('saveRecipePage (spec 0037, REQ-001)', () => {
  it('AC-003: title and a new ingredient in one save_recipe_page call', async () => {
    await fx.startEnrico();
    const lasagne = byTitle('Lasagne');
    const saved = saveRecipePage(edited(lasagne));
    expect(recipeById(lasagne.id)?.title).toBe('Omas Lasagne');
    await fx.settle();
    await expect(saved?.confirmed).resolves.toEqual({ changedMeanwhile: false });
    expect(fx.calls.map((call) => call.fn)).toEqual(['saveRecipePage']);
    const [householdId, recipeId, seen, ops] = fx.calls[0]?.args ?? [];
    expect([householdId, recipeId, seen]).toEqual([H, lasagne.id, lasagne.updatedAt]);
    expect(ops as ChangeOp[]).toEqual([
      {
        kind: 'patch',
        table: 'recipes',
        id: lasagne.id,
        changes: { title: 'Omas Lasagne', ingredients: expect.any(Array) },
      },
    ]);
    const stored = recipeById(lasagne.id);
    expect(stored?.ingredients).toHaveLength(lasagne.ingredients.length + 1);
    expect(stored?.updatedAt).not.toBe(lasagne.updatedAt);
  });

  it('AC-004: refused, nothing stays: title and ingredient jump back', async () => {
    await fx.startEnrico();
    const lasagne = byTitle('Lasagne');
    fx.server.failNext(
      'save_recipe_page',
      new TransportError('permanent', 'ingredient_article_invalid', 409),
    );
    const saved = saveRecipePage(edited(lasagne));
    await fx.settle();
    await expect(saved?.confirmed).rejects.toMatchObject({ code: 'ingredient_article_invalid' });
    expect(recipeById(lasagne.id)?.title).toBe('Lasagne');
    expect(recipeById(lasagne.id)?.ingredients).toEqual(lasagne.ingredients);
  });

  it('AC-006: Nadja saved meanwhile: my field wins, hers stays, and the answer says so', async () => {
    await fx.startEnrico();
    const lasagne = byTitle('Lasagne');
    const page = edited(lasagne);
    await fx.settle();
    await fx.server.transport(NADJA).applyChanges(H, [
      {
        kind: 'patch',
        table: 'recipes',
        id: lasagne.id,
        changes: { description: 'Wie bei Oma' },
      },
    ]);
    const saved = saveRecipePage(page);
    await fx.settle();
    await expect(saved?.confirmed).resolves.toEqual({ changedMeanwhile: true });
    expect(recipeById(lasagne.id)).toMatchObject({
      title: 'Omas Lasagne',
      description: 'Wie bei Oma',
    });
  });

  it('AC-006: my own earlier save is no change "meanwhile", also before the pull brought it', async () => {
    await fx.startEnrico();
    const lasagne = byTitle('Lasagne');
    const first = saveRecipePage(edited(lasagne));
    await fx.settle();
    await first?.confirmed;
    // The edit mode opens again from a cache that may still hold the old updated_at.
    const again = pageDraft({ ...byTitle('Omas Lasagne'), updatedAt: lasagne.updatedAt }, []);
    const second = saveRecipePage(withSection(again, { ...again.notes, notes: 'Mit Salbei' }));
    await fx.settle();
    await expect(second?.confirmed).resolves.toEqual({ changedMeanwhile: false });
  });

  it('nothing changed: no call', async () => {
    await fx.startEnrico();
    const saved = saveRecipePage(pageDraft(byTitle('Lasagne'), []));
    await expect(saved?.confirmed).resolves.toEqual({ changedMeanwhile: false });
    expect(fx.calls).toEqual([]);
  });

  it('a problem, offline or a recipe that is gone: nothing is sent', async () => {
    await fx.startEnrico();
    const page = pageDraft(byTitle('Lasagne'), []);
    expect(() => saveRecipePage(withSection(page, { ...page.head, title: '' }))).toThrow(
      'Titel fehlt',
    );
    expect(saveRecipePage({ ...page, recipeId: 'gone' })).toBeNull();
    simulateOffline(true);
    expect(() => saveRecipePage(edited(byTitle('Lasagne')))).toThrow(OfflineError);
    simulateOffline(false);
    await fx.settle();
    expect(fx.calls.filter((call) => call.fn === 'saveRecipePage')).toEqual([]);
  });

  it('AC-016: a collection saves its time and "Enthält" in the same call', async () => {
    await fx.startEnrico();
    const grillabend = byTitle('Grillabend');
    const page = pageDraft(grillabend, contentsOf(grillabend.id));
    const contents = page.contents;
    if (!contents) throw new Error('contents expected');
    const next = withSection(withSection(page, { ...page.head, totalMinutes: '90' }), {
      ...contents,
      rows: contents.rows.slice(1),
    });
    const saved = saveRecipePage(next);
    await fx.settle();
    await expect(saved?.confirmed).resolves.toEqual({ changedMeanwhile: false });
    expect(fx.calls.map((call) => call.fn)).toEqual(['saveRecipePage']);
    expect(recipeById(grillabend.id)?.totalMinutes).toBe(90);
    expect(contentsOf(grillabend.id)).toHaveLength(contents.rows.length - 1);
  });
});

describe('"Neu → Sammlung" with recipes (spec 0037, REQ-002)', () => {
  it('AC-009: „Grillfest“ with two recipes in one call', async () => {
    await fx.startEnrico();
    const lasagne = byTitle('Lasagne');
    const second = getData().recipes.find(
      (recipe) => recipe.kind === 'recipe' && recipe.id !== lasagne.id,
    );
    if (!second) throw new Error('fixture');
    const id = createCollection({ title: 'Grillfest', recipeIds: [lasagne.id, second.id] });
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(contentsOf(id).map((content) => content.recipe.id)).toEqual([lasagne.id, second.id]);
  });

  it('AC-008: a title alone is enough; a collection cannot go in', async () => {
    await fx.startEnrico();
    const id = createCollection({ title: 'Linsen-Abend', recipeIds: [] });
    expect(recipeById(id)?.kind).toBe('collection');
    expect(() =>
      createCollection({ title: 'Doppelt', recipeIds: [byTitle('Grillabend').id] }),
    ).toThrow('Eine Sammlung enthält nur Rezepte');
  });
});
