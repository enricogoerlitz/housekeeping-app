import { moveInOrder } from './areas';
import { daysBetween, formatShortDate, weekdayShort } from './dates';
import { overviewSection } from './overview';
import { normalizeText } from './text';
import { stripeText, tripEndLabel, type TripStripe } from './trips';
import type {
  Id,
  ISODate,
  Member,
  PackingBag,
  PackingBagItem,
  PackingItem,
  PackingListBag,
  Trip,
} from './types';

// Rules of Reisetaschen and Packlisten (spec 0012) without a screen. The server checks the same
// limits and computes "je Tag" itself (plan, decisions 3 and 13); this file mirrors it so the
// device can show the result at once.

/** Limits of the database (`packing_*_valid`) and of the plan (decision 13). */
export const MAX_BAG_NAME_LENGTH = 60;
export const MAX_PACKING_ITEM_NAME_LENGTH = 120;
/** Fixed quantity and quantity per day: 1–99. */
export const MAX_PACKING_COUNT = 99;
/** A computed "je Tag" quantity is capped like `least(per_day_quantity × days, 9999)` on the server. */
export const MAX_PACKING_QUANTITY = 9999;
export const MAX_BAG_ITEMS = 100;
/** Rows one save may write; `apply_changes` allows 200 operations (decision 13). */
export const MAX_PACKING_SAVE_ROWS = 190;
const MAX_SUGGESTIONS = 5;

// ---------- Input ----------

export interface PackingLine {
  name: string;
  /** 1–99; undefined = no quantity. */
  quantity?: number;
  /** The quantity is per day of the trip ("1 je Tag", spec 0022 REQ-010). */
  perDay?: true;
}

const PER_DAY_SUFFIX = /(?:(?:^|\s)(?:je|pro)\s+tag|\s*\/\s*tag)$/i;
const STANDALONE_NUMBER = /(?:^|\s)\d+\s*(?:×|x)?(?:\s|$)/i;

/**
 * "n je Tag" (spec 0022, REQ-010): a number 1–99 (with "×"/"x" or without) before "je Tag",
 * "pro Tag" or "/Tag" at the end, or before the name; without a number 1. Two numbers, a number
 * outside 1–99 or no name leave everything as the name (undefined here).
 */
function parsePerDay(text: string): PackingLine | undefined {
  const suffix = PER_DAY_SUFFIX.exec(text);
  if (!suffix) return undefined;
  const head = text.slice(0, suffix.index).trim();
  let name = head;
  let quantity = 1;
  const after = /^(.*?)\s*(\d+)\s*(?:×|x)?$/i.exec(head);
  const before = /^(\d+)\s*(?:×|x(?=\s))?\s*(\S.*)$/i.exec(head);
  if (after && after[1]) {
    name = after[1].trim();
    quantity = Number(after[2]);
  } else if (before && before[2]) {
    name = before[2].trim();
    quantity = Number(before[1]);
  } else if (/^\d/.test(head)) {
    return undefined;
  }
  if (name === '' || STANDALONE_NUMBER.test(name)) return undefined;
  if (quantity < 1 || quantity > MAX_PACKING_COUNT) return undefined;
  return { name, quantity, perDay: true };
}

