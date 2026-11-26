import { describe, expect, it } from 'vitest';

import { householdOwnerId, memberRemovalPrompt } from './membership';

describe('householdOwnerId: the owner is derived (spec 0042, REQ-005, Decision 1)', () => {
  const enrico = { profileId: 'a1', joinedAt: '2026-11-20T09:00:00.123456+00:00' };
  const nadja = { profileId: '0b', joinedAt: '2026-11-21T18:30:00+00:00' };

  it('AC-011: Enrico joined on 20.11., Nadja on 21.11.: Enrico is the owner', () => {
    expect(householdOwnerId([nadja, enrico])).toBe('a1');
  });

  it('AC-014: after Enrico left, Nadja is the owner', () => {
    expect(householdOwnerId([nadja])).toBe('0b');
  });

  it('Decision 1: on the same join time the smaller profile id is the owner', () => {
    const same = '2026-11-20T09:00:00.123456+00:00';
    expect(
      householdOwnerId([
        { profileId: 'b2', joinedAt: same },
        { profileId: 'a9', joinedAt: same },
      ]),
    ).toBe('a9');
  });

  it('REQ-005: microseconds count, and so does the offset of the same notation', () => {
    expect(
      householdOwnerId([
        { profileId: 'b', joinedAt: '2026-11-20T09:00:00.123457+00:00' },
        { profileId: 'c', joinedAt: '2026-11-20T09:00:00.123456+00:00' },
      ]),
    ).toBe('c');
    expect(
      householdOwnerId([
        { profileId: 'b', joinedAt: '2026-11-20T10:00:00+01:00' },
        { profileId: 'a', joinedAt: '2026-11-20T09:00:01Z' },
      ]),
    ).toBe('b');
  });

  it('REQ-005: no members, no owner; an unreadable join time counts last', () => {
    expect(householdOwnerId([])).toBeUndefined();
    expect(
      householdOwnerId([
        { profileId: 'a', joinedAt: '' },
        { profileId: 'b', joinedAt: '2026-11-21T00:00:00Z' },
      ]),
    ).toBe('b');
  });
});

const HOUSEHOLD = 'Enrico & Nadja';

describe('memberRemovalPrompt: "Entfernen" and "Verlassen" ask first (spec 0018, REQ-004)', () => {
  it('AC-010: removing Nadja names her and the household', () => {
    expect(
      memberRemovalPrompt({
        memberName: 'Nadja',
        householdName: HOUSEHOLD,
        self: false,
        householdCount: 2,
      }),
    ).toEqual({ title: 'Nadja aus „Enrico & Nadja“ entfernen?', confirmLabel: 'Entfernen' });
  });

  it('AC-011: leaving says that only a new invitation brings me back', () => {
    expect(
      memberRemovalPrompt({
        memberName: 'Enrico',
        householdName: HOUSEHOLD,
        self: true,
        householdCount: 2,
      }),
    ).toEqual({
      title: '„Enrico & Nadja“ verlassen?',
      message: 'Zurück kommst du nur mit einer neuen Einladung.',
      confirmLabel: 'Verlassen',
    });
  });

  it('AC-012: leaving my only household says so as well', () => {
    expect(
      memberRemovalPrompt({
        memberName: 'Enrico',
        householdName: HOUSEHOLD,
        self: true,
        householdCount: 1,
      }).message,
    ).toBe('Das ist dein einziger Haushalt. Zurück kommst du nur mit einer neuen Einladung.');
  });

  it('AC-012: removing someone else never talks about my only household', () => {
    expect(
      memberRemovalPrompt({
        memberName: 'Nadja',
        householdName: HOUSEHOLD,
        self: false,
        householdCount: 1,
      }).message,
    ).toBeUndefined();
  });
});
