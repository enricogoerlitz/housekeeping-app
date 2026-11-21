import {
  signOut,
  useCurrentMember,
  useNotificationSettings,
  useSyncState,
  useToday,
} from '@housekeeping/api';
import { dietPreferenceLabel, enabledKindsLabel, toISODate } from '@housekeeping/core';
import {
  Avatar,
  Button,
  ChoiceChips,
  Icon,
  List,
  ListDetail,
  ListRow,
  Screen,
  ScreenHeader,
  Section,
  Stack,
  SwitchRow,
  Text,
  useBreakpoint,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useSignedInEmail } from '@/features/household/household-forms';
import {
  NotificationsContent,
  NotificationsScreen,
} from '@/features/notifications/notifications-screen';
import { ScrollColumn } from '@/features/shell/scroll-column';
import { ownAppVersion } from '@/lib/app-version';
import { features } from '@/lib/features';
import { useSettings, type AppearancePreference } from '@/lib/settings';

import { ThemePicker } from './theme-picker';

export type SettingsSection = 'profile' | 'appearance' | 'ai' | 'notifications';

const SECTION_TITLES: Record<SettingsSection, string> = {
  profile: 'Profil',
  appearance: 'Darstellung',
  ai: 'KI',
  notifications: 'Benachrichtigungen',
};

/**
 * The personal settings behind the avatar (spec 0005, AC-055): profile, appearance, AI,
 * notifications, sign-out. Everything about the household is under "Verwalten". Phones show the
 * sections one below the other and "Benachrichtigungen" as a page of its own; from tablet width
 * the settings are a list with the chosen section beside it (spec 0013, AC-002, Decision 25).
 * `section` is what the route opens: `/einstellungen/benachrichtigungen` → "notifications".
 */
export function SettingsScreen(props: { section?: SettingsSection }) {
  const router = useRouter();
  const { isPhone } = useBreakpoint();
  const [chosen, setChosen] = useState<SettingsSection>(props.section ?? 'profile');

  if (isPhone && props.section === 'notifications') return <NotificationsScreen />;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const header = <ScreenHeader title="Einstellungen" onBack={back} />;

  if (isPhone) {
    return (
      <Screen testID="settings" clearFab={false} header={header}>
        <ProfileSection withSignOut />
        <NotificationsRow onPress={() => router.push('/einstellungen/benachrichtigungen')} />
        <AppearanceSection />
        {features.ai ? <AiSection /> : null}
        <VersionLine />
      </Screen>
    );
  }

  const sections: SettingsSection[] = features.ai
    ? ['profile', 'appearance', 'ai', 'notifications']
    : ['profile', 'appearance', 'notifications'];
  return (
    <Screen
      testID="settings"
      clearFab={false}
      header={header}
      scroll={false}
      style={{ flex: 1, paddingBottom: 0 }}
    >
      <ListDetail
        list={
          <ScrollColumn>
            <Stack gap={16}>
              <SettingsList sections={sections} chosen={chosen} onChoose={setChosen} />
              <VersionLine />
            </Stack>
          </ScrollColumn>
        }
        detail={
          chosen === 'profile' ? (
            <ProfileSection />
          ) : chosen === 'appearance' ? (
            <AppearanceSection />
          ) : chosen === 'ai' ? (
            <AiSection />
          ) : (
            <NotificationsContent />
          )
        }
        placeholder={{ icon: 'settings', title: 'Wähl links eine Einstellung' }}
        testID="settings-split"
      />
    </Screen>
  );
}

/** The list on the left (tablet and desktop): the sections, then "Abmelden". */
function SettingsList(props: {
  sections: SettingsSection[];
  chosen: SettingsSection;
  onChoose: (section: SettingsSection) => void;
}) {
  const settings = useNotificationSettings();
  return (
    <List>
      {props.sections.map((section) => (
        <ListRow
          key={section}
          title={SECTION_TITLES[section]}
          trailing={
            section === 'notifications' && settings ? (
              <Text variant="small" color="muted">
                {enabledKindsLabel(settings)}
              </Text>
            ) : undefined
          }
          selected={section === props.chosen}
          onPress={() => props.onChoose(section)}
          testID={`settings-nav-${section}`}
        />
      ))}
      <ListRow
        title="Abmelden"
        leading={<Icon name="log-out" color="muted" />}
        hint="Meldet dich ab und löscht die Daten auf diesem Gerät"
        onPress={() => void signOut()}
        testID="settings-sign-out"
      />
    </List>
  );
}

