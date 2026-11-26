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
  tags: ['backen'],
  ingredients: [{ name: 'Weizenmehl Type 405', amount: '250 g' }],
  steps: ['Streusel kneten', 'Backen'],
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
