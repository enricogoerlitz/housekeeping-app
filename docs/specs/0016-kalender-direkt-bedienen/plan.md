# Plan 0016 — Kalender direkt bedienen

Spec: `docs/specs/0016-kalender-direkt-bedienen/spec.md` (8 REQ, 34 AC). Branch
`feat/0016-kalender-direkt-bedienen`. Baut auf Spec 0018 auf (K-03 in `entry-sheet.tsx`, Texte in
`absence-sheet.tsx`). Keine Datenbank-Änderung: Verschieben nutzt `movePlanEntry`, das schon heute
`sort` ans Ende der Art setzt; Reisen nutzen `saveAbsences`.

## Entscheidungen

1. **Eigene Zieh-Logik statt react-native-gesture-handler** (Spec, Offene Frage 7). Ziel ist die PWA
   (nur PWA, keine nativen Apps). Das schwierige Stück im iPhone-Web (Halten, ohne dass die Seite
   scrollt, Text markiert wird oder das Kontextmenü kommt) braucht ohnehin eigene Pointer-Logik.
   Keine neue Abhängigkeit.
2. **Aufbau** in `packages/ui/src/drag-drop.tsx`: ein `DragProvider` hält Fingerposition, Ziel und
   Phase in Reanimated-Shared-Values; ein einziges schwebendes Bild (`DragGhost`) mit dem Ziel-Text
   vom Feature und eine einzige Hervorhebung über dem Ziel, damit die Felder beim Ziehen nicht neu
   zeichnen. `useDragSource` je Plattform:
   - Web (`drag-source.web.ts`): Pointer-Events am DOM-Knoten. Maus: Ziehen ab 4 px. Finger:
     Abheben nach 400 ms Halten ohne mehr als 8 px Bewegung, bis dahin `touch-action: pan-y`
     (Wischen scrollt, AC-004); danach unterdrückt ein `touchmove`-Listener mit `passive: false`
     das Scrollen; `-webkit-touch-callout: none`, `user-select: none`, `contextmenu` abgefangen;
     der Klick nach einem Ziehen wird verschluckt.
   - Nativ (`drag-source.native.ts`): `PanResponder` wie `reorder-list.tsx` mit Halte-Zeitmesser;
     beim Abheben schaltet ein Scroll-Regler im `PageScrollContext` das Scrollen ab.
3. **Ziele** melden sich mit Kennung und Ref an. Gemessen wird nur beim Abheben, nach dem Blättern
   und nach automatischem Scrollen (`measureInWindow`): in der Woche jedes Feld, in Monat und Jahr
   je Monat ein Rechteck, der Tag wird berechnet (12 statt 365 Messungen).
4. **Ränder:** oben und unten 64 px Mitscrollen (rAF); links und rechts Zonen mit ‹ › mindestens
   20 px vom Bildschirmrand (Zurück-Geste), blättern nach 600 ms, dann alle 900 ms.
5. **Abbrechen:** ohne Ziel loslassen, Escape, zweiter Zeiger, Android-Zurück, Übernahme durch einen
   ScrollView. Bei „Bewegung reduzieren“ keine Rückgleit-Animation.
6. **Tages-Fenster** ist ein neues, nicht-modales Fenster in `packages/ui`
   (`docked-panel.tsx`): unten halbe Höhe, ganze Höhe oder eine Zeile; ab 700 px rechts. Der
   vorhandene `Sheet` (RN-Modal) sperrt alles darunter und passt deshalb nicht.
7. **„Anderes Datum …“** nutzt einen neuen `MonthCalendar` in `packages/ui` (Felder mindestens
   44 pt, gesperrte Tage, Pfeiltasten überspringen sie); `RangeCalendar` im Reise-Fenster wird
   darauf umgestellt. Die 14-Tage-Grenze `PLAN_AHEAD_DAYS` beim Einplanen entfällt.
8. **Keine Weiterleitung** von `/abwesenheiten` und `/kalender/urlaub/<id>` (Spec REQ-008).
9. **Reste vormerken** erlaubt (Spec, Offene Frage 6).
10. **Tages-Fenster rechts erst ab 1100 px** (Spec, Offene Frage 8): Tablets (700–1099 px) bekommen
    das Fenster unten wie am Handy. Im iPad-Hochformat (768–820 px) blieben neben Seitenleiste
    (256 px) und Fenster (320 px) nur 120–250 px fürs Raster. `panelPlacement` in
    `docked-panel-state.ts`. Solange das Fenster unten offen ist, bekommt die Seite so viel Platz an
    ihrem Ende, wie es verdeckt (`Screen` über `AsideInsetContext`), und der Assistent-Knopf weicht
    (`useHideAssistantButton`). Öffnen und Tageswechsel werden dem Screenreader angesagt
    („Tages-Fenster, Freitag, 27. November“).

## Logik in `packages/core` (rein, mit Tests)

- `plan-move.ts` (neu): `moveBounds` (Reste-Regel: Gericht vor seinen Resten, Reste höchstens
  7 Tage danach), `dropOutcome` (`same` · `blocked(reason)` · `move{date, slotId}`; Woche bestimmt
  die Tageszeit, Monat, Jahr und „Vorgemerkt“ behalten sie), `isSelectableMoveDay`,
  `moveTargetLabel`, `moveToastText` (mit Jahr, wenn nicht das laufende; „Lasagne vorgemerkt“;
  „· Nadja ist dann auf Reise“), `blockedText`, `travellersOn`.
