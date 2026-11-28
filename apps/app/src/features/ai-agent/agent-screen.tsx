import { useAiChats, useAppView } from '@housekeeping/api';
import {
  addBadge,
  AGENT_LIMITS,
  placeChipLabel,
  placeToSend,
  rememberPlace,
  withoutSlash,
  type AgentBadgeSlug,
  type AgentPlace,
} from '@housekeeping/core';
import {
  Button,
  ComposerBar,
  focusAfterChange,
  IconButton,
  LoadingLines,
  revealInScrollParent,
  Screen,
  ScreenHeader,
  Text,
  useBottomInset,
  useBreakpoint,
  useDragDismissKeyboard,
  useKeyboard,
  WIDE_GUTTER,
} from '@housekeeping/ui';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { View, type HostInstance, type TextInput } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { usePromptDictation } from '@/lib/use-prompt-dictation';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import {
  ATTACHMENT_TOO_LARGE,
  prepareAttachment,
  previewOf,
  type PickedAttachment,
} from './agent-attachments';
import { clearDraftPhoto } from './agent-draft-photo';
import { AgentInput } from './agent-input';
import { AgentOpenHost } from './agent-open';
import { AgentMessages } from './agent-messages';
import { AgentStart } from './agent-start';
import { useAttachmentPreview } from './attachment-preview';
import {
  deviceLocation,
  deviceLocationIfAllowed,
  NO_LOCATION_HINT,
  readRecentPlaces,
  writeRecentPlaces,
} from './device-place';
import { HistorySheet } from './history-sheet';
import { PlaceSheet } from './place-sheet';
import { useAgentChat } from './use-agent-chat';

// Spec 0066 "KI-Agent" (ADR-0018), since spec 0067 the one household agent: its own page — a tab
// in "KI zuerst", otherwise from ⊞ → "Agent" or ✨ of "Restaurants" and "Aktivitäten" (with the
// badge "Ausgehen"). Online only: offline it shows "Verlauf" from the cache and the input is off.

const OFFLINE_AGENT_HINT = 'Offline – für den Agent brauchst du Netz';
/** One reading column on wide screens: text, cards and the input line up. */
const CHAT_WIDTH = 920;
const DEVICE_PLACE: AgentPlace = { source: 'device', label: 'Aktueller Standort', radius: 'walk' };

