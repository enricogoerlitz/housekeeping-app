import {
  expect,
  nav,
  only,
  open,
  openSettings,
  test,
  tid,
  tidPrefix,
  toastMessage,
} from './helpers';

// Spec 0001 — household chores, history and feedback (REQ-008).
// Fixed today is Monday 16 Nov 2026; Saturday (ISO weekday 6) is later in the same week.

only('phone');

test('AC-035: checking "Bad putzen" removes it from Heute, logs it and offers to rebook to Nadja', async ({
  page,
}) => {
  await open(page, '/haushalt');
  const today = tid(page, 'chores-today');
  await expect(today).toContainText('Bad putzen');
  await tid(page, 'chore-chore-bad-check').click();
  await expect(toastMessage(page)).toHaveText('Erledigt von dir');
  await expect(tid(page, 'toast-action')).toHaveText('Nadja');
  await expect(tid(page, 'chore-chore-bad')).toBeHidden();
  await expect(tid(page, 'chores-today')).toBeHidden();

  await tid(page, 'chores-tab-history').click();
  const history = tid(page, 'chore-history');
  await expect(history.locator('[data-testid^="history-"]').first()).toHaveText(
    /Bad putzen · Enrico · heute/,
  );
  // Gone from the "Heute" screen too.
  await nav(page, 'index');
  await expect(tid(page, 'today-chores')).toBeVisible();
  await expect(tid(page, 'today-chore-chore-bad')).toBeHidden();
});

test('AC-036: "Staubsaugen" weekly on Saturday, alternating, appears under "Diese Woche"; no title, no chore', async ({
  page,
}) => {
  await open(page, '/haushalt');
  await tid(page, 'chore-new').click();
  await tid(page, 'chore-title').fill('Staubsaugen');
  await tid(page, 'rec-weekly').click();
  for (const chip of await tidPrefix(page, 'wd-').all()) {
    const id = await chip.getAttribute('data-testid');
    if (id === 'wd-error') continue;
    const selected = (await chip.getAttribute('aria-selected')) === 'true';
    if ((id === 'wd-6') !== selected) await chip.click();
  }
  await expect(tid(page, 'wd-6')).toHaveAttribute('aria-selected', 'true');
  await tid(page, 'as-rotating').click();
  await tid(page, 'chore-save').click();
  await expect(tid(page, 'chore-new-sheet')).toBeHidden();

  const row = tid(page, 'chores-thisWeek')
    .locator('[data-testid^="chore-"][role="button"]')
    .filter({ hasText: 'Staubsaugen' });
  await expect(row).toHaveCount(1);
  await expect(row.locator('[role="img"][aria-label="Enrico"]')).toHaveCount(1);
  await expect(row.locator('[role="img"][aria-label="Nadja"]')).toHaveCount(1);

  await tid(page, 'chores-tab-all').click();
  const all = tid(page, 'chores-all').locator('[data-testid^="chore-chore-"][role="button"]');
  const count = await all.count();
  await tid(page, 'chore-new').click();
  await tid(page, 'chore-save').click();
  await expect(tid(page, 'chore-title-error')).toHaveText('Titel fehlt');
  await expect(tid(page, 'chore-new-sheet')).toBeVisible();
  await tid(page, 'chore-new-sheet-close').click();
  await expect(all).toHaveCount(count);
});

test('AC-037: "Was anderes erledigt?" logs "Fenster geputzt · spontan · Enrico · heute"', async ({
  page,
}) => {
  await open(page, '/');
  await tid(page, 'today-spontaneous').click();
  await tid(page, 'spontaneous-input').fill('Fenster geputzt');
  await tid(page, 'spontaneous-submit').click();
  await expect(tid(page, 'spontaneous-sheet')).toBeHidden();
  await nav(page, 'haushalt');
  await tid(page, 'chores-tab-history').click();
  await expect(tid(page, 'chore-history').locator('[data-testid^="history-"]').first()).toHaveText(
    /Fenster geputzt · spontan · Enrico · heute/,
  );
});

test('AC-039: feedback "Liste nach Rezept gruppieren" appears as "neu"; empty feedback cannot be sent', async ({
  page,
}) => {
  await open(page, '/');
  await openSettings(page);
  await tid(page, 'link-feedback').click();
  await expect(tid(page, 'feedback')).toBeVisible();
  await expect(tid(page, 'fb-send')).toBeDisabled();
  await tid(page, 'fb-text').fill('   ');
  await expect(tid(page, 'fb-send')).toBeDisabled();

  await tid(page, 'fb-text').fill('Liste nach Rezept gruppieren');
  await tid(page, 'fb-send').click();
  const entry = tidPrefix(page, 'fb-entry-').filter({ hasText: 'Liste nach Rezept gruppieren' });
  await expect(entry).toHaveCount(1);
  await expect(entry.locator('[data-testid^="fb-status-"]')).toHaveText('neu');
  await expect(tid(page, 'fb-send')).toBeDisabled();
});
