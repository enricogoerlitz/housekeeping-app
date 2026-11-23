import {
  dragSourceKey,
  isSelectableMoveDay,
  moveTargetKey,
  parseDragSourceKey,
  type ISODate,
  type MealPlanEntry,
  type MoveBounds,
} from '@housekeeping/core';
import {
  DragBadge,
  SwipeArea,
  Text,
  space,
  toast,
  useDragSource,
  useDraggedSource,
  useDropTarget,
  useLiftedSource,
  useTheme,
  type DragSourceBinding,
} from '@housekeeping/ui';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { View, type HostInstance, type StyleProp, type ViewStyle } from 'react-native';

import { OFFLINE_EDIT_HINT, useOnlineOnly } from '@/features/shell/offline';

// Dragging in the calendar (spec 0016, REQ-001 to REQ-004 and REQ-007): the targets and sources
// the three views share. The session itself is the DragProvider of packages/ui around the
// calendar screen; ids are the keys of `moveTargetKey` and `dragSourceKey`.

/** Targets that refuse the dragged entry, and days outside its bounds, look pale (AC-015). */
export const PALE_OPACITY = 0.4;
/** The old place of a lifted entry stays as a pale outline. */
export const LIFTED_OPACITY = 0.35;

export interface DayRange {
  from: ISODate;
  to: ISODate;
}

export interface CalendarDrag {
  /** The leftovers bounds of the dragged entry; null while no entry is dragged. */
  bounds: MoveBounds | null;
  /** The days drawn for a new trip, while drawing and while "Reise eintragen" is open. */
  range: DayRange | null;
  /** The way without dragging: the entry window at "Verschieben" (screen reader action). */
  openMove: (entry: MealPlanEntry) => void;
}

const CalendarDragContext = createContext<CalendarDrag>({
  bounds: null,
  range: null,
  openMove: () => undefined,
});

export const CalendarDragProvider = CalendarDragContext.Provider;

export function useCalendarDrag(): CalendarDrag {
  return useContext(CalendarDragContext);
}

export type DragKind = 'entry' | 'trip';

const kindOf = (key: string | null): DragKind | null =>
  key === null ? null : (parseDragSourceKey(key)?.kind ?? null);

/** What is dragged right now (also while it glides back). */
export function useDraggedKind(): DragKind | null {
  return kindOf(useDraggedSource());
}

/** Like `useDraggedKind`, but only once the source was measured: for changes of the layout. */
export function useLiftedKind(): DragKind | null {
  return kindOf(useLiftedSource());
}

function inRange(range: DayRange | null, date: ISODate): boolean {
  return range !== null && range.from <= date && date <= range.to;
}

/**
 * Whether the dragged entry cannot go to a day (or one Tageszeit of it): such places are shown
 * pale in week, month and year (spec 0016, AC-015). Nothing is refused while nothing is dragged.
 */
export function useRefusedDays(): (date: ISODate, slotId?: string) => boolean {
  const { bounds } = useCalendarDrag();
  return (date, slotId) => bounds !== null && !isSelectableMoveDay(bounds, date, slotId);
}

/**
 * One row of a month or year grid as one drop target (plan decision 3): the day under the
 * pointer becomes the target "day:<date>", so the entry keeps its Tageszeit (AC-007, AC-008) and
 * a trip reaches that day (AC-028). `dates` has seven cells; null is a blank cell.
 */
