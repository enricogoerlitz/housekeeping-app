import { fuzzyIncludes, type CuisineFacet } from '@housekeeping/core';
import { Chip, Row, Text, TextField } from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

/** How many tags show at once; the search finds the others. */
const SHOWN_TAGS = 12;

/**
 * "Schlagworte" in the filter of recipes and restaurants (spec 0037, REQ-006): a search over the
 * household's tags and the matching ones as chips to tick, several at once; the chosen ones stay
 * in front. Left out by the caller when no entry has a tag (AC-019).
 */
export function TagFilter(props: {
  facets: readonly CuisineFacet[];
  /** The chosen tag keys. */
  value: readonly string[];
  onChange: (value: string[]) => void;
  testID: string;
}) {
  const [query, setQuery] = useState('');
  const chosen = props.facets.filter((facet) => props.value.includes(facet.key));
  const others = props.facets.filter(
    (facet) =>
      !props.value.includes(facet.key) && (!query.trim() || fuzzyIncludes(query, facet.label)),
  );
  const shown = [...chosen, ...others.slice(0, Math.max(0, SHOWN_TAGS - chosen.length))];
  const toggle = (key: string) =>
    props.onChange(
      props.value.includes(key)
        ? props.value.filter((candidate) => candidate !== key)
        : [...props.value, key],
    );
  return (
    <View style={{ gap: 8, flexBasis: '100%', maxWidth: 520 }} testID={props.testID}>
      <Text variant="smallStrong">Schlagworte</Text>
      <TextField
        accessibilityLabel="Schlagworte suchen"
        placeholder="Schlagwort suchen"
        value={query}
        onChangeText={setQuery}
        round
        testID={`${props.testID}-search`}
      />
      <Row wrap gap={8}>
        {shown.map((facet) => (
          <Chip
            key={facet.key}
            label={`${facet.label} ${facet.count}`}
            selected={props.value.includes(facet.key)}
            onPress={() => toggle(facet.key)}
            testID={`${props.testID}-${facet.key}`}
          />
        ))}
      </Row>
      {others.length === 0 && query.trim() ? (
        <Text variant="small" color="muted">
          Kein Schlagwort gefunden.
        </Text>
      ) : null}
    </View>
  );
}
