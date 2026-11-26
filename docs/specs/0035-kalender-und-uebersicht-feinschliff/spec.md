---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0035 — Kalender und Übersicht: Fehler und Feinschliff

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
K-01 bis K-05, H-02). **Welle 1.** **Kritischer Pfad:** nein.

## Ziel

Eine abgehakte Haushaltsaufgabe lässt sich in Kalender und Übersicht zurücknehmen. Öffne ich aus
dem Kalender eine Aktivität oder ein Restaurant, ist nur dieser Bereich markiert. Die Jahres- und
Monatsansicht nutzen den Platz besser, abgeschnittene Einträge zeigen am Desktop einen Tooltip, und
die Kopfzeile der Übersicht springt nicht mehr.

## Nicht-Ziele

- Keine neue Kalenderansicht, keine Änderung an Woche/Tageszeiten.
- Kein Rückgängig für übersprungene Aufgaben oder für Erledigungen älter als 30 Tage (bleibt im
  Verlauf wie bisher).

## Anforderungen

Haushalt „Enrico & Nadja“, heute ist Donnerstag, 26.11.2026.

**REQ-001 — Erledigung im Kalender und in der Übersicht zurücknehmen.** Ein erledigter Eintrag einer
Aufgabe (✓) in der Haushalt-Zeile des Kalenders und in der Übersicht lässt sich antippen und
zurücknehmen; das entfernt diese Erledigung wie „Entfernen“ im Verlauf (Termin, letzte Erledigung und
Zuständigkeit wie davor). Quelle: K-05. Offline: offline lesend (Schreiben braucht Netz, Hinweis wie
bei allen Schreibaktionen).

- AC-001: Angenommen „Bad putzen“ wurde heute von Enrico erledigt und steht im Kalender mit ✓ · Wenn
  ich den Eintrag antippe und „Zurücknehmen“ wähle · Dann steht „Bad putzen“ wieder offen am heutigen
  Tag, und im Verlauf fehlt die Erledigung
- AC-002: Angenommen dasselbe in der Übersicht unter „Zu tun heute“ · Wenn ich den ✓ antippe · Dann
  wird die Erledigung nach demselben Ablauf zurückgenommen
- AC-003: Angenommen nach der Erledigung von heute gibt es eine jüngere Erledigung derselben Aufgabe
  · Wenn ich die ältere antippe · Dann bietet die App „Im Verlauf öffnen“ statt „Zurücknehmen“
  (Regel „jüngste Erledigung“, Glossar)
- AC-004: Angenommen offline · Wenn ich „Zurücknehmen“ wähle · Dann ist die Aktion deaktiviert mit
  dem Offline-Hinweis

**REQ-002 — Nur der aktuelle Bereich ist markiert.** Öffne ich aus dem Kalender eine Aktivität oder
ein Restaurant, markieren Seitenleiste und untere Leiste den Bereich der geöffneten Seite, nicht
„Kalender“; „Zurück“ führt weiter in den Kalender. Quelle: K-04. Offline: offline vollständig.

- AC-005: Angenommen Desktop, Kalender, Eintrag „Bouldern“ · Wenn ich „Öffnen“ wähle · Dann ist in
  der Seitenleiste nur „Aktivitäten“ markiert · Und „‹ Kalender“ führt zurück zum Kalender
- AC-006: Angenommen Handy, Kalender, Eintrag „AMRIT“ · Wenn ich „Öffnen“ wähle · Dann ist in der
  unteren Leiste „Essen“ markiert · Und „‹ Kalender“ führt zurück
- AC-007: Angenommen ein Rezept aus der Übersicht geöffnet · Dann ist „Essen“ markiert, nicht
  „Übersicht“ (gleiche Regel überall)

**REQ-003 — Jahresansicht nicht auseinandergezogen.** Die Monate der Jahresansicht wachsen nur bis
zu einer Höchsthöhe mit dem Fenster; die Tageszahlen sind etwas größer als heute. Quelle: K-01.
Offline: offline vollständig.

- AC-008: Angenommen Desktop 1440 × 1000 px · Wenn ich „Jahr“ öffne · Dann sind die Zeilen eines
  Monats höchstens 28 px hoch und die Tageszahlen 12 px groß (vorher 36 px und 10 px)
- AC-009: Angenommen ein niedriges Fenster 1440 × 700 px · Dann bleibt die Ansicht wie heute lesbar
  (keine Zeile unter 24 px Trefferfläche)

**REQ-004 — Monatsansicht am Desktop niedriger.** Die Mindesthöhe einer Woche in der Monatsansicht am
Desktop sinkt um etwa 15 %. Quelle: K-02. Offline: offline vollständig.

- AC-010: Angenommen Desktop 1440 × 900 px, Monat Januar 2027 (fünf Wochen, keine Reise) · Dann
  passt der ganze Monat ohne Scrollen auf die Seite (vorher scrollte er; eine Woche ist mindestens
  138 statt 166 px hoch)

**REQ-005 — Tooltip am Desktop.** Verweilt die Maus 500 ms über einem Eintrag im Kalender, dessen
Text abgeschnitten ist, zeigt ein gestalteter Tooltip den ganzen Text (Art, Name, Zusatz, Uhrzeit).
Quelle: K-03. Offline: offline vollständig.

- AC-011: Angenommen Desktop, Woche, Eintrag „Bouldern (Power vs. Balance)“ ist abgeschnitten · Wenn
  die Maus 500 ms darauf ruht · Dann erscheint der Tooltip mit dem ganzen Text
