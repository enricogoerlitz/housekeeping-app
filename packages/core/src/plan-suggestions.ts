import { contentsInBook, dishFitsPreference, type RecipeBook } from './collections';
import { addDays, daysBetween, isoWeekday, startOfWeek, weekdayLong, weekdayShort } from './dates';
import { deriveRecipeDiet, dietFitsPreference, dietLabel, recipeDietChip } from './diet';
import { prepStart, slotStartTime } from './prep';
import { RARELY_COOKED_DAYS } from './recipe-list';
import { defaultVariantId, ingredientsForVariant } from './recipe-variants';
import { formatStars } from './ratings';
import { normalizeText } from './text';
import type {
  Article,
  Id,
  ISODate,
  MealPlanEntry,
  MealSlot,
  Member,
  Recipe,
  ShoppingItem,
  TimeOfDay,
} from './types';

// Planvorschläge (spec 0063): three recipes for one Tageszeit in the add window (A) and the
// Wochenkarte "Was kochen wir?" with its distribution over the free evenings (C). Pure and
// deterministic: computed on the device from the cache, never stored, without AI.

/** What a dish is mostly eaten with, derived from its ingredients; "other" never conflicts. */
export type DishBase = 'pasta' | 'rice' | 'potato' | 'bread' | 'pulses' | 'other';

export interface SuggestionInput {
  /** With the calendar as cooking history (withCookingHistory). */
  recipes: readonly Recipe[];
  /** The plan, "vorgemerkt" (date null) included. */
  entries: readonly MealPlanEntry[];
  members: readonly Member[];
  articlesById: Record<Id, Article>;
  book: RecipeBook;
  slots: readonly MealSlot[];
  today: ISODate;
  /** The household's time now, for the Vorlauf. */
  now: TimeOfDay;
  /** Part of the seed: two households see different suggestions. */
  householdId: Id;
}

/** A Tageszeit of a day to fill, with who eats then. */
export interface Evening {
  date: ISODate;
  slotId: Id;
  eaterIds: readonly Id[];
}

export interface PlanSuggestion {
  recipe: Recipe;
  /** The two strongest reasons: "Favorit von Nadja · zuletzt vor 8 Wochen". */
  reason: string;
  /** "35 Min · vegan", "25 Min · Tofu für Nadja", "… · Vorlauf: Linsen einweichen". */
  facts: string;
  /** Set when the dish is vorgemerkt: planning it moves that entry instead of adding one. */
  plannedLaterEntryId?: Id;
  /** The evenings it may stand on. */
  fits: ISODate[];
  base: DishBase;
  /** Never cooked. */
  isNew: boolean;
}

export interface SlotSuggestions {
  suggestions: PlanSuggestion[];
  /** "Andere": there are more than the three shown. */
  more: boolean;
  /** Nothing to go by yet (no history, rating or favourite): the one hint sentence shows. */
  fresh: boolean;
}

export interface WeekMenu {
  /** "Vorgemerkt", every fitting one. */
  planned: PlanSuggestion[];
  /** "Für euch ausgesucht", six per page. */
  picks: PlanSuggestion[];
  more: boolean;
  fresh: boolean;
}

export interface WeekAssignment {
  suggestion: PlanSuggestion;
  /** null = vormerken (or stays vorgemerkt). */
  date: ISODate | null;
}

/** REQ-005: at most this many in the add window, fewer → none. */
const SLOT_COUNT = 3;
/** REQ-009: dishes per page of the Wochenkarte. */
const MENU_PAGE = 6;
/** REQ-008: the Wochenkarte needs at least this many fitting dishes. */
const MIN_WEEK_MENU = 4;
const REPEAT_DAYS = 14;
const PLAN_WINDOW_DAYS = 7;
const LONG_MINUTES = 45;
/** Temperature of the weighted draw (Entscheidung 3). */
const TAU = 1.5;
/** "Am Vorabend" counts until then (Entscheidung 4). */
const EVENING_BEFORE: TimeOfDay = '20:00';
const MAX_PREP_HOURS = 168;
const FOOD_KINDS = new Set<MealPlanEntry['kind']>(['recipe', 'restaurant', 'text', 'leftovers']);

const EMPTY_SLOT: SlotSuggestions = { suggestions: [], more: false, fresh: false };
const EMPTY_MENU: WeekMenu = { planned: [], picks: [], more: false, fresh: false };

// ---------- Dish base ----------

