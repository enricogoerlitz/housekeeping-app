// Recipe Markdown ↔ household database, through the app's own code paths.
//
//   pnpm exec tsx .claude/skills/recipe-crud/scripts/recipes.ts check <file|dir>...
//   pnpm exec tsx .claude/skills/recipe-crud/scripts/recipes.ts plan  --household "<Name>" [--target local|<project-ref>] [--hints <json>] <file|dir>...
//   pnpm exec tsx .claude/skills/recipe-crud/scripts/recipes.ts apply <plan.json>
//   pnpm exec tsx .claude/skills/recipe-crud/scripts/recipes.ts pending  --household "<Name>" [--target <ref>]
//   pnpm exec tsx .claude/skills/recipe-crud/scripts/recipes.ts articles --household "<Name>" [--target <ref>]
//   pnpm exec tsx .claude/skills/recipe-crud/scripts/recipes.ts verify   --household "<Name>" [--target <ref>]
//
// It creates and changes; it never deletes (the household deletes in the app).
//
// The format of a recipe file is docs/recipes/README.md. A file is turned into the app's domain
// object (core `Recipe`), ingredients are matched to the household's articles with the app's rule
// for ingredients nobody chose (core `resolveIngredientArticles` with the starter catalog), and the
// rows come from the app's own mapping (api `householdToRows`). `apply` writes them with the app's
// RPC `apply_changes`, run as a member of the household (role authenticated, RLS and every check
// of the server apply), so a change the app would refuse is refused here as well.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

import {
  findArticleByName,
  normalizeText,
  spelledAlike,
  suggestSimilarArticle,
  parseAmount,
  resolveIngredientArticles,
  defaultShoppingRuleFor,
  type Area,
  type Article,
  type CollectionRecipe,
  type Course,
  type Diet,
  type Recipe,
  type RecipeIngredient,
  type RecipeStep,
  type RecipeVariant,
  type ShoppingRule,
  type RecipeSection,
  sectionDraft,
  stepTimerProblem,
  validateSectionDraft,
} from '../../../../packages/core/src/index';
import { householdToRows, rowsToHousehold } from '../../../../packages/api/src/db/mapping';
import { PATCH_COLUMNS, WRITABLE_COLUMNS } from '../../../../packages/api/src/db/tables';
import { starterCatalogEntries } from '../../../../packages/api/src/starter/entries';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const DOCS = path.join(ROOT, 'docs/recipes');
const OUT = path.join(ROOT, 'tmp/recipe-crud');

// ---------- Markdown → parsed recipe ----------

const COURSES: Record<string, Course> = {
  Frühstück: 'breakfast',
  Hauptgericht: 'main',
  Beilage: 'side',
  Dessert: 'dessert',
  Snack: 'snack',
  Getränk: 'drink',
};
const RULES: Record<string, ShoppingRule> = { Menge: 'recipeAmount', '1×': 'count', '1x': 'count', nie: 'skip' };

interface ParsedIngredient {
  menge?: string;
  zutat: string;
  gruppe?: string;
  variante?: string;
  hinweis?: string;
  einkauf?: ShoppingRule;
}
interface Parsed {
  file: string;
  slug: string;
  fm: Record<string, any>;
  description?: string;
  ingredients: ParsedIngredient[];
  steps: { text: string; variante?: string; timer?: number }[];
  notes?: string;
  contains: string[]; // slugs of contained recipes (collections)
}

function sections(body: string): Map<string, string> {
  const map = new Map<string, string>();
  const parts = body.split(/^## /m);
  map.set('_intro', parts[0] ?? '');
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n');
    map.set(part.slice(0, nl).trim(), part.slice(nl + 1));
  }
  return map;
}

