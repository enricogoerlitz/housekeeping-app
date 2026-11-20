import { Platform } from 'react-native';

/** Photos are chosen in the browser for now; natively the photo library follows (spec 0004). */
export const CAN_PICK_PHOTO = Platform.OS === 'web';

/**
 * Opens the browser's file picker (on phones also the camera). Call it synchronously inside the
 * press handler: browsers open the picker only for a direct user action. Cancelling calls nothing.
 */
export function pickPhotoFile(onFile: (file: File) => void): void {
  if (!CAN_PICK_PHOTO) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) onFile(file);
  };
  input.click();
}
