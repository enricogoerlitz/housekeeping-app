import { describe, expect, it } from 'vitest';

import {
  AMOUNT_NOT_RECOGNIZED,
  buyableQty,
  formatAmount,
  formatQty,
  parseAmount,
  parseIngredientBlock,
  parseIngredientLine,
  parseItemAmount,
  parseSmartInput,
  scaleAmount,
} from './amounts';

describe('parseSmartInput', () => {
  it('AC-028: reads count and note from "2 Käse (Gouda oder Emmentaler)"', () => {
    expect(parseSmartInput('2 Käse (Gouda oder Emmentaler)')).toEqual({
      name: 'Käse',
      count: 2,
      note: 'Gouda oder Emmentaler',
    });
  });

  it('AC-029: empty or blank input yields null', () => {
    expect(parseSmartInput('')).toBeNull();
    expect(parseSmartInput('   \t ')).toBeNull();
  });

  it('AC-029: a bare name has neither amount nor note', () => {
    expect(parseSmartInput('  Milch ')).toEqual({ name: 'Milch' });
  });

  it('reads a measured quantity with unit', () => {
    expect(parseSmartInput('500 g Möhren')).toEqual({ name: 'Möhren', qty: 500, unit: 'g' });
    expect(parseSmartInput('500g Möhren')).toEqual({ name: 'Möhren', qty: 500, unit: 'g' });
  });

  it('keeps a decimal comma in the amount instead of starting a note', () => {
    expect(parseSmartInput('1,5 kg Kartoffeln')).toEqual({
      name: 'Kartoffeln',
      qty: 1.5,
      unit: 'kg',
    });
  });

  it('takes text after a comma as note', () => {
    expect(parseSmartInput('Käse, laktosefrei')).toEqual({ name: 'Käse', note: 'laktosefrei' });
  });

  it('joins a note in parentheses and one after a comma', () => {
    expect(parseSmartInput('Käse (Gouda), am Stück')).toEqual({
      name: 'Käse',
      note: 'Gouda, am Stück',
    });
  });

  it.each(['2x Käse', '2× Käse', '2 x Käse', 'Käse 2x', 'Käse 2×'])(
    'reads the multiplier in "%s" as count 2',
    (text) => {
      expect(parseSmartInput(text)).toEqual({ name: 'Käse', count: 2 });
    },
  );

  it('keeps a number glued to a name as part of the name', () => {
    expect(parseSmartInput('5-Korn-Brot')).toEqual({ name: '5-Korn-Brot' });
  });

  it('treats a unit word without a name after it as the name ("2 Glas" = two glasses)', () => {
    expect(parseSmartInput('2 Glas')).toEqual({ name: 'Glas', count: 2 });
  });

  it('takes input without a name next to amount or note as the name as typed', () => {
    expect(parseSmartInput('2')).toEqual({ name: '2' });
    expect(parseSmartInput('(Gouda)')).toEqual({ name: '(Gouda)' });
  });

  it('AC-028: reads German number words as a count ("sechs Eier" = 6 × Eier)', () => {
    expect(parseSmartInput('sechs Eier')).toEqual({ name: 'Eier', count: 6 });
    expect(parseSmartInput('Zwölf Brötchen')).toEqual({ name: 'Brötchen', count: 12 });
    expect(parseSmartInput('zwanzig Servietten')).toEqual({ name: 'Servietten', count: 20 });
    expect(parseSmartInput('dreißig Teelichter')).toEqual({ name: 'Teelichter', count: 30 });
  });

  it.each(['ein Brot', 'eine Brot', 'einen Brot'])('reads "%s" as one piece', (text) => {
    expect(parseSmartInput(text)).toEqual({ name: 'Brot', count: 1 });
  });

  it('reads "ein halbes" as one half and a number word before a unit as a quantity', () => {
    expect(parseSmartInput('ein halbes Brot')).toEqual({ name: 'Brot', count: 0.5 });
    expect(parseSmartInput('zwei Dosen Mais')).toEqual({ name: 'Mais', qty: 2, unit: 'Dose' });
  });

  it('leaves number words alone when nothing follows or they mean "a few"', () => {
    expect(parseSmartInput('Sechs')).toEqual({ name: 'Sechs' });
    expect(parseSmartInput('ein paar Äpfel')).toEqual({ name: 'ein paar Äpfel' });
    expect(parseSmartInput('Einhorn-Kekse')).toEqual({ name: 'Einhorn-Kekse' });
  });
});

