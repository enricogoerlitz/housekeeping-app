import { describe, expect, it } from 'vitest';

import type { RecipeDraft, RecipeDraftSource } from './ai-contract';
import type { StarterCatalogEntry } from './article-catalog';
import { fillPageDraft, pageDraft } from './page-editor';
import {
  AI_DRAFT_UNREACHABLE_MESSAGE,
  defaultImagePrompt,
  draftLinks,
  draftToPageInput,
  imageFailureNotice,
  insertAtCursor,
  isDictationStopWord,
  isNewTag,
  linkChipLabel,
  mainIngredientNames,
} from './recipe-draft';
import { articles, articlesById, makeRecipe } from './test-fixtures';
import type { Article } from './types';

const mehl: Article = {
  ...articles[0]!,
  id: 'art-mehl',
  name: 'Weizenmehl Type 405',
  synonyms: ['Mehl'],
};
const household: Article[] = [...articles, mehl];
const catalog: StarterCatalogEntry[] = [{ name: 'Zimt', diet: 'vegan', isPantry: true }];

let seq = 0;
const newKey = () => `k${++seq}`;
let ids = 0;
const newId = () => `v${++ids}`;
/** The household's tags in their spelling (spec 0045, REQ-002). */
const knownTags = ['backen', 'one pot', 'schnell'];
const context = { articles: household, catalog, newKey, newId, tags: knownTags };

const draft: RecipeDraft = {
  title: 'Apfelkuchen mit Streuseln',
  servings: 4,
  totalMinutes: 70,
  course: 'dessert',
  cuisine: 'deutsch',
  description: 'Saftiger Apfelkuchen mit Streuseln.',
  tags: [
    { name: 'Backen', isNew: false },
    { name: 'kuchen', isNew: true },
  ],
  variants: [],
  ingredients: [
    { name: 'Mehl', amount: '250 g' },
    { name: 'Möhren', amount: '2', note: 'gerieben', group: 'Teig' },
    { name: 'Zimt', amount: '1 TL' },
    { name: 'Drachenfrucht', amount: '1' },
  ],
  steps: [{ text: 'Streusel kneten' }, { text: 'Backen', timerMinutes: 45 }],
  notes: 'Warm servieren',
  imagePrompt: 'apple crumble cake',
};

describe('draftToPageInput: ingredients map to the household articles (AC-002)', () => {
  const input = draftToPageInput(draft, [], context);
  const rows = input.ingredients ?? [];

  it('AC-002: "Mehl" is the synonym of "Weizenmehl Type 405": the row has that article', () => {
    expect(rows[0]).toMatchObject({
      amountText: '250 g',
      article: { kind: 'article', articleId: 'art-mehl' },
    });
  });

  it('AC-002: a name or synonym match keeps amount, note and group', () => {
    expect(rows[1]).toMatchObject({
      amountText: '2',
      prepNote: 'gerieben',
      group: 'Teig',
      article: { kind: 'article', articleId: 'art-moehren' },
    });
  });

  it('a starter catalog entry is created on saving, like a pasted line', () => {
    expect(rows[2]?.article).toMatchObject({ kind: 'hit', hit: { kind: 'starter', name: 'Zimt' } });
  });

  it('AC-002: an ingredient without a matching article is marked new (created on "Speichern")', () => {
    expect(rows[3]).toMatchObject({
      name: 'Drachenfrucht',
      article: { kind: 'new', name: 'Drachenfrucht' },
    });
  });

  it('AC-001: head, Einordnung, steps and notes come along', () => {
    expect(input).toMatchObject({
      title: 'Apfelkuchen mit Streuseln',
      servings: 4,
      totalMinutes: 70,
      course: 'dessert',
      cuisine: 'deutsch',
      description: 'Saftiger Apfelkuchen mit Streuseln.',
      tags: ['backen', 'kuchen'],
      steps: [{ text: 'Streusel kneten' }, { text: 'Backen', timerMinutes: 45 }],
      notes: 'Warm servieren',
    });
  });
});

