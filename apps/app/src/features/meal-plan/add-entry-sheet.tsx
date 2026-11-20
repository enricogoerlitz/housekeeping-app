import {
  addPlanEntry,
  createAndPlanActivity,
  createAndPlanRecipe,
  createAndPlanRestaurant,
  defaultEaterIds,
  NOTE_MAX_LENGTH,
  splitForEaters,
  useActivities,
  useArticlesById,
  useHousehold,
  useMembers,
  useMembersById,
  usePlanEntries,
  useRecipeImage,
  useRecipes,
  useRecipesById,
  useRestaurants,
  useToday,
  type PlanSlotInput,
} from '@housekeeping/api';
import {
  addDays,
  fuzzyIncludes,
  priceLabel,
  searchRecipes,
  sortRecipes,
  withNote,
  type Activity,
  type Id,
  type ISODate,
  type Member,
  type Recipe,
  type Restaurant,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  ChoiceChips,
  Icon,
  IconButton,
  List,
  ListRow,
  Notice,
  Photo,
  Sheet,
  Stack,
  Text,
  TextField,
  toast,
  useTheme,
} from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import {
  ActivityFormFields,
  savePhotoChoice,
  useActivityForm,
} from '@/features/activities/activity-form';
import { ActivityPhoto } from '@/features/activities/activity-photo';
import { activityPlaceLine } from '@/features/activities/labels';
import { DEFAULT_SERVINGS, NewRecipeFields } from '@/features/recipes/recipe-form';
import { RestaurantFormFields, useRestaurantForm } from '@/features/restaurants/restaurant-form';
import { useOnlineOnly } from '@/features/shell/offline';

import { dayLabel, entryTitle, misfitText, splitSummary } from './labels';

export interface AddTarget {
  /** null = "Vormerken" without a day. */
  date: ISODate | null;
  slotId: Id;
}

type Mode = 'recipe' | 'restaurant' | 'activity' | 'text' | 'leftovers';

const MAX_RESULTS = 30;
/** Days "Einplanen" of an activity offers, from today. */
const PLAN_AHEAD_DAYS = 14;

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Das hat nicht geklappt.';

function Label(props: { children: string }) {
  return (
    <Text variant="smallStrong" style={{ marginBottom: 6 }}>
      {props.children}
    </Text>
  );
}

/** "Wer isst mit?": members as chips plus a guest counter. */
function EaterPicker(props: {
  members: Member[];
  eaterIds: Id[];
  guests: number;
  onEaters: (ids: Id[]) => void;
  onGuests: (guests: number) => void;
}) {
  const { eaterIds, guests } = props;
  return (
    <View>
      <Label>Wer isst mit?</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {props.members.map((member) => {
          const selected = eaterIds.includes(member.id);
          return (
            <Chip
              key={member.id}
              label={member.name}
              selected={selected}
              testID={`eater-${member.id}`}
              onPress={() =>
                props.onEaters(
                  selected ? eaterIds.filter((id) => id !== member.id) : [...eaterIds, member.id],
                )
              }
            />
          );
        })}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 4 }}>
          <IconButton
            icon="minus"
            label="Ein Gast weniger"
            disabled={guests === 0}
            testID="guests-minus"
            onPress={() => props.onGuests(Math.max(0, guests - 1))}
          />
          <Text variant="smallStrong" testID="guests-count">
            {guests === 1 ? '1 Gast' : `${guests} Gäste`}
          </Text>
          <IconButton
            icon="plus"
            label="Ein Gast mehr"
            testID="guests-plus"
            onPress={() => props.onGuests(guests + 1)}
          />
        </View>
      </View>
    </View>
  );
}

function restaurantSubtitle(restaurant: Restaurant): string | undefined {
  return (
    [restaurant.cuisine, priceLabel(restaurant.priceLevel)].filter(Boolean).join(' · ') || undefined
  );
}

/** The recipe's own photo, else its sample photo, else the placeholder (AC-017). */
function RecipeThumb(props: { recipe: Recipe; size: number }) {
  const image = useRecipeImage(props.recipe);
  return <Photo source={image} width={props.size} height={props.size} />;
}

