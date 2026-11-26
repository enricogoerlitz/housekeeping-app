// The keyboard reports its height several times while it moves (spec 0033, REQ-003): the app
// takes it once, when the reports have stopped, so a window moves in one step.

/** Quiet time after the last report of the visual viewport. */
export const KEYBOARD_SETTLE_MS = 120;

export interface Settler<T> {
  /** A new value; it is taken once no other came for `ms`. */
  push: (value: T) => void;
  /** Takes the pending value now. */
  flush: () => void;
  cancel: () => void;
}

export function createSettler<T>(ms: number, onSettle: (value: T) => void): Settler<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { value: T } | undefined;
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  };
  const flush = () => {
    const next = pending;
    cancel();
    if (next) onSettle(next.value);
  };
  return {
    push(value) {
      if (timer !== undefined) clearTimeout(timer);
      pending = { value };
      timer = setTimeout(flush, ms);
    },
    flush,
    cancel,
  };
}
