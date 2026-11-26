/** Natively there is nothing to drop or paste into the photo window (the app ships as a PWA). */
export function useImageDropAndPaste(_enabled: boolean, _onFile: (file: File) => void): boolean {
  return false;
}
