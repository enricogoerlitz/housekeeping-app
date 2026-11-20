import { useCurrentMember, useHousehold, useOffline } from '@housekeeping/api';
import {
  Avatar,
  Fab,
  OfflineBanner,
  Sidebar,
  TAB_BAR_HEIGHT,
  TabBar,
  Text,
  useBreakpoint,
  useTheme,
  type NavItem,
} from '@housekeeping/ui';
import { Tabs, useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InstallHint, useInstallHintVisible } from '@/features/shell/install-hint';
import { useAssistant } from '@/lib/assistant';

const NAV: NavItem[] = [
  { key: 'index', label: 'Heute', icon: 'sun', tone: 'essen' },
  { key: 'rezepte', label: 'Essen', icon: 'utensils', tone: 'essen' },
  { key: 'plan', label: 'Plan', icon: 'calendar-days', tone: 'plan' },
  { key: 'liste', label: 'Liste', icon: 'shopping-basket', tone: 'liste' },
  { key: 'haushalt', label: 'Haushalt', icon: 'list-checks', tone: 'haushalt' },
];

export default function TabsLayout() {
  const { isPhone } = useBreakpoint();
  const theme = useTheme();
  const offline = useOffline();
  const insets = useSafeAreaInsets();
  const showInstallHint = useInstallHintVisible();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {offline || showInstallHint ? (
        <View
          style={{
            paddingTop: insets.top + 6,
            paddingHorizontal: isPhone ? theme.shape.gutter : 36,
            paddingBottom: 2,
            gap: 6,
          }}
        >
          {offline ? <OfflineBanner /> : null}
          <InstallHint />
        </View>
      ) : null}
      <Tabs
        tabBar={(props) => <Navigation {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarPosition: isPhone ? 'bottom' : 'left',
          sceneStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Heute' }} />
        <Tabs.Screen name="rezepte" options={{ title: 'Essen' }} />
        <Tabs.Screen name="plan" options={{ title: 'Plan' }} />
        <Tabs.Screen name="liste" options={{ title: 'Liste' }} />
        <Tabs.Screen name="haushalt" options={{ title: 'Haushalt' }} />
      </Tabs>
    </View>
  );
}

function Navigation(props: BottomTabBarProps) {
  const { isPhone } = useBreakpoint();
  const household = useHousehold();
  const member = useCurrentMember();
  const assistant = useAssistant();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeKey = props.state.routes[props.state.index]?.name ?? 'index';
  const select = (key: string) => {
    const route = props.state.routes.find((candidate) => candidate.name === key);
    if (!route) return;
    props.navigateToTab(route.key);
  };

  if (!isPhone) {
    return (
      <Sidebar
        brand={household.name}
        onBrandPress={() => router.push('/einstellungen')}
        items={NAV}
        activeKey={activeKey}
        onSelect={select}
        assistantLabel="Assistent"
        onAssistant={() => assistant.open()}
        footer={
          <Pressable
            testID="profile-button"
            accessibilityRole="button"
            accessibilityLabel="Profil und Einstellungen"
            onPress={() => router.push('/einstellungen')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 }}
          >
            <Avatar name={member.name} color={member.color} size="m" />
            <View>
              <Text variant="smallStrong">{member.name}</Text>
              <Text variant="caption" color="muted">
                Profil & Einstellungen
              </Text>
            </View>
          </Pressable>
        }
      />
    );
  }
  return (
    <View>
      {/* On the list the assistant entry sits in the input bar, so the thumb zone stays free. */}
      {activeKey !== 'liste' ? (
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
