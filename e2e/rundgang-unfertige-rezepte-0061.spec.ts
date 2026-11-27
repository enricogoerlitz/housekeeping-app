import type { Page } from '@playwright/test';

import type { RecipeDraft, WebSearchReply } from '@housekeeping/core';

import { expect, freshSeed, goOffline, only, open, test, tid } from './helpers';
import { seedIds } from './seed-ids';

// Spec 0061 — unfinished recipes worked out one after the other: the quick chip „Unfertig (n)“,
// „Noch n unfertig“ with „Ausarbeiten“ over the list, the card on the recipe's page and „Weiter
// zum nächsten“. The web search and the AI are replaced with `page.route` (no paid call). The
// seed has no unfinished recipe; the tests create them, so the file starts from a fresh seed.

only('desktop');
freshSeed();

const LASAGNE = seedIds['rec-lasagne'];
const CARD = 'https://www.chefkoch.de/rezepte/1/apfelstrudel.html';

const DRAFT: RecipeDraft = {
  title: 'Apfelstrudel',
  description: 'Mit Zimt und Rosinen.',
  servings: 4,
  course: 'dessert',
  tags: [],
  variants: [],
  ingredients: [{ name: 'Mehl', amount: '250 g' }],
  steps: [{ text: 'Teig ausrollen, füllen und backen' }],
};

/** Answers the web search with one card and the AI with DRAFT; returns the queries searched. */
async function stubAi(page: Page): Promise<string[]> {
  const queries: string[] = [];
  await page.route('**/functions/v1/web-search', async (route) => {
    const query = (route.request().postDataJSON() as { query: string }).query;
    queries.push(query);
    const reply: WebSearchReply = {
      provider: 'serper',
      query,
      results: [{ url: CARD, title: `${query} – Chefkoch`, source: 'chefkoch.de' }],
    };
    await route.fulfill({ json: reply });
  });
  await page.route('**/functions/v1/ai-recipe-draft', (route) =>
    route.fulfill({ json: { draft: DRAFT, sources: [{ url: CARD, kind: 'page', read: true }] } }),
  );
  return queries;
}

/** A recipe with only a title, from "+" → "Rezept"; lands on its page. */
async function titleOnly(page: Page, title: string): Promise<void> {
  await open(page, '/rezepte');
  await tid(page, 'recipe-new').click();
  await tid(page, 'recipe-new-recipe').click();
  await tid(page, 'new-recipe-title').fill(title);
  await tid(page, 'new-recipe-save').click();
  await expect(tid(page, 'recipe-title')).toHaveText(title);
}

/** The first hit, „Übernehmen“, the Änderungsansicht, „Speichern“. */
async function takeFirstHitAndSave(page: Page): Promise<void> {
  await tid(page, 'recipe-ai-fill-web-card-0').click();
  await expect(tid(page, 'recipe-ai-fill-web-preview-ingredients')).toBeVisible();
  await tid(page, 'recipe-ai-fill-web-take').click();
  await tid(page, 'recipe-proposal-apply').click();
  await tid(page, 'recipe-edit-save').click();
  await expect(tid(page, 'recipe-edit')).toBeVisible();
}

test('AC-006: without unfinished recipes there is no chip „Unfertig“', async ({ page }) => {
  await open(page, '/rezepte');
  await expect(tid(page, 'recipe-quick-favorites')).toBeVisible();
  await expect(tid(page, 'recipe-quick-unfinished')).toHaveCount(0);
  await tid(page, 'recipe-filters-filter').click();
  await expect(tid(page, 'recipe-filter-quick-unfinished')).toHaveCount(0);
});

test('AC-012, AC-014: the card stands on a recipe with only a title, not on the Lasagne', async ({
  page,
}) => {
  await open(page, `/rezept/${LASAGNE}`);
  await expect(tid(page, 'recipe-title')).toBeVisible();
  await expect(tid(page, 'recipe-unfinished')).toHaveCount(0);
  await titleOnly(page, 'Chili');
  await expect(tid(page, 'recipe-unfinished')).toContainText('Noch nicht ausgearbeitet');
  await expect(tid(page, 'recipe-unfinished-ai')).toBeEnabled();
});

test('AC-013, AC-016: „Mit KI ausarbeiten“ searches the title at once; the pen does not', async ({
  page,
}) => {
  const queries = await stubAi(page);
  await titleOnly(page, 'Bami Goreng');
  await tid(page, 'recipe-edit').click();
  await tid(page, 'recipe-ai-fill-open').click();
  await expect(tid(page, 'recipe-ai-fill-web-query')).toHaveValue('Bami Goreng');
  await tid(page, 'recipe-ai-fill-cancel').click();
  await tid(page, 'recipe-edit-cancel').click();
  expect(queries).toEqual([]);

  await tid(page, 'recipe-unfinished-ai').click();
  await expect(tid(page, 'recipe-edit-save')).toBeVisible();
  await expect(tid(page, 'recipe-ai-fill-tab-web')).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, 'recipe-ai-fill-web-query')).toHaveValue('Bami Goreng');
  await expect(tid(page, 'recipe-ai-fill-web-card-0')).toBeVisible();
  await expect(tid(page, 'recipe-ai-fill-web-query')).not.toBeFocused();
  expect(queries).toEqual(['Bami Goreng']);
});

