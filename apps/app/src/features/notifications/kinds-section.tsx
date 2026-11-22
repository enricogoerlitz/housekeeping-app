import {
  OfflineError,
  updateNotificationSettings,
  useHousehold,
  useHouseholdsMap,
  useNotificationSettings,
  WRITE_REJECTED_MESSAGE,
  type NotificationSettingsPatch,
} from '@housekeeping/api';
import {
  asksForPushPermission,
  DAILY_SUMMARY_PARTS,
  dailySummaryPartLabel,
  formatTime,
  isLastSummaryPart,
  kindEnabled,
  kindEnabledPatch,
  kindsSectionTitle,
  kindSubtitle,
  NOTIFICATION_KINDS,
  parseTimeInput,
  toggleSummaryPart,
  type DailySummaryPart,
  type NotificationKind,
  type NotificationSettings,
} from '@housekeeping/core';
import {
  Button,
  Chip,
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
function save(patch: NotificationSettingsPatch): boolean {
  try {
    updateNotificationSettings(patch);
    return true;
  } catch (error) {
    toast.show({ message: error instanceof OfflineError ? error.message : WRITE_REJECTED_MESSAGE });
    return false;
  }
}

export function KindsSection() {
  const settings = useNotificationSettings();
  const households = useHouseholdsMap();
  const household = useHousehold();
  const online = useOnlineOnly();
  const ensureDevicePush = useEnsureDevicePush();
  const [open, setOpen] = useState<TimedKind>();
  const title = kindsSectionTitle(Object.keys(households).length > 1 ? household.name : undefined);

  return (
    <Section title={title} testID="notif-kinds">
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
                save(kindEnabledPatch(kind, on));
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
            Während Abwesenheiten bist du stumm.
          </Text>
        </Stack>
      ) : (
        <Text variant="small" color="muted" testID="notif-kinds-loading">
          Deine Einstellungen kommen mit dem nächsten Abgleich.
        </Text>
      )}
      {settings && open ? (
        <KindSheet
          key={open}
          kind={open}
          settings={settings}
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
  offlineHint: string | undefined;
  onClose: () => void;
}) {
  const { kind, settings } = props;
  const daily = kind === 'dailySummary';
  const ensureDevicePush = useEnsureDevicePush();
  const [text, setText] = useState(
    formatTime(daily ? settings.dailySummaryAt : settings.activitiesEveAt),
  );
  const [error, setError] = useState<string>();
  const [parts, setParts] = useState<DailySummaryPart[]>(settings.dailySummaryParts);

  const submit = () => {
    const read = parseTimeInput(text, { required: true });
    if (!read.ok || read.time === undefined) {
      setError(read.ok ? undefined : read.error);
      return;
    }
    // Setting a time of a kind that is on asks for this device (Decision 26).
    if (asksForPushPermission({ kind: 'kindTime', kindEnabled: kindEnabled(settings, kind) }))
      ensureDevicePush();
    const saved = save(
      daily
        ? { dailySummaryAt: read.time, dailySummaryParts: parts }
        : { activitiesEveAt: read.time },
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
          placeholder={daily ? 'z. B. 7:30' : 'z. B. 19:00'}
          value={text}
          onChangeText={(next) => {
            setText(next);
            setError(undefined);
          }}
          onClear={() => setText('')}
          clearLabel="Uhrzeit leeren"
          emptyLabel="keine Uhrzeit"
          onSubmitEditing={submit}
          error={error}
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
