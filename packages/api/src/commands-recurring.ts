// "Dauerposten" (spec 0060, REQ-001, REQ-002): create, change, pause and delete, each one
// apply_changes call on the diff path (Decision 11). Online only. Putting one on the list is the
// server's (private.add_due_recurring_items) or "Aus Kalender …" (addPlannedToList).
import {
  SeriesRuleSchema,
  type Id,
  type ISODate,
  type ItemAmount,
  type RecurringItem,
  type RecurringRule,
} from '@housekeeping/core';

import { commit, getData, newId, nowISO, updateData } from './store';

export interface RecurringInput {
  articleId: Id;
  amount: ItemAmount;
  note?: string;
  rule: RecurringRule;
  paused?: boolean;
}

function checkRule(rule: RecurringRule): void {
  const parsed = SeriesRuleSchema.safeParse(rule);
  if (!parsed.success || parsed.data.type === 'yearly') throw new Error('Rhythmus ungültig.');
}

function checkOnePerArticle(articleId: Id, exceptId?: Id): void {
  const data = getData();
  const other = data.recurringItems.find(
    (item) => item.articleId === articleId && item.id !== exceptId,
  );
  if (!other) return;
  const name = data.articles.find((article) => article.id === articleId)?.name ?? 'den Artikel';
  throw new Error(`Für ${name} gibt es schon einen Dauerposten`);
}

const amountFields = (amount: ItemAmount) => ({
  count: amount.count,
  qty: amount.qty,
  unit: amount.qty === undefined ? undefined : amount.unit,
});

const trimmed = (note: string | undefined) => note?.trim() || undefined;

/** AC-002: a new Dauerposten from today on (Decision 8). Throws the form's hint. */
export function createRecurringItem(input: RecurringInput, today: ISODate): Id {
  checkRule(input.rule);
  if (!getData().articles.some((article) => article.id === input.articleId)) {
    throw new Error('Den Artikel gibt es nicht mehr.');
  }
  checkOnePerArticle(input.articleId);
  return commit({ path: 'diff' }, () => {
    const item: RecurringItem = {
      id: newId(),
      articleId: input.articleId,
      ...amountFields(input.amount),
      note: trimmed(input.note),
      rule: input.rule,
      startsOn: today,
      paused: input.paused ?? false,
      createdAt: nowISO(),
    };
    updateData((data) => ({ ...data, recurringItems: [...data.recurringItems, item] }));
    return item.id;
  });
}

/**
 * AC-003, AC-005: amount, Zusatz, rhythm or "Pausiert". A changed rhythm counts from today
 * (Decision 8). Throws when the Dauerposten is gone.
 */
export function updateRecurringItem(
  id: Id,
  changes: Partial<Omit<RecurringInput, 'articleId'>>,
  today: ISODate,
): void {
  const current = getData().recurringItems.find((item) => item.id === id);
  if (!current) throw new Error('Den Dauerposten gibt es nicht mehr.');
  if (changes.rule) checkRule(changes.rule);
  const ruleChanged =
    changes.rule !== undefined && JSON.stringify(changes.rule) !== JSON.stringify(current.rule);
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      recurringItems: data.recurringItems.map((item) =>
        item.id === id
          ? {
              ...item,
              ...(changes.amount ? amountFields(changes.amount) : {}),
              ...('note' in changes ? { note: trimmed(changes.note) } : {}),
              ...(changes.rule ? { rule: changes.rule } : {}),
              ...(ruleChanged ? { startsOn: today } : {}),
              ...(changes.paused === undefined ? {} : { paused: changes.paused }),
            }
          : item,
      ),
    })),
  );
}

/** AC-006: "Löschen"; the caller keeps a snapshot for "Rückgängig". */
export function deleteRecurringItem(id: Id): void {
  commit({ path: 'diff', maxDeletes: { recurring_items: 1 } }, () =>
    updateData((data) => ({
      ...data,
      recurringItems: data.recurringItems.filter((item) => item.id !== id),
    })),
  );
}
