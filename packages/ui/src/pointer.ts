import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

// Spec 0019, REQ-003: hover states only with a mouse or a trackpad. Touch screens report a sticky
// hover after a tap on some browsers; the media query tells the input apart.

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

interface MediaList {
  matches: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

function media(): MediaList | undefined {
  if (Platform.OS !== 'web') return undefined;
  const match = (globalThis as { matchMedia?: (query: string) => MediaList }).matchMedia;
  return match?.(FINE_POINTER);
}

function subscribe(listener: () => void): () => void {
  const list = media();
  list?.addEventListener?.('change', listener);
  return () => list?.removeEventListener?.('change', listener);
}

const snapshot = () => media()?.matches ?? false;

/** True while a mouse or a trackpad is the main pointer (`hover: hover` and `pointer: fine`). */
export function useFinePointer(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** Turns a Pressable's `hovered` into a hover that counts only with a fine pointer. */
export function useHover(): (hovered: boolean | undefined) => boolean {
  const fine = useFinePointer();
  return (hovered) => fine && !!hovered;
}
