// A drag source in the browser (spec 0016, plan decision 2), the path the PWA takes on the iPhone.
// Pointer events on the DOM node: a mouse drags after 4 px, a finger lifts after holding 400 ms
// within 8 px. Until then `touch-action: pan-y` lets a swipe scroll the page (AC-004); after the
// lift a non-passive touchmove listener keeps the page still. Holding must neither select text
// nor open the callout or context menu, and the click that ends a drag must not open the entry.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HostInstance, ViewStyle } from 'react-native';

import { accessibilityProps, type DragSourceBinding, type DragSourceOptions } from './drag-context';
import type { Point } from './drop-targets';
import type { DragGestureEvent, PointerKind } from './drag-gesture-state';
import { useDragGesture } from './use-drag-gesture';

// react-native-web passes these through as CSS; the -webkit- ones are set on the node below.
const SOURCE_STYLE = {
  cursor: 'grab',
  touchAction: 'pan-y',
  userSelect: 'none',
} as unknown as ViewStyle;

const now = () => Date.now();
const pointOf = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY });
const kindOf = (event: PointerEvent): PointerKind =>
  event.pointerType === 'mouse' ? 'mouse' : 'touch';

function isElement(node: unknown): node is HTMLElement {
  return typeof HTMLElement !== 'undefined' && node instanceof HTMLElement;
}

/** While an entry hangs on the pointer the whole page neither selects text nor shows a text cursor. */
function lockPage(): () => void {
  const style = document.body.style;
  const previous = {
    userSelect: style.userSelect,
    webkitUserSelect: style.getPropertyValue('-webkit-user-select'),
    cursor: style.cursor,
  };
  style.userSelect = 'none';
  style.setProperty('-webkit-user-select', 'none');
  style.cursor = 'grabbing';
  return () => {
    style.userSelect = previous.userSelect;
    style.setProperty('-webkit-user-select', previous.webkitUserSelect);
    style.cursor = previous.cursor;
  };
}

export function useDragSource(options: DragSourceOptions): DragSourceBinding {
  const [element, setElement] = useState<HTMLElement | null>(null);
  // Window listeners live from the press to the end of the gesture; the page lock while lifted.
  const detach = useRef<() => void>(() => undefined);
  const unlock = useRef<() => void>(() => undefined);
  const gesture = useDragGesture(options, {
    onLift: () => {
      unlock.current = lockPage();
    },
    onEnd: () => {
      unlock.current();
      unlock.current = () => undefined;
    },
    onIdle: () => detach.current(),
  });
  const { dispatch, phase, setNode } = gesture;
  const ref = useCallback(
    (instance: HostInstance | null) => {
      setNode(instance);
      setElement(isElement(instance) ? instance : null);
    },
    [setNode],
  );

  useEffect(() => {
    if (!element) return;
    element.style.setProperty('-webkit-touch-callout', 'none');
    element.style.setProperty('-webkit-user-select', 'none');

    const send = (event: DragGestureEvent) => dispatch(event);
    const onMove = (event: PointerEvent) =>
      send({ type: 'move', pointerId: event.pointerId, point: pointOf(event), time: now() });
    const onUp = (event: PointerEvent) =>
      send({
        type: 'up',
        pointerId: event.pointerId,
        point: pointOf(event),
        time: now(),
        target: null,
      });
    // The browser took the touch for scrolling or the system for a gesture.
    const onCancel = () => send({ type: 'cancel' });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || phase() === 'idle') return;
      event.preventDefault();
      send({ type: 'key', key: event.key });
    };
    // Any further pointer, anywhere, cancels (a second finger).
    const onOtherDown = (event: PointerEvent) =>
      send({
        type: 'down',
        pointerId: event.pointerId,
        kind: kindOf(event),
        point: pointOf(event),
        time: now(),
      });
    const attach = () => {
      detach.current();
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('pointerdown', onOtherDown, true);
      // Capture phase: Escape ends the drag before it closes a panel listening on the window.
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('blur', onCancel);
      detach.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('pointerdown', onOtherDown, true);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('blur', onCancel);
        detach.current = () => undefined;
      };
    };

    const onDown = (event: PointerEvent) => {
      if (!event.isPrimary || phase() !== 'idle') return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      send({
        type: 'down',
        pointerId: event.pointerId,
        kind: kindOf(event),
        point: pointOf(event),
        time: now(),
      });
      attach();
    };
    // Capture phase, before react-native-web's Pressable sees it: its onPress runs on click.
    const onClick = (event: MouseEvent) => {
      if (send({ type: 'click' })?.type !== 'swallowClick') return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onTouchMove = (event: TouchEvent) => {
      if (phase() === 'dragging' && event.cancelable) event.preventDefault();
    };
    // Android shows the context menu on a long press; iOS's callout is off by CSS.
    const onContextMenu = (event: Event) => {
      if (phase() !== 'idle') event.preventDefault();
    };
    const onDragStart = (event: Event) => event.preventDefault();

    element.addEventListener('pointerdown', onDown);
    element.addEventListener('click', onClick, true);
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('contextmenu', onContextMenu);
    element.addEventListener('dragstart', onDragStart);
    return () => {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('click', onClick, true);
      element.removeEventListener('contextmenu', onContextMenu);
      element.removeEventListener('dragstart', onDragStart);
      if (phase() === 'idle') {
        element.removeEventListener('touchmove', onTouchMove);
        return;
      }
      // The source left the page while lifted (the view turned a page): the touch still targets
      // this node, so it keeps holding the page still, and the window listeners keep the drag
      // going until it ends.
      const stillDragging = detach.current;
      detach.current = () => {
        stillDragging();
        element.removeEventListener('touchmove', onTouchMove);
      };
    };
  }, [element, dispatch, phase]);

  return {
    ref,
    props: accessibilityProps(options.accessibilityAction),
    style: SOURCE_STYLE,
    dragging: gesture.dragging,
    guardPress: gesture.guardPress,
  };
}
