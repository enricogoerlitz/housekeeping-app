// Spec 0037, REQ-007: "Auf die Liste" for N people — the pantry check counts the amounts anew.
import { describe, expect, it } from 'vitest';

import { withBackend } from './backend-test-helpers';
import { applySection, createRecipe } from './commands-recipes';
import { pantryCheckRows, pantryRecipeFor } from './commands-shopping';
import { commit, getData } from './store';
import { addIngredientRows, newIngredientRow, sectionDraft } from '@housekeeping/core';

const fx = withBackend();

function apfelkuchen(): string {
  const recipeId = createRecipe({ title: 'Apfelkuchen', servings: 2 });
  const recipe = getData().recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) throw new Error('recipe missing');
  const article = (name: string) => {
    const found = getData().articles.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`article ${name} missing`);
    return { kind: 'article' as const, articleId: found.id };
  };
  const draft = addIngredientRows(sectionDraft(recipe, 'ingredients'), [
    {
      ...newIngredientRow('mehl'),
      amountText: '200 g',
      article: article('Mehl'),
      shoppingRule: 'recipeAmount',
    },
    { ...newIngredientRow('salz'), amountText: '', article: article('Salz') },
  ]);
  commit({ path: 'diff' }, () => applySection(recipeId, draft));
  return recipeId;
}

describe('pantryRecipeFor (spec 0037, REQ-007)', () => {
  it('AC-020: 200 g Mehl for 2 become 400 g for 4', async () => {
    await fx.startEnrico();
    const recipeId = apfelkuchen();
    await fx.settle();
    const mehl = (portions: number) =>
      pantryCheckRows([], [pantryRecipeFor({ recipeId, portions: 2 }, portions)]).find(
        (row) => row.name === 'Mehl',
      )?.amount;
    expect(mehl(2)).toBe('200 g');
    expect(mehl(4)).toBe('400 g');
  });

  it('AC-021: an ingredient without amount gets none: it stays as it is for 2 and for 4', async () => {
    await fx.startEnrico();
    const recipeId = apfelkuchen();
    await fx.settle();
    const salz = (portions: number) =>
      pantryCheckRows([], [pantryRecipeFor({ recipeId, portions: 2 }, portions)]).find(
        (row) => row.name === 'Salz',
      )?.amount;
    expect(salz(4)).toBe(salz(2));
    expect(salz(4)).not.toMatch(/g|ml/);
  });

  it('the portions of the shown variant follow; at least 1 person', () => {
    const recipe = { recipeId: 'r', portions: 2, variants: [{ variantId: 'v', portions: 2 }] };
    expect(pantryRecipeFor(recipe, 6)).toEqual({
      recipeId: 'r',
      portions: 6,
      variants: [{ variantId: 'v', portions: 6 }],
    });
    expect(pantryRecipeFor({ recipeId: 'r', portions: 2 }, 0)).toEqual({
      recipeId: 'r',
      portions: 1,
    });
  });
});
