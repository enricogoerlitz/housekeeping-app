import {
  choreMemberIds,
  daysOverdue,
  flexibleProgress,
  recurrenceLabel,
  relativeDayLabel,
  type Chore,
  type ISODate,
  type Member,
} from '@housekeeping/core';
import { AvatarStack, Badge, Checkbox, DueBar, ListRow, Row, Text } from '@housekeeping/ui';
import { View } from 'react-native';

import { overdueLabel } from './chore-labels';

export interface ChoreRowProps {
  chore: Chore;
  today: ISODate;
  members: Member[];
  /** Offline: the checkbox is greyed out, the row still opens the details. */
  checkDisabled: boolean;
  onCheck: () => void;
  onOpen: () => void;
  /** "Alle": also show when it is due next and whether it is paused. */
  detailed?: boolean;
  paused?: boolean;
}

export function ChoreRow(props: ChoreRowProps) {
  const { chore, today } = props;
  const overdue = daysOverdue(chore, today);
  const flexible = chore.recurrence.type === 'flexible';
  const meta = [recurrenceLabel(chore.recurrence), chore.room].filter(Boolean).join(' · ');
  const dueText =
    overdue > 0
      ? overdueLabel(overdue)
      : props.detailed && !flexible && chore.nextDueOn
        ? `nächstes Mal ${relativeDayLabel(chore.nextDueOn, today)}`
        : undefined;
  const memberIds = choreMemberIds(chore, props.members);
  const avatars = props.members.filter((member) => memberIds.includes(member.id));
  const progress = flexibleProgress(chore, today);

  return (
    <ListRow
      testID={`chore-${chore.id}`}
      title={chore.title}
      accessibilityLabel={`${chore.title}, Details`}
      onPress={props.onOpen}
      leading={
        <Checkbox
          testID={`chore-${chore.id}-check`}
          label={`${chore.title} erledigt`}
          checked={false}
          disabled={props.checkDisabled}
          onChange={props.onCheck}
        />
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
          <AvatarStack members={avatars} />
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
