import { describe, expect, it } from 'vitest';

import { seriesOccurrences } from './activity-series';
import {
  AGENT_TOOL_NAMES,
  AGENT_TOOL_LIMITS,
  agentCallKey,
  agentToolParameters,
  parseToolCall,
  runTool,
  storedToolStep,
  toolLabel,
  toolReads,
  type ToolData,
  type ToolRow,
} from './agent-tools';
import { cookingHistory } from './cooking-history';
import { stepLine } from './ai-agent';
import type { ActivitySeries, ActivitySeriesException, MealPlanEntry } from './types';

// Spec 0067, REQ-007/REQ-008, AC-013–AC-016: the read tools of the household agent. The edge
// function reads the rows as the person (RLS) and hands them here; everything the model asks for
// is checked against allow-lists and only compared, never put into a query.

const TODAY = '2026-11-27';
const ENRICO = 'e0000000-0000-4000-8000-000000000001';
const NADJA = 'e0000000-0000-4000-8000-000000000002';
const SLOT_EVENING = 's0000000-0000-4000-8000-000000000003';
const SLOT_NOON = 's0000000-0000-4000-8000-000000000002';

const id = (prefix: string, n: number) =>
  `${prefix}${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`;

function base(rows: ToolData['rows']): ToolData {
  return {
    rows,
    today: TODAY,
    members: [
      { id: ENRICO, name: 'Enrico' },
      { id: NADJA, name: 'Nadja' },
    ],
    mealSlots: [
      { id: SLOT_NOON, name: 'Mittag', sort: 1 },
      { id: SLOT_EVENING, name: 'Abend', sort: 2 },
    ],
  };
}

const run = (name: string, args: unknown, data: ToolData) => {
  const call = parseToolCall(name, JSON.stringify(args));
  const result = runTool(call, data, 't1');
  return { ...result, json: JSON.parse(result.output) as Record<string, unknown> };
};

// ---------- A household of 143 recipes, 12 of them vegetarian ----------

const TOFU = 'a0000000-0000-4000-8000-000000000001';
const BEEF = 'a0000000-0000-4000-8000-000000000002';
const RICE = 'a0000000-0000-4000-8000-000000000003';

function recipeHousehold(): ToolData {
  const recipes: ToolRow[] = [];
  const entries: ToolRow[] = [];
  for (let n = 1; n <= 143; n += 1) {
    const vegetarian = n <= 12;
    recipes.push({
      id: id('r', n),
      kind: 'recipe',
      title: vegetarian ? `Gemüse ${n}` : `Fleisch ${n}`,
      course: 'main',
      cuisine: n % 2 === 0 ? 'Indisch' : 'Italienisch',
      tags: n === 3 ? ['schnell'] : [],
      total_minutes: 20 + n,
      servings: 2,
      last_cooked_on: null,
      cooked_count: 0,
      ingredients: [
        { id: `i${n}a`, articleId: vegetarian ? TOFU : BEEF, shoppingRule: 'always' },
        { id: `i${n}b`, articleId: RICE, shoppingRule: 'always' },
      ],
      variants: [],
      steps: [{ id: `st${n}`, text: 'Kochen' }],
      photo: null,
      photo_path: null,
      description: null,
      created_at: `2026-01-${String((n % 28) + 1).padStart(2, '0')}T10:00:00Z`,
    });
  }
  // Gemüse 1 cooked last week, Gemüse 2 long ago, Gemüse 3 never; Gemüse 4 is only planned ahead.
  entries.push(
    { kind: 'recipe', recipe_id: id('r', 1), date: '2026-11-20', not_done: false },
    { kind: 'recipe', recipe_id: id('r', 2), date: '2026-08-01', not_done: false },
    { kind: 'recipe', recipe_id: id('r', 4), date: '2026-12-02', not_done: false },
    { kind: 'recipe', recipe_id: id('r', 5), date: '2026-11-01', not_done: true },
  );
  for (let n = 5; n <= 12; n += 1)
    entries.push({
      kind: 'recipe',
      recipe_id: id('r', n),
      date: `2026-10-${String(n + 10).padStart(2, '0')}`,
      not_done: false,
    });
  return base({
    recipes,
    meal_plan_entries: entries,
    collection_recipes: [],
    recipe_ratings: [
      { recipe_id: id('r', 1), member_id: ENRICO, stars: 5 },
      { recipe_id: id('r', 1), member_id: NADJA, stars: 4 },
    ],
    recipe_favorites: [{ recipe_id: id('r', 2), member_id: NADJA }],
    articles: [
      { id: TOFU, name: 'Tofu', diet: 'vegan' },
      { id: BEEF, name: 'Rinderhack', diet: 'meat' },
      { id: RICE, name: 'Reis', diet: 'vegan' },
    ],
  });
}

