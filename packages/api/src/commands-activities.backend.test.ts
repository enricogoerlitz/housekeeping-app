// Activities (spec 0004): create and edit on the diff path, favourites and ratings
// over their RPCs, planning with a Zusatz, and "create while planning" as one apply_changes call.
import { addDays, normalizeText, visitsOf } from '@housekeeping/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { H, TODAY, withBackend } from './backend-test-helpers';
import {
  createActivity,
  rateActivity,
  readActivityMapsLink,
  resolveActivityShortLink,
  toggleActivityFavorite,
  updateActivity,
} from './commands-activities';
import {
  addPlanEntry,
  createAndPlanActivity,
  createAndPlanRecipe,
  createAndPlanRestaurant,
  updatePlanEntry,
} from './commands-plan';
import { ENRICO, NADJA, SLOT_DINNER, SLOT_MORNING } from './seed/demo';
import { getData, snapshot } from './store';
import type { ChangeOp } from './transport';

const fx = withBackend();

const opsOf = (index: number) => (fx.calls[index]?.args[1] ?? []) as ChangeOp[];
const activityById = (id: string) => getData().activities.find((activity) => activity.id === id);
const saturday = addDays(TODAY, 8);
const plan = (slotId: string) => ({ date: saturday, slotId, eaterIds: [ENRICO, NADJA] });

describe('activities (diff path)', () => {
  it('AC-004: created here, edited, shown on the other device with name_key and creator', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const id = createActivity({
      name: 'Klettern im Wald',
      placeName: 'Hochseilgarten',
      location: { lat: 50.9, lng: 6.9 },
      mapsUrl: 'https://maps.apple.com/?q=Hochseilgarten&ll=50.9,6.9',
    });
    updateActivity(id, { description: 'Mit Kursen' });
    await fx.settle(nadja);
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges', 'applyChanges']);
    expect(opsOf(0)).toEqual([
      expect.objectContaining({
        kind: 'insert',
        table: 'activities',
        row: expect.objectContaining({
          id,
          name: 'Klettern im Wald',
          name_key: normalizeText('Klettern im Wald'),
          place_name: 'Hochseilgarten',
          lat: 50.9,
          lng: 6.9,
          photo_path: null,
          created_by: ENRICO,
        }),
      }),
    ]);
    expect(opsOf(1)).toEqual([
      { kind: 'patch', table: 'activities', id, changes: { description: 'Mit Kursen' } },
    ]);
    expect(fx.server.row(H, 'activities', id)).toMatchObject({ created_by: ENRICO });
    expect(fx.nadjaData(nadja).activities.find((activity) => activity.id === id)).toMatchObject({
      name: 'Klettern im Wald',
      description: 'Mit Kursen',
      placeName: 'Hochseilgarten',
      createdBy: ENRICO,
    });
  });

  it('AC-008: a duplicate is refused before anything is sent', async () => {
    await fx.startEnrico();
    expect(() => createActivity({ name: 'BOULDERN' })).toThrow('Gibt es schon: Bouldern');
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('AC-020: favourite and rating use their RPCs, Nadja sees them; undo sends the opposite', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const restore = snapshot();
    toggleActivityFavorite('act-bouldern');
    rateActivity('act-bouldern', 4);
    await fx.settle(nadja);
    expect(fx.calls).toEqual([
      { fn: 'setActivityFavorite', args: ['act-bouldern', true] },
      { fn: 'setActivityRating', args: ['act-bouldern', 4] },
    ]);
    expect(fx.nadjaData(nadja).activities.find((a) => a.id === 'act-bouldern')).toMatchObject({
      favoriteOf: [ENRICO],
      ratings: { [ENRICO]: 4 },
    });
    restore();
    await fx.settle(nadja);
    expect(fx.calls.slice(2)).toEqual([
      { fn: 'setActivityRating', args: ['act-bouldern', null] },
      { fn: 'setActivityFavorite', args: ['act-bouldern', false] },
    ]);
    expect(activityById('act-bouldern')).toMatchObject({ favoriteOf: [], ratings: {} });
    expect(fx.nadjaData(nadja).activities.find((a) => a.id === 'act-bouldern')?.ratings).toEqual(
      {},
    );
  });

  it('AC-006 / AC-031 (spec 0003): a short link resolves on the server into a place', async () => {
    await fx.startEnrico();
    fx.server.setMapsLink('https://maps.app.goo.gl/eis', {
      name: 'Eisstadion Hohenschönhausen',
      location: { lat: 52.55, lng: 13.5 },
      mapsUrl: 'https://www.google.com/maps/place/Eisstadion/@52.55,13.5,17z',
    });
    await expect(resolveActivityShortLink('https://maps.app.goo.gl/eis')).resolves.toEqual({
      placeName: 'Eisstadion Hohenschönhausen',
      address: undefined,
      location: { lat: 52.55, lng: 13.5 },
      mapsUrl: 'https://www.google.com/maps/place/Eisstadion/@52.55,13.5,17z',
    });
  });
});

