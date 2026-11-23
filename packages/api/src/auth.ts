// Sign-in (spec 0003, REQ-001/REQ-002, ADR-0003): Google via PKCE, local test accounts behind the
// developer switch. The local cache belongs to the signed-in user: sign-out and a change of user
// clear it before anything else happens (AC-003).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

import {
  fetchPublishedVersion,
  readMinAppVersion,
  startAppVersionCheck,
  VERSION_FILE_PATH,
} from './app-version';
import { browserEnvironment, resetLocalData, startBackend } from './backend';
import { TEST_ACCOUNTS, TEST_PASSWORD, type TestAccountKey } from './dev-accounts';
import { createIndexedDbStorage, type Storage } from './storage';

export const NOT_INVITED_MESSAGE =
  'Diese Adresse ist nicht eingeladen. Bitte lass dich von jemandem aus deinem Haushalt einladen.';
export const SIGN_IN_FAILED_MESSAGE = 'Anmelden hat nicht geklappt – bitte noch einmal versuchen.';
export const ACCOUNT_GONE_MESSAGE = 'Dein Konto gibt es nicht mehr – bitte melde dich neu an.';
export const SIGN_OUT_INCOMPLETE_MESSAGE =
  'Abgemeldet. Die Daten auf diesem Gerät ließen sich nicht ganz löschen – das passiert beim nächsten Start.';

/** Where supabase-js keeps the session (browser storage on the web, ADR-0003). */
const AUTH_STORAGE_KEY = 'housekeeping.auth';
/** Set while clearing the local data at sign-out is still owed (it failed once). */
const CLEAR_PENDING_KEY = 'housekeeping.clear-pending';

// ---------- configuration ----------

export interface AuthConfig {
  supabaseUrl: string;
  publishableKey: string;
  /** EXPO_PUBLIC_DEV_LOGIN=1: offers the local test accounts. */
  devLogin: boolean;
}

/** Only the public `EXPO_PUBLIC_*` values; the app passes them in (Expo inlines them there). */
export interface PublicEnv {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  EXPO_PUBLIC_DEV_LOGIN?: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/** Fails loudly on a missing value and on the developer switch against a non-local Supabase. */
export function readAuthConfig(env: PublicEnv): AuthConfig {
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl) throw new Error('EXPO_PUBLIC_SUPABASE_URL is not set.');
  if (!publishableKey) throw new Error('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set.');
  let host: string;
  try {
    host = new URL(supabaseUrl).hostname;
  } catch {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is not a URL.');
  }
  const devLogin = env.EXPO_PUBLIC_DEV_LOGIN === '1';
  if (devLogin && !LOCAL_HOSTS.has(host)) {
    // AC-007: test accounts never against a shared Supabase.
    throw new Error('EXPO_PUBLIC_DEV_LOGIN=1 is only allowed with a local Supabase.');
  }
  return { supabaseUrl, publishableKey, devLogin };
}

// ---------- error messages ----------

export interface AuthErrorLike {
  name?: string;
  message: string;
  code?: string;
  status?: number;
}

const REDIRECT_ERROR_PARAMS = ['error', 'error_code', 'error_description'] as const;

const mentionsNotInvited = (values: readonly unknown[]) =>
  values.some((value) => typeof value === 'string' && value.includes('not_invited'));

/** The German message for a failed sign-in; the hook's `not_invited` gets its own (AC-002). */
export function authErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    if (mentionsNotInvited([record.message, record.code, record.msg, record.error_description])) {
      return NOT_INVITED_MESSAGE;
    }
  }
  return SIGN_IN_FAILED_MESSAGE;
}

function redirectParams(href: string): URLSearchParams {
  const url = new URL(href);
  const params = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '');
  url.searchParams.forEach((value, key) => params.set(key, value));
  return params;
}

/** The error Supabase Auth put into the redirect back to the app, as German message. */
export function readRedirectError(href: string): string | undefined {
  const params = redirectParams(href);
  const values = REDIRECT_ERROR_PARAMS.map((key) => params.get(key));
  if (values.every((value) => value === null)) return undefined;
  return mentionsNotInvited(values) ? NOT_INVITED_MESSAGE : SIGN_IN_FAILED_MESSAGE;
}

