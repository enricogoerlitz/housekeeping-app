import { preparePhoto, usePhoto, WRITE_REJECTED_MESSAGE } from '@housekeeping/api';
import type { AiImageContext } from '@housekeeping/core';
import {
  Button,
  IconButton,
  Photo,
  PhotoViewer,
  Row,
  Stack,
  Text,
  toast,
  type IconName,
  type PhotoProps,
} from '@housekeeping/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { PhotoWindow } from '@/features/shell/photo-window';
import { revokeLater } from '@/features/shell/revoke-later';
import { CAN_PICK_PHOTO, pickPhotoFile } from '@/lib/pick-photo';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';

// The household's own photo of an activity or a restaurant (spec 0004, REQ-004; spec 0024,
// REQ-004): shown from the device storage, changed only online, with the same texts for both.

const message = (error: unknown) => errorMessage(error, FAILED_MESSAGE);

/**
 * The own photo, or the placeholder symbol while there is none or it cannot load. With a testID,
 * `<testID>-photo` or `<testID>-placeholder` says which one shows.
 */
export function OwnPhoto(
  props: Pick<PhotoProps, 'width' | 'height' | 'aspectRatio' | 'radius'> & {
    photoPath: string | undefined;
    name: string;
    placeholderIcon: IconName;
    testID?: string;
  },
) {
  const photo = usePhoto(props.photoPath);
  const source = photo.uri ? { uri: photo.uri } : undefined;
  return (
    <View
      testID={props.testID ? `${props.testID}-${source ? 'photo' : 'placeholder'}` : undefined}
      style={{ width: props.width ?? '100%' }}
    >
      <Photo
        source={source}
        placeholderIcon={props.placeholderIcon}
        loading={photo.loading}
        width={props.width}
        height={props.height}
        aspectRatio={props.aspectRatio}
        radius={props.radius}
        alt={source ? props.name : undefined}
      />
    </View>
  );
}

/**
 * The photo on a detail page (16:9) with "Foto hinzufügen/ändern", which opens the window
 * "Foto" (spec 0039); "Foto entfernen" is in there. Both need the network. Test ids
 * `<prefix>-image`, `<prefix>-photo-change`, `<prefix>-photo-window`, `<prefix>-photo-remove`.
 */
export function DetailPhotoBlock(props: {
  photoPath: string | undefined;
  name: string;
  /** What the picture is for, for "KI" in the window (spec 0052, REQ-003). */
  aiContext: AiImageContext;
  placeholderIcon: IconName;
  onChange: (photo: Blob) => Promise<void>;
  onRemove: () => Promise<void>;
  /** "Teilen" at the right end of the photo's row (spec 0042, REQ-004). */
  onShare?: () => void;
  testPrefix: string;
}) {
  const online = useOnlineOnly();
  const photo = usePhoto(props.photoPath);
  const [busy, setBusy] = useState<'upload' | 'remove' | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [windowOpen, setWindowOpen] = useState(false);
  const hasPhoto = !!props.photoPath;
  const prefix = props.testPrefix;

  const run = (kind: 'upload' | 'remove', action: () => Promise<void>, done: string) => {
    setError(undefined);
    setBusy(kind);
    action()
      .then(() => toast.show({ message: done }))
      .catch((caught: unknown) => setError(message(caught)))
      .finally(() => setBusy(undefined));
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={{ maxWidth: 560 }}>
        <ZoomablePhoto
          sources={photo.uri ? [{ uri: photo.uri }] : []}
          name={props.name}
          testID={`${prefix}-image`}
        >
          <OwnPhoto
            photoPath={props.photoPath}
            name={props.name}
            placeholderIcon={props.placeholderIcon}
            aspectRatio={16 / 9}
            testID={`${prefix}-image`}
          />
        </ZoomablePhoto>
      </View>
      {photo.loading ? (
        <Text variant="caption" color="muted">
          Foto wird geladen …
        </Text>
      ) : null}
      <View style={{ maxWidth: 560 }}>
        <PhotoActionRow
          hasPhoto={hasPhoto}
          disabled={online.disabled || busy !== undefined}
          hint={online.hint}
          onChange={() => setWindowOpen(true)}
          onShare={props.onShare}
          testPrefix={prefix}
        />
      </View>
      {busy ? (
        <Text variant="small" color="muted" testID={`${prefix}-photo-busy`}>
          {busy === 'upload' ? 'Foto wird hochgeladen …' : 'Foto wird entfernt …'}
        </Text>
      ) : null}
      {error ? (
        <Text variant="small" color="warn" testID={`${prefix}-photo-error`}>
          {error}
        </Text>
      ) : null}
      {windowOpen ? (
        <PhotoWindow
          current={photo.uri ? { uri: photo.uri } : undefined}
          hasPhoto={hasPhoto}
          name={props.name}
          aiContext={props.aiContext}
          placeholderIcon={props.placeholderIcon}
          aspectRatio={16 / 9}
          onApply={(prepared) => run('upload', () => props.onChange(prepared), 'Foto gespeichert')}
          onRemove={() => run('remove', props.onRemove, 'Foto entfernt')}
          onClose={() => setWindowOpen(false)}
          testPrefix={prefix}
        />
      ) : null}
    </View>
  );
}

