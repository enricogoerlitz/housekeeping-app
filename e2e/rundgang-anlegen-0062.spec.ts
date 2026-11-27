import type { Page, Route } from '@playwright/test';

import type { RecipeDraft, RecipeDraftReply, WebSearchReply } from '@housekeeping/core';

import { contentReady, expect, open, test, tid, toastMessage, unique } from './helpers';

// Spec 0062 — "Rezept anlegen und mit KI ändern": one field with "Anlegen · Websuche · KI-Rezept"
// for a new recipe, "Anlegen · Websuche" for restaurants and activities, and ✨ "Mit KI ändern" on
// the recipe page whose "Übernehmen" saves with "Rückgängig". The edge functions are replaced with
// `page.route` (no paid call); what they get is checked from the request body.

const CARD = 'https://www.chefkoch.de/rezepte/1/bolognese.html';

const searchReply: WebSearchReply = {
  provider: 'serper',
  query: 'Spaghetti Bolognese',
  results: [{ url: CARD, title: 'Spaghetti Bolognese', source: 'chefkoch.de' }],
};

type DraftBody = { text: string; links: string[]; imagePrompt: boolean; current?: RecipeDraft };
type SearchBody = { query?: string; mode?: string };

function draft(title: string, extra: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    title,
    description: 'Ein schnelles Gericht.',
    servings: 4,
    course: 'main',
    tags: [],
    variants: [],
    ingredients: [{ name: 'Spaghetti', amount: '400 g' }],
    steps: [{ text: 'Nudeln kochen' }],
    ...extra,
  };
}

/** Answers ai-recipe-draft; returns the bodies it got. */
async function stubDraft(
  page: Page,
  answer: (body: DraftBody) => RecipeDraftReply | 'fail',
): Promise<DraftBody[]> {
  const bodies: DraftBody[] = [];
  await page.route('**/functions/v1/ai-recipe-draft', async (route: Route) => {
    const body = route.request().postDataJSON() as DraftBody;
    bodies.push(body);
    const reply = answer(body);
    if (reply === 'fail') {
      await route.fulfill({ status: 503, json: { error: 'ai_unavailable' } });
      return;
    }
    await route.fulfill({ json: reply });
  });
  return bodies;
}

/** Answers web-search with `reply`; returns the queries it got. */
async function stubSearch(page: Page, reply: WebSearchReply): Promise<string[]> {
  const queries: string[] = [];
  await page.route('**/functions/v1/web-search', async (route: Route) => {
    const body = route.request().postDataJSON() as SearchBody;
    // The preview of a place (mode "place"): the card alone is enough.
    if (body.mode === 'place') {
      await route.fulfill({ json: {} });
      return;
    }
    queries.push(body.query ?? '');
    await route.fulfill({ json: reply });
  });
  return queries;
}

/** The images are never made here. */
async function noImages(page: Page): Promise<void> {
  await page.route('**/functions/v1/ai-image*', (route) =>
    route.fulfill({ status: 503, json: { error: 'ai_unavailable' } }),
  );
}

async function newRecipeWindow(page: Page): Promise<void> {
  await open(page, '/rezepte');
  await tid(page, 'recipe-new').click();
  await expect(tid(page, 'new-recipe-sheet')).toBeVisible();
}

