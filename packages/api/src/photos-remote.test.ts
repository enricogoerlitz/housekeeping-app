// The device side of own photos (spec 0004, REQ-004) without a browser: checking the chosen file,
// the size math, re-encoding through a stubbed canvas, removing location metadata from the bytes,
// German messages for storage errors. Showing photos on screens: photos-remote.backend.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkPhotoFile,
  fitWithin,
  PHOTO_FORBIDDEN_MESSAGE,
  PHOTO_UNUSABLE_MESSAGE,
  PHOTO_UPLOAD_FAILED_MESSAGE,
  preparePhoto,
  stripJpegMetadata,
  toPhotoError,
} from './photos-remote';
import { OfflineError } from './store';
import { TransportError } from './transport';

const MB = 1024 * 1024;

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const be16 = (value: number) => [(value >> 8) & 0xff, value & 0xff];
const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  ...be16(payload.length + 2),
  ...payload,
];

/** TIFF (big endian) with IFD0 → GPS IFD holding GPSLatitudeRef "N" and a GPSLatitude. */
function exifWithGps(): number[] {
  const tiff = [
    ...ascii('MM'),
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08,
    // IFD0: one entry, GPSInfo (0x8825, LONG) → offset 26
    ...be16(1),
    ...be16(0x8825),
    ...be16(4),
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    26,
    0,
    0,
    0,
    0,
    // GPS IFD at 26: GPSLatitudeRef (1, ASCII "N")
    ...be16(1),
    ...be16(0x0001),
    ...be16(2),
    0,
    0,
    0,
    2,
    ...ascii('N'),
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ];
  return [...ascii('Exif'), 0, 0, ...tiff];
}

const SCAN = [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9];
const JFIF = segment(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const ICC = segment(0xe2, [...ascii('ICC_PROFILE'), 0, 1, 1, 9, 9]);
const DQT = segment(0xdb, [0, ...Array<number>(64).fill(1)]);
const SOS = segment(0xda, [1, 1, 0, 0, 0x3f, 0]);

/** A tiny JPEG as a camera writes it: JFIF, Exif with a GPS block, XMP, a comment, then the scan. */
function cameraJpeg(): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    0xff,
    0xd8,
    ...JFIF,
    ...segment(0xe1, exifWithGps()),
    ...segment(0xe1, [
      ...ascii('http://ns.adobe.com/xap/1.0/'),
      0,
      ...ascii('<exif:GPSLatitude/>'),
    ]),
    ...ICC,
    ...segment(0xfe, ascii('Urlaub')),
    ...segment(0xed, ascii('Photoshop 3.0')),
    ...DQT,
    ...SOS,
    ...SCAN,
  ]);
}

const includes = (bytes: Uint8Array, text: string) =>
  Array.from(bytes, (byte) => String.fromCharCode(byte))
    .join('')
    .includes(text);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('checking the chosen file (AC-010)', () => {
  it('AC-010: a file that is no image or larger than 15 MB is refused with the German message', () => {
    expect(() => checkPhotoFile(new Blob(['%PDF'], { type: 'application/pdf' }))).toThrow(
      PHOTO_UNUSABLE_MESSAGE,
    );
    expect(PHOTO_UNUSABLE_MESSAGE).toBe('Dieses Bild können wir nicht verwenden');
    expect(() =>
      checkPhotoFile(new Blob([new Uint8Array(15 * MB + 1)], { type: 'image/jpeg' })),
    ).toThrow(PHOTO_UNUSABLE_MESSAGE);
    expect(() => checkPhotoFile(new Blob([], { type: 'image/png' }))).toThrow(
      PHOTO_UNUSABLE_MESSAGE,
    );
    expect(() =>
      checkPhotoFile(new Blob([new Uint8Array(15 * MB)], { type: 'image/heic' })),
    ).not.toThrow();
  });

  it('AC-010: preparePhoto refuses an unusable file before decoding anything', async () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    await expect(preparePhoto(new Blob(['text'], { type: 'text/plain' }))).rejects.toThrow(
      PHOTO_UNUSABLE_MESSAGE,
    );
    expect(decode).not.toHaveBeenCalled();
  });
});

describe('size (AC-009: longest side at most 1600 px)', () => {
  it.each([
    [4000, 3000, 1600, 1200],
    [3000, 4000, 1200, 1600],
    [1600, 900, 1600, 900],
    [800, 600, 800, 600],
    [5000, 10, 1600, 3],
    [10, 5000, 3, 1600],
    [6000, 1, 1600, 1],
  ])('%i × %i → %i × %i', (width, height, outWidth, outHeight) => {
    expect(fitWithin(width, height)).toEqual({ width: outWidth, height: outHeight });
  });
});

