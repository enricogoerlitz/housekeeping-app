import { describe, expect, it } from 'vitest';

import {
  applyLabel,
  imageTarget,
  namedEntity,
  recheckAction,
  resolveAction,
  type ProposalData,
} from './agent-apply';
import type { AgentAction } from './agent-proposals';
import { articles, mangoCurry } from './test-fixtures';
import type { Activity, Chore, MealPlanEntry, Restaurant, ShoppingItem } from './types';

const bad: Chore = {
  id: '6f1c0f5e-0000-4000-8000-000000000001',
  title: 'Bad putzen',
  room: 'Bad',
  recurrence: { type: 'flexible', everyDays: 7 } as Chore['recurrence'],
  assignment: { type: 'anyone' },
  effort: 1,
  nextDueOn: '2026-11-27',
};
const enzo: Restaurant = {
  id: 'r-enzo',
  name: 'Trattoria Da Enzo',
  tags: [],
  favoriteOf: [],
  ratings: {},
  createdAt: '2026-11-01T10:00:00Z',
};
const bouldern: Activity = {
  id: 'a-bouldern',
  name: 'Bouldern',
  favoriteOf: [],
  ratings: {},
  createdAt: '2026-11-01T10:00:00Z',
  remembered: false,
};
const milkItem: ShoppingItem = {
  id: 'i-milch',
  articleId: 'art-milch',
  contributions: [],
  checked: false,
  createdAt: '2026-11-26T10:00:00Z',
};
const curryWednesday: MealPlanEntry = {
  id: 'e-curry',
  date: '2026-12-02',
  slotId: 'slot-abend',
  kind: 'recipe',
  recipeId: mangoCurry.id,
  eaterIds: [],
  guests: 0,
  portions: 2,
  variants: [],
  sort: 0,
} as MealPlanEntry;

const data = (patch: Partial<ProposalData> = {}): ProposalData => ({
  today: '2026-11-27',
  memberId: 'm-enrico',
  mealSlots: [
    { id: 'slot-mittag', name: 'Mittagessen', sort: 1 },
    { id: 'slot-abend', name: 'Abendessen', sort: 2 },
  ],
  articles,
  items: [milkItem],
  chores: [bad],
  recipes: [mangoCurry],
  restaurants: [enzo],
  activities: [bouldern],
  planEntries: [],
  recurringItems: [],
  ...patch,
});

const act = (fields: Partial<AgentAction> & Pick<AgentAction, 'kind' | 'name'>): AgentAction =>
  fields;

