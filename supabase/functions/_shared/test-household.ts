// A small household as the database would return it under RLS, for the AI handler tests.
import type { Row } from './test-fakes.ts';

export const HOUSEHOLD_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
export const ENRICO = '11111111-1111-4111-8111-111111111111';
export const NADJA = '22222222-2222-4222-8222-222222222222';

const h = { household_id: HOUSEHOLD_ID };

export function householdTables(): { [table: string]: Row[] } {
  return {
    households: [
      {
        id: HOUSEHOLD_ID,
        name: 'Zuhause',
        meal_slots: [
          { id: 'slot-lunch', name: 'Mittag', sort: 1 },
          { id: 'slot-dinner', name: 'Abend', sort: 2 },
        ],
        default_list_id: 'list-main',
      },
    ],
    household_members: [
      { ...h, profile_id: ENRICO },
      { ...h, profile_id: NADJA },
    ],
    profiles: [
      { id: ENRICO, name: 'Enrico', diet_preference: 'flexible' },
      { id: NADJA, name: 'Nadja', diet_preference: 'vegetarian' },
      { id: 'stranger', name: 'Fremd', diet_preference: 'flexible' },
    ],
    shopping_lists: [{ ...h, id: 'list-main', name: 'Einkauf', is_default: true }],
    recipes: [
      {
        ...h,
        id: 'r-curry',
        title: 'Mango-Curry',
        servings: 4,
        tags: ['scharf'],
        course: 'main',
        cuisine: 'indisch',
        total_minutes: 35,
        variants: [{ id: 'v-veg', name: 'Vegetarisch', isDefault: false }],
        ingredients: [
          { id: 'i-chicken', name: 'Hähnchenbrust', amount: { text: '400 g' } },
          { id: 'i-cream', name: 'Sahne', amount: { text: '200 ml' } },
          { id: 'i-tofu', name: 'Tofu', variantId: 'v-veg' },
        ],
      },
      {
        ...h,
        id: 'r-pasta',
        title: 'Tofu-Pasta',
        servings: 2,
        tags: [],
        course: 'main',
        cuisine: null,
        total_minutes: 20,
        variants: [],
        ingredients: [{ id: 'i-pasta-tofu', name: 'Räuchertofu', amount: { text: '200 g' } }],
      },
    ],
    chores: [{ ...h, id: 'c-bath', title: 'Bad putzen', next_due_on: '2026-11-21' }],
    meal_plan_entries: [
      {
        ...h,
        date: '2026-11-20',
        slot_id: 'slot-dinner',
        kind: 'recipe',
        recipe_id: 'r-pasta',
        text: null,
      },
    ],
  };
}
