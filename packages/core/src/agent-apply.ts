import type { AgentAction } from './agent-proposals';
import { parseSmartInput } from './amounts';
import { findArticleByName } from './articles';
import { formatShortDate, relativeDayLabel, weekdayShort, weekdayLong } from './dates';
import { normalizeText } from './text';
import type {
  Activity,
  Article,
  Chore,
  Id,
  ISODate,
  MealPlanEntry,
  MealSlot,
  Recipe,
  RecurringItem,
  RecurringRule,
  Restaurant,
  ShoppingItem,
} from './types';

// Spec 0067, REQ-009: what a proposed change of the agent means in the household's own data. The
// app shows each entry with a line made from its data (never the model's words for what it does),
// knows the command it runs, and before applying reads again: an entry whose rows changed since
// the proposal (another device) is "stale" and deselected, one whose row is gone fails with the
// reason (AC-019). Each entry becomes exactly one of the app's commands (packages/api
// agent-actions.ts), nothing else.

/** The slices of the household's data a proposal is checked against. */
export interface ProposalData {
  today: ISODate;
  memberId: Id;
  mealSlots: readonly MealSlot[];
  articles: readonly Article[];
  items: readonly ShoppingItem[];
  chores: readonly Chore[];
  recipes: readonly Recipe[];
  restaurants: readonly Restaurant[];
  activities: readonly Activity[];
  planEntries: readonly MealPlanEntry[];
  recurringItems: readonly RecurringItem[];
}

export type PlanTarget =
  | { kind: 'recipe'; recipeId: Id }
  | { kind: 'restaurant'; restaurantId: Id }
  | { kind: 'activity'; activityId: Id }
  | { kind: 'text'; text: string }
  | { kind: 'newRestaurant'; name: string; address?: string }
  | { kind: 'newActivity'; name: string; address?: string };

/** One of the app's commands, with the ids of the household's own rows. */
export type AgentCommand =
  | { type: 'addToList'; text: string }
  | { type: 'completeChore'; choreId: Id }
  | { type: 'logDone'; title: string }
  | {
      type: 'plan';
      date: ISODate | null;
      slotId: Id;
      target: PlanTarget;
      startsAt?: string;
      note?: string;
    }
  | { type: 'createRestaurant'; name: string; address?: string }
  | { type: 'createActivity'; name: string; address?: string }
  | { type: 'favoriteRestaurant'; restaurantId: Id }
  | { type: 'rememberActivity'; activityId: Id; remembered: boolean }
  | { type: 'setServings'; recipeId: Id; servings: number }
  | { type: 'addRecurring'; text: string; rule: RecurringRule }
  | { type: 'removeItem'; itemId: Id }
  | { type: 'removePlanEntry'; entryId: Id }
  | { type: 'deleteRecurring'; recurringId: Id };

export interface ResolvedEntry {
  /** What it is about, from the household's data: "2 Milch", "Bad putzen", "Mango-Curry". */
  title: string;
  /** What happens: "Auf die Liste", "Erledigt · heute", "Mi 2.12. · Abendessen". */
  detail: string;
  /** Deletes are confirmed one by one (REQ-009). */
  destructive: boolean;
  /** Set when it cannot be applied, with the reason (AC-019). */
  problem?: string;
  command?: AgentCommand;
  /** The state of the rows it touches; another one later means "changed meanwhile". */
  seen: string;
}

const same = (a: string, b: string) => normalizeText(a) === normalizeText(b);

function byIdOrName<T extends { id: Id }>(
  rows: readonly T[],
  action: AgentAction,
  name: (row: T) => string,
): T | undefined {
  if (action.id) {
    const hit = rows.find((row) => row.id === action.id);
    if (hit) return hit;
  }
  return rows.find((row) => same(name(row), action.name));
}

function dayText(date: ISODate | null | undefined, today: ISODate): string {
  if (!date) return 'vorgemerkt';
  const relative = relativeDayLabel(date, today);
  return relative === 'heute' || relative === 'morgen'
    ? relative
    : `${weekdayShort(date)} ${formatShortDate(date)}`;
}

function slotOf(
  data: ProposalData,
  name: string | undefined,
  time: string | undefined,
): MealSlot | undefined {
  const slots = [...data.mealSlots].sort((a, b) => a.sort - b.sort);
  if (name) return slots.find((slot) => same(slot.name, name));
  const last = slots.length - 1;
  // Without a Tageszeit the time decides (the household's slots have no hours): the morning
  // before 11, the middle of the day before 17, then the evening; without both the evening.
  const hour = time ? Number(time.slice(0, 2)) : 24;
  const index = hour < 11 ? 0 : hour < 17 ? Math.max(0, last - 1) : last;
  return slots[index];
}

