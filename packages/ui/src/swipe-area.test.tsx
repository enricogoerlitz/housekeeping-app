import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Text } from 'react-native';

import { Button } from './controls';
import { SwipeArea } from './swipe-area';

// react-native-web builds PanResponder's gestures from mouse events on the document; the time
// stamps drive its velocity, so each event gets its own.
let stamp = 1000;
function mouse(target: Element, type: 'mousedown' | 'mousemove' | 'mouseup', x: number, y = 100) {
  stamp += 50;
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

/** Presses at the first point, moves through the others and lets go at the last one. */
function drag(target: Element, points: [number, number][]) {
  const [first, ...rest] = points;
  mouse(target, 'mousedown', first![0], first![1]);
  for (const [x, y] of rest) mouse(target, 'mousemove', x, y);
  const last = points[points.length - 1]!;
  mouse(target, 'mouseup', last[0], last[1]);
}

function renderArea(props: { enabled?: boolean } = {}) {
  const onSwipe = vi.fn();
  const onPress = vi.fn();
  render(
    <SwipeArea onSwipe={onSwipe} testID="area" {...props}>
      <Button label="Heute" onPress={onPress} />
    </SwipeArea>,
  );
  return { onSwipe, onPress, area: screen.getByRole('button', { name: 'Heute' }) };
}

describe('SwipeArea (spec 0016, REQ-006)', () => {
  it('a swipe to the left goes to the next item', () => {
    const { onSwipe, area } = renderArea();
    drag(area, [
      [300, 100],
      [285, 100],
      [200, 102],
      [150, 102],
    ]);
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith(1);
  });

  it('a swipe to the right goes to the previous item, every swipe counts', () => {
    const { onSwipe, area } = renderArea();
    const right: [number, number][] = [
      [100, 100],
      [115, 100],
      [200, 100],
    ];
    drag(area, right);
    drag(area, right);
    expect(onSwipe.mock.calls).toEqual([[-1], [-1]]);
  });

  it('a short sideways move is no swipe', () => {
    const { onSwipe, area } = renderArea();
    drag(area, [
      [100, 100],
      [112, 100],
      [120, 100],
    ]);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('a vertical move stays a scroll', () => {
    const { onSwipe, area } = renderArea();
    drag(area, [
      [100, 100],
      [105, 140],
      [180, 240],
    ]);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('disabled while something else owns the finger', () => {
    const { onSwipe, area } = renderArea({ enabled: false });
    drag(area, [
      [300, 100],
      [285, 100],
      [150, 100],
    ]);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('taps on its children keep working', () => {
    const { onPress, onSwipe, area } = renderArea();
    fireEvent.click(area);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onSwipe).not.toHaveBeenCalled();
    expect(screen.getByTestId('area')).toBeTruthy();
  });

  it('AC-012 (spec 0034): a swipe in a row that scrolls sideways scrolls the row, not the item', () => {
    const onSwipe = vi.fn();
    render(
      <SwipeArea onSwipe={onSwipe}>
        <Text testID="row" style={{ overflowX: 'auto' } as object}>
          Essen des Tages
        </Text>
      </SwipeArea>,
    );
    const row = screen.getByTestId('row');
    Object.defineProperty(row, 'scrollWidth', { configurable: true, value: 800 });
    Object.defineProperty(row, 'clientWidth', { configurable: true, value: 390 });
    drag(row, [
      [300, 100],
      [285, 100],
      [150, 100],
    ]);
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
