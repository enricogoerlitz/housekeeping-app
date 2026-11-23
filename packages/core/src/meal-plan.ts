import { formatQty } from './amounts';
import { addDays, daysBetween, formatShortDate, startOfWeek, weekdayShort } from './dates';
import { deriveRecipeDiet, dietFitsPreference } from './diet';
import { defaultVariantId } from './recipes';
import type {
  Article,
  Diet,
  Id,
  ISODate,
  MealPlanEntry,
  Member,
  PlanEntryVariant,
  Recipe,
} from './types';

// What a member who eats everything is served first. "unknown" comes last: a variant is not
// preferred just because its ingredients could not be identified.
const FLEXIBLE_RANK: Record<Diet, number> = {
  // Never derived for a variant (spec 0023, REQ-008); listed for the type only.
  non_food: 0,
  unknown: 0,
  vegan: 1,
  vegetarian: 2,
  fish: 3,
  meat: 4,
};

export interface VariantSplit {
  portions: number;
  /** Empty for recipes without variants. */
  variants: PlanEntryVariant[];
  /**
   * Members for whom no variant (or the base recipe) fits their diet preference. A diet that is
   * not known (no ingredients, or ingredients without an article) is no conflict.
   */
  misfitMemberIds: Id[];
}
/**
 * Splits portions over variants: one portion per eater and guest.
 * Vegan/vegetarian members get a fitting variant (the default if it fits), else one whose diet is
 * unknown. Flexible members get the variant with the "highest" diet (meat > fish > vegetarian >
 * vegan), guests the default.
 * Among equally good variants the default wins, then the recipe's order.
 * Members without a fitting variant are listed in misfitMemberIds and counted on the default.
 * Mango-Curry (mit Tofu*, mit Hähnchen), Nadja vegetarian + Enrico flexible →
 * [{ tofu, 1 }, { haehnchen, 1 }]. Variants with 0 portions are omitted; the rest keep the
 * recipe's order.
 */
export function splitVariants(
  recipe: Recipe,
  eaters: Member[],
  guests: number,
  articlesById: Record<Id, Article>,
): VariantSplit {
  const guestCount = Math.max(0, guests);
  const portions = eaters.length + guestCount;

  if (recipe.variants.length === 0) {
    const diet = deriveRecipeDiet(recipe, undefined, articlesById);
    const misfitMemberIds =
      diet === 'unknown'
        ? []
        : eaters
            .filter((member) => !dietFitsPreference(diet, member.dietPreference))
            .map((member) => member.id);
    return { portions, variants: [], misfitMemberIds };
  }

  const defaultId = defaultVariantId(recipe);
  // Default first, so that it wins whenever several variants are equally good.
  const candidates = [...recipe.variants]
    .sort((a, b) => Number(b.id === defaultId) - Number(a.id === defaultId))
    .map((variant) => ({
      id: variant.id,
      diet: deriveRecipeDiet(recipe, variant.id, articlesById),
    }));

  const pickVariantId = (member: Member): Id | undefined => {
    if (member.dietPreference !== 'flexible') {
      return (
        candidates.find((candidate) => dietFitsPreference(candidate.diet, member.dietPreference)) ??
        candidates.find((candidate) => candidate.diet === 'unknown')
      )?.id;
    }
    let best = candidates[0];
    for (const candidate of candidates) {
      if (best && FLEXIBLE_RANK[candidate.diet] > FLEXIBLE_RANK[best.diet]) best = candidate;
    }
    return best?.id;
  };

  const portionsByVariant = new Map<Id, number>();
  const serve = (variantId: Id | undefined, count: number): void => {
    if (variantId === undefined || count <= 0) return;
    portionsByVariant.set(variantId, (portionsByVariant.get(variantId) ?? 0) + count);
  };

  const misfitMemberIds: Id[] = [];
  for (const member of eaters) {
    const variantId = pickVariantId(member);
    if (variantId === undefined) misfitMemberIds.push(member.id);
    serve(variantId ?? defaultId, 1);
  }
  serve(defaultId, guestCount);

  const variants = recipe.variants.flatMap((variant) => {
    const count = portionsByVariant.get(variant.id);
    return count === undefined ? [] : [{ variantId: variant.id, portions: count }];
  });
  return { portions, variants, misfitMemberIds };
}
/** "Eislaufen (Hohenschönhausen)"; the title alone without a Zusatz. */
export function withNote(title: string, note?: string): string {
  const zusatz = note?.trim();
  return zusatz ? `${title} (${zusatz})` : title;
}

// A Record over every kind, so a new kind cannot be added without deciding where it goes.
const KIND_RANK: Record<MealPlanEntry['kind'], number> = {
  activity: 0,
  recipe: 1,
  text: 1,
  leftovers: 1,
  restaurant: 2,
};

