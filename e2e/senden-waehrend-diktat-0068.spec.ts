import type { Page, Route } from '@playwright/test';

import type { RecipeDraft, RecipeDraftReply, WebSearchReply } from '@housekeeping/core';

import { contentReady, expect, fakeSpeech, only, open, test, tid } from './helpers';
import { seedIds } from './seed-ids';

// Spec 0068 — sending while dictation runs. The Speech service is faked (helpers.ts
// `fakeSpeech`): the interim words show while listening, the final phrase of the last words
// comes only after the stop, or never. The AI answers are stubbed per test.

only('phone');

const BOLOGNESE = seedIds['rec-spaghetti-bolognese'];

const DRAFT: RecipeDraft = {
  title: 'Spaghetti Bolognese',
  description: 'Klassische Bolognese mit veganer Variante.',
  servings: 4,
  course: 'main',
  tags: [],
  variants: [],
  ingredients: [{ name: 'Spaghetti', amount: '400 g' }],
  steps: [{ text: 'Nudeln kochen' }],
};

type DraftBody = { text: string };

/** Answers ai-recipe-draft; returns the bodies it got. */
async function stubDraft(page: Page): Promise<DraftBody[]> {
  const bodies: DraftBody[] = [];
  await page.route('**/functions/v1/ai-recipe-draft', async (route: Route) => {
    bodies.push(route.request().postDataJSON() as DraftBody);
    const reply: RecipeDraftReply = { draft: DRAFT, sources: [] };
    await route.fulfill({ json: reply });
  });
  return bodies;
}

/** The images are never made here. */
async function noImages(page: Page): Promise<void> {
  await page.route('**/functions/v1/ai-image*', (route) =>
    route.fulfill({ status: 503, json: { error: 'ai_unavailable' } }),
  );
}

async function newRecipePrompt(page: Page): Promise<void> {
  await open(page, '/rezepte');
  await tid(page, 'recipe-new').click();
  await tid(page, 'new-recipe-ai-tab-prompt').click();
  await expect(tid(page, 'new-recipe-ai-text')).toBeVisible();
}

/** The edit mode of the Bolognese and "Mit KI ändern". */
async function changeWithAi(page: Page): Promise<void> {
  await open(page, `/rezept/${BOLOGNESE}`);
  await contentReady(page);
  await tid(page, 'recipe-edit').click();
  await tid(page, 'recipe-ai-fill-open').click();
  await expect(tid(page, 'recipe-ai-fill')).toBeVisible();
}

/** "Mit KI ändern" with a typed wish, sent: the proposal with „Was soll noch anders sein?“. */
async function proposal(page: Page): Promise<void> {
  await changeWithAi(page);
  await tid(page, 'recipe-ai-fill-field-text').fill('füge eine vegane Variante hinzu');
  await tid(page, 'recipe-ai-fill-submit').click();
  await expect(tid(page, 'recipe-proposal-refine-text')).toBeVisible();
}

test.describe('REQ-001: send finishes the dictation and sends everything', () => {
  test('AC-001, AC-004: "Erzeugen" on an empty field sends the last words once', async ({
    page,
  }) => {
    await noImages(page);
    const bodies = await stubDraft(page);
    await fakeSpeech(page, 'Omas Apfelkuchen', { finalOnStop: 'Omas Apfelkuchen mit Streuseln' });
    await newRecipePrompt(page);
    await expect(tid(page, 'new-recipe-ai-submit')).toHaveAttribute('aria-disabled', 'true');
    await tid(page, 'new-recipe-ai-text-mic').click();
    await expect(tid(page, 'new-recipe-ai-text')).toHaveValue('Omas Apfelkuchen');
    // REQ-003: while listening, "Erzeugen" is usable although the field itself is still empty.
    await expect(tid(page, 'new-recipe-ai-submit')).not.toHaveAttribute('aria-disabled', 'true');
    await tid(page, 'new-recipe-ai-submit').click();
    await expect(tid(page, 'recipe-edit-save')).toBeVisible();
    expect(bodies.map((body) => body.text)).toEqual(['Omas Apfelkuchen mit Streuseln']);
  });

  test('AC-002, AC-012: typed words and dictated ones go together in "Mit KI ändern"', async ({
    page,
  }) => {
    const bodies = await stubDraft(page);
    await fakeSpeech(page, 'vegane', { finalOnStop: 'vegane Variante hinzu' });
    await changeWithAi(page);
    await tid(page, 'recipe-ai-fill-field-text').fill('Füg eine');
    await tid(page, 'recipe-ai-fill-field-text-mic').click();
    await expect(tid(page, 'recipe-ai-fill-field-text')).toHaveValue('Füg eine vegane');
    await tid(page, 'recipe-ai-fill-submit').click();
    await expect(tid(page, 'recipe-proposal')).toBeVisible();
    expect(bodies.map((body) => body.text)).toEqual(['Füg eine vegane Variante hinzu']);
  });

  test('AC-005: nothing heard sends nothing and says so', async ({ page }) => {
    const bodies = await stubDraft(page);
    await fakeSpeech(page, '');
    await newRecipePrompt(page);
    await tid(page, 'new-recipe-ai-text-mic').click();
    await expect(tid(page, 'new-recipe-ai-text-mic')).toHaveAccessibleName('Diktat beenden');
    await tid(page, 'new-recipe-ai-submit').click();
    await expect(tid(page, 'new-recipe-ai-text-mic-error')).toHaveText(
      'Nichts verstanden – sprich noch einmal oder tippe.',
    );
    await expect(tid(page, 'new-recipe-ai-text-mic')).toHaveAccessibleName('Diktieren');
    expect(bodies).toEqual([]);
  });

  test('AC-016: the second tap on the microphone only fills the field', async ({ page }) => {
    const bodies = await stubDraft(page);
    await fakeSpeech(page, 'Pizzateig', { finalOnStop: 'Pizzateig mit Hefe' });
    await newRecipePrompt(page);
    await tid(page, 'new-recipe-ai-text-mic').click();
    await expect(tid(page, 'new-recipe-ai-text')).toHaveValue('Pizzateig');
    await tid(page, 'new-recipe-ai-text-mic').click();
    await expect(tid(page, 'new-recipe-ai-text')).toHaveValue('Pizzateig mit Hefe');
    await expect(tid(page, 'new-recipe-ai-text-mic')).toHaveAccessibleName('Diktieren');
    expect(bodies).toEqual([]);
  });
});

