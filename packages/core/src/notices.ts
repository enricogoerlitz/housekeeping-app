import {
  choreDueOn,
  choreDueState,
  choreIsPaused,
  choreMemberIds,
  type ChoreAway,
} from './chore-schedule';
import type { RecipeBook } from './collections';
import {
  addDays,
  daysBetween,
  formatShortDate,
  parseISODate,
  toISODate,
  weekdayShort,
} from './dates';
import { formatTime, type NotificationTarget } from './notifications';
import { packingProgress } from './packing';
import { prepLines } from './prep';
import { entryWhen, planEntryTitle } from './reminder';
import { isOnTrip, stripeText, tripMemberIds } from './trips';
import type {
  Chore,
  Id,
  ISODate,
  MealPlanEntry,
  MealSlot,
  PackingItem,
  PackingListBag,
  TimeOfDay,
} from './types';

// Spec 0051 "Mitteilungen in der App statt Push": what is due now for the signed-in person,
// derived from the local cache alone (works offline), on the household's clock. Five kinds
// (Decision 2), and since spec 0059 the Vorwarnung of a chore (`deadline`) and packing on the eve
// of a trip (`packing`); a notice disappears when it is acknowledged, done or its day is over.

export type NoticeKind =
  'entryReminder' | 'chore' | 'prep' | 'cook' | 'activity' | 'deadline' | 'packing';

export interface Notice {
  /** `<kind>:<id>[:<more>]:<day>` (Decision 5); what an acknowledgement stores. */
  key: string;
  kind: NoticeKind;
  /** "Pizzeria Roma", "Müll rausbringen", "Kichererbsen einweichen". */
  title: string;
  /** "heute 19:30", "19:00 · du bist dran", "Du kochst · heute Abend". */
  detail: string;
  target: NotificationTarget;
  /** "YYYY-MM-DD HH:MM": since when it is due, for the order (newest first). */
  since: string;
}

export interface NoticeInput {
  me: Id;
  /** The household's day and time ("HH:MM" or "HH:MM:SS"). */
  today: ISODate;
  now: string;
  /**
   * The plan, with the Termine of the series from yesterday to SERIES_NOTICE_DAYS ahead (spec
   * 0041; spec 0059: a Termin reminds up to 30 days before).
   */
  entries: readonly MealPlanEntry[];
  chores: readonly Chore[];
  book: RecipeBook;
  slots: readonly MealSlot[];
  restaurantsById: Record<Id, { name: string }>;
  activitiesById: Record<Id, { name: string }>;
  /** Members and trips: who is away when. */
  away: ChoreAway;
  /** The own acknowledged keys (notification_settings.acknowledged_notices). */
  acknowledged: readonly string[];
  /** The packing lists of the trips (spec 0059, REQ-005); none = no packing notices. */
  packing?: { listBags: readonly PackingListBag[]; items: readonly PackingItem[] };
}

/** How far ahead the bell needs the Termine of the series (spec 0059, Decision 2). */
export const SERIES_NOTICE_DAYS = 30;

/** Activities of tomorrow show from this time on (spec 0013, "Aktivitäten am Vortag"). */
const ACTIVITY_EVE: TimeOfDay = '19:00';
/** Packing on the eve of a trip shows from this time on (spec 0059, REQ-005). */
const PACKING_EVE: TimeOfDay = '18:00';
const START_OF_DAY: TimeOfDay = '00:00';
/** Acknowledgements of days more than this many days ago fall away (Decision 8). */
export const ACKNOWLEDGED_KEEP_DAYS = 14;
/** At most this many acknowledgements per person and household (Decision 7). */
export const MAX_ACKNOWLEDGED = 400;
/** At most this many keys in one call of acknowledge_notices. */
export const MAX_ACKNOWLEDGE_AT_ONCE = 100;
const MAX_KEY_LENGTH = 200;
const KEY = /^[a-z]{1,16}(:[A-Za-z0-9-]{1,64}){1,4}:(\d{4}-\d{2}-\d{2})$/;

/** The day at the end of a notice key; undefined when it is not one (the RPC refuses it). */
export function noticeDay(key: string): ISODate | undefined {
  if (key.length > MAX_KEY_LENGTH) return undefined;
  const day = KEY.exec(key)?.[2];
  if (day === undefined || toISODate(parseISODate(day)) !== day) return undefined;
  return day;
}

export function isNoticeKey(key: string): boolean {
  return noticeDay(key) !== undefined;
}

/**
 * What the own row holds after acknowledging `keys` (the RPC does the same on the server): each
 * key once, nothing of a day more than 14 days before `today`, the newest 400.
 */
