import { describe, expect, it } from 'vitest';

import { cookingIngredients, cookingServings, servingsLabel } from './cooking';
import { makeRecipe } from './test-fixtures';

// Spec 0018, REQ-002 (E-02): the cooking mode uses the portions chosen when it opens.

const lasagne = makeRecipe({
  id: 'rec-lasagne',
  title: 'Lasagne',
  servings: 4,
  variants: [
    { id: 'v-classic', name: 'klassisch', isDefault: true },
    { id: 'v-veggie', name: 'vegetarisch', isDefault: false },
  ],
  ingredients: [
    {
      id: 'l-linsen',
      articleId: 'art-linsen',
      shoppingRule: 'recipeAmount',
      amount: { text: '150 g', qty: 150, unit: 'g' },
    },
    {
      id: 'l-hack',
      articleId: 'art-hack',
      shoppingRule: 'recipeAmount',
      variantId: 'v-classic',
      amount: { text: '500 g', qty: 500, unit: 'g' },
    },
    {
      id: 'l-zucchini',
      articleId: 'art-zucchini',
      shoppingRule: 'count',
      variantId: 'v-veggie',
      amount: { text: '2', qty: 2 },
    },
    { id: 'l-salz', articleId: 'art-salz', shoppingRule: 'count' },
  ],
});

const amounts = (servings: number, variantId?: string) =>
  cookingIngredients(lasagne, variantId, servings).map((ingredient) => [
    ingredient.id,
    ingredient.amount?.text,
  ]);

describe('cooking mode portions (spec 0018, REQ-002)', () => {
  it('AC-004: 6 of 4 portions show 225 g Linsen, and the mode names "6 Portionen"', () => {
    expect(cookingServings('6', lasagne)).toBe(6);
    expect(amounts(6)).toEqual([
      ['l-linsen', '225 g'],
      ['l-hack', '750 g'],
      ['l-salz', undefined],
    ]);
    expect(servingsLabel(6)).toBe('6 Portionen');
    expect(servingsLabel(1)).toBe('1 Portion');
  });

  it('any other portion count scales the same way: 8 portions show 300 g Linsen and name "8 Portionen"', () => {
    expect(amounts(cookingServings('8', lasagne))[0]).toEqual(['l-linsen', '300 g']);
    expect(servingsLabel(8)).toBe('8 Portionen');
  });

  it('AC-006: variant and portions apply together', () => {
    expect(amounts(6, 'v-veggie')).toEqual([
      ['l-linsen', '225 g'],
      ['l-zucchini', '3'],
      ['l-salz', undefined],
    ]);
  });

  it('negative: without or with an invalid address value the recipe’s own portions count', () => {
    for (const value of [undefined, '', '0', '-2', '2.5', 'abc', '6x', '1e3']) {
      expect(cookingServings(value, lasagne), String(value)).toBe(4);
    }
    // A repeated parameter: the first one counts, as for routeId.
    expect(cookingServings(['6', '8'], lasagne)).toBe(6);
    expect(amounts(4)[0]).toEqual(['l-linsen', '150 g']);
  });
});
