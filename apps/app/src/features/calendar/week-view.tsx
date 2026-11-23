import {
  addDays,
  addPresetSlot,
  dayMonthLabel,
  sharedHeight,
  stripeLabelDate,
  stripeSegment,
  stripesOn,
  weekDates,
  type TripStripe,
  type Id,
  type ISODate,
  type MealPlanEntry,
} from '@housekeeping/core';
import {
  Badge,
  Button,
  Icon,
  Text,
  space,
  stickyTopStyle,
  useHover,
  useTheme,
} from '@housekeeping/ui';
import { useState } from 'react';
import { Platform, Pressable, View, type HostInstance } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import type { AddTarget } from '@/features/meal-plan/add-entry-sheet';

import {
  CELL_RADIUS,
  TripStripeView,
  EntryLine,
  HouseholdDay,
  useStripeColors,
  stripeLine,
} from './calendar-parts';
import type { CalendarData } from './calendar-data';
import { DayHeadTarget, RangeMark, SlotTarget, TripSource, useLiftedKind } from './calendar-drag';
import { useScrollTo } from './calendar-scroll';

export interface WeekViewProps {
  data: CalendarData;
  /** Monday of the shown week. */
  weekStart: ISODate;
  showHousehold: boolean;
  wide: boolean;
  /** Desktop: the grid's room in px down to "Vorgemerkt" (spec 0021, REQ-001); else natural. */
  height?: number;
  /** Phones: the day put under the tabs whenever `scrollRequest` changes (REQ-004). */
  scrollDay: ISODate;
  scrollRequest: number;
  onAdd: (target: AddTarget) => void;
  onOpenEntry: (entry: MealPlanEntry) => void;
  onOpenStripe: (stripe: TripStripe) => void;
  onOpenChore: (choreId: Id) => void;
}

const LABEL_WIDTH = 92;
/** Space under the grid, between its rows and the chrome of a Tageszeit row (line and padding). */
const GRID_END = 24;
const ROW_GAP = 6;
const SLOT_ROW_CHROME = 5;
/** A Tageszeit is at least this high when the desktop grid fills the window (Decision 1). */
const SLOT_MIN_FILL = 120;
const SLOT_MIN = 64;

/** The week (spec 0010, REQ-002): desktop as a grid of days and rows, phones as a list of days. */
export function WeekView(props: WeekViewProps) {
  return props.wide ? <WeekGrid {...props} /> : <WeekList {...props} />;
}

