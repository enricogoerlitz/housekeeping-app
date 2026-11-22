import { describe, expect, it } from 'vitest';

import { memberRemovalPrompt } from './membership';

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
