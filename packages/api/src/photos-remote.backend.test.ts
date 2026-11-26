// Own photos (spec 0004, REQ-004): upload to the household's folder, then the path
// on the diff path, then the old file goes; nothing is left behind when a step fails. Photos once
// loaded are kept in the device storage (bound to the user) and shown offline.
import { describe, expect, it, vi } from 'vitest';

import { resetLocalData, startBackend, type Engine } from './backend';
import { H, withBackend } from './backend-test-helpers';
import { switchHousehold } from './commands-household';
import { evictMedia } from './media-cache';
import {
  loadPhoto,
  PHOTO_HOUSEHOLD_CHANGED_MESSAGE,
  PHOTO_UNUSABLE_MESSAGE,
  photoView,
  removeActivityPhoto,
  removeRecipePhoto,
  setActivityPhoto,
  setRecipePhoto,
  showPhoto,
  subscribePhotos,
} from './photos-remote';
import { ENRICO, NADJA } from './seed/demo';
import { getData, getState, OfflineError } from './store';
import { TransportError, type ChangeOp, type Transport } from './transport';

const fx = withBackend();

/** Starts like a JPEG (SOI and the next marker), then filler: enough for the device's check. */
const photo = (fill = 1, size = 2048) =>
  new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), new Uint8Array(size).fill(fill)], {
    type: 'image/jpeg',
  });

/** Nadja stores a photo for a row from her device; Enrico's device learns the path by pulling. */
async function photoByNadja(table: 'activities' | 'recipes', id: string): Promise<string> {
  const wire = fx.server.transport(NADJA);
  const path = `${H}/${table}/${id}/${crypto.randomUUID()}.jpg`;
  await wire.uploadMedia(path, photo(9));
  await wire.applyChanges(H, [{ kind: 'patch', table, id, changes: { photo_path: path } }]);
  await fx.settle();
  return path;
}

/**
 * Enrico's device on a wire whose uploads and downloads wait while `hold()` is on: the photo is
 * on its way while the test changes something. Records the paths uploaded and the signals the
 * downloads got.
 */
async function startHeld(): Promise<{
  engine: Engine;
  uploaded: string[];
  signals: (AbortSignal | undefined)[];
  hold(): void;
  release(): void;
}> {
  const inner = fx.server.transport(ENRICO);
  let held: { promise: Promise<void>; release: () => void } | undefined;
  const uploaded: string[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  const transport: Transport = {
    ...inner,
    uploadMedia: async (path, blob) => {
      uploaded.push(path);
      await held?.promise;
      return inner.uploadMedia(path, blob);
    },
    downloadMedia: async (path, signal) => {
      signals.push(signal);
      await held?.promise;
      return inner.downloadMedia(path, signal);
    },
  };
  const engine = await startBackend({
    transport,
    storage: fx.storage,
    userId: ENRICO,
    environment: fx.environment,
  });
  await fx.settle(engine);
  return {
    engine,
    uploaded,
    signals,
    hold() {
      let release = () => {};
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      held = { promise, release };
    },
    release() {
      held?.release();
      held = undefined;
    },
  };
}

/** The promise's outcome without leaving a rejection unhandled while timers run. */
const outcome = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error }),
  );

const activity = (id: string) => getData().activities.find((candidate) => candidate.id === id);
const recipe = (id: string) => getData().recipes.find((candidate) => candidate.id === id);
const PATH = (folder: string, id: string) =>
  new RegExp(`^${H}/${folder}/${id}/[0-9a-f-]{36}\\.jpg$`);

async function setPhoto(id: string, blob = photo()): Promise<string> {
  const done = outcome(setActivityPhoto(id, blob));
  await fx.settle();
  const { error } = await done;
  if (error) throw error;
  const path = activity(id)?.photoPath;
  if (!path) throw new Error('no photo path');
  return path;
}