/** First hit in this order within an article name: "Reisnudeln" are pasta, not rice. */
const BASE_WORDS: readonly (readonly [string, DishBase])[] = [
  ['reisnudel', 'pasta'],
  ['glasnudel', 'pasta'],
  ['reis', 'rice'],
  ['nudel', 'pasta'],
  ['spaghetti', 'pasta'],
  ['penne', 'pasta'],
  ['tagliatelle', 'pasta'],
  ['gnocchi', 'pasta'],
  ['spaetzle', 'pasta'],
  ['orzo', 'pasta'],
  ['lasagne', 'pasta'],
  ['kartoffel', 'potato'],
  ['brot', 'bread'],
  ['baguette', 'bread'],
  ['tortilla', 'bread'],
  ['wrap', 'bread'],
  ['teig', 'bread'],
  ['mehl', 'bread'],
  ['linsen', 'pulses'],
  ['kichererbse', 'pulses'],
  ['bohnen', 'pulses'],
];
/** Names that contain "reis" without being rice. */
const NOT_RICE = ['preisel', 'reisessig', 'reiswein'];

/**
 * The base of a dish from its ingredients' article names, first hit in ingredient order
 * (REQ-004, AC-014); a collection and a dish without a known base are "other".
 */
export function dishBase(recipe: Recipe, articlesById: Readonly<Record<Id, Article>>): DishBase {
  if (recipe.kind === 'collection') return 'other';
  for (const ingredient of recipe.ingredients) {
    const article = articlesById[ingredient.articleId];
    if (!article || article.diet === 'non_food') continue;
    const name = normalizeText(article.name);
    for (const [word, base] of BASE_WORDS) {
      if (!name.includes(word)) continue;
      if (base === 'rice' && NOT_RICE.some((other) => name.includes(other))) continue;
      return base;
    }
  }
  return 'other';
}

// ---------- Hard rules (REQ-001) ----------

/** "Pilze" → "pilz", "Tomaten" → "tomat": a dislike also hits the singular and compounds. */
function dislikeStem(dislike: string): string {
  const word = normalizeText(dislike);
  return /^(.{4,}?)(en|n|e|s)$/.exec(word)?.[1] ?? word;
}

function hitsDislike(dislike: string, texts: readonly string[]): boolean {
  const stem = dislikeStem(dislike);
  if (stem === '') return false;
  const whole = normalizeText(dislike);
  // Short words only as a whole word, so "Ei" never hits "Reis".
  if (stem.length < 4) {
    return texts.some((text) =>
      text.split(/[ -]+/).some((word) => word === stem || word === whole),
    );
  }
  return texts.some((text) => text.includes(stem));
}

interface Context {
  input: SuggestionInput;
  membersById: Map<Id, Member>;
  /** Vorgemerkt recipe id → its first entry. */
  later: Map<Id, Id>;
  /** Recipe id → the days it is planned on (also inside a planned collection). */
  plannedDays: Map<Id, ISODate[]>;
  firstSlotId: Id | undefined;
  slotNames: Map<Id, string>;
}

function contextOf(input: SuggestionInput): Context {
  const later = new Map<Id, Id>();
  const parked = input.entries
    .filter((entry) => entry.date === null && entry.kind === 'recipe' && entry.recipeId)
    .sort((a, b) => a.sort - b.sort || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const entry of parked) {
    if (entry.recipeId && !later.has(entry.recipeId)) later.set(entry.recipeId, entry.id);
  }
  const plannedDays = new Map<Id, ISODate[]>();
  const plan = (recipeId: Id, date: ISODate) =>
    plannedDays.set(recipeId, [...(plannedDays.get(recipeId) ?? []), date]);
  for (const entry of input.entries) {
    if (entry.date === null || entry.kind !== 'recipe' || !entry.recipeId || entry.notDone) {
      continue;
    }
    plan(entry.recipeId, entry.date);
    for (const row of input.book.collectionRecipes) {
      if (row.collectionId === entry.recipeId) plan(row.recipeId, entry.date);
    }
  }
  const ordered = [...input.slots].sort((a, b) => a.sort - b.sort);
  return {
    input,
    membersById: new Map(input.members.map((member) => [member.id, member])),
    later,
    plannedDays,
    // With a single Tageszeit there is no breakfast slot.
    firstSlotId: ordered.length > 1 ? ordered[0]?.id : undefined,
    slotNames: new Map(input.slots.map((slot) => [slot.id, slot.name])),
  };
}

function eatersOf(ctx: Context, eaterIds: readonly Id[]): Member[] {
  return eaterIds.flatMap((id) => {
    const member = ctx.membersById.get(id);
    return member ? [member] : [];
  });
}

