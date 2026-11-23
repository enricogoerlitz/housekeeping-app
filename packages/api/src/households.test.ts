import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { householdCall, startBackend, stopBackend, type Environment } from './backend';
import { householdToRows, membersToRows } from './db/mapping';
import { invitationsForMe, invitationsOfHousehold, readSmallTables } from './households';
import { createInitialState, DEMO_HOUSEHOLD_ID, ENRICO, NADJA } from './seed/demo';
import { createMemoryStorage } from './storage';
import { getState, OfflineError } from './store';
import type { Transport } from './transport';
import { createFakeServer, type FakeServer } from './transport-fake';

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

function environment(): Environment {
  return { isOnline: () => true, isVisible: () => true, subscribe: () => () => undefined };
}

/** Records which household RPCs reached the transport. */
function spied(transport: Transport, calls: string[]): Transport {
  return {
    ...transport,
    createHousehold: (...args) => {
      calls.push('createHousehold');
      return transport.createHousehold(...args);
    },
    inviteMember: (...args) => {
      calls.push('inviteMember');
      return transport.inviteMember(...args);
    },
  };
}

let server: FakeServer;
let calls: string[];

async function signIn(userId: string, wrap: (transport: Transport) => Transport = (t) => t) {
  const engine = await startBackend({
    transport: wrap(spied(server.transport(userId), calls)),
    storage: createMemoryStorage(),
    userId,
    environment: environment(),
  });
  await engine.whenIdle();
  await vi.waitFor(() => expect(Object.keys(getState().households).length).toBeGreaterThan(0));
  return engine;
}

beforeEach(() => {
  server = seededServer();
  calls = [];
});
afterEach(async () => {
  await stopBackend();
});

const create = (name: string) => householdCall((t) => t.createHousehold(name, {}));
const invite = (householdId: string, email: string) =>
  householdCall((t) => t.inviteMember(householdId, email));

describe('householdCall', () => {
  it('AC-010: the result is in the cache when the call resolves', async () => {
    await signIn(ENRICO);
    const id = await create('WG Köln');
    expect(getState().households[id]?.household.memberIds).toEqual([ENRICO]);
  });

  it('offline: refused before anything is sent', async () => {
    const engine = await signIn(ENRICO);
    engine.setSimulatedOffline(true);
    await expect(create('WG Köln')).rejects.toBeInstanceOf(OfflineError);
    expect(calls).toEqual([]);
  });

  it('signed out: fails', async () => {
    await expect(create('WG Köln')).rejects.toThrow('Du bist nicht angemeldet.');
  });
});

describe('invitations', () => {
  it('AC-008: an invited address is an open invitation of the household', async () => {
    await signIn(ENRICO);
    await invite(H, 'lena@example.com');
    const open = invitationsOfHousehold(readSmallTables(), H);
    expect(open.map((invitation) => invitation.email)).toEqual(['lena@example.com']);
    expect(open[0]?.invitedBy).toBe(ENRICO);
  });

  it('the invitee sees the invitation with the household name until accepting it', async () => {
    await signIn(ENRICO);
    const second = await create('WG Köln');
    await invite(second, 'nadja@example.com');
    await stopBackend();

    await signIn(NADJA);
    const mine = invitationsForMe(readSmallTables(), NADJA);
    expect(mine.map((invitation) => invitation.householdName)).toEqual(['WG Köln']);
    const invitation = mine[0];
    if (!invitation) throw new Error('no invitation');
    await householdCall((t) => t.acceptInvitation(invitation.id));
    expect(getState().households[second]).toBeDefined();
    expect(invitationsForMe(readSmallTables(), NADJA)).toEqual([]);
  });

  it('foreign household: invitations of a household I am not in are not mine', async () => {
    await signIn(ENRICO);
    const second = await create('WG Köln');
    await invite(second, 'lena@example.com');
    await stopBackend();

    await signIn(NADJA);
    expect(invitationsOfHousehold(readSmallTables(), second)).toEqual([]);
    expect(invitationsForMe(readSmallTables(), NADJA)).toEqual([]);
  });

  it('invitations to other addresses are not mine (spec 0027: every invitation is open)', () => {
    const small = {
      profiles: [{ id: 'p1', email: 'p1@example.com' }],
      households: [{ id: 'h2', name: 'WG' }],
      household_members: [],
      household_invitations: [{ id: 'i2', household_id: 'h2', email: 'p2@example.com' }],
    };
    expect(invitationsForMe(small, 'p1')).toEqual([]);
    expect(invitationsOfHousehold(small, 'h2').map((invitation) => invitation.id)).toEqual(['i2']);
  });
});
