import { useCurrentMember } from '@housekeeping/api';
import { AGENT_BADGES, type AgentBadgeSlug } from '@housekeeping/core';
import { Icon, List, ListRow, Section, Stack, Text, type IconName } from '@housekeeping/ui';

// Spec 0067, REQ-003: the empty chat greets by name and lists what the agent can do, one line
// each; a tap sets the badge in the input (AC-005). No ready-made example sentences.

const BADGE_ICON: Record<AgentBadgeSlug, IconName> = {
  rezepte: 'utensils',
  ausgehen: 'map-pin',
  planen: 'calendar-days',
  einkaufen: 'shopping-basket',
  haushalt: 'list-checks',
};

export function AgentStart(props: { onPick: (slug: AgentBadgeSlug) => void; disabled: boolean }) {
  const member = useCurrentMember();
  const firstName = member?.name.trim().split(/\s+/)[0];
  return (
    <Stack gap={18}>
      <Stack gap={6}>
        <Text variant="heading" testID="agent-greeting">
          {firstName
            ? `Hi ${firstName}, ich bin euer Housekeeping-Agent.`
            : 'Hi, ich bin euer Housekeeping-Agent.'}
        </Text>
        <Text color="muted">
          Ich kenne eure Rezepte, euren Kalender und eure Liste – und kann im Web suchen.
        </Text>
      </Stack>
      <Section title="Ich kann" testID="agent-abilities">
        <List>
          {AGENT_BADGES.map((badge) => (
            <ListRow
              key={badge.slug}
              title={badge.label}
              subtitle={badge.line}
              leading={<Icon name={BADGE_ICON[badge.slug]} color="muted" />}
              trailing={<Icon name="plus" size={20} color="muted" />}
              onPress={() => props.onPick(badge.slug)}
              disabled={props.disabled}
              hint={`Setzt „${badge.label}“ ins Eingabefeld`}
              testID={`agent-ability-${badge.slug}`}
            />
          ))}
        </List>
      </Section>
    </Stack>
  );
}
