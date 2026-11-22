import {
  bagDeviations,
  bagFullProblem,
  bagItemSortChanges,
  bagItemsOf,
  cleanPackingName,
  duplicateBag,
  findBagByName,
  nextSort,
  packAllEntries,
  packEntry,
  packingLineProblem,
  parsePackingLine,
  planAddBagToList,
  planAddPackingItem,
  planAdoptBag,
  planEditPackingItem,
  resetEntries,
  tripDays,
  tripStripes,
  undoPackAll,
  validateBagName,
  type AdoptBagPlan,
  type Id,
  type PackEntry,
  type PackingBag,
  type PackingBagItem,
  type PackingItem,
  type PackingListBag,
} from '@housekeeping/core';

import { packingListBagToRow } from './db/mapping';
import { commit, getData, getState, newId, queueStoreAction, updateData } from './store';
import {
  TransportError,
  type AdoptBagChange,
  type AdoptPackingItem,
  type ChangeOp,
  type RestorePackingItem,
} from './transport';

// Reisetaschen and Packlisten (spec 0012). Rules live in core (packing.ts, packing-actions.ts);
// here each action is one change: apply_changes for everything that adds, changes or removes
// (online only), the store queue for packing (works offline, ADR-0013). Removing a Packstück or a
// bag of a packing list sends only that delete and undoes with restore_packing_items, which brings
// back the packed state that members cannot write.

function requireBag(bagId: Id): PackingBag {
  const bag = getData().packingBags.find((candidate) => candidate.id === bagId);
  if (!bag) throw new Error('Die Reisetasche gibt es nicht mehr.');
  return bag;
}

function requireBagItem(itemId: Id): PackingBagItem {
  const item = getData().packingBagItems.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error('Das Packstück gibt es nicht mehr.');
  return item;
}

function requireListBag(listBagId: Id): PackingListBag {
  const bag = getData().packingListBags.find((candidate) => candidate.id === listBagId);
  if (!bag) throw new Error('Die Tasche gibt es in der Packliste nicht mehr.');
  return bag;
}

function requirePackingItem(itemId: Id): PackingItem {
  const item = getData().packingItems.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error('Das Packstück gibt es nicht mehr.');
  return item;
}

/** The name of a bag as stored; throws the field's message ("Name fehlt", "Gibt es schon: …"). */
function checkedBagName(name: string, ownId?: Id): string {
  const problem = validateBagName(name, getData().packingBags, ownId);
  if (problem) throw new Error(problem.message);
  return cleanPackingName(name);
}

/** Another device created the same name meanwhile (packing_bags_household_id_name_idx). */
const nameTaken = (name: string) => (error: unknown) =>
  error instanceof TransportError && error.code === '23505' ? `Gibt es schon: ${name}` : undefined;

// ---------- Reisetaschen (REQ-001) ----------

/** "+ Neue Reisetasche" (also in the trip window, AC-013, spec 0022 AC-034): at the end of the page. */
export function createPackingBag(input: { name: string; memberId?: Id }): Id {
  const name = checkedBagName(input.name);
  const bag: PackingBag = {
    id: newId(),
    name,
    memberId: input.memberId,
    sort: nextSort(getData().packingBags),
  };
  commit({ path: 'diff', rejectedMessage: nameTaken(name) }, () =>
    updateData((data) => ({ ...data, packingBags: [...data.packingBags, bag] })),
  );
  return bag.id;
}

function patchBag(bagId: Id, changes: Partial<PackingBag>): void {
  updateData((data) => ({
    ...data,
    packingBags: data.packingBags.map((bag) => (bag.id === bagId ? { ...bag, ...changes } : bag)),
  }));
}

export function renamePackingBag(bagId: Id, name: string): void {
  requireBag(bagId);
  const cleaned = checkedBagName(name, bagId);
  commit({ path: 'diff', rejectedMessage: nameTaken(cleaned) }, () =>
    patchBag(bagId, { name: cleaned }),
  );
}

/** "für" one member, or undefined for everyone. */
export function setPackingBagMember(bagId: Id, memberId: Id | undefined): void {
  requireBag(bagId);
  commit({ path: 'diff' }, () => patchBag(bagId, { memberId }));
}

