// The one shopping list (spec 0006): Herkunft, + and −, "kauft gerade ein" and the store that
// "Einkaufen" starts with.
import { weekdayShort } from './dates';
import { listProgress, originLabel, summarizeItem } from './shopping';
import type {
  ContributionSource,
  Id,
  MealPlanEntry,
  Member,
  Recipe,
  ShoppingContribution,
  ShoppingItem,
  Store,
} from './types';

// ---------- Herkunft ----------

/**
 * The source of a contribution from a recipe. From a calendar entry the label carries the weekday,
 * "Mango-Curry (Sa)", or "(vorgemerkt)" for an entry without a day; directly from the recipe page
 * or "Rezept wählen …" (no entry) it is the title alone, "Mango-Curry". For a recipe contained in
 * a collection, `recipe` is the collection and the label names both, "Grillabend · Kartoffelsalat
 * (Sa)" (spec 0009, REQ-008).
 */
export function recipeSource(
  recipe: Pick<Recipe, 'id' | 'title'>,
  entry?: Pick<MealPlanEntry, 'id' | 'date'>,
  contained?: Pick<Recipe, 'title'>,
): Extract<ContributionSource, { kind: 'recipe' }> {
  const title = contained === undefined ? recipe.title : `${recipe.title} · ${contained.title}`;
  if (entry === undefined) return { kind: 'recipe', recipeId: recipe.id, label: title };
  const day = entry.date === null ? 'vorgemerkt' : weekdayShort(entry.date);
  return {
    kind: 'recipe',
    recipeId: recipe.id,
    entryId: entry.id,
    label: `${title} (${day})`,
  };
}

/**
 * "Lasagne (Fr): 1× · von Hand: 1×": the contributions grouped by origin in the order they came,
 * each with its summed amount; an origin without amount reads alone ("von Hand").
 */
export function originSummary(item: ShoppingItem): string {
  const byLabel = new Map<string, ShoppingContribution[]>();
  for (const contribution of item.contributions) {
    const label = originLabel(contribution.source);
    byLabel.set(label, [...(byLabel.get(label) ?? []), contribution]);
  }
  return [...byLabel]
    .map(([label, contributions]) => {
      const { amount } = summarizeItem({ ...item, contributions });
      return amount === '' ? label : `${label}: ${amount}`;
    })
    .join(' · ');
}

export interface ListHeadline {
  open: number;
  /** Recipes the open items come from, in the order they appear, each once. */
  recipeTitles: string[];
  /** "3 offen · für Lasagne, Kürbissuppe"; "3 offen" without recipes. */
  label: string;
}
/**
 * The line under "Einkaufsliste" (AC-008). A recipe that no longer exists is named by the label
 * stored with its contribution.
 */
export function listHeadline(
  items: readonly ShoppingItem[],
  recipesById: Readonly<Record<Id, Recipe>>,
): ListHeadline {
  const openItems = items.filter((item) => !item.checked);
  const titles = new Set<string>();
  for (const item of openItems) {
    for (const { source } of item.contributions) {
      if (source.kind === 'recipe') titles.add(recipesById[source.recipeId]?.title ?? source.label);
    }
  }
  const recipeTitles = [...titles];
  const label =
    recipeTitles.length === 0
      ? `${openItems.length} offen`
      : `${openItems.length} offen · für ${recipeTitles.join(', ')}`;
  return { open: openItems.length, recipeTitles, label };
}

// ---------- + and − ----------

/** Upper bound of the count shown on a row; + stops there. */
export const MAX_ITEM_COUNT = 99;

/**
 * The count of an item that consists of pure counts ("2×"), the only kind with + and −
 * (Offene Frage 4b). Undefined when a contribution has a quantity ("500 g") or nothing is counted.
 */
export function itemCount(item: ShoppingItem): number | undefined {
  if (item.contributions.some((contribution) => contribution.qty !== undefined)) return undefined;
  const counted = item.contributions.filter((contribution) => contribution.count !== undefined);
  if (counted.length === 0) return undefined;
  return counted.reduce((sum, contribution) => sum + (contribution.count ?? 0), 0);
}

export type ContributionChange =
  | { type: 'insert'; contribution: ShoppingContribution }
  | { type: 'update'; contributionId: Id; count: number }
  | { type: 'delete'; contributionId: Id };

export interface CountAdjustment {
  /** What the control shows afterwards: the item's count. */
  count: number;
  /** Empty when the item is removed: its contributions go with it. */
  changes: ContributionChange[];
  /** − on the last piece removes the whole item (with "Rückgängig", AC-015). */
  removesItem: boolean;
}

