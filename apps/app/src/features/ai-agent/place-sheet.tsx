import {
  readActivityMapsLink,
  resolveActivityShortLink,
  useToday,
  useTrips,
} from '@housekeeping/api';
import {
  AGENT_LIMITS,
  AGENT_RADII,
  RADIUS_LABEL,
  tripPlaces,
  type AgentPlace,
  type AgentRadius,
} from '@housekeeping/core';
import {
  Button,
  ChoiceChips,
  GroupLabel,
  Icon,
  List,
  ListRow,
  Sheet,
  Stack,
  Text,
  TextField,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/features/shell/error-message';

// Spec 0066, REQ-004: "In der Nähe von" — the current location, an address or a Google Maps link,
// a trip with its note, the recent places of this device, and the radius.

const NOT_A_PLACE = 'Das ist kein Google-Maps-Link';
const DEVICE: Omit<AgentPlace, 'radius'> = { source: 'device', label: 'Aktueller Standort' };

/** A typed place or a pasted map link as the agent's place; a short link is resolved online. */
async function placeOf(text: string, radius: AgentRadius): Promise<AgentPlace> {
  const typed = text.trim();
  if (/^https?:\/\//i.test(typed)) {
    const reading = readActivityMapsLink(typed);
    if (reading.status === 'invalid') throw new Error(NOT_A_PLACE);
    const place =
      reading.status === 'short' ? await resolveActivityShortLink(reading.url) : reading.place;
    const label = (place.placeName || place.address || 'Ort aus Google Maps').slice(
      0,
      AGENT_LIMITS.placeLabel,
    );
    return {
      source: 'pinned',
      label,
      ...(place.address && place.address !== label ? { address: place.address.slice(0, 300) } : {}),
      ...(place.location ? { location: place.location } : {}),
      radius,
    };
  }
  return { source: 'pinned', label: typed.slice(0, AGENT_LIMITS.placeLabel), radius };
}

export function PlaceSheet(props: {
  place: AgentPlace;
  recent: readonly AgentPlace[];
  /** Why the window opened by itself (no location). */
  hint?: string;
  onChoose: (place: AgentPlace) => void;
  onClose: () => void;
}) {
  const today = useToday();
  const trips = tripPlaces(useTrips(), today);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [radius, setRadius] = useState<AgentRadius>(props.place.radius);

  const choose = (place: Omit<AgentPlace, 'radius'>) => props.onChoose({ ...place, radius });
  const take = () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    placeOf(text, radius).then(
      (place) => props.onChoose(place),
      (caught: unknown) => {
        setBusy(false);
        setError(errorMessage(caught, NOT_A_PLACE));
      },
    );
  };
  const selected = (place: Omit<AgentPlace, 'radius'>) =>
    place.source === props.place.source && place.label === props.place.label;
  const pin = <Icon name="map-pin" size={20} color="muted" />;

  return (
    <Sheet
      visible
      size="m"
      title="In der Nähe von"
      onClose={props.onClose}
      actions={{
        primary: {
          label: 'Fertig',
          onPress: () => props.onChoose({ ...props.place, radius }),
          testID: 'agent-place-done',
        },
        cancel: null,
      }}
      testID="agent-place-sheet"
    >
      <Stack gap={16}>
        {props.hint ? (
          <Text variant="small" color="warn" testID="agent-place-hint">
            {props.hint}
          </Text>
        ) : null}
        <List>
          <ListRow
            title="Aktueller Standort"
            subtitle="Standort dieses Geräts"
            leading={<Icon name="map-pin" size={20} color="accent" />}
            selected={props.place.source === 'device'}
            onPress={() => choose(DEVICE)}
            testID="agent-place-device"
          />
        </List>
        <Stack gap={8}>
          <TextField
            label="Adresse oder Google Maps Link"
            placeholder="z. B. „Boxhagener Platz“"
            value={text}
            onChangeText={(value) => {
              setText(value);
              setError(undefined);
            }}
            onSubmitEditing={take}
            returnKeyType="done"
            maxLength={2000}
            testID="agent-place-text"
          />
          {error ? (
            <Text variant="small" color="warn" testID="agent-place-error">
              {error}
            </Text>
          ) : null}
          <View style={{ alignSelf: 'flex-start' }}>
            <Button
              label={busy ? 'Wird geöffnet …' : 'Übernehmen'}
              variant="secondary"
              size="sm"
              disabled={!text.trim() || busy}
              onPress={take}
              testID="agent-place-take"
            />
          </View>
        </Stack>
        {trips.length > 0 ? (
          <Stack gap={6}>
            <GroupLabel>Aus euren Reisen</GroupLabel>
            <List>
              {trips.map((trip) => (
                <ListRow
                  key={trip.tripId}
                  title={trip.label}
                  subtitle={trip.dates}
                  leading={<Icon name="luggage" size={20} color="muted" />}
                  selected={selected({ source: 'trip', label: trip.label })}
                  onPress={() => choose({ source: 'trip', label: trip.label })}
                  testID={`agent-place-trip-${trip.tripId}`}
                />
              ))}
            </List>
          </Stack>
        ) : null}
        {props.recent.length > 0 ? (
          <Stack gap={6}>
            <GroupLabel>Zuletzt</GroupLabel>
            <List>
              {props.recent.map((place, index) => (
                <ListRow
                  key={`${place.label}-${index}`}
                  title={place.label}
                  subtitle={place.address}
                  leading={pin}
                  selected={selected(place)}
                  onPress={() => choose(place)}
                  testID={`agent-place-recent-${index}`}
                />
              ))}
            </List>
          </Stack>
        ) : null}
        <Stack gap={6}>
          <GroupLabel>Umkreis</GroupLabel>
          <ChoiceChips
            label="Umkreis"
            options={AGENT_RADII.map((value) => ({ value, label: RADIUS_LABEL[value] }))}
            value={radius}
            onChange={setRadius}
            testID="agent-place-radius"
          />
        </Stack>
      </Stack>
    </Sheet>
  );
}
