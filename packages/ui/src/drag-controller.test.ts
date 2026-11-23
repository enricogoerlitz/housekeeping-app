import { describe, expect, it, vi } from 'vitest';

import {
  BADGE_CLEARANCE,
  GHOST_EDGE_MARGIN,
  badgeTop,
  GHOST_MAX_WIDTH,
  createDragController,
  ghostSize,
  ghostStart,
  highlightFilled,
  type DragCallbacks,
  type DragSink,
  type Measure,
} from './drag-controller';
import type { Rect } from './drop-targets';
import { EDGE_FIRST_PAGE_MS, EDGE_ZONE_INSET, EDGE_ZONE_WIDTH } from './edge-pager';

const WINDOW = { width: 400, height: 800 };
const CONTAINER: Rect = { x: 0, y: 0, width: 400, height: 800 };

const at =
  (rect: Rect | null): Measure =>
  (done) =>
    done(rect);

function setup(callbacks: DragCallbacks = {}) {
  const sink: DragSink = {
    lift: vi.fn(),
    pointer: vi.fn(),
    geometry: vi.fn(),
    highlight: vi.fn(),
    end: vi.fn(),
  };
  const controller = createDragController<string>(sink, () => WINDOW);
  controller.setCallbacks(callbacks);
  controller.setContainer(at(CONTAINER));
  // Wednesday evening holds the entry; Friday evening and noon are free; the month grid lies below.
  controller.register('wed-evening', { measure: at({ x: 0, y: 100, width: 100, height: 40 }) });
  controller.register('fri-evening', { measure: at({ x: 200, y: 100, width: 100, height: 40 }) });
  controller.register('fri-noon', { measure: at({ x: 200, y: 140, width: 100, height: 40 }) });
  controller.register('2026-12', {
    measure: at({ x: 100, y: 400, width: 70, height: 60 }),
    grid: { rows: 6, firstCell: 1, lastCell: 31, cellId: (cell) => `2026-12-${cell}` },
  });
  const onAbort = vi.fn();
  const lift = (sourceId = 'lasagne', point = { x: 30, y: 120 }) =>
    controller.lift({
      sourceId,
      point,
      preview: 'Lasagne',
      measureSource: at({ x: 10, y: 110, width: 80, height: 20 }),
      onAbort,
    });
  return { controller, sink, lift, onAbort };
}

