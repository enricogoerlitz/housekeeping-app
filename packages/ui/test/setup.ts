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

/**
 * The software keyboard (spec 0032): a visual viewport the tests can shrink. `keyboard.open(400)`
 * leaves 400 px of the window visible, `keyboard.close()` shows it all again.
 */
const page = () => document.documentElement;
class FakeViewport extends EventTarget {
  visible: number | undefined;
  offsetTop = 0;
  scale = 1;
  get width() {
    return page().clientWidth;
  }
  get height() {
    return this.visible ?? (page().clientHeight || window.innerHeight);
  }
}
const viewport = new FakeViewport();
Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
export const keyboard = {
  open(visible: number) {
    viewport.visible = visible;
    viewport.dispatchEvent(new Event('resize'));
  },
  close() {
    viewport.visible = undefined;
    viewport.dispatchEvent(new Event('resize'));
  },
};

afterEach(() => {
  cleanup();
  viewport.visible = undefined;
  viewport.dispatchEvent(new Event('resize'));
  pointer.fine = false;
  reducedMotion.value = false;
  safeArea.insets = { top: 0, right: 0, bottom: 0, left: 0 };
});
