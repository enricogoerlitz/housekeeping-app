import type { Amount } from './types';

// EL and TL are only recognised in exactly this spelling; every other unit is matched without
// regard to case.
const CASE_SENSITIVE_UNITS = new Set(['EL', 'TL']);
// Lower-case spelling → the singular spelling stored as the unit.
const UNIT_BY_SPELLING = new Map<string, string>([
  ['g', 'g'],
  ['kg', 'kg'],
  ['ml', 'ml'],
  ['l', 'l'],
  ['prise', 'Prise'],
  ['prisen', 'Prise'],
  ['bund', 'Bund'],
  ['zehe', 'Zehe'],
  ['zehen', 'Zehe'],
  ['dose', 'Dose'],
  ['dosen', 'Dose'],
  ['packung', 'Packung'],
  ['packungen', 'Packung'],
  ['stück', 'Stück'],
  ['scheibe', 'Scheibe'],
  ['scheiben', 'Scheibe'],
  ['becher', 'Becher'],
  ['glas', 'Glas'],
  ['stange', 'Stange'],
  ['stangen', 'Stange'],
  ['handvoll', 'Handvoll'],
  ['msp.', 'Msp.'],
  ['msp', 'Msp.'],
]);
// These unit nouns take a plural after any quantity other than one ("2 Dosen"); the remaining
// units stay unchanged as measures ("2 Bund", "3 Stück").
const UNIT_PLURALS: Record<string, string> = {
  Prise: 'Prisen',
  Zehe: 'Zehen',
  Dose: 'Dosen',
  Packung: 'Packungen',
  Scheibe: 'Scheiben',
  Stange: 'Stangen',
};
const NON_SCALING_UNITS = new Set(['Prise', 'Msp.', 'Handvoll']);
// Countable things: nobody measures 1,37 Dosen, so scaled values snap to quarters.
const PIECE_UNITS = new Set([
  'Stück',
  'Dose',
  'Bund',
  'Zehe',
  'Packung',
  'Scheibe',
  'Becher',
  'Glas',
  'Stange',
]);

const FRACTION_CHARS: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅛': 1 / 8,
};
// "1 ½" · "1 1/2" · "1/2" · "1,5" or "2" · "½" — on text whose whitespace is already collapsed.
const NUMBER = String.raw`(?:\d+ ?[½⅓⅔¼¾⅛]|\d+ \d+/\d+|\d+/\d+|\d+(?:[.,]\d+)?|[½⅓⅔¼¾⅛])`;
const LEADING_NUMBER = new RegExp(`^(${NUMBER})(?:(?: ?[-–—] ?| bis )(${NUMBER}))?`);
const MIXED_FRACTION_CHAR = /^(\d+)? ?([½⅓⅔¼¾⅛])$/;
const MIXED_FRACTION = /^(?:(\d+) )?(\d+)\/(\d+)$/;
const MULTIPLIER = /^ ?[x×] (.+)$/i;
const TRAILING_MULTIPLIER = /^(.+?) (\d+) ?[x×]$/i;
const PARENTHESES = /\(([^()]*)(?:\)|$)/g;
const BULLET = /^\s*[-–•*·](?:\s+|$)/;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function findUnit(token: string): string | undefined {
  if (CASE_SENSITIVE_UNITS.has(token)) return token;
  return UNIT_BY_SPELLING.get(token.normalize('NFC').toLowerCase());
}

function parseNumber(text: string): number | undefined {
  const withChar = MIXED_FRACTION_CHAR.exec(text);
  if (withChar) return Number(withChar[1] ?? 0) + (FRACTION_CHARS[withChar[2] ?? ''] ?? 0);

  const fraction = MIXED_FRACTION.exec(text);
  if (fraction) {
    const denominator = Number(fraction[3]);
    if (denominator === 0) return undefined;
    return Number(fraction[1] ?? 0) + Number(fraction[2]) / denominator;
  }

  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
}

interface LeadingAmount {
  /** For ranges the upper bound. */
  qty: number;
  unit?: string;
  /** The amount as written: "2–3 EL", "500g", "2x". */
  text: string;
  /** What follows the amount; never empty. */
  rest: string;
}

/**
 * Splits "200 ml Kokosmilch" into amount and rest. Undefined when the text does not start with an
 * amount that is followed by something: a number glued to other text ("5-Korn-Brot", "7up") is
 * part of a name, and a unit only counts when a name comes after it ("2 Glas" is two glasses).
 */
function splitLeadingAmount(input: string): LeadingAmount | undefined {
  const match = LEADING_NUMBER.exec(input);
  if (!match) return undefined;
  const qty = parseNumber(match[2] ?? match[1] ?? '');
  if (qty === undefined) return undefined;

  const numberText = match[0];
  const after = input.slice(numberText.length);

  const multiplied = MULTIPLIER.exec(after);
  if (multiplied) {
    const rest = multiplied[1] ?? '';
    return { qty, text: input.slice(0, input.length - rest.length).trim(), rest };
  }

  const [, gap = '', token = '', rest = ''] = /^( ?)(\S*)(?: (.*))?$/.exec(after) ?? [];
  const unit = findUnit(token);
  if (unit !== undefined && rest !== '') {
    const text = input.slice(0, numberText.length + gap.length + token.length);
    return { qty, unit, text, rest };
  }
  if (gap !== '' && token !== '') return { qty, text: numberText, rest: after.trim() };
  return undefined;
}

export interface SmartInput {
  /** Article name without amount and note, as typed ("Käse"). */
  name: string;
  /** Pieces, e.g. 2 for "2 Käse" or "2x Käse". */
  count?: number;
  /** Measured quantity, e.g. 500 for "500 g Möhren". */
  qty?: number;
  unit?: string;
  /** Text in parentheses or after a comma: "Gouda oder Emmentaler", "laktosefrei". */
  note?: string;
}

