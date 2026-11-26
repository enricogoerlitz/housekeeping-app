import type { PickImageOptions } from './pick-image-options';

/** Photos are chosen in the browser for now; natively the photo library follows (spec 0004). */
export function pickImageFile(_onFile: (file: File) => void, _options?: PickImageOptions): void {}
