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

/**
 * "Bildadresse" in the photo window (spec 0039, REQ-003): the server loads the image at `url`
 * (fetch-image) and answers its bytes. The household is checked for membership only.
 */
export const FetchImageRequestSchema = z.strictObject({ householdId: Id, url: HttpsUrl });
export type FetchImageRequest = z.infer<typeof FetchImageRequestSchema>;

/**
 * "Video speichern" (spec 0043, spec 0046): the server loads the video behind `url`, a TikTok link
 * of the recipe, into household-videos as the caller and adds it to the recipe's videos; the reply
 * names it and, when TikTok has one, the https address of its cover for the poster.
 */
export const FetchVideoRequestSchema = z.strictObject({
  householdId: Id,
  recipeId: Id,
  url: HttpsUrl,
});
export type FetchVideoRequest = z.infer<typeof FetchVideoRequestSchema>;
export const FetchVideoReplySchema = z.strictObject({
  videoPath: z.string().min(1).max(200),
  coverUrl: HttpsUrl.optional(),
});
export type FetchVideoReply = z.infer<typeof FetchVideoReplySchema>;

// ---------- "Mit KI ausfüllen" and images (spec 0040, ADR-0016) ----------

/** Limits of one "Mit KI ausfüllen" (REQ-001; Risiken "Kosten laufen weg"). */
export const RECIPE_DRAFT_LIMITS = { text: 2000, links: 3, photos: 4 } as const;
/** The longest side of a photo sent with a draft (Entscheidung 4). */
export const DRAFT_PHOTO_MAX_SIDE = 1280;
/** The longest side of the photo an image is made from ("Aus diesem Foto", REQ-005). */
export const IMAGE_EDIT_MAX_SIDE = 1024;
/** Variants per "Erzeugen" (REQ-004). */
export const IMAGE_VARIANTS = 3;
/** Base64 characters of one photo: about 1.5 MB of JPEG, far above a shrunk photo. */
const MAX_PHOTO_BASE64 = 2_000_000;
const JPEG_DATA_PREFIX = 'data:image/jpeg;base64,';

const Base64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** A shrunk photo as `data:image/jpeg;base64,…`; nothing else is sent to the model. */
const JpegDataUrl = z
  .string()
  .max(MAX_PHOTO_BASE64 + JPEG_DATA_PREFIX.length)
  .refine(
    (value) =>
      value.startsWith(JPEG_DATA_PREFIX) && Base64.test(value.slice(JPEG_DATA_PREFIX.length)),
  );

/** Name of a variant of the draft, e.g. "Vegetarisch"; ingredients and steps point at it by name. */
const VariantName = z.string().trim().min(1).max(60);

/** What the AI may say a new article contains (spec 0055, REQ-009); never "kein Lebensmittel". */
export const DRAFT_DIETS = ['vegan', 'vegetarian', 'fish', 'meat', 'unknown'] as const;

export const DraftIngredientSchema = z.strictObject({
  /** The household's article name when one fits (name or synonym), else a short German name. */
  name: z.string().trim().min(1).max(120),
  /** "250 g", "1 EL", "" for "nach Geschmack". */
  amount: z.string().trim().max(60),
  /** Hinweis for cooking, e.g. "gewürfelt". */
  note: z.string().trim().max(200).optional(),
  /** e.g. "Für den Teig", "Für die Soße". */
  group: z.string().trim().max(60).optional(),
  /** Only for one variant (spec 0045, REQ-003); without it the row is shared by every variant. */
  variant: VariantName.optional(),
  /**
   * Spec 0055, REQ-009: for an ingredient without a household article, one of the household's
   * area names and what it contains; ignored when an article or starter entry fits.
   */
  area: z.string().trim().min(1).max(80).optional(),
  diet: z.enum(DRAFT_DIETS).optional(),
});
export type DraftIngredient = z.infer<typeof DraftIngredientSchema>;

export const DraftStepSchema = z.strictObject({
  text: z.string().trim().min(1).max(1000),
  /** Only for one variant (spec 0045, REQ-003). */
  variant: VariantName.optional(),
  /** The step's cooking timer (spec 0023, REQ-005): 1–600 minutes. */
  timerMinutes: z.int().min(1).max(600).optional(),
});
export type DraftStep = z.infer<typeof DraftStepSchema>;

/** A tag of the draft (spec 0045, REQ-002); `isNew` when the household does not have it yet. */
export const DraftTagSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
  isNew: z.boolean(),
});

/**
 * What the model may answer: recipe data, nothing else (spec 0040, AC-007). Spec 0045: always a
 * description, tags from the household, variants with their own rows and steps, timers and Vorlauf.
 * The draft names variants instead of ids, so it can later be compared with a stored recipe.
 */
