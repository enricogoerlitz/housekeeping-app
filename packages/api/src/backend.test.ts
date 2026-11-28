import { normalizeText, type PullRequest } from '@housekeeping/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CACHE_VERSION,
  createEngine,
  onWriteRejected,
  resetLocalData,
  startBackend,
  stopBackend,
  WRITE_REJECTED_MESSAGE,
  type Engine,
} from './backend';
import { switchHousehold } from './commands-household';
import { createRecipe, updateRecipe } from './commands-recipes';
import { removePlanEntry } from './commands-plan';
import { createPackingBag } from './commands-packing';
import { chooseShoppingStore, setItemChecked } from './commands-shopping';
import { fakeEnvironment, seededServer, type FakeEnvironment } from './backend-test-helpers';
import { DEMO_HOUSEHOLD_ID, ENRICO, NADJA } from './seed/demo';
import { createMemoryStorage, type Storage } from './storage';
import {
  commit,
  commitConfirmed,
  getData,
  getState,
  OfflineError,
  queueStoreAction,
  snapshot,
  updateData,
  type StoreAction,
} from './store';
import { TransportError, type Transport } from './transport';
import type { FakeServer } from './transport-fake';

const H = DEMO_HOUSEHOLD_ID;

// ---------- fixtures ----------

/** Records every pull request a device sends. */
function recording(transport: Transport): Transport & { pulls: PullRequest[] } {
  const pulls: PullRequest[] = [];
  return {
    ...transport,
    pulls,
    syncPull: (request) => {
      pulls.push(request);
      return transport.syncPull(request);
    },
  };
}

let server: FakeServer;
let environment: FakeEnvironment;
let storage: Storage;
const passive: Engine[] = [];

async function settle(...engines: Engine[]): Promise<void> {
  for (let round = 0; round < 6; round += 1) {
    await vi.advanceTimersByTimeAsync(400);
    for (const engine of engines) await engine.whenIdle();
  }
}

/** Enrico's device: the one the app's store (and so the commands) is attached to. */
async function startEnrico(options: { transport?: Transport; cacheVersion?: number } = {}) {
  const engine = await startBackend({
    transport: options.transport ?? server.transport(ENRICO),
    storage,
    userId: ENRICO,
    environment,
    cacheVersion: options.cacheVersion,
  });
  await settle(engine);
  return engine;
}

/** Nadja's device: a second engine, not attached to the store. */
async function startNadja() {
  const engine = createEngine({
    transport: server.transport(NADJA),
    storage: createMemoryStorage(),
    userId: NADJA,
    environment: fakeEnvironment(),
  });
  passive.push(engine);
  await engine.start();
  await settle(engine);
  return engine;
}

const nadjaData = (engine: Engine) => {
  const data = engine.getState()?.households[H];
  if (!data) throw new Error('Nadja has no data');
  return data;
};
const itemByArticle = (items: ReturnType<typeof getData>['items'], name: string) => {
  const article = getData().articles.find((candidate) => candidate.name === name);
  return items.find((item) => item.articleId === article?.id);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-20T10:00:00Z'));
  server = seededServer();
  environment = fakeEnvironment();
  storage = createMemoryStorage();
});

afterEach(async () => {
  for (const engine of passive.splice(0)) engine.stop();
  await stopBackend();
  vi.useRealTimers();
});

// ---------- tests ----------

