import {
  signInWithGoogle,
  signInWithTestAccount,
  TEST_ACCOUNTS,
  type TestAccountKey,
} from '@housekeeping/api';
import { Button, Notice, Screen, Stack, Surface, Text, useBreakpoint } from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { authConfig } from '@/lib/auth-config';

const DEV_LABELS: Record<TestAccountKey, string> = {
  enrico: 'Als Test-Enrico anmelden',
  nadja: 'Als Test-Nadja anmelden',
};

/** The only screen without a session: Google sign-in (and test accounts in local builds). */
export function LoginScreen(props: { error?: string }) {
  const { isPhone } = useBreakpoint();
  const [busy, setBusy] = useState(false);

  const run = (action: () => Promise<void>) => {
    setBusy(true);
    // Google leaves the page; a test account switches the gate. Either way the button may unlock.
    action().finally(() => setBusy(false));
  };

  const content = (
    <Stack gap={24}>
      <Stack gap={8}>
        <Text variant="display" heading>
          Housekeeping
        </Text>
        <Text color="muted">Rezepte, Wochenplan und Einkaufsliste – für euren Haushalt.</Text>
      </Stack>
      {props.error ? <Notice text={props.error} testID="login-error" /> : null}
      <Stack gap={10}>
        <Button
          label="Mit Google anmelden"
          full
          disabled={busy}
          onPress={() => run(signInWithGoogle)}
          testID="login-google"
        />
        <Text variant="small" color="muted">
          Anmelden kann sich, wer von jemandem aus dem Haushalt eingeladen wurde.
        </Text>
      </Stack>
      {authConfig.devLogin ? (
        <DevLogin>
          {TEST_ACCOUNTS.map((account) => (
            <Button
              key={account.key}
              label={DEV_LABELS[account.key]}
              variant="secondary"
              full
              disabled={busy}
              onPress={() => run(() => signInWithTestAccount(account.key))}
              testID={`login-dev-${account.key}`}
            />
          ))}
        </DevLogin>
      ) : null}
    </Stack>
  );

  return (
    <Screen
      testID="login-screen"
      maxWidth={isPhone ? undefined : 480}
      clearFab={false}
      scroll={false}
      style={{ flex: 1, justifyContent: 'center' }}
    >
      {isPhone ? content : <Surface padding={36}>{content}</Surface>}
    </Screen>
  );
}

function DevLogin(props: { children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text variant="sectionLabel" color="muted">
        Nur lokal: Testkonten
      </Text>
      {props.children}
    </View>
  );
}
