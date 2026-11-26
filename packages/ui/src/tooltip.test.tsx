import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pointer } from '../test/setup';
import { KindLine } from './display';
import { TOOLTIP_DELAY } from './tooltip';

const LONG = 'Bouldern (Power vs. Balance) · 18:00';

/** jsdom lays nothing out: the title reports the sizes of a cut off or a fitting text. */
function sizeTitle(cut: boolean) {
  const title = screen.getByText(LONG);
  Object.defineProperty(title, 'scrollWidth', { configurable: true, value: cut ? 220 : 100 });
  Object.defineProperty(title, 'clientWidth', { configurable: true, value: 100 });
  return title;
}

function hover(testID: string) {
  fireEvent.pointerEnter(screen.getByTestId(testID), { pointerType: 'mouse' });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Tooltip on a calendar line (spec 0035, REQ-005)', () => {
  it('AC-011: a cut off line shows the whole text after the mouse rests 500 ms', () => {
    pointer.fine = true;
    render(<KindLine kind="activity" title={LONG} tooltip={`Aktivität: ${LONG}`} testID="line" />);
    sizeTitle(true);
    hover('line');
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY - 1));
    expect(screen.queryByTestId('line-tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('line-tooltip').textContent).toBe(`Aktivität: ${LONG}`);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.pointerLeave(screen.getByTestId('line'), { pointerType: 'mouse' });
    expect(screen.queryByTestId('line-tooltip')).toBeNull();
  });

  it('AC-012: a line that fits shows no tooltip', () => {
    pointer.fine = true;
    render(<KindLine kind="activity" title={LONG} tooltip={`Aktivität: ${LONG}`} testID="line" />);
    sizeTitle(false);
    hover('line');
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY * 2));
    expect(screen.queryByTestId('line-tooltip')).toBeNull();
  });

  it('AC-013: with a finger there is no tooltip', () => {
    render(<KindLine kind="activity" title={LONG} tooltip={`Aktivität: ${LONG}`} testID="line" />);
    sizeTitle(true);
    hover('line');
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY * 2));
    expect(screen.queryByTestId('line-tooltip')).toBeNull();
  });

  it('a press hides it, so it never covers what opens', () => {
    pointer.fine = true;
    render(
      <KindLine
        kind="activity"
        title={LONG}
        tooltip={`Aktivität: ${LONG}`}
        onPress={() => {}}
        testID="line"
      />,
    );
    sizeTitle(true);
    hover('line');
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY));
    expect(screen.getByTestId('line-tooltip')).toBeTruthy();
    fireEvent.pointerDown(screen.getByTestId('line'), { pointerType: 'mouse' });
    expect(screen.queryByTestId('line-tooltip')).toBeNull();
  });
});
