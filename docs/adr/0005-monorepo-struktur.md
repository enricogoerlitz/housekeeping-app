---
status: angenommen
datum: 2026-11-20
autor: agent
betrifft: []
---

# ADR-0005 — Monorepo-Struktur

## Status

`angenommen`

## Kontext

Eine App (ADR-0001), Fachlogik, die getrennt testbar sein soll, ein Datenzugriffs-Layer mit Sync,
ein Design-System und Datenbank-Migrationen. Agents sollen an einer Stelle arbeiten können, ohne
den Rest zu berühren.

## Entscheidung

Ein **Monorepo mit pnpm-Workspaces und Turborepo**:

- `apps/app`: die Expo-App
- `packages/core`: Fachlogik
- `packages/api`: Datenzugriff und Sync
- `packages/ui`: Design-System
- `supabase/`: Datenbank

Gemeinsame Konfiguration (TypeScript, ESLint, Prettier) liegt im Wurzelverzeichnis.

## Betrachtete Optionen

### Option A — pnpm + Turborepo

- **Pro:** Standard für Expo-Monorepos, seit SDK 54 auch mit isolierten Abhängigkeiten.
  Turborepo cached Lint, Typecheck und Tests. Klare Paketgrenzen.
- **Contra:** etwas Konfiguration; pnpm muss installiert sein.

### Option B — Eine einzige App ohne Pakete

- **Pro:** am einfachsten.
- **Contra:** Fachlogik vermischt sich mit UI. Tests werden langsam und schwer. Agents ändern
  leichter Dinge, die sie nicht sollten.

### Option C — npm-Workspaces oder Bun

- **Pro:** kein zusätzliches Werkzeug (npm) bzw. sehr schnell (Bun).
- **Contra:** npm ohne Task-Caching. Bun bei React Native weniger erprobt.

## Begründung

Ausschlaggebend sind **klare Paketgrenzen**: `core` ohne Abhängigkeiten, schnell testbar, und
damit der Ort für die meisten Tests.

## Konsequenzen

**Positiv:** Fachlogik bleibt rein und schnell getestet. Neue Apps (z. B. ein Widget-Target oder
eine Admin-Oberfläche) können Pakete wiederverwenden.

**Negativ:** Pakete werden ohne Build-Schritt direkt als TypeScript-Quelle eingebunden. Das ist
einfach, aber jedes Paket muss mit Metro und Vitest kompatibel bleiben.

**Folgearbeiten:** `packages/api` und `packages/ui` entstehen mit ihren ersten Specs, nicht
vorab leer.

## Wann diese Entscheidung neu bewertet wird

Wenn eine zweite App mit eigenem Release-Zyklus dazukommt oder Pakete veröffentlicht werden
sollen.
