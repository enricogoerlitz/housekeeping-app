import {
  dayKinds,
  formatLongDate,
  isSelectableMoveDay,
  monthGrid,
  overflow,
  parseISODate,
  stripeSegment,
  type TripStripe,
  type ISODate,
  type MealPlanEntry,
} from '@housekeeping/core';
import { Button, KindDot, Text, keyboardFocusRing, useTheme } from '@housekeeping/ui';
import { Platform, Pressable, View, type HostInstance, type ViewStyle } from 'react-native';

import { TripStripeView, EntryLine, useStripeColors } from './calendar-parts';
import { dayLabel, dayRoles, type CalendarData } from './calendar-data';
import {
  PALE_OPACITY,
  RangeMark,
  TripSource,
  WeekRowTarget,
  useCalendarDrag,
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
  onOpenEntry: (entry: MealPlanEntry) => void;
  onOpenStripe: (stripe: TripStripe) => void;
}

const WEEKDAY_HEADS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

// The free area of a desktop day is a second way to the same day window as its day number; it is
// not a separate stop for the keyboard or a screen reader.
const QUIET_PRESSABLE =
  Platform.OS === 'web' ? ({ tabIndex: -1, 'aria-hidden': true } as object) : {};

const FILL: ViewStyle = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 };

function tasksLabel(count: number): string {
  return count === 1 ? '1 Aufgabe' : `${count} Aufgaben`;
}

/**
 * The month (spec 0010, REQ-004; D20). A tap on a day opens the day window (spec 0016, REQ-006);
 * there is no day list under the grid and no small menu behind "+n weitere" any more. Each week
 * is one drop target resolved to its days (REQ-002); holding or dragging over days from a free
 * area or a day number draws a trip (REQ-007).
 */
export function MonthView(props: MonthViewProps) {
  return props.wide ? <MonthGridDesktop {...props} /> : <MonthPhone {...props} />;
}

function WeekdayHeads() {
  return (
    <View style={{ flexDirection: 'row' }}>
      {WEEKDAY_HEADS.map((head) => (
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
          backgroundColor: colors.edge,
        }}
      />
    </View>
  );
}

/** The day number in a circle: filled while its day window is open, ringed today. */
function DayNumber(props: {
  date: ISODate;
  inMonth: boolean;
  selected: boolean;
  isToday: boolean;
  size: number;
}) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View
      style={{
        width: props.size,
        height: props.size,
        borderRadius: props.size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: props.selected ? c.text : 'transparent',
        borderWidth: props.isToday && !props.selected ? 1.5 : 0,
        borderColor: c.accent,
      }}
    >
      <Text
        variant="smallStrong"
        style={{ color: props.selected ? c.bg : props.inMonth ? c.text : c.textMuted }}
      >
        {String(parseISODate(props.date).getDate())}
      </Text>
    </View>
  );
}

/** Days the dragged entry cannot go to are pale (AC-015). */
function useRefused(): (date: ISODate) => boolean {
  const { bounds } = useCalendarDrag();
  return (date) => bounds !== null && !isSelectableMoveDay(bounds, date);
}

