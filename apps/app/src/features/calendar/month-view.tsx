import {
  dayKinds,
  dayMonthLongLabel,
  entryKindRole,
  formatLongDate,
  KIND_ROLES,
  monthGrid,
  overflow,
  parseISODate,
  stripeSegment,
  stripesOn,
  type AbsenceStripe,
  type ISODate,
  type KindRole,
  type MealPlanEntry,
} from '@housekeeping/core';
import { Button, KindDot, Popover, Text, useTheme } from '@housekeeping/ui';
import { Pressable, View } from 'react-native';

import type { AddTarget } from '@/features/meal-plan/add-entry-sheet';
import { useOnlineOnly } from '@/features/shell/offline';

import { AbsenceStripeView, EntryLine, HouseholdDay, useStripeColors } from './calendar-parts';
import type { CalendarData } from './calendar-data';

export interface MonthViewProps {
  data: CalendarData;
  /** First day of the shown month. */
  monthStart: ISODate;
  /** Phones: the day whose entries stand under the grid. */
  selected: ISODate;
  onSelect: (date: ISODate) => void;
  showHousehold: boolean;
  wide: boolean;
  onAdd: (target: AddTarget) => void;
  onOpenEntry: (entry: MealPlanEntry) => void;
  onEditStripe: (stripe: AbsenceStripe) => void;
  /** "Tag öffnen ›": the week with that day (AC-012). */
  onOpenDay: (date: ISODate) => void;
}

const WEEKDAY_HEADS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const KIND_NAMES: Record<KindRole, [one: string, many: string]> = {
  activity: ['Aktivität', 'Aktivitäten'],
  recipe: ['Rezept', 'Rezepte'],
  collection: ['Sammlung', 'Sammlungen'],
  restaurant: ['Restaurant', 'Restaurants'],
  chore: ['Aufgabe', 'Aufgaben'],
};

/** "Freitag, 1. Januar: 1 Aktivität, 1 Rezept" for screen readers (spec 0010, platforms). */
function dayA11y(date: ISODate, roles: KindRole[]): string {
  const counts = KIND_ROLES.flatMap((role) => {
    const count = roles.filter((candidate) => candidate === role).length;
    if (count === 0) return [];
    const [one, many] = KIND_NAMES[role];
    return [`${count} ${count === 1 ? one : many}`];
  });
  const head = formatLongDate(date);
  return counts.length > 0 ? `${head}: ${counts.join(', ')}` : head;
}

function tasksLabel(count: number): string {
  return count === 1 ? '1 Aufgabe' : `${count} Aufgaben`;
}

/** The month (spec 0010, REQ-004; D20). */
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

