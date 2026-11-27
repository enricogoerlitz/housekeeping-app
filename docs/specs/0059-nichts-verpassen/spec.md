---
status: freigegeben
datum: 2026-11-27
---

# 0059 — Nichts verpassen

**Quelle:** Feature-Review 27.11.2026, Paket 3 (`tmp/feature-review/ZUSAMMENFASSUNG.md`), von Enrico
„komplett JA“: Neu #2 („In meinen Kalender“), Neu #3 und Ausbau #6 (Vorwarnung an Serien, Fristen an
Aufgaben), Ausbau #10 (Packen-Hinweis am Vorabend). **Kritischer Pfad:** ja: Migration, RLS
(Spaltenrechte), Sync (Cache-Form, `apply_changes`).

## Ziel

Was zählt, kommt rechtzeitig: Ein Termin aus der App lässt sich mit einem Tipp in den eigenen
Handy- oder Google-Kalender übernehmen, mit echtem Wecker. Ein Geburtstag meldet sich eine Woche
vorher („Geschenk besorgen“), eine Frist an einer Aufgabe ein paar Tage vor dem Termin. Und am Abend
vor der Reise erinnert die Glocke ans Packen, solange noch etwas offen ist.

## Nicht-Ziele

- Kein Kalender-Abo (iCal-Feed): die Kopie im Kalender ändert sich nicht mit der App.
- Keine Wiederholungsregel (`RRULE`) in der Kalenderdatei: ein Termin einer Serie wird als dieser
  eine Termin übernommen.
- Keine Benachrichtigung außerhalb der App (Spec 0051 gilt): Wecker gibt es nur über den eigenen
  Kalender.
- Keine Einstellungen je Mitteilungsart (Spec 0051, Entscheidung 4).

## Anforderungen

Haushalt „Enrico & Nadja“ (Zeitzone Europe/Berlin), heute ist Freitag, 27.11.2026.

### In meinen Kalender

**REQ-001 — Kalenderdatei.** Ein Planeintrag mit Tag (Rezept, Text, Reste, Restaurant, Aktivität),
ein Termin einer Serie, eine Reise und eine Aufgabe mit Termin bieten „In meinen Kalender“ → „Als
Datei (.ics)“: das Gerät lädt eine RFC-5545-Datei mit genau einem Termin herunter. Quelle: Neu #2.
Offline: offline vollständig (die Datei entsteht aus dem lokalen Speicher).

- AC-001: Angenommen „Pizzeria Roma“ steht am Sa 28.11. um 19:30 im Plan · Wenn ich die Datei
  erzeuge · Dann enthält sie `DTSTART;TZID=Europe/Berlin:20261128T193000`,
  `DTEND;TZID=Europe/Berlin:20261128T213000`, `SUMMARY:Pizzeria Roma`, einen `VTIMEZONE` für
  Europe/Berlin und Zeilenenden CRLF
- AC-002: Angenommen „Lasagne“ steht am Mo 30.11. ohne Uhrzeit im Plan · Wenn ich die Datei erzeuge
  · Dann ist der Termin ganztägig: `DTSTART;VALUE=DATE:20261130` und `DTEND;VALUE=DATE:20261201`
- AC-003: Angenommen die Reise „Ostsee“ dauert vom 18. bis 20.12. · Wenn ich die Datei erzeuge ·
  Dann ist sie ganztägig von `20261218` bis `DTEND;VALUE=DATE:20261221`
- AC-004: Angenommen der Eintrag hat die Erinnerung „1 Tag vorher um 18:00“ mit Text „Tisch
  bestätigen“ · Wenn ich die Datei erzeuge · Dann enthält sie ein `VALARM` mit
  `TRIGGER:-P1DT1H30M` und `DESCRIPTION:Tisch bestätigen`
- AC-005: Angenommen die Aufgabe „Müll rausbringen“ ist am 1.12. um 19:00 fällig, „Erinnern“ an,
  Vorwarnung „3 Tage“ · Wenn ich die Datei erzeuge · Dann dauert der Termin 30 Minuten und hat ein
  `VALARM` mit `TRIGGER:PT0M` und eines um 09:00 drei Tage vorher (`TRIGGER:-P3DT10H`)
