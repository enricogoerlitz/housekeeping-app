import {
  AI_SAMPLE_NOTE,
  aiErrorMessage,
  applyProposal,
  askAssistantAsync,
  assistantExamples,
  useAiSimulated,
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
  TypingIndicator,
} from '@housekeeping/ui';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { OFFLINE_EDIT_HINT } from '@/features/shell/offline';
import { useAssistant } from '@/lib/assistant';
import { useDictation } from '@/lib/use-dictation';

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
  /** The request failed; `text` is the calm German message. */
  failed?: boolean;
}

type Message = UserMessage | AssistantMessage;

const OFFLINE_TEXT = 'Offline – der Assistent braucht Netz';
const DICTATION_SAMPLE = 'Was koche ich heute?';

/**
 * The central assistant: proposals as diffs, applied only on "Übernehmen". Demo mode answers the
 * samples of spec 0001; with the backend the edge function `ai-assistant` answers (spec 0003).
 */
export function AssistantSheet() {
  const host = useAssistant();
  // Mounted only while open: every opening starts a fresh conversation about what the screen
  // handed over.
  if (!host.visible) return null;
  return <AssistantDialog initialContext={host.context} onClose={host.close} />;
}

function AssistantDialog(props: { initialContext: AssistantContext; onClose: () => void }) {
  const offline = useOffline();
  const simulated = useAiSimulated();
  const dictation = useDictation();
  const [context, setContext] = useState<AssistantContext>(props.initialContext);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const nextId = useRef(1);
  const mounted = useRef(true);
  const recipe = useRecipe(context.recipeId);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || offline || pending) return;
    const userId = nextId.current;
    const answerId = userId + 1;
    nextId.current += 2;
    setMessages((current) => [...current, { id: userId, role: 'user', text: trimmed }]);
    setInput('');
    setPending(true);
    askAssistantAsync(trimmed, context)
      .then(
        (reply): AssistantMessage => ({
          id: answerId,
          role: 'assistant',
          text: reply.text,
          consulted: reply.consulted,
          proposal: reply.proposal,
          checkedPartIds: reply.proposal?.parts.map((part) => part.id) ?? [],
          status: 'open',
        }),
        (error: unknown): AssistantMessage => ({
          id: answerId,
          role: 'assistant',
          text: aiErrorMessage(error),
          checkedPartIds: [],
          status: 'open',
          failed: true,
        }),
      )
      .then((answer) => {
        if (!mounted.current) return;
        setMessages((current) => [...current, answer]);
        setPending(false);
      });
  };

  const busy = offline || pending;
  const listening = dictation.status === 'listening';
  const pressMic = () => {
    if (simulated) {
      setInput(DICTATION_SAMPLE);
      return;
    }
    if (listening) {
      void dictation.stop().then((text) => {
        if (mounted.current && text) setInput(text);
      });
      return;
    }
    if (dictation.status === 'idle') dictation.start();
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
            disabled={busy}
            onPress={() => send(example)}
            testID={`assistant-example-${index}`}
          />
        ))}
      </ScrollView>
      <TextField
        round
        accessibilityLabel="Nachricht an den Assistenten"
        placeholder="Nachricht …"
        value={listening || dictation.status === 'stopping' ? dictation.transcript : input}
        onChangeText={setInput}
        editable={!busy && dictation.status === 'idle'}
        returnKeyType="send"
        blurOnSubmit={false}
        onSubmitEditing={() => send(input)}
        testID="assistant-input"
        left={
          <IconButton
            icon="mic"
            label={simulated ? 'Sprechen (Beispiel)' : listening ? 'Aufnahme beenden' : 'Sprechen'}
            size={36}
            variant={listening ? 'filled' : 'plain'}
            disabled={busy || dictation.status === 'starting' || dictation.status === 'stopping'}
            onPress={pressMic}
            testID="assistant-mic"
          />
        }
        right={
          <IconButton
            icon="send"
            variant="filled"
            label="Senden"
            size={40}
            disabled={busy || listening || input.trim() === ''}
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
            {simulated ? (
              <Text variant="caption" color="muted">
                {AI_SAMPLE_NOTE}
              </Text>
            ) : null}
          </View>
        ) : null}
        {dictation.error ? (
          <Notice icon="mic" text={dictation.error} testID="assistant-dictation-error" />
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
                {message.failed ? (
                  <Notice
                    icon="circle-alert"
                    text={message.text}
                    testID={
                      message.id === lastAnswerId
                        ? 'assistant-answer'
                        : `assistant-answer-${message.id}`
                    }
                  />
                ) : (
                  <Surface
                    testID={
                      message.id === lastAnswerId
                        ? 'assistant-answer'
                        : `assistant-answer-${message.id}`
                    }
                  >
                    <Text>{message.text}</Text>
                  </Surface>
                )}
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
        {pending ? (
          <TypingIndicator label="Der Assistent schreibt …" testID="assistant-typing" />
        ) : null}
      </Stack>
    </Sheet>
  );
}
