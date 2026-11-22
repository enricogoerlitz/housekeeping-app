// Domain types shared by core, api and the app. Names follow .agents/glossary.md.
// Dates are ISO strings without time ("2026-11-20"); timestamps are full ISO strings.
import { z } from 'zod';

// Type only: reminder.ts imports its schemas from here.
import type { EntryReminder } from './reminder';

export type Id = string;
export type ISODate = string;

/** What an article, variant or recipe contains. Ordered from least to most restrictive to eat. */
/** "kein Lebensmittel" (non_food) never counts when a diet is derived (spec 0023, REQ-008). */
export type Diet = 'vegan' | 'vegetarian' | 'fish' | 'meat' | 'unknown' | 'non_food';
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
  defaultStoreId?: Id;
  /**
   * `households.timezone` (IANA, e.g. "Europe/Berlin"): every reminder is judged in it (spec 0017,
   * Decision 5). Read only; nobody writes it from the app.
   */
  timeZone: string;
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
  /** "Standard-Einkaufsregel" for new recipe ingredients; undefined = derived (spec 0007, E7). */
  defaultShoppingRule?: ShoppingRule;
  /** "Neu aus Rezepten": created for an ingredient without a person's choice (spec 0007, E1). */
  needsReview: boolean;
  /** Server time of creation; set locally until the server row arrives. */
  createdAt: string;
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
  /** The article of the household; the recipe shows its name (spec 0007, REQ-001). */
  articleId: Id;
  amount?: Amount;
  /** Undefined = base ingredient, used by every variant. */
  variantId?: Id;
  shoppingRule: ShoppingRule;
  /** Default "Zusatz" for the shopping list, e.g. "Philadelphia" for Frischkäse in this recipe. */
  shoppingNote?: string;
  /** "Hinweis" for cooking ("fein gehackt"); shown in the recipe, never on the shopping list. */
  prepNote?: string;
  group?: string;
}

/**
 * A link to a page on the web (spec 0023, REQ-009): the address as normalised on the device
 * (web-link.ts) and checked again by the database (private.is_web_url). The app never loads it.
 */
