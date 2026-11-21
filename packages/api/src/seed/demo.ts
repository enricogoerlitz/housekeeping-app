import {
  addContribution,
  addDays,
  contributionsFromEntry,
  findArticleByName,
  isoWeekday,
  normalizeText,
  parseISODate,
  parseIngredientLine,
  splitVariants,
  toISODate,
  weekdayShort,
  type Activity,
  type Area,
  type Article,
  type Chore,
  type ChoreEvent,
  type FeedbackEntry,
  type Id,
  type ISODate,
  type MealPlanEntry,
  type Member,
  type Recipe,
  type Restaurant,
  type ShoppingItem,
  type Store,
} from '@housekeeping/core';

import { starterAreas } from '../starter/areas';
import { starterCatalog } from '../starter/catalog';
import type { AreaKey, SeedRecipe } from '../starter/types';
import type { AppState, HouseholdData } from '../store';
import { seedRecipes } from './recipes-data';

// The sample households "Enrico & Nadja" and "Test": the source of the local seed
// (`pnpm db:seed:gen`, seed-sql.ts) and of the fake server in tests. Everything is relative to
// "today", so the current week is always filled.

export const DEMO_HOUSEHOLD_ID = 'hh-demo';
export const TEST_HOUSEHOLD_ID = 'hh-test';
export const ENRICO = 'm-enrico';
export const NADJA = 'm-nadja';
export const SLOT_MORNING = 'slot-vormittag';
export const SLOT_LUNCH = 'slot-mittag';
export const SLOT_DINNER = 'slot-abend';

/** Vormittag, Mittag, Abend (spec 0004, AC-001), as create_household sets them up. */
const mealSlots = () => [
  { id: SLOT_MORNING, name: 'Vormittag', sort: 0 },
  { id: SLOT_LUNCH, name: 'Mittag', sort: 1 },
  { id: SLOT_DINNER, name: 'Abend', sort: 2 },
];

const members: Member[] = [
  {
    id: ENRICO,
    name: 'Enrico',
    color: '#3E6C8E',
    dietPreference: 'flexible',
    dislikes: ['Rosenkohl'],
  },
  {
    id: NADJA,
    name: 'Nadja',
    color: '#A8456B',
    dietPreference: 'vegetarian',
    dislikes: ['Koriander'],
  },
];