describe('parseIngredientLine', () => {
  it('AC-022: "200 ml Kokosmilch" has amount 200 ml', () => {
    expect(parseIngredientLine('200 ml Kokosmilch')).toEqual({
      name: 'Kokosmilch',
      amount: { text: '200 ml', qty: 200, unit: 'ml' },
    });
  });

  it('AC-022: "1 Mango" has an amount without unit', () => {
    expect(parseIngredientLine('1 Mango')).toEqual({
      name: 'Mango',
      amount: { text: '1', qty: 1 },
    });
  });

  it('AC-022: "1 Prise Salz" has the unit Prise', () => {
    expect(parseIngredientLine('1 Prise Salz')).toEqual({
      name: 'Salz',
      amount: { text: '1 Prise', qty: 1, unit: 'Prise' },
    });
  });

  it('reads fractions and mixed numbers', () => {
    expect(parseIngredientLine('½ Bund Koriander')?.amount).toEqual({
      text: '½ Bund',
      qty: 0.5,
      unit: 'Bund',
    });
    expect(parseIngredientLine('1 ½ l Milch')?.amount?.qty).toBe(1.5);
    expect(parseIngredientLine('1 1/2 l Milch')?.amount?.qty).toBe(1.5);
    expect(parseIngredientLine('3/4 l Milch')?.amount?.qty).toBe(0.75);
  });

  it('uses the upper bound of a range', () => {
    expect(parseIngredientLine('2–3 EL Öl')).toEqual({
      name: 'Öl',
      amount: { text: '2–3 EL', qty: 3, unit: 'EL' },
    });
    expect(parseIngredientLine('2 bis 3 EL Öl')?.amount?.qty).toBe(3);
  });

  it('stores plural spellings as the singular unit and keeps the written text', () => {
    expect(parseIngredientLine('2 Dosen Mais')).toEqual({
      name: 'Mais',
      amount: { text: '2 Dosen', qty: 2, unit: 'Dose' },
    });
  });

  it('AC-023: reads el and tl as EL and TL (spec 0023, REQ-007)', () => {
    expect(parseIngredientLine('2 el Öl')).toEqual({
      name: 'Öl',
      amount: { text: '2 el', qty: 2, unit: 'EL' },
    });
  });

  it('returns a name without amount for "Salz" and null for a blank line', () => {
    expect(parseIngredientLine('Salz')).toEqual({ name: 'Salz' });
    expect(parseIngredientLine('   ')).toBeNull();
  });

  it('rejects a fraction with zero denominator as amount', () => {
    expect(parseIngredientLine('1/0 Mango')).toEqual({ name: '1/0 Mango' });
  });
});

describe('parseIngredientBlock', () => {
  it('AC-022: a pasted block becomes three ingredient lines', () => {
    const lines = parseIngredientBlock('200 ml Kokosmilch\n1 Mango\n1 Prise Salz');
    expect(lines.map((line) => [line.amount?.text, line.name])).toEqual([
      ['200 ml', 'Kokosmilch'],
      ['1', 'Mango'],
      ['1 Prise', 'Salz'],
    ]);
  });

  it('ignores empty lines, bullets and Windows line endings', () => {
    const lines = parseIngredientBlock('- 200 ml Kokosmilch\r\n\r\n• 1 Mango\n  * Salz\n');
    expect(lines.map((line) => line.name)).toEqual(['Kokosmilch', 'Mango', 'Salz']);
  });
});

describe('formatQty and formatAmount', () => {
  it('formats with a German decimal comma and at most two decimals', () => {
    expect(formatQty(1.5)).toBe('1,5');
    expect(formatQty(600)).toBe('600');
    expect(formatQty(0.333)).toBe('0,33');
    expect(formatQty(1.005)).toBe('1,01');
  });

  it('uses the plural unit for quantities other than one', () => {
    expect(formatAmount(2, 'Dose')).toBe('2 Dosen');
    expect(formatAmount(1, 'Dose')).toBe('1 Dose');
    expect(formatAmount(2, 'Bund')).toBe('2 Bund');
    expect(formatAmount(1.5, 'kg')).toBe('1,5 kg');
    expect(formatAmount(3)).toBe('3');
    expect(formatAmount(3, '')).toBe('3');
  });
});

