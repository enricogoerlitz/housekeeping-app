import {
  checkEntryNote,
  checkEntryText,
  cleanReminderText,
  collectionContributions,
  collectionDiet,
  contentsInBook,
  contributionsFromEntry,
  eatersForDay,
  dietFitsPreference,
  entryListShare,
  EntryReminderSchema,
  MAX_ENTRY_NOTE,
  MAX_GUESTS,
  MAX_PORTIONS,
  recomputeEntryContributions,
  removeEntryContributions,
  splitVariants,
  validateReminder,
  type EntryReminder,
  type FieldCheck,
  type Id,
  type ISODate,
  type MealPlanEntry,
  type PlanEntryVariant,
  type RecipeKind,
  relabelForDay,
  type ShoppingItem,
  type TimeOfDay,
  type VariantSplit,
} from '@housekeeping/core';

import { createActivity, type ActivityDraft } from './commands-activities';
import { createRecipe } from './commands-recipes';
import { createRestaurant, type RestaurantDraft } from './commands-restaurants';
import { commitEntriesWithList } from './list-additions';
import { indexById } from './queries';
import {
  commit,
  commitConfirmed,
  getData,
  getState,
  isOffline,
  newId,
  nowISO,
  OfflineError,
  updateData,
} from './store';
import { checkTime } from './times';
import { TransportError } from './transport';

/** meal_plan_entries_note_length. */
export const NOTE_MAX_LENGTH = MAX_ENTRY_NOTE;

/** The hint when the server refuses an entry because its recipe was deleted (spec 0008, E6). */
export const RECIPE_GONE_MESSAGE = 'Das Rezept gibt es nicht mehr';

/** Planning a restaurant or an activity deleted meanwhile (spec 0024, AC-020, AC-022). */
export const RESTAURANT_GONE_MESSAGE = 'Das Restaurant gibt es nicht mehr.';
export const ACTIVITY_GONE_MESSAGE = 'Die Aktivität gibt es nicht mehr.';

const GONE_MESSAGES: Record<string, string> = {
  meal_plan_entries_recipe_fkey: RECIPE_GONE_MESSAGE,
  meal_plan_entries_restaurant_fkey: RESTAURANT_GONE_MESSAGE,
  meal_plan_entries_activity_fkey: ACTIVITY_GONE_MESSAGE,
};

/** E6: the entry's recipe, restaurant or activity was deleted meanwhile (its foreign key). */
function recipeGone(error: unknown): string | undefined {
  return error instanceof TransportError && error.code === '23503' && error.constraint
    ? GONE_MESSAGES[error.constraint]
    : undefined;
}

export interface PlanEntryInput {
  /** null = "vorgemerkt", without a day. */
  date: ISODate | null;
  slotId: Id;
  kind: MealPlanEntry['kind'];
  recipeId?: Id;
  restaurantId?: Id;
  activityId?: Id;
  text?: string;
  /** Zusatz of any kind: "Eislaufen (Hohenschönhausen)", "Lasagne (doppelte Menge)". */
  note?: string;
  /** Spec 0021, REQ-013: "Uhrzeit (optional)", only for restaurants and activities. */
  startsAt?: TimeOfDay;
  leftoversOfEntryId?: Id;
  eaterIds: Id[];
  guests?: number;
  portions?: number;
  variants?: PlanEntryVariant[];
  cookId?: Id;
  /** Spec 0017: "Erinnern", only with a day (REQ-001). */
  reminder?: EntryReminderInput;
}

/**
 * "Erinnern" as the form has it (spec 0017): days before the entry's day, the typed time and the
 * typed "Woran erinnern?" (trimmed; empty is no text).
 */
export interface EntryReminderInput {
  offsetDays: number;
  at: string;
  text?: string;
}

