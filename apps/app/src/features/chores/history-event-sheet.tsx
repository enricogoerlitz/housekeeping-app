import {
  reassignChoreEvent,
  removeChoreEvent,
  snapshot,
  useChores,
  useMembers,
} from '@housekeeping/api';
import type { ChoreEvent } from '@housekeeping/core';
import {
  Button,
  Chip,
  IconButton,
  Notice,
  Row,
  Sheet,
  Stack,
  Surface,
  Text,
  toast,
} from '@housekeeping/ui';
import type { ReactNode } from 'react';

import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { dayWithDate } from './chore-labels';

interface HistoryEventProps {
  event: ChoreEvent;
  onClose: () => void;
}

/**
 * One history entry (AC-059 to AC-061): „Erledigt von“ changes who did it — for the latest entry
 * of a chore this also hands the turn on —, „Eintrag entfernen“ takes it back; for the latest
 * entry the chore is due again as before. Both need the network.
 */
function useHistoryEvent(props: HistoryEventProps): { title: string; body: ReactNode } {
  const { event } = props;
  const members = useMembers();
  const chores = useChores();
  const online = useOnlineOnly();
  const choreExists = chores.some((chore) => chore.id === event.choreId);

  const remove = () => {
    const restore = snapshot();
    const removal = removeChoreEvent(event.id);
    props.onClose();
    if (!removal) return;
    toast.show({
      message: removal.restoresChore
        ? `Entfernt – „${event.title}“ ist wieder dran`
        : 'Eintrag entfernt',
      ...(removal.undoable ? { actionLabel: 'Rückgängig', onAction: undoAction(restore) } : {}),
    });
  };

  return {
    title: event.title,
    body: (
      <Stack gap={16}>
        <Text color="muted" testID="history-event-day">
          {event.kind === 'skipped' ? 'Übersprungen am' : 'Erledigt am'} {dayWithDate(event.doneOn)}
          {choreExists ? '' : ' · Aufgabe gelöscht'}
        </Text>
        <Stack gap={8}>
          <Text variant="smallStrong">
            {event.kind === 'skipped' ? 'Übersprungen von' : 'Erledigt von'}
          </Text>
          <Row wrap gap={8}>
            {members.map((member) => (
              <Chip
                key={member.id}
                label={member.name}
                icon="user"
                selected={event.doneBy === member.id}
                disabled={online.disabled}
                onPress={() => {
                  if (member.id !== event.doneBy) reassignChoreEvent(event.id, member.id);
                }}
                testID={`history-event-by-${member.id}`}
              />
            ))}
          </Row>
        </Stack>
        {online.hint ? (
          <Notice icon="wifi-off" text={online.hint} testID="history-event-offline" />
        ) : null}
        <Button
          label="Eintrag entfernen"
          icon="trash"
          variant="ghost"
          disabled={online.disabled}
          hint={online.hint}
          onPress={remove}
          testID="history-event-remove"
        />
      </Stack>
    ),
  };
}

/** The entry as a small window (phones). */
export function HistoryEventSheet(props: HistoryEventProps) {
  const entry = useHistoryEvent(props);
  return (
    <Sheet
      visible
      onClose={props.onClose}
      title={entry.title}
      size="s"
      testID="history-event-sheet"
    >
      {entry.body}
    </Sheet>
  );
}

/** The entry in the right column of „Verlauf“ on wide screens. */
export function HistoryEventPanel(props: HistoryEventProps) {
  const entry = useHistoryEvent(props);
  return (
    <Surface testID="history-event-panel" padding={20} style={{ gap: 18 }}>
      <Row gap={12}>
        <Text variant="heading" heading style={{ flex: 1, minWidth: 0 }}>
          {entry.title}
        </Text>
        <IconButton
          icon="x"
          label="Schließen"
          onPress={props.onClose}
          testID="history-event-panel-close"
        />
      </Row>
      {entry.body}
    </Surface>
  );
}
