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
  Avatar,
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  List,
  ListRow,
  Row,
  Section,
  Stack,
  Stars,
  Text,
  TextField,
  toast,
  useTheme,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';

import { visitsLabel } from './labels';
import { RouteSheet } from './route-sheet';

export interface RestaurantDetailProps {
  restaurantId: Id;
  /** Shows a back arrow (own page). */
  onBack?: () => void;
  /** Shows a close button (split view on wide screens). */
  onClose?: () => void;
}

/** One restaurant: rating and favourite per person, the shared note, visits and "Route" (AC-010, AC-013). */
export function RestaurantDetail(props: RestaurantDetailProps) {
  const restaurant = useRestaurant(props.restaurantId);
  const router = useRouter();
  if (!restaurant) {
    return (
      <EmptyState
        icon="utensils"
        title="Restaurant nicht gefunden"
        text="Vielleicht gehört es zu einem anderen Haushalt."
        testID="restaurant-not-found"
      >
        <Button
          label="Zu den Restaurants"
          icon="arrow-left"
          onPress={() => router.replace({ pathname: '/rezepte', params: { view: 'restaurants' } })}
          testID="restaurant-not-found-back"
        />
      </EmptyState>
    );
  }
  // Another restaurant starts with a fresh note draft.
  return (
    <RestaurantDetailBody
      key={restaurant.id}
      restaurant={restaurant}
      onBack={props.onBack}
      onClose={props.onClose}
    />
  );
}

function RestaurantDetailBody(props: {
  restaurant: Restaurant;
  onBack?: () => void;
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
  const mine = restaurant.ratings[me.id] ?? 0;
  const notesChanged = notes.trim() !== (restaurant.notes ?? '');
  const meta = [restaurant.cuisine, priceLabel(restaurant.priceLevel)].filter(Boolean).join(' · ');

  const saveNotes = () => {
    if (!notesChanged || online.disabled) return;
    updateRestaurant(restaurant.id, { notes: notes.trim() || undefined });
    toast.show({ message: 'Notiz gespeichert' });
  };

  return (
    <View testID="restaurant-detail">
      <Row justify="space-between" style={{ marginBottom: 8, marginLeft: props.onBack ? -8 : 0 }}>
        {props.onBack ? (
          <IconButton icon="arrow-left" label="Zurück" onPress={props.onBack} testID="back" />
        ) : props.onClose ? (
          <IconButton
            icon="x"
            label="Restaurant schließen"
            onPress={props.onClose}
            testID="restaurant-close"
          />
        ) : (
          <View />
        )}
        <FavoriteButton
          active={isFavorite}
          disabled={online.disabled}
          onPress={() => toggleRestaurantFavorite(restaurant.id)}
        />
      </Row>

      <Stack gap={10} style={{ marginBottom: 24 }}>
        <Text variant="title" heading testID="restaurant-title">
          {restaurant.name}
        </Text>
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
        <Row gap={10}>
          <Stars
            value={mine}
            onChange={online.disabled ? undefined : (stars) => rateRestaurant(restaurant.id, stars)}
            testID="restaurant-stars"
          />
          <Text variant="caption" color="muted">
            {mine ? 'Deine Bewertung' : 'Noch nicht bewertet'}
          </Text>
        </Row>
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
            onPress={() => router.push('/plan')}
            testID="restaurant-plan"
          />
        </Row>
      </Stack>

      <Section title="Bewertungen" testID="restaurant-ratings">
        <List>
          {members.map((member) => {
            const rating = restaurant.ratings[member.id] ?? 0;
            return (
              <ListRow
                key={member.id}
                testID={`restaurant-rating-${member.id}`}
                leading={<Avatar name={member.name} color={member.color} />}
                title={member.id === me.id ? `${member.name} (du)` : member.name}
                subtitle={restaurant.favoriteOf.includes(member.id) ? 'Favorit' : undefined}
                trailing={
                  rating ? (
                    <Stars value={rating} size={16} />
                  ) : (
                    <Text variant="small" color="muted">
                      noch keine
                    </Text>
                  )
                }
              />
            );
          })}
        </List>
      </Section>

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

      <RouteSheet restaurant={restaurant} visible={routeOpen} onClose={() => setRouteOpen(false)} />
    </View>
  );
}

function FavoriteButton(props: { active: boolean; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      testID="restaurant-favorite"
      accessibilityRole="button"
      accessibilityLabel="Favorit"
      accessibilityState={{ selected: props.active, disabled: props.disabled }}
      aria-pressed={props.active}
      disabled={props.disabled}
      onPress={props.onPress}
      style={(state) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceSunken,
        opacity: props.disabled ? 0.45 : state.pressed ? 0.6 : 1,
      })}
    >
      <Icon
        name="heart"
        size={22}
        color={props.active ? 'accent' : 'muted'}
        filled={props.active}
      />
    </Pressable>
  );
}
