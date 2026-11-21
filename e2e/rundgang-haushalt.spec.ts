import {
  ENRICO,
  expect,
  freshSeed,
  isoWeekday,
  nav,
  NADJA,
  only,
  open,
  openSettings,
  test,
  tid,
  tidPrefix,
  TODAY,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0001 — household chores, history and feedback (REQ-008), against the local backend.
// The seed makes "Bad putzen" due today whatever the weekday; the file starts from a fresh seed.

only('phone');
freshSeed();

const BAD = seedIds['chore-bad'];
/** Chore rows in a list (not their check box or badges). */
const CHORE_ROW = '[data-testid^="chore-"][role="button"]';

test('AC-035: checking "Bad putzen" removes it from Heute, logs it and offers to rebook to Nadja', async ({
  page,
}) => {
  await open(page, '/haushalt');
  const today = tid(page, 'chores-today');
  await expect(today).toContainText('Bad putzen');
  await tid(page, `chore-${BAD}-check`).click();
  await expect(toastMessage(page)).toHaveText('Erledigt von dir');
  await expect(tid(page, 'toast-action')).toHaveText(NADJA);
  await expect(tid(page, `chore-${BAD}`)).toBeHidden();
  await expect(tid(page, 'chores-today')).toBeHidden();

  await tid(page, 'chores-tab-history').click();
  const history = tid(page, 'chore-history');
  await expect(history.locator('[data-testid^="history-"]').first()).toContainText(
    `Bad putzen · ${ENRICO} · heute`,
  );
  // Gone from the "Heute" screen too.
  await nav(page, 'index');
  await expect(tid(page, 'today-chores')).toBeVisible();
  await expect(tid(page, `today-chore-${BAD}`)).toBeHidden();
});

// The AC's Saturday is "later this week" for a Monday. On a Saturday the walk-through uses
// Sunday instead; on a Sunday no day of this week is left, so the chore is checked under "Alle".
const weekday = isoWeekday(TODAY) === 6 ? 7 : 6;
const thisWeek = isoWeekday(TODAY) !== 7;

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
    if ((id === `wd-${weekday}`) !== selected) await chip.click();
  }
  await expect(tid(page, `wd-${weekday}`)).toHaveAttribute('aria-selected', 'true');
  await tid(page, 'as-rotating').click();
  await tid(page, 'chore-save').click();
  await expect(tid(page, 'chore-new-sheet')).toBeHidden();

  if (!thisWeek) await tid(page, 'chores-tab-all').click();
  const row = tid(page, thisWeek ? 'chores-thisWeek' : 'chores-all')
    .locator(CHORE_ROW)
    .filter({ hasText: 'Staubsaugen' });
  await expect(row).toHaveCount(1);
  await expect(row.locator(`[role="img"][aria-label="${ENRICO}"]`)).toHaveCount(1);
  await expect(row.locator(`[role="img"][aria-label="${NADJA}"]`)).toHaveCount(1);

  await tid(page, 'chores-tab-all').click();
  const all = tid(page, 'chores-all').locator(CHORE_ROW);
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
  await tid(page, 'chores-spontaneous-input').fill('Fenster geputzt');
  await tid(page, 'chores-spontaneous-save').click();
  await expect(tid(page, 'chores-spontaneous-sheet')).toBeHidden();
  await nav(page, 'haushalt');
  await tid(page, 'chores-tab-history').click();
  await expect(
    tid(page, 'chore-history').locator('[data-testid^="history-"]').first(),
  ).toContainText(`Fenster geputzt · spontan · ${ENRICO} · heute`);
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
