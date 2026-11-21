import { describe, expect, it, vi } from 'vitest';

import {
  articleDraftFromStarter,
  articleFilterCounts,
  applyArticleMerge,
  articleUsage,
  classifyIngredientLines,
  cleanSynonyms,
  defaultShoppingRuleFor,
  filterArticles,
  mergeArticlesPreview,
  mergeTargets,
  missingArticlesLabel,
  resolveIngredientArticle,
  resolveIngredientArticles,
  searchArticleCatalog,
  searchArticleList,
  similarArticleNames,
  sortArticles,
  validateArticleDraft,
  type StarterCatalogEntry,
} from './article-catalog';
import { editDistance } from './text';
import type { Area, Article, Id, Recipe, RecipeIngredient, ShoppingItem } from './types';

// Counts the expensive comparisons of similarArticleNames without changing what they return.
vi.mock('./text', async (importOriginal) => {
  const original = await importOriginal<typeof import('./text')>();
  return { ...original, editDistance: vi.fn(original.editDistance) };
});

function article(id: Id, name: string, rest: Partial<Article> = {}): Article {
  return {
    id,
    name,
    synonyms: [],
    diet: 'unknown',
    isPantry: false,
    needsReview: false,
    createdAt: '',
    ...rest,
  };
}

const areas: Area[] = [
  { id: 'area-obst', name: 'Obst & Gemüse', sort: 0 },
  { id: 'area-konserven', name: 'Konserven & Saucen', sort: 1 },
  { id: 'area-nudeln', name: 'Nudeln, Reis & Hülsenfrüchte', sort: 2 },
];

const kokosmilch = article('a-kokosmilch', 'Kokosmilch', {
  areaId: 'area-konserven',
  diet: 'vegan',
});
const kokosmilchLight = article('a-kokosmilch-light', 'Kokosmilch light', {
  areaId: 'area-konserven',
  diet: 'vegan',
});
const moehren = article('a-moehren', 'Möhren', {
  synonyms: ['Karotten'],
  areaId: 'area-obst',
  diet: 'vegan',
});
const mango = article('a-mango', 'Mango', { areaId: 'area-obst', diet: 'vegan' });
const salz = article('a-salz', 'Salz', { diet: 'vegan', isPantry: true });
const tomaten = article('a-tomaten', 'Tomaten', { areaId: 'area-obst', diet: 'vegan' });

const household: Article[] = [kokosmilch, kokosmilchLight, moehren, mango, salz, tomaten];

const starter: StarterCatalogEntry[] = [
  {
    name: 'Kichererbsen',
    synonyms: ['Kichererbse'],
    areaName: 'Nudeln, Reis & Hülsenfrüchte',
    diet: 'vegan',
    isPantry: true,
  },
  { name: 'Möhren', synonyms: ['Karotten', 'Mohrrüben'], areaName: 'Obst & Gemüse', diet: 'vegan' },
  { name: 'Ingwersirup', areaName: 'Getränke', diet: 'vegan' },
  { name: 'Mehl', synonyms: ['Weizenmehl'], areaName: 'Backen', diet: 'vegan', isPantry: true },
];

function ingredient(id: Id, articleId: Id, rest: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return { id, articleId, shoppingRule: 'count', ...rest };
}

function recipe(id: Id, title: string, ingredients: RecipeIngredient[]): Recipe {
  return {
    id,
    kind: 'recipe',
    title,
    servings: 4,
    course: 'main',
    tags: [],
    variants: [],
    ingredients,
    steps: [],
    favoriteOf: [],
    ratings: {},
    cookedCount: 0,
    createdAt: '2026-11-01T10:00:00Z',
  };
}

function item(id: Id, articleId: Id, rest: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id,
    articleId,
    contributions: [{ id: `${id}-c`, source: { kind: 'manual' }, count: 1 }],
    checked: false,
    createdAt: '2026-11-20T10:00:00Z',
    ...rest,
  };
}

const hitNames = (matches: { item: { name: string } }[]): string[] =>
  matches.map((match) => match.item.name);

describe('searchArticleCatalog', () => {
  it('AC-001: "Kokos" finds Kokosmilch and Kokosmilch light of the household', () => {
    const result = searchArticleCatalog('Kokos', household, starter);
    expect(hitNames(result.matches)).toEqual(['Kokosmilch', 'Kokosmilch light']);
    expect(result.matches.every((match) => match.item.kind === 'article')).toBe(true);
    const [first] = result.matches;
    expect(first?.item.kind === 'article' && first.item.article.areaId).toBe('area-konserven');
  });

  it('AC-002: an unknown name offers "neu anlegen" without hits', () => {
    const result = searchArticleCatalog('Drachenfrucht', household, starter);
    expect(result.canCreate).toBe(true);
    expect(result.exact).toBeUndefined();
    expect(hitNames(result.matches)).not.toContain('Drachenfrucht');
  });

  it('AC-003: a starter entry the household does not have shows up as a hit', () => {
    const result = searchArticleCatalog('Kicher', household, starter);
    const [first] = result.matches;
    expect(first?.item.name).toBe('Kichererbsen');
    expect(first?.item.kind).toBe('starter');
  });

  it('AC-003: a starter entry is hidden when a household article has its name or synonym', () => {
    // Möhren is in the household; the starter Möhren must not appear twice.
    const result = searchArticleCatalog('Möhren', household, starter);
    expect(hitNames(result.matches)).toEqual(['Möhren']);
    expect(result.matches[0]?.item.kind).toBe('article');
    expect(result.exact?.kind).toBe('article');

    const karottenOnly = [article('a-karotten', 'Karotten')];
    const viaSynonym = searchArticleCatalog('Möhren', karottenOnly, starter);
    expect(viaSynonym.matches.some((match) => match.item.kind === 'starter')).toBe(false);
  });

  it('AC-003: an exact starter name counts as exact, so nothing new is offered', () => {
    const result = searchArticleCatalog('kichererbsen', household, starter);
    expect(result.exact?.kind).toBe('starter');
    expect(result.canCreate).toBe(false);
  });

  it('only searches the articles passed in (no article of another household)', () => {
    const result = searchArticleCatalog('Kokos', [moehren], []);
    expect(result.matches).toEqual([]);
  });

  it('an empty query finds nothing', () => {
    expect(searchArticleCatalog('  ', household, starter).matches).toEqual([]);
  });
});

