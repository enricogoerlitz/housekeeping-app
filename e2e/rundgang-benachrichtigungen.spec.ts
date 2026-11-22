import type { Page } from '@playwright/test';

import { back, chooseTime, expect, nav, only, open, openSettings, test, tid } from './helpers';
import { seedIds } from './seed-ids';

// Spec 0013 — the page "Benachrichtigungen" in the production export (with service worker and
// VAPID key). The browser's answer to the permission question is faked in the page (headless
// Chromium answers "denied" by itself and has no push service, so a real subscription cannot be
// made here): "Blockieren" (AC-005), a browser without Push (AC-006), and counting the
// questions (AC-007). Read-only for
// the data except AC-007, which sets a time on "Küche wischen".

only('phone');
// With the service worker blocked, reading this device's subscription waits for its timeout
// (10 s) after every tap; with it, the page answers at once as in production.
test.use({ serviceWorkers: 'allow' });

/** The input of a SwitchRow's switch (react-native-web puts the test id on its wrapper). */
function toggle(page: Page, id: string) {
  return tid(page, id).locator('input');
}

/** From the Übersicht via the avatar and the row "Benachrichtigungen". */
async function openNotifications(page: Page): Promise<void> {
  await openSettings(page);
  await tid(page, 'settings-notifications-row').click();
  await expect(tid(page, 'notifications-screen')).toBeVisible();
}

/**
 * Fakes the browser's permission: `answer` is what the person picks when asked; every question is
 * counted in `window.permissionAsks`.
 */
async function fakePermission(page: Page, answer: 'denied' | 'default'): Promise<void> {
  await page.addInitScript((reply) => {
    const record = window as unknown as { permissionAsks: number };
    record.permissionAsks = 0;
    let state: NotificationPermission = 'default';
    Object.defineProperty(Notification, 'permission', { get: () => state, configurable: true });
    Notification.requestPermission = () => {
      record.permissionAsks += 1;
      state = reply;
      return Promise.resolve(reply);
    };
  }, answer);
}

function permissionAsks(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { permissionAsks: number }).permissionAsks);
}

test('AC-001: "Benachrichtigungen · 3 an" under the avatar opens the page; "Verwalten" has no entry', async ({
  page,
}) => {
  // Headless Chromium answers "denied" by itself; a browser that was never asked says "default".
  await fakePermission(page, 'default');
  await open(page, '/');
  await openSettings(page);
  // Not registered on this device yet (spec 0018, AC-022).
  await expect(tid(page, 'settings-notifications-summary')).toHaveText('3 an · dieses Gerät aus');
  await tid(page, 'settings-notifications-row').click();
  await expect(tid(page, 'notif-device')).toContainText('Dieses Gerät');
  await expect(tid(page, 'notif-kinds')).toContainText('gilt für alle Geräte');
  await expect(tid(page, 'notif-kinds')).toContainText('Während einer Reise kommt nichts.');
  await expect(tid(page, 'notif-devices')).toContainText('Deine Geräte');
  // The export has a service worker: the switch is live (not the development server's hint).
  await expect(toggle(page, 'notif-device-switch')).toBeEnabled();
  await back(page);
  await back(page);
  await tid(page, 'header-manage').click();
  await expect(tid(page, 'manage-screen')).not.toContainText('Benachrichtigungen');
});

test('AC-005: "Blockieren" in the browser shows "nicht erlaubt" with the way out; nothing is added', async ({
  page,
}) => {
  await fakePermission(page, 'denied');
  await open(page, '/');
  await openNotifications(page);
  await expect(toggle(page, 'notif-device-switch')).not.toBeChecked();
  await toggle(page, 'notif-device-switch').click();
  await expect(tid(page, 'notif-device')).toContainText('nicht erlaubt');
  await expect(tid(page, 'notif-device')).toContainText(
    'Erlaube Benachrichtigungen in den Browser-Einstellungen für diese Seite.',
  );
  await expect(toggle(page, 'notif-device-switch')).not.toBeChecked();
  await expect(toggle(page, 'notif-device-switch')).toBeDisabled();
  await expect(tid(page, 'notif-devices-empty')).toBeVisible();
  expect(await permissionAsks(page)).toBe(1);
});

test('AC-006: a browser without Push says so and greys out the switch', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as { PushManager?: unknown }).PushManager;
  });
  await open(page, '/');
  await openNotifications(page);
  await expect(tid(page, 'notif-device')).toContainText(
    'Dieser Browser kann keine Benachrichtigungen empfangen',
  );
  await expect(toggle(page, 'notif-device-switch')).toBeDisabled();
});

test('AC-007 / AC-003: the browser is asked only when a kind is switched on or a chore gets a time', async ({
  page,
}) => {
  await fakePermission(page, 'default');
  await open(page, '/');
  for (const key of ['rezepte', 'kalender', 'liste', 'haushalt', 'index'] as const) {
    await nav(page, key);
  }
  expect(await permissionAsks(page), 'never asked on the way through the app').toBe(0);

  await openNotifications(page);
  await toggle(page, 'notif-kind-daily-summary').click();
  await expect(toggle(page, 'notif-kind-daily-summary')).toBeChecked();
  await expect.poll(() => permissionAsks(page)).toBe(1);
  // Back to the default for the other files.
  await toggle(page, 'notif-kind-daily-summary').click();
  await expect(toggle(page, 'notif-kind-daily-summary')).not.toBeChecked();
  await back(page);
  await back(page);

  await nav(page, 'haushalt');
  await tid(page, 'chores-tab-all').click();
  await tid(page, `chore-${seedIds['chore-kueche']}`).click();
  await tid(page, 'chore-edit').click();
  await chooseTime(page, 'chore-due-time', '07:30');
  await tid(page, 'chore-save').click();
  await expect(tid(page, 'chore-sheet')).toContainText('7:30');
  await expect.poll(() => permissionAsks(page)).toBe(2);
});
