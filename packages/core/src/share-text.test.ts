import { describe, expect, it } from 'vitest';

import {
  activityShareText,
  collectionShareText,
  recipeShareText,
  restaurantShareText,
} from './share-text';
import { collectionContents } from './collections';
import { makeRecipe } from './test-fixtures';
import type { Activity, CollectionRecipe, Restaurant } from './types';

const ARTICLES: Record<string, string> = {
  mehl: 'Mehl',
  aepfel: 'Äpfel',
  butter: 'Butter',
  zimt: 'Zimt',
  hafer: 'Haferdrink',
};
const articleName = (id: string) => ARTICLES[id] ?? '';
const APP = 'https://house.example.de';

const apfelkuchen = makeRecipe({
  id: 'r1',
  title: 'Apfelkuchen',
  servings: 2,
  description: 'Schnell und saftig.',
  ingredients: [
    {
      id: 'i1',
      articleId: 'mehl',
      amount: { text: '200 g', qty: 200, unit: 'g' },
      shoppingRule: 'count',
    },
    {
      id: 'i2',
      articleId: 'aepfel',
      amount: { text: '3', qty: 3 },
      shoppingRule: 'count',
      prepNote: 'in Spalten',
    },
    {
      id: 'i3',
      articleId: 'butter',
      amount: { text: '100 g', qty: 100, unit: 'g' },
      shoppingRule: 'count',
      group: 'Streusel',
    },
    { id: 'i4', articleId: 'zimt', shoppingRule: 'skip', group: 'Streusel' },
  ],
  steps: [
    { id: 's1', text: 'Teig kneten.' },
    { id: 's2', text: 'Äpfel darauf, Streusel drüber, 40 Minuten backen.' },
  ],
  links: [
    { url: 'https://chefkoch.de/apfelkuchen', label: 'Original' },
    { url: 'https://youtu.be/x' },
  ],
});

describe('recipeShareText (spec 0042, REQ-004)', () => {
  it('AC-008: title, "2 Portionen", every ingredient with its amount, the steps and the links', () => {
    expect(recipeShareText({ recipe: apfelkuchen, articleName, appUrl: `${APP}/rezept/r1` })).toBe(
      [
        'Apfelkuchen',
        '2 Portionen',
        '',
        'Schnell und saftig.',
        '',
        'Zutaten',
        '- 200 g Mehl',
        '- 3 Äpfel · in Spalten',
        'Streusel:',
        '- 100 g Butter',
        '- Zimt',
        '',
        'Zubereitung',
        '1. Teig kneten.',
        '2. Äpfel darauf, Streusel drüber, 40 Minuten backen.',
        '',
        'Links',
        '- Original: https://chefkoch.de/apfelkuchen',
        '- https://youtu.be/x',
        '',
        'In der App: https://house.example.de/rezept/r1',
      ].join('\n'),
    );
  });

  it('AC-008: the portions shown scale the amounts; 1 Portion in the singular', () => {
    const text = recipeShareText({ recipe: apfelkuchen, articleName, servings: 1 });
    expect(text).toContain('1 Portion\n');
    expect(text).toContain('- 100 g Mehl');
    expect(text).not.toContain('In der App');
  });

  it('AC-008: with variants the chosen one is named and only its ingredients and steps go', () => {
    const recipe = makeRecipe({
      id: 'r2',
      title: 'Porridge',
      servings: 1,
      variants: [
        { id: 'v1', name: 'Klassisch', isDefault: true },
        { id: 'v2', name: 'Vegan', isDefault: false },
      ],
      ingredients: [
        {
          id: 'i1',
          articleId: 'butter',
          variantId: 'v1',
          amount: { text: '10 g', qty: 10, unit: 'g' },
          shoppingRule: 'count',
        },
        {
          id: 'i2',
          articleId: 'hafer',
          variantId: 'v2',
          amount: { text: '200 ml', qty: 200, unit: 'ml' },
          shoppingRule: 'count',
        },
      ],
      steps: [
        { id: 's1', text: 'Aufkochen.' },
        { id: 's2', text: 'Butter einrühren.', variantId: 'v1' },
      ],
    });
    const vegan = recipeShareText({ recipe, articleName, variantId: 'v2' });
    expect(vegan).toContain('1 Portion · Vegan');
    expect(vegan).toContain('- 200 ml Haferdrink');
    expect(vegan).not.toContain('Butter');
    expect(recipeShareText({ recipe, articleName })).toContain('1 Portion · Klassisch');
  });

  it('a recipe with nothing but a title is only the title and its portions', () => {
    expect(
      recipeShareText({
        recipe: makeRecipe({ id: 'r3', title: 'Toast', servings: 4 }),
        articleName,
      }),
    ).toBe('Toast\n4 Portionen');
  });
});

