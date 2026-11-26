import { describe, expect, it } from 'vitest';

import { parseListSorts } from './list-sorts';

describe('parseListSorts (spec 0036, REQ-002)', () => {
  it('AC-003: keeps the stored sort of each list', () => {
    expect(
      parseListSorts({ recipes: 'title', restaurants: 'rating', activities: 'recent' }),
    ).toEqual({ recipes: 'title', restaurants: 'rating', activities: 'recent' });
  });

  it('drops what is not a sort of that list (stored values are untrusted)', () => {
    expect(parseListSorts({ recipes: 'lastVisit', restaurants: 'count', activities: 7 })).toEqual(
      {},
    );
    expect(parseListSorts(null)).toEqual({});
    expect(parseListSorts('title')).toEqual({});
  });
});
