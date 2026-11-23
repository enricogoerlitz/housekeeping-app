import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthErrorLike, SessionLike } from './auth';
import { createMemoryStorage } from './storage';

// startAuth wires the controller to the real Supabase client, the backend and the browser (spec
// 0031, REQ-011, T-09). The controller itself is tested in auth.test.ts; here only the wiring.

type AuthEvent = (event: string, session: SessionLike | null) => void;

const fake = vi.hoisted(() => ({
  session: null as SessionLike | null,
  getUserError: null as AuthErrorLike | null,
  getUser: vi.fn(),
  signOut: vi.fn(),
  startBackend: vi.fn(),
  resetLocalData: vi.fn(),
  onChange: undefined as AuthEvent | undefined,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: fake.session }, error: null }),
      getUser: fake.getUser,
      signOut: fake.signOut,
      onAuthStateChange: (callback: AuthEvent) => {
        fake.onChange = callback;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));

vi.mock('./backend', async (importActual) => ({
  ...(await importActual<typeof import('./backend')>()),
  startBackend: fake.startBackend,
  resetLocalData: fake.resetLocalData,
}));

const CONFIG = {
  supabaseUrl: 'http://127.0.0.1:54321',
  publishableKey: 'sb_publishable_local',
  devLogin: false,
};
const ENRICO: SessionLike = { user: { id: 'u-enrico', email: 'enrico@example.org' } };

/** The browser window's events, for `online`; new per test, so earlier controllers hear nothing. */
let windowEvents = new EventTarget();
const target = globalThis as {
  addEventListener?: EventTarget['addEventListener'];
  removeEventListener?: EventTarget['removeEventListener'];
};

/** A fresh module: startAuth starts once per app. */
async function freshAuth() {
  vi.resetModules();
  return import('./auth');
}

async function settle(until: () => boolean): Promise<void> {
  await vi.waitFor(() => {
    if (!until()) throw new Error('not yet');
  });
}

beforeEach(() => {
  fake.session = ENRICO;
  fake.getUserError = null;
  fake.getUser.mockReset().mockImplementation(async () => ({ error: fake.getUserError }));
  fake.signOut.mockReset().mockResolvedValue({ error: null });
  fake.startBackend.mockReset().mockResolvedValue(undefined);
  fake.resetLocalData.mockReset().mockResolvedValue(undefined);
  windowEvents = new EventTarget();
  target.addEventListener = windowEvents.addEventListener.bind(windowEvents);
  target.removeEventListener = windowEvents.removeEventListener.bind(windowEvents);
});

afterEach(() => {
  delete target.addEventListener;
  delete target.removeEventListener;
});

describe('startAuth', () => {
  it('loads the cache of the signed-in user into the given storage', async () => {
    const auth = await freshAuth();
    const cacheStorage = createMemoryStorage();
    const controller = auth.startAuth(CONFIG, { cacheStorage });
    await settle(() => controller.getState().status === 'signedIn');
    expect(fake.startBackend).toHaveBeenCalledWith(
      expect.objectContaining({ storage: cacheStorage, userId: 'u-enrico' }),
    );
    expect(auth.startAuth(CONFIG)).toBe(controller);
  });

  it('AC-030: signing out clears the local data and the cache storage', async () => {
    const auth = await freshAuth();
    const cacheStorage = createMemoryStorage();
    const clear = vi.spyOn(cacheStorage, 'clear');
    const controller = auth.startAuth(CONFIG, { cacheStorage });
    await settle(() => controller.getState().status === 'signedIn');
    await auth.signOut();
    expect(fake.resetLocalData).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(controller.getState()).toEqual({ status: 'signedOut' });
  });

  it('AC-030: an "online" event checks whether the account still exists', async () => {
    const auth = await freshAuth();
    const controller = auth.startAuth(CONFIG, { cacheStorage: createMemoryStorage() });
    await settle(() => controller.getState().status === 'signedIn');
    await settle(() => fake.getUser.mock.calls.length === 1);
    fake.getUserError = {
      code: 'user_not_found',
      message: 'User from sub claim in JWT does not exist',
    };
    windowEvents.dispatchEvent(new Event('online'));
    await settle(() => controller.getState().status === 'signedOut');
    expect(fake.getUser).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toEqual({
      status: 'signedOut',
      error: auth.ACCOUNT_GONE_MESSAGE,
    });
  });

  it('signed out at start: no backend, the login shows', async () => {
    fake.session = null;
    const auth = await freshAuth();
    const controller = auth.startAuth(CONFIG, { cacheStorage: createMemoryStorage() });
    await settle(() => controller.getState().status === 'signedOut');
    expect(fake.startBackend).not.toHaveBeenCalled();
  });

  it('the sign-in calls fail before startAuth', async () => {
    const auth = await freshAuth();
    expect(() => auth.signOut()).toThrow('startAuth() has not been called');
  });
});
