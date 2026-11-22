import { parseIngredientBlock, type ParsedIngredient } from './amounts';
import { spellingScore, wordsOf } from './articles';
import { createdTime } from './dates';
import {
  matchSearchOrCreate,
  type SearchOrCreateMatch,
  type SearchOrCreateResult,
} from './search-or-create';
import { normalizeText } from './text';
import type { Amount, Area, Article, Diet, Id, Recipe, ShoppingItem, ShoppingRule } from './types';

// Rules of the article catalog (spec 0007): what "Suchen oder anlegen" finds for an ingredient,
// how ingredients get their article without a human choice, and the rules of the page "Artikel".
// Only the articles passed in are ever used, so callers hand in the active household's articles.

/**
 * Limits of the database (`articles_name_valid`, `articles_name_key_valid`,
 * `articles_synonyms_size`, `articles_synonym_keys_size`), counted in code points like
 * `char_length`. Keys count too: "ä" is two letters there.
 */
export const MAX_ARTICLE_NAME_LENGTH = 120;
export const MAX_SYNONYMS = 30;
export const MAX_SYNONYMS_LENGTH = 2000;

/** What name matching needs of an article; drafts about to be created have it too. */
export type NamedArticle = Pick<Article, 'id' | 'name' | 'synonyms'>;

const length = (text: string): number => Array.from(text).length;
/** All texts together, as Postgres counts `array_to_string(…, '')` (articles_synonyms_size). */
const totalLength = (texts: readonly string[]): number =>
  texts.reduce((sum, text) => sum + length(text), 0);

/** One entry of the starter catalog as core sees it; the api maps its area key to the name. */
export interface StarterCatalogEntry {
  name: string;
  synonyms?: readonly string[];
  /** Name of the starter area ("Konserven & Saucen"); the household's area of that name is used. */
  areaName?: string;
  diet: Diet;
  isPantry?: boolean;
}

/** A hit of the article catalog: an article of the household or a starter entry. */
export type CatalogHit<T extends Article = Article> =
  | { kind: 'article'; id: Id; name: string; synonyms: readonly string[]; article: T }
  | {
      kind: 'starter';
      /** "starter:<normalised name>", never an article id. */
      id: string;
      name: string;
      synonyms: readonly string[];
      entry: StarterCatalogEntry;
    };