function compareInSlot(a: MealPlanEntry, b: MealPlanEntry): number {
  return (
    KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
    a.sort - b.sort ||
    // Equal sort values happen when two devices add at once; the id keeps the order identical.
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Entries of one Tageszeit in display order: activities, then recipes (also free text and
 * leftovers), then restaurants; within a group by entry.sort (the order they were added), then id.
 * Returns a new array.
 */
export function orderSlotEntries(entries: MealPlanEntry[]): MealPlanEntry[] {
  return [...entries].sort(compareInSlot);
}

/**
 * Entries of one day sorted by slot order, then as in orderSlotEntries; unknown slots come last.
 */
export function entriesForDay(
  entries: MealPlanEntry[],
  date: ISODate,
  slotOrder: Id[],
): MealPlanEntry[] {
  const slotPosition = (entry: MealPlanEntry): number => {
    const index = slotOrder.indexOf(entry.slotId);
    return index === -1 ? slotOrder.length : index;
  };
  return entries
    .filter((entry) => entry.date === date)
    .sort((a, b) => slotPosition(a) - slotPosition(b) || compareInSlot(a, b));
}

/**
 * The switch "Nicht gemacht" in the entry window (spec 0020, REQ-008, Entscheidung 10): only for an
 * entry of a day before today and never for leftovers; today "nicht gemacht" rather means removing.
 */
export function canMarkNotDone(
  entry: Pick<MealPlanEntry, 'date' | 'kind'>,
  today: ISODate,
): boolean {
  return entry.date !== null && entry.date < today && entry.kind !== 'leftovers';
}

export interface Visits {
  count: number;
  lastOn?: ISODate;
  daysSince?: number;
  /** Days it was done, newest first; a day appears once per entry. */
  dates: ISODate[];
}

/**
 * What the plan says was done: entries of that restaurant or activity up to and including today,
 * without "nicht gekocht"/"nicht gemacht" and without entries that have no day.
 */
export function visitsOf(
  kind: Extract<MealPlanEntry['kind'], 'restaurant' | 'activity'>,
  id: Id,
  entries: MealPlanEntry[],
  today: ISODate,
): Visits {
  const dates: ISODate[] = [];
  for (const entry of entries) {
    const targetId = kind === 'restaurant' ? entry.restaurantId : entry.activityId;
    if (entry.kind !== kind || targetId !== id || entry.date === null) continue;
    if (entry.date > today || entry.notDone) continue;
    dates.push(entry.date);
  }
  dates.sort().reverse();
  const lastOn = dates[0];
  return {
    count: dates.length,
    lastOn,
    daysSince: lastOn ? daysBetween(lastOn, today) : undefined,
    dates,
  };
}

/** How many days before the target day "Reste" looks back (REQ-011). */
export const LEFTOVER_DAYS = 7;

/**
 * Whether an entry lies before the target place: an earlier day, or the target day in an earlier
 * Tageszeit than `targetSlotId` (spec 0021, REQ-012). Without a target slot only earlier days.
 */
function beforeTarget(
  entry: MealPlanEntry,
  target: ISODate,
  slotOrder: Id[],
  targetSlotId: Id | undefined,
): boolean {
  if (entry.date === null) return false;
  if (entry.date < target) return true;
  if (entry.date > target || targetSlotId === undefined) return false;
  const position = (slotId: Id) => {
    const index = slotOrder.indexOf(slotId);
    return index === -1 ? slotOrder.length : index;
  };
  return position(entry.slotId) < position(targetSlotId);
}

/**
 * Dishes a target place can take leftovers of: recipes and free text before it, without
 * leftovers of leftovers, without collections (glossary "Reste", spec 0009) and without
 * "nicht gekocht"; the youngest day first, within a day the later Tageszeit first.
 */
function leftoverSources(
  entries: MealPlanEntry[],
  target: ISODate,
  slotOrder: Id[],
  recipesById: Readonly<Record<Id, Pick<Recipe, 'kind'>>>,
  targetSlotId: Id | undefined,
  from: ISODate | undefined,
): MealPlanEntry[] {
  const slotPosition = (entry: MealPlanEntry): number => {
    const index = slotOrder.indexOf(entry.slotId);
    return index === -1 ? -1 : index;
  };
  return entries
    .filter(
      (entry) =>
        entry.date !== null &&
        (from === undefined || entry.date >= from) &&
        beforeTarget(entry, target, slotOrder, targetSlotId) &&
        (entry.kind === 'recipe' || entry.kind === 'text') &&
        (entry.recipeId === undefined || recipesById[entry.recipeId]?.kind !== 'collection') &&
        !entry.notDone,
    )
    .sort(
      (a, b) =>
        (b.date ?? '').localeCompare(a.date ?? '') ||
        slotPosition(b) - slotPosition(a) ||
        compareInSlot(a, b),
    );
}

/**
 * Dishes "Reste" offers for a target day (REQ-011): recipes and free text planned from
 * target − 7 to target − 1 and, with `targetSlotId`, the target day in an earlier Tageszeit
 * (spec 0021, REQ-012, AC-032); the youngest first.
 */
export function leftoverCandidates(
  entries: MealPlanEntry[],
  target: ISODate,
  slotOrder: Id[],
  recipesById: Readonly<Record<Id, Pick<Recipe, 'kind'>>>,
  targetSlotId?: Id,
): MealPlanEntry[] {
  return leftoverSources(
    entries,
    target,
    slotOrder,
    recipesById,
    targetSlotId,
    addDays(target, -LEFTOVER_DAYS),
  );
}

/** "Ältere Reste …" (spec 0021, REQ-012, AC-033): every earlier dish, without a limit in days. */
export function olderLeftoverCandidates(
  entries: MealPlanEntry[],
  target: ISODate,
  slotOrder: Id[],
  recipesById: Readonly<Record<Id, Pick<Recipe, 'kind'>>>,
  targetSlotId?: Id,
): MealPlanEntry[] {
  return leftoverSources(entries, target, slotOrder, recipesById, targetSlotId, undefined);
}

/**
 * The day in "Reste von Linsen-Dal (Mo)": the Tageszeit for the same day ("(Mittag)", spec 0021,
 * AC-032), the weekday within the target's calendar week, else weekday and date ("So 22.11."), so
 * the same weekday a week earlier stays clear.
 */
export function leftoversDayLabel(source: ISODate, target: ISODate, slotName?: string): string {
  if (source === target && slotName) return slotName;
  if (startOfWeek(source) === startOfWeek(target)) return weekdayShort(source);
  return `${weekdayShort(source)} ${formatShortDate(source)}`;
}
