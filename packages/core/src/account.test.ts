import { describe, expect, it } from 'vitest';

import {
  addDislike,
  canDeleteHousehold,
  deleteConfirmMatches,
  deleteHouseholdPrompt,
  feedbackActions,
  feedbackDeletePrompt,
  FEEDBACK_STATUS_NOTE,
  householdRename,
  invitationHint,
  INVITE_FIELD_HINT,
  invitedNotice,
  MAX_DISLIKES,
  memberProfileLine,
  profileDraftChanged,
  profileDraftErrors,
  PROFILE_COLORS,
  syncRow,
  withdrawnNotice,
  type ProfileDraft,
} from './account';
import type { FeedbackEntry, Member } from './types';

const NADJA: Member = {
  id: 'nadja',
  name: 'Nadja',
  color: '#3E6C8E',
  dietPreference: 'flexible',
  dislikes: [],
};

describe('Einladungen (REQ-001, REQ-002)', () => {
  it('AC-001: withdrawing says "Einladung an nadja@example.com zurückgezogen"', () => {
    expect(withdrawnNotice('nadja@example.com')).toBe(
      'Einladung an nadja@example.com zurückgezogen',
    );
  });

  it('AC-006: the hint under "Einladen" names the Google test users', () => {
    expect(INVITE_FIELD_HINT).toBe(
      'Ist die Adresse neu, muss Enrico sie zusätzlich bei Google als Testnutzer eintragen. Sonst zeigt Google beim Anmelden „Zugriff blockiert“.',
    );
  });

  it('AC-071 (spec 0031, replaces the notice of 0027 AC-006): Nadja invites, Enrico enters it at Google', () => {
    expect(invitedNotice('oma@example.com')).toBe(
      'oma@example.com ist eingeladen. Ist die Adresse neu, muss Enrico sie bei Google eintragen.',
    );
  });

  it('AC-007: offline both the offline hint and the Google hint stand there', () => {
    expect(invitationHint('Offline – zum Bearbeiten brauchst du Netz')).toBe(
      `Offline – zum Bearbeiten brauchst du Netz\n${INVITE_FIELD_HINT}`,
    );
    expect(invitationHint(undefined)).toBe(INVITE_FIELD_HINT);
  });
});

describe('Profil (REQ-003)', () => {
  const draft: ProfileDraft = {
    name: 'Nadja K.',
    color: '#2F7F7A',
    dietPreference: 'vegetarian',
    dislikes: ['Koriander'],
  };

  it('Decision 9: the eight avatar colours, the same list as private.profile_palette()', () => {
    expect(PROFILE_COLORS).toEqual([
      { name: 'Blau', hex: '#3E6C8E' },
      { name: 'Beere', hex: '#A8456B' },
      { name: 'Grün', hex: '#5B7F3A' },
      { name: 'Kupfer', hex: '#B5652B' },
      { name: 'Violett', hex: '#6A4C93' },
      { name: 'Petrol', hex: '#2F7F7A' },
      { name: 'Ocker', hex: '#8C6D1F' },
      { name: 'Rot', hex: '#9C3D3D' },
    ]);
  });

  it('AC-010: an empty name is "Der Name fehlt."; 1–80 characters after trimming', () => {
    expect(profileDraftErrors({ ...draft, name: '  ' })).toEqual({ name: 'Der Name fehlt.' });
    expect(profileDraftErrors({ ...draft, name: 'x'.repeat(81) })).toEqual({
      name: 'Höchstens 80 Zeichen',
    });
    expect(profileDraftErrors(draft)).toEqual({});
  });

  it('AC-010: "koriander" next to "Koriander" gives no second chip; trimmed; 1–40 characters', () => {
    expect(addDislike(['Koriander'], 'koriander')).toEqual({ dislikes: ['Koriander'] });
    expect(addDislike(['Koriander'], '  Rosenkohl ')).toEqual({
      dislikes: ['Koriander', 'Rosenkohl'],
    });
    expect(addDislike([], '   ')).toEqual({ dislikes: [] });
    expect(addDislike([], 'k'.repeat(41))).toEqual({
      dislikes: [],
      error: 'Höchstens 40 Zeichen',
    });
  });

  it('AC-010: with 50 dislikes adding is refused with "Höchstens 50 Abneigungen"', () => {
    const full = Array.from({ length: MAX_DISLIKES }, (_, index) => `Zutat ${index}`);
    expect(addDislike(full, 'Koriander')).toEqual({
      dislikes: full,
      error: 'Höchstens 50 Abneigungen',
    });
  });

  it('AC-011: only a changed draft asks "Änderungen verwerfen?"', () => {
    const stored = { ...NADJA };
    const unchanged: ProfileDraft = {
      name: 'Nadja',
      color: NADJA.color,
      dietPreference: 'flexible',
      dislikes: [],
    };
    expect(profileDraftChanged(stored, unchanged)).toBe(false);
    expect(profileDraftChanged(stored, { ...unchanged, name: ' Nadja ' })).toBe(false);
    expect(profileDraftChanged(stored, draft)).toBe(true);
    expect(profileDraftChanged(stored, { ...unchanged, dislikes: ['Koriander'] })).toBe(true);
  });

  it('AC-009: the member row reads "vegetarisch · mag nicht: Koriander"', () => {
    expect(
      memberProfileLine({ ...NADJA, dietPreference: 'vegetarian', dislikes: ['Koriander'] }),
    ).toBe('vegetarisch · mag nicht: Koriander');
    expect(memberProfileLine(NADJA)).toBe('isst alles');
    expect(memberProfileLine({ ...NADJA, dislikes: ['Koriander', 'Rosenkohl'] })).toBe(
      'isst alles · mag nicht: Koriander, Rosenkohl',
    );
  });
});

