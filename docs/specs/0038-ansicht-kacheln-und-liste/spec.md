---
status: entwurf # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0038 — Ansicht wählen: Kacheln oder Liste

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
E-01). **Welle 2.** **Kritischer Pfad:** nein.

> **Entwurf vor den Entscheidungen.**

## Ziel

Bei Rezepten, Restaurants und Aktivitäten wähle ich je Bereich zwischen **Kacheln** (große Bilder,
Öffnen führt auf die eigene Seite) und **Liste** (kleinere Einträge, Öffnen zeigt am Desktop die
Schnellansicht rechts, damit ich schnell durchklicke). Das Gerät merkt sich die Wahl.

## Nicht-Ziele

- Nicht für Reisetaschen, Reisen, Artikel, Märkte.
- Keine dritte Ansicht (Tabelle).

## Anforderungen (Entwurf)

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

## Entscheidungen

1. OFFEN: Ort des Umschalters — A: zwei verbundene Symbol-Knöpfe (Raster/Liste) am rechten Ende der
   Zeile „Filter · Sortierung · Favoriten“ · B: oben rechts neben „Neu“. Empfehlung A: gehört zur
   Liste, nicht zur Seite; auf dem Handy passt er in die Zeile, ohne den Kopf zu füllen.
2. Liste = heutiger Restaurant-Eintrag (Bild 56 px links, Name, eine Zeile Details); Kachel = heutige
   Rezept-Kachel (Bild 4:3). Rezepte bekommen dafür eine Schnellansicht (Adress-Param `rezept`).

## Daten

Entfällt (lokale Einstellung).

## Umsetzung

Nach den Entscheidungen.
