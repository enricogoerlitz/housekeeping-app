// Spec 0023: one ingredient from the read view (REQ-002), links (REQ-009), duplicates on creating
// (REQ-006) and the deletion notice's count (REQ-012).
import {
  ingredientDrafts,
  ingredientRowOf,
  rowsFromIngredientDrafts,
  sectionDraft,
  type IngredientRow,
} from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { H, withBackend } from './backend-test-helpers';
import {
  createRecipeWithIngredients,
  deleteRecipe,
  removeRecipeIngredient,
  saveIngredient,
  saveRecipeSection,
} from './commands-recipes';
import { addPlanEntry } from './commands-plan';
import { ENRICO, NADJA, SLOT_DINNER } from './seed/demo';
import { starterCatalogEntries } from './starter/entries';
import { getData, OfflineError } from './store';
import { TransportError, type ChangeOp } from './transport';

const fx = withBackend();
const opsOf = (index: number) => (fx.calls[index]?.args[1] ?? []) as ChangeOp[];
const byTitle = (title: string) => {
  const recipe = getData().recipes.find((candidate) => candidate.title === title);
  if (!recipe) throw new Error(`recipe ${title} missing`);
  return recipe;
};
const recipeById = (id: string) => getData().recipes.find((recipe) => recipe.id === id);
const nameOf = (articleId: string) =>
  getData().articles.find((article) => article.id === articleId)?.name;

/** The row of Lasagne's "Rote Linsen". */
function linsen() {
  const lasagne = byTitle('Lasagne');
  const ingredient = lasagne.ingredients.find(
    (candidate) => nameOf(candidate.articleId) === 'Rote Linsen',
  );
  const row = ingredient && ingredientRowOf(lasagne, ingredient.id);
  if (!row || !ingredient) throw new Error('fixture: Linsen');
  return { lasagne, ingredient, row };
}

describe('REQ-002: "Zutat bearbeiten" from the read view', () => {
  it('AC-004: saves at once in one call; Nadja sees it; "Rückgängig" puts it back', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const { lasagne, ingredient, row } = linsen();
    const saved = saveIngredient(lasagne.id, { ...row, amountText: '200 g' });
    expect(recipeById(lasagne.id)?.ingredients.find((i) => i.id === ingredient.id)?.amount).toEqual(
      { text: '200 g', qty: 200, unit: 'g' },
    );
    await fx.settle(nadja);
    await expect(saved?.confirmed).resolves.toBeUndefined();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0)).toEqual([
      expect.objectContaining({ kind: 'patch', table: 'recipes', id: lasagne.id }),
    ]);
    const nadjaLasagne = fx.nadjaData(nadja).recipes.find((recipe) => recipe.id === lasagne.id);
    expect(nadjaLasagne?.ingredients.find((i) => i.id === ingredient.id)?.amount?.text).toBe(
      '200 g',
    );

    saved?.undo();
    await fx.settle();
    expect(recipeById(lasagne.id)?.ingredients).toEqual(lasagne.ingredients);
  });

  it('AC-006: a group chosen and undone: Linsen is without group again', async () => {
    await fx.startEnrico();
    const { lasagne, ingredient, row } = linsen();
    const saved = saveIngredient(lasagne.id, { ...row, group: 'Béchamel' });
    expect(recipeById(lasagne.id)?.ingredients.find((i) => i.id === ingredient.id)?.group).toBe(
      'Béchamel',
    );
    await fx.settle();
    saved?.undo();
    await fx.settle();
    expect(recipeById(lasagne.id)?.ingredients.find((i) => i.id === ingredient.id)?.group).toBe(
      ingredient.group,
    );
  });

  it('"Entfernen": gone at once, "Rückgängig" brings it back in its place', async () => {
    await fx.startEnrico();
    const { lasagne, ingredient } = linsen();
    const removed = removeRecipeIngredient(lasagne.id, ingredient.id);
    expect(recipeById(lasagne.id)?.ingredients.some((i) => i.id === ingredient.id)).toBe(false);
    await fx.settle();
    removed?.undo();
    await fx.settle();
    expect(recipeById(lasagne.id)?.ingredients.map((i) => i.id)).toEqual(
      lasagne.ingredients.map((i) => i.id),
    );
  });

  it('AC-004 (Fehler): the server refuses: the ingredient jumps back with the hint', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const { lasagne, row } = linsen();
    fx.server.failNext('apply_changes', new TransportError('permanent', 'boom', 400));
    const saved = saveIngredient(lasagne.id, { ...row, amountText: '200 g' });
    await fx.settle();
    await expect(saved?.confirmed).rejects.toBeDefined();
    expect(recipeById(lasagne.id)?.ingredients).toEqual(lasagne.ingredients);
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
  });

  it('AC-008 (Offline): nothing changes and nothing is sent', async () => {
    await fx.startEnrico();
    const { lasagne, row } = linsen();
    fx.environment.setOnline(false);
    expect(() => saveIngredient(lasagne.id, { ...row, amountText: '200 g' })).toThrow(OfflineError);
    expect(recipeById(lasagne.id)?.ingredients).toEqual(lasagne.ingredients);
    expect(fx.calls).toEqual([]);
  });

  it('a group over 60 characters is refused before anything changes', async () => {
    await fx.startEnrico();
    const { lasagne, row } = linsen();
    expect(() => saveIngredient(lasagne.id, { ...row, group: 'x'.repeat(61) })).toThrow(
      'Höchstens 60 Zeichen',
    );
    expect(fx.calls).toEqual([]);
  });
});

