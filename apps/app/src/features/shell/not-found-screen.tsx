import { Button, EmptyState, Screen } from '@housekeeping/ui';
import { useRouter } from 'expo-router';

/** An address the app does not know, or a page only development builds have (AC-059). */
export function NotFoundScreen() {
  const router = useRouter();
  return (
    <Screen testID="not-found">
      <EmptyState icon="map-pin" title="Nicht gefunden" text="Diese Seite gibt es nicht (mehr).">
        <Button
          label="Zur Übersicht"
          icon="sun"
          onPress={() => router.replace('/')}
          testID="not-found-home"
        />
      </EmptyState>
    </Screen>
  );
}