export function parseRecipeFile(file: string): { parsed?: Parsed; errors: string[] } {
  const errors: string[] = [];
  const text = readFileSync(file, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { errors: ['keine Front Matter'] };
  let fm: Record<string, any>;
  try {
    fm = parseYaml(m[1]!) ?? {};
  } catch (e) {
    return { errors: [`YAML: ${(e as Error).message.split('\n')[0]}`] };
  }
  const s = sections(m[2]!);
  const intro = (s.get('_intro') ?? '')
    .split('\n')
    .filter((l) => !/^#\s/.test(l) && !/^!\[/.test(l.trim()))
    .join('\n')
    .trim();

  const ingredients: ParsedIngredient[] = [];
  for (const line of (s.get('Zutaten') ?? '').split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells[1] === 'Zutat' || /^:?-{2,}/.test(cells[0] ?? '')) continue;
    if (cells.length < 6) {
      errors.push(`Zutatenzeile mit ${cells.length} statt 6 Spalten: ${line.trim()}`);
      continue;
    }
    const [menge, zutat, gruppe, variante, hinweis, einkauf] = cells as [string, string, string, string, string, string];
    if (!zutat) errors.push(`Zutat ohne Namen: ${line.trim()}`);
    let rule: ShoppingRule | undefined;
    if (einkauf) {
      rule = RULES[einkauf];
      if (!rule) errors.push(`Unbekannte Einkaufsregel „${einkauf}“ bei ${zutat}`);
    }
    ingredients.push({
      zutat,
      ...(menge ? { menge } : {}),
      ...(gruppe ? { gruppe } : {}),
      ...(variante ? { variante } : {}),
      ...(hinweis ? { hinweis } : {}),
      ...(rule ? { einkauf: rule } : {}),
    });
  }

  const steps: Parsed['steps'] = [];
  for (const raw of (s.get('Zubereitung') ?? '').split('\n')) {
    const line = raw.trimEnd();
    const item = line.match(/^\d+\.\s+(.*)$/);
    if (item) steps.push({ text: item[1]! });
    else if (line.trim() && steps.length > 0) steps[steps.length - 1]!.text += ` ${line.trim()}`;
  }
  for (const step of steps) {
    const v = step.text.match(/^\[([^\]]+)\]\s*/);
    if (v) {
      step.variante = v[1]!;
      step.text = step.text.slice(v[0].length);
    }
    const t = step.text.match(/\s*⏱\s*(\d+)\s*$/);
    if (t) {
      step.timer = Number(t[1]);
      step.text = step.text.slice(0, t.index).trim();
    }
  }

  const notes = (s.get('Notizen') ?? '')
    .split('\n')
    .filter((l) => !/^\s*(-\s*)?\**OFFEN:?/i.test(l))
    .join('\n')
    .trim();
  const contains = [...(s.get('Enthält') ?? '').matchAll(/\]\(([^)]+?)\.md\)/g)].map((x) => path.basename(x[1]!));

  // Checks that the database would otherwise reject less readably.
  const art = fm.art ?? 'rezept';
  if (!['rezept', 'sammlung'].includes(art)) errors.push(`art „${art}“`);
  if (!fm.titel || typeof fm.titel !== 'string') errors.push('titel fehlt');
  if (art === 'rezept' && !COURSES[fm.gang]) errors.push(`gang „${fm.gang}“ unbekannt`);
  if (!Number.isInteger(fm.portionen) || fm.portionen < 1 || fm.portionen > 100) errors.push(`portionen „${fm.portionen}“`);
  if (fm.dauer_min != null && (!Number.isInteger(fm.dauer_min) || fm.dauer_min < 1)) errors.push(`dauer_min „${fm.dauer_min}“`);
  const variants: { name: string; standard: boolean }[] = fm.varianten ?? [];
  if (variants.length > 0 && variants.filter((v) => v.standard).length !== 1) errors.push('nicht genau eine Standardvariante');
  const variantNames = new Set(variants.map((v) => v.name));
  for (const i of ingredients) if (i.variante && !variantNames.has(i.variante)) errors.push(`Zutat ${i.zutat}: Variante „${i.variante}“ fehlt in varianten`);
  for (const st of steps) if (st.variante && !variantNames.has(st.variante)) errors.push(`Schritt: Variante „${st.variante}“ fehlt in varianten`);
  for (const st of steps) if (/\[[^\]]+\]/.test(st.text)) errors.push(`Variantenmarker mitten im Schritt: „${st.text.slice(0, 70)}…“`);
  for (const st of steps) {
    const problem = st.timer === undefined ? undefined : stepTimerProblem(String(st.timer));
    if (problem) errors.push(`Timer ⏱ ${st.timer}: ${problem} (längeres Warten gehört in vorlauf)`);
  }
  if (art === 'rezept' && steps.length === 0) errors.push('keine Zubereitungsschritte');
  if (art === 'rezept' && ingredients.length === 0) errors.push('keine Zutaten');
  if (fm.vorlauf && (typeof fm.vorlauf.text !== 'string' || typeof fm.vorlauf.stunden_vorher !== 'number')) errors.push('vorlauf braucht text und stunden_vorher');

  return {
    parsed: {
      file,
      slug: path.basename(file, '.md'),
      fm,
      ...(intro ? { description: intro } : {}),
      ingredients,
      steps,
      ...(notes ? { notes } : {}),
      contains,
    },
    errors,
  };
}

function collectFiles(inputs: string[]): string[] {
  const files: string[] = [];
  const walk = (p: string) => {
    if (statSync(p).isDirectory()) {
      for (const n of readdirSync(p).sort()) if (n !== 'pictures') walk(path.join(p, n));
    } else if (p.endsWith('.md') && !['README.md', 'UEBERSICHT.md'].includes(path.basename(p))) files.push(path.resolve(p));
  };
  inputs.forEach(walk);
  return files;
}

function check(inputs: string[]): Parsed[] {
  const all: Parsed[] = [];
  let bad = 0;
  const slugs = new Map<string, string>();
  for (const file of collectFiles(inputs)) {
    const { parsed, errors } = parseRecipeFile(file);
    if (parsed) {
      const other = slugs.get(parsed.slug);
      if (other) errors.push(`Dateiname doppelt mit ${path.relative(ROOT, other)}`);
      slugs.set(parsed.slug, file);
      all.push(parsed);
    }
    if (errors.length) {
      bad++;
      console.log(`✗ ${path.relative(ROOT, file)}\n  - ${errors.join('\n  - ')}`);
    }
  }
  console.log(`${all.length} Dateien gelesen, ${bad} mit Fehlern`);
  if (bad) process.exitCode = 1;
  return all;
}

