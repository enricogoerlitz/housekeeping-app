---
status: umgesetzt
datum: 2026-11-27
---

# 0054 — Einheitliche Bedienmuster

**Quelle:** Enricos Review 0004 (27.11.2026): „kein Dropdown NEU mehr“, „das ⋯-Menü hat zu viele
Einträge … ÜBERALL prüfen“, „Kalender: die drei Punkte ganz weg … Haushaltszeile immer
eingeblendet“, „Einheitliche Muster: absolut vereinheitlichen“; UI/UX-Review vom 27.11.2026,
Befund 5 und Abschnitt „Farbe / Akzent“ (`tmp/feature-review/04-ui-ux.md`). **Kritischer Pfad:**
nein (nur Oberfläche; Löschen bleibt derselbe Weg mit derselben Rückfrage).

## Ziel

Anlegen, Bearbeiten, Löschen und Fenster sehen überall gleich aus und stehen an derselben Stelle,
damit Enrico und Nadja die Bedienung nur einmal lernen. Ein ⋯-Menü enthält nur, was nicht schon
sichtbar auf der Seite steht. Der Kalender hat kein ⋯ mehr und zeigt die Haushaltszeile immer.
Terrakotta (der Akzent) steht nur noch an der Hauptaktion, nicht an „Verlassen“ oder „Löschen“.

## Nicht-Ziele

- Kein neues Detailseiten-Gerüst für Rezept, Restaurant und Aktivität (UI/UX-Befund zur
  Restaurantseite) und keine neue Kopfzeile mit zusammengelegtem Avatar (Befund 2, „Navigation
  bleibt so“).
- Nichts im Körper der Rezeptseite (Aktionen, „+ Zutat“, Galerie, Abschnitts-Stifte, ⋯ der
  Zutaten-, Schritt-, Link- und Inhaltszeilen): Spec 0056. Keine KI-Fenster: Spec 0055. Keine
  Übersicht und Tab-Leiste: Spec 0057. Keine Theme-Farben: Spec 0058.
- Kein Umfärben aller Akzent-Links und gewählten Chips (Befund „Farbe / Akzent“ im Ganzen); nur
  zerstörende Aktionen verlieren den Akzent.
- Keine Änderung an Daten, Synchronisation oder Rechten.

## Anforderungen

### Anlegen

**REQ-001 — Ein Anlegen-Knopf je Seite.** Eine Seite, auf der man etwas anlegt, hat oben rechts in
der Kopfzeile den Baustein `CreateButton`: am Handy ein „+“ ohne Kreis (Name „‹Ding› anlegen“), ab
Tablet ein gefüllter kleiner Knopf „+ ‹Ding› anlegen“. Offline ist er ausgegraut mit dem Grund.
Der leere Zustand behält seinen eigenen ersten Schritt. Gilt für Essen (beide Tabs), Haushalt,
Artikel, Aktivitäten, Reisen („Reise eintragen“), Märkte & Bereiche (je Tab „Markt anlegen“ bzw.
„Bereich anlegen“) und Reisetaschen. Quelle: Review 0004, Befund 5. Offline: offline lesend
(Anlegen ist ein Schreiben).

- AC-001: Angenommen ein Handy (390 px) · Wenn `CreateButton` mit „Rezept anlegen“ steht · Dann ist
  es ein Symbol-Knopf „+“ mit dem Namen „Rezept anlegen“ und ohne sichtbaren Text
- AC-002: Angenommen ein Desktop (1440 px) · Wenn `CreateButton` mit „Rezept anlegen“ steht · Dann
  ist es ein gefüllter Knopf mit „+“ und dem Text „Rezept anlegen“
- AC-003: Angenommen offline · Wenn ich `CreateButton` drücke · Dann passiert nichts und der Knopf
  sagt den Grund („Offline – …“)
- AC-004: Angenommen „Märkte & Bereiche“ am Desktop · Wenn ich vom Tab „Märkte“ zu „Bereiche“
  wechsle · Dann heißt der Knopf oben „Bereich anlegen“ statt „Markt anlegen“, und unter den
  Listen steht kein zweiter Anlegen-Knopf mehr

**REQ-002 — Essen ohne „+ Neu ▾“.** Im Tab „Rezepte“ öffnet „+“ direkt das Fenster „Neu“ mit
„Rezept“ vorgewählt (dort bleibt die Wahl „Rezept · Sammlung“); im Tab „Restaurants“ öffnet „+“
direkt „Restaurant anlegen“. Das Menü „Rezept · Sammlung · Restaurant“ entfällt am Handy und am
Desktop. Quelle: Review 0004. Offline: offline lesend.

