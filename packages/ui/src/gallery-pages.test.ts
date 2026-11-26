import { describe, expect, it } from 'vitest';

import { galleryKeyStep, pageAt, stepPage } from './gallery-pages';

describe('gallery pages (spec 0046, REQ-003)', () => {
  it('AC-009: the page under the scroll position, the nearest one while it moves', () => {
    expect(pageAt(0, 390, 3)).toBe(0);
    expect(pageAt(390, 390, 3)).toBe(1);
    expect(pageAt(600, 390, 3)).toBe(2);
    expect(pageAt(500, 390, 3)).toBe(1);
  });

  it('stays inside the pages: rubber band at the ends, no width yet, no pages', () => {
    expect(pageAt(-40, 390, 3)).toBe(0);
    expect(pageAt(2000, 390, 3)).toBe(2);
    expect(pageAt(100, 0, 3)).toBe(0);
    expect(pageAt(0, 390, 0)).toBe(0);
  });

  it('AC-009: "Nächstes" and "Vorheriges" step one page, never past the ends', () => {
    expect(stepPage(0, 1, 3)).toBe(1);
    expect(stepPage(2, 1, 3)).toBe(2);
    expect(stepPage(0, -1, 3)).toBe(0);
    expect(stepPage(5, -1, 3)).toBe(1);
  });

  it('AC-009: the arrow keys step, every other key does nothing', () => {
    expect(galleryKeyStep('ArrowRight')).toBe(1);
    expect(galleryKeyStep('ArrowLeft')).toBe(-1);
    expect(galleryKeyStep('Enter')).toBe(0);
    expect(galleryKeyStep('ArrowDown')).toBe(0);
  });
});
