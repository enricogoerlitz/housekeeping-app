---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-22
---

# 0020 — Übersicht: sieben Tage ab gestern

**Quelle:** ER-09 bis ER-14 (Screenshots `tmp/__REVEWS/0001/image.png`, `image copy.png`,
`image copy 3.png`), U-01, U-02, U-03. U-04 regelt Spec 0026.

**Kritischer Pfad:** ja — Migrationen: Spalte `meal_plan_entries.not_cooked` → `not_done`
(synchronisierte Tabelle, Schreibweg `apply_changes`) und `private.daily_summary_body`
(Tagesüberblick). RLS und Grants ändern sich nicht.

Beispiele: heute ist Sonntag, 22.11.2026; Haushalt „Enrico & Nadja“ mit Vormittag, Mittag, Abend;
Handy 390 px, Desktop 1440 px.

## Ziel

Oben stehen immer gestern, heute und die fünf Tage danach; Blättern geht um sieben Tage und
verschiebt nichts auf der Seite. Jede Kachel zeigt, was an dem Tag am meisten zählt, und ein leerer
Tag lässt sich direkt von der Übersicht planen. Vorbereitungen erscheinen an dem Tag, an dem man
spätestens anfangen muss, mit Uhrzeit, auch für Rezepte in Sammlungen, auf der Seite und im
Tagesüberblick. „Nicht gemacht“ ist umkehrbar, eine frühere Bewertung als frühere erkennbar.

## Nicht-Ziele

- Der Kalender bleibt bei Kalenderwochen; nur die Übersicht zeigt sieben Tage ab gestern.
- Keine Uhrzeit-Einstellung an Tageszeiten; der Kochbeginn ist fest (Entscheidung 8).
- Kein „+“ an Tagen mit Einträgen; ergänzen geht über den Kalender.
- Gezeigter Tag und offenes Fenster in der Adresse: Spec 0019. Punkte (U-04): Spec 0026.

## Schon erledigt

- U-05 (Packkarte zählt ab heute): Spec 0018, AC-020; `packages/core/src/packing.ts`
  (`startsInLabel`).

## Anforderungen

### Tagesleiste und Kopf

**REQ-001 — Sieben Tage ab gestern.** Die _Tagesleiste_ (bisher „Wochenleiste“) zeigt den
_Abschnitt_ gestern bis heute + 5; ‹ › verschieben Abschnitt und gewählten Tag um sieben Tage.
Quelle: ER-09. Offline: vollständig (nur lesen).

- AC-001: Angenommen So 22.11.2026 · Wenn Enrico die Übersicht öffnet · Dann zeigt die Leiste Sa 21.
  bis Fr 27.11., So 22. ist gewählt, Mo 16. bis Fr 20. fehlen.
- AC-002: Angenommen So 22.11. gezeigt · Wenn › · Dann Sa 28.11.–Fr 4.12., gewählt So 29.11. · Wenn
  danach zweimal ‹ · Dann Sa 14.–Fr 20.11., gewählt So 15.11.
- AC-003: Angenommen Mi 25.11. gewählt · Wenn › · Dann gewählt Mi 2.12. an fünfter Stelle, Titel
  „Mittwoch, 2. Dezember“.
- AC-004: Angenommen Nadja unterwegs Do 26.11.–Di 1.12. · Wenn Handybreite · Dann Streifen in Nadjas
  Farbe unter Do 26. und Fr 27. · Wenn › · Dann unter Sa 28.11. bis Di 1.12.
- AC-005 (Rand): Angenommen heute Do 31.12.2026 · Dann Leiste Mi 30.12.2026 bis Di 5.1.2027 · Wenn
  Fr 1.1. gewählt · Dann Titel „Morgen, Freitag 1. Januar“.
- AC-006 (Rand): Angenommen Übersicht offen auf heute · Wenn es Mo 23.11., 0:00 wird · Dann Leiste
  So 22.–Sa 28.11., gewählt Mo 23.11.