/** Title and the names and synonyms of the articles a variant uses, normalised. */
function dishTexts(recipe: Recipe, variantId: Id | undefined, ctx: Context): string[] {
  const { articlesById, book } = ctx.input;
  const ingredients =
    recipe.kind === 'collection'
      ? [
          ...recipe.ingredients,
          ...contentsInBook(recipe, book).flatMap((content) =>
            ingredientsForVariant(content.recipe, content.variantId),
          ),
        ]
      : ingredientsForVariant(recipe, variantId);
  const texts = [recipe.title];
  for (const ingredient of ingredients) {
    const article = articlesById[ingredient.articleId];
    if (article) texts.push(article.name, ...article.synonyms);
  }
  return texts.map(normalizeText);
}

/** A variant (or the base) this member can eat: fitting diet, none of the dislikes. */
function fittingVariant(
  recipe: Recipe,
  member: Member,
  ctx: Context,
): { variantId: Id | undefined } | undefined {
  const free = (variantId: Id | undefined) =>
    !member.dislikes.some((dislike) => hitsDislike(dislike, dishTexts(recipe, variantId, ctx)));
  if (recipe.kind === 'collection') {
    const { articlesById, book } = ctx.input;
    return dishFitsPreference(recipe, member.dietPreference, articlesById, book) && free(undefined)
      ? { variantId: undefined }
      : undefined;
  }
  const options =
    recipe.variants.length === 0
      ? [undefined]
      : [defaultVariantId(recipe), ...recipe.variants.map((variant) => variant.id)];
  for (const variantId of options) {
    const diet = deriveRecipeDiet(recipe, variantId, ctx.input.articlesById);
    if (dietFitsPreference(diet, member.dietPreference) && free(variantId)) return { variantId };
  }
  return undefined;
}

function hasFood(recipe: Recipe, book: RecipeBook): boolean {
  if (recipe.kind === 'collection') {
    return recipe.ingredients.length > 0 || contentsInBook(recipe, book).length > 0;
  }
  return recipe.ingredients.length > 0;
}

/** Whether the Vorlauf can still start in time (Entscheidung 4). */
function prepFeasible(recipe: Recipe, evening: Evening, ctx: Context): boolean {
  const hours = recipe.leadTime?.hoursBefore;
  if (hours === undefined || !Number.isInteger(hours) || hours < 1 || hours > MAX_PREP_HOURS) {
    return true;
  }
  const slotName = ctx.slotNames.get(evening.slotId) ?? '';
  const start = prepStart(evening.date, slotStartTime(slotName), hours);
  const { today, now } = ctx.input;
  return start.day > today || (start.day === today && (start.at ?? EVENING_BEFORE) > now);
}

/** Every hard rule of REQ-001 for one evening. */
function fitsEvening(recipe: Recipe, evening: Evening, eaters: Member[], ctx: Context): boolean {
  const { today } = ctx.input;
  const later = ctx.later.has(recipe.id);
  const breakfast = evening.slotId === ctx.firstSlotId;
  if (recipe.kind === 'collection') {
    if (!later || breakfast) return false;
  } else if (recipe.course !== (breakfast ? 'breakfast' : 'main')) {
    return false;
  }
  if (!hasFood(recipe, ctx.input.book)) return false;
  if (eaters.some((member) => (recipe.ratings[member.id] ?? 5) <= 2)) return false;
  if (recipe.lastCookedOn !== undefined && daysBetween(recipe.lastCookedOn, today) < REPEAT_DAYS) {
    return false;
  }
  const days = ctx.plannedDays.get(recipe.id) ?? [];
  if (days.some((day) => Math.abs(daysBetween(day, evening.date)) <= PLAN_WINDOW_DAYS)) {
    return false;
  }
  if (!prepFeasible(recipe, evening, ctx)) return false;
  return eaters.every((member) => fittingVariant(recipe, member, ctx) !== undefined);
}

// ---------- Reasons and facts (REQ-002) ----------

interface Part {
  points: number;
  text?: string;
}

