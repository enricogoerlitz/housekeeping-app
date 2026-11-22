import type { HeadDraft, Recipe } from '@housekeeping/core';
import { EditableSection, Icon, Row, Stack, Text, TextField } from '@housekeeping/ui';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SectionError, useSectionFrame } from './common';
import type { SectionEditor } from './use-section-editor';

/**
 * Kopf (REQ-007): title, description, portions and time; the pen sits beside the title. A
 * collection (spec 0009, E13) shows `badge` beside the title and `meta` instead of portions and
 * time, and edits no time.
 */
export function HeadSection(props: {
  recipe: Recipe;
  desktop: boolean;
  editor: SectionEditor;
  /** Beside the title, e.g. the Kennzeichen "Sammlung". */
  badge?: ReactNode;
  /** Replaces the line with portions and time, e.g. "für 6 · 2 Rezepte · 4 eigene Zutaten". */
  meta?: ReactNode;
}) {
  const { recipe, editor } = props;
  const frame = useSectionFrame(editor, 'head', 'Kopf');
  const draft = editor.draft?.section === 'head' ? editor.draft : undefined;
  return (
    <EditableSection {...frame} inline testID="recipe-head">
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
          {props.meta ?? (
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
          )}
        </View>
      )}
    </EditableSection>
  );
}

function HeadFields(props: { draft: HeadDraft; editor: SectionEditor }) {
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
        {draft.kind === 'collection' ? null : (
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
        )}
      </Row>
      <SectionError editor={editor} testID="recipe-head-error" />
    </Stack>
  );
}
