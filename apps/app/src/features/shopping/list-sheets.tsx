import { clearListQuestion } from '@housekeeping/core';
import { Button, List, ListRow, Row, Sheet, Text } from '@housekeeping/ui';

/**
 * "Einkaufsliste leeren?" (spec 0006, AC-035; spec 0025, AC-019): the small confirmation before
 * every item goes, open and checked named apart. The undo comes afterwards in the toast.
 */
export function ClearListSheet(props: {
  open: number;
  done: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible
      size="s"
      title="Einkaufsliste leeren?"
      onClose={props.onClose}
      testID="clear-list-sheet"
      footer={
        <Row gap={10} style={{ justifyContent: 'flex-end' }}>
          <Button
            label="Abbrechen"
            variant="secondary"
            onPress={props.onClose}
            testID="clear-list-cancel"
          />
          <Button label="Liste leeren" onPress={props.onConfirm} testID="clear-list-confirm" />
        </Row>
      }
    >
      <Text testID="clear-list-text">{clearListQuestion(props.open, props.done)}</Text>
    </Sheet>
  );
}

/**
 * "Aus diesen Gerichten" (spec 0025, AC-017): the dishes the open items come from, in the order
 * they were added, each with its number of items.
 */
export function DishesSheet(props: {
  rows: { key: string; label: string }[];
  onClose: () => void;
}) {
  return (
    <Sheet
      visible
      size="s"
      title="Aus diesen Gerichten"
      onClose={props.onClose}
      testID="list-dishes-sheet"
    >
      <List>
        {props.rows.map((row, index) => (
          <ListRow key={row.key} title={row.label} testID={`list-dish-${index}`} />
        ))}
      </List>
    </Sheet>
  );
}
