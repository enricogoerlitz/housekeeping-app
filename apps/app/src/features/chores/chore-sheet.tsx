import {
  completeChore,
  deleteChore,
  postponeChore,
  skipChore,
  snapshot,
  updateChore,
  useChoreEvents,
  useCurrentMember,
  useMembers,
  useMembersById,
  useToday,
} from '@housekeeping/api';
import {
  asksForPushPermission,
  choreDraftErrors,
  choreDraftFrom,
  choreFieldsOf,
  choreNextDate,
  postponedNotice,
  postponeOptions,
  seasonLabel,
  withTime,
  type Chore,
  type ChoreDraftErrors,
  type ChoreEvent,
  type ISODate,
  type PostponeOption,
} from '@housekeeping/core';
import {
  Avatar,
  Button,
  Icon,
  IconButton,
  Menu,
  Notice,
  Row,
  Sheet,
  Stack,
  Surface,
  Text,
  toast,
  type SheetAction,
} from '@housekeeping/ui';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useEnsureDevicePush } from '@/features/notifications/use-device-push';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';
import { PlanDateCalendar } from '@/lib/plan-date-calendar';

import { ChoreFormFields, useChoreDraft, useChoreTime } from './chore-form';
import { choreFacts, dayWithDate, eventIcon, eventKindLabel } from './chore-labels';
import { useChoreAway } from './use-chore-away';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';

const RECENT_ENTRIES = 3;

type PostponeChoice = PostponeOption['key'] | 'pick';

type SheetActions = { primary: SheetAction; cancel?: SheetAction };

interface ChoreDetailProps {
  chore: Chore;
  onClose: () => void;
  /** „Alle Einträge ›“: the history filtered by this chore (spec 0026, AC-025). */
  onShowEntries: () => void;
}

/** The entries of one chore, newest day first, the later booking first on the same day. */
function recentEntries(events: ChoreEvent[], chore: Chore): ChoreEvent[] {
  return events
    .filter((event) => event.choreId === chore.id)
    .sort(
      (a, b) =>
        b.doneOn.localeCompare(a.doneOn) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
    )
    .slice(0, RECENT_ENTRIES);
}