function DayHead(props: {
  date: ISODate;
  today: ISODate;
  upper?: boolean;
  register?: (node: HostInstance | null) => void;
}) {
  const isToday = props.date === props.today;
  const label = dayMonthLabel(props.date);
  return (
    <View
      ref={(node) => props.register?.(node)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      testID={`day-${props.date}`}
    >
      <Text
        variant="smallStrong"
        heading
        color={isToday ? 'accent' : props.date < props.today ? 'muted' : 'text'}
      >
        {props.upper ? label.toUpperCase() : label}
      </Text>
      {isToday ? <Badge label="Heute" tone="accent" /> : null}
    </View>
  );
}

/** "+ Hinzufügen" of a day without a Tageszeit (phones); "Abend" is preselected (REQ-007). */
function AddToDay(props: { date: ISODate; slotId: Id | undefined; onAdd: WeekViewProps['onAdd'] }) {
  const online = useOnlineOnly();
  if (!props.slotId) return null;
  const slotId = props.slotId;
  return (
    <Button
      label="Hinzufügen"
      icon="plus"
      variant="link"
      size="sm"
      disabled={online.disabled}
      hint={online.hint}
      testID={`add-${props.date}`}
      onPress={() => props.onAdd({ date: props.date, slotId, slotChosen: false })}
    />
  );
}

/** An empty or filled cell of the desktop grid: "+" shows on hover and on focus. */
function AddCell(props: { date: ISODate; slotId: Id; onAdd: WeekViewProps['onAdd'] }) {
  const theme = useTheme();
  const hover = useHover();
  const online = useOnlineOnly();
  return (
    <Pressable
      testID={`add-${props.date}-${props.slotId}`}
      accessibilityRole="button"
      accessibilityLabel="Hinzufügen"
      accessibilityHint={online.hint}
      accessibilityState={{ disabled: online.disabled }}
      disabled={online.disabled}
      onPress={() => props.onAdd({ date: props.date, slotId: props.slotId, slotChosen: true })}
      style={(state) => {
        const { hovered, focused } = state as { hovered?: boolean; focused?: boolean };
        return {
          flexGrow: 1,
          minHeight: 28,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          opacity: hover(hovered) || focused ? 1 : 0,
          backgroundColor: hover(hovered) ? theme.colors.surfaceSunken : 'transparent',
        };
      }}
    >
      <Icon name="plus" size={16} color="muted" />
    </Pressable>
  );
}

function RowLabel(props: { children: string }) {
  return (
    <View style={{ width: LABEL_WIDTH, paddingTop: 4 }}>
      <Text variant="smallStrong" color="muted" numberOfLines={1}>
        {props.children}
      </Text>
    </View>
  );
}

function WeekGrid(props: WeekViewProps) {
  const theme = useTheme();
  const { data } = props;
  const dates = weekDates(props.weekStart);
  const first = dates[0] ?? props.weekStart;
  const last = dates[6] ?? addDays(props.weekStart, 6);
  const stripes = data.stripes.flatMap((stripe) => {
    const segment = stripeSegment(stripe, first, last);
    return segment ? [{ stripe, segment }] : [];
  });
  const chores = props.showHousehold ? data.householdRow(first, last) : {};
  const cell = (date: ISODate) => ({
    flex: 1,
    minWidth: 0,
    gap: 4,
    padding: 4,
    borderRadius: CELL_RADIUS,
    backgroundColor: date === data.today ? theme.colors.accentSoft : 'transparent',
  });
  // Day heads, trip and household row keep their natural height; the Tageszeiten share the rest.
  const [dayRowHeight, setDayRowHeight] = useState(0);
  const [rowsHeight, setRowsHeight] = useState(0);
  const hasRows = stripes.length > 0 || !!props.showHousehold;
  const headHeight = dayRowHeight + (hasRows ? ROW_GAP + rowsHeight : 0);
  const count = data.slots.length;
  const slotHeight =
    props.height === undefined
      ? SLOT_MIN
      : sharedHeight(
          props.height - GRID_END - headHeight - count * (ROW_GAP + SLOT_ROW_CHROME),
          count,
          SLOT_MIN_FILL,
        );

  return (
    <View style={{ marginBottom: GRID_END, gap: ROW_GAP }} testID="week-grid">
      {/* From 700 px a trip is drawn over the day heads (spec 0016, REQ-007). They stay at the
          top while the grid scrolls (spec 0030, REQ-001): a direct child of the whole grid. */}
      <View
        testID="week-day-heads"
        style={{
          flexDirection: 'row',
          gap: 4,
          ...stickyTopStyle(Platform.OS, theme.colors.bg),
        }}
        onLayout={(event) => setDayRowHeight(event.nativeEvent.layout.height)}
      >
        <View style={{ width: LABEL_WIDTH }} />
        {dates.map((date) => (
          <DayHeadTarget key={date} date={date} style={{ flex: 1, minWidth: 0 }}>
            <TripSource
              date={date}
              style={{ minHeight: 32, justifyContent: 'center', paddingHorizontal: space.xs }}
            >
              {() => (
                <>
                  <RangeMark date={date} />
                  <DayHead date={date} today={data.today} />
                </>
              )}
            </TripSource>
          </DayHeadTarget>
        ))}
      </View>
      {hasRows ? (
        <View
          style={{ gap: ROW_GAP }}
          onLayout={(event) => setRowsHeight(event.nativeEvent.layout.height)}
        >
          {stripes.length > 0 ? (
            <View style={{ flexDirection: 'row', gap: 4 }} testID="week-trip-row">
              <RowLabel>Reise</RowLabel>
              <View style={{ flex: 1, gap: 3 }}>
                {stripes.map(({ stripe, segment }) => (
                  <View key={stripe.key} style={{ position: 'relative', height: 26 }}>
                    <View
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${(segment.start / 7) * 100}%`,
                        width: `${((segment.end - segment.start + 1) / 7) * 100}%`,
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
              </View>
            </View>
          ) : null}
          {props.showHousehold ? (
            <View style={{ flexDirection: 'row', gap: 4 }} testID="household-row">
              <RowLabel>Haushalt</RowLabel>
              {dates.map((date) => (
                <View key={date} style={cell(date)} testID={`household-row-${date}`}>
                  {/* Full rows: a chore's name wraps onto two lines (spec 0021, AC-014). */}
                  <HouseholdDay
                    items={chores[date] ?? []}
                    data={data}
                    onOpenChore={props.onOpenChore}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {data.slots.map((slot) => (
        <View
          key={slot.id}
          style={{
            flexDirection: 'row',
            gap: 4,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            paddingTop: 4,
          }}
        >
          <RowLabel>{slot.name}</RowLabel>
          {dates.map((date) => (
            <SlotTarget
              key={date}
              date={date}
              slotId={slot.id}
              style={[cell(date), { minHeight: slotHeight }]}
              testID={`week-slot-${date}-${slot.id}`}
            >
              {data
                .dayEntries(date)
                .filter((entry) => entry.slotId === slot.id)
                .map((entry) => (
                  <EntryLine
                    key={entry.id}
                    entry={entry}
                    data={data}
                    withReminder
                    onPress={props.onOpenEntry}
                  />
                ))}
              <AddCell date={date} slotId={slot.id} onAdd={props.onAdd} />
            </SlotTarget>
          ))}
        </View>
      ))}
    </View>
  );
}

/** An empty Tageszeit shown as a place to drop an entry while one is dragged (AC-006). */
function EmptySlot() {
  const theme = useTheme();
  return (
    <View
      style={{
        minHeight: 36,
        borderRadius: theme.shape.radius.control,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: theme.colors.border,
      }}
    />
  );
}

/** The bars left of a phone's day: one per stripe of the week, in a fixed column. */
function StripeBars(props: { stripes: TripStripe[]; date: ISODate; data: CalendarData }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2, width: props.stripes.length * 5 }}>
      {props.stripes.map((stripe) => (
        <StripeBar
          key={stripe.key}
          stripe={stripe}
          on={stripe.from <= props.date && props.date <= stripe.to}
          data={props.data}
        />
      ))}
    </View>
  );
}

function StripeBar(props: { stripe: TripStripe; on: boolean; data: CalendarData }) {
  const colors = useStripeColors(props.stripe, props.data.membersById);
  return (
    <View
      style={{
        width: 3,
        alignSelf: 'stretch',
        ...(props.on ? stripeLine(colors.edge, props.stripe.draft, 'left', 3) : null),
      }}
    />
  );
}

function WeekList(props: WeekViewProps) {
  const theme = useTheme();
  const { data } = props;
  const dates = weekDates(props.weekStart);
  const first = dates[0] ?? props.weekStart;
  const last = dates[6] ?? addDays(props.weekStart, 6);
  const weekStripes = data.stripes.filter((stripe) => stripeSegment(stripe, first, last));
  const chores = props.showHousehold ? data.householdRow(first, last) : {};
  // "Abend", else the last (spec 0020, Entscheidung 14).
  const presetSlotId = addPresetSlot(data.slots);
  // While an entry is dragged every Tageszeit of every day is a target, also the empty ones
  // (spec 0016, AC-006); otherwise only Tageszeiten with entries show (spec 0010, AC-008).
  const allSlots = useLiftedKind() === 'entry';
  const registerDay = useScrollTo({
    enabled: true,
    request: props.scrollRequest,
    // The week has no day to choose: a new day comes from paging, "Heute" or a link.
    period: props.scrollDay,
    target: props.scrollDay,
    first,
  });

  return (
    <View style={{ marginBottom: 22 }} testID="week-list">
      {dates.map((date) => {
        const entries = data.dayEntries(date);
        const labelled = stripesOn(weekStripes, date).filter(
          (stripe) => stripeLabelDate(stripe, first) === date,
        );
        const dayChores = chores[date] ?? [];
        return (
          <View key={date} style={{ flexDirection: 'row', gap: 8 }}>
            {weekStripes.length > 0 ? (
              <StripeBars stripes={weekStripes} date={date} data={data} />
            ) : null}
            <View
              style={{
                flex: 1,
                minWidth: 0,
                gap: 6,
                paddingVertical: 10,
                paddingHorizontal: 10,
                borderRadius: theme.shape.radius.card,
                backgroundColor: date === data.today ? theme.colors.accentSoft : 'transparent',
              }}
              testID={`day-block-${date}`}
            >
              {/* Spec 0030, AC-002: the day's head stays at the top until the next day pushes it
                  out; on the day's own colour. */}
              <View
                style={stickyTopStyle(
                  Platform.OS,
                  date === data.today ? theme.colors.accentSoft : theme.colors.bg,
                )}
              >
                <DayHead
                  date={date}
                  today={data.today}
                  upper
                  register={(node) => registerDay(date, node)}
                />
              </View>
              {labelled.map((stripe) => (
                <TripStripeView
                  key={stripe.key}
                  stripe={stripe}
                  data={data}
                  onPress={props.onOpenStripe}
                />
              ))}
              {props.showHousehold && dayChores.length > 0 ? (
                <View testID={`household-row-${date}`}>
                  <HouseholdDay items={dayChores} data={data} onOpenChore={props.onOpenChore} />
                </View>
              ) : null}
              {data.slots.map((slot) => {
                const slotEntries = entries.filter((entry) => entry.slotId === slot.id);
                if (slotEntries.length === 0 && !allSlots) return null;
                return (
                  <SlotTarget
                    key={slot.id}
                    date={date}
                    slotId={slot.id}
                    style={{ gap: 4 }}
                    testID={`week-slot-${date}-${slot.id}`}
                  >
                    <Text variant="caption" color="muted">
                      {slot.name}
                    </Text>
                    {slotEntries.map((entry) => (
                      <EntryLine
                        key={entry.id}
                        entry={entry}
                        data={data}
                        withReminder
                        onPress={props.onOpenEntry}
                      />
                    ))}
                    {slotEntries.length === 0 ? <EmptySlot /> : null}
                  </SlotTarget>
                );
              })}
              <AddToDay date={date} slotId={presetSlotId} onAdd={props.onAdd} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
