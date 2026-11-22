import type { Page } from '@playwright/test';

import { back, expect, goOffline, login, nav, open, openSettings, test, tid } from '../helpers';
import { seedIds } from '../seed-ids';

// Spec 0013, task 8 — the page "Benachrichtigungen" in the personal settings. Runs in the dev
// smoke (playwright.dev.config.ts) after one fresh seed. The development server has no service
// worker (Decision 24), so "Dieses Gerät" shows its hint and nothing is ever registered here; the
// real subscription is checked in the built export (task 10).

/** Counts every question for the notification permission (AC-003), before the app loads. */
async function countPermissionAsks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record = window as unknown as { permissionAsks: number };
    record.permissionAsks = 0;
    if (typeof Notification === 'undefined') return;
    const ask = Notification.requestPermission.bind(Notification);
    Notification.requestPermission = (...args) => {
      record.permissionAsks += 1;
      return ask(...args);
    };
  });
}

function permissionAsks(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { permissionAsks: number }).permissionAsks);
}

/** The input of a SwitchRow's switch (react-native-web puts the test id on its wrapper). */
function toggle(page: Page, id: string) {
  return tid(page, id).locator('input');
}

/** From the Übersicht via the avatar and the row "Benachrichtigungen" (phone). */
async function openNotifications(page: Page): Promise<void> {
  await nav(page, 'index');
  await openSettings(page);
  await tid(page, 'settings-notifications-row').click();
  await expect(tid(page, 'notifications-screen')).toBeVisible();
}

test('AC-001, AC-011: "Benachrichtigungen · 2 an" in the settings, the sections and the defaults', async ({
  page,
}) => {
  await login(page, 'enrico');
  await openSettings(page);
  await expect(tid(page, 'settings-notifications-row')).toContainText('Benachrichtigungen');
  // The development server has no push, so this device is never registered (spec 0018, AC-022).
  await expect(tid(page, 'settings-notifications-summary')).toHaveText('2 an · dieses Gerät aus');
  await tid(page, 'settings-notifications-row').click();
  await expect(tid(page, 'notifications-screen')).toBeVisible();

  await expect(tid(page, 'notif-device')).toContainText('Dieses Gerät');
  // Enrico belongs to two households: the section names the active one (Offene Frage 3 e).
  await expect(tid(page, 'notif-kinds')).toContainText(
    'Was und wann · Enrico & Nadja · gilt für alle Geräte',
  );
  await expect(tid(page, 'notif-devices')).toContainText('Deine Geräte');
  await expect(tid(page, 'notif-kinds')).toContainText('Während einer Reise kommt nichts.');

  await expect(toggle(page, 'notif-kind-daily-summary')).not.toBeChecked();
  await expect(tid(page, 'notif-kind-daily-summary-detail')).toContainText(
    '7:30 · Essen · Aktivitäten · Aufgaben · Vorbereitung',
  );
  await expect(toggle(page, 'notif-kind-activities-eve')).not.toBeChecked();
  await expect(tid(page, 'notif-kind-activities-eve-detail')).toContainText('19:00');
  await expect(toggle(page, 'notif-kind-chore-reminders')).toBeChecked();
  await expect(toggle(page, 'notif-kind-reservation-reminders')).toBeChecked();
  await expect(tid(page, 'notif-kinds')).toContainText('2 h vorher, je Eintrag änderbar');

  // No entry under "Verwalten".
  await back(page);
  await back(page);
  await expect(tid(page, 'today-screen')).toBeVisible();
  await tid(page, 'header-manage').click();
  await expect(tid(page, 'manage-screen')).toBeVisible();
  await expect(tid(page, 'manage-screen')).not.toContainText('Benachrichtigungen');
});

test('AC-010, Decision 24: on the development server "Dieses Gerät" explains and "Probe senden" is greyed out', async ({
  page,
}) => {
  await open(page, '/einstellungen/benachrichtigungen');
  await expect(tid(page, 'notif-device-hint')).toHaveText(
    'Im Entwicklungsserver gibt es keine Benachrichtigungen',
  );
  await expect(toggle(page, 'notif-device-switch')).toBeDisabled();
  await expect(tid(page, 'notif-probe')).toBeDisabled();
  await expect(tid(page, 'notif-probe-hint')).toHaveText('Erst auf diesem Gerät einschalten');
  await expect(tid(page, 'notif-devices-empty')).toBeVisible();
});

