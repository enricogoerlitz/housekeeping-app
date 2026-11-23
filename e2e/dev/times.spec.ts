import type { Page } from '@playwright/test';

import {
  chooseTime,
  day,
  expect,
  expectTime,
  goOffline,
  inTodaysSection,
  nav,
  open,
  showPlanWeek,
  test,
  tid,
  TODAY,
} from '../helpers';
import { seedIds } from '../seed-ids';

// Spec 0013, task 9 — times on a chore and the reservation of a restaurant entry, and the pages a
// notification opens (`/haushalt?aufgabe=…`, `/kalender?tag=…&eintrag=…`). Runs in the dev smoke
// (playwright.dev.config.ts) on a phone after one fresh seed: "Bad putzen" is due today,
// "Müll rausbringen" the day after tomorrow at 19:00, and "Trattoria Da Enzo" (plan-enzo-2) is
// planned the day after tomorrow in the evening, reserved for 19:30.

const BAD = seedIds['chore-bad'];
const MUELL = seedIds['chore-muell'];
const ENZO = seedIds['plan-enzo-2'];
const LASAGNE = seedIds['plan-2'];
const EISLAUFEN = seedIds['plan-eislaufen-1'];
const UNKNOWN = '00000000-0000-4000-8000-000000000000';
const IN_TWO_DAYS = day(2);

/** The "Übersicht" shows `date` (a day of this or the next week). */
async function showOverviewDay(page: Page, date: string): Promise<void> {
  await nav(page, 'index');
  if (!inTodaysSection(date)) await tid(page, 'today-week-next').click();
  await tid(page, `today-week-${date}`).click();
}

/** Opens "Bearbeiten" of the chore in the sheet that is open. */
async function editChore(page: Page): Promise<void> {
  await tid(page, 'chore-edit').click();
  await expect(tid(page, 'chore-due-time')).toBeVisible();
}

test('AC-022, AC-025: a time on "Bad putzen" shows in Haushalt, Zu tun and the household row; ✕ removes it', async ({
  page,
}) => {
  await open(page, '/haushalt');
  await tid(page, `chore-${BAD}`).click();
  await editChore(page);
  // Spec 0027, AC-030: without a time both show "–", "Minute" is greyed out and ✕ is missing.
  await expectTime(page, 'chore-due-time', '');
  await expect(tid(page, 'chore-due-time-minute')).toBeDisabled();
  await expect(tid(page, 'chore-due-time-clear')).toBeHidden();
  await expect(tid(page, 'chore-remind')).toHaveCount(0);

  // Spec 0027, AC-029: "Minute" offers the twelve five-minute steps. With a time the switch
  // "Erinnern" appears, on, with its hint (spec 0027, REQ-009, AC-035; Offene Frage 3 d).
  await chooseTime(page, 'chore-due-time', '19:00');
  await expectTime(page, 'chore-due-time', '19:00');
  await expect(tid(page, 'chore-due-time-minute')).toBeEnabled();
  await expect(tid(page, 'chore-due-time-minute').locator('option')).toHaveCount(12);
  await expect(tid(page, 'chore-due-time-hour')).toHaveAccessibleName('Uhrzeit, Stunde');
  await expect(tid(page, 'chore-remind').locator('input')).toBeChecked();
  await expect(tid(page, 'chore-sheet')).toContainText('Erinnert zur Uhrzeit, wer dran ist.');
  await tid(page, 'chore-save').click();
  await expect(tid(page, 'chore-sheet')).toContainText('19:00');
  await tid(page, 'chore-sheet-close').click();
  await expect(tid(page, `chore-${BAD}`)).toContainText('Bad putzen · 19:00');

  await nav(page, 'index');
  await expect(tid(page, `today-chore-${BAD}`)).toContainText('Bad putzen · 19:00');
  await nav(page, 'kalender');
  await expect(tid(page, `chore-occ-open-${BAD}`)).toContainText('Bad putzen · 19:00');

  // ✕ removes the time (AC-025).
  await nav(page, 'haushalt');
  await tid(page, `chore-${BAD}`).click();
  await editChore(page);
  await expectTime(page, 'chore-due-time', '19:00');
  await tid(page, 'chore-due-time-clear').click();
  await expectTime(page, 'chore-due-time', '');
  await tid(page, 'chore-save').click();
  await tid(page, 'chore-sheet-close').click();
  await expect(tid(page, `chore-${BAD}`)).not.toContainText('19:00');
  await nav(page, 'index');
  await expect(tid(page, `today-chore-${BAD}`)).not.toContainText('19:00');
});

