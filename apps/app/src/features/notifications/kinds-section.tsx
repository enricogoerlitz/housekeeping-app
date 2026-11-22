import {
  OfflineError,
  updateNotificationSettings,
  useActiveHouseholdId,
  useHouseholdsMap,
  useNotificationSettingsOf,
  WRITE_REJECTED_MESSAGE,
  type NotificationSettingsPatch,
} from '@housekeeping/api';
import {
  asksForPushPermission,
  DAILY_SUMMARY_PARTS,
  dailySummaryPartLabel,
  isLastSummaryPart,
  kindEnabled,
  kindEnabledPatch,
  kindsScopeNote,
  kindSubtitle,
  notificationsHouseholdId,
  NOTIFICATION_KINDS,
  TIME_FIELD_WORDS,
  toggleSummaryPart,
  type DailySummaryPart,
  type NotificationKind,
  type NotificationSettings,
  type TimeOfDay,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  ChoiceChips,
  Row,
  Section,
  Sheet,
  Stack,
  SwitchRow,
  Text,
  TimeField,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';
import { usePageParams } from '@/lib/url-state';

import { useEnsureDevicePush } from './use-device-push';

// "Was und wann · gilt für alle Geräte" (spec 0013, REQ-004): one switch per kind, the time and
// the parts of the Tagesüberblick behind "›" (Decision 25). The settings are the member's own
// synced row; changing them needs the network.

const KIND_LABELS: Record<NotificationKind, string> = {
  dailySummary: 'Tagesüberblick',
  activitiesEve: 'Aktivitäten am Vortag',
  choreReminders: 'Aufgaben mit Uhrzeit',
  reservationReminders: 'Restaurant-Reservierung',
  entryReminders: 'Erinnerungen an Einträgen',
};

const KIND_IDS: Record<NotificationKind, string> = {
  dailySummary: 'daily-summary',
  activitiesEve: 'activities-eve',
  choreReminders: 'chore-reminders',
  reservationReminders: 'reservation-reminders',
  entryReminders: 'entry-reminders',
};

/** Kinds with a time of their own; the reservation's lead time is set per entry. */
type TimedKind = 'dailySummary' | 'activitiesEve';

function isTimed(kind: NotificationKind): kind is TimedKind {
  return kind === 'dailySummary' || kind === 'activitiesEve';
}

/** Writes the patch; offline or refused, a calm toast instead (the switches are greyed anyway). */
function save(patch: NotificationSettingsPatch, householdId: string): boolean {
  try {
    updateNotificationSettings(patch, householdId);
    return true;
  } catch (error) {
    toast.show({ message: error instanceof OfflineError ? error.message : WRITE_REJECTED_MESSAGE });
    return false;
  }
}

/**
 * Spec 0027, REQ-008: with several households, "Was und wann" chooses whose settings it shows;
 * the choice is `fuer-haushalt` in the address and never switches the household of the app
 * (Decision 7). A foreign or unknown id shows the active household (AC-034).
 */
function useSettingsHousehold(): { householdId: string; choose: (householdId: string) => void } {
  const households = useHouseholdsMap();
  const activeId = useActiveHouseholdId();
  const address = usePageParams('benachrichtigungen');
  return {
    householdId: notificationsHouseholdId(
      address.params['fuer-haushalt'],
      Object.keys(households),
      activeId,
    ),
    choose: (householdId) => address.replace({ 'fuer-haushalt': householdId }),
  };
}

export function KindsSection() {
  const households = useHouseholdsMap();
  const { householdId, choose } = useSettingsHousehold();
  const settings = useNotificationSettingsOf(householdId);
  const online = useOnlineOnly();
  const ensureDevicePush = useEnsureDevicePush();
  const [open, setOpen] = useState<TimedKind>();
  const several = Object.keys(households).length > 1;
  const name = households[householdId]?.household.name ?? '';

  return (
    <Section
      title={several ? 'Was und wann' : 'Was und wann · gilt für alle Geräte'}
      testID="notif-kinds"
    >
      {several ? (
        <Stack gap={6} style={{ marginBottom: 12 }}>
          <ChoiceChips<string>
            label="Haushalt der Einstellungen"
            value={householdId}
            onChange={choose}
            options={Object.values(households).map((data) => ({
              value: data.household.id,
              label: data.household.name,
            }))}
            testID="notif-household"
          />
          <Text variant="small" color="muted" testID="notif-household-note">
            {kindsScopeNote(name)}
          </Text>
        </Stack>
      ) : null}
      {settings ? (
        <Stack gap={4}>
          {NOTIFICATION_KINDS.map((kind) => {
            const label = KIND_LABELS[kind];
            const common = {
              label,
              description: kindSubtitle(settings, kind),
              value: kindEnabled(settings, kind),
              disabled: online.disabled,
              testID: `notif-kind-${KIND_IDS[kind]}`,
              onValueChange: (on: boolean) => {
                // The browser's question first, inside the tap (Decision 26, AC-007).
                if (asksForPushPermission({ kind: 'switch', on })) ensureDevicePush();
                save(kindEnabledPatch(kind, on), householdId);
              },
            };
            return isTimed(kind) ? (
              <SwitchRow
                key={kind}
                {...common}
                onDetail={() => setOpen(kind)}
                detailLabel={`${label} einstellen`}
              />
            ) : (
              <SwitchRow key={kind} {...common} />
            );
          })}
          {online.hint ? (
            <Text variant="small" color="warn" testID="notif-kinds-offline">
              {online.hint}
            </Text>
          ) : null}
          <Text variant="small" color="muted">
            Während einer Reise kommt nichts.
          </Text>
        </Stack>
      ) : (
        <Text variant="small" color="muted" testID="notif-kinds-loading">
          Deine Einstellungen kommen mit dem nächsten Abgleich.
        </Text>
      )}
      {settings && open ? (
        <KindSheet
          key={`${householdId}-${open}`}
          kind={open}
          settings={settings}
          householdId={householdId}
          offlineHint={online.hint}
          onClose={() => setOpen(undefined)}
        />
      ) : null}
    </Section>
  );
}

/** The time of a kind and, for the Tagesüberblick, its parts (at least one; Decision 25). */
function KindSheet(props: {
  kind: TimedKind;
  settings: NotificationSettings;
  householdId: string;
  offlineHint: string | undefined;
  onClose: () => void;
}) {
  const { kind, settings } = props;
  const daily = kind === 'dailySummary';
  const ensureDevicePush = useEnsureDevicePush();
  const [time, setTime] = useState<TimeOfDay>(
    daily ? settings.dailySummaryAt : settings.activitiesEveAt,
  );
  const [parts, setParts] = useState<DailySummaryPart[]>(settings.dailySummaryParts);

  const submit = () => {
    // Setting a time of a kind that is on asks for this device (Decision 26).
    if (asksForPushPermission({ kind: 'kindTime', kindEnabled: kindEnabled(settings, kind) }))
      ensureDevicePush();
    const saved = save(
      daily ? { dailySummaryAt: time, dailySummaryParts: parts } : { activitiesEveAt: time },
      props.householdId,
    );
    if (saved) props.onClose();
  };

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title={KIND_LABELS[kind]}
      size="m"
      testID="notif-kind-sheet"
      footer={
        <Stack gap={6}>
          {props.offlineHint ? (
            <Text variant="small" color="warn">
              {props.offlineHint}
            </Text>
          ) : null}
          <Button
            label="Speichern"
            icon="check"
            full
            onPress={submit}
            disabled={props.offlineHint !== undefined}
            hint={props.offlineHint}
            testID="notif-kind-save"
          />
        </Stack>
      }
    >
      <Stack gap={20}>
        <TimeField
          label="Uhrzeit"
          {...TIME_FIELD_WORDS}
          value={time}
          // The field is required: "–" is never offered, so a choice always holds a time.
          onChange={(next) => {
            if (next !== undefined) setTime(next);
          }}
          hint={
            daily ? 'Jeden Morgen, wenn es etwas gibt.' : 'Am Abend vor einem Tag mit Aktivitäten.'
          }
          disabled={props.offlineHint !== undefined}
          testID="notif-kind-time"
        />
        {daily ? (
          <Stack gap={8}>
            <Text variant="smallStrong">Was drinsteht</Text>
            <Row wrap gap={8}>
              {DAILY_SUMMARY_PARTS.map((part) => {
                const last = isLastSummaryPart(parts, part);
                return (
                  <Chip
                    key={part}
                    label={dailySummaryPartLabel(part)}
                    selected={parts.includes(part)}
                    onPress={() => setParts(toggleSummaryPart(parts, part))}
                    disabled={props.offlineHint !== undefined}
                    hint={last ? 'Mindestens ein Teil bleibt gewählt' : props.offlineHint}
                    testID={`notif-part-${part}`}
                  />
                );
              })}
            </Row>
            <Text variant="small" color="muted">
              Mindestens ein Teil bleibt gewählt.
            </Text>
          </Stack>
        ) : null}
      </Stack>
    </Sheet>
  );
}
