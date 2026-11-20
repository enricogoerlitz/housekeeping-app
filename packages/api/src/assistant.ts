import {
  addDays,
  entriesForDay,
  filterRecipes,
  formatAmount,
  isoWeekday,
  normalizeText,
  parseSmartInput,
  searchRecipes,
  splitDictation,
  weekdayShort,
  type Id,
  type ISODate,
  type Recipe,
  type RecipeFilter,
} from '@housekeeping/core';

import { completeChore, logSpontaneous } from './commands-chores';
import { addPlanEntry, defaultEaterIds, type PlanEntryInput } from './commands-plan';
import { replaceIngredient, updateRecipe } from './commands-recipes';
import { diffHousehold, sendable } from './changes';
import { addContributionOps, addTextLocally } from './list-additions';
import { indexById } from './queries';
import { commit, getData, getState, isBackendMode, newId } from './store';
import type { AddEntry, ChangeOp } from './transport';

// The assistant of spec 0001 is simulated: fixed sample requests with prepared answers.
// There is no model and no network call here. What it already shows for real: the assistant only
// reads; every change is a proposal made of commands, and accepting runs the very same commands
// the screens use.

export const AI_SAMPLE_NOTE = 'Beispielantwort – KI ist noch nicht angeschlossen';
export const AI_NO_ANSWER = 'Im Dummy sind nur die Beispielanfragen hinterlegt.';

export type AssistantCommand =
  | { type: 'setRecipeServings'; recipeId: Id; servings: number }
  | { type: 'replaceIngredient'; recipeId: Id; ingredientId: Id; line: string }
  | { type: 'addShoppingItems'; listId: Id; texts: string[] }
  | { type: 'addPlanEntry'; input: PlanEntryInput }
  | { type: 'completeChore'; choreId: Id }
  | { type: 'logSpontaneous'; title: string };

export interface ProposalPart {
  id: Id;
  /** What is affected, e.g. "Portionen" or "Einkaufsliste". */
  label: string;
  before?: string;
  after?: string;
  command: AssistantCommand;
}

export interface Proposal {
  id: Id;
  title: string;
  note: string;
  parts: ProposalPart[];
}

export interface AssistantContext {
  /** Recipe currently open, if any. */
  recipeId?: Id;
}

export interface AssistantReply {
  text: string;
  proposal?: Proposal;
  /** What the assistant looked up, e.g. "Wochenplan gelesen". */
  consulted?: string;
}

/** A command that changes rows (everything but list additions), through the normal commands. */
function runRowCommand(command: Exclude<AssistantCommand, { type: 'addShoppingItems' }>): void {
  switch (command.type) {
    case 'setRecipeServings':
      updateRecipe(command.recipeId, { servings: command.servings });
      return;
    case 'replaceIngredient':
      replaceIngredient(command.recipeId, command.ingredientId, command.line);
      return;
    case 'addPlanEntry':
      addPlanEntry(command.input);
      return;
    case 'completeChore':
      completeChore(command.choreId);
      return;
    case 'logSpontaneous':
      logSpontaneous(command.title);
      return;
  }
}

/**
 * Runs commands as one change (ADR-0011, AC-026): the same commands the screens use, but in
 * backend mode sent as one `apply_changes` call — the row changes, then the list additions as
 * `add_contributions` (merged on the server). Either all of it lands or none.
 */
function runCommands(commands: AssistantCommand[]): void {
  if (commands.length === 0) return;
  commit<ChangeOp[]>(
    {
      path: 'rpc',
      send: (transport, context) => transport.applyChanges(context.householdId, context.result),
    },
    () => {
      const before = getData();
      for (const command of commands) {
        if (command.type !== 'addShoppingItems') runRowCommand(command);
      }
      const rows = getData();
      const additions: { listId: Id; entry: AddEntry }[] = [];
      for (const command of commands) {
        if (command.type !== 'addShoppingItems') continue;
        for (const text of command.texts) {
          const local = addTextLocally(command.listId, text);
          if (local) additions.push({ listId: command.listId, entry: local.entry });
        }
      }
      if (!isBackendMode()) return [];
      const oneOffChores = commands.filter((command) => command.type === 'completeChore').length;
      const { ops } = diffHousehold(before, rows, {
        mode: 'send',
        maxDeletes: { chores: oneOffChores },
      });
      return [...sendable(ops), ...addContributionOps(additions)];
    },
  );
}