function names(members: readonly Member[]): string {
  const list = members.map((member) => member.name);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} und ${list[list.length - 1] ?? ''}`;
}

function lastCookedText(days: number): string {
  if (days >= 60) return `zuletzt vor ${Math.floor(days / 30)} Monaten`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? 'zuletzt vor 1 Woche' : `zuletzt vor ${weeks} Wochen`;
}

function isNew(recipe: Recipe): boolean {
  return recipe.cookedCount === 0 && recipe.lastCookedOn === undefined;
}

/** The scored parts (Entscheidung 3); a part with text can be a reason. */
function partsOf(recipe: Recipe, eaters: Member[], ctx: Context, date?: ISODate): Part[] {
  const parts: Part[] = [];
  if (ctx.later.has(recipe.id)) parts.push({ points: 100, text: 'Vorgemerkt' });
  const fans = eaters.filter((member) => recipe.favoriteOf.includes(member.id));
  if (fans.length > 0) {
    const all = fans.length === eaters.length && eaters.length >= 2;
    parts.push({
      points: 3 * fans.length,
      text: all ? 'Euer Favorit' : `Favorit von ${names(fans)}`,
    });
  }
  const rated = eaters.flatMap((member) => {
    const rating = recipe.ratings[member.id];
    return rating === undefined ? [] : [rating];
  });
  if (rated.length > 0) {
    const average = rated.reduce((sum, rating) => sum + rating, 0) / rated.length;
    const shown = Math.round(average * 2) / 2;
    const everyone = rated.length === eaters.length && eaters.length >= 2;
    const by = everyone ? (eaters.length === 2 ? ' von beiden' : ' von allen') : '';
    parts.push({
      points: (average - 3) * 2,
      text: shown >= 4 ? `${formatStars(shown)} ★${by}` : undefined,
    });
  }
  if (recipe.lastCookedOn !== undefined) {
    const days = daysBetween(recipe.lastCookedOn, ctx.input.today);
    parts.push({
      points: days >= RARELY_COOKED_DAYS ? Math.min(days, 90) / 30 : 0,
      text: lastCookedText(days),
    });
  }
  if (isNew(recipe)) parts.push({ points: 1, text: 'Noch nie gekocht' });
  if (date !== undefined && recipe.kind === 'recipe') {
    const weekday = isoWeekday(date) <= 5;
    const minutes = recipe.totalMinutes;
    if (weekday && minutes === undefined) parts.push({ points: -0.5 });
    else if (weekday && minutes !== undefined && minutes > LONG_MINUTES) parts.push({ points: -2 });
    else if (!weekday && minutes !== undefined && minutes > LONG_MINUTES) {
      parts.push({ points: 0.5, text: 'am Wochenende' });
    }
  }
  return parts;
}

function reasonOf(parts: readonly Part[]): string[] {
  return parts
    .filter((part) => part.text !== undefined)
    .sort((a, b) => b.points - a.points)
    .slice(0, 2)
    .map((part) => part.text ?? '');
}

function factsOf(recipe: Recipe, eaters: Member[], ctx: Context): string {
  const facts: string[] = [];
  if (recipe.totalMinutes !== undefined) facts.push(`${recipe.totalMinutes} Min`);
  const standard = defaultVariantId(recipe);
  let variantLine: string | undefined;
  if (recipe.kind === 'recipe' && recipe.variants.length > 0) {
    for (const member of eaters) {
      const variantId = fittingVariant(recipe, member, ctx)?.variantId;
      if (variantId === undefined || variantId === standard) continue;
      const name = recipe.variants.find((variant) => variant.id === variantId)?.name;
      if (name) {
        variantLine = `${name} für ${member.name}`;
        break;
      }
    }
  }
  if (variantLine) facts.push(variantLine);
  else if (recipe.kind === 'recipe') {
    const diet = recipeDietChip(recipe, undefined, ctx.input.articlesById);
    if (diet !== undefined && diet !== 'unknown') facts.push(dietLabel(diet));
  }
  if (recipe.leadTime?.text) facts.push(`Vorlauf: ${recipe.leadTime.text}`);
  return facts.join(' · ');
}

function hasHistory(recipe: Recipe, eaters: Member[]): boolean {
  return (
    !isNew(recipe) ||
    eaters.some(
      (member) => recipe.favoriteOf.includes(member.id) || recipe.ratings[member.id] !== undefined,
    )
  );
}

// ---------- Deterministic draw (REQ-003) ----------

/** FNV-1a, 32 bit. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

/** A Gumbel sample from the text: the same text always gives the same number. */
function gumbel(text: string): number {
  const uniform = (hash(text) + 0.5) / 4294967296;
  return -Math.log(-Math.log(uniform));
}

interface Candidate {
  recipe: Recipe;
  key: number;
  base: DishBase;
  isNew: boolean;
  later: boolean;
  reasons: string[];
  fits: ISODate[];
}

/** By key, highest first; equal keys by id, so the input order never matters. */
function byKey(a: Candidate, b: Candidate): number {
  return b.key - a.key || (a.recipe.id < b.recipe.id ? -1 : a.recipe.id > b.recipe.id ? 1 : 0);
}

// ---------- Variety (REQ-004) ----------

interface Limits {
  perBase: number;
  perCuisine?: number;
  newMax: number;
}

/** The soft limits are relaxed one after the other: cuisine, base, new (base kept as long as possible). */
const RELAX_STEPS: readonly { base: boolean; cuisine: boolean; fresh: boolean }[] = [
  { base: true, cuisine: true, fresh: true },
  { base: true, cuisine: false, fresh: true },
  { base: false, cuisine: false, fresh: true },
  { base: true, cuisine: false, fresh: false },
  { base: false, cuisine: false, fresh: false },
];

function cuisineKeyOf(recipe: Recipe): string | undefined {
  const key = recipe.cuisine === undefined ? '' : normalizeText(recipe.cuisine);
  return key === '' ? undefined : key;
}

function pickVaried(sorted: readonly Candidate[], count: number, limits: Limits): Candidate[] {
  const chosen: Candidate[] = [];
  const allowed = (candidate: Candidate, step: (typeof RELAX_STEPS)[number]): boolean => {
    if (candidate.later) return true;
    const others = chosen.filter((other) => !other.later);
    if (
      step.base &&
      candidate.base !== 'other' &&
      chosen.filter((other) => other.base === candidate.base).length >= limits.perBase
    ) {
      return false;
    }
    const cuisine = cuisineKeyOf(candidate.recipe);
    if (
      step.cuisine &&
      limits.perCuisine !== undefined &&
      cuisine !== undefined &&
      chosen.filter((other) => cuisineKeyOf(other.recipe) === cuisine).length >= limits.perCuisine
    ) {
      return false;
    }
    if (
      step.fresh &&
      candidate.isNew &&
      others.filter((other) => other.isNew).length >= limits.newMax
    ) {
      return false;
    }
    return true;
  };
  for (const step of RELAX_STEPS) {
    for (const candidate of sorted) {
      if (chosen.length >= count) break;
      if (!chosen.includes(candidate) && allowed(candidate, step)) chosen.push(candidate);
    }
    if (chosen.length >= count) break;
  }
  return [...chosen].sort(byKey);
}

function toSuggestion(candidate: Candidate, ctx: Context, eaters: Member[]): PlanSuggestion {
  const laterId = ctx.later.get(candidate.recipe.id);
  return {
    recipe: candidate.recipe,
    reason: candidate.reasons.join(' · '),
    facts: factsOf(candidate.recipe, eaters, ctx),
    ...(laterId === undefined ? {} : { plannedLaterEntryId: laterId }),
    fits: candidate.fits,
    base: candidate.base,
    isNew: candidate.isNew,
  };
}

/** The dishes a Tageszeit may be offered: recipes, and vorgemerkt collections. */
function offered(ctx: Context): Recipe[] {
  return ctx.input.recipes.filter((recipe) => recipe.kind === 'recipe' || ctx.later.has(recipe.id));
}

// ---------- A: one Tageszeit ----------

/**
 * Up to three Planvorschläge for one Tageszeit (REQ-001 to REQ-007): vorgemerkt first, then by a
 * weighted draw seeded with household, week, Tageszeit and round. `shown` are the ids already
 * seen in this window ("Andere"); once fewer than three are left they may come again. Fewer than
 * three fitting dishes, or a day in the past, give none.
 */
export function slotSuggestions(
  input: SuggestionInput,
  target: Evening,
  options: { round?: number; shown?: readonly Id[] } = {},
): SlotSuggestions {
  if (target.date < input.today) return EMPTY_SLOT;
  const ctx = contextOf(input);
  const eaters = eatersOf(ctx, target.eaterIds);
  const seed = `${input.householdId}|${startOfWeek(target.date)}|${target.slotId}|${options.round ?? 0}`;
  const candidates = offered(ctx)
    .filter((recipe) => fitsEvening(recipe, target, eaters, ctx))
    .map((recipe): Candidate => {
      const parts = partsOf(recipe, eaters, ctx, target.date);
      const score = parts.reduce((sum, part) => sum + part.points, 0);
      return {
        recipe,
        key: score / TAU + gumbel(`${seed}|${recipe.id}`),
        base: dishBase(recipe, input.articlesById),
        isNew: isNew(recipe),
        later: ctx.later.has(recipe.id),
        reasons: reasonOf(parts),
        fits: [target.date],
      };
    })
    .sort(byKey);
  if (candidates.length < SLOT_COUNT) return EMPTY_SLOT;
  const shown = new Set(options.shown ?? []);
  const unseen = candidates.filter((candidate) => !shown.has(candidate.recipe.id));
  const pool = unseen.length >= SLOT_COUNT ? unseen : candidates;
  const chosen = pickVaried(pool, SLOT_COUNT, { perBase: 1, newMax: 1 });
  return {
    suggestions: chosen.map((candidate) => toSuggestion(candidate, ctx, eaters)),
    more: candidates.length > SLOT_COUNT,
    fresh: !candidates.some((candidate) => hasHistory(candidate.recipe, eaters)),
  };
}

/**
 * "Vorschläge für Donnerstagabend", "… fürs Frühstück" in the first Tageszeit, "… für
 * Donnerstag, Spät am Abend" for a Tageszeit of several words.
 */
export function suggestionsHeading(date: ISODate, slotId: Id, slots: readonly MealSlot[]): string {
  const ordered = [...slots].sort((a, b) => a.sort - b.sort);
  if (ordered.length > 1 && ordered[0]?.id === slotId) return 'Vorschläge fürs Frühstück';
  const name = slots.find((slot) => slot.id === slotId)?.name.trim() ?? '';
  const day = weekdayLong(date);
  if (name === '') return `Vorschläge für ${day}`;
  return /\s/.test(name)
    ? `Vorschläge für ${day}, ${name}`
    : `Vorschläge für ${day}${name.toLowerCase()}`;
}

// ---------- C: the week ----------

/**
 * The free evenings of a week from today on (REQ-008): no recipe, restaurant, free text or
 * leftovers in that Tageszeit; activities do not count.
 */
export function freeEvenings(
  entries: readonly MealPlanEntry[],
  week: readonly ISODate[],
  slotId: Id,
  today: ISODate,
): ISODate[] {
  return week.filter(
    (date) =>
      date >= today &&
      !entries.some(
        (entry) => entry.date === date && entry.slotId === slotId && FOOD_KINDS.has(entry.kind),
      ),
  );
}

/**
 * The Wochenkarte (REQ-009): every fitting vorgemerkt dish, then `pages` × six picks mixed by
 * base, cuisine and "Noch nie gekocht" (at most 2 each). A dish fitting only some evenings says
 * so ("nur Fr/So"). Fewer than four fitting dishes give an empty menu.
 */
export function weekMenu(
  input: SuggestionInput,
  evenings: readonly Evening[],
  pages = 1,
): WeekMenu {
  const first = evenings[0];
  if (first === undefined) return EMPTY_MENU;
  const ctx = contextOf(input);
  const eaterIds = [...new Set(evenings.flatMap((evening) => evening.eaterIds))];
  const eaters = eatersOf(ctx, eaterIds);
  const seed = `${input.householdId}|${startOfWeek(first.date)}|${first.slotId}|menu`;
  const candidates = offered(ctx)
    .flatMap((recipe): Candidate[] => {
      const fits = evenings
        .filter((evening) => fitsEvening(recipe, evening, eatersOf(ctx, evening.eaterIds), ctx))
        .map((evening) => evening.date);
      if (fits.length === 0) return [];
      const parts = partsOf(recipe, eaters, ctx);
      const score = parts.reduce((sum, part) => sum + part.points, 0);
      const only = fits.length < evenings.length ? [`nur ${fits.map(weekdayShort).join('/')}`] : [];
      return [
        {
          recipe,
          key: score / TAU + gumbel(`${seed}|${recipe.id}`),
          base: dishBase(recipe, input.articlesById),
          isNew: isNew(recipe),
          later: ctx.later.has(recipe.id),
          reasons: [...reasonOf(parts), ...only],
          fits,
        },
      ];
    })
    .sort(byKey);
  if (candidates.length < MIN_WEEK_MENU) return EMPTY_MENU;
  let rest = candidates.filter((candidate) => !candidate.later);
  const picks: Candidate[] = [];
  for (let page = 0; page < pages && rest.length > 0; page += 1) {
    const chosen = pickVaried(rest, MENU_PAGE, { perBase: 2, perCuisine: 2, newMax: 2 });
    picks.push(...chosen);
    rest = rest.filter((candidate) => !chosen.includes(candidate));
  }
  const suggest = (candidate: Candidate) => toSuggestion(candidate, ctx, eaters);
  return {
    planned: candidates.filter((candidate) => candidate.later).map(suggest),
    picks: picks.map(suggest),
    more: rest.length > 0,
    fresh: !candidates.some((candidate) => hasHistory(candidate.recipe, eaters)),
  };
}

const ADJACENT_SAME_BASE = 5;
const LONG_ON_WEEKDAY = 2;
const LATER_PER_DAY = 0.5;
const SKIPPED_EVENING = 1;
const UNPLACED = 100;

function compareIds(a: PlanSuggestion, b: PlanSuggestion): number {
  return a.recipe.id < b.recipe.id ? -1 : a.recipe.id > b.recipe.id ? 1 : 0;
}

/**
 * Where the chosen dishes go (REQ-010): every injective assignment to the free evenings is tried
 * and the cheapest wins — only where a dish fits; same base on neighbouring evenings (also next to
 * an existing entry) +5; over 45 minutes on a weekday +2; vorgemerkt +0.5 per day later; an
 * earlier evening left free +1; equal costs by date, then recipe id. `pinned` ("Verteilung
 * ändern") puts a dish on an evening or on vormerken. More dishes than evenings: the rest is
 * vorgemerkt. Sorted by date, vormerken last.
 */
export function distributeWeek(
  input: SuggestionInput,
  chosen: readonly PlanSuggestion[],
  evenings: readonly Evening[],
  pinned: Readonly<Record<Id, ISODate | null>> = {},
): WeekAssignment[] {
  if (chosen.length === 0) return [];
  const dates = [...new Set(evenings.map((evening) => evening.date))].sort();
  const slotId = evenings[0]?.slotId;
  const ordered = [...chosen].sort(
    (a, b) =>
      Number(b.plannedLaterEntryId !== undefined) - Number(a.plannedLaterEntryId !== undefined) ||
      compareIds(a, b),
  );
  const result = new Map<Id, ISODate | null>();
  const taken = new Set<ISODate>();
  for (const pick of ordered) {
    const pin = pinned[pick.recipe.id];
    if (pin === null) result.set(pick.recipe.id, null);
    else if (pin !== undefined && dates.includes(pin) && !taken.has(pin)) {
      result.set(pick.recipe.id, pin);
      taken.add(pin);
    }
  }

  // Bases next door: existing dishes in the same Tageszeit, and pinned ones.
  const neighbours = new Map<ISODate, DishBase[]>();
  const addNeighbour = (date: ISODate, base: DishBase) => {
    if (base !== 'other') neighbours.set(date, [...(neighbours.get(date) ?? []), base]);
  };
  for (const entry of input.entries) {
    if (entry.date === null || entry.slotId !== slotId || entry.kind !== 'recipe') continue;
    const recipe = entry.recipeId ? input.book.recipesById[entry.recipeId] : undefined;
    if (recipe) addNeighbour(entry.date, dishBase(recipe, input.articlesById));
  }
  for (const pick of ordered) {
    const date = result.get(pick.recipe.id);
    if (date) addNeighbour(date, pick.base);
  }

  const open = dates.filter((date) => !taken.has(date));
  const loose = ordered.filter((pick) => !result.has(pick.recipe.id));
  const searched = loose.slice(0, open.length);
  const overflow = loose.slice(open.length);

  const placeCost = (pick: PlanSuggestion, index: number, assigned: (number | null)[]): number => {
    const date = open[index] ?? '';
    let cost = 0;
    const minutes = pick.recipe.totalMinutes;
    if (minutes !== undefined && minutes > LONG_MINUTES && isoWeekday(date) <= 5) {
      cost += LONG_ON_WEEKDAY;
    }
    if (pick.plannedLaterEntryId !== undefined && dates[0] !== undefined) {
      cost += LATER_PER_DAY * daysBetween(dates[0], date);
    }
    if (pick.base !== 'other') {
      const before = index > 0 ? open[index - 1] : undefined;
      const previous = index > 0 ? assigned[index - 1] : null;
      if (
        before !== undefined &&
        daysBetween(before, date) === 1 &&
        previous !== null &&
        previous !== undefined &&
        searched[previous]?.base === pick.base
      ) {
        cost += ADJACENT_SAME_BASE;
      }
      for (const near of [-1, 1]) {
        if ((neighbours.get(addDays(date, near)) ?? []).includes(pick.base)) {
          cost += ADJACENT_SAME_BASE;
        }
      }
    }
    return cost;
  };

  let best: { cost: number; assigned: (number | null)[] } | undefined;
  const assigned: (number | null)[] = [];
  const used = new Set<number>();
  const search = (index: number, cost: number) => {
    if (best !== undefined && cost >= best.cost) return;
    if (index === open.length) {
      const lastFilled = assigned.reduce<number>(
        (last, value, at) => (value === null ? last : at),
        -1,
      );
      const skipped = assigned.filter((value, at) => value === null && at < lastFilled).length;
      const total = cost + SKIPPED_EVENING * skipped + UNPLACED * (searched.length - used.size);
      if (best === undefined || total < best.cost) best = { cost: total, assigned: [...assigned] };
      return;
    }
    const date = open[index] ?? '';
    for (let pickIndex = 0; pickIndex < searched.length; pickIndex += 1) {
      const pick = searched[pickIndex];
      if (pick === undefined || used.has(pickIndex) || !pick.fits.includes(date)) continue;
      used.add(pickIndex);
      assigned.push(pickIndex);
      search(index + 1, cost + placeCost(pick, index, assigned));
      assigned.pop();
      used.delete(pickIndex);
    }
    assigned.push(null);
    search(index + 1, cost);
    assigned.pop();
  };
  search(0, 0);

  const filled = new Set<ISODate>();
  best?.assigned.forEach((pickIndex, index) => {
    const pick = pickIndex === null ? undefined : searched[pickIndex];
    const date = open[index];
    if (pick && date) {
      result.set(pick.recipe.id, date);
      filled.add(date);
    }
  });
  // Dishes beyond the evenings: an evening left free that fits, else vormerken.
  for (const pick of [...searched, ...overflow]) {
    if (result.has(pick.recipe.id)) continue;
    const date = open.find((day) => !filled.has(day) && pick.fits.includes(day));
    if (date) filled.add(date);
    result.set(pick.recipe.id, date ?? null);
  }

  return ordered
    .map((suggestion) => ({ suggestion, date: result.get(suggestion.recipe.id) ?? null }))
    .sort(
      (a, b) =>
        (a.date ?? '9999').localeCompare(b.date ?? '9999') ||
        compareIds(a.suggestion, b.suggestion),
    );
}

function counts(assignments: readonly WeekAssignment[]): { planned: number; later: number } {
  return {
    planned: assignments.filter((row) => row.date !== null).length,
    // A dish already vorgemerkt that stays so is not "vormerken" again.
    later: assignments.filter((row) => row.date === null && !row.suggestion.plannedLaterEntryId)
      .length,
  };
}

const evenings = (count: number) => `${count} ${count === 1 ? 'Abend' : 'Abende'}`;

/** The button: "4 Abende einplanen · 1 vormerken"; "Einplanen" with nothing chosen. */
export function weekPlanLabel(assignments: readonly WeekAssignment[]): string {
  const { planned, later } = counts(assignments);
  const parts = [
    ...(planned > 0 ? [`${evenings(planned)} einplanen`] : []),
    ...(later > 0 ? [`${later} vormerken`] : []),
  ];
  return parts.length === 0 ? 'Einplanen' : parts.join(' · ');
}

/** The hint after saving: "4 Abende eingeplant · 1 vorgemerkt". */
export function weekPlannedNotice(assignments: readonly WeekAssignment[]): string {
  const { planned, later } = counts(assignments);
  return [
    ...(planned > 0 ? [`${evenings(planned)} eingeplant`] : []),
    ...(later > 0 ? [`${later} vorgemerkt`] : []),
  ].join(' · ');
}

/** The line above the week: "5 Abende frei". */
export function weekLineLabel(free: number): string {
  return `${evenings(free)} frei`;
}

/** After planning: "4 Gerichte nicht auf der Liste". */
export function weekListLabel(count: number): string {
  return `${count} ${count === 1 ? 'Gericht' : 'Gerichte'} nicht auf der Liste`;
}

/** The entries of which no ingredient stands on the list, open or checked (REQ-011). */
export function entriesNotOnList(items: readonly ShoppingItem[], entryIds: readonly Id[]): Id[] {
  const onList = new Set<Id>();
  for (const item of items) {
    for (const contribution of item.contributions) {
      const { source } = contribution;
      if (source.kind === 'recipe' && source.entryId !== undefined) onList.add(source.entryId);
    }
  }
  return entryIds.filter((id) => !onList.has(id));
}

/**
 * When the Vorlauf of a dish on that day starts, for the bar of "Was kochen wir?": "Vorlauf Mi
 * abends", "Vorlauf Do ab 13 Uhr"; undefined without a Vorlauf.
 */
export function assignmentPrepNote(
  recipe: Recipe,
  date: ISODate,
  slotName: string,
): string | undefined {
  const hours = recipe.leadTime?.hoursBefore;
  if (hours === undefined || !Number.isInteger(hours) || hours < 1 || hours > MAX_PREP_HOURS) {
    return undefined;
  }
  const start = prepStart(date, slotStartTime(slotName), hours);
  const day = weekdayShort(start.day);
  if (start.at === undefined) return `Vorlauf ${day} abends`;
  const [hour = '0', minutes = '00'] = start.at.split(':');
  const time = minutes === '00' ? `${Number(hour)}` : `${Number(hour)}:${minutes}`;
  return `Vorlauf ${day} ab ${time} Uhr`;
}
