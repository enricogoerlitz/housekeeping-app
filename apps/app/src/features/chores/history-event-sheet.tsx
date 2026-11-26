import {
  changeChoreEventDay,
  reassignChoreEvent,
  useChores,
  useMembers,
  useToday,
} from '@housekeeping/api';
import { addDays, BACKFILL_DAYS, type ChoreEvent } from '@housekeeping/core';
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
} from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';

import { confirmFirst } from '@/features/shell/confirm-dialog';
import { useOnlineOnly } from '@/features/shell/offline';
import { PlanDateCalendar } from '@/lib/plan-date-calendar';

import { dayWithDate } from './chore-labels';
import { removeEventWithToast } from './done-entry-sheet';

interface HistoryEventProps {
  event: ChoreEvent;
  onClose: () => void;
}

/**
 * One history entry (AC-059 to AC-061): „Erledigt von“ changes who did it — for the latest entry
 * of a chore this also hands the turn on —, „Datum ändern“ moves it up to 30 days back — for the
 * latest entry date and last time follow (spec 0026, REQ-007) —, „Eintrag entfernen“ takes it
 * back; for the latest entry the chore is due again as before. All need the network.
 */
function useHistoryEvent(props: HistoryEventProps): { title: string; body: ReactNode } {
  const { event } = props;
  const members = useMembers();
  const chores = useChores();
  const online = useOnlineOnly();
  const today = useToday();
  const [picking, setPicking] = useState(false);
  const choreExists = chores.some((chore) => chore.id === event.choreId);

  // Asks first (spec 0036, Entscheidung 1).
  const remove = () =>
    confirmFirst({
      title: 'Eintrag entfernen?',
      message: `„${event.title}“, ${dayWithDate(event.doneOn, today)}`,
      confirmLabel: 'Entfernen',
      onConfirm: () => {
        props.onClose();
        removeEventWithToast(event, 'Entfernt');
      },
      testID: 'confirm-remove-event',
    });

  return {
    title: event.title,
    body: (
      <Stack gap={16}>
        <Text color="muted" testID="history-event-day">
          {event.kind === 'skipped' ? 'Übersprungen am' : 'Erledigt am'}{' '}
          {dayWithDate(event.doneOn, today)}
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
        <Stack gap={8}>
          <Button
            label="Datum ändern"
            icon="calendar-days"
            variant="secondary"
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => setPicking((current) => !current)}
            testID="history-event-day-change"
          />
          {picking && !online.disabled ? (
            <PlanDateCalendar
              month={event.doneOn}
              today={today}
              marked={event.doneOn}
              isDisabled={(date) => date > today || date < addDays(today, -BACKFILL_DAYS)}
              onSelect={(date) => {
                setPicking(false);
                if (date !== event.doneOn) changeChoreEventDay(event.id, date);
              }}
              testID="history-event-calendar"
            />
          ) : null}
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
