import {
  cleanReminderText,
  collectionDiet,
  contentsInBook,
  defaultEaters,
  dietFitsPreference,
  EntryReminderSchema,
  splitVariants,
  validateReminder,
  type EntryReminder,
  type Id,
  type ISODate,
  type MealPlanEntry,
  type PlanEntryVariant,
  type RecipeKind,
  relabelForDay,
  type RemindMinutes,
  RemindMinutesSchema,
  type ShoppingItem,
  type TimeOfDay,
  type VariantSplit,
} from '@housekeeping/core';

import { createActivity, type ActivityDraft } from './commands-activities';
import { createRecipe } from './commands-recipes';
import { createRestaurant, type RestaurantDraft } from './commands-restaurants';
import { indexById } from './queries';
import {
  commit,
  commitConfirmed,
  getData,
  getState,
  isOffline,
  newId,
  OfflineError,
  updateData,
} from './store';
import { checkTime } from './times';
import { TransportError } from './transport';

/** meal_plan_entries_note_length. */
export const NOTE_MAX_LENGTH = 120;

/** The hint when the server refuses an entry because its recipe was deleted (spec 0008, E6). */
export const RECIPE_GONE_MESSAGE = 'Das Rezept gibt es nicht mehr';

/** E6: the entry's recipe was deleted meanwhile (meal_plan_entries_recipe_fkey). */
function recipeGone(error: unknown): string | undefined {
  return error instanceof TransportError &&
    error.code === '23503' &&
    error.constraint === 'meal_plan_entries_recipe_fkey'
    ? RECIPE_GONE_MESSAGE
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
  /** Zusatz, kept only on activities: "Eislaufen (Hohenschönhausen)". */
  note?: string;
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

/** Who eats by default on a day: every member of the household who is not absent. */
export function defaultEaterIds(date: ISODate | null): Id[] {
  const data = getData();
  const members = getState().members.filter((member) =>
    data.household.memberIds.includes(member.id),
  );
  return defaultEaters(members, date, data.absences).map((member) => member.id);
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

/** The trimmed Zusatz (empty → none); "Der Zusatz ist zu lang …" over 120 characters. */
function cleanNote(note: string | undefined): string | undefined {
  const clean = note?.trim() || undefined;
  if (clean && clean.length > NOTE_MAX_LENGTH) {
    throw new Error(`Der Zusatz ist zu lang (höchstens ${NOTE_MAX_LENGTH} Zeichen)`);
  }
  return clean;
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
  if (input.kind === 'text' && !input.text?.trim()) throw new Error('Der Text fehlt.');
  const note = input.kind === 'activity' ? cleanNote(input.note) : undefined;
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
      text: input.text?.trim(),
      note,
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
 * activity loses its activity and Zusatz (meal_plan_entries_note_only_activity); one that is no
 * longer a restaurant loses its reservation (meal_plan_entries_reservation_only_restaurant).
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
      | 'notCooked'
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
        const withoutReservation =
          next.kind === 'restaurant' ? next : { ...next, reservedAt: undefined };
        return withoutReservation.kind === 'activity'
          ? withoutReservation
          : { ...withoutReservation, activityId: undefined, note: undefined };
      }),
    })),
  );
}

/**
 * "Reserviert um" and "Erinnern … vorher" of a restaurant entry (spec 0013, REQ-008, AC-027,
 * AC-029): `reservedAt` null removes the time (✕), undefined leaves it; the reminder is one of
 * 30, 60, 120, 180, 240 minutes. Only a restaurant entry takes a time: the server refuses it on
 * any other (AC-030) and the entry springs back with the general hint. Throws "Keine gültige
 * Uhrzeit" before sending.
 */
export function setReservation(
  entryId: Id,
  reservation: { reservedAt?: TimeOfDay | null; remindMinutesBefore?: RemindMinutes },
): void {
  checkTime(reservation.reservedAt);
  const { remindMinutesBefore } = reservation;
  if (remindMinutesBefore !== undefined) RemindMinutesSchema.parse(remindMinutesBefore);
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      planEntries: data.planEntries.map((entry) => {
        if (entry.id !== entryId) return entry;
        return {
          ...entry,
          ...(reservation.reservedAt !== undefined
            ? { reservedAt: reservation.reservedAt ?? undefined }
            : {}),
          ...(remindMinutesBefore !== undefined ? { remindMinutesBefore } : {}),
        };
      }),
    })),
  );
}

/**
 * "Fertig" in an entry's window (spec 0018, REQ-003): the typed Zusatz of an activity and the
 * "Reserviert um" of a restaurant as one patch. Resolves once the server took it, rejects when it
 * refused it (the entry springs back, and onWriteRejected reports the general hint), so the
 * window can stay open with the typed text (AC-009). Nothing changed resolves at once and sends
 * nothing. Throws "Keine gültige Uhrzeit", "Der Zusatz ist zu lang …" and OfflineError before
 * anything changes.
 */
export function saveEntryFields(
  entryId: Id,
  fields: { note?: string; reservedAt?: TimeOfDay | null },
): Promise<void> {
  const note = 'note' in fields ? cleanNote(fields.note) : undefined;
  checkTime(fields.reservedAt);
  if (isOffline()) throw new OfflineError();
  const confirmed = commitConfirmed({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      planEntries: data.planEntries.map((entry) => {
        if (entry.id !== entryId) return entry;
        return {
          ...entry,
          ...('note' in fields && entry.kind === 'activity' ? { note } : {}),
          ...(fields.reservedAt !== undefined
            ? { reservedAt: fields.reservedAt ?? undefined }
            : {}),
        };
      }),
    })),
  );
  // The caller may not wait for it; a refusal is reported through onWriteRejected anyway.
  confirmed.catch(() => {});
  return confirmed;
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
 * recipe stay (the server clears their link).
 */
export function removePlanEntry(entryId: Id): void {
  const removed = new Set([
    entryId,
    ...getData()
      .planEntries.filter((entry) => entry.leftoversOfEntryId === entryId && !entry.recipeId)
      .map((entry) => entry.id),
  ]);
  commit({ path: 'diff', maxDeletes: { meal_plan_entries: removed.size } }, () =>
    updateData((data) => ({
      ...data,
      planEntries: data.planEntries.filter((entry) => !removed.has(entry.id)),
    })),
  );
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
