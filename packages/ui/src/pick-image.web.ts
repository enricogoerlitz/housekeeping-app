// The browser's picker for one image (spec 0033, REQ-008, decision 5). The file input stays in
// the document until the picker reports back: an input that hangs nowhere can be collected, and
// iOS then drops the chosen photo, so the first try came back empty.

import type { PickImageOptions } from './pick-image-options';

let pending: HTMLInputElement | null = null;

/**
 * Opens the picker (on phones also the camera). Call it synchronously inside the press handler:
 * browsers open the picker only for a direct user action. Cancelling calls nothing.
 *
 * @public Metro resolves the import of the native twin to this file on the web.
 */
export function pickImageFile(onFile: (file: File) => void, options: PickImageOptions = {}): void {
  if (typeof document === 'undefined') return;
  pending?.remove();
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  // "Foto aufnehmen" (spec 0039, AC-009): phones open the rear camera directly.
  if (options.camera) input.setAttribute('capture', 'environment');
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';
  const done = () => {
    input.remove();
    if (pending === input) pending = null;
  };
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    done();
    if (file) onFile(file);
  });
  input.addEventListener('cancel', done);
  document.body.append(input);
  pending = input;
  input.click();
}
