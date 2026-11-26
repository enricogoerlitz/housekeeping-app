import { imageFailureNotice, type Recipe } from '@housekeeping/core';
import { Button, Notice, Photo, Row, Stack, Text, useTheme } from '@housekeeping/ui';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { DictationField } from '@/features/shell/dictation-field';
import { useOnlineOnly } from '@/features/shell/offline';
import { features } from '@/lib/features';

import { regeneratePhotoSuggestions, startPhotoSuggestions, usePhotoSuggestions } from './ai-draft';
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

/** Spec 0045, REQ-005: read by screen readers on each pulsing tile. */
const GENERATING_LABEL = 'Foto wird erzeugt';
/** The wish of "Neu generieren" (REQ-006); the image prompt takes up to 1000 characters in all. */
const EXTRA_MAX = 300;
/** Three tiles stay thumbnails on a wide screen; the large photo stands below. */
const TILE_MAX = 200;

/**
 * AC-010: three suggestions; "Übernehmen" makes one the draft's photo (saved with "Speichern").
 * Spec 0045: the tiles pulse while the photos are made (REQ-005); "Neu generieren" with an
 * optional wish makes three new ones (REQ-006) and replaces "Keins davon".
 */
function PhotoSuggestionsPanel(props: { recipe: Recipe; editor: PageEditor }) {
  const { recipe, editor } = props;
  const theme = useTheme();
  const online = useOnlineOnly();
  const suggestions = usePhotoSuggestions(recipe.id);
  const [selected, setSelected] = useState(0);
  const [extra, setExtra] = useState('');
  if (!suggestions) return null;
  const id = 'recipe-photo-suggestions';
  const loading = suggestions.status === 'loading';
  const regenerate = () => {
    setSelected(0);
    regeneratePhotoSuggestions(recipe.id, extra);
  };
  const again = (
    <Stack gap={8}>
      <DictationField
        label="Was soll anders sein?"
        placeholder="optional, z. B. heller, von oben"
        value={extra}
        onChangeText={setExtra}
        maxLength={EXTRA_MAX}
        editable={!loading && !online.disabled}
        testID={`${id}-extra`}
      />
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          label={loading ? 'Wird erzeugt …' : 'Neu generieren'}
          icon="refresh-cw"
          variant="secondary"
          size="sm"
          disabled={loading || online.disabled}
          hint={online.hint}
          onPress={regenerate}
          testID={`${id}-regenerate`}
        />
      </View>
    </Stack>
  );
  if (loading) {
    return (
      <Stack gap={8}>
        <Text variant="smallStrong" testID={id}>
          Fotovorschläge
        </Text>
        <Row gap={8}>
          {[0, 1, 2].map((index) => (
            <View key={index} style={{ flex: 1, maxWidth: TILE_MAX }}>
              <Photo
                generating={GENERATING_LABEL}
                aspectRatio={1}
                testID={`${id}-generating-${index}`}
              />
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
    return (
      <Stack gap={8}>
        <Notice icon="circle-alert" text={suggestions.message} testID={`${id}-error`} />
        {again}
      </Stack>
    );
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
              maxWidth: TILE_MAX,
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
        {chosen >= 0 ? (
          <Text variant="small" color="muted" testID={`${id}-chosen`}>
            Wird mit „Speichern“ das Foto des Rezepts.
          </Text>
        ) : null}
      </Row>
      {again}
    </Stack>
  );
}
