import { describe, expect, it } from 'vitest';

import type { SuggestionInput } from './plan-suggestions';
import { makeRecipe } from './test-fixtures';
import type {
  Article,
  Diet,
  Id,
  MealPlanEntry,
  MealSlot,
  Member,
  Recipe,
  RecipeIngredient,
  Trip,
} from './types';
import { fillWeek, fillWeekLabel, type WeekFillWishes } from './week-fill';

// Spec 0067, REQ-014: "Füll die Woche: 2× vegetarisch, Mittwoch wenig Zeit, Samstag Gäste" with
// the suggestion logic of spec 0063. Today is Friday, 27.11.2026, 12:00; the week is 30.11.–6.12.

const TODAY = '2026-11-27';
const EVENING = 'slot-evening';
const slots: MealSlot[] = [
  { id: 'slot-morning', name: 'Frühstück', sort: 0 },
  { id: 'slot-noon', name: 'Mittagessen', sort: 1 },
  { id: EVENING, name: 'Abendessen', sort: 2 },
];
const member = (id: Id, name: string): Member => ({
  id,
  name,
  color: '#000',
  dietPreference: 'flexible',
  dislikes: [],
});
const enrico = member('m-enrico', 'Enrico');
const nadja = member('m-nadja', 'Nadja');

function article(id: Id, name: string, diet: Diet): Article {
  return { id, name, synonyms: [], diet, isPantry: false, needsReview: false, createdAt: '' };
}
const ARTICLES = [
  article('spaghetti', 'Spaghetti', 'vegan'),
  article('reis', 'Basmatireis', 'vegan'),
  article('kartoffeln', 'Kartoffeln', 'vegan'),
  article('baguette', 'Baguette', 'vegan'),
  article('linsen', 'Rote Linsen', 'vegan'),
  article('zucchini', 'Zucchini', 'vegan'),
  article('eier', 'Eier', 'vegetarian'),
  article('huhn', 'Hähnchenbrust', 'meat'),
  article('rind', 'Rinderhack', 'meat'),
];
const articlesById: Record<Id, Article> = Object.fromEntries(ARTICLES.map((a) => [a.id, a]));

let seq = 0;
const ing = (articleId: Id): RecipeIngredient => {
  seq += 1;
  return { id: `i-${seq}`, articleId, shoppingRule: 'count' };
};
const dish = (id: Id, articleIds: Id[], minutes: number): Recipe =>
  makeRecipe({
    id,
    title: id,
    totalMinutes: minutes,
    ingredients: articleIds.map(ing),
  });

/** Eight meat dishes of 45 minutes, one quick meat dish, three vegetarian ones. */
const RECIPES: Recipe[] = [
  dish('m-spaghetti', ['spaghetti', 'rind'], 45),
  dish('m-reis', ['reis', 'huhn'], 45),
  dish('m-kartoffeln', ['kartoffeln', 'rind'], 45),
  dish('m-baguette', ['baguette', 'huhn'], 45),
  dish('m-linsen', ['linsen', 'rind'], 45),
  dish('m-spaghetti-2', ['spaghetti', 'huhn'], 50),
  dish('m-reis-2', ['reis', 'rind'], 55),
  dish('m-kartoffeln-2', ['kartoffeln', 'huhn'], 60),
  dish('m-schnell', ['huhn'], 20),
  dish('v-zucchini', ['zucchini', 'reis'], 40),
  dish('v-linsen', ['linsen'], 40),
  dish('v-ei', ['eier', 'kartoffeln'], 40),
];

const restaurantThursday: MealPlanEntry = {
  id: 'e-thu',
  date: '2026-12-03',
  slotId: EVENING,
  kind: 'restaurant',
  restaurantId: 'rest-1',
  eaterIds: [enrico.id, nadja.id],
  guests: 0,
  portions: 2,
  variants: [],
  sort: 0,
};

function input(rest: Partial<SuggestionInput> = {}): SuggestionInput {
  const recipes = rest.recipes ?? RECIPES;
  return {
    recipes,
    entries: [restaurantThursday],
    members: [enrico, nadja],
    articlesById,
    book: {
      recipesById: Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe])),
      collectionRecipes: [],
    },
    slots,
    today: TODAY,
    now: '12:00',
    householdId: 'h-1',
    ...rest,
  };
}

const trip = (from: string, to: string, ids: Id[]): Trip => ({
  id: `t-${from}`,
  from,
  to,
  members: ids.map((memberId) => ({ id: `tm-${memberId}`, memberId })),
});
const TRIPS = [trip('2026-12-06', '2026-12-08', [enrico.id, nadja.id])];

const WISHES: WeekFillWishes = {
  from: '2026-11-30',
  to: '2026-12-06',
  vegetarian: 2,
  quick: ['2026-12-02'],
  guests: [{ date: '2026-12-05', count: 2 }],
};

const VEGETARIAN = new Set(['v-zucchini', 'v-linsen', 'v-ei']);