describe('sync engine', () => {
  it('loads the household on first start (two round trips) and shows it', async () => {
    const transport = recording(server.transport(ENRICO));
    const engine = await startEnrico({ transport });
    expect(transport.pulls[0]).toEqual({ households: {} });
    expect(transport.pulls[1]).toEqual({ households: { [H]: { full: true } } });
    expect(getData().household.name).toBe('Enrico & Nadja');
    expect(getData().recipes.length).toBeGreaterThanOrEqual(20);
    expect(getState().currentMemberId).toBe(ENRICO);
    expect(engine.getSyncState()).toMatchObject({ status: 'idle', ready: true });
  });

  it('AC-013: a recipe created on one device appears on the other without reload', async () => {
    await startEnrico();
    const nadja = await startNadja();
    const id = createRecipe({ title: 'Linsen-Dal' });
    expect(getData().recipes[0]?.id).toBe(id);
    await settle(nadja);
    expect(nadjaData(nadja).recipes.find((recipe) => recipe.id === id)?.title).toBe('Linsen-Dal');
  });

  it('AC-014: what was written is still there after a reload, also without network', async () => {
    await startEnrico();
    const id = createRecipe({ title: 'Spülmittel-Kuchen' });
    await settle();
    await stopBackend();

    environment.setOnline(false);
    await startEnrico();
    expect(getData().recipes.find((recipe) => recipe.id === id)?.title).toBe('Spülmittel-Kuchen');
    expect(getState().offline).toBe(true);
  });

  it('AC-015: a deleted plan entry disappears on the other device', async () => {
    await startEnrico();
    const nadja = await startNadja();
    const entry = getData().planEntries.find((candidate) => candidate.kind === 'recipe');
    if (!entry) throw new Error('fixture');
    expect(nadjaData(nadja).planEntries.some((candidate) => candidate.id === entry.id)).toBe(true);

    commit({ path: 'diff', maxDeletes: { meal_plan_entries: 1 } }, () => removePlanEntry(entry.id));
    await settle(nadja);
    expect(nadjaData(nadja).planEntries.some((candidate) => candidate.id === entry.id)).toBe(false);
  });

  it('AC-016: offline the data stays readable and editing throws OfflineError', async () => {
    const engine = await startEnrico();
    const before = getData();
    engine.setSimulatedOffline(true);
    expect(getState().offline).toBe(true);
    expect(getData().recipes).toBe(before.recipes);
    expect(() => createRecipe({ title: 'Offline' })).toThrow(OfflineError);
    expect(getData().recipes).toBe(before.recipes);
    await settle(engine);
    expect(engine.getSyncState().status).toBe('offline');
  });

  it('AC-017: after longer offline than the retention, the household is loaded in full', async () => {
    await startEnrico();
    const recipe = getData().recipes[3];
    if (!recipe) throw new Error('fixture');
    await stopBackend();

    server.deleteRow(H, 'recipes', recipe.id);
    vi.setSystemTime(new Date('2026-12-25T10:00:00Z'));
    server.purgeDeletionsBefore('2026-11-25T10:00:00Z');
    const transport = recording(server.transport(ENRICO));
    await startEnrico({ transport });
    expect(transport.pulls.some((request) => request.households[H]?.full === true)).toBe(true);
    expect(getData().recipes.some((candidate) => candidate.id === recipe.id)).toBe(false);
  });

  it('AC-018: a new cache version throws the old cache away and loads everything again', async () => {
    await startEnrico({ cacheVersion: 1 });
    await stopBackend();
    const transport = recording(server.transport(ENRICO));
    await startEnrico({ transport, cacheVersion: 2 });
    expect(transport.pulls[0]).toEqual({ households: {} });
    expect(transport.pulls[1]).toEqual({ households: { [H]: { full: true } } });
    expect(getData().household.name).toBe('Enrico & Nadja');
  });

  it('AC-018: a cache of the app before activities (version 1) is loaded again in full', async () => {
    await startEnrico({ cacheVersion: 1 });
    await stopBackend();
    const transport = recording(server.transport(ENRICO));
    await startEnrico({ transport });
    expect(transport.pulls[0]).toEqual({ households: {} });
  });

  it('pulls once for a burst of realtime signals (debounced)', async () => {
    await startEnrico();
    const transport = recording(server.transport(NADJA));
    const nadja = createEngine({
      transport,
      storage: createMemoryStorage(),
      userId: NADJA,
      environment: fakeEnvironment(),
    });
    passive.push(nadja);
    await nadja.start();
    await settle(nadja);
    const before = transport.pulls.length;

    const enrico = server.transport(ENRICO);
    await enrico.setItemNotAvailable('item-1', true);
    await enrico.setItemNotAvailable('item-2', true);
    await enrico.setItemNotAvailable('item-3', true);
    await vi.advanceTimersByTimeAsync(299);
    expect(transport.pulls.length).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    await nadja.whenIdle();
    expect(transport.pulls.length).toBe(before + 1);
    expect(nadjaData(nadja).items.find((item) => item.id === 'item-3')?.notAvailable).toBe(true);
  });

  it('pulls on foreground, when the network is back, and every 60 s', async () => {
    const transport = recording(server.transport(ENRICO));
    await startEnrico({ transport });
    let count = transport.pulls.length;
    environment.foreground();
    await settle();
    expect(transport.pulls.length).toBe(count + 1);

    count = transport.pulls.length;
    environment.setOnline(false);
    environment.setOnline(true);
    await settle();
    expect(transport.pulls.length).toBe(count + 1);

    count = transport.pulls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(transport.pulls.length).toBe(count + 1);
  });

  it('AC-012: a household the user lost drops from the device, with its data', async () => {
    await startEnrico();
    const nadjaStorage = createMemoryStorage();
    const nadja = createEngine({
      transport: server.transport(NADJA),
      storage: nadjaStorage,
      userId: NADJA,
      environment: fakeEnvironment(),
    });
    passive.push(nadja);
    await nadja.start();
    await settle(nadja);
    expect(nadja.getState()?.households[H]).toBeDefined();
    expect(await nadjaStorage.get(`household:${H}`)).toBeDefined();

    await server.transport(ENRICO).removeMember(H, NADJA);
    await nadja.pull();
    expect(nadja.getState()?.households[H]).toBeUndefined();
    expect(await nadjaStorage.get(`household:${H}`)).toBeUndefined();
  });

  it('keeps unchanged objects identical after a pull that changed one recipe', async () => {
    const engine = await startEnrico();
    const before = getData();
    const recipe = before.recipes[1];
    if (!recipe) throw new Error('fixture');
    await server
      .transport(NADJA)
      .applyChanges(H, [
        { kind: 'patch', table: 'recipes', id: recipe.id, changes: { notes: 'neu' } },
      ]);
    await engine.pull();
    const after = getData();
    expect(after.recipes.find((candidate) => candidate.id === recipe.id)?.notes).toBe('neu');
    expect(after.areas).toBe(before.areas);
    expect(after.articles).toBe(before.articles);
    expect(after.recipes[0]).toBe(before.recipes[0]);
  });

  it('AC-003: resetting local data empties cache and store queue on this device', async () => {
    const engine = await startEnrico();
    engine.setSimulatedOffline(true);
    const item = getData().items.find((candidate) => !candidate.checked);
    if (!item) throw new Error('fixture');
    setItemChecked(item.id, true);
    expect(await storage.get('queue')).toHaveLength(1);

    await resetLocalData();
    expect(await storage.get('meta')).toBeUndefined();
    expect(await storage.get('queue')).toBeUndefined();
    expect(await storage.get(`household:${H}`)).toBeUndefined();
    expect(server.row(H, 'shopping_items', item.id)).toMatchObject({ checked: false });
  });

  it('AC-003: another user on the same device starts with an empty cache', async () => {
    const engine = await startEnrico();
    engine.setSimulatedOffline(true);
    const item = getData().items.find((candidate) => !candidate.checked);
    if (!item) throw new Error('fixture');
    setItemChecked(item.id, true);
    await stopBackend();

    const nadja = await startBackend({
      transport: server.transport(NADJA),
      storage,
      userId: NADJA,
      environment,
    });
    await settle(nadja);
    expect(server.row(H, 'shopping_items', item.id)).toMatchObject({ checked: false });
    expect(getState().currentMemberId).toBe(NADJA);
    expect(await storage.get('queue')).toEqual([]);
  });
});

