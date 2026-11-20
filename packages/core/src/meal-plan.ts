import { formatQty } from './amounts';
import { deriveRecipeDiet, dietFitsPreference } from './diet';
import { defaultVariantId } from './recipes';
import type {
  Absence,
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
  unknown: 0,
  vegan: 1,
  vegetarian: 2,
  fish: 3,
  meat: 4,
};

/** True when the member (or the whole household) is absent on that day; from and to are inclusive. */
export function isAbsent(memberId: Id, date: ISODate, absences: Absence[]): boolean {
  return absences.some(
    (absence) =>
      (absence.memberId === undefined || absence.memberId === memberId) &&
      absence.from <= date &&
      date <= absence.to,
  );
}
/**
 * Members preselected for "Wer isst mit?": everyone who is not absent on that day; everyone for
 * an entry without a day.
 */
export function defaultEaters(
  members: Member[],
  date: ISODate | null,
  absences: Absence[],
): Member[] {
  if (date === null) return [...members];
  return members.filter((member) => !isAbsent(member.id, date, absences));
}

export interface VariantSplit {
  portions: number;
  /** Empty for recipes without variants. */
  variants: PlanEntryVariant[];
  /** Members for whom no variant (or the base recipe) fits their diet preference. */
  misfitMemberIds: Id[];
}
/**
 * Splits portions over variants: one portion per eater and guest.
 * Vegan/vegetarian members get a fitting variant (the default if it fits). Flexible members get
 * the variant with the "highest" diet (meat > fish > vegetarian > vegan), guests the default.
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
    const misfitMemberIds = eaters
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
      return candidates.find((candidate) =>
        dietFitsPreference(candidate.diet, member.dietPreference),
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
/**
 * "mit Tofu 1 · mit Hähnchen 1" in the recipe's variant order; "" for entries without variants.
 */
export function variantSummary(entry: MealPlanEntry, recipe: Recipe): string {
  return recipe.variants
    .flatMap((variant) => {
      const row = entry.variants.find((candidate) => candidate.variantId === variant.id);
      return row && row.portions > 0 ? [`${variant.name} ${formatQty(row.portions)}`] : [];
    })
    .join(' · ');
}
/** Entries of one day sorted by slot order, then by entry.sort; unknown slots come last. */
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
    .sort((a, b) => slotPosition(a) - slotPosition(b) || a.sort - b.sort);
}
