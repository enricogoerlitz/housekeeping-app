---
status: in-arbeit # offen | in-arbeit | erledigt
datum: 2026-11-20
spec: 0001
---

# 0001 — Plan

## Ansatz

Zuerst entsteht das Aussehen: drei Design-Richtungen als statische Entwürfe, Enrico wählt, daraus
wird `DESIGN.md`. Danach kommt das Design-System (`packages/ui`) und eine Daten-Schnittstelle
(`packages/api`), hinter der vorerst ein Beispielhaushalt im Speicher liegt. Die Bildschirme in
`apps/app` kennen nur diese Schnittstelle. Die folgenden Specs tauschen die Beispieldaten gegen
Supabase, ohne die Bildschirme umzuschreiben. Ein Playwright-Rundgang klickt alle Abläufe durch;
er ist zugleich Ende-zu-Ende-Test und Drehbuch für das Video.

| Paket           | Was hier entsteht                                                                            |
| --------------- | -------------------------------------------------------------------------------------------- |
| `packages/ui`   | Tokens (hell/dunkel), Schriften, Bausteine, Showroom-Inhalte                                 |
| `packages/core` | Reine Funktionen, die Bildschirme zum Anzeigen brauchen (siehe Task 5), mit Unit-Tests       |
| `packages/api`  | Typen, Daten-Schnittstelle, Beispielhaushalt, Starter-Katalog, hinterlegte KI-Antworten      |
| `apps/app`      | Navigation, Bildschirme je Feature unter `src/features/<feature>/`, Einstellungen im Browser |
| `e2e/`          | Rundgang als Playwright-Test und Videoaufnahme                                               |

## Datenbank und Sync

Keine Änderung. Diese Spec hat kein Backend.

## Technische Entscheidungen in diesem Plan

| Thema               | Entscheidung                                                                                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Styling             | Eigenes, typisiertes Theme-System in `packages/ui` (Tokens, `ThemeProvider`, Bausteine mit `StyleSheet`). Kein NativeWind: Drei Themes unterscheiden sich auch im Aufbau und müssen zur Laufzeit umschaltbar sein; siehe ADR-0010              |
| Daten-Schnittstelle | Je Bereich ein kleines Repository mit Lese-Funktionen und Befehlen (`addShoppingItem`, `checkShoppingItem` …). Bildschirme nutzen Hooks, die darauf aufsetzen. Die Befehle tragen schon die Namen, die später Werkzeuge des Assistenten werden |
| Zustand             | Ein Speicher im Arbeitsspeicher je Haushalt, mit Abo-Mechanismus für reaktive Hooks. Kein Speichern, außer den Einstellungen Theme, Erscheinungsbild und KI-Suche im lokalen Speicher des Geräts                                               |
| Beispieldatum       | Der Wochenplan des Beispielhaushalts wird relativ zu „heute“ erzeugt, damit die laufende Woche immer gefüllt ist. Der Rundgang setzt die Uhr fest, damit er wiederholbar bleibt                                                                |
| Fotos               | Wenige lizenzfreie Fotos (Unsplash-Lizenz), verkleinert, unter `packages/api` (offene Frage 2 der Spec, Annahme A). Quelle und Lizenz stehen in einer Datei daneben                                                                            |
| Schriften           | Selbst gehostet über `expo-font` aus den Paketen `@expo-google-fonts/*` (Dateien liegen im Bundle, keine Anfrage an fremde Server, AC-006). Geladen wird nur die Schrift des aktiven Themes                                                    |
| KI                  | Hinterlegte Beispielantworten in `packages/api`, zugeordnet über feste Beispielanfragen. Keine Netzaufrufe                                                                                                                                     |

## Risiken und Gegenmaßnahmen

Kein kritischer Pfad im Sinne von `.claude/rules/00-core.md` (kein Login, keine Datenbank, kein
Sync, kein Löschen echter Daten).

