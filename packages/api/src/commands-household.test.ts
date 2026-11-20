import { describe, expect, it } from 'vitest';

import { addFeedback, switchHousehold } from './commands-household';
import { createRestaurant } from './commands-restaurants';
import { DEMO_HOUSEHOLD_ID, ENRICO, TEST_HOUSEHOLD_ID } from './seed/demo';
import { getData, getState, resetState } from './store';
import { withDemoHousehold } from './test-helpers';

withDemoHousehold();

describe('household commands', () => {
  it('AC-039: new feedback has status "neu"; empty feedback fails', () => {
    const id = addFeedback({ kind: 'idea', text: 'Liste nach Rezept gruppieren' });
    expect(getData().feedback[0]).toMatchObject({ id, status: 'new', authorId: ENRICO });
    expect(() => addFeedback({ kind: 'idea', text: '  ' })).toThrow('Der Text fehlt.');
  });

  it('AC-002: the household "Test" has no restaurants; unknown households are ignored', () => {
    switchHousehold(TEST_HOUSEHOLD_ID);
    expect(getData().restaurants).toEqual([]);
    switchHousehold('hh-weg');
    expect(getState().activeHouseholdId).toBe(TEST_HOUSEHOLD_ID);
    switchHousehold(DEMO_HOUSEHOLD_ID);
    expect(getData().household.name).toBe('Enrico & Nadja');
  });

  it('starts from the seed again after resetState', () => {
    createRestaurant({ name: 'Weg damit' });
    resetState();
    expect(getData().restaurants.some((r) => r.name === 'Weg damit')).toBe(false);
  });
});
