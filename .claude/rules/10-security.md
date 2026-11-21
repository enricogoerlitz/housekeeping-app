---
paths:
  - 'apps/**'
  - 'packages/**'
  - 'supabase/**'
---

# Secure coding

Apply these while writing. `/security-check` verifies them against a diff. They never mean
"refuse the task".

## Keys and secrets

- The app ships only public values: the Supabase URL and the publishable (anon) key. They are
  read from `EXPO_PUBLIC_*` variables. Anything else is a secret.
- The `service_role` / secret key, database passwords, OAuth client secrets and AI service keys
  never appear in app code, in `EXPO_PUBLIC_*` variables, in logs or in commits.
- Fail loudly at startup when a required value is missing — never fall back to a hardcoded one.
- The VAPID private key and the push shared secret exist only as Supabase Function secrets and
  in the Vault (ADR-0014). Only the VAPID **public** key may be an `EXPO_PUBLIC_*` value. The
  owner sets these values himself; agents never generate, print or read them.

## Authorisation lives in the database

- Every table has Row Level Security enabled, deny by default. Policies check household
  membership; the client hiding a button is not a control.
- An id coming from the client is a claim, not a permission. Inserts and updates must check that
  `household_id` belongs to the caller, and updates must not be able to move a row to another
  household.
- `security definer` functions set `search_path = ''`, use fully qualified names, and are
  revoked from `anon` unless they are meant to be public.
- The delta sync reads through the same API, so RLS decides what reaches a device. Never add a
  sync path that bypasses RLS (e.g. a `security definer` function returning rows).

## Sessions and tokens

- Native: persist the Supabase session in secure storage (`expo-secure-store`), never in plain
  `AsyncStorage`.
- Web: the Supabase default (browser storage) is an accepted risk per ADR-0003, on condition that
  the web app loads no third-party scripts and ships a strict Content Security Policy.
- Sign-out clears the session **and** the local database on that device.

## Input and output

- Validate at the boundary with Zod: user input, deep links, URL parameters, imported recipes,
  data from external services.
- Never build SQL by string concatenation; use the query builder or parameters.
- Never render user-provided HTML. Recipe text is plain text or a small, sanitised Markdown subset.
- Fetching a user-supplied URL (recipe import) happens server-side with a scheme and size limit,
  a timeout, and no access to internal addresses.

## Data and privacy

- Collect the minimum. Ask before adding a new personal data field.
- Never log tokens, emails, or full rows of user data.
- Deleting a household or account deletes its data, including stored files.

## Dependencies

- A new dependency needs one sentence of justification in the plan or commit: what it does and
  why it beats the alternatives.
- Lock files are committed and never edited by hand.
- Be suspicious of names close to popular packages, very new packages, and install scripts.
  pnpm only runs build scripts for packages explicitly allowed.
