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
import { List, ListRow, Section, Text, useTheme } from '@housekeeping/ui';
import { Pressable, View } from 'react-native';

import { StripeBadges, stripeA11y } from './calendar-parts';
import { stripeWho, type CalendarData } from './calendar-data';

export interface YearViewProps {
  data: CalendarData;
  year: number;
  columns: number;
  onOpenMonth: (monthStart: ISODate) => void;
  onEditStripe: (stripe: AbsenceStripe) => void;
}

const WEEKDAY_INITIALS = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
const TINT_ALPHA = '33';

/**
 * The year (spec 0010, REQ-005): twelve small months with a dot on days with entries and absences
 * tinted, then the year's absences as a list. Chores never show here.
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
                  onPress={() => props.onOpenMonth(monthStart)}
                />
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={{ marginTop: 24 }}>
        <Section title={`Abwesenheiten ${props.year}`} testID="year-absences">
          {stripes.length === 0 ? (
            <Text color="muted" testID="year-absences-empty">
              {`Keine Abwesenheiten ${props.year}`}
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
                  accessibilityLabel={stripeA11y(stripe, data.membersById)}
                  onPress={() => props.onEditStripe(stripe)}
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

function MiniMonth(props: {
  monthStart: ISODate;
  data: CalendarData;
  plannedDays: Set<ISODate>;
  onPress: () => void;
}) {
  const theme = useTheme();
  const month = props.monthStart.slice(0, 7);
  const index = parseISODate(props.monthStart).getMonth();
  const name = monthName(index);
  return (
    <Pressable
      testID={`year-month-${index + 1}`}
      accessibilityRole="button"
      accessibilityLabel={`${name} öffnen`}
      onPress={props.onPress}
      style={(state) => {
        const { pressed, hovered } = state as { pressed: boolean; hovered?: boolean };
        return {
          padding: 6,
          borderRadius: theme.shape.radius.card,
          backgroundColor: hovered ? theme.colors.surfaceSunken : 'transparent',
          opacity: pressed ? 0.7 : 1,
        };
      }}
    >
      <Text variant="smallStrong" style={{ marginBottom: 4 }}>
        {name.toUpperCase()}
      </Text>
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
              />
            ) : (
              <View key={date} style={{ flex: 1 }} />
            ),
          )}
        </View>
      ))}
    </Pressable>
  );
}

function MiniDay(props: { date: ISODate; data: CalendarData; planned: boolean }) {
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
  return (
    <View
      style={{ flex: 1, alignItems: 'center', paddingVertical: 1, backgroundColor: background }}
      testID={`year-day-${props.date}`}
    >
      <Text
        variant="caption"
        color={isToday ? 'accent' : 'text'}
        style={{ fontSize: 10, lineHeight: 13 }}
      >
        {String(parseISODate(props.date).getDate())}
      </Text>
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
    </View>
  );
}
