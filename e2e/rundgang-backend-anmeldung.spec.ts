import type { Page } from '@playwright/test';

import {
  accessToken,
  back,
  createAccount,
  createTestHousehold,
  deleteAccount,
  ENRICO,
  expect,
  itemRows,
  leaveManaged,
  login,
  nav,
  only,
  open,
  openItem,
  openManaged,
  openSettings,
  rpc,
  secondDevice,
  shoppingCheck,
  showDone,
  signInAs,
  supabaseFetch,
  switchHousehold,
  test,
  tid,
  tidPrefix,
  unique,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0003 — sign-in, test accounts, households and invitations, tenant isolation (REQ-001 to
// REQ-003, REQ-010). Every test that writes creates its own uniquely named household, so nothing
// here depends on another test's leftovers. AC-001 (real Google sign-in) is the manual test of
// phase 6; the sign-up hook ("no account without invitation") is pinned by pgTAP.

only('phone');

const NOT_INVITED =
  'Diese Adresse ist nicht eingeladen. Bitte lass dich von jemandem aus deinem Haushalt einladen.';
const SIGN_IN_FAILED = 'Anmelden hat nicht geklappt – bitte noch einmal versuchen.';
const ACCOUNT_GONE = 'Dein Konto gibt es nicht mehr – bitte melde dich neu an.';

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** Number of keys in the app's IndexedDB cache ("housekeeping" → "cache"); 0 when it is gone. */
async function cachedKeys(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const names = (await indexedDB.databases()).map((db) => db.name);
    if (!names.includes('housekeeping')) return 0;
    return new Promise<number>((resolve, reject) => {
      const request = indexedDB.open('housekeeping');
      request.onerror = () => reject(new Error('cannot open the cache'));
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('cache')) {
          db.close();
          resolve(0);
          return;
        }
        const count = db.transaction('cache').objectStore('cache').count();
        count.onsuccess = () => {
          db.close();
          resolve(count.result);
        };
        count.onerror = () => reject(new Error('cannot count the cache'));
      };
    });
  });
}

test('AC-002: a redirect with "not_invited" shows the German message on the login page', async ({
  page,
}) => {
  await page.goto(
    '/?error=access_denied&error_code=signup_disabled&error_description=not_invited%3A+no+invitation',
  );
  await expect(tid(page, 'login-screen')).toBeVisible();
  await expect(tid(page, 'login-error')).toHaveText(NOT_INVITED);
  // The error parameters are removed, so a reload does not show the message again.
  await expect(page).not.toHaveURL(/error_description/);
});

test('a sign-in redirect with an unusable code shows the generic error and drops the code', async ({
  page,
}) => {
  await page.goto('/?code=bogus');
  await expect(tid(page, 'login-screen')).toBeVisible();
  await expect(tid(page, 'login-error')).toHaveText(SIGN_IN_FAILED);
  await expect(page).not.toHaveURL(/code=/);
});

test('a deleted account: after a reload the login screen says the account is gone', async ({
  page,
  allowConsoleError,
}) => {
  // GET /auth/v1/user answers 403 user_not_found for the deleted account.
  allowConsoleError(/status of 403/);
  const email = `weg-${unique()}@example.com`.toLowerCase();
  const id = createAccount(email, 'Weg');
  await rpc(await accessToken({ email }), 'create_household', {
    name: `Weg ${unique()}`,
    starter: { areas: [], articles: [] },
  });
  await signInAs(page, email);
  await expect(tid(page, 'today-screen')).toBeVisible();
  expect(await cachedKeys(page)).toBeGreaterThan(0);

  deleteAccount(id);
  await page.reload();
  await expect(tid(page, 'login-error')).toHaveText(ACCOUNT_GONE);
  expect(await cachedKeys(page), 'local cache').toBe(0);
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  expect(keys.filter((key) => key.startsWith('housekeeping.auth'))).toEqual([]);
});

test('the household chosen on this device is still chosen after a reload', async ({ page }) => {
  await open(page, '/');
  await switchHousehold(page, seedIds['hh-test']);
  await page.reload();
  await expect(tid(page, 'today-screen')).toBeVisible({ timeout: 30_000 });
  await openManaged(page, 'members');
  await expect(tid(page, `household-${seedIds['hh-test']}-active`)).toBeVisible();
  await expect(tid(page, `household-${seedIds['hh-demo']}-active`)).toHaveCount(0);
});