describe('tool definitions', () => {
  it('every tool has strict parameters whose properties are all required (Foundry strict mode)', () => {
    for (const name of AGENT_TOOL_NAMES) {
      const parameters = agentToolParameters(name);
      expect(parameters.type).toBe('object');
      expect(parameters.additionalProperties).toBe(false);
      expect([...parameters.required].sort()).toEqual(Object.keys(parameters.properties).sort());
    }
    expect(AGENT_TOOL_NAMES.length).toBeLessThanOrEqual(12);
  });

  it('the reads name fixed tables and columns, never anything from the arguments', () => {
    const call = parseToolCall(
      'list_recipes',
      JSON.stringify({ query: 'title,email', fields: ['title'] }),
    );
    const reads = toolReads(call, TODAY);
    expect(reads.map((read) => read.table)).toContain('recipes');
    for (const read of reads) {
      expect(read.columns).not.toContain('email');
      expect(read.columns).toMatch(/^[a-z_]+(,[a-z_]+)*$/);
    }
  });
});

describe('list_recipes: recipes and collections (preview 28.11., "26 von 24")', () => {
  const withCollections = () => {
    const data = recipeHousehold();
    data.rows.recipes = [
      ...(data.rows.recipes ?? []),
      { id: id('c', 1), kind: 'collection', title: 'Grillabend', ingredients: [], steps: [] },
      { id: id('c', 2), kind: 'collection', title: 'Sommerfest', ingredients: [], steps: [] },
    ];
    return data;
  };
  it('kind "collection" lists only collections, the count over the same set', () => {
    const result = run(
      'list_recipes',
      { kind: 'collection', fields: ['title'] },
      withCollections(),
    );
    expect(result.json.total).toBe(2);
    expect(stepLine(result.step)).toBe('Liest eure Rezepte · Sammlungen · 2 von 2');
  });
  it('kind "all": items and total over recipes and collections; never more shown than there are', () => {
    const result = run('list_recipes', { kind: 'all', limit: 300 }, withCollections());
    expect(result.json.total).toBe(145);
    expect(stepLine(result.step)).toBe('Liest eure Rezepte · Rezepte und Sammlungen · 145 von 145');
  });
  it('without kind only recipes, as before', () => {
    expect(run('list_recipes', {}, withCollections()).json.total).toBe(143);
  });
});