/** Collapses inner whitespace and trims, the form the database stores (`name = btrim(name)`). */
export function cleanPackingName(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * One typed line (AC-003): "2 Badehose" → Badehose, 2; "2× Badehose" and "2 x Badehose" alike;
 * "Sonnenbrille" without quantity. A number outside 1–99 stays part of the name ("100 Socken").
 * An empty line is nothing.
 */
export function parsePackingLine(line: string): PackingLine | undefined {
  const text = cleanPackingName(line);
  if (text === '') return undefined;
  if (PER_DAY_SUFFIX.test(text)) return parsePerDay(text) ?? { name: text };
  // "x" only counts as "times" when a space follows, so "2 xylophon" keeps its x.
  const match = /^(\d+)(\s*(?:×|[xX](?=\s))?\s*)(\S.*)$/.exec(text);
  const quantity = Number(match?.[1]);
  if (!match?.[2] || !match[3] || quantity < 1 || quantity > MAX_PACKING_COUNT) {
    return { name: text };
  }
  return { name: match[3], quantity };
}

/** "Höchstens 120 Zeichen" for a too long name; undefined = fine. */
export function packingLineProblem(line: PackingLine): string | undefined {
  return Array.from(line.name).length > MAX_PACKING_ITEM_NAME_LENGTH
    ? `Höchstens ${MAX_PACKING_ITEM_NAME_LENGTH} Zeichen`
    : undefined;
}

/** A Reisetasche holds at most 100 Packstücke (decision 13); `count` = how many it has. */
export function bagFullProblem(count: number): string | undefined {
  return count >= MAX_BAG_ITEMS
    ? `Höchstens ${MAX_BAG_ITEMS} Packstücke je Reisetasche`
    : undefined;
}

export type BagNameProblem =
  | { kind: 'missing'; message: string }
  | { kind: 'tooLong'; message: string }
  /** Same name after normalising (case, umlauts, spaces) as another bag of the household. */
  | { kind: 'taken'; existing: PackingBag; message: string };

/**
 * Checks the name of a new bag (no id) or of a renamed one (its id) against the household's bags
 * (AC-007): "Name fehlt", "Gibt es schon: Strand"; at most 60 characters. Undefined = fine.
 */
export function validateBagName(
  name: string,
  bags: readonly PackingBag[],
  ownId?: Id,
): BagNameProblem | undefined {
  const cleaned = cleanPackingName(name);
  if (cleaned === '') return { kind: 'missing', message: 'Name fehlt' };
  if (Array.from(cleaned).length > MAX_BAG_NAME_LENGTH) {
    return { kind: 'tooLong', message: `Höchstens ${MAX_BAG_NAME_LENGTH} Zeichen` };
  }
  const existing = findBagByName(cleaned, bags);
  return existing && existing.id !== ownId
    ? { kind: 'taken', existing, message: `Gibt es schon: ${existing.name}` }
    : undefined;
}

/** The bag with this name (case, umlauts and spaces ignored), for "+ Neue" (AC-013). */
export function findBagByName(name: string, bags: readonly PackingBag[]): PackingBag | undefined {
  const key = normalizeText(name);
  return bags.find((bag) => normalizeText(bag.name) === key);
}

// ---------- Order ----------

function bySortThenId<T extends { id: Id; sort: number }>(a: T, b: T): number {
  return a.sort - b.sort || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** The page "Reisetaschen": order of creation (`sort`), equal values by id. */
export function orderedBags(bags: readonly PackingBag[]): PackingBag[] {
  return [...bags].sort(bySortThenId);
}

/** The Packstücke of one Reisetasche in their order; equal `sort` values by id (decision 11). */
export function bagItemsOf(bagId: Id, items: readonly PackingBagItem[]): PackingBagItem[] {
  return items.filter((item) => item.bagId === bagId).sort(bySortThenId);
}

/** `sort` for a new row at the end. */
export function nextSort(rows: readonly { sort: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, row.sort + 1), 0);
}

/**
 * Moving one Packstück of a bag (`items` in their order) to `toIndex` (AC-006): the new `sort`
 * of each row whose value changes; the order then is the index.
 */
export function bagItemSortChanges(
  items: readonly PackingBagItem[],
  itemId: Id,
  toIndex: number,
): { id: Id; sort: number }[] {
  const ids = items.map((item) => item.id);
  const sortOf = new Map(items.map((item) => [item.id, item.sort]));
  return moveInOrder(ids, itemId, toIndex).flatMap((id, index) =>
    sortOf.get(id) === index ? [] : [{ id, sort: index }],
  );
}

// ---------- Labels ----------

/** A Packstück of a Reisetasche: "Badehose 2×", "T-Shirts · 1 je Tag", "Sonnenbrille". */
export function bagItemLabel(item: Pick<PackingBagItem, 'name' | 'quantity' | 'perDay'>): string {
  if (item.quantity === undefined) return item.name;
  return item.perDay ? `${item.name} · ${item.quantity} je Tag` : `${item.name} ${item.quantity}×`;
}

/** A Packstück of a Packliste, with the computed quantity: "T-Shirts 7×", "Sonnenbrille". */
export function packingItemLabel(item: Pick<PackingItem, 'name' | 'quantity'>): string {
  return item.quantity === undefined ? item.name : `${item.name} ${item.quantity}×`;
}

function countOf(count: number, dative = false): string {
  if (count === 1) return '1 Packstück';
  return `${count} ${dative ? 'Packstücken' : 'Packstücke'}`;
}

/** "12 Packstücke", "1 Packstück" (AC-001). */
export function bagSummary(count: number): string {
  return countOf(count);
}

/** "Speichern · 21 Packstücke"; without a packing list just "Speichern" (AC-011, AC-012). */
export function saveLabel(itemCount: number): string {
  return itemCount === 0 ? 'Speichern' : `Speichern · ${countOf(itemCount)}`;
}

/** Stops a save that would write more rows than one call allows (decision 13). */
export function packingSaveProblem(rowCount: number): string | undefined {
  return rowCount > MAX_PACKING_SAVE_ROWS
    ? 'Zu viele Packstücke auf einmal – bitte weniger Reisetaschen wählen'
    : undefined;
}

// ---------- Suggestions and copies ----------

/**
 * Names from the household's other Reisetaschen for the typed name (AC-005, decision 19): word
 * starts first, then names that contain it, each alphabetically; never a name that is already
 * in this bag; at most five. `query` is the name part of the line (`parsePackingLine`).
 */
export function packingNameSuggestions(
  query: string,
  bagId: Id,
  items: readonly PackingBagItem[],
): string[] {
  const key = normalizeText(query);
  if (key === '') return [];
  const own = new Set(
    items.filter((item) => item.bagId === bagId).map((item) => normalizeText(item.name)),
  );
  const names = new Map<string, string>();
  for (const item of items) {
    const name = normalizeText(item.name);
    if (item.bagId !== bagId && !own.has(name) && !names.has(name)) names.set(name, item.name);
  }
  const starts: string[] = [];
  const contains: string[] = [];
  for (const [name, shown] of names) {
    if (name.split(/[\s-]+/).some((word) => word.startsWith(key))) starts.push(shown);
    else if (name.includes(key)) contains.push(shown);
  }
  const alphabetical = (a: string, b: string) => a.localeCompare(b, 'de');
  return [...starts.sort(alphabetical), ...contains.sort(alphabetical)].slice(0, MAX_SUGGESTIONS);
}

/** The name of a copy (AC-008): "Strand (Kopie)", then "Strand (Kopie 2)", at most 60 characters. */
export function copyName(name: string, bags: readonly PackingBag[]): string {
  for (let number = 1; ; number += 1) {
    const suffix = number === 1 ? ' (Kopie)' : ` (Kopie ${number})`;
    const base = Array.from(name)
      .slice(0, MAX_BAG_NAME_LENGTH - suffix.length)
      .join('')
      .trimEnd();
    const candidate = `${base}${suffix}`;
    if (!findBagByName(candidate, bags)) return candidate;
  }
}

/**
 * "Duplizieren" (AC-008): a new bag at the end of the page with the copy name, the same person
 * and the same Packstücke, quantities and order under new ids.
 */
export function duplicateBag(
  bag: PackingBag,
  items: readonly PackingBagItem[],
  bags: readonly PackingBag[],
  newId: () => Id,
): { bag: PackingBag; items: PackingBagItem[] } {
  const copy: PackingBag = {
    id: newId(),
    name: copyName(bag.name, bags),
    memberId: bag.memberId,
    sort: nextSort(bags),
  };
  const copied = bagItemsOf(bag.id, items).map((item, index) => ({
    ...item,
    id: newId(),
    bagId: copy.id,
    sort: index,
  }));
  return { bag: copy, items: copied };
}

// ---------- Creating a Packliste ----------

/** Days of a trip, the first and the last included (1.–7.1. = 7). */
export function tripDays(from: ISODate, to: ISODate): number {
  return daysBetween(from, to) + 1;
}

/** The quantity of a "je Tag" Packstück, like the server: per day × days, at most 9999. */
export function packQuantity(perDay: number, days: number): number {
  return Math.min(perDay * days, MAX_PACKING_QUANTITY);
}

export interface PackingListPlan {
  listBags: PackingListBag[];
  items: PackingItem[];
}

function copyBag(
  trip: Pick<Trip, 'id' | 'from' | 'to'>,
  bag: PackingBag,
  bagItems: readonly PackingBagItem[],
  sort: number,
  newId: () => Id,
): PackingListPlan {
  const listBag: PackingListBag = {
    id: newId(),
    tripId: trip.id,
    bagId: bag.id,
    name: bag.name,
    memberId: bag.memberId,
    sort,
  };
  const days = tripDays(trip.from, trip.to);
  const items = bagItemsOf(bag.id, bagItems).map((item, index): PackingItem => ({
    id: newId(),
    listBagId: listBag.id,
    name: item.name,
    quantity:
      item.perDay && item.quantity !== undefined
        ? packQuantity(item.quantity, days)
        : item.quantity,
    perDay: item.perDay ? item.quantity : undefined,
    packed: false,
    packSeq: 0,
    sort: index,
    bagItemId: item.id,
    fromBag: true,
  }));
  return { listBags: [listBag], items };
}

function joinPlans(plans: PackingListPlan[]): PackingListPlan {
  return {
    listBags: plans.flatMap((plan) => plan.listBags),
    items: plans.flatMap((plan) => plan.items),
  };
}

/**
 * The packing list of a new trip (spec 0012, AC-011; spec 0022, AC-008, AC-009): a copy of each
 * chosen bag in the order of the page, "je Tag" computed with the trip's days. Chosen bags that no
 * longer exist are left out.
 */
export function planPackingList(input: {
  trip: Pick<Trip, 'id' | 'from' | 'to'>;
  bagIds: readonly Id[];
  bags: readonly PackingBag[];
  bagItems: readonly PackingBagItem[];
  newId: () => Id;
}): PackingListPlan {
  const chosen = orderedBags(input.bags).filter((bag) => input.bagIds.includes(bag.id));
  return joinPlans(
    chosen.map((bag, index) => copyBag(input.trip, bag, input.bagItems, index, input.newId)),
  );
}

/** "+ Reisetasche hinzufügen" (AC-033): a copy of the bag at the end of the trip's list. */
export function planAddBagToList(input: {
  trip: Pick<Trip, 'id' | 'from' | 'to'>;
  bag: PackingBag;
  bagItems: readonly PackingBagItem[];
  listBags: readonly PackingListBag[];
  newId: () => Id;
}): PackingListPlan {
  const sort = nextSort(input.listBags.filter((bag) => bag.tripId === input.trip.id));
  return copyBag(input.trip, input.bag, input.bagItems, sort, input.newId);
}

/**
 * "+ Packstück" (AC-031, AC-032): an open Packstück at the end of the bag of the packing list;
 * with `alsoInBag` (the Packstücke of its Reisetasche) also one at the end of the template.
 */
export function planAddPackingItem(input: {
  listBag: PackingListBag;
  line: PackingLine;
  /** Packstücke of the packing list. */
  items: readonly PackingItem[];
  alsoInBag?: readonly PackingBagItem[];
  /** Days of the trip, for a "je Tag" line (spec 0022, AC-032). */
  days?: number;
  newId: () => Id;
}): { item: PackingItem; bagItem?: PackingBagItem } {
  const perDay = input.line.perDay === true ? input.line.quantity : undefined;
  const item: PackingItem = {
    id: input.newId(),
    listBagId: input.listBag.id,
    name: input.line.name,
    quantity: perDay !== undefined ? packQuantity(perDay, input.days ?? 1) : input.line.quantity,
    perDay,
    packed: false,
    packSeq: 0,
    sort: nextSort(input.items.filter((entry) => entry.listBagId === input.listBag.id)),
    fromBag: false,
  };
  const bagId = input.listBag.bagId;
  if (!input.alsoInBag || bagId === undefined) return { item };
  const bagItem: PackingBagItem = {
    id: input.newId(),
    bagId,
    name: input.line.name,
    quantity: input.line.quantity,
    perDay: perDay !== undefined,
    sort: nextSort(input.alsoInBag.filter((entry) => entry.bagId === bagId)),
  };
  return { item: { ...item, bagItemId: bagItem.id, fromBag: true }, bagItem };
}

/** The Reisetasche a bag of the packing list came from, while it exists (decision 18). */
export function sourceBag(
  listBag: PackingListBag,
  bags: readonly PackingBag[],
): PackingBag | undefined {
  return listBag.bagId === undefined ? undefined : bags.find((bag) => bag.id === listBag.bagId);
}

/**
 * The chips of the trip window (AC-012, decision 12): the bag used last first (latest start
 * of a trip it hangs on), never used ones in the order of the page.
 */
export function bagChipOrder(
  bags: readonly PackingBag[],
  listBags: readonly PackingListBag[],
  trips: readonly Pick<Trip, 'id' | 'from'>[],
): PackingBag[] {
  const fromOf = new Map(trips.map((trip) => [trip.id, trip.from]));
  const lastUsed = new Map<Id, ISODate>();
  for (const listBag of listBags) {
    const from = fromOf.get(listBag.tripId);
    if (listBag.bagId === undefined || from === undefined) continue;
    const known = lastUsed.get(listBag.bagId);
    if (known === undefined || from > known) lastUsed.set(listBag.bagId, from);
  }
  const page = orderedBags(bags);
  const used = page
    .filter((bag) => lastUsed.has(bag.id))
    .sort((a, b) => (lastUsed.get(b.id) ?? '').localeCompare(lastUsed.get(a.id) ?? ''));
  return [...used, ...page.filter((bag) => !lastUsed.has(bag.id))];
}

/** "+ Reisetasche hinzufügen" offers every bag not yet attached to the trip (AC-033). */
export function addableBags(
  bags: readonly PackingBag[],
  listBags: readonly PackingListBag[],
  tripId: Id,
): PackingBag[] {
  const attached = new Set(listBags.filter((bag) => bag.tripId === tripId).map((bag) => bag.bagId));
  return orderedBags(bags).filter((bag) => !attached.has(bag.id));
}

// ---------- Reise-Fenster ----------

export interface PackingProgress {
  packed: number;
  total: number;
  /** "12 von 30 gepackt". */
  label: string;
}

/** Counts Packstücke, not quantities (AC-016, AC-017). */
export function packingProgress(items: readonly PackingItem[]): PackingProgress {
  const packed = items.filter((item) => item.packed).length;
  return { packed, total: items.length, label: `${packed} von ${items.length} gepackt` };
}

export interface PackingSection {
  listBag: PackingListBag;
  /** Open Packstücke in the order of the template. */
  open: PackingItem[];
  /** "Gepackt (n)" at the end of the section, same order. */
  packed: PackingItem[];
  packedCount: number;
  total: number;
  /** "4/9", next to the name. */
  counter: string;
}

/** One section per bag of the trip's packing list, in its order (AC-016, AC-020). */
export function packingSections(
  listBags: readonly PackingListBag[],
  items: readonly PackingItem[],
  tripId: Id,
): PackingSection[] {
  return listBags
    .filter((bag) => bag.tripId === tripId)
    .sort(bySortThenId)
    .map((listBag) => {
      const own = items.filter((item) => item.listBagId === listBag.id).sort(bySortThenId);
      const packed = own.filter((item) => item.packed);
      return {
        listBag,
        open: own.filter((item) => !item.packed),
        packed,
        packedCount: packed.length,
        total: own.length,
        counter: `${packed.length}/${own.length}`,
      };
    });
}

export interface TripHeader {
  title: string;
  /** The avatars: every member for the whole household. */
  memberIds: Id[];
  /** "Fr 1.1. – Do 7.1.", one date for a single day. */
  period: string;
  /** "7 Tage", "1 Tag". */
  duration: string;
  /** "Fr 1.1. – Do 7.1. · 7 Tage". */
  subtitle: string;
}

function dayLabel(date: ISODate): string {
  return `${weekdayShort(date)} ${formatShortDate(date)}`;
}

/** The head of the trip window (AC-001): note as title, who, period and days. */
export function tripHeader(stripe: TripStripe, members: readonly Member[]): TripHeader {
  const period =
    stripe.from === stripe.to
      ? dayLabel(stripe.from)
      : `${dayLabel(stripe.from)} – ${dayLabel(stripe.to)}`;
  const days = tripDays(stripe.from, stripe.to);
  const duration = days === 1 ? '1 Tag' : `${days} Tage`;
  return {
    title: stripeText(stripe),
    memberIds: stripe.household ? members.map((member) => member.id) : [...stripe.memberIds],
    period,
    duration,
    subtitle: `${period} · ${duration}`,
  };
}

/**
 * "beginnt in 12 Tagen", "beginnt morgen", "beginnt heute", during the trip "läuft bis Do
 * 7.1.", afterwards "vorbei" (decision 15). `day` is today, in the trip window (AC-001) as on
 * the card of the Übersicht (spec 0018, AC-020).
 */
export function startsInLabel(from: ISODate, to: ISODate, day: ISODate): string {
  const days = daysBetween(day, from);
  if (days > 1) return `beginnt in ${days} Tagen`;
  if (days === 1) return 'beginnt morgen';
  if (days === 0) return 'beginnt heute';
  if (day <= to) return `läuft ${tripEndLabel(to)}`;
  return 'vorbei';
}

// ---------- Changing the duration and deleting ----------

/**
 * The quantities after the duration changed (AC-037), as the server recalculates them: open
 * "je Tag" Packstücke get per day × `days`; packed and fixed ones stay as they are.
 */
export function recalcPerDay(items: readonly PackingItem[], days: number): PackingItem[] {
  return items.map((item) => {
    if (item.packed || item.perDay === undefined) return item;
    const quantity = packQuantity(item.perDay, days);
    return quantity === item.quantity ? item : { ...item, quantity };
  });
}

function itemsOfListBags(
  listBags: readonly PackingListBag[],
  items: readonly PackingItem[],
): number {
  const ids = new Set(listBags.map((bag) => bag.id));
  return items.filter((item) => ids.has(item.listBagId)).length;
}

/**
 * The dialog before deleting a trip (AC-016): "Die Packliste mit 30 Packstücken wird mit
 * gelöscht."; undefined without a packing list (then 5 s "Rückgängig", AC-017).
 */
export function tripDeleteDialog(
  tripId: Id,
  listBags: readonly PackingListBag[],
  items: readonly PackingItem[],
): string | undefined {
  const own = listBags.filter((bag) => bag.tripId === tripId);
  if (own.length === 0) return undefined;
  return `Die Packliste mit ${countOf(itemsOfListBags(own, items), true)} wird mit gelöscht.`;
}

// ---------- Übersicht and calendar ----------

export interface PackingCard {
  tripId: Id;
  /** The note of the trip, else "unterwegs"; the card reads "Reisetasche · <title>". */
  title: string;
  /** The avatars; empty for the whole household. */
  memberIds: Id[];
  packed: number;
  total: number;
  /** "12/30 gepackt", fully packed "alles gepackt ✓" (AC-042, AC-044). */
  progressLabel: string;
  /** Counted from today, whatever day is shown (spec 0018, AC-020). */
  startsIn: string;
}

/**
 * The cards "Reisetasche" of the Übersicht (D33, decision 15): one per trip with at least one
 * bag, when the Abschnitt of the shown day (spec 0020, REQ-010) holds a day of it or it starts 1
 * to 7 days after the shown day; earliest first. "beginnt in n Tagen" counts from today (spec
 * 0018, AC-020).
 */
export function packingCards(input: {
  shownDay: ISODate;
  today: ISODate;
  trips: readonly TripStripe[];
  listBags: readonly PackingListBag[];
  items: readonly PackingItem[];
}): PackingCard[] {
  const section = overviewSection(input.shownDay, input.today);
  return [...input.trips]
    .filter((trip) => {
      // A draft has no packing card yet (spec 0030, AC-013).
      if (trip.draft) return false;
      const ahead = daysBetween(input.shownDay, trip.from);
      const inSection = trip.from <= section.to && trip.to >= section.from;
      return inSection || (ahead >= 1 && ahead <= 7);
    })
    .sort(
      (a, b) =>
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to) ||
        (a.tripId < b.tripId ? -1 : a.tripId > b.tripId ? 1 : 0),
    )
    .flatMap((trip): PackingCard[] => {
      const own = input.listBags.filter((bag) => bag.tripId === trip.tripId);
      if (own.length === 0) return [];
      const ids = new Set(own.map((bag) => bag.id));
      const progress = packingProgress(input.items.filter((item) => ids.has(item.listBagId)));
      const allPacked = progress.total > 0 && progress.packed === progress.total;
      return [
        {
          tripId: trip.tripId,
          title: stripeText(trip),
          memberIds: trip.household ? [] : trip.memberIds,
          packed: progress.packed,
          total: progress.total,
          progressLabel: allPacked
            ? 'alles gepackt ✓'
            : `${progress.packed}/${progress.total} gepackt`,
          startsIn: startsInLabel(trip.from, trip.to, input.today),
        },
      ];
    });
}

