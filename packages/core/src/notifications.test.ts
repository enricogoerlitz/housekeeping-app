import { describe, expect, it } from 'vitest';

import {
  asksForPushPermission,
  base64UrlToBytes,
  bytesToBase64Url,
  choreRemindHint,
  dailySummaryPartLabel,
  deviceAction,
  deviceLabel,
  deviceRowLabel,
  enabledKindsLabel,
  formatTime,
  isLastSummaryPart,
  kindEnabled,
  kindEnabledPatch,
  kindSubtitle,
  NOTIFICATION_KINDS,
  notificationsRowLabel,
  notificationTargetHref,
  parseNotificationTarget,
  permissionStatus,
  pushSupport,
  pushSupportHint,
  remindAtDueTimeFor,
  serverDeviceStatus,
  thisDeviceRegistered,
  thisDeviceView,
  toggleSummaryPart,
  withTime,
  type DeviceState,
  type PushEnvironment,
} from './notifications';
import { notificationDefaults } from './test-fixtures';
import { NotificationSettingsSchema, OwnPushSubscriptionSchema, TimeOfDaySchema } from './types';

const HOUSEHOLD = '7d1c3a52-8f0e-4c4b-9a55-0c2f3e1d9b10';
const CHORE = '1b6e5f4a-2c3d-4e5f-8a9b-0c1d2e3f4a5b';
const ENTRY = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('settings of the page "Benachrichtigungen" (REQ-001, REQ-004)', () => {
  // Spec 0017, REQ-007: "Erinnerungen an Einträgen" is a third kind that is on at the start.
  it('AC-001, spec 0021 AC-039: the row in the settings reads "2 an" with the defaults', () => {
    expect(enabledKindsLabel(notificationDefaults)).toBe('2 an');
  });

  it('AC-001: counts every kind that is on, "Alle aus" when none is', () => {
    expect(enabledKindsLabel({ ...notificationDefaults, dailySummaryEnabled: true })).toBe('3 an');
    expect(
      enabledKindsLabel({
        ...notificationDefaults,
        choreRemindersEnabled: false,
        entryRemindersEnabled: false,
      }),
    ).toBe('Alle aus');
  });

  it('spec 0018, AC-022: kinds on, this device not registered: "2 an · dieses Gerät aus"', () => {
    expect(notificationsRowLabel(notificationDefaults, false)).toBe('2 an · dieses Gerät aus');
  });

  it('spec 0018, AC-022: once this device is registered: "2 an"', () => {
    expect(notificationsRowLabel(notificationDefaults, true)).toBe('2 an');
  });

  it('spec 0018, AC-022: with every kind off the device does not matter: "Alle aus"', () => {
    const off = {
      ...notificationDefaults,
      choreRemindersEnabled: false,
      entryRemindersEnabled: false,
    };
    expect(notificationsRowLabel(off, false)).toBe('Alle aus');
    expect(notificationsRowLabel(off, true)).toBe('Alle aus');
  });

  it('spec 0018, AC-022: registered = wanted here, an address registered, push supported', () => {
    const on = { support: 'supported', wanted: true, storedEndpoint: 'https://push/1' } as const;
    expect(thisDeviceRegistered(on)).toBe(true);
    expect(thisDeviceRegistered({ ...on, wanted: false })).toBe(false);
    expect(thisDeviceRegistered({ ...on, wanted: undefined })).toBe(false);
    expect(thisDeviceRegistered({ support: 'supported', wanted: true })).toBe(false);
    expect(thisDeviceRegistered({ ...on, support: 'unsupported' })).toBe(false);
  });

  it('AC-011, spec 0017 REQ-007: the defaults: chores with a time and entry reminders are on', () => {
    expect(NOTIFICATION_KINDS.map((kind) => kindEnabled(notificationDefaults, kind))).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });

  it('spec 0021, AC-039: "Erinnerungen an Einträgen" is there, "Restaurant-Reservierung" is not', () => {
    expect(NOTIFICATION_KINDS).toEqual([
      'dailySummary',
      'activitiesEve',
      'choreReminders',
      'entryReminders',
    ]);
  });

  it('spec 0017, REQ-007: "Erinnerungen an Einträgen" has no time of its own and switches its own field', () => {
    expect(kindSubtitle(notificationDefaults, 'entryReminders')).toBeUndefined();
    expect(kindEnabledPatch('entryReminders', false)).toEqual({ entryRemindersEnabled: false });
  });

  it('AC-011: subtitles "7:30 · Essen · Aktivitäten · Aufgaben · Vorbereitung", "19:00"', () => {
    expect(kindSubtitle(notificationDefaults, 'dailySummary')).toBe(
      '7:30 · Essen · Aktivitäten · Aufgaben · Vorbereitung',
    );
    expect(kindSubtitle(notificationDefaults, 'activitiesEve')).toBe('19:00');
    expect(kindSubtitle(notificationDefaults, 'choreReminders')).toBeUndefined();
  });

  it('AC-012: the subtitle follows the chosen time and parts, always in the fixed order', () => {
    const changed = {
      ...notificationDefaults,
      dailySummaryAt: '06:45',
      dailySummaryParts: ['chores' as const, 'meals' as const],
    };
    expect(kindSubtitle(changed, 'dailySummary')).toBe('6:45 · Essen · Aufgaben');
  });

  it('AC-012: switching a kind is a patch of exactly its own field', () => {
    expect(kindEnabledPatch('dailySummary', true)).toEqual({ dailySummaryEnabled: true });
    expect(kindEnabledPatch('activitiesEve', false)).toEqual({ activitiesEveEnabled: false });
    expect(kindEnabledPatch('choreReminders', false)).toEqual({ choreRemindersEnabled: false });
  });

  it('Decision 25: parts of the Tagesüberblick toggle, the last one cannot be deselected', () => {
    expect(dailySummaryPartLabel('prep')).toBe('Vorbereitung');
    expect(toggleSummaryPart(['meals', 'chores'], 'chores')).toEqual(['meals']);
    expect(toggleSummaryPart(['chores'], 'prep')).toEqual(['chores', 'prep']);
    expect(toggleSummaryPart(['prep', 'meals'], 'activities')).toEqual([
      'meals',
      'activities',
      'prep',
    ]);
    expect(toggleSummaryPart(['meals'], 'meals')).toEqual(['meals']);
    expect(isLastSummaryPart(['meals'], 'meals')).toBe(true);
    expect(isLastSummaryPart(['meals', 'chores'], 'meals')).toBe(false);
    expect(isLastSummaryPart(['meals'], 'chores')).toBe(false);
  });

  it('the schema takes a database-shaped row and refuses what the database refuses (23514)', () => {
    expect(NotificationSettingsSchema.parse(notificationDefaults)).toEqual(notificationDefaults);
    const bad = [
      { dailySummaryParts: [] },
      { dailySummaryParts: ['meals', 'meals'] },
      { dailySummaryParts: ['weather'] },
      { dailySummaryAt: '06:47' },
      { activitiesEveAt: '19:00:00' },
    ];
    for (const patch of bad) {
      expect(
        NotificationSettingsSchema.safeParse({ ...notificationDefaults, ...patch }).success,
      ).toBe(false);
    }
  });
});

