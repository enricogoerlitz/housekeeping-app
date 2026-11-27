import { describe, expect, it } from 'vitest';

import {
  slotSideFor,
  addEntryDate,
  addEntryReducer,
  addEntryRequest,
  initialAddEntryState,
  type AddEntryAction,
  type AddEntryState,
  type AddEntryTarget,
} from './add-entry';
import { articlesById, bolognese, enrico, mangoCurry, nadja } from './test-fixtures';
import type { Activity, MealPlanEntry, Restaurant } from './types';

const SLOT_LUNCH = 'slot-mittag';
const SLOT_DINNER = 'slot-abend';
const DAY = '2026-11-27';
const members = [enrico, nadja];
const context = { members, articlesById };
const everyone = [enrico.id, nadja.id];

const enzo: Restaurant = {
  id: 'rest-enzo',
  name: 'Trattoria Da Enzo',
  tags: [],
  favoriteOf: [],
  ratings: {},
  createdAt: '2026-10-01T12:00:00.000Z',
};
const bouldern: Activity = {
  id: 'act-bouldern',
  name: 'Bouldern',
  favoriteOf: [],
  ratings: {},
  createdAt: '2026-10-01T12:00:00.000Z',
  remembered: true,
};
const lasagne: MealPlanEntry = {
  id: 'entry-lasagne',
  date: '2026-11-25',
  slotId: SLOT_DINNER,
  kind: 'recipe',
  recipeId: bolognese.id,
  eaterIds: everyone,
  guests: 0,
  portions: 2,
  variants: [],
  sort: 0,
};

const start = (target: AddEntryTarget = { date: DAY, slotId: SLOT_DINNER }) =>
  initialAddEntryState(target, { servings: 4 });
const run = (state: AddEntryState, ...actions: AddEntryAction[]) =>
  actions.reduce(addEntryReducer, state);

describe('addEntryReducer: the Tageszeit for breakfast (iPhone click-through, I-16)', () => {
  const SLOT_MORNING = 'slot-vormittag';
  const breakfast = {
    ...mangoCurry,
    id: 'r-brot',
    title: 'Avocado-Ei-Brot',
    course: 'breakfast' as const,
  };
  const choose = (recipe: typeof mangoCurry) => ({
    type: 'choose' as const,
    choice: { kind: 'recipe' as const, recipe },
    eaterIds: everyone,
    context,
    firstSlotId: SLOT_MORNING,
  });

  it('added to a day as a whole, a breakfast recipe starts in the first Tageszeit', () => {
    const state = run(
      start({ date: DAY, slotId: SLOT_DINNER, slotChosen: false }),
      choose(breakfast),
    );
    expect(state.slotId).toBe(SLOT_MORNING);
  });

  it('any other recipe keeps the last one ("Abend")', () => {
    const state = run(
      start({ date: DAY, slotId: SLOT_DINNER, slotChosen: false }),
      choose(mangoCurry),
    );
    expect(state.slotId).toBe(SLOT_DINNER);
  });

  it('a Tageszeit the user tapped ("+" in the Mittag row) stays, also for breakfast', () => {
    const state = run(start({ date: DAY, slotId: SLOT_LUNCH }), choose(breakfast));
    expect(state.slotId).toBe(SLOT_LUNCH);
  });
});

describe('slotSideFor (iPhone click-through, I-16)', () => {
  it('breakfast opens with the first Tageszeit, everything else with the last', () => {
    expect(slotSideFor('breakfast')).toBe('first');
    expect(slotSideFor('main')).toBe('last');
    expect(slotSideFor(undefined)).toBe('last');
  });
});

