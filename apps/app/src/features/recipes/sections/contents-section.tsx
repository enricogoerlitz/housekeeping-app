import {
  collectionContentLabel,
  inheritedServingsHint,
  inheritedServingsPlaceholder,
  defaultVariantId,
  moveContent,
  removeContent,
  setContentServings,
  setContentVariant,
  validateContentsDraft,
  type CollectionContent,
  type ContentsRow,
  type Id,
  type Recipe,
} from '@housekeeping/core';
import {
  Button,
  ChoiceChips,
  EditableSection,
  List,
  ListRow,
  Menu,
  ReorderList,
  Sheet,
  Stack,
  Text,
  TextField,
  type ReorderListLabels,
} from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';

import { CollectionRecipesSheet } from '../collection-recipes-sheet';
import { RecipeCover } from '../recipe-cover';

import { SectionError, useSectionFrame } from './common';
import type { ContentsSectionDraft, SectionEditor } from './use-section-editor';

type RowAction = 'edit' | 'up' | 'down' | 'remove';

const ROW_LABELS: ReorderListLabels = {
  handle: (name) => `${name} verschieben`,
  up: (name) => `${name} nach oben`,
  down: (name) => `${name} nach unten`,
  position: (name, index, total) => `${name}, Position ${index + 1} von ${total}`,
  open: (name) => `${name} bearbeiten`,
};

/**
 * "Enthält" on the page of a collection (spec 0009, REQ-003, E13): the contained recipes in their
 * order, "Kartoffelsalat · 6 Port." or with a chosen variant "Grillgemüse · vegan · 8 Port."
 * (AC-016); a tap opens the recipe's page (AC-004), "+ Rezept hinzufügen" the window "Rezepte zu …"
 * (AC-006). The pen edits order, portions and variant per recipe and removes recipes; "Fertig"
 * saves it all as one write (E12), the recipes themselves stay.
 */
export function ContentsSection(props: {
  collection: Recipe;
  contents: readonly CollectionContent[];
  onOpen: (recipeId: Id) => void;
  editor: SectionEditor;
}) {
  const { editor } = props;
  const online = useOnlineOnly();
  const frame = useSectionFrame(editor, 'contents', 'Enthält');
  const draft = editor.draft?.section === 'contents' ? editor.draft : undefined;
  const [picking, setPicking] = useState(false);
  return (
    <EditableSection {...frame} testID="collection-contents">
      {draft ? (
        <ContentsFields
          collection={props.collection}
          contents={props.contents}
          draft={draft}
          editor={editor}
        />
      ) : (
        <Stack gap={12}>
          {props.contents.length === 0 ? (
            <Text color="muted" testID="collection-contents-empty">
              Noch keine Rezepte.
            </Text>
          ) : (
            <List>
              {props.contents.map((content) => (
                <ListRow
                  key={content.row.id}
                  testID={`collection-content-${content.recipe.id}`}
                  title={collectionContentLabel(content)}
                  leading={<RecipeCover recipe={content.recipe} width={44} height={44} />}
                  onPress={() => props.onOpen(content.recipe.id)}
                />
              ))}
            </List>
          )}
          <Button
            label="Rezept hinzufügen"
            icon="plus"
            variant="link"
            onPress={() => setPicking(true)}
            disabled={online.disabled}
            hint={online.hint}
            testID="collection-add-recipes"
          />
        </Stack>
      )}
      {picking ? (
        <CollectionRecipesSheet collection={props.collection} onClose={() => setPicking(false)} />
      ) : null}
    </EditableSection>
  );
}

/** The line under a recipe while "Enthält" is open: "vegan · 8 Port.", "6 Port. (wie Sammlung)". */
function rowDetail(row: ContentsRow, recipe: Recipe | undefined, collection: Recipe): string {
  const variant =
    recipe && row.variantId !== undefined && row.variantId !== defaultVariantId(recipe)
      ? recipe.variants.find((candidate) => candidate.id === row.variantId)?.name
      : undefined;
  const servings = row.servings.trim();
  const portions = servings ? `${servings} Port.` : `${collection.servings} Port. (wie Sammlung)`;
  return [variant, portions].filter(Boolean).join(' · ');
}

