---
name: recipe-crud
description: Draft recipes together with the user and create or change them in a household of the app's database (production or local) — ingredients from the household's own articles, variants, steps and a generated food photo — through the app's own write path, after checking that the app's recipe logic has not changed. Also fetches recipes the household entered quickly in the app (often only a name) and works them out. Use whenever the user wants recipes "in die App", "in die Datenbank", "anlegen", "eintragen", "importieren", "ausarbeiten", "überarbeiten", "hol neue/unbearbeitete Rezepte", wants to brainstorm a dish and keep it, or mentions docs/recipes — even when they do not say "skill" or "Datenbank".
---

# Recipe CRUD

Work on the household's recipes for the user: draft them in the chat, keep each one as a Markdown
file under `docs/recipes/`, and write them into the app's database only after the user agreed.

The app keeps evolving. This skill therefore describes what recipes **mean in the app**, not how
the tables look; the tool derives the rows from the app's current code. Before every write you
check that nothing relevant changed (step 1), because a silent mismatch would put data into the
household that the app later shows wrongly or refuses to edit.

**This skill creates and changes, it never deletes** — not recipes, not articles, not the links of
a Sammlung. Deleting is the household's job in the app. When something should go, tell the user
what and why.

## What a recipe is in the app

- **Rezept or Sammlung.** A Sammlung bundles recipes (e.g. a party) and may have its own
  ingredients; it has no course, time, variants or steps. The kind never changes after creation:
  turning one into the other creates a new recipe, the old one stays until the user deletes it.
  Say so before, and say what hangs on the old one (favourites, ratings, plan entries).
- **Kopfdaten:** title, short description, Gang (Frühstück, Hauptgericht, Beilage, Dessert, Snack,
  Getränk), Küche (free text, used as filter), Portionen, Gesamtzeit, Vorlauf ("Teig über Nacht",
  hours before), tags, links (e.g. the TikTok source), notes, one photo.
- **Varianten:** a recipe may have variants (e.g. "Vegetarisch" / "Mit Hähnchen"), exactly one is
  the standard. Ingredients and steps belong to all variants or to one. The household plans and
  shops per variant. Household preference: every main dish has a vegetarian variant.
- **Zutaten are articles.** Each ingredient points at an article of the household's Artikelkatalog
  (name, synonyms, Ernährung, Bereich im Markt, Vorrat, Standard-Einkaufsregel). The Ernährung of
  a variant (vegan, vegetarisch, Fisch, Fleisch) is derived from its articles. **Use the articles
  the household has**; a detail goes into the Hinweis ("Paprika" + "rot", "Kartoffeln" +
  "festkochend"). Create a new article only when nothing existing fits for shopping; it appears as
  "Neu aus Rezepten" for the household to review and needs a sensible Ernährung (step 4).
- **Per ingredient:** amount as text ("2–3 EL", "½ Bund"; parsed and scaled by portions), group
  ("Teig", "Sauce"), Hinweis for cooking, and the Einkaufsregel: buy the recipe amount, put it on
  the list once, or never (water).
- **Rezept in Rezept:** a base recipe (e.g. Pizzateig) is copied into another recipe as an
  ingredient group named after it — copied, not linked.
- **Schritte:** numbered, optionally for one variant, optionally with a cooking timer of 1–600
  minutes (longer waiting is Vorlauf).
- **What belongs to the household, not to you:** favourites, ratings, "gekocht" counts and dates,
  plan entries. Never change them.

## Where things are

| What | Where |
| --- | --- |
| File format | `docs/recipes/README.md` |
| The household's recipes / the catalog / new drafts | `docs/recipes/bestand/`, `katalog/<küche>/`, `eigene/` |
| Pictures (git-ignored, they live in Storage after a write) | `docs/recipes/pictures/` |
| What was worked on, per project and household (id → file, time of our last write) | `docs/recipes/db.json` |
| Overview with the open points | `docs/recipes/UEBERSICHT.md` (`node .claude/skills/recipe-crud/scripts/overview.mjs`) |
| Plans, backups, pending list, article hints | `tmp/recipe-crud/` |

