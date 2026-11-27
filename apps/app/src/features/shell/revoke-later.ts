/** Longer than a window's fade-out (200 ms), with room to spare. */
const AFTER_CLOSE_MS = 1000;

/**
 * Frees a preview's blob: URL once the window showing it has gone. Revoked at once, the image of
 * the closing window asks for it again and the console shows `net::ERR_FILE_NOT_FOUND`.
 */
export function revokeLater(uri: string): void {
  setTimeout(() => URL.revokeObjectURL(uri), AFTER_CLOSE_MS);
}
