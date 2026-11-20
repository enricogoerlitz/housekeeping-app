import {
  preparePhoto,
  rateActivity,
  removeActivityPhoto,
  setActivityPhoto,
  toggleActivityFavorite,
  useActivity,
  useCurrentMember,
  useHousehold,
  useMembers,
  usePhoto,
  usePlanEntries,
  useToday,
} from '@housekeeping/api';
import {
  daysBetween,
  formatLongDate,
  visitsOf,
  weekDates,
  type Activity,
  type Id,
} from '@housekeeping/core';
import {
  Avatar,
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
  toast,
  useTheme,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AddEntrySheet } from '@/features/meal-plan/add-entry-sheet';
import { RouteSheet } from '@/features/restaurants/route-sheet';
import { DetailPage } from '@/features/shell/detail-page';
import { useOnlineOnly } from '@/features/shell/offline';
import { CAN_PICK_PHOTO, pickPhotoFile } from '@/lib/pick-photo';

import { ActivityFormSheet } from './activity-form';
import { ActivityPhoto } from './activity-photo';
import { activityVisitsLabel, daysAgoLabel, hasPlace } from './labels';

export interface ActivityDetailProps {
  activityId: Id;
  /** Shows a back arrow (own page). */
  onBack?: () => void;
  /** Shows a close button (split view on wide screens). */
  onClose?: () => void;
  /** Opens another activity (after saving or for a duplicate). */
  onOpen: (activityId: Id) => void;
}

/**
 * One activity: photo, place and "Route", rating and favourite per person, when it was done and
 * "Einplanen" (AC-009–011, AC-015, AC-016, AC-020).
 */
