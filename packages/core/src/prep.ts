import { contentsInBook, type RecipeBook } from './collections';
import { addDays, formatShortDate, weekdayShort } from './dates';
import type { ISODate, MealPlanEntry, MealSlot, Recipe, TimeOfDay } from './types';

// Vorbereitung (spec 0020, REQ-006, REQ-007): a recipe's Vorlauf shows on the day one has to
// start at the latest. The rules exist twice: here and in `private.prep_items` (SQL), kept equal
// by the same cases in prep.test.ts and notification_parity.test.sql.

const SLOT_START_TIMES: Record<string, TimeOfDay> = {
  Vormittag: '08:00',
  Mittag: '11:00',
  Abend: '17:00',
};
const FALLBACK_START: TimeOfDay = '08:00';

/**
 * The Kochbeginn of a Tageszeit (Entscheidung 8), also the suggested reminder time (spec 0017):
 * by the Tageszeit's name; renamed or own ones start at 8 Uhr.
 */
export function slotStartTime(slotName: string): TimeOfDay {
  return SLOT_START_TIMES[slotName.trim()] ?? FALLBACK_START;
}

/** The longest Vorlauf the recipe editor allows (RECIPE_LIMITS.leadTimeHoursMax). */
const MAX_PREP_HOURS = 168;

/** A start between 0 and 6 Uhr counts as the evening before (Entscheidung 9). */
const NIGHT_ENDS_HOUR = 6;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The day and time to start a Vorlauf: entry day + Kochbeginn − `hoursBefore`. `at` undefined
 * means "the evening before" (the start falls between 0 and 6 Uhr).
 */
export function prepStart(
  entryDate: ISODate,
  startTime: TimeOfDay,
  hoursBefore: number,
): { day: ISODate; at: TimeOfDay | undefined } {
  const [hours = 0, minutes = 0] = startTime.split(':').map(Number);
  const total = hours * 60 + minutes - hoursBefore * 60;
  const dayOffset = Math.floor(total / (24 * 60));
  const inDay = total - dayOffset * 24 * 60;
  const day = addDays(entryDate, dayOffset);
  if (inDay < NIGHT_ENDS_HOUR * 60) return { day: addDays(day, -1), at: undefined };
  return { day, at: `${pad(Math.floor(inDay / 60))}:${pad(inDay % 60)}` };
}

export interface PrepItem {
  key: string;
  entry: MealPlanEntry;
  /** The recipe with the Vorlauf; for a collection the contained recipe. */
  recipe: Recipe;
  /** Set when the recipe stands in a planned collection. */
  collection?: Recipe;
  slotName: string;
  day: ISODate;
  /** undefined = in the evening of `day`. */
  at: TimeOfDay | undefined;
}

/**
 * Every Vorlauf of the plan (REQ-006): planned recipes and every recipe of a planned collection
 * with a Vorlauf; never leftovers, free text, restaurants, activities or reserved entries.
 */
export function prepItems(input: {
  entries: readonly MealPlanEntry[];
  book: RecipeBook;
  slots: readonly MealSlot[];
}): PrepItem[] {
  const slotNames = new Map(input.slots.map((slot) => [slot.id, slot.name]));
  return input.entries.flatMap((entry): PrepItem[] => {
    if (entry.kind !== 'recipe' || entry.date === null || entry.notDone) return [];
    const planned =
      entry.recipeId === undefined ? undefined : input.book.recipesById[entry.recipeId];
    if (planned === undefined) return [];
    const slotName = slotNames.get(entry.slotId) ?? '';
    const date = entry.date;
    const withLead =
      planned.kind === 'collection'
        ? contentsInBook(planned, input.book).map((content) => content.recipe)
        : [planned];
    return withLead.flatMap((recipe): PrepItem[] => {
      // Only what the editor writes (1–168 whole hours), as in SQL.
      const hours = recipe.leadTime?.hoursBefore;
      if (!recipe.leadTime || !Number.isInteger(hours) || hours === undefined) return [];
      if (hours < 1 || hours > MAX_PREP_HOURS) return [];
      const start = prepStart(date, slotStartTime(slotName), recipe.leadTime.hoursBefore);
      return [
        {
          key: `${entry.id}:${recipe.id}`,
          entry,
          recipe,
          collection: planned.kind === 'collection' ? planned : undefined,
          slotName,
          ...start,
        },
      ];
    });
  });
}

export type PrepWhen = { kind: 'due' } | { kind: 'until'; at: TimeOfDay } | { kind: 'evening' };

