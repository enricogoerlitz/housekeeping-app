import { describe, expect, it } from 'vitest';

import { usedArticleIds } from './article-catalog';
import {
  isRecurringDue,
  nextRecurringDay,
  RECURRING_LABEL,
  recurringAmountLabel,
  recurringDraftProblem,
  recurringItemSubtitle,
  recurringItemTitle,
  recurringNextText,
  recurringOnList,
  recurringPickerRows,
  recurringRepeat,
  recurringSource,
} from './recurring-items';
import { originRows, listHeadline } from './shopping-list';
import { originLabel, summarizeItem } from './shopping';
import { listPickerContinueLabel } from './shopping-picker';
import type { Article, RecurringItem, ShoppingItem } from './types';

// Fr 27.11.2026, KW 48 (23.–29.11.).
const TODAY = '2026-11-27';

const article = (id: string, name: string): Article =>
  ({ id, name, synonyms: [], diet: 'unknown', isPantry: false }) as unknown as Article;
const cola = article('a-cola', 'Cola');
const milch = article('a-milch', 'Milch');
const articlesById = { [cola.id]: cola, [milch.id]: milch };

const recurring = (overrides: Partial<RecurringItem> = {}): RecurringItem => ({
  id: 'r-cola',
  articleId: cola.id,
  count: 2,
  rule: { type: 'weekly', every: 1, weekdays: [6] },
  startsOn: TODAY,
  paused: false,
  createdAt: '2026-11-27T09:00:00Z',
  ...overrides,
});

const item = (overrides: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id: 'i-cola',
  articleId: cola.id,
  contributions: [],
  checked: false,
  createdAt: '2026-11-27T09:00:00Z',
  ...overrides,
});

describe('due days (spec 0060, REQ-003)', () => {
  it('AC-013: weekly on Saturday is due on Sa 28.11., not on Fr 27.11. or So 29.11.', () => {
    const cola2 = recurring();
    expect(isRecurringDue(cola2, '2026-11-28')).toBe(true);
    expect(isRecurringDue(cola2, '2026-11-27')).toBe(false);
    expect(isRecurringDue(cola2, '2026-11-29')).toBe(false);
    expect(isRecurringDue(cola2, '2026-12-05')).toBe(true);
  });

  it('AC-018: every 2 weeks from the week of 27.11. is due on 28.11. and 12.12., not on 5.12.', () => {
    const every2 = recurring({ rule: { type: 'weekly', every: 2, weekdays: [6] } });
    expect(isRecurringDue(every2, '2026-11-28')).toBe(true);
    expect(isRecurringDue(every2, '2026-12-05')).toBe(false);
    expect(isRecurringDue(every2, '2026-12-12')).toBe(true);
  });

  it('AC-018: paused or before the start is never due', () => {
    expect(isRecurringDue(recurring({ paused: true }), '2026-11-28')).toBe(false);
    expect(isRecurringDue(recurring({ startsOn: '2026-11-29' }), '2026-11-28')).toBe(false);
  });

  it('AC-019: monthly on the 31st falls on the last day of shorter months', () => {
    const on31 = recurring({ rule: { type: 'monthly', day: 31 }, startsOn: '2026-11-01' });
    expect(isRecurringDue(on31, '2026-11-30')).toBe(true);
    expect(isRecurringDue(on31, '2026-12-31')).toBe(true);
    expect(isRecurringDue(on31, '2027-02-28')).toBe(true);
    expect(isRecurringDue(on31, '2026-12-30')).toBe(false);
  });
});

