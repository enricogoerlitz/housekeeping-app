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
- **Status:** erledigt am 20.11.2026

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
- **Status:** erledigt am 20.11.2026

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
- **Status:** erledigt am 20.11.2026

### Task 6 — Daten-Schnittstelle und Beispielhaushalt

- **Deckt ab:** AC-012 bis AC-016
- **Berührt:** `packages/api`, `eslint.config.mjs`
- **Test:** Unit-Tests prüfen den Beispielhaushalt gegen AC-012 und den Starter-Katalog gegen
  AC-013; Lint-Regel für AC-015
- **Status:** erledigt am 20.11.2026

### Task 7 — App-Gerüst

- **Deckt ab:** AC-007 bis AC-011, AC-016
- **Berührt:** `apps/app/src/app/**`, `apps/app/src/features/shell/`
- **Inhalt:** fünf Tabs, seitliche Navigation ab Tabletbreite, Assistent-Knopf, Profilmenü,
  Einstellungen (Erscheinungsbild, Offline simulieren, KI-Schalter), Haushalt wechseln,
  „Nicht gefunden“
- **Status:** erledigt am 20.11.2026

### Task 8 — Heute und Rezepte

- **Deckt ab:** AC-017 bis AC-023
- **Berührt:** `apps/app/src/features/today/`, `recipes/`
- **Status:** erledigt am 20.11.2026

### Task 9 — Wochenplan

- **Deckt ab:** AC-024 bis AC-027
- **Berührt:** `apps/app/src/features/meal-plan/`
- **Status:** erledigt am 20.11.2026

### Task 10 — Einkaufsliste, Vorratscheck, Einkaufsmodus, Märkte

- **Deckt ab:** AC-028 bis AC-034
- **Berührt:** `apps/app/src/features/shopping/`, `stores/`
- **Status:** erledigt am 20.11.2026

### Task 11 — Haushaltsplan, Abwesenheit, Feedback

- **Deckt ab:** AC-035 bis AC-039
- **Berührt:** `apps/app/src/features/chores/`, `household/`, `feedback/`
- **Status:** erledigt am 20.11.2026

### Task 12 — KI-Bedienung, simuliert

- **Deckt ab:** AC-040 bis AC-043
- **Berührt:** `apps/app/src/features/assistant/`, `packages/api` (Beispielantworten)
- **Status:** erledigt am 20.11.2026

### Task 13 — Rundgang als Test und Video

- **Deckt ab:** AC-044, AC-045; sammelt die Schritte aller vorigen Aufgaben
- **Berührt:** `e2e/`, `package.json` (`pnpm e2e`, `pnpm demo:video`), `.github/workflows/ci.yml`
- **Status:** erledigt am 20.11.2026

### Task 14 — Unit-Tests, Prüfen und Feinschliff

- **Deckt ab:** alle
- **Inhalt:** Unit-Tests für `packages/core`, `packages/api` und die Kontraste; `/ui-verify` in drei Breiten, Design-Kritik, Barrierefreiheit (Tastatur, Kontraste,
  Beschriftungen), Prüfung auf dem iPhone durch Enrico
- **Status:** teilweise erledigt: Unit-Tests, Kontraste und Screenshot-Durchlauf fertig; Design-Kritik (`impeccable`), Tastatur-Prüfung und iPhone-Test durch Enrico offen

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

Stand 20.11.2026, Commit nach `af55169`.

- [x] Jedes umsetzbare AC hat einen Test (Tabelle in `spec.md`, Abschnitt „Rückverfolgbarkeit“).
      **Abweichung von „rot zuerst“:** Enrico wollte die Tests bewusst erst nach der fertigen App.
      Ersatz: Jede Unit-Testdatei wurde einmal gegen absichtlich kaputten Code rot gesehen; dabei
      fanden sich zwei echte Fehler (Google-Host-Prüfung in `parseMapsLink`, Kontrast des
      Assistent-Knopfs in „Frisch“ dunkel), beide behoben. Der Rundgang wurde gegen eine
      absichtlich kaputte Kopie geprüft (AC-045). `spec-auditor` ist noch nicht gelaufen.
- [x] `pnpm format:check && pnpm check && pnpm build:web` grün: 339 Unit-Tests (core 178,
      api 55, ui 106).
- [x] Rundgang `pnpm e2e` grün: 74 bestanden, 17 je Breite übersprungen (Handy 390 px, Desktop
      1440 px), zweimal hintereinander. Video: `pnpm demo:video` → `tmp/demo/rundgang.webm` und
      `tmp/demo/rundgang-desktop.webm`.
- [~] `/ui-verify`: Screenshot-Durchlauf aller 16 Bildschirme in 390/820/1440 px, alle drei Themes
  hell und dunkel, ohne Konsolenfehler und ohne seitliches Überlaufen. Behoben: abgeschnittener
  Knopf „Auf die Einkaufsliste …“ auf dem Handy. Bewusst gelassen: Stift-Symbol je Zutat
  (macht den Einkaufs-Zusatz auffindbar). Offen: `impeccable`-Kritik, Tastaturbedienung.
- [ ] Auf dem iPhone in Safari geprüft (Enrico).
- [x] Glossar und Rückverfolgbarkeitstabelle aktuell.

Bekannte Abweichungen zwischen AC und Beispieldaten, im Test berücksichtigt:

- AC-029: „Milch“ steht in den Beispieldaten schon mit 2× (1× von Hand, 1× aus der Lasagne);
  der Test stellt die Ausgangslage „1×“ im Haushalt „Test“ her.
- AC-033: auf „Geschenkpapier“ umgestellt (siehe Spec).
- Rundgang mit fester Uhrzeit (Montag, 16.11.2026, 12 Uhr), damit Wochentage aus den AC stabil sind.
