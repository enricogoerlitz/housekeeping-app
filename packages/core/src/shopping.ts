import { formatAmount, formatQty, scaleAmount } from './amounts';
import { defaultVariantId } from './recipes';
import type {
  Area,
  Article,
  ContributionSource,
  Id,
  MealPlanEntry,
  Recipe,
  ShoppingContribution,
  ShoppingItem,
  Store,
} from './types';

export interface PlannedContribution {
  /** Undefined when the ingredient has no article (free text). */
  articleId?: Id;
  name: string;
  count?: number;
  qty?: number;
  unit?: string;
  /** Article is marked "Vorrat": unchecked by default in the pantry check. */
  isPantry: boolean;
  /** The ingredient's default shopping note ("Philadelphia"), carried onto the list. */
  note?: string;
  recipeId: Id;
  entryId: Id;
  /** e.g. "Mango-Curry (Mi)". */
  label: string;
}
/**
 * What a planned recipe needs from the shop: one contribution per ingredient, not merged.
 * Base ingredients scale with entry.portions / recipe.servings; variant ingredients with that
 * variant's portions / recipe.servings (entries without variant rows use the default variant).
 * Ingredients of variants nobody eats are omitted.
 * Shopping rule "skip" → omitted; "count" → count 1 (never scaled); "recipeAmount" → scaled qty
 * and unit (count when the amount has no unit, rounded up; count 1 when it is not a number).
 * dayLabel is the short weekday used in the label, e.g. "Mi".
 */
export function contributionsFromEntry(
  entry: MealPlanEntry,
  recipe: Recipe,
  articlesById: Record<Id, Article>,
  dayLabel: string,
): PlannedContribution[] {
  const portionsByVariant = new Map<Id, number>();
  for (const row of entry.variants) {
    portionsByVariant.set(
      row.variantId,
      (portionsByVariant.get(row.variantId) ?? 0) + row.portions,
    );
  }
  const defaultId = defaultVariantId(recipe);
  if (entry.variants.length === 0 && defaultId !== undefined) {
    portionsByVariant.set(defaultId, entry.portions);
  }

  const label = `${recipe.title} (${dayLabel})`;
  const contributions: PlannedContribution[] = [];
  for (const ingredient of recipe.ingredients) {
    if (ingredient.shoppingRule === 'skip') continue;
    const portions =
      ingredient.variantId === undefined
        ? entry.portions
        : (portionsByVariant.get(ingredient.variantId) ?? 0);
    if (portions <= 0) continue;

    const article =
      ingredient.articleId === undefined ? undefined : articlesById[ingredient.articleId];
    const contribution: PlannedContribution = {
      name: ingredient.name,
      isPantry: article?.isPantry ?? false,
      ...(ingredient.shoppingNote ? { note: ingredient.shoppingNote } : {}),
      recipeId: recipe.id,
      entryId: entry.id,
      label,
    };
    if (ingredient.articleId !== undefined) contribution.articleId = ingredient.articleId;

    const amount = ingredient.amount;
    if (ingredient.shoppingRule === 'count' || amount?.qty === undefined) {
      contribution.count = 1;
    } else {
      const factor = recipe.servings > 0 ? portions / recipe.servings : 1;
      if (amount.unit === undefined) {
        // The small tolerance keeps float noise (2.0000000000000004) from adding a whole piece.
        contribution.count = Math.max(1, Math.ceil(amount.qty * factor - 1e-9));
      } else {
        contribution.qty = scaleAmount(amount, factor).qty;
        contribution.unit = amount.unit;
      }
    }
    contributions.push(contribution);
  }
  return contributions;
}

// Larger unit → the unit quantities are added in.
const BASE_UNITS: Record<string, { unit: string; factor: number }> = {
  kg: { unit: 'g', factor: 1000 },
  l: { unit: 'ml', factor: 1000 },
};
// Base unit → the larger unit it is shown in from 1000 up.
const LARGER_UNITS: Record<string, string> = { g: 'kg', ml: 'l' };

function formatSum(qty: number, unit: string): string {
  const larger = LARGER_UNITS[unit];
  return larger !== undefined && qty >= 1000
    ? formatAmount(qty / 1000, larger)
    : formatAmount(qty, unit);
}

/** The Herkunft of one contribution: the stored recipe label, "von Hand" or "Dauerposten". */
export function originLabel(source: ContributionSource): string {
  if (source.kind === 'manual') return 'von Hand';
  if (source.kind === 'recurring') return 'Dauerposten';
  return source.label;
}

function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

export interface ItemSummary {
  /** "2×", "500 g", "2× · 500 g", "" when nothing is known. g→kg and ml→l from 1000 up. */
  amount: string;
  /** Distinct notes of all contributions, in order. */
  notes: string[];
  /** Human readable origins: "Lasagne (Mo)", "von Hand", "Dauerposten". */
  sources: string[];
  isRecurring: boolean;
}
/**
 * Sums counts and same-unit quantities of all contributions of an item; kg and g, l and ml are
 * added together. Counts come first, then one part per unit in order of first appearance.
 * A contribution without count and quantity adds nothing to the amount.
 */
