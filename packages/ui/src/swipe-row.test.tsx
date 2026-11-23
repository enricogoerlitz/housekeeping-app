import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reducedMotion } from '../test/mocks/reanimated';
import { Button } from './controls';
import { Text } from './primitives';
import { SwipeToRemove } from './swipe-row';

// onLayout in react-native-web comes from a ResizeObserver, which jsdom lacks: this one reports
// the size a test gives the observed views.
let reportResize: ((entries: { target: Element }[]) => void) | undefined;
const observed = new Set<Element>();
Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: class {
    constructor(callback: (entries: { target: Element }[]) => void) {
      reportResize = callback;
    }
    observe(node: Element) {
      observed.add(node);
    }
    unobserve(node: Element) {
      observed.delete(node);
    }
    disconnect() {}
  },
});
function layoutAll(width: number, height: number) {
  for (const node of observed) {
    Object.defineProperty(node, 'offsetWidth', { configurable: true, value: width });
    Object.defineProperty(node, 'offsetHeight', { configurable: true, value: height });
  }
  act(() => {
    reportResize?.([...observed].map((target) => ({ target })));
    vi.advanceTimersByTime(0);
  });
}

let stamp = 1000;
function mouse(
  target: Element,
  type: 'mousedown' | 'mousemove' | 'mouseup',
  x: number,
  y: number,
  dt: number,
) {
  stamp += dt;
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

/** Presses at the first x, moves through the others; `dt` ms between events sets the speed. */
function press(target: Element, xs: number[], dt = 100, y = 20) {
  const [first, ...rest] = xs;
  mouse(target, 'mousedown', first!, y, dt);
  for (const x of rest) mouse(target, 'mousemove', x, y, dt);
}
function letGo(target: Element, x: number, dt = 100) {
  mouse(target, 'mouseup', x, 20, dt);
}
function swipe(target: Element, xs: number[], dt = 100) {
  press(target, xs, dt);
  letGo(target, xs[xs.length - 1]!, dt);
}

function renderRow(props: { onSwipeRight?: () => void; enabled?: boolean } = {}) {
  const onRemove = vi.fn();
  const onOpen = vi.fn();
  const view = render(
    <SwipeToRemove
      onRemove={onRemove}
      label="Entfernen"
      rightLabel="Erledigt"
      testID="row"
      {...props}
    >
      <Button label="Milch" onPress={onOpen} />
    </SwipeToRemove>,
  );
  return { ...view, onRemove, onOpen, row: screen.getByRole('button', { name: 'Milch' }) };
}

/** The views laid over the row that screen readers skip: the label behind and the cover. */
const hidden = (container: HTMLElement) => container.querySelectorAll('[aria-hidden="true"]');

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('SwipeToRemove (spec 0006, REQ-004; spec 0025, REQ-006)', () => {
  it('disabled: a plain row without the label behind it', () => {
    const { onRemove, row } = renderRow({ enabled: false });
    expect(screen.queryByText('Entfernen')).toBeNull();
    expect(screen.queryByTestId('row')).toBeNull();
    swipe(row, [300, 280, 100, 20]);
    vi.runAllTimers();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('the label behind the row is hidden from screen readers', () => {
    const { container } = renderRow();
    const label = screen.getByText('Entfernen');
    expect(label.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.queryByText('Erledigt')).toBeNull();
    expect(hidden(container)).toHaveLength(1);
  });

  it('removed once swiped past a third of its width to the left', () => {
    const { onRemove, row } = renderRow();
    layoutAll(300, 56);
    // 40 px per 100 ms: slow, so only the distance counts.
    swipe(row, [280, 260, 220, 180, 140, 100]);
    expect(onRemove).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('a quick flick to the left removes it, too', () => {
    const { onRemove, row } = renderRow();
    swipe(row, [280, 265, 240], 20);
    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('let go early: it springs back and nothing happens', () => {
    const { onRemove, row } = renderRow();
    layoutAll(300, 56);
    swipe(row, [280, 265, 240]);
    act(() => {
      vi.runAllTimers();
    });
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('with reduced motion it is removed without the slide', () => {
    reducedMotion.value = true;
    const { onRemove, row } = renderRow();
    swipe(row, [280, 265, 240], 20);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('without a right action a swipe to the right does nothing', () => {
    const { onRemove, row } = renderRow();
    layoutAll(300, 56);
    swipe(row, [20, 40, 200, 280], 20);
    act(() => {
      vi.runAllTimers();
    });
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('spec 0025, REQ-006: a swipe to the right runs the second action', () => {
    const onSwipeRight = vi.fn();
    const { onRemove, row } = renderRow({ onSwipeRight });
    expect(screen.getByText('Erledigt').closest('[aria-hidden="true"]')).toBeTruthy();
    layoutAll(300, 56);
    swipe(row, [20, 40, 120, 160]);
    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('spec 0025, REQ-006: a quick flick to the right runs it as well', () => {
    const onSwipeRight = vi.fn();
    const { row } = renderRow({ onSwipeRight });
    swipe(row, [20, 35, 60], 20);
    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('a vertical move stays a scroll', () => {
    const { onRemove, row, container } = renderRow();
    mouse(row, 'mousedown', 200, 20, 20);
    mouse(row, 'mousemove', 185, 60, 20);
    mouse(row, 'mousemove', 100, 200, 20);
    expect(hidden(container)).toHaveLength(1);
    mouse(row, 'mouseup', 100, 200, 20);
    act(() => {
      vi.runAllTimers();
    });
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('while and just after a swipe a cover lies over the row, so letting go is no tap', () => {
    const { row, container } = renderRow();
    layoutAll(300, 56);
    press(row, [280, 265, 250]);
    expect(hidden(container)).toHaveLength(2);
    letGo(row, 250);
    expect(hidden(container)).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(hidden(container)).toHaveLength(1);
  });

  it('a swipe that is cut off (the touch is cancelled) springs back without removing', () => {
    const { onRemove, row, container } = renderRow();
    layoutAll(300, 56);
    press(row, [280, 260, 220, 180, 140, 100]);
    expect(hidden(container)).toHaveLength(2);
    act(() => {
      row.dispatchEvent(new Event('touchcancel', { bubbles: true }));
    });
    expect(hidden(container)).toHaveLength(1);
    letGo(row, 100);
    act(() => {
      vi.runAllTimers();
    });
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('taps on the row keep working', () => {
    const { onOpen, row } = renderRow();
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('a removal that was refused brings the row back, ready for the next swipe', () => {
    const onRemove = vi.fn();
    render(
      <SwipeToRemove onRemove={onRemove} label="Entfernen">
        <Text>Butter</Text>
      </SwipeToRemove>,
    );
    const row = screen.getByText('Butter');
    swipe(row, [280, 265, 240], 20);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    swipe(row, [280, 265, 240], 20);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onRemove).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Butter')).toBeTruthy();
  });
});
