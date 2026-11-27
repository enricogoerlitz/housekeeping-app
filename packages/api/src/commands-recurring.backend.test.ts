// Spec 0060: Dauerposten created, changed, paused and deleted as one apply_changes call each,
// seen on Nadja's device; chosen in "Aus Kalender …" they come onto the list with Herkunft
// "regelmäßig" and mark their day; deleting or merging the article takes the Dauerposten along.
import { describe, expect, it } from 'vitest';

import { H, TODAY, withBackend } from './backend-test-helpers';
import { deleteArticle, mergeArticles } from './commands-articles';
import {
  createRecurringItem,
  deleteRecurringItem,
  updateRecurringItem,
  type RecurringInput,
} from './commands-recurring';
import { addPlannedToList, pantryCheckRows } from './commands-shopping';
import { getData, snapshot } from './store';
import type { ChangeOp } from './transport';

const fx = withBackend();
const opsOf = (index: number) => (fx.calls[index]?.args[1] ?? []) as ChangeOp[];
const articleNamed = (name: string) => {
  const article = getData().articles.find((candidate) => candidate.name === name);
  if (!article) throw new Error(`no article ${name}`);
  return article;
};

// TODAY is Fr 20.11.2026; Saturday is weekday 6.
const saturdays = (articleId: string, count = 2): RecurringInput => ({
  articleId,
  amount: { count },
  rule: { type: 'weekly', every: 1, weekdays: [6] },
});

describe('Dauerposten (REQ-001)', () => {
  it('AC-002: "Cola 2×" weekly on Saturday is one insert, from today, also on Nadja\'s device', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const reis = articleNamed('Reis');
    fx.clearCalls();
    const id = createRecurringItem(saturdays(reis.id), TODAY);
    await fx.settle(nadja);
    expect(opsOf(0)).toEqual([
      {
        kind: 'insert',
        table: 'recurring_items',
        row: {
          id,
          article_id: reis.id,
          count: 2,
          qty: null,
          unit: null,
          note: null,
          rule: { type: 'weekly', every: 1, weekdays: [6] },
          starts_on: TODAY,
          paused: false,
        },
      },
    ]);
    expect(fx.nadjaData(nadja).recurringItems).toMatchObject([
      { id, articleId: reis.id, count: 2, startsOn: TODAY, paused: false },
    ]);
  });

  it('AC-003, AC-005: a new rhythm counts from today; "Pausiert" is a patch of paused only', async () => {
    await fx.startEnrico();
    const reis = articleNamed('Reis');
    const id = createRecurringItem(saturdays(reis.id), '2026-11-13');
    await fx.settle();
    fx.clearCalls();
    updateRecurringItem(id, { rule: { type: 'weekly', every: 2, weekdays: [6] } }, TODAY);
    await fx.settle();
    expect(fx.server.row(H, 'recurring_items', id)).toMatchObject({
      rule: { type: 'weekly', every: 2, weekdays: [6] },
      starts_on: TODAY,
    });
    fx.clearCalls();
    updateRecurringItem(id, { paused: true }, TODAY);
    await fx.settle();
    expect(opsOf(0)).toEqual([
      { kind: 'patch', table: 'recurring_items', id, changes: { paused: true } },
    ]);
  });

  it('AC-006: "Löschen" and "Rückgängig" bring it back with rhythm and amount', async () => {
    await fx.startEnrico();
    const reis = articleNamed('Reis');
    const id = createRecurringItem(saturdays(reis.id, 3), TODAY);
    await fx.settle();
    const restore = snapshot();
    deleteRecurringItem(id);
    await fx.settle();
    expect(fx.server.row(H, 'recurring_items', id)).toBeUndefined();
    restore();
    await fx.settle();
    expect(fx.server.row(H, 'recurring_items', id)).toMatchObject({ count: 3, paused: false });
  });

  it('AC-008: a second Dauerposten for the same article is refused before sending', async () => {
    await fx.startEnrico();
    const reis = articleNamed('Reis');
    createRecurringItem(saturdays(reis.id), TODAY);
    expect(() => createRecurringItem(saturdays(reis.id), TODAY)).toThrow(
      'Für Reis gibt es schon einen Dauerposten',
    );
  });

  it('AC-029: "jährlich" is refused before sending', async () => {
    await fx.startEnrico();
    const reis = articleNamed('Reis');
    expect(() =>
      createRecurringItem(
        { ...saturdays(reis.id), rule: { type: 'yearly' } as unknown as RecurringInput['rule'] },
        TODAY,
      ),
    ).toThrow('Rhythmus ungültig.');
    expect(getData().recurringItems).toEqual([]);
  });
});

describe('"Aus Kalender …" (REQ-005)', () => {
  it('AC-024, AC-025: a chosen Dauerposten comes with "regelmäßig" and marks its day', async () => {
    await fx.startEnrico();
    const reis = articleNamed('Reis');
    const id = createRecurringItem(saturdays(reis.id), TODAY);
    await fx.settle();
    const item = getData().recurringItems.find((candidate) => candidate.id === id);
    if (!item) throw new Error('missing');
    const rows = pantryCheckRows([], [], [{ item, on: '2026-11-21' }]);
    expect(rows).toMatchObject([
      { articleId: reis.id, amount: '2×', sources: ['regelmäßig'], isPantry: false },
    ]);
    addPlannedToList(rows);
    await fx.settle();
    const onList = getData().items.find((candidate) => candidate.articleId === reis.id);
    expect(onList?.contributions.at(-1)?.source).toEqual({
      kind: 'recurring',
      recurringItemId: id,
      on: '2026-11-21',
    });
    expect(fx.server.row(H, 'recurring_items', id)).toMatchObject({ last_added_on: '2026-11-21' });
    expect(getData().recurringItems[0]?.lastAddedOn).toBe('2026-11-21');
  });
});

describe('the article (AC-012)', () => {
  it('AC-012: deleting the article deletes its Dauerposten, here and on the server', async () => {
    await fx.startEnrico();
    const data = getData();
    const unused = data.articles.find(
      (article) =>
        !data.recipes.some((recipe) =>
          recipe.ingredients.some((ingredient) => ingredient.articleId === article.id),
        ) && !data.items.some((item) => item.articleId === article.id),
    );
    if (!unused) throw new Error('no unused article');
    const id = createRecurringItem(saturdays(unused.id), TODAY);
    await fx.settle();
    deleteArticle(unused.id);
    expect(getData().recurringItems).toEqual([]);
    await fx.settle();
    expect(fx.server.row(H, 'recurring_items', id)).toBeUndefined();
  });

  it("AC-012: merging gives the source's Dauerposten to a target without one", async () => {
    await fx.startEnrico();
    const reis = articleNamed('Reis');
    const target = articleNamed('Basmatireis');
    const id = createRecurringItem(saturdays(reis.id), TODAY);
    await fx.settle();
    mergeArticles(reis.id, target.id);
    expect(getData().recurringItems).toMatchObject([{ id, articleId: target.id }]);
    await fx.settle();
    expect(fx.server.row(H, 'recurring_items', id)).toMatchObject({ article_id: target.id });
  });
});
