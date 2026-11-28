import { addDays, daysBetween } from './dates';
import { deriveRecipeDiet } from './diet';
import {
  distributeWeek,
  freeEvenings,
  weekMenu,
  type Evening,
  type PlanSuggestion,
  type SuggestionInput,
} from './plan-suggestions';
import { defaultVariantId } from './recipe-variants';
import { isOnTrip } from './trips';
import type { ISODate, Recipe, Trip } from './types';

// Spec 0067, REQ-014: "Füll die Woche: 2× vegetarisch, Mittwoch wenig Zeit, Samstag Gäste". The
// agent only passes the wishes (fill_week); which evenings are free, who is away and which dishes
// fit is the code's: the suggestion logic of spec 0063 (weekMenu for what fits, distributeWeek for
// where it goes) plus the wishes as hard rules. Pure: the app computes it from its cache, shows it
// as a collect card and plans it with planSuggested like "Was kochen wir?".

/** What the person asked for, checked (core agent-proposals.ts parseFillWeekArgs). */
export interface WeekFillWishes {
  from: ISODate;
  to: ISODate;
  /** The household's Tageszeit by name; unknown or none → the last one ("Abendessen"). */
  slot?: string;
  /** At least so many vegetarian or vegan dishes. */
  vegetarian?: number;
  /** "wenig Zeit": at most QUICK_MINUTES. */
  quick?: readonly ISODate[];
  guests?: readonly { date: ISODate; count: number }[];
  /** Evenings to leave free. */
  skip?: readonly ISODate[];
}

export interface WeekFillRow {
  date: ISODate;
  suggestion: PlanSuggestion;
  guests: number;
  /** Why it stands there besides the reason of spec 0063: "wenig Zeit", "2 Gäste", "Nadja ist weg". */
  notes: string[];
}

export interface WeekFillResult {
  slotId: string;
  slotName: string;
  rows: WeekFillRow[];
  /** Days of the range the code left out, with the reason. */
  skipped: { date: ISODate; reason: string }[];
  /** Set when nothing could be planned. */
  empty?: string;
}

/** "wenig Zeit" (REQ-014). */
export const QUICK_MINUTES = 30;
/** Days of one pass: a week, like "Was kochen wir?" (AGENT_PROPOSAL_LIMITS.weekDays). */
export const WEEK_FILL_DAYS = 7;
/** Pages of the Wochenkarte the dishes come from: enough for two weeks with variety. */
const MENU_PAGES = 4;

const vegetarian = (recipe: Recipe, input: SuggestionInput) =>
  ['vegan', 'vegetarian'].includes(
    deriveRecipeDiet(recipe, defaultVariantId(recipe), input.articlesById),
  );

function rangeOf(from: ISODate, to: ISODate, today: ISODate): ISODate[] {
  const start = from < today ? today : from;
  const days: ISODate[] = [];
  for (let day = start; day <= to && days.length < WEEK_FILL_DAYS; day = addDays(day, 1))
    days.push(day);
  return days;
}

export function fillWeek(
  input: SuggestionInput,
  trips: readonly Trip[],
  wishes: WeekFillWishes,
): WeekFillResult {
  const ordered = [...input.slots].sort((a, b) => a.sort - b.sort);
  const slot =
    ordered.find((candidate) => candidate.name === wishes.slot) ?? ordered[ordered.length - 1];
  const slotId = slot?.id ?? '';
  const slotName = slot?.name ?? 'Abendessen';
  const days = rangeOf(wishes.from, wishes.to, input.today);
  const free = new Set(freeEvenings(input.entries, days, slotId, input.today));
  const skip = new Set(wishes.skip ?? []);
  const members = input.members;
  const skipped: WeekFillResult['skipped'] = [];
  const open: ISODate[] = [];
  for (const date of days) {
    if (skip.has(date)) skipped.push({ date, reason: 'frei gelassen' });
    else if (!free.has(date)) skipped.push({ date, reason: 'schon belegt' });
    else if (members.length > 0 && members.every((m) => isOnTrip(m.id, date, trips)))
      skipped.push({ date, reason: 'alle verreist' });
    else open.push(date);
  }
  const result = (rows: WeekFillRow[], empty?: string): WeekFillResult => ({
    slotId,
    slotName,
    rows,
    skipped,
    ...(empty ? { empty } : {}),
  });
  if (open.length === 0) return result([], `An diesen Tagen ist kein ${slotName} frei`);

  // Spec 0063, decision 1: the whole household eats; a trip only shows as a note.
  const eaterIds = members.map((m) => m.id);
  const evenings: Evening[] = open.map((date) => ({ date, slotId, eaterIds }));
  const menu = weekMenu(input, evenings, MENU_PAGES);
  const quick = new Set(wishes.quick ?? []);
  const guests = new Map((wishes.guests ?? []).map((guest) => [guest.date, guest.count]));
  const fits = (dish: PlanSuggestion, date: ISODate) =>
    dish.fits.includes(date) &&
    (!quick.has(date) || (dish.recipe.totalMinutes ?? Infinity) <= QUICK_MINUTES) &&
    // A vorgemerkt dish keeps its entry (and its eaters): guests go to a new one.
    (!guests.has(date) || dish.plannedLaterEntryId === undefined);
  const pool = [...menu.planned, ...menu.picks].map((dish) => ({
    ...dish,
    fits: open.filter((date) => fits(dish, date)),
  }));
  if (pool.length === 0) return result([], 'Zu wenig passende Rezepte für diese Woche');

  // The most constrained evenings choose first; vegetarian dishes until the wish is met.
  let vegNeeded = Math.min(wishes.vegetarian ?? 0, open.length);
  const byConstraint = [...open].sort(
    (a, b) =>
      Number(quick.has(b)) +
        Number(guests.has(b)) -
        (Number(quick.has(a)) + Number(guests.has(a))) || daysBetween(b, a),
  );
  const chosen: PlanSuggestion[] = [];
  for (const date of byConstraint) {
    const candidates = pool.filter((dish) => !chosen.includes(dish) && dish.fits.includes(date));
    const veg = candidates.find((dish) => vegetarian(dish.recipe, input));
    // Vegetarian first while the wish is open; the most constrained evenings take theirs first.
    const pick = (vegNeeded > 0 ? veg : undefined) ?? candidates[0];
    if (!pick) continue;
    if (vegetarian(pick.recipe, input)) vegNeeded -= 1;
    chosen.push(pick);
  }

  const rows = distributeWeek(input, chosen, evenings).flatMap((assignment): WeekFillRow[] => {
    const { date, suggestion } = assignment;
    if (date === null) return [];
    const count = guests.get(date) ?? 0;
    const away = members.filter((m) => isOnTrip(m.id, date, trips)).map((m) => m.name);
    return [
      {
        date,
        suggestion,
        guests: count,
        notes: [
          ...(quick.has(date) ? ['wenig Zeit'] : []),
          ...(count > 0 ? [`${count} ${count === 1 ? 'Gast' : 'Gäste'}`] : []),
          ...(away.length > 0
            ? [`${away.join(' und ')} ${away.length === 1 ? 'ist' : 'sind'} weg`]
            : []),
        ],
      },
    ];
  });
  return result(rows, rows.length === 0 ? 'Zu wenig passende Rezepte für diese Woche' : undefined);
}

/** The button of the card: "5 Abende einplanen". */
export function fillWeekLabel(count: number): string {
  return `${count} ${count === 1 ? 'Abend' : 'Abende'} einplanen`;
}