test('AC-012, AC-003: Tagesüberblick at 6:45 with "Essen" and "Aufgaben" stays after a reload; the browser is never asked', async ({
  page,
}) => {
  await countPermissionAsks(page);
  await login(page, 'enrico');
  // Through every area once (AC-003).
  for (const key of ['rezepte', 'kalender', 'liste', 'haushalt'] as const) await nav(page, key);
  await openNotifications(page);

  await tid(page, 'notif-kind-daily-summary').click();
  await expect(toggle(page, 'notif-kind-daily-summary')).toBeChecked();
  await tid(page, 'notif-kind-daily-summary-detail').click();
  await expect(tid(page, 'notif-kind-sheet')).toBeVisible();
  await tid(page, 'notif-kind-time').fill('6:47');
  await tid(page, 'notif-kind-save').click();
  await expect(tid(page, 'notif-kind-time-error')).toHaveText('Bitte in 5-Minuten-Schritten');
  await tid(page, 'notif-kind-time').fill('6:45');
  await tid(page, 'notif-part-activities').click();
  await tid(page, 'notif-part-prep').click();
  // The last part cannot be dropped (Decision 25).
  await tid(page, 'notif-part-meals').click();
  await tid(page, 'notif-part-chores').click();
  await expect(tid(page, 'notif-part-chores')).toHaveAttribute('aria-pressed', 'true');
  await tid(page, 'notif-part-meals').click();
  await tid(page, 'notif-kind-save').click();
  await expect(tid(page, 'notif-kind-sheet')).toBeHidden();
  await expect(tid(page, 'notif-kind-daily-summary-detail')).toContainText(
    '6:45 · Essen · Aufgaben',
  );

  await page.reload();
  await expect(tid(page, 'notifications-screen')).toBeVisible({ timeout: 30_000 });
  await expect(toggle(page, 'notif-kind-daily-summary')).toBeChecked();
  await expect(tid(page, 'notif-kind-daily-summary-detail')).toContainText(
    '6:45 · Essen · Aufgaben',
  );
  await back(page);
  await expect(tid(page, 'settings-notifications-row')).toContainText('3 an');
  expect(await permissionAsks(page)).toBe(0);

  // Back to the defaults for the other tests of the run.
  await tid(page, 'settings-notifications-row').click();
  await tid(page, 'notif-kind-daily-summary-detail').click();
  await tid(page, 'notif-kind-time').fill('7:30');
  await tid(page, 'notif-part-activities').click();
  await tid(page, 'notif-part-prep').click();
  await tid(page, 'notif-kind-save').click();
  await tid(page, 'notif-kind-daily-summary').click();
  await expect(toggle(page, 'notif-kind-daily-summary')).not.toBeChecked();
  await expect(tid(page, 'notif-kind-daily-summary-detail')).toContainText(
    '7:30 · Essen · Aktivitäten · Aufgaben · Vorbereitung',
  );
});

test('REQ-002, REQ-010: offline the switches are greyed out and "Deine Geräte" waits for the network', async ({
  page,
}) => {
  await login(page, 'enrico');
  // The developer switch sits behind ⊞, which only start pages have.
  await goOffline(page);
  await openNotifications(page);
  await expect(toggle(page, 'notif-kind-chore-reminders')).toBeDisabled();
  await expect(tid(page, 'notif-kinds-offline')).toHaveText(
    'Offline – zum Bearbeiten brauchst du Netz',
  );
  await expect(toggle(page, 'notif-device-switch')).toBeDisabled();
  await expect(tid(page, 'notif-devices-offline')).toHaveText(
    'Offline – deine Geräte siehst du mit Netz',
  );
});

test('AC-002: on the desktop the settings are a list with "Benachrichtigungen" beside it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'enrico');
  await openSettings(page);
  await expect(tid(page, 'settings-split-list')).toBeVisible();
  await expect(tid(page, 'settings-nav-profile')).toBeVisible();
  await expect(tid(page, 'settings-sign-out')).toBeVisible();
  await tid(page, 'settings-nav-notifications').click();
  await expect(tid(page, 'settings-split-detail')).toContainText('Dieses Gerät');
  await expect(tid(page, 'settings-split-list')).toContainText('Profil');

  // The address of the page opens the same split with it chosen.
  await open(page, '/einstellungen/benachrichtigungen');
  await expect(tid(page, 'settings-split-detail')).toContainText('Deine Geräte');
});

test('AC-037, Decision 12: "/?haushalt=…" opens the Übersicht of that household', async ({
  page,
}) => {
  await login(page, 'enrico');
  await open(page, `/?haushalt=${seedIds['hh-test']}`);
  await expect(tid(page, 'today-screen')).toBeVisible();
  await openSettings(page);
  await tid(page, 'settings-notifications-row').click();
  await expect(tid(page, 'notif-kinds')).toContainText(
    'Was und wann · Test · gilt für alle Geräte',
  );

  // A broken id changes nothing; back to the demo household.
  await open(page, '/?haushalt=kaputt');
  await expect(tid(page, 'today-screen')).toBeVisible();
  await open(page, `/?haushalt=${seedIds['hh-demo']}`);
  await openSettings(page);
  await tid(page, 'settings-notifications-row').click();
  await expect(tid(page, 'notif-kinds')).toContainText('Enrico & Nadja');
});
