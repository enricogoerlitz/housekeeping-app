import { describe, expect, it } from 'vitest';

import {
  AiImageReplySchema,
  AiImageRequestSchema,
  ErrorReplySchema,
  RecipeDraftReplySchema,
  RecipeDraftRequestSchema,
  RecipeDraftSchema,
  type RecipeDraft,
} from './ai-contract';

// Spec 0040: the contracts of ai-recipe-draft and ai-image, with the limits per call (Risiken:
// "Kosten laufen weg" — 3 links, 4 photos, 3 images).

const HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-000000000001';
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

const draft: RecipeDraft = {
  title: 'Apfelkuchen mit Streuseln',
  servings: 4,
  totalMinutes: 70,
  course: 'dessert',
  description: 'Saftiger Apfelkuchen mit knusprigen Streuseln.',
  tags: [{ name: 'backen', isNew: false }],
  variants: [],
  ingredients: [{ name: 'Weizenmehl Type 405', amount: '250 g' }],
  steps: [{ text: 'Streusel kneten' }, { text: 'Backen', timerMinutes: 45 }],
};

describe('RecipeDraftRequestSchema (REQ-001)', () => {
  it('AC-001: a sentence alone is enough; links, photos and "Foto generieren" have defaults', () => {
    const parsed = RecipeDraftRequestSchema.parse({
      householdId: HOUSEHOLD,
      text: 'Apfelkuchen für 4 wie bei Oma, mit Streuseln',
    });
    expect(parsed).toEqual({
      householdId: HOUSEHOLD,
      text: 'Apfelkuchen für 4 wie bei Oma, mit Streuseln',
      links: [],
      photos: [],
      imagePrompt: true,
    });
  });

  it('AC-003: a photo alone is enough', () => {
    expect(
      RecipeDraftRequestSchema.safeParse({ householdId: HOUSEHOLD, photos: [JPEG] }).success,
    ).toBe(true);
  });

  it('refuses an empty request: no text, no link, no photo', () => {
    expect(
      RecipeDraftRequestSchema.safeParse({ householdId: HOUSEHOLD, text: '   ' }).success,
    ).toBe(false);
  });

  it('limits per call: 2000 characters, 3 links, 4 photos', () => {
    const base = { householdId: HOUSEHOLD, text: 'Kuchen' };
    expect(RecipeDraftRequestSchema.safeParse({ ...base, text: 'x'.repeat(2001) }).success).toBe(
      false,
    );
    const links = ['https://a.de/1', 'https://a.de/2', 'https://a.de/3', 'https://a.de/4'];
    expect(RecipeDraftRequestSchema.safeParse({ ...base, links }).success).toBe(false);
    expect(RecipeDraftRequestSchema.safeParse({ ...base, links: links.slice(0, 3) }).success).toBe(
      true,
    );
    const photos = [JPEG, JPEG, JPEG, JPEG, JPEG];
    expect(RecipeDraftRequestSchema.safeParse({ ...base, photos }).success).toBe(false);
  });

  it('only https links and JPEG data URLs', () => {
    const base = { householdId: HOUSEHOLD, text: 'Kuchen' };
    expect(RecipeDraftRequestSchema.safeParse({ ...base, links: ['http://a.de/x'] }).success).toBe(
      false,
    );
    for (const photo of [
      'data:image/png;base64,iVBORw0KGgo=',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'https://a.de/bild.jpg',
      'data:image/jpeg;base64,<script>',
    ]) {
      expect(RecipeDraftRequestSchema.safeParse({ ...base, photos: [photo] }).success).toBe(false);
    }
  });

  it('refuses unknown fields', () => {
    expect(
      RecipeDraftRequestSchema.safeParse({ householdId: HOUSEHOLD, text: 'x', write: true })
        .success,
    ).toBe(false);
  });
});

