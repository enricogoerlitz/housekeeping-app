import {
  createActivity,
  useActivityKindsById,
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
  activityIconOf,
  findDuplicateActivity,
  normalizeWebsite,
  type Activity,
  type ActivityIcon,
  type GeoPoint,
  type Id,
  type PlaceValues,
} from '@housekeeping/core';
import {
  Button,
  Icon,
  Notice,
  Row,
  Sheet,
  Stack,
  SwitchRow,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';
import { PlaceField } from '@/features/shell/place-field';
import {
  PhotoChoiceField,
  savePhotoChoice as savePhoto,
  usePhotoChoice,
  type PhotoChoice,
} from '@/features/shell/own-photo';

import { ActivityIconField, ActivityKindField } from './activity-kind-field';
import { ACTIVITY_ICON } from './activity-photo';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';
import { PlaceWebFill, type WebPlace } from '@/features/web-search/place-web-fill';

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
  const kindsById = useActivityKindsById();
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
  // Spec 0041: "Art", "Symbol" and "Merken" (on for a new activity, REQ-004).
  const [kindId, setKindId] = useState<Id | undefined>(activity?.kindId);
  const [icon, setIcon] = useState<ActivityIcon | undefined>(activity?.icon);
  const [remembered, setRemembered] = useState(activity?.remembered ?? true);
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
        kindId,
        icon,
        remembered,
        ...place,
      },
      photo,
    };
  };

  // Spec 0049: what the form shows now, for the Änderungsansicht, and the place found on the web.
  const webValues = (): PlaceValues => ({
    name,
    placeName,
    address,
    kind: kindId ? (kindsById[kindId]?.name ?? '') : '',
    description,
    websiteUrl: website,
    mapsUrl: mapsUrl ?? '',
  });
  const applyWeb = (web: WebPlace) => {
    const { values } = web;
    if (values.name) setName(values.name);
    if (values.placeName) setPlaceName(values.placeName);
    if (values.address) setAddress(values.address);
    if (values.description) setDescription(values.description);
    if (values.websiteUrl) setWebsite(values.websiteUrl);
    if (values.kind) {
      const kind = Object.values(kindsById).find((candidate) => candidate.name === values.kind);
      if (kind) setKindId(kind.id);
    }
    if (values.mapsUrl) {
      setLink(values.mapsUrl);
      setReading(undefined);
      setLinkError(undefined);
      setLinkPlaceName(undefined);
      setMapsUrl(values.mapsUrl);
      setLocation(web.location);
    }
    if (web.photo) photoChoice.takePhoto(web.photo);
  };

  return {
    activity,
    webValues,
    applyWeb,
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
    kindId,
    setKindId,
    icon,
    setIcon,
    remembered,
    setRemembered,
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
  const kindsById = useActivityKindsById();
  const kindIcon = activityIconOf({ kindId: form.kindId }, kindsById);
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
      <ActivityKindField kindId={form.kindId} onChange={form.setKindId} />
      <ActivityIconField
        icon={form.icon}
        fallback={kindIcon}
        fromKind={form.kindId !== undefined && kindsById[form.kindId] !== undefined}
        onChange={form.setIcon}
      />
      <SwitchRow
        label="Merken"
        description="Steht in der Liste unter „Gemerkt“. Aus für Einmaliges – im Kalender steht es trotzdem."
        value={form.remembered}
        onValueChange={form.setRemembered}
        testID="activity-remembered"
      />
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
        placeholderIcon={form.icon ?? (form.kindId ? kindIcon : ACTIVITY_ICON)}
        testPrefix="activity"
      />
      {/* The place field of restaurants, activities and stores (spec 0042, REQ-001): the
          name for the search is the place name ("Eisstadion …"), which also labels "Route". */}
      <PlaceField
        title="Ort (optional)"
        testPrefix="activity"
        entryName={form.name}
        searchName={form.placeName}
        onSearchNameChange={form.setPlaceName}
        link={form.link}
        onLinkChange={form.changeLink}
        linkError={form.linkError}
        linkHint={
          form.reading ? undefined : 'In der Karten-App auf „Teilen“ tippen und den Link kopieren.'
        }
        address={{ value: form.address, onChange: form.setAddress }}
        onWebsite={form.setWebsite}
        linkStatus={
          <>
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
            {form.reading?.status === 'short' && !form.linkError ? (
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
          </>
        }
      />
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
          kindId: values.draft.kindId,
          icon: values.draft.icon,
          remembered: values.draft.remembered,
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
        {/* Spec 0049: a new one is filled at once, an existing one shows its changes first. */}
        <PlaceWebFill
          kind="activity"
          name={form.name}
          {...(editing ? { current: form.webValues() } : {})}
          hasPhoto={editing?.photoPath !== undefined}
          onApply={form.applyWeb}
          onLink={form.changeLink}
          testID="activity-web"
        />
        <ActivityFormFields
          form={form}
          autoFocus
          onOpenExisting={(existing) => {
            props.onClose();
            props.onOpenExisting(existing.id);
          }}
        />
      </Stack>
    </Sheet>
  );
}
