import { addContribution, contributionsFromEntry } from './shopping';
import { formatShortDate, weekdayShort } from './dates';
import { splitVariants } from './meal-plan';
import type {
  Article,
  Id,
  ISODate,
  MealPlanEntry,
  MealSlot,
  Member,
  Recipe,
  ShoppingItem,
  Trip,
} from './types';

// "Reisende aus geplanten Gerichten nehmen" (spec 0022, REQ-007, REQ-008; K-02): after a trip is
// saved, the dishes from today within its period where somebody of it eats are offered. Taking
// her out removes her from "Wer isst mit?" and "Wer kocht?", lowers the portions by one in her
// variant (spec 0021, REQ-006) and parks a dish nobody eats any more ("vorgemerkt"); the open
// items of the shopping list follow (spec 0021, REQ-007).

/** A dish: an entry with "Wer isst mit?" (everything but an activity). */
export function isDish(entry: Pick<MealPlanEntry, 'kind'>): boolean {
  return entry.kind !== 'activity';
}

/** Who of the trip's people is covered on which day: "member|date" pairs from `today` on. */
function coverage(
  trip: Pick<Trip, 'from' | 'to'> & { memberIds: readonly Id[] },
  today: ISODate,
): (memberId: Id, date: ISODate) => boolean {
  return (memberId, date) =>
    date >= today && date >= trip.from && date <= trip.to && trip.memberIds.includes(memberId);
}

export interface TripMealOffer {
  entry: MealPlanEntry;
  /** The travellers who eat at this dish and are newly on the trip that day. */
  memberIds: Id[];
  /** Nobody else eats and there are no guests: taking them out parks the dish. */
  parks: boolean;
}

/**
 * The dishes to offer after saving a trip (AC-021, AC-024, AC-026, AC-027): from today on, within
 * the period, where a person of the trip eats who was not on the trip that day before the save
 * (`before` = the trip before, undefined for a new one). Shortening, deleting or removing people
 * offers nothing. Earliest first, then by Tageszeit order and sort.
 */
export function tripMealOffers(input: {
  trip: Pick<Trip, 'from' | 'to'> & { memberIds: readonly Id[] };
  before?: Pick<Trip, 'from' | 'to'> & { memberIds: readonly Id[] };
  entries: readonly MealPlanEntry[];
  slots: readonly MealSlot[];
  today: ISODate;
}): TripMealOffer[] {
  const now = coverage(input.trip, input.today);
  const was = input.before ? coverage(input.before, input.today) : () => false;
  const slotOrder = new Map(input.slots.map((slot) => [slot.id, slot.sort]));
  return input.entries
    .flatMap((entry): TripMealOffer[] => {
      if (entry.date === null || !isDish(entry)) return [];
      const date = entry.date;
      const memberIds = entry.eaterIds.filter((id) => now(id, date) && !was(id, date));
      if (memberIds.length === 0) return [];
      const others = entry.eaterIds.filter((id) => !memberIds.includes(id));
      return [{ entry, memberIds, parks: others.length === 0 && entry.guests === 0 }];
    })
    .sort(
      (a, b) =>
        (a.entry.date ?? '').localeCompare(b.entry.date ?? '') ||
        (slotOrder.get(a.entry.slotId) ?? 0) - (slotOrder.get(b.entry.slotId) ?? 0) ||
        a.entry.sort - b.entry.sort,
    );
}

