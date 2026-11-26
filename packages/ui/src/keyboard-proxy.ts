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
