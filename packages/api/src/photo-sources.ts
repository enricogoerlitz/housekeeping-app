// Where a photo in the photo window comes from (spec 0039): a file chosen, dragged in or pasted,
// or an image address the server loads (edge function fetch-image, ADR-0016). Either way the app
// then prepares it like every photo (preparePhoto: 1600 px, JPEG, no metadata). Online only.
import { imageAddress, imageTypeOf } from '@housekeeping/core';

import { onlineCall } from './backend';
import { getState, OfflineError } from './store';
import { TransportError } from './transport';

export const NOT_AN_IMAGE_MESSAGE = 'Das ist kein Bild';
export const NO_IMAGE_AT_ADDRESS_MESSAGE = 'Unter dieser Adresse ist kein passendes Bild';
export const IMAGE_ADDRESS_FAILED_MESSAGE =
  'Das Bild ließ sich gerade nicht laden – bitte noch einmal versuchen';

/** AC-005: a file that does not say it is an image (a PDF, a document) is refused. */
export function checkImageFile(file: Blob): Blob {
  if (!file.type.startsWith('image/')) throw new Error(NOT_AN_IMAGE_MESSAGE);
  return file;
}

/**
 * AC-006, AC-007: the image at a pasted https address, loaded by the server for the active
 * household and typed by its own bytes; NO_IMAGE_AT_ADDRESS_MESSAGE when there is none (also for
 * a text that is no https address, before anything is sent), OfflineError without network.
 */
export async function loadPhotoFromAddress(text: string): Promise<Blob> {
  const url = imageAddress(text);
  if (!url) throw new Error(NO_IMAGE_AT_ADDRESS_MESSAGE);
  let image: Blob;
  try {
    image = await onlineCall((transport) =>
      transport.fetchImage({ householdId: getState().activeHouseholdId, url }),
    );
  } catch (error) {
    if (error instanceof OfflineError) throw error;
    if (error instanceof TransportError && error.kind === 'permanent')
      throw new Error(NO_IMAGE_AT_ADDRESS_MESSAGE);
    throw new Error(IMAGE_ADDRESS_FAILED_MESSAGE);
  }
  const bytes = new Uint8Array(await image.arrayBuffer());
  const type = imageTypeOf(bytes);
  if (!type) throw new Error(NO_IMAGE_AT_ADDRESS_MESSAGE);
  return new Blob([bytes], { type });
}
