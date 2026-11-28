// Generated from packages/core/src/agent-tools.ts by `pnpm gen:edge` — do not edit.
import { z } from 'zod';

// Spec 0067 "Housekeeping-Agent", REQ-007/REQ-008: the read tools of the household agent. The
// edge function `ai-agent` reads the household's rows as the person (her JWT, RLS; the household
// id only from the chat, never from the model) with the fixed tables and columns of `toolReads`
// and hands them to `runTool`. The model's arguments are untrusted: every field, sort and filter is
// on an allow-list, every value is only compared in code, never put into a query (AC-015).
// Copied into the edge functions by `pnpm gen:edge`, so it imports nothing but zod. A few rules of
// the app are repeated here for that reason (cooking history, visits, diet, series Termine); the
// tests compare them with the app's own functions.

export const AGENT_TOOL_NAMES = [
  'list_recipes',
  'list_restaurants',
  'list_activities',
  'calendar',
  'shopping_list',
  'list_recurring_items',
  'list_chores',
  'list_trips',
  'list_articles',
  'household_values',
] as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export const AGENT_TOOL_LIMITS = {
  /** A small page unless the model asks for more (REQ-007). */
  defaultLimit: 10,
  calendarLimit: 60,
  /** "Mehrere hundert auf Wunsch". */
  maxLimit: 300,
  /** Values of one column in `household_values`. */
  maxValues: 3000,
  /** Characters of one tool output; longer pages are cut and say so. */
  outputChars: 60_000,
  /** Days of one calendar range. */
  calendarDays: 62,
  query: 100,
} as const;

export const TOOL_TABLES = [
  'recipes',
  'recipe_ratings',
  'recipe_favorites',
  'collection_recipes',
  'restaurants',
  'restaurant_ratings',
  'restaurant_favorites',
  'activities',
  'activity_kinds',
  'activity_ratings',
  'activity_favorites',
  'activity_series',
  'activity_series_exceptions',
  'meal_plan_entries',
  'trips',
  'trip_members',
  'shopping_items',
  'shopping_contributions',
  'recurring_items',
  'chores',
  'articles',
  'areas',
] as const;
export type ToolTable = (typeof TOOL_TABLES)[number];

export type ToolRow = Record<string, unknown>;

/** What the edge function read for one call, plus the household's members, slots and day. */
export interface ToolData {
  rows: Partial<Record<ToolTable, readonly ToolRow[]>>;
  /** The household's day (households.timezone, AC-025). */
  today: string;
  members: readonly { id: string; name: string }[];
  mealSlots: readonly { id: string; name: string; sort: number }[];
}

/** One read of the edge function: a fixed table and columns, filters with checked values only. */
export interface ToolRead {
  table: ToolTable;
  columns: string;
  filters: { op: 'eq' | 'gte' | 'lte'; column: string; value: string }[];
}

/** The step row of a call (REQ-008), in the shape of core ai-agent `AgentStep`. */
export interface ToolStep {
  id: string;
  kind: 'tool';
  label: string;
  detail?: string;
  details: string[];
  count?: number;
  countLabel?: string;
  status: 'done';
}

// ---------- Parameters: one table gives the zod schema and Foundry's JSON schema ----------

type Param =
  | { type: 'string'; description: string; max?: number }
  | { type: 'integer'; description: string; min: number; max: number }
  | { type: 'boolean'; description: string }
  | { type: 'date'; description: string }
  | { type: 'enum'; description: string; values: readonly string[] }
  | { type: 'enumArray'; description: string; values: readonly string[] }
  | { type: 'stringArray'; description: string };

const CONTROLS = /[\u0000-\u001f\u007f-\u009f]+/g;
const oneLine = (value: string) => value.replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function zodOf(param: Param): z.ZodType<unknown> {
  switch (param.type) {
    case 'string':
      return z.string().transform((value) => oneLine(value).slice(0, param.max ?? 100));
    case 'integer':
      // Out of range is clamped, not refused: "alle" means the largest page.
      return z
        .number()
        .int()
        .transform((value) => Math.min(param.max, Math.max(param.min, value)));
    case 'boolean':
      return z.boolean();
    case 'date':
      return z.string().refine(isIsoDate);
    case 'enum':
      return z.enum(param.values as [string, ...string[]]);
    case 'enumArray':
      return z.array(z.enum(param.values as [string, ...string[]])).max(param.values.length);
    case 'stringArray':
      return z.array(z.string().transform((value) => oneLine(value).slice(0, 60))).max(20);
  }
}

function jsonOf(param: Param): Record<string, unknown> {
  switch (param.type) {
    case 'string':
      return { type: ['string', 'null'], description: param.description };
    case 'integer':
      return {
        type: ['integer', 'null'],
        description: param.description,
        minimum: param.min,
        maximum: param.max,
      };
    case 'boolean':
      return { type: ['boolean', 'null'], description: param.description };
    case 'date':
      return { type: ['string', 'null'], description: `${param.description} (JJJJ-MM-TT)` };
    case 'enum':
      return {
        type: ['string', 'null'],
        enum: [...param.values, null],
        description: param.description,
      };
    case 'enumArray':
      return {
        type: ['array', 'null'],
        items: { type: 'string', enum: [...param.values] },
        description: param.description,
      };
    case 'stringArray':
      return { type: ['array', 'null'], items: { type: 'string' }, description: param.description };
  }
}

/** Foundry's strict mode: every key required, null for "not set". */
function schemas(params: Record<string, Param>) {
  const shape: Record<string, z.ZodType<unknown>> = {};
  const properties: Record<string, unknown> = {};
  for (const [key, param] of Object.entries(params)) {
    shape[key] = zodOf(param).nullable().optional();
    properties[key] = jsonOf(param);
  }
  return {
    zod: z.strictObject(shape),
    json: {
      type: 'object' as const,
      additionalProperties: false as const,
      required: Object.keys(params),
      properties,
    },
  };
}

type Args = Record<string, unknown>;

// ---------- Small readers of untyped rows ----------

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const strings = (value: unknown): string[] =>
  list(value).filter((entry): entry is string => typeof entry === 'string');
const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const fold = (value: string) =>
  value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
const contains = (haystack: readonly (string | undefined)[], needle: string) => {
  const wanted = fold(needle);
  return haystack.some((value) => value !== undefined && fold(value).includes(wanted));
};
const quoted = (value: string) => `„${value}“`;

function namesOf(ids: readonly string[], data: ToolData): string[] {
  return ids.flatMap((memberId) => {
    const member = data.members.find((entry) => entry.id === memberId);
    return member ? [member.name] : [];
  });
}

function averageStars(rows: readonly ToolRow[], key: string, id: string): number | null {
  const stars = rows
    .filter((row) => row[key] === id)
    .flatMap((row) => {
      const value = num(row.stars);
      return value === undefined ? [] : [value];
    });
  if (stars.length === 0) return null;
  return Math.round((stars.reduce((sum, value) => sum + value, 0) / stars.length) * 10) / 10;
}

function favoritesOf(rows: readonly ToolRow[], key: string, id: string, data: ToolData): string[] {
  return namesOf(
    rows.filter((row) => row[key] === id).flatMap((row) => str(row.member_id) ?? []),
    data,
  ).sort((a, b) => a.localeCompare(b, 'de'));
}

/** Plan entries of `kind` up to today that were done (core visitsOf, cookingHistory). */
function doneEntries(data: ToolData, kind: string): ToolRow[] {
  return (data.rows.meal_plan_entries ?? []).filter((row) => {
    const date = str(row.date);
    return row.kind === kind && date !== undefined && date <= data.today && row.not_done !== true;
  });
}

function visits(entries: readonly ToolRow[], key: string, id: string) {
  const dates = entries.flatMap((row) => (row[key] === id ? [String(row.date)] : []));
  dates.sort();
  return { count: dates.length, last: dates[dates.length - 1] ?? null };
}

// ---------- Dates ----------

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = [
  'Jan.',
  'Feb.',
  'März',
  'Apr.',
  'Mai',
  'Juni',
  'Juli',
  'Aug.',
  'Sept.',
  'Okt.',
  'Nov.',
  'Dez.',
];
const utc = (date: string) => new Date(`${date}T12:00:00Z`);
const addDays = (date: string, days: number) => {
  const next = utc(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) =>
  Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);
/** 1 = Monday … 7 = Sunday, as the rules store it. */
const isoWeekday = (date: string) => ((utc(date).getUTCDay() + 6) % 7) + 1;
const weekdayName = (date: string) => WEEKDAYS[utc(date).getUTCDay()] ?? '';

function rangeLabel(from: string, to: string): string {
  const a = utc(from);
  const b = utc(to);
  const day = (date: Date) => `${date.getUTCDate()}.`;
  const month = (date: Date) => MONTHS[date.getUTCMonth()] ?? '';
  if (from === to) return `${day(a)} ${month(a)}`;
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth())
    return `${day(a)}–${day(b)} ${month(b)}`;
  return `${day(a)} ${month(a)} – ${day(b)} ${month(b)}`;
}

// ---------- Rules of the app, repeated (see the head of the file) ----------

