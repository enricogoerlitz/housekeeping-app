import { randomUUID } from 'node:crypto';

import type { Locator, Page } from '@playwright/test';

import {
  ACTIVE,
  back,
  expect,
  freshSeed,
  goOffline,
  itemRows,
  nav,
  nestedSeedId,
  only,
  open,
  test,
  tid,
  tidPrefix,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

const MANGO = seedIds['rec-mango-curry'];
const LASAGNE = seedIds['rec-lasagne'];
const card = (slug: keyof typeof seedIds) => `recipe-card-${seedIds[slug]}`;
/** Ingredient and variant ids of the seed recipes: `mango-curry-i1`, `mango-curry-v2`, … */
const nested = nestedSeedId;
const article = (key: string): string => seedIds[`art-${key}` as keyof typeof seedIds];

/** The ingredient rows of a recipe in the read view (not their amount, notes or buttons). */
function ingredientRows(scope: Locator): Locator {
  return scope.locator(
    [
      '[data-testid^="ingredient-"]',
      ':not([data-testid^="ingredient-amount-"])',
      ':not([data-testid^="ingredient-menu-"])',
      ':not([data-testid^="ingredient-prep-note-"])',
      ':not([data-testid^="ingredient-empty-"])',
      ':not([data-testid^="ingredient-shopping-note-"])',
      ACTIVE,
    ].join(''),
  );
}

/** "+" on "Essen" opens "Neu"; a collection is chosen there (spec 0054, REQ-002; spec 0009). */
async function newFromMenu(page: Page, option: 'recipe' | 'collection'): Promise<void> {
  await tid(page, 'recipe-new').click();
  await expect(tid(page, 'new-recipe-sheet')).toBeVisible();
  if (option === 'collection') await tid(page, 'new-recipe-open-collection').click();
}

/** A new recipe from "Essen"; lands on its page. */
async function newRecipe(page: Page, title: string): Promise<void> {
  await newFromMenu(page, 'recipe');
  await tid(page, 'new-recipe-title').fill(title);
  await tid(page, 'new-recipe-save').click();
  await expect(tid(page, 'recipe-title')).toHaveText(title);
}

// Spec 0001 — recipes (REQ-005), and spec 0008 — "Essen" with filter row and "Neu" menu, the
// recipe page as a whole page with section pens; spec 0007 — ingredients point at an article;
// spec 0009 — collections. The AI tests of spec 0001 (AI search, assistant) are gone while the AI
// switch is off (spec 0005, AC-044; rundgang-shell.spec.ts). The tests change the demo, so the
// file starts from a fresh seed.

only('phone');
freshSeed();

test('AC-018 (0001): the quick chip "Vegetarisch" keeps Mango-Curry and hides Spaghetti Bolognese', async ({
  page,
}) => {
  await open(page, '/rezepte');
  await expect(tid(page, card('rec-spaghetti-bolognese'))).toBeVisible();
  await tid(page, 'recipe-quick-vegetarian').click();
  await expect(tid(page, 'recipe-quick-vegetarian')).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, card('rec-mango-curry'))).toBeVisible();
  await expect(tid(page, card('rec-spaghetti-bolognese'))).toBeHidden();
});

test('AC-007 / AC-008 (0038): a recipe tile names its course; collections and the list view show none', async ({
  page,
}) => {
  const course = (slug: keyof typeof seedIds) => `recipe-card-course-${seedIds[slug]}`;
  await open(page, '/rezepte');
  await expect(tid(page, 'recipe-view-tiles')).toHaveAttribute('aria-checked', 'true');
  await expect(tid(page, course('rec-mango-curry'))).toHaveText('Hauptgericht');
  await expect(tid(page, card('rec-grillabend'))).toBeVisible();
  await expect(tid(page, course('rec-grillabend'))).toHaveCount(0);
  await tid(page, 'recipe-search').fill('Gemischter Salat');
  await expect(tid(page, course('rec-gemischter-salat'))).toHaveText('Beilage');
  await tid(page, 'recipe-view-list').click();
  await expect(tid(page, card('rec-gemischter-salat'))).toBeVisible();
  await expect(tidPrefix(page, 'recipe-card-course-')).toHaveCount(0);
  await tid(page, 'recipe-view-tiles').click();
  await expect(tid(page, course('rec-gemischter-salat'))).toHaveText('Beilage');
});