/** "Neues Rezept" / "Neues Restaurant" / "Neue Aktivität": create it right here (REQ-008). */
function NewRow(props: { label: string; disabled: boolean; onPress: () => void; testID: string }) {
  const theme = useTheme();
  return (
    <List>
      <ListRow
        title={props.label}
        leading={
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.shape.radius.photo,
              backgroundColor: theme.colors.surfaceSunken,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="plus" size={22} color="accent" />
          </View>
        }
        disabled={props.disabled}
        onPress={props.onPress}
        testID={props.testID}
      />
    </List>
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

/** "Wann?" for "Einplanen" from an activity: a day of the next two weeks and a Tageszeit. */
function WhenPicker(props: {
  value: AddTarget;
  today: ISODate;
  slots: { id: Id; name: string }[];
  onChange: (value: AddTarget) => void;
}) {
  const days = Array.from({ length: PLAN_AHEAD_DAYS }, (_, offset) => addDays(props.today, offset));
  return (
    <View style={{ gap: 10 }}>
      <Label>Wann?</Label>
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
            selected={props.value.date === date}
            onPress={() => props.onChange({ ...props.value, date })}
            testID={`add-entry-day-${date}`}
          />
        ))}
      </ScrollView>
      <ChoiceChips
        label="Tageszeit"
        options={props.slots.map((slot) => ({ value: slot.id, label: slot.name }))}
        value={props.value.slotId}
        onChange={(slotId) => props.onChange({ ...props.value, slotId })}
        testID="add-entry-slot"
      />
    </View>
  );
}

/**
 * Adds to one Tageszeit: a recipe with eaters and cook, a restaurant, an activity with a Zusatz,
 * a free text or leftovers — or creates a new recipe, restaurant or activity right here and plans
 * it (REQ-008). With `activityId` ("Einplanen" on an activity) that activity is chosen and the
 * day and Tageszeit can be picked.
 */
