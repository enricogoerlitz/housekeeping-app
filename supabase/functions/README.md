# Edge Functions

Server side of the AI features, the map-link resolver (spec 0003, ADR-0009), photo and video handling
and the nightly media sweep. Deno in the Supabase Edge Runtime; unit-tested with vitest
under Node.

| Function            | Input (contract)           | Quota     | Calls                                                |
| ------------------- | -------------------------- | --------- | ---------------------------------------------------- |
| `ai-assistant`      | `AssistantRequestSchema`   | `request` | Foundry LLM (structured output)                      |
| `ai-search`         | `AiSearchRequestSchema`    | `request` | Foundry LLM (structured output)                      |
| `speech-token`      | empty body                 | `speech`  | Azure STS `issueToken` (short token)                 |
| `resolve-maps-link` | `ResolveMapsLinkRequest…`  | none      | Google short links only, manual hops                 |
| `fetch-image`       | `FetchImageRequestSchema`  | none      | any public https address (SSRF-safe)                 |
| `ai-recipe-draft`   | `RecipeDraftRequestSchema` | none      | recipe pages, TikTok, Foundry LLM                    |
| `ai-image`          | `AiImageRequestSchema`     | none      | Foundry LLM (1 call), FLUX.2-pro (3 in parallel)     |
| `fetch-video`       | `FetchVideoRequestSchema`  | none      | TikTok and its CDNs only, then Storage as the caller |
| `web-search`        | `WebSearchRequestSchema`   | none      | Serper.dev, else Brave; recipe pages; Foundry LLM    |
| `media-sweep`       | `{ names, videos? }`       | none      | Storage API (deletes orphan photos and videos)       |
| `ai-agent`          | `AgentRequestSchema`       | 5 / turn  | Foundry places agent (SSE), Serper maps              |

Every function: CORS allowlist → POST only → JWT verified with `auth.getClaims()` and
`role = authenticated` (the anon key gets 401) → body ≤ 64 KB (6 MB for `ai-recipe-draft` and
`ai-image`; more is 413 `payload_too_large`) and zod contract → quota via
`consume_ai_quota` with the caller's own client → work. Errors are `{ "error": code }`
(`ErrorReplySchema` in `packages/core/src/ai-contract.ts`). No service-role key is used (except by `media-sweep`, below);
all database reads run under the caller's RLS.

**`fetch-image`** (spec 0039, ADR-0016): the common path above, then membership of
`householdId` under the caller's RLS (else 403 `forbidden`), then `_shared/fetch-public.ts`:
https on port 443 only, no credentials, no single-label host; DNS (A and AAAA) resolved before the
first request and every redirect, refused if any address is not public (private, loopback,
link-local, CGNAT, multicast, reserved, IPv6 outside 2000::/3, IPv4-mapped, NAT64, 6to4, Teredo);
at most 3 redirects, 10 s for everything, 15 MB read with a byte limit, `image/*` and an image
signature (JPEG, PNG, GIF, WebP, AVIF; never SVG). Every failure is 422 `not_an_image`. Answer:
the bytes as `application/octet-stream` (`Cache-Control: no-store`). Rest risk: DNS rebinding
between our lookup and fetch's own (ADR-0016). Spec 0040 reuses `fetchPublic` for recipe pages.

**`ai-recipe-draft`** (spec 0040, "Mit KI ausfüllen"): the common path with a 6 MB body (up to 4
photos, shrunk by the app to 1280 px, as JPEG data URLs; nothing goes to the bucket), no quota
(Entscheidung 2), membership of `householdId` (403). Up to 3 links in parallel, each through
`fetchPublic` (html/xhtml/plain, 2 MB, 10 s, 3 redirects) and `_shared/page-text.ts` (JSON-LD
first, then visible text, 20 000 characters). A TikTok link (`_shared/tiktok.ts`) stays on TikTok
and its CDNs (`allowHost`, 5 redirects): the page JSON `__UNIVERSAL_DATA_FOR_REHYDRATION__` gives
`desc`, the cover and the subtitles (German, else English WebVTT, 64 KB, 5 s); no video is loaded.
A link that cannot be read is `read: false` and the draft comes from the rest; a TikTok link keeps
the address it resolved to. Context under the caller's RLS (select only): article names and
synonyms (up to 1000), cuisines and tags in use. Everything but the person's own sentence goes to
the model as JSON data (`inhalt_nur_daten`, `haushalt_nur_daten`), photos as `input_image`; the
answer must fit the strict `RecipeDraftSchema` — recipe fields only, no command. 60 s and one more
try on 429/5xx (Entscheidung 4), else 503 `ai_unavailable`. Answer `{ draft, sources }`; nothing
is written.

