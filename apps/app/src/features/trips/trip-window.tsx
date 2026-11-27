import {
  removeTrip,
  resetPackingList,
  updateTrip,
  useMembers,
  usePackingList,
  useToday,
  useTrips,
  type TripChanges,
} from '@housekeeping/api';
import {
  packingProgress,
  packingSections,
  startsInLabel,
  stripeOf,
  tripDeleteDialog,
  tripHeader,
  tripCalendarEvent,
  tripPreview,
  validateTripDraft,
  type Id,
  type Trip,
} from '@housekeeping/core';
import {
  AvatarStack,
  Badge,
  Button,
  EmptyState,
  Menu,
  ProgressBar,
  Row,
  Sheet,
  Stack,
  Text,
  toast,
  useBreakpoint,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { AddToCalendar, appLink } from '@/features/calendar/add-to-calendar';
import { FAILED, messageOf } from '@/features/packing/packing-labels';
import { TripAddBagSheet } from '@/features/packing/trip-add-bag-sheet';
import { confirmFirst, ConfirmDialog } from '@/features/shell/confirm-dialog';
import { TripSection } from '@/features/packing/trip-section';
import { useOnlineOnly } from '@/features/shell/offline';
import { usePageParams } from '@/lib/url-state';

import { TripFields, type TripFieldValues } from './trip-sheet';

type TripAction = 'reset' | 'delete';

/** The pages the trip window opens over (spec 0019 appendix, "Reise-Fenster"). */
export type TripWindowPage = 'uebersicht' | 'kalender' | 'reisen' | 'reisetaschen';

/**
 * The open trip window in the address (`?reise=<id>`, spec 0022, REQ-002; spec 0019, REQ-018):
 * every page that shows trips opens it over itself; a reload opens it again. Only a uuid is taken.
 * Opening adds a history entry, so Back closes it like every window (spec 0019, REQ-013).
 */
export function useTripWindow(page: TripWindowPage): {
  tripId: Id | undefined;
  open: (id: Id) => void;
  close: () => void;
} {
  const address = usePageParams(page);
  return {
    tripId: address.params.reise,
    open: (id) => address.open({ reise: id }),
    close: () => address.close({ reise: undefined }),
  };
}

/** Renders the trip window of the address over the current page. */
export function TripWindowHost(props: { page: TripWindowPage }) {
  const { tripId, close } = useTripWindow(props.page);
  return tripId ? <TripWindow key={tripId} tripId={tripId} onClose={close} /> : null;
}

function fieldsOf(trip: Trip): TripFieldValues {
  return {
    who: trip.members.map((member) => member.memberId),
    range: { from: trip.from, to: trip.to, editing: null },
    note: trip.note ?? '',
    draft: trip.draft === true,
  };
}

function sameWho(a: readonly Id[], b: readonly Id[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** Only the fields that differ from where editing began (AC-014). */
function changesOf(base: TripFieldValues, draft: TripFieldValues): TripChanges {
  const changes: TripChanges = {};
  if (!sameWho(base.who, draft.who)) changes.memberIds = draft.who;
  if (base.range.from !== draft.range.from) changes.from = draft.range.from;
  if (base.range.to !== draft.range.to) changes.to = draft.range.to;
  if (base.note.trim() !== draft.note.trim()) changes.note = draft.note.trim();
  if (base.draft !== draft.draft) changes.draft = draft.draft;
  return changes;
}

/**
 * The trip window (spec 0022, REQ-001 to REQ-005): head with the title (note, else "unterwegs"),
 * "beginnt in 12 Tagen" and ⋯ ("Für die Rückreise zurücksetzen", "Reise löschen"); Wer?, Von,
 * Bis, Notiz and "Entwurf" (spec 0030, REQ-004) changed in place with "Speichern" only while
 * something changed (the window stays open); then progress and the packing list, the bags as columns on wide screens. Offline the
 * fields are greyed out and packing goes on (ADR-0013).
 */
function TripWindow(props: { tripId: Id; onClose: () => void }) {
  const trips = useTrips();
  const members = useMembers();
  const today = useToday();
  const online = useOnlineOnly();
  const { isWide } = useBreakpoint();
  const { listBags, items } = usePackingList(props.tripId);
  const trip = trips.find((candidate) => candidate.id === props.tripId);
  const [base, setBase] = useState<TripFieldValues>();
  const [draft, setDraft] = useState<TripFieldValues>();
  const [dialog, setDialog] = useState<TripAction | 'discard'>();
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState(false);

  if (leaving) return null;
  if (!trip) {
    // Deleted on another device (AC-004): unsaved fields are dropped without an error.
    return (
      <Sheet visible size="s" title="Reise" onClose={props.onClose} testID="trip-window">
        <EmptyState
          icon="calendar-off"
          title="Diese Reise gibt es nicht mehr"
          text="Vielleicht hat sie jemand gelöscht."
          testID="trip-not-found"
        >
          <Button label="Schließen" onPress={props.onClose} testID="trip-not-found-close" />
        </EmptyState>
      </Sheet>
    );
  }

  const stripe = stripeOf(trip, members);
  const head = tripHeader(stripe, members);
  const people = members.filter((member) => head.memberIds.includes(member.id));
  const progress = packingProgress(items);
  const deleteMessage = tripDeleteDialog(trip.id, listBags, items);
  const values = draft ?? fieldsOf(trip);
  const changes = base && draft ? changesOf(base, draft) : {};
  const dirty = Object.keys(changes).length > 0;
  // While "Speichern" shows, duration and "je Tag" quantities follow the period set (AC-068).
  const preview = tripPreview(trip, dirty ? values.range : undefined, items);
  const sections = packingSections(listBags, preview.items, trip.id);
  const problems = validateTripDraft({
    memberIds: values.who,
    from: values.range.from,
    to: values.range.to,
  });

  const edit = (next: TripFieldValues) => {
    if (!base) setBase(fieldsOf(trip));
    setDraft(next);
  };

  const close = () => {
    if (dirty && dialog !== 'discard') {
      setDialog('discard');
      return;
    }
    props.onClose();
  };

  const save = () => {
    if (online.disabled || !dirty || problems.noOne || problems.toBeforeFrom) return;
    try {
      updateTrip(trip.id, changes);
    } catch (failure) {
      toast.show({ message: messageOf(failure) });
      return;
    }
    // Spec 0030, AC-014, AC-015: confirming makes the trip count, without a further question.
    toast.show({
      message:
        changes.draft === false
          ? 'Reise bestätigt'
          : changes.draft === true
            ? 'Entwurf gespeichert'
            : 'Reise geändert',
    });
    setBase(undefined);
    setDraft(undefined);
  };

  const removeNow = () => {
    try {
      removeTrip(trip.id);
    } catch {
      toast.show({ message: FAILED });
      return;
    }
    setLeaving(true);
    props.onClose();
    toast.show({ message: deleteMessage ? 'Reise und Packliste gelöscht' : 'Reise gelöscht' });
  };
  const remove = () => {
    if (online.disabled) return;
    // With a packing list the dialog asks first (AC-016), without one the plain question (spec
    // 0036, Entscheidung 1; before "Rückgängig", AC-017).
    if (deleteMessage && dialog !== 'delete') setDialog('delete');
    else if (deleteMessage) removeNow();
    else {
      confirmFirst({
        title: 'Reise löschen?',
        confirmLabel: 'Löschen',
        onConfirm: removeNow,
        testID: 'confirm-delete-trip',
      });
    }
  };

  const reset = () => {
    setDialog(undefined);
    try {
      resetPackingList(trip.id);
    } catch {
      toast.show({ message: FAILED });
    }
  };

  const addButton = (
    <Button
      label="Reisetasche hinzufügen"
      icon="plus"
      variant={sections.length === 0 ? 'primary' : 'ghost'}
      disabled={online.disabled}
      hint={online.hint}
      onPress={() => setAdding(true)}
      testID={`trip-add-bag-open-${trip.id}`}
    />
  );

  return (
    <Sheet
      visible
      size="l"
      title={head.title}
      onClose={close}
      testID="trip-window"
      header={
        <Row gap={8} align="center" style={{ justifyContent: 'space-between' }}>
          <Row gap={8} align="center" wrap>
            <AvatarStack members={people} size="s" />
            {trip.draft ? <Badge label="Entwurf" icon="pencil" testID="trip-draft-badge" /> : null}
            <Text variant="smallStrong" testID="trip-starts">
              {startsInLabel(trip.from, trip.to, today)}
            </Text>
          </Row>
          <Menu<TripAction>
            trigger="icon"
            icon="ellipsis"
            label="Mehr"
            accessibilityLabel="Mehr zur Reise"
            options={[
              {
                value: 'reset',
                label: 'Für die Rückreise zurücksetzen',
                disabled: progress.packed === 0,
                hint: progress.packed === 0 ? 'Noch nichts gepackt' : undefined,
              },
              {
                value: 'delete',
                label: 'Reise löschen',
                disabled: online.disabled,
                hint: online.hint,
              },
            ]}
            onChange={(action) => (action === 'reset' ? setDialog('reset') : remove())}
            testID="trip-more"
          />
        </Row>
      }
      actions={
        dirty
          ? {
              primary: {
                label: 'Speichern',
                icon: 'check',
                onPress: save,
                disabled: online.disabled || problems.noOne,
                hint: online.hint ?? (problems.noOne ? 'Wähle, wer unterwegs ist' : undefined),
                testID: 'trip-save',
              },
            }
          : undefined
      }
    >
      <Stack gap={24}>
        <Stack gap={6}>
          <TripFields
            value={values}
            onChange={edit}
            disabled={online.disabled}
            hint={online.hint}
          />
          <Text color="muted" testID="trip-subtitle">
            {preview.duration}
          </Text>
        </Stack>

        <AddToCalendar
          event={tripCalendarEvent({
            trip,
            title: head.title,
            link: appLink({ screen: 'trip', tripId: trip.id }),
          })}
          testID="trip-calendar"
        />

        {sections.length > 0 ? (
          <Stack gap={8}>
            <Text variant="bodyStrong" testID="trip-progress">
              {`Packliste · ${progress.label}`}
            </Text>
            {/* The bar grows along a row; in a column it would have no height. */}
            <Row>
              <ProgressBar
                value={progress.total === 0 ? 0 : progress.packed / progress.total}
                label={progress.label}
                testID="trip-progress-bar"
              />
            </Row>
          </Stack>
        ) : null}

        <View testID={`trip-list-${trip.id}`}>
          {sections.length === 0 ? (
            <EmptyState
              icon="luggage"
              title="Noch keine Packliste"
              text="Hänge eine Reisetasche an, dann entsteht die Packliste."
              testID={`trip-empty-${trip.id}`}
            >
              {addButton}
            </EmptyState>
          ) : (
            <>
              <View
                style={
                  isWide
                    ? { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 32 }
                    : undefined
                }
              >
                {sections.map((section) => (
                  <View
                    key={section.listBag.id}
                    style={isWide ? { flexGrow: 1, flexBasis: 240, maxWidth: 420 } : undefined}
                  >
                    <TripSection section={section} />
                  </View>
                ))}
              </View>
              <View style={{ alignItems: 'flex-start' }}>{addButton}</View>
            </>
          )}
        </View>
      </Stack>

      {adding ? <TripAddBagSheet tripId={trip.id} onClose={() => setAdding(false)} /> : null}
      {dialog === 'reset' ? (
        <ConfirmDialog
          title={`Alle ${progress.packed} Haken entfernen?`}
          message="Alle Packstücke stehen danach wieder offen in ihren Taschen."
          confirmLabel="Zurücksetzen"
          needsNetwork={false}
          onConfirm={reset}
          onCancel={() => setDialog(undefined)}
          testID="trip-reset-dialog"
        />
      ) : null}
      {dialog === 'delete' && deleteMessage ? (
        <ConfirmDialog
          title="Reise löschen?"
          message={deleteMessage}
          confirmLabel="Löschen"
          needsNetwork
          onConfirm={remove}
          onCancel={() => setDialog(undefined)}
          testID="trip-delete-dialog"
        />
      ) : null}
      {dialog === 'discard' ? (
        <ConfirmDialog
          title="Änderungen an der Reise verwerfen?"
          confirmLabel="Verwerfen"
          cancelLabel="Weiter bearbeiten"
          needsNetwork={false}
          onConfirm={props.onClose}
          onCancel={() => setDialog(undefined)}
          testID="trip-discard-dialog"
        />
      ) : null}
    </Sheet>
  );
}
