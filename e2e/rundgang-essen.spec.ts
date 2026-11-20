import {
  ACTIVE,
  back,
  expect,
  freshSeed,
  itemRows,
  nav,
  nestedSeedId,
  only,
  open,
  SUPABASE_URL,
  test,
  tid,
  tidPrefix,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';
import type { Locator } from '@playwright/test';

const MANGO = seedIds['rec-mango-curry'];
const card = (slug: keyof typeof seedIds) => `recipe-card-${seedIds[slug]}`;
/** Ingredient and variant ids of the seed recipes: `mango-curry-i1`, `mango-curry-v2`, … */
const nested = nestedSeedId;

/** The ingredient rows of a recipe (not their amount, note or action elements). */
function ingredientRows(scope: Locator): Locator {
  return scope.locator(
    [
      '[data-testid^="ingredient-"]',
      ':not([data-testid^="ingredient-amount-"])',
      ':not([data-testid^="ingredient-note-"])',
      ':not([data-testid^="ingredient-empty-"])',
      ':not([data-testid^="ingredient-shopping-note-"])',
      ACTIVE,
    ].join(''),
  );
}

// Spec 0001 — Heute and recipes (REQ-005) and the AI on the recipe side (REQ-009), against the
// local backend (spec 0003). The edge functions are stubbed (helpers.ts); AC-040 (the sample
// proposal) is replaced by spec 0003 AC-026 in rundgang-backend.spec.ts.
// The tests change the demo (new recipes, list items), so the file starts from a fresh seed.

only('phone');
freshSeed();

test('AC-017: Heute shows Lasagne, the preparation for tomorrow, due chores and open items', async ({
  page,
}) => {
  await open(page, '/');
  await expect(tid(page, 'today-meals')).toContainText('Lasagne');
  await expect(tid(page, 'today-prep')).toContainText('Für morgen: Kichererbsen einweichen');
  await expect(tid(page, 'today-chores')).toContainText('Bad putzen');
  const shown = Number((await tid(page, 'today-shopping-count').innerText()).match(/\d+/)?.[0]);
  await nav(page, 'liste');
  const open_ = page.locator(
    `[data-testid^="item-"][role="checkbox"][aria-checked="false"]${ACTIVE}`,
  );
  await expect(open_.first()).toBeVisible();
  expect(shown, 'count on Heute equals open items of the Standardliste').toBe(await open_.count());
});

test('AC-018: the filter "Vegetarisch" keeps Mango-Curry and hides Spaghetti Bolognese', async ({
  page,
}) => {
  await open(page, '/rezepte');
  await expect(tid(page, card('rec-spaghetti-bolognese'))).toBeVisible();
  await tid(page, 'filter-vegetarian').click();
  await expect(tid(page, 'filter-vegetarian')).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, card('rec-mango-curry'))).toBeVisible();
  await expect(tid(page, card('rec-spaghetti-bolognese'))).toBeHidden();
});

