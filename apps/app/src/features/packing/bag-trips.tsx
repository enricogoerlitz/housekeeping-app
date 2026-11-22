import {
  adoptBagChanges,
  snapshot,
  useMembers,
  usePackingBagItems,
  usePackingBags,
  usePackingItems,
  usePackingListBags,
  useToday,
  useTrips,
} from '@housekeeping/api';
import {
  adoptBagDialog,
  bagDeviationHint,
  bagDeviations,
  tripStripes,
  upcomingPackingLists,
  type BagDeviation,
  type Id,
} from '@housekeeping/core';
import {
  AvatarStack,
  Button,
  Icon,
  List,
  ListRow,
  Section,
  Stack,
  Text,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { undoAction, useOnlineOnly } from '@/features/shell/offline';
import { useTripWindow } from '@/features/trips/trip-window';

import { messageOf } from './packing-labels';
import { TripConfirmDialog } from './trip-dialogs';

/**
 * "Kommende Packlisten" on top of "Reisetaschen" (spec 0022, REQ-013, AC-039, AC-040): one row
 * per trip that ends today or later and has a packing list, earliest first; a tap opens the trip
 * window over the page. Missing without such a trip. Read from the cache, so offline too.
 */
export function UpcomingPackingLists() {
  const trips = useTrips();
  const members = useMembers();
  const listBags = usePackingListBags();
  const items = usePackingItems();
  const today = useToday();
  const tripWindow = useTripWindow('reisetaschen');
  const rows = upcomingPackingLists({
    trips: tripStripes(trips, members),
    listBags,
    items,
    today,
  });
  if (rows.length === 0) return null;
  return (
    <Section title="Kommende Packlisten" testID="bags-upcoming">
      <List>
        {rows.map((row) => (
          <ListRow
            key={row.tripId}
            title={row.title}
            subtitle={`${row.period} · ${row.progressLabel}`}
            leading={<Icon name="luggage" color="muted" />}
            trailing={
              row.household ? (
                <Icon name="house" color="muted" />
              ) : (
                <AvatarStack
                  members={members.filter((member) => row.memberIds.includes(member.id))}
                  size="s"
                />
              )
            }
            onPress={() => tripWindow.open(row.tripId)}
            testID={`bags-upcoming-${row.tripId}`}
          />
        ))}
      </List>
    </Section>
  );
}

/**
 * The hint on a Reisetasche (spec 0022, REQ-012, AC-036 to AC-038): "Gilt nur für neue
 * Packlisten. „Urlaub Mallorca“ (ab Fr 4.12.) weicht ab: 1 neu." with "In „Urlaub Mallorca“
 * übernehmen" per upcoming packing list that differs; a dialog lists what changes and what stays
 * because it is packed. Online only; 5 s "Rückgängig".
 */
export function BagDeviationHints(props: { bagId: Id }) {
  const bags = usePackingBags();
  const bagItems = usePackingBagItems();
  const trips = useTrips();
  const members = useMembers();
  const listBags = usePackingListBags();
  const items = usePackingItems();
  const today = useToday();
  const online = useOnlineOnly();
  const [asking, setAsking] = useState<BagDeviation>();
  const bag = bags.find((candidate) => candidate.id === props.bagId);
  if (!bag) return null;
  const deviations = bagDeviations({
    bag,
    bagItems,
    trips: tripStripes(trips, members),
    listBags,
    items,
    today,
  });
  if (deviations.length === 0) return null;

  const adopt = (deviation: BagDeviation) => {
    setAsking(undefined);
    if (online.disabled) return;
    const restore = snapshot();
    try {
      adoptBagChanges(bag.id, deviation.tripId);
    } catch (failure) {
      toast.show({ message: messageOf(failure) });
      return;
    }
    toast.show({
      message: `In „${deviation.title}“ übernommen`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
      duration: 5000,
    });
  };

  return (
    <View testID="bag-deviations" style={{ marginBottom: 12 }}>
      <Stack gap={10}>
        <Text variant="small" color="muted">
          Gilt nur für neue Packlisten.
        </Text>
        {deviations.map((deviation) => (
          <Stack key={deviation.listBagId} gap={6}>
            <Text variant="small" testID={`bag-deviation-${deviation.tripId}`}>
              {bagDeviationHint(deviation)}
            </Text>
            <View style={{ alignItems: 'flex-start' }}>
              <Button
                label={`In „${deviation.title}“ übernehmen`}
                variant="secondary"
                disabled={online.disabled}
                hint={online.hint}
                onPress={() => setAsking(deviation)}
                testID={`bag-deviation-${deviation.tripId}-adopt`}
              />
            </View>
          </Stack>
        ))}
      </Stack>
      {asking ? (
        <TripConfirmDialog
          title={`In „${asking.title}“ übernehmen?`}
          message={adoptBagDialog(asking)}
          confirmLabel="Übernehmen"
          needsNetwork
          onConfirm={() => adopt(asking)}
          onCancel={() => setAsking(undefined)}
          testID="bag-adopt-dialog"
        />
      ) : null}
    </View>
  );
}
