// Shared sample data for the unit tests of this package. Not exported from index.ts.
import type {
  Article,
  CollectionRecipe,
  Id,
  ISODate,
  Member,
  NotificationSettings,
  PackingBag,
  PackingBagItem,
  Recipe,
  RecipeIngredient,
  Trip,
} from './types';

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
    kind: 'recipe',
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

// ---------- Sammlungen (spec 0009) ----------
// The household of the spec: Kartoffelsalat, Grillgemüse with variants, Tzatziki, and the
// collection "Grillabend" of AC-014 (for 6, Kartoffelsalat takes its portions, Grillgemüse has 8).

/** A recipe of the kind "Sammlung": no course, no variants, no steps (spec 0009, E3). */
export function makeCollection(partial: Partial<Recipe> & Pick<Recipe, 'id' | 'title'>): Recipe {
  const collection = makeRecipe({ servings: 6, ...partial, kind: 'collection' });
  delete collection.course;
  return collection;
}

export const grillArticles: Article[] = [
  article('art-kartoffeln', 'Kartoffeln'),
  article('art-mayo', 'Mayonnaise', { diet: 'vegetarian' }),
  article('art-zucchini', 'Zucchini'),
  article('art-olivenoel', 'Olivenöl', { isPantry: true }),
  article('art-halloumi', 'Halloumi', { diet: 'vegetarian' }),
  article('art-joghurt', 'Joghurt', { diet: 'vegetarian' }),
  article('art-gurke', 'Gurke'),
  article('art-kichererbsen', 'Kichererbsen'),
  article('art-wuerstchen', 'Würstchen', { diet: 'meat' }),
  article('art-grillkohle', 'Grillkohle'),
  article('art-bier', 'Bier'),
  article('art-anzuender', 'Grillanzünder'),
];

export const grillArticlesById: Record<Id, Article> = Object.fromEntries(
  grillArticles.map((entry) => [entry.id, entry]),
);

export const kartoffelsalat: Recipe = makeRecipe({
  id: 'rec-kartoffelsalat',
  title: 'Kartoffelsalat',
  photo: 'kartoffelsalat',
  ingredients: [
    ingredient('k-kartoffeln', 'art-kartoffeln', {
      amount: { text: '2 kg', qty: 2, unit: 'kg' },
      shoppingRule: 'recipeAmount',
    }),
    ingredient('k-mayo', 'art-mayo'),
  ],
});

export const grillgemuese: Recipe = makeRecipe({
  id: 'rec-grillgemuese',
  title: 'Grillgemüse',
  photoPath: 'household/recipes/rec-grillgemuese/photo.jpg',
  variants: [
    { id: 'v-halloumi', name: 'mit Halloumi', isDefault: true },
    { id: 'v-vegan', name: 'vegan', isDefault: false },
  ],
  ingredients: [
    ingredient('g-zucchini', 'art-zucchini', {
      amount: { text: '2', qty: 2 },
      shoppingRule: 'recipeAmount',
    }),
    ingredient('g-olivenoel', 'art-olivenoel'),
    ingredient('g-halloumi', 'art-halloumi', { variantId: 'v-halloumi' }),
  ],
});

export const tzatziki: Recipe = makeRecipe({
  id: 'rec-tzatziki',
  title: 'Tzatziki',
  ingredients: [ingredient('t-joghurt', 'art-joghurt'), ingredient('t-gurke', 'art-gurke')],
});

export const hummus: Recipe = makeRecipe({
  id: 'rec-hummus',
  title: 'Hummus',
  ingredients: [ingredient('h-kichererbsen', 'art-kichererbsen')],
});

export const grillabend: Recipe = makeCollection({
  id: 'col-grillabend',
  title: 'Grillabend',
  ingredients: [
    ingredient('o-wuerstchen', 'art-wuerstchen', {
      amount: { text: '12', qty: 12 },
      shoppingRule: 'recipeAmount',
    }),
    ingredient('o-grillkohle', 'art-grillkohle', {
      amount: { text: '1 Sack', qty: 1, unit: 'Sack' },
    }),
  ],
});