- AC-005: Angenommen Essen → Rezepte · Wenn ich „Rezept anlegen“ drücke · Dann öffnet sich sofort
  das Fenster „Neu“ mit „Rezept“ gewählt, ohne Menü dazwischen
- AC-006: Angenommen das Fenster „Neu“ aus AC-005 · Wenn ich „Sammlung“ wähle, einen Titel tippe
  und anlege · Dann entsteht eine Sammlung
- AC-007: Angenommen Essen → Restaurants · Wenn ich „Restaurant anlegen“ drücke · Dann öffnet sich
  sofort das Fenster „Restaurant anlegen“ mit dem Cursor im Namen

### ⋯-Menüs

**REQ-003 — ⋯ ohne Doppelungen.** Ein ⋯-Menü enthält nur Aktionen, die nicht schon sichtbar auf
der Seite stehen; „Löschen“ steht immer als letzter Eintrag. Ein Menü ohne Einträge entfällt. Ein
Menü mit nur „Löschen“ bleibt ein ⋯ (Entscheidung 2). Quelle: Review 0004. Offline: unverändert.

| Seite / Ort              | vorher                                                                   | nachher                                        |
| ------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------- |
| Rezept                   | Teilen · Zu Sammlung hinzufügen · Foto ändern · Foto entfernen · Löschen | Zu Sammlung hinzufügen · Löschen               |
| Sammlung                 | Teilen · Foto ändern · Foto entfernen · Löschen                          | Löschen                                        |
| Restaurant               | Teilen · Löschen                                                         | Löschen                                        |
| Aktivität                | Teilen · Löschen                                                         | Löschen                                        |
| Kalender                 | Haushalt-Zeile ein-/ausblenden · Reise eintragen · Reisen                | entfällt (REQ-004)                             |
| Einkaufsliste            | Erledigt leeren · Liste leeren … · Märkte & Bereiche · Artikel           | unverändert (nichts davon steht auf der Seite) |
| Einkaufen, Zeile         | Liegt woanders …                                                         | unverändert (Entscheidung 3)                   |
| Reise-Fenster            | Für die Rückreise zurücksetzen · Reise löschen                           | unverändert                                    |
| Reise-Fenster, Tasche    | Alles einpacken · Aus der Packliste entfernen                            | unverändert                                    |
| Reise-Fenster, Packstück | Bearbeiten · Entfernen                                                   | unverändert (Entscheidung 3)                   |
| Reisetasche              | Duplizieren · Löschen                                                    | unverändert                                    |
| Markt                    | Als Standard · Markt löschen …                                           | unverändert                                    |
| Bereich, Zeile           | Umbenennen · Zusammenlegen mit … · Löschen …                             | unverändert                                    |
| Feedback, Eintrag        | Bearbeiten · Löschen                                                     | unverändert                                    |

„Teilen“ und „Foto ändern“ stehen unter dem Foto, „Foto entfernen“ im Fenster „Foto“ (Spec 0039).
Haushalt, Mitglieder, Einstellungen und Verwalten haben kein ⋯.

- AC-008: Angenommen das Rezept „Lasagne“ mit eigenem Foto · Wenn ich ⋯ öffne · Dann stehen dort
  genau „Zu Sammlung hinzufügen“ und „Löschen“, und „Teilen“ und „Foto ändern“ stehen unter dem
  Foto
- AC-009: Angenommen eine Sammlung, ein Restaurant und eine Aktivität · Wenn ich jeweils ⋯ öffne ·
  Dann steht dort nur „Löschen“, und „Löschen“ fragt wie bisher erst nach
- AC-010: Angenommen das Rezept aus AC-008 · Wenn ich „Foto ändern“ unter dem Foto drücke · Dann
  steht im Fenster „Foto“ weiter „Foto entfernen“

**REQ-004 — Kalender ohne ⋯, Haushaltszeile immer.** Im Kalender entfällt ⋯ samt „Reise
eintragen“ und „Reisen“. Die Haushaltszeile steht in Woche und Monat immer (im Jahr wie bisher die
Punkte); der Schalter und der gespeicherte Wert `householdRow` auf dem Gerät entfallen. Eine Reise
trägt man weiter über das Ziehen über Tage, das Tages-Fenster und „Verwalten → Reisen“ ein.
Quelle: Review 0004. Offline: offline vollständig (nur Lesen).