const seenOf = (...rows: unknown[]) => JSON.stringify(rows);

function failed(title: string, detail: string, problem: string, destructive = false) {
  return { title, detail, destructive, problem, seen: '' };
}

function resolvePlan(action: AgentAction, data: ProposalData): ResolvedEntry {
  const day = dayText(action.date, data.today);
  const slot = slotOf(data, action.slot, action.time);
  const where = slot ? `${day} · ${slot.name}` : day;
  if (!slot) return failed(action.name, where, 'Diese Tageszeit gibt es nicht');
  const date = action.date ?? null;
  // The meal it joins: another device planning the same meal is a change.
  const meal = data.planEntries.filter((entry) => entry.date === date && entry.slotId === slot.id);
  const base = {
    type: 'plan' as const,
    date,
    slotId: slot.id,
    ...(action.time ? { startsAt: action.time } : {}),
    ...(action.note ? { note: action.note } : {}),
  };
  const timed = action.time ? ` · ${action.time} Uhr` : '';
  switch (action.target) {
    case 'recipe': {
      const recipe = byIdOrName(data.recipes, action, (row) => row.title);
      if (!recipe) return failed(action.name, where, 'Das Rezept gibt es nicht');
      return {
        title: recipe.title,
        detail: where,
        destructive: false,
        command: { ...base, target: { kind: 'recipe', recipeId: recipe.id } },
        seen: seenOf(recipe.id, meal),
      };
    }
    case 'restaurant': {
      const restaurant = byIdOrName(data.restaurants, action, (row) => row.name);
      return {
        title: restaurant?.name ?? action.name,
        detail: `${where}${timed}${restaurant ? '' : ' · neu gemerkt'}`,
        destructive: false,
        command: {
          ...base,
          target: restaurant
            ? { kind: 'restaurant', restaurantId: restaurant.id }
            : {
                kind: 'newRestaurant',
                name: action.name,
                ...(action.address ? { address: action.address } : {}),
              },
        },
        seen: seenOf(restaurant?.id ?? null, meal),
      };
    }
    case 'activity': {
      const activity = byIdOrName(data.activities, action, (row) => row.name);
      return {
        title: activity?.name ?? action.name,
        detail: `${where}${timed}${activity ? '' : ' · neu gemerkt'}`,
        destructive: false,
        command: {
          ...base,
          target: activity
            ? { kind: 'activity', activityId: activity.id }
            : {
                kind: 'newActivity',
                name: action.name,
                ...(action.address ? { address: action.address } : {}),
              },
        },
        seen: seenOf(activity?.id ?? null, meal),
      };
    }
    default:
      return {
        title: action.name,
        detail: where,
        destructive: false,
        command: { ...base, target: { kind: 'text', text: action.name } },
        seen: seenOf(meal),
      };
  }
}

function articleOfText(text: string, data: ProposalData): Article | undefined {
  const parsed = parseSmartInput(text);
  return parsed ? findArticleByName(parsed.name, [...data.articles]) : undefined;
}

function openItemOf(action: AgentAction, data: ProposalData): ShoppingItem | undefined {
  if (action.id) {
    const hit = data.items.find((item) => item.id === action.id && !item.checked);
    if (hit) return hit;
  }
  const article = articleOfText(action.name, data);
  return article
    ? data.items.find((item) => item.articleId === article.id && !item.checked)
    : undefined;
}

/** "jeden Samstag", "alle 2 Wochen samstags". */
function ruleText(rule: RecurringRule): string {
  if (rule.type !== 'weekly') return 'monatlich';
  const day = weekdayLong(weekdayDate(rule.weekdays[0] ?? 6));
  return rule.every === 1 ? `jeden ${day}` : `alle ${rule.every} Wochen ${day.toLowerCase()}s`;
}

/** A Monday-based week whose day `weekday` (1–7) names the weekday. */
const weekdayDate = (weekday: number): ISODate =>
  `2026-11-${String(22 + Math.min(7, Math.max(1, weekday))).padStart(2, '0')}`;

