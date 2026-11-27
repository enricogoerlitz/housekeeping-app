// Generated from packages/core/src/ai-agent.ts by `pnpm gen:edge` — do not edit.
import { z } from 'zod';

// Spec 0066 "KI-Agent" (step 1): the contract between the app and the edge function `ai-agent`,
// and the pure logic both sides share — the context block of a message, the stream filter for
// citation tokens, the SSE framing, the cards of `show_suggestions` with their enrichment from
// Google (Serper), and the messages of a Foundry conversation. Copied into the edge functions by
// `pnpm gen:edge`, so it imports nothing but zod.

export const AGENT_LIMITS = {
  /** Characters of one message (AC-006). */
  message: 2000,
  /** Characters of a chat title (AC-024). */
  title: 60,
  /** Characters of a place label. */
  placeLabel: 120,
  /** Answers per chat (decision 13); afterwards a new chat. */
  turns: 20,
  /** Cards of one answer, each enriched with one Serper request. */
  cards: 8,
  /** Follow-up chips of one answer. */
  followUps: 3,
} as const;

/** Units of the AI quota one answer costs (decision 13). */
export const AGENT_QUOTA_PER_TURN = 5;

const Uuid = z.uuid();
const HttpsUrl = z.url({ protocol: /^https$/ }).max(2048);

// ---------- Place ----------

export const AGENT_RADII = ['walk', 'transit', 'car', 'city'] as const;
export type AgentRadius = (typeof AGENT_RADII)[number];

export const RADIUS_LABEL: Record<AgentRadius, string> = {
  walk: 'Zu Fuß',
  transit: 'Öffis',
  car: 'Auto',
  city: 'Ganze Stadt',
};

const RADIUS_TEXT: Record<AgentRadius, string> = {
  walk: '1,5 km',
  transit: '5 km',
  car: '15 km',
  city: 'ganze Stadt',
};

const GeoSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** About 100 m: what leaves the device of a location (spec REQ-003). */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** C0, DEL and C1 controls: the rows refuse them (`[[:cntrl:]]`), so text loses them first. */
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]+/g;

/** One line without control characters or repeated whitespace. */
function oneLine(value: string): string {
  return value.replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Where the agent looks: the device (AC-007), a chosen place (AC-009/010) or a trip (AC-011). The
 * coordinates are rounded on parse, so the function never holds more than ≈ 100 m — not for the
 * context block and not for the Serper enrichment.
 */
export const AgentPlaceSchema = z.strictObject({
  source: z.enum(['device', 'pinned', 'trip']),
  label: z.string().transform(oneLine).pipe(z.string().min(1).max(AGENT_LIMITS.placeLabel)),
  address: z.string().trim().max(300).optional(),
  location: z
    .strictObject({
      lat: z.number().min(-90).max(90).transform(roundCoordinate),
      lng: z.number().min(-180).max(180).transform(roundCoordinate),
    })
    .optional(),
  radius: z.enum(AGENT_RADII),
});
export type AgentPlace = z.infer<typeof AgentPlaceSchema>;

/** "Hier · Zu Fuß" for the device, otherwise "<Ort> · <Umkreis>". */
export function placeChipLabel(place: AgentPlace | undefined): string {
  const radius = RADIUS_LABEL[place?.radius ?? 'walk'];
  if (!place || place.source === 'device') return `Hier · ${radius}`;
  return `${place.label} · ${radius}`;
}

/** Text the person typed goes into one line; brackets cannot open or close a block. */
function contextText(value: string): string {
  return oneLine(value.replace(/[[\]]/g, ''));
}

const REFERENCE: Record<AgentPlace['source'], string> = {
  device: 'Aktueller Standort',
  pinned: 'Gewählter Ort',
  trip: 'Reise',
};

function localTime(now: Date, timeZone: string): { text: string; zone: string } {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: zone,
    }).format(now);
  try {
    return { text: format(timeZone), zone: timeZone };
  } catch {
    return { text: format('Europe/Berlin'), zone: 'Europe/Berlin' };
  }
}

