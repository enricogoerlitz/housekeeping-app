import { normalizeText, type Row, type TableRows } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { createInitialState, DEMO_HOUSEHOLD_ID, ENRICO, NADJA } from '../seed/demo';
import type { HouseholdData } from '../store';
import {
  householdToRows,
  membersToRows,
  rowsToHousehold,
  rowsToMembers,
  type HouseholdRows,
} from './mapping';
import { diffHousehold } from '../changes';

const TODAY = '2026-11-20';
const demo = () => {
  const state = createInitialState(TODAY);
  const seeded = state.households[DEMO_HOUSEHOLD_ID];
  if (!seeded) throw new Error('demo household missing');
  return { data: seeded, members: state.members };
};

const SERVER_TIME = '2026-11-01T10:00:00.000000Z';

/** What the server adds to every row it sends: timestamps, and the table's own household_id. */
function asServerTables(rows: HouseholdRows): {
  tables: TableRows;
  small: Record<string, Row[]>;
} {
  const tables: TableRows = {};
  const small: Record<string, Row[]> = {};
  for (const [table, list] of Object.entries(rows)) {
    const withServerColumns = list.map((row) => ({
      created_at: SERVER_TIME,
      ...row,
      updated_at: SERVER_TIME,
    }));
    if (['households', 'household_members', 'profiles'].includes(table)) {
      small[table] = withServerColumns;
    } else {
      tables[table] = Object.fromEntries(withServerColumns.map((row) => [row.id, row]));
    }
  }
  return { tables, small };
}

/** Server-only columns the domain does not carry; left out when comparing rows. */
function withoutServerColumns(rows: HouseholdRows): Record<string, Row[]> {
  const domainHasCreatedAt = new Set([
    'chore_events',
    'articles',
    'recipes',
    'restaurants',
    'activities',
    'feedback',
    'shopping_items',
  ]);
  return Object.fromEntries(
    Object.entries(rows).map(([table, list]) => [
      table,
      list.map((row) => {
        const copy: Row = { ...row };
        delete copy.updated_at;
        delete copy.email;
        if (!domainHasCreatedAt.has(table)) delete copy.created_at;
        return copy;
      }),
    ]),
  );
}

/** The time of every rating, as the server sends `updated_at` of each rating row. */
const ratedNow = (ratings: Record<string, number>) =>
  Object.keys(ratings).length === 0
    ? undefined
    : Object.fromEntries(Object.keys(ratings).map((memberId) => [memberId, SERVER_TIME]));

/**
 * Domain rules applied to the seed (documented normalisations): newest feedback first; the server
 * stamps `created_at` on chore events and `updated_at` on ratings (spec 0011: createdAt, ratedAt).
 */
