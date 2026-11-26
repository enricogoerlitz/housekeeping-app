---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0041 — Aktivitäten: Arten mit Symbol, Rhythmus, „Merken“, Personen

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
A-01 bis A-04). **Welle 2.** **Kritischer Pfad:** ja: Migration, neue synchronisierte Tabellen,
Sync.

## Ziel

Jede Aktivität hat eine Art (Geburtstag, Sport, Ausflug …) mit Symbol, das ich auch einzeln ändern
kann. Geburtstage und Sport trage ich einmal mit Rhythmus ein, und sie stehen jedes Jahr bzw. jede
Woche im Kalender. Einmaliges wie „Autofahren“ bleibt im Kalender, ohne die Aktivitätenliste zu
füllen, weil die Liste standardmäßig nur gemerkte Aktivitäten zeigt. Bei einer geplanten Aktivität
trage ich ein, wer dabei ist.

## Nicht-Ziele

- Keine Erinnerungen an Geburtstage über die bestehenden Erinnerungen hinaus (Spec 0017 gilt).
- Keine Personen außerhalb des Haushalts als Konten.

## Anforderungen

Haushalt „Enrico & Nadja“, heute ist Donnerstag, 26.11.2026.

### Arten und Symbole

**REQ-001 — Aktivitätsart.** Jede Aktivität kann eine Art haben. Ein neuer Haushalt hat die Arten
„Geburtstag“, „Sport“, „Ausflug“, „Kultur“, „Essen gehen“, „Treffen“, „Reise“, „Sonstiges“ mit je
einem Symbol; bestehende Haushalte bekommen sie per Migration. Im Formular wähle ich eine Art oder
lege mit „„Wellness“ neu anlegen“ eine an (Symbol wählbar). Arten lassen sich unter „Verwalten“
umbenennen und löschen. Quelle: A-01. Offline: offline lesend.

- AC-001: Angenommen „Neue Aktivität“ · Wenn ich „Bouldern“ mit Art „Sport“ anlege · Dann zeigt die
  Liste „Bouldern“ mit dem Sport-Symbol
- AC-002: Angenommen ich tippe „Wellness“ in „Art“ · Wenn ich „„Wellness“ neu anlegen“ wähle und ein
  Symbol aussuche · Dann gibt es die Art „Wellness“ für den ganzen Haushalt
- AC-003: Angenommen die Art „Kultur“ wird gelöscht · Dann haben ihre Aktivitäten keine Art mehr und
  bleiben erhalten (nach Nachfrage, Spec 0036)
- AC-004: Angenommen ein Mitglied eines anderen Haushalts · Dann sieht es unsere Arten nicht

**REQ-002 — Eigenes Symbol.** Eine Aktivität kann ein eigenes Symbol aus einer festen Auswahl haben;
sonst gilt das Symbol ihrer Art, ohne Art das heutige Standardsymbol. Quelle: A-01. Offline: offline
lesend.

- AC-005: Angenommen „Bouldern“ (Art „Sport“) · Wenn ich das Symbol „Berg“ wähle · Dann zeigen Liste
  und Kalender den Berg

### Rhythmus

**REQ-003 — Wiederkehrende Aktivität.** Beim Einplanen einer Aktivität kann ich einen Rhythmus
wählen: wöchentlich (Wochentage), alle N Wochen, monatlich (am Tag X), jährlich (am Datum); dazu
Start, „bis“ (Datum) oder „dauerhaft“, Tageszeit und optional Uhrzeit. Der Kalender zeigt die Termine
im sichtbaren Zeitraum. Einzelne Termine lassen sich absagen oder verschieben; „Serie bearbeiten“
ändert alle künftigen. Quelle: A-02. Offline: offline lesend (Kalender rechnet offline).

- AC-006: Angenommen „Geburtstag Nadja“ jährlich ab 14.03.2027, dauerhaft · Wenn ich März 2035 öffne ·
  Dann steht „Geburtstag Nadja“ am 14.03.2035
- AC-007: Angenommen „Bouldern“ wöchentlich dienstags 18:00 ab 01.12.2026 bis 31.03.2027 · Dann steht
  es an jedem Dienstag in diesem Zeitraum und am 06.04.2027 nicht mehr
- AC-008: Angenommen dieselbe Serie · Wenn ich den Termin am 08.12. absage · Dann fehlt er am 08.12.,
  die anderen Dienstage bleiben
