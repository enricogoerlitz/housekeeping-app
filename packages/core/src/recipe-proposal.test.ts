import { describe, expect, it } from 'vitest';

import { fillPageDraft, pageDraft, type PageDraft } from './page-editor';
import { proposalSummary, proposalSummaryText } from './proposal-diff';
import { newIngredientRow, type IngredientRow } from './recipe-editor';
import { applyRecipeProposal, proposesPagePhoto, recipeProposal } from './recipe-proposal';
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
      steps: [{ text: 'Hack anbraten.' }],
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
    expect(servings).toMatchObject({
      label: 'Portionen',
      before: '4',
      after: '2',
      status: 'changed',
    });
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
    const hack = proposal.groups
      .find((group) => group.id === 'ingredients')
      ?.rows.find((entry) => entry.label === '400 g Hackfleisch');
    expect(hack).toMatchObject({ status: 'changed', beforeLabel: '500 g Hackfleisch' });
    const applied = applyRecipeProposal(proposal, new Set());
    expect(applied.ingredients.rows[0]).toMatchObject({
      ingredientId: 'b-hack',
      amountText: '400 g',
    });
  });

  it('"Ergänzen" removes nothing and keeps the course (spec 0049, AC-046); "Ersetzen" shows it as its name', () => {
    const before = pageDraft(bolognese, []);
    const input = { course: 'side' as const, ingredients: [row('Parmesan', '50 g')] };
    const added = recipeProposal(before, fillPageDraft(before, input, newId), { articleName });
    expect(added.fields).toEqual([]);
    expect(proposalSummary(added, new Set())).toEqual({ added: 1, changed: 0, removed: 0 });
    const replaced = recipeProposal(
      before,
      fillPageDraft(before, input, newId, { replace: true }),
      {
        articleName,
      },
    );
    expect(replaced.fields).toEqual([
      expect.objectContaining({
        id: 'course',
        before: 'main',
        after: 'side',
        beforeLabel: 'Hauptgericht',
        afterLabel: 'Beilage',
      }),
    ]);
    expect(applyRecipeProposal(replaced, new Set()).classification?.course).toBe('side');
  });

  it('a new variant (spec 0045) is "neu"; × drops it with its rows and steps', () => {
    const before = pageDraft(bolognese, []);
    const after = fillPageDraft(
      before,
      {
        variants: [{ id: 'd-veg', name: 'Vegetarisch', isDefault: false }],
        ingredients: [{ ...row('Linsen', '200 g'), variantId: 'd-veg' }],
        steps: [{ text: 'Linsen kochen.', variantId: 'd-veg' }, { text: 'Abschmecken.' }],
        leadTime: { text: 'Linsen einweichen', hoursBefore: 12 },
      },
      newId,
    );
    const proposal = recipeProposal(before, after, { articleName });
    const variants = proposal.groups.find((group) => group.id === 'variants');
    expect(variants?.rows.map((entry) => [entry.status, entry.label])).toEqual([
      ['new', 'Vegetarisch'],
    ]);
    expect(proposal.fields.map((field) => field.label)).toEqual(['Vorlauf', 'Vorlauf (Stunden)']);
    const accepted = applyRecipeProposal(proposal, new Set());
    expect(
      accepted.ingredients.variants.map((variant) => [variant.name, variant.isDefault]),
    ).toEqual([['Vegetarisch', true]]);
    expect(accepted.steps?.leadTimeText).toBe('Linsen einweichen');
    const dropped = applyRecipeProposal(proposal, new Set([variants?.rows[0]?.id ?? '']));
    expect(dropped.ingredients.variants).toEqual([]);
    expect(rowsOf(dropped)).toEqual(['Hackfleisch', 'Spaghetti', 'Möhren']);
    expect(dropped.steps?.steps.map((step) => step.text)).toEqual(['Abschmecken.']);
  });
});

