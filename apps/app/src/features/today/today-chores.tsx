import {
  completeChore,
  logSpontaneous,
  snapshot,
  useChores,
  useMembers,
  useToday,
} from '@housekeeping/api';
import {
  choreBucket,
  choreMemberIds,
  daysOverdue,
  flexibleProgress,
  recurrenceLabel,
  type Chore,
  type ISODate,
} from '@housekeeping/core';
import {
  AvatarStack,
  Button,
  CheckRow,
  DueBar,
  List,
  Section,
  Sheet,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { undoAction, useOnlineOnly } from '@/features/shell/offline';

/** Flexible chores show up on "Heute" once this share of their interval has passed. */
const FLEXIBLE_DUE_FROM = 0.8;

interface DueChore {
  chore: Chore;
  order: number;
}

function dueChores(chores: Chore[], today: ISODate): Chore[] {
  return chores
    .flatMap((chore): DueChore[] => {
      const bucket = choreBucket(chore, today);
      if (bucket === 'overdue') return [{ chore, order: 0 }];
      if (bucket === 'today') return [{ chore, order: 1 }];
      if (bucket === 'flexible' && flexibleProgress(chore, today) >= FLEXIBLE_DUE_FROM)
        return [{ chore, order: 2 }];
      return [];
    })
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.chore);
}

function dueText(chore: Chore, today: ISODate): string {
  const days = daysOverdue(chore, today);
  if (days === 0) return 'heute';
  return days === 1 ? 'fällig seit 1 Tag' : `fällig seit ${days} Tagen`;
}

/** "Zu tun": chores due today, overdue ones and flexible ones that are nearly due. */
export function TodayChores() {
  const chores = useChores();
  const members = useMembers();
  const today = useToday();
  const online = useOnlineOnly();
  const [sheetOpen, setSheetOpen] = useState(false);
  const due = dueChores(chores, today);
  const points = due.reduce((sum, chore) => sum + chore.effort, 0);

  const complete = (chore: Chore) => {
    const restore = snapshot();
    completeChore(chore.id);
    toast.show({
      message: `${chore.title} erledigt`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
  };

  return (
    <Section
      title="Zu tun"
      meta={due.length > 0 ? `ca. ${points} Punkte` : undefined}
      testID="today-chores"
    >
      {due.length === 0 ? (
        <Text color="muted" testID="today-chores-empty">
          Heute ist nichts fällig.
        </Text>
      ) : (
        <List>
          {due.map((chore) => {
            const flexible = chore.recurrence.type === 'flexible';
            const progress = flexibleProgress(chore, today);
            const assignees = choreMemberIds(chore, members).flatMap((id) =>
              members.filter((member) => member.id === id),
            );
            return (
              <CheckRow
                key={chore.id}
                testID={`today-chore-${chore.id}`}
                title={chore.title}
                checked={false}
                disabled={online.disabled}
                onToggle={() => complete(chore)}
                subtitle={
                  flexible ? (
                    <View>
                      <Text variant="small" color="muted">
                        {recurrenceLabel(chore.recurrence)}
                      </Text>
                      <DueBar
                        value={progress}
                        label={progress >= 1 ? 'Ist fällig' : 'Bald fällig'}
                      />
                    </View>
                  ) : (
                    `${recurrenceLabel(chore.recurrence)} · ${dueText(chore, today)}`
                  )
                }
                trailing={assignees.length > 0 ? <AvatarStack members={assignees} /> : undefined}
              />
            );
          })}
        </List>
      )}
      <View style={{ marginTop: 8 }}>
        <Button
          label="Was anderes erledigt?"
          icon="plus"
          variant="link"
          disabled={online.disabled}
          hint={online.hint}
          onPress={() => setSheetOpen(true)}
          testID="today-spontaneous"
        />
      </View>
      <SpontaneousSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </Section>
  );
}

/** "Hab gerade …": logs something done that has no chore (AC-037). */
function SpontaneousSheet(props: { visible: boolean; onClose: () => void }) {
  const online = useOnlineOnly();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const close = () => {
    setText('');
    setError(undefined);
    props.onClose();
  };

  const submit = () => {
    if (!text.trim()) {
      setError('Was hast du erledigt?');
      return;
    }
    try {
      logSpontaneous(text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Das hat nicht geklappt.');
      return;
    }
    toast.show({ message: 'Eingetragen' });
    close();
  };

  return (
    <Sheet
      visible={props.visible}
      onClose={close}
      title="Was anderes erledigt?"
      testID="spontaneous-sheet"
      size="m"
      footer={
        <Button
          label="Eintragen"
          icon="check"
          full
          disabled={online.disabled}
          hint={online.hint}
          onPress={submit}
          testID="spontaneous-submit"
        />
      }
    >
      <TextField
        label="Was hast du gemacht?"
        placeholder="z. B. Fenster geputzt"
        value={text}
        onChangeText={(value) => {
          setText(value);
          if (error) setError(undefined);
        }}
        onSubmitEditing={submit}
        returnKeyType="done"
        autoFocus
        error={error}
        testID="spontaneous-input"
      />
    </Sheet>
  );
}
