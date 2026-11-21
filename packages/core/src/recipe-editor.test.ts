import { describe, expect, it } from 'vitest';

import { missingArticlesLabel } from './article-catalog';
import { ingredientDrafts, type DraftArticle } from './ingredient-drafts';
import {
  addIngredientRows,
  addStep,
  addTag,
  addVariant,
  chooseRowArticle,
  cleanTags,
  draftAfterRefusal,
  moveIngredient,
  moveIngredientAmong,
  moveStep,
  newIngredientRow,
  openRows,
  planEntriesAfterVariantRemoval,
  removeIngredient,
  removeStep,
  removeVariant,
  renameVariant,
  rowArticleName,
  rowsFromIngredientDrafts,
  savablePart,
  sectionDraft,
  sectionPatch,
  setDefaultVariant,
  setRowShoppingRule,
  tagValues,
  updateIngredientRow,
  updateStepText,
  validateSectionDraft,
  valueSuggestions,
  type IngredientsDraft,
  type RecipeSectionDraft,
  type SectionPatchContext,
} from './recipe-editor';
import { ingredientLine } from './recipes';
import { articles, articlesById, makeRecipe, mangoCurry } from './test-fixtures';
import type { Article, Id, MealPlanEntry, Recipe } from './types';

const zwiebeln: Article = {
  id: 'art-zwiebeln',
  name: 'Zwiebeln',
  synonyms: ['Zwiebel'],
  diet: 'vegan',
  isPantry: false,
  needsReview: false,
  createdAt: '',
};
const allArticles = [...articles, zwiebeln];
const allById: Record<Id, Article> = { ...articlesById, [zwiebeln.id]: zwiebeln };

const lasagne = makeRecipe({
  id: 'rec-lasagne',
  title: 'Lasagne',
  servings: 4,
  totalMinutes: 60,
  description: 'Klassisch',
  ingredients: [
    {
      id: 'l-hack',
      articleId: 'art-hack',
      amount: { text: '500 g', qty: 500, unit: 'g' },
      shoppingRule: 'recipeAmount',
    },
  ],
});

const hummus = makeRecipe({
  id: 'rec-hummus',
  title: 'Hummus',
  steps: [
    { id: 'st-1', text: 'Pürieren' },
    { id: 'st-2', text: 'Abschmecken' },
    { id: 'st-3', text: 'Kichererbsen kochen' },
  ],
});

/** A context whose new ids and created articles are numbered, so the patch is predictable. */
function context(entries: MealPlanEntry[] = []): SectionPatchContext & { created: DraftArticle[] } {
  let next = 0;
  const created: DraftArticle[] = [];
  return {
    articles: allArticles,
    entries,
    newId: () => `new-${++next}`,
    createArticle: (article) => {
      created.push(article);
      const name = article.kind === 'new' ? article.name : article.hit.name;
      return { ...zwiebeln, id: `art-created-${created.length}`, name, synonyms: [] };
    },
    created,
  };
}

function problems(draft: RecipeSectionDraft): string[] {
  return validateSectionDraft(draft).map((problem) => problem.message);
}

const long = (length: number) => 'x'.repeat(length);
let keys = 0;
const newKey = () => `k-${++keys}`;

