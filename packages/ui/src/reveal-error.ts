/**
 * Whether a TextField scrolls its error into view: only an error that appears while the field is
 * already shown (after typing or saving). A field that mounts with an error, e.g. on a page that
 * opens scrolled to the top, must not move the page.
 */
export function revealsError(state: { mounted: boolean; error: string | undefined }): boolean {
  return state.mounted && !!state.error;
}
