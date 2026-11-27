import { describe, expect, it } from 'vitest';

import { keyboardRevealScrollTop } from './keyboard-reveal';

// The page's scroll area from 100 px (below the header) to the bottom of the window; the keyboard
// leaves 0–464 px visible.
const base = {
  area: { top: 100, bottom: 844 },
  visible: { top: 0, bottom: 464 },
  scrollTop: 500,
  maxScrollTop: 2000,
};
const field = (top: number, height = 44) => ({ top, bottom: top + height });

describe('keyboardRevealScrollTop (spec 0044, REQ-004)', () => {
  it('AC-011: a field under the keyboard comes into the upper third of the visible part', () => {
    // 100 + 16 + (332 − 44) / 3 = 212: the field moves up by 488 px.
    expect(keyboardRevealScrollTop({ ...base, field: field(700) })).toBe(500 + 700 - 212);
  });

  it('AC-012: a field fully visible with its margin stays where it is', () => {
    expect(keyboardRevealScrollTop({ ...base, field: field(300) })).toBeNull();
    expect(keyboardRevealScrollTop({ ...base, field: field(116) })).toBeNull();
  });

  it('AC-013: a field half under the keyboard bar comes into the upper third too', () => {
    expect(keyboardRevealScrollTop({ ...base, field: field(430) })).toBe(500 + 430 - 212);
  });

  it('AC-013: a field hidden under the header comes down into the upper third', () => {
    expect(keyboardRevealScrollTop({ ...base, field: field(60) })).toBe(500 + 60 - 212);
  });

  it('AC-014: a field taller than the visible part starts 16 px below its top', () => {
    expect(keyboardRevealScrollTop({ ...base, field: field(600, 400) })).toBe(500 + 600 - 116);
  });

  it('AC-015: never past the end of the area, never above 0', () => {
    expect(keyboardRevealScrollTop({ ...base, maxScrollTop: 600, field: field(700) })).toBe(600);
    expect(keyboardRevealScrollTop({ ...base, scrollTop: 40, field: field(60) })).toBe(0);
  });

  it('AC-015: an area that cannot move any further is left alone', () => {
    expect(
      keyboardRevealScrollTop({ ...base, scrollTop: 600, maxScrollTop: 600, field: field(700) }),
    ).toBeNull();
  });

  it('AC-018: a window on the keyboard: its own area bounds the visible part', () => {
    // Window content from 300 to 450 px, keyboard from 464 px: the field below goes to the top
    // third of 316–434.
    const sheet = { ...base, area: { top: 300, bottom: 450 }, scrollTop: 0, maxScrollTop: 300 };
    expect(keyboardRevealScrollTop({ ...sheet, field: field(470) })).toBe(
      Math.round(470 - (316 + 74 / 3)),
    );
  });

  it('no visible part at all (area behind the keyboard): nothing to do', () => {
    expect(
      keyboardRevealScrollTop({ ...base, area: { top: 500, bottom: 844 }, field: field(700) }),
    ).toBeNull();
  });

  describe('the next field peeks in, so iOS lets ˅ reach it (iPhone click-through)', () => {
    // Visible part 116–448 (with margins). iOS offers ˅ only to a next field that is in view.
    it('a visible field whose next field is hidden moves up until the next one shows 44 px', () => {
      // Field at 300, next at 500: the next one's first 44 px end at 544, 96 px too low.
      expect(keyboardRevealScrollTop({ ...base, field: field(300), next: field(500) })).toBe(
        500 + 96,
      );
    });

    it('a field coming into the upper third goes higher when the next one would stay hidden', () => {
      // Upper third alone puts the field at 212 and the next (200 px below) at 412, 8 px short.
      expect(keyboardRevealScrollTop({ ...base, field: field(700), next: field(900) })).toBe(
        500 + 900 + 44 - 448,
      );
    });

    it('a next field too far below to show along with the field is left out', () => {
      expect(keyboardRevealScrollTop({ ...base, field: field(300), next: field(900) })).toBeNull();
      expect(keyboardRevealScrollTop({ ...base, field: field(700), next: field(1100) })).toBe(
        500 + 700 - 212,
      );
    });

    it('a next field already in view changes nothing', () => {
      expect(keyboardRevealScrollTop({ ...base, field: field(200), next: field(300) })).toBeNull();
      // Upper third as before.
      expect(keyboardRevealScrollTop({ ...base, field: field(700), next: field(760) })).toBe(
        500 + 700 - 212,
      );
    });
  });
});
