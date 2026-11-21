// "Sammel-Fenster" (spec 0005, REQ-005, D3): a check strikes a row through and leaves it in place;
// all rows checked in one window leave together once no tap came for CHECK_WINDOW_MS. Pure timing
// logic without React, so it runs under fake timers in Node.

/** The window after the last tap. The only place that defines it (D3). */
export const CHECK_WINDOW_MS = 2000;

export interface CheckWindowSnapshot {
  /** What the user tapped in the running window: row id → checked. Wins over the data. */
  readonly taps: ReadonlyMap<string, boolean>;
  /**
   * Rows that keep their place until the window closes: every row that was open when the window
   * started, plus each tapped one. A check from another device on one of them waits too.
   */
  readonly held: ReadonlySet<string>;
}

export interface CheckWindow {
  getSnapshot(): CheckWindowSnapshot;
  subscribe(listener: () => void): () => void;
  /** A tap on a row. `openIds` are the rows shown as open right now. Restarts the window. */
  toggle(id: string, checked: boolean, openIds: readonly string[]): void;
  /** Closes a running window now, e.g. when the screen is left. */
  settle(): void;
  /** Once per window, when it closes: the rows that ended up checked, in tap order. */
  onSettle(listener: (checkedIds: string[]) => void): () => void;
}

const IDLE: CheckWindowSnapshot = { taps: new Map(), held: new Set() };

export function createCheckWindow(windowMs = CHECK_WINDOW_MS): CheckWindow {
  let snapshot = IDLE;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const settleListeners = new Set<(checkedIds: string[]) => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };

  function settle() {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    const checked = [...snapshot.taps].filter(([, isChecked]) => isChecked).map(([id]) => id);
    snapshot = IDLE;
    emit();
    for (const listener of settleListeners) listener(checked);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    toggle(id, checked, openIds) {
      const held = new Set(timer === undefined ? openIds : snapshot.held);
      held.add(id);
      const taps = new Map(snapshot.taps);
      taps.set(id, checked);
      snapshot = { taps, held };
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(settle, windowMs);
      emit();
    },
    settle,
    onSettle(listener) {
      settleListeners.add(listener);
      return () => {
        settleListeners.delete(listener);
      };
    },
  };
}

/** The check state a row shows: the user's tap in the running window, else the data. */
export function shownChecked(
  snapshot: CheckWindowSnapshot,
  id: string,
  dataChecked: boolean,
): boolean {
  return snapshot.taps.get(id) ?? dataChecked;
}

/** The rows of the open list, in the caller's order: open ones and those the window holds. */
export function openRows<T>(
  items: readonly T[],
  getId: (item: T) => string,
  isChecked: (item: T) => boolean,
  snapshot: CheckWindowSnapshot,
): T[] {
  return items.filter((item) => {
    const id = getId(item);
    return !shownChecked(snapshot, id, isChecked(item)) || snapshot.held.has(id);
  });
}

export interface CheckWindowActions<T> {
  /** A tap: flips the shown state of the row. */
  toggle: (item: T) => void;
  /**
   * Sets the row to `checked` without flipping it, e.g. each tap on the stars of "Wie war's?"
   * (spec 0011, AC-019): the row stays and the window starts again.
   */
  set: (item: T, checked: boolean) => void;
  /** Closes a running window now, e.g. when the screen loses focus (spec 0011, AC-030). */
  settle: () => void;
}

/**
 * What the screen's calls do to the window, given the rows shown right now and their shown state.
 * `changed` runs after every toggle and set, with the new state.
 */
export function checkWindowActions<T>(options: {
  window: CheckWindow;
  rows: readonly T[];
  getId: (item: T) => string;
  isChecked: (item: T) => boolean;
  changed?: (item: T, checked: boolean) => void;
}): CheckWindowActions<T> {
  const { window, rows, getId } = options;
  const set = (item: T, checked: boolean) => {
    window.toggle(getId(item), checked, rows.map(getId));
    options.changed?.(item, checked);
  };
  return {
    toggle: (item) => set(item, !options.isChecked(item)),
    set,
    settle: () => window.settle(),
  };
}
