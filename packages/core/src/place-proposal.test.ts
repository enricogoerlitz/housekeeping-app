import { describe, expect, it } from 'vitest';

import type { WebResult } from './ai-contract';
import { placeProposal, placeValuesFromResult } from './place-proposal';
import { proposalSummaryText, proposalSummary } from './proposal-diff';

// Spec 0049: a place found on the web as values of the restaurant or activity form, and the
// Änderungsansicht of an existing one (REQ-004, REQ-005).

const madameHien: WebResult = {
  url: 'https://maps.google.com/?cid=1',
  title: 'Madame Hien',
  source: 'Google Maps',
  address: 'Torstraße 59, 10119 Berlin, Deutschland',
  category: 'Vietnamesisches Restaurant',
  websiteUrl: 'https://madamehienberlin.de/',
  mapsUrl: 'https://maps.google.com/?cid=1',
  location: { lat: 52.529, lng: 13.409 },
  priceLevel: 2,
};

describe('placeValuesFromResult (REQ-004)', () => {
  it('AC-015: name, address, cuisine, price, website and maps link of a restaurant', () => {
    expect(placeValuesFromResult('restaurant', madameHien, { cuisine: 'Vietnamesisch' })).toEqual({
      name: 'Madame Hien',
      address: 'Torstraße 59, 10119 Berlin, Deutschland',
      cuisine: 'Vietnamesisch',
      priceLevel: '2',
      websiteUrl: 'https://madamehienberlin.de/',
      mapsUrl: 'https://maps.google.com/?cid=1',
    });
  });

  it('an activity takes the kind and description of the preview; the place name is the title', () => {
    expect(
      placeValuesFromResult(
        'activity',
        { ...madameHien, title: 'Magic Mountain', category: 'Kletterhalle' },
        { kind: 'Klettern', description: 'Große Kletterhalle im Wedding.' },
      ),
    ).toEqual({
      name: 'Magic Mountain',
      placeName: 'Magic Mountain',
      address: 'Torstraße 59, 10119 Berlin, Deutschland',
      kind: 'Klettern',
      description: 'Große Kletterhalle im Wedding.',
      websiteUrl: 'https://madamehienberlin.de/',
      mapsUrl: 'https://maps.google.com/?cid=1',
    });
  });
});

describe('placeProposal (REQ-005)', () => {
  it('AC-021: a restaurant without website gets "Webseite" as "neu", the price reads as €€', () => {
    const proposal = placeProposal(
      'restaurant',
      { name: 'Madame Hien', address: 'Torstraße 59, 10119 Berlin, Deutschland', priceLevel: '1' },
      placeValuesFromResult('restaurant', madameHien, { cuisine: 'Vietnamesisch' }),
    );
    expect(proposal.fields.map((field) => [field.label, field.status])).toEqual([
      ['Küche', 'new'],
      ['Preis', 'changed'],
      ['Webseite', 'new'],
      ['Karten-Link', 'new'],
    ]);
    expect(proposal.fields[1]).toMatchObject({ beforeLabel: '€', afterLabel: '€€' });
    expect(proposalSummaryText(proposalSummary(proposal, new Set()))).toBe(
      'Vorschlag: 3 neu · 1 geändert',
    );
  });
});
