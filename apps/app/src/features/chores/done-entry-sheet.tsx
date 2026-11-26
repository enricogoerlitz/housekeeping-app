import {
  removeChoreEvent,
  snapshot,
  useChoreEvents,
  useMembersById,
  useToday,
} from '@housekeeping/api';
import { choreEventTakeBack, type ChoreEvent, type Id } from '@housekeeping/core';
import { Button, Notice, Sheet, Stack, Text, toast } from '@housekeeping/ui';
import { useRouter } from 'expo-router';

import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { dayWithDate } from './chore-labels';

/**
 * Removes an entry as „Eintrag entfernen“ in the history (AC-060); for the latest one the chore is
 * due again as before. The toast offers „Rückgängig“ while the server can book it again.
 */
export function removeEventWithToast(event: ChoreEvent, verb: 'Entfernt' | 'Zurückgenommen') {
  const restore = snapshot();
  const removal = removeChoreEvent(event.id);
  if (!removal) return;
  toast.show({
    message: removal.restoresChore
      ? `${verb} – „${event.title}“ ist wieder dran`
      : verb === 'Entfernt'
        ? 'Eintrag entfernt'
        : 'Zurückgenommen',
    ...(removal.undoable ? { actionLabel: 'Rückgängig', onAction: undoAction(restore) } : {}),
  });
}

/**
 * A tap on a done chore (✓) in the calendar or the overview (spec 0035, REQ-001): „Zurücknehmen“
 * for the latest entry of its chore within 30 days, otherwise „Im Verlauf öffnen“ (glossary,
 * Erledigung, „jüngste Erledigung“). Taking back needs the network (AC-004).
 */
export function DoneEntrySheet(props: {
  eventId: Id;
  onClose: () => void;
  /** „Aufgabe öffnen“: the chore window, where the screen has one (the calendar). */
  onOpenChore?: () => void;
}) {
  const events = useChoreEvents();
  const membersById = useMembersById();
  const today = useToday();
  const online = useOnlineOnly();
  const router = useRouter();
  const event = events.find((candidate) => candidate.id === props.eventId);
  const offer = choreEventTakeBack(events, props.eventId, today);
  if (!event || !offer) return null;
  const by = membersById[event.doneBy]?.name;

  return (
    <Sheet visible onClose={props.onClose} title={event.title} size="s" testID="done-entry-sheet">
      <Stack gap={16}>
        <Text color="muted" testID="done-entry-day">
          Erledigt am {dayWithDate(event.doneOn, today)}
          {by ? ` von ${by}` : ''}
        </Text>
        {offer === 'takeBack' ? (
          <>
            {online.hint ? (
              <Notice icon="wifi-off" text={online.hint} testID="done-entry-offline" />
            ) : null}
            <Button
              label="Zurücknehmen"
              icon="undo"
              variant="secondary"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => {
                props.onClose();
                removeEventWithToast(event, 'Zurückgenommen');
              }}
              testID="done-entry-take-back"
            />
          </>
        ) : (
          <Button
            label="Im Verlauf öffnen"
            icon="history"
            variant="secondary"
            onPress={() => {
              props.onClose();
              router.navigate({
                pathname: '/haushalt',
                params: { ansicht: 'verlauf', verlauf: event.id },
              });
            }}
            testID="done-entry-history"
          />
        )}
        {props.onOpenChore ? (
          <Button
            label="Aufgabe öffnen"
            variant="link"
            onPress={() => {
              props.onClose();
              props.onOpenChore?.();
            }}
            testID="done-entry-chore"
          />
        ) : null}
      </Stack>
    </Sheet>
  );
}