/** The address without the error parameters, so a reload does not show the error again. */
export function withoutRedirectError(href: string): string {
  const url = new URL(href);
  for (const key of REDIRECT_ERROR_PARAMS) url.searchParams.delete(key);
  if (url.hash.startsWith('#')) {
    const hash = new URLSearchParams(url.hash.slice(1));
    if (REDIRECT_ERROR_PARAMS.some((key) => hash.has(key))) {
      for (const key of REDIRECT_ERROR_PARAMS) hash.delete(key);
      url.hash = hash.toString();
    }
  }
  return url.toString();
}

/** Parameters of the PKCE redirect that supabase-js reads (`sb_flow_id`: its flow id). */
const CALLBACK_PARAMS = ['code', 'sb_flow_id', ...REDIRECT_ERROR_PARAMS] as const;

/**
 * The address without the sign-in callback (code, flow id, errors), once supabase-js has
 * exchanged the code or failed to: a reload must not try again, and the code must not linger in
 * the history.
 */
export function withoutAuthCallback(href: string): string {
  const url = new URL(withoutRedirectError(href));
  for (const key of CALLBACK_PARAMS) url.searchParams.delete(key);
  return url.toString();
}

// ---------- the Supabase client ----------

/** Where the session is kept; the web uses browser storage, native will use secure storage. */
export interface SessionStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

function browserSessionStorage(): SessionStorage | undefined {
  const target = globalThis as { localStorage?: SessionStorage };
  try {
    return target.localStorage;
  } catch {
    return undefined;
  }
}

const isBrowser = () => typeof (globalThis as { document?: unknown }).document !== 'undefined';

function createSupabaseClient(
  config: AuthConfig,
  storage: SessionStorage | undefined = browserSessionStorage(),
): SupabaseClient {
  return createClient(config.supabaseUrl, config.publishableKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: isBrowser(),
      persistSession: true,
      autoRefreshToken: true,
      storageKey: AUTH_STORAGE_KEY,
      storage,
    },
  });
}

// ---------- the controller ----------

export interface SessionLike {
  user: { id: string; email?: string };
}

