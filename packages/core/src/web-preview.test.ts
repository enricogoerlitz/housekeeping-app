import { describe, expect, it } from 'vitest';

import { newIngredientRow, type IngredientRow } from './recipe-editor';
import { articlesById } from './test-fixtures';
import { pastedLink, previewIngredients, searchStatusLine } from './web-preview';

// Spec 0049: the parts of the Websuche the window shows besides the cards.

const row = (patch: Partial<IngredientRow>): IngredientRow => ({ ...newIngredientRow('k'), ...patch });

describe('previewIngredients (REQ-003)', () => {
  it('AC-010: "✓ Zwiebel" for an article of the household, "neu: Paniermehl" for the rest', () => {
    expect(
      previewIngredients(
        [
          row({ name: 'Möhren', amountText: '2', article: { kind: 'article', articleId: 'art-moehren' } }),
          row({ name: 'Paniermehl', amountText: '50 g', article: { kind: 'new', name: 'Paniermehl' } }),
          row({ name: 'Salz', amountText: '', article: { kind: 'article', articleId: 'art-salz' } }),
        ],
        articlesById,
      ),
    ).toEqual([
      { label: '✓ 2 Möhren', known: true },
      { label: 'neu: 50 g Paniermehl', known: false },
      { label: '✓ Salz', known: true },
    ]);
  });
});

describe('pastedLink (AC-002)', () => {
  it('a link alone in the search field is handed over, words around it are a search', () => {
    expect(pastedLink(' https://www.chefkoch.de/rezepte/1/a.html ')).toBe(
      'https://www.chefkoch.de/rezepte/1/a.html',
    );
    expect(pastedLink('chefkoch.de/rezepte/1/a.html')).toBe('https://chefkoch.de/rezepte/1/a.html');
    expect(pastedLink('Bolognese wie auf https://a.de/x')).toBeUndefined();
    expect(pastedLink('Bolognese')).toBeUndefined();
  });
});

describe('searchStatusLine (AC-005)', () => {
  it('names where the search looks', () => {
    expect(searchStatusLine('recipe')).toBe('Suche bei Chefkoch und anderen Rezeptseiten …');
    expect(searchStatusLine('restaurant')).toBe('Suche bei Google Maps …');
    expect(searchStatusLine('activity')).toBe('Suche bei Google Maps …');
  });
});