describe('times in five-minute steps (Decision 4)', () => {
  it('shows times as "H:MM", like the texts of the scheduler', () => {
    expect(formatTime('07:30')).toBe('7:30');
    expect(formatTime('19:00')).toBe('19:00');
    expect(formatTime('00:05')).toBe('0:05');
  });

  it('AC-022: withTime adds " · 19:00" to a chore, AC-025: without a time it stays as it is', () => {
    expect(withTime('Müll rausbringen', '19:00')).toBe('Müll rausbringen · 19:00');
    expect(withTime('Müll rausbringen', '07:30')).toBe('Müll rausbringen · 7:30');
    expect(withTime('Müll rausbringen', undefined)).toBe('Müll rausbringen');
  });

  it('AC-035 (spec 0027): the hint under „Erinnern“, on and off', () => {
    expect(choreRemindHint(true, true)).toBe('Erinnert zur Uhrzeit, wer dran ist.');
    expect(choreRemindHint(false, true)).toBe(
      'Keine Erinnerung – die Uhrzeit wird nur angezeigt.',
    );
  });

  it('AC-037 (spec 0027): with the own „Aufgaben mit Uhrzeit“ off, „Erinnern“ adds why you get none', () => {
    expect(choreRemindHint(true, false)).toBe(
      'Erinnert zur Uhrzeit, wer dran ist. Du selbst bekommst keine: „Aufgaben mit Uhrzeit“ ist in deinen Benachrichtigungen aus.',
    );
    // Off for everyone, the own setting changes nothing.
    expect(choreRemindHint(false, false)).toBe(
      'Keine Erinnerung – die Uhrzeit wird nur angezeigt.',
    );
  });

  it('AC-038 (spec 0027): without a time „Erinnern“ is on, so a new time reminds again', () => {
    expect(remindAtDueTimeFor('19:00', false)).toBe(false);
    expect(remindAtDueTimeFor('19:00', true)).toBe(true);
    expect(remindAtDueTimeFor(undefined, false)).toBe(true);
    expect(remindAtDueTimeFor(undefined, true)).toBe(true);
  });
});