export function acknowledgedAfter(
  current: readonly string[],
  keys: readonly string[],
  today: ISODate,
): string[] {
  const oldest = addDays(today, -ACKNOWLEDGED_KEEP_DAYS);
  return [...new Set([...current, ...keys])]
    .map((key) => ({ key, day: noticeDay(key) }))
    .filter(
      (each): each is { key: string; day: ISODate } => each.day !== undefined && each.day >= oldest,
    )
    .sort((a, b) => (a.day === b.day ? (a.key < b.key ? -1 : 1) : a.day < b.day ? 1 : -1))
    .slice(0, MAX_ACKNOWLEDGED)
    .map((each) => each.key);
}

/** The red circle and the bell's name (AC-014, AC-015): no circle at 0, "9+" above nine. */
export function noticeBadge(count: number): { count: string | undefined; label: string } {
  if (count <= 0) return { count: undefined, label: 'Mitteilungen' };
  return { count: count > 9 ? '9+' : String(count), label: `Mitteilungen, ${count} offen` };
}

function hhmm(time: string): string {
  return time.slice(0, 5);
}

/** A stored plan entry opens with its window; a Termin of a series only its day. */
function calendarTarget(entry: MealPlanEntry, day: ISODate): NotificationTarget {
  return entry.series === undefined
    ? { screen: 'calendar', day, entryId: entry.id }
    : { screen: 'calendar', day };
}

/** Everyone for an activity; otherwise who eats along, everyone when nobody is named. */
function concerns(entry: MealPlanEntry, me: Id): boolean {
  return entry.kind === 'activity' || entry.eaterIds.length === 0 || entry.eaterIds.includes(me);
}

/**
 * The open notices of `me` (REQ-002), newest first, without the acknowledged ones. Nothing while
 * she is on a trip; nothing about a day she is away (Decision 3).
 */
export function dueNotices(input: NoticeInput): Notice[] {
  const { me, today, away } = input;
  if (isOnTrip(me, today, away.trips)) return [];
  const now = `${today} ${hhmm(input.now)}`;
  const tomorrow = addDays(today, 1);
  const slotNames = new Map(input.slots.map((slot) => [slot.id, slot.name]));
  const titleOf = (entry: MealPlanEntry) =>
    planEntryTitle(
      entry,
      input.book.recipesById,
      input.entries,
      input.restaurantsById,
      input.activitiesById,
    );
  const whenOf = (entry: MealPlanEntry, date: ISODate) =>
    entryWhen({
      entryDate: date,
      slotName: slotNames.get(entry.slotId) ?? '',
      offsetDays: daysBetween(today, date),
      startsAt: entry.startsAt,
    });
  const present = (date: ISODate) => !isOnTrip(me, date, away.trips);
  const notices: Notice[] = [];

  for (const entry of input.entries) {
    const date = entry.date;
    if (date === null || entry.notDone || date < today || !present(date)) continue;
    const { reminder } = entry;
    if (reminder && concerns(entry, me)) {
      const since = `${addDays(date, -reminder.offsetDays)} ${reminder.at}`;
      if (since <= now) {
        notices.push({
          key: `entry:${entry.id}:${reminder.offsetDays}-${reminder.at.replace(':', '')}:${date}`,
          kind: 'entryReminder',
          title: titleOf(entry),
          detail: reminder.text ? `${whenOf(entry, date)} · ${reminder.text}` : whenOf(entry, date),
          target: calendarTarget(entry, date),
          since,
        });
      }
    }
    // An activity with its own reminder is announced by the reminder alone.
    if (entry.kind === 'activity' && !reminder && date <= tomorrow) {
      const since = `${addDays(date, -1)} ${ACTIVITY_EVE}`;
      if (since <= now) {
        notices.push({
          key: `activity:${entry.id}:${date}`,
          kind: 'activity',
          title: titleOf(entry),
          detail: whenOf(entry, date),
          target: calendarTarget(entry, date),
          since,
        });
      }
    }
    if (entry.kind === 'recipe' && date === today && entry.cookId === me) {
      notices.push({
        key: `cook:${entry.id}:${date}`,
        kind: 'cook',
        title: titleOf(entry),
        detail: `Du kochst · ${whenOf(entry, date)}`,
        target: calendarTarget(entry, date),
        since: `${today} ${START_OF_DAY}`,
      });
    }
  }

  const lines = prepLines({
    entries: input.entries,
    book: input.book,
    slots: input.slots,
    shown: today,
    today,
    now: hhmm(input.now),
  });
  for (const line of lines) {
    const { entry } = line;
    const date = entry.date ?? today;
    const mine =
      entry.cookId !== undefined
        ? entry.cookId === me
        : entry.eaterIds.length === 0 || entry.eaterIds.includes(me);
    if (!mine || !present(date)) continue;
    notices.push({
      key: `prep:${line.key}:${date}`,
      kind: 'prep',
      title: line.leadText,
      detail: `${line.whenLabel} · ${line.title} (${line.dayLabel})`,
      target: calendarTarget(entry, date),
      since: `${today} ${START_OF_DAY}`,
    });
  }

  for (const chore of input.chores) {
    const deadline = deadlineNotice(chore, input);
    if (deadline) notices.push(deadline);
    const time = chore.dueTime;
    if (time === undefined || chore.remindAtDueTime === false) continue;
    if (choreDueState(chore, today, away) !== 'today') continue;
    const since = `${today} ${time}`;
    if (since > now) continue;
    const { type } = chore.assignment;
    if (type !== 'anyone' && !choreMemberIds(chore, today, away).includes(me)) continue;
    const yours = type === 'fixed' || type === 'rotating';
    notices.push({
      key: `chore:${chore.id}:${today}`,
      kind: 'chore',
      title: chore.title,
      detail: yours ? `${formatTime(time)} · du bist dran` : formatTime(time),
      target: { screen: 'chore', choreId: chore.id },
      since,
    });
  }

  notices.push(...packingNotices(input));

  const acknowledged = new Set(input.acknowledged);
  return notices
    .filter((notice) => !acknowledged.has(notice.key))
    .sort((a, b) =>
      a.since === b.since ? a.title.localeCompare(b.title, 'de') : a.since < b.since ? 1 : -1,
    );
}

