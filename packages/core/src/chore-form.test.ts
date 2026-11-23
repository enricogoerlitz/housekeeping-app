import { describe, expect, it } from 'vitest';

import {
  choreDraftErrors,
  choreDraftFrom,
  choreFieldsOf,
  draftNextAssignee,
  draftNextDueOn,
  hasNextDueField,
  newChoreDraft,
  plannedFieldsOf,
  rhythmPatch,
  type ChoreDraft,
} from './chore-form';
import { enrico, nadja } from './test-fixtures';
import type { Assignment, Chore, Recurrence } from './types';

// Friday, 20 November 2026.
const today = '2026-11-20';
const members = [enrico, nadja];

const chore = (patch: Partial<Chore> = {}): Chore => ({
  id: 'c',
  title: 'Bad putzen',
  room: 'Bad',
  recurrence: { type: 'weekly', every: 1, weekdays: [5] },
  assignment: { type: 'fixed', memberId: nadja.id },
  effort: 2,
  nextDueOn: today,
  ...patch,
});

/** The draft as after a change of every part of the form. */
const touchedAll = (draft: ChoreDraft): ChoreDraft => ({
  ...draft,
  touched: { rhythm: true, assignment: true, season: true, nextDue: false },
});

describe('newChoreDraft (spec 0003, AC-036)', () => {
  it('is weekly, alternating, 1 point, all year, nothing touched; the month day is today', () => {
    const draft = newChoreDraft(today, enrico.id);
    expect(draft).toMatchObject({
      title: '',
      rhythm: 'weekly',
      weekdays: [],
      monthDay: 20,
      assignment: 'rotating',
      fixedMemberId: enrico.id,
      effort: '1',
      seasonOn: false,
      touched: { rhythm: false, assignment: false, season: false, nextDue: false },
    });
    expect(newChoreDraft(today, enrico.id, 'asNeeded').rhythm).toBe('asNeeded');
  });
});

describe('choreDraftErrors (AC-052)', () => {
  it('AC-052: an empty title is „Titel fehlt“', () => {
    expect(
      choreDraftErrors({ ...newChoreDraft(today, enrico.id), title: '  ', weekdays: [5] }),
    ).toEqual({
      title: 'Titel fehlt',
    });
  });

  it('a weekly rhythm needs at least one day; other rhythms do not', () => {
    const draft = { ...newChoreDraft(today, enrico.id), title: 'Bad putzen' };
    expect(choreDraftErrors(draft)).toEqual({ weekdays: 'Wähle mindestens einen Tag.' });
    expect(choreDraftErrors({ ...draft, rhythm: 'monthly' })).toEqual({});
    expect(choreDraftErrors({ ...draft, weekdays: [1] })).toEqual({});
  });
});