// ---------- database access (Supabase CLI) ----------

function query(target: string, sql: string, write = false): any[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'recipes-'));
  const file = path.join(dir, 'q.sql');
  writeFileSync(file, sql);
  try {
    const args = ['exec', 'supabase', 'db', 'query', '-o', 'json', '-f', file];
    if (target !== 'local') args.push(`--remote=${target}`);
    args.push(write ? '--yes' : '--read-only');
    const out = execFileSync('pnpm', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
    // A DO block returns no rows and may print nothing at all.
    const start = out.indexOf('{');
    if (start === -1) return [];
    const json = JSON.parse(out.slice(start));
    return json.rows ?? [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * One statement (the CLI sends a single prepared statement) that runs `body` as a member of the
 * household: role authenticated with her JWT claims, so RLS and the RPCs' own checks apply. A DO
 * block runs in one transaction, so any error rolls the whole block back.
 */
function asMember(claims: string, body: string): string {
  const tag = `do${randomUUID().replace(/-/g, '')}`;
  return `do $${tag}$ begin
  perform set_config('request.jwt.claims', ${lit(claims)}, true);
  set local role authenticated;
  ${body}
end $${tag}$;`;
}

function loadState(target: string, householdName: string) {
  const [hh] = query(target, `select id, name from public.households where name = ${lit(householdName)}`);
  if (!hh) throw new Error(`Haushalt „${householdName}“ gibt es in ${target} nicht.`);
  const id: string = hh.id;
  const members = query(target, `select profile_id from public.household_members where household_id = ${lit(id)} order by created_at`);
  const areas = query(target, `select id, name, sort from public.areas where household_id = ${lit(id)}`);
  const articles = query(target, `select * from public.articles where household_id = ${lit(id)}`);
  const recipes = query(target, `select * from public.recipes where household_id = ${lit(id)}`);
  const links = query(target, `select * from public.collection_recipes where household_id = ${lit(id)}`);
  const usage = query(
    target,
    `select r.id,
       (select count(*) from public.recipe_favorites f where f.recipe_id = r.id) as favorites,
       (select count(*) from public.recipe_ratings x where x.recipe_id = r.id) as ratings,
       (select count(*) from public.meal_plan_entries m where m.recipe_id = r.id) as plans
     from public.recipes r where r.household_id = ${lit(id)}`,
  );
  return { id, memberId: members[0]?.profile_id as string, areas, articles, recipes, links, usage };
}

function toArticle(row: any): Article {
  return {
    id: row.id,
    name: row.name,
    synonyms: row.synonyms ?? [],
    diet: row.diet,
    isPantry: row.is_pantry,
    needsReview: row.needs_review,
    createdAt: row.created_at,
    ...(row.area_id ? { areaId: row.area_id } : {}),
    ...(row.default_shopping_rule ? { defaultShoppingRule: row.default_shopping_rule } : {}),
  };
}

/** JSON with sorted keys and missing = null, the way jsonb compares (key order is not kept). */
function canon(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]))
        : v;
  return JSON.stringify(sort(value ?? null));
}

// ---------- plan ----------

interface Hint {
  diet?: Diet;
  area?: string;
  isPantry?: boolean;
}