/** "Mo 30.11. · Abend · Lasagne", with " · danach vorgemerkt" when it parks (AC-021). */
export function tripMealLine(offer: TripMealOffer, slotName: string, title: string): string {
  const date = offer.entry.date ?? '';
  const parts = [`${weekdayShort(date)} ${formatShortDate(date)}`, slotName, title];
  if (offer.parks) parts.push('danach vorgemerkt');
  return parts.join(' · ');
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1] ?? ''}`;
}

/** "3 Gerichte im Zeitraum – Enrico rausnehmen?" (AC-021, AC-023, AC-027). */
export function tripMealsTitle(
  offers: readonly TripMealOffer[],
  members: readonly Member[],
): string {
  const ids = new Set(offers.flatMap((offer) => offer.memberIds));
  const names = members.filter((member) => ids.has(member.id)).map((member) => member.name);
  const count = offers.length === 1 ? '1 Gericht' : `${offers.length} Gerichte`;
  return `${count} im Zeitraum – ${joinNames(names)} rausnehmen?`;
}

/** "Enrico aus 3 Gerichten genommen" (AC-021). */
export function tripMealsDoneText(
  offers: readonly TripMealOffer[],
  members: readonly Member[],
): string {
  const ids = new Set(offers.flatMap((offer) => offer.memberIds));
  const names = members.filter((member) => ids.has(member.id)).map((member) => member.name);
  const count = offers.length === 1 ? '1 Gericht' : `${offers.length} Gerichten`;
  return `${joinNames(names)} aus ${count} genommen`;
}

/**
 * The entry after taking these people out (AC-021, AC-023): gone from "Wer isst mit?" and "Wer
 * kocht?", one portion less per person in her variant (else the variant with the most), at least
 * one; a dish nobody eats any more and without guests is parked unchanged otherwise.
 */
export function withoutTravellers(input: {
  entry: MealPlanEntry;
  memberIds: readonly Id[];
  recipe?: Recipe;
  members: readonly Member[];
  articlesById: Record<Id, Article>;
}): MealPlanEntry {
  const { entry } = input;
  const leaving = entry.eaterIds.filter((id) => input.memberIds.includes(id));
  const eaterIds = entry.eaterIds.filter((id) => !leaving.includes(id));
  if (eaterIds.length === 0 && entry.guests === 0) {
    return { ...entry, date: null, reminder: undefined };
  }
  const cookId =
    entry.cookId !== undefined && leaving.includes(entry.cookId) ? undefined : entry.cookId;
  if (entry.kind !== 'recipe' || !input.recipe) {
    return { ...entry, eaterIds, cookId };
  }
  const recipe = input.recipe;
  let variants = entry.variants.map((row) => ({ ...row }));
  for (const memberId of leaving) {
    if (variants.length === 0) break;
    const member = input.members.find((candidate) => candidate.id === memberId);
    const own = member
      ? splitVariants(recipe, [member], 0, input.articlesById).variants[0]?.variantId
      : undefined;
    const target =
      variants.find((row) => row.variantId === own && row.portions > 0) ??
      [...variants].sort((a, b) => b.portions - a.portions)[0];
    if (target) target.portions -= 1;
    variants = variants.filter((row) => row.portions > 0);
  }
  const portions =
    entry.variants.length > 0
      ? Math.max(
          1,
          variants.reduce((sum, row) => sum + row.portions, 0),
        )
      : Math.max(1, entry.portions - leaving.length);
  if (entry.variants.length > 0 && variants.length === 0) {
    variants = entry.variants.slice(0, 1).map((row) => ({ ...row, portions: 1 }));
  }
  return { ...entry, eaterIds, cookId, portions, variants };
}

/**
 * The open items of the shopping list after an entry changed (spec 0021, REQ-007; AC-021): the
 * contributions with the entry's Herkunft on items not checked are computed anew for its new
 * portions and variants (an ingredient no longer needed goes, an emptied item goes); a parked
 * entry takes them all away. When nothing of the entry is on the list, nothing changes; checked
 * items stay as they are. `dayLabel` is the short weekday in the Herkunft ("Mo").
 */
export function recomputeEntryContributions(input: {
  items: readonly ShoppingItem[];
  entry: MealPlanEntry;
  recipe?: Recipe;
  articlesById: Record<Id, Article>;
  newId: () => Id;
  now: string;
}): ShoppingItem[] {
  const { entry } = input;
  const ofEntry = (item: ShoppingItem) =>
    item.contributions.some(
      (contribution) =>
        contribution.source.kind === 'recipe' && contribution.source.entryId === entry.id,
    );
  if (!input.items.some(ofEntry)) return [...input.items];
  const open = input.items.filter((item) => !item.checked);
  const labelOf = () => {
    for (const item of input.items) {
      for (const contribution of item.contributions) {
        if (contribution.source.kind === 'recipe' && contribution.source.entryId === entry.id) {
          return contribution.source.label;
        }
      }
    }
    return undefined;
  };
  const label = labelOf();
  // Without the entry's contributions on open items; an item left empty goes at the end.
  let next: ShoppingItem[] = input.items.map((item) => {
    if (item.checked || !ofEntry(item)) return item;
    const contributions = item.contributions.filter(
      (contribution) =>
        !(contribution.source.kind === 'recipe' && contribution.source.entryId === entry.id),
    );
    return { ...item, contributions };
  });
  const withoutEmpty = (items: ShoppingItem[]) =>
    items.filter((item) => item.checked || item.contributions.length > 0);
  if (entry.date === null || !input.recipe || open.length === 0) return withoutEmpty(next);
  const recipe = input.recipe;
  const planned = contributionsFromEntry(entry, recipe, input.articlesById, '').map(
    (contribution) => ({ ...contribution, label: label ?? contribution.label }),
  );
  // Ingredients that only stood on checked items are not put on the list again.
  const checkedArticles = new Set(
    input.items.filter((item) => item.checked && ofEntry(item)).map((item) => item.articleId),
  );
  for (const contribution of planned) {
    if (checkedArticles.has(contribution.articleId)) continue;
    const before = input.items.find(
      (item) => !item.checked && ofEntry(item) && item.articleId === contribution.articleId,
    );
    if (!before && contribution.isPantry) continue;
    next = addContribution(
      next,
      contribution.articleId,
      {
        id: input.newId(),
        source: {
          kind: 'recipe',
          recipeId: contribution.recipeId,
          entryId: entry.id,
          label: contribution.label,
        },
        count: contribution.count,
        qty: contribution.qty,
        unit: contribution.unit,
        note: contribution.note,
      },
      input.newId(),
      input.now,
    );
  }
  return withoutEmpty(next);
}