describe('setting a photo', () => {
  it('AC-009: uploads into the household folder, then sets the path; Nadja sees and loads it', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const blob = photo(7);
    const path = await setPhoto('act-eislaufen', blob);
    expect(path).toMatch(PATH('activities', 'act-eislaufen'));
    expect(fx.calls.map((call) => call.fn)).toEqual(['uploadMedia', 'applyChanges']);
    expect(fx.calls[0]?.args).toEqual([path, blob]);
    expect(fx.calls[1]?.args[1]).toEqual([
      { kind: 'patch', table: 'activities', id: 'act-eislaufen', changes: { photo_path: path } },
    ]);
    expect(fx.server.media(path)?.size).toBe(blob.size);

    await fx.settle(nadja);
    const seen = fx.nadjaData(nadja).activities.find((a) => a.id === 'act-eislaufen');
    expect(seen?.photoPath).toBe(path);
    const loaded = await fx.server.transport(NADJA).downloadMedia(path);
    expect(new Uint8Array(await loaded.arrayBuffer())).toEqual(
      new Uint8Array(await blob.arrayBuffer()),
    );
  });

  it('a new photo replaces the old one: the old file is deleted after the switch', async () => {
    await fx.startEnrico();
    const first = await setPhoto('act-eislaufen', photo(1));
    fx.clearCalls();
    const second = await setPhoto('act-eislaufen', photo(2));
    expect(second).not.toBe(first);
    expect(fx.calls.map((call) => call.fn)).toEqual(['uploadMedia', 'applyChanges', 'removeMedia']);
    expect(fx.calls[2]?.args).toEqual([[first]]);
    expect(fx.server.media(first)).toBeUndefined();
    expect(fx.server.media(second)).toBeDefined();
    expect(await fx.storage.get(`media:${first}`)).toBeUndefined();
  });

  it('a refused path leaves no file behind and keeps the old photo', async () => {
    await fx.startEnrico();
    const old = await setPhoto('act-eislaufen');
    fx.clearCalls();
    fx.server.failNext('apply_changes', new TransportError('permanent', '23514', 400));
    const { error } = await (async () => {
      const done = outcome(setActivityPhoto('act-eislaufen', photo(3)));
      await fx.settle();
      return done;
    })();
    expect(error).toBeInstanceOf(Error);
    expect(fx.calls.map((call) => call.fn)).toEqual(['uploadMedia', 'applyChanges', 'removeMedia']);
    const uploaded = String(fx.calls[0]?.args[0]);
    expect(fx.calls[2]?.args).toEqual([[uploaded]]);
    expect(fx.server.media(uploaded)).toBeUndefined();
    expect(fx.server.media(old)).toBeDefined();
    expect(activity('act-eislaufen')?.photoPath).toBe(old);
    expect(await fx.storage.get(`media:${uploaded}`)).toBeUndefined();
  });

  it('a file the storage refuses (413) is reported in German and nothing is written', async () => {
    await fx.startEnrico();
    fx.server.failNext('storage_upload', new TransportError('permanent', 'too_large', 413));
    const done = outcome(setActivityPhoto('act-eislaufen', photo()));
    await fx.settle();
    const { error } = await done;
    expect(error).toMatchObject({ message: PHOTO_UNUSABLE_MESSAGE });
    expect(fx.calls.map((call) => call.fn)).toEqual(['uploadMedia']);
    expect(activity('act-eislaufen')?.photoPath).toBeUndefined();
  });

  it('AC-011: offline nothing is uploaded', async () => {
    await fx.startEnrico();
    fx.environment.setOnline(false);
    await expect(setActivityPhoto('act-eislaufen', photo())).rejects.toBeInstanceOf(OfflineError);
    await expect(removeActivityPhoto('act-eislaufen')).rejects.toBeInstanceOf(OfflineError);
    expect(fx.calls).toEqual([]);
  });

  it('refuses an unknown activity or recipe before uploading', async () => {
    await fx.startEnrico();
    await expect(setActivityPhoto('act-weg', photo())).rejects.toThrow('Aktivität nicht gefunden');
    await expect(setRecipePhoto('rec-weg', photo())).rejects.toThrow('Rezept nicht gefunden');
    expect(fx.calls).toEqual([]);
  });
});

