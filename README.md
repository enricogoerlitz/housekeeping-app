# Housekeeping

Haushalts-App für alle, die sich einen Haushalt teilen: ob Paar, Familie oder WG. Eine **PWA**
(Web-App zum Installieren auf dem Homescreen), keine nativen Apps. Sie läuft auf Handy, Tablet und Desktop und ist offline lesbar;
Schreiben geht online, nur Einkaufen im Markt und Packen funktionieren auch ohne Netz.

Funktionen: Übersicht, Kalender mit Reisen, Rezepte mit Kochmodus, Restaurants, Aktivitäten,
Einkaufsliste und Einkaufen im Markt (Laufreihenfolge), Haushaltsaufgaben, Reisetaschen mit
Packlisten, Mitteilungen in der App (Glocke mit Zähler, Spec 0051). Anmeldung nur mit Google, nur auf Einladung; die Daten
sind je Haushalt getrennt.

Betrieb: Supabase (Postgres, Auth, Storage, Edge Functions) und Azure Static Web Apps, mit einer
Vorschau- und einer Produktionsumgebung.

- **Vision und fachliche Leitplanken:** [docs/product/vision.md](docs/product/vision.md)
- **Architektur:** [docs/architecture/overview.md](docs/architecture/overview.md) ·
  [Sync-Konzept](docs/architecture/sync.md) · [Betrieb](docs/architecture/betrieb.md)
- **Entscheidungen:** [docs/adr/](docs/adr/)
- **Design:** [docs/design/DESIGN.md](docs/design/DESIGN.md)
- **Für Coding-Agents:** [AGENTS.md](AGENTS.md)

## Technik

Expo (React Native Web) mit Expo Router · eigener Lese-Cache mit Delta-Sync · Supabase ·
TypeScript · pnpm + Turborepo · Vitest, pgTAP, Playwright.

## Loslegen

Voraussetzungen: **Node 24** (`.nvmrc`), pnpm 11, Docker (für die lokale Supabase).
Optional für UI-Prüfungen im iPhone-Simulator (einmalig pro Maschine): Xcode 27, `brew trust facebook/fb && brew install idb-companion`, `pip install fb-idb`; Details in `.claude/skills/ui-verify/references/ios-simulator.md`.

```bash
pnpm install
pnpm db:reset     # lokale Supabase zurücksetzen, Migrationen und Beispieldaten laden
pnpm dev          # Expo-Dev-Server, dann w (Web)
pnpm web          # nur Web
```

## Wichtige Befehle

| Zweck                                                           | Befehl                                       |
| --------------------------------------------------------------- | -------------------------------------------- |
| Lint, Typen, Tests, Generator-Prüfung, knip                     | `pnpm check`                                 |
| Einzeln                                                         | `pnpm lint` · `pnpm typecheck` · `pnpm test` |
| Formatierung prüfen / anwenden                                  | `pnpm format:check` / `pnpm format`          |
| Statischer Web-Export nach `apps/app/dist`                      | `pnpm build:web`                             |
| Integrationstests gegen die lokale Datenbank (setzt sie zurück) | `pnpm test:integration`                      |
| End-to-End-Tests (Playwright)                                   | `pnpm e2e`                                   |
| Datenbanktypen neu erzeugen                                     | `pnpm db:types`                              |
| Supabase CLI                                                    | `pnpm exec supabase <Befehl>`                |

Alles, was die CI prüft: `pnpm format:check && pnpm check && pnpm build:web`.

## Struktur

```
apps/app/          Expo-App (Routen in src/app, Features in src/features)
packages/core/     Fachlogik ohne UI und Datenbank
packages/api/      Datenzugriff: Supabase-Client, lokaler Cache, Delta-Sync, Hooks
packages/ui/       Design-System: Tokens und Komponenten
supabase/          Migrationen, pgTAP-Tests, Edge Functions
e2e/               Playwright-Tests
infra/, .github/   Infrastruktur und Pipeline
docs/              Vision, Specs, ADRs, Architektur, Übergabe
.claude/           Regeln, Skills und Subagents für Claude Code
.agents/           Glossar
```

## Arbeitsweise

Jedes Feature hat eine kompakte Spec `docs/specs/NNNN-slug/spec.md` (Ziel, Anforderungen,
Entscheidungen, Aufgaben, Nachweis in einer Datei; Vorlage in `docs/specs/0000-template/`). Die
Specs 0001–0018 haben zusätzlich noch eine `plan.md`. Umgesetzt wird testgetrieben, mit
Coding-Agents; der Ablauf steht in [AGENTS.md](AGENTS.md).

### CI-Prüfungen

`.github/workflows/checks.yml` läuft bei jedem Pull Request nach `develop` oder `main` und nach
jedem Merge auf `develop`. Jobs: Änderungen, Konventionen, Geheimnisse, Migrationen, Prüfungen
(Format, `pnpm check`, Web-Build), Datenbank (pgTAP), Integration (API).

### Branches und Release

Arbeit läuft auf `<type>/<slug>` ab `develop`, jeder PR geht per Squash nach `develop`; nur die
Maintainer öffnen den Release-PR `develop` → `main`, Agenten pushen oder mergen nie nach `main`. Vorschau,
Release und Wiederherstellung: [docs/architecture/betrieb.md](docs/architecture/betrieb.md).

### KI-Setup

| Art                                                    | Inhalt                                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Plugins (in `.claude/settings.json` aktiviert)         | Superpowers, Expo, impeccable, UI UX Pro Max                                                                                            |
| Eingecheckte Skills (festgelegt in `skills-lock.json`) | Supabase, Emil Kowalski (Animation, Gesten, Apple-Design), Vercel (React Native, Web-Design-Guidelines), Addy Osmani (Barrierefreiheit) |
| Eigene Skills                                          | `spec`, `db-change`, `ui-verify`, `adr`, `glossary`, `security-check`, `recipe-crud`                                                    |
| Subagents (`.claude/agents/`)                          | `spec-auditor`, `security-auditor`                                                                                                      |
| Regeln (`.claude/rules/`)                              | werden je nach Dateipfad automatisch geladen                                                                                            |

Beim ersten Start von Claude Code im Repo fragt es, ob die Plugins installiert werden sollen.
Einmal pro Rechner bestätigen.

## Stand

Stand 23.11.2026: Specs 0019–0031 sind auf `develop`; offen ist die erste produktive Version
(Spec 0028). Übersicht aller Specs:
[docs/specs/README.md](docs/specs/README.md), nächste Schritte:
[docs/handover/2026-11-23-copilot.md](docs/handover/2026-11-23-copilot.md).