export const grillabendRecipes: CollectionRecipe[] = [
  { id: 'cr-kartoffelsalat', collectionId: grillabend.id, recipeId: kartoffelsalat.id, sort: 0 },
  {
    id: 'cr-grillgemuese',
    collectionId: grillabend.id,
    recipeId: grillgemuese.id,
    servings: 8,
    variantId: 'v-halloumi',
    sort: 1,
  },
];

export const grillRecipes: Recipe[] = [kartoffelsalat, grillgemuese, tzatziki, hummus, grillabend];

export const grillRecipesById: Record<Id, Recipe> = Object.fromEntries(
  grillRecipes.map((entry) => [entry.id, entry]),
);

// ---------- Reisetaschen (spec 0012) ----------

export const strand: PackingBag = { id: 'bag-strand', name: 'Strand', sort: 0 };
export const wintersport: PackingBag = { id: 'bag-wintersport', name: 'Wintersport', sort: 1 };
export const kulturbeutel: PackingBag = {
  id: 'bag-kulturbeutel',
  name: 'Kulturbeutel',
  memberId: 'm-nadja',
  sort: 2,
};
export const technik: PackingBag = { id: 'bag-technik', name: 'Technik', sort: 3 };
export const packingBags: PackingBag[] = [strand, wintersport, kulturbeutel, technik];

/** [name, quantity, per day] in the order of the bag. */
type BagItemSpec = [string, number?, boolean?];

function bagItems(bag: PackingBag, specs: BagItemSpec[]): PackingBagItem[] {
  return specs.map(([name, quantity, perDay], index) => ({
    id: `${bag.id}-${index + 1}`,
    bagId: bag.id,
    name,
    quantity,
    perDay: perDay ?? false,
    sort: index,
  }));
}

export const packingBagItems: PackingBagItem[] = [
  ...bagItems(strand, [
    ['T-Shirts', 1, true],
    ['Badehose', 2],
    ['Sonnenbrille'],
    ['Strandtuch'],
    ['Flip-Flops'],
    ['Sonnenhut'],
    ['Buch'],
    ['Shorts', 3],
    ['Kleid', 2],
    ['Luftmatratze'],
    ['Kopfhörer'],
    ['Wasserflasche'],
  ]),
  ...bagItems(wintersport, [
    ['Sonnencreme'],
    ['Sonnenbrille'],
    ['Skihose'],
    ['Skijacke'],
    ['Handschuhe', 2],
    ['Mütze'],
    ['Schal'],
    ['Skibrille'],
    ['Helm'],
    ['Thermounterwäsche', 1, true],
    ['Skisocken', 1, true],
    ['Pullover', 2],
    ['Lippenpflege'],
    ['Taschenwärmer', 4],
    ['Rucksack'],
    ['Thermoskanne'],
    ['Hüttenschuhe'],
    ['Skipass'],
  ]),
  ...bagItems(kulturbeutel, [
    ['Zahnbürste'],
    ['Zahnpasta'],
    ['Shampoo'],
    ['Duschgel'],
    ['Deo'],
    ['Haarbürste'],
    ['Abschminktücher'],
    ['Gesichtscreme'],
    ['Haargummis', 3],
  ]),
  ...bagItems(technik, [
    ['Ladekabel', 2],
    ['Powerbank'],
    ['Kopfhörer'],
    ['Adapter'],
    ['E-Reader'],
    ['Kamera'],
  ]),
];

/** The defaults of a new member's row, as the column defaults set them (spec 0013, AC-011). */
export const notificationDefaults: NotificationSettings = {
  id: 'ns-enrico',
  memberId: enrico.id,
  dailySummaryEnabled: false,
  dailySummaryAt: '07:30',
  dailySummaryParts: ['meals', 'activities', 'chores', 'prep'],
  activitiesEveEnabled: false,
  activitiesEveAt: '19:00',
  choreRemindersEnabled: true,
  entryRemindersEnabled: true,
};

/** A trip of these people; the rows of trip_members get ids "<trip>:<member>". */
export function trip(
  id: Id,
  memberIds: readonly Id[],
  from: ISODate,
  to: ISODate,
  note?: string,
): Trip {
  return {
    id,
    from,
    to,
    note,
    members: memberIds.map((memberId) => ({ id: `${id}:${memberId}`, memberId })),
  };
}