describe('active household per device', () => {
  it('the household chosen with switchHousehold is shown again after a reload', async () => {
    const second = await server.transport(ENRICO).createHousehold('Zweiter Haushalt', {});
    await startEnrico();
    expect(getState().activeHouseholdId).toBe(H);
    switchHousehold(second);
    expect(getState().activeHouseholdId).toBe(second);
    await stopBackend();

    await startEnrico();
    expect(getState().activeHouseholdId).toBe(second);
  });

  it('a stored household the user is no longer a member of falls back to the first joined', async () => {
    const second = await server.transport(ENRICO).createHousehold('Zweiter Haushalt', {});
    await startEnrico();
    switchHousehold(second);
    await vi.waitFor(async () => expect(await storage.get('active')).toBe(second));
    await stopBackend();
    // Nadja joins, then Enrico leaves (the last member could not leave).
    const invitation = await server.transport(ENRICO).inviteMember(second, 'nadja@example.com');
    await server.transport(NADJA).acceptInvitation(invitation);
    await server.transport(ENRICO).removeMember(second, ENRICO);

    await startEnrico();
    expect(getState().activeHouseholdId).toBe(H);
  });

  it('AC-012: a lost household leaves no trace on the device, also not as the stored choice', async () => {
    const second = await server.transport(ENRICO).createHousehold('Zweiter Haushalt', {});
    const engine = await startEnrico();
    switchHousehold(second);
    await vi.waitFor(async () => expect(await storage.get('active')).toBe(second));
    const invitation = await server.transport(ENRICO).inviteMember(second, 'nadja@example.com');
    await server.transport(NADJA).acceptInvitation(invitation);
    await server.transport(ENRICO).removeMember(second, ENRICO);
    await engine.pull();
    await settle(engine);
    expect(getState().activeHouseholdId).toBe(H);
    expect(await storage.get('active')).toBeUndefined();
  });

  it('the stored choice belongs to the user: another user on the device does not inherit it', async () => {
    const second = await server.transport(ENRICO).createHousehold('Zweiter Haushalt', {});
    await startEnrico();
    switchHousehold(second);
    await vi.waitFor(async () => expect(await storage.get('active')).toBe(second));
    await stopBackend();

    await startBackend({ transport: server.transport(NADJA), storage, userId: NADJA, environment });
    expect(await storage.get('active')).toBeUndefined();
  });
});

describe('a new cache version (AC-018)', () => {
  /** A device with an older cache: a stale cache, a queued check, a store and a household chosen. */
  async function deviceWithOldCache(userId: string): Promise<string> {
    const itemId = server.rows(H, 'shopping_items').find((row) => row.checked !== true)?.id;
    if (typeof itemId !== 'string') throw new Error('fixture: no open item');
    await storage.setMany([
      ['meta', { version: CACHE_VERSION - 1, userId, householdIds: [H] }],
      [`household:${H}`, { stale: true }],
      ['queue', [{ kind: 'check', itemId, checked: true, seenCheckSeq: 0 }]],
      ['store-choices', { [H]: null }],
      ['active', H],
    ]);
    return itemId;
  }

  it('spec 0066: version 26 for ai_chats (spec 0060: 25 for recurring_items)', () => {
    expect(CACHE_VERSION).toBe(27);
  });

  it('spec 0012: a queued pack entry survives the version bump and is sent', async () => {
    const item = server.rows(H, 'packing_items').find((row) => row.packed !== true);
    if (!item) throw new Error('fixture: no open Packstück');
    const entry = { kind: 'pack', householdId: H, itemId: item.id, packed: true, seenPackSeq: 0 };
    await storage.setMany([
      ['meta', { version: 5, userId: ENRICO, householdIds: [H] }],
      ['queue', [entry]],
    ]);
    await startEnrico();
    expect(server.row(H, 'packing_items', item.id)).toMatchObject({ packed: true, pack_seq: 1 });
    expect(await storage.get('queue')).toEqual([]);
  });

  it('AC-024 (spec 0014): three checks waiting in the store queue are sent by an update with a new cache version', async () => {
    const enrico = await startEnrico();
    const open = getData()
      .items.filter((item) => !item.checked)
      .slice(0, 3);
    expect(open).toHaveLength(3);
    enrico.setSimulatedOffline(true);
    for (const item of open) setItemChecked(item.id, true);
    await settle(enrico);
    await stopBackend();

    // "Neu laden" or the next start: the new version brings a higher cache version.
    const updated = await startEnrico({ cacheVersion: CACHE_VERSION + 1 });
    const nadja = await startNadja();
    await settle(updated, nadja);
    for (const item of open) {
      expect(server.row(H, 'shopping_items', item.id)).toMatchObject({ checked: true });
      expect(getData().items.find((candidate) => candidate.id === item.id)?.checked).toBe(true);
      expect(nadjaData(nadja).items.find((candidate) => candidate.id === item.id)?.checked).toBe(
        true,
      );
    }
    expect(await storage.get('queue')).toEqual([]);
  });

  it('drops the cache, but keeps the store queue, the chosen store and the chosen household', async () => {
    const itemId = await deviceWithOldCache(ENRICO);
    environment.setOnline(false);
    const engine = await startBackend({
      transport: server.transport(ENRICO),
      storage,
      userId: ENRICO,
      environment,
    });
    await settle(engine);
    expect(await storage.get('meta')).toMatchObject({ version: CACHE_VERSION });
    expect(await storage.get(`household:${H}`)).not.toEqual({ stale: true });
    expect(await storage.get('queue')).toEqual([
      expect.objectContaining({ kind: 'check', itemId, checked: true }),
    ]);
    expect(await storage.get('store-choices')).toEqual({ [H]: null });
    expect(await storage.get('active')).toBe(H);

    environment.setOnline(true);
    await settle(engine);
    expect(await storage.get('queue')).toEqual([]);
    expect(server.row(H, 'shopping_items', itemId)).toMatchObject({ checked: true });
    expect(getData().items.find((item) => item.id === itemId)).toMatchObject({ checked: true });
    expect(getState().storeChoices?.[H]).toBeNull();
  });

  it('keeps nothing of another user across the version bump', async () => {
    await deviceWithOldCache(NADJA);
    await startEnrico();
    expect(await storage.get('queue')).toEqual([]);
    expect(await storage.get('store-choices')).toBeUndefined();
  });
});

