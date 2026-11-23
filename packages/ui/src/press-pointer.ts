// Spec 0031, REQ-031: a press tells whether a finger made it. In the browser the click is a
// PointerEvent and names its pointer; a mouse click on a touch screen is no finger. Without a
// pointer type (older engines, native) the main pointer of the device decides.

interface PressLike {
  nativeEvent?: { pointerType?: unknown };
}

/** True when a finger made the press; `finePointer` is the device's main pointer (`useFinePointer`). */
export function pressedWithFinger(event: PressLike | undefined, finePointer: boolean): boolean {
  const type = event?.nativeEvent?.pointerType;
  if (typeof type === 'string') return type === 'touch';
  return !finePointer;
}
