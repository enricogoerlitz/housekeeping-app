// What the drag provider (drag-drop.tsx) shares with the platform drag sources
// (drag-source.ts, drag-source.web.ts), in its own file so the sources do not import the
// provider that re-exports them.

import { createContext, useContext, type ReactNode } from 'react';
import type { HostInstance, ViewProps, ViewStyle } from 'react-native';

import type { DragController } from './drag-controller';
import type { Rect } from './drop-targets';

export const DragContext = createContext<DragController<ReactNode> | null>(null);

export function useDragController(): DragController<ReactNode> {
  const controller = useContext(DragContext);
  if (!controller) throw new Error('Drag sources and drop targets need a DragProvider above them.');
  return controller;
}

/** measureInWindow as a Measure; a view without size counts as not laid out. */
export function measureNode(node: HostInstance | null, done: (rect: Rect | null) => void): void {
  if (!node) {
    done(null);
    return;
  }
  node.measureInWindow((x, y, width, height) =>
    done(width > 0 || height > 0 ? { x, y, width, height } : null),
  );
}

export interface DragSourceOptions {
  /** The feature's id of the dragged thing, passed back in every callback of the provider. */
  id: string;
  /** What hangs on the finger, built when it lifts; usually the entry as it looks. */
  preview: () => ReactNode;
  /** Offline (AC-005): nothing lifts; a hold or a mouse drag calls `onBlocked` instead. */
  disabled?: boolean;
  onBlocked?: () => void;
  /**
   * The way without dragging for screen readers (spec 0016, "Screenreader"): an accessibility
   * action on the source, e.g. `{ label: 'Verschieben', onAction: openMoveSheet }`.
   */
  accessibilityAction?: { label: string; onAction: () => void };
}

/**
 * Destructure it (`const { ref, props, style, dragging, guardPress } = useDragSource(…)`): the
 * React Compiler takes an object with a `ref` field for a ref and skips a component that reads
 * the others during render.
 */
export interface DragSourceBinding {
  /** Put on the View that is dragged (the whole entry). */
  ref: (node: HostInstance | null) => void;
  /** Spread onto the same View. */
  props: ViewProps;
  /** Add to that View's style: grab cursor, no text selection, scroll handling (web). */
  style: ViewStyle | null;
  /** This source is lifted or gliding back: show its old place as a pale outline. */
  dragging: boolean;
  /**
   * Wraps the entry's onPress so the press that ends a drag does not open the entry. Native needs
   * it; on the web the click is swallowed already and the wrapper passes through.
   */
  guardPress: <A extends unknown[]>(
    handler: ((...args: A) => void) | undefined,
  ) => ((...args: A) => void) | undefined;
}

/** The accessibility action of a source, shared by both platforms. */
export function accessibilityProps(action: DragSourceOptions['accessibilityAction']): ViewProps {
  if (!action) return {};
  return {
    accessibilityActions: [{ name: 'move', label: action.label }],
    onAccessibilityAction: (event) => {
      if (event.nativeEvent.actionName === 'move') action.onAction();
    },
  };
}
