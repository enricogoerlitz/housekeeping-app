import { describe, expect, it } from 'vitest';

import { seriesPlanEntries } from './activity-series';
import { notificationTargetHref } from './notifications';
import { dueNotices, isNoticeKey, type NoticeInput } from './notices';
import { enrico, nadja, trip } from './test-fixtures';
import type {
  Activity,
  ActivitySeries,
  ActivitySeriesException,
  Chore,
  MealSlot,
  PackingItem,
  PackingListBag,
} from './types';

// Spec 0059 "Nichts verpassen": Vorwarnung an Serien und Aufgaben, Packen am Vorabend.
const slots: MealSlot[] = [
  { id: 'slot-mittag', name: 'Mittag', sort: 0 },
  { id: 'slot-abend', name: 'Abend', sort: 1 },
];
const mama = { id: 'a-mama', name: 'Geburtstag Mama' } as Activity;

function input(partial: Partial<NoticeInput>): NoticeInput {
  return {
    me: enrico.id,
    today: '2026-11-27',
    now: '18:00',
    entries: [],
    chores: [],
    book: { recipesById: {}, collectionRecipes: [] },
    slots,
    restaurantsById: {},
    activitiesById: { [mama.id]: mama },
    away: { members: [enrico, nadja], trips: [] },
    acknowledged: [],
    ...partial,
  };
}

function shown(partial: Partial<NoticeInput>): string[] {
  return dueNotices(input(partial)).map((notice) => `${notice.title} | ${notice.detail}`);
}

// ---------- REQ-003: Erinnern an Serien ----------

const birthday: ActivitySeries = {
  id: 's-mama',
  activityId: mama.id,
  rule: { type: 'yearly' },
  startsOn: '2020-12-03',
  slotId: 'slot-abend',
  eaterIds: [],
  guests: 0,
  reminder: { offsetDays: 7, at: '18:00', text: 'Geschenk besorgen' },
};

