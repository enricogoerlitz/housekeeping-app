---
status: in-arbeit # offen | in-arbeit | erledigt
datum: 2026-11-21
spec: 0010
---

# 0010 — Plan

## Ansatz

Der Tab „Plan“ wird zum Tab „Kalender“ unter `/kalender` mit den Ansichten Woche, Monat und Jahr;
alte Adressen unter `/plan` leiten nicht weiter (noch nichts veröffentlicht, Entscheidung vom
21.11.2026). Alle Regeln, die sich ohne Bildschirm prüfen lassen,
liegen in `packages/core`: Raster und Bezeichnungen (`calendar.ts`), Streifen, Jahresliste und
Schreibplan der Abwesenheiten (`absences.ts`), Termine der Haushalt-Zeile (`household-row.ts`) und
die Reste aus den sieben Tagen davor (`meal-plan.ts`). `packages/ui` bekommt die Farbrollen der
Arten je Theme (mit Kontrasttest), Kante und Punkt je Art, ein Popover, ein Aktionsmenü und ein
„Zurück“ mit Text. `packages/api` bekommt `saveAbsences` und `removeAbsences` als je einen
Schreibvorgang. Die App setzt daraus das Feature `features/calendar/*`, das neue
Hinzufügen-Fenster, das Abwesenheits-Fenster mit Monatskalender, die neue Seite „Abwesenheiten“
und die eigene Seite „Aktivitäten“ zusammen. `supabase` bleibt unberührt.

**Entscheidungen beim Planen** (folgen aus Code und Konvention, vom Lead bestätigt):

- Tab-Schlüssel `kalender` (`tab-kalender`, `nav-kalender`), weil die Schlüssel den Adressen
  folgen (`rezepte`, `liste`, `haushalt`).
- Keine Weiterleitungen von `/plan`: Es ist noch nichts veröffentlicht (Entscheidung vom
  21.11.2026; AC-003 und der erste Teil von AC-041 entfallen). Die Zeile der Abwesenheiten in
  der Woche heißt nach dem Glossar „Abwesenheit“, nicht „Urlaub“ (AC-007, AC-028 angepasst).
- Ansicht und Zeitraum sind Zustand der Kalender-Seite. Sie bleibt im Stapel unter „Aktivitäten“
  offen, deshalb führt „‹ Kalender“ in dieselbe Ansicht zurück (AC-025, AC-040).
- Eine Aktivität öffnet sich immer als eigene Seite `/kalender/aktivitaet/<id>` (AC-026). Die
  geteilte Ansicht (Liste und Aktivität nebeneinander) aus Spec 0004 entfällt.
- Die Herkunft der Seite „Aktivitäten“ steht in der Adresse (`?von=verwalten`): auf dem Handy dann
  „‹ Verwalten“ zurück zu „Verwalten“, sonst „‹ Kalender“.
- Freitext und Reste gehen wie Rezepte durch den zweiten Schritt (Tageszeit wählbar, AC-024).

## Datenbank und Sync

**Keine Änderung** (Spec „Daten“, Konzept 4.4).

- Mehrere Abwesenheiten anlegen, ändern oder löschen ist ein `commit` über den Diff-Pfad, also ein
  `apply_changes` in einer Transaktion: ganz oder gar nicht (REQ-010).
- Reste verweisen über `leftoversOfEntryId` schon heute auf beliebige Planeinträge.
- Künftige Termine der Haushalt-Zeile werden berechnet, nicht gespeichert.
- „Haushalt-Zeile ein/aus“ je Ansicht liegt in den Geräte-Einstellungen (`LocalSettings`), nicht in
  der Datenbank.

## Risiken und Gegenmaßnahmen

Kritischer Pfad ist nur das Löschen von Abwesenheiten; der Rest ist Anzeige.