export const RecipeDraftSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  /** 1–3 sentences (REQ-001). */
  description: z.string().trim().min(1).max(600),
  servings: z.int().min(1).max(100),
  totalMinutes: z.int().min(1).max(10000).optional(),
  /** "Vorlauf", e.g. dough overnight. */
  leadTime: z
    .strictObject({
      text: z.string().trim().min(1).max(200),
      hoursBefore: z.int().min(1).max(168),
    })
    .optional(),
  course: z.enum(['breakfast', 'main', 'side', 'dessert', 'snack', 'drink']),
  cuisine: z.string().trim().max(80).optional(),
  /** 2–5 asked for; more are cut on the device (REQ-002, AC-004). */
  tags: z.array(DraftTagSchema).max(10),
  /** The first is the standard; empty for a dish without variants. */
  variants: z.array(z.strictObject({ name: VariantName })).max(6),
  ingredients: z.array(DraftIngredientSchema).max(80),
  steps: z.array(DraftStepSchema).max(40),
  notes: z.string().trim().max(2000).optional(),
  /** English prompt for the image model; only with "Foto generieren". */
  imagePrompt: z.string().trim().max(1000).optional(),
});
export type RecipeDraft = z.infer<typeof RecipeDraftSchema>;

/** Spec 0055, REQ-007: what the web search of "Prompt" looks for (title and wish). */
export const PROMPT_WEB_QUERY_MAX = 200;

export const RecipeDraftRequestSchema = z
  .strictObject({
    householdId: Id,
    /** Free text, typed or dictated; the links found in it travel in `links`. */
    text: z.string().trim().max(RECIPE_DRAFT_LIMITS.text).default(''),
    links: z.array(HttpsUrl).max(RECIPE_DRAFT_LIMITS.links).default([]),
    photos: z.array(JpegDataUrl).max(RECIPE_DRAFT_LIMITS.photos).default([]),
    /** "Foto generieren" (REQ-003): the draft brings a prompt for the image model. */
    imagePrompt: z.boolean().default(true),
    /**
     * Spec 0055, REQ-006, REQ-008: the recipe to change — the one of the edit mode, or the AI's
     * last proposal; the text says what to change. A stored recipe may have no description.
     */
    current: RecipeDraftSchema.extend({
      description: z.string().trim().max(600),
    }).optional(),
    /** Spec 0055, REQ-007: with it the function searches the web once for context. */
    webQuery: z.string().trim().min(1).max(PROMPT_WEB_QUERY_MAX).optional(),
  })
  .refine(
    (request) => request.text !== '' || request.links.length > 0 || request.photos.length > 0,
  );
export type RecipeDraftRequest = z.input<typeof RecipeDraftRequestSchema>;

export const RecipeDraftSourceSchema = z.strictObject({
  /** The link as sent. */
  url: HttpsUrl,
  kind: z.enum(['page', 'tiktok', 'youtube']),
  /** false: the chip says "… konnte nicht gelesen werden" (AC-004, AC-017). */
  read: z.boolean(),
  /**
   * TikTok: where the short link leads (AC-016); YouTube: the normalized watch address (spec 0064,
   * AC-009). Saved as the recipe's link.
   */
  resolvedUrl: HttpsUrl.optional(),
  /** TikTok's cover or YouTube's thumbnail: the reference for "Foto generieren" (REQ-006). */
  coverUrl: HttpsUrl.optional(),
  /** A page: its photo (JSON-LD image, else og:image), the photo without "Foto generieren" (spec 0049, AC-042). */
  imageUrl: HttpsUrl.optional(),
});
export type RecipeDraftSource = z.infer<typeof RecipeDraftSourceSchema>;

export const RecipeDraftReplySchema = z.strictObject({
  draft: RecipeDraftSchema,
  sources: z.array(RecipeDraftSourceSchema).max(RECIPE_DRAFT_LIMITS.links),
  /** Spec 0055, REQ-007: only when the web search was asked for. */
  webContext: z.enum(['used', 'unavailable']).optional(),
});
export type RecipeDraftReply = z.infer<typeof RecipeDraftReplySchema>;

/** Style chips "Hochglanz", "Rustikal", "Von oben", "Nah", "Hell" (REQ-004). */
export const IMAGE_STYLES = ['glossy', 'rustic', 'top', 'close', 'bright'] as const;
export type ImageStyle = (typeof IMAGE_STYLES)[number];

/** What a picture is for (spec 0052): the entries that have a photo. */
export const IMAGE_SUBJECTS = ['recipe', 'collection', 'restaurant', 'activity'] as const;
export type ImageSubject = (typeof IMAGE_SUBJECTS)[number];

