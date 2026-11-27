import { z } from 'zod';

import { EntryReminderSchema, cleanReminderText, type EntryReminder } from './reminder';
import type { ChoreRhythm } from './chore-form';
import type { TimeOfDay } from './types';

// Spec 0059 "Nichts verpassen": "Erinnern" at a series (REQ-003) and "Vorwarnung" at a chore
// (REQ-004), with the bounds the database checks (activity_series_reminder_*,
// chores_notice_days_before_valid).

/** A series reminds at most this many days before a Termin (Decision 3). */
export const MAX_SERIES_REMINDER_DAYS = 30;
/** A chore warns at most this many days before its Termin (Decision 3). */
export const MAX_CHORE_NOTICE_DAYS = 60;

/** The reminder of a series as stored: like an entry's, with a Vorlauf of 0 to 30 days. */
export const SeriesReminderSchema = EntryReminderSchema.extend({
  offsetDays: z.number().int().min(0).max(MAX_SERIES_REMINDER_DAYS),
});

export const SERIES_REMINDER_DAY_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'Am Tag' },
  { value: 1, label: '1 Tag vorher' },
  { value: 3, label: '3 Tage vorher' },
  { value: 7, label: '1 Woche vorher' },
];

const DEFAULT_OFFSET_DAYS = 1;
const DEFAULT_AT: TimeOfDay = '18:00';

/** The block "Erinnern" of "Serie bearbeiten". */
export interface SeriesReminderDraft {
  on: boolean;
  offsetDays: number;
  at: TimeOfDay;
  text: string;
}

/** The draft of a stored reminder; off, it starts from "1 Tag vorher, 18:00" when switched on. */
export function seriesReminderDraft(stored: EntryReminder | undefined): SeriesReminderDraft {
  if (!stored) return { on: false, offsetDays: DEFAULT_OFFSET_DAYS, at: DEFAULT_AT, text: '' };
  return { on: true, offsetDays: stored.offsetDays, at: stored.at, text: stored.text ?? '' };
}

/** What "Speichern" sends: no reminder when off, else the reminder; or the hint for the text. */
export function seriesReminderSave(
  draft: SeriesReminderDraft,
): { ok: true; reminder: EntryReminder | undefined } | { ok: false; error: string } {
  if (!draft.on) return { ok: true, reminder: undefined };
  const text = cleanReminderText(draft.text);
  if (!text.ok) return text;
  const reminder: EntryReminder = { offsetDays: draft.offsetDays, at: draft.at };
  return {
    ok: true,
    reminder: text.text === undefined ? reminder : { ...reminder, text: text.text },
  };
}

/** The chips of "Vorwarnung"; 0 is "Keine". */
export const CHORE_NOTICE_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'Keine' },
  { value: 3, label: '3 Tage' },
  { value: 7, label: '1 Woche' },
  { value: 14, label: '2 Wochen' },
  { value: 30, label: '1 Monat' },
];

/** AC-023: only a rhythm with a fixed Termin warns ahead. */
export function offersChoreNotice(rhythm: ChoreRhythm): boolean {
  return rhythm !== 'flexible' && rhythm !== 'asNeeded';
}

/** "Vorwarnung 1 Woche vorher" in the chore window; undefined without one. */
export function choreNoticeLabel(days: number | undefined): string | undefined {
  if (days === undefined || days <= 0) return undefined;
  const option = CHORE_NOTICE_OPTIONS.find((each) => each.value === days && each.value > 0);
  const span = option?.label ?? (days === 1 ? '1 Tag' : `${days} Tage`);
  return `Vorwarnung ${span} vorher`;
}
