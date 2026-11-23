import { Platform } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';

import { played } from '../test/mocks/expo-haptics';
import { haptic } from './haptics';

const setOS = (os: string) =>
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });

afterEach(() => {
  setOS('web');
  played.length = 0;
});

describe('haptic', () => {
  it('does nothing on the web', () => {
    haptic('check');
    haptic('lift');
    expect(played).toEqual([]);
  });

  it('native: a check is a selection tick, lift and drop a light impact', () => {
    setOS('ios');
    haptic('check');
    haptic('lift');
    haptic('drop');
    expect(played).toEqual(['selection', 'impact:light', 'impact:light']);
  });
});
