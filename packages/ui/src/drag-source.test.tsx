// The native drag source (drag-source.ts). The component tests resolve `./drag-source` to the web
// file like Metro on the web, so the native twin is loaded by its full name. It runs on
// react-native-web here: its touch handlers get the DOM touch events and its PanResponder the
// responder events of react-native-web, which mirror the native ones.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { Dimensions, Pressable, View, type HostInstance } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DragSourceOptions } from './drag-context';
import { DragProvider, useDropTarget, type DragProviderProps } from './drag-drop';
import type { Rect } from './drop-targets';
import { Text } from './primitives';
import { PageScrollControlContext, type PageScrollControl } from './shell';

const native = await vi.importActual<typeof import('./drag-source')>('./drag-source.ts');

const layout: Record<string, Rect> = {};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Dimensions, 'get').mockReturnValue({ width: 1024, height: 768, scale: 1, fontScale: 1 });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const rect = layout[this.dataset.testid ?? ''] ?? { x: 0, y: 0, width: 0, height: 0 };
    return {
      ...rect,
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      toJSON: () => rect,
    };
  });
  Object.assign(layout, {
    area: { x: 0, y: 0, width: 1024, height: 768 },
    'source-a': { x: 100, y: 100, width: 200, height: 40 },
    'target-fri': { x: 500, y: 100, width: 100, height: 40 },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const key of Object.keys(layout)) delete layout[key];
});