| Was könnte schiefgehen                                                      | Gegenmaßnahme                                                                                          | Getestet durch             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------- |
| Der Dummy bekommt heimlich Fachlogik, die später niemand prüft              | Logik nur in `packages/core` mit Tests; Bildschirme rechnen nichts selbst                              | Unit-Tests, Review         |
| Bildschirme hängen an den Beispieldaten und müssen später neu gebaut werden | Lint-Grenze: `apps/app` importiert nur die öffentliche Schnittstelle von `@housekeeping/api`           | AC-015                     |
| Web-only-Code verbaut den Weg zu den nativen Apps                           | Nur React-Native-Bausteine und Expo-Module; Browser-APIs nur hinter einer Plattform-Datei (`*.web.ts`) | Review; Typecheck          |
| Styling-Bibliothek passt nicht zur neuen Expo-Version                       | Kurzversuch (Task 3) vor dem Design-System                                                             | Web-Build in Task 3        |
| Fremde Server werden unbemerkt kontaktiert (Schriften, Bilder)              | Alles lokal eingebunden                                                                                | AC-006, AC-043 im Rundgang |
| Der Umfang ufert aus                                                        | Nicht-Ziele der Spec; jeder Bildschirm zeigt genau die Abläufe der Akzeptanzkriterien                  | spec-auditor               |

## Aufgaben

**Reihenfolge der Tests, abweichend von Regel 3 in `AGENTS.md`:** Auf Enricos ausdrücklichen
Wunsch (20.11.2026) entsteht zuerst die lauffähige App, die von Hand und im Browser durchgetestet
wird. Die automatischen Tests (Unit-Tests und Rundgang) folgen am Ende in Task 13 und 14. Jedes
Akzeptanzkriterium bekommt trotzdem seinen Test.

### Task 1 — Drei Design-Richtungen

- **Deckt ab:** AC-001, AC-002
- **Berührt:** `tmp/design-richtungen/` (nicht im Repo)
- **Inhalt:** statische Entwürfe für „Heute“ und „Einkaufsliste“ (Handy) und „Heute“ (Desktop), je
  hell und dunkel, als Bilder und als Vergleichsseite
- **Status:** erledigt am 20.11.2026; Vergleichsseite unter `tmp/design-richtungen/index.html`.
  Wartet auf Enricos Auswahl (AC-001) bzw. eine weitere Runde (AC-002)

### Task 2 — DESIGN.md mit drei Themes

- **Deckt ab:** AC-001, AC-003
- **Berührt:** `docs/design/DESIGN.md`
- **Test:** Unit-Test rechnet die Kontraste aller Text-Hintergrund-Paare aller sechs Paletten
- **Status:** offen

### Task 3 — Styling-Entscheidung (ADR-0010)

- **Deckt ab:** Voraussetzung für REQ-002, AC-046, AC-047
- **Berührt:** `docs/adr/0010-styling-und-themes.md`
- **Status:** erledigt (eigenes Theme-System statt NativeWind)

### Task 4 — Design-System und Showroom

- **Deckt ab:** AC-004, AC-005, AC-006, AC-009
- **Berührt:** `packages/ui`, `apps/app/src/app/showroom.tsx`, `eslint.config.mjs`
- **Themes:** „Markthalle“ (Standard), „Klar“, „Frisch“, je hell und dunkel; Auswahl unter
  Einstellungen, lokal gespeichert (AC-046, AC-047)
- **Bausteine:** Text, Knopf, Symbol-Knopf, Karte, Listenzeile, Abhak-Zeile, Chip, Eingabezeile,
  Sheet, Hinweis mit „Rückgängig“, Avatar, Abzeichen, Fortschritt, Fälligkeitsbalken, leerer
  Zustand, Offline-Hinweis, Vorschlagskarte, Geisterzeile, Segment-Schalter, Schalter
- **Test:** Rundgang-Schritt öffnet `/showroom`; Lint-Regel gegen Farbwerte im Feature-Code
- **Status:** offen

### Task 5 — Fachfunktionen für die Anzeige

- **Deckt ab:** AC-013, AC-018 bis AC-020, AC-022, AC-024, AC-025, AC-028, AC-029, AC-031, AC-032
- **Berührt:** `packages/core`
- **Funktionen:**
  - Eingabe zerlegen (Menge · Artikel · Zusatz)
  - Zutatenzeile zerlegen
  - Artikel suchen mit Synonymen und Tippfehlern
  - Rezepte suchen und filtern
  - Ernährungsform ableiten
  - Portionen skalieren
  - Varianten nach Mitgliedern aufteilen
  - Einkaufsposten aus Beiträgen zusammenführen
  - nach Laufreihenfolge gruppieren