/** The data of an article to create; the caller adds id and keys. */
export interface ArticleDraft {
  name: string;
  synonyms: string[];
  areaId?: Id;
  diet: Diet;
  isPantry: boolean;
  needsReview: boolean;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function keysOf(article: { name: string; synonyms?: readonly string[] }): string[] {
  return [article.name, ...(article.synonyms ?? [])].map(normalizeText);
}

function takenKeys(articles: readonly NamedArticle[]): Set<string> {
  return new Set(articles.flatMap(keysOf));
}

function findByKey<T extends NamedArticle>(key: string, articles: readonly T[]): T | undefined {
  if (key === '') return undefined;
  return (
    articles.find((article) => normalizeText(article.name) === key) ??
    articles.find((article) => article.synonyms.some((synonym) => normalizeText(synonym) === key))
  );
}

/** Starter entries the household does not have yet: none of their names is taken (E10). */
function availableStarterEntries(
  articles: readonly NamedArticle[],
  catalog: readonly StarterCatalogEntry[],
): StarterCatalogEntry[] {
  const taken = takenKeys(articles);
  return catalog.filter((entry) => !keysOf(entry).some((key) => taken.has(key)));
}

function catalogHits<T extends Article>(
  articles: readonly T[],
  catalog: readonly StarterCatalogEntry[],
): CatalogHit<T>[] {
  return [
    ...articles.map((article): CatalogHit<T> => ({
      kind: 'article',
      id: article.id,
      name: article.name,
      synonyms: article.synonyms,
      article,
    })),
    ...availableStarterEntries(articles, catalog).map((entry): CatalogHit<T> => ({
      kind: 'starter',
      id: `starter:${normalizeText(entry.name)}`,
      name: entry.name,
      synonyms: entry.synonyms ?? [],
      entry,
    })),
  ];
}

/**
 * "Suchen oder anlegen" for an ingredient: the household's articles plus the starter entries the
 * household does not have yet (no article carries their name or a synonym). Matching, "Meinst du
 * …?" and "neu anlegen" follow matchSearchOrCreate (spec 0005, REQ-006).
 */
export function searchArticleCatalog<T extends Article>(
  query: string,
  articles: readonly T[],
  catalog: readonly StarterCatalogEntry[],
  options?: { limit?: number },
): SearchOrCreateResult<CatalogHit<T>> {
  return matchSearchOrCreate(query, catalogHits(articles, catalog), options);
}

/**
 * The household article a chosen starter entry becomes (E10): its synonyms, diet and Vorrat, and
 * the household's area whose name equals the starter area (otherwise no area). Synonyms that
 * already name another article are left out, because names are unique per household.
 */
export function articleDraftFromStarter(
  entry: StarterCatalogEntry,
  articles: readonly NamedArticle[],
  areas: readonly Area[],
): ArticleDraft {
  const taken = takenKeys(articles);
  const seen = new Set([normalizeText(entry.name)]);
  const synonyms: string[] = [];
  for (const synonym of entry.synonyms ?? []) {
    const key = normalizeText(synonym);
    if (key === '' || taken.has(key) || seen.has(key)) continue;
    seen.add(key);
    synonyms.push(synonym);
  }
  const areaKey = entry.areaName === undefined ? '' : normalizeText(entry.areaName);
  const area = areaKey === '' ? undefined : areas.find((a) => normalizeText(a.name) === areaKey);

  const draft: ArticleDraft = {
    name: entry.name,
    synonyms: synonyms.slice(0, MAX_SYNONYMS),
    diet: entry.diet,
    isPantry: entry.isPantry ?? false,
    needsReview: false,
  };
  if (area) draft.areaId = area.id;
  return draft;
}

/**
 * The shopping rule preselected for a new ingredient (AC-005, E7): the article's
 * Standard-Einkaufsregel; without one Vorrat → Anzahl, an amount with unit → Rezeptmenge,
 * otherwise Anzahl.
 */
export function defaultShoppingRuleFor(
  article: Pick<Article, 'isPantry' | 'defaultShoppingRule'>,
  amount?: Amount,
): ShoppingRule {
  if (article.defaultShoppingRule !== undefined) return article.defaultShoppingRule;
  if (article.isPantry) return 'count';
  return amount?.unit !== undefined && amount.unit !== '' ? 'recipeAmount' : 'count';
}

const fits = (name: string): boolean =>
  length(name) <= MAX_ARTICLE_NAME_LENGTH && length(normalizeText(name)) <= MAX_ARTICLE_NAME_LENGTH;

/**
 * The first 120 characters, counted like the database (code points), without a trailing space;
 * shorter when the key would be longer than 120 ("ä" → "ae").
 */
function cutName(name: string): string {
  if (fits(name)) return name;
  const characters = Array.from(name).slice(0, MAX_ARTICLE_NAME_LENGTH);
  while (characters.length > 0 && !fits(characters.join(''))) characters.pop();
  return characters.join('').trim();
}

export type IngredientArticleResolution<T extends NamedArticle = Article> =
  | { kind: 'existing'; article: T }
  | { kind: 'starter'; entry: StarterCatalogEntry; draft: ArticleDraft }
  | { kind: 'new'; draft: ArticleDraft };

/**
 * The article for an ingredient that nobody chose (starter recipes, assistant, sample data; REQ-004,
 * E1): an article whose name or synonym is the name, then an available starter entry, otherwise a
 * new article "Neu aus Rezepten" without area, diet unknown, named with the first 120 characters.
 * Throws for a blank name.
 */
export function resolveIngredientArticle<T extends NamedArticle>(
  name: string,
  articles: readonly T[],
  catalog: readonly StarterCatalogEntry[],
  areas: readonly Area[],
): IngredientArticleResolution<T> {
  const typed = collapse(name);
  if (typed === '') throw new Error('Name fehlt');
  const cut = cutName(typed);

  const existing =
    findByKey(normalizeText(typed), articles) ?? findByKey(normalizeText(cut), articles);
  if (existing) return { kind: 'existing', article: existing };

  const key = normalizeText(cut);
  const keyOfTyped = normalizeText(typed);
  const entry = availableStarterEntries(articles, catalog).find((candidate) =>
    keysOf(candidate).some((candidateKey) => candidateKey === keyOfTyped || candidateKey === key),
  );
  if (entry)
    return { kind: 'starter', entry, draft: articleDraftFromStarter(entry, articles, areas) };

  return {
    kind: 'new',
    draft: { name: cut, synonyms: [], diet: 'unknown', isPantry: false, needsReview: true },
  };
}

/**
 * resolveIngredientArticle for several names at once: an article created for one name is found
 * by the next, so "Milchkokos" in two recipes gives exactly one new article (AC-017). Returns the
 * article id per name, in order, and the articles to create (ids from `newId`).
 */
export function resolveIngredientArticles(
  names: readonly string[],
  context: {
    articles: readonly NamedArticle[];
    catalog: readonly StarterCatalogEntry[];
    areas: readonly Area[];
    newId: () => Id;
  },
): { articleIds: Id[]; created: (ArticleDraft & { id: Id })[] } {
  const created: (ArticleDraft & { id: Id })[] = [];
  const articleIds = names.map((name) => {
    const known: NamedArticle[] = [...context.articles, ...created];
    const result = resolveIngredientArticle(name, known, context.catalog, context.areas);
    if (result.kind === 'existing') return result.article.id;
    const article = { id: context.newId(), ...result.draft };
    created.push(article);
    return article.id;
  });
  return { articleIds, created };
}

export type IngredientLineClass<T extends Article = Article> =
  /** Name or synonym equals the text (after normalising): the article is set. */
  | { status: 'sure'; line: ParsedIngredient; hit: CatalogHit<T> }
  /** Only similar: orange with "Meinst du …?". */
  | { status: 'similar'; line: ParsedIngredient; suggestion: CatalogHit<T> }
  /** Nothing fits: orange with "„…“ neu anlegen". */
  | { status: 'new'; line: ParsedIngredient };

/** The hit spelled most like the key (`spelledAlike`: a typo away or its singular/plural). */
function bestSpelledAlike<T extends { name: string; synonyms: readonly string[] }>(
  key: string,
  hits: readonly T[],
): T | undefined {
  let best: { hit: T; score: number } | undefined;
  for (const hit of hits) {
    for (const candidate of keysOf(hit)) {
      const score = spellingScore(key, candidate);
      if (score > 0 && score > (best?.score ?? 0)) best = { hit, score };
    }
  }
  return best?.hit;
}

/**
 * Sorts the lines of a pasted block (REQ-002): sure when an article or available starter entry
 * has the name as name or synonym; similar ("Meinst du …?") when one is spelled alike
 * (`spelledAlike`), never a word part ("Buttermilch" is no "Milch"); new otherwise.
 * Empty lines and bullets are ignored.
 */
export function classifyIngredientLines<T extends Article>(
  text: string,
  articles: readonly T[],
  catalog: readonly StarterCatalogEntry[],
): IngredientLineClass<T>[] {
  const hits = catalogHits(articles, catalog);
  return parseIngredientBlock(text).map((line): IngredientLineClass<T> => {
    const key = normalizeText(line.name);
    const exact =
      hits.find((hit) => normalizeText(hit.name) === key) ??
      hits.find((hit) => hit.synonyms.some((synonym) => normalizeText(synonym) === key));
    if (exact) return { status: 'sure', line, hit: exact };
    const similar = bestSpelledAlike(key, hits);
    if (similar) return { status: 'similar', line, suggestion: similar };
    return { status: 'new', line };
  });
}

/** "1 Zutat braucht noch einen Artikel" (AC-010). */
export function missingArticlesLabel(count: number): string {
  return count === 1
    ? '1 Zutat braucht noch einen Artikel'
    : `${count} Zutaten brauchen noch einen Artikel`;
}

/**
 * Synonyms as they are stored: trimmed, blank ones and the article's own name left out, each
 * spelling once (after normalising), in the given order.
 */
export function cleanSynonyms(name: string, synonyms: readonly string[]): string[] {
  const seen = new Set([normalizeText(name)]);
  const cleaned: string[] = [];
  for (const synonym of synonyms) {
    const shown = collapse(synonym);
    const key = normalizeText(shown);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(shown);
  }
  return cleaned;
}

export type ArticleDraftProblem<T extends Article = Article> =
  | { field: 'name'; kind: 'missing'; message: string }
  | { field: 'name'; kind: 'tooLong'; message: string }
  /** `existing` is offered for "Zusammenführen …" (AC-030). */
  | { field: 'name'; kind: 'taken'; existing: T; message: string }
  | { field: 'synonyms'; kind: 'taken'; synonym: string; existing: T; message: string }
  | { field: 'synonyms'; kind: 'tooMany'; message: string }
  | { field: 'synonyms'; kind: 'tooLong'; message: string };

/**
 * Checks name and synonyms of an article being created (no id) or edited (its id) against the
 * other articles: a name or synonym must not be the name or a synonym of another article (after
 * normalising, E6). Empty → "Name fehlt", taken → "Gibt es schon: Kokosmilch", a synonym taken →
 * "„Möhren“ ist schon ein Artikel"; at most 120 characters, 30 synonyms and 2000 characters in
 * all synonyms (after cleanSynonyms; the keys count too). [] = fine.
 */
export function validateArticleDraft<T extends Article>(
  draft: { id?: Id; name: string; synonyms: readonly string[] },
  articles: readonly T[],
): ArticleDraftProblem<T>[] {
  const others = articles.filter((article) => article.id !== draft.id);
  const problems: ArticleDraftProblem<T>[] = [];

  const name = collapse(draft.name);
  if (name === '') {
    problems.push({ field: 'name', kind: 'missing', message: 'Name fehlt' });
  } else if (!fits(name)) {
    problems.push({ field: 'name', kind: 'tooLong', message: 'Höchstens 120 Zeichen' });
  } else {
    const existing = findByKey(normalizeText(name), others);
    if (existing) {
      problems.push({
        field: 'name',
        kind: 'taken',
        existing,
        message: `Gibt es schon: ${existing.name}`,
      });
    }
  }

  const synonyms = cleanSynonyms(name, draft.synonyms);
  if (synonyms.length > MAX_SYNONYMS) {
    problems.push({ field: 'synonyms', kind: 'tooMany', message: 'Höchstens 30 Synonyme' });
  }
  if (
    totalLength(synonyms) > MAX_SYNONYMS_LENGTH ||
    totalLength(synonyms.map(normalizeText)) > MAX_SYNONYMS_LENGTH
  ) {
    problems.push({
      field: 'synonyms',
      kind: 'tooLong',
      message: 'Höchstens 2000 Zeichen in allen Synonymen',
    });
  }
  for (const synonym of synonyms) {
    const existing = findByKey(normalizeText(synonym), others);
    if (!existing) continue;
    problems.push({
      field: 'synonyms',
      kind: 'taken',
      synonym,
      existing,
      message: `„${synonym}“ ist schon ein Artikel`,
    });
  }
  return problems;
}

/** The search of the page "Artikel" (AC-022): every hit, best first, no drop-down limit. */
export function searchArticleList<T extends Article>(
  query: string,
  articles: readonly T[],
): SearchOrCreateMatch<T>[] {
  return matchSearchOrCreate(query, articles, { limit: articles.length }).matches;
}

interface NameKey {
  owner: number;
  key: string;
  /** The key without spaces and hyphens; names spelled alike differ here by ≤ 2 per word. */
  compact: string;
  words: number;
}

/** Lower bound of the edit distance: characters one string has more of than the other. */
function bagDistance(a: string, b: string): number {
  const counts = new Map<string, number>();
  for (const character of a) counts.set(character, (counts.get(character) ?? 0) + 1);
  let onlyInB = 0;
  for (const character of b) {
    const left = counts.get(character) ?? 0;
    if (left > 0) counts.set(character, left - 1);
    else onlyInB++;
  }
  const onlyInA = a.length - (b.length - onlyInB);
  return Math.max(onlyInA, onlyInB);
}

function firstLetterOrder(a: string, b: string): number {
  return (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0);
}

// Per word, names spelled alike differ by at most two letters (two typos or the ending "en").
const MAX_WORD_DIFFERENCE = 2;

/**
 * "Ähnliche Namen" (AC-023): for each article the other articles whose name or synonym is spelled
 * alike one of its own (`spelledAlike`: a typo away or its singular/plural, word by word); word
 * parts and look-alike words do not count. Only articles with at least one look-alike are in the
 * map, look-alikes in the given order. Names spelled alike share the first letter and differ in
 * length by at most two letters per word, so only such keys are compared, after a cheap
 * character count check; large catalogs need few full comparisons. Callers keep the result per
 * data state.
 */
export function similarArticleNames<T extends Article>(articles: readonly T[]): Map<Id, T[]> {
  const keys: NameKey[] = articles
    .flatMap((article, owner) =>
      [...new Set(keysOf(article))].map((key) => {
        const words = wordsOf(key);
        return { owner, key, compact: words.join(''), words: words.length };
      }),
    )
    .filter((entry) => entry.compact !== '')
    .sort((a, b) => firstLetterOrder(a.compact, b.compact) || a.compact.length - b.compact.length);

  const pairs = new Map<number, Set<number>>();
  const link = (a: number, b: number): void => {
    pairs.set(a, (pairs.get(a) ?? new Set()).add(b));
    pairs.set(b, (pairs.get(b) ?? new Set()).add(a));
  };

  for (let i = 0; i < keys.length; i++) {
    const shorter = keys[i];
    if (!shorter) continue;
    const maxDifference = MAX_WORD_DIFFERENCE * shorter.words;
    for (let j = i + 1; j < keys.length; j++) {
      const longer = keys[j];
      if (!longer || longer.compact[0] !== shorter.compact[0]) break;
      if (longer.compact.length - shorter.compact.length > maxDifference) break;
      if (longer.owner === shorter.owner || pairs.get(shorter.owner)?.has(longer.owner)) continue;
      if (bagDistance(shorter.compact, longer.compact) > maxDifference) continue;
      if (spellingScore(shorter.key, longer.key) > 0) link(shorter.owner, longer.owner);
    }
  }

  const result = new Map<Id, T[]>();
  articles.forEach((article, owner) => {
    const similar = pairs.get(owner);
    if (!similar) return;
    result.set(
      article.id,
      articles.filter((_, other) => similar.has(other)),
    );
  });
  return result;
}

export type ArticleFilter =
  | 'all'
  | 'noArea'
  | 'pantry'
  | 'needsReview'
  | 'similar'
  /** "Ernährung unbekannt" (spec 0023, REQ-008): not set yet; "kein Lebensmittel" is set. */
  | 'unknownDiet';

/** What the filters need besides the articles: the look-alikes and the household's areas. */
export interface ArticleFilterContext<T extends Article> {
  /** From similarArticleNames. */
  similar: ReadonlyMap<Id, readonly T[]>;
  areas: readonly Area[];
}

function passes<T extends Article>(
  article: T,
  filter: ArticleFilter,
  similar: ReadonlyMap<Id, readonly T[]>,
  areaIds: ReadonlySet<Id>,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'noArea':
      return article.areaId === undefined || !areaIds.has(article.areaId);
    case 'pantry':
      return article.isPantry;
    case 'needsReview':
      return article.needsReview === true;
    case 'similar':
      return (similar.get(article.id)?.length ?? 0) > 0;
    case 'unknownDiet':
      return article.diet === 'unknown';
  }
}