/** "Duplizieren" (AC-008): "Strand (Kopie)" with the same Packstücke, in one call. */
export function duplicatePackingBag(bagId: Id): Id {
  const data = getData();
  const copy = duplicateBag(requireBag(bagId), data.packingBagItems, data.packingBags, newId);
  commit({ path: 'diff', rejectedMessage: nameTaken(copy.bag.name) }, () =>
    updateData((current) => ({
      ...current,
      packingBags: [...current.packingBags, copy.bag],
      packingBagItems: [...current.packingBagItems, ...copy.items],
    })),
  );
  return copy.bag.id;
}

/**
 * "Löschen" (AC-009): sends only the delete of the bag; the database deletes its Packstücke and
 * clears the origin of the packing lists' bags, which stay as they are. `snapshot()` taken before
 * undoes it in one call: the bag and its Packstücke with the same ids, linked again.
 */
export function deletePackingBag(bagId: Id): void {
  requireBag(bagId);
  commit({ path: 'diff', maxDeletes: { packing_bags: 1 } }, () =>
    updateData((data) => ({
      ...data,
      packingBags: data.packingBags.filter((bag) => bag.id !== bagId),
      packingBagItems: data.packingBagItems.filter((item) => item.bagId !== bagId),
      packingListBags: data.packingListBags.map((bag) =>
        bag.bagId === bagId ? { ...bag, bagId: undefined } : bag,
      ),
    })),
  );
}

/**
 * A typed line ("2 Badehose", AC-003) at the end of the bag; an empty line adds nothing
 * (undefined). Throws "Höchstens 120 Zeichen" and "Höchstens 100 Packstücke je Reisetasche".
 */
export function addPackingBagItem(bagId: Id, text: string): Id | undefined {
  requireBag(bagId);
  const line = parsePackingLine(text);
  if (!line) return undefined;
  const own = bagItemsOf(bagId, getData().packingBagItems);
  const problem = packingLineProblem(line) ?? bagFullProblem(own.length);
  if (problem) throw new Error(problem);
  const item: PackingBagItem = {
    id: newId(),
    bagId,
    name: line.name,
    quantity: line.quantity,
    perDay: line.perDay === true,
    sort: nextSort(own),
  };
  commit({ path: 'diff' }, () =>
    updateData((data) => ({ ...data, packingBagItems: [...data.packingBagItems, item] })),
  );
  return item.id;
}

/**
 * Name, quantity (1–99, null = none) and "je Tag" of a Packstück of a bag (AC-004). "Je Tag"
 * needs a quantity: switching it on without one sets 1.
 */
export function updatePackingBagItem(
  itemId: Id,
  changes: { name?: string; quantity?: number | null; perDay?: boolean },
): void {
  const item = requireBagItem(itemId);
  const name = changes.name === undefined ? item.name : cleanPackingName(changes.name);
  if (name === '') throw new Error('Name fehlt');
  const nameProblem = packingLineProblem({ name });
  if (nameProblem) throw new Error(nameProblem);
  let quantity = changes.quantity === undefined ? item.quantity : (changes.quantity ?? undefined);
  const perDay = changes.perDay ?? item.perDay;
  if (perDay && quantity === undefined) quantity = 1;
  if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)) {
    throw new Error('Anzahl 1 bis 99');
  }
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      packingBagItems: data.packingBagItems.map((candidate) =>
        candidate.id === itemId ? { ...candidate, name, quantity, perDay } : candidate,
      ),
    })),
  );
}

/** Moves a Packstück of a bag to `toIndex` (AC-006): `sort` of each moved row, one call. */
export function movePackingBagItem(itemId: Id, toIndex: number): void {
  const item = requireBagItem(itemId);
  const changes = bagItemSortChanges(
    bagItemsOf(item.bagId, getData().packingBagItems),
    itemId,
    toIndex,
  );
  if (changes.length === 0) return;
  const sortOf = new Map(changes.map((change) => [change.id, change.sort]));
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      packingBagItems: data.packingBagItems.map((candidate) => {
        const sort = sortOf.get(candidate.id);
        return sort === undefined ? candidate : { ...candidate, sort };
      }),
    })),
  );
}

export function removePackingBagItem(itemId: Id): void {
  requireBagItem(itemId);
  commit({ path: 'diff', maxDeletes: { packing_bag_items: 1 } }, () =>
    updateData((data) => ({
      ...data,
      packingBagItems: data.packingBagItems.filter((item) => item.id !== itemId),
    })),
  );
}

