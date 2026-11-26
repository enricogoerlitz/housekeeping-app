import { checkImageFile, loadPhotoFromAddress, preparePhoto } from '@housekeeping/api';
import { imageAddress, unsuitableImageAddress } from '@housekeeping/core';
import {
  Button,
  Notice,
  Photo,
  Sheet,
  Stack,
  Text,
  TextField,
  ViewTabs,
  pickImageFile,
  useBreakpoint,
  useFinePointer,
  useImageDropAndPaste,
  useRevealOnShow,
  useTheme,
  type IconName,
} from '@housekeeping/ui';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';
import { confirmFirst } from '@/features/shell/confirm-dialog';
import { features } from '@/lib/features';

import { PhotoWindowAi } from './photo-window-ai';
import { revokeLater } from './revoke-later';

// The window "Foto" (spec 0039, REQ-001 – REQ-004): one window wherever a photo is changed — at a
// recipe, a collection, a restaurant and an activity. A new image comes from a file (chosen,
// dragged in, pasted with ⌘V; on touch devices the system menu with library and camera, spec
// 0047 REQ-002) or an image address the server loads; it is prepared
// like every photo (1600 px, JPEG) and shown before "Übernehmen" saves it. "Abbrechen" keeps the
// old photo. Everything here needs the network.

type View_ = 'choose' | 'ai';

/**
 * The window's views: "KI" (spec 0040, REQ-004: create or edit the photo with the image model)
 * only with `features.aiRecipes`; with one view no tab row shows.
 */
const VIEWS: { value: View_; label: string }[] = [
  { value: 'choose', label: 'Bild wählen' },
  ...(features.aiRecipes ? [{ value: 'ai' as const, label: 'KI' }] : []),
];

type Busy = 'prepare' | 'address' | undefined;

/** The preview stays this high at most, so the sources below fit on a laptop screen. */
const PREVIEW_MAX_HEIGHT = 220;

/** A short pause after typing, so a pasted address is loaded once and a typed one when done. */
const ADDRESS_DELAY_MS = 400;

const pasteKeys = () =>
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  /Mac|iP(hone|ad)/.test(navigator.userAgent)
    ? '⌘V'
    : 'Strg+V';

/** „Foto entfernen?“ · „Entfernen“ / „Abbrechen“ before a photo goes (spec 0036, AC-019). */
export function confirmPhotoRemoval(remove: () => void): void {
  confirmFirst({
    title: 'Foto entfernen?',
    confirmLabel: 'Entfernen',
    onConfirm: remove,
    testID: 'confirm-remove-photo',
  });
}

