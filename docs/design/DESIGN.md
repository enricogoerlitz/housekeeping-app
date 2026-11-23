# DESIGN.md — Gestaltung der Haushalts-App

> Gilt für alle Bildschirme. Umsetzung: `packages/ui` (Tokens und Bausteine), Entscheidung:
> [ADR-0010](../adr/0010-styling-und-themes.md). Entstanden aus den drei Design-Richtungen von
> Spec 0001; Enrico hat alle drei als wählbare Themes übernommen.

## 1. Grundsätze

1. **Eine App, drei Gesichter.** Inhalt, Abläufe und Bausteine sind in allen Themes gleich. Ein
   Theme ändert Farben, Schriften, Rundungen und die Rahmung von Abschnitten und Listen, nie die
   Bedienung.
2. **Zuerst fürs Handy, aber jede Breite ist gestaltet.** Handy (< 700 px): Tab-Leiste unten,
   schwebender Assistent (solange die KI aus ist: ⊞ „Verwalten“ im Kopf). Tablet und Desktop:
   Seitenleiste mit „Verwalten“; der Inhalt beginnt 36 px neben der Seitenleiste und füllt bis
   1320 px, erst darüber wird zentriert. Jeder Bereich hat eine Breite, nie abhängig von Ansicht
   oder Inhalt (Spec 0005, REQ-002).
3. **Ruhe statt Druck.** Kein Rot. Hinweise, Offline und Überfälliges sind orange
   (`warnBg`/`warnText`). Keine Punkte, Serien oder Ranglisten.
4. **Fotos sind die Bühne für Essen**, Symbole für alles andere. Keine Emojis als Symbole.
5. **Nur Tokens.** Feature-Code enthält keine Farbwerte und keine Schriftnamen; die Lint-Regel prüft
   das (Spec 0001, AC-005).

## 2. Themes

| Theme                         | Charakter                                  | Schrift                                                     | Rahmung                                                           | Standard |
| ----------------------------- | ------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------- | -------- |
| **Markthalle** (`markthalle`) | warm, appetitlich, wie ein gutes Kochbuch  | Fraunces (Titel, Rezeptnamen) · Instrument Sans (Bedienung) | feine Linien, Fotos oben auf Karten, Abschnitte ohne Rahmen       | ja       |
| **Klar** (`klar`)             | ruhig, vertraut, wie die Apps des Geräts   | Systemschrift (SF Pro / Roboto / Segoe)                     | gruppierte weiße Karten, Abschnittstitel als graue Großbuchstaben | —        |
| **Frisch** (`frisch`)         | frisch, ruhig, eine Bereichsfarbe je Seite | Bricolage Grotesque (Titel) · DM Sans (Bedienung)           | weiße Kacheln auf warmem Grund, eine Kachel je Listenzeile        | —        |

Jedes Theme gibt es hell und dunkel. Auswahl unter **Einstellungen → Darstellung**; gespeichert wird
nur auf dem Gerät. Ein unbekannter gespeicherter Wert fällt auf „Markthalle“ zurück.

## 3. Farben

Rollen statt Farbnamen. Alle Paare erfüllen WCAG AA (Text ≥ 4,5:1), geprüft per Unit-Test.

