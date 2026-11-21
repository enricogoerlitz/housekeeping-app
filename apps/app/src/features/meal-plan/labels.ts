import {
  dayMonthLabel,
  formatLongDate,
  parseISODate,
  weekdayShort,
  withNote,
  type Id,
  type ISODate,
  type MealPlanEntry,
  type Member,
  type PlanEntryVariant,
  type Recipe,
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

function weekdayLong(date: ISODate): string {
  return formatLongDate(date).split(',')[0] ?? '';
}

/**
 * What the plan shows as the entry's name: recipe title, free text, "Reste von Donnerstag", the
 * restaurant's name or the activity with its Zusatz, "Eislaufen (Hohenschönhausen)". Unknown kinds
 * fall back to their text, so a newer entry never breaks the plan.
 */
export function entryTitle(
  entry: MealPlanEntry,
  recipesById: Record<Id, Recipe>,
  entries: MealPlanEntry[],
  restaurantsById: Record<Id, { name: string }> = {},
  activitiesById: Record<Id, { name: string }> = {},
): string {
  switch (entry.kind) {
    case 'recipe':
      return (entry.recipeId ? recipesById[entry.recipeId]?.title : undefined) ?? 'Rezept';
    case 'leftovers': {
      const source = entries.find((candidate) => candidate.id === entry.leftoversOfEntryId);
      return source?.date ? `Reste von ${weekdayLong(source.date)}` : 'Reste';
    }
    case 'restaurant':
      return (
        (entry.restaurantId ? restaurantsById[entry.restaurantId]?.name : undefined) ??
        entry.text ??
        'Restaurant'
      );
    case 'activity':
      return withNote(
        (entry.activityId ? activitiesById[entry.activityId]?.name : undefined) ??
          entry.text ??
          'Aktivität',
        entry.note,
      );
    default:
      return entry.text ?? '';
  }
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
