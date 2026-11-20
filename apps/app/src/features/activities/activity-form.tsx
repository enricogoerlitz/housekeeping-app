import {
  createActivity,
  preparePhoto,
  readActivityMapsLink,
  removeActivityPhoto,
  resolveActivityShortLink,
  setActivityPhoto,
  updateActivity,
  useActivities,
  usePhoto,
  WRITE_REJECTED_MESSAGE,
  type ActivityDraft,
  type ActivityLinkReading,
  type ActivityPlace,
} from '@housekeeping/api';
import { findDuplicateActivity, type Activity, type GeoPoint, type Id } from '@housekeeping/core';
import {
  Button,
  Icon,
  Notice,
  Photo,
  Row,
  Sheet,
  Stack,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { CAN_PICK_PHOTO, pickPhotoFile } from '@/lib/pick-photo';

import { ACTIVITY_ICON } from './activity-photo';

/** activities_name_length. */
export const ACTIVITY_NAME_MAX_LENGTH = 120;

/** What happens with the photo when the form is saved. */
export type PhotoChoice =
  { kind: 'keep' } | { kind: 'new'; photo: Blob; uri: string } | { kind: 'remove' };

export interface ActivityFormValues {
  draft: ActivityDraft;
  photo: PhotoChoice;
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Das hat nicht geklappt.';

/**
 * State of the activity form (create and edit). The fields render with `ActivityFormFields`; the
 * save button lives with whoever shows the form (its own sheet or the plan's add sheet).
 */
export function useActivityForm(activity?: Activity) {
  const activities = useActivities();
  const [name, setNameValue] = useState(activity?.name ?? '');
  const [nameError, setNameError] = useState<string | undefined>();
  const [description, setDescription] = useState(activity?.description ?? '');
  const [link, setLink] = useState(activity?.mapsUrl ?? '');
  const [reading, setReading] = useState<ActivityLinkReading | undefined>();
  const [linkError, setLinkError] = useState<string | undefined>();
  const [placeName, setPlaceName] = useState(activity?.placeName ?? '');
  // The place name the current link filled in: it goes again when the link goes.
  const [linkPlaceName, setLinkPlaceName] = useState<string | undefined>();
  const [address, setAddress] = useState(activity?.address ?? '');
  const [location, setLocation] = useState<GeoPoint | undefined>(activity?.location);
  const [mapsUrl, setMapsUrl] = useState<string | undefined>(activity?.mapsUrl);
  const [photo, setPhoto] = useState<PhotoChoice>({ kind: 'keep' });
  const [photoError, setPhotoError] = useState<string | undefined>();
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);

  const duplicate = findDuplicateActivity(
    name,
    activities.filter((candidate) => candidate.id !== activity?.id),
  );

  // A chosen photo is shown from a blob: URL until it is saved; free it when it is replaced.
  const previewUri = photo.kind === 'new' ? photo.uri : undefined;
  useEffect(
    () => () => {
      if (previewUri) URL.revokeObjectURL(previewUri);
    },
    [previewUri],
  );

  const setName = (value: string) => {
    setNameValue(value);
    setNameError(undefined);
  };

  const changeLink = (text: string) => {
    setLink(text);
    const filled = linkPlaceName !== undefined && placeName === linkPlaceName;
    const forgetPlace = () => {
      setLocation(undefined);
      setMapsUrl(undefined);
      setLinkPlaceName(undefined);
      if (filled) setPlaceName('');
    };
    if (!text.trim()) {
      setReading(undefined);
      setLinkError(undefined);
      forgetPlace();
      return;
    }
    const next = readActivityMapsLink(text);
    if (next.status === 'invalid') {
      setReading(undefined);
      setLinkError('Das ist kein Karten-Link');
      forgetPlace();
      return;
    }
    setLinkError(undefined);
    setReading(next);
    if (next.status === 'short') {
      forgetPlace();
      return;
    }
    // AC-006: the link gives the place; the activity's name stays free.
    setLocation(next.place.location);
    setMapsUrl(next.place.mapsUrl);
    if (next.place.placeName) {
      setPlaceName(next.place.placeName);
      setLinkPlaceName(next.place.placeName);
    } else {
      setLinkPlaceName(undefined);
      if (filled) setPlaceName('');
    }
  };

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
    setPhoto(activity?.photoPath ? { kind: 'remove' } : { kind: 'keep' });
  };

  /**
   * Checks the form and resolves a short map link (online). Returns what to save, or undefined
   * after showing the problem at its field ("Name fehlt", AC-007 and AC-023).
   */
  const submit = async (): Promise<ActivityFormValues | undefined> => {
    if (!name.trim()) {
      setNameError('Name fehlt');
      return undefined;
    }
    if (duplicate || saving || preparing) return undefined;
    let place: ActivityPlace = {
      placeName: placeName.trim() || undefined,
      address: address.trim() || undefined,
      location,
      mapsUrl,
    };
    if (reading?.status === 'short') {
      setSaving(true);
      try {
        const resolved = await resolveActivityShortLink(reading.url);
        place = {
          placeName: place.placeName ?? resolved.placeName,
          address: place.address ?? resolved.address,
          location: resolved.location,
          mapsUrl: resolved.mapsUrl,
        };
      } catch (error) {
        setLinkError(message(error));
        return undefined;
      } finally {
        setSaving(false);
      }
    }
    return {
      draft: { name: name.trim(), description: description.trim() || undefined, ...place },
      photo,
    };
  };

  return {
    activity,
    name,
    setName,
    nameError,
    /** Shows an error a command threw ("Gibt es schon: …") at the name field. */
    fail: (error: unknown) => setNameError(message(error)),
    description,
    setDescription,
    link,
    changeLink,
    reading,
    linkError,
    placeName,
    setPlaceName,
    address,
    setAddress,
    location,
    photo,
    photoError,
    preparing,
    choosePhoto,
    removePhoto,
    saving,
    duplicate,
    submit,
  };
}