/**
 * + and − on an item (the row on "Liste" and "Posten bearbeiten", Offene Frage 4b): only for pure
 * counts; + raises the manual share (or adds one), − lowers the manual share first, then the most
 * recent other contribution (Offene Frage 4a), and on 1× removes the item.
 * Returns null when the step is not possible (quantities, nothing counted, MAX_ITEM_COUNT reached).
 */
export function adjustItemCount(
  item: ShoppingItem,
  delta: 1 | -1,
  newContributionId: Id,
): CountAdjustment | null {
  if (itemCount(item) === undefined) return null;
  const counted = item.contributions.filter(
    (contribution) => contribution.count !== undefined && contribution.count > 0,
  );
  const total = counted.reduce((sum, contribution) => sum + (contribution.count ?? 0), 0);
  const manual = counted.filter((contribution) => contribution.source.kind === 'manual').at(-1);

  if (delta === 1) {
    if (total >= MAX_ITEM_COUNT) return null;
    const change: ContributionChange = manual
      ? { type: 'update', contributionId: manual.id, count: (manual.count ?? 0) + 1 }
      : {
          type: 'insert',
          contribution: { id: newContributionId, source: { kind: 'manual' }, count: 1 },
        };
    return { count: total + 1, changes: [change], removesItem: false };
  }

  if (total <= 1) return { count: 0, changes: [], removesItem: true };
  // Contributions are kept in the order they were added, so the last one is the most recent.
  const target = manual ?? counted.at(-1);
  if (target === undefined) return null;
  const targetCount = target.count ?? 0;
  const change: ContributionChange =
    targetCount > 1
      ? { type: 'update', contributionId: target.id, count: targetCount - 1 }
      : { type: 'delete', contributionId: target.id };
  return { count: total - 1, changes: [change], removesItem: false };
}

/** The item with the changes applied; inserts go to the end. Returns a new item. */
export function applyContributionChanges(
  item: ShoppingItem,
  changes: readonly ContributionChange[],
): ShoppingItem {
  let contributions = [...item.contributions];
  for (const change of changes) {
    if (change.type === 'insert') contributions = [...contributions, change.contribution];
    else if (change.type === 'delete') {
      contributions = contributions.filter(
        (contribution) => contribution.id !== change.contributionId,
      );
    } else {
      contributions = contributions.map((contribution) =>
        contribution.id === change.contributionId
          ? { ...contribution, count: change.count }
          : contribution,
      );
    }
  }
  return { ...item, contributions };
}

// ---------- "kauft gerade ein" ----------

/** How long after the last check another member still counts as shopping (Offene Frage 1 A). */
export const SHOPPER_ACTIVE_MINUTES = 15;

export interface ActiveShopper {
  member: Member;
  done: number;
  total: number;
  /** "Nadja kauft gerade ein · 7 von 14". */
  label: string;
}

/**
 * Another member who checked an item within the last SHOPPER_ACTIVE_MINUTES, derived from
 * checkedAt/checkedBy alone (no presence, no store). The most recent one wins; the progress is
 * that of the whole list. "Fertig" removes the checked items, so the hint goes with them.
 */
export function activeShopper(
  items: readonly ShoppingItem[],
  members: readonly Member[],
  currentMemberId: Id,
  now: string,
): ActiveShopper | undefined {
  const nowTime = Date.parse(now);
  if (Number.isNaN(nowTime)) return undefined;
  const since = nowTime - SHOPPER_ACTIVE_MINUTES * 60_000;

  let latest: { member: Member; time: number } | undefined;
  for (const item of items) {
    if (!item.checked || item.checkedBy === undefined || item.checkedBy === currentMemberId) {
      continue;
    }
    const time = item.checkedAt === undefined ? Number.NaN : Date.parse(item.checkedAt);
    if (Number.isNaN(time) || time <= since) continue;
    const member = members.find((candidate) => candidate.id === item.checkedBy);
    if (member && (latest === undefined || time > latest.time)) latest = { member, time };
  }
  if (latest === undefined) return undefined;

  const { done, total } = listProgress([...items]);
  return {
    member: latest.member,
    done,
    total,
    label: `${latest.member.name} kauft gerade ein · ${done} von ${total}`,
  };
}

// ---------- Store in "Einkaufen" ----------

/**
 * The store "Einkaufen" starts with (D26): the one last chosen on this device, else the
 * household's default store. `deviceChoice` is undefined when nothing was chosen on this device
 * and null for "Ohne Markt – nach Bereichen". A store that no longer exists counts as not chosen.
 * Undefined means without store.
 */
export function resolveShoppingStore(
  stores: readonly Store[],
  deviceChoice: Id | null | undefined,
  defaultStoreId: Id | undefined,
): Store | undefined {
  if (deviceChoice === null) return undefined;
  const chosen = stores.find((store) => store.id === deviceChoice);
  return chosen ?? stores.find((store) => store.id === defaultStoreId);
}
