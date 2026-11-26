import { useArticlesById, useRecipes } from '@housekeeping/api';
import {
  addTag,
  courseLabel,
  cuisineValues,
  dietLabel,
  ingredientsForVariant,
  normalizeText,
  unknownDietArticles,
  tagValues,
  valueOnEnter,
  valueSuggestions,
  type ClassificationDraft,
  type Course,
  type Diet,
  type Id,
  type Recipe,
} from '@housekeeping/core';
import {
  Badge,
  Chip,
  ChoiceChips,
  EditableSection,
  List,
  ListRow,
  SearchOrCreate,
  Sheet,
  Stack,
  Text,
  Button,
} from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { ArticleSheet } from '@/features/articles/article-sheet';
import { MergeArticleDialog } from '@/features/articles/merge-article-dialog';
import { useOnlineOnly } from '@/features/shell/offline';

import { COURSES } from '../recipe-filter-panel';

import { SectionError, useSectionFrame } from './common';
import type { SectionEditor } from './use-section-editor';

/**
 * Einordnung (REQ-007): Gerichtart, Küche and Schlagworte, and the diet that follows from the
 * ingredients (shown, not edited). Küche and Schlagworte per "Suchen oder anlegen" over the values
 * of the household's recipes (AC-024). The chip "unbekannt" opens "Warum unbekannt?" (spec 0023,
 * REQ-008).
 */
export function ClassificationSection(props: {
  recipe: Recipe;
  /** The chip of the shown variant (core recipeDietChip); undefined = no chip. */
  diet: Diet | undefined;
  variantId: Id | undefined;
  editor: SectionEditor;
}) {
  const { recipe, diet, editor } = props;
  const [why, setWhy] = useState(false);
  const frame = useSectionFrame(editor, 'classification', 'Einordnung');
  const draft = editor.draft?.section === 'classification' ? editor.draft : undefined;
  const plant = diet === 'vegan' || diet === 'vegetarian';
  return (
    <EditableSection {...frame} inline testID="recipe-classification">
      {draft ? (
        <ClassificationFields draft={draft} editor={editor} />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {recipe.course ? (
            <Badge label={courseLabel(recipe.course)} testID="recipe-course" />
          ) : null}
          {recipe.cuisine ? <Badge label={recipe.cuisine} testID="recipe-cuisine" /> : null}
          {diet === 'unknown' ? (
            <Chip
              label={dietLabel(diet)}
              icon="info"
              accessibilityLabel="Ernährung unbekannt: Warum?"
              onPress={() => setWhy(true)}
              testID="recipe-diet"
            />
          ) : diet ? (
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
      {why ? (
        <UnknownDietSheet
          recipe={recipe}
          variantId={props.variantId}
          onClose={() => setWhy(false)}
        />
      ) : null}
    </EditableSection>
  );
}

/**
 * "Warum unbekannt?" (spec 0023, AC-027): the articles of the shown variant without a diet, each
 * with "Festlegen", which opens "Artikel bearbeiten". Opens offline; "Festlegen" only online.
 */
function UnknownDietSheet(props: {
  recipe: Recipe;
  variantId: Id | undefined;
  onClose: () => void;
}) {
  const articlesById = useArticlesById();
  const online = useOnlineOnly();
  const [articleFor, setArticleFor] = useState<Id | undefined>();
  const [merging, setMerging] = useState<{ sourceId: Id; targetId: Id } | undefined>();
  const unknown = unknownDietArticles(
    ingredientsForVariant(props.recipe, props.variantId),
    articlesById,
  );
  return (
    <Sheet visible size="s" title="Warum unbekannt?" onClose={props.onClose} testID="diet-why">
      <Stack gap={12}>
        <Text>Bei diesen Zutaten fehlt die Ernährung:</Text>
        <List>
          {unknown.map((article) => (
            <ListRow
              key={article.id}
              title={article.name}
              trailing={
                <Button
                  label="Festlegen"
                  size="sm"
                  variant="secondary"
                  disabled={online.disabled}
                  hint={online.hint}
                  onPress={() => setArticleFor(article.id)}
                  testID={`diet-why-set-${article.id}`}
                />
              }
              testID={`diet-why-${article.id}`}
            />
          ))}
        </List>
        {online.hint ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : null}
      </Stack>
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
    </Sheet>
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

/**
 * "Suchen oder anlegen" over existing values: a hit or „…“ neu anlegen (AC-024). After a value the
 * cursor stays in the field; Enter takes an exactly equal value or creates the typed one (spec
 * 0036, REQ-004).
 */
export function ValuePicker(props: {
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
      onSubmit={() => {
        const value = valueOnEnter(query, props.values);
        if (value) pick(value);
      }}
      keepFocus
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