describe('addEntryReducer (spec 0031, REQ-023)', () => {
  it('AC-056: a restaurant chosen after a recipe carries no portions, time or Tageszeit of it', () => {
    const state = run(
      start(),
      {
        type: 'choose',
        choice: { kind: 'recipe', recipe: mangoCurry },
        eaterIds: everyone,
        context,
      },
      {
        type: 'setPortions',
        portions: { eaterIds: everyone, guests: 0, portions: 5, variants: [] },
      },
      { type: 'chooseSlot', slotId: SLOT_LUNCH },
      { type: 'setCook', cookId: nadja.id },
      { type: 'setGuests', guests: 2, context },
      { type: 'backToSearch' },
      {
        type: 'choose',
        choice: { kind: 'restaurant', restaurant: enzo },
        eaterIds: everyone,
        context,
      },
    );
    expect(state.choice).toEqual({ kind: 'restaurant', restaurant: enzo });
    expect(state.portions).toEqual({ eaterIds: everyone, guests: 0, portions: 2, variants: [] });
    expect(state.slotId).toBe(SLOT_DINNER);
    expect(state.cookId).toBeUndefined();
    expect(state.startsAt).toBeUndefined();
  });

  it('AC-056: a time set for a restaurant does not stay for the recipe chosen next', () => {
    const state = run(
      start(),
      {
        type: 'choose',
        choice: { kind: 'restaurant', restaurant: enzo },
        eaterIds: everyone,
        context,
      },
      { type: 'setStartsAt', startsAt: '19:30' },
      { type: 'backToSearch' },
      {
        type: 'choose',
        choice: { kind: 'recipe', recipe: mangoCurry },
        eaterIds: everyone,
        context,
      },
    );
    expect(state.startsAt).toBeUndefined();
    expect(state.portions.variants).toEqual([
      { variantId: 'v-tofu', portions: 1 },
      { variantId: 'v-haehnchen', portions: 1 },
    ]);
  });

  it('a day added as a whole keeps "without Tageszeit" until one is chosen', () => {
    const state = start({ date: DAY, slotId: SLOT_DINNER, slotChosen: false });
    expect(state.slotChosen).toBe(false);
    const chosen = run(
      state,
      { type: 'choose', choice: { kind: 'text' }, eaterIds: everyone, context },
      { type: 'chooseSlot', slotId: SLOT_LUNCH },
    );
    expect(chosen.slotChosen).toBe(true);
    expect(
      run(
        chosen,
        { type: 'backToSearch' },
        { type: 'choose', choice: { kind: 'text' }, eaterIds: everyone, context },
      ).slotChosen,
    ).toBe(false);
  });

  it('free text starts with what was searched for', () => {
    const state = run(
      start(),
      { type: 'setQuery', query: '  Essen bei Oma ' },
      { type: 'choose', choice: { kind: 'text' }, eaterIds: everyone, context },
    );
    expect(state.text).toBe('Essen bei Oma');
  });

  it('"Neu" starts with the searched name, a title typed before stays', () => {
    const state = run(
      start(),
      { type: 'setQuery', query: 'Paella ' },
      { type: 'startCreating', kind: 'recipe' },
    );
    expect(state.creating).toBe('recipe');
    expect(state.newTitle).toBe('Paella');
    const again = run(
      state,
      { type: 'stopCreating' },
      { type: 'setQuery', query: 'Pizza' },
      { type: 'startCreating', kind: 'collection' },
    );
    expect(again.newTitle).toBe('Paella');
  });

  it('"Ohne Tag vormerken" plans without a day and back', () => {
    const later = run(start(), { type: 'toggleLater' });
    expect(addEntryDate(later)).toBeNull();
    expect(addEntryDate(run(later, { type: 'toggleLater' }))).toBe(DAY);
    expect(start({ date: null, slotId: SLOT_DINNER }).later).toBe(true);
  });

  it('save with empty free text shows "Bitte etwas eintragen"', () => {
    const state = run(
      start(),
      { type: 'choose', choice: { kind: 'text' }, eaterIds: everyone, context },
      { type: 'save' },
    );
    expect(state.error).toBe('Bitte etwas eintragen');
    expect(addEntryRequest(state, everyone)).toBeUndefined();
    expect(run(state, { type: 'setText', text: 'Pizza' }).error).toBeUndefined();
  });

  it('a preset activity is chosen from the start', () => {
    const state = initialAddEntryState(
      { date: DAY, slotId: SLOT_DINNER },
      { servings: 4, activity: bouldern },
    );
    expect(state.choice).toEqual({ kind: 'activity', activity: bouldern });
  });
});

