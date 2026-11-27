// Spec 0034, REQ-009: the app stays in portrait on phones. Android's installed app keeps it by the
// manifest; iOS does not let a web app lock it, so a phone held sideways gets a hint instead.

/** A screen whose short side is below this is a phone, also when held sideways. */
const PHONE_SHORT_SIDE = 500;

export interface ScreenShape {
  width: number;
  height: number;
  /** Mouse or trackpad: a desktop window, never a phone. */
  finePointer: boolean;
  /** How the screen is held, when the browser says so (`screen.orientation`). */
  orientation?: 'portrait' | 'landscape';
  /** The whole screen; unlike the window it does not shrink when the keyboard opens. */
  screen?: { width: number; height: number };
}

/** Whether a phone is held sideways and should show "Bitte Handy hochkant halten" (AC-021). */
export function needsPortraitHint(screen: ScreenShape): boolean {
  if (screen.finePointer) return false;
  // The keyboard shrinks the window (on iOS the visible area) below its width while the phone is
  // upright: the screen's own orientation and size decide (iPhone click-through, review 0003).
  if (screen.orientation && screen.screen) {
    const shortSide = Math.min(screen.screen.width, screen.screen.height);
    return screen.orientation === 'landscape' && shortSide < PHONE_SHORT_SIDE;
  }
  return screen.width > screen.height && screen.height < PHONE_SHORT_SIDE;
}