**REQ-002 — Kopf ohne Sprung.** Unter dem Titel steht immer genau eine Zeile; zwischen ‹ › steht der
Zeitraum ohne KW in fester Breite; „Heute“ hat einen festen Platz links von ‹ und ist nur
außerhalb des heutigen Abschnitts antippbar; das Kalender-Symbol im Kopf entfällt. Quelle: ER-10,
ER-11. Offline: vollständig.

```text
Desktop:  Sonntag, 22. November              [Heute]  ‹  Sa 21.11. – Fr 27.11.  ›
          Guten Tag, Enrico                    (grau)
Handy:    Sonntag, 22. November        ⊞ (E)
          Guten Tag, Enrico
          [Heute]          ‹  Sa 21.11. – Fr 27.11.  ›
```

- AC-007: Angenommen So 22.11., 8 Uhr · Dann „Guten Morgen, Enrico“, Zeitraum „Sa 21.11. – Fr
  27.11.“ ohne „KW“ und ohne „Diese Woche“, „Heute“ ausgegraut · Wenn Di 24.11. gewählt · Dann
  Titel „Dienstag, 24. November“, Gruß und graues „Heute“ bleiben.
- AC-008: Wenn › · Dann unter „Sonntag, 29. November“ steht „In 7 Tagen“, Zeitraum „Sa 28.11. – Fr
  4.12.“, „Heute“ aktiv · Wenn „Heute“ · Dann So 22.11. mit Gruß · Wenn einmal ‹ und Sa 14.11. ·
  Dann „Vor 8 Tagen“.
- AC-009: Wenn › und dann „Heute“ (Handy und Desktop) · Dann stehen Leiste, ‹, ›, „Heute“ und
  Zeitraum an derselben Stelle, beide Zeiträume gleich breit.
- AC-010: Dann steht im Kopf kein Kalender-Symbol; auf dem Handy bleiben ⊞ und Avatar.
- AC-011 (Rand): Angenommen heute Do 31.12.2026 · Dann Zeitraum „Mi 30.12. – Di 5.1.“, Screenreader
  „Mittwoch, 30. Dezember, bis Dienstag, 5. Januar“, ‹ › heißen „Vorige 7 Tage“ / „Nächste 7 Tage“.

### Kacheln (Desktop)

**REQ-003 — Wichtigster Eintrag.** Die Kachel zeigt den wichtigsten Eintrag (reine Funktion in
`packages/core`): (1) Tageszeiten von der letzten zur ersten, darin Sammlung, Rezept, Restaurant;
(2) dann wieder von spät nach früh: Reste, Freitext; (3) dann Aktivitäten von spät nach früh;
Gleiches in derselben Tageszeit in Kalender-Reihenfolge. Aufgaben, Reisen und Vorgemerktes nie.
„+n“ zählt alle übrigen Einträge des Tages. Quelle: ER-13. Offline: vollständig.

- AC-012: Angenommen So: „Eislaufen“ (Vormittag), „Reste von Mango-Curry“ (Mittag), „Lasagne“ und
  „Trattoria Da Enzo“ (Abend) · Dann Kachel „Lasagne“ „+3“ · Wenn Nadja „Grillabend“ zum Abend
  dazuplant und der Sync kommt · Dann „Grillabend“ „+4“.
- AC-013: Angenommen Mo: „Shakshuka“ (Mittag), „Eislaufen“ (Abend); Di: „Mango-Curry“ (Mittag),
  „Trattoria Da Enzo“ (Abend) · Dann Mo „Shakshuka“ „+1“, Di „Trattoria Da Enzo“ „+1“.
- AC-014: Angenommen Mi: „Reste von Lasagne“ (Mittag), Freitext „Pizza bestellen“ und „Eislaufen“
  (Abend); Do: Reste und „Pizza bestellen“ beide Abend · Dann Mi „Pizza bestellen“ „+2“, Do „Reste
  von Lasagne“ „+1“.
