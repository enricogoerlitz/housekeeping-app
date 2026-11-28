import { setOffline, useAppView, useOffline } from '@housekeeping/api';
import {
  Icon,
  List,
  ListRow,
  Screen,
  ScreenHeader,
  Section,
  SwitchRow,
  useBreakpoint,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { authConfig } from '@/lib/auth-config';

import { features } from '@/lib/features';

import { manageGroups, SHOWROOM_ENTRY, type ManageEntry } from './manage-entries';
import { useOpenManageEntry } from './navigation';

/**
 * "Verwalten" on phones, behind ⊞ in the header of every tab's first page (spec 0005, AC-054):
 * the same entries and blocks as the sidebar on wider screens.
 */
export function ManageScreen() {
  const router = useRouter();
  const { isWide } = useBreakpoint();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const groups = manageGroups(useAppView(), features.aiAgent);
  return (
    <Screen
      testID="manage-screen"
      clearFab={false}
      header={<ScreenHeader title="Verwalten" onBack={back} />}
    >
      <View style={isWide ? { flexDirection: 'row', gap: 32, flexWrap: 'wrap' } : undefined}>
        {groups.map((group) => (
          <View key={group.key} style={isWide ? { flexBasis: 300, flexGrow: 1 } : undefined}>
            <Section title={group.title} testID={`manage-group-${group.key}`}>
              <List>
                {group.entries.map((entry) => (
                  <EntryRow key={entry.key} entry={entry} />
                ))}
              </List>
            </Section>
          </View>
        ))}
      </View>
      {authConfig.devLogin ? <DevelopmentGroup /> : null}
    </Screen>
  );
}

function EntryRow(props: { entry: ManageEntry }) {
  const open = useOpenManageEntry();
  return (
    <ListRow
      title={props.entry.label}
      leading={<Icon name={props.entry.icon} color="muted" />}
      trailing={<Icon name="chevron-right" size={20} color="muted" />}
      onPress={() => open(props.entry.href)}
      testID={`manage-entry-${props.entry.key}`}
    />
  );
}

/** Only in local development builds (EXPO_PUBLIC_DEV_LOGIN=1, AC-059). */
function DevelopmentGroup() {
  const offline = useOffline();
  return (
    <Section title="Entwicklung" testID="manage-group-dev">
      <List>
        <EntryRow entry={SHOWROOM_ENTRY} />
      </List>
      <View style={{ marginTop: 8 }}>
        <SwitchRow
          label="Offline simulieren"
          description="Kappt die Verbindung zum Server: Lesen und Abhaken gehen weiter."
          value={offline}
          onValueChange={setOffline}
          testID="setting-offline"
        />
      </View>
    </Section>
  );
}
