import { describe, expect, it } from 'vitest';

import {
  extendShoppingRun,
  finishSummary,
  runProgress,
  shoppingModeGroups,
  ShoppingRunSchema,
  startShoppingRun,
} from './shopping-mode';
import { articlesById } from './test-fixtures';
import type { Area, Article, Id, ShoppingItem, Store } from './types';

function item(
  partial: Partial<ShoppingItem> & Pick<ShoppingItem, 'id' | 'articleId'>,
): ShoppingItem {
  return { contributions: [], checked: false, createdAt: '2026-11-20T08:00:00.000Z', ...partial };
}

const areas: Area[] = [
  { id: 'area-obst', name: 'Obst & Gemüse', sort: 0 },
  { id: 'area-kuehl', name: 'Kühlregal & Molkerei', sort: 1 },
];
const localArticles: Record<Id, Article> = articlesById;
const rewe: Store = {
  id: 'store-rewe',
  name: 'Rewe Südstadt',
  areaOrder: ['area-kuehl', 'area-obst'],
  hiddenAreaIds: [],
};

const rows = [
  item({ id: 'mango', articleId: 'art-mango', createdAt: '2026-11-20T08:01:00.000Z' }),
  item({ id: 'milch', articleId: 'art-milch', createdAt: '2026-11-20T08:02:00.000Z' }),
  item({ id: 'spuel', articleId: 'art-spuelmittel', createdAt: '2026-11-20T08:03:00.000Z' }),
];
const summary = (groups: ReturnType<typeof shoppingModeGroups>) =>
  groups.map((group) => [group.key, group.items.map((i) => i.id)]);

describe('shoppingModeGroups', () => {
  it('AC-040: groups in the walking order of the chosen store', () => {
    expect(summary(shoppingModeGroups(rows, localArticles, areas, rewe))).toEqual([
      ['area:area-kuehl', ['milch']],
      ['area:area-obst', ['mango']],
      ['none', ['spuel']],
    ]);
  });

  it('AC-043: without a store the areas stand in their own order', () => {
    expect(summary(shoppingModeGroups(rows, localArticles, areas, undefined))).toEqual([
      ['area:area-obst', ['mango']],
      ['area:area-kuehl', ['milch']],
      ['none', ['spuel']],
    ]);
  });

  it('"nicht da" rows go to "Woanders kaufen" at the end, after hidden areas', () => {
    const hidden = { ...rewe, hiddenAreaIds: ['area-obst'] };
    const notHere = rows.map((row) => (row.id === 'milch' ? { ...row, notAvailable: true } : row));
    const groups = shoppingModeGroups(notHere, localArticles, areas, hidden);
    expect(summary(groups)).toEqual([
      ['none', ['spuel']],
      ['elsewhere', ['mango', 'milch']],
    ]);
    expect(groups.at(-1)?.title).toBe('Woanders kaufen');
  });

  it('a checked "nicht da" row in the running window stays under "Woanders kaufen"', () => {
    const checked = [
      item({ id: 'milch', articleId: 'art-milch', checked: true, notAvailable: true }),
    ];
    expect(summary(shoppingModeGroups(checked, localArticles, areas, rewe))).toEqual([
      ['elsewhere', ['milch']],
    ]);
  });

  it('an empty list has no groups', () => {
    expect(shoppingModeGroups([], localArticles, areas, rewe)).toEqual([]);
  });
});

describe('Einkaufsgang (spec 0025, REQ-013)', () => {
  const open = (id: string) => item({ id, articleId: 'art-milch' });
  const done = (id: string) => item({ id, articleId: 'art-milch', checked: true });
  const fifteen = Array.from({ length: 15 }, (_, index) => open(`i-${index}`));
  const lastTime = [done('brot'), done('butter')];

  it('AC-042: starts with what is open; checked items from last time do not count', () => {
    const run = startShoppingRun('h', [...fifteen, ...lastTime]);
    expect(runProgress(run, [...fifteen, ...lastTime])).toMatchObject({ done: 0, total: 15 });
    expect(runProgress(run, [...fifteen, ...lastTime]).inCart).toEqual([]);
  });

  it('AC-042: 3 checked → 3/15; "Butter" added again → open, 3/16', () => {
    const run = startShoppingRun('h', [...fifteen, ...lastTime]);
    const checked = fifteen.map((row, index) => (index < 3 ? { ...row, checked: true } : row));
    expect(runProgress(run, [...checked, ...lastTime])).toMatchObject({ done: 3, total: 15 });
    const withButter = [...checked, done('brot'), open('butter')];
    const extended = extendShoppingRun(run, withButter);
    expect(runProgress(extended, withButter)).toMatchObject({ done: 3, total: 16 });
    expect(runProgress(extended, withButter).inCart.map((row) => row.id)).toEqual([
      'i-0',
      'i-1',
      'i-2',
    ]);
  });

  it('AC-042: extending without anything new keeps the same run', () => {
    const run = startShoppingRun('h', fifteen);
    expect(extendShoppingRun(run, fifteen)).toBe(run);
  });

  it('AC-043: "Fertig" reports this trip only: "3 gekauft · 13 bleiben"', () => {
    const run = startShoppingRun('h', [...fifteen, ...lastTime]);
    const rows = [
      ...fifteen.map((row, index) => (index < 3 ? { ...row, checked: true } : row)),
      done('brot'),
      open('butter'),
    ];
    expect(finishSummary(extendShoppingRun(run, rows), rows)).toEqual({
      bought: 3,
      remaining: 13,
      label: '3 gekauft · 13 bleiben',
    });
  });

  it('AC-044: taking the check out of "Limetten" makes it open again, 2/16', () => {
    const rows = fifteen.map((row, index) => (index < 3 ? { ...row, checked: true } : row));
    const run = extendShoppingRun(startShoppingRun('h', fifteen), [...rows, open('butter')]);
    const unchecked = rows.map((row) => (row.id === 'i-2' ? { ...row, checked: false } : row));
    expect(runProgress(run, [...unchecked, open('butter')])).toMatchObject({ done: 2, total: 16 });
  });

  it('an item removed meanwhile no longer counts', () => {
    const run = startShoppingRun('h', fifteen);
    expect(runProgress(run, fifteen.slice(1))).toMatchObject({ done: 0, total: 14 });
  });

  it('a stored run is input: parsed, never cast', () => {
    expect(ShoppingRunSchema.safeParse({ householdId: 'h', itemIds: ['a'] }).success).toBe(true);
    expect(ShoppingRunSchema.safeParse({ householdId: 'h', itemIds: 'a' }).success).toBe(false);
  });
});
