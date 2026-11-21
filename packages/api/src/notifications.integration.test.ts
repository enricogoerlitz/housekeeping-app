// Notifications against the running local stack (spec 0013): a change of the own settings reaches
// another device of the same person and never Nadja's row; a device is registered, listed without
// its address, can be removed only by its owner; signed-out calls are refused; "Probe senden"
// without the Vault entries says push_not_configured. Every test puts back what it changed.
// Skipped unless SUPABASE_LOCAL=1, e.g.
//
//   set -a; . ./.env; set +a; SUPABASE_LOCAL=1 \
//     pnpm --filter @housekeeping/api exec vitest run src/notifications.integration.test.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';

import { createEngine, startBackend, stopBackend, type Environment } from './backend';
import {
  listPushDevices,
  registerDevicePush,
  removePushDevice,
  sendTestPush,
  unregisterDevicePush,
  updateNotificationSettings,
} from './commands-notifications';
import { TEST_ACCOUNTS, TEST_PASSWORD } from './dev-accounts';
import { DEMO_HOUSEHOLD_ID } from './seed/demo';
import { seedHouseholdId } from './seed/seed-sql';
import { createMemoryStorage } from './storage';
import { getData } from './store';
import { TransportError, type Transport } from './transport';
import { createSupabaseTransport, fromSupabaseClient } from './transport-supabase';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const enabled = env?.SUPABASE_LOCAL === '1';
const url = env?.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = env?.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
/** With a push secret, db:reset fills the Vault (plan 0013, Task 7): then a probe is really sent. */
const vaultFilled = env?.PUSH_SEND_SECRET !== undefined && env.PUSH_SEND_SECRET !== '';

const online: Environment = {
  isOnline: () => true,
  isVisible: () => true,
  subscribe: () => () => {},
};

const chrome = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/integration-test-chrome',
  p256dh: `B${'a'.repeat(86)}`,
  auth: 'abcdefghijklmnopqrstuv',
  deviceLabel: 'Mac · Chrome',
};

async function signedIn(index: number): Promise<{ client: SupabaseClient; userId: string }> {
  const account = TEST_ACCOUNTS[index];
  if (!url || !key || !account) throw new Error('local stack configuration missing');
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({
    email: account.email,
    password: TEST_PASSWORD,
  });
  if (error || !data.user) throw new Error('sign-in failed');
  return { client, userId: data.user.id };
}

const transportOf = (client: SupabaseClient): Transport => ({
  ...createSupabaseTransport(fromSupabaseClient(client)),
  subscribe: () => () => {},
});

async function startAs(user: { client: SupabaseClient; userId: string }) {
  const engine = await startBackend({
    transport: transportOf(user.client),
    storage: createMemoryStorage(),
    userId: user.userId,
    environment: online,
  });
  await engine.pull();
  await engine.whenIdle();
  return engine;
}

/** A second, passive device of the same or another person. */
async function deviceOf(user: { client: SupabaseClient; userId: string }) {
  const engine = createEngine({
    transport: transportOf(user.client),
    storage: createMemoryStorage(),
    userId: user.userId,
    environment: online,
  });
  await engine.start();
  await engine.pull();
  await engine.whenIdle();
  return engine;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof TransportError ? error.code : String(error);
  }
  return 'resolved';
}

afterEach(async () => {
  await stopBackend();
});

