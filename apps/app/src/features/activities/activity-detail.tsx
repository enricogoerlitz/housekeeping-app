import {
  rateActivity,
  removeActivityPhoto,
  setActivityPhoto,
  toggleActivityFavorite,
  useActivity,
  useActivityKindsById,
  useCurrentMember,
  useHousehold,
  useMembers,
  usePlanEntries,
  useToday,
} from '@housekeeping/api';
import {
  activityImageContext,
  showsRoute,
  isWebUrl,
  visitsOf,
  type Activity,
  type Id,
} from '@housekeeping/core';
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  Menu,
  Row,
  Stack,
  Text,
  openKeyboardNow,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { PlanPlaceSheet } from '@/features/meal-plan/plan-place-sheet';
import { RouteSheet } from '@/features/restaurants/route-sheet';
import { DetailPage } from '@/features/shell/detail-page';
import { FavoriteButton } from '@/features/shell/favorite-button';
import { MemberRatings } from '@/features/shell/member-ratings';
import { useOnlineOnly } from '@/features/shell/offline';
import { DetailPhotoBlock } from '@/features/shell/own-photo';
import { useDeletePlace } from '@/features/shell/use-delete-place';
import { VisitList, VisitsLine, useVisitsJump, type SectionRef } from '@/features/shell/visits';
import { openLink } from '@/lib/open-link';
import { shareTarget } from '@/lib/share';

import { ActivityFormSheet } from './activity-form';
import { useActivityIcon } from './activity-photo';
import { activityVisitsLabel } from './labels';

/** The windows of an activity's detail; they stand in the address (spec 0019, REQ-013). */
export type ActivityWindow = 'bearbeiten' | 'einplanen';

export interface ActivityDetailProps {
  activityId: Id;
  /** Shows a back arrow (own page). */
  onBack?: () => void;
  /** The origin on the back link (spec 0019, REQ-006). */
  backLabel?: string;
  /** Shows a close button (next to the list on wide screens, spec 0024, REQ-008). */
  onClose?: () => void;
  /** The open window and how to open or close one (address of the page showing the detail). */
  window?: ActivityWindow;
  onWindow: (window: ActivityWindow | undefined) => void;
  /** After "Löschen": the grid or the list (spec 0024, REQ-010). */
  onDeleted: () => void;
  /** Opens another activity (after saving or for a duplicate). */
  onOpen: (activityId: Id) => void;
}

/**
 * One activity: photo, place, "Route" and "Webseite", rating and favourite per person, when it was
 * done, "Einplanen", "Bearbeiten" and ⋯ "Löschen" (spec 0004, AC-009–011, AC-015, AC-016, AC-020;
 * spec 0024).
 */
export function ActivityDetail(props: ActivityDetailProps) {
  const activity = useActivity(props.activityId);
  const router = useRouter();
  if (!activity) {
    return (
      <DetailPage
        onBack={props.onBack}
        backLabel={props.backLabel}
        title="Aktivität"
        tone="plan"
        testID="activity-screen"
      >
        <EmptyState
          icon="mountain"
          title="Aktivität nicht gefunden"
          text="Vielleicht gehört sie zu einem anderen Haushalt."
          testID="activity-not-found"
        >
          <Button
            label="Zu den Aktivitäten"
            icon="arrow-left"
            // Next to the list back to the grid, keeping search and filter.
            onPress={props.onClose ?? (() => router.replace('/aktivitaeten'))}
            testID="activity-not-found-back"
          />
        </EmptyState>
      </DetailPage>
    );
  }
  return <ActivityDetailBody key={activity.id} activity={activity} {...props} />;
}

