/**
 * Switches in code, not settings on the device (spec 0005, REQ-008).
 *
 * `ai`: every way into the AI — the assistant, the AI search, dictation, "Beschreiben ✨",
 * "Anpassen" and the KI settings — is hidden while this is false, so the UI can trigger no AI
 * request. Data, quota and edge functions stay as they are; the device keeps its stored AI
 * settings. Set it to true to bring every entry point back.
 */
export const features: { readonly ai: boolean } = { ai: false };
