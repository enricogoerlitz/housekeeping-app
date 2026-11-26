// Domain objects ⇄ database rows. Pure functions; no I/O.
//
// Rows use the database's snake_case columns; the jsonb columns of recipes keep the domain's
// camelCase objects (the edge functions read them that way). Per-member tables (favourites,
// ratings, votes) fold into `favoriteOf`, `ratings` and `votes`.
//
// Documented normalisations (a round trip is equal modulo these):
// - null in a row ⇄ undefined (missing) in the domain; `not_done` / `not_available` false ⇄
//   undefined.
// - A removed member (`done_by` / `author_id` null) becomes '' in the domain and null again.
// - `name_key` / `synonym_keys` (articles, activities) are always recomputed with `normalizeText`.
// - Spec 0037: `updated_at` of a recipe is `Recipe.updatedAt`, written back only to keep the local
//   view (NEVER_SENT_COLUMNS: a diff never sends it).
// - Columns the domain does not have are not written back: `updated_at`, `check_seq`,
//   `profiles.email`, and `created_at` of tables whose domain type has no `createdAt`.
// - Spec 0011: `updated_at` of a rating row is `ratedAt` of that member (and is written back only
//   to show a local rating at once; the RPCs never send it). The recorded state of a chore entry
//   (`prev_*`, only when `prev_recorded`) is `ChoreEvent.previous` and is never written back:
//   only complete_chore sets it.
// - Order: areas by `sort`; recipes, restaurants, activities and feedback newest first; chore
//   events by day, newest first; everything else in creation order. Ties keep the order of the
//   rows, rows without `created_at` (local, not yet on the server) count as newest.
// - A removed creator of an activity (`created_by` null) is simply unknown (undefined).
// - `pendingSync` is client-only: it is set from the store queue, never stored.
// - Spec 0012: the packed state of a Packstück (`packed`, `packed_at`, `packed_by`, `pack_seq`) is
//   read and written to rows for the local view, but a diff never sends it (NEVER_SENT_COLUMNS):
//   only set_packing_items_packed and restore_packing_items write it. `per_day` of a Reisetasche
//   is a flag, `per_day_quantity` of a Packliste the quantity per day (`perDay` undefined = fixed). A removed person
//   (`member_id`, `packed_by` null) is undefined. The four packing tables keep creation order.
// - Spec 0009: `kind` other than 'collection' (or missing) is a recipe; a recipe without `course`
//   is "main" as before, a collection has none (null ⇄ undefined). Contained recipes
//   (`collection_recipes`) keep creation order; core orders them by `sort`.
// - Spec 0013: times of day are "HH:MM" in the domain and "HH:MM:SS" in the rows, as Postgres
//   returns a `time` (`due_time`, `starts_at`, `daily_summary_at`, `activities_eve_at`); the rows
//   write them with ":00", so a diff compares like with like. Of `notification_settings` only
//   the signed-in member's row is `notificationSettings` (RLS sends no other).
// - Spec 0017: a reminder is the three columns `reminder_day_offset`, `reminder_at` ("HH:MM:SS"
//   like every time) and `reminder_text` ⇄ `MealPlanEntry.reminder` (none = all three null).
//   `entry_reminders_enabled` missing reads as its column default, on. `households.timezone` is
//   `Household.timeZone`, read only: the rows never write it back.
// - Spec 0041: a symbol outside ACTIVITY_ICONS (the database refuses it) reads as none; a kind
//   without a valid one as the default. A rule the database would refuse makes its series
//   unreadable: such a series is left out. `remembered` missing reads as its default, on.
import {
  compareTimestamps,
  normalizeText,
  isActivityIcon,
  SeriesRuleSchema,
  type Activity,
  type ActivityIcon,
  type ActivityKind,
  type ActivitySeries,
  type ActivitySeriesException,
  type Area,
  type Article,
  type Chore,
  type ChoreEvent,
  type CollectionRecipe,
  type FeedbackEntry,
  type Household,
  type MealPlanEntry,
  type Member,
  type NotificationSettings,
  type PackingBag,
  type PackingBagItem,
  type PackingItem,
  type PackingListBag,
  type Recipe,
  type Trip,
  type Restaurant,
  type Row,
  type ShoppingContribution,
  type ShoppingItem,
  type ShoppingRule,
  type SmallRow,
  type Store,
  type TableRows,
  type TimeOfDay,
} from '@housekeeping/core';

import type { HouseholdData } from '../store';
import type { Database, Json, Tables } from './types.gen';

/** Rows per table, as written by `householdToRows`. */
export type HouseholdRows = Record<string, Row[]>;

type TableName = keyof Database['public']['Tables'];
/** A row as it may be cached: local inserts lack the server columns. */
type Cached<T extends TableName> = Partial<Tables<T>> & { id: string };

const opt = <T>(value: T | null | undefined): T | undefined => (value === null ? undefined : value);

/** The column default of `households.timezone`; every household row from the server has one. */
export const HOUSEHOLD_TIME_ZONE_DEFAULT = 'Europe/Berlin';

/** Domain jsonb values are plain JSON by construction (no functions, no dates). */
const json = (value: unknown): NonNullable<Json> => value as NonNullable<Json>;

/** "19:00" → "19:00:00", the way Postgres returns a `time`. */
const toDbTime = (time: TimeOfDay): string => `${time}:00`;
/** "19:00:00" (or a local "19:00") → "19:00". */
const fromDbTime = (value: string | null | undefined): TimeOfDay | undefined =>
  typeof value === 'string' ? value.slice(0, 5) : undefined;

// ---------------------------------------------------------------------------------------------
// Domain → rows
// ---------------------------------------------------------------------------------------------

const rowCache = new WeakMap<object, { householdId: string; rows: HouseholdRows }>();

/** Rows of one domain object, cached per object so unchanged objects give the same rows. */
function rowsOf(householdId: string, entity: object, build: () => HouseholdRows): HouseholdRows {
  const hit = rowCache.get(entity);
  if (hit && hit.householdId === householdId) return hit.rows;
  const rows = build();
  rowCache.set(entity, { householdId, rows });
  return rows;
}