/** The bag icon on a stripe: its trip has a packing list (AC-046). */
export function stripeHasPackingList(
  stripe: Pick<TripStripe, 'tripId'>,
  listBags: readonly PackingListBag[],
): boolean {
  return listBags.some((bag) => bag.tripId === stripe.tripId);
}

// ---------- Changing a Packstück of the packing list (spec 0022, REQ-009) ----------

/**
 * The Packstück after "Speichern" in its window (AC-028, AC-030): name, count (empty, 1–99) and
 * "je Tag" with the trip's `days`; "je Tag" without a count is 1. The packed state stays.
 */
export function planEditPackingItem(input: {
  item: PackingItem;
  name: string;
  count?: number;
  perDay: boolean;
  days: number;
}): PackingItem {
  const name = cleanPackingName(input.name);
  if (name === '') throw new Error('Name fehlt');
  const tooLong = packingLineProblem({ name });
  if (tooLong) throw new Error(tooLong);
  const count = input.perDay ? (input.count ?? 1) : input.count;
  if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > MAX_PACKING_COUNT)) {
    throw new Error(`Anzahl 1 bis ${MAX_PACKING_COUNT}`);
  }
  return {
    ...input.item,
    name,
    quantity: input.perDay && count !== undefined ? packQuantity(count, input.days) : count,
    perDay: input.perDay ? count : undefined,
  };
}

