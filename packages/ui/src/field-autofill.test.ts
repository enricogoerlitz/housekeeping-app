import { describe, expect, it } from 'vitest';

import { disguiseContactWords, fieldAutofill, isAppleTouchBrowser } from './field-autofill';

const WORD_JOINER = '⁠';
/** Words iOS reads as contact data in a field's name, id, label or placeholder. */
const CONTACT_WORDS = /name|titel|title|adress|stra|tel|phone|mail|ort|stadt|plz|firma|kontakt/i;

describe('fieldAutofill (spec 0033, REQ-005)', () => {
  it('AC-014: a title or name field offers no autofill and has a neutral name and id without a dash', () => {
    const attributes = fieldAutofill({ serial: 3 });
    expect(attributes.autoComplete).toBe('off');
    expect(attributes.name).toBe(attributes.id);
    // Safari reads a dash in the name as a phone number field, and these words as contact data.
    expect(attributes.name).toMatch(/^[a-z0-9]+$/);
    expect(attributes.name).not.toMatch(CONTACT_WORDS);
    // A search field is never filled from the contacts.
    expect(attributes.name).toContain('search');
    expect(fieldAutofill({ serial: 4 }).name).not.toBe(attributes.name);
  });

  it('AC-015: a web address field opens the URL keyboard, without autofill or capitals', () => {
    expect(fieldAutofill({ serial: 1, keyboardType: 'url' })).toMatchObject({
      autoComplete: 'off',
      inputMode: 'url',
      autoCapitalize: 'none',
      autoCorrect: false,
    });
  });

  it('AC-016: an e-mail field keeps the suggestions of e-mail addresses', () => {
    const attributes = fieldAutofill({ serial: 1, keyboardType: 'email-address' });
    expect(attributes.autoComplete).toBe('email');
    expect(attributes.name).toBe('email');
    expect(attributes.disguise).toBe(false);
  });

  it('a field that asks for its own autofill keeps it', () => {
    expect(fieldAutofill({ serial: 1, autoComplete: 'one-time-code' }).autoComplete).toBe(
      'one-time-code',
    );
  });
});

describe('disguiseContactWords (spec 0033, REQ-005, decision 4)', () => {
  it.each([
    'Name',
    'Titel',
    'Adresse',
    'Link-Adresse',
    'Straße und Hausnummer',
    'Telefon',
    'E-Mail',
    'Ort',
    'Restaurantname',
    'z. B. Kuckhoffstraße 12, Berlin',
  ])('AC-014: „%s“ looks the same but no longer reads as contact data', (text) => {
    const disguised = disguiseContactWords(text);
    expect(disguised.replaceAll(WORD_JOINER, '')).toBe(text);
    expect(disguised).not.toMatch(CONTACT_WORDS);
  });

  it('leaves other words as they are', () => {
    expect(disguiseContactWords('Notiz')).toBe('Notiz');
    expect(disguiseContactWords('Menge')).toBe('Menge');
    expect(disguiseContactWords('Sorte')).toBe('Sorte');
  });
});

describe('isAppleTouchBrowser', () => {
  it('is true on an iPhone and on an iPad that reports itself as a Mac', () => {
    expect(
      isAppleTouchBrowser({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15',
        maxTouchPoints: 5,
      }),
    ).toBe(true);
    expect(
      isAppleTouchBrowser({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it('is false on a Mac with a trackpad and on Android', () => {
    expect(
      isAppleTouchBrowser({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        maxTouchPoints: 0,
      }),
    ).toBe(false);
    expect(
      isAppleTouchBrowser({
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131',
        maxTouchPoints: 5,
      }),
    ).toBe(false);
  });
});