describe('activities in the plan', () => {
  it('AC-013: the entry carries activity_id and the Zusatz; Nadja sees it', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const id = addPlanEntry({
      ...plan(SLOT_MORNING),
      kind: 'activity',
      activityId: 'act-eislaufen',
      note: 'Hohenschönhausen',
    });
    await fx.settle(nadja);
    expect(opsOf(0)).toEqual([
      expect.objectContaining({
        kind: 'insert',
        table: 'meal_plan_entries',
        row: expect.objectContaining({
          id,
          kind: 'activity',
          activity_id: 'act-eislaufen',
          note: 'Hohenschönhausen',
          slot_id: SLOT_MORNING,
        }),
      }),
    ]);
    expect(fx.nadjaData(nadja).planEntries.find((entry) => entry.id === id)).toMatchObject({
      kind: 'activity',
      activityId: 'act-eislaufen',
      note: 'Hohenschönhausen',
    });
  });

  it('switching away from an activity patches activity_id to null and keeps the Zusatz (spec 0021)', async () => {
    await fx.startEnrico();
    const entry = getData().planEntries.find(
      (candidate) => candidate.kind === 'activity' && candidate.note,
    );
    if (!entry) throw new Error('fixture');
    updatePlanEntry(entry.id, { kind: 'text', text: 'Spazieren gehen' });
    await fx.settle();
    expect(opsOf(0)).toEqual([
      {
        kind: 'patch',
        table: 'meal_plan_entries',
        id: entry.id,
        changes: { kind: 'text', activity_id: null, text: 'Spazieren gehen' },
      },
    ]);
    expect(fx.server.row(H, 'meal_plan_entries', entry.id)).toMatchObject({
      kind: 'text',
      activity_id: null,
      note: entry.note,
    });
  });

  it('an activity in the plan cannot be planned away by a delete of the activity (restrict)', async () => {
    await fx.startEnrico();
    await expect(
      fx.server
        .transport(ENRICO)
        .applyChanges(H, [{ kind: 'delete', table: 'activities', id: 'act-bouldern' }]),
    ).rejects.toMatchObject({ code: '23503' });
  });
});

