import {
  dateRangeLabel,
  monthGrid,
  monthName,
  parseISODate,
  stripesOfYear,
  yearDayAbsence,
  yearMonths,
  type AbsenceStripe,
  type ISODate,
} from '@housekeeping/core';
import { Icon, List, ListRow, Section, Text, focusRing, useTheme } from '@housekeeping/ui';
import { Pressable, View, type HostInstance } from 'react-native';

import { StripeBadges, stripeA11y } from './calendar-parts';
import { dayLabel, stripeWho, type CalendarData } from './calendar-data';

export interface YearViewProps {
  data: CalendarData;
  year: number;
  columns: number;
  /** The day of the open day window; it is marked. */
  selected: ISODate | undefined;
  /** A tap on a day opens the day window (spec 0016, AC-023). */
  onOpenDay: (date: ISODate) => void;
  /** Every day cell registers here, e.g. to get the focus back when the day window closes. */
  registerDay: (date: ISODate, node: HostInstance | null) => void;
  /** A tap on the month name opens the month. */
  onOpenMonth: (monthStart: ISODate) => void;
  onOpenStripe: (stripe: AbsenceStripe) => void;
}

const WEEKDAY_INITIALS = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
const TINT_ALPHA = '33';

/**
 * The year (spec 0010, REQ-005): twelve small months with a dot on days with entries and absences
 * tinted, then the year's absences as a list. Chores never show here. A tap on a day opens the
 * day window, a tap on the month name the month (spec 0016, AC-023).
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

  return (
    <View testID="year-view">
      <View style={{ gap: 14 }}>
        {rows.map((row) => (
          <View key={row[0]} style={{ flexDirection: 'row', gap: 10 }}>
            {row.map((monthStart) => (
              <View key={monthStart} style={{ flex: 1, minWidth: 0 }}>
                <MiniMonth
                  monthStart={monthStart}
                  data={data}
                  plannedDays={plannedDays}
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
      <View style={{ marginTop: 24 }}>
        <Section title={`Reisen ${props.year}`} testID="year-absences">
          {stripes.length === 0 ? (
            <Text color="muted" testID="year-absences-empty">
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
                  subtitle={stripe.household ? undefined : stripeWho(stripe, data.membersById)}
                  leading={<StripeBadges stripe={stripe} members={data.members} />}
                  trailing={
                    data.hasPackingList(stripe) ? (
                      <View testID={`year-absence-${stripe.absenceIds[0] ?? ''}-bag`}>
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
                  testID={`year-absence-${stripe.absenceIds[0] ?? ''}`}
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
  selected: ISODate | undefined;
  onOpenDay: (date: ISODate) => void;
  registerDay: (date: ISODate, node: HostInstance | null) => void;
  onOpenMonth: () => void;
}) {
  const theme = useTheme();
  const month = props.monthStart.slice(0, 7);
  const index = parseISODate(props.monthStart).getMonth();
  const name = monthName(index);
  return (
    <View testID={`year-month-${index + 1}`} style={{ padding: 6 }}>
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
              backgroundColor: hovered ? theme.colors.surfaceSunken : 'transparent',
              opacity: pressed ? 0.7 : 1,
            },
            focusRing(theme, focused),
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
        <View key={week[0]} style={{ flexDirection: 'row' }}>
          {week.map((date) =>
            date.slice(0, 7) === month ? (
              <MiniDay
                key={date}
                date={date}
                data={props.data}
                planned={props.plannedDays.has(date)}
                selected={date === props.selected}
                onPress={() => props.onOpenDay(date)}
                register={(node) => props.registerDay(date, node)}
              />
            ) : (
              <View key={date} style={{ flex: 1 }} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function MiniDay(props: {
  date: ISODate;
  data: CalendarData;
  planned: boolean;
  selected: boolean;
  onPress: () => void;
  register: (node: HostInstance | null) => void;
}) {
  const theme = useTheme();
  const absence = yearDayAbsence(props.date, props.data.absences);
  const member = absence.kind === 'one' ? props.data.membersById[absence.memberId] : undefined;
  const background =
    absence.kind === 'household'
      ? theme.colors.surfaceSunken
      : member
        ? `${member.color}${TINT_ALPHA}`
        : 'transparent';
  const lines =
    absence.kind === 'several'
      ? absence.memberIds.flatMap((id) => props.data.membersById[id] ?? [])
      : [];
  const isToday = props.date === props.data.today;
  const c = theme.colors;
  return (
    <Pressable
      ref={(node) => props.register(node)}
      testID={`year-day-${props.date}`}
      accessibilityRole="button"
      accessibilityLabel={dayLabel(props.data, props.date)}
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      style={(state) => [
        { flex: 1, alignItems: 'center', paddingVertical: 1, backgroundColor: background },
        focusRing(theme, (state as PressState).focused),
      ]}
    >
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
          style={[{ fontSize: 10, lineHeight: 13 }, props.selected ? { color: c.bg } : null]}
        >
          {String(parseISODate(props.date).getDate())}
        </Text>
      </View>
      <View style={{ height: 3, alignItems: 'center', justifyContent: 'center' }}>
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
      </View>
      {lines.map((person) => (
        <View
          key={person.id}
          style={{ alignSelf: 'stretch', height: 1.5, marginTop: 1, backgroundColor: person.color }}
        />
      ))}
    </Pressable>
  );
}
