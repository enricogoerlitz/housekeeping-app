import { useAgentProposalData } from '@housekeeping/api';
import { answerBlocks, badgeLabel, namedEntity, stepLine } from '@housekeeping/core';
import {
  Chip,
  IconButton,
  ProgressSteps,
  ScrollRow,
  Text,
  useBreakpoint,
  useTheme,
  openExternalLink,
} from '@housekeeping/ui';
import { Text as NativeText, Pressable, View } from 'react-native';

import { AgentEntities } from './agent-entities';
import { useAgentOpen } from './agent-open';
import { AgentImageCard, AgentImagesRow } from './agent-image-cards';
import { AgentProposalCard } from './agent-proposal-card';
import { AgentRecipeChangeCard } from './agent-recipe-change-card';
import { AgentWeekFillCard } from './agent-week-fill-card';
import { AgentRecipeDraftCard } from './agent-recipe-draft-card';

import type { AttachmentPreview } from './agent-attachments';
import { SentAttachments } from './attachment-preview';
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

function UserBubble(props: {
  turn: ChatTurn;
  onOpenAttachment: (preview: AttachmentPreview) => void;
  onEdit?: () => void;
  /** ✎ under the newest message of the person (Gemini's way); every one edits on a long press. */
  showEdit: boolean;
  testID: string;
}) {
  const theme = useTheme();
  // With local copies the files show themselves; only a loaded chat says "1 Anhang".
  const meta = sentWith(
    props.turn.previews?.length ? { ...props.turn, attachments: 0 } : props.turn,
  );
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '85%', alignItems: 'flex-end', gap: 4 }}>
      {props.turn.previews?.length ? (
        <SentAttachments
          previews={props.turn.previews}
          onOpen={props.onOpenAttachment}
          testID={`${props.testID}-files`}
        />
      ) : null}
      {meta ? (
        <Text variant="caption" color="muted" testID={`${props.testID}-meta`}>
          {meta}
        </Text>
      ) : null}
      {props.turn.text ? (
        <Pressable
          testID={props.testID}
          onLongPress={props.onEdit}
          delayLongPress={450}
          accessibilityRole={props.onEdit ? 'button' : undefined}
          accessibilityHint={props.onEdit ? 'Lange drücken zum Bearbeiten' : undefined}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 18,
            borderBottomRightRadius: 4,
            backgroundColor: theme.colors.accent,
          }}
        >
          <Text color="onAccent">{props.turn.text}</Text>
        </Pressable>
      ) : (
        <View testID={props.testID} />
      )}
      {props.showEdit && props.onEdit && props.turn.text ? (
        <IconButton
          icon="pencil"
          label="Nachricht bearbeiten"
          variant="plain"
          onPress={props.onEdit}
          testID={`${props.testID}-edit`}
        />
      ) : null}
    </View>
  );
}

/**
 * Spec 0067 (preview feedback 28.11.): a bold name that is one of the household's recipes,
 * restaurants or activities opens it in the app; an https link opens the app's way — on the
 * iPhone's installed app iOS shows it in its in-app browser over the app.
 */
