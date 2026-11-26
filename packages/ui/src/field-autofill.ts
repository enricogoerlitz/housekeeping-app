// What a text field tells the browser about autofill and its keyboard (spec 0033, REQ-005,
// decision 4). Safari ignores autocomplete="off" for its contact autofill ("Kontakt autom.
// ausfüllen") and guesses from the field's name, id, label and placeholder instead:
// - name and id are our own: letters and digits only (a dash reads as a phone number field), no
//   contact word, and "search" in it (a search field is never filled from the contacts);
// - on iPhone and iPad the label, the placeholder and the accessible name get an invisible word
//   joiner (U+2060) inside every contact word ("N⁠ame", "A⁠dresse", "T⁠it⁠el"): the text looks and
//   reads the same, Safari's word match no longer finds it. VoiceOver ignores the joiner.
// E-mail fields keep their suggestions (AC-016).

export interface FieldAutofill {
  autoComplete: string;
  /** The field's `name`, also its `id`. */
  name: string;
  id: string;
  /** Whether the visible texts of the field are disguised on Apple touch devices. */
  disguise: boolean;
  inputMode?: 'url';
  autoCapitalize?: 'none';
  autoCorrect?: boolean;
}

export function fieldAutofill(input: {
  /** A number unique to the field on the page. */
  serial: number;
  keyboardType?: string;
  autoComplete?: string;
}): FieldAutofill {
  if (input.keyboardType === 'email-address') {
    return {
      autoComplete: input.autoComplete ?? 'email',
      name: 'email',
      id: `email${input.serial}`,
      disguise: false,
    };
  }
  const name = `hksearch${input.serial}`;
  const base = { autoComplete: input.autoComplete ?? 'off', name, id: name, disguise: true };
  if (input.keyboardType === 'url') {
    return { ...base, inputMode: 'url', autoCapitalize: 'none', autoCorrect: false };
  }
  return base;
}

const WORD_JOINER = '⁠';

/** German and English words Safari reads as contact data; short ones only as a whole word. */
const CONTACT_WORDS: RegExp[] = [
  /name/gi,
  /titel/gi,
  /title/gi,
  /adress/gi,
  /address/gi,
  /straße/gi,
  /strasse/gi,
  /street/gi,
  /hausnummer/gi,
  /postleitzahl/gi,
  /\bplz\b/gi,
  /\bort\b/gi,
  /stadt/gi,
  /city/gi,
  /\bland\b/gi,
  /country/gi,
  /tel/gi,
  /phone/gi,
  /handy/gi,
  /mobil/gi,
  /mail/gi,
  /firma/gi,
  /company/gi,
  /kontakt/gi,
  /contact/gi,
  /geburtstag/gi,
  /birthday/gi,
  /webseite/gi,
  /website/gi,
];

/** The same text with a word joiner after the first letter of every contact word in it. */
export function disguiseContactWords(text: string): string {
  return CONTACT_WORDS.reduce(
    (result, word) =>
      result.replace(word, (match) => `${match.charAt(0)}${WORD_JOINER}${match.slice(1)}`),
    text,
  );
}

/** iPhone, iPod and iPad (an iPad's Safari says "Macintosh" but has a touch screen). */
export function isAppleTouchBrowser(browser: {
  userAgent: string;
  maxTouchPoints?: number;
}): boolean {
  if (/iPhone|iPad|iPod/.test(browser.userAgent)) return true;
  return /Macintosh/.test(browser.userAgent) && (browser.maxTouchPoints ?? 0) > 1;
}
