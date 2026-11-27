import { createRequestSlot, Sheet, Stack, Text } from '@housekeeping/ui';
import { useState, useSyncExternalStore } from 'react';

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
      // The head of every window that decides something: "Abbrechen" · question · the named
      // button on phones, both at the bottom on wider screens (spec 0054, REQ-007).
      actions={{
        cancel: {
          label: props.cancelLabel ?? 'Abbrechen',
          onPress: props.onCancel,
          testID: `${props.testID}-cancel`,
        },
        primary: {
          label: props.confirmLabel,
          disabled: blocked,
          hint: blocked ? online.hint : undefined,
          onPress: () => setError(props.onConfirm() ?? undefined),
          testID: `${props.testID}-confirm`,
        },
      }}
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

/** What "Löschen" asks before it deletes (spec 0036, REQ-012). */
export interface ConfirmRequest {
  /** "„Bless“ löschen?", "Foto entfernen?" */
  title: string;
  message?: string;
  /** "Löschen", "Entfernen" */
  confirmLabel: string;
  /** "Abbrechen" unless given, e.g. "Weiter bearbeiten" (spec 0037, AC-005). */
  cancelLabel?: string;
  /** Default true: offline the confirm button is greyed out with the hint. */
  needsNetwork?: boolean;
  /** Runs on the confirm button; a returned hint keeps the window open. */
  onConfirm: () => string | undefined | void;
  /** Default "confirm-delete"; the buttons are `<testID>-confirm` and `<testID>-cancel`. */
  testID?: string;
}

const confirmSlot = createRequestSlot<ConfirmRequest>();

/**
 * Every delete and remove asks first (spec 0036, REQ-012, Entscheidung 1): call this instead of
 * deleting, from a button, a menu or a swipe. Nothing happens until the confirm button; "Abbrechen",
 * Escape and a tap outside leave everything as it is. There is no "Rückgängig" afterwards.
 */
export function confirmFirst(request: ConfirmRequest): void {
  confirmSlot.open(request);
}

/**
 * Closing a window with typed text (Escape, a tap outside, "Abbrechen", pulled down) asks
 * "Änderungen verwerfen?" first; an untouched window just closes (review 0003: B-04 for "Neu",
 * I-07 for the windows on the recipe page).
 */
export function discardFirst(dirty: boolean, close: () => void, testID = 'confirm-discard'): void {
  if (!dirty) {
    close();
    return;
  }
  confirmFirst({
    title: 'Änderungen verwerfen?',
    confirmLabel: 'Verwerfen',
    cancelLabel: 'Weiter bearbeiten',
    needsNetwork: false,
    onConfirm: close,
    testID,
  });
}

/** Shows the open `confirmFirst` request; mounted once at the root, over every window. */
export function ConfirmHost() {
  const request = useSyncExternalStore(
    confirmSlot.subscribe,
    confirmSlot.current,
    confirmSlot.current,
  );
  if (!request) return null;
  return (
    <ConfirmDialog
      // A new request starts without the hint of the one before.
      key={request.title}
      title={request.title}
      message={request.message}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      needsNetwork={request.needsNetwork}
      onConfirm={() => {
        const hint = request.onConfirm();
        if (!hint) confirmSlot.close(request);
        return hint;
      }}
      onCancel={() => confirmSlot.close(request)}
      testID={request.testID ?? 'confirm-delete'}
    />
  );
}
