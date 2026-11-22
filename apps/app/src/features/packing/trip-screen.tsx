import {
  removeAbsences,
  resetPackingList,
  snapshot,
  useAbsences,
  useMembers,
  useMembersById,
  usePackingList,
  useToday,
} from '@housekeeping/api';
import {
  absenceDeleteDialog,
  packingProgress,
  packingSections,
  routeId,
  startsInLabel,
  tripHeader,
  tripStripe,
  type AbsenceStripe,
  type Id,
  type PackingItem,
  type PackingListBag,
} from '@housekeeping/core';
import {
  Avatar,
  AvatarStack,
  Button,
  EmptyState,
  IconButton,
  Menu,
  ProgressBar,
  Row,
  Screen,
  ScreenHeader,
  Stack,
  Text,
  toast,
  useBreakpoint,
} from '@housekeeping/ui';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AbsenceSheet } from '@/features/absences/absence-sheet';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { FAILED } from './packing-labels';
import { TripAddBagSheet } from './trip-add-bag-sheet';
import { TripConfirmDialog } from './trip-dialogs';
import { TripSection } from './trip-section';

type TripAction = 'reset' | 'delete';

/** Where the Urlaubsseite was opened from, `?von=…`; anything else counts as the calendar. */
const ORIGINS = {
  reisen: { label: 'Reisen', tab: 'reisen', href: '/reisen' },
  uebersicht: { label: 'Übersicht', tab: 'index', href: '/' },
} as const;

type TripOrigin = keyof typeof ORIGINS;

function tripOrigin(von: string | string[] | undefined): TripOrigin | undefined {
  const value = Array.isArray(von) ? von[0] : von;
  return value === 'reisen' || value === 'uebersicht' ? value : undefined;
}

/** The tab shown before the current one (tab history), or undefined. */
function previousTab(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null) return undefined;
  const { history, routes } = state as { history?: unknown; routes?: unknown };
  if (!Array.isArray(history) || !Array.isArray(routes)) return undefined;
  const entry: unknown = history[history.length - 2];
  const key = typeof entry === 'object' && entry !== null ? (entry as { key?: unknown }).key : null;
  const route: unknown = routes.find(
    (candidate: unknown) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { key?: unknown }).key === key,
  );
  const name =
    typeof route === 'object' && route !== null ? (route as { name?: unknown }).name : null;
  return typeof name === 'string' ? name : undefined;
}

/**
 * "Zurück" of the Urlaubsseite: opened from "Reisen" or from the card on the "Übersicht"
 * it leads back there ("‹ Reisen", "‹ Übersicht"), otherwise to the calendar underneath
 * ("‹ Kalender"); the same rule as for "Aktivitäten" (spec 0010, REQ-008).
 */
function useTripBack(): { label: string; back: () => void } {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ von?: string | string[] }>();
  const origin = tripOrigin(params.von);
  if (origin) {
    const target = ORIGINS[origin];
    return {
      label: target.label,
      back: () => {
        const tabs = navigation.getParent();
        // The calendar's tab gets its first page back, so it shows the calendar later.
        if (router.canDismiss()) router.dismissAll();
        // Back in the tab history when it came from there, so "Zurück" on that page still leads
        // to where it was opened from; after a reload the origin is opened anew.
        if (tabs && previousTab(tabs.getState()) === target.tab) tabs.goBack();
        else router.navigate(target.href);
      },
    };
  }
  return {
    label: 'Kalender',
    back: () => (router.canGoBack() ? router.back() : router.replace('/kalender')),
  };
}

/** The Urlaubsseite of an absence, `/kalender/reise/[id]` (spec 0012, REQ-003, decision 14). */
export function TripScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  // Only a uuid reaches the lookup; anything else shows "gibt es nicht mehr".
  const absenceId = routeId(params.id);
  const { label, back } = useTripBack();
  return <TripPage absenceId={absenceId} onBack={back} backLabel={label} />;
}

function TripPage(props: { absenceId: Id | undefined; onBack: () => void; backLabel: string }) {
  const absences = useAbsences();
  const members = useMembers();
  // Set when this page deletes its absence: it leaves blank instead of "gibt es nicht mehr".
  const [leaving, setLeaving] = useState(false);
  const stripe =
    props.absenceId === undefined ? undefined : tripStripe(props.absenceId, absences, members);

  if (leaving) return <Screen testID="trip-screen" />;
  if (!stripe) {
    return (
      <Screen
        testID="trip-screen"
        tone="plan"
        header={<ScreenHeader title="Reise" onBack={props.onBack} backLabel={props.backLabel} />}
      >
        <EmptyState
          icon="calendar-off"
          title="Diese Reise gibt es nicht mehr"
          text="Vielleicht hat sie jemand gelöscht."
          testID="trip-not-found"
        >
          <Button
            label="Zurück"
            icon="arrow-left"
            onPress={props.onBack}
            testID="trip-not-found-back"
          />
        </EmptyState>
      </Screen>
    );
  }
  return (
    <TripBody
      stripe={stripe}
      onBack={props.onBack}
      backLabel={props.backLabel}
      onDeleted={() => {
        setLeaving(true);
        props.onBack();
      }}
    />
  );
}

/**
 * Head with note as title, who, period, days and "beginnt in 12 Tagen" (AC-016); ✎ edits the
 * absence, ⋯ resets for the way home (AC-028, works offline) or deletes it (AC-038). Below the
 * progress "Packliste · 12 von 30 gepackt" and one section per bag; side by side on wide screens
 * (AC-018). A stripe of several absences shows their packing lists one below the other (decision 9).
 */