/** Whether a chore concerns `me` today: "egal wer" everyone, otherwise whoever is up. */
function choreIsMine(chore: Chore, me: Id, today: ISODate, away: ChoreAway): boolean {
  return chore.assignment.type === 'anyone' || choreMemberIds(chore, today, away).includes(me);
}

/**
 * Spec 0059, REQ-004: the Vorwarnung of a chore from `noticeDaysBefore` days before its Termin
 * (after trips) until the Termin; on the Termin a chore that reminds at its time anyway stays the
 * only notice (Decision 4). One key per Termin, so an acknowledgement holds (AC-020).
 */
function deadlineNotice(chore: Chore, input: NoticeInput): Notice | undefined {
  const days = chore.noticeDaysBefore;
  const { type } = chore.recurrence;
  if (days === undefined || days <= 0 || type === 'flexible' || type === 'asNeeded') return;
  const { today, away, me } = input;
  const due = choreDueOn(chore, away);
  if (due === undefined || due < today || choreIsPaused(chore, due)) return;
  const start = addDays(due, -days);
  if (start > today || isOnTrip(me, due, away.trips)) return;
  if (due === today && chore.dueTime !== undefined && chore.remindAtDueTime !== false) return;
  if (!choreIsMine(chore, me, today, away)) return;
  const ahead = daysBetween(today, due);
  const day = `${weekdayShort(due)} ${formatShortDate(due)}`;
  return {
    key: `deadline:${chore.id}:${due}`,
    kind: 'deadline',
    title: chore.title,
    detail:
      ahead === 0
        ? 'heute fällig'
        : ahead === 1
          ? `fällig morgen · ${day}`
          : `fällig in ${ahead} Tagen · ${day}`,
    target: { screen: 'chore', choreId: chore.id },
    since: `${start} ${START_OF_DAY}`,
  };
}

/**
 * Spec 0059, REQ-005: on the eve of a trip (not a draft) from 18:00, for who travels, while a
 * Packstück of its packing list is open: "Morgen geht's los · 12 von 30 gepackt".
 */
function packingNotices(input: NoticeInput): Notice[] {
  const { packing, today, me } = input;
  if (!packing || `${today} ${input.now.slice(0, 5)}` < `${today} ${PACKING_EVE}`) return [];
  const tomorrow = addDays(today, 1);
  return input.away.trips.flatMap((trip): Notice[] => {
    if (trip.draft || trip.from !== tomorrow || !tripMemberIds(trip).includes(me)) return [];
    const bags = new Set(
      packing.listBags.filter((bag) => bag.tripId === trip.id).map((bag) => bag.id),
    );
    const progress = packingProgress(packing.items.filter((item) => bags.has(item.listBagId)));
    if (progress.total === 0 || progress.packed === progress.total) return [];
    return [
      {
        key: `packing:${trip.id}:${trip.from}`,
        kind: 'packing',
        title: stripeText(trip),
        detail: `Morgen geht's los · ${progress.label}`,
        target: { screen: 'trip', tripId: trip.id },
        since: `${today} ${PACKING_EVE}`,
      },
    ];
  });
}
