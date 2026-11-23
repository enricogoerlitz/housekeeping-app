import { addDays, choreDayLabel, relativeDayLabel, type ISODate } from '@housekeeping/core';
import { Chip, Stack } from '@housekeeping/ui';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { PlanDateCalendar } from '@/lib/plan-date-calendar';

/** "heute", "morgen", "gestern", otherwise "Sa 21.11." (with the year in another year). */
function dateChipLabel(iso: ISODate, today: ISODate): string {
  const relative = relativeDayLabel(iso, today);
  return relative === 'heute' || relative === 'morgen' || relative === 'gestern'
    ? relative
    : choreDayLabel(iso, today);
}

/**
 * A row of day chips with „Datum …“ (spec 0026, REQ-001): optionally a chip that clears the date,
 * „Datum …“, then the quick days — the next `days` days from today, or with `past` today and the
 * days before it. „Datum …“ opens the month calendar under the chips; a day chosen there stands on
 * that chip („Di 16.3.2027“) and is selected. `min` and `max` bound what can be chosen.
 */
export function DateChips(props: {
  today: ISODate;
  /** How many quick days are offered; default 14 (3 with `past`: heute, gestern, vorgestern). */
  days?: number;
  /** Quick days go back from today instead of forward. */
  past?: boolean;
  value: ISODate | undefined;
  onChange: (value: ISODate | undefined) => void;
  /** Offers an extra first chip that clears the date. */
  noneLabel?: string;
  min?: ISODate;
  max?: ISODate;
  disabled?: boolean;
  testIDPrefix: string;
}) {
  const { today } = props;
  const [open, setOpen] = useState(false);
  const count = props.days ?? (props.past ? 3 : 14);
  const quick = Array.from({ length: count }, (_, offset) =>
    addDays(today, props.past ? -offset : offset),
  ).filter(
    (date) =>
      (props.min === undefined || date >= props.min) &&
      (props.max === undefined || date <= props.max),
  );
  const custom = props.value !== undefined && !quick.includes(props.value);
  const pick = (value: ISODate | undefined) => {
    setOpen(false);
    props.onChange(value);
  };
  return (
    <Stack gap={8}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      >
        {props.noneLabel ? (
          <Chip
            label={props.noneLabel}
            selected={props.value === undefined}
            disabled={props.disabled}
            onPress={() => pick(undefined)}
            testID={`${props.testIDPrefix}-none`}
          />
        ) : null}
        <Chip
          label={custom && props.value ? choreDayLabel(props.value, today) : 'Datum …'}
          icon="calendar-days"
          selected={custom || open}
          disabled={props.disabled}
          onPress={() => setOpen((current) => !current)}
          testID={`${props.testIDPrefix}-pick`}
        />
        {quick.map((date) => (
          <Chip
            key={date}
            label={dateChipLabel(date, today)}
            selected={props.value === date}
            disabled={props.disabled}
            onPress={() => pick(date)}
            testID={`${props.testIDPrefix}-${date}`}
          />
        ))}
      </ScrollView>
      {open ? (
        <PlanDateCalendar
          month={props.value ?? today}
          today={today}
          marked={props.value ?? null}
          isDisabled={(date) =>
            (props.min !== undefined && date < props.min) ||
            (props.max !== undefined && date > props.max)
          }
          onSelect={pick}
          testID={`${props.testIDPrefix}-calendar`}
        />
      ) : null}
    </Stack>
  );
}
