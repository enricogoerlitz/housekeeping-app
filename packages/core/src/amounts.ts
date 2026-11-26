import type { Amount } from './types';

// Lower-case spelling → the singular spelling stored as the unit; matched without regard to case
// (spec 0023, REQ-007: "el" and "tl" too).
const UNIT_BY_SPELLING = new Map<string, string>([
  ['g', 'g'],
  ['gramm', 'g'],
  ['kg', 'kg'],
  ['kilo', 'kg'],
  ['kilogramm', 'kg'],
  ['ml', 'ml'],
  ['milliliter', 'ml'],
  ['l', 'l'],
  ['liter', 'l'],
  ['el', 'EL'],
  ['esslöffel', 'EL'],
  ['tl', 'TL'],
  ['teelöffel', 'TL'],
  ['prise', 'Prise'],
  ['prisen', 'Prise'],
  ['bund', 'Bund'],
  ['zehe', 'Zehe'],
  ['zehen', 'Zehe'],
  ['dose', 'Dose'],
  ['dosen', 'Dose'],
  ['packung', 'Packung'],
  ['packungen', 'Packung'],
  ['pck.', 'Packung'],
  ['pck', 'Packung'],
  ['pkg.', 'Packung'],
  ['pkg', 'Packung'],
  ['päckchen', 'Päckchen'],
  ['flasche', 'Flasche'],
  ['flaschen', 'Flasche'],
  ['tüte', 'Tüte'],
  ['tüten', 'Tüte'],
  ['beutel', 'Beutel'],
  ['netz', 'Netz'],
  ['netze', 'Netz'],
  ['würfel', 'Würfel'],
  ['rolle', 'Rolle'],
  ['rollen', 'Rolle'],
  ['tafel', 'Tafel'],
  ['tafeln', 'Tafel'],
  ['kopf', 'Kopf'],
  ['köpfe', 'Kopf'],
  ['knolle', 'Knolle'],
  ['knollen', 'Knolle'],
  ['zweig', 'Zweig'],
  ['zweige', 'Zweig'],
  ['blatt', 'Blatt'],
  ['blätter', 'Blatt'],
  ['stück', 'Stück'],
  ['scheibe', 'Scheibe'],
  ['scheiben', 'Scheibe'],
  ['becher', 'Becher'],
  ['glas', 'Glas'],
  ['gläser', 'Glas'],
  ['sack', 'Sack'],
  ['säcke', 'Sack'],
  ['kasten', 'Kasten'],
  ['kästen', 'Kasten'],
  ['stange', 'Stange'],
  ['stangen', 'Stange'],
  ['handvoll', 'Handvoll'],
  ['msp.', 'Msp.'],
  ['msp', 'Msp.'],
]);
const FIRST_UNITS = ['g', 'kg', 'ml', 'l', 'EL', 'TL', 'Prise', 'Stück', 'Bund', 'Dose'];

/**
 * The units the app understands, as they are stored: the common ones first, then the others in
 * the order above. For the (i) next to a field with a free unit (spec 0036, REQ-006).
 */
export const KNOWN_UNITS: readonly string[] = [
  ...new Set([...FIRST_UNITS, ...UNIT_BY_SPELLING.values()]),
];

// These unit nouns take a plural after any quantity other than one ("2 Dosen"); the remaining
// units stay unchanged as measures ("2 Bund", "3 Stück").
const UNIT_PLURALS: Record<string, string> = {
  Prise: 'Prisen',
  Zehe: 'Zehen',
  Dose: 'Dosen',
  Packung: 'Packungen',
  Scheibe: 'Scheiben',
  Stange: 'Stangen',
  Flasche: 'Flaschen',
  Tüte: 'Tüten',
  Netz: 'Netze',
  Rolle: 'Rollen',
  Tafel: 'Tafeln',
  Kopf: 'Köpfe',
  Knolle: 'Knollen',
  Zweig: 'Zweige',
  Blatt: 'Blätter',
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
  'Sack',
  'Kasten',
  'Päckchen',
  'Flasche',
  'Tüte',
  'Beutel',
  'Netz',
  'Würfel',
  'Rolle',
  'Tafel',
  'Kopf',
  'Knolle',
  'Zweig',
  'Blatt',
]);
// A size between number and unit or article belongs to the amount (spec 0023, REQ-007, E-09):
// "1 kleine Dose", "2 große", "1 gehäufter EL". Any ending; scaled it ends in "-e" unless exactly 1.
const SIZE = /^(klein|mittelgroß|groß|gehäuft|gestrichen)(e|er|es|en|em)?$/i;
// Units bought by weight or volume and how many decimals the shop sells them in (spec 0009,
// REQ-005): whole grams and millilitres, kilograms and litres to one decimal.

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
  return UNIT_BY_SPELLING.get(token.normalize('NFC').toLowerCase());
}

