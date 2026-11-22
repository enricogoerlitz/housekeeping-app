import {
  useMembers,
  useTrips,
  useMembersById,
  usePackingItems,
  usePackingListBags,
  useToday,
} from '@housekeeping/api';
import { packingCards, tripStripes, type ISODate, type PackingCard } from '@housekeeping/core';
import { AvatarStack, Icon, ProgressBar, Row, Section, Text, useTheme } from '@housekeeping/ui';
import { Pressable, View } from 'react-native';

import { useTripWindow } from '@/features/trips/trip-window';

/**
 * The cards "Reisetasche" at the bottom of the Übersicht (spec 0012, REQ-009, D33): one per
 * packing list whose trip has a day in the shown week or starts 1 to 7 days after the shown
 * day, earliest first (AC-042, AC-043, AC-045). Bar, "12/30 gepackt ›" or "alles gepackt ✓"
 * (AC-044), and "beginnt in 12 Tagen" counted from today (spec 0018, AC-020). A tap opens the
 * trip. Read from the cache only, so it shows offline too.
 */
export function TodayPacking(props: { shown: ISODate }) {
  const trips = useTrips();
  const members = useMembers();
  const listBags = usePackingListBags();
  const items = usePackingItems();
  const today = useToday();
  const cards = packingCards({
    shownDay: props.shown,
    today,
    trips: tripStripes(trips, members),
    listBags,
    items,
  });
  if (cards.length === 0) return null;
  return (
    <>
      {cards.map((card) => (
        <TodayPackingCard key={card.tripId} card={card} />
      ))}
    </>
  );
}

function TodayPackingCard(props: { card: PackingCard }) {
  const { card } = props;
  const tripWindow = useTripWindow('uebersicht');
  const theme = useTheme();
  const membersById = useMembersById();
  const owners = card.memberIds.flatMap((id) => membersById[id] ?? []);
  const testID = `today-packing-${card.tripId}`;
  const title = `Reisetasche · ${card.title}`;

  return (
    <Section
      title={title}
      testID={testID}
      action={
        owners.length > 0 ? (
          <View testID={`${testID}-owners`}>
            <AvatarStack members={owners} size="xs" />
          </View>
        ) : undefined
      }
    >
      <Pressable
        testID={`${testID}-open`}
        accessibilityRole="button"
        accessibilityLabel={[
          `Packliste ${card.title} öffnen`,
          owners.map((owner) => owner.name).join(', '),
          card.progressLabel.replace(' ✓', ''),
          card.startsIn,
        ]
          .filter(Boolean)
          .join(', ')}
        // Spec 0022, REQ-002: the trip window opens over the "Übersicht" (AC-006).
        onPress={() => tripWindow.open(card.tripId)}
        style={(state) => ({
          opacity: state.pressed ? 0.7 : 1,
          borderRadius: theme.shape.radius.card,
          gap: 4,
        })}
      >
        <Row gap={10} style={{ minHeight: 36 }}>
          <Icon name="luggage" size={17} color="muted" />
          <ProgressBar
            value={card.total === 0 ? 0 : card.packed / card.total}
            label={card.progressLabel}
            testID={`${testID}-bar`}
          />
          <Text variant="smallStrong" testID={`${testID}-progress`}>
            {card.progressLabel}
          </Text>
          <Icon name="chevron-right" size={17} color="muted" />
        </Row>
        <Text variant="small" color="muted" testID={`${testID}-starts`}>
          {card.startsIn}
        </Text>
      </Pressable>
    </Section>
  );
}
