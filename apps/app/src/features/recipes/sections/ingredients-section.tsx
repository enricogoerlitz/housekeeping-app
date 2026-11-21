import { addIngredientToList, snapshot, useArticles, useArticlesById } from '@housekeeping/api';
import {
  addIngredientRows,
  addVariant,
  chooseRowArticle,
  ingredientLine,
  ingredientsForVariant,
  moveIngredientAmong,
  openRows,
  removeIngredient,
  removeVariant,
  renameVariant,
  rowArticleName,
  scaleAmount,
  setDefaultVariant,
  validateSectionDraft,
  type Article,
  type Id,
  type IngredientRow,
  type IngredientsDraft,
  type Recipe,
  type RecipeIngredient,
} from '@housekeeping/core';
import {
  Button,
  ChoiceChips,
  EditableSection,
  Icon,
  IconButton,
  List,
  ListRow,
  Menu,
  ReorderList,
  Row,
  Stack,
  Text,
  toast,
  type ReorderListLabels,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { ArticleSheet } from '@/features/articles/article-sheet';
import { MergeArticleDialog } from '@/features/articles/merge-article-dialog';
import { undoAction } from '@/features/shell/offline';

import { IngredientSheet } from '../ingredient-sheet';
import { IngredientsPasteSheet } from '../ingredients-paste-sheet';

import { SectionError, useSectionFrame } from './common';
import { OpenRows } from './open-rows';
import { TextSheet } from './text-sheet';
import type { SectionEditor } from './use-section-editor';

type RowAction = 'edit' | 'up' | 'down' | 'remove';
type VariantAction = 'rename' | 'default' | 'remove';

const ROW_LABELS: ReorderListLabels = {
  handle: (name) => `${name} verschieben`,
  up: (name) => `${name} nach oben`,
  down: (name) => `${name} nach unten`,
  position: (name, index, total) => `${name}, Position ${index + 1} von ${total}`,
};

/**
 * Zutaten (REQ-008) with the portions stepper (display only, AC-028) and the variant choice. Read:
 * "Ist alle" and ⋯ "Artikel bearbeiten" per ingredient (spec 0007, AC-007). Edited as a whole:
 * rows with ≡, Menge, Artikel and ⋯, "+ Zutat", "Mehrere einfügen" and "+ Variante" (E9).
 */
export function IngredientsSection(props: {
  recipe: Recipe;
  variantId: Id | undefined;
  onVariant: (id: Id) => void;
  servings: number;
  onServings: (value: number) => void;
  editor: SectionEditor;
}) {
  const { editor } = props;
  const frame = useSectionFrame(editor, 'ingredients', 'Zutaten');
  const draft = editor.draft?.section === 'ingredients' ? editor.draft : undefined;
  return (
    <EditableSection
      {...frame}
      accessory={<ServingsStepper value={props.servings} onChange={props.onServings} />}
      testID="recipe-ingredients"
    >
      {draft ? (
        <IngredientsFields draft={draft} editor={editor} />
      ) : (
        <IngredientsRead
          recipe={props.recipe}
          variantId={props.variantId}
          onVariant={props.onVariant}
          servings={props.servings}
        />
      )}
    </EditableSection>
  );
}

function IngredientsRead(props: {
  recipe: Recipe;
  variantId: Id | undefined;
  onVariant: (id: Id) => void;
  servings: number;
}) {
  const { recipe, variantId } = props;
  const articlesById = useArticlesById();
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
    <>
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
                  <Menu<'article'>
                    trigger="icon"
                    icon="ellipsis"
                    label="Mehr"
                    accessibilityLabel={`Mehr zu ${articlesById[ingredient.articleId]?.name ?? ''}`}
                    onChange={() => setArticleFor(ingredient.articleId)}
                    options={[
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
    </>
  );
}

/** What a row of the open section says under its name: variant, group, Hinweis, Zusatz, new. */
function rowDetail(row: IngredientRow, draft: IngredientsDraft): string | undefined {
  const variant = draft.variants.find((candidate) => candidate.id === row.variantId);
  const parts = [
    variant ? variant.name.trim() || 'Ohne Namen' : undefined,
    row.group.trim() || undefined,
    row.prepNote.trim() || undefined,
    row.shoppingNote.trim() ? `Liste: ${row.shoppingNote.trim()}` : undefined,
    row.article?.kind === 'new' || row.article?.kind === 'hit' ? 'neu' : undefined,
  ];
  return parts.filter(Boolean).join(' · ') || undefined;
}

function rowName(row: IngredientRow, articlesById: Record<Id, Article>): string {
  return [row.amountText.trim(), rowArticleName(row, articlesById)].filter(Boolean).join(' ');
}

function IngredientsFields(props: { draft: IngredientsDraft; editor: SectionEditor }) {
  const { draft, editor } = props;
  const articles = useArticles();
  const articlesById = useArticlesById();
  const [sheet, setSheet] = useState<
    { kind: 'row'; key?: string } | { kind: 'paste' } | { kind: 'variant'; id?: Id } | undefined
  >();
  const set = (next: IngredientsDraft) => editor.change(next);

  const open = openRows(draft, articles);
  const openKeys = new Set(open.map((row) => row.key));
  const ready = draft.rows.filter((row) => !openKeys.has(row.key));
  const shownKeys = ready.map((row) => row.key);
  const move = (key: string, toIndex: number) =>
    set(moveIngredientAmong(draft, key, toIndex, shownKeys));

  const variantProblem = (id: Id) => editor.problem('variant', id);
  const rowProblems = draft.rows.flatMap((row) => {
    const message = editor.problem('ingredient', row.key);
    return message ? [`${rowName(row, articlesById) || 'Zutat'}: ${message}`] : [];
  });
  const listProblems = [editor.problem('ingredients'), editor.problem('variants')].filter(
    (message): message is string => message !== undefined,
  );
  const variantSheet = sheet?.kind === 'variant' ? sheet : undefined;
  const renamed = draft.variants.find((variant) => variant.id === variantSheet?.id);

  return (
    <Stack gap={16}>
      {draft.variants.length > 0 ? (
        <View testID="recipe-edit-variants">
          <Text variant="smallStrong" style={{ marginBottom: 6 }}>
            Varianten
          </Text>
          <List>
            {draft.variants.map((variant) => (
              <ListRow
                key={variant.id}
                testID={`recipe-variant-${variant.id}`}
                title={variant.name.trim() || 'Ohne Namen'}
                subtitle={
                  variantProblem(variant.id) ?? (variant.isDefault ? 'Standard' : undefined)
                }
                trailing={
                  <Menu<VariantAction>
                    trigger="icon"
                    icon="ellipsis"
                    label="Mehr"
                    accessibilityLabel={`Mehr zu Variante ${variant.name}`}
                    onChange={(action) => {
                      if (action === 'rename') setSheet({ kind: 'variant', id: variant.id });
                      else if (action === 'default') set(setDefaultVariant(draft, variant.id));
                      else set(removeVariant(draft, variant.id));
                    }}
                    options={[
                      { value: 'rename', label: 'Umbenennen' },
                      { value: 'default', label: 'Als Standard', disabled: variant.isDefault },
                      { value: 'remove', label: 'Entfernen' },
                    ]}
                    testID={`recipe-variant-menu-${variant.id}`}
                  />
                }
              />
            ))}
          </List>
        </View>
      ) : null}

      {/* Orange rows first: they keep the section open (AC-032). */}
      <OpenRows
        rows={open}
        onChoose={(key, article) => set(chooseRowArticle(draft, key, article))}
        onRemove={(key) => set(removeIngredient(draft, key))}
      />
      {ready.length > 0 ? (
        <ReorderList
          items={ready.map((row) => ({
            key: row.key,
            name: rowName(row, articlesById),
            subtitle: rowDetail(row, draft),
          }))}
          onMove={move}
          labels={ROW_LABELS}
          trailing={(item, index) => (
            <Menu<RowAction>
              trigger="icon"
              icon="ellipsis"
              label="Mehr"
              accessibilityLabel={`Mehr zu ${item.name}`}
              onChange={(action) => {
                if (action === 'edit') setSheet({ kind: 'row', key: item.key });
                else if (action === 'remove') set(removeIngredient(draft, item.key));
                else move(item.key, index + (action === 'up' ? -1 : 1));
              }}
              options={[
                { value: 'edit', label: 'Bearbeiten' },
                { value: 'up', label: 'Nach oben', disabled: index === 0 },
                { value: 'down', label: 'Nach unten', disabled: index === ready.length - 1 },
                { value: 'remove', label: 'Entfernen' },
              ]}
              testID={`recipe-row-menu-${item.key}`}
            />
          )}
          testID="recipe-rows"
        />
      ) : open.length === 0 ? (
        <Text color="muted">Noch keine Zutaten.</Text>
      ) : null}

      {[...rowProblems, ...listProblems].map((message) => (
        <Text key={message} variant="small" color="warn">
          {message}
        </Text>
      ))}

      <Row gap={16} wrap>
        <Button
          label="Zutat"
          icon="plus"
          variant="link"
          onPress={() => setSheet({ kind: 'row' })}
          testID="recipe-add-ingredient"
        />
        <Button
          label="Mehrere einfügen"
          icon="clipboard-list"
          variant="link"
          onPress={() => setSheet({ kind: 'paste' })}
          testID="recipe-paste-ingredients"
        />
        <Button
          label="Variante"
          icon="plus"
          variant="link"
          onPress={() => setSheet({ kind: 'variant' })}
          testID="recipe-add-variant"
        />
      </Row>
      <SectionError editor={editor} testID="recipe-ingredients-error" />

      {sheet?.kind === 'row' ? (
        <IngredientSheet
          draft={draft}
          rowKey={sheet.key}
          onApply={(next) => {
            set(next);
            setSheet(undefined);
          }}
          onClose={() => setSheet(undefined)}
        />
      ) : null}
      {sheet?.kind === 'paste' ? (
        <IngredientsPasteSheet
          onPaste={(rows) => {
            set(addIngredientRows(draft, rows));
            setSheet(undefined);
          }}
          onClose={() => setSheet(undefined)}
        />
      ) : null}
      {variantSheet ? (
        <VariantSheet
          draft={draft}
          variantId={renamed?.id}
          onApply={(next) => {
            set(next);
            setSheet(undefined);
          }}
          onClose={() => setSheet(undefined)}
        />
      ) : null}
    </Stack>
  );
}

/** "+ Variante" and ⋯ → "Umbenennen": the name is checked like "Fertig" checks it (E8). */
function VariantSheet(props: {
  draft: IngredientsDraft;
  variantId?: Id;
  onApply: (draft: IngredientsDraft) => void;
  onClose: () => void;
}) {
  const { draft } = props;
  const [id] = useState(() => props.variantId ?? crypto.randomUUID());
  const current = draft.variants.find((variant) => variant.id === props.variantId);
  const withName = (name: string) =>
    current ? renameVariant(draft, id, name) : addVariant(draft, name, id);
  return (
    <TextSheet
      title={current ? 'Variante umbenennen' : 'Neue Variante'}
      label="Name"
      placeholder="z. B. mit Garnelen"
      initial={current?.name ?? ''}
      check={(name) =>
        validateSectionDraft(withName(name)).find(
          (problem) => problem.field === 'variant' && problem.key === id,
        )?.message ??
        (current
          ? undefined
          : validateSectionDraft(withName(name)).find((problem) => problem.field === 'variants')
              ?.message)
      }
      onApply={(name) => props.onApply(withName(name.trim()))}
      onClose={props.onClose}
      testID="recipe-variant-sheet"
    />
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
