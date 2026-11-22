import {
  areaSortPatches,
  moveInOrder,
  normalizeText,
  validateAreaName,
  type Area,
  type Id,
  type Store,
} from '@housekeeping/core';

import { commit, getData, newId, updateData } from './store';

// "Märkte & Bereiche" (spec 0007, REQ-008 to REQ-010): stores with their walking order and the
// household's areas. Each command is one change: apply_changes, or merge_areas, which moves any
// number of articles (E9).

/** areas_name_valid and stores_name_valid in the database. */
export const AREA_NAME_MAX_LENGTH = 80;
const STORE_NAME_MAX_LENGTH = 80;

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

function storeName(name: string): string {
  const trimmed = collapse(name);
  if (!trimmed) throw new Error('Name fehlt');
  if (Array.from(trimmed).length > STORE_NAME_MAX_LENGTH) {
    throw new Error(`Höchstens ${STORE_NAME_MAX_LENGTH} Zeichen`);
  }
  return trimmed;
}

function patchStore(storeId: Id, patch: (store: Store) => Store): void {
  updateData((data) => ({
    ...data,
    stores: data.stores.map((store) => (store.id === storeId ? patch(store) : store)),
  }));
}

// ---------- Areas ----------

/**
 * "„Deko“ neu anlegen" under "Bereich" (AC-024): a new area of the household, last in the order
 * without store. A name that exists already (any case) returns that area instead of a second
 * one. Online only; assigning it to an article is `assignArticleArea`.
 */
export function createArea(name: string): Id {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) throw new Error('Name fehlt');
  if (trimmed.length > AREA_NAME_MAX_LENGTH) {
    throw new Error(`Höchstens ${AREA_NAME_MAX_LENGTH} Zeichen`);
  }
  const { areas } = getData();
  const existing = areas.find((area) => normalizeText(area.name) === normalizeText(trimmed));
  if (existing) return existing.id;
  const area: Area = {
    id: newId(),
    name: trimmed,
    sort: areas.reduce((max, candidate) => Math.max(max, candidate.sort), 0) + 1,
  };
  commit({ path: 'diff' }, () => updateData((data) => ({ ...data, areas: [...data.areas, area] })));
  return area.id;
}

/** "Umbenennen" (AC-052): the articles keep their area. Throws "Gibt es schon: Getränke". */
export function renameArea(areaId: Id, name: string): void {
  const problem = validateAreaName(name, getData().areas, areaId);
  if (problem) throw new Error(problem.message);
  const trimmed = collapse(name);
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      areas: data.areas.map((area) => (area.id === areaId ? { ...area, name: trimmed } : area)),
    })),
  );
}

/**
 * Moves an area in the order without store (AC-053): drag or the arrows "nach oben" / "nach
 * unten". Patches only the areas whose place changed; the stores keep their walking order.
 */
export function moveArea(areaId: Id, toIndex: number): void {
  const ordered = [...getData().areas].sort((a, b) => a.sort - b.sort).map((area) => area.id);
  const patches = new Map(
    areaSortPatches(getData().areas, moveInOrder(ordered, areaId, toIndex)).map((patch) => [
      patch.id,
      patch.sort,
    ]),
  );
  if (patches.size === 0) return;
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      areas: data.areas
        .map((area) => {
          const sort = patches.get(area.id);
          return sort === undefined ? area : { ...area, sort };
        })
        .sort((a, b) => a.sort - b.sort),
    })),
  );
}

/**
 * "Zusammenlegen mit …" (AC-054): one merge_areas call; the articles of the source move to the
 * target, the source leaves every walking order and is deleted. The target keeps its place and
 * visibility. Returns how many articles moved. Not undoable (open question 3). Online only.
 */
export function mergeAreas(sourceId: Id, targetId: Id): number {
  const { areas, articles } = getData();
  if (sourceId === targetId)
    throw new Error('Ein Bereich lässt sich nicht mit sich selbst zusammenlegen.');
  if (!areas.some((area) => area.id === sourceId) || !areas.some((area) => area.id === targetId)) {
    throw new Error('Den Bereich gibt es nicht mehr.');
  }
  const moved = articles.filter((article) => article.areaId === sourceId).length;
  commit({ path: 'rpc', send: (transport) => transport.mergeAreas(sourceId, targetId) }, () =>
    updateData((data) => ({
      ...data,
      areas: data.areas.filter((area) => area.id !== sourceId),
      articles: data.articles.map((article) =>
        article.areaId === sourceId ? { ...article, areaId: targetId } : article,
      ),
      stores: data.stores.map((store) => withoutArea(store, sourceId)),
    })),
  );
  return moved;
}

function withoutArea(store: Store, areaId: Id): Store {
  if (!store.areaOrder.includes(areaId) && !store.hiddenAreaIds.includes(areaId)) return store;
  return {
    ...store,
    areaOrder: store.areaOrder.filter((id) => id !== areaId),
    hiddenAreaIds: store.hiddenAreaIds.filter((id) => id !== areaId),
  };
}

