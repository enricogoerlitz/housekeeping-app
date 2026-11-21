// Shared setup for the unit tests of this package. Not exported from index.ts, which is not
// imported by tests because photos.ts holds image requires only Metro can resolve.
import './seed/demo';

import type { Id, Recipe } from '@housekeeping/core';
import { afterEach, beforeEach, vi } from 'vitest';

import { getData, resetState } from './store';

/** Friday, 20 November 2026. The demo seed is built relative to this day. */
export const TODAY = '2026-11-20';

/** Freezes the clock on TODAY and starts every test from a fresh demo household. */
export function withDemoHousehold(): void {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 10, 0));
    resetState();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

/** The items of the active household's shopping list. */
export function itemsOf() {
  return getData().items;
}

export function articleName(articleId: Id): string | undefined {
  return getData().articles.find((article) => article.id === articleId)?.name;
}

export function recipeById(id: Id): Recipe {
  const found = getData().recipes.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`recipe ${id} missing`);
  return found;
}
