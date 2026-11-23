import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef, type ReactNode } from 'react';
import {
  BackHandler,
  Dimensions,
  Platform,
  Pressable,
  View,
  type HostInstance,
} from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { played } from '../test/mocks/expo-haptics';
import { reducedMotion } from '../test/mocks/reanimated';
import {
  DragBadge,
  DragProvider,
  useDraggedSource,
  useDragSource,
  useDropTarget,
  useLiftedSource,
  type DragProviderProps,
} from './drag-drop';
import type { Rect } from './drop-targets';
import { Text } from './primitives';

// measureInWindow of react-native-web reads getBoundingClientRect after a timeout: each test
// lays its views out here by test id.
const layout: Record<string, Rect> = {};

function rectOf(element: HTMLElement): DOMRect {
  const rect = layout[element.dataset.testid ?? ''] ?? { x: 0, y: 0, width: 0, height: 0 };
  return {
    ...rect,
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    toJSON: () => rect,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no layout: react-native-web would report a window of 0 × 0.
  vi.spyOn(Dimensions, 'get').mockReturnValue({ width: 1024, height: 768, scale: 1, fontScale: 1 });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return rectOf(this);
  });
  Object.assign(layout, {
    area: { x: 0, y: 0, width: 1024, height: 768 },
    'source-a': { x: 100, y: 100, width: 200, height: 40 },
    'target-fri': { x: 500, y: 100, width: 100, height: 40 },
    'target-sat': { x: 500, y: 300, width: 100, height: 40 },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const key of Object.keys(layout)) delete layout[key];
});

function Source(props: {
  id: string;
  disabled?: boolean;
  onBlocked?: () => void;
  onPress?: () => void;
}) {
  const {
    ref,
    props: sourceProps,
    style,
    dragging,
    guardPress,
  } = useDragSource({
    id: props.id,
    preview: () => <Text>{`Vorschau ${props.id}`}</Text>,
    disabled: props.disabled,
    onBlocked: props.onBlocked,
  });
  return (
    <Pressable
      ref={ref}
      {...sourceProps}
      style={style}
      testID={`source-${props.id}`}
      accessibilityRole="button"
      accessibilityLabel={dragging ? `${props.id} wird gezogen` : props.id}
      onPress={guardPress(props.onPress)}
    >
      <Text>{props.id}</Text>
    </Pressable>
  );
}

function Target(props: { id: string; disabled?: boolean }) {
  const ref = useRef<HostInstance>(null);
  const { dimmed, onLayout } = useDropTarget(props.id, ref, { disabled: props.disabled });
  return (
    <View
      ref={ref}
      testID={`target-${props.id}`}
      onLayout={onLayout}
      accessibilityLabel={dimmed ? `${props.id} gesperrt` : props.id}
    />
  );
}

function Area(props: Partial<DragProviderProps> & { children?: ReactNode }) {
  const { children, ...rest } = props;
  return (
    <DragProvider testID="area" {...rest}>
      {children ?? (
        <>
          <Source id="a" />
          <Target id="fri" />
          <Target id="sat" />
        </>
      )}
    </DragProvider>
  );
}

const source = () => screen.getByTestId('source-a');
const mouse = { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 };
const finger = { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0 };

/** A touchmove that react-native-web's responder system can read. */
function touchMove(node: HTMLElement) {
  const touch = { identifier: 7, clientX: 150, clientY: 120, pageX: 150, pageY: 120, force: 0 };
  return fireEvent.touchMove(node, {
    cancelable: true,
    touches: [{ ...touch, target: node }],
    changedTouches: [{ ...touch, target: node }],
  });
}

/** Lets the measurements (timeouts) and a few animation frames run. */
function frames(ms = 50) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function mouseLift(x = 150, y = 120) {
  fireEvent.pointerDown(source(), { ...mouse, clientX: x, clientY: y });
  fireEvent.pointerMove(window, { ...mouse, clientX: x + 10, clientY: y });
  frames();
}

function moveTo(x: number, y: number, pointer = mouse) {
  fireEvent.pointerMove(window, { ...pointer, clientX: x, clientY: y });
}