- AC-015: Angenommen Fr Abend „Mango-Curry“ vor „Shakshuka“ · Dann „Mango-Curry“ · Wenn im Kalender
  umsortiert · Dann „Shakshuka“.
- AC-016 (Rand): Angenommen Sa: „Bad putzen“ fällig, Nadja unterwegs, nur „Eislaufen“ geplant,
  „Lasagne“ vorgemerkt · Dann Sa „Eislaufen“ ohne „+n“, nirgends „Lasagne“ oder „Bad putzen“.

**REQ-004 — Bild der Kachel.** Die Kachel zeigt dasselbe Bild wie die Karte unter „Geplant“:
Sammlung eigenes Foto, sonst Collage ihrer Rezepte, sonst Stapel; Rezept Foto, sonst Kochmütze;
Reste Foto des Ursprungsrezepts, sonst Kochmütze; Freitext Kochmütze; Restaurant Bild (sobald
Spec 0024 es bringt), sonst Besteck; Aktivität Foto, sonst Berg. Quelle: ER-13. Offline:
vollständig; ungeladenes Foto zeigt das Symbol.

- AC-017: Angenommen „Grillabend“ ohne eigenes Foto, zwei Rezepte mit Foto, wichtigster Eintrag So ·
  Dann zeigt die Kachel dieselbe Collage wie die Karte „Grillabend“.
- AC-018: Angenommen Mo nur „Trattoria Da Enzo“, Di nur „Pizza bestellen“, Mi nur „Eislaufen“ ohne
  Foto · Dann Besteck, Kochmütze, Berg, je mit Titel.
- AC-019 (Rand): Angenommen Do nur „Reste von Linsen-Dal“, Rezept gelöscht · Dann Kochmütze und
  derselbe Titel wie auf der Karte.

**REQ-005 — „+“ im leeren Tag.** Ein leerer Tag zeigt in der Kachel „+“ und unter „Geplant“
„Nichts geplant“ mit „Hinzufügen“ (statt „Im Kalender planen ›“, auf allen Breiten); beides wählt
den Tag und öffnet das Hinzufügen-Fenster des Kalenders (`add-entry-sheet.tsx`) für diesen Tag,
ohne gewählte Tageszeit im Titel, im zweiten Schritt „Abend“ vorgewählt (Tageszeit namens „Abend“,
sonst die letzte); danach bleibt man auf der Übersicht. Tipp anderswo auf die Kachel wählt nur den
Tag. Quelle: ER-14. Offline: nur online; „+“ und „Hinzufügen“ ausgegraut mit „Offline – zum
Bearbeiten brauchst du Netz“ (bei alter Version „Bitte neu laden, um zu bearbeiten“), Tag bleibt
wählbar.

- AC-020: Angenommen Di 24.11. leer, Desktop · Wenn „+“ in der Kachel Di · Dann Di gewählt, Fenster
  „Di 24. Nov“, Schritt 2 „Abend“ · Wenn „Lasagne“ eingeplant · Dann Fenster zu, Hinweis, Übersicht
  bleibt, Kachel und „Geplant am Dienstag“ zeigen „Lasagne“.
- AC-021: Wenn Tipp auf Wochentag oder „frei“ der Kachel Di, oder auf die Kachel des geplanten Mo ·
  Dann wird der Tag gewählt, kein Fenster.
- AC-022: Angenommen Handybreite, Di leer gewählt · Dann „Nichts geplant“ mit „Hinzufügen“, kein „Im
  Kalender planen ›“ · Wenn „Hinzufügen“ · Dann Fenster wie AC-020, danach Übersicht mit Di.
- AC-023 (Rand): Wenn Fenster ohne Auswahl geschlossen · Dann nichts geplant, Di gewählt, Kachel „+“.
- AC-024: Angenommen gestern Sa 21.11. leer · Wenn „+“ und „Mango-Curry“ eingeplant · Dann steht es
  Sa 21.11. Abend im Kalender.
