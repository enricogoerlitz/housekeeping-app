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

  it('AC-035: a synonym typed in full is an exact hit; since spec 0036 "neu anlegen" stays', () => {
    const result = matchSearchOrCreate('karotten', items);
    expect(result.exact?.name).toBe('Möhren');
    expect(result.canCreate).toBe(true);
    expect(result.similar).toBeUndefined();
    expect(result.matches.map((match) => match.item.name)).toEqual(['Möhren']);
  });

  describe('a name that is only a synonym of another article (spec 0036, REQ-005)', () => {
    const kochschinken = { id: 'kochschinken', name: 'Kochschinken', synonyms: ['Schinken'] };

    it('AC-010: "Schinken" finds Kochschinken via its synonym and offers "neu anlegen"', () => {
      const result = matchSearchOrCreate('Schinken', [kochschinken]);
      expect(result.matches[0]?.item.name).toBe('Kochschinken');
      expect(result.matches[0]?.matchedSynonym).toBe('Schinken');
      expect(result.canCreate).toBe(true);
    });

    it('AC-011: the article named "Schinken" comes first, before the synonym', () => {
      const long = { id: 'schinken', name: 'Schinken (vom Metzger)' };
      const exact = { id: 'schinken', name: 'Schinken' };
      expect(names('schinken', [kochschinken, exact])).toEqual(['Schinken', 'Kochschinken']);
      expect(matchSearchOrCreate('schinken', [kochschinken, exact]).exact?.name).toBe('Schinken');
      // By rank, not by length: a longer exact name still beats the synonym.
      const ranked = matchSearchOrCreate('schinken (vom metzger)', [
        { ...kochschinken, synonyms: ['Schinken (vom Metzger)'] },
        long,
      ]);
      expect(ranked.matches.map((match) => match.item.name)).toEqual([
        'Schinken (vom Metzger)',
        'Kochschinken',
      ]);
    });

    it('AC-012: when the article "Schinken" exists there is no "neu anlegen"', () => {
      const result = matchSearchOrCreate('schinken', [kochschinken, { id: 's', name: 'Schinken' }]);
      expect(result.canCreate).toBe(false);
    });
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

  describe('spec 0025, REQ-009: words in any order, word parts', () => {
    const catalog: SearchOrCreateItem[] = [
      { id: 'kokosmilch', name: 'Kokosmilch' },
      { id: 'passierte', name: 'Passierte Tomaten' },
      { id: 'bio-eier', name: 'Bio-Eier' },
      { id: 'apfelsaft', name: 'Apfelsaft' },
      { id: 'kokosbrot', name: 'Kokosbrot' },
      { id: 'eisbein', name: 'Eisbein' },
    ];

    it('AC-032: "Milchko", "tomaten passiert", "bio ei" and "Saftapfel" find their article', () => {
      expect(names('Milchko', catalog)[0]).toBe('Kokosmilch');
      expect(names('tomaten passiert', catalog)[0]).toBe('Passierte Tomaten');
      expect(names('bio ei', catalog)[0]).toBe('Bio-Eier');
      expect(names('Saftapfel', catalog)[0]).toBe('Apfelsaft');
    });

    it('AC-032: all words in any order rank like a part of the name, before word parts', () => {
      const result = matchSearchOrCreate('tomaten passiert', catalog);
      expect(result.matches[0]?.wordPart).toBe(false);
    });

    it('AC-033: "Brotko" does not find Kokosbrot, "ei bio" not Eisbein', () => {
      expect(names('Brotko', catalog)).not.toContain('Kokosbrot');
      expect(names('ei bio', catalog)).not.toContain('Eisbein');
    });

    it('AC-033: "Milchko" does not brake with "Meinst du Kokosmilch?"', () => {
      expect(matchSearchOrCreate('Milchko', catalog).similar).toBeUndefined();
    });
  });
});