// The upload takes a while; the person can switch the household or another device can change the
// row meanwhile. The photo must land where it was chosen or not at all (security check 0004).
describe('while a photo uploads', () => {
  it('a switch to another household: the new file is removed, the old photo stays, in German', async () => {
    const device = await startHeld();
    const old = await photoByNadja('activities', 'act-eislaufen');
    const other = await fx.server.transport(ENRICO).createHousehold('WG Köln', null);
    await device.engine.pull();
    device.hold();
    const done = outcome(setActivityPhoto('act-eislaufen', photo(2)));
    await fx.settle();
    switchHousehold(other);
    expect(getState().activeHouseholdId).toBe(other);
    device.release();
    await fx.settle(device.engine);

    expect((await done).error).toMatchObject({ message: PHOTO_HOUSEHOLD_CHANGED_MESSAGE });
    const [uploaded] = device.uploaded;
    expect(uploaded).toMatch(PATH('activities', 'act-eislaufen'));
    expect(fx.server.media(uploaded ?? '')).toBeUndefined();
    expect(fx.server.media(old)).toBeDefined();
    expect(fx.server.row(H, 'activities', 'act-eislaufen')?.photo_path).toBe(old);
    expect(await fx.storage.get(`media:${uploaded ?? ''}`)).toBeUndefined();
  });

  it('a row deleted meanwhile: the new file is removed and nothing is written', async () => {
    const device = await startHeld();
    device.hold();
    const done = outcome(setRecipePhoto('rec-lasagne', photo()));
    await fx.settle();
    fx.server.deleteRow(H, 'recipes', 'rec-lasagne');
    await device.engine.pull();
    expect(recipe('rec-lasagne')).toBeUndefined();
    device.release();
    await fx.settle(device.engine);

    expect((await done).error).toMatchObject({ message: 'Rezept nicht gefunden' });
    expect(fx.server.media(device.uploaded[0] ?? '')).toBeUndefined();
  });

  it('the file the change replaced is deleted, also when another device changed the photo meanwhile', async () => {
    const device = await startHeld();
    const first = await photoByNadja('activities', 'act-eislaufen');
    device.hold();
    const done = outcome(setActivityPhoto('act-eislaufen', photo(2)));
    await fx.settle();
    const second = await photoByNadja('activities', 'act-eislaufen');
    expect(activity('act-eislaufen')?.photoPath).toBe(second);
    device.release();
    await fx.settle(device.engine);

    expect((await done).error).toBeUndefined();
    const mine = device.uploaded[0] ?? '';
    expect(fx.server.row(H, 'activities', 'act-eislaufen')?.photo_path).toBe(mine);
    expect(fx.server.media(mine)).toBeDefined();
    expect(fx.server.media(second)).toBeUndefined();
    // The photo before belongs to the change of Nadja's device, which deletes it there.
    expect(fx.server.media(first)).toBeDefined();
  });
});

describe('recipe photos', () => {
  it('AC-017: an own recipe photo is shown on the other device; the sample photo key stays', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const done = outcome(setRecipePhoto('rec-spaghetti-bolognese', photo()));
    await fx.settle(nadja);
    expect((await done).error).toBeUndefined();
    const path = recipe('rec-spaghetti-bolognese')?.photoPath;
    expect(path).toMatch(PATH('recipes', 'rec-spaghetti-bolognese'));
    expect(
      fx.nadjaData(nadja).recipes.find((r) => r.id === 'rec-spaghetti-bolognese')?.photoPath,
    ).toBe(path);
  });

  it('AC-018: removing the photo clears the path, then deletes the file', async () => {
    await fx.startEnrico();
    const added = outcome(setRecipePhoto('rec-lasagne', photo()));
    await fx.settle();
    expect((await added).error).toBeUndefined();
    const path = recipe('rec-lasagne')?.photoPath ?? '';
    fx.clearCalls();
    const removed = outcome(removeRecipePhoto('rec-lasagne'));
    await fx.settle();
    expect((await removed).error).toBeUndefined();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges', 'removeMedia']);
    expect((fx.calls[0]?.args[1] as ChangeOp[])[0]).toEqual({
      kind: 'patch',
      table: 'recipes',
      id: 'rec-lasagne',
      changes: { photo_path: null },
    });
    expect(fx.server.media(path)).toBeUndefined();
    expect(recipe('rec-lasagne')).toMatchObject({ photo: 'lasagne', photoPath: undefined });
  });

  it('removing when there is no photo does nothing', async () => {
    await fx.startEnrico();
    await removeActivityPhoto('act-spieleabend');
    expect(fx.calls).toEqual([]);
  });
});