export function PhotoWindow(props: {
  /** The photo shown now (an own photo's blob: URL or a recipe's sample photo), if any. */
  current: number | { uri: string } | undefined;
  /** An own photo is stored: "Foto entfernen" is offered. */
  hasPhoto: boolean;
  name: string;
  /** The prefilled prompt of "KI" (spec 0040, REQ-004); the name when not given. */
  aiPrompt?: string;
  placeholderIcon: IconName;
  aspectRatio: number;
  /** "Übernehmen" with the prepared JPEG; the window is closed already. */
  onApply: (photo: Blob) => void;
  /** "Foto entfernen" after the question; the window is closed already. */
  onRemove: () => void;
  onClose: () => void;
  testPrefix: string;
}) {
  const online = useOnlineOnly();
  const theme = useTheme();
  const { isPhone } = useBreakpoint();
  // Phones and touch devices: one button, the system asks for library, camera or file (spec 0047,
  // REQ-002); with a mouse the hint to drag and paste and "Datei wählen" (AC-008).
  const finePointer = useFinePointer();
  const touch = isPhone || !finePointer;
  const [view, setView] = useState<View_>('choose');
  const [candidate, setCandidate] = useState<{ photo: Blob; uri: string }>();
  const [busy, setBusy] = useState<Busy>();
  const [error, setError] = useState<string>();
  const [address, setAddress] = useState('');
  const loadedAddress = useRef<string | undefined>(undefined);
  const attempt = useRef(0);
  const id = `${props.testPrefix}-photo-window`;

  // The preview is a blob: URL until the window closes or the next image replaces it.
  const candidateUri = candidate?.uri;
  useEffect(
    () => () => {
      if (candidateUri) revokeLater(candidateUri);
    },
    [candidateUri],
  );

  /** Prepares an image from any source; only the newest attempt may show its result. */
  const take = (kind: Exclude<Busy, undefined>, source: () => Promise<Blob>) => {
    attempt.current += 1;
    const mine = attempt.current;
    setError(undefined);
    setBusy(kind);
    source()
      .then((image) => preparePhoto(image))
      .then((photo) => {
        if (mine === attempt.current) setCandidate({ photo, uri: URL.createObjectURL(photo) });
      })
      .catch((caught: unknown) => {
        if (mine === attempt.current) setError(errorMessage(caught, FAILED_MESSAGE));
      })
      .finally(() => {
        if (mine === attempt.current) setBusy(undefined);
      });
  };

  const takeFile = (file: File) => {
    if (online.disabled) return;
    take('prepare', async () => checkImageFile(file));
  };
  const dragging = useImageDropAndPaste(!online.disabled, takeFile);

  // An address the app will not load (`http://…`) says so instead of being ignored (AC-007).
  const loadAddress = (text: string) => {
    const url = imageAddress(text) ?? (unsuitableImageAddress(text) ? text.trim() : undefined);
    if (!url || url === loadedAddress.current || online.disabled) return;
    loadedAddress.current = url;
    take('address', () => loadPhotoFromAddress(url));
  };
  // A pasted address loads by itself, after a short pause (AC-006).
  const addressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(addressTimer.current), []);
  const changeAddress = (text: string) => {
    setAddress(text);
    clearTimeout(addressTimer.current);
    // An emptied field takes its note along, and the same address may be tried again.
    if (text.trim() === '' && !busy) {
      loadedAddress.current = undefined;
      setError(undefined);
    }
    if (imageAddress(text) || unsuitableImageAddress(text))
      addressTimer.current = setTimeout(() => loadAddress(text), ADDRESS_DELAY_MS);
  };

  const pick = () => pickImageFile(takeFile);

  const apply = () => {
    if (!candidate) return;
    props.onClose();
    props.onApply(candidate.photo);
  };

  const remove = () =>
    confirmPhotoRemoval(() => {
      props.onClose();
      props.onRemove();
    });

  const shown = candidate ? { uri: candidate.uri } : props.current;
  const disabled = online.disabled || busy !== undefined;
  // The note under the sources scrolls into view, so it never hides behind the footer.
  const errorRef = useRevealOnShow(error);
  const busyRef = useRevealOnShow(busy);

  return (
    <Sheet
      visible
      // On wider screens the large window: preview, sources and "Foto entfernen" fit on a laptop
      // without a half-cut last row; anything more scrolls.
      size={isPhone ? 'm' : 'l'}
      title="Foto"
      onClose={props.onClose}
      header={
        VIEWS.length > 1 ? (
          <ViewTabs
            options={VIEWS}
            value={view}
            onChange={(next) => {
              setView(next);
              setError(undefined);
            }}
            label="Quelle"
            testID={id}
          />
        ) : undefined
      }
      actions={{
        primary: {
          label: 'Übernehmen',
          onPress: apply,
          disabled: !candidate || disabled,
          hint: online.hint,
          testID: `${id}-apply`,
        },
        cancel: { label: 'Abbrechen', onPress: props.onClose, testID: `${id}-cancel` },
      }}
      testID={id}
    >
      <Stack gap={16}>
        {online.hint ? (
          <Notice icon="wifi-off" text={online.hint} testID={`${id}-offline`} />
        ) : null}
        <View
          testID={candidate ? `${id}-preview-new` : `${id}-preview`}
          style={{
            borderRadius: theme.shape.radius.tile,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: dragging ? theme.colors.accent : 'transparent',
            overflow: 'hidden',
            width: '100%',
            maxWidth: Math.round(PREVIEW_MAX_HEIGHT * props.aspectRatio),
            alignSelf: 'center',
          }}
        >
          <Photo
            source={shown}
            placeholderIcon={props.placeholderIcon}
            loading={busy !== undefined}
            aspectRatio={props.aspectRatio}
            alt={shown ? props.name : undefined}
          />
        </View>
        {view === 'ai' ? (
          <PhotoWindowAi
            prompt={props.aiPrompt ?? props.name}
            currentUri={
              props.hasPhoto && typeof props.current === 'object' ? props.current.uri : undefined
            }
            onPick={(photo) => take('prepare', async () => photo)}
            testID={`${id}-ai`}
          />
        ) : null}
        {view === 'ai' || touch ? null : (
          <Text variant="small" color="muted" testID={`${id}-drop-hint`}>
            {dragging
              ? 'Zum Übernehmen hier loslassen'
              : `Bild hierher ziehen, mit ${pasteKeys()} einfügen oder eine Datei wählen`}
          </Text>
        )}
        {view === 'choose' ? (
          <ChooseSources
            id={id}
            touch={touch}
            disabled={disabled}
            online={online}
            pick={pick}
            address={address}
            changeAddress={changeAddress}
            loadAddress={loadAddress}
          />
        ) : null}
        {busy ? (
          <View ref={busyRef}>
            <Text variant="small" color="muted" testID={`${id}-busy`}>
              {busy === 'address' ? 'Bild wird geladen …' : 'Bild wird vorbereitet …'}
            </Text>
          </View>
        ) : null}
        {error ? (
          <View ref={errorRef}>
            <Text variant="small" color="warn" testID={`${id}-error`}>
              {error}
            </Text>
          </View>
        ) : null}
        {props.hasPhoto ? (
          <View style={{ alignItems: 'flex-start' }}>
            <Button
              label="Foto entfernen"
              icon="trash"
              variant="link"
              size="sm"
              disabled={online.disabled}
              hint={online.hint}
              onPress={remove}
              testID={`${props.testPrefix}-photo-remove`}
            />
          </View>
        ) : null}
      </Stack>
    </Sheet>
  );
}

/**
 * The view "Bild wählen": one button and the image address (spec 0039; spec 0047, REQ-002). On
 * touch devices „Foto auswählen“ opens the system menu (library, camera, file); with a mouse
 * „Datei wählen“. The test id `…-file` is the same for both.
 */
function ChooseSources(props: {
  id: string;
  touch: boolean;
  disabled: boolean;
  online: { disabled: boolean; hint: string | undefined };
  pick: () => void;
  address: string;
  changeAddress: (text: string) => void;
  loadAddress: (text: string) => void;
}) {
  const { id, touch, disabled, online, pick, address } = props;
  return (
    <>
      <Button
        label={touch ? 'Foto auswählen' : 'Datei wählen'}
        icon={touch ? 'image' : 'folder-open'}
        variant="secondary"
        size="sm"
        disabled={disabled}
        hint={online.hint}
        onPress={pick}
        testID={`${id}-file`}
      />
      <TextField
        label="Bildadresse"
        placeholder="https://…"
        value={address}
        onChangeText={props.changeAddress}
        onSubmitEditing={() => props.loadAddress(address)}
        keyboardType="url"
        autoComplete="off"
        returnKeyType="go"
        editable={!online.disabled}
        hint="Adresse eines Bildes einfügen, z. B. über „Bildadresse kopieren“"
        testID={`${id}-address`}
      />
    </>
  );
}