/**
 * "Löschen …" (AC-055, AC-056, E9): the area and its place in every walking order, one
 * apply_changes call. Its articles lose the area on the server (foreign key, on delete set null)
 * and show under "Ohne Bereich" right away, because an unknown area counts as none. `snapshot()`
 * taken before brings an empty area back with its places. Online only.
 */
export function deleteArea(areaId: Id): void {
  commit({ path: 'diff', maxDeletes: { areas: 1 } }, () =>
    updateData((data) => ({
      ...data,
      areas: data.areas.filter((area) => area.id !== areaId),
      stores: data.stores.map((store) => withoutArea(store, areaId)),
    })),
  );
}

// ---------- Stores ----------

export function createStore(name: string, copyFrom?: Id): Id {
  const trimmed = storeName(name);
  const source =
    copyFrom === undefined ? undefined : getData().stores.find((s) => s.id === copyFrom);
  if (copyFrom !== undefined && !source) throw new Error('Den Markt gibt es nicht mehr.');
  const bySort = [...getData().areas]
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
    .map((area) => area.id);
  const store: Store = {
    id: newId(),
    name: trimmed,
    areaOrder: source ? [...source.areaOrder] : bySort,
    hiddenAreaIds: [...(source?.hiddenAreaIds ?? [])],
  };
  commit(
    {
      path: 'rpc',
      send: (transport, context) =>
        transport.createStore(context.householdId, store.id, trimmed, copyFrom ?? null),
    },
    () => updateData((current) => ({ ...current, stores: [...current.stores, store] })),
  );
  return store.id;
}

/** ✎ on a store (AC-044); "Name fehlt", at most 80 characters. */
export function renameStore(storeId: Id, name: string): void {
  const trimmed = storeName(name);
  commit({ path: 'diff' }, () => patchStore(storeId, (store) => ({ ...store, name: trimmed })));
}

/**
 * "Als Standard" (AC-044): the household's default store; null = none. Devices without an own
 * choice show it in "Einkaufen".
 */
export function setDefaultStore(storeId: Id | null): void {
  commit({ path: 'diff' }, () =>
    updateData((data) => {
      const household = { ...data.household };
      if (storeId === null) delete household.defaultStoreId;
      else household.defaultStoreId = storeId;
      return { ...data, household };
    }),
  );
}

/**
 * "Markt löschen …" (AC-045): the store with its walking order; a default store is cleared with
 * it (the server does the same, on delete set null). Online only.
 */
export function deleteStore(storeId: Id): void {
  commit({ path: 'diff', maxDeletes: { stores: 1 } }, () =>
    updateData((data) => {
      const household = { ...data.household };
      if (household.defaultStoreId === storeId) delete household.defaultStoreId;
      return {
        ...data,
        household,
        stores: data.stores.filter((store) => store.id !== storeId),
      };
    }),
  );
}

/** The complete walking order of a store: its own order, then the remaining areas. */
export function fullAreaOrder(store: Store): Id[] {
  const rest = [...getData().areas]
    .sort((a, b) => a.sort - b.sort)
    .map((area) => area.id)
    .filter((id) => !store.areaOrder.includes(id));
  return [...store.areaOrder, ...rest];
}

/** Moves an area to a new position in the store's walking order. */
export function moveStoreArea(storeId: Id, areaId: Id, toIndex: number): void {
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      stores: data.stores.map((store) => {
        if (store.id !== storeId) return store;
        const order = fullAreaOrder(store).filter((id) => id !== areaId);
        const index = Math.max(0, Math.min(order.length, toIndex));
        order.splice(index, 0, areaId);
        return { ...store, areaOrder: order };
      }),
    })),
  );
}

export function setStoreAreaHidden(storeId: Id, areaId: Id, hidden: boolean): void {
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      stores: data.stores.map((store) =>
        store.id === storeId
          ? {
              ...store,
              hiddenAreaIds: hidden
                ? [...new Set([...store.hiddenAreaIds, areaId])]
                : store.hiddenAreaIds.filter((id) => id !== areaId),
            }
          : store,
      ),
    })),
  );
}

/**
 * "+ Bereich hinzufügen" in a store (AC-048, AC-049): an area of the household is shown again at
 * its place; a new name creates the area for the whole household, last in this store's walking
 * order (and at the end of every other one). One change. Returns the area's id.
 */
export function addAreaToStore(storeId: Id, choice: { areaId: Id } | { name: string }): Id {
  return commit({ path: 'diff' }, () => {
    const key = 'areaId' in choice ? undefined : normalizeText(choice.name);
    const existing =
      'areaId' in choice
        ? choice.areaId
        : getData().areas.find((area) => normalizeText(area.name) === key)?.id;
    if (existing !== undefined) {
      setStoreAreaHidden(storeId, existing, false);
      return existing;
    }
    if ('areaId' in choice) return choice.areaId;
    const areaId = createArea(choice.name);
    patchStore(storeId, (store) => ({
      ...store,
      areaOrder: [...fullAreaOrder(store).filter((id) => id !== areaId), areaId],
      hiddenAreaIds: store.hiddenAreaIds.filter((id) => id !== areaId),
    }));
    return areaId;
  });
}