export function ActivityDetail(props: ActivityDetailProps) {
  const activity = useActivity(props.activityId);
  const router = useRouter();
  if (!activity) {
    return (
      <DetailPage onBack={props.onBack} title="Aktivität" tone="plan" testID="activity-screen">
        <EmptyState
          icon="mountain"
          title="Aktivität nicht gefunden"
          text="Vielleicht gehört sie zu einem anderen Haushalt."
          testID="activity-not-found"
        >
          <Button
            label="Zu den Aktivitäten"
            icon="arrow-left"
            onPress={() => router.replace({ pathname: '/plan', params: { view: 'activities' } })}
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
  const me = useCurrentMember();
  const members = useMembers();
  const household = useHousehold();
  const entries = usePlanEntries();
  const today = useToday();
  const [routeOpen, setRouteOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [planning, setPlanning] = useState(false);

  const visits = visitsOf('activity', activity.id, entries, today);
  const isFavorite = activity.favoriteOf.includes(me.id);
  const mine = activity.ratings[me.id] ?? 0;
  const firstSlotId = [...household.mealSlots].sort((a, b) => a.sort - b.sort)[0]?.id;
  const place = [activity.placeName, activity.address].filter(Boolean).join(', ');

  const favorite = (
    <FavoriteButton
      active={isFavorite}
      disabled={online.disabled}
      hint={online.hint}
      onPress={() => toggleActivityFavorite(activity.id)}
    />
  );

  return (
    <DetailPage
      onBack={props.onBack}
      title={activity.name}
      titleTestID="activity-title"
      right={favorite}
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
            {favorite}
          </Row>
        )}

        <PhotoBlock activity={activity} />

        <Stack gap={10} style={{ marginTop: 16, marginBottom: 24 }}>
          {props.onBack ? null : (
            <Text variant="title" heading testID="activity-title">
              {activity.name}
            </Text>
          )}
          {activity.description ? (
            <Text testID="activity-description">{activity.description}</Text>
          ) : null}
          {place ? (
            <Row gap={6} align="flex-start">
              <Icon name="map-pin" size={16} color="muted" />
              <Text variant="small" color="muted" style={{ flexShrink: 1 }} testID="activity-place">
                {place}
              </Text>
            </Row>
          ) : null}
          <Row gap={6}>
            <Icon name="history" size={16} color="muted" />
            <Text variant="small" color="muted" testID="activity-visits">
              {activityVisitsLabel(visits) ?? 'Noch nicht gemacht'}
            </Text>
          </Row>
          <Row gap={10}>
            <Stars
              value={mine}
              onChange={online.disabled ? undefined : (stars) => rateActivity(activity.id, stars)}
              testID="activity-stars"
            />
            <Text variant="caption" color="muted">
              {mine ? 'Deine Bewertung' : 'Noch nicht bewertet'}
            </Text>
          </Row>
          {online.hint ? (
            <Text variant="small" color="warn" testID="activity-offline-hint">
              {online.hint}
            </Text>
          ) : null}
          <Row gap={10} wrap style={{ marginTop: 4 }}>
            {/* AC-015: without a place there is nowhere to route to. */}
            {hasPlace(activity) ? (
              <Button
                label="Route"
                icon="map-pin"
                onPress={() => setRouteOpen(true)}
                testID="activity-route"
              />
            ) : null}
            <Button
              label="Einplanen"
              icon="calendar-plus"
              variant="secondary"
              disabled={online.disabled || !firstSlotId}
              hint={online.hint}
              onPress={() => setPlanning(true)}
              testID="activity-plan"
            />
            <Button
              label="Bearbeiten"
              icon="pencil"
              variant="secondary"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => setEditing(true)}
              testID="activity-edit"
            />
          </Row>
        </Stack>

        <Section title="Bewertungen" testID="activity-ratings">
          <List>
            {members.map((member) => {
              const rating = activity.ratings[member.id] ?? 0;
              return (
                <ListRow
                  key={member.id}
                  testID={`activity-rating-${member.id}`}
                  leading={<Avatar name={member.name} color={member.color} />}
                  title={member.id === me.id ? `${member.name} (du)` : member.name}
                  subtitle={activity.favoriteOf.includes(member.id) ? 'Favorit' : undefined}
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

        <Section title="Verlauf" testID="activity-history">
          {visits.dates.length === 0 ? (
            <Text color="muted">
              Noch nicht gemacht. Vergangene Tage aus dem Plan stehen dann hier.
            </Text>
          ) : (
            <List>
              {visits.dates.map((date, index) => (
                <ListRow
                  key={`${date}-${index}`}
                  testID={`activity-history-${index}`}
                  leading={<Icon name="calendar-days" size={20} color="muted" />}
                  title={formatLongDate(date)}
                  subtitle={daysAgoLabel(daysBetween(date, today))}
                />
              ))}
            </List>
          )}
        </Section>

        <RouteSheet restaurant={activity} visible={routeOpen} onClose={() => setRouteOpen(false)} />
        {editing ? (
          <ActivityFormSheet
            activity={activity}
            onClose={() => setEditing(false)}
            onOpenExisting={props.onOpen}
          />
        ) : null}
        {planning && firstSlotId ? (
          <AddEntrySheet
            target={{ date: today, slotId: firstSlotId }}
            weekDates={weekDates(today)}
            activityId={activity.id}
            onClose={() => setPlanning(false)}
          />
        ) : null}
      </View>
    </DetailPage>
  );
}

/** The photo with "Foto ändern" and "Foto entfernen"; both need the network (AC-009–011). */
function PhotoBlock(props: { activity: Activity }) {
  const { activity } = props;
  const online = useOnlineOnly();
  const photo = usePhoto(activity.photoPath);
  const [busy, setBusy] = useState<'upload' | 'remove' | undefined>();
  const [error, setError] = useState<string | undefined>();
  const hasPhoto = !!activity.photoPath;

  const fail = (caught: unknown) =>
    setError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.');

  const change = () =>
    pickPhotoFile((file) => {
      setError(undefined);
      setBusy('upload');
      preparePhoto(file)
        .then((prepared) => setActivityPhoto(activity.id, prepared))
        .then(() => toast.show({ message: 'Foto gespeichert' }))
        .catch(fail)
        .finally(() => setBusy(undefined));
    });

  const remove = () => {
    setError(undefined);
    setBusy('remove');
    removeActivityPhoto(activity.id)
      .then(() => toast.show({ message: 'Foto entfernt' }))
      .catch(fail)
      .finally(() => setBusy(undefined));
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={{ maxWidth: 560 }}>
        <ActivityPhoto activity={activity} aspectRatio={16 / 9} testID="activity-image" />
      </View>
      {photo.loading ? (
        <Text variant="caption" color="muted">
          Foto wird geladen …
        </Text>
      ) : null}
      {CAN_PICK_PHOTO ? (
        <Row gap={12} wrap>
          <Button
            label={hasPhoto ? 'Foto ändern' : 'Foto hinzufügen'}
            icon="camera"
            variant="link"
            size="sm"
            disabled={online.disabled || busy !== undefined}
            hint={online.hint}
            onPress={change}
            testID="activity-photo-change"
          />
          {hasPhoto ? (
            <Button
              label="Foto entfernen"
              icon="trash"
              variant="link"
              size="sm"
              disabled={online.disabled || busy !== undefined}
              hint={online.hint}
              onPress={remove}
              testID="activity-photo-remove"
            />
          ) : null}
        </Row>
      ) : null}
      {busy ? (
        <Text variant="small" color="muted" testID="activity-photo-busy">
          {busy === 'upload' ? 'Foto wird hochgeladen …' : 'Foto wird entfernt …'}
        </Text>
      ) : null}
      {error ? (
        <Text variant="small" color="warn" testID="activity-photo-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function FavoriteButton(props: {
  active: boolean;
  disabled: boolean;
  hint?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID="activity-favorite"
      accessibilityRole="button"
      accessibilityLabel="Favorit"
      accessibilityHint={props.hint}
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