/**
 * The first text part of every message (decision 5): the agent's place and time. Per-request
 * instructions are refused by Foundry while an agent is named, so this is the only channel.
 */
export function contextBlock(input: { place: AgentPlace; now: Date; timeZone: string }): string {
  const { place } = input;
  const time = localTime(input.now, input.timeZone);
  const label =
    place.source === 'device'
      ? 'Aktueller Standort (Ortsname unbekannt)'
      : [place.label, place.address]
          .map((part) => contextText(part ?? ''))
          .filter(Boolean)
          .join(', ');
  return [
    '[KONTEXT]',
    `Bezugspunkt: ${REFERENCE[place.source]}`,
    `Ort: ${label}`,
    ...(place.location
      ? [
          `Koordinaten: ${roundCoordinate(place.location.lat)}, ${roundCoordinate(place.location.lng)}`,
        ]
      : []),
    `Umkreis: ${RADIUS_TEXT[place.radius]}`,
    `Lokale Zeit: ${time.text} (${time.zone})`,
    '[/KONTEXT]',
  ].join('\n');
}

// ---------- Requests ----------

export const AgentSendRequestSchema = z.strictObject({
  action: z.literal('send'),
  householdId: Uuid,
  /** Missing: a new chat. */
  chatId: Uuid.optional(),
  message: z.string().trim().min(1).max(AGENT_LIMITS.message),
  place: AgentPlaceSchema,
  /** The device's IANA zone, for the local time in the context. */
  timeZone: z.string().trim().min(1).max(64),
});

export const AgentRequestSchema = z.discriminatedUnion('action', [
  AgentSendRequestSchema,
  z.strictObject({ action: z.literal('load'), householdId: Uuid, chatId: Uuid }),
  z.strictObject({ action: z.literal('delete'), householdId: Uuid, chatId: Uuid }),
  /** "Haushalt endgültig löschen" (REQ-010): every chat of the household. */
  z.strictObject({ action: z.literal('purge'), householdId: Uuid }),
]);
export type AgentRequest = z.infer<typeof AgentRequestSchema>;
export type AgentSendRequest = z.infer<typeof AgentSendRequestSchema>;

// ---------- Cards ----------

const shortText = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim().slice(0, max))
    .optional()
    .catch(undefined);

export const AgentCardSchema = z.strictObject({
  /** Position in the agent's call; the enrichment refers to it. */
  index: z.number().int().min(0).max(50),
  kind: z.enum(['restaurant', 'activity']),
  /** "erst", "dann" of a combined plan. */
  step: z.string().max(40).optional(),
  name: z.string().min(1).max(200),
  category: z.string().max(120).optional(),
  address: z.string().max(300).optional(),
  district: z.string().max(120).optional(),
  priceLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  priceRange: z.string().max(80).optional(),
  openStatus: z.string().max(120).optional(),
  why: z.string().max(400),
  websiteUrl: HttpsUrl.optional(),
  tags: z.array(z.string().max(40)).max(10),
  // From the enrichment only (decision 6), never from the agent.
  mapsUrl: HttpsUrl.optional(),
  rating: z.number().min(0).max(5).optional(),
  ratingCount: z.number().int().min(0).optional(),
  imageUrl: HttpsUrl.optional(),
  location: GeoSchema.optional(),
});
export type AgentCard = z.infer<typeof AgentCardSchema>;

/** What the agent sends per card; lenient, every field checked on its own. */
const SuggestionItemSchema = z.object({
  kind: z.enum(['restaurant', 'activity']).catch('restaurant'),
  step: shortText(40).nullable().catch(null),
  name: z.string().transform((value) => value.replace(/\s+/g, ' ').trim().slice(0, 200)),
  category: shortText(120).nullable().catch(null),
  address: shortText(300).nullable().catch(null),
  district: shortText(120).nullable().catch(null),
  price_level: z.number().int().min(1).max(4).nullable().optional().catch(null),
  price_range: shortText(80).nullable().catch(null),
  open_status: shortText(120).nullable().catch(null),
  why: shortText(400).nullable().catch(null),
  website: z.string().nullable().optional().catch(null),
  tags: z.array(z.string()).optional().catch([]),
});