describe('stored store queue (security check, spec 0006)', () => {
  it('drops stored entries that do not parse and tells the user, keeping the valid ones', async () => {
    const itemId = server.rows(H, 'shopping_items').find((row) => row.checked !== true)?.id;
    if (typeof itemId !== 'string') throw new Error('fixture: no open item');
    const valid = { kind: 'check', itemId, checked: true, seenCheckSeq: 0 };
    await storage.setMany([
      ['meta', { version: CACHE_VERSION, userId: ENRICO, householdIds: [] }],
      ['queue', [{ kind: 'check', itemId, checked: 'yes' }, valid, { kind: 'drop table' }]],
    ]);
    const messages: string[] = [];
    const off = onWriteRejected((message) => messages.push(message));
    environment.setOnline(false);
    try {
      const engine = await startBackend({
        transport: server.transport(ENRICO),
        storage,
        userId: ENRICO,
        environment,
      });
      await settle(engine);
      expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
      // Stored again as parsed: the older entry gains onList false (spec 0025).
      expect(await storage.get('queue')).toEqual([{ ...valid, onList: false }]);

      environment.setOnline(true);
      await settle(engine);
      expect(server.row(H, 'shopping_items', itemId)).toMatchObject({ checked: true });
    } finally {
      off();
    }
  });

  it('a valid stored queue is taken without a message', async () => {
    await storage.setMany([
      ['meta', { version: CACHE_VERSION, userId: ENRICO, householdIds: [] }],
      ['queue', []],
    ]);
    const messages: string[] = [];
    const off = onWriteRejected((message) => messages.push(message));
    try {
      await startEnrico();
      expect(messages).toEqual([]);
    } finally {
      off();
    }
  });
});

describe('writes after a reset (security check, spec 0006)', () => {
  it('remembering a household or a store after resetLocalData writes nothing', async () => {
    const engine = await startEnrico();
    await engine.resetLocalData();
    engine.rememberActiveHousehold(H);
    engine.rememberShoppingStore(H, 'store-dm');
    await vi.runAllTimersAsync();
    expect(await storage.get('meta')).toBeUndefined();
    expect(await storage.get('active')).toBeUndefined();
    expect(await storage.get('store-choices')).toBeUndefined();
  });
});

describe('store chosen on this device (spec 0006, REQ-007)', () => {
  const chosen = () => getState().storeChoices?.[getState().activeHouseholdId];

  it('AC-042: the chosen store is kept per household after a reload, and only on the device', async () => {
    const second = await server.transport(ENRICO).createHousehold('Zweiter Haushalt', {});
    await startEnrico();
    const callsBefore = server.calls.length;
    chooseShoppingStore('store-dm');
    expect(chosen()).toBe('store-dm');
    await vi.waitFor(async () =>
      expect(await storage.get('store-choices')).toEqual({ [H]: 'store-dm' }),
    );
    expect(server.calls.slice(callsBefore).filter((call) => call.fn !== 'sync_pull')).toEqual([]);
    await stopBackend();

    await startEnrico();
    expect(chosen()).toBe('store-dm');
    switchHousehold(second);
    expect(chosen()).toBeUndefined();
    chooseShoppingStore(null);
    expect(chosen()).toBeNull();
    switchHousehold(H);
    expect(chosen()).toBe('store-dm');
  });

  it('AC-042: the choice survives a new cache version', async () => {
    await startEnrico({ cacheVersion: CACHE_VERSION - 1 });
    chooseShoppingStore('store-dm');
    await vi.waitFor(async () => expect(await storage.get('store-choices')).toBeDefined());
    await stopBackend();
    await startEnrico();
    expect(chosen()).toBe('store-dm');
  });

  it('sign-out and another user remove the choice', async () => {
    await startEnrico();
    chooseShoppingStore('store-dm');
    await vi.waitFor(async () => expect(await storage.get('store-choices')).toBeDefined());
    await stopBackend();
    await startBackend({ transport: server.transport(NADJA), storage, userId: NADJA, environment });
    expect(getState().storeChoices?.[H]).toBeUndefined();
    expect(await storage.get('store-choices')).toBeUndefined();
    await stopBackend();

    await startEnrico();
    chooseShoppingStore('store-dm');
    await vi.waitFor(async () => expect(await storage.get('store-choices')).toBeDefined());
    await resetLocalData();
    expect(await storage.get('store-choices')).toBeUndefined();
  });

  it('a household the user lost takes its choice with it', async () => {
    const second = await server.transport(ENRICO).createHousehold('Zweiter Haushalt', {});
    const engine = await startEnrico();
    switchHousehold(second);
    chooseShoppingStore(null);
    switchHousehold(H);
    chooseShoppingStore('store-dm');
    await vi.waitFor(async () =>
      expect(await storage.get('store-choices')).toEqual({ [second]: null, [H]: 'store-dm' }),
    );
    const invitation = await server.transport(ENRICO).inviteMember(second, 'nadja@example.com');
    await server.transport(NADJA).acceptInvitation(invitation);
    await server.transport(ENRICO).removeMember(second, ENRICO);
    await engine.pull();
    await settle(engine);
    expect(getState().storeChoices).toEqual({ [H]: 'store-dm' });
    expect(await storage.get('store-choices')).toEqual({ [H]: 'store-dm' });
  });
});

describe('account check', () => {
  it('a pull without the own profile reports the account as missing', async () => {
    const missing = vi.fn();
    const engine = await startBackend({
      transport: server.transport('ghost'),
      storage,
      userId: 'ghost',
      environment,
      onAccountMissing: missing,
    });
    await settle(engine);
    expect(missing).toHaveBeenCalled();
  });

  it('a pull with the own profile reports nothing', async () => {
    const missing = vi.fn();
    const engine = await startBackend({
      transport: server.transport(ENRICO),
      storage,
      userId: ENRICO,
      environment,
      onAccountMissing: missing,
    });
    await settle(engine);
    expect(missing).not.toHaveBeenCalled();
  });
});

