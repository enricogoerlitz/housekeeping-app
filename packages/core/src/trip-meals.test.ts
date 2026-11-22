import { describe, expect, it } from 'vitest';

import { articlesById, enrico, makeRecipe, mangoCurry, nadja } from './test-fixtures';
import {
  recomputeEntryContributions,
  tripMealLine,
  tripMealOffers,
  tripMealsDoneText,
  tripMealsTitle,
  withoutTravellers,
} from './trip-meals';
import type { MealPlanEntry, MealSlot, ShoppingItem } from './types';

const today = '2026-11-22';
const slots: MealSlot[] = [
  { id: 'vormittag', name: 'Vormittag', sort: 0 },
  { id: 'mittag', name: 'Mittag', sort: 1 },
  { id: 'abend', name: 'Abend', sort: 2 },
];
const members = [enrico, nadja];

function entry(
  partial: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id' | 'date'>,
): MealPlanEntry {
  return {
    slotId: 'abend',
    kind: 'recipe',
    eaterIds: [enrico.id, nadja.id],
    guests: 0,
    portions: 2,
    variants: [],
    sort: 0,
    ...partial,
  };
}

const lasagneRecipe = makeRecipe({
  id: 'rec-lasagne',
  title: 'Lasagne',
  servings: 2,
  ingredients: [
    {
      id: 'l-hack',
      articleId: 'art-hack',
      amount: { text: '250 g', qty: 250, unit: 'g' },
      shoppingRule: 'recipeAmount',
    },
  ],
});
const lasagne = entry({
  id: 'lasagne',
  date: '2026-11-30',
  recipeId: lasagneRecipe.id,
  cookId: enrico.id,
});
const curry = entry({
  id: 'curry',
  date: '2026-12-01',
  recipeId: mangoCurry.id,
  variants: [
    { variantId: 'v-haehnchen', portions: 1 },
    { variantId: 'v-tofu', portions: 1 },
  ],
});
const shakshuka = entry({
  id: 'shakshuka',
  date: '2026-12-02',
  slotId: 'mittag',
  kind: 'text',
  text: 'Shakshuka',
  eaterIds: [enrico.id],
  portions: 1,
});
const eislaufen = entry({
  id: 'eis',
  date: '2026-12-02',
  slotId: 'vormittag',
  kind: 'activity',
  eaterIds: [enrico.id, nadja.id],
});
const hamburg = { from: '2026-11-30', to: '2026-12-02', memberIds: [enrico.id] };

describe('the dishes in the period (REQ-007, REQ-008)', () => {
  it('AC-021: three dishes of Enrico, the last one parks; never an activity', () => {
    const offers = tripMealOffers({
      trip: hamburg,
      entries: [shakshuka, eislaufen, curry, lasagne],
      slots,
      today,
    });
    expect(offers.map((offer) => [offer.entry.id, offer.memberIds, offer.parks])).toEqual([
      ['lasagne', [enrico.id], false],
      ['curry', [enrico.id], false],
      ['shakshuka', [enrico.id], true],
    ]);
    expect(tripMealsTitle(offers, members)).toBe('3 Gerichte im Zeitraum – Enrico rausnehmen?');
    expect(
      offers.map((offer, index) =>
        tripMealLine(
          offer,
          ['Abend', 'Abend', 'Mittag'][index] ?? '',
          ['Lasagne', 'Mango-Curry', 'Shakshuka'][index] ?? '',
        ),
      ),
    ).toEqual([
      'Mo 30.11. · Abend · Lasagne',
      'Di 1.12. · Abend · Mango-Curry',
      'Mi 2.12. · Mittag · Shakshuka · danach vorgemerkt',
    ]);
    expect(tripMealsDoneText(offers, members)).toBe('Enrico aus 3 Gerichten genommen');
  });

  it('AC-023: "Urlaub Mallorca" names both; a restaurant with guests does not park', () => {
    const trattoria = entry({
      id: 'trattoria',
      date: '2026-12-04',
      kind: 'restaurant',
      restaurantId: 'r1',
      guests: 2,
    });
    const offers = tripMealOffers({
      trip: { from: '2026-12-04', to: '2026-12-10', memberIds: [enrico.id, nadja.id] },
      entries: [entry({ ...lasagne, date: '2026-12-05' }), trattoria],
      slots,
      today,
    });
    expect(tripMealsTitle(offers, members)).toBe(
      '2 Gerichte im Zeitraum – Enrico und Nadja rausnehmen?',
    );
    expect(offers.map((offer) => offer.parks)).toEqual([false, true]);
    const [first] = offers;
    expect(first?.entry.id).toBe('trattoria');
  });

  it('AC-024: only from today on, only where she eats', () => {
    const offers = tripMealOffers({
      trip: { from: '2026-11-20', to: '2026-11-24', memberIds: [nadja.id] },
      entries: [
        entry({ id: 'curry-sa', date: '2026-11-21', eaterIds: [nadja.id] }),
        entry({ id: 'lasagne-mo', date: '2026-11-23' }),
        entry({ id: 'shakshuka-di', date: '2026-11-24', eaterIds: [enrico.id] }),
      ],
      slots,
      today,
    });
    expect(offers.map((offer) => offer.entry.id)).toEqual(['lasagne-mo']);
  });

  it('AC-026: shortening or removing people offers nothing', () => {
    expect(
      tripMealOffers({
        trip: { ...hamburg, to: '2026-12-01' },
        before: hamburg,
        entries: [lasagne, curry, shakshuka],
        slots,
        today,
      }),
    ).toEqual([]);
    expect(
      tripMealOffers({
        trip: { ...hamburg, memberIds: [] },
        before: hamburg,
        entries: [lasagne],
        slots,
        today,
      }),
    ).toEqual([]);
  });

  it('AC-027: extending to Do 3.12. offers only "Lasagne" of that day', () => {
    const offers = tripMealOffers({
      trip: { ...hamburg, to: '2026-12-03' },
      before: hamburg,
      entries: [lasagne, curry, entry({ id: 'lasagne-do', date: '2026-12-03' })],
      slots,
      today,
    });
    expect(offers.map((offer) => offer.entry.id)).toEqual(['lasagne-do']);
    expect(tripMealsTitle(offers, members)).toBe('1 Gericht im Zeitraum – Enrico rausnehmen?');
  });
});