| Was könnte schiefgehen                                           | Gegenmaßnahme                                                                                   | Getestet durch                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Bearbeiten eines Streifens schreibt nur halb                     | ein `commit`; Ersetzen, Anlegen und Löschen in einem Diff                                       | api `saveAbsences` (AC-036)                       |
| Löschen einer Zeile trifft zu viele oder fremde Abwesenheiten    | nur die Ids der Zeile, `maxDeletes: { absences: n }`; Rückgängig über Snapshot                  | api `removeAbsences` (AC-037)                     |
| Ungültige Eingabe („Bis“ vor „Von“, niemand gewählt)             | Prüfung in `core` vor dem Schreiben, Befehl lehnt zusätzlich ab                                 | core `validateAbsenceDraft`, api (AC-035, AC-044) |
| Offline wird geschrieben                                         | Hinzufügen, Abwesenheit, ⊔ und Haken gesperrt mit Hinweis; Schreibbefehle werfen `OfflineError` | Klick-Durchlauf offline (AC-004, AC-020, AC-041)  |
| Termine der Haushalt-Zeile laufen endlos                         | Schleife nur über den gezeigten Zeitraum, Schrittgrenze                                         | core `householdRow`                               |
| Abwesenheiten (Personenbezug) werden fremden Haushalten sichtbar | unverändert RLS aus Spec 0003; keine neuen Felder, keine neue Abfrage                           | bestehende pgTAP-Tests                            |

## Aufgaben

### Task 1 — Kalender-Mathematik in `core`

- **Deckt ab:** AC-005, AC-006, AC-011, AC-012, AC-013, AC-014, AC-015
- **Berührt:** `packages/core/src/calendar.ts`, `calendar.test.ts`
- **Test:** Monatsraster (Januar 2027 beginnt am 28.12.), zwölf Monate eines Jahres, „KW 47 ·
  16.–22. Nov“, „KW 53 · 28. Dez – 3. Jan“, Blättern über den Jahreswechsel, Wechsel Woche ↔
  Monat ↔ Jahr, Punkte je Tag (höchstens drei, feste Reihenfolge), „+n weitere“.
- **Status:** erledigt

### Task 2 — Abwesenheiten in `core`

- **Deckt ab:** AC-015, AC-016, AC-028 bis AC-038, AC-042 bis AC-044
- **Berührt:** `packages/core/src/absences.ts`, `absences.test.ts`
- **Test:** Streifen zusammenfassen (gleiches Von, Bis, Notiz), Beschriftung mit Ende und
  „abwesend“, Ausschnitt einer Woche, Beschriftungstage auf dem Handy, Tage im Jahr (eine Person,
  mehrere, ganzer Haushalt), Liste je Jahr über den Jahreswechsel, „Kommend“ und „Vergangen“,
  Schreibplan (alle gewählt = Haushalt, sonst je Person; Bearbeiten ersetzt), Prüfung der Eingabe,
  Zeitraum wählen im Monatskalender.
- **Status:** erledigt

### Task 3 — Haushalt-Zeile in `core`

- **Deckt ab:** AC-017, AC-019 (Zählen „n Aufgaben“)
- **Berührt:** `packages/core/src/household-row.ts`, `household-row.test.ts`
- **Test:** vergangene Tage aus dem Verlauf, heute fällig und überfällig, feste Rhythmen mit
  Wechsel der Person, flexible Aufgaben mit „etwa“, ruhende Monate, Aufgaben ohne Termin.
- **Status:** erledigt

### Task 4 — Reste aus den sieben Tagen davor in `core`

- **Deckt ab:** AC-045 bis AC-049
- **Berührt:** `packages/core/src/meal-plan.ts`, `meal-plan.test.ts`
- **Test:** Zieltag −7 bis −1 über Wochen- und Jahresgrenzen, nur Rezept und Freitext, ohne „nicht
  gekocht“, jüngstes zuerst, Beschriftung mit Wochentag oder Datum, leer, ohne Zieltag.
- **Status:** erledigt

### Task 5 — Farbrollen und Bausteine in `ui`