describe('articleDraftFromStarter', () => {
  it('AC-003: takes synonyms, diet, pantry and the area with the starter area name', () => {
    const draft = articleDraftFromStarter(starter[0]!, household, areas);
    expect(draft).toEqual({
      name: 'Kichererbsen',
      synonyms: ['Kichererbse'],
      areaId: 'area-nudeln',
      diet: 'vegan',
      isPantry: true,
      needsReview: false,
    });
  });

  it('E10: without an area of that name the article has no area', () => {
    const draft = articleDraftFromStarter(starter[2]!, household, areas);
    expect(draft.areaId).toBeUndefined();
  });

  it('E10: matches the area name regardless of case and umlauts', () => {
    const draft = articleDraftFromStarter(starter[0]!, household, [
      { id: 'area-x', name: 'nudeln, reis & huelsenfruechte', sort: 0 },
    ]);
    expect(draft.areaId).toBe('area-x');
  });

  it('drops a synonym that is already a name or synonym in the household', () => {
    const draft = articleDraftFromStarter(starter[3]!, [article('a-wm', 'Weizenmehl')], areas);
    expect(draft.synonyms).toEqual([]);
  });
});

describe('defaultShoppingRuleFor', () => {
  it("AC-005: the article's Standard-Einkaufsregel is preselected", () => {
    const mehl = article('a-mehl', 'Mehl', { isPantry: true, defaultShoppingRule: 'recipeAmount' });
    expect(defaultShoppingRuleFor(mehl, { text: '500 g', qty: 500, unit: 'g' })).toBe(
      'recipeAmount',
    );
    expect(defaultShoppingRuleFor(mehl)).toBe('recipeAmount');
  });

  it('E7: without one, Vorrat → Anzahl, amount with unit → Rezeptmenge, otherwise Anzahl', () => {
    expect(defaultShoppingRuleFor(salz, { text: '1 Prise', qty: 1, unit: 'Prise' })).toBe('count');
    expect(defaultShoppingRuleFor(kokosmilch, { text: '400 ml', qty: 400, unit: 'ml' })).toBe(
      'recipeAmount',
    );
    expect(defaultShoppingRuleFor(mango, { text: '1', qty: 1 })).toBe('count');
    expect(defaultShoppingRuleFor(mango)).toBe('count');
  });

  it('E7: "nicht übernehmen" is kept as the default too', () => {
    const wasser = article('a-wasser', 'Wasser', { defaultShoppingRule: 'skip' });
    expect(defaultShoppingRuleFor(wasser, { text: '1 l', qty: 1, unit: 'l' })).toBe('skip');
  });
});

describe('resolveIngredientArticle', () => {
  it('AC-014: a name equal to an article resolves to it (case and spaces ignored)', () => {
    const result = resolveIngredientArticle('  kokosmilch ', household, starter, areas);
    expect(result).toEqual({ kind: 'existing', article: kokosmilch });
  });

  it('AC-015: a synonym resolves to its article', () => {
    const result = resolveIngredientArticle('Karotten', household, starter, areas);
    expect(result).toEqual({ kind: 'existing', article: moehren });
  });

  it('AC-016: a starter entry creates the article with its data, not "Neu aus Rezepten"', () => {
    const result = resolveIngredientArticle('Kichererbsen', household, starter, areas);
    expect(result.kind).toBe('starter');
    expect(result.kind === 'starter' && result.draft).toEqual({
      name: 'Kichererbsen',
      synonyms: ['Kichererbse'],
      areaId: 'area-nudeln',
      diet: 'vegan',
      isPantry: true,
      needsReview: false,
    });
  });

  it('AC-016: a starter synonym resolves to the starter entry under its own name', () => {
    const result = resolveIngredientArticle('Kichererbse', household, starter, areas);
    expect(result.kind === 'starter' && result.draft.name).toBe('Kichererbsen');
  });

  it('AC-017: nothing matches → a new article without area, diet unknown, needs review', () => {
    const result = resolveIngredientArticle('Milchkokos', household, starter, areas);
    expect(result).toEqual({
      kind: 'new',
      draft: {
        name: 'Milchkokos',
        synonyms: [],
        diet: 'unknown',
        isPantry: false,
        needsReview: true,
      },
    });
  });

  it('AC-019: an article of another household is never used', () => {
    const foreign = article('wg-milchkokos', 'Milchkokos');
    const ours = household;
    const result = resolveIngredientArticle('Milchkokos', ours, starter, areas);
    expect(result.kind).toBe('new');
    expect(JSON.stringify(result)).not.toContain(foreign.id);
  });

  it('AC-020: a name of 150 characters becomes an article with the first 120', () => {
    const long = `Tomaten, geschält, aus der Dose ${'x'.repeat(150)}`.slice(0, 150);
    const result = resolveIngredientArticle(long, household, starter, areas);
    expect(result.kind).toBe('new');
    // "ä" is two letters in the key: 120 characters would give a key of 121, so 119 remain.
    expect(result.kind === 'new' && result.draft.name).toBe(long.slice(0, 119));
    expect(result.kind === 'new' && result.draft.needsReview).toBe(true);
  });

  it('AC-020: exactly 120 characters stay as they are', () => {
    const name = 'a'.repeat(120);
    const result = resolveIngredientArticle(name, household, starter, areas);
    expect(result.kind === 'new' && result.draft.name).toBe(name);
  });

  it('AC-020: cutting never splits a character and drops a trailing space', () => {
    const name = `${'a'.repeat(119)} ${'b'.repeat(10)}`;
    const result = resolveIngredientArticle(name, household, starter, areas);
    expect(result.kind === 'new' && result.draft.name).toBe('a'.repeat(119));
    const emoji = `${'a'.repeat(119)}🍅🍅`;
    const withEmoji = resolveIngredientArticle(emoji, household, starter, areas);
    expect(withEmoji.kind === 'new' && withEmoji.draft.name).toBe(`${'a'.repeat(119)}🍅`);
  });

  it('AC-020: the key fits too (articles_name_key_valid): umlauts count twice there', () => {
    const result = resolveIngredientArticle('ä'.repeat(150), household, starter, areas);
    expect(result.kind === 'new' && result.draft.name).toBe('ä'.repeat(60));
  });

  it('a blank name is rejected', () => {
    expect(() => resolveIngredientArticle('   ', household, starter, areas)).toThrow();
  });
});