/** The part of `supabase.auth` the controller uses. */
export interface AuthApi {
  getSession(): Promise<{
    data: { session: SessionLike | null };
    error: AuthErrorLike | null;
  }>;
  onAuthStateChange(callback: (event: string, session: SessionLike | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
  signInWithOAuth(credentials: {
    provider: 'google';
    options: { redirectTo: string };
  }): Promise<{ error: AuthErrorLike | null }>;
  signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<{ data: { session: SessionLike | null }; error: AuthErrorLike | null }>;
  signOut(options: { scope: 'local' }): Promise<{ error: AuthErrorLike | null }>;
  /** Asks the server about the session's user (the account may have been deleted). */
  getUser(): Promise<{ data: { user: { id: string } | null }; error: AuthErrorLike | null }>;
}

/** A flag that survives a reload (localStorage on the web). */
export interface Marker {
  isSet(): Promise<boolean>;
  set(): Promise<void>;
  unset(): Promise<void>;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn';
  user?: AuthUser;
  /** German message for the login screen. */
  error?: string;
}

export interface AuthControllerOptions {
  auth: AuthApi;
  devLogin: boolean;
  /** Where Google sends the browser back to. */
  redirectUrl(): string;
  /** An error from the redirect back to the app (readRedirectError). */
  redirectError?: string;
  /** Loads this user's cache and starts the sync. */
  startData(userId: string): Promise<void>;
  /** Clears cache, store queue and outbox on this device. */
  resetData(): Promise<void>;
  /** The user of the session in storage, when it cannot be refreshed for lack of network. */
  storedUser(): Promise<AuthUser | undefined>;
  /** Clearing the local data is still owed from a failed sign-out; retried on start. */
  clearMarker?: Marker;
  /** The address carries a PKCE `code`: without a session afterwards, the sign-in failed. */
  authCodeInUrl?: boolean;
  /** Removes the callback parameters from the address; called once the session was read. */
  cleanUrl?(): void;
  /**
   * Runs at sign-out before anything is cleared, while the session still holds (spec 0013,
   * AC-042: the app unsubscribes this browser from push and, with network, unregisters it). It
   * gets at most BEFORE_SIGN_OUT_MS; a failure or a hang never keeps the person signed in.
   */
  beforeSignOut?(): Promise<void>;
}

export interface AuthController {
  getState(): AuthState;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  stop(): void;
  signInWithGoogle(): Promise<void>;
  signInWithTestAccount(key: TestAccountKey): Promise<void>;
  signOut(): Promise<void>;
  /** Asks the server whether the signed-in account still exists (start, back online). */
  checkAccount(): Promise<void>;
  /** The sync found no profile of this user: the account was deleted. */
  accountMissing(userId: string): void;
}

/** A network failure while refreshing the token: the session is still valid (AC-004). */
const isRetryable = (error: AuthErrorLike) =>
  error.name === 'AuthRetryableFetchError' || error.status === 0;

/** Supabase Auth: "User from sub claim in JWT does not exist" (403 user_not_found). */
const isAccountGone = (error: AuthErrorLike) => error.code === 'user_not_found';

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'unknown');

/** How long sign-out waits for `beforeSignOut` (plan 0013, Decision 28). */
const BEFORE_SIGN_OUT_MS = 3_000;

/** Runs the hook, but never longer than BEFORE_SIGN_OUT_MS and never with an error. */
async function runBeforeSignOut(hook: (() => Promise<void>) | undefined): Promise<void> {
  if (!hook) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), BEFORE_SIGN_OUT_MS);
  });
  try {
    const outcome = await Promise.race([hook().then(() => 'done' as const), timeout]);
    if (outcome === 'timeout') console.warn('Unregistering this device took too long');
  } catch (error) {
    console.warn(`Unregistering this device failed: ${errorName(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

const toUser = (session: SessionLike): AuthUser => ({
  id: session.user.id,
  email: session.user.email ?? '',
});

export function createAuthController(options: AuthControllerOptions): AuthController {
  const { auth } = options;
  let state: AuthState = { status: 'loading' };
  const listeners = new Set<() => void>();
  /** The user whose data is loaded on this device right now. */
  let active: string | undefined;
  /** Session changes are applied one after another, never interleaved. */
  let chain: Promise<void> = Promise.resolve();
  let unsubscribe: (() => void) | undefined;

  function set(next: AuthState): void {
    state = next;
    for (const listener of listeners) listener();
  }

  function enqueue(step: () => Promise<void>): Promise<void> {
    chain = chain.then(step, step);
    return chain;
  }

  async function enter(user: AuthUser): Promise<void> {
    if (active === user.id) {
      if (state.status !== 'signedIn' || state.user?.email !== user.email) {
        set({ status: 'signedIn', user });
      }
      return;
    }
    // Another user on this device: the previous cache goes before the new one is loaded. Until
    // the new one is ready the gate shows the splash, never the previous user's screens.
    if (active !== undefined) {
      set({ status: 'loading' });
      await options.resetData();
    }
    active = user.id;
    try {
      await options.startData(user.id);
    } catch (error) {
      active = undefined;
      console.warn(`Loading the local data failed: ${errorName(error)}`);
      set({ status: 'signedOut', error: SIGN_IN_FAILED_MESSAGE });
      return;
    }
    set({ status: 'signedIn', user });
  }

  async function leave(error?: string): Promise<void> {
    if (active !== undefined) {
      active = undefined;
      set({ status: 'loading' });
      await options.resetData();
    } else if (state.status === 'signedOut' && !error) {
      // Our own signOut already showed the login (maybe with a message); its event changes nothing.
      return;
    }
    set(error ? { status: 'signedOut', error } : { status: 'signedOut' });
  }

  /**
   * Clears this device and removes the session. The session goes in any case: a cache that cannot
   * be cleared must not keep the user signed in (the clearing is retried on the next start).
   */
  async function signOutHere(message?: string): Promise<void> {
    active = undefined;
    set({ status: 'loading' });
    // Spec 0013, AC-042: this device stops receiving notifications before its data goes.
    await runBeforeSignOut(options.beforeSignOut);
    let cleared = true;
    try {
      // AC-003: local data first, so nothing of it outlives the session.
      await options.resetData();
    } catch (error) {
      cleared = false;
      console.warn(`Clearing the local data failed: ${errorName(error)}`);
      await options.clearMarker?.set().catch(() => undefined);
    } finally {
      await auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    const error = cleared ? message : SIGN_OUT_INCOMPLETE_MESSAGE;
    set(error ? { status: 'signedOut', error } : { status: 'signedOut' });
  }

  async function retryPendingClear(): Promise<void> {
    const marker = options.clearMarker;
    if (!marker || !(await marker.isSet().catch(() => false))) return;
    try {
      await options.resetData();
      await marker.unset();
    } catch (error) {
      console.warn(`Clearing the local data failed again: ${errorName(error)}`);
    }
  }

  function accountGone(userId: string): Promise<void> {
    return enqueue(async () => {
      if (active !== userId) return;
      await signOutHere(ACCOUNT_GONE_MESSAGE);
    });
  }

  async function checkAccount(): Promise<void> {
    const userId = active;
    if (userId === undefined) return;
    let error: AuthErrorLike | null;
    try {
      ({ error } = await auth.getUser());
    } catch {
      return; // no answer, no verdict
    }
    if (error && isAccountGone(error)) await accountGone(userId);
  }

  function onChange(session: SessionLike | null): void {
    // Never await other supabase calls inside its callback (it holds a lock): queue instead.
    void enqueue(() => (session ? enter(toUser(session)) : leave()));
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async start() {
      if (unsubscribe) return;
      const { data } = auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION') return; // handled by getSession below
        onChange(session);
      });
      unsubscribe = () => data.subscription.unsubscribe();
      await enqueue(async () => {
        await retryPendingClear();
        // getSession waits until supabase-js has exchanged a code from the address (or failed).
        const { data: current, error } = await auth.getSession();
        options.cleanUrl?.();
        if (current.session) return enter(toUser(current.session));
        const stored = error && isRetryable(error) ? await options.storedUser() : undefined;
        if (stored) return enter(stored);
        const failedCallback = options.authCodeInUrl ? SIGN_IN_FAILED_MESSAGE : undefined;
        return leave(options.redirectError ?? failedCallback);
      });
      // A stored session may belong to an account deleted meanwhile (e.g. after a db reset).
      void checkAccount();
    },

    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
    },

    async signInWithGoogle() {
      const { error } = await auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: options.redirectUrl() },
      });
      if (error) set({ status: 'signedOut', error: authErrorMessage(error) });
    },

    async signInWithTestAccount(key) {
      if (!options.devLogin) {
        throw new Error('Test accounts need EXPO_PUBLIC_DEV_LOGIN=1 and a local Supabase.');
      }
      const account = TEST_ACCOUNTS.find((candidate) => candidate.key === key);
      if (!account) throw new Error(`Unknown test account ${key}`);
      const { data, error } = await auth.signInWithPassword({
        email: account.email,
        password: TEST_PASSWORD,
      });
      if (error || !data.session) {
        set({ status: 'signedOut', error: authErrorMessage(error) });
        return;
      }
      const session = data.session;
      await enqueue(() => enter(toUser(session)));
    },

    async signOut() {
      await enqueue(() => signOutHere());
    },

    checkAccount,

    accountMissing(userId) {
      void accountGone(userId);
    },
  };
}

// ---------- the app's sign-in (one per app) ----------

let controller: AuthController | undefined;
const LOADING: AuthState = { status: 'loading' };
const appListeners = new Set<() => void>();

function subscribeApp(listener: () => void): () => void {
  appListeners.add(listener);
  return () => {
    appListeners.delete(listener);
  };
}

/** Changes the address without a navigation; keeps the router's history state (expo-router). */
function replaceHref(href: string): void {
  const history = (
    globalThis as {
      history?: { state?: unknown; replaceState?: History['replaceState'] };
    }
  ).history;
  history?.replaceState?.(history.state ?? null, '', href);
}

function storageMarker(storage: SessionStorage | undefined, key: string): Marker | undefined {
  if (!storage) return undefined;
  return {
    isSet: async () => (await storage.getItem(key)) === '1',
    set: async () => {
      await storage.setItem(key, '1');
    },
    unset: async () => {
      await storage.removeItem(key);
    },
  };
}

function currentHref(): string | undefined {
  const location = (globalThis as { location?: { href?: string } }).location;
  return typeof location?.href === 'string' ? location.href : undefined;
}

/** Reads the session stored by supabase-js without the network (offline start, AC-004). */
async function readStoredUser(storage: SessionStorage | undefined): Promise<AuthUser | undefined> {
  try {
    const raw = await storage?.getItem(AUTH_STORAGE_KEY);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    const user = (value as { user?: { id?: unknown; email?: unknown } } | null)?.user;
    if (typeof user?.id !== 'string') return undefined;
    return { id: user.id, email: typeof user.email === 'string' ? user.email : '' };
  } catch {
    return undefined;
  }
}

/**
 * Starts the sign-in once: creates the Supabase client, reads an error from the redirect, and
 * loads the cache of the signed-in user (startBackend). Throws on a broken configuration.
 */
export function startAuth(
  config: AuthConfig,
  options: {
    sessionStorage?: SessionStorage;
    cacheStorage?: Storage;
    /** See AuthControllerOptions.beforeSignOut (spec 0013, AC-042). */
    beforeSignOut?: () => Promise<void>;
    /** The app's own version (spec 0014): starts the version check, signed in or not. */
    appVersion?: string;
  } = {},
): AuthController {
  if (controller) return controller;
  const sessionStorage = options.sessionStorage ?? browserSessionStorage();
  const cacheStorage = options.cacheStorage ?? createIndexedDbStorage();

  // Read the error before the client starts, then drop it from the address bar.
  const href = currentHref();
  const redirectError = href ? readRedirectError(href) : undefined;
  if (href && redirectError) replaceHref(withoutRedirectError(href));
  const authCodeInUrl = href ? new URL(href).searchParams.has('code') : false;

  const supabase = createSupabaseClient(config, sessionStorage);
  if (options.appVersion !== undefined) {
    // Before the backend starts, so its store queue waits for the first answer (AC-025).
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
    startAppVersionCheck({
      own: options.appVersion,
      environment: browserEnvironment(),
      // Only the web app has a version file; native reads the minimum version alone.
      readLatest: origin
        ? () => fetchPublishedVersion((url, init) => fetch(url, init), origin + VERSION_FILE_PATH)
        : () => Promise.resolve(null),
      readMin: () => readMinAppVersion((fn) => supabase.rpc(fn)),
    });
  }
  controller = createAuthController({
    auth: supabase.auth,
    devLogin: config.devLogin,
    redirectError,
    redirectUrl: () => {
      const location = (globalThis as { location?: { origin?: string } }).location;
      return `${location?.origin ?? ''}/`;
    },
    startData: async (userId) => {
      await startBackend({
        supabase,
        storage: cacheStorage,
        userId,
        onAccountMissing: () => controller?.accountMissing(userId),
      });
    },
    resetData: async () => {
      await resetLocalData();
      // Also when no engine runs (e.g. it never started): nothing of the cache may remain.
      await cacheStorage.clear();
    },
    storedUser: () => readStoredUser(sessionStorage),
    clearMarker: storageMarker(sessionStorage, CLEAR_PENDING_KEY),
    beforeSignOut: options.beforeSignOut,
    authCodeInUrl,
    cleanUrl: () => {
      const now = currentHref();
      if (!authCodeInUrl || !now) return;
      const next = withoutAuthCallback(now);
      if (next !== now) replaceHref(next);
    },
  });
  const app = controller;
  controller.subscribe(() => {
    for (const listener of appListeners) listener();
  });
  for (const listener of appListeners) listener();
  // Back online: the account may have been deleted while the device was offline.
  browserEnvironment().subscribe({ online: () => void app.checkAccount() });
  void controller.start();
  return controller;
}

function requireController(): AuthController {
  if (!controller) throw new Error('startAuth() has not been called');
  return controller;
}

export const signInWithGoogle = () => requireController().signInWithGoogle();
export const signInWithTestAccount = (key: TestAccountKey) =>
  requireController().signInWithTestAccount(key);
export const signOut = () => requireController().signOut();

/** Sign-in state for the auth gate; "loading" until startAuth has read the session. */
export function useAuth(): AuthState {
  return useSyncExternalStore(
    subscribeApp,
    () => controller?.getState() ?? LOADING,
    () => controller?.getState() ?? LOADING,
  );
}