// ---------- Packliste ergänzen und kürzen (REQ-007) ----------

/** "+ Reisetasche hinzufügen" (AC-033): a copy at the end of the packing list; its id. */
export function addBagToPackingList(tripId: Id, bagId: Id): Id {
  const data = getData();
  const trip = data.trips.find((candidate) => candidate.id === tripId);
  if (!trip) throw new Error('Diese Reise gibt es nicht mehr.');
  const plan = planAddBagToList({
    trip,
    bag: requireBag(bagId),
    bagItems: data.packingBagItems,
    listBags: data.packingListBags,
    newId,
  });
  const [listBag] = plan.listBags;
  if (!listBag) throw new Error('packing list bag missing');
  commit({ path: 'diff' }, () =>
    updateData((current) => ({
      ...current,
      packingListBags: [...current.packingListBags, ...plan.listBags],
      packingItems: [...current.packingItems, ...plan.items],
    })),
  );
  return listBag.id;
}

/**
 * "+ Packstück" (AC-031): an open Packstück at the end of the bag of the packing list; with
 * `alsoInBag` also at the end of its Reisetasche while that exists (AC-032), in the same call.
 * An empty line adds nothing (undefined).
 */
export function addPackingItem(
  listBagId: Id,
  text: string,
  options: { alsoInBag?: boolean } = {},
): Id | undefined {
  const listBag = requireListBag(listBagId);
  const line = parsePackingLine(text);
  if (!line) return undefined;
  const problem = packingLineProblem(line);
  if (problem) throw new Error(problem);
  const data = getData();
  const template =
    options.alsoInBag && listBag.bagId !== undefined
      ? data.packingBags.find((bag) => bag.id === listBag.bagId)
      : undefined;
  if (template) {
    const full = bagFullProblem(bagItemsOf(template.id, data.packingBagItems).length);
    if (full) throw new Error(full);
  }
  const plan = planAddPackingItem({
    listBag,
    line,
    items: data.packingItems,
    alsoInBag: template ? data.packingBagItems : undefined,
    days: daysOfListBag(listBag),
    newId,
  });
  commit({ path: 'diff' }, () =>
    updateData((current) => ({
      ...current,
      packingItems: [...current.packingItems, plan.item],
      packingBagItems: plan.bagItem
        ? [...current.packingBagItems, plan.bagItem]
        : current.packingBagItems,
    })),
  );
  return plan.item.id;
}

/** The Packstücke as restore_packing_items puts them back, with their packed state. */
function restoreRows(items: readonly PackingItem[]): RestorePackingItem[] {
  return items.map((item) => ({
    id: item.id,
    list_bag_id: item.listBagId,
    name: item.name,
    quantity: item.quantity ?? null,
    per_day: item.perDay ?? null,
    sort: item.sort,
    packed: item.packed,
    packed_at: item.packedAt ?? null,
    packed_by: item.packedBy ?? null,
    pack_seq: item.packSeq,
    bag_item_id: item.bagItemId ?? null,
    from_bag: item.fromBag ?? false,
  }));
}

/**
 * "Aus der Packliste entfernen" (AC-034): sends only the delete of the bag of the packing list,
 * its Packstücke go with it. `snapshot()` taken before undoes it in one call: the bag and its
 * Packstücke with their packed state (restore_packing_items).
 */
export function removeBagFromPackingList(listBagId: Id): void {
  const listBag = requireListBag(listBagId);
  const items = getData().packingItems.filter((item) => item.listBagId === listBagId);
  commit(
    {
      path: 'rpc',
      send: (transport, context) =>
        transport.applyChanges(context.householdId, [
          { kind: 'delete', table: 'packing_list_bags', id: listBagId },
        ]),
      inverse: (transport, context) =>
        transport.applyChanges(context.householdId, [
          {
            kind: 'insert',
            table: 'packing_list_bags',
            row: insertRow(packingListBagToRow(context.householdId, listBag)),
          },
          ...(items.length > 0
            ? [
                {
                  kind: 'restore_packing_items' as const,
                  items: restoreRows(items),
                },
              ]
            : []),
        ]),
    },
    () =>
      updateData((data) => ({
        ...data,
        packingListBags: data.packingListBags.filter((bag) => bag.id !== listBagId),
        packingItems: data.packingItems.filter((item) => item.listBagId !== listBagId),
      })),
  );
}