/** The entry in the household's terms, with its command, or the reason it cannot run. */
export function resolveAction(action: AgentAction, data: ProposalData): ResolvedEntry {
  switch (action.kind) {
    case 'add_to_list': {
      if (!parseSmartInput(action.name)) return failed(action.name, 'Auf die Liste', 'Leer');
      return {
        title: action.name,
        detail: 'Auf die Liste',
        destructive: false,
        command: { type: 'addToList', text: action.name },
        seen: '',
      };
    }
    case 'chore_done': {
      const chore = byIdOrName(data.chores, action, (row) => row.title);
      if (!chore) {
        return {
          title: action.name,
          detail: 'Erledigt · heute · neue Aufgabe „bei Bedarf“',
          destructive: false,
          command: { type: 'logDone', title: action.name },
          seen: seenOf(null),
        };
      }
      return {
        title: chore.title,
        detail: 'Erledigt · heute',
        destructive: false,
        command: { type: 'completeChore', choreId: chore.id },
        seen: seenOf(chore),
      };
    }
    case 'plan':
      return resolvePlan(action, data);
    case 'create_restaurant': {
      const known = data.restaurants.find((row) => same(row.name, action.name));
      if (known) return failed(known.name, 'Restaurant merken', 'Habt ihr schon');
      return {
        title: action.name,
        detail: action.address ? `Restaurant merken · ${action.address}` : 'Restaurant merken',
        destructive: false,
        command: {
          type: 'createRestaurant',
          name: action.name,
          ...(action.address ? { address: action.address } : {}),
        },
        seen: '',
      };
    }
    case 'create_activity': {
      const known = data.activities.find((row) => same(row.name, action.name));
      if (known) return failed(known.name, 'Aktivität merken', 'Habt ihr schon');
      return {
        title: action.name,
        detail: action.address ? `Aktivität merken · ${action.address}` : 'Aktivität merken',
        destructive: false,
        command: {
          type: 'createActivity',
          name: action.name,
          ...(action.address ? { address: action.address } : {}),
        },
        seen: '',
      };
    }
    case 'set_favorite': {
      const favorite = action.favorite ?? true;
      if (action.target === 'activity') {
        const activity = byIdOrName(data.activities, action, (row) => row.name);
        const detail = favorite ? 'Merken' : 'Nicht mehr merken';
        if (!activity) return failed(action.name, detail, 'Die Aktivität gibt es nicht');
        if (activity.remembered === favorite)
          return failed(
            activity.name,
            detail,
            favorite ? 'Ist schon gemerkt' : 'Ist nicht gemerkt',
          );
        return {
          title: activity.name,
          detail,
          destructive: false,
          command: { type: 'rememberActivity', activityId: activity.id, remembered: favorite },
          seen: seenOf(activity),
        };
      }
      const restaurant = byIdOrName(data.restaurants, action, (row) => row.name);
      const detail = favorite ? 'Als Favorit' : 'Kein Favorit mehr';
      if (!restaurant) return failed(action.name, detail, 'Das Restaurant gibt es nicht');
      if (restaurant.favoriteOf.includes(data.memberId) === favorite)
        return failed(restaurant.name, detail, favorite ? 'Ist schon Favorit' : 'Ist kein Favorit');
      return {
        title: restaurant.name,
        detail,
        destructive: false,
        command: { type: 'favoriteRestaurant', restaurantId: restaurant.id },
        seen: seenOf(restaurant),
      };
    }
    case 'set_servings': {
      const recipe = byIdOrName(data.recipes, action, (row) => row.title);
      const servings = action.servings ?? 0;
      const detail = `${servings} Portionen`;
      if (!recipe) return failed(action.name, detail, 'Das Rezept gibt es nicht');
      return {
        title: recipe.title,
        detail: `${servings} statt ${recipe.servings} Portionen`,
        destructive: false,
        command: { type: 'setServings', recipeId: recipe.id, servings },
        seen: seenOf(recipe),
      };
    }
    case 'add_recurring': {
      const rule: RecurringRule = {
        type: 'weekly',
        every: action.everyWeeks ?? 1,
        weekdays: [action.weekday ?? 6],
      };
      const detail = `Dauerposten · ${ruleText(rule)}`;
      const article = articleOfText(action.name, data);
      const known = article
        ? data.recurringItems.find((item) => item.articleId === article.id)
        : undefined;
      if (known) return failed(action.name, detail, 'Dafür gibt es schon einen Dauerposten');
      return {
        title: action.name,
        detail,
        destructive: false,
        command: { type: 'addRecurring', text: action.name, rule },
        seen: '',
      };
    }
    case 'remove_from_list': {
      const item = openItemOf(action, data);
      const article = item ? data.articles.find((row) => row.id === item.articleId) : undefined;
      const title = article?.name ?? action.name;
      if (!item) return failed(title, 'Von der Liste nehmen', 'Steht nicht auf der Liste', true);
      return {
        title,
        detail: 'Von der Liste nehmen',
        destructive: true,
        command: { type: 'removeItem', itemId: item.id },
        seen: seenOf(item),
      };
    }
    case 'remove_plan_entry': {
      const entry = data.planEntries.find(
        (candidate) =>
          (action.id ? candidate.id === action.id : true) &&
          candidate.date === action.date &&
          same(entryTitle(candidate, data), action.name),
      );
      const detail = `${dayText(action.date, data.today)} · aus dem Kalender nehmen`;
      if (!entry) return failed(action.name, detail, 'Steht nicht im Kalender', true);
      return {
        title: entryTitle(entry, data),
        detail,
        destructive: true,
        command: { type: 'removePlanEntry', entryId: entry.id },
        seen: seenOf(entry),
      };
    }
    case 'delete_recurring': {
      const article = articleOfText(action.name, data);
      const item =
        data.recurringItems.find((row) => row.id === action.id) ??
        (article ? data.recurringItems.find((row) => row.articleId === article.id) : undefined);
      const name = data.articles.find((row) => row.id === item?.articleId)?.name ?? action.name;
      if (!item)
        return failed(name, 'Dauerposten löschen', 'Diesen Dauerposten gibt es nicht', true);
      return {
        title: name,
        detail: 'Dauerposten löschen',
        destructive: true,
        command: { type: 'deleteRecurring', recurringId: item.id },
        seen: seenOf(item),
      };
    }
  }
}