- AC-012: Angenommen der Text ist nicht abgeschnitten · Dann erscheint kein Tooltip
- AC-013: Angenommen Handy · Dann gibt es keinen Tooltip

**REQ-006 — Übersicht: Kopfzeile ohne „Morgen“/„Gestern“.** Die Überschrift zeigt immer nur
Wochentag und Datum. Quelle: H-02. Offline: offline vollständig.

- AC-014: Angenommen heute ist Donnerstag, 26.11. · Wenn ich Freitag, 27.11. wähle · Dann lautet die
  Überschrift „Freitag, 27. November“ und ist auf dem Handy genauso hoch wie am Donnerstag

## Entscheidungen

1. REQ-002: Die Markierung folgt der Seite; `von=kalender` bestimmt nur noch Zurück-Ziel und
   Beschriftung. Ändert Spec 0019 (Markierung nach Herkunft) — AC dort wird angepasst.
   Folge: Eine Seite, die aus einer Detailseite mit `von` geöffnet wird, nennt deren Bereich
   („‹ Essen“ statt „‹ Kalender“ für ein Rezept aus einem Rezept, das aus dem Kalender kam).
2. REQ-003/004: Zahlen am Desktop gemessen (1440 × 700/900/1000) und angepasst. Jahr: Tageszeile
   höchstens 28 px statt 22 px, weil AC-009 mindestens 24 px Trefferfläche verlangt und Zahl
   (12/15 px) plus Punktzeile sonst nicht passen; ein Monat wächst höchstens bis 224 px, darunter
   folgen die Reisen. Monat: mindestens zwei statt drei Einträge plus „+n weitere“ (`MONTH_MIN_LINES`),
   eine Woche ohne Reise 138 statt 166 px (−17 %). AC-010 ging von „November (5 Wochen)“ aus;
   November 2026 hat sechs Wochenzeilen, und 1440 × 800 bräuchte rund −40 %, gegen „nicht viel“
   (Enrico, K-02). Darum misst AC-010 einen Monat mit fünf Wochen bei 1440 × 900.
3. REQ-005: neuer Baustein `useTooltip` in `packages/ui` (nur feiner Zeiger und Web, über
   `TopLayer`), eingebaut in `KindLine` über `tooltip`; der Text kommt aus `lineTooltip` (core).
   Erhöht wirkt er wie das, was beim Ziehen schwebt (`surfaceRaised`, `shadowRaised`). Ein Druck
   oder das Verlassen schließt ihn.
4. REQ-001: Ein Tipp auf ✓ öffnet ein kleines Fenster (`DoneEntrySheet`) mit „Zurücknehmen“ oder
   „Im Verlauf öffnen“ (`choreEventTakeBack`, core) und im Kalender „Aufgabe öffnen“, damit das
   Aufgaben-Fenster weiter erreichbar bleibt. „Zurücknehmen“ nur für die jüngste Erledigung der
   letzten 30 Tage einer bestehenden Aufgabe; sonst „Im Verlauf öffnen“. Die Übersicht zeigt heute
   das heute Erledigte am Ende von „Zu tun“ mit ✓ (wie der Kalender, Spec 0010 AC-018), sonst gäbe
   es dort nichts anzutippen. Das Fenster steht nicht in der Adresse (wie andere kleine Rückfragen).
5. REQ-006: Auch der Wechsel ins nächste Jahr nennt keine Vorsilbe mehr: „Freitag, 1. Januar 2027“.
   Auf 390 und 430 px Breite ist die Überschrift an jedem Tag zweizeilig und gleich hoch (68 px);
   „einzeilig“ aus AC-014 gilt dort nicht, das Springen ist weg.

## Daten

Liest die Erledigungen (`chore_events`); „Zurücknehmen“ nutzt den bestehenden Befehl
`removeChoreEvent`. Keine Schemaänderung.

## Umsetzung

- [x] 1. ✓ in Kalender und Übersicht antippbar, „Zurücknehmen“ über `removeChoreEvent` (AC-001–AC-004)
- [x] 2. `sectionOfPath` nach Seite, Tests in `url-params.test.ts` (AC-005–AC-007)
- [x] 3. Jahresansicht Höchsthöhe und Schrift (AC-008, AC-009)
- [x] 4. Monatsansicht Mindesthöhe (AC-010)
- [x] 5. `Tooltip` + Einsatz im Kalender (AC-011–AC-013)
- [x] 6. `overviewTitle` ohne Vorsilbe (AC-014)
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün; `/ui-verify` Desktop/Handy

## Nachweis

26.11.2026: `pnpm format:check && pnpm check && pnpm build:web` grün (core, ui, api mit Abdeckung
≥ 80 %). Neue Tests: `overview.test.ts` (AC-002, AC-014), `place.test.ts` (AC-005–AC-007),
`chores.test.ts` (AC-001, AC-003), `household-row.test.ts`, `calendar.test.ts` (AC-008, AC-010,
AC-011), `tooltip-position.test.ts` und `tooltip.test.tsx` (AC-011–AC-013). Im Dev-Server
(Playwright, 1440 × 700/900/1000 und 390 × 844) geprüft: Zurücknehmen in Übersicht und Kalender,
offline deaktiviert mit Hinweis, „Im Verlauf öffnen“ öffnet den Eintrag im Verlauf; Aktivität aus
dem Kalender markiert nur „Aktivitäten“, „‹ Kalender“ führt zurück; Restaurant auf dem Handy
markiert „Essen“; Tooltip nach 500 ms nur bei abgeschnittenem Text; Jahr 28 px/12 px, Januar 2027
bei 1440 × 900 ohne Scrollen; Überschrift der Übersicht an jedem Tag gleich hoch.
