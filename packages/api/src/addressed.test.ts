import { describe, expect, it } from 'vitest';

import { addressedIn } from './addressed';
import { createInitialState, DEMO_HOUSEHOLD_ID } from './seed/demo';
import type { AppState } from './store';

const TEST_HOUSEHOLD = '7d1e2f30-4a5b-4c6d-8e9f-a0b1c2d3e4f5';
const FOREIGN_RECIPE = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';

function twoHouseholds(): { state: AppState; recipeId: string } {
  const state = createInitialState('2026-11-22');
  const own = state.households[DEMO_HOUSEHOLD_ID];
  if (!own) throw new Error('demo household missing');
  const recipe = own.recipes[0];
  if (!recipe) throw new Error('demo recipe missing');
  const testRecipe = { ...recipe, id: '3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a99' };
  return {
    recipeId: testRecipe.id,
    state: {
      ...state,
      households: {
        ...state.households,
        [TEST_HOUSEHOLD]: {
          ...own,
          household: { ...own.household, id: TEST_HOUSEHOLD, name: 'Test' },
          recipes: [testRecipe],
        },
      },
    },
  };
}

describe('addressedIn', () => {
  it('AC-050: an id of a household the person is not in is not found', () => {
    const { state } = twoHouseholds();
    expect(addressedIn(state, 'recipes', FOREIGN_RECIPE)).toEqual({ status: 'missing' });
  });

  it('AC-051: an id of another own household switches to it', () => {
    const { state, recipeId } = twoHouseholds();
    expect(addressedIn(state, 'recipes', recipeId)).toEqual({
      status: 'switch',
      householdId: TEST_HOUSEHOLD,
      householdName: 'Test',
    });
  });

  it('an id of the active household is shown', () => {
    const { state } = twoHouseholds();
    const id = state.households[DEMO_HOUSEHOLD_ID]?.recipes[0]?.id ?? '';
    expect(addressedIn(state, 'recipes', id)).toEqual({ status: 'shown' });
  });
});
