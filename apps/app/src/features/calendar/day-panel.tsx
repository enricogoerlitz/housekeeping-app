import {
  addDays,
  daySheetContent,
  formatLongDate,
  parseISODate,
  weekdayShort,
  type TripStripe,
  type ISODate,
  type MealPlanEntry,
} from '@housekeeping/core';
import {
  Button,
  DockedPanel,
  Icon,
  SwipeArea,
  Text,
  keyboardFocusRing,
  panelPlacement,
  space,
  useBreakpoint,
  useHover,
  useTheme,
} from '@housekeeping/ui';
import type { RefObject } from 'react';
import { Pressable, View } from 'react-native';

import type { AddTarget } from '@/features/meal-plan/add-entry-sheet';
import { useOnlineOnly } from '@/features/shell/offline';

import { TripStripeView, EntryLine, HouseholdDay } from './calendar-parts';
import type { CalendarData } from './calendar-data';
import { useDraggedKind } from './calendar-drag';

export interface DayPanelProps {
  data: CalendarData;
  open: boolean;
  /** The day shown; it stays while the panel slides away after closing. */
  date: ISODate;
  onClose: () => void;
  /** Another day from the week strip or a swipe. */
  onChooseDay: (date: ISODate) => void;
  /** The household row is on for the month: the day's chores stand in the panel. */
  showHousehold: boolean;
  onAdd: (target: AddTarget) => void;
  onOpenEntry: (entry: MealPlanEntry) => void;
  onOpenStripe: (stripe: TripStripe) => void;
  /** "Reise eintragen" with from = to = the day (AC-032). */
  onNewTrip: (date: ISODate) => void;
  /** "Woche anzeigen ›". */
  onShowWeek: (date: ISODate) => void;
  /** The day in the grid; it gets the focus back when the panel closes (AC-024). */
  returnFocusRef: RefObject<{ focus: () => void } | null>;
}

/**
 * The day window of month and year (spec 0016, REQ-006): the day with its week strip, the trips
 * of the day, its chores, then every Tageszeit with its entries and "+ Hinzufügen", at the end
 * "Reise eintragen" and "Woche anzeigen ›". It leaves the grid usable: another day, paging and
 * opening an entry keep it open (AC-022, AC-025, AC-027). Its entries can be dragged onto the
 * grid (AC-008).
 */
export function DayPanel(props: DayPanelProps) {
  const theme = useTheme();
  const { width } = useBreakpoint();
  const online = useOnlineOnly();
  const { data, date } = props;
  const content = daySheetContent({
    date,
    entries: data.entries,
    slots: data.slots,
    stripes: data.stripes,
  });
  const chores = props.showHousehold ? (data.householdRow(date, date)[date] ?? []) : [];
  const bottom = panelPlacement(width) === 'bottom';
  // While something is dragged the panel shrinks to its header line, so the grid is free; an
  // entry from the panel goes onto a day of the grid (spec 0016, AC-008).
  const dragging = useDraggedKind() !== null;

  return (
    <DockedPanel
      open={props.open}
      state={dragging ? 'collapsed' : undefined}
      onClose={props.onClose}
      label="Tages-Fenster"
      closeLabel="Tages-Fenster schließen"
      handleLabel="Größe des Tages-Fensters ändern"
      returnFocusRef={props.returnFocusRef}
      testID="day-panel"
      header={
        <Text
          variant="smallStrong"
          heading
          testID="day-panel-title"
          style={{ textTransform: 'uppercase' }}
        >
          {content.title}
        </Text>
      }
    >
      <SwipeArea
        enabled={bottom && !dragging}
        onSwipe={(step) => props.onChooseDay(addDays(date, step))}
        style={{ gap: space.m }}
        testID="day-panel-swipe"
      >
        <WeekStrip
          week={content.week}
          selected={date}
          today={data.today}
          onChoose={props.onChooseDay}
        />
        {online.hint ? (
          <Text variant="small" color="warn" testID="day-panel-offline">
            {online.hint}
          </Text>
        ) : null}
        {content.stripes.length > 0 ? (
          <View style={{ gap: space.xs }}>
            {content.stripes.map((stripe) => (
              <TripStripeView
                key={stripe.key}
                stripe={stripe}
                data={data}
                onPress={props.onOpenStripe}
                testID={`day-panel-stripe-${stripe.tripId}`}
              />
            ))}
          </View>
        ) : null}
        {chores.length > 0 ? (
          <View testID="day-panel-chores">
            <HouseholdDay items={chores} isToday={date === data.today} data={data} />
          </View>
        ) : null}
        {content.empty ? (
          <Text color="muted" testID="day-panel-empty">
            {content.emptyText}
          </Text>
        ) : null}
        {content.slots.map(({ slot, entries }) => (
          <View key={slot.id} testID={`day-panel-slot-${slot.id}`}>
            <Text variant="groupLabel" color="muted" heading>
              {slot.name}
            </Text>
            {entries.map((entry) => (
              <EntryLine
                key={entry.id}
                entry={entry}
                data={data}
                withReminder
                onPress={props.onOpenEntry}
              />
            ))}
            <AddLine
              label={`Hinzufügen: ${slot.name}`}
              disabled={online.disabled}
              hint={online.hint}
              testID={`day-panel-add-${slot.id}`}
              onPress={() => props.onAdd({ date, slotId: slot.id, slotChosen: true })}
            />
          </View>
        ))}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: space.s,
            paddingTop: space.m,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
          }}
        >
          <Button
            label="Reise eintragen"
            icon="luggage"
            variant="secondary"
            disabled={online.disabled}
            hint={online.hint}
            testID="day-panel-trip"
            onPress={() => props.onNewTrip(date)}
          />
          <Button
            label="Woche anzeigen ›"
            variant="ghost"
            testID="day-panel-week"
            onPress={() => props.onShowWeek(date)}
          />
        </View>
      </SwipeArea>
    </DockedPanel>
  );
}

