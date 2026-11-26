import { Platform } from 'react-native';

/**
 * Web: a touch starting in an area that scrolls sideways belongs to that area (spec 0029,
 * decision 8), not to a swipe around it.
 */
export function inSidewaysScroller(target: unknown): boolean {
  if (Platform.OS !== 'web') return false;
  const view = globalThis as unknown as {
    getComputedStyle?: (element: unknown) => { overflowX: string };
  };
  let node = target as { scrollWidth?: number; clientWidth?: number; parentElement?: unknown };
  while (node && typeof node.scrollWidth === 'number') {
    if (node.scrollWidth > (node.clientWidth ?? 0) + 1) {
      const overflow = view.getComputedStyle?.(node).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
    node = node.parentElement as typeof node;
  }
  return false;
}
