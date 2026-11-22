// TimeField and the detail button of SwitchRow: which parts are shown and what a screen reader
// hears. Pure, so it is tested in Node; the words come from the feature. A time is "HH:MM" in
// five-minute steps (`TimeOfDaySchema` in core), chosen from "Stunde" and "Minute" (spec 0027,
// REQ-007, Decision 6).

/** One entry of a select: the value it stands for and what it shows. */
export interface TimeOption {
  value: string;
  label: string;
}

const pad = (value: number) => String(value).padStart(2, '0');
const TIME = /^([01]\d|2[0-3]):([0-5][05])$/;
const EMPTY: TimeOption = { value: '', label: '–' };

/** "0" to "23"; with `withEmpty` first "–" for no time (AC-029, AC-030). */
export function hourOptions(withEmpty: boolean): TimeOption[] {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    value: pad(hour),
    label: String(hour),
  }));
  return withEmpty ? [EMPTY, ...hours] : hours;
}

/** "00", "05", … "55": the scheduler runs every five minutes (AC-029). */
export function minuteOptions(withEmpty: boolean): TimeOption[] {
  const minutes = Array.from({ length: 12 }, (_, step) => ({
    value: pad(step * 5),
    label: pad(step * 5),
  }));
  return withEmpty ? [EMPTY, ...minutes] : minutes;
}

/** The chosen hour and minute of a time; "" for each without one (AC-030). */
export function timeFieldParts(value: string | undefined): { hour: string; minute: string } {
  const match = value === undefined ? null : TIME.exec(value);
  return match ? { hour: match[1] ?? '', minute: match[2] ?? '' } : { hour: '', minute: '' };
}

/** A chosen hour keeps the minute (":00" without one); "–" removes the time (AC-030). */
export function timeWithHour(value: string | undefined, hour: string): string | undefined {
  if (hour === '') return undefined;
  const { minute } = timeFieldParts(value);
  return `${hour}:${minute === '' ? '00' : minute}`;
}

/** A chosen minute needs an hour; without one, or with "–", nothing changes. */
export function timeWithMinute(value: string | undefined, minute: string): string | undefined {
  const { hour } = timeFieldParts(value);
  if (hour === '' || minute === '') return value;
  return `${hour}:${minute}`;
}

/** ✕ removes an optional time; it shows only when there is one and the field can be edited. */
export function timeFieldShowsClear(input: {
  value: string | undefined;
  optional: boolean;
  editable: boolean;
}): boolean {
  return input.optional && input.editable && timeFieldParts(input.value).hour !== '';
}

/** "Uhrzeit, Stunde": the name of the field, then the part (AC-031). */
export function timeSelectLabel(name: string, part: string): string {
  return `${name}, ${part}`;
}

/**
 * The accessible names of a SwitchRow. With details, the text and "›" are one button of their
 * own beside the switch (never nested), named by the feature and followed by the description, so
 * the two controls never share a name.
 */
export function switchRowParts(input: {
  label: string;
  description?: string;
  detailLabel?: string;
  hasDetail: boolean;
}): { switchLabel: string; detailLabel: string | undefined } {
  if (!input.hasDetail || input.detailLabel === undefined) {
    return { switchLabel: input.label, detailLabel: undefined };
  }
  return {
    switchLabel: input.label,
    detailLabel: input.description
      ? `${input.detailLabel}, ${input.description}`
      : input.detailLabel,
  };
}