describe('head section (REQ-007)', () => {
  it('AC-025: 6 servings and 45 minutes go out as numbers, ingredients untouched', () => {
    const draft = { ...sectionDraft(lasagne, 'head'), servings: '6', totalMinutes: '45' };
    expect(validateSectionDraft(draft)).toEqual([]);
    const patch = sectionPatch(lasagne, draft, context());
    expect(patch.recipe).toEqual({ servings: 6, totalMinutes: 45 });
    const saved: Recipe = { ...lasagne, ...patch.recipe };
    const [hack] = saved.ingredients;
    expect(hack && ingredientLine(hack, 'Hackfleisch')).toBe('500 g Hackfleisch');
  });

  it('AC-026: an empty title is "Titel fehlt" and nothing can be sent', () => {
    const draft = { ...sectionDraft(lasagne, 'head'), title: '   ' };
    expect(validateSectionDraft(draft)).toEqual([{ field: 'title', message: 'Titel fehlt' }]);
    expect(() => sectionPatch(lasagne, draft, context())).toThrow();
  });

  it('E8: limits of title, description, servings and minutes', () => {
    const head = sectionDraft(lasagne, 'head');
    expect(problems({ ...head, title: long(200) })).toEqual([]);
    expect(problems({ ...head, title: long(201) })).toEqual(['Höchstens 200 Zeichen']);
    expect(problems({ ...head, title: '🍝'.repeat(200) })).toEqual([]);
    expect(problems({ ...head, description: long(4001) })).toEqual(['Höchstens 4000 Zeichen']);
    for (const servings of ['0', '101', '2.5', '2,5', 'vier', '']) {
      expect(problems({ ...head, servings })).toEqual(['1 bis 100 Portionen']);
    }
    expect(problems({ ...head, servings: ' 100 ' })).toEqual([]);
    for (const totalMinutes of ['-1', '10001', '1,5', 'lang']) {
      expect(problems({ ...head, totalMinutes })).toEqual(['0 bis 10000 Minuten']);
    }
    expect(problems({ ...head, totalMinutes: '' })).toEqual([]);
    expect(problems({ ...head, totalMinutes: '0' })).toEqual([]);
  });

  it('E8: blank description and minutes clear the field', () => {
    const draft = { ...sectionDraft(lasagne, 'head'), description: '  ', totalMinutes: '' };
    expect(sectionPatch(lasagne, draft, context()).recipe).toEqual({
      description: undefined,
      totalMinutes: undefined,
    });
  });

  it('AC-029: only fields changed in the draft go out, a title changed meanwhile stays', () => {
    const draft = { ...sectionDraft(lasagne, 'head'), servings: '5' };
    const meanwhile = { ...lasagne, title: 'Lasagne al forno', description: 'Neu' };
    expect(sectionPatch(meanwhile, draft, context()).recipe).toEqual({ servings: 5 });
  });

  it('an untouched draft sends nothing; trimmed equal text is no change', () => {
    const draft = { ...sectionDraft(lasagne, 'head'), title: ' Lasagne ' };
    expect(sectionPatch(lasagne, draft, context()).recipe).toEqual({});
  });

  it('spec 0007 AC-004: the head patch carries the new title', () => {
    const draft = { ...sectionDraft(lasagne, 'head'), title: 'Lasagne Bolognese' };
    expect(sectionPatch(lasagne, draft, context()).recipe).toEqual({
      title: 'Lasagne Bolognese',
    });
  });
});

describe('classification section (REQ-007)', () => {
  const recipes = [
    makeRecipe({ id: 'a', title: 'A', cuisine: 'Italienisch', tags: ['Ofen', 'Familie'] }),
    makeRecipe({ id: 'b', title: 'B', cuisine: 'Italienisch', tags: ['Ofen'] }),
    makeRecipe({ id: 'shak', title: 'Shakshuka' }),
  ];

  it('AC-024: "italienisch" finds "Italienisch" without "neu anlegen"', () => {
    const result = valueSuggestions('italienisch', ['Italienisch']);
    expect(result.exact?.name).toBe('Italienisch');
    expect(result.canCreate).toBe(false);
  });

  it('AC-024: "Orientalisch" can be created; tags come from the household', () => {
    expect(valueSuggestions('Orientalisch', ['Italienisch']).canCreate).toBe(true);
    expect(tagValues(recipes)).toEqual(['Ofen', 'Familie']);
    expect(valueSuggestions('Of', tagValues(recipes)).matches.map((m) => m.item.name)).toEqual([
      'Ofen',
    ]);
  });

  it('AC-024: cuisine and tag are saved; nothing else of the recipe', () => {
    const shakshuka = recipes[2] as Recipe;
    const base = sectionDraft(shakshuka, 'classification');
    const draft = { ...base, cuisine: 'Orientalisch', tags: addTag(base.tags, 'Ofen') };
    expect(sectionPatch(shakshuka, draft, context()).recipe).toEqual({
      cuisine: 'Orientalisch',
      tags: ['Ofen'],
    });
  });

  it('E8: tags are trimmed and duplicates merged after normalising', () => {
    expect(cleanTags([' Ofen ', 'ofen', 'Familie', '  ', 'Öl', 'oel'])).toEqual([
      'Ofen',
      'Familie',
      'Öl',
    ]);
    expect(addTag(['Ofen'], ' OFEN ')).toEqual(['Ofen']);
    expect(addTag(['Ofen'], 'Familie')).toEqual(['Ofen', 'Familie']);
  });

  it('E8: at most 80 characters of cuisine, 30 tags and 1000 characters of tags', () => {
    const base = sectionDraft(recipes[0] as Recipe, 'classification');
    expect(problems({ ...base, cuisine: long(80) })).toEqual([]);
    expect(problems({ ...base, cuisine: long(81) })).toEqual(['Höchstens 80 Zeichen']);
    const thirty = Array.from({ length: 30 }, (_, index) => `t${index}`);
    expect(problems({ ...base, tags: thirty })).toEqual([]);
    expect(problems({ ...base, tags: [...thirty, 'zu viel'] })).toEqual([
      'Höchstens 30 Schlagworte',
    ]);
    expect(problems({ ...base, tags: [long(500), long(500).replace(/x/g, 'y')] })).toEqual([]);
    expect(problems({ ...base, tags: [long(500), `${long(500)}y`.replace(/x/g, 'z')] })).toEqual([
      'Höchstens 1000 Zeichen in allen Schlagworten',
    ]);
  });

  it('a blank cuisine clears it', () => {
    const draft = { ...sectionDraft(recipes[0] as Recipe, 'classification'), cuisine: ' ' };
    expect(sectionPatch(recipes[0] as Recipe, draft, context()).recipe).toEqual({
      cuisine: undefined,
    });
  });
});

