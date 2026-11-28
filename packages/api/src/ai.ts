// The AI functions of the app (spec 0003, REQ-008; ADR-0009). They call the edge functions with
// the active household; replies are validated against the core contract in the transport.
// Nothing here changes data: a proposal is applied only when the person accepts it
// (`applyProposal`).
import type { SpeechTokenReply } from '@housekeeping/core';

import type { AssistantContext, AiSearchResult, AssistantReply } from './assistant';
import { onlineCall } from './backend';
import { getState, OfflineError } from './store';
import { TransportError, type Transport } from './transport';

export const AI_QUOTA_MESSAGE = 'Für heute ist das KI-Kontingent aufgebraucht';
export const AI_UNAVAILABLE_MESSAGE = 'Der Assistent ist gerade nicht erreichbar';
export const AI_SIGN_IN_MESSAGE = 'Bitte melde dich neu an';
export const AI_FAILED_MESSAGE = 'Das hat gerade nicht geklappt – bitte noch einmal versuchen';
/** Spec 0066, AC-035: the chat is at its end (spec 0067: 95 model runs). */
export const AI_CHAT_TOO_LONG_MESSAGE = 'Dieser Chat ist lang geworden – starte einen neuen.';
/** Spec 0067, AC-024: another person's answer runs in this chat. */
export const AI_CHAT_BUSY_MESSAGE = 'Agent antwortet gerade …';
/** Spec 0049, AC-023: neither Serper nor Brave answered. */
const WEB_SEARCH_UNAVAILABLE_MESSAGE =
  'Die Websuche ist gerade nicht erreichbar. Versuch es gleich noch einmal.';

export type AiErrorReason =
  'quota' | 'unavailable' | 'unauthorized' | 'failed' | 'search' | 'chatTooLong' | 'busy';

const MESSAGES: Record<AiErrorReason, string> = {
  quota: AI_QUOTA_MESSAGE,
  unavailable: AI_UNAVAILABLE_MESSAGE,
  unauthorized: AI_SIGN_IN_MESSAGE,
  failed: AI_FAILED_MESSAGE,
  search: WEB_SEARCH_UNAVAILABLE_MESSAGE,
  chatTooLong: AI_CHAT_TOO_LONG_MESSAGE,
  busy: AI_CHAT_BUSY_MESSAGE,
};

/** A failed AI call; `message` is the German text for the person. */
export class AiError extends Error {
  constructor(readonly reason: AiErrorReason) {
    super(MESSAGES[reason]);
    this.name = 'AiError';
  }
}

function reasonOf(error: TransportError): AiErrorReason {
  switch (error.code) {
    case 'quota_exceeded':
      return 'quota';
    case 'unauthorized':
      return 'unauthorized';
    case 'search_unavailable':
      return 'search';
    case 'chat_too_long':
      return 'chatTooLong';
    case 'chat_busy':
      return 'busy';
    case 'ai_unavailable':
    case 'network':
    case 'timeout':
    case 'offline':
      return 'unavailable';
    default:
      return 'failed';
  }
}

/** Sends one AI request; refused offline before anything is sent (OfflineError). */
export async function aiCall<T>(send: (transport: Transport) => Promise<T>): Promise<T> {
  try {
    return await onlineCall(send);
  } catch (error) {
    if (error instanceof TransportError) throw new AiError(reasonOf(error));
    throw error;
  }
}

/** The German text for an error of an AI call (also for OfflineError and unexpected ones). */
export function aiErrorMessage(error: unknown): string {
  if (error instanceof AiError || error instanceof OfflineError) return error.message;
  return AI_FAILED_MESSAGE;
}

/** Asks the assistant. */
export async function askAssistantAsync(
  text: string,
  context: AssistantContext,
): Promise<AssistantReply> {
  const message = text.trim();
  const householdId = getState().activeHouseholdId;
  return aiCall((transport) =>
    transport.askAssistant({
      householdId,
      message,
      context: context.recipeId ? { recipeId: context.recipeId } : {},
    }),
  );
}

