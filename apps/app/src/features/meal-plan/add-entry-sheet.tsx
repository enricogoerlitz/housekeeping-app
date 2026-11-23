import {
  addPlanEntry,
  createAndPlanActivity,
  createAndPlanRecipe,
  createAndPlanRestaurant,
  defaultEaterIds,
  NOTE_MAX_LENGTH,
  splitForEaters,
  useActivities,
  useActivitiesById,
  useArticlesById,
  useHousehold,
  useMembers,
  useMembersById,
  usePlanEntries,
  useRecipeBook,
  useRecipes,
  useRecipesById,
  useRestaurants,
  useRestaurantsById,
  useToday,
  type PlanSlotInput,
} from '@housekeeping/api';
import {
  addDays,
  addedNotice,
  collectionRecipeCountLabel,
  contentsInBook,
  entryName,
  formatPickerDate,
  fuzzyIncludes,
  hasExactName,
  householdClock,
  isSelectableMoveDay,
  leftoverCandidates,
  leftoversDayLabel,
  monthPickerStart,
  moveBounds,
  offersReminder,
  olderLeftoverCandidates,
  planCandidates,
  priceLabel,
  TIME_FIELD_WORDS,
  withNote,
  type Activity,
  type EntryReminder,
  type Id,
  type ISODate,
  type KindRole,
  type MealPlanEntry,
  type Recipe,
  type RecipeBook,
  type RecipeKind,
  type Restaurant,
  type TimeOfDay,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  ChoiceChips,
  GroupLabel,
  Icon,
  KIND_ICONS,
  List,
  ListRow,
  Sheet,
  Stack,
  Text,
  TextField,
  TimeField,
  ViewTabs,
  toast,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import {
  ActivityFormFields,
  savePhotoChoice,
  useActivityForm,
} from '@/features/activities/activity-form';
import { activityPlaceLine } from '@/features/activities/labels';
import { PlanDateCalendar } from '@/lib/plan-date-calendar';
import { DEFAULT_SERVINGS, NewRecipeFields } from '@/features/recipes/recipe-form';
import {
  RestaurantFormFields,
  saveRestaurantPhoto,
  useRestaurantForm,
} from '@/features/restaurants/restaurant-form';
import { useOnlineOnly } from '@/features/shell/offline';

import { addSheetTitle, dayLabel } from './labels';
import { CookPicker, EaterPicker, FieldLabel, PortionFields, usePortions } from './plan-fields';
import { ReminderBlock, useReminderForm } from './reminder-block';

export interface AddTarget {
  /** null = "Vormerken" without a day. */
  date: ISODate | null;
  slotId: Id;
  /**
   * false when added to a day as a whole ("+ Hinzufügen" under a day on phones): the title has no
   * Tageszeit and the second step preselects `slotId`, the last one ("Abend", REQ-007).
   */
  slotChosen?: boolean;
}

type Tab = 'all' | 'leftovers' | 'recipes' | 'collections' | 'restaurants' | 'activities';
type Creating = 'recipe' | 'collection' | 'restaurant' | 'activity';
type Choice =
  | { kind: 'recipe'; recipe: Recipe }
  | { kind: 'restaurant'; restaurant: Restaurant }
  | { kind: 'activity'; activity: Activity }
  | { kind: 'text' }
  | { kind: 'leftovers'; source: MealPlanEntry; title: string };

// Spec 0030, REQ-006: in this order.
const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'recipes', label: 'Rezepte' },
  { value: 'restaurants', label: 'Restaurants' },
  { value: 'activities', label: 'Aktivitäten' },
  { value: 'collections', label: 'Sammlungen' },
  // Spec 0021, REQ-011: only with a day to plan the leftovers on.
  { value: 'leftovers', label: 'Reste' },
];

/** Hits per kind; the middle scrolls, the window keeps its size (AC-022). */
const MAX_RESULTS = 60;
/** Spec 0021, REQ-011: the youngest leftovers above the hits in "Alle". */
const LEFTOVERS_IN_ALL = 3;
/** Day chips "Einplanen" of an activity offers from today; "Anderes Datum …" reaches any day. */
const DAY_CHIPS = 14;

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Das hat nicht geklappt.';

function KindIcon(props: { kind: KindRole }) {
  return <Icon name={KIND_ICONS[props.kind]} size={18} color="muted" />;
}

/** The kind of what a recipe row plans: a collection has the role "Sammlung" (spec 0009, E8). */
const recipeRole = (recipe: Recipe): KindRole =>
  recipe.kind === 'collection' ? 'collection' : 'recipe';

