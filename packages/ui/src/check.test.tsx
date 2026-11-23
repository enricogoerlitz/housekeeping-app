import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { View } from 'react-native';

import { reducedMotion } from '../test/mocks/reanimated';
import { CHECK_WINDOW_MS } from './check-window';
import { RowTransition, useCheckWindow, type UseCheckWindowOptions } from './check';
import { Button, Checkbox } from './controls';

interface Item {
  id: string;
  title: string;
  checked: boolean;
}

// The stand-in drops the animation props; here they show up as data attributes instead.
vi.mock('react-native-reanimated', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../test/mocks/reanimated')>();
  const { createElement } = await import('react');
  function AnimatedView(props: Record<string, unknown>) {
    const dataSet = {
      exiting: props.exiting ? 'fade' : 'none',
      layout: props.layout ? 'move' : 'none',
    };
    return createElement(actual.default.View, { ...props, dataSet });
  }
  return { ...actual, default: { ...actual.default, View: AnimatedView } };
});

const ITEMS: Item[] = [
  { id: 'milk', title: 'Milch', checked: false },
  { id: 'eggs', title: 'Eier', checked: false },
  { id: 'salt', title: 'Salz', checked: true },
];

/**
 * A list screen: open rows, the checked group, and the check window between them. With `save` a
 * tap saves at once, as the shopping list does; else the data waits for the window (chores).
 */
function Screen(
  props: Pick<UseCheckWindowOptions<Item>, 'onToggle' | 'onSettle' | 'keepInDone'> & {
    save?: boolean;
  },
) {
  const [items, setItems] = useState(ITEMS);
  const check = useCheckWindow({
    items,
    getId: (item) => item.id,
    isChecked: (item) => item.checked,
    onToggle: (item, checked) => {
      props.onToggle?.(item, checked);
      if (props.save) {
        setItems((all) => all.map((row) => (row.id === item.id ? { ...row, checked } : row)));
      }
    },
    onSettle: props.onSettle,
    announce: (item, checked) => `${item.title} ${checked ? 'abgehakt' : 'wieder offen'}`,
    keepInDone: props.keepInDone,
  });
  const row = (item: Item) => (
    <RowTransition key={item.id}>
      <Checkbox
        label={item.title}
        checked={check.isChecked(item)}
        onChange={() => check.toggle(item)}
      />
    </RowTransition>
  );
  return (
    <>
      <View testID="open">{check.rows.map(row)}</View>
      <View testID="done">{check.doneRows.map(row)}</View>
      <Button label="Bewerten" onPress={() => check.set(ITEMS[0] as Item, true)} />
      <Button label="Bildschirm verlassen" onPress={check.settle} />
    </>
  );
}

const names = (testID: string) =>
  within(screen.getByTestId(testID))
    .queryAllByRole('checkbox')
    .map((box) => box.getAttribute('aria-label'));
