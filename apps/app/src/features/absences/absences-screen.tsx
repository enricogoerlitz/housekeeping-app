import {
  removeAbsences,
  snapshot,
  useAbsences,
  useMembers,
  useMembersById,
  usePackingItems,
  usePackingListBags,
  useToday,
} from '@housekeeping/api';
import {
  absenceDeleteDialog,
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
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { stripeWho } from '@/features/calendar/calendar-data';
import { useBackToManage } from '@/features/manage/navigation';
import { FAILED } from '@/features/packing/packing-labels';
import { TripConfirmDialog } from '@/features/packing/trip-dialogs';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { AbsenceSheet, AbsenceWho } from './absence-sheet';

/**
 * "Abwesenheiten" (spec 0010, AC-037), from the calendar's ⋯ and from "Verwalten": "Kommend"
 * earliest first, "Vergangen" newest first, rows grouped like the stripes. A tap opens the
 * Urlaubsseite (spec 0012, AC-016). Deleting an absence with a packing list asks first and names
 * it; without one there is 5 s "Rückgängig" (AC-038).
 */
export function AbsencesScreen() {
  const back = useBackToManage();
  const absences = useAbsences();
  const members = useMembers();
  const membersById = useMembersById();
  const today = useToday();
  const listBags = usePackingListBags();
  const items = usePackingItems();
  const online = useOnlineOnly();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<{ stripe: AbsenceStripe; message: string }>();

  const { upcoming, past } = splitUpcomingPast(absenceStripes(absences, members), today);

  const remove = (stripe: AbsenceStripe, confirmed = false) => {
    if (online.disabled) return;
    const message = absenceDeleteDialog(stripe.absenceIds, listBags, items);
    if (message && !confirmed) {
      setDeleting({ stripe, message });
      return;
    }
    setDeleting(undefined);
    const restore = message ? undefined : snapshot();
    try {
      removeAbsences(stripe.absenceIds);
    } catch {
      toast.show({ message: FAILED });
      return;
    }
    toast.show(
      restore
        ? {
            message: 'Abwesenheit gelöscht',
            actionLabel: 'Rückgängig',
            onAction: undoAction(restore),
            duration: 5000,
          }
        : { message: 'Abwesenheit und Packliste gelöscht' },
    );
  };

  // The Urlaubsseite belongs to the calendar: the calendar stays underneath, so its "‹ Kalender"
  // always leads there, whether the calendar was open before or not.
  const open = (stripe: AbsenceStripe) => {
    const id = stripe.absenceIds[0];
    if (id) {
      router.push({ pathname: '/kalender/urlaub/[id]', params: { id } }, { withAnchor: true });
    }
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
        // Reading the Urlaubsseite works offline; editing happens there (✎).
        onPress={() => open(stripe)}
        // Outside the row's press area, so the two buttons do not nest.
        controls={
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
              onPress={() => setCreating(true)}
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
      {creating ? <AbsenceSheet onClose={() => setCreating(false)} /> : null}
      {deleting ? (
        <TripConfirmDialog
          title="Abwesenheit löschen?"
          message={deleting.message}
          confirmLabel="Löschen"
          needsNetwork
          onConfirm={() => remove(deleting.stripe, true)}
          onCancel={() => setDeleting(undefined)}
          testID="absence-delete-dialog"
        />
      ) : null}
    </Screen>
  );
}