- AC-009: Angenommen dieselbe Serie · Wenn ich „Serie bearbeiten“ → 19:00 speichere · Dann stehen alle
  künftigen Termine auf 19:00, vergangene bleiben 18:00
- AC-010: Angenommen ein Termin am 29.02. jährlich · Dann steht er in Nicht-Schaltjahren am 28.02.
- AC-011: Angenommen die Zeitumstellung am 28.03.2027 · Dann bleibt „Bouldern“ um 18:00 Ortszeit

### Merken und Personen

**REQ-004 — Merken.** Schalter „Merken“ beim Anlegen und Bearbeiten, standardmäßig an; bestehende
Aktivitäten sind gemerkt. Die Liste öffnet immer mit „Gemerkt“; umschaltbar „Alle“, „Nicht
gemerkt“. Quelle: A-03. Offline: offline lesend.

- AC-012: Angenommen „Autofahren“ nicht gemerkt · Dann fehlt es unter „Gemerkt“, steht unter „Alle“
  und „Nicht gemerkt“ und im Kalender
- AC-013: Angenommen ich schalte auf „Alle“ und verlasse die Liste · Wenn ich wiederkomme · Dann ist
  „Gemerkt“ gewählt

**REQ-005 — Personen bei Aktivitäten.** Ein Planeintrag einer Aktivität hat „Wer ist dabei?“
(Mitglieder) und „Gäste“ (Anzahl), wie Mitesser beim Essen. Quelle: A-04. Offline: offline lesend.

- AC-014: Angenommen „Bouldern“ am Dienstag · Wenn ich Enrico und 2 Gäste wähle · Dann zeigt der
  Eintrag „Enrico + 2“

## Entscheidungen

1. Enrico, 26.11.: Begriff **Aktivitätsart** (in der Oberfläche „Art“); „Kategorie“ bleibt gesperrt.
2. Enrico, 26.11.: Arten sind eine synchronisierte Tabelle je Haushalt, mit Vorgaben befüllt.
3. Enrico, 26.11.: Rhythmus als Regel an einer Serie, Termine werden in core für den sichtbaren
   Zeitraum berechnet (kein Vorschreiben bis 2099); Absagen und Verschiebungen als Ausnahmen. Die
   Rhythmus-Logik der Aufgaben wird um „jährlich“ ergänzt und wiederverwendet.
4. Enrico, 26.11.: Personen = Mitglieder + Anzahl Gäste (`eater_ids`, `guests` des Planeintrags).
5. Symbolauswahl: feste Liste von etwa 40 Namen aus der Symbolbibliothek der App, in core als
   erlaubte Werte geprüft (DB-Check auf dieselbe Liste).
6. Umsetzung, 26.11.: Neue Haushalte bekommen die Arten über einen Trigger auf `households` (deckt
   `create_household`, Seed, `prod-bootstrap` und den Reset von Spec 0028 ab, ohne
   `create_household` neu zu schreiben). Bestehende Aktivitäten bekommen keine Art zugeordnet.
7. Umsetzung: „jährlich“ ist die eigene Form `yearly` von `SeriesRule`; „wöchentlich“, „alle N
   Wochen“ und „monatlich“ sind die Formen der Aufgaben-`Recurrence` samt `recurrenceLabel`. Der
   Rhythmus der Aufgaben selbst bleibt unverändert (dort heißt „alle 12 Monate“ schon „jährlich“),
   damit die Benachrichtigungs-Parität in SQL nicht berührt wird.
8. Umsetzung: „Serie bearbeiten“ beendet die Serie gestern und startet eine neue ab heute („alle N
   Wochen“ ab der Woche des nächsten Termins, „jährlich“ ab dem nächsten Termin, damit Phase und
   Datum bleiben); künftige Ausnahmen wandern mit. Eine noch nicht begonnene Serie wird als Ganzes
   geändert. Alles in einem `apply_changes`-Aufruf.
9. Umsetzung: Löschen einer Aktivität nimmt ihre Serien mit (auch deren vergangene Termine; einzelne
   Einträge werden wie bisher Freitext); „Rückgängig“ bringt Serien und Ausnahmen zurück.
10. Umsetzung: Ein Termin einer Serie wird nicht gezogen, sondern im Termin-Fenster verschoben;
    „Termin absagen“ und „Serie löschen“ fragen vorher (Spec 0036).
