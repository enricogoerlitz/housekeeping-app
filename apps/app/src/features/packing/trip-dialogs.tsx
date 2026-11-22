import { Button, Row, Sheet, Text } from '@housekeeping/ui';

import { useOnlineOnly } from '@/features/shell/offline';

/**
 * A small window that asks before the trip changes a lot at once: "Alle 30 Haken
 * entfernen?" (AC-028, AC-029) and deleting the trip with its packing list (AC-038).
 * `needsNetwork` greys the confirm button out offline; resetting works offline (ADR-0013).
 */
export function TripConfirmDialog(props: {
  title: string;
  message?: string;
  confirmLabel: string;
  needsNetwork: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID: string;
}) {
  const online = useOnlineOnly();
  const blocked = props.needsNetwork && online.disabled;
  return (
    <Sheet
      visible
      size="s"
      title={props.title}
      onClose={props.onCancel}
      testID={props.testID}
      footer={
        <Row gap={10} style={{ justifyContent: 'flex-end' }}>
          <Button
            label="Abbrechen"
            variant="secondary"
            onPress={props.onCancel}
            testID={`${props.testID}-cancel`}
          />
          <Button
            label={props.confirmLabel}
            disabled={blocked}
            hint={blocked ? online.hint : undefined}
            onPress={props.onConfirm}
            testID={`${props.testID}-confirm`}
          />
        </Row>
      }
    >
      {props.message ? <Text testID={`${props.testID}-message`}>{props.message}</Text> : null}
    </Sheet>
  );
}
