// Spec 0067, step B (REQ-009 – REQ-011): the agent's tools that propose instead of writing.
// `propose_actions` and `make_image` only become a card in the app (nothing runs here, nothing is
// written: applying is the app's, through its own commands); `show_images` asks Serper for Google
// images; `draft_recipe` runs the draft pipeline of ai-recipe-draft (same schema, same catalog,
// same link readers with their rules) and reads only, under the person's RLS. Every argument of
// the model is checked in core agent-proposals.ts first.
import {
  AGENT_PROPOSAL_LIMITS,
  deleteWished,
  parseChangeArgs,
  parseDraftArgs,
  parseEntitiesArgs,
  parseFillWeekArgs,
  parseImageArgs,
  parsePhotoArgs,
  parseProposalArgs,
  personLinks,
} from '../_shared/agent-proposals.gen.ts';
import {
  changeOutput,
  draftOutput,
  entitiesOutput,
  imagesOutput,
  photosOutput,
  proposalStep,
  weekFillOutput,
  type AgentExtra,
  type AgentImageHit,
  type AgentSendRequest,
  type AgentStep,
} from '../_shared/ai-agent.gen.ts';
import {
  RECIPE_DRAFT_LIMITS,
  RecipeDraftReplySchema,
  RecipeDraftRequestSchema,
  RecipeDraftSchema,
  type RecipeDraftReply,
} from '../_shared/contract.gen.ts';
import type { Deps, UserClient } from '../_shared/deps.ts';
import { HttpError } from '../_shared/errors.ts';
import { draftRecipe, readLinks } from '../_shared/recipe-draft.ts';
import { configuredProviders } from '../_shared/web-search.ts';

/** The tools that end with their card: no model run follows for them. */
export const CARD_TOOLS = new Set([
  'propose_actions',
  'make_image',
  'show_images',
  'show_entities',
  'change_recipe',
  'fill_week',
]);

const ENTITY_TABLE = {
  recipe: 'recipes',
  collection: 'recipes',
  restaurant: 'restaurants',
  activity: 'activities',
} as const;

/**
 * show_entities (preview 28.11.): the household's own entries as cards. Only ids the chat's
 * household has (read as the person, RLS, `household_id` from the chat) are shown; the app draws
 * the cards from its own data.
 */
export async function runEntitiesTool(
  client: UserClient,
  householdId: string,
  call: { callId: string; args: string },
  emit: (extra: AgentExtra) => void,
): Promise<string> {
  const { title, items } = parseEntitiesArgs(call.args);
  const found = new Set<string>();
  for (const table of new Set(items.map((item) => ENTITY_TABLE[item.kind]))) {
    const ids = items.filter((item) => ENTITY_TABLE[item.kind] === table).map((item) => item.id);
    const { data, error } = await client
      .from(table)
      .select('id')
      .eq('household_id', householdId)
      .in('id', ids)
      .limit(AGENT_PROPOSAL_LIMITS.entities);
    if (error) {
      console.error('ai_agent_entities_failed');
      continue;
    }
    for (const row of Array.isArray(data) ? data : []) {
      const id = (row as { id?: unknown }).id;
      if (typeof id === 'string') found.add(id);
    }
  }
  const shown = items.filter((item) => found.has(item.id));
  if (shown.length > 0)
    emit({ kind: 'entities', id: call.callId, ...(title ? { title } : {}), items: shown });
  return entitiesOutput(title, shown, items.length - shown.length);
}

export interface CardContext {
  /** The person's own message of this turn: only it can ask for a delete (AC-020). */
  message: string;
  emit: (extra: AgentExtra) => void;
  /** One AI photo and one image row per answer (REQ-011, decision 8). */
  made: { image: boolean; images: boolean };
}

const json = (value: unknown) => JSON.stringify(value);

