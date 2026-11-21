// State of the toast with "Rückgängig" (spec 0005; `onExpire` spec 0008, E5). Free of React
// Native, so its timing is tested in Node with fake timers.

export interface ToastOptions {
  message: string;
  /** e.g. "Rückgängig". */
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Called once when the toast ends without its action: the time is up, a new toast replaced it,
   * or it was hidden. From then on the action is out of reach, e.g. a deleted photo can go.
   */
  onExpire?: () => void;
  /** Milliseconds; default 5000 (the undo window). */
  duration?: number;
}

export interface ToastState extends ToastOptions {
  id: number;
}

export const TOAST_DURATION_MS = 5000;

export interface ToastStore {
  /** Shows a toast; one that is still on screen ends as expired. */
  show: (options: ToastOptions) => void;
  /** Ends the current toast without its action (counts as expired). */
  hide: () => void;
  /** Runs the action of toast `id` if it is still the one on screen; it does not expire. */
  act: (id: number) => void;
  get: () => ToastState | null;
  subscribe: (listener: () => void) => () => void;
}

export function createToastStore(): ToastStore {
  let current: ToastState | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let counter = 0;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };

  /** Takes the current toast off without telling anyone; returns it. */
  const take = (): ToastState | null => {
    const ended = current;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    current = null;
    return ended;
  };

  const expire = () => {
    const ended = take();
    if (!ended) return;
    emit();
    ended.onExpire?.();
  };

  return {
    show(options) {
      // The old toast ends first, so a toast its onExpire shows is replaced by this one.
      take()?.onExpire?.();
      counter += 1;
      const id = counter;
      current = { ...options, id };
      timer = setTimeout(() => {
        if (current?.id === id) expire();
      }, options.duration ?? TOAST_DURATION_MS);
      emit();
    },
    hide: expire,
    act(id) {
      if (current?.id !== id) return;
      const ended = take();
      emit();
      // Hidden first: the action may show a toast of its own (e.g. "offline").
      ended?.onAction?.();
    },
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