describe('photos on the device (AC-011)', () => {
  /** Nadja sets a photo from her device; Enrico's device learns the path with the next pull. */
  async function photoFromNadja(id: string): Promise<string> {
    const wire = fx.server.transport(NADJA);
    const path = `${H}/activities/${id}/0b7a8f8e-2d1f-4f43-9f55-3c6f1c2b9a10.jpg`;
    await wire.uploadMedia(path, photo(9));
    await wire.applyChanges(H, [
      { kind: 'patch', table: 'activities', id, changes: { photo_path: path } },
    ]);
    await fx.settle();
    return path;
  }

  it('AC-011: loaded once with network, shown again offline from the device storage', async () => {
    await fx.startEnrico();
    const path = await photoFromNadja('act-bouldern');
    expect(activity('act-bouldern')?.photoPath).toBe(path);

    const first = await loadPhoto(path);
    expect(first?.size).toBe(photo().size);
    expect(fx.calls.map((call) => call.fn)).toEqual(['downloadMedia']);
    await loadPhoto(path);
    expect(fx.calls).toHaveLength(1);
    expect(await fx.storage.get(`media:${path}`)).toBeDefined();

    fx.environment.setOnline(false);
    const offline = await loadPhoto(path);
    expect(offline?.type).toBe('image/jpeg');
    expect(new Uint8Array(await (offline as Blob).arrayBuffer())).toEqual(
      new Uint8Array(await (first as Blob).arrayBuffer()),
    );
    expect(await loadPhoto(`${H}/activities/act-eislaufen/never-loaded.jpg`)).toBeUndefined();
    expect(fx.calls).toHaveLength(1);
  });

  it('a photo set on this device is shown without downloading it again', async () => {
    await fx.startEnrico();
    const path = await setPhoto('act-eislaufen');
    fx.clearCalls();
    expect(await loadPhoto(path)).toBeDefined();
    expect(fx.calls).toEqual([]);
  });

  it('a photo that is gone on the server gives nothing, without an error', async () => {
    await fx.startEnrico();
    expect(await loadPhoto(`${H}/activities/act-bouldern/missing.jpg`)).toBeUndefined();
  });

  it('a stored photo of a household the user lost is deleted from the device with it, not only hidden', async () => {
    const engine = await fx.startEnrico();
    const path = await photoFromNadja('act-bouldern');
    expect(await loadPhoto(path)).toBeDefined();
    expect(await fx.storage.get(`media:${path}`)).toBeDefined();
    await fx.server.transport(NADJA).removeMember(H, ENRICO);
    await engine.pull();
    expect(getState().households[H]).toBeUndefined();
    expect(await fx.storage.get(`household:${H}`)).toBeUndefined();
    expect(await fx.storage.get(`media:${path}`)).toBeUndefined();
    expect(await fx.storage.get('media-index')).toEqual([]);
    fx.clearCalls();
    expect(await loadPhoto(path)).toBeUndefined();
    expect(fx.calls).toEqual([]);
  });

  it('a file another member stored that is no JPEG is neither shown nor kept', async () => {
    await fx.startEnrico();
    const wire = fx.server.transport(NADJA);
    const path = `${H}/activities/act-bouldern/${crypto.randomUUID()}.jpg`;
    // The bucket checks only the declared type.
    await wire.uploadMedia(path, new Blob(['<svg onload="alert(1)"/>'], { type: 'image/jpeg' }));
    await wire.applyChanges(H, [
      { kind: 'patch', table: 'activities', id: 'act-bouldern', changes: { photo_path: path } },
    ]);
    await fx.settle();
    expect(await loadPhoto(path)).toBeUndefined();
    expect(await fx.storage.get(`media:${path}`)).toBeUndefined();
    const release = showPhoto(path);
    await fx.settle();
    expect(photoView(path)).toEqual({ loading: false });
    release();
  });

  it('signing out deletes the stored photos with the cache', async () => {
    await fx.startEnrico();
    const path = await photoFromNadja('act-bouldern');
    await loadPhoto(path);
    expect(await fx.storage.get(`media:${path}`)).toBeDefined();
    await resetLocalData();
    expect(await fx.storage.get(`media:${path}`)).toBeUndefined();
  });
});