const chromeMac =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const firefoxMac =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0';
const safariMac =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const iphone =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const android =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const edgeWindows =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

describe('this device (REQ-002, REQ-010)', () => {
  it('AC-004, AC-041: names the device "Mac · Chrome", "Mac · Firefox", "iPhone · App", …', () => {
    expect(deviceLabel({ userAgent: chromeMac, standalone: false, touch: false })).toBe(
      'Mac · Chrome',
    );
    expect(deviceLabel({ userAgent: firefoxMac, standalone: false, touch: false })).toBe(
      'Mac · Firefox',
    );
    expect(deviceLabel({ userAgent: safariMac, standalone: false, touch: false })).toBe(
      'Mac · Safari',
    );
    expect(deviceLabel({ userAgent: iphone, standalone: true, touch: true })).toBe('iPhone · App');
    expect(deviceLabel({ userAgent: iphone, standalone: false, touch: true })).toBe(
      'iPhone · Safari',
    );
    // iPadOS Safari says "Macintosh"; only the touch screen tells it apart.
    expect(deviceLabel({ userAgent: safariMac, standalone: true, touch: true })).toBe('iPad · App');
    expect(deviceLabel({ userAgent: android, standalone: false, touch: true })).toBe(
      'Android · Chrome',
    );
    expect(deviceLabel({ userAgent: edgeWindows, standalone: false, touch: false })).toBe(
      'Windows · Edge',
    );
    expect(deviceLabel({ userAgent: 'curl/8.0', standalone: false, touch: false })).toBe('Browser');
    expect(deviceLabel({ userAgent: '', standalone: false, touch: false })).toBe('Browser');
  });

  it('a device name fits the 60 characters of the database', () => {
    const long = `${'x'.repeat(500)} Windows Edg/1`;
    expect(
      deviceLabel({ userAgent: long, standalone: false, touch: false }).length,
    ).toBeLessThanOrEqual(60);
  });

  const web: PushEnvironment = {
    web: true,
    dev: false,
    ios: false,
    ipad: false,
    standalone: false,
    serviceWorker: true,
    pushManager: true,
    notification: true,
  };

  it('AC-006: tells what this browser can do', () => {
    expect(pushSupport(web)).toBe('supported');
    expect(pushSupport({ ...web, ios: true, pushManager: false })).toBe('ios-needs-home-screen');
    expect(pushSupport({ ...web, ios: true, standalone: true })).toBe('supported');
    // The iPad has its own hint, not the iPhone's.
    expect(pushSupport({ ...web, ios: true, ipad: true, pushManager: false })).toBe(
      'ipad-needs-home-screen',
    );
    expect(pushSupport({ ...web, ios: true, ipad: true, standalone: true })).toBe('supported');
    // Before iOS 16.4 even the home-screen app has no push.
    expect(pushSupport({ ...web, ios: true, standalone: true, pushManager: false })).toBe(
      'unsupported',
    );
    expect(pushSupport({ ...web, pushManager: false })).toBe('unsupported');
    expect(pushSupport({ ...web, notification: false })).toBe('unsupported');
    expect(pushSupport({ ...web, dev: true })).toBe('dev-no-worker');
    expect(pushSupport({ ...web, web: false, dev: true })).toBe('unsupported');
  });

  it('AC-006: the hint for each state', () => {
    expect(pushSupportHint('supported')).toBeUndefined();
    expect(pushSupportHint('ios-needs-home-screen')).toBe(
      'Auf dem iPhone erst die App zum Home-Bildschirm hinzufügen',
    );
    expect(pushSupportHint('ipad-needs-home-screen')).toBe(
      'Auf dem iPad erst die App zum Home-Bildschirm hinzufügen',
    );
    expect(pushSupportHint('unsupported')).toBe(
      'Dieser Browser kann keine Benachrichtigungen empfangen',
    );
    expect(pushSupportHint('dev-no-worker')).toBe(
      'Im Entwicklungsserver gibt es keine Benachrichtigungen',
    );
  });

  it('AC-004, AC-005: "✓ erlaubt", "nicht erlaubt" with the way out', () => {
    expect(permissionStatus('granted')).toEqual({ label: '✓ erlaubt', hint: undefined });
    expect(permissionStatus('denied')).toEqual({
      label: 'nicht erlaubt',
      hint: 'Erlaube Benachrichtigungen in den Browser-Einstellungen für diese Seite.',
    });
    expect(permissionStatus('default')).toEqual({ label: undefined, hint: undefined });
  });

  it('AC-004, AC-039, AC-041: "Deine Geräte" names this device and the state of the others', () => {
    const row = { id: 's1', label: 'Mac · Firefox', createdAt: '2026-11-20T08:00:00Z' };
    expect(deviceRowLabel({ ...row, status: 'active', isCurrent: true })).toBe(
      'Mac · Firefox · dieses Gerät',
    );
    expect(
      deviceRowLabel({ ...row, label: 'Mac · Chrome', status: 'active', isCurrent: false }),
    ).toBe('Mac · Chrome');
    expect(deviceRowLabel({ ...row, status: 'off', isCurrent: true })).toBe(
      'Mac · Firefox · dieses Gerät · aus',
    );
    expect(deviceRowLabel({ ...row, status: 'unreachable', isCurrent: false })).toBe(
      'Mac · Firefox · nicht erreichbar',
    );
    expect(
      OwnPushSubscriptionSchema.safeParse({ ...row, status: 'gone', isCurrent: false }).success,
    ).toBe(false);
  });
});

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';
const NEW_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/xyz';

