// The Foundry Agents runtime as ai-agent uses it (spec 0066, PoC tmp/ki-chat-poc): conversations,
// their items, responses of the agent, all with the resource key (`api-key`). Since spec 0067 the
// agent is the one household agent, foundry/agents/household-agent.yaml, deployed per environment
// by @housekeeping/foundry with Entra (ADR-0019, ADR-0020). Answers of Foundry carry the agent's instructions: nothing here is ever handed to
// the app as it came.
import type { Deps } from '../_shared/deps.ts';
import { HttpError, requireEnv } from '../_shared/errors.ts';

export interface AgentConfig {
  base: string;
  apiKey: string;
  /** household-agent-local, -preview or -prod. */
  agent: string;
  /** Pinned by the pipeline (the version its upsert named); unset locally means the latest. */
  version?: string;
}

export function agentConfig(env: Deps['env']): AgentConfig {
  return {
    base: `${requireEnv(env, 'FOUNDRY_PROJECT_ENDPOINT').replace(/\/+$/, '')}/openai/v1`,
    apiKey: requireEnv(env, 'FOUNDRY_API_KEY'),
    agent: requireEnv(env, 'FOUNDRY_HOUSEHOLD_AGENT'),
    ...(env('FOUNDRY_HOUSEHOLD_AGENT_VERSION')?.trim()
      ? { version: env('FOUNDRY_HOUSEHOLD_AGENT_VERSION')?.trim() }
      : {}),
  };
}

const CALL_MS = 15_000;

export interface Foundry {
  createConversation(metadata: Record<string, string>): Promise<string>;
  /** The metadata, or undefined when the conversation is gone (404). */
  conversationMetadata(id: string): Promise<Record<string, unknown> | undefined>;
  /** All items, oldest first, at most `pages` pages of 100. */
  items(id: string, order: 'asc' | 'desc', pages: number): Promise<unknown[]>;
  appendItems(id: string, items: unknown[]): Promise<void>;
  /** One item of a conversation (an edited message and what followed it). */
  deleteItem(id: string, itemId: string): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  /** The conversation id of a response, undefined when it is gone. */
  responseConversation(id: string): Promise<string | null | undefined>;
  deleteResponse(id: string): Promise<void>;
  /** The streamed response of the agent; the body is SSE. */
  respond(conversation: string, input: unknown[], signal: AbortSignal): Promise<Response>;
}

/** Logs only the step and the status, never a body (it may hold the prompt or a place). */
function failed(step: string, status?: number): never {
  console.error('foundry_agent_failed', { step, status });
  throw new HttpError('ai_unavailable');
}

export function foundryClient(deps: Pick<Deps, 'fetch'>, config: AgentConfig): Foundry {
  const headers = { 'api-key': config.apiKey, 'Content-Type': 'application/json' };
  async function call(
    step: string,
    method: string,
    path: string,
    body?: unknown,
    allow404 = false,
  ): Promise<{ status: number; json: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALL_MS);
    try {
      const response = await deps.fetch(`${config.base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      if (response.status === 404 && allow404) return { status: 404, json: undefined };
      if (!response.ok) failed(step, response.status);
      try {
        return { status: response.status, json: text ? (JSON.parse(text) as unknown) : undefined };
      } catch {
        return failed(step, response.status);
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      return failed(step);
    } finally {
      clearTimeout(timer);
    }
  }
  const field = (value: unknown, name: string): unknown =>
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)[name]
      : undefined;

  return {
    async createConversation(metadata) {
      const { json } = await call('create_conversation', 'POST', '/conversations', { metadata });
      const id = field(json, 'id');
      if (typeof id !== 'string' || !/^conv_[A-Za-z0-9_-]{1,200}$/.test(id))
        failed('create_conversation');
      return id;
    },
    async conversationMetadata(id) {
      const { status, json } = await call(
        'get_conversation',
        'GET',
        `/conversations/${id}`,
        undefined,
        true,
      );
      if (status === 404) return undefined;
      const metadata = field(json, 'metadata');
      return typeof metadata === 'object' && metadata !== null
        ? (metadata as Record<string, unknown>)
        : {};
    },
    async items(id, order, pages) {
      const all: unknown[] = [];
      let after: string | undefined;
      for (let page = 0; page < pages; page += 1) {
        const query = new URLSearchParams({ order, limit: '100', ...(after ? { after } : {}) });
        const { json } = await call('list_items', 'GET', `/conversations/${id}/items?${query}`);
        const data = field(json, 'data');
        if (!Array.isArray(data)) failed('list_items');
        all.push(...data);
        const last = field(json, 'last_id');
        if (field(json, 'has_more') !== true || typeof last !== 'string') break;
        after = last;
      }
      return all;
    },
    async appendItems(id, items) {
      await call('append_items', 'POST', `/conversations/${id}/items`, { items });
    },
    async deleteItem(id, itemId) {
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(itemId)) failed('delete_item');
      await call('delete_item', 'DELETE', `/conversations/${id}/items/${itemId}`, undefined, true);
    },
    async deleteConversation(id) {
      await call('delete_conversation', 'DELETE', `/conversations/${id}`, undefined, true);
    },
    async responseConversation(id) {
      const { status, json } = await call(
        'get_response',
        'GET',
        `/responses/${id}`,
        undefined,
        true,
      );
      if (status === 404) return undefined;
      const conversation = field(field(json, 'conversation'), 'id') ?? field(json, 'conversation');
      return typeof conversation === 'string' ? conversation : null;
    },
    async deleteResponse(id) {
      await call('delete_response', 'DELETE', `/responses/${id}`, undefined, true);
    },
    async respond(conversation, input, signal) {
      let response: Response;
      try {
        response = await deps.fetch(`${config.base}/responses`, {
          method: 'POST',
          headers,
          signal,
          body: JSON.stringify({
            agent_reference: {
              type: 'agent_reference',
              name: config.agent,
              ...(config.version ? { version: config.version } : {}),
            },
            conversation,
            input,
            stream: true,
            include: ['web_search_call.action.sources'],
          }),
        });
      } catch {
        return failed('respond');
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel().catch(() => undefined);
        failed('respond', response.status);
      }
      return response;
    },
  };
}
