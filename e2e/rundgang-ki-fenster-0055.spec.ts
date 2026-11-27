import type { Page, Route } from '@playwright/test';

import type { RecipeDraft, RecipeDraftReply, WebSearchReply } from '@housekeeping/core';

import { contentReady, expect, open, settle, test, tid } from './helpers';
import { seedIds } from './seed-ids';

// Spec 0055 — the AI windows v3: cursor and keyboard on a tab change, swiping between the tabs, a
// clear loading state, „Prompt“ with the recipe and an optional web search, „Anpassen“ in the
// Änderungsansicht, and the magnifier beside „Name“. The edge functions are replaced with
// `page.route` (no paid call); what they get is checked from the request body.

const BOLOGNESE = seedIds['rec-spaghetti-bolognese'];
const CARD = 'https://www.chefkoch.de/rezepte/1/pasta.html';

const DRAFT: RecipeDraft = {
  title: 'Spaghetti Bolognese',
  description: 'Klassische Bolognese mit veganer Variante.',
  servings: 4,
  course: 'main',
  tags: [],
  variants: [{ name: 'Mit Rind' }, { name: 'Vegan' }],
  ingredients: [
    { name: 'Spaghetti', amount: '400 g' },
    { name: 'Räuchertofu', amount: '200 g', variant: 'Vegan', area: 'Kühlregal', diet: 'vegan' },
  ],
  steps: [{ text: 'Tofu zerbröseln und anbraten', variant: 'Vegan' }],
};

const searchReply: WebSearchReply = {
  provider: 'serper',
  query: 'Pasta',
  results: [{ url: CARD, title: 'Pasta mit Tomaten', source: 'chefkoch.de' }],
};

type DraftBody = { text: string; current?: RecipeDraft; webQuery?: string };

/** Answers ai-recipe-draft with `reply`; returns the bodies it got. */
async function stubDraft(
  page: Page,
  answer: (body: DraftBody, call: number) => RecipeDraftReply | 'fail',
): Promise<DraftBody[]> {
  const bodies: DraftBody[] = [];
  await page.route('**/functions/v1/ai-recipe-draft', async (route: Route) => {
    const body = route.request().postDataJSON() as DraftBody;
    bodies.push(body);
    const reply = answer(body, bodies.length);
    if (reply === 'fail') {
      await route.fulfill({ status: 503, json: { error: 'ai_unavailable' } });
      return;
    }
    await route.fulfill({ json: reply });
  });
  return bodies;
}

/** "+" → "Rezept", a title, "Mit KI ausfüllen". */
async function newRecipeWithAi(page: Page, title: string): Promise<void> {
  await open(page, '/rezepte');
  await tid(page, 'recipe-new').click();
  await tid(page, 'recipe-new-recipe').click();
  await expect(tid(page, 'new-recipe-sheet')).toBeVisible();
  await tid(page, 'new-recipe-title').fill(title);
  await tid(page, 'new-recipe-open-ai').click();
}

/** The edit mode of the Bolognese and "Mit KI ausfüllen". */
async function editWithAi(page: Page): Promise<void> {
  await open(page, `/rezept/${BOLOGNESE}`);
  await contentReady(page);
  await tid(page, 'recipe-edit').click();
  await tid(page, 'recipe-ai-fill-open').click();
  await expect(tid(page, 'recipe-ai-fill')).toBeVisible();
}

test.describe('REQ-001, REQ-004: the tabs and the cursor', () => {
  test('AC-001, AC-013, AC-017: „Mit KI ausfüllen“ in „Neu“: „Websuche“ has the cursor with the title', async ({
    page,
  }) => {
    await newRecipeWithAi(page, 'Pasta');
    await expect(tid(page, 'new-recipe-ai-tab-web')).toHaveText('Websuche');
    await expect(tid(page, 'new-recipe-ai-tab-prompt')).toHaveText('Prompt');
    await expect(tid(page, 'new-recipe-web-query')).toHaveValue('Pasta');
    await expect(tid(page, 'new-recipe-web-query')).toBeFocused();
    await tid(page, 'new-recipe-ai-tab-prompt').click();
    await expect(tid(page, 'new-recipe-ai-generate-photo')).toBeChecked();
  });

  test('AC-002, AC-003: a tap on a tab gives its field the cursor', async ({ page }) => {
    await newRecipeWithAi(page, 'Pasta');
    await tid(page, 'new-recipe-ai-tab-prompt').click();
    await expect(tid(page, 'new-recipe-ai-text')).toBeFocused();
    await tid(page, 'new-recipe-ai-tab-web').click();
    await expect(tid(page, 'new-recipe-web-query')).toBeFocused();
  });

  test('AC-005: with results, „Websuche“ shows them again without the cursor in the field', async ({
    page,
  }) => {
    await page.route('**/functions/v1/web-search', (route) => route.fulfill({ json: searchReply }));
    await newRecipeWithAi(page, 'Pasta');
    await tid(page, 'new-recipe-web-submit').click();
    await expect(tid(page, 'new-recipe-web-card-0')).toBeVisible();
    await tid(page, 'new-recipe-ai-tab-prompt').click();
    await tid(page, 'new-recipe-ai-tab-web').click();
    await expect(tid(page, 'new-recipe-web-card-0')).toBeVisible();
    await expect(tid(page, 'new-recipe-web-query')).not.toBeFocused();
  });

  test('AC-004, AC-014, AC-020: editing a recipe with ingredients opens on „Prompt“, without „Ergänzen oder ersetzen?“', async ({
    page,
  }) => {
    await editWithAi(page);
    await expect(tid(page, 'recipe-ai-fill-tab-prompt')).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, 'recipe-ai-fill-field-text')).toBeFocused();
    await expect(tid(page, 'recipe-ai-fill-mode')).toHaveCount(0);
    await tid(page, 'recipe-ai-fill-tab-web').click();
    await expect(tid(page, 'recipe-ai-fill-mode')).toBeVisible();
  });
});

