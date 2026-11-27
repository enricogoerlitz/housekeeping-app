import { describe, expect, it } from 'vitest';

import { RecipeDraftRequestSchema, type RecipeDraft } from './ai-contract';
import { aiFillDefaults, promptWebQuery, recipeDraftOf } from './ai-fill';
import { fillPageDraft, pageDraft } from './page-editor';
import { draftToPageInput } from './recipe-draft';
import { recipeProposal } from './recipe-proposal';
import { articles, articlesById, makeRecipe } from './test-fixtures';
import type { IngredientRow } from './recipe-editor';

// Spec 0055: the defaults of "Mit KI ausfüllen", the web search of "Prompt" and the recipe of the
// edit mode in the draft format (`current`).

describe('aiFillDefaults (REQ-005)', () => {
  it('AC-014: editing a recipe with ingredients and a photo: "Prompt", no photo made', () => {
    expect(aiFillDefaults({ editing: true, hasContent: true, hasPhoto: true })).toEqual({
      tab: 'prompt',
      generatePhoto: false,
    });
  });

  it('AC-015: editing a recipe without a photo makes one', () => {
    expect(aiFillDefaults({ editing: true, hasContent: true, hasPhoto: false })).toEqual({
      tab: 'prompt',
      generatePhoto: true,
    });
  });

  it('AC-016: a recipe with only a title opens on "Websuche"', () => {
    expect(aiFillDefaults({ editing: true, hasContent: false, hasPhoto: true })).toEqual({
      tab: 'web',
      generatePhoto: false,
    });
  });

  it('AC-017: creating opens on "Websuche" and makes a photo', () => {
    expect(aiFillDefaults({ editing: false, hasContent: false, hasPhoto: false })).toEqual({
      tab: 'web',
      generatePhoto: true,
    });
  });
});

describe('promptWebQuery (REQ-007)', () => {
  it('AC-021: title and wish, in this order, spaces collapsed', () => {
    expect(promptWebQuery('Chili con Carne', '  füge eine   vegane Variante hinzu ')).toBe(
      'Chili con Carne füge eine vegane Variante hinzu',
    );
  });

  it('links in the wish are left out (they are read as links)', () => {
    expect(promptWebQuery('', 'so wie https://www.chefkoch.de/rezepte/1 aber vegan')).toBe(
      'so wie aber vegan',
    );
  });

  it('at most 200 characters, cut at a word', () => {
    const query = promptWebQuery('Kuchen', 'sehr '.repeat(60));
    expect(query?.length).toBeLessThanOrEqual(200);
    expect(query?.endsWith('sehr')).toBe(true);
  });

  it('nothing to search for: undefined', () => {
    expect(promptWebQuery(' ', ' ')).toBeUndefined();
  });
});

const chili = makeRecipe({
  id: 'rec-chili',
  title: 'Chili con Carne',
  description: '',
  servings: 4,
  totalMinutes: 60,
  course: 'main',
  cuisine: 'Mexikanisch',
  tags: ['scharf'],
  variants: [
    { id: 'var-rind', name: 'Mit Rind', isDefault: true },
    { id: 'var-veg', name: 'Vegetarisch', isDefault: false },
  ],
  ingredients: [
    {
      id: 'i-hack',
      articleId: 'art-hack',
      shoppingRule: 'count',
      amount: { text: '500 g', qty: 500, unit: 'g' },
      variantId: 'var-rind',
    },
    {
      id: 'i-tofu',
      articleId: 'art-tofu',
      shoppingRule: 'count',
      variantId: 'var-veg',
      prepNote: 'gewürfelt',
    },
    { id: 'i-salz', articleId: 'art-salz', shoppingRule: 'count' },
  ],
  steps: [
    { id: 's-1', text: 'Zwiebeln anbraten' },
    { id: 's-2', text: 'Hack krümelig braten', variantId: 'var-rind', timerMinutes: 8 },
  ],
  notes: 'Am nächsten Tag besser',
});

const articleName = (row: IngredientRow) =>
  row.article?.kind === 'article' ? (articlesById[row.article.articleId]?.name ?? '') : '';