/**
 * The reminder to store, checked like the database (REQ-003, REQ-004, AC-013, AC-015) in the
 * household's time zone (Decision 5). Throws the hint of the field: "Liegt in der Vergangenheit",
 * the time field's messages, "Höchstens 80 Zeichen", "Ohne Zeilenumbrüche". The moment is judged
 * only when day or time change, like the database: a text alone may change once it has passed.
 */
function checkedReminder(
  entry: Pick<MealPlanEntry, 'date' | 'reminder'>,
  input: EntryReminderInput,
): EntryReminder {
  if (entry.date === null) throw new Error('Ohne Tag gibt es keine Erinnerung');
  const text = cleanReminderText(input.text ?? '');
  if (!text.ok) throw new Error(text.error);
  const same = entry.reminder?.offsetDays === input.offsetDays && entry.reminder.at === input.at;
  const validation = same
    ? undefined
    : validateReminder({
        entryDate: entry.date,
        offsetDays: input.offsetDays,
        time: input.at,
        now: new Date(),
        timeZone: getData().household.timeZone,
      });
  if (validation && !validation.ok) throw new Error(validation.error);
  return EntryReminderSchema.parse({
    offsetDays: input.offsetDays,
    at: validation?.reminder.at ?? input.at,
    ...(text.text === undefined ? {} : { text: text.text }),
  });
}

/** Who eats by default: every member of the household, trips or not (spec 0030, REQ-008). */
export function defaultEaterIds(): Id[] {
  const data = getData();
  return eatersForDay(
    getState().members.filter((member) => data.household.memberIds.includes(member.id)),
  );
}

/**
 * Portions and variant split for a recipe and the chosen eaters (one portion per person). A
 * collection has no split (spec 0009, E8, AC-016): eaters plus guests, no variants; who does not
 * fit the diet of everything in it is a misfit.
 */
export function splitForEaters(recipeId: Id, eaterIds: Id[], guests: number): VariantSplit {
  const data = getData();
  const recipe = data.recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) throw new Error('Rezept nicht gefunden');
  const eaters = getState().members.filter((member) => eaterIds.includes(member.id));
  const articlesById = indexById(data.articles);
  if (recipe.kind === 'collection') {
    const contents = contentsInBook(recipe, {
      recipesById: indexById(data.recipes),
      collectionRecipes: data.collectionRecipes,
    });
    const diet = collectionDiet(recipe, contents, articlesById);
    return {
      portions: eaters.length + Math.max(0, guests),
      variants: [],
      misfitMemberIds:
        diet === 'unknown'
          ? []
          : eaters
              .filter((member) => !dietFitsPreference(diet, member.dietPreference))
              .map((member) => member.id),
    };
  }
  return splitVariants(recipe, eaters, guests, articlesById);
}

/** Where and for whom something new is planned (create while planning, REQ-008). */
export type PlanSlotInput = Omit<
  PlanEntryInput,
  'kind' | 'recipeId' | 'restaurantId' | 'activityId' | 'text' | 'leftoversOfEntryId'
>;

/** The trimmed Zusatz (empty → none); the hint of checkEntryNote otherwise (REQ-008). */
function cleanNote(note: string | undefined): string | undefined {
  return fieldValue(checkEntryNote(note ?? ''));
}

/**
 * Adds a dish to a meal. A meal can hold several dishes, each with its own cook. When the server
 * refuses it because the recipe was deleted meanwhile, the hint is "Das Rezept gibt es nicht
 * mehr" (spec 0008, E6).
 */