function plan(
  inputs: string[],
  householdName: string,
  target: string,
  hintsFile: string | undefined,
  options: { byTitle: boolean },
) {
  const parsedAll = check(inputs);
  if (process.exitCode) throw new Error('Erst die Formatfehler beheben.');
  const state = loadState(target, householdName);
  const hints: Record<string, Hint> = hintsFile ? JSON.parse(readFileSync(hintsFile, 'utf8')) : {};
  const areas: Area[] = state.areas.map((a: any) => ({ id: a.id, name: a.name, sort: a.sort }));
  const existingArticles = state.articles.map(toArticle);
  const recipeRows = new Map<string, any>(state.recipes.map((r: any) => [r.id, r]));
  const usage = new Map<string, any>(state.usage.map((u: any) => [u.id, u]));

  // Articles: one resolution over every ingredient name, so a new article is created once.
  const typed = [...new Set(parsedAll.flatMap((p) => p.ingredients.map((i) => i.zutat)))];
  // A name spelled like an existing article ("Zwiebeln" ↔ "Zwiebel", the app's "Meinst du …?")
  // or like another new name uses that one, so the import adds no near-duplicate articles.
  const alias = new Map<string, string>();
  const newNames: string[] = [];
  for (const name of typed) {
    if (findArticleByName(name, existingArticles)) continue;
    const similar = suggestSimilarArticle(name, existingArticles);
    const earlier = similar ? undefined : newNames.find((other) => spelledAlike(other, name));
    if (similar) alias.set(name, similar.name);
    else if (earlier) alias.set(name, earlier);
    else newNames.push(name);
  }
  const names = typed.map((name) => alias.get(name) ?? name);
  const resolved = resolveIngredientArticles(names, {
    articles: existingArticles,
    catalog: starterCatalogEntries,
    areas,
    newId: randomUUID,
  });
  const articleIdByName = new Map(typed.map((n, i) => [n, resolved.articleIds[i]!]));
  const newArticles: Article[] = resolved.created.map((draft) => {
    const article: Article = { ...draft, createdAt: new Date().toISOString() };
    const hint = hints[draft.name];
    if (hint && draft.needsReview) {
      if (hint.diet) article.diet = hint.diet;
      if (hint.isPantry !== undefined) article.isPantry = hint.isPantry;
      const area = hint.area && areas.find((a) => normalizeText(a.name) === normalizeText(hint.area!));
      if (area) article.areaId = area.id;
    }
    return article;
  });
  const articlesById = new Map([...existingArticles, ...newArticles].map((a) => [a.id, a]));

  // Recipes: bestand_id → patch of that row; otherwise a new row. A changed kind
  // (Sammlung → Rezept) cannot be patched (spec 0009, E2): new row, the old one is deleted.
  const idBySlug = new Map<string, string>();
  const recipes: Recipe[] = [];
  const replaced: { oldId: string; title: string; favorites: number; ratings: number; plans: number }[] = [];
  const photos: { slug: string; local: string; storagePath: string }[] = [];
  const byTitle = new Map<string, any[]>();
  for (const r of state.recipes) byTitle.set(normalizeText(r.title), [...(byTitle.get(normalizeText(r.title)) ?? []), r]);
  const created: { file: string; id: string }[] = [];
  const tracked = readTracking()[target]?.[householdName] ?? {};
  const files: { file: string; id: string }[] = [];
  const problems: string[] = [];
  // Each row belongs to at most one file: first the files that name it, then title matches.
  const claimed = new Set<string>(parsedAll.map((p) => p.fm.bestand_id).filter((id) => id && recipeRows.has(id)));
  const claimedBy = new Map<string, string>();
  for (const p of parsedAll) {
    const kind = (p.fm.art ?? 'rezept') === 'sammlung' ? 'collection' : 'recipe';
    let old = p.fm.bestand_id ? recipeRows.get(p.fm.bestand_id) : undefined;
    if (old) {
      const other = claimedBy.get(old.id);
      if (other) problems.push(`${p.slug}: bestand_id ${old.id} steht auch in ${other}.`);
      claimedBy.set(old.id, p.slug);
    } else if (p.fm.bestand_id) {
      // The ids in the files belong to production; a local test run falls back to the title.
      if (target !== 'local') problems.push(`${p.slug}: bestand_id ${p.fm.bestand_id} gibt es nicht (mehr).`);
    }
    if (!old) {
      const same = (byTitle.get(normalizeText(p.fm.titel)) ?? []).filter((r) => !claimed.has(r.id));
      // Never create a second recipe of the same name by accident (re-run, file without id).
      if (same.length === 1 && options.byTitle) {
        old = same[0];
        claimed.add(old.id);
      } else if (same.length > 0)
        problems.push(`${p.slug}: „${p.fm.titel}“ gibt es schon (${same.map((r) => r.id).join(', ')}); bestand_id setzen, Titel ändern oder --by-title`);
    }
    const keepRow = old && old.kind === kind;
    if (old && !keepRow) {
      const u = usage.get(old.id) ?? {};
      replaced.push({ oldId: old.id, title: old.title, favorites: +u.favorites || 0, ratings: +u.ratings || 0, plans: +u.plans || 0 });
    }
    const id: string = keepRow ? old.id : randomUUID();
    idBySlug.set(p.slug, id);
    files.push({ id, file: p.file });
    if (!keepRow) created.push({ file: p.file, id });

    // Variant ids survive by name, so plan entries that chose a variant keep it.
    const oldVariants: RecipeVariant[] = keepRow ? (old.variants ?? []) : [];
    const variants: RecipeVariant[] = (p.fm.varianten ?? []).map((v: any) => ({
      id: oldVariants.find((o) => o.name === v.name)?.id ?? randomUUID(),
      name: v.name,
      isDefault: Boolean(v.standard),
    }));
    const variantId = (name?: string) => (name ? variants.find((v) => v.name === name)!.id : undefined);

    // Ids of rows that stayed in place survive, so an unchanged recipe produces no change.
    const oldIngredients: RecipeIngredient[] = keepRow ? (old.ingredients ?? []) : [];
    const oldSteps: RecipeStep[] = keepRow ? (old.steps ?? []) : [];
    const ingredients: RecipeIngredient[] = p.ingredients.map((i, index) => {
      const articleId = articleIdByName.get(i.zutat)!;
      const amount = i.menge ? parseAmount(i.menge) : undefined;
      const same = oldIngredients[index]?.articleId === articleId ? oldIngredients[index] : undefined;
      const ing: RecipeIngredient = {
        id: same?.id ?? randomUUID(),
        articleId,
        shoppingRule: i.einkauf ?? defaultShoppingRuleFor(articlesById.get(articleId)!, amount),
      };
      if (amount) ing.amount = amount;
      const v = variantId(i.variante);
      if (v) ing.variantId = v;
      if (i.hinweis) ing.prepNote = i.hinweis;
      if (i.gruppe) ing.group = i.gruppe;
      return ing;
    });
    const steps: RecipeStep[] = p.steps.map((st, index) => {
      const step: RecipeStep = { id: oldSteps[index]?.id ?? randomUUID(), text: st.text };
      const v = variantId(st.variante);
      if (v) step.variantId = v;
      if (st.timer) step.timerMinutes = st.timer;
      return step;
    });

    let photoPath: string | undefined = keepRow ? (old.photo_path ?? undefined) : undefined;
    // A picture is uploaded when the recipe has none yet or the file is newer than our last write.
    const picture = p.fm.bild ? path.join(DOCS, p.fm.bild) : undefined;
    const lastWrite = tracked[id]?.bearbeitet;
    const pictureIsNew =
      picture !== undefined && existsSync(picture) && (!photoPath || !lastWrite || statSync(picture).mtime > new Date(lastWrite));
    if (pictureIsNew) {
      photoPath = `${state.id}/recipes/${id}/${randomUUID()}.jpg`;
      photos.push({ slug: p.slug, local: path.join(DOCS, p.fm.bild), storagePath: photoPath });
    }

    const recipe: Recipe = {
      id,
      kind,
      title: p.fm.titel.trim(),
      servings: p.fm.portionen,
      tags: kind === 'recipe' ? (p.fm.tags ?? []).map(String) : [],
      variants: kind === 'recipe' ? variants : [],
      ingredients,
      steps: kind === 'recipe' ? steps : [],
      favoriteOf: [],
      ratings: {},
      cookedCount: keepRow ? old.cooked_count : 0,
      createdAt: keepRow ? old.created_at : new Date().toISOString(),
      links: (p.fm.links ?? []).map((l: any) => (typeof l === 'string' ? { url: l } : l)),
    };
    if (photoPath) recipe.photoPath = photoPath;
    if (p.description) recipe.description = p.description;
    if (p.notes) recipe.notes = p.notes;
    if (kind === 'recipe') {
      recipe.course = COURSES[p.fm.gang]!;
      if (p.fm.kueche) recipe.cuisine = String(p.fm.kueche);
      if (p.fm.dauer_min) recipe.totalMinutes = p.fm.dauer_min;
      if (p.fm.vorlauf) recipe.leadTime = { text: p.fm.vorlauf.text, hoursBefore: p.fm.vorlauf.stunden_vorher };
    }
    if (keepRow && old.last_cooked_on) recipe.lastCookedOn = old.last_cooked_on;
    recipes.push(recipe);
    // The app's own editor rules (limits of every field, timers, variants), section by section.
    const sectionsToCheck: RecipeSection[] =
      kind === 'recipe' ? ['head', 'classification', 'ingredients', 'steps', 'notes', 'links'] : ['head', 'ingredients', 'notes', 'links'];
    for (const section of sectionsToCheck)
      for (const problem of validateSectionDraft(sectionDraft(recipe, section)))
        problems.push(`${p.slug}: ${section}/${problem.field}: ${problem.message}`);
  }
  if (problems.length) {
    console.log(`\n✗ Nichts geplant:\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }

  // Collections: their contained recipes, by file name.
  const collectionRecipes: CollectionRecipe[] = [];
  const replaceLinksOf = new Set<string>();
  for (const p of parsedAll) {
    if ((p.fm.art ?? 'rezept') !== 'sammlung') continue;
    const collectionId = idBySlug.get(p.slug)!;
    replaceLinksOf.add(collectionId);
    p.contains.forEach((slug, sort) => {
      const recipeId = idBySlug.get(slug);
      if (!recipeId) throw new Error(`${p.slug}: enthält ${slug}, das nicht im Import ist.`);
      collectionRecipes.push({ id: randomUUID(), collectionId, recipeId, sort });
    });
  }

  // Rows through the app's own mapping.
  const rows = householdToRows({
    household: { id: state.id, name: householdName, memberIds: [], mealSlots: [], timeZone: 'Europe/Berlin' },
    areas: [],
    articles: newArticles,
    stores: [],
    recipes,
    collectionRecipes,
    restaurants: [],
    activities: [],
    planEntries: [],
    items: [],
    chores: [],
    choreEvents: [],
    trips: [],
    feedback: [],
    packingBags: [],
    packingBagItems: [],
    packingListBags: [],
    packingItems: [],
  } as any);
  const pick = (row: any, cols: readonly string[]) => Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c]]));
  const insert = (table: keyof typeof WRITABLE_COLUMNS, row: any) => ({
    kind: 'insert',
    table,
    row: { id: row.id, household_id: state.id, ...pick(row, WRITABLE_COLUMNS[table]) },
  });

  const ops: any[] = [];
  const backup: any[] = [];
  for (const row of rows.articles ?? []) ops.push(insert('articles', row));
  for (const row of rows.recipes ?? []) {
    const old = recipeRows.get(row.id);
    if (!old) {
      ops.push(insert('recipes', row));
      continue;
    }
    backup.push(old);
    // Never overwrite what the household did with the recipe (cooked, last cooked).
    const cols = (PATCH_COLUMNS.recipes ?? WRITABLE_COLUMNS.recipes).filter((c) => c !== 'cooked_count' && c !== 'last_cooked_on');
    const changes = Object.fromEntries(
      cols.filter((c) => c in row && canon(row[c]) !== canon(old[c])).map((c) => [c, row[c]]),
    );
    if (Object.keys(changes).length) ops.push({ kind: 'patch', table: 'recipes', id: row.id, changes });
  }
  // Contained recipes: only added, never removed (this tool never deletes). A link the file no
  // longer has is reported; the household removes it in the app if it should go.
  const linkKey = (collectionId: string, recipeId: string) => `${collectionId}:${recipeId}`;
  const existingLinks = new Set(state.links.map((l: any) => linkKey(l.collection_id, l.recipe_id)));
  const fileLinks = new Set(collectionRecipes.map((l) => linkKey(l.collectionId, l.recipeId)));
  for (const row of rows.collection_recipes ?? [])
    if (!existingLinks.has(linkKey(row.collection_id, row.recipe_id))) ops.push(insert('collection_recipes', row));
  const staleLinks = state.links
    .filter((l: any) => replaceLinksOf.has(l.collection_id) && !fileLinks.has(linkKey(l.collection_id, l.recipe_id)))
    .map((l: any) => `${recipeRows.get(l.collection_id)?.title} → ${recipeRows.get(l.recipe_id)?.title}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(OUT, { recursive: true });
  const planFile = path.join(OUT, `plan-${stamp}.json`);
  const result = { target, household: { id: state.id, name: householdName }, memberId: state.memberId, ops, photos, replaced, backup, created, files };
  writeFileSync(planFile, JSON.stringify(result, null, 1));

  const newNeedsReview = newArticles.filter((a) => a.needsReview);
  console.log(`\nPlan für „${householdName}“ (${target}): ${path.relative(ROOT, planFile)}`);
  console.log(`  neue Rezepte/Sammlungen: ${ops.filter((o) => o.kind === 'insert' && o.table === 'recipes').length}`);
  console.log(`  geänderte Rezepte:       ${ops.filter((o) => o.kind === 'patch').length}`);
  console.log(`  neue Artikel:            ${newArticles.length} (davon „Neu aus Rezepten“: ${newNeedsReview.length}, ohne Ernährung: ${newArticles.filter((a) => a.diet === 'unknown').length})`);
  console.log(`  Fotos hochladen:         ${photos.length}`);
  console.log(
    `  neu statt umgebaut (Art geändert; die alte Zeile bleibt, die löscht ihr in der App): ${replaced.map((r) => `${r.title} [Favoriten ${r.favorites}, Bewertungen ${r.ratings}, im Plan ${r.plans}]`).join('; ') || '–'}`,
  );
  if (staleLinks.length) console.log(`  in Sammlungen, aber nicht mehr in der Datei (bleibt, bitte in der App entfernen): ${staleLinks.join('; ')}`);
  console.log(`  Namen auf bestehende Artikel gelegt: ${alias.size} (${path.relative(ROOT, OUT)}/aliases.json)`);
  writeFileSync(path.join(OUT, 'aliases.json'), JSON.stringify(Object.fromEntries(alias), null, 1));
  writeFileSync(path.join(OUT, 'new-articles.json'), JSON.stringify(newArticles.map((a) => a.name), null, 1));
  const unknown = newArticles.filter((a) => a.diet === 'unknown').map((a) => a.name);
  if (unknown.length) writeFileSync(path.join(OUT, 'unknown-articles.json'), JSON.stringify(unknown, null, 1));
  return planFile;
}

// ---------- apply ----------

/** Writes `bestand_id: <id>` into the front matter (replacing a null or old value). */
function setBestandId(file: string, id: string) {
  const text = readFileSync(file, 'utf8');
  const next = /^bestand_id:.*$/m.test(text)
    ? text.replace(/^bestand_id:.*$/m, `bestand_id: ${id}`)
    : text.replace(/^---\n/, `---\nbestand_id: ${id}\n`);
  writeFileSync(file, next);
}

function apply(planFile: string) {
  const p = JSON.parse(readFileSync(planFile, 'utf8'));
  const { target, household, memberId, ops, photos, replaced } = p;
  if (!memberId) throw new Error('Kein Mitglied im Haushalt gefunden.');
  // This tool creates and changes, it never deletes (the household deletes in the app).
  if (ops.some((op: any) => op.kind === 'delete')) throw new Error('Der Plan enthält ein Löschen; das macht dieses Werkzeug nicht.');
  writeFileSync(planFile.replace(/\.json$/, '.backup.json'), JSON.stringify(p.backup, null, 1));

  // 1. Photos: one recursive upload of a folder laid out like the bucket.
  if (photos.length) {
    const stage = mkdtempSync(path.join(tmpdir(), 'recipe-photos-'));
    for (const ph of photos) {
      const dest = path.join(stage, ph.storagePath);
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(ph.local, dest);
    }
    const args = ['exec', 'supabase', 'storage', 'cp', '-r', '--experimental', path.join(stage, household.id), 'ss:///household-media/'];
    if (target !== 'local') args.push(`--remote=${target}`, '--yes');
    execFileSync('pnpm', args, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    rmSync(stage, { recursive: true, force: true });
    console.log(`${photos.length} Fotos hochgeladen`);
  }

  // 2. Rows: apply_changes as the member, in chunks (server limit 200 ops, 20 deletes per call).
  const claims = JSON.stringify({ sub: memberId, role: 'authenticated' });
  const chunks: any[][] = [];
  let chunk: any[] = [];
  let bytes = 0;
  let deletes = 0;
  for (const op of ops) {
    const size = JSON.stringify(op).length;
    if (chunk.length >= 150 || bytes + size > 400_000 || (op.kind === 'delete' && deletes >= 20)) {
      chunks.push(chunk);
      chunk = [];
      bytes = 0;
      deletes = 0;
    }
    chunk.push(op);
    bytes += size;
    if (op.kind === 'delete') deletes++;
  }
  if (chunk.length) chunks.push(chunk);
  chunks.forEach((c, i) => {
    const tag = `ops${randomUUID().replace(/-/g, '')}`;
    query(
      target,
      asMember(
        claims,
        `perform public.apply_changes(${lit(household.id)}::uuid, $${tag}$${JSON.stringify(c)}$${tag}$::jsonb);`,
      ),
      true,
    );
    console.log(`Änderungen ${i + 1}/${chunks.length} angewandt (${c.length})`);
    // A file whose recipe now exists remembers its id, so a re-run patches instead of duplicating.
    // Only for a remote target: the ids in the files are those of production.
    if (target === 'local') return;
    const written = new Set(c.filter((op) => op.kind === 'insert' && op.table === 'recipes').map((op) => op.row.id));
    for (const { file, id } of p.created ?? []) if (written.has(id)) setBestandId(file, id);
  });

  // 3. Recipes whose kind changed got a new row; the old one stays until the household deletes it.
  for (const r of replaced) console.log(`Bitte in der App löschen (alte Zeile): ${r.title} (${r.oldId})`);

  // 4. Verify: every written recipe is there, and remember what was worked on (db.json).
  const ids: string[] = [...new Set<string>(ops.filter((o: any) => o.table === 'recipes').map((o: any) => o.id ?? o.row.id))];
  const rows = ids.length
    ? query(target, `select id, title, updated_at from public.recipes where id = any(array[${ids.map(lit).join(',')}]::uuid[])`)
    : [];
  console.log(`Geprüft: ${rows.length}/${ids.length} Rezepte vorhanden`);
  if (rows.length !== ids.length) process.exitCode = 1;
  if (target !== 'local') {
    const fileById = new Map<string, string>([
      ...(p.files ?? []).map((f: { id: string; file: string }) => [f.id, f.file] as [string, string]),
    ]);
    updateTracking(
      target,
      household.name,
      rows.map((r: any) => ({ id: r.id, title: r.title, updatedAt: r.updated_at, file: fileById.get(r.id) })),
    );
  }
}

// ---------- docs/recipes/db.json: what was worked on ----------

const TRACKING = path.join(DOCS, 'db.json');
interface Tracked {
  titel: string;
  datei?: string;
  /** Server time of our last write; a later updated_at means someone changed it in the app. */
  bearbeitet: string;
}
type Tracking = Record<string, Record<string, Record<string, Tracked>>>; // target → household → id

function readTracking(): Tracking {
  return existsSync(TRACKING) ? JSON.parse(readFileSync(TRACKING, 'utf8')) : {};
}

function updateTracking(target: string, household: string, rows: { id: string; title: string; updatedAt: string; file?: string }[]) {
  const all = readTracking();
  const mine = ((all[target] ??= {})[household] ??= {});
  for (const r of rows) {
    mine[r.id] = { titel: r.title, bearbeitet: r.updatedAt, ...(r.file ? { datei: path.relative(DOCS, r.file) } : {}) };
  }
  const sorted = Object.fromEntries(Object.entries(mine).sort(([, a], [, b]) => a.titel.localeCompare(b.titel, 'de')));
  all[target]![household] = sorted;
  writeFileSync(TRACKING, `${JSON.stringify(all, null, 1)}\n`);
  console.log(`${rows.length} Rezepte in docs/recipes/db.json vermerkt`);
}

// ---------- CLI ----------

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(name);
  if (i === -1) return undefined;
  const v = rest[i + 1];
  rest.splice(i, 2);
  return v;
};
if (cmd === 'check') check(rest.length ? rest : [DOCS]);
else if (cmd === 'plan') {
  const household = flag('--household');
  const target = flag('--target') ?? 'local';
  const hints = flag('--hints');
  const byTitle = rest.includes('--by-title');
  if (byTitle) rest.splice(rest.indexOf('--by-title'), 1);
  if (!household) throw new Error('--household fehlt');
  plan(rest, household, target, hints, { byTitle });
} else if (cmd === 'apply') apply(rest[0]!);
else if (cmd === 'verify') {
  // Reads the household as the app does after a pull (api rowsToHousehold) and checks references.
  const household = flag('--household');
  const target = flag('--target') ?? 'local';
  if (!household) throw new Error('verify --household "<Name>" [--target <ref>]');
  const [hh] = query(target, `select * from public.households where name = ${lit(household)}`);
  const where = `where household_id = ${lit(hh.id)}`;
  const tableNames = ['areas', 'articles', 'recipes', 'recipe_favorites', 'recipe_ratings', 'collection_recipes'];
  const tables: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const t of tableNames) {
    const rows = query(target, `select * from public.${t} ${where}`);
    tables[t] = Object.fromEntries(rows.map((r: any, i: number) => [r.id ?? `${t}-${i}`, r]));
  }
  const small = {
    households: [hh],
    household_members: query(target, `select * from public.household_members ${where}`),
  };
  const data = rowsToHousehold(tables as any, small as any, hh.id);
  const articleIds = new Set(data.articles.map((a) => a.id));
  let broken = 0;
  for (const r of data.recipes) {
    const variants = new Set(r.variants.map((v) => v.id));
    const bad = [
      ...r.ingredients.filter((i) => !articleIds.has(i.articleId)).map((i) => `Artikel ${i.articleId} fehlt`),
      ...r.ingredients.filter((i) => i.variantId && !variants.has(i.variantId)).map(() => 'Zutat mit unbekannter Variante'),
      ...r.steps.filter((s) => s.variantId && !variants.has(s.variantId)).map(() => 'Schritt mit unbekannter Variante'),
      ...(r.kind === 'recipe' && r.variants.length > 0 && r.variants.filter((v) => v.isDefault).length !== 1 ? ['nicht genau eine Standardvariante'] : []),
    ];
    if (bad.length) {
      broken++;
      console.log(`✗ ${r.title}: ${bad.join(', ')}`);
    }
  }
  console.log(`${data.recipes.length} Rezepte und ${data.articles.length} Artikel wie in der App gelesen, ${broken} mit Fehlern`);
  if (broken) process.exitCode = 1;
} else if (cmd === 'pending') {
  // Recipes nobody worked on yet (not in db.json) or changed in the app since our last write.
  // Writes them with their ingredient names to tmp/recipe-crud/pending.json, photos next to it.
  const household = flag('--household');
  const target = flag('--target') ?? 'local';
  if (!household) throw new Error('pending --household "<Name>" [--target <ref>]');
  const state = loadState(target, household);
  const tracked = readTracking()[target]?.[household] ?? {};
  const names = new Map<string, string>(state.articles.map((a: any) => [a.id, a.name]));
  const pending = state.recipes
    .filter((r: any) => !tracked[r.id] || new Date(r.updated_at) > new Date(tracked[r.id]!.bearbeitet))
    .map((r: any) => {
      const variantName = new Map<string, string>((r.variants ?? []).map((v: any) => [v.id, v.name]));
      return {
        id: r.id,
        status: tracked[r.id] ? 'in der App geändert' : 'unbearbeitet',
        datei: tracked[r.id]?.datei,
        art: r.kind === 'collection' ? 'sammlung' : 'rezept',
        titel: r.title,
        beschreibung: r.description,
        gang: r.course,
        kueche: r.cuisine,
        portionen: r.servings,
        dauer_min: r.total_minutes,
        varianten: (r.variants ?? []).map((v: any) => ({ name: v.name, standard: v.isDefault })),
        zutaten: (r.ingredients ?? []).map((i: any) => ({
          zutat: names.get(i.articleId),
          menge: i.amount?.text,
          gruppe: i.group,
          variante: i.variantId ? variantName.get(i.variantId) : undefined,
          hinweis: i.prepNote,
          einkauf: { recipeAmount: 'Menge', count: '1×', skip: 'nie' }[i.shoppingRule as string],
          zusatz: i.shoppingNote,
        })),
        schritte: (r.steps ?? []).map((st: any) => st.text),
        notizen: r.notes,
        links: r.links,
        foto: r.photo_path ? path.join('tmp/recipe-crud/photos', `${r.id}.jpg`) : undefined,
        photo_path: r.photo_path,
      };
    });
  mkdirSync(path.join(OUT, 'photos'), { recursive: true });
  for (const r of pending) {
    if (!r.photo_path || existsSync(path.join(ROOT, r.foto!))) continue;
    const args = ['exec', 'supabase', 'storage', 'cp', '--experimental', `ss:///household-media/${r.photo_path}`, path.join(ROOT, r.foto!)];
    if (target !== 'local') args.push(`--remote=${target}`);
    execFileSync('pnpm', args, { cwd: ROOT, stdio: 'ignore' });
  }
  writeFileSync(path.join(OUT, 'pending.json'), JSON.stringify(pending, null, 1));
  console.log(`${pending.length} offen (${path.relative(ROOT, OUT)}/pending.json):`);
  for (const r of pending) console.log(`  - ${r.titel} [${r.status}${r.datei ? `, ${r.datei}` : ''}]`);
} else if (cmd === 'articles') {
  // The household's articles, to write ingredient names that already exist.
  const household = flag('--household');
  const target = flag('--target') ?? 'local';
  if (!household) throw new Error('articles --household "<Name>" [--target <ref>]');
  const state = loadState(target, household);
  const area = new Map<string, string>(state.areas.map((a: any) => [a.id, a.name]));
  for (const a of [...state.articles].sort((x: any, y: any) => x.name.localeCompare(y.name, 'de')))
    console.log(`${a.name}${a.synonyms?.length ? ` (${a.synonyms.join(', ')})` : ''} · ${a.diet}${a.area_id ? ` · ${area.get(a.area_id)}` : ''}`);
}
else console.log('check | plan | apply — siehe Kopf der Datei');
