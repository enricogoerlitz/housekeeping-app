// "Dauerposten" (spec 0060): an article with amount and rhythm that the server puts on the list on
// its days (private.add_due_recurring_items). Here: when one is due, how its row reads, whether
// a draft can be saved and the block "Regelmäßig" of "Aus Kalender …". The due rule is the series
// rule of spec 0041 (matchesRule); its SQL twin private.recurring_item_due is tested with the same
// examples (Decision 4).
import {
  defaultRepeat,
  matchesRule,
  seriesDraftProblem,
  seriesRuleLabel,
  type RepeatDraft,
} from './activity-series';
import { AMOUNT_NOT_RECOGNIZED, parseItemAmount } from './amounts';
import { addDays, daysBetween, formatShortDate, weekdayShort } from './dates';
import { summarizeItem } from './shopping';
import type {
  Article,
  ContributionSource,
  Id,
  ISODate,
  RecurringItem,
  RecurringRule,
  ShoppingItem,
} from './types';

/** The Herkunft of a contribution from a Dauerposten. */
export const RECURRING_LABEL = 'regelmäßig';

/** The longest gap of a rule: every 52 weeks. */
const HORIZON_DAYS = 7 * 52 + 7;

type DueFields = Pick<RecurringItem, 'rule' | 'startsOn' | 'paused'>;

/** Whether the Dauerposten comes onto the list on `date` (REQ-003): active, from its start. */
export function isRecurringDue(item: DueFields, date: ISODate): boolean {
  return !item.paused && date >= item.startsOn && matchesRule(item, date);
}

/** Its next day from `from` on, after the day it last came; undefined while paused. */
export function nextRecurringDay(
  item: DueFields & Pick<RecurringItem, 'lastAddedOn'>,
  from: ISODate,
): ISODate | undefined {
  if (item.paused) return undefined;
  let day =
    item.lastAddedOn !== undefined && item.lastAddedOn >= from
      ? addDays(item.lastAddedOn, 1)
      : from;
  if (day < item.startsOn) day = item.startsOn;
  for (let index = 0; index <= HORIZON_DAYS; index += 1) {
    if (matchesRule(item, day)) return day;
    day = addDays(day, 1);
  }
  return undefined;
}

/** "heute", "morgen", else "Sa 28.11.". */
function dayLabel(date: ISODate, today: ISODate): string {
  const days = daysBetween(today, date);
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  return `${weekdayShort(date)} ${formatShortDate(date)}`;
}

/** The form's hint (AC-002): "Kommt morgen …", "Kommt am Di 1.12. …". */
export function recurringNextText(date: ISODate, today: ISODate): string {
  const label = dayLabel(date, today);
  return label === 'heute' || label === 'morgen' ? label : `am ${label}`;
}

/** "Cola", "Milch (laktosefrei)". */
export function recurringItemTitle(
  item: Pick<RecurringItem, 'note'>,
  article: Pick<Article, 'name'>,
): string {
  return item.note ? `${article.name} (${item.note})` : article.name;
}

/** "2×", "1 l", "" without an amount; as on the list. */
export function recurringAmountLabel(item: Pick<RecurringItem, 'count' | 'qty' | 'unit'>): string {
  return summarizeItem({
    id: '',
    articleId: '',
    checked: false,
    createdAt: '',
    contributions: [
      { id: '', source: { kind: 'manual' }, count: item.count, qty: item.qty, unit: item.unit },
    ],
  }).amount;
}

/** "wöchentlich Sa · nächstes Mal morgen", "monatlich am 1. · pausiert" (AC-002–AC-005). */
export function recurringItemSubtitle(
  item: DueFields & Pick<RecurringItem, 'lastAddedOn'>,
  today: ISODate,
): string {
  const rhythm = seriesRuleLabel(item.rule, item.startsOn);
  if (item.paused) return `${rhythm} · pausiert`;
  const next = nextRecurringDay(item, today);
  return next === undefined ? rhythm : `${rhythm} · nächstes Mal ${dayLabel(next, today)}`;
}

