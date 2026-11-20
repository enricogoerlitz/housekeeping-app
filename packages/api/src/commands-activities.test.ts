// Activity commands in demo mode (spec 0004): create and edit with the duplicate check, the place
// from a map link, favourites and ratings per member, and what the demo household brings along.
import { addDays, visitsOf } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import {
  createActivity,
  rateActivity,
  readActivityMapsLink,
  resolveActivityShortLink,
  toggleActivityFavorite,
  updateActivity,
} from './commands-activities';
import { setCurrentMember } from './commands-household';
import { ENRICO, NADJA, SLOT_MORNING, TEST_HOUSEHOLD_ID } from './seed/demo';
import { getData, getState, setState } from './store';
import { TODAY, withDemoHousehold } from './test-helpers';

withDemoHousehold();

const activityById = (id: string) => getData().activities.find((activity) => activity.id === id);

describe('activity commands', () => {
  it('AC-007: an activity without name is not created', () => {
    const before = getData().activities;
    expect(() => createActivity({ name: '   ' })).toThrow('Name fehlt');
    expect(getData().activities).toBe(before);
  });

  it('creates an activity with trimmed fields at the top, made by the current member', () => {
    setCurrentMember(NADJA);
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

  it('a short link resolves to a place (demo: the sample place), not to a name', async () => {
    const place = await resolveActivityShortLink('https://maps.app.goo.gl/AbC123');
    expect(place.placeName).not.toBe('');
    expect(place.location).toBeDefined();
    expect(place.mapsUrl).toBe('https://maps.app.goo.gl/AbC123');
    expect(place).not.toHaveProperty('name');
  });

  it('AC-020: ratings and favourites are per member; a rating is clamped to 1–5', () => {
    setCurrentMember(NADJA);
    rateActivity('act-bouldern', 4);
    toggleActivityFavorite('act-bouldern');
    setCurrentMember(ENRICO);
    expect(activityById('act-bouldern')).toMatchObject({
      ratings: { [NADJA]: 4 },
      favoriteOf: [NADJA],
    });
    expect(activityById('act-bouldern')?.ratings[ENRICO]).toBeUndefined();
    rateActivity('act-bouldern', 9);
    expect(activityById('act-bouldern')?.ratings[ENRICO]).toBe(5);
    setCurrentMember(NADJA);
    toggleActivityFavorite('act-bouldern');
    expect(activityById('act-bouldern')?.favoriteOf).toEqual([]);
  });
});

describe('activities in the demo households', () => {
  it('AC-004: the demo household has Bouldern, Eislaufen and Spieleabend; only Eislaufen has a place', () => {
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

  it('AC-001: both households have Vormittag, Mittag and Abend in this order', () => {
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

  it('AC-005: the household "Test" has no activities', () => {
    setState((state) => ({ ...state, activeHouseholdId: TEST_HOUSEHOLD_ID }));
    expect(getData().activities).toEqual([]);
  });
});