- **Test:** Unit-Tests je Funktion, benannt nach dem Kriterium
- **Status:** offen

### Task 6 — Daten-Schnittstelle und Beispielhaushalt

- **Deckt ab:** AC-012 bis AC-016
- **Berührt:** `packages/api`, `eslint.config.mjs`
- **Test:** Unit-Tests prüfen den Beispielhaushalt gegen AC-012 und den Starter-Katalog gegen
  AC-013; Lint-Regel für AC-015
- **Status:** offen

### Task 7 — App-Gerüst

- **Deckt ab:** AC-007 bis AC-011, AC-016
- **Berührt:** `apps/app/src/app/**`, `apps/app/src/features/shell/`
- **Inhalt:** fünf Tabs, seitliche Navigation ab Tabletbreite, Assistent-Knopf, Profilmenü,
  Einstellungen (Erscheinungsbild, Offline simulieren, KI-Schalter), Haushalt wechseln,
  „Nicht gefunden“
- **Status:** offen

### Task 8 — Heute und Rezepte

- **Deckt ab:** AC-017 bis AC-023
- **Berührt:** `apps/app/src/features/today/`, `recipes/`
- **Status:** offen

### Task 9 — Wochenplan

- **Deckt ab:** AC-024 bis AC-027
- **Berührt:** `apps/app/src/features/meal-plan/`
- **Status:** offen

### Task 10 — Einkaufsliste, Vorratscheck, Einkaufsmodus, Märkte

- **Deckt ab:** AC-028 bis AC-034
- **Berührt:** `apps/app/src/features/shopping/`, `stores/`
- **Status:** offen

### Task 11 — Haushaltsplan, Abwesenheit, Feedback

- **Deckt ab:** AC-035 bis AC-039
- **Berührt:** `apps/app/src/features/chores/`, `household/`, `feedback/`
- **Status:** offen

### Task 12 — KI-Bedienung, simuliert

- **Deckt ab:** AC-040 bis AC-043
- **Berührt:** `apps/app/src/features/assistant/`, `packages/api` (Beispielantworten)
- **Status:** offen

### Task 13 — Rundgang als Test und Video

- **Deckt ab:** AC-044, AC-045; sammelt die Schritte aller vorigen Aufgaben
- **Berührt:** `e2e/`, `package.json` (`pnpm e2e`, `pnpm demo:video`), `.github/workflows/ci.yml`
- **Status:** offen

### Task 14 — Unit-Tests, Prüfen und Feinschliff

- **Deckt ab:** alle
- **Inhalt:** Unit-Tests für `packages/core`, `packages/api` und die Kontraste; `/ui-verify` in drei Breiten, Design-Kritik, Barrierefreiheit (Tastatur, Kontraste,
  Beschriftungen), Prüfung auf dem iPhone durch Enrico
- **Status:** offen

## Reihenfolge

```
1 → 2, 3
   ┐
5 ─┼→ 4 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14
6 ─┘
```

Task 3, 5 und 6 hängen nicht von der Design-Auswahl ab.

## Bewusst nicht Teil dieses Plans

Alles aus den Nicht-Zielen der Spec. Außerdem:

- Dauerposten, Sammlungen und das Haushaltsgedächtnis als eigene Bildschirme. Sie werden nur dort
  sichtbar, wo ein Akzeptanzkriterium sie berührt.
- Die vollständige Bearbeitungsmaske für Rezepte mit Gruppen, Vorlauf und Fotos-Upload.

## Nachweis

Wird am Ende ausgefüllt.

- [ ] Alle AC haben einen Test, der rot war und jetzt grün ist (spec-auditor)
- [ ] `pnpm format:check && pnpm check && pnpm build:web` grün
- [ ] Rundgang (`pnpm e2e`) grün; Video erzeugt
- [ ] `/ui-verify` gelaufen, Befunde behoben oder begründet
- [ ] Auf dem iPhone in Safari geprüft
- [ ] Glossar und Rückverfolgbarkeitstabelle aktuell