describe('list_recipes', () => {
  it('AC-013: 12 vegetarian of 143, the longest not cooked first, never cooked before all', () => {
    const result = run(
      'list_recipes',
      { diet: ['vegan', 'vegetarian'], sort: 'last_cooked', fields: ['title', 'last_cooked_on'] },
      recipeHousehold(),
    );
    expect(result.json.total).toBe(12);
    const items = result.json.items as { title: string; last_cooked_on: string | null }[];
    expect(items.length).toBe(AGENT_TOOL_LIMITS.defaultLimit);
    expect(items[0]).toEqual({ title: 'Gemüse 3', last_cooked_on: null });
    // Planned ahead is not cooked; "nicht gekocht" does not count.
    expect(items.slice(1, 4).map((item) => item.title)).toEqual([
      'Gemüse 4',
      'Gemüse 2',
      'Gemüse 5',
    ]);
    expect(items.find((item) => item.title === 'Gemüse 2')?.last_cooked_on).toBe('2026-08-01');
    expect(items.map((item) => item.title)).not.toContain('Gemüse 1');
    expect(stepLine(result.step)).toBe('Liest eure Rezepte · vegan oder vegetarisch · 12 von 143');
    expect(result.step.details).toEqual([
      'Filter: Ernährung vegan oder vegetarisch',
      'Sortiert nach zuletzt gekocht, älteste zuerst',
      'Felder: Titel, zuletzt gekocht',
      'Einträge 1–10',
    ]);
  });

  it('"zuletzt gekocht" is the rule of the app (core cookingHistory)', () => {
    const data = recipeHousehold();
    const entries = (data.rows.meal_plan_entries ?? []).map(
      (row) =>
        ({
          kind: row.kind,
          recipeId: row.recipe_id,
          date: row.date,
          notDone: row.not_done,
        }) as MealPlanEntry,
    );
    const history = cookingHistory(entries, [], TODAY);
    const result = run(
      'list_recipes',
      { limit: 300, fields: ['id', 'last_cooked_on', 'cooked_count'] },
      data,
    );
    for (const item of result.json.items as {
      id: string;
      last_cooked_on: string | null;
      cooked_count: number;
    }[]) {
      expect(item.last_cooked_on).toBe(history[item.id]?.lastCookedOn ?? null);
      expect(item.cooked_count).toBe(history[item.id]?.count ?? 0);
    }
  });

  it('pages with limit and offset and always says the total', () => {
    const first = run('list_recipes', { limit: 50, fields: ['title'] }, recipeHousehold());
    expect(first.json).toMatchObject({ total: 143, offset: 0, limit: 50, next_offset: 50 });
    const last = run('list_recipes', { limit: 50, offset: 100 }, recipeHousehold());
    expect((last.json.items as unknown[]).length).toBe(43);
    expect(last.json.next_offset).toBeNull();
    const many = run('list_recipes', { limit: 1000 }, recipeHousehold());
    expect(many.json.limit).toBe(AGENT_TOOL_LIMITS.maxLimit);
  });

  it('searches title, cuisine, tags and ingredient names; rating and favourites per member', () => {
    const tofu = run('list_recipes', { query: 'tofu' }, recipeHousehold());
    expect(tofu.json.total).toBe(12);
    const quick = run(
      'list_recipes',
      { tags: ['Schnell'], fields: ['title', 'tags'] },
      recipeHousehold(),
    );
    expect(quick.json.items).toEqual([{ title: 'Gemüse 3', tags: ['schnell'] }]);
    const rated = run(
      'list_recipes',
      { sort: 'rating', descending: true, limit: 2, fields: ['title', 'rating', 'favorite_of'] },
      recipeHousehold(),
    );
    expect((rated.json.items as unknown[])[0]).toEqual({
      title: 'Gemüse 1',
      rating: 4.5,
      favorite_of: [],
    });
    const favourites = run(
      'list_recipes',
      { favorite: true, fields: ['title', 'favorite_of'] },
      recipeHousehold(),
    );
    expect(favourites.json.items).toEqual([{ title: 'Gemüse 2', favorite_of: ['Nadja'] }]);
  });

  it('AC-015: SQL in the search finds nothing and gives no error', () => {
    const result = run('list_recipes', { query: "x' or 1=1 --" }, recipeHousehold());
    expect(result.json).toMatchObject({ total: 0, items: [] });
    expect(result.output).not.toMatch(/sql|syntax|select/i);
  });

  it('AC-015: a field, sort or filter outside the allow-list is refused without echoing it', () => {
    for (const args of [
      { fields: ['household_id'] },
      { fields: ['email'] },
      { sort: 'title; drop table recipes' },
      { household_id: 'ffffffff-0000-4000-8000-000000000000' },
      { limit: 'alle' },
      { diet: ['carnivore'] },
    ]) {
      const result = run('list_recipes', args, recipeHousehold());
      expect(result.json.error).toBe('invalid_arguments');
      expect(result.output).not.toContain('drop table');
      expect(result.output).not.toContain('ffffffff');
      expect(stepLine(result.step)).toBe('Liest eure Rezepte · Anfrage ungültig');
    }
  });

  it('unfinished recipes: no ingredients and no steps (spec 0061)', () => {
    const data = recipeHousehold();
    data.rows.recipes = [
      ...(data.rows.recipes ?? []),
      {
        id: id('r', 200),
        kind: 'recipe',
        title: 'Nur ein Name',
        ingredients: [],
        steps: [],
        variants: [],
        tags: [],
      },
    ];
    const result = run('list_recipes', { unfinished: true, fields: ['title', 'unfinished'] }, data);
    expect(result.json.items).toEqual([{ title: 'Nur ein Name', unfinished: true }]);
  });

  it('broken JSON from the model is refused, an unknown tool too', () => {
    const broken = runTool(parseToolCall('list_recipes', '{"query":'), recipeHousehold(), 't1');
    expect(JSON.parse(broken.output)).toEqual({ error: 'invalid_arguments' });
    const unknown = runTool(parseToolCall('delete_everything', '{}'), recipeHousehold(), 't2');
    expect(JSON.parse(unknown.output)).toEqual({ error: 'unknown_tool' });
    expect(stepLine(unknown.step)).toBe('Unbekanntes Werkzeug');
  });
});

