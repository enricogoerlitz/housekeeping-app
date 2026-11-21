import { weekNav, type ISODate } from '@housekeeping/core';
import { Button, IconButton, Text } from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

/** Opens the calendar in the week of `date`, showing that day (plan decision 12). */
export function useOpenCalendarAt() {
  const router = useRouter();
  return (date: ISODate) => router.navigate({ pathname: '/kalender', params: { tag: date } });
}

/** ▦ in the header: the calendar in the shown week (AC-004). */
export function CalendarButton(props: { shown: ISODate }) {
  const openCalendarAt = useOpenCalendarAt();
  return (
    <IconButton
      icon="calendar-days"
      label="Kalender in dieser Woche öffnen"
      onPress={() => openCalendarAt(props.shown)}
      testID="today-calendar"
    />
  );
}

/**
 * ‹ "Diese Woche · KW 47" ›, or ‹ "Heute" › as soon as another day is shown (AC-002, AC-062).
 * ‹ › go a whole week and keep the weekday (AC-003).
 */
export function WeekNav(props: {
  shown: ISODate;
  today: ISODate;
  onPage: (weeks: number) => void;
  onToday: () => void;
  /** Phone: the row spans the page with the label in the middle. */
  wide: boolean;
}) {
  const nav = weekNav(props.shown, props.today);
  return (
    <View
      testID="today-week-nav"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: props.wide ? 'flex-end' : 'space-between',
        gap: 4,
        marginBottom: props.wide ? 0 : 6,
      }}
    >
      <IconButton
        icon="chevron-left"
        label="Vorige Woche"
        onPress={() => props.onPage(-1)}
        testID="today-week-prev"
      />
      <View style={{ minWidth: props.wide ? 170 : 0, flexShrink: 1, alignItems: 'center' }}>
        {nav.showToday ? (
          <Button
            label="Heute"
            variant="secondary"
            size="sm"
            hint={`Zurück zu heute. Gezeigt: ${nav.label}`}
            onPress={props.onToday}
            testID="today-week-today"
          />
        ) : (
          <Text variant="smallStrong" numberOfLines={1} testID="today-week-label">
            {nav.label}
          </Text>
        )}
      </View>
      <IconButton
        icon="chevron-right"
        label="Nächste Woche"
        onPress={() => props.onPage(1)}
        testID="today-week-next"
      />
    </View>
  );
}