function NativeSource(props: Partial<DragSourceOptions> & { onPress?: () => void }) {
  const { onPress, ...options } = props;
  const binding = native.useDragSource({
    id: 'a',
    preview: () => <Text>Vorschau a</Text>,
    ...options,
  });
  const { ref, props: sourceProps, dragging, guardPress } = binding;
  const press = guardPress(onPress);
  return (
    <View
      ref={ref}
      {...sourceProps}
      testID="source-a"
      accessibilityLabel={dragging ? 'a wird gezogen' : 'a'}
    >
      {press ? (
        <Pressable testID="press" onPress={press}>
          <Text>a</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Target() {
  const ref = useRef<HostInstance>(null);
  const { onLayout } = useDropTarget('fri', ref);
  return <View ref={ref} testID="target-fri" onLayout={onLayout} />;
}

function Area(props: Partial<DragProviderProps> & { source?: Partial<DragSourceOptions> }) {
  const { source: options, ...callbacks } = props;
  return (
    <DragProvider testID="area" {...callbacks}>
      <NativeSource {...options} />
      <Target />
    </DragProvider>
  );
}

const node = () => screen.getByTestId('source-a');

function touchesAt(points: { id: number; x: number; y: number }[]) {
  return points.map(({ id, x, y }) => ({
    identifier: id,
    pageX: x,
    pageY: y,
    clientX: x,
    clientY: y,
    force: 0,
    target: node(),
  }));
}

/** Touch events as react-native-web's responder system and the View's handlers read them. */
function touch(
  type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
  changed: { id: number; x: number; y: number }[],
  active = changed,
) {
  act(() => {
    vi.advanceTimersByTime(16);
  });
  fireEvent[type](node(), {
    changedTouches: touchesAt(changed),
    touches: touchesAt(type === 'touchEnd' || type === 'touchCancel' ? [] : active),
  });
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function holdAndLift() {
  touch('touchStart', [{ id: 1, x: 150, y: 120 }]);
  wait(450);
}

describe('useDragSource on iOS and Android (spec 0016)', () => {
  it('holding 400 ms lifts the entry; released over a target drops it', () => {
    const onLift = vi.fn();
    const onDrop = vi.fn();
    render(<Area onLift={onLift} onDrop={onDrop} />);
    touch('touchStart', [{ id: 1, x: 150, y: 120 }]);
    wait(300);
    expect(onLift).not.toHaveBeenCalled();
    wait(150);
    expect(onLift).toHaveBeenCalledWith('a');
    expect(screen.getByLabelText('a wird gezogen')).toBeTruthy();
    expect(screen.getByText('Vorschau a')).toBeTruthy();

    touch('touchMove', [{ id: 1, x: 550, y: 120 }]);
    touch('touchEnd', [{ id: 1, x: 550, y: 120 }]);
    expect(onDrop).toHaveBeenCalledWith('fri', 'a');
    expect(screen.queryByText('Vorschau a')).toBeNull();
    expect(screen.getByLabelText('a')).toBeTruthy();
  });

  it('AC-004: moving before the hold ends scrolls; nothing lifts', () => {
    const onLift = vi.fn();
    render(<Area onLift={onLift} />);
    touch('touchStart', [{ id: 1, x: 150, y: 120 }]);
    touch('touchMove', [{ id: 1, x: 150, y: 160 }]);
    wait(500);
    expect(onLift).not.toHaveBeenCalled();
  });

  it('the scroll view taking the touch before the lift cancels the press', () => {
    const onLift = vi.fn();
    render(<Area onLift={onLift} />);
    touch('touchStart', [{ id: 1, x: 150, y: 120 }]);
    touch('touchCancel', [{ id: 1, x: 150, y: 120 }]);
    wait(500);
    expect(onLift).not.toHaveBeenCalled();
  });

  it('turns the page scrolling off while lifted and on again after the drop', () => {
    const scroll: PageScrollControl = {
      setScrollEnabled: vi.fn(),
      scrollBy: vi.fn(),
      measure: (done) => done({ x: 0, y: 0, width: 1024, height: 768 }),
    };
    render(
      <PageScrollControlContext.Provider value={scroll}>
        <Area />
      </PageScrollControlContext.Provider>,
    );
    holdAndLift();
    expect(scroll.setScrollEnabled).toHaveBeenLastCalledWith(false);
    // At the bottom edge the page scrolls along.
    touch('touchMove', [{ id: 1, x: 150, y: 760 }]);
    wait(100);
    expect(scroll.scrollBy).toHaveBeenCalled();
    touch('touchEnd', [{ id: 1, x: 150, y: 760 }]);
    expect(scroll.setScrollEnabled).toHaveBeenLastCalledWith(true);
  });

  it('a second finger cancels the drag', () => {
    const onCancel = vi.fn();
    render(<Area onCancel={onCancel} />);
    holdAndLift();
    touch('touchMove', [{ id: 1, x: 160, y: 120 }]);
    touch(
      'touchStart',
      [{ id: 2, x: 300, y: 300 }],
      [
        { id: 1, x: 160, y: 120 },
        { id: 2, x: 300, y: 300 },
      ],
    );
    expect(onCancel).toHaveBeenCalledWith('a', null);
    expect(screen.queryByText('Vorschau a')).toBeNull();
  });

  it('a second finger that lands elsewhere cancels the drag on the next move (a pinch)', () => {
    const onCancel = vi.fn();
    render(<Area onCancel={onCancel} />);
    holdAndLift();
    touch('touchMove', [{ id: 1, x: 160, y: 120 }]);
    act(() => {
      vi.advanceTimersByTime(16);
    });
    const other = screen.getByTestId('target-fri');
    const second = { identifier: 2, pageX: 550, pageY: 120, clientX: 550, clientY: 120 };
    fireEvent.touchStart(other, {
      changedTouches: [{ ...second, target: other }],
      touches: [...touchesAt([{ id: 1, x: 160, y: 120 }]), { ...second, target: other }],
    });
    expect(onCancel).not.toHaveBeenCalled();
    touch(
      'touchMove',
      [{ id: 1, x: 170, y: 120 }],
      [
        { id: 1, x: 170, y: 120 },
        { id: 2, x: 550, y: 120 },
      ],
    );
    expect(onCancel).toHaveBeenCalledWith('a', null);
  });

  it('the system taking the touch (a touch cancel) sends the entry back', () => {
    const onCancel = vi.fn();
    render(<Area onCancel={onCancel} />);
    holdAndLift();
    touch('touchMove', [{ id: 1, x: 160, y: 120 }]);
    touch('touchCancel', [{ id: 1, x: 160, y: 120 }]);
    expect(onCancel).toHaveBeenCalledWith('a', null);
    expect(screen.queryByText('Vorschau a')).toBeNull();
  });

  it('released over no target cancels', () => {
    const onCancel = vi.fn();
    render(<Area onCancel={onCancel} />);
    holdAndLift();
    touch('touchMove', [{ id: 1, x: 900, y: 600 }]);
    touch('touchEnd', [{ id: 1, x: 900, y: 600 }]);
    expect(onCancel).toHaveBeenCalledWith('a', null);
  });

  it('the press that ends a drag does not open the entry; the next tap does', () => {
    const onPress = vi.fn();
    render(
      <DragProvider testID="area">
        <NativeSource onPress={onPress} />
        <Target />
      </DragProvider>,
    );
    holdAndLift();
    // A press while lifted (the Pressable fires before the drag ends) is ignored too.
    fireEvent.click(screen.getByTestId('press'));
    touch('touchMove', [{ id: 1, x: 550, y: 120 }]);
    touch('touchEnd', [{ id: 1, x: 550, y: 120 }]);
    // Past react-native-web's own 250 ms click guard of the PanResponder: guardPress swallows it.
    wait(300);
    fireEvent.click(screen.getByTestId('press'));
    expect(onPress).not.toHaveBeenCalled();

    touch('touchStart', [{ id: 1, x: 150, y: 120 }]);
    touch('touchEnd', [{ id: 1, x: 150, y: 120 }]);
    fireEvent.click(screen.getByTestId('press'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('AC-005: a disabled source does not lift; holding shows the hint', () => {
    const onBlocked = vi.fn();
    const onLift = vi.fn();
    render(<Area onLift={onLift} source={{ disabled: true, onBlocked }} />);
    holdAndLift();
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(onLift).not.toHaveBeenCalled();
  });

  it('a source that unmounts while lifted ends its drag', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<Area onCancel={onCancel} />);
    holdAndLift();
    rerender(
      <DragProvider testID="area" onCancel={onCancel}>
        <Target />
      </DragProvider>,
    );
    expect(onCancel).toHaveBeenCalledWith('a', null);
    expect(screen.queryByText('Vorschau a')).toBeNull();
  });

  it('a source that unmounts idle ends nothing', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<Area onCancel={onCancel} />);
    rerender(
      <DragProvider testID="area" onCancel={onCancel}>
        <Target />
      </DragProvider>,
    );
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('screen readers get the move as an accessibility action', () => {
    const onAction = vi.fn();
    let captured: ReturnType<typeof native.useDragSource> | undefined;
    function Probe() {
      captured = native.useDragSource({
        id: 'a',
        preview: () => null,
        accessibilityAction: { label: 'Verschieben', onAction },
      });
      return null;
    }
    render(
      <DragProvider>
        <Probe />
      </DragProvider>,
    );
    expect(captured?.props.accessibilityActions).toEqual([{ name: 'move', label: 'Verschieben' }]);
    expect(captured?.style).toBeNull();
  });
});