describe('draftToPageInput: tags from the household (spec 0045, REQ-002)', () => {
  const tagged = (names: string[]) =>
    draftToPageInput({ ...draft, tags: names.map((name) => ({ name, isNew: false })) }, [], context)
      .tags;

  it('AC-003: a tag the household has is taken in its spelling', () => {
    expect(tagged(['One Pot', 'Schnell'])).toEqual(['one pot', 'schnell']);
  });

  it('AC-005: a tag the household does not have is new', () => {
    expect(isNewTag('pasta', knownTags)).toBe(true);
    expect(isNewTag('One Pot', knownTags)).toBe(false);
  });

  it('AC-004: at most 5 tags, each once', () => {
    expect(tagged(['a', 'b', 'A', 'c', 'd', 'e', 'f', 'g'])).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('draftToPageInput: variants (spec 0045, REQ-003)', () => {
  const meatballs: RecipeDraft = {
    ...draft,
    variants: [{ name: 'Mit Rinderhack' }, { name: 'Vegetarisch' }, { name: 'vegetarisch' }],
    ingredients: [
      { name: 'Spaghetti', amount: '400 g' },
      {
        name: 'Hackfleisch',
        amount: '500 g',
        group: 'Für die Bällchen',
        variant: 'Mit Rinderhack',
      },
      { name: 'Linsen', amount: '200 g', group: 'Für die Bällchen', variant: 'VEGETARISCH' },
      { name: 'Tomaten', amount: '800 g', group: 'Für die Soße', variant: 'Mit Pilzen' },
    ],
    steps: [
      { text: 'Bällchen formen', variant: 'Mit Rinderhack' },
      { text: 'Linsenbällchen formen', variant: 'Vegetarisch' },
      { text: 'Soße 20 Minuten köcheln', timerMinutes: 20 },
    ],
  };
  const input = draftToPageInput(meatballs, [], context);
  const [meat, veggie] = input.variants ?? [];

  it('AC-006: each variant once, the first is the standard', () => {
    expect(input.variants).toHaveLength(2);
    expect(meat).toMatchObject({ name: 'Mit Rinderhack', isDefault: true });
    expect(veggie).toMatchObject({ name: 'Vegetarisch', isDefault: false });
  });

  it('AC-006: a row of a variant belongs to it, a shared one to none', () => {
    const rows = input.ingredients ?? [];
    expect(rows[0]?.variantId).toBeUndefined();
    expect(rows[1]?.variantId).toBe(meat?.id);
    expect(rows[2]?.variantId).toBe(veggie?.id);
  });

  it('AC-009: a row naming a variant the draft does not have is shared', () => {
    expect(input.ingredients?.[3]?.variantId).toBeUndefined();
  });

  it('AC-011: the group comes along', () => {
    expect(input.ingredients?.map((row) => row.group)).toEqual([
      '',
      'Für die Bällchen',
      'Für die Bällchen',
      'Für die Soße',
    ]);
  });

  it('AC-007, AC-013: steps keep their variant and timer', () => {
    expect(input.steps).toEqual([
      { text: 'Bällchen formen', variantId: meat?.id },
      { text: 'Linsenbällchen formen', variantId: veggie?.id },
      { text: 'Soße 20 Minuten köcheln', timerMinutes: 20 },
    ]);
  });

  it('a lead time comes along', () => {
    const withLead = draftToPageInput(
      { ...draft, leadTime: { text: 'Teig über Nacht', hoursBefore: 12 } },
      [],
      context,
    );
    expect(withLead.leadTime).toEqual({ text: 'Teig über Nacht', hoursBefore: 12 });
  });
});

describe('draftToPageInput: links (AC-016, AC-017)', () => {
  const sources: RecipeDraftSource[] = [
    { url: 'https://www.chefkoch.de/rezepte/1', kind: 'page', read: true },
    {
      url: 'https://vm.tiktok.com/ZGdXoJ8Ay/',
      kind: 'tiktok',
      read: true,
      resolvedUrl: 'https://www.tiktok.com/@jacobs_lunch/video/7686512961438960929',
    },
    { url: 'https://vm.tiktok.com/kaputt/', kind: 'tiktok', read: false },
  ];

  it('AC-016: the resolved TikTok link is the recipe link; AC-017: a failed one is kept as sent', () => {
    const input = draftToPageInput(draft, sources, context);
    expect(input.links).toEqual([
      { url: 'https://www.chefkoch.de/rezepte/1' },
      {
        url: 'https://www.tiktok.com/@jacobs_lunch/video/7686512961438960929',
        label: 'TikTok',
      },
      { url: 'https://vm.tiktok.com/kaputt/', label: 'TikTok' },
    ]);
  });
});

describe('fillPageDraft with a draft from the AI', () => {
  const recipe = makeRecipe({
    id: 'rec-1',
    title: 'Kuchen',
    servings: 2,
    ingredients: [{ id: 'i-milch', articleId: 'art-milch', shoppingRule: 'count' }],
    steps: [{ id: 's-1', text: 'Alt' }],
  });
  const input = draftToPageInput(draft, [], context);

  it('AC-006: "Ergänzen" keeps the ingredients and steps there are', () => {
    const filled = fillPageDraft(pageDraft(recipe, []), input, newKey);
    expect(filled.ingredients.rows).toHaveLength(5);
    expect(filled.ingredients.rows[0]?.ingredientId).toBe('i-milch');
    expect(filled.steps?.steps.map((step) => step.text)).toEqual([
      'Alt',
      'Streusel kneten',
      'Backen',
    ]);
  });

  it('AC-006: "Ersetzen" replaces ingredients and steps', () => {
    const filled = fillPageDraft(pageDraft(recipe, []), input, newKey, { replace: true });
    expect(filled.ingredients.rows).toHaveLength(4);
    expect(filled.ingredients.rows.some((row) => row.ingredientId === 'i-milch')).toBe(false);
    expect(filled.steps?.steps.map((step) => step.text)).toEqual(['Streusel kneten', 'Backen']);
  });

  it('fills the Einordnung: course, cuisine, tags without doubles', () => {
    const page = pageDraft({ ...recipe, tags: ['Backen'] }, []);
    const filled = fillPageDraft(page, input, newKey);
    expect(filled.classification).toMatchObject({
      course: 'dessert',
      cuisine: 'deutsch',
      tags: ['Backen', 'kuchen'],
    });
  });

  it('AC-001, AC-002: an empty description is filled; "Ergänzen" keeps one there is', () => {
    expect(fillPageDraft(pageDraft(recipe, []), input, newKey).head.description).toBe(
      'Saftiger Apfelkuchen mit Streuseln.',
    );
    const own = pageDraft({ ...recipe, description: 'Omas Rezept' }, []);
    expect(fillPageDraft(own, input, newKey).head.description).toBe('Omas Rezept');
    expect(fillPageDraft(own, input, newKey, { replace: true }).head.description).toBe(
      'Saftiger Apfelkuchen mit Streuseln.',
    );
  });

  it('AC-013: a step keeps its timer', () => {
    const filled = fillPageDraft(pageDraft(recipe, []), input, newKey);
    expect(filled.steps?.steps.at(-1)).toMatchObject({ text: 'Backen', timerMinutes: 45 });
  });

  const withVariants = makeRecipe({
    ...recipe,
    variants: [
      { id: 'var-fleisch', name: 'Mit Hähnchen', isDefault: true },
      { id: 'var-veggie', name: 'Vegetarisch', isDefault: false },
    ],
    ingredients: [
      { id: 'i-milch', articleId: 'art-milch', shoppingRule: 'count', variantId: 'var-veggie' },
    ],
  });
  const variantInput = draftToPageInput(
    {
      ...draft,
      variants: [{ name: 'vegetarisch' }, { name: 'Mit Tofu' }],
      ingredients: [{ name: 'Linsen', amount: '200 g', variant: 'vegetarisch' }],
      steps: [{ text: 'Tofu braten', variant: 'Mit Tofu' }],
    },
    [],
    context,
  );

  it('AC-008: "Ergänzen" reuses a variant of the same name and adds the others', () => {
    const filled = fillPageDraft(pageDraft(withVariants, []), variantInput, newKey);
    expect(filled.ingredients.variants.map((variant) => [variant.name, variant.isDefault])).toEqual(
      [
        ['Mit Hähnchen', true],
        ['Vegetarisch', false],
        ['Mit Tofu', false],
      ],
    );
    const tofu = filled.ingredients.variants[2]?.id;
    expect(filled.ingredients.rows.at(-1)?.variantId).toBe('var-veggie');
    expect(filled.steps?.steps.at(-1)).toMatchObject({ text: 'Tofu braten', variantId: tofu });
  });

  it('AC-010: "Ersetzen" replaces the variants; the first of the draft is the standard', () => {
    const filled = fillPageDraft(pageDraft(withVariants, []), variantInput, newKey, {
      replace: true,
    });
    expect(filled.ingredients.variants.map((variant) => [variant.name, variant.isDefault])).toEqual(
      [
        ['vegetarisch', true],
        ['Mit Tofu', false],
      ],
    );
    expect(filled.ingredients.rows.map((row) => row.variantId)).toEqual([
      filled.ingredients.variants[0]?.id,
    ]);
  });

  it('a lead time fills an empty Vorlauf', () => {
    const filled = fillPageDraft(
      pageDraft(recipe, []),
      { leadTime: { text: 'Teig über Nacht', hoursBefore: 12 } },
      newKey,
    );
    expect(filled.steps).toMatchObject({ leadTimeText: 'Teig über Nacht', leadTimeHours: '12' });
  });
});

describe('draftLinks: the links in the AI field (REQ-001)', () => {
  it('finds https, http and bare addresses with a path, at most 3, each once', () => {
    expect(
      draftLinks(
        'Omas Apfelkuchen wie auf chefkoch.de/rezepte/123 und https://www.lecker.de/kuchen, ' +
          'siehe http://essen.de/a und https://www.lecker.de/kuchen und https://vierter.de/x',
      ),
    ).toEqual([
      'https://chefkoch.de/rezepte/123',
      'https://www.lecker.de/kuchen',
      'https://essen.de/a',
    ]);
  });

  it('a TikTok short link is a link; text without one has none', () => {
    expect(draftLinks('Das hier: https://vm.tiktok.com/ZGdXoJ8Ay/')).toEqual([
      'https://vm.tiktok.com/ZGdXoJ8Ay/',
    ]);
    expect(draftLinks('Pizzateig mit Hefe. Für 4.')).toEqual([]);
  });
});

describe('linkChipLabel (AC-004, AC-017)', () => {
  it('while reading, after a failure and after reading', () => {
    expect(linkChipLabel('https://www.chefkoch.de/rezepte/1', 'reading')).toBe(
      'chefkoch.de wird gelesen …',
    );
    expect(linkChipLabel('https://www.chefkoch.de/rezepte/1', 'failed')).toBe(
      'chefkoch.de konnte nicht gelesen werden',
    );
    expect(linkChipLabel('https://www.chefkoch.de/rezepte/1', 'read')).toBe('chefkoch.de');
  });

  it('AC-017: a TikTok link is called TikTok', () => {
    expect(linkChipLabel('https://vm.tiktok.com/ZGdXoJ8Ay/', 'failed')).toBe(
      'TikTok konnte nicht gelesen werden',
    );
    expect(linkChipLabel('https://www.tiktok.com/@a/video/1', 'reading')).toBe(
      'TikTok wird gelesen …',
    );
  });
});

describe('insertAtCursor: dictation into the AI field (AC-008)', () => {
  it('AC-008: into an empty field', () => {
    expect(insertAtCursor('', { start: 0, end: 0 }, 'Pizzateig mit Hefe')).toEqual({
      text: 'Pizzateig mit Hefe',
      cursor: 18,
    });
  });

  it('at the cursor with a space on either side, replacing a selection', () => {
    expect(insertAtCursor('Kuchen für 4', { start: 6, end: 6 }, 'mit Streuseln')).toEqual({
      text: 'Kuchen mit Streuseln für 4',
      cursor: 20,
    });
    expect(insertAtCursor('Kuchen XYZ', { start: 7, end: 10 }, 'mit Zimt')).toEqual({
      text: 'Kuchen mit Zimt',
      cursor: 15,
    });
  });

  it('without a known cursor at the end; nothing heard changes nothing', () => {
    expect(insertAtCursor('Kuchen', undefined, 'mit Zimt')).toEqual({
      text: 'Kuchen mit Zimt',
      cursor: 15,
    });
    expect(insertAtCursor('Kuchen', undefined, '  ')).toEqual({ text: 'Kuchen', cursor: 6 });
  });
});

describe('defaultImagePrompt (REQ-004)', () => {
  it('the title and, for a recipe, its first main ingredients', () => {
    expect(defaultImagePrompt('Apfelkuchen', ['Äpfel', 'Butter', 'Zucker', 'Mehl', 'Zimt'])).toBe(
      'Apfelkuchen mit Äpfel, Butter, Zucker',
    );
    expect(defaultImagePrompt('Kletterhalle', [])).toBe('Kletterhalle');
    expect(defaultImagePrompt('Apfelkuchen mit Streuseln', ['Butter', 'Äpfel'])).toBe(
      'Apfelkuchen mit Streuseln, Butter, Äpfel',
    );
  });
});

describe('mainIngredientNames', () => {
  it('base rows without Vorrat, in their order', () => {
    const recipe = makeRecipe({
      id: 'r',
      title: 'Curry',
      variants: [{ id: 'v', name: 'Vegan', isDefault: false }],
      ingredients: [
        { id: '1', articleId: 'art-salz', shoppingRule: 'skip' },
        { id: '2', articleId: 'art-mango', shoppingRule: 'count' },
        { id: '3', articleId: 'art-tofu', shoppingRule: 'count', variantId: 'v' },
        { id: '4', articleId: 'art-kokosmilch', shoppingRule: 'count' },
        { id: '5', articleId: 'gone', shoppingRule: 'count' },
      ],
    });
    expect(mainIngredientNames(recipe, articlesById)).toEqual(['Mango', 'Kokosmilch']);
  });
});

describe('messages', () => {
  it('AC-005: the AI is unreachable, the input stays', () => {
    expect(AI_DRAFT_UNREACHABLE_MESSAGE).toBe(
      'Die KI ist gerade nicht erreichbar. Deine Eingabe bleibt stehen.',
    );
  });

  it('AC-014: one or two variants failed', () => {
    expect(imageFailureNotice(0)).toBeUndefined();
    expect(imageFailureNotice(1)).toBe('Eine Variante ist fehlgeschlagen');
    expect(imageFailureNotice(2)).toBe('Zwei Varianten sind fehlgeschlagen');
  });
});

describe('isDictationStopWord: „Ende“ as its own utterance ends dictation (spec 0040, AC-018)', () => {
  it('AC-018: a segment that is only „Ende“ stops, whatever the case and punctuation', () => {
    for (const segment of ['Ende', 'Ende.', ' ende ', 'ENDE!', '„Ende“']) {
      expect(isDictationStopWord(segment)).toBe(true);
    }
  });

  it('AC-018: „Ende“ inside a sentence does not stop', () => {
    for (const segment of [
      'Am Ende des Tages will ich Pasta.',
      'Bis zum Ende backen.',
      'Ende Oktober',
      'Endlich',
      '',
    ]) {
      expect(isDictationStopWord(segment)).toBe(false);
    }
  });
});
