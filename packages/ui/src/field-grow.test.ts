import { describe, expect, it } from 'vitest';

import { GROW_PADDING, growHeight } from './field-grow';

// A composer field (review 0004, „Mit KI ändern“): one line high, grows with its text to four
// lines, then scrolls; empty it is one line again.
describe('growHeight (spec 0062, decision 14)', () => {
  const lineHeight = 22;
  const oneLine = GROW_PADDING * 2 + lineHeight;

  it('AC-033: an empty or one-line field is one line high', () => {
    expect(growHeight({ contentHeight: 0, lineHeight, empty: true })).toBe(oneLine);
    expect(growHeight({ contentHeight: 30, lineHeight, empty: false })).toBe(oneLine);
  });

  it('AC-033: two lines of text make it two lines high', () => {
    expect(growHeight({ contentHeight: oneLine + lineHeight, lineHeight, empty: false })).toBe(
      oneLine + lineHeight,
    );
  });

  it('AC-033: it stops at four lines', () => {
    expect(growHeight({ contentHeight: 400, lineHeight, empty: false })).toBe(
      GROW_PADDING * 2 + lineHeight * 4,
    );
  });

  it('spec 0067, AC-009: the agent field stops at 4.5 lines, the half line shows there is more', () => {
    expect(growHeight({ contentHeight: 400, lineHeight, empty: false, maxLines: 4.5 })).toBe(
      GROW_PADDING * 2 + lineHeight * 4.5,
    );
    expect(growHeight({ contentHeight: oneLine, lineHeight, empty: false, maxLines: 4.5 })).toBe(
      oneLine,
    );
  });

  it('AC-033: cleared after sending it is one line again, whatever was measured', () => {
    expect(growHeight({ contentHeight: 90, lineHeight, empty: true })).toBe(oneLine);
  });
});