describe('photos in flight belong to the signed-in session (security check 0004)', () => {
  it('a download still running at sign-out is cancelled and leaves nothing on the device', async () => {
    const device = await startHeld();
    const path = await photoByNadja('activities', 'act-bouldern');
    device.hold();
    const loading = loadPhoto(path);
    await vi.advanceTimersByTimeAsync(0);
    expect(device.signals).toHaveLength(1);
    await resetLocalData();
    expect(device.signals[0]?.aborted).toBe(true);
    device.release();
    expect(await loading).toBeUndefined();
    await vi.advanceTimersByTimeAsync(0);
    expect(await fx.storage.get(`media:${path}`)).toBeUndefined();
    expect(await fx.storage.get('media-index')).toBeUndefined();
  });

  it('a download of the previous user that ends after another one signed in is not kept for her', async () => {
    const device = await startHeld();
    const path = await photoByNadja('activities', 'act-bouldern');
    device.hold();
    const loading = loadPhoto(path);
    await vi.advanceTimersByTimeAsync(0);
    // The app keeps one device storage; the next user's start clears it (other meta).
    const nadja = await startBackend({
      transport: fx.server.transport(NADJA),
      storage: fx.storage,
      userId: NADJA,
      environment: fx.environment,
    });
    await fx.settle(nadja);
    expect(device.signals[0]?.aborted).toBe(true);
    device.release();
    expect(await loading).toBeUndefined();
    await fx.settle(nadja);
    expect(await fx.storage.get(`media:${path}`)).toBeUndefined();
    // Nadja's own download of the photo is hers: loaded with her session, kept for her.
    expect(await loadPhoto(path)).toBeDefined();
    expect(await fx.storage.get(`media:${path}`)).toBeDefined();
  });
});