/**
 * The filter chips of the page "Artikel": "Alle", "Ohne Bereich" (also an area that no longer
 * exists, like articleCountsByArea), "Vorrat", "Neu aus Rezepten", "Ähnliche Namen". Keeps the
 * given order.
 */
export function filterArticles<T extends Article>(
  articles: readonly T[],
  filter: ArticleFilter,
  context: ArticleFilterContext<T>,
): T[] {
  const areaIds = new Set(context.areas.map((area) => area.id));
  return articles.filter((article) => passes(article, filter, context.similar, areaIds));
}

/** The numbers on the chips ("Ohne Bereich (2)"). */
export function articleFilterCounts<T extends Article>(
  articles: readonly T[],
  context: ArticleFilterContext<T>,
): Record<ArticleFilter, number> {
  const count = (filter: ArticleFilter): number => filterArticles(articles, filter, context).length;
  return {
    all: articles.length,
    noArea: count('noArea'),
    pantry: count('pantry'),
    needsReview: count('needsReview'),
    similar: count('similar'),
    unknownDiet: count('unknownDiet'),
  };
}

export type ArticleSort = 'name' | 'new';

function byName(a: Article, b: Article): number {
  return a.name.localeCompare(b.name, 'de');
}

/**
 * "A–Z" by German order, or "Neu": created last first (AC-024); articles without a creation time
 * come last. Ties A–Z.
 */
