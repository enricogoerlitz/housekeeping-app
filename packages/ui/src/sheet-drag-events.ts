import type { RefObject } from 'react';

export interface SheetDragHandlers {
  onStart: () => void;
  onMove: (dy: number) => void;
  onRelease: (dy: number, velocity: number, height: number) => void;
}

/** The app ships as a PWA (spec 0033): natively a window is not dragged, ✕ and back close it. */
export function useSheetDrag(
  _enabled: boolean,
  _refs: { panel: RefObject<unknown>; content: RefObject<unknown> },
  _handlers: SheetDragHandlers,
): void {}
