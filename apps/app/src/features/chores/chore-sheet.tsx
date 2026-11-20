import { postponeChore, skipChore, snapshot, useMembers, useToday } from '@housekeeping/api';
import { assignmentLabel, recurrenceLabel, relativeDayLabel, type Chore } from '@housekeeping/core';
import { Button, Notice, Sheet, Stack, Text, toast } from '@housekeeping/ui';

import { useOnlineOnly } from '@/features/shell/offline';

import { effortLabel } from './chore-labels';

/** Details of one chore with the actions besides checking it off. */
export function ChoreSheet(props: {
  chore: Chore | undefined;
  onClose: () => void;
  onComplete: (chore: Chore) => void;
}) {
  const members = useMembers();
  const today = useToday();
  const online = useOnlineOnly();
  const chore = props.chore;

  const run = (action: (id: string) => void, message: string) => {
    if (!chore) return;
    const restore = snapshot();
    action(chore.id);
    props.onClose();
    toast.show({ message, actionLabel: 'Rückgängig', onAction: restore });
  };

  const facts = chore
    ? [
        recurrenceLabel(chore.recurrence),
        assignmentLabel(chore.assignment, members),
        chore.room,
        `Aufwand ${effortLabel(chore.effort)}`,
        chore.nextDueOn && chore.recurrence.type !== 'flexible'
          ? `fällig ${relativeDayLabel(chore.nextDueOn, today)}`
          : undefined,
      ].filter(Boolean)
    : [];

  return (
    <Sheet
      visible={!!chore}
      onClose={props.onClose}
      title={chore?.title ?? ''}
      testID="chore-sheet"
    >
      <Stack gap={16}>
        <Text color="muted">{facts.join(' · ')}</Text>
        {online.hint ? <Notice icon="wifi-off" text={online.hint} /> : null}
        <Stack gap={10}>
          <Button
            label="Erledigt"
            icon="check"
            full
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => {
              if (!chore) return;
              props.onClose();
              props.onComplete(chore);
            }}
            testID="chore-done"
          />
          <Button
            label="Später"
            icon="alarm-clock"
            variant="secondary"
            full
            disabled={online.disabled}
            hint={online.hint ?? 'Verschiebt nur diesen Termin um einen Tag'}
            onPress={() => run(postponeChore, 'Auf morgen verschoben')}
            testID="chore-postpone"
          />
          <Button
            label="Überspringen"
            icon="arrow-right"
            variant="ghost"
            full
            disabled={online.disabled}
            hint={online.hint ?? 'Wird als übersprungen verbucht, nicht als erledigt'}
            onPress={() => run(skipChore, 'Übersprungen')}
            testID="chore-skip"
          />
        </Stack>
      </Stack>
    </Sheet>
  );
}
