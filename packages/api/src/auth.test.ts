import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCOUNT_GONE_MESSAGE,
  authErrorMessage,
  createAuthController,
  NOT_INVITED_MESSAGE,
  readAuthConfig,
  readRedirectError,
  SIGN_IN_FAILED_MESSAGE,
  SIGN_OUT_INCOMPLETE_MESSAGE,
  withoutAuthCallback,
  withoutRedirectError,
  type AuthControllerOptions,
  type AuthApi,
  type AuthErrorLike,
  type SessionLike,
} from './auth';
import {
  resetLocalData,
  startBackend,
  stopBackend,
  unsentStoreChangeCount,
  type Environment,
} from './backend';
import { TEST_ACCOUNTS, TEST_PASSWORD } from './dev-accounts';
import { householdToRows, membersToRows } from './db/mapping';
import { createInitialState, DEMO_HOUSEHOLD_ID, ENRICO } from './seed/demo';
import { createMemoryStorage, type Storage } from './storage';
import { getState, peekState, queueStoreAction } from './store';
import { createFakeServer, type FakeServer } from './transport-fake';

const LOCAL_ENV = {
  EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local',
};

describe('readAuthConfig', () => {
  it('reads the public Supabase values; the developer switch is off unless it is "1"', () => {
    expect(readAuthConfig(LOCAL_ENV)).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      publishableKey: 'sb_publishable_local',
      devLogin: false,
    });
    expect(readAuthConfig({ ...LOCAL_ENV, EXPO_PUBLIC_DEV_LOGIN: 'true' }).devLogin).toBe(false);
  });

  it('fails loudly when a required value is missing', () => {
    expect(() => readAuthConfig({ ...LOCAL_ENV, EXPO_PUBLIC_SUPABASE_URL: '' })).toThrow(
      /EXPO_PUBLIC_SUPABASE_URL/,
    );
    expect(() =>
      readAuthConfig({ EXPO_PUBLIC_SUPABASE_URL: LOCAL_ENV.EXPO_PUBLIC_SUPABASE_URL }),
    ).toThrow(/EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    expect(() => readAuthConfig({ ...LOCAL_ENV, EXPO_PUBLIC_SUPABASE_URL: 'not a url' })).toThrow(
      /EXPO_PUBLIC_SUPABASE_URL/,
    );
  });

  it('AC-007: refuses to start with the developer switch against a non-local Supabase', () => {
    expect(() =>
      readAuthConfig({
        EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefgh.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_prod',
        EXPO_PUBLIC_DEV_LOGIN: '1',
      }),
    ).toThrow(/EXPO_PUBLIC_DEV_LOGIN/);
    // A host that merely starts with "localhost" is not local.
    expect(() =>
      readAuthConfig({
        ...LOCAL_ENV,
        EXPO_PUBLIC_SUPABASE_URL: 'https://localhost.example.com',
        EXPO_PUBLIC_DEV_LOGIN: '1',
      }),
    ).toThrow(/EXPO_PUBLIC_DEV_LOGIN/);
  });

  it('AC-006: allows the developer switch against localhost and 127.0.0.1', () => {
    expect(readAuthConfig({ ...LOCAL_ENV, EXPO_PUBLIC_DEV_LOGIN: '1' }).devLogin).toBe(true);
    expect(
      readAuthConfig({
        ...LOCAL_ENV,
        EXPO_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
        EXPO_PUBLIC_DEV_LOGIN: '1',
      }).devLogin,
    ).toBe(true);
  });
});

