import {
  addPresetSlot,
  dayKinds,
  fittingItems,
  formatLongDate,
  monthGrid,
  parseISODate,
  sharedHeight,
  stripeSegment,
  weekdayHeads,
  type TripStripe,
  type Id,
  type ISODate,
  type MealPlanEntry,
} from '@housekeeping/core';
import {
  Button,
  Icon,
  KindDot,
  Text,
  keyboardFocusRing,
  stickyTopStyle,
  toast,
  useFinePointer,
  useHover,
  useTheme,
} from '@housekeeping/ui';
import { useState } from 'react';
import { Platform, Pressable, View, type HostInstance, type ViewStyle } from 'react-native';

import type { AddTarget } from '@/features/meal-plan/add-entry-sheet';
import { OFFLINE_EDIT_HINT, useOnlineOnly } from '@/features/shell/offline';

import {
  CELL_RADIUS,
  TripStripeView,
  EntryLine,
  HouseholdDay,
  useStripeColors,
  stripeLine,
} from './calendar-parts';
import { dayLabel, dayRoles, type CalendarData } from './calendar-data';
import {
  PALE_OPACITY,
  RangeMark,
  TripSource,
  WeekRowTarget,
  useRefusedDays,
} from './calendar-drag';

export interface MonthViewProps {
  data: CalendarData;
  /** First day of the shown month. */
  monthStart: ISODate;
  /** The day of the open day window; it is marked in the grid. */
  selected: ISODate | undefined;
  /** A tap on a day (on the desktop the day number, the free area or "+n weitere", AC-024). */
  onOpenDay: (date: ISODate) => void;
  /** Every day cell registers here, e.g. to get the focus back when the day window closes. */
  registerDay: (date: ISODate, node: HostInstance | null) => void;
  showHousehold: boolean;
  wide: boolean;
  /** Desktop (from 1100 px): the weekday heads are written out (spec 0030, AC-004). */
  longWeekdays?: boolean;
  /** Desktop: the grid's room in px down to "Vorgemerkt" (spec 0021, REQ-001); else natural. */
  height?: number;
  /** "+" of a desktop day (spec 0021, REQ-003). */
  onAdd: (target: AddTarget) => void;
  onOpenEntry: (entry: MealPlanEntry) => void;
  onOpenStripe: (stripe: TripStripe) => void;
  onOpenChore: (choreId: Id) => void;
}

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

// The free area of a desktop day is a second way to the same day window as its day number; it is
// not a separate stop for the keyboard or a screen reader.
const QUIET_PRESSABLE =
  Platform.OS === 'web' ? ({ tabIndex: -1, 'aria-hidden': true } as object) : {};

const FILL: ViewStyle = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 };

// The desktop month's measures (spec 0021, REQ-001): an entry line, a chore line with its box,
// "+n weitere", the day number row and a trip stripe; half of the 4 px between two day tiles.
const LINE_ENTRY = 24;
const LINE_CHORE = 28;
const MORE_HEIGHT = 38;
const NUMBER_ROW = 34;
const STRIPE_ROW = 28;
const CELL_END = 6;
const ROW_PAD = 2;
const TILE_GAP = 2;
const GRID_END = 24;
const ADD_SIZE = 28;

/**
 * The month (spec 0010, REQ-004; D20). A tap on a day opens the day window (spec 0016, REQ-006);
 * there is no day list under the grid and no small menu behind "+n weitere" any more. Each week
 * is one drop target resolved to its days (REQ-002); holding or dragging over days from a free
 * area or a day number draws a trip (REQ-007).
 */
export function MonthView(props: MonthViewProps) {
  return props.wide ? <MonthGridDesktop {...props} /> : <MonthPhone {...props} />;
}

/**
 * The row of weekdays over the grid; it stays at the top while the month scrolls (spec 0030,
 * REQ-001), so it must be a direct child of the whole grid.
 */