test('AC-019 (0001) / AC-015 (0008): search tolerates typos and synonyms and survives opening a recipe', async ({
  page,
}) => {
  await open(page, '/rezepte');
  await tid(page, 'recipe-search').fill('halumi');
  await expect(tid(page, card('rec-halloumi-pfanne'))).toBeVisible();
  await tid(page, 'recipe-search').fill('Karotten');
  // Recipes with the ingredient "Möhren" whose title does not mention it.
  await expect(tid(page, card('rec-gemischter-salat'))).toBeVisible();
  await expect(tid(page, card('rec-kichererbsen-eintopf'))).toBeVisible();
  await expect(tid(page, card('rec-mango-curry'))).toBeHidden();
  await tid(page, card('rec-gemischter-salat')).click();
  await expect(tid(page, 'recipe-title')).toHaveText('Gemischter Salat');
  await back(page);
  await expect(tid(page, 'recipe-search')).toHaveValue('Karotten');
  await tid(page, 'recipe-search').fill('xyzzy');
  await expect(tid(page, 'recipes-no-results')).toContainText('Keine Rezepte für „xyzzy“');
});

test('AC-020 (0001): portions scale the amounts, the variant swaps the ingredient and the diet', async ({
  page,
}) => {
  await open(page, `/rezept/${MANGO}`);
  await expect(tid(page, 'servings-value')).toHaveText('4');
  await expect(tid(page, `variant-${nested('mango-curry-v1')}`)).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const coconut = tid(page, `ingredient-amount-${nested('mango-curry-i1')}`);
  await expect(tid(page, `ingredient-${nested('mango-curry-i1')}`)).toContainText('Kokosmilch');
  await expect(coconut).toHaveText('400 ml');
  await expect(tid(page, 'recipe-diet')).toHaveText('vegan');
  await tid(page, 'servings-plus').click();
  await tid(page, 'servings-plus').click();
  await expect(tid(page, 'servings-value')).toHaveText('6');
  await expect(coconut).toHaveText('600 ml');

  const ingredients = ingredientRows(tid(page, 'recipe-ingredients'));
  await expect(ingredients.filter({ hasText: 'Räuchertofu' })).toHaveCount(1);
  await tid(page, `variant-${nested('mango-curry-v2')}`).click();
  await expect(ingredients.filter({ hasText: 'Hähnchen' })).toHaveCount(1);
  await expect(ingredients.filter({ hasText: 'Tofu' })).toHaveCount(0);
  await expect(tid(page, 'recipe-diet')).toHaveText('mit Fleisch');
});

test('AC-021 (0001) / AC-003 (0008) / AC-060 (0006): "Neu" → "Rezept" creates "Linsen-Dal", first under "Neu"; no title, no recipe', async ({
  page,
}) => {
  await open(page, '/rezepte');
  await tid(page, 'recipe-sort').click();
  await tid(page, 'recipe-sort-new').click();
  const count = tid(page, 'recipe-count');
  await expect(count).toHaveText(/^\d+ Rezepte · \d+ Sammlungen$/);
  const before = Number((await count.innerText()).match(/\d+/)?.[0]);

  // Spec 0062, AC-001: "+" opens "Neu" on "Websuche" with the title; "Sammlung" stays reachable.
  await tid(page, 'recipe-new').click();
  await expect(tid(page, 'new-recipe-open-collection')).toBeVisible();
  await expect(tid(page, 'new-recipe-ai-tab-web')).toHaveAttribute('aria-selected', 'true');
  await tid(page, 'new-recipe-title').fill('Linsen-Dal');
  await tid(page, 'new-recipe-save').click();
  await expect(tid(page, 'recipe-title')).toHaveText('Linsen-Dal');
  // Nachklick 27.11., N-03 (replaces AC-060 of spec 0006): without ingredients and steps
  // "Auf die Liste" and "Kochen" are not there.
  await expect(tid(page, 'recipe-to-list')).toHaveCount(0);
  await expect(tid(page, 'start-cooking')).toHaveCount(0);
  await back(page);
  const cards = tidPrefix(page, 'recipe-card-').and(page.locator('[role="button"]'));
  await expect(cards.first()).toContainText('Linsen-Dal');
  // It is the new recipe, not the Linsen-Dal of the demo data.
  expect(await cards.first().getAttribute('data-testid')).not.toBe(card('rec-linsen-dal'));
  await expect(count).toHaveText(new RegExp(`^${before + 1} Rezepte`));

  await newFromMenu(page, 'recipe');
  await tid(page, 'new-recipe-save').click();
  await expect(tid(page, 'new-recipe-title-error')).toHaveText('Titel fehlt');
  await tid(page, 'new-recipe-cancel').click();
  await expect(count).toHaveText(new RegExp(`^${before + 1} Rezepte`));
});

