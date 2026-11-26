// "Websuche" (spec 0049): the edge function web-search with the active household. A search gives
// 3–5 cards; the preview of a place card gives cuisine or kind and a description. Nothing is
// saved: "Übernehmen" fills the form or the edit mode, "Speichern" stores it.
import type { PlaceProposal, WebResult, WebSearchKind, WebSearchReply } from '@housekeeping/core';

import { aiCall } from './ai';
import { getState } from './store';

/** AC-005, AC-008: the cards for `query`; places around `near` (Entscheidung 3). */
export function webSearchAsync(input: {
  kind: WebSearchKind;
  query: string;
  near?: { lat: number; lng: number };
}): Promise<WebSearchReply> {
  const householdId = getState().activeHouseholdId;
  return aiCall((transport) =>
    transport.webSearch({
      mode: 'search',
      householdId,
      kind: input.kind,
      query: input.query.trim(),
      ...(input.near ? { near: input.near } : {}),
    }),
  );
}

/** AC-011, AC-012: the household's cuisine or activity kind and a description for a place card. */
export async function placePreviewAsync(
  kind: 'restaurant' | 'activity',
  result: WebResult,
): Promise<PlaceProposal> {
  const householdId = getState().activeHouseholdId;
  const reply = await aiCall((transport) =>
    transport.placePreview({ mode: 'place', householdId, kind, result }),
  );
  return reply.proposal;
}
