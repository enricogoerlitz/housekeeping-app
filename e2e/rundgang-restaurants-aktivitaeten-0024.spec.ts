import {
  back,
  chooseTime,
  expect,
  freshSeed,
  goOffline,
  isPhone,
  open,
  openManaged,
  secondDevice,
  test,
  tid,
  toastMessage,
  TODAY,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0024: every field of a restaurant in "Restaurant bearbeiten", website and restaurant photo,
// "Einplanen" as a window that stays on the page, visits that open the calendar, the activities
// under "Verwalten" with list and detail, deleting both with "Rückgängig". Typed only here; the
// full suite runs once in spec 0028. Seed: "Trattoria Da Enzo" 19 days ago and the day after
// tomorrow, "Eislaufen" today with "Hohenschönhausen", "Pho Saigon" without a note.

freshSeed();

const ENZO = seedIds['rest-enzo'];
const PHO = seedIds['rest-pho'];
const EISLAUFEN = seedIds['act-eislaufen'];
const BOULDERN = seedIds['act-bouldern'];
const ENZO_PAST = seedIds['plan-enzo-1'];
const ENZO_LATER = seedIds['plan-enzo-2'];

test('AC-001, AC-003: "Bearbeiten" changes the cuisine; without a name the window stays', async ({
  page,
}) => {
  await open(page, `/restaurant/${PHO}`);
  await tid(page, 'restaurant-edit').click();
  await expect(tid(page, 'restaurant-name')).toHaveValue('Pho Saigon');
  await tid(page, 'restaurant-name').fill('');
  await tid(page, 'restaurant-save').click();
  await expect(tid(page, 'restaurant-edit-sheet')).toContainText('Name fehlt');
  await tid(page, 'restaurant-name').fill('Pho Saigon');
  // „Küche“ suggests the household's cuisines; Enter takes the typed one (spec 0036, AC-008).
  const chosenCuisine = tid(page, 'restaurant-cuisine-chosen');
  if (await chosenCuisine.isVisible()) await chosenCuisine.click();
  await tid(page, 'restaurant-cuisine-input').fill('Griechisch');
  await tid(page, 'restaurant-cuisine-input').press('Enter');
  await tid(page, 'restaurant-save').click();
  await expect(toastMessage(page)).toHaveText('Restaurant gespeichert');
  await expect(tid(page, 'restaurant-meta')).toContainText('Griechisch');
});

test('AC-006, AC-007 / AC-014, AC-015 (0054): the note is read only; the pencil edits it, "Notiz hinzufügen" opens the window in "Notiz"', async ({
  page,
}) => {
  await open(page, `/restaurant/${ENZO}`);
  await expect(tid(page, 'restaurant-notes-text')).toContainText('Trüffelpasta!');
  // Spec 0054, AC-014: an existing note has no second way to the form.
  await expect(tid(page, 'restaurant-notes-edit')).toHaveCount(0);
  await tid(page, 'restaurant-edit').click();
  await expect(tid(page, 'restaurant-edit-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await open(page, `/restaurant/${PHO}`);
  await expect(tid(page, 'restaurant-notes-text')).toHaveText('Noch keine Notiz');
  await expect(tid(page, 'restaurant-notes-edit')).toHaveText('Notiz hinzufügen');
  await tid(page, 'restaurant-notes-edit').click();
  await expect(tid(page, 'restaurant-notes')).toBeFocused();
});

test('AC-008, AC-009: the website gets "https://"; other schemes and no host are refused', async ({
  page,
}) => {
  await open(page, `/restaurant/${ENZO}`);
  await tid(page, 'restaurant-edit').click();
  await tid(page, 'restaurant-website').fill('javascript:alert(1)');
  await tid(page, 'restaurant-save').click();
  await expect(tid(page, 'restaurant-edit-sheet')).toContainText(
    'Nur Adressen mit http:// oder https://',
  );
  await tid(page, 'restaurant-website').fill('localhost');
  await tid(page, 'restaurant-save').click();
  await expect(tid(page, 'restaurant-edit-sheet')).toContainText('Keine gültige Adresse');
  await tid(page, 'restaurant-website').fill('trattoria-da-enzo.de');
  await tid(page, 'restaurant-save').click();
  // The run needs no internet: the restaurant's site gets a stub page.
  await page
    .context()
    .route(/^https:\/\/trattoria-da-enzo\.de\//, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' }),
    );
  const popup = page.waitForEvent('popup');
  await tid(page, 'restaurant-website-open').click();
  const site = await popup;
  await site.waitForLoadState();
  expect(site.url()).toContain('https://trattoria-da-enzo.de');
  await site.close();
  await expect(tid(page, 'restaurant-title')).toHaveText('Trattoria Da Enzo');
});

test('AC-016, AC-017: "Einplanen" stays on the page; "Ansehen" shows the week', async ({
  page,
}) => {
  await open(page, `/restaurant/${PHO}`);
  await tid(page, 'restaurant-plan').click();
  await expect(tid(page, 'plan-recipe-title')).toHaveText('Pho Saigon');
  await tid(page, 'plan-recipe-week-next').click();
  await chooseTime(page, 'plan-place-time', '19:30');
  await tid(page, 'plan-recipe-save').click();
  await expect(tid(page, 'restaurant-title')).toHaveText('Pho Saigon');
  await expect(toastMessage(page)).toContainText('Eingeplant:');
  await page.getByRole('button', { name: 'Ansehen' }).click();
  await expect(page).toHaveURL(/\/kalender\?tag=/);
});

test('AC-018: without a day there is no time and the button says "Vormerken"', async ({ page }) => {
  await open(page, `/aktivitaet/${EISLAUFEN}`);
  await tid(page, 'activity-plan').click();
  await tid(page, 'plan-recipe-later').click();
  await expect(tid(page, 'plan-place-time')).toHaveCount(0);
  await expect(tid(page, 'plan-recipe-save')).toHaveText('Vormerken');
  await tid(page, 'plan-recipe-save').click();
  await expect(toastMessage(page)).toContainText('Vorgemerkt');
});

test('AC-023: the visits line jumps to "Besuche"; a day opens the calendar in its week', async ({
  page,
}) => {
  await open(page, `/restaurant/${ENZO}`);
  await tid(page, 'restaurant-visits-jump').click();
  const first = tid(page, 'restaurant-history-0');
  await expect(first).toBeInViewport();
  await expect(tid(page, 'restaurant-history-1')).toHaveCount(0);
  await first.click();
  await expect(page).toHaveURL(/\/kalender\?tag=/);
  await expect(tid(page, `entry-${ENZO_PAST}`)).toBeVisible();
});

test('AC-026, AC-028, AC-030: activities under "Verwalten", list and detail from 700 px', async ({
  page,
}) => {
  await open(page, '/kalender');
  await expect(tid(page, 'calendar-activities')).toHaveCount(0);
  await openManaged(page, 'activities');
  await expect(page).toHaveURL(/\/aktivitaeten/);
  await tid(page, `activity-${EISLAUFEN}`).click();
  if (isPhone(page)) {
    await expect(page).toHaveURL(new RegExp(`/aktivitaet/${EISLAUFEN}`));
    return;
  }
  await expect(tid(page, 'activities-split')).toBeVisible();
  await expect(tid(page, `activity-${EISLAUFEN}`)).toHaveAttribute('aria-selected', 'true');
  await tid(page, `activity-${BOULDERN}`).click();
  await expect(tid(page, 'activity-title')).toHaveText('Bouldern');
  await tid(page, 'activity-close').click();
  await expect(tid(page, 'activities-split')).toHaveCount(0);
});

test('AC-033: the old addresses show "Nicht gefunden"; offline the page reads', async ({
  page,
}) => {
  await open(page, '/kalender/aktivitaeten');
  await expect(page.getByText('Diese Seite gibt es nicht (mehr).')).toBeVisible();
  await open(page, '/aktivitaeten');
  await goOffline(page);
  await expect(tid(page, `activity-${EISLAUFEN}`)).toBeVisible();
  await expect(tid(page, 'activity-add')).toBeDisabled();
});

test('AC-034, AC-035: "Löschen" asks first, then names the entry that goes, without undo (spec 0036: asks first)', async ({
  page,
}) => {
  await open(page, `/restaurant/${ENZO}`);
  await tid(page, 'restaurant-more').click();
  await page.getByRole('menuitem', { name: 'Löschen' }).click();
  await expect(tid(page, 'confirm-delete-restaurant')).toContainText('Trattoria Da Enzo');
  await tid(page, 'confirm-delete-restaurant-cancel').click();
  await expect(tid(page, 'confirm-delete-restaurant')).toBeHidden();
  await expect(tid(page, 'restaurant-title')).toHaveText('Trattoria Da Enzo');
  await tid(page, 'restaurant-more').click();
  await page.getByRole('menuitem', { name: 'Löschen' }).click();
  await tid(page, 'confirm-delete-restaurant-confirm').click();
  await expect(toastMessage(page)).toHaveText(
    'Trattoria Da Enzo gelöscht · 1 geplanter Eintrag entfällt',
  );
  await expect(tid(page, 'toast-action')).toHaveCount(0);
  await open(page, `/kalender?tag=${TODAY}`);
  await expect(tid(page, `entry-${ENZO_LATER}`)).toHaveCount(0);
});

const BURGER = seedIds['rest-burger'];
const EISLAUFEN_TODAY = seedIds['plan-eislaufen-1'];

test('AC-024: Bouldern "Zuletzt … · 3-mal" jumps to "Verlauf", a day opens its week', async ({
  page,
}) => {
  await open(page, `/aktivitaet/${BOULDERN}`);
  await tid(page, 'activity-visits-jump').click();
  await expect(tid(page, 'activity-history-0')).toBeInViewport();
  await tid(page, 'activity-history-0').click();
  await expect(page).toHaveURL(/\/kalender\?tag=/);
});

test('AC-025: without a visit the line is no button and "Besuche" says so', async ({ page }) => {
  await open(page, `/restaurant/${BURGER}`);
  await expect(tid(page, 'restaurant-visits')).toHaveText('Noch kein Besuch im Plan');
  await expect(tid(page, 'restaurant-visits-jump')).toHaveCount(0);
  await expect(tid(page, 'restaurant-history-empty')).toHaveText(
    'Noch kein Besuch. Vergangene Tage aus dem Kalender stehen dann hier.',
  );
});

test('AC-031: on the phone "Zurück" leads to "Aktivitäten", then to "Verwalten"', async ({
  page,
}) => {
  test.skip(!isPhone(page), 'phones only');
  await open(page, '/liste');
  await openManaged(page, 'activities');
  await tid(page, `activity-${EISLAUFEN}`).click();
  await expect(tid(page, 'activity-title')).toHaveText('Eislaufen');
  await back(page);
  await expect(tid(page, 'activities-screen')).toBeVisible();
  await back(page);
  await expect(tid(page, 'manage-screen')).toBeVisible();
});

test('AC-032: "Aktivität öffnen" in the entry window opens the activity', async ({ page }) => {
  await open(page, `/kalender?eintrag=${EISLAUFEN_TODAY}`);
  await tid(page, 'entry-open-activity').click();
  if (isPhone(page)) await expect(page).toHaveURL(new RegExp(`/aktivitaet/${EISLAUFEN}`));
  else await expect(page).toHaveURL(new RegExp(`/aktivitaeten\\?.*aktivitaet=${EISLAUFEN}`));
  await expect(tid(page, 'activity-title')).toHaveText('Eislaufen');
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('AC-027: a new name shows left and right, the search stays', async ({ page }) => {
    await open(page, `/aktivitaeten?suche=eis&aktivitaet=${EISLAUFEN}`);
    await tid(page, 'activity-edit').click();
    await tid(page, 'activity-name').fill('Eislaufen Neuss');
    await tid(page, 'activity-save').click();
    await expect(tid(page, 'activity-title')).toHaveText('Eislaufen Neuss');
    await expect(tid(page, `activity-${EISLAUFEN}`)).toContainText('Eislaufen Neuss');
    await expect(tid(page, 'activity-search')).toHaveValue('eis');
  });

  test('AC-029: deleted on the other device, the detail says "Restaurant nicht gefunden"', async ({
    page,
    browser,
  }) => {
    await open(page, `/rezepte?ansicht=restaurants&restaurant=${BURGER}`);
    await expect(tid(page, 'restaurant-title')).toHaveText('Brooklyn Burger Bar');
    const nadja = await secondDevice(browser, 'nadja');
    await nadja.page.goto(`/restaurant/${BURGER}`);
    await tid(nadja.page, 'restaurant-more').click();
    await nadja.page.getByRole('menuitem', { name: 'Löschen' }).click();
    await tid(nadja.page, 'confirm-delete-restaurant-confirm').click();
    await expect(toastMessage(nadja.page)).toContainText('gelöscht');
    await nadja.context.close();
    await page.reload();
    await expect(tid(page, 'restaurant-not-found')).toBeVisible();
    await tid(page, 'restaurant-not-found-back').click();
    await expect(tid(page, 'restaurants-split')).toHaveCount(0);
  });
});
