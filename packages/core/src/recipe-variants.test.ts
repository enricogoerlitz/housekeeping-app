import { describe, expect, it } from 'vitest';

import { defaultVariantId, ingredientsForVariant } from './recipe-variants';
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
    const names = ingredientsForVariant(mangoCurry, 'v-haehnchen').map((i) => i.name);
    expect(names).toContain('Hähnchenbrust');
    expect(names).not.toContain('Räuchertofu');
    expect(names).toContain('Kokosmilch');
  });

  it('uses the default variant when none is given and all ingredients without variants', () => {
    const names = ingredientsForVariant(mangoCurry).map((i) => i.name);
    expect(names).toContain('Räuchertofu');
    expect(names).not.toContain('Hähnchenbrust');
    expect(ingredientsForVariant(bolognese)).toEqual(bolognese.ingredients);
  });
});