function ActivityDetailBody(props: ActivityDetailProps & { activity: Activity }) {
  const { activity } = props;
  const online = useOnlineOnly();
  const kindsById = useActivityKindsById();
  const icon = useActivityIcon(activity);
  const kind = activity.kindId === undefined ? undefined : kindsById[activity.kindId];
  const me = useCurrentMember();
  const members = useMembers();
  const household = useHousehold();
  const entries = usePlanEntries();
  const today = useToday();
  const [routeOpen, setRouteOpen] = useState(false);
  const historySection: SectionRef = useRef(null);
  const jumpToHistory = useVisitsJump(historySection);
  const remove = useDeletePlace('activity', activity, props.onDeleted);

  const visits = visitsOf('activity', activity.id, entries, today);
  const isFavorite = activity.favoriteOf.includes(me.id);
  const hasSlot = household.mealSlots.length > 0;
  const place = [activity.placeName, activity.address].filter(Boolean).join(', ');
  const website =
    activity.websiteUrl && isWebUrl(activity.websiteUrl) ? activity.websiteUrl : undefined;
  const visitsLabel = activityVisitsLabel(visits);

  const favorite = (
    <FavoriteButton
      testID="activity-favorite"
      active={isFavorite}
      disabled={online.disabled}
      hint={online.hint}
      onPress={() => toggleActivityFavorite(activity.id)}
    />
  );
  // "Teilen" (spec 0047, REQ-001): only the link to the page; works offline.
  const share = () => void shareTarget({ kind: 'activity', id: activity.id });
  const more = (
    <Menu<'share' | 'delete'>
      trigger="icon"
      icon="ellipsis"
      label="Mehr"
      accessibilityLabel={`Mehr zu ${activity.name}`}
      options={[
        { value: 'share', label: 'Teilen' },
        { value: 'delete', label: 'Löschen', disabled: online.disabled, hint: online.hint },
      ]}
      onChange={(action) => {
        if (action === 'delete') remove();
        else share();
      }}
      testID="activity-more"
    />
  );

  return (
    <DetailPage
      onBack={props.onBack}
      backLabel={props.backLabel}
      title={activity.name}
      titleTestID="activity-title"
      right={
        <Row gap={4}>
          {favorite}
          {more}
        </Row>
      }
      tone="plan"
      testID="activity-screen"
    >
      <View testID="activity-detail">
        {props.onBack ? null : (
          <Row justify="space-between" style={{ marginBottom: 8 }}>
            {props.onClose ? (
              <IconButton
                icon="x"
                label="Aktivität schließen"
                onPress={props.onClose}
                testID="activity-close"
              />
            ) : (
              <View />
            )}
            <Row gap={4}>
              {favorite}
              {more}
            </Row>
          </Row>
        )}

        <DetailPhotoBlock
          photoPath={activity.photoPath}
          name={activity.name}
          aiContext={activityImageContext(activity, kind?.name)}
          placeholderIcon={icon}
          onChange={(photo) => setActivityPhoto(activity.id, photo)}
          onRemove={() => removeActivityPhoto(activity.id)}
          onShare={share}
          testPrefix="activity"
        />

        <Stack gap={10} style={{ marginTop: 16, marginBottom: 24 }}>
          {props.onBack ? null : (
            <Text variant="title" heading testID="activity-title">
              {activity.name}
            </Text>
          )}
          {kind ? (
            <Row gap={6}>
              <Icon name={icon} size={16} color="muted" />
              <Text variant="small" color="muted" testID="activity-kind">
                {activity.remembered ? kind.name : `${kind.name} · nicht gemerkt`}
              </Text>
            </Row>
          ) : activity.remembered ? null : (
            <Text variant="small" color="muted" testID="activity-kind">
              Nicht gemerkt
            </Text>
          )}
          {activity.description ? (
            <Text selectable testID="activity-description">
              {activity.description}
            </Text>
          ) : null}
          {place ? (
            <Row gap={6} align="flex-start">
              <Icon name="map-pin" size={16} color="muted" />
              <Text variant="small" color="muted" style={{ flexShrink: 1 }} testID="activity-place">
                {place}
              </Text>
            </Row>
          ) : null}
          <VisitsLine
            label={visitsLabel ?? 'Noch nicht gemacht'}
            onPress={visitsLabel ? jumpToHistory : undefined}
            testID="activity-visits"
          />
          {/* "Du" with the own half stars, the others only to look at, as on a recipe and a
              restaurant (spec 0031, AC-086). */}
          <MemberRatings
            ratings={activity.ratings}
            members={members}
            me={me.id}
            onRate={(stars) => rateActivity(activity.id, stars)}
            disabled={online.disabled}
            hint={online.hint}
            testID="activity-stars"
          />
          {online.hint ? (
            <Text variant="small" color="warn" testID="activity-offline-hint">
              {online.hint}
            </Text>
          ) : null}
          <Row gap={10} wrap style={{ marginTop: 4 }}>
            {/* Only with a map link (spec 0036, AC-018; before AC-015: with a place). */}
            {showsRoute(activity) ? (
              <Button
                label="Route"
                icon="map-pin"
                onPress={() => setRouteOpen(true)}
                testID="activity-route"
              />
            ) : null}
            {website ? (
              <Button
                label="Webseite"
                icon="external-link"
                variant="secondary"
                onPress={() => openLink(website)}
                testID="activity-website-open"
              />
            ) : null}
            <Button
              label="Einplanen"
              icon="calendar-plus"
              variant="secondary"
              disabled={online.disabled || !hasSlot}
              hint={online.hint}
              onPress={() => props.onWindow('einplanen')}
              testID="activity-plan"
            />
            <Button
              label="Bearbeiten"
              icon="pencil"
              variant="secondary"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => {
                openKeyboardNow();
                props.onWindow('bearbeiten');
              }}
              testID="activity-edit"
            />
          </Row>
        </Stack>

        <VisitList
          ref={historySection}
          title="Verlauf"
          dates={visits.dates}
          empty="Noch nicht gemacht. Vergangene Tage aus dem Plan stehen dann hier."
          testID="activity-history"
        />

        <RouteSheet restaurant={activity} visible={routeOpen} onClose={() => setRouteOpen(false)} />
        {props.window === 'bearbeiten' ? (
          <ActivityFormSheet
            activity={activity}
            onClose={() => props.onWindow(undefined)}
            onOpenExisting={props.onOpen}
          />
        ) : null}
        {props.window === 'einplanen' && hasSlot ? (
          <PlanPlaceSheet
            kind="activity"
            place={activity}
            onClose={() => props.onWindow(undefined)}
          />
        ) : null}
      </View>
    </DetailPage>
  );
}