/** The template values of a Packstück of a Reisetasche, as a Packstück of a list holds them. */
function templateOf(
  bagItem: PackingBagItem,
  days: number,
): Pick<PackingItem, 'name' | 'quantity' | 'perDay'> {
  const perDay = bagItem.perDay && bagItem.quantity !== undefined ? bagItem.quantity : undefined;
  return {
    name: bagItem.name,
    quantity: perDay !== undefined ? packQuantity(perDay, days) : bagItem.quantity,
    perDay,
  };
}

function differs(item: PackingItem, bagItem: PackingBagItem): boolean {
  const perDay = bagItem.perDay && bagItem.quantity !== undefined ? bagItem.quantity : undefined;
  if (item.name !== bagItem.name || item.perDay !== perDay) return true;
  return perDay === undefined && item.quantity !== bagItem.quantity;
}

// ---------- Reisetasche and upcoming packing lists (spec 0022, REQ-012, REQ-013) ----------

export interface BagDeviation {
  tripId: Id;
  listBagId: Id;
  /** The trip's title ("Urlaub Mallorca", else "unterwegs") and start. */
  title: string;
  from: ISODate;
  days: number;
  /** Packstücke of the Reisetasche without a counterpart in the packing list. */
  added: PackingBagItem[];
  /** Open Packstücke whose name, count or "je Tag" differ from the Reisetasche. */
  changed: { item: PackingItem; bagItem: PackingBagItem }[];
  /** Open Packstücke from the Reisetasche whose template was deleted. */
  removed: PackingItem[];
  /** Changed or removed ones that are packed: they stay as they are. */
  keptPacked: PackingItem[];
}