/** propose_actions and make_image: the card in the app and what the model hears back. */
export function runCardTool(
  call: { name: string; callId: string; args: string },
  context: CardContext,
): string {
  if (call.name === 'propose_actions') {
    const { proposal, dropped, deletesDropped } = parseProposalArgs(call.args, {
      id: call.callId,
      deletesAllowed: deleteWished(context.message),
    });
    if (proposal.actions.length > 0) context.emit({ kind: 'proposal', proposal });
    return json({
      shown: proposal.actions.length > 0,
      entries: proposal.actions.length,
      ...(dropped > 0 ? { invalid: dropped } : {}),
      ...(deletesDropped > 0
        ? {
            deletes_refused: deletesDropped,
            hint: 'Löschen schlägst du nur vor, wenn die Person es selbst in ihrer Nachricht wünscht.',
          }
        : {}),
      note: 'Nichts ist geändert: die Person übernimmt die Einträge selbst in der Karte.',
    });
  }
  if (call.name === 'fill_week') {
    // REQ-014: the dishes, free evenings and trips are the app's (core week-fill.ts).
    const wishes = parseFillWeekArgs(call.args);
    if (!wishes) return json({ error: 'invalid_arguments' });
    context.emit({ kind: 'week_fill', id: call.callId, wishes });
    return weekFillOutput();
  }
  // make_image
  const image = parseImageArgs(call.args, AGENT_PROPOSAL_LIMITS.prompt);
  if (!image) return json({ error: 'invalid_arguments' });
  if (context.made.image) return json({ error: 'one_image_per_answer' });
  context.made.image = true;
  context.emit({
    kind: 'image',
    id: call.callId,
    prompt: image.text,
    for: image.for,
    ...(image.name ? { name: image.name } : {}),
  });
  return json({ shown: true, note: 'Die App erzeugt genau ein Foto; nichts ist gespeichert.' });
}