function ContentsFields(props: {
  collection: Recipe;
  contents: readonly CollectionContent[];
  draft: ContentsSectionDraft;
  editor: SectionEditor;
}) {
  const { collection, draft, editor } = props;
  const [editingRow, setEditingRow] = useState<Id | undefined>();
  const set = (next: ContentsSectionDraft) => editor.change(next);
  // Rows of the draft keep their recipe even when the row was removed elsewhere meanwhile.
  const recipeOf = new Map(props.contents.map((content) => [content.row.recipeId, content.recipe]));
  const nameOf = (row: ContentsRow) => recipeOf.get(row.recipeId)?.title ?? 'Rezept';
  const move = (key: string, toIndex: number) =>
    set({ ...moveContent(draft, key, toIndex), section: 'contents' });
  const shownRow = draft.rows.find((row) => row.id === editingRow);
  const removedProblem = editor.problem('removed');

  return (
    <Stack gap={16}>
      {draft.rows.length > 0 ? (
        <ReorderList
          items={draft.rows.map((row) => ({
            key: row.id,
            name: nameOf(row),
            subtitle:
              editor.problem('servings', row.id) ??
              rowDetail(row, recipeOf.get(row.recipeId), collection),
          }))}
          onMove={move}
          onPress={(key) => setEditingRow(key)}
          labels={ROW_LABELS}
          trailing={(item, index) => (
            <Menu<RowAction>
              trigger="icon"
              icon="ellipsis"
              label="Mehr"
              accessibilityLabel={`Mehr zu ${item.name}`}
              onChange={(action) => {
                if (action === 'edit') setEditingRow(item.key);
                else if (action === 'remove') {
                  set({ ...removeContent(draft, item.key), section: 'contents' });
                } else move(item.key, index + (action === 'up' ? -1 : 1));
              }}
              options={[
                { value: 'edit', label: 'Portionen und Variante' },
                { value: 'up', label: 'Nach oben', disabled: index === 0 },
                { value: 'down', label: 'Nach unten', disabled: index === draft.rows.length - 1 },
                { value: 'remove', label: 'Aus der Sammlung entfernen' },
              ]}
              testID={`collection-row-menu-${item.key}`}
            />
          )}
          testID="collection-rows"
        />
      ) : (
        <Text color="muted">Noch keine Rezepte.</Text>
      )}
      {draft.rows.some((row) => editor.problem('servings', row.id)) ? (
        <Text variant="small" color="warn" testID="collection-contents-problem">
          1 bis 100 Portionen
        </Text>
      ) : null}
      {removedProblem ? (
        <Text variant="small" color="warn" testID="collection-contents-removed">
          {removedProblem}
        </Text>
      ) : null}
      <SectionError editor={editor} testID="collection-contents-error" />
      {shownRow ? (
        <ContentSheet
          collection={collection}
          recipe={recipeOf.get(shownRow.recipeId)}
          name={nameOf(shownRow)}
          draft={draft}
          row={shownRow}
          onApply={(next) => {
            set(next);
            setEditingRow(undefined);
          }}
          onClose={() => setEditingRow(undefined)}
        />
      ) : null}
    </Stack>
  );
}

/**
 * Portions and variant of one recipe in the collection (AC-015, AC-016): blank portions take the
 * collection's ("wie Sammlung", spec 0023, AC-058); the variant only for a recipe with variants. "Übernehmen" changes the
 * draft; "Fertig" of the section saves.
 */
function ContentSheet(props: {
  collection: Recipe;
  recipe: Recipe | undefined;
  name: string;
  draft: ContentsSectionDraft;
  row: ContentsRow;
  onApply: (draft: ContentsSectionDraft) => void;
  onClose: () => void;
}) {
  const { collection, recipe, row } = props;
  const fallback = recipe ? defaultVariantId(recipe) : undefined;
  const [servings, setServings] = useState(row.servings);
  const [variantId, setVariantId] = useState(row.variantId ?? fallback);
  const [error, setError] = useState<string | undefined>();

  const apply = () => {
    const withServings = setContentServings(props.draft, row.id, servings);
    // The default variant is stored as "none": the recipe's default then (Daten: leer = Standard).
    const next = setContentVariant(
      withServings,
      row.id,
      variantId === fallback ? undefined : variantId,
    );
    const problem = validateContentsDraft(next).find(
      (candidate) => candidate.field === 'servings' && candidate.key === row.id,
    );
    if (problem) {
      setError(problem.message);
      return;
    }
    props.onApply({ ...next, section: 'contents' });
  };

  return (
    <Sheet
      visible
      size="s"
      title={props.name}
      onClose={props.onClose}
      testID="collection-row-sheet"
      footer={
        <Button
          label="Übernehmen"
          icon="check"
          full
          onPress={apply}
          testID="collection-row-sheet-apply"
        />
      }
    >
      <Stack gap={16}>
        <TextField
          label="Portionen"
          placeholder={inheritedServingsPlaceholder(collection.servings)}
          hint={inheritedServingsHint(collection.servings)}
          value={servings}
          onChangeText={(text) => {
            setServings(text);
            setError(undefined);
          }}
          onSubmitEditing={apply}
          keyboardType="number-pad"
          error={error}
          autoFocus
          testID="collection-row-servings"
        />
        {recipe && recipe.variants.length > 0 && variantId !== undefined ? (
          <Stack gap={6}>
            <Text variant="smallStrong">Variante</Text>
            <ChoiceChips
              label="Variante"
              value={variantId}
              onChange={setVariantId}
              options={recipe.variants.map((variant) => ({
                value: variant.id,
                label: variant.name,
              }))}
              testID="collection-row-variant"
            />
          </Stack>
        ) : null}
      </Stack>
    </Sheet>
  );
}
