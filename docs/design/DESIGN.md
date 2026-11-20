# DESIGN.md — Gestaltung der Haushalts-App

> Gilt für alle Bildschirme. Umsetzung: `packages/ui` (Tokens und Bausteine), Entscheidung:
> [ADR-0010](../adr/0010-styling-und-themes.md). Entstanden aus den drei Design-Richtungen von
> Spec 0001; Enrico hat alle drei als wählbare Themes übernommen.

## 1. Grundsätze

1. **Eine App, drei Gesichter.** Inhalt, Abläufe und Bausteine sind in allen Themes gleich. Ein
   Theme ändert Farben, Schriften, Rundungen und die Rahmung von Abschnitten und Listen, nie die
   Bedienung.
2. **Zuerst fürs Handy, aber jede Breite ist gestaltet.** Handy (< 700 px): Tab-Leiste unten,
   schwebender Assistent. Tablet und Desktop: Seitenleiste, zwei Spalten, Inhalte bis 1180 px breit.
3. **Ruhe statt Druck.** Kein Rot. Hinweise, Offline und Überfälliges sind orange
   (`warnBg`/`warnText`). Keine Punkte, Serien oder Ranglisten.
4. **Fotos sind die Bühne für Essen**, Symbole für alles andere. Keine Emojis als Symbole.
5. **Nur Tokens.** Feature-Code enthält keine Farbwerte und keine Schriftnamen; die Lint-Regel prüft
   das (Spec 0001, AC-005).

## 2. Themes

| Theme                         | Charakter                                    | Schrift                                                     | Rahmung                                                           | Standard |
| ----------------------------- | -------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- | -------- |
| **Markthalle** (`markthalle`) | warm, appetitlich, wie ein gutes Kochbuch    | Fraunces (Titel, Rezeptnamen) · Instrument Sans (Bedienung) | feine Linien, Fotos oben auf Karten, Abschnitte ohne Rahmen       | ja       |
| **Klar** (`klar`)             | ruhig, vertraut, wie die Apps des Geräts     | Systemschrift (SF Pro / Roboto / Segoe)                     | gruppierte weiße Karten, Abschnittstitel als graue Großbuchstaben | —        |
| **Frisch** (`frisch`)         | mutig, farbig, jeder Bereich hat seine Farbe | Bricolage Grotesque (Titel) · DM Sans (Bedienung)           | farbige Kacheln je Bereich, eine Kachel je Listenzeile            | —        |

Jedes Theme gibt es hell und dunkel. Auswahl unter **Einstellungen → Darstellung**; gespeichert wird
nur auf dem Gerät. Ein unbekannter gespeicherter Wert fällt auf „Markthalle“ zurück.

## 3. Farben

Rollen statt Farbnamen. Alle Paare erfüllen WCAG AA (Text ≥ 4,5:1), geprüft per Unit-Test.

| Rolle                                  | Verwendung                                                  |
| -------------------------------------- | ----------------------------------------------------------- |
| `bg`                                   | Seitenhintergrund                                           |
| `surface`                              | Karten, Listen, Sheets                                      |
| `surfaceSunken`                        | Eingabefelder (Klar), Platzhalter, Segment-Hintergrund      |
| `border`                               | Haarlinien, Kartenränder                                    |
| `text` / `textMuted`                   | Haupttext / Nebeninformationen                              |
| `accent` / `onAccent`                  | Hauptaktionen, aktiver Tab, Links                           |
| `accentSoft`                           | aktiver Eintrag in der Seitenleiste                         |
| `success` / `onSuccess`                | abgehakt, erledigt, Fortschritt                             |
| `star`, `due`                          | Bewertungen; Fälligkeitsbalken und Vorlauf-Hinweis          |
| `warnBg` / `warnText`                  | Offline, „Passt nicht für …“, Fehlermeldungen an Feldern    |
| `barBg`                                | Tab-Leiste, Seitenleiste, Eingabeleiste                     |
| `fabBg` / `fabText`                    | Assistent-Knopf (in „Frisch“ eigenes Violett)               |
| `tones.{essen,plan,liste,haushalt,ki}` | Bereichsfarben; nur „Frisch“ malt Abschnitte damit ganz aus |

| Theme      | Hell: Hintergrund · Akzent                   | Dunkel: Hintergrund · Akzent |
| ---------- | -------------------------------------------- | ---------------------------- |
| Markthalle | `#FAF6EE` · `#B4411F` Terrakotta             | `#1B1613` · `#EC8A66`        |
| Klar       | `#F2F2F7` · `#0B7A63` Grün                   | `#000000` · `#30C9A0`        |
| Frisch     | `#FAF8F5` · `#15151B` Tinte, Bereiche farbig | `#111116` · `#F6F5F2`        |

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

| Baustein                                                                                   | Wofür                                                           |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `Screen`, `ScreenHeader`                                                                   | Seitenrahmen mit sicheren Rändern, Titel, Rücksprung            |
| `TabBar`, `Sidebar`, `Fab`                                                                 | Navigation (Handy unten, ab Tablet seitlich), Assistent         |
| `Section`                                                                                  | Abschnitt mit Titel; Rahmung je Theme (frei, gruppiert, Kachel) |
| `List`, `ListRow`, `CheckRow`, `GroupLabel`                                                | Listen; Trennung je Theme (Linie, Gruppe, Kachel)               |
| `GhostRow`, `ProposalCard`                                                                 | Vorschläge des Assistenten (gestrichelte Zeile, Diff-Karte)     |
| `MediaCard`, `Photo`                                                                       | Rezepte und Gerichte; Foto oben oder als Vorschaubild           |
| `Button`, `IconButton`, `Chip`, `Segmented`, `SwitchRow`, `Checkbox`, `Stars`, `TextField` | Bedienelemente mit sichtbarem Tastatur-Fokus                    |
| `Avatar`, `AvatarStack`, `Badge`, `ProgressBar`, `DueBar`                                  | Personen, Kennzeichen, Fortschritt                              |
| `EmptyState`, `OfflineBanner`, `Notice`                                                    | leere Zustände mit erstem Schritt, Offline, ruhige Hinweise     |
| `Sheet`, `toast`                                                                           | Bottom-Sheet bzw. Dialog ab Tablet; Hinweis mit „Rückgängig“    |

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