- AC-006: Angenommen ein Titel enthält „Essen, Kino; Bar\Neu“ und ist länger als 75 Byte · Wenn ich
  die Datei erzeuge · Dann sind `,` `;` `\` und Zeilenumbrüche maskiert und keine Zeile ist länger
  als 75 Byte (gefaltet, ohne ein UTF-8-Zeichen zu teilen)
- AC-007: Angenommen der Eintrag ist „vorgemerkt“ (ohne Tag) oder die Aufgabe ist „Bei Bedarf“ ·
  Wenn ich das Fenster öffne · Dann gibt es „In meinen Kalender“ nicht

**REQ-002 — Google Kalender.** Neben der Datei steht „In Google Kalender“: ein Link
`https://calendar.google.com/calendar/render?action=TEMPLATE&…` mit Titel, Zeit, Ort und Notiz, der
auf Android, iPhone und Desktop im Browser oder in der Google-App öffnet. Quelle: Enrico (Google
Kalender auf Android öffnet `.ics` nicht zuverlässig). Offline: nur online (der Link braucht Google;
offline ist der Knopf grau mit dem Offline-Hinweis).

- AC-008: Angenommen „Pizzeria Roma“ am 28.11. um 19:30 · Wenn ich den Link bilde · Dann hat er die
  Parameter `text=Pizzeria Roma`, `dates=20261128T193000/20261128T213000` und `ctz=Europe/Berlin`
- AC-009: Angenommen „Lasagne“ am 30.11. ohne Uhrzeit · Wenn ich den Link bilde · Dann hat er
  `dates=20261130/20261201` und kein `ctz`
- AC-010: Angenommen ich bin offline · Wenn ich ein Eintragsfenster öffne · Dann ist „Als Datei
  (.ics)“ wählbar und „In Google Kalender“ grau

### Vorwarnung

**REQ-003 — Erinnern an Serien.** „Serie bearbeiten“ bietet „Erinnern“ mit Vorlauf („Am Tag“, „1 Tag
vorher“, „3 Tage vorher“, „1 Woche vorher“), Uhrzeit (Vorgabe 18:00) und optionalem Text („Woran
erinnern?“, höchstens 80 Zeichen). Jeder Termin der Serie meldet sich dann zur Uhrzeit des
Vorlauftags in der Glocke, für alle, auch ein verschobener (vom neuen Tag aus). Quelle: Neu #3,
Ausbau #6. Offline: offline lesend (Einstellen braucht Netz; Mitteilungen entstehen offline).

- AC-011: Angenommen die Serie „Geburtstag Mama“ ist jährlich am 3.12. mit „1 Woche vorher“, 18:00,
  „Geschenk besorgen“ · Wenn es Do 26.11., 18:00 ist · Dann zeigt die Glocke „Geburtstag Mama“ mit
  „Do 3.12., Abend · Geschenk besorgen“
- AC-012: Angenommen dieselbe Serie · Wenn es Do 26.11., 17:55 ist · Dann zeigt die Glocke sie nicht
- AC-013: Angenommen der Termin vom 3.12. ist auf den 5.12. verschoben · Wenn es Sa 28.11., 18:00 ist
  · Dann zeigt die Glocke ihn (Vorlauf vom 5.12. aus), am 26.11. nicht
- AC-014: Angenommen die Serie hat „Erinnern“ · Wenn der Termin morgen ist und es 19:00 wird · Dann
  meldet die Glocke nur die Erinnerung, nicht zusätzlich „Aktivität morgen“ (Spec 0051, Entsch. 14)
- AC-015: Angenommen ich schalte „Erinnern“ in „Serie bearbeiten“ ein, wähle „3 Tage vorher“ und
  speichere · Dann trägt die Serie ab heute diese Erinnerung, vergangene Termine bleiben (Spec 0041,
  AC-009)
