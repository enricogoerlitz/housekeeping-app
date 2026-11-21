// Contract between the app and the AI edge functions (ADR-0009, spec 0003 REQ-008/009).
// This file may import only `zod`: `pnpm gen:edge` copies it into
// supabase/functions/_shared/contract.gen.ts for Deno, where relative imports would break.
import { z } from 'zod';

const Id = z.string().min(1).max(64);
const Label = z.string().trim().min(1).max(200);
const HttpsUrl = z.url({ protocol: /^https$/ }).max(2048);

export const PlanEntryInputSchema = z.strictObject({
  /** null = "vorgemerkt", without a day. */
  date: z.iso.date().nullable(),
  slotId: Id,
  kind: z.enum(['recipe', 'text', 'leftovers', 'restaurant']),
  recipeId: Id.optional(),
  restaurantId: Id.optional(),
  text: Label.optional(),
  leftoversOfEntryId: Id.optional(),
  eaterIds: z.array(Id).max(20),
  guests: z.int().min(0).max(50).optional(),
  portions: z.number().positive().max(100).optional(),
  variants: z
    .array(z.strictObject({ variantId: Id, portions: z.number().min(0).max(100) }))
    .max(20)
    .optional(),
  cookId: Id.optional(),
});
export type PlanEntryInput = z.infer<typeof PlanEntryInputSchema>;

/** The changes an assistant proposal may contain; anything else is rejected. */
export const AssistantCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('setRecipeServings'),
    recipeId: Id,
    servings: z.int().min(1).max(100),
  }),
  z.strictObject({
    type: z.literal('replaceIngredient'),
    recipeId: Id,
    ingredientId: Id,
    line: Label,
  }),
  z.strictObject({
    type: z.literal('addShoppingItems'),
    texts: z.array(Label).min(1).max(50),
  }),
  z.strictObject({ type: z.literal('addPlanEntry'), input: PlanEntryInputSchema }),
  z.strictObject({ type: z.literal('completeChore'), choreId: Id }),
  z.strictObject({ type: z.literal('logSpontaneous'), title: Label }),
]);
export type AssistantCommand = z.infer<typeof AssistantCommandSchema>;

export const ProposalPartSchema = z.strictObject({
  id: Id,
  /** What is affected, e.g. "Portionen" or "Einkaufsliste". */
  label: z.string().trim().min(1).max(100),
  before: z.string().max(500).optional(),
  after: z.string().max(500).optional(),
  command: AssistantCommandSchema,
});
export type ProposalPart = z.infer<typeof ProposalPartSchema>;

export const ProposalSchema = z.strictObject({
  id: Id,
  title: Label,
  note: z.string().max(500),
  parts: z.array(ProposalPartSchema).min(1).max(30),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const AssistantRequestSchema = z.strictObject({
  /** The active household; RLS decides whether the caller may read it. */
  householdId: Id,
  message: z.string().trim().min(1).max(2000),
  context: z.strictObject({ recipeId: Id.optional() }),
});
export type AssistantRequest = z.infer<typeof AssistantRequestSchema>;

export const AssistantReplySchema = z.strictObject({
  text: z.string().trim().min(1).max(4000),
  proposal: ProposalSchema.optional(),
  /** What the assistant looked up, e.g. "Wochenplan gelesen". */
  consulted: z.string().max(200).optional(),
});
export type AssistantReply = z.infer<typeof AssistantReplySchema>;

export const AiSearchRequestSchema = z.strictObject({
  householdId: Id,
  query: z.string().trim().min(1).max(500),
  /** Chip ids the user removed; the search runs again without them. */
  disabledChips: z.array(z.string().min(1).max(100)).max(30).default([]),
});
export type AiSearchRequest = z.input<typeof AiSearchRequestSchema>;

export const AiSearchChipSchema = z.strictObject({
  id: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(100),
});
export type AiSearchChip = z.infer<typeof AiSearchChipSchema>;

export const AiSearchResultSchema = z.strictObject({
  /** How the request was understood. */
  chips: z.array(AiSearchChipSchema).max(30),
  results: z.array(z.strictObject({ recipeId: Id, reason: z.string().max(300) })).max(50),
  /** e.g. "2 Runden · gesucht: tofu". */
  trace: z.string().max(500),
  /** Short hint shown under the results, may be empty. */
  note: z.string().max(300),
});
export type AiSearchResult = z.infer<typeof AiSearchResultSchema>;

/** A short-lived token the browser uses to stream speech to Azure; never the service key. */
export const SpeechTokenReplySchema = z.strictObject({
  token: z.string().min(1).max(8192),
  region: z.string().regex(/^[a-z0-9]{1,64}$/),
  expiresAt: z.iso.datetime({ offset: true }),
  /** Speech model, e.g. "mai-transcribe-2-streaming"; absent = Azure Speech standard model. */
  model: z.string().min(1).max(100).optional(),
  /** Recognition language, e.g. "de-DE". */
  language: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/),
});
export type SpeechTokenReply = z.infer<typeof SpeechTokenReplySchema>;

export const ResolveMapsLinkRequestSchema = z.strictObject({ url: HttpsUrl });
export type ResolveMapsLinkRequest = z.infer<typeof ResolveMapsLinkRequestSchema>;

export const ResolveMapsLinkReplySchema = z.strictObject({
  name: Label,
  address: z.string().trim().max(300).optional(),
  location: z
    .strictObject({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .optional(),
  /** The link the short link resolved to. */
  mapsUrl: HttpsUrl,
});
export type ResolveMapsLinkReply = z.infer<typeof ResolveMapsLinkReplySchema>;

/** Stable error codes of the edge functions; the app maps them to German messages. */
export const ErrorCodeSchema = z.enum([
  'unauthorized',
  'invalid_request',
  'not_a_maps_link',
  'quota_exceeded',
  'ai_unavailable',
  'internal',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorReplySchema = z.strictObject({ error: ErrorCodeSchema });
export type ErrorReply = z.infer<typeof ErrorReplySchema>;
