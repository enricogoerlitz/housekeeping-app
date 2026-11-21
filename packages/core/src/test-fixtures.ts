// Shared sample data for the unit tests of this package. Not exported from index.ts.
import type { Article, Id, Member, Recipe, RecipeIngredient } from './types';

export const enrico: Member = {
  id: 'm-enrico',
  name: 'Enrico',
  color: '#3E6C8E',
  dietPreference: 'flexible',
  dislikes: [],
};
export const nadja: Member = {
  id: 'm-nadja',
  name: 'Nadja',
  color: '#A8456B',
  dietPreference: 'vegetarian',
  dislikes: [],
};
export const vera: Member = {
  id: 'm-vera',
  name: 'Vera',
  color: '#3A552A',
  dietPreference: 'vegan',
  dislikes: [],
};

function article(id: Id, name: string, rest: Partial<Article> = {}): Article {
  return {
    id,
    name,
    synonyms: [],
    diet: 'vegan',
    isPantry: false,
    needsReview: false,
    createdAt: '',
    ...rest,
  };
}

export const articles: Article[] = [
  article('art-kokosmilch', 'Kokosmilch', { areaId: 'area-konserven' }),
  article('art-mango', 'Mango', { synonyms: ['Mangos'], areaId: 'area-obst' }),
  article('art-reis', 'Reis', { areaId: 'area-nudeln', isPantry: true }),
  article('art-kreuzkuemmel', 'Kreuzkümmel', { areaId: 'area-gewuerze', isPantry: true }),
  article('art-salz', 'Salz', { areaId: 'area-gewuerze', isPantry: true }),
  article('art-tofu', 'Räuchertofu', { areaId: 'area-kuehl' }),
  article('art-haehnchen', 'Hähnchenbrust', { areaId: 'area-fleisch', diet: 'meat' }),
  article('art-hack', 'Hackfleisch', { areaId: 'area-fleisch', diet: 'meat' }),
  article('art-spaghetti', 'Spaghetti', { areaId: 'area-nudeln' }),
  article('art-moehren', 'Möhren', {
    synonyms: ['Karotten', 'Mohrrüben'],
    areaId: 'area-obst',
  }),
  article('art-halloumi', 'Halloumi', { areaId: 'area-kaese', diet: 'vegetarian' }),
  article('art-frischkaese', 'Frischkäse', { areaId: 'area-kuehl', diet: 'vegetarian' }),
  article('art-lachs', 'Lachs', { areaId: 'area-fisch', diet: 'fish' }),
  article('art-milch', 'Milch', { areaId: 'area-kuehl', diet: 'vegetarian' }),
  article('art-mandelmilch', 'Mandelmilch', { areaId: 'area-kuehl' }),
  article('art-spuelmittel', 'Spülmittel', { diet: 'unknown' }),
];

export const articlesById: Record<Id, Article> = Object.fromEntries(
  articles.map((entry) => [entry.id, entry]),
);

export function makeRecipe(partial: Partial<Recipe> & Pick<Recipe, 'id' | 'title'>): Recipe {
  return {
    servings: 4,
    course: 'main',
    tags: [],
    variants: [],
    ingredients: [],
    steps: [],
    favoriteOf: [],
    ratings: {},
    cookedCount: 0,
    createdAt: '2026-10-01T12:00:00.000Z',
    ...partial,
  };
}

function ingredient(id: Id, articleId: Id, rest: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return { id, articleId, shoppingRule: 'count', ...rest };
}

export const mangoCurry: Recipe = makeRecipe({
  id: 'rec-mango-curry',
  title: 'Mango-Curry',
  servings: 4,
  totalMinutes: 25,
  tags: ['schnell', 'scharf'],
  variants: [
    { id: 'v-tofu', name: 'mit Tofu', isDefault: true },
    { id: 'v-haehnchen', name: 'mit Hähnchen', isDefault: false },
  ],
  ingredients: [
    ingredient('i-kokos', 'art-kokosmilch', {
      amount: { text: '400 ml', qty: 400, unit: 'ml' },
      shoppingRule: 'recipeAmount',
    }),
    ingredient('i-mango', 'art-mango', {
      amount: { text: '1', qty: 1 },
      shoppingRule: 'recipeAmount',
    }),
    ingredient('i-reis', 'art-reis', { amount: { text: '250 g', qty: 250, unit: 'g' } }),
    ingredient('i-kreuz', 'art-kreuzkuemmel', {
      amount: { text: '1 TL', qty: 1, unit: 'TL' },
    }),
    ingredient('i-salz', 'art-salz', { shoppingRule: 'skip' }),
    ingredient('i-tofu', 'art-tofu', {
      amount: { text: '400 g', qty: 400, unit: 'g' },
      shoppingRule: 'recipeAmount',
      variantId: 'v-tofu',
    }),
    ingredient('i-haehnchen', 'art-haehnchen', {
      amount: { text: '400 g', qty: 400, unit: 'g' },
      shoppingRule: 'recipeAmount',
      variantId: 'v-haehnchen',
    }),
  ],
  steps: [
    { id: 's-1', text: 'Reis garen.' },
    { id: 's-tofu', text: 'Tofu braten.', variantId: 'v-tofu' },
    { id: 's-haehnchen', text: 'Hähnchen braten.', variantId: 'v-haehnchen' },
    { id: 's-2', text: 'Mango unterheben.' },
  ],
});

export const bolognese: Recipe = makeRecipe({
  id: 'rec-bolognese',
  title: 'Spaghetti Bolognese',
  totalMinutes: 45,
  tags: ['klassiker'],
  ingredients: [
    ingredient('b-hack', 'art-hack', {
      amount: { text: '500 g', qty: 500, unit: 'g' },
      shoppingRule: 'recipeAmount',
    }),
    ingredient('b-spaghetti', 'art-spaghetti'),
    ingredient('b-moehren', 'art-moehren', {
      amount: { text: '2', qty: 2 },
      shoppingRule: 'recipeAmount',
    }),
  ],
});

export const halloumiPfanne: Recipe = makeRecipe({
  id: 'rec-halloumi',
  title: 'Halloumi-Pfanne',
  servings: 2,
  totalMinutes: 20,
  ingredients: [
    ingredient('h-halloumi', 'art-halloumi', {
      amount: { text: '250 g', qty: 250, unit: 'g' },
      shoppingRule: 'recipeAmount',
    }),
    ingredient('h-frischkaese', 'art-frischkaese', {
      shoppingNote: 'Philadelphia',
    }),
  ],
});
