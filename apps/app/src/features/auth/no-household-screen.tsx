import { useMyInvitations, useSyncState } from '@housekeeping/api';
import {
  Button,
  Notice,
  OfflineBanner,
  Screen,
  ScreenHeader,
  Section,
  Stack,
  Text,
} from '@housekeeping/ui';

import {
  CreateHouseholdForm,
  MyInvitations,
  useSignedInEmail,
} from '@/features/household/household-forms';
import { useSignOut } from '@/features/settings/sign-out';

/** Signed in, but in no household yet: accept an invitation or create one. */
export function NoHouseholdScreen() {
  const sync = useSyncState();
  const signOut = useSignOut();
  const invitations = useMyInvitations();
  const email = useSignedInEmail();
  return (
    <Screen testID="no-household" maxWidth={560} clearFab={false}>
      <ScreenHeader title="Willkommen" subtitle={email || undefined} />
      <Stack gap={20}>
        {sync.status === 'offline' ? (
          <OfflineBanner text="Offline – deine Haushalte laden, sobald du Netz hast" />
        ) : null}
        {sync.status === 'error' ? (
          <Notice text="Laden hat nicht geklappt – bitte später noch einmal versuchen." />
        ) : null}
        <Text color="muted">
          {invitations.length > 0
            ? 'Du bist eingeladen. Nimm die Einladung an oder leg einen eigenen Haushalt an.'
            : 'Du gehörst noch zu keinem Haushalt. Leg einen an oder lass dich einladen.'}
        </Text>
        <MyInvitations />
        <Section title="Haushalt anlegen">
          <CreateHouseholdForm />
        </Section>
        <Button
          label="Abmelden"
          icon="log-out"
          variant="ghost"
          size="sm"
          onPress={signOut.request}
          testID="no-household-sign-out"
        />
      </Stack>
      {signOut.dialog}
    </Screen>
  );
}
