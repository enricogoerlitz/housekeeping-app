import { answerBlocks, badgeLabel, stepLine } from '@housekeeping/core';
import {
  Chip,
  ProgressSteps,
  ScrollRow,
  Text,
  useBreakpoint,
  useTheme,
  openExternalLink,
} from '@housekeeping/ui';
import { View } from 'react-native';

import type { ChatTurn } from './use-agent-chat';
import { PlaceCard, PlaceCardSkeleton } from './place-card';

// Spec 0066, REQ-005/REQ-006: the turns of a chat. The person's message is a bubble on the right;
// an answer shows its steps, its text, its cards as a carousel, its sources and follow-ups.

/** Spec 0067: what went with the message besides its text, e.g. "Rezepte · 1 Anhang". */
function sentWith(turn: ChatTurn): string | undefined {
  const parts = [
    ...(turn.badges ?? []).map(badgeLabel),
    ...(turn.attachments
      ? [turn.attachments === 1 ? '1 Anhang' : `${turn.attachments} Anhänge`]
      : []),
  ];
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function UserBubble(props: { turn: ChatTurn; testID: string }) {
  const theme = useTheme();
  const meta = sentWith(props.turn);
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '85%', alignItems: 'flex-end', gap: 4 }}>
      {meta ? (
        <Text variant="caption" color="muted" testID={`${props.testID}-meta`}>
          {meta}
        </Text>
      ) : null}
      {props.turn.text ? (
        <View
          testID={props.testID}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 18,
            borderBottomRightRadius: 4,
            backgroundColor: theme.colors.accent,
          }}
        >
          <Text color="onAccent">{props.turn.text}</Text>
        </View>
      ) : (
        <View testID={props.testID} />
      )}
    </View>
  );
}

function AnswerText(props: { text: string; streaming: boolean; testID: string }) {
  const blocks = answerBlocks(props.text);
  return (
    <View testID={props.testID} style={{ gap: 8 }}>
      {blocks.map((block, index) => (
        <View
          key={index}
          style={block.kind === 'bullet' ? { flexDirection: 'row', gap: 8, paddingLeft: 4 } : null}
        >
          {block.kind === 'bullet' ? <Text>•</Text> : null}
          <Text style={{ flexShrink: 1 }}>
            {block.spans.map((span, at) => (
              <Text key={at} variant={span.bold ? 'bodyStrong' : 'body'}>
                {span.text}
              </Text>
            ))}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Answer(props: {
  turn: ChatTurn;
  onFollowUp: (text: string) => void;
  followUpsEnabled: boolean;
  testID: string;
}) {
  const { turn, testID } = props;
  const { isPhone } = useBreakpoint();
  const theme = useTheme();
  const steps = turn.steps.map((step) => ({
    id: step.id,
    line: stepLine(step),
    details: step.details,
    running: turn.status === 'streaming' && step.status === 'running',
    // Search terms in quotes; a tool's filters and fields as they are (spec 0067, REQ-008).
    quoted: step.kind === 'web_search',
  }));
  const waiting = turn.status === 'streaming' && turn.text === '' && steps.length === 0;
  return (
    <View testID={testID} style={{ gap: 12 }}>
      <ProgressSteps steps={steps} runningLabel="läuft" testID={`${testID}-steps`} />
      {waiting ? (
        <Text variant="small" color="muted" testID={`${testID}-thinking`}>
          Denkt nach …
        </Text>
      ) : null}
      {turn.text ? (
        <AnswerText
          text={turn.text}
          streaming={turn.status === 'streaming'}
          testID={`${testID}-text`}
        />
      ) : null}
      {turn.cards.length > 0 || turn.cardsPending ? (
        // The carousel runs to the screen edge on phones; the first card stays in line with the text.
        <View style={isPhone ? { marginRight: -theme.shape.gutter } : null}>
          <ScrollRow
            gap={10}
            contentStyle={{ alignItems: 'stretch', paddingRight: isPhone ? theme.shape.gutter : 0 }}
            testID={`${testID}-cards`}
          >
            {turn.cards.length > 0
              ? turn.cards.map((card) => (
                  <PlaceCard key={card.index} card={card} testID={`${testID}-card-${card.index}`} />
                ))
              : [0, 1].map((index) => (
                  <PlaceCardSkeleton key={index} testID={`${testID}-skeleton-${index}`} />
                ))}
          </ScrollRow>
        </View>
      ) : null}
      {turn.cardsPending && turn.cards.length === 0 ? (
        <Text variant="small" color="muted">
          Vorschläge werden geladen · dauert meist 15–25 Sekunden
        </Text>
      ) : null}
      {turn.sources.length > 0 ? (
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
          testID={`${testID}-sources`}
        >
          {turn.sources.map((source) => (
            <Chip
              key={source.host}
              label={source.host}
              icon="external-link"
              accessibilityLabel={`Quelle ${source.host} öffnen`}
              onPress={() => openExternalLink(source.url)}
            />
          ))}
        </View>
      ) : null}
      {turn.status === 'stopped' ? (
        <Text variant="small" color="muted" testID={`${testID}-stopped`}>
          Angehalten.
        </Text>
      ) : null}
      {turn.status === 'error' ? (
        <Text variant="small" color="warn" testID={`${testID}-error`}>
          {turn.error}
        </Text>
      ) : null}
      {turn.status === 'done' && turn.followUps.length > 0 ? (
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
          testID={`${testID}-follow-ups`}
        >
          {turn.followUps.map((text) => (
            <Chip
              key={text}
              label={text}
              disabled={!props.followUpsEnabled}
              onPress={() => props.onFollowUp(text)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function AgentMessages(props: {
  turns: readonly ChatTurn[];
  onFollowUp: (text: string) => void;
  followUpsEnabled: boolean;
}) {
  const last = props.turns.length - 1;
  return (
    <View style={{ gap: 20 }} testID="agent-messages">
      {props.turns.map((turn, index) =>
        turn.role === 'user' ? (
          <UserBubble key={turn.key} turn={turn} testID={`agent-turn-${index}`} />
        ) : (
          <Answer
            key={turn.key}
            turn={turn}
            // Follow-ups only under the newest answer.
            onFollowUp={props.onFollowUp}
            followUpsEnabled={props.followUpsEnabled && index === last}
            testID={`agent-turn-${index}`}
          />
        ),
      )}
    </View>
  );
}
