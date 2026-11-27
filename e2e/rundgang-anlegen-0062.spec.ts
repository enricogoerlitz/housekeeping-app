import type { Page, Route } from '@playwright/test';

import type { RecipeDraft, RecipeDraftReply, WebSearchReply } from '@housekeeping/core';

import { contentReady, expect, open, test, tid, toastMessage, unique } from './helpers';

// Spec 0062 — "Rezept anlegen und mit KI ändern": one field with "Anlegen · Websuche · KI-Rezept"
// for a new recipe, "Anlegen · Websuche" for restaurants and activities, and ✨ "Mit KI ändern" on
// the recipe page whose "Übernehmen" saves with "Rückgängig". The edge functions are replaced with
// `page.route` (no paid call); what they get is checked from the request body.

const CARD = 'https://www.chefkoch.de/rezepte/1/bolognese.html';
const SUGGESTED = 'Vorgeschlagen – die Eingabetaste wählt diesen Weg';

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

const way = (page: Page, path: 'web' | 'ai') => tid(page, `new-recipe-quick-path-${path}`);

test.describe('REQ-001 – REQ-007: "Neues Rezept"', () => {
  test('AC-001: one field with the cursor and three ways, disabled while it is empty', async ({
    page,
  }) => {
    await newRecipeWindow(page);
    await expect(tid(page, 'new-recipe-title')).toBeFocused();
    for (const id of ['new-recipe-save', 'new-recipe-quick-path-web', 'new-recipe-quick-path-ai'])
      await expect(tid(page, id)).toHaveAttribute('aria-disabled', 'true');
    await expect(tid(page, 'new-recipe-more')).toBeVisible();
    await expect(tid(page, 'new-recipe-open-collection')).toBeVisible();
  });

  test('AC-003, AC-004, AC-005, AC-006: the highlight follows the text', async ({ page }) => {
    await newRecipeWindow(page);
    const field = tid(page, 'new-recipe-title');
    await field.fill('Spaghetti Bolognese');
    await expect(way(page, 'web')).toHaveAttribute('aria-description', SUGGESTED);
    await field.fill('Meatball Pasta scharf ohne Sahne');
    await expect(way(page, 'ai')).toHaveAttribute('aria-description', SUGGESTED);
    await expect(way(page, 'web')).not.toHaveAttribute('aria-description', SUGGESTED);
    await field.fill('Pasta für 4');
    await expect(way(page, 'ai')).toHaveAttribute('aria-description', SUGGESTED);
    await field.fill('https://www.chefkoch.de/rezepte/123');
    await expect(way(page, 'ai')).toHaveAttribute('aria-description', SUGGESTED);
  });

  test('AC-007, AC-011, AC-012: Return searches once; the cards stand in the same window; "Übernehmen" opens the edit mode', async ({
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
    await expect(tid(page, 'new-recipe-quick-web-card-0')).toBeVisible();
    expect(queries).toEqual(['Spaghetti Bolognese']);
    await expect(tid(page, 'new-recipe-title')).toHaveValue('Spaghetti Bolognese');
    await tid(page, 'new-recipe-quick-web-card-0').click();
    await tid(page, 'new-recipe-quick-web-take').click();
    await expect(tid(page, 'recipe-edit-save')).toBeVisible();
    await expect(tid(page, 'recipe-head-title')).toHaveValue('Spaghetti Bolognese');
  });

  test('AC-009: "Anlegen" saves the title at once and opens the recipe', async ({ page }) => {
    const title = `Linsen-Dal ${unique()}`;
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-title').fill(title);
    await tid(page, 'new-recipe-save').click();
    await expect(tid(page, 'recipe-title')).toHaveText(title);
  });

  test('AC-010: a title that is too long is not saved', async ({ page }) => {
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-title').fill('a'.repeat(201));
    await tid(page, 'new-recipe-save').click();
    await expect(tid(page, 'new-recipe-title-error')).toHaveText('Höchstens 200 Zeichen');
    await expect(tid(page, 'new-recipe-sheet')).toBeVisible();
  });

  test('AC-013, AC-014: after the search "KI-Rezept" writes from the same text, with a photo', async ({
    page,
  }) => {
    await stubSearch(page, searchReply);
    await noImages(page);
    const bodies = await stubDraft(page, () => ({
      draft: draft('Meatball Pasta'),
      sources: [],
    }));
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-title').fill('Meatball Pasta');
    await way(page, 'web').click();
    await expect(tid(page, 'new-recipe-quick-web-card-0')).toBeVisible();
    await way(page, 'ai').click();
    await expect(tid(page, 'recipe-edit-save')).toBeVisible();
    expect(bodies[0]?.text).toBe('Meatball Pasta');
    expect(bodies[0]?.imagePrompt).toBe(true);
    await expect(tid(page, 'recipe-head-title')).toHaveValue('Meatball Pasta');
  });

  test('AC-015: Return with a link sends it to the AI', async ({ page }) => {
    await noImages(page);
    const bodies = await stubDraft(page, () => ({
      draft: draft('Bolognese'),
      sources: [{ url: CARD, kind: 'page', read: true }],
    }));
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-title').fill(CARD);
    await tid(page, 'new-recipe-title').press('Enter');
    await expect(tid(page, 'recipe-edit-save')).toBeVisible();
    expect(bodies[0]?.links).toEqual([CARD]);
  });

  test('AC-016: the AI unavailable: the window stays with the text and the hint', async ({
    page,
  }) => {
    await stubDraft(page, () => 'fail');
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-title').fill('Meatball Pasta scharf ohne Sahne');
    await way(page, 'ai').click();
    await expect(tid(page, 'new-recipe-quick-error')).toBeVisible();
    await expect(tid(page, 'new-recipe-title')).toHaveValue('Meatball Pasta scharf ohne Sahne');
  });

  test('AC-017: "Mehr" opens the full window on "Prompt" with the text', async ({ page }) => {
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-title').fill('Meatball Pasta scharf ohne Sahne');
    await tid(page, 'new-recipe-more').click();
    await expect(tid(page, 'new-recipe-ai-tab-prompt')).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, 'new-recipe-ai-text')).toHaveValue('Meatball Pasta scharf ohne Sahne');
    await expect(tid(page, 'new-recipe-ai-generate-photo')).toBeVisible();
  });

  test('AC-018: "Sammlung" creates a collection', async ({ page }) => {
    const title = `Sonntag ${unique()}`;
    await newRecipeWindow(page);
    await tid(page, 'new-recipe-open-collection').click();
    await tid(page, 'new-recipe-title').fill(title);
    await tid(page, 'new-recipe-save').click();
    await expect(tid(page, 'collection-detail')).toBeVisible();
  });
});

