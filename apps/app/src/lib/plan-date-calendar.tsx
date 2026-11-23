import { formatPickerDate, monthTitle, weekdayHeads, type ISODate } from '@housekeeping/core';
import { MonthCalendar } from '@housekeeping/ui';
import { useState } from 'react';

/**
 * The month calendar behind "Anderes Datum …" (spec 0016, REQ-005): starts with `month`, ‹ ›
 * page without a limit, `marked` is the entry's day; days `isDisabled` names are dimmed and the
 * keyboard skips them (AC-021). Used in the entry window and for "Einplanen" (AC-019, AC-020).
 */
export function PlanDateCalendar(props: {
  month: ISODate;
  today: ISODate;
  marked?: ISODate | null;
  isDisabled?: (date: ISODate) => boolean;
  onSelect: (date: ISODate) => void;
  testID: string;
}) {
  const [month, setMonth] = useState(props.month);
  return (
    <MonthCalendar
      month={month}
      onMonthChange={setMonth}
      onSelect={props.onSelect}
      title={monthTitle(month)}
      weekdayLabels={weekdayHeads(false)}
      previousLabel="Voriger Monat"
      nextLabel="Nächster Monat"
      dayLabel={formatPickerDate}
      marked={props.marked ? { from: props.marked, to: props.marked } : undefined}
      today={props.today}
      isDisabled={props.isDisabled}
      testID={props.testID}
    />
  );
}