/** "Benachrichtigungen · 2 an ›" on phones (AC-001). */
function NotificationsRow(props: { onPress: () => void }) {
  const settings = useNotificationSettings();
  return (
    <Section testID="settings-notifications">
      <List>
        <ListRow
          title="Benachrichtigungen"
          leading={<Icon name="bell" color="muted" />}
          trailing={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {settings ? (
                <Text variant="small" color="muted">
                  {enabledKindsLabel(settings)}
                </Text>
              ) : null}
              <Icon name="chevron-right" color="muted" />
            </View>
          }
          onPress={props.onPress}
          testID="settings-notifications-row"
        />
      </List>
    </Section>
  );
}

function ProfileSection(props: { withSignOut?: boolean }) {
  const me = useCurrentMember();
  const email = useSignedInEmail();
  return (
    <Section title="Profil" testID="settings-profile">
      <Stack gap={12}>
        <List>
          <ListRow
            title={me.name}
            subtitle={[email, `Ernährung: ${dietPreferenceLabel(me.dietPreference)}`]
              .filter(Boolean)
              .join(' · ')}
            leading={<Avatar name={me.name} color={me.color} size="m" />}
            testID="profile-current"
          />
        </List>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* From tablet width "Abmelden" is the last row of the list on the left. */}
          {props.withSignOut ? (
            <Button
              label="Abmelden"
              icon="log-out"
              variant="ghost"
              size="sm"
              hint="Meldet dich ab und löscht die Daten auf diesem Gerät"
              onPress={() => void signOut()}
              testID="settings-sign-out"
            />
          ) : null}
          <SyncLine />
        </View>
      </Stack>
    </Section>
  );
}

/** „Version 2026.12.4“ at the very bottom (spec 0014, AC-021); locally „Version dev“. */
function VersionLine() {
  return (
    <Text variant="caption" color="muted" align="center" testID="settings-version">
      Version {ownAppVersion}
    </Text>
  );
}

/** „Zuletzt abgeglichen: heute, 16:58“ — quiet, only for the curious. */
function SyncLine() {
  const sync = useSyncState();
  const today = useToday();
  if (!sync.lastSyncedAt) return null;
  const at = new Date(sync.lastSyncedAt);
  const time = at.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const day =
    toISODate(at) === today
      ? 'heute'
      : at.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
  return (
    <Text variant="caption" color="muted" testID="sync-last">
      Zuletzt abgeglichen: {day}, {time}
    </Text>
  );
}

function AppearanceSection() {
  const settings = useSettings();
  return (
    <Section title="Darstellung" testID="settings-appearance">
      <Stack gap={14}>
        <ThemePicker />
        <Stack gap={8}>
          <Text variant="smallStrong">Erscheinungsbild</Text>
          <ChoiceChips<AppearancePreference>
            label="Erscheinungsbild"
            value={settings.appearance}
            onChange={(appearance) => settings.update({ appearance })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Hell' },
              { value: 'dark', label: 'Dunkel' },
            ]}
            testID="appearance"
          />
        </Stack>
      </Stack>
    </Section>
  );
}

function AiSection() {
  const settings = useSettings();
  return (
    <Section title="KI" testID="settings-ai">
      <Stack gap={4}>
        <SwitchRow
          label="KI-Suche in Rezepten"
          description="Versteht Suchen wie „was Schnelles mit Tofu“."
          value={settings.aiSearch}
          onValueChange={(aiSearch) => settings.update({ aiSearch })}
          testID="setting-ai-search"
        />
        <SwitchRow
          label="KI-Hilfe beim Anlegen"
          description="Schlägt beim Anlegen von Rezepten und Artikeln Werte vor."
          value={settings.aiAssist}
          onValueChange={(aiAssist) => settings.update({ aiAssist })}
          testID="setting-ai-assist"
        />
        <Text variant="small" color="muted">
          Wird nur auf diesem Gerät gespeichert. Die KI arbeitet nur, wenn du sie einschaltest oder
          fragst.
        </Text>
      </Stack>
    </Section>
  );
}
