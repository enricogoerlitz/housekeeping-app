// Spec 0031, REQ-031: a press tells whether a finger made it. In the browser the click is a
// PointerEvent and names its pointer; a mouse click on a touch screen is no finger. Without a
// pointer type (older engines, native) the main pointer of the device decides.

/** True when a finger made the press; `finePointer` is the device's main pointer (`useFinePointer`). */
export function pressedWithFinger(
  event: { nativeEvent?: unknown } | undefined,
  finePointer: boolean,
): boolean {
  const native = event?.nativeEvent;
  const type =
    typeof native === 'object' && native !== null && 'pointerType' in native
      ? native.pointerType
      : undefined;
  if (typeof type === 'string') return type === 'touch';
  return !finePointer;
}
