// "Einkaufen" (spec 0006, REQ-007, D26): the groups in the walking order of the store chosen on
// this device, the Einkaufsgang (spec 0025, REQ-013) and the hint after "Fertig".
import { z } from 'zod';

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

// ---------- Einkaufsgang ----------

/** At most this many items in one Einkaufsgang; a list is far smaller (restore takes 1000). */
const RUN_MAX_ITEMS = 2000;

/**
 * One Einkaufsgang ("ShoppingRun", glossary): the items that count in "Einkaufen" — open when it
 * started or open since (added, reopened). Kept on the device so it survives a reload; it is input
 * when read back.
 */
export const ShoppingRunSchema = z.object({
  householdId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).max(RUN_MAX_ITEMS),
});
export type ShoppingRun = z.infer<typeof ShoppingRunSchema>;

/** Opening "Einkaufen" starts an Einkaufsgang with the open items (AC-042). */
export function startShoppingRun(householdId: Id, items: readonly ShoppingItem[]): ShoppingRun {
  return { householdId, itemIds: items.filter((item) => !item.checked).map((item) => item.id) };
}

/**
 * Items that are open now join the Einkaufsgang ("Butter" added again, AC-042); the same run is
 * returned when nothing joined, so a caller can store only real changes.
 */
export function extendShoppingRun(run: ShoppingRun, items: readonly ShoppingItem[]): ShoppingRun {
  const known = new Set(run.itemIds);
  const joined = items.filter((item) => !item.checked && !known.has(item.id)).map((i) => i.id);
  if (joined.length === 0) return run;
  return { ...run, itemIds: [...run.itemIds, ...joined].slice(0, RUN_MAX_ITEMS) };
}

/** A run stored on the device, read back after a reload: only one of this household (AC-042). */
export function readShoppingRun(
  stored: string | null | undefined,
  householdId: Id,
): ShoppingRun | undefined {
  if (!stored) return undefined;
  try {
    const parsed = ShoppingRunSchema.safeParse(JSON.parse(stored));
    return parsed.success && parsed.data.householdId === householdId ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The Einkaufsgang as it is now: extended by what is open, or a new one when the household
 * changed. The same run when nothing changed.
 */
export function currentShoppingRun(
  run: ShoppingRun,
  householdId: Id,
  items: readonly ShoppingItem[],
): ShoppingRun {
  return run.householdId === householdId
    ? extendShoppingRun(run, items)
    : startShoppingRun(householdId, items);
}

export interface RunProgress {
  done: number;
  total: number;
  /** "Im Wagen": the checked items of this Einkaufsgang. */
  inCart: ShoppingItem[];
}

/** Progress of the Einkaufsgang: its items still on the list, checked out of all (AC-042, AC-044). */
export function runProgress(run: ShoppingRun, items: readonly ShoppingItem[]): RunProgress {
  const inRun = new Set(run.itemIds);
  const rows = items.filter((item) => inRun.has(item.id));
  const { done, total } = listProgress(rows);
  return { done, total, inCart: rows.filter((item) => item.checked) };
}

export interface FinishSummary {
  bought: number;
  remaining: number;
  /** "3 gekauft · 13 bleiben" (AC-043). */
  label: string;
}

/**
 * What "Fertig" reports: what this Einkaufsgang bought and what stays open. All checked items leave
 * the list, also older ones, but only this trip's count (AC-043).
 */
export function finishSummary(run: ShoppingRun, items: readonly ShoppingItem[]): FinishSummary {
  const { done, total } = runProgress(run, items);
  const remaining = total - done;
  return { bought: done, remaining, label: `${done} gekauft · ${remaining} bleiben` };
}