function WeekdayHeads(props: { long?: boolean; onHeight?: (height: number) => void }) {
  const theme = useTheme();
  return (
    <View
      testID="month-weekday-heads"
      onLayout={(event) => props.onHeight?.(event.nativeEvent.layout.height)}
      style={{ flexDirection: 'row', ...stickyTopStyle(Platform.OS, theme.colors.bg) }}
    >
      {weekdayHeads(!!props.long).map((head) => (
        <View key={head} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
          <Text variant="caption" color="muted">
            {head}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Thin lines under a week of the phone grid, one per stripe, in the person's colour. */
function StripeLines(props: { week: ISODate[]; data: CalendarData }) {
  const first = props.week[0];
  const last = props.week[6];
  if (!first || !last) return null;
  const segments = props.data.stripes.flatMap((stripe) => {
    const segment = stripeSegment(stripe, first, last);
    return segment ? [{ stripe, segment }] : [];
  });
  if (segments.length === 0) return null;
  return (
    <View style={{ gap: 2, paddingBottom: 4 }}>
      {segments.map(({ stripe, segment }) => (
        <StripeLine
          key={stripe.key}
          stripe={stripe}
          start={segment.start}
          end={segment.end}
          data={props.data}
        />
      ))}
    </View>
  );
}

function StripeLine(props: { stripe: TripStripe; start: number; end: number; data: CalendarData }) {
  const colors = useStripeColors(props.stripe, props.data.membersById);
  return (
    <View style={{ height: 3 }}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${(props.start / 7) * 100}%`,
          width: `${((props.end - props.start + 1) / 7) * 100}%`,
          borderRadius: 2,
          ...stripeLine(colors.edge, props.stripe.draft, 'top', 3),
        }}
      />
    </View>
  );
}

/**
 * The day number in a circle: filled while its day window is open. Today is ringed on phones; on
 * the desktop its tile is tinted and the number takes the accent (spec 0021, REQ-002).
 */
function DayNumber(props: {
  date: ISODate;
  inMonth: boolean;
  selected: boolean;
  isToday: boolean;
  size: number;
  todayAccent?: boolean;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const ring = props.isToday && !props.selected && !props.todayAccent;
  const color = props.selected
    ? c.bg
    : props.isToday && props.todayAccent
      ? c.accent
      : props.inMonth
        ? c.text
        : c.textMuted;
  return (
    <View
      style={{
        width: props.size,
        height: props.size,
        borderRadius: props.size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: props.selected ? c.text : 'transparent',
        borderWidth: ring ? 1.5 : 0,
        borderColor: c.accent,
      }}
    >
      <Text variant="smallStrong" style={{ color }}>
        {String(parseISODate(props.date).getDate())}
      </Text>
    </View>
  );
}

function MonthPhone(props: MonthViewProps) {
  const theme = useTheme();
  const refused = useRefusedDays();
  const { data } = props;
  const weeks = monthGrid(props.monthStart);
  const month = props.monthStart.slice(0, 7);
  const first = weeks[0]?.[0] ?? props.monthStart;
  const last = weeks[weeks.length - 1]?.[6] ?? props.monthStart;
  // With the household row a day with chores carries the dot "Aufgabe" (spec 0021, REQ-017).
  const chores = props.showHousehold ? data.householdRow(first, last) : {};

  return (
    <View style={{ marginBottom: 22 }} testID="month-phone">
      <WeekdayHeads />
      {weeks.map((week) => (
        <WeekRowTarget key={week[0]} dates={week}>
          <View style={{ flexDirection: 'row' }}>
            {week.map((date) => {
              const choreCount = (chores[date] ?? []).length;
              const dots = dayKinds(dayRoles(data, date, choreCount));
              const selected = date === props.selected;
              return (
                <TripSource
                  key={date}
                  date={date}
                  style={{ flex: 1, opacity: refused(date) ? PALE_OPACITY : 1 }}
                >
                  {(guardPress) => (
                    <Pressable
                      ref={(node) => props.registerDay(date, node)}
                      testID={`month-day-${date}`}
                      accessibilityRole="button"
                      accessibilityLabel={dayLabel(data, date, choreCount)}
                      accessibilityState={{ selected }}
                      onPress={guardPress(() => props.onOpenDay(date))}
                      style={(state) => [
                        { alignItems: 'center', paddingVertical: 4, minHeight: 48 },
                        keyboardFocusRing(theme, (state as PressState).focused),
                      ]}
                    >
                      <RangeMark date={date} />
                      <DayNumber
                        date={date}
                        inMonth={date.slice(0, 7) === month}
                        selected={selected}
                        isToday={date === data.today}
                        size={32}
                      />
                      <View
                        style={{ flexDirection: 'row', gap: 3, height: 8, alignItems: 'center' }}
                      >
                        {dots.map((role) => (
                          <KindDot key={role} kind={role} size={5} />
                        ))}
                      </View>
                    </Pressable>
                  )}
                </TripSource>
              );
            })}
          </View>
          <StripeLines week={week} data={data} />
        </WeekRowTarget>
      ))}
    </View>
  );
}

/**
 * The month from 700 px (spec 0021, REQ-002): like the week, without frame or vertical lines;
 * every day a tile with round corners and 4 px between them, a hairline between the weeks, today
 * tinted with its number in the accent, other months' days with a muted number. Trip stripes run
 * on under the day numbers. On the desktop the weeks share the window's height and a day shows as
 * many lines as fit (REQ-001); with a mouse "+" adds to the day (REQ-003). With the household row
 * the day's chores stand under its entries and count in "+n weitere" (REQ-017).
 */
function MonthGridDesktop(props: MonthViewProps) {
  const theme = useTheme();
  const fine = useFinePointer();
  const refused = useRefusedDays();
  const c = theme.colors;
  const { data } = props;
  const weeks = monthGrid(props.monthStart);
  const month = props.monthStart.slice(0, 7);
  const first = weeks[0]?.[0] ?? props.monthStart;
  const last = weeks[weeks.length - 1]?.[6] ?? props.monthStart;
  const chores = props.showHousehold ? data.householdRow(first, last) : {};
  const presetSlot = addPresetSlot(data.slots);
  // The day under the mouse: its tile lightens and shows "+".
  const [hovered, setHovered] = useState<ISODate | null>(null);
  const [headsHeight, setHeadsHeight] = useState(0);
  // The height of each week's entry area, measured once the weeks share a fixed height.
  const [areas, setAreas] = useState<Record<ISODate, number>>({});
  const share =
    props.height === undefined
      ? undefined
      : sharedHeight(props.height - GRID_END - headsHeight, weeks.length, 0);
  const hover = fine
    ? (date: ISODate) => ({
        onPointerEnter: () => setHovered(date),
        onPointerLeave: () => setHovered((current) => (current === date ? null : current)),
      })
    : () => ({});
  const column = (date: ISODate): ViewStyle => ({
    flex: 1,
    minWidth: 0,
    marginHorizontal: TILE_GAP,
    opacity: refused(date) ? PALE_OPACITY : 1,
  });

  return (
    <View style={{ marginBottom: GRID_END }} testID="month-grid">
      <WeekdayHeads long={props.longWeekdays} onHeight={setHeadsHeight} />
      {weeks.map((week, index) => {
        const weekFirst = week[0] ?? first;
        const weekLast = week[6] ?? last;
        const segments = data.stripes.flatMap((stripe) => {
          const segment = stripeSegment(stripe, weekFirst, weekLast);
          return segment ? [{ stripe, segment }] : [];
        });
        // At least three lines and "+n weitere" (Decision 1).
        const rowMin =
          2 * ROW_PAD +
          NUMBER_ROW +
          segments.length * STRIPE_ROW +
          3 * LINE_CHORE +
          MORE_HEIGHT +
          CELL_END;
        const rowHeight = share === undefined ? undefined : Math.max(share, rowMin);
        const area = rowHeight === undefined ? undefined : areas[weekFirst];
        return (
          <WeekRowTarget
            key={weekFirst}
            dates={week}
            style={[
              {
                paddingVertical: ROW_PAD,
                borderTopWidth: index === 0 ? 0 : 1,
                borderColor: c.border,
              },
              rowHeight === undefined ? null : { height: rowHeight },
            ]}
          >
            <DayTiles week={week} today={data.today} hovered={hovered} refused={refused} />
            <View style={{ flexDirection: 'row' }}>
              {week.map((date) => {
                const choreCount = (chores[date] ?? []).length;
                const selected = date === props.selected;
                return (
                  <View key={date} style={column(date)} {...hover(date)}>
                    <TripSource date={date}>
                      {(guardPress) => (
                        <Pressable
                          ref={(node) => props.registerDay(date, node)}
                          testID={`month-day-${date}`}
                          accessibilityRole="button"
                          accessibilityLabel={dayLabel(data, date, choreCount)}
                          accessibilityState={{ selected }}
                          onPress={guardPress(() => props.onOpenDay(date))}
                          style={(state) => [
                            {
                              paddingHorizontal: 4,
                              paddingTop: 4,
                              minHeight: NUMBER_ROW,
                              alignItems: 'flex-start',
                            },
                            keyboardFocusRing(theme, (state as PressState).focused),
                          ]}
                        >
                          <DayNumber
                            date={date}
                            inMonth={date.slice(0, 7) === month}
                            selected={selected}
                            isToday={date === data.today}
                            todayAccent
                            size={26}
                          />
                        </Pressable>
                      )}
                    </TripSource>
                    {fine && presetSlot ? (
                      <AddToDay
                        date={date}
                        visible={hovered === date}
                        onPress={() => props.onAdd({ date, slotId: presetSlot, slotChosen: false })}
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>
            {segments.length > 0 ? (
              <View>
                {segments.map(({ stripe, segment }) => (
                  <View key={stripe.key} style={{ height: 26, marginVertical: 1 }}>
                    <View
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${(segment.start / 7) * 100}%`,
                        width: `${((segment.end - segment.start + 1) / 7) * 100}%`,
                        paddingHorizontal: TILE_GAP,
                      }}
                    >
                      <TripStripeView
                        stripe={stripe}
                        data={data}
                        separator=" · "
                        continuesBefore={segment.continuesBefore}
                        continuesAfter={segment.continuesAfter}
                        onPress={props.onOpenStripe}
                      />
                    </View>
                  </View>
                ))}
                <PaleDays week={week} refused={refused} />
              </View>
            ) : null}
            <View
              style={[{ flexDirection: 'row' }, rowHeight === undefined ? null : { flex: 1 }]}
              onLayout={(event) => {
                const height = event.nativeEvent.layout.height;
                setAreas((previous) =>
                  previous[weekFirst] === height ? previous : { ...previous, [weekFirst]: height },
                );
              }}
            >
              {week.map((date) => {
                const entries = data.dayEntries(date);
                const dayChores = chores[date] ?? [];
                const lines = [
                  ...entries.map(() => LINE_ENTRY),
                  ...dayChores.map(() => LINE_CHORE),
                ];
                const shown = fittingItems(lines, (area ?? 0) - CELL_END, MORE_HEIGHT);
                const more = lines.length - shown;
                const shownEntries = entries.slice(0, shown);
                const shownChores = dayChores.slice(0, Math.max(0, shown - entries.length));
                return (
                  <View
                    key={date}
                    style={[
                      column(date),
                      { overflow: 'hidden' },
                      rowHeight === undefined ? { minHeight: 96 } : null,
                    ]}
                    testID={`month-cell-${date}`}
                    {...hover(date)}
                  >
                    <TripSource date={date} style={FILL}>
                      {(guardPress) => (
                        <Pressable
                          {...QUIET_PRESSABLE}
                          focusable={false}
                          accessible={false}
                          testID={`month-day-${date}-area`}
                          onPress={guardPress(() => props.onOpenDay(date))}
                          style={FILL}
                        />
                      )}
                    </TripSource>
                    <View
                      pointerEvents="box-none"
                      style={{ gap: 2, paddingHorizontal: 4, paddingBottom: CELL_END }}
                    >
                      {shownEntries.map((entry) => (
                        <EntryLine
                          key={entry.id}
                          entry={entry}
                          data={data}
                          compact
                          onPress={props.onOpenEntry}
                        />
                      ))}
                      {shownChores.length > 0 ? (
                        <View testID={`month-chores-${date}`} style={{ gap: 2 }}>
                          <HouseholdDay
                            items={shownChores}
                            data={data}
                            compact
                            onOpenChore={props.onOpenChore}
                          />
                        </View>
                      ) : null}
                      {more > 0 ? (
                        <MoreLink date={date} more={more} onPress={() => props.onOpenDay(date)} />
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </WeekRowTarget>
        );
      })}
    </View>
  );
}