function EntryLine(props: { event: ChoreEvent; today: ISODate; prefix?: string; testID?: string }) {
  const membersById = useMembersById();
  const member = membersById[props.event.doneBy];
  const day = dayWithDate(props.event.doneOn, props.today);
  return (
    <View
      testID={props.testID}
      accessibilityLabel={`${props.prefix ? `${props.prefix} ` : ''}${day} ${eventKindLabel(props.event)}${member ? ` von ${member.name}` : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <Icon name={eventIcon(props.event)} size={16} color="muted" />
      <Text variant="small" color="muted">
        {props.prefix ? `${props.prefix} ` : ''}
        {day}
        {props.event.kind === 'skipped' ? ' · übersprungen' : ''}
      </Text>
      {member ? <Avatar name={member.name} color={member.color} size="xs" /> : null}
    </View>
  );
}

/**
 * An opened chore (REQ-009): what it is, when it is due next (after trips, spec 0026), the last
 * entries and the actions Erledigt, „Später ▾“, Überspringen, „Bearbeiten ›“, „Alle Einträge ›“
 * and „Löschen“; actions that do not fit the rhythm are left out (spec 0026, REQ-004).
 * „Bearbeiten“ switches the same window to the form, so its size stays (AC-050). Shared by the
 * sheet (phones, „Anstehend“) and the right column of „Alle“ on wide screens (AC-047).
 */
function useChoreDetail(props: ChoreDetailProps): {
  title: string;
  body: ReactNode;
  footer?: ReactNode;
  actions?: SheetActions;
} {
  const { chore } = props;
  const members = useMembers();
  const away = useChoreAway();
  const [picking, setPicking] = useState(false);
  const me = useCurrentMember();
  const today = useToday();
  const events = useChoreEvents();
  const online = useOnlineOnly();
  const ensureDevicePush = useEnsureDevicePush();
  const [editing, setEditing] = useState(false);
  const [draft, update, reset] = useChoreDraft(() => choreDraftFrom(chore, today, me.id));
  const [errors, setErrors] = useState<ChoreDraftErrors>({});
  const time = useChoreTime(chore.dueTime, chore.remindAtDueTime !== false);
  const recent = useMemo(() => recentEntries(events, chore), [events, chore]);
  const asNeeded = chore.recurrence.type === 'asNeeded';

  const withUndo = (action: () => void, message: string) => {
    const restore = snapshot();
    action();
    props.onClose();
    toast.show({ message, actionLabel: 'Rückgängig', onAction: undoAction(restore) });
  };

  const startEditing = () => {
    reset();
    time.reset();
    setErrors({});
    setEditing(true);
  };

  const save = () => {
    const found = choreDraftErrors(draft);
    setErrors(found);
    if (found.title || found.weekdays) return;
    // A new time asks for this device first, inside the tap (spec 0013, AC-007, Decision 26).
    if (
      asksForPushPermission({
        kind: 'time',
        gesture: 'tap',
        before: chore.dueTime,
        after: time.value,
      })
    )
      ensureDevicePush();
    try {
      // No time removes it (✕, AC-025).
      updateChore(chore.id, {
        ...choreFieldsOf(draft, members, chore),
        dueTime: time.value ?? null,
        remindAtDueTime: time.remind,
      });
    } catch (error) {
      setErrors({ title: errorMessage(error, FAILED_MESSAGE) });
      return;
    }
    setEditing(false);
    toast.show({ message: 'Gespeichert' });
  };

  if (editing) {
    return {
      title: 'Aufgabe bearbeiten',
      body: (
        <ChoreFormFields
          draft={draft}
          update={update}
          errors={errors}
          onClearError={(field) => setErrors((current) => ({ ...current, [field]: undefined }))}
          onSubmit={save}
          today={today}
          members={members}
          time={time}
          offlineHint={online.hint}
        />
      ),
      footer: online.hint ? (
        <Text variant="small" color="warn">
          {online.hint}
        </Text>
      ) : undefined,
      actions: {
        primary: {
          label: 'Speichern',
          icon: 'check',
          onPress: save,
          disabled: online.disabled,
          hint: online.hint,
          testID: 'chore-save',
        },
        cancel: {
          label: 'Abbrechen',
          onPress: () => setEditing(false),
          testID: 'chore-edit-cancel',
        },
      },
    };
  }

  const lastDone = recent.find((event) => event.kind === 'done');
  const extra = [chore.room, seasonLabel(chore.activeMonths)].filter(Boolean).join(' · ');
  const next = choreNextDate(chore, today, away);
  const nextText = asNeeded
    ? 'Ohne Termin – bei Bedarf'
    : next
      ? withTime(
          `Nächstes Mal ${chore.recurrence.type === 'flexible' ? 'etwa ' : ''}${dayWithDate(next.date, today)}${next.afterTrip ? ' · nach der Reise' : ''}`,
          chore.dueTime,
        )
      : 'Noch kein Termin';
  // „Zuletzt erledigt“ from the form has no entry, so no avatar (spec 0026, AC-004).
  const lastEntry = lastDone && lastDone.doneOn === chore.lastDoneOn ? lastDone : undefined;
  const canSkip = !asNeeded && chore.recurrence.type !== 'once';
  const postpone = (day: ISODate) => {
    setPicking(false);
    withUndo(() => postponeChore(chore.id, day), postponedNotice(chore, day, today, away));
  };
  const postponeChoices = postponeOptions(chore, today, away);

  return {
    title: chore.title,
    body: (
      <Stack gap={16}>
        <Stack gap={4}>
          <Text testID="chore-facts">{choreFacts(chore, today, away)}</Text>
          {extra ? (
            <Text variant="small" color="muted" testID="chore-extra">
              {extra}
            </Text>
          ) : null}
        </Stack>
        <Stack gap={6}>
          <Text variant="smallStrong" testID="chore-next">
            {nextText}
          </Text>
          {lastEntry ? (
            <EntryLine event={lastEntry} today={today} prefix="Zuletzt" testID="chore-last" />
          ) : (
            <Text variant="small" color="muted" testID="chore-last">
              {chore.lastDoneOn
                ? `Zuletzt ${dayWithDate(chore.lastDoneOn, today)}`
                : 'Noch nie erledigt'}
            </Text>
          )}
          {recent
            .filter((event) => event !== lastEntry)
            .map((event) => (
              <EntryLine
                key={event.id}
                event={event}
                today={today}
                testID={`chore-entry-${event.id}`}
              />
            ))}
        </Stack>
        {online.hint ? <Notice icon="wifi-off" text={online.hint} /> : null}
        <Row wrap gap={8}>
          <Button
            label="Erledigt"
            icon="check"
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => withUndo(() => completeChore(chore.id), `„${chore.title}“ erledigt`)}
            testID="chore-done"
          />
          {asNeeded ? null : online.disabled ? (
            <Button
              label="Später"
              icon="alarm-clock"
              variant="secondary"
              disabled
              hint={online.hint}
              testID="chore-postpone"
            />
          ) : (
            <Menu<PostponeChoice>
              label="Später"
              icon="alarm-clock"
              accessibilityLabel="Später: auf welchen Tag?"
              options={[
                ...postponeChoices.map((option) => ({ value: option.key, label: option.label })),
                { value: 'pick' as const, label: 'Datum …' },
              ]}
              onChange={(choice) => {
                if (choice === 'pick') {
                  setPicking(true);
                  return;
                }
                const option = postponeChoices.find((entry) => entry.key === choice);
                if (option) postpone(option.date);
              }}
              testID="chore-postpone"
            />
          )}
          {canSkip ? (
            <Button
              label="Überspringen"
              icon="arrow-right"
              variant="ghost"
              disabled={online.disabled}
              hint={online.hint ?? 'Wird als übersprungen verbucht, nicht als erledigt'}
              onPress={() => withUndo(() => skipChore(chore.id), 'Übersprungen')}
              testID="chore-skip"
            />
          ) : null}
        </Row>
        {picking && !online.disabled ? (
          <PlanDateCalendar
            month={next && next.date > today ? next.date : today}
            today={today}
            isDisabled={(date) => date < today}
            onSelect={postpone}
            testID="chore-postpone-calendar"
          />
        ) : null}
        <Row wrap gap={8} justify="space-between">
          <Button
            label="Bearbeiten ›"
            variant="link"
            disabled={online.disabled}
            hint={online.hint}
            onPress={startEditing}
            testID="chore-edit"
          />
          <Button
            label="Alle Einträge ›"
            variant="link"
            onPress={props.onShowEntries}
            testID="chore-entries"
          />
          <Button
            label="Löschen"
            icon="trash"
            variant="link"
            disabled={online.disabled}
            hint={online.hint ?? 'Der Verlauf bleibt'}
            onPress={() => withUndo(() => deleteChore(chore.id), `„${chore.title}“ gelöscht`)}
            testID="chore-delete"
          />
        </Row>
      </Stack>
    ),
  };
}

/** The opened chore as a window (phones, and „Anstehend“ on wide screens). */
export function ChoreSheet(props: ChoreDetailProps) {
  const detail = useChoreDetail(props);
  return (
    <Sheet
      visible
      onClose={props.onClose}
      title={detail.title}
      footer={detail.footer}
      actions={detail.actions}
      testID="chore-sheet"
      size="m"
    >
      {detail.body}
    </Sheet>
  );
}

/** The opened chore in the right column of „Alle“ on wide screens (AC-047). */
export function ChorePanel(props: ChoreDetailProps) {
  const detail = useChoreDetail(props);
  return (
    <Surface testID="chore-panel" padding={20} style={{ gap: 18 }}>
      <Row gap={12}>
        <Text variant="heading" heading style={{ flex: 1, minWidth: 0 }} testID="chore-panel-title">
          {detail.title}
        </Text>
        <IconButton icon="x" label="Schließen" onPress={props.onClose} testID="chore-panel-close" />
      </Row>
      {detail.body}
      {detail.actions ? (
        <Stack gap={6}>
          {detail.footer}
          <PanelActions actions={detail.actions} />
        </Stack>
      ) : (
        detail.footer
      )}
    </Surface>
  );
}

/** The panel has no window header, so its actions sit at the bottom side by side. */
function PanelActions(props: { actions: SheetActions }) {
  const { primary, cancel } = props.actions;
  return (
    <Row gap={8}>
      {cancel ? (
        <View style={{ flex: 1 }}>
          <Button
            label={cancel.label}
            variant="secondary"
            full
            onPress={cancel.onPress}
            disabled={cancel.disabled}
            hint={cancel.hint}
            icon={cancel.icon}
            testID={cancel.testID}
          />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Button
          label={primary.label}
          full
          onPress={primary.onPress}
          disabled={primary.disabled}
          hint={primary.hint}
          icon={primary.icon}
          testID={primary.testID}
        />
      </View>
    </Row>
  );
}
