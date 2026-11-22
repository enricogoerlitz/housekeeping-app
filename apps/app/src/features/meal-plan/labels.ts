import {
  dayMonthLabel,
  parseISODate,
  planEntryTitle,
  weekdayShort,
  type Id,
  type ISODate,
  type MealPlanEntry,
  type Member,
  type PlanEntryVariant,
  type Recipe,
  type TimeOfDay,
} from '@housekeeping/core';

/** "Mo 17". */
export function dayLabel(date: ISODate): string {
  return `${weekdayShort(date)} ${parseISODate(date).getDate()}`;
}

/** Title of the add window: "Sa 2. Jan · Abend", "Fr 1. Jan" (no Tageszeit chosen), "Vormerken". */
export function addSheetTitle(
  date: ISODate | null,
  slotName: string | undefined,
  slotChosen: boolean,
): string {
  if (date === null) return 'Vormerken';
  const day = dayMonthLabel(date);
  return slotChosen && slotName ? `${day} · ${slotName}` : day;
}

/**
 * What the plan shows as the entry's name, with its Zusatz wherever the name stands (spec 0021,
 * REQ-008): "Lasagne (doppelte Menge)", "Eislaufen (Hohenschönhausen)", "Reste von Donnerstag".
 * The rule lives in core (`planEntryTitle`), which the scheduler mirrors in SQL.
 */
export function entryTitle(
  entry: MealPlanEntry,
  recipesById: Record<Id, Recipe>,
  entries: MealPlanEntry[],
  restaurantsById: Record<Id, { name: string }> = {},
  activitiesById: Record<Id, { name: string }> = {},
): string {
  return planEntryTitle(entry, recipesById, entries, restaurantsById, activitiesById);
}

/** "mit Tofu 1 · mit Hähnchen 1" for a split that is not saved yet. */
export function splitSummary(recipe: Recipe, variants: PlanEntryVariant[]): string {
  return recipe.variants
    .flatMap((variant) => {
      const row = variants.find((candidate) => candidate.variantId === variant.id);
      return row && row.portions > 0 ? [`${variant.name} ${row.portions}`] : [];
    })
    .join(' · ');
}

/** "Passt nicht für Nadja", "Passt nicht für Enrico und Nadja". */
export function misfitText(members: Member[]): string {
  return `Passt nicht für ${members.map((member) => member.name).join(' und ')}`;
}

/** "Uhrzeit" of a restaurant or activity entry (spec 0021, REQ-013); other kinds never have one. */
export function entryTime(entry: MealPlanEntry): TimeOfDay | undefined {
  return entry.kind === 'restaurant' || entry.kind === 'activity' ? entry.startsAt : undefined;
}