describe('agent proposals in the household’s data (spec 0067, REQ-009)', () => {
  it('AC-017: four entries with their lines and commands', () => {
    const entries = [
      act({ kind: 'add_to_list', name: 'Milch' }),
      act({ kind: 'add_to_list', name: '6 Eier' }),
      act({ kind: 'chore_done', name: 'bad putzen' }),
      act({
        kind: 'plan',
        target: 'recipe',
        name: 'Mango-Curry',
        date: '2026-12-02',
        slot: 'Abendessen',
      }),
    ].map((entry) => resolveAction(entry, data()));
    expect(entries.map((entry) => [entry.title, entry.detail, entry.problem])).toEqual([
      ['Milch', 'Auf die Liste', undefined],
      ['6 Eier', 'Auf die Liste', undefined],
      ['Bad putzen', 'Erledigt · heute', undefined],
      [mangoCurry.title, 'Mi 2.12. · Abendessen', undefined],
    ]);
    expect(entries[2]?.command).toEqual({ type: 'completeChore', choreId: bad.id });
    expect(entries[3]?.command).toEqual({
      type: 'plan',
      date: '2026-12-02',
      slotId: 'slot-abend',
      target: { kind: 'recipe', recipeId: mangoCurry.id },
    });
    expect(applyLabel(3)).toBe('3 übernehmen');
  });

  it('the line comes from the data, not from the model: the id names the row', () => {
    const entry = resolveAction(
      act({ kind: 'chore_done', id: bad.id, name: 'Alles löschen' }),
      data(),
    );
    expect(entry.title).toBe('Bad putzen');
    expect(entry.command).toEqual({ type: 'completeChore', choreId: bad.id });
  });

  it('AC-019: an entry whose row is gone fails with the reason', () => {
    const gone = resolveAction(
      act({ kind: 'plan', target: 'recipe', name: 'Lasagne', date: '2026-12-02' }),
      data(),
    );
    expect(gone.problem).toBe('Das Rezept gibt es nicht');
    expect(gone.command).toBeUndefined();
    expect(
      resolveAction(act({ kind: 'plan', target: 'text', name: 'Oma', slot: 'Frühstück' }), data())
        .problem,
    ).toBe('Diese Tageszeit gibt es nicht');
  });

  it('REQ-009, stale data: a chore done on another device meanwhile is stale', () => {
    const action = act({ kind: 'chore_done', name: 'Bad putzen' });
    const seen = resolveAction(action, data()).seen;
    expect(recheckAction(action, seen, data()).result).toBe('ok');
    const doneElsewhere = data({ chores: [{ ...bad, nextDueOn: '2026-12-04' }] });
    expect(recheckAction(action, seen, doneElsewhere).result).toBe('stale');
  });

  it('REQ-009, stale data: another dish in the same meal meanwhile is stale', () => {
    const action = act({
      kind: 'plan',
      target: 'recipe',
      name: 'Mango-Curry',
      date: '2026-12-02',
      slot: 'Abendessen',
    });
    const seen = resolveAction(action, data()).seen;
    expect(recheckAction(action, seen, data({ planEntries: [curryWednesday] })).result).toBe(
      'stale',
    );
    expect(recheckAction(action, seen, data({ recipes: [] })).result).toBe('failed');
  });

  it('a new place in the calendar: "erst Bouldern, dann Restaurant" plans a new restaurant too', () => {
    const entry = resolveAction(
      act({
        kind: 'plan',
        target: 'restaurant',
        name: 'Lokal Neu',
        address: 'Hauptstr. 1, Berlin',
        date: '2026-11-28',
        slot: 'Abendessen',
        time: '19:30',
      }),
      data(),
    );
    expect(entry.detail).toBe('morgen · Abendessen · 19:30 Uhr · neu gemerkt');
    expect(entry.command).toMatchObject({
      target: { kind: 'newRestaurant', name: 'Lokal Neu', address: 'Hauptstr. 1, Berlin' },
      startsAt: '19:30',
    });
  });

  it('favourites and servings, already done is a reason', () => {
    expect(
      resolveAction(
        act({ kind: 'set_favorite', target: 'restaurant', name: 'trattoria da enzo' }),
        data(),
      ).command,
    ).toEqual({ type: 'favoriteRestaurant', restaurantId: enzo.id });
    expect(
      resolveAction(
        act({ kind: 'set_favorite', target: 'restaurant', name: enzo.name }),
        data({ restaurants: [{ ...enzo, favoriteOf: ['m-enrico'] }] }),
      ).problem,
    ).toBe('Ist schon Favorit');
    expect(
      resolveAction(act({ kind: 'set_favorite', target: 'activity', name: 'Bouldern' }), data())
        .command,
    ).toEqual({ type: 'rememberActivity', activityId: bouldern.id, remembered: true });
    expect(
      resolveAction(act({ kind: 'set_servings', name: mangoCurry.title, servings: 6 }), data())
        .detail,
    ).toBe(`6 statt ${mangoCurry.servings} Portionen`);
  });

  it('new places and Dauerposten: known ones are a reason', () => {
    expect(resolveAction(act({ kind: 'create_restaurant', name: enzo.name }), data()).problem).toBe(
      'Habt ihr schon',
    );
    expect(resolveAction(act({ kind: 'create_activity', name: 'Kino' }), data()).command).toEqual({
      type: 'createActivity',
      name: 'Kino',
    });
    const recurring = resolveAction(
      act({ kind: 'add_recurring', name: '2 Milch', weekday: 6, everyWeeks: 2 }),
      data(),
    );
    expect(recurring.detail).toBe('Dauerposten · alle 2 Wochen samstags');
    expect(recurring.command).toEqual({
      type: 'addRecurring',
      text: '2 Milch',
      rule: { type: 'weekly', every: 2, weekdays: [6] },
    });
    expect(
      resolveAction(
        act({ kind: 'add_recurring', name: 'Milch', weekday: 1 }),
        data({
          recurringItems: [
            {
              id: 'rec-1',
              articleId: 'art-milch',
              rule: { type: 'weekly', every: 1, weekdays: [1] },
              startsOn: '2026-11-01',
              paused: false,
              createdAt: '2026-11-01T00:00:00Z',
            },
          ],
        }),
      ).problem,
    ).toBe('Dafür gibt es schon einen Dauerposten');
  });

  it('deletes are destructive and name the row they remove', () => {
    const item = resolveAction(act({ kind: 'remove_from_list', name: 'Milch' }), data());
    expect(item).toMatchObject({
      title: 'Milch',
      destructive: true,
      command: { type: 'removeItem', itemId: milkItem.id },
    });
    expect(resolveAction(act({ kind: 'remove_from_list', name: 'Eier' }), data()).problem).toBe(
      'Steht nicht auf der Liste',
    );
    const entry = resolveAction(
      act({ kind: 'remove_plan_entry', name: mangoCurry.title, date: '2026-12-02' }),
      data({ planEntries: [curryWednesday] }),
    );
    expect(entry.command).toEqual({ type: 'removePlanEntry', entryId: curryWednesday.id });
    expect(resolveAction(act({ kind: 'delete_recurring', name: 'Milch' }), data()).problem).toBe(
      'Diesen Dauerposten gibt es nicht',
    );
  });

  it('a chore that does not exist becomes "Was anderes erledigt?"', () => {
    expect(
      resolveAction(act({ kind: 'chore_done', name: 'Fenster putzen' }), data()).command,
    ).toEqual({ type: 'logDone', title: 'Fenster putzen' });
  });
});