describe('REQ-009: links', () => {
  it('AC-032: a link is saved in one patch and reaches Nadja', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const lasagne = byTitle('Lasagne');
    const links = [{ url: 'https://chefkoch.de/r/1', label: 'Omas Variante' }];
    saveRecipeSection(lasagne.id, { ...sectionDraft(lasagne, 'links'), links });
    await fx.settle(nadja);
    expect(opsOf(0)).toEqual([
      { kind: 'patch', table: 'recipes', id: lasagne.id, changes: { links } },
    ]);
    expect(fx.nadjaData(nadja).recipes.find((recipe) => recipe.id === lasagne.id)?.links).toEqual(
      links,
    );
  });

  it('AC-034: eleven links are refused before sending', async () => {
    await fx.startEnrico();
    const lasagne = byTitle('Lasagne');
    const links = Array.from({ length: 11 }, (_, index) => ({ url: `https://a.de/${index}` }));
    expect(() =>
      saveRecipeSection(lasagne.id, { ...sectionDraft(lasagne, 'links'), links }),
    ).toThrow('Höchstens 10 Links');
    expect(fx.calls).toEqual([]);
  });
});

describe('REQ-006: duplicates when creating', () => {
  it('AC-021: "1 Zwiebel" and "2 Zwiebeln": one saved, the second opens as duplicate', async () => {
    await fx.startEnrico();
    let key = 0;
    const rows: IngredientRow[] = rowsFromIngredientDrafts(
      ingredientDrafts(
        '1 Zwiebel\n2 Zwiebeln',
        getData().articles,
        starterCatalogEntries,
        () => `paste-${++key}`,
      ),
    );
    const { recipeId, open } = createRecipeWithIngredients({ title: 'Zwiebelkuchen' }, rows);
    expect(recipeById(recipeId)?.ingredients.map((i) => i.amount?.text)).toEqual(['1']);
    expect(open.map((row) => [row.amountText, row.duplicate])).toEqual([['2', true]]);
  });
});

describe('REQ-012: the deletion counts the entries that go', () => {
  it('AC-049: two later entries go, the past one stays as free text', async () => {
    await fx.startEnrico();
    const recipe = byTitle('Halloumi-Pfanne');
    for (const date of ['2026-11-16', '2026-11-25', '2026-12-04']) {
      addPlanEntry({
        date,
        slotId: SLOT_DINNER,
        kind: 'recipe',
        recipeId: recipe.id,
        eaterIds: [ENRICO, NADJA],
      });
    }
    await fx.settle();
    const deletion = deleteRecipe(recipe.id);
    expect(deletion?.entries).toBe(2);
    await fx.settle();
    expect(fx.server.rows(H, 'recipes').some((row) => row.id === recipe.id)).toBe(false);
  });
});
