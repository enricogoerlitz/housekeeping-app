import { useAiChats, useAppView } from '@housekeeping/api';
import {
  addBadge,
  AGENT_LIMITS,
  placeChipLabel,
  rememberPlace,
  type AgentBadgeSlug,
  type AgentPlace,
} from '@housekeeping/core';
import {
  Button,
  Chip,
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
  type PickedAttachment,
} from './agent-attachments';
import { AgentInput } from './agent-input';
import { AgentMessages } from './agent-messages';
import { AgentStart } from './agent-start';
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
  // The newest message and its answer stay in view while it streams.
  useEffect(() => {
    revealInScrollParent(end.current, { align: 'nearest' });
  }, [turns.length, lastTurn?.text.length, lastTurn?.cards.length, lastTurn?.steps.length]);

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
  };

  const send = (message: string) => {
    const trimmed = message.trim();
    if ((!trimmed && attachments.length === 0) || chat.busy || locating || preparing) return;
    if (online.disabled) return;
    const extras = { badges, attachments: attachments.map((entry) => entry.attachment) };
    if (place.source !== 'device') {
      chat.send(trimmed, place, extras);
      clearInput();
      return;
    }
    setLocating(true);
    // REQ-003 of spec 0066 for "Ausgehen": the location now, else the place window and the text
    // waits. Other questions take the location only when the browser already allows it.
    const outing = badges.includes('ausgehen');
    void (outing ? deviceLocation() : deviceLocationIfAllowed()).then((location) => {
      setLocating(false);
      if (!location && outing) {
        setPlaceHint(NO_LOCATION_HINT);
        address.open({ fenster: 'ort' });
        return;
      }
      chat.send(trimmed, location ? { ...place, location } : place, extras);
      clearInput();
    });
  };
  // Spec 0068: "Senden" while dictating stops, waits for the last words and sends them along.
  const dictation = usePromptDictation({
    value: text,
    onChangeText: (value) => setText(value.slice(0, AGENT_LIMITS.message)),
    onSend: () => send(text),
  });

  // AC-005: the badge and the cursor behind it in one tap, so iOS opens the keyboard too.
  const pickBadge = (slug: AgentBadgeSlug) =>
    focusAfterChange(
      () => setBadges((current) => addBadge(current, slug)),
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

  const disabled = online.disabled;
  const atLimit =
    (chats.find((entry) => entry.id === chat.chatId)?.responseIds.length ?? 0) >=
    AGENT_LIMITS.turns;
  const editable = !disabled && !chat.busy && !atLimit;
  const ready = text.trim() !== '' || attachments.length > 0 || dictation.pending;
  const composer = (
    <ComposerBar testID="agent-composer">
      <View
        style={{
          width: '100%',
          maxWidth: CHAT_WIDTH - 2 * WIDE_GUTTER,
          alignSelf: 'center',
          paddingBottom: keyboard.open ? 0 : Math.max(0, bottom - 10),
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Chip
            icon="map-pin"
            label={placeChipLabel(place)}
            onPress={() => address.open({ fenster: 'ort' })}
            accessibilityLabel={`In der Nähe von: ${placeChipLabel(place)}`}
            testID="agent-place-chip"
          />
        </View>
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
          onPickFile={addFile}
          preparing={preparing}
          dictation={dictation}
          editable={editable}
          placeholder={inChat ? 'Nachfragen …' : 'Nachricht'}
          onSubmit={dictation.send}
          inputRef={input}
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
    <Screen
      testID="agent-screen"
      tone="essen"
      header={header}
      footer={composer}
      clearFab={false}
      maxWidth={CHAT_WIDTH}
    >
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
      />
      <View ref={end} style={{ height: 1 }} />
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
  );
}
