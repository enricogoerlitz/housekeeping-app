import { Platform } from 'react-native';

// The clipboard of the web app (spec 0042, REQ-004): copying a shared text where the device has
// no share menu. Reading it ("Einfügen" in the place field) is gone (spec 0042, decision 14).
// The native apps are parked (PWA only).

interface WebClipboard {
  writeText?: (text: string) => Promise<void>;
}

function webClipboard(): WebClipboard | undefined {
  if (Platform.OS !== 'web') return undefined;
  return (globalThis as { navigator?: { clipboard?: WebClipboard } }).navigator?.clipboard;
}

/** Copies a text; false when the browser refused. */
export async function copyText(text: string): Promise<boolean> {
  const write = webClipboard()?.writeText;
  if (!write) return false;
  try {
    await write.call(webClipboard(), text);
    return true;
  } catch {
    return false;
  }
}
