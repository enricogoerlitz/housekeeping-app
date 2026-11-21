// Step 1 of "Auf die Einkaufsliste" (spec 0006, REQ-008, D21): which plan entries the window
// shows for a week and which of them start out selected.
import { isoWeekNumber, parseISODate, startOfWeek, weekdayShort, weekDates } from './dates';
import { entriesForDay, orderSlotEntries } from './meal-plan';
import { contributionsFromEntry } from './shopping';
import type { Id, ISODate, MealPlanEntry, Recipe, ShoppingItem } from './types';

/**
 * True when the entry can bring something onto the list: a recipe entry whose recipe yields at
 * least one contribution. Restaurants, activities, free text and leftovers have nothing to buy;
 * a recipe without ingredients (or only "skip" ones) is left out like them (AC-061, Offene Frage 5).
 */
export function canPutOnList(entry: MealPlanEntry, recipe: Recipe | undefined): boolean {
  if (entry.kind !== 'recipe' || recipe === undefined) return false;
  // The pantry flag does not decide whether something is bought, so no articles are needed here.
  return contributionsFromEntry(entry, recipe, {}, '').length > 0;
}

/**
 * The same rule for a recipe put on the list straight from its page with the portions and variants
 * shown there (AC-060): it needs at least one ingredient to buy.
 */
export function canPutRecipeOnList(
  recipe: Recipe,
  portions: number,
  variants: MealPlanEntry['variants'],
): boolean {
  const entry: MealPlanEntry = {
    id: '',
    date: null,
    slotId: '',
    kind: 'recipe',
    recipeId: recipe.id,
    eaterIds: [],
    guests: 0,
    portions,
    variants,
    sort: 0,
  };
  return canPutOnList(entry, recipe);
}

/** Plan entries with a contribution on one of the given items, open or checked (REQ-008). */
export function entryIdsOnList(items: readonly ShoppingItem[]): Set<Id> {
  const ids = new Set<Id>();
  for (const item of items) {
    for (const contribution of item.contributions) {
      if (contribution.source.kind === 'recipe' && contribution.source.entryId !== undefined) {
        ids.add(contribution.source.entryId);
      }
    }
  }
  return ids;
}

export interface ListPickerInput {
  entries: readonly MealPlanEntry[];
  recipesById: Readonly<Record<Id, Recipe>>;
  /** All items of the list, open and checked. */
  items: readonly ShoppingItem[];
  today: ISODate;
  /** Any day of the week to show; for the preselection the week the window opens with. */
  week: ISODate;
  /** Meal slot ids in their order, for the order of entries within a day. */
  slotOrder: readonly Id[];
}

export interface ListPickerEntry {
  entry: MealPlanEntry;
  recipe: Recipe;
  /** "steht schon auf der Liste". */
  onList: boolean;
}

export interface ListPickerDay {
  date: ISODate;
  isToday: boolean;
  /** "vorbei": before today. */
  isPast: boolean;
  entries: ListPickerEntry[];
}

export interface ListPickerWeek {
  /** Monday of the week. */
  weekStart: ISODate;
  weekNumber: number;
  /** Only days with something to put on the list, Monday first. */
  days: ListPickerDay[];
  /** "Vorgemerkt": entries without a day, the same in every week. */
  parked: ListPickerEntry[];
}

function pickerEntries(
  entries: MealPlanEntry[],
  recipesById: Readonly<Record<Id, Recipe>>,
  onList: ReadonlySet<Id>,
): ListPickerEntry[] {
  return entries.flatMap((entry) => {
    const recipe = entry.recipeId === undefined ? undefined : recipesById[entry.recipeId];
    return recipe !== undefined && canPutOnList(entry, recipe)
      ? [{ entry, recipe, onList: onList.has(entry.id) }]
      : [];
  });
}

/** What the window shows for one week: its days with eligible recipe entries, then "Vorgemerkt". */
export function listPickerWeek(input: ListPickerInput): ListPickerWeek {
  const onList = entryIdsOnList(input.items);
  const entries = [...input.entries];
  const days = weekDates(input.week).flatMap((date): ListPickerDay[] => {
    const dayEntries = pickerEntries(
      entriesForDay(entries, date, [...input.slotOrder]),
      input.recipesById,
      onList,
    );
    return dayEntries.length === 0
      ? []
      : [{ date, isToday: date === input.today, isPast: date < input.today, entries: dayEntries }];
  });

  const slotPosition = (entry: MealPlanEntry): number => {
    const index = input.slotOrder.indexOf(entry.slotId);
    return index === -1 ? input.slotOrder.length : index;
  };
  // orderSlotEntries sets the order within a slot; the stable sort then groups by slot.
  const parked = orderSlotEntries(entries.filter((entry) => entry.date === null)).sort(
    (a, b) => slotPosition(a) - slotPosition(b),
  );

  return {
    weekStart: startOfWeek(input.week),
    weekNumber: isoWeekNumber(input.week),
    days,
    parked: pickerEntries(parked, input.recipesById, onList),
  };
}

/**
 * Entry ids selected when the window opens (D21 A): entries of the starting week from today on
 * that are not on the list yet. Past days, other weeks and "Vorgemerkt" start unselected.
 */
export function listPickerPreselection(input: ListPickerInput): Id[] {
  return listPickerWeek(input).days.flatMap((day) =>
    day.isPast ? [] : day.entries.filter((row) => !row.onList).map((row) => row.entry.id),
  );
}

/**
 * A tap on a day (Offene Frage 4c): selects all its entries; when all are selected already,
 * deselects them. Returns a new set.
 */
export function toggleDaySelection(selected: ReadonlySet<Id>, dayEntryIds: readonly Id[]): Set<Id> {
  const next = new Set(selected);
  const allSelected = dayEntryIds.every((id) => selected.has(id));
  for (const id of dayEntryIds) {
    if (allSelected) next.delete(id);
    else next.add(id);
  }
  return next;
}

/** The head of a day in the window: "Fr 20 · heute", "Do 19 · vorbei", "Sa 21". */
export function listPickerDayLabel(
  day: Pick<ListPickerDay, 'date' | 'isToday' | 'isPast'>,
): string {
  const label = `${weekdayShort(day.date)} ${parseISODate(day.date).getDate()}`;
  if (day.isToday) return `${label} · heute`;
  return day.isPast ? `${label} · vorbei` : label;
}

/** The button of step 1: "Weiter: 3 Gerichte", "Weiter: 1 Gericht", "Weiter" when none is chosen. */
export function listPickerContinueLabel(dishes: number): string {
  if (dishes <= 0) return 'Weiter';
  return `Weiter: ${dishes} ${dishes === 1 ? 'Gericht' : 'Gerichte'}`;
}
