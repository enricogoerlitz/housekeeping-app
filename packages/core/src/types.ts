// Domain types shared by core, api and the app. Names follow .agents/glossary.md.
// Dates are ISO strings without time ("2026-11-20"); timestamps are full ISO strings.
import { z } from 'zod';

// Type only: reminder.ts imports its schemas from here.
import type { ActivityIcon } from './activity-kinds';
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
  /** "Karten-Link" (spec 0042, REQ-002): Google Maps / Apple Karten; "Route" shows only with it. */
  mapsUrl?: string;
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
  /**
   * The server's `updated_at` of the row (read only): the edit mode remembers it and the save tells
   * whether the recipe changed meanwhile (spec 0037, AC-006). Undefined before the first pull.
   */
  updatedAt?: string;
  /** At most 10, each address once (spec 0023, REQ-009). */
  links: RecipeLink[];
  /**
   * The recipe's videos from TikTok in the order they were saved (spec 0046), at most 10, one per
   * link; written only by the server functions, the files are never kept on the device.
   */
  videos: RecipeVideo[];
}

/** A saved video of a recipe (spec 0043, spec 0046). */
export interface RecipeVideo {
  /** The MP4 in household-videos: <household>/recipes/<recipe>/<uuid>.mp4. */
  path: string;
  /** The link it was saved from; absent for an old video without a TikTok link. */
  url?: string;
  /** Its still in household-media (like a photo), from TikTok's cover; absent when there is none. */
  poster?: string;
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
  /**
   * "Zusatz", shown in parentheses behind the name wherever the name stands: "Lasagne (doppelte
   * Menge)", "Eislaufen (Hohenschönhausen)" (spec 0021, REQ-008); never in the Herkunft of the list.
   */
  note?: string;
  leftoversOfEntryId?: Id;
  eaterIds: Id[];
  guests: number;
  portions: number;
  /** Empty for recipes without variants. */
  variants: PlanEntryVariant[];
  cookId?: Id;
  sort: number;
  /** "Nicht gemacht" (spec 0020, REQ-008): it did not happen; counts for no history or rating. */
  notDone?: boolean;
  /**
   * "Uhrzeit (optional)" (spec 0021, REQ-013): when it starts, the reserved time of a restaurant;
   * only on restaurant and activity entries.
   */
  startsAt?: TimeOfDay;
  /** Spec 0017: "Erinnern" at a day before the entry and a time; only on entries with a day. */
  reminder?: EntryReminder;
  /**
   * Spec 0041: a "Termin" of a series, computed on the device (activity-series.ts) and never
   * stored as a plan entry; `on` is the day the rule gives it (before any "verschieben").
   */
  series?: { seriesId: Id; on: ISODate };
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
  /** "Webseite" (spec 0024, REQ-003): checked like the recipe links (web-link.ts), opened in a new tab. */
  websiteUrl?: string;
  /** Storage path of the household's own photo (spec 0024, REQ-004). */
  photoPath?: string;
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
  /** "Webseite" (spec 0024, REQ-003), like at the restaurant. */
  websiteUrl?: string;
  favoriteOf: Id[];
  /** Rating 0.5–5 in half steps per member id. */
  ratings: Record<Id, number>;
  /** When each member last set their rating (timestamp; read-only, set by the server). */
  ratedAt?: Record<Id, string>;
  createdBy?: Id;
  createdAt: string;
  /** "Art" (spec 0041, REQ-001); undefined = none, also after the kind was deleted. */
  kindId?: Id;
  /** "Eigenes Symbol" (REQ-002), one of ACTIVITY_ICONS; undefined = the kind's symbol. */
  icon?: ActivityIcon;
  /** "Merken" (REQ-004): shown under "Gemerkt" in the list; on unless switched off. */
  remembered: boolean;
}

/** "Aktivitätsart" (spec 0041, REQ-001): name and symbol, shared by the household. */
export interface ActivityKind {
  id: Id;
  name: string;
  icon: ActivityIcon;
}

/**
 * The rhythm of a series (spec 0041, REQ-003): the weekly and monthly shapes of the chore
 * Recurrence, plus "jährlich" on the day and month of the start.
 */
export type SeriesRule =
  | Extract<Recurrence, { type: 'weekly' }>
  | Extract<Recurrence, { type: 'monthly' }>
  | { type: 'yearly' };

