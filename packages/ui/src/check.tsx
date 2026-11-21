import { useEffect, useEffectEvent, useState, useSyncExternalStore, type ReactNode } from 'react';
import Animated, {
  Easing,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useReducedMotion,
} from 'react-native-reanimated';

import { announce } from './announce';
import {
  checkWindowActions,
  createCheckWindow,
  openRows,
  shownChecked,
  type CheckWindowActions,
} from './check-window';

export interface UseCheckWindowOptions<T> {
  /** All rows of the list in display order, open and checked, as the cache has them. */
  items: readonly T[];
  getId: (item: T) => string;
  /** The saved check state of a row. */
  isChecked: (item: T) => boolean;
  /** Runs at once on every tap and `set`, e.g. to save a shopping item (spec 0006). */
  onToggle?: (item: T, checked: boolean) => void;
  /**
   * Runs when the window closes or the screen is left, with the rows checked in it; for screens
   * that save only then, e.g. chores (spec 0011).
   */
  onSettle?: (checkedIds: string[]) => void;
  /** Screen-reader text after a tap or `set`, e.g. "Milch abgehakt" or "Milch wieder offen". */
  announce?: (item: T, checked: boolean) => string;
}

export interface CheckWindowState<T> extends CheckWindowActions<T> {
  /** Rows to show in the open list: open ones and those checked in the running window. */
  rows: T[];
  /** The check state to show: a tap in the running window wins over the data. */
  isChecked: (item: T) => boolean;
}

/**
 * Checking with a "Sammel-Fenster" (spec 0005, REQ-005, D3): a tap checks and strikes through at
 * once, a second tap takes it back, and all checked rows leave together 2 s after the last tap.
 * Unmounting settles at once; a screen that stays mounted when it loses focus (tabs) calls
 * `settle` from `useFocusEffect`. `set` marks a row without flipping it, e.g. on every tap on the
 * stars of "Wie war's?" (spec 0011). Wrap each row in `RowTransition` for the motion.
 */
export function useCheckWindow<T>(options: UseCheckWindowOptions<T>): CheckWindowState<T> {
  const [checkWindow] = useState(() => createCheckWindow());
  const settled = useEffectEvent((ids: string[]) => options.onSettle?.(ids));
  useEffect(() => {
    const stop = checkWindow.onSettle((ids) => settled(ids));
    return () => {
      // Leaving the screen tidies up at once (AC-029).
      checkWindow.settle();
      stop();
    };
  }, [checkWindow]);
  const snapshot = useSyncExternalStore(
    checkWindow.subscribe,
    checkWindow.getSnapshot,
    checkWindow.getSnapshot,
  );

  const { getId } = options;
  const rows = openRows(options.items, getId, options.isChecked, snapshot);
  const isChecked = (item: T) => shownChecked(snapshot, getId(item), options.isChecked(item));
  const actions = checkWindowActions({
    window: checkWindow,
    rows,
    getId,
    isChecked,
    changed: (item, checked) => {
      options.onToggle?.(item, checked);
      const message = options.announce?.(item, checked);
      if (message) announce(message);
    },
  });
  return { rows, isChecked, ...actions };
}

// Leaving rows fade (exit), the rows below close the gap (on-screen movement); 200 ms each.
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const LEAVE = FadeOut.duration(200).easing(EASE_OUT).reduceMotion(ReduceMotion.Never);
const CLOSE_GAP = LinearTransition.duration(200).easing(EASE_IN_OUT);

/**
 * A row that can leave its list, e.g. when the check window closes: it fades out and the rows
 * below move up. With reduced motion it only fades (AC-030). Give it the row's key.
 */
export function RowTransition(props: { children?: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View exiting={LEAVE} layout={reduced ? undefined : CLOSE_GAP}>
      {props.children}
    </Animated.View>
  );
}
