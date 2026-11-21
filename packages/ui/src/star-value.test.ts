import { describe, expect, it } from 'vitest';

import {
  IDLE_STAR_POINTER,
  starFill,
  starPointer,
  starsLabel,
  starValueAt,
  stepStars,
  type StarPointer,
  type StarPointerEvent,
} from './star-value';

// Five stars of 21 pt with 1 pt between them, as the Stars control draws them.
const layout = { size: 21, gap: 1 };
const pitch = layout.size + layout.gap;
/** x of a point in the left or right half of star n (1 … 5). */
const at = (star: number, half: 'left' | 'right') =>
  (star - 1) * pitch + (half === 'left' ? 3 : layout.size - 3);

function run(events: StarPointerEvent[], start: StarPointer = IDLE_STAR_POINTER) {
  let state = start;
  const commits: number[] = [];
  for (const event of events) {
    const next = starPointer(state, event);
    state = next.state;
    if (next.commit !== undefined) commits.push(next.commit);
  }
  return { state, commits };
}

describe('starValueAt (spec 0011, REQ-004)', () => {
  it('AC-017: the left half of the fifth star is 4.5', () => {
    expect(starValueAt(at(5, 'left'), layout)).toBe(4.5);
  });

  it('AC-020: the right half of the fourth star is 4', () => {
    expect(starValueAt(at(4, 'right'), layout)).toBe(4);
  });

  it('AC-018: the left half of the fourth star is 3.5', () => {
    expect(starValueAt(at(4, 'left'), layout)).toBe(3.5);
  });

  it('the exact middle of a star counts as the full star, the gap as the star before it', () => {
    expect(starValueAt(2 * pitch + layout.size / 2, layout)).toBe(3);
    expect(starValueAt(pitch - 0.5, layout)).toBe(1);
  });

  it('a finger dragged past either end stays within 0.5 … 5', () => {
    expect(starValueAt(-40, layout)).toBe(0.5);
    expect(starValueAt(0, layout)).toBe(0.5);
    expect(starValueAt(5 * pitch + 60, layout)).toBe(5);
    expect(starValueAt(Number.NaN, layout)).toBe(0.5);
  });
});

describe('starFill', () => {
  it('draws 4.5 as four full stars and a half one', () => {
    expect([1, 2, 3, 4, 5].map((star) => starFill(star, 4.5))).toEqual([
      'full',
      'full',
      'full',
      'full',
      'half',
    ]);
  });

  it('AC-025: whole values stay whole, 0 is empty', () => {
    expect([1, 2, 3, 4, 5].map((star) => starFill(star, 4))).toEqual([
      'full',
      'full',
      'full',
      'full',
      'empty',
    ]);
    expect([1, 2, 3, 4, 5].map((star) => starFill(star, 0))).toEqual([
      'empty',
      'empty',
      'empty',
      'empty',
      'empty',
    ]);
    expect(starFill(1, 0.5)).toBe('half');
  });
});

describe('starPointer: mouse and finger', () => {
  it('AC-018: hovering previews the stars, leaving without a click shows the saved value again', () => {
    const hovered = run([{ type: 'hover', value: 3.5 }]);
    expect(hovered.state.preview).toBe(3.5);
    expect(hovered.commits).toEqual([]);

    const left = run([{ type: 'leave' }], hovered.state);
    expect(left.state.preview).toBeUndefined();
    expect(left.commits).toEqual([]);
  });

  it('AC-017: a tap sets the value under the finger', () => {
    const { state, commits } = run([{ type: 'down', value: 4.5 }, { type: 'up' }]);
    expect(commits).toEqual([4.5]);
    expect(state.preview).toBeUndefined();
  });

  it('dragging fills along and letting go sets the last value', () => {
    const { commits } = run([
      { type: 'down', value: 1 },
      { type: 'move', value: 2.5 },
      { type: 'move', value: 4 },
      { type: 'up' },
    ]);
    expect(commits).toEqual([4]);
  });

  it('a drag shows its value even when the pointer leaves the stars, until it is let go', () => {
    const { state } = run([
      { type: 'down', value: 2 },
      { type: 'leave' },
      { type: 'hover', value: 5 },
      { type: 'move', value: 3 },
    ]);
    expect(state.preview).toBe(3);
  });

  it('a cancelled drag (e.g. the list scrolls) sets nothing', () => {
    const { state, commits } = run([
      { type: 'down', value: 2 },
      { type: 'move', value: 3 },
      { type: 'cancel' },
      { type: 'up' },
    ]);
    expect(commits).toEqual([]);
    expect(state.preview).toBeUndefined();
  });

  it('a move without a press only previews, like a mouse over the stars', () => {
    const { state, commits } = run([{ type: 'move', value: 2 }]);
    expect(state.preview).toBeUndefined();
    expect(commits).toEqual([]);
  });
});

describe('stepStars: keyboard and screen reader', () => {
  it('steps by 0.5 within 0.5 … 5', () => {
    expect(stepStars(4, 'increment')).toBe(4.5);
    expect(stepStars(4.5, 'increment')).toBe(5);
    expect(stepStars(5, 'increment')).toBe(5);
    expect(stepStars(4.5, 'decrement')).toBe(4);
    expect(stepStars(0.5, 'decrement')).toBe(0.5);
  });

  it('starts an unrated value at 0.5 and leaves it unrated on decrement', () => {
    expect(stepStars(0, 'increment')).toBe(0.5);
    expect(stepStars(0, 'decrement')).toBe(0);
  });

  it('jumps to either end', () => {
    expect(stepStars(3, 'first')).toBe(0.5);
    expect(stepStars(3, 'last')).toBe(5);
  });

  it('snaps a value between half steps before stepping', () => {
    expect(stepStars(4.3, 'increment')).toBe(4.5);
    expect(stepStars(4.3, 'decrement')).toBe(4);
  });
});

describe('starsLabel', () => {
  it('REQ-004: reads "4,5 von 5 Sternen" with a decimal comma', () => {
    expect(starsLabel(4.5)).toBe('4,5 von 5 Sternen');
    expect(starsLabel(0.5)).toBe('0,5 von 5 Sternen');
  });

  it('AC-025: whole values read as before', () => {
    expect(starsLabel(4)).toBe('4 von 5 Sternen');
    expect(starsLabel(0)).toBe('0 von 5 Sternen');
  });
});
