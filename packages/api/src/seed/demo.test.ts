import {
  absenceDays,
  addDays,
  normalizeText,
  orderedBags,
  recipeFitsPreference,
  searchArticles,
  summarizeItem,
  weekDates,
  type Diet,
} from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { indexById } from '../queries';
import { starterAreas } from '../starter/areas';
import { starterCatalog } from '../starter/catalog';
import { TODAY } from '../backend-test-helpers';
import {
  buildRecipe,
  createInitialState,
  DEMO_HOUSEHOLD_ID,
  NADJA,
  SLOT_MORNING,
  TEST_HOUSEHOLD_ID,
} from './demo';
import { seedRecipes } from './recipes-data';

const DIETS: Diet[] = ['vegan', 'vegetarian', 'fish', 'meat', 'unknown'];

// The sample households are the source of the local seed (`pnpm db:seed:gen`) and of the fake
// server in the command tests.
const state = createInitialState(TODAY);
const getState = () => state;
const getData = () => {
  const data = state.households[DEMO_HOUSEHOLD_ID];
  if (!data) throw new Error('sample household missing');
  return data;
};
const testHousehold = () => {
  const data = state.households[TEST_HOUSEHOLD_ID];
  if (!data) throw new Error('household "Test" missing');
  return data;
};

describe('sample household (AC-012)', () => {
  it('AC-012: "Enrico & Nadja" is active with Enrico flexible and Nadja vegetarian', () => {
    const state = getState();
    const data = getData();
    expect(state.today).toBe(TODAY);
    expect(data.household.name).toBe('Enrico & Nadja');
    const members = data.household.memberIds.map((id) =>
      state.members.find((member) => member.id === id),
    );
    expect(members.map((member) => [member?.name, member?.dietPreference])).toEqual([
      ['Enrico', 'flexible'],
      ['Nadja', 'vegetarian'],
    ]);
  });

  it('AC-012: has at least 20 recipes incl. Mango-Curry variants and a meat-only Bolognese', () => {
    const data = getData();
    const articlesById = indexById(data.articles);
    expect(data.recipes.length).toBeGreaterThanOrEqual(20);
    const curry = data.recipes.find((recipe) => recipe.title === 'Mango-Curry');
    expect(curry?.variants.map((variant) => variant.name)).toEqual(['mit Tofu', 'mit Hähnchen']);
    const bolognese = data.recipes.find((recipe) => recipe.title === 'Spaghetti Bolognese');
    if (!bolognese) throw new Error('Spaghetti Bolognese missing');
    expect(recipeFitsPreference(bolognese, 'vegetarian', articlesById)).toBe(false);
  });

  it('AC-012: plans the current week, fills the default list, has Rewe Südstadt and 8+ chores', () => {
    const data = getData();
    const week = weekDates(TODAY);
    const thisWeek = data.planEntries.filter(
      (entry) => entry.date !== null && week.includes(entry.date),
    );
    expect(thisWeek.length).toBeGreaterThanOrEqual(5);
    expect(data.items.filter((item) => !item.checked).length).toBeGreaterThan(0);
    expect(data.stores.map((store) => store.name)).toContain('Rewe Südstadt');
    expect(data.chores.length).toBeGreaterThanOrEqual(8);
  });

  it('spec 0007: every ingredient points to an article of the household and has no free-text name', () => {
    const articles = indexById(getData().articles);
    const unlinked = getData().recipes.flatMap((recipe) =>
      recipe.ingredients
        .filter((ingredient) => !articles[ingredient.articleId])
        .map((ingredient) => `${recipe.title}: ${ingredient.id}`),
    );
    expect(unlinked).toEqual([]);
    const withName = getData().recipes.flatMap((recipe) =>
      recipe.ingredients.filter((ingredient) => Object.hasOwn(ingredient, 'name')),
    );
    expect(withName).toEqual([]);
    expect(getData().recipes).toHaveLength(seedRecipes.length);
  });

  it('spec 0007 (plan point 9): buildRecipe refuses an ingredient without a catalog article', () => {
    const [seed] = seedRecipes;
    if (!seed) throw new Error('fixture');
    const broken = { ...seed, ingredients: [{ amount: '1', article: 'Drachenfrucht-Sirup' }] };
    expect(() => buildRecipe(broken, getData().articles, '2026-11-01T12:00:00.000Z')).toThrow(
      'Drachenfrucht-Sirup',
    );
  });

  it('gives every seeded shopping item a readable amount or source', () => {
    for (const item of getData().items) {
      const summary = summarizeItem(item);
      expect(summary.sources.length).toBeGreaterThan(0);
    }
  });
});

describe('the household "Test"', () => {
  it('AC-002 (spec 0002) / AC-005 (spec 0004): has no restaurants and no activities', () => {
    expect(testHousehold().restaurants).toEqual([]);
    expect(testHousehold().activities).toEqual([]);
  });

  it('AC-001 (spec 0004): both households have Vormittag, Mittag and Abend in this order', () => {
    for (const household of Object.values(getState().households)) {
      expect(
        [...household.household.mealSlots]
          .sort((a, b) => a.sort - b.sort)
          .map((slot) => [slot.id, slot.name]),
      ).toEqual([
        [SLOT_MORNING, 'Vormittag'],
        ['slot-mittag', 'Mittag'],
        ['slot-abend', 'Abend'],
      ]);
    }
  });
});