describe('choreDraftFrom and choreFieldsOf: the form ↔ the chore (REQ-009)', () => {
  it.each<[string, Recurrence]>([
    ['einmalig mit Datum', { type: 'once', date: '2026-12-24' }],
    ['einmalig ohne Datum', { type: 'once' }],
    ['wöchentlich', { type: 'weekly', every: 2, weekdays: [2, 5] }],
    ['monatlich', { type: 'monthly', day: 1 }],
    ['alle n Monate', { type: 'everyMonths', every: 6 }],
    ['flexibel', { type: 'flexible', everyDays: 14 }],
    ['bei Bedarf', { type: 'asNeeded' }],
  ])('AC-050: the rhythm „%s“ comes back unchanged through the form', (_, recurrence) => {
    const stored = chore({
      recurrence,
      ...(recurrence.type === 'once' && { nextDueOn: recurrence.date }),
    });
    const fields = choreFieldsOf(touchedAll(choreDraftFrom(stored, today, enrico.id)), members);
    expect(fields.recurrence).toEqual(recurrence);
  });

  it.each<[string, Assignment]>([
    ['fest', { type: 'fixed', memberId: nadja.id }],
    ['abwechselnd', { type: 'rotating', memberIds: [enrico.id, nadja.id] }],
    ['egal wer', { type: 'anyone' }],
    ['zu zweit', { type: 'together' }],
  ])('AC-050: the assignment „%s“ comes back unchanged through the form', (_, assignment) => {
    const stored = chore({ assignment });
    const fields = choreFieldsOf(touchedAll(choreDraftFrom(stored, today, enrico.id)), members);
    expect(fields.assignment).toEqual(assignment);
  });

  it('AC-050: title, room and effort fill the form and come back', () => {
    const draft = choreDraftFrom(chore(), today, enrico.id);
    expect(draft).toMatchObject({ title: 'Bad putzen', room: 'Bad', effort: '2' });
    expect(choreFieldsOf(draft, members, chore())).toMatchObject({
      title: 'Bad putzen',
      room: 'Bad',
      effort: 2,
    });
  });

  it('AC-050: a season April–September fills „Von“/„Bis“; one across the turn of the year too', () => {
    expect(
      choreDraftFrom(chore({ activeMonths: [4, 5, 6, 7, 8, 9] }), today, enrico.id),
    ).toMatchObject({ seasonOn: true, seasonFrom: 4, seasonTo: 9 });
    expect(
      choreDraftFrom(chore({ activeMonths: [1, 2, 3, 10, 11, 12] }), today, enrico.id),
    ).toMatchObject({ seasonOn: true, seasonFrom: 10, seasonTo: 3 });
    for (const activeMonths of [undefined, [], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]]) {
      expect(choreDraftFrom(chore({ activeMonths }), today, enrico.id).seasonOn).toBe(false);
    }
  });

  it('AC-050: „Von“/„Bis“ become the months of the season; switched off it is all year', () => {
    const draft = { ...newChoreDraft(today, enrico.id), title: 'Balkon gießen', weekdays: [5] };
    const touched = { rhythm: false, assignment: false, season: true, nextDue: false };
    expect(
      choreFieldsOf({ ...draft, seasonOn: true, seasonFrom: 10, seasonTo: 3, touched }, members)
        .activeMonths,
    ).toEqual([10, 11, 12, 1, 2, 3]);
    expect(choreFieldsOf({ ...draft, seasonOn: false, touched }, members).activeMonths).toEqual([]);
    expect(
      choreFieldsOf({ ...draft, seasonOn: true, seasonFrom: 4, seasonTo: 9 }, members),
    ).toMatchObject({ activeMonths: [4, 5, 6, 7, 8, 9] });
  });

  it('AC-050: a new title alone keeps the stored rhythm, assignment and season, even ones the form cannot show', () => {
    const stored = chore({
      recurrence: { type: 'weekly', every: 1, weekdays: [5, 1] },
      assignment: { type: 'rotating', memberIds: [nadja.id] },
      activeMonths: [1, 3],
    });
    const draft = { ...choreDraftFrom(stored, today, enrico.id), title: 'Bad gründlich putzen' };
    expect(choreFieldsOf(draft, members, stored)).toEqual({
      title: 'Bad gründlich putzen',
      room: 'Bad',
      recurrence: stored.recurrence,
      assignment: stored.assignment,
      effort: 2,
      activeMonths: [1, 3],
      nextDueOn: today,
      nextAssigneeId: nadja.id,
    });
  });

  it('AC-051: a touched rhythm or assignment takes the form; weekdays in order, alternating between all members', () => {
    const stored = chore();
    const draft: ChoreDraft = {
      ...choreDraftFrom(stored, today, enrico.id),
      weekdays: [6, 2],
      assignment: 'rotating',
      touched: { rhythm: true, assignment: true, season: false, nextDue: false },
    };
    expect(choreFieldsOf(draft, members, stored)).toMatchObject({
      recurrence: { type: 'weekly', every: 1, weekdays: [2, 6] },
      assignment: { type: 'rotating', memberIds: [enrico.id, nadja.id] },
    });
  });
});

describe('plannedFieldsOf (AC-040: „Mehr Angaben“ in „Was hast du erledigt?“)', () => {
  it('AC-040: is the rhythm and the assignment of the form', () => {
    const draft: ChoreDraft = {
      ...newChoreDraft(today, enrico.id, 'flexible'),
      everyDays: 14,
      assignment: 'rotating',
    };
    expect(plannedFieldsOf(draft, members)).toEqual({
      recurrence: { type: 'flexible', everyDays: 14 },
      assignment: { type: 'rotating', memberIds: [enrico.id, nadja.id] },
    });
  });
});

// ---------- Spec 0026: „Nächstes Mal“, „Zuletzt erledigt“, „Als Nächstes dran“ ----------

