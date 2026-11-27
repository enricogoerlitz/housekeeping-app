// Step 1 of "Auf die Einkaufsliste" (spec 0006, REQ-008; spec 0025, REQ-001): which plan entries
// the window shows for seven days from a start day and which of them start out selected.
import {
  collectionContributions,
  collectionRecipeCountLabel,
  contentsInBook,
  type RecipeBook,
} from './collections';
import { dateRangeLabel } from './calendar';
import { addDays, isoWeekNumber, parseISODate, startOfWeek, weekdayShort } from './dates';
import { entriesForDay, orderSlotEntries } from './meal-plan';
import { contributionsFromEntry } from './shopping';
import type { Id, ISODate, MealPlanEntry, Recipe, ShoppingItem } from './types';

/**
 * True when the entry can bring something onto the list: a recipe entry whose recipe yields at
 * least one contribution. Restaurants, activities, free text and leftovers have nothing to buy;
 * a recipe without ingredients (or only "skip" ones) is left out like them (AC-061, Offene Frage 5),
 * and so is a collection without anything to buy in it or its recipes (spec 0009, REQ-008).
 */
export function canPutOnList(
  entry: MealPlanEntry,
  recipe: Recipe | undefined,
  book: RecipeBook,
): boolean {
  if (entry.kind !== 'recipe' || recipe === undefined) return false;
  // The pantry flag does not decide whether something is bought, so no articles are needed here.
  if (recipe.kind === 'collection') {
    return (
      collectionContributions(
        recipe,
        contentsInBook(recipe, book),
        {},
        { portions: entry.portions },
      ).length > 0
    );
  }
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
  return contributionsFromEntry(entry, recipe, {}, '').length > 0;
}