describe('RecipeDraftSchema and RecipeDraftReplySchema', () => {
  it('AC-007: the draft holds recipe data only — any other field is refused', () => {
    expect(RecipeDraftSchema.safeParse(draft).success).toBe(true);
    expect(RecipeDraftSchema.safeParse({ ...draft, commands: [{ type: 'delete' }] }).success).toBe(
      false,
    );
    expect(RecipeDraftSchema.safeParse({ ...draft, servings: 0 }).success).toBe(false);
    expect(RecipeDraftSchema.safeParse({ ...draft, course: 'party' }).success).toBe(false);
  });

  it('AC-001: a draft without a description is refused (spec 0045)', () => {
    const { description: _, ...without } = draft;
    expect(RecipeDraftSchema.safeParse(without).success).toBe(false);
    expect(RecipeDraftSchema.safeParse({ ...draft, description: ' ' }).success).toBe(false);
  });

  it('AC-006, AC-007, AC-011: variants, groups and steps per variant fit the contract', () => {
    const withVariants: RecipeDraft = {
      ...draft,
      variants: [{ name: 'Mit Rinderhack' }, { name: 'Vegetarisch' }],
      ingredients: [
        { name: 'Spaghetti', amount: '400 g' },
        {
          name: 'Rinderhackfleisch',
          amount: '500 g',
          group: 'Für die Bällchen',
          variant: 'Mit Rinderhack',
        },
      ],
      steps: [{ text: 'Linsenbällchen formen', variant: 'Vegetarisch' }],
      leadTime: { text: 'Teig über Nacht gehen lassen', hoursBefore: 12 },
    };
    expect(RecipeDraftSchema.parse(withVariants)).toEqual(withVariants);
  });

  it('AC-013, AC-014: a timer is 1–600 minutes, a lead time 1–168 hours', () => {
    const step = (timerMinutes: number) => ({
      ...draft,
      steps: [{ text: 'Kochen', timerMinutes }],
    });
    expect(RecipeDraftSchema.safeParse(step(600)).success).toBe(true);
    expect(RecipeDraftSchema.safeParse(step(0)).success).toBe(false);
    expect(RecipeDraftSchema.safeParse(step(601)).success).toBe(false);
    const lead = (hoursBefore: number) => ({
      ...draft,
      leadTime: { text: 'Einweichen', hoursBefore },
    });
    expect(RecipeDraftSchema.safeParse(lead(168)).success).toBe(true);
    expect(RecipeDraftSchema.safeParse(lead(169)).success).toBe(false);
  });

  it('AC-004, AC-016: a reply says per link whether it was read; TikTok brings its resolved link', () => {
    const reply = {
      draft,
      sources: [
        { url: 'https://www.chefkoch.de/rezepte/1', kind: 'page', read: false },
        {
          url: 'https://vm.tiktok.com/ZGdXoJ8Ay/',
          kind: 'tiktok',
          read: true,
          resolvedUrl: 'https://www.tiktok.com/@jacobs_lunch/video/7686512961438960929',
          coverUrl: 'https://p16-common-sign.tiktokcdn-eu.com/cover.jpeg',
        },
      ],
    };
    expect(RecipeDraftReplySchema.parse(reply)).toEqual(reply);
  });
});

describe('Spec 0064: a YouTube video as a source', () => {
  it('AC-004: a reply carries a YouTube source with its address and thumbnail', () => {
    const reply = {
      draft,
      sources: [
        {
          url: 'https://youtu.be/gkgJAPBrwT8?si=x',
          kind: 'youtube',
          read: true,
          resolvedUrl: 'https://www.youtube.com/watch?v=gkgJAPBrwT8',
          coverUrl: 'https://i.ytimg.com/vi/gkgJAPBrwT8/maxresdefault.jpg',
        },
      ],
    };
    expect(RecipeDraftReplySchema.parse(reply)).toEqual(reply);
  });
});