describe('Haushalt umbenennen (REQ-004)', () => {
  it('AC-015: empty or spaces is "Der Name fehlt."; unchanged closes without a call; trimmed', () => {
    expect(householdRename('Enrico & Nadja', '   ')).toEqual({
      action: 'invalid',
      error: 'Der Name fehlt.',
    });
    expect(householdRename('Enrico & Nadja', ' Enrico & Nadja ')).toEqual({ action: 'keep' });
    expect(householdRename('Enrico & Nadja', ' Kuschelnest ')).toEqual({
      action: 'save',
      name: 'Kuschelnest',
    });
    expect(householdRename('Enrico & Nadja', 'x'.repeat(81))).toEqual({
      action: 'invalid',
      error: 'Höchstens 80 Zeichen',
    });
  });
});

describe('Haushalt löschen (REQ-005)', () => {
  it('AC-017: only the last member may delete', () => {
    expect(canDeleteHousehold(1)).toBe(true);
    expect(canDeleteHousehold(2)).toBe(false);
  });

  it('AC-018: the question names the household, what goes and the open invitations', () => {
    expect(deleteHouseholdPrompt('WG Köln', ['tom@example.com'])).toEqual({
      title: '„WG Köln“ endgültig löschen?',
      message:
        'Alles aus „WG Köln“ wird gelöscht: Rezepte, Kalender, Einkaufsliste, Artikel und Märkte, Aufgaben, Reisen und Reisetaschen, Restaurants, Aktivitäten, Feedback und alle Fotos. Das lässt sich nicht rückgängig machen.',
      invitations: 'Die Einladung an tom@example.com verfällt.',
    });
    expect(deleteHouseholdPrompt('WG Köln', []).invitations).toBeUndefined();
    expect(deleteHouseholdPrompt('WG Köln', ['a@example.com', 'b@example.com']).invitations).toBe(
      'Die Einladungen an a@example.com und b@example.com verfallen.',
    );
  });

  it('AC-018: "Endgültig löschen" needs exactly the name; edges do not matter, case does', () => {
    expect(deleteConfirmMatches('WG Köln', ' WG Köln ')).toBe(true);
    expect(deleteConfirmMatches('WG Köln', 'wg köln')).toBe(false);
    expect(deleteConfirmMatches('WG Köln', 'WG Köl')).toBe(false);
    expect(deleteConfirmMatches('WG Köln', '')).toBe(false);
  });
});

describe('Feedback (REQ-006)', () => {
  const entry: FeedbackEntry = {
    id: 'f1',
    kind: 'idea',
    text: 'Einkaufsliste nach Markt sortieren',
    status: 'new',
    authorId: 'enrico',
    createdAt: '2026-11-20T10:00:00Z',
    votes: ['nadja'],
  };

  it('AC-027: the author gets "Bearbeiten" while new and "Löschen" always; others nothing', () => {
    expect(feedbackActions(entry, 'enrico')).toEqual(['edit', 'delete']);
    expect(feedbackActions({ ...entry, status: 'accepted' }, 'enrico')).toEqual(['delete']);
    expect(feedbackActions(entry, 'nadja')).toEqual([]);
  });

  it('AC-026: the question names the "+1" that goes with it', () => {
    const names = new Map([['nadja', 'Nadja']]);
    expect(feedbackDeletePrompt(entry, names)).toEqual({
      title: 'Feedback löschen?',
      message: 'Das „+1“ von Nadja geht mit.',
    });
    expect(feedbackDeletePrompt({ ...entry, votes: [] }, names)).toEqual({
      title: 'Feedback löschen?',
      message: undefined,
    });
    expect(
      feedbackDeletePrompt(
        { ...entry, votes: ['nadja', 'tom'] },
        new Map([
          ['nadja', 'Nadja'],
          ['tom', 'Tom'],
        ]),
      ).message,
    ).toBe('Die „+1“ von Nadja und Tom gehen mit.');
  });

  it('AC-028: the sentence about the status', () => {
    expect(FEEDBACK_STATUS_NOTE).toBe(
      'Den Status setzt der Entwickler der App, wenn er ein Feedback bearbeitet hat.',
    );
  });
});

describe('Jetzt abgleichen (REQ-010)', () => {
  const now = new Date('2026-11-22T16:04:00Z'); // 17:04 in Berlin
  const zone = 'Europe/Berlin';

  it('AC-039: the row and its screen-reader name; only "Jetzt abgleichen" is the link (review 0003, B-13)', () => {
    expect(
      syncRow({ lastSyncedAt: '2026-11-22T15:58:00Z', syncing: false, now, timeZone: zone }),
    ).toEqual({
      status: 'Zuletzt abgeglichen: heute, 16:58',
      action: 'Jetzt abgleichen',
      accessibilityLabel: 'Jetzt abgleichen, zuletzt abgeglichen heute, 16:58',
    });
    expect(
      syncRow({ lastSyncedAt: '2026-11-22T15:58:00Z', syncing: true, now, timeZone: zone }),
    ).toMatchObject({ status: 'Zuletzt abgeglichen: heute, 16:58', action: 'Wird abgeglichen …' });
  });

  it('AC-041: never synced is "Noch nicht abgeglichen · Jetzt abgleichen"; another day shows the date', () => {
    expect(syncRow({ lastSyncedAt: undefined, syncing: false, now, timeZone: zone })).toEqual({
      status: 'Noch nicht abgeglichen',
      action: 'Jetzt abgleichen',
      accessibilityLabel: 'Jetzt abgleichen, noch nicht abgeglichen',
    });
    expect(
      syncRow({ lastSyncedAt: '2026-11-20T08:30:00Z', syncing: false, now, timeZone: zone }).status,
    ).toBe('Zuletzt abgeglichen: 20.11., 9:30');
  });
});