// ---------- Restaurants and activities ----------

function placesHousehold(): ToolData {
  return base({
    restaurants: [
      {
        id: id('p', 1),
        name: 'Katz Orange',
        cuisine: 'Deutsch',
        price_level: 3,
        tags: ['Terrasse'],
        address: 'Bergstr. 22',
      },
      { id: id('p', 2), name: 'Crackers', cuisine: 'Gourmet', price_level: 4, tags: [] },
      { id: id('p', 3), name: 'Pho Ngon', cuisine: 'Vietnamesisch', price_level: 1, tags: [] },
    ],
    restaurant_favorites: [
      { restaurant_id: id('p', 1), member_id: ENRICO },
      { restaurant_id: id('p', 2), member_id: NADJA },
    ],
    restaurant_ratings: [],
    meal_plan_entries: [
      { kind: 'restaurant', restaurant_id: id('p', 1), date: '2026-10-03', not_done: false },
      { kind: 'restaurant', restaurant_id: id('p', 2), date: '2026-12-24', not_done: false },
    ],
    activities: [
      {
        id: id('q', 1),
        name: 'Computerspielemuseum',
        kind_id: id('k', 1),
        remembered: true,
        place_name: 'Friedrichshain',
      },
      { id: id('q', 2), name: 'Eislaufen', kind_id: id('k', 2), remembered: false },
    ],
    activity_kinds: [
      { id: id('k', 1), name: 'Museum' },
      { id: id('k', 2), name: 'Sport' },
    ],
    activity_favorites: [],
    activity_ratings: [],
  });
}

describe('list_restaurants and list_activities', () => {
  it('favourites that were never visited (a visit is a plan entry up to today)', () => {
    const result = run(
      'list_restaurants',
      { favorite: true, visited: false, fields: ['name', 'favorite_of', 'visits'] },
      placesHousehold(),
    );
    expect(result.json.items).toEqual([{ name: 'Crackers', favorite_of: ['Nadja'], visits: 0 }]);
    expect(stepLine(result.step)).toBe(
      'Liest eure Restaurants · Favorit · nicht besucht · 1 von 3',
    );
  });

  it('filters by price level and cuisine, sorts by last visit', () => {
    const cheap = run(
      'list_restaurants',
      { max_price_level: 1, fields: ['name'] },
      placesHousehold(),
    );
    expect(cheap.json.items).toEqual([{ name: 'Pho Ngon' }]);
    const visited = run(
      'list_restaurants',
      { sort: 'last_visit', descending: true, limit: 1, fields: ['name', 'last_visit'] },
      placesHousehold(),
    );
    expect(visited.json.items).toEqual([{ name: 'Katz Orange', last_visit: '2026-10-03' }]);
  });

  it('remembered activities with their kind', () => {
    const result = run(
      'list_activities',
      { remembered: true, fields: ['name', 'kind', 'remembered'] },
      placesHousehold(),
    );
    expect(result.json.items).toEqual([
      { name: 'Computerspielemuseum', kind: 'Museum', remembered: true },
    ]);
    const sport = run('list_activities', { kind: 'sport', fields: ['name'] }, placesHousehold());
    expect(sport.json.items).toEqual([{ name: 'Eislaufen' }]);
  });
});

