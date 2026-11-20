import {
  resetState,
  setCurrentMember,
  setOffline,
  snapshot,
  switchHousehold,
  useActiveHouseholdId,
  useCurrentMember,
  useHouseholdsMap,
  useMembers,
  useOffline,
} from '@housekeeping/api';
import { dietPreferenceLabel } from '@housekeeping/core';
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
      <DemoSection />
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
  const members = useMembers();
  const other = members.find((member) => member.id !== me.id);
  return (
    <Section title="Profil" testID="settings-profile">
      <Stack gap={12}>
        <List>
          <ListRow
            title={me.name}
            subtitle={`Ernährung: ${dietPreferenceLabel(me.dietPreference)}`}
            leading={<Avatar name={me.name} color={me.color} size="m" />}
            testID="profile-current"
          />
        </List>
        {other ? (
          <Button
            label={`Als ${other.name} ansehen`}
            icon="users"
            variant="secondary"
            size="sm"
            hint="Nur in der Vorschau: zeigt die App aus Sicht des anderen Mitglieds"
            onPress={() => {
              setCurrentMember(other.id);
              toast.show({ message: `Du siehst die App jetzt als ${other.name}` });
            }}
            testID="switch-member"
          />
        ) : null}
      </Stack>
    </Section>
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

function DemoSection() {
  const offline = useOffline();
  return (
    <Section title="Demo" testID="settings-demo">
      <Stack gap={10}>
        <SwitchRow
          label="Offline simulieren"
          description="Zeigt, was ohne Netz geht: Lesen und Abhaken."
          value={offline}
          onValueChange={setOffline}
          testID="setting-offline"
        />
        <Button
          label="Demo zurücksetzen"
          icon="refresh-cw"
          variant="ghost"
          size="sm"
          onPress={() => {
            const restore = snapshot();
            resetState();
            toast.show({
              message: 'Beispieldaten zurückgesetzt',
              actionLabel: 'Rückgängig',
              onAction: restore,
            });
          }}
          testID="demo-reset"
        />
        <Text variant="small" color="muted">
          Diese Version zeigt Beispieldaten. Änderungen gehen beim Neuladen verloren.
        </Text>
      </Stack>
    </Section>
  );
}