function TripBody(props: {
  stripe: AbsenceStripe;
  onBack: () => void;
  backLabel: string;
  onDeleted: () => void;
}) {
  const { stripe } = props;
  const members = useMembers();
  const today = useToday();
  const online = useOnlineOnly();
  const { listBags, items } = usePackingList(stripe.absenceIds);
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<TripAction | undefined>();

  const head = tripHeader(stripe, members);
  const people = members.filter((member) => head.memberIds.includes(member.id));
  const progress = packingProgress(items);
  const deleteMessage = absenceDeleteDialog(stripe.absenceIds, listBags, items);

  const remove = () => {
    if (online.disabled) return;
    // With a packing list the dialog asks first, without one "Rückgängig" is enough (AC-038).
    if (deleteMessage && dialog !== 'delete') {
      setDialog('delete');
      return;
    }
    const restore = deleteMessage ? undefined : snapshot();
    try {
      removeAbsences(stripe.absenceIds);
    } catch {
      toast.show({ message: FAILED });
      return;
    }
    setDialog(undefined);
    props.onDeleted();
    toast.show(
      restore
        ? {
            message: 'Reise gelöscht',
            actionLabel: 'Rückgängig',
            onAction: undoAction(restore),
            duration: 5000,
          }
        : { message: 'Reise und Packliste gelöscht' },
    );
  };

  const reset = () => {
    setDialog(undefined);
    try {
      resetPackingList(stripe.absenceIds);
    } catch {
      toast.show({ message: FAILED });
    }
  };

  const actions = (
    <Row gap={4}>
      <IconButton
        icon="pencil"
        label="Reise bearbeiten"
        disabled={online.disabled}
        hint={online.hint}
        onPress={() => setEditing(true)}
        testID="trip-edit"
      />
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
  );

  return (
    <Screen
      testID="trip-screen"
      tone="plan"
      header={
        <ScreenHeader
          title={head.title}
          onBack={props.onBack}
          backLabel={props.backLabel}
          right={actions}
          testID="trip-title"
        />
      }
    >
      <Stack gap={6} style={{ marginBottom: 16 }}>
        <Row gap={8} align="center" wrap>
          <AvatarStack members={people} size="s" />
          <Text color="muted" testID="trip-subtitle">
            {head.subtitle}
          </Text>
        </Row>
        <Text variant="smallStrong" testID="trip-starts">
          {startsInLabel(stripe.from, stripe.to, today)}
        </Text>
        {online.hint ? (
          <Text variant="small" color="warn" testID="trip-offline">
            {online.hint}
          </Text>
        ) : null}
      </Stack>

      {listBags.length > 0 ? (
        <Stack gap={8} style={{ marginBottom: 24 }}>
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

      {stripe.absenceIds.map((absenceId) => (
        <TripPackingList
          key={absenceId}
          absenceId={absenceId}
          showOwner={stripe.absenceIds.length > 1}
          listBags={listBags}
          items={items}
        />
      ))}

      {editing ? <AbsenceSheet stripe={stripe} onClose={() => setEditing(false)} /> : null}
      {dialog === 'reset' ? (
        <TripConfirmDialog
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
        <TripConfirmDialog
          title="Reise löschen?"
          message={deleteMessage}
          confirmLabel="Löschen"
          needsNetwork
          onConfirm={remove}
          onCancel={() => setDialog(undefined)}
          testID="trip-delete-dialog"
        />
      ) : null}
    </Screen>
  );
}

/** The packing list of one absence: its bags, "+ Reisetasche hinzufügen", or the empty state. */
function TripPackingList(props: {
  absenceId: Id;
  showOwner: boolean;
  listBags: PackingListBag[];
  items: PackingItem[];
}) {
  const online = useOnlineOnly();
  const { isWide } = useBreakpoint();
  const absences = useAbsences();
  const membersById = useMembersById();
  const [adding, setAdding] = useState(false);
  const sections = packingSections(props.listBags, props.items, props.absenceId);
  const memberId = absences.find((absence) => absence.id === props.absenceId)?.memberId;
  const owner = memberId ? membersById[memberId] : undefined;

  const addButton = (
    <Button
      label="Reisetasche hinzufügen"
      icon="plus"
      variant={sections.length === 0 ? 'primary' : 'ghost'}
      disabled={online.disabled}
      hint={online.hint}
      onPress={() => setAdding(true)}
      testID={`trip-add-bag-open-${props.absenceId}`}
    />
  );

  return (
    <View testID={`trip-list-${props.absenceId}`} style={{ marginBottom: 24 }}>
      {props.showOwner && owner ? (
        <Row gap={8} align="center" style={{ marginBottom: 12 }}>
          <Avatar name={owner.name} color={owner.color} size="s" />
          <Text variant="heading" heading>
            {`Packliste von ${owner.name}`}
          </Text>
        </Row>
      ) : null}
      {sections.length === 0 ? (
        <EmptyState
          icon="luggage"
          title="Noch keine Packliste"
          text="Hänge eine Reisetasche an, dann entsteht die Packliste."
          testID={`trip-empty-${props.absenceId}`}
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
                style={isWide ? { flexGrow: 1, flexBasis: 300, maxWidth: 520 } : undefined}
              >
                <TripSection section={section} />
              </View>
            ))}
          </View>
          <View style={{ alignItems: 'flex-start' }}>{addButton}</View>
        </>
      )}
      {adding ? (
        <TripAddBagSheet absenceId={props.absenceId} onClose={() => setAdding(false)} />
      ) : null}
    </View>
  );
}