describe.skipIf(!enabled)('spec 0013: notifications in the local stack', () => {
  it('AC-012, AC-013: a settings patch reaches Enrico’s other device and never Nadja’s row', async () => {
    const enrico = await signedIn(0);
    const nadja = await signedIn(1);
    const householdId = await seedHouseholdId(DEMO_HOUSEHOLD_ID);
    const engine = await startAs(enrico);
    const before = getData().notificationSettings;
    if (!before) throw new Error('Enrico has no settings row');
    expect(before).toMatchObject({ memberId: enrico.userId, dailySummaryEnabled: false });
    const second = await deviceOf(enrico);
    const nadjaDevice = await deviceOf(nadja);
    try {
      updateNotificationSettings({
        dailySummaryEnabled: true,
        dailySummaryAt: '06:45',
        dailySummaryParts: ['meals', 'chores'],
      });
      await engine.whenIdle();
      await second.pull();
      expect(second.getState()?.households[householdId]?.notificationSettings).toMatchObject({
        id: before.id,
        dailySummaryEnabled: true,
        dailySummaryAt: '06:45',
        dailySummaryParts: ['meals', 'chores'],
      });
      await nadjaDevice.pull();
      const nadjaSettings = nadjaDevice.getState()?.households[householdId]?.notificationSettings;
      expect(nadjaSettings).toMatchObject({ memberId: nadja.userId, dailySummaryEnabled: false });
      expect(nadjaSettings?.id).not.toBe(before.id);

      // AC-013: Nadja cannot touch Enrico's row; nobody moves a row or changes the time zone.
      const asNadja = transportOf(nadja.client);
      expect(
        await codeOf(
          asNadja.applyChanges(householdId, [
            {
              kind: 'patch',
              table: 'notification_settings',
              id: before.id,
              changes: { daily_summary_enabled: false },
            },
          ]),
        ),
      ).toBe('row_not_found');
      const asEnrico = transportOf(enrico.client);
      expect(
        await codeOf(
          asEnrico.applyChanges(householdId, [
            {
              kind: 'patch',
              table: 'notification_settings',
              id: before.id,
              changes: { member_id: nadja.userId },
            },
          ]),
        ),
      ).toBe('invalid_change');
      expect(
        await codeOf(
          asEnrico.applyChanges(householdId, [
            { kind: 'delete', table: 'notification_settings', id: before.id },
          ]),
        ),
      ).toBe('invalid_change');
      expect(
        await codeOf(
          asEnrico.applyChanges(householdId, [
            { kind: 'patch', table: 'households', id: householdId, changes: { timezone: 'UTC' } },
          ]),
        ),
      ).toBe('invalid_change');
    } finally {
      updateNotificationSettings({
        dailySummaryEnabled: before.dailySummaryEnabled,
        dailySummaryAt: before.dailySummaryAt,
        dailySummaryParts: before.dailySummaryParts,
      });
      await engine.whenIdle();
      second.stop();
      nadjaDevice.stop();
    }
  });

  it('AC-004, AC-041, AC-043: a device is listed without its address; only its owner removes it', async () => {
    const enrico = await signedIn(0);
    const nadja = await signedIn(1);
    await startAs(enrico);
    try {
      const id = await registerDevicePush(chrome);
      const devices = await listPushDevices(chrome.endpoint);
      expect(devices.find((device) => device.id === id)).toMatchObject({
        label: 'Mac · Chrome',
        status: 'active',
        isCurrent: true,
      });
      expect(JSON.stringify(devices)).not.toContain(chrome.endpoint);
      expect(JSON.stringify(devices)).not.toContain(chrome.p256dh);

      const asNadja = transportOf(nadja.client);
      expect((await asNadja.listPushSubscriptions()).some((row) => row.id === id)).toBe(false);
      expect(await asNadja.removePushSubscription(id)).toBe(false);
      expect(await codeOf(asNadja.setPushSubscriptionEnabled(chrome.endpoint, false))).toBe(
        'not_found',
      );
      expect((await listPushDevices(chrome.endpoint)).some((device) => device.id === id)).toBe(
        true,
      );

      // AC-044: a local address is refused, nothing is stored.
      expect(
        await codeOf(registerDevicePush({ ...chrome, endpoint: 'http://127.0.0.1:54321/x' })),
      ).toBe('invalid_subscription');

      expect(await removePushDevice(id)).toBe(true);
      expect((await listPushDevices(chrome.endpoint)).some((device) => device.id === id)).toBe(
        false,
      );
    } finally {
      await unregisterDevicePush(chrome.endpoint);
    }
  });

  it('AC-043: a signed-out client is refused for every device RPC (no grant to anon)', async () => {
    const anonymous = transportOf(createClient(url, key, { auth: { persistSession: false } }));
    const refused = ['42501', 'not_authenticated'];
    const calls = [
      () => anonymous.registerPushSubscription(chrome.endpoint, chrome.p256dh, chrome.auth, 'Mac'),
      () => anonymous.setPushSubscriptionEnabled(chrome.endpoint, true),
      () => anonymous.unregisterPushSubscription(chrome.endpoint),
      () => anonymous.removePushSubscription(crypto.randomUUID()),
      () => anonymous.listPushSubscriptions(),
      () => anonymous.sendTestPush(chrome.endpoint),
    ];
    for (const call of calls) expect(refused).toContain(await codeOf(call()));
  });

  it.skipIf(vaultFilled)(
    'REQ-003: "Probe senden" without the Vault entries answers push_not_configured',
    async () => {
      const enrico = await signedIn(0);
      await startAs(enrico);
      try {
        await registerDevicePush(chrome);
        expect(await codeOf(sendTestPush(chrome.endpoint))).toBe('push_not_configured');
      } finally {
        await unregisterDevicePush(chrome.endpoint);
      }
    },
  );
});
