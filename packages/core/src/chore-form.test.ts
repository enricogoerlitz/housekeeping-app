import { describe, expect, it } from 'vitest';

import {
  choreDraftErrors,
  choreDraftFrom,
  choreFieldsOf,
  newChoreDraft,
  plannedFieldsOf,
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
  touched: { rhythm: true, assignment: true, season: true },
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
      touched: { rhythm: false, assignment: false, season: false },
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
    const stored = chore({ recurrence });
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
    const touched = { rhythm: false, assignment: false, season: true };
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
    });
  });

  it('AC-051: a touched rhythm or assignment takes the form; weekdays in order, alternating between all members', () => {
    const stored = chore();
    const draft: ChoreDraft = {
      ...choreDraftFrom(stored, today, enrico.id),
      weekdays: [6, 2],
      assignment: 'rotating',
      touched: { rhythm: true, assignment: true, season: false },
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
