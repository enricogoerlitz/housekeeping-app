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
  tripDeleteDialog,
  tripStripes,
  dateRangeLabel,
  splitUpcomingPast,
  type TripStripe,
} from '@housekeeping/core';
import {
  EmptyState,
  Icon,
  IconButton,
  List,
  ListRow,
  Screen,
  ScreenHeader,
  Section,
  Text,
  toast,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { stripeWho } from '@/features/calendar/calendar-data';
import { useBackToManage } from '@/features/manage/navigation';
import { FAILED } from '@/features/packing/packing-labels';
import { TripConfirmDialog } from '@/features/packing/trip-dialogs';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { TripSheet, TripWho } from './trip-sheet';

/**
 * "Reisen" (spec 0010, AC-037), from the calendar's ⋯ and from "Verwalten": "Kommend"
 * earliest first, "Vergangen" newest first, one row per trip. A tap opens the
 * trip (spec 0012, AC-016). Deleting a trip with a packing list asks first and names
 * it; without one there is 5 s "Rückgängig" (AC-038).
 */
export function TripsScreen() {
  const back = useBackToManage();
  const trips = useTrips();
  const members = useMembers();
  const membersById = useMembersById();
  const today = useToday();
  const listBags = usePackingListBags();
  const items = usePackingItems();
  const online = useOnlineOnly();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<{ stripe: TripStripe; message: string }>();

  const { upcoming, past } = splitUpcomingPast(tripStripes(trips, members), today);

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

  // The trip belongs to the calendar, which stays underneath; "‹ Reisen" leads back
  // here (spec 0012, task 12).
  const open = (stripe: TripStripe) => {
    const id = stripe.tripId;
    if (id) {
      router.push(
        { pathname: '/kalender/reise/[id]', params: { id, von: 'reisen' } },
        { withAnchor: true },
      );
    }
  };

  const row = (stripe: TripStripe) => {
    const who = stripeWho(stripe, membersById);
    const year = stripe.to.slice(0, 4) === today.slice(0, 4) ? '' : ` ${stripe.to.slice(0, 4)}`;
    return (
      <ListRow
        key={stripe.key}
        testID={`trip-${stripe.tripId}`}
        title={who}
        subtitle={[`${dateRangeLabel(stripe.from, stripe.to)}${year}`, stripe.note]
          .filter(Boolean)
          .join(' · ')}
        leading={
          stripe.household ? <Icon name="house" color="muted" /> : <TripWho stripe={stripe} />
        }
        // Reading the trip works offline; editing happens there (✎).
        onPress={() => open(stripe)}
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
          onBack={back}
          right={
            <IconButton
              icon="plus"
              label="Reise eintragen"
              variant="soft"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => setCreating(true)}
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
      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState
          icon="calendar-off"
          title="Niemand ist weg"
          text="Tragt Dienstreisen oder Urlaub ein: Wer weg ist, fehlt bei „Wer isst mit?“."
          testID="trips-empty"
        />
      ) : (
        <>
          <Section title="Kommend" testID="trips-upcoming">
            {upcoming.length === 0 ? (
              <Text color="muted">Nichts geplant.</Text>
            ) : (
              <List testID="trips-list">{upcoming.map(row)}</List>
            )}
          </Section>
          {past.length > 0 ? (
            <Section title="Vergangen" testID="trips-past">
              <List>{past.map(row)}</List>
            </Section>
          ) : null}
        </>
      )}
      {creating ? <TripSheet onClose={() => setCreating(false)} /> : null}
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