function memberRows(
  householdId: string,
  key: string,
  entityId: string,
  memberIds: readonly string[],
): Row[] {
  return memberIds.map((memberId) => ({
    id: `${entityId}:${memberId}`,
    household_id: householdId,
    [key]: entityId,
    member_id: memberId,
  }));
}

/**
 * Rating rows carry `updated_at` as the time of the rating (ratedAt), so a rating shows as given at
 * once (spec 0011, AC-020). Ratings go only through their RPCs; the column is never sent.
 */
function ratingRows(
  householdId: string,
  key: string,
  entityId: string,
  ratings: Record<string, number>,
  ratedAt: Record<string, string> | undefined,
): Row[] {
  return Object.entries(ratings).map(([memberId, stars]) => {
    const at = ratedAt?.[memberId];
    return {
      id: `${entityId}:${memberId}`,
      household_id: householdId,
      [key]: entityId,
      member_id: memberId,
      stars,
      ...(at ? { updated_at: at } : {}),
    };
  });
}

/** ratedAt from `updated_at` of the rating rows; undefined without any. */
function ratedAtOf(ratings: Row[]): Record<string, string> | undefined {
  const entries = ratings.flatMap((rating) =>
    typeof rating.updated_at === 'string' ? [[String(rating.member_id), rating.updated_at]] : [],
  );
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function recipeRows(householdId: string, recipe: Recipe): HouseholdRows {
  return rowsOf(householdId, recipe, () => ({
    recipes: [
      {
        id: recipe.id,
        household_id: householdId,
        kind: recipe.kind,
        title: recipe.title,
        photo: recipe.photo ?? null,
        photo_path: recipe.photoPath ?? null,
        description: recipe.description ?? null,
        servings: recipe.servings,
        total_minutes: recipe.totalMinutes ?? null,
        // A collection is inserted with course null; the column's default is for recipes (E3).
        course: recipe.course ?? null,
        cuisine: recipe.cuisine ?? null,
        tags: recipe.tags,
        variants: json(recipe.variants),
        ingredients: json(recipe.ingredients),
        steps: json(recipe.steps),
        lead_time: recipe.leadTime ? json(recipe.leadTime) : null,
        notes: recipe.notes ?? null,
        last_cooked_on: recipe.lastCookedOn ?? null,
        cooked_count: recipe.cookedCount,
        links: json(recipe.links),
        video_path: recipe.videoPath ?? null,
        ...(recipe.createdAt ? { created_at: recipe.createdAt } : {}),
        ...(recipe.updatedAt ? { updated_at: recipe.updatedAt } : {}),
      } satisfies Cached<'recipes'>,
    ],
    recipe_favorites: memberRows(householdId, 'recipe_id', recipe.id, recipe.favoriteOf),
    recipe_ratings: ratingRows(householdId, 'recipe_id', recipe.id, recipe.ratings, recipe.ratedAt),
  }));
}

function restaurantRows(householdId: string, restaurant: Restaurant): HouseholdRows {
  return rowsOf(householdId, restaurant, () => ({
    restaurants: [
      {
        id: restaurant.id,
        household_id: householdId,
        name: restaurant.name,
        address: restaurant.address ?? null,
        lat: restaurant.location?.lat ?? null,
        lng: restaurant.location?.lng ?? null,
        maps_url: restaurant.mapsUrl ?? null,
        cuisine: restaurant.cuisine ?? null,
        price_level: restaurant.priceLevel ?? null,
        tags: restaurant.tags,
        notes: restaurant.notes ?? null,
        website_url: restaurant.websiteUrl ?? null,
        photo_path: restaurant.photoPath ?? null,
        ...(restaurant.createdAt ? { created_at: restaurant.createdAt } : {}),
      } satisfies Cached<'restaurants'>,
    ],
    restaurant_favorites: memberRows(
      householdId,
      'restaurant_id',
      restaurant.id,
      restaurant.favoriteOf,
    ),
    restaurant_ratings: ratingRows(
      householdId,
      'restaurant_id',
      restaurant.id,
      restaurant.ratings,
      restaurant.ratedAt,
    ),
  }));
}

function activityRows(householdId: string, activity: Activity): HouseholdRows {
  return rowsOf(householdId, activity, () => ({
    activities: [
      {
        id: activity.id,
        household_id: householdId,
        name: activity.name,
        name_key: normalizeText(activity.name),
        description: activity.description ?? null,
        photo_path: activity.photoPath ?? null,
        place_name: activity.placeName ?? null,
        address: activity.address ?? null,
        lat: activity.location?.lat ?? null,
        lng: activity.location?.lng ?? null,
        maps_url: activity.mapsUrl ?? null,
        website_url: activity.websiteUrl ?? null,
        created_by: activity.createdBy ?? null,
        kind_id: activity.kindId ?? null,
        icon: activity.icon ?? null,
        remembered: activity.remembered,
        ...(activity.createdAt ? { created_at: activity.createdAt } : {}),
      } satisfies Cached<'activities'>,
    ],
    activity_favorites: memberRows(householdId, 'activity_id', activity.id, activity.favoriteOf),
    activity_ratings: ratingRows(
      householdId,
      'activity_id',
      activity.id,
      activity.ratings,
      activity.ratedAt,
    ),
  }));
}

function feedbackRows(householdId: string, entry: FeedbackEntry): HouseholdRows {
  return rowsOf(householdId, entry, () => ({
    feedback: [
      {
        id: entry.id,
        household_id: householdId,
        kind: entry.kind,
        text: entry.text,
        status: entry.status,
        author_id: entry.authorId || null,
        screen: entry.screen ?? null,
        reason: entry.reason ?? null,
        spec_ref: entry.specRef ?? null,
        ...(entry.createdAt ? { created_at: entry.createdAt } : {}),
      } satisfies Cached<'feedback'>,
    ],
    feedback_votes: memberRows(householdId, 'feedback_id', entry.id, entry.votes),
  }));
}

function itemRows(householdId: string, item: ShoppingItem): HouseholdRows {
  return rowsOf(householdId, item, () => ({
    shopping_items: [
      {
        id: item.id,
        household_id: householdId,
        article_id: item.articleId,
        checked: item.checked,
        checked_at: item.checkedAt ?? null,
        checked_by: item.checkedBy ?? null,
        not_available: item.notAvailable ?? false,
        checked_on_list: item.checkedOnList ?? false,
        ...(item.createdAt ? { created_at: item.createdAt } : {}),
      } satisfies Cached<'shopping_items'>,
    ],
    shopping_contributions: item.contributions.map(
      (contribution) =>
        ({
          id: contribution.id,
          household_id: householdId,
          item_id: item.id,
          source: json(contribution.source),
          count: contribution.count ?? null,
          qty: contribution.qty ?? null,
          unit: contribution.unit ?? null,
          note: contribution.note ?? null,
        }) satisfies Cached<'shopping_contributions'>,
    ),
  }));
}

function single(table: string, householdId: string, entity: object, row: () => Row): HouseholdRows {
  return rowsOf(householdId, entity, () => ({ [table]: [row()] }));
}

const areaRow = (householdId: string, area: Area) =>
  single('areas', householdId, area, () => ({
    id: area.id,
    household_id: householdId,
    name: area.name,
    sort: area.sort,
  }));

const articleRow = (householdId: string, article: Article) =>
  single('articles', householdId, article, () => ({
    id: article.id,
    household_id: householdId,
    name: article.name,
    name_key: normalizeText(article.name),
    synonyms: article.synonyms,
    synonym_keys: article.synonyms.map(normalizeText),
    area_id: article.areaId ?? null,
    diet: article.diet,
    is_pantry: article.isPantry,
    default_shopping_rule: article.defaultShoppingRule ?? null,
    needs_review: article.needsReview,
    ...(article.createdAt ? { created_at: article.createdAt } : {}),
  }));

const storeRow = (householdId: string, store: Store) =>
  single('stores', householdId, store, () => ({
    id: store.id,
    household_id: householdId,
    name: store.name,
    area_order: store.areaOrder,
    hidden_area_ids: store.hiddenAreaIds,
    maps_url: store.mapsUrl ?? null,
  }));

const planRow = (householdId: string, entry: MealPlanEntry) =>
  single('meal_plan_entries', householdId, entry, () => ({
    id: entry.id,
    household_id: householdId,
    date: entry.date,
    slot_id: entry.slotId,
    kind: entry.kind,
    recipe_id: entry.recipeId ?? null,
    restaurant_id: entry.restaurantId ?? null,
    activity_id: entry.activityId ?? null,
    text: entry.text ?? null,
    note: entry.note ?? null,
    leftovers_of_entry_id: entry.leftoversOfEntryId ?? null,
    eater_ids: entry.eaterIds,
    guests: entry.guests,
    portions: entry.portions,
    variants: json(entry.variants),
    cook_id: entry.cookId ?? null,
    sort: entry.sort,
    not_done: entry.notDone ?? false,
    starts_at: entry.startsAt === undefined ? null : toDbTime(entry.startsAt),
    reminder_day_offset: entry.reminder?.offsetDays ?? null,
    reminder_at: entry.reminder ? toDbTime(entry.reminder.at) : null,
    reminder_text: entry.reminder?.text ?? null,
  }));

const activityKindRow = (householdId: string, kind: ActivityKind) =>
  single('activity_kinds', householdId, kind, () => ({
    id: kind.id,
    household_id: householdId,
    name: kind.name,
    name_key: normalizeText(kind.name),
    icon: kind.icon,
  }));

const activitySeriesRow = (householdId: string, series: ActivitySeries) =>
  single('activity_series', householdId, series, () => ({
    id: series.id,
    household_id: householdId,
    activity_id: series.activityId,
    rule: json(series.rule),
    starts_on: series.startsOn,
    ends_on: series.endsOn ?? null,
    slot_id: series.slotId,
    starts_at: series.startsAt === undefined ? null : toDbTime(series.startsAt),
    note: series.note ?? null,
    eater_ids: series.eaterIds,
    guests: series.guests,
  }));

const seriesExceptionRow = (householdId: string, exception: ActivitySeriesException) =>
  single('activity_series_exceptions', householdId, exception, () => ({
    id: exception.id,
    household_id: householdId,
    series_id: exception.seriesId,
    on_date: exception.on,
    moved_to: exception.movedTo ?? null,
    slot_id: exception.slotId ?? null,
    starts_at: exception.startsAt === undefined ? null : toDbTime(exception.startsAt),
  }));

const collectionRecipeRow = (householdId: string, row: CollectionRecipe) =>
  single('collection_recipes', householdId, row, () => ({
    id: row.id,
    household_id: householdId,
    collection_id: row.collectionId,
    recipe_id: row.recipeId,
    servings: row.servings ?? null,
    variant_id: row.variantId ?? null,
    sort: row.sort,
  }));

const choreRow = (householdId: string, chore: Chore) =>
  single('chores', householdId, chore, () => ({
    id: chore.id,
    household_id: householdId,
    title: chore.title,
    room: chore.room ?? null,
    recurrence: json(chore.recurrence),
    assignment: json(chore.assignment),
    effort: chore.effort,
    next_due_on: chore.nextDueOn ?? null,
    next_assignee_id: chore.nextAssigneeId ?? null,
    last_done_on: chore.lastDoneOn ?? null,
    active_months: chore.activeMonths ?? null,
    due_time: chore.dueTime === undefined ? null : toDbTime(chore.dueTime),
    remind_at_due_time: chore.remindAtDueTime !== false,
  }));

/** The row of one chore as an insert of `apply_changes` takes it (spec 0011: new chores, undo). */
export function choreToRow(householdId: string, chore: Chore): Row {
  const row = choreRow(householdId, chore).chores?.[0];
  if (!row) throw new Error('chore row missing');
  return row;
}

const choreEventRow = (householdId: string, event: ChoreEvent) =>
  single('chore_events', householdId, event, () => ({
    id: event.id,
    household_id: householdId,
    chore_id: event.choreId ?? null,
    title: event.title,
    kind: event.kind,
    done_on: event.doneOn,
    done_by: event.doneBy || null,
    ...(event.createdAt ? { created_at: event.createdAt } : {}),
  }));

function tripRows(householdId: string, trip: Trip): HouseholdRows {
  return rowsOf(householdId, trip, () => ({
    trips: [
      {
        id: trip.id,
        household_id: householdId,
        from_on: trip.from,
        to_on: trip.to,
        note: trip.note ?? null,
        draft: trip.draft === true,
      } satisfies Cached<'trips'>,
    ],
    trip_members: trip.members.map(
      (member) =>
        ({
          id: member.id,
          household_id: householdId,
          trip_id: trip.id,
          member_id: member.memberId,
        }) satisfies Cached<'trip_members'>,
    ),
  }));
}

const packingBagRow = (householdId: string, bag: PackingBag) =>
  single('packing_bags', householdId, bag, () => ({
    id: bag.id,
    household_id: householdId,
    name: bag.name,
    member_id: bag.memberId ?? null,
    sort: bag.sort,
  }));

const packingBagItemRow = (householdId: string, item: PackingBagItem) =>
  single('packing_bag_items', householdId, item, () => ({
    id: item.id,
    household_id: householdId,
    bag_id: item.bagId,
    name: item.name,
    quantity: item.quantity ?? null,
    per_day: item.perDay,
    sort: item.sort,
  }));

const packingListBagRow = (householdId: string, bag: PackingListBag) =>
  single('packing_list_bags', householdId, bag, () => ({
    id: bag.id,
    household_id: householdId,
    trip_id: bag.tripId,
    bag_id: bag.bagId ?? null,
    name: bag.name,
    member_id: bag.memberId ?? null,
    sort: bag.sort,
  }));

const packingItemRow = (householdId: string, item: PackingItem) =>
  single('packing_items', householdId, item, () => ({
    id: item.id,
    household_id: householdId,
    list_bag_id: item.listBagId,
    name: item.name,
    quantity: item.quantity ?? null,
    per_day_quantity: item.perDay ?? null,
    sort: item.sort,
    packed: item.packed,
    packed_at: item.packedAt ?? null,
    packed_by: item.packedBy ?? null,
    pack_seq: item.packSeq,
    bag_item_id: item.bagItemId ?? null,
    from_bag: item.fromBag ?? false,
  }));

const settingsRow = (householdId: string, settings: NotificationSettings) =>
  single('notification_settings', householdId, settings, () => ({
    id: settings.id,
    household_id: householdId,
    member_id: settings.memberId,
    daily_summary_enabled: settings.dailySummaryEnabled,
    daily_summary_at: toDbTime(settings.dailySummaryAt),
    daily_summary_parts: settings.dailySummaryParts,
    activities_eve_enabled: settings.activitiesEveEnabled,
    activities_eve_at: toDbTime(settings.activitiesEveAt),
    chore_reminders_enabled: settings.choreRemindersEnabled,
    entry_reminders_enabled: settings.entryRemindersEnabled,
  }));

/** The row of a bag of a packing list as an insert of `apply_changes` takes it. */
export function packingListBagToRow(householdId: string, bag: PackingListBag): Row {
  const row = packingListBagRow(householdId, bag).packing_list_bags?.[0];
  if (!row) throw new Error('packing list bag row missing');
  return row;
}

function householdRows(household: Household): HouseholdRows {
  return rowsOf(household.id, household, () => ({
    households: [
      {
        id: household.id,
        name: household.name,
        meal_slots: json(household.mealSlots),
        default_store_id: household.defaultStoreId ?? null,
      },
    ],
    // household_members has no id of its own; "household:profile" like the composite tables.
    household_members: household.memberIds.map((profileId) => ({
      id: `${household.id}:${profileId}`,
      household_id: household.id,
      profile_id: profileId,
    })),
  }));
}

/** All rows of one household, by table. Unchanged domain objects give identical row objects. */
export function householdToRows(data: HouseholdData): HouseholdRows {
  const householdId = data.household.id;
  const parts: HouseholdRows[] = [
    householdRows(data.household),
    ...data.areas.map((area) => areaRow(householdId, area)),
    ...data.articles.map((article) => articleRow(householdId, article)),
    ...data.stores.map((store) => storeRow(householdId, store)),
    ...data.recipes.map((recipe) => recipeRows(householdId, recipe)),
    ...data.collectionRecipes.map((row) => collectionRecipeRow(householdId, row)),
    ...data.restaurants.map((restaurant) => restaurantRows(householdId, restaurant)),
    ...data.activityKinds.map((kind) => activityKindRow(householdId, kind)),
    ...data.activities.map((activity) => activityRows(householdId, activity)),
    ...data.activitySeries.map((series) => activitySeriesRow(householdId, series)),
    ...data.activitySeriesExceptions.map((exception) => seriesExceptionRow(householdId, exception)),
    ...data.planEntries.map((entry) => planRow(householdId, entry)),
    ...data.items.map((item) => itemRows(householdId, item)),
    ...data.chores.map((chore) => choreRow(householdId, chore)),
    ...data.choreEvents.map((event) => choreEventRow(householdId, event)),
    ...data.trips.map((trip) => tripRows(householdId, trip)),
    ...data.feedback.map((entry) => feedbackRows(householdId, entry)),
    ...data.packingBags.map((bag) => packingBagRow(householdId, bag)),
    ...data.packingBagItems.map((item) => packingBagItemRow(householdId, item)),
    ...data.packingListBags.map((bag) => packingListBagRow(householdId, bag)),
    ...data.packingItems.map((item) => packingItemRow(householdId, item)),
    ...(data.notificationSettings ? [settingsRow(householdId, data.notificationSettings)] : []),
  ];
  const result: HouseholdRows = {
    households: [],
    household_members: [],
    areas: [],
    articles: [],
    stores: [],
    recipes: [],
    recipe_favorites: [],
    recipe_ratings: [],
    // After recipes: the seed inserts in this order (seed-sql.ts).
    collection_recipes: [],
    restaurants: [],
    restaurant_favorites: [],
    restaurant_ratings: [],
    // Kinds before activities, series after them, exceptions after series (foreign keys).
    activity_kinds: [],
    activities: [],
    activity_favorites: [],
    activity_ratings: [],
    activity_series: [],
    activity_series_exceptions: [],
    meal_plan_entries: [],
    shopping_items: [],
    shopping_contributions: [],
    chores: [],
    chore_events: [],
    trips: [],
    trip_members: [],
    // Parents before children: the seed inserts in this order (seed-sql.ts).
    packing_bags: [],
    packing_bag_items: [],
    packing_list_bags: [],
    packing_items: [],
    feedback: [],
    feedback_votes: [],
    notification_settings: [],
  };
  for (const part of parts) {
    for (const [table, rows] of Object.entries(part)) {
      const target = result[table];
      if (target) target.push(...rows);
      else result[table] = [...rows];
    }
  }
  return result;
}

const profileCache = new WeakMap<Member, Row>();

/** Profiles of the given members (without email, which the domain does not carry). */
export function membersToRows(members: readonly Member[]): HouseholdRows {
  return {
    profiles: members.map((member) => {
      const hit = profileCache.get(member);
      if (hit) return hit;
      const row: Row = {
        id: member.id,
        name: member.name,
        color: member.color,
        diet_preference: member.dietPreference,
        dislikes: member.dislikes,
      };
      profileCache.set(member, row);
      return row;
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Rows → domain
// ---------------------------------------------------------------------------------------------

const entityCache = new WeakMap<object, { deps: readonly unknown[]; value: unknown }>();

function sameItems(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Builds the domain object of a row once; again only when the row or a dependency changed. */
function cached<T>(row: object, deps: readonly unknown[], build: () => T): T {
  const hit = entityCache.get(row);
  if (hit && sameItems(hit.deps, deps)) return hit.value as T;
  const value = build();
  entityCache.set(row, { deps, value });
  return value;
}

/** The previous array when it holds the same objects in the same order. */
function reuse<T>(previous: T[] | undefined, next: T[]): T[] {
  return previous && sameItems(previous, next) ? previous : next;
}

type Order = 'created' | 'newest' | 'sort' | 'doneOn';

function createdAtOf(row: Row | SmallRow): string | undefined {
  return typeof row.created_at === 'string' ? row.created_at : undefined;
}

/** -1 when a was created before b; rows without created_at are local and count as newest. */
function compareCreated(a: Row | SmallRow, b: Row | SmallRow): number {
  const left = createdAtOf(a);
  const right = createdAtOf(b);
  if (left === undefined || right === undefined) {
    return left === right ? 0 : left === undefined ? 1 : -1;
  }
  return compareTimestamps(left, right);
}

function sorted<T extends Row | SmallRow>(rows: T[], order: Order): T[] {
  const copy = [...rows];
  if (order === 'sort') return copy.sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  if (order === 'created') return copy.sort(compareCreated);
  if (order === 'newest') return copy.sort((a, b) => compareCreated(b, a));
  return copy.sort(
    (a, b) =>
      String(b.done_on ?? '').localeCompare(String(a.done_on ?? '')) || compareCreated(b, a),
  );
}

function rowsOfTable(tables: TableRows, table: string, order: Order): Row[] {
  return sorted(Object.values(tables[table] ?? {}), order);
}

function groupBy(rows: Row[], key: string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const value = String(row[key]);
    const group = groups.get(value);
    if (group) group.push(row);
    else groups.set(value, [row]);
  }
  return groups;
}

function toRecipe(row: Row, favorites: Row[], ratings: Row[]): Recipe {
  const r = row as Cached<'recipes'>;
  const kind = r.kind === 'collection' ? 'collection' : 'recipe';
  return {
    id: r.id,
    kind,
    title: r.title ?? '',
    photo: opt(r.photo),
    photoPath: opt(r.photo_path),
    description: opt(r.description),
    servings: r.servings ?? 2,
    totalMinutes: opt(r.total_minutes),
    course: kind === 'collection' ? undefined : ((r.course ?? 'main') as Recipe['course']),
    cuisine: opt(r.cuisine),
    tags: r.tags ?? [],
    variants: (r.variants ?? []) as unknown as Recipe['variants'],
    ingredients: (r.ingredients ?? []) as unknown as Recipe['ingredients'],
    steps: (r.steps ?? []) as unknown as Recipe['steps'],
    leadTime: opt(r.lead_time) as Recipe['leadTime'],
    favoriteOf: favorites.map((favorite) => String(favorite.member_id)),
    ratings: Object.fromEntries(
      ratings.map((rating) => [String(rating.member_id), Number(rating.stars)]),
    ),
    ratedAt: ratedAtOf(ratings),
    notes: opt(r.notes),
    lastCookedOn: opt(r.last_cooked_on),
    cookedCount: r.cooked_count ?? 0,
    createdAt: r.created_at ?? '',
    updatedAt: opt(r.updated_at),
    links: (r.links ?? []) as unknown as Recipe['links'],
    videoPath: opt(r.video_path),
  };
}

function toRestaurant(row: Row, favorites: Row[], ratings: Row[]): Restaurant {
  const r = row as Cached<'restaurants'>;
  return {
    id: r.id,
    name: r.name ?? '',
    address: opt(r.address),
    location:
      typeof r.lat === 'number' && typeof r.lng === 'number'
        ? { lat: r.lat, lng: r.lng }
        : undefined,
    mapsUrl: opt(r.maps_url),
    cuisine: opt(r.cuisine),
    priceLevel: opt(r.price_level) as Restaurant['priceLevel'],
    tags: r.tags ?? [],
    notes: opt(r.notes),
    websiteUrl: opt(r.website_url),
    photoPath: opt(r.photo_path),
    favoriteOf: favorites.map((favorite) => String(favorite.member_id)),
    ratings: Object.fromEntries(
      ratings.map((rating) => [String(rating.member_id), Number(rating.stars)]),
    ),
    ratedAt: ratedAtOf(ratings),
    createdAt: r.created_at ?? '',
  };
}

function toActivity(row: Row, favorites: Row[], ratings: Row[]): Activity {
  const r = row as Cached<'activities'>;
  return {
    id: r.id,
    name: r.name ?? '',
    description: opt(r.description),
    photoPath: opt(r.photo_path),
    placeName: opt(r.place_name),
    address: opt(r.address),
    location:
      typeof r.lat === 'number' && typeof r.lng === 'number'
        ? { lat: r.lat, lng: r.lng }
        : undefined,
    mapsUrl: opt(r.maps_url),
    websiteUrl: opt(r.website_url),
    favoriteOf: favorites.map((favorite) => String(favorite.member_id)),
    ratings: Object.fromEntries(
      ratings.map((rating) => [String(rating.member_id), Number(rating.stars)]),
    ),
    ratedAt: ratedAtOf(ratings),
    createdBy: opt(r.created_by),
    createdAt: r.created_at ?? '',
    kindId: opt(r.kind_id),
    icon: iconOf(r.icon),
    remembered: r.remembered !== false,
  };
}

function iconOf(value: string | null | undefined): ActivityIcon | undefined {
  return typeof value === 'string' && isActivityIcon(value) ? value : undefined;
}

function toActivityKind(row: Row): ActivityKind {
  const r = row as Cached<'activity_kinds'>;
  return { id: r.id, name: r.name ?? '', icon: iconOf(r.icon) ?? 'mountain' };
}

function toActivitySeries(row: Row): ActivitySeries | undefined {
  const r = row as Cached<'activity_series'>;
  const rule = SeriesRuleSchema.safeParse(r.rule);
  if (!rule.success || !r.activity_id || !r.starts_on || !r.slot_id) return undefined;
  return {
    id: r.id,
    activityId: r.activity_id,
    rule: rule.data,
    startsOn: r.starts_on,
    endsOn: opt(r.ends_on),
    slotId: r.slot_id,
    startsAt: fromDbTime(r.starts_at),
    note: opt(r.note),
    eaterIds: r.eater_ids ?? [],
    guests: r.guests ?? 0,
  };
}

function toSeriesException(row: Row): ActivitySeriesException {
  const r = row as Cached<'activity_series_exceptions'>;
  return {
    id: r.id,
    seriesId: r.series_id ?? '',
    on: r.on_date ?? '',
    movedTo: opt(r.moved_to),
    slotId: opt(r.slot_id),
    startsAt: fromDbTime(r.starts_at),
  };
}

function toFeedback(row: Row, votes: Row[]): FeedbackEntry {
  const r = row as Cached<'feedback'>;
  return {
    id: r.id,
    kind: r.kind as FeedbackEntry['kind'],
    text: r.text ?? '',
    status: (r.status ?? 'new') as FeedbackEntry['status'],
    authorId: r.author_id ?? '',
    createdAt: r.created_at ?? '',
    votes: votes.map((vote) => String(vote.member_id)),
    screen: opt(r.screen),
    reason: opt(r.reason),
    specRef: opt(r.spec_ref),
  };
}

function toContribution(row: Row): ShoppingContribution {
  const r = row as Cached<'shopping_contributions'>;
  return {
    id: r.id,
    source: (r.source ?? { kind: 'manual' }) as unknown as ShoppingContribution['source'],
    count: opt(r.count),
    qty: opt(r.qty),
    unit: opt(r.unit),
    note: opt(r.note),
  };
}

function toItem(row: Row, contributions: Row[], pending: boolean): ShoppingItem {
  const r = row as Cached<'shopping_items'>;
  return {
    id: r.id,
    articleId: r.article_id ?? '',
    contributions: contributions.map((contribution) =>
      cached(contribution, [], () => toContribution(contribution)),
    ),
    checked: r.checked === true,
    checkedAt: opt(r.checked_at),
    checkedBy: opt(r.checked_by),
    notAvailable: r.not_available ? true : undefined,
    ...(r.checked_on_list === true ? { checkedOnList: true } : {}),
    ...(pending ? { pendingSync: true } : {}),
    createdAt: r.created_at ?? '',
  };
}

function toArea(row: Row): Area {
  const r = row as Cached<'areas'>;
  return { id: r.id, name: r.name ?? '', sort: r.sort ?? 0 };
}

function toArticle(row: Row): Article {
  const r = row as Cached<'articles'>;
  return {
    id: r.id,
    name: r.name ?? '',
    synonyms: r.synonyms ?? [],
    areaId: opt(r.area_id),
    diet: (r.diet ?? 'unknown') as Article['diet'],
    isPantry: r.is_pantry === true,
    ...(r.default_shopping_rule
      ? { defaultShoppingRule: r.default_shopping_rule as ShoppingRule }
      : {}),
    needsReview: r.needs_review === true,
    createdAt: r.created_at ?? '',
  };
}

function toStore(row: Row): Store {
  const r = row as Cached<'stores'>;
  return {
    id: r.id,
    name: r.name ?? '',
    areaOrder: r.area_order ?? [],
    hiddenAreaIds: r.hidden_area_ids ?? [],
    mapsUrl: opt(r.maps_url),
  };
}

function toPlanEntry(row: Row): MealPlanEntry {
  const r = row as Cached<'meal_plan_entries'>;
  return {
    id: r.id,
    date: r.date ?? null,
    slotId: r.slot_id ?? '',
    kind: r.kind as MealPlanEntry['kind'],
    recipeId: opt(r.recipe_id),
    restaurantId: opt(r.restaurant_id),
    activityId: opt(r.activity_id),
    text: opt(r.text),
    note: opt(r.note),
    leftoversOfEntryId: opt(r.leftovers_of_entry_id),
    eaterIds: r.eater_ids ?? [],
    guests: r.guests ?? 0,
    portions: r.portions ?? 0,
    variants: (r.variants ?? []) as unknown as MealPlanEntry['variants'],
    cookId: opt(r.cook_id),
    sort: r.sort ?? 0,
    notDone: r.not_done ? true : undefined,
    startsAt: fromDbTime(r.starts_at),
    reminder: toReminder(r),
  };
}

/** The three reminder columns; incomplete ones (the database refuses them) are no reminder. */
function toReminder(r: Cached<'meal_plan_entries'>): MealPlanEntry['reminder'] {
  const at = fromDbTime(r.reminder_at);
  if (at === undefined || r.reminder_day_offset == null) return undefined;
  return {
    offsetDays: r.reminder_day_offset,
    at,
    ...(r.reminder_text == null ? {} : { text: r.reminder_text }),
  };
}

function toChore(row: Row): Chore {
  const r = row as Cached<'chores'>;
  return {
    id: r.id,
    title: r.title ?? '',
    room: opt(r.room),
    recurrence: r.recurrence as unknown as Chore['recurrence'],
    assignment: r.assignment as unknown as Chore['assignment'],
    effort: (r.effort ?? 1) as Chore['effort'],
    nextDueOn: opt(r.next_due_on),
    nextAssigneeId: opt(r.next_assignee_id),
    lastDoneOn: opt(r.last_done_on),
    activeMonths: opt(r.active_months),
    dueTime: fromDbTime(r.due_time),
    // Undefined is on, the default (spec 0027, REQ-009).
    remindAtDueTime: r.remind_at_due_time === false ? false : undefined,
  };
}

function toChoreEvent(row: Row): ChoreEvent {
  const r = row as Cached<'chore_events'>;
  return {
    id: r.id,
    choreId: opt(r.chore_id),
    title: r.title ?? '',
    kind: r.kind as ChoreEvent['kind'],
    doneOn: r.done_on ?? '',
    doneBy: r.done_by ?? '',
    createdAt: opt(r.created_at),
    previous: r.prev_recorded
      ? {
          nextDueOn: opt(r.prev_next_due_on),
          lastDoneOn: opt(r.prev_last_done_on),
          nextAssigneeId: opt(r.prev_next_assignee_id),
        }
      : undefined,
  };
}

function toTrip(row: Row, members: Row[]): Trip {
  const r = row as Cached<'trips'>;
  return {
    id: r.id,
    from: r.from_on ?? '',
    to: r.to_on ?? '',
    note: opt(r.note),
    members: members.map((member) => ({ id: member.id, memberId: String(member.member_id) })),
    ...(r.draft === true ? { draft: true } : {}),
  };
}

function toCollectionRecipe(row: Row): CollectionRecipe {
  const r = row as Cached<'collection_recipes'>;
  return {
    id: r.id,
    collectionId: r.collection_id ?? '',
    recipeId: r.recipe_id ?? '',
    servings: opt(r.servings),
    variantId: opt(r.variant_id),
    sort: r.sort ?? 0,
  };
}

function toPackingBag(row: Row): PackingBag {
  const r = row as Cached<'packing_bags'>;
  return { id: r.id, name: r.name ?? '', memberId: opt(r.member_id), sort: r.sort ?? 0 };
}

function toPackingBagItem(row: Row): PackingBagItem {
  const r = row as Cached<'packing_bag_items'>;
  return {
    id: r.id,
    bagId: r.bag_id ?? '',
    name: r.name ?? '',
    quantity: opt(r.quantity),
    perDay: r.per_day === true,
    sort: r.sort ?? 0,
  };
}

function toPackingListBag(row: Row): PackingListBag {
  const r = row as Cached<'packing_list_bags'>;
  return {
    id: r.id,
    tripId: r.trip_id ?? '',
    bagId: opt(r.bag_id),
    name: r.name ?? '',
    memberId: opt(r.member_id),
    sort: r.sort ?? 0,
  };
}

function toPackingItem(row: Row): PackingItem {
  const r = row as Cached<'packing_items'>;
  return {
    id: r.id,
    listBagId: r.list_bag_id ?? '',
    name: r.name ?? '',
    quantity: opt(r.quantity),
    perDay: opt(r.per_day_quantity),
    packed: r.packed === true,
    packedAt: opt(r.packed_at),
    packedBy: opt(r.packed_by),
    packSeq: r.pack_seq ?? 0,
    sort: r.sort ?? 0,
    bagItemId: opt(r.bag_item_id),
    fromBag: r.from_bag === true,
  };
}

function toNotificationSettings(row: Row): NotificationSettings {
  const r = row as Cached<'notification_settings'>;
  return {
    id: r.id,
    memberId: r.member_id ?? '',
    dailySummaryEnabled: r.daily_summary_enabled === true,
    dailySummaryAt: fromDbTime(r.daily_summary_at) ?? '07:30',
    dailySummaryParts: (r.daily_summary_parts ?? []) as NotificationSettings['dailySummaryParts'],
    activitiesEveEnabled: r.activities_eve_enabled === true,
    activitiesEveAt: fromDbTime(r.activities_eve_at) ?? '19:00',
    choreRemindersEnabled: r.chore_reminders_enabled === true,
    entryRemindersEnabled: r.entry_reminders_enabled !== false,
  };
}

function plain<T>(tables: TableRows, table: string, order: Order, build: (row: Row) => T): T[] {
  return rowsOfTable(tables, table, order).map((row) => cached(row, [], () => build(row)));
}

function toHousehold(row: SmallRow, members: SmallRow[]): Household {
  const r = row as Partial<Tables<'households'>>;
  return {
    id: String(r.id),
    name: r.name ?? '',
    memberIds: members.map((member) => String(member.profile_id)),
    // Sorted once here, so every screen can take them as they come (spec 0031, C-15).
    mealSlots: [...((r.meal_slots ?? []) as unknown as Household['mealSlots'])].sort(
      (a, b) => a.sort - b.sort,
    ),
    defaultStoreId: opt(r.default_store_id),
    timeZone: r.timezone ?? HOUSEHOLD_TIME_ZONE_DEFAULT,
  };
}

export interface RowsToHouseholdOptions {
  /** The household built last time; arrays and the object itself are reused when unchanged. */
  previous?: HouseholdData;
  /** Items with a store action not yet confirmed by the server. */
  pendingItemIds?: ReadonlySet<string>;
  /** The signed-in member: her row of `notification_settings` is `notificationSettings`. */
  memberId?: string;
}

/**
 * The domain view of one household's rows. Unchanged rows give the same domain objects (cached
 * per row object), so `useSyncExternalStore` selectors only see what really changed.
 */
export function rowsToHousehold(
  tables: TableRows,
  small: Record<string, SmallRow[]>,
  householdId: string,
  options: RowsToHouseholdOptions = {},
): HouseholdData {
  const { previous, pendingItemIds, memberId } = options;
  const householdRow = (small.households ?? []).find((row) => row.id === householdId);
  if (!householdRow) throw new Error(`Household ${householdId} is not in the cache`);
  const memberRows = sorted(
    (small.household_members ?? []).filter((row) => row.household_id === householdId),
    'created',
  );
  const household = cached(householdRow, memberRows, () => toHousehold(householdRow, memberRows));

  const favorites = groupBy(rowsOfTable(tables, 'recipe_favorites', 'created'), 'recipe_id');
  const ratings = groupBy(rowsOfTable(tables, 'recipe_ratings', 'created'), 'recipe_id');
  const recipes = rowsOfTable(tables, 'recipes', 'newest').map((row) => {
    const rowFavorites = favorites.get(row.id) ?? [];
    const rowRatings = ratings.get(row.id) ?? [];
    return cached(row, [...rowFavorites, null, ...rowRatings], () =>
      toRecipe(row, rowFavorites, rowRatings),
    );
  });

  const restaurantFavorites = groupBy(
    rowsOfTable(tables, 'restaurant_favorites', 'created'),
    'restaurant_id',
  );
  const restaurantRatings = groupBy(
    rowsOfTable(tables, 'restaurant_ratings', 'created'),
    'restaurant_id',
  );
  const restaurants = rowsOfTable(tables, 'restaurants', 'newest').map((row) => {
    const rowFavorites = restaurantFavorites.get(row.id) ?? [];
    const rowRatings = restaurantRatings.get(row.id) ?? [];
    return cached(row, [...rowFavorites, null, ...rowRatings], () =>
      toRestaurant(row, rowFavorites, rowRatings),
    );
  });

  const activityFavorites = groupBy(
    rowsOfTable(tables, 'activity_favorites', 'created'),
    'activity_id',
  );
  const activityRatings = groupBy(
    rowsOfTable(tables, 'activity_ratings', 'created'),
    'activity_id',
  );
  const activities = rowsOfTable(tables, 'activities', 'newest').map((row) => {
    const rowFavorites = activityFavorites.get(row.id) ?? [];
    const rowRatings = activityRatings.get(row.id) ?? [];
    return cached(row, [...rowFavorites, null, ...rowRatings], () =>
      toActivity(row, rowFavorites, rowRatings),
    );
  });

  const votes = groupBy(rowsOfTable(tables, 'feedback_votes', 'created'), 'feedback_id');
  const feedback = rowsOfTable(tables, 'feedback', 'newest').map((row) => {
    const rowVotes = votes.get(row.id) ?? [];
    return cached(row, rowVotes, () => toFeedback(row, rowVotes));
  });

  const contributions = groupBy(
    rowsOfTable(tables, 'shopping_contributions', 'created'),
    'item_id',
  );
  const items = rowsOfTable(tables, 'shopping_items', 'created').map((row) => {
    const rowContributions = contributions.get(row.id) ?? [];
    const pending = pendingItemIds?.has(row.id) === true;
    return cached(row, [...rowContributions, pending], () =>
      toItem(row, rowContributions, pending),
    );
  });

  const tripMembers = groupBy(rowsOfTable(tables, 'trip_members', 'created'), 'trip_id');
  const trips = rowsOfTable(tables, 'trips', 'created').map((row) => {
    const rowMembers = tripMembers.get(row.id) ?? [];
    return cached(row, rowMembers, () => toTrip(row, rowMembers));
  });

  const ownSettings = Object.values(tables.notification_settings ?? {}).find(
    (row) => memberId !== undefined && row.member_id === memberId,
  );
  const notificationSettings = ownSettings
    ? cached(ownSettings, [], () => toNotificationSettings(ownSettings))
    : undefined;

  const next: HouseholdData = {
    household,
    areas: reuse(previous?.areas, plain(tables, 'areas', 'sort', toArea)),
    articles: reuse(previous?.articles, plain(tables, 'articles', 'created', toArticle)),
    stores: reuse(previous?.stores, plain(tables, 'stores', 'created', toStore)),
    recipes: reuse(previous?.recipes, recipes),
    collectionRecipes: reuse(
      previous?.collectionRecipes,
      plain(tables, 'collection_recipes', 'created', toCollectionRecipe),
    ),
    restaurants: reuse(previous?.restaurants, restaurants),
    activities: reuse(previous?.activities, activities),
    activityKinds: reuse(
      previous?.activityKinds,
      plain(tables, 'activity_kinds', 'created', toActivityKind),
    ),
    activitySeries: reuse(
      previous?.activitySeries,
      rowsOfTable(tables, 'activity_series', 'created').flatMap(
        (row) => cached(row, [], () => toActivitySeries(row)) ?? [],
      ),
    ),
    activitySeriesExceptions: reuse(
      previous?.activitySeriesExceptions,
      plain(tables, 'activity_series_exceptions', 'created', toSeriesException),
    ),
    planEntries: reuse(
      previous?.planEntries,
      plain(tables, 'meal_plan_entries', 'created', toPlanEntry),
    ),
    items: reuse(previous?.items, items),
    chores: reuse(previous?.chores, plain(tables, 'chores', 'created', toChore)),
    choreEvents: reuse(
      previous?.choreEvents,
      plain(tables, 'chore_events', 'doneOn', toChoreEvent),
    ),
    trips: reuse(previous?.trips, trips),
    feedback: reuse(previous?.feedback, feedback),
    packingBags: reuse(
      previous?.packingBags,
      plain(tables, 'packing_bags', 'created', toPackingBag),
    ),
    packingBagItems: reuse(
      previous?.packingBagItems,
      plain(tables, 'packing_bag_items', 'created', toPackingBagItem),
    ),
    packingListBags: reuse(
      previous?.packingListBags,
      plain(tables, 'packing_list_bags', 'created', toPackingListBag),
    ),
    packingItems: reuse(
      previous?.packingItems,
      plain(tables, 'packing_items', 'created', toPackingItem),
    ),
    notificationSettings,
  };
  if (
    previous &&
    (Object.keys(next) as (keyof HouseholdData)[]).every((key) => next[key] === previous[key])
  ) {
    return previous;
  }
  return next;
}

/** Everyone whose profile the user can see (own and co-members), in sign-up order. */
export function rowsToMembers(small: Record<string, SmallRow[]>, previous?: Member[]): Member[] {
  const members = sorted(small.profiles ?? [], 'created').map((row) =>
    cached(row, [], () => {
      const r = row as Partial<Tables<'profiles'>>;
      return {
        id: String(r.id),
        name: r.name ?? '',
        color: r.color ?? '',
        dietPreference: (r.diet_preference ?? 'flexible') as Member['dietPreference'],
        dislikes: r.dislikes ?? [],
      } satisfies Member;
    }),
  );
  return reuse(previous, members);
}