describe('steps section (REQ-007)', () => {
  it('AC-027: move step 3 first, add a step and a Vorlauf of 12 hours', () => {
    let draft = sectionDraft(hummus, 'steps');
    draft = moveStep(draft, 'st-3', 0);
    draft = addStep(draft, ' Mit Olivenöl servieren ', 'st-4');
    draft = { ...draft, leadTimeText: 'Kichererbsen einweichen', leadTimeHours: '12' };
    expect(validateSectionDraft(draft)).toEqual([]);
    const patch = sectionPatch(hummus, draft, context());
    expect(patch.recipe.steps?.map((step) => step.text)).toEqual([
      'Kichererbsen kochen',
      'Pürieren',
      'Abschmecken',
      'Mit Olivenöl servieren',
    ]);
    expect(patch.recipe.leadTime).toEqual({ text: 'Kichererbsen einweichen', hoursBefore: 12 });
  });

  it('AC-027: text change, removing, moving down and past the end', () => {
    let draft = sectionDraft(hummus, 'steps');
    draft = updateStepText(draft, 'st-2', 'Mit Salz abschmecken');
    draft = removeStep(draft, 'st-1');
    draft = moveStep(draft, 'st-2', 5);
    expect(draft.steps.map((step) => step.text)).toEqual([
      'Kichererbsen kochen',
      'Mit Salz abschmecken',
    ]);
    expect(moveStep(draft, 'missing', 0)).toBe(draft);
  });

  it('E8: blank steps are left out, a step has at most 1000 characters, 100 steps', () => {
    const base = sectionDraft(hummus, 'steps');
    const blank = addStep(base, '', 'st-blank');
    expect(validateSectionDraft(blank)).toEqual([]);
    expect(sectionPatch(hummus, blank, context()).recipe).toEqual({});
    expect(validateSectionDraft(updateStepText(base, 'st-1', long(1001)))).toEqual([
      { field: 'step', key: 'st-1', message: 'Höchstens 1000 Zeichen' },
    ]);
    let many = base;
    for (let index = 0; index < 98; index++) many = addStep(many, `S${index}`, `s${index}`);
    expect(problems(many)).toEqual(['Höchstens 100 Schritte']);
  });

  it('E8: Vorlauf text 1–200 characters and 1–168 whole hours; blank text removes it', () => {
    const withLead = makeRecipe({
      id: 'lead',
      title: 'Lead',
      leadTime: { text: 'Einweichen', hoursBefore: 8 },
    });
    const base = sectionDraft(withLead, 'steps');
    expect(base.leadTimeText).toBe('Einweichen');
    expect(base.leadTimeHours).toBe('8');
    for (const hours of ['0', '169', '1,5', '']) {
      expect(problems({ ...base, leadTimeHours: hours })).toEqual(['1 bis 168 Stunden']);
    }
    expect(problems({ ...base, leadTimeText: long(201) })).toEqual(['Höchstens 200 Zeichen']);
    const removed = { ...base, leadTimeText: ' ', leadTimeHours: 'egal' };
    expect(validateSectionDraft(removed)).toEqual([]);
    expect(sectionPatch(withLead, removed, context()).recipe).toEqual({ leadTime: undefined });
  });
});

