---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
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

**REQ-002 — Gerichtart auf der Rezept-Kachel** (Nachtrag 27.11., Enricos Wunsch). In der Ansicht
„Kacheln“ zeigt jede Rezept-Kachel ihre Gerichtart („Hauptgericht“, „Beilage“, „Dessert“,
„Frühstück“, „Snack“, „Getränk“) als kleines, ruhiges Kennzeichen; die Liste bleibt, wie sie ist.
Offline: offline vollständig.

- AC-007: Angenommen Rezepte „Kacheln“ · Dann steht auf der Kachel „Mango-Curry“ „Hauptgericht“ und
  auf „Gemischter Salat“ „Beilage“, vor Minuten, Ernährung und Bewertung
- AC-008: Angenommen Rezepte „Kacheln“ · Dann zeigt die Sammlung „Grillabend“ keine Gerichtart (nur
  „Sammlung“ und „2 Rezepte“ wie bisher) · Wenn ich auf „Liste“ umschalte · Dann zeigt kein Eintrag
  eine Gerichtart

## Entscheidungen

1. Enrico, 26.11.: Der Umschalter sind zwei verbundene Symbol-Knöpfe (Raster/Liste) am rechten Ende
   der Zeile „Filter · Sortierung · Favoriten“, auf Handy und Desktop; Beschriftung für Screenreader
   „Kacheln“ / „Liste“.
2. Liste = heutiger Restaurant-Eintrag (Bild 56 px links, Name, eine Zeile Details); Kachel = heutige
   Rezept-Kachel (Bild 4:3). Rezepte bekommen eine Schnellansicht (Adress-Param `rezept`).
3. Gespeichert in `LocalSettings` je Bereich (wie die Sortierung, Spec 0036), nicht synchronisiert.
4. Beim Bau, 26.11.: Die Schnellansicht eines Rezepts schreibt Portionen, Variante und ihre Fenster
   („Einplanen“, „Zur Sammlung“, „Vorratscheck“) wie die eigene Seite in die Adresse von
   `/rezepte` (`rezept`, `portionen`, `variante`, `fenster`); „Essen“ erneut wählen schließt sie.
   Neben der Liste steht das Rezept einspaltig (die Spalte ist zu schmal für zwei).
5. Beim Bau, 26.11.: Öffnen aus einem anderen Bereich (Kalender, Übersicht) folgt der gewählten
   Ansicht: bei „Kacheln“ die eigene Seite, bei „Liste“ am Desktop die Schnellansicht.
6. Beim Bau, 26.11.: Liste ohne geöffneten Eintrag = Raster der Listeneinträge (wie heute bei
   Restaurants), mit geöffnetem Eintrag die schmale Spalte links. Auf dem Handy steht der
   Umschalter ebenfalls am Zeilenende; die Chips davor scrollen seitlich.
7. Browser-Durchklick 27.11. (Review 0003, B-07): Die Liste der Aktivitäten rechnet die Breite
   ihrer Spalten wie die Kacheln aus der gemessenen Breite; vorher (31,8 %) endete die dritte
   Spalte 28 px vor dem rechten Rand.
8. Browser-Durchklick 27.11., Folge (B-15): Karten einer Zeile in der Liste der Aktivitäten
   sind gleich hoch; eine Karte ohne „Zuletzt“-Zeile wächst auf die Höhe der höchsten.

9. REQ-002, beim Bau 27.11.: Die Gerichtart steht als neutrales `Badge` (grau, ohne Symbol, keine
   neue Farbe) als erstes Element der Zeile unter dem Titel, nicht über dem Foto: unten links über
   dem Foto steht das Kennzeichen „Sammlung“, das die Art des Eintrags meint; eine zweite Plakette
   dort würde es verwässern. Die Zeile bricht um, deshalb läuft auch auf dem Handy (zwei schmale
   Spalten) nichts über; die Kachel wird dort eine Zeile höher. Die Regel steht in `core`
   (`tileCourseLabel`): keine Gerichtart bei einer Sammlung oder ohne Gerichtart. Weil die
   Datenbank jedem Rezept eine Gerichtart gibt (Standard „Hauptgericht“), trägt praktisch jede
   Rezept-Kachel eine, auch schnell angelegte Rezepte. Liste und KI-Treffer zeigen sie nicht.

## Daten

Entfällt (lokale Einstellung).

## Risiken

Kein kritischer Pfad. `/security-check` (26.11.): keine Befunde. Gespeicherte Ansicht und die neuen
Adress-Parameter sind Allowlist bzw. Zod-geprüft (`parseListViews`, `Uuid`, `PositiveInt`); die
Schnellansicht liest nur aus dem lokalen Cache.

## Umsetzung

- [x] 1. Baustein Umschalter in `packages/ui` (`ViewSwitch`, Rolle, Name, Zustand getestet;
      `FilterBar.trailing`)
- [x] 2. Einstellung je Bereich (AC-004; `core/list-views.ts`, `LocalSettings.listViews`)
- [x] 3. Rezepte: Liste + Schnellansicht (AC-001, AC-003; Adress-Param `rezept`)
- [x] 4. Restaurants und Aktivitäten: Kacheln (AC-002, AC-005, AC-006)
- [x] 5. Gerichtart auf der Rezept-Kachel (AC-007, AC-008; `tileCourseLabel`, `RecipeCardMeta course`)
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün; Screenshots Handy
      390×844 und Desktop 1440×900 in `tmp/review-0003/0038/` (Klickpfade AC-001 bis AC-006 per
      Playwright gegen den Dev-Server, keine Konsolenfehler). Tests: `list-views.test.ts`
      (AC-001–AC-004), `url-params.test.ts` (Schnellansicht), `view-switch.test.tsx`,
      `filter-bar.test.tsx`.
- [x] Nachweis REQ-002 (27.11.): rot zuerst `recipe-list.test.ts` (AC-007, AC-008: 3 Tests rot,
      `tileCourseLabel is not a function`), danach grün; `pnpm format:check && pnpm check` grün;
      e2e `rundgang-essen.spec.ts` „AC-007 / AC-008 (0038)“ lokal grün (Handy, ohne Zurücksetzen).
      Dev-Server Handy 390×844 und Desktop 1440×900, hell und dunkel: Kennzeichen in allen
      Kacheln, keines in der Liste und bei „Grillabend“, nichts ragt aus einer Kachel, keine
      Seitenfehler.
