import { useActiveHouseholdId } from '@housekeeping/api';
import {
  extendShoppingRun,
  ShoppingRunSchema,
  startShoppingRun,
  type ShoppingItem,
  type ShoppingRun,
} from '@housekeeping/core';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// Spec 0025, REQ-013 (Decision 9): an Einkaufsgang starts when "Einkaufen" opens, survives a
// reload of the page and ends with "Fertig" or leaving it. It lives in this tab's session storage:
// only item ids, gone with the tab, and removed when the screen goes.

const KEY = 'housekeeping.shopping-run';

function storage(): Storage | undefined {
  if (Platform.OS !== 'web') return undefined;
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

function readRun(householdId: string): ShoppingRun | undefined {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return undefined;
    const parsed = ShoppingRunSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.householdId === householdId ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function writeRun(run: ShoppingRun | undefined): void {
  try {
    if (run) storage()?.setItem(KEY, JSON.stringify(run));
    else storage()?.removeItem(KEY);
  } catch {
    // Without storage (private mode) the Einkaufsgang still counts until the page reloads.
  }
}

/**
 * The Einkaufsgang of "Einkaufen": started with the open items (or read back after a reload);
 * items that are open later join it (added, reopened, AC-042). Leaving the screen ends it.
 */
export function useShoppingRun(items: readonly ShoppingItem[]): ShoppingRun {
  const householdId = useActiveHouseholdId();
  const [run, setRun] = useState<ShoppingRun>(
    () => readRun(householdId) ?? startShoppingRun(householdId, items),
  );
  const current =
    run.householdId === householdId
      ? extendShoppingRun(run, items)
      : startShoppingRun(householdId, items);
  if (current !== run) setRun(current);

  useEffect(() => {
    writeRun(run);
  }, [run]);
  useEffect(() => () => writeRun(undefined), []);
  return current;
}
