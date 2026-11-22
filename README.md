# Housekeeping

Haushalts-App für iPhone, iPad, Android und Web: Rezepte, Wochenplan, Einkaufslisten mit
Laufreihenfolge im Supermarkt, und später mehr. Offline lesbar und abhakbar, gemeinsam nutzbar
im Haushalt.

- **Vision und fachliche Leitplanken:** [docs/product/vision.md](docs/product/vision.md)
- **Architektur:** [docs/architecture/overview.md](docs/architecture/overview.md) ·
  [Sync-Konzept](docs/architecture/sync.md)
- **Entscheidungen:** [docs/adr/](docs/adr/)
- **Für Coding-Agents:** [AGENTS.md](AGENTS.md)

## Technik

Expo (React Native) mit Expo Router · eigener Lese-Cache mit Delta-Sync (offline lesen und
abhaken) · Supabase (Postgres, Auth, Realtime, Storage) · TypeScript · pnpm + Turborepo · Vitest, pgTAP, Playwright.

## Loslegen

Voraussetzungen: **Node 24** (`.nvmrc`; Node 25 wird von React Native 0.88 nicht unterstützt),
pnpm 11, Docker (für die lokale Supabase). Für native Builds: Xcode (iOS) bzw. Android Studio.

```bash
pnpm install
pnpm dev          # Expo-Dev-Server, dann i (iOS), a (Android) oder w (Web)
pnpm check        # Lint, Typecheck, Tests
pnpm build:web    # statischer Web-Export nach apps/app/dist
```

## Struktur

```
apps/app/          Expo-App (Routen in src/app, Features in src/features)
packages/core/     Fachlogik ohne UI und Datenbank
packages/api/      Datenzugriff und Sync          (entsteht mit der ersten Daten-Spec)
packages/ui/       Design-System                  (entsteht mit der Design-Spec)
supabase/          Migrationen, pgTAP-Tests, Konfiguration
docs/              Vision, Specs, ADRs, Architektur
.claude/           Regeln, Skills und Subagents für Claude Code
.agents/           Glossar
```

## Arbeitsweise

Jedes Feature startet als Spec in `docs/specs/NNNN-slug/spec.md` (eine Datei mit Aufgaben und Nachweis). Umgesetzt wird
testgetrieben, mit Coding-Agents. Der Ablauf steht in [AGENTS.md](AGENTS.md).

### KI-Setup

| Art                                                    | Inhalt                                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Plugins (in `.claude/settings.json` aktiviert)         | Superpowers, Expo, impeccable, UI UX Pro Max                                                                                            |
| Eingecheckte Skills (festgelegt in `skills-lock.json`) | Supabase, Emil Kowalski (Animation, Gesten, Apple-Design), Vercel (React Native, Web-Design-Guidelines), Addy Osmani (Barrierefreiheit) |
| Eigene Skills                                          | `spec`, `db-change`, `ui-verify`, `adr`, `glossary`, `security-check`                                                                   |

Beim ersten Start von Claude Code im Repo fragt es, ob die Plugins installiert werden sollen.
Einmal pro Rechner bestätigen.
