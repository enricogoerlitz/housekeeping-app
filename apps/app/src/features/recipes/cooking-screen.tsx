import { useArticlesById, useRecipe } from '@housekeeping/api';
import {
  cookingIngredients,
  cookingStepFromParam,
  ingredientLine,
  servingsLabel,
  stepsForVariants,
  type Recipe,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  EmptyState,
  List,
  ListRow,
  Row,
  Screen,
  Stack,
  Text,
  useBreakpoint,
  useToastClearance,
} from '@housekeeping/ui';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePageParams } from '@/lib/url-state';

/**
 * Cooking mode: one step per screen in large type (F3, AC-023). Full screen on phones, the sidebar
 * stays on wider screens (spec 0005, D5).
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
  const { isPhone } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const variant = recipe.variants.find((candidate) => candidate.id === props.variantParam);
  const steps = stepsForVariants(recipe, variant ? [variant.id] : undefined);
  const ingredients = cookingIngredients(recipe, variant?.id, props.servings);
  const articlesById = useArticlesById();
  const index = cookingStepFromParam(props.step, steps.length);
  const setIndex = props.onStep;
  const [showIngredients, setShowIngredients] = useState(false);
  // No tab bar here: the toast stands above the step buttons (AC-024).
  const [footerHeight, setFooterHeight] = useState<number | undefined>();
  useToastClearance(footerHeight === undefined ? undefined : footerHeight - insets.bottom);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  return (
    <Screen
      testID="cooking-screen"
      tone="essen"
      maxWidth={860}
      clearFab={false}
      footer={
        steps.length > 0 ? (
          <View
            onLayout={(event) => setFooterHeight(Math.round(event.nativeEvent.layout.height))}
            style={{
              width: '100%',
              maxWidth: 860,
              alignSelf: 'center',
              paddingHorizontal: isPhone ? 16 : 36,
              paddingTop: 14,
              paddingBottom: 14 + insets.bottom,
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
                    onPress={props.onLeave}
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

      {step ? (
        <Stack gap={20}>
          <Text variant="smallStrong" color="accent" testID="cook-step-index">
            Schritt {index + 1} von {steps.length}
          </Text>
          <Text variant={isPhone ? 'title' : 'display'} selectable testID="cook-step-text">
            {step.text}
          </Text>
          {step.timerMinutes ? <StepTimer key={step.id} minutes={step.timerMinutes} /> : null}
        </Stack>
      ) : (
        <EmptyState
          icon="chef-hat"
          title="Noch keine Schritte"
          text="Für dieses Rezept ist noch keine Zubereitung hinterlegt."
        >
          <Button label="Zurück zum Rezept" onPress={props.onLeave} />
        </EmptyState>
      )}

      {ingredients.length > 0 ? (
        <View style={{ marginTop: 32 }}>
          <Button
            label={showIngredients ? 'Zutaten ausblenden' : 'Zutaten anzeigen'}
            icon={showIngredients ? 'chevron-up' : 'chevron-down'}
            variant="link"
            onPress={() => setShowIngredients(!showIngredients)}
            testID="cook-ingredients-toggle"
          />
          {showIngredients ? (
            <View style={{ marginTop: 8 }} testID="cook-ingredients">
              <List>
                {ingredients.map((ingredient) => (
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
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** A visual countdown; it does not ring and stops when the screen is left. */
function StepTimer(props: { minutes: number }) {
  const [remaining, setRemaining] = useState(props.minutes * 60);
  const [running, setRunning] = useState(false);

  const finished = remaining === 0;

  useEffect(() => {
    if (!running || finished) return;
    const timer = setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [running, finished]);

  const label = finished
    ? 'Timer abgelaufen'
    : running
      ? `Timer ${formatClock(remaining)}`
      : remaining === props.minutes * 60
        ? `Timer ${props.minutes} Min`
        : `Timer ${formatClock(remaining)} · Pause`;

  return (
    <Chip
      label={label}
      icon="timer"
      selected={running && !finished}
      onPress={() => {
        if (finished) {
          setRemaining(props.minutes * 60);
          setRunning(false);
        } else {
          setRunning(!running);
        }
      }}
      testID="cook-timer"
    />
  );
}