test('AC-003: signing out with a check waiting offline empties the device and shows the login', async ({
  page,
  context,
}) => {
  await open(page, '/liste');
  await expect(openItem(page, 'Milch')).toHaveCount(1);
  expect(await cachedKeys(page)).toBeGreaterThan(0);
  // Load the settings and "Einkaufen" routes once online: without the service worker (blocked
  // in this test) their lazily loaded bundles could not be fetched offline.
  await openSettings(page);
  await back(page);
  await tid(page, 'start-shopping').click();
  await expect(shoppingCheck(page, 'Milch')).toBeVisible();
  await context.setOffline(true);
  await shoppingCheck(page, 'Milch').click();
  await expect(shoppingCheck(page, 'Milch')).toHaveAttribute('aria-checked', 'true');
  await tid(page, 'shopping-close').click();
  await showDone(page);
  await expect(page.locator('[data-testid^="item-"][data-testid$="-pending"]')).toHaveCount(1);

  await openSettings(page);
  // Spec 0018, AC-013: the waiting check makes sign-out ask; "Abbrechen" keeps everything.
  await tid(page, 'settings-sign-out').click();
  await expect(tid(page, 'sign-out-dialog-message')).toHaveText(
    '1 Änderung ist noch nicht gesendet. Beim Abmelden geht sie verloren.',
  );
  await tid(page, 'sign-out-dialog-cancel').click();
  await expect(tid(page, 'sign-out-dialog')).toHaveCount(0);
  await expect(tid(page, 'settings-sign-out')).toBeVisible();
  // AC-015: "Trotzdem abmelden" is the sign-out as before.
  await tid(page, 'settings-sign-out').click();
  await tid(page, 'sign-out-dialog-confirm').click();
  await expect(tid(page, 'login-screen')).toBeVisible();
  expect(await cachedKeys(page), 'local cache and store queue').toBe(0);
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  expect(
    keys.filter((key) => key.startsWith('housekeeping.auth') || key.startsWith('sb-')),
    'no session left in the browser',
  ).toEqual([]);

  // The waiting check never reaches the server.
  await context.setOffline(false);
  await expect(tid(page, 'login-screen')).toBeVisible();
  const token = await accessToken('enrico');
  const milkArticle = await json<{ id: string }[]>(
    await supabaseFetch(
      `/rest/v1/articles?select=id&household_id=eq.${seedIds['hh-demo']}&name=eq.Milch`,
      { token },
    ),
  );
  const checked = await json<{ id: string }[]>(
    await supabaseFetch(
      `/rest/v1/shopping_items?select=id&checked=is.true&article_id=eq.${milkArticle[0]?.id}`,
      { token },
    ),
  );
  expect(checked).toEqual([]);
});

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' });

  test('AC-004: a reload without network starts the app with the last data and the orange hint', async ({
    page,
    context,
  }) => {
    await open(page, '/');
    await expect(tid(page, 'today-meals')).toContainText('Lasagne');
    // The worker has precached the app shell and controls the page.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(tid(page, 'today-screen')).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, 'today-meals')).toContainText('Lasagne');
    await expect(tid(page, 'offline-banner')).toHaveText(
      'Offline – Lesen, Einkaufen und Packen gehen',
    );
    await nav(page, 'liste');
    await expect(itemRows(page, 'Milch')).toHaveCount(1);
  });
});

test('AC-005: without sign-in the API returns no rows and the edge functions answer 401', async () => {
  for (const table of ['recipes', 'households', 'shopping_items', 'profiles']) {
    const response = await supabaseFetch(`/rest/v1/${table}?select=*`);
    const rows: unknown = response.ok ? await response.json() : [];
    expect(
      response.status === 401 || (Array.isArray(rows) && rows.length === 0),
      `${table}: ${response.status}`,
    ).toBe(true);
  }
  for (const name of ['ai-assistant', 'ai-search', 'speech-token', 'resolve-maps-link']) {
    const response = await supabaseFetch(`/functions/v1/${name}`, { method: 'POST', body: {} });
    expect(response.status, name).toBe(401);
  }
});

