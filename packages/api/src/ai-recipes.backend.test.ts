// "Mit KI ausfüllen" and the image variants (spec 0040): the requests carry the active household
// and the shrunk photos as JPEG data URLs; the variants come back as JPEG blobs; offline nothing
// is sent; nothing is stored.
import { fillPageDraft, newRecipe, pageDraft, type RecipeDraftReply } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { AiError } from './ai';
import { base64ToBytes, bytesToBase64, draftRecipeAsync, generateImagesAsync } from './ai-recipes';
import { H, withBackend } from './backend-test-helpers';
import { createRecipeFromPage } from './commands-recipe-page';
import { getData, OfflineError } from './store';

const fx = withBackend();

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const reply: RecipeDraftReply = {
  draft: {
    title: 'Apfelkuchen',
    servings: 4,
    description: 'Ein einfacher Apfelkuchen.',
    course: 'dessert',
    tags: [],
    variants: [],
    ingredients: [{ name: 'Mehl', amount: '250 g' }],
    steps: [{ text: 'Backen' }],
  },
  sources: [],
};

describe('base64', () => {
  it('round-trips bytes, also more than one chunk', () => {
    const big = new Uint8Array(100_000).map((_, index) => index % 251);
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big);
    expect(bytesToBase64(JPEG)).toBe('/9j/4AAQSkZJRg==');
  });
});

describe('draftRecipeAsync (spec 0040, REQ-001)', () => {
  it('AC-001, AC-003: sends text, links and photos (data URLs) for the active household', async () => {
    await fx.startEnrico();
    const sent: unknown[] = [];
    fx.server.setAi({
      recipeDraft: (request) => {
        sent.push(request);
        return reply;
      },
    });
    const before = getData().recipes.length;
    await expect(
      draftRecipeAsync({
        text: ' Linsensuppe ',
        links: ['https://www.chefkoch.de/rezepte/1'],
        photos: [new Blob([JPEG], { type: 'image/jpeg' })],
        imagePrompt: false,
      }),
    ).resolves.toEqual(reply);
    expect(sent).toEqual([
      {
        householdId: H,
        text: 'Linsensuppe',
        links: ['https://www.chefkoch.de/rezepte/1'],
        photos: ['data:image/jpeg;base64,/9j/4AAQSkZJRg=='],
        imagePrompt: false,
      },
    ]);
    // AC-001: nothing is saved by the draft.
    expect(getData().recipes).toHaveLength(before);
  });

  it('AC-005: the AI failing is an AiError; offline nothing is sent', async () => {
    const engine = await fx.startEnrico();
    fx.server.setAi({});
    await expect(
      draftRecipeAsync({ text: 'Kuchen', links: [], photos: [], imagePrompt: true }),
    ).rejects.toBeInstanceOf(AiError);
    engine.setSimulatedOffline(true);
    let calls = 0;
    fx.server.setAi({
      recipeDraft: () => {
        calls += 1;
        return reply;
      },
    });
    await expect(
      draftRecipeAsync({ text: 'Kuchen', links: [], photos: [], imagePrompt: true }),
    ).rejects.toBeInstanceOf(OfflineError);
    expect(calls).toBe(0);
  });
});