/** Limits of the image context; the app cuts longer texts (image-context.ts). */
export const IMAGE_CONTEXT_LIMITS = {
  title: 200,
  ingredients: 8,
  ingredient: 80,
  description: 600,
  category: 80,
  place: 200,
} as const;

/**
 * Spec 0052, REQ-003: what the picture is for, so the language model can turn a short wish into
 * good prompts. German texts as the household wrote them; no address, no personal data.
 */
export const AiImageContextSchema = z.strictObject({
  kind: z.enum(IMAGE_SUBJECTS),
  /** The entry's title or name, e.g. "Bertablock". */
  title: z.string().trim().min(1).max(IMAGE_CONTEXT_LIMITS.title),
  /** Recipe: its main ingredients, e.g. "Rote Linsen". */
  ingredients: z
    .array(z.string().trim().min(1).max(IMAGE_CONTEXT_LIMITS.ingredient))
    .max(IMAGE_CONTEXT_LIMITS.ingredients)
    .optional(),
  /** Recipe or activity: its description. */
  description: z.string().trim().min(1).max(IMAGE_CONTEXT_LIMITS.description).optional(),
  /** Restaurant: its cuisine ("Österreichisch"); activity: its kind ("Bouldern"). */
  category: z.string().trim().min(1).max(IMAGE_CONTEXT_LIMITS.category).optional(),
  /** Activity or restaurant: the name of the place, e.g. "Sportforum Hohenschönhausen". */
  place: z.string().trim().min(1).max(IMAGE_CONTEXT_LIMITS.place).optional(),
});
export type AiImageContext = z.infer<typeof AiImageContextSchema>;

/** "Was soll anders sein?" of "Neu generieren" (spec 0045, REQ-006; spec 0052, REQ-004). */
export const IMAGE_EXTRA_MAX = 300;

export const AiImageRequestSchema = z.strictObject({
  householdId: Id,
  /** The wish: what the picture should show, typed by the person or the draft's image prompt. */
  prompt: z.string().trim().min(1).max(1000),
  styles: z.array(z.enum(IMAGE_STYLES)).max(IMAGE_STYLES.length).optional(),
  /** "Aus diesem Foto" (REQ-005): the photo to start from, at most 1024 px. */
  image: JpegDataUrl.optional(),
  /** Spec 0052, REQ-004: what should be different this time; weighs more than the wish. */
  extra: z.string().trim().min(1).max(IMAGE_EXTRA_MAX).optional(),
  /** Spec 0052, REQ-003: what the picture is for. */
  context: AiImageContextSchema.optional(),
});
export type AiImageRequest = z.infer<typeof AiImageRequestSchema>;

export const AiImageReplySchema = z.strictObject({
  /** JPEG bytes as base64; the server never stores them (Entscheidung 4). */
  images: z.array(z.string().min(1).max(4_000_000).regex(Base64)).min(1).max(IMAGE_VARIANTS),
  /** Variants that failed (AC-014). */
  failed: z.int().min(0).max(IMAGE_VARIANTS),
});
export type AiImageReply = z.infer<typeof AiImageReplySchema>;

// ---------- Websuche (spec 0049) ----------

export const WEB_SEARCH_KINDS = ['recipe', 'restaurant', 'activity'] as const;
export type WebSearchKind = (typeof WEB_SEARCH_KINDS)[number];
/** Limits of one search (Risiken "Kosten laufen weg"). */
export const WEB_SEARCH_LIMITS = { query: 200, results: 5, openingDays: 7 } as const;

const GeoPointSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** One day of opening hours as the provider wrote it, ISO weekday 1 (Montag) … 7 (Sonntag). */
export const OpeningDaySchema = z.strictObject({
  weekday: z.int().min(1).max(7),
  /** "11:00–23:00", "Geschlossen", "24 Stunden geöffnet". */
  hours: z.string().trim().min(1).max(120),
});
export type OpeningDay = z.infer<typeof OpeningDaySchema>;

/** One result card (REQ-002); the app sends it back unchanged for the place preview. */
export const WebResultSchema = z.strictObject({
  /** The recipe page, or for a place the maps link or else its website ("Quelle öffnen"). */
  url: HttpsUrl,
  title: z.string().trim().min(1).max(200),
  /** The host without "www.", e.g. "chefkoch.de". */
  source: z.string().trim().min(1).max(120),
  /** Loaded by the app through fetch-image (CSP), never shown directly. */
  imageUrl: HttpsUrl.optional(),
  rating: z.number().min(0).max(5).optional(),
  ratingCount: z.int().min(0).max(100_000_000).optional(),
  /** Recipes: the total time from the page. */
  totalMinutes: z.int().min(1).max(10000).optional(),
  /** Short text of the provider, e.g. the snippet; data only. */
  snippet: z.string().trim().max(400).optional(),
  // Places (restaurant, activity):
  address: z.string().trim().max(300).optional(),
  /** "Vietnamesisches Restaurant", "Kletterhalle". */
  category: z.string().trim().max(120).optional(),
  websiteUrl: HttpsUrl.optional(),
  mapsUrl: HttpsUrl.optional(),
  location: GeoPointSchema.optional(),
  openingHours: z.array(OpeningDaySchema).max(WEB_SEARCH_LIMITS.openingDays).optional(),
  /** 1 (€) … 4 (€€€€), from the provider's price range. */
  priceLevel: z.int().min(1).max(4).optional(),
});
export type WebResult = z.infer<typeof WebResultSchema>;

