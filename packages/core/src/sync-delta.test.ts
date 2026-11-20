import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyMemberships,
  applyPull,
  compareTimestamps,
  createSyncCache,
  needsFullLoad,
  pullRequestFor,
  type HouseholdDelta,
  type PullResult,
  type SyncCache,
  type SyncRow,
} from './sync-delta';

const H1 = 'h1';
const H2 = 'h2';

function row(id: string, updatedAt: string, rest: Record<string, unknown> = {}): SyncRow {
  return { id, household_id: H1, updated_at: updatedAt, ...rest };
}

function delta(partial: Partial<HouseholdDelta> = {}): HouseholdDelta {
  return { full: false, rows: {}, tombstones: [], ...partial };
}

function pull(
  households: PullResult['households'],
  serverTime = '2026-11-20T10:00:00Z',
): PullResult {
  return { serverTime, small: {}, households };
}

/** A cache with household H1 loaded once: one recipe row. */
function loadedCache(): SyncCache {
  const cache = applyMemberships(createSyncCache(1), [H1]);
  return applyPull(
    cache,
    pull({
      [H1]: delta({
        full: true,
        rows: { recipes: [row('r1', '2026-11-20T09:00:00Z', { title: 'Dal' })] },
      }),
    }),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('compareTimestamps', () => {
  it('orders by instant, not by text, including offsets and microseconds', () => {
    expect(compareTimestamps('2026-11-20T10:00:00+01:00', '2026-11-20T09:30:00Z')).toBeLessThan(0);
    expect(
      compareTimestamps('2026-11-20 09:00:00.123457+00', '2026-11-20T09:00:00.123456Z'),
    ).toBeGreaterThan(0);
    expect(compareTimestamps('2026-11-20T09:00:00.5Z', '2026-11-20T09:00:00.500000+00:00')).toBe(0);
  });

  it('rejects text that is not a timestamp', () => {
    expect(() => compareTimestamps('gestern', '2026-11-20T09:00:00Z')).toThrow(/timestamp/i);
  });
});

describe('applyPull', () => {
  it('upserts rows into the household and table', () => {
    const cache = loadedCache();
    const next = applyPull(
      cache,
      pull({
        [H1]: delta({
          rows: {
            recipes: [row('r1', '2026-11-20T09:05:00Z', { title: 'Linsen-Dal' })],
            areas: [row('a1', '2026-11-20T09:06:00Z', { name: 'Obst' })],
          },
        }),
      }),
    );
    expect(next.households[H1]?.tables.recipes?.r1?.title).toBe('Linsen-Dal');
    expect(next.households[H1]?.tables.areas?.a1?.name).toBe('Obst');
  });

  it('AC-015: a tombstone removes the row from the cache', () => {
    const next = applyPull(
      loadedCache(),
      pull({
        [H1]: delta({
          tombstones: [{ table: 'recipes', id: 'r1', deletedAt: '2026-11-20T09:10:00Z' }],
        }),
      }),
    );
    expect(next.households[H1]?.tables.recipes?.r1).toBeUndefined();
  });

  it('undo: a row newer than its tombstone survives, in either order within one pull', () => {
    const tombstone = { table: 'recipes', id: 'r1', deletedAt: '2026-11-20T09:10:00Z' };
    const reinserted = row('r1', '2026-11-20T09:11:00Z', { title: 'Dal' });
    const next = applyPull(
      loadedCache(),
      pull({ [H1]: delta({ rows: { recipes: [reinserted] }, tombstones: [tombstone] }) }),
    );
    expect(next.households[H1]?.tables.recipes?.r1).toEqual(reinserted);
  });

  it('undo: a re-inserted row seen first is not removed by its older tombstone arriving later', () => {
    const reinserted = row('r1', '2026-11-20T09:11:00Z', { title: 'Dal' });
    const first = applyPull(
      loadedCache(),
      pull({ [H1]: delta({ rows: { recipes: [reinserted] } }) }),
    );
    const second = applyPull(
      first,
      pull({
        [H1]: delta({
          tombstones: [{ table: 'recipes', id: 'r1', deletedAt: '2026-11-20T09:10:00Z' }],
        }),
      }),
    );
    expect(second.households[H1]?.tables.recipes?.r1).toEqual(reinserted);
  });

  it('a tombstone newer than the row deletes it, also when the row arrives in the same pull', () => {
    const next = applyPull(
      loadedCache(),
      pull({
        [H1]: delta({
          rows: { recipes: [row('r1', '2026-11-20T09:10:00Z')] },
          tombstones: [{ table: 'recipes', id: 'r1', deletedAt: '2026-11-20T09:11:00Z' }],
        }),
      }),
    );
    expect(next.households[H1]?.tables.recipes?.r1).toBeUndefined();
  });

  it('an older row version arriving after its tombstone (safety window) stays deleted', () => {
    const deleted = applyPull(
      loadedCache(),
      pull({
        [H1]: delta({
          tombstones: [{ table: 'recipes', id: 'r1', deletedAt: '2026-11-20T09:11:00Z' }],
        }),
      }),
    );
    const next = applyPull(
      deleted,
      pull({ [H1]: delta({ rows: { recipes: [row('r1', '2026-11-20T09:10:00Z')] } }) }),
    );
    expect(next.households[H1]?.tables.recipes?.r1).toBeUndefined();
  });

  it('on equal times the tombstone wins (delete after insert in one transaction)', () => {
    const next = applyPull(
      loadedCache(),
      pull({
        [H1]: delta({
          rows: { recipes: [row('r1', '2026-11-20T09:10:00Z')] },
          tombstones: [{ table: 'recipes', id: 'r1', deletedAt: '2026-11-20T09:10:00Z' }],
        }),
      }),
    );
    expect(next.households[H1]?.tables.recipes?.r1).toBeUndefined();
  });

  it('never replaces a cached row with an older version of it', () => {
    const newer = applyPull(
      loadedCache(),
      pull({
        [H1]: delta({ rows: { recipes: [row('r1', '2026-11-20T09:20:00Z', { title: 'Neu' })] } }),
      }),
    );
    const next = applyPull(
      newer,
      pull({
        [H1]: delta({ rows: { recipes: [row('r1', '2026-11-20T09:05:00Z', { title: 'Alt' })] } }),
      }),
    );
    expect(next.households[H1]?.tables.recipes?.r1?.title).toBe('Neu');
  });

  it('is idempotent: applying the same pull twice changes nothing', () => {
    const sample = pull({
      [H1]: delta({
        rows: { recipes: [row('r2', '2026-11-20T09:05:00Z')] },
        tombstones: [{ table: 'recipes', id: 'r1', deletedAt: '2026-11-20T09:06:00Z' }],
      }),
    });
    const once = applyPull(loadedCache(), sample);
    expect(applyPull(once, sample)).toEqual(once);
  });

  it('advances the cursor to the latest received row or tombstone time', () => {
    const next = applyPull(
      loadedCache(),
      pull({
        [H1]: delta({
          rows: { recipes: [row('r2', '2026-11-20T09:05:00Z')] },
          tombstones: [{ table: 'recipes', id: 'r1', deletedAt: '2026-11-20T09:07:00Z' }],
        }),
      }),
    );
    expect(next.households[H1]?.cursors.recipes).toBe('2026-11-20T09:07:00Z');
  });

  it('does not advance the cursor on an empty pull, and never moves it back', () => {
    const cache = loadedCache();
    const empty = applyPull(cache, pull({ [H1]: delta() }, '2026-11-20T11:00:00Z'));
    expect(empty.households[H1]?.cursors).toEqual({ recipes: '2026-11-20T09:00:00Z' });

    // The safety window re-delivers a row from before the cursor.
    const overlap = applyPull(
      cache,
      pull({ [H1]: delta({ rows: { recipes: [row('r1', '2026-11-20T09:00:00Z')] } }) }),
    );
    expect(overlap.households[H1]?.cursors.recipes).toBe('2026-11-20T09:00:00Z');
  });

  it('picks up a late commit inside the safety window without moving the cursor', () => {
    const late = row('r9', '2026-11-20T08:59:00Z', { title: 'Spät' });
    const next = applyPull(loadedCache(), pull({ [H1]: delta({ rows: { recipes: [late] } }) }));
    expect(next.households[H1]?.tables.recipes?.r9).toEqual(late);
    expect(next.households[H1]?.cursors.recipes).toBe('2026-11-20T09:00:00Z');
  });

  it('keeps tombstones only while a row inside the safety window could still contradict them', () => {
    const next = applyPull(
      loadedCache(),
      pull({
        [H1]: delta({
          rows: { recipes: [row('r5', '2026-11-20T10:00:00Z')] },
          tombstones: [
            { table: 'recipes', id: 'old', deletedAt: '2026-11-20T09:50:00Z' },
            { table: 'recipes', id: 'recent', deletedAt: '2026-11-20T09:59:00Z' },
          ],
        }),
      }),
    );
    expect(next.households[H1]?.tombstones.recipes).toEqual({ recent: '2026-11-20T09:59:00Z' });
  });

  it('records the server time of the pull per household', () => {
    const next = applyPull(loadedCache(), pull({ [H1]: delta() }, '2026-11-21T07:00:00Z'));
    expect(next.households[H1]?.pulledAt).toBe('2026-11-21T07:00:00Z');
  });

  it('a full load replaces only that household and drops rows it no longer contains', () => {
    const both = applyPull(
      applyMemberships(loadedCache(), [H1, H2]),
      pull({ [H2]: delta({ full: true, rows: { recipes: [row('x1', '2026-11-20T09:00:00Z')] } }) }),
    );
    const next = applyPull(
      both,
      pull({
        [H1]: delta({ full: true, rows: { areas: [row('a1', '2026-11-20T08:00:00Z')] } }),
      }),
    );
    expect(next.households[H1]?.tables).toEqual({
      areas: { a1: row('a1', '2026-11-20T08:00:00Z') },
    });
    expect(next.households[H1]?.cursors).toEqual({ areas: '2026-11-20T08:00:00Z' });
    expect(next.households[H2]).toBe(both.households[H2]);
  });

  it('replaces small tables wholesale', () => {
    const cache = {
      ...createSyncCache(1),
      small: {
        profiles: [
          { id: 'p1', name: 'Enrico' },
          { id: 'p2', name: 'Nadja' },
        ],
      },
    };
    const next = applyPull(cache, {
      serverTime: '2026-11-20T10:00:00Z',
      small: { profiles: [{ id: 'p1', name: 'Enrico G.' }] },
      households: {},
    });
    expect(next.small.profiles).toEqual([{ id: 'p1', name: 'Enrico G.' }]);
  });
});

describe('pullRequestFor', () => {
  it('asks each loaded table for changes since cursor minus the 2-minute safety window', () => {
    expect(pullRequestFor(loadedCache())).toEqual({
      households: { [H1]: { full: false, since: { recipes: '2026-11-20T08:58:00.000Z' } } },
    });
  });

  it('asks for a full load of a household that was never pulled, without touching the others', () => {
    const cache = applyMemberships(loadedCache(), [H1, H2]);
    expect(pullRequestFor(cache).households).toEqual({
      [H1]: { full: false, since: { recipes: '2026-11-20T08:58:00.000Z' } },
      [H2]: { full: true },
    });
  });

  it('asks for a full load of households the caller names', () => {
    expect(pullRequestFor(loadedCache(), [H1]).households).toEqual({ [H1]: { full: true } });
  });
});

describe('needsFullLoad', () => {
  const options = { retentionDays: 30, cacheVersion: 2 };

  it('AC-018: first start and a changed cache version reset the whole cache', () => {
    expect(needsFullLoad(undefined, '2026-11-20T10:00:00Z', options)).toEqual({
      reset: true,
      householdIds: [],
    });
    expect(needsFullLoad(loadedCache(), '2026-11-20T10:00:00Z', options)).toEqual({
      reset: true,
      householdIds: [],
    });
  });

  it('a newly added household loads fully on its own', () => {
    const cache = applyMemberships(loadedCache(), [H1, H2]);
    expect(needsFullLoad(cache, '2026-11-20T10:00:00Z', { ...options, cacheVersion: 1 })).toEqual({
      reset: false,
      householdIds: [H2],
    });
  });

  it('AC-017: a household not pulled for longer than the retention loads fully', () => {
    const cache = loadedCache(); // pulled at 2026-11-20T10:00:00Z
    expect(
      needsFullLoad(cache, '2026-12-20T09:00:00Z', { ...options, cacheVersion: 1 }).householdIds,
    ).toEqual([]);
    expect(
      needsFullLoad(cache, '2026-12-20T10:00:00Z', { ...options, cacheVersion: 1 }).householdIds,
    ).toEqual([H1]);
  });

  it('AC-017: measures against the server time, never the device clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-06-01T00:00:00Z'));
    expect(
      needsFullLoad(loadedCache(), '2026-11-21T10:00:00Z', { ...options, cacheVersion: 1 }),
    ).toEqual({ reset: false, householdIds: [] });
  });
});