describe('auth error messages', () => {
  it('AC-002: the hook rejection in the redirect query becomes the German hint', () => {
    expect(
      readRedirectError(
        'http://127.0.0.1:8081/?error=server_error&error_code=unexpected_failure&error_description=not_invited',
      ),
    ).toBe(NOT_INVITED_MESSAGE);
  });

  it('AC-002: the hook rejection in the redirect hash becomes the German hint', () => {
    expect(
      readRedirectError('http://127.0.0.1:8081/#error=access_denied&error_description=not_invited'),
    ).toBe(NOT_INVITED_MESSAGE);
  });

  it('AC-002: the hook rejection as API error (msg) becomes the German hint', () => {
    expect(authErrorMessage({ message: 'not_invited', status: 403 })).toBe(NOT_INVITED_MESSAGE);
    expect(authErrorMessage({ message: 'Hook failed', code: 'not_invited' })).toBe(
      NOT_INVITED_MESSAGE,
    );
  });

  it('any other failure becomes the generic German message', () => {
    expect(readRedirectError('http://127.0.0.1:8081/?error=access_denied')).toBe(
      SIGN_IN_FAILED_MESSAGE,
    );
    expect(authErrorMessage({ message: 'Invalid login credentials', status: 400 })).toBe(
      SIGN_IN_FAILED_MESSAGE,
    );
    expect(authErrorMessage(new Error('boom'))).toBe(SIGN_IN_FAILED_MESSAGE);
  });

  it('a normal start URL carries no error', () => {
    expect(readRedirectError('http://127.0.0.1:8081/liste')).toBeUndefined();
    expect(readRedirectError('http://127.0.0.1:8081/?code=abc')).toBeUndefined();
  });

  it('removes only the error parameters from the URL, keeping path, code and other values', () => {
    expect(
      withoutRedirectError(
        'http://127.0.0.1:8081/liste?x=1&error=server_error&error_code=c&error_description=not_invited',
      ),
    ).toBe('http://127.0.0.1:8081/liste?x=1');
    expect(withoutRedirectError('http://127.0.0.1:8081/#error=a&error_description=b')).toBe(
      'http://127.0.0.1:8081/',
    );
    expect(withoutRedirectError('http://127.0.0.1:8081/?code=abc')).toBe(
      'http://127.0.0.1:8081/?code=abc',
    );
  });

  it('after the code exchange removes code, flow id and error parameters, keeping the rest', () => {
    expect(withoutAuthCallback('http://127.0.0.1:8081/?code=abc&sb_flow_id=f1')).toBe(
      'http://127.0.0.1:8081/',
    );
    expect(withoutAuthCallback('http://127.0.0.1:8081/liste?x=1&code=abc#tab=2')).toBe(
      'http://127.0.0.1:8081/liste?x=1#tab=2',
    );
    expect(
      withoutAuthCallback('http://127.0.0.1:8081/?code=abc&error=server_error&error_description=x'),
    ).toBe('http://127.0.0.1:8081/');
    expect(withoutAuthCallback('http://127.0.0.1:8081/#error=a&error_description=b')).toBe(
      'http://127.0.0.1:8081/',
    );
    expect(withoutAuthCallback('http://127.0.0.1:8081/rezepte?q=dal')).toBe(
      'http://127.0.0.1:8081/rezepte?q=dal',
    );
  });
});

// ---------- controller with a fake Supabase Auth ----------

type Listener = (event: string, session: SessionLike | null) => void;

interface FakeAuth extends AuthApi {
  emit(event: string, session: SessionLike | null): void;
  calls: string[];
  session: SessionLike | null;
  sessionError: AuthErrorLike | null;
  passwordError: AuthErrorLike | null;
  /** What GET /auth/v1/user answers; null = the user exists. */
  userError: AuthErrorLike | null;
  oauthOptions?: { provider: string; options: { redirectTo: string } };
}

function session(id: string, email = `${id}@example.com`): SessionLike {
  return { user: { id, email } };
}

function fakeAuth(): FakeAuth {
  const listeners = new Set<Listener>();
  const fake: FakeAuth = {
    calls: [],
    session: null,
    sessionError: null,
    passwordError: null,
    userError: null,
    emit(event, value) {
      fake.session = value;
      for (const listener of listeners) listener(event, value);
    },
    async getSession() {
      fake.calls.push('getSession');
      return {
        data: { session: fake.sessionError ? null : fake.session },
        error: fake.sessionError,
      };
    },
    async getUser() {
      fake.calls.push('getUser');
      if (fake.userError) return { data: { user: null }, error: fake.userError };
      return { data: { user: fake.session ? { id: fake.session.user.id } : null }, error: null };
    },
    onAuthStateChange(callback) {
      listeners.add(callback);
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    },
    async signInWithOAuth(credentials) {
      fake.calls.push('signInWithOAuth');
      fake.oauthOptions = credentials;
      return { error: null };
    },
    async signInWithPassword(credentials) {
      fake.calls.push(`signInWithPassword:${credentials.email}:${credentials.password}`);
      if (fake.passwordError) return { data: { session: null }, error: fake.passwordError };
      const account = TEST_ACCOUNTS.find((candidate) => candidate.email === credentials.email);
      const value = session(account?.key ?? 'unknown', credentials.email);
      fake.emit('SIGNED_IN', value);
      return { data: { session: value }, error: null };
    },
    async signOut(options) {
      fake.calls.push(`signOut:${options.scope}`);
      fake.emit('SIGNED_OUT', null);
      return { error: null };
    },
  };
  return fake;
}