/** The row of step 1: "Grillabend (2 Rezepte)" for a collection, "Sommerfest" without recipes. */
export function listPickerEntryLabel(recipe: Recipe, book: RecipeBook): string {
  if (recipe.kind !== 'collection') return recipe.title;
  const count = collectionRecipeCountLabel(contentsInBook(recipe, book).length);
  return count === '' ? recipe.title : `${recipe.title} (${count})`;
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

export interface ListPickerInput extends RecipeBook {
  entries: readonly MealPlanEntry[];
  /** All items of the list, open and checked. */
  items: readonly ShoppingItem[];
  today: ISODate;
  /** First day of the seven shown (listPickerStart, shiftListPickerStart); never before today. */
  start: ISODate;
  /** Meal slot ids in their order, for the order of entries within a day. */
  slotOrder: readonly Id[];
}

export interface ListPickerEntry {
  entry: MealPlanEntry;
  recipe: Recipe;
  /** listPickerEntryLabel: the title, for a collection with the number of its recipes. */
  label: string;
  /** "steht schon auf der Liste". */
  onList: boolean;
}

export interface ListPickerDay {
  date: ISODate;
  isToday: boolean;
  entries: ListPickerEntry[];
}

export interface ListPickerGroup {
  weekNumber: number;
  /** "KW 48 · 23.–28. Nov": the week and the days of it that the page shows. */
  label: string;
  /** Only days with something to put on the list. */
  days: ListPickerDay[];
}

export interface ListPickerPage {
  start: ISODate;
  /** The last of the seven days. */
  end: ISODate;
  /** "22.–28. Nov", "29. Nov – 5. Dez". */
  title: string;
  /** Weeks with at least one day to show; empty when nothing is planned (AC-006). */
  groups: ListPickerGroup[];
  /** "Vorgemerkt": entries without a day, the same on every page. */
  parked: ListPickerEntry[];
  /** ‹ is possible: the page does not start today. */
  canGoBack: boolean;
}

/** How many days one page of "Was soll auf die Liste?" shows (spec 0025, REQ-001). */
export const LIST_PICKER_DAYS = 7;

/**
 * The first day of the window (Decision 2): from the calendar the Monday of the week shown there
 * when it lies after today, else today (AC-003, AC-004).
 */
export function listPickerStart(today: ISODate, calendarWeek?: ISODate): ISODate {
  if (calendarWeek === undefined) return today;
  const monday = startOfWeek(calendarWeek);
  return monday > today ? monday : today;
}

/** ‹ and › move by seven days; ‹ never goes before today (AC-002, AC-003). */
export function shiftListPickerStart(start: ISODate, today: ISODate, direction: 1 | -1): ISODate {
  const next = addDays(start, direction * LIST_PICKER_DAYS);
  return next < today ? today : next;
}

function pickerEntries(
  entries: MealPlanEntry[],
  book: RecipeBook,
  onList: ReadonlySet<Id>,
): ListPickerEntry[] {
  return entries.flatMap((entry) => {
    const recipe = entry.recipeId === undefined ? undefined : book.recipesById[entry.recipeId];
    return recipe !== undefined && canPutOnList(entry, recipe, book)
      ? [{ entry, recipe, label: listPickerEntryLabel(recipe, book), onList: onList.has(entry.id) }]
      : [];
  });
}

/**
 * What the window shows for seven days from `start`: the days with eligible recipe entries,
 * grouped by calendar week, then "Vorgemerkt" (REQ-001).
 */
export function listPickerPage(input: ListPickerInput): ListPickerPage {
  const onList = entryIdsOnList(input.items);
  const entries = [...input.entries];
  const dates = Array.from({ length: LIST_PICKER_DAYS }, (_, index) => addDays(input.start, index));
  const end = dates[dates.length - 1] ?? input.start;

  const groups: ListPickerGroup[] = [];
  for (const date of dates) {
    const weekNumber = isoWeekNumber(date);
    const weekDays = dates.filter((day) => startOfWeek(day) === startOfWeek(date));
    let group = groups.find((candidate) => candidate.weekNumber === weekNumber);
    if (!group) {
      const first = weekDays[0] ?? date;
      const last = weekDays[weekDays.length - 1] ?? date;
      group = { weekNumber, label: `KW ${weekNumber} · ${dateRangeLabel(first, last)}`, days: [] };
      groups.push(group);
    }
    const dayEntries = pickerEntries(
      entriesForDay(entries, date, [...input.slotOrder]),
      input,
      onList,
    );
    if (dayEntries.length > 0) {
      group.days.push({ date, isToday: date === input.today, entries: dayEntries });
    }
  }

  const slotPosition = (entry: MealPlanEntry): number => {
    const index = input.slotOrder.indexOf(entry.slotId);
    return index === -1 ? input.slotOrder.length : index;
  };
  // orderSlotEntries sets the order within a slot; the stable sort then groups by slot.
  const parked = orderSlotEntries(entries.filter((entry) => entry.date === null)).sort(
    (a, b) => slotPosition(a) - slotPosition(b),
  );

  return {
    start: input.start,
    end,
    title: dateRangeLabel(input.start, end),
    groups: groups.filter((group) => group.days.length > 0),
    parked: pickerEntries(parked, input, onList),
    canGoBack: input.start > input.today,
  };
}

/**
 * Entry ids selected when the window opens (Decision 2): entries of the start page that are not
 * on the list yet. Other pages and "Vorgemerkt" start unselected.
 */
export function listPickerPreselection(input: ListPickerInput): Id[] {
  return listPickerPage(input).groups.flatMap((group) =>
    group.days.flatMap((day) =>
      day.entries.filter((row) => !row.onList).map((row) => row.entry.id),
    ),
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

/** The head of a day in the window: "So 22 · heute", "Mo 23". */
export function listPickerDayLabel(day: Pick<ListPickerDay, 'date' | 'isToday'>): string {
  const label = `${weekdayShort(day.date)} ${parseISODate(day.date).getDate()}`;
  return day.isToday ? `${label} · heute` : label;
}

/** The button of step 1: "Weiter: 3 Gerichte", "Weiter: 1 Gericht", "Weiter" when none is chosen. */
export function listPickerContinueLabel(dishes: number, recurring = 0): string {
  const parts = [
    dishes > 0 ? `${dishes} ${dishes === 1 ? 'Gericht' : 'Gerichte'}` : '',
    // Spec 0060, AC-024: Dauerposten chosen under "Regelmäßig".
    recurring > 0 ? `${recurring} Dauerposten` : '',
  ].filter(Boolean);
  return parts.length === 0 ? 'Weiter' : `Weiter: ${parts.join(' · ')}`;
}