/**
 * Where the upcoming packing lists (trip ends today or later, earliest first) differ from a
 * Reisetasche they were copied from (AC-036 to AC-038): new, changed, removed; Packstücke added by
 * hand never count, packed ones are listed apart. Lists without a difference are left out.
 */
export function bagDeviations(input: {
  bag: PackingBag;
  bagItems: readonly PackingBagItem[];
  trips: readonly TripStripe[];
  listBags: readonly PackingListBag[];
  items: readonly PackingItem[];
  today: ISODate;
}): BagDeviation[] {
  const template = bagItemsOf(input.bag.id, input.bagItems);
  const byId = new Map(template.map((bagItem) => [bagItem.id, bagItem]));
  return [...input.trips]
    .filter((trip) => trip.to >= input.today)
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
    .flatMap((trip): BagDeviation[] =>
      input.listBags
        .filter((listBag) => listBag.tripId === trip.tripId && listBag.bagId === input.bag.id)
        .flatMap((listBag): BagDeviation[] => {
          const own = input.items
            .filter((item) => item.listBagId === listBag.id && item.fromBag === true)
            .sort(bySortThenId);
          const linked = new Set(own.flatMap((item) => item.bagItemId ?? []));
          const deviation: BagDeviation = {
            tripId: trip.tripId,
            listBagId: listBag.id,
            title: stripeText(trip),
            from: trip.from,
            days: tripDays(trip.from, trip.to),
            added: template.filter((bagItem) => !linked.has(bagItem.id)),
            changed: [],
            removed: [],
            keptPacked: [],
          };
          for (const item of own) {
            const bagItem = item.bagItemId === undefined ? undefined : byId.get(item.bagItemId);
            if (bagItem && !differs(item, bagItem)) continue;
            if (item.packed) deviation.keptPacked.push(item);
            else if (bagItem) deviation.changed.push({ item, bagItem });
            else deviation.removed.push(item);
          }
          const count =
            deviation.added.length + deviation.changed.length + deviation.removed.length;
          return count === 0 ? [] : [deviation];
        }),
    );
}