test.describe('REQ-008: restaurants and activities', () => {
  test('AC-019, AC-020, AC-021: name, Return searches, "Übernehmen" fills the form', async ({
    page,
  }) => {
    const queries = await stubSearch(page, {
      provider: 'serper',
      query: 'Coccodrillo',
      results: [
        {
          url: 'https://maps.google.com/?cid=1',
          title: 'Coccodrillo',
          source: 'Google Maps',
          address: 'Kanalstraße 1, Berlin',
        },
      ],
    });
    await open(page, '/rezepte?ansicht=restaurants');
    await tid(page, 'restaurant-new').click();
    await expect(tid(page, 'restaurant-start-text')).toBeFocused();
    await expect(tid(page, 'restaurant-start-path-web')).toBeVisible();
    await tid(page, 'restaurant-start-text').fill('Coccodrillo');
    await tid(page, 'restaurant-start-text').press('Enter');
    await expect(tid(page, 'restaurant-start-web-card-0')).toBeVisible();
    expect(queries).toEqual(['Coccodrillo']);
    await tid(page, 'restaurant-start-web-card-0').click();
    await tid(page, 'restaurant-start-web-take').click();
    await expect(tid(page, 'restaurant-name')).toHaveValue('Coccodrillo');
    await expect(tid(page, 'restaurant-address')).toHaveValue('Kanalstraße 1, Berlin');
  });

  test('AC-022, AC-023: a long name or a map link suggests "Anlegen"', async ({ page }) => {
    await open(page, '/rezepte?ansicht=restaurants');
    await tid(page, 'restaurant-new').click();
    await tid(page, 'restaurant-start-text').fill('Pizzeria am Kanal mit Garten');
    await expect(tid(page, 'restaurant-start-path-create')).toHaveAttribute(
      'aria-description',
      SUGGESTED,
    );
    await tid(page, 'restaurant-start-text').fill('https://maps.app.goo.gl/abc123');
    await expect(tid(page, 'restaurant-start-path-create')).toHaveAttribute(
      'aria-description',
      SUGGESTED,
    );
    await tid(page, 'restaurant-start-text').fill('Pizzeria am Kanal mit Garten');
    await tid(page, 'restaurant-start-text').press('Enter');
    await expect(tid(page, 'restaurant-name')).toHaveValue('Pizzeria am Kanal mit Garten');
  });

  test('AC-024: "Aktivität anlegen" → "Kletterhalle" → "Anlegen" shows the form', async ({
    page,
  }) => {
    await open(page, '/aktivitaeten');
    await tid(page, 'activity-add').click();
    await tid(page, 'activity-start-text').fill('Kletterhalle');
    await tid(page, 'activity-start-path-create').click();
    await expect(tid(page, 'activity-name')).toHaveValue('Kletterhalle');
  });
});

test.describe('REQ-009 – REQ-012: ✨ "Mit KI ändern"', () => {
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

  test('AC-026, AC-027, AC-030, AC-031, AC-035, AC-037: wish, proposal with only the changes, "Übernehmen" saves, "Rückgängig" undoes', async ({
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

  test('AC-028: a recipe with only a title opens on "Websuche" with the title', async ({
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

  test('AC-029: in the edit mode there is no ✨', async ({ page }) => {
    await ownRecipe(page);
    await tid(page, 'recipe-edit').click();
    await expect(tid(page, 'recipe-ai-change-open')).toHaveCount(0);
  });

  test('AC-033: a row without an article opens the edit mode instead of saving', async ({
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

  test('AC-036: a recipe from the web search offers "Ergänzen · Ersetzen", "Ergänzen" first', async ({
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
