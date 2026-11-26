import { describe, expect, it } from 'vitest';

import { fillPageDraft, pageDraft, type PageDraft } from './page-editor';
import { proposalSummary, proposalSummaryText } from './proposal-diff';
import { newIngredientRow, type IngredientRow } from './recipe-editor';
import { applyRecipeProposal, recipeProposal } from './recipe-proposal';
import { articlesById, bolognese } from './test-fixtures';

// Spec 0049, REQ-005: the Änderungsansicht of a recipe. "Spaghetti Bolognese" has 4 portions and
// Hackfleisch, Spaghetti, Möhren; the proposal has 2 portions, no Möhren and Sellerie (AC-016).

let next = 0;
const newId = () => `new-${(next += 1)}`;

function row(name: string, amountText: string, articleId?: string): IngredientRow {
  return {
    ...newIngredientRow(newId()),
    name,
    amountText,
    article: articleId ? { kind: 'article', articleId } : { kind: 'new', name },
  };
}

const articleName = (ingredient: IngredientRow) =>
  ingredient.article?.kind === 'article'
    ? (articlesById[ingredient.article.articleId]?.name ?? '')
    : (ingredient.name ?? '');

function proposed(): { before: PageDraft; after: PageDraft } {
  const before = pageDraft(bolognese, []);
  const after = fillPageDraft(
    before,
    {
      title: 'Spaghetti Bolognese',
      servings: 2,
      ingredients: [
        row('Hackfleisch', '500 g', 'art-hack'),
        row('Spaghetti', '', 'art-spaghetti'),
        row('Sellerie', '1 Stange'),
      ],
      steps: ['Hack anbraten.'],
      links: [{ url: 'https://www.chefkoch.de/rezepte/393031127655461/Spaghetti-Bolognese.html' }],
    },
    newId,
    { replace: true },
  );
  return { before, after };
}

const rowsOf = (page: PageDraft) => page.ingredients.rows.map((entry) => articleName(entry));

describe('recipeProposal (REQ-005)', () => {
  it('AC-016: "1 neu · 1 geändert · 1 entfernt" for portions, Möhren and Sellerie', () => {
    const { before, after } = proposed();
    const proposal = recipeProposal(before, after, { articleName });
    const servings = proposal.fields.find((field) => field.id === 'servings');
    expect(servings).toMatchObject({ label: 'Portionen', before: '4', after: '2', status: 'changed' });
    const ingredients = proposal.groups.find((group) => group.id === 'ingredients');
    expect(ingredients?.rows.map((entry) => [entry.status, entry.label])).toEqual([
      ['same', '500 g Hackfleisch'],
      ['same', 'Spaghetti'],
      ['removed', '2 Möhren'],
      ['new', '1 Stange Sellerie'],
    ]);
    const counted = proposalSummary(
      { fields: proposal.fields, groups: proposal.groups.filter((g) => g.id === 'ingredients') },
      new Set(),
    );
    expect(proposalSummaryText(counted)).toBe('Vorschlag: 1 neu · 1 geändert · 1 entfernt');
  });

  it('counts the new step and the source link as "neu" too', () => {
    const { before, after } = proposed();
    const proposal = recipeProposal(before, after, { articleName });
    expect(proposalSummaryText(proposalSummary(proposal, new Set()))).toBe(
      'Vorschlag: 3 neu · 1 geändert · 1 entfernt',
    );
  });

  it('AC-017: ↺ at "Portionen" and "↺ behalten" at Möhren keep them; Sellerie comes', () => {
    const { before, after } = proposed();
    const proposal = recipeProposal(before, after, { articleName });
    const moehren = proposal.groups
      .flatMap((group) => group.rows)
      .find((entry) => entry.label === '2 Möhren');
    const applied = applyRecipeProposal(proposal, new Set(['servings', moehren?.id ?? '']));
    expect(applied.head.servings).toBe('4');
    expect(rowsOf(applied)).toEqual(['Hackfleisch', 'Spaghetti', 'Möhren', 'Sellerie']);
    // Rows that stay are the stored ones, so saving changes only what changed.
    expect(applied.ingredients.rows[0]?.ingredientId).toBe('b-hack');
  });

  it('AC-018: × at Sellerie leaves it out', () => {
    const { before, after } = proposed();
    const proposal = recipeProposal(before, after, { articleName });
    const sellerie = proposal.groups
      .flatMap((group) => group.rows)
      .find((entry) => entry.label === '1 Stange Sellerie');
    const applied = applyRecipeProposal(proposal, new Set([sellerie?.id ?? '']));
    expect(rowsOf(applied)).toEqual(['Hackfleisch', 'Spaghetti']);
    expect(applied.head.servings).toBe('2');
    expect(applied.steps?.steps.map((step) => step.text)).toEqual(['Hack anbraten.']);
    expect(applied.links.links).toHaveLength(1);
  });

  it('AC-019: taking everything back gives the recipe as it was', () => {
    const { before, after } = proposed();
    const proposal = recipeProposal(before, after, { articleName });
    const all = new Set([
      ...proposal.fields.map((field) => field.id),
      ...proposal.groups.flatMap((group) => group.rows.map((entry) => entry.id)),
    ]);
    expect(applyRecipeProposal(proposal, all)).toEqual(before);
  });

  it('another amount for the same article is "geändert" and keeps the stored row', () => {
    const before = pageDraft(bolognese, []);
    const after = fillPageDraft(
      before,
      {
        ingredients: [
          row('Hackfleisch', '400 g', 'art-hack'),
          row('Spaghetti', '', 'art-spaghetti'),
          row('Möhren', '2', 'art-moehren'),
        ],
      },
      newId,
      { replace: true },
    );
    const proposal = recipeProposal(before, after, { articleName });
    const hack = proposal.groups.find((group) => group.id === 'ingredients')?.rows.find((entry) => entry.label === '400 g Hackfleisch');
    expect(hack).toMatchObject({ status: 'changed', beforeLabel: '500 g Hackfleisch' });
    const applied = applyRecipeProposal(proposal, new Set());
    expect(applied.ingredients.rows[0]).toMatchObject({ ingredientId: 'b-hack', amountText: '400 g' });
  });

  it('"Ergänzen" removes nothing and shows the course as its name', () => {
    const before = pageDraft(bolognese, []);
    const after = fillPageDraft(
      before,
      { course: 'side', ingredients: [row('Parmesan', '50 g')] },
      newId,
    );
    const proposal = recipeProposal(before, after, { articleName });
    expect(proposal.fields).toEqual([
      expect.objectContaining({
        id: 'course',
        before: 'main',
        after: 'side',
        beforeLabel: 'Hauptgericht',
        afterLabel: 'Beilage',
      }),
    ]);
    expect(proposalSummary(proposal, new Set())).toEqual({ added: 1, changed: 1, removed: 0 });
    expect(applyRecipeProposal(proposal, new Set()).classification?.course).toBe('side');
  });
});
