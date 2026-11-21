// Times of day a command writes (spec 0013): "HH:MM" in five-minute steps, like the database's
// `private.is_five_minute_time`. The forms read typed input with core `parseTimeInput`; this only
// keeps a command from sending what the server would refuse anyway.
import { TimeOfDaySchema, type TimeOfDay } from '@housekeeping/core';

/** Throws "Keine gültige Uhrzeit" (the text of core parseTimeInput) for anything else. */
export function checkTime(time: TimeOfDay | null | undefined): void {
  if (time === null || time === undefined) return;
  if (!TimeOfDaySchema.safeParse(time).success) throw new Error('Keine gültige Uhrzeit');
}
