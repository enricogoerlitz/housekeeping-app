import { describe, expect, it } from 'vitest';

import { listViewOf, opensQuickView, parseListViews } from './list-views';

describe('list views (spec 0038, REQ-001)', () => {
  it('defaults: recipes as tiles, restaurants and activities as a list', () => {
    expect(listViewOf({}, 'recipes')).toBe('tiles');
    expect(listViewOf({}, 'restaurants')).toBe('list');
    expect(listViewOf({}, 'activities')).toBe('list');
  });

  it('AC-004: the stored choice of one area survives a restart, the others stay unchanged', () => {
    const stored = parseListViews(JSON.parse(JSON.stringify({ recipes: 'list' })));
    expect(listViewOf(stored, 'recipes')).toBe('list');
    expect(listViewOf(stored, 'restaurants')).toBe('list');
    expect(listViewOf(stored, 'activities')).toBe('list');
  });

  it('drops what is not a view (stored values are untrusted)', () => {
    expect(parseListViews({ recipes: 'table', restaurants: 3, activities: 'tiles' })).toEqual({
      activities: 'tiles',
    });
    expect(parseListViews(null)).toEqual({});
    expect(parseListViews('list')).toEqual({});
  });

  it('AC-001: desktop and "Liste" open beside the list in the quick view', () => {
    expect(opensQuickView('list', true)).toBe(true);
  });

  it('AC-002: "Kacheln" open the own page, also on wide screens', () => {
    expect(opensQuickView('tiles', true)).toBe(false);
  });

  it('AC-003: phones always open the own page, also with "Liste"', () => {
    expect(opensQuickView('list', false)).toBe(false);
    expect(opensQuickView('tiles', false)).toBe(false);
  });
});