const hostOf = (url: string) =>
  (/^https:\/\/(?:[^/?#@]*@)?([^/?#:]+)/i.exec(url)?.[1] ?? '').toLowerCase().replace(/^www\./, '');

/** show_images: Google images through Serper (REQ-011); shown only, never stored. */
export async function runImagesTool(
  deps: Deps,
  call: { callId: string; args: string },
  context: CardContext,
  stepId: string,
): Promise<{ output: string; step: AgentStep }> {
  const query = parseImageArgs(call.args, AGENT_PROPOSAL_LIMITS.query);
  const failed = (error: string, detail: string) => ({
    output: json({ error }),
    step: {
      id: stepId,
      kind: 'tool' as const,
      label: 'Sucht Bilder',
      detail,
      details: [],
      status: 'done' as const,
    },
  });
  if (!query) return failed('invalid_arguments', 'Anfrage ungültig');
  if (context.made.images) return failed('one_row_per_answer', 'übersprungen');
  context.made.images = true;
  const serper = configuredProviders(deps).find((provider) => provider.name === 'serper');
  let images: AgentImageHit[] = [];
  try {
    images = ((await serper?.images?.(query.text)) ?? [])
      .slice(0, AGENT_PROPOSAL_LIMITS.images)
      .map((hit) => ({
        imageUrl: hit.imageUrl,
        ...(hit.thumbnailUrl ? { thumbnailUrl: hit.thumbnailUrl } : {}),
        pageUrl: hit.pageUrl,
        host: hostOf(hit.pageUrl).slice(0, 200),
        ...(hit.title ? { title: hit.title } : {}),
      }));
  } catch {
    console.error('ai_agent_images_failed');
    return failed('images_unavailable', 'gerade nicht erreichbar');
  }
  if (images.length > 0)
    context.emit({
      kind: 'images',
      id: call.callId,
      query: query.text,
      images,
      for: query.for,
      ...(query.name ? { name: query.name } : {}),
    });
  const output = imagesOutput(images);
  return { output, step: proposalStep('show_images', call.args, output, stepId)! };
}

/** The newest draft of this chat, for `refine`: one made in this answer, else the conversation's. */
export function lastDraft(items: readonly unknown[]): RecipeDraftReply | undefined {
  for (const raw of items) {
    const item = raw as { type?: unknown; output?: unknown };
    if (item.type !== 'function_call_output' || typeof item.output !== 'string') continue;
    if (!item.output.includes('"draft"')) continue;
    try {
      const value = JSON.parse(item.output) as Record<string, unknown>;
      const reply = RecipeDraftReplySchema.safeParse({
        draft: value.draft,
        sources: value.sources,
        ...(value.webPhotoUrl ? { webPhotoUrl: value.webPhotoUrl } : {}),
      });
      if (reply.success) return reply.data;
    } catch {
      // Not ours.
    }
  }
  return undefined;
}

/** The texts the person wrote among conversation items, without the app's [KONTEXT] block. */
export function personMessages(items: readonly unknown[]): string[] {
  const texts: string[] = [];
  for (const raw of items) {
    const item = raw as { type?: unknown; role?: unknown; content?: unknown };
    if (item.type !== 'message' || item.role !== 'user' || !Array.isArray(item.content)) continue;
    for (const part of item.content as ({ type?: unknown; text?: unknown } | null)[])
      if (
        part?.type === 'input_text' &&
        typeof part.text === 'string' &&
        !part.text.startsWith('[KONTEXT]')
      )
        texts.push(part.text);
  }
  return texts;
}

const fold = (value: string) =>
  value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Preview 28.11. (decision 25): recipes of the household with the draft's title or one of its
 * source links — read as the person, the chat's household only. The agent says so and offers to
 * change the existing one or to create a new one anyway.
 */
async function existingRecipes(
  client: UserClient,
  householdId: string,
  reply: RecipeDraftReply,
): Promise<{ id: string; title: string }[]> {
  const { data, error } = await client
    .from('recipes')
    .select('id,title,links')
    .eq('household_id', householdId)
    .limit(1000);
  if (error || !Array.isArray(data)) return [];
  const title = fold(reply.draft.title);
  const urls = new Set(reply.sources.flatMap((source) => [source.url, source.resolvedUrl ?? '']));
  return data
    .flatMap((raw) => {
      const row = raw as { id?: unknown; title?: unknown; links?: unknown };
      if (typeof row.id !== 'string' || typeof row.title !== 'string') return [];
      const links = Array.isArray(row.links) ? row.links : [];
      const sameLink = links.some(
        (link) =>
          typeof link === 'object' &&
          link !== null &&
          urls.has(String((link as { url?: unknown }).url)),
      );
      return sameLink || fold(row.title) === title ? [{ id: row.id, title: row.title }] : [];
    })
    .slice(0, 3);
}

const UNREADABLE_HINT =
  'Lies die Seite mit deiner Websuche und ruf draft_recipe noch einmal mit dem Rezepttext als page_text und page_url auf. Geht das auch nicht, sag es ehrlich und bitte um den Text oder Screenshots – erfinde keine Mengen.';

const FOREIGN_LINK_HINT =
  'Gelesen werden nur Links, die die Person selbst geschickt hat. Lies die Seite mit deiner Websuche und ruf draft_recipe mit dem Rezepttext als page_text und page_url auf, oder bitte die Person um den Link.';

/**
 * draft_recipe (REQ-010): the draft pipeline of ai-recipe-draft. A link that cannot be read gives
 * no draft but the honest way on (AC-022): the agent reads the page itself or asks for text.
 */
export async function runDraftTool(
  deps: Deps,
  client: UserClient,
  input: AgentSendRequest,
  call: { callId: string; args: string },
  context: {
    emit: (extra: AgentExtra) => void;
    previous: () => Promise<RecipeDraftReply | undefined>;
    /** The texts of the person's earlier messages in this chat (read only when needed). */
    earlierMessages: () => Promise<string[]>;
  },
  stepId: string,
): Promise<{ output: string; step: AgentStep; reply?: RecipeDraftReply }> {
  const args = parseDraftArgs(call.args);
  const done = (output: string, reply?: RecipeDraftReply) => ({
    output,
    step: proposalStep('draft_recipe', call.args, output, stepId)!,
    ...(reply ? { reply } : {}),
  });
  if (!args) return done(json({ error: 'invalid_arguments' }));
  const current = args.refine ? await context.previous() : undefined;
  if (args.refine && !current) return done(json({ error: 'no_draft_to_change' }));
  // A page the agent read itself stands in for the same link (one source, not two).
  const asked = args.links.filter((link) => link !== args.page?.url);
  // Only links the person sent are fetched (security check 28.11.): the server's GET would carry
  // whatever an injected link holds to its host, without a tap.
  const sent = [input.message, ...(current?.sources ?? []).map((source) => source.url)];
  let { allowed: links, dropped } = personLinks(asked, sent);
  if (dropped.length > 0)
    ({ allowed: links, dropped } = personLinks(asked, [
      ...sent,
      ...(await context.earlierMessages()),
    ]));
  const photos = args.usePhotos
    ? input.attachments
        .flatMap((attachment) => (attachment.kind === 'image' ? [attachment.dataUrl] : []))
        .slice(0, RECIPE_DRAFT_LIMITS.photos)
    : [];
  if (dropped.length > 0 && links.length === 0 && !args.page && photos.length === 0)
    return done(json({ error: 'link_not_from_person', urls: dropped, hint: FOREIGN_LINK_HINT }));
  const read = await readLinks(links, deps);
  const unread = read.filter((link) => !link.source.read);
  if (unread.length > 0 && unread.length === read.length && !args.page && photos.length === 0)
    return done(
      json({
        error: 'link_unreadable',
        urls: unread.map((link) => link.source.url),
        hint: UNREADABLE_HINT,
      }),
    );
  const request = RecipeDraftRequestSchema.safeParse({
    householdId: input.householdId,
    text: args.wish.slice(0, RECIPE_DRAFT_LIMITS.text),
    links: links.slice(0, RECIPE_DRAFT_LIMITS.links - (args.page ? 1 : 0)),
    photos,
    imagePrompt: true,
    ...(current ? { current: RecipeDraftSchema.parse(current.draft) } : {}),
  });
  if (!request.success) return done(json({ error: 'invalid_arguments' }));
  try {
    const made = await draftRecipe(deps, client, request.data, {
      read: read.slice(0, request.data.links.length),
      ...(args.page ? { pages: [args.page] } : {}),
    });
    const reply = RecipeDraftReplySchema.parse({
      draft: made.draft,
      // A refined draft keeps the links of the one it changes.
      sources: made.sources.length > 0 ? made.sources : (current?.sources ?? []),
      ...(made.webPhotoUrl ? { webPhotoUrl: made.webPhotoUrl } : {}),
    });
    context.emit({ kind: 'recipe_draft', id: call.callId, reply });
    const existing = await existingRecipes(client, input.householdId, reply);
    if (existing.length > 0)
      context.emit({
        kind: 'entities',
        id: `${call.callId}-existing`,
        title: 'Habt ihr schon',
        items: existing.map((recipe) => ({ kind: 'recipe' as const, id: recipe.id })),
      });
    return done(draftOutput(reply, existing), reply);
  } catch (error) {
    if (!(error instanceof HttpError)) console.error('ai_agent_draft_failed');
    return done(json({ error: 'draft_failed' }));
  }
}

/**
 * change_recipe (spec 0067, step C): a change of one of the household's recipes ("vegetarische
 * Variante zur Lasagne"). The recipe is found here, as the person and in the chat's household
 * only, by its id or its title; the app opens it with "Mit KI ändern" and the wish, where the
 * person sees the Änderungsansicht and takes it over with "Rückgängig". Nothing is written here.
 */
export async function runChangeTool(
  client: UserClient,
  householdId: string,
  call: { callId: string; args: string },
  emit: (extra: AgentExtra) => void,
): Promise<string> {
  const args = parseChangeArgs(call.args);
  if (!args) return json({ error: 'invalid_arguments' });
  const { data, error } = await client
    .from('recipes')
    .select('id,kind,title,ingredients,steps')
    .eq('household_id', householdId)
    .limit(1000);
  if (error || !Array.isArray(data)) {
    console.error('ai_agent_change_failed');
    return json({ error: 'recipe_not_found' });
  }
  const rows = data as {
    id?: unknown;
    kind?: unknown;
    title?: unknown;
    ingredients?: unknown;
    steps?: unknown;
  }[];
  const recipe =
    rows.find((row) => args.id !== undefined && row.id === args.id) ??
    rows.find((row) => typeof row.title === 'string' && fold(row.title) === fold(args.name));
  if (!recipe || typeof recipe.id !== 'string' || typeof recipe.title !== 'string')
    return json({ error: 'recipe_not_found' });
  if (recipe.kind === 'collection')
    return json({ error: 'collection', hint: 'Eine Sammlung hat keine Varianten.' });
  const empty = (value: unknown) => !Array.isArray(value) || value.length === 0;
  if (empty(recipe.ingredients) && empty(recipe.steps))
    return json({
      error: 'unfinished',
      hint: 'Das Rezept ist nur ein Titel: schlag mit propose_actions work_out vor (Mit KI ausarbeiten).',
    });
  const title = recipe.title.slice(0, 200);
  emit({ kind: 'recipe_change', id: call.callId, recipeId: recipe.id, title, wish: args.wish });
  return changeOutput({ id: recipe.id, title }, args.wish);
}

const PHOTO_TABLES = {
  recipe: { table: 'recipes', title: 'title' },
  restaurant: { table: 'restaurants', title: 'name' },
  activity: { table: 'activities', title: 'name' },
} as const;
/** A stored photo is a JPEG of preparePhoto (1280 px); anything far bigger is not ours. */
const MAX_PHOTO_BYTES = 3_000_000;

function imageType(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png';
  return undefined;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

/**
 * look_at_photos (REQ-013: photos only on request, each one costs): the household's own photos
 * of up to six entries, read as the person (RLS on the rows and on the bucket), go to the model's
 * next run as images. Entries of another household, without a photo or whose photo cannot be
 * loaded are left out and counted. `charge` takes the quota for the photos first.
 */
export async function runPhotosTool(
  client: UserClient,
  householdId: string,
  call: { callId: string; args: string },
  stepId: string,
  charge: (photos: number) => Promise<void>,
): Promise<{ output: string | unknown[]; step: AgentStep }> {
  const args = parsePhotoArgs(call.args);
  const step = (text: string) => proposalStep('look_at_photos', call.args, text, stepId)!;
  if (!args) {
    const output = json({ error: 'invalid_arguments' });
    return { output, step: step(output) };
  }
  const { table, title } = PHOTO_TABLES[args.kind];
  const { data, error } = await client
    .from(table)
    .select(`id,${title},photo_path`)
    .eq('household_id', householdId)
    .in('id', args.ids)
    .limit(AGENT_PROPOSAL_LIMITS.photos);
  const rows = (error || !Array.isArray(data) ? [] : data) as Record<string, unknown>[];
  const withPhoto = rows.filter(
    (row) => typeof row.photo_path === 'string' && row.photo_path.startsWith(`${householdId}/`),
  );
  try {
    if (withPhoto.length > 0) await charge(withPhoto.length);
  } catch (caught) {
    if (!(caught instanceof HttpError) || caught.code !== 'quota_exceeded') throw caught;
    const output = json({ error: 'quota_exceeded' });
    return { output, step: step(output) };
  }
  const seen: { id: string; title: string }[] = [];
  const images: unknown[] = [];
  for (const row of withPhoto) {
    const loaded = await client.storage.download('household-media', String(row.photo_path));
    const type = loaded.data ? imageType(loaded.data) : undefined;
    if (!loaded.data || !type || loaded.data.length > MAX_PHOTO_BYTES) {
      console.error('ai_agent_photo_unreadable');
      continue;
    }
    seen.push({ id: String(row.id), title: String(row[title] ?? '').slice(0, 200) });
    images.push({
      type: 'input_image',
      image_url: `data:${type};base64,${base64(loaded.data)}`,
      detail: 'low',
    });
  }
  const text = photosOutput(seen, rows.length - withPhoto.length);
  return { output: [{ type: 'input_text', text }, ...images], step: step(text) };
}
