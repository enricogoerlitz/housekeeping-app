import {
  absenceEndLabel,
  absenceStripes,
  stripeText,
  type AbsenceStripe,
  type DroppedPackingList,
} from './absences';
import { moveInOrder } from './areas';
import { addDays, daysBetween, formatShortDate, startOfWeek, weekdayShort } from './dates';
import { normalizeText } from './text';
import type {
  Absence,
  Id,
  ISODate,
  Member,
  PackingBag,
  PackingBagItem,
  PackingItem,
  PackingListBag,
} from './types';

// Rules of Reisetaschen and Packlisten (spec 0012) without a screen. The server checks the same
// limits and computes "je Tag" itself (plan, decisions 3 and 13); this file mirrors it so the
// device can show the result at once.

/** Limits of the database (`packing_*_valid`) and of the plan (decision 13). */
export const MAX_BAG_NAME_LENGTH = 60;
export const MAX_PACKING_ITEM_NAME_LENGTH = 120;
/** Fixed quantity and quantity per day: 1–99. */
export const MAX_PACKING_COUNT = 99;
/** A computed "je Tag" quantity is capped like `least(per_day × days, 9999)` on the server. */
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

/** Days of an absence, the first and the last included (1.–7.1. = 7). */
export function absenceDays(from: ISODate, to: ISODate): number {
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
  absence: Pick<Absence, 'id' | 'from' | 'to'>,
  bag: PackingBag,
  bagItems: readonly PackingBagItem[],
  sort: number,
  newId: () => Id,
): PackingListPlan {
  const listBag: PackingListBag = {
    id: newId(),
    absenceId: absence.id,
    bagId: bag.id,
    name: bag.name,
    memberId: bag.memberId,
    sort,
  };
  const days = absenceDays(absence.from, absence.to);
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
 * The packing lists of the absences saved together (AC-011, AC-014; decision 9): a copy of each
 * chosen bag in the order of the page, "je Tag" computed with each absence's days. With several
 * single absences a bag "für" one of their people goes only to her list, every other bag to each
 * list. Chosen bags that no longer exist are left out.
 */
export function planPackingLists(input: {
  absences: readonly Pick<Absence, 'id' | 'memberId' | 'from' | 'to'>[];
  bagIds: readonly Id[];
  bags: readonly PackingBag[];
  bagItems: readonly PackingBagItem[];
  newId: () => Id;
}): PackingListPlan {
  const chosen = orderedBags(input.bags).filter((bag) => input.bagIds.includes(bag.id));
  const people = new Set(input.absences.flatMap((absence) => absence.memberId ?? []));
  const several = input.absences.length > 1;
  return joinPlans(
    input.absences.map((absence) => {
      const bags = chosen.filter(
        (bag) =>
          !several ||
          bag.memberId === undefined ||
          !people.has(bag.memberId) ||
          bag.memberId === absence.memberId,
      );
      return joinPlans(
        bags.map((bag, index) => copyBag(absence, bag, input.bagItems, index, input.newId)),
      );
    }),
  );
}

/** "+ Reisetasche hinzufügen" (AC-033): a copy of the bag at the end of the absence's list. */
export function planAddBagToList(input: {
  absence: Pick<Absence, 'id' | 'from' | 'to'>;
  bag: PackingBag;
  bagItems: readonly PackingBagItem[];
  listBags: readonly PackingListBag[];
  newId: () => Id;
}): PackingListPlan {
  const sort = nextSort(input.listBags.filter((bag) => bag.absenceId === input.absence.id));
  return copyBag(input.absence, input.bag, input.bagItems, sort, input.newId);
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
  newId: () => Id;
}): { item: PackingItem; bagItem?: PackingBagItem } {
  const item: PackingItem = {
    id: input.newId(),
    listBagId: input.listBag.id,
    name: input.line.name,
    quantity: input.line.quantity,
    packed: false,
    packSeq: 0,
    sort: nextSort(input.items.filter((entry) => entry.listBagId === input.listBag.id)),
  };
  const bagId = input.listBag.bagId;
  if (!input.alsoInBag || bagId === undefined) return { item };
  const bagItem: PackingBagItem = {
    id: input.newId(),
    bagId,
    name: input.line.name,
    quantity: input.line.quantity,
    perDay: false,
    sort: nextSort(input.alsoInBag.filter((entry) => entry.bagId === bagId)),
  };
  return { item, bagItem };
}

/** The Reisetasche a bag of the packing list came from, while it exists (decision 18). */
export function sourceBag(
  listBag: PackingListBag,
  bags: readonly PackingBag[],
): PackingBag | undefined {
  return listBag.bagId === undefined ? undefined : bags.find((bag) => bag.id === listBag.bagId);
}

/**
 * The chips of the absence window (AC-012, decision 12): the bag used last first (latest start
 * of an absence it hangs on), never used ones in the order of the page.
 */