describe('notes section (REQ-007)', () => {
  it('AC-023: the note is saved alone', () => {
    const draft = { ...sectionDraft(lasagne, 'notes'), notes: 'Mit doppelt Béchamel noch besser.' };
    expect(sectionPatch(lasagne, draft, context()).recipe).toEqual({
      notes: 'Mit doppelt Béchamel noch besser.',
    });
  });

  it('AC-029: Nadja changes the title meanwhile, Enrico sends only the notes', () => {
    const draft = { ...sectionDraft(lasagne, 'notes'), notes: 'Mehr Käse' };
    const meanwhile = { ...lasagne, title: 'Lasagne al forno' };
    const patch = sectionPatch(meanwhile, draft, context());
    expect(patch.recipe).toEqual({ notes: 'Mehr Käse' });
    expect({ ...meanwhile, ...patch.recipe }.title).toBe('Lasagne al forno');
  });

  it('E8: at most 4000 characters; blank clears', () => {
    const base = sectionDraft({ ...lasagne, notes: 'Alt' }, 'notes');
    expect(problems({ ...base, notes: long(4001) })).toEqual(['Höchstens 4000 Zeichen']);
    expect(
      sectionPatch({ ...lasagne, notes: 'Alt' }, { ...base, notes: '' }, context()).recipe,
    ).toEqual({
      notes: undefined,
    });
  });
});