/** Lets queued promise chains run. */
async function flush(): Promise<void> {
  for (let round = 0; round < 20; round += 1) await Promise.resolve();
}

describe('createAuthController', () => {
  let auth: FakeAuth;
  let started: string[];
  let resets: number;

  function controller(
    options: { devLogin?: boolean; redirectError?: string } & Partial<AuthControllerOptions> = {},
  ) {
    return createAuthController({
      auth,
      devLogin: options.devLogin ?? false,
      redirectUrl: () => 'http://127.0.0.1:8081/',
      startData: async (userId) => {
        started.push(userId);
      },
      resetData: async () => {
        resets += 1;
        auth.calls.push('resetData');
      },
      storedUser: async () => undefined,
      ...options,
    });
  }

  /** A marker in memory, like the one startAuth keeps in localStorage. */
  function memoryMarker() {
    let value = false;
    return {
      isSet: async () => value,
      set: async () => {
        value = true;
      },
      unset: async () => {
        value = false;
      },
    };
  }

  beforeEach(() => {
    auth = fakeAuth();
    started = [];
    resets = 0;
  });

  it('starts in "loading"', () => {
    expect(controller().getState().status).toBe('loading');
  });

  it('signed out: no session → login screen, no data is loaded', async () => {
    const control = controller();
    await control.start();
    expect(control.getState()).toEqual({ status: 'signedOut' });
    expect(started).toEqual([]);
  });

  it('AC-001: a stored session → signed in, the data of this user is loaded once', async () => {
    auth.session = session('enrico');
    const control = controller();
    await control.start();
    auth.emit('INITIAL_SESSION', session('enrico'));
    auth.emit('TOKEN_REFRESHED', session('enrico'));
    await flush();
    expect(control.getState()).toEqual({
      status: 'signedIn',
      user: { id: 'enrico', email: 'enrico@example.com' },
    });
    expect(started).toEqual(['enrico']);
  });

  it('AC-004: offline with an expired token the stored session still opens the app', async () => {
    auth.sessionError = { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 };
    const control = createAuthController({
      auth,
      devLogin: false,
      redirectUrl: () => 'http://127.0.0.1:8081/',
      startData: async (userId) => {
        started.push(userId);
      },
      resetData: async () => undefined,
      storedUser: async () => ({ id: 'enrico', email: 'enrico@example.com' }),
    });
    await control.start();
    expect(control.getState().status).toBe('signedIn');
    expect(started).toEqual(['enrico']);
  });

  it('a session the server rejected (not a network failure) → signed out', async () => {
    auth.sessionError = { name: 'AuthApiError', message: 'Invalid Refresh Token', status: 400 };
    const control = createAuthController({
      auth,
      devLogin: false,
      redirectUrl: () => 'http://127.0.0.1:8081/',
      startData: async (userId) => {
        started.push(userId);
      },
      resetData: async () => undefined,
      storedUser: async () => ({ id: 'enrico', email: 'enrico@example.com' }),
    });
    await control.start();
    expect(control.getState().status).toBe('signedOut');
    expect(started).toEqual([]);
  });

  it('AC-002: not invited → login screen with the German hint, no data loaded', async () => {
    const control = controller({ redirectError: NOT_INVITED_MESSAGE });
    await control.start();
    expect(control.getState()).toEqual({ status: 'signedOut', error: NOT_INVITED_MESSAGE });
    expect(started).toEqual([]);
  });

  it('signs in with Google and comes back to this address', async () => {
    const control = controller();
    await control.start();
    await control.signInWithGoogle();
    expect(auth.oauthOptions).toEqual({
      provider: 'google',
      options: { redirectTo: 'http://127.0.0.1:8081/' },
    });
  });

  it('AC-007: without the developer switch a test account cannot sign in', async () => {
    const control = controller({ devLogin: false });
    await control.start();
    await expect(control.signInWithTestAccount('enrico')).rejects.toThrow(/EXPO_PUBLIC_DEV_LOGIN/);
    expect(auth.calls.some((call) => call.startsWith('signInWithPassword'))).toBe(false);
  });

  it('AC-006: with the developer switch the test account signs in with its password', async () => {
    const control = controller({ devLogin: true });
    await control.start();
    await control.signInWithTestAccount('enrico');
    await flush();
    expect(auth.calls).toContain(`signInWithPassword:enrico.test@example.com:${TEST_PASSWORD}`);
    expect(control.getState().status).toBe('signedIn');
    expect(started).toEqual(['enrico']);
  });

  it('a failed sign-in shows the German message and stays on the login screen', async () => {
    auth.passwordError = { name: 'AuthApiError', message: 'not_invited', status: 403 };
    const control = controller({ devLogin: true });
    await control.start();
    await control.signInWithTestAccount('nadja');
    expect(control.getState()).toEqual({ status: 'signedOut', error: NOT_INVITED_MESSAGE });
    expect(started).toEqual([]);
  });

  it('AC-003: sign-out clears the local data first, then the session', async () => {
    auth.session = session('enrico');
    const control = controller();
    await control.start();
    await control.signOut();
    await flush();
    expect(auth.calls.filter((call) => call !== 'getSession' && call !== 'getUser')).toEqual([
      'resetData',
      'signOut:local',
    ]);
    expect(control.getState()).toEqual({ status: 'signedOut' });
  });

  it('AC-003: the session is removed even when clearing the local data fails, and says so', async () => {
    auth.session = session('enrico');
    const marker = memoryMarker();
    const control = controller({
      clearMarker: marker,
      resetData: async () => {
        auth.calls.push('resetData');
        throw new Error('IndexedDB is broken');
      },
    });
    await control.start();
    await control.signOut();
    await flush();
    expect(auth.calls).toContain('signOut:local');
    expect(control.getState()).toEqual({ status: 'signedOut', error: SIGN_OUT_INCOMPLETE_MESSAGE });
    expect(await marker.isSet()).toBe(true);
  });

  it('AC-003: clearing that failed at sign-out is retried on the next start', async () => {
    const marker = memoryMarker();
    await marker.set();
    const control = controller({ clearMarker: marker });
    await control.start();
    expect(auth.calls.slice(0, 2)).toEqual(['resetData', 'getSession']);
    expect(await marker.isSet()).toBe(false);
    expect(control.getState()).toEqual({ status: 'signedOut' });
  });

  it('a deleted account: the stored session is dropped, the data cleared, the login says why', async () => {
    auth.session = session('enrico');
    auth.userError = {
      name: 'AuthApiError',
      message: 'User from sub claim in JWT does not exist',
      code: 'user_not_found',
      status: 403,
    };
    const control = controller();
    await control.start();
    await vi.waitFor(() =>
      expect(control.getState()).toEqual({ status: 'signedOut', error: ACCOUNT_GONE_MESSAGE }),
    );
    expect(started).toEqual(['enrico']);
    expect(resets).toBe(1);
    expect(auth.calls).toContain('signOut:local');
  });

  it('the account check failing for lack of network keeps the user signed in', async () => {
    auth.session = session('enrico');
    auth.userError = { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 };
    const control = controller();
    await control.start();
    await control.checkAccount();
    await flush();
    expect(control.getState().status).toBe('signedIn');
    expect(resets).toBe(0);
  });

  it('the account check runs again on demand (back online) and signs out a deleted account', async () => {
    auth.session = session('enrico');
    const control = controller();
    await control.start();
    await flush();
    expect(control.getState().status).toBe('signedIn');
    auth.userError = { name: 'AuthApiError', message: 'gone', code: 'user_not_found', status: 403 };
    await control.checkAccount();
    await flush();
    expect(control.getState()).toEqual({ status: 'signedOut', error: ACCOUNT_GONE_MESSAGE });
  });

  it('a pull without the own profile signs out the account that no longer exists', async () => {
    auth.session = session('enrico');
    const control = controller();
    await control.start();
    await flush();
    control.accountMissing('someone-else');
    await flush();
    expect(control.getState().status).toBe('signedIn');
    control.accountMissing('enrico');
    await vi.waitFor(() =>
      expect(control.getState()).toEqual({ status: 'signedOut', error: ACCOUNT_GONE_MESSAGE }),
    );
    expect(resets).toBe(1);
  });

  it('a "code" in the address that gave no session shows the generic error; the URL is cleaned', async () => {
    const cleaned: string[] = [];
    const control = controller({
      authCodeInUrl: true,
      cleanUrl: () => {
        cleaned.push(auth.calls.join(','));
      },
    });
    await control.start();
    expect(control.getState()).toEqual({ status: 'signedOut', error: SIGN_IN_FAILED_MESSAGE });
    // Only after supabase-js had its chance to exchange the code (getSession waits for it).
    expect(cleaned).toEqual(['getSession']);
  });

  it('a "code" in the address after a successful exchange: signed in, the URL is cleaned', async () => {
    auth.session = session('enrico');
    let cleaned = 0;
    const control = controller({
      authCodeInUrl: true,
      cleanUrl: () => {
        cleaned += 1;
      },
    });
    await control.start();
    expect(control.getState().status).toBe('signedIn');
    expect(cleaned).toBe(1);
  });

  it('another user signing in on this device: the previous data is cleared before loading', async () => {
    auth.session = session('enrico');
    const control = controller();
    await control.start();
    auth.emit('SIGNED_IN', session('nadja'));
    await flush();
    expect(resets).toBe(1);
    expect(started).toEqual(['enrico', 'nadja']);
    expect(control.getState().user?.id).toBe('nadja');
  });

  it('a session ending elsewhere (signed out in another tab) clears the local data', async () => {
    auth.session = session('enrico');
    const control = controller();
    await control.start();
    auth.emit('SIGNED_OUT', null);
    await flush();
    expect(resets).toBe(1);
    expect(control.getState().status).toBe('signedOut');
  });
});

