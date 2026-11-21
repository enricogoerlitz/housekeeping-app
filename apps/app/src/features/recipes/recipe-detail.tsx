import {
  addIngredientToList,
  deleteRecipe,
  discardRecipePhoto,
  OfflineError,
  rateRecipe,
  snapshot,
  toggleFavorite,
  useArticlesById,
  useCurrentMember,
  useMembers,
  useRecipe,
  useRecipeImage,
} from '@housekeeping/api';
import {
  canPutRecipeOnList,
  courseLabel,
  defaultVariantId,
  deriveRecipeDiet,
  dietLabel,
  ingredientLine,
  ingredientsForVariant,
  recipeDeletedLabel,
  scaleAmount,
  stepsForVariants,
  type Diet,
  type Id,
  type Recipe,
  type RecipeIngredient,
} from '@housekeeping/core';
import {
  Badge,
  Button,
  ChoiceChips,
  EmptyState,
  Icon,
  IconButton,
  List,
  ListRow,
  Menu,
  Notice,
  Photo,
  Row,
  Screen,
  ScreenHeader,
  Section,
  Stack,
  Text,
  toast,
  useBreakpoint,
  useTheme,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { ArticleSheet } from '@/features/articles/article-sheet';
import { MergeArticleDialog } from '@/features/articles/merge-article-dialog';
import { PlanRecipeSheet } from '@/features/meal-plan/plan-recipe-sheet';
import { FavoriteButton } from '@/features/shell/favorite-button';
import { MemberRatings } from '@/features/shell/member-ratings';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';
import { PantryCheckSheet } from '@/features/shopping/pantry-check-sheet';

import { IngredientSheet } from './ingredient-sheet';
import { IngredientsPasteSheet } from './ingredients-paste-sheet';
import {
  RecipeActions,
  RecipeMoreMenu,
  RecipePhotoStatus,
  useRecipePhoto,
  type RecipePhotoState,
} from './recipe-actions';
import { useIngredientDrafts } from './use-ingredient-drafts';

type IngredientAction = 'edit' | 'article';

export interface RecipeDetailProps {
  recipeId: Id;
  /** "‹ Essen": back to the list, at the same place (AC-015). */
  onBack: () => void;
}

/**
 * A recipe as a whole page in "Essen" (spec 0008, REQ-006, E12): the bar with "‹ Essen", the
 * title once scrolled (phones) and the actions; inside two columns from the desktop breakpoint.
 * Each block (head, Einordnung, Zutaten, Zubereitung, Notizen) is its own component, so section
 * editing (T7) can wrap each one.
 */
export function RecipeDetail(props: RecipeDetailProps) {
  const recipe = useRecipe(props.recipeId);
  // Set while this page deletes its own recipe: it leaves instead of showing "gibt es nicht mehr".
  const [leaving, setLeaving] = useState(false);
  if (!recipe) {
    if (leaving) return <Screen testID="recipe-screen" tone="essen" />;
    return <RecipeGone onBack={props.onBack} />;
  }
  // A new recipe starts with fresh local state (portions, variant).
  return (
    <RecipeDetailBody
      key={recipe.id}
      recipe={recipe}
      onBack={props.onBack}
      onDeleting={() => setLeaving(true)}
    />
  );
}

/** AC-021: deleted elsewhere, or an address from another household. */
function RecipeGone(props: { onBack: () => void }) {
  const router = useRouter();
  return (
    <Screen
      testID="recipe-screen"
      tone="essen"
      header={<ScreenHeader title="Rezept" titleOnScroll backLabel="Essen" onBack={props.onBack} />}
    >
      <EmptyState
        icon="book-open"
        title="Dieses Rezept gibt es nicht mehr"
        testID="recipe-not-found"
      >
        <Button
          label="Zu Essen"
          icon="arrow-left"
          onPress={() => (router.canGoBack() ? props.onBack() : router.replace('/rezepte'))}
          testID="recipe-not-found-back"
        />
      </EmptyState>
    </Screen>
  );
}

function RecipeDetailBody(props: { recipe: Recipe; onBack: () => void; onDeleting: () => void }) {
  const { recipe } = props;
  const router = useRouter();
  const online = useOnlineOnly();
  const me = useCurrentMember();
  const members = useMembers();
  const articlesById = useArticlesById();
  const { bp, isPhone } = useBreakpoint();
  const desktop = bp === 'desktop';
  // Displayed portions are local; when the recipe's own portions change (assistant), they follow.
  const [portions, setPortions] = useState({ base: recipe.servings, shown: recipe.servings });
  const shownServings = portions.base === recipe.servings ? portions.shown : recipe.servings;
  const [variantId, setVariantId] = useState<Id | undefined>(() => defaultVariantId(recipe));
  const [pantryCheck, setPantryCheck] = useState(false);
  const [planning, setPlanning] = useState(false);
  const photo = useRecipePhoto(recipe);

  const activeVariantId = recipe.variants.some((variant) => variant.id === variantId)
    ? variantId
    : defaultVariantId(recipe);
  const diet =
    recipe.ingredients.length > 0
      ? deriveRecipeDiet(recipe, activeVariantId, articlesById)
      : undefined;
  const shownVariants = activeVariantId
    ? [{ variantId: activeVariantId, portions: shownServings }]
    : [];
  // AC-060: the same rule as the calendar picker (AC-061) — something to buy, or nothing to do.
  const canGoOnList = canPutRecipeOnList(recipe, shownServings, shownVariants);

  const startCooking = () => {
    router.push({
      pathname: '/rezept/[id]/kochen',
      params: activeVariantId ? { id: recipe.id, variant: activeVariantId } : { id: recipe.id },
    });
  };

  /**
   * AC-043: back to "Essen" and the notice "… gelöscht · Rückgängig" for 5 s. Only when it ends
   * without "Rückgängig" does the own photo go (E5); a refusal brings everything back (AC-045).
   */
  const remove = () => {
    if (online.disabled) return;
    const restore = snapshot();
    props.onDeleting();
    let deletion;
    try {
      deletion = deleteRecipe(recipe.id);
    } catch (error) {
      if (!(error instanceof OfflineError)) throw error;
      return;
    }
    if (!deletion) return;
    const done = deletion;
    props.onBack();
    toast.show({
      message: recipeDeletedLabel(recipe.title),
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
      onExpire: () => void discardRecipePhoto(done),
    });
  };

  const actions = (
    <RecipeActions
      recipe={recipe}
      canGoOnList={canGoOnList}
      onPlan={() => setPlanning(true)}
      onList={() => setPantryCheck(true)}
      onCook={startCooking}
      compact={desktop}
    />
  );

  const headerRight = (
    <>
      <FavoriteButton
        testID="recipe-favorite"
        active={recipe.favoriteOf.includes(me.id)}
        disabled={online.disabled}
        hint={online.hint}
        onPress={() => toggleFavorite(recipe.id)}
      />
      {desktop ? actions : null}
      <RecipeMoreMenu recipe={recipe} photo={photo} onDelete={remove} />
    </>
  );

  const head = (
    <Stack gap={16} style={{ flex: 1, minWidth: 0 }}>
      <RecipeHead recipe={recipe} desktop={desktop} />
      <RecipeClassification recipe={recipe} diet={diet} />
      <MemberRatings
        ratings={recipe.ratings}
        members={members}
        me={me.id}
        onRate={(stars) => rateRecipe(recipe.id, stars)}
        disabled={online.disabled}
        hint={online.hint}
        testID="recipe-rating"
      />
      {desktop ? null : <View style={{ marginTop: 4 }}>{actions}</View>}
    </Stack>
  );

  const ingredients = (
    <RecipeIngredients
      recipe={recipe}
      variantId={activeVariantId}
      onVariant={setVariantId}
      servings={shownServings}
      onServings={(value) => setPortions({ base: recipe.servings, shown: Math.max(1, value) })}
    />
  );
  const steps = <RecipeSteps recipe={recipe} variantId={activeVariantId} />;
  const notes = <RecipeNotes recipe={recipe} />;

  return (
    <Screen
      testID="recipe-screen"
      tone="essen"
      header={
        <ScreenHeader
          title={recipe.title}
          titleOnScroll
          backLabel="Essen"
          onBack={props.onBack}
          right={headerRight}
          testID="recipe-bar-title"
        />
      }
    >
      <View testID="recipe-detail" style={{ gap: isPhone ? 24 : 32, paddingTop: 8 }}>
        {desktop ? (
          <>
            <Row gap={32} align="flex-start">
              <RecipePhoto recipe={recipe} photo={photo} style={{ flex: 1 }} />
              {head}
            </Row>
            <Row gap={32} align="flex-start">
              <View style={{ flex: 1, minWidth: 0 }}>{ingredients}</View>
              <Stack gap={32} style={{ flex: 1, minWidth: 0 }}>
                {steps}
                {notes}
              </Stack>
            </Row>
          </>
        ) : (
          <>
            <RecipePhoto recipe={recipe} photo={photo} />
            {head}
            {ingredients}
            {steps}
            {notes}
          </>
        )}

        {planning ? <PlanRecipeSheet recipe={recipe} onClose={() => setPlanning(false)} /> : null}
        {pantryCheck ? (
          <PantryCheckSheet
            recipes={[{ recipeId: recipe.id, portions: shownServings, variants: shownVariants }]}
            onClose={() => setPantryCheck(false)}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function RecipePhoto(props: { recipe: Recipe; photo: RecipePhotoState; style?: { flex: number } }) {
  const image = useRecipeImage(props.recipe);
  return (
    <Stack gap={4} style={props.style}>
      <Photo source={image} aspectRatio={4 / 3} alt={props.recipe.title} />
      <RecipePhotoStatus photo={props.photo} />
    </Stack>
  );
}

/** Kopf: title, description, portions and time. */
function RecipeHead(props: { recipe: Recipe; desktop: boolean }) {
  const { recipe } = props;
  return (
    <View testID="recipe-head" style={{ gap: 8 }}>
      <Text variant={props.desktop ? 'display' : 'title'} heading testID="recipe-title">
        {recipe.title}
      </Text>
      {recipe.description ? (
        <Text color="muted" testID="recipe-description">
          {recipe.description}
        </Text>
      ) : null}
      <Row gap={14} wrap>
        <Row gap={5}>
          <Icon name="users" size={16} color="muted" />
          <Text variant="small" color="muted" testID="recipe-servings">
            {recipe.servings === 1 ? '1 Portion' : `${recipe.servings} Portionen`}
          </Text>
        </Row>
        {recipe.totalMinutes !== undefined ? (
          <Row gap={5}>
            <Icon name="clock" size={16} color="muted" />
            <Text variant="small" color="muted" testID="recipe-minutes">
              {recipe.totalMinutes} Min
            </Text>
          </Row>
        ) : null}
      </Row>
    </View>
  );
}

/** Einordnung: Gerichtart, Küche, Schlagworte, and the diet that follows from the ingredients. */
function RecipeClassification(props: { recipe: Recipe; diet: Diet | undefined }) {
  const { recipe, diet } = props;
  const plant = diet === 'vegan' || diet === 'vegetarian';
  return (
    <View
      testID="recipe-classification"
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
    >
      <Badge label={courseLabel(recipe.course)} testID="recipe-course" />
      {recipe.cuisine ? <Badge label={recipe.cuisine} testID="recipe-cuisine" /> : null}
      {diet ? (
        <Badge
          label={dietLabel(diet)}
          icon={plant ? 'leaf' : undefined}
          tone={plant ? 'success' : 'neutral'}
          testID="recipe-diet"
        />
      ) : null}
      {recipe.tags.map((tag) => (
        <Text key={tag} variant="small" color="muted" testID={`recipe-tag-${tag}`}>
          #{tag}
        </Text>
      ))}
    </View>
  );
}

/**
 * Zutaten with the portions stepper (display only, AC-028), the variant choice, "Ist alle" and
 * ⋯ per ingredient. "+ Zutat" and "Mehrere einfügen" stay here until the section is edited as a
 * whole (T7).
 */
function RecipeIngredients(props: {
  recipe: Recipe;
  variantId: Id | undefined;
  onVariant: (id: Id) => void;
  servings: number;
  onServings: (value: number) => void;
}) {
  const { recipe, variantId } = props;
  const online = useOnlineOnly();
  const articlesById = useArticlesById();
  const drafts = useIngredientDrafts(recipe.id);
  // "+ Zutat" (new) or "Zutat bearbeiten" (an ingredient), spec 0007, REQ-001 and REQ-003.
  const [editing, setEditing] = useState<{ ingredient?: RecipeIngredient } | undefined>();
  // ⋯ → "Artikel bearbeiten" (spec 0007, AC-007) and, from there, "Zusammenführen" (REQ-007).
  const [articleFor, setArticleFor] = useState<Id | undefined>();
  const [merging, setMerging] = useState<{ sourceId: Id; targetId: Id } | undefined>();
  const ingredients = ingredientsForVariant(recipe, variantId);
  const factor = props.servings / recipe.servings;

  const markEmpty = (ingredient: RecipeIngredient) => {
    const restore = snapshot();
    const added = addIngredientToList(recipe.id, ingredient.id);
    if (!added) return;
    toast.show({
      message: `${added.articleName} steht auf der Liste`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
  };

  return (
    <Section
      title="Zutaten"
      testID="recipe-ingredients"
      action={<ServingsStepper value={props.servings} onChange={props.onServings} />}
    >
      {recipe.variants.length > 0 && variantId ? (
        <View testID="variant-select" style={{ marginBottom: 12 }}>
          <ChoiceChips
            label="Variante"
            testID="variant"
            value={variantId}
            onChange={props.onVariant}
            options={recipe.variants.map((variant) => ({ value: variant.id, label: variant.name }))}
          />
        </View>
      ) : null}
      {ingredients.length === 0 ? (
        <Text color="muted">Noch keine Zutaten.</Text>
      ) : (
        <List>
          {ingredients.map((ingredient) => (
            <ListRow
              key={ingredient.id}
              testID={`ingredient-${ingredient.id}`}
              title={<IngredientTitle ingredient={ingredient} />}
              accessibilityLabel={[
                ingredientLine(ingredient, articlesById[ingredient.articleId]?.name ?? '', factor),
                ingredient.shoppingNote ? `(${ingredient.shoppingNote})` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              leading={
                <Text
                  variant="bodyStrong"
                  style={{ width: 76 }}
                  testID={`ingredient-amount-${ingredient.id}`}
                >
                  {ingredient.amount ? scaleAmount(ingredient.amount, factor).text : ''}
                </Text>
              }
              trailing={
                <Row gap={0}>
                  <Menu<IngredientAction>
                    trigger="icon"
                    icon="ellipsis"
                    label="Mehr"
                    accessibilityLabel={`Mehr zu ${articlesById[ingredient.articleId]?.name ?? ''}`}
                    onChange={(action) => {
                      if (action === 'edit') setEditing({ ingredient });
                      else setArticleFor(ingredient.articleId);
                    }}
                    options={[
                      {
                        value: 'edit',
                        label: 'Zutat bearbeiten',
                        disabled: online.disabled,
                        hint: online.hint,
                      },
                      {
                        value: 'article',
                        label: 'Artikel bearbeiten',
                        disabled: !articlesById[ingredient.articleId],
                      },
                    ]}
                    testID={`ingredient-menu-${ingredient.id}`}
                  />
                  <IconButton
                    icon="shopping-basket"
                    label={`${articlesById[ingredient.articleId]?.name ?? ''} ist alle`}
                    onPress={() => markEmpty(ingredient)}
                    testID={`ingredient-empty-${ingredient.id}`}
                  />
                </Row>
              }
            />
          ))}
        </List>
      )}
      <Row gap={16} wrap style={{ marginTop: 8 }}>
        <Button
          label="Zutat"
          icon="plus"
          variant="link"
          onPress={() => setEditing({})}
          disabled={online.disabled}
          hint={online.hint}
          testID="recipe-add-ingredient"
        />
        <Button
          label="Mehrere einfügen"
          icon="clipboard-list"
          variant="link"
          onPress={drafts.open}
          disabled={online.disabled}
          hint={online.hint}
          testID="recipe-paste-ingredients"
        />
      </Row>
      <IngredientsPasteSheet state={drafts} />
      {editing ? (
        <IngredientSheet
          recipeId={recipe.id}
          ingredient={editing.ingredient}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      {articleFor ? (
        <ArticleSheet
          visible
          articleId={articleFor}
          onClose={() => setArticleFor(undefined)}
          onMerge={(targetId) => {
            setMerging({ sourceId: articleFor, targetId });
            setArticleFor(undefined);
          }}
        />
      ) : null}
      {merging ? (
        <MergeArticleDialog
          sourceId={merging.sourceId}
          targetId={merging.targetId}
          onCancel={() => setMerging(undefined)}
          onMerged={() => setMerging(undefined)}
        />
      ) : null}
    </Section>
  );
}

/** Zubereitung: Vorlauf and the steps of the chosen variant. */
function RecipeSteps(props: { recipe: Recipe; variantId: Id | undefined }) {
  const { recipe } = props;
  const steps = stepsForVariants(recipe, props.variantId ? [props.variantId] : undefined);
  return (
    <Section title="Zubereitung" testID="recipe-steps">
      <Stack gap={16}>
        {recipe.leadTime ? (
          <Notice
            icon="alarm-clock"
            text={`Vorlauf: ${recipe.leadTime.text}`}
            testID="recipe-lead-time"
          />
        ) : null}
        {steps.length === 0 ? (
          <Text color="muted">Noch keine Schritte.</Text>
        ) : (
          steps.map((step, index) => (
            <Row key={step.id} gap={12} align="flex-start">
              <StepNumber value={index + 1} />
              <Stack gap={4} style={{ flex: 1 }}>
                <Text testID={`recipe-step-${step.id}`}>{step.text}</Text>
                {step.timerMinutes ? (
                  <Row gap={5}>
                    <Icon name="timer" size={15} color="muted" />
                    <Text variant="caption" color="muted">
                      {step.timerMinutes} Min
                    </Text>
                  </Row>
                ) : null}
              </Stack>
            </Row>
          ))
        )}
      </Stack>
    </Section>
  );
}

/** Notizen: always there, so it can be written into (AC-023). */
function RecipeNotes(props: { recipe: Recipe }): ReactNode {
  return (
    <Section title="Notizen" testID="recipe-notes">
      {props.recipe.notes ? (
        <Text testID="recipe-notes-text">{props.recipe.notes}</Text>
      ) : (
        <Text color="muted">Noch keine Notizen.</Text>
      )}
    </Section>
  );
}

/**
 * The article's name, the Hinweis after "·" (only for cooking, spec 0007, AC-011) and the default
 * "Zusatz" that goes onto the shopping list: "Frischkäse · zimmerwarm (Philadelphia)" (AC-012).
 */
function IngredientTitle(props: { ingredient: RecipeIngredient }) {
  const { ingredient } = props;
  const article = useArticlesById()[ingredient.articleId];
  return (
    <View>
      <Text variant="rowTitle">
        {article?.name ?? ''}
        {ingredient.prepNote ? (
          <Text variant="body" testID={`ingredient-prep-note-${ingredient.id}`}>
            {' · '}
            {ingredient.prepNote}
          </Text>
        ) : null}
        {ingredient.shoppingNote ? (
          <Text variant="body" color="muted" testID={`ingredient-shopping-note-${ingredient.id}`}>
            {' '}
            ({ingredient.shoppingNote})
          </Text>
        ) : null}
      </Text>
      {ingredient.shoppingNote ? (
        <Row gap={4}>
          <Icon name="shopping-basket" size={13} color="muted" />
          <Text variant="caption" color="muted">
            Zusatz für die Einkaufsliste
          </Text>
        </Row>
      ) : null}
    </View>
  );
}

function ServingsStepper(props: { value: number; onChange: (value: number) => void }) {
  return (
    <Row gap={4}>
      <IconButton
        icon="minus"
        label="Eine Portion weniger"
        variant="soft"
        size={36}
        disabled={props.value <= 1}
        onPress={() => props.onChange(props.value - 1)}
        testID="servings-minus"
      />
      <Text variant="bodyStrong" align="center" style={{ minWidth: 28 }} testID="servings-value">
        {props.value}
      </Text>
      <IconButton
        icon="plus"
        label="Eine Portion mehr"
        variant="soft"
        size={36}
        onPress={() => props.onChange(props.value + 1)}
        testID="servings-plus"
      />
      <Text variant="small" color="muted">
        {props.value === 1 ? 'Portion' : 'Portionen'}
      </Text>
    </Row>
  );
}

function StepNumber(props: { value: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceSunken,
      }}
    >
      <Text variant="smallStrong">{props.value}</Text>
    </View>
  );
}