test.describe('REQ-001 – REQ-005: the window "Neu"', () => {
  test('AC-001, AC-003: "Websuche" first with the cursor in the title; "Anlegen" in the window, no row of big buttons', async ({
    page,
  }) => {
    await newRecipeWindow(page);
    await expect(tid(page, 'new-recipe-ai-tab-web')).toHaveText('Websuche');
    await expect(tid(page, 'new-recipe-ai-tab-prompt')).toHaveText('KI-Rezept');
    await expect(tid(page, 'new-recipe-ai-tab-web')).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, 'new-recipe-title')).toBeFocused();
    await expect(tid(page, 'new-recipe-save')).toHaveText(/Anlegen/);
    await expect(tid(page, 'new-recipe-web-submit')).toHaveAttribute('aria-label', 'Im Web suchen');
    await expect(page.getByRole('button', { name: 'KI-Rezept' })).toHaveCount(0);
  });

  test('AC-004: a tap on "KI-Rezept" gives its field the cursor', async ({ page }) => {
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-ai-tab-prompt').click();
    await expect(tid(page, 'new-recipe-ai-text')).toBeFocused();
    await expect(tid(page, 'new-recipe-ai-generate-photo')).toBeChecked();
  });

  test('AC-005, AC-007: Return searches once; "Übernehmen" of a hit opens the edit mode', async ({
    page,
  }) => {
    const queries = await stubSearch(page, searchReply);
    await stubDraft(page, () => ({
      draft: draft('Spaghetti Bolognese'),
      sources: [{ url: CARD, kind: 'page', read: true }],
    }));
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-title').pressSequentially('Spaghetti Bolognese');
    expect(queries).toEqual([]);
    await tid(page, 'new-recipe-title').press('Enter');
    await expect(tid(page, 'new-recipe-web-card-0')).toBeVisible();
    expect(queries).toEqual(['Spaghetti Bolognese']);
    await tid(page, 'new-recipe-web-card-0').click();
    await tid(page, 'new-recipe-web-take').click();
    await expect(tid(page, 'recipe-edit-save')).toBeVisible();
    await expect(tid(page, 'recipe-head-title')).toHaveValue('Spaghetti Bolognese');
  });

  test('AC-006: the magnifier in the field searches the title', async ({ page }) => {
    const queries = await stubSearch(page, searchReply);
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-title').fill('Lasagne');
    await tid(page, 'new-recipe-web-submit').click();
    await expect(tid(page, 'new-recipe-web-card-0')).toBeVisible();
    expect(queries).toEqual(['Lasagne']);
  });

  test('AC-008: "Anlegen" saves the title at once and opens the recipe', async ({ page }) => {
    const title = `Linsen-Dal ${unique()}`;
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-title').fill(title);
    await tid(page, 'new-recipe-save').click();
    await expect(tid(page, 'recipe-title')).toHaveText(title);
  });

  test('AC-009: without a title "Anlegen" says so, also from "KI-Rezept"', async ({ page }) => {
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-ai-tab-prompt').click();
    await tid(page, 'new-recipe-save').click();
    await expect(tid(page, 'new-recipe-ai-tab-web')).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, 'new-recipe-title-error')).toHaveText('Titel fehlt');
    await expect(tid(page, 'new-recipe-sheet')).toBeVisible();
  });

  test('AC-010: a link pasted into the title goes to "KI-Rezept"', async ({ page }) => {
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-title').fill(CARD);
    await expect(tid(page, 'new-recipe-ai-tab-prompt')).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, 'new-recipe-ai-text')).toHaveValue(CARD);
  });

  test('AC-011, AC-012, AC-014: "Erzeugen" in the head sends the wish with the title and a photo', async ({
    page,
  }) => {
    await noImages(page);
    const bodies = await stubDraft(page, () => ({ draft: draft('Meatball Pasta'), sources: [] }));
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-title').fill('Meatball Pasta');
    await tid(page, 'new-recipe-ai-tab-prompt').click();
    // The head names what happens on this tab; no second button below (owner, 27.11.2026).
    await expect(tid(page, 'new-recipe-ai-submit')).toHaveText(/Erzeugen/);
    await expect(tid(page, 'new-recipe-save')).toHaveCount(0);
    await expect(page.getByText('Rezept erzeugen')).toHaveCount(0);
    await expect(tid(page, 'new-recipe-ai-submit')).toHaveAttribute('aria-disabled', 'true');
    await tid(page, 'new-recipe-ai-text').fill('scharf, ohne Sahne, für 4');
    await tid(page, 'new-recipe-ai-submit').click();
    await expect(tid(page, 'recipe-edit-save')).toBeVisible();
    expect(bodies[0]?.text).toBe('Titel: Meatball Pasta\nscharf, ohne Sahne, für 4');
    expect(bodies[0]?.imagePrompt).toBe(true);
    await expect(tid(page, 'recipe-head-title')).toHaveValue('Meatball Pasta');
  });

  test('AC-013: the AI unavailable: the window stays with the wish and the hint', async ({
    page,
  }) => {
    await stubDraft(page, () => 'fail');
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-ai-tab-prompt').click();
    await tid(page, 'new-recipe-ai-text').fill('Meatball Pasta scharf ohne Sahne');
    await tid(page, 'new-recipe-ai-submit').click();
    await expect(tid(page, 'new-recipe-ai-error')).toBeVisible();
    await expect(tid(page, 'new-recipe-ai-text')).toHaveValue('Meatball Pasta scharf ohne Sahne');
  });

  test('AC-015: "Sammlung" creates a collection', async ({ page }) => {
    const title = `Sonntag ${unique()}`;
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-open-collection').click();
    await tid(page, 'new-recipe-title').fill(title);
    await tid(page, 'new-recipe-save').click();
    await expect(tid(page, 'collection-detail')).toBeVisible();
  });
});