// AC-007 (a build without the switch has only Google; the switch against a non-local Supabase
// stops the app) is pinned by packages/api/src/auth.test.ts ("AC-007: …"); this e2e build has
// the switch on.
test('AC-006: "Als Test-Enrico anmelden" signs in as "Enrico (Test)" in "Enrico & Nadja"', async ({
  page,
}) => {
  await page.goto('/');
  await expect(tid(page, 'login-google')).toHaveText(/Mit Google anmelden/);
  await expect(tid(page, 'login-dev-enrico')).toHaveText(/Als Test-Enrico anmelden/);
  await expect(tid(page, 'login-dev-nadja')).toHaveText(/Als Test-Nadja anmelden/);
  await login(page, 'enrico');
  await openSettings(page);
  await expect(tid(page, 'profile-current')).toContainText(ENRICO);
  await back(page);
  await openManaged(page, 'members');
  await expect(tid(page, `household-${seedIds['hh-demo']}-active`)).toBeVisible();
  await expect(tid(page, `household-${seedIds['hh-demo']}`)).toContainText('Enrico & Nadja');
});

test('AC-008: Enrico invites Nadja; she shows as "Eingeladen", accepts and sees the same data', async ({
  page,
  browser,
}) => {
  const name = `Einladung ${unique()}`;
  await open(page, '/');
  await openManaged(page, 'members');
  await tid(page, 'household-create-input').fill(name);
  await tid(page, 'household-create-submit').click();
  await expect(
    tid(page, 'household-list').locator('[aria-label$=", aktiv"]').filter({ hasText: name }),
  ).toBeVisible();

  await tid(page, 'household-invite-input').fill('nadja.test@example.com');
  await tid(page, 'household-invite-submit').click();
  const invitation = tidPrefix(page, 'household-invitation-').filter({
    hasText: 'nadja.test@example.com',
  });
  await expect(invitation).toContainText('Eingeladen');
  await leaveManaged(page);
  await nav(page, 'liste');
  await tid(page, 'smart-input').fill('Milch');
  await tid(page, 'smart-input').press('Enter');
  await expect(itemRows(page, 'Milch')).toHaveCount(1);

  const nadja = await secondDevice(browser, 'nadja');
  await openManaged(nadja.page, 'members');
  const offer = tidPrefix(nadja.page, 'my-invitation-').filter({ hasText: name });
  await offer.locator('[data-testid^="invitation-accept-"]').click();
  await expect(
    tid(nadja.page, 'household-list').locator('[aria-label$=", aktiv"]').filter({ hasText: name }),
  ).toBeVisible();
  await leaveManaged(nadja.page);
  await nav(nadja.page, 'liste');
  await expect(itemRows(nadja.page, 'Milch')).toHaveCount(1);

  // On Enrico's device the invitation turns into a member.
  await page.bringToFront();
  await nav(page, 'index');
  await openManaged(page, 'members');
  await expect(tid(page, `household-member-${seedIds['m-nadja']}`)).toBeVisible();
  await expect(invitation).toHaveCount(0);
  await nadja.context.close();
});

test('AC-008: a new account does not join by itself; on its first sign-in it accepts and sees the household', async ({
  page,
}) => {
  const name = `Erstanmeldung ${unique()}`;
  const email = `neu-${unique()}@example.com`.toLowerCase();
  const householdId = await createTestHousehold(name);
  await rpc(await accessToken('enrico'), 'invite_member', { household_id: householdId, email });
  // The account is created as on the first Google sign-in (the sign-up hook is pinned by pgTAP).
  const accountId = createAccount(email, 'Neu');

  await signInAs(page, email);
  await expect(tid(page, 'no-household')).toBeVisible();
  const offer = tidPrefix(page, 'my-invitation-').filter({ hasText: name });
  await expect(offer).toBeVisible();
  await offer.locator('[data-testid^="invitation-accept-"]').click();
  await expect(tid(page, 'today-screen')).toBeVisible({ timeout: 30_000 });
  await openManaged(page, 'members');
  await expect(tid(page, `household-${householdId}-active`)).toBeVisible();
  await expect(tid(page, `household-member-${accountId}`)).toBeVisible();
  await expect(tid(page, `household-member-${seedIds['m-enrico']}`)).toBeVisible();
});

test('AC-009: "nadja@" is no e-mail address; nothing is saved', async ({ page }) => {
  await open(page, '/');
  await openManaged(page, 'members');
  await expect(tid(page, `household-member-${seedIds['m-nadja']}`)).toBeVisible();
  const invitations = tidPrefix(page, 'household-invitation-');
  const before = await invitations.count();
  await tid(page, 'household-invite-input').fill('nadja@');
  await tid(page, 'household-invite-submit').click();
  await expect(tid(page, 'household-invite-input-error')).toHaveText(
    'Das ist keine E-Mail-Adresse',
  );
  await expect(invitations).toHaveCount(before);
  const stored = await json<unknown[]>(
    await supabaseFetch(
      `/rest/v1/household_invitations?select=id&email=eq.${encodeURIComponent('nadja@')}`,
      { token: await accessToken('enrico') },
    ),
  );
  expect(stored).toEqual([]);
});