describe('starter catalog (AC-013)', () => {
  it('AC-013: has at least 250 articles, each with a known area and diet', () => {
    const areaKeys = new Set(starterAreas.map((area) => area.key));
    expect(starterCatalog.length).toBeGreaterThanOrEqual(250);
    const broken = starterCatalog.filter(
      (entry) => !areaKeys.has(entry.area) || !DIETS.includes(entry.diet),
    );
    expect(broken).toEqual([]);
    expect(
      getData()
        .articles.filter((a) => a.areaId === undefined)
        .map((a) => a.name),
    ).toEqual(['Geschenkpapier']);
  });

  it('keeps article ids unique, so every article is one database row (spec 0003, AC-033)', () => {
    const ids = getData().articles.map((article) => article.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });

  it('AC-013: "Karot" suggests Möhren, also known as Karotten', () => {
    const [first] = searchArticles('Karot', getData().articles);
    expect(first?.article.name).toBe('Möhren');
    expect(first?.matchedSynonym).toBe('Karotten');
  });

  it('keeps names and synonyms unique across the catalog', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const entry of starterCatalog) {
      for (const word of [entry.name, ...(entry.synonyms ?? [])]) {
        const key = normalizeText(word);
        const owner = seen.get(key);
        if (owner !== undefined && owner !== entry.name) clashes.push(`${word} (${owner})`);
        seen.set(key, entry.name);
      }
    }
    expect(clashes).toEqual([]);
  });
});

describe('spec 0012: Reisetaschen and the packing list of "Urlaub Mallorca"', () => {
  const bag = (name: string) => {
    const found = getData().packingBags.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`Reisetasche ${name} missing`);
    return found;
  };
  const itemsOf = (bagId: string) =>
    getData().packingBagItems.filter((item) => item.bagId === bagId);

  it('AC-001: Strand (12, with "T-Shirts · 1 je Tag"), Wintersport (18), Kulturbeutel (9, Nadja), Technik (6)', () => {
    expect(orderedBags(getData().packingBags).map((candidate) => candidate.name)).toEqual([
      'Strand',
      'Wintersport',
      'Kulturbeutel',
      'Technik',
    ]);
    expect(itemsOf(bag('Strand').id)).toHaveLength(12);
    expect(itemsOf(bag('Wintersport').id)).toHaveLength(18);
    expect(itemsOf(bag('Kulturbeutel').id)).toHaveLength(9);
    expect(itemsOf(bag('Technik').id)).toHaveLength(6);
    expect(bag('Kulturbeutel').memberId).toBe(NADJA);
    expect(itemsOf(bag('Strand').id).find((item) => item.name === 'T-Shirts')).toMatchObject({
      quantity: 1,
      perDay: true,
    });
    // AC-005: "Sonnencreme" is in Wintersport, not yet in Strand.
    expect(itemsOf(bag('Wintersport').id).some((item) => item.name === 'Sonnencreme')).toBe(true);
    expect(itemsOf(bag('Strand').id).some((item) => item.name === 'Sonnencreme')).toBe(false);
  });

  it('"Urlaub Mallorca" (whole household, in 12 days, 7 days) has Strand and Kulturbeutel, some packed', () => {
    const mallorca = getData().absences.find((absence) => absence.note === 'Urlaub Mallorca');
    if (!mallorca) throw new Error('Urlaub Mallorca missing');
    expect(mallorca.memberId).toBeUndefined();
    expect(mallorca.from).toBe(addDays(TODAY, 12));
    expect(absenceDays(mallorca.from, mallorca.to)).toBe(7);
    const listBags = getData().packingListBags.filter((lb) => lb.absenceId === mallorca.id);
    expect(listBags.map((lb) => [lb.name, lb.bagId, lb.memberId])).toEqual([
      ['Strand', bag('Strand').id, undefined],
      ['Kulturbeutel', bag('Kulturbeutel').id, NADJA],
    ]);
    const items = getData().packingItems.filter((item) =>
      listBags.some((lb) => lb.id === item.listBagId),
    );
    expect(items).toHaveLength(21);
    expect(items.find((item) => item.name === 'T-Shirts')).toMatchObject({
      quantity: 7,
      perDay: 1,
    });
    const packed = items.filter((item) => item.packed);
    expect(packed.length).toBeGreaterThan(0);
    expect(packed.every((item) => item.packSeq === 1 && item.packedBy && item.packedAt)).toBe(true);
    expect(items.filter((item) => !item.packed).every((item) => item.packSeq === 0)).toBe(true);
  });

  it('"Dienstreise Hamburg" (Nadja) has no packing list; the household "Test" has no bags (AC-002)', () => {
    const hamburg = getData().absences.find((absence) => absence.note === 'Dienstreise Hamburg');
    expect(hamburg?.memberId).toBe(NADJA);
    expect(getData().packingListBags.some((lb) => lb.absenceId === hamburg?.id)).toBe(false);
    expect(testHousehold().packingBags).toEqual([]);
    expect(testHousehold().absences).toEqual([]);
  });
});
