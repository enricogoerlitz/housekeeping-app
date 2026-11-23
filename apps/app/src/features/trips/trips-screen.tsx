import {
  removeTrip,
  snapshot,
  useTrips,
  useMembers,
  useMembersById,
  usePackingItems,
  usePackingListBags,
  useToday,
} from '@housekeeping/api';
import {
  packingProgress,
  parseTripPeriod,
  stripeText,
  tripDateTile,
  tripDeleteDialog,
  tripListSections,
  tripPeriodLabel,
  tripPeriodOptions,
  tripRowDetail,
  tripStripes,
  type TripStripe,
} from '@housekeeping/core';
import {
  Badge,
  Button,
  EmptyState,
  GroupLabel,
  Icon,
  IconButton,
  List,
  ListRow,
  Menu,
  Screen,
  ScreenHeader,
  Row,
  Section,
  Text,
  toast,
  useTheme,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { stripeWho } from '@/features/calendar/calendar-data';
import { stripeSurface, useStripeColors } from '@/features/calendar/calendar-parts';
import { FAILED } from '@/features/packing/packing-labels';
import { TripConfirmDialog } from '@/features/packing/trip-dialogs';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import { TripSheet } from './trip-sheet';
import { TripWindowHost, useTripWindow } from './trip-window';

/** "Alle Zeiträume" in the menu; the address then has no `zeitraum`. */
const ALL_PERIODS = 'alle';

/**
 * "Reisen" (spec 0010, AC-037; spec 0030, REQ-003), from the calendar's ⋯ and from "Verwalten":
 * "Kommend" earliest first, then "Vergangen" newest first, each under the months the trips start
 * in; the menu "Zeitraum" filters by year or month (`zeitraum` in the address). One row per trip
 * with a date tile in the stripe's colour, hatched for a draft. A tap opens the trip window over
 * the page (spec 0022, REQ-006). Deleting a trip with a packing list asks first and names it;
 * without one there is 5 s "Rückgängig" (AC-038).
 */
export function TripsScreen() {
  const trips = useTrips();
  const members = useMembers();
  const membersById = useMembersById();
  const today = useToday();
  const listBags = usePackingListBags();
  const items = usePackingItems();
  const online = useOnlineOnly();
  const tripWindow = useTripWindow('reisen');
  const address = usePageParams('reisen');
  // "‹ Verwalten", or the page it was opened from with `von` (spec 0031, REQ-036).
  const back = useOriginBack(address.params.von, 'verwalten');
  const creating = address.params.fenster === 'neu-reise';
  const [deleting, setDeleting] = useState<{ stripe: TripStripe; message: string }>();

  const stripes = tripStripes(trips, members);
  const period = parseTripPeriod(address.params.zeitraum);
  const sections = tripListSections(stripes, today, period);
  const periodOptions = tripPeriodOptions(stripes);
  const choosePeriod = (value: string) =>
    address.replace({ zeitraum: value === ALL_PERIODS ? undefined : value });

  const remove = (stripe: TripStripe, confirmed = false) => {
    if (online.disabled) return;
    const message = tripDeleteDialog(stripe.tripId, listBags, items);
    if (message && !confirmed) {
      setDeleting({ stripe, message });
      return;
    }
    setDeleting(undefined);
    const restore = message ? undefined : snapshot();
    try {
      removeTrip(stripe.tripId);
    } catch {
      toast.show({ message: FAILED });
      return;
    }
    toast.show(
      restore
        ? {
            message: 'Reise gelöscht',
            actionLabel: 'Rückgängig',
            onAction: undoAction(restore),
            duration: 5000,
          }
        : { message: 'Reise und Packliste gelöscht' },
    );
  };

  const row = (stripe: TripStripe) => {
    const who = stripeWho(stripe, membersById);
    const own = new Set(
      listBags.filter((bag) => bag.tripId === stripe.tripId).map((bag) => bag.id),
    );
    const progress =
      own.size > 0 ? packingProgress(items.filter((item) => own.has(item.listBagId))) : undefined;
    return (
      <ListRow
        key={stripe.key}
        testID={`trip-${stripe.tripId}`}
        title={
          <Row gap={8} align="center" wrap>
            <Text variant="rowTitle">{stripeText(stripe)}</Text>
            {stripe.draft ? (
              <Badge label="Entwurf" icon="pencil" testID={`trip-${stripe.tripId}-draft`} />
            ) : null}
          </Row>
        }
        accessibilityLabel={[
          stripeText(stripe),
          stripe.draft ? 'Entwurf' : undefined,
          tripRowDetail(stripe, who),
        ]
          .filter(Boolean)
          .join(', ')}
        subtitle={tripRowDetail(stripe, who)}
        leading={<DateTile stripe={stripe} />}
        trailing={
          progress ? (
            <View testID={`trip-${stripe.tripId}-packing`}>
              <Row gap={6} align="center">
                <Icon name="luggage" size={16} color="muted" />
                <Text variant="small" color="muted">
                  {progress.total > 0 && progress.packed === progress.total
                    ? 'alles gepackt ✓'
                    : `${progress.packed}/${progress.total} gepackt`}
                </Text>
              </Row>
            </View>
          ) : undefined
        }
        // Spec 0022, REQ-006: the trip window opens over "Reisen"; reading works offline.
        onPress={() => tripWindow.open(stripe.tripId)}
        // Outside the row's press area, so the two buttons do not nest.
        controls={
          <IconButton
            icon="trash"
            label={`Reise von ${who} löschen`}
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => remove(stripe)}
            testID={`trip-${stripe.tripId}-remove`}
          />
        }
      />
    );
  };

  return (
    <Screen
      testID="trips-screen"
      clearFab={false}
      header={
        <ScreenHeader
          title="Reisen"
          backLabel={back.label}
          onBack={back.back}
          right={
            <IconButton
              icon="plus"
              label="Reise eintragen"
              variant="soft"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => address.open({ fenster: 'neu-reise' })}
              testID="trips-new"
            />
          }
        />
      }
    >
      {online.hint ? (
        <Text variant="small" color="warn" style={{ marginBottom: 12 }}>
          {online.hint}
        </Text>
      ) : null}
      {stripes.length === 0 ? (
        <EmptyState
          icon="calendar-off"
          title="Noch keine Reisen"
          text="Tragt Urlaub oder Dienstreisen ein, auch im Kalender durch Ziehen über die Tage."
          testID="trips-empty"
        >
          <Button
            label="Reise eintragen"
            icon="plus"
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => address.open({ fenster: 'neu-reise' })}
            testID="trips-empty-new"
          />
        </EmptyState>
      ) : (
        <>
          <View style={{ alignItems: 'flex-start', marginBottom: 16 }}>
            <Menu<string>
              label={tripPeriodLabel(period)}
              accessibilityLabel={`Zeitraum: ${tripPeriodLabel(period)}`}
              icon="calendar-days"
              options={periodOptions.map((option) => ({
                value: option.value ?? ALL_PERIODS,
                label: option.label,
              }))}
              value={period ?? ALL_PERIODS}
              onChange={choosePeriod}
              testID="trips-period"
            />
          </View>
          {sections.length === 0 ? (
            <EmptyState
              icon="calendar-off"
              title="Keine Reisen in diesem Zeitraum."
              testID="trips-period-empty"
            >
              <Button
                label="Alle Zeiträume"
                variant="ghost"
                onPress={() => choosePeriod(ALL_PERIODS)}
                testID="trips-period-all"
              />
            </EmptyState>
          ) : null}
          {period === undefined && !sections.some((section) => section.key === 'upcoming') ? (
            <Section title="Kommend" testID="trips-upcoming">
              <Text color="muted">Nichts geplant.</Text>
            </Section>
          ) : null}
          {sections.map((section) => (
            <Section
              key={section.key}
              title={section.title}
              testID={section.key === 'upcoming' ? 'trips-upcoming' : 'trips-past'}
            >
              {section.months.map((month) => (
                <View key={month.key} testID={`trips-month-${month.key}`}>
                  <GroupLabel>{month.title}</GroupLabel>
                  <List testID={section.key === 'upcoming' ? `trips-list-${month.key}` : undefined}>
                    {month.stripes.map(row)}
                  </List>
                </View>
              ))}
            </Section>
          ))}
        </>
      )}
      {creating ? <TripSheet onClose={() => address.close({ fenster: undefined })} /> : null}
      <TripWindowHost page="reisen" />
      {deleting ? (
        <TripConfirmDialog
          title="Reise löschen?"
          message={deleting.message}
          confirmLabel="Löschen"
          needsNetwork
          onConfirm={() => remove(deleting.stripe, true)}
          onCancel={() => setDeleting(undefined)}
          testID="trips-delete-dialog"
        />
      ) : null}
    </Screen>
  );
}

/**
 * The date tile of a row (spec 0030, AC-011): weekday and day of the start ("SA" over "12") on the
 * stripe's soft colour with its edge on the left, hatched for a draft (AC-018).
 */
function DateTile(props: { stripe: TripStripe }) {
  const theme = useTheme();
  const membersById = useMembersById();
  const colors = useStripeColors(props.stripe, membersById);
  const tile = tripDateTile(props.stripe.from);
  return (
    <View
      testID={`trip-${props.stripe.tripId}-tile`}
      style={{
        width: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.shape.radius.control,
        borderLeftWidth: 3,
        borderLeftColor: colors.edge,
        ...stripeSurface(colors, props.stripe.draft),
      }}
    >
      <Text variant="caption" color="muted">
        {tile.weekday}
      </Text>
      <Text variant="bodyStrong">{tile.day}</Text>
    </View>
  );
}
