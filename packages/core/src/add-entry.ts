import { portionsFor, changeEaters, type PortionContext, type PortionState } from './entry-edit';
import { withNote } from './meal-plan';
import type {
  Activity,
  Id,
  ISODate,
  MealPlanEntry,
  PlanEntryVariant,
  Recipe,
  Restaurant,
  TimeOfDay,
} from './types';

// The window "+ Hinzufügen" / "Einplanen" in the calendar (spec 0010, REQ-007; spec 0031,
// REQ-023): search, "Neu", the second step. Its state changes only through addEntryReducer, so a
// new choice starts over and nothing of the one before stays (AC-056).

export interface AddEntryTarget {
  /** null = "Vormerken" without a day. */
  date: ISODate | null;
  slotId: Id;
  /**
   * false when added to a day as a whole ("+ Hinzufügen" under a day on phones): the title has no
   * Tageszeit and the second step preselects `slotId`, the last one ("Abend", spec 0010, REQ-007).
   */
  slotChosen?: boolean;
}

export type AddEntryTab =
  'all' | 'leftovers' | 'recipes' | 'collections' | 'restaurants' | 'activities';
export type AddEntryCreating = 'recipe' | 'collection' | 'restaurant' | 'activity';
export type AddEntryChoice =
  | { kind: 'recipe'; recipe: Recipe }
  | { kind: 'restaurant'; restaurant: Restaurant }
  | { kind: 'activity'; activity: Activity }
  | { kind: 'text' }
  | { kind: 'leftovers'; source: MealPlanEntry; title: string };

export interface AddEntryState {
  target: AddEntryTarget;
  tab: AddEntryTab;
  query: string;
  choice?: AddEntryChoice;
  creating?: AddEntryCreating;
  day: ISODate | null;
  slotId: Id;
  slotChosen: boolean;
  /** "Ohne Tag vormerken"; always on without a day. */
  later: boolean;
  note: string;
  noteError?: string;
  /** "Uhrzeit (optional)", sent only for restaurants and activities. */
  startsAt?: TimeOfDay;
  olderLeftovers: boolean;
  /** Who eats and how much: eaters, guests, portions and the split over variants. */
  portions: PortionState;
  cookId?: Id;
  /** "Was gibt es?" of free text. */
  text: string;
  error?: string;
  /** The title and servings of a new recipe or collection. */
  newTitle: string;
  newTitleError?: string;
  newServings: number;
}

/** Members and articles for the split of portions; the recipe comes from the choice. */
export type AddEntryContext = Omit<PortionContext, 'recipe'>;

export type AddEntryAction =
  | { type: 'setTab'; tab: AddEntryTab }
  | { type: 'setQuery'; query: string }
  /** `eaterIds`: everyone at home that day (defaultEaterIds). */
  | { type: 'choose'; choice: AddEntryChoice; eaterIds: Id[]; context: AddEntryContext }
  | { type: 'backToSearch' }
  | { type: 'startCreating'; kind: AddEntryCreating }
  | { type: 'stopCreating' }
  | { type: 'setDay'; day: ISODate }
  | { type: 'chooseSlot'; slotId: Id }
  | { type: 'toggleLater' }
  | { type: 'setNote'; note: string }
  | { type: 'noteFailed'; error: string }
  | { type: 'setStartsAt'; startsAt: TimeOfDay | undefined }
  | { type: 'toggleOlderLeftovers' }
  | { type: 'setEaters'; eaterIds: Id[]; context: AddEntryContext }
  | { type: 'setGuests'; guests: number; context: AddEntryContext }
  | { type: 'setPortions'; portions: PortionState }
  | { type: 'setCook'; cookId: Id | undefined }
  | { type: 'setText'; text: string }
  /** "Einplanen": shows the hint of what is missing. */
  | { type: 'save' }
  | { type: 'fail'; error: string }
  | { type: 'setNewTitle'; title: string }
  | { type: 'newTitleFailed'; error: string }
  | { type: 'setNewServings'; servings: number };

const NO_PORTIONS: PortionState = { eaterIds: [], guests: 0, portions: 0, variants: [] };

export const TEXT_MISSING = 'Bitte etwas eintragen';

/** A fresh window; with `activity` ("Einplanen" on an activity) that activity is chosen. */
export function initialAddEntryState(
  target: AddEntryTarget,
  options: { servings: number; activity?: Activity },
): AddEntryState {
  return {
    target,
    tab: 'all',
    query: '',
    choice: options.activity ? { kind: 'activity', activity: options.activity } : undefined,
    day: target.date,
    slotId: target.slotId,
    slotChosen: target.slotChosen !== false,
    later: target.date === null,
    note: '',
    olderLeftovers: false,
    portions: NO_PORTIONS,
    text: '',
    newTitle: '',
    newServings: options.servings,
  };
}

const recipeOf = (choice: AddEntryChoice | undefined): Recipe | undefined =>
  choice?.kind === 'recipe' ? choice.recipe : undefined;

