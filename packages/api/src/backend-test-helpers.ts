// Shared setup for the backend-mode tests: a fake server seeded with the demo household, a fake
// platform environment, Enrico's device attached to the store (so commands run against it) and
// Nadja's device as a second, passive engine. Not exported from index.ts.
import { afterEach, beforeEach, vi } from 'vitest';

import { createEngine, startBackend, stopBackend, type Engine, type Environment } from './backend';
import { householdToRows, membersToRows } from './db/mapping';
import { createInitialState, DEMO_HOUSEHOLD_ID, ENRICO, NADJA } from './seed/demo';
import { createMemoryStorage, type Storage } from './storage';
import type { HouseholdData } from './store';
import type { Transport } from './transport';
import { createFakeServer, type FakeServer } from './transport-fake';

export const H = DEMO_HOUSEHOLD_ID;
export const TODAY = '2026-11-20';

export function seededServer(): FakeServer {
  const server = createFakeServer();
  const state = createInitialState(TODAY);
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
      color: String(profile.color),
    });
  }
  const rows = householdToRows({ ...seeded, articles });
  const { households, household_members: members, ...tables } = rows;
  const household = households?.[0];
  if (!household || !members) throw new Error('fixture');
  server.addHousehold(
    household,
    members.map((member) => String(member.profile_id)),
  );
  server.insertRows(H, tables);
  return server;
}

export interface FakeEnvironment extends Environment {
  setOnline(online: boolean): void;
  foreground(): void;
}

export function fakeEnvironment(): FakeEnvironment {
  let online = true;
  const listeners = new Set<Parameters<Environment['subscribe']>[0]>();
  return {
    isOnline: () => online,
    isVisible: () => true,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setOnline(value) {
      online = value;
      for (const listener of listeners) (value ? listener.online : listener.offline)?.();
    },
    foreground() {
      for (const listener of listeners) listener.foreground?.();
    },
  };
}

/** One call a device made to the server (pulls and realtime subscriptions are left out). */
export interface Call {
  fn: keyof Transport;
  args: unknown[];
}

/** Records every write and request a device sends, in order. */
export function recordCalls(inner: Transport): { transport: Transport; calls: Call[] } {
  const calls: Call[] = [];
  const transport = new Proxy(inner, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        if (property !== 'syncPull' && property !== 'subscribe') {
          calls.push({ fn: property as keyof Transport, args });
        }
        return (value as (...values: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { transport, calls };
}

export interface BackendFixture {
  readonly server: FakeServer;
  readonly environment: FakeEnvironment;
  readonly storage: Storage;
  /** Everything Enrico's device sent since the last `startEnrico` or `clearCalls`. */
  readonly calls: Call[];
  clearCalls(): void;
  startEnrico(): Promise<Engine>;
  startNadja(): Promise<Engine>;
  /** Lets timers, outbox and pulls run until every given engine is idle. */
  settle(...engines: Engine[]): Promise<void>;
  nadjaData(engine: Engine): HouseholdData;
}

/** Registers the fake server and devices for every test of the calling file. */
export function withBackend(): BackendFixture {
  let server: FakeServer | undefined;
  let environment: FakeEnvironment | undefined;
  let storage: Storage | undefined;
  let calls: Call[] = [];
  const passive: Engine[] = [];
  const need = <T>(value: T | undefined): T => {
    if (value === undefined) throw new Error('withBackend() is only usable inside a test');
    return value;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T10:00:00Z'));
    server = seededServer();
    environment = fakeEnvironment();
    storage = createMemoryStorage();
    calls = [];
  });

  afterEach(async () => {
    for (const engine of passive.splice(0)) engine.stop();
    await stopBackend();
    vi.useRealTimers();
  });

  const fixture: BackendFixture = {
    get server() {
      return need(server);
    },
    get environment() {
      return need(environment);
    },
    get storage() {
      return need(storage);
    },
    get calls() {
      return calls;
    },
    clearCalls() {
      calls.length = 0;
    },
    async settle(...engines) {
      for (let round = 0; round < 6; round += 1) {
        await vi.advanceTimersByTimeAsync(400);
        for (const engine of engines) await engine.whenIdle();
      }
    },
    async startEnrico() {
      const recorded = recordCalls(fixture.server.transport(ENRICO));
      calls = recorded.calls;
      const engine = await startBackend({
        transport: recorded.transport,
        storage: fixture.storage,
        userId: ENRICO,
        environment: fixture.environment,
      });
      await fixture.settle(engine);
      fixture.clearCalls();
      return engine;
    },
    async startNadja() {
      const engine = createEngine({
        transport: fixture.server.transport(NADJA),
        storage: createMemoryStorage(),
        userId: NADJA,
        environment: fakeEnvironment(),
      });
      passive.push(engine);
      await engine.start();
      await fixture.settle(engine);
      return engine;
    },
    nadjaData(engine) {
      const data = engine.getState()?.households[H];
      if (!data) throw new Error('Nadja has no data');
      return data;
    },
  };
  return fixture;
}
