import {
  addPlanEntry,
  useArticlesById,
  useHousehold,
  useMembers,
  usePlanEntries,
  useRecipe,
  useRecipeBook,
  useToday,
} from '@housekeeping/api';
import {
  cookedToday,
  cookingIngredients,
  cookingKeyStep,
  cookingStepFromParam,
  defaultPlanChoice,
  groupIngredients,
  ingredientLine,
  isTimerFinished,
  isTimerRunning,
  otherStepTimers,
  pauseStepTimer,
  resetStepTimer,
  servingsLabel,
  slotSideFor,
  startStepTimer,
  stepsForVariants,
  stepTimerLabel,
  timersToRing,
  videoLabel,
  type Id,
  type Recipe,
  type RecipeIngredient,
  type RecipeVideo,
  type StepTimers,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  EmptyState,
  expandableA11y,
  GroupLabel,
  Icon,
  List,
  ListRow,
  Menu,
  Row,
  Screen,
  Stack,
  Text,
  toast,
  useBreakpoint,
  useToastClearance,
  useBottomInset,
  useWakeLock,
} from '@housekeeping/ui';
import { Redirect, useIsFocused, useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { ConfirmDialog } from '@/features/shell/confirm-dialog';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';
import { ringChime, unlockChime } from '@/lib/chime';
import { usePageParams } from '@/lib/url-state';

import { VideoPlayer } from './recipe-video';

/**
 * Cooking mode (spec 0023, REQ-010): one step per screen as calm reading text, the ingredients of
 * the variant beside it from 1100 px, below it on phones and tablets (open at the start, the head
 * folds them). Timers keep running on other steps and ring when they run out (spec 0056,
 * REQ-007); the screen stays awake. "Fertig" on the last step asks "Heute gekocht eintragen?"
 * while today counts nothing as cooked (REQ-008). Full screen on phones, the sidebar stays on
 * wider screens (spec 0005, D5).
 */
export function CookingScreen() {
  // Step, variant and portions stand in the address, so a reload cooks on (spec 0019, REQ-015).
  const { params, replace } = usePageParams('kochen');
  const router = useRouter();
  const id = params.id;
  const recipe = useRecipe(id);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else if (id) router.replace({ pathname: '/rezept/[id]', params: { id } });
    else router.replace('/rezepte');
  };

  if (!recipe) {
    return (
      <Screen testID="cooking-screen">
        <EmptyState icon="book-open" title="Dieses Rezept gibt es nicht mehr">
          <Button
            label="Zu Essen"
            onPress={() => router.replace('/rezepte')}
            testID="cooking-not-found-back"
          />
        </EmptyState>
      </Screen>
    );
  }
  // A collection has no cooking mode: its address leads to its page (spec 0009, E13).
  if (recipe.kind === 'collection') {
    return <Redirect href={{ pathname: '/rezept/[id]', params: { id: recipe.id } }} />;
  }
  return (
    <Cooking
      recipe={recipe}
      variantParam={params.variante}
      servings={params.portionen ?? recipe.servings}
      step={params.schritt}
      // The first step is the default and stays out of the address.
      onStep={(index) => replace({ schritt: index > 0 ? index + 1 : undefined })}
      onLeave={leave}
    />
  );
}

