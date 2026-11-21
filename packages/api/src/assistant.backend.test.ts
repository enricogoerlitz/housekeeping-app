// Accepting an assistant proposal (spec 0003): all chosen parts are one
// transaction — one apply_changes call with the row changes and the list contributions.
import { addDays } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { applyProposal, runAssistantCommand, type Proposal } from './assistant';
import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { H, TODAY, withBackend } from './backend-test-helpers';
import { ENRICO, NADJA, SLOT_DINNER } from './seed/demo';
import { getData } from './store';
import { TransportError, type ChangeOp } from './transport';

const fx = withBackend();

const CURRY = 'rec-mango-curry';
const curry = () => getData().recipes.find((recipe) => recipe.id === CURRY);

function proposal(): Proposal {
  return {
    id: 'p-1',
    title: 'Vorschlag',
    note: '',
    parts: [
      {
        id: 'servings',
        label: 'Portionen',
        command: { type: 'setRecipeServings', recipeId: CURRY, servings: 6 },
      },
      {
        id: 'list',
        label: 'Einkaufsliste',
        command: {
          type: 'addShoppingItems',
          texts: ['Milch', '2 Mangochutney'],
        },
      },
      {
        id: 'plan',
        label: 'Wochenplan',
        command: {
          type: 'addPlanEntry',
          input: {
            date: addDays(TODAY, 5),
            slotId: SLOT_DINNER,
            kind: 'recipe',
            recipeId: CURRY,
            eaterIds: [ENRICO, NADJA],
          },
        },
      },
      { id: 'chore', label: 'Aufgabe', command: { type: 'completeChore', choreId: 'chore-bad' } },
      { id: 'log', label: 'Erledigt', command: { type: 'logSpontaneous', title: 'Bad geputzt' } },
    ],
  };
}

const allParts = (p: Proposal) => p.parts.map((part) => part.id);

describe('applyProposal', () => {
  it('AC-026: all chosen parts go in one apply_changes call and reach the other device', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const p = proposal();
    expect(applyProposal(p, allParts(p))).toBe(5);
    expect(curry()?.servings).toBe(6);
    expect(getData().articles.some((article) => article.name === 'Mangochutney')).toBe(true);

    await fx.settle(nadja);
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    const [householdId, ops] = fx.calls[0]?.args as [string, ChangeOp[]];
    expect(householdId).toBe(H);
    expect(ops.map((op) => [op.kind, 'table' in op ? op.table : ''])).toEqual([
      ['patch', 'recipes'],
      ['insert', 'meal_plan_entries'],
      // spec 0011: entries only by complete_chore; logSpontaneous is „Was anderes erledigt?“.
      ['complete_chore', ''],
      ['insert', 'chores'],
      ['complete_chore', ''],
      ['add_contributions', ''],
    ]);
    expect(fx.server.rows(H, 'chores').find((row) => row.title === 'Bad geputzt')).toMatchObject({
      recurrence: { type: 'asNeeded' },
      last_done_on: TODAY,
    });
    expect(fx.server.row(H, 'chores', 'chore-bad')).toMatchObject({ last_done_on: TODAY });
    const add = ops.at(-1);
    expect(add).toMatchObject({
      kind: 'add_contributions',
      entries: [
        expect.objectContaining({ article_name: 'Milch' }),
        expect.objectContaining({ article_name: 'Mangochutney', name_key: 'mangochutney' }),
      ],
    });
    expect(fx.nadjaData(nadja).recipes.find((recipe) => recipe.id === CURRY)?.servings).toBe(6);
    expect(fx.server.rows(H, 'articles').some((row) => row.name === 'Mangochutney')).toBe(true);
  });

  it('AC-020: a server error leaves none of the parts', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const before = getData();
    fx.server.failNext('apply_changes', new TransportError('permanent', 'invalid_change', 400));
    const p = proposal();
    applyProposal(p, allParts(p));
    await fx.settle();
    expect(curry()?.servings).toBe(before.recipes.find((recipe) => recipe.id === CURRY)?.servings);
    expect(getData().items).toEqual(before.items);
    expect(getData().planEntries).toEqual(before.planEntries);
    expect(getData().choreEvents).toEqual(before.choreEvents);
    expect(getData().articles.some((article) => article.name === 'Mangochutney')).toBe(false);
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
  });

  it('only chosen parts; nothing chosen sends nothing', async () => {
    await fx.startEnrico();
    const p = proposal();
    expect(applyProposal(p, [])).toBe(0);
    expect(applyProposal(p, ['servings'])).toBe(1);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(fx.calls[0]?.args[1]).toEqual([
      { kind: 'patch', table: 'recipes', id: CURRY, changes: { servings: 6 } },
    ]);
  });

  it('a single assistant command with several items is one call too', async () => {
    await fx.startEnrico();
    runAssistantCommand({
      type: 'addShoppingItems',
      texts: ['Milch', 'Eier'],
    });
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(fx.calls[0]?.args[1]).toEqual([
      expect.objectContaining({ kind: 'add_contributions', entries: expect.any(Array) }),
    ]);
  });
});
