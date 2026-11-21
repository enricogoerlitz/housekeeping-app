import { createChore, useCurrentMember, useMembers, useToday } from '@housekeeping/api';
import {
  choreDraftErrors,
  choreFieldsOf,
  newChoreDraft,
  type ChoreDraftErrors,
} from '@housekeeping/core';
import { Button, Sheet, Stack, Text, toast } from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';

import { ChoreFormFields, useChoreDraft, useChoreTime } from './chore-form';

/** "Neue Aufgabe": only the title is required; everything else has a sensible default. */
export function NewChoreSheet(props: { visible: boolean; onClose: () => void }) {
  const members = useMembers();
  const me = useCurrentMember();
  const today = useToday();
  const online = useOnlineOnly();
  const [draft, update, reset] = useChoreDraft(() => newChoreDraft(today, me.id));
  const [errors, setErrors] = useState<ChoreDraftErrors>({});
  const time = useChoreTime(undefined);

  const close = () => {
    reset();
    time.reset();
    setErrors({});
    props.onClose();
  };

  const save = () => {
    const found = choreDraftErrors(draft);
    setErrors(found);
    const read = time.read();
    if (found.title || found.weekdays || !read.ok) return;
    try {
      createChore({ ...choreFieldsOf(draft, members), dueTime: read.time });
    } catch (error) {
      setErrors({ title: error instanceof Error ? error.message : 'Das hat nicht geklappt.' });
      return;
    }
    toast.show({ message: `„${draft.title.trim()}“ angelegt` });
    close();
  };

  return (
    <Sheet
      visible={props.visible}
      onClose={close}
      title="Neue Aufgabe"
      testID="chore-new-sheet"
      size="m"
      footer={
        <Stack gap={6}>
          {online.hint ? (
            <Text variant="small" color="warn">
              {online.hint}
            </Text>
          ) : null}
          <Button
            label="Speichern"
            icon="check"
            full
            onPress={save}
            disabled={online.disabled}
            hint={online.hint}
            testID="chore-save"
          />
        </Stack>
      }
    >
      <ChoreFormFields
        draft={draft}
        update={update}
        errors={errors}
        onClearError={(field) => setErrors((current) => ({ ...current, [field]: undefined }))}
        onSubmit={save}
        today={today}
        members={members}
        time={time}
        offlineHint={online.hint}
        autoFocus
      />
    </Sheet>
  );
}