test('AC-001 / AC-004 / AC-007 / AC-011 (0007): "+ Zutat" picks an article; a hint stays in the recipe; ⋯ opens the article', async ({
  page,
}) => {
  await open(page, '/rezepte');
  await newRecipe(page, 'Test-Curry');
  await tid(page, 'recipe-edit').click();
  await tid(page, 'recipe-add-ingredient').click();
  await expect(tid(page, 'ingredient-sheet')).toBeVisible();
  await tid(page, 'ingredient-amount').fill('400 ml');
  await tid(page, 'ingredient-article-search-input').fill('Kokos');
  await expect(tid(page, `ingredient-article-search-hit-${article('kokosmilch')}`)).toBeVisible();
  await tid(page, `ingredient-article-search-hit-${article('kokosmilch')}`).click();
  await expect(tid(page, 'ingredient-article-chosen')).toContainText('Kokosmilch');
  await tid(page, 'ingredient-prep-note').fill('gut geschüttelt');
  await tid(page, 'ingredient-save').click();
  await tid(page, 'recipe-edit-save').click();

  const rows = ingredientRows(tid(page, 'recipe-ingredients'));
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('400 ml');
  await expect(rows).toContainText('Kokosmilch');
  await expect(tidPrefix(page, 'ingredient-prep-note-')).toHaveText(/gut geschüttelt/);

  // ⋯ → "Artikel bearbeiten" opens the article; "Fertig" returns to the recipe.
  const id = ((await rows.getAttribute('data-testid')) ?? '').replace(/^ingredient-/, '');
  await tid(page, `ingredient-menu-${id}`).click();
  await tid(page, `ingredient-menu-${id}-article`).click();
  await expect(tid(page, 'article-name')).toHaveValue('Kokosmilch');
  await tid(page, 'article-done').click();
  await expect(tid(page, 'recipe-title')).toHaveText('Test-Curry');

  // The hint does not go on the list.
  await tid(page, `ingredient-empty-${id}`).click();
  await expect(toastMessage(page)).toHaveText('Kokosmilch steht auf der Liste');
  await back(page);
  await nav(page, 'liste');
  await expect(itemRows(page, 'Kokosmilch')).toHaveCount(1);
  await expect(page.getByText('gut geschüttelt')).toHaveCount(0);
});

test('AC-022 (0001) / AC-008 / AC-010 (0007): a pasted block saves the sure lines; an unknown one stays orange', async ({
  page,
}) => {
  await open(page, '/rezepte');
  await newRecipe(page, 'Paste-Curry');
  await tid(page, 'recipe-edit').click();
  await tid(page, 'recipe-paste-ingredients').click();
  await tid(page, 'ingredients-paste').fill(
    '200 ml Kokosmilch\n1 Mango\n1 Prise Salz\n2 Drachenfrüchte',
  );
  await tid(page, 'ingredients-paste-save').click();
  await expect(tid(page, 'recipe-ingredients-missing')).toHaveText(
    '1 Zutat braucht noch einen Artikel',
  );
  const orange = tidPrefix(page, 'open-row-').filter({ hasText: 'Drachenfrüchte' });
  await expect(orange.first()).toBeVisible();
  await tid(page, 'recipe-edit-save').click();
  // Spec 0037: the edit mode stays open with the orange line until it has an article or goes.
  await expect(tid(page, 'recipe-ingredients-missing')).toBeVisible();
  const removeId = await tidPrefix(page, 'open-row-')
    .and(page.locator('[data-testid$="-remove"]'))
    .first()
    .getAttribute('data-testid');
  await tid(page, removeId ?? 'open-row-remove').click();
  await tid(page, 'recipe-edit-save').click();

  const section = tid(page, 'recipe-ingredients');
  await expect(section.locator(`[data-testid^="ingredient-amount-"]${ACTIVE}`)).toHaveText([
    '200 ml',
    '1',
    '1 Prise',
  ]);
  await expect(ingredientRows(section)).toHaveText([/Kokosmilch/, /Mango/, /Salz/]);
});