// usePhoto is useSyncExternalStore(subscribePhotos, () => photoView(path)) plus an effect that
// calls showPhoto(path). React re-reads the snapshot whenever the store notifies, so nothing a
// compiler memoises during render can hold back a photo that finished loading.
describe('showing a photo on a screen (usePhoto)', () => {
  /** Nadja's photo on Bouldern, known to Enrico's device by its path but not stored on it. */
  async function photoFromNadja(): Promise<string> {
    const wire = fx.server.transport(NADJA);
    const path = `${H}/activities/act-bouldern/5d6c1e0a-7f41-4a2b-9c3e-2f1a0b9c8d7e.jpg`;
    await wire.uploadMedia(path, photo(9));
    await wire.applyChanges(H, [
      { kind: 'patch', table: 'activities', id: 'act-bouldern', changes: { photo_path: path } },
    ]);
    await fx.settle();
    fx.clearCalls();
    return path;
  }

  it('AC-009: a photo loaded after the first render is returned on the next render', async () => {
    await fx.startEnrico();
    const path = await photoFromNadja();
    const rendered = vi.fn();
    const unsubscribe = subscribePhotos(rendered);

    // First render: nothing there yet.
    expect(photoView(path)).toEqual({ loading: true });
    // The effect after the first render shows the photo, which starts the download.
    const release = showPhoto(path);
    await fx.settle();

    expect(fx.calls.map((call) => call.fn)).toEqual(['downloadMedia']);
    expect(rendered).toHaveBeenCalled();
    // Next render: the photo, as the same snapshot every time it is read.
    const view = photoView(path);
    expect(view).toEqual({ uri: expect.stringMatching(/^blob:/), loading: false });
    expect(photoView(path)).toBe(view);
    release();
    unsubscribe();
  });

  it('one blob: URL per photo while any screen shows it, kept after the last one let go', async () => {
    await fx.startEnrico();
    const path = await photoFromNadja();
    const create = vi.spyOn(URL, 'createObjectURL');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const first = showPhoto(path);
    const second = showPhoto(path);
    await fx.settle();
    const uri = photoView(path).uri;
    expect(uri).toMatch(/^blob:/);
    expect(create).toHaveBeenCalledTimes(1);
    expect(fx.calls.map((call) => call.fn)).toEqual(['downloadMedia']);

    first();
    second();
    await Promise.resolve();
    expect(revoke).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    create.mockRestore();
    revoke.mockRestore();
  });

  it('AC-009: a photo shown before is there in the first render when a screen shows it again', async () => {
    await fx.startEnrico();
    const path = await photoFromNadja();
    const release = showPhoto(path);
    await fx.settle();
    const uri = photoView(path).uri;
    release();
    await Promise.resolve();
    fx.clearCalls();

    // The list opens again: its first render reads the photo before any effect ran.
    expect(photoView(path)).toEqual({ uri, loading: false });
    const again = showPhoto(path);
    await fx.settle();
    expect(fx.calls).toEqual([]);
    expect(photoView(path).uri).toBe(uri);
    again();
  });

  it('keeps at most 24 photos no screen shows; the one let go longest ago is revoked', async () => {
    await fx.startEnrico();
    const wire = fx.server.transport(NADJA);
    const paths: string[] = [];
    for (let index = 0; index < 25; index += 1) {
      const path = `${H}/activities/act-bouldern/${crypto.randomUUID()}.jpg`;
      await wire.uploadMedia(path, photo(index));
      paths.push(path);
    }
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const uris: (string | undefined)[] = [];
    for (const path of paths) {
      const release = showPhoto(path);
      await fx.settle();
      uris.push(photoView(path).uri);
      release();
      await Promise.resolve();
    }
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith(uris[0]);
    expect(photoView(paths[0])).toEqual({ loading: true });
    expect(photoView(paths[24]).uri).toBe(uris[24]);
    revoke.mockRestore();
  });

  it('signing out revokes the photos kept in memory', async () => {
    await fx.startEnrico();
    const path = await photoFromNadja();
    const release = showPhoto(path);
    await fx.settle();
    const uri = photoView(path).uri;
    release();
    await Promise.resolve();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    await resetLocalData();
    expect(revoke).toHaveBeenCalledWith(uri);
    expect(photoView(path)).toEqual({ loading: true });
    revoke.mockRestore();
  });

  it('AC-011: a photo that is not on the device shows nothing offline, and loads once back online', async () => {
    await fx.startEnrico();
    const path = await photoFromNadja();
    fx.environment.setOnline(false);
    const offline = showPhoto(path);
    await fx.settle();
    expect(photoView(path)).toEqual({ loading: false });
    expect(fx.calls).toEqual([]);

    // usePhoto shows the photo again when the device goes online (effect dependency).
    fx.environment.setOnline(true);
    offline();
    const online = showPhoto(path);
    await fx.settle();
    expect(photoView(path).uri).toMatch(/^blob:/);
    online();
  });

  it('without a path there is nothing to load', () => {
    expect(photoView(undefined)).toEqual({ loading: false });
  });
});

describe('size budget of the stored photos', () => {
  it('drops the oldest photos beyond the budget and those of households no longer on the device', () => {
    const index = [
      { path: 'h1/activities/a/1.jpg', size: 30, at: 1 },
      { path: 'h2/recipes/r/2.jpg', size: 10, at: 2 },
      { path: 'h1/recipes/r/3.jpg', size: 30, at: 3 },
      { path: 'h1/activities/b/4.jpg', size: 30, at: 4 },
    ];
    expect(evictMedia(index, 70, new Set(['h1']))).toEqual({
      kept: [
        { path: 'h1/recipes/r/3.jpg', size: 30, at: 3 },
        { path: 'h1/activities/b/4.jpg', size: 30, at: 4 },
      ],
      dropped: ['h2/recipes/r/2.jpg', 'h1/activities/a/1.jpg'],
    });
    expect(evictMedia(index, 1000, new Set(['h1', 'h2'])).dropped).toEqual([]);
  });
});
