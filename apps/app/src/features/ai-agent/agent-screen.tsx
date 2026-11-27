import { useAiChats } from '@housekeeping/api';
import { AGENT_LIMITS, placeChipLabel, rememberPlace, type AgentPlace } from '@housekeeping/core';
import {
  Button,
  Chip,
  ComposerBar,
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
import { useEffect, useRef, useState } from 'react';
import { View, type HostInstance } from 'react-native';

import { DictationField } from '@/features/shell/dictation-field';
import { useOnlineOnly } from '@/features/shell/offline';
import { usePromptDictation } from '@/lib/use-prompt-dictation';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import { AgentMessages } from './agent-messages';
import {
  deviceLocation,
  NO_LOCATION_HINT,
  readRecentPlaces,
  writeRecentPlaces,
} from './device-place';
import { HistorySheet } from './history-sheet';
import { PlaceSheet } from './place-sheet';
import { useAgentChat } from './use-agent-chat';

// Spec 0066 "KI-Agent" (ADR-0018): its own page, opened by ✨ from "Restaurants" (von=essen) or
// "Aktivitäten". Online only: offline it shows "Verlauf" from the cache and the input is off.

const OFFLINE_AGENT_HINT = 'Offline – zum Recherchieren brauchst du Netz';
/** One reading column on wide screens: text, cards and the input line up. */
const CHAT_WIDTH = 920;
const SUBTITLE = 'Restaurants und Aktivitäten, mit Websuche';
const DEVICE_PLACE: AgentPlace = { source: 'device', label: 'Aktueller Standort', radius: 'walk' };

export function AgentScreen() {
  const address = usePageParams('ki-agent');
  const { params } = address;
  // Without `von` it came from "Aktivitäten" (under "Verwalten"), which is where "Zurück" leads.
  const origin = useOriginBack(
    params.von,
    'verwalten',
    params.von ? undefined : { label: 'Aktivitäten', href: '/aktivitaeten' },
  );
  const { isPhone } = useBreakpoint();
  const keyboard = useKeyboard();
  const bottom = useBottomInset(10);
  const online = useOnlineOnly();
  const chats = useAiChats();
  const chat = useAgentChat(params.chat, (chatId) => address.replace({ chat: chatId }));
  const title = chats.find((entry) => entry.id === chat.chatId)?.title ?? chat.title;

  const [text, setText] = useState('');
  const [place, setPlace] = useState<AgentPlace>(DEVICE_PLACE);
  const [recent, setRecent] = useState<AgentPlace[]>(readRecentPlaces);
  const [placeHint, setPlaceHint] = useState<string | undefined>();
  const [locating, setLocating] = useState(false);
  const end = useRef<HostInstance>(null);

  const turns = chat.turns;
  const lastTurn = turns[turns.length - 1];
  // The newest message and its answer stay in view while it streams.
  useEffect(() => {
    revealInScrollParent(end.current, { align: 'nearest' });
  }, [turns.length, lastTurn?.text.length, lastTurn?.cards.length]);

  const choosePlace = (next: AgentPlace) => {
    setPlace(next);
    setPlaceHint(undefined);
    const remembered = rememberPlace(recent, next);
    setRecent(remembered);
    writeRecentPlaces(remembered);
    address.close({ fenster: undefined });
  };

  const send = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || chat.busy || locating || online.disabled) return;
    if (place.source !== 'device') {
      chat.send(trimmed, place);
      setText('');
      return;
    }
    // REQ-003: the location only now; without it the place window opens and the text waits.
    setLocating(true);
    void deviceLocation().then((location) => {
      setLocating(false);
      if (!location) {
        setPlaceHint(NO_LOCATION_HINT);
        address.open({ fenster: 'ort' });
        return;
      }
      chat.send(trimmed, { ...place, location });
      setText('');
    });
  };
  // Spec 0068: "Senden" while dictating stops, waits for the last words and sends them along.
  const dictation = usePromptDictation({
    value: text,
    onChangeText: (value) => setText(value.slice(0, AGENT_LIMITS.message)),
    onSend: () => send(text),
  });

  const newChat = () => {
    chat.reset();
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
      title="KI-Agent"
      subtitle={
        inChat
          ? (title ?? (chat.load.status === 'loading' ? 'Wird geladen …' : undefined))
          : SUBTITLE
      }
      backLabel={origin.label}
      onBack={origin.back}
      right={right}
      testID="agent-title"
    />
  );

  const disabled = online.disabled;
  const atLimit =
    (chats.find((entry) => entry.id === chat.chatId)?.responseIds.length ?? 0) >=
    AGENT_LIMITS.turns;
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
        <DictationField
          accessibilityLabel="Nachricht an den KI-Agent"
          placeholder={inChat ? 'Nachfragen …' : 'Wonach sucht ihr?'}
          value={text}
          onChangeText={(value) => setText(value.slice(0, AGENT_LIMITS.message))}
          maxLength={AGENT_LIMITS.message}
          editable={!disabled && !chat.busy && !atLimit}
          multiline
          grow
          round
          dictation={dictation}
          onSubmitEditing={dictation.send}
          blurOnSubmit
          returnKeyType="send"
          testID="agent-input"
          trailing={
            chat.busy ? (
              <IconButton
                icon="x"
                label="Recherche anhalten"
                variant="filled"
                onPress={chat.stop}
                testID="agent-stop"
              />
            ) : (
              <IconButton
                icon="send"
                label="Senden"
                variant="filled"
                disabled={
                  disabled || locating || atLimit || (text.trim() === '' && !dictation.pending)
                }
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
