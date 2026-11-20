// Domain types shared by core, api and the app. Names follow .agents/glossary.md.
// Dates are ISO strings without time ("2026-11-20"); timestamps are full ISO strings.

export type Id = string;
export type ISODate = string;

/** What an article, variant or recipe contains. Ordered from least to most restrictive to eat. */
export type Diet = 'vegan' | 'vegetarian' | 'fish' | 'meat' | 'unknown';
/** How a member eats. */
export type DietPreference = 'vegan' | 'vegetarian' | 'flexible';

export interface Member {
  id: Id;
  name: string;
  /** Hex colour used for avatars and assignments. */
  color: string;
  dietPreference: DietPreference;
  dislikes: string[];
}

export interface MealSlot {
  id: Id;
  name: string;
  sort: number;
}

export interface Household {
  id: Id;
  name: string;
  memberIds: Id[];
  mealSlots: MealSlot[];
  defaultListId: Id;
  defaultStoreId?: Id;
}

// ---------- Articles, areas, stores ----------

export interface Area {
  id: Id;
  name: string;
  /** Default position when no store is selected. */
  sort: number;
}

export interface Article {
  id: Id;
  name: string;
  synonyms: string[];
  areaId?: Id;
  diet: Diet;
  /** Explicit "Vorrat" flag: unchecked by default in the pantry check. */
  isPantry: boolean;
}

export interface Store {
  id: Id;
  name: string;
  /** Area ids in walking order. Areas missing here come after the ordered ones. */
  areaOrder: Id[];
  hiddenAreaIds: Id[];
}

// ---------- Recipes ----------

export interface Amount {
  /** Original text, e.g. "200 ml", "1 Prise", "2–3 EL". */
  text: string;
  /** Parsed quantity; undefined when the text is not a number. For ranges the upper bound. */
  qty?: number;
  unit?: string;
}

/** How a recipe ingredient reaches the shopping list. */
export type ShoppingRule = 'count' | 'recipeAmount' | 'skip';

export interface RecipeIngredient {
  id: Id;
  /** Undefined when the name could not be matched to an article. */
  articleId?: Id;
  /** Display name as written in the recipe. */
  name: string;
  amount?: Amount;
  /** Undefined = base ingredient, used by every variant. */
  variantId?: Id;
  shoppingRule: ShoppingRule;
  /** Default "Zusatz" for the shopping list, e.g. "Philadelphia" for Frischkäse in this recipe. */
  shoppingNote?: string;
  group?: string;
}

export interface RecipeVariant {
  id: Id;
  name: string;
  isDefault: boolean;
}

export interface RecipeStep {
  id: Id;
  text: string;
  variantId?: Id;
  timerMinutes?: number;
}

export type Course = 'breakfast' | 'main' | 'side' | 'dessert' | 'snack' | 'drink';

export interface Recipe {
  id: Id;
  title: string;
  /** Key of a bundled sample photo, resolved by the api package. */
  photo?: string;
  description?: string;
  servings: number;
  totalMinutes?: number;
  course: Course;
  cuisine?: string;
  tags: string[];
  variants: RecipeVariant[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  leadTime?: { text: string; hoursBefore: number };
  /** Member ids who marked the recipe as favourite. */
  favoriteOf: Id[];
  /** Rating 1–5 per member id. */
  ratings: Record<Id, number>;
  notes?: string;
  lastCookedOn?: ISODate;
  cookedCount: number;
  createdAt: string;
  source?: string;
}

// ---------- Meal plan ----------

export interface PlanEntryVariant {
  variantId: Id;
  portions: number;
}

export interface MealPlanEntry {
  id: Id;
  /** null = "vorgemerkt" (planned without a day). */
  date: ISODate | null;
  slotId: Id;
  kind: 'recipe' | 'text' | 'leftovers' | 'restaurant';
  recipeId?: Id;
  restaurantId?: Id;
  text?: string;
  leftoversOfEntryId?: Id;
  eaterIds: Id[];
  guests: number;
  portions: number;
  /** Empty for recipes without variants. */
  variants: PlanEntryVariant[];
  cookId?: Id;
  sort: number;
  notCooked?: boolean;
}

// ---------- Restaurants ----------

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Restaurant {
  id: Id;
  name: string;
  address?: string;
  location?: GeoPoint;
  /** The link it was created from (Google Maps / Apple Karten), kept for "Route". */
  mapsUrl?: string;
  cuisine?: string;
  /** 1 (€) … 4 (€€€€). */
  priceLevel?: 1 | 2 | 3 | 4;
  tags: string[];
  notes?: string;
  favoriteOf: Id[];
  ratings: Record<Id, number>;
  createdAt: string;
}

// ---------- Shopping ----------

export interface ShoppingList {
  id: Id;
  name: string;
  isDefault: boolean;
  storeId?: Id;
}

export type ContributionSource =
  | { kind: 'manual' }
  | { kind: 'recipe'; recipeId: Id; entryId?: Id; label: string }
  | { kind: 'recurring' };

export interface ShoppingContribution {
  id: Id;
  source: ContributionSource;
  /** Number of pieces/packs ("2×"). */
  count?: number;
  /** Measured quantity with unit ("500 g"). */
  qty?: number;
  unit?: string;
  /** "Zusatz", shown in parentheses. */
  note?: string;
}

export interface ShoppingItem {
  id: Id;
  listId: Id;
  articleId: Id;
  contributions: ShoppingContribution[];
  checked: boolean;
  checkedAt?: string;
  checkedBy?: Id;
  /** Marked "nicht da" in store mode. */
  notAvailable?: boolean;
  /** Changed offline and not yet confirmed by the server (shown as a small dot). */
  pendingSync?: boolean;
  createdAt: string;
}

// ---------- Chores ----------

export type Recurrence =
  | { type: 'once'; date?: ISODate }
  | { type: 'weekly'; every: number; weekdays: number[] } // 1 = Monday … 7 = Sunday
  | { type: 'monthly'; day: number }
  | { type: 'everyMonths'; every: number }
  | { type: 'flexible'; everyDays: number };

export type Assignment =
  | { type: 'fixed'; memberId: Id }
  | { type: 'rotating'; memberIds: Id[] }
  | { type: 'anyone' }
  | { type: 'together' };

export interface Chore {
  id: Id;
  title: string;
  room?: string;
  recurrence: Recurrence;
  assignment: Assignment;
  effort: 1 | 2 | 3;
  nextDueOn?: ISODate;
  /** Who is up next (fixed or current turn of a rotation). */
  nextAssigneeId?: Id;
  lastDoneOn?: ISODate;
  /** 1–12; undefined = all year. */
  activeMonths?: number[];
}

export interface ChoreEvent {
  id: Id;
  choreId?: Id;
  title: string;
  kind: 'done' | 'skipped' | 'spontaneous';
  doneOn: ISODate;
  doneBy: Id;
}

export interface Absence {
  id: Id;
  /** Undefined = the whole household. */
  memberId?: Id;
  from: ISODate;
  to: ISODate;
  note?: string;
}

// ---------- Feedback ----------

export interface FeedbackEntry {
  id: Id;
  kind: 'idea' | 'problem' | 'praise';
  text: string;
  status: 'new' | 'accepted' | 'rejected' | 'done';
  authorId: Id;
  createdAt: string;
  votes: Id[];
  screen?: string;
  reason?: string;
  specRef?: string;
}
