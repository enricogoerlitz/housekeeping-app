import { Button, EmptyState, Screen } from '@housekeeping/ui';
import { useRouter } from 'expo-router';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <Screen testID="not-found">
      <EmptyState icon="map-pin" title="Nicht gefunden" text="Diese Seite gibt es nicht (mehr).">
        <Button
          label="Zu „Heute“"
          icon="sun"
          onPress={() => router.replace('/')}
          testID="not-found-home"
        />
      </EmptyState>
    </Screen>
  );
}
