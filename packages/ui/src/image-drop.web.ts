// Dragging an image into the photo window or pasting one with ⌘V / Strg+V (spec 0039, REQ-002).
// While the window is open the whole page takes the drop, so the browser never opens the file
// itself; a paste with a file in the clipboard is taken, a paste of text is left to the field
// it goes into. Whether the file is an image the caller decides ("Das ist kein Bild").
import { useEffect, useRef, useState } from 'react';

import { fileFromTransfer } from './transfer-file';

const carriesFiles = (data: DataTransfer | null | undefined) =>
  !!data && Array.from(data.types ?? []).includes('Files');

/**
 * Takes dropped and pasted files while `enabled`; true while a file is dragged over the page.
 *
 * @public Metro resolves the import of the native twin to this file on the web.
 */
export function useImageDropAndPaste(enabled: boolean, onFile: (file: File) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const latest = useRef(onFile);
  useEffect(() => {
    latest.current = onFile;
  }, [onFile]);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    const over = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setDragging(true);
    };
    // Leaving a child fires dragleave too; only leaving the page has no element to go to.
    const leave = (event: DragEvent) => {
      if (event.relatedTarget === null || event.relatedTarget === undefined) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      setDragging(false);
      const file = fileFromTransfer(event.dataTransfer);
      if (!file) return;
      event.preventDefault();
      latest.current(file);
    };
    const paste = (event: ClipboardEvent) => {
      const file = fileFromTransfer(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      latest.current(file);
    };
    document.addEventListener('dragenter', over);
    document.addEventListener('dragover', over);
    document.addEventListener('dragleave', leave);
    document.addEventListener('drop', drop);
    document.addEventListener('paste', paste);
    return () => {
      document.removeEventListener('dragenter', over);
      document.removeEventListener('dragover', over);
      document.removeEventListener('dragleave', leave);
      document.removeEventListener('drop', drop);
      document.removeEventListener('paste', paste);
      setDragging(false);
    };
  }, [enabled]);

  return dragging;
}