describe('resolveIngredientArticles', () => {
  const ids = (): (() => Id) => {
    let next = 0;
    return () => `new-${++next}`;
  };

  it('AC-017: two ingredients "Milchkokos" get exactly one new article', () => {
    const result = resolveIngredientArticles(['Milchkokos', 'milchkokos'], {
      articles: household,
      catalog: starter,
      areas,
      newId: ids(),
    });
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({ id: 'new-1', name: 'Milchkokos', needsReview: true });
    expect(result.articleIds).toEqual(['new-1', 'new-1']);
  });

  it('AC-014: existing, starter and new names in one go, in the order of the names', () => {
    const result = resolveIngredientArticles(['Kokosmilch', 'Kichererbsen', 'Milchkokos'], {
      articles: household,
      catalog: starter,
      areas,
      newId: ids(),
    });
    expect(result.articleIds).toEqual(['a-kokosmilch', 'new-1', 'new-2']);
    expect(result.created.map((created) => [created.name, created.needsReview])).toEqual([
      ['Kichererbsen', false],
      ['Milchkokos', true],
    ]);
  });

  it('AC-018: a second run with the created articles creates nothing more', () => {
    const first = resolveIngredientArticles(['Feta', 'Milchkokos', 'Kichererbsen'], {
      articles: household,
      catalog: starter,
      areas,
      newId: ids(),
    });
    const after = [...household, ...first.created];
    const second = resolveIngredientArticles(['Feta', 'Milchkokos', 'Kichererbsen'], {
      articles: after,
      catalog: starter,
      areas,
      newId: ids(),
    });
    expect(second.created).toEqual([]);
    expect(second.articleIds).toEqual(first.articleIds);
  });

  it('AC-018: a starter synonym after its entry was created hits the created article', () => {
    const result = resolveIngredientArticles(['Kichererbsen', 'Kichererbse'], {
      articles: household,
      catalog: starter,
      areas,
      newId: ids(),
    });
    expect(result.created).toHaveLength(1);
    expect(result.articleIds).toEqual(['new-1', 'new-1']);
  });
});

describe('classifyIngredientLines', () => {
  it('AC-008: exact names are sure, the unknown line is new', () => {
    const lines = classifyIngredientLines(
      '200 ml Kokosmilch\n1 Mango\n1 Prise Salz\n2 Drachenfrüchte',
      household,
      starter,
    );
    expect(lines).toHaveLength(4);
    expect(lines.map((line) => line.status)).toEqual(['sure', 'sure', 'sure', 'new']);
    expect(lines.map((line) => [line.line.amount?.text, line.line.name])).toEqual([
      ['200 ml', 'Kokosmilch'],
      ['1', 'Mango'],
      ['1 Prise', 'Salz'],
      ['2', 'Drachenfrüchte'],
    ]);
    const [first] = lines;
    expect(first?.status === 'sure' && first.hit.id).toBe('a-kokosmilch');
  });

  it('AC-009: a typo and a singular are only similar, with the suggestion', () => {
    const lines = classifyIngredientLines('200 ml Kokosmilsch\n2 Tomate', household, starter);
    expect(lines.map((line) => line.status)).toEqual(['similar', 'similar']);
    expect(lines.map((line) => (line.status === 'similar' ? line.suggestion.name : ''))).toEqual([
      'Kokosmilch',
      'Tomaten',
    ]);
  });

  it('AC-009: word parts are not similar ("Buttermilch" is no "Meinst du Milch?")', () => {
    const withMilk = [...household, article('a-milch', 'Milch')];
    const lines = classifyIngredientLines('1 l Buttermilch\n200 ml Milchkokos', withMilk, starter);
    expect(lines.map((line) => line.status)).toEqual(['new', 'new']);
  });

  it('AC-009: a different word that only looks alike is new ("Fleischkäse", "Tafelessig")', () => {
    const list = [
      ...household,
      article('a-frischkaese', 'Frischkäse'),
      article('a-essig', 'Apfelessig'),
    ];
    const lines = classifyIngredientLines('100 g Fleischkäse\n2 EL Tafelessig', list, starter);
    expect(lines.map((line) => line.status)).toEqual(['new', 'new']);
  });

  it('AC-009: a typo of a starter entry is similar too', () => {
    const [line] = classifyIngredientLines('1 Dose Kichererbsn', household, starter);
    expect(line?.status === 'similar' && line.suggestion.name).toBe('Kichererbsen');
  });

  it('AC-008: an exact synonym is sure', () => {
    const [line] = classifyIngredientLines('500 g Karotten', household, starter);
    expect(line?.status === 'sure' && line.hit.name).toBe('Möhren');
  });

  it('AC-008: an exact starter entry is sure and is created on saving', () => {
    const [line] = classifyIngredientLines('1 Dose Kichererbsen', household, starter);
    expect(line?.status).toBe('sure');
    expect(line?.status === 'sure' && line.hit.kind).toBe('starter');
  });

  it('empty lines and bullets are ignored; an empty block gives no lines', () => {
    expect(classifyIngredientLines('- 1 Mango\n\n  \n', household, starter)).toHaveLength(1);
    expect(classifyIngredientLines('', household, starter)).toEqual([]);
  });

  it('AC-010: the hint counts the lines still without article', () => {
    expect(missingArticlesLabel(1)).toBe('1 Zutat braucht noch einen Artikel');
    expect(missingArticlesLabel(3)).toBe('3 Zutaten brauchen noch einen Artikel');
  });
});