test('AC-023 (0001): cooking mode steps through; "Ist alle" puts Kreuzkümmel on the list with undo', async ({
  page,
}) => {
  await open(page, `/rezept/${MANGO}`);
  await tid(page, 'start-cooking').click();
  await expect(tid(page, 'cooking-screen')).toBeVisible();
  await expect(tid(page, 'cook-step-index')).toHaveText(/^Schritt 1 von/);
  await expect(tid(page, 'cook-step-text')).toHaveText(
    'Reis nach Packungsangabe in Salzwasser garen.',
  );
  await tid(page, 'cook-next').click();
  await expect(tid(page, 'cook-step-index')).toHaveText(/^Schritt 2 von/);
  await tid(page, 'cook-close').click();

  await expect(tid(page, `ingredient-${nested('mango-curry-i8')}`)).toContainText('Kreuzkümmel');
  await tid(page, `ingredient-empty-${nested('mango-curry-i8')}`).click();
  await expect(toastMessage(page)).toHaveText('Kreuzkümmel steht auf der Liste');
  await expect(tid(page, 'toast-action')).toHaveText('Rückgängig');
  await back(page);
  await nav(page, 'liste');
  await expect(itemRows(page, 'Kreuzkümmel')).toHaveCount(1);
});

test('AC-004 / AC-006 (0018): the cooking mode cooks the 6 portions and the variant chosen on the recipe page', async ({
  page,
}) => {
  await open(page, `/rezept/${MANGO}`);
  await expect(tid(page, 'servings-value')).toHaveText('4');
  await tid(page, 'servings-plus').click();
  await tid(page, 'servings-plus').click();
  await expect(tid(page, 'servings-value')).toHaveText('6');
  await expect(tid(page, `ingredient-amount-${nested('mango-curry-i1')}`)).toHaveText('600 ml');
  await tid(page, `variant-${nested('mango-curry-v2')}`).click();

  await tid(page, 'start-cooking').click();
  await expect(tid(page, 'cooking-screen')).toBeVisible();
  await expect(tid(page, 'cook-subtitle')).toHaveText('Kochmodus · mit Hähnchen · 6 Portionen');
  // Spec 0023, AC-037: on the phone the ingredients stand open under the step.
  await expect(tid(page, 'cook-ingredients-toggle')).toHaveAttribute('aria-expanded', 'true');
  const ingredients = tid(page, 'cook-ingredients');
  await expect(tid(page, `cook-ingredient-${nested('mango-curry-i1')}`)).toContainText('600 ml');
  await expect(ingredients).toContainText('600 g');
  await expect(ingredients).toContainText('Hähnchenbrust');
  await expect(ingredients).not.toContainText('Räuchertofu');
  await tid(page, 'cook-close').click();
});

test('AC-020 / AC-028 (0008): the phone recipe page has its buttons under the head, no fields, one section at a time', async ({
  page,
}) => {
  await open(page, '/rezepte');
  await tid(page, card('rec-lasagne')).click();
  await expect(tid(page, 'recipe-title')).toHaveText('Lasagne');
  await expect(tid(page, 'tab-rezepte')).toBeVisible();
  await expect(tid(page, 'back')).toContainText('Essen');
  for (const id of ['recipe-favorite', 'recipe-plan', 'recipe-to-list', 'start-cooking']) {
    await expect(tid(page, id), id).toBeVisible();
  }
  await tid(page, 'recipe-more').click();
  // Spec 0054, AC-008: "Foto ändern" stands under the photo, not in ⋯.
  await expect(tid(page, 'recipe-more-photo')).toHaveCount(0);
  await expect(tid(page, 'recipe-more-delete')).toBeVisible();
  await page.keyboard.press('Escape');

  // The read view has no input field.
  await expect(page.locator(`[data-testid="recipe-screen"] input${ACTIVE}`)).toHaveCount(0);
  // Spec 0037: one pen opens every section, "Speichern" saves them together.
  await tid(page, 'recipe-edit').click();
  await tid(page, 'recipe-notes-input').fill('Mit doppelt Béchamel noch besser.');
  await tid(page, 'recipe-edit-save').click();
  await expect(tid(page, 'recipe-notes-text')).toHaveText('Mit doppelt Béchamel noch besser.');
  await page.reload();
  await expect(tid(page, 'recipe-notes-text')).toHaveText('Mit doppelt Béchamel noch besser.');
});

