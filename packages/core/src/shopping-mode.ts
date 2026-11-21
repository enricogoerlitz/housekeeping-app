// "Einkaufen" (spec 0006, REQ-007, D26): the groups in the walking order of the store chosen on
// this device, and the hint after "Fertig".
import { groupItems, listProgress, type ItemGroup } from './shopping';
import type { Area, Article, Id, ShoppingItem, Store } from './types';

/**
 * The rows of "Einkaufen" grouped by area in the store's walking order; without a store in the
 * areas' own order (AC-043). Rows marked "nicht da" join "Woanders kaufen" at the end, also while
 * the check window still holds them checked.
 */
export function shoppingModeGroups(
  rows: readonly ShoppingItem[],
  articlesById: Record<Id, Article>,
  areas: Area[],
  store: Store | undefined,
): ItemGroup[] {
  const notHere = rows.filter((row) => row.notAvailable);
  const groups = groupItems(
    rows.filter((row) => !row.notAvailable),
    articlesById,
    areas,
    store,
  );
  if (notHere.length === 0) return groups;
  const elsewhere = groups.find((group) => group.key === 'elsewhere');
  if (elsewhere) {
    return groups.map((group) =>
      group === elsewhere ? { ...group, items: [...group.items, ...notHere] } : group,
    );
  }
  return [...groups, { key: 'elsewhere', title: 'Woanders kaufen', items: notHere }];
}

export interface FinishSummary {
  bought: number;
  remaining: number;
  /** "8 gekauft · 2 bleiben" (AC-047). */
  label: string;
}

/** What "Fertig" reports: checked items are bought and leave the list, the rest stays. */
export function finishSummary(items: readonly ShoppingItem[]): FinishSummary {
  const { done, total } = listProgress([...items]);
  const remaining = total - done;
  return { bought: done, remaining, label: `${done} gekauft · ${remaining} bleiben` };
}
