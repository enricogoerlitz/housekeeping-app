import { readFile } from 'node:fs/promises';

import { daysBetween } from '@housekeeping/core';

import { expect, freshSeed, open, openManaged, setNetwork, test, tid, TODAY } from './helpers';
import { seedIds } from './seed-ids';

// Spec 0059 "Nichts verpassen": "In meinen Kalender" (REQ-001, REQ-002) and the Vorwarnung of a
// chore in the bell (REQ-004). Written in the build, run by the coordinator with the suite.

const MALLORCA = seedIds['trip-mallorca'];
const KUEHLSCHRANK = seedIds['chore-kuehlschrank'];

freshSeed();

test('AC-003 (0059): the trip window offers its Termin as a calendar file and as a Google link', async ({
  page,
}) => {
  await open(page, '/');
  await openManaged(page, 'trips');
  await tid(page, `trip-${MALLORCA}`).click();
  await expect(tid(page, 'trip-calendar')).toBeVisible();
  await expect(tid(page, 'trip-calendar')).toContainText('Änderungen in der App kommen nicht mit');

  const download = page.waitForEvent('download');
  await tid(page, 'trip-calendar-ics').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.ics$/);
  const path = await file.path();
  const text = await readFile(path, 'utf8');
  expect(text).toContain('BEGIN:VCALENDAR');
  expect(text).toContain('DTSTART;VALUE=DATE:');
  expect(text).toContain('\r\n');

  await page
    .context()
    .route('https://calendar.google.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }),
    );
  const popup = page.waitForEvent('popup');
  await tid(page, 'trip-calendar-google').click();
  const google = await popup;
  expect(google.url()).toContain('calendar.google.com/calendar/render?action=TEMPLATE');
  expect(google.url()).toContain('dates=');
});

test('AC-010 (0059): offline the file stays, the Google link is greyed out', async ({
  page,
  context,
}) => {
  await open(page, '/');
  await openManaged(page, 'trips');
  await tid(page, `trip-${MALLORCA}`).click();
  await setNetwork(context, false);
  await expect(tid(page, 'trip-calendar-google')).toBeDisabled();
  await expect(tid(page, 'trip-calendar-ics')).toBeEnabled();
  await setNetwork(context, true);
});

test('AC-002 / AC-009 (0059): an entry without a time starts at its Tageszeit, in the file and the Google link', async ({
  page,
}) => {
  // Lasagne today in the „Abend“, the household's 3rd Tageszeit, without a time: 17:00 for an hour
  // (decision 12, owner 27.11.2026).
  const date = TODAY.replaceAll('-', '');
  await open(page, `/kalender?eintrag=${seedIds['plan-2']}`);
  await expect(tid(page, 'entry-sheet')).toBeVisible();
  await expect(tid(page, 'entry-calendar')).toBeVisible();

  const download = page.waitForEvent('download');
  await tid(page, 'entry-calendar-ics').click();
  const text = await readFile(await (await download).path(), 'utf8');
  expect(text).toContain(`DTSTART;TZID=Europe/Berlin:${date}T170000`);
  expect(text).toContain(`DTEND;TZID=Europe/Berlin:${date}T180000`);
  expect(text).not.toContain('VALUE=DATE');

  await page
    .context()
    .route('https://calendar.google.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }),
    );
  const popup = page.waitForEvent('popup');
  await tid(page, 'entry-calendar-google').click();
  const google = new URL((await popup).url());
  expect(google.searchParams.get('dates')).toBe(`${date}T170000/${date}T180000`);
  expect(google.searchParams.get('ctz')).toBe('Europe/Berlin');
});

test('AC-018 / AC-023 (0059): a Vorwarnung at "Kühlschrank auswischen" shows in the chore and the bell', async ({
  page,
}) => {
  await open(page, `/haushalt?aufgabe=${KUEHLSCHRANK}`);
  await tid(page, 'chore-edit').click();
  await tid(page, 'chore-notice-30').click();
  await tid(page, 'chore-save').click();
  await expect(tid(page, 'chore-notice-line')).toHaveText('Vorwarnung 1 Monat vorher');

  // The Termin is the 1st of next month: within 30 days the bell lists it.
  const [year = 0, month = 0] = TODAY.split('-').map(Number);
  const first =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  await page.keyboard.press('Escape');
  await tid(page, 'notices-bell').first().click();
  if (daysBetween(TODAY, first) <= 30) {
    await expect(tid(page, 'notice-deadline')).toContainText('fällig');
  } else {
    await expect(tid(page, 'notice-deadline')).toHaveCount(0);
  }
});