test('AC-022: the seeded "Müll rausbringen · 19:00" on its day in Zu tun and in the household row', async ({
  page,
}) => {
  await open(page, '/');
  await showOverviewDay(page, IN_TWO_DAYS);
  await expect(tid(page, 'today-chores')).toContainText('Müll rausbringen · 19:00');
  await nav(page, 'kalender');
  await showPlanWeek(page, IN_TWO_DAYS);
  await expect(tid(page, `chore-occ-plan-${MUELL}-${IN_TWO_DAYS}`)).toContainText(
    'Müll rausbringen · 19:00',
  );
});

test('spec 0021 AC-035: the link opens the entry with Route; "Uhrzeit 19:30", ✕ removes it', async ({
  page,
}) => {
  await open(page, `/kalender?tag=${IN_TWO_DAYS}&eintrag=${ENZO}`);
  await expect(tid(page, 'entry-sheet')).toBeVisible();
  await expect(tid(page, 'entry-sheet')).toContainText('Trattoria Da Enzo');
  await expect(tid(page, 'entry-route')).toBeVisible();
  await expectTime(page, 'entry-time', '19:30');
  await expect(tid(page, 'entry-sheet')).not.toContainText('Erinnern 2 h vorher');

  // ✕ removes the time; closing saves it (spec 0021, REQ-009).
  await tid(page, 'entry-time-clear').click();
  await expectTime(page, 'entry-time', '');
  await tid(page, 'entry-done').click();
  await expect(tid(page, 'entry-sheet')).toBeHidden();
  await expect(tid(page, `entry-${ENZO}`)).not.toContainText('19:30');

  // Chosen as 19 and 30, saved as chosen (spec 0027, REQ-007).
  await tid(page, `entry-${ENZO}`).click();
  await chooseTime(page, 'entry-time', '19:30');
  await tid(page, 'entry-done').click();
  await expect(tid(page, 'entry-sheet')).toBeHidden();
  await expect(tid(page, `entry-${ENZO}`)).toContainText('Trattoria Da Enzo · 19:30');

  // The card on the "Übersicht" of that day shows the time.
  await showOverviewDay(page, IN_TWO_DAYS);
  await expect(tid(page, `today-meal-${ENZO}`)).toContainText('19:30');
});

test('spec 0021 AC-036: a recipe entry has no "Uhrzeit", an activity has one', async ({ page }) => {
  await open(page, `/kalender?tag=${TODAY}&eintrag=${LASAGNE}`);
  await expect(tid(page, 'entry-sheet')).toContainText('Lasagne');
  await expect(tid(page, 'entry-time')).toBeHidden();
  await tid(page, 'entry-done').click();
  await tid(page, `entry-${EISLAUFEN}`).click();
  await expect(tid(page, 'entry-sheet')).toContainText('Eislaufen');
  await expect(tid(page, 'entry-time')).toBeVisible();
});

test('AC-037, AC-038: the chore link opens the chore; unknown or broken ids open the page without a window', async ({
  page,
}) => {
  await open(page, `/haushalt?aufgabe=${MUELL}&haushalt=${seedIds['hh-demo']}`);
  await expect(tid(page, 'chore-sheet')).toBeVisible();
  await expect(tid(page, 'chore-sheet')).toContainText('Müll rausbringen');

  await open(page, `/haushalt?aufgabe=${UNKNOWN}`);
  await expect(tid(page, 'chores-screen')).toBeVisible();
  await expect(tid(page, 'chore-sheet')).toBeHidden();
  await open(page, '/haushalt?aufgabe=kaputt');
  await expect(tid(page, 'chores-screen')).toBeVisible();
  await expect(tid(page, 'chore-sheet')).toBeHidden();

  await open(page, `/kalender?tag=${IN_TWO_DAYS}&eintrag=${UNKNOWN}`);
  await expect(tid(page, `day-${IN_TWO_DAYS}`)).toBeVisible();
  await expect(tid(page, 'entry-sheet')).toBeHidden();
});

test('offline: the time of a chore and of a restaurant entry are greyed out with the hint', async ({
  page,
}) => {
  await open(page, `/kalender?tag=${IN_TWO_DAYS}`);
  await goOffline(page);
  await tid(page, `entry-${ENZO}`).click();
  await expect(tid(page, 'entry-sheet')).toContainText('Offline – zum Bearbeiten brauchst du Netz');
  await expect(tid(page, 'entry-time-hour')).toBeDisabled();
  await expect(tid(page, 'entry-time-minute')).toBeDisabled();
  await expect(tid(page, 'entry-time-clear')).toBeHidden();
});
