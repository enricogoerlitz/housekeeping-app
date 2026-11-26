import { Platform } from 'react-native';

// The clipboard of the web app (spec 0042, REQ-003, REQ-004). Reading needs a tap: iOS shows its
// "Einfügen" bubble every time, reading on focus is not possible (WebKit 266569), so the place
// field reads it only behind its "Einfügen" button. The native apps are parked (PWA only).

interface WebClipboard {
  readText?: () => Promise<string>;
  writeText?: (text: string) => Promise<void>;
}

function webClipboard(): WebClipboard | undefined {
  if (Platform.OS !== 'web') return undefined;
  return (globalThis as { navigator?: { clipboard?: WebClipboard } }).navigator?.clipboard;
}

/** Whether "Einfügen" can read the clipboard here (no Firefox before 125, no insecure origin). */
export function canReadClipboard(): boolean {
  return typeof webClipboard()?.readText === 'function';
}

/** The clipboard's text; undefined when it is empty, refused or cannot be read. */
export async function readClipboardText(): Promise<string | undefined> {
  const read = webClipboard()?.readText;
  if (!read) return undefined;
  try {
    return (await read.call(webClipboard())) || undefined;
  } catch {
    return undefined;
  }
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
