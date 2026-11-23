import { AccessibilityInfo, Platform } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { announce } from './announce';

const setOS = (os: string) =>
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });

afterEach(() => {
  setOS('web');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('announce', () => {
  it('web: puts the message into one polite live region', () => {
    vi.useFakeTimers();
    announce('Milch abgehakt');
    const region = document.querySelector('[data-testid="announcer"]');
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.textContent).toBe('');
    vi.advanceTimersByTime(50);
    expect(region?.textContent).toBe('Milch abgehakt');

    announce('Brot abgehakt');
    vi.advanceTimersByTime(50);
    expect(document.querySelectorAll('[data-testid="announcer"]')).toHaveLength(1);
    expect(region?.textContent).toBe('Brot abgehakt');
  });

  it('web: a repeated message is emptied first, so it counts as a change', () => {
    vi.useFakeTimers();
    announce('Milch abgehakt');
    vi.advanceTimersByTime(50);
    announce('Milch abgehakt');
    const region = document.querySelector('[data-testid="announcer"]');
    expect(region?.textContent).toBe('');
    vi.advanceTimersByTime(50);
    expect(region?.textContent).toBe('Milch abgehakt');
  });

  it('native: uses the platform announcement and no live region', () => {
    setOS('ios');
    const spy = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce('Milch abgehakt');
    expect(spy).toHaveBeenCalledWith('Milch abgehakt');
  });
});
