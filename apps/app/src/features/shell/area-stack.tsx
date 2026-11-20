import { useTheme } from '@housekeeping/ui';
import { Stack } from 'expo-router';

/**
 * The stack inside one tab (spec 0005, REQ-001): detail pages open on top of the tab's first page,
 * so the tab bar and the sidebar stay. Each layout sets its first page as the anchor, so a deep
 * link has it underneath and a second tap on the tab leads back to it.
 */
export function AreaStack() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}
    />
  );
}
