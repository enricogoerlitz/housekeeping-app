import {
  tripEndLabel,
  dateRangeLabel,
  dragSourceKey,
  entryCountRole,
  entryKindRole,
  lineTooltip,
  stripeText,
  type TripStripe,
  type HouseholdRowItem,
  type Id,
  type MealPlanEntry,
  type Member,
} from '@housekeeping/core';
import {
  ariaRef,
  AvatarStack,
  Checkbox,
  hatchStyle,
  Icon,
  KindLine,
  RowTransition,
  Text,
  toast,
  useDragSource,
  useTheme,
  withAlpha,
} from '@housekeeping/ui';
import { useState } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { useChoreCheckWindow } from '@/features/chores/chore-check-list';
import { DoneEntrySheet } from '@/features/chores/done-entry-sheet';
import { entryReminderLabels, ReminderBell } from '@/features/meal-plan/reminder-bell';
import { OFFLINE_EDIT_HINT, useOnlineOnly } from '@/features/shell/offline';

import { stripeWho, type CalendarData } from './calendar-data';
import { LIFTED_OPACITY, useCalendarDrag } from './calendar-drag';

/** Corners of a day's field in the week and of a day's tile in the month (spec 0021, REQ-002). */
export const CELL_RADIUS = 6;

// Member colours come from the data; a stripe of one person is tinted with them at this opacity
// (spec 0010, REQ-009: "zart in ihrer Mitgliederfarbe").
const TINT_ALPHA = '2E';

/** Edge and fill of a stripe: one person in her colour, several or the household neutral. */
export function useStripeColors(stripe: TripStripe, membersById: Record<Id, Member>) {
  const theme = useTheme();
  const only = stripe.memberIds.length === 1 ? membersById[stripe.memberIds[0] ?? ''] : undefined;
  return only
    ? { edge: only.color, fill: `${only.color}${TINT_ALPHA}` }
    : { edge: theme.colors.textMuted, fill: theme.colors.surfaceSunken };
}

// The lines of a draft's hatching (spec 0030, Entscheidung 6): the stripe's colour, light enough
// that the text over it stays readable.
export const HATCH_ALPHA = '4D';

/** The surface of a stripe: its soft fill, hatched for a draft (spec 0030, REQ-004). */
export function stripeSurface(colors: { edge: string; fill: string }, draft: boolean): ViewStyle {
  return draft
    ? { backgroundColor: colors.fill, ...hatchStyle(withAlpha(colors.edge, HATCH_ALPHA)) }
    : { backgroundColor: colors.fill };
}

/**
 * A thin stripe line (phone week bars, month and overview lines): solid, or dashed for a draft
 * (spec 0030, Entscheidung 6). `side` is where the line is drawn, `width` its thickness.
 */
export function stripeLine(
  edge: string,
  draft: boolean,
  side: 'top' | 'left',
  width: number,
): ViewStyle {
  if (!draft) return { backgroundColor: edge };
  return side === 'top'
    ? { borderTopWidth: width, borderStyle: 'dashed', borderColor: edge }
    : { borderLeftWidth: width, borderStyle: 'dashed', borderColor: edge };
}

/**
 * Screen-reader text of a stripe: "Enrico unterwegs, Urlaub Mallorca, 1.–4. Jan", with a packing
 * list ", mit Packliste" (spec 0012, AC-046).
 */
export function stripeA11y(
  stripe: TripStripe,
  membersById: Record<Id, Member>,
  hasPackingList = false,
): string {
  return [
    `${stripeWho(stripe, membersById)} unterwegs`,
    stripe.draft ? 'Entwurf' : undefined,
    stripe.note,
    dateRangeLabel(stripe.from, stripe.to),
    hasPackingList ? 'mit Packliste' : undefined,
  ]
    .filter(Boolean)
    .join(', ');
}