export function AddEntrySheet(props: {
  target: AddTarget;
  weekDates: ISODate[];
  onClose: () => void;
  activityId?: Id;
}) {
  const online = useOnlineOnly();
  const today = useToday();
  const household = useHousehold();
  const recipes = useRecipes();
  const recipesById = useRecipesById();
  const restaurants = useRestaurants();
  const activities = useActivities();
  const articlesById = useArticlesById();
  const entries = usePlanEntries();
  const members = useMembers();
  const membersById = useMembersById();

  const preset = props.activityId !== undefined;
  const [mode, setMode] = useState<Mode>(preset ? 'activity' : 'recipe');
  const [creating, setCreating] = useState(false);
  const [when, setWhen] = useState<AddTarget>(props.target);
  const [later, setLater] = useState(props.target.date === null);
  const [query, setQuery] = useState('');
  const [recipeId, setRecipeId] = useState<Id | undefined>();
  const [restaurantQuery, setRestaurantQuery] = useState('');
  const [restaurantId, setRestaurantId] = useState<Id | undefined>();
  const [activityQuery, setActivityQuery] = useState('');
  const [activityId, setActivityId] = useState<Id | undefined>(props.activityId);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
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

  // A meal without a day can only be "vorgemerkt"; the toggle then stays on.
  const date = later ? null : when.date;
  const slots = [...household.mealSlots].sort((a, b) => a.sort - b.sort);
  const slotName = slots.find((slot) => slot.id === when.slotId)?.name;
  const recipe = recipeId ? recipesById[recipeId] : undefined;
  const restaurant = restaurantId
    ? restaurants.find((candidate) => candidate.id === restaurantId)
    : undefined;
  const activity = activityId
    ? activities.find((candidate) => candidate.id === activityId)
    : undefined;
  const split = recipe ? splitForEaters(recipe.id, eaterIds, guests) : undefined;
  const misfits = split ? split.misfitMemberIds.flatMap((id) => membersById[id] ?? []) : [];

  const changeMode = (next: Mode) => {
    setMode(next);
    setCreating(false);
  };

  const chooseRecipe = (chosen: Recipe) => {
    setRecipeId(chosen.id);
    setEaterIds(defaultEaterIds(date));
    setGuests(0);
    setCookId(undefined);
  };

  const chooseRestaurant = (chosen: Restaurant) => {
    setCreating(false);
    setRestaurantId(chosen.id);
    setEaterIds(defaultEaterIds(date));
    setGuests(0);
  };

  const chooseActivity = (chosen: Activity) => {
    setCreating(false);
    setActivityId(chosen.id);
  };

  const startCreating = () => {
    setCreating(true);
    // What was searched for is usually the name of the new thing.
    if (mode === 'recipe' && !newTitle) setNewTitle(query.trim());
    if (mode === 'restaurant' && !restaurantForm.name)
      restaurantForm.setName(restaurantQuery.trim());
    if (mode === 'activity' && !activityForm.name) activityForm.setName(activityQuery.trim());
  };

  const toggleLater = () => {
    const next = !later;
    setLater(next);
    setEaterIds(defaultEaterIds(next ? null : when.date));
  };

  const done = (title: string, planned: ISODate | null) => {
    props.onClose();
    toast.show({
      message: planned ? `„${title}“ steht am ${dayLabel(planned)}` : `„${title}“ ist vorgemerkt`,
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
  const planSlot = (): PlanSlotInput => ({
    date,
    slotId: when.slotId,
    eaterIds: defaultEaterIds(date),
  });

  const saveRecipe = () => {
    if (!recipe || !split) return;
    addPlanEntry({
      date,
      slotId: when.slotId,
      kind: 'recipe',
      recipeId: recipe.id,
      eaterIds,
      guests,
      cookId,
      portions: split.portions,
      variants: split.variants,
    });
    done(recipe.title, date);
  };

  const saveRestaurant = () => {
    if (!restaurant) return;
    addPlanEntry({
      date,
      slotId: when.slotId,
      kind: 'restaurant',
      restaurantId: restaurant.id,
      eaterIds,
      guests,
    });
    done(restaurant.name, date);
  };

  const saveActivity = () => {
    if (!activity || online.disabled) return;
    try {
      addPlanEntry({
        date,
        slotId: when.slotId,
        kind: 'activity',
        activityId: activity.id,
        note,
        eaterIds: defaultEaterIds(date),
      });
    } catch (caught) {
      setNoteError(message(caught));
      return;
    }
    done(withNote(activity.name, note), date);
  };

  const saveText = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Schreib kurz, was es gibt.');
      return;
    }
    try {
      addPlanEntry({
        date,
        slotId: when.slotId,
        kind: 'text',
        text: trimmed,
        eaterIds: defaultEaterIds(date),
      });
      done(trimmed, date);
    } catch (caught) {
      setError(message(caught));
    }
  };

  const saveLeftovers = (sourceId: Id) => {
    const source = entries.find((entry) => entry.id === sourceId);
    if (!source || !props.target.date) return;
    const eaters = defaultEaterIds(props.target.date);
    addPlanEntry({
      date: props.target.date,
      slotId: props.target.slotId,
      kind: 'leftovers',
      recipeId: source.recipeId,
      leftoversOfEntryId: source.id,
      eaterIds: eaters,
      portions: Math.max(1, eaters.length),
      variants: [],
    });
    done(`Reste von ${entryTitle(source, recipesById, entries)}`, props.target.date);
  };

  // ---------- Create while planning (AC-021 to AC-023) ----------

  const saveNewRecipe = () => {
    if (online.disabled) return;
    const title = newTitle.trim();
    if (!title) {
      setNewTitleError('Titel fehlt');
      return;
    }
    try {
      createAndPlanRecipe({ title, servings: newServings }, planSlot());
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
      createAndPlanRestaurant(draft, planSlot());
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

  const targetDate = props.target.date;
  const leftoverSources = targetDate
    ? entries
        .filter(
          (entry) =>
            entry.date !== null &&
            entry.date < targetDate &&
            props.weekDates.includes(entry.date) &&
            (entry.kind === 'recipe' || entry.kind === 'text'),
        )
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    : [];

  const results = query.trim()
    ? searchRecipes(query, recipes, articlesById)
    : sortRecipes(recipes, 'title');
  const restaurantResults = [...restaurants]
    .filter(
      (candidate) =>
        !restaurantQuery.trim() ||
        fuzzyIncludes(restaurantQuery, candidate.name) ||
        fuzzyIncludes(restaurantQuery, candidate.cuisine ?? ''),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const activityResults = activities
    .filter(
      (candidate) =>
        !activityQuery.trim() ||
        [candidate.name, candidate.placeName, candidate.description].some(
          (field) => field !== undefined && fuzzyIncludes(activityQuery, field),
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const modes: { value: Mode; label: string }[] = [
    { value: 'recipe', label: 'Rezept' },
    { value: 'restaurant', label: 'Restaurant' },
    { value: 'activity', label: 'Aktivität' },
    { value: 'text', label: 'Freitext' },
    ...(targetDate ? [{ value: 'leftovers' as const, label: 'Reste' }] : []),
  ];

  const addLabel = later ? 'Vormerken' : 'Hinzufügen';
  const createLabel = later ? 'Anlegen und vormerken' : 'Anlegen und einplanen';
  const eatersHint = eaterIds.length + guests === 0 ? 'Wähl aus, wer mitisst.' : undefined;
  let footer: ReactNode;
  if (creating && mode === 'recipe') {
    footer = (
      <Button
        label={createLabel}
        icon="check"
        full
        disabled={online.disabled}
        hint={online.hint}
        testID="add-entry-new-recipe-save"
        onPress={saveNewRecipe}
      />
    );
  } else if (creating && mode === 'restaurant') {
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
  } else if (creating && mode === 'activity') {
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
  } else if (mode === 'recipe' && recipe) {
    footer = (
      <Button
        label={addLabel}
        icon="plus"
        full
        disabled={online.disabled || eaterIds.length + guests === 0}
        hint={online.hint ?? eatersHint}
        testID="add-entry-save"
        onPress={saveRecipe}
      />
    );
  } else if (mode === 'restaurant' && restaurant) {
    footer = (
      <Button
        label={addLabel}
        icon="plus"
        full
        disabled={online.disabled || eaterIds.length + guests === 0}
        hint={online.hint ?? eatersHint}
        testID="add-entry-restaurant-save"
        onPress={saveRestaurant}
      />
    );
  } else if (mode === 'activity' && activity) {
    footer = (
      <Button
        label={addLabel}
        icon="plus"
        full
        disabled={online.disabled}
        hint={online.hint}
        testID="add-entry-activity-save"
        onPress={saveActivity}
      />
    );
  } else if (mode === 'text') {
    footer = (
      <Button
        label={addLabel}
        icon="plus"
        full
        disabled={online.disabled}
        hint={online.hint}
        testID="add-entry-text-save"
        onPress={saveText}
      />
    );
  }

  const zusatz = (
    <TextField
      label="Zusatz (optional)"
      value={note}
      onChangeText={(value) => {
        setNote(value);
        setNoteError(undefined);
      }}
      placeholder="z. B. Hohenschönhausen"
      maxLength={NOTE_MAX_LENGTH}
      error={noteError}
      hint="Steht im Plan in Klammern hinter dem Namen."
      testID="add-entry-activity-note"
    />
  );

  const where = date ? `${dayLabel(date)}${slotName ? ` ${slotName}` : ''}` : 'ohne Tag';
  return (
    <Sheet
      visible
      onClose={props.onClose}
      title={`Hinzufügen · ${where}`}
      testID="add-entry-sheet"
      size="l"
      // The kind stays at the top; switching it keeps the window's size (spec 0005, AC-014).
      header={
        preset ? undefined : (
          <View style={{ paddingTop: 4, paddingBottom: 10 }}>
            <ChoiceChips<Mode>
              label="Art des Eintrags"
              value={mode}
              onChange={changeMode}
              options={modes}
              testID="add-entry-mode"
            />
          </View>
        )
      }
      footer={footer}
    >
      <Stack gap={16}>
        {preset && !later ? (
          <WhenPicker value={when} today={today} slots={slots} onChange={setWhen} />
        ) : null}
        {mode !== 'leftovers' && targetDate ? (
          <Chip
            label="Ohne Tag vormerken"
            icon="bookmark"
            selected={later}
            onPress={toggleLater}
            testID="add-entry-later"
          />
        ) : null}
        {online.hint && creating ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : null}

        {mode === 'recipe' && creating ? (
          <Stack gap={12}>
            <NewHeading title="Neues Rezept" onBack={() => setCreating(false)} />
            <NewRecipeFields
              title={newTitle}
              onChangeTitle={(value) => {
                setNewTitle(value);
                setNewTitleError(undefined);
              }}
              error={newTitleError}
              onSubmit={saveNewRecipe}
              autoFocus
              servings={{ value: newServings, onChange: setNewServings }}
            />
          </Stack>
        ) : null}

        {mode === 'recipe' && !creating && !recipe ? (
          <Stack gap={10}>
            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="Rezept suchen"
              accessibilityLabel="Rezept suchen"
              round
              left={<Icon name="search" size={19} color="muted" />}
              testID="add-entry-search"
            />
            <NewRow
              label="Neues Rezept"
              disabled={online.disabled}
              onPress={startCreating}
              testID="add-entry-new-recipe"
            />
            {results.length === 0 ? (
              <Text color="muted">Kein Rezept gefunden.</Text>
            ) : (
              <List>
                {results.slice(0, MAX_RESULTS).map((candidate) => (
                  <ListRow
                    key={candidate.id}
                    title={candidate.title}
                    subtitle={
                      candidate.variants.map((variant) => variant.name).join(' · ') || undefined
                    }
                    leading={<RecipeThumb recipe={candidate} size={44} />}
                    onPress={() => chooseRecipe(candidate)}
                    testID={`add-entry-recipe-${candidate.id}`}
                  />
                ))}
              </List>
            )}
          </Stack>
        ) : null}

        {mode === 'recipe' && !creating && recipe && split ? (
          <Stack gap={18}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <RecipeThumb recipe={recipe} size={52} />
              <Text variant="cardTitle" style={{ flex: 1 }}>
                {recipe.title}
              </Text>
              <Button
                label="Ändern"
                variant="link"
                size="sm"
                testID="add-entry-back"
                onPress={() => setRecipeId(undefined)}
              />
            </View>
            <EaterPicker
              members={members}
              eaterIds={eaterIds}
              guests={guests}
              onEaters={setEaterIds}
              onGuests={setGuests}
            />
            <View style={{ gap: 6 }}>
              <Text variant="small" color="muted">
                {split.portions === 1 ? '1 Portion' : `${split.portions} Portionen`}
              </Text>
              {split.variants.length > 0 ? (
                <Text variant="bodyStrong" testID="add-entry-split">
                  {splitSummary(recipe, split.variants)}
                </Text>
              ) : null}
              {misfits.length > 0 ? (
                <Notice testID="add-entry-misfit" text={misfitText(misfits)} />
              ) : null}
            </View>
            <View>
              <Label>Wer kocht?</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {members.map((member) => (
                  <Chip
                    key={member.id}
                    label={member.name}
                    icon="chef-hat"
                    selected={cookId === member.id}
                    testID={`cook-${member.id}`}
                    onPress={() => setCookId(cookId === member.id ? undefined : member.id)}
                  />
                ))}
              </View>
            </View>
          </Stack>
        ) : null}

        {mode === 'restaurant' && creating ? (
          <Stack gap={12}>
            <NewHeading title="Neues Restaurant" onBack={() => setCreating(false)} />
            <RestaurantFormFields
              form={restaurantForm}
              focus="link"
              openLabel="Auswählen"
              onOpenExisting={chooseRestaurant}
            />
          </Stack>
        ) : null}

        {mode === 'restaurant' && !creating && !restaurant ? (
          <Stack gap={10}>
            <TextField
              value={restaurantQuery}
              onChangeText={setRestaurantQuery}
              placeholder="Restaurant suchen"
              accessibilityLabel="Restaurant suchen"
              round
              left={<Icon name="search" size={19} color="muted" />}
              testID="add-entry-restaurant-search"
            />
            <NewRow
              label="Neues Restaurant"
              disabled={online.disabled}
              onPress={startCreating}
              testID="add-entry-new-restaurant"
            />
            {restaurants.length === 0 ? (
              <Text color="muted">Noch keine Restaurants.</Text>
            ) : restaurantResults.length === 0 ? (
              <Text color="muted">Kein Restaurant gefunden.</Text>
            ) : (
              <List>
                {restaurantResults.slice(0, MAX_RESULTS).map((candidate) => (
                  <ListRow
                    key={candidate.id}
                    title={candidate.name}
                    subtitle={restaurantSubtitle(candidate)}
                    leading={<Photo placeholderIcon="utensils" width={44} height={44} />}
                    onPress={() => chooseRestaurant(candidate)}
                    testID={`add-entry-restaurant-${candidate.id}`}
                  />
                ))}
              </List>
            )}
          </Stack>
        ) : null}

        {mode === 'restaurant' && !creating && restaurant ? (
          <Stack gap={18}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Photo placeholderIcon="utensils" width={52} height={52} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="cardTitle">{restaurant.name}</Text>
                {restaurantSubtitle(restaurant) ? (
                  <Text variant="small" color="muted">
                    {restaurantSubtitle(restaurant)}
                  </Text>
                ) : null}
              </View>
              <Button
                label="Ändern"
                variant="link"
                size="sm"
                testID="add-entry-restaurant-back"
                onPress={() => setRestaurantId(undefined)}
              />
            </View>
            <EaterPicker
              members={members}
              eaterIds={eaterIds}
              guests={guests}
              onEaters={setEaterIds}
              onGuests={setGuests}
            />
          </Stack>
        ) : null}

        {mode === 'activity' && creating ? (
          <Stack gap={12}>
            <NewHeading title="Neue Aktivität" onBack={() => setCreating(false)} />
            <ActivityFormFields
              form={activityForm}
              autoFocus
              openLabel="Auswählen"
              onOpenExisting={chooseActivity}
            />
            {zusatz}
          </Stack>
        ) : null}

        {mode === 'activity' && !creating && !activity ? (
          <Stack gap={10}>
            <TextField
              value={activityQuery}
              onChangeText={setActivityQuery}
              placeholder="Aktivität suchen"
              accessibilityLabel="Aktivität suchen"
              round
              left={<Icon name="search" size={19} color="muted" />}
              testID="add-entry-activity-search"
            />
            <NewRow
              label="Neue Aktivität"
              disabled={online.disabled}
              onPress={startCreating}
              testID="add-entry-new-activity"
            />
            {activities.length === 0 ? (
              <Text color="muted">Noch keine Aktivitäten.</Text>
            ) : activityResults.length === 0 ? (
              <Text color="muted">Keine Aktivität gefunden.</Text>
            ) : (
              <List>
                {activityResults.slice(0, MAX_RESULTS).map((candidate) => (
                  <ListRow
                    key={candidate.id}
                    title={candidate.name}
                    subtitle={activityPlaceLine(candidate)}
                    leading={<ActivityPhoto activity={candidate} width={44} height={44} />}
                    onPress={() => chooseActivity(candidate)}
                    testID={`add-entry-activity-${candidate.id}`}
                  />
                ))}
              </List>
            )}
          </Stack>
        ) : null}

        {mode === 'activity' && !creating && activity ? (
          <Stack gap={18}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ActivityPhoto activity={activity} width={52} height={52} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="cardTitle" testID="add-entry-activity-chosen">
                  {activity.name}
                </Text>
                {activityPlaceLine(activity) ? (
                  <Text variant="small" color="muted">
                    {activityPlaceLine(activity)}
                  </Text>
                ) : null}
              </View>
              <Button
                label="Ändern"
                variant="link"
                size="sm"
                testID="add-entry-activity-back"
                onPress={() => setActivityId(undefined)}
              />
            </View>
            {zusatz}
          </Stack>
        ) : null}

        {mode === 'text' ? (
          <TextField
            label="Was gibt es?"
            value={text}
            onChangeText={(value) => {
              setText(value);
              setError(undefined);
            }}
            placeholder="z. B. Essen bei Oma"
            error={error}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={saveText}
            testID="add-entry-text"
          />
        ) : null}

        {mode === 'leftovers' ? (
          leftoverSources.length === 0 ? (
            <Text color="muted">
              Diese Woche gab es davor noch nichts, von dem Reste übrig sein könnten.
            </Text>
          ) : (
            <Stack gap={8}>
              <Label>Reste wovon?</Label>
              <List>
                {leftoverSources.map((source) => (
                  <ListRow
                    key={source.id}
                    title={entryTitle(source, recipesById, entries)}
                    subtitle={source.date ? dayLabel(source.date) : undefined}
                    disabled={online.disabled}
                    onPress={() => saveLeftovers(source.id)}
                    testID={`add-entry-leftover-${source.id}`}
                  />
                ))}
              </List>
            </Stack>
          )
        ) : null}
      </Stack>
    </Sheet>
  );
}
