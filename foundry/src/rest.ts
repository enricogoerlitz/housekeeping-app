// The Foundry agents API over REST with an Entra token (spec 0066, ADR-0019). Not the official
// SDK: the production job of release.yml runs no package code (spec 0014, decision 3), and this
// file and its callers import nothing but Node, so the pipeline runs our own code only. The token
// travels only in the Authorization header; errors carry the HTTP status and the service's error
// code, never a body or a header.
import type { AgentsApi } from './upsert';

const API_VERSION = 'v1';

export class FoundryError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(`HTTP ${statusCode}`);
    this.name = 'FoundryError';
  }
}

export function restAgentsApi(endpoint: string, token: string, fetchFn: typeof fetch): AgentsApi {
  const base = endpoint.replace(/\/+$/, '');
  async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetchFn(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (!response.ok) {
      const code = (json as { error?: { code?: unknown } } | undefined)?.error?.code;
      throw new FoundryError(
        response.status,
        typeof code === 'string' && /^[\w.-]{1,60}$/.test(code) ? code : '',
      );
    }
    return json;
  }
  const versionOf = (value: unknown): string => {
    const v = value as { version?: unknown; versions?: { latest?: { version?: unknown } } };
    const version = v?.versions?.latest?.version ?? v?.version;
    if (typeof version !== 'string' && typeof version !== 'number')
      throw new FoundryError(502, 'no_version');
    return String(version);
  };
  return {
    async versions(name) {
      try {
        const listed = (await call(
          'GET',
          `/agents/${encodeURIComponent(name)}/versions?api-version=${API_VERSION}&limit=100`,
        )) as { data?: { version?: unknown; definition?: unknown }[] } | undefined;
        return (listed?.data ?? []).map((entry) => ({
          version: String(entry.version),
          definition: entry.definition,
        }));
      } catch (error) {
        if (error instanceof FoundryError && error.statusCode === 404) return undefined;
        throw error;
      }
    },
    async createVersion(name, definition, options) {
      const body = { definition, ...options };
      try {
        return {
          version: versionOf(
            await call(
              'POST',
              `/agents/${encodeURIComponent(name)}/versions?api-version=${API_VERSION}`,
              body,
            ),
          ),
        };
      } catch (error) {
        // A new agent: created with its first version.
        if (!(error instanceof FoundryError) || error.statusCode !== 404) throw error;
        return {
          version: versionOf(
            await call('POST', `/agents?api-version=${API_VERSION}`, { name, ...body }),
          ),
        };
      }
    },
  };
}
