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
  withdrawInvitation,
} from '@housekeeping/api';
import {
  invitationHint,
  invitedNotice,
  memberProfileLine,
  memberRemovalPrompt,
  withdrawnNotice,
  type MemberRemovalPrompt,
} from '@housekeeping/core';
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

import { ConfirmDialog } from '@/features/shell/confirm-dialog';
import { useOnlineOnly } from '@/features/shell/offline';
import { errorMessage } from '@/features/shell/error-message';

// Household management (spec 0003, REQ-003): used by the settings and by the screen shown to a
// signed-in person without a household. Every action needs the network.

const messageOf = (error: unknown) => errorMessage(error);

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
    const address = email.trim().toLowerCase();
    const invited = await run(() => inviteMember(email), setError);
    if (invited) {
      setEmail('');
      toast.show({ message: invitedNotice(address) });
    }
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
        // Spec 0027, AC-006/AC-007: the Google hint stays, also offline (Decision 11).
        hint={invitationHint(online.hint)}
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
 * „Zurückziehen“ withdraws an invitation without asking (spec 0027, REQ-001, Decision 2); the
 * last member has no „Verlassen“, only „Haushalt löschen“ below (AC-017).
 */
export function MemberList() {
  const members = useMembers();
  const invitations = useHouseholdInvitations();
  const me = useCurrentMemberId();
  const households = useHouseholdsMap();
  const activeHouseholdId = useActiveHouseholdId();
  const householdName = households[activeHouseholdId]?.household.name ?? '';
  const householdCount = Object.keys(households).length;
  const online = useOnlineOnly();
  const { busy, run } = useAction();
  const [asking, setAsking] = useState<{ id: string; name: string } | undefined>();
  // The question names one household, and the call acts on the active one: when another becomes
  // active while it is open (e.g. removed on another device), it closes instead of acting there.
  const [askedIn, setAskedIn] = useState(activeHouseholdId);
  if (askedIn !== activeHouseholdId) {
    setAskedIn(activeHouseholdId);
    setAsking(undefined);
  }

  const withdraw = (invitationId: string, email: string) =>
    run(
      async () => {
        await withdrawInvitation(invitationId);
        toast.show({ message: withdrawnNotice(email) });
      },
      (message) => toast.show({ message }),
    );

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
          const last = members.length === 1;
          return (
            <ListRow
              key={member.id}
              title={self ? `${member.name} (du)` : member.name}
              subtitle={memberProfileLine(member)}
              leading={<Avatar name={member.name} color={member.color} size="m" />}
              trailing={
                last ? undefined : (
                  <Button
                    label={self ? 'Verlassen' : 'Entfernen'}
                    variant="link"
                    size="sm"
                    disabled={online.disabled || busy}
                    hint={online.hint}
                    onPress={() => setAsking({ id: member.id, name: member.name })}
                    testID={`household-member-remove-${member.id}`}
                  />
                )
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
            trailing={
              <Button
                label="Zurückziehen"
                variant="link"
                size="sm"
                disabled={online.disabled || busy}
                hint={online.hint}
                onPress={() => void withdraw(invitation.id, invitation.email)}
                testID={`household-invitation-withdraw-${invitation.id}`}
              />
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
    <ConfirmDialog
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