function device(partial: Partial<DeviceState> = {}): DeviceState {
  return {
    support: 'supported',
    online: true,
    permission: 'granted',
    wanted: true,
    browser: { endpoint: ENDPOINT, keyMatches: true },
    storedEndpoint: ENDPOINT,
    server: 'active',
    ...partial,
  };
}

describe('deviceAction on opening the app (Decision 18)', () => {
  it('AC-003: never asks for permission on start, whatever the state', () => {
    const states: DeviceState[] = [
      device({ permission: 'default', wanted: undefined, browser: undefined, server: undefined }),
      device({ permission: 'default', wanted: true, browser: undefined }),
      device({ permission: 'default', wanted: false }),
    ];
    for (const state of states) {
      expect(deviceAction(state, 'start').type).not.toBe('request-permission');
    }
  });

  it('AC-003: a device nobody turned on here does nothing, even when the browser allows it', () => {
    expect(
      deviceAction(device({ wanted: undefined, browser: undefined, server: 'missing' }), 'start'),
    ).toEqual({ type: 'none' });
  });

  it('a registered, active device does nothing; offline or unsupported does nothing', () => {
    expect(deviceAction(device(), 'start')).toEqual({ type: 'none' });
    expect(deviceAction(device({ online: false, browser: undefined }), 'start')).toEqual({
      type: 'none',
    });
    expect(deviceAction(device({ support: 'unsupported' }), 'start')).toEqual({ type: 'none' });
    expect(deviceAction(device({ server: undefined }), 'start')).toEqual({ type: 'none' });
  });

  it('AC-039: a new push address with permission granted registers again and drops the old one', () => {
    expect(
      deviceAction(
        device({ browser: { endpoint: NEW_ENDPOINT, keyMatches: true }, server: 'missing' }),
        'start',
      ),
    ).toEqual({ type: 'register', staleEndpoint: ENDPOINT });
  });

  it('AC-039: no browser subscription any more, another VAPID key, or "nicht erreichbar" → subscribe anew', () => {
    expect(deviceAction(device({ browser: undefined, server: undefined }), 'start')).toEqual({
      type: 'subscribe',
    });
    expect(
      deviceAction(device({ browser: { endpoint: ENDPOINT, keyMatches: false } }), 'start'),
    ).toEqual({ type: 'resubscribe' });
    expect(deviceAction(device({ server: 'unreachable' }), 'start')).toEqual({
      type: 'resubscribe',
    });
  });

  it('AC-041: the same address, which the server no longer knows (removed elsewhere) → forget', () => {
    expect(deviceAction(device({ server: 'missing' }), 'start')).toEqual({ type: 'forget' });
    expect(deviceAction(device({ wanted: false, server: 'missing' }), 'start')).toEqual({
      type: 'forget',
    });
  });

  it('permission withdrawn in the browser → forget', () => {
    expect(deviceAction(device({ permission: 'denied' }), 'start')).toEqual({ type: 'forget' });
    expect(deviceAction(device({ permission: 'default', browser: undefined }), 'start')).toEqual({
      type: 'forget',
    });
  });

  it('Decision 17: a device switched off here stays registered and untouched', () => {
    expect(deviceAction(device({ wanted: false, server: 'off' }), 'start')).toEqual({
      type: 'none',
    });
  });
});

