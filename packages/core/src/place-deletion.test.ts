import { describe, expect, it } from 'vitest';

import { placeDeletionEffect } from './place-deletion';
import { deletedNotice } from './recipe-deletion';
import type { MealPlanEntry } from './types';

const entry = (id: string, partial: Partial<MealPlanEntry>): MealPlanEntry => ({
  id,
  date: '2026-11-22',
  slotId: 'abend',
  kind: 'restaurant',
  eaterIds: ['enrico', 'nadja'],
  guests: 0,
  portions: 2,
  variants: [],
  sort: 0,
  ...partial,
});

const enzo = { id: 'enzo', name: 'Trattoria Da Enzo' };
const eislaufen = { id: 'eislaufen', name: 'Eislaufen' };

describe('placeDeletionEffect (spec 0024, REQ-010)', () => {
  const entries = [
    entry('past', { date: '2026-11-03', restaurantId: 'enzo' }),
    entry('today', { date: '2026-11-22', restaurantId: 'enzo', startsAt: '19:30' }),
    entry('later', { date: '2026-11-28', restaurantId: 'enzo', startsAt: '19:30' }),
    entry('noted', { date: null, restaurantId: 'enzo' }),
    entry('other', { date: '2026-11-28', restaurantId: 'pho' }),
    entry('eis-past', {
      date: '2026-11-08',
      kind: 'activity',
      activityId: 'eislaufen',
      note: 'Halle Nord',
    }),
    entry('eis-later', { date: '2026-12-05', kind: 'activity', activityId: 'eislaufen' }),
  ];

  it('AC-034: entries up to today become free text with the name, later and noted ones go', () => {
    const effect = placeDeletionEffect(entries, 'restaurant', enzo, '2026-11-22');
    expect(effect.removedIds).toEqual(['later', 'noted']);
    expect(effect.converted.map((converted) => converted.id)).toEqual(['past', 'today']);
    expect(effect.converted[1]).toEqual({
      ...entries[1],
      kind: 'text',
      restaurantId: undefined,
      startsAt: undefined,
      text: 'Trattoria Da Enzo',
    });
  });

  it('AC-036: an activity becomes free text with its Zusatz in parentheses', () => {
    const effect = placeDeletionEffect(entries, 'activity', eislaufen, '2026-11-22');
    expect(effect.removedIds).toEqual(['eis-later']);
    expect(effect.converted).toEqual([
      {
        ...entries[5],
        kind: 'text',
        activityId: undefined,
        note: undefined,
        text: 'Eislaufen (Halle Nord)',
      },
    ]);
  });

  it('AC-034: other entries are not touched', () => {
    const effect = placeDeletionEffect(
      entries,
      'restaurant',
      { id: 'pho', name: 'Pho' },
      '2026-11-01',
    );
    expect(effect.converted).toEqual([]);
    expect(effect.removedIds).toEqual(['other']);
  });

  it('AC-034: the notice names the planned entries that go', () => {
    const effect = placeDeletionEffect(entries, 'restaurant', enzo, '2026-11-22');
    expect(deletedNotice(enzo.name, { entries: 1 })).toBe(
      'Trattoria Da Enzo gelöscht · 1 geplanter Eintrag entfällt',
    );
    expect(deletedNotice(enzo.name, { entries: effect.removedIds.length })).toBe(
      'Trattoria Da Enzo gelöscht · 2 geplante Einträge entfallen',
    );
    expect(deletedNotice(enzo.name, { entries: 0 })).toBe('Trattoria Da Enzo gelöscht');
  });
});