describe('drag controller', () => {
  it('AC-001: lifting measures the targets, the source and the area once and reports the lift', () => {
    const onLift = vi.fn();
    const { controller, sink, lift } = setup({ onLift });
    expect(lift()).toBe(true);
    expect(onLift).toHaveBeenCalledWith('lasagne');
    expect(sink.lift).toHaveBeenCalledTimes(1);
    expect(sink.geometry).toHaveBeenLastCalledWith({
      origin: { x: 0, y: 0 },
      grab: { x: 20, y: 10 },
      size: { width: 80, height: 20 },
      area: { x: 0, y: 0, width: 400, height: 800 },
    });
    const snapshot = controller.getSnapshot();
    expect(snapshot.phase).toBe('dragging');
    expect(snapshot.sourceId).toBe('lasagne');
    expect(snapshot.preview).toBe('Lasagne');
    expect(snapshot.sourceRect).toEqual({ x: 10, y: 110, width: 80, height: 20 });
  });

  it('only one entry is dragged at a time', () => {
    const { lift } = setup();
    expect(lift('lasagne')).toBe(true);
    expect(lift('halloumi')).toBe(false);
  });

  it('AC-001: the target under the pointer is highlighted and labelled by the feature', () => {
    const onHover = vi.fn();
    const { controller, sink, lift } = setup({
      onHover,
      targetLabel: (target) => (target === 'fri-evening' ? 'Fr 27.11. · Abend' : null),
    });
    lift();
    controller.move({ x: 250, y: 120 });
    expect(onHover).toHaveBeenLastCalledWith('fri-evening', 'lasagne');
    expect(sink.highlight).toHaveBeenLastCalledWith(
      { x: 200, y: 100, width: 100, height: 40 },
      true,
    );
    expect(controller.getSnapshot().hover).toEqual({
      id: 'fri-evening',
      allowed: true,
      label: 'Fr 27.11. · Abend',
    });
    // Moving within the same target reports nothing new.
    onHover.mockClear();
    controller.move({ x: 260, y: 125 });
    expect(onHover).not.toHaveBeenCalled();
    controller.move({ x: 250, y: 300 });
    expect(onHover).toHaveBeenLastCalledWith(null, 'lasagne');
    expect(sink.highlight).toHaveBeenLastCalledWith(null, false);
    expect(controller.getSnapshot().hover).toBeNull();
  });

  it('AC-007: a month grid resolves to the day under the pointer and highlights that day', () => {
    const onHover = vi.fn();
    const { controller, sink, lift } = setup({ onHover });
    lift();
    controller.move({ x: 125, y: 415 });
    expect(onHover).toHaveBeenLastCalledWith('2026-12-9', 'lasagne');
    expect(sink.highlight).toHaveBeenLastCalledWith(
      { x: 120, y: 410, width: 10, height: 10 },
      true,
    );
    // Cell 0 is no day of December: nothing is hit.
    controller.move({ x: 105, y: 405 });
    expect(onHover).toHaveBeenLastCalledWith(null, 'lasagne');
  });

  it('AC-002: releasing on an allowed target drops there', () => {
    const onDrop = vi.fn();
    const onCancel = vi.fn();
    const { controller, sink, lift } = setup({ onDrop, onCancel });
    lift();
    controller.move({ x: 250, y: 150 });
    controller.release();
    expect(onDrop).toHaveBeenCalledWith('fri-noon', 'lasagne');
    expect(onCancel).not.toHaveBeenCalled();
    expect(sink.end).toHaveBeenCalledWith('drop', null);
    expect(controller.getSnapshot().phase).toBe('settling');
    controller.settled();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle', sourceId: null, hover: null });
  });

  it('AC-003: releasing over no target cancels and glides back to the source', () => {
    const onDrop = vi.fn();
    const onCancel = vi.fn();
    const { controller, sink, lift } = setup({ onDrop, onCancel });
    lift();
    controller.move({ x: 250, y: 20 });
    controller.release();
    expect(onDrop).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledWith('lasagne', null);
    // The ghost returns to where its grab point sits over the source: (10, 110) + (20, 10).
    expect(sink.end).toHaveBeenCalledWith('return', { x: 30, y: 120 });
  });

  it('AC-015: a disallowed target looks refused and does not take the drop', () => {
    const onDrop = vi.fn();
    const onCancel = vi.fn();
    const { controller, sink, lift } = setup({
      onDrop,
      onCancel,
      isAllowed: (target) => target !== 'fri-evening',
    });
    lift();
    expect(controller.isAllowed('fri-evening')).toBe(false);
    expect(controller.isAllowed('fri-noon')).toBe(true);
    controller.move({ x: 250, y: 120 });
    expect(sink.highlight).toHaveBeenLastCalledWith(
      { x: 200, y: 100, width: 100, height: 40 },
      false,
    );
    expect(controller.getSnapshot().hover?.allowed).toBe(false);
    controller.release();
    expect(onDrop).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledWith('lasagne', 'fri-evening');
    expect(sink.end).toHaveBeenCalledWith('return', { x: 30, y: 120 });
  });

  it('AC-003: an abort from outside (Android back) resets the source and cancels once', () => {
    const onCancel = vi.fn();
    const { controller, lift, onAbort } = setup({ onCancel });
    lift();
    controller.abort();
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    // The source answers the abort with its own cancel, which changes nothing any more.
    controller.cancel();
    controller.release();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('a new lift during the glide back ends the old drag first', () => {
    const { controller, lift } = setup();
    lift('lasagne');
    controller.release();
    expect(controller.getSnapshot().phase).toBe('settling');
    expect(lift('halloumi')).toBe(true);
    expect(controller.getSnapshot().sourceId).toBe('halloumi');
  });

  it('scrolls along in the bottom band and measures again once the scrolling stops', () => {
    const scrollBy = vi.fn();
    const { controller } = setup();
    const measured = vi.fn(at({ x: 200, y: 100, width: 100, height: 40 }));
    controller.register('sat-evening', { measure: measured });
    controller.lift({
      sourceId: 'lasagne',
      point: { x: 30, y: 120 },
      preview: 'Lasagne',
      measureSource: at({ x: 10, y: 110, width: 80, height: 20 }),
      scroller: { scrollBy },
      onAbort: () => undefined,
    });
    controller.frame(0);
    controller.frame(16);
    controller.frame(32);
    measured.mockClear();
    controller.move({ x: 200, y: 790 });
    controller.frame(48);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0]?.[0]).toBeGreaterThan(0);
    controller.frame(64);
    controller.move({ x: 200, y: 400 });
    controller.frame(80);
    expect(scrollBy).toHaveBeenCalledTimes(2);
    expect(measured).toHaveBeenCalled();
  });

  it('the bands lie at the edges of the scrolling area, below a fixed header', () => {
    const scrollBy = vi.fn();
    const { controller } = setup();
    controller.lift({
      sourceId: 'lasagne',
      point: { x: 30, y: 120 },
      preview: 'Lasagne',
      measureSource: at({ x: 10, y: 110, width: 80, height: 20 }),
      scroller: { scrollBy, measure: at({ x: 0, y: 100, width: 400, height: 600 }) },
      onAbort: () => undefined,
    });
    // 40 px under the window top is header, not band: nothing scrolls.
    controller.move({ x: 200, y: 40 });
    controller.frame(0);
    controller.frame(16);
    expect(scrollBy).not.toHaveBeenCalled();
    // 20 px into the scroll area scrolls up; 20 px above its bottom (y 680) scrolls down.
    controller.move({ x: 200, y: 120 });
    controller.frame(32);
    expect(scrollBy.mock.calls[0]?.[0]).toBeLessThan(0);
    controller.move({ x: 200, y: 680 });
    controller.frame(48);
    expect(scrollBy.mock.calls[1]?.[0]).toBeGreaterThan(0);
  });

  it('AC-009: holding in the right zone turns the page and measures after the new layout', () => {
    const onPage = vi.fn();
    const { controller, lift } = setup({ onPage });
    lift();
    const late = vi.fn(at({ x: 0, y: 0, width: 0, height: 0 }));
    expect(controller.getSnapshot().zones).toEqual({
      previous: { x: EDGE_ZONE_INSET, y: 0, width: EDGE_ZONE_WIDTH, height: 800 },
      next: {
        x: 400 - EDGE_ZONE_INSET - EDGE_ZONE_WIDTH,
        y: 0,
        width: EDGE_ZONE_WIDTH,
        height: 800,
      },
    });
    controller.move({ x: 400 - EDGE_ZONE_INSET - 10, y: 300 });
    controller.frame(1000);
    expect(controller.getSnapshot().zone).toBe('next');
    controller.frame(1000 + EDGE_FIRST_PAGE_MS - 1);
    expect(onPage).not.toHaveBeenCalled();
    controller.frame(1000 + EDGE_FIRST_PAGE_MS);
    expect(onPage).toHaveBeenCalledWith(1);
    controller.register('next-week', { measure: late });
    late.mockClear();
    controller.frame(1000 + EDGE_FIRST_PAGE_MS + 16);
    controller.frame(1000 + EDGE_FIRST_PAGE_MS + 32);
    expect(late).toHaveBeenCalled();
  });

  it('AC-009: over the middle of a day at the edge of a narrow grid no page turns', () => {
    const onPage = vi.fn();
    const onDrop = vi.fn();
    const { controller, lift } = setup({ onPage, onDrop });
    // A week of the phone month: seven days of 50 px from x 20.
    controller.register('phone-week', {
      measure: at({ x: 20, y: 600, width: 350, height: 50 }),
      grid: { rows: 1, cellId: (cell) => `day-${cell}` },
    });
    lift('lasagne', { x: 80, y: 120 });
    controller.frame(0);
    controller.frame(16);
    controller.move({ x: 46, y: 620 });
    controller.frame(100);
    controller.frame(100 + EDGE_FIRST_PAGE_MS * 4);
    expect(onPage).not.toHaveBeenCalled();
    expect(controller.getSnapshot().zone).toBeNull();
    // Pushing past the middle of the Monday towards the edge pages back.
    controller.move({ x: 30, y: 620 });
    controller.frame(6000);
    expect(controller.getSnapshot().zone).toBe('previous');
    controller.frame(6000 + EDGE_FIRST_PAGE_MS);
    expect(onPage).toHaveBeenCalledWith(-1);
  });

  it('a layout change after the lift scrolls the page so the source stays under the pointer', () => {
    const scrollBy = vi.fn();
    const { controller } = setup();
    // Empty slots appear above the source once it is lifted and push it 220 px down.
    const source = vi
      .fn<Measure>()
      .mockImplementationOnce(at({ x: 10, y: 110, width: 80, height: 20 }))
      .mockImplementationOnce(at({ x: 10, y: 330, width: 80, height: 20 }))
      .mockImplementation(at({ x: 10, y: 110, width: 80, height: 20 }));
    controller.lift({
      sourceId: 'lasagne',
      point: { x: 30, y: 400 },
      preview: 'Lasagne',
      measureSource: source,
      scroller: { scrollBy },
      onAbort: () => undefined,
    });
    controller.frame(0);
    controller.frame(16);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith(220);
    controller.frame(32);
    controller.frame(48);
    controller.frame(64);
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it('a source moved by scrolling along is not scrolled back', () => {
    const scrollBy = vi.fn();
    const { controller } = setup();
    let sourceY = 110;
    controller.lift({
      sourceId: 'lasagne',
      point: { x: 30, y: 400 },
      preview: 'Lasagne',
      measureSource: (done) => done({ x: 10, y: sourceY, width: 80, height: 20 }),
      scroller: { scrollBy },
      onAbort: () => undefined,
    });
    controller.frame(0);
    controller.frame(16);
    controller.move({ x: 200, y: 790 });
    controller.frame(32);
    sourceY = 50;
    controller.move({ x: 200, y: 400 });
    controller.frame(48);
    controller.frame(64);
    controller.frame(80);
    expect(scrollBy.mock.calls.every(([dy]) => (dy as number) > 0)).toBe(true);
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it('AC-029: a drag that lifts inside a zone turns no page until the pointer has left it', () => {
    const onPage = vi.fn();
    const { controller, lift } = setup({ onPage });
    // Holding a Monday at the left edge of a phone grid, e.g. for a trip of one day.
    lift('trip', { x: EDGE_ZONE_INSET + 10, y: 300 });
    controller.frame(1000);
    controller.frame(1000 + EDGE_FIRST_PAGE_MS * 3);
    expect(onPage).not.toHaveBeenCalled();
    expect(controller.getSnapshot().zone).toBeNull();
    controller.move({ x: 200, y: 300 });
    controller.frame(5000);
    controller.move({ x: EDGE_ZONE_INSET + 10, y: 300 });
    controller.frame(6000);
    controller.frame(6000 + EDGE_FIRST_PAGE_MS);
    expect(onPage).toHaveBeenCalledWith(-1);
  });

  it('without onPage there are no paging zones', () => {
    const { controller, lift } = setup();
    lift();
    expect(controller.getSnapshot().zones).toBeNull();
    controller.move({ x: 400 - EDGE_ZONE_INSET - 10, y: 300 });
    controller.frame(0);
    controller.frame(5000);
    expect(controller.getSnapshot().zone).toBeNull();
  });

  it('the zones and bands follow the visible part of the drag area', () => {
    const onPage = vi.fn();
    const { controller, lift } = setup({ onPage });
    controller.setContainer(at({ x: 100, y: -200, width: 300, height: 1200 }));
    lift();
    expect(controller.getSnapshot().zones?.previous).toEqual({
      x: 100 + EDGE_ZONE_INSET,
      y: 0,
      width: EDGE_ZONE_WIDTH,
      height: 800,
    });
  });

  it('a measurement that arrives after a newer one started is ignored', () => {
    const pending: ((rect: Rect | null) => void)[] = [];
    const slow: Measure = (done) => pending.push(done);
    const { controller, sink, lift } = setup();
    controller.register('slow', { measure: slow });
    lift();
    controller.layoutChanged();
    controller.frame(0);
    controller.frame(16);
    expect(pending.length).toBeGreaterThanOrEqual(2);
    pending[pending.length - 1]?.({ x: 300, y: 600, width: 50, height: 50 });
    pending[0]?.({ x: 0, y: 600, width: 50, height: 50 });
    controller.move({ x: 20, y: 620 });
    expect(sink.highlight).toHaveBeenLastCalledWith(null, false);
    controller.move({ x: 320, y: 620 });
    expect(sink.highlight).toHaveBeenLastCalledWith(
      { x: 300, y: 600, width: 50, height: 50 },
      true,
    );
  });

  it('a target that unregisters is no longer hit', () => {
    const { controller, lift } = setup();
    const unregister = controller.register('extra', {
      measure: at({ x: 0, y: 600, width: 50, height: 50 }),
    });
    lift();
    unregister();
    controller.move({ x: 20, y: 620 });
    expect(controller.getSnapshot().hover).toBeNull();
  });

  it('notifies subscribers only when the snapshot changes', () => {
    const { controller, lift } = setup();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    lift();
    expect(listener).toHaveBeenCalled();
    // Off the source's own cell: the hover changes once.
    controller.move({ x: 30, y: 300 });
    const afterLift = listener.mock.calls.length;
    controller.move({ x: 31, y: 301 });
    controller.move({ x: 32, y: 302 });
    expect(listener).toHaveBeenCalledTimes(afterLift);
    unsubscribe();
    controller.move({ x: 250, y: 120 });
    expect(listener).toHaveBeenCalledTimes(afterLift);
  });
});

describe('ghost geometry', () => {
  it('a wide source floats at most 280 px wide, held at the same share of its width', () => {
    expect(ghostSize(520, 390)).toEqual({ width: GHOST_MAX_WIDTH, grabX: 210 });
    expect(ghostSize(200, 50)).toEqual({ width: 200, grabX: 50 });
  });

  it('the ghost hangs on the pointer at the grab point', () => {
    expect(ghostStart(200, 50, 120, 0, 390)).toBe(150);
  });

  it('the ghost stays inside the visible drag area at the edges', () => {
    // Dragged to the left edge, a ghost grabbed at its right end would leave the window.
    expect(ghostStart(30, 250, 280, 0, 390)).toBe(GHOST_EDGE_MARGIN);
    expect(ghostStart(380, 10, 280, 0, 390)).toBe(390 - GHOST_EDGE_MARGIN - 280);
    // Wider than the area: it starts at the margin.
    expect(ghostStart(100, 50, 500, 0, 390)).toBe(GHOST_EDGE_MARGIN);
    // On the desktop the drag area begins right of the sidebar, which would clip the ghost.
    expect(ghostStart(262, 250, 280, 256, 1440)).toBe(256 + GHOST_EDGE_MARGIN);
  });

  it('a badge floats above the finger, and below it at the top of the window', () => {
    expect(badgeTop(400, 28)).toBe(400 - BADGE_CLEARANCE - 28);
    expect(badgeTop(40, 28)).toBe(40 + BADGE_CLEARANCE);
  });
});

describe('the highlight over the target (spec 0030, REQ-002)', () => {
  it('AC-005: drawing a trip (no preview) frames the day only, so its tint and text stay readable', () => {
    expect(highlightFilled(true, false)).toBe(false);
  });

  it('AC-006: dragging an entry fills an allowed target as before; a refused one stays unfilled', () => {
    expect(highlightFilled(true, true)).toBe(true);
    expect(highlightFilled(false, true)).toBe(false);
  });
});
