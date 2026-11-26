import { loadPhoto } from '@housekeeping/api';
import { toast } from '@housekeeping/ui';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { copyText } from './clipboard';

// "Teilen" (spec 0042, REQ-004, Decision 3): the share menu of the device with a readable text
// (and the photo when the device can share files), else the text is copied: "Kopiert" (AC-010).

interface ShareData {
  title?: string;
  text?: string;
  files?: File[];
}

interface WebShare {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
}

function webShare(): WebShare | undefined {
  if (Platform.OS !== 'web') return undefined;
  return (globalThis as { navigator?: WebShare }).navigator;
}

/** The address of a page of the app ("/rezept/<id>"), for the end of a shared text. */
export function appLink(path: string): string | undefined {
  if (Platform.OS !== 'web') return undefined;
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
  return origin ? `${origin}${path}` : undefined;
}

/**
 * Shares in the tap: the browser asks for it right inside the press, so the photo is prepared
 * beforehand (useShareFile). Cancelling the menu does nothing; without a menu or when the browser
 * refuses, the text is copied.
 */
export async function shareText(input: {
  title: string;
  text: string;
  file?: File;
}): Promise<void> {
  const navigator = webShare();
  if (typeof navigator?.share === 'function') {
    const data: ShareData = { title: input.title, text: input.text };
    if (input.file && navigator.canShare?.({ files: [input.file] })) data.files = [input.file];
    try {
      await navigator.share(data);
      return;
    } catch (error) {
      if ((error as { name?: string } | undefined)?.name === 'AbortError') return;
    }
  }
  toast.show({
    message: (await copyText(input.text)) ? 'Kopiert' : 'Teilen hat nicht geklappt.',
  });
}

/**
 * The own photo of an entry as a file to share along, prepared while the page is shown (from the
 * device storage, else downloaded); undefined without a photo, while it loads or where files
 * cannot be shared.
 */
export function useShareFile(photoPath: string | undefined, name: string): File | undefined {
  const [file, setFile] = useState<{ path: string; file: File } | undefined>();
  useEffect(() => {
    if (!photoPath || typeof webShare()?.canShare !== 'function' || typeof File === 'undefined') {
      return;
    }
    let current = true;
    const fileName = `${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'foto'}.jpg`;
    loadPhoto(photoPath)
      .then((blob) => {
        if (current && blob) {
          setFile({ path: photoPath, file: new File([blob], fileName, { type: 'image/jpeg' }) });
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [photoPath, name]);
  return file && file.path === photoPath ? file.file : undefined;
}
