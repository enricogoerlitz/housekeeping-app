import { describe, expect, it } from 'vitest';

import {
  applyFieldChanges,
  applyRowChanges,
  diffFieldChanges,
  diffRowChanges,
  proposalSummary,
  proposalSummaryText,
  type ChangeProposal,
} from './proposal-diff';

// Spec 0049, REQ-005: the Änderungsansicht as plain data. A change is active until the person
// takes it back (↺, "↺ behalten", ×); "Speichern" applies what is still active.

const none = new Set<string>();

describe('diffFieldChanges', () => {
  const labels = { name: 'Name', website: 'Webseite', cuisine: 'Küche' };

  it('AC-021: an empty field that gets a value is "neu", another value "geändert"', () => {
    const fields = diffFieldChanges(
      labels,
      { name: 'Madame Hien', website: '', cuisine: 'Asiatisch' },
      { name: 'Madame Hien', website: 'https://madamehienberlin.de/', cuisine: 'Vietnamesisch' },
    );
    expect(fields).toEqual([
      {
        id: 'website',
        label: 'Webseite',
        before: '',
        after: 'https://madamehienberlin.de/',
        status: 'new',
      },
      {
        id: 'cuisine',
        label: 'Küche',
        before: 'Asiatisch',
        after: 'Vietnamesisch',
        status: 'changed',
      },
    ]);
  });

  it('a proposal without a value never clears a field; whitespace is no change', () => {
    expect(
      diffFieldChanges(
        labels,
        { name: 'A', website: 'https://a.de', cuisine: 'X' },
        { name: ' A ' },
      ),
    ).toEqual([]);
  });

  it('AC-017: ↺ keeps the old value, the rest is applied', () => {
    const before = { name: 'A', website: '', cuisine: 'X' };
    const fields = diffFieldChanges(labels, before, { website: 'https://a.de', cuisine: 'Y' });
    expect(applyFieldChanges(before, fields, new Set(['cuisine']))).toEqual({
      name: 'A',
      website: 'https://a.de',
      cuisine: 'X',
    });
  });
});

describe('diffRowChanges', () => {
  const key = (row: { name: string; amount: string }) => row.name;
  const label = (row: { name: string; amount: string }) => `${row.amount} ${row.name}`.trim();
  const same = (a: { amount: string }, b: { amount: string }) => a.amount === b.amount;
  const moehre = { name: 'Möhre', amount: '1' };
  const hack = { name: 'Hackfleisch', amount: '500 g' };
  const sellerie = { name: 'Sellerie', amount: '1 Stange' };

  it('AC-016: rows only before are "entfernt", only after "neu", other amounts "geändert"', () => {
    const rows = diffRowChanges(
      'ingredients',
      [moehre, hack],
      [{ ...hack, amount: '400 g' }, sellerie],
      {
        key,
        label,
        same,
      },
    );
    expect(rows.map((row) => [row.status, row.label, row.beforeLabel])).toEqual([
      ['removed', '1 Möhre', undefined],
      ['changed', '400 g Hackfleisch', '500 g Hackfleisch'],
      ['new', '1 Stange Sellerie', undefined],
    ]);
  });

  it('keeps the proposed order and puts removed rows where they stood', () => {
    const a = { name: 'A', amount: '' };
    const b = { name: 'B', amount: '' };
    const c = { name: 'C', amount: '' };
    const x = { name: 'X', amount: '' };
    const rows = diffRowChanges('steps', [a, b, c], [x, b, c], { key, label, same });
    expect(rows.map((row) => `${row.status}:${row.label}`)).toEqual([
      'removed:A',
      'new:X',
      'same:B',
      'same:C',
    ]);
    expect(applyRowChanges(rows, none)).toEqual([x, b, c]);
  });

  it('matches a name twice only twice ("Ergänzen" adds a second "Möhre")', () => {
    const rows = diffRowChanges('ingredients', [moehre], [moehre, moehre], { key, label, same });
    expect(rows.map((row) => row.status)).toEqual(['same', 'new']);
  });

  it('AC-017, AC-018: "↺ behalten" keeps a removed row, × drops a new one, ↺ the old amount', () => {
    const rows = diffRowChanges(
      'ingredients',
      [moehre, hack],
      [{ ...hack, amount: '400 g' }, sellerie],
      {
        key,
        label,
        same,
      },
    );
    const id = (name: string) => rows.find((row) => row.label.endsWith(name))?.id ?? '';
    expect(applyRowChanges(rows, none)).toEqual([{ ...hack, amount: '400 g' }, sellerie]);
    expect(
      applyRowChanges(rows, new Set([id('Möhre'), id('Sellerie'), id('Hackfleisch')])),
    ).toEqual([moehre, hack]);
  });

  it('a changed row can keep what only the old one has (merge)', () => {
    const old = { name: 'Hackfleisch', amount: '500 g', id: 'i-1' };
    const rows = diffRowChanges(
      'ingredients',
      [old],
      [{ name: 'Hackfleisch', amount: '400 g', id: '' }],
      {
        key,
        label,
        same,
      },
    );
    expect(applyRowChanges(rows, none, (before, after) => ({ ...after, id: before.id }))).toEqual([
      { name: 'Hackfleisch', amount: '400 g', id: 'i-1' },
    ]);
  });
});

describe('proposalSummary', () => {
  const proposal: ChangeProposal = {
    fields: diffFieldChanges(
      { servings: 'Portionen', title: 'Titel' },
      { servings: '4', title: 'Bolognese' },
      { servings: '2', title: 'Bolognese' },
    ),
    groups: [
      {
        id: 'ingredients',
        label: 'Zutaten',
        rows: diffRowChanges(
          'ingredients',
          [{ name: 'Möhre' }, { name: 'Hack' }],
          [{ name: 'Hack' }, { name: 'Sellerie' }],
          { key: (row) => row.name, label: (row) => row.name },
        ),
      },
    ],
  };

  it('AC-016: "Vorschlag: 1 neu · 1 geändert · 1 entfernt"', () => {
    const summary = proposalSummary(proposal, none);
    expect(summary).toEqual({ added: 1, changed: 1, removed: 1 });
    expect(proposalSummaryText(summary)).toBe('Vorschlag: 1 neu · 1 geändert · 1 entfernt');
  });

  it('AC-017: what was taken back no longer counts; nothing left reads so', () => {
    const ids = [
      ...proposal.fields.map((field) => field.id),
      ...(proposal.groups[0]?.rows ?? []).map((row) => row.id),
    ];
    expect(proposalSummaryText(proposalSummary(proposal, new Set(ids.slice(0, 1))))).toBe(
      'Vorschlag: 1 neu · 1 entfernt',
    );
    expect(proposalSummaryText(proposalSummary(proposal, new Set(ids)))).toBe(
      'Vorschlag: keine Änderung mehr',
    );
  });
});
