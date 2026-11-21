import { Button, Row, Sheet, Text } from '@housekeeping/ui';

/**
 * "Einkaufsliste leeren?" (AC-035, AC-036): the small confirmation before every item goes, open
 * and checked. The undo comes afterwards in the toast.
 */
export function ClearListSheet(props: {
  count: number;
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
      <Text testID="clear-list-text">
        {props.count === 1
          ? 'Der eine Posten wird entfernt, auch wenn er aus dem Kalender kommt.'
          : `Alle ${props.count} Posten werden entfernt, auch die aus dem Kalender.`}
      </Text>
    </Sheet>
  );
}