- AC-016: Angenommen ein Text mit 81 Zeichen oder einem Steuerzeichen · Wenn ich speichere · Dann
  erscheint der Hinweis am Feld und nichts wird gesendet; die Datenbank weist ihn ebenso ab (pgTAP)
- AC-017: Angenommen eine Serie mit `reminder_day_offset` 31 oder nur `reminder_at` ohne Vorlauf ·
  Wenn sie geschrieben wird · Dann lehnt die Datenbank ab (pgTAP)

**REQ-004 — Vorwarnung an Aufgaben.** Eine Aufgabe mit festem Termin (Einmalig mit Datum,
Wöchentlich, Monatlich, Alle n Monate) hat das Feld „Vorwarnung“ mit „Keine“, „3 Tage“, „1 Woche“,
„2 Wochen“, „1 Monat“. Ab so vielen Tagen vor dem Termin (nach Reisen, Spec 0026) steht sie in der
Glocke, für wer dran ist (bei „Egal“ alle), bis einschließlich des Termins. Quelle: Neu #3. Offline:
offline lesend.

- AC-018: Angenommen „Handyvertrag kündigen“ (Einmalig, 15.12., Egal) mit Vorwarnung „1 Monat“ ·
  Wenn ich am 27.11. die Glocke öffne · Dann steht dort „Handyvertrag kündigen“ mit „fällig in 18
  Tagen · Di 15.12.“
- AC-019: Angenommen dieselbe Aufgabe mit Vorwarnung „1 Woche“ · Wenn ich am 27.11. die Glocke
  öffne · Dann steht sie nicht dort; am 8.12. schon
- AC-020: Angenommen ich habe die Vorwarnung am 1.12. bestätigt · Wenn ich die Glocke am 2.12. öffne
  · Dann steht sie nicht wieder dort (ein Schlüssel je Termin: `deadline:<id>:2026-12-15`)
- AC-021: Angenommen die Aufgabe ist heute fällig, hat 19:00 und „Erinnern“ an · Wenn ich die Glocke
  öffne · Dann zeigt sie heute nur die Aufgabe zur Uhrzeit (Spec 0051), keine Vorwarnung
- AC-022: Angenommen „Fest: Nadja“ · Wenn ich (Enrico) die Glocke öffne · Dann steht die Vorwarnung
  bei mir nicht; bei Nadja schon
- AC-023: Angenommen der Termin ist vorbei (überfällig) oder der Rhythmus ist „Flexibel“ oder „Bei
  Bedarf“ · Dann gibt es keine Vorwarnung; das Feld fehlt im Formular bei „Flexibel“ und „Bei Bedarf“
- AC-024: Angenommen `notice_days_before` 0 oder 61 · Wenn eine Aufgabe so geschrieben wird · Dann
  lehnt die Datenbank ab (pgTAP)

### Packen

**REQ-005 — Packen-Hinweis am Vorabend.** Am Tag vor einer Reise (kein Entwurf) zeigt die Glocke ab
18:00 „Morgen geht's los · 12 von 30 gepackt“, nur wer mitreist und nur, solange ein Packstück der
Reise offen ist. Ein Tipp öffnet das Reise-Fenster. Quelle: Ausbau #10. Offline: offline
vollständig. Kein Schema.

- AC-025: Angenommen Enrico reist ab Sa 28.11. an die „Ostsee“, 12 von 30 Packstücken gepackt ·
  Wenn es Fr 27.11., 18:00 ist · Dann zeigt Enricos Glocke „Ostsee“ mit „Morgen geht's los · 12 von
  30 gepackt“, ein Tipp öffnet `/reisen?reise=<id>`
- AC-026: Angenommen dieselbe Reise · Wenn es 17:55 ist, oder alles gepackt ist, oder die Reise
  keine Packliste hat, oder sie ein Entwurf ist · Dann gibt es keinen Hinweis
- AC-027: Angenommen nur Enrico reist · Wenn Nadja die Glocke öffnet · Dann hat sie keinen
  Packen-Hinweis