export function addPlanEntry(input: PlanEntryInput): Id {
  const data = getData();
  if (input.kind === 'recipe' && !data.recipes.some((recipe) => recipe.id === input.recipeId)) {
    throw new Error('Rezept nicht gefunden');
  }
  if (
    input.kind === 'restaurant' &&
    !data.restaurants.some((restaurant) => restaurant.id === input.restaurantId)
  ) {
    throw new Error('Restaurant nicht gefunden');
  }
  if (
    input.kind === 'activity' &&
    !data.activities.some((activity) => activity.id === input.activityId)
  ) {
    throw new Error('Aktivität nicht gefunden');
  }
  const text = input.kind === 'text' ? fieldValue(checkEntryText(input.text ?? '')) : input.text;
  const note = cleanNote(input.note);
  const timed = input.kind === 'restaurant' || input.kind === 'activity';
  checkTime(input.startsAt);
  const reminder = input.reminder
    ? checkedReminder({ date: input.date }, input.reminder)
    : undefined;
  const guests = input.guests ?? 0;
  const split =
    input.kind === 'recipe' && input.recipeId && !input.variants
      ? splitForEaters(input.recipeId, input.eaterIds, guests)
      : undefined;
  const siblings = data.planEntries.filter(
    (entry) => entry.date === input.date && entry.slotId === input.slotId,
  );
  return commit({ path: 'diff', rejectedMessage: recipeGone }, () => {
    const entry: MealPlanEntry = {
      id: newId(),
      date: input.date,
      slotId: input.slotId,
      kind: input.kind,
      recipeId: input.recipeId,
      restaurantId: input.restaurantId,
      activityId: input.kind === 'activity' ? input.activityId : undefined,
      text: text?.trim(),
      note,
      startsAt: timed ? input.startsAt : undefined,
      leftoversOfEntryId: input.leftoversOfEntryId,
      eaterIds: input.eaterIds,
      guests,
      portions: input.portions ?? split?.portions ?? Math.max(1, input.eaterIds.length + guests),
      variants: input.variants ?? split?.variants ?? [],
      cookId: input.cookId,
      sort: siblings.length,
      reminder,
    };
    updateData((current) => ({ ...current, planEntries: [...current.planEntries, entry] }));
    return entry.id;
  });
}

/**
 * Changes an entry. The Zusatz is trimmed (empty removes it). An entry that is no longer an
 * activity loses its activity; one that is neither restaurant nor activity loses its time
 * (meal_plan_entries_starts_at_only_timed).
 */
export function updatePlanEntry(
  entryId: Id,
  patch: Partial<
    Pick<
      MealPlanEntry,
      | 'eaterIds'
      | 'guests'
      | 'portions'
      | 'variants'
      | 'cookId'
      | 'notDone'
      | 'text'
      | 'note'
      | 'kind'
      | 'recipeId'
      | 'restaurantId'
      | 'activityId'
    >
  >,
): void {
  const clean = { ...patch };
  if ('note' in patch) clean.note = cleanNote(patch.note);
  if (
    patch.activityId !== undefined &&
    !getData().activities.some((activity) => activity.id === patch.activityId)
  ) {
    throw new Error('Aktivität nicht gefunden');
  }
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      planEntries: data.planEntries.map((entry) => {
        if (entry.id !== entryId) return entry;
        const next = { ...entry, ...clean };
        const timed = next.kind === 'restaurant' || next.kind === 'activity';
        const withTime = timed ? next : { ...next, startsAt: undefined };
        return withTime.kind === 'activity' ? withTime : { ...withTime, activityId: undefined };
      }),
    })),
  );
}

/**
 * What the window of an entry saves when it closes (spec 0021, REQ-009): the typed fields, who
 * eats and how much, and the text of the reminder. Leaving a field out leaves it as it is.
 */
export interface EntryFields {
  /** "Was gibt es?" of a free text. */
  text?: string;
  /** "Zusatz"; empty removes it. */
  note?: string;
  /** "Uhrzeit (optional)" of a restaurant or activity; null removes it. */
  startsAt?: TimeOfDay | null;
  eaterIds?: Id[];
  guests?: number;
  portions?: number;
  /** Rows of every variant as the counters show them; rows with 0 are not stored. */
  variants?: PlanEntryVariant[];
  /** "Woran erinnern?" of the reminder as typed (empty: no text); only with a reminder. */
  reminderText?: string;
}

