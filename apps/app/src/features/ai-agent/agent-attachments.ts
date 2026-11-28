import { preparePhoto } from '@housekeeping/api';
import {
  AGENT_ATTACHMENT_REJECTED,
  AGENT_LIMITS,
  attachmentKind,
  type AgentAttachment,
} from '@housekeeping/core';

// Spec 0067, REQ-005, decision 9: what "+" attaches to a message. Photos become JPEGs like every
// photo of the app (preparePhoto, 1280 px; HEIC from the iPhone too), PDF files go as they are up
// to about 4 MB; anything else is refused before it is sent (AC-010).

export interface PickedAttachment {
  key: string;
  attachment: AgentAttachment;
  /** "Foto" or the file's name, for the chip. */
  label: string;
  /**
   * Preview feedback 28.11.: the local copy (an object URL) for the preview in the composer and
   * with the sent message; never uploaded anywhere but in the message itself.
   */
  previewUri: string;
}

/** What the person's message shows of its files (local copies, gone with the page). */
export interface AttachmentPreview {
  kind: 'image' | 'pdf';
  uri: string;
  name: string;
}

export const previewOf = (picked: PickedAttachment): AttachmentPreview => ({
  kind: picked.attachment.kind,
  uri: picked.previewUri,
  name: picked.label,
});

const PHOTO_SIDE = 1280;
export const ATTACHMENT_TOO_LARGE = 'Die Datei ist zu groß – höchstens 4 MB';
const ATTACHMENT_UNREADABLE = 'Die Datei ließ sich nicht lesen – bitte noch einmal.';

/** What "+" offers in the browser's picker. */
export const ATTACHMENT_ACCEPT = 'image/*,application/pdf,.pdf';

function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      if (comma < 0) reject(new Error(ATTACHMENT_UNREADABLE));
      else resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error(ATTACHMENT_UNREADABLE));
    reader.readAsDataURL(blob);
  });
}

let serial = 0;

/** A picked file as an attachment; throws an Error with the person's message otherwise. */
export async function prepareAttachment(file: File): Promise<PickedAttachment> {
  const kind = attachmentKind({ type: file.type, name: file.name });
  if (!kind) throw new Error(AGENT_ATTACHMENT_REJECTED);
  serial += 1;
  if (kind === 'image') {
    const jpeg = await preparePhoto(file, PHOTO_SIDE);
    const dataUrl = `data:image/jpeg;base64,${await base64Of(jpeg)}`;
    if (dataUrl.length > AGENT_LIMITS.imageChars) throw new Error(ATTACHMENT_TOO_LARGE);
    return {
      key: `a${serial}`,
      label: 'Foto',
      attachment: { kind: 'image', dataUrl },
      previewUri: URL.createObjectURL(jpeg),
    };
  }
  const dataUrl = `data:application/pdf;base64,${await base64Of(file)}`;
  if (dataUrl.length > AGENT_LIMITS.pdfChars) throw new Error(ATTACHMENT_TOO_LARGE);
  const name = file.name.trim().slice(0, 120) || 'Datei.pdf';
  return {
    key: `a${serial}`,
    label: name,
    attachment: { kind: 'pdf', name, dataUrl },
    previewUri: URL.createObjectURL(file),
  };
}