/**
 * "+" top right of a desktop day (spec 0021, REQ-003, AC-008): shows while the mouse is over the
 * day and on keyboard focus, opens the add window for that day with "Abend" preselected; outside
 * the day's trip source, so dragging on it draws no trip. Offline greyed out, and a click shows
 * the hint "Offline – zum Bearbeiten brauchst du Netz" (AC-009) instead of reaching the day.
 */
function AddToDay(props: { date: ISODate; visible: boolean; onPress: () => void }) {
  const theme = useTheme();
  const hover = useHover();
  const online = useOnlineOnly();
  return (
    <Pressable
      testID={`month-add-${props.date}`}
      accessibilityRole="button"
      accessibilityLabel={`Hinzufügen am ${formatLongDate(props.date)}`}
      accessibilityHint={online.hint}
      accessibilityState={{ disabled: online.disabled }}
      onPress={
        online.disabled
          ? () => toast.show({ message: online.hint ?? OFFLINE_EDIT_HINT })
          : props.onPress
      }
      style={(state) => {
        const { hovered, focused } = state as PressState;
        const shown = props.visible || focused === true;
        return [
          {
            position: 'absolute',
            top: 3,
            right: 3,
            width: ADD_SIZE,
            height: ADD_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.shape.radius.control,
            backgroundColor:
              hover(hovered) && !online.disabled ? theme.colors.surface : 'transparent',
            opacity: shown ? (online.disabled ? 0.45 : 1) : 0,
          },
          keyboardFocusRing(theme, focused),
        ];
      }}
    >
      <Icon name="plus" size={16} color="muted" />
    </Pressable>
  );
}

