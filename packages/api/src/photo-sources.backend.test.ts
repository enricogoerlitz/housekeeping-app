// Where a photo in the photo window comes from (spec 0039): a file (chosen, dragged in or
// pasted) is checked for being an image; an image address is loaded by the server (fetch-image).
import { describe, expect, it } from 'vitest';

import { H, withBackend } from './backend-test-helpers';
import {
  checkImageFile,
  IMAGE_ADDRESS_FAILED_MESSAGE,
  loadPhotoFromAddress,
  NO_IMAGE_AT_ADDRESS_MESSAGE,
  NOT_AN_IMAGE_MESSAGE,
} from './photo-sources';
import { OfflineError } from './store';
import { TransportError } from './transport';

const fx = withBackend();

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const ADDRESS = 'https://bilder.example.org/kuchen.png';

describe('checkImageFile (spec 0039, REQ-002)', () => {
  it('AC-003: a JPEG from the Finder is taken as it is', () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'kuchen.jpg', {
      type: 'image/jpeg',
    });
    expect(checkImageFile(file)).toBe(file);
  });

  it('AC-005: a PDF or a file without a type is "Das ist kein Bild"', () => {
    const pdf = new File(['%PDF-1.7'], 'rezept.pdf', { type: 'application/pdf' });
    expect(() => checkImageFile(pdf)).toThrow(NOT_AN_IMAGE_MESSAGE);
    expect(() => checkImageFile(new File(['x'], 'x'))).toThrow('Das ist kein Bild');
  });
});

describe('loadPhotoFromAddress (spec 0039, REQ-003)', () => {
  it('AC-006: the server loads the image; it comes back typed by its own bytes', async () => {
    await fx.startEnrico();
    fx.server.setImageAddress(ADDRESS, new Blob([PNG], { type: 'application/octet-stream' }));
    const image = await loadPhotoFromAddress(`  ${ADDRESS} `);
    expect(image.type).toBe('image/png');
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);
    expect(fx.calls).toEqual([{ fn: 'fetchImage', args: [{ householdId: H, url: ADDRESS }] }]);
  });

  it('AC-007: an address without a suitable image says so in German', async () => {
    await fx.startEnrico();
    await expect(loadPhotoFromAddress('https://example.org/seite')).rejects.toThrow(
      NO_IMAGE_AT_ADDRESS_MESSAGE,
    );
    expect(NO_IMAGE_AT_ADDRESS_MESSAGE).toBe('Unter dieser Adresse ist kein passendes Bild');
  });

  it('AC-007: an http or internal-looking text is refused before the server is asked', async () => {
    await fx.startEnrico();
    for (const text of ['http://localhost/a.jpg', 'kuchen.jpg', ''])
      await expect(loadPhotoFromAddress(text)).rejects.toThrow(NO_IMAGE_AT_ADDRESS_MESSAGE);
    expect(fx.calls).toEqual([]);
  });

  it('AC-007: bytes that are no image (server answered something odd) are refused', async () => {
    await fx.startEnrico();
    fx.server.setImageAddress(ADDRESS, new Blob(['<html>']));
    await expect(loadPhotoFromAddress(ADDRESS)).rejects.toThrow(NO_IMAGE_AT_ADDRESS_MESSAGE);
  });

  it('a network failure asks to try again; offline it is not tried', async () => {
    const engine = await fx.startEnrico();
    fx.server.setImageAddress(ADDRESS, new Blob([PNG]));
    fx.server.failNext('fetch-image', new TransportError('transient', 'network', 0));
    await expect(loadPhotoFromAddress(ADDRESS)).rejects.toThrow(IMAGE_ADDRESS_FAILED_MESSAGE);
    engine.setSimulatedOffline(true);
    await expect(loadPhotoFromAddress(ADDRESS)).rejects.toBeInstanceOf(OfflineError);
  });
});
