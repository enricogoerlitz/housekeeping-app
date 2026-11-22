// The session of one drag (spec 0016, plan decisions 2–5) without React: which targets exist and
// where they were measured, what lies under the pointer, the edges that scroll along or turn the
// page, and how the drag ends. Measuring, time and the visuals are injected, so it is tested in
// Node; drag-drop.tsx wires it to refs, the frame loop and Reanimated shared values.

import {
  cellRect,
  gridCellAt,
  hitTest,
  type DropTarget,
  type GridShape,
  type Point,
  type Rect,
} from './drop-targets';
import {
  EDGE_PAGER_IDLE,
  EDGE_ZONE_INSET,
  EDGE_ZONE_WIDTH,
  autoScrollSpeed,
  edgePagerStep,
  edgeZoneAt,
  type EdgePagerState,
  type EdgeZone,
  type Viewport,
} from './edge-pager';

/** Measures a view in window coordinates; null when it is gone or not laid out. */
export type Measure = (done: (rect: Rect | null) => void) => void;

/** A month as one target: the day under the pointer becomes the target `cellId(cell)`. */
export interface DropGrid extends GridShape {
  cellId: (cell: number) => string;
}

export interface TargetEntry {
  measure: Measure;
  grid?: DropGrid;
}

/** What the feature hears of a drag. Ids are the feature's; texts come from it too. */
export interface DragCallbacks {
  onLift?: (sourceId: string) => void;
  /** The target under the pointer changed; null over no target. */
  onHover?: (targetId: string | null, sourceId: string) => void;
  /** Released over an allowed target. */
  onDrop?: (targetId: string, sourceId: string) => void;
  /**
   * The drag ended without a drop: released over no target, Escape, a second pointer, Android
   * back, a scroll taking over — or released over a target `isAllowed` refuses (its id is passed,
   * so the feature can say why, AC-015).
   */
  onCancel?: (sourceId: string, refusedTargetId: string | null) => void;
  /** Refused targets look pale and do not take the drop; default: every target is allowed. */
  isAllowed?: (targetId: string, sourceId: string) => boolean;
  /** Held in a paging zone at the left (-1) or right (1) edge; without it there are no zones. */
  onPage?: (direction: -1 | 1) => void;
  /** Shown on the dragged entry, because the finger covers the target ("Fr 27.11. · Abend"). */
  targetLabel?: (targetId: string, sourceId: string) => string | null;
}

/** Scrolls the page while the pointer is in a band at the top or bottom. */
export interface PageScroller {
  scrollBy: (dy: number) => void;
  /** The scrolling area; its visible part holds the bands (else the drag area does). */
  measure?: Measure;
}

export interface LiftRequest<P> {
  sourceId: string;
  point: Point;
  /** What the floating ghost shows. */
  preview: P;
  measureSource: Measure;
  scroller?: PageScroller;
  /** The drag was ended from outside (Android back): the source resets its gesture. */
  onAbort: () => void;
}

/** The visual side of the drag; called often, so it must not render React. */
export interface DragSink {
  lift: () => void;
  pointer: (point: Point) => void;
  /** Where the drag area lies, where the source was grabbed and how large it is. */
  geometry: (geometry: {
    origin: Point;
    grab: Point;
    size: { width: number; height: number };
  }) => void;
  /** The single highlight, in window coordinates; null hides it. */
  highlight: (rect: Rect | null, allowed: boolean) => void;
  /** `return`: glide back so the grab point lands on `returnTo` (null: the source is gone). */
  end: (outcome: 'drop' | 'return', returnTo: Point | null) => void;
}

export interface DragHover {
  id: string;
  allowed: boolean;
  label: string | null;
}

export interface DragSnapshot<P> {
  /** `settling`: released, the ghost lands or glides back. */
  phase: 'idle' | 'dragging' | 'settling';
  sourceId: string | null;
  preview: P | null;
  sourceRect: Rect | null;
  hover: DragHover | null;
  /** The paging zones in window coordinates, while dragging with `onPage`. */
  zones: { previous: Rect; next: Rect } | null;
  /** The zone the pointer is in. */
  zone: EdgeZone | null;
}