// ---------- Calendar ----------

const SERIES = 'c0000000-0000-4000-8000-000000000001';

function calendarHousehold(): ToolData {
  return base({
    meal_plan_entries: [
      {
        id: id('m', 1),
        date: '2026-11-28',
        slot_id: SLOT_EVENING,
        sort: 0,
        kind: 'recipe',
        recipe_id: id('r', 1),
        eater_ids: [ENRICO, NADJA],
        guests: 2,
        note: null,
        not_done: false,
      },
      {
        id: id('m', 2),
        date: '2026-11-29',
        slot_id: SLOT_NOON,
        sort: 0,
        kind: 'restaurant',
        restaurant_id: id('p', 1),
        starts_at: '12:30',
        eater_ids: [],
        guests: 0,
        not_done: false,
      },
      {
        id: id('m', 3),
        date: '2026-11-29',
        slot_id: SLOT_EVENING,
        sort: 0,
        kind: 'text',
        text: 'Grillabend bei Anna',
        eater_ids: [],
        guests: 0,
        not_done: false,
      },
    ],
    recipes: [{ id: id('r', 1), title: 'Mango-Curry' }],
    restaurants: [{ id: id('p', 1), name: 'Katz Orange' }],
    activities: [{ id: id('q', 1), name: 'Schwimmen' }],
    activity_series: [
      {
        id: SERIES,
        activity_id: id('q', 1),
        rule: { type: 'weekly', every: 1, weekdays: [6] },
        starts_on: '2026-11-01',
        ends_on: null,
        slot_id: SLOT_NOON,
        starts_at: '10:00',
        eater_ids: [ENRICO],
        guests: 0,
        note: null,
      },
    ],
    activity_series_exceptions: [],
    trips: [
      { id: id('t', 1), from_on: '2026-12-03', to_on: '2026-12-07', note: 'London', draft: false },
    ],
    trip_members: [{ trip_id: id('t', 1), member_id: NADJA }],
    chores: [
      {
        id: id('h', 1),
        title: 'Bad putzen',
        room: 'Bad',
        next_due_on: '2026-11-28',
        next_assignee_id: ENRICO,
      },
      {
        id: id('h', 2),
        title: 'Fenster',
        room: null,
        next_due_on: '2027-01-10',
        next_assignee_id: null,
      },
    ],
  });
}

