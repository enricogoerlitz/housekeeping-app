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

const TODAY = '2026-11-20';
const demo = () => {
  const state = createInitialState(TODAY);
  const seeded = state.households[DEMO_HOUSEHOLD_ID];
  if (!seeded) throw new Error('demo household missing');
  return { data: seeded, members: state.members };
};

/** What the server adds to every row it sends: timestamps, and the table's own household_id. */
function asServerTables(rows: HouseholdRows): {
  tables: TableRows;
  small: Record<string, Row[]>;
} {
  const tables: TableRows = {};
  const small: Record<string, Row[]> = {};
  for (const [table, list] of Object.entries(rows)) {
    const withServerColumns = list.map((row) => ({
      created_at: '2026-11-01T10:00:00.000000Z',
      ...row,
      updated_at: '2026-11-01T10:00:00.000000Z',
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

/** Domain order rules applied to the seed: newest feedback first (documented normalisation). */
function normalised(data: HouseholdData): HouseholdData {
  return {
    ...data,
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
});