export interface DragController<P> {
  setCallbacks: (callbacks: DragCallbacks) => void;
  setContainer: (measure: Measure) => void;
  register: (id: string, entry: TargetEntry) => () => void;
  /** A target's layout changed: measure again on the next frame while dragging. */
  layoutChanged: () => void;
  lift: (request: LiftRequest<P>) => boolean;
  move: (point: Point) => void;
  release: () => void;
  /** Ends the drag without a drop; does nothing when no drag runs. */
  cancel: () => void;
  /** Like cancel, and tells the source to reset its gesture. */
  abort: () => void;
  /** Once per animation frame while dragging. */
  frame: (time: number) => void;
  /** The ghost has landed or glided back. */
  settled: () => void;
  isAllowed: (targetId: string) => boolean;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => DragSnapshot<P>;
}

/** Measure again this often while the page scrolls along. */
const SCROLL_MEASURE_MS = 100;
/** Frames to wait for the new layout after lifting or paging. */
const LAYOUT_FRAMES = 2;
/** A long frame (tab in the background) must not scroll a whole page at once. */
const MAX_FRAME_MS = 50;

const IDLE: DragSnapshot<never> = {
  phase: 'idle',
  sourceId: null,
  preview: null,
  sourceRect: null,
  hover: null,
  zones: null,
  zone: null,
};

function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

const sameRect = (a: Rect, b: Rect) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

function sameZones(a: DragSnapshot<unknown>['zones'], b: DragSnapshot<unknown>['zones']): boolean {
  if (a === null || b === null) return a === b;
  return sameRect(a.previous, b.previous) && sameRect(a.next, b.next);
}

interface Session<P> {
  request: LiftRequest<P>;
  point: Point;
  /** The source as measured right after the lift, and as last measured. */
  liftRect: Rect | null;
  sourceRect: Rect | null;
  container: Rect | null;
  scrollArea: Rect | null;
  pager: EdgePagerState;
  /**
   * False while the pointer stays in the zone it lifted in: holding still on a day at the edge
   * (a trip of one day on a Monday) must not turn the page.
   */
  pagerArmed: boolean;
  lastFrame: number | null;
  lastMeasure: number;
  scrolling: boolean;
  pendingFrames: number;
}