describe('calendar', () => {
  it('the weekend: plan entries with slot, people, series Termine, chores due and trips', () => {
    const result = run('calendar', { from: '2026-11-28', to: '2026-11-29' }, calendarHousehold());
    expect(result.json.total).toBe(4);
    expect(result.json.items).toEqual([
      expect.objectContaining({
        date: '2026-11-28',
        weekday: 'Samstag',
        slot: 'Mittag',
        kind: 'Aktivität',
        title: 'Schwimmen',
        starts_at: '10:00',
        series: true,
        people: ['Enrico'],
      }),
      expect.objectContaining({
        date: '2026-11-28',
        slot: 'Abend',
        kind: 'Rezept',
        title: 'Mango-Curry',
        people: ['Enrico', 'Nadja'],
        guests: 2,
      }),
      expect.objectContaining({
        date: '2026-11-29',
        slot: 'Mittag',
        kind: 'Restaurant',
        title: 'Katz Orange',
        starts_at: '12:30',
      }),
      expect.objectContaining({
        date: '2026-11-29',
        slot: 'Abend',
        kind: 'Freitext',
        title: 'Grillabend bei Anna',
      }),
    ]);
    expect(result.json.chores_due).toEqual([
      { title: 'Bad putzen', room: 'Bad', due_on: '2026-11-28', assignee: 'Enrico' },
    ]);
    expect(result.json.trips).toEqual([]);
    expect(stepLine(result.step)).toBe('Schaut in den Kalender · 28.–29. Nov. · 4 Einträge');
  });

  it('the series Termine are those of the app (core seriesOccurrences)', () => {
    const data = calendarHousehold();
    const exceptions: ToolRow[] = [
      {
        series_id: SERIES,
        on_date: '2026-12-05',
        moved_to: '2026-12-06',
        slot_id: null,
        starts_at: null,
      },
      { series_id: SERIES, on_date: '2026-12-12', moved_to: null, slot_id: null, starts_at: null },
    ];
    data.rows.activity_series_exceptions = exceptions;
    const series: ActivitySeries = {
      id: SERIES,
      activityId: id('q', 1),
      rule: { type: 'weekly', every: 1, weekdays: [6] },
      startsOn: '2026-11-01',
      slotId: SLOT_NOON,
      startsAt: '10:00',
      eaterIds: [ENRICO],
      guests: 0,
    } as ActivitySeries;
    const domain: ActivitySeriesException[] = [
      { id: 'x1', seriesId: SERIES, on: '2026-12-05', movedTo: '2026-12-06' },
      { id: 'x2', seriesId: SERIES, on: '2026-12-12' },
    ] as ActivitySeriesException[];
    const expected = seriesOccurrences(series, domain, '2026-11-30', '2026-12-20').map(
      (o) => o.date,
    );
    const result = run(
      'calendar',
      { from: '2026-11-30', to: '2026-12-20', kinds: ['activity'] },
      data,
    );
    const dates = (result.json.items as { date: string; series?: boolean }[])
      .filter((item) => item.series)
      .map((item) => item.date);
    expect(dates).toEqual(expected);
    expect(result.json.trips).toEqual([
      {
        from_on: '2026-12-03',
        to_on: '2026-12-07',
        note: 'London',
        people: ['Nadja'],
        draft: false,
      },
    ]);
  });

  it('a range over 62 days, the wrong way round or a broken date is refused', () => {
    for (const args of [
      { from: '2026-01-01', to: '2026-06-01' },
      { from: '2026-11-29', to: '2026-11-28' },
      { from: '2026-11-28; drop table x', to: '2026-11-29' },
      { from: '2026-02-30', to: '2026-03-01' },
    ]) {
      expect(run('calendar', args, calendarHousehold()).json.error).toBe('invalid_arguments');
    }
  });

  it('reads plan entries only for the asked range', () => {
    const reads = toolReads(
      parseToolCall('calendar', '{"from":"2026-11-28","to":"2026-11-29"}'),
      TODAY,
    );
    const entries = reads.find((read) => read.table === 'meal_plan_entries');
    expect(entries?.filters).toEqual([
      { op: 'gte', column: 'date', value: '2026-11-28' },
      { op: 'lte', column: 'date', value: '2026-11-29' },
    ]);
  });
});

// ---------- List, Dauerposten, chores, trips, articles, overview ----------

