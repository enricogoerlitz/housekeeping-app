import { signOut, useCurrentMember, useSyncState, useToday } from '@housekeeping/api';
import { dietPreferenceLabel, toISODate } from '@housekeeping/core';
import {
  Avatar,
  Button,
  ChoiceChips,
  List,
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
import { View } from 'react-native';

import { useSignedInEmail } from '@/features/household/household-forms';
import { features } from '@/lib/features';
import { useSettings, type AppearancePreference } from '@/lib/settings';

import { ThemePicker } from './theme-picker';

/**
 * The personal settings behind the avatar (spec 0005, AC-055): profile, appearance, sign-out.
 * Everything about the household is under "Verwalten".
 */
export function SettingsScreen() {
  const router = useRouter();
  const { isWide } = useBreakpoint();

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const left = <ProfileSection />;
  const right = (
    <>
      <AppearanceSection />
      {features.ai ? <AiSection /> : null}
    </>
  );

  return (
    <Screen
      testID="settings"
      clearFab={false}
      header={<ScreenHeader title="Einstellungen" onBack={back} />}
    >
      {isWide ? (
        <View style={{ flexDirection: 'row', gap: 32, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>{left}</View>
          <View style={{ flex: 1, minWidth: 0 }}>{right}</View>
        </View>
      ) : (
        <View>
          {left}
          {right}
        </View>
      )}
    </Screen>
  );
}

function ProfileSection() {
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
          <Button
            label="Abmelden"
            icon="log-out"
            variant="ghost"
            size="sm"
            hint="Meldet dich ab und löscht die Daten auf diesem Gerät"
            onPress={() => void signOut()}
            testID="settings-sign-out"
          />
          <SyncLine />
        </View>
      </Stack>
    </Section>
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
