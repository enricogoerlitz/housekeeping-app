import { useAppView, useSyncState } from '@housekeeping/api';
import type { AppView, Origin } from '@housekeeping/core';
import {
  Fab,
  OfflineBanner,
  TAB_BAR_HEIGHT,
  TabBar,
  useBottomInset,
  useBreakpoint,
  useKeyboard,
  useTheme,
  type NavItem,
} from '@housekeeping/ui';
import { Tabs, useSegments } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Platform, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSidebar } from '@/features/shell/app-sidebar';
import { OFFLINE_BANNER_TEXT } from '@/features/shell/offline';
import { InstallHint, useInstallHintVisible } from '@/features/shell/install-hint';
import { phoneTabOptions } from '@/features/shell/stack-transition';
import { UpdateBanner, useUpdateBannerVisible } from '@/features/shell/update-banner';
import { useAssistant } from '@/lib/assistant';
import { features } from '@/lib/features';
import { useActiveSection, usePressSection } from '@/lib/url-state';

// The keys stay the test ids of the tab bar and the sidebar (`tab-rezepte`, `nav-liste`); the
// areas with their own stack are route groups, so their pages keep their addresses.
const NAV: NavItem[] = [
  { key: 'index', label: 'Übersicht', icon: 'sun', tone: 'essen' },
  { key: 'rezepte', label: 'Essen', icon: 'utensils', tone: 'essen' },
  { key: 'kalender', label: 'Kalender', icon: 'calendar-days', tone: 'plan' },
  { key: 'liste', label: 'Liste', icon: 'shopping-basket', tone: 'liste' },
  { key: 'haushalt', label: 'Haushalt', icon: 'list-checks', tone: 'haushalt' },
];

/**
 * Spec 0067, REQ-001 (decision 35): "KI zuerst" puts the agent in the middle, "AI Agent" in its own tone
 * (AC-001); "Haushalt" moves to the top of ⊞ (manageGroups).
 */
const NAV_AI_FIRST: NavItem[] = [
  NAV[0]!,
  NAV[1]!,
  { key: 'agent', label: 'AI Agent', icon: 'sparkles', tone: 'ki', featured: true },
  NAV[2]!,
  NAV[3]!,
];

const navFor = (view: AppView): NavItem[] => (view === 'ai_first' ? NAV_AI_FIRST : NAV);

const SECTION_OF_KEY: Record<string, Origin> = {
  index: 'uebersicht',
  rezepte: 'essen',
  kalender: 'kalender',
  liste: 'liste',
  haushalt: 'haushalt',
  agent: 'agent',
};
const KEY_OF_SECTION = Object.fromEntries(
  Object.entries(SECTION_OF_KEY).map(([key, section]) => [section, key]),
) as Partial<Record<Origin, string>>;

/** Cooking and store mode cover the tab bar on phones; the sidebar stays (spec 0005, D5). */
const FULL_SCREEN_PAGES = new Set(['kochen', 'einkaufen', 'ki-agent']);

export default function TabsLayout() {
  const { isPhone } = useBreakpoint();
  const theme = useTheme();
  // On phones in the browser the pages outside the tab bar slide like a page in an area's stack
  // (spec 0034, REQ-003); the tabs themselves switch at once.
  const reducedMotion = useReducedMotion();
  const slide = Platform.OS === 'web' && isPhone;
  const tab = slide ? phoneTabOptions(reducedMotion, false) : undefined;
  const page = slide ? phoneTabOptions(reducedMotion, true) : undefined;
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
          {offline ? <OfflineBanner text={OFFLINE_BANNER_TEXT} /> : null}
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
            ...tab,
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Übersicht' }} />
          <Tabs.Screen name="(essen)" options={{ title: 'Essen' }} />
          <Tabs.Screen name="kalender" options={{ title: 'Kalender' }} />
          <Tabs.Screen name="(liste)" options={{ title: 'Liste' }} />
          <Tabs.Screen name="haushalt" options={{ title: 'Haushalt' }} />
          {/* Not in the tab bar: "Verwalten" with its pages, and the personal settings. */}
          <Tabs.Screen name="verwalten" options={{ title: 'Verwalten', ...page }} />
          <Tabs.Screen name="(aktivitaeten)" options={{ title: 'Aktivitäten', ...page }} />
          <Tabs.Screen name="(reisetaschen)" options={{ title: 'Reisetaschen', ...page }} />
          <Tabs.Screen name="reisen" options={{ title: 'Reisen', ...page }} />
          <Tabs.Screen name="(artikel)" options={{ title: 'Artikel', ...page }} />
          <Tabs.Screen name="(maerkte)" options={{ title: 'Märkte & Bereiche', ...page }} />
          <Tabs.Screen name="dauerposten" options={{ title: 'Dauerposten', ...page }} />
          <Tabs.Screen name="ki-agent" options={{ title: 'KI-Agent', ...page }} />
          <Tabs.Screen name="mitglieder" options={{ title: 'Haushalt & Mitglieder', ...page }} />
          <Tabs.Screen name="feedback" options={{ title: 'Feedback', ...page }} />
          <Tabs.Screen name="einstellungen" options={{ title: 'Einstellungen', ...page }} />
        </Tabs>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

function Navigation(props: BottomTabBarProps) {
  const { isPhone } = useBreakpoint();
  const assistant = useAssistant();
  const bottom = useBottomInset();
  // While typing neither the tab bar nor the assistant button take room (spec 0032, AC-001).
  const keyboard = useKeyboard();
  const segments = useSegments();
  const view = useAppView();
  const nav = navFor(view);
  const activeRoute = props.state.routes[props.state.index]?.name ?? 'index';
  // A page opened from another section highlights that one while "Zurück" leads there (spec
  // 0057, REQ-003). A page under "Verwalten" opened from there highlights no tab (spec 0005,
  // AC-054).
  const section = useActiveSection();
  const sectionKey = (section && KEY_OF_SECTION[section]) ?? '';
  // A section outside this view's bar (the agent in "Normal") highlights no tab.
  const activeKey = nav.some((item) => item.key === sectionKey) ? sectionKey : '';
  const pressSection = usePressSection();
  // A section always shows its start page as last left, without detail or window (REQ-005); on
  // that start page a second tap scrolls it to the top (spec 0057, REQ-002).
  const select = (key: string) => {
    const target = SECTION_OF_KEY[key];
    if (target) pressSection(target);
  };

  if (!isPhone) {
    return (
      <AppSidebar
        items={nav}
        activeKey={activeKey}
        onSelect={select}
        // One mark only: an entry under "Verwalten" only while no tab is highlighted (spec 0057,
        // AC-017; spec 0035, K-04).
        activeRoute={activeKey ? '' : activeRoute}
      />
    );
  }
  const page = segments[segments.length - 1] ?? '';
  // In "KI zuerst" the agent is a tab: its page keeps the tab bar (spec 0067, AC-001).
  if (FULL_SCREEN_PAGES.has(page) && !(view === 'ai_first' && page === 'ki-agent')) return null;
  return (
    <View>
      {/* On the list the assistant entry sits in the input bar, so the thumb zone stays free. */}
      {/* A panel at the bottom (the day window) hides it, so it covers none of its controls. */}
      {features.ai && activeKey !== 'liste' && !assistant.buttonHidden && !keyboard.open ? (
        <Fab
          icon="sparkles"
          label="Assistent"
          onPress={() => assistant.open()}
          bottom={TAB_BAR_HEIGHT + bottom + 14}
        />
      ) : null}
      <TabBar items={nav} activeKey={activeKey} onSelect={select} />
    </View>
  );
}
