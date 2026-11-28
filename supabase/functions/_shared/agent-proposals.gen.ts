// Generated from packages/core/src/agent-proposals.ts by `pnpm gen:edge` — do not edit.
import { z } from 'zod';

// Spec 0067 "Housekeeping-Agent", step B (REQ-009 – REQ-012): the tools through which the agent
// proposes instead of writing. `propose_actions` lists changes the app shows as a collect card and
// applies only after the person confirmed, each through the app's own command (agent-apply.ts);
// `draft_recipe` makes a recipe draft through the draft pipeline of ai-recipe-draft; `make_image`
// asks the app for one AI photo and `show_images` shows Google images to pick from. Everything the
// model sends is untrusted: every field is checked on its own, an entry that fails drops out, and a
// delete is only kept when the person's own message asks for it (AC-020). Copied into the edge
// functions by `pnpm gen:edge`, so it imports nothing but zod.

export const AGENT_PROPOSAL_TOOLS = [
  'propose_actions',
  'draft_recipe',
  'make_image',
  'show_images',
  'show_entities',
] as const;
export type AgentProposalTool = (typeof AGENT_PROPOSAL_TOOLS)[number];

export const AGENT_ACTION_KINDS = [
  'add_to_list',
  'chore_done',
  'plan',
  'create_restaurant',
  'create_activity',
  'set_favorite',
  'set_servings',
  'add_recurring',
  'remove_from_list',
  'remove_plan_entry',
  'delete_recurring',
] as const;
export type AgentActionKind = (typeof AGENT_ACTION_KINDS)[number];

/** Deletes: never applied with the others, each confirmed on its own (REQ-009, AC-020). */
export const AGENT_DELETE_KINDS = [
  'remove_from_list',
  'remove_plan_entry',
  'delete_recurring',
] as const satisfies readonly AgentActionKind[];

export const AGENT_ACTION_TARGETS = ['recipe', 'restaurant', 'activity', 'text'] as const;
export const AGENT_IMAGE_SUBJECTS = ['recipe', 'restaurant', 'activity', 'draft'] as const;
/** Preview 28.11.: the household's own entries the agent can show as cards. */
export const AGENT_ENTITY_KINDS = ['recipe', 'collection', 'restaurant', 'activity'] as const;
export type AgentEntityKind = (typeof AGENT_ENTITY_KINDS)[number];
export type AgentImageSubject = (typeof AGENT_IMAGE_SUBJECTS)[number];

export const AGENT_PROPOSAL_LIMITS = {
  /** Entries of one collect card (REQ-013: at most 20 per pass). */
  actions: 20,
  /** Links of one draft, as in "Mit KI ausfüllen". */
  links: 3,
  /** Characters of page text the agent read with its web search and hands to the draft. */
  pageText: 20_000,
  /** Google images of one row. */
  images: 8,
  prompt: 1000,
  query: 200,
  /** Own entries in one row of cards. */
  entities: 12,
} as const;

export const isDeleteKind = (kind: AgentActionKind): boolean =>
  (AGENT_DELETE_KINDS as readonly string[]).includes(kind);

