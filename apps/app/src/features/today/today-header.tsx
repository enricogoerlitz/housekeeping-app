import { overviewNav, type ISODate } from '@housekeeping/core';
import { Button, IconButton, Text } from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

/** Opens the calendar in the week of `date`, showing that day (plan decision 12). */
export function useOpenCalendarAt() {
  const router = useRouter();
  return (date: ISODate) => router.navigate({ pathname: '/kalender', params: { tag: date } });
}

/** The range keeps one width, so ‹ › and "Heute" never move when paging (AC-009). */
const RANGE_WIDTH = 176;

/**
 * [Heute] ‹ "Sa 21.11. – Fr 27.11." › (spec 0020, REQ-002): "Heute" has a fixed place left of ‹
 * and can be tapped only outside today's section (Entscheidung 1); ‹ › go seven days (AC-002).
 * Phone: "Heute" at the left edge, the range with ‹ › at the right.
 */
export function OverviewNav(props: {
  shown: ISODate;
  today: ISODate;
  onPage: (steps: number) => void;
  onToday: () => void;
  /** Phone: its own row spanning the page. */
  row: boolean;
}) {
  const nav = overviewNav(props.shown, props.today);
  return (
    <View
      testID="today-week-nav"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: props.row ? 'space-between' : 'flex-end',
        gap: 4,
        marginBottom: props.row ? 6 : 0,
      }}
    >
      <Button
        label="Heute"
        variant="secondary"
        size="sm"
        disabled={!nav.todayActive}
        hint={nav.todayActive ? 'Zurück zu heute' : undefined}
        onPress={props.onToday}
        testID="today-week-today"
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <IconButton
          icon="chevron-left"
          label="Vorige 7 Tage"
          onPress={() => props.onPage(-1)}
          testID="today-week-prev"
        />
        <View
          accessible
          accessibilityLabel={nav.a11yLabel}
          style={{ width: RANGE_WIDTH, alignItems: 'center' }}
        >
          <Text variant="smallStrong" numberOfLines={1} testID="today-range">
            {nav.label}
          </Text>
        </View>
        <IconButton
          icon="chevron-right"
          label="Nächste 7 Tage"
          onPress={() => props.onPage(1)}
          testID="today-week-next"
        />
      </View>
    </View>
  );
}
