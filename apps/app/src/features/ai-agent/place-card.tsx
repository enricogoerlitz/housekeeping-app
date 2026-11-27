import {
  createActivity,
  createRestaurant,
  loadPhotoFromAddress,
  savePhotoFromAddress,
  useActivities,
  useActivityKinds,
  useRestaurants,
} from '@housekeeping/api';
import {
  activityDraftOfCard,
  restaurantDraftOfCard,
  savedPlaceOf,
  type AgentCard,
} from '@housekeeping/core';
import {
  Badge,
  Button,
  Icon,
  openExternalLink,
  Photo,
  Text,
  toast,
  useBreakpoint,
  useTheme,
} from '@housekeeping/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useOpenActivity } from '@/features/activities/navigation';
import { useOpenRestaurant } from '@/features/restaurants/navigation';
import { errorMessage } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';

// Spec 0066, REQ-006/REQ-007: one suggestion as a card of the carousel (Antwort A): the Google
// photo through fetch-image (never stored), name, stars · price · kind, the open status, why it
// fits, "Google Maps" and "Speichern" through the app's own write path.

const CARD_WIDTH_PHONE = 272;
const CARD_WIDTH_WIDE = 300;

function useCardPhoto(url: string | undefined): { uri?: string; loading: boolean } {
  const [photo, setPhoto] = useState<{ uri?: string; loading: boolean }>({ loading: !!url });
  useEffect(() => {
    if (!url) return;
    let live = true;
    let uri: string | undefined;
    loadPhotoFromAddress(url).then(
      (blob) => {
        if (!live) return;
        uri = URL.createObjectURL(blob);
        setPhoto({ uri, loading: false });
      },
      () => {
        if (live) setPhoto({ loading: false });
      },
    );
    return () => {
      live = false;
      if (uri) URL.revokeObjectURL(uri);
    };
  }, [url]);
  return photo;
}

/** "4,5 · €€€ · Gourmet" (the stars only from Google, decision 6). */
function metaLine(card: AgentCard): string {
  const price = card.priceLevel ? '€'.repeat(card.priceLevel) : card.priceRange;
  return [
    card.rating !== undefined
      ? card.rating.toLocaleString('de-DE', { maximumFractionDigits: 1 })
      : '',
    price ?? '',
    card.category ?? '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function PlaceCard(props: { card: AgentCard; testID: string }) {
  const { card, testID } = props;
  const theme = useTheme();
  const { isPhone } = useBreakpoint();
  const online = useOnlineOnly();
  const restaurants = useRestaurants();
  const activities = useActivities();
  const kinds = useActivityKinds();
  const openRestaurant = useOpenRestaurant();
  const openActivity = useOpenActivity();
  const photo = useCardPhoto(card.imageUrl);
  const saved = savedPlaceOf(card, restaurants, activities);

  // Preview 28.11.: the card's Google photo comes along through the usual photo path; when it
  // cannot be loaded the entry is saved without one and the notice says so calmly.
  const save = () => {
    let id: string;
    try {
      id =
        card.kind === 'restaurant'
          ? createRestaurant(restaurantDraftOfCard(card))
          : createActivity(activityDraftOfCard(card, kinds));
    } catch (error) {
      toast.show({ message: errorMessage(error) });
      return;
    }
    const imageUrl = card.imageUrl;
    if (!imageUrl) {
      toast.show({ message: `${card.name} ist gespeichert`, duration: 2500 });
      return;
    }
    void savePhotoFromAddress({ kind: card.kind, id }, imageUrl).then((withPhoto) =>
      toast.show({
        message: withPhoto
          ? `${card.name} ist gespeichert, mit Foto`
          : `${card.name} ist gespeichert – das Foto ließ sich nicht übernehmen`,
        duration: 3000,
      }),
    );
  };
  const openSaved = () => {
    if (!saved) return;
    if (saved.kind === 'restaurant') openRestaurant(saved.id);
    else openActivity(saved.id);
  };
  const meta = metaLine(card);

  return (
    <View
      testID={testID}
      style={{
        width: isPhone ? CARD_WIDTH_PHONE : CARD_WIDTH_WIDE,
        borderRadius: theme.shape.radius.card,
        backgroundColor: theme.colors.surface,
        borderWidth: theme.shape.cardBorder ? 1 : 0,
        borderColor: theme.colors.border,
        overflow: 'hidden',
      }}
    >
      <Photo
        source={photo.uri ? { uri: photo.uri } : undefined}
        loading={photo.loading}
        placeholderIcon={card.kind === 'restaurant' ? 'utensils' : 'mountain'}
        aspectRatio={16 / 9}
        radius={0}
        alt={photo.uri ? `Foto von ${card.name} aus Google Maps` : undefined}
        testID={`${testID}-photo`}
      />
      <View style={{ padding: 12, gap: 4, flexGrow: 1 }}>
        {card.step ? <Badge label={card.step} tone="accent" /> : null}
        <Text variant="cardTitle" numberOfLines={2} testID={`${testID}-name`}>
          {card.name}
        </Text>
        {meta ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {card.rating !== undefined ? <Icon name="star" size={14} color="star" /> : null}
            <Text variant="small" color="muted" numberOfLines={1} testID={`${testID}-meta`}>
              {meta}
            </Text>
          </View>
        ) : null}
        {card.openStatus ? (
          <Text variant="small" color="accent" numberOfLines={1}>
            {card.openStatus}
          </Text>
        ) : null}
        {card.why ? (
          <Text variant="small" numberOfLines={3}>
            {card.why}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, paddingTop: 8, marginTop: 'auto' }}>
          {card.mapsUrl ? (
            <View style={{ flex: 1 }}>
              <Button
                label="Google Maps"
                variant="secondary"
                size="sm"
                full
                onPress={() => openExternalLink(card.mapsUrl!)}
                testID={`${testID}-maps`}
              />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            {saved ? (
              <Button
                label="Öffnen"
                icon="arrow-right"
                variant="secondary"
                size="sm"
                full
                onPress={openSaved}
                accessibilityLabel={`${card.name} öffnen`}
                testID={`${testID}-saved`}
              />
            ) : (
              <Button
                label="Speichern"
                variant="secondary"
                size="sm"
                full
                disabled={online.disabled}
                hint={online.hint}
                onPress={save}
                accessibilityLabel={`${card.name} als ${card.kind === 'restaurant' ? 'Restaurant' : 'Aktivität'} speichern`}
                testID={`${testID}-save`}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

/** The two quiet placeholders while the agent builds its cards (REQ-005). */
export function PlaceCardSkeleton(props: { testID?: string }) {
  const theme = useTheme();
  const { isPhone } = useBreakpoint();
  return (
    <View
      testID={props.testID}
      style={{
        width: isPhone ? CARD_WIDTH_PHONE : CARD_WIDTH_WIDE,
        height: 280,
        borderRadius: theme.shape.radius.card,
        backgroundColor: theme.colors.surfaceSunken,
      }}
    />
  );
}