describe('the Tageszeit of a planned place (smoke 28.11.: 14:00 landed in "Abend")', () => {
  const at = (time?: string) =>
    resolveAction(
      {
        kind: 'plan',
        target: 'text',
        name: 'Museum',
        date: '2026-11-28',
        ...(time ? { time } : {}),
      },
      data(),
    ).detail;
  it('without a Tageszeit the time decides: midday until 17:00, then the evening', () => {
    expect(at('14:00')).toContain('Mittagessen');
    expect(at('19:30')).toContain('Abendessen');
  });
  it('without both the evening, as before', () => {
    expect(at()).toContain('Abendessen');
  });
});

describe('names in an answer (spec 0067, preview feedback 28.11.)', () => {
  it('a bold name that is a recipe, restaurant or activity opens it; others stay text', () => {
    expect(namedEntity('mango-curry', data())).toEqual({
      kind: 'recipe',
      id: mangoCurry.id,
      title: mangoCurry.title,
    });
    expect(namedEntity('Trattoria Da Enzo', data())).toMatchObject({ kind: 'restaurant' });
    expect(namedEntity('Bouldern', data())).toMatchObject({ kind: 'activity' });
    expect(namedEntity('Sa, 28.11.', data())).toBeUndefined();
  });
});

describe('what an agent image is for (spec 0067, REQ-011)', () => {
  it('the draft of the chat, or an entry by its name; an unknown one is none', () => {
    expect(imageTarget('draft', 'egal', data())).toEqual({ kind: 'draft' });
    expect(imageTarget('recipe', mangoCurry.title.toUpperCase(), data())).toEqual({
      kind: 'recipe',
      id: mangoCurry.id,
      title: mangoCurry.title,
    });
    expect(imageTarget('activity', 'bouldern', data())).toMatchObject({ id: bouldern.id });
    expect(imageTarget('restaurant', 'Unbekannt', data())).toBeUndefined();
    expect(imageTarget('recipe', undefined, data())).toBeUndefined();
  });
});
