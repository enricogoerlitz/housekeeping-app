import { ThemeProvider, ToastHost, fontAssets, getTheme, useTheme } from '@housekeeping/ui';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AssistantSheet } from '@/features/assistant/assistant-sheet';
import { AssistantProvider } from '@/lib/assistant';
import { SettingsProvider, useSettings } from '@/lib/settings';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <Themed>
          <AssistantProvider>
            <Screens />
            <AssistantSheet />
            <ToastHost />
          </AssistantProvider>
        </Themed>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

/**
 * Applies the stored theme. All theme fonts load once at start (theme previews need them too),
 * so switching themes later never unmounts the app.
 */
function Themed(props: { children: ReactNode }) {
  const { themeId, mode } = useSettings();
  const theme = getTheme(themeId, mode);
  const [loaded, error] = useFonts(fontAssets);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.bg).catch(() => undefined);
  }, [theme.colors.bg]);
  // A font that fails to load must not block the app; the system font takes over.
  if (!loaded && !error) return null;
  return (
    <ThemeProvider themeId={themeId} mode={mode}>
      {props.children}
    </ThemeProvider>
  );
}

function Screens() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}
      />
    </View>
  );
}