export interface PrepLine {
  key: string;
  entryId: string;
  when: PrepWhen;
  /** "Heute bis ca. 23 Uhr", "Heute Abend", "Schon fällig", "Bis ca. 23 Uhr", "Abends". */
  whenLabel: string;
  /** "Kichererbsen einweichen". */
  leadText: string;
  /** "Hummus", in a collection "Grillabend: Grillspieße". */
  title: string;
  /** "heute Abend", "morgen Mittag", "Di 24.11., Abend". */
  dayLabel: string;
  /** The whole line: `<Wann>: <Vorlauf> · <Rezept> (<Tag, Tageszeit>)`. */
  text: string;
  /** The entry, for who cooks and who eats it. */
  entry: MealPlanEntry;
}

/** "23 Uhr", "8:30 Uhr". */
function hourLabel(at: TimeOfDay): string {
  const [hours = '0', minutes = '00'] = at.split(':');
  return minutes === '00' ? `${Number(hours)} Uhr` : `${Number(hours)}:${minutes} Uhr`;
}

function entryDayLabel(date: ISODate, slotName: string, today: ISODate): string {
  if (date === today) return `heute ${slotName}`;
  if (date === addDays(today, 1)) return `morgen ${slotName}`;
  return `${weekdayShort(date)} ${formatShortDate(date)}, ${slotName}`;
}

function whenLabel(when: PrepWhen, isToday: boolean): string {
  if (when.kind === 'due') return 'Schon fällig';
  if (when.kind === 'evening') return isToday ? 'Heute Abend' : 'Abends';
  return `${isToday ? 'Heute bis' : 'Bis'} ca. ${hourLabel(when.at)}`;
}

/** Sort key within a day: "Schon fällig" first, then by start, the evening last. */
function rank(item: PrepItem, when: PrepWhen): string {
  if (when.kind === 'due') return `0 ${item.day} ${item.at ?? '24:00'}`;
  return `1 ${item.at ?? '24:00'}`;
}

export interface PrepInput {
  entries: readonly MealPlanEntry[];
  book: RecipeBook;
  slots: readonly MealSlot[];
  shown: ISODate;
  today: ISODate;
  /** The household's time now ("HH:MM"), for "Schon fällig". */
  now: TimeOfDay;
}

/**
 * The prep lines of the shown day (REQ-006, AC-027–AC-032): today every start of today, plus
 * "Schon fällig" for a missed start of an entry today or later; a later day its starts; a past
 * day none.
 */
export function prepLines(input: PrepInput): PrepLine[] {
  const { shown, today, now } = input;
  if (shown < today) return [];
  const isToday = shown === today;
  return prepItems(input)
    .flatMap((item) => {
      const date = item.entry.date ?? item.day;
      let when: PrepWhen | undefined;
      if (isToday) {
        const missed =
          item.day < today || (item.day === today && item.at !== undefined && item.at < now);
        if (missed && date >= today) when = { kind: 'due' };
        else if (item.day === today)
          when = item.at === undefined ? { kind: 'evening' } : { kind: 'until', at: item.at };
      } else if (item.day === shown) {
        when = item.at === undefined ? { kind: 'evening' } : { kind: 'until', at: item.at };
      }
      return when === undefined ? [] : [{ item, when }];
    })
    .sort(
      (a, b) =>
        rank(a.item, a.when).localeCompare(rank(b.item, b.when)) ||
        (a.item.key < b.item.key ? -1 : a.item.key > b.item.key ? 1 : 0),
    )
    .map(({ item, when }) => {
      const label = whenLabel(when, isToday);
      const leadText = item.recipe.leadTime?.text ?? '';
      const title = item.collection
        ? `${item.collection.title}: ${item.recipe.title}`
        : item.recipe.title;
      const dayLabel = entryDayLabel(item.entry.date ?? item.day, item.slotName, today);
      return {
        key: item.key,
        entryId: item.entry.id,
        when,
        whenLabel: label,
        leadText,
        title,
        dayLabel,
        text: `${label}: ${leadText} · ${title} (${dayLabel})`,
        entry: item.entry,
      };
    });
}

/**
 * The part "Vorbereiten" of the daily summary (REQ-007, AC-033): "Vorbereiten: Fleisch marinieren
 * (bis ca. 17 Uhr), Kichererbsen einweichen (bis ca. 23 Uhr)"; undefined without a line.
 */
export function prepSummary(lines: readonly PrepLine[]): string | undefined {
  if (lines.length === 0) return undefined;
  const parts = lines.map((line) => {
    const when =
      line.when.kind === 'due'
        ? 'schon fällig'
        : line.when.kind === 'evening'
          ? 'heute Abend'
          : `bis ca. ${hourLabel(line.when.at)}`;
    return `${line.leadText} (${when})`;
  });
  return `Vorbereiten: ${parts.join(', ')}`;
}