- AC-011: Angenommen der Kalender in Woche, Monat und Jahr, am Handy und am Desktop · Wenn ich die
  Kopfzeile ansehe · Dann gibt es kein ⋯
- AC-012: Angenommen die wöchentliche Aufgabe „Bad putzen“ ist am Montag fällig · Wenn ich den
  Monat öffne · Dann steht sie ohne weiteres Zutun in der Haushaltszeile bzw. als Punkt „Aufgabe“
- AC-013: Angenommen auf dem Gerät ist von früher `householdRow: { week: false }` gespeichert ·
  Wenn ich die Woche öffne · Dann steht die Haushaltszeile trotzdem da

### Bearbeiten und Löschen

**REQ-005 — Bearbeiten über den Stift oben.** Eine Detailseite bearbeitet man über den Stift in
der Kopfzeile. Auf der Restaurantseite entfällt „Notiz bearbeiten“ an einer vorhandenen Notiz;
„Notiz hinzufügen“ bei leerer Notiz bleibt als erster Schritt. Quelle: Befund 5. Offline: offline
lesend.

- AC-014: Angenommen ein Restaurant mit Notiz · Wenn ich die Seite ansehe · Dann steht am Abschnitt
  „Notiz“ kein „Notiz bearbeiten“, und der Stift oben öffnet „Restaurant bearbeiten“
- AC-015: Angenommen ein Restaurant ohne Notiz · Wenn ich „Notiz hinzufügen“ drücke · Dann öffnet
  sich „Restaurant bearbeiten“ mit dem Cursor in „Notiz“

**REQ-006 — Kein Mülleimer in der Zeile.** Löschen steht nie als Mülleimer direkt in einer
Listenzeile: auf einer Detailseite im ⋯, in einem Fenster als letzter Knopf, in einer Liste per
Wischen und im ⋯ der Zeile. Auf „Reisen“ entfällt der Mülleimer; gelöscht wird im Reise-Fenster
über ⋯ → „Reise löschen“ mit der bisherigen Rückfrage. Quelle: Befund 5. Offline: offline lesend.

- AC-016: Angenommen „Reisen“ mit der Reise „Ostsee“ · Wenn ich die Liste ansehe · Dann hat die
  Zeile keinen Lösch-Knopf
- AC-017: Angenommen die Reise „Ostsee“ ohne Packliste · Wenn ich die Zeile antippe, ⋯ → „Reise
  löschen“ wähle und bestätige · Dann ist sie weg; mit „Abbrechen“ bleibt sie

### Fenster und Akzent

**REQ-007 — Ein Fensterkopf für Entscheidungen.** Ein Fenster, in dem man etwas bestätigt
(Formular oder Rückfrage), zeigt am Handy oben „Abbrechen · Titel · benannter Hauptknopf“ und ab
Tablet beide Knöpfe unten (Spec 0032, REQ-003). Ein Fenster nur zum Auswählen oder Ansehen hat
Titel und ✕. Jedes Fenster hat ein sichtbares Schließen. Umgestellt werden die Rückfragen
(`ConfirmDialog`, „Einkaufsliste leeren?“, „Zusammenführen“, „Haushalt löschen“) und
„Mitteilungen“ (links „Schließen“). Quelle: Befund 5. Offline: unverändert.

- AC-018: Angenommen ein Handy · Wenn die Rückfrage „Reise löschen?“ offen ist · Dann steht oben
  links „Abbrechen“, in der Mitte „Reise löschen?“, rechts „Löschen“, und es gibt kein ✕
- AC-019: Angenommen ein Handy · Wenn „Mitteilungen“ offen ist · Dann steht oben links
  „Schließen“, und es schließt das Fenster
- AC-020: Angenommen ein Desktop · Wenn „Einkaufsliste leeren?“ offen ist · Dann stehen unten
  „Abbrechen“ und „Liste leeren“

**REQ-008 — Akzent nur für die Hauptaktion.** Zerstörende oder verlassende Text-Knöpfe sind nicht
im Akzent, sondern in Tinte (`Button variant="link" quiet`): „Verlassen“, „Entfernen“,
„Zurückziehen“ bei den Mitgliedern, „Löschen“ im Fenster einer Aufgabe und bei den Arten der
Aktivitäten, „Foto entfernen“ im Formular-Foto. Quelle: Abschnitt
„Farbe / Akzent“. Offline: unverändert.

