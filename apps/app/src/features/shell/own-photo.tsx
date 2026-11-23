import { preparePhoto, usePhoto, WRITE_REJECTED_MESSAGE } from '@housekeeping/api';
import {
  Button,
  Photo,
  Row,
  Stack,
  Text,
  toast,
  type IconName,
  type PhotoProps,
} from '@housekeeping/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
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
 * The photo on a detail page (16:9) with "Foto hinzufügen/ändern" and "Foto entfernen"; both need
 * the network. Test ids `<prefix>-image`, `<prefix>-photo-change`, `<prefix>-photo-remove`.
 */
export function DetailPhotoBlock(props: {
  photoPath: string | undefined;
  name: string;
  placeholderIcon: IconName;
  onChange: (photo: Blob) => Promise<void>;
  onRemove: () => Promise<void>;
  testPrefix: string;
}) {
  const online = useOnlineOnly();
  const photo = usePhoto(props.photoPath);
  const [busy, setBusy] = useState<'upload' | 'remove' | undefined>();
  const [error, setError] = useState<string | undefined>();
  const hasPhoto = !!props.photoPath;
  const prefix = props.testPrefix;

  const change = () =>
    pickPhotoFile((file) => {
      setError(undefined);
      setBusy('upload');
      preparePhoto(file)
        .then((prepared) => props.onChange(prepared))
        .then(() => toast.show({ message: 'Foto gespeichert' }))
        .catch((caught: unknown) => setError(message(caught)))
        .finally(() => setBusy(undefined));
    });

  const remove = () => {
    setError(undefined);
    setBusy('remove');
    props
      .onRemove()
      .then(() => toast.show({ message: 'Foto entfernt' }))
      .catch((caught: unknown) => setError(message(caught)))
      .finally(() => setBusy(undefined));
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={{ maxWidth: 560 }}>
        <OwnPhoto
          photoPath={props.photoPath}
          name={props.name}
          placeholderIcon={props.placeholderIcon}
          aspectRatio={16 / 9}
          testID={`${prefix}-image`}
        />
      </View>
      {photo.loading ? (
        <Text variant="caption" color="muted">
          Foto wird geladen …
        </Text>
      ) : null}
      {CAN_PICK_PHOTO ? (
        <Row gap={12} wrap>
          <Button
            label={hasPhoto ? 'Foto ändern' : 'Foto hinzufügen'}
            icon="camera"
            variant="link"
            size="sm"
            disabled={online.disabled || busy !== undefined}
            hint={online.hint}
            onPress={change}
            testID={`${prefix}-photo-change`}
          />
          {hasPhoto ? (
            <Button
              label="Foto entfernen"
              icon="trash"
              variant="link"
              size="sm"
              disabled={online.disabled || busy !== undefined}
              hint={online.hint}
              onPress={remove}
              testID={`${prefix}-photo-remove`}
            />
          ) : null}
        </Row>
      ) : null}
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
    </View>
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
      if (previewUri) URL.revokeObjectURL(previewUri);
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

  return { savedPath, photo, photoError, preparing, choosePhoto, removePhoto };
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
