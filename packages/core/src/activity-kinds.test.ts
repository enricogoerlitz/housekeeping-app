import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_ICONS,
  activityIconOf,
  DEFAULT_ACTIVITY_ICON,
  countRememberFilters,
  DEFAULT_ACTIVITY_KINDS,
  filterRemembered,
  findDuplicateKind,
  isActivityIcon,
  kindNameProblem,
  REMEMBER_FILTERS,
} from './activity-kinds';
import type { Activity, ActivityKind } from './types';

const sport: ActivityKind = { id: 'sport', name: 'Sport', icon: 'dumbbell' };
const kindsById = { sport };

function activity(patch: Partial<Activity>): Activity {
  return {
    id: 'a',
    name: 'Bouldern',
    favoriteOf: [],
    ratings: {},
    createdAt: '2026-11-26T10:00:00Z',
    remembered: true,
    ...patch,
  };
}

describe('symbols', () => {
  it('Entscheidung 5: a fixed list of about 40 symbols, each once, with a German name', () => {
    expect(ACTIVITY_ICONS).toHaveLength(40);
    expect(new Set(ACTIVITY_ICONS.map((icon) => icon.name)).size).toBe(40);
    expect(ACTIVITY_ICONS.every((icon) => icon.label.length > 0)).toBe(true);
    expect(isActivityIcon('mountain')).toBe(true);
    expect(isActivityIcon('skull')).toBe(false);
    expect(isActivityIcon('constructor')).toBe(false);
  });

  it('AC-005: an own symbol wins over the kind, the kind over the default', () => {
    expect(activityIconOf(activity({ kindId: 'sport', icon: 'mountain' }), kindsById)).toBe(
      'mountain',
    );
    expect(activityIconOf(activity({ kindId: 'sport' }), kindsById)).toBe('dumbbell');
    expect(activityIconOf(activity({ kindId: 'deleted' }), kindsById)).toBe(DEFAULT_ACTIVITY_ICON);
    expect(activityIconOf(activity({}), kindsById)).toBe('mountain');
  });

  it('REQ-001: the default kinds use symbols of the list', () => {
    expect(DEFAULT_ACTIVITY_KINDS.map((kind) => kind.name)).toEqual([
      'Geburtstag',
      'Sport',
      'Ausflug',
      'Kultur',
      'Essen gehen',
      'Treffen',
      'Reise',
      'Sonstiges',
    ]);
    expect(DEFAULT_ACTIVITY_KINDS.every((kind) => isActivityIcon(kind.icon))).toBe(true);
  });
});

describe('kind names', () => {
  it('AC-002: finds an existing kind of the same name and checks a new name', () => {
    expect(findDuplicateKind(' sport ', [sport])).toBe(sport);
    expect(findDuplicateKind('Wellness', [sport])).toBeUndefined();
    expect(findDuplicateKind('Sport', [sport], 'sport')).toBeUndefined();
    expect(kindNameProblem('')).toBe('Name fehlt');
    expect(kindNameProblem('x'.repeat(41))).toBe('Höchstens 40 Zeichen');
    expect(kindNameProblem('Well\nness')).toBe('Name fehlt');
    expect(kindNameProblem('Wellness')).toBeUndefined();
  });
});

describe('Merken', () => {
  const autofahren = activity({ id: 'auto', name: 'Autofahren', remembered: false });
  const bouldern = activity({ id: 'b' });

  it('AC-012: "Gemerkt" leaves out what is not remembered; "Alle" and "Nicht gemerkt" show it', () => {
    expect(filterRemembered([autofahren, bouldern], 'remembered')).toEqual([bouldern]);
    expect(filterRemembered([autofahren, bouldern], 'all')).toEqual([autofahren, bouldern]);
    expect(filterRemembered([autofahren, bouldern], 'forgotten')).toEqual([autofahren]);
  });

  it('AC-016: the counts of "Gemerkt", "Alle" and "Nicht gemerkt" add up', () => {
    expect(countRememberFilters([autofahren, bouldern, activity({ id: 'c' })])).toEqual({
      remembered: 2,
      all: 3,
      forgotten: 1,
    });
  });

  it('AC-016: no activities, no counts', () => {
    expect(countRememberFilters([])).toEqual({ remembered: 0, all: 0, forgotten: 0 });
  });

  it('AC-013: the filter starts with "Gemerkt"', () => {
    expect(REMEMBER_FILTERS.map((filter) => filter.label)).toEqual([
      'Gemerkt',
      'Alle',
      'Nicht gemerkt',
    ]);
    expect(REMEMBER_FILTERS[0]?.value).toBe('remembered');
  });
});
