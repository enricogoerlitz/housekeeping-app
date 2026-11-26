import { describe, expect, it } from 'vitest';

import { shareLink } from './share-link';

const APP = 'https://house.example.de';

describe('shareLink (spec 0047, REQ-001)', () => {
  it('AC-001: a recipe shares only the address of its page in the app', () => {
    expect(shareLink(APP, { kind: 'recipe', id: 'r1' })).toBe(`${APP}/rezept/r1`);
  });

  it('AC-002: a collection, a restaurant and an activity share the address of their page', () => {
    expect(shareLink(APP, { kind: 'recipe', id: 'grillabend' })).toBe(`${APP}/rezept/grillabend`);
    expect(shareLink(APP, { kind: 'restaurant', id: 'x1' })).toBe(`${APP}/restaurant/x1`);
    expect(shareLink(APP, { kind: 'activity', id: 'a1' })).toBe(`${APP}/aktivitaet/a1`);
  });

  it('AC-002: a trailing slash of the origin and odd characters of the id stay harmless', () => {
    expect(shareLink(`${APP}/`, { kind: 'recipe', id: 'a b/c' })).toBe(`${APP}/rezept/a%20b%2Fc`);
  });

  it('AC-004: without the address of the app there is no link', () => {
    expect(shareLink(undefined, { kind: 'recipe', id: 'r1' })).toBeUndefined();
    expect(shareLink('', { kind: 'restaurant', id: 'x1' })).toBeUndefined();
  });
});