function MonthPhone(props: MonthViewProps) {
  const theme = useTheme();
  const refused = useRefused();
  const { data } = props;
  const weeks = monthGrid(props.monthStart);
  const month = props.monthStart.slice(0, 7);
  const first = weeks[0]?.[0] ?? props.monthStart;
  const last = weeks[weeks.length - 1]?.[6] ?? props.monthStart;
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

function MonthGridDesktop(props: MonthViewProps) {
  const theme = useTheme();
  const refused = useRefused();
  const c = theme.colors;
  const { data } = props;
  const weeks = monthGrid(props.monthStart);
  const month = props.monthStart.slice(0, 7);
  const first = weeks[0]?.[0] ?? props.monthStart;
  const last = weeks[weeks.length - 1]?.[6] ?? props.monthStart;
  const chores = props.showHousehold ? data.householdRow(first, last) : {};
  // Grid lines, today's tint and the trip marking lie behind the week (DayColumns), so they also
  // run through the rows of trip stripes.
  const cell = (date: ISODate): ViewStyle => ({
    flex: 1,
    minWidth: 0,
    opacity: refused(date) ? PALE_OPACITY : 1,
  });

  return (
    <View
      style={{ marginBottom: 24, borderTopWidth: 1, borderLeftWidth: 1, borderColor: c.border }}
      testID="month-grid"
    >
      <View style={{ borderRightWidth: 1, borderColor: c.border }}>
        <WeekdayHeads />
      </View>
      {weeks.map((week) => {
        const weekFirst = week[0] ?? first;
        const weekLast = week[6] ?? last;
        const segments = data.stripes.flatMap((stripe) => {
          const segment = stripeSegment(stripe, weekFirst, weekLast);
          return segment ? [{ stripe, segment }] : [];
        });
        return (
          <WeekRowTarget
            key={weekFirst}
            dates={week}
            style={{ borderTopWidth: 1, borderColor: c.border }}
          >
            <DayColumns week={week} today={data.today} refused={refused} />
            <View style={{ flexDirection: 'row' }}>
              {week.map((date) => {
                const choreCount = (chores[date] ?? []).length;
                const selected = date === props.selected;
                return (
                  <View key={date} style={cell(date)}>
                    <TripSource date={date}>
                      {(guardPress) => (
                        <Pressable
                          ref={(node) => props.registerDay(date, node)}
                          testID={`month-day-${date}`}
                          accessibilityRole="button"
                          accessibilityLabel={dayLabel(data, date, choreCount)}
                          accessibilityState={{ selected }}
                          onPress={guardPress(() => props.onOpenDay(date))}
                          style={(state) => {
                            const { hovered, focused } = state as PressState;
                            return [
                              {
                                paddingHorizontal: 4,
                                paddingTop: 4,
                                alignItems: 'flex-start',
                                backgroundColor: hovered ? c.surfaceSunken : 'transparent',
                              },
                              keyboardFocusRing(theme, focused),
                            ];
                          }}
                        >
                          <DayNumber
                            date={date}
                            inMonth={date.slice(0, 7) === month}
                            selected={selected}
                            isToday={false}
                            size={26}
                          />
                        </Pressable>
                      )}
                    </TripSource>
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
                        paddingHorizontal: 2,
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
            <View style={{ flexDirection: 'row' }}>
              {week.map((date) => {
                const { shown, more } = overflow(data.dayEntries(date));
                const choreCount = (chores[date] ?? []).length;
                return (
                  <View
                    key={date}
                    style={[cell(date), { minHeight: 96 }]}
                    testID={`month-cell-${date}`}
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
                      style={{ gap: 2, paddingHorizontal: 4, paddingBottom: 6 }}
                    >
                      {props.showHousehold && choreCount > 0 ? (
                        <View pointerEvents="none">
                          <Text variant="caption" color="muted" testID={`month-tasks-${date}`}>
                            {tasksLabel(choreCount)}
                          </Text>
                        </View>
                      ) : null}
                      {shown.map((entry) => (
                        <EntryLine
                          key={entry.id}
                          entry={entry}
                          data={data}
                          compact
                          onPress={props.onOpenEntry}
                        />
                      ))}
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
 * Behind a desktop week, the full height of each day including the rows of trip stripes: its grid
 * line, the tint of today and the marking of a trip being drawn (REQ-007).
 */
function DayColumns(props: {
  week: ISODate[];
  today: ISODate;
  refused: (date: ISODate) => boolean;
}) {
  const c = useTheme().colors;
  return (
    <View pointerEvents="none" style={[FILL, { flexDirection: 'row' }]}>
      {props.week.map((date) => (
        <View
          key={date}
          style={{
            flex: 1,
            borderRightWidth: 1,
            borderColor: c.border,
            backgroundColor: date === props.today ? c.accentSoft : 'transparent',
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