describe('deviceAction on a tap (Decision 26, AC-007)', () => {
  const fresh = device({
    permission: 'default',
    wanted: undefined,
    browser: undefined,
    storedEndpoint: undefined,
    server: undefined,
  });

  it('AC-007: switching on the device or a kind asks for permission first', () => {
    expect(deviceAction(fresh, 'device-on')).toEqual({ type: 'request-permission' });
    expect(deviceAction(fresh, 'kind-on')).toEqual({ type: 'request-permission' });
  });

  it('AC-004: once allowed, the browser subscribes and the server learns about it', () => {
    expect(deviceAction({ ...fresh, permission: 'granted' }, 'device-on')).toEqual({
      type: 'subscribe',
    });
    expect(
      deviceAction(
        { ...fresh, permission: 'granted', browser: { endpoint: ENDPOINT, keyMatches: true } },
        'kind-on',
      ),
    ).toEqual({ type: 'register' });
  });

  it('AC-005: blocked in the browser, a tap does nothing more', () => {
    expect(deviceAction({ ...fresh, permission: 'denied' }, 'device-on')).toEqual({ type: 'none' });
  });

  it('AC-008: a device switched off here is switched on only by its own switch', () => {
    const off = device({ wanted: false, server: 'off' });
    expect(deviceAction(off, 'device-on')).toEqual({ type: 'enable' });
    expect(deviceAction(off, 'kind-on')).toEqual({ type: 'none' });
  });

  it('an active device needs nothing; offline or unsupported never acts', () => {
    expect(deviceAction(device(), 'kind-on')).toEqual({ type: 'none' });
    expect(deviceAction({ ...fresh, online: false }, 'device-on')).toEqual({ type: 'none' });
    expect(deviceAction({ ...fresh, support: 'ios-needs-home-screen' }, 'device-on')).toEqual({
      type: 'none',
    });
  });

  it('AC-039: a gone or foreign-key subscription is replaced on a tap as well', () => {
    expect(deviceAction(device({ server: 'unreachable' }), 'device-on')).toEqual({
      type: 'resubscribe',
    });
    expect(
      deviceAction(device({ browser: { endpoint: ENDPOINT, keyMatches: false } }), 'kind-on'),
    ).toEqual({ type: 'resubscribe' });
  });
});

describe('thisDeviceView: the section "Dieses Gerät" (AC-004 to AC-006, AC-010)', () => {
  it('AC-004: allowed and registered: switch on, "✓ erlaubt", "Probe senden" possible', () => {
    expect(thisDeviceView(device())).toEqual({
      switchOn: true,
      switchDisabled: false,
      status: '✓ erlaubt',
      hint: undefined,
      probeDisabled: false,
      probeHint: undefined,
    });
  });

  it('AC-010: switched off: "Probe senden" is greyed out with "Erst auf diesem Gerät einschalten"', () => {
    const view = thisDeviceView(device({ wanted: false, server: 'off' }));
    expect(view.switchOn).toBe(false);
    expect(view.probeDisabled).toBe(true);
    expect(view.probeHint).toBe('Erst auf diesem Gerät einschalten');
  });

  it('AC-005: blocked: switch off and greyed out, the hint shows the way out', () => {
    const view = thisDeviceView(device({ permission: 'denied', browser: undefined }));
    expect(view).toMatchObject({
      switchOn: false,
      switchDisabled: true,
      status: 'nicht erlaubt',
      hint: 'Erlaube Benachrichtigungen in den Browser-Einstellungen für diese Seite.',
      probeDisabled: true,
    });
  });

  it('AC-006: iPhone without the home screen: switch greyed out with the hint', () => {
    const view = thisDeviceView(
      device({ support: 'ios-needs-home-screen', permission: 'default', browser: undefined }),
    );
    expect(view).toMatchObject({
      switchOn: false,
      switchDisabled: true,
      hint: 'Auf dem iPhone erst die App zum Home-Bildschirm hinzufügen',
      probeDisabled: true,
    });
  });

  it('REQ-002: offline the switch keeps its state but is greyed out, "Probe senden" too', () => {
    const view = thisDeviceView(device({ online: false, server: undefined }));
    expect(view).toMatchObject({ switchOn: true, switchDisabled: true, probeDisabled: true });
    expect(view.probeHint).toBeUndefined();
  });

  it('not yet turned on here: switch off, but it can be tapped', () => {
    const view = thisDeviceView(
      device({ permission: 'default', wanted: undefined, browser: undefined, server: undefined }),
    );
    expect(view).toMatchObject({ switchOn: false, switchDisabled: false, status: undefined });
  });
});

