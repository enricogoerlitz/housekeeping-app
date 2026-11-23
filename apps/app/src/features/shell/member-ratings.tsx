import { memberRatingRows, type Id, type Member } from '@housekeeping/core';
import { Stars, Text } from '@housekeeping/ui';
import { View } from 'react-native';

export interface MemberRatingsProps {
  /** Stars per member id (0.5 … 5); a missing member has not rated. */
  ratings: Readonly<Record<Id, number>>;
  /** Today's members of the household; ratings of former members are left out. */
  members: readonly Member[];
  me: Id;
  /** Sets the own rating in half steps. */
  onRate: (stars: number) => void;
  /** Greys out the own stars, e.g. offline; `hint` says why. */
  disabled?: boolean;
  hint?: string;
  /**
   * The own stars (`${testID}-<n>`, `${testID}-<n>-half` as in `Stars`); another member's stars
   * are `${testID}-member-<id>`, the whole block `${testID}-all`.
   */
  testID: string;
}

/**
 * The ratings in the head of a recipe, restaurant or activity page (spec 0008, E15, AC-040): "Du" with the
 * own stars to set, next to it every other member with their stars only to look at; without a
 * rating the stars stay empty.
 */
export function MemberRatings(props: MemberRatingsProps) {
  const rows = memberRatingRows(props.ratings, props.members, props.me);
  return (
    <View
      testID={`${props.testID}-all`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 10 }}
    >
      {rows.map((row) =>
        row.editable ? (
          <View key={row.memberId} style={{ gap: 4 }}>
            <Text variant="smallStrong">{row.label}</Text>
            <Stars
              value={row.stars ?? 0}
              onChange={props.onRate}
              label="Deine Bewertung"
              disabled={props.disabled}
              hint={props.hint}
              size={24}
              testID={props.testID}
            />
          </View>
        ) : (
          <View key={row.memberId} style={{ gap: 4 }}>
            <Text variant="small" color="muted">
              {row.label}
            </Text>
            {/* Display only: no onChange, so neither mouse nor tap changes them (AC-040). */}
            <View style={{ minHeight: 24, justifyContent: 'center' }}>
              <Stars
                value={row.stars ?? 0}
                size={16}
                testID={`${props.testID}-member-${row.memberId}`}
              />
            </View>
          </View>
        ),
      )}
    </View>
  );
}
