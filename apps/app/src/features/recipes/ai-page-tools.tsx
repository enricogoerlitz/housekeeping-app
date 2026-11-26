import { imageFailureNotice, type Recipe } from '@housekeeping/core';
import { Button, Notice, Photo, Row, Stack, Text, useTheme } from '@housekeeping/ui';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { features } from '@/lib/features';

import { dismissPhotoSuggestions, startPhotoSuggestions, usePhotoSuggestions } from './ai-draft';
import { AiFillSheet, toastUnreadLinks, useDraftInput } from './ai-fill';
import type { PageEditor } from './sections/use-page-editor';

/**
 * The AI in the edit mode of a recipe (spec 0040): "Mit KI ausfüllen" (REQ-001, AC-006) and the
 * three photo suggestions of "Foto generieren" (REQ-003, AC-010). Hidden while reading and for
 * collections; only with `features.aiRecipes`.
 */
export function AiPageTools(props: { recipe: Recipe; editor: PageEditor }) {
  const { recipe, editor } = props;
  const online = useOnlineOnly();
  const [filling, setFilling] = useState(false);
  const draftInput = useDraftInput();
  if (!features.aiRecipes || !editor.draft || recipe.kind !== 'recipe') return null;
  const hasIngredients = editor.draft.ingredients.rows.length > 0;
  return (
    <Stack gap={12}>
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          label="Mit KI ausfüllen"
          icon="sparkles"
          variant="link"
          size="sm"
          disabled={online.disabled || editor.saving}
          hint={online.hint}
          onPress={() => setFilling(true)}
          testID="recipe-ai-fill-open"
        />
      </View>
      <PhotoSuggestionsPanel recipe={recipe} editor={editor} />
      {filling ? (
        <AiFillSheet
          hasIngredients={hasIngredients}
          onClose={() => setFilling(false)}
          onDraft={({ reply, replace, generatePhoto }) => {
            editor.load(draftInput(reply), undefined, { replace });
            toastUnreadLinks(reply.sources);
            if (generatePhoto && reply.draft.imagePrompt) {
              startPhotoSuggestions(recipe.id, {
                prompt: reply.draft.imagePrompt,
                coverUrl: reply.sources.find((source) => source.coverUrl)?.coverUrl,
              });
            }
          }}
        />
      ) : null}
    </Stack>
  );
}

/** AC-010: three suggestions; "Übernehmen" makes one the draft's photo (saved with "Speichern"). */
function PhotoSuggestionsPanel(props: { recipe: Recipe; editor: PageEditor }) {
  const { recipe, editor } = props;
  const theme = useTheme();
  const suggestions = usePhotoSuggestions(recipe.id);
  const [selected, setSelected] = useState(0);
  if (!suggestions) return null;
  const id = 'recipe-photo-suggestions';
  if (suggestions.status === 'loading') {
    return (
      <Stack gap={8}>
        <Text variant="smallStrong" testID={id}>
          Fotovorschläge
        </Text>
        <Row gap={8}>
          {[0, 1, 2].map((index) => (
            <View key={index} style={{ flex: 1 }}>
              <Photo loading aspectRatio={1} />
            </View>
          ))}
        </Row>
        <Text variant="small" color="muted" testID={`${id}-busy`}>
          Die KI erzeugt drei Fotos …
        </Text>
      </Stack>
    );
  }
  if (suggestions.status === 'failed') {
    return <Notice icon="circle-alert" text={suggestions.message} testID={`${id}-error`} />;
  }
  const chosen = suggestions.photos.findIndex((entry) => entry.photo === editor.chosenPhoto);
  const failure = imageFailureNotice(suggestions.failed);
  return (
    <Stack gap={8}>
      <Text variant="smallStrong" testID={id}>
        Fotovorschläge
      </Text>
      <Row gap={8}>
        {suggestions.photos.map((entry, index) => (
          <Pressable
            key={entry.uri}
            accessibilityRole="radio"
            accessibilityState={{ selected: index === selected }}
            accessibilityLabel={`Vorschlag ${index + 1}`}
            onPress={() => setSelected(index)}
            testID={`${id}-${index}`}
            style={{
              flex: 1,
              borderRadius: theme.shape.radius.tile,
              borderWidth: 3,
              borderColor: index === selected ? theme.colors.accent : 'transparent',
              overflow: 'hidden',
            }}
          >
            <Photo source={{ uri: entry.uri }} aspectRatio={1} alt={`Vorschlag ${index + 1}`} />
          </Pressable>
        ))}
      </Row>
      {failure ? (
        <Text variant="small" color="muted" testID={`${id}-failed`}>
          {failure}
        </Text>
      ) : null}
      <Row gap={12} wrap align="center">
        <Button
          label={chosen === selected ? 'Übernommen' : 'Übernehmen'}
          icon="check"
          size="sm"
          disabled={chosen === selected}
          onPress={() => {
            const entry = suggestions.photos[selected];
            if (entry) editor.choosePhoto(entry.photo);
          }}
          testID={`${id}-apply`}
        />
        <Button
          label="Keins davon"
          variant="ghost"
          size="sm"
          onPress={() => {
            if (chosen >= 0) editor.choosePhoto(undefined);
            dismissPhotoSuggestions(recipe.id);
          }}
          testID={`${id}-dismiss`}
        />
        {chosen >= 0 ? (
          <Text variant="small" color="muted" testID={`${id}-chosen`}>
            Wird mit „Speichern“ das Foto des Rezepts.
          </Text>
        ) : null}
      </Row>
    </Stack>
  );
}
