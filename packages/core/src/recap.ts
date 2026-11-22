import { addDays, weekdayLong } from './dates';
import { entriesForDay } from './meal-plan';
import { formatStars, ratedOnOrAfter } from './ratings';
import type { Activity, Id, ISODate, MealPlanEntry, Recipe, Restaurant } from './types';

// "Wie war's?" (spec 0011, REQ-003): what a member has not rated yet from the last three days.

/** How many days before today "Wie war's?" looks back: yesterday, the day before, and one more. */
export const RECAP_DAYS = 3;

export interface RecapItem {
  /** The youngest plan entry of the target; "Nicht gemacht" marks this one. */
  entry: MealPlanEntry;
  kind: 'recipe' | 'collection' | 'restaurant' | 'activity';
  /** The recipe (also a collection), restaurant or activity that gets the rating. */
  targetId: Id;
  title: string;
  /** The member's earlier rating; the stars start empty and show it faded (spec 0020, AC-040). */
  stars?: number;
}

type Rated = Pick<Recipe, 'ratings' | 'ratedAt'>;

/**
 * The rows of "Wie war's?" for one member (AC-015, AC-016, AC-020, AC-021): recipes, restaurants
 * and activities planned from today − 3 to yesterday, without free text, leftovers and entries
 * marked "nicht gekocht"/"nicht gemacht", only where the member stood under "Wer isst mit?"
 * (empty = everyone, Offene Frage 8). Each target appears once, on its youngest day; it is left
 * out once the member rated it on that day or later (Offene Frage 1 A). Youngest day first,
 * within a day in the order of the day (Tageszeit, then kind).
 */
export function recapItems(input: {
  entries: MealPlanEntry[];
  recipesById: Record<Id, Recipe>;
  restaurantsById: Record<Id, Restaurant>;
  activitiesById: Record<Id, Activity>;
  memberId: Id;
  today: ISODate;
  slotOrder: Id[];
}): RecapItem[] {
  const { memberId } = input;
  const seen = new Set<string>();
  const items: RecapItem[] = [];

  const target = (
    entry: MealPlanEntry,
  ): { kind: RecapItem['kind']; id: Id; title: string; rated: Rated } | undefined => {
    if (entry.kind === 'recipe' && entry.recipeId !== undefined) {
      const recipe = input.recipesById[entry.recipeId];
      return (
        recipe && {
          kind: recipe.kind === 'collection' ? 'collection' : 'recipe',
          id: recipe.id,
          title: recipe.title,
          rated: recipe,
        }
      );
    }
    if (entry.kind === 'restaurant' && entry.restaurantId !== undefined) {
      const place = input.restaurantsById[entry.restaurantId];
      return place && { kind: 'restaurant', id: place.id, title: place.name, rated: place };
    }
    if (entry.kind === 'activity' && entry.activityId !== undefined) {
      const activity = input.activitiesById[entry.activityId];
      return (
        activity && { kind: 'activity', id: activity.id, title: activity.name, rated: activity }
      );
    }
    return undefined;
  };

  for (let back = 1; back <= RECAP_DAYS; back++) {
    const date = addDays(input.today, -back);
    for (const entry of entriesForDay(input.entries, date, input.slotOrder)) {
      if (entry.notDone) continue;
      if (entry.eaterIds.length > 0 && !entry.eaterIds.includes(memberId)) continue;
      const found = target(entry);
      if (found === undefined) continue;
      const key = `${found.kind}:${found.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (ratedOnOrAfter(found.rated.ratedAt?.[memberId], date)) continue;
      items.push({
        entry,
        kind: found.kind,
        targetId: found.id,
        title: found.title,
        stars: found.rated.ratings[memberId],
      });
    }
  }
  return items;
}

/** The day of a row: "gestern", "vorgestern", else the weekday ("Freitag", AC-015). */
export function recapDayLabel(date: ISODate, today: ISODate): string {
  if (date === addDays(today, -1)) return 'gestern';
  if (date === addDays(today, -2)) return 'vorgestern';
  return weekdayLong(date);
}

/**
 * The faded earlier rating beside empty stars (spec 0020, REQ-009, AC-040, AC-042): "Letztes Mal
 * ★ 4", "Letztes Mal ★ 3,5"; undefined without an own rating (then no "Passt so" either).
 */
export function recapEarlierLabel(stars: number | undefined): string | undefined {
  return stars === undefined ? undefined : `Letztes Mal ★ ${formatStars(stars)}`;
}

/** The hint with "Rückgängig" after "Nicht gemacht" (spec 0020, REQ-008, AC-036). */
export function notDoneMessage(title: string): string {
  return `„${title}“ als nicht gemacht markiert`;
}