- AC-025 (Fehler): Angenommen offline · Dann „+“ der Kachel Di ausgegraut mit Offline-Hinweis · Wenn
  Tipp auf die Kachel · Dann Di gewählt, „Hinzufügen“ ebenso ausgegraut.
- AC-026 (Rand): Angenommen Tageszeiten „Frühstück“, „Mittag“ · Dann ist „Mittag“ vorgewählt.

### Vorbereitung

**REQ-006 — Vorbereitungszeile.** Direkt unter der Tagesleiste, vor „Geplant“, steht je
Vorbereitung eine Zeile an dem Tag, an dem man spätestens anfangen muss: Tag des Eintrags +
_Kochbeginn_ der Tageszeit (Vormittag 8, Mittag 11, Abend 17, sonst 8 Uhr) − Vorlauf; fällt das
zwischen 0 und 6 Uhr, gilt der Abend davor. Rezepte und Sammlungen (mit jedem enthaltenen Rezept
mit Vorlauf); nicht Reste, Freitext, Restaurant, Aktivität. Text `<Wann>: <Vorlauf> · <Rezept>
(<Tag, Tageszeit>)`: heute „Heute bis ca. 23 Uhr“ / „Heute Abend“ / „Schon fällig“ (Beginn vorbei,
Eintrag heute oder später), künftige Tage „Bis ca. 23 Uhr“ / „Abends“, vergangene Tage keine Zeile;
Sammlung „Grillabend: Grillspieße“; Tag „heute Abend“, „morgen Mittag“, sonst „Di 24.11., Abend“.
Reihenfolge: „Schon fällig“, dann nach Beginn, „Abends“ zuletzt. Für den ganzen Haushalt. „Für
morgen“ entfällt. Quelle: ER-12, U-02. Offline: vollständig.

- AC-027: Angenommen „Hummus“ (Vorlauf „Kichererbsen einweichen“, 12 h) Mo 23.11. Mittag · Dann
  unter der Leiste „Heute bis ca. 23 Uhr: Kichererbsen einweichen · Hummus (morgen Mittag)“ ·
  Wenn stattdessen Mo Abend · Dann „Heute Abend: Kichererbsen einweichen · Hummus (morgen Abend)“, am
  Mo keine Zeile.
- AC-028: Angenommen „Bulgogi“ („Fleisch marinieren“, 48 h) Di 24.11. Abend · Dann heute „Heute bis
  ca. 17 Uhr: Fleisch marinieren · Bulgogi (Di 24.11., Abend)“, Mo keine Zeile.
- AC-029: Angenommen „Grillabend“ Mo Abend mit „Grillspieße“ („Spieße marinieren“, 24 h) und
  „Kartoffelsalat“ ohne Vorlauf · Dann genau „Heute bis ca. 17 Uhr: Spieße marinieren · Grillabend:
  Grillspieße (morgen Abend)“.
- AC-030: Angenommen „Hummus“ Mi 25.11. Mittag · Wenn Di gewählt · Dann „Bis ca. 23 Uhr: Kichererbsen
  einweichen · Hummus (Mi 25.11., Mittag)“, heute nicht · Wenn ein vergangener Tag gewählt · Dann
  keine Vorbereitungszeile.
- AC-031 (Rand): Angenommen So 10 Uhr wird „Hummus“ für heute Abend geplant · Dann als erste Zeile
  „Schon fällig: Kichererbsen einweichen · Hummus (heute Abend)“, am Mo nicht mehr.
- AC-032 (Rand): Angenommen nichts mit Vorlauf · Dann keine Zeile, „Heute geplant“ direkt unter der
  Leiste, nirgends „Für morgen“.

