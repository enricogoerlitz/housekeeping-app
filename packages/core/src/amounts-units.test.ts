import { describe, expect, it } from 'vitest';

import {
  buyableQty,
  formatAmount,
  parseAmount,
  parseIngredientLine,
  parseSmartInput,
  scaleAmount,
} from './amounts';

// Spec 0023, REQ-007: more spellings of units and sizes ("klein", "groß", …) in the amount.

describe('Spec 0023 REQ-007: more units', () => {
  it('AC-023: "1 Flasche Weißwein", "2 tl Zucker", "0,5 Liter Brühe", "1 Pck. Backpulver"', () => {
    expect(parseIngredientLine('1 Flasche Weißwein')).toEqual({
      name: 'Weißwein',
      amount: { text: '1 Flasche', qty: 1, unit: 'Flasche' },
    });
    expect(parseIngredientLine('2 tl Zucker')).toEqual({
      name: 'Zucker',
      amount: { text: '2 tl', qty: 2, unit: 'TL' },
    });
    expect(parseIngredientLine('0,5 Liter Brühe')).toEqual({
      name: 'Brühe',
      amount: { text: '0,5 Liter', qty: 0.5, unit: 'l' },
    });
    expect(parseIngredientLine('1 Pck. Backpulver')).toEqual({
      name: 'Backpulver',
      amount: { text: '1 Pck.', qty: 1, unit: 'Packung' },
    });
  });

  it.each([
    ['2 Flaschen Wein', 'Flasche'],
    ['1 Tüte Chips', 'Tüte'],
    ['2 Tüten Chips', 'Tüte'],
    ['1 Beutel Tee', 'Beutel'],
    ['1 Netz Zwiebeln', 'Netz'],
    ['2 Netze Orangen', 'Netz'],
    ['1 Würfel Hefe', 'Würfel'],
    ['1 Rolle Blätterteig', 'Rolle'],
    ['2 Rollen Blätterteig', 'Rolle'],
    ['1 Tafel Schokolade', 'Tafel'],
    ['2 Tafeln Schokolade', 'Tafel'],
    ['1 Kopf Salat', 'Kopf'],
    ['2 Köpfe Salat', 'Kopf'],
    ['1 Knolle Fenchel', 'Knolle'],
    ['2 Knollen Fenchel', 'Knolle'],
    ['1 Zweig Rosmarin', 'Zweig'],
    ['2 Zweige Rosmarin', 'Zweig'],
    ['1 Blatt Gelatine', 'Blatt'],
    ['6 Blätter Gelatine', 'Blatt'],
    ['1 Päckchen Vanillezucker', 'Päckchen'],
    ['2 Gläser Oliven', 'Glas'],
    ['1 Pck Hefe', 'Packung'],
    ['1 Pkg. Hefe', 'Packung'],
    ['1 pkg Hefe', 'Packung'],
    ['500 Gramm Mehl', 'g'],
    ['1 Kilo Kartoffeln', 'kg'],
    ['1 Kilogramm Kartoffeln', 'kg'],
    ['200 Milliliter Sahne', 'ml'],
    ['2 Esslöffel Öl', 'EL'],
    ['1 Teelöffel Salz', 'TL'],
    ['1 FLASCHE Wein', 'Flasche'],
  ])('AC-023: "%s" has the unit %s', (line, unit) => {
    expect(parseIngredientLine(line)?.amount?.unit).toBe(unit);
  });

  it('AC-025: "2 Würfelzucker" is two of the article Würfelzucker', () => {
    expect(parseIngredientLine('2 Würfelzucker')).toEqual({
      name: 'Würfelzucker',
      amount: { text: '2', qty: 2 },
    });
  });

  it('countable units round to whole pieces on the list and take a plural', () => {
    expect(buyableQty(1.5, 'Flasche')).toBe(2);
    expect(buyableQty(0.4, 'Kopf')).toBe(1);
    expect(formatAmount(2, 'Flasche')).toBe('2 Flaschen');
    expect(formatAmount(2, 'Kopf')).toBe('2 Köpfe');
    expect(formatAmount(6, 'Blatt')).toBe('6 Blätter');
    expect(formatAmount(2, 'Zweig')).toBe('2 Zweige');
    expect(formatAmount(2, 'Beutel')).toBe('2 Beutel');
  });
});

describe('Spec 0023 REQ-007: sizes belong to the amount', () => {
  it('AC-022: "1 kleine Dose Mais" keeps the size in the amount', () => {
    expect(parseIngredientLine('1 kleine Dose Mais')).toEqual({
      name: 'Mais',
      amount: { text: '1 kleine Dose', qty: 1, unit: 'Dose' },
    });
  });

  it('AC-022: doubled, "1 kleine Dose" becomes "2 kleine Dosen"', () => {
    const amount = parseIngredientLine('1 kleine Dose Mais')?.amount;
    expect(amount && scaleAmount(amount, 2)).toEqual({
      text: '2 kleine Dosen',
      qty: 2,
      unit: 'Dose',
    });
  });

  it('AC-024: "2 große Zwiebeln" is the article Zwiebeln and scales to "3 große"', () => {
    const parsed = parseIngredientLine('2 große Zwiebeln');
    expect(parsed).toEqual({ name: 'Zwiebeln', amount: { text: '2 große', qty: 2 } });
    expect(parsed?.amount && scaleAmount(parsed.amount, 1.5)).toEqual({
      text: '3 große',
      qty: 3,
    });
  });

  it('a size at exactly 1 stays as written, otherwise it ends in -e', () => {
    const big = parseIngredientLine('2 großer Kohlkopf')?.amount;
    expect(big && scaleAmount(big, 0.5)).toEqual({ text: '1 großer', qty: 1 });
    const heaped = parseIngredientLine('1 gehäufter EL Zucker')?.amount;
    expect(heaped).toEqual({ text: '1 gehäufter EL', qty: 1, unit: 'EL' });
    expect(heaped && scaleAmount(heaped, 2)).toEqual({
      text: '2 gehäufte EL',
      qty: 2,
      unit: 'EL',
    });
    const level = parseIngredientLine('1 gestrichener TL Salz')?.amount;
    expect(level && scaleAmount(level, 3)).toEqual({
      text: '3 gestrichene TL',
      qty: 3,
      unit: 'TL',
    });
    const medium = parseIngredientLine('1 mittelgroße Zwiebel')?.amount;
    expect(medium && scaleAmount(medium, 2)).toEqual({ text: '2 mittelgroße', qty: 2 });
  });

  it('the field "Menge" reads sizes and the new units too', () => {
    expect(parseAmount('2 große')).toEqual({ text: '2 große', qty: 2 });
    expect(parseAmount('1 kleine Dose')).toEqual({ text: '1 kleine Dose', qty: 1, unit: 'Dose' });
    expect(parseAmount('1 Flasche')).toEqual({ text: '1 Flasche', qty: 1, unit: 'Flasche' });
  });

  it('the shopping list reads the same units and keeps the size as note', () => {
    expect(parseSmartInput('2 Flaschen Wein')).toEqual({ name: 'Wein', qty: 2, unit: 'Flasche' });
    expect(parseSmartInput('2 große Zwiebeln')).toEqual({
      name: 'Zwiebeln',
      count: 2,
      note: 'große',
    });
  });
});
