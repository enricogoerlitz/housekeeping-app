import {
  accessToken,
  chooseTime,
  createTestHousehold,
  expect,
  goOffline,
  login,
  only,
  open,
  openManaged,
  openSettings,
  rpc,
  switchHousehold,
  test,
  tid,
  toastMessage,
  unique,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0027 — "Verwalten und Konto": withdrawing an invitation and the Google hint (REQ-001,
// REQ-002), the own profile (REQ-003), renaming and deleting a household (REQ-004, REQ-005), the
// own feedback (REQ-006), the household of "Benachrichtigungen" (REQ-008) and "Jetzt abgleichen"
// (REQ-010), „Erinnern“ per chore (REQ-009). Each writing test makes its own household; the server rules are pgTAP's
// (supabase/tests/manage_household.test.sql). Runs once in spec 0028.

only('phone');

test('AC-001, AC-006: inviting names the Google test users; "Zurückziehen" removes the row', async ({
  page,
}) => {
  const householdId = await createTestHousehold(`Einladen ${unique()}`);
  const email = `neu-${unique()}@example.com`.toLowerCase();
  await login(page, 'enrico');
  await open(page, '/');
  await switchHousehold(page, householdId);
  await openManaged(page, 'members');
  await expect(
    page.getByText(
      'Ist die Adresse neu, muss Enrico sie zusätzlich bei Google als Testnutzer eintragen.',
      {
        exact: false,
      },
    ),
  ).toBeVisible();
  await expect(page.getByText('Wer eingeladen ist, kann sich mit Google anmelden.')).toHaveCount(0);
  await tid(page, 'household-invite-input').fill(email);
  await tid(page, 'household-invite-submit').click();
  await expect(toastMessage(page)).toHaveText(
    `${email} ist eingeladen. Ist die Adresse neu, muss Enrico sie bei Google eintragen.`,
  );
  const row = page.locator('[data-testid^="household-invitation-withdraw-"]').first();
  await row.click();
  await expect(toastMessage(page)).toHaveText(`Einladung an ${email} zurückgezogen`);
  await expect(page.locator('[data-testid^="household-invitation-withdraw-"]')).toHaveCount(0);
});

test('AC-017, AC-018, AC-019: the last member deletes the household after typing its name', async ({
  page,
}) => {
  const name = `Löschen ${unique()}`;
  const householdId = await createTestHousehold(name);
  await rpc(await accessToken('enrico'), 'invite_member', {
    household_id: householdId,
    email: `tom-${unique()}@example.com`,
  });
  await login(page, 'enrico');
  await open(page, '/');
  await switchHousehold(page, householdId);
  await openManaged(page, 'members');
  await expect(tid(page, `household-member-remove-${seedIds['m-enrico']}`)).toHaveCount(0);
  await tid(page, 'household-delete').click();
  const sheet = tid(page, 'household-delete-sheet');
  await expect(sheet).toContainText(`„${name}“ endgültig löschen?`);
  await expect(tid(page, 'household-delete-invitations')).toContainText('verfällt.');
  await expect(tid(page, 'household-delete-confirm')).toBeDisabled();
  await tid(page, 'household-delete-name').fill(name.toLowerCase());
  await expect(tid(page, 'household-delete-confirm')).toBeDisabled();
  await tid(page, 'household-delete-name').fill(` ${name} `);
  await tid(page, 'household-delete-confirm').click();
  await expect(toastMessage(page)).toHaveText(`„${name}“ ist gelöscht`);
  await expect(tid(page, `household-${householdId}`)).toHaveCount(0);
});

test('AC-017: with two members the sentence replaces "Haushalt löschen"', async ({ page }) => {
  await login(page, 'enrico');
  await openManaged(page, 'members');
  await expect(tid(page, 'household-delete-not-last')).toHaveText(
    'Löschen kann den Haushalt nur, wer als Letztes übrig ist.',
  );
  await expect(tid(page, 'household-delete')).toHaveCount(0);
});

test('AC-014, AC-015: renaming trims the name and refuses an empty one', async ({ page }) => {
  const householdId = await createTestHousehold(`Umbenennen ${unique()}`);
  const next = `Kuschelnest ${unique()}`;
  await login(page, 'enrico');
  await open(page, '/');
  await switchHousehold(page, householdId);
  await openManaged(page, 'members');
  await tid(page, 'household-rename').click();
  await tid(page, 'household-rename-input').fill('   ');
  await tid(page, 'household-rename-save').click();
  await expect(tid(page, 'household-rename-input-error')).toHaveText('Der Name fehlt.');
  await tid(page, 'household-rename-input').fill(` ${next} `);
  await tid(page, 'household-rename-save').click();
  await expect(tid(page, 'household-rename-sheet')).toHaveCount(0);
  await expect(tid(page, `household-${householdId}`)).toContainText(next);
});

test('AC-009, AC-010, AC-011: "Profil bearbeiten" with dislikes; closing with changes asks', async ({
  page,
}) => {
  await login(page, 'nadja');
  await openSettings(page);
  await tid(page, 'profile-edit').click();
  await expect(tid(page, 'profile-sheet')).toContainText(
    'Kommt von Google und lässt sich hier nicht ändern.',
  );
  await tid(page, 'profile-name').fill('');
  await tid(page, 'profile-save').click();
  await expect(tid(page, 'profile-name-error')).toHaveText('Der Name fehlt.');
  await tid(page, 'profile-name').fill('Nadja');
  await tid(page, 'profile-dislike-input').fill('koriander');
  await tid(page, 'profile-dislike-add').click();
  await expect(
    page.locator('[data-testid^="profile-dislike-"][data-testid$="oriander"]'),
  ).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(tid(page, 'profile-discard')).toContainText('Änderungen verwerfen?');
  await tid(page, 'profile-discard-confirm').click();
  await expect(tid(page, 'profile-sheet')).toHaveCount(0);
});

test('AC-028: the sentence about the status stands above the filters', async ({ page }) => {
  await login(page, 'enrico');
  await openManaged(page, 'feedback');
  await expect(tid(page, 'fb-status-note')).toHaveText(
    'Den Status setzt der Entwickler der App, wenn er ein Feedback bearbeitet hat.',
  );
});

test('AC-032, AC-034: the household of the settings is chosen without switching the app', async ({
  page,
}) => {
  await login(page, 'enrico');
  await open(page, '/einstellungen/benachrichtigungen?fuer-haushalt=kaputt');
  await expect(tid(page, 'notif-household-note')).toHaveText(
    'Gilt für „Enrico & Nadja“ auf allen deinen Geräten.',
  );
  await tid(page, `notif-household-${seedIds['hh-test']}`).click();
  await expect(tid(page, 'notif-household-note')).toHaveText(
    'Gilt für „Test“ auf allen deinen Geräten.',
  );
  await expect(page).toHaveURL(new RegExp(`fuer-haushalt=${seedIds['hh-test']}`));
});

test('AC-039, AC-041: "Jetzt abgleichen" is a button; offline it is greyed out', async ({
  page,
}) => {
  await login(page, 'enrico');
  await openSettings(page);
  const row = tid(page, 'sync-last');
  await expect(row).toContainText('Zuletzt abgeglichen: heute');
  await expect(row).toContainText('Jetzt abgleichen');
  await row.click();
  await expect(row).toContainText('Zuletzt abgeglichen: heute');
  await goOffline(page);
  await expect(row).toHaveAttribute('aria-disabled', 'true');
});

test('AC-035, AC-038: „Erinnern“ comes with a time; off it only shows the time; a new time is on again', async ({
  page,
}) => {
  const remind = () => tid(page, 'chore-remind');
  await login(page, 'enrico');
  await open(page, '/haushalt?fenster=neu-aufgabe');
  await expect(remind()).toHaveCount(0);
  await chooseTime(page, 'chore-due-time', '19:00');
  await expect(remind().locator('input')).toBeChecked();
  // The switch carries the test id; its description stands beside it.
  await expect(
    page.getByText('Erinnert zur Uhrzeit, wer dran ist.', { exact: false }),
  ).toBeVisible();
  await remind().locator('input').click();
  await expect(remind().locator('input')).not.toBeChecked();
  // The switch carries the test id; its description stands beside it.
  await expect(
    page.getByText('Keine Erinnerung – die Uhrzeit wird nur angezeigt.', { exact: false }),
  ).toBeVisible();
  await chooseTime(page, 'chore-due-time', undefined);
  await expect(remind()).toHaveCount(0);
  await chooseTime(page, 'chore-due-time', '18:00');
  await expect(remind().locator('input')).toBeChecked();
});
