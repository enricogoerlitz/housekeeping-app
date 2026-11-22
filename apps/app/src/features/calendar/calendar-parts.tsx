import {
  absenceEndLabel,
  dateRangeLabel,
  entryKindRole,
  stripeText,
  type AbsenceStripe,
  type HouseholdRowItem,
  type Id,
  type MealPlanEntry,
  type Member,
} from '@housekeeping/core';
import {
  AvatarStack,
  Checkbox,
  Icon,
  KindLine,
  RowTransition,
  Text,
  useTheme,
} from '@housekeeping/ui';
import { Pressable, View } from 'react-native';

import { useChoreCheckWindow } from '@/features/chores/chore-check-list';
import { useOnlineOnly } from '@/features/shell/offline';

import { stripeWho, type CalendarData } from './calendar-data';

// Member colours come from the data; a stripe of one person is tinted with them at this opacity
// (spec 0010, REQ-009: "zart in ihrer Mitgliederfarbe").
const TINT_ALPHA = '2E';

/** Edge and fill of a stripe: one person in her colour, several or the household neutral. */
export function useStripeColors(stripe: AbsenceStripe, membersById: Record<Id, Member>) {
  const theme = useTheme();
  const only = stripe.memberIds.length === 1 ? membersById[stripe.memberIds[0] ?? ''] : undefined;
  return only
    ? { edge: only.color, fill: `${only.color}${TINT_ALPHA}` }
    : { edge: theme.colors.textMuted, fill: theme.colors.surfaceSunken };
}

/**
 * Screen-reader text of a stripe: "Enrico unterwegs, Urlaub Mallorca, 1.–4. Jan", with a packing
 * list ", mit Packliste" (spec 0012, AC-046).
 */
export function stripeA11y(
  stripe: AbsenceStripe,
  membersById: Record<Id, Member>,
  hasPackingList = false,
): string {
  return [
    `${stripeWho(stripe, membersById)} unterwegs`,
    stripe.note,
    dateRangeLabel(stripe.from, stripe.to),
    hasPackingList ? 'mit Packliste' : undefined,
  ]
    .filter(Boolean)
    .join(', ');
}

/** The name badges of a stripe; the whole household also gets the house. */
export function StripeBadges(props: { stripe: AbsenceStripe; members: Member[] }) {
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
 * One absence as a stripe: badges, note and end ("(E) Urlaub Mallorca · bis Mo 4.1."), the bag
 * icon when it has a packing list. A tap opens its Urlaubsseite (spec 0012, AC-016, AC-046).
 */
export function AbsenceStripeView(props: {
  stripe: AbsenceStripe;
  data: CalendarData;
  onPress: (stripe: AbsenceStripe) => void;
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
  const text = `${stripeText(stripe)}${props.separator ?? ' '}${absenceEndLabel(stripe.to)}`;
  const testID = props.testID ?? `absence-stripe-${stripe.absenceIds[0] ?? ''}`;
  const packing = data.hasPackingList(stripe);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={stripeA11y(stripe, data.membersById, packing)}
      accessibilityHint="Seite der Reise öffnen"
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
        backgroundColor: colors.fill,
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

/** A plan entry as a calendar line: symbol, text and the kind's edge (D19). */
export function EntryLine(props: {
  entry: MealPlanEntry;
  data: CalendarData;
  onPress: (entry: MealPlanEntry) => void;
  /** The Tageszeit in front, in day lists ("Vormittag ▲ Strandtag"). */
  withSlot?: boolean;
  compact?: boolean;
}) {
  const { entry, data } = props;
  const title = data.lineTitleOf(entry);
  return (
    <KindLine
      kind={entryKindRole(entry, data.recipesById)}
      title={title}
      prefix={props.withSlot ? data.slotName(entry.slotId) : undefined}
      size={props.compact ? 'compact' : 'row'}
      onPress={() => props.onPress(entry)}
      accessibilityLabel={props.withSlot ? `${data.slotName(entry.slotId)}: ${title}` : title}
      testID={`entry-${entry.id}`}
    />
  );
}

function choreTitle(item: HouseholdRowItem): string {
  return item.approximate ? `${item.title}, etwa` : item.title;
}

function People(props: { ids: Id[]; data: CalendarData }) {
  const people = props.ids.flatMap((id) => props.data.membersById[id] ?? []);
  return people.length > 0 ? <AvatarStack members={people} size="xs" /> : null;
}

/** An empty ring for a chore that is not done: "○ Müll rausbringen". */
function Ring() {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 13,
        height: 13,
        borderRadius: 7,
        borderWidth: 1.5,
        borderColor: theme.colors.checkLine,
      }}
    />
  );
}

/** A chore of a past or future day: done with ✓, planned with ○; nothing to tap. */
function ChoreLine(props: { item: HouseholdRowItem; data: CalendarData; compact?: boolean }) {
  const { item } = props;
  return (
    <KindLine
      kind="chore"
      title={choreTitle(item)}
      quiet
      dashed={item.approximate}
      size={props.compact ? 'compact' : 'row'}
      leading={item.status === 'done' ? <Icon name="check" size={14} color="muted" /> : <Ring />}
      trailing={<People ids={item.memberIds} data={props.data} />}
      accessibilityLabel={`${item.status === 'done' ? 'Erledigt' : 'Geplant'}: ${choreTitle(item)}`}
      testID={`chore-occ-${item.key}`}
    />
  );
}

/**
 * The household row of today: due chores are checked with the one chore check window of
 * „Anstehend“ and „Zu tun“ (spec 0011, REQ-005); 2 s after the last tap the completions are
 * booked and stand as ✓ at the end of the day (spec 0010, AC-018). Leaving the calendar books at
 * once; a refusal brings the box back with the hint, e.g. „Nadja war schneller (10:02)“ (AC-031,
 * AC-034). Offline the boxes are greyed out (spec 0010, AC-020).
 */
function HouseholdToday(props: {
  items: HouseholdRowItem[];
  data: CalendarData;
  compact?: boolean;
}) {
  const online = useOnlineOnly();
  const open = props.items.filter((item) => item.status === 'open');
  const done = props.items.filter((item) => item.status !== 'open');
  const itemOf = new Map(open.map((item) => [item.choreId ?? '', item]));
  // In the order of the household row.
  const openChores = open.flatMap(
    (item) => props.data.chores.find((chore) => chore.id === item.choreId) ?? [],
  );
  const check = useChoreCheckWindow(openChores);
  return (
    <>
      {check.rows.map((chore) => {
        const item = itemOf.get(chore.id);
        if (!item) return null;
        const checked = check.isChecked(chore);
        return (
          <RowTransition key={item.key}>
            <KindLine
              kind="chore"
              title={choreTitle(item)}
              quiet
              struck={checked}
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
              trailing={<People ids={item.memberIds} data={props.data} />}
              accessibilityLabel={online.hint ? `${item.title}. ${online.hint}` : undefined}
              testID={`chore-occ-${item.key}`}
            />
          </RowTransition>
        );
      })}
      {done.map((item) => (
        <ChoreLine key={item.key} item={item} data={props.data} compact={props.compact} />
      ))}
    </>
  );
}

/** The household row of one day: today checkable, other days read only. */
export function HouseholdDay(props: {
  items: HouseholdRowItem[];
  isToday: boolean;
  data: CalendarData;
  compact?: boolean;
}) {
  if (props.isToday) {
    return <HouseholdToday items={props.items} data={props.data} compact={props.compact} />;
  }
  return (
    <>
      {props.items.map((item) => (
        <ChoreLine key={item.key} item={item} data={props.data} compact={props.compact} />
      ))}
    </>
  );
}
