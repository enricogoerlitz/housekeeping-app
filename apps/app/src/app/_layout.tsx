import { ThemeProvider, ToastHost, getTheme, useTheme, useThemeFonts } from '@housekeeping/ui';
import { Stack } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AssistantSheet } from '@/features/assistant/assistant-sheet';
import { AuthGate } from '@/features/auth/auth-gate';
import { ReturnAfterSignIn } from '@/features/auth/return-path';
import { ConfirmHost } from '@/features/shell/confirm-dialog';
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
              {/* Without the AI switch the assistant cannot open at all (spec 0005, AC-044). */}
              {features.ai ? <AssistantSheet /> : null}
            </AssistantProvider>
          </AuthGate>
          {/* "… löschen?" before every delete, over every window (spec 0036, REQ-012). */}
          <ConfirmHost />
          <ToastHost />
          <PortraitHint />
        </Themed>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

/**
 * Applies the stored theme. At start only its fonts load (spec 0058, REQ-006); the app waits for
 * them once. A theme chosen later loads its fonts while the app stays (the picker's preview has
 * usually loaded them already), so switching never unmounts the app.
 */
function Themed(props: { children: ReactNode }) {
  const { themeId, mode } = useSettings();
  const theme = getTheme(themeId, mode);
  const fontsReady = useThemeFonts(theme.fonts);
  const [started, setStarted] = useState(false);
  if (fontsReady && !started) setStarted(true);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.bg).catch(() => undefined);
    // The status bar and the area behind it follow the theme without a reload (AC-023).
    paintBrowserChrome(theme.colors.bg, mode);
  }, [theme.colors.bg, mode]);
  // A font that fails to load does not block the app either; the system font takes over.
  if (!started && !fontsReady) return null;
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
