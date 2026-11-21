import { describe, expect, it } from 'vitest';

import {
  chooseVariant,
  defaultVariantId,
  ingredientsForVariant,
  shownVariantId,
} from './recipe-variants';
import type { Recipe } from './types';
import { bolognese, mangoCurry } from './test-fixtures';

describe('recipe variants', () => {
  it('takes the variant marked as default, else the first, none without variants', () => {
    expect(defaultVariantId(mangoCurry)).toBe('v-tofu');
    const swapped = {
      ...mangoCurry,
      variants: mangoCurry.variants.map((variant) => ({
        ...variant,
        isDefault: variant.id === 'v-haehnchen',
      })),
    };
    expect(defaultVariantId(swapped)).toBe('v-haehnchen');
    const unmarked = {
      ...mangoCurry,
      variants: mangoCurry.variants.map((variant) => ({ ...variant, isDefault: false })),
    };
    expect(defaultVariantId(unmarked)).toBe('v-tofu');
    expect(defaultVariantId(bolognese)).toBeUndefined();
  });

  it('AC-020: "mit Hähnchen" lists Hähnchenbrust instead of Räuchertofu', () => {
    const names = ingredientsForVariant(mangoCurry, 'v-haehnchen').map((i) => i.articleId);
    expect(names).toContain('art-haehnchen');
    expect(names).not.toContain('art-tofu');
    expect(names).toContain('art-kokosmilch');
  });

  it('uses the default variant when none is given and all ingredients without variants', () => {
    const names = ingredientsForVariant(mangoCurry).map((i) => i.articleId);
    expect(names).toContain('art-tofu');
    expect(names).not.toContain('art-haehnchen');
    expect(ingredientsForVariant(bolognese)).toEqual(bolognese.ingredients);
  });

  describe('the variant shown on the recipe page (AC-033)', () => {
    const withGarnelen: Recipe = {
      ...mangoCurry,
      variants: [
        { id: 'v-tofu', name: 'mit Tofu', isDefault: false },
        { id: 'v-haehnchen', name: 'mit Hähnchen', isDefault: false },
        { id: 'v-garnelen', name: 'mit Garnelen', isDefault: true },
      ],
    };

    it('starts with the default variant and keeps a chosen one', () => {
      const choice = chooseVariant(mangoCurry);
      expect(shownVariantId(mangoCurry, choice)).toBe('v-tofu');
      const chosen = chooseVariant(mangoCurry, 'v-haehnchen');
      expect(shownVariantId(mangoCurry, chosen)).toBe('v-haehnchen');
      expect(shownVariantId({ ...mangoCurry, title: 'Curry' }, chosen)).toBe('v-haehnchen');
    });

    it('AC-033: after a new default ("Als Standard", "Fertig") the new default is preselected', () => {
      expect(shownVariantId(withGarnelen, chooseVariant(mangoCurry))).toBe('v-garnelen');
      expect(shownVariantId(withGarnelen, chooseVariant(mangoCurry, 'v-haehnchen'))).toBe(
        'v-garnelen',
      );
    });

    it('AC-033: when the chosen variant is removed, the default is shown', () => {
      const withoutHaehnchen: Recipe = {
        ...mangoCurry,
        variants: mangoCurry.variants.filter((variant) => variant.id !== 'v-haehnchen'),
      };
      expect(shownVariantId(withoutHaehnchen, chooseVariant(mangoCurry, 'v-haehnchen'))).toBe(
        'v-tofu',
      );
    });

    it('none without variants, also after the last one is removed', () => {
      expect(shownVariantId(bolognese, chooseVariant(bolognese))).toBeUndefined();
      expect(
        shownVariantId({ ...mangoCurry, variants: [] }, chooseVariant(mangoCurry, 'v-tofu')),
      ).toBeUndefined();
    });
  });
});