/** core cookingHistory + withCookingHistory: the later day and the sum of both counts. */
function cookingHistory(data: ToolData): Map<string, { last: string; count: number }> {
  const history = new Map<string, { last: string; count: number }>();
  const count = (recipeId: string, date: string) => {
    const known = history.get(recipeId);
    history.set(recipeId, {
      last: known === undefined || date > known.last ? date : known.last,
      count: (known?.count ?? 0) + 1,
    });
  };
  const collections = data.rows.collection_recipes ?? [];
  for (const row of doneEntries(data, 'recipe')) {
    const recipeId = str(row.recipe_id);
    if (!recipeId) continue;
    count(recipeId, String(row.date));
    for (const member of collections)
      if (member.collection_id === recipeId && str(member.recipe_id))
        count(String(member.recipe_id), String(row.date));
  }
  return history;
}

const DIET_RANK: Record<string, number> = { vegan: 0, vegetarian: 1, unknown: 2, fish: 3, meat: 4 };
const DIET_LABEL: Record<string, string> = {
  vegan: 'vegan',
  vegetarian: 'vegetarisch',
  fish: 'mit Fisch',
  meat: 'mit Fleisch',
  unknown: 'unbekannt',
  non_food: 'kein Lebensmittel',
};

/** core deriveRecipeDiet for the default variant: base and default ingredients, unknown wins over veg. */
function recipeDiet(row: ToolRow, articleDiet: Map<string, string>): string {
  const variants = list(row.variants).map(record);
  const chosen = str((variants.find((variant) => variant.isDefault === true) ?? variants[0])?.id);
  const diets = list(row.ingredients)
    .map(record)
    .filter((ingredient) => ingredient.variantId === undefined || ingredient.variantId === chosen)
    .map((ingredient) => articleDiet.get(String(ingredient.articleId)) ?? 'unknown')
    .filter((diet) => diet !== 'non_food');
  if (diets.length === 0) return 'unknown';
  return diets.reduce(
    (highest, diet) => ((DIET_RANK[diet] ?? 2) > (DIET_RANK[highest] ?? 2) ? diet : highest),
    'vegan',
  );
}

/** core matchesRule / seriesOccurrences: the Termine of a series from…to. */
function matchesRule(rule: Record<string, unknown>, startsOn: string, date: string): boolean {
  const day = utc(date);
  switch (rule.type) {
    case 'weekly': {
      if (!list(rule.weekdays).includes(isoWeekday(date))) return false;
      const weekStart = (value: string) => addDays(value, 1 - isoWeekday(value));
      const weeks = Math.round(daysBetween(weekStart(startsOn), weekStart(date)) / 7);
      return weeks % Math.max(1, num(rule.every) ?? 1) === 0;
    }
    case 'monthly': {
      const last = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
      return day.getUTCDate() === Math.min(num(rule.day) ?? 1, last);
    }
    case 'yearly': {
      const start = utc(startsOn);
      if (day.getUTCMonth() !== start.getUTCMonth()) return false;
      if (day.getUTCDate() === start.getUTCDate()) return true;
      const year = day.getUTCFullYear();
      const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      return (
        start.getUTCMonth() === 1 && start.getUTCDate() === 29 && day.getUTCDate() === 28 && !leap
      );
    }
    default:
      return false;
  }
}

interface Occurrence {
  date: string;
  slotId: string;
  startsAt?: string;
}