## Entscheidungen

1. **Ändert Spec 0041, Nicht-Ziel 1** („Keine Erinnerungen an Geburtstage über die bestehenden
   hinaus“) auf Enricos ausdrückliches Ja (27.11.2026), und erledigt dort OFFEN 12 für „Erinnern“
   (Termine einer Serie haben jetzt eines). **Ändert Spec 0051, Entscheidung 2:** sieben statt fünf
   Arten, neu `deadline` (REQ-004) und `packing` (REQ-005).
2. **Erinnern an Serien = die Erinnerung des Termins.** Die Serie trägt dieselben drei Felder wie ein
   Planeintrag (`EntryReminder`), jeder berechnete Termin übernimmt sie; so meldet die vorhandene Art
   `entryReminder` sie, mit Schlüssel `entry:<serie>:<tag>:<vorlauf-uhrzeit>:<tag>` (passt in das
   Format von Spec 0051, Entsch. 5). Die Glocke berechnet Termine bis heute + 30 Tage. Kein „liegt in
   der Vergangenheit“-Prüfen wie an Einträgen: eine Serie wiederholt sich.
3. **Vorlauf an Serien 0–30 Tage** in der Datenbank, angeboten 0, 1, 3, 7 (Brief). **Vorwarnung an
   Aufgaben 1–60 Tage**, angeboten 3, 7, 14, 30 (Review Neu #3); 0 wäre der Fälligkeitstag, den es
   schon gibt.
4. **Vorwarnung bis einschließlich Termin**, weil eine Frist ohne Uhrzeit am Tag selbst sonst nirgends
   in der Glocke stünde; nur wenn die Aufgabe am Termin ohnehin zur Uhrzeit meldet, entfällt sie an
   diesem Tag (keine Doppelung). Seit-Zeitpunkt für die Reihenfolge: 00:00 des ersten Tags.
5. **Kalenderdatei mit `TZID=Europe/Berlin` und eingebettetem `VTIMEZONE`** (Sommer-/Winterzeit nach
   EU-Regel), weil `households.timezone` immer Europe/Berlin ist (nie geschrieben, Spec 0016 D16).
   Wäre die Zone eine andere, stehen die Zeiten als „lokale Zeit“ ohne Zone (RFC 5545 erlaubt das).
6. **Dauer:** Restaurant und Aktivität mit Uhrzeit 2 Stunden, Aufgabe mit Uhrzeit 30 Minuten, alles
   ohne Uhrzeit ganztägig, Reise ganztägig über alle Tage. Rezept, Text und Reste haben keine Uhrzeit
   und sind ganztägig; die Tageszeit steht in der Notiz.
7. **Wecker (`VALARM`)** aus der Erinnerung des Eintrags bzw. der Serie (relativ zum Beginn, ganztägig
   relativ zu 00:00), bei Aufgaben „Erinnern“ zur Uhrzeit und die Vorwarnung um 09:00. Google-Links
   tragen keinen Wecker (die Vorlage kennt keinen); Google nimmt die eigene Standard-Erinnerung.
8. **Platz:** ein Block „In meinen Kalender“ im Fenster (Eintrag, Termin einer Serie, Reise,
   Aufgabe) mit zwei Knöpfen und dem Satz „Eine Kopie – Änderungen in der App kommen nicht mit.“
   Nicht im ⋯-Menü, damit Spec 0054 (Kopfzeilen) unberührt bleibt; dort darf es später ein
   zusätzlicher Punkt werden. `UID` je Eintrag stabil (`<id>@housekeeping`), damit ein zweites
   Herunterladen im Kalender denselben Termin ersetzt, wo der Kalender das kann.
9. **Download per `blob:`-Link** (`<a download>`, `text/calendar`). Die CSP
   (`finish-web-export.mjs`) braucht keine Änderung: ein Download über einen Anker ist eine
   Navigation, keine Abfrage (`connect-src`), und `default-src 'self'` regelt sie nicht. Der Google-Link
   öffnet in einem neuen Tab. OFFEN: ob die installierte PWA auf dem iPhone die Datei direkt an
   „Kalender“ gibt, prüft der Koordinator am Gerät; sonst bleibt der Google-Link.
10. **Additiv, keine Mindestversion:** 2026.11.2 kennt die Spalten nicht und schreibt sie nicht; ein
    „Serie bearbeiten“ dort verliert die Erinnerung der neuen Serie (Teilung ab heute). Hinnehmbar
    bis zur Aktualisierung der PWA beim nächsten Start.
11. `restore_activity` übernimmt die neuen Spalten der Serien, sonst verlöre „Rückgängig“ nach
    „Aktivität löschen“ die Erinnerung; `restore_chore` nimmt ohnehin die ganze Zeile.

## Daten

Neu an `activity_series`: `reminder_day_offset smallint` (0–30), `reminder_at time` (5-Minuten-Raster),
`reminder_text text` (1–80 Zeichen, getrimmt, keine Steuer- oder unsichtbaren Zeichen), Vorlauf und
Uhrzeit nur zusammen, Text nur mit Uhrzeit. Neu an `chores`: `notice_days_before smallint` (1–60).
Spaltenrechte `insert`/`update` für `authenticated`, Positivliste in `apply_changes` gleich (pgTAP
`writable_columns`). Cache-Version 23 → 24. Keine neuen personenbezogenen Daten (der Text ist wie am
Eintrag frei, für beide sichtbar). Gelesen für die Glocke zusätzlich: Packlisten der Reisen.

## Risiken

| Risiko                                                                                                                         | Gegenmaßnahme                                                                                                      | Test                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Fremder Haushalt liest oder ändert die neuen Spalten                                                                           | bestehende RLS der Tabellen; `apply_changes` nur für Mitglieder                                                    | pgTAP `notice_lead_times`: fremdes Mitglied sieht 0 Serien, Patch → `not_member`, direktes Update ändert 0 Zeilen |
| Abgemeldet schreibt                                                                                                            | keine Rechte für `anon`                                                                                            | pgTAP: `anon` Update → `42501`                                                                                    |
| Ungültige Werte (Vorlauf 31 oder −1, Text 81 Zeichen, Steuerzeichen, Uhrzeit ohne Vorlauf, Text ohne Uhrzeit, Vorwarnung 0/61) | Check-Constraints; dieselbe Prüfung im Formular (core `lead-times`), in `editActivitySeries` und im Fake-Transport | pgTAP Checks; core `lead-times.test.ts`; api `notice-lead-times.backend.test.ts`                                  |
| Spaltenrechte und Positivliste laufen auseinander                                                                              | `apply_changes` und Grants in derselben Migration                                                                  | pgTAP `writable_columns`                                                                                          |
| Alter Cache ohne neue Felder                                                                                                   | Cache-Version 24 → volles Laden                                                                                    | api `backend.test.ts`                                                                                             |
| Undo nach „Aktivität löschen“ verliert die Erinnerung                                                                          | `restore_activity` neu mit den Spalten                                                                             | pgTAP `notice_lead_times` (Decision 11)                                                                           |
| Kalenderdatei mit eingeschleusten Zeilen (`\r\nBEGIN:VEVENT` im Titel)                                                         | Maskieren nach RFC 5545 §3.3.11, Falten nach Bytes                                                                 | core `AC-006`                                                                                                     |
| Viele Schlüssel in der Zukunft verdrängen Bestätigungen                                                                        | Vorwarnung höchstens 60 Tage ≤ 367 (Grenze von `acknowledge_notices`)                                              | vorhanden (Spec 0051)                                                                                             |
| „In Google Kalender“ gibt Titel, Ort, Tageszeit und den App-Link an Google                                                     | nur auf ausdrücklichen Tipp; neuer Tab mit `noopener,noreferrer`; Ids im Link sind ohne Anmeldung wertlos (RLS)    | Security-Check: Hinweis, kein Defekt                                                                              |
| Paralleles 0060 definiert `apply_changes` ebenfalls neu                                                                        | Zeitstempel 20261127120000 < 0060; wer später merged, nimmt beide Spalten in die Liste                             | `writable_columns` fällt sonst rot                                                                                |

Security-Check (27.11.2026, Diff gegen `develop`): keine Befunde über „Hinweis“. Geprüft: RLS und
Spaltenrechte der neuen Spalten, `apply_changes`-Positivliste, `restore_activity` (security definer,
nur eigene Löschungen über `my_deletion`), Maskierung der Kalenderdatei, Kodierung des Google-Links,
Download per `blob:` (Typ `text/calendar`, kein HTML), CSP unverändert, keine Secrets, keine neue
Abhängigkeit. Hinweise: Datenweitergabe an Google nur auf Tipp (Tabelle oben); die `blob:`-Datei
wird nicht ausgeführt.

## Umsetzung

- [x] 1. core: Typen (`ActivitySeries.reminder`, `Chore.noticeDaysBefore`), `seriesPlanEntries`
      übernimmt die Erinnerung (AC-011–AC-014)
- [x] 2. core `notices.ts`: Arten `deadline` und `packing`, Ziel `trip` (AC-018–AC-023, AC-025–AC-027)
- [x] 3. core `calendar-export.ts`: `toICalendar`, `googleCalendarUrl`, Termine aus Eintrag, Reise,
      Aufgabe (AC-001–AC-009); core `lead-times.ts` (AC-015–AC-017, AC-023)
- [x] 4. Migration `20261127120000_notice_lead_times.sql`, pgTAP `notice_lead_times.test.sql`
      (AC-015–AC-018, AC-024, Risiken)
- [x] 5. api: Spalten, Abbildung, Fake-Checks, Typen, Seed, `CACHE_VERSION` 24
- [x] 6. app: Block „In meinen Kalender“ (Eintrag, Termin, Reise, Aufgabe; AC-007, AC-010),
      „Erinnern“ in „Serie bearbeiten“ (AC-015), „Vorwarnung“ im Aufgabenformular (AC-023), Glocke mit
      Packlisten und Serien-Terminen bis heute + 30
- [x] 7. e2e `e2e/rundgang-nichts-verpassen.spec.ts` (AC-003, AC-010, AC-018, AC-023); läuft beim
      Mergen mit der Suite (nicht im Bau ausgeführt, BAU-REGELN)
- [x] Nachweis: siehe unten

### Nachweis

- Rot zuerst: core `calendar-export`, `lead-times` (Modul fehlte) und 13 Tests in `notices-0059`
  rot; pgTAP `notice_lead_times` rot (`column s.reminder_day_offset does not exist`).
- Grün: `pnpm format:check`, `pnpm knip`, `turbo run lint typecheck test` (17/17), `pnpm check` und
  `pnpm build:web` nach dem Zurücksetzen der lokalen `config.toml`; `pnpm exec supabase test db`
  auf eigener Wegwerf-DB: 56 Dateien, alle grün.
- Angesehen gegen eigenen Dev-Server und eigene DB (Desktop 1440×900, Handy 390×844):
  Reise-Fenster, Eintragsfenster, Termin einer Serie, „Serie bearbeiten“ mit „Erinnern“, Aufgabe mit
  „Vorwarnung“, Glocke (auch 18:30 mit „Morgen geht's los · 6 von 21 gepackt“). Heruntergeladene
  `.ics` geprüft (CRLF, `VALARM` `-P6DT17H` für „1 Woche vorher, 07:00“ an einem ganztägigen
  Termin), Google-Link öffnet `calendar.google.com/calendar/render?action=TEMPLATE…`; Speichern von
  „3 Tage vorher“ und „1 Woche“ über die echte `apply_changes` geprüft.
- CSP (Entscheidung 9): Probe mit der CSP aus `dist/index.html` von `pnpm build:web` — der
  `blob:`-Download über `<a download>` läuft in Chromium ohne CSP-Verstoß. WebKit/iPhone prüft der
  Koordinator am Gerät (OFFEN in Entscheidung 9).
