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
          { id: 'slot-lunch', name: 'Mittag', sort: 0 },
          { id: 'slot-dinner', name: 'Abend', sort: 1 },
        ],
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
    // Ingredients point to articles (spec 0007); the recipe JSON carries no names.
    articles: [
      { ...h, id: 'a-chicken', name: 'Hähnchenbrust' },
      { ...h, id: 'a-cream', name: 'Sahne' },
      { ...h, id: 'a-tofu', name: 'Tofu' },
      { ...h, id: 'a-raeuchertofu', name: 'Räuchertofu' },
      { household_id: 'other-household', id: 'a-foreign', name: 'Fremdartikel' },
    ],
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
          {
            id: 'i-chicken',
            articleId: 'a-chicken',
            amount: { text: '400 g', qty: 400, unit: 'g' },
            shoppingRule: 'recipeAmount',
          },
          {
            id: 'i-cream',
            articleId: 'a-cream',
            amount: { text: '200 ml', qty: 200, unit: 'ml' },
            shoppingRule: 'count',
            shoppingNote: 'Kochsahne',
            group: 'Soße',
          },
          { id: 'i-tofu', articleId: 'a-tofu', variantId: 'v-veg', shoppingRule: 'count' },
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
        ingredients: [
          {
            id: 'i-pasta-tofu',
            articleId: 'a-raeuchertofu',
            amount: { text: '200 g', qty: 200, unit: 'g' },
            shoppingRule: 'count',
          },
        ],
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
