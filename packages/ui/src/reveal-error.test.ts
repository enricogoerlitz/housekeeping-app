import { describe, expect, it } from 'vitest';

import { revealsError } from './reveal-error';

describe('TextField error into view (spec 0013, task 8)', () => {
  it('a field that already shows an error when it appears does not scroll the page', () => {
    expect(revealsError({ mounted: false, error: 'Titel fehlt' })).toBe(false);
  });

  it('an error that appears after the field was shown scrolls itself into view', () => {
    expect(revealsError({ mounted: true, error: 'Uhrzeit wie 19:00' })).toBe(true);
  });

  it('no error, nothing to reveal', () => {
    expect(revealsError({ mounted: true, error: undefined })).toBe(false);
    expect(revealsError({ mounted: true, error: '' })).toBe(false);
  });
});