- `calendar.ts`: `dragRange`, `rangeLabel` („Mo 7.12. – Fr 11.12. · 5 Tage“), `daySheetContent`,
  `switchView` mit gewähltem Tag, `monthPickerStart`, `dayA11yLabel` (aus `month-view.tsx`).
- `absences.ts`: Texte „unterwegs“ statt „abwesend“.
- `packages/ui` (reine Geometrie und Zustände, ohne Texte): `drop-targets.ts` (`hitTest`,
  `gridCellAt`), `drag-gesture-state.ts`, `edge-pager.ts`, `month-calendar-nav.ts`.

Testnamen beginnen mit dem AC, z. B. `it('AC-015: dish with leftovers on Fri cannot go to Fri–Sun')`.

## Aufgaben

| #   | Inhalt                                                                                                                                  | ACs                                                       | parallel zu |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------- |
| 1   | Logik in core (`plan-move.ts`, `calendar.ts`, `absences.ts`)                                                                            | 003, 007, 011, 013, 015, 016, 019, 021, 022, 026–029, 033 | 2           |
| 2   | Reine Logik in ui (`drop-targets`, `drag-gesture-state`, `edge-pager`, `month-calendar-nav`)                                            | 003, 004, 009, 021                                        | 1           |
| 3   | „Reise“ statt „Abwesenheit“: Texte, Routen `/reisen`, `/kalender/reise/[id]`, Glossar, e2e                                              | 033, 034                                                  | 4–6         |
| 4   | `MonthCalendar`, `RangeCalendar` darauf umstellen                                                                                       | 019, 021                                                  | 3, 5, 6     |
| 5   | Zieh-Grundlage und Scroll-Regler (`drag-drop.tsx`, `drag-source.{web,native}.ts`, `shell.tsx`)                                          | 001–005, 009 (Grundlage)                                  | 3, 4, 6     |
| 6   | Nicht-modales Fenster `docked-panel.tsx`                                                                                                | 022, 024 (Grundlage)                                      | 3, 4, 5     |
| 7   | „Anderes Datum …“ im Eintragsfenster und bei „Einplanen“, `useMoveEntry` (Hinweis, Rückgängig, Reise-Hinweis)                           | 014, 016, 018–021                                         | 8           |
| 8   | Tages-Fenster in Monat und Jahr (ersetzt Tagesliste, `DayMore`, Sprung in den Monat)                                                    | 022–027, 032                                              | 7           |
| 9   | Einträge ziehen: Woche, Monat, Jahr, aus dem Tages-Fenster, Leiste „Vorgemerkt“, Ränder                                                 | 001–018                                                   | —           |
| 10  | Reise durch Ziehen über Tage (`AbsenceSheet` mit `initialRange`, Fokus in „Notiz“)                                                      | 028–031                                                   | —           |
| 11  | Abschluss: Playwright `rundgang-kalender-ziehen` (Handy und Desktop), `/ui-verify`, `review-animations`, Barrierefreiheit, spec-auditor | alle                                                      | —           |

Der Finger-Fall im Web wird in Playwright über CDP (`Input.dispatchTouchEvent`) geprüft; die
iPhone-Fälle (Markieren, Kontextmenü, Zurück-Geste) zusätzlich als Handtest auf dem echten iPhone mit
installierter Web-App (Enrico).

## Risiken und Gegenmaßnahmen

| Risiko                                                         | Gegenmaßnahme                                                                                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Viele Felder messen kostet Zeit                                | nur beim Abheben messen, Monat und Jahr über das Monats-Rechteck; ein Bild, eine Hervorhebung                                                  |
| Pointer-Events im iPhone-Web                                   | Zieh-Logik je Plattform getrennt; Pflicht-Handtest auf dem iPhone                                                                              |
| Konflikt mit dem Scrollen                                      | bis zum Abheben `pan-y`, danach `preventDefault` bzw. Scroll-Regler; Übernahme = Abbruch                                                       |
| Blättern während des Ziehens                                   | Kennung des Ziels bleibt, gemessen wird erst nach dem neuen Layout                                                                             |
| Überschneidung mit 0018                                        | Tasks 3, 7 und 10 erst nach dem Merge von 0018 und einem Rebase                                                                                |
| Routen umbenennen                                              | typisierte Routen neu erzeugen; `Tabs.Screen`, `manage-entries`, Parameter `von` mit anpassen; e2e prüft „Nicht gefunden“ für `/abwesenheiten` |
| Verschieben bricht die Reste-Regel bei gleichzeitiger Änderung | Prüfung auf dem Gerät; ein so entstandener Verstoß bleibt sichtbar und korrigierbar (Spec, Offline und Konflikte)                              |

## Nachweis

- [ ] Je AC ein Test, der rot war und jetzt grün ist, oder ein Klick- bzw. Gerätebeleg
- [ ] `pnpm format:check && pnpm check && pnpm build:web` grün
- [ ] `pnpm e2e` und `pnpm e2e:dev` lokal grün
- [ ] `/ui-verify` (Handy, Tablet, Desktop, hell und dunkel), `review-animations`
- [ ] Handtest iPhone-PWA: Halten, Ziehen, Rand, Reise ziehen (Enrico)
- [ ] spec-auditor ohne fehlende AC
