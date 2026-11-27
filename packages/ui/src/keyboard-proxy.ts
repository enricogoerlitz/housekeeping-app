// Natively a focused field opens the keyboard whenever it is focused; nothing to prepare.

/** How long a tap's keyboard waits for its window (spec 0033, decision 10). */
export const HANDOVER_MS = 1500;

/** Call synchronously in the tap that opens a window to create or edit something. */
export function openKeyboardNow(): void {
  return undefined;
}

/** A window's first field takes the keyboard of `openKeyboardNow`; false when none waits. */
export function handOverKeyboard(_input: unknown): boolean {
  return false;
}

/** A window opened by the tap's keyboard starts to slide in (web only). */
export function holdHandOver(): void {
  return undefined;
}

/** The new content first, then its field takes the cursor (spec 0055, REQ-001). */
export function focusAfterChange(
  change: () => void,
  field: () => unknown,
  _options: { onlyWhenTyping?: boolean } = {},
): void {
  change();
  setTimeout(() => (field() as { focus?: () => void } | null)?.focus?.(), 0);
}