describe('AiImageRequestSchema and AiImageReplySchema (REQ-004, REQ-005)', () => {
  it('AC-012: a prompt with style chips', () => {
    expect(
      AiImageRequestSchema.parse({
        householdId: HOUSEHOLD,
        prompt: 'Apfelkuchen',
        styles: ['rustic', 'top'],
      }),
    ).toEqual({ householdId: HOUSEHOLD, prompt: 'Apfelkuchen', styles: ['rustic', 'top'] });
  });

  it('AC-015: "Aus diesem Foto" sends the photo as a JPEG data URL', () => {
    expect(
      AiImageRequestSchema.safeParse({
        householdId: HOUSEHOLD,
        prompt: 'Text entfernen',
        image: JPEG,
      }).success,
    ).toBe(true);
    expect(
      AiImageRequestSchema.safeParse({
        householdId: HOUSEHOLD,
        prompt: 'Text entfernen',
        image: 'data:image/png;base64,iVBORw0KGgo=',
      }).success,
    ).toBe(false);
  });

  it('refuses an empty prompt, unknown styles and a prompt over 1000 characters', () => {
    const base = { householdId: HOUSEHOLD, prompt: 'Kuchen' };
    expect(AiImageRequestSchema.safeParse({ ...base, prompt: ' ' }).success).toBe(false);
    expect(AiImageRequestSchema.safeParse({ ...base, prompt: 'x'.repeat(1001) }).success).toBe(
      false,
    );
    expect(AiImageRequestSchema.safeParse({ ...base, styles: ['neon'] }).success).toBe(false);
  });

  it('AC-014: one to three images, base64 only, and how many failed', () => {
    expect(
      AiImageReplySchema.safeParse({ images: ['/9j/4AAQ', '/9j/4AAR'], failed: 1 }).success,
    ).toBe(true);
    expect(AiImageReplySchema.safeParse({ images: [], failed: 3 }).success).toBe(false);
    expect(AiImageReplySchema.safeParse({ images: ['a', 'b', 'c', 'd'], failed: 0 }).success).toBe(
      false,
    );
    expect(AiImageReplySchema.safeParse({ images: ['<html>'], failed: 0 }).success).toBe(false);
  });
});

describe('error codes', () => {
  it('a body over the limit is "payload_too_large" (413)', () => {
    expect(ErrorReplySchema.parse({ error: 'payload_too_large' })).toEqual({
      error: 'payload_too_large',
    });
  });
});

describe('Spec 0055: the current recipe, the web search and new articles in the contract', () => {
  const base = { householdId: HOUSEHOLD, text: 'füge eine vegane Variante hinzu' };

  it('AC-018, AC-026: the current recipe travels in the draft format', () => {
    const parsed = RecipeDraftRequestSchema.parse({ ...base, current: draft });
    expect(parsed.current).toEqual(draft);
  });

  it('AC-018: a current recipe without a description is fine (a stored recipe may have none)', () => {
    expect(
      RecipeDraftRequestSchema.safeParse({ ...base, current: { ...draft, description: '' } })
        .success,
    ).toBe(true);
  });

  it('a broken current recipe is refused', () => {
    expect(
      RecipeDraftRequestSchema.safeParse({ ...base, current: { ...draft, servings: 0 } }).success,
    ).toBe(false);
    expect(
      RecipeDraftRequestSchema.safeParse({ ...base, current: { ...draft, commands: [] } }).success,
    ).toBe(false);
  });

  it('AC-021: webQuery switches the web search on; at most 200 characters, not blank', () => {
    expect(RecipeDraftRequestSchema.parse({ ...base, webQuery: 'Chili vegan' }).webQuery).toBe(
      'Chili vegan',
    );
    expect(RecipeDraftRequestSchema.safeParse({ ...base, webQuery: 'x'.repeat(201) }).success).toBe(
      false,
    );
    expect(RecipeDraftRequestSchema.safeParse({ ...base, webQuery: '  ' }).success).toBe(false);
  });

  it('AC-030: a new ingredient may bring an area name and a diet; nothing else', () => {
    const withHints: RecipeDraft = {
      ...draft,
      ingredients: [{ name: 'Räuchertofu', amount: '200 g', area: 'Kühlregal', diet: 'vegan' }],
    };
    expect(RecipeDraftSchema.parse(withHints)).toEqual(withHints);
    expect(
      RecipeDraftSchema.safeParse({
        ...draft,
        ingredients: [{ name: 'Tofu', amount: '1', diet: 'non_food' }],
      }).success,
    ).toBe(false);
  });

  it('AC-023: the reply says whether the web search was used or unavailable', () => {
    expect(
      RecipeDraftReplySchema.parse({ draft, sources: [], webContext: 'unavailable' }).webContext,
    ).toBe('unavailable');
    expect(
      RecipeDraftReplySchema.safeParse({ draft, sources: [], webContext: 'maybe' }).success,
    ).toBe(false);
  });
});