describe('create while planning: one apply_changes call each (REQ-008)', () => {
  it('AC-021: the activity and its entry go in one call, the activity first', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const { activityId, entryId } = createAndPlanActivity(
      { name: 'Klettern im Wald' },
      plan(SLOT_MORNING),
    );
    await fx.settle(nadja);
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0).map((op) => (op.kind === 'insert' ? [op.table, op.row.id] : op.kind))).toEqual([
      ['activities', activityId],
      ['meal_plan_entries', entryId],
    ]);
    expect(fx.nadjaData(nadja).planEntries.find((entry) => entry.id === entryId)).toMatchObject({
      activityId,
      date: saturday,
      slotId: SLOT_MORNING,
    });
    expect(fx.nadjaData(nadja).activities.some((activity) => activity.id === activityId)).toBe(
      true,
    );
  });

  it('AC-022: a new recipe and a new restaurant are each created and planned in one call', async () => {
    await fx.startEnrico();
    const soup = createAndPlanRecipe({ title: 'Kürbissuppe' }, plan(SLOT_DINNER));
    const lokal = createAndPlanRestaurant(
      {
        name: 'Neues Lokal',
        location: { lat: 50.94, lng: 6.95 },
        mapsUrl: 'https://www.google.com/maps/place/Neues+Lokal/@50.94,6.95,17z',
      },
      plan(SLOT_DINNER),
    );
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges', 'applyChanges']);
    const inserted = (index: number) =>
      opsOf(index).map((op) => (op.kind === 'insert' ? [op.table, op.row.id] : op.kind));
    expect(inserted(0)).toEqual([
      ['recipes', soup.recipeId],
      ['meal_plan_entries', soup.entryId],
    ]);
    expect(inserted(1)).toEqual([
      ['restaurants', lokal.restaurantId],
      ['meal_plan_entries', lokal.entryId],
    ]);
    expect(fx.server.row(H, 'meal_plan_entries', soup.entryId)).toMatchObject({
      recipe_id: soup.recipeId,
    });
    expect(fx.server.row(H, 'meal_plan_entries', lokal.entryId)).toMatchObject({
      restaurant_id: lokal.restaurantId,
    });
  });

  it('AC-023: without name nothing is sent', async () => {
    await fx.startEnrico();
    const before = getData();
    expect(() => createAndPlanActivity({ name: '' }, plan(SLOT_MORNING))).toThrow('Name fehlt');
    await fx.settle();
    expect(fx.calls).toEqual([]);
    expect(getData()).toBe(before);
  });

  it('undo of create-and-plan removes both again, entry first', async () => {
    await fx.startEnrico();
    const restore = snapshot();
    const { activityId, entryId } = createAndPlanActivity(
      { name: 'Klettern im Wald' },
      plan(SLOT_MORNING),
    );
    await fx.settle();
    restore();
    await fx.settle();
    expect(opsOf(1)).toEqual([
      { kind: 'delete', table: 'meal_plan_entries', id: entryId },
      { kind: 'delete', table: 'activities', id: activityId },
    ]);
    expect(fx.server.row(H, 'activities', activityId)).toBeUndefined();
  });
});

