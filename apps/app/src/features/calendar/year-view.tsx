import {
  dateRangeLabel,
  monthGrid,
  monthName,
  parseISODate,
  sharedHeight,
  startOfMonth,
  stripesOfYear,
  yearDayTrip,
  yearMonths,
  type TripStripe,
  type HouseholdRowItem,
  type ISODate,
} from '@housekeeping/core';
import {
  hatchStyle,
  Icon,
  KindDot,
  List,
  ListRow,
  Section,
  Text,
  keyboardFocusRing,
  pressedWithFinger,
  useFinePointer,
  useHover,
  useTheme,
  withAlpha,
} from '@housekeeping/ui';
import type { ReactNode } from 'react';
import { Pressable, View, type GestureResponderEvent, type HostInstance } from 'react-native';

import { HATCH_ALPHA, StripeBadges, stripeA11y, stripeLine } from './calendar-parts';
import { dayLabel, stripeWho, type CalendarData } from './calendar-data';
import {
  CalendarSwipe,
  PALE_OPACITY,
  RangeMark,
  TripSource,
  WeekRowTarget,
  useRefusedDays,
} from './calendar-drag';
import { useScrollTo } from './calendar-scroll';

export interface YearViewProps {
  data: CalendarData;
  year: number;
  columns: number;
  /** The day of the open day window; it is marked. */
  selected: ISODate | undefined;
  /**
   * A click on a day opens the day window (spec 0016, AC-023). A finger opens the day's month
   * instead: the small days are too close to hit (spec 0031, REQ-031).
   */
  onOpenDay: (date: ISODate) => void;
  /** Every day cell registers here, e.g. to get the focus back when the day window closes. */
  registerDay: (date: ISODate, node: HostInstance | null) => void;
  /** A tap on the month name opens the month. */
  onOpenMonth: (monthStart: ISODate) => void;
  onOpenStripe: (stripe: TripStripe) => void;
  /**
   * Phones: a sideways swipe over the months pages the year; under them it is left to the view
   * tabs (spec 0034, REQ-006).
   */
  gridSwipe: { enabled: boolean; onSwipe: (step: 1 | -1) => void };
  /** Under the grid, before the year's trips: the strip "Vorgemerkt" (spec 0016, REQ-003). */
  belowGrid?: ReactNode;
  /** Desktop: the grid's room in px down to "Vorgemerkt" (spec 0021, REQ-001); else natural. */
  height?: number;
  /**
   * Desktop: the grid fills the window and the page never scrolls to a month, also not in the
   * first frame before `height` is measured (spec 0031, ui-verify).
   */
  fillsWindow: boolean;
  /** Phones and tablets: the month put under the tabs whenever `scrollRequest` changes (REQ-004). */
  scrollMonth: ISODate;
  scrollRequest: number;
}

const ROW_GAP = 14;
// A tall window stretches a month's weeks only up to this (spec 0035, REQ-003); the month itself
// then stops at its padding, name (32), weekday initials (12) and six such weeks.
const DAY_ROW_MAX = 28;
const MONTH_MAX = 2 * 6 + 32 + 12 + 6 * DAY_ROW_MAX;

const WEEKDAY_INITIALS = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
const TINT_ALPHA = '33';

/**
 * The year (spec 0010, REQ-005): twelve small months with a dot on days with entries and trips
 * tinted, then the year's trips as a list. A day with chores carries the dot "Aufgabe", always,
 * without a switch (spec 0021, REQ-017). A click on a day opens the day window, a tap on the
 * month name the month (spec 0016, AC-023); a finger on a day opens its month (spec 0031,
 * REQ-031). On the desktop the rows of months share the window's height
 * (spec 0021, REQ-001); elsewhere the page opens at the current month (REQ-004).
 */
