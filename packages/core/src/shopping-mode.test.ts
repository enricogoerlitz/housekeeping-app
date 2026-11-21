import { describe, expect, it } from 'vitest';

import { finishSummary, shoppingModeGroups } from './shopping-mode';
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

describe('finishSummary', () => {
  it('AC-047: "8 gekauft · 2 bleiben"', () => {
    const items = Array.from({ length: 10 }, (_, index) =>
      item({ id: `i-${index}`, articleId: 'art-milch', checked: index < 8 }),
    );
    expect(finishSummary(items)).toEqual({
      bought: 8,
      remaining: 2,
      label: '8 gekauft · 2 bleiben',
    });
  });

  it('nothing checked: "0 gekauft · 3 bleiben"', () => {
    expect(finishSummary(rows).label).toBe('0 gekauft · 3 bleiben');
  });
});