function shoppingHousehold(): ToolData {
  return base({
    shopping_items: [
      { id: id('s', 1), article_id: id('a', 1), checked: false, not_available: false },
      { id: id('s', 2), article_id: id('a', 2), checked: true, not_available: false },
      { id: id('s', 3), article_id: id('a', 3), checked: false, not_available: true },
    ],
    shopping_contributions: [
      { item_id: id('s', 1), count: 2, qty: null, unit: null, note: null },
      { item_id: id('s', 1), count: null, qty: 500, unit: 'g', note: 'bio' },
      { item_id: id('s', 3), count: null, qty: null, unit: null, note: null },
    ],
    articles: [
      {
        id: id('a', 1),
        name: 'Milch',
        area_id: id('b', 2),
        diet: 'vegetarian',
        synonyms: [],
        is_pantry: false,
        needs_review: false,
      },
      {
        id: id('a', 2),
        name: 'Eier',
        area_id: id('b', 2),
        diet: 'vegetarian',
        synonyms: [],
        is_pantry: false,
        needs_review: false,
      },
      {
        id: id('a', 3),
        name: 'Zimt',
        area_id: id('b', 1),
        diet: 'vegan',
        synonyms: ['Ceylon-Zimt'],
        is_pantry: true,
        needs_review: false,
      },
    ],
    areas: [
      { id: id('b', 1), name: 'Gewürze', sort: 1 },
      { id: id('b', 2), name: 'Kühlregal', sort: 2 },
    ],
    recurring_items: [
      {
        id: id('d', 1),
        article_id: id('a', 1),
        count: 1,
        qty: null,
        unit: null,
        note: null,
        paused: false,
        rule: { type: 'weekly', every: 1, weekdays: [1] },
        starts_on: '2026-11-02',
        last_added_on: '2026-11-23',
      },
    ],
    chores: [
      {
        id: id('h', 1),
        title: 'Bad putzen',
        room: 'Bad',
        next_due_on: '2026-11-20',
        next_assignee_id: ENRICO,
        last_done_on: '2026-11-06',
        recurrence: { type: 'weekly', every: 2, weekdays: [5] },
        effort: 2,
        due_time: null,
      },
      {
        id: id('h', 2),
        title: 'Müll',
        room: 'Küche',
        next_due_on: '2026-11-30',
        next_assignee_id: NADJA,
        last_done_on: null,
        recurrence: { type: 'weekly', every: 1, weekdays: [1] },
        effort: 1,
        due_time: '19:00',
      },
    ],
    trips: [
      { id: id('t', 1), from_on: '2026-12-03', to_on: '2026-12-07', note: 'London', draft: false },
      { id: id('t', 2), from_on: '2026-07-01', to_on: '2026-07-10', note: 'Rom', draft: false },
    ],
    trip_members: [{ trip_id: id('t', 1), member_id: NADJA }],
  });
}