describe('validateArticleDraft', () => {
  const milchkokos = article('a-milchkokos', 'Milchkokos');
  const list = [...household, milchkokos];

  it('AC-030: a name that exists in another spelling is taken', () => {
    const problems = validateArticleDraft(
      { id: 'a-milchkokos', name: 'kokosmilch', synonyms: [] },
      list,
    );
    expect(problems).toEqual([
      {
        field: 'name',
        kind: 'taken',
        existing: kokosmilch,
        message: 'Gibt es schon: Kokosmilch',
      },
    ]);
  });

  it('AC-030: a name equal to a synonym of another article is taken by that article', () => {
    const [problem] = validateArticleDraft(
      { id: 'a-milchkokos', name: 'Karotten', synonyms: [] },
      list,
    );
    expect(problem?.message).toBe('Gibt es schon: Möhren');
  });

  it('AC-030: an empty name is missing', () => {
    expect(validateArticleDraft({ id: 'a-milchkokos', name: '  ', synonyms: [] }, list)).toEqual([
      { field: 'name', kind: 'missing', message: 'Name fehlt' },
    ]);
  });

  it('AC-030: keeping or recasing the own name is fine', () => {
    expect(
      validateArticleDraft({ id: 'a-kokosmilch', name: 'KOKOSMILCH', synonyms: [] }, list),
    ).toEqual([]);
  });

  it('AC-026: a new article with a free name has no problems', () => {
    expect(validateArticleDraft({ name: 'Drachenfrucht', synonyms: [] }, list)).toEqual([]);
    expect(validateArticleDraft({ name: 'Kokosmilch', synonyms: [] }, list)[0]?.kind).toBe('taken');
  });

  it('AC-031: a synonym that is the name of another article is refused', () => {
    const problems = validateArticleDraft(
      { id: 'a-kokosmilch', name: 'Kokosmilch', synonyms: ['Kokos-Milch', 'Möhren'] },
      list,
    );
    expect(problems).toEqual([
      {
        field: 'synonyms',
        kind: 'taken',
        synonym: 'Möhren',
        existing: moehren,
        message: '„Möhren“ ist schon ein Artikel',
      },
    ]);
  });

  it('AC-031: a synonym that is a synonym of another article is refused too', () => {
    const [problem] = validateArticleDraft(
      { id: 'a-kokosmilch', name: 'Kokosmilch', synonyms: ['karotten'] },
      list,
    );
    expect(problem).toMatchObject({ field: 'synonyms', kind: 'taken', existing: moehren });
  });

  it('a name of 120 characters is fine, 121 are too long', () => {
    expect(validateArticleDraft({ name: 'a'.repeat(120), synonyms: [] }, list)).toEqual([]);
    // The key of 61 umlauts has 122 letters (articles_name_key_valid).
    expect(validateArticleDraft({ name: 'ä'.repeat(61), synonyms: [] }, list)[0]?.kind).toBe(
      'tooLong',
    );
    expect(validateArticleDraft({ name: 'a'.repeat(121), synonyms: [] }, list)[0]?.kind).toBe(
      'tooLong',
    );
  });

  it('30 synonyms are fine, 31 are too many', () => {
    const synonyms = Array.from({ length: 31 }, (_, index) => `Wort ${index}`);
    expect(
      validateArticleDraft({ name: 'Drachenfrucht', synonyms: synonyms.slice(0, 30) }, list),
    ).toEqual([]);
    expect(validateArticleDraft({ name: 'Drachenfrucht', synonyms }, list)).toEqual([
      { field: 'synonyms', kind: 'tooMany', message: 'Höchstens 30 Synonyme' },
    ]);
  });
});