| Rolle                                                 | Verwendung                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `bg`                                                  | Seitenhintergrund                                                                                              |
| `surface`                                             | Karten, Listen, Sheets                                                                                         |
| `surfaceSunken`                                       | Eingabefelder (Klar), Platzhalter, Hover                                                                       |
| `surfaceRaised` / `shadowRaised`                      | Was beim Ziehen schwebt; im Dunkeln heller als `surface`, mit Lichtkante                                       |
| `border`                                              | Haarlinien, Kartenränder                                                                                       |
| `text` / `textMuted`                                  | Haupttext / Nebeninformationen                                                                                 |
| `accent` / `onAccent`                                 | Hauptaktionen, aktiver Tab, Links                                                                              |
| `accentSoft`                                          | aktiver Eintrag in der Seitenleiste (in allen Themes)                                                          |
| `success` / `onSuccess`                               | abgehakt, erledigt, Fortschritt                                                                                |
| `switchOff`                                           | Spur eines Schalters „aus“; ≥ 3:1 gegen Seite und Karte, ohne Schatten (Spec 0031, REQ-035)                    |
| `star`, `due`                                         | Bewertungen; Fälligkeitsbalken und Vorlauf-Hinweis                                                             |
| `warnBg` / `warnText`                                 | Offline, „Passt nicht für …“, Fehlermeldungen an Feldern                                                       |
| `barBg`                                               | Tab-Leiste, Seitenleiste, Eingabeleiste                                                                        |
| `fabBg` / `fabText`                                   | Assistent-Knopf (in „Frisch“ Tinte)                                                                            |
| `tones.{essen,plan,liste,haushalt,ki}`                | Bereichsfarben; nur „Frisch“ nutzt sie, siehe unten                                                            |
| `kinds.{recipe,collection,restaurant,activity,chore}` | Arten im Kalender (Spec 0010, D19): nur als 3-px-Kante oder Punkt, nie als Fläche; ≥ 3:1 gegen Seite und Karte |

| Theme      | Hell: Hintergrund · Akzent                   | Dunkel: Hintergrund · Akzent |
| ---------- | -------------------------------------------- | ---------------------------- |
| Markthalle | `#FAF6EE` · `#B4411F` Terrakotta             | `#1B1613` · `#EC8A66`        |
| Klar       | `#F2F2F7` · `#0B7A63` Grün                   | `#000000` · `#30C9A0`        |
| Frisch     | `#FAF8F5` · `#15151B` Tinte, Bereiche farbig | `#111116` · `#F6F5F2`        |

**Frisch ruhiger (Spec 0005, D4):** Je Bildschirm färbt nur die Bereichsfarbe des Bereichs, zu dem
er gehört (`Screen tone`), die Linie unter dem aktiven Ansichts-Tab, den Akzent der Kopfzeile und
den Hauptknopf. Abschnitte haben keine Farbfläche (weiße Kacheln auf `bg`, Titel in Tinte), der
aktive Tab der Tab-Leiste ist eine Tinten-Pille. Höchstens drei Farben gleichzeitig: Tinte, eine
Bereichsfarbe, eine Zustandsfarbe. Seiten unter „Verwalten“ und die Einstellungen haben keine
Bereichsfarbe. Bereichsfarben hell: Essen `#F5E3DB`, Plan `#F3EACB`, Liste `#DCEDE3`, Haushalt
`#E0E5F4`; Sterne `#B8891A`.

Mitgliederfarben (Avatare) kommen aus den Daten, nicht aus dem Theme, und sind dunkel genug für
weiße Initialen.

## 4. Schrift

Textstile sind Rollen (`packages/ui/src/themes/types.ts`): `display`, `title`, `heading`,
`cardTitle`, `rowTitle`, `body`, `reading`, `readingLarge`, `bodyStrong`, `small`, `smallStrong`,
`caption`, `sectionLabel`, `groupLabel`, `button`, `tab`. `reading` (20 pt) und `readingLarge`
(26 pt, ab 1100 px) sind Lesetext aus der Entfernung in der Bedienschrift mit großzügigem
Zeilenabstand, z. B. der Schritt im Kochmodus (Spec 0023, REQ-010).

- Bedienelemente, Beschriftungen und Daten nutzen immer die Bedienschrift, nie die Titelschrift.
- Zahlen in Mengen und Fortschritt mit gleich breiten Ziffern, wo möglich.
- Schriften liegen im App-Paket (`@expo-google-fonts/*`) und werden einmal beim Start geladen
  (die Theme-Vorschau in den Einstellungen braucht alle). Keine Anfrage an Google Fonts oder andere
  fremde Server.

## 5. Form und Abstand

- **Abstände:** Skala `space` = 2 · 4 · 8 · 12 · 16 · 20 · 24 · 32. Seitenrand auf dem Handy 16–20
  (Theme), ab Tablet 36.
