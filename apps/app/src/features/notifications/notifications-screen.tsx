import { useOffline } from '@housekeeping/api';
import { Screen, ScreenHeader } from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { DeviceSection, DevicesSection } from './device-section';
import { KindsSection } from './kinds-section';
import { useThisDevice } from './use-device-push';

/**
 * The content of "Benachrichtigungen" (spec 0013, REQ-001): "Dieses Gerät", "Was und wann" and
 * "Deine Geräte". On phones a page of its own, from tablet width the detail next to the list of
 * settings (AC-002).
 */
export function NotificationsContent() {
  const offline = useOffline();
  const device = useThisDevice();
  return (
    <View testID="notifications">
      <DeviceSection device={device} offline={offline} />
      <KindsSection />
      <DevicesSection device={device} />
    </View>
  );
}

/** The page on phones, with "‹ Einstellungen" (Decision 25). */
export function NotificationsScreen() {
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/einstellungen'));
  return (
    <Screen
      testID="notifications-screen"
      clearFab={false}
      header={
        <ScreenHeader
          title="Benachrichtigungen"
          onBack={back}
          backLabel="Einstellungen"
          testID="notifications-title"
        />
      }
    >
      <NotificationsContent />
    </Screen>
  );
}
