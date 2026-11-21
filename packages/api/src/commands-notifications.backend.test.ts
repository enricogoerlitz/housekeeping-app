// Notification commands (spec 0013): the own settings row on the diff path (created by the
// server, only patched), the devices over their RPCs, online only. "Deine Geräte" is read from
// the server, never from the cache, and never carries a push address or a key (ADR-0014).
import { describe, expect, it } from 'vitest';

import { createEngine } from './backend';
import { H, withBackend } from './backend-test-helpers';
import {
  listPushDevices,
  PUSH_MESSAGES,
  pushRejectedMessage,
  registerDevicePush,
  removePushDevice,
  sendTestPush,
  setDevicePushEnabled,
  unregisterDevicePush,
  updateNotificationSettings,
} from './commands-notifications';
import { ENRICO, NADJA } from './seed/demo';
import { createMemoryStorage } from './storage';
import { getData, OfflineError } from './store';
import { TransportError } from './transport';

const fx = withBackend();

const key = (char: string) => `B${char.repeat(86)}`;
const AUTH = 'abcdefghijklmnopqrstuv';
const chrome = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/chrome-enrico',
  p256dh: key('a'),
  auth: AUTH,
  deviceLabel: 'Mac · Chrome',
};
const firefox = {
  endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/firefox-enrico',
  p256dh: key('b'),
  auth: AUTH,
  deviceLabel: 'Mac · Firefox',
};

const DEFAULTS = {
  memberId: ENRICO,
  dailySummaryEnabled: false,
  dailySummaryAt: '07:30',
  dailySummaryParts: ['meals', 'activities', 'chores', 'prep'],
  activitiesEveEnabled: false,
  activitiesEveAt: '19:00',
  choreRemindersEnabled: true,
  reservationRemindersEnabled: true,
};

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

const codeOf = async (promise: Promise<unknown>) => {
  const error = await rejection(promise);
  return error instanceof TransportError ? error.code : error;
};