export function sortArticles<T extends Article>(articles: readonly T[], by: ArticleSort): T[] {
  const time = (article: T): number => createdTime(article);
  return [...articles].sort((a, b) => (by === 'new' ? time(b) - time(a) : 0) || byName(a, b));
}

export interface ArticleUsage {
  /** Recipes with at least one ingredient of the article, in the given order. */
  recipes: Recipe[];
  openItems: number;
  /** Checked items still on the list also block deleting (the server checks the same). */
  doneItems: number;
  canDelete: boolean;
  /** Why "Löschen" is greyed out (AC-034). */
  deleteBlockedReason?: string;
}

function recipesUsing(articleId: Id, recipes: readonly Recipe[]): Recipe[] {
  return recipes.filter((recipe) =>
    recipe.ingredients.some((ingredient) => ingredient.articleId === articleId),
  );
}

/**
 * Where an article is used, for "In Rezepten" and "Löschen": unused articles can be deleted;
 * otherwise "Wird in 2 Rezepten verwendet – zusammenführen statt löschen" or "Steht auf der
 * Einkaufsliste" (AC-033, AC-034).
 */
export function articleUsage(
  articleId: Id,
  recipes: readonly Recipe[],
  items: readonly ShoppingItem[],
): ArticleUsage {
  const used = recipesUsing(articleId, recipes);
  const own = items.filter((item) => item.articleId === articleId);
  const openItems = own.filter((item) => !item.checked).length;
  const doneItems = own.length - openItems;
  const usage: ArticleUsage = {
    recipes: used,
    openItems,
    doneItems,
    canDelete: used.length === 0 && own.length === 0,
  };
  if (used.length > 0) {
    const recipesText = used.length === 1 ? '1 Rezept' : `${used.length} Rezepten`;
    usage.deleteBlockedReason = `Wird in ${recipesText} verwendet – zusammenführen statt löschen`;
  } else if (own.length > 0) {
    usage.deleteBlockedReason = 'Steht auf der Einkaufsliste';
  }
  return usage;
}