describe('writes: changesets (ADR-0011)', () => {
  it('sends a rename as one patch and keeps it after the pull', async () => {
    await startEnrico();
    const recipe = getData().recipes[0];
    if (!recipe) throw new Error('fixture');
    updateRecipe(recipe.id, { title: 'Neuer Name' });
    expect(getData().recipes[0]?.title).toBe('Neuer Name');
    await settle();
    expect(server.row(H, 'recipes', recipe.id)).toMatchObject({ title: 'Neuer Name' });
    expect(getData().recipes[0]?.title).toBe('Neuer Name');
  });

  it('AC-019: a rejected rename jumps back and says so', async () => {
    await startEnrico();
    const messages: string[] = [];
    const stopListening = onWriteRejected((message) => messages.push(message));
    const recipe = getData().recipes[0];
    if (!recipe) throw new Error('fixture');
    server.failNext('apply_changes', new TransportError('permanent', 'row_not_found', 404));

    updateRecipe(recipe.id, { title: 'Abgelehnt' });
    expect(getData().recipes[0]?.title).toBe('Abgelehnt');
    await settle();
    expect(getData().recipes[0]?.title).toBe(recipe.title);
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    expect(WRITE_REJECTED_MESSAGE).toBe('Hat nicht geklappt – bitte noch einmal versuchen');
    stopListening();
  });

  it('AC-019: a later change built on a rejected one is dropped with it', async () => {
    await startEnrico();
    const recipe = getData().recipes[0];
    if (!recipe) throw new Error('fixture');
    server.failNext('apply_changes', new TransportError('permanent', 'invalid_change', 400));
    updateRecipe(recipe.id, { title: 'Eins' });
    updateRecipe(recipe.id, { servings: 7 });
    await settle();
    expect(getData().recipes[0]).toMatchObject({ title: recipe.title, servings: recipe.servings });
    expect(server.row(H, 'recipes', recipe.id)).toMatchObject({ servings: recipe.servings });
  });

  it('AC-020: ten items in one changeset: a server error leaves none of them', async () => {
    await startEnrico();
    const articles = getData()
      .articles.filter((article) => !getData().items.some((item) => item.articleId === article.id))
      .slice(0, 10);
    server.failNext('apply_changes', new TransportError('permanent', '23503', 409));
    commit({ path: 'diff' }, () =>
      updateData((data) => ({
        ...data,
        items: [
          ...data.items,
          ...articles.map((article, index) => ({
            id: `new-item-${index}`,
            articleId: article.id,
            contributions: [
              { id: `new-contribution-${index}`, source: { kind: 'manual' as const } },
            ],
            checked: false,
            createdAt: new Date().toISOString(),
          })),
        ],
      })),
    );
    expect(getData().items.filter((item) => item.id.startsWith('new-item'))).toHaveLength(10);
    await settle();
    expect(getData().items.filter((item) => item.id.startsWith('new-item'))).toHaveLength(0);
    expect(
      server.rows(H, 'shopping_items').filter((item) => item.id.startsWith('new-item')),
    ).toEqual([]);
  });

  it('refuses a diff that writes a column outside the allowlist or deletes undeclared', async () => {
    await startEnrico();
    const item = getData().items[0];
    const entry = getData().planEntries[0];
    if (!item || !entry) throw new Error('fixture');
    expect(() =>
      commit({ path: 'diff' }, () =>
        updateData((data) => ({
          ...data,
          items: data.items.map((candidate) =>
            candidate.id === item.id ? { ...candidate, checked: !candidate.checked } : candidate,
          ),
        })),
      ),
    ).toThrow(/may not be written/);
    expect(() => commit({ path: 'diff' }, () => removePlanEntry(entry.id))).toThrow(/deletes/);
    expect(getData().planEntries[0]).toBe(entry);
  });

  it('an unknown outcome (answer lost) is settled by the pull, no hint when it arrived', async () => {
    await startEnrico();
    const messages: string[] = [];
    const stopListening = onWriteRejected((message) => messages.push(message));
    const recipe = getData().recipes[0];
    if (!recipe) throw new Error('fixture');
    server.failNext('apply_changes', new TransportError('transient', 'http_503', 503), {
      afterApply: true,
    });
    updateRecipe(recipe.id, { title: 'Angekommen' });
    await settle();
    expect(getData().recipes[0]?.title).toBe('Angekommen');
    expect(messages).toEqual([]);

    server.failNext('apply_changes', new TransportError('transient', 'http_503', 503));
    updateRecipe(recipe.id, { title: 'Verloren' });
    await settle();
    expect(getData().recipes[0]?.title).toBe('Angekommen');
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stopListening();
  });

  it('commitConfirmed resolves once the server applied the change, also when the answer got lost', async () => {
    await startEnrico();
    const recipe = getData().recipes[0];
    if (!recipe) throw new Error('fixture');
    const rename = (title: string) =>
      commitConfirmed({ path: 'diff' }, () => {
        updateData((data) => ({
          ...data,
          recipes: data.recipes.map((candidate) =>
            candidate.id === recipe.id ? { ...candidate, title } : candidate,
          ),
        }));
        return title;
      }).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );

    const confirmed = rename('Bestätigt');
    await settle();
    expect(await confirmed).toEqual({ value: 'Bestätigt' });

    server.failNext('apply_changes', new TransportError('transient', 'http_503', 503), {
      afterApply: true,
    });
    const arrived = rename('Angekommen');
    await settle();
    expect(await arrived).toEqual({ value: 'Angekommen' });

    server.failNext('apply_changes', new TransportError('transient', 'http_503', 503));
    const lost = rename('Verloren');
    await settle();
    expect(await lost).toEqual({ error: expect.any(TransportError) });

    server.failNext('apply_changes', new TransportError('permanent', 'row_not_found', 404));
    const refused = rename('Abgelehnt');
    await settle();
    expect(await refused).toEqual({ error: expect.objectContaining({ code: 'row_not_found' }) });
    expect(getData().recipes[0]?.title).toBe('Angekommen');

    expect(await rename('Angekommen')).toEqual({ value: 'Angekommen' });
  });

  it('undo sends the inverse of the own change (snapshot)', async () => {
    await startEnrico();
    const recipe = getData().recipes[0];
    if (!recipe) throw new Error('fixture');
    const restore = snapshot();
    updateRecipe(recipe.id, { title: 'Kurz anders' });
    // A Reisetasche: recipes, restaurants and activities are deleted only by their RPC (spec 0008,
    // E2; spec 0024).
    const created = createPackingBag({ name: 'Wieder weg' });
    await settle();
    restore();
    expect(getData().recipes[0]?.title).toBe(recipe.title);
    await settle();
    expect(server.row(H, 'recipes', recipe.id)).toMatchObject({ title: recipe.title });
    expect(server.row(H, 'packing_bags', created)).toBeUndefined();
    expect(getData().packingBags.some((candidate) => candidate.id === created)).toBe(false);
  });

  it('rpc path: the local effect shows at once and the inverse RPC undoes it', async () => {
    await startEnrico();
    const recipe = getData().recipes.find((candidate) => !candidate.favoriteOf.includes(ENRICO));
    if (!recipe) throw new Error('fixture');
    const toggle = (favorite: boolean) =>
      commit(
        {
          path: 'rpc',
          send: (transport) => transport.setRecipeFavorite(recipe.id, favorite),
          inverse: (transport) => transport.setRecipeFavorite(recipe.id, !favorite),
        },
        () =>
          updateData((data) => ({
            ...data,
            recipes: data.recipes.map((candidate) =>
              candidate.id === recipe.id
                ? { ...candidate, favoriteOf: [...candidate.favoriteOf, ENRICO] }
                : candidate,
            ),
          })),
      );
    const restore = snapshot();
    toggle(true);
    const shown = () => getData().recipes.find((candidate) => candidate.id === recipe.id);
    expect(shown()?.favoriteOf).toContain(ENRICO);
    await settle();
    expect(server.row(H, 'recipe_favorites', `${recipe.id}:${ENRICO}`)).toBeDefined();
    restore();
    await settle();
    expect(server.row(H, 'recipe_favorites', `${recipe.id}:${ENRICO}`)).toBeUndefined();
    expect(shown()?.favoriteOf).not.toContain(ENRICO);
  });

  it('a diff touching a per-member table must use its own RPC', async () => {
    await startEnrico();
    expect(() =>
      commit({ path: 'diff' }, () =>
        updateData((data) => ({
          ...data,
          recipes: data.recipes.map((recipe, index) =>
            index === 0 ? { ...recipe, favoriteOf: [...recipe.favoriteOf, 'x'] } : recipe,
          ),
        })),
      ),
    ).toThrow(/own RPC/);
  });

  it('a write outside commit() is a programming error', async () => {
    await startEnrico();
    expect(() => updateData((data) => ({ ...data, trips: [] }))).toThrow(/commit/);
  });
});

