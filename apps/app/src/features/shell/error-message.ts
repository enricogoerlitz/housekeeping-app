import { TransportError, WRITE_REJECTED_MESSAGE } from '@housekeeping/api';

/** The fallback of windows whose failure is not a write ("Das hat nicht geklappt."). */
export const FAILED_MESSAGE = 'Das hat nicht geklappt.';

/**
 * The text a window shows for a failed command (spec 0031, AC-060): the hint of a command's own
 * check ("Titel fehlt", "Offline – …"), otherwise `fallback`. A refusal of the server carries only
 * a code ("permanent: 23503"), so it reads as WRITE_REJECTED_MESSAGE; never `String(error)`.
 */
export function errorMessage(error: unknown, fallback = WRITE_REJECTED_MESSAGE): string {
  if (error instanceof TransportError) return WRITE_REJECTED_MESSAGE;
  return error instanceof Error && error.message ? error.message : fallback;
}