- **Rundungen** je Theme: Karte 14 / 14 / 22, Knopf 10 / 12 / Pille, Abhakfeld Kreis / Kreis /
  abgerundetes Quadrat.
- **Tippflächen** mindestens 44 × 44 pt; Listenzeilen mindestens 56 pt hoch.
- **Tiefe:** Schatten nur am Assistent-Knopf, an Sheets und an dem, was beim Ziehen schwebt
  (`shadowRaised`); sonst Flächen und Linien.

## 6. Bausteine

Alle in `packages/ui`; der **Showroom** (`/showroom`) zeigt jeden Baustein mit seinen Zuständen in
allen Themes.

| Baustein                                                                                | Wofür                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Screen`, `ScreenHeader`                                                                | Seitenrahmen: `header` (Titel, Zurück, Aktionen), `tabs` und `toolbar` bleiben oben; auf dem Handy schrumpft der Titel zur schmalen Leiste, die `toolbar` rutscht weg; `tone` = Bereich; `backLabel` zeigt „‹ Kalender“; `titleOnScroll` für Seiten mit eigenem großen Titel (Rezeptseite): eine Leiste mit „‹ Essen“, kleinem Titel und Knöpfen, auf dem Handy erscheint der Titel erst nach dem Scrollen (Spec 0008, AC-020)                                                                                                                                                                                                                                                                                                                                                                  |
| `TabBar`, `Sidebar`, `Fab`                                                              | Navigation: Tab-Leiste auf dem Handy; Seitenleiste ab Tablet mit Gruppen („Verwalten“), aktiver Eintrag in `accentSoft`; Assistent (nur mit KI-Schalter an)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ViewTabs`                                                                              | zwischen Ansichten wechseln (nur Text, Akzentlinie, seitlich wischbar)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ChoiceChips`                                                                           | ein Wert aus wenigen im Formular (Art, Aufwand, Tageszeit, Variante, Erscheinungsbild); mit `disabled` + `hint` ausgegraut, der gewählte Wert bleibt sichtbar (offline, Spec 0012)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Menu`                                                                                  | Menü-Knopf mit kurzer Liste, z. B. Sortierung „↕ Zuletzt ▾“; mit `trigger="icon"` das Aktionsmenü ⋯, Einträge mit `disabled` und `hint` (Spec 0010). Mit `value` trägt der gewählte Wert einen Haken; im Web Pfeiltasten, Pos1/Ende, Enter (Leertaste bei einer Wahl), Escape schließt (Spec 0008)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `KindLine`, `KindDot`, `KIND_ICONS`                                                     | Eintrag im Kalender: Symbol plus Text mit 3-px-Kante der Art; Punkt der Art im Monat und Jahr (Spec 0010, D19); `accessibilityAction` gibt der Zeile eine Screenreader-Aktion, z. B. „Verschieben“ (Spec 0016); `detail` setzt eine zweite Zeile unter den Text, z. B. die Glocke einer Erinnerung („Erinnerung Fr 18:00“, Spec 0017) in Woche und Tages-Fenster, nie in Monat und Jahr                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Section`                                                                               | Abschnitt mit Titel; Rahmung je Theme (frei, gruppiert, Kachel)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `EditableSection`                                                                       | Abschnitt, der für sich bearbeitet wird (Spec 0008, REQ-007): Stift am Titel, im Bearbeiten „Fertig“; offline ist der Stift ausgegraut mit `hint`, „Fertig“ bleibt. Höchstens ein Abschnitt offen; Zustand und Entwurf hält der Aufrufer, Texte auch. Nach „Fertig“ geht der Fokus zurück auf den Stift. Mit `onCancel` steht „Abbrechen“ neben „Fertig“ (schließt ohne Speichern, auch offline; Escape im Web, solange kein Fenster oder Menü darüber offen ist); `scrollOnOpen` rollt den geöffneten Abschnitt mit seinem Kopf nach oben (Handy, ohne Animation bei „Bewegung reduzieren“; Spec 0023, REQ-003) `inline`: ohne Titelzeile, Stift rechts neben dem Inhalt (Kopf der Rezeptseite mit eigenem Titel); `accessory` steht beim Lesen vor dem Stift (Portionen-Regler bei „Zutaten“) |
| `List`, `ListRow`, `CheckRow`, `SelectRow`, `GroupLabel`                                | Listen; Trennung je Theme (Linie, Gruppe, Kachel). `CheckRow` hakt ab (abgehakt = durchgestrichen); `SelectRow` ist eine Zeile einer Mehrfachauswahl im Fenster (Spec 0009, E16): die ganze Zeile ist ein Ankreuzfeld, Tipp oder Leertaste schaltet um, angekreuzt wird nicht durchgestrichen. Mit `disabled` + `hint` ausgegraut, der Grund steht unter dem Titel und wird angesagt (z. B. „schon enthalten“, Text aus der App)                                                                                                                                                                                                                                                                                                                                                                |
| `useCheckWindow`, `RowTransition`                                                       | Abhaken mit Sammel-Fenster (`CHECK_WINDOW_MS` = 2 s); eingesetzt ab Spec 0006. `toggle` schaltet um, `set` setzt eine Zeile ohne Umschalten und startet die Uhr neu (Sterne in „Wie war's?“), `settle` schließt das Fenster sofort (Seite verliert den Fokus, Spec 0011). `doneRows` ist die Gruppe des Erledigten; mit `keepInDone` bleibt eine dort zurückgenommene Zeile ebenfalls bis zum Ende des Fensters stehen, statt sofort nach oben zu springen („Gepackt (n)“, Spec 0012, AC-021)                                                                                                                                                                                                                                                                                                   |
| `Disclosure`                                                                            | Aufklappbare Gruppe am Ende einer Liste, z. B. „Gepackt (4)“ (Spec 0012, REQ-004): Kopfzeile mit Pfeil, Name und Zähler, als Standard eingeklappt; nur ein Tipp klappt auf oder zu, hinein- oder hinausgleitende Zeilen ändern das nie. Bei 0 Zeilen verschwindet die Gruppe und kommt eingeklappt wieder. Siehe „Aufklappbare Gruppe“ unten                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ReorderList`, `haptic`                                                                 | Liste zum Ordnen (Spec 0007): Griff ≡ zum Ziehen (die übrigen Zeilen machen Platz, leichte Haptik beim Ablegen), Pfeile „nach oben/unten“ in jeder Zeile, im Web Pfeiltasten am Griff; jede neue Position wird angesagt („Getränke, Position 1 von 14“). Mit `onPress` öffnet ein Tipp auf Name und Untertitel die Zeile (eigener Knopf mit `labels.open`, z. B. „Badehose 2× bearbeiten“; Griff und Pfeile bleiben eigene Knöpfe, offline ausgegraut wie sie; Spec 0012). `haptic` nur beim Abhaken und Ablegen, im Web wirkungslos                                                                                                                                                                                                                                                            |
| `SearchOrCreate`                                                                        | Suchen oder anlegen, mit Bremse gegen Doppelte; eingesetzt ab Spec 0006                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `FilterBar`, `InfiniteList`                                                             | Filterzeile (höchstens zwei Zeilen) und Endlos-Liste; eingesetzt ab Spec 0007. Mit `minColumnWidth` ein Raster aus Kacheln: so viele Spalten, wie mindestens so breit in die Liste passen, höchstens `minColumns` weniger (Rezepte: 260 px, auf dem Handy 2 Spalten; Spec 0008, AC-014); gezeichnet werden ganze Reihen, Gruppenüberschriften gehen über die volle Breite                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ListDetail`                                                                            | Liste und Detail ab Tablet: Liste links (höchstens 400 px), Gewähltes rechts, beide scrollen für sich; ohne Wahl ein Platzhalter; auf dem Handy nur die Liste. Gewählte Zeile: `ListRow selected` (Spec 0007; Haushalt „Alle“ und „Verlauf“, Spec 0011)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GhostRow`, `ProposalCard`                                                              | Vorschläge des Assistenten (gestrichelte Zeile, Diff-Karte)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `MediaCard`, `Photo`, `PhotoCollage`                                                    | Rezepte, Sammlungen und Gerichte; Foto oben oder als Vorschaubild. `PhotoCollage` (Spec 0009, E14) macht aus bis zu vier Fotos ein Bild: 1 ganz, 2 nebeneinander, 3 mit dem ersten links über die volle Höhe und zwei rechts übereinander, 4 im 2×2-Raster; dazwischen eine 2-px-Fuge in `surface`; ohne Foto der Platzhalter mit Stapel-Symbol (`KIND_ICONS.collection`, `layers`). `MediaCard images` zeigt die Collage an Stelle von `image`. Welche Fotos es sind, entscheidet die App (`coverPhotos` in `core`: eigenes Foto, sonst die ersten enthaltenen Rezepte mit Foto)                                                                                                                                                                                                               |
| `Button`, `IconButton`, `Chip`, `SwitchRow`, `Checkbox`, `TextField`                    | Bedienelemente mit sichtbarem Tastatur-Fokus; `Chip` mehrfach wählbar zum Filtern, mit `detail` eine zweite Zeile (Tages-Chips „Mi“ über „25.11.“, auch als `detail` einer `ChoiceChips`-Option, Spec 0023); `openExternalLink` öffnet eine geprüfte Web-Adresse im neuen Tab mit `noopener` und `noreferrer` (Links am Rezept, Symbol `external-link`); `SwitchRow` mit `onDetail` öffnet Einstellungen hinter „›“ (siehe „Schalter mit Detail“)                                                                                                                                                                                                                                                                                                                                               |
| `TimeField`                                                                             | Uhrzeit aus „Stunde“ und „Minute“ in 5-Minuten-Schritten, optional mit ✕ (Spec 0027); siehe „Uhrzeit-Feld“ unten                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Stars`                                                                                 | Bewertung in halben Sternen, 0,5 bis 5 (Spec 0011, REQ-004): linke Hälfte eines Sterns = halber Stern. Maus füllt beim Darüberfahren vor, Klick setzt, Verlassen zeigt wieder den gespeicherten Wert; Finger tippt oder zieht, Loslassen setzt; Tastatur und Screenreader in 0,5-Schritten („4,5 von 5 Sternen“). Ohne `onChange` nur Anzeige, `disabled` + `hint` ausgegraut (offline). Test-IDs: `<id>-<n>` voller, `<id>-<n>-half` halber Stern. Auf Rezept- und Restaurantseite zeigt `MemberRatings` (App, `features/shell`) „Du“ zum Setzen und daneben die anderen Mitglieder nur zur Anzeige (Spec 0008, E15)                                                                                                                                                                           |
| `Avatar`, `AvatarStack`, `Badge`, `ProgressBar`, `DueBar`                               | Personen, Kennzeichen, Fortschritt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `EmptyState`, `OfflineBanner`, `StatusBanner`, `Notice`                                 | leere Zustände mit erstem Schritt, Offline, dauerhafter Hinweis oben mit Aktion (z. B. „Neue Version verfügbar“, Spec 0014), ruhige Hinweise                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Sheet`, `toast`                                                                        | Fenster in fester Größe `s` · `m` · `l` (Handy von unten, ab Tablet Dialog 440 · 560 × 640 · 760 × 720); Hinweis mit „Rückgängig“ (5 s); `onExpire` läuft, wenn der Hinweis ohne „Rückgängig“ endet (abgelaufen, ersetzt oder ausgeblendet), z. B. erst dann das Foto eines gelöschten Rezepts löschen (Spec 0008, E5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `DockedPanel`                                                                           | Fenster, das die Seite bedienbar lässt (Spec 0016, Tages-Fenster), in `Screen` über `aside`: auf dem Handy unten in halber Höhe, am Griff ganz groß oder auf eine Zeile (die Kopfzeile), nach unten gezogen zu; ab 1100 px rechts neben dem Inhalt (320–400 px), auf Tablets unten wie am Handy (im iPad-Hochformat bliebe neben Seitenleiste und Fenster kaum Platz fürs Raster). Unten gibt es der Seite so viel Platz am Ende, wie es verdeckt. ✕, Escape und Android-Zurück schließen; der Fokus kehrt zu `returnFocusRef` zurück. Texte (`label`, `closeLabel`, `handleLabel`) kommen aus der App                                                                                                                                                                                          |
| `DragProvider`, `useDragSource`, `useDropTarget`, `useDraggedSource`, `useLiftedSource` | Ziehen und Ablegen (Spec 0016): Finger hält 400 ms, Maus zieht ab 4 px; ein schwebendes Bild mit dem Ziel-Text (max. 280 px, im Fenster), eine Hervorhebung, blasse Ziele über `isAllowed`, Griffe ‹ › im Rand (blättern nach 1 s, über einem Ziel erst jenseits seiner Mitte, nicht in der Zone des Abhebens). Ohne `preview` nur die Hervorhebung; `DragBadge` zeigt Text am Finger. `disabled` nimmt ein Ziel aus, solange etwas gezogen wird, das es nicht annimmt; `useLiftedSource` meldet die Quelle erst nach dem Messen, damit Ziele, die beim Abheben erscheinen, den Griffpunkt nicht verschieben. Escape, zweiter Finger, Android-Zurück brechen ab                                                                                                                                 |
| `SwipeArea`                                                                             | Wischen nach links oder rechts wechselt zum nächsten oder vorigen Element, z. B. den Tag im Tages-Fenster; Tippen und senkrechtes Scrollen bleiben. Nur als Abkürzung: dieselbe Änderung gibt es auch als Knopf                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Aufklappbare Gruppe (Spec 0012, D31).** `Disclosure` sammelt Erledigtes am Ende einer Liste,
zuerst „Gepackt (n)“ je Tasche auf der Urlaubsseite. Text, Zähler und die Zustandswörter
(„aufgeklappt“ / „eingeklappt“) kommen aus der App. Die Kopfzeile ist ein Knopf mit mindestens
44 pt Höhe und sichtbarem Fokus; der Screenreader hört „Gepackt, 4“ und den Zustand: im Web und auf
Android aus `expanded`, auf iOS (das „eingeklappt“ nicht ansagt) im Text („Gepackt, 4,
eingeklappt“). Die Gruppe rückt mit den Zeilen darüber nach (`RowTransition`); die Zeilen blenden
beim Auf- und Zuklappen in 200 ms ein und aus, mit „Bewegung reduzieren“ bleibt nur das Blenden.
Die Gruppe „Erledigt (n)“ der Einkaufsliste ist noch eigener Code und wird später umgestellt.

**Kennzeichen „Sammlung“ (Spec 0009, D14).** Eine Sammlung trägt überall, wo sie neben Rezepten
steht, das neutrale `Badge` mit `KIND_ICONS.collection` (`layers`) und dem Text „Sammlung“ aus der
App: auf der Kachel unten links über dem Foto (`MediaCard badge`), auf ihrer Seite neben dem Titel,
in „Heute geplant“ und „Wie war's?“. Die Zahl der Rezepte („2 Rezepte“) steht als Nebeninfo
darunter, bei 0 fehlt sie. Im Kalender bleibt es bei Kante und Symbol der Art (`KindLine`).

**Uhrzeit-Feld (Spec 0027, REQ-007, Entscheidung 6).** `TimeField` sind zwei Auswahlfelder
„Stunde“ (0–23) und „Minute“ (00, 05, … 55) mit „:“ dazwischen, unter der Beschriftung. Im Web
(der Weg der PWA) ist es das `select` des Browsers: Das iPhone öffnet sein Auswahlrad, am Desktop
gehen Tab, Tippen („19“, dann „3“ → 30) und Pfeiltasten, der Screenreader liest „Uhrzeit,
Stunde, 19“ (Namen aus der App, `TIME_FIELD_WORDS` in `core`). Andere Minuten als 5er-Schritte
lassen sich nicht wählen, eine Tipp-Fehlermeldung gibt es nicht mehr. Ohne Uhrzeit zeigen beide
„–“ und „Minute“ ist gesperrt; eine gewählte Stunde ergibt „:00“. Bei einer optionalen Uhrzeit
bleibt „–“ wählbar und rechts steht ✕ (eigener Knopf, Name aus der App, z. B. „Uhrzeit
entfernen“); bei einer Pflicht-Uhrzeit gibt es „–“ nur, solange noch keine gewählt ist. Eine Wahl
zählt als abgeschlossene Eingabe. Angezeigt werden Uhrzeiten als `H:MM` („7:30“, „19:00“,
`formatTime`). Offline sind beide ausgegraut, der Grund steht in `hint`.

**Schalter mit Detail (Spec 0013, Entscheidung 25).** Eine Einstellung mit Uhrzeit oder Teilen
(„Tagesüberblick“) ist ein `SwitchRow` mit `onDetail`: Titel, Untertitel („7:30 · Essen · Aufgaben“)
und „›“ sind zusammen ein Knopf von mindestens 44 pt, der das Fenster mit den Details öffnet; der
Schalter daneben bleibt ein eigenes Bedienelement. Beide haben eigene Namen (`detailLabel` aus der
App, gefolgt vom Untertitel), nichts ist verschachtelt. Ohne `onDetail` bleibt die Zeile ein
einfacher Schalter.

**Taschen-Symbol (Spec 0012, AC-046).** `luggage` steht für Reisetaschen und Packlisten: im Eintrag
„Verwalten → Reisetaschen“ und am Abwesenheits-Streifen im Kalender, wenn die Abwesenheit eine
Packliste hat (Ansage „mit Packliste“, Text aus der App). Ohne Packliste kein Symbol.

Ein Muster je Aufgabe (Spec 0005, D1): Ansichten wechseln mit `ViewTabs`, ein Wert im Formular mit
`ChoiceChips`, Reihenfolge mit `Menu`, Filtern mit `Chip`, an/aus mit `SwitchRow`. Einen
Segment-Balken gibt es nicht mehr. Fenstergrößen: `s` für Bestätigen und eine Wahl aus wenigen,
`m` für Formulare, `l` für Suchen und Auswählen mit Tabs; ein kleines Fenster darf beim Aufklappen
einmal auf `l` wachsen.

## 7. Bewegung

- Übergänge 150–250 ms, nur für Zustandswechsel (Abhaken, Öffnen eines Sheets, Einblenden).
- Abgehakte Posten bleiben im Einkaufsmodus kurz durchgestrichen stehen, dann rutschen sie weg.
- Keine Einblende-Choreografie beim Laden; `reduce motion` des Systems wird beachtet.

## 8. Do und Don't

| Do                                                                                            | Don't                                                        |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Bausteine aus `@housekeeping/ui`, Farben über Rollen                                          | Hex-Werte, eigene Schatten, eigene Schriften im Feature-Code |
| Ein Akzent je Bildschirm für die Hauptaktion                                                  | Mehrere farbige Knöpfe nebeneinander                         |
| Offline orange und ruhig, Aktionen ausgegraut mit Begründung                                  | Rot, Fehlerdialoge, verschwundene Knöpfe                     |
| Leerer Zustand mit echtem ersten Schritt                                                      | „Keine Daten“ ohne Ausweg, Einführungstouren                 |
| Rückgängig im Hinweis                                                                         | Bestätigungsdialoge vor jedem Löschen                        |
| Symbole aus `icons` (eine Linienstärke je Theme)                                              | Emojis als Symbole                                           |
| Fotos bei Rezepten; Platzhalter mit Besteck-Symbol, bei Sammlungen Collage oder Stapel-Symbol | Verpixelte oder fremd gehostete Bilder                       |
