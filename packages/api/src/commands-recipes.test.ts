import { sortRecipes } from '@housekeeping/core';
import { describe, expect, it, vi } from 'vitest';

import { addIngredientsFromText, createRecipe } from './commands-recipes';
import { getData } from './store';
import { articleName, recipeById as recipe, withDemoHousehold } from './test-helpers';

withDemoHousehold();

describe('recipe commands', () => {
  it('AC-021: a new recipe with a title comes first when sorted by "Neu"; no title fails', () => {
    vi.setSystemTime(new Date(2026, 10, 20, 11, 0));
    const id = createRecipe({ title: '  Linsen-Curry  ' });
    expect(sortRecipes(getData().recipes, 'new')[0]).toMatchObject({ id, title: 'Linsen-Curry' });
    expect(() => createRecipe({ title: ' ' })).toThrow('Titel fehlt');
  });

  it('AC-022: a pasted block becomes three ingredients linked to articles', () => {
    const id = createRecipe({ title: 'Test' });
    expect(addIngredientsFromText(id, '200 ml Kokosmilch\n1 Mango\n1 Prise Salz')).toBe(3);
    const rows = recipe(id).ingredients.map((ingredient) => [
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
