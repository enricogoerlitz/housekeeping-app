import {
  acceptInvitation,
  createHousehold,
  declineInvitation,
  inviteMember,
  removeMember,
  switchHousehold,
  useAuth,
  useActiveHouseholdId,
  useCurrentMemberId,
  useHouseholdInvitations,
  useHouseholdsMap,
  useMembers,
  useMyInvitations,
} from '@housekeeping/api';
import { memberRemovalPrompt, type MemberRemovalPrompt } from '@housekeeping/core';
import {
  Avatar,
  Button,
  Icon,
  List,
  ListRow,
  Stack,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { TripConfirmDialog } from '@/features/packing/trip-dialogs';
import { useOnlineOnly } from '@/features/shell/offline';

// Household management (spec 0003, REQ-003): used by the settings and by the screen shown to a
// signed-in person without a household. Every action needs the network.

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Hat nicht geklappt – bitte noch einmal versuchen';

/** Runs an action once at a time; its error goes to the field or a toast. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, onError: (message: string) => void) => {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (error) {
      onError(messageOf(error));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** AC-010: a name, „Haushalt anlegen“. */
export function CreateHouseholdForm() {
  const online = useOnlineOnly();
  const { busy, run } = useAction();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Der Name fehlt.');
      return;
    }
    setError(undefined);
    const created = await run(async () => {
      // The new household becomes the one shown (AC-010).
      switchHousehold(await createHousehold(trimmed));
    }, setError);
    if (created) {
      setName('');
      toast.show({ message: `Du bist jetzt in „${trimmed}“` });
    }
  };

  return (
    <Stack gap={10}>
      <TextField
        label="Neuer Haushalt"
        placeholder="z. B. WG Köln"
        value={name}
        onChangeText={(value) => {
          setName(value);
          if (error) setError(undefined);
        }}
        onSubmitEditing={submit}
        returnKeyType="done"
        error={error}
        hint={online.hint}
        editable={!online.disabled}
        testID="household-create-input"
      />
      <Button
        label="Haushalt anlegen"
        icon="plus"
        variant="secondary"
        disabled={online.disabled || busy}
        hint={online.hint}
        onPress={submit}
        testID="household-create-submit"
      />
    </Stack>
  );
}

/** AC-008/AC-009: invites a Google address into the active household. */
export function InviteForm() {
  const online = useOnlineOnly();
  const { busy, run } = useAction();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();

  const submit = async () => {
    setError(undefined);
    const invited = await run(() => inviteMember(email), setError);
    if (invited) setEmail('');
  };

  return (
    <Stack gap={10}>
      <TextField
        label="Einladen"
        placeholder="Google-Adresse"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (error) setError(undefined);
        }}
        onSubmitEditing={submit}
        keyboardType="email-address"
        returnKeyType="send"
        error={error}
        hint={online.hint ?? 'Wer eingeladen ist, kann sich mit Google anmelden.'}
        editable={!online.disabled}
        testID="household-invite-input"
      />
      <Button
        label="Einladen"
        icon="user-plus"
        variant="secondary"
        disabled={online.disabled || busy || !email.trim()}
        hint={online.hint}
        onPress={submit}
        testID="household-invite-submit"
      />
    </Stack>
  );
}

/**
 * Members of the active household and its open invitations („Eingeladen“). „Entfernen“ and
 * „Verlassen“ ask first; the server call happens only on the confirmation (spec 0018, REQ-004).
 */
export function MemberList() {
  const members = useMembers();
  const invitations = useHouseholdInvitations();
  const me = useCurrentMemberId();
  const households = useHouseholdsMap();
  const householdName = households[useActiveHouseholdId()]?.household.name ?? '';
  const householdCount = Object.keys(households).length;
  const online = useOnlineOnly();
  const { busy, run } = useAction();
  const [asking, setAsking] = useState<{ id: string; name: string } | undefined>();

  const remove = (profileId: string, name: string) =>
    run(
      async () => {
        await removeMember(profileId);
        toast.show({
          message: profileId === me ? 'Du hast den Haushalt verlassen' : `${name} ist entfernt`,
        });
      },
      (message) => toast.show({ message }),
    );

  return (
    <>
      <List testID="household-members">
        {members.map((member) => {
          const self = member.id === me;
          return (
            <ListRow
              key={member.id}
              title={self ? `${member.name} (du)` : member.name}
              leading={<Avatar name={member.name} color={member.color} size="m" />}
              trailing={
                <Button
                  label={self ? 'Verlassen' : 'Entfernen'}
                  variant="link"
                  size="sm"
                  disabled={online.disabled || busy}
                  hint={online.hint}
                  onPress={() => setAsking({ id: member.id, name: member.name })}
                  testID={`household-member-remove-${member.id}`}
                />
              }
              testID={`household-member-${member.id}`}
            />
          );
        })}
        {invitations.map((invitation) => (
          <ListRow
            key={invitation.id}
            title={invitation.email}
            subtitle="Eingeladen"
            leading={
              <View style={{ width: 36, alignItems: 'center' }}>
                <Icon name="mail" color="muted" />
              </View>
            }
            testID={`household-invitation-${invitation.id}`}
          />
        ))}
      </List>
      {asking ? (
        <MemberRemovalDialog
          prompt={memberRemovalPrompt({
            memberName: asking.name,
            householdName,
            self: asking.id === me,
            householdCount,
          })}
          onConfirm={() => {
            const { id, name } = asking;
            setAsking(undefined);
            void remove(id, name);
          }}
          onCancel={() => setAsking(undefined)}
        />
      ) : null}
    </>
  );
}

/** The question before „Entfernen“ or „Verlassen“; Escape and Android-Zurück cancel (spec 0005). */
function MemberRemovalDialog(props: {
  prompt: MemberRemovalPrompt;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <TripConfirmDialog
      title={props.prompt.title}
      message={props.prompt.message}
      confirmLabel={props.prompt.confirmLabel}
      needsNetwork
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
      testID="member-remove-dialog"
    />
  );
}

/** Invitations to my address: „Annehmen“ / „Ablehnen“. Nothing when there are none. */
export function MyInvitations() {
  const invitations = useMyInvitations();
  const online = useOnlineOnly();
  const { busy, run } = useAction();
  if (invitations.length === 0) return null;
  return (
    <Stack gap={8}>
      <Text variant="smallStrong">Einladungen an dich</Text>
      <List testID="my-invitations">
        {invitations.map((invitation) => (
          <ListRow
            key={invitation.id}
            title={invitation.householdName || 'Ein Haushalt'}
            subtitle="lädt dich ein"
            leading={<Icon name="house" color="accent" />}
            trailing={
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Button
                  label="Ablehnen"
                  variant="link"
                  size="sm"
                  disabled={online.disabled || busy}
                  hint={online.hint}
                  onPress={() =>
                    void run(
                      () => declineInvitation(invitation.id),
                      (message) => toast.show({ message }),
                    )
                  }
                  testID={`invitation-decline-${invitation.id}`}
                />
                <Button
                  label="Annehmen"
                  size="sm"
                  disabled={online.disabled || busy}
                  hint={online.hint}
                  onPress={() =>
                    void run(
                      async () => switchHousehold(await acceptInvitation(invitation.id)),
                      (message) => toast.show({ message }),
                    )
                  }
                  testID={`invitation-accept-${invitation.id}`}
                />
              </View>
            }
            testID={`my-invitation-${invitation.id}`}
          />
        ))}
      </List>
    </Stack>
  );
}

/** Who is signed in, from the session (the profile name may not be loaded yet). */
export function useSignedInEmail(): string {
  return useAuth().user?.email ?? '';
}
