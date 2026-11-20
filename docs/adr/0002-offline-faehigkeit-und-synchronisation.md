---
status: abgelöst durch ADR-0008
datum: 2026-11-20
autor: agent
betrifft: []
---

# ADR-0002 — Offline-Fähigkeit und Synchronisation

## Status

`abgelöst durch ADR-0008` — siehe [ADR-0008](0008-offline-lesen-mit-eigenem-delta-sync.md)

## Kontext

In Supermärkten gibt es oft kein Netz. Die App muss **vollständig offline** funktionieren: lesen,
schreiben, Liste erzeugen, abhaken. Zwei oder mehr Geräte desselben Haushalts ändern dieselben
Daten, auch gleichzeitig offline. Gefordert ist ein **sauberes, nachvollziehbares Sync-Konzept**.
Die Daten sind relational (Rezepte → Zutaten → Artikel → Bereiche → Märkte) und je Haushalt
getrennt (ADR-0004). Kosten sollen minimal bleiben.

## Entscheidung

Jedes Gerät hält eine **lokale SQLite-Datenbank**, synchronisiert über **PowerSync**. Quelle der
Wahrheit ist **Postgres in Supabase**, dazu kommen Auth, Storage und Edge Functions. Das Konzept
steht in [`docs/architecture/sync.md`](../architecture/sync.md).

## Betrachtete Optionen

### Option A — Supabase + PowerSync

- **Pro:** ausgereifte Sync-Engine für Postgres ↔ SQLite. Checkpoints sorgen für konsistente
  Stände, die Upload-Warteschlange schreibt offline. Offizielle Expo- und Web-SDKs, Integration
  mit Supabase und Row Level Security. Beides ist Open Source und selbst hostbar, es gibt also
  keinen Lock-in. Free-Tiers reichen für den Start.
- **Contra:** zwei Dienste statt einem. Das Free-Tier von PowerSync ist begrenzt (Pro ab 49 $/Monat,
  oder selbst hosten). Native Module erfordern Development Builds.

### Option B — Supabase + TanStack Query mit persistiertem Cache

- **Pro:** ein Dienst, einfache Architektur.
- **Contra:** Das ist ein Cache, keine Datenbank. Abfragen über nicht geladene Daten scheitern
  offline. Konflikte, Reihenfolge und Wiederaufnahme müssten wir selbst bauen. Erfüllt
  „vollständig offline“ nicht.

### Option C — Eigene Sync-Engine (Änderungsprotokoll + Pull/Push)

- **Pro:** volle Kontrolle, keine weitere Abhängigkeit.
- **Contra:** Checkpoints, Reihenfolge, Teilfehler und Schema-Entwicklung sind genau die schwierigen
  Teile. Hohes Fehlerrisiko an der kritischsten Stelle der App.

### Option D — Local-first-Datenbanken mit eigenem Backend (z. B. Jazz, InstantDB)

- **Pro:** Offline und Echtzeit sind eingebaut, wenig Code.
- **Contra:** kein relationales Postgres als Quelle der Wahrheit. Mandantentrennung und spätere
  Erweiterungen hängen am Datenmodell des Anbieters. Stärkere Bindung an ihn.

### Option E — Convex

- **Pro:** reaktiv, alles TypeScript, sehr gute KI-Ergonomie.
- **Contra:** Offline-Schreiben ist nicht der Kern des Produkts. Dokument-Datenbank statt SQL.

## Begründung

Ausschlaggebend ist **„vollständig offline“ ohne eigene Sync-Engine**. Nur Option A liefert eine
echte lokale Datenbank mit geordnetem Offline-Schreiben auf relationalem Postgres, und beide
Bausteine bleiben austauschbar bzw. selbst hostbar.

## Konsequenzen

**Positiv:** Die UI liest nur lokal: schnell, ohne Ladezustände fürs Netz. Mandantentrennung und
Validierung bleiben in Postgres.

**Negativ:**

- Jede Tabelle braucht zusätzlich eine Sync-Stream-Regel und einen Eintrag im Client-Schema. Der
  `db-change`-Skill sichert das ab.
- Last-Write-Wins je Feld ist bewusst einfach. Wo das nicht reicht, muss das Datenmodell
  ausweichen (Beiträge statt Summen, Fractional Indexing).
- Zwei Free-Tiers, die jeweils nach Inaktivität pausieren können.

**Folgearbeiten:** Die erste Daten-Spec legt `packages/api` an: Supabase-Client, PowerSync-Schema,
Upload-Connector mit Fehlerklassifizierung, Sync-Stream-Konfiguration und einen
Zwei-Geräte-Test.

## Wann diese Entscheidung neu bewertet wird

- Die PowerSync-Kosten übersteigen den Nutzen. Dann selbst hosten (Open Edition).
- Gemeinsames Live-Bearbeiten langer Texte wird gewünscht. Dann CRDTs für diese Daten prüfen.
- Das Datenvolumen pro Haushalt wird so groß, dass nicht mehr alles vorab synchronisiert werden
  kann. Dann On-Demand-Streams einsetzen.
