import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reducedMotion } from '../test/mocks/reanimated';
import { IconButton } from './controls';
import { ReorderList, type ReorderListItem, type ReorderListLabels } from './reorder-list';

const labels: ReorderListLabels = {
  handle: (name) => `${name} verschieben`,
  up: (name) => `${name} nach oben`,
  down: (name) => `${name} nach unten`,
  position: (name, index, total) => `${name}, Position ${index + 1} von ${total}`,
  open: (name) => `${name} bearbeiten`,
};

const AREAS: ReorderListItem[] = [
  { key: 'obst', name: 'Obst', subtitle: '12 Artikel' },
  { key: 'brot', name: 'Brot' },
  { key: 'kuehl', name: 'Kühlregal', muted: true },
];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const announced = () => {
  wait(60);
  return document.querySelector('[data-testid="announcer"]')?.textContent;
};

/**
 * A prop that react-native-web takes but does not put on the DOM (onLayout without a
 * ResizeObserver, accessibility actions): read from the component that got it.
 */
function propOf<T>(element: Element, name: string): T {
  const key = Object.keys(element).find((candidate) => candidate.startsWith('__reactFiber$'));
  type Fiber = { memoizedProps?: Record<string, unknown>; return: Fiber | null };
  let fiber = key ? ((element as unknown as Record<string, Fiber>)[key] ?? null) : null;
  while (fiber && !(fiber.memoizedProps && name in fiber.memoizedProps)) fiber = fiber.return;
  if (!fiber?.memoizedProps) throw new Error(`No ${name} above the element`);
  return fiber.memoizedProps[name] as T;
}

type AccessibilityAction = (event: { nativeEvent: { actionName: string } }) => void;
type Layout = (event: { nativeEvent: { layout: { y: number; height: number } } }) => void;

const row = (key: string) => screen.getByTestId(`areas-row-${key}`);
const handle = (key: string) => screen.getByTestId(`areas-handle-${key}`);

/** Lays the rows out 50 px high, one below the other, as onLayout would report them. */
function layOut(keys: string[]) {
  keys.forEach((key, index) => {
    act(() =>
      propOf<Layout>(
        row(key),
        'onLayout',
      )({ nativeEvent: { layout: { y: index * 50, height: 50 } } }),
    );
  });
}

/** A mouse drag of the handle by `dy`, through react-native-web's responder system. */
function dragHandle(key: string, dy: number, end: 'mouseUp' | 'cancel' = 'mouseUp') {
  const node = handle(key);
  fireEvent.mouseDown(node, {
    button: 0,
    buttons: 1,
    clientX: 20,
    clientY: 100,
    pageX: 20,
    pageY: 100,
  });
  wait(16);
  fireEvent.mouseMove(node, {
    buttons: 1,
    clientX: 20,
    clientY: 100 + dy,
    pageX: 20,
    pageY: 100 + dy,
  });
  wait(16);
  if (end === 'mouseUp') {
    fireEvent.mouseUp(node, { clientX: 20, clientY: 100 + dy, pageX: 20, pageY: 100 + dy });
  } else {
    // Focus leaving an ancestor ends the responder in react-native-web, like a system takeover.
    fireEvent.blur(screen.getByTestId('areas-list'));
  }
}