describe('validateArticleDraft: length of all synonyms', () => {
  it('2000 characters in all synonyms are fine, 2001 are too many (articles_synonyms_size)', () => {
    const synonyms = (last: number) =>
      Array.from(
        { length: 20 },
        (_, index) => `${String(index).padStart(2, '0')}${'x'.repeat(index === 19 ? last : 98)}`,
      );
    expect(validateArticleDraft({ name: 'Drachenfrucht', synonyms: synonyms(98) }, [])).toEqual([]);
    expect(validateArticleDraft({ name: 'Drachenfrucht', synonyms: synonyms(99) }, [])).toEqual([
      {
        field: 'synonyms',
        kind: 'tooLong',
        message: 'Höchstens 2000 Zeichen in allen Synonymen',
      },
    ]);
  });

  it('counts the keys too: umlauts become two letters there (articles_synonym_keys_size)', () => {
    // 20 synonyms of 100 characters: 2000 as typed, more than 2000 as keys ("ä" → "ae").
    const synonyms = Array.from(
      { length: 20 },
      (_, index) => `${String(index).padStart(2, '0')}ä${'x'.repeat(97)}`,
    );
    expect(validateArticleDraft({ name: 'Drachenfrucht', synonyms }, [])[0]?.kind).toBe('tooLong');
  });
});

describe('cleanSynonyms', () => {
  it('AC-031: trims, drops blanks, the own name and repeated spellings', () => {
    expect(
      cleanSynonyms('Kokosmilch', [' Kokos-Milch ', '', 'kokosmilch', 'KOKOS-MILCH', 'Kokosdrink']),
    ).toEqual(['Kokos-Milch', 'Kokosdrink']);
  });
});

describe('searchArticleList', () => {
  const list = [...household, article('a-milch', 'Milch')];

  it('AC-022: "Karotten" finds Möhren through the synonym', () => {
    const [first] = searchArticleList('Karotten', list);
    expect(first?.item.name).toBe('Möhren');
    expect(first?.matchedSynonym).toBe('Karotten');
  });

  it('AC-022: "Kokosmilsh" finds Kokosmilch despite the typo', () => {
    expect(hitNames(searchArticleList('Kokosmilsh', list))).toContain('Kokosmilch');
  });

  it('AC-026: the list is not cut off at the size of a drop-down', () => {
    const many = Array.from({ length: 320 }, (_, index) => article(`a-${index}`, `Tee ${index}`));
    expect(searchArticleList('Tee', many)).toHaveLength(320);
  });

  it('AC-031: after removing a synonym it no longer finds the article', () => {
    const withSynonym = [article('a-k', 'Kokosmilch', { synonyms: ['Kokos-Milch'] })];
    expect(hitNames(searchArticleList('Kokos-Milch', withSynonym))).toEqual(['Kokosmilch']);
    expect(
      searchArticleList('Kokos-Milch', [article('a-k', 'Kokosmilch')])[0]?.matchedSynonym,
    ).toBeUndefined();
  });
});

describe('filters, counts and sorting', () => {
  const zwiebel = article('a-zwiebel', 'Zwiebel', { areaId: 'area-obst', createdAt: '2026-11-03' });
  const zwiebeln = article('a-zwiebeln', 'Zwiebeln', {
    areaId: 'area-obst',
    createdAt: '2026-11-02',
  });
  const geschenkpapier = article('a-gp', 'Geschenkpapier', { createdAt: '2026-11-04' });
  const drachenfrucht = article('a-df', 'Drachenfrucht', { createdAt: '2026-11-05' });
  const milchkokos = article('a-mk', 'Milchkokos', {
    areaId: 'area-konserven',
    needsReview: true,
    createdAt: '2026-11-01',
  });
  const reis = article('a-reis', 'Reis', {
    areaId: 'area-nudeln',
    isPantry: true,
    createdAt: '2026-10-01',
  });
  const list = [zwiebeln, reis, geschenkpapier, milchkokos, zwiebel, drachenfrucht];

  it('AC-023: "Ohne Bereich" shows only articles without area', () => {
    const similar = similarArticleNames(list);
    expect(sortArticles(filterArticles(list, 'noArea', { similar, areas }), 'name')).toEqual([
      drachenfrucht,
      geschenkpapier,
    ]);
  });

  it('AC-051: an article whose area is gone counts as "Ohne Bereich", like articleCountsByArea', () => {
    const orphan = article('a-orphan', 'Katzenfutter', { areaId: 'area-deleted' });
    const withOrphan = [...list, orphan];
    const context = { similar: similarArticleNames(withOrphan), areas };
    expect(sortArticles(filterArticles(withOrphan, 'noArea', context), 'name')).toEqual([
      drachenfrucht,
      geschenkpapier,
      orphan,
    ]);
    expect(articleFilterCounts(withOrphan, context).noArea).toBe(3);
  });

  it('AC-023: "Ähnliche Namen" pairs Zwiebel and Zwiebeln with each other', () => {
    const similar = similarArticleNames(list);
    expect(sortArticles(filterArticles(list, 'similar', { similar, areas }), 'name')).toEqual([
      zwiebel,
      zwiebeln,
    ]);
    expect(similar.get('a-zwiebel')).toEqual([zwiebeln]);
    expect(similar.get('a-zwiebeln')).toEqual([zwiebel]);
  });

  it('AC-021: the chips count their articles', () => {
    expect(articleFilterCounts(list, { similar: similarArticleNames(list), areas })).toEqual({
      all: 6,
      noArea: 2,
      pantry: 1,
      needsReview: 1,
      similar: 2,
    });
  });

  it('AC-027: an empty filter gives an empty list and a count of 0', () => {
    const none = [zwiebel, reis];
    const similar = similarArticleNames(none);
    expect(filterArticles(none, 'needsReview', { similar, areas })).toEqual([]);
    expect(articleFilterCounts(none, { similar, areas }).needsReview).toBe(0);
    expect(filterArticles([], 'all', { similar: new Map(), areas })).toEqual([]);
  });

  it('AC-021: "Alle" lists every article, A–Z by German order', () => {
    const umlauts = [article('1', 'Zucker'), article('2', 'Äpfel'), article('3', 'apfelmus')];
    // "Äpfel" sorts as "Apfel", before the longer "apfelmus", not after "Z".
    expect(sortArticles(umlauts, 'name').map((entry) => entry.name)).toEqual([
      'Äpfel',
      'apfelmus',
      'Zucker',
    ]);
    expect(filterArticles(list, 'all', { similar: new Map(), areas })).toHaveLength(6);
  });

  it('AC-024: "Neu" puts the article created last on top', () => {
    expect(sortArticles(list, 'new').map((entry) => entry.name)).toEqual([
      'Drachenfrucht',
      'Geschenkpapier',
      'Zwiebel',
      'Zwiebeln',
      'Milchkokos',
      'Reis',
    ]);
  });

  it('AC-024: articles without a creation time come last, then A–Z', () => {
    const mixed = [article('b', 'Birne'), article('a', 'Apfel'), zwiebel];
    expect(sortArticles(mixed, 'new').map((entry) => entry.name)).toEqual([
      'Zwiebel',
      'Apfel',
      'Birne',
    ]);
  });

  it('pantry filter shows the Vorrat articles', () => {
    expect(filterArticles(list, 'pantry', { similar: new Map(), areas })).toEqual([reis]);
  });
});