/** The contribution's source for the day `on`. */
export function recurringSource(
  item: Pick<RecurringItem, 'id'>,
  on: ISODate,
): Extract<ContributionSource, { kind: 'recurring' }> {
  return { kind: 'recurring', recurringItemId: item.id, on };
}

/** "Steht schon auf der Liste" (Decision 6): an open item of the article with its contribution. */
export function recurringOnList(
  item: Pick<RecurringItem, 'id' | 'articleId'>,
  items: readonly ShoppingItem[],
): boolean {
  return items.some(
    (candidate) =>
      !candidate.checked &&
      candidate.articleId === item.articleId &&
      candidate.contributions.some(
        (contribution) =>
          contribution.source.kind === 'recurring' &&
          contribution.source.recurringItemId === item.id,
      ),
  );
}

/** The form's "Rhythmus": a stored rule, or weekly on today's weekday. */
export function recurringRepeat(rule: RecurringRule | undefined, today: ISODate): RepeatDraft {
  const base = { ...defaultRepeat(today), kind: 'weekly' as const };
  if (rule === undefined) return base;
  if (rule.type === 'weekly') return { ...base, every: rule.every, weekdays: [...rule.weekdays] };
  return { ...base, kind: 'monthly', monthDay: rule.day };
}

/** The rule of the form (weekly or monthly only). */
export function recurringRule(repeat: RepeatDraft): RecurringRule {
  if (repeat.kind === 'monthly') return { type: 'monthly', day: repeat.monthDay };
  return {
    type: 'weekly',
    every: repeat.every,
    weekdays: [...new Set(repeat.weekdays)].sort((a, b) => a - b),
  };
}

export interface RecurringDraft {
  /** Set when an existing Dauerposten is changed. */
  id?: Id;
  articleId?: Id;
  articleName: string;
  amountText: string;
  repeat: RepeatDraft;
}

export const PICK_ARTICLE = 'Wähl einen Artikel.';

/** Why the draft cannot be saved, in the form's words; undefined when it can (AC-007, AC-008). */
export function recurringDraftProblem(
  draft: RecurringDraft,
  existing: readonly Pick<RecurringItem, 'id' | 'articleId'>[],
): string | undefined {
  if (draft.articleId === undefined) return PICK_ARTICLE;
  if (parseItemAmount(draft.amountText) === undefined) return AMOUNT_NOT_RECOGNIZED;
  const problem = seriesDraftProblem({ rule: recurringRule(draft.repeat), startsOn: '2000-01-01' });
  if (problem) return problem;
  if (existing.some((other) => other.articleId === draft.articleId && other.id !== draft.id)) {
    return `Für ${draft.articleName} gibt es schon einen Dauerposten`;
  }
  return undefined;
}

export interface RecurringPickerRow {
  item: RecurringItem;
  /** Its first day in the seven days shown. */
  on: ISODate;
  title: string;
  amount: string;
  /** "Sa 28.11.". */
  dayLabel: string;
  /** Already open on the list (AC-026): shown, not selectable. */
  onList: boolean;
}

/**
 * "Regelmäßig" in step 1 of "Aus Kalender …" (REQ-005): every active Dauerposten due in the seven
 * days from `start` that has not come for that day yet, once with its first day; by day, then title.
 */
export function recurringPickerRows(input: {
  recurringItems: readonly RecurringItem[];
  articlesById: Record<Id, Article | undefined>;
  items: readonly ShoppingItem[];
  start: ISODate;
  days?: number;
}): RecurringPickerRow[] {
  const last = addDays(input.start, (input.days ?? 7) - 1);
  const rows: RecurringPickerRow[] = [];
  for (const item of input.recurringItems) {
    const article = input.articlesById[item.articleId];
    const on = nextRecurringDay(item, input.start);
    if (!article || on === undefined || on > last) continue;
    rows.push({
      item,
      on,
      title: recurringItemTitle(item, article),
      amount: recurringAmountLabel(item),
      dayLabel: `${weekdayShort(on)} ${formatShortDate(on)}`,
      onList: recurringOnList(item, input.items),
    });
  }
  return rows.sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title, 'de'));
}