const CONTROLS = /[\u0000-\u001f\u007f-\u009f]+/g;
const oneLine = (value: string) => value.replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim();
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (value: string) => {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const text = (max: number) => z.string().transform(oneLine).pipe(z.string().min(1).max(max));

/** One proposed change as the app keeps and shows it. */
export const AgentActionSchema = z.strictObject({
  kind: z.enum(AGENT_ACTION_KINDS),
  /** What a plan entry or a favourite is about. */
  target: z.enum(AGENT_ACTION_TARGETS).optional(),
  /** The id the agent read, a hint only: the app checks it against its own data. */
  id: z.uuid().optional(),
  /**
   * The thing in words: "2 Milch" for the list, the chore's or recipe's title, a place's name, the
   * text of a plan entry. The app finds the row by it when there is no id.
   */
  name: text(200),
  date: z.string().refine(isIsoDate).optional(),
  /** The household's Tageszeit by name ("Abendessen"). */
  slot: text(60).optional(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  address: text(300).optional(),
  note: text(200).optional(),
  servings: z.int().min(1).max(100).optional(),
  favorite: z.boolean().optional(),
  /** Dauerposten: ISO weekday 1 (Montag) … 7 and every how many weeks. */
  weekday: z.int().min(1).max(7).optional(),
  everyWeeks: z.int().min(1).max(52).optional(),
});
export type AgentAction = z.infer<typeof AgentActionSchema>;

export const AgentProposalSchema = z.strictObject({
  /** The function call it came from: one card per call. */
  id: z.string().min(1).max(200),
  title: z.string().max(60).optional(),
  actions: z.array(AgentActionSchema).max(AGENT_PROPOSAL_LIMITS.actions),
});
export type AgentProposal = z.infer<typeof AgentProposalSchema>;

// ---------- Tool parameters (the YAML carries exactly these, foundry/src/run.test.ts) ----------

const nullable = (type: string, description: string, extra: Record<string, unknown> = {}) => ({
  type: [type, 'null'],
  description,
  ...extra,
});

const ACTION_JSON = {
  type: 'object',
  additionalProperties: false,
  required: [
    'kind',
    'target',
    'id',
    'name',
    'date',
    'slot',
    'time',
    'address',
    'note',
    'servings',
    'favorite',
    'weekday',
    'every_weeks',
  ],
  properties: {
    kind: {
      type: 'string',
      enum: [...AGENT_ACTION_KINDS],
      description:
        'add_to_list: auf die Einkaufsliste · chore_done: Aufgabe erledigt · plan: Kalender-Eintrag · create_restaurant / create_activity: neu merken · set_favorite: Favorit/gemerkt · set_servings: Portionen eines Rezepts · add_recurring: Dauerposten · remove_from_list / remove_plan_entry / delete_recurring: löschen, nur auf ausdrücklichen Wunsch',
    },
    target: {
      type: ['string', 'null'],
      enum: [...AGENT_ACTION_TARGETS, null],
      description: 'bei plan und set_favorite: worum es geht',
    },
    id: nullable('string', 'die id aus einem Werkzeug-Ergebnis, sonst null'),
    name: {
      type: 'string',
      description:
        'Liste: Menge und Artikel wie getippt („2 Milch“, „500 g Möhren“); sonst Titel oder Name genau wie in den Daten; bei plan mit target text der Text',
    },
    date: nullable('string', 'Tag JJJJ-MM-TT (plan, remove_plan_entry); null = vorgemerkt'),
    slot: nullable('string', 'Tageszeit des Haushalts, z. B. Abendessen'),
    time: nullable('string', 'Uhrzeit HH:MM, nur bei Restaurant und Aktivität'),
    address: nullable('string', 'Adresse eines neuen Orts, nur aus einer Quelle'),
    note: nullable('string', 'Zusatz, kurz'),
    servings: nullable('integer', 'Portionen (set_servings)', { minimum: 1, maximum: 100 }),
    favorite: nullable('boolean', 'set_favorite: true merken, false nicht mehr'),
    weekday: nullable('integer', 'add_recurring: Wochentag 1 = Montag … 7 = Sonntag', {
      minimum: 1,
      maximum: 7,
    }),
    every_weeks: nullable('integer', 'add_recurring: alle wie viele Wochen', {
      minimum: 1,
      maximum: 52,
    }),
  },
} as const;

const PARAMETERS: Record<AgentProposalTool, Record<string, unknown>> = {
  propose_actions: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'actions'],
    properties: {
      title: nullable('string', 'kurzer Titel der Karte, z. B. „Für heute“'),
      actions: {
        type: 'array',
        description: `höchstens ${AGENT_PROPOSAL_LIMITS.actions} Einträge`,
        items: ACTION_JSON,
      },
    },
  },
  draft_recipe: {
    type: 'object',
    additionalProperties: false,
    required: ['wish', 'links', 'page_text', 'page_url', 'refine', 'use_photos'],
    properties: {
      wish: {
        type: 'string',
        description:
          'was die Person will, in ihren Worten mit allen Angaben (Portionen, vegetarisch …)',
      },
      links: {
        type: 'array',
        items: { type: 'string' },
        description: `bis zu ${AGENT_PROPOSAL_LIMITS.links} Links der Person (TikTok, YouTube, Rezeptseiten)`,
      },
      page_text: nullable(
        'string',
        'nur wenn ein Link nicht lesbar war: der Rezepttext, den du per Websuche von genau dieser Seite gelesen hast',
      ),
      page_url: nullable('string', 'die Seite zu page_text'),
      refine: {
        type: 'boolean',
        description: 'true: den letzten Entwurf dieses Chats nach dem Wunsch ändern',
      },
      use_photos: {
        type: 'boolean',
        description: 'true: die Fotos dieser Nachricht sind die Quelle',
      },
    },
  },
  make_image: {
    type: 'object',
    additionalProperties: false,
    required: ['prompt', 'for', 'name'],
    properties: {
      prompt: {
        type: 'string',
        description: 'englische Beschreibung des Fotos (ohne Text, ohne Personen)',
      },
      for: { type: 'string', enum: [...AGENT_IMAGE_SUBJECTS], description: 'wofür das Foto ist' },
      name: nullable('string', 'Titel oder Name des Eintrags; bei draft null'),
    },
  },
  show_entities: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'items'],
    properties: {
      title: nullable('string', 'kurzer Titel, z. B. „Eure Sammlungen“'),
      items: {
        type: 'array',
        description: `höchstens ${AGENT_PROPOSAL_LIMITS.entities} eigene Einträge mit ihrer id aus einem Werkzeug-Ergebnis`,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'id'],
          properties: {
            kind: { type: 'string', enum: [...AGENT_ENTITY_KINDS] },
            id: { type: 'string', description: 'die id aus dem Werkzeug-Ergebnis' },
          },
        },
      },
    },
  },
  show_images: {
    type: 'object',
    additionalProperties: false,
    required: ['query', 'for', 'name'],
    properties: {
      query: { type: 'string', description: 'Google-Bildersuche, kurz, ohne Haushaltsdaten' },
      for: { type: 'string', enum: [...AGENT_IMAGE_SUBJECTS], description: 'wofür das Foto ist' },
      name: nullable('string', 'Titel oder Name des Eintrags; bei draft null'),
    },
  },
};