const SuggestionsArgsSchema = z.object({
  title: z.string().nullable().optional().catch(null),
  items: z.array(z.unknown()),
  follow_ups: z.array(z.unknown()).optional().catch([]),
});

const safeHttps = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined;
  return HttpsUrl.safeParse(value.trim()).success ? value.trim() : undefined;
};

const clip = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max);
const optional = (value: string | null | undefined) => (value ? value : undefined);

/**
 * The arguments of `show_suggestions` (strict on Foundry's side, still model output): cards
 * without a name drop out, links must be https, at most 8 cards and 3 follow-ups (AC-019). The
 * agent's own rating and maps link are ignored (decision 6).
 */
export function parseSuggestionsArgs(
  text: string,
): { title?: string; cards: AgentCard[]; followUps: string[] } | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  const args = SuggestionsArgsSchema.safeParse(json);
  if (!args.success) return undefined;
  const cards: AgentCard[] = [];
  for (const raw of args.data.items) {
    if (cards.length >= AGENT_LIMITS.cards) break;
    const parsed = SuggestionItemSchema.safeParse(raw);
    if (!parsed.success || parsed.data.name === '') continue;
    const value = parsed.data;
    const card = AgentCardSchema.safeParse({
      index: cards.length,
      kind: value.kind,
      step: optional(value.step),
      name: value.name,
      category: optional(value.category),
      address: optional(value.address),
      district: optional(value.district),
      priceLevel: value.price_level ?? undefined,
      priceRange: optional(value.price_range),
      openStatus: optional(value.open_status),
      why: value.why ?? '',
      websiteUrl: safeHttps(value.website),
      tags: (value.tags ?? [])
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => clip(tag, 40))
        .filter(Boolean)
        .slice(0, 10),
    });
    if (card.success) cards.push(card.data);
  }
  const title = args.data.title ? clip(args.data.title, AGENT_LIMITS.title) : '';
  const followUps = (args.data.follow_ups ?? [])
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => clip(entry, 120))
    .filter(Boolean)
    .slice(0, AGENT_LIMITS.followUps);
  return { ...(title ? { title } : {}), cards, followUps };
}

// ---------- Enrichment (Serper maps) ----------

/** The part of a Serper place hit the enrichment reads (supabase/functions/_shared/web-search.ts). */
export interface PlaceHitLike {
  title: string;
  location?: { lat: number; lng: number };
  rating?: number;
  ratingCount?: number;
  mapsUrl?: string;
  imageUrl?: string;
}

export const PlaceEnrichmentSchema = z.object({
  index: z.number().int().min(0).max(50),
  mapsUrl: HttpsUrl.optional().catch(undefined),
  rating: z.number().min(0).max(5).optional().catch(undefined),
  ratingCount: z.number().int().min(0).optional().catch(undefined),
  imageUrl: HttpsUrl.optional().catch(undefined),
  location: GeoSchema.optional().catch(undefined),
});
export type PlaceEnrichment = z.infer<typeof PlaceEnrichmentSchema>;

function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Same name, or one contains the other as whole words ("Plates" in "Plates Restaurant …"). */
function sameName(a: string, b: string): boolean {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && ` ${long} `.includes(` ${short} `);
}

/**
 * The Google data of a card (AC-017): the first hit with the same name, exact names first. No
 * fitting hit is no enrichment (AC-018), never the nearest other place.
 */
export function enrichmentFromHits(
  card: Pick<AgentCard, 'index' | 'name'>,
  hits: readonly PlaceHitLike[],
): PlaceEnrichment | undefined {
  const exact = hits.find((hit) => nameKey(hit.title) === nameKey(card.name));
  const hit = exact ?? hits.find((candidate) => sameName(candidate.title, card.name));
  if (!hit) return undefined;
  const enrichment = PlaceEnrichmentSchema.parse({
    index: card.index,
    mapsUrl: hit.mapsUrl,
    rating: hit.rating,
    ratingCount: hit.ratingCount,
    imageUrl: hit.imageUrl,
    location: hit.location,
  });
  return Object.fromEntries(
    Object.entries(enrichment).filter(([, value]) => value !== undefined),
  ) as PlaceEnrichment;
}

