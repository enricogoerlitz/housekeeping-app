import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSettler, KEYBOARD_SETTLE_MS } from './keyboard-settle';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createSettler (spec 0033, REQ-003)', () => {
  it('AC-008: the keyboard rising in three steps is taken once, at its final height', () => {
    const settled = vi.fn();
    const settler = createSettler<number>(KEYBOARD_SETTLE_MS, settled);
    settler.push(700);
    vi.advanceTimersByTime(40);
    settler.push(520);
    vi.advanceTimersByTime(40);
    settler.push(400);
    expect(settled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(KEYBOARD_SETTLE_MS);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledWith(400);
  });

  it('flush takes the last value at once; nothing pending afterwards', () => {
    const settled = vi.fn();
    const settler = createSettler<number>(KEYBOARD_SETTLE_MS, settled);
    settler.push(400);
    settler.flush();
    expect(settled).toHaveBeenCalledWith(400);
    vi.advanceTimersByTime(KEYBOARD_SETTLE_MS * 2);
    expect(settled).toHaveBeenCalledTimes(1);
    settler.flush();
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('cancel drops what was pending', () => {
    const settled = vi.fn();
    const settler = createSettler<number>(KEYBOARD_SETTLE_MS, settled);
    settler.push(400);
    settler.cancel();
    vi.advanceTimersByTime(KEYBOARD_SETTLE_MS * 2);
    expect(settled).not.toHaveBeenCalled();
  });
});
