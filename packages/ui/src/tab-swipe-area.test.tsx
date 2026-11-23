import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reducedMotion } from '../test/mocks/reanimated';
import { pointer } from '../test/setup';
import { Button } from './controls';
import { Text } from './primitives';
import { SwipeToRemove } from './swipe-row';
import { TabSwipeArea } from './tab-swipe-area';
import type { TabSwipe } from './tab-swipe';

/** The window size react-native-web reads (jsdom reports 0 × 0). */
function setWindow(width: number, height: number) {
  const root = document.documentElement;
  Object.defineProperty(root, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: height });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

// react-native-web builds PanResponder's gestures from mouse events on the document; the time
// stamps drive its velocity, so each event gets its own.
let stamp = 1000;
function mouse(target: Element, type: 'mousedown' | 'mousemove' | 'mouseup', x: number, y: number) {
  stamp += 100;
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'mouseup' ? 0 : 1,
  });
  Object.defineProperty(event, 'timeStamp', { value: stamp });
  act(() => {
    target.dispatchEvent(event);
  });
}
function drag(target: Element, points: [number, number][]) {
  const [first, ...rest] = points;
  mouse(target, 'mousedown', first![0], first![1]);
  for (const [x, y] of rest) mouse(target, 'mousemove', x, y);
  const last = points[points.length - 1]!;
  mouse(target, 'mouseup', last[0], last[1]);
}
/** A native scroll that starts while the finger is down (iOS with `pan-y`, spec 0030). */
function nativeScroll(target: Element) {
  act(() => {
    target.dispatchEvent(new Event('scroll', { bubbles: false }));
  });
}

// 40 px per 100 ms: slow, so the distance decides.
const LEFT: [number, number][] = [
  [300, 300],
  [280, 300],
  [240, 300],
  [200, 300],
  [160, 300],
];
const RIGHT: [number, number][] = [
  [90, 300],
  [110, 300],
  [150, 300],
  [190, 300],
  [230, 300],
];

function renderArea(index = 1, count = 3) {
  const onStep = vi.fn();
  const swipe: TabSwipe = { index, count, onStep };
  const view = render(
    <TabSwipeArea swipe={swipe}>
      <Button label="Inhalt" onPress={() => undefined} />
    </TabSwipeArea>,
  );
  const content = screen.getByRole('button', { name: 'Inhalt' });
  return { ...view, onStep, content, swipe };
}

beforeEach(() => {
  setWindow(390, 844);
});
afterEach(() => {
  vi.useRealTimers();
  setWindow(0, 0);
});