11. Umsetzung: „Wer ist dabei?“ (optional) gibt es auch im Fenster „Einplanen“ der Aktivität und im
    Eintragsfenster; das hebt Spec 0024, REQ-006 („Aktivität ohne ‚Wer isst mit?‘“) auf. Die
    Übersicht zeigt die Termine der Serien wie der Kalender.
12. OFFEN: Termine einer Serie stehen nicht im Tagesüberblick und nicht in „Aktivitäten am Vortag“
    (der Server rechnet nur mit `meal_plan_entries`) und haben kein „Erinnern“; dafür müsste die
    Termin-Berechnung auch in SQL stehen.
13. OFFEN: Ein entferntes Mitglied bleibt in `eater_ids` einer Serie stehen (wie bei
    Planeinträgen); die Oberfläche zeigt nur aktuelle Mitglieder, „Rückgängig“ filtert.

## Daten

Neue Tabellen `activity_kinds` (Name, Symbol), `activity_series` (Aktivität, Regel jsonb, Start,
Ende, Tageszeit, Uhrzeit, Personen) und `activity_series_exceptions` (Datum, abgesagt oder
verschoben). Neue Spalten `activities.kind_id`, `activities.icon`, `activities.remembered` (default
true). Alle mit `household_id`, RLS, Grants, pgTAP, `updated_at`-Trigger, Lösch-Trigger,
Sync-Registrierung (`db-change`). Cache-Version steigt.

## Risiken

| Risiko                                                       | Gegenmaßnahme                                                                | Test                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------- |
| Fremder Haushalt liest Arten/Serien                          | RLS je Tabelle                                                               | pgTAP fremder Haushalt, abgemeldet |
| Serie zeigt auf fremde Aktivität                             | Prüfung gleicher Haushalt (Trigger/Check)                                    | pgTAP                              |
| Sync verpasst neue Tabellen                                  | Trigger + Registrierung                                                      | Sync-Test                          |
| Termine am falschen Tag                                      | reine Funktion in core, Zeitzone Berlin                                      | Vitest AC-006–AC-011               |
| Ausnahme zeigt auf fremde Serie, Art einer fremden Aktivität | zusammengesetzte Fremdschlüssel `(household_id, …)`                          | pgTAP                              |
| Fremde Tageszeit / fremde Personen in Serie oder Ausnahme    | Trigger `assert_meal_slot`, `assert_members`                                 | pgTAP                              |
| „Rückgängig“ setzt fremde Art/Serie ein                      | `restore_activity` nur eigene Löschung, Art und Serie nur im selben Haushalt | pgTAP                              |

`/security-check` (26.11.): keine Befunde über „hinweis“. Hinweise: `rule` hat keine eigene
Größengrenze, ist aber durch die genauen Schlüssel und begrenzten Werte klein; entfernte Mitglieder in
`eater_ids` (Entscheidung 13).

## Umsetzung

- [x] 1. Migration Arten, Serien, Ausnahmen, Spalten + Vorgaben + pgTAP (`db-change`) (AC-004)
- [x] 2. core: Rhythmus „jährlich“, Termine einer Serie im Zeitraum (AC-006–AC-011)
- [x] 3. Formular: Art, Symbol, Merken (AC-001–AC-003, AC-005, AC-012)
- [x] 4. Liste: Filter Gemerkt/Alle/Nicht gemerkt (AC-012, AC-013)
- [x] 5. Einplanen mit Rhythmus, Serie bearbeiten, Termin absagen (AC-006–AC-009)
- [x] 6. Personen am Planeintrag (AC-014)
- [x] 7. Glossar „Aktivitätsart“, „Serie“
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün;
      `pnpm exec supabase test db`; `/security-check`

**Nachweis (26.11.2026):** `pnpm format:check` grün; `pnpm check` grün (core 98,6 %, api 93,8 %,
ui 98,0 % Zeilen); `pnpm build:web` grün; `pnpm exec supabase test db`: alle Dateien grün außer
`collections.test.sql` (2 Fälle, kommt von der parallel angewandten Migration der Spec 0037 in der
geteilten lokalen DB, nicht von 0041); neu `activity_kinds_and_series.test.sql` (113 Fälle).
Oberfläche geprüft mit Playwright (390×844, 1440×900) gegen den Dev-Server.
