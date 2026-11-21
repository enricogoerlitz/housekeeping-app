// Spec 0014, REQ-004: the version check (online only, at start and on returning to the
// foreground) and what it means for the sync engine below the minimum version.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAppVersionCheck,
  fetchPublishedVersion,
  readAppVersionState,
  readMinAppVersion,
  startAppVersionCheck,
  stopAppVersionCheck,
  type AppVersionCheck,
} from './app-version';
import { stopBackend } from './backend';
import { fakeEnvironment, H, withBackend, type FakeEnvironment } from './backend-test-helpers';
import { createRecipe } from './commands-recipes';
import { setItemChecked } from './commands-shopping';
import { NADJA } from './seed/demo';
import { getData, getState, OfflineError } from './store';

/** A reader the test answers by hand. */
function controlled() {
  let resolve: (value: string | null) => void = () => {};
  const read = vi.fn(
    () =>
      new Promise<string | null>((done) => {
        resolve = done;
      }),
  );
  return { read, answer: (value: string | null) => resolve(value) };
}

describe('version check', () => {
  let environment: FakeEnvironment;
  let check: AppVersionCheck | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    environment = fakeEnvironment();
  });

  afterEach(() => {
    check?.stop();
    check = undefined;
    vi.useRealTimers();
  });

  function create(options: {
    own: string;
    latest?: () => Promise<string | null>;
    min?: () => Promise<string | null>;
  }): AppVersionCheck {
    check = createAppVersionCheck({
      own: options.own,
      environment,
      readLatest: options.latest ?? (() => Promise.resolve(options.own)),
      readMin: options.min ?? (() => Promise.resolve('2026.1.1')),
    });
    return check;
  }

  it('AC-022: a newer published version shows "neu-verfuegbar" at start', async () => {
    const versions = create({ own: '2026.12.4', latest: () => Promise.resolve('2026.12.5') });
    versions.start();
    await vi.runAllTimersAsync();
    expect(versions.getState()).toBe('neu-verfuegbar');
    expect(versions.writesLocked()).toBe(false);
    expect(versions.queueHeld()).toBe(false);
  });

  it('AC-022: returning to the foreground checks again and notices the new version', async () => {
    let published = '2026.12.4';
    const latest = vi.fn(() => Promise.resolve(published));
    const versions = create({ own: '2026.12.4', latest });
    const changes = vi.fn();
    versions.subscribe(changes);
    versions.start();
    await vi.runAllTimersAsync();
    expect(versions.getState()).toBe('aktuell');

    published = '2026.12.5';
    environment.foreground();
    await vi.runAllTimersAsync();
    expect(latest).toHaveBeenCalledTimes(2);
    expect(versions.getState()).toBe('neu-verfuegbar');
    expect(changes).toHaveBeenCalled();
  });

  it('AC-023: offline at start and in the foreground nothing is read, no hint, no lock', async () => {
    environment.setOnline(false);
    const latest = vi.fn(() => Promise.resolve('2026.12.9'));
    const min = vi.fn(() => Promise.resolve('2026.12.9'));
    const versions = create({ own: '2026.12.4', latest, min });
    versions.start();
    environment.foreground();
    await vi.runAllTimersAsync();
    expect(latest).not.toHaveBeenCalled();
    expect(min).not.toHaveBeenCalled();
    expect(versions.getState()).toBe('aktuell');
    expect(versions.writesLocked()).toBe(false);
  });

  it('AC-023: unreadable answers count as not read: no hint, no lock, no error', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const versions = create({
      own: '2026.12.4',
      latest: () => Promise.reject(new TypeError('Failed to fetch')),
      min: () => Promise.reject(new Error('timeout')),
    });
    versions.start();
    await vi.runAllTimersAsync();
    expect(versions.getState()).toBe('aktuell');
    expect(versions.writesLocked()).toBe(false);
    expect(versions.queueHeld()).toBe(false);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('AC-023: a read that never answers is given up, the store queue is not held for ever', async () => {
    const versions = create({
      own: '2026.12.4',
      latest: () => new Promise(() => {}),
      min: () => new Promise(() => {}),
    });
    versions.start();
    expect(versions.queueHeld()).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(versions.queueHeld()).toBe(false);
    expect(versions.getState()).toBe('aktuell');
  });

  it('AC-023: the version file is fetched past every cache, the service worker included', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ version: '2026.12.5', commit: 'abc' }))),
    );
    await expect(fetchPublishedVersion(fetcher, 'https://app.example/version.json')).resolves.toBe(
      '2026.12.5',
    );
    expect(fetcher).toHaveBeenCalledWith('https://app.example/version.json', {
      cache: 'no-store',
    });
  });

  it('a broken version file is refused instead of guessed', async () => {
    const answer = (body: string, status = 200) =>
      fetchPublishedVersion(() => Promise.resolve(new Response(body, { status })), '/version.json');
    await expect(answer('<html>')).rejects.toThrow();
    await expect(answer(JSON.stringify({ commit: 'abc' }))).rejects.toThrow();
    await expect(answer('{}', 404)).rejects.toThrow();
  });

  it('reads the minimum version with the RPC min_app_version and refuses anything but text', async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: '2026.12.2' as unknown, error: null }));
    await expect(readMinAppVersion(rpc)).resolves.toBe('2026.12.2');
    expect(rpc).toHaveBeenCalledWith('min_app_version');
    await expect(
      readMinAppVersion(() => Promise.resolve({ data: 42, error: null })),
    ).rejects.toThrow();
    await expect(
      readMinAppVersion(() => Promise.resolve({ data: null, error: { message: 'down' } })),
    ).rejects.toThrow();
  });

  it('AC-025: below the minimum version writes are locked and the store queue is held', async () => {
    const versions = create({ own: '2026.12.4', min: () => Promise.resolve('2026.12.5') });
    versions.start();
    await vi.runAllTimersAsync();
    expect(versions.getState()).toBe('nicht-unterstuetzt');
    expect(versions.writesLocked()).toBe(true);
    expect(versions.queueHeld()).toBe(true);
  });

  it('AC-025: the store queue waits for the check that follows reaching the server', async () => {
    const latest = controlled();
    const min = controlled();
    const versions = create({ own: '2026.12.4', latest: latest.read, min: min.read });
    environment.setOnline(false);
    versions.start();
    expect(versions.queueHeld()).toBe(true);

    environment.setOnline(true);
    expect(min.read).toHaveBeenCalledTimes(1);
    expect(versions.queueHeld()).toBe(true);
    latest.answer('2026.12.4');
    min.answer('2026.1.1');
    await vi.runAllTimersAsync();
    expect(versions.queueHeld()).toBe(false);
  });

  it('dev and vorschau read nothing and are never held, hinted or locked', async () => {
    for (const own of ['dev', 'vorschau']) {
      const latest = vi.fn(() => Promise.resolve('2026.12.9'));
      const min = vi.fn(() => Promise.resolve('2026.12.9'));
      const versions = create({ own, latest, min });
      expect(versions.queueHeld()).toBe(false);
      versions.start();
      environment.foreground();
      await vi.runAllTimersAsync();
      expect(latest).not.toHaveBeenCalled();
      expect(min).not.toHaveBeenCalled();
      expect(versions.getState()).toBe('aktuell');
      expect(versions.queueHeld()).toBe(false);
      versions.stop();
    }
  });
});