export function AgentScreen() {
  const address = usePageParams('ki-agent');
  const { params } = address;
  const view = useAppView();
  const origin = useOriginBack(
    params.von,
    'verwalten',
    params.aus === 'aktivitaeten' ? { label: 'Aktivitäten', href: '/aktivitaeten' } : undefined,
  );
  // In "KI zuerst" the agent is a tab of its own: no "Zurück" unless a page sent it here.
  const showBack = view !== 'ai_first' || params.von !== undefined || params.aus !== undefined;
  const { isPhone } = useBreakpoint();
  const keyboard = useKeyboard();
  const bottom = useBottomInset(10);
  const online = useOnlineOnly();
  const chats = useAiChats();
  const chat = useAgentChat(params.chat, (chatId) => address.replace({ chat: chatId }));
  const title = chats.find((entry) => entry.id === chat.chatId)?.title ?? chat.title;

  const [text, setText] = useState('');
  const [badges, setBadges] = useState<AgentBadgeSlug[]>([]);
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  // Preview feedback 28.11.: the turn of the person's message being edited (ChatGPT's way).
  const [editing, setEditing] = useState<number | undefined>();
  const [preparing, setPreparing] = useState(false);
  const [attachError, setAttachError] = useState<string | undefined>();
  const [place, setPlace] = useState<AgentPlace>(DEVICE_PLACE);
  const [recent, setRecent] = useState<AgentPlace[]>(readRecentPlaces);
  const [placeHint, setPlaceHint] = useState<string | undefined>();
  const [locating, setLocating] = useState(false);
  const end = useRef<HostInstance>(null);
  const input = useRef<ComponentRef<typeof TextInput> | null>(null);

  // ✨ of "Restaurants" and "Aktivitäten" hand over "Ausgehen" (spec 0067, ADR-0020): set once
  // (adjusted in render), then the address forgets it.
  const handed = params.badge;
  const [taken, setTaken] = useState<AgentBadgeSlug | undefined>();
  if (handed !== taken) {
    setTaken(handed);
    if (handed) setBadges(addBadge(badges, handed));
  }
  const { replace } = address;
  useEffect(() => {
    if (handed) replace({ badge: undefined });
  }, [handed, replace]);

  const turns = chat.turns;
  const lastTurn = turns[turns.length - 1];
  // The newest message and its answer stay in view while it streams, and when the keyboard opens
  // (UI review 27.11.): the chat's end stands right above the input, the header narrows.
  useEffect(() => {
    revealInScrollParent(end.current, { align: 'nearest' });
  }, [
    turns.length,
    lastTurn?.text.length,
    lastTurn?.cards.length,
    lastTurn?.steps.length,
    lastTurn?.extras.length,
    keyboard.open,
  ]);
  // A photo taken for a draft lives only while the page is open.
  useEffect(() => clearDraftPhoto, []);

  const choosePlace = (next: AgentPlace) => {
    setPlace(next);
    setPlaceHint(undefined);
    const remembered = rememberPlace(recent, next);
    setRecent(remembered);
    writeRecentPlaces(remembered);
    address.close({ fenster: undefined });
  };

  const clearInput = () => {
    setText('');
    setBadges([]);
    setAttachments([]);
    setAttachError(undefined);
    setEditing(undefined);
  };

  const send = (message: string) => {
    const trimmed = message.trim();
    if ((!trimmed && attachments.length === 0) || chat.busy || locating || preparing) return;
    if (online.disabled) return;
    const extras = {
      badges,
      attachments: attachments.map((entry) => entry.attachment),
      previews: attachments.map(previewOf),
      ...(editing !== undefined ? { editTurn: editing } : {}),
    };
    if (place.source !== 'device') {
      chat.send(trimmed, place, extras);
      clearInput();
      return;
    }
    setLocating(true);
    // Preview 28.11. (changes spec 0066 REQ-003): the location never blocks sending. "Ausgehen"
    // asks the browser for it (at most 3 s, a fix of the last minutes counts); other questions
    // take it only when the browser already allows it. Without one the message goes anyway, the
    // place chip says so, and the place window opens only from the chip.
    const outing = badges.includes('ausgehen');
    void (outing ? deviceLocation() : deviceLocationIfAllowed()).then((location) => {
      setLocating(false);
      const sent = placeToSend(place, location, outing);
      setPlaceHint(sent.hint ? NO_LOCATION_HINT : undefined);
      chat.send(trimmed, sent.place, extras);
      clearInput();
    });
  };
  // Spec 0068: "Senden" while dictating stops, waits for the last words and sends them along.
  const dictation = usePromptDictation({
    value: text,
    onChangeText: (value) => setText(value.slice(0, AGENT_LIMITS.message)),
    onSend: () => send(text),
  });

  // AC-005: the badge and the cursor behind it in one tap, so iOS opens the keyboard too. A "/re"
  // typed meanwhile goes as in the slash menu (AC-006, click-through of step A).
  const pickBadge = (slug: AgentBadgeSlug) =>
    focusAfterChange(
      () => {
        setBadges((current) => addBadge(current, slug));
        setText((current) => withoutSlash(current, current.length).text);
      },
      () => input.current,
    );

  const addFile = (file: File) => {
    setAttachError(undefined);
    if (attachments.length >= AGENT_LIMITS.attachments) return;
    setPreparing(true);
    prepareAttachment(file).then(
      (picked) => {
        setPreparing(false);
        const total = [...attachments, picked].reduce(
          (sum, entry) => sum + entry.attachment.dataUrl.length,
          0,
        );
        if (total > AGENT_LIMITS.attachmentChars) setAttachError(ATTACHMENT_TOO_LARGE);
        else
          setAttachments((current) =>
            current.length >= AGENT_LIMITS.attachments ? current : [...current, picked],
          );
      },
      (cause: unknown) => {
        setPreparing(false);
        setAttachError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  };

  const newChat = () => {
    chat.reset();
    clearInput();
    clearDraftPhoto();
    address.replace({ chat: undefined });
  };
  const right = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {chat.chatId || turns.length > 0 ? (
        isPhone ? (
          <IconButton
            icon="message-square-plus"
            label="Neuer Chat"
            onPress={newChat}
            testID="agent-new"
          />
        ) : (
          <Button
            label="Neuer Chat"
            icon="message-square-plus"
            size="sm"
            variant="secondary"
            onPress={newChat}
            testID="agent-new"
          />
        )
      ) : null}
      {isPhone ? (
        <IconButton
          icon="history"
          label="Verlauf"
          onPress={() => address.open({ fenster: 'verlauf' })}
          testID="agent-history-open"
        />
      ) : (
        <Button
          label="Verlauf"
          icon="history"
          size="sm"
          variant="secondary"
          onPress={() => address.open({ fenster: 'verlauf' })}
          testID="agent-history-open"
        />
      )}
    </View>
  );
  const inChat = chat.chatId !== undefined || turns.length > 0;
  const header = (
    <ScreenHeader
      title="Agent"
      subtitle={
        inChat
          ? (title ?? (chat.load.status === 'loading' ? 'Wird geladen …' : undefined))
          : undefined
      }
      backLabel={showBack ? origin.label : undefined}
      onBack={showBack ? origin.back : undefined}
      right={right}
      testID="agent-title"
    />
  );

  // Long-press on a message of the person, or ✎ under the last one: back into the input; sending
  // replaces it and what followed (preview feedback 28.11.).
  const startEdit = (index: number) => {
    const turn = turns[index];
    if (!turn || turn.role !== 'user' || chat.busy) return;
    focusAfterChange(
      () => {
        setEditing(index);
        setText(turn.text);
        setBadges(turn.badges ?? []);
        setAttachments([]);
      },
      () => input.current,
    );
  };
  const attachmentPreview = useAttachmentPreview();
  const dragDismiss = useDragDismissKeyboard(keyboard.open);

  const disabled = online.disabled;
  const atLimit =
    (chats.find((entry) => entry.id === chat.chatId)?.responseIds.length ?? 0) >=
    AGENT_LIMITS.turns;
  // Preview feedback 28.11.: typing goes on while the agent answers; sending waits for its end
  // (the button is "Antwort anhalten" until then), as in ChatGPT and Gemini.
  const editable = !disabled && !atLimit;
  const ready = text.trim() !== '' || attachments.length > 0 || dictation.pending;
  const composer = (
    <ComposerBar testID="agent-composer" dense>
      <View
        style={{
          width: '100%',
          maxWidth: CHAT_WIDTH - 2 * WIDE_GUTTER,
          alignSelf: 'center',
          paddingBottom: keyboard.open ? 0 : Math.max(0, bottom - 8),
          gap: 8,
        }}
      >
        {disabled ? (
          <Text variant="small" color="warn" testID="agent-offline-hint">
            {online.hint?.startsWith('Offline') === false ? online.hint : OFFLINE_AGENT_HINT}
          </Text>
        ) : null}
        {atLimit ? (
          <Text variant="small" color="muted" testID="agent-limit-hint">
            Dieser Chat ist lang geworden – starte einen neuen.
          </Text>
        ) : null}
        {editing !== undefined ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="small" color="muted" style={{ flex: 1 }} testID="agent-editing">
              Nachricht bearbeiten – was danach kam, ersetzt die neue Antwort
            </Text>
            <Button
              label="Abbrechen"
              variant="link"
              quiet
              size="sm"
              onPress={clearInput}
              testID="agent-edit-cancel"
            />
          </View>
        ) : null}
        {attachError ? (
          <Text variant="small" color="warn" testID="agent-attach-error">
            {attachError}
          </Text>
        ) : null}
        <AgentInput
          text={text}
          onChangeText={(value) => {
            setText(value.slice(0, AGENT_LIMITS.message));
            if (attachError) setAttachError(undefined);
          }}
          badges={badges}
          onBadges={setBadges}
          attachments={attachments}
          onRemoveAttachment={(key) =>
            setAttachments((current) => current.filter((entry) => entry.key !== key))
          }
          onPreview={attachmentPreview.open}
          onPickFile={addFile}
          preparing={preparing}
          dictation={dictation}
          editable={editable}
          placeholder={inChat ? 'Nachfragen …' : 'Nachricht'}
          onSubmit={dictation.send}
          inputRef={input}
          place={
            badges.includes('ausgehen') || place.source !== 'device' || placeHint
              ? {
                  label: placeHint && place.source === 'device' ? placeHint : placeChipLabel(place),
                  accessibilityLabel: `In der Nähe von: ${placeChipLabel(place)}`,
                  onPress: () => address.open({ fenster: 'ort' }),
                }
              : undefined
          }
          trailing={
            chat.busy ? (
              <IconButton
                icon="x"
                label="Antwort anhalten"
                variant="filled"
                onPress={chat.stop}
                testID="agent-stop"
              />
            ) : (
              <IconButton
                icon="send"
                label="Senden"
                variant="filled"
                disabled={disabled || locating || preparing || atLimit || !ready}
                hint={disabled ? OFFLINE_AGENT_HINT : undefined}
                onPress={dictation.send}
                testID="agent-send"
              />
            )
          }
        />
      </View>
    </ComposerBar>
  );

  return (
    <AgentOpenHost>
      <Screen
        testID="agent-screen"
        tone="essen"
        header={header}
        footer={composer}
        clearFab={false}
        compactHeader={keyboard.open}
        maxWidth={CHAT_WIDTH}
      >
        {/* Preview feedback 28.11.: dragging the chat down to read sends the keyboard away. */}
        <View {...dragDismiss}>
          {!inChat && chat.load.status === 'idle' ? (
            <AgentStart onPick={pickBadge} disabled={!editable} />
          ) : null}
          {chat.load.status === 'loading' ? (
            <LoadingLines label="Der Chat wird geladen …" testID="agent-loading" />
          ) : null}
          {chat.load.status === 'error' ? (
            <Text color="warn" testID="agent-load-error">
              {online.disabled ? 'Offline – den Chat lädst du mit Netz.' : chat.load.message}
            </Text>
          ) : null}
          <AgentMessages
            turns={turns}
            onFollowUp={send}
            followUpsEnabled={!disabled && !chat.busy && !atLimit}
            onOpenAttachment={attachmentPreview.open}
            onEdit={!disabled && !chat.busy && !atLimit ? startEdit : undefined}
          />
          {attachmentPreview.viewer}
          <View ref={end} style={{ height: 1 }} />
        </View>
        {params.fenster === 'ort' ? (
          <PlaceSheet
            place={place}
            recent={recent}
            hint={placeHint}
            onChoose={choosePlace}
            onClose={() => {
              setPlaceHint(undefined);
              address.close({ fenster: undefined });
            }}
          />
        ) : null}
        {params.fenster === 'verlauf' ? (
          <HistorySheet
            activeChatId={chat.chatId}
            onOpen={(chatId) => {
              address.close({ fenster: undefined });
              address.replace({ chat: chatId });
            }}
            onDeleted={(chatId) => {
              if (chatId === chat.chatId) newChat();
            }}
            onClose={() => address.close({ fenster: undefined })}
          />
        ) : null}
      </Screen>
    </AgentOpenHost>
  );
}