describe('ingredients section (REQ-008)', () => {
  const linsenDal = makeRecipe({
    id: 'rec-dal',
    title: 'Linsen-Dal',
    ingredients: [
      {
        id: 'd-zwiebeln',
        articleId: 'art-zwiebeln',
        amount: { text: '2', qty: 2 },
        shoppingRule: 'count',
      },
    ],
  });

  it('AC-028: the stored ingredients become rows with their article', () => {
    const draft = sectionDraft(linsenDal, 'ingredients');
    expect(draft.rows).toEqual([
      {
        key: 'd-zwiebeln',
        ingredientId: 'd-zwiebeln',
        amountText: '2',
        article: { kind: 'article', articleId: 'art-zwiebeln' },
        shoppingRule: 'count',
        shoppingRuleChosen: false,
        shoppingNote: '',
        prepNote: '',
        group: '',
      },
    ]);
    expect(sectionPatch(linsenDal, draft, context()).recipe).toEqual({});
  });

  it('AC-030: "+ Zutat" with "400 ml" and the article Kokosmilch', () => {
    let draft = sectionDraft(linsenDal, 'ingredients');
    draft = addIngredientRows(draft, [newIngredientRow('row-1')]);
    draft = updateIngredientRow(draft, 'row-1', { amountText: '400 ml' });
    const kokosmilch = articlesById['art-kokosmilch'] as Article;
    draft = chooseRowArticle(draft, 'row-1', {
      kind: 'hit',
      hit: {
        kind: 'article',
        id: kokosmilch.id,
        name: kokosmilch.name,
        synonyms: [],
        article: kokosmilch,
      },
    });
    expect(draft.rows.map((row) => rowArticleName(row, allById))).toEqual([
      'Zwiebeln',
      'Kokosmilch',
    ]);
    const patch = sectionPatch(linsenDal, draft, context());
    const added = patch.recipe.ingredients?.[1];
    expect(added).toEqual({
      id: 'new-1',
      articleId: 'art-kokosmilch',
      amount: { text: '400 ml', qty: 400, unit: 'ml' },
      shoppingRule: 'recipeAmount',
    });
    expect(added && ingredientLine(added, 'Kokosmilch', 2)).toBe('800 ml Kokosmilch');
    expect(patch.open).toEqual([]);
  });

  it('AC-031: Zusatz and Hinweis of a row; a chosen rule is remembered for the article', () => {
    let draft = sectionDraft(linsenDal, 'ingredients');
    draft = updateIngredientRow(draft, 'd-zwiebeln', {
      shoppingNote: ' rot ',
      prepNote: 'fein gehackt',
    });
    let patch = sectionPatch(linsenDal, draft, context());
    expect(patch.recipe.ingredients).toEqual([
      {
        id: 'd-zwiebeln',
        articleId: 'art-zwiebeln',
        amount: { text: '2', qty: 2 },
        shoppingRule: 'count',
        shoppingNote: 'rot',
        prepNote: 'fein gehackt',
      },
    ]);
    expect(patch.rules).toEqual([]);
    const [zwiebel] = patch.recipe.ingredients ?? [];
    expect(zwiebel && ingredientLine(zwiebel, 'Zwiebeln')).toBe('2 Zwiebeln · fein gehackt');

    patch = sectionPatch(linsenDal, setRowShoppingRule(draft, 'd-zwiebeln', 'skip'), context());
    expect(patch.rules).toEqual([{ articleId: 'art-zwiebeln', rule: 'skip' }]);
    expect(patch.recipe.ingredients?.[0]?.shoppingRule).toBe('skip');
  });

  it('AC-032: pasted lines with an article are saved, the orange line stays open', () => {
    const drafts = ingredientDrafts(
      '200 ml Kokosmilch\n1 Mango\n1 TL Bockshornklee',
      allArticles,
      [],
      newKey,
    );
    let draft = addIngredientRows(
      sectionDraft(linsenDal, 'ingredients'),
      rowsFromIngredientDrafts(drafts),
    );
    expect(openRows(draft, allArticles).map((row) => row.amountText)).toEqual(['1 TL']);
    expect(missingArticlesLabel(openRows(draft, allArticles).length)).toBe(
      '1 Zutat braucht noch einen Artikel',
    );
    expect(validateSectionDraft(draft)).toEqual([]);

    const first = sectionPatch(linsenDal, draft, context());
    expect(first.recipe.ingredients?.map((ingredient) => ingredient.articleId)).toEqual([
      'art-zwiebeln',
      'art-kokosmilch',
      'art-mango',
    ]);
    expect(first.open.map((row) => rowArticleName(row, allById))).toEqual(['Bockshornklee']);

    const saved = { ...linsenDal, ...first.recipe };
    draft = addIngredientRows(sectionDraft(saved, 'ingredients'), first.open);
    const openKey = first.open[0]?.key ?? '';
    draft = chooseRowArticle(draft, openKey, { kind: 'new', name: 'Bockshornklee' });
    const ctx = context();
    const second = sectionPatch(saved, draft, ctx);
    expect(ctx.created).toEqual([{ kind: 'new', name: 'Bockshornklee' }]);
    expect(second.open).toEqual([]);
    expect(second.recipe.ingredients?.map((ingredient) => ingredient.articleId)).toEqual([
      'art-zwiebeln',
      'art-kokosmilch',
      'art-mango',
      'art-created-1',
    ]);
  });

  it('spec 0007 AC-004: head saved with a new title; ingredients without the orange line', () => {
    const head = { ...sectionDraft(linsenDal, 'head'), title: 'Dal' };
    const afterHead = { ...linsenDal, ...sectionPatch(linsenDal, head, context()).recipe };
    const orange = { ...newIngredientRow('orange'), amountText: '1 TL' };
    const draft = addIngredientRows(sectionDraft(afterHead, 'ingredients'), [orange]);
    const patch = sectionPatch(afterHead, draft, context());
    expect(patch.recipe).toEqual({});
    expect(patch.open.map((row) => row.key)).toEqual(['orange']);
    expect({ ...afterHead, ...patch.recipe }.title).toBe('Dal');
  });

  it('a row whose article was deleted meanwhile is open again, without article', () => {
    const draft = sectionDraft(
      { ...linsenDal, ingredients: [{ id: 'gone', articleId: 'art-gone', shoppingRule: 'count' }] },
      'ingredients',
    );
    expect(openRows(draft, allArticles).map((row) => [row.key, row.article])).toEqual([
      ['gone', undefined],
    ]);
  });

  it('a starter hit is created on saving, with the rule its article suggests', () => {
    let draft = addIngredientRows(sectionDraft(linsenDal, 'ingredients'), [newIngredientRow('s')]);
    draft = updateIngredientRow(draft, 's', { amountText: '1 Bund' });
    draft = chooseRowArticle(draft, 's', {
      kind: 'hit',
      hit: {
        kind: 'starter',
        id: 'starter:koriander',
        name: 'Koriander',
        synonyms: [],
        entry: { name: 'Koriander', diet: 'vegan' },
      },
    });
    const ctx = context();
    const patch = sectionPatch(linsenDal, draft, ctx);
    expect(ctx.created).toHaveLength(1);
    expect(patch.recipe.ingredients?.[1]).toMatchObject({
      articleId: 'art-created-1',
      shoppingRule: 'recipeAmount',
    });
  });

  it('"Nach oben", "Nach unten" and "Entfernen" change only the draft', () => {
    let draft = sectionDraft(mangoCurry, 'ingredients');
    draft = moveIngredient(draft, 'i-mango', 0);
    draft = removeIngredient(draft, 'i-salz');
    expect(draft.rows.slice(0, 3).map((row) => row.key)).toEqual(['i-mango', 'i-kokos', 'i-reis']);
    expect(draft.rows.some((row) => row.key === 'i-salz')).toBe(false);
    const patch = sectionPatch(mangoCurry, draft, context());
    expect(patch.recipe.ingredients?.map((ingredient) => ingredient.id).slice(0, 2)).toEqual([
      'i-mango',
      'i-kokos',
    ]);
    expect(patch.recipe.variants).toBeUndefined();
  });

  it('E8: Hinweis at most 200 characters, at most 300 ingredients', () => {
    const draft = sectionDraft(linsenDal, 'ingredients');
    expect(
      validateSectionDraft(updateIngredientRow(draft, 'd-zwiebeln', { prepNote: long(201) })),
    ).toEqual([{ field: 'ingredient', key: 'd-zwiebeln', message: 'Höchstens 200 Zeichen' }]);
    const many = addIngredientRows(
      draft,
      Array.from({ length: 300 }, (_, index) => newIngredientRow(`r${index}`)),
    );
    expect(problems(many)).toEqual(['Höchstens 300 Zutaten']);
  });

  it('E8: ingredients as JSON at most 200 000 bytes', () => {
    const rows = Array.from({ length: 290 }, (_, index) => ({
      ...newIngredientRow(`r${index}`),
      article: { kind: 'article' as const, articleId: 'art-salz' },
      prepNote: 'ü'.repeat(200),
      shoppingNote: 'ü'.repeat(200),
    }));
    const draft = addIngredientRows(sectionDraft(linsenDal, 'ingredients'), rows);
    expect(problems(draft)).toEqual(['Zu viel Text – bitte kürzen']);
  });
});