/** "Serie" (spec 0041, REQ-003): an activity planned with a rhythm. */
export interface ActivitySeries {
  id: Id;
  activityId: Id;
  rule: SeriesRule;
  startsOn: ISODate;
  /** "bis" (inclusive); undefined = "dauerhaft". */
  endsOn?: ISODate;
  slotId: Id;
  startsAt?: TimeOfDay;
  /** "Zusatz", like on a plan entry. */
  note?: string;
  /** "Wer ist dabei?" (REQ-005). */
  eaterIds: Id[];
  guests: number;
  /**
   * Spec 0059, REQ-003: "Erinnern" for every Termin, counted from its day (0–30 days before);
   * each computed Termin carries it as its own reminder.
   */
  reminder?: EntryReminder;
}

/** One "Termin" of a series "abgesagt" (no movedTo) or "verschoben" (spec 0041, REQ-003). */
export interface ActivitySeriesException {
  id: Id;
  seriesId: Id;
  /** The day the rule gives the Termin. */
  on: ISODate;
  movedTo?: ISODate;
  /** Another Tageszeit or Uhrzeit of a moved Termin; undefined = the series' one. */
  slotId?: Id;
  startsAt?: TimeOfDay;
}

// ---------- Shopping ----------

export type ContributionSource =
  | { kind: 'manual' }
  | { kind: 'recipe'; recipeId: Id; entryId?: Id; label: string }
  /** Spec 0060: a Dauerposten on its day `on` (by the server, or early from "Aus Kalender"). */
  | { kind: 'recurring'; recurringItemId: Id; on: ISODate };

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
  /** Checked on "Liste", not in store mode (spec 0025, REQ-006): no "kauft gerade ein". */
  checkedOnList?: boolean;
  /** Changed offline and not yet confirmed by the server (shown as a small dot). */
  pendingSync?: boolean;
  createdAt: string;
}

/** The rhythm of a Dauerposten (spec 0060, Decision 4): the series rules without "jährlich". */
export type RecurringRule = Exclude<SeriesRule, { type: 'yearly' }>;

/** "Dauerposten" (spec 0060): an article that comes onto the list by itself on its days. */
export interface RecurringItem {
  id: Id;
  articleId: Id;
  count?: number;
  qty?: number;
  unit?: string;
  /** "Zusatz", like on the list. */
  note?: string;
  rule: RecurringRule;
  /** Counts "alle N Wochen" from this week; nothing is due before it. */
  startsOn: ISODate;
  paused: boolean;
  /** The last day it came onto the list; written only by the server. */
  lastAddedOn?: ISODate;
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
  /**
   * „Erinnern“ (spec 0027, REQ-009): false = the time is only shown, nobody is reminded; only with
   * a time. Undefined = on, the default.
   */
  remindAtDueTime?: boolean;
  /**
   * „Vorwarnung“ (spec 0059, REQ-004): from this many days (1–60) before the Termin it stands in
   * the bell; undefined = none.
   */
  noticeDaysBefore?: number;
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
  /** "Entwurf" (spec 0030, REQ-004): shown everywhere, but nobody on it is away yet. */
  draft?: boolean;
}

// ---------- KI-Agent (spec 0066) ----------

/**
 * A research chat of the household ("Recherche-Chat"): only the reference. The messages live in
 * the Foundry conversation and are loaded online (ADR-0018).
 */
export interface AiChat {
  id: Id;
  title: string;
  /** "Mitte", "Aktueller Standort": the place of the first message. */
  placeLabel?: string;
  createdBy?: Id;
  createdAt: string;
  updatedAt: string;
  conversationId: string;
  /** Its answers in Foundry (at most 20 before a new chat, spec 0066 decision 13). */
  responseIds: string[];
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
 * A time of day "HH:MM" (24 h) in the household's local time, always in five-minute steps
 * (spec 0013, Decision 4; `private.is_five_minute_time` in the database).
 */
export const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5][05]$/);
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;

/** Spec 0067, REQ-001: "Normal" or "KI zuerst" (the agent in the middle of the tab bar). */
export type AppView = 'normal' | 'ai_first';

/**
 * The own row of `notification_settings` in one household (one per member, created by the
 * server; spec 0051): the acknowledged in-app notices, written only through acknowledge_notices,
 * and since spec 0067 the person's view, written only through set_app_view.
 */
export interface NotificationSettings {
  id: Id;
  memberId: Id;
  /** Keys of acknowledged notices (`<kind>:<id>[:<more>]:<day>`, notices.ts). */
  acknowledgedNotices: string[];
  appView: AppView;
}
