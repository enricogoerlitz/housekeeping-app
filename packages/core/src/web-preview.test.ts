import { describe, expect, it } from 'vitest';

import { newIngredientRow, type IngredientRow } from './recipe-editor';
import { articlesById } from './test-fixtures';
import {
  defaultWebPhotoChoice,
  effectiveWebPhotoChoice,
  pastedLink,
  previewIngredients,
  searchStatusLine,
} from './web-preview';

// Spec 0049: the parts of the Websuche the window shows besides the cards.

const row = (patch: Partial<IngredientRow>): IngredientRow => ({
  ...newIngredientRow('k'),
  ...patch,
});

describe('previewIngredients (REQ-003)', () => {
  it('AC-010: "✓ Zwiebel" for an article of the household, "neu: Paniermehl" for the rest', () => {
    expect(
      previewIngredients(
        [
          row({
            name: 'Möhren',
            amountText: '2',
            article: { kind: 'article', articleId: 'art-moehren' },
          }),
          row({
            name: 'Paniermehl',
            amountText: '50 g',
            article: { kind: 'new', name: 'Paniermehl' },
          }),
          row({
            name: 'Salz',
            amountText: '',
            article: { kind: 'article', articleId: 'art-salz' },
          }),
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

describe('previewIngredients with variants (KI-Testlauf 26.11.)', () => {
  it('AC-010: a row of a variant names it, so meat and veggie rows are not read as one list', () => {
    expect(
      previewIngredients(
        [
          row({
            name: 'Möhren',
            amountText: '2',
            article: { kind: 'article', articleId: 'art-moehren' },
          }),
          row({
            name: 'Veggie-Hack',
            amountText: '500 g',
            article: { kind: 'new', name: 'Veggie-Hack' },
            variantId: 'v-veg',
          }),
          row({ name: 'Tofu', amountText: '', variantId: 'v-gone' }),
        ],
        articlesById,
        [{ id: 'v-veg', name: 'Vegetarisch' }],
      ),
    ).toEqual([
      { label: '✓ 2 Möhren', known: true },
      { label: 'neu: 500 g Veggie-Hack · Vegetarisch', known: false },
      { label: 'neu: Tofu', known: false },
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

describe('the photo of a hit (REQ-010)', () => {
  it('AC-034: the source photo by default; AC-036: an image wish makes it "KI-Bild"', () => {
    expect(defaultWebPhotoChoice(true, undefined)).toBe('source');
    expect(defaultWebPhotoChoice(true, 'Frau in Boulderhalle')).toBe('ai');
    expect(defaultWebPhotoChoice(false, undefined)).toBe('ai');
  });

  it('AC-035: a hit whose photo did not load has only "Foto generieren" on or off', () => {
    expect(effectiveWebPhotoChoice('source', false)).toBe('ai');
    expect(effectiveWebPhotoChoice('none', false)).toBe('none');
    expect(effectiveWebPhotoChoice('source', true)).toBe('source');
  });
});
