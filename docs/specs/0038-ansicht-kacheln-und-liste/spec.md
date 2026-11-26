---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0038 — Ansicht wählen: Kacheln oder Liste

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
E-01). **Welle 2.** **Kritischer Pfad:** nein.

## Ziel

Bei Rezepten, Restaurants und Aktivitäten wähle ich je Bereich zwischen **Kacheln** (große Bilder,
Öffnen führt auf die eigene Seite) und **Liste** (kleinere Einträge, Öffnen zeigt am Desktop die
Schnellansicht rechts, damit ich schnell durchklicke). Das Gerät merkt sich die Wahl.

## Nicht-Ziele

- Nicht für Reisetaschen, Reisen, Artikel, Märkte.
- Keine dritte Ansicht (Tabelle).

## Anforderungen

**REQ-001 — Umschalter je Bereich.** Standard wie heute: Rezepte „Kacheln“, Restaurants und
Aktivitäten „Liste“. Gespeichert lokal je Gerät. Offline: offline vollständig.

- AC-001: Angenommen Desktop, Rezepte · Wenn ich „Liste“ wähle und „Apfelkuchen“ öffne · Dann steht
  „Apfelkuchen“ rechts in der Schnellansicht, die Liste bleibt links
- AC-002: Angenommen Restaurants „Kacheln“ · Wenn ich „AMRIT“ öffne · Dann ist die eigene Seite
  „AMRIT“ offen
- AC-003: Angenommen Handy, Rezepte „Liste“ · Wenn ich „Apfelkuchen“ öffne · Dann ist die eigene
  Seite offen (keine Schnellansicht auf dem Handy)
- AC-004: Angenommen ich wähle „Liste“ bei Rezepten · Wenn ich die App neu starte · Dann ist „Liste“
  gewählt, Restaurants unverändert

- AC-005: Angenommen Desktop, Restaurants „Liste“, „AMRIT“ in der Schnellansicht · Wenn ich auf
  „Kacheln“ umschalte · Dann schließt die Schnellansicht, und die Kacheln füllen die Breite
- AC-006: Angenommen Aktivitäten „Kacheln“ · Dann zeigt jede Kachel das Foto groß (4:3) bzw. das
  Symbol der Art, wenn es kein Foto gibt

## Entscheidungen

1. Enrico, 26.11.: Der Umschalter sind zwei verbundene Symbol-Knöpfe (Raster/Liste) am rechten Ende
   der Zeile „Filter · Sortierung · Favoriten“, auf Handy und Desktop; Beschriftung für Screenreader
   „Kacheln“ / „Liste“.
2. Liste = heutiger Restaurant-Eintrag (Bild 56 px links, Name, eine Zeile Details); Kachel = heutige
   Rezept-Kachel (Bild 4:3). Rezepte bekommen eine Schnellansicht (Adress-Param `rezept`).
3. Gespeichert in `LocalSettings` je Bereich (wie die Sortierung, Spec 0036), nicht synchronisiert.

## Daten

Entfällt (lokale Einstellung).

## Umsetzung

- [ ] 1. Baustein Umschalter in `packages/ui` (Rolle, Name, Zustand getestet)
- [ ] 2. Einstellung je Bereich (AC-004)
- [ ] 3. Rezepte: Liste + Schnellansicht (AC-001, AC-003)
- [ ] 4. Restaurants und Aktivitäten: Kacheln (AC-002, AC-005, AC-006)
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün; `/ui-verify`
