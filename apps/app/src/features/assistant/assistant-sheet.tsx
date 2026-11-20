import {
  AI_SAMPLE_NOTE,
  applyProposal,
  askAssistant,
  assistantExamples,
  useOffline,
  useRecipe,
  type AssistantContext,
  type Proposal,
} from '@housekeeping/api';
import {
  Chip,
  IconButton,
  Notice,
  OfflineBanner,
  ProposalCard,
  Row,
  Sheet,
  Stack,
  Surface,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { OFFLINE_EDIT_HINT } from '@/features/shell/offline';
import { useAssistant } from '@/lib/assistant';

interface UserMessage {
  id: number;
  role: 'user';
  text: string;
}

interface AssistantMessage {
  id: number;
  role: 'assistant';
  text: string;
  consulted?: string;
  proposal?: Proposal;
  checkedPartIds: string[];
  status: 'open' | 'accepted' | 'discarded';
}

type Message = UserMessage | AssistantMessage;

const OFFLINE_TEXT = 'Offline – der Assistent braucht Netz';
const DICTATION_SAMPLE = 'Was koche ich heute?';

/** The central assistant (simulated in spec 0001): sample requests, proposals as diffs. */
export function AssistantSheet() {
  const host = useAssistant();
  // Mounted only while open: every opening starts a fresh conversation about what the screen
  // handed over.
  if (!host.visible) return null;
  return <AssistantDialog initialContext={host.context} onClose={host.close} />;
}

function AssistantDialog(props: { initialContext: AssistantContext; onClose: () => void }) {
  const offline = useOffline();
  const [context, setContext] = useState<AssistantContext>(props.initialContext);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [nextId, setNextId] = useState(1);
  const recipe = useRecipe(context.recipeId);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || offline) return;
    const reply = askAssistant(trimmed, context);
    setMessages((current) => [
      ...current,
      { id: nextId, role: 'user', text: trimmed },
      {
        id: nextId + 1,
        role: 'assistant',
        text: reply.text,
        consulted: reply.consulted,
        proposal: reply.proposal,
        checkedPartIds: reply.proposal?.parts.map((part) => part.id) ?? [],
        status: 'open',
      },
    ]);
    setNextId(nextId + 2);
    setInput('');
  };

  const updateMessage = (id: number, patch: Partial<AssistantMessage>) =>
    setMessages((current) =>
      current.map((message) =>
        message.id === id && message.role === 'assistant' ? { ...message, ...patch } : message,
      ),
    );

  const accept = (message: AssistantMessage) => {
    if (!message.proposal) return;
    if (offline) {
      toast.show({ message: OFFLINE_EDIT_HINT });
      return;
    }
    if (message.checkedPartIds.length === 0) {
      toast.show({ message: 'Wähle mindestens eine Änderung aus.' });
      return;
    }
    applyProposal(message.proposal, message.checkedPartIds);
    updateMessage(message.id, { status: 'accepted' });
    toast.show({ message: 'Übernommen' });
  };

  const lastProposalId = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.proposal)?.id;
  const lastAnswerId = [...messages].reverse().find((message) => message.role === 'assistant')?.id;
  const examples = assistantExamples(context);

  const footer = (
    <Stack gap={10}>
      {context.recipeId && recipe ? (
        <Row gap={4}>
          <Chip label={`Bezug: ${recipe.title}`} icon="link" testID="assistant-context" />
          <IconButton
            icon="x"
            label="Bezug entfernen"
            size={36}
            onPress={() => setContext({})}
            testID="assistant-context-remove"
          />
        </Row>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 8 }}
      >
        {examples.map((example, index) => (
          <Chip
            key={example}
            label={example}
            icon="sparkles"
            tone="ki"
            disabled={offline}
            onPress={() => send(example)}
            testID={`assistant-example-${index}`}
          />
        ))}
      </ScrollView>
      <TextField
        round
        accessibilityLabel="Nachricht an den Assistenten"
        placeholder="Nachricht …"
        value={input}
        onChangeText={setInput}
        editable={!offline}
        returnKeyType="send"
        blurOnSubmit={false}
        onSubmitEditing={() => send(input)}
        testID="assistant-input"
        left={
          <IconButton
            icon="mic"
            label="Sprechen (Beispiel)"
            size={36}
            disabled={offline}
            onPress={() => setInput(DICTATION_SAMPLE)}
            testID="assistant-mic"
          />
        }
        right={
          <IconButton
            icon="send"
            variant="filled"
            label="Senden"
            size={40}
            disabled={offline || input.trim() === ''}
            onPress={() => send(input)}
            testID="assistant-send"
          />
        }
      />
    </Stack>
  );

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title="Assistent"
      width={640}
      testID="assistant-sheet"
      footer={footer}
    >
      <Stack gap={12}>
        {offline ? <OfflineBanner text={OFFLINE_TEXT} testID="assistant-offline" /> : null}
        {messages.length === 0 ? (
          <View testID="assistant-intro" style={{ gap: 4 }}>
            <Text>
              Frag mich etwas oder wähle unten ein Beispiel. Ich schlage nur vor – ändern tust du.
            </Text>
            <Text variant="caption" color="muted">
              {AI_SAMPLE_NOTE}
            </Text>
          </View>
        ) : null}
        {messages.map((message) =>
          message.role === 'user' ? (
            <View key={message.id} style={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
              <Surface sunken testID={`assistant-user-${message.id}`}>
                <Text>{message.text}</Text>
              </Surface>
            </View>
          ) : (
            <Stack key={message.id} gap={8}>
              <View style={{ alignSelf: 'flex-start', maxWidth: '90%' }}>
                <Surface
                  testID={
                    message.id === lastAnswerId
                      ? 'assistant-answer'
                      : `assistant-answer-${message.id}`
                  }
                >
                  <Text>{message.text}</Text>
                </Surface>
              </View>
              {message.proposal ? (
                <Stack gap={6}>
                  <ProposalCard
                    title={message.proposal.title}
                    note={message.proposal.note}
                    status={message.status}
                    parts={message.proposal.parts.map((part) => ({
                      id: part.id,
                      label: part.label,
                      before: part.before,
                      after: part.after,
                      checked: message.checkedPartIds.includes(part.id),
                    }))}
                    onTogglePart={(partId) =>
                      updateMessage(message.id, {
                        checkedPartIds: message.checkedPartIds.includes(partId)
                          ? message.checkedPartIds.filter((id) => id !== partId)
                          : [...message.checkedPartIds, partId],
                      })
                    }
                    onAccept={() => accept(message)}
                    onDiscard={() => updateMessage(message.id, { status: 'discarded' })}
                    testID={message.id === lastProposalId ? 'proposal' : `proposal-${message.id}`}
                  />
                  {offline && message.status === 'open' ? (
                    <Notice icon="wifi-off" text={OFFLINE_EDIT_HINT} />
                  ) : null}
                </Stack>
              ) : null}
              {message.consulted ? (
                <Text variant="caption" color="muted">
                  {message.consulted}
                </Text>
              ) : null}
            </Stack>
          ),
        )}
      </Stack>
    </Sheet>
  );
}
