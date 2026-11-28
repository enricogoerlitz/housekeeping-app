// `foundry-agents --purge-conversations preview` (spec 0067, decision 13): before the preview's
// database reset, its Foundry chats go too — every conversation whose metadata say
// `app: housekeeping` and `env: preview`, with every answer of it (resp_…, which outlive the
// conversation; their ids stand on the conversation's items). Production is never purged. Like
// rest.ts it imports nothing but our own files and prints only counts, a failure only its HTTP
// status and code — never a token, a header or a body.
import { FoundryError } from './rest';

export interface ConversationsApi {
  /** One page of the project's conversations. */
  list(after?: string): Promise<{
    data: { id: string; metadata: Record<string, unknown> }[];
    hasMore: boolean;
    lastId?: string;
  }>;
  /** The ids of the answers that wrote into the conversation. */
  responseIds(conversation: string): Promise<string[]>;
  deleteResponse(id: string): Promise<void>;
  deleteConversation(id: string): Promise<void>;
}

const CONVERSATION = /^conv_[A-Za-z0-9_-]{1,200}$/;
const RESPONSE = /^resp_[A-Za-z0-9_-]{1,200}$/;
/** Pages of 100: a preview never holds more than a few hundred chats. */
const MAX_PAGES = 50;

export function restConversationsApi(
  endpoint: string,
  token: string,
  fetchFn: typeof fetch,
): ConversationsApi {
  const base = `${endpoint.replace(/\/+$/, '')}/openai/v1`;
  async function call(method: string, path: string, allow404 = false): Promise<unknown> {
    const response = await fetchFn(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const text = await response.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (response.status === 404 && allow404) return undefined;
    if (!response.ok) {
      const code = (json as { error?: { code?: unknown } } | undefined)?.error?.code;
      throw new FoundryError(
        response.status,
        typeof code === 'string' && /^[\w.-]{1,60}$/.test(code) ? code : '',
      );
    }
    return json;
  }
  const page = (value: unknown) =>
    (value ?? {}) as { data?: unknown[]; has_more?: unknown; last_id?: unknown };
  return {
    async list(after) {
      const query = new URLSearchParams({ limit: '100', order: 'asc', ...(after ? { after } : {}) });
      const listed = page(await call('GET', `/conversations?${query}`));
      return {
        data: (listed.data ?? []).flatMap((raw) => {
          const entry = (raw ?? {}) as { id?: unknown; metadata?: unknown };
          return typeof entry.id === 'string' && CONVERSATION.test(entry.id)
            ? [
                {
                  id: entry.id,
                  metadata:
                    typeof entry.metadata === 'object' && entry.metadata !== null
                      ? (entry.metadata as Record<string, unknown>)
                      : {},
                },
              ]
            : [];
        }),
        hasMore: listed.has_more === true,
        ...(typeof listed.last_id === 'string' ? { lastId: listed.last_id } : {}),
      };
    },
    async responseIds(conversation) {
      const ids = new Set<string>();
      let after: string | undefined;
      for (let at = 0; at < MAX_PAGES; at += 1) {
        const query = new URLSearchParams({ limit: '100', ...(after ? { after } : {}) });
        const listed = page(await call('GET', `/conversations/${conversation}/items?${query}`, true));
        for (const raw of listed.data ?? []) {
          const id = (raw as { response_id?: unknown } | null)?.response_id;
          if (typeof id === 'string' && RESPONSE.test(id)) ids.add(id);
        }
        if (listed.has_more !== true || typeof listed.last_id !== 'string') break;
        after = listed.last_id;
      }
      return [...ids];
    },
    async deleteResponse(id) {
      await call('DELETE', `/responses/${id}`, true);
    },
    async deleteConversation(id) {
      await call('DELETE', `/conversations/${id}`, true);
    },
  };
}

/** The chats of one environment: answers first, then the conversation. */
export async function purgeConversations(
  api: ConversationsApi,
  environment: 'preview' | 'local',
): Promise<{ conversations: number; responses: number }> {
  const ours: string[] = [];
  let after: string | undefined;
  for (let at = 0; at < MAX_PAGES; at += 1) {
    const listed = await api.list(after);
    for (const entry of listed.data)
      if (entry.metadata.app === 'housekeeping' && entry.metadata.env === environment)
        ours.push(entry.id);
    if (!listed.hasMore || !listed.lastId) break;
    after = listed.lastId;
  }
  let responses = 0;
  for (const id of ours) {
    for (const response of await api.responseIds(id)) {
      await api.deleteResponse(response);
      responses += 1;
    }
    await api.deleteConversation(id);
  }
  return { conversations: ours.length, responses };
}

export interface PurgeDeps {
  env: (name: string) => string | undefined;
  api: (endpoint: string) => ConversationsApi;
  log: (line: string) => void;
  error: (line: string) => void;
}

/** The CLI step: exit 0 done, 1 Foundry refused, 2 wrong call or setting. */
export async function runPurge(argv: readonly string[], deps: PurgeDeps): Promise<number> {
  const at = argv.indexOf('--purge-conversations');
  const environment = at >= 0 ? argv[at + 1] : undefined;
  if (environment !== 'preview' && environment !== 'local') {
    deps.error('Aufruf: foundry-agents --purge-conversations preview|local (nie prod)');
    return 2;
  }
  const endpoint = deps.env('FOUNDRY_PROJECT_ENDPOINT')?.trim();
  if (!endpoint || !/^https:\/\/[\w.-]+\/api\/projects\/[\w.-]+\/?$/.test(endpoint)) {
    deps.error('FOUNDRY_PROJECT_ENDPOINT fehlt oder ist keine Projekt-Adresse');
    return 2;
  }
  try {
    const done = await purgeConversations(deps.api(endpoint), environment);
    deps.log(
      `Foundry-Chats der ${environment === 'preview' ? 'Vorschau' : 'lokalen Umgebung'} gelöscht: ${done.conversations} Conversations, ${done.responses} Antworten`,
    );
    return 0;
  } catch (error) {
    const reason =
      error instanceof FoundryError
        ? `HTTP ${error.statusCode}${error.code ? ` ${error.code}` : ''}`
        : 'Fehler';
    deps.error(`Foundry-Chats löschen scheiterte (${reason})`);
    return 1;
  }
}
