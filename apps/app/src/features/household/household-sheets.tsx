import {
  deleteHousehold,
  NOT_LAST_MEMBER_MESSAGE,
  renameHousehold,
  useActiveHouseholdId,
  useHousehold,
  useHouseholdInvitations,
  useMembers,
} from '@housekeeping/api';
import {
  canDeleteHousehold,
  deleteConfirmMatches,
  deleteHouseholdPrompt,
  householdRename,
} from '@housekeeping/core';
import { Button, Row, Sheet, Stack, Text, TextField, toast } from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';
import { errorMessage } from '@/features/shell/error-message';

// Spec 0027, REQ-004 and REQ-005: renaming the household and deleting it as its last member.
// Both need the network; the checks come from core.

const messageOf = (error: unknown) => errorMessage(error);

/** "Haushalt umbenennen" (AC-014, AC-015): one field "Name", trimmed, unchanged closes. */
export function RenameHouseholdSheet(props: { onClose: () => void }) {
  const household = useHousehold();
  const online = useOnlineOnly();
  const [name, setName] = useState(household.name);
  const [error, setError] = useState<string>();

  const save = () => {
    const decision = householdRename(household.name, name);
    if (decision.action === 'invalid') {
      setError(decision.error);
      return;
    }
    if (decision.action === 'save') {
      try {
        renameHousehold(decision.name);
      } catch (caught) {
        setError(messageOf(caught));
        return;
      }
    }
    props.onClose();
  };

  return (
    <Sheet
      visible
      size="s"
      title="Haushalt umbenennen"
      onClose={props.onClose}
      testID="household-rename-sheet"
      actions={{
        primary: {
          label: 'Speichern',
          icon: 'check',
          onPress: save,
          disabled: online.disabled,
          hint: online.hint,
          testID: 'household-rename-save',
        },
      }}
    >
      <TextField
        label="Name"
        value={name}
        onChangeText={(value) => {
          setName(value);
          setError(undefined);
        }}
        onSubmitEditing={save}
        returnKeyType="done"
        maxLength={80}
        autoFocus
        editable={!online.disabled}
        error={error}
        hint={online.hint}
        testID="household-rename-input"
      />
    </Sheet>
  );
}

/**
 * Below the members (AC-017): "Haushalt löschen" for the last member, otherwise the sentence why
 * not. The window asks twice: the question and the typed name (AC-018, Decision 4).
 */
export function DeleteHouseholdBlock() {
  const members = useMembers();
  const online = useOnlineOnly();
  const [open, setOpen] = useState(false);
  if (!canDeleteHousehold(members.length)) {
    return (
      <Text variant="small" color="muted" testID="household-delete-not-last">
        Löschen kann den Haushalt nur, wer als Letztes übrig ist.
      </Text>
    );
  }
  return (
    <>
      <Button
        label="Haushalt löschen"
        icon="trash"
        variant="secondary"
        disabled={online.disabled}
        hint={online.hint}
        onPress={() => setOpen(true)}
        testID="household-delete"
      />
      {open ? <DeleteHouseholdSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function DeleteHouseholdSheet(props: { onClose: () => void }) {
  const household = useHousehold();
  const householdId = useActiveHouseholdId();
  const invitations = useHouseholdInvitations();
  const online = useOnlineOnly();
  // The window names the household it was opened for, even while the deletion runs.
  const [target] = useState({ id: householdId, name: household.name });
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const prompt = deleteHouseholdPrompt(
    target.name,
    invitations.map((invitation) => invitation.email),
  );
  const matches = deleteConfirmMatches(target.name, typed);

  const close = () => {
    if (!busy) props.onClose();
  };
  const confirm = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await deleteHousehold(target.id);
      toast.show({ message: `„${target.name}“ ist gelöscht` });
      props.onClose();
    } catch (caught) {
      const message = messageOf(caught);
      setBusy(false);
      // AC-022: someone joined meanwhile; nothing was deleted.
      if (message === NOT_LAST_MEMBER_MESSAGE) {
        toast.show({ message });
        props.onClose();
        return;
      }
      setError(message);
    }
  };

  return (
    <Sheet
      visible
      size="m"
      title={prompt.title}
      onClose={close}
      testID="household-delete-sheet"
      // Deleting stays at the bottom: a destructive confirmation, not a form to save (spec 0032).
      footer={
        <Row gap={10} style={{ justifyContent: 'flex-end' }}>
          <Button
            label="Abbrechen"
            variant="secondary"
            disabled={busy}
            onPress={close}
            testID="household-delete-cancel"
          />
          <Button
            label={busy ? 'Wird gelöscht …' : 'Endgültig löschen'}
            icon="trash"
            disabled={!matches || busy || online.disabled}
            hint={online.hint}
            onPress={() => void confirm()}
            testID="household-delete-confirm"
          />
        </Row>
      }
    >
      <Stack gap={14}>
        <Text testID="household-delete-message">{prompt.message}</Text>
        {prompt.invitations ? (
          <Text testID="household-delete-invitations">{prompt.invitations}</Text>
        ) : null}
        <TextField
          label="Zum Bestätigen den Namen eingeben"
          placeholder={target.name}
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={() => void confirm()}
          returnKeyType="done"
          editable={!busy && !online.disabled}
          error={error}
          hint={online.hint}
          testID="household-delete-name"
        />
      </Stack>
    </Sheet>
  );
}
