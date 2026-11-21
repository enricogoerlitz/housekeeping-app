import { describe, expect, it } from 'vitest';

import {
  CLOSED_DISCLOSURE,
  disclosureLabel,
  disclosureState,
  disclosureTitle,
  type DisclosureEvent,
  type DisclosureState,
} from './disclosure-state';
import { expandableA11y } from './expandable';

// The words a feature passes in; ui holds no copy of its own.
const WORDS = { expanded: 'aufgeklappt', collapsed: 'eingeklappt' };

function run(events: DisclosureEvent[], start: DisclosureState = CLOSED_DISCLOSURE) {
  return events.reduce(disclosureState, start);
}

describe('disclosureTitle and disclosureLabel (spec 0012, REQ-004)', () => {
  it('AC-020: the header reads "Gepackt (4)"', () => {
    expect(disclosureTitle('Gepackt', 4)).toBe('Gepackt (4)');
  });

  it('AC-020: a screen reader hears "Gepackt, 4, eingeklappt" where the platform says no state', () => {
    const label = disclosureLabel('Gepackt', 4);
    expect(expandableA11y(label, false, 'ios', WORDS).accessibilityLabel).toBe(
      'Gepackt, 4, eingeklappt',
    );
    expect(expandableA11y(label, true, 'ios', WORDS).accessibilityLabel).toBe(
      'Gepackt, 4, aufgeklappt',
    );
  });

  it('leaves the state out where the platform announces it from the expanded state', () => {
    expect(disclosureLabel('Gepackt', 4)).toBe('Gepackt, 4');
    expect(expandableA11y(disclosureLabel('Gepackt', 1), true, 'web', WORDS)).toEqual({
      accessibilityLabel: 'Gepackt, 1',
      'aria-expanded': true,
    });
  });
});

describe('disclosureState: folding without network or clock (spec 0012, REQ-004)', () => {
  it('AC-020: a group starts folded and stays folded when another packed item slides in', () => {
    expect(CLOSED_DISCLOSURE.expanded).toBe(false);
    expect(
      run([
        { type: 'count', count: 3 },
        { type: 'count', count: 4 },
      ]).expanded,
    ).toBe(false);
  });

  it('AC-021: one tap unfolds, a second folds again', () => {
    expect(run([{ type: 'toggle' }]).expanded).toBe(true);
    expect(run([{ type: 'toggle' }, { type: 'toggle' }]).expanded).toBe(false);
  });

  it('AC-021: an unfolded group stays open while an item leaves it again', () => {
    const open = run([{ type: 'count', count: 4 }, { type: 'toggle' }]);
    expect(run([{ type: 'count', count: 3 }], open)).toEqual({ expanded: true, count: 3 });
  });

  it('an emptied group folds, so it comes back folded with the next packed item', () => {
    const open = run([{ type: 'count', count: 1 }, { type: 'toggle' }]);
    const emptied = run([{ type: 'count', count: 0 }], open);
    expect(emptied.expanded).toBe(false);
    expect(run([{ type: 'count', count: 1 }], emptied).expanded).toBe(false);
  });

  it('an unchanged count returns the same state, so rendering does not loop', () => {
    const state: DisclosureState = { expanded: true, count: 4 };
    expect(disclosureState(state, { type: 'count', count: 4 })).toBe(state);
  });
});
