import { createAiSearchController, type AiSearchState } from '@housekeeping/api';
import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * The AI search for the recipe field (AC-027): runs only while `enabled` (switch on and online),
 * waits for a pause in typing, and drops answers to older queries.
 */
export function useAiSearch(
  enabled: boolean,
  query: string,
): { state: AiSearchState; runNow: (disabledChips: string[]) => void } {
  const [controller] = useState(() => createAiSearchController());
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => {
    controller.update({ enabled, query });
  }, [controller, enabled, query]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  return { state, runNow: controller.runNow };
}