export function createDragController<P>(
  sink: DragSink,
  windowSize: () => Viewport,
): DragController<P> {
  let callbacks: DragCallbacks = {};
  let measureContainer: Measure = (done) => done(null);
  const entries = new Map<string, TargetEntry>();
  const rects = new Map<string, Rect>();
  let generation = 0;
  let session: Session<P> | null = null;
  let snapshot: DragSnapshot<P> = IDLE;
  const listeners = new Set<() => void>();

  const publish = (next: Partial<DragSnapshot<P>>) => {
    const changed = (Object.keys(next) as (keyof DragSnapshot<P>)[]).some(
      (key) => !Object.is(next[key], snapshot[key]),
    );
    if (!changed) return;
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };

  /** The visible part of an area (the whole window while it is not measured). */
  const visible = (area: Rect | null): Rect => {
    const size = windowSize();
    const screen = { x: 0, y: 0, width: size.width, height: size.height };
    return area ? intersect(area, screen) : screen;
  };
  const viewport = (current: Session<P>): Rect => visible(current.container);

  const zonesOf = (current: Session<P>): DragSnapshot<P>['zones'] => {
    if (!callbacks.onPage) return null;
    const area = viewport(current);
    const zone = (x: number): Rect => ({
      x,
      y: area.y,
      width: EDGE_ZONE_WIDTH,
      height: area.height,
    });
    return {
      previous: zone(area.x + EDGE_ZONE_INSET),
      next: zone(area.x + area.width - EDGE_ZONE_INSET - EDGE_ZONE_WIDTH),
    };
  };

  const allowed = (targetId: string): boolean => {
    const sourceId = session?.request.sourceId;
    if (sourceId === undefined) return true;
    return callbacks.isAllowed?.(targetId, sourceId) ?? true;
  };

  /** The target under the pointer, a grid resolved to its day. */
  const targetAt = (point: Point): { id: string; rect: Rect } | null => {
    const measured: DropTarget[] = [];
    rects.forEach((rect, id) => {
      const entry = entries.get(id);
      if (entry) measured.push({ id, rect, grid: entry.grid });
    });
    const hit = hitTest(point, measured);
    const rect = hit === null ? undefined : rects.get(hit);
    if (hit === null || !rect) return null;
    const grid = entries.get(hit)?.grid;
    if (!grid) return { id: hit, rect };
    const cells = { ...grid, rect };
    const cell = gridCellAt(point, cells);
    return cell === null ? null : { id: grid.cellId(cell), rect: cellRect(cells, cell) };
  };

  const updateHover = () => {
    const current = session;
    if (!current) return;
    const hit = targetAt(current.point);
    const sourceId = current.request.sourceId;
    const previous = snapshot.hover;
    if (hit === null) {
      sink.highlight(null, false);
      if (previous !== null) {
        publish({ hover: null });
        callbacks.onHover?.(null, sourceId);
      }
      return;
    }
    const isAllowed = allowed(hit.id);
    sink.highlight(hit.rect, isAllowed);
    if (previous?.id === hit.id && previous.allowed === isAllowed) return;
    publish({
      hover: {
        id: hit.id,
        allowed: isAllowed,
        label: callbacks.targetLabel?.(hit.id, sourceId) ?? null,
      },
    });
    if (previous?.id !== hit.id) callbacks.onHover?.(hit.id, sourceId);
  };

  /** Where in the source it was grabbed; fixed by the first measurement after the lift. */
  const grabOf = (current: Session<P>): Point | null =>
    current.liftRect
      ? {
          x: current.request.point.x - current.liftRect.x,
          y: current.request.point.y - current.liftRect.y,
        }
      : null;

  const sendGeometry = (current: Session<P>) => {
    const source = current.liftRect;
    const grab = grabOf(current);
    if (!source || !grab) return;
    const origin = current.container ?? { x: 0, y: 0 };
    sink.geometry({
      origin: { x: origin.x, y: origin.y },
      grab,
      size: { width: source.width, height: source.height },
    });
  };

  const measureAll = (time: number) => {
    const current = session;
    if (!current) return;
    generation += 1;
    const mine = generation;
    current.lastMeasure = time;
    const fresh = () => session === current && generation === mine;
    measureContainer((rect) => {
      if (!fresh()) return;
      current.container = rect;
      const zones = zonesOf(current);
      if (!sameZones(zones, snapshot.zones)) publish({ zones });
      sendGeometry(current);
    });
    current.request.scroller?.measure?.((rect) => {
      if (fresh()) current.scrollArea = rect;
    });
    current.request.measureSource((rect) => {
      if (!fresh()) return;
      // Scrolling moves the source and paging may remove it; the glide back goes to where it is.
      current.sourceRect = rect;
      if (rect && !current.liftRect) {
        current.liftRect = rect;
        publish({ sourceRect: rect });
        sendGeometry(current);
      }
    });
    entries.forEach((entry, id) => {
      entry.measure((rect) => {
        if (!fresh() || !entries.has(id)) return;
        if (rect) rects.set(id, rect);
        else rects.delete(id);
        updateHover();
      });
    });
  };

  const finish = (outcome: 'drop' | 'return') => {
    const current = session;
    if (!current) return;
    const source = current.sourceRect;
    const grab = grabOf(current);
    const returnTo =
      outcome === 'return' && source && grab
        ? { x: source.x + grab.x, y: source.y + grab.y }
        : null;
    session = null;
    generation += 1;
    sink.highlight(null, false);
    publish({ phase: 'settling', hover: null, zones: null, zone: null });
    sink.end(outcome, returnTo);
  };

  const stop = (refusedTargetId: string | null) => {
    const current = session;
    if (!current) return;
    const sourceId = current.request.sourceId;
    finish('return');
    callbacks.onCancel?.(sourceId, refusedTargetId);
  };

  return {
    setCallbacks: (next) => {
      callbacks = next;
    },
    setContainer: (measure) => {
      measureContainer = measure;
    },
    register: (id, entry) => {
      entries.set(id, entry);
      if (session) session.pendingFrames = Math.max(session.pendingFrames, 1);
      return () => {
        if (entries.get(id) !== entry) return;
        entries.delete(id);
        rects.delete(id);
        if (session) updateHover();
      };
    },
    layoutChanged: () => {
      if (session) session.pendingFrames = Math.max(session.pendingFrames, 1);
    },
    lift: (request) => {
      if (session) return false;
      if (snapshot.phase === 'settling') snapshot = IDLE;
      rects.clear();
      const current: Session<P> = {
        request,
        point: request.point,
        liftRect: null,
        sourceRect: null,
        container: null,
        scrollArea: null,
        pager: EDGE_PAGER_IDLE,
        pagerArmed: false,
        lastFrame: null,
        lastMeasure: 0,
        scrolling: false,
        pendingFrames: LAYOUT_FRAMES,
      };
      session = current;
      publish({
        phase: 'dragging',
        sourceId: request.sourceId,
        preview: request.preview,
        sourceRect: null,
        hover: null,
        zones: zonesOf(current),
        zone: null,
      });
      sink.pointer(request.point);
      sink.lift();
      measureAll(0);
      callbacks.onLift?.(request.sourceId);
      return true;
    },
    move: (point) => {
      if (!session) return;
      session.point = point;
      sink.pointer(point);
      updateHover();
    },
    release: () => {
      const current = session;
      if (!current) return;
      const hover = snapshot.hover;
      if (hover === null) {
        stop(null);
        return;
      }
      if (!hover.allowed) {
        stop(hover.id);
        return;
      }
      const sourceId = current.request.sourceId;
      finish('drop');
      callbacks.onDrop?.(hover.id, sourceId);
    },
    cancel: () => stop(null),
    abort: () => {
      const current = session;
      if (!current) return;
      stop(null);
      current.request.onAbort();
    },
    frame: (time) => {
      const current = session;
      if (!current) return;
      const dt = current.lastFrame === null ? 0 : Math.min(MAX_FRAME_MS, time - current.lastFrame);
      current.lastFrame = time;
      const area = viewport(current);
      const relative = { x: current.point.x - area.x, y: current.point.y - area.y };
      const size = { width: area.width, height: area.height };

      const scroller = current.request.scroller;
      const bands = visible(current.scrollArea ?? current.container);
      // Only inside the scrolling area: over a fixed header the pointer may rest to cancel.
      const inBands = current.point.y >= bands.y && current.point.y < bands.y + bands.height;
      const speed = scroller && inBands ? autoScrollSpeed(current.point.y - bands.y, bands) : 0;
      if (speed !== 0) {
        if (dt > 0) scroller?.scrollBy((speed * dt) / 1000);
        current.scrolling = true;
        if (time - current.lastMeasure >= SCROLL_MEASURE_MS) measureAll(time);
      } else if (current.scrolling) {
        current.scrolling = false;
        measureAll(time);
      }

      if (callbacks.onPage && !current.pagerArmed) {
        const lifted = edgeZoneAt(current.request.point.x - area.x, size);
        current.pagerArmed = lifted === null || edgeZoneAt(relative.x, size) !== lifted;
      }
      if (callbacks.onPage && current.pagerArmed) {
        const step = edgePagerStep(current.pager, { x: relative.x, time, viewport: size });
        current.pager = step.state;
        publish({ zone: step.state.zone });
        if (step.page !== 0) {
          callbacks.onPage(step.page);
          // The new period renders first; its targets are measured once it is laid out.
          current.pendingFrames = LAYOUT_FRAMES;
          return;
        }
      }

      if (current.pendingFrames > 0) {
        current.pendingFrames -= 1;
        if (current.pendingFrames === 0) measureAll(time);
      }
    },
    settled: () => {
      if (session || snapshot.phase !== 'settling') return;
      publish(IDLE);
    },
    isAllowed: allowed,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
  };
}