- **Deckt ab:** AC-009, AC-010; Bausteine für AC-012, AC-025, AC-039
- **Berührt:** `packages/ui/src/themes/*`, `choice.tsx`, `shell.tsx`, `display.tsx`, `icons.ts`,
  `docs/design/DESIGN.md`
- **Test:** Kontrast jeder Farbrolle der fünf Arten gegen Seite und Karte ≥ 3:1 in allen Themes,
  hell und dunkel; fehlt eine Rolle, nennt der Test Theme und Rolle.
- **Status:** erledigt

### Task 6 — Abwesenheiten schreiben in `api`

- **Deckt ab:** AC-033, AC-034, AC-036, AC-037
- **Berührt:** `packages/api/src/commands-household.ts`, `commands-household.test.ts`
- **Test:** `saveAbsences` legt bei allen Gewählten eine Haushalt-Abwesenheit an, sonst je Person
  eine; beim Bearbeiten werden die ersetzten Zeilen gelöscht; ungültige Eingabe schreibt nichts;
  `removeAbsences` löscht genau die genannten.
- **Status:** erledigt

### Task 7 — Kalender in der App

- **Deckt ab:** AC-001, AC-004 bis AC-020, AC-025 bis AC-032, AC-039 bis AC-041
- **Berührt:** `apps/app/src/app/(tabs)/kalender/**`, `(tabs)/_layout.tsx`,
  `features/calendar/*`, `features/activities/*`, `features/manage/*`, `features/shell/*`,
  `lib/settings.tsx`, Verweise auf `/plan`
- **Test:** e2e dev smoke auf `/kalender`, Klick-Durchlauf bei 390 und 1440 px
- **Status:** erledigt

### Task 8 — Hinzufügen-Fenster

- **Deckt ab:** AC-021 bis AC-024, AC-045 bis AC-049
- **Berührt:** `apps/app/src/features/meal-plan/add-entry-sheet.tsx`
- **Test:** Klick-Durchlauf; die Auswahl der Reste ist in Task 4 getestet
- **Status:** erledigt

### Task 9 — Abwesenheiten eintragen, bearbeiten, verwalten

- **Deckt ab:** AC-032 bis AC-038, AC-042 bis AC-044
- **Berührt:** `apps/app/src/features/absences/*`
- **Test:** Klick-Durchlauf; die Regeln sind in Task 2 und 6 getestet
- **Status:** erledigt

## Offene Annahmen

- **OFFEN:** Eine überfällige oder heute fällige Aufgabe mit festem Rhythmus steht an künftigen
  Tagen so, als würde sie heute erledigt („Blumen gießen“, seit 18.11. überfällig, steht heute und
  wieder am Mittwoch, 25.11.).
- **OFFEN:** Auf dem Desktop führt „Zurück“ von der Seite „Aktivitäten“ immer zum Kalender, auch
  wenn man sie über „Verwalten“ in der Seitenleiste geöffnet hat; „‹ Verwalten“ gibt es nur auf
  dem Handy, wo „Verwalten“ eine Seite ist.

## Bewusst nicht Teil dieses Plans

- AC-002 im Inhalt: ⊔ öffnet weiter den heutigen Vorratscheck; „Was soll auf die Liste?“ baut
  Spec 0006.
- „Nicht gekocht“ bei den Resten ist eingebaut, prüfbar ab Spec 0011 (AC-047).
- Packlisten am Streifen (Spec 0012), Tab „Sammlungen“ und Einträge der Art Sammlung (Spec 0009);
  die Farbrolle „Sammlung“ ist schon angelegt.

## Nachweis

Stand 21.11.2026; nicht committet. Belege liegen unter `tmp/0010/` (git-ignoriert).