describe('variants (REQ-008, E10)', () => {
  // Lachs stands in for Garnelen: an existing article keeps the second save free of creation.
  const lachs = articlesById['art-lachs'] as Article;
  const garnelenRow = (draft: IngredientsDraft) =>
    chooseRowArticle(
      updateIngredientRow(addIngredientRows(draft, [newIngredientRow('g')]), 'g', {
        amountText: '300 g',
        variantId: 'v-garnelen',
      }),
      'g',
      {
        kind: 'hit',
        hit: { kind: 'article', id: lachs.id, name: lachs.name, synonyms: [], article: lachs },
      },
    );

  it('AC-033: add "mit Garnelen" with its ingredient and make it the default', () => {
    let draft = sectionDraft(mangoCurry, 'ingredients');
    draft = addVariant(draft, ' mit Garnelen ', 'v-garnelen');
    draft = garnelenRow(draft);
    draft = setDefaultVariant(draft, 'v-garnelen');
    expect(validateSectionDraft(draft)).toEqual([]);
    const patch = sectionPatch(mangoCurry, draft, context());
    expect(patch.recipe.variants).toEqual([
      { id: 'v-tofu', name: 'mit Tofu', isDefault: false },
      { id: 'v-haehnchen', name: 'mit Hähnchen', isDefault: false },
      { id: 'v-garnelen', name: 'mit Garnelen', isDefault: true },
    ]);
    expect(patch.recipe.ingredients?.at(-1)).toMatchObject({
      variantId: 'v-garnelen',
      amount: { text: '300 g', qty: 300, unit: 'g' },
    });
    expect(patch.entries).toEqual([]);
  });

  it('AC-033: removing "mit Hähnchen" takes its ingredient, step and portions', () => {
    let start = sectionDraft(mangoCurry, 'ingredients');
    start = setDefaultVariant(
      garnelenRow(addVariant(start, 'mit Garnelen', 'v-garnelen')),
      'v-garnelen',
    );
    const withGarnelen: Recipe = {
      ...mangoCurry,
      ...sectionPatch(mangoCurry, start, context()).recipe,
    };

    const entries: MealPlanEntry[] = [
      planned('e-merge', withGarnelen.id, [
        { variantId: 'v-haehnchen', portions: 1 },
        { variantId: 'v-garnelen', portions: 1 },
      ]),
      planned('e-split', withGarnelen.id, [
        { variantId: 'v-haehnchen', portions: 1 },
        { variantId: 'v-tofu', portions: 1 },
      ]),
      planned('e-tofu', withGarnelen.id, [{ variantId: 'v-tofu', portions: 2 }]),
      planned('e-other', 'rec-other', [{ variantId: 'v-haehnchen', portions: 2 }]),
    ];
    const draft = removeVariant(sectionDraft(withGarnelen, 'ingredients'), 'v-haehnchen');
    expect(draft.rows.some((row) => row.key === 'i-haehnchen')).toBe(false);
    const patch = sectionPatch(withGarnelen, draft, context(entries));
    expect(patch.recipe.variants?.map((variant) => variant.name)).toEqual([
      'mit Tofu',
      'mit Garnelen',
    ]);
    expect(patch.recipe.ingredients?.some((ingredient) => ingredient.id === 'i-haehnchen')).toBe(
      false,
    );
    expect(patch.recipe.steps?.map((step) => step.id)).toEqual(['s-1', 's-tofu', 's-2']);
    expect(patch.entries.map((entry) => [entry.id, entry.variants])).toEqual([
      ['e-merge', [{ variantId: 'v-garnelen', portions: 2 }]],
      [
        'e-split',
        [
          { variantId: 'v-tofu', portions: 1 },
          { variantId: 'v-garnelen', portions: 1 },
        ],
      ],
    ]);
  });

  it('E10: steps changed meanwhile on another device stay; only the variant steps go', () => {
    const draft = removeVariant(sectionDraft(mangoCurry, 'ingredients'), 'v-haehnchen');
    const meanwhile = {
      ...mangoCurry,
      steps: [...mangoCurry.steps, { id: 's-new', text: 'Servieren.' }],
    };
    expect(sectionPatch(meanwhile, draft, context()).recipe.steps?.map((step) => step.id)).toEqual([
      's-1',
      's-tofu',
      's-2',
      's-new',
    ]);
  });

  it('E10: removing the default makes the first remaining variant the default', () => {
    const draft = removeVariant(sectionDraft(mangoCurry, 'ingredients'), 'v-tofu');
    expect(draft.variants).toEqual([{ id: 'v-haehnchen', name: 'mit Hähnchen', isDefault: true }]);
  });

  it('E10: without any variant left the split is empty and the portions stay', () => {
    const entry = planned('e', mangoCurry.id, [
      { variantId: 'v-tofu', portions: 1 },
      { variantId: 'v-haehnchen', portions: 2 },
    ]);
    expect(
      planEntriesAfterVariantRemoval([entry], mangoCurry.id, ['v-tofu', 'v-haehnchen'], []),
    ).toEqual([{ ...entry, variants: [] }]);
    let draft = removeVariant(sectionDraft(mangoCurry, 'ingredients'), 'v-tofu');
    draft = removeVariant(draft, 'v-haehnchen');
    const patch = sectionPatch(mangoCurry, draft, context([entry]));
    expect(patch.recipe.variants).toEqual([]);
    expect(patch.entries).toEqual([{ ...entry, variants: [], portions: 3 }]);
  });

  it('rename, and a removed new variant leaves no trace', () => {
    let draft = sectionDraft(mangoCurry, 'ingredients');
    draft = renameVariant(draft, 'v-tofu', 'mit Räuchertofu');
    draft = addVariant(draft, 'mit Garnelen', 'v-garnelen');
    draft = removeVariant(garnelenRow(draft), 'v-garnelen');
    const patch = sectionPatch(mangoCurry, draft, context());
    expect(patch.recipe.variants?.map((variant) => variant.name)).toEqual([
      'mit Räuchertofu',
      'mit Hähnchen',
    ]);
    expect(patch.recipe.ingredients).toBeUndefined();
    expect(patch.recipe.steps).toBeUndefined();
  });

  it('the first variant of a recipe without variants is its default', () => {
    const draft = addVariant(sectionDraft(lasagne, 'ingredients'), 'vegetarisch', 'v-veg');
    expect(draft.variants).toEqual([{ id: 'v-veg', name: 'vegetarisch', isDefault: true }]);
  });

  it('E8: variant names 1–60 characters, unique after normalising, at most 20 variants', () => {
    const draft = sectionDraft(mangoCurry, 'ingredients');
    expect(validateSectionDraft(renameVariant(draft, 'v-tofu', ' '))).toEqual([
      { field: 'variant', key: 'v-tofu', message: 'Name fehlt' },
    ]);
    expect(problems(renameVariant(draft, 'v-tofu', long(61)))).toEqual(['Höchstens 60 Zeichen']);
    expect(validateSectionDraft(renameVariant(draft, 'v-tofu', 'MIT  hähnchen'))).toEqual([
      { field: 'variant', key: 'v-tofu', message: 'Gibt es schon' },
    ]);
    let many = draft;
    for (let index = 0; index < 19; index++) many = addVariant(many, `V${index}`, `v${index}`);
    expect(problems(many)).toEqual(['Höchstens 20 Varianten']);
  });
});

