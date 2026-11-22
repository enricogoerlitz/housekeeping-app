import { day, expect, freshSeed, only, open, setNetwork, test, tid, toastMessage } from './helpers';
import { seedIds } from './seed-ids';

// Spec 0026 — chores: dates, "Später", Nachtragen and trips. The seed makes "Bad putzen" due today
// whatever the weekday; "Glühbirne Flur tauschen" is one-off without a date, "Fenster Küche" is
// "bei Bedarf". The file starts from a fresh seed.

freshSeed();

const BAD = seedIds['chore-bad'];
const BULB = seedIds['chore-gluehbirne'];
const WINDOW = seedIds['chore-fenster-kueche'];

test.describe('Haushalt: dates and trips at phone width', () => {
  only('phone');

  test('AC-001 / AC-003: "Einmalig" offers "Ohne Datum", "Datum …" and the next 14 days; days before today are blocked', async ({
    page,
  }) => {
    await open(page, '/haushalt?fenster=neu-aufgabe');
    await tid(page, 'rec-once').click();
    await expect(tid(page, 'once-date-none')).toBeVisible();
    await expect(tid(page, `once-date-${day(0)}`)).toHaveText('heute');
    await expect(tid(page, `once-date-${day(1)}`)).toHaveText('morgen');
    await tid(page, 'once-date-pick').click();
    await expect(tid(page, 'once-date-calendar-picker')).toBeVisible();
    await expect(tid(page, `once-date-calendar-day-${day(-1)}`)).toBeDisabled();
  });

  test('AC-008 / AC-011: "Bei Bedarf" has no date fields and makes it "Egal"', async ({ page }) => {
    await open(page, '/haushalt?fenster=neu-aufgabe');
    await tid(page, 'rec-months').click();
    await expect(tid(page, 'next-due-pick')).toBeVisible();
    await expect(tid(page, 'last-done-pick')).toBeVisible();
    await tid(page, 'rec-asNeeded').click();
    await expect(tid(page, 'next-due-pick')).toHaveCount(0);
    await expect(tid(page, 'last-done-pick')).toHaveCount(0);
    await expect(tid(page, 'as-anyone')).toHaveAttribute('aria-selected', 'true');
  });

  test('AC-012: the buttons follow the rhythm', async ({ page }) => {
    await open(page, `/haushalt?ansicht=alle&aufgabe=${WINDOW}`);
    await expect(tid(page, 'chore-done')).toBeVisible();
    await expect(tid(page, 'chore-entries')).toHaveText('Alle Einträge ›');
    await expect(tid(page, 'chore-postpone')).toHaveCount(0);
    await expect(tid(page, 'chore-skip')).toHaveCount(0);
    await open(page, `/haushalt?ansicht=alle&aufgabe=${BULB}`);
    await expect(tid(page, 'chore-postpone')).toBeVisible();
    await expect(tid(page, 'chore-skip')).toHaveCount(0);
  });

  test('AC-012: offline all three buttons of "Bad putzen" stay and are greyed out', async ({
    page,
    context,
  }) => {
    await open(page, `/haushalt?ansicht=alle&aufgabe=${BAD}`);
    await setNetwork(context, false);
    for (const id of ['chore-done', 'chore-postpone', 'chore-skip']) {
      await expect(tid(page, id), id).toBeDisabled();
    }
    await expect(tid(page, 'chore-sheet')).toContainText(
      'Offline – zum Bearbeiten brauchst du Netz',
    );
  });

  test('AC-013: "Später" opens a menu; "Übermorgen" moves the date, "Rückgängig" brings it back', async ({
    page,
  }) => {
    await open(page, `/haushalt?aufgabe=${BAD}`);
    await tid(page, 'chore-postpone').click();
    await expect(tid(page, 'chore-postpone-menu')).toContainText('Morgen · ');
    await expect(tid(page, 'chore-postpone-menu')).toContainText('Übermorgen · ');
    await expect(tid(page, 'chore-postpone-menu')).toContainText('Datum …');
    await tid(page, 'chore-postpone-plus2').click();
    await expect(toastMessage(page)).toContainText('Verschoben auf ');
    await expect(tid(page, `chore-${BAD}`)).toHaveCount(0);
  });

  test('AC-016 / AC-017: "Ohne Termin" holds the one-off chore; no "weitere Aufgaben später"', async ({
    page,
  }) => {
    await open(page, '/haushalt');
    await expect(tid(page, 'chores-noDate')).toContainText('Glühbirne Flur tauschen');
    await expect(page.getByText(/weitere Aufgaben? später/)).toHaveCount(0);
    await expect(page.getByText('überfällig')).toHaveCount(0);
  });

  test('AC-025: "Alle Einträge ›" opens the history filtered by the chore, also after reloading', async ({
    page,
  }) => {
    await open(page, `/haushalt?ansicht=alle&aufgabe=${BAD}`);
    await tid(page, 'chore-entries').click();
    await expect(page).toHaveURL(new RegExp(`nur-aufgabe=${BAD}`));
    await expect(tid(page, 'history-filter-chore')).toContainText('Bad putzen');
    await page.reload();
    await expect(tid(page, 'history-filter-chore')).toContainText('Bad putzen');
    await tid(page, 'history-filter-chore').click();
    await expect(page).not.toHaveURL(/nur-aufgabe=/);
  });

  test('AC-020: "Datum …" in "Was hast du erledigt?" blocks days before today − 30 and after today', async ({
    page,
  }) => {
    await open(page, '/haushalt?fenster=erledigt');
    await tid(page, 'chore-done-day').click();
    await tid(page, 'chore-done-day-pick').click();
    await expect(tid(page, 'chore-done-calendar-picker')).toBeVisible();
    await expect(tid(page, `chore-done-calendar-day-${day(1)}`)).toBeDisabled();
  });

  test('AC-058: "Reise eintragen" says what a trip does under "Wer?"', async ({ page }) => {
    await open(page, '/reisen?fenster=neu-reise');
    await expect(tid(page, 'trip-effect-note')).toHaveText(
      'Wer weg ist, fehlt bei „Wer isst mit?“, bekommt keine Nachrichten und wird bei Aufgaben übersprungen. Was niemand erledigen kann, wartet bis danach.',
    );
    await expect(page.getByText(/^Wer weg ist, fehlt bei „Wer isst mit\?“\.$/)).toHaveCount(0);
  });
});
