import { describe, expect, it } from 'vitest';

import { changedEntryFields, type EntryDraft } from './entry-changes';

// Spec 0021, REQ-009, Entscheidung 24: closing the entry window sends only what the person changed
// compared to what the window opened with, so a stale draft never overwrites newer server state.

const opened: EntryDraft = {
  text: 'Essen bei Oma',
  note: 'doppelte Menge',
  startsAt: '19:00',
  eaterIds: ['enrico', 'nadja'],
  guests: 1,
  portions: 3,
  variants: [
    { variantId: 'tofu', portions: 2 },
    { variantId: 'huhn', portions: 1 },
  ],
  reminderText: 'Tisch bestätigen',
};

describe('changedEntryFields (spec 0021, REQ-009)', () => {
  it('AC-049: nothing changed → no field, so closing writes nothing', () => {
    for (const kind of ['recipe', 'leftovers', 'text', 'restaurant', 'activity'] as const) {
      expect(changedEntryFields(kind, opened, { ...opened })).toEqual({});
    }
  });

  it('AC-049: one changed field → only that field, not eaters and portions', () => {
    expect(changedEntryFields('recipe', opened, { ...opened, note: 'mit Salat' })).toEqual({
      note: 'mit Salat',
    });
    expect(changedEntryFields('recipe', opened, { ...opened, guests: 2, portions: 4 })).toEqual({
      guests: 2,
      portions: 4,
    });
  });

  it('AC-049: a field changed back to its original is not sent', () => {
    expect(
      changedEntryFields('recipe', opened, {
        ...opened,
        // Nadja off and on again: the same people in another order.
        eaterIds: ['nadja', 'enrico'],
        // Typed and deleted again, with a trailing space left over.
        note: 'doppelte Menge ',
        // The same split, with an empty row of a third variant.
        variants: [
          { variantId: 'huhn', portions: 1 },
          { variantId: 'tofu', portions: 2 },
          { variantId: 'kind', portions: 0 },
        ],
      }),
    ).toEqual({});
  });

  it('AC-049: sends a changed split, changed people and a changed reminder text', () => {
    const draft: EntryDraft = {
      ...opened,
      eaterIds: ['enrico'],
      portions: 2,
      variants: [
        { variantId: 'tofu', portions: 1 },
        { variantId: 'huhn', portions: 1 },
      ],
      reminderText: 'Tisch für 4 bestätigen',
    };
    expect(changedEntryFields('recipe', opened, draft)).toEqual({
      eaterIds: ['enrico'],
      portions: 2,
      variants: draft.variants,
      reminderText: 'Tisch für 4 bestätigen',
    });
  });

  it('only the fields the kind of entry has', () => {
    const draft: EntryDraft = {
      text: 'Pizza',
      note: opened.note,
      startsAt: '20:00',
      eaterIds: ['enrico'],
      guests: 3,
      portions: 4,
      variants: [],
      reminderText: opened.reminderText,
    };
    // "Was gibt es?" only for a free text, the time only for restaurants and activities.
    expect(changedEntryFields('text', opened, draft)).toEqual({ text: 'Pizza' });
    expect(changedEntryFields('leftovers', opened, draft)).toEqual({});
    // An activity has people and guests, no portions (spec 0041, REQ-005).
    expect(changedEntryFields('activity', opened, draft)).toEqual({
      startsAt: '20:00',
      eaterIds: ['enrico'],
      guests: 3,
    });
    expect(changedEntryFields('restaurant', opened, draft)).toEqual({
      startsAt: '20:00',
      eaterIds: ['enrico'],
      guests: 3,
      portions: 4,
    });
  });

  it('a removed time is sent as null, an emptied Zusatz as empty', () => {
    expect(
      changedEntryFields('restaurant', opened, { ...opened, startsAt: undefined, note: '  ' }),
    ).toEqual({ startsAt: null, note: '  ' });
  });
});
