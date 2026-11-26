// "Mit KI ausfüllen" and the image variants (spec 0040, ADR-0016): the edge functions
// ai-recipe-draft and ai-image with the active household. The app shrinks the photos first
// (preparePhoto with 1280 px for a draft, 1024 px for "Aus diesem Foto"); here they become JPEG
// data URLs. Nothing is saved: a draft fills the edit mode, a variant is stored only by
// "Übernehmen" through the usual photo path.
import type { ImageStyle, RecipeDraftReply } from '@housekeeping/core';

import { aiCall } from './ai';
import { getState } from './store';

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function jpegDataUrl(photo: Blob): Promise<string> {
  return `data:image/jpeg;base64,${bytesToBase64(new Uint8Array(await photo.arrayBuffer()))}`;
}

/**
 * AC-001 – AC-007: a draft from text, links and photos (JPEGs from preparePhoto). Throws AiError
 * (the AI failed or took too long) or OfflineError (nothing is sent).
 */
export async function draftRecipeAsync(input: {
  text: string;
  links: readonly string[];
  photos: readonly Blob[];
  /** "Foto generieren" (REQ-003). */
  imagePrompt: boolean;
}): Promise<RecipeDraftReply> {
  const householdId = getState().activeHouseholdId;
  return aiCall(async (transport) =>
    transport.aiRecipeDraft({
      householdId,
      text: input.text.trim(),
      links: [...input.links],
      photos: await Promise.all(input.photos.map(jpegDataUrl)),
      imagePrompt: input.imagePrompt,
    }),
  );
}

/**
 * AC-012 – AC-015: up to three variants as JPEG blobs and how many failed; `image` (a JPEG from
 * preparePhoto) for "Aus diesem Foto". Nothing is stored.
 */
export async function generateImagesAsync(input: {
  prompt: string;
  styles: readonly ImageStyle[];
  image?: Blob;
}): Promise<{ images: Blob[]; failed: number }> {
  const householdId = getState().activeHouseholdId;
  const reply = await aiCall(async (transport) =>
    transport.aiImage({
      householdId,
      prompt: input.prompt.trim(),
      styles: [...input.styles],
      ...(input.image ? { image: await jpegDataUrl(input.image) } : {}),
    }),
  );
  return {
    images: reply.images.map((image) => new Blob([base64ToBytes(image)], { type: 'image/jpeg' })),
    failed: reply.failed,
  };
}