/**
 * Behind a desktop week, the full height of each day including the rows of trip stripes: its
 * tile, tinted today and lighter under the mouse, and the marking of a trip being drawn (REQ-007).
 */
function DayTiles(props: {
  week: ISODate[];
  today: ISODate;
  hovered: ISODate | null;
  refused: (date: ISODate) => boolean;
}) {
  const c = useTheme().colors;
  return (
    <View
      pointerEvents="none"
      style={[FILL, { flexDirection: 'row', top: ROW_PAD, bottom: ROW_PAD }]}
    >
      {props.week.map((date) => (
        <View
          key={date}
          testID={date === props.today ? 'month-today-tile' : undefined}
          style={{
            flex: 1,
            marginHorizontal: TILE_GAP,
            borderRadius: CELL_RADIUS,
            backgroundColor:
              date === props.today
                ? c.accentSoft
                : date === props.hovered
                  ? c.surfaceSunken
                  : 'transparent',
            opacity: props.refused(date) ? PALE_OPACITY : 1,
          }}
        >
          <RangeMark date={date} />
        </View>
      ))}
    </View>
  );
}

/**
 * Over the trip stripes of a desktop week, days the dragged entry cannot go to look pale too
 * (AC-015): a stripe spans several days, so the page colour laid over a day fades its part.
 */
function PaleDays(props: { week: ISODate[]; refused: (date: ISODate) => boolean }) {
  const c = useTheme().colors;
  if (!props.week.some(props.refused)) return null;
  return (
    <View pointerEvents="none" style={[FILL, { flexDirection: 'row' }]}>
      {props.week.map((date) => (
        <View
          key={date}
          testID={props.refused(date) ? `month-pale-${date}` : undefined}
          style={{
            flex: 1,
            backgroundColor: props.refused(date) ? c.bg : 'transparent',
            opacity: 1 - PALE_OPACITY,
          }}
        />
      ))}
    </View>
  );
}

/** "+2 weitere": opens the day window with every entry of the day (spec 0016, AC-024). */
function MoreLink(props: { date: ISODate; more: number; onPress: () => void }) {
  return (
    <View style={{ alignSelf: 'flex-start' }}>
      <Button
        label={`+${props.more} weitere`}
        variant="link"
        size="sm"
        testID={`month-more-${props.date}`}
        hint={`${props.more} weitere Einträge am ${formatLongDate(props.date)}`}
        onPress={props.onPress}
      />
    </View>
  );
}