describe('applyMemberships', () => {
  it('AC-012: drops a household that is no longer listed, with all its data', () => {
    const cache: SyncCache = {
      ...applyMemberships(loadedCache(), [H1, H2]),
      small: {
        household_members: [
          { household_id: H1, profile_id: 'p1' },
          { household_id: H2, profile_id: 'p1' },
        ],
      },
    };
    const next = applyMemberships(cache, [H2]);
    expect(next.householdIds).toEqual([H2]);
    expect(next.households[H1]).toBeUndefined();
    expect(next.small.household_members).toEqual([{ household_id: H2, profile_id: 'p1' }]);
  });

  it('keeps open invitations to households the user is not a member of yet (to accept them)', () => {
    const invitation = { id: 'i1', household_id: H2, email: 'p1@example.com', accepted_at: null };
    const cache: SyncCache = {
      ...loadedCache(),
      small: {
        household_members: [{ household_id: H2, profile_id: 'p2' }],
        household_invitations: [invitation],
      },
    };
    const next = applyMemberships(cache, [H1]);
    expect(next.small.household_invitations).toEqual([invitation]);
    expect(next.small.household_members).toEqual([]);
  });

  it('keeps the data of households that are still listed', () => {
    const cache = loadedCache();
    expect(applyMemberships(cache, [H1]).households[H1]).toBe(cache.households[H1]);
  });
});