describe('generateImagesAsync (spec 0040, REQ-004, REQ-005)', () => {
  it('AC-012, AC-014: the variants come back as JPEG blobs with the count that failed', async () => {
    await fx.startEnrico();
    const sent: unknown[] = [];
    fx.server.setAi({
      image: (request) => {
        sent.push(request);
        return { images: [bytesToBase64(JPEG), bytesToBase64(JPEG)], failed: 1 };
      },
    });
    const result = await generateImagesAsync({ prompt: 'Apfelkuchen', styles: ['rustic'] });
    expect(result.failed).toBe(1);
    expect(result.images).toHaveLength(2);
    expect(result.images[0]?.type).toBe('image/jpeg');
    expect(new Uint8Array(await result.images[0]!.arrayBuffer())).toEqual(JPEG);
    expect(sent).toEqual([{ householdId: H, prompt: 'Apfelkuchen', styles: ['rustic'] }]);
  });

  it('AC-015: "Aus diesem Foto" sends the photo as a data URL', async () => {
    await fx.startEnrico();
    const sent: { image?: string }[] = [];
    fx.server.setAi({
      image: (request) => {
        sent.push(request);
        return { images: [bytesToBase64(JPEG)], failed: 0 };
      },
    });
    await generateImagesAsync({
      prompt: 'Text entfernen',
      styles: [],
      image: new Blob([JPEG], { type: 'image/jpeg' }),
    });
    expect(sent[0]?.image).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
  });

  it('spec 0052, AC-011: context and the extra of "Neu generieren" travel as their own fields', async () => {
    await fx.startEnrico();
    const sent: unknown[] = [];
    fx.server.setAi({
      image: (request) => {
        sent.push(request);
        return { images: [bytesToBase64(JPEG)], failed: 0 };
      },
    });
    const context = { kind: 'recipe' as const, title: 'Spaghetti mit Bällchen in Tomatensoße' };
    await generateImagesAsync({
      prompt: 'spaghetti with meatballs',
      styles: [],
      extra: ' heller und mit Basilikum ',
      context,
    });
    await generateImagesAsync({ prompt: 'Pasta', styles: [], extra: '  ' });
    expect(sent).toEqual([
      {
        householdId: H,
        prompt: 'spaghetti with meatballs',
        styles: [],
        extra: 'heller und mit Basilikum',
        context,
      },
      { householdId: H, prompt: 'Pasta', styles: [] },
    ]);
  });
});

describe('createRecipeFromPage (spec 0040, AC-001)', () => {
  it('AC-001: a new recipe exists only after "Speichern", with its filled sections, in one change', async () => {
    await fx.startEnrico();
    const before = getData().recipes.length;
    const recipe = newRecipe({
      id: '0b6f4f39-4a27-4cb2-9c1f-0c8f6b0e0a01',
      kind: 'recipe',
      title: 'Apfelkuchen',
      servings: 2,
      createdAt: '2026-11-26T10:00:00Z',
    });
    let seq = 0;
    const page = fillPageDraft(
      pageDraft(recipe, []),
      {
        title: 'Apfelkuchen mit Streuseln',
        description: 'Mit Streuseln.',
        servings: 4,
        // Spec 0045: variants and a step of one variant are saved with the new recipe.
        variants: [
          { id: 'f1e2d3c4-0000-4000-8000-0000000000aa', name: 'Mit Zimt', isDefault: true },
        ],
        steps: [
          { text: 'Backen', timerMinutes: 45 },
          { text: 'Zimt streuen', variantId: 'f1e2d3c4-0000-4000-8000-0000000000aa' },
        ],
      },
      () => `step-${++seq}`,
    );
    expect(getData().recipes).toHaveLength(before);
    createRecipeFromPage(page);
    await fx.settle();
    const saved = getData().recipes.find((candidate) => candidate.id === recipe.id);
    expect(saved).toMatchObject({
      title: 'Apfelkuchen mit Streuseln',
      description: 'Mit Streuseln.',
      servings: 4,
      variants: [{ id: 'f1e2d3c4-0000-4000-8000-0000000000aa', name: 'Mit Zimt', isDefault: true }],
    });
    expect(saved?.steps).toMatchObject([
      { text: 'Backen', timerMinutes: 45 },
      { text: 'Zimt streuen', variantId: 'f1e2d3c4-0000-4000-8000-0000000000aa' },
    ]);
    expect(getData().recipes).toHaveLength(before + 1);
    expect(fx.server.calls.filter((call) => call.fn === 'apply_changes')).toHaveLength(1);
  });

  it('refuses a page with a problem and offline, before anything changes', async () => {
    const engine = await fx.startEnrico();
    const recipe = newRecipe({
      id: '0b6f4f39-4a27-4cb2-9c1f-0c8f6b0e0a02',
      kind: 'recipe',
      title: 'X',
      servings: 2,
      createdAt: '2026-11-26T10:00:00Z',
    });
    const page = pageDraft(recipe, []);
    expect(() => createRecipeFromPage({ ...page, head: { ...page.head, title: ' ' } })).toThrow(
      'Titel fehlt',
    );
    engine.setSimulatedOffline(true);
    expect(() => createRecipeFromPage(page)).toThrow(OfflineError);
    expect(getData().recipes.some((candidate) => candidate.id === recipe.id)).toBe(false);
  });
});