test('AC-005, AC-007, AC-008, AC-010, AC-017 – AC-020: the chip, „Ausarbeiten“ and „Weiter zum nächsten“', async ({
  page,
}) => {
  const queries = await stubAi(page);
  // „Chili“ and „Bami Goreng“ come from the tests above.
  await titleOnly(page, 'Apfelstrudel');
  await open(page, '/rezepte?sortierung=name');
  await expect(tid(page, 'recipe-quick-unfinished')).toHaveText('Unfertig (3)');
  await tid(page, 'recipe-quick-unfinished').click();
  await expect(page).toHaveURL(/unfertig=1/);
  await expect(tid(page, 'recipe-count')).toHaveText('Noch 3 unfertig');

  // AC-008: the address keeps it.
  await page.reload();
  await expect(tid(page, 'recipe-quick-unfinished')).toHaveAttribute('aria-selected', 'true');

  // AC-007: with „Vegan“ the button says two.
  await tid(page, 'recipe-quick-vegan').click();
  await expect(tid(page, 'recipe-filters-filter')).toContainText('Filter (2)');
  await tid(page, 'recipe-quick-vegan').click();

  // AC-010: the first of the list A–Z, in the edit mode, searching.
  await tid(page, 'recipe-work-out').click();
  await expect(tid(page, 'recipe-head-title')).toHaveValue('Apfelstrudel');
  await expect(tid(page, 'recipe-ai-fill-web-card-0')).toBeVisible();
  expect(queries).toEqual(['Apfelstrudel']);

  // AC-017: saved, then on to the next.
  await takeFirstHitAndSave(page);
  await expect(tid(page, 'recipe-worked-out-text')).toHaveText('Ausgearbeitet · noch 2 unfertig');
  await tid(page, 'recipe-unfinished-next').click();
  await expect(tid(page, 'recipe-ai-fill-web-card-0')).toBeVisible();
  expect(queries).toEqual(['Apfelstrudel', 'Bami Goreng']);

  // AC-018: skip „Bami Goreng“ — close the window and the edit mode, then on.
  await tid(page, 'recipe-ai-fill-cancel').click();
  await tid(page, 'recipe-edit-cancel').click();
  await expect(tid(page, 'recipe-unfinished-others')).toHaveText('Noch 2 weitere unfertig');
  await tid(page, 'recipe-unfinished-next').click();
  await expect(tid(page, 'recipe-ai-fill-web-query')).toHaveValue('Chili');

  // AC-019: after the last of the list it starts from the front.
  await takeFirstHitAndSave(page);
  await expect(tid(page, 'recipe-worked-out-text')).toHaveText('Ausgearbeitet · noch 1 unfertig');
  await tid(page, 'recipe-unfinished-next').click();
  await expect(tid(page, 'recipe-ai-fill-web-query')).toHaveValue('Bami Goreng');

  // AC-020: the last one.
  await takeFirstHitAndSave(page);
  await expect(tid(page, 'recipe-worked-out-text')).toHaveText('Alle Rezepte sind ausgearbeitet');
  await expect(tid(page, 'recipe-unfinished-next')).toHaveCount(0);

  // AC-009: the list with the filter on and nothing left.
  await open(page, '/rezepte?unfertig=1');
  await expect(tid(page, 'recipes-no-results')).toContainText('Alle Rezepte sind ausgearbeitet');
  await expect(tid(page, 'recipe-quick-unfinished')).toHaveText('Unfertig (0)');
  await tid(page, 'recipes-reset-filters').click();
  await expect(tid(page, 'recipe-quick-unfinished')).toHaveCount(0);
});

test('AC-011, AC-015, AC-024: offline the recipes open to read, the AI is off', async ({
  page,
}) => {
  await titleOnly(page, 'Dal');
  await titleOnly(page, 'Eintopf');
  await open(page, '/rezepte?unfertig=1&sortierung=name');
  await goOffline(page);
  await tid(page, 'recipe-work-out').click();
  await expect(tid(page, 'recipe-title')).toHaveText('Dal');
  await expect(tid(page, 'recipe-edit-save')).toHaveCount(0);
  await expect(tid(page, 'recipe-unfinished-ai')).toBeDisabled();
  await tid(page, 'recipe-unfinished-next').click();
  await expect(tid(page, 'recipe-title')).toHaveText('Eintopf');
  await expect(tid(page, 'recipe-edit-save')).toHaveCount(0);
});