**REQ-007 — Tagesüberblick nach derselben Regel.** Der Tagesüberblick nennt die Vorbereitungen des
Tages nach REQ-006 als „Vorbereiten: <Vorlauf> (<bis ca. 23 Uhr | heute Abend | schon fällig>), …“;
Empfänger wie Spec 0013 (wer kocht, sonst wer mitisst, ohne Angabe alle). Quelle: U-02 (Enrico: „auf
der Übersicht und in der Push-Nachricht“). Offline: Server stellt zu.

- AC-033: Angenommen Enrico Tagesüberblick 7:30 mit allen Teilen, kocht „Lasagne“ heute Abend,
  „Hummus“ Mo Mittag und „Bulgogi“ Di Abend · Wenn Takt So 7:30 · Dann „Heute: Lasagne (Abend, du
  kochst) · Vorbereiten: Fleisch marinieren (bis ca. 17 Uhr), Kichererbsen einweichen (bis ca. 23
  Uhr)“.
- AC-034: Angenommen „Grillabend“ Mo Abend, Nadja kocht, Enrico isst mit, beide Teil „Vorbereitung“
  an · Dann Nadja „Vorbereiten: Spieße marinieren (bis ca. 17 Uhr)“, Enrico ohne Vorbereitung.
- AC-035 (Fehler): Angenommen nur Teil „Vorbereitung“, heute nichts anzufangen („Hummus“ erst Mi
  Mittag) · Dann keine Nachricht · Und eine Vorbereitung in einem fremden Haushalt erscheint in
  keiner Nachricht Enricos.

### Wie war's? und rechte Spalte

**REQ-008 — „Nicht gemacht“ umkehrbar.** „Nicht gemacht“ zeigt einen Hinweis mit „Rückgängig“;
im Eintragsfenster eines Tags vor heute gibt es den Schalter „Nicht gemacht“ (Rezept, Sammlung,
Freitext, Restaurant, Aktivität; nicht Reste), sofort gespeichert. Quelle: U-01. Offline: nur
online; ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“, „Rückgängig“ offline meldet
„Offline – zum Rückgängigmachen brauchst du Netz“.

- AC-036: Angenommen Mo 23.11., „Eislaufen“ vom So unter „Wie war's?“ · Wenn „Nicht gemacht“ · Dann
  Zeile weg, Hinweis „„Eislaufen“ als nicht gemacht markiert“ mit „Rückgängig“ · Wenn „Rückgängig“ ·
  Dann Zeile wieder da (auch bei Nadja), Sonntag zählt wieder als Besuch.
- AC-037: Angenommen „Lasagne“ Sa 21.11. als nicht gemacht markiert · Wenn Eintrag im Kalender
  geöffnet · Dann Schalter „Nicht gemacht“ an · Wenn aus · Dann gespeichert, zählt wieder für
  „Zuletzt gekocht“, „Wie war's?“ fragt wieder.
- AC-038 (Rand): Dann kein Schalter bei Einträgen von heute, Di 24.11. und „Reste von Lasagne“.
- AC-039 (Fehler): Wenn offline „Rückgängig“ · Dann Offline-Hinweis, bleibt markiert · Wenn Nadja den
  Eintrag gelöscht hat und der Server ablehnt · Dann „Hat nicht geklappt – bitte noch einmal
  versuchen“, nichts markiert.

**REQ-009 — Frühere Bewertung blass, „Passt so“.** Sterne beginnen leer; eine frühere eigene
Bewertung steht blass als „Letztes Mal ★ 4“, und „Passt so“ wirkt wie ein Tipp auf diesen Wert
(Sammel-Fenster, 2 s). Quelle: U-03. Offline: nur online; ausgegraut wie Spec 0011 AC-023.

- AC-040: Angenommen Enrico gab „Lasagne“ am 1.10. 4 Sterne, Sa 21.11. wieder gegessen · Dann leere
  Sterne, „Letztes Mal ★ 4“, „Passt so“ · Wenn „Passt so“ · Dann 4 Sterne, Zeile gleitet nach 2 s
  weg, gespeichert 4, Mo nicht mehr gefragt.
