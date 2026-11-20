# Architektur-Überblick

## System

```mermaid
flowchart LR
  subgraph Geraete[Geräte]
    iOS[iPhone / iPad]
    And[Android]
    Web[Browser]
  end
  CF[Cloudflare<br/>statisches Hosting] -. liefert Web-App .-> Web
  subgraph SB[Supabase · Region Frankfurt]
    Auth[Auth<br/>Google · Apple<br/>nur auf Einladung]
    PG[(Postgres + RLS)]
    ST[Storage<br/>Fotos]
    EF[Edge Functions<br/>z. B. Einladungen, Import]
  end
  PS[PowerSync<br/>Sync Service]
  iOS & And & Web -- Anmeldung --> Auth
  iOS & And & Web <-- "Sync (offline-first)" --> PS
  iOS & And & Web -- Uploads --> PG
  PG -- Replikation --> PS
  iOS & And & Web --> ST
  iOS & And & Web --> EF
```

| Baustein                             | Technik                                           | Entscheidung                                                                               |
| ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| App für iOS, iPadOS, Android und Web | Expo (React Native) mit Expo Router               | [ADR-0001](../adr/0001-plattform-und-app-technologie.md)                                   |
| Lokale Daten und Sync                | PowerSync (SQLite auf dem Gerät)                  | [ADR-0002](../adr/0002-offline-faehigkeit-und-synchronisation.md), [Sync-Konzept](sync.md) |
| Backend                              | Supabase: Postgres, Auth, Storage, Edge Functions | [ADR-0002](../adr/0002-offline-faehigkeit-und-synchronisation.md)                          |
| Anmeldung                            | Google und Apple über Supabase Auth, Allowlist    | [ADR-0003](../adr/0003-anmeldung-und-zugang.md)                                            |
| Mandanten                            | Haushalte, durchgesetzt per Row Level Security    | [ADR-0004](../adr/0004-mandantenfaehigkeit-ueber-haushalte.md)                             |
| Repository                           | pnpm-Workspaces + Turborepo                       | [ADR-0005](../adr/0005-monorepo-struktur.md)                                               |
| Arbeitsweise mit KI                  | Specs, Superpowers, kuratierte Skills             | [ADR-0006](../adr/0006-ki-gestuetzte-arbeitsweise.md)                                      |
| Hosting und Kosten                   | Free-Tiers, klarer Skalierungspfad                | [ADR-0007](../adr/0007-hosting-und-kosten.md)                                              |

## Pakete

```mermaid
flowchart TD
  app[apps/app<br/>Screens, Navigation, Features] --> api[packages/api<br/>Supabase + PowerSync, lokales Schema, Hooks]
  app --> ui[packages/ui<br/>Design-System]
  app --> core[packages/core<br/>Fachlogik]
  api --> core
```

- **`packages/core`**: reine Fachlogik ohne React, Datenbank oder Plattform-APIs, z. B.
  Einkaufsposten zusammenführen, Mengen umrechnen, nach Laufweg sortieren, Portionen skalieren.
  Hier liegen die meisten Tests.
- **`packages/api`**: entsteht mit der ersten Daten-Spec. Enthält den Supabase- und
  PowerSync-Client, das lokale Schema, den Upload-Connector und die Daten-Hooks.
- **`packages/ui`**: entsteht mit der Design-Spec. Enthält Tokens und Komponenten.
- **`apps/app`**: setzt alles zusammen. Routen in `src/app/`, Features in `src/features/<feature>/`.