/** The AI recipe search; `disabledChips` are the chips the person removed. */
export async function aiSearchAsync(
  query: string,
  disabledChips: string[],
): Promise<AiSearchResult> {
  const householdId = getState().activeHouseholdId;
  return aiCall((transport) =>
    transport.aiSearch({ householdId, query: query.trim(), disabledChips }),
  );
}

/** A token is renewed this long before it expires, so a dictation never starts with a dead one. */
const TOKEN_MARGIN_MS = 60_000;
/** Per transport, i.e. per signed-in session: a new sign-in never sees the previous token. */
const speechTokens = new WeakMap<Transport, SpeechTokenReply>();

/**
 * A short-lived token for streaming speech to Azure (AC-028); reused until one minute before it
 * expires. Never log it.
 */
export async function getSpeechToken(): Promise<SpeechTokenReply> {
  return aiCall(async (transport) => {
    const cached = speechTokens.get(transport);
    if (cached && Date.parse(cached.expiresAt) - TOKEN_MARGIN_MS > Date.now()) return cached;
    const fresh = await transport.speechToken();
    speechTokens.set(transport, fresh);
    return fresh;
  });
}

// ---------- AI search with debounce ----------

export type AiSearchState =
  | { status: 'idle' }
  | { status: 'loading'; query: string; disabledChips: string[] }
  | {
      status: 'done';
      query: string;
      disabledChips: string[];
      result: AiSearchResult;
    }
  | { status: 'error'; query: string; disabledChips: string[]; message: string };

export interface AiSearchController {
  /** On every change of switch or query: off or empty clears; otherwise a debounced search. */
  update(input: { enabled: boolean; query: string }): void;
  /** Searches the current query now, e.g. after removing a chip or "Nochmal suchen". */
  runNow(disabledChips: string[]): void;
  getState(): AiSearchState;
  subscribe(listener: () => void): () => void;
  /** Cancels a pending search and drops late answers. */
  dispose(): void;
}

export interface AiSearchControllerOptions {
  debounceMs?: number;
  search?: (query: string, disabledChips: string[]) => Promise<AiSearchResult>;
}

const IDLE: AiSearchState = { status: 'idle' };

/**
 * Runs the AI search only while the switch is on (AC-027): typing waits for a pause, a late
 * answer to an older query is dropped.
 */
export function createAiSearchController(
  options: AiSearchControllerOptions = {},
): AiSearchController {
  const debounceMs = options.debounceMs ?? 600;
  const search = options.search ?? aiSearchAsync;
  const listeners = new Set<() => void>();
  let state: AiSearchState = IDLE;
  let enabled = false;
  let query = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sequence = 0;

  const set = (next: AiSearchState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    sequence += 1;
  };

  const run = async (disabledChips: string[]) => {
    timer = undefined;
    const current = (sequence += 1);
    const asked = query.trim();
    set({ status: 'loading', query, disabledChips });
    try {
      const result = await search(asked, disabledChips);
      if (current === sequence) set({ status: 'done', query, disabledChips, result });
    } catch (error) {
      if (current === sequence)
        set({ status: 'error', query, disabledChips, message: aiErrorMessage(error) });
    }
  };

  return {
    update(input) {
      if (input.enabled === enabled && input.query === query) return;
      enabled = input.enabled;
      query = input.query;
      cancel();
      if (!enabled || query.trim() === '') {
        if (state !== IDLE) set(IDLE);
        return;
      }
      set({ status: 'loading', query, disabledChips: [] });
      timer = setTimeout(() => void run([]), debounceMs);
    },
    runNow(disabledChips) {
      if (!enabled || query.trim() === '') return;
      cancel();
      void run(disabledChips);
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      // Back to the start, so a remount (React strict mode) searches again on its first update.
      cancel();
      enabled = false;
      query = '';
      state = IDLE;
    },
  };
}
