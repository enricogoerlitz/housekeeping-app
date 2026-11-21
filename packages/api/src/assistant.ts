import { formatAmount, parseSmartInput, splitDictation, type Id } from '@housekeeping/core';

import { completeChore, logSpontaneous } from './commands-chores';
import { addPlanEntry, type PlanEntryInput } from './commands-plan';
import { replaceIngredient, updateRecipe } from './commands-recipes';
import { diffHousehold, sendable } from './changes';
import { addContributionOps, addTextLocally } from './list-additions';
import { commit, getData, newId } from './store';
import type { AddEntry, ChangeOp } from './transport';

// What the assistant's answers can change: the assistant only reads (ai.ts asks the edge
// function); every change is a proposal made of commands, and accepting runs the very same
// commands the screens use.

export type AssistantCommand =
  | { type: 'setRecipeServings'; recipeId: Id; servings: number }
  | { type: 'replaceIngredient'; recipeId: Id; ingredientId: Id; line: string }
  | { type: 'addShoppingItems'; texts: string[] }
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
 * Runs commands as one change (ADR-0011, AC-026): the same commands the screens use, sent as one
 * `apply_changes` call — the row changes, then the list additions as
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
      // Always the household's shopping list (ADR-0012): the items of the call's household.
      const additions: AddEntry[] = [];
      for (const command of commands) {
        if (command.type !== 'addShoppingItems') continue;
        for (const text of command.texts) {
          const local = addTextLocally(text);
          if (local) additions.push(local.entry);
        }
      }
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

// ---------- Dictation ----------

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
    return [{ id: newId(), text, name: parsed.name, meta }];
  });
}

// ---------- AI search ----------

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