describe('similarArticleNames', () => {
  it('AC-023: a typo away counts, also over synonyms', () => {
    const list = [
      article('a', 'Kokosmilch'),
      article('b', 'Kokosmilsch'),
      article('c', 'Möhren', { synonyms: ['Karotten'] }),
      article('d', 'Karoten'),
    ];
    const similar = similarArticleNames(list);
    expect(similar.get('a')?.map((entry) => entry.id)).toEqual(['b']);
    expect(similar.get('c')?.map((entry) => entry.id)).toEqual(['d']);
  });

  it('AC-023: word parts do not count ("Milch" is not like "Buttermilch")', () => {
    const similar = similarArticleNames([article('a', 'Milch'), article('b', 'Buttermilch')]);
    expect(similar.size).toBe(0);
  });

  it('AC-023: short words and another first letter are not similar ("Reis" and "Eis", "Brot" and "Boot")', () => {
    const similar = similarArticleNames([
      article('a', 'Reis'),
      article('b', 'Eis'),
      article('c', 'Brot'),
      article('d', 'Boot'),
    ]);
    expect(similar.size).toBe(0);
  });

  it('AC-023: look-alike words are different things (E13)', () => {
    const similar = similarArticleNames([
      article('a', 'Belugalinsen', { synonyms: ['Schwarze Linsen'] }),
      article('b', 'Oliven', { synonyms: ['Schwarze Oliven'] }),
      article('c', 'Essig', { synonyms: ['Tafelessig'] }),
      article('d', 'Apfelessig'),
      article('e', 'Leberkäse', { synonyms: ['Fleischkäse'] }),
      article('f', 'Frischkäse'),
      article('g', 'Minze', { synonyms: ['Pfefferminze'] }),
      article('h', 'Pfefferminztee'),
      article('i', 'Kochschinken'),
      article('j', 'Rohschinken'),
    ]);
    expect(similar.size).toBe(0);
  });

  it('AC-023: singular, plural and one typo pair up, also over several words', () => {
    const similar = similarArticleNames([
      article('a', 'Möhre'),
      article('b', 'Möhren'),
      article('c', 'Rote Zwiebel'),
      article('d', 'Rote Zwiebeln'),
      article('e', 'Kokosmilch'),
      article('f', 'Kokosmilsh'),
    ]);
    expect(similar.get('a')?.map((entry) => entry.id)).toEqual(['b']);
    expect(similar.get('c')?.map((entry) => entry.id)).toEqual(['d']);
    expect(similar.get('e')?.map((entry) => entry.id)).toEqual(['f']);
  });

  it('AC-023: 1000 articles need far fewer comparisons than all pairs', () => {
    // A fixed pseudo-random sequence, so the test is the same on every run.
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const word = (): string =>
      Array.from(
        { length: 5 + Math.floor(random() * 10) },
        () => letters[Math.floor(random() * letters.length)],
      ).join('');
    const many = Array.from({ length: 998 }, (_, index) => article(`r-${index}`, word()));
    many.push(article('z1', 'Zwiebel'), article('z2', 'Zwiebeln'));

    const compare = vi.mocked(editDistance);
    compare.mockClear();
    const similar = similarArticleNames(many);
    const allPairs = (many.length * (many.length - 1)) / 2;

    expect(similar.get('z1')?.map((entry) => entry.id)).toEqual(['z2']);
    expect(compare.mock.calls.length).toBeLessThan(allPairs / 100);
  });
});

