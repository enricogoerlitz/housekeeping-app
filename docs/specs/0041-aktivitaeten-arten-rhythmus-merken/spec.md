---
status: entwurf # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0041 — Aktivitäten: Arten mit Symbol, Rhythmus, „Merken“, Personen

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
A-01 bis A-04). **Welle 2.** **Kritischer Pfad:** ja: Migration, neue synchronisierte Tabellen,
Sync.

> **Entwurf vor den Entscheidungen.**

## Ziel

Jede Aktivität hat eine Art (Geburtstag, Sport, Ausflug …) mit Symbol, das ich auch einzeln ändern
kann. Geburtstage und Sport trage ich einmal mit Rhythmus ein, und sie stehen jedes Jahr bzw. jede
Woche im Kalender. Einmaliges wie „Autofahren“ bleibt im Kalender, ohne die Aktivitätenliste zu
füllen, weil die Liste standardmäßig nur gemerkte Aktivitäten zeigt. Bei einer geplanten Aktivität
trage ich ein, wer dabei ist.

## Nicht-Ziele

- Keine Erinnerungen an Geburtstage über die bestehenden Erinnerungen hinaus (Spec 0017 gilt).
- Keine Personen außerhalb des Haushalts als Konten.

## Anforderungen (Entwurf)

**REQ-001 — Arten.** Vorgegebene Arten mit Symbol: Geburtstag 🎂, Sport, Ausflug, Kultur, Essen
gehen, Treffen, Reise, Sonstiges (Vorschlag); eigene Arten lege ich im Formular schnell an.
**REQ-002 — Symbol ändern** aus einer festen Auswahl (~40 Symbole), sonst gilt das der Art.
**REQ-003 — Rhythmus.** Wöchentlich, alle N Wochen, monatlich, jährlich; ab Datum, bis Datum oder
dauerhaft; einzelne Termine absagen.

- AC-001: Angenommen „Geburtstag Nadja“, jährlich ab 14.03.2027, dauerhaft · Wenn ich März 2030 im
  Kalender öffne · Dann steht „Geburtstag Nadja“ am 14.03.2030
- AC-002: Angenommen „Bouldern“ wöchentlich dienstags · Wenn ich den Termin am 08.12. absage · Dann
  fehlt er am 08.12., die anderen Dienstage bleiben

**REQ-004 — Merken.** Schalter „Merken“ beim Anlegen, standardmäßig an; Liste öffnet mit Filter
„Gemerkt“, umschaltbar „Alle“ / „Nicht gemerkt“.

- AC-003: Angenommen „Autofahren“ nicht gemerkt · Dann fehlt es in der Liste unter „Gemerkt“, steht
  aber unter „Alle“ und im Kalender

**REQ-005 — Personen.** Bei einer geplanten Aktivität wähle ich Mitglieder aus (wie „Mitesser“ beim
Essen) und optional Gäste.

## Entscheidungen

1. Begriff: „Art“ (Glossar: „Kategorie“ ist dort als Synonym für Schlagwort verboten) — neuer
   Glossar-Eintrag **Aktivitätsart**. OFFEN, falls du „Kategorie“ willst.
2. OFFEN (REQ-003): A: Termine bis 31.12.2099 als Zeilen vorschreiben (dein Vorschlag) · B: Regel an
   einer Serie speichern, die App rechnet die Termine für den sichtbaren Zeitraum aus, Absagen als
   Ausnahmen. Empfehlung B: A erzeugt bei „wöchentlich“ ~3.800 Zeilen je Serie, die jedes Gerät
   synchronisiert, und Ändern der Uhrzeit müsste alle Zeilen anfassen. B nutzt die vorhandene
   Rhythmus-Logik der Aufgaben (plus „jährlich“).
3. OFFEN (REQ-001): Arten als synchronisierte Tabelle je Haushalt, beim Anlegen des Haushalts mit
   den Vorgaben befüllt (bestehende Haushalte per Migration) — Vorgaben lassen sich umbenennen oder
   löschen. Alternative: Vorgaben fest im Code, nur eigene in der Tabelle. Empfehlung Tabelle (ein
   Weg für alle Arten).
4. OFFEN (REQ-005): nur Mitglieder (gibt es im Planeintrag schon, `eater_ids`) oder auch freie Namen
   (neue Spalte). Empfehlung: Mitglieder + Anzahl Gäste (wie Essen), keine freien Namen.

## Daten

Neue Tabellen `activity_kinds`, `activity_series` (+ Ausnahmen), Spalten `activities.kind_id`,
`activities.icon`, `activities.remembered` (default true, bestehende = true). Alle mit RLS, Grants,
pgTAP, `updated_at`-Trigger, Lösch-Trigger, Sync-Registrierung (`db-change`).

## Risiken

| Risiko                                | Gegenmaßnahme                           | Test                               |
| ------------------------------------- | --------------------------------------- | ---------------------------------- |
| Fremder Haushalt liest Arten/Serien   | RLS                                     | pgTAP fremder Haushalt, abgemeldet |
| Sync verpasst neue Tabellen           | Trigger + Registrierung                 | Sync-Test                          |
| Serie erzeugt Termine im falschen Tag | reine Funktion in core, Zeitzone Berlin | Vitest inkl. Zeitumstellung        |

## Umsetzung

Nach den Entscheidungen.