describe('recipeProposal: variants and groups (Nachklick 27.11., N-01)', () => {
  // „Füge eine vegetarische Variante hinzu“: the recipe as it was becomes „Original“, only the
  // rows the new variant replaces carry its name (ai-recipe-draft, „Ändern“).
  function withVariant() {
    const before = fillPageDraft(
      pageDraft(bolognese, []),
      { steps: [{ text: 'Hack anbraten.' }, { text: 'Abschmecken.' }] },
      newId,
    );
    const after = fillPageDraft(
      before,
      {
        variants: [
          { id: 'd-orig', name: 'Original', isDefault: true },
          { id: 'd-veg', name: 'Vegetarisch', isDefault: false },
        ],
        ingredients: [
          { ...row('Hackfleisch', '500 g', 'art-hack'), variantId: 'd-orig' },
          { ...row('Linsen', '200 g'), variantId: 'd-veg' },
          row('Spaghetti', '', 'art-spaghetti'),
          row('Möhren', '2', 'art-moehren'),
        ],
        steps: [
          { text: 'Hack anbraten.', variantId: 'd-orig' },
          { text: 'Linsen kochen.', variantId: 'd-veg' },
          { text: 'Abschmecken.' },
        ],
      },
      newId,
      { replace: true, change: true },
    );
    return { before, after, proposal: recipeProposal(before, after, { articleName }) };
  }
  const shown = (proposal: ReturnType<typeof recipeProposal>, id: string) =>
    proposal.groups
      .find((group) => group.id === id)
      ?.rows.map((entry) => [entry.status, entry.label, entry.section, entry.hint]);

  it('N-01: a row that moves into the new variant „Original“ is one changed row, not removed + new', () => {
    const { proposal } = withVariant();
    expect(shown(proposal, 'ingredients')).toEqual([
      ['same', 'Spaghetti', 'Alle Varianten', undefined],
      ['same', '2 Möhren', 'Alle Varianten', undefined],
      ['changed', '500 g Hackfleisch', 'Original', 'jetzt nur in „Original“'],
      ['new', '200 g Linsen', 'Vegetarisch', undefined],
    ]);
    expect(shown(proposal, 'steps')).toEqual([
      ['same', 'Abschmecken.', 'Alle Varianten', undefined],
      ['changed', 'Hack anbraten.', 'Original', 'jetzt nur in „Original“'],
      ['new', 'Linsen kochen.', 'Vegetarisch', undefined],
    ]);
    expect(proposalSummaryText(proposalSummary(proposal, new Set()))).toBe(
      'Vorschlag: 4 neu · 2 geändert',
    );
  });

  it('N-01: "Übernehmen" moves the stored row; ↺ keeps it for all variants', () => {
    const { proposal } = withVariant();
    const hack = proposal.groups
      .flatMap((group) => group.rows)
      .find((entry) => entry.label === '500 g Hackfleisch');
    const accepted = applyRecipeProposal(proposal, new Set());
    expect(
      accepted.ingredients.rows.find((entry) => entry.ingredientId === 'b-hack'),
    ).toMatchObject({ variantId: 'd-orig' });
    const kept = applyRecipeProposal(proposal, new Set([hack?.id ?? '']));
    expect(
      kept.ingredients.rows.find((entry) => entry.ingredientId === 'b-hack')?.variantId,
    ).toBeUndefined();
  });

  it('N-01: a row that only changes its group is "geändert" with the group named, and saved so', () => {
    const before = pageDraft(bolognese, []);
    const after = fillPageDraft(
      before,
      {
        ingredients: [
          { ...row('Hackfleisch', '500 g', 'art-hack'), group: 'Soße' },
          row('Spaghetti', '', 'art-spaghetti'),
          row('Möhren', '2', 'art-moehren'),
        ],
      },
      newId,
      { replace: true, change: true },
    );
    const proposal = recipeProposal(before, after, { articleName });
    expect(shown(proposal, 'ingredients')).toEqual([
      ['same', 'Spaghetti', undefined, undefined],
      ['same', '2 Möhren', undefined, undefined],
      ['changed', '500 g Hackfleisch', 'Soße', 'jetzt unter „Soße“'],
    ]);
    expect(applyRecipeProposal(proposal, new Set()).ingredients.rows[0]).toMatchObject({
      ingredientId: 'b-hack',
      group: 'Soße',
    });
  });
});

describe('proposesPagePhoto (spec 0049, AC-047)', () => {
  it('AC-047: "Ergänzen" offers the page photo only to a recipe without one; "Ersetzen" always', () => {
    expect(proposesPagePhoto({ hasPhoto: false, replace: false })).toBe(true);
    expect(proposesPagePhoto({ hasPhoto: true, replace: false })).toBe(false);
    expect(proposesPagePhoto({ hasPhoto: true, replace: true })).toBe(true);
  });
});
