import { describe, expect, it } from 'vitest';

import {
  formatAmount,
  formatQty,
  parseIngredientBlock,
  parseIngredientLine,
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

  it('recognises EL and TL only in capitals', () => {
    expect(parseIngredientLine('2 el Öl')).toEqual({
      name: 'el Öl',
      amount: { text: '2', qty: 2 },
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