export function mergeCards(
  cards: readonly AgentCard[],
  enrichments: readonly PlaceEnrichment[],
): AgentCard[] {
  return cards.map((card) => {
    const extra = enrichments.find((entry) => entry.index === card.index);
    if (!extra) return card;
    const { index: _index, ...fields } = extra;
    return { ...card, ...fields };
  });
}

/**
 * The `function_call_output` of `show_suggestions` (decision 11): "shown" plus the enrichment, so
 * a chat opened later shows the same stars and links and the agent knows them.
 */
export function functionOutput(enrichments: readonly PlaceEnrichment[]): string {
  return JSON.stringify({ shown: true, places: enrichments });
}

export function parseFunctionOutput(text: string): PlaceEnrichment[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const places =
    typeof json === 'object' && json !== null && 'places' in json && Array.isArray(json.places)
      ? json.places
      : [];
  return places.flatMap((entry: unknown) => {
    const parsed = PlaceEnrichmentSchema.safeParse(entry);
    if (!parsed.success) return [];
    return [
      Object.fromEntries(
        Object.entries(parsed.data).filter(([, value]) => value !== undefined),
      ) as PlaceEnrichment,
    ];
  });
}

// ---------- Text, citations, sources ----------

// Foundry writes citations as private-use tokens: U+E200 "cite" U+E202 "turn0search0" … U+E201.
const CITATION = /\s*[^]*/g;
const STRAY = /[-]/g;

/** The answer text without raw citation tokens (AC-016). */
export function stripCitations(text: string): string {
  return text
    .replace(CITATION, '')
    .replace(STRAY, '')
    .replace(/[ \t]+\n/g, '\n')
    .trimEnd();
}

/**
 * For streamed deltas: text before a citation goes out at once, a token is held until it is
 * complete and then dropped (AC-016).
 */
export function createCitationFilter(): { push(delta: string): string; flush(): string } {
  let held = '';
  // After a dropped token the space that preceded it is already out: the next one is not doubled.
  let afterToken = false;
  let last = '';
  const out = (text: string) => {
    let clean = text.replace(STRAY, '');
    if (afterToken && clean !== '') {
      if (/[ \t]$/.test(last)) clean = clean.replace(/^[ \t]+/, '');
      if (clean !== '') afterToken = false;
    }
    if (clean !== '') last = clean.slice(-1);
    return clean;
  };
  return {
    push(delta) {
      held += delta;
      let shown = '';
      for (;;) {
        const start = held.indexOf('\ue200');
        if (start < 0) {
          shown += out(held);
          held = '';
          return shown;
        }
        shown += out(held.slice(0, start));
        const end = held.indexOf('\ue201', start);
        if (end < 0) {
          held = held.slice(start);
          // A broken token never holds more than a sentence back.
          if (held.length > 400) held = '';
          return shown;
        }
        held = held.slice(end + 1);
        afterToken = true;
      }
    },
    flush() {
      const rest = held.startsWith('\ue200') ? '' : held;
      held = '';
      return out(rest);
    },
  };
}

export const AgentSourceSchema = z.strictObject({
  url: HttpsUrl,
  host: z.string().max(200),
  title: z.string().max(200).optional(),
});
export type AgentSource = z.infer<typeof AgentSourceSchema>;

