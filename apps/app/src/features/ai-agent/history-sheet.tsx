import { deleteAgentChat, useAiChats, useMembersById, useToday } from '@housekeeping/api';
import { chatMetaLine, type AiChat, type Id } from '@housekeeping/core';
import {
  EmptyState,
  IconButton,
  List,
  ListRow,
  Sheet,
  Stack,
  SwipeToRemove,
  Text,
  toast,
  useBreakpoint,
} from '@housekeeping/ui';
import { useState } from 'react';

import { ConfirmDialog } from '@/features/shell/confirm-dialog';
import { errorMessage } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';

// Spec 0066, REQ-008/REQ-009: "Verlauf" — the household's chats from the cache, newest first, with
// place, day and who started them. Opening one needs the network; deleting asks first and removes
// the conversation in Foundry, its answers and the row.

const OFFLINE_OPEN_HINT = 'Offline – den Chat lädst du mit Netz.';

export function HistorySheet(props: {
  activeChatId?: Id;
  onOpen: (chatId: Id) => void;
  onDeleted: (chatId: Id) => void;
  onClose: () => void;
}) {
  const chats = useAiChats();
  const today = useToday();
  const membersById = useMembersById();
  const names = Object.fromEntries(
    Object.values(membersById).map((member) => [member.id, member.name]),
  );
  const online = useOnlineOnly();
  const { isPhone } = useBreakpoint();
  const [asking, setAsking] = useState<AiChat | undefined>();

  const open = (chat: AiChat) => {
    if (online.disabled) {
      toast.show({ message: OFFLINE_OPEN_HINT });
      return;
    }
    props.onOpen(chat.id);
  };
  const remove = (chat: AiChat) => {
    deleteAgentChat(chat.id).then(
      () => props.onDeleted(chat.id),
      (error: unknown) => toast.show({ message: errorMessage(error) }),
    );
  };

  return (
    <Sheet visible size="l" title="Verlauf" onClose={props.onClose} testID="agent-history">
      {chats.length === 0 ? (
        <EmptyState
          icon="history"
          title="Noch keine Recherchen"
          text="Was ihr den KI-Agent fragt, steht hier – für alle im Haushalt."
          testID="agent-history-empty"
        />
      ) : (
        <Stack gap={12}>
          <List>
            {chats.map((chat) => (
              <SwipeToRemove
                key={chat.id}
                label="Löschen"
                enabled={isPhone && !online.disabled}
                onRemove={() => setAsking(chat)}
                testID={`agent-history-${chat.id}-swipe`}
              >
                <ListRow
                  title={chat.title}
                  subtitle={chatMetaLine(chat, names, today)}
                  selected={chat.id === props.activeChatId}
                  onPress={() => open(chat)}
                  controls={
                    <IconButton
                      icon="trash"
                      label={`„${chat.title}“ löschen`}
                      disabled={online.disabled}
                      hint={online.hint}
                      onPress={() => setAsking(chat)}
                      testID={`agent-history-${chat.id}-delete`}
                    />
                  }
                  testID={`agent-history-${chat.id}`}
                />
              </SwipeToRemove>
            ))}
          </List>
          <Text variant="small" color="muted">
            Die Recherchen gehören dem Haushalt: alle sehen sie und können sie fortsetzen.
          </Text>
        </Stack>
      )}
      {asking ? (
        <ConfirmDialog
          title="Chat löschen?"
          message={`„${asking.title}“ verschwindet für alle im Haushalt.`}
          confirmLabel="Löschen"
          onConfirm={() => {
            const chat = asking;
            setAsking(undefined);
            remove(chat);
          }}
          onCancel={() => setAsking(undefined)}
          testID="agent-history-confirm"
        />
      ) : null}
    </Sheet>
  );
}