/**
 * "Foto hinzufügen/ändern" right under a photo (spec 0036, REQ-008), at a restaurant, an
 * activity, a recipe and a collection; it opens the window "Foto", where "Foto entfernen" is
 * (spec 0039, REQ-001). "Teilen" stands as a small icon at the right end of the row, also
 * offline (spec 0042, REQ-004, AC-016; spec 0047, REQ-001).
 */
export function PhotoActionRow(props: {
  hasPhoto: boolean;
  disabled: boolean;
  hint: string | undefined;
  onChange: () => void;
  onShare?: () => void;
  testPrefix: string;
}) {
  if (!CAN_PICK_PHOTO && !props.onShare) return null;
  return (
    <Row gap={12} align="center">
      <View style={{ flex: 1, minWidth: 0 }}>
        {CAN_PICK_PHOTO ? (
          <Button
            label={props.hasPhoto ? 'Foto ändern' : 'Foto hinzufügen'}
            icon="camera"
            variant="link"
            size="sm"
            disabled={props.disabled}
            hint={props.hint}
            onPress={props.onChange}
            testID={`${props.testPrefix}-photo-change`}
          />
        ) : null}
      </View>
      {props.onShare ? (
        // Smaller than the other symbols, still 44 × 44 pt to tap (spec 0047, AC-005).
        <IconButton
          icon="share"
          label="Teilen"
          variant="soft"
          size={32}
          touchFrame
          onPress={props.onShare}
          testID={`${props.testPrefix}-share`}
        />
      ) : null}
    </Row>
  );
}

/**
 * A photo that opens on the whole screen when tapped (spec 0036, REQ-009); without a photo (the
 * placeholder) it is only the picture. `<testID>-zoom` is the tap target, `<testID>-viewer` the
 * full-screen view.
 */