/** The name badges of a stripe; the whole household also gets the house. */
export function StripeBadges(props: { stripe: TripStripe; members: Member[] }) {
  const { stripe } = props;
  const people = stripe.household
    ? props.members
    : props.members.filter((member) => stripe.memberIds.includes(member.id));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {stripe.household ? <Icon name="house" size={14} color="muted" /> : null}
      <AvatarStack members={people} size="xs" />
    </View>
  );
}

/**
 * One trip as a stripe: badges, note and end ("(E) Urlaub Mallorca · bis Mo 4.1."), the bag
 * icon when it has a packing list. A tap opens its trip (spec 0012, AC-016, AC-046).
 */
export function TripStripeView(props: {
  stripe: TripStripe;
  data: CalendarData;
  onPress: (stripe: TripStripe) => void;
  /** Desktop: " · " between note and end; phones and lists: a space. */
  separator?: string;
  /** Desktop week: the stripe runs on beyond the shown days. */
  continuesBefore?: boolean;
  continuesAfter?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const { stripe, data } = props;
  const colors = useStripeColors(stripe, data.membersById);
  const draft = stripe.draft ? 'Entwurf · ' : '';
  const text = `${draft}${stripeText(stripe)}${props.separator ?? ' '}${tripEndLabel(stripe.to)}`;
  const testID = props.testID ?? `trip-stripe-${stripe.tripId}`;
  const packing = data.hasPackingList(stripe);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={stripeA11y(stripe, data.membersById, packing)}
      accessibilityHint="Seite der Reise öffnen"
      ref={ariaRef({ 'aria-description': 'Seite der Reise öffnen' })}
      onPress={() => props.onPress(stripe)}
      style={(state) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 26,
        paddingHorizontal: 6,
        borderRadius: 4,
        borderTopLeftRadius: props.continuesBefore ? 0 : 4,
        borderBottomLeftRadius: props.continuesBefore ? 0 : 4,
        borderTopRightRadius: props.continuesAfter ? 0 : 4,
        borderBottomRightRadius: props.continuesAfter ? 0 : 4,
        borderLeftWidth: props.continuesBefore ? 0 : 3,
        borderLeftColor: colors.edge,
        ...stripeSurface(colors, stripe.draft),
        opacity: state.pressed ? 0.7 : 1,
      })}
    >
      <StripeBadges stripe={stripe} members={data.members} />
      <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1, color: theme.colors.text }}>
        {text}
      </Text>
      {packing ? (
        <View testID={`${testID}-bag`}>
          <Icon name="luggage" size={14} color="muted" />
        </View>
      ) : null}
      {props.continuesAfter ? <Icon name="chevron-right" size={14} color="muted" /> : null}
    </Pressable>
  );
}

/**
 * A plan entry as a calendar line: symbol, text and the kind's edge (D19). It can be dragged to
 * another day, Tageszeit or "Vorgemerkt" (spec 0016, REQ-001): held with a finger, pressed and
 * moved with the mouse; its old place stays as a pale outline. Offline nothing lifts and the hint
 * shows (AC-005). For screen readers the action "Verschieben" opens the entry window there.
 * With `withReminder` (week and day panel) a reminder shows as a bell under the text, "Erinnerung
 * Fr 18:00" (spec 0017, REQ-002); the dragged image stays without it, since the day moves.
 */