describe('saving the valid part when switching (E7)', () => {
  it('AC-032/E7: an empty title keeps the old one, the other head fields are saved', () => {
    const draft = { ...sectionDraft(lasagne, 'head'), title: '', servings: '6' };
    const part = savablePart(draft);
    expect(validateSectionDraft(part)).toEqual([]);
    expect(sectionPatch(lasagne, part, context()).recipe).toEqual({ servings: 6 });
  });

  it('AC-032: orange rows drop out, the rest is saved', () => {
    const orange = newIngredientRow('orange');
    const draft = addIngredientRows(sectionDraft(mangoCurry, 'ingredients'), [orange]);
    const part = savablePart(draft);
    if (part.section !== 'ingredients') throw new Error('section changed');
    expect(part.rows.some((row) => row.key === 'orange')).toBe(false);
    expect(sectionPatch(mangoCurry, part, context()).open).toEqual([]);
  });

  it('E7: an invalid field goes back to its stored value, valid fields stay', () => {
    const steps = {
      ...updateStepText(sectionDraft(hummus, 'steps'), 'st-1', long(1001)),
      leadTimeText: 'Einweichen',
      leadTimeHours: '12',
    };
    expect(sectionPatch(hummus, savablePart(steps), context()).recipe).toEqual({
      leadTime: { text: 'Einweichen', hoursBefore: 12 },
    });
    const variants = renameVariant(sectionDraft(mangoCurry, 'ingredients'), 'v-tofu', '');
    expect(sectionPatch(mangoCurry, savablePart(variants), context()).recipe).toEqual({});
    const valid = { ...sectionDraft(lasagne, 'notes'), notes: 'Neu' };
    expect(savablePart(valid)).toEqual(valid);
  });
});

