import {
  useAbsences,
  useMembersById,
  usePackingItems,
  usePackingListBags,
  useToday,
} from '@housekeeping/api';
import { packingCards, type ISODate, type PackingCard } from '@housekeeping/core';
import { Avatar, Icon, ProgressBar, Row, Section, Text, useTheme } from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

/**
 * The cards "Reisetasche" at the bottom of the Übersicht (spec 0012, REQ-009, D33): one per
 * packing list whose absence has a day in the shown week or starts 1 to 7 days after the shown
 * day, earliest first (AC-042, AC-043, AC-045). Bar, "12/30 gepackt ›" or "alles gepackt ✓"
 * (AC-044), and "beginnt in 12 Tagen" counted from today (spec 0018, AC-020). A tap opens the
 * Urlaubsseite. Read from the cache only, so it shows offline too.
 */
export function TodayPacking(props: { shown: ISODate }) {
  const absences = useAbsences();
  const listBags = usePackingListBags();
  const items = usePackingItems();
  const today = useToday();
  const cards = packingCards({ shownDay: props.shown, today, absences, listBags, items });
  if (cards.length === 0) return null;
  return (
    <>
      {cards.map((card) => (
        <TodayPackingCard key={card.absenceId} card={card} />
      ))}
    </>
  );
}

function TodayPackingCard(props: { card: PackingCard }) {
  const { card } = props;
  const router = useRouter();
  const theme = useTheme();
  const membersById = useMembersById();
  const owner = card.memberId ? membersById[card.memberId] : undefined;
  const testID = `today-packing-${card.absenceId}`;
  const title = `Reisetasche · ${card.title}`;

  return (
    <Section
      title={title}
      testID={testID}
      action={
        owner ? (
          <Avatar
            name={owner.name}
            color={owner.color}
            size="xs"
            testID={`${testID}-owner-${owner.id}`}
          />
        ) : undefined
      }
    >
      <Pressable
        testID={`${testID}-open`}
        accessibilityRole="button"
        accessibilityLabel={[
          `Packliste ${card.title} öffnen`,
          owner?.name,
          card.progressLabel.replace(' ✓', ''),
          card.startsIn,
        ]
          .filter(Boolean)
          .join(', ')}
        onPress={() =>
          router.push(
            {
              pathname: '/kalender/reise/[id]',
              params: { id: card.absenceId, von: 'uebersicht' },
            },
            // The calendar stays underneath, as for an activity (spec 0005); "‹ Übersicht" leads
            // back here (spec 0012, task 12).
            { withAnchor: true },
          )
        }
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
