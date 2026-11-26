import { addDays } from './dates';
import {
  cleanReminderText,
  initialReminder,
  reminderDayChips,
  selectableReminderDays,
  validateReminder,
  type EntryReminder,
  type ReminderDayChipKey,
} from './reminder';
import type { ISODate, TimeOfDay } from './types';

// Spec 0017: the block "Erinnern" as a form. Both windows hold the typed values as a draft; the
// add window sends it with "Einplanen", the entry window right away (switch, chips, time) and
// with Enter, leaving the text field and "Fertig" (REQ-002). `reminderSave` decides what to send
// and mirrors the checks of `setEntryReminder`, so the window shows the hint before anything goes
// out.

/** What the block shows: the switch and the typed day, time and text. */
export interface ReminderDraft {
  on: boolean;
  offsetDays: number;
  /** The chosen "HH:MM"; none while a default lies in the past (REQ-003). */
  time: TimeOfDay | undefined;
  text: string;
}

/** AC-001, AC-006: off, and switched on again it starts from the defaults with an empty text. */
export const REMINDER_OFF_DRAFT: ReminderDraft = {
  on: false,
  offsetDays: 0,
  time: undefined,
  text: '',
};

/** The draft of a stored reminder (REQ-002), or the switch off. */
export function reminderDraftFrom(stored: EntryReminder | undefined): ReminderDraft {
  if (!stored) return REMINDER_OFF_DRAFT;
  return {
    on: true,
    offsetDays: stored.offsetDays,
    time: stored.at,
    text: stored.text ?? '',
  };
}

/**
 * Switching "Erinnern" on (AC-002, REQ-003): "Am Tag" and the default time of the Tageszeit; a
 * default already in the past leaves the time empty.
 */
export function switchedOnDraft(
  entryDate: ISODate,
  slotName: string,
  now: Date,
  timeZone: string,
): ReminderDraft {
  const initial = initialReminder(entryDate, slotName, now, timeZone);
  return {
    on: true,
    offsetDays: initial.offsetDays,
    time: initial.at,
    text: '',
  };
}

export type ReminderSave =
  | { action: 'keep' }
  | { action: 'clear' }
  | { action: 'set'; reminder: EntryReminder }
  | { action: 'invalid'; field: 'day' | 'time' | 'text'; error: string };

/**
 * What the draft means against the stored reminder (REQ-002 to REQ-004): nothing, switch it off,
 * set it, or the hint for the field. Like the server, the moment is judged only when day or time
 * change; a text alone may change once it has passed.
 */
export function reminderSave(input: {
  entryDate: ISODate;
  stored: EntryReminder | undefined;
  draft: ReminderDraft;
  now: Date;
  timeZone: string;
}): ReminderSave {
  const { stored, draft } = input;
  if (!draft.on) return stored ? { action: 'clear' } : { action: 'keep' };
  const text = cleanReminderText(draft.text);
  if (!text.ok) return { action: 'invalid', field: 'text', error: text.error };
  const same =
    stored !== undefined && draft.time === stored.at && draft.offsetDays === stored.offsetDays;
  let reminder: EntryReminder;
  if (same) {
    if (text.text === stored.text) return { action: 'keep' };
    reminder = { offsetDays: stored.offsetDays, at: stored.at };
  } else {
    const validation = validateReminder({
      entryDate: input.entryDate,
      offsetDays: draft.offsetDays,
      time: draft.time,
      now: input.now,
      timeZone: input.timeZone,
    });
    if (!validation.ok) {
      return { action: 'invalid', field: validation.field, error: validation.error };
    }
    reminder = validation.reminder;
  }
  return {
    action: 'set',
    reminder: text.text === undefined ? reminder : { ...reminder, text: text.text },
  };
}

/** AC-003, AC-007: only an entry with a day from today on offers "Erinnern". */
export function offersReminder(entryDate: ISODate | null, today: ISODate): boolean {
  return entryDate !== null && entryDate >= today;
}

/**
 * The chips of "Tag" (AC-002, AC-010) with what can be chosen: "Am Vortag" of an entry today lies
 * in the past and is greyed out, like the days before today in the calendar.
 */
export function reminderDayChoices(
  entryDate: ISODate,
  offsetDays: number | undefined,
  today: ISODate,
): { key: ReminderDayChipKey; label: string; selected: boolean; disabled: boolean }[] {
  const range = selectableReminderDays(entryDate, today);
  return reminderDayChips(entryDate, offsetDays).map((chip) => ({
    ...chip,
    disabled:
      range === undefined || (chip.key === 'dayBefore' && addDays(entryDate, -1) < range.from),
  }));
}