function StripeLine(props: {
  stripe: AbsenceStripe;
  start: number;
  end: number;
  data: CalendarData;
}) {
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

function dayRoles(data: CalendarData, date: ISODate, choreCount: number): KindRole[] {
  const roles = data.dayEntries(date).map(entryKindRole);
  return choreCount > 0 ? [...roles, ...Array<KindRole>(choreCount).fill('chore')] : roles;
}

function MonthPhone(props: MonthViewProps) {
  const theme = useTheme();
  const { data } = props;
  const weeks = monthGrid(props.monthStart);
  const month = props.monthStart.slice(0, 7);
  const first = weeks[0]?.[0] ?? props.monthStart;
  const last = weeks[weeks.length - 1]?.[6] ?? props.monthStart;
  const chores = props.showHousehold ? data.householdRow(first, last) : {};
  const lastSlotId = data.slots[data.slots.length - 1]?.id;
  const online = useOnlineOnly();

  const selectedEntries = data.dayEntries(props.selected);
  const selectedStripes = stripesOn(data.stripes, props.selected);
  const selectedChores = chores[props.selected] ?? [];

  return (
    <View style={{ marginBottom: 22 }} testID="month-phone">
      <WeekdayHeads />
      {weeks.map((week) => (
        <View key={week[0]}>
          <View style={{ flexDirection: 'row' }}>
            {week.map((date) => {
              const inMonth = date.slice(0, 7) === month;
              const roles = dayRoles(data, date, (chores[date] ?? []).length);
              const dots = dayKinds(roles);
              const selected = date === props.selected;
              const isToday = date === data.today;
              return (
                <Pressable
                  key={date}
                  testID={`month-day-${date}`}
                  accessibilityRole="button"
                  accessibilityLabel={dayA11y(date, roles)}
                  accessibilityState={{ selected }}
                  onPress={() => props.onSelect(date)}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 4, minHeight: 48 }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? theme.colors.text : 'transparent',
                      borderWidth: isToday && !selected ? 1.5 : 0,
                      borderColor: theme.colors.accent,
                    }}
                  >
                    <Text
                      variant="smallStrong"
                      style={{
                        color: selected
                          ? theme.colors.bg
                          : inMonth
                            ? theme.colors.text
                            : theme.colors.textMuted,
                      }}
                    >
                      {String(parseISODate(date).getDate())}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 3, height: 8, alignItems: 'center' }}>
                    {dots.map((role) => (
                      <KindDot key={role} kind={role} size={5} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <StripeLines week={week} data={data} />
        </View>
      ))}
      <View
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          gap: 6,
        }}
        testID="month-day-list"
      >
        <Text variant="smallStrong" heading testID="month-day-title">
          {dayMonthLongLabel(props.selected).toUpperCase()}
        </Text>
        {selectedStripes.map((stripe) => (
          <AbsenceStripeView
            key={stripe.key}
            stripe={stripe}
            data={data}
            onPress={props.onEditStripe}
          />
        ))}
        {props.showHousehold && selectedChores.length > 0 ? (
          <HouseholdDay
            items={selectedChores}
            isToday={props.selected === data.today}
            data={data}
          />
        ) : null}
        {selectedEntries.map((entry) => (
          <EntryLine
            key={entry.id}
            entry={entry}
            data={data}
            withSlot
            onPress={props.onOpenEntry}
          />
        ))}
        {lastSlotId ? (
          <Button
            label="Hinzufügen"
            icon="plus"
            variant="link"
            size="sm"
            disabled={online.disabled}
            hint={online.hint}
            testID={`add-${props.selected}`}
            onPress={() =>
              props.onAdd({ date: props.selected, slotId: lastSlotId, slotChosen: false })
            }
          />
        ) : null}
      </View>
    </View>
  );
}

/** The small menu behind "+n weitere": every entry by Tageszeit, "+ Hinzufügen", "Tag öffnen ›". */
function DayMore(props: MonthViewProps & { date: ISODate; more: number }) {
  const { data, date } = props;
  const online = useOnlineOnly();
  const lastSlotId = data.slots[data.slots.length - 1]?.id;
  const title = formatLongDate(date);
  return (
    <Popover
      label={`+${props.more} weitere`}
      accessibilityLabel={`${props.more} weitere Einträge am ${title}`}
      title={title}
      testID={`month-more-${date}`}
    >
      {(close) => (
        <>
          {stripesOn(data.stripes, date).map((stripe) => (
            <AbsenceStripeView
              key={stripe.key}
              stripe={stripe}
              data={data}
              onPress={(chosen) => {
                close();
                props.onEditStripe(chosen);
              }}
            />
          ))}
          {data.dayEntries(date).map((entry) => (
            <EntryLine
              key={entry.id}
              entry={entry}
              data={data}
              withSlot
              onPress={(chosen) => {
                close();
                props.onOpenEntry(chosen);
              }}
            />
          ))}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 4,
            }}
          >
            {lastSlotId ? (
              <Button
                label="Hinzufügen"
                icon="plus"
                variant="link"
                size="sm"
                disabled={online.disabled}
                hint={online.hint}
                testID={`month-more-${date}-add`}
                onPress={() => {
                  close();
                  props.onAdd({ date, slotId: lastSlotId, slotChosen: false });
                }}
              />
            ) : null}
            <Button
              label="Tag öffnen ›"
              variant="link"
              size="sm"
              testID={`month-more-${date}-open`}
              onPress={() => {
                close();
                props.onOpenDay(date);
              }}
            />
          </View>
        </>
      )}
    </Popover>
  );
}

function MonthGridDesktop(props: MonthViewProps) {
  const theme = useTheme();
  const { data } = props;
  const weeks = monthGrid(props.monthStart);
  const month = props.monthStart.slice(0, 7);
  const first = weeks[0]?.[0] ?? props.monthStart;
  const last = weeks[weeks.length - 1]?.[6] ?? props.monthStart;
  const chores = props.showHousehold ? data.householdRow(first, last) : {};

  return (
    <View
      style={{
        marginBottom: 24,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderColor: theme.colors.border,
      }}
      testID="month-grid"
    >
      <View style={{ borderRightWidth: 1, borderColor: theme.colors.border }}>
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
          <View key={weekFirst} style={{ borderTopWidth: 1, borderColor: theme.colors.border }}>
            <View style={{ flexDirection: 'row' }}>
              {week.map((date) => (
                <View
                  key={date}
                  style={{
                    flex: 1,
                    paddingHorizontal: 6,
                    paddingTop: 4,
                    borderRightWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: date === data.today ? theme.colors.accentSoft : 'transparent',
                  }}
                >
                  <Text
                    variant="smallStrong"
                    testID={`month-day-${date}`}
                    color={date.slice(0, 7) === month ? 'text' : 'muted'}
                  >
                    {String(parseISODate(date).getDate())}
                  </Text>
                </View>
              ))}
            </View>
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
                  <AbsenceStripeView
                    stripe={stripe}
                    data={data}
                    separator=" · "
                    continuesBefore={segment.continuesBefore}
                    continuesAfter={segment.continuesAfter}
                    onPress={props.onEditStripe}
                  />
                </View>
              </View>
            ))}
            <View style={{ flexDirection: 'row' }}>
              {week.map((date) => {
                const entries = data.dayEntries(date);
                const { shown, more } = overflow(entries);
                const choreCount = (chores[date] ?? []).length;
                return (
                  <View
                    key={date}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: 96,
                      gap: 2,
                      paddingHorizontal: 4,
                      paddingBottom: 6,
                      borderRightWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor:
                        date === data.today ? theme.colors.accentSoft : 'transparent',
                    }}
                    accessibilityLabel={dayA11y(date, dayRoles(data, date, choreCount))}
                  >
                    {props.showHousehold && choreCount > 0 ? (
                      <Text variant="caption" color="muted" testID={`month-tasks-${date}`}>
                        {tasksLabel(choreCount)}
                      </Text>
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
                    {more > 0 ? <DayMore {...props} date={date} more={more} /> : null}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}
