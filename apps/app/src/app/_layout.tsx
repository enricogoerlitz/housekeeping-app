import { ThemeProvider, ToastHost, fontAssets, getTheme, useTheme } from '@housekeeping/ui';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { useEffect, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AssistantSheet } from '@/features/assistant/assistant-sheet';
import { AuthGate } from '@/features/auth/auth-gate';
import { ReturnAfterSignIn } from '@/features/auth/return-path';
import { NotificationBridge } from '@/features/notifications/use-notification-open';
import { PortraitHint } from '@/features/shell/portrait-hint';
import { AssistantProvider } from '@/lib/assistant';
import { features } from '@/lib/features';
import { SettingsProvider, useSettings } from '@/lib/settings';
import { PlaceTracker } from '@/lib/url-state';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <Themed>
          <AuthGate>
            <AssistantProvider>
              <Screens />
              <PlaceTracker />
              <ReturnAfterSignIn />
              {/* Web Push: this device's registration at start, a tap on a notification. */}
              <NotificationBridge />
              {/* Without the AI switch the assistant cannot open at all (spec 0005, AC-044). */}
              {features.ai ? <AssistantSheet /> : null}
            </AssistantProvider>
          </AuthGate>
          <ToastHost />
          <PortraitHint />
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
    // The status bar and the area behind it follow the theme without a reload (AC-023).
    paintBrowserChrome(theme.colors.bg, mode);
  }, [theme.colors.bg, mode]);
  // A font that fails to load must not block the app; the system font takes over.
  if (!loaded && !error) return null;
  return (
    <ThemeProvider themeId={themeId} mode={mode}>
      {props.children}
    </ThemeProvider>
  );
}

/** On the web: `theme-color` (the status bar) and the page behind the app in the header colour. */
function paintBrowserChrome(color: string, mode: 'light' | 'dark') {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.documentElement.style.backgroundColor = color;
  document.documentElement.style.colorScheme = mode;
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((meta) => {
    meta.setAttribute('content', color);
    meta.removeAttribute('media');
  });
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
