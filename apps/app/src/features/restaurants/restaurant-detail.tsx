import {
  rateRestaurant,
  removeRestaurantPhoto,
  setRestaurantPhoto,
  toggleRestaurantFavorite,
  useCurrentMember,
  useMembers,
  usePlanEntries,
  useRestaurant,
  useToday,
} from '@housekeeping/api';
import {
  showsRoute,
  isWebUrl,
  priceLabel,
  restaurantImageContext,
  visitsOf,
  type Id,
  type Restaurant,
} from '@housekeeping/core';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Menu,
  Row,
  Section,
  Stack,
  Text,
  useLargeTitle,
  openKeyboardNow,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { PlanPlaceSheet } from '@/features/meal-plan/plan-place-sheet';
import { DetailPage } from '@/features/shell/detail-page';
import { FavoriteButton } from '@/features/shell/favorite-button';
import { MemberRatings } from '@/features/shell/member-ratings';
import { useOnlineOnly } from '@/features/shell/offline';
import { DetailPhotoBlock } from '@/features/shell/own-photo';
import { useDeletePlace } from '@/features/shell/use-delete-place';
import { VisitList, VisitsLine, useVisitsJump, type SectionRef } from '@/features/shell/visits';
import { openLink } from '@/lib/open-link';
import { shareTarget } from '@/lib/share';

import { EditRestaurantSheet } from './add-restaurant-sheet';
import { visitsLabel } from './labels';
import { RESTAURANT_ICON, type RestaurantFormFocus } from './restaurant-form';
import { RouteSheet } from './route-sheet';

/** The windows of a restaurant's detail; they stand in the address (spec 0019, REQ-013). */
export type RestaurantWindow = 'bearbeiten' | 'einplanen';

export interface RestaurantDetailProps {
  restaurantId: Id;
  /** Shows a back arrow (own page). */
  onBack?: () => void;
  /** The origin on the back link (spec 0019, REQ-006). */
  backLabel?: string;
  /** Shows a close button (split view on wide screens). */
  onClose?: () => void;
  /** The open window and how to open or close one (address of the page showing the detail). */
  window?: RestaurantWindow;
  onWindow: (window: RestaurantWindow | undefined) => void;
  /** After "Löschen": the grid or the list (spec 0024, REQ-010). */
  onDeleted: () => void;
  /** Opens another restaurant (a duplicate link in "Restaurant bearbeiten"). */
  onOpen: (restaurantId: Id) => void;
}

/**
 * One restaurant: photo, rating and favourite per person, the shared note to read, its visits,
 * "Route", "Webseite", "Einplanen", "Bearbeiten" and ⋯ "Löschen" (spec 0002, AC-010, AC-013;
 * spec 0024).
 */
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
            // AC-029: next to the list back to the grid, keeping search and filter.
            onPress={
              props.onClose ??
              (() => router.replace({ pathname: '/rezepte', params: { ansicht: 'restaurants' } }))
            }
            testID="restaurant-not-found-back"
          />
        </EmptyState>
      </DetailPage>
    );
  }
  return <RestaurantDetailBody key={restaurant.id} restaurant={restaurant} {...props} />;
}

