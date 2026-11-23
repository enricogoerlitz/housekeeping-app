import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FOCUS_RING_ROOM } from './controls';
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