test('AC-022 (0008): offline the recipe reads, scales and cooks; writing is greyed out', async ({
  page,
}) => {
  await open(page, '/');
  await goOffline(page);
  await nav(page, 'rezepte');
  await tid(page, card('rec-lasagne')).click();
  await tid(page, 'servings-plus').click();
  await expect(tid(page, 'servings-value')).toHaveText('5');
  for (const id of ['recipe-plan', 'recipe-to-list', 'recipe-edit', 'recipe-favorite']) {
    await expect(tid(page, id), id).toHaveAttribute('aria-disabled', 'true');
  }
  await tid(page, 'start-cooking').click();
  await expect(tid(page, 'cooking-screen')).toBeVisible();
});

test('AC-021 (0008): an unknown recipe address shows "Dieses Rezept gibt es nicht mehr" with "Zu Essen"', async ({
  page,
}) => {
  await open(page, `/rezept/${randomUUID()}`);
  await expect(tid(page, 'recipe-not-found')).toContainText('Dieses Rezept gibt es nicht mehr');
  await tid(page, 'recipe-not-found-back').click();
  await expect(tid(page, 'recipes-screen')).toBeVisible();
});

test('AC-038 (0008): "Auf die Liste" keeps me on the recipe page', async ({ page }) => {
  await open(page, `/rezept/${LASAGNE}`);
  await tid(page, 'recipe-to-list').click();
  await expect(tid(page, 'pantry-check-sheet')).toContainText('Was brauchst du wirklich?');
  await tid(page, 'pc-apply').click();
  await expect(tid(page, 'pantry-check-sheet')).toBeHidden();
  await expect(tid(page, 'recipe-title')).toHaveText('Lasagne');
});

test('AC-001 / AC-007 / AC-008 (0009): a new collection, a new recipe while adding, and "Zu Sammlung hinzufügen"', async ({
  page,
}) => {
  await open(page, '/rezepte');
  await newFromMenu(page, 'collection');
  await expect(tid(page, 'new-recipe-kind-collection')).toHaveAttribute('aria-checked', 'true');
  await tid(page, 'new-recipe-title').fill('Raclette-Abend');
  await tid(page, 'new-recipe-save').click();
  await expect(tid(page, 'recipe-title')).toHaveText('Raclette-Abend');
  await expect(tid(page, 'collection-badge')).toHaveText('Sammlung');
  await expect(tid(page, 'collection-contents-empty')).toBeVisible();
  await expect(tid(page, 'collection-add-ingredient')).toBeVisible();
  await expect(page.locator(`[data-testid="start-cooking"]${ACTIVE}`)).toHaveCount(0);

  await tid(page, 'collection-add-recipes').click();
  await tid(page, 'collection-recipes-search-input').fill('Kräuterbutter');
  await tid(page, 'collection-recipes-search-create-recipe').click();
  const created = tidPrefix(page, 'collection-recipes-row-').filter({ hasText: 'Kräuterbutter' });
  await expect(created).toHaveAttribute('aria-checked', 'true');
  await tid(page, 'collection-recipes-save').click();
  await expect(tid(page, 'collection-contents')).toContainText('Kräuterbutter');
  await back(page);

  // From a recipe page: ⋯ → "Zu Sammlung hinzufügen".
  await tid(page, card('rec-mango-curry')).click();
  await tid(page, 'recipe-more').click();
  await tid(page, 'recipe-more-collection').click();
  await expect(tid(page, `add-to-collection-${seedIds['rec-grillabend']}`)).toBeVisible();
  await tidPrefix(page, 'add-to-collection-')
    .and(page.locator('[role="button"]'))
    .filter({ hasText: 'Raclette-Abend' })
    .click();
  await expect(toastMessage(page)).toHaveText('Zu „Raclette-Abend“ hinzugefügt');
  await back(page);
  await tid(page, 'recipe-search').fill('Raclette');
  await tidPrefix(page, 'recipe-card-')
    .and(page.locator('[role="button"]'))
    .filter({ hasText: 'Raclette-Abend' })
    .click();
  await expect(tid(page, `collection-content-${MANGO}`)).toContainText('Mango-Curry');
});