describe('parseNotificationTarget: where a tap on a notification leads (Decision 12)', () => {
  it('AC-037: the Tagesüberblick opens the "Übersicht" of its household', () => {
    expect(parseNotificationTarget(`/?haushalt=${HOUSEHOLD}`)).toEqual({
      screen: 'overview',
      householdId: HOUSEHOLD,
    });
    expect(parseNotificationTarget('/')).toEqual({ screen: 'overview' });
  });

  it('AC-037: a chore reminder opens the chore', () => {
    expect(parseNotificationTarget(`/haushalt?aufgabe=${CHORE}&haushalt=${HOUSEHOLD}`)).toEqual({
      screen: 'chore',
      choreId: CHORE,
      householdId: HOUSEHOLD,
    });
  });

  it('AC-037: a reservation or a single activity opens the calendar entry; several the day', () => {
    expect(
      parseNotificationTarget(`/kalender?tag=2026-11-21&eintrag=${ENTRY}&haushalt=${HOUSEHOLD}`),
    ).toEqual({ screen: 'calendar', day: '2026-11-21', entryId: ENTRY, householdId: HOUSEHOLD });
    expect(parseNotificationTarget(`/kalender?tag=2026-11-21&haushalt=${HOUSEHOLD}`)).toEqual({
      screen: 'calendar',
      day: '2026-11-21',
      householdId: HOUSEHOLD,
    });
  });

  it('AC-009: the probe opens the page "Benachrichtigungen"', () => {
    expect(parseNotificationTarget('/einstellungen/benachrichtigungen')).toEqual({
      screen: 'notificationSettings',
    });
  });

  it('AC-038: a changed link opens the "Übersicht"', () => {
    const attacks = [
      'https://evil.example/haushalt',
      `https://evil.example/?haushalt=${HOUSEHOLD}`,
      'javascript:alert(1)',
      '//evil.example/kalender?tag=2026-11-21',
      '/\\evil.example',
      '/admin',
      '/haushalt/../rezepte',
      '/kalender',
      '/kalender?tag=2026-13-45',
      '/kalender?tag=morgen',
      `/kalender?tag=2026-11-21&eintrag=kaputt`,
      '/haushalt',
      '/haushalt?aufgabe=1',
      `/haushalt?aufgabe=${CHORE}&haushalt=nope`,
      `/?haushalt=${HOUSEHOLD}x`,
      '',
      'haushalt',
    ];
    for (const attack of attacks) {
      expect(parseNotificationTarget(attack), attack).toEqual({ screen: 'overview' });
    }
  });

  it('of a repeated parameter the first counts, unknown parameters are ignored', () => {
    expect(
      parseNotificationTarget(`/haushalt?aufgabe=${CHORE}&aufgabe=x&utm=1&haushalt=${HOUSEHOLD}`),
    ).toEqual({ screen: 'chore', choreId: CHORE, householdId: HOUSEHOLD });
  });

  it('notificationTargetHref builds the address of the screen, without the household', () => {
    expect(notificationTargetHref({ screen: 'overview', householdId: HOUSEHOLD })).toBe('/');
    expect(
      notificationTargetHref({ screen: 'chore', choreId: CHORE, householdId: HOUSEHOLD }),
    ).toBe(`/haushalt?aufgabe=${CHORE}`);
    expect(notificationTargetHref({ screen: 'calendar', day: '2026-11-21', entryId: ENTRY })).toBe(
      `/kalender?tag=2026-11-21&eintrag=${ENTRY}`,
    );
    expect(notificationTargetHref({ screen: 'calendar', day: '2026-11-21' })).toBe(
      '/kalender?tag=2026-11-21',
    );
    expect(notificationTargetHref({ screen: 'notificationSettings' })).toBe(
      '/einstellungen/benachrichtigungen',
    );
  });
});

