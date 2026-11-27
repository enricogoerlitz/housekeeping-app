// Where a photo comes from in the photo window (spec 0039): which image format some bytes are,
// and whether a pasted text is an image address the server may load. This file may import
// nothing: `pnpm gen:edge` copies it into supabase/functions/_shared/image-source.gen.ts, so the
// app and fetch-image check the same way.

/** The formats the app takes from a file, the clipboard or an address; never SVG (it is code). */
export type ImageType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/avif';

const MAX_ADDRESS_LENGTH = 2048;

function startsWith(bytes: Uint8Array, offset: number, expected: readonly number[] | string) {
  const values =
    typeof expected === 'string' ? [...expected].map((char) => char.charCodeAt(0)) : expected;
  return values.every((value, index) => bytes[offset + index] === value);
}

/**
 * The image format by the first bytes (the file's own signature, not its name or declared type);
 * undefined for anything else, e.g. a PDF or an HTML page.
 */
export function imageTypeOf(bytes: Uint8Array): ImageType | undefined {
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, 0, 'GIF87a') || startsWith(bytes, 0, 'GIF89a')) return 'image/gif';
  if (startsWith(bytes, 0, 'RIFF') && startsWith(bytes, 8, 'WEBP')) return 'image/webp';
  if (startsWith(bytes, 4, 'ftypavif') || startsWith(bytes, 4, 'ftypavis')) return 'image/avif';
  return undefined;
}

/**
 * The pasted text as an image address: `https://` with a host, no user name or password, no
 * spaces, at most 2048 characters; undefined otherwise. Split by hand (core has no URL global);
 * whether it really is a public image the server decides.
 */
export function imageAddress(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed.length > MAX_ADDRESS_LENGTH || /\s/.test(trimmed)) return undefined;
  const match = /^https:\/\/([^/?#]+)([/?#].*)?$/i.exec(trimmed);
  const authority = match?.[1];
  if (!authority || authority.includes('@') || authority.startsWith(':')) return undefined;
  return `https://${trimmed.slice('https://'.length)}`;
}

/**
 * The pasted text is an address (a scheme, `://` and something after it) the app will not load,
 * e.g. `http://…` or one with a password: the window says so instead of ignoring it (AC-007).
 * Text still being typed (`https://`) is not.
 */
export function unsuitableImageAddress(text: string): boolean {
  const trimmed = text.trim();
  return /^[a-z][a-z0-9+.-]*:\/\/\S/i.test(trimmed) && imageAddress(trimmed) === undefined;
}