export function summarizeItem(item: ShoppingItem): ItemSummary {
  let count: number | undefined;
  const qtyByUnit = new Map<string, number>();
  for (const contribution of item.contributions) {
    if (contribution.count !== undefined) count = (count ?? 0) + contribution.count;
    if (contribution.qty === undefined) continue;
    if (contribution.unit === undefined || contribution.unit === '') {
      // A quantity without a unit is a number of pieces.
      count = (count ?? 0) + contribution.qty;
      continue;
    }
    const base = BASE_UNITS[contribution.unit] ?? { unit: contribution.unit, factor: 1 };
    qtyByUnit.set(base.unit, (qtyByUnit.get(base.unit) ?? 0) + contribution.qty * base.factor);
  }

  const parts = count === undefined ? [] : [`${formatQty(count)}×`];
  for (const [unit, qty] of qtyByUnit) parts.push(formatSum(qty, unit));

  return {
    amount: parts.join(' · '),
    notes: distinct(
      item.contributions.flatMap((contribution) =>
        contribution.note === undefined || contribution.note === '' ? [] : [contribution.note],
      ),
    ),
    sources: distinct(item.contributions.map((contribution) => originLabel(contribution.source))),
    isRecurring: item.contributions.some(
      (contribution) => contribution.source.kind === 'recurring',
    ),
  };
}

/**
 * Adds a contribution for an article to the household's shopping list, returning a new items
 * array.
 * - An open item for that article exists → the contribution is appended.
 * - Only a checked item exists → it is reopened with just the new contribution.
 * - Otherwise a new item is created with the given newItemId.
 */
export function addContribution(
  items: ShoppingItem[],
  articleId: Id,
  contribution: ShoppingContribution,
  newItemId: Id,
  now: string,
): ShoppingItem[] {
  const isTarget = (item: ShoppingItem): boolean => item.articleId === articleId;

  const open = items.find((item) => isTarget(item) && !item.checked);
  if (open) {
    return items.map((item) =>
      item === open ? { ...item, contributions: [...item.contributions, contribution] } : item,
    );
  }

  const checked = items.find(isTarget);
  if (checked) {
    // The old contributions were bought and "nicht da" belonged to that trip; neither carries
    // over to the new need.
    const { checkedAt, checkedBy, notAvailable, ...kept } = checked;
    const reopened: ShoppingItem = { ...kept, checked: false, contributions: [contribution] };
    return items.map((item) => (item === checked ? reopened : item));
  }

  return [
    ...items,
    {
      id: newItemId,
      articleId,
      contributions: [contribution],
      checked: false,
      createdAt: now,
    },
  ];
}

export interface ItemGroup {
  /** "area:<id>", "none" (no area) or "elsewhere" (area hidden in this store). */
  key: string;
  title: string;
  area?: Area;
  items: ShoppingItem[];
}

function createdTime(item: ShoppingItem): number {
  const time = Date.parse(item.createdAt);
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Groups items by area. With a store: areas in the store's walking order, then remaining areas by
 * their default sort, then "Ohne Bereich"; items whose area is hidden in the store go to a final
 * group "Woanders kaufen". Without a store: areas by default sort, then "Ohne Bereich".
 * Items without an article or with an unknown area count as "Ohne Bereich".
 * Empty groups are omitted. Inside a group items keep their creation order.
 */
export function groupItems(
  items: ShoppingItem[],
  articlesById: Record<Id, Article>,
  areas: Area[],
  store?: Store,
): ItemGroup[] {
  const areasById = new Map(areas.map((area) => [area.id, area]));
  const hiddenAreaIds = new Set(store?.hiddenAreaIds ?? []);

  const itemsByKey = new Map<string, ShoppingItem[]>();
  const byCreation = [...items].sort((a, b) => createdTime(a) - createdTime(b));
  for (const item of byCreation) {
    const areaId = articlesById[item.articleId]?.areaId;
    const area = areaId === undefined ? undefined : areasById.get(areaId);
    const key = !area ? 'none' : hiddenAreaIds.has(area.id) ? 'elsewhere' : `area:${area.id}`;
    itemsByKey.set(key, [...(itemsByKey.get(key) ?? []), item]);
  }

  const bySort = [...areas].sort((a, b) => a.sort - b.sort);
  const walkingOrder = (store?.areaOrder ?? []).flatMap((areaId) => {
    const area = areasById.get(areaId);
    return area ? [area] : [];
  });
  // The set drops the areas already placed by the walking order, and any id listed twice.
  const orderedAreas = [...new Set([...walkingOrder, ...bySort])];

  const groups: ItemGroup[] = orderedAreas.map((area) => ({
    key: `area:${area.id}`,
    title: area.name,
    area,
    items: itemsByKey.get(`area:${area.id}`) ?? [],
  }));
  groups.push({ key: 'none', title: 'Ohne Bereich', items: itemsByKey.get('none') ?? [] });
  groups.push({
    key: 'elsewhere',
    title: 'Woanders kaufen',
    items: itemsByKey.get('elsewhere') ?? [],
  });
  return groups.filter((group) => group.items.length > 0);
}
/** Checked items out of all items of a list. */
export function listProgress(items: ShoppingItem[]): { done: number; total: number } {
  return { done: items.filter((item) => item.checked).length, total: items.length };
}
