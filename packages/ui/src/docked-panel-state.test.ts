import { describe, expect, it } from 'vitest';

import {
  FLICK_VELOCITY,
  dragHeight,
  isTap,
  panelHeights,
  panelPlacement,
  sidePanelWidth,
  snapHeight,
  snapPanel,
  stepPanel,
  tapPanel,
} from './docked-panel-state';

// A phone screen area of 700 px between the top of the screen and the tab bar.
const HEIGHTS = panelHeights({ container: 700, topGap: 60, collapsed: 72 });

describe('docked panel heights (spec 0016, REQ-006)', () => {
  it('AC-022: opens at half the content height; full leaves the top gap; collapsed is one line', () => {
    expect(HEIGHTS).toEqual({ collapsed: 72, half: 350, full: 640 });
  });

  it('never makes half or collapsed taller than full in a very low window', () => {
    expect(panelHeights({ container: 120, topGap: 60, collapsed: 72 })).toEqual({
      collapsed: 72,
      half: 72,
      full: 72,
    });
    expect(panelHeights({ container: 60, topGap: 60, collapsed: 72 })).toEqual({
      collapsed: 60,
      half: 60,
      full: 60,
    });
  });

  it('gives each snap point its height; closed is 0', () => {
    expect(snapHeight('closed', HEIGHTS)).toBe(0);
    expect(snapHeight('collapsed', HEIGHTS)).toBe(72);
    expect(snapHeight('half', HEIGHTS)).toBe(350);
    expect(snapHeight('full', HEIGHTS)).toBe(640);
  });
});

describe('dragging the handle', () => {
  it('follows the finger 1:1 between closed and full (up = negative dy = taller)', () => {
    expect(dragHeight(350, -100, 640)).toBe(450);
    expect(dragHeight(350, 100, 640)).toBe(250);
  });

  it('cannot go below closed', () => {
    expect(dragHeight(350, 500, 640)).toBe(0);
  });

  it('rubber-bands above full height instead of stopping dead', () => {
    const over = dragHeight(640, -100, 640);
    expect(over).toBeGreaterThan(640);
    expect(over).toBeLessThan(680);
    expect(dragHeight(640, -200, 640)).toBeGreaterThan(over);
  });

  it('tells a tap from a drag', () => {
    expect(isTap(2, 3)).toBe(true);
    expect(isTap(0, 12)).toBe(false);
    expect(isTap(12, 0)).toBe(false);
  });
});

describe('snapping on release', () => {
  it('a slow release lands on the nearest of closed, half and full', () => {
    expect(snapPanel({ from: 'half', height: 520, velocity: 0, heights: HEIGHTS })).toBe('full');
    expect(snapPanel({ from: 'half', height: 380, velocity: 0, heights: HEIGHTS })).toBe('half');
    expect(snapPanel({ from: 'full', height: 420, velocity: 0, heights: HEIGHTS })).toBe('half');
  });

  it('REQ-006: dragged down far enough from half, it closes', () => {
    expect(snapPanel({ from: 'half', height: 120, velocity: 0, heights: HEIGHTS })).toBe('closed');
  });

  it('a short flick goes one step in its direction, even below the distance threshold', () => {
    const up = -(FLICK_VELOCITY + 0.1);
    const down = FLICK_VELOCITY + 0.1;
    expect(snapPanel({ from: 'half', height: 370, velocity: up, heights: HEIGHTS })).toBe('full');
    expect(snapPanel({ from: 'full', height: 620, velocity: down, heights: HEIGHTS })).toBe('half');
    expect(snapPanel({ from: 'half', height: 330, velocity: down, heights: HEIGHTS })).toBe(
      'closed',
    );
  });

  it('a flick past the last snap point stays on it', () => {
    const up = -(FLICK_VELOCITY + 1);
    expect(snapPanel({ from: 'full', height: 655, velocity: up, heights: HEIGHTS })).toBe('full');
  });

  it('a slow movement is not a flick', () => {
    const slow = FLICK_VELOCITY - 0.1;
    expect(snapPanel({ from: 'half', height: 330, velocity: slow, heights: HEIGHTS })).toBe('half');
  });

  it('AC-008: collapsed is only a snap point while the panel is collapsed', () => {
    expect(snapPanel({ from: 'half', height: 80, velocity: 0, heights: HEIGHTS })).toBe('closed');
    expect(snapPanel({ from: 'collapsed', height: 80, velocity: 0, heights: HEIGHTS })).toBe(
      'collapsed',
    );
    expect(snapPanel({ from: 'collapsed', height: 300, velocity: 0, heights: HEIGHTS })).toBe(
      'half',
    );
    expect(
      snapPanel({ from: 'collapsed', height: 70, velocity: FLICK_VELOCITY + 1, heights: HEIGHTS }),
    ).toBe('closed');
  });
});

describe('tap and keyboard steps', () => {
  it('a tap on the handle grows the panel, or returns a full one to half', () => {
    expect(tapPanel('collapsed')).toBe('half');
    expect(tapPanel('half')).toBe('full');
    expect(tapPanel('full')).toBe('half');
  });

  it('a step up grows one size; a step down shrinks it and closes from half or collapsed', () => {
    expect(stepPanel('collapsed', 'up')).toBe('half');
    expect(stepPanel('half', 'up')).toBe('full');
    expect(stepPanel('full', 'up')).toBe('full');
    expect(stepPanel('full', 'down')).toBe('half');
    expect(stepPanel('half', 'down')).toBe('closed');
    expect(stepPanel('collapsed', 'down')).toBe('closed');
  });
});

describe('side panel (REQ-006)', () => {
  it('AC-024: is 320 to 400 px wide, about 30 % of the window', () => {
    expect(sidePanelWidth(1100)).toBe(330);
    expect(sidePanelWidth(1200)).toBe(360);
    expect(sidePanelWidth(1440)).toBe(400);
    expect(sidePanelWidth(2560)).toBe(400);
  });

  it('AC-022 / AC-024: stands at the bottom on phones and tablets, beside the content from 1100 px', () => {
    expect(panelPlacement(390)).toBe('bottom');
    // iPad portrait: beside the 256 px sidebar a 320 px panel would leave the grid 120–250 px.
    expect(panelPlacement(768)).toBe('bottom');
    expect(panelPlacement(820)).toBe('bottom');
    expect(panelPlacement(1099)).toBe('bottom');
    expect(panelPlacement(1100)).toBe('side');
    expect(panelPlacement(1440)).toBe('side');
  });
});
