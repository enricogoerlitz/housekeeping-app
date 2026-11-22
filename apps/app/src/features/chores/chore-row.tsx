import {
  choreDueLabel,
  choreDueState,
  choreMemberIds,
  choreNextDate,
  choreTurnLabel,
  daysBetween,
  flexibleProgress,
  FLEXIBLE_DUE_FROM,
  recurrenceLabel,
  relativeDayLabel,
  withTime,
  type Chore,
  type ChoreAway,
  type ISODate,
} from '@housekeeping/core';
import { AvatarStack, Badge, Checkbox, DueBar, ListRow, Row, Text } from '@housekeeping/ui';
import { View } from 'react-native';

import { dayWithDate } from './chore-labels';

export interface ChoreRowProps {
  chore: Chore;
  today: ISODate;
  /** Members and trips: dates wait on trips, a rotation skips who is away (spec 0026). */
  away: ChoreAway;
  onOpen: () => void;
  /**
   * „Anstehend“: the check box of the collecting window. Checked rows are struck through and
   * stay in place until the window closes. Offline the box is greyed out with the hint; the row
   * still opens the details.
   */
  check?: { checked: boolean; disabled: boolean; onToggle: () => void };
  /** „Alle“: also show when it is due next, when it was done last and whether it is paused. */
  detailed?: boolean;
  paused?: boolean;
  /** Shown in the right column („Liste und Detail“). */
  selected?: boolean;
}

/** The bar of a flexible chore (REQ-009): „jetzt fällig“, „bald fällig“, else „n % bis fällig“. */
export function flexibleBarLabel(progress: number): string {
  if (progress >= 1) return 'jetzt fällig';
  if (progress >= FLEXIBLE_DUE_FROM) return 'bald fällig';
  return `${Math.round(progress * 100)} % bis fällig`;
}

/** „nächstes Mal morgen“, „nächstes Mal Fr 1.1.2027“ (spec 0026, AC-017). */
function nextLabel(day: ISODate, today: ISODate): string {
  const near = Math.abs(daysBetween(today, day)) <= 6;
  return `nächstes Mal ${near ? relativeDayLabel(day, today) : dayWithDate(day, today)}`;
}

export function ChoreRow(props: ChoreRowProps) {
  const { chore, today, check, away } = props;
  const flexible = chore.recurrence.type === 'flexible';
  const asNeeded = chore.recurrence.type === 'asNeeded';
  const meta = [recurrenceLabel(chore.recurrence), chore.room].filter(Boolean).join(' · ');
  const overdue = choreDueState(chore, today, away) === 'overdue';
  // One wording for what is due (REQ-009); the bar says it for flexible chores.
  const label = props.paused ? undefined : choreDueLabel(chore, today, away);
  const next = choreNextDate(chore, today, away);
  const dueText =
    label !== undefined && !(flexible && !label.startsWith('nach der Reise'))
      ? label
      : props.detailed && !flexible && !asNeeded && !props.paused && next
        ? nextLabel(next.date, today)
        : props.detailed && asNeeded && chore.lastDoneOn
          ? `zuletzt ${dayWithDate(chore.lastDoneOn, today)}`
          : undefined;
  const memberIds = choreMemberIds(chore, today, away);
  const avatars = away.members.filter((member) => memberIds.includes(member.id));
  // Alternating: only who does it next, read as "dran: Nadja" (spec 0018, AC-016).
  const turn = choreTurnLabel(chore, today, away);
  const progress = flexibleProgress(chore, today);
  const checked = check?.checked ?? false;

  return (
    <ListRow
      testID={`chore-${chore.id}`}
      title={withTime(chore.title, chore.dueTime)}
      strike={checked}
      selected={props.selected}
      accessibilityLabel={[chore.title, turn, 'Details'].filter(Boolean).join(', ')}
      onPress={props.onOpen}
      leading={
        check ? (
          <Checkbox
            testID={`chore-${chore.id}-check`}
            label={`${chore.title} erledigt`}
            checked={checked}
            disabled={check.disabled}
            onChange={check.onToggle}
          />
        ) : undefined
      }
      subtitle={
        <View style={{ gap: 2, marginTop: 1 }}>
          <Text variant="small" color="muted">
            {meta}
          </Text>
          {dueText ? (
            <Text
              variant={overdue ? 'smallStrong' : 'small'}
              color={overdue ? 'warn' : 'muted'}
              testID={`chore-${chore.id}-due`}
            >
              {dueText}
            </Text>
          ) : null}
          {flexible && !props.paused ? (
            <DueBar value={progress} label={flexibleBarLabel(progress)} />
          ) : null}
          {props.paused ? (
            <View style={{ marginTop: 4 }}>
              <Badge label="pausiert" icon="calendar-off" testID={`chore-${chore.id}-paused`} />
            </View>
          ) : null}
        </View>
      }
      trailing={
        avatars.length > 0 ? (
          <AvatarStack members={avatars} accessibilityLabel={turn} />
        ) : (
          <Row>
            <Text variant="caption" color="muted">
              egal wer
            </Text>
          </Row>
        )
      }
    />
  );
}