describe('scaleAmount', () => {
  it('AC-020: scales 400 ml to 600 ml for 6 instead of 4 portions', () => {
    expect(scaleAmount({ text: '400 ml', qty: 400, unit: 'ml' }, 6 / 4)).toEqual({
      text: '600 ml',
      qty: 600,
      unit: 'ml',
    });
  });

  it('leaves Prise, Msp., Handvoll and amounts without number unchanged', () => {
    const pinch = { text: '1 Prise', qty: 1, unit: 'Prise' };
    expect(scaleAmount(pinch, 3)).toBe(pinch);
    const handful = { text: '1 Handvoll', qty: 1, unit: 'Handvoll' };
    expect(scaleAmount(handful, 2)).toBe(handful);
    const some = { text: 'etwas' };
    expect(scaleAmount(some, 2)).toBe(some);
  });

  it('rounds countable units and plain numbers to quarters', () => {
    expect(scaleAmount({ text: '1 Dose', qty: 1, unit: 'Dose' }, 1.37)).toEqual({
      text: '1,25 Dosen',
      qty: 1.25,
      unit: 'Dose',
    });
    expect(scaleAmount({ text: '1', qty: 1 }, 1.6).qty).toBe(1.5);
  });

  it('keeps two decimals when quarter rounding would give zero', () => {
    expect(scaleAmount({ text: '1', qty: 1 }, 0.1).qty).toBe(0.1);
  });

  it('rounds measured units to two decimals', () => {
    expect(scaleAmount({ text: '250 g', qty: 250, unit: 'g' }, 1 / 3).qty).toBe(83.33);
  });
});

describe('parseAmount', () => {
  it('AC-001: the amount of "+ Zutat" ("400 ml") with quantity and unit', () => {
    expect(parseAmount('400 ml')).toEqual({ text: '400 ml', qty: 400, unit: 'ml' });
    expect(parseAmount(' 400  ml ')).toEqual({ text: '400 ml', qty: 400, unit: 'ml' });
    expect(parseAmount('400ml')).toEqual({ text: '400ml', qty: 400, unit: 'ml' });
  });

  it('reads counts, plural units, ranges and fractions like an ingredient line', () => {
    expect(parseAmount('2')).toEqual({ text: '2', qty: 2 });
    expect(parseAmount('1 Prise')).toEqual({ text: '1 Prise', qty: 1, unit: 'Prise' });
    expect(parseAmount('2 Dosen')).toEqual({ text: '2 Dosen', qty: 2, unit: 'Dose' });
    expect(parseAmount('2–3 EL')).toEqual({ text: '2–3 EL', qty: 3, unit: 'EL' });
    expect(parseAmount('½ Bund')).toEqual({ text: '½ Bund', qty: 0.5, unit: 'Bund' });
  });

  it('keeps free text as written, without a quantity, so it never scales', () => {
    expect(parseAmount('etwas')).toEqual({ text: 'etwas' });
    expect(parseAmount('2 frische')).toEqual({ text: '2 frische' });
  });

  it('Spec 0009 AC-014: "1 Sack" and "1 Kasten" are count-like units', () => {
    expect(parseAmount('1 Sack')).toEqual({ text: '1 Sack', qty: 1, unit: 'Sack' });
    expect(parseAmount('2 Säcke')).toEqual({ text: '2 Säcke', qty: 2, unit: 'Sack' });
    expect(parseAmount('1 Kasten')).toEqual({ text: '1 Kasten', qty: 1, unit: 'Kasten' });
    expect(parseAmount('2 Kästen')).toEqual({ text: '2 Kästen', qty: 2, unit: 'Kasten' });
    expect(parseIngredientLine('1 Sack Grillkohle')).toEqual({
      name: 'Grillkohle',
      amount: { text: '1 Sack', qty: 1, unit: 'Sack' },
    });
    expect(parseIngredientLine('1 Kasten Bier')).toEqual({
      name: 'Bier',
      amount: { text: '1 Kasten', qty: 1, unit: 'Kasten' },
    });
    // Measure nouns: "2 Sack", "2 Kasten", like "2 Bund"; scaled like other countable units.
    expect(formatAmount(2, 'Sack')).toBe('2 Sack');
    expect(scaleAmount({ text: '1 Kasten', qty: 1, unit: 'Kasten' }, 1.37).qty).toBe(1.25);
  });

  it('blank is no amount', () => {
    expect(parseAmount('')).toBeUndefined();
    expect(parseAmount('   ')).toBeUndefined();
  });
});