/** The Termine as the bell gets them: today to 30 days ahead. */
function termine(
  today: string,
  series: ActivitySeries = birthday,
  exceptions: ActivitySeriesException[] = [],
) {
  const to = new Date(`${today}T12:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 30);
  return seriesPlanEntries([series], exceptions, today, to.toISOString().slice(0, 10));
}

describe('Erinnern an Serien (REQ-003)', () => {
  it('AC-011: every Termin carries the reminder of its series', () => {
    const [termin] = seriesPlanEntries([birthday], [], '2026-12-03', '2026-12-03');
    expect(termin?.reminder).toEqual({ offsetDays: 7, at: '18:00', text: 'Geschenk besorgen' });
  });

  it('AC-011: a week before at 18:00 the bell names the Termin and the text', () => {
    const notices = dueNotices(input({ today: '2026-11-26', entries: termine('2026-11-26') }));
    expect(notices.map((notice) => `${notice.title} | ${notice.detail}`)).toEqual([
      'Geburtstag Mama | Do 3.12., Abend · Geschenk besorgen',
    ]);
    const [notice] = notices;
    expect(notice?.kind).toBe('entryReminder');
    expect(notice && isNoticeKey(notice.key)).toBe(true);
    expect(notice?.target).toEqual({ screen: 'calendar', day: '2026-12-03' });
  });

  it('AC-011: for everyone, also who is not named as dabei', () => {
    const withNadja = { ...birthday, eaterIds: [nadja.id] };
    expect(shown({ today: '2026-11-26', entries: termine('2026-11-26', withNadja) })).toHaveLength(
      1,
    );
  });

  it('AC-012: before the moment nothing', () => {
    expect(shown({ today: '2026-11-26', now: '17:55', entries: termine('2026-11-26') })).toEqual(
      [],
    );
  });

  it('AC-013: a moved Termin counts the Vorlauf from its new day', () => {
    const moved = [{ id: 'x-1', seriesId: birthday.id, on: '2026-12-03', movedTo: '2026-12-05' }];
    expect(shown({ today: '2026-11-26', entries: termine('2026-11-26', birthday, moved) })).toEqual(
      [],
    );
    expect(shown({ today: '2026-11-28', entries: termine('2026-11-28', birthday, moved) })).toEqual(
      ['Geburtstag Mama | Sa 5.12., Abend · Geschenk besorgen'],
    );
  });

  it('AC-014: with a reminder the eve of the Termin brings no "Aktivität morgen" as well', () => {
    const notices = dueNotices(
      input({ today: '2026-12-02', now: '19:30', entries: termine('2026-12-02') }),
    );
    expect(notices.map((notice) => notice.kind)).toEqual(['entryReminder']);
  });

  it('a series without a reminder keeps "Aktivität morgen" only', () => {
    const plain = { ...birthday, reminder: undefined };
    const notices = dueNotices(
      input({ today: '2026-12-02', now: '19:30', entries: termine('2026-12-02', plain) }),
    );
    expect(notices.map((notice) => notice.kind)).toEqual(['activity']);
  });
});

// ---------- REQ-004: Vorwarnung an Aufgaben ----------

function chore(partial: Partial<Chore> & Pick<Chore, 'id' | 'title'>): Chore {
  return {
    recurrence: { type: 'once' },
    assignment: { type: 'anyone' },
    effort: 1,
    nextDueOn: '2026-12-15',
    ...partial,
  };
}

const vertrag = chore({ id: 'c-vertrag', title: 'Handyvertrag kündigen', noticeDaysBefore: 30 });

describe('Vorwarnung an Aufgaben (REQ-004)', () => {
  it('AC-018: within the Vorwarnung the bell says how far the Termin is', () => {
    const notices = dueNotices(input({ chores: [vertrag] }));
    expect(notices.map((notice) => `${notice.title} | ${notice.detail}`)).toEqual([
      'Handyvertrag kündigen | fällig in 18 Tagen · Di 15.12.',
    ]);
    const [notice] = notices;
    expect(notice?.kind).toBe('deadline');
    expect(notice?.key).toBe('deadline:c-vertrag:2026-12-15');
    expect(notice && isNoticeKey(notice.key)).toBe(true);
    expect(notice?.target).toEqual({ screen: 'chore', choreId: 'c-vertrag' });
  });

  it('AC-018: "morgen" and "heute" near the Termin', () => {
    expect(shown({ today: '2026-12-14', now: '07:00', chores: [vertrag] })).toEqual([
      'Handyvertrag kündigen | fällig morgen · Di 15.12.',
    ]);
    expect(shown({ today: '2026-12-15', now: '07:00', chores: [vertrag] })).toEqual([
      'Handyvertrag kündigen | heute fällig',
    ]);
  });

  it('AC-019: before the Vorwarnung begins nothing', () => {
    const week = { ...vertrag, noticeDaysBefore: 7 };
    expect(shown({ chores: [week] })).toEqual([]);
    expect(shown({ today: '2026-12-08', now: '00:00', chores: [week] })).toHaveLength(1);
    expect(shown({ today: '2026-12-07', now: '23:59', chores: [week] })).toEqual([]);
  });

  it('AC-020: one key per Termin, so an acknowledgement holds until the Termin', () => {
    expect(
      shown({
        today: '2026-12-02',
        chores: [vertrag],
        acknowledged: ['deadline:c-vertrag:2026-12-15'],
      }),
    ).toEqual([]);
  });

  it('AC-021: on the Termin with a time and "Erinnern" only the chore notice', () => {
    const timed = { ...vertrag, dueTime: '19:00' as const };
    const notices = dueNotices(input({ today: '2026-12-15', now: '19:30', chores: [timed] }));
    expect(notices.map((notice) => notice.kind)).toEqual(['chore']);
    // Before the Termin the Vorwarnung shows; "Erinnern" off leaves it on the Termin too.
    expect(shown({ today: '2026-12-14', chores: [timed] })).toHaveLength(1);
    const silent = { ...timed, remindAtDueTime: false };
    expect(
      dueNotices(input({ today: '2026-12-15', now: '19:30', chores: [silent] })).map(
        (notice) => notice.kind,
      ),
    ).toEqual(['deadline']);
  });

  it('AC-022: only for whoever is up', () => {
    const hers = { ...vertrag, assignment: { type: 'fixed' as const, memberId: nadja.id } };
    expect(shown({ chores: [hers] })).toEqual([]);
    expect(shown({ me: nadja.id, chores: [hers] })).toHaveLength(1);
  });

  it('AC-023: none when overdue, flexible, as needed or without a Vorwarnung', () => {
    expect(shown({ today: '2026-12-16', chores: [vertrag] })).toEqual([]);
    expect(
      shown({
        chores: [
          { ...vertrag, recurrence: { type: 'flexible', everyDays: 30 } },
          { ...vertrag, id: 'c-2', recurrence: { type: 'asNeeded' }, nextDueOn: undefined },
          { ...vertrag, id: 'c-3', noticeDaysBefore: undefined },
        ],
      }),
    ).toEqual([]);
  });

  it('the Vorwarnung counts from the Termin after a trip', () => {
    const solo = { ...vertrag, assignment: { type: 'fixed' as const, memberId: enrico.id } };
    const away = {
      members: [enrico, nadja],
      trips: [trip('t-1', [enrico.id], '2026-12-14', '2026-12-20')],
    };
    const ten = { ...solo, noticeDaysBefore: 10 };
    expect(shown({ today: '2026-12-13', chores: [ten], away })).toEqual([
      'Handyvertrag kündigen | fällig in 8 Tagen · Mo 21.12.',
    ]);
    expect(shown({ today: '2026-12-10', chores: [ten], away })).toEqual([]);
  });
});

// ---------- REQ-005: Packen am Vorabend ----------

const ostsee = trip('t-ostsee', [enrico.id], '2026-11-28', '2026-11-30', 'Ostsee');
const bag: PackingListBag = { id: 'lb-1', tripId: ostsee.id, name: 'Koffer', sort: 0 };

function items(packed: number, total: number): PackingItem[] {
  return Array.from({ length: total }, (_, index) => ({
    id: `pi-${index}`,
    listBagId: bag.id,
    name: `Ding ${index}`,
    packed: index < packed,
    packSeq: 0,
    sort: index,
  }));
}

function packingInput(partial: Partial<NoticeInput> = {}): Partial<NoticeInput> {
  return {
    away: { members: [enrico, nadja], trips: [ostsee] },
    packing: { listBags: [bag], items: items(12, 30) },
    ...partial,
  };
}

describe('Packen am Vorabend (REQ-005)', () => {
  it('AC-025: from 18:00 on the eve, with the state of the packing list', () => {
    const notices = dueNotices(input(packingInput()));
    expect(notices.map((notice) => `${notice.title} | ${notice.detail}`)).toEqual([
      "Ostsee | Morgen geht's los · 12 von 30 gepackt",
    ]);
    const [notice] = notices;
    expect(notice?.kind).toBe('packing');
    expect(notice?.key).toBe('packing:t-ostsee:2026-11-28');
    expect(notice && isNoticeKey(notice.key)).toBe(true);
    expect(notice?.target).toEqual({ screen: 'trip', tripId: 't-ostsee' });
    expect(notice && notificationTargetHref(notice.target)).toBe('/reisen?reise=t-ostsee');
  });

  it('AC-025: a trip without a note is "unterwegs"', () => {
    const plain = { ...ostsee, note: undefined };
    expect(shown(packingInput({ away: { members: [enrico, nadja], trips: [plain] } }))).toEqual([
      "unterwegs | Morgen geht's los · 12 von 30 gepackt",
    ]);
  });

  it('AC-026: not before 18:00, not when all is packed, not without a list, not as a draft', () => {
    expect(shown(packingInput({ now: '17:55' }))).toEqual([]);
    expect(shown(packingInput({ packing: { listBags: [bag], items: items(30, 30) } }))).toEqual([]);
    expect(shown(packingInput({ packing: { listBags: [], items: [] } }))).toEqual([]);
    expect(shown({ away: packingInput().away })).toEqual([]);
    const draft = { ...ostsee, draft: true };
    expect(shown(packingInput({ away: { members: [enrico, nadja], trips: [draft] } }))).toEqual([]);
  });

  it('AC-026: only on the eve, not two days before', () => {
    expect(shown(packingInput({ today: '2026-11-26', now: '20:00' }))).toEqual([]);
  });

  it('AC-027: only who travels', () => {
    expect(shown(packingInput({ me: nadja.id }))).toEqual([]);
  });
});
