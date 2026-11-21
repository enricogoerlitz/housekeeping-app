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
  choreDraftErrors,
  choreDraftFrom,
  choreFieldsOf,
  seasonLabel,
  withTime,
  type Chore,
  type ChoreDraftErrors,
  type ChoreEvent,
} from '@housekeeping/core';
import {
  Avatar,
  Button,
  Icon,
  IconButton,
  Notice,
  Row,
  Sheet,
  Stack,
  Surface,
  Text,
  toast,
} from '@housekeeping/ui';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useEnsureDevicePush } from '@/features/notifications/use-device-push';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { ChoreFormFields, useChoreDraft, useChoreTime } from './chore-form';
import { choreFacts, dayWithDate, eventIcon, eventKindLabel } from './chore-labels';

const RECENT_ENTRIES = 3;
const NO_DATE_HINT = '„Bei Bedarf“ hat keinen Termin';

interface ChoreDetailProps {
  chore: Chore;
  onClose: () => void;
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

function EntryLine(props: { event: ChoreEvent; prefix?: string; testID?: string }) {
  const membersById = useMembersById();
  const member = membersById[props.event.doneBy];
  return (
    <View
      testID={props.testID}
      accessibilityLabel={`${props.prefix ? `${props.prefix} ` : ''}${dayWithDate(props.event.doneOn)} ${eventKindLabel(props.event)}${member ? ` von ${member.name}` : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <Icon name={eventIcon(props.event)} size={16} color="muted" />
      <Text variant="small" color="muted">
        {props.prefix ? `${props.prefix} ` : ''}
        {dayWithDate(props.event.doneOn)}
        {props.event.kind === 'skipped' ? ' · übersprungen' : ''}
      </Text>
      {member ? <Avatar name={member.name} color={member.color} size="xs" /> : null}
    </View>
  );
}

/**
 * An opened chore (REQ-009): what it is, when it is due next, the last entries and the actions
 * Erledigt, Später, Überspringen, „Bearbeiten ›“ and „Löschen“; „Bearbeiten“ switches the same
 * window to the form, so its size stays (AC-050). Shared by the sheet (phones, „Anstehend“) and
 * the right column of „Alle“ on wide screens (AC-047).
 */
function useChoreDetail(props: ChoreDetailProps): {
  title: string;
  body: ReactNode;
  footer?: ReactNode;
} {
  const { chore } = props;
  const members = useMembers();
  const me = useCurrentMember();
  const today = useToday();
  const events = useChoreEvents();
  const online = useOnlineOnly();
  const ensureDevicePush = useEnsureDevicePush();
  const [editing, setEditing] = useState(false);
  const [draft, update, reset] = useChoreDraft(() => choreDraftFrom(chore, today, me.id));
  const [errors, setErrors] = useState<ChoreDraftErrors>({});
  const time = useChoreTime(chore.dueTime);
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
    const read = time.read();
    if (found.title || found.weekdays || !read.ok) return;
    // A new time asks for this device first, inside the tap (spec 0013, AC-007, Decision 26).
    if (read.time !== undefined && read.time !== chore.dueTime) ensureDevicePush();
    try {
      // An empty field removes the time (✕, AC-025).
      updateChore(chore.id, {
        ...choreFieldsOf(draft, members, chore),
        dueTime: read.time ?? null,
      });
    } catch (error) {
      setErrors({ title: error instanceof Error ? error.message : 'Das hat nicht geklappt.' });
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
      footer: (
        <Stack gap={6}>
          {online.hint ? (
            <Text variant="small" color="warn">
              {online.hint}
            </Text>
          ) : null}
          <Row gap={8}>
            <View style={{ flex: 1 }}>
              <Button
                label="Abbrechen"
                variant="secondary"
                full
                onPress={() => setEditing(false)}
                testID="chore-edit-cancel"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Speichern"
                icon="check"
                full
                onPress={save}
                disabled={online.disabled}
                hint={online.hint}
                testID="chore-save"
              />
            </View>
          </Row>
        </Stack>
      ),
    };
  }

  const lastDone = recent.find((event) => event.kind === 'done');
  const extra = [chore.room, seasonLabel(chore.activeMonths)].filter(Boolean).join(' · ');

  return {
    title: chore.title,
    body: (
      <Stack gap={16}>
        <Stack gap={4}>
          <Text testID="chore-facts">{choreFacts(chore, members)}</Text>
          {extra ? (
            <Text variant="small" color="muted" testID="chore-extra">
              {extra}
            </Text>
          ) : null}
        </Stack>
        <Stack gap={6}>
          <Text variant="smallStrong" testID="chore-next">
            {asNeeded
              ? 'Ohne Termin – bei Bedarf'
              : chore.nextDueOn
                ? withTime(`Nächstes Mal ${dayWithDate(chore.nextDueOn)}`, chore.dueTime)
                : 'Noch kein Termin'}
          </Text>
          {lastDone ? (
            <EntryLine event={lastDone} prefix="Zuletzt" testID="chore-last" />
          ) : (
            <Text variant="small" color="muted" testID="chore-last">
              Noch nie erledigt
            </Text>
          )}
          {recent
            .filter((event) => event !== lastDone)
            .map((event) => (
              <EntryLine key={event.id} event={event} testID={`chore-entry-${event.id}`} />
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
          <Button
            label="Später"
            icon="alarm-clock"
            variant="secondary"
            disabled={online.disabled || asNeeded}
            hint={
              online.hint ?? (asNeeded ? NO_DATE_HINT : 'Verschiebt nur diesen Termin um einen Tag')
            }
            onPress={() => withUndo(() => postponeChore(chore.id), 'Auf morgen verschoben')}
            testID="chore-postpone"
          />
          <Button
            label="Überspringen"
            icon="arrow-right"
            variant="ghost"
            disabled={online.disabled || asNeeded}
            hint={
              online.hint ??
              (asNeeded ? NO_DATE_HINT : 'Wird als übersprungen verbucht, nicht als erledigt')
            }
            onPress={() => withUndo(() => skipChore(chore.id), 'Übersprungen')}
            testID="chore-skip"
          />
        </Row>
        <Row gap={8} justify="space-between">
          <Button
            label="Bearbeiten ›"
            variant="link"
            disabled={online.disabled}
            hint={online.hint}
            onPress={startEditing}
            testID="chore-edit"
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
      {detail.footer}
    </Surface>
  );
}
