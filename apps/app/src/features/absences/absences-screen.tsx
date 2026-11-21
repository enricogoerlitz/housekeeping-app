import {
  removeAbsences,
  snapshot,
  useAbsences,
  useMembers,
  useMembersById,
  useToday,
} from '@housekeeping/api';
import {
  absenceStripes,
  dateRangeLabel,
  splitUpcomingPast,
  type AbsenceStripe,
} from '@housekeeping/core';
import {
  EmptyState,
  Icon,
  IconButton,
  List,
  ListRow,
  Screen,
  ScreenHeader,
  Section,
  Text,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';

import { stripeWho } from '@/features/calendar/calendar-data';
import { useBackToManage } from '@/features/manage/navigation';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { AbsenceSheet, AbsenceWho } from './absence-sheet';

/**
 * "Abwesenheiten" (spec 0010, AC-037, AC-038), from the calendar's ⋯ and from "Verwalten":
 * "Kommend" earliest first, "Vergangen" newest first, rows grouped like the stripes.
 */
export function AbsencesScreen() {
  const back = useBackToManage();
  const absences = useAbsences();
  const members = useMembers();
  const membersById = useMembersById();
  const today = useToday();
  const online = useOnlineOnly();
  const [editing, setEditing] = useState<{ stripe?: AbsenceStripe } | undefined>();

  const { upcoming, past } = splitUpcomingPast(absenceStripes(absences, members), today);

  const remove = (stripe: AbsenceStripe) => {
    const restore = snapshot();
    try {
      removeAbsences(stripe.absenceIds);
    } catch {
      toast.show({ message: 'Hat nicht geklappt – bitte noch einmal versuchen' });
      return;
    }
    toast.show({
      message: 'Abwesenheit gelöscht',
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
      duration: 5000,
    });
  };

  const row = (stripe: AbsenceStripe) => {
    const who = stripeWho(stripe, membersById);
    const year = stripe.to.slice(0, 4) === today.slice(0, 4) ? '' : ` ${stripe.to.slice(0, 4)}`;
    return (
      <ListRow
        key={stripe.key}
        testID={`absence-${stripe.absenceIds[0] ?? ''}`}
        title={who}
        subtitle={[`${dateRangeLabel(stripe.from, stripe.to)}${year}`, stripe.note]
          .filter(Boolean)
          .join(' · ')}
        leading={
          stripe.household ? <Icon name="house" color="muted" /> : <AbsenceWho stripe={stripe} />
        }
        onPress={online.disabled ? undefined : () => setEditing({ stripe })}
        trailing={
          <IconButton
            icon="trash"
            label={`Abwesenheit von ${who} löschen`}
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => remove(stripe)}
            testID={`absence-${stripe.absenceIds[0] ?? ''}-remove`}
          />
        }
      />
    );
  };

  return (
    <Screen
      testID="absences-screen"
      clearFab={false}
      header={
        <ScreenHeader
          title="Abwesenheiten"
          onBack={back}
          right={
            <IconButton
              icon="plus"
              label="Abwesenheit eintragen"
              variant="soft"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => setEditing({})}
              testID="absence-new"
            />
          }
        />
      }
    >
      {online.hint ? (
        <Text variant="small" color="warn" style={{ marginBottom: 12 }}>
          {online.hint}
        </Text>
      ) : null}
      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState
          icon="calendar-off"
          title="Niemand ist weg"
          text="Tragt Dienstreisen oder Urlaub ein: Wer weg ist, fehlt bei „Wer isst mit?“."
          testID="absence-empty"
        />
      ) : (
        <>
          <Section title="Kommend" testID="absences-upcoming">
            {upcoming.length === 0 ? (
              <Text color="muted">Nichts geplant.</Text>
            ) : (
              <List testID="absence-list">{upcoming.map(row)}</List>
            )}
          </Section>
          {past.length > 0 ? (
            <Section title="Vergangen" testID="absences-past">
              <List>{past.map(row)}</List>
            </Section>
          ) : null}
        </>
      )}
      {editing ? (
        <AbsenceSheet stripe={editing.stripe} onClose={() => setEditing(undefined)} />
      ) : null}
    </Screen>
  );
}
