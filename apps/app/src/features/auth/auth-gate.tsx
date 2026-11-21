import { onWriteRejected, startAuth, useAuth, useSyncState } from '@housekeeping/api';
import { Text, toast, useTheme } from '@housekeeping/ui';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';

import { signOutDevicePush } from '@/features/notifications/device-push';
import { ownAppVersion } from '@/lib/app-version';
import { authConfig } from '@/lib/auth-config';

import { LoginScreen } from './login-screen';
import { NoHouseholdScreen } from './no-household-screen';

/**
 * Between the theme and the app: nothing of the app renders without a session and a household
 * (the tabs read the current member and the active household).
 */
export function AuthGate(props: { children: ReactNode }) {
  const auth = useAuth();
  const sync = useSyncState();

  useEffect(() => {
    // Sign-out unsubscribes this browser from push, also offline (spec 0013, AC-042).
    startAuth(authConfig, { beforeSignOut: signOutDevicePush, appVersion: ownAppVersion });
  }, []);

  // A write the server refused (AC-019): one calm toast, app-wide.
  useEffect(() => onWriteRejected((message) => toast.show({ message })), []);

  if (auth.status === 'loading') return <Splash />;
  if (auth.status === 'signedOut') return <LoginScreen error={auth.error} />;
  if (!sync.ready) {
    // Never pulled yet (idle before the first pull starts): wait. Otherwise there is no
    // household on this device: none yet, offline without a cache, or the load failed.
    const firstPull =
      sync.lastSyncedAt === undefined && (sync.status === 'syncing' || sync.status === 'idle');
    return firstPull ? <Splash /> : <NoHouseholdScreen />;
  }
  return <>{props.children}</>;
}

function Splash() {
  const theme = useTheme();
  return (
    <View
      testID="auth-splash"
      accessibilityLabel="Wird geladen"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.bg,
      }}
    >
      <Text variant="heading" color="muted">
        Housekeeping
      </Text>
    </View>
  );
}
