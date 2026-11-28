import { describe, expect, it } from 'vitest';

import { fakeClient } from '../_shared/test-fakes.ts';
import { HOUSEHOLD_ID, householdTables } from '../_shared/test-household.ts';
import { loadToolBase } from './tools.ts';

// Spec 0067, AC-025 (verified in step C): every household tool counts days in the household's
// zone (Europe/Berlin), not in UTC, so "morgen" at 23:30 is Berlin's next day.

const tables = (timezone?: string) => {
  const base = householdTables();
  return {
    ...base,
    households: base.households!.map((row) => ({ ...row, ...(timezone ? { timezone } : {}) })),
  };
};

describe('loadToolBase (AC-025)', () => {
  it('AC-025: 00:30 in Berlin is already the next day while UTC still says 23:30', async () => {
    const client = fakeClient({ tables: tables('Europe/Berlin') });
    const base = await loadToolBase(client, HOUSEHOLD_ID, new Date('2026-11-27T23:30:00Z'));
    expect(base.today).toBe('2026-11-28');
    expect(base.timeZone).toBe('Europe/Berlin');
  });

  it('AC-025: 23:30 in Berlin (22:30 UTC) is still today', async () => {
    const client = fakeClient({ tables: tables('Europe/Berlin') });
    const base = await loadToolBase(client, HOUSEHOLD_ID, new Date('2026-11-27T22:30:00Z'));
    expect(base.today).toBe('2026-11-27');
  });

  it('a household without a zone, or with a broken one, counts in Europe/Berlin', async () => {
    const now = new Date('2026-11-27T23:30:00Z');
    expect((await loadToolBase(fakeClient({ tables: tables() }), HOUSEHOLD_ID, now)).today).toBe(
      '2026-11-28',
    );
    const broken = await loadToolBase(
      fakeClient({ tables: tables('Mars/Olympus') }),
      HOUSEHOLD_ID,
      now,
    );
    expect(broken.today).toBe('2026-11-28');
  });
});