export interface RecipeLink {
  url: string;
  /** "Bezeichnung", 1–80 characters; without it the host is shown. */
  label?: string;
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

/** "Art": a plain recipe or a "Sammlung" (spec 0009, D14); fixed when it is created. */
export type RecipeKind = 'recipe' | 'collection';

export interface Recipe {
  id: Id;
  kind: RecipeKind;
  title: string;
  /** Key of a bundled sample photo, resolved by the api package. */
  photo?: string;
  /** Storage path of the household's own photo; shown instead of `photo` when set. */
  photoPath?: string;
  description?: string;
  servings: number;
  totalMinutes?: number;
  /**
   * Always set for a recipe, never for a collection. A collection has no course, cuisine, time,
   * tags, variants, steps or Vorlauf either, and its own ingredients have no variant (E3).
   */
  course?: Course;
  cuisine?: string;
  tags: string[];
  variants: RecipeVariant[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  leadTime?: { text: string; hoursBefore: number };
  /** Member ids who marked the recipe as favourite. */
  favoriteOf: Id[];
  /** Rating 0.5–5 in half steps per member id. */
  ratings: Record<Id, number>;
  /** When each member last set their rating (timestamp; read-only, set by the server). */
  ratedAt?: Record<Id, string>;
  notes?: string;
  lastCookedOn?: ISODate;
  cookedCount: number;
  createdAt: string;
  /** At most 10, each address once (spec 0023, REQ-009). */
  links: RecipeLink[];
}

/** "Enthaltenes Rezept": a recipe in a collection (spec 0009, E4). */
export interface CollectionRecipe {
  id: Id;
  /** The recipe of the kind "collection" that contains it. */
  collectionId: Id;
  /** Always of the kind "recipe" (D15: no collection in a collection). */
  recipeId: Id;
  /** 1–100; undefined = the portions of the collection ("übernimmt"). */
  servings?: number;
  /** Undefined = the recipe's default variant. */
  variantId?: Id;
  sort: number;
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
  kind: 'recipe' | 'text' | 'leftovers' | 'restaurant' | 'activity';
  recipeId?: Id;
  restaurantId?: Id;
  activityId?: Id;
  text?: string;
  /** "Zusatz", shown in parentheses: "Eislaufen (Hohenschönhausen)". Only on activities. */
  note?: string;
  leftoversOfEntryId?: Id;
  eaterIds: Id[];
  guests: number;
  portions: number;
  /** Empty for recipes without variants. */
  variants: PlanEntryVariant[];
  cookId?: Id;
  sort: number;
  notCooked?: boolean;
  /** "Reserviert um" (spec 0013, REQ-008); only on restaurant entries. */
  reservedAt?: TimeOfDay;
  /** "Erinnern … vorher"; undefined = DEFAULT_REMIND_MINUTES (the column default, 120). */
  remindMinutesBefore?: RemindMinutes;
  /** Spec 0017: "Erinnern" at a day before the entry and a time; only on entries with a day. */
  reminder?: EntryReminder;
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
  /** Rating 0.5–5 in half steps per member id. */
  ratings: Record<Id, number>;
  /** When each member last set their rating (timestamp; read-only, set by the server). */
  ratedAt?: Record<Id, string>;
  createdAt: string;
}

// ---------- Activities ----------

export interface Activity {
  id: Id;
  name: string;
  description?: string;
  /** Storage path of the household's own photo. */
  photoPath?: string;
  /** Name of the place, e.g. "Eisstadion Hohenschönhausen"; the activity's name stays free. */
  placeName?: string;
  address?: string;
  location?: GeoPoint;
  /** The link the place was taken from (Google Maps / Apple Karten). */
  mapsUrl?: string;
  tags: string[];
  favoriteOf: Id[];
  /** Rating 0.5–5 in half steps per member id. */
  ratings: Record<Id, number>;
  /** When each member last set their rating (timestamp; read-only, set by the server). */
  ratedAt?: Record<Id, string>;
  createdBy?: Id;
  createdAt: string;
}

// ---------- Shopping ----------

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

/** An item on the household's shopping list ("Einkaufsliste"; one per household, ADR-0012). */
export interface ShoppingItem {
  id: Id;
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
  | { type: 'flexible'; everyDays: number }
  /** "bei Bedarf": never due, found in "Was anderes erledigt?" (spec 0011, D27). */
  | { type: 'asNeeded' };

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
  /** "Uhrzeit": reminder on the due day (spec 0013, REQ-007); undefined = none. */
  dueTime?: TimeOfDay;
}

export interface ChoreEvent {
  id: Id;
  choreId?: Id;
  title: string;
  /** "spontan" does not exist (spec 0011, Offene Frage 6): see "Was anderes erledigt?". */
  kind: 'done' | 'skipped';
  doneOn: ISODate;
  doneBy: Id;
  /** When it was booked (timestamp; read-only). Orders the history chain, spec 0011. */
  createdAt?: string;
  /**
   * The chore's state before this entry was booked; only set when the server recorded it.
   * Removing the latest booked entry restores it (spec 0011, Offene Frage 3).
   */
  previous?: ChoreEventPrevious;
}

export interface ChoreEventPrevious {
  nextDueOn?: ISODate;
  lastDoneOn?: ISODate;
  nextAssigneeId?: Id;
}

/** One person of a trip (a row of trip_members). */
export interface TripMember {
  id: Id;
  memberId: Id;
}

/** "Reise" (spec 0022): period, note and at least one person of the household. */
export interface Trip {
  id: Id;
  from: ISODate;
  to: ISODate;
  note?: string;
  members: TripMember[];
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

// ---------- Packing (spec 0012) ----------

/** "Reisetasche": a reusable template for packing lists. */
export interface PackingBag {
  id: Id;
  /** Unique per household (case and umlauts ignored), 1–60 characters. */
  name: string;
  /** "für" one member; undefined = for everyone. */
  memberId?: Id;
  /** Order of the page "Reisetaschen" (order of creation). */
  sort: number;
}

/** "Packstück" of a Reisetasche. */
export interface PackingBagItem {
  id: Id;
  bagId: Id;
  name: string;
  /** 1–99; undefined = no quantity ("Sonnenbrille"). */
  quantity?: number;
  /** The quantity is per day of the trip ("1 je Tag"); needs a quantity. */
  perDay: boolean;
  sort: number;
}

/** "Tasche der Packliste": one bag attached to a trip, with a copy of its name and member. */
export interface PackingListBag {
  id: Id;
  tripId: Id;
  /** The Reisetasche it was copied from; undefined once that one is deleted. */
  bagId?: Id;
  name: string;
  memberId?: Id;
  sort: number;
}

/** "Packstück" of a Packliste. The packed fields are written only by the server. */
export interface PackingItem {
  id: Id;
  listBagId: Id;
  name: string;
  /** The quantity shown; for "je Tag" per day × days of the trip (at most 9999). */
  quantity?: number;
  /** Quantity per day (1–99); undefined = a fixed quantity or none. */
  perDay?: number;
  packed: boolean;
  packedAt?: string;
  packedBy?: Id;
  /** Counter for "Abhaken gewinnt" (ADR-0013). */
  packSeq: number;
  sort: number;
  /** Spec 0022: the Packstück of the Reisetasche it came from; undefined once that one is gone. */
  bagItemId?: Id;
  /** It came from the Reisetasche (copied or saved there too); false = added by hand. */
  fromBag?: boolean;
}

// ---------- Notifications (spec 0013) ----------

/**
 * A time of day "HH:MM" (24 h) in the household's local time, always in five-minute steps like
 * the scheduler's tick (plan, Decision 4; `private.is_five_minute_time` in the database).
 */
export const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5][05]$/);
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;

/** "Erinnern … vorher" of a reservation, in minutes (Offene Frage 2 A). */
export const RemindMinutesSchema = z.literal([30, 60, 120, 180, 240]);
export type RemindMinutes = z.infer<typeof RemindMinutesSchema>;

/** The parts of the "Tagesüberblick": Essen, Aktivitäten, Aufgaben, Vorbereitung. */
export const DailySummaryPartSchema = z.enum(['meals', 'activities', 'chores', 'prep']);
export type DailySummaryPart = z.infer<typeof DailySummaryPartSchema>;

/**
 * "Benachrichtigungs-Einstellungen" of one member in one household (one row per member, created
 * by the server with the defaults; the member changes only these fields).
 */
export const NotificationSettingsSchema = z.object({
  id: z.string(),
  memberId: z.string(),
  dailySummaryEnabled: z.boolean(),
  dailySummaryAt: TimeOfDaySchema,
  /** 1–4 parts, each at most once. */
  dailySummaryParts: z
    .array(DailySummaryPartSchema)
    .min(1)
    .max(4)
    .refine((parts) => new Set(parts).size === parts.length),
  activitiesEveEnabled: z.boolean(),
  activitiesEveAt: TimeOfDaySchema,
  choreRemindersEnabled: z.boolean(),
  reservationRemindersEnabled: z.boolean(),
  /** Spec 0017, REQ-007: "Erinnerungen an Einträgen", on at the start. */
  entryRemindersEnabled: z.boolean(),
});
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

/** What the server says about a push subscription ("Deine Geräte"). */
export const PushSubscriptionStatusSchema = z.enum(['active', 'off', 'unreachable']);
export type PushSubscriptionStatus = z.infer<typeof PushSubscriptionStatusSchema>;

/**
 * One of the person's own "Push-Abos" as `list_push_subscriptions` returns it: never the push
 * address or keys. Not `PushSubscription`, which is the browser's type.
 */
export const OwnPushSubscriptionSchema = z.object({
  id: z.string(),
  /** "Mac · Chrome" (deviceLabel). */
  label: z.string(),
  status: PushSubscriptionStatusSchema,
  /** The subscription of the device that asks. */
  isCurrent: z.boolean(),
  createdAt: z.string(),
  lastSuccessAt: z.string().optional(),
});
export type OwnPushSubscription = z.infer<typeof OwnPushSubscriptionSchema>;