export interface MergePreview<T extends Article> {
  /** "Milchkokos in Kokosmilch zusammenführen?" */
  title: string;
  /** "1 Rezept und 1 Posten ziehen um. Das lässt sich nicht rückgängig machen." */
  message: string;
  /** Recipes with an ingredient of the source. */
  recipes: number;
  /** Shopping items of the source, open and done. */
  items: number;
  /** The target as it will be after the merge (E8). */
  merged: T;
  /**
   * More than 30 synonyms or more than 2000 characters in them or in their keys: the server
   * refuses with too_many_synonyms, nothing changes (open question 11).
   */
  tooManySynonyms: boolean;
  tooManySynonymsMessage?: string;
}

function movesText(recipes: number, items: number): string {
  const parts: string[] = [];
  if (recipes > 0) parts.push(recipes === 1 ? '1 Rezept' : `${recipes} Rezepte`);
  if (items > 0) parts.push(`${items} Posten`);
  if (parts.length === 0) return '';
  const verb = recipes + items === 1 ? 'zieht' : 'ziehen';
  return `${parts.join(' und ')} ${verb} um. `;
}

/**
 * What "Zusammenführen" of source into target does (REQ-007, E8): the target keeps its data and
 * only empty ones (no area, diet "unknown", no Standard-Einkaufsregel) are filled from the
 * source; Vorrat stays as at the target. Name and synonyms of the source become synonyms of the
 * target, keys already there fall away. The target leaves "Neu aus Rezepten".
 */