describe('DragProvider with web drag sources and drop targets (spec 0016)', () => {
  it('a mouse drag lifts after 4 px, shows the ghost with the target label and drops', () => {
    const onLift = vi.fn();
    const onDrop = vi.fn();
    const onHover = vi.fn();
    render(
      <Area onLift={onLift} onDrop={onDrop} onHover={onHover} targetLabel={(t) => `Ziel ${t}`} />,
    );
    fireEvent.pointerDown(source(), { ...mouse, clientX: 150, clientY: 120 });
    moveTo(152, 121);
    expect(onLift).not.toHaveBeenCalled();
    moveTo(160, 120);
    frames();
    expect(onLift).toHaveBeenCalledWith('a');
    expect(screen.getByText('Vorschau a')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'a wird gezogen' })).toBeTruthy();
    expect(document.body.style.cursor).toBe('grabbing');

    moveTo(550, 120);
    expect(onHover).toHaveBeenLastCalledWith('fri', 'a');
    expect(screen.getByTestId('drag-label').textContent).toBe('Ziel fri');
    moveTo(550, 320);
    expect(onHover).toHaveBeenLastCalledWith('sat', 'a');
    expect(screen.getByTestId('drag-label').textContent).toBe('Ziel sat');
    moveTo(800, 600);
    expect(onHover).toHaveBeenLastCalledWith(null, 'a');
    expect(screen.queryByTestId('drag-label')).toBeNull();

    moveTo(550, 120);
    fireEvent.pointerUp(window, { ...mouse, clientX: 550, clientY: 120 });
    expect(onDrop).toHaveBeenCalledWith('fri', 'a');
    expect(screen.queryByText('Vorschau a')).toBeNull();
    expect(screen.getByRole('button', { name: 'a' })).toBeTruthy();
    expect(document.body.style.cursor).toBe('');
  });

  it('the click that ends a drag does not open the entry; the next tap does', () => {
    const onPress = vi.fn();
    render(
      <Area>
        <Source id="a" onPress={onPress} />
        <Target id="fri" />
      </Area>,
    );
    mouseLift();
    moveTo(550, 120);
    fireEvent.pointerUp(window, { ...mouse, clientX: 550, clientY: 120 });
    fireEvent.click(source());
    expect(onPress).not.toHaveBeenCalled();

    fireEvent.pointerDown(source(), { ...mouse, clientX: 150, clientY: 120 });
    fireEvent.pointerUp(window, { ...mouse, clientX: 150, clientY: 120 });
    fireEvent.click(source());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('released over no target: cancels and the entry glides back', () => {
    const onCancel = vi.fn();
    const onDrop = vi.fn();
    render(<Area onCancel={onCancel} onDrop={onDrop} />);
    mouseLift();
    moveTo(800, 600);
    fireEvent.pointerUp(window, { ...mouse, clientX: 800, clientY: 600 });
    expect(onCancel).toHaveBeenCalledWith('a', null);
    expect(onDrop).not.toHaveBeenCalled();
    expect(screen.queryByText('Vorschau a')).toBeNull();
  });

  it('AC-015: a refused target looks pale, its label warns and the drop is refused', () => {
    const onCancel = vi.fn();
    const onDrop = vi.fn();
    render(
      <Area
        onCancel={onCancel}
        onDrop={onDrop}
        isAllowed={(target) => target !== 'sat'}
        targetLabel={(target) => (target === 'sat' ? 'Belegt' : null)}
      />,
    );
    expect(screen.getByLabelText('sat')).toBeTruthy();
    mouseLift();
    expect(screen.getByLabelText('sat gesperrt')).toBeTruthy();
    expect(screen.getByLabelText('fri')).toBeTruthy();
    moveTo(550, 120);
    expect(screen.queryByTestId('drag-label')).toBeNull();
    moveTo(550, 320);
    expect(screen.getByTestId('drag-label').textContent).toBe('Belegt');
    fireEvent.pointerUp(window, { ...mouse, clientX: 550, clientY: 320 });
    expect(onCancel).toHaveBeenCalledWith('a', 'sat');
    expect(onDrop).not.toHaveBeenCalled();
    expect(screen.getByLabelText('sat')).toBeTruthy();
  });

  it('a disabled target takes no drop and is not dimmed', () => {
    const onCancel = vi.fn();
    render(
      <Area onCancel={onCancel} isAllowed={() => false}>
        <Source id="a" />
        <Target id="fri" disabled />
      </Area>,
    );
    mouseLift();
    expect(screen.getByLabelText('fri')).toBeTruthy();
    moveTo(550, 120);
    fireEvent.pointerUp(window, { ...mouse, clientX: 550, clientY: 120 });
    expect(onCancel).toHaveBeenCalledWith('a', null);
  });

  it('Escape cancels a lifted drag before anything else hears it', () => {
    const onCancel = vi.fn();
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    render(<Area onCancel={onCancel} />);
    mouseLift();
    const notPrevented = fireEvent.keyDown(window, { key: 'Escape' });
    expect(notPrevented).toBe(false);
    expect(onCancel).toHaveBeenCalledWith('a', null);
    expect(screen.queryByText('Vorschau a')).toBeNull();
    window.removeEventListener('keydown', outer);
  });

  it('other keys leave the drag alone; Escape on a plain press only ends the press', () => {
    const onCancel = vi.fn();
    const onLift = vi.fn();
    render(<Area onCancel={onCancel} onLift={onLift} />);
    mouseLift();
    expect(fireEvent.keyDown(window, { key: 'Enter' })).toBe(true);
    expect(screen.getByText('Vorschau a')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });

    fireEvent.pointerDown(source(), { ...mouse, clientX: 150, clientY: 120 });
    fireEvent.keyDown(window, { key: 'Escape' });
    moveTo(200, 120);
    expect(onLift).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    // The window listeners are gone with the press: Escape now is nobody's business.
    expect(fireEvent.keyDown(window, { key: 'Escape' })).toBe(true);
  });

  it('a second pointer, a pointer cancel and leaving the window cancel', () => {
    const onCancel = vi.fn();
    render(<Area onCancel={onCancel} />);
    mouseLift();
    fireEvent.pointerDown(document.body, { ...finger, pointerId: 9, clientX: 10, clientY: 10 });
    expect(onCancel).toHaveBeenCalledTimes(1);

    mouseLift();
    fireEvent.pointerCancel(window, mouse);
    expect(onCancel).toHaveBeenCalledTimes(2);

    mouseLift();
    fireEvent.blur(window);
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(screen.queryByText('Vorschau a')).toBeNull();
  });

  it('ignores a right click and a pointer that is not the primary one', () => {
    const onLift = vi.fn();
    render(<Area onLift={onLift} />);
    fireEvent.pointerDown(source(), { ...mouse, button: 2, clientX: 150, clientY: 120 });
    moveTo(200, 120);
    fireEvent.pointerDown(source(), { ...mouse, isPrimary: false, clientX: 150, clientY: 120 });
    moveTo(200, 120);
    expect(onLift).not.toHaveBeenCalled();
  });

  it('AC-004: a finger lifts after holding 400 ms; moving first scrolls instead', () => {
    const onLift = vi.fn();
    render(<Area onLift={onLift} />);
    expect(source().style.touchAction).toBe('pan-y');

    fireEvent.pointerDown(source(), { ...finger, clientX: 150, clientY: 120 });
    moveTo(150, 140, finger);
    frames(500);
    expect(onLift).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, { ...finger, clientX: 150, clientY: 140 });

    fireEvent.pointerDown(source(), { ...finger, clientX: 150, clientY: 120 });
    frames(399);
    expect(onLift).not.toHaveBeenCalled();
    frames(1);
    expect(onLift).toHaveBeenCalledWith('a');
    expect(screen.getByText('Vorschau a')).toBeTruthy();
  });

  it('while held the page neither scrolls, opens the context menu nor drags the DOM node', () => {
    render(<Area />);
    const node = source();
    expect(fireEvent.dragStart(node)).toBe(false);
    expect(fireEvent.contextMenu(node)).toBe(true);

    fireEvent.pointerDown(node, { ...finger, clientX: 150, clientY: 120 });
    expect(fireEvent.contextMenu(node)).toBe(false);
    // Before the lift a swipe scrolls the page …
    expect(touchMove(node)).toBe(true);
    frames(400);
    // … after it the finger moves the entry, not the page.
    expect(touchMove(node)).toBe(false);
    fireEvent.pointerUp(window, { ...finger, clientX: 150, clientY: 120 });
    expect(touchMove(node)).toBe(true);
  });

  it('AC-005: a disabled source does not lift; holding it shows the hint and the tap is swallowed', () => {
    const onBlocked = vi.fn();
    const onPress = vi.fn();
    const onLift = vi.fn();
    render(
      <Area onLift={onLift}>
        <Source id="a" disabled onBlocked={onBlocked} onPress={onPress} />
      </Area>,
    );
    fireEvent.pointerDown(source(), { ...finger, clientX: 150, clientY: 120 });
    frames(400);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(onLift).not.toHaveBeenCalled();
    expect(screen.queryByText('Vorschau a')).toBeNull();
    fireEvent.pointerUp(window, { ...finger, clientX: 150, clientY: 120 });
    fireEvent.click(source());
    expect(onPress).not.toHaveBeenCalled();

    fireEvent.pointerDown(source(), { ...mouse, clientX: 150, clientY: 120 });
    moveTo(200, 120);
    expect(onBlocked).toHaveBeenCalledTimes(2);
  });

  it('a source that leaves the page while lifted keeps its drag until release', () => {
    const onDrop = vi.fn();
    const { rerender } = render(
      <Area onDrop={onDrop}>
        <Source id="a" />
        <Target id="fri" />
      </Area>,
    );
    mouseLift();
    rerender(
      <Area onDrop={onDrop}>
        {null}
        <Target id="fri" />
      </Area>,
    );
    expect(screen.queryByTestId('source-a')).toBeNull();
    moveTo(550, 120);
    fireEvent.pointerUp(window, { ...mouse, clientX: 550, clientY: 120 });
    expect(onDrop).toHaveBeenCalledWith('fri', 'a');
  });

  it('only one source lifts at a time', () => {
    layout['source-b'] = { x: 100, y: 200, width: 200, height: 40 };
    const onLift = vi.fn();
    render(
      <Area onLift={onLift}>
        <Source id="a" />
        <Source id="b" />
      </Area>,
    );
    mouseLift();
    const b = screen.getByTestId('source-b');
    fireEvent.pointerDown(b, { ...mouse, pointerId: 1, clientX: 150, clientY: 220 });
    moveTo(200, 220);
    expect(onLift).toHaveBeenCalledTimes(1);
    expect(onLift).toHaveBeenCalledWith('a');
  });

  it('a lifted drag ends when the drag area unmounts', () => {
    const onCancel = vi.fn();
    const { unmount } = render(<Area onCancel={onCancel} />);
    mouseLift();
    unmount();
    expect(onCancel).toHaveBeenCalledWith('a', null);
  });

  it('reduced motion: the entry neither grows nor glides; it stands where it ends at once', () => {
    reducedMotion.value = true;
    const onCancel = vi.fn();
    render(<Area onCancel={onCancel} />);
    mouseLift();
    expect(screen.getByText('Vorschau a')).toBeTruthy();
    fireEvent.pointerUp(window, { ...mouse, clientX: 800, clientY: 600 });
    expect(onCancel).toHaveBeenCalledWith('a', null);
    expect(screen.queryByText('Vorschau a')).toBeNull();
  });

  it('Android: back cancels the drag before it closes anything else; lift and drop tap lightly', () => {
    const onCancel = vi.fn();
    const onDrop = vi.fn();
    let back: (() => boolean | null | undefined) | undefined;
    const remove = vi.fn();
    vi.spyOn(BackHandler, 'addEventListener').mockImplementation((_name, handler) => {
      back = () => handler({} as Parameters<typeof handler>[0]);
      return { remove };
    });
    const web = Platform.OS;
    played.length = 0;
    try {
      Object.assign(Platform, { OS: 'android' });
      render(<Area onCancel={onCancel} onDrop={onDrop} />);
      mouseLift();
      expect(played).toEqual(['impact:light']);
      let handled: boolean | null | undefined;
      act(() => {
        handled = back?.();
      });
      expect(handled).toBe(true);
      expect(onCancel).toHaveBeenCalledWith('a', null);
      expect(remove).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Vorschau a')).toBeNull();
      // The source forgot its gesture: the release that follows drops nothing, the next drag works.
      fireEvent.pointerUp(window, { ...mouse, clientX: 550, clientY: 120 });
      expect(onDrop).not.toHaveBeenCalled();
      mouseLift();
      moveTo(550, 120);
      fireEvent.pointerUp(window, { ...mouse, clientX: 550, clientY: 120 });
      expect(onDrop).toHaveBeenCalledWith('fri', 'a');
      expect(played).toEqual(['impact:light', 'impact:light', 'impact:light']);
    } finally {
      Object.assign(Platform, { OS: web });
    }
  });

  it('with onPage shows the paging handles; holding at an edge turns the page', () => {
    const onPage = vi.fn();
    render(<Area onPage={onPage} />);
    expect(screen.queryByTestId('drag-edge-previous')).toBeNull();
    mouseLift();
    expect(screen.getByTestId('drag-edge-previous')).toBeTruthy();
    expect(screen.getByTestId('drag-edge-next')).toBeTruthy();
    moveTo(1024 - 30, 400);
    frames(1200);
    expect(onPage).toHaveBeenCalledWith(1);
    moveTo(30, 400);
    frames(1200);
    expect(onPage).toHaveBeenLastCalledWith(-1);
    fireEvent.pointerUp(window, { ...mouse, clientX: 30, clientY: 400 });
    expect(screen.queryByTestId('drag-edge-previous')).toBeNull();
  });

  it('a target that appears during the drag is measured and takes the drop', () => {
    layout['target-new'] = { x: 700, y: 500, width: 100, height: 40 };
    const onDrop = vi.fn();
    function Late() {
      const lifted = useLiftedSource();
      return lifted ? <Target id="new" /> : null;
    }
    render(
      <Area onDrop={onDrop}>
        <Source id="a" />
        <Late />
      </Area>,
    );
    mouseLift();
    frames();
    moveTo(750, 520);
    fireEvent.pointerUp(window, { ...mouse, clientX: 750, clientY: 520 });
    expect(onDrop).toHaveBeenCalledWith('new', 'a');
  });
});

describe('useDraggedSource and useLiftedSource', () => {
  function Probe() {
    return <Text testID="probe">{`${useDraggedSource() ?? '-'} ${useLiftedSource() ?? '-'}`}</Text>;
  }

  it('name the dragged source at once and the lifted one once it was measured', () => {
    render(
      <Area>
        <Source id="a" />
        <Probe />
      </Area>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('- -');
    fireEvent.pointerDown(source(), { ...mouse, clientX: 150, clientY: 120 });
    moveTo(160, 120);
    expect(screen.getByTestId('probe').textContent).toBe('a -');
    frames();
    expect(screen.getByTestId('probe').textContent).toBe('a a');
    fireEvent.pointerUp(window, { ...mouse, clientX: 800, clientY: 600 });
    expect(screen.getByTestId('probe').textContent).toBe('- -');
  });
});

describe('DragBadge', () => {
  it('shows its content inside a DragProvider', () => {
    render(
      <Area>
        <DragBadge>
          <Text>3 Tage</Text>
        </DragBadge>
      </Area>,
    );
    expect(screen.getByText('3 Tage')).toBeTruthy();
  });

  it('needs a DragProvider above it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<DragBadge>x</DragBadge>)).toThrow('A DragBadge needs a DragProvider');
  });
});