/** "„Urlaub Mallorca“ (ab Fr 4.12.) weicht ab: 1 neu, 1 geändert, 1 entfernt." (AC-036, AC-037). */
export function bagDeviationHint(deviation: BagDeviation): string {
  const parts = [
    deviation.added.length > 0 ? `${deviation.added.length} neu` : undefined,
    deviation.changed.length > 0 ? `${deviation.changed.length} geändert` : undefined,
    deviation.removed.length > 0 ? `${deviation.removed.length} entfernt` : undefined,
  ].filter(Boolean);
  return `„${deviation.title}“ (ab ${dayLabel(deviation.from)}) weicht ab: ${parts.join(', ')}.`;
}

/**
 * The dialog of "Übernehmen" (AC-037): "Neu: Sonnencreme. Geändert: Badehose 3×. Entfernt:
 * Schnorchel. Bleibt, weil gepackt: Socken."
 */
export function adoptBagDialog(deviation: BagDeviation): string {
  const names = (list: string[]) => list.join(', ');
  return [
    deviation.added.length > 0
      ? `Neu: ${names(deviation.added.map((bagItem) => bagItemLabel(bagItem)))}.`
      : undefined,
    deviation.changed.length > 0
      ? `Geändert: ${names(
          deviation.changed.map(({ bagItem }) =>
            packingItemLabel(templateOf(bagItem, deviation.days)),
          ),
        )}.`
      : undefined,
    deviation.removed.length > 0
      ? `Entfernt: ${names(deviation.removed.map((item) => item.name))}.`
      : undefined,
    deviation.keptPacked.length > 0
      ? `Bleibt, weil gepackt: ${names(deviation.keptPacked.map((item) => item.name))}.`
      : undefined,
  ]
    .filter(Boolean)
    .join(' ');
}

