// The one shopping list (spec 0006): Herkunft, + and −, "kauft gerade ein" and the store that
// "Einkaufen" starts with.
import { weekdayShort } from './dates';
import { listProgress, originLabel, summarizeItem } from './shopping';
import type {
  ContributionSource,
  Id,
  ISODate,
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
  const day = entryDayLabel(entry.date);
  return {
    kind: 'recipe',
    recipeId: recipe.id,
    entryId: entry.id,
    label: `${title} (${day})`,
  };
}

function entryDayLabel(date: ISODate | null): string {
  return date === null ? 'vorgemerkt' : weekdayShort(date);
}

/**
 * The label of a contribution whose plan entry moved to `date` (spec 0016, AC-017): the day at its
 * end follows, "Mango-Curry (Sa)" → "Mango-Curry (So)". A label without a day stays.
 */
export function relabelForDay(label: string, date: ISODate | null): string {
  return label.replace(/ \([^()]*\)$/, ` (${entryDayLabel(date)})`);
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

/**
 * What the field "Von Hand" starts with (spec 0025, AC-010): the summed manual share as typed,
 * "500 g", "2" for a count; empty without one.
 */
export function manualAmountText(item: ShoppingItem): string {
  const manual = item.contributions.filter((contribution) => contribution.source.kind === 'manual');
  if (manual.length === 0) return '';
  const { amount } = summarizeItem({ ...item, contributions: manual });
  return amount.replace(/^(\d+(?:,\d+)?)×$/, '$1');
}

export interface OriginRow {
  /** "Lasagne (Mo)". */
  label: string;
  /** Its summed amount, "1×", "" when it brings none. */
  amount: string;
  contributionIds: Id[];
}

/**
 * The origins from recipes in "Posten bearbeiten", each with ✕ (spec 0025, AC-010): grouped by
 * label in the order they came. "von Hand" is the field, not a row.
 */
export function originRows(item: ShoppingItem): OriginRow[] {
  const byLabel = new Map<string, ShoppingContribution[]>();
  for (const contribution of item.contributions) {
    if (contribution.source.kind === 'manual') continue;
    const label = originLabel(contribution.source);
    byLabel.set(label, [...(byLabel.get(label) ?? []), contribution]);
  }
  return [...byLabel].map(([label, contributions]) => ({
    label,
    amount: summarizeItem({ ...item, contributions }).amount,
    contributionIds: contributions.map((contribution) => contribution.id),
  }));
}

/**
 * The hint under "Zusatz" when the change replaces what a recipe brought (spec 0025, AC-015,
 * AC-016): "Ersetzt den Zusatz „Fior di Latte“ aus Lasagne (Mo)", "Entfernt den Zusatz …" when it
 * is cleared. Undefined when no recipe Zusatz changes.
 */
export function noteChangeHint(item: ShoppingItem, note: string): string | undefined {
  const next = note.trim();
  const replaced = item.contributions.filter(
    (contribution) =>
      contribution.source.kind === 'recipe' &&
      contribution.note !== undefined &&
      contribution.note !== '' &&
      contribution.note !== next,
  );
  const first = replaced[0];
  if (!first) return undefined;
  const from = [...new Set(replaced.map((contribution) => originLabel(contribution.source)))];
  return `${next === '' ? 'Entfernt' : 'Ersetzt'} den Zusatz „${first.note}“ aus ${from.join(', ')}`;
}

/** A dish (recipe or collection) the open items come from (spec 0025, AC-017). */
export interface ListDish {
  recipeId: Id;
  title: string;
  /** Open items with a contribution from it. */
  items: number;
}

export interface ListHeadline {
  open: number;
  /** In the order they were added, each once. */
  dishes: ListDish[];
  /** "14 offen · aus 4 Gerichten", "3 offen · aus 1 Gericht"; "3 offen" without dishes. */
  label: string;
}

/** A stored label without the day and the contained recipe: "Grillabend · Salat (Sa)" → "Grillabend". */
function dishTitleFromLabel(label: string): string {
  return label.replace(/ \([^()]*\)$/, '').split(' · ')[0] ?? label;
}

/**
 * The line under "Einkaufsliste" (spec 0025, REQ-005): open items and the dishes they come from,
 * counted by recipe or collection ("Gerichte", Decision 7). A dish that no longer exists is named
 * by the label stored with its contribution.
 */
export function listHeadline(
  items: readonly ShoppingItem[],
  recipesById: Readonly<Record<Id, Recipe>>,
): ListHeadline {
  const openItems = items
    .filter((item) => !item.checked)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const dishes = new Map<Id, ListDish>();
  for (const item of openItems) {
    const seen = new Set<Id>();
    for (const { source } of item.contributions) {
      if (source.kind !== 'recipe' || seen.has(source.recipeId)) continue;
      seen.add(source.recipeId);
      const dish = dishes.get(source.recipeId) ?? {
        recipeId: source.recipeId,
        title: recipesById[source.recipeId]?.title ?? dishTitleFromLabel(source.label),
        items: 0,
      };
      dishes.set(source.recipeId, { ...dish, items: dish.items + 1 });
    }
  }
  const list = [...dishes.values()];
  const count = `${openItems.length} offen`;
  const label =
    list.length === 0
      ? count
      : `${count} · aus ${list.length} ${list.length === 1 ? 'Gericht' : 'Gerichten'}`;
  return { open: openItems.length, dishes: list, label };
}

/** A row of "Aus diesen Gerichten": "Grillabend · 6 Posten". */
export function dishLabel(dish: ListDish): string {
  return `${dish.title} · ${dish.items} Posten`;
}

/**
 * The question of "Liste leeren …" (spec 0025, AC-019): open and checked items named apart,
 * "14 offene und 3 erledigte Posten werden entfernt, auch die aus dem Kalender."
 */
export function clearListQuestion(open: number, done: number): string {
  const total = open + done;
  const parts = [
    open > 0 ? `${open} ${open === 1 ? 'offener' : 'offene'}` : '',
    done > 0 ? `${done} ${done === 1 ? 'erledigter' : 'erledigte'}` : '',
  ].filter(Boolean);
  const verb = total === 1 ? 'wird entfernt' : 'werden entfernt';
  const calendar =
    open === 0
      ? ''
      : total === 1
        ? ', auch wenn er aus dem Kalender kommt'
        : ', auch die aus dem Kalender';
  return `${parts.join(' und ')} Posten ${verb}${calendar}.`;
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
 * Another member who checked an item in "Einkaufen" within the last SHOPPER_ACTIVE_MINUTES,
 * derived from checkedAt/checkedBy alone (no presence, no store); a check made on "Liste" does not
 * count (spec 0025, AC-025). The most recent one wins; the progress is that of the whole list.
 * "Fertig" removes the checked items, so the hint goes with them.
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
    if (
      !item.checked ||
      item.checkedOnList === true ||
      item.checkedBy === undefined ||
      item.checkedBy === currentMemberId
    ) {
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