function normalised(data: HouseholdData): HouseholdData {
  return {
    ...data,
    recipes: data.recipes.map((recipe) => ({ ...recipe, ratedAt: ratedNow(recipe.ratings) })),
    restaurants: data.restaurants.map((restaurant) => ({
      ...restaurant,
      ratedAt: ratedNow(restaurant.ratings),
    })),
    activities: data.activities.map((activity) => ({
      ...activity,
      ratedAt: ratedNow(activity.ratings),
    })),
    choreEvents: data.choreEvents.map((event) => ({ ...event, createdAt: SERVER_TIME })),
    feedback: [...data.feedback].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

describe('mapping between domain and rows', () => {
  it('domain → rows → domain gives the demo household back', () => {
    const { data, members } = demo();
    const rows = householdToRows(data);
    const { tables, small } = asServerTables({ ...rows, ...membersToRows(members) });

    const back = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID);
    expect(back).toEqual(normalised(data));
    expect(rowsToMembers(small)).toEqual(members);
  });

  it('rows → domain → rows gives the same rows back', () => {
    const { data, members } = demo();
    const { tables, small } = asServerTables({
      ...householdToRows(data),
      ...membersToRows(members),
    });
    const domain = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID);

    const original: HouseholdRows = {
      ...Object.fromEntries(
        Object.entries(tables).map(([table, byId]) => [table, Object.values(byId)]),
      ),
      ...small,
    };
    const again = { ...householdToRows(domain), ...membersToRows(rowsToMembers(small)) };
    const sortById = (rows: Record<string, Row[]>) =>
      Object.fromEntries(
        Object.entries(rows).map(([table, list]) => [
          table,
          [...list].sort((a, b) =>
            String(a.id ?? a.profile_id).localeCompare(String(b.id ?? b.profile_id)),
          ),
        ]),
      );
    expect(sortById(withoutServerColumns(again))).toEqual(sortById(withoutServerColumns(original)));
  });

  it('spec 0007: articles carry the Standard-Einkaufsregel, "Neu aus Rezepten" and their creation time', () => {
    const { data } = demo();
    const [first, second] = data.articles;
    if (!first || !second) throw new Error('fixture');
    const changed: HouseholdData = {
      ...data,
      articles: [
        { ...first, defaultShoppingRule: 'recipeAmount', needsReview: true },
        { ...second, defaultShoppingRule: undefined, needsReview: false },
      ],
    };
    const rows = householdToRows(changed);
    expect(rows.articles?.[0]).toMatchObject({
      default_shopping_rule: 'recipeAmount',
      needs_review: true,
      created_at: first.createdAt,
    });
    expect(rows.articles?.[1]).toMatchObject({ default_shopping_rule: null, needs_review: false });

    const { tables, small } = asServerTables(rows);
    const back = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID);
    expect(back.articles[0]).toMatchObject({
      defaultShoppingRule: 'recipeAmount',
      needsReview: true,
      createdAt: first.createdAt,
    });
    expect(back.articles[1]).not.toHaveProperty('defaultShoppingRule');
  });

  it('writes the snake_case columns, the camelCase recipe json and the article keys', () => {
    const { data } = demo();
    const rows = householdToRows(data);
    const curry = rows.recipes?.find((row) => row.id === 'rec-mango-curry');
    expect(curry).toMatchObject({
      household_id: DEMO_HOUSEHOLD_ID,
      title: 'Mango-Curry',
      total_minutes: expect.any(Number),
      cooked_count: 9,
      last_cooked_on: '2026-11-19',
    });
    const ingredient = (curry?.ingredients as Record<string, unknown>[])[0];
    expect(Object.keys(ingredient ?? {})).toEqual(
      expect.arrayContaining(['id', 'articleId', 'shoppingRule']),
    );
    expect(ingredient).not.toHaveProperty('name');
    expect((curry?.variants as Record<string, unknown>[])[0]).toMatchObject({ isDefault: true });

    const carrots = rows.articles?.find((row) => row.name === 'Möhren');
    expect(carrots).toMatchObject({
      name_key: normalizeText('Möhren'),
      synonym_keys: (carrots?.synonyms as string[]).map(normalizeText),
      is_pantry: false,
    });
    expect(rows.recipe_favorites).toContainEqual({
      id: `rec-mango-curry:${NADJA}`,
      household_id: DEMO_HOUSEHOLD_ID,
      recipe_id: 'rec-mango-curry',
      member_id: NADJA,
    });
    expect(rows.recipe_ratings).toContainEqual(
      expect.objectContaining({ recipe_id: 'rec-mango-curry', member_id: ENRICO, stars: 5 }),
    );
    expect(rows.households).toEqual([
      expect.objectContaining({
        id: DEMO_HOUSEHOLD_ID,
        meal_slots: data.household.mealSlots,
      }),
    ]);
    const item = rows.shopping_items?.[0];
    expect(item).not.toHaveProperty('pending_sync');
    expect(item).not.toHaveProperty('contributions');
  });

  it('writes activities with name_key, place and creator, their favourites, ratings and plan entries', () => {
    const { data } = demo();
    const rows = householdToRows(data);
    expect(rows.activities?.find((row) => row.id === 'act-eislaufen')).toEqual({
      id: 'act-eislaufen',
      household_id: DEMO_HOUSEHOLD_ID,
      name: 'Eislaufen',
      name_key: normalizeText('Eislaufen'),
      description: expect.any(String),
      photo_path: null,
      place_name: 'Eisstadion Hohenschönhausen',
      address: null,
      lat: 52.55,
      lng: 13.5,
      maps_url: expect.stringMatching(/^https:\/\//),
      tags: [],
      created_by: ENRICO,
      created_at: expect.any(String),
    });
    expect(rows.activity_ratings).toContainEqual({
      id: `act-eislaufen:${NADJA}`,
      household_id: DEMO_HOUSEHOLD_ID,
      activity_id: 'act-eislaufen',
      member_id: NADJA,
      stars: expect.any(Number),
    });
    expect(rows.activity_favorites?.length).toBeGreaterThan(0);
    const planned = rows.meal_plan_entries?.find((row) => row.kind === 'activity' && row.note);
    expect(planned).toMatchObject({ activity_id: 'act-eislaufen', note: 'Hohenschönhausen' });
    expect(rows.meal_plan_entries?.find((row) => row.kind === 'recipe')).toMatchObject({
      activity_id: null,
      note: null,
    });
    expect(rows.recipes?.[0]).toMatchObject({ photo_path: null });
  });

  it('reads an own recipe photo and an activity photo back from the rows', () => {
    const { data, members } = demo();
    const { tables, small } = asServerTables({
      ...householdToRows(data),
      ...membersToRows(members),
    });
    const lasagne = tables.recipes?.['rec-lasagne'];
    const bouldern = tables.activities?.['act-bouldern'];
    if (!lasagne || !bouldern) throw new Error('fixture');
    tables.recipes = {
      ...tables.recipes,
      [lasagne.id]: { ...lasagne, photo_path: 'hh-demo/recipes/rec-lasagne/a.jpg' },
    };
    tables.activities = {
      ...tables.activities,
      [bouldern.id]: { ...bouldern, photo_path: 'hh-demo/activities/act-bouldern/b.jpg' },
    };
    const domain = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID);
    expect(domain.recipes.find((recipe) => recipe.id === 'rec-lasagne')).toMatchObject({
      photo: 'lasagne',
      photoPath: 'hh-demo/recipes/rec-lasagne/a.jpg',
    });
    expect(domain.activities.find((activity) => activity.id === 'act-bouldern')?.photoPath).toBe(
      'hh-demo/activities/act-bouldern/b.jpg',
    );
  });

  it('a removed member (null done_by / author_id) becomes an empty id', () => {
    const { data, members } = demo();
    const { tables, small } = asServerTables({
      ...householdToRows(data),
      ...membersToRows(members),
    });
    const event = Object.values(tables.chore_events ?? {})[0];
    const entry = Object.values(tables.feedback ?? {})[0];
    if (!event || !entry) throw new Error('fixture');
    tables.chore_events = { ...tables.chore_events, [event.id]: { ...event, done_by: null } };
    tables.feedback = { ...tables.feedback, [entry.id]: { ...entry, author_id: null } };

    const domain = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID);
    expect(domain.choreEvents.find((candidate) => candidate.id === event.id)?.doneBy).toBe('');
    expect(domain.feedback.find((candidate) => candidate.id === entry.id)?.authorId).toBe('');
    const again = householdToRows(domain);
    expect(again.chore_events?.find((row) => row.id === event.id)?.done_by).toBeNull();
  });

  it('marks items with a pending store action as pendingSync', () => {
    const { data, members } = demo();
    const { tables, small } = asServerTables({
      ...householdToRows(data),
      ...membersToRows(members),
    });
    const domain = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID, {
      pendingItemIds: new Set(['item-1']),
    });
    expect(domain.items.find((item) => item.id === 'item-1')?.pendingSync).toBe(true);
    expect(domain.items.find((item) => item.id === 'item-2')?.pendingSync).toBeUndefined();
  });

  it('sorts rows the server sends in any order by the domain rules', () => {
    const { data, members } = demo();
    const { tables, small } = asServerTables({
      ...householdToRows(data),
      ...membersToRows(members),
    });
    const reversed: TableRows = Object.fromEntries(
      Object.entries(tables).map(([table, byId]) => [
        table,
        Object.fromEntries(Object.entries(byId).reverse()),
      ]),
    );
    const areas = rowsToHousehold(reversed, small, DEMO_HOUSEHOLD_ID).areas;
    expect(areas.map((area) => area.sort)).toEqual(areas.map((_, index) => index));
    const recipes = rowsToHousehold(reversed, small, DEMO_HOUSEHOLD_ID).recipes;
    expect(recipes.map((recipe) => recipe.id)).toEqual(data.recipes.map((recipe) => recipe.id));
  });

  it('keeps object identity for unchanged rows across rebuilds', () => {
    const { data, members } = demo();
    const { tables, small } = asServerTables({
      ...householdToRows(data),
      ...membersToRows(members),
    });
    const first = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID);
    const same = rowsToHousehold({ ...tables }, small, DEMO_HOUSEHOLD_ID, { previous: first });
    expect(same).toBe(first);

    const curry = tables.recipes?.['rec-mango-curry'];
    if (!curry) throw new Error('fixture');
    const changed: TableRows = {
      ...tables,
      recipes: { ...tables.recipes, [curry.id]: { ...curry, title: 'Mango-Curry scharf' } },
    };
    const second = rowsToHousehold(changed, small, DEMO_HOUSEHOLD_ID, { previous: first });
    expect(second).not.toBe(first);
    expect(second.areas).toBe(first.areas);
    expect(second.articles).toBe(first.articles);
    expect(second.recipes).not.toBe(first.recipes);
    const lasagne = (recipes: HouseholdData['recipes']) =>
      recipes.find((recipe) => recipe.id === 'rec-lasagne');
    expect(lasagne(second.recipes)).toBe(lasagne(first.recipes));

    // A favourite is its own row; only the recipe it belongs to is rebuilt.
    const favorite = Object.values(tables.recipe_favorites ?? {}).find(
      (row) => row.recipe_id === 'rec-lasagne',
    );
    if (!favorite) throw new Error('fixture');
    const withoutFavorite = { ...changed.recipe_favorites };
    delete withoutFavorite[favorite.id];
    const third = rowsToHousehold(
      { ...changed, recipe_favorites: withoutFavorite },
      small,
      DEMO_HOUSEHOLD_ID,
      { previous: second },
    );
    expect(lasagne(third.recipes)).not.toBe(lasagne(second.recipes));
    const shakshuka = (recipes: HouseholdData['recipes']) =>
      recipes.find((recipe) => recipe.id === 'rec-shakshuka');
    expect(shakshuka(third.recipes)).toBe(shakshuka(second.recipes));

    const members1 = rowsToMembers(small);
    expect(rowsToMembers({ ...small }, members1)).toBe(members1);
  });

  it('turns domain rows into the same row objects when the entity is unchanged', () => {
    const { data } = demo();
    const first = householdToRows(data);
    const second = householdToRows({ ...data, recipes: [...data.recipes] });
    expect(second.recipes?.[0]).toBe(first.recipes?.[0]);
    expect(second.articles?.[0]).toBe(first.articles?.[0]);
  });

  it('spec 0011: a chore "bei Bedarf" goes there and back without a date', () => {
    const { data } = demo();
    const rows = householdToRows(data);
    const row = rows.chores?.find((chore) => chore.id === 'chore-fenster-kueche');
    expect(row).toMatchObject({ recurrence: { type: 'asNeeded' }, next_due_on: null });
    const { tables, small } = asServerTables(rows);
    const back = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID);
    const chore = back.chores.find((candidate) => candidate.id === 'chore-fenster-kueche');
    expect(chore?.recurrence).toEqual({ type: 'asNeeded' });
    expect(chore?.nextDueOn).toBeUndefined();
  });

  it('spec 0011: an entry reads created_at and the recorded state before it; rows never carry prev_*', () => {
    const { data } = demo();
    const { tables, small } = asServerTables(householdToRows(data));
    const recorded = {
      ...tables.chore_events?.['ev-5'],
      id: 'ev-5',
      created_at: '2026-11-13T09:00:00.000000Z',
      prev_recorded: true,
      prev_next_due_on: '2026-11-13',
      prev_last_done_on: '2026-11-06',
      prev_next_assignee_id: ENRICO,
    };
    const notRecorded = {
      ...tables.chore_events?.['ev-3'],
      id: 'ev-3',
      prev_recorded: false,
      prev_next_due_on: null,
      prev_last_done_on: null,
      prev_next_assignee_id: null,
    };
    const back = rowsToHousehold(
      {
        ...tables,
        chore_events: { ...tables.chore_events, 'ev-5': recorded, 'ev-3': notRecorded },
      },
      small,
      DEMO_HOUSEHOLD_ID,
    );
    const event = back.choreEvents.find((candidate) => candidate.id === 'ev-5');
    expect(event).toMatchObject({
      createdAt: '2026-11-13T09:00:00.000000Z',
      previous: { nextDueOn: '2026-11-13', lastDoneOn: '2026-11-06', nextAssigneeId: ENRICO },
    });
    expect(back.choreEvents.find((candidate) => candidate.id === 'ev-3')?.previous).toBeUndefined();

    const rows = householdToRows(back);
    const written = rows.chore_events?.find((row) => row.id === 'ev-5');
    expect(written).toMatchObject({ created_at: '2026-11-13T09:00:00.000000Z' });
    expect(Object.keys(written ?? {}).filter((column) => column.startsWith('prev_'))).toEqual([]);

    // Changing "Erledigt von" sends only done_by, never the recorded state.
    const changed: HouseholdData = {
      ...back,
      choreEvents: back.choreEvents.map((candidate) =>
        candidate.id === 'ev-5' ? { ...candidate, doneBy: NADJA } : candidate,
      ),
    };
    expect(diffHousehold(back, changed, { mode: 'send' }).ops).toEqual([
      { kind: 'patch', table: 'chore_events', id: 'ev-5', changes: { done_by: NADJA } },
    ]);
  });

  it('spec 0011: ratedAt is updated_at of the own rating row; a diff never sends it', () => {
    const { data } = demo();
    const { tables, small } = asServerTables(householdToRows(data));
    const rated = Object.values(tables.recipe_ratings ?? {})[0];
    if (!rated) throw new Error('fixture');
    const back = rowsToHousehold(
      {
        ...tables,
        recipe_ratings: {
          ...tables.recipe_ratings,
          [rated.id]: { ...rated, stars: 4.5, updated_at: '2026-11-19T18:00:00.000000Z' },
        },
      },
      small,
      DEMO_HOUSEHOLD_ID,
    );
    const recipe = back.recipes.find((candidate) => candidate.id === rated.recipe_id);
    expect(recipe?.ratings[String(rated.member_id)]).toBe(4.5);
    expect(recipe?.ratedAt?.[String(rated.member_id)]).toBe('2026-11-19T18:00:00.000000Z');

    const renamed: HouseholdData = {
      ...back,
      recipes: back.recipes.map((candidate) =>
        candidate.id === recipe?.id ? { ...candidate, title: 'Neu' } : candidate,
      ),
    };
    expect(diffHousehold(back, renamed, { mode: 'send' }).ops).toEqual([
      { kind: 'patch', table: 'recipes', id: recipe?.id, changes: { title: 'Neu' } },
    ]);
  });

  it('spec 0011: a diff refuses to insert or delete chore events (complete_chore, remove_chore_event)', () => {
    const { data } = demo();
    const event = data.choreEvents[0];
    if (!event) throw new Error('fixture');
    const added: HouseholdData = {
      ...data,
      choreEvents: [{ ...event, id: 'ev-new' }, ...data.choreEvents],
    };
    expect(() => diffHousehold(data, added, { mode: 'send' })).toThrow();
    const removed: HouseholdData = { ...data, choreEvents: data.choreEvents.slice(1) };
    expect(() =>
      diffHousehold(data, removed, { mode: 'send', maxDeletes: { chore_events: 1 } }),
    ).toThrow();
  });

  it('spec 0012: the four packing tables go there and back; packed state is read, never written', () => {
    const { data } = demo();
    expect(data.packingBags.length).toBeGreaterThan(0);
    const rows = householdToRows(data);
    const packed = data.packingItems.find((item) => item.packed);
    if (!packed) throw new Error('fixture: no packed item');
    expect(rows.packing_items?.find((row) => row.id === packed.id)).toMatchObject({
      list_bag_id: packed.listBagId,
      name: packed.name,
      packed: true,
      packed_by: packed.packedBy,
      pack_seq: packed.packSeq,
    });
    const nadjasBag = data.packingBags.find((bag) => bag.memberId === NADJA);
    expect(rows.packing_bags?.find((row) => row.id === nadjasBag?.id)).toMatchObject({
      member_id: NADJA,
    });
    const { tables, small } = asServerTables(rows);
    const back = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID);
    expect(back.packingBags).toEqual(data.packingBags);
    expect(back.packingBagItems).toEqual(data.packingBagItems);
    expect(back.packingListBags).toEqual(data.packingListBags);
    expect(back.packingItems).toEqual(data.packingItems);

    // A new Packstück is inserted without packed*/pack_seq (only the server writes them).
    const listBag = data.packingListBags[0];
    if (!listBag) throw new Error('fixture');
    const added: HouseholdData = {
      ...back,
      packingItems: [
        ...back.packingItems,
        {
          id: 'pi-new',
          listBagId: listBag.id,
          name: 'Schnorchel',
          packed: false,
          packSeq: 0,
          sort: 99,
        },
      ],
    };
    const { send } = diffHousehold(back, added, { mode: 'send' });
    expect(send).toEqual([
      {
        kind: 'insert',
        table: 'packing_items',
        row: {
          id: 'pi-new',
          list_bag_id: listBag.id,
          name: 'Schnorchel',
          quantity: null,
          per_day: null,
          sort: 99,
        },
      },
    ]);
    // A diff never changes the packed state; that goes through set_packing_items_packed.
    const changed: HouseholdData = {
      ...back,
      packingItems: back.packingItems.map((item) =>
        item.id === packed.id ? { ...item, packed: false } : item,
      ),
    };
    expect(() => diffHousehold(back, changed, { mode: 'send' })).toThrow();
  });
});