/** An insert of `apply_changes` carries no household_id (the call names the household). */
function insertRow(row: Record<string, unknown>): { id: string } & Record<string, unknown> {
  const copy = { ...row };
  delete copy.household_id;
  return { ...copy, id: String(row.id) };
}

/**
 * Removing a Packstück from the packing list (AC-035, swipe or ⋯ → „Entfernen“). `snapshot()`
 * taken before undoes it with its packed state (restore_packing_items).
 */
export function removePackingItem(itemId: Id): void {
  const item = requirePackingItem(itemId);
  commit(
    {
      path: 'rpc',
      send: (transport, context) =>
        transport.applyChanges(context.householdId, [
          { kind: 'delete', table: 'packing_items', id: itemId },
        ]),
      inverse: (transport, context) =>
        transport.applyChanges(context.householdId, [
          { kind: 'restore_packing_items', items: restoreRows([item]) },
        ]),
    },
    () =>
      updateData((data) => ({
        ...data,
        packingItems: data.packingItems.filter((candidate) => candidate.id !== itemId),
      })),
  );
}

// ---------- Packen (REQ-004 to REQ-006): store queue, also offline ----------

function queuePack(entry: PackEntry): void {
  queueStoreAction({
    kind: 'pack',
    householdId: entry.householdId,
    itemId: entry.itemId,
    packed: entry.packed,
  });
}

/** Packs or unpacks one Packstück (AC-020, AC-021); offline it waits in the store queue. */
export function setPacked(itemId: Id, packed: boolean): void {
  const item = requirePackingItem(itemId);
  queuePack(packEntry(getState().activeHouseholdId, item, packed));
}

/**
 * "Alles einpacken" (AC-026, AC-027): packs every open Packstück of the bag of the packing list.
 * Returns its "Rückgängig", which unpacks exactly those again; both work offline.
 */
export function packAll(listBagId: Id): () => void {
  requireListBag(listBagId);
  const householdId = getState().activeHouseholdId;
  const items = getData().packingItems.filter((item) => item.listBagId === listBagId);
  const entries = packAllEntries(householdId, items);
  for (const entry of entries) queuePack(entry);
  const packedIds = entries.map((entry) => entry.itemId);
  return () => {
    const current = getState().households[householdId]?.packingItems ?? [];
    for (const entry of undoPackAll(householdId, packedIds, current)) queuePack(entry);
  };
}

/**
 * "Für die Rückreise zurücksetzen" (AC-028 to AC-030; spec 0022, AC-018): unpacks every packed
 * Packstück of the trip's packing list; returns how many. Works offline; a Packstück packed again
 * elsewhere meanwhile stays packed ("Abhaken gewinnt").
 */
export function resetPackingList(tripId: Id): number {
  const data = getData();
  const listBagIds = new Set(
    data.packingListBags.filter((bag) => bag.tripId === tripId).map((bag) => bag.id),
  );
  const items = data.packingItems.filter((item) => listBagIds.has(item.listBagId));
  const entries = resetEntries(getState().activeHouseholdId, items);
  for (const entry of entries) queuePack(entry);
  return entries.length;
}

// ---------- Spec 0022: changing Packstücke, new Reisetasche, adopting changes ----------

function daysOfListBag(listBag: PackingListBag): number {
  const trip = getData().trips.find((candidate) => candidate.id === listBag.tripId);
  if (!trip) throw new Error('Diese Reise gibt es nicht mehr.');
  return tripDays(trip.from, trip.to);
}

const itemChanges = (item: PackingItem) => ({
  name: item.name,
  quantity: item.quantity ?? null,
  per_day: item.perDay ?? null,
});

/**
 * "Speichern" in the window of a Packstück of the packing list (REQ-009, AC-028 to AC-030): name,
 * count and "je Tag"; it stays packed. With `alsoInBag` the Packstück of its Reisetasche changes
 * too ("Auch in der Reisetasche „Strand“ ändern"); one added by hand is saved into the Reisetasche
 * and linked to it ("… speichern"). One call, undone with the inverse patch.
 */