export type ActivityForm = ReturnType<typeof useActivityForm>;

/**
 * Saves the photo choice after the activity exists (a new activity gets its photo right after it
 * was created). Runs on after the form closed; a failure shows as a toast, except a rejected
 * write, which the sync already reported.
 */
export function savePhotoChoice(activityId: Id, choice: PhotoChoice): void {
  if (choice.kind === 'keep') return;
  const run =
    choice.kind === 'new'
      ? setActivityPhoto(activityId, choice.photo)
      : removeActivityPhoto(activityId);
  run.catch((error: unknown) => {
    const text = message(error);
    if (text !== WRITE_REJECTED_MESSAGE) toast.show({ message: text });
  });
}

/** Name, description, photo and place of an activity (AC-006 to AC-008). */
export function ActivityFormFields(props: {
  form: ActivityForm;
  /** The existing activity of the same name: open it (or choose it) instead of a second one. */
  onOpenExisting: (activity: Activity) => void;
  openLabel?: string;
  autoFocus?: boolean;
}) {
  const { form } = props;
  const place = form.reading?.status === 'place' ? form.reading.place : undefined;
  const confirmation = place
    ? [
        place.placeName ? `Ort aus dem Link: ${place.placeName}` : 'Ort aus dem Link',
        place.location ? 'Koordinaten übernommen' : undefined,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;
  return (
    <Stack gap={16}>
      <Stack gap={8}>
        <TextField
          label="Name"
          value={form.name}
          onChangeText={form.setName}
          placeholder="z. B. Eislaufen"
          maxLength={ACTIVITY_NAME_MAX_LENGTH}
          autoFocus={props.autoFocus}
          error={form.nameError}
          testID="activity-name"
        />
        {form.duplicate ? (
          <Notice
            testID="activity-duplicate"
            text={`Gibt es schon: ${form.duplicate.name}`}
            action={
              <Button
                label={props.openLabel ?? 'Öffnen'}
                variant="link"
                size="sm"
                onPress={() => {
                  if (form.duplicate) props.onOpenExisting(form.duplicate);
                }}
                testID="activity-duplicate-open"
              />
            }
          />
        ) : null}
      </Stack>
      <TextField
        label="Beschreibung"
        value={form.description}
        onChangeText={form.setDescription}
        placeholder="z. B. Schlittschuhe gibt es vor Ort zum Ausleihen"
        multiline
        testID="activity-description-input"
      />
      {CAN_PICK_PHOTO ? <PhotoField form={form} /> : null}
      <Stack gap={8}>
        <Text variant="smallStrong">Ort (optional)</Text>
        <TextField
          accessibilityLabel="Karten-Link"
          value={form.link}
          onChangeText={form.changeLink}
          placeholder="Link aus Google Maps oder Apple Karten einfügen"
          error={form.linkError}
          hint={
            form.reading
              ? undefined
              : 'In der Karten-App auf „Teilen“ tippen und den Link kopieren.'
          }
          left={<Icon name="link" size={18} color="muted" />}
          testID="activity-link"
        />
        {confirmation ? (
          <Row gap={6}>
            <Icon name="circle-check" size={16} color="success" />
            <Text
              variant="small"
              color="success"
              testID="activity-link-ok"
              style={{ flexShrink: 1 }}
            >
              {confirmation}
            </Text>
          </Row>
        ) : null}
        {form.reading?.status === 'short' ? (
          <Row gap={6}>
            <Icon name="info" size={16} color="muted" />
            <Text
              variant="small"
              color="muted"
              testID="activity-link-short"
              style={{ flexShrink: 1 }}
            >
              Kurzlink erkannt – Ort wird beim Speichern abgerufen
            </Text>
          </Row>
        ) : null}
        <TextField
          label="Ortsname"
          value={form.placeName}
          onChangeText={form.setPlaceName}
          placeholder="z. B. Eisstadion Hohenschönhausen"
          testID="activity-place-name"
        />
        <TextField
          label="Adresse"
          value={form.address}
          onChangeText={form.setAddress}
          placeholder="Straße, Ort"
          testID="activity-address"
        />
      </Stack>
    </Stack>
  );
}

function PhotoField(props: { form: ActivityForm }) {
  const { form } = props;
  const online = useOnlineOnly();
  const saved = usePhoto(form.photo.kind === 'keep' ? form.activity?.photoPath : undefined);
  const uri = form.photo.kind === 'new' ? form.photo.uri : saved.uri;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="smallStrong">Foto (optional)</Text>
      <Row gap={12}>
        <View testID={uri ? 'activity-form-photo-preview' : undefined}>
          <Photo
            source={uri ? { uri } : undefined}
            placeholderIcon={ACTIVITY_ICON}
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
            disabled={online.disabled || form.preparing}
            hint={online.hint}
            onPress={form.choosePhoto}
            testID="activity-form-photo"
          />
          {uri ? (
            <Button
              label="Foto entfernen"
              variant="link"
              size="sm"
              disabled={online.disabled}
              onPress={form.removePhoto}
              testID="activity-form-photo-remove"
            />
          ) : null}
        </Stack>
      </Row>
      {form.preparing ? (
        <Text variant="small" color="muted">
          Foto wird vorbereitet …
        </Text>
      ) : null}
      {form.photoError ? (
        <Text variant="small" color="warn" testID="activity-form-photo-error">
          {form.photoError}
        </Text>
      ) : null}
    </View>
  );
}