describe('the page wiring of this device (Task 8)', () => {
  const device = (status: 'active' | 'off' | 'unreachable', isCurrent: boolean) => ({
    id: `d-${status}-${isCurrent}`,
    label: 'Mac · Chrome',
    status,
    isCurrent,
    createdAt: '2026-11-20T08:00:00Z',
  });

  it('AC-041: a browser address the server does not list is "missing"', () => {
    expect(serverDeviceStatus([])).toBe('missing');
    expect(serverDeviceStatus([device('active', false)])).toBe('missing');
  });

  it('AC-004, AC-008, AC-039: the status of the row marked as this device', () => {
    expect(serverDeviceStatus([device('active', false), device('active', true)])).toBe('active');
    expect(serverDeviceStatus([device('off', true)])).toBe('off');
    expect(serverDeviceStatus([device('unreachable', true)])).toBe('unreachable');
  });

  it('AC-039: base64url round trip for the VAPID key comparison', () => {
    expect(bytesToBase64Url(new Uint8Array([251, 255, 0]))).toBe('-_8A');
    expect(Array.from(base64UrlToBytes('-_8A') ?? [])).toEqual([251, 255, 0]);
    expect(Array.from(base64UrlToBytes('AQ==') ?? [])).toEqual([1]);
    expect(Array.from(base64UrlToBytes('AQ') ?? [])).toEqual([1]);
    expect(bytesToBase64Url(new Uint8Array(0))).toBe('');
  });

  it('AC-039: a key that is not base64url is unreadable', () => {
    expect(base64UrlToBytes('a+b/')).toBeUndefined();
    expect(base64UrlToBytes('A')).toBeUndefined();
    expect(base64UrlToBytes('ab!c')).toBeUndefined();
  });
});

describe('asking for the browser permission (AC-007, Decision 26)', () => {
  const t = (value: string) => TimeOfDaySchema.parse(value);

  it('AC-007: saving a new time with a tap or Enter asks', () => {
    expect(
      asksForPushPermission({ kind: 'time', gesture: 'tap', before: undefined, after: t('19:00') }),
    ).toBe(true);
    expect(
      asksForPushPermission({
        kind: 'time',
        gesture: 'enter',
        before: t('19:00'),
        after: t('19:30'),
      }),
    ).toBe(true);
  });

  it('AC-007: leaving the field (blur) never asks, even with a new time', () => {
    expect(
      asksForPushPermission({
        kind: 'time',
        gesture: 'blur',
        before: undefined,
        after: t('19:30'),
      }),
    ).toBe(false);
    expect(
      asksForPushPermission({
        kind: 'time',
        gesture: 'blur',
        before: t('19:00'),
        after: t('19:30'),
      }),
    ).toBe(false);
  });

  it('AC-007: removing a time or keeping the same one never asks', () => {
    expect(
      asksForPushPermission({ kind: 'time', gesture: 'tap', before: t('19:00'), after: undefined }),
    ).toBe(false);
    expect(
      asksForPushPermission({
        kind: 'time',
        gesture: 'tap',
        before: t('19:00'),
        after: t('19:00'),
      }),
    ).toBe(false);
    expect(
      asksForPushPermission({
        kind: 'time',
        gesture: 'enter',
        before: undefined,
        after: undefined,
      }),
    ).toBe(false);
  });

  it('AC-007: switching a kind on asks, switching it off does not', () => {
    expect(asksForPushPermission({ kind: 'switch', on: true })).toBe(true);
    expect(asksForPushPermission({ kind: 'switch', on: false })).toBe(false);
  });

  it('AC-007: saving the time of a kind asks only when that kind is on', () => {
    expect(asksForPushPermission({ kind: 'kindTime', kindEnabled: true })).toBe(true);
    expect(asksForPushPermission({ kind: 'kindTime', kindEnabled: false })).toBe(false);
  });
});
