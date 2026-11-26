/**
 * One open request for a window that one host shows for the whole app, e.g. "„Bless“ löschen?"
 * (spec 0036, REQ-012): any code can open it, also outside a component (a swipe, a menu), and a
 * newer request replaces an older one. Read it with useSyncExternalStore(subscribe, current).
 */
export interface RequestSlot<T> {
  open: (request: T) => void;
  /** Closes the open request, or only `request` when given and still open. */
  close: (request?: T) => void;
  current: () => T | undefined;
  subscribe: (listener: () => void) => () => void;
}

export function createRequestSlot<T>(): RequestSlot<T> {
  let open: T | undefined;
  const listeners = new Set<() => void>();
  const set = (next: T | undefined) => {
    open = next;
    for (const listener of listeners) listener();
  };
  return {
    open: (request) => set(request),
    close: (request) => {
      if (request === undefined || request === open) set(undefined);
    },
    current: () => open,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
