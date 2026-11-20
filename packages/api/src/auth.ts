// Sign-in (spec 0003, REQ-001/REQ-002, ADR-0003): Google via PKCE, local test accounts behind the
// developer switch. The local cache belongs to the signed-in user: sign-out and a change of user
// clear it before anything else happens (AC-003).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

import { resetLocalData, startBackend } from './backend';
import { TEST_ACCOUNTS, TEST_PASSWORD, type TestAccountKey } from './dev-accounts';
import { createIndexedDbStorage, type Storage } from './storage';

export const NOT_INVITED_MESSAGE =
  'Diese Adresse ist nicht eingeladen. Bitte lass dich von jemandem aus deinem Haushalt einladen.';
export const SIGN_IN_FAILED_MESSAGE = 'Anmelden hat nicht geklappt – bitte noch einmal versuchen.';

/** Where supabase-js keeps the session (browser storage on the web, ADR-0003). */
export const AUTH_STORAGE_KEY = 'housekeeping.auth';

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

export function createSupabaseClient(
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
}

export interface AuthController {
  getState(): AuthState;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  stop(): void;
  signInWithGoogle(): Promise<void>;
  signInWithTestAccount(key: TestAccountKey): Promise<void>;
  signOut(): Promise<void>;
}

/** A network failure while refreshing the token: the session is still valid (AC-004). */
const isRetryable = (error: AuthErrorLike) =>
  error.name === 'AuthRetryableFetchError' || error.status === 0;

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
      console.warn(
        `Loading the local data failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
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
    }
    set(error ? { status: 'signedOut', error } : { status: 'signedOut' });
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
        const { data: current, error } = await auth.getSession();
        if (current.session) return enter(toUser(current.session));
        const stored = error && isRetryable(error) ? await options.storedUser() : undefined;
        if (stored) return enter(stored);
        return leave(options.redirectError);
      });
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
      await enqueue(async () => {
        // AC-003: local data first, so nothing of it outlives the session.
        active = undefined;
        set({ status: 'loading' });
        await options.resetData();
        await auth.signOut({ scope: 'local' });
        set({ status: 'signedOut' });
      });
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
 * loads the cache of the signed-in user (backend mode). Throws on a broken configuration.
 */
export function startAuth(
  config: AuthConfig,
  options: { sessionStorage?: SessionStorage; cacheStorage?: Storage } = {},
): AuthController {
  if (controller) return controller;
  const sessionStorage = options.sessionStorage ?? browserSessionStorage();
  const cacheStorage = options.cacheStorage ?? createIndexedDbStorage();

  // Read the error before the client starts, then drop it from the address bar.
  const href = currentHref();
  const redirectError = href ? readRedirectError(href) : undefined;
  if (href && redirectError) {
    const history = (globalThis as { history?: { replaceState?: History['replaceState'] } })
      .history;
    history?.replaceState?.(null, '', withoutRedirectError(href));
  }

  const supabase = createSupabaseClient(config, sessionStorage);
  controller = createAuthController({
    auth: supabase.auth,
    devLogin: config.devLogin,
    redirectError,
    redirectUrl: () => {
      const location = (globalThis as { location?: { origin?: string } }).location;
      return `${location?.origin ?? ''}/`;
    },
    startData: async (userId) => {
      await startBackend({ supabase, storage: cacheStorage, userId });
    },
    resetData: async () => {
      await resetLocalData();
      // Also when no engine runs (e.g. it never started): nothing of the cache may remain.
      await cacheStorage.clear();
    },
    storedUser: () => readStoredUser(sessionStorage),
  });
  controller.subscribe(() => {
    for (const listener of appListeners) listener();
  });
  for (const listener of appListeners) listener();
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