describe('buyableQty', () => {
  it('Spec 0009 REQ-005: count-like units round up to whole pieces ("0,75 Glas" → "1 Glas")', () => {
    expect(buyableQty(0.75, 'Glas')).toBe(1);
    expect(buyableQty(1.25, 'Dose')).toBe(2);
    expect(buyableQty(0.5, 'Bund')).toBe(1);
    for (const unit of [
      'Becher',
      'Packung',
      'Stück',
      'Sack',
      'Kasten',
      'Zehe',
      'Scheibe',
      'Stange',
    ]) {
      expect(buyableQty(1.1, unit)).toBe(2);
    }
    expect(buyableQty(2, 'Dose')).toBe(2);
  });

  it('AC-030: g and ml round up in steps of 10, 50 and 100 ("57 g" → 60 g, "438 g" → 450 g)', () => {
    expect(buyableQty(57, 'g')).toBe(60);
    expect(buyableQty(112.5, 'g')).toBe(120);
    expect(buyableQty(438, 'g')).toBe(450);
    expect(buyableQty(1125, 'g')).toBe(1200);
    expect(buyableQty(83.33, 'ml')).toBe(90);
    expect(buyableQty(250, 'ml')).toBe(250);
    expect(buyableQty(251, 'ml')).toBe(300);
    expect(buyableQty(600, 'ml')).toBe(600);
  });

  it('AC-030: kg and l round up to one decimal', () => {
    expect(buyableQty(1.125, 'kg')).toBe(1.2);
    expect(buyableQty(1.5, 'kg')).toBe(1.5);
    expect(buyableQty(0.33, 'l')).toBe(0.4);
  });

  it('does not round up for floating point noise', () => {
    // 0.1 × 3 is 0.30000000000000004 in floating point.
    expect(buyableQty(0.1 * 3, 'kg')).toBe(0.3);
    expect(buyableQty((2.7 * 10) / 9, 'Dose')).toBe(3);
    expect(buyableQty(100.00000000001, 'g')).toBe(100);
    expect(buyableQty(0.1 * 3 * 1000, 'g')).toBe(300);
  });

  it('AC-030: spoon measures round up to halves, pinches stay, other units keep two decimals', () => {
    expect(buyableQty(1.33, 'EL')).toBe(1.5);
    expect(buyableQty(0.5, 'TL')).toBe(0.5);
    expect(buyableQty(2.1, 'TL')).toBe(2.5);
    expect(buyableQty(1, 'Prise')).toBe(1);
    expect(buyableQty(1.5, 'Handvoll')).toBe(1.5);
    expect(buyableQty(0.75, 'Glas')).toBe(1);
  });
});

describe('parseItemAmount (spec 0025, REQ-003, REQ-007)', () => {
  it('AC-009, AC-010: a count, a quantity with unit, or nothing', () => {
    expect(parseItemAmount('2')).toEqual({ count: 2 });
    expect(parseItemAmount('1 Kasten')).toEqual({ qty: 1, unit: 'Kasten' });
    expect(parseItemAmount('1 kg')).toEqual({ qty: 1, unit: 'kg' });
    expect(parseItemAmount(' 500g ')).toEqual({ qty: 500, unit: 'g' });
    expect(parseItemAmount('1 Packung')).toEqual({ qty: 1, unit: 'Packung' });
    expect(parseItemAmount('')).toEqual({});
    expect(parseItemAmount('   ')).toEqual({});
  });

  it('AC-012, AC-029: "viel", 0 or a broken count is not recognised', () => {
    expect(parseItemAmount('viel')).toBeUndefined();
    expect(parseItemAmount('0')).toBeUndefined();
    expect(parseItemAmount('1,5')).toBeUndefined();
    expect(parseItemAmount('0 g')).toBeUndefined();
    expect(AMOUNT_NOT_RECOGNIZED).toBe('Menge nicht erkannt – z. B. 500 g oder 2');
  });
});