/** The cited pages of an answer, once per host, https only (AC-016). */
export function sourcesOf(annotations: readonly unknown[]): AgentSource[] {
  const seen = new Set<string>();
  const sources: AgentSource[] = [];
  for (const annotation of annotations) {
    if (typeof annotation !== 'object' || annotation === null) continue;
    const { type, url, title } = annotation as { type?: unknown; url?: unknown; title?: unknown };
    if (type !== 'url_citation' || typeof url !== 'string' || !HttpsUrl.safeParse(url).success)
      continue;
    const host = (/^https:\/\/(?:[^/?#@]*@)?([^/?#:]+)/i.exec(url)?.[1] ?? '')
      .toLowerCase()
      .replace(/^www\./, '');
    // A cited page decides its host name: one over the schema's limit would break the answer.
    if (!host || host.length > 200 || seen.has(host)) continue;
    seen.add(host);
    sources.push({
      url,
      host,
      ...(typeof title === 'string' && title.trim() ? { title: clip(title, 200) } : {}),
    });
    if (sources.length >= 12) break;
  }
  return sources;
}

/** "Brunch mit Kinderwagen": the first message in one line, at most 60 characters (AC-024). */
export function chatTitle(message: string): string {
  const line = oneLine(message);
  if (line.length <= AGENT_LIMITS.title) return line;
  const cut = line.slice(0, AGENT_LIMITS.title - 1);
  // The cut ends a word when the next character is a space; otherwise back to the last space.
  const space = line[cut.length] === ' ' ? cut.length : cut.lastIndexOf(' ');
  return `${(space > 20 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// ---------- Progress steps ----------

/**
 * One step of the agent shown above its answer (AC-014): the web search in step 1, a household
 * tool in step 2 ("Liest eure Rezepte · Suche „Curry“ · 20 von 143", decision 14).
 */
export const AgentStepSchema = z.strictObject({
  id: z.string().min(1).max(40),
  kind: z.enum(['web_search', 'tool']),
  label: z.string().min(1).max(80),
  detail: z.string().max(200).optional(),
  /** Shown when the step is opened, e.g. the search terms. */
  details: z.array(z.string().max(200)).max(20),
  count: z.number().int().min(0).optional(),
  /** "Quellen", "von 143". */
  countLabel: z.string().max(40).optional(),
  status: z.enum(['running', 'done']),
});
export type AgentStep = z.infer<typeof AgentStepSchema>;

export function stepLine(step: AgentStep): string {
  const count = step.count ? `${step.count} ${step.countLabel ?? ''}`.trim() : undefined;
  const parts = [step.label, step.detail, count].filter(Boolean);
  if (parts.length === 1 && step.status === 'running') return `${step.label} …`;
  return parts.join(' · ');
}

// ---------- Stream ----------

export const AGENT_STREAM_ERRORS = [
  'ai_unavailable',
  'quota_exceeded',
  'chat_too_long',
  'internal',
] as const;

export const AgentStreamEventSchema = z.discriminatedUnion('type', [
  /** First event of a new chat: its id and title. */
  z.strictObject({
    type: z.literal('chat'),
    chatId: Uuid,
    title: z.string().max(AGENT_LIMITS.title),
  }),
  z.strictObject({ type: z.literal('step'), step: AgentStepSchema }),
  z.strictObject({ type: z.literal('text'), delta: z.string().max(20_000) }),
  /** The agent started building cards: placeholders until they come. */
  z.strictObject({ type: z.literal('cards_pending') }),
  z.strictObject({
    type: z.literal('cards'),
    title: z.string().max(AGENT_LIMITS.title).optional(),
    cards: z.array(AgentCardSchema).max(AGENT_LIMITS.cards),
    followUps: z.array(z.string().max(120)).max(AGENT_LIMITS.followUps),
  }),
  z.strictObject({ type: z.literal('sources'), sources: z.array(AgentSourceSchema).max(12) }),
  z.strictObject({ type: z.literal('done') }),
  z.strictObject({ type: z.literal('error'), error: z.enum(AGENT_STREAM_ERRORS) }),
]);
export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;

export function sseData(event: AgentStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Server-sent events, as Foundry sends them and as `ai-agent` sends them on: the JSON of every
 * `data:` field once its event is complete; comments, `[DONE]` and broken JSON are skipped.
 */
export function createSseParser(): { push(chunk: string): unknown[] } {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk.replace(/\r\n/g, '\n');
      const out: unknown[] = [];
      let end = buffer.indexOf('\n\n');
      while (end >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n');
        if (data && data !== '[DONE]') {
          try {
            out.push(JSON.parse(data));
          } catch {
            // Not JSON: nothing for us.
          }
        }
        end = buffer.indexOf('\n\n');
      }
      return out;
    },
  };
}

// ---------- A stored conversation ----------

export const AgentMessageSchema = z.strictObject({
  role: z.enum(['user', 'assistant']),
  text: z.string().max(40_000),
  cards: z.array(AgentCardSchema).max(AGENT_LIMITS.cards),
  cardsTitle: z.string().max(AGENT_LIMITS.title).optional(),
  followUps: z.array(z.string().max(120)).max(AGENT_LIMITS.followUps),
  sources: z.array(AgentSourceSchema).max(12),
  steps: z.array(AgentStepSchema).max(10),
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const AgentLoadReplySchema = z.strictObject({
  messages: z.array(AgentMessageSchema).max(200),
});
export type AgentLoadReply = z.infer<typeof AgentLoadReplySchema>;

export const AgentDeleteReplySchema = z.strictObject({ deleted: z.number().int().min(0) });

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

function emptyAnswer(): AgentMessage {
  return { role: 'assistant', text: '', cards: [], followUps: [], sources: [], steps: [] };
}

/**
 * The messages of a conversation from Foundry's items (decision 10, AC-025): the user's text
 * without the context block, the answer's text without citation tokens, its cards with the
 * enrichment of the matching `function_call_output`, its web searches as one step.
 */
export function messagesFromItems(items: readonly unknown[]): AgentMessage[] {
  const messages: AgentMessage[] = [];
  let answer: AgentMessage | undefined;
  const callOf = new Map<string, AgentMessage>();
  const answerNow = () => {
    if (!answer) {
      answer = emptyAnswer();
      messages.push(answer);
    }
    return answer;
  };
  for (const raw of items) {
    const item = record(raw);
    if (!item) continue;
    const type = str(item.type);
    if (type === 'message' && item.role === 'user') {
      const text = list(item.content)
        .map((part) => str(record(part)?.text) ?? '')
        .filter((part) => part !== '' && !part.startsWith('[KONTEXT]'))
        .join('\n')
        .trim();
      if (!text) continue;
      messages.push({ ...emptyAnswer(), role: 'user', text: text.slice(0, AGENT_LIMITS.message) });
      answer = undefined;
    } else if (type === 'message' && item.role === 'assistant') {
      const parts = list(item.content)
        .map(record)
        .filter((part) => part?.type === 'output_text');
      const text = stripCitations(parts.map((part) => str(part?.text) ?? '').join(''));
      const current = answerNow();
      current.text = [current.text, text].filter(Boolean).join('\n\n').slice(0, 40_000);
      const sources = sourcesOf(parts.flatMap((part) => list(part?.annotations)));
      const hosts = new Set(current.sources.map((source) => source.host));
      current.sources = [
        ...current.sources,
        ...sources.filter((source) => !hosts.has(source.host)),
      ].slice(0, 12);
    } else if (type === 'web_search_call') {
      const action = record(item.action);
      const current = answerNow();
      let step = current.steps.find((candidate) => candidate.id === 'web');
      if (!step) {
        step = {
          id: 'web',
          kind: 'web_search',
          label: 'Im Web gesucht',
          details: [],
          countLabel: 'Quellen',
          status: 'done',
        };
        current.steps.push(step);
      }
      const query = str(action?.query);
      if (query && step.details.length < 20) step.details.push(clip(query, 200));
      const sources = list(action?.sources).length;
      if (sources > 0) step.count = (step.count ?? 0) + sources;
    } else if (type === 'function_call' && item.name === 'show_suggestions') {
      const parsed = parseSuggestionsArgs(str(item.arguments) ?? '');
      if (!parsed) continue;
      const current = answerNow();
      current.cards = parsed.cards;
      current.followUps = parsed.followUps;
      if (parsed.title) current.cardsTitle = parsed.title;
      const callId = str(item.call_id);
      if (callId) callOf.set(callId, current);
    } else if (type === 'function_call_output') {
      const target = callOf.get(str(item.call_id) ?? '');
      if (target)
        target.cards = mergeCards(target.cards, parseFunctionOutput(str(item.output) ?? ''));
    }
  }
  return messages.filter(
    (message) => message.role === 'user' || message.text || message.cards.length,
  );
}