function planned(id: Id, recipeId: Id, variants: MealPlanEntry['variants']): MealPlanEntry {
  return {
    id,
    date: '2026-11-21',
    slotId: 'slot-abend',
    kind: 'recipe',
    recipeId,
    eaterIds: [],
    guests: 0,
    portions: variants.reduce((sum, row) => sum + row.portions, 0),
    variants,
    sort: 0,
  };
}

describe('the page around the sections (T7)', () => {
  it('Platforms: moving among the rows with an article keeps the orange rows in place', () => {
    const orange = { ...newIngredientRow('orange'), name: 'Bockshornklee' };
    // i-kokos, i-mango, orange, i-reis, … — the list shows every row but the orange one.
    let draft = sectionDraft(mangoCurry, 'ingredients');
    draft = { ...draft, rows: [...draft.rows.slice(0, 2), orange, ...draft.rows.slice(2)] };
    const shown = draft.rows.filter((row) => row.article !== undefined).map((row) => row.key);

    const down = moveIngredientAmong(draft, 'i-mango', 2, shown);
    expect(down.rows.slice(0, 4).map((row) => row.key)).toEqual([
      'i-kokos',
      'orange',
      'i-reis',
      'i-mango',
    ]);
    const up = moveIngredientAmong(draft, 'i-reis', 0, shown);
    expect(up.rows.slice(0, 4).map((row) => row.key)).toEqual([
      'i-reis',
      'i-kokos',
      'i-mango',
      'orange',
    ]);
    expect(moveIngredientAmong(draft, 'i-reis', 2, shown)).toBe(draft);
    expect(moveIngredientAmong(draft, 'unknown', 0, shown)).toBe(draft);
  });

  it('E7: a refused section opens again with its draft when nothing else is open', () => {
    const refused = { ...sectionDraft(lasagne, 'notes'), notes: 'Neu' };
    expect(draftAfterRefusal(undefined, refused, undefined)).toBe(refused);
  });

  it('E7, AC-032: the section left open with its orange rows gets the refused draft back', () => {
    const refused = addIngredientRows(sectionDraft(mangoCurry, 'ingredients'), [
      { ...newIngredientRow('orange'), name: 'Bockshornklee' },
    ]);
    const reopened = addIngredientRows(sectionDraft(mangoCurry, 'ingredients'), [
      { ...newIngredientRow('orange'), name: 'Bockshornklee' },
    ]);
    expect(draftAfterRefusal(reopened, refused, reopened)).toBe(refused);
  });

  it('E7: a section opened or changed since then stays as it is', () => {
    const refused = { ...sectionDraft(lasagne, 'notes'), notes: 'Neu' };
    const other = sectionDraft(lasagne, 'head');
    expect(draftAfterRefusal(other, refused, undefined)).toBe(other);
    const reopened = sectionDraft(mangoCurry, 'ingredients');
    const edited = removeIngredient(reopened, 'i-salz');
    expect(draftAfterRefusal(edited, refused, reopened)).toBe(edited);
  });
});