describe('collectionShareText (spec 0042, REQ-004)', () => {
  it('REQ-004: title, portions, the contained recipes, the own ingredients and the app link', () => {
    const grillabend = makeRecipe({
      id: 'c1',
      kind: 'collection',
      title: 'Grillabend',
      servings: 6,
      ingredients: [
        {
          id: 'i1',
          articleId: 'butter',
          amount: { text: '250 g', qty: 250, unit: 'g' },
          shoppingRule: 'count',
        },
      ],
    });
    const salat = makeRecipe({ id: 'r9', title: 'Kartoffelsalat', servings: 4 });
    const rows: CollectionRecipe[] = [
      { id: 'cr1', collectionId: 'c1', recipeId: 'r9', sort: 0 },
      { id: 'cr2', collectionId: 'c1', recipeId: 'r1', servings: 8, sort: 1 },
    ];
    expect(
      collectionShareText({
        collection: grillabend,
        contents: collectionContents(grillabend, rows, { r9: salat, r1: apfelkuchen }),
        articleName,
        appUrl: `${APP}/rezept/c1`,
      }),
    ).toBe(
      [
        'Grillabend',
        '6 Portionen',
        '',
        'Enthält',
        '- Kartoffelsalat · 6 Port. (wie Sammlung)',
        '- Apfelkuchen · 8 Port.',
        '',
        'Dazu',
        '- 250 g Butter',
        '',
        'In der App: https://house.example.de/rezept/c1',
      ].join('\n'),
    );
  });
});

const restaurant = (partial: Partial<Restaurant>): Restaurant => ({
  id: 'x1',
  name: 'AMRIT',
  tags: [],
  favoriteOf: [],
  ratings: {},
  createdAt: '2026-11-20T10:00:00Z',
  ...partial,
});

describe('restaurantShareText (spec 0042, REQ-004)', () => {
  it('AC-009: name, address, map link and website', () => {
    expect(
      restaurantShareText(
        restaurant({
          cuisine: 'Indisch',
          address: 'Oranienburger Str. 45, 10117 Berlin',
          mapsUrl: 'https://maps.app.goo.gl/amrit',
          websiteUrl: 'https://amrit.de',
        }),
        `${APP}/restaurant/x1`,
      ),
    ).toBe(
      [
        'AMRIT',
        'Indisch',
        'Oranienburger Str. 45, 10117 Berlin',
        'Karte: https://maps.app.goo.gl/amrit',
        'Webseite: https://amrit.de',
        '',
        'In der App: https://house.example.de/restaurant/x1',
      ].join('\n'),
    );
  });

  it('AC-009: a restaurant with only its name is its name', () => {
    expect(restaurantShareText(restaurant({}))).toBe('AMRIT');
  });
});

describe('activityShareText (spec 0042, REQ-004)', () => {
  it('REQ-004: name, description, place, address, map link, website and the app link', () => {
    const activity: Activity = {
      id: 'a1',
      name: 'Eislaufen',
      description: 'Schlittschuhe gibt es vor Ort.',
      placeName: 'Eisstadion Hohenschönhausen',
      address: 'Steffenstr., 13053 Berlin',
      mapsUrl: 'https://maps.app.goo.gl/eis',
      websiteUrl: 'https://eisstadion.de',
      favoriteOf: [],
      ratings: {},
      remembered: false,
      createdAt: '2026-11-20T10:00:00Z',
    };
    expect(activityShareText(activity, `${APP}/aktivitaet/a1`)).toBe(
      [
        'Eislaufen',
        'Schlittschuhe gibt es vor Ort.',
        'Eisstadion Hohenschönhausen',
        'Steffenstr., 13053 Berlin',
        'Karte: https://maps.app.goo.gl/eis',
        'Webseite: https://eisstadion.de',
        '',
        'In der App: https://house.example.de/aktivitaet/a1',
      ].join('\n'),
    );
  });
});
