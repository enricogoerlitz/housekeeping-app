import type { HeadDraft, Recipe } from '@housekeeping/core';
import { Icon, Row, Stack, Text, TextField } from '@housekeeping/ui';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { RecipeSection } from './common';
import type { PageEditor } from './use-page-editor';

/**
 * Kopf (REQ-007): title, description, portions and time; in the edit mode of the page (spec 0037)
 * their fields. A collection (spec 0009, E13) shows `badge` beside the title and `meta` instead of
 * the portions, and its time like a recipe (spec 0037, REQ-005).
 */
export function HeadSection(props: {
  recipe: Recipe;
  desktop: boolean;
  editor: PageEditor;
  /** Beside the title, e.g. the Kennzeichen "Sammlung". */
  badge?: ReactNode;
  /** Replaces the line with portions and time, e.g. "für 6 · 2 Rezepte · 4 eigene Zutaten". */
  meta?: ReactNode;
}) {
  const { recipe, editor } = props;
  const draft = editor.draft?.head;
  return (
    <RecipeSection title="Kopf" inline testID="recipe-head">
      {draft ? (
        <HeadFields draft={draft} editor={editor} />
      ) : (
        <View style={{ gap: 8 }}>
          <Row gap={10} wrap>
            <Text
              variant={props.desktop ? 'display' : 'title'}
              heading
              style={{ flexShrink: 1 }}
              testID="recipe-title"
            >
              {recipe.title}
            </Text>
            {props.badge}
          </Row>
          {recipe.description ? (
            <Text color="muted" selectable testID="recipe-description">
              {recipe.description}
            </Text>
          ) : null}
          <Row gap={14} wrap>
            {props.meta ?? (
              <Row gap={5}>
                <Icon name="users" size={16} color="muted" />
                <Text variant="small" color="muted" testID="recipe-servings">
                  {recipe.servings === 1 ? '1 Portion' : `${recipe.servings} Portionen`}
                </Text>
              </Row>
            )}
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
      )}
    </RecipeSection>
  );
}

function HeadFields(props: { draft: HeadDraft; editor: PageEditor }) {
  const { draft, editor } = props;
  const set = (patch: Partial<HeadDraft>) => editor.change({ ...draft, ...patch });
  return (
    <Stack gap={14}>
      <TextField
        label="Titel"
        value={draft.title}
        onChangeText={(title) => set({ title })}
        error={editor.problem('title')}
        autoFocus
        testID="recipe-head-title"
      />
      <TextField
        label="Beschreibung"
        value={draft.description}
        onChangeText={(description) => set({ description })}
        error={editor.problem('description')}
        multiline
        testID="recipe-head-description"
      />
      <Row gap={12} align="flex-start">
        <TextField
          label="Portionen"
          value={draft.servings}
          onChangeText={(servings) => set({ servings })}
          error={editor.problem('servings')}
          keyboardType="number-pad"
          style={{ flex: 1 }}
          testID="recipe-head-servings"
        />
        <TextField
          label="Zeit in Minuten"
          placeholder="z. B. 45"
          value={draft.totalMinutes}
          onChangeText={(totalMinutes) => set({ totalMinutes })}
          error={editor.problem('totalMinutes')}
          keyboardType="number-pad"
          style={{ flex: 1 }}
          testID="recipe-head-minutes"
        />
      </Row>
    </Stack>
  );
}
