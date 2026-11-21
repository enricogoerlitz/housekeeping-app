import { setOffline, useCurrentMember, useHousehold, useOffline } from '@housekeeping/api';
import {
  Avatar,
  Button,
  Sheet,
  Sidebar,
  Stack,
  SwitchRow,
  Text,
  useTheme,
  type NavItem,
  type SidebarGroup,
} from '@housekeeping/ui';
import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { CreateHouseholdForm } from '@/features/household/household-forms';
import { HouseholdList } from '@/features/household/members-screen';
import { MANAGE_GROUPS, SHOWROOM_ENTRY } from '@/features/manage/manage-entries';
import { useOpenManageEntry } from '@/features/manage/navigation';
import { authConfig } from '@/lib/auth-config';
import { useAssistant } from '@/lib/assistant';
import { features } from '@/lib/features';

// The sidebar of tablets and desktops (spec 0005, REQ-010; concept 3.12): household name with ▾,
// the five areas, the always visible group "Verwalten" in three blocks, in development builds
// "Entwicklung", and the avatar for the personal settings at the bottom.

export interface AppSidebarProps {
  items: NavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** Tab route that is open, to highlight its "Verwalten" entry and the avatar. */
  activeRoute: string;
}

export function AppSidebar(props: AppSidebarProps) {
  const household = useHousehold();
  const assistant = useAssistant();
  const offline = useOffline();
  const open = useOpenManageEntry();
  const pathname = usePathname();
  const [switching, setSwitching] = useState(false);

  const groups: SidebarGroup[] = [
    {
      key: 'manage',
      title: 'Verwalten',
      blocks: MANAGE_GROUPS.map((group) =>
        group.entries.map((entry) => ({
          key: entry.key,
          label: entry.label,
          icon: entry.icon,
          active:
            (entry.route !== undefined && entry.route === props.activeRoute) ||
            (entry.pathPrefix !== undefined && pathname.startsWith(entry.pathPrefix)),
          onPress: () => open(entry.href),
          testID: `nav-manage-${entry.key}`,
        })),
      ),
    },
  ];
  // Only in local development builds (EXPO_PUBLIC_DEV_LOGIN=1, AC-059).
  if (authConfig.devLogin) {
    groups.push({
      key: 'development',
      title: 'Entwicklung',
      blocks: [
        [
          {
            key: SHOWROOM_ENTRY.key,
            label: SHOWROOM_ENTRY.label,
            icon: SHOWROOM_ENTRY.icon,
            onPress: () => open(SHOWROOM_ENTRY.href),
            testID: `nav-manage-${SHOWROOM_ENTRY.key}`,
          },
        ],
      ],
      extra: (
        <View style={{ paddingHorizontal: 12 }}>
          <SwitchRow
            label="Offline simulieren"
            value={offline}
            onValueChange={setOffline}
            testID="nav-manage-offline"
          />
        </View>
      ),
    });
  }

  return (
    <>
      <Sidebar
        items={props.items}
        activeKey={props.activeKey}
        onSelect={props.onSelect}
        brand={household.name}
        brandLabel={`${household.name}, Haushalt wechseln`}
        onBrandPress={() => setSwitching(true)}
        belowItems={
          features.ai ? (
            <View style={{ marginTop: 16 }}>
              <Button
                label="Assistent"
                icon="sparkles"
                full
                onPress={() => assistant.open()}
                testID="assistant-open"
              />
            </View>
          ) : null
        }
        groups={groups}
        groupsTestID="sidebar-manage"
        footer={<ProfileEntry active={props.activeRoute === 'einstellungen'} />}
      />
      {/* A sheet, not a menu: next to the households it holds the form for a new one. */}
      <Sheet
        visible={switching}
        onClose={() => setSwitching(false)}
        title="Haushalt wechseln"
        testID="household-switch-sheet"
        size="s"
      >
        <Stack gap={16}>
          <HouseholdList testIDPrefix="brand-household" onSwitched={() => setSwitching(false)} />
          <CreateHouseholdForm />
        </Stack>
      </Sheet>
    </>
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
      style={(state) => {
        const { hovered, focused } = state as { hovered?: boolean; focused?: boolean };
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 8,
            borderRadius: theme.shape.radius.control,
            backgroundColor: props.active || hovered ? theme.colors.surfaceSunken : 'transparent',
          },
          focused
            ? {
                outlineWidth: 2,
                outlineColor: theme.colors.text,
                outlineStyle: 'solid' as const,
                outlineOffset: 2,
              }
            : null,
        ];
      }}
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
