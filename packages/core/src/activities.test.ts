import { describe, expect, it } from 'vitest';

import { findDuplicateActivity } from './activities';
import type { Activity } from './types';

function activity(partial: Partial<Activity> & Pick<Activity, 'id' | 'name'>): Activity {
  return {
    tags: [],
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