describe('spec 0009: collections in the rows', () => {
  /** The demo plus "Grillabend" (no course) containing a recipe with own portions and variant. */
  function withCollection(): HouseholdData {
    const { data } = demo();
    const recipe = data.recipes.find((candidate) => candidate.variants.length > 0);
    const variant = recipe?.variants[1];
    if (!recipe || !variant) throw new Error('fixture: no recipe with two variants');
    return {
      ...data,
      recipes: [
        {
          id: 'rec-grill-test',
          kind: 'collection',
          title: 'Grillabend Test',
          servings: 6,
          tags: [],
          variants: [],
          ingredients: [],
          steps: [],
          favoriteOf: [],
          ratings: {},
          cookedCount: 0,
          createdAt: '2026-11-01T10:00:00.000Z',
        },
        ...data.recipes,
      ],
      collectionRecipes: [
        ...data.collectionRecipes,
        {
          id: 'cr-test-1',
          collectionId: 'rec-grill-test',
          recipeId: recipe.id,
          servings: 8,
          variantId: variant.id,
          sort: 0,
        },
        { id: 'cr-test-2', collectionId: 'rec-grill-test', recipeId: 'rec-lasagne', sort: 1 },
      ],
    };
  }

  it('E3, E4: kind and a missing course (null) go there and back; contained rows with null = undefined', () => {
    const data = withCollection();
    const rows = householdToRows(data);
    expect(rows.recipes?.find((row) => row.id === 'rec-grill-test')).toMatchObject({
      kind: 'collection',
      course: null,
      total_minutes: null,
      cuisine: null,
    });
    expect(rows.recipes?.find((row) => row.id === 'rec-lasagne')).toMatchObject({
      kind: 'recipe',
      course: 'main',
    });
    expect(rows.collection_recipes?.find((row) => row.id === 'cr-test-2')).toEqual({
      id: 'cr-test-2',
      household_id: DEMO_HOUSEHOLD_ID,
      collection_id: 'rec-grill-test',
      recipe_id: 'rec-lasagne',
      servings: null,
      variant_id: null,
      sort: 1,
    });
    const { tables, small } = asServerTables(rows);
    const back = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID);
    const collection = back.recipes.find((recipe) => recipe.id === 'rec-grill-test');
    expect(collection).toMatchObject({ kind: 'collection', title: 'Grillabend Test' });
    expect(collection && 'course' in collection && collection.course !== undefined).toBe(false);
    expect(back.recipes.find((recipe) => recipe.id === 'rec-lasagne')?.kind).toBe('recipe');
    expect(back.collectionRecipes).toEqual(data.collectionRecipes);
  });

  it('a recipe row without kind (database default) is a recipe; one without course stays "main"', () => {
    const { tables, small } = asServerTables(householdToRows(demo().data));
    const lasagne = tables.recipes?.['rec-lasagne'];
    if (!lasagne) throw new Error('fixture');
    const partial: Row = { ...lasagne };
    delete partial.kind;
    delete partial.course;
    const back = rowsToHousehold(
      { ...tables, recipes: { ...tables.recipes, 'rec-lasagne': partial } },
      small,
      DEMO_HOUSEHOLD_ID,
    );
    expect(back.recipes.find((recipe) => recipe.id === 'rec-lasagne')).toMatchObject({
      kind: 'recipe',
      course: 'main',
    });
  });

  it('E12: a new collection is inserted with kind and course null before its rows; kind is never patched', () => {
    const before = demo().data;
    const after = withCollection();
    const { send } = diffHousehold(before, after, { mode: 'send' });
    expect(send.map((op) => (op.kind === 'insert' ? `${op.table}:${op.row.id}` : op.kind))).toEqual(
      ['recipes:rec-grill-test', 'collection_recipes:cr-test-1', 'collection_recipes:cr-test-2'],
    );
    expect(send[0]).toMatchObject({ row: { kind: 'collection', course: null } });
    expect(send[2]).toEqual({
      kind: 'insert',
      table: 'collection_recipes',
      row: {
        id: 'cr-test-2',
        collection_id: 'rec-grill-test',
        recipe_id: 'rec-lasagne',
        servings: null,
        variant_id: null,
        sort: 1,
      },
    });

    const turned: HouseholdData = {
      ...after,
      recipes: after.recipes.map((recipe) =>
        recipe.id === 'rec-lasagne' ? { ...recipe, kind: 'collection' } : recipe,
      ),
    };
    expect(() => diffHousehold(after, turned, { mode: 'send' })).toThrow(/kind/);
    const moved: HouseholdData = {
      ...after,
      collectionRecipes: after.collectionRecipes.map((row) =>
        row.id === 'cr-test-2' ? { ...row, recipeId: 'rec-mango-curry' } : row,
      ),
    };
    expect(() => diffHousehold(after, moved, { mode: 'send' })).toThrow(/recipe_id/);
  });

  it('E12: "Enthält" sends only servings, variant and order patches and declared deletes', () => {
    const before = withCollection();
    const after: HouseholdData = {
      ...before,
      collectionRecipes: before.collectionRecipes
        .filter((row) => row.id !== 'cr-test-1')
        .map((row) => (row.id === 'cr-test-2' ? { ...row, servings: 4, sort: 0 } : row)),
    };
    expect(() => diffHousehold(before, after, { mode: 'send' })).toThrow();
    const { send } = diffHousehold(before, after, {
      mode: 'send',
      maxDeletes: { collection_recipes: 1 },
    });
    expect(send).toEqual([
      {
        kind: 'patch',
        table: 'collection_recipes',
        id: 'cr-test-2',
        changes: { servings: 4, sort: 0 },
      },
      { kind: 'delete', table: 'collection_recipes', id: 'cr-test-1' },
    ]);
  });
});