export function addEntryReducer(state: AddEntryState, action: AddEntryAction): AddEntryState {
  switch (action.type) {
    case 'setTab':
      return { ...state, tab: action.tab };
    case 'setQuery':
      return { ...state, query: action.query };
    case 'choose': {
      // Spec 0031, AC-056: a new choice starts from the window's Tageszeit and everyone at home.
      const recipe = recipeOf(action.choice);
      return {
        ...state,
        choice: action.choice,
        creating: undefined,
        slotId: state.target.slotId,
        slotChosen: state.target.slotChosen !== false,
        portions: portionsFor(action.eaterIds, 0, { ...action.context, recipe }),
        startsAt: undefined,
        cookId: undefined,
        error: undefined,
        noteError: undefined,
        text: action.choice.kind === 'text' ? state.query.trim() : state.text,
      };
    }
    case 'backToSearch':
      return { ...state, choice: undefined, creating: undefined };
    case 'startCreating': {
      // What was searched for is usually the name of the new thing.
      const named = action.kind === 'recipe' || action.kind === 'collection';
      return {
        ...state,
        creating: action.kind,
        newTitle: named && !state.newTitle ? state.query.trim() : state.newTitle,
      };
    }
    case 'stopCreating':
      return { ...state, creating: undefined };
    case 'setDay':
      return { ...state, day: action.day };
    case 'chooseSlot':
      return { ...state, slotId: action.slotId, slotChosen: true };
    case 'toggleLater':
      // Spec 0030, REQ-008: "Wer isst mit?" does not depend on the day, so a choice made stays.
      return { ...state, later: !state.later };
    case 'setNote':
      return { ...state, note: action.note, noteError: undefined };
    case 'noteFailed':
      return { ...state, noteError: action.error };
    case 'setStartsAt':
      return { ...state, startsAt: action.startsAt };
    case 'toggleOlderLeftovers':
      return { ...state, olderLeftovers: !state.olderLeftovers };
    case 'setEaters':
      return {
        ...state,
        portions: changeEaters(
          state.portions,
          { eaterIds: action.eaterIds, guests: state.portions.guests },
          { ...action.context, recipe: recipeOf(state.choice) },
        ),
      };
    case 'setGuests':
      return {
        ...state,
        portions: changeEaters(
          state.portions,
          { eaterIds: state.portions.eaterIds, guests: action.guests },
          { ...action.context, recipe: recipeOf(state.choice) },
        ),
      };
    case 'setPortions':
      return { ...state, portions: action.portions };
    case 'setCook':
      return { ...state, cookId: action.cookId };
    case 'setText':
      return { ...state, text: action.text, error: undefined };
    case 'save':
      return state.choice?.kind === 'text' && !state.text.trim()
        ? { ...state, error: TEXT_MISSING }
        : state;
    case 'fail':
      return { ...state, error: action.error };
    case 'setNewTitle':
      return { ...state, newTitle: action.title, newTitleError: undefined };
    case 'newTitleFailed':
      return { ...state, newTitleError: action.error };
    case 'setNewServings':
      return { ...state, newServings: action.servings };
  }
}

/** The day the window plans on: none while "Ohne Tag vormerken" is on. */
export function addEntryDate(state: AddEntryState): ISODate | null {
  return state.later ? null : state.day;
}

/** What "Einplanen" adds to the plan, in the shape of addPlanEntry's input. */
export interface AddEntryRequest {
  /** For the notice "„Lasagne (doppelte Menge)“ eingeplant". */
  title: string;
  input: {
    date: ISODate | null;
    slotId: Id;
    kind: MealPlanEntry['kind'];
    recipeId?: Id;
    restaurantId?: Id;
    activityId?: Id;
    text?: string;
    note: string;
    startsAt?: TimeOfDay;
    leftoversOfEntryId?: Id;
    eaterIds: Id[];
    guests?: number;
    portions?: number;
    variants?: PlanEntryVariant[];
    cookId?: Id;
  };
}

/**
 * The entry "Einplanen" adds, or undefined when nothing can be sent (no choice, empty free text,
 * leftovers without a day). `atHome`: everyone at home that day, for what has no "Wer isst mit?".
 */
export function addEntryRequest(state: AddEntryState, atHome: Id[]): AddEntryRequest | undefined {
  const { choice, note, slotId } = state;
  if (!choice) return undefined;
  const date = addEntryDate(state);
  const timed = choice.kind === 'restaurant' || choice.kind === 'activity';
  // Spec 0021, REQ-008, REQ-013: a Zusatz for every kind, a time for restaurants and activities.
  const extras = { note, ...(timed && state.startsAt ? { startsAt: state.startsAt } : {}) };
  const { eaterIds, guests } = state.portions;
  switch (choice.kind) {
    case 'recipe':
      return {
        title: withNote(choice.recipe.title, note),
        input: {
          date,
          slotId,
          kind: 'recipe',
          recipeId: choice.recipe.id,
          eaterIds,
          guests,
          cookId: state.cookId,
          portions: state.portions.portions,
          variants: state.portions.variants,
          ...extras,
        },
      };
    case 'restaurant':
      return {
        title: withNote(choice.restaurant.name, note),
        input: {
          date,
          slotId,
          kind: 'restaurant',
          restaurantId: choice.restaurant.id,
          eaterIds,
          guests,
          ...extras,
        },
      };
    case 'activity':
      return {
        title: withNote(choice.activity.name, note),
        input: {
          date,
          slotId,
          kind: 'activity',
          activityId: choice.activity.id,
          // Spec 0041, REQ-005: "Wer ist dabei?" and "Gäste", like who eats along.
          eaterIds,
          guests,
          ...extras,
        },
      };
    case 'text': {
      const value = state.text.trim();
      if (!value) return undefined;
      return {
        title: withNote(value, note),
        input: { date, slotId, kind: 'text', text: value, eaterIds: atHome, ...extras },
      };
    }
    case 'leftovers':
      if (!state.day) return undefined;
      return {
        title: choice.title,
        input: {
          date: state.day,
          slotId,
          kind: 'leftovers',
          recipeId: choice.source.recipeId,
          leftoversOfEntryId: choice.source.id,
          eaterIds: atHome,
          portions: Math.max(1, atHome.length),
          variants: [],
          ...extras,
        },
      };
  }
}
