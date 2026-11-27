import type { Id, ISODate, TimeOfDay } from './types';

// Times of chores and entries, „Erinnern“ of a chore and where an in-app notice leads (spec
// 0051; Web Push of spec 0013 is gone).

// ---------- Times ----------

/** The names of the two selects of every time field (spec 0027, REQ-007). */
export const TIME_FIELD_WORDS = { hourLabel: 'Stunde', minuteLabel: 'Minute' } as const;

/** "7:30", "19:00" (`H:MM`). */
export function formatTime(time: TimeOfDay): string {
  const [hour = '0', minute = '00'] = time.split(':');
  return `${Number(hour)}:${minute}`;
}

/** "Müll rausbringen · 19:00" in "Zu tun" and the household row (AC-022); no time, no change. */
export function withTime(title: string, time: TimeOfDay | undefined): string {
  return time === undefined ? title : `${title} · ${formatTime(time)}`;
}

/**
 * Under „Erinnern“ of a chore with a time (spec 0027, REQ-009; spec 0051): whether whoever is up
 * gets a notice in the app at that time.
 */
export function choreRemindHint(remindAtDueTime: boolean): string {
  return remindAtDueTime
    ? 'Erinnert zur Uhrzeit in den Mitteilungen, wer dran ist.'
    : 'Keine Erinnerung – die Uhrzeit wird nur angezeigt.';
}

/**
 * „Erinnern“ as it is saved (spec 0027, AC-038): only a chore with a time can be silent; without
 * one it is on, so a time chosen later reminds again (check `chores_remind_needs_time`).
 */
export function remindAtDueTimeFor(dueTime: TimeOfDay | undefined, remind: boolean): boolean {
  return dueTime === undefined || remind;
}

// ---------- Where a notice leads ----------

export type NotificationTarget =
  /** A chore on the page "Haushalt". */
  | { screen: 'chore'; choreId: Id }
  /** A day in the calendar, with the entry's window if one. */
  | { screen: 'calendar'; day: ISODate; entryId?: Id }
  /** The trip window over "Reisen" (spec 0059, REQ-005). */
  | { screen: 'trip'; tripId: Id };

/** The address of the target's screen (spec 0051, AC-017). */
export function notificationTargetHref(target: NotificationTarget): string {
  switch (target.screen) {
    case 'chore':
      return `/haushalt?aufgabe=${target.choreId}`;
    case 'calendar':
      return target.entryId === undefined
        ? `/kalender?tag=${target.day}`
        : `/kalender?tag=${target.day}&eintrag=${target.entryId}`;
    case 'trip':
      return `/reisen?reise=${target.tripId}`;
  }
}