test('AC-010: a new household "WG Köln" has only Enrico, the starter data, a default list and three Tageszeiten', async ({
  page,
}) => {
  const name = `WG Köln ${unique()}`;
  await open(page, '/');
  await openManaged(page, 'members');
  await tid(page, 'household-create-input').fill(name);
  await tid(page, 'household-create-submit').click();
  await expect(
    tid(page, 'household-list').locator('[aria-label$=", aktiv"]').filter({ hasText: name }),
  ).toBeVisible();
  const members = tid(page, 'household-members').locator(
    '[data-testid^="household-member-"]:not([data-testid^="household-member-remove-"])',
  );
  await expect(members).toHaveCount(1);
  await expect(members).toContainText(`${ENRICO} (du)`);

  const token = await accessToken('enrico');
  const [household] = await json<{ id: string; meal_slots: { name: string }[] }[]>(
    await supabaseFetch(
      `/rest/v1/households?select=id,meal_slots&name=eq.${encodeURIComponent(name)}`,
      { token },
    ),
  );
  // Spec 0004, AC-001: every new household has Vormittag, Mittag and Abend.
  expect(household?.meal_slots.map((slot) => slot.name)).toEqual(['Vormittag', 'Mittag', 'Abend']);
  const count = async (table: string, filter = '') =>
    (
      await json<unknown[]>(
        await supabaseFetch(
          `/rest/v1/${table}?select=household_id&household_id=eq.${household?.id}${filter}`,
          { token },
        ),
      )
    ).length;
  expect(await count('household_members')).toBe(1);
  expect(await count('areas')).toBeGreaterThanOrEqual(15);
  expect(await count('articles')).toBeGreaterThanOrEqual(250);
  // ADR-0012: the household's shopping list is its items; a new household starts with none.
  expect(await count('shopping_items')).toBe(0);

  await leaveManaged(page);
  await nav(page, 'liste');
  await expect(tid(page, 'screen-title')).toHaveText('Einkaufsliste');
  await tid(page, 'smart-input').fill('Karot');
  await expect(tid(page, 'smart-suggestions')).toContainText('Möhren · auch: Karotten');
});

test('AC-011: Nadja reads, changes, deletes and creates nothing in a household she is not in', async () => {
  const name = `WG Köln ${unique()}`;
  const householdId = await createTestHousehold(name);
  const enrico = await accessToken('enrico');
  const nadja = await accessToken('nadja');
  const tables = [
    'households',
    'household_members',
    'household_invitations',
    'areas',
    'articles',
    'stores',
    'shopping_items',
    'recipes',
    'meal_plan_entries',
  ];
  for (const table of tables) {
    const filter =
      table === 'households' ? `id=eq.${householdId}` : `household_id=eq.${householdId}`;
    const rows = await json<unknown[]>(
      await supabaseFetch(`/rest/v1/${table}?select=*&${filter}`, { token: nadja }),
    );
    expect(rows, `${table} readable by a non-member`).toEqual([]);
  }

  // Create: refused.
  const insert = await supabaseFetch('/rest/v1/areas', {
    method: 'POST',
    token: nadja,
    body: { household_id: householdId, name: 'Fremd', sort: 99 },
  });
  expect(insert.ok, `insert answered ${insert.status}`).toBe(false);
  const recipe = await supabaseFetch('/rest/v1/recipes', {
    method: 'POST',
    token: nadja,
    body: { household_id: householdId, title: 'Fremdes Rezept' },
  });
  expect(recipe.ok, `insert answered ${recipe.status}`).toBe(false);

  // Change and delete: nothing matches.
  const rename = await supabaseFetch(`/rest/v1/households?id=eq.${householdId}`, {
    method: 'PATCH',
    token: nadja,
    body: { name: 'Übernommen' },
    headers: { prefer: 'return=representation' },
  });
  expect(rename.ok ? await rename.json() : []).toEqual([]);
  const remove = await supabaseFetch(`/rest/v1/areas?household_id=eq.${householdId}`, {
    method: 'DELETE',
    token: nadja,
    headers: { prefer: 'return=representation' },
  });
  expect(remove.ok ? await remove.json() : []).toEqual([]);
  await expect(
    rpc(nadja, 'apply_changes', { p_household_id: householdId, p_ops: [] }),
  ).rejects.toThrow();

  // Enrico still sees his household unchanged.
  const own = await json<{ name: string }[]>(
    await supabaseFetch(`/rest/v1/households?select=name&id=eq.${householdId}`, {
      token: enrico,
    }),
  );
  expect(own).toEqual([{ name }]);
  const areas = await json<unknown[]>(
    await supabaseFetch(`/rest/v1/areas?select=id&household_id=eq.${householdId}`, {
      token: enrico,
    }),
  );
  expect(areas.length).toBe(2);
});