describe('writes: store queue (ADR-0008 addendum)', () => {
  it('AC-021: checked offline, it reaches the other device once online', async () => {
    const enrico = await startEnrico();
    const nadja = await startNadja();
    const milk = itemByArticle(getData().items, 'Milch');
    if (!milk) throw new Error('fixture');

    enrico.setSimulatedOffline(true);
    setItemChecked(milk.id, true);
    expect(itemByArticle(getData().items, 'Milch')).toMatchObject({
      checked: true,
      pendingSync: true,
    });
    await settle(enrico);
    expect(server.row(H, 'shopping_items', milk.id)).toMatchObject({ checked: false });

    enrico.setSimulatedOffline(false);
    await settle(enrico, nadja);
    expect(server.row(H, 'shopping_items', milk.id)).toMatchObject({ checked: true });
    expect(itemByArticle(getData().items, 'Milch')?.pendingSync).toBeUndefined();
    expect(nadjaData(nadja).items.find((item) => item.id === milk.id)?.checked).toBe(true);
  });

  it('AC-022: an offline uncheck loses against a re-check by someone else', async () => {
    const enrico = await startEnrico();
    const butter = itemByArticle(
      getData().items.filter((item) => item.checked),
      // "Butter" is also open on the list (lasagne); unchecking would merge it into that item.
      'Brot',
    );
    if (!butter) throw new Error('fixture');
    const shownButter = () => getData().items.find((item) => item.id === butter.id);

    enrico.setSimulatedOffline(true);
    setItemChecked(butter.id, false);
    expect(shownButter()?.checked).toBe(false);

    const nadja = server.transport(NADJA);
    await nadja.setItemChecked(butter.id, false, 0);
    await nadja.setItemChecked(butter.id, true, 1);

    enrico.setSimulatedOffline(false);
    await settle(enrico);
    expect(server.row(H, 'shopping_items', butter.id)).toMatchObject({ checked: true });
    expect(shownButter()?.checked).toBe(true);
  });

  it('AC-023: added offline and online by two people, the item is there once with both', async () => {
    const enrico = await startEnrico();
    const name = 'Zucker';
    expect(itemByArticle(getData().items, name)).toBeUndefined();
    const add = (prefix: string): StoreAction => ({
      kind: 'add',
      householdId: H,
      clientItemId: `${prefix}-item`,
      clientArticleId: `${prefix}-article`,
      contributions: [
        {
          clientContributionId: `${prefix}-contribution`,
          articleName: name,
          nameKey: normalizeText(name),
          count: 1,
        },
      ],
    });

    enrico.setSimulatedOffline(true);
    queueStoreAction(add('enrico'));
    expect(itemByArticle(getData().items, name)?.contributions).toHaveLength(1);

    await server.transport(NADJA).addShoppingContributions(H, [
      {
        client_item_id: 'nadja-item',
        client_article_id: 'nadja-article',
        article_name: name,
        name_key: normalizeText(name),
        contributions: [
          {
            id: 'nadja-contribution',
            source: { kind: 'manual' },
            count: 1,
            qty: null,
            unit: null,
            note: null,
          },
        ],
      },
    ]);
    enrico.setSimulatedOffline(false);
    await settle(enrico);

    const zucker = getData().items.filter(
      (item) => getData().articles.find((article) => article.id === item.articleId)?.name === name,
    );
    expect(zucker).toHaveLength(1);
    expect(zucker[0]?.contributions.map((c) => c.id).sort()).toEqual([
      'enrico-contribution',
      'nadja-contribution',
    ]);
    expect(
      server.rows(H, 'shopping_items').filter((item) => item.article_id === zucker[0]?.articleId),
    ).toHaveLength(1);
  });

  it('AC-024: three offline checks survive a reload and are sent once online', async () => {
    const enrico = await startEnrico();
    const open = getData()
      .items.filter((item) => !item.checked)
      .slice(0, 3);
    enrico.setSimulatedOffline(true);
    for (const item of open) setItemChecked(item.id, true);
    await stopBackend();

    environment.setOnline(false);
    const reloaded = await startEnrico();
    for (const item of open) {
      expect(getData().items.find((candidate) => candidate.id === item.id)?.checked).toBe(true);
      expect(server.row(H, 'shopping_items', item.id)).toMatchObject({ checked: false });
    }
    environment.setOnline(true);
    await settle(reloaded);
    for (const item of open) {
      expect(server.row(H, 'shopping_items', item.id)).toMatchObject({ checked: true });
    }
    expect(await storage.get('queue')).toEqual([]);
  });

  it('AC-025: an item deleted meanwhile disappears without an error', async () => {
    const enrico = await startEnrico();
    const messages: string[] = [];
    const stopListening = onWriteRejected((message) => messages.push(message));
    const eggs = getData().items.find((item) => !item.checked);
    if (!eggs) throw new Error('fixture');
    enrico.setSimulatedOffline(true);
    setItemChecked(eggs.id, true);
    await server
      .transport(NADJA)
      .applyChanges(H, [{ kind: 'delete', table: 'shopping_items', id: eggs.id }]);

    enrico.setSimulatedOffline(false);
    await settle(enrico);
    expect(getData().items.some((item) => item.id === eggs.id)).toBe(false);
    expect(messages).toEqual([]);
    expect(await storage.get('queue')).toEqual([]);
    stopListening();
  });

  it('checking back and forth offline sends nothing', async () => {
    const enrico = await startEnrico();
    const item = getData().items.find((candidate) => !candidate.checked);
    if (!item) throw new Error('fixture');
    enrico.setSimulatedOffline(true);
    setItemChecked(item.id, true);
    setItemChecked(item.id, false);
    expect(await storage.get('queue')).toEqual([]);
  });

  it('keeps an entry after a transient failure and retries it later', async () => {
    const enrico = await startEnrico();
    const item = getData().items.find((candidate) => !candidate.checked);
    if (!item) throw new Error('fixture');
    server.failNext('set_shopping_item_checked', new TransportError('transient', 'http_503', 503));
    setItemChecked(item.id, true);
    await vi.advanceTimersByTimeAsync(0);
    await enrico.whenIdle();
    expect(await storage.get('queue')).toHaveLength(1);
    await settle(enrico);
    expect(server.row(H, 'shopping_items', item.id)).toMatchObject({ checked: true });
    expect(await storage.get('queue')).toEqual([]);
  });

  it('security check 0012: a 503 while a check is in flight, unchecked meanwhile: nothing resent', async () => {
    const inner = server.transport(ENRICO);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transport: Transport = {
      ...inner,
      setItemChecked: async (itemId, checked, seenCheckSeq) => {
        await gate;
        return inner.setItemChecked(itemId, checked, seenCheckSeq);
      },
    };
    const enrico = await startEnrico({ transport });
    const item = getData().items.find((candidate) => !candidate.checked);
    if (!item) throw new Error('fixture');
    server.calls.length = 0;
    server.failNext('set_shopping_item_checked', new TransportError('transient', 'http_503', 503));
    setItemChecked(item.id, true);
    await vi.advanceTimersByTimeAsync(0);
    setItemChecked(item.id, false);
    release();
    await settle(enrico);
    expect(server.calls.filter((call) => call.fn === 'set_shopping_item_checked')).toHaveLength(1);
    expect(server.row(H, 'shopping_items', item.id)).toMatchObject({ checked: false });
    expect(getData().items.find((candidate) => candidate.id === item.id)?.checked).toBe(false);
    expect(await storage.get('queue')).toEqual([]);
  });

  it('store actions run offline; a later uncheck of an own check is sent with the new seq', async () => {
    const enrico = await startEnrico();
    const item = getData().items.find((candidate) => !candidate.checked);
    if (!item) throw new Error('fixture');
    setItemChecked(item.id, true);
    setItemChecked(item.id, false);
    await settle(enrico);
    expect(server.row(H, 'shopping_items', item.id)).toMatchObject({ checked: false });
  });
});

