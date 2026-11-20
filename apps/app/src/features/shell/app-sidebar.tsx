import { setOffline, useCurrentMember, useHousehold, useOffline } from '@housekeeping/api';
import {
  Avatar,
  Button,
  Divider,
  Icon,
  icons,
  Sheet,
  SIDEBAR_WIDTH,
  Stack,
  SwitchRow,
  Text,
  useTheme,
  type IconName,
  type NavItem,
} from '@housekeeping/ui';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateHouseholdForm } from '@/features/household/household-forms';
import { HouseholdList } from '@/features/household/members-screen';
import { MANAGE_GROUPS, SHOWROOM_ENTRY } from '@/features/manage/manage-entries';
import { useOpenManageEntry } from '@/features/manage/navigation';
import { authConfig } from '@/lib/auth-config';
import { useAssistant } from '@/lib/assistant';
import { features } from '@/lib/features';

// The sidebar of tablets and desktops (spec 0005, REQ-010; concept 3.12): household name with ▾,
// the five areas, the always visible group "Verwalten" in three blocks, in development builds
// "Entwicklung", and the avatar for the personal settings at the bottom. On a low window only the
// part between the areas and the avatar scrolls (AC-053). Drawn here rather than with the ui
// `Sidebar`, which has no groups and always shows the assistant; it can move into packages/ui
// once the shell components there take groups.

export interface AppSidebarProps {
  items: NavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** Tab route that is open, to highlight its "Verwalten" entry and the avatar. */
  activeRoute: string;
}