describe('spec 0026, REQ-002 to REQ-004: the form', () => {
  // Sunday, 22 November 2026.
  const sunday = '2026-11-22';
  const rotating = { type: 'rotating' as const, memberIds: [enrico.id, nadja.id] };

  it('AC-004: „Alle 6 Monate“ with „Zuletzt erledigt“ Sa 15.8.2026 suggests Mo 15.2.2027 and saves the last time', () => {
    const draft: ChoreDraft = {
      ...newChoreDraft(sunday, enrico.id),
      title: 'Matratze drehen',
      rhythm: 'months',
      everyMonths: 6,
      lastDoneOn: '2026-08-15',
    };
    expect(draftNextDueOn(draft)).toBe('2027-02-15');
    expect(choreFieldsOf(draft, members)).toMatchObject({
      nextDueOn: '2027-02-15',
      lastDoneOn: '2026-08-15',
    });
  });

  it('AC-005: without „Zuletzt erledigt“ „Alle 2 Monate“ suggests Fr 22.1.2027, „etwa alle 14 Tage“ So 6.12.', () => {
    const base = newChoreDraft(sunday, enrico.id);
    expect(draftNextDueOn({ ...base, rhythm: 'months', everyMonths: 2 })).toBe('2027-01-22');
    expect(draftNextDueOn({ ...base, rhythm: 'flexible', everyDays: 14 })).toBe('2026-12-06');
  });

  it('AC-006: a chosen „Nächstes Mal“ is saved, also when editing', () => {
    const stored = chore({ nextDueOn: '2026-11-28', lastDoneOn: '2026-11-20' });
    const draft: ChoreDraft = {
      ...choreDraftFrom(stored, sunday, enrico.id),
      nextDueOn: '2026-11-27',
      touched: { rhythm: false, assignment: false, season: false, nextDue: true },
    };
    expect(choreFieldsOf(draft, members, stored).nextDueOn).toBe('2026-11-27');
    // Editing never sends „Zuletzt erledigt“.
    expect(choreFieldsOf(draft, members, stored).lastDoneOn).toBeUndefined();
  });

  it('AC-007: a new weekday moves the suggestion to „morgen“ until a day is chosen; then it stays', () => {
    const stored = chore({ nextDueOn: '2026-11-27', lastDoneOn: '2026-11-20' });
    const draft = choreDraftFrom(stored, sunday, enrico.id);
    expect(draftNextDueOn(draft)).toBe('2026-11-27');
    const monday: ChoreDraft = {
      ...draft,
      weekdays: [1],
      touched: { ...draft.touched, rhythm: true },
    };
    expect(draftNextDueOn(monday)).toBe('2026-11-23');
    const chosen: ChoreDraft = {
      ...monday,
      nextDueOn: '2026-11-25',
      weekdays: [1, 4],
      touched: { ...monday.touched, nextDue: true },
    };
    expect(draftNextDueOn(chosen)).toBe('2026-11-25');
    expect(choreFieldsOf(chosen, members, stored).nextDueOn).toBe('2026-11-25');
  });

  it('AC-008: „Nächstes Mal“ only for weekly, monthly, every n months and flexible', () => {
    expect(
      (['once', 'weekly', 'monthly', 'months', 'flexible', 'asNeeded'] as const).filter(
        hasNextDueField,
      ),
    ).toEqual(['weekly', 'monthly', 'months', 'flexible']);
    const asNeeded = { ...newChoreDraft(sunday, enrico.id, 'asNeeded'), lastDoneOn: '2026-11-01' };
    expect(choreFieldsOf(asNeeded, members)).not.toHaveProperty('nextDueOn');
    expect(choreFieldsOf(asNeeded, members)).not.toHaveProperty('lastDoneOn');
  });

  it('AC-009: „Als Nächstes dran“ = Enrico is saved for the alternating chore', () => {
    const stored = chore({ assignment: rotating, nextAssigneeId: nadja.id });
    const draft = choreDraftFrom(stored, sunday, nadja.id);
    expect(draftNextAssignee(draft, rotating.memberIds)).toBe(nadja.id);
    const fields = choreFieldsOf({ ...draft, nextAssigneeId: enrico.id }, members, stored);
    expect(fields.nextAssigneeId).toBe(enrico.id);
    // New: the first of the order.
    expect(draftNextAssignee(newChoreDraft(sunday, nadja.id), rotating.memberIds)).toBe(enrico.id);
  });

  it('AC-010: „Fest“ and back to „Abwechselnd“ shows Nadja again', () => {
    const draft = choreDraftFrom(
      chore({ assignment: rotating, nextAssigneeId: nadja.id }),
      sunday,
      nadja.id,
    );
    const fixedThenBack: ChoreDraft = { ...draft, assignment: 'fixed' };
    expect(
      choreFieldsOf({ ...fixedThenBack, touched: { ...draft.touched, assignment: true } }, members),
    ).not.toHaveProperty('nextAssigneeId');
    expect(
      draftNextAssignee({ ...fixedThenBack, assignment: 'rotating' }, rotating.memberIds),
    ).toBe(nadja.id);
  });

  it('AC-011: creating, „Bei Bedarf“ makes it „Egal“ unless the assignment was chosen', () => {
    const draft = newChoreDraft(sunday, enrico.id);
    expect(rhythmPatch(draft, 'asNeeded', true)).toEqual({
      rhythm: 'asNeeded',
      assignment: 'anyone',
    });
    const chosen: ChoreDraft = {
      ...draft,
      assignment: 'fixed',
      fixedMemberId: nadja.id,
      touched: { ...draft.touched, assignment: true },
    };
    expect(rhythmPatch(chosen, 'asNeeded', true)).toEqual({ rhythm: 'asNeeded' });
    expect(rhythmPatch(draft, 'asNeeded', false)).toEqual({ rhythm: 'asNeeded' });
  });

  it('AC-002: a one-off chore moved by „Später“ shows the moved day in the form', () => {
    const stored = chore({
      recurrence: { type: 'once', date: '2027-01-16' },
      nextDueOn: '2027-01-23',
    });
    expect(choreDraftFrom(stored, sunday, enrico.id).onceDate).toBe('2027-01-23');
  });
});