describe('the row on "Dauerposten" (REQ-001)', () => {
  it('AC-002: "Cola 2×", "wöchentlich Sa · nächstes Mal morgen"', () => {
    const cola2 = recurring();
    expect(recurringItemTitle(cola2, cola)).toBe('Cola');
    expect(recurringAmountLabel(cola2)).toBe('2×');
    expect(recurringItemSubtitle(cola2, TODAY)).toBe('wöchentlich Sa · nächstes Mal morgen');
  });

  it('AC-003: every 2 weeks reads "alle 2 Wochen Sa"', () => {
    const every2 = recurring({ rule: { type: 'weekly', every: 2, weekdays: [6] } });
    expect(recurringItemSubtitle(every2, TODAY)).toBe('alle 2 Wochen Sa · nächstes Mal morgen');
  });

  it('AC-004: "Milch (laktosefrei) 1 l", "monatlich am 1. · nächstes Mal Di 1.12."', () => {
    const milk = recurring({
      id: 'r-milch',
      articleId: milch.id,
      count: undefined,
      qty: 1,
      unit: 'l',
      note: 'laktosefrei',
      rule: { type: 'monthly', day: 1 },
    });
    expect(recurringItemTitle(milk, milch)).toBe('Milch (laktosefrei)');
    expect(recurringAmountLabel(milk)).toBe('1 l');
    expect(recurringItemSubtitle(milk, TODAY)).toBe('monatlich am 1. · nächstes Mal Di 1.12.');
  });

  it('AC-005: a paused one reads "pausiert"', () => {
    expect(recurringItemSubtitle(recurring({ paused: true }), TODAY)).toBe(
      'wöchentlich Sa · pausiert',
    );
    expect(nextRecurringDay(recurring({ paused: true }), TODAY)).toBeUndefined();
  });

  it('"nächstes Mal heute" on its day; after it came today, the next one (AC-014, AC-025)', () => {
    expect(recurringItemSubtitle(recurring(), '2026-11-28')).toBe(
      'wöchentlich Sa · nächstes Mal heute',
    );
    expect(nextRecurringDay(recurring({ lastAddedOn: '2026-11-28' }), '2026-11-28')).toBe(
      '2026-12-05',
    );
    expect(nextRecurringDay(recurring({ lastAddedOn: '2026-11-28' }), TODAY)).toBe('2026-12-05');
  });

  it('AC-002: the form says when it comes: "morgen", "heute", "am Di 1.12."', () => {
    expect(recurringNextText('2026-11-28', TODAY)).toBe('morgen');
    expect(recurringNextText(TODAY, TODAY)).toBe('heute');
    expect(recurringNextText('2026-12-01', TODAY)).toBe('am Di 1.12.');
  });

  it('a draft starts weekly on today and keeps a stored rule', () => {
    expect(recurringRepeat(undefined, TODAY)).toMatchObject({
      kind: 'weekly',
      every: 1,
      weekdays: [5],
      monthDay: 27,
    });
    expect(recurringRepeat({ type: 'monthly', day: 1 }, TODAY)).toMatchObject({
      kind: 'monthly',
      monthDay: 1,
    });
  });
});

describe('saving a draft (REQ-001)', () => {
  const draft = {
    articleId: cola.id as string | undefined,
    articleName: 'Cola',
    amountText: '2',
    repeat: recurringRepeat({ type: 'weekly', every: 1, weekdays: [6] }, TODAY),
  };

  it('AC-002: a valid draft has no problem', () => {
    expect(recurringDraftProblem(draft, [])).toBeUndefined();
  });

  it('AC-007: "viel", no weekday and no article are problems', () => {
    expect(recurringDraftProblem({ ...draft, amountText: 'viel' }, [])).toBe(
      'Menge nicht erkannt – z. B. 500 g oder 2',
    );
    expect(recurringDraftProblem({ ...draft, repeat: { ...draft.repeat, weekdays: [] } }, [])).toBe(
      'Wähl mindestens einen Wochentag.',
    );
    expect(recurringDraftProblem({ ...draft, articleId: undefined }, [])).toBe(
      'Wähl einen Artikel.',
    );
  });

  it('AC-008: an article with a Dauerposten cannot get a second one; its own one can be saved', () => {
    expect(recurringDraftProblem(draft, [recurring()])).toBe(
      'Für Cola gibt es schon einen Dauerposten',
    );
    expect(recurringDraftProblem({ ...draft, id: 'r-cola' }, [recurring()])).toBeUndefined();
  });
});