- [x] **Rot vor grün.** Die Tests in `core` liefen zuerst rot (`tmp/0010/red-core.txt`: drei
      Module fehlten, 6 Reste-Tests rot) und danach grün (`green-core.txt`: 83 Tests in 4 Dateien).
      Der Kontrasttest in `ui` lief gegen die Themes ohne `kinds` rot, 30 Fälle mit Theme und Rolle
      im Namen (`red-ui.txt`), danach grün (`green-ui.txt`: 149). Der Test in `api` lief rot
      (`saveAbsences is not a function`, `red-api.txt`) und danach grün (`green-api.txt`: 8).
      Bildschirm-AC haben keinen Komponententest; die App hat noch keine Komponententests (Regel
      21-testing). Sie sind über den e2e-Smoke und den Klick-Durchlauf belegt (siehe unten).
      Der spec-auditor ist nicht gelaufen.
- [x] **`pnpm format:check` und `pnpm check` grün** (17/17 Aufgaben) mit dem Stand vor der
      laufenden Arbeit an Spec 0006. Deren Zwischenstand (`useShoppingLists` entfernt) bricht zurzeit
      `tsc` der App in `features/shopping/*` und `today-shopping.tsx`; die Dateien dieser Spec sind
      sauber. `pnpm build:web` ist nicht gelaufen; der Web-Export lief über `expo export` nach
      `tmp/0010/dist`.
- [x] `pnpm exec supabase test db`: nicht betroffen, keine Datenbankänderung.
- [x] **UI geprüft, ohne `/ui-verify`.** `pnpm e2e:dev` ist grün; der Smoke ist auf `/kalender`
      umgestellt. Dazu kam ein Klick-Durchlauf gegen den Web-Export bei 390 und 1440 px
      (`tmp/0010/click.mjs`, `click2.mjs`, Logs `click-*.log`, Screenshots `phone-*`,
      `desktop-*`). Geprüft: Woche, KW 53 und KW 1 mit Streifen, Monat Handy und Desktop mit
      „+1 weitere“, Escape und „Tag öffnen“, Jahr mit Liste, Abwesenheit über Monatsgrenzen eintragen
      und bearbeiten, „Bis“ vor „Von“, Hinzufügen mit „qwertz“, Freitext und zurück, Reste aus sieben
      Tagen, Haushalt-Zeile aus und ein, ▲ und „‹ Kalender“, „Verwalten“ → „Aktivitäten“ samt
      Hervorhebung in der Seitenleiste,
      offline gesperrte Aktionen. Keine Fehler in der Konsole.
      Behoben: Der Titel brach auf dem Handy um (Kopfknöpfe enger gesetzt). Escape schloss weder das
      Popover noch das ⋯-Menü (eigener Escape-Handler im Web). Nach „‹ Verwalten“ zeigte der Tab
      „Kalender“ noch die Aktivitäten; dafür setzt „Zurück“ den Kalender-Stapel jetzt mit
      `router.replace('/kalender')` zurück. Diese letzte Änderung und die Zeile „Abwesenheit“
      sind im Browser **noch nicht geprüft**: Der Zwischenstand von Spec 0006 lässt die App beim
      Start abstürzen (`useShoppingLists is not a function`).
      `/ui-verify` mit Dark Mode und Themes und die impeccable-Kritik sind nicht gelaufen.
- [x] `/security-check` auf Anlegen, Ändern und Löschen der Abwesenheiten, die (inzwischen entfernten) Weiterleitungen und
      die Geräte-Einstellung: keine Befunde, ein Hinweis. `maxDeletes` richtet sich nach der
      übergebenen Liste; die Grenze sind RLS und `apply_changes` mit höchstens 20 Löschungen.
- [x] **Offline teilweise geprüft.** Über „Offline simulieren“ sind ⊔ und „Abwesenheit eintragen“
      gesperrt, mit Hinweis. Das Lesen aller Ansichten und die Haushalt-Zeile kommen aus dem Cache.
      Ein Schreiben, das während des 2-Sekunden-Fensters offline wird, ist nicht durchgespielt.
- [x] Rückverfolgbarkeitstabelle der Spec ergänzt. Glossar: Die Begriffe „Kalender“,
      „Haushalt-Zeile“ und „Abwesenheits-Streifen“ standen schon dort.