export const WebSearchRequestSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    mode: z.literal('search'),
    householdId: Id,
    kind: z.enum(WEB_SEARCH_KINDS),
    query: z.string().trim().min(1).max(WEB_SEARCH_LIMITS.query),
    /** Where to look for places (Entscheidung 3); without it the provider decides. */
    near: GeoPointSchema.optional(),
  }),
  z.strictObject({
    mode: z.literal('place'),
    householdId: Id,
    kind: z.enum(['restaurant', 'activity']),
    result: WebResultSchema,
  }),
]);
export type WebSearchRequest = z.infer<typeof WebSearchRequestSchema>;

export const WebSearchReplySchema = z.strictObject({
  results: z.array(WebResultSchema).max(WEB_SEARCH_LIMITS.results),
  provider: z.enum(['serper', 'brave']),
  /** What was searched: the person's text without commands and image wishes (REQ-008). */
  query: z.string().trim().min(1).max(WEB_SEARCH_LIMITS.query),
  /** "Bild soll Frau in Boulderhalle sein": the photo is made from it, not taken from the page. */
  imageWish: z.string().trim().min(1).max(300).optional(),
});
export type WebSearchReply = z.infer<typeof WebSearchReplySchema>;

/** How the model reads the person's search text (REQ-008): what to search, what to picture. */
export const SearchIntentSchema = z.strictObject({
  query: z.string().trim().min(1).max(WEB_SEARCH_LIMITS.query),
  imageWish: z.string().trim().min(1).max(300).optional(),
});
export type SearchIntent = z.infer<typeof SearchIntentSchema>;

/** What the model may answer for a place preview (REQ-003, AC-025): place data, nothing else. */
export const PlaceProposalSchema = z.strictObject({
  /** The place's name as people say it, without "GmbH" or a slogan. */
  name: z.string().trim().min(1).max(120).optional(),
  /** Restaurants: up to 3 Schlagworte, the household's when they fit. */
  tags: z.array(z.string().trim().min(1).max(40)).max(3).optional(),
  /** Restaurants: one of the household's cuisines when one fits, else a short German one. */
  cuisine: z.string().trim().min(1).max(80).optional(),
  /** Activities: exactly the name of one of the household's kinds, else none. */
  kind: z.string().trim().min(1).max(40).optional(),
  /** Activities: one or two German sentences about the place. */
  description: z.string().trim().min(1).max(500).optional(),
});
export type PlaceProposal = z.infer<typeof PlaceProposalSchema>;

export const PlacePreviewReplySchema = z.strictObject({ proposal: PlaceProposalSchema });
export type PlacePreviewReply = z.infer<typeof PlacePreviewReplySchema>;

/** Stable error codes of the edge functions; the app maps them to German messages. */
export const ErrorCodeSchema = z.enum([
  'unauthorized',
  'invalid_request',
  'not_a_maps_link',
  'quota_exceeded',
  'ai_unavailable',
  'internal',
  /** The caller is no member of the household named in the request (fetch-image). */
  'forbidden',
  /** The address gives no usable public image (fetch-image, spec 0039, AC-007). */
  'not_an_image',
  /** The body is larger than the function takes (64 KB, or 6 MB with photos; spec 0040). */
  'payload_too_large',
  /** fetch-video (spec 0043, AC-004): the address is no TikTok link of the recipe. */
  'not_a_tiktok_link',
  /** fetch-video (AC-002): TikTok gave no video (error, block, timeout, changed page). */
  'video_unavailable',
  /** fetch-video (AC-003): the video is larger than 50 MB. */
  'video_too_large',
  /** fetch-video: the recipe has the video of this link already (one per link, spec 0046). */
  'video_exists',
  /** web-search (spec 0049, AC-023): neither Serper nor Brave answered usably. */
  'search_unavailable',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorReplySchema = z.strictObject({ error: ErrorCodeSchema });
export type ErrorReply = z.infer<typeof ErrorReplySchema>;