function slug(text: string): string {
  return normalizeText(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const areaId = (key: AreaKey): Id => `area-${key}`;

function buildAreas(): Area[] {
  return starterAreas.map((area, index) => ({
    id: areaId(area.key),
    name: area.name,
    sort: index,
  }));
}

/** The starter catalog as household articles, created with the household. */
function buildArticles(createdAt: string): Article[] {
  return starterCatalog.map((entry) => ({
    id: `art-${slug(entry.name)}`,
    name: entry.name,
    synonyms: entry.synonyms ?? [],
    areaId: areaId(entry.area),
    diet: entry.diet,
    isPantry: entry.pantry ?? false,
    needsReview: false,
    createdAt,
  }));
}

/**
 * Turns the compact authoring format into a full recipe. Every ingredient names an article of
 * `articles` (the database refuses anything else, spec 0007); a missing one throws.
 */
export function buildRecipe(seed: SeedRecipe, articles: Article[], createdAt: string): Recipe {
  const articleIdOf = (name: string): string => {
    const article = findArticleByName(name, articles);
    if (!article) throw new Error(`Seed recipe "${seed.key}": no article "${name}"`);
    return article.id;
  };
  const variants = (seed.variants ?? []).map((name, index) => ({
    id: `${seed.key}-v${index + 1}`,
    name,
    isDefault: index === 0,
  }));
  const variantIdByName = new Map(variants.map((variant) => [variant.name, variant.id]));
  return {
    id: `rec-${seed.key}`,
    title: seed.title,
    photo: seed.photo,
    description: seed.description,
    servings: seed.servings,
    totalMinutes: seed.totalMinutes,
    course: seed.course,
    cuisine: seed.cuisine,
    tags: seed.tags,
    variants,
    ingredients: seed.ingredients.map((ingredient, index) => ({
      id: `${seed.key}-i${index + 1}`,
      articleId: articleIdOf(ingredient.article),
      amount: ingredient.amount
        ? (parseIngredientLine(`${ingredient.amount} ${ingredient.article}`)?.amount ?? {
            text: ingredient.amount,
          })
        : undefined,
      variantId: ingredient.variant ? variantIdByName.get(ingredient.variant) : undefined,
      shoppingRule: ingredient.rule ?? 'count',
      shoppingNote: ingredient.note,
      group: ingredient.group,
    })),
    steps: seed.steps.map((step, index) => ({
      id: `${seed.key}-s${index + 1}`,
      text: step.text,
      variantId: step.variant ? variantIdByName.get(step.variant) : undefined,
      timerMinutes: step.timerMinutes,
    })),
    leadTime: seed.leadTime,
    favoriteOf: [],
    ratings: {},
    cookedCount: 0,
    createdAt,
    source: 'Starter',
  };
}

function buildStores(): Store[] {
  const order = (keys: AreaKey[]) => keys.map(areaId);
  const allKeys = starterAreas.map((area) => area.key);
  const dmVisible: AreaKey[] = ['drogerie', 'haushalt', 'suesses', 'tierbedarf'];
  return [
    {
      id: 'store-rewe',
      name: 'Rewe Südstadt',
      areaOrder: order([
        'obst-gemuese',
        'brot',
        'kuehlregal',
        'kaese',
        'fleisch',
        'fisch',
        'nudeln-reis',
        'konserven',
        'backen',
        'gewuerze-oel',
        'fruehstueck',
        'suesses',
        'getraenke',
        'kaffee-tee',
        'tiefkuehl',
        'drogerie',
        'haushalt',
      ]),
      hiddenAreaIds: order(['tierbedarf']),
    },
    {
      id: 'store-dm',
      name: 'dm Drogerie',
      areaOrder: order(dmVisible),
      hiddenAreaIds: order(
        allKeys.filter((key) => !dmVisible.includes(key) && key !== 'sonstiges'),
      ),
    },
  ];
}

/** Personal history of the demo household: favourites, ratings, when something was last cooked. */
function personalise(recipes: Recipe[], today: ISODate): Recipe[] {
  const favourites: Record<string, Id[]> = {
    'mango-curry': [ENRICO, NADJA],
    lasagne: [ENRICO, NADJA],
    shakshuka: [NADJA],
    'halloumi-pfanne': [NADJA],
    'spaghetti-bolognese': [ENRICO],
    'linsen-dal': [NADJA],
    pfannkuchen: [ENRICO],
  };
  const ratings: Record<string, Record<Id, number>> = {
    'mango-curry': { [ENRICO]: 5, [NADJA]: 4 },
    lasagne: { [ENRICO]: 5, [NADJA]: 5 },
    shakshuka: { [ENRICO]: 4, [NADJA]: 5 },
    'halloumi-pfanne': { [NADJA]: 5 },
    'spaghetti-bolognese': { [ENRICO]: 4 },
    'linsen-dal': { [ENRICO]: 3, [NADJA]: 4 },
  };
  return recipes.map((recipe, index) => {
    const key = recipe.id.replace(/^rec-/, '');
    // Every fourth recipe has never been cooked, the rest at staggered distances in the past.
    const cooked = index % 4 !== 3;
    return {
      ...recipe,
      favoriteOf: favourites[key] ?? [],
      ratings: ratings[key] ?? {},
      lastCookedOn: cooked ? addDays(today, -(7 + index * 4)) : undefined,
      cookedCount: cooked ? 1 + ((index * 3) % 7) : 0,
      createdAt: `${addDays(today, -(40 + index * 3))}T12:00:00.000Z`,
      notes: key === 'mango-curry' ? 'Beim nächsten Mal mehr Limette.' : undefined,
    };
  });
}

function buildDemoData(today: ISODate): HouseholdData {
  const areas = buildAreas();
  // "Geschenkpapier" has no area yet, so the list shows "Ohne Bereich" (spec 0001, AC-033).
  const createdAt = `${addDays(today, -40)}T12:00:00.000Z`;
  const articles = buildArticles(createdAt).map((article) =>
    article.name === 'Geschenkpapier' ? { ...article, areaId: undefined } : article,
  );
  const articlesById: Record<Id, Article> = Object.fromEntries(
    articles.map((article) => [article.id, article]),
  );
  const baseRecipes = personalise(
    seedRecipes.map((seed) => buildRecipe(seed, articles, createdAt)),
    today,
  );
  const yesterday = addDays(today, -1);
  const recipes = baseRecipes.map((recipe) =>
    recipe.id === 'rec-mango-curry'
      ? { ...recipe, lastCookedOn: yesterday, cookedCount: 9 }
      : recipe,
  );
  const recipeByKey = (key: string): Recipe => {
    const recipe = recipes.find((candidate) => candidate.id === `rec-${key}`);
    if (!recipe) throw new Error(`Seed recipe "${key}" is missing`);
    return recipe;
  };

  let entryCounter = 0;
  const planned = (
    offset: number,
    slotId: Id,
    key: string,
    options: { eaters?: Member[]; cookId?: Id; portions?: number } = {},
  ): MealPlanEntry => {
    entryCounter += 1;
    const recipe = recipeByKey(key);
    const eaters = options.eaters ?? members;
    const split = splitVariants(recipe, eaters, 0, articlesById);
    return {
      id: `plan-${entryCounter}`,
      date: addDays(today, offset),
      slotId,
      kind: 'recipe',
      recipeId: recipe.id,
      eaterIds: eaters.map((member) => member.id),
      guests: 0,
      portions: options.portions ?? split.portions,
      variants: split.variants,
      cookId: options.cookId,
      sort: 0,
    };
  };

  const enricoOnly = members.filter((member) => member.id === ENRICO);
  const curryYesterday = planned(-1, SLOT_DINNER, 'mango-curry', { cookId: NADJA });
  const lasagneToday = planned(0, SLOT_DINNER, 'lasagne', { cookId: ENRICO });
  const planEntries: MealPlanEntry[] = [
    planned(-6, SLOT_DINNER, 'penne-arrabbiata', { cookId: ENRICO }),
    planned(-5, SLOT_DINNER, 'spaghetti-bolognese', { eaters: enricoOnly, cookId: ENRICO }),
    planned(-4, SLOT_DINNER, 'linsen-dal', { cookId: NADJA }),
    planned(-3, SLOT_DINNER, 'halloumi-pfanne', { cookId: NADJA }),
    planned(-2, SLOT_DINNER, 'shakshuka', { cookId: ENRICO }),
    curryYesterday,
    {
      id: 'plan-reste',
      date: today,
      slotId: SLOT_LUNCH,
      kind: 'leftovers',
      recipeId: curryYesterday.recipeId,
      leftoversOfEntryId: curryYesterday.id,
      eaterIds: [ENRICO, NADJA],
      guests: 0,
      portions: 2,
      variants: [],
      sort: 0,
    },
    lasagneToday,
    planned(1, SLOT_DINNER, 'kichererbsen-eintopf', { cookId: NADJA }),
    // Planned but not yet on a shopping list (AC-031).
    planned(2, SLOT_DINNER, 'mango-curry', { cookId: ENRICO }),
    // today + 3 has no meal on purpose (AC-024); only Bouldern in the morning (spec 0004).
    planned(4, SLOT_DINNER, 'pizza-margherita', { cookId: ENRICO }),
  ];

  // ---------- Shopping ----------
  const now = `${today}T08:00:00.000Z`;
  const articleIdByName = (name: string): Id => {
    const article = findArticleByName(name, articles);
    if (!article) throw new Error(`Seed article "${name}" is missing from the starter catalog`);
    return article.id;
  };
  let items: ShoppingItem[] = [];
  let itemCounter = 0;
  const nextItemId = () => {
    itemCounter += 1;
    return `item-${itemCounter}`;
  };
  for (const contribution of contributionsFromEntry(
    lasagneToday,
    recipeByKey('lasagne'),
    articlesById,
    weekdayShort(today),
  )) {
    if (!contribution.articleId || contribution.isPantry) continue;
    items = addContribution(
      items,
      contribution.articleId,
      {
        id: `contrib-${items.length + 1}-l`,
        source: {
          kind: 'recipe',
          recipeId: contribution.recipeId,
          entryId: contribution.entryId,
          label: contribution.label,
        },
        count: contribution.count,
        qty: contribution.qty,
        unit: contribution.unit,
      },
      nextItemId(),
      now,
    );
  }
  const manual = (name: string, amount: { count?: number; qty?: number; unit?: string } = {}) => {
    items = addContribution(
      items,
      articleIdByName(name),
      { id: `contrib-m-${slug(name)}`, source: { kind: 'manual' }, ...amount },
      nextItemId(),
      now,
    );
  };
  manual('Milch', { count: 1 });
  manual('Möhren', { qty: 500, unit: 'g' });
  manual('Geschenkpapier');
  items = addContribution(
    items,
    articleIdByName('Bananen'),
    { id: 'contrib-r-bananen', source: { kind: 'recurring' } },
    nextItemId(),
    now,
  );
  for (const name of ['Brot', 'Butter']) {
    const id = nextItemId();
    items = [
      ...items,
      {
        id,
        articleId: articleIdByName(name),
        contributions: [{ id: `contrib-c-${slug(name)}`, source: { kind: 'manual' }, count: 1 }],
        checked: true,
        checkedAt: now,
        checkedBy: NADJA,
        createdAt: now,
      },
    ];
  }
  for (const name of ['Zahnpasta', 'Duschgel']) {
    items = addContribution(
      items,
      articleIdByName(name),
      { id: `contrib-d-${slug(name)}`, source: { kind: 'manual' }, count: 1 },
      nextItemId(),
      now,
    );
  }

  // ---------- Chores ----------
  const weekdayIn = (offset: number) => isoWeekday(addDays(today, offset));
  const firstOfNextMonth = (() => {
    const date = parseISODate(today);
    return toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 1, 12));
  })();
  const chores: Chore[] = [
    {
      id: 'chore-bad',
      title: 'Bad putzen',
      room: 'Bad',
      recurrence: { type: 'weekly', every: 1, weekdays: [weekdayIn(0)] },
      assignment: { type: 'fixed', memberId: ENRICO },
      effort: 2,
      nextDueOn: today,
      nextAssigneeId: ENRICO,
      lastDoneOn: addDays(today, -7),
    },
    {
      id: 'chore-fenster',
      title: 'Fenster Wohnzimmer',
      room: 'Wohnzimmer',
      recurrence: { type: 'everyMonths', every: 2 },
      assignment: { type: 'fixed', memberId: NADJA },
      effort: 3,
      nextDueOn: addDays(today, -2),
      nextAssigneeId: NADJA,
      lastDoneOn: addDays(today, -63),
    },
    {
      id: 'chore-bettwaesche',
      title: 'Bettwäsche wechseln',
      room: 'Schlafzimmer',
      recurrence: { type: 'flexible', everyDays: 14 },
      assignment: { type: 'rotating', memberIds: [ENRICO, NADJA] },
      effort: 2,
      nextAssigneeId: ENRICO,
      lastDoneOn: addDays(today, -11),
      nextDueOn: addDays(today, 3),
    },
    {
      id: 'chore-pflanzen',
      title: 'Pflanzen gießen',
      recurrence: { type: 'flexible', everyDays: 7 },
      assignment: { type: 'anyone' },
      effort: 1,
      lastDoneOn: addDays(today, -2),
      nextDueOn: addDays(today, 5),
    },
    {
      id: 'chore-kueche',
      title: 'Küche wischen',
      room: 'Küche',
      recurrence: { type: 'weekly', every: 1, weekdays: [weekdayIn(1)] },
      assignment: { type: 'fixed', memberId: NADJA },
      effort: 2,
      nextDueOn: addDays(today, 1),
      nextAssigneeId: NADJA,
      lastDoneOn: addDays(today, -6),
    },
    {
      id: 'chore-muell',
      title: 'Müll rausbringen',
      recurrence: { type: 'weekly', every: 1, weekdays: [weekdayIn(2)] },
      assignment: { type: 'rotating', memberIds: [ENRICO, NADJA] },
      effort: 1,
      nextDueOn: addDays(today, 2),
      nextAssigneeId: NADJA,
      lastDoneOn: addDays(today, -5),
    },
    {
      id: 'chore-kuehlschrank',
      title: 'Kühlschrank auswischen',
      room: 'Küche',
      recurrence: { type: 'monthly', day: 1 },
      assignment: { type: 'fixed', memberId: ENRICO },
      effort: 2,
      nextDueOn: firstOfNextMonth,
      nextAssigneeId: ENRICO,
    },
    {
      id: 'chore-matratze',
      title: 'Matratze drehen',
      room: 'Schlafzimmer',
      recurrence: { type: 'everyMonths', every: 6 },
      assignment: { type: 'together' },
      effort: 2,
      nextDueOn: addDays(today, 40),
    },
    {
      id: 'chore-balkon',
      title: 'Balkon gießen',
      room: 'Balkon',
      recurrence: { type: 'flexible', everyDays: 3 },
      assignment: { type: 'anyone' },
      effort: 1,
      activeMonths: [4, 5, 6, 7, 8, 9],
      lastDoneOn: addDays(today, -60),
    },
    {
      id: 'chore-gluehbirne',
      title: 'Glühbirne Flur tauschen',
      room: 'Flur',
      recurrence: { type: 'once' },
      assignment: { type: 'anyone' },
      effort: 1,
    },
  ];
  const choreEvents: ChoreEvent[] = [
    {
      id: 'ev-1',
      choreId: 'chore-pflanzen',
      title: 'Pflanzen gießen',
      kind: 'done',
      doneOn: addDays(today, -2),
      doneBy: NADJA,
    },
    {
      id: 'ev-3',
      choreId: 'chore-muell',
      title: 'Müll rausbringen',
      kind: 'done',
      doneOn: addDays(today, -5),
      doneBy: ENRICO,
    },
    {
      id: 'ev-4',
      choreId: 'chore-kueche',
      title: 'Küche wischen',
      kind: 'done',
      doneOn: addDays(today, -6),
      doneBy: NADJA,
    },
    {
      id: 'ev-5',
      choreId: 'chore-bad',
      title: 'Bad putzen',
      kind: 'done',
      doneOn: addDays(today, -7),
      doneBy: ENRICO,
    },
    {
      id: 'ev-2',
      choreId: 'chore-pflanzen',
      title: 'Pflanzen gießen',
      kind: 'done',
      doneOn: addDays(today, -9),
      doneBy: ENRICO,
    },
    {
      id: 'ev-6',
      choreId: 'chore-bettwaesche',
      title: 'Bettwäsche wechseln',
      kind: 'done',
      doneOn: addDays(today, -11),
      doneBy: NADJA,
    },
  ];

  const feedback: FeedbackEntry[] = [
    {
      id: 'fb-1',
      kind: 'idea',
      text: 'Im Kochmodus die Zutaten des aktuellen Schritts größer anzeigen.',
      status: 'accepted',
      authorId: NADJA,
      createdAt: `${addDays(today, -4)}T18:20:00.000Z`,
      votes: [ENRICO],
      screen: 'Kochmodus',
    },
    {
      id: 'fb-2',
      kind: 'problem',
      text: 'Die Liste springt nach dem Abhaken manchmal nach oben.',
      status: 'done',
      authorId: ENRICO,
      createdAt: `${addDays(today, -9)}T10:05:00.000Z`,
      votes: [],
      screen: 'Liste',
      specRef: '0005',
    },
    {
      id: 'fb-3',
      kind: 'idea',
      text: 'Rezepte nach Saison vorschlagen.',
      status: 'new',
      authorId: NADJA,
      createdAt: `${addDays(today, -1)}T20:40:00.000Z`,
      votes: [],
      screen: 'Rezepte',
    },
  ];

  // ---------- Restaurants ----------
  const restaurant = (id: string, name: string, extra: Partial<Restaurant>): Restaurant => ({
    id,
    name,
    tags: [],
    favoriteOf: [],
    ratings: {},
    createdAt,
    ...extra,
  });
  const restaurants: Restaurant[] = [
    restaurant('rest-enzo', 'Trattoria Da Enzo', {
      cuisine: 'Italienisch',
      address: 'Severinstraße 12, Köln',
      location: { lat: 50.9271, lng: 6.958 },
      priceLevel: 2,
      tags: ['pasta', 'gemütlich'],
      favoriteOf: [ENRICO, NADJA],
      ratings: { [ENRICO]: 5, [NADJA]: 4 },
      notes: 'Trüffelpasta! Am Wochenende reservieren.',
      mapsUrl: 'https://www.google.com/maps/place/Trattoria+Da+Enzo/@50.9271,6.9580,17z',
    }),
    restaurant('rest-pho', 'Pho Saigon', {
      cuisine: 'Vietnamesisch',
      address: 'Zülpicher Straße 30, Köln',
      location: { lat: 50.9301, lng: 6.9381 },
      priceLevel: 1,
      tags: ['schnell', 'vegetarisch gut'],
      favoriteOf: [NADJA],
      ratings: { [NADJA]: 5, [ENRICO]: 4 },
      mapsUrl: 'https://maps.apple.com/?q=Pho+Saigon&ll=50.9301,6.9381',
    }),
    restaurant('rest-burger', 'Brooklyn Burger Bar', {
      cuisine: 'Burger',
      address: 'Aachener Straße 50, Köln',
      location: { lat: 50.9378, lng: 6.9302 },
      priceLevel: 2,
      tags: ['vegane burger'],
      ratings: { [ENRICO]: 4 },
    }),
    restaurant('rest-sushi', 'Sushi Kyoto', {
      cuisine: 'Japanisch',
      priceLevel: 3,
      tags: ['besonderer anlass'],
    }),
  ];
  const visit = (offset: number, restaurantId: string, id: string): MealPlanEntry => ({
    id,
    date: addDays(today, offset),
    slotId: SLOT_DINNER,
    kind: 'restaurant',
    restaurantId,
    eaterIds: [ENRICO, NADJA],
    guests: 0,
    portions: 2,
    variants: [],
    sort: 0,
  });
  planEntries.push(
    visit(-12, 'rest-pho', 'plan-pho-1'),
    visit(-33, 'rest-pho', 'plan-pho-2'),
    visit(-61, 'rest-pho', 'plan-pho-3'),
    visit(-19, 'rest-enzo', 'plan-enzo-1'),
    visit(5, 'rest-enzo', 'plan-enzo-2'),
  );

  // ---------- Activities (spec 0004) ----------
  const activity = (id: string, name: string, extra: Partial<Activity>): Activity => ({
    id,
    name,
    tags: [],
    favoriteOf: [],
    ratings: {},
    createdBy: ENRICO,
    createdAt,
    ...extra,
  });
  // Bouldern has no ratings and favourites yet (AC-020 starts from there).
  const activities: Activity[] = [
    activity('act-bouldern', 'Bouldern', {
      description: 'In der Boulderhalle, Schuhe gibt es zum Ausleihen.',
    }),
    activity('act-eislaufen', 'Eislaufen', {
      description: 'Öffentlicher Lauf, Schlittschuhe gibt es zum Ausleihen.',
      placeName: 'Eisstadion Hohenschönhausen',
      location: { lat: 52.55, lng: 13.5 },
      mapsUrl: 'https://www.google.com/maps/place/Eisstadion+Hohensch%C3%B6nhausen/@52.55,13.5,17z',
      favoriteOf: [NADJA],
      ratings: { [ENRICO]: 5, [NADJA]: 4 },
    }),
    activity('act-spieleabend', 'Spieleabend', {
      description: 'Brettspiele zu Hause, gern mit Freunden.',
      favoriteOf: [ENRICO],
      ratings: { [ENRICO]: 4 },
      createdBy: NADJA,
    }),
  ];
  const outing = (
    offset: number,
    activityId: string,
    id: string,
    note?: string,
  ): MealPlanEntry => ({
    id,
    date: addDays(today, offset),
    slotId: SLOT_MORNING,
    kind: 'activity',
    activityId,
    note,
    eaterIds: [ENRICO, NADJA],
    guests: 0,
    portions: 2,
    variants: [],
    sort: 0,
  });
  planEntries.push(
    // AC-016: "Zuletzt: vor 12 Tagen · 3-mal", and planned again in 3 days.
    outing(-12, 'act-bouldern', 'plan-bouldern-1'),
    outing(-30, 'act-bouldern', 'plan-bouldern-2'),
    outing(-45, 'act-bouldern', 'plan-bouldern-3'),
    outing(3, 'act-bouldern', 'plan-bouldern-4'),
    // AC-019: today in the morning, with a Zusatz.
    outing(0, 'act-eislaufen', 'plan-eislaufen-1', 'Hohenschönhausen'),
  );

  return {
    household: {
      id: DEMO_HOUSEHOLD_ID,
      name: 'Enrico & Nadja',
      memberIds: [ENRICO, NADJA],
      mealSlots: mealSlots(),
      defaultStoreId: 'store-rewe',
    },
    areas,
    articles,
    stores: buildStores(),
    recipes,
    restaurants,
    activities,
    planEntries,
    items,
    chores,
    choreEvents,
    absences: [],
    feedback,
  };
}

/** An empty household: shows the empty states, with the starter catalog already available. */
function buildTestData(today: ISODate): HouseholdData {
  return {
    household: {
      id: TEST_HOUSEHOLD_ID,
      name: 'Test',
      memberIds: [ENRICO, NADJA],
      mealSlots: mealSlots(),
    },
    areas: buildAreas(),
    articles: buildArticles(`${addDays(today, -40)}T12:00:00.000Z`),
    stores: [],
    recipes: [],
    restaurants: [],
    activities: [],
    planEntries: [],
    items: [],
    chores: [],
    choreEvents: [],
    absences: [],
    feedback: [],
  };
}

export function createInitialState(today: ISODate): AppState {
  return {
    today,
    members,
    currentMemberId: ENRICO,
    activeHouseholdId: DEMO_HOUSEHOLD_ID,
    households: {
      [DEMO_HOUSEHOLD_ID]: buildDemoData(today),
      [TEST_HOUSEHOLD_ID]: buildTestData(today),
    },
    offline: false,
  };
}