const box = (name: string) => screen.getByRole('checkbox', { name });
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useCheckWindow (spec 0005, REQ-005, D3)', () => {
  it('a tap checks at once and the row stays; it leaves 2 s after the last tap', () => {
    const onToggle = vi.fn();
    render(<Screen onToggle={onToggle} save />);
    expect(names('open')).toEqual(['Milch', 'Eier']);
    expect(names('done')).toEqual(['Salz']);

    fireEvent.click(box('Milch'));
    expect(onToggle).toHaveBeenCalledWith(ITEMS[0], true);
    expect(box('Milch').getAttribute('aria-checked')).toBe('true');
    expect(names('open')).toEqual(['Milch', 'Eier']);

    wait(CHECK_WINDOW_MS - 500);
    fireEvent.click(box('Eier'));
    // The second tap restarts the window: Milch waits for Eier.
    wait(CHECK_WINDOW_MS - 1);
    expect(names('open')).toEqual(['Milch', 'Eier']);
    wait(1);
    expect(names('open')).toEqual([]);
    expect(names('done')).toEqual(['Milch', 'Eier', 'Salz']);
  });

  it('a second tap in the window takes the check back; nothing leaves', () => {
    const onToggle = vi.fn();
    const onSettle = vi.fn();
    render(<Screen onToggle={onToggle} onSettle={onSettle} />);
    fireEvent.click(box('Milch'));
    fireEvent.click(box('Milch'));
    expect(onToggle.mock.calls).toEqual([
      [ITEMS[0], true],
      [ITEMS[0], false],
    ]);
    expect(box('Milch').getAttribute('aria-checked')).toBe('false');
    wait(CHECK_WINDOW_MS);
    expect(onSettle).toHaveBeenCalledWith([]);
    expect(names('open')).toEqual(['Milch', 'Eier']);
  });

  it('screen readers hear each tap', () => {
    render(<Screen save />);
    fireEvent.click(box('Milch'));
    wait(50);
    expect(screen.getByTestId('announcer').textContent).toBe('Milch abgehakt');
    fireEvent.click(box('Milch'));
    wait(50);
    expect(screen.getByTestId('announcer').textContent).toBe('Milch wieder offen');
  });

  it('spec 0011: onSettle gets the rows checked in the window when it closes', () => {
    const onSettle = vi.fn();
    render(<Screen onSettle={onSettle} />);
    fireEvent.click(box('Eier'));
    fireEvent.click(box('Milch'));
    expect(onSettle).not.toHaveBeenCalled();
    wait(CHECK_WINDOW_MS);
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith(['eggs', 'milk']);
  });

  it('spec 0011, AC-019: set marks a row without flipping it and restarts the window', () => {
    const onToggle = vi.fn();
    const onSettle = vi.fn();
    render(<Screen onToggle={onToggle} onSettle={onSettle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bewerten' }));
    wait(CHECK_WINDOW_MS - 1);
    fireEvent.click(screen.getByRole('button', { name: 'Bewerten' }));
    expect(onToggle.mock.calls).toEqual([
      [ITEMS[0], true],
      [ITEMS[0], true],
    ]);
    expect(box('Milch').getAttribute('aria-checked')).toBe('true');
    wait(CHECK_WINDOW_MS - 1);
    expect(onSettle).not.toHaveBeenCalled();
    wait(1);
    expect(onSettle).toHaveBeenCalledWith(['milk']);
  });

  it('spec 0011, AC-030: settle closes a running window now', () => {
    const onSettle = vi.fn();
    render(<Screen onSettle={onSettle} save />);
    fireEvent.click(box('Milch'));
    fireEvent.click(screen.getByRole('button', { name: 'Bildschirm verlassen' }));
    expect(onSettle).toHaveBeenCalledWith(['milk']);
    expect(names('open')).toEqual(['Eier']);
  });

  it('AC-029: leaving the screen tidies up at once', () => {
    const onSettle = vi.fn();
    const { unmount } = render(<Screen onSettle={onSettle} />);
    fireEvent.click(box('Milch'));
    unmount();
    expect(onSettle).toHaveBeenCalledWith(['milk']);
  });

  it('spec 0012, AC-021: taken back in the checked group, a row waits there for the window', () => {
    render(<Screen save keepInDone />);
    fireEvent.click(box('Salz'));
    expect(box('Salz').getAttribute('aria-checked')).toBe('false');
    expect(names('done')).toEqual(['Salz']);
    wait(CHECK_WINDOW_MS);
    expect(names('open')).toEqual(['Milch', 'Eier', 'Salz']);
    expect(names('done')).toEqual([]);
  });

  it('without keepInDone a row taken back moves to the open list at once', () => {
    render(<Screen save />);
    fireEvent.click(box('Salz'));
    expect(names('open')).toEqual(['Milch', 'Eier', 'Salz']);
  });
});

describe('RowTransition', () => {
  const motion = () => {
    const row = screen.getByRole('checkbox', { name: 'Milch' }).parentElement as HTMLElement;
    return { exiting: row.dataset.exiting, layout: row.dataset.layout };
  };

  it('a leaving row fades out and the rows below move up', () => {
    render(<Screen />);
    expect(motion()).toEqual({ exiting: 'fade', layout: 'move' });
  });

  it('AC-030: with reduced motion it only fades', () => {
    reducedMotion.value = true;
    render(<Screen />);
    expect(motion()).toEqual({ exiting: 'fade', layout: 'none' });
  });
});
