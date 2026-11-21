import { toISODate } from './dates';
import type { Id, ISODate, Member } from './types';

// Ratings of recipes (also collections), restaurants and activities in half steps (spec 0011,
// REQ-004): 0.5 … 5 per member.

export const MIN_STARS = 0.5;
export const MAX_STARS = 5;

/** True for 0.5, 1, 1.5 … 5; false for 0, 4.3, 4.25, 5.5, negatives and NaN (AC-026). */
export function isHalfStar(stars: number): boolean {
  return Number.isInteger(stars * 2) && stars >= MIN_STARS && stars <= MAX_STARS;
}

/** "4,5", "0,5", "4": a German decimal comma, whole values without one. */
export function formatStars(stars: number): string {
  return Number.isInteger(stars) ? String(stars) : String(stars).replace('.', ',');
}

/**
 * True when a rating set at `ratedAt` (timestamp) counts for an entry on `date`: set on that day
 * or later, in local time (Offene Frage 1 A). False without a readable time.
 */
export function ratedOnOrAfter(ratedAt: string | undefined, date: ISODate): boolean {
  if (ratedAt === undefined) return false;
  const time = new Date(ratedAt);
  if (Number.isNaN(time.getTime())) return false;
  return toISODate(time) >= date;
}

export interface MemberRatingRow {
  memberId: Id;
  /** "Du" for the own row, else the member's name. */
  label: string;
  /** Undefined = not rated yet (empty stars). */
  stars?: number;
  /** Only the own stars can be set (spec 0008, AC-040). */
  editable: boolean;
}

/**
 * The ratings on a recipe or restaurant page (spec 0008, E15): "Du" first, then every other
 * current member in the given order with their stars for display only. Ratings of people who are
 * no longer members are left out.
 */
export function memberRatingRows(
  ratings: Readonly<Record<Id, number>>,
  members: readonly Member[],
  me: Id,
): MemberRatingRow[] {
  const own: MemberRatingRow = { memberId: me, label: 'Du', stars: ratings[me], editable: true };
  const others = members
    .filter((member) => member.id !== me)
    .map((member) => ({
      memberId: member.id,
      label: member.name,
      stars: ratings[member.id],
      editable: false,
    }));
  return [own, ...others];
}