- AC-041: Wenn stattdessen rechte Hälfte des fünften Sterns · Dann Bewertung 5.
- AC-042 (Rand): Angenommen „Mango-Curry“ nie von Enrico bewertet (Nadja 5) · Dann kein „Letztes Mal“,
  kein „Passt so“ · Und frühere 3,5 zeigt „Letztes Mal ★ 3,5“.

**REQ-010 — Packkarte nach Abschnitt.** Die Karte „Reisetasche“ steht, wenn der Abschnitt des
gezeigten Tags einen Reisetag enthält oder die Reise 1–7 Tage nach dem gezeigten Tag beginnt; die
Kalenderwoche zählt nicht mehr. Quelle: ER-09 (Folge). Offline: vollständig.

- AC-043: Angenommen „Urlaub Mallorca“ 4.–10.12. mit Packliste · Wenn ›, Sa 28.11. · Dann Karte mit
  „beginnt in 12 Tagen“ · Wenn ›, Fr 11.12. · Dann Karte · Wenn ›, Sa 12.12. · Dann keine Karte,
  obwohl Mo 7.–Do 10.12. in derselben Kalenderwoche liegen.

Andere Tage sonst unverändert (Spec 0011): „Geplant am Dienstag“, „Zu tun am …“ nur ansehen,
„Erledigt am …“ an vergangenen Tagen, „Wie war's?“ nur heute, Einkauf gleich.

## Entscheidungen

Alle: Claude nach Enricos Regel „Empfehlung nehmen“, 22.11.2026.

1. „Heute“ im heutigen Abschnitt sichtbar und ausgegraut (nicht ausgeblendet, nicht aktiv für
   andere Tage im Abschnitt) — fester Platz, heute ist ohnehin einen Tipp entfernt.
2. Zeile außerhalb des Abschnitts „In n Tagen“ / „Vor n Tagen“ (statt Gruß oder Leerzeile) — trägt
   Information, gleiche Höhe. Im Abschnitt bleibt der Gruß, auch bei anderem gewähltem Tag.
3. Zeitraum ohne Jahreszahl — feste Breite; das Jahr steht im Titel (Spec 0011).
4. Nach dem Essen zählt zuerst die Tageszeit, dann Reste vor Freitext; Aktivitäten zuletzt — Abend
   ist bei ER-13 überall der erste Maßstab.
5. „+n“ zählt alle übrigen Einträge — ehrlich wie die Karten unter „Geplant“.
6. Handy hat keine Kacheln: „Hinzufügen“ im leeren „Geplant“ auf allen Breiten statt „Im Kalender
   planen ›“ — gleicher Weg überall (ER-01).
7. „+“ an vergangenen Tagen erlaubt — der Kalender erlaubt es auch.
8. Kochbeginn = Erinnerungsvorschlag aus Spec 0017 (8/11/17 Uhr, sonst 8), eine Tabelle in core,
   in SQL gespiegelt mit Paritätstest; keine Uhrzeit pro Tageszeit speichern (kein Bedarf, keine UI).
   OFFEN: ob 8/11/17 Uhr zum Alltag passt (Annahme ja).
9. Beginn zwischen 0 und 6 Uhr → „Heute Abend“ am Vortag; verpasster Beginn → „Schon fällig“ (nur
   heute) — sonst bleibt spät Geplantes still.
10. Schalter „Nicht gemacht“ nur vor heute, nicht für Reste; Spalte heißt `not_done` — gilt auch für
    Restaurants und Aktivitäten; heute „nicht gemacht“ heißt eher löschen.
