import { useAbsences, useMembers, useMembersById } from '@housekeeping/api';
import { absenceLines, type ISODate } from '@housekeeping/core';
import { AvatarStack, Icon, Row, Text } from '@housekeeping/ui';
import { View } from 'react-native';

/**
 * Absences on the shown day as quiet lines (AC-007): "Nadja · Urlaub Mallorca · bis Do 26.11.",
 * without a note "Nadja ist abwesend bis Do 26.11."; nothing when nobody is away.
 */
export function TodayAbsence(props: { shown: ISODate }) {
  const absences = useAbsences();
  const members = useMembers();
  const membersById = useMembersById();
  const lines = absenceLines({ absences, members, date: props.shown });
  if (lines.length === 0) return null;
  return (
    <View testID="today-absence" style={{ gap: 6, marginBottom: 22 }}>
      {lines.map((line) => {
        const people = line.memberIds.flatMap((id) => membersById[id] ?? []);
        return (
          <View key={line.key} testID={`today-absence-${line.key}`}>
            <Row gap={8}>
              {people.length > 0 ? (
                <AvatarStack members={people} size="xs" />
              ) : (
                <Icon name="house" size={16} color="muted" />
              )}
              <Text variant="small" color="muted" style={{ flex: 1 }}>
                {line.text}
              </Text>
            </Row>
          </View>
        );
      })}
    </View>
  );
}
