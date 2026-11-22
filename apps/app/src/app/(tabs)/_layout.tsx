import { useSyncState } from '@housekeeping/api';
import {
  Fab,
  OfflineBanner,
  TAB_BAR_HEIGHT,
  TabBar,
  useBreakpoint,
  useTheme,
  type NavItem,
} from '@housekeeping/ui';
import { Tabs, useSegments } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSidebar } from '@/features/shell/app-sidebar';
import { InstallHint, useInstallHintVisible } from '@/features/shell/install-hint';
import { UpdateBanner, useUpdateBannerVisible } from '@/features/shell/update-banner';
import { useAssistant } from '@/lib/assistant';
import { features } from '@/lib/features';

// The keys stay the test ids of the tab bar and the sidebar (`tab-rezepte`, `nav-liste`); the
// areas with their own stack are route groups, so their pages keep their addresses.
const NAV: NavItem[] = [
  { key: 'index', label: 'Übersicht', icon: 'sun', tone: 'essen' },
  { key: 'rezepte', label: 'Essen', icon: 'utensils', tone: 'essen' },
  { key: 'kalender', label: 'Kalender', icon: 'calendar-days', tone: 'plan' },
  { key: 'liste', label: 'Liste', icon: 'shopping-basket', tone: 'liste' },
  { key: 'haushalt', label: 'Haushalt', icon: 'list-checks', tone: 'haushalt' },
];

const ROUTE_OF_KEY: Record<string, string> = {
  index: 'index',
  rezepte: '(essen)',
  kalender: 'kalender',
  liste: '(liste)',
  haushalt: 'haushalt',
};
const KEY_OF_ROUTE = Object.fromEntries(
  Object.entries(ROUTE_OF_KEY).map(([key, route]) => [route, key]),
);

/** Cooking and store mode cover the tab bar on phones; the sidebar stays (spec 0005, D5). */
const FULL_SCREEN_PAGES = new Set(['kochen', 'einkaufen']);

export default function TabsLayout() {
  const { isPhone } = useBreakpoint();
  const theme = useTheme();
  // No network: not the version lock, which disables editing too but has its own hint.
  const offline = useSyncState().status === 'offline';
  const insets = useSafeAreaInsets();
  const showInstallHint = useInstallHintVisible();
  const showUpdate = useUpdateBannerVisible();
  const banner = offline || showInstallHint || showUpdate;
  return (
    // In landscape the notch and the rounded corners sit left and right (spec 0019, REQ-008).
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.bg,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      {banner ? (
        <View
          style={{
            paddingTop: insets.top + 6,
            paddingHorizontal: isPhone ? theme.shape.gutter : 36,
            paddingBottom: 2,
            gap: 6,
          }}
        >
          {offline ? <OfflineBanner /> : null}
          <UpdateBanner />
          <InstallHint />
        </View>
      ) : null}
      {/* The banner already keeps the status bar clear; the pages below must not do it again. */}
      <SafeAreaInsetsContext.Provider
        value={{ ...insets, top: banner ? 0 : insets.top, left: 0, right: 0 }}
      >
        <Tabs
          tabBar={(props) => <Navigation {...props} />}
          // "Zurück" from a page under "Verwalten" or the settings returns to the tab it was opened
          // from (spec 0005, AC-054).
          backBehavior="history"
          screenOptions={{
            headerShown: false,
            tabBarPosition: isPhone ? 'bottom' : 'left',
            sceneStyle: { backgroundColor: theme.colors.bg },
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Übersicht' }} />
          <Tabs.Screen name="(essen)" options={{ title: 'Essen' }} />
          <Tabs.Screen name="kalender" options={{ title: 'Kalender' }} />
          <Tabs.Screen name="(liste)" options={{ title: 'Liste' }} />
          <Tabs.Screen name="haushalt" options={{ title: 'Haushalt' }} />
          {/* Not in the tab bar: "Verwalten" with its pages, and the personal settings. */}
          <Tabs.Screen name="verwalten" options={{ title: 'Verwalten' }} />
          <Tabs.Screen name="(reisetaschen)" options={{ title: 'Reisetaschen' }} />
          <Tabs.Screen name="reisen" options={{ title: 'Reisen' }} />
          <Tabs.Screen name="(artikel)" options={{ title: 'Artikel' }} />
          <Tabs.Screen name="(maerkte)" options={{ title: 'Märkte & Bereiche' }} />
          <Tabs.Screen name="mitglieder" options={{ title: 'Haushalt & Mitglieder' }} />
          <Tabs.Screen name="feedback" options={{ title: 'Feedback' }} />
          <Tabs.Screen name="einstellungen" options={{ title: 'Einstellungen' }} />
        </Tabs>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

function Navigation(props: BottomTabBarProps) {
  const { isPhone } = useBreakpoint();
  const assistant = useAssistant();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const activeRoute = props.state.routes[props.state.index]?.name ?? 'index';
  // A page outside the five areas highlights no tab (AC-002, AC-054).
  const activeKey = KEY_OF_ROUTE[activeRoute] ?? '';
  const select = (key: string) => {
    const route = props.state.routes.find((candidate) => candidate.name === ROUTE_OF_KEY[key]);
    if (!route) return;
    // A tab with its own stack goes back to its first page on a second tap.
    const event = props.emitter.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (event.defaultPrevented) return;
    props.navigateToTab(route.key);
  };

  if (!isPhone) {
    return (
      <AppSidebar items={NAV} activeKey={activeKey} onSelect={select} activeRoute={activeRoute} />
    );
  }
  if (FULL_SCREEN_PAGES.has(segments[segments.length - 1] ?? '')) return null;
  return (
    <View>
      {/* On the list the assistant entry sits in the input bar, so the thumb zone stays free. */}
      {/* A panel at the bottom (the day window) hides it, so it covers none of its controls. */}
      {features.ai && activeKey !== 'liste' && !assistant.buttonHidden ? (
        <Fab
          icon="sparkles"
          label="Assistent"
          onPress={() => assistant.open()}
          bottom={TAB_BAR_HEIGHT + insets.bottom + 14}
        />
      ) : null}
      <TabBar items={NAV} activeKey={activeKey} onSelect={select} />
    </View>
  );
}