describe('TabSwipeArea (spec 0029, REQ-003)', () => {
  it('a swipe to the left past the threshold shows the next tab', () => {
    const { onStep, content } = renderArea();
    drag(content, LEFT);
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it('a swipe to the right shows the previous tab', () => {
    const { onStep, content } = renderArea();
    drag(content, RIGHT);
    expect(onStep).toHaveBeenCalledWith(-1);
  });

  it('on the first tab a swipe to the right only resists and changes nothing', () => {
    const { onStep, content } = renderArea(0);
    drag(content, RIGHT);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('a short swipe springs back', () => {
    const { onStep, content } = renderArea();
    drag(content, [
      [300, 300],
      [285, 300],
      [270, 300],
    ]);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('AC-025: a move that starts vertically stays a scroll, even when it turns sideways', () => {
    const { onStep, content } = renderArea();
    drag(content, [
      [300, 300],
      [298, 330],
      [250, 335],
      [150, 340],
      [100, 340],
    ]);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('a move from the screen edge belongs to the system back gesture', () => {
    const { onStep, content } = renderArea();
    drag(content, [
      [10, 300],
      [30, 300],
      [70, 300],
      [110, 300],
      [150, 300],
    ]);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('only with a finger: a mouse or trackpad does not swipe', () => {
    pointer.fine = true;
    const { onStep, content } = renderArea();
    drag(content, LEFT);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('only on phones', () => {
    setWindow(1024, 768);
    const { onStep, content } = renderArea();
    drag(content, [
      [900, 300],
      [880, 300],
      [840, 300],
      [800, 300],
      [700, 300],
      [600, 300],
    ]);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('with reduced motion the tab changes at once', () => {
    reducedMotion.value = true;
    const { onStep, content } = renderArea();
    drag(content, LEFT);
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it('decision 8: a touch in a row that scrolls sideways belongs to that row', () => {
    const onStep = vi.fn();
    render(
      <TabSwipeArea swipe={{ index: 1, count: 3, onStep }}>
        <Text testID="chips" style={{ overflowX: 'auto' } as object}>
          Chips
        </Text>
      </TabSwipeArea>,
    );
    const chips = screen.getByTestId('chips');
    Object.defineProperty(chips, 'scrollWidth', { configurable: true, value: 800 });
    Object.defineProperty(chips, 'clientWidth', { configurable: true, value: 390 });
    drag(chips, LEFT);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('a row swipe inside claims the move first', () => {
    const onStep = vi.fn();
    const onRemove = vi.fn();
    vi.useFakeTimers();
    render(
      <TabSwipeArea swipe={{ index: 1, count: 3, onStep }}>
        <SwipeToRemove onRemove={onRemove} label="Entfernen">
          <Text>Milch</Text>
        </SwipeToRemove>
      </TabSwipeArea>,
    );
    drag(screen.getByText('Milch'), [
      [300, 300],
      [280, 300],
      [150, 300],
    ]);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('a swipe that is cut off springs back', () => {
    const { onStep, content } = renderArea();
    mouse(content, 'mousedown', 300, 300);
    mouse(content, 'mousemove', 280, 300);
    mouse(content, 'mousemove', 200, 300);
    act(() => {
      content.dispatchEvent(new Event('touchcancel', { bubbles: true }));
    });
    mouse(content, 'mouseup', 160, 300);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('the tab did not change after all: the content comes back and the next swipe works', () => {
    vi.useFakeTimers();
    const { onStep, content } = renderArea();
    drag(content, LEFT);
    expect(onStep).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    drag(content, LEFT);
    expect(onStep).toHaveBeenCalledTimes(2);
  });

  it('the new tab arrives once the screen shows it', () => {
    const { onStep, content, rerender } = renderArea();
    drag(content, LEFT);
    expect(onStep).toHaveBeenCalledWith(1);
    rerender(
      <TabSwipeArea swipe={{ index: 2, count: 3, onStep }}>
        <Text>Neuer Tab</Text>
      </TabSwipeArea>,
    );
    expect(screen.getByText('Neuer Tab')).toBeTruthy();
    // On the last tab only the way back is left.
    drag(screen.getByText('Neuer Tab'), LEFT);
    expect(onStep).toHaveBeenCalledTimes(1);
    drag(screen.getByText('Neuer Tab'), RIGHT);
    expect(onStep).toHaveBeenLastCalledWith(-1);
  });

  it('with reduced motion the new tab only fades in', () => {
    reducedMotion.value = true;
    const { onStep, content, rerender } = renderArea();
    drag(content, LEFT);
    rerender(
      <TabSwipeArea swipe={{ index: 2, count: 3, onStep }}>
        <Text>Neuer Tab</Text>
      </TabSwipeArea>,
    );
    expect(screen.getByText('Neuer Tab')).toBeTruthy();
  });

  it('taps on the content keep working', () => {
    const onPress = vi.fn();
    render(
      <TabSwipeArea swipe={{ index: 0, count: 2, onStep: () => undefined }}>
        <Button label="Öffnen" onPress={onPress} />
      </TabSwipeArea>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('TabSwipeArea after a native scroll began (spec 0030, REQ-007)', () => {
  it('a sideways move still changes the tab', () => {
    const { onStep, content } = renderArea();
    mouse(content, 'mousedown', 300, 300);
    nativeScroll(content);
    for (const [x, y] of LEFT.slice(1)) mouse(content, 'mousemove', x, y);
    mouse(content, 'mouseup', 160, 300);
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it('a mostly vertical move stays a scroll', () => {
    const { onStep, content } = renderArea();
    mouse(content, 'mousedown', 300, 300);
    nativeScroll(content);
    mouse(content, 'mousemove', 295, 340);
    mouse(content, 'mousemove', 200, 345);
    mouse(content, 'mousemove', 120, 345);
    mouse(content, 'mouseup', 120, 345);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('a scroll without a finger on the screen is left alone', () => {
    const { onStep, content } = renderArea();
    nativeScroll(content);
    drag(content, LEFT);
    expect(onStep).toHaveBeenCalledTimes(1);
  });
});