function fieldValue(check: FieldCheck): string | undefined {
  if (!check.ok) throw new Error(check.error);
  return check.value;
}

/**
 * Saves what the window of an entry holds when it closes (spec 0021, REQ-009), in one call: the
 * fields, and when portions or variants change the entry's contributions on open items of the
 * shopping list follow (REQ-007, recomputeEntryContributions), all or nothing (ADR-0011). Throws
 * the field's hint ("Bitte etwas eintragen", "Höchstens 120 Zeichen", "Ohne Zeilenumbrüche",
 * "Keine gültige Uhrzeit", the reminder's hints), "Den Eintrag gibt es nicht mehr" and
 * OfflineError before anything changes. Resolves once the server took it with the Herkunft of the
 * contributions that followed ("Lasagne (Sa)"), or undefined; rejects when it refused it (the entry
 * and the list spring back, onWriteRejected reports the general hint), so the window can stay
 * open (AC-027). Nothing changed resolves at once and sends nothing.
 */
export function saveEntry(entryId: Id, fields: EntryFields): Promise<string | undefined> {
  const data = getData();
  const entry = data.planEntries.find((candidate) => candidate.id === entryId);
  if (!entry) throw new Error('Den Eintrag gibt es nicht mehr');
  const next: MealPlanEntry = { ...entry };
  if (fields.text !== undefined && entry.kind === 'text') {
    next.text = fieldValue(checkEntryText(fields.text));
  }
  if (fields.note !== undefined) next.note = fieldValue(checkEntryNote(fields.note));
  if (fields.startsAt !== undefined && (entry.kind === 'restaurant' || entry.kind === 'activity')) {
    checkTime(fields.startsAt);
    next.startsAt = fields.startsAt ?? undefined;
  }
  if (fields.eaterIds !== undefined) next.eaterIds = [...fields.eaterIds];
  if (fields.guests !== undefined) next.guests = fields.guests;
  if (fields.portions !== undefined) next.portions = fields.portions;
  if (fields.variants !== undefined) {
    next.variants = fields.variants.filter((row) => row.portions > 0);
  }
  if (fields.reminderText !== undefined && entry.reminder) {
    next.reminder = checkedReminder(entry, {
      offsetDays: entry.reminder.offsetDays,
      at: entry.reminder.at,
      text: fields.reminderText,
    });
  }
  if (
    next.guests < 0 ||
    next.guests > MAX_GUESTS ||
    next.portions < 0 ||
    next.portions > MAX_PORTIONS
  ) {
    throw new Error('Hat nicht geklappt – bitte noch einmal versuchen');
  }
  if (JSON.stringify(next) === JSON.stringify(entry)) return Promise.resolve(undefined);
  if (isOffline()) throw new OfflineError();

  const amountsChanged =
    next.portions !== entry.portions ||
    JSON.stringify(next.variants) !== JSON.stringify(entry.variants);
  const share = amountsChanged ? entryListShare(data.items, entryId) : undefined;
  const followed = share ? followedItems(next) : undefined;
  const writeEntry = () =>
    updateData((current) => ({
      ...current,
      planEntries: current.planEntries.map((candidate) =>
        candidate.id === entryId ? next : candidate,
      ),
    }));
  if (share && followed?.changed) {
    // The list follows in the same call, however many ingredients (replace_entry_contributions).
    const { confirmed } = commitEntriesWithList(
      { entryIds: [entryId], rejectedMessage: recipeGone },
      writeEntry,
      () => followed,
    );
    return confirmed.then(() => share.label);
  }
  const confirmed = commitConfirmed({ path: 'diff', rejectedMessage: recipeGone }, writeEntry).then(
    () => undefined,
  );
  // The caller may not wait for it; a refusal is reported through onWriteRejected anyway.
  confirmed.catch(() => {});
  return confirmed;
}

