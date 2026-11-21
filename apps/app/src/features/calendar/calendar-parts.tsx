import { completeChore, OfflineError } from '@housekeeping/api';
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
  toast,
  useCheckWindow,
  useTheme,
} from '@housekeeping/ui';
import { Pressable, View } from 'react-native';

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

/** Screen-reader text of a stripe: "Enrico abwesend, Urlaub Mallorca, 1.–4. Jan". */
export function stripeA11y(stripe: AbsenceStripe, membersById: Record<Id, Member>): string {
  return [
    `${stripeWho(stripe, membersById)} abwesend`,
    stripe.note,
    dateRangeLabel(stripe.from, stripe.to),
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
 * One absence as a stripe: badges, note and end ("(E) Urlaub Mallorca · bis Mo 4.1."). A tap
 * opens "Abwesenheit bearbeiten" (AC-032).
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
  return (
    <Pressable
      testID={props.testID ?? `absence-stripe-${stripe.absenceIds[0] ?? ''}`}
      accessibilityRole="button"
      accessibilityLabel={stripeA11y(stripe, data.membersById)}
      accessibilityHint="Abwesenheit bearbeiten"
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
  const title = data.titleOf(entry);
  return (
    <KindLine
      kind={entryKindRole(entry)}
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
export function ChoreLine(props: {
  item: HouseholdRowItem;
  data: CalendarData;
  compact?: boolean;
}) {
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
 * The household row of today: due chores can be checked with the collecting window (spec 0005,
 * REQ-005); 2 s after the last tap the completions are booked and stand as ✓ at the end of the
 * day (AC-018). Offline the boxes are greyed out (AC-020); if the network goes during the window,
 * nothing is booked and the boxes spring back.
 */
export function HouseholdToday(props: {
  items: HouseholdRowItem[];
  data: CalendarData;
  compact?: boolean;
}) {
  const online = useOnlineOnly();
  const open = props.items.filter((item) => item.status === 'open');
  const done = props.items.filter((item) => item.status !== 'open');
  const check = useCheckWindow<HouseholdRowItem>({
    items: open,
    getId: (item) => item.key,
    isChecked: () => false,
    onSettle: (keys) => {
      const chosen = open.filter((item) => keys.includes(item.key));
      try {
        for (const item of chosen) if (item.choreId) completeChore(item.choreId);
      } catch (error) {
        toast.show({
          message:
            error instanceof OfflineError
              ? 'Offline – nichts wurde abgehakt'
              : 'Hat nicht geklappt – bitte noch einmal versuchen',
        });
      }
    },
    announce: (item, checked) => `${item.title} ${checked ? 'abgehakt' : 'wieder offen'}`,
  });
  return (
    <>
      {check.rows.map((item) => {
        const checked = check.isChecked(item);
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
                  onChange={() => check.toggle(item)}
                  testID={`chore-check-${item.choreId ?? item.key}`}
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