- AC-021: Angenommen ein Text-Knopf mit `quiet` · Wenn er gezeichnet wird · Dann hat sein Text die
  Farbe `text`, ohne `quiet` die Farbe `accent`
- AC-022: Angenommen die Mitgliederliste · Wenn ich „Verlassen“ ansehe · Dann ist es nicht in der
  Akzentfarbe

**REQ-009 — Die Regeln stehen in DESIGN.md.** `docs/design/DESIGN.md` bekommt eine Muster-Tabelle
für Anlegen, Bearbeiten, Löschen, ⋯, Fensterköpfe und Akzent; `CreateButton` und `quiet` stehen
bei den Bausteinen. Quelle: Auftrag. Offline: entfällt.

- AC-023: Angenommen DESIGN.md · Wenn man „Bedienmuster“ liest · Dann stehen dort die Regeln aus
  REQ-001 bis REQ-008

## Entscheidungen

1. **Desktop-Knopf „‹Ding› anlegen“, gefüllt.** So heißt er schon bei Haushalt und Aktivitäten
   (Review 0003); Anlegen ist auf einer Listenseite die Hauptaktion, also Akzent. Reisen sagen
   „eintragen“ wie bisher. `CreateButton` liegt in `packages/ui`, weil er nur Bausteine und die
   Breite kennt.
2. **Nur „Löschen“ bleibt im ⋯.** Ein sichtbarer Lösch-Knopf oben wäre ein Fehltipp-Risiko, und
   Löschen steht so auf jeder Detailseite an derselben Stelle.
3. **Zeilen-Menüs bleiben.** „Liegt woanders …“ als sichtbarer Knopf an jeder Zeile im
   Einkaufsmodus wäre zu voll; „Bearbeiten“ beim Packstück ist für Screenreader der benannte Weg
   zum selben Fenster wie der Tipp auf die Zeile.
4. **Ersetzt:** Spec 0023, REQ-011/AC-045 (Menü „Neu“ mit drei Arten) und Spec 0008, AC-003 (ein
   „+“ für beide Tabs); Spec 0008, AC-020 und Spec 0036, AC-019 („Foto ändern/entfernen“ im ⋯);
   Spec 0042, REQ-004 und Spec 0047, REQ-001 nur für „Teilen“ im ⋯ (das Symbol am Foto bleibt);
   Spec 0010, D18 und Spec 0021, REQ-017 (Schalter der Haushaltszeile; Monat jetzt immer an);
   Spec 0031, REQ-036 nur für den Weg „Kalender → Reisen“; der Mülleimer der Reisen-Zeile (Spec
   0022/0030); Spec 0032, REQ-003 gilt jetzt auch für Rückfragen.
5. **Rückfragen bekommen den Fensterkopf.** Eine Regel für alles, was man bestätigt, statt einer
   dritten Anordnung; die Test-IDs `…-confirm` und `…-cancel` bleiben.
6. **`quiet` statt neuer Farbe.** Kein Rot (DESIGN.md, Grundsatz 3) und kein Orange (das heißt
   „Hinweis“); Tinte ist ruhig und trotzdem lesbar. Die API von `Button` bleibt rückwärtskompatibel.
7. OFFEN: Sollen „Märkte & Bereiche“ und „Artikel“ im ⋯ der Einkaufsliste wie „Reisen“ im Kalender
   entfallen? Sie stehen nicht auf der Seite (nur hinter ⊞), daher bleiben sie, bis Enrico es sagt.
8. **„Rezept löschen?“ mit Zutaten auf der Liste bleibt, wie es ist.** Drei Antworten („Zutaten auch
   von der Liste nehmen“, „Nur löschen“, „Abbrechen“) passen nicht in einen Kopf; sie stehen
   untereinander unten. So steht es als Ausnahme in DESIGN.md.
9. **Abgrenzung:** „Foto entfernen“ im Fenster „Foto“ (`photo-window.tsx`, Spec 0055) bleibt im
   Akzent, und der Kommentar „which the ⋯ menu opens too“ in `recipe-cover.tsx` (Spec 0056) bleibt
   stehen; beides räumen die jeweiligen Specs mit auf. Hier wird in `photo-window.tsx` nur der nicht
   mehr genutzte Export von `confirmPhotoRemoval` entfernt.
