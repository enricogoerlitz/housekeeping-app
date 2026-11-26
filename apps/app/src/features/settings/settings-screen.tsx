import {
  syncNow,
  useCurrentMember,
  useHousehold,
  useHouseholdClock,
  useSyncState,
} from '@housekeeping/api';
import { dietPreferenceLabel, syncRow } from '@housekeeping/core';
import {
  Avatar,
  Button,
  ChoiceChips,
  Icon,
  IconButton,
  List,
  ListDetail,
  ListRow,
  Screen,
  ScreenHeader,
  Section,
  Stack,
  SwitchRow,
  Text,
  toast,
  useBreakpoint,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useSignedInEmail } from '@/features/household/household-forms';
import { useOnlineOnly } from '@/features/shell/offline';
import { ScrollColumn } from '@/features/shell/scroll-column';
import { ownAppVersion } from '@/lib/app-version';
import { features } from '@/lib/features';
import { usePageParams } from '@/lib/url-state';
import { useSettings, type AppearancePreference } from '@/lib/settings';

import { ProfileSheet } from './profile-sheet';
import { useSignOut } from './sign-out';
import { ThemePicker } from './theme-picker';
import { errorMessage } from '@/features/shell/error-message';

export type SettingsSection = 'profile' | 'appearance' | 'ai';

/** The section in the address, `?abschnitt=…` (spec 0019, REQ-014). */
const SECTION_OF_SLUG = {
  profil: 'profile',
  darstellung: 'appearance',
  ki: 'ai',
} as const satisfies Record<string, SettingsSection>;
const SLUG_OF_SECTION = {
  profile: 'profil',
  appearance: 'darstellung',
  ai: 'ki',
} as const satisfies Record<SettingsSection, keyof typeof SECTION_OF_SLUG>;

const SECTION_TITLES: Record<SettingsSection, string> = {
  profile: 'Profil',
  appearance: 'Darstellung',
  ai: 'KI',
};

/**
 * The personal settings behind the avatar (spec 0005, AC-055): profile, appearance, AI, sign-out.
 * Everything about the household is under "Verwalten". Phones show the sections one below the
 * other; from tablet width the settings are a list with the chosen section beside it. Spec 0051:
 * "Benachrichtigungen" is gone with Web Push; notices live behind the bell.
 */
export function SettingsScreen() {
  const router = useRouter();
  const { isPhone } = useBreakpoint();
  const address = usePageParams('einstellungen');
  const slug = address.params.abschnitt;
  const chosen: SettingsSection = slug ? SECTION_OF_SLUG[slug] : 'profile';
  const setChosen = (next: SettingsSection) =>
    address.replace({ abschnitt: next === 'profile' ? undefined : SLUG_OF_SECTION[next] });

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const header = <ScreenHeader title="Einstellungen" onBack={back} />;

  if (isPhone) {
    return (
      <Screen testID="settings" clearFab={false} header={header}>
        <ProfileSection withSignOut />
        <AppearanceSection />
        {features.ai ? <AiSection /> : null}
        <VersionLine />
      </Screen>
    );
  }

  const sections: SettingsSection[] = features.ai
    ? ['profile', 'appearance', 'ai']
    : ['profile', 'appearance'];
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
          ) : (
            <AiSection />
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
  const signOut = useSignOut();
  return (
    <>
      <List>
        {props.sections.map((section) => (
          <ListRow
            key={section}
            title={SECTION_TITLES[section]}
            selected={section === props.chosen}
            onPress={() => props.onChoose(section)}
            testID={`settings-nav-${section}`}
          />
        ))}
        <ListRow
          title="Abmelden"
          leading={<Icon name="log-out" color="muted" />}
          hint="Meldet dich ab und löscht die Daten auf diesem Gerät"
          onPress={signOut.request}
          testID="settings-sign-out"
        />
      </List>
      {signOut.dialog}
    </>
  );
}

function ProfileSection(props: { withSignOut?: boolean }) {
  const me = useCurrentMember();
  const email = useSignedInEmail();
  const signOut = useSignOut();
  const online = useOnlineOnly();
  const address = usePageParams('einstellungen');
  const editing = address.params.fenster === 'profil';
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
            trailing={
              <IconButton
                icon="pencil"
                label="Profil bearbeiten"
                disabled={online.disabled}
                hint={online.hint}
                onPress={() => address.open({ fenster: 'profil' })}
                testID="profile-edit"
              />
            }
            testID="profile-current"
          />
        </List>
        {editing ? (
          <ProfileSheet email={email} onClose={() => address.close({ fenster: undefined })} />
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* From tablet width "Abmelden" is the last row of the list on the left. */}
          {props.withSignOut ? (
            <Button
              label="Abmelden"
              icon="log-out"
              variant="ghost"
              size="sm"
              hint="Meldet dich ab und löscht die Daten auf diesem Gerät"
              onPress={signOut.request}
              testID="settings-sign-out"
            />
          ) : null}
          <SyncLine />
        </View>
        {signOut.dialog}
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

/**
 * „Zuletzt abgeglichen: heute, 16:58 · Jetzt abgleichen“ (spec 0027, REQ-010): a button that sends
 * what waits and then pulls; a second tap while it runs starts nothing. Offline it is greyed out.
 */
function SyncLine() {
  const sync = useSyncState();
  const household = useHousehold();
  const online = useOnlineOnly();
  const [syncing, setSyncing] = useState(false);
  const clock = useHouseholdClock();
  const row = syncRow({
    lastSyncedAt: sync.lastSyncedAt,
    syncing,
    now: clock().now,
    timeZone: household.timeZone,
  });
  const run = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncNow();
    } catch (error) {
      toast.show({
        message: errorMessage(error),
      });
    } finally {
      setSyncing(false);
    }
  };
  return (
    <Button
      label={row.label}
      accessibilityLabel={row.accessibilityLabel}
      variant="link"
      size="sm"
      disabled={online.disabled}
      hint={online.hint}
      onPress={() => void run()}
      testID="sync-last"
    />
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