function AnswerText(props: { text: string; streaming: boolean; testID: string }) {
  const blocks = answerBlocks(props.text);
  const theme = useTheme();
  const data = useAgentProposalData();
  const openEntry = useAgentOpen();
  const open = (target: NonNullable<ReturnType<typeof namedEntity>>) => {
    openEntry({ kind: target.kind, id: target.id });
  };
  return (
    <View testID={props.testID} style={{ gap: 8 }}>
      {blocks.map((block, index) => (
        <View
          key={index}
          style={block.kind === 'bullet' ? { flexDirection: 'row', gap: 8, paddingLeft: 4 } : null}
        >
          {block.kind === 'bullet' ? <Text>•</Text> : null}
          <Text style={{ flexShrink: 1 }}>
            {block.spans.map((span, at) => {
              const url = span.url;
              if (url)
                return (
                  <NativeText
                    key={at}
                    accessibilityRole="link"
                    onPress={() => openExternalLink(url)}
                    style={{ color: theme.colors.accent, textDecorationLine: 'underline' }}
                  >
                    {span.text}
                  </NativeText>
                );
              const target =
                span.bold && data && !props.streaming ? namedEntity(span.text, data) : undefined;
              if (target)
                return (
                  <NativeText
                    key={at}
                    accessibilityRole="link"
                    accessibilityHint={`Öffnet ${target.title}`}
                    onPress={() => open(target)}
                    testID={`${props.testID}-entity-${at}`}
                    style={[theme.type.bodyStrong, { color: theme.colors.accent }]}
                  >
                    {span.text}
                  </NativeText>
                );
              return (
                <Text key={at} variant={span.bold ? 'bodyStrong' : 'body'}>
                  {span.text}
                </Text>
              );
            })}
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
  // AC-024: another person's answer runs in this chat; this one starts after it.
  const queued = turn.status === 'waiting';
  return (
    <View testID={testID} style={{ gap: 12 }}>
      {/* Decision 22: from three steps on one row "4 Schritte", opened by a tap. */}
      <ProgressSteps
        steps={steps}
        runningLabel="läuft"
        summary={`${steps.length} Schritte`}
        testID={`${testID}-steps`}
      />
      {waiting ? (
        <Text variant="small" color="muted" testID={`${testID}-thinking`}>
          Denkt nach …
        </Text>
      ) : null}
      {queued ? (
        <Text variant="small" color="muted" testID={`${testID}-busy`}>
          Agent antwortet gerade … deine Nachricht geht danach.
        </Text>
      ) : null}
      {turn.text ? (
        <AnswerText
          text={turn.text}
          streaming={turn.status === 'streaming'}
          testID={`${testID}-text`}
        />
      ) : null}
      {turn.extras.map((extra, index) => {
        const id = `${testID}-extra-${index}`;
        switch (extra.kind) {
          case 'proposal':
            return (
              <AgentProposalCard
                key={extra.proposal.id}
                proposal={extra.proposal}
                loaded={turn.loaded === true}
                onMore={
                  props.followUpsEnabled ? () => props.onFollowUp('Weitere prüfen') : undefined
                }
                testID={id}
              />
            );
          case 'recipe_change':
            return <AgentRecipeChangeCard key={extra.id} extra={extra} testID={id} />;
          case 'week_fill':
            return (
              <AgentWeekFillCard
                key={extra.id}
                extra={extra}
                loaded={turn.loaded === true}
                testID={id}
              />
            );
          case 'recipe_draft':
            return <AgentRecipeDraftCard key={extra.id} reply={extra.reply} testID={id} />;
          case 'image':
            return (
              <AgentImageCard
                key={extra.id}
                extra={extra}
                loaded={turn.loaded === true}
                testID={id}
              />
            );
          case 'images':
            return <AgentImagesRow key={extra.id} extra={extra} testID={id} />;
          case 'entities':
            return <AgentEntities key={extra.id} extra={extra} testID={id} />;
        }
      })}
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

function lastUserIndex(turns: readonly ChatTurn[]): number {
  for (let index = turns.length - 1; index >= 0; index -= 1)
    if (turns[index]?.role === 'user') return index;
  return -1;
}

export function AgentMessages(props: {
  turns: readonly ChatTurn[];
  onFollowUp: (text: string) => void;
  followUpsEnabled: boolean;
  onOpenAttachment: (preview: AttachmentPreview) => void;
  /** Preview feedback 28.11.: "Bearbeiten" of a message of the person, when it may be edited. */
  onEdit?: (index: number) => void;
}) {
  const last = props.turns.length - 1;
  const lastUser = lastUserIndex(props.turns);
  return (
    <View style={{ gap: 20 }} testID="agent-messages">
      {props.turns.map((turn, index) =>
        turn.role === 'user' ? (
          <UserBubble
            key={turn.key}
            turn={turn}
            onOpenAttachment={props.onOpenAttachment}
            onEdit={props.onEdit ? () => props.onEdit?.(index) : undefined}
            showEdit={index === lastUser}
            testID={`agent-turn-${index}`}
          />
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