describe('location metadata', () => {
  it('a JPEG with an EXIF GPS block comes out without Exif, XMP, IPTC and comments; the image stays', () => {
    const input = cameraJpeg();
    expect(includes(input, 'Exif')).toBe(true);
    const output = stripJpegMetadata(input);
    expect(includes(output, 'Exif')).toBe(false);
    expect(includes(output, 'GPSLatitude')).toBe(false);
    expect(includes(output, 'Photoshop')).toBe(false);
    expect(includes(output, 'Urlaub')).toBe(false);
    expect([...output]).toEqual([0xff, 0xd8, ...JFIF, ...ICC, ...DQT, ...SOS, ...SCAN]);
  });

  it('leaves a JPEG without metadata as it is and refuses bytes that are no JPEG', () => {
    const clean = new Uint8Array([0xff, 0xd8, ...JFIF, ...DQT, ...SOS, ...SCAN]);
    expect([...stripJpegMetadata(clean)]).toEqual([...clean]);
    expect(() => stripJpegMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toThrow(
      PHOTO_UNUSABLE_MESSAGE,
    );
    expect(() => stripJpegMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00]))).toThrow(
      PHOTO_UNUSABLE_MESSAGE,
    );
  });
});

describe('preparePhoto (canvas stubbed; the real canvas runs in e2e)', () => {
  function stubCanvas(encoded: Uint8Array<ArrayBuffer> | null) {
    const bitmap = { width: 4000, height: 3000, close: vi.fn() };
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn((done: (blob: Blob | null) => void, type: string, quality: number) => {
        done(encoded ? new Blob([encoded], { type }) : null);
        return quality;
      }),
    };
    const decode = vi.fn(async () => bitmap);
    vi.stubGlobal('createImageBitmap', decode);
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
    return { bitmap, canvas, drawImage, decode };
  }

  it('AC-009: draws at most 1600 px, encodes JPEG 0.82 and strips what the encoder added', async () => {
    const { bitmap, canvas, drawImage, decode } = stubCanvas(cameraJpeg());
    const file = new Blob([new Uint8Array(3 * MB)], { type: 'image/jpeg' });
    const photo = await preparePhoto(file);
    expect(decode).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
    expect([canvas.width, canvas.height]).toEqual([1600, 1200]);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 1200);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.82);
    expect(bitmap.close).toHaveBeenCalled();
    expect(photo.type).toBe('image/jpeg');
    const bytes = new Uint8Array(await photo.arrayBuffer());
    expect(includes(bytes, 'Exif')).toBe(false);
    expect(includes(bytes, 'GPSLatitude')).toBe(false);
  });

  it('AC-010: a file the browser cannot decode or encode is refused with the German message', async () => {
    stubCanvas(null);
    await expect(preparePhoto(new Blob(['x'], { type: 'image/jpeg' }))).rejects.toThrow(
      PHOTO_UNUSABLE_MESSAGE,
    );
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('InvalidStateError');
      }),
    );
    await expect(preparePhoto(new Blob(['x'], { type: 'image/heic' }))).rejects.toThrow(
      PHOTO_UNUSABLE_MESSAGE,
    );
  });
});

describe('storage errors in German', () => {
  it.each([
    ['too_large', 413, PHOTO_UNUSABLE_MESSAGE],
    ['invalid_mime', 415, PHOTO_UNUSABLE_MESSAGE],
    ['access_denied', 403, PHOTO_FORBIDDEN_MESSAGE],
    ['already_exists', 409, PHOTO_UPLOAD_FAILED_MESSAGE],
  ] as const)('%s (%i)', (code, status, message) => {
    expect(toPhotoError(new TransportError('permanent', code, status)).message).toBe(message);
  });

  it('a network failure asks to try again; offline stays the offline hint', () => {
    expect(toPhotoError(new TransportError('transient', 'network', 0)).message).toBe(
      PHOTO_UPLOAD_FAILED_MESSAGE,
    );
    const offline = new OfflineError();
    expect(toPhotoError(offline)).toBe(offline);
    expect(PHOTO_FORBIDDEN_MESSAGE).toMatch(/Berechtigung/);
    expect(PHOTO_UPLOAD_FAILED_MESSAGE).toMatch(/noch einmal/);
  });
});