/**
 * The shopping list after the entry's portions or variants changed (REQ-007): what "Auf die
 * Einkaufsliste" would put on it for the new state, on the open items (spec 0025 adapts the rule
 * in core, not here).
 */
function followedItems(entry: MealPlanEntry): ReturnType<typeof recomputeEntryContributions> {
  const data = getData();
  const recipe = entry.recipeId
    ? data.recipes.find((candidate) => candidate.id === entry.recipeId)
    : undefined;
  if (entry.kind !== 'recipe' || !recipe) {
    return { items: data.items, changed: false, additions: [] };
  }
  const articlesById = indexById(data.articles);
  const planned =
    recipe.kind === 'collection'
      ? collectionContributions(
          recipe,
          contentsInBook(recipe, {
            recipesById: indexById(data.recipes),
            collectionRecipes: data.collectionRecipes,
          }),
          articlesById,
          { portions: entry.portions, entry },
        )
      : contributionsFromEntry(entry, recipe, articlesById, '');
  return recomputeEntryContributions({
    items: data.items,
    entryId: entry.id,
    planned,
    articlesById,
    newId,
    now: nowISO(),
  });
}

/**
 * "Erinnern" of an entry (spec 0017, REQ-002): sets or changes the reminder, null switches it off.
 * One patch of the three columns, refused offline (OfflineError). Throws before sending for an
 * entry without a day or one that is gone, and with the hints of `checkedReminder`. When the
 * entry was removed on another device meanwhile, the server refuses it and onWriteRejected
 * reports the general hint (AC-008). Resolves once the server took it and rejects when it refused
 * it, so "Fertig" can stay open (spec 0018, AC-009); a caller that does not wait may ignore it.
 */
export function setEntryReminder(entryId: Id, input: EntryReminderInput | null): Promise<void> {
  const entry = getData().planEntries.find((candidate) => candidate.id === entryId);
  if (!entry) throw new Error('Den Eintrag gibt es nicht mehr');
  const reminder = input === null ? undefined : checkedReminder(entry, input);
  if (isOffline()) throw new OfflineError();
  const confirmed = commitConfirmed({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      planEntries: data.planEntries.map((candidate) =>
        candidate.id === entryId ? { ...candidate, reminder } : candidate,
      ),
    })),
  );
  confirmed.catch(() => {});
  return confirmed;
}

/**
 * Moves a dish to another day (or to "vorgemerkt" with date null) and optionally another meal.
 * The reminder keeps its distance in days and so moves along (spec 0017, AC-021); "vorgemerkt"
 * clears it in the same patch (AC-023), and undo brings date and reminder back together. Its
 * contributions on the shopping list stay and their Herkunft names the new day, "Mango-Curry
 * (So)" (spec 0016, AC-017); all in the same call.
 */
export function movePlanEntry(entryId: Id, date: ISODate | null, slotId?: Id): void {
  commit({ path: 'diff' }, () =>
    updateData((data) => {
      const entry = data.planEntries.find((candidate) => candidate.id === entryId);
      if (!entry) return data;
      const targetSlot = slotId ?? entry.slotId;
      const siblings = data.planEntries.filter(
        (candidate) =>
          candidate.id !== entryId && candidate.date === date && candidate.slotId === targetSlot,
      );
      return {
        ...data,
        planEntries: data.planEntries.map((candidate) =>
          candidate.id === entryId
            ? {
                ...candidate,
                date,
                slotId: targetSlot,
                sort: siblings.length,
                ...(date === null ? { reminder: undefined } : {}),
              }
            : candidate,
        ),
        items: entry.date === date ? data.items : relabelContributions(data.items, entryId, date),
      };
    }),
  );
}

