import {
  choreMemberIds,
  choreTurnLabel,
  daysOverdue,
  flexibleProgress,
  recurrenceLabel,
  relativeDayLabel,
  withTime,
  type Chore,
  type ISODate,
  type Member,
} from '@housekeeping/core';
import { AvatarStack, Badge, Checkbox, DueBar, ListRow, Row, Text } from '@housekeeping/ui';
import { View } from 'react-native';

import { dayWithDate, overdueLabel } from './chore-labels';

export interface ChoreRowProps {
  chore: Chore;
  today: ISODate;
  members: Member[];
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

export function ChoreRow(props: ChoreRowProps) {
  const { chore, today, check } = props;
  const overdue = daysOverdue(chore, today);
  const flexible = chore.recurrence.type === 'flexible';
  const asNeeded = chore.recurrence.type === 'asNeeded';
  const meta = [recurrenceLabel(chore.recurrence), chore.room].filter(Boolean).join(' · ');
  const dueText =
    overdue > 0
      ? overdueLabel(overdue)
      : props.detailed && !flexible && !asNeeded && chore.nextDueOn
        ? `nächstes Mal ${relativeDayLabel(chore.nextDueOn, today)}`
        : props.detailed && asNeeded && chore.lastDoneOn
          ? `zuletzt ${dayWithDate(chore.lastDoneOn)}`
          : undefined;
  const memberIds = choreMemberIds(chore, props.members);
  const avatars = props.members.filter((member) => memberIds.includes(member.id));
  // Alternating: only whose turn it is, read as "dran: Nadja" (spec 0018, AC-016).
  const turn = choreTurnLabel(chore, props.members);
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
              variant={overdue > 0 ? 'smallStrong' : 'small'}
              color={overdue > 0 ? 'warn' : 'muted'}
              testID={`chore-${chore.id}-due`}
            >
              {dueText}
            </Text>
          ) : null}
          {flexible && !props.paused ? (
            <DueBar
              value={progress}
              label={progress >= 1 ? 'jetzt fällig' : `${Math.round(progress * 100)} % bis fällig`}
            />
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
