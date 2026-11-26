import { describe, expect, it } from 'vitest';

import { browseNeighbour, browsePosition } from './browse-order';

// Recipes "A–Z" as the list showed them (spec 0034, REQ-008).
const ORDER = ['apfelkuchen', 'arayes', 'bircher'] as const;

describe('swiping through the entries of the list I came from (spec 0034, REQ-008)', () => {
  it('AC-017: a swipe to the left opens the next entry in the order of the list', () => {
    expect(browseNeighbour(ORDER, 'apfelkuchen', 1)).toBe('arayes');
    expect(browseNeighbour(ORDER, 'arayes', -1)).toBe('apfelkuchen');
    expect(browsePosition(ORDER, 'arayes')).toEqual({ index: 1, count: 3 });
  });

  it('AC-018: past the last entry there is no neighbour, so the page springs back', () => {
    expect(browseNeighbour(ORDER, 'bircher', 1)).toBeUndefined();
    expect(browseNeighbour(ORDER, 'apfelkuchen', -1)).toBeUndefined();
    expect(browsePosition(ORDER, 'bircher')).toEqual({ index: 2, count: 3 });
  });

  it('AC-019: without a list, or an entry not in it (e.g. from the calendar), there is no swipe', () => {
    expect(browsePosition(undefined, 'arayes')).toBeUndefined();
    expect(browsePosition(ORDER, 'pizza')).toBeUndefined();
    expect(browseNeighbour(undefined, 'arayes', 1)).toBeUndefined();
    expect(browseNeighbour(ORDER, 'pizza', 1)).toBeUndefined();
  });

  it('a list of one entry has nothing to swipe to', () => {
    expect(browsePosition(['arayes'], 'arayes')).toBeUndefined();
  });
});
