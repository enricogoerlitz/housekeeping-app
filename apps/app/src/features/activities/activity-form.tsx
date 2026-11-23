import {
  createActivity,
  readActivityMapsLink,
  removeActivityPhoto,
  resolveActivityShortLink,
  setActivityPhoto,
  updateActivity,
  useActivities,
  type ActivityDraft,
  type ActivityLinkReading,
  type ActivityPlace,
} from '@housekeeping/api';
import {
  findDuplicateActivity,
  normalizeWebsite,
  type Activity,
  type GeoPoint,
  type Id,
} from '@housekeeping/core';
import { Button, Icon, Notice, Row, Sheet, Stack, Text, TextField, toast } from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';
import {
  PhotoChoiceField,
  savePhotoChoice as savePhoto,
  usePhotoChoice,
  type PhotoChoice,
} from '@/features/shell/own-photo';

import { ACTIVITY_ICON } from './activity-photo';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';

/** activities_name_length. */
const ACTIVITY_NAME_MAX_LENGTH = 120;

export interface ActivityFormValues {
  draft: ActivityDraft;
  photo: PhotoChoice;
}

const message = (error: unknown) => errorMessage(error, FAILED_MESSAGE);

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
  const [website, setWebsiteValue] = useState(activity?.websiteUrl ?? '');
  const [websiteError, setWebsiteError] = useState<string | undefined>();
  const photoChoice = usePhotoChoice(activity?.photoPath);
  const { photo, preparing } = photoChoice;
  const [saving, setSaving] = useState(false);

  const duplicate = findDuplicateActivity(
    name,
    activities.filter((candidate) => candidate.id !== activity?.id),
  );

  const setWebsite = (value: string) => {
    setWebsiteValue(value);
    setWebsiteError(undefined);
  };

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

  /**
   * Checks the form and resolves a short map link (online). Returns what to save, or undefined
   * after showing the problem at its field ("Name fehlt", AC-007 and AC-023).
   */
  const submit = async (): Promise<ActivityFormValues | undefined> => {
    if (!name.trim()) {
      setNameError('Name fehlt');
      return undefined;
    }
    const checkedWebsite = normalizeWebsite(website);
    if ('problem' in checkedWebsite) {
      setWebsiteError(checkedWebsite.problem);
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
      draft: {
        name: name.trim(),
        description: description.trim() || undefined,
        websiteUrl: checkedWebsite.url,
        ...place,
      },
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
    website,
    setWebsite,
    websiteError,
    photoChoice,
    photo,
    preparing,
    saving,
    duplicate,
    submit,
  };
}

export type ActivityForm = ReturnType<typeof useActivityForm>;

/** Saves the photo choice after the activity exists (a new one right after it was created). */
export function savePhotoChoice(activityId: Id, choice: PhotoChoice): void {
  savePhoto(
    choice,
    (blob) => setActivityPhoto(activityId, blob),
    () => removeActivityPhoto(activityId),
  );
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
      <PhotoChoiceField
        state={form.photoChoice}
        placeholderIcon={ACTIVITY_ICON}
        testPrefix="activity"
      />
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
      <TextField
        label="Webseite"
        value={form.website}
        onChangeText={form.setWebsite}
        placeholder="z. B. eisstadion-koeln.de"
        keyboardType="url"
        error={form.websiteError}
        testID="activity-website"
      />
    </Stack>
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
          websiteUrl: values.draft.websiteUrl,
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
      size="m"
      actions={{
        primary: {
          label: 'Speichern',
          icon: 'check',
          disabled: online.disabled || !!form.duplicate || form.saving || form.preparing,
          hint:
            online.hint ?? (form.duplicate ? `Gibt es schon: ${form.duplicate.name}` : undefined),
          onPress: () => void save(),
          testID: 'activity-save',
        },
      }}
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