test('AC-033: after `pnpm db:reset` the demo household, "Test" and the owner invitation exist', async ({
  page,
}) => {
  // The global setup ran `pnpm db:reset`; this checks what it left.
  await open(page, '/');
  await openManaged(page, 'members');
  await expect(tid(page, `household-${seedIds['hh-demo']}`)).toContainText('Enrico & Nadja');
  await expect(tid(page, `household-${seedIds['hh-test']}`)).toContainText('Test');
  const owner = process.env.DEV_OWNER_EMAIL?.trim().toLowerCase();
  test.skip(!owner, 'DEV_OWNER_EMAIL is not set: no owner invitation to check');
  const invitations = await json<{ email: string }[]>(
    await supabaseFetch(
      `/rest/v1/household_invitations?select=email&household_id=eq.${seedIds['hh-demo']}`,
      { token: await accessToken('enrico') },
    ),
  );
  // Compared in-process; the address is never printed.
  expect(invitations.some((invitation) => invitation.email === owner)).toBe(true);
});

test('AC-011 (0018): "Verlassen" asks first with the way back; "Abbrechen" keeps the membership', async ({
  page,
}) => {
  const name = `Verlassen ${unique()}`;
  const householdId = await createTestHousehold(name);
  await open(page, '/');
  await switchHousehold(page, householdId);
  await openManaged(page, 'members');
  const leaveCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/rpc/remove_member')) leaveCalls.push(request.url());
  });
  await tid(page, `household-member-remove-${seedIds['m-enrico']}`).click();
  const dialog = tid(page, 'member-remove-dialog');
  await expect(dialog).toContainText(`„${name}“ verlassen?`);
  // Enrico has other households, so there is no "einziger Haushalt".
  await expect(tid(page, 'member-remove-dialog-message')).toHaveText(
    'Zurück kommst du nur mit einer neuen Einladung.',
  );
  await expect(tid(page, 'member-remove-dialog-confirm')).toHaveText('Verlassen');
  await tid(page, 'member-remove-dialog-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(tid(page, `household-${householdId}-active`)).toBeVisible();
  await expect(tid(page, `household-member-${seedIds['m-enrico']}`)).toBeVisible();
  expect(leaveCalls, 'no server call without the confirmation').toEqual([]);
});

test('AC-012 (0018): leaving the only household says so in the question', async ({ page }) => {
  const name = `Einziger ${unique()}`;
  const email = `einzig-${unique()}@example.com`.toLowerCase();
  const householdId = await createTestHousehold(name);
  const invitationId = await rpc<string>(await accessToken('enrico'), 'invite_member', {
    household_id: householdId,
    email,
  });
  const accountId = createAccount(email, 'Einzig');
  try {
    await rpc(await accessToken({ email }), 'accept_invitation', { invitation_id: invitationId });
    await signInAs(page, email);
    await expect(tid(page, 'today-screen')).toBeVisible({ timeout: 30_000 });
    await openManaged(page, 'members');
    await expect(tid(page, `household-${householdId}-active`)).toBeVisible();
    await tid(page, `household-member-remove-${accountId}`).click();
    await expect(tid(page, 'member-remove-dialog')).toContainText(`„${name}“ verlassen?`);
    await expect(tid(page, 'member-remove-dialog-message')).toHaveText(
      'Das ist dein einziger Haushalt. Zurück kommst du nur mit einer neuen Einladung.',
    );
    await tid(page, 'member-remove-dialog-cancel').click();
    await expect(tid(page, 'member-remove-dialog')).toHaveCount(0);
    await expect(tid(page, `household-member-${accountId}`)).toBeVisible();
  } finally {
    deleteAccount(accountId);
  }
});
