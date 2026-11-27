import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Chip, FOCUS_RING_ROOM } from './controls';
import { Text } from './primitives';
import { ScrollRow } from './scroll-row';

describe('ScrollRow (spec 0019, AC-005)', () => {
  it('shows its items in order', () => {
    render(
      <ScrollRow testID="chips" gap={4}>
        <Text>Alle</Text>
        <Text>Vegan</Text>
        <Text>Schnell</Text>
      </ScrollRow>,
    );
    const row = screen.getByTestId('chips');
    expect(row.textContent).toBe('AlleVeganSchnell');
  });

  it('AC-005: leaves room for the focus ring around the items without moving the row', () => {
    render(
      <ScrollRow testID="chips" contentStyle={{ paddingHorizontal: 16 }}>
        <Text>Alle</Text>
      </ScrollRow>,
    );
    const row = screen.getByTestId('chips');
    const content = row.firstElementChild as HTMLElement;
    expect(row.style.margin).toBe(`-${FOCUS_RING_ROOM}px`);
    expect(content.style.paddingTop).toBe(`${FOCUS_RING_ROOM}px`);
    expect(content.style.paddingLeft).toBe('16px');
  });
});

describe('ScrollRow: a chosen chip stands whole (iPhone click-through, review 0004, iN-08)', () => {
  function Row(props: { selected: boolean }) {
    return (
      <ScrollRow testID="chips">
        <Chip label="Lange nicht gekocht" onPress={() => undefined} testID="long" />
        <Chip
          label="Unfertig (4)"
          selected={props.selected}
          onPress={() => undefined}
          testID="unfinished"
        />
      </ScrollRow>
    );
  }

  function box(node: Element, left: number, width: number) {
    node.getBoundingClientRect = () => ({ left, right: left + width, width }) as DOMRect;
  }

  it('the last chip, half under the fade, scrolls in whole once it is chosen', () => {
    const { rerender } = render(<Row selected={false} />);
    const row = screen.getByTestId('chips');
    const scrollTo = vi.fn();
    Object.assign(row, { scrollTo });
    Object.defineProperty(row, 'scrollWidth', { configurable: true, value: 500 });
    Object.defineProperty(row, 'clientWidth', { configurable: true, value: 300 });
    box(row, 0, 300);
    box(screen.getByTestId('unfinished'), 380, 100);
    expect(scrollTo).not.toHaveBeenCalled();
    rerender(<Row selected />);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 200 }));
  });
});