export interface AdoptBagPlan {
  listBagId: Id;
  /** New open Packstücke at the end of the bag of the packing list. */
  insert: PackingItem[];
  /** Changed open Packstücke with the template's name, count and "je Tag". */
  update: PackingItem[];
  /** Removed open Packstücke. */
  deleteIds: Id[];
}

/** What "Übernehmen" writes (AC-036, AC-037); packed ones are not touched. */
export function planAdoptBag(input: {
  deviation: BagDeviation;
  items: readonly PackingItem[];
  days: number;
  newId: () => Id;
}): AdoptBagPlan {
  const { deviation } = input;
  let sort = nextSort(input.items.filter((item) => item.listBagId === deviation.listBagId));
  return {
    listBagId: deviation.listBagId,
    insert: deviation.added.map((bagItem) => ({
      id: input.newId(),
      listBagId: deviation.listBagId,
      ...templateOf(bagItem, input.days),
      packed: false,
      packSeq: 0,
      sort: sort++,
      bagItemId: bagItem.id,
      fromBag: true,
    })),
    update: deviation.changed.map(({ item, bagItem }) => ({
      ...item,
      ...templateOf(bagItem, input.days),
    })),
    deleteIds: deviation.removed.map((item) => item.id),
  };
}

export interface UpcomingPackingList {
  tripId: Id;
  title: string;
  /** "Mo 30.11. – Mi 2.12.". */
  period: string;
  /** "12/30 gepackt", fully packed "alles gepackt ✓". */
  progressLabel: string;
  memberIds: Id[];
  household: boolean;
}