describe('fillWeek (REQ-014)', () => {
  it('AC-REQ-014: trips and occupied evenings are checked by the code, the rest is filled', () => {
    const result = fillWeek(input(), TRIPS, WISHES);
    expect(result.slotId).toBe(EVENING);
    expect(result.rows.map((row) => row.date)).toEqual([
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-04',
      '2026-12-05',
    ]);
    expect(result.skipped).toEqual([
      { date: '2026-12-03', reason: 'schon belegt' },
      { date: '2026-12-06', reason: 'alle verreist' },
    ]);
  });

  it('AC-REQ-014: at least two vegetarian dishes, a quick one on Wednesday, guests on Saturday', () => {
    const { rows } = fillWeek(input(), TRIPS, WISHES);
    expect(rows.filter((row) => VEGETARIAN.has(row.suggestion.recipe.id)).length).toBeGreaterThan(
      1,
    );
    const wednesday = rows.find((row) => row.date === '2026-12-02')!;
    expect(wednesday.suggestion.recipe.totalMinutes).toBeLessThanOrEqual(30);
    expect(wednesday.notes).toContain('wenig Zeit');
    const saturday = rows.find((row) => row.date === '2026-12-05')!;
    expect(saturday.guests).toBe(2);
    expect(saturday.notes).toContain('2 Gäste');
    expect(rows.filter((row) => row.date !== '2026-12-05').every((row) => row.guests === 0)).toBe(
      true,
    );
    expect(new Set(rows.map((row) => row.suggestion.recipe.id)).size).toBe(rows.length);
  });

  it('a vorgemerkt dish moves rather than doubles, but never onto the guests evening', () => {
    const later: MealPlanEntry = { ...restaurantThursday, id: 'e-later', date: null } as never;
    const vorgemerkt: MealPlanEntry = {
      ...later,
      kind: 'recipe',
      restaurantId: undefined,
      recipeId: 'v-linsen',
    };
    const { rows } = fillWeek(input({ entries: [restaurantThursday, vorgemerkt] }), TRIPS, WISHES);
    const moved = rows.find((row) => row.suggestion.recipe.id === 'v-linsen');
    expect(moved?.suggestion.plannedLaterEntryId).toBe('e-later');
    expect(moved?.date).not.toBe('2026-12-05');
  });

  it('a member away on a trip is named, the whole household still eats (spec 0063, decision 1)', () => {
    const { rows } = fillWeek(
      input(),
      [...TRIPS, trip('2026-12-01', '2026-12-01', [nadja.id])],
      WISHES,
    );
    expect(rows.find((row) => row.date === '2026-12-01')?.notes).toContain('Nadja ist weg');
  });

  it('days to leave free, past days and a range over a week are the code’s, not the model’s', () => {
    const result = fillWeek(input(), [], {
      from: '2026-11-26',
      to: '2026-12-31',
      skip: ['2026-11-30'],
      quick: [],
      guests: [],
    });
    expect(result.rows[0]?.date).toBe('2026-11-27');
    expect(result.rows.every((row) => row.date <= '2026-12-03')).toBe(true);
    expect(result.skipped).toContainEqual({ date: '2026-11-30', reason: 'frei gelassen' });
    expect(result.skipped).not.toContainEqual(expect.objectContaining({ date: '2026-11-26' }));
  });

  it('the same data give the same week (REQ-003 of spec 0063)', () => {
    const one = fillWeek(input(), TRIPS, WISHES);
    const two = fillWeek(input({ recipes: [...RECIPES].reverse() }), TRIPS, WISHES);
    expect(two.rows.map((row) => [row.date, row.suggestion.recipe.id])).toEqual(
      one.rows.map((row) => [row.date, row.suggestion.recipe.id]),
    );
  });

  it('too few fitting recipes: nothing is planned and the card says why', () => {
    const result = fillWeek(input({ recipes: RECIPES.slice(0, 2) }), TRIPS, WISHES);
    expect(result.rows).toEqual([]);
    expect(result.empty).toBe('Zu wenig passende Rezepte für diese Woche');
  });

  it('an unknown Tageszeit falls back to the last one; no evening free says so', () => {
    const full = ['2026-11-30', '2026-12-01'].map((date, index) => ({
      ...restaurantThursday,
      id: `full-${index}`,
      date,
    }));
    const result = fillWeek(input({ entries: full }), [], {
      from: '2026-11-30',
      to: '2026-12-01',
      slot: 'Mitternachtssnack',
    });
    expect(result.slotId).toBe(EVENING);
    expect(result.rows).toEqual([]);
    expect(result.empty).toBe('An diesen Tagen ist kein Abendessen frei');
  });

  it('fillWeekLabel: "5 Abende einplanen", "1 Abend einplanen"', () => {
    expect(fillWeekLabel(5)).toBe('5 Abende einplanen');
    expect(fillWeekLabel(1)).toBe('1 Abend einplanen');
  });
});
