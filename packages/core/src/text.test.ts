import { describe, expect, it } from 'vitest';

import { editDistance, fuzzyIncludes, normalizeText, similarity } from './text';

describe('normalizeText', () => {
  it('lower-cases, trims, collapses whitespace and folds umlauts', () => {
    expect(normalizeText('  Möhren ')).toBe('moehren');
    expect(normalizeText('Grüner   Tee')).toBe('gruener tee');
    expect(normalizeText('Weißkohl')).toBe('weisskohl');
    expect(normalizeText('Crème fraîche')).toBe('creme fraiche');
  });

  it('folds an umlaut written as letter plus combining mark like a composed one', () => {
    expect(normalizeText('Möhren')).toBe('moehren');
  });
});

describe('editDistance and similarity', () => {
  it('counts insertions, deletions, substitutions and neighbour swaps as one edit each', () => {
    expect(editDistance('halumi', 'halloumi')).toBe(2);
    expect(editDistance('tofu', 'tfou')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('reis', 'reis')).toBe(0);
  });

  it('is 1 for equal strings and decreases with the edits', () => {
    expect(similarity('', '')).toBe(1);
    expect(similarity('milch', 'milch')).toBe(1);
    expect(similarity('milhc', 'milch')).toBeCloseTo(0.8);
  });
});

describe('fuzzyIncludes', () => {
  it('AC-019: tolerates typos ("halumi" finds Halloumi, "karoten" finds Karotten)', () => {
    expect(fuzzyIncludes('halumi', 'Halloumi-Pfanne')).toBe(true);
    expect(fuzzyIncludes('karoten', 'Karotten')).toBe(true);
  });

  it('matches substrings and is case and umlaut insensitive', () => {
    expect(fuzzyIncludes('curry', 'Mango-Curry')).toBe(true);
    expect(fuzzyIncludes('MOEHREN', 'Möhren')).toBe(true);
  });

  it('matches everything for an empty query', () => {
    expect(fuzzyIncludes('', 'Lasagne')).toBe(true);
  });

  it('matches queries under three characters only as prefix of the target or a word', () => {
    expect(fuzzyIncludes('cu', 'Mango-Curry')).toBe(true);
    expect(fuzzyIncludes('ur', 'Mango-Curry')).toBe(false);
  });

  it('does not take look-alike words for typos', () => {
    expect(fuzzyIncludes('reis', 'Eis')).toBe(false);
    expect(fuzzyIncludes('butter', 'Mutter')).toBe(false);
    expect(fuzzyIncludes('brot', 'Brokkoli')).toBe(false);
  });

  it('allows no typo below four characters and two edits from seven characters on', () => {
    expect(fuzzyIncludes('tfu', 'Tofu')).toBe(false);
    expect(fuzzyIncludes('spageti', 'Spaghetti')).toBe(true);
    expect(fuzzyIncludes('spgeti', 'Spaghetti')).toBe(false);
  });
});