describe('articleUsage', () => {
  const linsenDal = recipe('r-dal', 'Linsen-Dal', [ingredient('i1', 'a-kokosmilch')]);
  const mangoCurry = recipe('r-curry', 'Mango-Curry', [
    ingredient('i2', 'a-kokosmilch'),
    ingredient('i3', 'a-kokosmilch', { variantId: 'v1' }),
  ]);
  const recipes = [
    mangoCurry,
    recipe('r-salat', 'Salat', [ingredient('i4', 'a-mango')]),
    linsenDal,
  ];

  it('AC-028: lists the recipes that use the article, in the given order, each once', () => {
    expect(articleUsage('a-kokosmilch', recipes, []).recipes).toEqual([mangoCurry, linsenDal]);
  });

  it('AC-034: used in two recipes → no delete, with the reason', () => {
    expect(articleUsage('a-kokosmilch', recipes, [])).toMatchObject({
      canDelete: false,
      deleteBlockedReason: 'Wird in 2 Rezepten verwendet – zusammenführen statt löschen',
    });
    expect(articleUsage('a-mango', recipes, []).deleteBlockedReason).toBe(
      'Wird in 1 Rezept verwendet – zusammenführen statt löschen',
    );
  });

  it('AC-034: only open on the list → "Steht auf der Einkaufsliste"', () => {
    const usage = articleUsage('a-milch', recipes, [item('s1', 'a-milch')]);
    expect(usage).toEqual({
      recipes: [],
      openItems: 1,
      doneItems: 0,
      canDelete: false,
      deleteBlockedReason: 'Steht auf der Einkaufsliste',
    });
  });

  it('AC-034: a done item on the list also blocks deleting', () => {
    const usage = articleUsage('a-milch', [], [item('s1', 'a-milch', { checked: true })]);
    expect(usage).toMatchObject({ doneItems: 1, canDelete: false });
  });

  it('AC-033: unused → can delete', () => {
    expect(articleUsage('a-df', recipes, [item('s1', 'a-milch')])).toEqual({
      recipes: [],
      openItems: 0,
      doneItems: 0,
      canDelete: true,
    });
  });
});

describe('mergeArticlesPreview', () => {
  const milchkokos = article('a-mk', 'Milchkokos', {
    synonyms: ['Kokosdrink'],
    needsReview: true,
  });
  const curry = recipe('r-curry', 'Curry', [ingredient('i1', 'a-mk')]);
  const mangoCurry = recipe('r-mc', 'Mango-Curry', [ingredient('i2', 'a-kokosmilch')]);
  const items = [item('s1', 'a-mk', { checked: false }), item('s2', 'a-kokosmilch')];

  it('AC-036: the dialog names the source, the target and what moves', () => {
    const preview = mergeArticlesPreview(milchkokos, kokosmilch, [curry, mangoCurry], items);
    expect(preview.title).toBe('Milchkokos in Kokosmilch zusammenführen?');
    expect(preview.message).toBe(
      '1 Rezept und 1 Posten ziehen um. Das lässt sich nicht rückgängig machen.',
    );
    expect(preview.recipes).toBe(1);
    expect(preview.items).toBe(1);
  });

  it('AC-036: the source name and synonyms become synonyms of the target', () => {
    const preview = mergeArticlesPreview(milchkokos, kokosmilch, [], []);
    expect(preview.merged.synonyms).toEqual(['Milchkokos', 'Kokosdrink']);
    expect(preview.merged.id).toBe('a-kokosmilch');
    expect(preview.merged.name).toBe('Kokosmilch');
  });

  it('AC-036: duplicate keys fall away when synonyms overlap', () => {
    const target = article('t', 'Kokosmilch', { synonyms: ['Kokosdrink'] });
    const source = article('s', 'Milchkokos', { synonyms: ['kokosdrink', 'KOKOSMILCH'] });
    expect(mergeArticlesPreview(source, target, [], []).merged.synonyms).toEqual([
      'Kokosdrink',
      'Milchkokos',
    ]);
  });

  it('AC-038: empty data of the target are filled, Vorrat stays as at the target', () => {
    const target = article('t', 'Kokosmilch', { diet: 'vegan' });
    const source = article('s', 'Milchkokos', {
      areaId: 'area-konserven',
      diet: 'unknown',
      isPantry: true,
      defaultShoppingRule: 'recipeAmount',
    });
    const { merged } = mergeArticlesPreview(source, target, [], []);
    expect(merged).toMatchObject({
      areaId: 'area-konserven',
      diet: 'vegan',
      isPantry: false,
      defaultShoppingRule: 'recipeAmount',
      needsReview: false,
    });
  });

  it('AC-038: set data of the target win', () => {
    const target = article('t', 'Kokosmilch', {
      areaId: 'area-obst',
      diet: 'unknown',
      defaultShoppingRule: 'count',
    });
    const source = article('s', 'Milchkokos', {
      areaId: 'area-konserven',
      diet: 'vegan',
      defaultShoppingRule: 'skip',
    });
    expect(mergeArticlesPreview(source, target, [], []).merged).toMatchObject({
      areaId: 'area-obst',
      diet: 'vegan',
      defaultShoppingRule: 'count',
    });
  });

  it('AC-039: both in the same recipe count as one recipe', () => {
    const both = recipe('r', 'Curry', [ingredient('i1', 'a-mk'), ingredient('i2', 'a-kokosmilch')]);
    const preview = mergeArticlesPreview(milchkokos, kokosmilch, [both], []);
    expect(preview.recipes).toBe(1);
    expect(preview.message).toBe('1 Rezept zieht um. Das lässt sich nicht rückgängig machen.');
  });

  it('counts open and done items of the source; plural and empty texts', () => {
    const preview = mergeArticlesPreview(
      milchkokos,
      kokosmilch,
      [curry, recipe('r2', 'Dal', [ingredient('i9', 'a-mk')])],
      [item('s1', 'a-mk'), item('s3', 'a-mk', { checked: true })],
    );
    expect(preview.message).toBe(
      '2 Rezepte und 2 Posten ziehen um. Das lässt sich nicht rückgängig machen.',
    );
    expect(mergeArticlesPreview(milchkokos, kokosmilch, [], [item('s1', 'a-mk')]).message).toBe(
      '1 Posten zieht um. Das lässt sich nicht rückgängig machen.',
    );
    expect(mergeArticlesPreview(milchkokos, kokosmilch, [], []).message).toBe(
      'Das lässt sich nicht rückgängig machen.',
    );
  });

  it('E8: 30 synonyms are fine, 31 refuse the merge with the hint', () => {
    const target = article('t', 'Kokosmilch', {
      synonyms: Array.from({ length: 29 }, (_, index) => `Wort ${index}`),
    });
    const fits = mergeArticlesPreview(article('s', 'Milchkokos'), target, [], []);
    expect(fits.tooManySynonyms).toBe(false);
    expect(fits.merged.synonyms).toHaveLength(30);

    const tooMany = mergeArticlesPreview(
      article('s', 'Milchkokos', { synonyms: ['Kokosdrink'] }),
      target,
      [],
      [],
    );
    expect(tooMany.tooManySynonyms).toBe(true);
    expect(tooMany.tooManySynonymsMessage).toBe(
      'Zu viele Synonyme – entferne zuerst welche bei Kokosmilch',
    );
  });

  it('E8: 2000 characters in all synonyms are fine, more refuse the merge with the same hint (articles_synonyms_size)', () => {
    const target = article('t', 'Kokosmilch', { synonyms: ['a'.repeat(995), 'b'.repeat(995)] });
    const fits = mergeArticlesPreview(article('s', 'Milchkokos'), target, [], []);
    expect(fits.tooManySynonyms).toBe(false);

    const tooLong = mergeArticlesPreview(article('s', 'Milchkokos Bio'), target, [], []);
    expect(tooLong.tooManySynonyms).toBe(true);
    expect(tooLong.tooManySynonymsMessage).toBe(
      'Zu viele Synonyme – entferne zuerst welche bei Kokosmilch',
    );

    // The keys count too: "ä" becomes "ae" (articles_synonym_keys_size).
    const longKeys = mergeArticlesPreview(
      article('s', 'Milchkokos'),
      article('t', 'Kokosmilch', { synonyms: ['ä'.repeat(1000)] }),
      [],
      [],
    );
    expect(longKeys.tooManySynonyms).toBe(true);
  });
});

