import { describe, expect, it, vi } from 'vitest';

import { holdWakeLock, type WakeLockEnvironment } from './wake-lock';

/** A browser with the Screen Wake Lock; `hide` / `show` switch the page's visibility. */
function browser(options: { refuse?: boolean } = {}) {
  const listeners = new Set<() => void>();
  const released = vi.fn(() => Promise.resolve());
  const request = vi.fn(() =>
    options.refuse
      ? Promise.reject(new Error('NotAllowedError'))
      : Promise.resolve({ release: released }),
  );
  const env: WakeLockEnvironment & { visibilityState: string } = {
    wakeLock: { request },
    visibilityState: 'visible',
    addVisibilityListener: (listener) => listeners.add(listener),
    removeVisibilityListener: (listener) => listeners.delete(listener),
    isVisible: () => env.visibilityState === 'visible',
  };
  const setVisible = (visible: boolean) => {
    env.visibilityState = visible ? 'visible' : 'hidden';
    listeners.forEach((listener) => listener());
  };
  return { env, request, released, setVisible, listeners };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the screen stays on while a mode holds it (spec 0034, REQ-010)', () => {
  it('AC-022: the lock is asked for at once and again when the app comes back', async () => {
    const { env, request, setVisible } = browser();
    holdWakeLock(env);
    expect(request).toHaveBeenCalledWith('screen');
    // iOS drops the lock while the app is in the background.
    setVisible(false);
    expect(request).toHaveBeenCalledTimes(1);
    setVisible(true);
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('AC-023: leaving the mode releases the lock and stops asking for it', async () => {
    const { env, request, released, setVisible, listeners } = browser();
    const release = holdWakeLock(env);
    await flush();
    release();
    expect(released).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
    setVisible(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('a lock that arrives after leaving is released at once', async () => {
    const { env, released } = browser();
    const release = holdWakeLock(env);
    release();
    await flush();
    expect(released).toHaveBeenCalledTimes(1);
  });

  it('a browser without the lock, or one that refuses, changes nothing and says nothing', async () => {
    expect(() => holdWakeLock({ ...browser().env, wakeLock: undefined })()).not.toThrow();
    const { env } = browser({ refuse: true });
    const release = holdWakeLock(env);
    await flush();
    expect(() => release()).not.toThrow();
  });
});
