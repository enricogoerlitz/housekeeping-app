import type { Page } from '@playwright/test';

import {
  NADJA,
  back,
  day,
  expect,
  freshSeed,
  inTodaysSection,
  isoWeekday,
  leaveManaged,
  nav,
  only,
  open,
  openManaged,
  setNetwork,
  switchHousehold,
  test,
  tid,
  tidPrefix,
  TODAY,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0001 — household chores, history and feedback (REQ-008), and spec 0011 — "Übersicht" with
// a shown day, "Zu tun" and "Haushalt" with one check list (Sammel-Fenster), "Was hast du
// erledigt?", opening a chore, the empty household and list and detail on the desktop. The seed
// makes "Bad putzen" due today whatever the weekday; the file starts from a fresh seed.

freshSeed();

const BAD = seedIds['chore-bad'];
/** Chore rows in a list (not their check box or badges). */
const CHORE_ROW = '[data-testid^="chore-"][role="button"]';

/** Shows `date` on the Übersicht: pages the Tagesleiste when the day is in another section. */
async function showDay(page: Page, date: string): Promise<void> {
  if (!inTodaysSection(date)) await tid(page, 'today-week-next').click();
  await tid(page, `today-week-${date}`).click();
}

test.describe('Haushalt and Übersicht at phone width', () => {
  only('phone');

  test('AC-009 / AC-022 (0011): the Übersicht shows today: Lasagne, the preparation, due chores and open items', async ({
    page,
  }) => {
    await open(page, '/');
    await expect(page.getByText(/^Guten (Morgen|Tag|Abend), Enrico/)).toBeVisible();
    // Spec 0020, AC-007: the range without "KW", "Heute" greyed out in today's section.
    await expect(tid(page, 'today-range')).toHaveText(/^\S\S \d+\.\d+\. – \S\S \d+\.\d+\.$/);
    await expect(tid(page, 'today-week-today')).toBeDisabled();
    await expect(tid(page, 'today-meals')).toContainText('Heute geplant');
    await expect(tid(page, `today-meal-${seedIds['plan-2']}`)).toContainText('Lasagne');
    await expect(tid(page, `today-meal-${seedIds['plan-2']}`)).toContainText('Abend');
    // Spec 0020, AC-027: the latest start of tomorrow's Vorlauf lies today.
    await expect(tid(page, 'today-prep')).toContainText(
      /^Heute (bis ca\. \d+ Uhr|Abend): Kichererbsen einweichen · Kichererbsen-Eintopf \(morgen /,
    );
    await expect(page.getByText('Für morgen')).toHaveCount(0);
    await expect(tid(page, 'today-chores')).toContainText('Bad putzen');
    await expect(tid(page, 'today-shopping-count')).toHaveText(/\d+ offen/);
    // "Wie war's?" asks about the last three days only while today is shown (AC-022).
    await expect(tid(page, 'today-recap')).toBeVisible();
    await showDay(page, day(1));
    await expect(page.locator('[data-testid="today-recap"]:visible')).toHaveCount(0);
  });

  test('AC-008 / AC-012 (0011): another shown day survives opening a card; a collection carries "Sammlung"', async ({
    page,
  }) => {
    await open(page, '/');
    await showDay(page, day(1));
    await expect(tid(page, 'today-meals')).toContainText('Geplant am');
    // Spec 0020, Entscheidung 1: tomorrow lies in today's section, "Heute" stays greyed out.
    await expect(tid(page, 'today-week-today')).toBeDisabled();
    const card = tid(page, `today-meal-${seedIds['plan-8']}`);
    await expect(card).toContainText('Kichererbsen-Eintopf');
    await card.click();
    await expect(tid(page, 'recipe-title')).toHaveText('Kichererbsen-Eintopf');
    // "‹ Essen" leads to the recipe list (spec 0008); the Übersicht keeps the shown day.
    await back(page);
    await nav(page, 'index');
    await expect(tid(page, `today-meal-${seedIds['plan-8']}`)).toBeVisible();

    // The seed plans "Grillabend" next Saturday (today on a Saturday).
    await tid(page, `today-week-${TODAY}`).click();
    const saturday = day((6 - isoWeekday(TODAY) + 7) % 7);
    await showDay(page, saturday);
    const grill = seedIds['plan-grillabend-sa'];
    await expect(tid(page, `today-meal-${grill}`)).toContainText('Grillabend');
    await expect(tid(page, `today-badge-${grill}`)).toHaveText('Sammlung');
  });

  test('AC-035 (0001) / AC-033 (0011): checking "Bad putzen" strikes it through, then it leaves and is in the history', async ({
    page,
  }) => {
    await open(page, '/haushalt');
    await expect(tid(page, 'chores-today')).toContainText('Bad putzen');
    const check = tid(page, `chore-${BAD}-check`);
    await check.click();
    await expect(check).toHaveAttribute('aria-checked', 'true');
    // No toast any more: the row leaves 2 s after the last tap (Sammel-Fenster).
    await expect(tid(page, `chore-${BAD}`)).toBeHidden({ timeout: 6_000 });

    await tid(page, 'chores-tab-history').click();
    const rows = tid(page, 'chore-history').locator('[data-testid^="history-"][role="button"]');
    await expect(rows.first()).toContainText('Bad putzen');
    await nav(page, 'index');
    await expect(tid(page, 'today-chores')).toBeVisible();
    await expect(tid(page, `today-chore-${BAD}`)).toBeHidden();
  });

  test('AC-036: "Staubsaugen" weekly, alternating, appears in the household; no title, no chore', async ({
    page,
  }) => {
    // A weekday later this week (Sunday on a Saturday); on a Sunday it is checked under "Alle".
    const weekday = isoWeekday(TODAY) === 6 ? 7 : 6;
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

    await tid(page, 'chores-tab-all').click();
    const row = tid(page, 'chores-all').locator(CHORE_ROW).filter({ hasText: 'Staubsaugen' });
    await expect(row).toHaveCount(1);
    // Spec 0018, AC-016: an alternating chore shows only the person whose turn it is.
    await expect(row.locator('[role="img"][aria-label^="dran: "]')).toHaveCount(1);
    await expect(row.locator(`[role="img"][aria-label="${NADJA}"]`)).toHaveCount(0);

    await tid(page, 'chore-new').click();
    await tid(page, 'chore-save').click();
    await expect(tid(page, 'chore-title-error')).toHaveText('Titel fehlt');
    await expect(tid(page, 'chore-new-sheet')).toBeVisible();
    await tid(page, 'chore-new-sheet-close').click();
    await expect(
      tid(page, 'chores-all').locator(CHORE_ROW).filter({ hasText: 'Staubsaugen' }),
    ).toHaveCount(1);
  });

  test('AC-041 / AC-042 (0011): "Was anderes erledigt?" catches "Fenster Kuche" as "Fenster Küche"', async ({
    page,
  }) => {
    await open(page, '/');
    await tid(page, 'today-spontaneous').click();
    await expect(tid(page, 'chore-done-sheet')).toContainText('Was hast du erledigt?');
    await expect(tid(page, 'chore-done-save')).toBeDisabled();
    // AC-070 (0031): with an empty search the household's chores already stand there.
    await expect(tid(page, 'chore-done-search-hits')).toContainText('Fenster Küche');
    await tid(page, 'chore-done-search-input').fill('Fenster Kuche');
    await expect(tid(page, 'chore-done-search-create-new')).toBeDisabled();
    await expect(tid(page, 'chore-done-search-brake')).toContainText('Meinst du Fenster Küche?');
    await tid(page, 'chore-done-search-brake-accept').click();
    await expect(tid(page, 'chore-done-chosen')).toContainText('Fenster Küche');
    await tid(page, 'chore-done-save').click();
    await expect(tid(page, 'chore-done-sheet')).toBeHidden();
    await expect(toastMessage(page)).toHaveText('„Fenster Küche“ eingetragen');

    await nav(page, 'haushalt');
    await tid(page, 'chores-tab-all').click();
    await expect(
      tid(page, 'chores-all').locator(CHORE_ROW).filter({ hasText: 'Fenster Küche' }),
    ).toHaveCount(1);
    await tid(page, 'chores-tab-history').click();
    await expect(
      tid(page, 'chore-history').locator('[data-testid^="history-"][role="button"]').first(),
    ).toContainText('Fenster Küche');
  });

  test('AC-042 (0011): offline the hits stay, "Als erledigt eintragen" is greyed out', async ({
    page,
    context,
  }) => {
    await open(page, '/');
    await tid(page, 'today-spontaneous').click();
    await expect(tid(page, 'chore-done-sheet')).toBeVisible();
    await setNetwork(context, false);
    await tid(page, 'chore-done-search-input').fill('fenster');
    await expect(tidPrefix(page, 'chore-done-search-hit-').first()).toBeVisible();
    await tidPrefix(page, 'chore-done-search-hit-').first().click();
    await expect(tid(page, 'chore-done-save')).toBeDisabled();
    await expect(tid(page, 'chore-done-offline')).toHaveText(
      'Offline – zum Bearbeiten brauchst du Netz',
    );
  });

  test('AC-049 (0011): opening "Küche wischen" in "Alle" shows its facts and actions', async ({
    page,
  }) => {
    await open(page, '/haushalt');
    await tid(page, 'chores-tab-all').click();
    await tid(page, `chore-${seedIds['chore-kueche']}`).click();
    const sheet = tid(page, 'chore-sheet');
    await expect(sheet).toContainText('Küche wischen');
    await expect(tid(page, 'chore-facts')).toContainText('wöchentlich');
    await expect(tid(page, 'chore-facts')).toContainText(NADJA.split(' ')[0] ?? 'Nadja');
    await expect(tid(page, 'chore-next')).toContainText('Nächstes Mal');
    await expect(tid(page, 'chore-last')).toBeVisible();
    for (const id of ['chore-done', 'chore-postpone', 'chore-skip', 'chore-edit', 'chore-delete']) {
      await expect(tid(page, id), id).toBeVisible();
    }
    await tid(page, 'chore-edit').click();
    await expect(tid(page, 'chore-title')).toHaveValue('Küche wischen');
    await tid(page, 'chore-edit-cancel').click();
    await expect(tid(page, 'chore-facts')).toBeVisible();
  });

  test('AC-048 (0011): the household "Test" without chores offers "Aufgabe anlegen"', async ({
    page,
  }) => {
    await open(page, '/');
    await switchHousehold(page, seedIds['hh-test']);
    await nav(page, 'haushalt');
    await tid(page, 'chores-tab-all').click();
    await expect(tid(page, 'chores-empty')).toContainText('Noch keine Aufgaben');
    await expect(tid(page, 'chores-empty-new')).toHaveText(/Aufgabe anlegen/);
  });

  test('AC-039: feedback "Liste nach Rezept gruppieren" appears as "neu"; empty feedback cannot be sent', async ({
    page,
  }) => {
    await open(page, '/');
    await openManaged(page, 'feedback');
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
    await leaveManaged(page);
  });
});

test.describe('Haushalt at desktop width', () => {
  only('desktop');

  test('AC-046 / AC-047 (0011): three view tabs; "Alle" is list and detail side by side', async ({
    page,
  }) => {
    await open(page, '/haushalt');
    for (const tab of ['upcoming', 'all', 'history']) {
      await expect(tid(page, `chores-tab-${tab}`), tab).toHaveAttribute('role', 'tab');
    }
    await tid(page, 'chores-tab-all').click();
    await expect(tid(page, 'chores-split')).toContainText('Wähl eine Aufgabe aus');
    await tid(page, `chore-${seedIds['chore-kueche']}`).click();
    await expect(tid(page, 'chore-panel-title')).toHaveText('Küche wischen');
    const list = await tid(page, 'chores-all').boundingBox();
    const panel = await tid(page, 'chore-panel').boundingBox();
    expect(list && panel && list.x + list.width <= panel.x, 'list left of the detail').toBe(true);
  });
});