**`ai-image`** (spec 0040, tab "KI" of the photo window; spec 0052): 6 MB body ("Aus diesem
Foto" sends the photo, at most 1024 px), no quota, membership (403). Request: `prompt` (the wish,
≤ 1000), `styles?`, `image?`, `extra?` ("Was soll anders sein?", ≤ 300) and `context?` —
`{ kind: 'recipe' | 'collection' | 'restaurant' | 'activity', title, ingredients? (≤ 8),
description?, category? (cuisine or kind of activity), place? }`. **One** Foundry LLM call
(`ai-image/prompts.ts`: wish and context as JSON data, strict output `{ scene, shots: [3] }`,
`reasoning.effort = none`, 600 output tokens, one attempt, 6 s) gives three English prompts
(scene + shot), each ending with "No text, letters, logos or watermarks."; the photo itself does
not go to the LLM. Any failure of that step falls back to the direct prompt of spec 0040 (neutral
photographic style, no text or people, the style chips as phrases, the extra behind the wish; with
a photo the edit wording "same subject, remove text and overlays"). Then three `_shared/flux.ts`
calls in parallel (FLUX.2-pro over the BFL path of the Foundry resource, 1024 px JPEG, 45 s and one
more try on 429/5xx each). Once one variant is ready, the answer goes out 30 s after the request at
the latest (AC-012, the LLM step included); a variant still running then counts as failed and
keeps running until its own 45 s (cost accepted, spec "Risiken"). Answer
`{ images: [base64, …], failed }`; no variant at all is 503. Variants are never stored: only
"Übernehmen" in the app uploads one through the normal photo path.

**`web-search`** (spec 0049, "Websuche"): the common path (64 KB), no quota, membership of
`householdId` (403) before any provider is asked. `mode: 'search'`: a text of more than 4 words or
with "Bild/Foto" first goes to the Foundry LLM as data (`text_nur_daten`, strict
`SearchIntentSchema`: `query` and an optional `imageWish`; 12 s, one try; failing it the text is
searched as typed). `_shared/web-search.ts` asks Serper.dev (`/search`, places from `/maps` with
`ll` at zoom 11, key `SERPER_API_KEY` in `X-API-KEY`) and, when Serper fails, is out of credits or
answers in an unknown shape, the Brave Search API (`BRAVE_SEARCH_API_KEY` in
`X-Subscription-Token`); 8 s each, one try; both failing is 503 `search_unavailable`. Recipe hits
that can be single recipes (`web-results.gen.ts`) are loaded through `fetchPublic` (html, 3 MB,
6 s, 3 redirects, at most 6) and only pages with a schema.org Recipe become cards
(`_shared/page-meta.ts`); well rated chefkoch.de first. Places become cards with rating, address,
category, hours, price, maps link (`?cid=`) and thumbnail. `mode: 'place'`: the card (sent back by
the app, checked by the contract) and the website's text (`fetchPublic`, 6000 characters) go to the
LLM as data with the household's cuisines and tags or activity kinds (select under RLS); the
answer is `PlaceProposalSchema` (name, cuisine/tags or kind/description), a kind only if the
household has it. Logs carry provider and status, never a key, a query or an address. The recipe
preview is `ai-recipe-draft` with the card's link.