/**
 * Parses one line typed into the shopping list.
 * "2 Käse (Gouda oder Emmentaler)" → { name: "Käse", count: 2, note: "Gouda oder Emmentaler" }
 * "500 g Möhren" → { name: "Möhren", qty: 500, unit: "g" }
 * "Käse, laktosefrei" → { name: "Käse", note: "laktosefrei" }
 * "2x Käse", "2× Käse" and "Käse 2x" → { name: "Käse", count: 2 }
 * "Milch" → { name: "Milch" } · "   " → null
 * Text without a name next to the amount or note ("2", "(Gouda)") is taken as the name as typed.
 */
export function parseSmartInput(text: string): SmartInput | null {
  const input = collapseWhitespace(text);
  if (input === '') return null;

  const leading = splitLeadingAmount(input);
  const notes: string[] = [];
  // The amount is split off first because its decimal comma must not start a note ("1,5 kg").
  const withoutParentheses = (leading?.rest ?? input).replace(
    PARENTHESES,
    (_match, inner: string) => {
      notes.push(inner);
      return ' ';
    },
  );
  const commaAt = withoutParentheses.indexOf(',');
  if (commaAt >= 0) notes.push(withoutParentheses.slice(commaAt + 1));

  let name = collapseWhitespace(
    commaAt >= 0 ? withoutParentheses.slice(0, commaAt) : withoutParentheses,
  );
  let count = leading && leading.unit === undefined ? leading.qty : undefined;
  const trailing = count === undefined ? TRAILING_MULTIPLIER.exec(name) : null;
  if (trailing) {
    name = trailing[1] ?? name;
    count = Number(trailing[2]);
  }
  if (name === '') return { name: input };

  const result: SmartInput = { name };
  if (count !== undefined) result.count = count;
  if (leading?.unit !== undefined) {
    result.qty = leading.qty;
    result.unit = leading.unit;
  }
  const note = notes
    .map(collapseWhitespace)
    .filter((part) => part !== '')
    .join(', ');
  if (note !== '') result.note = note;
  return result;
}

export interface ParsedIngredient {
  name: string;
  amount?: Amount;
}

/**
 * Parses one recipe ingredient line.
 * "200 ml Kokosmilch" → { name: "Kokosmilch", amount: { text: "200 ml", qty: 200, unit: "ml" } }
 * "1 Mango" → { name: "Mango", amount: { text: "1", qty: 1 } }
 * "1 Prise Salz" → { name: "Salz", amount: { text: "1 Prise", qty: 1, unit: "Prise" } }
 * "½ Bund Koriander", "1,5 kg Kartoffeln", "2–3 EL Öl" (qty = upper bound 3), "Salz" (no amount).
 * Known units: g, kg, ml, l, EL, TL, Prise, Bund, Zehe(n), Dose(n), Packung(en), Stück, Scheibe(n),
 * Becher, Glas, Stange(n), Handvoll, Msp. Plural spellings are stored as the singular unit
 * ("2 Dosen Mais" → unit "Dose"); amount.text keeps what was written. Blank line → null.
 */
export function parseIngredientLine(line: string): ParsedIngredient | null {
  const input = collapseWhitespace(line);
  if (input === '') return null;

  const leading = splitLeadingAmount(input);
  if (!leading) return { name: input };

  const amount: Amount = { text: leading.text, qty: leading.qty };
  if (leading.unit !== undefined) amount.unit = leading.unit;
  return { name: leading.rest, amount };
}
/** Splits a pasted block into lines and parses each; empty lines and bullets ("- ", "• ") are ignored. */
export function parseIngredientBlock(text: string): ParsedIngredient[] {
  return text
    .split(/\r?\n/)
    .map((line) => parseIngredientLine(line.replace(BULLET, '')))
    .filter((ingredient): ingredient is ParsedIngredient => ingredient !== null);
}
/** German number formatting: 1.5 → "1,5", 600 → "600", 0.333 → "0,33". */
export function formatQty(qty: number): string {
  // The epsilon keeps values like 1.005, stored as 1.00499…, from rounding down.
  return String(Math.round((qty + Number.EPSILON) * 100) / 100).replace('.', ',');
}
/** "600 ml", "1,5 kg", "3" (no unit), "2 Dosen" (unit "Dose"). */
export function formatAmount(qty: number, unit?: string): string {
  if (unit === undefined || unit === '') return formatQty(qty);
  const shown = qty === 1 ? unit : (UNIT_PLURALS[unit] ?? unit);
  return `${formatQty(qty)} ${shown}`;
}

function roundScaled(value: number, unit: string | undefined): number {
  if (unit === undefined || PIECE_UNITS.has(unit)) {
    const quarters = Math.round(value * 4) / 4;
    // Very small results would snap to zero; those keep their two decimals instead.
    if (quarters > 0) return quarters;
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Scales an amount by a factor. Units that do not scale (Prise, Msp., Handvoll and amounts without
 * qty) are returned unchanged. "400 ml" × 1.5 → { text: "600 ml", qty: 600, unit: "ml" }.
 * Amounts without unit and countable units (Stück, Dose, Bund, …) are rounded to quarters, all
 * others to two decimals.
 */
export function scaleAmount(amount: Amount, factor: number): Amount {
  if (amount.qty === undefined || factor === 1) return amount;
  if (amount.unit !== undefined && NON_SCALING_UNITS.has(amount.unit)) return amount;

  const qty = roundScaled(amount.qty * factor, amount.unit);
  return { ...amount, text: formatAmount(qty, amount.unit), qty };
}
