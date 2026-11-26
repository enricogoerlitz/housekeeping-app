import { describe, expect, it } from 'vitest';

import { fieldAutofill } from './field-autofill';

describe('fieldAutofill (spec 0033, REQ-005)', () => {
  it('AC-014: a title or name field offers no autofill and has a name iOS does not read as a contact', () => {
    const attributes = fieldAutofill({ id: ':r3:' });
    expect(attributes.autoComplete).toBe('off');
    expect(attributes.name).toMatch(/^hk-field-/);
    expect(attributes.name).not.toMatch(/name|address|adresse|email|tel|phone|contact/i);
    // Only letters, digits and dashes.
    expect(attributes.name).toMatch(/^[a-z0-9-]+$/);
  });

  it('AC-015: a web address field opens the URL keyboard, without autofill or capitals', () => {
    expect(fieldAutofill({ id: 'a', keyboardType: 'url' })).toMatchObject({
      autoComplete: 'off',
      inputMode: 'url',
      autoCapitalize: 'none',
      autoCorrect: false,
    });
  });

  it('AC-016: an e-mail field keeps the suggestions of e-mail addresses', () => {
    const attributes = fieldAutofill({ id: 'a', keyboardType: 'email-address' });
    expect(attributes.autoComplete).toBe('email');
    expect(attributes.name).toBe('email');
  });

  it('a field that asks for its own autofill keeps it', () => {
    expect(fieldAutofill({ id: 'a', autoComplete: 'one-time-code' }).autoComplete).toBe(
      'one-time-code',
    );
  });
});