describe('activity commands: input and local effect', () => {
  beforeEach(async () => {
    await fx.startEnrico();
  });

  it('AC-007: an activity without name is not created', () => {
    const before = getData().activities;
    expect(() => createActivity({ name: '   ' })).toThrow('Name fehlt');
    expect(getData().activities).toBe(before);
  });

  it('creates an activity with trimmed fields at the top, made by the current member', async () => {
    await fx.startAs(NADJA);
    const id = createActivity({
      name: ' Klettern im Wald ',
      description: '  ',
      placeName: ' Hochseilgarten ',
    });
    expect(getData().activities[0]).toMatchObject({
      id,
      name: 'Klettern im Wald',
      description: undefined,
      placeName: 'Hochseilgarten',
      tags: [],
      favoriteOf: [],
      ratings: {},
      createdBy: NADJA,
    });
  });

  it('AC-008: "bouldern" is reported as "Gibt es schon: Bouldern" and nothing is created', () => {
    const before = getData().activities;
    expect(() => createActivity({ name: 'bouldern' })).toThrow('Gibt es schon: Bouldern');
    expect(getData().activities).toBe(before);
  });

  it('AC-008: renaming to the name of another activity is refused; its own name is fine', () => {
    expect(() => updateActivity('act-spieleabend', { name: 'Eislaufen ' })).toThrow(
      'Gibt es schon: Eislaufen',
    );
    expect(() => updateActivity('act-spieleabend', { name: ' ' })).toThrow('Name fehlt');
    updateActivity('act-eislaufen', { name: 'eislaufen', description: ' Mit Glühwein ' });
    expect(activityById('act-eislaufen')).toMatchObject({
      name: 'eislaufen',
      description: 'Mit Glühwein',
    });
  });

  it('removes the place when every place field is cleared', () => {
    updateActivity('act-eislaufen', {
      placeName: undefined,
      address: undefined,
      location: undefined,
      mapsUrl: undefined,
    });
    const eislaufen = activityById('act-eislaufen');
    expect(eislaufen?.placeName).toBeUndefined();
    expect(eislaufen?.location).toBeUndefined();
    expect(eislaufen?.mapsUrl).toBeUndefined();
    expect(eislaufen?.name).toBe('Eislaufen');
  });

  it('AC-006: a Google Maps link gives the place with coordinates; the name stays free', () => {
    const url =
      'https://www.google.com/maps/place/Eisstadion+Hohensch%C3%B6nhausen/@52.55,13.5,17z';
    expect(readActivityMapsLink(url)).toEqual({
      status: 'place',
      place: {
        placeName: 'Eisstadion Hohenschönhausen',
        location: { lat: 52.55, lng: 13.5 },
        mapsUrl: url,
      },
    });
    expect(readActivityMapsLink('hallo welt')).toEqual({ status: 'invalid' });
    expect(readActivityMapsLink('https://maps.app.goo.gl/AbC123')).toEqual({
      status: 'short',
      url: 'https://maps.app.goo.gl/AbC123',
    });
  });

  it('AC-020: ratings and favourites are per member; an invalid rating is refused (spec 0011)', async () => {
    const nadja = await fx.startAs(NADJA);
    rateActivity('act-bouldern', 4);
    toggleActivityFavorite('act-bouldern');
    await fx.settle(nadja);
    await fx.startEnrico();
    expect(activityById('act-bouldern')).toMatchObject({
      ratings: { [NADJA]: 4 },
      favoriteOf: [NADJA],
    });
    expect(activityById('act-bouldern')?.ratings[ENRICO]).toBeUndefined();
    expect(() => rateActivity('act-bouldern', 9)).toThrow();
    expect(activityById('act-bouldern')?.ratings[ENRICO]).toBeUndefined();
  });
});

describe('activities of the sample household', () => {
  beforeEach(async () => {
    await fx.startEnrico();
  });

  it('AC-004: Bouldern, Eislaufen and Spieleabend; only Eislaufen has a place', () => {
    const activities = getData().activities;
    expect(activities.map((activity) => activity.name).sort()).toEqual([
      'Bouldern',
      'Eislaufen',
      'Spieleabend',
    ]);
    expect(activityById('act-eislaufen')).toMatchObject({
      placeName: 'Eisstadion Hohenschönhausen',
      location: { lat: 52.55, lng: 13.5 },
    });
    expect(activityById('act-spieleabend')?.location).toBeUndefined();
    expect(activityById('act-spieleabend')?.placeName).toBeUndefined();
  });

  it('AC-016: Bouldern was done 12, 30 and 45 days ago and is planned again in 3 days', () => {
    const visits = visitsOf('activity', 'act-bouldern', getData().planEntries, TODAY);
    expect(visits).toEqual({
      count: 3,
      lastOn: addDays(TODAY, -12),
      daysSince: 12,
      dates: [addDays(TODAY, -12), addDays(TODAY, -30), addDays(TODAY, -45)],
    });
    expect(
      getData().planEntries.some(
        (entry) => entry.activityId === 'act-bouldern' && entry.date === addDays(TODAY, 3),
      ),
    ).toBe(true);
  });

  it('AC-019: today Eislaufen is planned in the morning, with a Zusatz', () => {
    const today = getData().planEntries.filter(
      (entry) => entry.date === TODAY && entry.kind === 'activity',
    );
    expect(today).toEqual([
      expect.objectContaining({
        activityId: 'act-eislaufen',
        slotId: SLOT_MORNING,
        note: 'Hohenschönhausen',
      }),
    ]);
  });
});