export function AppSidebar(props: AppSidebarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const household = useHousehold();
  const assistant = useAssistant();
  const open = useOpenManageEntry();
  const c = theme.colors;
  const pillTheme = theme.shape.tabActive === 'pill';
  const [switching, setSwitching] = useState(false);

  return (
    <View
      style={{
        width: SIDEBAR_WIDTH,
        paddingTop: insets.top + 24,
        paddingBottom: 18,
        backgroundColor: theme.shape.section === 'grouped' ? c.surfaceSunken : c.barBg,
        borderRightWidth: 1,
        borderRightColor: c.border,
      }}
    >
      <View style={{ paddingHorizontal: 14, gap: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${household.name}, Haushalt wechseln`}
          onPress={() => setSwitching(true)}
          testID="sidebar-brand"
          style={(state) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              minHeight: 44,
              paddingHorizontal: 10,
              marginBottom: 12,
              borderRadius: theme.shape.radius.control,
              backgroundColor: (state as { hovered?: boolean }).hovered
                ? c.surfaceSunken
                : 'transparent',
            },
            ring(theme.colors.text, (state as { focused?: boolean }).focused),
          ]}
        >
          <Icon name="house" size={22} color="accent" />
          <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
            {household.name}
          </Text>
          <Icon name="chevron-down" size={18} color="muted" />
        </Pressable>
        <View accessibilityRole="tablist" style={{ gap: 4 }}>
          {props.items.map((item) => {
            const tone = pillTheme && item.tone ? c.tones[item.tone] : undefined;
            return (
              <NavRow
                key={item.key}
                label={item.label}
                icon={item.icon}
                active={item.key === props.activeKey}
                tab
                toneBg={tone?.bg}
                toneFg={tone?.fg}
                onPress={() => props.onSelect(item.key)}
                testID={`nav-${item.key}`}
              />
            );
          })}
        </View>
        {features.ai ? (
          <View style={{ marginTop: 16 }}>
            <Button
              label="Assistent"
              icon="sparkles"
              full
              onPress={() => assistant.open()}
              testID="assistant-open"
            />
          </View>
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1, marginTop: 20 }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
        testID="sidebar-manage"
      >
        <GroupTitle>Verwalten</GroupTitle>
        {MANAGE_GROUPS.map((group, index) => (
          <View key={group.key} style={{ gap: 2 }}>
            {index > 0 ? (
              <View style={{ marginVertical: 8, marginHorizontal: 12 }}>
                <Divider />
              </View>
            ) : null}
            {group.entries.map((entry) => (
              <NavRow
                key={entry.key}
                label={entry.label}
                icon={entry.icon}
                active={entry.route !== undefined && entry.route === props.activeRoute}
                onPress={() => open(entry.href)}
                testID={`nav-manage-${entry.key}`}
              />
            ))}
          </View>
        ))}
        {authConfig.devLogin ? <DevelopmentGroup onOpen={open} /> : null}
      </ScrollView>

      <View style={{ paddingHorizontal: 14, paddingTop: 8 }}>
        <ProfileEntry active={props.activeRoute === 'einstellungen'} />
      </View>

      <Sheet
        visible={switching}
        onClose={() => setSwitching(false)}
        title="Haushalt wechseln"
        testID="household-switch-sheet"
        width={440}
      >
        <Stack gap={16}>
          <HouseholdList testIDPrefix="brand-household" onSwitched={() => setSwitching(false)} />
          <CreateHouseholdForm />
        </Stack>
      </Sheet>
    </View>
  );
}

function ring(color: string, focused: boolean | undefined): ViewStyle | null {
  return focused
    ? { outlineWidth: 2, outlineColor: color, outlineStyle: 'solid', outlineOffset: 2 }
    : null;
}

function GroupTitle(props: { children: string }) {
  return (
    <Text
      variant="caption"
      color="muted"
      style={{ paddingHorizontal: 12, marginBottom: 6, textTransform: 'uppercase' }}
    >
      {props.children}
    </Text>
  );
}

/** One row of the sidebar: an area (role tab) or a page under "Verwalten" (a link). */
function NavRow(props: {
  label: string;
  icon: IconName;
  active: boolean;
  onPress: () => void;
  testID: string;
  /** The five areas are tabs; "Verwalten" entries are links. */
  tab?: boolean;
  toneBg?: string;
  toneFg?: string;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const Glyph = icons[props.icon];
  const activeFg = props.toneFg ?? (c.accent === c.text ? c.text : c.accent);
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole={props.tab ? 'tab' : 'link'}
      accessibilityLabel={props.label}
      accessibilityState={props.tab ? { selected: props.active } : undefined}
      aria-current={!props.tab && props.active ? 'page' : undefined}
      onPress={props.onPress}
      style={(state) => {
        const { hovered, focused } = state as { hovered?: boolean; focused?: boolean };
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            minHeight: props.tab ? 46 : 44,
            paddingHorizontal: 12,
            borderRadius: theme.shape.radius.control,
            backgroundColor: props.active
              ? (props.toneBg ?? c.accentSoft)
              : hovered
                ? c.surfaceSunken
                : 'transparent',
          },
          ring(c.text, focused),
        ];
      }}
    >
      <Glyph
        size={props.tab ? 21 : 19}
        color={props.active ? (props.toneFg ?? c.accent) : c.textMuted}
        strokeWidth={theme.shape.stroke}
      />
      <Text
        variant={props.active ? 'bodyStrong' : 'rowTitle'}
        numberOfLines={1}
        style={{ flex: 1, color: props.active ? activeFg : c.textMuted }}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

/** Only in local development builds (EXPO_PUBLIC_DEV_LOGIN=1, AC-059). */
function DevelopmentGroup(props: { onOpen: (href: Href) => void }) {
  const offline = useOffline();
  return (
    <View style={{ marginTop: 20, gap: 2 }}>
      <GroupTitle>Entwicklung</GroupTitle>
      <NavRow
        label={SHOWROOM_ENTRY.label}
        icon={SHOWROOM_ENTRY.icon}
        active={false}
        onPress={() => props.onOpen(SHOWROOM_ENTRY.href)}
        testID={`nav-manage-${SHOWROOM_ENTRY.key}`}
      />
      <View style={{ paddingHorizontal: 12 }}>
        <SwitchRow
          label="Offline simulieren"
          value={offline}
          onValueChange={setOffline}
          testID="nav-manage-offline"
        />
      </View>
    </View>
  );
}

/** The avatar at the bottom: the personal settings (spec 0005, AC-055). */
function ProfileEntry(props: { active: boolean }) {
  const theme = useTheme();
  const member = useCurrentMember();
  const router = useRouter();
  return (
    <Pressable
      testID="profile-button"
      accessibilityRole="button"
      accessibilityLabel="Profil und Einstellungen"
      onPress={() => router.navigate('/einstellungen')}
      style={(state) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: 8,
          borderRadius: theme.shape.radius.control,
          backgroundColor:
            props.active || (state as { hovered?: boolean }).hovered
              ? theme.colors.surfaceSunken
              : 'transparent',
        },
        ring(theme.colors.text, (state as { focused?: boolean }).focused),
      ]}
    >
      <Avatar name={member.name} color={member.color} size="m" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="smallStrong" numberOfLines={1}>
          {member.name}
        </Text>
        <Text variant="caption" color="muted">
          Einstellungen
        </Text>
      </View>
    </Pressable>
  );
}
