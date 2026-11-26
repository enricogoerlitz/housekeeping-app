import {
  readMapsLink,
  removeRestaurantPhoto,
  resolveMapsShortLink,
  setRestaurantPhoto,
  useRestaurants,
  type LinkReading,
  type RestaurantDraft,
} from '@housekeeping/api';
import {
  addTag,
  cuisineValues,
  normalizeText,
  normalizeWebsite,
  priceLabel,
  tagValues,
  type GeoPoint,
  type Id,
  type PlaceValues,
  type Restaurant,
} from '@housekeeping/core';
import { Button, Chip, Icon, Notice, Row, Stack, Text, TextField } from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { ValuePicker } from '@/features/recipes/sections/classification-section';
import { PlaceField } from '@/features/shell/place-field';
import {
  PhotoChoiceField,
  savePhotoChoice,
  usePhotoChoice,
  type PhotoChoice,
} from '@/features/shell/own-photo';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';
import type { WebPlace } from '@/features/web-search/place-web-fill';

const PRICE_LEVELS: NonNullable<Restaurant['priceLevel']>[] = [1, 2, 3, 4];

/** restaurants_tags_size (spec 0024, REQ-001: "wie am Rezept, höchstens 30"). */
const MAX_TAGS = 30;

/** The symbol of restaurants wherever they have no photo (spec 0024, REQ-004). */
export const RESTAURANT_ICON = 'utensils';

type PlaceReading = Extract<LinkReading, { status: 'place' }>;

const message = (error: unknown) => errorMessage(error, FAILED_MESSAGE);

/** Which field gets the keyboard first; "notes" from "Notiz bearbeiten" (spec 0024, REQ-002). */
export type RestaurantFormFocus = 'link' | 'name' | 'notes';

/**
 * State of the restaurant form, for "Restaurant hinzufügen", "Neu → Restaurant" of the plan and
 * "Restaurant bearbeiten" (spec 0024, REQ-001, prefilled from `restaurant`): a map link at the top
 * fills it; only the name is required. The fields render with `RestaurantFormFields`; the save
 * button lives with whoever shows the form.
 */