/** The JSON schema of a proposal tool as foundry/agents/household-agent.yaml must carry it. */
export function agentProposalParameters(name: AgentProposalTool): Record<string, unknown> {
  return PARAMETERS[name];
}

export const isProposalTool = (name: string): name is AgentProposalTool =>
  (AGENT_PROPOSAL_TOOLS as readonly string[]).includes(name);

// ---------- Parsing what the model sent ----------

function json(raw: string): unknown {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return undefined;
  }
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** null and "" are "not set": the model's strict mode sends every key. */
const given = (value: unknown) => (value === null || value === '' ? undefined : value);

/**
 * AC-020: a delete only when the person's own message asks for one: „lösch“, „entfern“, „streich“,
 * „weg“, „raus“, „runter“. Text from pages, TikTok or the household's data never reaches here —
 * only the message she typed.
 */
export function deleteWished(message: string): boolean {
  return /(l(ö|oe)sch|entfern|streich|\bweg\b|\braus\b|runter|nicht mehr auf die liste)/i.test(
    message,
  );
}

const NEEDS: Partial<Record<AgentActionKind, (action: AgentAction) => boolean>> = {
  plan: (action) => action.target !== undefined,
  set_favorite: (action) => action.target === 'restaurant' || action.target === 'activity',
  set_servings: (action) => action.servings !== undefined,
  add_recurring: (action) => action.weekday !== undefined,
  remove_plan_entry: (action) => action.date !== undefined,
};

/**
 * The arguments of `propose_actions`: each entry checked on its own (one that fails drops out), at
 * most 20, deletes only with `deletesAllowed` (deleteWished of the person's message, AC-020).
 */
export function parseProposalArgs(
  raw: string,
  options: { id: string; deletesAllowed: boolean },
): { proposal: AgentProposal; dropped: number; deletesDropped: number } {
  const args = record(json(raw));
  const entries = Array.isArray(args.actions) ? args.actions : [];
  const actions: AgentAction[] = [];
  let dropped = 0;
  let deletesDropped = 0;
  for (const entry of entries) {
    const value = record(entry);
    const candidate = Object.fromEntries(
      Object.entries({
        kind: value.kind,
        target: value.target,
        id: value.id,
        name: value.name,
        date: value.date,
        slot: value.slot,
        time: value.time,
        address: value.address,
        note: value.note,
        servings: value.servings,
        favorite: value.favorite,
        weekday: value.weekday,
        everyWeeks: value.every_weeks,
      })
        .map(([key, field]) => [key, given(field)])
        .filter(([, field]) => field !== undefined),
    );
    // An id that is no uuid is a hint the app cannot use: the name finds the row.
    if (candidate.id !== undefined && !z.uuid().safeParse(candidate.id).success)
      delete candidate.id;
    const parsed = AgentActionSchema.safeParse(candidate);
    if (!parsed.success || NEEDS[parsed.data.kind]?.(parsed.data) === false) {
      dropped += 1;
      continue;
    }
    if (isDeleteKind(parsed.data.kind) && !options.deletesAllowed) {
      deletesDropped += 1;
      continue;
    }
    if (actions.length >= AGENT_PROPOSAL_LIMITS.actions) {
      dropped += 1;
      continue;
    }
    actions.push(parsed.data);
  }
  const title = typeof args.title === 'string' ? oneLine(args.title).slice(0, 60) : '';
  return {
    proposal: { id: options.id, ...(title ? { title } : {}), actions },
    dropped,
    deletesDropped,
  };
}