export function updatePackingItem(
  itemId: Id,
  input: { name: string; count?: number; perDay: boolean; alsoInBag?: boolean },
): void {
  const item = requirePackingItem(itemId);
  const listBag = requireListBag(item.listBagId);
  const next = planEditPackingItem({ item, ...input, days: daysOfListBag(listBag) });
  const data = getData();
  const linked =
    item.bagItemId === undefined
      ? undefined
      : data.packingBagItems.find((candidate) => candidate.id === item.bagItemId);
  const template =
    input.alsoInBag && !linked && listBag.bagId !== undefined
      ? data.packingBags.find((bag) => bag.id === listBag.bagId)
      : undefined;
  if (template) {
    const full = bagFullProblem(bagItemsOf(template.id, data.packingBagItems).length);
    if (full) throw new Error(full);
  }
  const count = input.perDay ? (input.count ?? 1) : input.count;
  const bagChanges = { name: next.name, quantity: count ?? null, per_day: input.perDay };
  const newBagItem: PackingBagItem | undefined = template
    ? {
        id: newId(),
        bagId: template.id,
        name: next.name,
        quantity: count,
        perDay: input.perDay,
        sort: nextSort(bagItemsOf(template.id, data.packingBagItems)),
      }
    : undefined;
  const saved: PackingItem = newBagItem
    ? { ...next, bagItemId: newBagItem.id, fromBag: true }
    : next;
  const ops = (): ChangeOp[] => [
    ...(newBagItem
      ? [
          {
            kind: 'insert' as const,
            table: 'packing_bag_items',
            row: {
              id: newBagItem.id,
              bag_id: newBagItem.bagId,
              name: newBagItem.name,
              quantity: newBagItem.quantity ?? null,
              per_day: newBagItem.perDay,
              sort: newBagItem.sort,
            },
          },
        ]
      : []),
    {
      kind: 'patch',
      table: 'packing_items',
      id: itemId,
      changes: {
        ...itemChanges(saved),
        ...(newBagItem ? { bag_item_id: newBagItem.id, from_bag: true } : {}),
      },
    },
    ...(input.alsoInBag && linked
      ? [{ kind: 'patch' as const, table: 'packing_bag_items', id: linked.id, changes: bagChanges }]
      : []),
  ];
  const inverse = (): ChangeOp[] => [
    {
      kind: 'patch',
      table: 'packing_items',
      id: itemId,
      changes: {
        ...itemChanges(item),
        ...(newBagItem
          ? { bag_item_id: item.bagItemId ?? null, from_bag: item.fromBag ?? false }
          : {}),
      },
    },
    ...(input.alsoInBag && linked
      ? [
          {
            kind: 'patch' as const,
            table: 'packing_bag_items',
            id: linked.id,
            changes: {
              name: linked.name,
              quantity: linked.quantity ?? null,
              per_day: linked.perDay,
            },
          },
        ]
      : []),
    ...(newBagItem
      ? [{ kind: 'delete' as const, table: 'packing_bag_items', id: newBagItem.id }]
      : []),
  ];
  commit(
    {
      path: 'rpc',
      send: (transport, context) => transport.applyChanges(context.householdId, ops()),
      inverse: (transport, context) => transport.applyChanges(context.householdId, inverse()),
    },
    () =>
      updateData((current) => ({
        ...current,
        packingItems: current.packingItems.map((candidate) =>
          candidate.id === itemId
            ? {
                ...saved,
                packed: candidate.packed,
                packSeq: candidate.packSeq,
                packedAt: candidate.packedAt,
                packedBy: candidate.packedBy,
              }
            : candidate,
        ),
        packingBagItems: newBagItem
          ? [...current.packingBagItems, newBagItem]
          : input.alsoInBag && linked
            ? current.packingBagItems.map((candidate) =>
                candidate.id === linked.id
                  ? { ...candidate, name: next.name, quantity: count, perDay: input.perDay }
                  : candidate,
              )
            : current.packingBagItems,
      })),
  );
}

/**
 * "+ Neue Reisetasche" in the trip window (REQ-011, AC-034, AC-035): "Anlegen" creates the empty
 * Reisetasche and attaches it in one call. A Reisetasche of that name (case and umlauts ignored)
 * that is not attached yet is attached instead, with its Packstücke; one already attached is
 * "Hängt schon an dieser Packliste". Returns the id of the bag of the packing list.
 */
