import { describe, expect, it } from 'vitest';

import { matchSearchOrCreate, type SearchOrCreateItem } from './search-or-create';

// The showroom catalogue of spec 0005, AC-032 to AC-035.
const items: SearchOrCreateItem[] = [
  { id: 'moehren', name: 'Möhren', synonyms: ['Karotten'] },
  { id: 'kokosmilch', name: 'Kokosmilch' },
  { id: 'kokosmilch-light', name: 'Kokosmilch light' },
  { id: 'brot', name: 'Brot' },
  { id: 'tomaten', name: 'Tomaten' },
];

const names = (query: string, list = items): string[] =>
  matchSearchOrCreate(query, list).matches.map((match) => match.item.name);

describe('matchSearchOrCreate', () => {
  it('AC-032: "Karot" finds Möhren through its synonym Karotten', () => {
    const result = matchSearchOrCreate('Karot', items);
    expect(result.matches[0]?.item.name).toBe('Möhren');
    expect(result.matches[0]?.matchedSynonym).toBe('Karotten');
  });

  it('AC-032: "Kokos" finds both coconut milks, shorter name first', () => {
    expect(names('Kokos')).toEqual(['Kokosmilch', 'Kokosmilch light']);
  });

  it('AC-033: an unknown name offers "neu anlegen" without a brake', () => {
    const result = matchSearchOrCreate('Drachenfrucht', items);
    expect(result.matches).toEqual([]);
    expect(result.canCreate).toBe(true);
    expect(result.similar).toBeUndefined();
  });

  it('AC-034: one typo away brakes with the existing name', () => {
    const result = matchSearchOrCreate('Kokosmilsch', items);
    expect(result.canCreate).toBe(true);
    expect(result.similar?.name).toBe('Kokosmilch');
  });

  it('AC-034 (Nachtrag): swapped word parts ("Milchko") find Kokosmilch, last, without a brake', () => {
    const result = matchSearchOrCreate('Milchko', items);
    expect(result.matches.map((match) => match.item.name)).toEqual([
      'Kokosmilch',
      'Kokosmilch light',
    ]);
    expect(result.matches.every((match) => match.wordPart)).toBe(true);
    expect(result.canCreate).toBe(true);
    expect(result.similar).toBeUndefined();
  });

  it('AC-034 (Nachtrag): a word part of a synonym never brakes ("Drachenfrucht")', () => {
    const list: SearchOrCreateItem[] = [
      { id: 'marmelade', name: 'Marmelade', synonyms: ['Konfitüre', 'Fruchtaufstrich'] },
    ];
    const result = matchSearchOrCreate('Drachenfrucht', list);
    expect(result.matches.map((match) => [match.item.name, match.wordPart])).toEqual([
      ['Marmelade', true],
    ]);
    expect(result.canCreate).toBe(true);
    expect(result.similar).toBeUndefined();
  });

  it('AC-034 (Nachtrag): a look-alike word is no typo ("Fleischkäse" is not "Frischkäse")', () => {
    const list: SearchOrCreateItem[] = [{ id: 'frischkaese', name: 'Frischkäse' }];
    expect(matchSearchOrCreate('Fleischkäse', list).similar).toBeUndefined();
  });

  it('AC-034: typing only the start of a name ("Kokos") does not brake', () => {
    const result = matchSearchOrCreate('Kokos', items);
    expect(result.canCreate).toBe(true);
    expect(result.similar).toBeUndefined();
  });

  it('AC-035: a synonym typed in full is an exact hit: no "neu anlegen"', () => {
    const result = matchSearchOrCreate('karotten', items);
    expect(result.exact?.name).toBe('Möhren');
    expect(result.canCreate).toBe(false);
    expect(result.matches.map((match) => match.item.name)).toEqual(['Möhren']);
  });

  it('AC-035: an empty or blank query has neither hits nor "neu anlegen"', () => {
    for (const query of ['', '   ']) {
      const result = matchSearchOrCreate(query, items);
      expect(result.matches).toEqual([]);
      expect(result.canCreate).toBe(false);
    }
  });

  it('brakes for the singular of an existing plural ("Tomate" → Tomaten)', () => {
    expect(matchSearchOrCreate('Tomate', items).similar?.name).toBe('Tomaten');
  });

  it('word parts need at least 5 letters: "Brotzeit" does not find Brot', () => {
    expect(names('Brotzeit')).toEqual([]);
    expect(matchSearchOrCreate('Brotzeit', items).similar).toBeUndefined();
  });

  it('ranks prefix and typo hits before word-part hits', () => {
    const list: SearchOrCreateItem[] = [
      { id: 'a', name: 'Kokosmilch' },
      { id: 'b', name: 'Milchkaffee' },
    ];
    const prefix = matchSearchOrCreate('milchka', list);
    expect(prefix.matches.map((match) => [match.item.name, match.wordPart])).toEqual([
      ['Milchkaffee', false],
      ['Kokosmilch', true],
    ]);
    // "milchko" is one typo away from the start of Milchkaffee.
    expect(names('milchko', list)).toEqual(['Milchkaffee', 'Kokosmilch']);
  });

  it('typing the start of an existing name never brakes, even with word-part hits', () => {
    const list: SearchOrCreateItem[] = [
      { id: 'a', name: 'Kokosmilch' },
      { id: 'b', name: 'Milchkaffee' },
    ];
    expect(matchSearchOrCreate('milchka', list).similar).toBeUndefined();
  });

  it('ranks the word-part hit sharing the longest piece first, still without a brake', () => {
    const list: SearchOrCreateItem[] = [
      { id: 'a', name: 'Kokosmilch' },
      { id: 'b', name: 'Milchkaffee' },
    ];
    // "milchkakao": "milch" is in Kokosmilch, "milchka" in Milchkaffee.
    const result = matchSearchOrCreate('milchkakao', list);
    expect(result.matches.map((match) => match.item.name)).toEqual(['Milchkaffee', 'Kokosmilch']);
    expect(result.similar).toBeUndefined();
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: `${index}`,
      name: `Tee ${index}`,
    }));
    expect(matchSearchOrCreate('tee', many).matches).toHaveLength(8);
    expect(matchSearchOrCreate('tee', many, { limit: 3 }).matches).toHaveLength(3);
  });
});
