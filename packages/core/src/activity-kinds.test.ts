import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_ICONS,
  activityEmptyState,
  activityIconOf,
  DEFAULT_ACTIVITY_ICON,
  countRememberFilters,
  DEFAULT_ACTIVITY_KINDS,
  filterRemembered,
  findDuplicateKind,
  isActivityIcon,
  kindNameProblem,
  leavesActivityList,
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

describe('Merken: leaving the list and the empty list (filter check 0067 D)', () => {
  it('AC-013: an activity opened from the list is not leaving it, so "Alle" stays on the way back', () => {
    expect(leavesActivityList('/aktivitaeten')).toBe(false);
    expect(leavesActivityList('/aktivitaet/0067d000-0000-4000-8000-000000000003')).toBe(false);
  });

  it('AC-013: another page leaves the list, so it opens with "Gemerkt" again', () => {
    expect(leavesActivityList('/verwalten')).toBe(true);
    expect(leavesActivityList('/rezepte')).toBe(true);
    expect(leavesActivityList('/')).toBe(true);
    expect(leavesActivityList('/aktivitaeten-alt')).toBe(true);
  });

  it('a search without hits names the word and offers "Alle zeigen" only while a filter narrows', () => {
    expect(activityEmptyState('  xyzzy ', 'remembered', false)).toEqual({
      title: 'Keine Aktivitäten für „xyzzy“',
      text: 'Probiere ein anderes Wort.',
      showAll: true,
    });
    expect(activityEmptyState('xyzzy', 'all', false)).toEqual({
      title: 'Keine Aktivitäten für „xyzzy“',
      text: 'Probiere ein anderes Wort.',
      showAll: false,
    });
  });

  it('AC-012: no remembered activity, no search: names "Gemerkt" and asks for no word', () => {
    expect(activityEmptyState('', 'remembered', false)).toEqual({
      title: 'Keine Aktivitäten unter „Gemerkt“',
      showAll: true,
    });
    expect(activityEmptyState(' ', 'forgotten', false)).toEqual({
      title: 'Keine Aktivitäten unter „Nicht gemerkt“',
      showAll: true,
    });
  });

  it('AC-016: "Favoriten" without hits is a plain empty filter', () => {
    expect(activityEmptyState('', 'remembered', true)).toEqual({
      title: 'Keine Aktivitäten für diese Filter',
      showAll: true,
    });
    expect(activityEmptyState('', 'all', true)).toEqual({
      title: 'Keine Aktivitäten für diese Filter',
      showAll: true,
    });
  });
});