describe('ReorderList (spec 0007, REQ-009, REQ-010)', () => {
  it('shows every row with its position, its handle and its arrows', () => {
    render(<ReorderList items={AREAS} onMove={vi.fn()} labels={labels} testID="areas" />);
    expect(screen.getByTestId('areas-list')).toBeTruthy();
    expect(screen.getByTestId('areas-pos-obst').textContent).toBe('1');
    expect(screen.getByTestId('areas-pos-kuehl').textContent).toBe('3');
    expect(screen.getByRole('button', { name: 'Brot verschieben' })).toBeTruthy();
    expect(screen.getByText('12 Artikel')).toBeTruthy();
    expect(screen.getByText('Kühlregal')).toBeTruthy();
    // The first cannot go up, the last cannot go down.
    const up = screen.getByRole('button', { name: 'Obst nach oben' });
    const down = screen.getByRole('button', { name: 'Kühlregal nach unten' });
    expect(up.getAttribute('aria-disabled')).toBe('true');
    expect(down.getAttribute('aria-disabled')).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Brot nach oben' }).getAttribute('aria-disabled'),
    ).toBeNull();
  });

  it('REQ-010: the arrows move a row one place and the move is announced', () => {
    const onMove = vi.fn();
    render(<ReorderList items={AREAS} onMove={onMove} labels={labels} testID="areas" />);
    fireEvent.click(screen.getByRole('button', { name: 'Obst nach unten' }));
    expect(onMove).toHaveBeenLastCalledWith('obst', 1);
    expect(announced()).toBe('Obst, Position 2 von 3');
    fireEvent.click(screen.getByRole('button', { name: 'Kühlregal nach oben' }));
    expect(onMove).toHaveBeenLastCalledWith('kuehl', 1);
    expect(announced()).toBe('Kühlregal, Position 2 von 3');
    fireEvent.click(screen.getByRole('button', { name: 'Obst nach oben' }));
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it('REQ-010: on the web the arrow keys on the focused handle move the row', () => {
    const onMove = vi.fn();
    render(<ReorderList items={AREAS} onMove={onMove} labels={labels} testID="areas" />);
    expect(fireEvent.keyDown(handle('brot'), { key: 'ArrowDown' })).toBe(false);
    expect(onMove).toHaveBeenLastCalledWith('brot', 2);
    expect(fireEvent.keyDown(handle('brot'), { key: 'ArrowUp' })).toBe(false);
    expect(onMove).toHaveBeenLastCalledWith('brot', 0);
    expect(announced()).toBe('Brot, Position 1 von 3');
    // Past the ends and other keys: nothing moves and the key is not taken.
    expect(fireEvent.keyDown(handle('obst'), { key: 'ArrowUp' })).toBe(true);
    expect(fireEvent.keyDown(handle('kuehl'), { key: 'ArrowDown' })).toBe(true);
    expect(fireEvent.keyDown(handle('obst'), { key: 'Enter' })).toBe(true);
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it('after a keyboard move the handle keeps the focus in its new place', () => {
    const { rerender } = render(
      <ReorderList items={AREAS} onMove={vi.fn()} labels={labels} testID="areas" />,
    );
    fireEvent.keyDown(handle('obst'), { key: 'ArrowDown' });
    const [obst, brot, kuehl] = AREAS as [ReorderListItem, ReorderListItem, ReorderListItem];
    rerender(
      <ReorderList items={[brot, obst, kuehl]} onMove={vi.fn()} labels={labels} testID="areas" />,
    );
    expect(document.activeElement).toBe(handle('obst'));
    expect(screen.getByTestId('areas-pos-obst').textContent).toBe('2');
  });

  it('REQ-010: screen readers get "nach oben" and "nach unten" as row actions', () => {
    const onMove = vi.fn();
    render(<ReorderList items={AREAS} onMove={onMove} labels={labels} testID="areas" />);
    expect(propOf(row('brot'), 'accessibilityActions')).toEqual([
      { name: 'moveUp', label: 'Brot nach oben' },
      { name: 'moveDown', label: 'Brot nach unten' },
    ]);
    const act = (key: string, actionName: string) =>
      propOf<AccessibilityAction>(
        row(key),
        'onAccessibilityAction',
      )({ nativeEvent: { actionName } });
    act('brot', 'moveUp');
    expect(onMove).toHaveBeenLastCalledWith('brot', 0);
    act('brot', 'moveDown');
    expect(onMove).toHaveBeenLastCalledWith('brot', 2);
    act('obst', 'moveUp');
    act('kuehl', 'moveDown');
    act('brot', 'activate');
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it('offline: arrows, keys, row actions and the drag do nothing; the controls say so', () => {
    const onMove = vi.fn();
    const onPress = vi.fn();
    render(
      <ReorderList
        items={AREAS}
        onMove={onMove}
        onPress={onPress}
        labels={labels}
        disabled
        disabledHint="Offline"
        testID="areas"
      />,
    );
    const down = screen.getByRole('button', { name: 'Brot nach unten' });
    expect(down.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(down);
    fireEvent.keyDown(handle('brot'), { key: 'ArrowDown' });
    propOf<AccessibilityAction>(
      row('brot'),
      'onAccessibilityAction',
    )({
      nativeEvent: { actionName: 'moveDown' },
    });
    layOut(['obst', 'brot', 'kuehl']);
    dragHandle('obst', 80);
    wait(300);
    const open = screen.getByRole('button', { name: 'Brot bearbeiten' });
    expect(open.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(open);
    expect(onMove).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('with onPress, name and subtitle open the row; handle, arrows and trailing stay apart', () => {
    const onPress = vi.fn();
    const onMore = vi.fn();
    render(
      <ReorderList
        items={AREAS}
        onMove={vi.fn()}
        onPress={onPress}
        labels={labels}
        trailing={(item) => (
          <IconButton icon="ellipsis" label={`${item.name} mehr`} onPress={onMore} />
        )}
        testID="areas"
      />,
    );
    const open = screen.getByRole('button', { name: 'Obst bearbeiten' });
    expect(open.textContent).toContain('12 Artikel');
    for (const button of screen.getAllByRole('button')) {
      expect(button.parentElement?.closest('[role="button"]')).toBeNull();
    }
    fireEvent.click(open);
    expect(onPress).toHaveBeenCalledWith('obst');
    fireEvent.click(screen.getByRole('button', { name: 'Brot mehr' }));
    expect(onMore).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('without an open label the row is named by its name', () => {
    const onPress = vi.fn();
    const { open: _open, ...plain } = labels;
    render(<ReorderList items={AREAS} onMove={vi.fn()} onPress={onPress} labels={plain} />);
    fireEvent.click(screen.getByRole('button', { name: 'Brot' }));
    expect(onPress).toHaveBeenCalledWith('brot');
  });

  it('REQ-009: dragging the handle moves the row where it is let go, after it glided there', () => {
    const onMove = vi.fn();
    render(<ReorderList items={AREAS} onMove={onMove} labels={labels} testID="areas" />);
    layOut(['obst', 'brot', 'kuehl']);
    dragHandle('obst', 60);
    wait(100);
    expect(onMove).not.toHaveBeenCalled();
    wait(60);
    expect(onMove).toHaveBeenCalledWith('obst', 1);
    expect(announced()).toBe('Obst, Position 2 von 3');
  });

  it('REQ-009: dragged up past every row it lands first', () => {
    const onMove = vi.fn();
    render(<ReorderList items={AREAS} onMove={onMove} labels={labels} testID="areas" />);
    layOut(['obst', 'brot', 'kuehl']);
    dragHandle('kuehl', -200);
    wait(150);
    expect(onMove).toHaveBeenCalledWith('kuehl', 0);
  });

  it('let go at its own place, the row settles back without a move', () => {
    const onMove = vi.fn();
    render(<ReorderList items={AREAS} onMove={onMove} labels={labels} testID="areas" />);
    layOut(['obst', 'brot', 'kuehl']);
    dragHandle('brot', 10);
    wait(300);
    expect(onMove).not.toHaveBeenCalled();
    expect(row('brot').style.transform).toBe('translateY(0px)');
  });

  it('taken over mid-drag (e.g. by the system), the row lands where it was last shown', () => {
    const onMove = vi.fn();
    render(<ReorderList items={AREAS} onMove={onMove} labels={labels} testID="areas" />);
    layOut(['obst', 'brot', 'kuehl']);
    dragHandle('obst', 60, 'cancel');
    wait(150);
    expect(onMove).toHaveBeenCalledWith('obst', 1);
  });

  it('reduced motion: the drop commits at once', () => {
    reducedMotion.value = true;
    const onMove = vi.fn();
    render(<ReorderList items={AREAS} onMove={onMove} labels={labels} testID="areas" />);
    layOut(['obst', 'brot', 'kuehl']);
    dragHandle('obst', 60);
    wait(0);
    expect(onMove).toHaveBeenCalledWith('obst', 1);
  });

  it('a refused move (the order stays) sends the dragged row back to its place', () => {
    const onMove = vi.fn();
    const list = () => <ReorderList items={AREAS} onMove={onMove} labels={labels} testID="areas" />;
    const { rerender } = render(list());
    layOut(['obst', 'brot', 'kuehl']);
    dragHandle('obst', 60);
    wait(150);
    expect(onMove).toHaveBeenCalledWith('obst', 1);
    // The stand-in computes animated styles on render: render again to see the offset.
    rerender(list());
    expect(row('obst').style.transform).toBe('translateY(50px)');
    wait(120);
    rerender(list());
    expect(row('obst').style.transform).toBe('translateY(0px)');
  });

  it('a move that throws still sends the row back', () => {
    const onMove = vi.fn(() => {
      throw new Error('offline');
    });
    const list = () => <ReorderList items={AREAS} onMove={onMove} labels={labels} testID="areas" />;
    const { rerender } = render(list());
    layOut(['obst', 'brot', 'kuehl']);
    dragHandle('obst', 60);
    expect(() => wait(150)).toThrow('offline');
    rerender(list());
    expect(row('obst').style.transform).toBe('translateY(50px)');
    wait(120);
    rerender(list());
    expect(row('obst').style.transform).toBe('translateY(0px)');
  });
});
