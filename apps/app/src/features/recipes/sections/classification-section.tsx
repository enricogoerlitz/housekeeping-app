import { useRecipes } from '@housekeeping/api';
import {
  addTag,
  courseLabel,
  cuisineValues,
  dietLabel,
  normalizeText,
  tagValues,
  valueSuggestions,
  type ClassificationDraft,
  type Course,
  type Diet,
  type Recipe,
} from '@housekeeping/core';
import {
  Badge,
  Chip,
  ChoiceChips,
  EditableSection,
  SearchOrCreate,
  Stack,
  Text,
} from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { COURSES } from '../recipe-filter-panel';

import { SectionError, useSectionFrame } from './common';
import type { SectionEditor } from './use-section-editor';

/**
 * Einordnung (REQ-007): Gerichtart, Küche and Schlagworte, and the diet that follows from the
 * ingredients (shown, not edited). Küche and Schlagworte per "Suchen oder anlegen" over the values
 * of the household's recipes (AC-024).
 */
export function ClassificationSection(props: {
  recipe: Recipe;
  diet: Diet | undefined;
  editor: SectionEditor;
}) {
  const { recipe, diet, editor } = props;
  const frame = useSectionFrame(editor, 'classification', 'Einordnung');
  const draft = editor.draft?.section === 'classification' ? editor.draft : undefined;
  const plant = diet === 'vegan' || diet === 'vegetarian';
  return (
    <EditableSection {...frame} inline testID="recipe-classification">
      {draft ? (
        <ClassificationFields draft={draft} editor={editor} />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
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
      )}
    </EditableSection>
  );
}

function ClassificationFields(props: { draft: ClassificationDraft; editor: SectionEditor }) {
  const { draft, editor } = props;
  const recipes = useRecipes();
  const set = (patch: Partial<ClassificationDraft>) => editor.change({ ...draft, ...patch });
  const taken = new Set(draft.tags.map(normalizeText));
  return (
    <Stack gap={16}>
      <Field label="Gerichtart">
        <ChoiceChips<Course>
          label="Gerichtart"
          options={COURSES.map((course) => ({ value: course, label: courseLabel(course) }))}
          value={draft.course}
          onChange={(course) => set({ course })}
          testID="recipe-edit-course"
        />
      </Field>

      <Field label="Küche" error={editor.problem('cuisine')}>
        {draft.cuisine.trim() ? (
          <View style={{ flexDirection: 'row' }}>
            <Chip
              label={draft.cuisine.trim()}
              removable
              selected
              accessibilityLabel={`Küche ${draft.cuisine.trim()} entfernen`}
              onPress={() => set({ cuisine: '' })}
              testID="recipe-edit-cuisine-chosen"
            />
          </View>
        ) : (
          <ValuePicker
            label="Küche"
            placeholder="Küche suchen oder anlegen"
            values={cuisineValues(recipes)}
            onPick={(cuisine) => set({ cuisine })}
            testID="recipe-edit-cuisine"
          />
        )}
      </Field>

      <Field label="Schlagworte" error={editor.problem('tags')}>
        <Stack gap={10}>
          {draft.tags.length > 0 ? (
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
              testID="recipe-edit-tags"
            >
              {draft.tags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  removable
                  accessibilityLabel={`Schlagwort ${tag} entfernen`}
                  onPress={() => set({ tags: draft.tags.filter((other) => other !== tag) })}
                  testID={`recipe-edit-tag-${tag}`}
                />
              ))}
            </View>
          ) : null}
          <ValuePicker
            label="Schlagwort"
            placeholder="Schlagwort suchen oder anlegen"
            values={tagValues(recipes).filter((tag) => !taken.has(normalizeText(tag)))}
            onPick={(tag) => set({ tags: addTag(draft.tags, tag) })}
            testID="recipe-edit-tag"
          />
        </Stack>
      </Field>
      <SectionError editor={editor} testID="recipe-classification-error" />
    </Stack>
  );
}

function Field(props: { label: string; error?: string; children: ReactNode }) {
  return (
    <View>
      <Text variant="smallStrong" style={{ marginBottom: 6 }}>
        {props.label}
      </Text>
      {props.children}
      {props.error ? (
        <Text variant="small" color="warn" style={{ marginTop: 6 }}>
          {props.error}
        </Text>
      ) : null}
    </View>
  );
}

/** "Suchen oder anlegen" over existing values: a hit or „…“ neu anlegen (AC-024). */
function ValuePicker(props: {
  label: string;
  placeholder: string;
  values: readonly string[];
  onPick: (value: string) => void;
  testID: string;
}) {
  const [query, setQuery] = useState('');
  const result = valueSuggestions(query, props.values);
  const name = query.replace(/\s+/g, ' ').trim();
  const pick = (value: string) => {
    setQuery('');
    props.onPick(value);
  };
  return (
    <SearchOrCreate
      query={query}
      onQueryChange={setQuery}
      label={props.label}
      placeholder={props.placeholder}
      clearLabel="Suche leeren"
      hits={
        name === '' ? [] : result.matches.map(({ item }) => ({ key: item.id, title: item.name }))
      }
      onSelect={pick}
      createOptions={result.canCreate ? [{ key: 'new', label: `„${name}“ neu anlegen` }] : []}
      onCreate={() => pick(name)}
      brake={
        result.similar
          ? {
              question: `Meinst du ${result.similar.name}?`,
              acceptLabel: 'Ja',
              createAnywayLabel: 'Trotzdem neu',
              onAccept: () => {
                if (result.similar) pick(result.similar.name);
              },
            }
          : undefined
      }
      testID={props.testID}
    />
  );
}