function relabelContributions(
  items: readonly ShoppingItem[],
  entryId: Id,
  date: ISODate | null,
): ShoppingItem[] {
  return items.map((item) =>
    item.contributions.some(
      (contribution) =>
        contribution.source.kind === 'recipe' && contribution.source.entryId === entryId,
    )
      ? {
          ...item,
          contributions: item.contributions.map((contribution) =>
            contribution.source.kind === 'recipe' && contribution.source.entryId === entryId
              ? {
                  ...contribution,
                  source: {
                    ...contribution.source,
                    label: relabelForDay(contribution.source.label, date),
                  },
                }
              : contribution,
          ),
        }
      : item,
  );
}

/**
 * Removes a dish. Leftovers of it that name no recipe go with it: without their dish they would
 * mean nothing, and the database refuses leftovers without recipe and dish. Leftovers with a
 * recipe stay (the server clears their link). With `withList` ("Zutaten auch von der Liste
 * nehmen", spec 0021, REQ-015) the entry's contributions on open items go in the same call, an
 * item left empty with them; other contributions and checked items stay (AC-041). Returns the
 * number of items it took contributions from.
 */
export function removePlanEntry(entryId: Id, options: { withList?: boolean } = {}): number {
  const data = getData();
  const removed = new Set([
    entryId,
    ...data.planEntries
      .filter((entry) => entry.leftoversOfEntryId === entryId && !entry.recipeId)
      .map((entry) => entry.id),
  ]);
  const share = options.withList ? entryListShare(data.items, entryId) : undefined;
  const dropEntries = () =>
    updateData((current) => ({
      ...current,
      planEntries: current.planEntries.filter((entry) => !removed.has(entry.id)),
    }));
  if (!share) {
    commit({ path: 'diff', maxDeletes: { meal_plan_entries: removed.size } }, dropEntries);
    return 0;
  }
  // "Zutaten auch von der Liste nehmen": one call however many ingredients
  // (replace_entry_contributions without additions); undo brings entry and contributions back.
  commitEntriesWithList(
    { entryIds: [entryId], maxDeletes: { meal_plan_entries: removed.size } },
    dropEntries,
    (current) => ({ items: removeEntryContributions(current.items, entryId), additions: [] }),
  );
  return share.articles;
}

// ---------- Create while planning (spec 0004, REQ-008) ----------
// The new entity and its plan entry are one command, so one apply_changes call: both or neither.
// Validation errors ("Name fehlt", "Titel fehlt", "Gibt es schon: …") come before anything changes.

/** A new activity, planned right away (AC-021, AC-023). */
export function createAndPlanActivity(
  draft: ActivityDraft,
  plan: PlanSlotInput,
): { activityId: Id; entryId: Id } {
  return commit({ path: 'diff' }, () => {
    const activityId = createActivity(draft);
    const entryId = addPlanEntry({ ...plan, kind: 'activity', activityId });
    return { activityId, entryId };
  });
}

/**
 * A new recipe (a title is enough), planned right away (AC-022); with `kind` "collection" a new,
 * empty collection ("„Sommerfest“ als Sammlung anlegen", spec 0009, AC-021).
 */
export function createAndPlanRecipe(
  input: { title: string; servings?: number; kind?: RecipeKind },
  plan: PlanSlotInput,
): { recipeId: Id; entryId: Id } {
  return commit({ path: 'diff' }, () => {
    const recipeId = createRecipe(input);
    const entryId = addPlanEntry({ ...plan, kind: 'recipe', recipeId });
    return { recipeId, entryId };
  });
}

/**
 * A new restaurant, planned right away (AC-022). A short map link is resolved before
 * (resolveMapsShortLink, async), so that this stays one change.
 */
export function createAndPlanRestaurant(
  draft: RestaurantDraft,
  plan: PlanSlotInput,
): { restaurantId: Id; entryId: Id } {
  return commit({ path: 'diff' }, () => {
    const restaurantId = createRestaurant(draft);
    const entryId = addPlanEntry({ ...plan, kind: 'restaurant', restaurantId });
    return { restaurantId, entryId };
  });
}