export function useRestaurantForm(
  initialText?: string,
  initialName?: string,
  restaurant?: Restaurant,
) {
  const restaurants = useRestaurants();
  const [initial] = useState(() =>
    restaurant
      ? { link: restaurant.mapsUrl ?? '', name: restaurant.name, reading: undefined }
      : readInitial(initialText, initialName),
  );
  const [link, setLink] = useState(initial.link);
  const [reading, setReading] = useState<LinkReading | undefined>(initial.reading);
  // The saved link and coordinates of the restaurant being edited, until the link is changed.
  const [kept, setKept] = useState<{ mapsUrl?: string; location?: GeoPoint }>({
    mapsUrl: restaurant?.mapsUrl,
    location: restaurant?.location,
  });
  const [linkError, setLinkError] = useState<string | undefined>();
  const [name, setNameValue] = useState(initial.name);
  // "Name für die Suche" (spec 0042, REQ-001): only for the pin, not stored.
  const [searchName, setSearchName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [cuisine, setCuisine] = useState(restaurant?.cuisine ?? '');
  const [address, setAddress] = useState(restaurant?.address ?? '');
  const [priceLevel, setPriceLevel] = useState<Restaurant['priceLevel']>(restaurant?.priceLevel);
  const [tags, setTagsValue] = useState<string[]>(restaurant?.tags ?? []);
  const [tagsError, setTagsError] = useState<string | undefined>();
  const [website, setWebsiteValue] = useState(restaurant?.websiteUrl ?? '');
  const [websiteError, setWebsiteError] = useState<string | undefined>();
  const [notes, setNotes] = useState(restaurant?.notes ?? '');
  const photoChoice = usePhotoChoice(restaurant?.photoPath);
  const [saving, setSaving] = useState(false);

  const place: PlaceReading | undefined = reading?.status === 'place' ? reading : undefined;
  const duplicate = place?.duplicate;

  const setName = (value: string) => {
    setNameValue(value);
    setNameError(undefined);
  };
  const setWebsite = (value: string) => {
    setWebsiteValue(value);
    setWebsiteError(undefined);
  };
  const setTags = (next: string[]) => {
    setTagsValue(next);
    setTagsError(next.length > MAX_TAGS ? `Höchstens ${MAX_TAGS} Schlagworte` : undefined);
  };

  const changeLink = (text: string) => {
    setLink(text);
    // AC-001 (REQ-001): an emptied or changed link takes the saved link and coordinates with it.
    setKept({});
    // A name the previous link filled in belongs to that link, not to the person.
    const filledName = place?.draft.name;
    if (!text.trim()) {
      setReading(undefined);
      setLinkError(undefined);
      return;
    }
    const next = readMapsLink(text, restaurant?.id);
    if (next.status === 'invalid') {
      setReading(undefined);
      setLinkError('Das ist kein Karten-Link');
      if (filledName && name === filledName) setNameValue('');
      return;
    }
    setLinkError(undefined);
    setReading(next);
    // A name typed before the link (spec 0042: name, pin, link) stays.
    const ownName = name.trim() !== '' && name !== filledName;
    if (next.status === 'place' && next.draft.name) {
      if (!ownName) setName(next.draft.name);
    } else if (filledName && name === filledName) {
      setNameValue('');
    }
  };

  /**
   * Resolves a short link (AC-005, AC-031) and checks name, tags and website. Returns the draft to
   * save, or undefined after showing the problem at its field.
   */
  const submit = async (): Promise<RestaurantDraft | undefined> => {
    if (duplicate || saving || photoChoice.preparing) return undefined;
    const checkedWebsite = normalizeWebsite(website);
    if ('problem' in checkedWebsite) {
      setWebsiteError(checkedWebsite.problem);
      return undefined;
    }
    if (tags.length > MAX_TAGS) return undefined;
    let resolved: RestaurantDraft | undefined;
    if (reading?.status === 'short') {
      setSaving(true);
      try {
        resolved = await resolveMapsShortLink(reading.url);
      } catch (caught) {
        setLinkError(message(caught));
        return undefined;
      } finally {
        setSaving(false);
      }
    }
    const location: GeoPoint | undefined =
      place?.draft.location ?? resolved?.location ?? kept.location;
    const draft: RestaurantDraft = {
      name: name.trim() || resolved?.name || '',
      address: address.trim() || resolved?.address,
      location,
      mapsUrl: place?.draft.mapsUrl ?? resolved?.mapsUrl ?? kept.mapsUrl,
      cuisine: cuisine.trim() || resolved?.cuisine,
      priceLevel: priceLevel ?? resolved?.priceLevel,
      tags,
      websiteUrl: checkedWebsite.url,
      notes: notes.trim() || undefined,
    };
    if (!draft.name.trim()) {
      setNameError('Name fehlt');
      return undefined;
    }
    return draft;
  };

  // Spec 0049: what the form shows now, for the Änderungsansicht, and the place found on the web.
  const webValues = (): PlaceValues => ({
    name,
    address,
    cuisine,
    tags: tags.join(', '),
    priceLevel: priceLevel === undefined ? '' : String(priceLevel),
    websiteUrl: website,
    mapsUrl: place?.draft.mapsUrl ?? kept.mapsUrl ?? '',
  });
  const applyWeb = (web: WebPlace) => {
    const { values } = web;
    if (values.name) setName(values.name);
    if (values.address) setAddress(values.address);
    if (values.cuisine) setCuisine(values.cuisine);
    if (values.tags) {
      let next = tags;
      for (const tag of values.tags.split(',')) if (tag.trim()) next = addTag(next, tag.trim());
      setTags(next);
    }
    if (values.priceLevel) setPriceLevel(Number(values.priceLevel) as Restaurant['priceLevel']);
    if (values.websiteUrl) setWebsite(values.websiteUrl);
    if (values.mapsUrl) {
      // Like the saved link of a restaurant being edited: kept until the link is changed.
      setLink(values.mapsUrl);
      setReading(undefined);
      setLinkError(undefined);
      setKept({ mapsUrl: values.mapsUrl, location: web.location });
    }
    if (web.photo) photoChoice.takePhoto(web.photo);
  };

  return {
    restaurant,
    restaurants,
    webValues,
    applyWeb,
    link,
    changeLink,
    reading,
    place,
    linkError,
    name,
    setName,
    nameError,
    searchName,
    setSearchName,
    /** Shows an error a command threw at the name field. */
    fail: (error: unknown) => setNameError(message(error)),
    cuisine,
    setCuisine,
    address,
    setAddress,
    priceLevel,
    setPriceLevel,
    tags,
    setTags,
    tagsError,
    website,
    setWebsite,
    websiteError,
    notes,
    setNotes,
    photoChoice,
    /** What happens with the photo on saving (saveRestaurantPhoto). */
    photo: photoChoice.photo,
    saving: saving || photoChoice.preparing,
    duplicate,
    submit,
  };
}

export type RestaurantForm = ReturnType<typeof useRestaurantForm>;

/** Saves the photo choice after the restaurant exists (a new one right after it was created). */
export function saveRestaurantPhoto(restaurantId: Id, choice: PhotoChoice): void {
  savePhotoChoice(
    choice,
    (blob) => setRestaurantPhoto(restaurantId, blob),
    () => removeRestaurantPhoto(restaurantId),
  );
}

/**
 * Link, name, cuisine, address, price, Schlagworte, website, photo and note of a restaurant
 * (spec 0002; spec 0024, REQ-001).
 */
export function RestaurantFormFields(props: {
  form: RestaurantForm;
  /** The restaurant the link points to already exists: open it (or choose it) instead (AC-009). */
  onOpenExisting: (restaurant: Restaurant) => void;
  openLabel?: string;
  /** Which field gets the keyboard first. */
  focus?: RestaurantFormFocus;
}) {
  const { form } = props;
  const confirmation = form.place
    ? [
        form.place.draft.name ? `Aus dem Link: ${form.place.draft.name}` : 'Aus dem Link',
        form.place.draft.location ? 'Koordinaten übernommen' : undefined,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;
  const taken = new Set(form.tags.map(normalizeText));
  return (
    <Stack gap={16}>
      <TextField
        label="Name"
        value={form.name}
        onChangeText={form.setName}
        placeholder="z. B. Trattoria Da Enzo"
        autoFocus={props.focus === 'name'}
        error={form.nameError}
        testID="restaurant-name"
      />
      {/* The place field of restaurants, activities and stores (spec 0042, REQ-001). */}
      <PlaceField
        testPrefix="restaurant"
        entryName={form.name}
        searchName={form.searchName}
        onSearchNameChange={form.setSearchName}
        link={form.link}
        onLinkChange={form.changeLink}
        linkError={form.linkError}
        linkHint={
          form.reading || form.link
            ? undefined
            : 'In der Karten-App auf „Teilen“ tippen und den Link kopieren.'
        }
        linkAutoFocus={props.focus === 'link'}
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
                  testID="restaurant-link-ok"
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
                  testID="restaurant-link-short"
                  style={{ flexShrink: 1 }}
                >
                  Kurzlink erkannt – Ort wird beim Speichern abgerufen
                </Text>
              </Row>
            ) : null}
            {form.duplicate ? (
              <Notice
                testID="restaurant-duplicate"
                text={`Gibt es schon: ${form.duplicate.name}`}
                action={
                  <Button
                    label={props.openLabel ?? 'Öffnen'}
                    variant="link"
                    size="sm"
                    onPress={() => {
                      if (form.duplicate) props.onOpenExisting(form.duplicate);
                    }}
                    testID="restaurant-duplicate-open"
                  />
                }
              />
            ) : null}
          </>
        }
      />
      {/* The household's cuisines as suggestions, like at a recipe (spec 0036, AC-009). */}
      <View style={{ gap: 6 }}>
        <Text variant="smallStrong">Küche</Text>
        {form.cuisine.trim() ? (
          <View style={{ flexDirection: 'row' }}>
            <Chip
              label={form.cuisine.trim()}
              removable
              selected
              accessibilityLabel={`Küche ${form.cuisine.trim()} entfernen`}
              onPress={() => form.setCuisine('')}
              testID="restaurant-cuisine-chosen"
            />
          </View>
        ) : (
          <ValuePicker
            label="Küche"
            placeholder="z. B. Italienisch"
            values={cuisineValues(form.restaurants)}
            onPick={form.setCuisine}
            testID="restaurant-cuisine"
          />
        )}
      </View>
      <View style={{ gap: 6 }}>
        <Text variant="smallStrong">Preis</Text>
        <Row gap={8} wrap>
          {PRICE_LEVELS.map((level) => (
            <Chip
              key={level}
              label={priceLabel(level)}
              selected={form.priceLevel === level}
              onPress={() => form.setPriceLevel(form.priceLevel === level ? undefined : level)}
              testID={`restaurant-price-${level}`}
            />
          ))}
        </Row>
      </View>
      <View style={{ gap: 6 }}>
        <Text variant="smallStrong">Schlagworte</Text>
        {form.tags.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} testID="restaurant-tags">
            {form.tags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                removable
                accessibilityLabel={`Schlagwort ${tag} entfernen`}
                onPress={() => form.setTags(form.tags.filter((other) => other !== tag))}
                testID={`restaurant-tag-${tag}`}
              />
            ))}
          </View>
        ) : null}
        <ValuePicker
          label="Schlagwort"
          placeholder="Schlagwort suchen oder anlegen"
          values={tagValues(form.restaurants).filter((tag) => !taken.has(normalizeText(tag)))}
          onPick={(tag) => form.setTags(addTag(form.tags, tag))}
          testID="restaurant-tag"
        />
        {form.tagsError ? (
          <Text variant="small" color="warn" testID="restaurant-tags-error">
            {form.tagsError}
          </Text>
        ) : null}
      </View>
      <TextField
        label="Webseite"
        value={form.website}
        onChangeText={form.setWebsite}
        placeholder="z. B. trattoria-da-enzo.de"
        keyboardType="url"
        error={form.websiteError}
        testID="restaurant-website"
      />
      <PhotoChoiceField
        state={form.photoChoice}
        placeholderIcon={RESTAURANT_ICON}
        testPrefix="restaurant"
      />
      <TextField
        label="Notiz"
        value={form.notes}
        onChangeText={form.setNotes}
        placeholder="z. B. Am Wochenende reservieren"
        multiline
        autoFocus={props.focus === 'notes'}
        testID="restaurant-notes"
      />
    </Stack>
  );
}

/** Reads the shared text once: a usable map link fills the form, anything else only the name. */
function readInitial(
  text: string | undefined,
  fallbackName: string | undefined,
): { link: string; reading?: LinkReading; name: string } {
  const shared = text?.trim() ?? '';
  const reading = shared ? readMapsLink(shared) : undefined;
  if (!reading || reading.status === 'invalid') return { link: '', name: fallbackName ?? '' };
  if (reading.status === 'place')
    return { link: shared, reading, name: reading.draft.name || fallbackName || '' };
  return { link: shared, reading, name: fallbackName ?? '' };
}