function entryTitle(entry: MealPlanEntry, data: ProposalData): string {
  if (entry.kind === 'recipe')
    return data.recipes.find((recipe) => recipe.id === entry.recipeId)?.title ?? '';
  if (entry.kind === 'restaurant')
    return data.restaurants.find((row) => row.id === entry.restaurantId)?.name ?? '';
  if (entry.kind === 'activity')
    return data.activities.find((row) => row.id === entry.activityId)?.name ?? '';
  return entry.text ?? '';
}

export type RecheckResult = 'ok' | 'stale' | 'failed';

/**
 * Before applying (REQ-009): the entry again with the data now. Its rows changed since `seen` →
 * "stale" (deselected, with a hint); it cannot run any more → "failed" with the reason.
 */
export function recheckAction(
  action: AgentAction,
  seen: string,
  data: ProposalData,
): { result: RecheckResult; entry: ResolvedEntry } {
  const entry = resolveAction(action, data);
  if (entry.problem) return { result: 'failed', entry };
  return { result: entry.seen === seen ? 'ok' : 'stale', entry };
}

/** "3 übernehmen", "1 übernehmen". */
export function applyLabel(count: number): string {
  return `${count} übernehmen`;
}

/** The hint at an entry that changed meanwhile (REQ-009). */
export const STALE_HINT = 'Inzwischen geändert – prüf es und wähl es neu';

/**
 * Spec 0067 (preview feedback 28.11.): a **bold** name of an answer that is exactly one of the
 * household's recipes, restaurants or activities opens it in the app; anything else stays text.
 */
export function namedEntity(
  name: string,
  data: Pick<ProposalData, 'recipes' | 'restaurants' | 'activities'>,
): Exclude<ImageTarget, { kind: 'draft' }> | undefined {
  for (const subject of ['recipe', 'restaurant', 'activity'] as const) {
    const target = imageTarget(subject, name, data);
    if (target && target.kind !== 'draft') return target;
  }
  return undefined;
}

/** What "Als Foto nehmen" of an agent image goes to (REQ-011). */
export type ImageTarget =
  | { kind: 'draft' }
  | { kind: 'recipe'; id: Id; title: string }
  | { kind: 'restaurant'; id: Id; title: string }
  | { kind: 'activity'; id: Id; title: string };

/** The entry an image is for, by its name in the household's data; undefined when unknown. */
export function imageTarget(
  subject: 'recipe' | 'restaurant' | 'activity' | 'draft',
  name: string | undefined,
  data: Pick<ProposalData, 'recipes' | 'restaurants' | 'activities'>,
): ImageTarget | undefined {
  if (subject === 'draft') return { kind: 'draft' };
  if (!name) return undefined;
  if (subject === 'recipe') {
    const recipe = data.recipes.find((row) => same(row.title, name));
    return recipe ? { kind: 'recipe', id: recipe.id, title: recipe.title } : undefined;
  }
  const rows: readonly { id: Id; name: string }[] =
    subject === 'restaurant' ? data.restaurants : data.activities;
  const row = rows.find((candidate) => same(candidate.name, name));
  return row ? { kind: subject, id: row.id, title: row.name } : undefined;
}
