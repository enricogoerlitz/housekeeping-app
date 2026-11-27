import { describe, expect, it } from 'vitest';

import { naturalTitleWidth, titleOnOwnLine, wordOverflows } from './title-fit';

describe('titleOnOwnLine (review 0003: "Einplan…" and "Q…" beside long actions on phones)', () => {
  it('a title that fits between the actions stays in their row', () => {
    // 390 wide, 12 padding each side, gaps of 8: "Abbrechen" 80, "Speichern" 80 → 198 for the title.
    expect(titleOnOwnLine({ row: 390, padding: 24, gap: 8, actions: [80, 80], title: 120 })).toBe(
      false,
    );
  });

  it('a title that would be cut moves to its own line', () => {
    expect(titleOnOwnLine({ row: 390, padding: 24, gap: 8, actions: [80, 230], title: 90 })).toBe(
      true,
    );
  });

  it('nothing is decided before the row and the title are measured', () => {
    expect(titleOnOwnLine({ row: 0, padding: 24, gap: 8, actions: [80, 80], title: 500 })).toBe(
      false,
    );
    expect(titleOnOwnLine({ row: 390, padding: 24, gap: 8, actions: [80, 80], title: 0 })).toBe(
      false,
    );
  });
});

describe('naturalTitleWidth (iPhone click-through, I-19)', () => {
  it("measures the text itself, not its box: on its own line the box is the row's width", () => {
    // The title "Lasagne" on its own line: the box (and scrollWidth) is 360 wide, the text 76.
    const node = { scrollWidth: 360, textWidth: () => 76 };
    expect(naturalTitleWidth(node)).toBe(76);
  });

  it('without a text measure (native) it falls back to scrollWidth', () => {
    expect(naturalTitleWidth({ scrollWidth: 120 })).toBe(120);
    expect(naturalTitleWidth(null)).toBe(0);
  });
});

describe('wordOverflows (spec 0057, REQ-004)', () => {
  it('AC-023: a word wider than the box overflows it', () => {
    expect(wordOverflows({ scrollWidth: 96, clientWidth: 80 })).toBe(true);
  });

  it('AC-021: words that fit, a rounding pixel and an unmeasured node do not', () => {
    expect(wordOverflows({ scrollWidth: 140, clientWidth: 140 })).toBe(false);
    expect(wordOverflows({ scrollWidth: 141, clientWidth: 140 })).toBe(false);
    expect(wordOverflows({ scrollWidth: 0, clientWidth: 0 })).toBe(false);
    expect(wordOverflows(null)).toBe(false);
  });
});