10. **Reisen-Zeile ohne eigene Knöpfe:** Ohne Mülleimer ist die ganze Zeile der Knopf; ihre Test-ID
    ist jetzt `trip-<id>` statt `trip-<id>-open` (e2e angepasst).
11. Durchklick 27.11., I-04: Ein Titel im Fensterkopf geht schon auf eine eigene Zeile, wenn er nur
    bis auf 2 px passen würde: die Knöpfe werden in ganzen Pixeln gemessen, „Änderungen verwerfen?“
    wurde sonst zu „Änderungen verwerfe…“ (`titleOnOwnLine`). D-07: Hat ein Textfeld den Cursor,
    zeigt kein Knopf einen Fokusring (vorher trugen ✕ und „Abbrechen“ einen alten Fokus mit,
    `keyboardFocused`). Durchklick 27.11., Dauerposten: Das Fenster „Neuer Dauerposten“ hat wie jedes
    Formular „Abbrechen · Speichern“, ab Tablet unten nebeneinander.
12. Nachklick 27.11., N-14: Die Fläche hinter einem Fenster (Scrim) zeigt keinen Fokusrahmen.
    Das Modal gibt ihr beim Öffnen per Tastatur (Escape auf „Neu“ → Rückfrage) den Fokus; der
    Browser-Rahmen lag dann um die ganze Seite.

- **Nachklick 27.11. (Koordinator):** Leere Zustände von Artikeln und Aufgaben haben keinen zweiten
  „… anlegen“-Knopf mehr, er steht schon im Kopf (wie N-11 bei den Dauerposten); bei den Aufgaben
  bleiben die Vorlagen („Nehmt eine Vorlage oder legt eine eigene Aufgabe an.“). Eine Sammlung ohne
  etwas zu kaufen zeigt „Auf die Liste“ nicht (wie N-03 bei Rezepten); ändert hier die Ausnahme
  „leere Zustände behalten ihren eigenen ersten Schritt“.

## Daten

Keine Schema-Änderung. Auf dem Gerät entfällt der Wert `householdRow` in
`housekeeping.settings.v1`; ein alter Wert wird beim Lesen ignoriert und beim nächsten Speichern
nicht mehr geschrieben.

## Umsetzung

- [x] 1. Rot: Vitest für `CreateButton` (AC-001–AC-003) und `Button quiet` (AC-021); dann bauen
- [x] 2. `CreateButton` auf allen Seiten aus REQ-001, Essen ohne `FoodNewMenu` (AC-004–AC-007)
- [x] 3. ⋯ von Rezept, Sammlung, Restaurant, Aktivität (AC-008–AC-010)
- [x] 4. Kalender ohne ⋯, `householdRow` raus aus Einstellungen und Ansichten (AC-011–AC-013)
- [x] 5. Restaurant-Notiz, Reisen ohne Mülleimer (AC-014–AC-017)
- [x] 6. Fensterköpfe der Rückfragen und Mitteilungen (AC-018–AC-020), `quiet` (AC-022)
- [x] 7. DESIGN.md „Bedienmuster“, Showroom (AC-023)
- [x] 8. e2e `e2e/rundgang-bedienmuster-0054.spec.ts`; bestehende e2e auf die neuen Wege angepasst
      (läuft beim Koordinator)
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün; Screenshots Desktop
      1440×900 und Handy 390×844 in `tmp/review-0004/0054/`

## Nachweis

- Rot (27.11.2026): `packages/ui/src/create-button.test.tsx` — 4 von 4 rot (AC-001–AC-003: kein
  Knopf gefunden; AC-021: `rgb(180, 65, 31)` statt `rgb(43, 33, 25)`); danach 4 von 4 grün.
- `pnpm format:check && pnpm check` grün (Lint, Typen inkl. e2e, Unit-Tests, knip); `pnpm build:web`
  grün.
- Eigener Dev-Server, Desktop 1440×900 und Handy 390×844 angesehen: Essen mit „Rezept anlegen“ und
  Fenster „Neu“, Restaurants, ⋯ der Rezeptseite, Kalender Woche/Monat ohne ⋯ mit Haushaltszeile,
  Reisen ohne Mülleimer, „Reise löschen?“ mit Fensterkopf, Mitteilungen mit „Schließen“, Mitglieder
  in Tinte, Märkte/Bereiche/Reisetaschen/Artikel/Haushalt mit `CreateButton`.
- e2e geschrieben, nicht ausgeführt (setzt die Datenbank zurück): läuft beim Koordinator.