export function ZoomablePhoto(props: {
  sources: readonly (number | { uri: string })[];
  name: string;
  testID: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (props.sources.length === 0) return <>{props.children}</>;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Foto von ${props.name} groß anzeigen`}
        onPress={() => setOpen(true)}
        testID={`${props.testID}-zoom`}
        style={(state) => ({ opacity: state.pressed ? 0.85 : 1 })}
      >
        {props.children}
      </Pressable>
      {open ? (
        <PhotoViewer
          sources={props.sources}
          alt={props.name}
          closeLabel="Schließen"
          onClose={() => setOpen(false)}
          testID={`${props.testID}-viewer`}
        />
      ) : null}
    </>
  );
}

/** What happens with the photo when a form is saved. */
export type PhotoChoice =
  { kind: 'keep' } | { kind: 'new'; photo: Blob; uri: string } | { kind: 'remove' };

/** The photo choice of a form: picked and prepared on the device, saved with the form. */
export function usePhotoChoice(savedPath: string | undefined) {
  const [photo, setPhoto] = useState<PhotoChoice>({ kind: 'keep' });
  const [photoError, setPhotoError] = useState<string | undefined>();
  const [preparing, setPreparing] = useState(false);

  // A chosen photo is shown from a blob: URL until it is saved; free it when it is replaced.
  const previewUri = photo.kind === 'new' ? photo.uri : undefined;
  useEffect(
    () => () => {
      // The closing form still shows it for a moment.
      if (previewUri) revokeLater(previewUri);
    },
    [previewUri],
  );

  const choosePhoto = () =>
    pickPhotoFile((file) => {
      setPhotoError(undefined);
      setPreparing(true);
      preparePhoto(file)
        .then((prepared) =>
          setPhoto({ kind: 'new', photo: prepared, uri: URL.createObjectURL(prepared) }),
        )
        .catch((error: unknown) => setPhotoError(message(error)))
        .finally(() => setPreparing(false));
    });

  const removePhoto = () => {
    setPhotoError(undefined);
    setPhoto(savedPath ? { kind: 'remove' } : { kind: 'keep' });
  };

  /** A photo prepared elsewhere, e.g. the one of a place found on the web (spec 0049). */
  const takePhoto = (prepared: Blob) => {
    setPhotoError(undefined);
    setPhoto({ kind: 'new', photo: prepared, uri: URL.createObjectURL(prepared) });
  };

  return { savedPath, photo, photoError, preparing, choosePhoto, removePhoto, takePhoto };
}

export type PhotoChoiceState = ReturnType<typeof usePhotoChoice>;

/**
 * Saves the photo choice after the row exists (a new row gets its photo right after it was
 * created). Runs on after the form closed; a failure shows as a toast, except a rejected write,
 * which the sync already reported.
 */
export function savePhotoChoice(
  choice: PhotoChoice,
  set: (photo: Blob) => Promise<void>,
  remove: () => Promise<void>,
): void {
  if (choice.kind === 'keep') return;
  const run = choice.kind === 'new' ? set(choice.photo) : remove();
  run.catch((error: unknown) => {
    const text = message(error);
    if (text !== WRITE_REJECTED_MESSAGE) toast.show({ message: text });
  });
}

/** "Foto (optional)" in a form. Test ids `<prefix>-form-photo`, `-form-photo-remove`, …. */
export function PhotoChoiceField(props: {
  state: PhotoChoiceState;
  placeholderIcon: IconName;
  testPrefix: string;
}) {
  const { state } = props;
  const online = useOnlineOnly();
  const saved = usePhoto(state.photo.kind === 'keep' ? state.savedPath : undefined);
  const uri = state.photo.kind === 'new' ? state.photo.uri : saved.uri;
  const prefix = props.testPrefix;
  if (!CAN_PICK_PHOTO) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="smallStrong">Foto (optional)</Text>
      <Row gap={12}>
        <View testID={uri ? `${prefix}-form-photo-preview` : undefined}>
          <Photo
            source={uri ? { uri } : undefined}
            placeholderIcon={props.placeholderIcon}
            width={64}
            height={64}
          />
        </View>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Button
            label={uri ? 'Foto ändern' : 'Foto auswählen'}
            icon="camera"
            variant="secondary"
            size="sm"
            disabled={online.disabled || state.preparing}
            hint={online.hint}
            onPress={state.choosePhoto}
            testID={`${prefix}-form-photo`}
          />
          {uri ? (
            <Button
              label="Foto entfernen"
              variant="link"
              quiet
              size="sm"
              disabled={online.disabled}
              onPress={state.removePhoto}
              testID={`${prefix}-form-photo-remove`}
            />
          ) : null}
        </Stack>
      </Row>
      {state.preparing ? (
        <Text variant="small" color="muted">
          Foto wird vorbereitet …
        </Text>
      ) : null}
      {state.photoError ? (
        <Text variant="small" color="warn" testID={`${prefix}-form-photo-error`}>
          {state.photoError}
        </Text>
      ) : null}
    </View>
  );
}
