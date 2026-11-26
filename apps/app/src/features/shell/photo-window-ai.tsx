import { generateImagesAsync, OfflineError, preparePhoto } from '@housekeeping/api';
import {
  IMAGE_EDIT_MAX_SIDE,
  IMAGE_STYLES,
  imageFailureNotice,
  type ImageStyle,
} from '@housekeeping/core';
import { Button, Chip, Photo, Row, Stack, SwitchRow, Text, useTheme } from '@housekeeping/ui';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { DictationField } from '@/features/shell/dictation-field';
import { OFFLINE_EDIT_HINT, useOnlineOnly } from '@/features/shell/offline';

// The tab "KI" of the photo window (spec 0040, REQ-004, REQ-005): a prompt (prefilled from the
// title, for a recipe with its main ingredients), style chips and, with a photo, "Aus diesem
// Foto". "Erzeugen" brings three variants; a tap makes one the window's new image, which
// "Übernehmen" saves through the usual photo path. Variants are never stored (AC-012).

const STYLE_LABELS: Record<ImageStyle, string> = {
  glossy: 'Hochglanz',
  rustic: 'Rustikal',
  top: 'Von oben',
  close: 'Nah',
  bright: 'Hell',
};

const AI_IMAGE_FAILED_MESSAGE =
  'Die KI ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.';

interface Variant {
  photo: Blob;
  uri: string;
}

/** The photo shown now as a JPEG of at most 1024 px, for "Aus diesem Foto" (REQ-005). */
async function currentPhoto(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return preparePhoto(await response.blob(), IMAGE_EDIT_MAX_SIDE);
}

export function PhotoWindowAi(props: {
  prompt: string;
  /** The own photo shown now; offers "Aus diesem Foto". */
  currentUri: string | undefined;
  /** A variant was tapped: it becomes the window's new image. */
  onPick: (photo: Blob) => void;
  testID: string;
}) {
  const online = useOnlineOnly();
  const theme = useTheme();
  const [prompt, setPrompt] = useState(props.prompt);
  const [styles, setStyles] = useState<ImageStyle[]>([]);
  const [fromPhoto, setFromPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ variants: Variant[]; failed: number }>();
  const [selected, setSelected] = useState<number>();
  const attempt = useRef(0);
  const id = props.testID;

  const shown = result?.variants;
  useEffect(
    () => () => {
      for (const variant of shown ?? []) URL.revokeObjectURL(variant.uri);
    },
    [shown],
  );
  useEffect(
    () => () => {
      attempt.current += 1;
    },
    [],
  );

  const toggleStyle = (style: ImageStyle) =>
    setStyles((current) =>
      current.includes(style) ? current.filter((entry) => entry !== style) : [...current, style],
    );

  const create = () => {
    if (prompt.trim() === '' || busy) return;
    attempt.current += 1;
    const mine = attempt.current;
    setBusy(true);
    setError(undefined);
    void (async () => {
      try {
        const image =
          fromPhoto && props.currentUri ? await currentPhoto(props.currentUri) : undefined;
        const reply = await generateImagesAsync({ prompt, styles, ...(image ? { image } : {}) });
        if (mine !== attempt.current) return;
        setSelected(undefined);
        setResult({
          variants: reply.images.map((photo) => ({ photo, uri: URL.createObjectURL(photo) })),
          failed: reply.failed,
        });
      } catch (caught) {
        if (mine !== attempt.current) return;
        setError(caught instanceof OfflineError ? OFFLINE_EDIT_HINT : AI_IMAGE_FAILED_MESSAGE);
      } finally {
        if (mine === attempt.current) setBusy(false);
      }
    })();
  };

  const pick = (index: number) => {
    const variant = result?.variants[index];
    if (!variant) return;
    setSelected(index);
    props.onPick(variant.photo);
  };

  const failure = result ? imageFailureNotice(result.failed) : undefined;
  const disabled = online.disabled || busy;
  return (
    <Stack gap={12}>
      <DictationField
        label="Was soll das Bild zeigen?"
        placeholder={fromPhoto ? 'z. B. Text entfernen, sauberes Food-Foto' : 'z. B. Apfelkuchen'}
        value={prompt}
        onChangeText={setPrompt}
        multiline
        maxLength={1000}
        editable={!disabled}
        testID={`${id}-prompt`}
      />
      <Row gap={8} wrap>
        {IMAGE_STYLES.map((style) => (
          <Chip
            key={style}
            label={STYLE_LABELS[style]}
            selected={styles.includes(style)}
            onPress={() => toggleStyle(style)}
            disabled={disabled}
            testID={`${id}-style-${style}`}
          />
        ))}
      </Row>
      {props.currentUri ? (
        <SwitchRow
          label="Aus diesem Foto"
          description="Das Foto ist die Vorlage, z. B. um Text zu entfernen."
          value={fromPhoto}
          onValueChange={setFromPhoto}
          disabled={disabled}
          testID={`${id}-from-photo`}
        />
      ) : null}
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          label={busy ? 'Wird erzeugt …' : result ? 'Neu erzeugen' : 'Erzeugen'}
          icon={result ? 'refresh-cw' : 'sparkles'}
          variant="secondary"
          size="sm"
          disabled={disabled || prompt.trim() === ''}
          hint={online.hint}
          onPress={create}
          testID={`${id}-create`}
        />
      </View>
      {busy ? (
        <Row gap={8}>
          {[0, 1, 2].map((index) => (
            <View key={index} style={{ flex: 1 }}>
              <Photo loading aspectRatio={1} />
            </View>
          ))}
        </Row>
      ) : result ? (
        <Row gap={8}>
          {result.variants.map((variant, index) => (
            <Pressable
              key={variant.uri}
              accessibilityRole="radio"
              accessibilityState={{ selected: index === selected }}
              accessibilityLabel={`Variante ${index + 1}`}
              onPress={() => pick(index)}
              testID={`${id}-variant-${index}`}
              style={{
                flex: 1,
                maxWidth: 140,
                borderRadius: theme.shape.radius.tile,
                borderWidth: 3,
                borderColor: index === selected ? theme.colors.accent : 'transparent',
                overflow: 'hidden',
              }}
            >
              <Photo source={{ uri: variant.uri }} aspectRatio={1} alt={`Variante ${index + 1}`} />
            </Pressable>
          ))}
        </Row>
      ) : null}
      {busy ? (
        <Text variant="small" color="muted" testID={`${id}-busy`}>
          Die KI erzeugt drei Varianten … das dauert etwa zehn Sekunden.
        </Text>
      ) : result && selected === undefined ? (
        <Text variant="small" color="muted">
          Tippe eine Variante an, dann „Übernehmen“.
        </Text>
      ) : null}
      {failure ? (
        <Text variant="small" color="muted" testID={`${id}-failed`}>
          {failure}
        </Text>
      ) : null}
      {error ? (
        <Text variant="small" color="warn" testID={`${id}-error`}>
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}