The tool is `pnpm exec tsx .claude/skills/recipe-crud/scripts/recipes.ts <command>`, called
`recipes.ts` below. Production is `housekeeping-app-prod` in `pnpm exec supabase projects list`;
pass its ref as `--target`. Never `supabase link` to production. The household is given by name
(the user's is "Teddy & Nadja"); if unclear, ask.

## Step 1 — Check that the app still works this way

Before planning a write, look at what changed since this skill was last updated:

```bash
git log --oneline "$(git log -1 --format=%cs -- .claude/skills/recipe-crud)..HEAD" -- \
  packages/core/src/types.ts packages/core/src/recipes.ts packages/core/src/recipe-variants.ts \
  packages/core/src/recipe-editor.ts packages/core/src/article-catalog.ts packages/core/src/amounts.ts \
  packages/api/src/db/ packages/api/src/commands-recipes.ts packages/api/src/commands-articles.ts \
  packages/api/src/commands-collections.ts supabase/migrations docs/specs
```

Read the relevant diffs (not whole files). Is there a new recipe field, a changed rule (variants,
articles, collections, shopping rules), a new constraint, or a recipe feature the list above does
not mention? If yes, update the list above, `docs/recipes/README.md` and `scripts/recipes.ts`
first, test against the local database (step 5), tell the user what changed — then continue. If
nothing relevant changed, say so in one line.

## Step 2 — What to work on

- **"Hol neue / unbearbeitete Rezepte":** `recipes.ts pending --household "<Name>" --target <ref>`
  lists recipes not in `db.json` (entered in the app, e.g. on the way, often just a name) and
  recipes changed in the app since our last write. It writes them with ingredient names to
  `tmp/recipe-crud/pending.json` and their photos to `tmp/recipe-crud/photos/`. Work each out into
  `docs/recipes/bestand/<name>.md` with its `bestand_id`, keeping everything the household entered;
  a changed one updates its existing file (`datei`) with the household's changes.
- **A specific recipe:** find its file (`db.json`, `UEBERSICHT.md`) and change it.
- **A new idea in the chat:** talk about the dish first (what, for whom, variants, sides), then
  write `docs/recipes/eigene/<name>.md`.

## Step 3 — Write the draft

Before writing ingredients, look at what the household has:
`recipes.ts articles --household "<Name>" --target <ref>` (name, synonyms, Ernährung, Bereich).
Use those names. Then write the file in the format of `docs/recipes/README.md`, with
`bild_prompt` (English, the dish only). If there is a usable photo of the household's, set
`bild_referenz` to it so the picture improves their photo instead of inventing one. Show the user
a compact summary (title, variants, key ingredients, time) and let them correct it.

```bash
pnpm exec tsx .claude/skills/recipe-crud/scripts/recipes.ts check docs/recipes/bestand/<name>.md
```

## Step 4 — Picture and plan (reads only)

The image model is the Foundry deployment in `FOUNDRY_IMAGE_DEPLOYMENT` (FLUX.2-pro): about
3–5 US cents per picture. Look at the result before using it; if Azure's filter refuses a prompt
(`content_safety_violation`), rephrase it (e.g. "jasmine rice" → "white rice", "chicken" →
"poultry"). Load `.env` only this way, never print or read it.

```bash
set -a; . ./.env; set +a; node .claude/skills/recipe-crud/scripts/images.mjs --only <name>
pnpm exec tsx .claude/skills/recipe-crud/scripts/recipes.ts plan \
  --household "<Name>" --target <ref> --hints tmp/recipe-crud/hints.json <files…>
```

The plan matches ingredient names to articles (name, synonym, or spelled alike: "Zwiebeln" →
"Zwiebel") and reports new and changed recipes, new articles, pictures to upload, kind changes and
links of a Sammlung the file no longer has. It runs every recipe through the app's editor rules.
For new articles without Ernährung it writes `tmp/recipe-crud/unknown-articles.json`: first check
whether an existing article fits after all (change the file), otherwise add them to the hints file
`{ "<Artikel>": { "diet": "vegetarian", "area": "Obst & Gemüse", "isPantry": true } }` (area = an
area name of the household) and plan again. A file without `bestand_id` whose title already exists
stops the plan: decide with the user (same recipe → `--by-title`, different one → rename).

Show the user the plan summary and get an explicit yes for writing to production. A yes for an
earlier batch does not cover a new one.

## Step 5 — Write and verify

```bash
pnpm exec tsx .claude/skills/recipe-crud/scripts/recipes.ts apply tmp/recipe-crud/plan-<…>.json
pnpm exec tsx .claude/skills/recipe-crud/scripts/recipes.ts verify --household "<Name>" --target <ref>
```

`apply` uploads the pictures, then sends the changes through the app's RPC `apply_changes` as a
member of the household (role authenticated: Row Level Security and every server check apply), in
blocks that each succeed or fail as a whole, and refuses any plan that would delete. New recipes
get their id written into the file as `bestand_id`; every written recipe is recorded in `db.json`;
the rows it changed are saved next to the plan (`*.backup.json`). Running the same plan again
changes nothing. `verify` reads the household the way the app does after a sync and checks every
reference. Then refresh `UEBERSICHT.md` (overview script) and run `pnpm exec prettier --write docs/recipes` (CI checks the format of these files too).

Try anything new in the tool against the local database first (`--target local`, household e.g.
"Enrico & Nadja"; production ids in the files are matched by title there with `--by-title`). The
local stack must run (`pnpm exec supabase status`).

Report what was written; the household sees it after their next sync. Name the new articles
("Neu aus Rezepten") and anything the household should delete or check in the app.

## If something fails

The server's error names the rule (e.g. `invalid_change`, a constraint name). Do not work around
it with direct SQL: the rule exists because the app relies on it. Find the rule in
`supabase/migrations` or in core's `recipe-editor.ts`, fix the file or the tool, plan again. A
block that failed wrote nothing; earlier blocks stay written, and a new plan picks up from there.
