import {
  rateRestaurant,
  toggleRestaurantFavorite,
  updateRestaurant,
  useCurrentMember,
  useMembers,
  usePlanEntries,
  useRestaurant,
  useToday,
} from '@housekeeping/api';
import { priceLabel, restaurantVisits, type Id, type Restaurant } from '@housekeeping/core';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Row,
  Section,
  Stack,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { DetailPage } from '@/features/shell/detail-page';
import { FavoriteButton } from '@/features/shell/favorite-button';
import { MemberRatings } from '@/features/shell/member-ratings';
import { useOnlineOnly } from '@/features/shell/offline';

import { visitsLabel } from './labels';
import { RouteSheet } from './route-sheet';

export interface RestaurantDetailProps {
  restaurantId: Id;
  /** Shows a back arrow (own page). */
  onBack?: () => void;
  /** The origin on the back link (spec 0019, REQ-006). */
  backLabel?: string;
  /** Shows a close button (split view on wide screens). */
  onClose?: () => void;
}

/** One restaurant: rating and favourite per person, the shared note, visits and "Route" (AC-010, AC-013). */
export function RestaurantDetail(props: RestaurantDetailProps) {
  const restaurant = useRestaurant(props.restaurantId);
  const router = useRouter();
  if (!restaurant) {
    return (
      <DetailPage
        onBack={props.onBack}
        backLabel={props.backLabel}
        title="Restaurant"
        tone="essen"
        testID="restaurant-screen"
      >
        <EmptyState
          icon="utensils"
          title="Restaurant nicht gefunden"
          text="Vielleicht gehört es zu einem anderen Haushalt."
          testID="restaurant-not-found"
        >
          <Button
            label="Zu den Restaurants"
            icon="arrow-left"
            onPress={() =>
              router.replace({ pathname: '/rezepte', params: { view: 'restaurants' } })
            }
            testID="restaurant-not-found-back"
          />
        </EmptyState>
      </DetailPage>
    );
  }
  // Another restaurant starts with a fresh note draft.
  return (
    <RestaurantDetailBody
      key={restaurant.id}
      restaurant={restaurant}
      onBack={props.onBack}
      backLabel={props.backLabel}
      onClose={props.onClose}
    />
  );
}

function RestaurantDetailBody(props: {
  restaurant: Restaurant;
  onBack?: () => void;
  /** The origin on the back link (spec 0019, REQ-006). */
  backLabel?: string;
  onClose?: () => void;
}) {
  const { restaurant } = props;
  const router = useRouter();
  const online = useOnlineOnly();
  const me = useCurrentMember();
  const members = useMembers();
  const entries = usePlanEntries();
  const today = useToday();
  const [routeOpen, setRouteOpen] = useState(false);
  const [notes, setNotes] = useState(restaurant.notes ?? '');

  const visits = restaurantVisits(restaurant.id, entries, today);
  const isFavorite = restaurant.favoriteOf.includes(me.id);
  const notesChanged = notes.trim() !== (restaurant.notes ?? '');
  const meta = [restaurant.cuisine, priceLabel(restaurant.priceLevel)].filter(Boolean).join(' · ');

  const saveNotes = () => {
    if (!notesChanged || online.disabled) return;
    updateRestaurant(restaurant.id, { notes: notes.trim() || undefined });
    toast.show({ message: 'Notiz gespeichert' });
  };

  const favorite = (
    <FavoriteButton
      testID="restaurant-favorite"
      active={isFavorite}
      disabled={online.disabled}
      hint={online.hint}
      onPress={() => toggleRestaurantFavorite(restaurant.id)}
    />
  );

  return (
    <DetailPage
      onBack={props.onBack}
      backLabel={props.backLabel}
      title={restaurant.name}
      titleTestID="restaurant-title"
      right={favorite}
      tone="essen"
      testID="restaurant-screen"
    >
      <View testID="restaurant-detail">
        {props.onBack ? null : (
          <Row justify="space-between" style={{ marginBottom: 8 }}>
            {props.onClose ? (
              <IconButton
                icon="x"
                label="Restaurant schließen"
                onPress={props.onClose}
                testID="restaurant-close"
              />
            ) : (
              <View />
            )}
            {favorite}
          </Row>
        )}

        <Stack gap={10} style={{ marginBottom: 24 }}>
          {props.onBack ? null : (
            <Text variant="title" heading testID="restaurant-title">
              {restaurant.name}
            </Text>
          )}
          {meta ? (
            <Text color="muted" testID="restaurant-meta">
              {meta}
            </Text>
          ) : null}
          {restaurant.address ? (
            <Row gap={6} align="flex-start">
              <Icon name="map-pin" size={16} color="muted" />
              <Text
                variant="small"
                color="muted"
                selectable
                style={{ flexShrink: 1 }}
                testID="restaurant-address-text"
              >
                {restaurant.address}
              </Text>
            </Row>
          ) : null}
          <Row gap={6}>
            <Icon name="history" size={16} color="muted" />
            <Text variant="small" color="muted" testID="restaurant-visits">
              {visitsLabel(visits)}
            </Text>
          </Row>
          {restaurant.tags.length > 0 ? (
            <Row gap={6} wrap>
              {restaurant.tags.map((tag) => (
                <Badge key={tag} label={tag} />
              ))}
            </Row>
          ) : null}
          {/* "Du" with the own half stars, the others only to look at (spec 0008, E15, AC-041). */}
          <MemberRatings
            ratings={restaurant.ratings}
            members={members}
            me={me.id}
            onRate={(stars) => rateRestaurant(restaurant.id, stars)}
            disabled={online.disabled}
            hint={online.hint}
            testID="restaurant-stars"
          />
          <Row gap={10} wrap style={{ marginTop: 4 }}>
            <Button
              label="Route"
              icon="map-pin"
              onPress={() => setRouteOpen(true)}
              testID="restaurant-route"
            />
            <Button
              label="Einplanen"
              icon="calendar-plus"
              variant="secondary"
              onPress={() => router.push('/kalender')}
              testID="restaurant-plan"
            />
          </Row>
        </Stack>

        <Section title="Notiz" testID="restaurant-notes-section">
          <Stack gap={10}>
            <TextField
              accessibilityLabel="Notiz zum Restaurant"
              value={notes}
              onChangeText={setNotes}
              onBlur={saveNotes}
              placeholder="z. B. Trüffelpasta! Am Wochenende reservieren."
              multiline
              editable={!online.disabled}
              hint={online.hint ?? 'Gilt für den ganzen Haushalt.'}
              testID="restaurant-notes-edit"
            />
            {notesChanged ? (
              <Button
                label="Speichern"
                icon="check"
                size="sm"
                disabled={online.disabled}
                onPress={saveNotes}
                testID="restaurant-notes-save"
              />
            ) : null}
          </Stack>
        </Section>

        <RouteSheet
          restaurant={restaurant}
          visible={routeOpen}
          onClose={() => setRouteOpen(false)}
        />
      </View>
    </DetailPage>
  );
}