/** Runs one command of a proposal through the normal command functions. */
export function runAssistantCommand(command: AssistantCommand): void {
  runCommands([command]);
}

/** Accepting a proposal: runs the chosen parts as one change. Returns how many were applied. */
export function applyProposal(proposal: Proposal, partIds: Id[]): number {
  const parts = proposal.parts.filter((part) => partIds.includes(part.id));
  runCommands(parts.map((part) => part.command));
  return parts.length;
}

const EXAMPLE_VEGAN = 'Mach das vegan und für 6 Personen';
const EXAMPLE_BATCH = 'Milch auf die Liste, Bad hab ich geputzt, Mittwoch Curry';
const EXAMPLE_TODAY = 'Was koche ich heute?';
const EXAMPLE_HALLOUMI = 'Welche Rezepte gibt es mit Halloumi?';

/** The sample requests offered as chips, depending on where the assistant was opened. */
export function assistantExamples(context: AssistantContext): string[] {
  return context.recipeId
    ? [EXAMPLE_VEGAN, EXAMPLE_HALLOUMI]
    : [EXAMPLE_BATCH, EXAMPLE_TODAY, EXAMPLE_HALLOUMI];
}

const VEGAN_SWAPS: Record<string, string> = {
  Hähnchenbrust: 'Räuchertofu',
  Hackfleisch: 'Rote Linsen',
  Sahne: 'Kokosmilch',
  Butter: 'Margarine',
  Milch: 'Haferdrink',
  Feta: 'Räuchertofu',
};

function veganProposal(recipe: Recipe): Proposal {
  const articles = indexById(getData().articles);
  const parts: ProposalPart[] = [
    {
      id: newId('part'),
      label: 'Portionen',
      before: String(recipe.servings),
      after: '6',
      command: { type: 'setRecipeServings', recipeId: recipe.id, servings: 6 },
    },
  ];
  for (const ingredient of recipe.ingredients) {
    const article = ingredient.articleId ? articles[ingredient.articleId] : undefined;
    const swap = article ? VEGAN_SWAPS[article.name] : undefined;
    if (!article || !swap || article.diet === 'vegan') continue;
    const amount = ingredient.amount?.text ? `${ingredient.amount.text} ` : '';
    parts.push({
      id: newId('part'),
      label: 'Zutat',
      before: `${amount}${article.name}`,
      after: `${amount}${swap}`,
      command: {
        type: 'replaceIngredient',
        recipeId: recipe.id,
        ingredientId: ingredient.id,
        line: `${amount}${swap}`,
      },
    });
  }
  return { id: newId('proposal'), title: `${recipe.title} ändern`, note: AI_SAMPLE_NOTE, parts };
}

function nextWeekday(today: ISODate, weekday: number): ISODate {
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = addDays(today, offset);
    if (isoWeekday(date) === weekday) return date;
  }
  return today;
}

function batchProposal(): Proposal {
  const data = getData();
  const today = getState().today;
  const parts: ProposalPart[] = [
    {
      id: newId('part'),
      label: 'Einkaufsliste',
      after: 'Milch',
      command: { type: 'addShoppingItems', listId: data.household.defaultListId, texts: ['Milch'] },
    },
  ];
  const bathroom = data.chores.find((chore) => normalizeText(chore.title).includes('bad'));
  parts.push(
    bathroom
      ? {
          id: newId('part'),
          label: 'Haushalt',
          after: `${bathroom.title} erledigt`,
          command: { type: 'completeChore', choreId: bathroom.id },
        }
      : {
          id: newId('part'),
          label: 'Haushalt',
          after: 'Bad geputzt (spontan)',
          command: { type: 'logSpontaneous', title: 'Bad geputzt' },
        },
  );
  const curry = data.recipes.find((recipe) => normalizeText(recipe.title).includes('curry'));
  const dinner = data.household.mealSlots[data.household.mealSlots.length - 1];
  if (curry && dinner) {
    const date = nextWeekday(today, 3);
    parts.push({
      id: newId('part'),
      label: 'Wochenplan',
      after: `${weekdayShort(date)}: ${curry.title}`,
      command: {
        type: 'addPlanEntry',
        input: {
          date,
          slotId: dinner.id,
          kind: 'recipe',
          recipeId: curry.id,
          eaterIds: defaultEaterIds(date),
        },
      },
    });
  }
  return { id: newId('proposal'), title: 'Drei Dinge auf einmal', note: AI_SAMPLE_NOTE, parts };
}