function seriesOccurrences(
  series: ToolRow,
  exceptions: readonly ToolRow[],
  from: string,
  to: string,
): Occurrence[] {
  const startsOn = str(series.starts_on);
  if (!startsOn || from > to) return [];
  const endsOn = str(series.ends_on);
  const rule = record(series.rule);
  const own = exceptions.filter((row) => row.series_id === series.id);
  const changed = new Set(own.map((row) => String(row.on_date)));
  const isDay = (date: string) =>
    date >= startsOn &&
    (endsOn === undefined || date <= endsOn) &&
    matchesRule(rule, startsOn, date);
  const result: Occurrence[] = [];
  const first = from > startsOn ? from : startsOn;
  const last = endsOn !== undefined && endsOn < to ? endsOn : to;
  for (let date = first; date <= last; date = addDays(date, 1)) {
    if (changed.has(date) || !matchesRule(rule, startsOn, date)) continue;
    result.push({ date, slotId: String(series.slot_id), startsAt: str(series.starts_at) });
  }
  for (const exception of own) {
    const target = str(exception.moved_to);
    if (target === undefined || target < from || target > to) continue;
    if (!isDay(String(exception.on_date))) continue;
    result.push({
      date: target,
      slotId: str(exception.slot_id) ?? String(series.slot_id),
      startsAt: str(exception.starts_at) ?? str(series.starts_at),
    });
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ---------- Lists ----------

type Item = Record<string, unknown>;

interface Sort {
  label: string;
  /** Direction labels: ascending, descending. */
  up: string;
  down: string;
  value: (item: Item) => string | number | null;
  /** Null as the smallest value ("nie gekocht" = longest ago) instead of always last. */
  nullsLow?: boolean;
}

interface FilterLabel {
  short: string;
  long: string;
}

interface ListTool {
  label: string;
  countNoun?: string;
  params: Record<string, Param>;
  fields: Record<string, string>;
  defaultFields: readonly string[];
  sorts: Record<string, Sort>;
  defaultSort: string;
  defaultLimit?: number;
  reads: (args: Args, today: string) => ToolRead[];
  items: (data: ToolData, args: Args) => Item[];
  /** The household's whole list, for "12 von 143". */
  all: (data: ToolData, items: readonly Item[]) => number;
  matches: (item: Item, args: Args, data: ToolData) => boolean;
  search: (item: Item) => (string | undefined)[];
  labels: (args: Args) => FilterLabel[];
  /** Extra keys of the output next to the page (the calendar's chores and trips). */
  extra?: (data: ToolData, args: Args) => Record<string, unknown>;
  /** The step's detail besides the filters (the calendar's range). */
  detail?: (args: Args) => string | undefined;
}

const read = (table: ToolTable, columns: string, filters: ToolRead['filters'] = []): ToolRead => ({
  table,
  columns,
  filters,
});

const paging = (fields: Record<string, string>, sorts: Record<string, Sort>, maxLimit: number) => ({
  query: { type: 'string', description: 'Freitext-Suche', max: AGENT_TOOL_LIMITS.query } as Param,
  sort: { type: 'enum', values: Object.keys(sorts), description: 'Sortierung' } as Param,
  descending: { type: 'boolean', description: 'absteigend sortieren' } as Param,
  limit: {
    type: 'integer',
    min: 1,
    max: maxLimit,
    description: `Einträge je Seite (Standard klein, bis ${maxLimit} auf ausdrücklichen Wunsch)`,
  } as Param,
  offset: {
    type: 'integer',
    min: 0,
    max: 100_000,
    description: 'ab Eintrag (0 = Anfang)',
  } as Param,
  fields: {
    type: 'enumArray',
    values: Object.keys(fields),
    description: 'Felder der Antwort; nur anfragen, was gebraucht wird',
  } as Param,
});

const booleanLabel = (value: unknown, yes: string, no: string, long: string): FilterLabel[] =>
  value === true
    ? [{ short: yes, long: `${long}: ja` }]
    : value === false
      ? [{ short: no, long: `${long}: nein` }]
      : [];
const textLabel = (value: unknown, long: string): FilterLabel[] =>
  typeof value === 'string' && value !== ''
    ? [{ short: quoted(value), long: `${long} ${quoted(value)}` }]
    : [];
const dateLabel = (value: unknown, short: string, long: string): FilterLabel[] =>
  typeof value === 'string' ? [{ short: `${short} ${value}`, long: `${long} ${value}` }] : [];
const tagLabel = (value: unknown): FilterLabel[] => {
  const tags = strings(value);
  return tags.length > 0
    ? [
        {
          short: tags.map(quoted).join(', '),
          long: `Schlagworte ${tags.map(quoted).join(', ')}`,
        },
      ]
    : [];
};
const hasTags = (item: Item, wanted: unknown) => {
  const tags = strings(item.tags).map(fold);
  return strings(wanted).every((tag) => tags.includes(fold(tag)));
};
const titleSort = (key: string): Sort => ({
  label: key === 'title' ? 'Titel' : 'Name',
  up: 'A–Z',
  down: 'Z–A',
  value: (item) => String(item[key] ?? ''),
});
const lastSort = (key: string, label: string): Sort => ({
  label,
  up: 'älteste zuerst',
  down: 'neueste zuerst',
  value: (item) => (typeof item[key] === 'string' ? (item[key] as string) : null),
  nullsLow: true,
});
const countSort = (key: string, label: string): Sort => ({
  label,
  up: 'wenigste zuerst',
  down: 'meiste zuerst',
  value: (item) => num(item[key]) ?? 0,
});
const ratingSort: Sort = {
  label: 'Bewertung',
  up: 'schlechteste zuerst',
  down: 'beste zuerst',
  value: (item) => num(item.rating) ?? null,
};
const createdSort: Sort = {
  label: 'angelegt',
  up: 'älteste zuerst',
  down: 'neueste zuerst',
  value: (item) => String(item.created ?? ''),
};

const DIETS = ['vegan', 'vegetarian', 'fish', 'meat', 'unknown'] as const;
const COURSES = ['breakfast', 'main', 'side', 'dessert', 'snack', 'drink'] as const;
const COURSE_LABEL: Record<string, string> = {
  breakfast: 'Frühstück',
  main: 'Hauptgericht',
  side: 'Beilage',
  dessert: 'Dessert',
  snack: 'Snack',
  drink: 'Getränk',
};

const RECIPE_FIELDS = {
  id: 'ID',
  title: 'Titel',
  course: 'Gang',
  cuisine: 'Küche',
  tags: 'Schlagworte',
  diet: 'Ernährung',
  total_minutes: 'Zeit',
  servings: 'Portionen',
  last_cooked_on: 'zuletzt gekocht',
  cooked_count: 'wie oft gekocht',
  rating: 'Bewertung',
  favorite_of: 'Favorit von',
  ingredients: 'Zutaten',
  has_photo: 'Foto',
  unfinished: 'unfertig',
  description: 'Beschreibung',
};
const RECIPE_SORTS: Record<string, Sort> = {
  title: titleSort('title'),
  last_cooked: lastSort('last_cooked_on', 'zuletzt gekocht'),
  cooked_count: countSort('cooked_count', 'wie oft gekocht'),
  rating: ratingSort,
  total_minutes: {
    label: 'Zeit',
    up: 'schnellste zuerst',
    down: 'längste zuerst',
    value: (item) => num(item.total_minutes) ?? null,
  },
  created: createdSort,
};

const RECIPE_KINDS = ['recipe', 'collection', 'all'] as const;

/** Recipes by default; collections or both on request. */
const kindMatches = (row: ToolRow, args: Args) =>
  args.kind === 'all' || (args.kind === 'collection') === (row.kind === 'collection');

const listRecipes: ListTool = {
  label: 'Liest eure Rezepte',
  params: {
    ...paging(RECIPE_FIELDS, RECIPE_SORTS, AGENT_TOOL_LIMITS.maxLimit),
    course: { type: 'enumArray', values: COURSES, description: 'Gang, einer davon' },
    diet: {
      type: 'enumArray',
      values: DIETS,
      description:
        'Ernährung der Standard-Variante, eine davon; vegetarisch = vegan und vegetarian',
    },
    cuisine: { type: 'string', description: 'Küche, z. B. Indisch' },
    tags: { type: 'stringArray', description: 'Schlagworte, alle müssen passen' },
    max_minutes: {
      type: 'integer',
      min: 1,
      max: 10_000,
      description: 'höchstens so viele Minuten',
    },
    cooked_before: {
      type: 'date',
      description: 'zuletzt gekocht vor diesem Tag oder nie',
    },
    favorite: { type: 'boolean', description: 'Favorit von mindestens einem Mitglied' },
    unfinished: { type: 'boolean', description: 'unfertig: ohne Zutaten und ohne Schritte' },
    kind: {
      type: 'enum',
      values: RECIPE_KINDS,
      description: 'recipe (Standard), collection = Sammlungen, all = beides',
    },
  },
  fields: RECIPE_FIELDS,
  defaultFields: ['id', 'title', 'course', 'diet', 'total_minutes', 'last_cooked_on'],
  sorts: RECIPE_SORTS,
  defaultSort: 'title',
  reads: (_args, today) => [
    read(
      'recipes',
      'id,kind,title,course,cuisine,tags,total_minutes,servings,last_cooked_on,cooked_count,ingredients,variants,steps,photo,photo_path,description,created_at',
    ),
    read('articles', 'id,name,diet'),
    read('recipe_ratings', 'recipe_id,member_id,stars'),
    read('recipe_favorites', 'recipe_id,member_id'),
    read('collection_recipes', 'id,collection_id,recipe_id'),
    read('meal_plan_entries', 'id,kind,recipe_id,date,not_done', [
      { op: 'eq', column: 'kind', value: 'recipe' },
      { op: 'lte', column: 'date', value: today },
    ]),
  ],
  items: (data, args) => {
    const articles = data.rows.articles ?? [];
    const diet = new Map(articles.map((row) => [String(row.id), String(row.diet ?? 'unknown')]));
    const names = new Map(articles.map((row) => [String(row.id), String(row.name ?? '')]));
    const history = cookingHistory(data);
    return (data.rows.recipes ?? [])
      .filter((row) => kindMatches(row, args))
      .map((row) => {
        const recipeId = String(row.id);
        const cooked = history.get(recipeId);
        const stored = str(row.last_cooked_on);
        const last =
          stored !== undefined && (cooked === undefined || stored > cooked.last)
            ? stored
            : (cooked?.last ?? null);
        const ingredients = list(row.ingredients).map(record);
        const course = str(row.course);
        return {
          id: recipeId,
          title: String(row.title ?? ''),
          kind: row.kind,
          course: course ? (COURSE_LABEL[course] ?? course) : null,
          course_code: course ?? null,
          cuisine: str(row.cuisine) ?? null,
          tags: strings(row.tags),
          diet_code: recipeDiet(row, diet),
          diet: DIET_LABEL[recipeDiet(row, diet)] ?? 'unbekannt',
          total_minutes: num(row.total_minutes) ?? null,
          servings: num(row.servings) ?? null,
          last_cooked_on: last,
          cooked_count: (num(row.cooked_count) ?? 0) + (cooked?.count ?? 0),
          rating: averageStars(data.rows.recipe_ratings ?? [], 'recipe_id', recipeId),
          favorite_of: favoritesOf(data.rows.recipe_favorites ?? [], 'recipe_id', recipeId, data),
          ingredients: [
            ...new Set(
              ingredients
                .flatMap((entry) => names.get(String(entry.articleId)) ?? [])
                .filter(Boolean),
            ),
          ],
          has_photo: Boolean(str(row.photo) ?? str(row.photo_path)),
          unfinished:
            row.kind === 'recipe' && ingredients.length === 0 && list(row.steps).length === 0,
          description: str(row.description) ?? null,
          created: str(row.created_at) ?? '',
        };
      });
  },
  // The same set as the items (preview 28.11.: "26 von 24" counted collections in the page only).
  all: (data, everything) => everything.length,
  matches: (item, args) =>
    (strings(args.course).length === 0 ||
      strings(args.course).includes(String(item.course_code))) &&
    (strings(args.diet).length === 0 || strings(args.diet).includes(String(item.diet_code))) &&
    (typeof args.cuisine !== 'string' || contains([str(item.cuisine)], args.cuisine)) &&
    hasTags(item, args.tags) &&
    (typeof args.max_minutes !== 'number' ||
      (num(item.total_minutes) ?? Infinity) <= args.max_minutes) &&
    (typeof args.cooked_before !== 'string' ||
      item.last_cooked_on === null ||
      String(item.last_cooked_on) < args.cooked_before) &&
    (typeof args.favorite !== 'boolean' ||
      strings(item.favorite_of).length > 0 === args.favorite) &&
    (typeof args.unfinished !== 'boolean' || item.unfinished === args.unfinished),
  search: (item) => [
    str(item.title),
    str(item.cuisine),
    ...strings(item.tags),
    ...strings(item.ingredients),
    str(item.description),
  ],
  labels: (args) => [
    ...(args.kind === 'collection' || args.kind === 'all'
      ? [
          {
            short: args.kind === 'all' ? 'Rezepte und Sammlungen' : 'Sammlungen',
            long: args.kind === 'all' ? 'Rezepte und Sammlungen' : 'nur Sammlungen',
          },
        ]
      : []),
    ...(strings(args.course).length > 0
      ? [
          {
            short: strings(args.course)
              .map((code) => COURSE_LABEL[code] ?? code)
              .join(' oder '),
            long: `Gang ${strings(args.course)
              .map((code) => COURSE_LABEL[code] ?? code)
              .join(' oder ')}`,
          },
        ]
      : []),
    ...(strings(args.diet).length > 0
      ? [
          {
            short: strings(args.diet)
              .map((code) => DIET_LABEL[code] ?? code)
              .join(' oder '),
            long: `Ernährung ${strings(args.diet)
              .map((code) => DIET_LABEL[code] ?? code)
              .join(' oder ')}`,
          },
        ]
      : []),
    ...textLabel(args.cuisine, 'Küche'),
    ...tagLabel(args.tags),
    ...(typeof args.max_minutes === 'number'
      ? [{ short: `bis ${args.max_minutes} Min.`, long: `höchstens ${args.max_minutes} Minuten` }]
      : []),
    ...dateLabel(args.cooked_before, 'nicht gekocht seit', 'zuletzt gekocht vor'),
    ...booleanLabel(args.favorite, 'Favorit', 'kein Favorit', 'Favorit'),
    ...booleanLabel(args.unfinished, 'unfertig', 'fertig', 'unfertig'),
  ],
};

const PLACE_SORTS = (key: 'name'): Record<string, Sort> => ({
  name: titleSort(key),
  last_visit: lastSort('last_visit', 'letzter Besuch'),
  visits: countSort('visits', 'Besuche'),
  rating: ratingSort,
  created: createdSort,
});

const RESTAURANT_FIELDS = {
  id: 'ID',
  name: 'Name',
  cuisine: 'Küche',
  address: 'Adresse',
  price_level: 'Preisniveau',
  tags: 'Schlagworte',
  rating: 'Bewertung',
  favorite_of: 'Favorit von',
  visits: 'Besuche',
  last_visit: 'letzter Besuch',
  website: 'Webseite',
  maps_url: 'Karten-Link',
  notes: 'Notiz',
  has_photo: 'Foto',
};
const visitedLabels = (args: Args) => [
  ...booleanLabel(args.favorite, 'Favorit', 'kein Favorit', 'Favorit'),
  ...booleanLabel(args.visited, 'besucht', 'nicht besucht', 'besucht'),
  ...dateLabel(args.visited_before, 'nicht besucht seit', 'zuletzt besucht vor'),
];
const visitedMatch = (item: Item, args: Args) =>
  (typeof args.favorite !== 'boolean' || strings(item.favorite_of).length > 0 === args.favorite) &&
  (typeof args.visited !== 'boolean' || (num(item.visits) ?? 0) > 0 === args.visited) &&
  (typeof args.visited_before !== 'string' ||
    item.last_visit === null ||
    String(item.last_visit) < args.visited_before);
const visitParams: Record<string, Param> = {
  favorite: { type: 'boolean', description: 'Favorit von mindestens einem Mitglied' },
  visited: { type: 'boolean', description: 'schon besucht (stand bis heute im Kalender)' },
  visited_before: { type: 'date', description: 'zuletzt besucht vor diesem Tag oder nie' },
};

const listRestaurants: ListTool = {
  label: 'Liest eure Restaurants',
  params: {
    ...paging(RESTAURANT_FIELDS, PLACE_SORTS('name'), AGENT_TOOL_LIMITS.maxLimit),
    cuisine: { type: 'string', description: 'Küche, z. B. Italienisch' },
    tags: { type: 'stringArray', description: 'Schlagworte, alle müssen passen' },
    max_price_level: {
      type: 'integer',
      min: 1,
      max: 4,
      description: 'höchstens dieses Preisniveau',
    },
    ...visitParams,
  },
  fields: RESTAURANT_FIELDS,
  defaultFields: ['id', 'name', 'cuisine', 'price_level', 'visits', 'last_visit'],
  sorts: PLACE_SORTS('name'),
  defaultSort: 'name',
  reads: (_args, today) => [
    read(
      'restaurants',
      'id,name,cuisine,address,price_level,tags,website_url,maps_url,notes,photo_path,created_at',
    ),
    read('restaurant_ratings', 'restaurant_id,member_id,stars'),
    read('restaurant_favorites', 'restaurant_id,member_id'),
    read('meal_plan_entries', 'id,kind,restaurant_id,date,not_done', [
      { op: 'eq', column: 'kind', value: 'restaurant' },
      { op: 'lte', column: 'date', value: today },
    ]),
  ],
  items: (data) => {
    const done = doneEntries(data, 'restaurant');
    return (data.rows.restaurants ?? []).map((row) => {
      const placeId = String(row.id);
      const visit = visits(done, 'restaurant_id', placeId);
      return {
        id: placeId,
        name: String(row.name ?? ''),
        cuisine: str(row.cuisine) ?? null,
        address: str(row.address) ?? null,
        price_level: num(row.price_level) ?? null,
        tags: strings(row.tags),
        rating: averageStars(data.rows.restaurant_ratings ?? [], 'restaurant_id', placeId),
        favorite_of: favoritesOf(
          data.rows.restaurant_favorites ?? [],
          'restaurant_id',
          placeId,
          data,
        ),
        visits: visit.count,
        last_visit: visit.last,
        website: str(row.website_url) ?? null,
        maps_url: str(row.maps_url) ?? null,
        notes: str(row.notes) ?? null,
        has_photo: Boolean(str(row.photo_path)),
        created: str(row.created_at) ?? '',
      };
    });
  },
  all: (data) => (data.rows.restaurants ?? []).length,
  matches: (item, args) =>
    (typeof args.cuisine !== 'string' || contains([str(item.cuisine)], args.cuisine)) &&
    hasTags(item, args.tags) &&
    (typeof args.max_price_level !== 'number' ||
      (num(item.price_level) ?? Infinity) <= args.max_price_level) &&
    visitedMatch(item, args),
  search: (item) => [
    str(item.name),
    str(item.cuisine),
    str(item.address),
    ...strings(item.tags),
    str(item.notes),
  ],
  labels: (args) => [
    ...textLabel(args.cuisine, 'Küche'),
    ...tagLabel(args.tags),
    ...(typeof args.max_price_level === 'number'
      ? [
          {
            short: `bis ${'€'.repeat(args.max_price_level)}`,
            long: `Preisniveau bis ${'€'.repeat(args.max_price_level)}`,
          },
        ]
      : []),
    ...visitedLabels(args),
  ],
};

const ACTIVITY_FIELDS = {
  id: 'ID',
  name: 'Name',
  kind: 'Art',
  place_name: 'Ort',
  address: 'Adresse',
  description: 'Beschreibung',
  rating: 'Bewertung',
  favorite_of: 'Favorit von',
  remembered: 'gemerkt',
  visits: 'Besuche',
  last_visit: 'letzter Besuch',
  website: 'Webseite',
  maps_url: 'Karten-Link',
  has_photo: 'Foto',
};

const listActivities: ListTool = {
  label: 'Liest eure Aktivitäten',
  params: {
    ...paging(ACTIVITY_FIELDS, PLACE_SORTS('name'), AGENT_TOOL_LIMITS.maxLimit),
    kind: { type: 'string', description: 'Art, z. B. Museum' },
    remembered: { type: 'boolean', description: 'gemerkt („Merken“)' },
    ...visitParams,
  },
  fields: ACTIVITY_FIELDS,
  defaultFields: ['id', 'name', 'kind', 'place_name', 'remembered', 'visits', 'last_visit'],
  sorts: PLACE_SORTS('name'),
  defaultSort: 'name',
  reads: (_args, today) => [
    read(
      'activities',
      'id,name,kind_id,place_name,address,description,remembered,website_url,maps_url,photo_path,created_at',
    ),
    read('activity_kinds', 'id,name'),
    read('activity_ratings', 'activity_id,member_id,stars'),
    read('activity_favorites', 'activity_id,member_id'),
    read('meal_plan_entries', 'id,kind,activity_id,date,not_done', [
      { op: 'eq', column: 'kind', value: 'activity' },
      { op: 'lte', column: 'date', value: today },
    ]),
  ],
  items: (data) => {
    const done = doneEntries(data, 'activity');
    const kinds = new Map(
      (data.rows.activity_kinds ?? []).map((row) => [String(row.id), String(row.name ?? '')]),
    );
    return (data.rows.activities ?? []).map((row) => {
      const placeId = String(row.id);
      const visit = visits(done, 'activity_id', placeId);
      return {
        id: placeId,
        name: String(row.name ?? ''),
        kind: kinds.get(String(row.kind_id)) ?? null,
        place_name: str(row.place_name) ?? null,
        address: str(row.address) ?? null,
        description: str(row.description) ?? null,
        rating: averageStars(data.rows.activity_ratings ?? [], 'activity_id', placeId),
        favorite_of: favoritesOf(data.rows.activity_favorites ?? [], 'activity_id', placeId, data),
        remembered: row.remembered === true,
        visits: visit.count,
        last_visit: visit.last,
        website: str(row.website_url) ?? null,
        maps_url: str(row.maps_url) ?? null,
        has_photo: Boolean(str(row.photo_path)),
        created: str(row.created_at) ?? '',
      };
    });
  },
  all: (data) => (data.rows.activities ?? []).length,
  matches: (item, args) =>
    (typeof args.kind !== 'string' || contains([str(item.kind)], args.kind)) &&
    (typeof args.remembered !== 'boolean' || item.remembered === args.remembered) &&
    visitedMatch(item, args),
  search: (item) => [
    str(item.name),
    str(item.kind),
    str(item.place_name),
    str(item.address),
    str(item.description),
  ],
  labels: (args) => [
    ...textLabel(args.kind, 'Art'),
    ...booleanLabel(args.remembered, 'gemerkt', 'nicht gemerkt', 'gemerkt'),
    ...visitedLabels(args),
  ],
};

// ---------- Calendar ----------

const ENTRY_KINDS = ['recipe', 'restaurant', 'activity', 'text', 'leftovers'] as const;
const ENTRY_KIND_LABEL: Record<string, string> = {
  recipe: 'Rezept',
  restaurant: 'Restaurant',
  activity: 'Aktivität',
  text: 'Freitext',
  leftovers: 'Reste',
};
const CALENDAR_FIELDS = {
  date: 'Tag',
  weekday: 'Wochentag',
  slot: 'Tageszeit',
  starts_at: 'Uhrzeit',
  kind: 'Art',
  title: 'Titel',
  note: 'Zusatz',
  guests: 'Gäste',
  people: 'wer',
  not_done: 'nicht stattgefunden',
  series: 'Serie',
};
const CALENDAR_SORTS: Record<string, Sort> = {
  date: {
    label: 'Tag',
    up: 'früheste zuerst',
    down: 'späteste zuerst',
    value: (item) => String(item.order ?? ''),
  },
};

function tripsIn(data: ToolData, from: string, to: string) {
  const members = data.rows.trip_members ?? [];
  return (data.rows.trips ?? [])
    .filter((row) => String(row.from_on) <= to && String(row.to_on) >= from)
    .sort((a, b) => String(a.from_on).localeCompare(String(b.from_on)))
    .map((row) => ({
      from_on: String(row.from_on),
      to_on: String(row.to_on),
      note: str(row.note) ?? null,
      people: namesOf(
        members
          .filter((member) => member.trip_id === row.id)
          .map((member) => String(member.member_id)),
        data,
      ),
      draft: row.draft === true,
    }));
}

const calendar: ListTool = {
  label: 'Schaut in den Kalender',
  countNoun: 'Einträge',
  params: {
    from: { type: 'date', description: 'erster Tag, Pflicht' },
    to: {
      type: 'date',
      description: `letzter Tag, Pflicht, höchstens ${AGENT_TOOL_LIMITS.calendarDays} Tage`,
    },
    kinds: { type: 'enumArray', values: ENTRY_KINDS, description: 'nur diese Arten' },
    ...paging(CALENDAR_FIELDS, CALENDAR_SORTS, AGENT_TOOL_LIMITS.maxLimit),
  },
  fields: CALENDAR_FIELDS,
  defaultFields: [
    'date',
    'weekday',
    'slot',
    'starts_at',
    'kind',
    'title',
    'note',
    'guests',
    'people',
    'series',
  ],
  sorts: CALENDAR_SORTS,
  defaultSort: 'date',
  defaultLimit: AGENT_TOOL_LIMITS.calendarLimit,
  reads: (args) => [
    read(
      'meal_plan_entries',
      'id,date,slot_id,sort,kind,recipe_id,restaurant_id,activity_id,text,note,guests,eater_ids,not_done,starts_at',
      [
        { op: 'gte', column: 'date', value: String(args.from) },
        { op: 'lte', column: 'date', value: String(args.to) },
      ],
    ),
    read('recipes', 'id,title'),
    read('restaurants', 'id,name'),
    read('activities', 'id,name'),
    read(
      'activity_series',
      'id,activity_id,rule,starts_on,ends_on,slot_id,starts_at,eater_ids,guests,note',
    ),
    read('activity_series_exceptions', 'id,series_id,on_date,moved_to,slot_id,starts_at'),
    read('trips', 'id,from_on,to_on,note,draft'),
    read('trip_members', 'id,trip_id,member_id'),
    read('chores', 'id,title,room,next_due_on,next_assignee_id'),
  ],
  items: (data, args) => {
    const from = String(args.from);
    const to = String(args.to);
    const title = (table: ToolTable, key: string, value: unknown) =>
      str((data.rows[table] ?? []).find((row) => row.id === value)?.[key]);
    const slot = (slotId: unknown) => data.mealSlots.find((entry) => entry.id === slotId);
    const item = (input: {
      date: string;
      slotId: unknown;
      sort: number;
      startsAt?: string;
      kind: string;
      title?: string;
      note?: string;
      guests: number;
      people: string[];
      notDone: boolean;
      series: boolean;
    }) => {
      const at = slot(input.slotId);
      return {
        date: input.date,
        weekday: weekdayName(input.date),
        slot: at?.name ?? null,
        starts_at: input.startsAt ?? null,
        kind_code: input.kind,
        kind: ENTRY_KIND_LABEL[input.kind] ?? input.kind,
        title: input.title ?? null,
        note: input.note ?? null,
        guests: input.guests,
        people: input.people,
        not_done: input.notDone,
        series: input.series,
        // Day, then the slot's place, then the time and the entry's own place.
        order: `${input.date}|${String(at?.sort ?? 99).padStart(3, '0')}|${input.startsAt ?? '99:99'}|${String(input.sort).padStart(4, '0')}`,
      };
    };
    const entries = (data.rows.meal_plan_entries ?? [])
      .filter((row) => {
        const date = str(row.date);
        return date !== undefined && date >= from && date <= to;
      })
      .map((row) =>
        item({
          date: String(row.date),
          slotId: row.slot_id,
          sort: num(row.sort) ?? 0,
          startsAt: str(row.starts_at)?.slice(0, 5),
          kind: String(row.kind),
          title:
            row.kind === 'recipe'
              ? title('recipes', 'title', row.recipe_id)
              : row.kind === 'restaurant'
                ? title('restaurants', 'name', row.restaurant_id)
                : row.kind === 'activity'
                  ? title('activities', 'name', row.activity_id)
                  : row.kind === 'leftovers'
                    ? 'Reste'
                    : str(row.text),
          note: str(row.note),
          guests: num(row.guests) ?? 0,
          people: namesOf(strings(row.eater_ids), data),
          notDone: row.not_done === true,
          series: false,
        }),
      );
    const exceptions = data.rows.activity_series_exceptions ?? [];
    const termine = (data.rows.activity_series ?? []).flatMap((series) =>
      seriesOccurrences(series, exceptions, from, to).map((occurrence) =>
        item({
          date: occurrence.date,
          slotId: occurrence.slotId,
          sort: 0,
          startsAt: occurrence.startsAt?.slice(0, 5),
          kind: 'activity',
          title: title('activities', 'name', series.activity_id),
          note: str(series.note),
          guests: num(series.guests) ?? 0,
          people: namesOf(strings(series.eater_ids), data),
          notDone: false,
          series: true,
        }),
      ),
    );
    return [...entries, ...termine];
  },
  all: (_data, items) => items.length,
  matches: (item, args) =>
    strings(args.kinds).length === 0 || strings(args.kinds).includes(String(item.kind_code)),
  search: (item) => [str(item.title), str(item.note), str(item.slot)],
  labels: (args) =>
    strings(args.kinds).length > 0
      ? [
          {
            short: strings(args.kinds)
              .map((code) => ENTRY_KIND_LABEL[code] ?? code)
              .join(', '),
            long: `Arten ${strings(args.kinds)
              .map((code) => ENTRY_KIND_LABEL[code] ?? code)
              .join(', ')}`,
          },
        ]
      : [],
  detail: (args) => rangeLabel(String(args.from), String(args.to)),
  extra: (data, args) => {
    const from = String(args.from);
    const to = String(args.to);
    return {
      chores_due: (data.rows.chores ?? [])
        .filter((row) => {
          const due = str(row.next_due_on);
          return due !== undefined && due >= from && due <= to;
        })
        .sort((a, b) => String(a.next_due_on).localeCompare(String(b.next_due_on)))
        .map((row) => ({
          title: String(row.title ?? ''),
          room: str(row.room) ?? null,
          due_on: String(row.next_due_on),
          assignee: namesOf([String(row.next_assignee_id ?? '')], data)[0] ?? null,
        })),
      trips: tripsIn(data, from, to),
      note: 'Aufgaben: je Aufgabe nur ihr nächster fälliger Tag.',
    };
  },
};

// ---------- List, Dauerposten, chores, trips, articles ----------

const amountOf = (rows: readonly ToolRow[]): string | null => {
  const parts = rows.flatMap((row) => {
    const count = num(row.count);
    const qty = num(row.qty);
    const unit = str(row.unit);
    const note = str(row.note);
    const amount = [
      count !== undefined && qty !== undefined
        ? `${count} ×`
        : count !== undefined
          ? String(count)
          : '',
      qty !== undefined ? `${String(qty).replace('.', ',')}${unit ? ` ${unit}` : ''}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const text = [amount, note ? `(${note})` : ''].filter(Boolean).join(' ');
    return text ? [text] : [];
  });
  return parts.length > 0 ? parts.join(' + ') : null;
};

const SHOPPING_FIELDS = {
  article: 'Artikel',
  area: 'Bereich',
  amount: 'Menge',
  checked: 'abgehakt',
  not_available: 'gab es nicht',
};
const SHOPPING_SORTS: Record<string, Sort> = {
  area: {
    label: 'Bereich',
    up: 'in Ladenfolge',
    down: 'Ladenfolge rückwärts',
    value: (item) => String(item.order ?? ''),
  },
  article: titleSort('article'),
};
SHOPPING_SORTS.article!.label = 'Artikel';

function articleArea(data: ToolData) {
  const areas = new Map(
    (data.rows.areas ?? []).map((row) => [
      String(row.id),
      { name: String(row.name ?? ''), sort: num(row.sort) ?? 999 },
    ]),
  );
  const articles = new Map((data.rows.articles ?? []).map((row) => [String(row.id), row]));
  return (articleId: unknown) => {
    const article = articles.get(String(articleId));
    const area = areas.get(String(article?.area_id));
    return { article, area };
  };
}

const shoppingList: ListTool = {
  label: 'Liest die Einkaufsliste',
  params: {
    ...paging(SHOPPING_FIELDS, SHOPPING_SORTS, AGENT_TOOL_LIMITS.maxLimit),
    include_checked: { type: 'boolean', description: 'auch Abgehaktes (sonst nur Offenes)' },
    area: { type: 'string', description: 'nur dieser Bereich, z. B. Kühlregal' },
  },
  fields: SHOPPING_FIELDS,
  defaultFields: ['article', 'area', 'amount', 'not_available'],
  sorts: SHOPPING_SORTS,
  defaultSort: 'area',
  defaultLimit: 100,
  reads: () => [
    read('shopping_items', 'id,article_id,checked,not_available'),
    read('shopping_contributions', 'id,item_id,count,qty,unit,note'),
    read('articles', 'id,name,area_id'),
    read('areas', 'id,name,sort'),
  ],
  items: (data) => {
    const lookup = articleArea(data);
    const contributions = data.rows.shopping_contributions ?? [];
    return (data.rows.shopping_items ?? []).map((row) => {
      const { article, area } = lookup(row.article_id);
      const name = String(article?.name ?? '');
      return {
        article: name,
        area: area?.name ?? null,
        amount: amountOf(contributions.filter((entry) => entry.item_id === row.id)),
        checked: row.checked === true,
        not_available: row.not_available === true,
        order: `${String(area?.sort ?? 999).padStart(4, '0')}|${fold(name)}`,
      };
    });
  },
  all: (data) => (data.rows.shopping_items ?? []).length,
  matches: (item, args) =>
    (args.include_checked === true || item.checked !== true) &&
    (typeof args.area !== 'string' || contains([str(item.area)], args.area)),
  search: (item) => [str(item.article), str(item.amount)],
  labels: (args) => [
    ...(args.include_checked === true
      ? [{ short: 'mit Abgehaktem', long: 'auch Abgehaktes' }]
      : [{ short: 'offen', long: 'nur Offenes' }]),
    ...textLabel(args.area, 'Bereich'),
  ],
};

const RECURRING_FIELDS = {
  article: 'Artikel',
  amount: 'Menge',
  rule: 'Rhythmus',
  paused: 'pausiert',
  starts_on: 'ab',
  last_added_on: 'zuletzt auf die Liste',
  note: 'Zusatz',
};
const RECURRING_SORTS: Record<string, Sort> = {
  article: { ...titleSort('article'), label: 'Artikel' },
  last_added: lastSort('last_added_on', 'zuletzt auf die Liste'),
};

const ruleOf = (value: unknown) => {
  const rule = record(value);
  const allowed = ['type', 'every', 'weekdays', 'day', 'date', 'everyDays'];
  return Object.fromEntries(Object.entries(rule).filter(([key]) => allowed.includes(key)));
};

const listRecurringItems: ListTool = {
  label: 'Liest die Dauerposten',
  params: {
    ...paging(RECURRING_FIELDS, RECURRING_SORTS, AGENT_TOOL_LIMITS.maxLimit),
    paused: { type: 'boolean', description: 'pausiert' },
  },
  fields: RECURRING_FIELDS,
  defaultFields: ['article', 'amount', 'rule', 'paused'],
  sorts: RECURRING_SORTS,
  defaultSort: 'article',
  defaultLimit: 50,
  reads: () => [
    read(
      'recurring_items',
      'id,article_id,count,qty,unit,note,paused,rule,starts_on,last_added_on',
    ),
    read('articles', 'id,name'),
  ],
  items: (data) => {
    const names = new Map(
      (data.rows.articles ?? []).map((row) => [String(row.id), String(row.name ?? '')]),
    );
    return (data.rows.recurring_items ?? []).map((row) => ({
      article: names.get(String(row.article_id)) ?? '',
      amount: amountOf([{ count: row.count, qty: row.qty, unit: row.unit }]),
      rule: ruleOf(row.rule),
      paused: row.paused === true,
      starts_on: str(row.starts_on) ?? null,
      last_added_on: str(row.last_added_on) ?? null,
      note: str(row.note) ?? null,
    }));
  },
  all: (data) => (data.rows.recurring_items ?? []).length,
  matches: (item, args) => typeof args.paused !== 'boolean' || item.paused === args.paused,
  search: (item) => [str(item.article), str(item.note)],
  labels: (args) => booleanLabel(args.paused, 'pausiert', 'aktiv', 'pausiert'),
};

const CHORE_FIELDS = {
  title: 'Titel',
  room: 'Raum',
  next_due_on: 'fällig am',
  assignee: 'dran ist',
  recurrence: 'Rhythmus',
  last_done_on: 'zuletzt erledigt',
  effort: 'Aufwand',
  due_time: 'Uhrzeit',
  overdue: 'überfällig',
};
const CHORE_SORTS: Record<string, Sort> = {
  next_due: {
    label: 'fällig am',
    up: 'früheste zuerst',
    down: 'späteste zuerst',
    value: (item) => (typeof item.next_due_on === 'string' ? item.next_due_on : null),
  },
  title: titleSort('title'),
  room: { label: 'Raum', up: 'A–Z', down: 'Z–A', value: (item) => String(item.room ?? '') },
  last_done: lastSort('last_done_on', 'zuletzt erledigt'),
};

const listChores: ListTool = {
  label: 'Liest die Aufgaben',
  params: {
    ...paging(CHORE_FIELDS, CHORE_SORTS, AGENT_TOOL_LIMITS.maxLimit),
    room: { type: 'string', description: 'Raum, z. B. Bad' },
    assignee: { type: 'string', description: 'wer als Nächstes dran ist (Name)' },
    due_before: { type: 'date', description: 'fällig bis einschließlich' },
    overdue: { type: 'boolean', description: 'überfällig (fällig vor heute)' },
  },
  fields: CHORE_FIELDS,
  defaultFields: ['title', 'room', 'next_due_on', 'assignee'],
  sorts: CHORE_SORTS,
  defaultSort: 'next_due',
  defaultLimit: 20,
  reads: () => [
    read(
      'chores',
      'id,title,room,next_due_on,next_assignee_id,last_done_on,recurrence,effort,due_time',
    ),
  ],
  items: (data) =>
    (data.rows.chores ?? []).map((row) => {
      const due = str(row.next_due_on);
      return {
        title: String(row.title ?? ''),
        room: str(row.room) ?? null,
        next_due_on: due ?? null,
        assignee: namesOf([String(row.next_assignee_id ?? '')], data)[0] ?? null,
        recurrence: ruleOf(row.recurrence),
        last_done_on: str(row.last_done_on) ?? null,
        effort: num(row.effort) ?? null,
        due_time: str(row.due_time)?.slice(0, 5) ?? null,
        overdue: due !== undefined && due < data.today,
      };
    }),
  all: (data) => (data.rows.chores ?? []).length,
  matches: (item, args) =>
    (typeof args.room !== 'string' || contains([str(item.room)], args.room)) &&
    (typeof args.assignee !== 'string' || contains([str(item.assignee)], args.assignee)) &&
    (typeof args.due_before !== 'string' ||
      (typeof item.next_due_on === 'string' && item.next_due_on <= args.due_before)) &&
    (typeof args.overdue !== 'boolean' || item.overdue === args.overdue),
  search: (item) => [str(item.title), str(item.room)],
  labels: (args) => [
    ...textLabel(args.room, 'Raum'),
    ...textLabel(args.assignee, 'dran ist'),
    ...dateLabel(args.due_before, 'fällig bis', 'fällig bis'),
    ...booleanLabel(args.overdue, 'überfällig', 'nicht überfällig', 'überfällig'),
  ],
};

const TRIP_FIELDS = {
  from_on: 'von',
  to_on: 'bis',
  note: 'Notiz',
  people: 'wer',
  draft: 'Entwurf',
  days: 'Tage',
};
const TRIP_SORTS: Record<string, Sort> = {
  from_on: {
    label: 'Beginn',
    up: 'früheste zuerst',
    down: 'späteste zuerst',
    value: (item) => String(item.from_on ?? ''),
  },
};

const listTrips: ListTool = {
  label: 'Liest eure Reisen',
  params: {
    ...paging(TRIP_FIELDS, TRIP_SORTS, AGENT_TOOL_LIMITS.maxLimit),
    upcoming: { type: 'boolean', description: 'laufende und kommende' },
    from: { type: 'date', description: 'überschneidet sich mit dem Zeitraum ab' },
    to: { type: 'date', description: 'überschneidet sich mit dem Zeitraum bis' },
  },
  fields: TRIP_FIELDS,
  defaultFields: ['from_on', 'to_on', 'note', 'people', 'draft'],
  sorts: TRIP_SORTS,
  defaultSort: 'from_on',
  reads: () => [
    read('trips', 'id,from_on,to_on,note,draft'),
    read('trip_members', 'id,trip_id,member_id'),
  ],
  items: (data) =>
    tripsIn(data, '0000-01-01', '9999-12-31').map((trip) => ({
      ...trip,
      days: daysBetween(trip.from_on, trip.to_on) + 1,
    })),
  all: (data) => (data.rows.trips ?? []).length,
  matches: (item, args, data) =>
    (args.upcoming !== true || String(item.to_on) >= data.today) &&
    (args.upcoming !== false || String(item.to_on) < data.today) &&
    (typeof args.from !== 'string' || String(item.to_on) >= args.from) &&
    (typeof args.to !== 'string' || String(item.from_on) <= args.to),
  search: (item) => [str(item.note), ...strings(item.people)],
  labels: (args) => [
    ...booleanLabel(args.upcoming, 'kommende', 'vergangene', 'kommende'),
    ...dateLabel(args.from, 'ab', 'ab'),
    ...dateLabel(args.to, 'bis', 'bis'),
  ],
};

const ARTICLE_FIELDS = {
  name: 'Name',
  area: 'Bereich',
  diet: 'Ernährung',
  synonyms: 'andere Namen',
  is_pantry: 'Vorrat',
  needs_review: 'zu prüfen',
};
const ARTICLE_SORTS: Record<string, Sort> = {
  name: titleSort('name'),
  area: {
    label: 'Bereich',
    up: 'in Ladenfolge',
    down: 'Ladenfolge rückwärts',
    value: (item) => String(item.order ?? ''),
  },
};

const listArticles: ListTool = {
  label: 'Liest die Artikel',
  params: {
    ...paging(ARTICLE_FIELDS, ARTICLE_SORTS, AGENT_TOOL_LIMITS.maxLimit),
    area: { type: 'string', description: 'Bereich, z. B. Gewürze' },
    diet: {
      type: 'enumArray',
      values: [...DIETS, 'non_food'],
      description: 'Ernährung, eine davon',
    },
    pantry: { type: 'boolean', description: 'Vorrat (hat man meist da)' },
  },
  fields: ARTICLE_FIELDS,
  defaultFields: ['name', 'area', 'diet'],
  sorts: ARTICLE_SORTS,
  defaultSort: 'name',
  defaultLimit: 50,
  reads: () => [
    read('articles', 'id,name,area_id,diet,synonyms,is_pantry,needs_review'),
    read('areas', 'id,name,sort'),
  ],
  items: (data) => {
    const lookup = articleArea(data);
    return (data.rows.articles ?? []).map((row) => {
      const { area } = lookup(row.id);
      const diet = String(row.diet ?? 'unknown');
      return {
        name: String(row.name ?? ''),
        area: area?.name ?? null,
        diet_code: diet,
        diet: DIET_LABEL[diet] ?? diet,
        synonyms: strings(row.synonyms),
        is_pantry: row.is_pantry === true,
        needs_review: row.needs_review === true,
        order: `${String(area?.sort ?? 999).padStart(4, '0')}|${fold(String(row.name ?? ''))}`,
      };
    });
  },
  all: (data) => (data.rows.articles ?? []).length,
  matches: (item, args) =>
    (typeof args.area !== 'string' || contains([str(item.area)], args.area)) &&
    (strings(args.diet).length === 0 || strings(args.diet).includes(String(item.diet_code))) &&
    (typeof args.pantry !== 'boolean' || item.is_pantry === args.pantry),
  search: (item) => [str(item.name), ...strings(item.synonyms)],
  labels: (args) => [
    ...textLabel(args.area, 'Bereich'),
    ...(strings(args.diet).length > 0
      ? [
          {
            short: strings(args.diet)
              .map((code) => DIET_LABEL[code] ?? code)
              .join(' oder '),
            long: `Ernährung ${strings(args.diet)
              .map((code) => DIET_LABEL[code] ?? code)
              .join(' oder ')}`,
          },
        ]
      : []),
    ...booleanLabel(args.pantry, 'Vorrat', 'kein Vorrat', 'Vorrat'),
  ],
};

const LIST_TOOLS: Record<Exclude<AgentToolName, 'household_values'>, ListTool> = {
  list_recipes: listRecipes,
  list_restaurants: listRestaurants,
  list_activities: listActivities,
  calendar,
  shopping_list: shoppingList,
  list_recurring_items: listRecurringItems,
  list_chores: listChores,
  list_trips: listTrips,
  list_articles: listArticles,
};

// ---------- household_values: every value of one column ----------

const VALUE_COLUMNS = {
  article_names: { label: 'Liest alle Artikelnamen', reads: [read('articles', 'id,name')] },
  recipe_tags: { label: 'Liest alle Schlagworte der Rezepte', reads: [read('recipes', 'id,tags')] },
  recipe_cuisines: {
    label: 'Liest alle Küchen der Rezepte',
    reads: [read('recipes', 'id,cuisine')],
  },
  restaurant_cuisines: {
    label: 'Liest alle Küchen der Restaurants',
    reads: [read('restaurants', 'id,cuisine')],
  },
  restaurant_tags: {
    label: 'Liest alle Schlagworte der Restaurants',
    reads: [read('restaurants', 'id,tags')],
  },
  activity_kinds: {
    label: 'Liest alle Arten der Aktivitäten',
    reads: [read('activity_kinds', 'id,name')],
  },
  areas: { label: 'Liest alle Bereiche', reads: [read('areas', 'id,name')] },
  chore_rooms: { label: 'Liest alle Räume', reads: [read('chores', 'id,room')] },
  members: { label: 'Liest die Mitglieder', reads: [] as ToolRead[] },
} as const;
type ValueColumn = keyof typeof VALUE_COLUMNS;

const valuesParams: Record<string, Param> = {
  column: {
    type: 'enum',
    values: Object.keys(VALUE_COLUMNS),
    description: 'welche Spalte, vollständig ohne Seiten',
  },
};

function valuesOf(column: ValueColumn, data: ToolData): string[] {
  const pick = (table: ToolTable, key: string) =>
    (data.rows[table] ?? []).flatMap((row) => {
      const value = row[key];
      return Array.isArray(value) ? strings(value) : str(value) ? [String(value)] : [];
    });
  const values =
    column === 'article_names'
      ? pick('articles', 'name')
      : column === 'recipe_tags'
        ? pick('recipes', 'tags')
        : column === 'recipe_cuisines'
          ? pick('recipes', 'cuisine')
          : column === 'restaurant_cuisines'
            ? pick('restaurants', 'cuisine')
            : column === 'restaurant_tags'
              ? pick('restaurants', 'tags')
              : column === 'activity_kinds'
                ? pick('activity_kinds', 'name')
                : column === 'areas'
                  ? pick('areas', 'name')
                  : column === 'chore_rooms'
                    ? pick('chores', 'room')
                    : data.members.map((member) => member.name);
  return [...new Set(values.map(oneLine).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
}

// ---------- Definitions for Foundry ----------

const PARAMS: Record<AgentToolName, Record<string, Param>> = {
  ...(Object.fromEntries(
    Object.entries(LIST_TOOLS).map(([name, tool]) => [name, tool.params]),
  ) as Record<Exclude<AgentToolName, 'household_values'>, Record<string, Param>>),
  household_values: valuesParams,
};
const SCHEMAS = Object.fromEntries(
  AGENT_TOOL_NAMES.map((name) => [name, schemas(PARAMS[name])]),
) as Record<AgentToolName, ReturnType<typeof schemas>>;

/** The JSON schema of a tool as foundry/agents/household-agent.yaml must carry it. */
export function agentToolParameters(name: AgentToolName) {
  return SCHEMAS[name].json;
}

// ---------- Parse, read, run ----------

export type ParsedToolCall =
  | { ok: true; name: AgentToolName; args: Args }
  | { ok: false; name: string; error: 'invalid_arguments' | 'unknown_tool' };

const isToolName = (name: string): name is AgentToolName =>
  (AGENT_TOOL_NAMES as readonly string[]).includes(name);

/** The model's call, checked (AC-015); nothing of a refused argument is kept. */
export function parseToolCall(name: string, rawArgs: string): ParsedToolCall {
  if (!isToolName(name)) return { ok: false, name, error: 'unknown_tool' };
  let json: unknown;
  try {
    json = JSON.parse(rawArgs || '{}');
  } catch {
    return { ok: false, name, error: 'invalid_arguments' };
  }
  const parsed = SCHEMAS[name].zod.safeParse(json);
  if (!parsed.success) return { ok: false, name, error: 'invalid_arguments' };
  const args = Object.fromEntries(
    Object.entries(parsed.data).filter(
      ([, value]) => value !== null && value !== undefined && value !== '',
    ),
  );
  if (name === 'calendar') {
    const from = args.from;
    const to = args.to;
    if (typeof from !== 'string' || typeof to !== 'string')
      return { ok: false, name, error: 'invalid_arguments' };
    const span = daysBetween(from, to);
    if (span < 0 || span >= AGENT_TOOL_LIMITS.calendarDays)
      return { ok: false, name, error: 'invalid_arguments' };
  }
  if (name === 'household_values' && typeof args.column !== 'string')
    return { ok: false, name, error: 'invalid_arguments' };
  return { ok: true, name, args };
}

/**
 * Preview 28.11.: the same tool with the same arguments (in any order, nulls left out) has one
 * key, so an answer reads it once and the second call gets the first result.
 */
export function agentCallKey(name: string, rawArgs: string): string | undefined {
  let json: unknown;
  try {
    json = JSON.parse(rawArgs || '{}');
  } catch {
    return undefined;
  }
  const args = record(json);
  const entries = Object.keys(args)
    .sort()
    .filter((key) => args[key] !== null && args[key] !== undefined && args[key] !== '')
    .map((key) => [key, args[key]]);
  return `${name}:${JSON.stringify(entries)}`;
}

/** The fixed reads of a call; values only from checked arguments (the calendar's days). */
export function toolReads(call: ParsedToolCall, today: string): ToolRead[] {
  if (!call.ok) return [];
  if (call.name === 'household_values')
    return [...VALUE_COLUMNS[call.args.column as ValueColumn].reads];
  return LIST_TOOLS[call.name].reads(call.args, today);
}

const TOOL_LABEL: Record<AgentToolName, string> = {
  ...(Object.fromEntries(
    Object.entries(LIST_TOOLS).map(([name, tool]) => [name, tool.label]),
  ) as Record<Exclude<AgentToolName, 'household_values'>, string>),
  household_values: 'Liest eure Daten',
};

function compare(a: string | number | null, b: string | number | null, nullsLow: boolean): number {
  if (a === null || b === null) {
    if (a === b) return 0;
    if (nullsLow) return a === null ? -1 : 1;
    return 0;
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'de');
}

function fitted(
  page: Record<string, unknown>,
  items: unknown[],
): { text: string; shown: number; truncated: boolean } {
  let shown = items.length;
  let text = JSON.stringify({ ...page, items });
  if (text.length <= AGENT_TOOL_LIMITS.outputChars) return { text, shown, truncated: false };
  while (shown > 0) {
    shown = Math.max(
      0,
      Math.min(shown - 1, Math.floor((shown * AGENT_TOOL_LIMITS.outputChars) / text.length)),
    );
    const offset = Number(page.offset ?? 0);
    text = JSON.stringify({
      ...page,
      next_offset: offset + shown,
      truncated: true,
      hint: 'Seite gekürzt: weniger Felder oder eine kleinere Seite anfragen.',
      items: items.slice(0, shown),
    });
    if (text.length <= AGENT_TOOL_LIMITS.outputChars) return { text, shown, truncated: true };
  }
  return { text, shown: 0, truncated: true };
}

/**
 * Runs a checked call on the rows the edge function read (REQ-007): search, filters, sort, a page
 * with the total, the asked fields. The step says what was read (REQ-008, AC-016).
 */
export function runTool(
  call: ParsedToolCall,
  data: ToolData,
  stepId: string,
): { output: string; step: ToolStep } {
  if (!call.ok) {
    if (call.error === 'unknown_tool')
      return {
        output: JSON.stringify({ error: 'unknown_tool' }),
        step: {
          id: stepId,
          kind: 'tool',
          label: 'Unbekanntes Werkzeug',
          details: [],
          status: 'done',
        },
      };
    const label = isToolName(call.name) ? TOOL_LABEL[call.name] : 'Unbekanntes Werkzeug';
    return {
      output: JSON.stringify({ error: 'invalid_arguments' }),
      step: {
        id: stepId,
        kind: 'tool',
        label,
        detail: 'Anfrage ungültig',
        details: [],
        status: 'done',
      },
    };
  }
  if (call.name === 'household_values') {
    const column = call.args.column as ValueColumn;
    const values = valuesOf(column, data);
    const shown = values.slice(0, AGENT_TOOL_LIMITS.maxValues);
    return {
      output: JSON.stringify({
        column,
        total: values.length,
        values: shown,
        ...(shown.length < values.length ? { truncated: true } : {}),
      }),
      step: {
        id: stepId,
        kind: 'tool',
        label: VALUE_COLUMNS[column].label,
        details: [],
        count: values.length,
        status: 'done',
      },
    };
  }

  const tool = LIST_TOOLS[call.name];
  const { args } = call;
  const everything = tool.items(data, args);
  const query = typeof args.query === 'string' ? args.query : undefined;
  const matching = everything.filter(
    (item) =>
      tool.matches(item, args, data) && (query === undefined || contains(tool.search(item), query)),
  );
  const sortKey = typeof args.sort === 'string' ? args.sort : tool.defaultSort;
  const sort = tool.sorts[sortKey] ?? tool.sorts[tool.defaultSort]!;
  const descending = args.descending === true;
  const tie = tool.sorts[tool.defaultSort]!;
  const sorted = [...matching].sort((a, b) => {
    const order = compare(sort.value(a), sort.value(b), sort.nullsLow === true);
    // Without a value (no rating) always last, in either direction.
    if (order === 0 && (sort.value(a) === null) !== (sort.value(b) === null))
      return sort.value(a) === null ? 1 : -1;
    if (order !== 0) return descending ? -order : order;
    return compare(tie.value(a), tie.value(b), false);
  });
  const limit =
    typeof args.limit === 'number'
      ? args.limit
      : (tool.defaultLimit ?? AGENT_TOOL_LIMITS.defaultLimit);
  const offset = typeof args.offset === 'number' ? args.offset : 0;
  const fields = strings(args.fields).length > 0 ? strings(args.fields) : [...tool.defaultFields];
  const page = sorted
    .slice(offset, offset + limit)
    .map((item) => Object.fromEntries(fields.map((field) => [field, item[field] ?? null])));
  const nextOffset = offset + page.length < sorted.length ? offset + page.length : null;
  const extra = tool.extra?.(data, args) ?? {};
  const head = {
    total: sorted.length,
    offset,
    limit,
    next_offset: nextOffset,
    ...extra,
  };
  const fit = fitted(head, page);
  return {
    output: fit.text,
    step: listStep(tool, args, stepId, {
      total: sorted.length,
      all: tool.all(data, everything),
      shown: fit.shown,
      offset,
    }),
  };
}

function listStep(
  tool: ListTool,
  args: Args,
  stepId: string,
  counts: { total: number; all?: number; shown: number; offset: number },
): ToolStep {
  const query = typeof args.query === 'string' ? args.query : undefined;
  const sortKey = typeof args.sort === 'string' ? args.sort : tool.defaultSort;
  const sort = tool.sorts[sortKey] ?? tool.sorts[tool.defaultSort]!;
  const descending = args.descending === true;
  const fields = strings(args.fields).length > 0 ? strings(args.fields) : [...tool.defaultFields];
  const labels = tool.labels(args);
  const search = query ? [`Suche ${quoted(query)}`] : [];
  const detail = [tool.detail?.(args), ...search, ...labels.map((label) => label.short)]
    .filter(Boolean)
    .join(' · ');
  const long = [...search, ...labels.map((label) => label.long)];
  const noun = tool.countNoun;
  return {
    id: stepId,
    kind: 'tool',
    label: tool.label,
    ...(detail ? { detail } : {}),
    details: [
      ...(long.length > 0 ? [`Filter: ${long.join(', ')}`] : []),
      `Sortiert nach ${sort.label}, ${descending ? sort.down : sort.up}`,
      `Felder: ${fields.map((field) => tool.fields[field] ?? field).join(', ')}`,
      counts.shown > 0
        ? `Einträge ${counts.offset + 1}–${counts.offset + counts.shown}`
        : 'keine Einträge',
    ],
    count: counts.total,
    countLabel: noun
      ? counts.total === 1
        ? 'Eintrag'
        : noun
      : counts.all !== undefined
        ? `von ${counts.all}`
        : 'Treffer',
    status: 'done',
  };
}

/** The label of a tool's step while it runs ("Liest eure Rezepte …"). */
export function toolLabel(name: string): string {
  return isToolName(name) ? TOOL_LABEL[name] : 'Unbekanntes Werkzeug';
}

/**
 * The step of a call in a stored conversation (a chat opened from "Verlauf"): what was asked from
 * the arguments, how many from the output; the household's whole count is not known any more.
 */
export function storedToolStep(
  name: string,
  rawArgs: string,
  rawOutput: string,
  stepId: string,
): ToolStep {
  const call = parseToolCall(name, rawArgs);
  let output: Record<string, unknown> = {};
  try {
    output = record(JSON.parse(rawOutput));
  } catch {
    // An interrupted call: no output.
  }
  if (!call.ok || typeof output.error === 'string') {
    const label = toolLabel(name);
    return {
      id: stepId,
      kind: 'tool',
      label,
      ...(call.ok || call.error === 'invalid_arguments' ? { detail: 'Anfrage ungültig' } : {}),
      details: [],
      status: 'done',
    };
  }
  const total = num(output.total);
  if (call.name === 'household_values') {
    return {
      id: stepId,
      kind: 'tool',
      label: VALUE_COLUMNS[call.args.column as ValueColumn].label,
      details: [],
      ...(total !== undefined ? { count: total } : {}),
      status: 'done',
    };
  }
  return listStep(LIST_TOOLS[call.name], call.args, stepId, {
    total: total ?? 0,
    shown: list(output.items).length,
    offset: num(output.offset) ?? 0,
  });
}
