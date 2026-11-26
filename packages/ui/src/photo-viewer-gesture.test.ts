import { describe, expect, it } from 'vitest';

import { closesViewer, viewerDrag } from './photo-viewer-gesture';

describe('photo viewer swipe (spec 0036, REQ-009)', () => {
  it('AC-016: a swipe down by a fifth of the screen or a quick flick closes it', () => {
    expect(closesViewer({ dy: 200, vy: 0.1 }, 844)).toBe(true);
    expect(closesViewer({ dy: 40, vy: 1.2 }, 844)).toBe(true);
  });

  it('a short or sideways drag, or one upwards, springs back', () => {
    expect(closesViewer({ dy: 100, vy: 0.2 }, 844)).toBe(false);
    expect(closesViewer({ dy: -300, vy: -2 }, 844)).toBe(false);
  });

  it('the photo follows the finger down, and only a little up', () => {
    expect(viewerDrag(120)).toBe(120);
    expect(viewerDrag(-100)).toBe(-20);
  });
});
