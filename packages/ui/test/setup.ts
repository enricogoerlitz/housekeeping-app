// Setup of the component tests (jsdom with react-native-web, spec 0031, REQ-010).
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { reducedMotion } from './mocks/reanimated';
import { safeArea } from './mocks/safe-area';

// Pointer kind for useFinePointer: touch unless a test sets `pointer.fine = true` before rendering.
export const pointer = { fine: false };
Object.defineProperty(globalThis, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: query.includes('pointer: fine') ? pointer.fine : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

afterEach(() => {
  cleanup();
  pointer.fine = false;
  reducedMotion.value = false;
  safeArea.insets = { top: 0, right: 0, bottom: 0, left: 0 };
});
