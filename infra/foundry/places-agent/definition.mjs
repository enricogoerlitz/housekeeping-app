// The Foundry prompt agent of the KI-Agent (spec 0066, ADR-0018): restaurants and activities in one
// agent, web search (Web IQ) and the client function `show_suggestions`. The edge function
// ai-agent names its version explicitly (FOUNDRY_PLACES_AGENT_VERSION), so a change here only
// reaches the app once that variable is raised. Derived from the PoC agent
// places-research-agent-preview (tmp/ki-chat-poc, 27.11.2026).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const AGENT_NAME = 'places-agent';
export const MODEL = 'gpt-6.1-terra';

const nullable = (type, extra = {}) => ({ type: [type, 'null'], ...extra });

/** One card. Strict mode: every key required, unknowns as null. Parsed by core ai-agent.ts. */
const placeItem = {
  type: 'object',
  additionalProperties: false,
  required: [
    'kind',
    'step',
    'name',
    'category',
    'address',
    'district',
    'lat',
    'lng',
    'price_level',
    'price_range',
    'open_status',
    'why',
    'website',
    'tags',
  ],
  properties: {
    kind: { type: 'string', enum: ['restaurant', 'activity'] },
    step: nullable('string', { description: '„erst“, „dann“ … bei Kombinationen, sonst null' }),
    name: { type: 'string', description: 'Name wie auf der eigenen Website' },
    category: {
      type: 'string',
      description: 'Art, z. B. „Italienisch“, „Gourmetrestaurant“, „Museum“',
    },
    address: nullable('string', {
      description: 'Straße Hausnummer, PLZ Ort – nur aus einer Quelle',
    }),
    district: nullable('string', { description: 'Stadtteil/Kiez' }),
    lat: nullable('number'),
    lng: nullable('number'),
    price_level: nullable('integer', { minimum: 1, maximum: 4 }),
    price_range: nullable('string', { description: 'z. B. „40–90 € p. P.“ oder „Eintritt 12 €“' }),
    open_status: nullable('string', {
      description: 'zum gewünschten Zeitpunkt, z. B. „Fr ab 18 Uhr geöffnet“ oder „unsicher“',
    }),
    why: { type: 'string', description: '1–2 Sätze, warum es zur Anfrage passt' },
    website: nullable('string', { description: 'Eigene Website (https), nur wenn gefunden' }),
    tags: { type: 'array', items: { type: 'string' }, description: 'z. B. Terrasse, vegetarisch' },
  },
};

export const showSuggestionsTool = {
  type: 'function',
  name: 'show_suggestions',
  description:
    'Zeigt vorgeschlagene Restaurants und Aktivitäten als antippbare Karten in der App an. Als letzter Schritt aufrufen.',
  strict: true,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'items', 'follow_ups'],
    properties: {
      title: nullable('string', {
        description: 'Kurzer Titel der Auswahl, z. B. „Samstag in Kreuzberg“',
      }),
      items: { type: 'array', items: placeItem },
      follow_ups: {
        type: 'array',
        items: { type: 'string' },
        description: 'Bis zu drei kurze Antworten auf deine Rückfrage, z. B. „Eher mit Terrasse“',
      },
    },
  },
};

export function buildDefinition() {
  return {
    description: 'Housekeeping KI-Agent: Restaurants und Aktivitäten mit Websuche (Spec 0066)',
    metadata: { app: 'housekeeping', spec: '0066' },
    definition: {
      kind: 'prompt',
      model: MODEL,
      instructions: readFileSync(join(here, 'instructions.md'), 'utf8'),
      reasoning: { effort: 'low' },
      tools: [{ type: 'web_search', search_context_size: 'medium' }, showSuggestionsTool],
    },
  };
}