// ---------- sign-out against the real engine (AC-003) ----------

const H = DEMO_HOUSEHOLD_ID;

function seededServer(): FakeServer {
  const server = createFakeServer();
  const state = createInitialState('2026-11-20');
  const seeded = state.households[H];
  if (!seeded) throw new Error('demo household missing');
  const articles = seeded.articles.filter(
    (article, index) => seeded.articles.findIndex((other) => other.id === article.id) === index,
  );
  for (const profile of membersToRows(state.members).profiles ?? []) {
    server.addProfile({
      id: profile.id,
      name: String(profile.name),
      email: `${String(profile.name).toLowerCase()}@example.com`,
    });
  }
  const {
    households,
    household_members: members,
    ...tables
  } = householdToRows({
    ...seeded,
    articles,
  });
  const household = households?.[0];
  if (!household || !members) throw new Error('fixture');
  server.addHousehold(
    household,
    members.map((member) => String(member.profile_id)),
  );
  server.insertRows(H, tables);
  return server;
}

function offlineEnvironment(): Environment & { setOnline(value: boolean): void } {
  let online = true;
  return {
    isOnline: () => online,
    isVisible: () => true,
    subscribe: () => () => undefined,
    setOnline(value) {
      online = value;
    },
  };
}

describe('AC-003: sign-out with the real engine', () => {
  let server: FakeServer;
  let storage: Storage;

  beforeEach(() => {
    server = seededServer();
    storage = createMemoryStorage();
  });
  afterEach(async () => {
    await stopBackend();
  });

  function realController(auth: FakeAuth, environment: Environment) {
    return createAuthController({
      auth,
      devLogin: false,
      redirectUrl: () => 'http://127.0.0.1:8081/',
      startData: async (userId) => {
        await startBackend({ transport: server.transport(userId), storage, userId, environment });
      },
      resetData: async () => {
        await resetLocalData();
        await storage.clear();
      },
      storedUser: async () => undefined,
    });
  }

  it('AC-003: cache and store queue are empty after sign-out, even with a check waiting offline', async () => {
    const auth = fakeAuth();
    auth.session = session(ENRICO);
    const environment = offlineEnvironment();
    const control = realController(auth, environment);
    await control.start();
    await vi.waitFor(async () => expect(await storage.get(`household:${H}`)).toBeDefined());

    environment.setOnline(false);
    const item = getState().households[H]?.items.find((candidate) => !candidate.checked);
    if (!item) throw new Error('fixture: no open item');
    queueStoreAction({ kind: 'check', itemId: item.id, checked: true });
    await vi.waitFor(async () => expect(await storage.get('queue')).toHaveLength(1));

    await control.signOut();
    expect(await storage.get('meta')).toBeUndefined();
    expect(await storage.get('queue')).toBeUndefined();
    expect(await storage.get(`household:${H}`)).toBeUndefined();
    expect(peekState()).toBeUndefined();
    expect(control.getState().status).toBe('signedOut');
  });

  /** Signed in, then offline with `count` checks waiting in the store queue. */
  async function signedInWithWaitingChecks(count: number) {
    const auth = fakeAuth();
    auth.session = session(ENRICO);
    const environment = offlineEnvironment();
    const control = realController(auth, environment);
    await control.start();
    await vi.waitFor(async () => expect(await storage.get(`household:${H}`)).toBeDefined());
    environment.setOnline(false);
    const open = getState().households[H]?.items.filter((item) => !item.checked) ?? [];
    if (open.length < count) throw new Error('fixture: not enough open items');
    for (const item of open.slice(0, count)) {
      queueStoreAction({ kind: 'check', itemId: item.id, checked: true });
    }
    if (count > 0) {
      await vi.waitFor(async () => expect(await storage.get('queue')).toHaveLength(count));
    }
    return control;
  }

  it('spec 0018, AC-013: three checks waiting offline count as 3 unsent changes', async () => {
    await signedInWithWaitingChecks(3);
    expect(unsentStoreChangeCount()).toBe(3);
  });

  it('spec 0018, AC-013: asking ("Abbrechen") changes nothing: signed in, the 3 still queued', async () => {
    const control = await signedInWithWaitingChecks(3);
    // The app only reads the count before asking; nothing is cleared until the confirmation.
    unsentStoreChangeCount();
    expect(control.getState().status).toBe('signedIn');
    expect(await storage.get('queue')).toHaveLength(3);
    expect(unsentStoreChangeCount()).toBe(3);
  });

  it('spec 0018, AC-014: with an empty queue nothing is unsent', async () => {
    await signedInWithWaitingChecks(0);
    expect(unsentStoreChangeCount()).toBe(0);
  });

  it('spec 0018, AC-015: "Trotzdem abmelden" is the old sign-out: queue and cache gone', async () => {
    const control = await signedInWithWaitingChecks(3);
    await control.signOut();
    expect(unsentStoreChangeCount()).toBe(0);
    expect(await storage.get('queue')).toBeUndefined();
    expect(await storage.get(`household:${H}`)).toBeUndefined();
    expect(control.getState().status).toBe('signedOut');
  });

  it('spec 0018, AC-014: signed out there is nothing to count', () => {
    expect(unsentStoreChangeCount()).toBe(0);
  });

  it('another user on the same device never sees the previous cache', async () => {
    const auth = fakeAuth();
    auth.session = session(ENRICO);
    const control = realController(auth, offlineEnvironment());
    await control.start();
    await vi.waitFor(async () => expect(await storage.get(`household:${H}`)).toBeDefined());

    // A stranger (no household) signs in on the same device.
    server.addProfile({ id: 'stranger', name: 'Fremd', email: 'fremd@example.com' });
    auth.emit('SIGNED_IN', session('stranger'));
    await vi.waitFor(() => expect(control.getState().user?.id).toBe('stranger'));
    await vi.waitFor(async () => expect((await storage.get('meta')) as unknown).toBeDefined());
    expect(await storage.get(`household:${H}`)).toBeUndefined();
    expect(Object.keys(getState().households)).toEqual([]);
  });
});

describe('AC-001/AC-006: the household shown after sign-in', () => {
  afterEach(async () => {
    await stopBackend();
  });

  it('is the one joined first, whatever order the server lists them in', async () => {
    const server = seededServer();
    // Joined later, sorts first by name and is listed first by the server.
    const later = await server.transport(ENRICO).createHousehold('Aaa', {});
    const transport = server.transport(ENRICO);
    await startBackend({
      transport: {
        ...transport,
        syncPull: async (request) => {
          const result = await transport.syncPull(request);
          const members = [...(result.small.household_members ?? [])].reverse();
          return { ...result, small: { ...result.small, household_members: members } };
        },
      },
      storage: createMemoryStorage(),
      userId: ENRICO,
      environment: offlineEnvironment(),
    });
    await vi.waitFor(() => expect(Object.keys(getState().households)).toHaveLength(2));
    expect(getState().households[later]).toBeDefined();
    expect(getState().activeHouseholdId).toBe(H);
  });
});