describe('Herkunft "regelmäßig" (REQ-004)', () => {
  const fromRecurring = {
    id: 'c-r',
    source: recurringSource(recurring(), '2026-11-28'),
    count: 1,
  };

  it('AC-013: the source names the Dauerposten and its day', () => {
    expect(fromRecurring.source).toEqual({
      kind: 'recurring',
      recurringItemId: 'r-cola',
      on: '2026-11-28',
    });
    expect(originLabel(fromRecurring.source)).toBe(RECURRING_LABEL);
  });

  it('AC-016, AC-021: "von Hand: 1× · regelmäßig: 1×" sums to 2×; regelmäßig is an origin row with ✕', () => {
    const milk = item({
      contributions: [{ id: 'c-m', source: { kind: 'manual' }, count: 1 }, fromRecurring],
    });
    expect(summarizeItem(milk).amount).toBe('2×');
    expect(summarizeItem(milk).sources).toEqual(['von Hand', 'regelmäßig']);
    expect(originRows(milk)).toEqual([
      { label: 'regelmäßig', amount: '1×', contributionIds: ['c-r'] },
    ]);
  });

  it('AC-022: items only from Dauerposten are not dishes in the headline', () => {
    const headline = listHeadline([item({ contributions: [fromRecurring] })], {});
    expect(headline.label).toBe('1 offen');
    expect(headline.dishes).toEqual([]);
  });

  it('AC-015, AC-026: on the list = an open item of the article with its regelmäßig contribution', () => {
    const cola2 = recurring();
    expect(recurringOnList(cola2, [item({ contributions: [fromRecurring] })])).toBe(true);
    expect(recurringOnList(cola2, [item({ contributions: [fromRecurring], checked: true })])).toBe(
      false,
    );
    expect(
      recurringOnList(cola2, [
        item({ contributions: [{ id: 'c', source: { kind: 'manual' }, count: 1 }] }),
      ]),
    ).toBe(false);
  });
});

describe('"Regelmäßig" in "Aus Kalender …" (REQ-005)', () => {
  const milk = recurring({
    id: 'r-milch',
    articleId: milch.id,
    count: undefined,
    qty: 1,
    unit: 'l',
    rule: { type: 'monthly', day: 1 },
  });

  it('AC-023: due ones of the seven days, each once with its first day, by day', () => {
    const rows = recurringPickerRows({
      recurringItems: [milk, recurring()],
      articlesById,
      items: [],
      start: TODAY,
    });
    expect(
      rows.map((row) => [row.item.id, row.title, row.amount, row.dayLabel, row.onList]),
    ).toEqual([
      ['r-cola', 'Cola', '2×', 'Sa 28.11.', false],
      ['r-milch', 'Milch', '1 l', 'Di 1.12.', false],
    ]);
    expect(rows[0]?.on).toBe('2026-11-28');
  });

  it('AC-026: one already open on the list is marked; a paused one is missing', () => {
    const open = item({
      contributions: [{ id: 'c', source: recurringSource(recurring(), '2026-11-21'), count: 2 }],
    });
    const rows = recurringPickerRows({
      recurringItems: [recurring(), { ...milk, paused: true }],
      articlesById,
      items: [open],
      start: TODAY,
    });
    expect(rows.map((row) => [row.item.id, row.onList])).toEqual([['r-cola', true]]);
  });

  it('AC-027: the next seven days show Sa 5.12.; none due = no rows; a day already brought is skipped', () => {
    const next = recurringPickerRows({
      recurringItems: [recurring()],
      articlesById,
      items: [],
      start: '2026-12-04',
    });
    expect(next.map((row) => row.dayLabel)).toEqual(['Sa 5.12.']);
    expect(
      recurringPickerRows({
        recurringItems: [recurring({ rule: { type: 'monthly', day: 15 } })],
        articlesById,
        items: [],
        start: TODAY,
      }),
    ).toEqual([]);
    expect(
      recurringPickerRows({
        recurringItems: [recurring({ lastAddedOn: '2026-11-28' })],
        articlesById,
        items: [],
        start: TODAY,
      }),
    ).toEqual([]);
  });

  it('a Dauerposten whose article is gone is left out', () => {
    expect(
      recurringPickerRows({
        recurringItems: [recurring({ articleId: 'gone' })],
        articlesById,
        items: [],
        start: TODAY,
      }),
    ).toEqual([]);
  });

  it('AC-024: "Weiter: 1 Dauerposten", "Weiter: 1 Gericht · 1 Dauerposten"', () => {
    expect(listPickerContinueLabel(0, 1)).toBe('Weiter: 1 Dauerposten');
    expect(listPickerContinueLabel(1, 1)).toBe('Weiter: 1 Gericht · 1 Dauerposten');
    expect(listPickerContinueLabel(3, 0)).toBe('Weiter: 3 Gerichte');
    expect(listPickerContinueLabel(0, 0)).toBe('Weiter');
  });
});

describe('"Unbenutzt" (REQ-002)', () => {
  it('AC-011: an article with a Dauerposten is used', () => {
    expect(usedArticleIds([], [], [recurring()]).has(cola.id)).toBe(true);
    expect(usedArticleIds([], [], []).has(cola.id)).toBe(false);
  });
});