/** Answers one of the sample requests; anything else gets the "only samples" reply. */
export function askAssistant(text: string, context: AssistantContext): AssistantReply {
  const data = getData();
  const today = getState().today;
  const request = normalizeText(text);
  const recipesById = indexById(data.recipes);

  if (request === normalizeText(EXAMPLE_VEGAN)) {
    const recipe = context.recipeId ? recipesById[context.recipeId] : undefined;
    if (!recipe) return { text: 'Öffne zuerst ein Rezept, dann kann ich es anpassen.' };
    return {
      text: 'Hier ist mein Vorschlag. Du kannst einzelne Änderungen abwählen.',
      proposal: veganProposal(recipe),
      consulted: '1 Rezept gelesen',
    };
  }
  if (request === normalizeText(EXAMPLE_BATCH)) {
    return {
      text: 'Das sind drei Dinge. Übernimm alle oder nur einen Teil.',
      proposal: batchProposal(),
      consulted: 'Liste, Haushaltsplan und Wochenplan gelesen',
    };
  }
  if (request === normalizeText(EXAMPLE_TODAY)) {
    const slotOrder = [...data.household.mealSlots]
      .sort((a, b) => a.sort - b.sort)
      .map((slot) => slot.id);
    const dishes = entriesForDay(data.planEntries, today, slotOrder)
      .map((entry) => {
        if (entry.kind === 'text') return entry.text;
        if (entry.kind === 'restaurant') {
          const restaurant = data.restaurants.find((r) => r.id === entry.restaurantId);
          return restaurant ? `${restaurant.name} (Restaurant)` : undefined;
        }
        if (entry.kind === 'activity') {
          const activity = data.activities.find((a) => a.id === entry.activityId);
          return activity ? `${activity.name} (Aktivität)` : undefined;
        }
        const title = entry.recipeId ? recipesById[entry.recipeId]?.title : undefined;
        return title && entry.kind === 'leftovers' ? `${title} (Reste)` : title;
      })
      .filter((title): title is string => !!title);
    return {
      text:
        dishes.length > 0
          ? `Für heute ist geplant: ${dishes.join(', ')}.`
          : 'Für heute ist noch nichts geplant.',
      consulted: 'Wochenplan gelesen',
    };
  }
  if (request === normalizeText(EXAMPLE_HALLOUMI)) {
    const hits = searchRecipes('Halloumi', data.recipes, indexById(data.articles));
    return {
      text:
        hits.length > 0
          ? `Mit Halloumi habe ich gefunden: ${hits.map((recipe) => recipe.title).join(', ')}.`
          : 'Mit Halloumi habe ich nichts gefunden.',
      consulted: `${data.recipes.length} Rezepte durchsucht`,
    };
  }
  return { text: AI_NO_ANSWER };
}

// ---------- Simulated dictation ----------

export interface DictatedItem {
  id: Id;
  /** What will be added when accepted, in smart-input form ("6 Eier"). */
  text: string;
  name: string;
  /** Short amount for display, e.g. "6×". */
  meta?: string;
}

/**
 * Proposal rows for a dictated shopping request (AC-028): "Milch, sechs Eier und Brot" → Milch,
 * 6× Eier, Brot. Each row is added through the smart input when accepted.
 */
export function dictatedItems(transcript: string): DictatedItem[] {
  return splitDictation(transcript).flatMap((text): DictatedItem[] => {
    const parsed = parseSmartInput(text);
    if (!parsed) return [];
    const meta =
      parsed.qty !== undefined
        ? formatAmount(parsed.qty, parsed.unit)
        : parsed.count !== undefined
          ? `${parsed.count}×`
          : undefined;
    return [{ id: newId('ghost'), text, name: parsed.name, meta }];
  });
}

/** The sample dictation for the shopping list: "Milch, sechs Eier und Brot". */
export function simulateDictation(): { transcript: string; items: DictatedItem[] } {
  return {
    transcript: 'Milch, sechs Eier und Brot',
    items: [
      { id: newId('ghost'), text: 'Milch', name: 'Milch' },
      { id: newId('ghost'), text: '6 Eier', name: 'Eier', meta: '6×' },
      { id: newId('ghost'), text: 'Brot', name: 'Brot' },
    ],
  };
}