describe('the sync engine below the minimum version (AC-025)', () => {
  const backend = withBackend();

  afterEach(() => stopAppVersionCheck());

  function versionCheck(own: string, min: string) {
    startAppVersionCheck({
      own,
      environment: backend.environment,
      readLatest: () => Promise.resolve('2026.12.5'),
      readMin: () => Promise.resolve(min),
    });
  }

  it('AC-025: reading, checking and the delta sync go on; editing is refused; the queue waits until the new version runs', async () => {
    versionCheck('2026.12.4', '2026.12.5');
    const enrico = await backend.startEnrico();
    expect(readAppVersionState()).toBe('nicht-unterstuetzt');

    // Editing is locked like offline, reading goes on.
    expect(getState().offline).toBe(true);
    expect(getData().household.name).toBe('Enrico & Nadja');
    expect(() => createRecipe({ title: 'Gesperrt' })).toThrow(OfflineError);

    // Checking works on the device, but nothing is sent.
    const [milk, other] = getData()
      .items.filter((item) => !item.checked)
      .slice(0, 2);
    if (!milk || !other) throw new Error('fixture');
    setItemChecked(milk.id, true);
    await backend.settle(enrico);
    expect(getData().items.find((item) => item.id === milk.id)?.checked).toBe(true);
    expect(backend.server.row(H, 'shopping_items', milk.id)).toMatchObject({ checked: false });
    expect(backend.calls.filter((call) => call.fn === 'setItemChecked')).toEqual([]);

    // The delta sync continues: Nadja's check arrives.
    const seen = Number(backend.server.row(H, 'shopping_items', other.id)?.check_seq ?? 0);
    await backend.server.transport(NADJA).setItemChecked(other.id, true, seen);
    await enrico.pull();
    expect(getData().items.find((item) => item.id === other.id)?.checked).toBe(true);
    expect(backend.server.row(H, 'shopping_items', milk.id)).toMatchObject({ checked: false });

    // "Neu laden": the new version starts and sends the waiting check.
    await stopBackend();
    versionCheck('2026.12.5', '2026.12.5');
    const reloaded = await backend.startEnrico();
    await backend.settle(reloaded);
    expect(readAppVersionState()).toBe('aktuell');
    expect(getState().offline).toBe(false);
    expect(backend.server.row(H, 'shopping_items', milk.id)).toMatchObject({ checked: true });
    expect(await backend.storage.get('queue')).toEqual([]);
  });

  it('AC-025: the server lowering the minimum again releases the queue in the running app', async () => {
    let min = '2026.12.5';
    startAppVersionCheck({
      own: '2026.12.4',
      environment: backend.environment,
      readLatest: () => Promise.resolve('2026.12.4'),
      readMin: () => Promise.resolve(min),
    });
    const enrico = await backend.startEnrico();
    const milk = getData().items.find((item) => !item.checked);
    if (!milk) throw new Error('fixture');
    setItemChecked(milk.id, true);
    await backend.settle(enrico);
    expect(backend.server.row(H, 'shopping_items', milk.id)).toMatchObject({ checked: false });

    min = '2026.12.4';
    backend.environment.foreground();
    await backend.settle(enrico);
    expect(getState().offline).toBe(false);
    expect(backend.server.row(H, 'shopping_items', milk.id)).toMatchObject({ checked: true });
  });
});