export function mergeArticlesPreview<T extends Article>(
  source: T,
  target: T,
  recipes: readonly Recipe[],
  items: readonly ShoppingItem[],
): MergePreview<T> {
  const seen = new Set(keysOf({ name: target.name }));
  const synonyms: string[] = [];
  for (const synonym of [...target.synonyms, source.name, ...source.synonyms]) {
    const key = normalizeText(synonym);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    synonyms.push(synonym);
  }

  const areaId = target.areaId ?? source.areaId;
  const rule = target.defaultShoppingRule ?? source.defaultShoppingRule;
  const merged: T = {
    ...target,
    synonyms,
    diet: target.diet === 'unknown' ? source.diet : target.diet,
    needsReview: false,
    ...(areaId === undefined ? {} : { areaId }),
    ...(rule === undefined ? {} : { defaultShoppingRule: rule }),
  };

  const recipeCount = recipesUsing(source.id, recipes).length;
  const itemCount = items.filter((item) => item.articleId === source.id).length;
  const preview: MergePreview<T> = {
    title: `${source.name} in ${target.name} zusammenführen?`,
    message: `${movesText(recipeCount, itemCount)}Das lässt sich nicht rückgängig machen.`,
    recipes: recipeCount,
    items: itemCount,
    merged,
    tooManySynonyms:
      synonyms.length > MAX_SYNONYMS ||
      totalLength(synonyms) > MAX_SYNONYMS_LENGTH ||
      totalLength(synonyms.map(normalizeText)) > MAX_SYNONYMS_LENGTH,
  };
  if (preview.tooManySynonyms) {
    preview.tooManySynonymsMessage = `Zu viele Synonyme – entferne zuerst welche bei ${target.name}`;
  }
  return preview;
}

