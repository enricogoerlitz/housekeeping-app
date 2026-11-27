import { describe, expect, it } from 'vitest';

import { bottomEdge, largeTitleUnder } from './large-title';

describe('largeTitleUnder (spec 0056, REQ-009)', () => {
  it('AC-036: under the bar once its bottom edge reaches the bar’s bottom edge', () => {
    expect(largeTitleUnder(300, 60)).toBe(false);
    expect(largeTitleUnder(61, 60)).toBe(false);
    expect(largeTitleUnder(60, 60)).toBe(true);
    expect(largeTitleUnder(-200, 60)).toBe(true);
  });

  it('unknown when either edge cannot be measured', () => {
    expect(largeTitleUnder(undefined, 60)).toBeUndefined();
    expect(largeTitleUnder(300, undefined)).toBeUndefined();
  });
});

describe('bottomEdge', () => {
  const node = (rect: Partial<DOMRect>) => ({ getBoundingClientRect: () => rect });

  it('the bottom edge of a laid-out node', () => {
    expect(bottomEdge(node({ bottom: 120, width: 300, height: 40 }))).toBe(120);
  });

  it('nothing for a node without a box (a page hidden below another), none, or native', () => {
    expect(bottomEdge(node({ bottom: 0, width: 0, height: 0 }))).toBeUndefined();
    expect(bottomEdge(null)).toBeUndefined();
    expect(bottomEdge({})).toBeUndefined();
  });
});