export function attachNewBag(tripId: Id, name: string): Id {
  const data = getData();
  const trip = data.trips.find((candidate) => candidate.id === tripId);
  if (!trip) throw new Error('Diese Reise gibt es nicht mehr.');
  const existing = findBagByName(cleanPackingName(name), data.packingBags);
  if (existing) {
    const attached = data.packingListBags.some(
      (bag) => bag.tripId === tripId && bag.bagId === existing.id,
    );
    if (attached) throw new Error('Hängt schon an dieser Packliste');
    return addBagToPackingList(tripId, existing.id);
  }
  const bag: PackingBag = {
    id: newId(),
    name: checkedBagName(name),
    sort: nextSort(data.packingBags),
  };
  const plan = planAddBagToList({
    trip,
    bag,
    bagItems: [],
    listBags: data.packingListBags,
    newId,
  });
  const [listBag] = plan.listBags;
  if (!listBag) throw new Error('packing list bag missing');
  commit({ path: 'diff', rejectedMessage: nameTaken(bag.name) }, () =>
    updateData((current) => ({
      ...current,
      packingBags: [...current.packingBags, bag],
      packingListBags: [...current.packingListBags, ...plan.listBags],
    })),
  );
  return listBag.id;
}

const adoptRow = (item: PackingItem): AdoptPackingItem => ({
  id: item.id,
  name: item.name,
  quantity: item.quantity ?? null,
  per_day: item.perDay ?? null,
  sort: item.sort,
  bag_item_id: item.bagItemId ?? null,
  from_bag: item.fromBag ?? true,
});

/**
 * "In „Urlaub Mallorca“ übernehmen" (REQ-012, AC-036 to AC-038): new Packstücke of the
 * Reisetasche open at the end, changed open ones adapted, removed open ones deleted; packed ones
 * stay, also when they are packed on another device before the call runs (the server checks).
 * One call; `snapshot()` taken before undoes it with the inverse call. Returns the plan.
 */
export function adoptBagChanges(bagId: Id, tripId: Id): AdoptBagPlan | undefined {
  const data = getData();
  const bag = requireBag(bagId);
  const stripes = tripStripes(data.trips, getState().members);
  const deviation = bagDeviations({
    bag,
    bagItems: data.packingBagItems,
    trips: stripes,
    listBags: data.packingListBags,
    items: data.packingItems,
    today: getState().today,
  }).find((candidate) => candidate.tripId === tripId);
  if (!deviation) return undefined;
  const plan = planAdoptBag({ deviation, items: data.packingItems, days: deviation.days, newId });
  const before = new Map(data.packingItems.map((item) => [item.id, item]));
  const removed = plan.deleteIds.flatMap((id) => before.get(id) ?? []);
  const changed = plan.update.flatMap((item) => before.get(item.id) ?? []);
  const change: AdoptBagChange = {
    list_bag_id: plan.listBagId,
    insert: plan.insert.map(adoptRow),
    update: plan.update.map((item) => ({ id: item.id, ...itemChanges(item) })),
    delete: plan.deleteIds,
  };
  const undo: AdoptBagChange = {
    list_bag_id: plan.listBagId,
    insert: removed.map((item) => ({ ...adoptRow(item), bag_item_id: null })),
    update: changed.map((item) => ({ id: item.id, ...itemChanges(item) })),
    delete: plan.insert.map((item) => item.id),
  };
  const updated = new Map(plan.update.map((item) => [item.id, item]));
  const deleted = new Set(plan.deleteIds);
  commit(
    {
      path: 'rpc',
      send: (transport, context) =>
        transport.applyChanges(context.householdId, [{ kind: 'adopt_bag_changes', change }]),
      inverse: (transport, context) =>
        transport.applyChanges(context.householdId, [{ kind: 'adopt_bag_changes', change: undo }]),
    },
    () =>
      updateData((current) => ({
        ...current,
        packingItems: [
          ...current.packingItems
            .filter((item) => !(deleted.has(item.id) && !item.packed))
            .map((item) => {
              const next = updated.get(item.id);
              return next && !item.packed ? { ...item, ...itemChangesOf(next) } : item;
            }),
          ...plan.insert,
        ],
      })),
  );
  return plan;
}

function itemChangesOf(item: PackingItem): Pick<PackingItem, 'name' | 'quantity' | 'perDay'> {
  return { name: item.name, quantity: item.quantity, perDay: item.perDay };
}
