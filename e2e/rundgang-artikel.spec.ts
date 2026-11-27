import type { Page } from '@playwright/test';
import { normalizeText } from '@housekeeping/core';

import {
  accessToken,
  back,
  expect,
  freshSeed,
  leaveManaged,
  nav,
  only,
  open,
  openItem,
  openManaged,
  rpc,
  supabaseFetch,
  test,
  tid,
  tidPrefix,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0007 — the article catalog: the page "Artikel" (search, filters, sort, new), "Artikel
// bearbeiten" (synonyms, delete, merge), "Märkte & Bereiche" (new store, rename, default, delete,
// areas of a store, the view "Bereiche"). The tests change the demo, so the file starts from a
// fresh seed; they run in order.

freshSeed();

const REWE = seedIds['store-rewe'];
const HOUSEHOLD = seedIds['hh-demo'];
const SYNC = { timeout: 30_000 };
const area = (key: string): string => seedIds[`area-${key}` as keyof typeof seedIds];
const article = (key: string): string => seedIds[`art-${key}` as keyof typeof seedIds];

async function openArticles(page: Page): Promise<void> {
  await open(page, '/');
  await openManaged(page, 'articles');
  await expect(tid(page, 'articles-screen')).toBeVisible();
}

/** "+ Neu" on "Artikel": creates `name` and leaves "Artikel bearbeiten" open for it. */
async function newArticle(page: Page, name: string): Promise<void> {
  await tid(page, 'articles-new').click();
  await tid(page, 'new-article-search-input').fill(name);
  await tid(page, 'new-article-search-create-article').click();
  await expect(tid(page, 'article-name')).toHaveValue(name);
}

/** The name in the "Märkte" list (`store-<id>`) of the store called `name`. */
function storeRow(page: Page, name: string) {
  return tidPrefix(page, 'store-').and(page.locator('[role="button"]')).filter({ hasText: name });
}

test.describe('Artikel and Märkte at phone width', () => {
  only('phone');

  test('AC-021 / AC-022 / AC-024 / AC-027: "Artikel" lists A–Z, finds synonyms and typos, sorts "Neu", empty filter leads back', async ({
    page,
  }) => {
    await openArticles(page);
    // The tab bar stays visible on this page.
    await expect(tid(page, 'tab-liste')).toBeVisible();
    for (const key of ['all', 'noArea', 'pantry', 'needsReview', 'similar']) {
      await expect(tid(page, `articles-filter-${key}`), key).toBeVisible();
    }
    await expect(tid(page, 'articles-list')).toBeVisible();

    await tid(page, 'articles-search').fill('Karotten');
    await expect(tid(page, `article-${article('moehren')}`)).toContainText('auch: Karotten');
    await tid(page, 'articles-search').fill('Kokosmilsh');
    await expect(tid(page, `article-${article('kokosmilch')}`)).toBeVisible();
    await tid(page, 'articles-search-clear').click();

    await tid(page, 'articles-filter-needsReview').click();
    await expect(tid(page, 'articles-filter-empty')).toBeVisible();
    await tid(page, 'articles-filter-empty-all').click();
    await expect(tid(page, 'articles-filter-all')).toHaveAttribute('aria-selected', 'true');

    await tid(page, 'articles-sort').click();
    await tid(page, 'articles-sort-new').click();
    await expect(tid(page, 'articles-sort')).toContainText('Neu');
    await leaveManaged(page);

    // The other way in: "Liste" ⋯ → "Artikel", and back leads to the list.
    await nav(page, 'liste');
    await tid(page, 'list-more').click();
    await tid(page, 'list-more-articles').click();
    await expect(tid(page, 'articles-screen')).toBeVisible();
    await back(page);
    await expect(tid(page, 'screen-title')).toHaveText('Einkaufsliste');
  });

  test('AC-026 / AC-031 / AC-033: "+ Neu" creates "Drachenfrucht", a synonym of another article is refused, unused it can be deleted', async ({
    page,
  }) => {
    await openArticles(page);
    await newArticle(page, 'Drachenfrucht');
    await tid(page, 'article-synonym-input').fill('Möhren');
    await tid(page, 'article-synonym-add').click();
    await expect(tid(page, 'article-synonym-input-error')).toHaveText(
      '„Möhren“ ist schon ein Artikel',
    );
    await tid(page, 'article-synonym-input').fill('Pitaya');
    await tid(page, 'article-synonym-add').click();
    await expect(tid(page, 'article-synonym-0')).toContainText('Pitaya');
    await tid(page, 'article-done').click();
    await expect(tid(page, 'article-sheet')).toBeHidden();

    await tid(page, 'articles-search').fill('Pitaya');
    const dragon = tidPrefix(page, 'article-').filter({ hasText: 'Drachenfrucht' });
    await expect(dragon).toHaveCount(1);
    await dragon.click();
    await tid(page, 'article-delete').click();
    // Spec 0036: asks first; "Abbrechen" leaves it, the toast after deleting has no undo.
    await expect(tid(page, 'confirm-delete-article')).toBeVisible();
    await tid(page, 'confirm-delete-article-cancel').click();
    await expect(tid(page, 'confirm-delete-article')).toBeHidden();
    await expect(tid(page, 'article-sheet')).toBeVisible();
    await tid(page, 'article-delete').click();
    await tid(page, 'confirm-delete-article-confirm').click();
    await expect(tid(page, 'article-sheet')).toBeHidden();
    await expect(toastMessage(page)).toHaveText('„Drachenfrucht“ gelöscht');
    await expect(tid(page, 'toast-action')).toHaveCount(0);
    await expect(dragon).toHaveCount(0);
  });

  test('AC-028 / AC-034: "Kokosmilch" shows its recipes and cannot be deleted while used', async ({
    page,
  }) => {
    await openArticles(page);
    await tid(page, 'articles-search').fill('Kokosmilch');
    await tid(page, `article-${article('kokosmilch')}`).click();
    await expect(tid(page, 'article-name')).toHaveValue('Kokosmilch');
    await expect(tid(page, 'article-recipes')).toContainText('Mango-Curry');
    await expect(tid(page, 'article-delete')).toBeDisabled();
    await expect(tid(page, 'article-delete-reason')).toContainText('Rezept');
    await tid(page, `article-recipe-${seedIds['rec-mango-curry']}`).click();
    await expect(tid(page, 'recipe-title')).toHaveText('Mango-Curry');
  });

  test('AC-030 / AC-036 / AC-037: renaming "Milchkokos" to an existing name offers merging; afterwards the old name finds Kokosmilch', async ({
    page,
  }) => {
    await openArticles(page);
    await newArticle(page, 'Milchkokos');
    await tid(page, 'article-name').fill('kokosmilch');
    await tid(page, 'article-name').press('Enter');
    await expect(tid(page, 'article-name-error')).toHaveText('Gibt es schon: Kokosmilch');
    await tid(page, 'article-name').fill('');
    await expect(tid(page, 'article-name-error')).toHaveText('Name fehlt');
    await expect(tid(page, 'article-done')).toBeDisabled();
    await tid(page, 'article-name').fill('Milchkokos');

    await tid(page, 'article-merge').click();
    await tid(page, 'article-merge-search-input').fill('Kokosmilch');
    await tid(page, `article-merge-search-hit-${article('kokosmilch')}`).click();
    await expect(tid(page, 'merge-dialog')).toContainText(
      'Milchkokos in Kokosmilch zusammenführen?',
    );
    await tid(page, 'merge-dialog-confirm').click();
    await expect(toastMessage(page)).toHaveText('„Milchkokos“ ist jetzt Teil von „Kokosmilch“');
    // The merged article opens: "Milchkokos" is one of its synonyms now.
    await expect(tid(page, 'article-name')).toHaveValue('Kokosmilch');
    await expect(tid(page, 'article-sheet')).toContainText('Milchkokos');
    await tid(page, 'article-done').click();
    await expect(tid(page, 'article-sheet')).toBeHidden();
    await tid(page, 'articles-search').fill('Milchkokos');
    await expect(tid(page, `article-${article('kokosmilch')}`)).toBeVisible();
    await leaveManaged(page);

    await nav(page, 'liste');
    await tid(page, 'smart-input').fill('Milchkokos');
    await tid(page, 'smart-input').press('Enter');
    await expect(openItem(page, 'Kokosmilch')).toHaveCount(1);
    await expect(openItem(page, 'Milchkokos')).toHaveCount(0);
  });

  test('AC-043 / AC-044 / AC-045: a new store "Aldi Nord", renamed and made the default, then deleted after asking', async ({
    page,
  }) => {
    await open(page, '/');
    await openManaged(page, 'stores');
    await tid(page, 'store-new').click();
    await tid(page, 'store-new-sheet-save').click();
    await expect(tid(page, 'store-new-sheet-name-error')).toHaveText('Name fehlt');
    await tid(page, 'store-new-sheet-name').fill('Aldi Nord');
    await tid(page, 'store-new-sheet-save').click();
    await expect(toastMessage(page)).toHaveText('„Aldi Nord“ angelegt');
    await expect(tid(page, 'store-order-screen')).toContainText('Aldi Nord');

    await tid(page, 'store-rename').click();
    // Nachklick 27.11., Ruckeln: "Markt bearbeiten" opens without a cursor.
    await expect(tid(page, 'store-rename-sheet')).toBeVisible();
    await expect(tid(page, 'store-rename-sheet-name')).not.toBeFocused();
    await tid(page, 'store-rename-sheet-name').fill('Aldi Nordstadt');
    await tid(page, 'store-rename-sheet-save').click();
    await expect(tid(page, 'store-order-screen')).toContainText('Aldi Nordstadt');
    await tid(page, 'store-menu').click();
    await tid(page, 'store-menu-default').click();
    await expect(toastMessage(page)).toHaveText('„Aldi Nordstadt“ ist jetzt der Standardmarkt');
    await back(page);
    await expect(storeRow(page, 'Aldi Nordstadt')).toContainText('Standard');
    await expect(tid(page, `store-${REWE}`)).not.toContainText('Standard');

    // Rewe becomes the default again, then Aldi goes.
    await tid(page, `store-${REWE}`).click();
    await tid(page, 'store-menu').click();
    await tid(page, 'store-menu-default').click();
    await back(page);
    await storeRow(page, 'Aldi Nordstadt').click();
    await tid(page, 'store-menu').click();
    await tid(page, 'store-menu-delete').click();
    await expect(tid(page, 'store-delete-dialog')).toContainText('Aldi Nordstadt löschen?');
    await expect(tid(page, 'store-delete-dialog-message')).toContainText(
      'Die Laufreihenfolge geht verloren.',
    );
    await tid(page, 'store-delete-dialog-confirm').click();
    await expect(tid(page, 'stores-screen')).toBeVisible();
    await expect(storeRow(page, 'Aldi Nordstadt')).toHaveCount(0);
    await expect(tid(page, `store-${REWE}`)).toContainText('Standard');
  });

  test('AC-048 / AC-049: "+ Bereich hinzufügen" shows a hidden area again and creates a new one at the end', async ({
    page,
  }) => {
    await open(page, '/');
    await openManaged(page, 'stores');
    await tid(page, `store-${REWE}`).click();
    await expect(tid(page, `area-row-${area('tierbedarf')}`)).toBeVisible();
    await expect(tid(page, 'area-hidden')).toContainText('Tierbedarf');

    await tid(page, 'store-add-area').click();
    await tid(page, 'add-area-search-input').fill('Tierb');
    const hidden = tid(page, `add-area-search-hit-${area('tierbedarf')}`);
    await expect(hidden).toContainText('ausgeblendet');
    await hidden.click();
    await expect(toastMessage(page)).toHaveText('„Tierbedarf“ ist wieder sichtbar');
    await expect(tid(page, `area-pos-${area('tierbedarf')}`)).toBeVisible();

    await tid(page, 'store-add-area').click();
    await tid(page, 'add-area-search-input').fill('Backzutaten');
    await tid(page, 'add-area-search-create-area').click();
    await expect(toastMessage(page)).toHaveText('„Backzutaten“ angelegt');
    const positions = await tidPrefix(page, 'area-pos-').allInnerTexts();
    const last = tidPrefix(page, 'area-row-').filter({ hasText: 'Backzutaten' });
    await expect(last).toContainText(String(positions.length));

    // AC-047: hiding moves it under "Ausgeblendet".
    await tid(page, `area-hide-${area('tierbedarf')}`).click();
    await expect(tid(page, 'area-hidden')).toContainText('Tierbedarf');
  });

  test('AC-051: the view "Bereiche" lists the areas; "Ohne Bereich ›" opens "Artikel" with that filter', async ({
    page,
  }) => {
    await open(page, '/');
    await openManaged(page, 'stores');
    await tid(page, 'stores-view-bereiche').click();
    await expect(tid(page, 'areas-view')).toBeVisible();
    await expect(tid(page, 'areas-view')).toContainText('Obst & Gemüse');
    await expect(tid(page, 'areas-new')).toBeVisible();
    await tid(page, 'areas-without').click();
    await expect(tid(page, 'articles-screen')).toBeVisible();
    await expect(tid(page, 'articles-filter-noArea')).toHaveAttribute('aria-selected', 'true');
    await expect(tidPrefix(page, 'article-').filter({ hasText: 'Geschenkpapier' })).toHaveCount(1);
  });

  test('AC-057: "Fertig" with the untouched name keeps the rename Nadja made meanwhile', async ({
    page,
  }) => {
    const feigen = article('feigen');
    await openArticles(page);
    await tid(page, 'articles-search').fill('Feigen');
    await tid(page, `article-${feigen}`).click();
    await expect(tid(page, 'article-name')).toHaveValue('Feigen');

    // Nadja renames it on her device; the delta sync brings it while the window is open.
    const renamed = 'Feigen frisch';
    await rpc(await accessToken('nadja'), 'apply_changes', {
      p_household_id: HOUSEHOLD,
      p_ops: [
        {
          kind: 'patch',
          table: 'articles',
          id: feigen,
          changes: { name: renamed, name_key: normalizeText(renamed) },
        },
      ],
    });
    await expect(tid(page, `article-${feigen}`)).toContainText(renamed, SYNC);
    // The field still shows the name from opening; leaving it and "Fertig" save nothing.
    await expect(tid(page, 'article-name')).toHaveValue('Feigen');
    await tid(page, 'article-name').focus();
    await tid(page, 'article-name').blur();
    await tid(page, 'article-done').click();
    await expect(tid(page, 'article-sheet')).toBeHidden();
    await expect(tid(page, `article-${feigen}`)).toContainText(renamed);
    const response = await supabaseFetch(`/rest/v1/articles?select=name&id=eq.${feigen}`, {
      token: await accessToken('enrico'),
    });
    expect(await response.json()).toEqual([{ name: renamed }]);
  });
});

test.describe('Artikel at desktop width', () => {
  only('desktop');

  test('AC-025: list and "Artikel bearbeiten" side by side', async ({ page }) => {
    await open(page, '/');
    await tid(page, 'nav-manage-articles').click();
    await expect(tid(page, 'articles-split')).toBeVisible();
    await tid(page, 'articles-search').fill('Kokosmilch');
    await tid(page, `article-${article('kokosmilch')}`).click();
    await expect(tid(page, 'article-panel')).toBeVisible();
    await expect(tid(page, 'article-name')).toHaveValue('Kokosmilch');
    const list = await tid(page, 'articles-list').boundingBox();
    const panel = await tid(page, 'article-panel').boundingBox();
    expect(list && panel && list.x + list.width <= panel.x, 'list left of the panel').toBe(true);
  });
});