describe('spec 0012: packing in the store queue (ADR-0013)', () => {
  const packingItem = (predicate: (item: { packed: boolean }) => boolean, skip = 0) => {
    const item = getData().packingItems.filter(predicate)[skip];
    if (!item) throw new Error('fixture: Packstück missing');
    return item;
  };
  const pack = (itemId: string, packed = true): StoreAction => ({
    kind: 'pack',
    householdId: H,
    itemId,
    packed,
  });
  const writes = () =>
    server.calls.filter((call) => call.fn !== 'sync_pull').map((call) => call.fn);

  it('AC-026: a run of pack entries goes as one call; a check in between splits it', async () => {
    const enrico = await startEnrico();
    const open = getData().packingItems.filter((item) => !item.packed);
    const milk = itemByArticle(getData().items, 'Milch');
    if (open.length < 7 || !milk) throw new Error('fixture');
    server.calls.length = 0;
    enrico.setSimulatedOffline(true);
    for (const item of open.slice(0, 3)) queueStoreAction(pack(item.id));
    setItemChecked(milk.id, true);
    for (const item of open.slice(3, 7)) queueStoreAction(pack(item.id));
    expect(getData().packingItems.filter((item) => item.packed).length).toBe(
      getData().packingItems.length - open.length + 7,
    );
    await settle(enrico);
    expect(writes()).toEqual([]);

    enrico.setSimulatedOffline(false);
    await settle(enrico);
    expect(writes()).toEqual([
      'set_packing_items_packed',
      'set_shopping_item_checked',
      'set_packing_items_packed',
    ]);
    for (const item of open.slice(0, 7)) {
      expect(server.row(H, 'packing_items', item.id)).toMatchObject({
        packed: true,
        packed_by: ENRICO,
        pack_seq: item.packSeq + 1,
      });
    }
    expect(await storage.get('queue')).toEqual([]);
  });

  it('a transient failure keeps all seven entries and sends them again later', async () => {
    const enrico = await startEnrico();
    const open = getData()
      .packingItems.filter((item) => !item.packed)
      .slice(0, 7);
    server.failNext('set_packing_items_packed', new TransportError('transient', 'http_503', 503));
    for (const item of open) queueStoreAction(pack(item.id));
    await vi.advanceTimersByTimeAsync(0);
    expect(server.calls.filter((call) => call.fn === 'set_packing_items_packed')).toHaveLength(1);
    await enrico.whenIdle();
    expect(await storage.get('queue')).toHaveLength(7);
    for (const item of open) {
      expect(getData().packingItems.find((shown) => shown.id === item.id)?.packed).toBe(true);
    }
    await settle(enrico);
    for (const item of open) {
      expect(server.row(H, 'packing_items', item.id)).toMatchObject({ packed: true });
    }
    expect(await storage.get('queue')).toEqual([]);
  });

  it('a permanent refusal (not_member) drops the run and logs only the code', async () => {
    const enrico = await startEnrico();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const item = packingItem((candidate) => !candidate.packed);
    server.failNext('set_packing_items_packed', new TransportError('permanent', 'not_member', 403));
    queueStoreAction(pack(item.id));
    await settle(enrico);
    expect(warn).toHaveBeenCalledWith('Store action dropped: not_member');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(item.id);
    expect(server.row(H, 'packing_items', item.id)).toMatchObject({ packed: false });
    expect(getData().packingItems.find((candidate) => candidate.id === item.id)?.packed).toBe(
      false,
    );
    expect(await storage.get('queue')).toEqual([]);
    warn.mockRestore();
  });

  it('AC-024 / AC-040: packed offline, the trip deleted meanwhile: gone, no hint', async () => {
    const enrico = await startEnrico();
    const messages: string[] = [];
    const stopListening = onWriteRejected((message) => messages.push(message));
    const item = packingItem((candidate) => !candidate.packed);
    const listBag = getData().packingListBags.find((bag) => bag.id === item.listBagId);
    if (!listBag) throw new Error('fixture');
    enrico.setSimulatedOffline(true);
    queueStoreAction(pack(item.id));
    await server
      .transport(NADJA)
      .applyChanges(H, [{ kind: 'delete', table: 'trips', id: listBag.tripId }]);

    enrico.setSimulatedOffline(false);
    await settle(enrico);
    expect(writes()).toContain('set_packing_items_packed');
    expect(getData().packingItems.some((candidate) => candidate.id === item.id)).toBe(false);
    expect(getData().trips.some((trip) => trip.id === listBag.tripId)).toBe(false);
    expect(messages).toEqual([]);
    expect(await storage.get('queue')).toEqual([]);
    stopListening();
  });

  it('AC-023: an offline unpack loses against packing again by someone else', async () => {
    const enrico = await startEnrico();
    const item = packingItem((candidate) => candidate.packed);
    const shown = () => getData().packingItems.find((candidate) => candidate.id === item.id);
    enrico.setSimulatedOffline(true);
    queueStoreAction(pack(item.id, false));
    expect(shown()?.packed).toBe(false);

    const nadja = server.transport(NADJA);
    await nadja.setPackingItemsPacked(H, [
      { item_id: item.id, packed: false, seen_pack_seq: item.packSeq },
    ]);
    await nadja.setPackingItemsPacked(H, [
      { item_id: item.id, packed: true, seen_pack_seq: item.packSeq + 1 },
    ]);

    enrico.setSimulatedOffline(false);
    await settle(enrico);
    expect(server.row(H, 'packing_items', item.id)).toMatchObject({
      packed: true,
      packed_by: NADJA,
      pack_seq: item.packSeq + 2,
    });
    expect(shown()?.packed).toBe(true);
  });

  it('packing back and forth before sending sends nothing', async () => {
    const enrico = await startEnrico();
    const item = packingItem((candidate) => !candidate.packed);
    server.calls.length = 0;
    enrico.setSimulatedOffline(true);
    queueStoreAction(pack(item.id));
    queueStoreAction(pack(item.id, false));
    expect(await storage.get('queue')).toEqual([]);
    enrico.setSimulatedOffline(false);
    await settle(enrico);
    expect(writes()).toEqual([]);
  });

  it('AC-026: an unpack queued while the run is in flight is kept and sent with the new counter', async () => {
    const inner = server.transport(ENRICO);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transport: Transport = {
      ...inner,
      setPackingItemsPacked: async (householdId, changes) => {
        await gate;
        return inner.setPackingItemsPacked(householdId, changes);
      },
    };
    const enrico = await startEnrico({ transport });
    const open = getData()
      .packingItems.filter((item) => !item.packed)
      .slice(0, 2);
    for (const item of open) queueStoreAction(pack(item.id));
    await vi.advanceTimersByTimeAsync(0);
    // "Rückgängig" while the run is on its way: the counter entries must not cancel against it.
    for (const item of open) queueStoreAction(pack(item.id, false));
    expect(await storage.get('queue')).toHaveLength(4);
    release();
    await settle(enrico);
    for (const item of open) {
      expect(server.row(H, 'packing_items', item.id)).toMatchObject({
        packed: false,
        pack_seq: item.packSeq + 2,
      });
    }
    expect(getData().packingItems.filter((item) => open.some((o) => o.id === item.id))).toEqual(
      open.map((item) => expect.objectContaining({ packed: false })),
    );
  });

  it('security check 0012: a 503 during a run, a toggle meanwhile, the retry loses nothing', async () => {
    const inner = server.transport(ENRICO);
    const sentChanges: string[][] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transport: Transport = {
      ...inner,
      setPackingItemsPacked: async (householdId, changes) => {
        sentChanges.push(changes.map((change) => change.item_id));
        await gate;
        return inner.setPackingItemsPacked(householdId, changes);
      },
    };
    const enrico = await startEnrico({ transport });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const open = getData().packingItems.filter((item) => !item.packed);
    const [toggled] = open;
    if (open.length < 3 || !toggled) throw new Error('fixture');
    server.failNext('set_packing_items_packed', new TransportError('transient', 'http_503', 503));
    for (const item of open) queueStoreAction(pack(item.id));
    await vi.advanceTimersByTimeAsync(0);
    // Unpacked again while the run is on its way; then the run fails transiently.
    queueStoreAction(pack(toggled.id, false));
    release();
    await settle(enrico);

    for (const ids of sentChanges) expect(new Set(ids).size).toBe(ids.length);
    expect(warn).not.toHaveBeenCalled();
    expect(server.row(H, 'packing_items', toggled.id)).toMatchObject({
      packed: false,
      pack_seq: toggled.packSeq,
    });
    for (const item of open.slice(1)) {
      expect(server.row(H, 'packing_items', item.id)).toMatchObject({ packed: true });
    }
    expect(getData().packingItems.find((item) => item.id === toggled.id)?.packed).toBe(false);
    expect(await storage.get('queue')).toEqual([]);
    warn.mockRestore();
  });

  it('a pack entry of another household ends the run (one call per household)', async () => {
    const enrico = await startEnrico();
    const item = packingItem((candidate) => !candidate.packed);
    server.calls.length = 0;
    enrico.setSimulatedOffline(true);
    queueStoreAction(pack(item.id));
    queueStoreAction({ kind: 'pack', householdId: 'hh-test', itemId: 'pi-foreign', packed: true });
    enrico.setSimulatedOffline(false);
    await settle(enrico);
    expect(writes()).toEqual(['set_packing_items_packed', 'set_packing_items_packed']);
    expect(server.row(H, 'packing_items', item.id)).toMatchObject({ packed: true });
  });
});
