import { switchHousehold, useActiveHouseholdId, useHouseholdsMap } from '@housekeeping/api';
import {
  Icon,
  IconButton,
  List,
  ListRow,
  Screen,
  ScreenHeader,
  Section,
  Stack,
  Text,
  toast,
  useBreakpoint,
} from '@housekeeping/ui';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import { CreateHouseholdForm, InviteForm, MemberList, MyInvitations } from './household-forms';
import { DeleteHouseholdBlock, RenameHouseholdSheet } from './household-sheets';

/**
 * "Verwalten" → "Haushalt & Mitglieder" (spec 0005, AC-056): the active household with its
 * members and invitations, invitations to me, and the other households. Moved from the settings;
 * the actions behave as in spec 0003, AC-008 to AC-010.
 */
export function MembersScreen() {
  const { isWide } = useBreakpoint();
  const households = useHouseholdsMap();
  const activeId = useActiveHouseholdId();
  const active = households[activeId]?.household;
  const online = useOnlineOnly();
  const address = usePageParams('mitglieder');
  // "‹ Verwalten", or the page it was opened from with `von` (spec 0031, REQ-036).
  const back = useOriginBack(address.params.von, 'verwalten');
  const renaming = address.params.fenster === 'umbenennen';

  const members = (
    <Section title="Mitglieder" testID="settings-household">
      <Stack gap={14}>
        <MemberList />
        <InviteForm />
        <DeleteHouseholdBlock />
      </Stack>
    </Section>
  );
  const others = (
    <>
      <MyInvitations />
      <Section title="Haushalte" testID="members-households">
        <Stack gap={14}>
          <HouseholdList />
          <CreateHouseholdForm />
        </Stack>
      </Section>
    </>
  );

  return (
    <Screen
      testID="members-screen"
      clearFab={false}
      header={
        <ScreenHeader
          title={active?.name ?? 'Haushalt'}
          kicker="Haushalt & Mitglieder"
          backLabel={back.label}
          onBack={back.back}
          right={
            <IconButton
              icon="pencil"
              label="Haushalt umbenennen"
              variant="soft"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => address.open({ fenster: 'umbenennen' })}
              testID="household-rename"
            />
          }
        />
      }
    >
      {renaming ? (
        <RenameHouseholdSheet onClose={() => address.close({ fenster: undefined })} />
      ) : null}
      {isWide ? (
        <View style={{ flexDirection: 'row', gap: 32, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>{members}</View>
          <View style={{ flex: 1, minWidth: 0, gap: 16 }}>{others}</View>
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          {members}
          {others}
        </View>
      )}
    </Screen>
  );
}

/**
 * Every household of mine; choosing another one switches to it (spec 0003, AC-011). Also in the
 * sidebar's "Haushalt wechseln" (AC-057), there with its own test ids.
 */
export function HouseholdList(props: { testIDPrefix?: string; onSwitched?: () => void }) {
  const households = useHouseholdsMap();
  const activeId = useActiveHouseholdId();
  const prefix = props.testIDPrefix ?? 'household';
  return (
    <List testID={`${prefix}-list`}>
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
                  testID={`${prefix}-${data.household.id}-active`}
                />
              ) : (
                <Text variant="smallStrong" color="accent">
                  Wechseln
                </Text>
              )
            }
            accessibilityLabel={
              active ? `${data.household.name}, aktiv` : `Zu ${data.household.name} wechseln`
            }
            onPress={() => {
              if (active) return;
              switchHousehold(data.household.id);
              toast.show({ message: `Du bist jetzt in „${data.household.name}“` });
              props.onSwitched?.();
            }}
            testID={`${prefix}-${data.household.id}`}
          />
        );
      })}
    </List>
  );
}