11. „Passt so“ über das Sammel-Fenster — ein Verhalten für die ganze Liste.
12. Packkarte nach Abschnitt — die Übersicht kennt keine Kalenderwoche mehr.
13. Geänderte ältere Kriterien: Spec 0011 AC-001–AC-006, AC-009 (letzter Satz), AC-013, AC-014,
    AC-020, AC-021, AC-062; Spec 0012 AC-043; Spec 0013 AC-015 (letzter Teil); Spec 0009 Offene Frage
    7 und Spec 0011 Offene Fragen 1 und 7 damit entschieden.

## Daten

- `meal_plan_entries.not_cooked` → `not_done` (Code `notDone`); Feldlisten in `apply_changes`,
  Mapping, `types.gen.ts`. Keine Kompatibilität mit v2026.11.1.
- Neu: `private.slot_start_time(text)`, `private.prep_items(...)`; `private.daily_summary_body` neu
  angelegt. Keine neue Tabelle, keine RLS-Änderung.
- Entfällt: Spalte `not_cooked`; core `weekNav`, `shiftShownDay` (Wochenform), `dayTile`;
  `CalendarButton`; Test-IDs `today-calendar`, `today-week-label`, `today-plan`; `prep`-Block in
  `today-meals.tsx`; doppelte Kennzeichen-Tabellen (`BADGES`, `KIND_BADGES`, `KIND_NAMES`) und
  uneinheitliche Platzhalter-Symbole → `KIND_ICONS`.

## Risiken

| Risiko                                                          | Gegenmaßnahme                                        | Test                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| Vorbereitung aus fremdem Haushalt im Tagesüberblick             | jede Verbindung über `household_id`                  | pgTAP AC-035 (fremde Sammlung)                               |
| `not_done` an fremdem Eintrag, abgemeldet, ungültig, alter Name | `apply_changes` prüft Mitgliedschaft, Feldliste, Typ | pgTAP: fremd, `anon` (42501), `"ja"`, `not_cooked` abgelehnt |
| Eintrag gelöscht beim Markieren                                 | Ablehnung, Überlagerung springt zurück, Toast        | api-Test, AC-039                                             |
| Sync bricht durch Spaltennamen                                  | App und Migration zusammen; Produktion-Reset (0028)  | `pnpm test:integration`                                      |
| SQL und TS rechnen Vorbereitung verschieden                     | gleiche Fälle in beiden                              | `notification_parity.test.sql`, `prep.test.ts`               |

## Umsetzung

- [ ] 1. core `overview.ts`: Abschnitt, Blättern ±7, Zeitraum und Ansage, Zeile unter dem Titel,
      „Heute“ aktiv (AC-001–AC-003, AC-005–AC-008, AC-011)
- [ ] 2. app Kopf und `DayStrip`: feste Zeile, fester „Heute“-Platz, Zeitraum fester Breite, ohne
      Kalender-Symbol, Streifen nach Abschnitt (AC-004, AC-009, AC-010)
- [ ] 3. core `tileEntry` statt `dayTile`; `packingCards` nach Abschnitt (AC-012–AC-016, AC-043)
- [ ] 4. app `EntryPicture` für Karte und Kachel (AC-017–AC-019)
- [ ] 5. core `addPresetSlot` (auch Kalender); app „+“ und „Hinzufügen“ mit `AddEntrySheet`
      (AC-020–AC-026)
- [ ] 6. core `slotStartTime` (aus `reminder.ts`) und `prepLines`; app Zeilen unter der Leiste
      (AC-027–AC-032)
- [ ] 7. supabase Tagesüberblick + pgTAP inkl. Parität; `/security-check` (AC-033–AC-035)
- [ ] 8. `not_cooked` → `not_done` (`db-change`-Skill), pgTAP-Negativtests; `/security-check`
- [ ] 9. Toast mit „Rückgängig“, Schalter im Eintragsfenster (mit Spec 0021 abstimmen), „Letztes Mal
      ★ n“, „Passt so“ (AC-036–AC-042)
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web`, `pnpm exec supabase test db`,
      `pnpm test:integration`, `/ui-verify` Handy/Desktop hell/dunkel