describe('addEntryRequest (spec 0031, REQ-023)', () => {
  it('a recipe goes with eaters, guests, cook, portions and the Zusatz in its title', () => {
    const state = run(
      start(),
      {
        type: 'choose',
        choice: { kind: 'recipe', recipe: mangoCurry },
        eaterIds: everyone,
        context,
      },
      { type: 'setCook', cookId: enrico.id },
      { type: 'setNote', note: 'doppelte Menge' },
    );
    expect(addEntryRequest(state, everyone)).toEqual({
      title: 'Mango-Curry (doppelte Menge)',
      input: {
        date: DAY,
        slotId: SLOT_DINNER,
        kind: 'recipe',
        recipeId: mangoCurry.id,
        eaterIds: everyone,
        guests: 0,
        cookId: enrico.id,
        portions: 2,
        variants: [
          { variantId: 'v-tofu', portions: 1 },
          { variantId: 'v-haehnchen', portions: 1 },
        ],
        note: 'doppelte Menge',
      },
    });
  });

  it('a restaurant takes its time, an activity who is "dabei" (spec 0041, AC-014)', () => {
    const restaurant = run(
      start(),
      {
        type: 'choose',
        choice: { kind: 'restaurant', restaurant: enzo },
        eaterIds: [enrico.id],
        context,
      },
      { type: 'setStartsAt', startsAt: '19:30' },
    );
    expect(addEntryRequest(restaurant, everyone)?.input).toMatchObject({
      kind: 'restaurant',
      restaurantId: enzo.id,
      eaterIds: [enrico.id],
      startsAt: '19:30',
    });
    const activity = run(
      start(),
      {
        type: 'choose',
        choice: { kind: 'activity', activity: bouldern },
        eaterIds: everyone,
        context,
      },
      { type: 'setEaters', eaterIds: [enrico.id], context },
      { type: 'setGuests', guests: 2, context },
    );
    expect(addEntryRequest(activity, everyone)?.input).toMatchObject({
      kind: 'activity',
      activityId: bouldern.id,
      eaterIds: [enrico.id],
      guests: 2,
    });
  });

  it('a time is only sent for restaurants and activities', () => {
    const state = run(
      start(),
      { type: 'choose', choice: { kind: 'text' }, eaterIds: everyone, context },
      { type: 'setStartsAt', startsAt: '12:00' },
      { type: 'setText', text: ' Essen bei Oma ' },
    );
    const request = addEntryRequest(state, everyone);
    expect(request?.input).not.toHaveProperty('startsAt');
    expect(request).toMatchObject({ title: 'Essen bei Oma', input: { text: 'Essen bei Oma' } });
  });

  it('leftovers go on the day with a portion per person, titled without Zusatz', () => {
    const state = run(start(), {
      type: 'choose',
      choice: { kind: 'leftovers', source: lasagne, title: 'Reste von Lasagne (Mi)' },
      eaterIds: everyone,
      context,
    });
    expect(addEntryRequest(state, everyone)).toEqual({
      title: 'Reste von Lasagne (Mi)',
      input: {
        date: DAY,
        slotId: SLOT_DINNER,
        kind: 'leftovers',
        recipeId: bolognese.id,
        leftoversOfEntryId: lasagne.id,
        eaterIds: everyone,
        portions: 2,
        variants: [],
        note: '',
      },
    });
  });

  it('nothing to send without a choice', () => {
    expect(addEntryRequest(start(), everyone)).toBeUndefined();
  });
});
