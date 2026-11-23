import { describe, expect, it } from 'vitest';

import { bottomInset, HOME_BAR_GAP } from './bottom-inset';

describe('gap above the home bar (spec 0029, REQ-002)', () => {
  it('AC-005: with a home bar everything at the bottom stands 8 pt above the safe area', () => {
    expect(HOME_BAR_GAP).toBe(8);
    expect(bottomInset(34)).toBe(42);
  });

  it('AC-008: without a home bar (safe area 0) nothing moves', () => {
    expect(bottomInset(0)).toBe(0);
  });

  it('AC-007: a sheet keeps its own minimum without a home bar', () => {
    expect(bottomInset(0, 12)).toBe(12);
    expect(bottomInset(34, 12)).toBe(42);
  });
});