export function WeekRowTarget(props: {
  dates: readonly (ISODate | null)[];
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const ref = useRef<HostInstance>(null);
  const { dates } = props;
  const firstCell = dates.findIndex((date) => date !== null);
  const lastCell = dates.reduce<number>((last, date, cell) => (date === null ? last : cell), -1);
  const id = `week:${dates[firstCell] ?? ''}`;
  const target = useDropTarget(id, ref, {
    grid: {
      rows: 1,
      firstCell,
      lastCell,
      cellId: (cell) => moveTargetKey({ kind: 'day', date: dates[cell] ?? '' }),
    },
    disabled: firstCell < 0,
  });
  return (
    <View ref={ref} onLayout={target.onLayout} style={props.style} testID={props.testID}>
      {props.children}
    </View>
  );
}

/**
 * A Tageszeit of a day in the week (AC-001, AC-002, AC-006); not a target for a trip. A field the
 * dragged entry may not go to is pale, by day and Tageszeit (spec 0021, REQ-012).
 */
export function SlotTarget(props: {
  date: ISODate;
  slotId: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const ref = useRef<HostInstance>(null);
  const kind = useDraggedKind();
  const refused = useRefusedDays()(props.date, props.slotId);
  const target = useDropTarget(
    moveTargetKey({ kind: 'slot', date: props.date, slotId: props.slotId }),
    ref,
    { disabled: kind === 'trip' },
  );
  return (
    <View
      ref={ref}
      onLayout={target.onLayout}
      style={[props.style, target.dimmed || refused ? { opacity: PALE_OPACITY } : null]}
      testID={props.testID}
    >
      {props.children}
    </View>
  );
}

/** A lifted drag ends this long before a swipe may page again, so its release never pages. */
const SWIPE_AFTER_DRAG_MS = 400;

/**
 * The calendar body on phones (spec 0021, REQ-019): a sideways swipe pages like the arrows, left
 * to the next period, right to the previous one. While an entry or a trip hangs on the finger it
 * never pages (AC-048); a drag still begins only after holding (spec 0016), and a move sideways
 * before that is a swipe. Paging has no animation, so reduced motion needs nothing else.
 */
export function CalendarSwipe(props: {
  enabled: boolean;
  onSwipe: (step: 1 | -1) => void;
  children?: ReactNode;
}) {
  const kind = useDraggedKind();
  const lastDrag = useRef(0);
  useEffect(() => {
    if (kind !== null)
      return () => {
        lastDrag.current = Date.now();
      };
    return undefined;
  }, [kind]);
  // Wider screens keep their touch handling (and horizontal panning) untouched.
  if (!props.enabled) return <>{props.children}</>;
  return (
    <SwipeArea
      enabled={kind === null}
      onSwipe={(step) => {
        if (kind !== null || Date.now() - lastDrag.current < SWIPE_AFTER_DRAG_MS) return;
        props.onSwipe(step);
      }}
      testID="calendar-swipe"
    >
      {props.children}
    </SwipeArea>
  );
}

/** "Vorgemerkt" as one target: the entry loses its day and keeps its Tageszeit (AC-013). */
export function ParkedTarget(props: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const ref = useRef<HostInstance>(null);
  const kind = useDraggedKind();
  const target = useDropTarget(moveTargetKey({ kind: 'parked' }), ref, {
    disabled: kind === 'trip',
  });
  return (
    <View
      ref={ref}
      onLayout={target.onLayout}
      style={[props.style, target.dimmed ? { opacity: PALE_OPACITY } : null]}
      testID={props.testID}
    >
      {props.children}
    </View>
  );
}

/** A day of the week's header row (from 700 px) as target of a trip; entries ignore it. */
export function DayHeadTarget(props: {
  date: ISODate;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<HostInstance>(null);
  const kind = useDraggedKind();
  const target = useDropTarget(moveTargetKey({ kind: 'day', date: props.date }), ref, {
    disabled: kind === 'entry',
  });
  return (
    <View ref={ref} onLayout={target.onLayout} style={props.style}>
      {props.children}
    </View>
  );
}

/**
 * Where a trip is drawn from (REQ-007): a day's free area or day number. Finger: hold until the
 * day is marked, then drag; mouse: press and drag. A tap or a click without moving stays a tap
 * (`guardPress` wraps it). Offline nothing is marked and the hint shows (AC-031).
 */
export function TripSource(props: {
  date: ISODate;
  children: (guardPress: DragSourceBinding['guardPress']) => ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const online = useOnlineOnly();
  const {
    ref,
    props: sourceProps,
    style,
    guardPress,
  } = useDragSource({
    id: dragSourceKey({ kind: 'trip', date: props.date }),
    preview: () => null,
    disabled: online.disabled,
    onBlocked: () => toast.show({ message: online.hint ?? OFFLINE_EDIT_HINT }),
  });
  return (
    <View ref={ref} {...sourceProps} style={[style, props.style]}>
      {props.children(guardPress)}
    </View>
  );
}

/** The marking of a day while a trip is drawn over it; put it first into the day's cell. */
export function RangeMark(props: { date: ISODate }) {
  const theme = useTheme();
  const { range } = useCalendarDrag();
  if (!inRange(range, props.date)) return null;
  return (
    <View
      pointerEvents="none"
      testID={`trip-range-day-${props.date}`}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: theme.colors.accentSoft,
        borderRadius: theme.shape.radius.control,
      }}
    />
  );
}

/**
 * "Mo 7.12. – Fr 11.12. · 5 Tage" above the finger while a trip is drawn (REQ-007): near where
 * the eye is, never over the header.
 */
export function TripRangeBanner(props: { label: string | null }) {
  const theme = useTheme();
  if (props.label === null) return null;
  return (
    <DragBadge>
      <View
        style={{
          paddingHorizontal: space.m,
          paddingVertical: space.xs,
          borderRadius: theme.shape.radius.chip,
          backgroundColor: theme.colors.accent,
          boxShadow: theme.colors.shadowRaised,
        }}
      >
        <Text variant="smallStrong" color="onAccent" numberOfLines={1} testID="trip-range-label">
          {props.label}
        </Text>
      </View>
    </DragBadge>
  );
}