function isSize(token: string): boolean {
  return SIZE.test(token.normalize('NFC'));
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
  /** A size word as written ("kleine"), part of `text`. */
  size?: string;
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

  const [, gap = '', first = '', afterFirst = ''] = /^( ?)(\S*)(?: (.*))?$/.exec(after) ?? [];
  // "1 kleine Dose Mais": the size, then the unit and the name.
  const size = gap !== '' && afterFirst !== '' && isSize(first) ? first : undefined;
  const [, token = '', rest = ''] =
    size === undefined ? ['', first, afterFirst] : (/^(\S*)(?: (.*))?$/.exec(afterFirst) ?? []);
  const sized = size === undefined ? {} : { size };
  const unit = findUnit(token);
  if (unit !== undefined && rest !== '') {
    const text = input.slice(0, input.length - rest.length).trim();
    return { qty, unit, text, rest, ...sized };
  }
  if (size !== undefined) {
    return { qty, text: `${numberText} ${size}`, rest: afterFirst.trim(), ...sized };
  }
  if (gap !== '' && token !== '') return { qty, text: numberText, rest: after.trim() };
  return undefined;
}

const NUMBER_WORDS = new Map<string, string>([
  ['ein', '1'],
  ['eine', '1'],
  ['einen', '1'],
  ['einer', '1'],
  ['eins', '1'],
  ['zwei', '2'],
  ['zwo', '2'],
  ['drei', '3'],
  ['vier', '4'],
  ['fünf', '5'],
  ['sechs', '6'],
  ['sieben', '7'],
  ['acht', '8'],
  ['neun', '9'],
  ['zehn', '10'],
  ['elf', '11'],
  ['zwölf', '12'],
  ['zwanzig', '20'],
  ['dreißig', '30'],
]);
// "ein halbes Brot", "eine halbe Gurke", "einen halben Kohl".
const HALF = /^(?:ein|eine|einen|einer) halbe[nrs]? (\S.*)$/i;
// "ein paar Äpfel" is a few, not one.
const NOT_A_COUNT = new Set(['paar', 'bisschen', 'wenig']);

/**
 * Replaces a German number word at the start by digits when something follows it:
 * "sechs Eier" → "6 Eier", "eine Gurke" → "1 Gurke", "ein halbes Brot" → "½ Brot".
 * Text that is only a number word, or "ein paar …", stays as it is.
 */
