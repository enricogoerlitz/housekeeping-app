import { describe, expect, it } from 'vitest';

import { COMPOSER, composerLayout, GROW_PADDING, growHeight } from './field-grow';

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

describe('composerLayout (spec 0067, composer polish 28.11.)', () => {
  it('a 46 pt field with 34 pt buttons: the same inset all round, the line centred on them', () => {
    const layout = composerLayout({ border: 1.5, lineHeight: 24 });
    expect(COMPOSER.height).toBe(46);
    expect(COMPOSER.button).toBe(34);
    expect(layout.inset).toBe(4.5);
    expect(layout.textPadding).toBe(5);
    expect(layout.border * 2 + layout.inset * 2 + COMPOSER.button).toBe(COMPOSER.height);
  });

  it('a composer field grows with its own padding', () => {
    expect(
      growHeight({ contentHeight: 0, lineHeight: 24, empty: true, padding: 5, maxLines: 4.5 }),
    ).toBe(34);
    expect(
      growHeight({ contentHeight: 400, lineHeight: 24, empty: false, padding: 5, maxLines: 4.5 }),
    ).toBe(118);
  });
});