/** "Aktivität anlegen" / "Aktivität bearbeiten" as its own sheet (collection and detail). */
export function ActivityFormSheet(props: {
  /** Edit this activity; without it the sheet creates one. */
  activity?: Activity;
  onClose: () => void;
  /** Called with the activity's id after saving. */
  onSaved?: (activityId: Id) => void;
  onOpenExisting: (activityId: Id) => void;
}) {
  const online = useOnlineOnly();
  const form = useActivityForm(props.activity);
  const editing = props.activity;

  const save = async () => {
    if (online.disabled) return;
    const values = await form.submit();
    if (!values) return;
    let id: Id;
    try {
      if (editing) {
        // Every field is sent, so a cleared field (e.g. the whole place) is cleared.
        updateActivity(editing.id, {
          name: values.draft.name,
          description: values.draft.description,
          placeName: values.draft.placeName,
          address: values.draft.address,
          location: values.draft.location,
          mapsUrl: values.draft.mapsUrl,
        });
        id = editing.id;
      } else {
        id = createActivity(values.draft);
      }
    } catch (error) {
      form.fail(error);
      return;
    }
    props.onClose();
    props.onSaved?.(id);
    savePhotoChoice(id, values.photo);
    toast.show({ message: 'Aktivität gespeichert' });
  };

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title={editing ? 'Aktivität bearbeiten' : 'Aktivität anlegen'}
      testID="activity-sheet"
      footer={
        <Button
          label="Speichern"
          icon="check"
          full
          disabled={online.disabled || !!form.duplicate || form.saving || form.preparing}
          hint={
            online.hint ?? (form.duplicate ? `Gibt es schon: ${form.duplicate.name}` : undefined)
          }
          onPress={() => void save()}
          testID="activity-save"
        />
      }
    >
      <Stack gap={16}>
        {online.hint ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : null}
        <ActivityFormFields
          form={form}
          autoFocus={!editing}
          onOpenExisting={(existing) => {
            props.onClose();
            props.onOpenExisting(existing.id);
          }}
        />
      </Stack>
    </Sheet>
  );
}