test('AC-019: search tolerates typos ("halumi") and knows synonyms ("Karotten" → Möhren)', async ({
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
});

test('AC-020: portions scale the amounts, the variant swaps the ingredient and the diet', async ({
  page,
}) => {
  await open(page, `/rezept/${MANGO}`);
  await expect(tid(page, 'servings-value')).toHaveText('4');
  await expect(tid(page, `variant-${nested('mango-curry-v1')}`)).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(tid(page, `variant-${nested('mango-curry-v1')}`)).toHaveText('mit Tofu');
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
  await expect(tid(page, `variant-${nested('mango-curry-v2')}`)).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(ingredients.filter({ hasText: 'Hähnchen' })).toHaveCount(1);
  await expect(ingredients.filter({ hasText: 'Tofu' })).toHaveCount(0);
  await expect(tid(page, 'recipe-diet')).toHaveText('mit Fleisch');
});

test('AC-021: a new recipe "Linsen-Dal" is first when sorted by "Neu"; no title, no recipe', async ({
  page,
}) => {
  await open(page, '/rezepte');
  await tid(page, 'recipe-sort-new').click();
  const before = Number((await tid(page, 'recipe-count').innerText()).match(/\d+/)?.[0]);

  await tid(page, 'recipe-new').click();
  await tid(page, 'new-recipe-title').fill('Linsen-Dal');
  await tid(page, 'new-recipe-save').click();
  await expect(tid(page, 'recipe-title')).toHaveText('Linsen-Dal');
  await back(page);
  const cards = tidPrefix(page, 'recipe-card-');
  await expect(cards.first()).toContainText('Linsen-Dal');
  // It is the new recipe, not the Linsen-Dal of the demo data.
  expect(await cards.first().getAttribute('data-testid')).not.toBe(card('rec-linsen-dal'));
  await expect(tid(page, 'recipe-count')).toHaveText(`${before + 1} Rezepte`);

  await tid(page, 'recipe-new').click();
  await tid(page, 'new-recipe-save').click();
  await expect(tid(page, 'new-recipe-title-error')).toHaveText('Titel fehlt');
  await expect(tid(page, 'new-recipe-sheet')).toBeVisible();
  await tid(page, 'new-recipe-sheet-close').click();
  await expect(tid(page, 'recipe-count')).toHaveText(`${before + 1} Rezepte`);
});

test('AC-022: a pasted block becomes three ingredient lines with amount and article', async ({
  page,
}) => {
  await open(page, '/rezepte');
  await tid(page, 'recipe-new').click();
  await tid(page, 'new-recipe-title').fill('Test-Curry');
  await tid(page, 'new-recipe-save').click();
  await expect(tid(page, 'recipe-title')).toHaveText('Test-Curry');

  await tid(page, 'recipe-paste-ingredients').click();
  await tid(page, 'ingredients-paste').fill('200 ml Kokosmilch\n1 Mango\n1 Prise Salz');
  await tid(page, 'ingredients-paste-save').click();
  const section = tid(page, 'recipe-ingredients');
  const amounts = section.locator(`[data-testid^="ingredient-amount-"]${ACTIVE}`);
  await expect(amounts).toHaveText(['200 ml', '1', '1 Prise']);
  // Each line: the amount as written in the recipe, then the article.
  await expect(ingredientRows(section)).toHaveText([
    /^200 ml\s*Kokosmilch$/,
    /^1\s*Mango$/,
    /^1 Prise\s*Salz$/,
  ]);
});

test('AC-023: cooking mode steps through; "Ist alle" puts Kreuzkümmel on the list with undo', async ({
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
  await expect(tid(page, 'cook-step-text')).toContainText('Zwiebel, Knoblauch und Ingwer');
  await tid(page, 'cook-close').click();

  await expect(tid(page, `ingredient-${nested('mango-curry-i8')}`)).toContainText('Kreuzkümmel');
  await tid(page, `ingredient-empty-${nested('mango-curry-i8')}`).click();
  const shownAt = Date.now();
  await expect(toastMessage(page)).toHaveText('Kreuzkümmel steht auf der Liste');
  await expect(tid(page, 'toast-action')).toHaveText('Rückgängig');

  await back(page);
  await nav(page, 'liste');
  await expect(itemRows(page, 'Kreuzkümmel')).toHaveCount(1);

  // The undo offer lasts five seconds.
  await page.waitForTimeout(Math.max(0, 4_000 - (Date.now() - shownAt)));
  await expect(tid(page, 'toast-action')).toBeVisible();
  await page.waitForTimeout(Math.max(0, 6_000 - (Date.now() - shownAt)));
  await expect(tid(page, 'toast')).toBeHidden();
});

test('AC-042: AI search is off at first, can be switched on and stays on after a reload', async ({
  page,
}) => {
  // The answer of `ai-search` is a contract-shaped stub (helpers.ts aiFixtures.aiSearch).
  await open(page, '/rezepte');
  const toggle = tid(page, 'ai-search-toggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await tid(page, 'recipe-search').fill('was Schnelles mit Tofu');
  await expect(tid(page, 'ai-search-results')).toBeHidden();
  await expect(tid(page, 'recipe-count')).toHaveText(/Rezepte?$/);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  const results = tid(page, 'ai-search-results');
  await expect(results).toBeVisible();
  expect(await results.locator('[data-testid^="ai-chip-"]').count()).toBeGreaterThan(0);
  const hits = results.locator('[data-testid^="ai-result-"]');
  expect(await hits.count()).toBeGreaterThan(0);
  // Each hit carries a reason.
  for (const hit of await hits.all()) {
    expect(
      (await hit.innerText()).split('\n').filter((line) => line.trim()).length,
    ).toBeGreaterThan(1);
  }

  await page.reload();
  await expect(tid(page, 'ai-search-toggle')).toHaveAttribute('aria-checked', 'true');
});

// Spec 0003: the assistant answers through our edge function `ai-assistant` (stubbed here); the
// browser talks to nothing but this host and our Supabase.
test('AC-043: a free question gets the assistant’s answer; nothing leaves this host and our Supabase', async ({
  page,
  requests,
}) => {
  await open(page, '/');
  await tid(page, 'assistant-open').click();
  await tid(page, 'assistant-input').fill('Wie wird das Wetter morgen in Köln?');
  await tid(page, 'assistant-send').click();
  await expect(tid(page, 'assistant-answer')).toContainText('Dazu kann ich leider nichts sagen.');
  await page.waitForLoadState('networkidle');
  const allowed = new Set([new URL(page.url()).host, new URL(SUPABASE_URL()).host]);
  expect(
    requests.filter((url) => !url.startsWith('data:') && !allowed.has(new URL(url).host)),
  ).toEqual([]);
  expect(requests.some((url) => url.endsWith('/functions/v1/ai-assistant'))).toBe(true);
});