/** The recipes a tab offers (Offene Frage 6 A of spec 0009): "Alle" both kinds. */
const TAB_KINDS: Partial<Record<Tab, RecipeKind | 'all'>> = {
  all: 'all',
  recipes: 'recipe',
  collections: 'collection',
};

/** A recipe row's second line: its variants; a collection the number of its recipes. */
function recipeSubtitle(recipe: Recipe, book: RecipeBook): string | undefined {
  if (recipe.kind === 'collection') {
    return collectionRecipeCountLabel(contentsInBook(recipe, book).length) || undefined;
  }
  return recipe.variants.map((variant) => variant.name).join(' · ') || undefined;
}

function restaurantSubtitle(restaurant: Restaurant): string | undefined {
  return (
    [restaurant.cuisine, priceLabel(restaurant.priceLevel)].filter(Boolean).join(' · ') || undefined
  );
}

/** A "Neu" row: "+ „paella“ als Rezept anlegen". */
function NewRow(props: { label: string; disabled: boolean; onPress: () => void; testID: string }) {
  return (
    <ListRow
      title={props.label}
      leading={<Icon name="plus" size={18} color="accent" />}
      disabled={props.disabled}
      onPress={props.onPress}
      testID={props.testID}
    />
  );
}

/** Title row of a "Neu anlegen" form, with the way back to the search. */
function NewHeading(props: { title: string; onBack: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text variant="cardTitle" style={{ flex: 1 }}>
        {props.title}
      </Text>
      <Button
        label="Zur Suche"
        variant="link"
        size="sm"
        testID="add-entry-new-back"
        onPress={props.onBack}
      />
    </View>
  );
}

/**
 * "Wann?" for "Einplanen" from an activity: a day of the next two weeks, or with "Anderes Datum …"
 * any day in a month calendar (spec 0016, REQ-005, AC-020).
 */
function DayPicker(props: {
  value: ISODate | null;
  today: ISODate;
  onChange: (date: ISODate) => void;
}) {
  const [picking, setPicking] = useState(false);
  const days = Array.from({ length: DAY_CHIPS }, (_, offset) => addDays(props.today, offset));
  // A day beyond the chips is shown on the last chip, so the choice stays visible.
  const other = props.value !== null && !days.includes(props.value) ? props.value : undefined;
  return (
    <View style={{ gap: 6 }}>
      <FieldLabel>Wann?</FieldLabel>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
        style={{ flexGrow: 0 }}
      >
        {days.map((date) => (
          <Chip
            key={date}
            label={date === props.today ? 'Heute' : dayLabel(date)}
            selected={props.value === date}
            onPress={() => props.onChange(date)}
            testID={`add-entry-day-${date}`}
          />
        ))}
        <Chip
          label={other ? formatPickerDate(other) : 'Anderes Datum …'}
          icon="calendar-days"
          selected={picking || other !== undefined}
          onPress={() => setPicking(!picking)}
          testID="add-entry-day-other"
        />
      </ScrollView>
      {picking ? (
        <PlanDateCalendar
          month={monthPickerStart(props.value, props.today)}
          today={props.today}
          marked={props.value}
          onSelect={(date) => {
            props.onChange(date);
            setPicking(false);
          }}
          testID="add-entry-date"
        />
      ) : null}
    </View>
  );
}

/**
 * "+ Hinzufügen" in the calendar (spec 0010, REQ-007): one large window of fixed size with the
 * search field "Was steht an?" and the tabs "Alle · Rezepte · Restaurants · Aktivitäten ·
 * Sammlungen · Reste" (spec 0009, AC-021; spec 0030, REQ-006); "Neu" creates a recipe, collection, restaurant or activity
 * right here (spec 0004, REQ-008), free text and
 * "Reste" from the seven days before (REQ-011) are in "Alle". The second step runs in the same
 * window. With `activityId` ("Einplanen" on an activity) that activity is chosen and the day can
 * be picked.
 */