test.describe('REQ-006: restaurants and activities', () => {
  test('AC-016: "Restaurant anlegen": name with the cursor and the magnifier, "Anlegen" in the window', async ({
    page,
  }) => {
    await open(page, '/rezepte?ansicht=restaurants');
    await tid(page, 'restaurant-new').click();
    await expect(tid(page, 'restaurant-name')).toBeFocused();
    await expect(tid(page, 'restaurant-web-name-search')).toBeVisible();
    await expect(tid(page, 'restaurant-save')).toHaveText(/Anlegen/);
  });

  test('AC-017: "Aktivität anlegen" the same; editing keeps "Speichern"', async ({ page }) => {
    await open(page, '/aktivitaeten');
    await tid(page, 'activity-add').click();
    await expect(tid(page, 'activity-name')).toBeFocused();
    await expect(tid(page, 'activity-web-name-search')).toBeVisible();
    await expect(tid(page, 'activity-save')).toHaveText(/Anlegen/);
  });
});

test.describe('REQ-007 – REQ-010: ✨ "Mit KI ändern"', () => {
  /** A recipe of its own with two ingredients, on its page. */
  async function ownRecipe(page: Page): Promise<string> {
    const title = `Chili ${unique()}`;
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-title').fill(title);
    await tid(page, 'new-recipe-open-ingredients').click();
    await tid(page, 'new-recipe-ingredients').fill('400 g Spaghetti\n500 g Hackfleisch');
    await tid(page, 'new-recipe-save').click();
    await expect(tid(page, 'recipe-title')).toHaveText(title);
    await contentReady(page);
    return title;
  }

  function vegan(title: string): RecipeDraft {
    return draft(title, {
      variants: [{ name: 'Basis' }, { name: 'Vegan' }],
      ingredients: [
        { name: 'Spaghetti', amount: '400 g' },
        { name: 'Hackfleisch', amount: '500 g' },
        { name: 'Räuchertofu', amount: '200 g', variant: 'Vegan' },
      ],
      steps: [],
    });
  }

  test('AC-018, AC-019, AC-022, AC-023, AC-027, AC-029: wish, proposal with only the changes, "Übernehmen" saves, "Rückgängig" undoes', async ({
    page,
  }) => {
    const title = await ownRecipe(page);
    const bodies = await stubDraft(page, () => ({ draft: vegan(title), sources: [] }));
    await tid(page, 'recipe-ai-change-open').click();
    await expect(tid(page, 'recipe-ai-change-tab-prompt')).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, 'recipe-ai-change-field-text')).toBeFocused();
    await tid(page, 'recipe-ai-change-field-web-search').click();
    await tid(page, 'recipe-ai-change-field-text').fill('füge eine vegane Variante hinzu');
    await tid(page, 'recipe-ai-change-submit').click();
    const proposal = tid(page, 'recipe-proposal');
    await expect(proposal).toContainText('Räuchertofu');
    await expect(proposal).not.toContainText('Hackfleisch');
    await expect(tid(page, 'recipe-proposal-mode')).toHaveCount(0);
    expect(bodies[0]?.current?.title).toBe(title);
    expect(bodies[0]?.text).toBe('füge eine vegane Variante hinzu');
    await tid(page, 'recipe-proposal-apply').click();
    await expect(toastMessage(page)).toHaveText('Rezept geändert');
    await expect(tid(page, 'recipe-edit-save')).toHaveCount(0);
    await expect(tid(page, 'recipe-ingredients')).toContainText('Vegan');
    await tid(page, 'toast-action').click();
    await expect(toastMessage(page)).toHaveText('Änderung zurückgenommen');
    await expect(tid(page, 'recipe-ingredients')).not.toContainText('Räuchertofu');
  });

  test('AC-020: a recipe with only a title opens on "Websuche" with the title', async ({
    page,
  }) => {
    const title = `Linsen-Dal ${unique()}`;
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-title').fill(title);
    await tid(page, 'new-recipe-save').click();
    await expect(tid(page, 'recipe-title')).toHaveText(title);
    await tid(page, 'recipe-ai-change-open').click();
    await expect(tid(page, 'recipe-ai-change-tab-web')).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, 'recipe-ai-change-web-query')).toHaveValue(title);
  });

  test('AC-021: in the edit mode there is no ✨', async ({ page }) => {
    await ownRecipe(page);
    await tid(page, 'recipe-edit').click();
    await expect(tid(page, 'recipe-ai-change-open')).toHaveCount(0);
  });

  test('AC-025: a row without an article opens the edit mode instead of saving', async ({
    page,
  }) => {
    const title = await ownRecipe(page);
    await stubDraft(page, () => ({
      draft: draft(title, {
        ingredients: [
          { name: 'Spaghetti', amount: '400 g' },
          { name: 'Hackfleisch', amount: '500 g' },
          { name: 'Xyzzy-Gewürz', amount: '1 TL' },
        ],
        steps: [],
      }),
      sources: [],
    }));
    await tid(page, 'recipe-ai-change-open').click();
    await tid(page, 'recipe-ai-change-field-text').fill('mehr Würze');
    await tid(page, 'recipe-ai-change-submit').click();
    await tid(page, 'recipe-proposal-apply').click();
    await expect(tid(page, 'recipe-edit-save')).toBeVisible();
  });

  test('AC-028: a recipe from the web search offers "Ergänzen · Ersetzen", "Ergänzen" first', async ({
    page,
  }) => {
    const title = await ownRecipe(page);
    await stubSearch(page, searchReply);
    await stubDraft(page, () => ({
      draft: draft('Spaghetti Bolognese', {
        ingredients: [{ name: 'Räuchertofu', amount: '200 g' }],
      }),
      sources: [{ url: CARD, kind: 'page', read: true }],
    }));
    await tid(page, 'recipe-ai-change-open').click();
    await tid(page, 'recipe-ai-change-tab-web').click();
    await tid(page, 'recipe-ai-change-web-query').fill(title);
    await tid(page, 'recipe-ai-change-web-submit').click();
    await tid(page, 'recipe-ai-change-web-card-0').click();
    await tid(page, 'recipe-ai-change-web-take').click();
    await expect(tid(page, 'recipe-proposal-mode-add')).toHaveAttribute('aria-checked', 'true');
    await expect(tid(page, 'recipe-proposal')).not.toContainText('entfernt');
    await tid(page, 'recipe-proposal-mode-replace').click();
    await expect(tid(page, 'recipe-proposal')).toContainText('entfernt');
  });
});