test.describe('REQ-002, REQ-003: the composer „Was soll noch anders sein?“', () => {
  test('AC-015, AC-006: mic active, „Anpassen“ beside it; a double tap sends once', async ({
    page,
  }) => {
    const bodies = await stubDraft(page);
    await fakeSpeech(page, 'Linsen statt', { finalOnStop: 'Linsen statt Tofu' });
    await proposal(page);
    await expect(tid(page, 'recipe-proposal-refine-send')).toBeDisabled();
    await tid(page, 'recipe-proposal-refine-text-mic').click();
    await expect(tid(page, 'recipe-proposal-refine-text')).toHaveValue('Linsen statt');
    await expect(tid(page, 'recipe-proposal-refine-text-mic')).toHaveAccessibleName(
      'Diktat beenden',
    );
    await expect(tid(page, 'recipe-proposal-refine-send')).toBeEnabled();
    await tid(page, 'recipe-proposal-refine-send').dblclick();
    // A sent wish leaves the field (spec 0049, AC-027); then the send is disabled again.
    await expect(tid(page, 'recipe-proposal-refine-text')).toHaveValue('');
    await expect(tid(page, 'recipe-proposal-refine-send')).toBeDisabled();
    expect(bodies.map((body) => body.text)).toEqual([
      'füge eine vegane Variante hinzu',
      'Linsen statt Tofu',
    ]);
  });

  test('AC-003: without the final result the shown words go after 1.5 s', async ({ page }) => {
    const bodies = await stubDraft(page);
    await fakeSpeech(page, 'Linsen statt', { finalOnStop: null });
    await proposal(page);
    await tid(page, 'recipe-proposal-refine-text-mic').click();
    await expect(tid(page, 'recipe-proposal-refine-text')).toHaveValue('Linsen statt');
    await tid(page, 'recipe-proposal-refine-send').click();
    await expect.poll(() => bodies.length, { timeout: 5000 }).toBe(2);
    expect(bodies[1]?.text).toBe('Linsen statt');
  });
});

test.describe('REQ-002: "Websuche"', () => {
  test('AC-014: „Suchen“ while dictating searches the last words', async ({ page }) => {
    const queries: string[] = [];
    await page.route('**/functions/v1/web-search', async (route) => {
      queries.push((route.request().postDataJSON() as { query: string }).query);
      const reply: WebSearchReply = { provider: 'serper', query: 'Linsensuppe', results: [] };
      await route.fulfill({ json: reply });
    });
    await fakeSpeech(page, 'Linsen', { finalOnStop: 'Linsensuppe' });
    await changeWithAi(page);
    await tid(page, 'recipe-ai-fill-tab-web').click();
    await tid(page, 'recipe-ai-fill-web-query').fill('');
    await tid(page, 'recipe-ai-fill-web-query-mic').click();
    await expect(tid(page, 'recipe-ai-fill-web-query')).toHaveValue('Linsen');
    await tid(page, 'recipe-ai-fill-web-submit').click();
    await expect.poll(() => queries).toEqual(['Linsensuppe']);
  });
});
