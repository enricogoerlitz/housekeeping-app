import { describe, expect, it } from 'vitest';

import { imageAddress, imageTypeOf } from './image-source';

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(
    values.flatMap((value) =>
      typeof value === 'string' ? [...value].map((char) => char.charCodeAt(0)) : [value],
    ),
  );

describe('imageTypeOf (spec 0039, decision 1)', () => {
  it('AC-003: recognises JPEG, PNG, GIF, WebP and AVIF by their signature', () => {
    expect(imageTypeOf(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('image/jpeg');
    expect(imageTypeOf(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
    expect(imageTypeOf(bytes('GIF89a', 1, 0))).toBe('image/gif');
    expect(imageTypeOf(bytes('GIF87a', 1, 0))).toBe('image/gif');
    expect(imageTypeOf(bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 '))).toBe('image/webp');
    expect(imageTypeOf(bytes(0, 0, 0, 0x1c, 'ftypavif', 0, 0))).toBe('image/avif');
  });

  it('AC-005: a PDF, HTML, SVG or empty bytes are no image', () => {
    expect(imageTypeOf(bytes('%PDF-1.7'))).toBeUndefined();
    expect(imageTypeOf(bytes('<!doctype html><html>'))).toBeUndefined();
    expect(imageTypeOf(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeUndefined();
    expect(imageTypeOf(bytes())).toBeUndefined();
    expect(imageTypeOf(bytes('RIFF', 0, 0, 0, 0, 'WAVEfmt '))).toBeUndefined();
    expect(imageTypeOf(bytes(0, 0, 0, 0x1c, 'ftypmp42'))).toBeUndefined();
  });
});

describe('imageAddress (spec 0039, REQ-003)', () => {
  it('AC-006: a pasted https address, trimmed, is the address to load', () => {
    expect(imageAddress('  https://example.org/bilder/kuchen.jpg \n')).toBe(
      'https://example.org/bilder/kuchen.jpg',
    );
  });

  it('AC-007: anything else (http, no address, other schemes, credentials) is none', () => {
    expect(imageAddress('http://example.org/kuchen.jpg')).toBeUndefined();
    expect(imageAddress('kuchen.jpg')).toBeUndefined();
    expect(imageAddress('')).toBeUndefined();
    expect(imageAddress('data:image/png;base64,AAAA')).toBeUndefined();
    expect(imageAddress('https://user:pass@example.org/a.jpg')).toBeUndefined();
    expect(imageAddress(`https://example.org/${'a'.repeat(2100)}`)).toBeUndefined();
  });
});