function RestaurantDetailBody(props: RestaurantDetailProps & { restaurant: Restaurant }) {
  const { restaurant } = props;
  const online = useOnlineOnly();
  const largeTitle = useLargeTitle();
  const me = useCurrentMember();
  const members = useMembers();
  const entries = usePlanEntries();
  const today = useToday();
  const [routeOpen, setRouteOpen] = useState(false);
  // Where "Restaurant bearbeiten" puts the cursor: "Notiz hinzufügen" opens it in "Notiz".
  const [focus, setFocus] = useState<RestaurantFormFocus | undefined>();
  const visitsSection: SectionRef = useRef(null);
  const jumpToVisits = useVisitsJump(visitsSection);
  const remove = useDeletePlace('restaurant', restaurant, props.onDeleted);

  const visits = visitsOf('restaurant', restaurant.id, entries, today);
  const isFavorite = restaurant.favoriteOf.includes(me.id);
  const meta = [restaurant.cuisine, priceLabel(restaurant.priceLevel)].filter(Boolean).join(' · ');
  const website =
    restaurant.websiteUrl && isWebUrl(restaurant.websiteUrl) ? restaurant.websiteUrl : undefined;
  // The pencil opens the form calm, without a cursor: the keyboard coming up while the window slid
  // in made it judder (Nachklick 27.11., Ruckeln). An action aimed at a field ("Notiz
  // hinzufügen") puts the cursor there, with the keyboard on the iPhone (spec 0033, REQ-006).
  const edit = (at?: RestaurantFormFocus) => {
    if (at) openKeyboardNow();
    setFocus(at);
    props.onWindow('bearbeiten');
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
  // "Teilen" (spec 0047, REQ-001): only the link to the page; works offline.
  const share = () => void shareTarget({ kind: 'restaurant', id: restaurant.id });
  // Spec 0037 and review 0003 (B-06): editing is the pencil at the top right, as on a recipe.
  const editButton = (
    <IconButton
      icon="pencil"
      size={44}
      label="Bearbeiten"
      disabled={online.disabled}
      hint={online.hint}
      onPress={() => edit()}
      testID="restaurant-edit"
    />
  );
  // "Teilen" stands at the photo, so ⋯ holds only "Löschen" (spec 0054, REQ-003).
  const more = (
    <Menu<'delete'>
      trigger="icon"
      icon="ellipsis"
      label="Mehr"
      accessibilityLabel={`Mehr zu ${restaurant.name}`}
      options={[
        { value: 'delete', label: 'Löschen', disabled: online.disabled, hint: online.hint },
      ]}
      onChange={() => remove()}
      testID="restaurant-more"
    />
  );

  return (
    <DetailPage
      onBack={props.onBack}
      backLabel={props.backLabel}
      title={restaurant.name}
      titleTestID="restaurant-title"
      right={
        <Row gap={4}>
          {favorite}
          {editButton}
          {more}
        </Row>
      }
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
            <Row gap={4}>
              {favorite}
              {editButton}
              {more}
            </Row>
          </Row>
        )}

        <DetailPhotoBlock
          photoPath={restaurant.photoPath}
          name={restaurant.name}
          aiContext={restaurantImageContext(restaurant)}
          placeholderIcon={RESTAURANT_ICON}
          onChange={(photo) => setRestaurantPhoto(restaurant.id, photo)}
          onRemove={() => removeRestaurantPhoto(restaurant.id)}
          onShare={share}
          testPrefix="restaurant"
        />

        <Stack gap={10} style={{ marginTop: 16, marginBottom: 24 }}>
          <Text ref={largeTitle} variant="title" heading wholeWords testID="restaurant-title">
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
                selectable
                style={{ flexShrink: 1 }}
                testID="restaurant-address-text"
              >
                {restaurant.address}
              </Text>
            </Row>
          ) : null}
          <VisitsLine
            label={visitsLabel(visits)}
            onPress={visits.count > 0 ? jumpToVisits : undefined}
            testID="restaurant-visits"
          />
          {restaurant.tags.length > 0 ? (
            <View testID="restaurant-tags-shown">
              <Row gap={6} wrap>
                {restaurant.tags.map((tag) => (
                  <Badge key={tag} label={tag} />
                ))}
              </Row>
            </View>
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
          {online.hint ? (
            <Text variant="small" color="warn" testID="restaurant-offline-hint">
              {online.hint}
            </Text>
          ) : null}
          <Row gap={10} wrap style={{ marginTop: 4 }}>
            {/* Only with a map link (spec 0036, AC-018). */}
            {showsRoute(restaurant) ? (
              <Button
                label="Route"
                icon="map-pin"
                onPress={() => setRouteOpen(true)}
                testID="restaurant-route"
              />
            ) : null}
            {website ? (
              <Button
                label="Webseite"
                icon="external-link"
                variant="secondary"
                onPress={() => openLink(website)}
                testID="restaurant-website-open"
              />
            ) : null}
            <Button
              label="Einplanen"
              icon="calendar-plus"
              variant="secondary"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => props.onWindow('einplanen')}
              testID="restaurant-plan"
            />
          </Row>
        </Stack>

        <Section
          title="Notiz"
          testID="restaurant-notes-section"
          // An existing note is edited with the pencil at the top; an empty one keeps its first
          // step (spec 0054, REQ-005).
          action={
            restaurant.notes ? undefined : (
              <Button
                label="Notiz hinzufügen"
                icon="pencil"
                variant="link"
                size="sm"
                disabled={online.disabled}
                hint={online.hint}
                onPress={() => edit('notes')}
                testID="restaurant-notes-edit"
              />
            )
          }
        >
          <Text
            selectable
            color={restaurant.notes ? 'text' : 'muted'}
            testID="restaurant-notes-text"
          >
            {restaurant.notes ?? 'Noch keine Notiz'}
          </Text>
        </Section>

        <VisitList
          ref={visitsSection}
          title="Besuche"
          dates={visits.dates}
          empty="Noch kein Besuch. Vergangene Tage aus dem Kalender stehen dann hier."
          testID="restaurant-history"
        />

        <RouteSheet
          restaurant={restaurant}
          visible={routeOpen}
          onClose={() => setRouteOpen(false)}
        />
        {props.window === 'bearbeiten' ? (
          <EditRestaurantSheet
            restaurant={restaurant}
            focus={focus}
            onClose={() => props.onWindow(undefined)}
            onOpenExisting={props.onOpen}
          />
        ) : null}
        {props.window === 'einplanen' ? (
          <PlanPlaceSheet
            kind="restaurant"
            place={restaurant}
            onClose={() => props.onWindow(undefined)}
          />
        ) : null}
      </View>
    </DetailPage>
  );
}