**`fetch-video`** (spec 0043, spec 0046, "Video speichern"): the common path, membership of
`householdId` (403), the recipe under the caller's RLS (a collection or a recipe she cannot see is
403), the `url` must be an https TikTok link the recipe has (else 422 `not_a_tiktok_link`, before
anything is fetched) and the recipe must not have that link's video or ten videos already (409
`video_exists`). `_shared/tiktok.ts`
reads the page like `ai-recipe-draft` (TikTok and its CDNs only, 5 redirects, 2 MB, 10 s) and
loads `playAddr` through `fetchPublic` with the cookies that page set and `Referer:
https://www.tiktok.com/` (TikTok's video hosts answer 403 without either): `video/mp4`, at most
50 MiB (by the page's `size`, the header or while reading: 422 `video_too_large`), 60 s, 3
redirects, an `ftyp` box; anything else is 422 `video_unavailable`. The file goes into the
private bucket `household-videos` as `<household>/recipes/<recipe>/<uuid>.mp4` with the
**caller's** key (the storage policies decide; a 413 of the bucket is `video_too_large`), then
`add_recipe_video` appends `{ path, url }` to the recipe's `videos`, also as the caller; when that
is refused the file is removed again (`false`, the same link saved meanwhile: 409
`video_exists`). Answer `{ videoPath, coverUrl? }`: the cover's https address on TikTok's hosts,
which the app loads through `fetch-image` as the video's poster. No server key, no quota. Nothing
about the link or the video is logged.

**`ai-agent`** (spec 0066, ADR-0018, "KI-Agent"; since spec 0067 the one household agent, ADR-0020):
the common path (a body up to 8 MB for photos and PDF files, `AgentRequestSchema` from
core `ai-agent.ts`, copied by `pnpm gen:edge`), membership of `householdId` (403), then one of four
actions. `send`: the chat row under the caller's RLS **and** the conversation's metadata
(`household_id`) must name the household (403; the Foundry key can read every conversation of the
project), at most 20 answers per chat (409 `chat_too_long`), quota 5 units per answer, open
`function_call`s of an interrupted answer closed first, a new chat gets a conversation with that
metadata and its row (`create_ai_chat`). Then the pinned agent (`FOUNDRY_HOUSEHOLD_AGENT`,
`FOUNDRY_HOUSEHOLD_AGENT_VERSION`) answers in `FOUNDRY_PROJECT_ENDPOINT` with `stream: true`; the
message carries a `[KONTEXT]` block (place, coordinates rounded to 3 decimals, radius, local time,
the household's day in `households.timezone`, the badges as hints), because a request may not
override an agent's instructions; photos go as `input_image` (JPEG), PDF files as `input_file`. The function answers
`text/event-stream` with its own events (`AgentStreamEvent`: chat, step, text without citation
tokens, cards_pending, cards, sources, done, error) — never Foundry's objects, which carry the
instructions. Every `show_suggestions` call is validated (zod), its cards enriched by one Serper
maps search each (stars, `cid` link, photo, coordinates; nothing from the agent), and closed with a
`function_call_output` holding that enrichment (else the next message is refused with 400). Each
answer id is recorded (`record_ai_chat_turn`). The person's "Anhalten" closes the request and
aborts the run; 120 s at most. `load`: the conversation's items (5 pages of 100), turned into
messages by core `messagesFromItems` (without the context block). `delete`: each recorded answer
that belongs to this conversation, the conversation, then `delete_ai_chat`; a Foundry failure
keeps the row (503). `purge`: every chat of the household, before "Haushalt endgültig löschen".
Logs carry a step and a status, never a message, a place or a body. **Household tools** (spec 0067,
`ai-agent/tools.ts`): every other function call is checked by core `agent-tools.ts` (allow-listed
fields, sorts and filters; values only compared in code, never put into a query), then read as the
caller (her JWT, RLS) from fixed tables and columns, always `household_id` = the chat's household —
never an id from the model — in pages of 1000; the outputs (with `total`) go to the next model run,
at most 5 runs per answer, and every call is a step row of the stream. The agent itself: `foundry/agents/household-agent.yaml`, deployed per
environment by `@housekeeping/foundry` (ADR-0019, `docs/architecture/betrieb.md`); the pipeline sets
`FOUNDRY_HOUSEHOLD_AGENT` and the pinned `FOUNDRY_HOUSEHOLD_AGENT_VERSION`, locally an empty version means
the latest.

**Exception `media-sweep`** (spec 0039, REQ-005): called nightly by pg_net from
`private.run_media_orphan_sweep()` (job `media-orphan-sweep`, 02:30 UTC), signed with an HMAC
(`x-sweep-timestamp`, `x-sweep-signature`, secret `MEDIA_SWEEP_SECRET`; `_shared/signature.ts`).
No JWT, no CORS: POST only (405) → fresh timestamp and valid HMAC (401) → body ≤ 128 KB (413) →
zod: up to 500 names, each `<household>/<activities|recipes|restaurants>/<id>/<uuid>.jpg`, and up
to 500 `videos` (spec 0043), each `<household>/recipes/<id>/<uuid>.mp4`, at least one in all
(400) → `storage.from('household-media').remove()`, then `storage.from('household-videos')`, in
chunks of 100. Answer `{ removed }`, or 502
`storage_failed` with what was removed before. The **only** function that reads the server key
(`SUPABASE_SECRET_KEYS`, else `SUPABASE_SERVICE_ROLE_KEY`): only it may delete across households,
and a direct delete in `storage.objects` would leave the file in the storage backend. Names are
never logged.

## Layout

- `<name>/index.ts` — `Deno.serve` entry, wires `liveDeps()` into the handler.
- `<name>/handler.ts` — logic with injected deps (`fetch`, `env`, `createUserClient`, `now`).
- `_shared/` — auth, CORS, errors, quota, Foundry client with retries, strict JSON schema helper,
  database reads (`context.ts`), map-link parsing (`maps-link.gen.ts`, generated from core `maps-link.ts` by `pnpm gen:edge`).
- `_shared/contract.gen.ts`, `_shared/image-source.gen.ts` — generated by `pnpm gen:edge`; never
  edit by hand.
- `_shared/fetch-public.ts` — loading a user-supplied public address (SSRF guard, ADR-0016).
- `_shared/page-text.ts`, `_shared/tiktok.ts` — a recipe page and a TikTok link as text (spec 0040).
- `_shared/flux.ts` — the image model client (FLUX.2-pro, BFL path); `_shared/membership.ts` — the
  household membership check of `fetch-image`, `ai-recipe-draft` and `ai-image`.
- `_shared/signature.ts` — the HMAC check of requests the database sends through pg_net.
- `deno.json` — import map for Deno (`zod`, `@supabase/supabase-js`, same pins as `package.json`).
  Source files use relative `.ts` imports and these two bare specifiers only.

## Commands

```sh
pnpm --filter @housekeeping/edge test        # vitest, no network
pnpm --filter @housekeeping/edge typecheck
pnpm gen:edge                                # after changing core ai-contract.ts or maps-link.ts
node scripts/edge-smoke.mjs                  # against a running local stack, see below
```

## Environment

Read by the functions (names only; values live in `.env`, never in the app):

- `FOUNDRY_API_KEY`, `FOUNDRY_OPENAI_BASE_URL`, `FOUNDRY_LLM_DEPLOYMENT` — LLM (also the prompt
  step of `ai-image`).
- `FOUNDRY_IMAGE_DEPLOYMENT` — the FLUX.2-pro deployment (`ai-image`); the resource is the first
  label of `FOUNDRY_OPENAI_BASE_URL`'s host, the key `FOUNDRY_API_KEY`.
- `FOUNDRY_SPEECH_REGION`, `FOUNDRY_STT_LANGUAGE`, `FOUNDRY_STT_MODEL` (optional) — speech token.
- `FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_HOUSEHOLD_AGENT`, `FOUNDRY_HOUSEHOLD_AGENT_VERSION` — the KI-Agent
  (`ai-agent`, spec 0066); with `FOUNDRY_API_KEY` and, for the cards, `SERPER_API_KEY`.
- `ALLOWED_ORIGINS` — comma-separated browser origins, e.g. `http://localhost:8081`.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS` (or legacy `SUPABASE_ANON_KEY`) — set by Supabase.
- `media-sweep` reads only `MEDIA_SWEEP_SECRET`, `SUPABASE_URL` and the server key
  (`SUPABASE_SECRET_KEYS`, else `SUPABASE_SERVICE_ROLE_KEY`, both injected by Supabase). The
  owner creates the secret and sets it as a function secret and in the Vault
  (`media_sweep_secret`, plus `media_sweep_url`); without the Vault entries the job only warns.

A missing variable fails the request with `500 internal` and logs the variable name.

## Running locally

The local stack serves the functions itself; there is no separate `functions serve` process.

```sh
set -a; . ./.env; set +a          # loads the values into this shell only; never print them
pnpm exec supabase start          # or: supabase stop, then start, after changing config.toml
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:54321/functions/v1/speech-token
# → 401 (no JWT): the function is up
```

Functions: `http://127.0.0.1:54321/functions/v1/<name>`. Code changes hot-reload
(`edge_runtime.policy = "per_worker"`); changes to `config.toml` or `.env` need a restart.

### Secrets

`supabase/config.toml` → `[edge_runtime.secrets]` hands the functions only the named variables:
`FOUNDRY_*` as `env(...)`, resolved from the shell when the stack starts (hence the `set -a`
line), and `ALLOWED_ORIGINS` as a plain, non-secret list
(`http://localhost:8081,http://127.0.0.1:8081,http://127.0.0.1:8790`). Verified: the edge
container receives the five set `FOUNDRY_*` values; an empty variable (`FOUNDRY_STT_MODEL`) is
left out, which the code treats as "no model". Other `.env` entries (`GOOGLE_CLIENT_SECRET`, …)
do not reach the functions. Always start the stack from a shell with `.env` loaded; a missing
value makes the function answer `500 internal` and log the variable name.

`SUPABASE_URL` (`http://kong:8000` inside Docker) and `SUPABASE_ANON_KEY` (the legacy anon JWT)
are injected by the CLI; `_shared/live.ts` uses `SUPABASE_PUBLISHABLE_KEYS` when present, else
`SUPABASE_ANON_KEY`. The runtime also injects `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL`;
only `media-sweep` reads the service-role (or secret) key, nothing reads the database URL.

`[functions.<name>]` sets `verify_jwt = false` (each function verifies the JWT itself and answers
the anon key with 401; the gateway check would let the anon key through anyway) and
`import_map = "./functions/deno.json"`. The `package.json` next to it (vitest under Node) does
not disturb Deno: all four functions boot and resolve `zod` and `@supabase/supabase-js` from the
import map.

Locally, Kong's `cors` plugin answers every preflight itself with `Access-Control-Allow-Origin: *`
and sets that header on responses too. The functions still refuse requests from an origin not in
`ALLOWED_ORIGINS` with 403; their own preflight answer is covered by the unit tests only. On the
hosted platform the functions answer preflights themselves.

## Smoke test

`scripts/edge-smoke.mjs` runs against the local stack. It creates a test account and household
with `scripts/edge-smoke-fixture.sql` (psql as `postgres` via `docker exec` into
`supabase_db_housekeeping-app`), signs in with password, calls every function and removes the
fixture again (also on failure). It reads the API URL and anon key from `supabase status`.

```sh
set -a; . ./.env; set +a; node scripts/edge-smoke.mjs
```

Checks: anon key and missing JWT → 401 for all functions; preflight and POST from
`http://localhost:8081` pass, POST from a foreign origin → 403; `speech-token` → 200 with a
contract reply and without the API key in it; `resolve-maps-link` with a long Google URL → 200,
with `https://evil.example/` → 422; `ai-search` and `ai-assistant` → 200 with replies that pass
the contract schemas (`packages/core/src/ai-contract.ts`); a household the caller cannot see →
400; daily request quota used up (`ai_usage.requests = 200`) → 429 before any Foundry call.

Cost per run: two Foundry LLM calls and one Azure speech token. Output: status codes, reply keys
and timings only — never tokens or keys.

## Deploying (later, operations spec)

- `import_map` in `config.toml` is the legacy way. Supabase recommends one `deno.json` per
  function (`supabase/functions/<name>/deno.json`); before the first deploy, copy the shared
  import map into each function folder (or check that `supabase functions deploy` bundles
  `_shared/` with the shared map) and drop `import_map` from `config.toml`.
- Set the `FOUNDRY_*` values and `ALLOWED_ORIGINS` (the production web origin) with
  `supabase secrets set`; never commit them.
- Deploy with `--no-verify-jwt` or keep `verify_jwt = false` in `config.toml`, as locally.
