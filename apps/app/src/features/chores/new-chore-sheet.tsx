import { createChore, useCurrentMember, useMembers, useToday } from '@housekeeping/api';
import {
  choreDraftErrors,
  choreFieldsOf,
  newChoreDraft,
  type ChoreDraftErrors,
} from '@housekeeping/core';
import { Sheet, Text, toast } from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';

import { ChoreFormFields, useChoreDraft, useChoreTime } from './chore-form';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';

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
    if (found.title || found.weekdays) return;
    try {
      createChore({
        ...choreFieldsOf(draft, members),
        dueTime: time.value,
        remindAtDueTime: time.remind,
      });
    } catch (error) {
      setErrors({ title: errorMessage(error, FAILED_MESSAGE) });
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
        online.hint ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : undefined
      }
      actions={{
        primary: {
          label: 'Speichern',
          icon: 'check',
          onPress: save,
          disabled: online.disabled,
          hint: online.hint,
          testID: 'chore-save',
        },
      }}
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
        isNew
      />
    </Sheet>
  );
}
