import { describe, expect, it } from 'vitest';

import { inheritedServingsHint, inheritedServingsPlaceholder } from './collection-editor';
import { collectionContentLabel, collectionContents } from './collections';
import { grillabend, grillabendRecipes, grillRecipesById } from './test-fixtures';

// Spec 0023, REQ-014: "wie Sammlung" instead of "übernimmt".

describe('"Enthält" names portions taken from the collection', () => {
  it('AC-058: "6 Port. (wie Sammlung)" or the own "8 Port.", never "übernimmt"', () => {
    const labels = collectionContents(grillabend, grillabendRecipes, grillRecipesById).map(
      collectionContentLabel,
    );
    expect(labels).toEqual(['Kartoffelsalat · 6 Port. (wie Sammlung)', 'Grillgemüse · 8 Port.']);
    expect(labels.join(' ')).not.toContain('übernimmt');
  });

  it('AC-058: the window "Portionen und Variante" says it the same way', () => {
    expect(inheritedServingsPlaceholder(6)).toBe('wie Sammlung (6)');
    expect(inheritedServingsHint(6)).toBe('Leer lassen: so viele Portionen wie die Sammlung (6)');
  });
});
