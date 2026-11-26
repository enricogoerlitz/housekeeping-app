import { useBreakpoint, useTheme } from '@housekeeping/ui';
import { Stack } from 'expo-router';
import { Stack as JSStack } from 'expo-router/js-stack';
import { Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { phoneStackOptions } from './stack-transition';

/**
 * The stack inside one tab (spec 0005, REQ-001): detail pages open on top of the tab's first page,
 * so the tab bar and the sidebar stay. Each layout sets its first page as the anchor, so a deep
 * link has it underneath and a second tap on the tab leads back to it. On phones in the browser
 * a page slides in and out like on iOS (spec 0034, REQ-003): the web's native stack cannot
 * animate, the JS stack can; wider screens keep the native stack without motion.
 */
export function AreaStack() {
  const theme = useTheme();
  const { isPhone } = useBreakpoint();
  const reducedMotion = useReducedMotion();
  if (Platform.OS === 'web' && isPhone) {
    return (
      <JSStack
        screenOptions={{
          ...phoneStackOptions(reducedMotion),
          cardStyle: { backgroundColor: theme.colors.bg },
        }}
      />
    );
  }
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}
    />
  );
}