export function leadingNumberWordToDigits(text: string): string {
  const half = HALF.exec(text);
  if (half) return `½ ${half[1]}`;
  const [, word = '', rest = ''] = /^(\S+) (\S.*)$/.exec(text) ?? [];
  const digits = NUMBER_WORDS.get(word.normalize('NFC').toLowerCase());
  const next = rest.split(' ')[0]?.toLowerCase() ?? '';
  if (digits === undefined || NOT_A_COUNT.has(next)) return text;
  return `${digits} ${rest}`;
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
 * Number words count like digits: "sechs Eier" → { name: "Eier", count: 6 }, "ein halbes Brot"
 * → count 0.5, "zwei Dosen Mais" → { qty: 2, unit: "Dose" } (see leadingNumberWordToDigits).
 * Text without a name next to the amount or note ("2", "(Gouda)") is taken as the name as typed.
 */
export function parseSmartInput(text: string): SmartInput | null {
  const typed = collapseWhitespace(text);
  if (typed === '') return null;
  const input = leadingNumberWordToDigits(typed);

  const leading = splitLeadingAmount(input);
  const notes: string[] = leading?.size === undefined ? [] : [leading.size];
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
  if (name === '') return { name: typed };

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
 * Becher, Glas, Stange(n), Sack (Säcke), Kasten (Kästen), Handvoll, Msp. Plural spellings are stored as the singular unit
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
/**
 * The amount typed on its own in the field "Menge" of an ingredient (spec 0007, AC-001):
 * "400 ml", "400ml", "2", "2 Dosen" (unit "Dose"), "2–3 EL" (qty = upper bound). Text that is not
 * a number with an optional known unit is kept as written without a quantity, so it never scales
 * ("etwas", "2 große"). Blank → undefined.
 */
export function parseAmount(text: string): Amount | undefined {
  const input = collapseWhitespace(text);
  if (input === '') return undefined;
  const match = LEADING_NUMBER.exec(input);
  const qty = match ? parseNumber(match[2] ?? match[1] ?? '') : undefined;
  if (!match || qty === undefined) return { text: input };
  const rest = input.slice(match[0].length).trim();
  if (rest === '') return { text: input, qty };
  const [first = '', ...others] = rest.split(' ');
  const token = isSize(first) ? others.join(' ') : rest;
  if (token === '') return { text: input, qty };
  const unit = findUnit(token);
  return unit === undefined ? { text: input } : { text: input, qty, unit };
}

/** The hint under an amount that is no count and no quantity (spec 0025, AC-012, AC-029). */
export const AMOUNT_NOT_RECOGNIZED = 'Menge nicht erkannt – z. B. 500 g oder 2';

/** An amount typed for an item: a count ("2") or a quantity with unit ("500 g"); {} = none. */
export interface ItemAmount {
  count?: number;
  qty?: number;
  unit?: string;
}

/**
 * The field "Von Hand" in "Posten bearbeiten" and the amount of a row in the pantry check (spec
 * 0025, REQ-003, REQ-007): "2" → 2×, "500 g", "1 Kasten"; blank → nothing. Undefined when it is
 * not recognised ("viel", 0, "1,5" without unit): a count is a whole number from 1 to 10000.
 */
export function parseItemAmount(text: string): ItemAmount | undefined {
  const amount = parseAmount(text);
  if (amount === undefined) return {};
  if (amount.qty === undefined || amount.qty <= 0) return undefined;
  if (amount.unit !== undefined) return { qty: amount.qty, unit: amount.unit };
  return Number.isInteger(amount.qty) && amount.qty <= 10000 ? { count: amount.qty } : undefined;
}

/**
 * The hint under "Menge" (spec 0023, REQ-001): whether the amount follows the portions. Nothing for
 * an empty field.
 */
export function amountScalingHint(text: string): string | undefined {
  const amount = parseAmount(text);
  if (amount === undefined) return undefined;
  const scales =
    amount.qty !== undefined && (amount.unit === undefined || !NON_SCALING_UNITS.has(amount.unit));
  return scales ? 'Wird mit den Portionen umgerechnet' : 'Bleibt beim Umrechnen gleich';
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
  return `${formatQty(qty)} ${shownUnit(qty, unit)}`;
}

function shownUnit(qty: number, unit: string): string {
  return qty === 1 ? unit : (UNIT_PLURALS[unit] ?? unit);
}

function roundScaled(value: number, unit: string | undefined): number {
  if (unit === undefined || PIECE_UNITS.has(unit)) {
    const quarters = Math.round(value * 4) / 4;
    // Very small results would snap to zero; those keep their two decimals instead.
    if (quarters > 0) return quarters;
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Spoon measures are bought by the half (spec 0025, REQ-008).
const HALF_STEP_UNITS = new Set(['EL', 'TL']);

/** Rounds up to a multiple of `step`; the small tolerance keeps float noise from adding a step. */
function ceilTo(qty: number, step: number): number {
  const steps = Math.ceil(qty / step - 1e-6);
  return Math.round(steps * step * 1000) / 1000;
}

/** g and ml: below 250 in steps of 10, up to 999 of 50, from 1000 on of 100 (shown as kg / l). */
function gramStep(qty: number): number {
  if (qty < 250) return 10;
  return qty < 1000 ? 50 : 100;
}

/**
 * The quantity of a scaled recipe amount as it goes on the shopping list and into the pantry check
 * (spec 0025, REQ-008; glossary "Einkaufsregel"): rounded up to what can be bought. g and ml in
 * steps of 10, 50 or 100 ("57 g" → 60, "438 g" → 450, "1125 g" → 1200), kg and l to one decimal,
 * countable units (Glas, Dose, Becher, Packung, Stück, Bund, Sack, Kasten, …) to whole pieces, EL
 * and TL to halves; Prise, Msp. and Handvoll stay as they are, other units keep two decimals. The
 * caller leaves amounts with factor 1 alone; the recipe itself shows the exact scaled amount
 * (scaleAmount).
 */
export function buyableQty(qty: number, unit: string): number {
  if (NON_SCALING_UNITS.has(unit)) return qty;
  if (PIECE_UNITS.has(unit)) return ceilTo(qty, 1);
  if (HALF_STEP_UNITS.has(unit)) return ceilTo(qty, 0.5);
  if (unit === 'g' || unit === 'ml') return ceilTo(qty, gramStep(qty - 1e-6));
  if (unit === 'kg' || unit === 'l') return ceilTo(qty, 0.1);
  return Math.round((qty + Number.EPSILON) * 100) / 100;
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
  const size = sizeOf(amount.text);
  if (size === undefined) return { ...amount, text: formatAmount(qty, amount.unit), qty };
  const shownSize = qty === 1 ? size : `${SIZE.exec(size.normalize('NFC'))?.[1] ?? size}e`;
  const unit = amount.unit === undefined ? '' : ` ${shownUnit(qty, amount.unit)}`;
  return { ...amount, text: `${formatQty(qty)} ${shownSize}${unit}`, qty };
}

/** The size word of an amount text ("1 kleine Dose" → "kleine"), if any. */
function sizeOf(text: string): string | undefined {
  const match = LEADING_NUMBER.exec(collapseWhitespace(text));
  if (!match) return undefined;
  const first = collapseWhitespace(text).slice(match[0].length).trim().split(' ')[0] ?? '';
  return isSize(first) ? first : undefined;
}
