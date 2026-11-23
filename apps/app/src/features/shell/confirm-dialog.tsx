import { Button, Row, Sheet, Stack, Text } from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from './offline';

/**
 * A small window that asks before something is lost or much changes at once: "Abmelden?",
 * "Rewe Südstadt löschen?", "Alle 30 Haken entfernen?" (spec 0031, AC-061). Offline the confirm
 * button is greyed out with the hint, unless `needsNetwork` is false (sign-out, resetting a
 * packing list, ADR-0013). `onConfirm` may return a hint that keeps the window open.
 */
export function ConfirmDialog(props: {
  title: string;
  message?: string;
  confirmLabel: string;
  /** "Abbrechen" unless given, e.g. "Weiter bearbeiten". */
  cancelLabel?: string;
  /** Default true. */
  needsNetwork?: boolean;
  onConfirm: () => string | undefined | void;
  onCancel: () => void;
  testID: string;
}) {
  const online = useOnlineOnly();
  const [error, setError] = useState<string | undefined>();
  const blocked = props.needsNetwork !== false && online.disabled;
  const hint = error ?? (blocked ? online.hint : undefined);
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
            label={props.cancelLabel ?? 'Abbrechen'}
            variant="secondary"
            onPress={props.onCancel}
            testID={`${props.testID}-cancel`}
          />
          <Button
            label={props.confirmLabel}
            disabled={blocked}
            hint={blocked ? online.hint : undefined}
            onPress={() => setError(props.onConfirm() ?? undefined)}
            testID={`${props.testID}-confirm`}
          />
        </Row>
      }
    >
      {props.message || hint ? (
        <Stack gap={10}>
          {props.message ? <Text testID={`${props.testID}-message`}>{props.message}</Text> : null}
          {hint ? (
            <Text variant="small" color="warn" testID={`${props.testID}-error`}>
              {hint}
            </Text>
          ) : null}
        </Stack>
      ) : null}
    </Sheet>
  );
}
