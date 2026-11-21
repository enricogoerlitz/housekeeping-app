import { describe, expect, it } from 'vitest';

import { expandableA11y } from './expandable';

// The words a feature passes in; ui holds no copy of its own.
const WORDS = { expanded: 'aufgeklappt', collapsed: 'eingeklappt' };

describe('expandableA11y: the folded state reaches every screen reader', () => {
  it('the web and Android read the state from aria-expanded, so the label stays as it is', () => {
    for (const os of ['web', 'android']) {
      expect(expandableA11y('Erledigt (2)', false, os, WORDS)).toEqual({
        accessibilityLabel: 'Erledigt (2)',
        'aria-expanded': false,
      });
      expect(expandableA11y('Erledigt (2)', true, os, WORDS)).toEqual({
        accessibilityLabel: 'Erledigt (2)',
        'aria-expanded': true,
      });
    }
  });

  it('iOS says only "expanded", never "collapsed": there the label carries the state', () => {
    expect(expandableA11y('Gepackt, 4', false, 'ios', WORDS)).toEqual({
      accessibilityLabel: 'Gepackt, 4, eingeklappt',
    });
    expect(expandableA11y('Gepackt, 4', true, 'ios', WORDS)).toEqual({
      accessibilityLabel: 'Gepackt, 4, aufgeklappt',
    });
  });

  it('without words iOS falls back to the node state, as before', () => {
    expect(expandableA11y('Sortieren', true, 'ios')).toEqual({
      accessibilityLabel: 'Sortieren',
      'aria-expanded': true,
    });
  });

  it('a toggle without a label of its own gets none, only the state', () => {
    expect(expandableA11y(undefined, false, 'web')).toEqual({
      accessibilityLabel: undefined,
      'aria-expanded': false,
    });
  });
});
