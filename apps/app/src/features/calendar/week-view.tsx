import {
  addDays,
  dayMonthLabel,
  stripeLabelDate,
  stripeSegment,
  stripesOn,
  weekDates,
  type AbsenceStripe,
  type Id,
  type ISODate,
  type MealPlanEntry,
} from '@housekeeping/core';
import { Badge, Button, Icon, Text, useTheme } from '@housekeeping/ui';
import { Pressable, View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import type { AddTarget } from '@/features/meal-plan/add-entry-sheet';

import { AbsenceStripeView, EntryLine, HouseholdDay, useStripeColors } from './calendar-parts';
import type { CalendarData } from './calendar-data';

export interface WeekViewProps {
  data: CalendarData;
  /** Monday of the shown week. */
  weekStart: ISODate;
  showHousehold: boolean;
  wide: boolean;
  onAdd: (target: AddTarget) => void;
  onOpenEntry: (entry: MealPlanEntry) => void;
  onOpenStripe: (stripe: AbsenceStripe) => void;
}

const LABEL_WIDTH = 92;

/** The week (spec 0010, REQ-002): desktop as a grid of days and rows, phones as a list of days. */
export function WeekView(props: WeekViewProps) {
  return props.wide ? <WeekGrid {...props} /> : <WeekList {...props} />;
}

function DayHead(props: { date: ISODate; today: ISODate; upper?: boolean }) {
  const isToday = props.date === props.today;
  const label = dayMonthLabel(props.date);
  return (
    <View
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
          opacity: hovered || focused ? 1 : 0,
          backgroundColor: hovered ? theme.colors.surfaceSunken : 'transparent',
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
    borderRadius: 6,
    backgroundColor: date === data.today ? theme.colors.accentSoft : 'transparent',
  });

  return (
    <View style={{ marginBottom: 24, gap: 6 }} testID="week-grid">
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <View style={{ width: LABEL_WIDTH }} />
        {dates.map((date) => (
          <View key={date} style={{ flex: 1, minWidth: 0, paddingHorizontal: 4 }}>
            <DayHead date={date} today={data.today} />
          </View>
        ))}
      </View>
      {stripes.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 4 }} testID="week-absence-row">
          <RowLabel>Abwesenheit</RowLabel>
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
                  <AbsenceStripeView
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
              <HouseholdDay
                items={chores[date] ?? []}
                isToday={date === data.today}
                data={data}
                compact
              />
            </View>
          ))}
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
            <View key={date} style={[cell(date), { minHeight: 64 }]}>
              {data
                .dayEntries(date)
                .filter((entry) => entry.slotId === slot.id)
                .map((entry) => (
                  <EntryLine key={entry.id} entry={entry} data={data} onPress={props.onOpenEntry} />
                ))}
              <AddCell date={date} slotId={slot.id} onAdd={props.onAdd} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** The bars left of a phone's day: one per stripe of the week, in a fixed column. */
function StripeBars(props: { stripes: AbsenceStripe[]; date: ISODate; data: CalendarData }) {
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

function StripeBar(props: { stripe: AbsenceStripe; on: boolean; data: CalendarData }) {
  const colors = useStripeColors(props.stripe, props.data.membersById);
  return (
    <View
      style={{
        width: 3,
        alignSelf: 'stretch',
        backgroundColor: props.on ? colors.edge : 'transparent',
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
  const lastSlotId = data.slots[data.slots.length - 1]?.id;

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
            >
              <DayHead date={date} today={data.today} upper />
              {labelled.map((stripe) => (
                <AbsenceStripeView
                  key={stripe.key}
                  stripe={stripe}
                  data={data}
                  onPress={props.onOpenStripe}
                />
              ))}
              {props.showHousehold && dayChores.length > 0 ? (
                <View testID={`household-row-${date}`}>
                  <HouseholdDay items={dayChores} isToday={date === data.today} data={data} />
                </View>
              ) : null}
              {data.slots.map((slot) => {
                const slotEntries = entries.filter((entry) => entry.slotId === slot.id);
                if (slotEntries.length === 0) return null;
                return (
                  <View key={slot.id} style={{ gap: 4 }}>
                    <Text variant="caption" color="muted">
                      {slot.name}
                    </Text>
                    {slotEntries.map((entry) => (
                      <EntryLine
                        key={entry.id}
                        entry={entry}
                        data={data}
                        onPress={props.onOpenEntry}
                      />
                    ))}
                  </View>
                );
              })}
              <AddToDay date={date} slotId={lastSlotId} onAdd={props.onAdd} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