describe('settings (REQ-004)', () => {
  it('AC-011: every member has her own row with the defaults, created by the server', async () => {
    await fx.startEnrico();
    expect(getData().notificationSettings).toMatchObject(DEFAULTS);
    const rows = fx.server.rows(H, 'notification_settings');
    expect(rows.map((row) => row.member_id).sort()).toEqual([ENRICO, NADJA].sort());
  });

  it('AC-012: a change is one patch of the changed fields, shown at once and on another device', async () => {
    await fx.startEnrico();
    const before = getData().notificationSettings;
    updateNotificationSettings({
      dailySummaryEnabled: true,
      dailySummaryAt: '06:45',
      dailySummaryParts: ['meals', 'chores'],
    });
    expect(getData().notificationSettings).toMatchObject({
      dailySummaryEnabled: true,
      dailySummaryAt: '06:45',
      dailySummaryParts: ['meals', 'chores'],
    });
    const second = createEngine({
      transport: fx.server.transport(ENRICO),
      storage: createMemoryStorage(),
      userId: ENRICO,
      environment: fx.environment,
    });
    try {
      await second.start();
      await fx.settle(second);
      expect(fx.calls).toEqual([
        {
          fn: 'applyChanges',
          args: [
            H,
            [
              {
                kind: 'patch',
                table: 'notification_settings',
                id: before?.id,
                changes: {
                  daily_summary_enabled: true,
                  daily_summary_at: '06:45:00',
                  daily_summary_parts: ['meals', 'chores'],
                },
              },
            ],
          ],
        },
      ]);
      expect(second.getState()?.households[H]?.notificationSettings).toEqual(
        getData().notificationSettings,
      );
    } finally {
      second.stop();
    }
  });

  it('AC-013: Nadja keeps her own settings and sees only her row', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    updateNotificationSettings({ dailySummaryEnabled: true });
    await fx.settle(nadja);
    expect(fx.nadjaData(nadja).notificationSettings).toMatchObject({
      memberId: NADJA,
      dailySummaryEnabled: false,
    });
    const pulled = await fx.server.transport(NADJA).syncPull({
      households: { [H]: { full: true } },
    });
    expect(pulled.households[H]?.rows.notification_settings?.map((row) => row.member_id)).toEqual([
      NADJA,
    ]);
  });

  it('AC-013: Nadja cannot change Enrico’s row; nobody inserts, deletes or moves a row', async () => {
    await fx.startEnrico();
    const enricoRow = getData().notificationSettings;
    if (!enricoRow) throw new Error('fixture');
    const nadja = fx.server.transport(NADJA);
    const patch = (changes: Record<string, unknown>) =>
      nadja.applyChanges(H, [
        { kind: 'patch', table: 'notification_settings', id: enricoRow.id, changes },
      ]);
    expect(await codeOf(patch({ daily_summary_enabled: true }))).toBe('row_not_found');
    expect(fx.server.row(H, 'notification_settings', enricoRow.id)).toMatchObject({
      daily_summary_enabled: false,
    });
    const enrico = fx.server.transport(ENRICO);
    expect(
      await codeOf(
        enrico.applyChanges(H, [
          {
            kind: 'patch',
            table: 'notification_settings',
            id: enricoRow.id,
            changes: { member_id: NADJA },
          },
        ]),
      ),
    ).toBe('invalid_change');
    expect(
      await codeOf(
        enrico.applyChanges(H, [
          { kind: 'delete', table: 'notification_settings', id: enricoRow.id },
        ]),
      ),
    ).toBe('invalid_change');
    expect(
      await codeOf(
        enrico.applyChanges(H, [
          {
            kind: 'insert',
            table: 'notification_settings',
            row: { id: 'ns-new', member_id: ENRICO },
          },
        ]),
      ),
    ).toBe('invalid_change');
  });

  it('the database checks: five-minute times, 1–4 known parts without duplicates (23514)', async () => {
    await fx.startEnrico();
    const id = getData().notificationSettings?.id ?? '';
    const enrico = fx.server.transport(ENRICO);
    const patch = (changes: Record<string, unknown>) =>
      codeOf(
        enrico.applyChanges(H, [{ kind: 'patch', table: 'notification_settings', id, changes }]),
      );
    expect(await patch({ daily_summary_at: '06:47' })).toBe('23514');
    expect(await patch({ daily_summary_parts: [] })).toBe('23514');
    expect(await patch({ daily_summary_parts: ['meals', 'meals'] })).toBe('23514');
    expect(await patch({ daily_summary_parts: ['weather'] })).toBe('23514');
  });

  it('an invalid change throws before anything is sent', async () => {
    await fx.startEnrico();
    expect(() => updateNotificationSettings({ dailySummaryParts: [] })).toThrow();
    expect(() => updateNotificationSettings({ dailySummaryAt: '06:47' })).toThrow();
    expect(getData().notificationSettings).toMatchObject(DEFAULTS);
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('REQ-004: changing the settings is refused offline', async () => {
    await fx.startEnrico();
    fx.environment.setOnline(false);
    expect(() => updateNotificationSettings({ dailySummaryEnabled: true })).toThrow(OfflineError);
    expect(getData().notificationSettings?.dailySummaryEnabled).toBe(false);
  });

  it('households.timezone is read-only for members (Decision 16)', async () => {
    await fx.startEnrico();
    expect(
      await codeOf(
        fx.server
          .transport(ENRICO)
          .applyChanges(H, [
            { kind: 'patch', table: 'households', id: H, changes: { timezone: 'UTC' } },
          ]),
      ),
    ).toBe('invalid_change');
  });

  it('a member who leaves loses her row, with a tombstone in the household', async () => {
    await fx.startEnrico();
    const nadjaRow = fx.server
      .rows(H, 'notification_settings')
      .find((row) => row.member_id === NADJA);
    await fx.server.transport(ENRICO).removeMember(H, NADJA);
    expect(fx.server.rows(H, 'notification_settings').map((row) => row.member_id)).toEqual([
      ENRICO,
    ]);
    const pulled = await fx.server.transport(ENRICO).syncPull({
      households: {
        [H]: { full: false, since: { notification_settings: '2000-01-01T00:00:00Z' } },
      },
    });
    expect(pulled.households[H]?.tombstones).toContainEqual(
      expect.objectContaining({ table: 'notification_settings', id: nadjaRow?.id }),
    );
  });
});

describe('devices (REQ-002, REQ-003, REQ-010)', () => {
  it('AC-004: registering this device lists it as "dieses Gerät", without address or keys', async () => {
    await fx.startEnrico();
    const id = await registerDevicePush(chrome);
    const devices = await listPushDevices(chrome.endpoint);
    expect(devices).toEqual([
      {
        id,
        label: 'Mac · Chrome',
        status: 'active',
        isCurrent: true,
        createdAt: expect.any(String),
      },
    ]);
    expect(JSON.stringify(devices)).not.toContain('fcm.googleapis.com');
    expect(JSON.stringify(devices)).not.toContain(chrome.p256dh);
  });

  it('AC-041: the browser that asks comes first; another device can be removed', async () => {
    await fx.startEnrico();
    const chromeId = await registerDevicePush(chrome);
    const firefoxId = await registerDevicePush(firefox);
    const devices = await listPushDevices(firefox.endpoint);
    expect(devices.map((device) => [device.label, device.isCurrent])).toEqual([
      ['Mac · Firefox', true],
      ['Mac · Chrome', false],
    ]);
    expect(await removePushDevice(chromeId)).toBe(true);
    expect((await listPushDevices(firefox.endpoint)).map((device) => device.id)).toEqual([
      firefoxId,
    ]);
    expect(await removePushDevice(chromeId)).toBe(false);
  });

  it('AC-008: switching this device off keeps it in the list as "aus" and leaves the settings', async () => {
    await fx.startEnrico();
    await registerDevicePush(chrome);
    await registerDevicePush(firefox);
    await setDevicePushEnabled(chrome.endpoint, false);
    const devices = await listPushDevices(chrome.endpoint);
    expect(devices.map((device) => [device.label, device.status])).toEqual([
      ['Mac · Chrome', 'off'],
      ['Mac · Firefox', 'active'],
    ]);
    expect(getData().notificationSettings).toMatchObject(DEFAULTS);
    await setDevicePushEnabled(chrome.endpoint, true);
    expect((await listPushDevices(chrome.endpoint))[0]?.status).toBe('active');
    expect(
      await codeOf(setDevicePushEnabled('https://fcm.googleapis.com/fcm/send/unknown', true)),
    ).toBe('not_found');
  });

  it('AC-039: a device the push service gave up on is "nicht erreichbar"; registering again revives it', async () => {
    await fx.startEnrico();
    await registerDevicePush(chrome);
    fx.server.markPushGone(chrome.endpoint);
    expect((await listPushDevices(chrome.endpoint))[0]?.status).toBe('unreachable');
    await registerDevicePush(chrome);
    expect((await listPushDevices(chrome.endpoint))[0]?.status).toBe('active');
  });

  it('AC-043: Nadja sees, switches, removes and probes none of Enrico’s devices', async () => {
    await fx.startEnrico();
    const id = await registerDevicePush(chrome);
    const nadja = fx.server.transport(NADJA);
    expect(await nadja.listPushSubscriptions(chrome.endpoint)).toEqual([]);
    expect(await nadja.removePushSubscription(id)).toBe(false);
    expect(await codeOf(nadja.setPushSubscriptionEnabled(chrome.endpoint, false))).toBe(
      'not_found',
    );
    fx.server.setPushConfigured(true);
    expect(await codeOf(nadja.sendTestPush(chrome.endpoint))).toBe('not_found');
    await nadja.unregisterPushSubscription(chrome.endpoint);
    expect((await listPushDevices(chrome.endpoint)).map((device) => device.status)).toEqual([
      'active',
    ]);
  });

  it('AC-043: a signed-out call is refused for every device RPC', async () => {
    const anonymous = fx.server.transport('');
    const calls = [
      () => anonymous.registerPushSubscription(chrome.endpoint, chrome.p256dh, chrome.auth, 'Mac'),
      () => anonymous.setPushSubscriptionEnabled(chrome.endpoint, true),
      () => anonymous.unregisterPushSubscription(chrome.endpoint),
      () => anonymous.removePushSubscription('x'),
      () => anonymous.listPushSubscriptions(),
      () => anonymous.sendTestPush(chrome.endpoint),
    ];
    for (const call of calls) expect(await codeOf(call())).toBe('not_authenticated');
  });

  it('AC-044: a local, unknown or malformed subscription is refused, nothing is stored', async () => {
    await fx.startEnrico();
    const invalid = [
      { ...chrome, endpoint: 'http://127.0.0.1:54321/x' },
      { ...chrome, endpoint: 'https://evil.example/x' },
      { ...chrome, endpoint: 'https://fcm.googleapis.com:8443/x' },
      { ...chrome, p256dh: 'A'.repeat(87) },
      { ...chrome, auth: 'short' },
      { ...chrome, deviceLabel: ' ' },
    ];
    for (const subscription of invalid) {
      const error = await rejection(registerDevicePush(subscription));
      expect(error).toMatchObject({ code: 'invalid_subscription' });
      expect(pushRejectedMessage(error)).toBe('Dieses Gerät konnte nicht angemeldet werden');
    }
    expect(await listPushDevices()).toEqual([]);
  });

  it('at most 10 devices per person; the same address moves to whoever registers it last', async () => {
    await fx.startEnrico();
    for (let index = 0; index < 10; index += 1) {
      await registerDevicePush({ ...chrome, endpoint: `${chrome.endpoint}-${index}` });
    }
    const error = await rejection(registerDevicePush(firefox));
    expect(error).toMatchObject({ code: 'too_many_devices' });
    expect(pushRejectedMessage(error)).toBe('Zu viele Geräte – entferne zuerst ein altes');
    await registerDevicePush({ ...chrome, endpoint: `${chrome.endpoint}-3`, deviceLabel: 'Neu' });
    expect(await listPushDevices()).toHaveLength(10);

    const nadja = fx.server.transport(NADJA);
    await nadja.registerPushSubscription(`${chrome.endpoint}-0`, chrome.p256dh, AUTH, 'Laptop');
    expect(await listPushDevices()).toHaveLength(9);
    expect((await nadja.listPushSubscriptions()).map((row) => row.device_label)).toEqual([
      'Laptop',
    ]);
  });

  it('AC-009, AC-010: a probe goes to exactly this device, only while it is on', async () => {
    await fx.startEnrico();
    const chromeId = await registerDevicePush(chrome);
    await registerDevicePush(firefox);
    const unconfigured = await rejection(sendTestPush(chrome.endpoint));
    expect(unconfigured).toMatchObject({ code: 'push_not_configured' });
    expect(pushRejectedMessage(unconfigured)).toBe(
      'Benachrichtigungen sind auf dem Server noch nicht eingerichtet',
    );
    fx.server.setPushConfigured(true);
    await sendTestPush(chrome.endpoint);
    expect(fx.server.testPushes()).toEqual([{ subscriptionId: chromeId, profileId: ENRICO }]);
    await setDevicePushEnabled(chrome.endpoint, false);
    expect(await codeOf(sendTestPush(chrome.endpoint))).toBe('not_found');
  });

  it('at most 3 probes in 10 minutes', async () => {
    await fx.startEnrico();
    await registerDevicePush(chrome);
    fx.server.setPushConfigured(true);
    for (let index = 0; index < 3; index += 1) await sendTestPush(chrome.endpoint);
    const error = await rejection(sendTestPush(chrome.endpoint));
    expect(error).toMatchObject({ code: 'rate_limited' });
    expect(pushRejectedMessage(error)).toBe('Bitte kurz warten und dann noch einmal');
  });

  it('AC-042: unregistering this device deletes it; an unknown address is no error', async () => {
    await fx.startEnrico();
    await registerDevicePush(chrome);
    await unregisterDevicePush(chrome.endpoint);
    expect(await listPushDevices(chrome.endpoint)).toEqual([]);
    await unregisterDevicePush(chrome.endpoint);
  });

  it('REQ-002, REQ-003, REQ-010: every device command is refused offline', async () => {
    await fx.startEnrico();
    fx.environment.setOnline(false);
    const calls = [
      () => registerDevicePush(chrome),
      () => setDevicePushEnabled(chrome.endpoint, true),
      () => unregisterDevicePush(chrome.endpoint),
      () => removePushDevice('x'),
      () => listPushDevices(chrome.endpoint),
      () => sendTestPush(chrome.endpoint),
    ];
    for (const call of calls) expect(await rejection(call())).toBeInstanceOf(OfflineError);
    expect(fx.calls).toEqual([]);
  });

  it('the device commands never touch the cache', async () => {
    await fx.startEnrico();
    const before = getData();
    await registerDevicePush(chrome);
    await listPushDevices(chrome.endpoint);
    expect(getData()).toBe(before);
  });

  it('pushRejectedMessage: offline and unknown errors', () => {
    expect(pushRejectedMessage(new OfflineError())).toBe(
      'Offline – zum Bearbeiten brauchst du Netz',
    );
    expect(pushRejectedMessage(new TransportError('transient', 'network', 0))).toBe(
      PUSH_MESSAGES.failed,
    );
    expect(PUSH_MESSAGES.failed).toBe('Hat nicht geklappt – bitte noch einmal versuchen');
  });
});
