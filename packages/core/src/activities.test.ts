import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_SORTS,
  activityMatches,
  findDuplicateActivity,
  sortActivities,
} from './activities';
import type { Activity, MealPlanEntry } from './types';

function activity(partial: Partial<Activity> & Pick<Activity, 'id' | 'name'>): Activity {
  return {
    favoriteOf: [],
    ratings: {},
    createdAt: '2026-11-01T12:00:00.000Z',
    ...partial,
  };
}

describe('findDuplicateActivity', () => {
  const bouldern = activity({ id: 'act-bouldern', name: 'Bouldern' });
  const eislaufen = activity({ id: 'act-eislaufen', name: 'Eislaufen' });

  it('AC-008: "bouldern" finds the existing "Bouldern"', () => {
    expect(findDuplicateActivity('bouldern', [eislaufen, bouldern])).toBe(bouldern);
  });

  it('AC-008: compares like the database key — spaces, case and umlauts do not matter', () => {
    const muehle = activity({ id: 'act-muehle', name: 'Mühle besuchen' });
    expect(findDuplicateActivity('  MUEHLE   besuchen ', [muehle])).toBe(muehle);
  });

  it('returns undefined for a new name, an empty name or no activities', () => {
    expect(findDuplicateActivity('Bouldern im Wald', [eislaufen, bouldern])).toBeUndefined();
    expect(findDuplicateActivity('   ', [eislaufen, bouldern])).toBeUndefined();
    expect(findDuplicateActivity('Bouldern', [])).toBeUndefined();
  });
});

describe('activity search and sort (spec 0031, REQ-021)', () => {
  const me = 'member-enrico';
  const today = '2026-11-20';
  const done = (id: string, activityId: string, date: string): MealPlanEntry => ({
    id,
    date,
    slotId: 'slot-abend',
    kind: 'activity',
    activityId,
    eaterIds: [],
    guests: 0,
    portions: 0,
    variants: [],
    sort: 0,
  });
  const bouldern = activity({
    id: 'act-bouldern',
    name: 'Bouldern',
    placeName: 'Ostbloc',
    address: 'Hauptstraße 3, Berlin-Friedrichshain',
    ratings: { [me]: 4 },
  });
  const eislaufen = activity({
    id: 'act-eislaufen',
    name: 'Eislaufen',
    description: 'Mit Glühwein danach',
    ratings: { [me]: 5 },
  });
  const kino = activity({ id: 'act-kino', name: 'Kino' });
  const angeln = activity({ id: 'act-angeln', name: 'Angeln' });
  const entries = [
    done('e1', 'act-bouldern', '2026-11-18'),
    done('e2', 'act-eislaufen', '2026-11-10'),
    done('e3', 'act-kino', '2026-11-18'),
  ];
  const context = { me, entries, today };
  const names = (list: readonly Activity[]) => list.map((entry) => entry.name);

  it('AC-052: finds an activity by name, place, address or description', () => {
    expect(activityMatches('ostbloc', bouldern)).toBe(true);
    expect(activityMatches('Friedrichshain', bouldern)).toBe(true);
    expect(activityMatches('Glühwein', eislaufen)).toBe(true);
    expect(activityMatches('', kino)).toBe(true);
    expect(activityMatches('Pizza', kino)).toBe(false);
  });

  it('AC-053: "Zuletzt besucht" puts the newest first, never done last, ties by name', () => {
    const sorted = sortActivities([angeln, eislaufen, kino, bouldern], 'recent', context);
    expect(names(sorted)).toEqual(['Bouldern', 'Kino', 'Eislaufen', 'Angeln']);
  });

  it('AC-053: "Bewertung" puts the own best first, ties and unrated by name', () => {
    const sorted = sortActivities([kino, bouldern, angeln, eislaufen], 'rating', context);
    expect(names(sorted)).toEqual(['Eislaufen', 'Bouldern', 'Angeln', 'Kino']);
  });

  it('AC-053: "A–Z" sorts by name and leaves the input alone', () => {
    const input = [kino, bouldern, angeln, eislaufen];
    expect(names(sortActivities(input, 'name', context))).toEqual([
      'Angeln',
      'Bouldern',
      'Eislaufen',
      'Kino',
    ]);
    expect(names(input)).toEqual(['Kino', 'Bouldern', 'Angeln', 'Eislaufen']);
  });

  it('REQ-021: the sort menu says "A–Z", "Bewertung" and "Zuletzt besucht" like restaurants', () => {
    expect(ACTIVITY_SORTS.map((sort) => sort.label)).toEqual([
      'A–Z',
      'Bewertung',
      'Zuletzt besucht',
    ]);
  });
});