test.describe('REQ-002: swiping between the tabs', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  async function swipe(page: Page, dx: number) {
    const box = await tid(page, 'new-recipe-ai-swipe').boundingBox();
    const y = (box?.y ?? 400) + 40;
    const x = 200;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (const step of [0.1, 0.3, 0.6, 1]) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + dx * step, y }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle(page);
  }

  test('AC-006, AC-007, AC-008: left to „Prompt“, right back to „Websuche“; past the end it springs back', async ({
    page,
  }) => {
    await newRecipeWithAi(page, 'Pasta');
    await swipe(page, -160);
    await expect(tid(page, 'new-recipe-ai-tab-prompt')).toHaveAttribute('aria-selected', 'true');
    await swipe(page, -160);
    await expect(tid(page, 'new-recipe-ai-tab-prompt')).toHaveAttribute('aria-selected', 'true');
    await swipe(page, 160);
    await expect(tid(page, 'new-recipe-ai-tab-web')).toHaveAttribute('aria-selected', 'true');
  });
});

test('AC-010: a tapped hit shows pulsing placeholders until the recipe is read', async ({
  page,
}) => {
  await page.route('**/functions/v1/web-search', (route) => route.fulfill({ json: searchReply }));
  let answer: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  await page.route('**/functions/v1/ai-recipe-draft', async (route) => {
    await answered;
    await route.fulfill({
      json: { draft: DRAFT, sources: [{ url: CARD, kind: 'page', read: true }] },
    });
  });
  await newRecipeWithAi(page, 'Pasta');
  await tid(page, 'new-recipe-web-submit').click();
  await tid(page, 'new-recipe-web-card-0').click();
  await expect(page.getByRole('progressbar', { name: 'Das Rezept wird gelesen …' })).toBeVisible();
  answer();
  await expect(tid(page, 'new-recipe-web-preview-ingredients')).toBeVisible();
});

