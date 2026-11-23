import { useHousehold, useHouseholdClock, usePlanEntries, useRecipeBook } from '@housekeeping/api';
import { prepLines, type ISODate } from '@housekeeping/core';
import { Icon, Row, Text } from '@housekeeping/ui';
import { View } from 'react-native';

/**
 * The Vorbereitung lines directly under the Tagesleiste (spec 0020, REQ-006): one per Vorlauf
 * that has to start on the shown day at the latest, for the whole household; none on past days.
 */
export function TodayPrep(props: { shown: ISODate; today: ISODate }) {
  const household = useHousehold();
  const entries = usePlanEntries();
  const book = useRecipeBook();
  const clock = useHouseholdClock();
  // The time only decides "Schon fällig"; the next render after a sync or a tap updates it.
  const now = clock().time;
  const lines = prepLines({
    entries,
    book,
    slots: household.mealSlots,
    shown: props.shown,
    today: props.today,
    now,
  });
  if (lines.length === 0) return null;
  return (
    <View testID="today-prep" style={{ marginBottom: 20, gap: 6 }}>
      {lines.map((line) => (
        <Row key={line.key} gap={8} align="flex-start">
          <Icon name="alarm-clock" size={18} color="accent" />
          <Text style={{ flex: 1 }} testID={`today-prep-${line.key}`}>
            <Text variant="bodyStrong">{line.whenLabel}: </Text>
            {line.leadText}
            <Text color="muted">
              {' · '}
              {line.title} ({line.dayLabel})
            </Text>
          </Text>
        </Row>
      ))}
    </View>
  );
}
