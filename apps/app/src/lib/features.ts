/**
 * Switches in code, not settings on the device (spec 0005, REQ-008).
 *
 * `ai`: every way into the AI — the assistant, the AI search, dictation, "Beschreiben ✨",
 * "Anpassen" and the KI settings — is hidden while this is false, so the UI can trigger no AI
 * request. Data, quota and edge functions stay as they are; the device keeps its stored AI
 * settings. Set it to true to bring every entry point back.
 *
 * `aiRecipes` (spec 0040, Entscheidung 1): only "Mit KI ausfüllen", the tab "KI" of the photo
 * window and the microphone in their fields. Independent of `ai`: the assistant and the AI search
 * stay off.
 *
 * `aiAgent` (spec 0066): the research chat for restaurants and activities, independent of `ai`.
 */
export const features: {
  readonly ai: boolean;
  readonly aiRecipes: boolean;
  readonly aiAgent: boolean;
} = {
  ai: false,
  aiRecipes: true,
  // Spec 0066: the ✨ "KI-Agent" in the heads of "Restaurants" and "Aktivitäten".
  aiAgent: true,
};
