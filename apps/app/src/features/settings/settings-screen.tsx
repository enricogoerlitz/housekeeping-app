import {
  setOffline,
  signOut,
  switchHousehold,
  useActiveHouseholdId,
  useCurrentMember,
  useHouseholdsMap,
  useOffline,
  useSyncState,
  useToday,
} from '@housekeeping/api';
import { dietPreferenceLabel, toISODate } from '@housekeeping/core';
import {
  Avatar,
  Button,
  Icon,
  List,
  ListRow,
  OfflineBanner,
  Screen,
  ScreenHeader,
  Section,
  Segmented,
  Stack,
  SwitchRow,
  Text,
  toast,
  useBreakpoint,
  type IconName,
} from '@housekeeping/ui';
import { useRouter, type Href } from 'expo-router';
import { View } from 'react-native';

import {
  CreateHouseholdForm,
  InviteForm,
  MemberList,
  MyInvitations,
  useSignedInEmail,
} from '@/features/household/household-forms';
import { authConfig } from '@/lib/auth-config';
import { useSettings, type AppearancePreference } from '@/lib/settings';

import { AbsenceSection } from './absence-section';
import { ThemePicker } from './theme-picker';

export function SettingsScreen() {
  const router = useRouter();
  const { isWide } = useBreakpoint();
  const offline = useOffline();

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const left = (
    <>
      <ProfileSection />
      <HouseholdSection />
      <AbsenceSection />
    </>
  );
  const right = (
    <>
      <AppearanceSection />
      <AiSection />
      {authConfig.devLogin ? <DevSection /> : null}
    </>
  );

  return (
    <Screen testID="settings" maxWidth={980} clearFab={false}>
      <ScreenHeader title="Einstellungen" onBack={back} />
      {offline ? (
        <View style={{ marginBottom: 16 }}>
          <OfflineBanner />
        </View>
      ) : null}
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

function LinkRow(props: { title: string; icon: IconName; href: Href; testID: string }) {
  const router = useRouter();
  return (
    <ListRow
      title={props.title}
      leading={<Icon name={props.icon} color="muted" />}
      trailing={<Icon name="chevron-right" size={20} color="muted" />}
      onPress={() => router.push(props.href)}
      testID={props.testID}
    />
  );
}

function HouseholdSection() {
  const households = useHouseholdsMap();
  const activeId = useActiveHouseholdId();
  return (
    <Section title="Haushalt" testID="settings-household">
      <Stack gap={14}>
        <List testID="household-list">
          {Object.values(households).map((data) => {
            const active = data.household.id === activeId;
            const count = data.household.memberIds.length;
            return (
              <ListRow
                key={data.household.id}
                title={data.household.name}
                subtitle={`${count} ${count === 1 ? 'Mitglied' : 'Mitglieder'}${active ? ' · aktiv' : ''}`}
                leading={<Icon name="house" color={active ? 'accent' : 'muted'} />}
                trailing={
                  active ? (
                    <Icon
                      name="check"
                      color="accent"
                      testID={`household-${data.household.id}-active`}
                    />
                  ) : undefined
                }
                accessibilityLabel={
                  active ? `${data.household.name}, aktiv` : `Zu ${data.household.name} wechseln`
                }
                onPress={() => {
                  if (active) return;
                  switchHousehold(data.household.id);
                  toast.show({ message: `Du bist jetzt in „${data.household.name}“` });
                }}
                testID={`household-${data.household.id}`}
              />
            );
          })}
        </List>
        <Stack gap={8}>
          <Text variant="smallStrong">Mitglieder</Text>
          <MemberList />
        </Stack>
        <InviteForm />
        <MyInvitations />
        <CreateHouseholdForm />
        <List>
          <LinkRow
            title="Märkte & Laufreihenfolge"
            icon="store"
            href="/maerkte"
            testID="link-stores"
          />
          <LinkRow
            title="Feedback"
            icon="message-square-plus"
            href="/feedback"
            testID="link-feedback"
          />
          <LinkRow
            title="Showroom (Design-System)"
            icon="palette"
            href="/showroom"
            testID="link-showroom"
          />
        </List>
      </Stack>
    </Section>
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
          <Segmented<AppearancePreference>
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

/** Only in local development builds (EXPO_PUBLIC_DEV_LOGIN=1). */
function DevSection() {
  const offline = useOffline();
  return (
    <Section title="Entwicklung" testID="settings-dev">
      <Stack gap={10}>
        <SwitchRow
          label="Offline simulieren"
          description="Kappt die Verbindung zum Server: Lesen und Abhaken gehen weiter."
          value={offline}
          onValueChange={setOffline}
          testID="setting-offline"
        />
      </Stack>
    </Section>
  );
}