export function bagChipOrder(
  bags: readonly PackingBag[],
  listBags: readonly PackingListBag[],
  absences: readonly Absence[],
): PackingBag[] {
  const fromOf = new Map(absences.map((absence) => [absence.id, absence.from]));
  const lastUsed = new Map<Id, ISODate>();
  for (const listBag of listBags) {
    const from = fromOf.get(listBag.absenceId);
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

/** "+ Reisetasche hinzufügen" offers every bag not yet attached to the absence (AC-033). */
export function addableBags(
  bags: readonly PackingBag[],
  listBags: readonly PackingListBag[],
  absenceId: Id,
): PackingBag[] {
  const attached = new Set(
    listBags.filter((bag) => bag.absenceId === absenceId).map((bag) => bag.bagId),
  );
  return orderedBags(bags).filter((bag) => !attached.has(bag.id));
}

// ---------- Urlaubsseite ----------

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

/** One section per bag of the absence's packing list, in its order (AC-016, AC-020). */
export function packingSections(
  listBags: readonly PackingListBag[],
  items: readonly PackingItem[],
  absenceId: Id,
): PackingSection[] {
  return listBags
    .filter((bag) => bag.absenceId === absenceId)
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

/** The stripe a trip page shows: the one holding the absence of its address (decisions 9, 14). */
export function tripStripe(
  absenceId: Id,
  absences: Absence[],
  members: Member[],
): AbsenceStripe | undefined {
  return absenceStripes(absences, members).find((stripe) => stripe.absenceIds.includes(absenceId));
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

/** The head of the Urlaubsseite (AC-016): note as title, who, period and days. */
export function tripHeader(stripe: AbsenceStripe, members: readonly Member[]): TripHeader {
  const period =
    stripe.from === stripe.to
      ? dayLabel(stripe.from)
      : `${dayLabel(stripe.from)} – ${dayLabel(stripe.to)}`;
  const days = absenceDays(stripe.from, stripe.to);
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
 * "beginnt in 12 Tagen", "beginnt morgen", "beginnt heute", during the absence "läuft bis Do
 * 7.1.", afterwards "vorbei" (decision 15). `day` is today on the Urlaubsseite (AC-016) and the
 * shown day on the card of the Übersicht (AC-042).
 */
export function startsInLabel(from: ISODate, to: ISODate, day: ISODate): string {
  const days = daysBetween(day, from);
  if (days > 1) return `beginnt in ${days} Tagen`;
  if (days === 1) return 'beginnt morgen';
  if (days === 0) return 'beginnt heute';
  if (day <= to) return `läuft ${absenceEndLabel(to)}`;
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
 * The dialog before deleting absences (AC-038): "Die Packliste mit 30 Packstücken wird mit
 * gelöscht."; undefined when none of them has a packing list (then 5 s "Rückgängig").
 */
export function absenceDeleteDialog(
  absenceIds: readonly Id[],
  listBags: readonly PackingListBag[],
  items: readonly PackingItem[],
): string | undefined {
  const own = listBags.filter((bag) => absenceIds.includes(bag.absenceId));
  if (own.length === 0) return undefined;
  const count = countOf(itemsOfListBags(own, items), true);
  const lists = new Set(own.map((bag) => bag.absenceId)).size;
  return lists === 1
    ? `Die Packliste mit ${count} wird mit gelöscht.`
    : `Die Packlisten mit ${count} werden mit gelöscht.`;
}

/**
 * The note in the absence window when saving removes rows with a packing list (decision 8):
 * "Die Packliste von Enrico mit 21 Packstücken wird mit gelöscht."; undefined when none.
 */
export function droppedPackingListMessage(
  dropped: readonly DroppedPackingList[],
  members: readonly Member[],
): string | undefined {
  if (dropped.length === 0) return undefined;
  return dropped
    .map((list) => {
      const name = members.find((member) => member.id === list.memberId)?.name;
      const whose = name === undefined ? '' : ` von ${name}`;
      return `Die Packliste${whose} mit ${countOf(list.itemCount, true)} wird mit gelöscht.`;
    })
    .join(' ');
}

// ---------- Übersicht and calendar ----------

export interface PackingCard {
  absenceId: Id;
  /** The note of the absence, else "abwesend"; the card reads "Reisetasche · <title>". */
  title: string;
  /** The avatar; undefined for the whole household. */
  memberId?: Id;
  packed: number;
  total: number;
  /** "12/30 gepackt", fully packed "alles gepackt ✓" (AC-042, AC-044). */
  progressLabel: string;
  /** Counted from the shown day (AC-042). */
  startsIn: string;
}

/**
 * The cards "Reisetasche" of the Übersicht (D33, decision 15): one per absence with at least one
 * bag, when the week (Mo–So) of the shown day holds a day of it or it starts 1 to 7 days after
 * the shown day; earliest first.
 */
export function packingCards(input: {
  shownDay: ISODate;
  absences: readonly Absence[];
  listBags: readonly PackingListBag[];
  items: readonly PackingItem[];
}): PackingCard[] {
  const monday = startOfWeek(input.shownDay);
  const sunday = addDays(monday, 6);
  return [...input.absences]
    .filter((absence) => {
      const ahead = daysBetween(input.shownDay, absence.from);
      const inWeek = absence.from <= sunday && absence.to >= monday;
      return inWeek || (ahead >= 1 && ahead <= 7);
    })
    .sort(
      (a, b) =>
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .flatMap((absence): PackingCard[] => {
      const own = input.listBags.filter((bag) => bag.absenceId === absence.id);
      if (own.length === 0) return [];
      const ids = new Set(own.map((bag) => bag.id));
      const progress = packingProgress(input.items.filter((item) => ids.has(item.listBagId)));
      const allPacked = progress.total > 0 && progress.packed === progress.total;
      return [
        {
          absenceId: absence.id,
          title: stripeText({ note: absence.note?.trim() || undefined }),
          memberId: absence.memberId,
          packed: progress.packed,
          total: progress.total,
          progressLabel: allPacked
            ? 'alles gepackt ✓'
            : `${progress.packed}/${progress.total} gepackt`,
          startsIn: startsInLabel(absence.from, absence.to, input.shownDay),
        },
      ];
    });
}

/** The bag icon on a stripe: one of its absences has a packing list (AC-046). */
export function stripeHasPackingList(
  stripe: Pick<AbsenceStripe, 'absenceIds'>,
  listBags: readonly PackingListBag[],
): boolean {
  return listBags.some((bag) => stripe.absenceIds.includes(bag.absenceId));
}