const HTTPS = /^https:\/\/[^\s/?#@]+[^\s]*$/i;

export interface DraftArgs {
  wish: string;
  links: string[];
  page?: { url: string; text: string };
  refine: boolean;
  usePhotos: boolean;
}

/** The arguments of `draft_recipe`; undefined when there is nothing to draft from. */
export function parseDraftArgs(raw: string): DraftArgs | undefined {
  const args = record(json(raw));
  const wish = typeof args.wish === 'string' ? oneLine(args.wish).slice(0, 2000) : '';
  const links = (Array.isArray(args.links) ? args.links : [])
    .filter((link): link is string => typeof link === 'string')
    .map((link) => link.trim())
    .filter((link) => link.length <= 2048 && HTTPS.test(link))
    .slice(0, AGENT_PROPOSAL_LIMITS.links);
  const pageUrl = typeof args.page_url === 'string' ? args.page_url.trim() : '';
  const pageText =
    typeof args.page_text === 'string'
      ? args.page_text.replace(CONTROLS, ' ').trim().slice(0, AGENT_PROPOSAL_LIMITS.pageText)
      : '';
  const page =
    pageText && HTTPS.test(pageUrl) && pageUrl.length <= 2048
      ? { url: pageUrl, text: pageText }
      : undefined;
  const refine = args.refine === true;
  const usePhotos = args.use_photos === true;
  if (!wish && links.length === 0 && !page && !usePhotos) return undefined;
  return { wish, links, ...(page ? { page } : {}), refine, usePhotos };
}

export interface ImageArgs {
  /** make_image: the English prompt; show_images: the query. */
  text: string;
  for: AgentImageSubject;
  name?: string;
}

/** The arguments of `make_image` and `show_images`; undefined without a prompt or a query. */
export function parseImageArgs(raw: string, max: number): ImageArgs | undefined {
  const args = record(json(raw));
  const value = typeof args.prompt === 'string' ? args.prompt : args.query;
  const textValue = typeof value === 'string' ? oneLine(value).slice(0, max) : '';
  if (!textValue) return undefined;
  const subject = (AGENT_IMAGE_SUBJECTS as readonly unknown[]).includes(args.for)
    ? (args.for as AgentImageSubject)
    : 'recipe';
  const name = typeof args.name === 'string' ? oneLine(args.name).slice(0, 200) : '';
  return { text: textValue, for: subject, ...(name && subject !== 'draft' ? { name } : {}) };
}

export const AgentEntityRefSchema = z.strictObject({
  kind: z.enum(AGENT_ENTITY_KINDS),
  id: z.uuid(),
});
export type AgentEntityRef = z.infer<typeof AgentEntityRefSchema>;

/**
 * The arguments of `show_entities` (preview 28.11.): own entries by kind and id, each once, at
 * most 12; an id that is no uuid or an unknown kind drops out. Whether they are the household's
 * the edge function checks (RLS), the app shows them from its own data.
 */
export function parseEntitiesArgs(raw: string): { title?: string; items: AgentEntityRef[] } {
  const args = record(json(raw));
  const items: AgentEntityRef[] = [];
  for (const entry of Array.isArray(args.items) ? args.items : []) {
    const parsed = AgentEntityRefSchema.safeParse(entry);
    if (!parsed.success || items.some((item) => item.id === parsed.data.id)) continue;
    if (items.length >= AGENT_PROPOSAL_LIMITS.entities) break;
    items.push(parsed.data);
  }
  const title = typeof args.title === 'string' ? oneLine(args.title).slice(0, 60) : '';
  return { ...(title ? { title } : {}), items };
}
