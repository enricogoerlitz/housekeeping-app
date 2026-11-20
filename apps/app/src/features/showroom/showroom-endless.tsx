import {
  Button,
  GroupLabel,
  Icon,
  InfiniteList,
  List,
  ListRow,
  Surface,
  Text,
  useTheme,
} from '@housekeeping/ui';
import { View } from 'react-native';

import { ENDLESS_ROWS } from './showroom-data';

/**
 * AC-042 and AC-010: 1000 sample rows without pages, a sticky heading every 100 rows. The list
 * scrolls the page itself, so header and toolbar of the showroom react to it.
 */
export function EndlessDemo(props: { onOpen: (row: number) => void }) {
  const theme = useTheme();
  return (
    <InfiniteList
      data={ENDLESS_ROWS}
      keyExtractor={(row) => row.id}
      isGroupHeader={(row) => row.kind === 'group'}
      restoreKey="showroom-endless"
      testID="showroom-endless"
      renderItem={(row) =>
        row.kind === 'group' ? (
          // A sticky heading needs the page colour behind it, or rows show through.
          <View style={{ backgroundColor: theme.colors.bg }}>
            <GroupLabel testID={`showroom-endless-${row.id}`}>{row.label}</GroupLabel>
          </View>
        ) : (
          <View style={{ marginBottom: 6 }}>
            <List>
              <ListRow
                title={`Zeile ${row.number}`}
                subtitle="Beispielzeile"
                trailing={<Icon name="chevron-right" color="muted" />}
                onPress={() => props.onOpen(row.number)}
                testID={`showroom-endless-row-${row.number}`}
              />
            </List>
          </View>
        )
      }
    />
  );
}

/** AC-043: the sample detail page of a row; "Zurück" returns to the same place in the list. */
export function EndlessDetail(props: { row: number; onBack: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        paddingTop: 16,
        backgroundColor: theme.colors.bg,
      }}
    >
      <Surface testID="showroom-endless-detail" style={{ gap: 12 }}>
        <Text variant="heading" heading>
          Zeile {props.row}
        </Text>
        <Text color="muted">
          Beispiel-Detailseite. Nach „Zurück“ steht die Liste wieder an derselben Stelle.
        </Text>
        <Button
          label="Zurück"
          icon="arrow-left"
          variant="secondary"
          onPress={props.onBack}
          testID="showroom-endless-back"
        />
      </Surface>
    </View>
  );
}
