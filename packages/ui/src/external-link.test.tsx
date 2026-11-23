import { Linking, Platform } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openExternalLink } from './external-link';

const setOS = (os: string) =>
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });

afterEach(() => {
  setOS('web');
  vi.restoreAllMocks();
});

describe('openExternalLink', () => {
  it('web: opens a new tab without opener and referrer, and cuts the opener', () => {
    const tab = { opener: {} as unknown };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    openExternalLink('https://example.org/rezept');
    expect(open).toHaveBeenCalledWith(
      'https://example.org/rezept',
      '_blank',
      'noopener,noreferrer',
    );
    expect(tab.opener).toBeNull();
  });

  it('native: hands the address to the system and swallows a failure', async () => {
    setOS('ios');
    const openURL = vi.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    const open = vi.spyOn(window, 'open');
    openExternalLink('https://example.org/rezept');
    expect(openURL).toHaveBeenCalledWith('https://example.org/rezept');
    expect(open).not.toHaveBeenCalled();
    await Promise.resolve();
  });
});