export function EntryLine(props: {
  entry: MealPlanEntry;
  data: CalendarData;
  onPress: (entry: MealPlanEntry) => void;
  /** The Tageszeit in front, in day lists ("Vormittag ▲ Strandtag"). */
  withSlot?: boolean;
  compact?: boolean;
  /** The bell of the entry's reminder under the text (spec 0017): week and day panel only. */
  withReminder?: boolean;
}) {
  const { entry, data } = props;
  const online = useOnlineOnly();
  const { openMove } = useCalendarDrag();
  const title = data.lineTitleOf(entry);
  const kind = entryKindRole(entry, data.recipesById);
  const size = props.compact ? 'compact' : 'row';
  // Spec 0041: the activity's symbol (AC-005), who is "dabei" (AC-014), a Termin of a series.
  const series = entry.series !== undefined;
  const activityIcon = data.activityIconOf(entry);
  const leading = activityIcon ? (
    <Icon name={activityIcon} size={props.compact ? 13 : 15} color="muted" />
  ) : undefined;
  const people = props.compact ? '' : data.peopleOf(entry);
  const reminder = props.withReminder
    ? entryReminderLabels(entry, title, data.household.timeZone)
    : undefined;
  const spoken = reminder?.accessibilityLabel ?? title;
  const {
    ref,
    props: sourceProps,
    style,
    dragging,
    guardPress,
  } = useDragSource({
    id: dragSourceKey({ kind: 'entry', entryId: entry.id }),
    preview: () => <KindLine kind={kind} title={title} size={size} leading={leading} />,
    // A Termin of a series moves in its window ("Termin verschieben"), not by dragging.
    disabled: online.disabled || series,
    onBlocked: () =>
      toast.show({
        message: series
          ? 'Einen Termin einer Serie verschiebst du in seinem Fenster.'
          : (online.hint ?? OFFLINE_EDIT_HINT),
      }),
  });
  return (
    <View ref={ref} {...sourceProps} style={[style, dragging ? { opacity: LIFTED_OPACITY } : null]}>
      <KindLine
        kind={kind}
        title={title}
        prefix={props.withSlot ? data.slotName(entry.slotId) : undefined}
        size={size}
        leading={leading}
        detail={
          reminder || people || (series && !props.compact) ? (
            <View>
              {people || series ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {series ? <Icon name="repeat" size={12} color="muted" /> : null}
                  {people ? (
                    <Text variant="caption" color="muted" testID={`entry-people-${entry.id}`}>
                      {people}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {reminder ? (
                <ReminderBell label={reminder.label} testID={`reminder-bell-${entry.id}`} />
              ) : null}
            </View>
          ) : undefined
        }
        onPress={guardPress(() => props.onPress(entry))}
        accessibilityLabel={withPeople(
          props.withSlot ? `${data.slotName(entry.slotId)}: ${spoken}` : spoken,
          data.peopleOf(entry),
          series,
        )}
        accessibilityAction={{
          label: 'Verschieben',
          onAction: () => (series ? props.onPress(entry) : openMove(entry)),
        }}
        tooltip={lineTooltip(entryCountRole(entry, data.recipesById), title)}
        testID={`entry-${entry.id}`}
      />
    </View>
  );
}

/** "Bouldern · 18:00, mit Enrico + 2, Serie" for screen readers. */
function withPeople(label: string, people: string, series: boolean): string {
  return [label, people ? `mit ${people}` : undefined, series ? 'Serie' : undefined]
    .filter(Boolean)
    .join(', ');
}

function choreTitle(item: HouseholdRowItem): string {
  return item.approximate ? `${item.title}, etwa` : item.title;
}

function People(props: { ids: Id[]; data: CalendarData }) {
  const people = props.ids.flatMap((id) => props.data.membersById[id] ?? []);
  return people.length > 0 ? <AvatarStack members={people} size="xs" /> : null;
}

/**
 * A booked chore: ✓. A tap offers „Zurücknehmen“ or „Im Verlauf öffnen“ (spec 0035, REQ-001) and,
 * while the chore exists, „Aufgabe öffnen“ for the chore window.
 */
function ChoreLine(props: {
  item: HouseholdRowItem;
  data: CalendarData;
  compact?: boolean;
  peopleBelow?: boolean;
  onOpenChore: (choreId: Id) => void;
}) {
  const { item } = props;
  const [doneOpen, setDoneOpen] = useState(false);
  const people = <People ids={item.memberIds} data={props.data} />;
  const choreId = props.data.chores.some((chore) => chore.id === item.choreId)
    ? item.choreId
    : undefined;
  const onPress =
    item.eventId !== undefined
      ? () => setDoneOpen(true)
      : choreId === undefined
        ? undefined
        : () => props.onOpenChore(choreId);
  return (
    <>
      <KindLine
        kind="chore"
        title={choreTitle(item)}
        quiet
        dashed={item.approximate}
        size={props.compact ? 'compact' : 'row'}
        leading={<Icon name="check" size={14} color="muted" />}
        trailing={props.peopleBelow ? undefined : people}
        detail={props.peopleBelow ? people : undefined}
        onPress={onPress}
        tooltip={lineTooltip('chore', choreTitle(item))}
        accessibilityLabel={`Erledigt: ${choreTitle(item)}`}
        testID={`chore-occ-${item.key}`}
      />
      {doneOpen && item.eventId !== undefined ? (
        <DoneEntrySheet
          eventId={item.eventId}
          onClose={() => setDoneOpen(false)}
          onOpenChore={choreId === undefined ? undefined : () => props.onOpenChore(choreId)}
        />
      ) : null}
    </>
  );
}

/**
 * The household row of one day (spec 0021, REQ-016): every chore that is due or planned can be
 * checked on any day, also a future one, with the one chore check window of „Anstehend“ and „Zu
 * tun“ (spec 0011, REQ-005); 2 s after the last tap it is booked as done today, as on „Haushalt“
 * (AC-042). Leaving the calendar books at once; a refusal brings the box back with the hint, e.g.
 * „Nadja war schneller (10:02)“. A tap on the name opens the chore window (AC-043). Offline the
 * boxes are greyed out (spec 0010, AC-020); booked chores stand with ✓.
 */
export function HouseholdDay(props: {
  items: HouseholdRowItem[];
  data: CalendarData;
  compact?: boolean;
  /** The avatars under the title, so a narrow column gives the title its whole width (REQ-033). */
  peopleBelow?: boolean;
  onOpenChore: (choreId: Id) => void;
}) {
  const online = useOnlineOnly();
  const choreOf = (item: HouseholdRowItem) =>
    item.status === 'done'
      ? undefined
      : props.data.chores.find((chore) => chore.id === item.choreId);
  const due = props.items.filter((item) => choreOf(item) !== undefined);
  const rest = props.items.filter((item) => choreOf(item) === undefined);
  const itemOf = new Map(due.map((item) => [item.choreId ?? '', item]));
  // In the order of the household row.
  const dueChores = due.flatMap((item) => choreOf(item) ?? []);
  const check = useChoreCheckWindow(dueChores);
  return (
    <>
      {check.rows.map((chore) => {
        const item = itemOf.get(chore.id);
        if (!item) return null;
        const checked = check.isChecked(chore);
        const people = <People ids={item.memberIds} data={props.data} />;
        return (
          <RowTransition key={item.key}>
            <KindLine
              kind="chore"
              title={choreTitle(item)}
              quiet
              struck={checked}
              dashed={item.approximate}
              size={props.compact ? 'compact' : 'row'}
              leading={
                <Checkbox
                  checked={checked}
                  label={item.title}
                  disabled={online.disabled}
                  onChange={() => check.toggle(chore)}
                  testID={`chore-check-${chore.id}`}
                />
              }
              trailing={props.peopleBelow ? undefined : people}
              detail={props.peopleBelow ? people : undefined}
              onPress={() => props.onOpenChore(chore.id)}
              tooltip={lineTooltip('chore', choreTitle(item))}
              accessibilityLabel={`${choreTitle(item)}, Details`}
              testID={`chore-occ-${item.key}`}
            />
          </RowTransition>
        );
      })}
      {rest.map((item) => (
        <ChoreLine
          key={item.key}
          item={item}
          data={props.data}
          compact={props.compact}
          peopleBelow={props.peopleBelow}
          onOpenChore={props.onOpenChore}
        />
      ))}
    </>
  );
}