function Cooking(props: {
  recipe: Recipe;
  variantParam: string | undefined;
  /** The portions chosen on the recipe page (spec 0018, AC-004). */
  servings: number;
  /** `schritt` from the address, 1-based; beyond the last gives the last (AC-046). */
  step: number | undefined;
  onStep: (index: number) => void;
  onLeave: () => void;
}) {
  const { recipe } = props;
  const { isPhone, bp } = useBreakpoint();
  // Two columns from 1100 px (spec 0023, Decision 4): the tablet in portrait has too little room.
  const twoColumns = bp === 'desktop';
  // Above the home bar with its gap (spec 0029, REQ-002).
  const bottomEdge = useBottomInset();
  const variant = recipe.variants.find((candidate) => candidate.id === props.variantParam);
  const steps = stepsForVariants(recipe, variant ? [variant.id] : undefined);
  const ingredients = cookingIngredients(recipe, variant?.id, props.servings);
  const index = cookingStepFromParam(props.step, steps.length);
  const setIndex = props.onStep;
  // Open at the start; the state stays while paging, not when the cooking mode opens again (AC-039).
  const [ingredientsOpen, setIngredientsOpen] = useState(true);
  // Timers keep running on other steps and end with the cooking mode (Decision 5).
  const [timers, setTimers] = useState<StepTimers>({});
  const now = useClock(Object.values(timers).some((timer) => timer.startedAt !== undefined));
  // No tab bar here: the toast stands above the step buttons (AC-024).
  const [footerHeight, setFooterHeight] = useState<number | undefined>();
  useToastClearance(footerHeight === undefined ? undefined : footerHeight - bottomEdge);
  // Only while it is the page on screen, not while a page lies above it.
  useWakeLock(useIsFocused());
  useArrowKeys(index, steps.length, setIndex);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;
  const others = otherStepTimers(timers, step?.id, now);
  const ingredientsTitle = `Zutaten · ${servingsLabel(props.servings)}`;
  // Spec 0046, AC-016: a saved video plays on the whole screen over the step.
  const [playing, setPlaying] = useState<RecipeVideo>();
  const videos = recipe.videos;
  useTimerChime(timers, now);
  const cooked = useCookedToday(recipe, variant?.id, props.servings, props.onLeave);

  const stepPart = step ? (
    <Stack gap={20} style={{ maxWidth: READING_WIDTH }}>
      <Text variant="smallStrong" color="accent" testID="cook-step-index">
        Schritt {index + 1} von {steps.length}
      </Text>
      {/* The step is reading text in the font of the controls, no heading (AC-037). */}
      <Text variant={twoColumns ? 'readingLarge' : 'reading'} selectable testID="cook-step-text">
        {step.text}
      </Text>
      {step.timerMinutes ? (
        <StepTimerControl
          stepId={step.id}
          stepNumber={index + 1}
          minutes={step.timerMinutes}
          timers={timers}
          now={now}
          onChange={setTimers}
        />
      ) : null}
    </Stack>
  ) : (
    <EmptyState
      icon="chef-hat"
      title="Noch keine Schritte"
      text="Für dieses Rezept ist noch keine Zubereitung hinterlegt."
      testID="cook-no-steps"
    >
      <Button label="Zurück zum Rezept" onPress={props.onLeave} />
    </EmptyState>
  );

  const ingredientList =
    ingredients.length > 0 ? <CookingIngredients ingredients={ingredients} /> : null;

  return (
    <Screen
      testID="cooking-screen"
      tone="essen"
      maxWidth={twoColumns ? WIDE_MAX_WIDTH : NARROW_MAX_WIDTH}
      clearFab={false}
      footer={
        steps.length > 0 ? (
          <View
            onLayout={(event) => setFooterHeight(Math.round(event.nativeEvent.layout.height))}
            style={{
              width: '100%',
              maxWidth: twoColumns ? WIDE_MAX_WIDTH : NARROW_MAX_WIDTH,
              alignSelf: 'center',
              paddingHorizontal: isPhone ? 16 : 36,
              paddingTop: 14,
              paddingBottom: 14 + bottomEdge,
            }}
          >
            <Row gap={12}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Zurück"
                  icon="arrow-left"
                  variant="secondary"
                  full
                  disabled={index === 0}
                  onPress={() => setIndex(Math.max(0, index - 1))}
                  testID="cook-prev"
                />
              </View>
              <View style={{ flex: 1 }}>
                {last ? (
                  <Button
                    label="Fertig"
                    icon="check"
                    full
                    onPress={cooked.finish}
                    testID="cook-done"
                  />
                ) : (
                  <Button
                    label="Weiter"
                    icon="arrow-right"
                    full
                    onPress={() => setIndex(index + 1)}
                    testID="cook-next"
                  />
                )}
              </View>
            </Row>
          </View>
        ) : null
      }
    >
      <Row justify="space-between" style={{ marginBottom: 16 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="small" color="muted" numberOfLines={1} testID="cook-subtitle">
            {['Kochmodus', variant?.name, servingsLabel(props.servings)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text variant="heading" heading numberOfLines={1}>
            {recipe.title}
          </Text>
        </View>
        <Row gap={8}>
          {videos.length === 1 ? (
            <Button
              label="Video"
              icon="film"
              variant="secondary"
              size="sm"
              onPress={() => setPlaying(videos[0])}
              testID="cook-video"
            />
          ) : videos.length > 1 ? (
            <Menu
              label="Video"
              accessibilityLabel="Video wählen"
              icon="film"
              options={videos.map((_, at) => ({
                value: String(at),
                label: videoLabel(at, videos.length),
              }))}
              onChange={(at) => setPlaying(videos[Number(at)])}
              testID="cook-video"
            />
          ) : null}
          {/* Full screen on phones, so "Fertig" is the way out (spec 0005, D5). */}
          <Button
            label="Fertig"
            variant="secondary"
            size="sm"
            hint="Kochmodus beenden"
            onPress={props.onLeave}
            testID="cook-close"
          />
        </Row>
      </Row>
      {playing ? (
        <VideoPlayer video={playing} title={recipe.title} onClose={() => setPlaying(undefined)} />
      ) : null}
      {cooked.dialog}

      {others.length > 0 ? (
        <View testID="cook-other-timers" style={{ marginBottom: 16 }}>
          <Row gap={8} wrap>
            {others.map((timer) => (
              <Chip
                key={timer.stepId}
                label={timer.label}
                selected
                onPress={() => {
                  const at = steps.findIndex((candidate) => candidate.id === timer.stepId);
                  if (at >= 0) setIndex(at);
                }}
                testID={`cook-other-timer-${timer.stepNumber}`}
              />
            ))}
          </Row>
        </View>
      ) : null}

      {twoColumns ? (
        <Row gap={40} align="flex-start">
          <View style={{ flex: 1, minWidth: 0 }}>{stepPart}</View>
          {ingredientList ? (
            <View
              role="complementary"
              aria-label={ingredientsTitle}
              style={{ width: SIDE_WIDTH }}
              testID="cook-ingredients"
            >
              <Text variant="bodyStrong" style={{ marginBottom: 8 }}>
                {ingredientsTitle}
              </Text>
              {ingredientList}
            </View>
          ) : null}
        </Row>
      ) : (
        <Stack gap={32}>
          {stepPart}
          {ingredientList ? (
            <View>
              <Pressable
                accessibilityRole="button"
                {...expandableA11y(ingredientsTitle, ingredientsOpen, Platform.OS, {
                  expanded: 'aufgeklappt',
                  collapsed: 'zugeklappt',
                })}
                onPress={() => setIngredientsOpen(!ingredientsOpen)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}
                testID="cook-ingredients-toggle"
              >
                <Text variant="bodyStrong">{ingredientsTitle}</Text>
                <Icon
                  name={ingredientsOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="muted"
                />
              </Pressable>
              {ingredientsOpen ? (
                <View style={{ marginTop: 4 }} testID="cook-ingredients">
                  {ingredientList}
                </View>
              ) : null}
            </View>
          ) : null}
        </Stack>
      )}
    </Screen>
  );
}

const NARROW_MAX_WIDTH = 860;
const WIDE_MAX_WIDTH = 1200;
/** About 60 characters a line in the reading text. */
const READING_WIDTH = 680;
const SIDE_WIDTH = 340;

/** The ingredients of the variant, scaled, without group first, then each group (REQ-004). */
function CookingIngredients(props: { ingredients: RecipeIngredient[] }) {
  const articlesById = useArticlesById();
  return (
    <>
      {groupIngredients(props.ingredients).map((part) => (
        <View key={part.group ?? ''}>
          {part.group ? <GroupLabel>{part.group}</GroupLabel> : null}
          <List>
            {part.items.map((ingredient) => (
              <ListRow
                key={ingredient.id}
                // The Hinweis after "·" ("Zwiebeln · fein gehackt"); the amount stands in front.
                title={ingredientLine(
                  { prepNote: ingredient.prepNote },
                  articlesById[ingredient.articleId]?.name ?? '',
                )}
                testID={`cook-ingredient-${ingredient.id}`}
                leading={
                  <Text variant="bodyStrong" style={{ width: 76 }}>
                    {ingredient.amount?.text ?? ''}
                  </Text>
                }
              />
            ))}
          </List>
        </View>
      ))}
    </>
  );
}

/** The time, ticking every second while a timer runs (a timer started since counts from its start). */
function useClock(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}

/** A timer that runs out rings once, also on another step (spec 0056, REQ-007). */
function useTimerChime(timers: StepTimers, now: number): void {
  const finished = useRef<ReadonlySet<Id>>(new Set());
  useEffect(() => {
    const next = timersToRing(finished.current, timers, now);
    finished.current = next.finished;
    if (next.ring.length > 0) ringChime();
  }, [timers, now]);
}

/**
 * "Fertig" on the last step (spec 0056, REQ-008): without a plan entry of today that counts as
 * cooked it asks "Heute gekocht eintragen?"; "Eintragen" adds today's entry (Tageszeit and eaters
 * as "Einplanen" opens with, the portions and variant cooked), so "Zuletzt gekocht" says today.
 * Offline it leaves as before (AC-034).
 */
function useCookedToday(
  recipe: Recipe,
  variantId: Id | undefined,
  servings: number,
  onLeave: () => void,
): { finish: () => void; dialog: ReactNode } {
  const online = useOnlineOnly();
  const entries = usePlanEntries();
  const book = useRecipeBook();
  const today = useToday();
  const household = useHousehold();
  const members = useMembers();
  const [asking, setAsking] = useState(false);
  const finish = () => {
    if (online.disabled || cookedToday(entries, book.collectionRecipes, recipe.id, today)) {
      onLeave();
      return;
    }
    setAsking(true);
  };
  const enter = (): string | undefined => {
    const choice = defaultPlanChoice(
      today,
      household.mealSlots,
      members,
      slotSideFor(recipe.course),
    );
    if (!choice.slotId) return FAILED_MESSAGE;
    try {
      addPlanEntry({
        date: today,
        slotId: choice.slotId,
        kind: 'recipe',
        recipeId: recipe.id,
        eaterIds: choice.eaterIds,
        guests: 0,
        portions: servings,
        variants: variantId ? [{ variantId, portions: servings }] : undefined,
      });
    } catch (error) {
      return errorMessage(error, FAILED_MESSAGE);
    }
    setAsking(false);
    toast.show({ message: 'Heute gekocht eingetragen' });
    onLeave();
    return undefined;
  };
  const dialog = asking ? (
    <ConfirmDialog
      title="Heute gekocht eintragen?"
      message="Dann steht es heute im Kalender, und „Zuletzt gekocht“ stimmt."
      confirmLabel="Eintragen"
      cancelLabel="Nicht eintragen"
      onConfirm={enter}
      onCancel={() => {
        setAsking(false);
        onLeave();
      }}
      onDismiss={() => setAsking(false)}
      testID="cook-cooked-today"
    />
  ) : null;
  return { finish, dialog };
}

/** Arrow right = "Weiter", arrow left = "Zurück" on the web, unless typing or a window is open. */
function useArrowKeys(index: number, count: number, onStep: (index: number) => void): void {
  const step = useEffectEvent((key: string) => {
    const next = cookingKeyStep(key, index, count);
    if (next !== undefined) onStep(next);
  });
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as { tagName?: string } | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if (document.querySelector('[aria-modal="true"]')) return;
      step(event.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/**
 * The chip "Timer 35 Min" of a step (Start, Pause) and "Zurücksetzen" (AC-041): a countdown that
 * keeps running on other steps and rings when it runs out (spec 0056, REQ-007).
 */
function StepTimerControl(props: {
  stepId: string;
  stepNumber: number;
  minutes: number;
  timers: StepTimers;
  now: number;
  onChange: (timers: StepTimers) => void;
}) {
  const timer = props.timers[props.stepId];
  const running = isTimerRunning(timer, props.now);
  const finished = isTimerFinished(timer, props.now);
  const step = { stepId: props.stepId, stepNumber: props.stepNumber, minutes: props.minutes };
  return (
    <Row gap={8} wrap>
      <Chip
        label={stepTimerLabel(timer, props.minutes, props.now)}
        icon="timer"
        selected={running}
        onPress={() => {
          if (finished) props.onChange(resetStepTimer(props.timers, props.stepId));
          else if (running) props.onChange(pauseStepTimer(props.timers, props.stepId, Date.now()));
          else {
            // The tap allows the sound when the timer runs out (spec 0056, Entscheidung 8).
            unlockChime();
            props.onChange(startStepTimer(props.timers, step, Date.now()));
          }
        }}
        testID="cook-timer"
      />
      {timer && !finished ? (
        <Button
          label="Zurücksetzen"
          variant="link"
          size="sm"
          onPress={() => props.onChange(resetStepTimer(props.timers, props.stepId))}
          testID="cook-timer-reset"
        />
      ) : null}
    </Row>
  );
}