// ---------- Simulated AI search ----------

export interface AiSearchChip {
  id: string;
  label: string;
}
export interface AiSearchResult {
  /** How the request was understood; removing a chip searches again without it. */
  chips: AiSearchChip[];
  results: { recipeId: Id; reason: string }[];
  /** e.g. "2 Runden · gesucht: tofu". */
  trace: string;
  note: string;
}

const STOP_WORDS = new Set([
  'was',
  'mit',
  'und',
  'oder',
  'das',
  'wir',
  'ich',
  'ein',
  'eine',
  'etwas',
  'bitte',
  'gerne',
  'nicht',
  'zu',
  'lange',
  'hatten',
  'gehabt',
  'haben',
  'schnelles',
  'schnell',
  'schnelle',
  'leichtes',
  'leicht',
  'veganes',
  'vegan',
  'vegetarisch',
  'vegetarisches',
  'scharf',
  'fuer',
  'alle',
  'heute',
  'abend',
  'essen',
  'kochen',
  'lust',
  'auf',
  'hunger',
  'den',
  'die',
  'der',
  'dem',
  'sehr',
  'mal',
  'wieder',
]);

/**
 * Interprets a free request with fixed rules (stand-in for the model) and searches the household's
 * recipes with the normal search and filter functions. `disabledChips` are chip ids the user removed.
 */
export function aiSearch(query: string, disabledChips: string[] = []): AiSearchResult {
  const data = getData();
  const today = getState().today;
  const articlesById = indexById(data.articles);
  const text = normalizeText(query);
  const chips: AiSearchChip[] = [];
  const filter: RecipeFilter = {};
  const reasons: string[] = [];
  const add = (id: string, label: string, apply: () => void, reason: string) => {
    chips.push({ id, label });
    if (disabledChips.includes(id)) return;
    apply();
    reasons.push(reason);
  };
  if (/schnell/.test(text)) add('fast', '≤ 30 Min', () => (filter.maxMinutes = 30), 'schnell');
  if (/vegan/.test(text)) add('vegan', 'vegan', () => (filter.diet = 'vegan'), 'vegan');
  else if (/vegetarisch|veggie/.test(text))
    add('vegetarian', 'vegetarisch', () => (filter.diet = 'vegetarian'), 'vegetarisch');
  if (/lange nicht/.test(text))
    add(
      'rare',
      'lange nicht gekocht',
      () => (filter.notCookedSinceDays = 21),
      'lange nicht gekocht',
    );
  if (/fuer alle|fuer uns beide/.test(text)) {
    const members = getState().members.filter((member) =>
      data.household.memberIds.includes(member.id),
    );
    add('all', 'passt für alle', () => (filter.fitsAll = members), 'passt für alle');
  }
  const excludeSpicy = /nicht (zu )?scharf|mild/.test(text);
  if (excludeSpicy) chips.push({ id: 'mild', label: 'nicht scharf' });
  const mild = excludeSpicy && !disabledChips.includes('mild');

  const terms = text.split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  const activeTerms: string[] = [];
  for (const term of terms) {
    const id = `term:${term}`;
    chips.push({ id, label: term.charAt(0).toUpperCase() + term.slice(1) });
    if (!disabledChips.includes(id)) activeTerms.push(term);
  }

  let candidates = searchRecipes(activeTerms.join(' '), data.recipes, articlesById);
  candidates = filterRecipes(candidates, filter, articlesById, today);
  if (mild) candidates = candidates.filter((recipe) => !recipe.tags.includes('scharf'));

  const results = candidates.slice(0, 8).map((recipe) => {
    const parts = [...reasons];
    if (activeTerms.length > 0)
      parts.unshift(
        `mit ${activeTerms.map((term) => term.charAt(0).toUpperCase() + term.slice(1)).join(', ')}`,
      );
    if (mild) parts.push('mild');
    if (recipe.totalMinutes) parts.push(`${recipe.totalMinutes} Min`);
    return { recipeId: recipe.id, reason: parts.join(' · ') };
  });
  return {
    chips,
    results,
    trace: `2 Runden · gesucht: ${activeTerms.length > 0 ? activeTerms.join(', ') : 'alle Rezepte'}`,
    note: AI_SAMPLE_NOTE,
  };
}