/** "Zusammenführen mit …": the search over the other articles; the source is never a target. */
export function mergeTargets<T extends Article>(
  query: string,
  sourceId: Id,
  articles: readonly T[],
): SearchOrCreateMatch<T>[] {
  return matchSearchOrCreate(
    query,
    articles.filter((article) => article.id !== sourceId),
  ).matches;
}

export interface ArticleMergeEffect<T extends Article> {
  /** The target as it is afterwards (mergeArticlesPreview). */
  article: T;
  recipes: Recipe[];
  items: ShoppingItem[];
  /** The source's open item that joined the target's open item, if any (it is gone). */
  removedItemId?: Id;
}

/**
 * What "Zusammenführen" changes, as the server does it in merge_articles (E8): every ingredient of
 * the source points to the target (two rows in one recipe stay two, AC-039); when both are open on
 * the list, the source's contributions join the target's open item and the source's item goes;
 * every other item of the source belongs to the target. Unchanged recipes and items keep their
 * identity. The caller removes the source article.
 */
export function applyArticleMerge<T extends Article>(
  source: T,
  target: T,
  recipes: readonly Recipe[],
  items: readonly ShoppingItem[],
): ArticleMergeEffect<T> {
  const nextRecipes = recipes.map((recipe) =>
    recipe.ingredients.some((ingredient) => ingredient.articleId === source.id)
      ? {
          ...recipe,
          ingredients: recipe.ingredients.map((ingredient) =>
            ingredient.articleId === source.id
              ? { ...ingredient, articleId: target.id }
              : ingredient,
          ),
        }
      : recipe,
  );

  const sourceOpen = items.find((item) => item.articleId === source.id && !item.checked);
  const targetOpen = items.find((item) => item.articleId === target.id && !item.checked);
  const joined = sourceOpen && targetOpen ? sourceOpen : undefined;
  const nextItems = items.flatMap((item): ShoppingItem[] => {
    if (item === joined) return [];
    if (joined && item === targetOpen) {
      return [{ ...item, contributions: [...item.contributions, ...joined.contributions] }];
    }
    return item.articleId === source.id ? [{ ...item, articleId: target.id }] : [item];
  });

  const effect: ArticleMergeEffect<T> = {
    article: mergeArticlesPreview(source, target, recipes, items).merged,
    recipes: nextRecipes,
    items: nextItems,
  };
  if (joined) effect.removedItemId = joined.id;
  return effect;
}