test.describe('REQ-006 – REQ-008: „Prompt“ on the recipe, the web search, „Anpassen“', () => {
  test('AC-018, AC-019: the wish goes with the recipe; the Änderungsansicht shows the new variant', async ({
    page,
  }) => {
    const bodies = await stubDraft(page, () => ({ draft: DRAFT, sources: [] }));
    await editWithAi(page);
    await tid(page, 'recipe-ai-fill-field-text').fill('füge eine vegane Variante hinzu');
    await tid(page, 'recipe-ai-fill-submit').click();
    await expect(tid(page, 'recipe-proposal')).toBeVisible();
    expect(bodies[0]?.text).toBe('füge eine vegane Variante hinzu');
    expect(bodies[0]?.current?.title).toBe('Spaghetti Bolognese');
    expect(bodies[0]?.current?.ingredients.length).toBeGreaterThan(0);
    expect(bodies[0]?.webQuery).toBeUndefined();
    await expect(tid(page, 'recipe-proposal')).toContainText('Vegan');
  });

  test('AC-021: with „Websuche“ on, the title and the wish are searched', async ({ page }) => {
    const bodies = await stubDraft(page, () => ({
      draft: DRAFT,
      sources: [],
      webContext: 'used',
    }));
    await editWithAi(page);
    await tid(page, 'recipe-ai-fill-field-web-search').click();
    await tid(page, 'recipe-ai-fill-field-text').fill('füge eine vegane Variante hinzu');
    await tid(page, 'recipe-ai-fill-submit').click();
    await expect(tid(page, 'recipe-proposal')).toBeVisible();
    expect(bodies[0]?.webQuery).toBe('Spaghetti Bolognese füge eine vegane Variante hinzu');
  });

  test('AC-023: the search unavailable: the proposal comes with a hint', async ({ page }) => {
    await stubDraft(page, () => ({ draft: DRAFT, sources: [], webContext: 'unavailable' }));
    await editWithAi(page);
    await tid(page, 'recipe-ai-fill-field-web-search').click();
    await tid(page, 'recipe-ai-fill-field-text').fill('vegan');
    await tid(page, 'recipe-ai-fill-submit').click();
    await expect(
      page.getByText('Ohne Websuche ausgefüllt – die Suche war nicht erreichbar.'),
    ).toBeVisible();
  });

  test('AC-026, AC-027, AC-028: „Anpassen“ sends the proposal; a failure keeps it and the sentence', async ({
    page,
  }) => {
    const tofu: RecipeDraft = {
      ...DRAFT,
      ingredients: [
        DRAFT.ingredients[0]!,
        { name: 'Linsen', amount: '200 g', variant: 'Vegan', diet: 'vegan' },
      ],
    };
    const bodies = await stubDraft(page, (_body, call) =>
      call === 1
        ? { draft: DRAFT, sources: [] }
        : call === 2
          ? 'fail'
          : { draft: tofu, sources: [] },
    );
    await editWithAi(page);
    await tid(page, 'recipe-ai-fill-field-text').fill('füge eine vegane Variante hinzu');
    await tid(page, 'recipe-ai-fill-submit').click();
    await expect(tid(page, 'recipe-proposal')).toBeVisible();
    await expect(tid(page, 'recipe-proposal-refine-send')).toBeDisabled();
    await tid(page, 'recipe-proposal-refine-text').fill('nimm Linsen statt Tofu');
    await tid(page, 'recipe-proposal-refine-send').click();
    await expect(tid(page, 'recipe-proposal-refine-error')).toBeVisible();
    await expect(tid(page, 'recipe-proposal-refine-text')).toHaveValue('nimm Linsen statt Tofu');
    await expect(tid(page, 'recipe-proposal')).toContainText('Räuchertofu');
    await tid(page, 'recipe-proposal-refine-send').click();
    await expect(tid(page, 'recipe-proposal')).toContainText('Linsen');
    expect(bodies[2]?.current).toEqual(DRAFT);
    expect(bodies[2]?.text).toBe('nimm Linsen statt Tofu');
  });
});

test.describe('REQ-010: the magnifier beside „Name“', () => {
  test('AC-034: „Restaurant anlegen“: name, magnifier, the search runs at once', async ({
    page,
  }) => {
    const queries: string[] = [];
    await page.route('**/functions/v1/web-search', async (route) => {
      queries.push((route.request().postDataJSON() as { query: string }).query);
      await route.fulfill({ json: { ...searchReply, query: 'Coccodrillo', results: [] } });
    });
    await open(page, '/rezepte');
    await tid(page, 'recipe-new').click();
    await tid(page, 'recipe-new-restaurant').click();
    await tid(page, 'restaurant-name').fill('Coccodrillo');
    await expect(tid(page, 'restaurant-web-open')).toHaveCount(0);
    await tid(page, 'restaurant-web-name-search').click();
    await expect(tid(page, 'restaurant-web-sheet')).toBeVisible();
    await expect(tid(page, 'restaurant-web-query')).toHaveValue('Coccodrillo');
    await expect.poll(() => queries).toEqual(['Coccodrillo']);
  });

  test('AC-035: „Aktivität anlegen“ without a name: the window with the cursor, no search', async ({
    page,
  }) => {
    let searched = false;
    await page.route('**/functions/v1/web-search', async (route) => {
      searched = true;
      await route.fulfill({ json: searchReply });
    });
    await open(page, '/aktivitaeten');
    await tid(page, 'activity-add').click();
    await tid(page, 'activity-web-name-search').click();
    await expect(tid(page, 'activity-web-sheet')).toBeVisible();
    await expect(tid(page, 'activity-web-query')).toHaveValue('');
    await expect(tid(page, 'activity-web-query')).toBeFocused();
    expect(searched).toBe(false);
  });

  test('AC-036: editing a restaurant keeps the link and has no magnifier', async ({ page }) => {
    await open(page, `/restaurant/${seedIds['rest-enzo']}`);
    await contentReady(page);
    await tid(page, 'restaurant-edit').click();
    await expect(tid(page, 'restaurant-web-open')).toBeVisible();
    await expect(tid(page, 'restaurant-web-name-search')).toHaveCount(0);
  });
});