describe('taking travellers out of a dish', () => {
  it('AC-021: Lasagne keeps Nadja with 1 portion, nobody cooks', () => {
    expect(
      withoutTravellers({
        entry: lasagne,
        memberIds: [enrico.id],
        recipe: lasagneRecipe,
        members,
        articlesById,
      }),
    ).toMatchObject({ eaterIds: [nadja.id], portions: 1, cookId: undefined, date: '2026-11-30' });
  });

  it('AC-021: Mango-Curry loses the chicken portion of Enrico, Tofu 1 stays', () => {
    expect(
      withoutTravellers({
        entry: curry,
        memberIds: [enrico.id],
        recipe: mangoCurry,
        members,
        articlesById,
      }),
    ).toMatchObject({
      eaterIds: [nadja.id],
      portions: 1,
      variants: [{ variantId: 'v-tofu', portions: 1 }],
    });
  });

  it('AC-021: Shakshuka is parked and keeps Enrico with 1 portion', () => {
    expect(
      withoutTravellers({ entry: shakshuka, memberIds: [enrico.id], members, articlesById }),
    ).toMatchObject({ date: null, eaterIds: [enrico.id], portions: 1 });
  });

  it('AC-023: the Trattoria keeps its 2 guests on 4.12. without eaters', () => {
    const trattoria = entry({ id: 't', date: '2026-12-04', kind: 'restaurant', guests: 2 });
    expect(
      withoutTravellers({
        entry: trattoria,
        memberIds: [enrico.id, nadja.id],
        members,
        articlesById,
      }),
    ).toMatchObject({ date: '2026-12-04', eaterIds: [], guests: 2 });
  });
});

describe('the shopping list follows (spec 0021, REQ-007)', () => {
  const hack: ShoppingItem = {
    id: 'item-hack',
    articleId: 'art-hack',
    checked: false,
    createdAt: '2026-11-20T10:00:00.000Z',
    contributions: [
      {
        id: 'c-hack',
        source: {
          kind: 'recipe',
          recipeId: lasagneRecipe.id,
          entryId: 'lasagne',
          label: 'Lasagne (Mo)',
        },
        qty: 250,
        unit: 'g',
      },
    ],
  };
  const eier: ShoppingItem = {
    id: 'item-eier',
    articleId: 'art-eier',
    checked: false,
    createdAt: '2026-11-20T10:00:00.000Z',
    contributions: [
      {
        id: 'c-eier',
        source: {
          kind: 'recipe',
          recipeId: 'rec-shakshuka',
          entryId: 'shakshuka',
          label: 'Shakshuka (Mi)',
        },
        count: 3,
      },
    ],
  };
  let counter = 0;
  const newId = () => `new-${++counter}`;
  const now = '2026-11-22T12:00:00.000Z';

  // 500 g for 4 portions, 1 portion: 125 g, bought as 130 g (spec 0025, REQ-008).
  it('AC-021: "Hackfleisch 130 g" with the same Herkunft and on the same item', () => {
    const next = recomputeEntryContributions({
      items: [hack, eier],
      entry: { ...lasagne, eaterIds: [nadja.id], portions: 1 },
      recipe: lasagneRecipe,
      articlesById,
      newId,
      now,
    });
    const item = next.find((candidate) => candidate.id === 'item-hack');
    expect(item?.contributions).toEqual([
      expect.objectContaining({
        qty: 130,
        unit: 'g',
        source: expect.objectContaining({ entryId: 'lasagne', label: 'Lasagne (Mo)' }),
      }),
    ]);
    expect(next.find((candidate) => candidate.id === 'item-eier')).toBe(eier);
  });

  it('AC-021: a parked dish takes its contributions away; "Eier" goes', () => {
    const next = recomputeEntryContributions({
      items: [hack, eier],
      entry: { ...shakshuka, date: null },
      articlesById,
      newId,
      now,
    });
    expect(next.map((item) => item.id)).toEqual(['item-hack']);
  });

  it('checked items stay, and nothing on the list means no change', () => {
    const checked = { ...hack, checked: true };
    expect(
      recomputeEntryContributions({
        items: [checked],
        entry: { ...lasagne, portions: 1 },
        recipe: lasagneRecipe,
        articlesById,
        newId,
        now,
      }),
    ).toEqual([checked]);
    expect(
      recomputeEntryContributions({
        items: [eier],
        entry: { ...lasagne, portions: 1 },
        recipe: lasagneRecipe,
        articlesById,
        newId,
        now,
      }),
    ).toEqual([eier]);
  });
});
