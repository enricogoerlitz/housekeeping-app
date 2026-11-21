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
| `border`                                              | Haarlinien, Kartenränder                                                                                       |
| `text` / `textMuted`                                  | Haupttext / Nebeninformationen                                                                                 |
| `accent` / `onAccent`                                 | Hauptaktionen, aktiver Tab, Links                                                                              |
| `accentSoft`                                          | aktiver Eintrag in der Seitenleiste (in allen Themes)                                                          |
| `success` / `onSuccess`                               | abgehakt, erledigt, Fortschritt                                                                                |
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
`cardTitle`, `rowTitle`, `body`, `bodyStrong`, `small`, `smallStrong`, `caption`, `sectionLabel`,
`groupLabel`, `button`, `tab`.

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
- **Tiefe:** Schatten nur am Assistent-Knopf und an Sheets; sonst Flächen und Linien.

## 6. Bausteine

Alle in `packages/ui`; der **Showroom** (`/showroom`) zeigt jeden Baustein mit seinen Zuständen in
allen Themes.

| Baustein                                                                      | Wofür                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Screen`, `ScreenHeader`                                                      | Seitenrahmen: `header` (Titel, Zurück, Aktionen), `tabs` und `toolbar` bleiben oben; auf dem Handy schrumpft der Titel zur schmalen Leiste, die `toolbar` rutscht weg; `tone` = Bereich; `backLabel` zeigt „‹ Kalender“ |
| `TabBar`, `Sidebar`, `Fab`                                                    | Navigation: Tab-Leiste auf dem Handy; Seitenleiste ab Tablet mit Gruppen („Verwalten“), aktiver Eintrag in `accentSoft`; Assistent (nur mit KI-Schalter an)                                                             |
| `ViewTabs`                                                                    | zwischen Ansichten wechseln (nur Text, Akzentlinie, seitlich wischbar)                                                                                                                                                  |
| `ChoiceChips`                                                                 | ein Wert aus wenigen im Formular (Art, Aufwand, Tageszeit, Variante, Erscheinungsbild)                                                                                                                                  |
| `Menu`                                                                        | Menü-Knopf mit kurzer Liste, z. B. Sortierung „↕ Zuletzt ▾“; mit `trigger="icon"` das Aktionsmenü ⋯, Einträge mit `disabled` und `hint` (Spec 0010)                                                                     |
| `Popover`                                                                     | kleines Fenster am Link, z. B. hinter „+2 weitere“ im Monat; Escape, ✕ oder Klick daneben schließt (Spec 0010)                                                                                                          |
| `KindLine`, `KindDot`, `KIND_ICONS`                                           | Eintrag im Kalender: Symbol plus Text mit 3-px-Kante der Art; Punkt der Art im Monat und Jahr (Spec 0010, D19)                                                                                                          |
| `Section`                                                                     | Abschnitt mit Titel; Rahmung je Theme (frei, gruppiert, Kachel)                                                                                                                                                         |
| `List`, `ListRow`, `CheckRow`, `GroupLabel`                                   | Listen; Trennung je Theme (Linie, Gruppe, Kachel)                                                                                                                                                                       |
| `useCheckWindow`, `RowTransition`                                             | Abhaken mit Sammel-Fenster (`CHECK_WINDOW_MS` = 2 s); eingesetzt ab Spec 0006                                                                                                                                           |
| `SearchOrCreate`                                                              | Suchen oder anlegen, mit Bremse gegen Doppelte; eingesetzt ab Spec 0006                                                                                                                                                 |
| `FilterBar`, `InfiniteList`                                                   | Filterzeile (höchstens zwei Zeilen) und Endlos-Liste; eingesetzt ab Spec 0007                                                                                                                                           |
| `GhostRow`, `ProposalCard`                                                    | Vorschläge des Assistenten (gestrichelte Zeile, Diff-Karte)                                                                                                                                                             |
| `MediaCard`, `Photo`                                                          | Rezepte und Gerichte; Foto oben oder als Vorschaubild                                                                                                                                                                   |
| `Button`, `IconButton`, `Chip`, `SwitchRow`, `Checkbox`, `Stars`, `TextField` | Bedienelemente mit sichtbarem Tastatur-Fokus; `Chip` mehrfach wählbar zum Filtern                                                                                                                                       |
| `Avatar`, `AvatarStack`, `Badge`, `ProgressBar`, `DueBar`                     | Personen, Kennzeichen, Fortschritt                                                                                                                                                                                      |
| `EmptyState`, `OfflineBanner`, `Notice`                                       | leere Zustände mit erstem Schritt, Offline, ruhige Hinweise                                                                                                                                                             |
| `Sheet`, `toast`                                                              | Fenster in fester Größe `s` · `m` · `l` (Handy von unten, ab Tablet Dialog 440 · 560 × 640 · 760 × 720); Hinweis mit „Rückgängig“                                                                                       |

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

| Do                                                           | Don't                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| Bausteine aus `@housekeeping/ui`, Farben über Rollen         | Hex-Werte, eigene Schatten, eigene Schriften im Feature-Code |
| Ein Akzent je Bildschirm für die Hauptaktion                 | Mehrere farbige Knöpfe nebeneinander                         |
| Offline orange und ruhig, Aktionen ausgegraut mit Begründung | Rot, Fehlerdialoge, verschwundene Knöpfe                     |
| Leerer Zustand mit echtem ersten Schritt                     | „Keine Daten“ ohne Ausweg, Einführungstouren                 |
| Rückgängig im Hinweis                                        | Bestätigungsdialoge vor jedem Löschen                        |
| Symbole aus `icons` (eine Linienstärke je Theme)             | Emojis als Symbole                                           |
| Fotos bei Rezepten; Platzhalter mit Besteck-Symbol           | Verpixelte oder fremd gehostete Bilder                       |
