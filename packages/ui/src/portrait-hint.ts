// Spec 0034, REQ-009: the app stays in portrait on phones. Android's installed app keeps it by the
// manifest; iOS does not let a web app lock it, so a phone held sideways gets a hint instead.

/** A screen whose short side is below this is a phone, also when held sideways. */
const PHONE_SHORT_SIDE = 500;

export interface ScreenShape {
  width: number;
  height: number;
  /** Mouse or trackpad: a desktop window, never a phone. */
  finePointer: boolean;
}

/** Whether a phone is held sideways and should show "Bitte Handy hochkant halten" (AC-021). */
export function needsPortraitHint(screen: ScreenShape): boolean {
  if (screen.finePointer) return false;
  return screen.width > screen.height && screen.height < PHONE_SHORT_SIDE;
}
