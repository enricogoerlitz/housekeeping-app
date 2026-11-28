// KI-Agent (spec 0066, ADR-0018): the research chat through the edge function ai-agent. Sending
// streams the answer as events (core AgentStreamEvent); the chat's row comes into the cache with
// the pull after it, so "Verlauf" shows it. Loading and deleting are online; the content of a
// chat is never stored on the device.
import {
  type AgentAttachment,
  type AgentBadgeSlug,
  AgentStreamEventSchema,
  createSseParser,
  type AgentMessage,
  type AgentPlace,
  type AgentStreamEvent,
  type Id,
} from '@housekeeping/core';

import { AiError, aiCall, type AiErrorReason } from './ai';
import { householdCall, onlineCall } from './backend';
import { getState, OfflineError } from './store';

const STREAM_REASON: Record<string, AiErrorReason> = {
  quota_exceeded: 'quota',
  chat_too_long: 'chatTooLong',
  ai_unavailable: 'unavailable',
  blocked: 'blocked',
};

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
  } catch {
    return 'Europe/Berlin';
  }
}

async function readEvents(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: AgentStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  const stop = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener('abort', stop);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done || signal.aborted) return;
      for (const raw of parser.push(decoder.decode(value, { stream: true }))) {
        const event = AgentStreamEventSchema.safeParse(raw);
        if (!event.success) continue;
        if (event.data.type === 'error')
          throw new AiError(STREAM_REASON[event.data.error] ?? 'failed');
        onEvent(event.data);
      }
    }
  } catch (error) {
    if (signal.aborted) return;
    if (error instanceof AiError) throw error;
    throw new AiError('unavailable');
  } finally {
    signal.removeEventListener('abort', stop);
  }
}

/**
 * Sends a message of the active household (REQ-005): in `chatId` or a new chat. Events arrive as
 * they come; "Recherche anhalten" aborts `signal` and the promise settles quietly. Offline:
 * OfflineError before anything is sent; refusals are AiError (quota, chat too long).
 */
export async function sendAgentMessage(
  input: {
    chatId?: Id;
    message: string;
    place: AgentPlace;
    /** Spec 0067: the badges of the message, as hints. */
    badges?: readonly AgentBadgeSlug[];
    /** Spec 0067: photos (JPEG) and PDF files, prepared by the app. */
    attachments?: readonly AgentAttachment[];
    /** Preview feedback 28.11.: the person's n-th message is edited; it and the rest go. */
    editFrom?: number;
  },
  onEvent: (event: AgentStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const householdId = getState().activeHouseholdId;
  try {
    // Online like every write; the pull after it brings the chat's row (REQ-008). A refusal of
    // the transport becomes the AI's message (aiCall).
    await aiCall(() =>
      householdCall(async (transport) => {
        const stream = await transport.agentSend(
          {
            action: 'send',
            householdId,
            ...(input.chatId ? { chatId: input.chatId } : {}),
            message: input.message.trim(),
            place: input.place,
            timeZone: deviceTimeZone(),
            badges: [...(input.badges ?? [])],
            attachments: [...(input.attachments ?? [])],
            ...(input.editFrom !== undefined ? { editFrom: input.editFrom } : {}),
          },
          signal,
        );
        await readEvents(stream, onEvent, signal);
      }),
    );
  } catch (error) {
    if (signal.aborted && !(error instanceof OfflineError)) return;
    throw error;
  }
}

/** The messages of a chat (AC-025), loaded online from its Foundry conversation. */
export async function loadAgentChat(chatId: Id): Promise<AgentMessage[]> {
  const householdId = getState().activeHouseholdId;
  const reply = await aiCall((transport) => transport.agentLoad(householdId, chatId));
  return reply.messages;
}

/**
 * Spec 0067, AC-024: whether an answer runs in the chat (another person's, or one of this device
 * still going); the page waits with "Agent antwortet gerade …" before it sends.
 */
export async function agentChatAnswering(chatId: Id): Promise<boolean> {
  const householdId = getState().activeHouseholdId;
  return aiCall((transport) => transport.agentStatus(householdId, chatId));
}

const AGENT_DELETE_FAILED_MESSAGE = 'Löschen hat nicht geklappt – bitte noch einmal.';

/** AC-028, AC-029: the chat in Foundry and its row, for every device of the household. */
export async function deleteAgentChat(chatId: Id): Promise<void> {
  const householdId = getState().activeHouseholdId;
  try {
    await householdCall((transport) => transport.agentDelete(householdId, chatId));
  } catch (error) {
    if (error instanceof OfflineError) throw error;
    throw new Error(AGENT_DELETE_FAILED_MESSAGE);
  }
}

/** REQ-010: every chat of a household, before it is deleted. The number deleted. */
export function purgeAgentChats(householdId: Id): Promise<number> {
  return onlineCall((transport) => transport.agentDelete(householdId));
}