export function YearView(props: YearViewProps) {
  const { data } = props;
  const stripes = stripesOfYear(data.stripes, props.year);
  const plannedDays = new Set(
    data.entries.flatMap((entry) =>
      entry.date !== null && entry.date.startsWith(String(props.year)) ? [entry.date] : [],
    ),
  );
  const months = yearMonths(props.year);
  const rows = Array.from({ length: Math.ceil(months.length / props.columns) }, (_, row) =>
    months.slice(row * props.columns, (row + 1) * props.columns),
  );
  const year = String(props.year).padStart(4, '0');
  const chores = data.householdRow(`${year}-01-01`, `${year}-12-31`);
  const fill = props.height !== undefined;
  const rowHeight =
    props.height === undefined
      ? undefined
      : sharedHeight(props.height - (rows.length - 1) * ROW_GAP, rows.length, 0, MONTH_MAX);
  const registerMonth = useScrollTo({
    enabled: !props.fillsWindow,
    request: props.scrollRequest,
    period: year,
    target: startOfMonth(props.scrollMonth),
    first: months[0] ?? props.scrollMonth,
  });

  return (
    <View testID="year-view">
      <CalendarSwipe {...props.gridSwipe}>
        <View style={{ gap: ROW_GAP }}>
          {rows.map((row) => (
            <View key={row[0]} style={{ flexDirection: 'row', gap: 10, minHeight: rowHeight }}>
              {row.map((monthStart) => (
                <View
                  key={monthStart}
                  ref={(node) => registerMonth(monthStart, node)}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <MiniMonth
                    monthStart={monthStart}
                    data={data}
                    plannedDays={plannedDays}
                    chores={chores}
                    fill={fill}
                    selected={props.selected}
                    onOpenDay={props.onOpenDay}
                    registerDay={props.registerDay}
                    onOpenMonth={() => props.onOpenMonth(monthStart)}
                  />
                </View>
              ))}
            </View>
          ))}
        </View>
      </CalendarSwipe>
      {props.belowGrid}
      <View style={{ marginTop: 24 }}>
        <Section title={`Reisen ${props.year}`} testID="year-trips">
          {stripes.length === 0 ? (
            <Text color="muted" testID="year-trips-empty">
              {`Keine Reisen ${props.year}`}
            </Text>
          ) : (
            <List>
              {stripes.map((stripe) => (
                <ListRow
                  key={stripe.key}
                  title={[
                    stripe.household ? 'Ganzer Haushalt' : undefined,
                    dateRangeLabel(stripe.from, stripe.to),
                    stripe.note,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  subtitle={
                    [
                      stripe.household ? undefined : stripeWho(stripe, data.membersById),
                      stripe.draft ? 'Entwurf' : undefined,
                    ]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  leading={<StripeBadges stripe={stripe} members={data.members} />}
                  trailing={
                    data.hasPackingList(stripe) ? (
                      <View testID={`year-trip-${stripe.tripId}-bag`}>
                        <Icon name="luggage" size={16} color="muted" />
                      </View>
                    ) : undefined
                  }
                  accessibilityLabel={stripeA11y(
                    stripe,
                    data.membersById,
                    data.hasPackingList(stripe),
                  )}
                  onPress={() => props.onOpenStripe(stripe)}
                  testID={`year-trip-${stripe.tripId}`}
                />
              ))}
            </List>
          )}
        </Section>
      </View>
    </View>
  );
}

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

function MiniMonth(props: {
  monthStart: ISODate;
  data: CalendarData;
  plannedDays: Set<ISODate>;
  chores: Record<ISODate, HouseholdRowItem[]>;
  /** The month stretches to the height of its row (desktop). */
  fill: boolean;
  selected: ISODate | undefined;
  onOpenDay: (date: ISODate) => void;
  registerDay: (date: ISODate, node: HostInstance | null) => void;
  onOpenMonth: () => void;
}) {
  const theme = useTheme();
  const hover = useHover();
  const fine = useFinePointer();
  const month = props.monthStart.slice(0, 7);
  const index = parseISODate(props.monthStart).getMonth();
  const name = monthName(index);
  return (
    <View testID={`year-month-${index + 1}`} style={{ padding: 6, flexGrow: 1 }}>
      <Pressable
        testID={`year-month-${index + 1}-open`}
        accessibilityRole="button"
        accessibilityLabel={`${name} öffnen`}
        onPress={props.onOpenMonth}
        style={(state) => {
          const { pressed, hovered, focused } = state as PressState;
          return [
            {
              alignSelf: 'flex-start',
              justifyContent: 'center',
              minHeight: 32,
              marginLeft: -6,
              paddingHorizontal: 6,
              borderRadius: theme.shape.radius.control,
              backgroundColor: hover(hovered) ? theme.colors.surfaceSunken : 'transparent',
              opacity: pressed ? 0.7 : 1,
            },
            keyboardFocusRing(theme, focused),
          ];
        }}
      >
        <Text variant="smallStrong">{name.toUpperCase()}</Text>
      </Pressable>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAY_INITIALS.map((initial, position) => (
          <Text
            key={position}
            variant="caption"
            color="muted"
            style={{ flex: 1, textAlign: 'center', fontSize: 9, lineHeight: 12 }}
          >
            {initial}
          </Text>
        ))}
      </View>
      {monthGrid(props.monthStart).map((week) => (
        <WeekRowTarget
          key={week[0]}
          dates={week.map((date) => (date.slice(0, 7) === month ? date : null))}
          style={[
            { flexDirection: 'row' },
            props.fill ? { flexGrow: 1, maxHeight: DAY_ROW_MAX } : null,
          ]}
        >
          {week.map((date) =>
            date.slice(0, 7) === month ? (
              <MiniDay
                key={date}
                date={date}
                data={props.data}
                planned={props.plannedDays.has(date)}
                choreCount={(props.chores[date] ?? []).length}
                fill={props.fill}
                selected={date === props.selected}
                onPress={(event) =>
                  pressedWithFinger(event, fine) ? props.onOpenMonth() : props.onOpenDay(date)
                }
                register={(node) => props.registerDay(date, node)}
              />
            ) : (
              <View key={date} style={{ flex: 1 }} />
            ),
          )}
        </WeekRowTarget>
      ))}
    </View>
  );
}

function MiniDay(props: {
  date: ISODate;
  data: CalendarData;
  planned: boolean;
  choreCount: number;
  fill: boolean;
  selected: boolean;
  onPress: (event: GestureResponderEvent) => void;
  register: (node: HostInstance | null) => void;
}) {
  const theme = useTheme();
  const refusedDays = useRefusedDays();
  const coverage = yearDayTrip(props.date, props.data.stripes);
  const member = coverage.kind === 'one' ? props.data.membersById[coverage.memberId] : undefined;
  const background =
    coverage.kind === 'household'
      ? theme.colors.surfaceSunken
      : member
        ? `${member.color}${TINT_ALPHA}`
        : 'transparent';
  // Spec 0030, AC-018: a day only drafts cover is hatched instead of filled.
  const draft = coverage.kind !== 'none' && coverage.draft === true;
  const hatch =
    draft && coverage.kind !== 'several'
      ? hatchStyle(withAlpha(member?.color ?? theme.colors.textMuted, HATCH_ALPHA))
      : null;
  const lines =
    coverage.kind === 'several'
      ? coverage.memberIds.flatMap((id) => props.data.membersById[id] ?? [])
      : [];
  const isToday = props.date === props.data.today;
  const c = theme.colors;
  // Days the dragged entry cannot go to are pale (spec 0016, AC-015).
  const refused = refusedDays(props.date);
  return (
    <TripSource date={props.date} style={{ flex: 1, opacity: refused ? PALE_OPACITY : 1 }}>
      {(guardPress) => (
        <Pressable
          ref={(node) => props.register(node)}
          testID={`year-day-${props.date}`}
          accessibilityRole="button"
          accessibilityLabel={dayLabel(props.data, props.date, props.choreCount)}
          aria-selected={props.selected}
          // Spec 0031, REQ-031: the hit area does not grow past the day (no 44-pt ::before).
          {...({ dataSet: { dense: true } } as object)}
          onPress={guardPress(props.onPress)}
          style={(state) => [
            // At least 24 × 24 px to click (spec 0019, REQ-009, AC-028); the day stays small.
            {
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 24,
              paddingVertical: 1,
              backgroundColor: background,
            },
            hatch,
            props.fill ? { flexGrow: 1 } : null,
            keyboardFocusRing(theme, (state as PressState).focused),
          ]}
        >
          <RangeMark date={props.date} />
          <View
            style={{
              alignSelf: 'stretch',
              alignItems: 'center',
              borderRadius: 3,
              backgroundColor: props.selected ? c.text : 'transparent',
            }}
          >
            <Text
              variant="caption"
              color={props.selected ? undefined : isToday ? 'accent' : 'text'}
              style={[{ fontSize: 12, lineHeight: 15 }, props.selected ? { color: c.bg } : null]}
            >
              {String(parseISODate(props.date).getDate())}
            </Text>
          </View>
          <View
            style={{ flexDirection: 'row', gap: 2, height: 3, justifyContent: 'center' }}
            testID={props.choreCount > 0 ? `year-chore-${props.date}` : undefined}
          >
            {props.planned ? (
              <View
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: theme.colors.textMuted,
                }}
              />
            ) : null}
            {props.choreCount > 0 ? <KindDot kind="chore" size={3} /> : null}
          </View>
          {lines.map((person) => (
            <View
              key={person.id}
              style={{
                alignSelf: 'stretch',
                height: 1.5,
                marginTop: 1,
                ...stripeLine(person.color, draft, 'top', 1.5),
              }}
            />
          ))}
        </Pressable>
      )}
    </TripSource>
  );
}