/** Mo to So of the day's week; each day at least 44 × 44 pt, the shown one filled (REQ-006). */
function WeekStrip(props: {
  week: ISODate[];
  selected: ISODate;
  today: ISODate;
  onChoose: (date: ISODate) => void;
}) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View
      // The days get most of the panel's side margins too, so seven of them fit at 44 pt; the
      // rest keeps the first and last day off the panel's edge.
      style={{ flexDirection: 'row', marginHorizontal: -space.l, paddingHorizontal: space.xs }}
      testID="day-panel-week-strip"
    >
      {props.week.map((date) => {
        const selected = date === props.selected;
        const isToday = date === props.today;
        return (
          <Pressable
            key={date}
            testID={`day-panel-day-${date}`}
            accessibilityRole="button"
            accessibilityLabel={formatLongDate(date)}
            accessibilityState={{ selected }}
            onPress={() => props.onChoose(date)}
            style={(state) => {
              const { pressed, focused } = state as { pressed: boolean; focused?: boolean };
              return [
                {
                  flex: 1,
                  minWidth: 44,
                  minHeight: 52,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: space.xxs,
                  borderRadius: theme.shape.radius.control,
                  backgroundColor: selected ? c.text : 'transparent',
                  borderWidth: isToday && !selected ? 1.5 : 0,
                  borderColor: c.accent,
                  opacity: pressed ? 0.7 : 1,
                },
                keyboardFocusRing(theme, focused),
              ];
            }}
          >
            <Text variant="caption" style={{ color: selected ? c.bg : c.textMuted }}>
              {weekdayShort(date)}
            </Text>
            <Text variant="smallStrong" style={{ color: selected ? c.bg : c.text }}>
              {String(parseISODate(date).getDate())}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "+ Hinzufügen" under a Tageszeit: a full line of 44 pt, greyed out offline. */
function AddLine(props: {
  label: string;
  disabled: boolean;
  hint: string | undefined;
  testID: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const hover = useHover();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.hint}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={(state) => {
        const { pressed, hovered, focused } = state as {
          pressed: boolean;
          hovered?: boolean;
          focused?: boolean;
        };
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.s,
            minHeight: 44,
            paddingHorizontal: space.s,
            borderRadius: theme.shape.radius.control,
            backgroundColor:
              hover(hovered) && !props.disabled ? theme.colors.surfaceSunken : 'transparent',
            opacity: props.disabled ? 0.45 : pressed ? 0.7 : 1,
          },
          keyboardFocusRing(theme, focused),
        ];
      }}
    >
      <Icon name="plus" size={16} color="accent" />
      <Text variant="smallStrong" color="accent">
        Hinzufügen
      </Text>
    </Pressable>
  );
}