export function AddEntrySheet(props: { target: AddTarget; onClose: () => void; activityId?: Id }) {
  const online = useOnlineOnly();
  const today = useToday();
  const household = useHousehold();
  const recipes = useRecipes();
  const recipesById = useRecipesById();
  const book = useRecipeBook();
  const restaurants = useRestaurants();
  const restaurantsById = useRestaurantsById();
  const activities = useActivities();
  const activitiesById = useActivitiesById();
  const articlesById = useArticlesById();
  const entries = usePlanEntries();
  const members = useMembers();
  const membersById = useMembersById();

  const preset = props.activityId !== undefined;
  const presetActivity = activities.find((candidate) => candidate.id === props.activityId);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState<Choice | undefined>(
    presetActivity ? { kind: 'activity', activity: presetActivity } : undefined,
  );
  const [creating, setCreating] = useState<Creating | undefined>();
  const [day, setDay] = useState<ISODate | null>(props.target.date);
  const [slotId, setSlotId] = useState<Id>(props.target.slotId);
  const [slotChosen, setSlotChosen] = useState(props.target.slotChosen !== false);
  const [later, setLater] = useState(props.target.date === null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const [startsAt, setStartsAt] = useState<TimeOfDay | undefined>();
  const [olderLeftovers, setOlderLeftovers] = useState(false);
  const [eaterIds, setEaterIds] = useState<Id[]>([]);
  const [guests, setGuests] = useState(0);
  const [cookId, setCookId] = useState<Id | undefined>();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [newTitle, setNewTitle] = useState('');
  const [newTitleError, setNewTitleError] = useState<string | undefined>();
  const [newServings, setNewServings] = useState(DEFAULT_SERVINGS);
  const restaurantForm = useRestaurantForm();
  const activityForm = useActivityForm();
  const router = useRouter();

  // A meal without a day can only be "vorgemerkt"; the switch then stays on.
  const date = later ? null : day;
  const slots = [...household.mealSlots].sort((a, b) => a.sort - b.sort);
  const slotOrder = slots.map((slot) => slot.id);
  const slotName = slots.find((slot) => slot.id === slotId)?.name;
  const trimmed = query.trim();
  // Spec 0017, REQ-001: "Erinnern" in the second step, only with a day (not for "Vormerken").
  const reminder = useReminderForm({
    entryDate: date ?? today,
    slotName: slotName ?? '',
    startsAt,
  });
  const remindable = offersReminder(date, householdClock(new Date(), household.timeZone).date);

  const recipe = choice?.kind === 'recipe' ? choice.recipe : undefined;
  const split = recipe ? splitForEaters(recipe.id, eaterIds, guests) : undefined;
  const misfits = split ? split.misfitMemberIds.flatMap((id) => membersById[id] ?? []) : [];
  // Spec 0021, REQ-006: counters for portions and variants, following eaters and guests.
  const portions = usePortions(recipe, () => ({
    eaterIds: [],
    guests: 0,
    portions: 0,
    variants: [],
  }));
  const timed = choice?.kind === 'restaurant' || choice?.kind === 'activity';

  const choose = (next: Choice) => {
    setChoice(next);
    setCreating(undefined);
    const eaters = defaultEaterIds();
    setEaterIds(eaters);
    setGuests(0);
    portions.reset(eaters, 0, next.kind === 'recipe' ? next.recipe : undefined);
    setStartsAt(undefined);
    setCookId(undefined);
    setError(undefined);
    if (next.kind === 'text') setText(trimmed);
  };
  const backToSearch = () => {
    setChoice(undefined);
    setCreating(undefined);
  };

  const startCreating = (kind: Creating) => {
    setCreating(kind);
    // What was searched for is usually the name of the new thing.
    if ((kind === 'recipe' || kind === 'collection') && !newTitle) setNewTitle(trimmed);
    if (kind === 'restaurant' && !restaurantForm.name) restaurantForm.setName(trimmed);
    if (kind === 'activity' && !activityForm.name) activityForm.setName(trimmed);
  };

  // Spec 0030, REQ-008: "Wer isst mit?" does not depend on the day, so a choice made stays.
  const toggleLater = () => setLater(!later);
  const chooseEaters = (ids: Id[]) => {
    setEaterIds(ids);
    portions.setEaters(ids);
  };
  const chooseGuests = (count: number) => {
    setGuests(count);
    portions.setGuests(count);
  };

  const done = (title: string, planned: ISODate | null) => {
    props.onClose();
    toast.show({
      message: addedNotice(title, planned, today),
    });
  };
  const created = (title: string, planned: ISODate | null) => {
    props.onClose();
    toast.show({
      message: planned
        ? `„${title}“ angelegt und eingeplant`
        : `„${title}“ angelegt und vorgemerkt`,
    });
  };

  /** Where and for whom something new is planned: everyone at home that day. */
  const planSlot = (): PlanSlotInput => ({ date, slotId, eaterIds: defaultEaterIds() });

  const save = () => {
    if (!choice || online.disabled) return;
    // A reminder that cannot be saved keeps the window open with its hint (REQ-003).
    let checked: EntryReminder | undefined;
    if (remindable) {
      const decision = reminder.check();
      if (decision.action === 'invalid') return;
      if (decision.action === 'set') checked = decision.reminder;
    }
    const withReminder = checked ? { reminder: checked } : {};
    // Spec 0021, REQ-008, REQ-013: a Zusatz for every kind, a time for restaurants and activities.
    const extras = { note, ...(timed && startsAt ? { startsAt } : {}) };
    try {
      switch (choice.kind) {
        case 'recipe': {
          if (!split) return;
          addPlanEntry({
            date,
            slotId,
            kind: 'recipe',
            recipeId: choice.recipe.id,
            eaterIds,
            guests,
            cookId,
            portions: portions.state.portions,
            variants: portions.state.variants.filter((row) => row.portions > 0),
            ...extras,
            ...withReminder,
          });
          done(withNote(choice.recipe.title, note), date);
          return;
        }
        case 'restaurant':
          addPlanEntry({
            date,
            slotId,
            kind: 'restaurant',
            restaurantId: choice.restaurant.id,
            eaterIds,
            guests,
            ...extras,
            ...withReminder,
          });
          done(withNote(choice.restaurant.name, note), date);
          return;
        case 'activity':
          try {
            addPlanEntry({
              date,
              slotId,
              kind: 'activity',
              activityId: choice.activity.id,
              ...extras,
              eaterIds: defaultEaterIds(),
              ...withReminder,
            });
          } catch (caught) {
            setNoteError(message(caught));
            return;
          }
          done(withNote(choice.activity.name, note), date);
          return;
        case 'text': {
          const value = text.trim();
          if (!value) {
            setError('Bitte etwas eintragen');
            return;
          }
          addPlanEntry({
            date,
            slotId,
            kind: 'text',
            text: value,
            eaterIds: defaultEaterIds(),
            ...extras,
            ...withReminder,
          });
          done(withNote(value, note), date);
          return;
        }
        case 'leftovers': {
          if (!day) return;
          const eaters = defaultEaterIds();
          addPlanEntry({
            date: day,
            slotId,
            kind: 'leftovers',
            recipeId: choice.source.recipeId,
            leftoversOfEntryId: choice.source.id,
            eaterIds: eaters,
            portions: Math.max(1, eaters.length),
            variants: [],
            ...extras,
            ...withReminder,
          });
          done(choice.title, day);
          return;
        }
      }
    } catch (caught) {
      setError(message(caught));
    }
  };

  // ---------- Create while planning (spec 0004, AC-021 to AC-023) ----------

  /** A new recipe or, with `kind` "collection", a new empty collection (spec 0009, AC-021). */
  const saveNewRecipe = (kind: RecipeKind) => {
    if (online.disabled) return;
    const title = newTitle.trim();
    if (!title) {
      setNewTitleError('Titel fehlt');
      return;
    }
    try {
      createAndPlanRecipe({ title, servings: newServings, kind }, planSlot());
    } catch (caught) {
      setNewTitleError(message(caught));
      return;
    }
    created(title, date);
  };

  const saveNewRestaurant = async () => {
    if (online.disabled) return;
    // A short link is resolved first, so creating and planning stay one change.
    const draft = await restaurantForm.submit();
    if (!draft) return;
    try {
      const { restaurantId } = createAndPlanRestaurant(draft, planSlot());
      // Spec 0024, REQ-001: the same fields as "Restaurant hinzufügen", the photo included.
      saveRestaurantPhoto(restaurantId, restaurantForm.photo);
    } catch (caught) {
      restaurantForm.fail(caught);
      return;
    }
    created(draft.name.trim(), date);
  };

  const saveNewActivity = async () => {
    if (online.disabled) return;
    const values = await activityForm.submit();
    if (!values) return;
    let activityIdCreated: Id;
    try {
      activityIdCreated = createAndPlanActivity(values.draft, { ...planSlot(), note }).activityId;
    } catch (caught) {
      activityForm.fail(caught);
      return;
    }
    savePhotoChoice(activityIdCreated, values.photo);
    created(values.draft.name, date);
  };

  // ---------- Step one: hits, "Neu", "Reste" ----------

  const recipeKind = TAB_KINDS[tab];
  const recipeHits = recipeKind
    ? planCandidates(
        recipes,
        recipeKind === 'all' ? undefined : recipeKind,
        query,
        articlesById,
      ).slice(0, MAX_RESULTS)
    : [];
  const restaurantHits =
    tab === 'all' || tab === 'restaurants'
      ? restaurants
          .filter(
            (candidate) =>
              !trimmed ||
              fuzzyIncludes(query, candidate.name) ||
              fuzzyIncludes(query, candidate.cuisine ?? ''),
          )
          .sort((a, b) => a.name.localeCompare(b.name, 'de'))
          .slice(0, MAX_RESULTS)
      : [];
  const activityHits =
    tab === 'all' || tab === 'activities'
      ? activities
          .filter(
            (candidate) =>
              !trimmed ||
              [candidate.name, candidate.placeName, candidate.description].some(
                (field) => field !== undefined && fuzzyIncludes(query, field),
              ),
          )
          .sort((a, b) => a.name.localeCompare(b.name, 'de'))
          .slice(0, MAX_RESULTS)
      : [];
  const hitCount =
    tab === 'leftovers' ? 0 : recipeHits.length + restaurantHits.length + activityHits.length;

  // Spec 0021, REQ-011, REQ-012: leftovers of the seven days before and of the same day in an
  // earlier Tageszeit; "Ältere Reste …" without a limit. The search filters them by name.
  const targetDay = props.target.date;
  const leftoverSlot = props.target.slotChosen === false ? undefined : props.target.slotId;
  const leftoverTitle = (source: MealPlanEntry, target: ISODate) =>
    `Reste von ${entryName(source, recipesById, entries, restaurantsById, activitiesById)} (${leftoversDayLabel(
      source.date ?? target,
      target,
      slots.find((slot) => slot.id === source.slotId)?.name,
    )})`;
  const leftoverRows = (sources: MealPlanEntry[], target: ISODate) =>
    sources
      .map((source) => ({ source, title: leftoverTitle(source, target) }))
      .filter((row) => !trimmed || fuzzyIncludes(query, row.title));
  const leftovers = targetDay
    ? leftoverRows(
        leftoverCandidates(entries, targetDay, slotOrder, recipesById, leftoverSlot),
        targetDay,
      )
    : [];
  const older = targetDay
    ? leftoverRows(
        olderLeftoverCandidates(entries, targetDay, slotOrder, recipesById, leftoverSlot),
        targetDay,
      )
    : [];
  const quoted = trimmed ? `„${trimmed}“ ` : '';
  // K-13: no "+ „Lasagne“ als Rezept anlegen" next to the recipe "Lasagne" (spec 0018, AC-018).
  const named = (kind: RecipeKind) =>
    hasExactName(
      trimmed,
      recipes.filter((recipe) => recipe.kind === kind).map((recipe) => recipe.title),
    );
  const offerNew = {
    recipe: !named('recipe'),
    collection: !named('collection'),
    restaurant: !hasExactName(
      trimmed,
      restaurants.map((restaurant) => restaurant.name),
    ),
    activity: !hasExactName(
      trimmed,
      activities.map((activity) => activity.name),
    ),
  };

  const leftoverList = (rows: { source: MealPlanEntry; title: string }[], testID: string) => (
    <List testID={testID}>
      {rows.map((leftover) => (
        <ListRow
          key={leftover.source.id}
          title={leftover.title}
          leading={<Icon name="refresh-cw" size={18} color="muted" />}
          onPress={() =>
            choose({ kind: 'leftovers', source: leftover.source, title: leftover.title })
          }
          testID={`add-entry-leftover-${leftover.source.id}`}
        />
      ))}
    </List>
  );

  const leftoversTab = targetDay ? (
    <Stack gap={4}>
      {leftovers.length > 0 ? (
        leftoverList(leftovers, 'add-entry-leftovers')
      ) : (
        <Text color="muted" testID="add-entry-leftovers-empty">
          In den 7 Tagen davor wurde nichts gekocht.
        </Text>
      )}
      <Button
        label="Ältere Reste …"
        variant="link"
        size="sm"
        onPress={() => setOlderLeftovers(!olderLeftovers)}
        testID="add-entry-leftovers-older"
      />
      {olderLeftovers ? leftoverList(older, 'add-entry-leftovers-older-list') : null}
    </Stack>
  ) : null;

  const stepOne = (
    <Stack gap={4}>
      {tab === 'all' && leftovers.length > 0 ? (
        <>
          <GroupLabel testID="add-entry-leftovers-group">Reste</GroupLabel>
          {leftoverList(leftovers.slice(0, LEFTOVERS_IN_ALL), 'add-entry-leftovers-top')}
          <Button
            label="Alle Reste ›"
            variant="link"
            size="sm"
            onPress={() => setTab('leftovers')}
            testID="add-entry-leftovers-all"
          />
        </>
      ) : null}
      {hitCount > 0 ? (
        <List testID="add-entry-hits">
          {recipeHits.map((candidate) => (
            <ListRow
              key={candidate.id}
              title={candidate.title}
              subtitle={recipeSubtitle(candidate, book)}
              leading={<KindIcon kind={recipeRole(candidate)} />}
              accessibilityLabel={
                candidate.kind === 'collection' ? `${candidate.title}, Sammlung` : undefined
              }
              onPress={() => choose({ kind: 'recipe', recipe: candidate })}
              testID={`add-entry-recipe-${candidate.id}`}
            />
          ))}
          {restaurantHits.map((candidate) => (
            <ListRow
              key={candidate.id}
              title={candidate.name}
              subtitle={restaurantSubtitle(candidate)}
              leading={<KindIcon kind="restaurant" />}
              onPress={() => choose({ kind: 'restaurant', restaurant: candidate })}
              testID={`add-entry-restaurant-${candidate.id}`}
            />
          ))}
          {activityHits.map((candidate) => (
            <ListRow
              key={candidate.id}
              title={candidate.name}
              subtitle={activityPlaceLine(candidate)}
              leading={<KindIcon kind="activity" />}
              onPress={() => choose({ kind: 'activity', activity: candidate })}
              testID={`add-entry-activity-${candidate.id}`}
            />
          ))}
        </List>
      ) : trimmed || tab === 'leftovers' ? null : (
        <Text color="muted" testID="add-entry-none">
          {tab === 'restaurants'
            ? 'Noch keine Restaurants.'
            : tab === 'collections'
              ? 'Noch keine Sammlungen.'
              : tab === 'activities'
                ? 'Noch keine Aktivitäten.'
                : 'Noch nichts angelegt.'}
        </Text>
      )}

      <GroupLabel>Neu</GroupLabel>
      <List testID="add-entry-new">
        {(tab === 'all' || tab === 'recipes') && offerNew.recipe ? (
          <NewRow
            label={`+ ${quoted}als Rezept anlegen`}
            disabled={online.disabled}
            onPress={() => startCreating('recipe')}
            testID="add-entry-new-recipe"
          />
        ) : null}
        {tab === 'collections' && offerNew.collection ? (
          <NewRow
            label={`+ ${quoted}als Sammlung anlegen`}
            disabled={online.disabled}
            onPress={() => startCreating('collection')}
            testID="add-entry-new-collection"
          />
        ) : null}
        {tab === 'restaurants' && offerNew.restaurant ? (
          <NewRow
            label={`+ ${quoted}als Restaurant anlegen`}
            disabled={online.disabled}
            onPress={() => startCreating('restaurant')}
            testID="add-entry-new-restaurant"
          />
        ) : null}
        {tab === 'activities' && offerNew.activity ? (
          <NewRow
            label={`+ ${quoted}als Aktivität anlegen`}
            disabled={online.disabled}
            onPress={() => startCreating('activity')}
            testID="add-entry-new-activity"
          />
        ) : null}
        {tab === 'all' ? (
          <ListRow
            title={
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <Text>+ als </Text>
                <Button
                  label="Sammlung"
                  variant="link"
                  size="sm"
                  disabled={online.disabled}
                  onPress={() => startCreating('collection')}
                  testID="add-entry-new-collection"
                />
                <Text> · </Text>
                <Button
                  label="Restaurant"
                  variant="link"
                  size="sm"
                  disabled={online.disabled}
                  onPress={() => startCreating('restaurant')}
                  testID="add-entry-new-restaurant"
                />
                <Text> · </Text>
                <Button
                  label="Aktivität"
                  variant="link"
                  size="sm"
                  disabled={online.disabled}
                  onPress={() => startCreating('activity')}
                  testID="add-entry-new-activity"
                />
              </View>
            }
            accessibilityLabel="Als Sammlung, Restaurant oder Aktivität anlegen"
            leading={<Icon name="plus" size={18} color="accent" />}
            testID="add-entry-new-kind"
          />
        ) : null}
        {tab === 'all' ? (
          <NewRow
            label={trimmed ? `+ ${quoted}als Freitext eintragen` : '+ Freitext eintragen'}
            disabled={online.disabled}
            onPress={() => choose({ kind: 'text' })}
            testID="add-entry-new-text"
          />
        ) : null}
      </List>
    </Stack>
  );

  // ---------- Step two ----------

  const chosenTitle =
    choice?.kind === 'recipe'
      ? choice.recipe.title
      : choice?.kind === 'restaurant'
        ? choice.restaurant.name
        : choice?.kind === 'activity'
          ? choice.activity.name
          : choice?.kind === 'leftovers'
            ? choice.title
            : 'Freitext';
  const chosenKind: KindRole =
    choice?.kind === 'restaurant'
      ? 'restaurant'
      : choice?.kind === 'activity'
        ? 'activity'
        : choice?.kind === 'recipe'
          ? recipeRole(choice.recipe)
          : 'recipe';

  const zusatz = (
    <TextField
      label="Zusatz"
      value={note}
      onChangeText={(value) => {
        setNote(value);
        setNoteError(undefined);
      }}
      placeholder="z. B. Hohenschönhausen"
      maxLength={NOTE_MAX_LENGTH}
      error={noteError}
      hint="Steht im Kalender in Klammern hinter dem Namen."
      testID="add-entry-note"
    />
  );

  const timeField = (
    <TimeField
      label="Uhrzeit (optional)"
      {...TIME_FIELD_WORDS}
      value={startsAt}
      optional
      clearLabel="Uhrzeit entfernen"
      onChange={(time) => {
        const next = time as TimeOfDay | undefined;
        reminder.followTime(startsAt, next);
        setStartsAt(next);
      }}
      hint={
        choice?.kind === 'restaurant' || creating === 'restaurant'
          ? 'Die Uhrzeit, für die ihr reserviert habt.'
          : 'Wann es losgeht.'
      }
      testID="add-entry-time"
    />
  );

  // REQ-012: leftovers lie after their dish; earlier Tageszeiten of its day are greyed out.
  const leftoverBounds =
    choice?.kind === 'leftovers'
      ? moveBounds(
          { ...choice.source, id: 'new', kind: 'leftovers', leftoversOfEntryId: choice.source.id },
          entries,
          slotOrder,
        )
      : undefined;

  const stepTwo = choice ? (
    <Stack gap={18}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {preset ? null : (
          <Button
            label="Zurück"
            icon="chevron-left"
            variant="link"
            size="sm"
            testID="add-entry-step-back"
            onPress={backToSearch}
          />
        )}
        <KindIcon kind={chosenKind} />
        <Text
          variant="cardTitle"
          style={{ flex: 1 }}
          numberOfLines={2}
          testID={choice.kind === 'activity' ? 'add-entry-activity-chosen' : 'add-entry-chosen'}
        >
          {chosenTitle}
        </Text>
      </View>
      {preset && !later ? (
        <DayPicker value={day} today={today} onChange={(next) => setDay(next)} />
      ) : null}
      {choice.kind !== 'leftovers' && props.target.date ? (
        <Chip
          label="Ohne Tag vormerken"
          icon="bookmark"
          selected={later}
          onPress={toggleLater}
          testID="add-entry-later"
        />
      ) : null}
      {leftoverBounds && day ? (
        <View>
          <FieldLabel>Tageszeit</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} testID="add-entry-slot">
            {slots.map((slot) => {
              const allowed = isSelectableMoveDay(leftoverBounds, day, slot.id);
              return (
                <Chip
                  key={slot.id}
                  label={slot.name}
                  selected={slotId === slot.id}
                  disabled={!allowed}
                  hint={allowed ? undefined : 'Reste stehen immer nach ihrem Gericht'}
                  onPress={() => {
                    setSlotId(slot.id);
                    setSlotChosen(true);
                  }}
                  testID={`add-entry-slot-${slot.id}`}
                />
              );
            })}
          </View>
        </View>
      ) : (
        <ChoiceChips
          label="Tageszeit"
          options={slots.map((slot) => ({ value: slot.id, label: slot.name }))}
          value={slotId}
          onChange={(next) => {
            setSlotId(next);
            setSlotChosen(true);
          }}
          testID="add-entry-slot"
        />
      )}
      {choice.kind === 'text' ? (
        <TextField
          label="Was gibt es?"
          value={text}
          onChangeText={(value) => {
            setText(value);
            setError(undefined);
          }}
          placeholder="z. B. Essen bei Oma"
          error={error}
          autoFocus={!text}
          returnKeyType="done"
          onSubmitEditing={save}
          testID="add-entry-text"
        />
      ) : null}
      {choice.kind === 'recipe' || choice.kind === 'restaurant' ? (
        <EaterPicker
          members={members}
          eaterIds={eaterIds}
          guests={guests}
          onEaters={chooseEaters}
          onGuests={chooseGuests}
        />
      ) : null}
      {recipe ? (
        <PortionFields
          recipe={recipe}
          state={portions.state}
          onChange={portions.setState}
          misfits={misfits}
          testID="add-entry"
        />
      ) : null}
      {recipe ? <CookPicker members={members} cookId={cookId} onChange={setCookId} /> : null}
      {timed ? timeField : null}
      {zusatz}
      {remindable ? (
        <ReminderBlock
          form={reminder}
          disabled={online.disabled}
          hint={online.hint}
          onOpenSettings={() => {
            props.onClose();
            router.push('/einstellungen/benachrichtigungen');
          }}
          testID="add-entry-reminder"
        />
      ) : null}
      {error && choice.kind !== 'text' ? (
        <Text variant="small" color="warn">
          {error}
        </Text>
      ) : null}
    </Stack>
  ) : null;

  // ---------- Create ----------

  const createLabel = later ? 'Anlegen und vormerken' : 'Anlegen und einplanen';
  const creatingBody =
    creating === 'recipe' || creating === 'collection' ? (
      <Stack gap={12}>
        <NewHeading
          title={creating === 'collection' ? 'Neue Sammlung' : 'Neues Rezept'}
          onBack={() => setCreating(undefined)}
        />
        <NewRecipeFields
          title={newTitle}
          onChangeTitle={(value) => {
            setNewTitle(value);
            setNewTitleError(undefined);
          }}
          error={newTitleError}
          onSubmit={() => saveNewRecipe(creating)}
          autoFocus
          servings={{ value: newServings, onChange: setNewServings }}
          kind={creating}
        />
      </Stack>
    ) : creating === 'restaurant' ? (
      <Stack gap={12}>
        <NewHeading title="Neues Restaurant" onBack={() => setCreating(undefined)} />
        <RestaurantFormFields
          form={restaurantForm}
          focus="link"
          openLabel="Auswählen"
          onOpenExisting={(chosen) => choose({ kind: 'restaurant', restaurant: chosen })}
        />
      </Stack>
    ) : creating === 'activity' ? (
      <Stack gap={12}>
        <NewHeading title="Neue Aktivität" onBack={() => setCreating(undefined)} />
        <ActivityFormFields
          form={activityForm}
          autoFocus
          openLabel="Auswählen"
          onOpenExisting={(chosen) => choose({ kind: 'activity', activity: chosen })}
        />
        {zusatz}
      </Stack>
    ) : null;

  let footer: ReactNode;
  if (creating === 'recipe' || creating === 'collection') {
    footer = (
      <Button
        label={createLabel}
        icon="check"
        full
        disabled={online.disabled}
        hint={online.hint}
        testID={`add-entry-new-${creating}-save`}
        onPress={() => saveNewRecipe(creating)}
      />
    );
  } else if (creating === 'restaurant') {
    footer = (
      <Button
        label={createLabel}
        icon="check"
        full
        disabled={online.disabled || !!restaurantForm.duplicate || restaurantForm.saving}
        hint={
          online.hint ??
          (restaurantForm.duplicate ? `Gibt es schon: ${restaurantForm.duplicate.name}` : undefined)
        }
        testID="add-entry-new-restaurant-save"
        onPress={() => void saveNewRestaurant()}
      />
    );
  } else if (creating === 'activity') {
    footer = (
      <Button
        label={createLabel}
        icon="check"
        full
        disabled={
          online.disabled ||
          !!activityForm.duplicate ||
          activityForm.saving ||
          activityForm.preparing
        }
        hint={
          online.hint ??
          (activityForm.duplicate ? `Gibt es schon: ${activityForm.duplicate.name}` : undefined)
        }
        testID="add-entry-new-activity-save"
        onPress={() => void saveNewActivity()}
      />
    );
  } else if (choice) {
    const needsEaters = choice.kind === 'recipe' || choice.kind === 'restaurant';
    const noEaters = needsEaters && eaterIds.length + guests === 0;
    footer = (
      <Button
        label={later ? 'Vormerken' : 'Einplanen'}
        icon="plus"
        full
        disabled={online.disabled || noEaters}
        hint={online.hint ?? (noEaters ? 'Wähl aus, wer mitisst.' : undefined)}
        testID="add-entry-save"
        onPress={save}
      />
    );
  }

  const searching = !choice && !creating;
  return (
    <Sheet
      visible
      onClose={props.onClose}
      title={addSheetTitle(date, slotName, slotChosen)}
      testID="add-entry-sheet"
      size="l"
      // Search and tabs stay at the top; switching tabs keeps the window's size (AC-022).
      header={
        searching ? (
          <View style={{ gap: 6, paddingTop: 4 }}>
            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="Was steht an?"
              accessibilityLabel="Was steht an?"
              round
              autoFocus
              left={<Icon name="search" size={19} color="muted" />}
              testID="add-entry-search"
            />
            <ViewTabs
              label="Art"
              value={tab}
              onChange={setTab}
              options={targetDay ? TABS : TABS.filter((option) => option.value !== 'leftovers')}
              testID="add-entry-tab"
            />
          </View>
        ) : undefined
      }
      footer={footer}
    >
      {online.hint ? (
        <Text variant="small" color="warn" style={{ marginBottom: 8 }}>
          {online.hint}
        </Text>
      ) : null}
      {creating ? creatingBody : choice ? stepTwo : tab === 'leftovers' ? leftoversTab : stepOne}
    </Sheet>
  );
}