describe('shopping_list, Dauerposten, chores, trips, articles', () => {
  it('open items of the list in store order with their amounts', () => {
    const result = run('shopping_list', {}, shoppingHousehold());
    expect(result.json.items).toEqual([
      { article: 'Zimt', area: 'Gewürze', amount: null, not_available: true },
      { article: 'Milch', area: 'Kühlregal', amount: '2 + 500 g (bio)', not_available: false },
    ]);
    expect(stepLine(result.step)).toBe('Liest die Einkaufsliste · offen · 2 von 3');
  });

  it('Dauerposten with their rhythm', () => {
    const result = run(
      'list_recurring_items',
      { fields: ['article', 'amount', 'rule', 'last_added_on'] },
      shoppingHousehold(),
    );
    expect(result.json.items).toEqual([
      {
        article: 'Milch',
        amount: '1',
        rule: { type: 'weekly', every: 1, weekdays: [1] },
        last_added_on: '2026-11-23',
      },
    ]);
  });

  it('chores: overdue ones and whose turn it is', () => {
    const overdue = run(
      'list_chores',
      { overdue: true, fields: ['title', 'assignee', 'next_due_on'] },
      shoppingHousehold(),
    );
    expect(overdue.json.items).toEqual([
      { title: 'Bad putzen', assignee: 'Enrico', next_due_on: '2026-11-20' },
    ]);
    const nadja = run('list_chores', { assignee: 'nadja', fields: ['title'] }, shoppingHousehold());
    expect(nadja.json.items).toEqual([{ title: 'Müll' }]);
  });

  it('upcoming trips with their people', () => {
    const result = run('list_trips', { upcoming: true }, shoppingHousehold());
    expect(result.json.items).toEqual([
      {
        from_on: '2026-12-03',
        to_on: '2026-12-07',
        note: 'London',
        people: ['Nadja'],
        draft: false,
      },
    ]);
  });

  it('articles by area and diet, synonyms found by the search', () => {
    const result = run(
      'list_articles',
      { query: 'ceylon', fields: ['name', 'area', 'is_pantry'] },
      shoppingHousehold(),
    );
    expect(result.json.items).toEqual([{ name: 'Zimt', area: 'Gewürze', is_pantry: true }]);
  });

  it('household_values gives every value of one column, without pages', () => {
    const names = run('household_values', { column: 'article_names' }, shoppingHousehold());
    expect(names.json).toEqual({
      column: 'article_names',
      total: 3,
      values: ['Eier', 'Milch', 'Zimt'],
    });
    expect(stepLine(names.step)).toBe('Liest alle Artikelnamen · 3');
    const tags = run('household_values', { column: 'recipe_tags' }, recipeHousehold());
    expect(tags.json.values).toEqual(['schnell']);
    const cuisines = run('household_values', { column: 'recipe_cuisines' }, recipeHousehold());
    expect(cuisines.json.values).toEqual(['Indisch', 'Italienisch']);
    expect(
      run('household_values', { column: 'profiles.email' }, shoppingHousehold()).json.error,
    ).toBe('invalid_arguments');
  });

  it('a very large page is cut to the output limit and says so', () => {
    const data = recipeHousehold();
    data.rows.recipes = (data.rows.recipes ?? []).map((row) => ({
      ...row,
      description: 'x'.repeat(2000),
    }));
    const result = run('list_recipes', { limit: 300, fields: ['title', 'description'] }, data);
    expect(result.output.length).toBeLessThanOrEqual(AGENT_TOOL_LIMITS.outputChars);
    expect(result.json.truncated).toBe(true);
    expect(result.json.next_offset).toBe((result.json.items as unknown[]).length);
  });
});

describe('steps of a stored chat', () => {
  it('a chat from "Verlauf" shows its tool steps from the call and its output', () => {
    const live = run('list_recipes', { diet: ['vegan', 'vegetarian'] }, recipeHousehold());
    const stored = storedToolStep(
      'list_recipes',
      JSON.stringify({ diet: ['vegan', 'vegetarian'] }),
      live.output,
      't1',
    );
    expect(stepLine(stored)).toBe('Liest eure Rezepte · vegan oder vegetarisch · 12 Treffer');
    expect(stored.details).toEqual(live.step.details);
    const broken = storedToolStep(
      'list_recipes',
      '{"fields":["email"]}',
      '{"error":"invalid_arguments"}',
      't2',
    );
    expect(stepLine(broken)).toBe('Liest eure Rezepte · Anfrage ungültig');
    expect(toolLabel('calendar')).toBe('Schaut in den Kalender');
    expect(toolLabel('rm_rf')).toBe('Unbekanntes Werkzeug');
  });
});

describe('the same call twice in one answer (preview 28.11.)', () => {
  it('equal tool and arguments give the same key, whatever the order or the nulls', () => {
    expect(agentCallKey('list_recipes', '{"kind":"collection","query":null,"limit":10}')).toBe(
      agentCallKey('list_recipes', '{"limit":10,"kind":"collection"}'),
    );
  });
  it('another tool, other arguments or broken JSON give another key or none', () => {
    const key = agentCallKey('list_recipes', '{"kind":"collection"}');
    expect(agentCallKey('list_recipes', '{"kind":"recipe"}')).not.toBe(key);
    expect(agentCallKey('list_activities', '{"kind":"collection"}')).not.toBe(key);
    expect(agentCallKey('list_recipes', '{nope')).toBeUndefined();
  });
});