describe('recipeDraftOf: the recipe of the edit mode in the draft format (REQ-006, AC-018)', () => {
  const current = recipeDraftOf(pageDraft(chili, []), articleName);

  it('AC-018: title, portions, Einordnung, variants by name, rows and steps come along', () => {
    expect(current).toMatchObject({
      title: 'Chili con Carne',
      description: '',
      servings: 4,
      totalMinutes: 60,
      course: 'main',
      cuisine: 'Mexikanisch',
      tags: [{ name: 'scharf', isNew: false }],
      variants: [{ name: 'Mit Rind' }, { name: 'Vegetarisch' }],
      steps: [
        { text: 'Zwiebeln anbraten' },
        { text: 'Hack krümelig braten', variant: 'Mit Rind', timerMinutes: 8 },
      ],
      notes: 'Am nächsten Tag besser',
    });
    expect(current.ingredients).toEqual([
      { name: 'Hackfleisch', amount: '500 g', variant: 'Mit Rind' },
      { name: 'Räuchertofu', amount: '', note: 'gewürfelt', variant: 'Vegetarisch' },
      { name: 'Salz', amount: '' },
    ]);
  });

  it('fits the contract of ai-recipe-draft', () => {
    expect(
      RecipeDraftRequestSchema.safeParse({
        householdId: 'aaaaaaaa-0000-4000-8000-000000000001',
        text: 'füge eine vegane Variante hinzu',
        current,
      }).success,
    ).toBe(true);
  });

  it('a row without a name is left out; numbers that are no numbers fall back', () => {
    const page = pageDraft(makeRecipe({ id: 'r', title: 'X' }), []);
    page.head = { ...page.head, servings: 'viele', totalMinutes: 'lang' };
    page.ingredients = {
      ...page.ingredients,
      rows: [
        {
          key: 'k',
          amountText: '1',
          shoppingRuleChosen: false,
          shoppingNote: '',
          prepNote: '',
          group: '',
        },
      ],
    };
    const made = recipeDraftOf(page, () => '');
    expect(made.servings).toBe(4);
    expect(made.totalMinutes).toBeUndefined();
    expect(made.ingredients).toEqual([]);
  });
});

describe('fillPageDraft "change" (REQ-006, AC-019): the whole recipe back, only the changes show', () => {
  const answer: RecipeDraft = {
    title: 'Chili con Carne',
    description: 'Würziges Chili.',
    servings: 4,
    totalMinutes: 60,
    course: 'main',
    cuisine: 'Mexikanisch',
    tags: [{ name: 'scharf', isNew: false }],
    variants: [{ name: 'Mit Rind' }, { name: 'Vegetarisch' }, { name: 'Vegan' }],
    ingredients: [
      { name: 'Hackfleisch', amount: '500 g', variant: 'Mit Rind' },
      { name: 'Räuchertofu', amount: '', note: 'gewürfelt', variant: 'Vegetarisch' },
      { name: 'Salz', amount: '' },
      {
        name: 'Kidneybohnen',
        amount: '1 Dose',
        variant: 'Vegan',
        area: 'Konserven',
        diet: 'vegan',
      },
    ],
    steps: [
      { text: 'Zwiebeln anbraten' },
      { text: 'Hack krümelig braten', variant: 'Mit Rind', timerMinutes: 8 },
      { text: 'Bohnen zugeben', variant: 'Vegan' },
    ],
    notes: 'Am nächsten Tag besser',
  };
  let seq = 0;
  const input = draftToPageInput(answer, [], {
    articles,
    catalog: [],
    newKey: () => `k${++seq}`,
    newId: () => `new-${++seq}`,
    tags: ['scharf'],
  });
  const before = pageDraft(chili, []);
  const after = fillPageDraft(before, input, () => `id-${++seq}`, { replace: true, change: true });
  const proposal = recipeProposal(before, after, {
    articleName: (row) => row.name ?? articleName(row),
  });
  const changed = proposal.groups.flatMap((group) =>
    group.rows
      .filter((row) => row.status !== 'same')
      .map((row) => `${group.id}:${row.status}:${row.label}`),
  );

  it('AC-019: the variants there are keep their ids', () => {
    expect(after.ingredients.variants.map((variant) => variant.id).slice(0, 2)).toEqual([
      'var-rind',
      'var-veg',
    ]);
  });

  it('AC-019: only the new variant, its row and its step are new; nothing else moves', () => {
    expect(changed).toEqual([
      'variants:new:Vegan',
      'ingredients:new:1 Dose Kidneybohnen',
      'steps:new:Bohnen zugeben',
    ]);
  });
});
