import {
  addDays,
  formatShortDate,
  relativeDayLabel,
  weekdayShort,
  type ISODate,
} from '@housekeeping/core';
import { Chip } from '@housekeeping/ui';
import { ScrollView } from 'react-native';

/** "heute", "morgen", otherwise "Sa 21.11." – short enough for a chip. */
export function dateChipLabel(iso: ISODate, today: ISODate): string {
  const relative = relativeDayLabel(iso, today);
  return relative === 'heute' || relative === 'morgen'
    ? relative
    : `${weekdayShort(iso)} ${formatShortDate(iso)}`;
}

export function nextDays(today: ISODate, count: number): ISODate[] {
  return Array.from({ length: count }, (_, offset) => addDays(today, offset));
}

/**
 * A horizontal row of day chips. Simpler and more robust than a date picker for the near future,
 * and the same on web and native.
 */
export function DateChips(props: {
  today: ISODate;
  /** How many days from today on are offered; default 14. */
  days?: number;
  value: ISODate | undefined;
  onChange: (value: ISODate | undefined) => void;
  /** Offers an extra first chip that clears the date. */
  noneLabel?: string;
  testIDPrefix: string;
}) {
  const dates = nextDays(props.today, props.days ?? 14);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {props.noneLabel ? (
        <Chip
          label={props.noneLabel}
          selected={props.value === undefined}
          onPress={() => props.onChange(undefined)}
          testID={`${props.testIDPrefix}-none`}
        />
      ) : null}
      {dates.map((date) => (
        <Chip
          key={date}
          label={dateChipLabel(date, props.today)}
          selected={props.value === date}
          onPress={() => props.onChange(date)}
          testID={`${props.testIDPrefix}-${date}`}
        />
      ))}
    </ScrollView>
  );
}