describe('spec 0013: notification settings, times and reservation in the rows', () => {
  const settingsRow = (overrides: Row = { id: 'ns-enrico' }): Row => ({
    household_id: DEMO_HOUSEHOLD_ID,
    member_id: ENRICO,
    daily_summary_enabled: false,
    daily_summary_at: '07:30:00',
    daily_summary_parts: ['meals', 'activities', 'chores', 'prep'],
    activities_eve_enabled: false,
    activities_eve_at: '19:00:00',
    chore_reminders_enabled: true,
    reservation_reminders_enabled: true,
    created_at: SERVER_TIME,
    updated_at: SERVER_TIME,
    ...overrides,
  });

  function withSettings(rows: Row[]) {
    const { data } = demo();
    const { tables, small } = asServerTables(householdToRows(data));
    tables.notification_settings = Object.fromEntries(rows.map((row) => [row.id, row]));
    return { tables, small };
  }

  it('AC-011: the own row reads as the domain settings, the database times "HH:MM:SS" as "HH:MM"', () => {
    const { tables, small } = withSettings([settingsRow()]);
    const back = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID, { memberId: ENRICO });
    expect(back.notificationSettings).toEqual({
      id: 'ns-enrico',
      memberId: ENRICO,
      dailySummaryEnabled: false,
      dailySummaryAt: '07:30',
      dailySummaryParts: ['meals', 'activities', 'chores', 'prep'],
      activitiesEveEnabled: false,
      activitiesEveAt: '19:00',
      choreRemindersEnabled: true,
      reservationRemindersEnabled: true,
    });
  });

  it('AC-013: only the signed-in member’s row is her settings; without one there are none', () => {
    const { tables, small } = withSettings([
      settingsRow({ id: 'ns-nadja', member_id: NADJA, daily_summary_enabled: true }),
    ]);
    expect(
      rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID, { memberId: ENRICO }).notificationSettings,
    ).toBeUndefined();
    expect(
      rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID, { memberId: NADJA }).notificationSettings
        ?.dailySummaryEnabled,
    ).toBe(true);
  });

  it('AC-012: a change of the settings is one patch of only the changed columns, times with seconds', () => {
    const { tables, small } = withSettings([settingsRow()]);
    const before = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID, { memberId: ENRICO });
    const settings = before.notificationSettings;
    if (!settings) throw new Error('fixture');
    const after: HouseholdData = {
      ...before,
      notificationSettings: {
        ...settings,
        dailySummaryEnabled: true,
        dailySummaryAt: '06:45',
        dailySummaryParts: ['meals', 'chores'],
      },
    };
    expect(diffHousehold(before, after, { mode: 'send' }).send).toEqual([
      {
        kind: 'patch',
        table: 'notification_settings',
        id: 'ns-enrico',
        changes: {
          daily_summary_enabled: true,
          daily_summary_at: '06:45:00',
          daily_summary_parts: ['meals', 'chores'],
        },
      },
    ]);
  });

  it('AC-013: a diff never inserts, deletes or moves a settings row', () => {
    const { tables, small } = withSettings([settingsRow()]);
    const before = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID, { memberId: ENRICO });
    const settings = before.notificationSettings;
    if (!settings) throw new Error('fixture');
    const removed: HouseholdData = { ...before, notificationSettings: undefined };
    expect(() => diffHousehold(before, removed, { mode: 'send' })).toThrow();
    const added: HouseholdData = { ...before, notificationSettings: { ...settings, id: 'ns-new' } };
    expect(() =>
      diffHousehold({ ...before, notificationSettings: undefined }, added, { mode: 'send' }),
    ).toThrow();
    const moved: HouseholdData = {
      ...before,
      notificationSettings: { ...settings, memberId: NADJA },
    };
    expect(() => diffHousehold(before, moved, { mode: 'send' })).toThrow(/member_id/);
  });

  it('households.timezone is read from the server and never written back', () => {
    const { data } = demo();
    const { tables, small } = asServerTables(householdToRows(data));
    const household = small.households?.[0];
    if (!household) throw new Error('fixture');
    small.households = [{ ...household, timezone: 'Europe/Berlin' }];
    const back = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID);
    expect(householdToRows(back).households?.[0]).not.toHaveProperty('timezone');
    const renamed: HouseholdData = { ...back, household: { ...back.household, name: 'Zuhause' } };
    expect(diffHousehold(back, renamed, { mode: 'send' }).send).toEqual([
      { kind: 'patch', table: 'households', id: DEMO_HOUSEHOLD_ID, changes: { name: 'Zuhause' } },
    ]);
  });

  it('AC-022, AC-025: the time of a chore goes there and back; none is null', () => {
    const { data } = demo();
    const rows = householdToRows(data);
    expect(rows.chores?.find((row) => row.id === 'chore-muell')).toMatchObject({
      due_time: '19:00:00',
    });
    expect(rows.chores?.find((row) => row.id === 'chore-bad')).toMatchObject({ due_time: null });
    const { tables, small } = asServerTables(rows);
    const back = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID);
    expect(back.chores.find((chore) => chore.id === 'chore-muell')?.dueTime).toBe('19:00');
    expect(back.chores.find((chore) => chore.id === 'chore-bad')).not.toHaveProperty(
      'dueTime',
      expect.anything(),
    );
  });

  it('AC-027, AC-029: a reservation and its reminder go there and back; 120 (the default) reads as undefined', () => {
    const { data } = demo();
    const rows = householdToRows(data);
    const reserved = rows.meal_plan_entries?.find((row) => row.reserved_at !== null);
    expect(reserved).toMatchObject({
      kind: 'restaurant',
      reserved_at: '19:30:00',
      remind_minutes_before: 120,
    });
    const recipeRow = rows.meal_plan_entries?.find((row) => row.kind === 'recipe');
    expect(recipeRow).toMatchObject({ reserved_at: null, remind_minutes_before: 120 });
    const id = String(reserved?.id);
    const { tables, small } = asServerTables(rows);
    const back = rowsToHousehold(tables, small, DEMO_HOUSEHOLD_ID);
    const entry = back.planEntries.find((candidate) => candidate.id === id);
    expect(entry?.reservedAt).toBe('19:30');
    expect(entry?.remindMinutesBefore).toBeUndefined();
    const oneHour = { ...tables.meal_plan_entries?.[id], id, remind_minutes_before: 60 };
    const changed = rowsToHousehold(
      { ...tables, meal_plan_entries: { ...tables.meal_plan_entries, [id]: oneHour } },
      small,
      DEMO_HOUSEHOLD_ID,
    );
    expect(changed.planEntries.find((candidate) => candidate.id === id)?.remindMinutesBefore).toBe(
      60,
    );
  });
});
