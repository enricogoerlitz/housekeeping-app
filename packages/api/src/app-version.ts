// The version check (spec 0014, REQ-004, ADR-0015): the published version from `/version.json`
// and the server's minimum version from `public.min_app_version()`. Both are online reads, at
// start, on returning to the foreground and when the network comes back; without network nothing
// is read and nothing is shown or locked (AC-023). The comparison is core's appVersionState.
//
// Below the minimum version the sync engine (backend.ts, `VersionGate`) disables writes as when
// offline and holds the store queue; reads and the delta sync go on (AC-025). The queue also waits
// while a check is running after the server became reachable, so a version that is no longer
// supported does not send its waiting store actions before it knows (they could fail for good
// against a changed database and be lost).
import { appVersionState, parseAppVersion, type AppVersionState } from '@housekeeping/core';
import { useSyncExternalStore } from 'react';
import { z } from 'zod';

import type { Environment } from './backend';

/** The web app's version file (written by apps/app/scripts/finish-web-export.mjs). */
export const VERSION_FILE_PATH = '/version.json';
/** A read that does not answer by then counts as not read. */
const READ_TIMEOUT_MS = 10_000;

const VersionFileSchema = z.object({ version: z.string().min(1), commit: z.string() });

/**
 * The published version. `no-store` keeps the HTTP cache out, and the service worker answers
 * only precached files, which the version file never is (AC-023).
 */
export async function fetchPublishedVersion(
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
  url: string,
): Promise<string> {
  const response = await fetcher(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Version file answered ${response.status}`);
  return VersionFileSchema.parse(await response.json()).version;
}

/** `public.min_app_version()`, callable signed in or not. */
export async function readMinAppVersion(
  rpc: (fn: 'min_app_version') => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<string> {
  const { data, error } = await rpc('min_app_version');
  if (error) throw new Error('min_app_version failed');
  return z.string().parse(data);
}

/** Lets the sync engine know whether it may write and send the store queue. */
export interface VersionGate {
  /** Below the minimum version: commands are refused as when offline. */
  writesLocked(): boolean;
  /** The store queue waits (below the minimum, or until the check after reconnecting answered). */
  queueHeld(): boolean;
  subscribe(listener: () => void): () => void;
}

export interface AppVersionCheckOptions {
  /** The app's own version (EXPO_PUBLIC_APP_VERSION; `dev` or `vorschau` read nothing). */
  own: string;
  environment: Environment;
  /** The published version; null where there is no version file (native). */
  readLatest: () => Promise<string | null>;
  readMin: () => Promise<string | null>;
  timeoutMs?: number;
}

export interface AppVersionCheck extends VersionGate {
  start(): void;
  stop(): void;
  getState(): AppVersionState;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Version check timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('Version check failed'));
      },
    );
  });
}

export function createAppVersionCheck(options: AppVersionCheckOptions): AppVersionCheck {
  const { own, environment } = options;
  const timeoutMs = options.timeoutMs ?? READ_TIMEOUT_MS;
  // Local and preview builds are never hinted or locked, so they need no answer either.
  const checked = parseAppVersion(own) !== null;
  const listeners = new Set<() => void>();
  let latest: string | null = null;
  let min: string | null = null;
  let state: AppVersionState = 'aktuell';
  /** Answered since the server became reachable (start, or back online). */
  let answered = false;
  let running: Promise<void> | undefined;
  let unsubscribe: (() => void) | undefined;
  let stopped = false;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  /** One read; a failure keeps what was read before (no hint, no lock, no error from it). */
  async function read(reader: () => Promise<string | null>, previous: string | null) {
    try {
      return await withTimeout(reader(), timeoutMs);
    } catch {
      return previous;
    }
  }

  function check(): Promise<void> {
    if (!checked || stopped || !environment.isOnline()) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      const [nextLatest, nextMin] = await Promise.all([
        read(options.readLatest, latest),
        read(options.readMin, min),
      ]);
      running = undefined;
      if (stopped) return;
      latest = nextLatest;
      min = nextMin;
      state = appVersionState({ own, latest, min });
      answered = true;
      notify();
    })();
    // Held from now until the answer: notify after `running` is set.
    notify();
    return running;
  }

  return {
    start() {
      if (unsubscribe || !checked) return;
      stopped = false;
      unsubscribe = environment.subscribe({
        online: () => void check(),
        offline: () => {
          // Back online, the queue waits for a fresh answer again.
          answered = false;
          notify();
        },
        foreground: () => void check(),
      });
      void check();
    },
    stop() {
      stopped = true;
      unsubscribe?.();
      unsubscribe = undefined;
    },
    getState: () => state,
    writesLocked: () => state === 'nicht-unterstuetzt',
    queueHeld: () =>
      checked && (!answered || running !== undefined || state === 'nicht-unterstuetzt'),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// ---------- the app's version check (one at a time) ----------

let active: { check: AppVersionCheck; unsubscribe: () => void } | undefined;
const gateListeners = new Set<() => void>();

function notifyGate(): void {
  for (const listener of gateListeners) listener();
}

/** The gate the sync engine uses by default; open while no check runs (tests, dev). */
export const appVersionGate: VersionGate = {
  writesLocked: () => active?.check.writesLocked() ?? false,
  queueHeld: () => active?.check.queueHeld() ?? false,
  subscribe(listener) {
    gateListeners.add(listener);
    return () => {
      gateListeners.delete(listener);
    };
  },
};

/** Starts the app's version check (replacing a running one). */
export function startAppVersionCheck(options: AppVersionCheckOptions): AppVersionCheck {
  stopAppVersionCheck();
  const check = createAppVersionCheck(options);
  active = { check, unsubscribe: check.subscribe(notifyGate) };
  check.start();
  notifyGate();
  return check;
}

export function stopAppVersionCheck(): void {
  if (!active) return;
  active.check.stop();
  active.unsubscribe();
  active = undefined;
  notifyGate();
}

/** What the app shows: "aktuell" until a check answered otherwise. */
export function readAppVersionState(): AppVersionState {
  return active?.check.getState() ?? 'aktuell';
}

export function useAppVersionState(): AppVersionState {
  return useSyncExternalStore(appVersionGate.subscribe, readAppVersionState, readAppVersionState);
}
