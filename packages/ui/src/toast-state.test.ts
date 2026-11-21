import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createToastStore } from './toast-state';

describe('toast store (spec 0008, E5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-043: hides after 5 s and then calls onExpire once', () => {
    const store = createToastStore();
    const onExpire = vi.fn();
    store.show({ message: 'Halloumi-Pfanne gelöscht', actionLabel: 'Rückgängig', onExpire });
    vi.advanceTimersByTime(4999);
    expect(store.get()?.message).toBe('Halloumi-Pfanne gelöscht');
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(store.get()).toBeNull();
    expect(onExpire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('AC-044: the action runs instead of onExpire, also after the 5 s', () => {
    const store = createToastStore();
    const onAction = vi.fn();
    const onExpire = vi.fn();
    store.show({ message: 'gelöscht', actionLabel: 'Rückgängig', onAction, onExpire });
    const id = store.get()?.id ?? -1;
    vi.advanceTimersByTime(2000);
    store.act(id);
    expect(store.get()).toBeNull();
    expect(onAction).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('honours its own duration', () => {
    const store = createToastStore();
    const onExpire = vi.fn();
    store.show({ message: 'kurz', duration: 2000, onExpire });
    vi.advanceTimersByTime(2000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('a toast replaced by a new one has expired: its undo is no longer reachable', () => {
    const store = createToastStore();
    const first = vi.fn();
    const second = vi.fn();
    store.show({ message: 'erstes', onExpire: first });
    store.show({ message: 'zweites', onExpire: second });
    expect(first).toHaveBeenCalledTimes(1);
    expect(store.get()?.message).toBe('zweites');
    // The new toast gets the full time; the old timer is gone.
    vi.advanceTimersByTime(4999);
    expect(second).not.toHaveBeenCalled();
    expect(first).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('hide ends the toast without its action and counts as expired', () => {
    const store = createToastStore();
    const onAction = vi.fn();
    const onExpire = vi.fn();
    store.show({ message: 'weg', onAction, onExpire });
    store.hide();
    expect(store.get()).toBeNull();
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
    store.hide();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('an action for a toast that is already gone does nothing', () => {
    const store = createToastStore();
    const onAction = vi.fn();
    store.show({ message: 'alt', onAction });
    const id = store.get()?.id ?? -1;
    vi.advanceTimersByTime(5000);
    store.act(id);
    store.show({ message: 'neu', onAction });
    store.act(id);
    expect(onAction).not.toHaveBeenCalled();
    expect(store.get()?.message).toBe('neu');
  });

  it('a toast shown by onExpire or onAction stays on screen', () => {
    const store = createToastStore();
    store.show({ message: 'gelöscht', onExpire: () => store.show({ message: 'aufgeräumt' }) });
    vi.advanceTimersByTime(5000);
    expect(store.get()?.message).toBe('aufgeräumt');
    store.show({ message: 'gelöscht', onAction: () => store.show({ message: 'offline' }) });
    store.act(store.get()?.id ?? -1);
    expect(store.get()?.message).toBe('offline');
  });

  it('tells subscribers about each change', () => {
    const store = createToastStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.show({ message: 'a' });
    vi.advanceTimersByTime(5000);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.show({ message: 'b' });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