/**
 * "Kommende Packlisten" on "Reisetaschen" (REQ-013, AC-039, AC-040): one row per trip that ends
 * today or later and has a packing list, earliest first.
 */
export function upcomingPackingLists(input: {
  trips: readonly TripStripe[];
  listBags: readonly PackingListBag[];
  items: readonly PackingItem[];
  today: ISODate;
}): UpcomingPackingList[] {
  return [...input.trips]
    .filter((trip) => trip.to >= input.today)
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
    .flatMap((trip): UpcomingPackingList[] => {
      const own = new Set(
        input.listBags.filter((bag) => bag.tripId === trip.tripId).map((bag) => bag.id),
      );
      if (own.size === 0) return [];
      const progress = packingProgress(input.items.filter((item) => own.has(item.listBagId)));
      const allPacked = progress.total > 0 && progress.packed === progress.total;
      return [
        {
          tripId: trip.tripId,
          title: stripeText(trip),
          period:
            trip.from === trip.to
              ? dayLabel(trip.from)
              : `${dayLabel(trip.from)} – ${dayLabel(trip.to)}`,
          progressLabel: allPacked
            ? 'alles gepackt ✓'
            : `${progress.packed}/${progress.total} gepackt`,
          memberIds: trip.memberIds,
          household: trip.household,
        },
      ];
    });
}
