import {
  readMapsLink,
  resolveMapsShortLink,
  type LinkReading,
  type RestaurantDraft,
} from '@housekeeping/api';
import { priceLabel, type GeoPoint, type Restaurant } from '@housekeeping/core';
import { Button, Chip, Icon, Notice, Row, Stack, Text, TextField } from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

const PRICE_LEVELS: NonNullable<Restaurant['priceLevel']>[] = [1, 2, 3, 4];

type PlaceReading = Extract<LinkReading, { status: 'place' }>;

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Das hat nicht geklappt.';

/**
 * State of the restaurant form: a map link at the top fills it; only the name is required. The
 * fields render with `RestaurantFormFields`; the save button lives with whoever shows the form
 * ("Restaurant hinzufügen" or the plan's add sheet).
 */
export function useRestaurantForm(initialText?: string, initialName?: string) {
  const [initial] = useState(() => readInitial(initialText, initialName));
  const [link, setLink] = useState(initial.link);
  const [reading, setReading] = useState<LinkReading | undefined>(initial.reading);
  const [linkError, setLinkError] = useState<string | undefined>();
  const [name, setNameValue] = useState(initial.name);
  const [nameError, setNameError] = useState<string | undefined>();
  const [cuisine, setCuisine] = useState('');
  const [address, setAddress] = useState('');
  const [priceLevel, setPriceLevel] = useState<Restaurant['priceLevel']>();
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const place: PlaceReading | undefined = reading?.status === 'place' ? reading : undefined;
  const duplicate = place?.duplicate;

  const setName = (value: string) => {
    setNameValue(value);
    setNameError(undefined);
  };

  const changeLink = (text: string) => {
    setLink(text);
    // A name the previous link filled in belongs to that link, not to the person.
    const filledName = place?.draft.name;
    if (!text.trim()) {
      setReading(undefined);
      setLinkError(undefined);
      return;
    }
    const next = readMapsLink(text);
    if (next.status === 'invalid') {
      setReading(undefined);
      setLinkError('Das ist kein Karten-Link');
      if (filledName && name === filledName) setNameValue('');
      return;
    }
    setLinkError(undefined);
    setReading(next);
    if (next.status === 'place' && next.draft.name) {
      setName(next.draft.name);
    } else if (filledName && name === filledName) {
      setNameValue('');
    }
  };

  /**
   * Resolves a short link (AC-005, AC-031) and checks the name. Returns the draft to save, or
   * undefined after showing the problem at its field.
   */
  const submit = async (): Promise<RestaurantDraft | undefined> => {
    if (duplicate || saving) return undefined;
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
    const location: GeoPoint | undefined = place?.draft.location ?? resolved?.location;
    const draft: RestaurantDraft = {
      name: name.trim() || resolved?.name || '',
      address: address.trim() || resolved?.address,
      location,
      mapsUrl: place?.draft.mapsUrl ?? resolved?.mapsUrl,
      cuisine: cuisine.trim() || resolved?.cuisine,
      priceLevel: priceLevel ?? resolved?.priceLevel,
      notes: notes.trim() || undefined,
    };
    if (!draft.name.trim()) {
      setNameError('Name fehlt');
      return undefined;
    }
    return draft;
  };

  return {
    link,
    changeLink,
    reading,
    place,
    linkError,
    name,
    setName,
    nameError,
    /** Shows an error a command threw at the name field. */
    fail: (error: unknown) => setNameError(message(error)),
    cuisine,
    setCuisine,
    address,
    setAddress,
    priceLevel,
    setPriceLevel,
    notes,
    setNotes,
    saving,
    duplicate,
    submit,
  };
}

export type RestaurantForm = ReturnType<typeof useRestaurantForm>;

/** Link, name, cuisine, address, price and note of a restaurant (spec 0002). */
export function RestaurantFormFields(props: {
  form: RestaurantForm;
  /** The restaurant the link points to already exists: open it (or choose it) instead (AC-009). */
  onOpenExisting: (restaurant: Restaurant) => void;
  openLabel?: string;
  /** Which field gets the keyboard first. */
  focus?: 'link' | 'name';
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
  return (
    <Stack gap={16}>
      <Stack gap={8}>
        <TextField
          label="Karten-Link"
          value={form.link}
          onChangeText={form.changeLink}
          placeholder="Link aus Google Maps oder Apple Karten einfügen"
          autoFocus={props.focus === 'link'}
          error={form.linkError}
          hint={
            form.reading
              ? undefined
              : 'In der Karten-App auf „Teilen“ tippen und den Link kopieren.'
          }
          left={<Icon name="link" size={18} color="muted" />}
          testID="restaurant-link"
        />
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
      </Stack>

      <TextField
        label="Name"
        value={form.name}
        onChangeText={form.setName}
        placeholder="z. B. Trattoria Da Enzo"
        autoFocus={props.focus === 'name'}
        error={form.nameError}
        testID="restaurant-name"
      />
      <TextField
        label="Küche"
        value={form.cuisine}
        onChangeText={form.setCuisine}
        placeholder="z. B. Italienisch"
        testID="restaurant-cuisine"
      />
      <TextField
        label="Adresse"
        value={form.address}
        onChangeText={form.setAddress}
        placeholder="Straße, Ort"
        testID="restaurant-address"
      />
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
      <TextField
        label="Notiz"
        value={form.notes}
        onChangeText={form.setNotes}
        placeholder="z. B. Am Wochenende reservieren"
        multiline
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
