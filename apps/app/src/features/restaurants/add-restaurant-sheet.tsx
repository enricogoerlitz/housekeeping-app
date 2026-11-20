import {
  createRestaurant,
  readMapsLink,
  resolveShortLink,
  type LinkReading,
  type RestaurantDraft,
} from '@housekeeping/api';
import { priceLabel, type GeoPoint, type Id, type Restaurant } from '@housekeeping/core';
import {
  Button,
  Chip,
  Icon,
  Notice,
  Row,
  Sheet,
  Stack,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';

const PRICE_LEVELS: NonNullable<Restaurant['priceLevel']>[] = [1, 2, 3, 4];

export interface AddRestaurantSheetProps {
  onClose: () => void;
  /** Called with the new restaurant's id after saving. */
  onCreated: (restaurantId: Id) => void;
  /** Opens an existing restaurant instead of saving a duplicate (AC-009). */
  onOpenExisting: (restaurantId: Id) => void;
  /** Text shared or pasted before the sheet opened (share target, AC-008). */
  initialText?: string;
  /** Name to use when the shared text holds no usable map link. */
  initialName?: string;
  /** Which field gets the keyboard first. */
  focus?: 'link' | 'name';
}

type PlaceReading = Extract<LinkReading, { status: 'place' }>;

/**
 * "Restaurant hinzufügen": a map link at the top fills the form; only the name is required.
 * Mount it fresh for every opening so the initial text is read again.
 */
export function AddRestaurantSheet(props: AddRestaurantSheetProps) {
  const online = useOnlineOnly();
  const [initial] = useState(() => readInitial(props.initialText, props.initialName));
  const [link, setLink] = useState(initial.link);
  const [reading, setReading] = useState<LinkReading | undefined>(initial.reading);
  const [linkError, setLinkError] = useState<string | undefined>();
  const [name, setName] = useState(initial.name);
  const [nameError, setNameError] = useState<string | undefined>();
  const [cuisine, setCuisine] = useState('');
  const [address, setAddress] = useState('');
  const [priceLevel, setPriceLevel] = useState<Restaurant['priceLevel']>();
  const [notes, setNotes] = useState('');

  const place: PlaceReading | undefined = reading?.status === 'place' ? reading : undefined;
  const duplicate = place?.duplicate;

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
      if (filledName && name === filledName) setName('');
      return;
    }
    setLinkError(undefined);
    setReading(next);
    if (next.status === 'place' && next.draft.name) {
      setName(next.draft.name);
      setNameError(undefined);
    } else if (filledName && name === filledName) {
      setName('');
    }
  };

  const save = () => {
    if (online.disabled || duplicate) return;
    // A short link only says where the place is once the server followed it (AC-005).
    const resolved: RestaurantDraft | undefined =
      reading?.status === 'short' ? resolveShortLink(reading.url) : undefined;
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
      return;
    }
    try {
      const id = createRestaurant(draft);
      props.onClose();
      props.onCreated(id);
      toast.show({ message: 'Restaurant gespeichert' });
    } catch (caught) {
      setNameError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.');
    }
  };

  const confirmation = place
    ? [
        place.draft.name ? `Aus dem Link: ${place.draft.name}` : 'Aus dem Link',
        place.draft.location ? 'Koordinaten übernommen' : undefined,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title="Restaurant hinzufügen"
      testID="restaurant-sheet"
      footer={
        <Button
          label="Speichern"
          icon="check"
          full
          disabled={online.disabled || !!duplicate}
          hint={online.hint ?? (duplicate ? `Gibt es schon: ${duplicate.name}` : undefined)}
          onPress={save}
          testID="restaurant-save"
        />
      }
    >
      <Stack gap={16}>
        {online.hint ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : null}
        <Stack gap={8}>
          <TextField
            label="Karten-Link"
            value={link}
            onChangeText={changeLink}
            placeholder="Link aus Google Maps oder Apple Karten einfügen"
            autoFocus={props.focus === 'link'}
            error={linkError}
            hint={
              reading ? undefined : 'In der Karten-App auf „Teilen“ tippen und den Link kopieren.'
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
          {reading?.status === 'short' ? (
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
          {duplicate ? (
            <Notice
              testID="restaurant-duplicate"
              text={`Gibt es schon: ${duplicate.name}`}
              action={
                <Button
                  label="Öffnen"
                  variant="link"
                  size="sm"
                  onPress={() => {
                    props.onClose();
                    props.onOpenExisting(duplicate.id);
                  }}
                  testID="restaurant-duplicate-open"
                />
              }
            />
          ) : null}
        </Stack>

        <TextField
          label="Name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setNameError(undefined);
          }}
          placeholder="z. B. Trattoria Da Enzo"
          autoFocus={props.focus === 'name'}
          error={nameError}
          testID="restaurant-name"
        />
        <TextField
          label="Küche"
          value={cuisine}
          onChangeText={setCuisine}
          placeholder="z. B. Italienisch"
          testID="restaurant-cuisine"
        />
        <TextField
          label="Adresse"
          value={address}
          onChangeText={setAddress}
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
                selected={priceLevel === level}
                onPress={() => setPriceLevel(priceLevel === level ? undefined : level)}
                testID={`restaurant-price-${level}`}
              />
            ))}
          </Row>
        </View>
        <TextField
          label="Notiz"
          value={notes}
          onChangeText={setNotes}
          placeholder="z. B. Am Wochenende reservieren"
          multiline
          testID="restaurant-notes"
        />
      </Stack>
    </Sheet>
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
