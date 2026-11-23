import { describe, expect, it } from 'vitest';

import { hatchImage, withAlpha } from './hatch';

describe('hatching of a draft (spec 0030, Entscheidung 6)', () => {
  it('AC-012: thin diagonal lines in the given colour over transparency', () => {
    expect(hatchImage('#2F7D6B')).toBe(
      'repeating-linear-gradient(135deg, #2F7D6B 0px, #2F7D6B 1.5px, transparent 1.5px, transparent 6px)',
    );
  });

  it('adds an alpha to a six-digit hex colour and leaves others as they are', () => {
    expect(withAlpha('#2F7D6B', '59')).toBe('#2F7D6B59');
    expect(withAlpha('#2F7D6B2E', '59')).toBe('#2F7D6B59');
    expect(withAlpha('rgb(0 0 0)', '59')).toBe('rgb(0 0 0)');
  });
});