describe('mergeTargets', () => {
  const milchkokos = article('a-mk', 'Milchkokos');

  it('AC-041: the source itself is never a target', () => {
    const list = [...household, milchkokos];
    expect(hitNames(mergeTargets('Milchkokos', 'a-mk', list))).not.toContain('Milchkokos');
    expect(hitNames(mergeTargets('Kokosmilch', 'a-mk', list))[0]).toBe('Kokosmilch');
  });

  it('AC-041: only the articles passed in are targets', () => {
    expect(mergeTargets('Kokosnuss', 'a-mk', [milchkokos])).toEqual([]);
  });
});

describe('applyArticleMerge', () => {
  const milchkokos = article('a-mk', 'Milchkokos', { synonyms: ['Kokosdrink'], needsReview: true });
  const contribution = (id: string, label?: string) =>
    label
      ? { id, source: { kind: 'recipe' as const, recipeId: 'r-mc', label }, count: 1 }
      : { id, source: { kind: 'manual' as const }, count: 1, note: 'Bio' };

  it('AC-036: recipes point to the target, both open items become one with both contributions', () => {
    const curry = recipe('r-curry', 'Curry', [ingredient('i1', 'a-mk', { shoppingNote: 'Bio' })]);
    const mangoCurry = recipe('r-mc', 'Mango-Curry', [ingredient('i2', 'a-kokosmilch')]);
    const source = item('s-mk', 'a-mk', { contributions: [contribution('c-hand')] });
    const target = item('s-km', 'a-kokosmilch', {
      contributions: [contribution('c-mc', 'Mango-Curry (Sa)')],
    });

    const result = applyArticleMerge(milchkokos, kokosmilch, [curry, mangoCurry], [source, target]);

    expect(result.recipes[0]?.ingredients).toEqual([
      ingredient('i1', 'a-kokosmilch', { shoppingNote: 'Bio' }),
    ]);
    expect(result.recipes[1]).toBe(mangoCurry);
    expect(result.items).toEqual([
      {
        ...target,
        contributions: [contribution('c-mc', 'Mango-Curry (Sa)'), contribution('c-hand')],
      },
    ]);
    expect(result.article).toMatchObject({
      id: 'a-kokosmilch',
      synonyms: ['Milchkokos', 'Kokosdrink'],
      needsReview: false,
    });
    expect(result.removedItemId).toBe('s-mk');
  });

  it('AC-039: both in one recipe stay two rows with their other data', () => {
    const curry = recipe('r', 'Curry', [
      ingredient('i1', 'a-mk', { amount: { text: '200 ml', qty: 200, unit: 'ml' } }),
      ingredient('i2', 'a-kokosmilch', { amount: { text: '400 ml', qty: 400, unit: 'ml' } }),
    ]);
    const [merged] = applyArticleMerge(milchkokos, kokosmilch, [curry], []).recipes;
    expect(merged?.ingredients.map((entry) => [entry.articleId, entry.amount?.text])).toEqual([
      ['a-kokosmilch', '200 ml'],
      ['a-kokosmilch', '400 ml'],
    ]);
  });

  it('other items of the source (checked, or open without an open target) move to the target', () => {
    const done = item('s-done', 'a-mk', { checked: true });
    const open = item('s-open', 'a-mk');
    const other = item('s-other', 'a-mango');
    const result = applyArticleMerge(milchkokos, kokosmilch, [], [done, open, other]);
    expect(result.items.map((entry) => [entry.id, entry.articleId, entry.checked])).toEqual([
      ['s-done', 'a-kokosmilch', true],
      ['s-open', 'a-kokosmilch', false],
      ['s-other', 'a-mango', false],
    ]);
    expect(result.items[2]).toBe(other);
    expect(result.removedItemId).toBeUndefined();
  });
});
