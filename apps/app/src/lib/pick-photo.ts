import { pickImageFile } from '@housekeeping/ui';
import { Platform } from 'react-native';

/** Photos are chosen in the browser for now; natively the photo library follows (spec 0004). */
export const CAN_PICK_PHOTO = Platform.OS === 'web';

/**
 * Opens the browser's file picker (on phones also the camera). Call it synchronously inside the
 * press handler: browsers open the picker only for a direct user action. Cancelling calls nothing.
 * The picker stays in the document until it reports back (spec 0033, REQ-008).
 */
export function pickPhotoFile(onFile: (file: File) => void): void {
  if (!CAN_PICK_PHOTO) return;
  pickImageFile(onFile);
}
