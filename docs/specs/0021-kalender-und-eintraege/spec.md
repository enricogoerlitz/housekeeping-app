---
status: freigegeben
datum: 2026-11-22
---

# 0021 — Kalender am Desktop und Einträge vollständig bearbeiten

**Quelle:** ER-24, ER-26, ER-28; K-01, K-05 bis K-11, L-03 (`docs/product/review-logik-und-bedienung.md`)

**Kritischer Pfad:** ja — Migration (`meal_plan_entries`, `notification_settings`,
`apply_changes`), Planer der Benachrichtigungen (Reservierungs-Erinnerung entfällt, Text der
Erinnerung ändert sich), Löschen von Daten (Beiträge auf der Einkaufsliste, REQ-007, REQ-015). RLS
und Delta-Sync bleiben unverändert (keine neue Tabelle).

Beispiele: Haushalt „Enrico & Nadja“, angemeldet ist Enrico, Tageszeiten Vormittag, Mittag, Abend.
Heute ist Sonntag, 22.11.2026. „Urlaub Mallorca“ ist eine Reise des ganzen Haushalts vom 4. bis
10.12.2026. „Lasagne“ ist für 2 Portionen geschrieben: „Hackfleisch 250 g“ (Rezeptmenge),
„Lasagneplatten“ (Anzahl). „Mango-Curry“ für 2 Portionen mit den Varianten „mit Tofu“ (Standard)
und „mit Hähnchen“: „Kokosmilch 400 ml“ (beide), „Tofu 200 g“, „Hähnchenbrust 300 g“. Desktop ab
1100 px, Tablet 700–1099 px, Handy darunter.

## Ziel

Am Desktop füllt der Kalender die Fensterhöhe, und der Monat sieht aus wie die Woche; in Monat und
Jahr fügt man hinzu wie in der Woche. Im Fenster eines Eintrags lässt sich alles ändern, was man beim
Einplanen gewählt hat (Esser, Gäste, Portionen, Varianten, Freitext, Zusatz, Tag, Tageszeit), und
die Einkaufsliste geht mit. Restaurants und Aktivitäten haben eine optionale Uhrzeit, jeder Eintrag
höchstens eine Erinnerung. Reste findet man oben, auch vom Mittag desselben Tags und älter als eine
Woche.

## Nicht-Ziele

- Reisen im Kalender und ihre Wirkung auf geplante Mahlzeiten (ER-25, K-02): Spec 0022.
- Keine Stundenansicht und keine Uhrzeit für Rezepte, Sammlungen, Freitext und Reste (D43 bleibt
  für sie); keine Reste von Restaurants (Take-away trägt man als Freitext ein).
- Handy-Woche und Handy-Monat behalten ihr Aussehen. Hover, Fokus, Menüs und Adresse regelt Spec
  0019; „Aus Kalender“ Spec 0025 (dort entfällt „aktualisieren“ aus L-03, weil REQ-007 die Liste
  nachführt).
- Keine neuen Offline-Schreibvorgänge (ADR-0008).

## Schon erledigt

- ER-27 (Jahr nur Link in den Monat): Tag öffnet das Tages-Fenster — Spec 0016, REQ-006,
  `apps/app/src/features/calendar/day-panel.tsx`.
- ER-28, Teil Tages-Fenster: „+ Hinzufügen“ je Tageszeit in Monat und Jahr — Spec 0016, AC-025,
  `day-panel.tsx` (Knopf „Hinzufügen: <Tageszeit>“). Neu ist nur das „+“ im Desktop-Monat.
- ER-26, unterbrochene Linie in Zeile mit Reise: läuft seit 0016 durch (`month-view.tsx`,
  `DayColumns`); mit REQ-002 entfallen die Linien ganz.
- K-04, A-01 (Verschieben nur in der Woche, Einplanen 14 Tage): „Anderes Datum …“ — Spec 0016,
  REQ-005, `apps/app/src/features/meal-plan/entry-sheet.tsx`.
- K-03 („Fertig“ verwirft Zusatz): Spec 0018, REQ-003, `entry-sheet.tsx` (`done`).
- K-11, Tagesliste unter dem Handy-Monat: durch das Tages-Fenster ersetzt (0016, AC-022); offen
  bleiben die Aufgaben darin (REQ-005).
- ER-25, Reise über Tage ziehen: Spec 0016, REQ-007 (Fenster selbst: 0022).

## Anforderungen

### Kalender am Desktop

**REQ-001 — Der Kalender füllt am Desktop die Höhe.** Ab 1100 px nimmt das Raster die Höhe zwischen
Kopf mit Tabs (bleiben oben stehen) und „Vorgemerkt“ ein; erst unter einer Mindesthöhe scrollt die
Seite. Woche: Tageskopf, Reise- und Haushalt-Zeile natürlich hoch, die Tageszeiten teilen sich den
Rest gleich, je mindestens 120 px; eine Tageszeit ist mindestens so hoch wie ihr vollster Tag. Monat:
Wochenzeilen teilen sich die Höhe, ein Tag zeigt so viele Einträge, wie ganz passen, mindestens drei,
Rest „+n weitere“. Jahr: die drei Zeilen à vier Monate teilen sich die Höhe, Mindesthöhe die heutige.
„Vorgemerkt“ in der Woche als Raster (Spalten gleicher Breite, je mindestens 220 px); Monat und Jahr
behalten die Leiste „Vorgemerkt · n“. Mit Tages-Fenster rechts wird nur das Raster schmaler. Tablet
und Handy scrollen wie bisher. Quelle: ER-24. Offline: vollständig (Darstellung).

- AC-001: Angenommen Desktop 1440 × 900, Woche 23.–29.11., Haushalt-Zeile an, zwei Einträge unter
  „Vorgemerkt“ · Dann sind Vormittag, Mittag, Abend gleich hoch (≥ 120 px), „Vorgemerkt“ endet am
  unteren Rand, die Seite scrollt nicht · Wenn ich auf 1440 × 1200 vergrößere · Dann werden nur die
  drei Tageszeiten um gleich viel höher.
- AC-002: Angenommen 1440 × 600, Woche · Dann ist jede Tageszeit 120 px hoch, die Seite scrollt, Kopf
  und Tabs bleiben oben (Und bei 1440 × 900 mit sechs Einträgen am Mittwochabend sind alle sechs ganz
  zu sehen).
- AC-003: Angenommen Monat November 2026 (sechs Wochenzeilen), am 27.11. fünf Einträge · Wenn 1440 ×
  600 · Dann drei Einträge und „+2 weitere“, Seite scrollt · Wenn 1440 × 1400 · Dann gleich hohe
  Zeilen ohne Scrollen, am 27.11. mehr als drei ganze Einträge, „+n weitere“ nennt genau den Rest.
- AC-004: Angenommen Tablet 1024 × 1366, Woche · Dann hat jede Tageszeit ihre natürliche Höhe und die
  Seite scrollt (Und am Desktop mit offenem Tages-Fenster ist das Raster schmaler, aber gleich hoch).

**REQ-002 — Der Monat sieht aus wie die Woche.** Ab 700 px: kein Rahmen, keine senkrechten Linien;
jeder Tag eine Fläche mit runden Ecken wie ein Feld der Woche, 4 px Abstand; Wochenzeilen getrennt
durch eine Haarlinie `border`; heute mit `accentSoft` hinterlegt, Zahl in Akzentfarbe; Samstag und
Sonntag wie Werktage (die Woche hebt sie auch nicht hervor); Tage anderer Monate mit gedämpfter Zahl
(`textMuted`), Einträge normal; Reise-Streifen ohne Unterbrechung unter der Tageszahl, runde Enden
nur an Anfang und Ende der Reise. Einträge, gewählter Tag und blasse Ziele beim Ziehen bleiben.
Handy-Monat unverändert. Quelle: ER-26. Offline: vollständig.

- AC-005: Angenommen Desktop, Monat November 2026, am 5.12. abends „Lasagne“ · Dann kein Rahmen und
  keine senkrechte Linie, Tage als Flächen mit 4 px Abstand, Haarlinie zwischen den Wochenzeilen, der
  22.11. `accentSoft` mit Zahl in Akzentfarbe, 26.–31.10. und 1.–6.12. mit gedämpfter Zahl, „◆ Lasagne“
  am 5.12. wie bisher.
- AC-006: Angenommen Monat Dezember 2026 · Dann „Urlaub Mallorca“ in der Zeile 30.11.–6.12. als ein
  Streifen 4.–6.12. (links rund, rechts offen) und in der Zeile 7.–13.12. als 7.–10.12. (links offen,
  rechts rund) · Und 1.–3.12. und 11.–13.12. sehen aus wie Tage ohne Reise.
- AC-007: Angenommen Handybreite, Monat · Dann Raster mit Punkten wie bisher.

**REQ-003 — Hinzufügen im Monat wie in der Woche.** Im Desktop-Monat erscheint beim Darüberfahren und
bei Tastatur-Fokus oben rechts im Tag ein „+“ (mindestens 28 × 28 px, wie in der Woche); es öffnet
das Hinzufügen-Fenster für den Tag mit der Vorwahl aus Spec 0020 REQ-005 („Abend“, sonst die letzte
Tageszeit; `addPresetSlot`), danach bleibt die
Ansicht. Es öffnet nicht das Tages-Fenster; Ziehen auf dem „+“ zeichnet keine Reise. Jahr, Handy und
Tablet ohne Maus: Tages-Fenster. Quelle: ER-28. Offline: nur online; „+“ ausgegraut mit „Offline –
zum Bearbeiten brauchst du Netz“.

- AC-008: Angenommen Desktop, Monat November · Wenn ich über den 26.11. fahre · Dann erscheint „+“
  („Hinzufügen am Donnerstag, 26. November“) · Wenn ich es anklicke, „Eislaufen“ wähle und
  „Einplanen“ · Dann öffnet sich „Do 26. Nov“, kein Tages-Fenster, und danach steht „▲ Eislaufen“ am
  26.11. in der Ansicht „Monat“.
- AC-009: Angenommen Tablet ohne Maus · Dann kein „+“, ein Tipp öffnet das Tages-Fenster (Und
  offline ist das „+“ am Desktop ausgegraut mit dem Offline-Hinweis).

**REQ-004 — Handy: Woche und Jahr öffnen bei heute.** Zeigt die Woche die laufende Woche, steht beim
Öffnen, Ansichtswechsel und „Heute“ der heutige Tag oben; im Jahr der laufende Monat. Andere Wochen
und Jahre beginnen oben; ein gewählter Tag (Link aus Benachrichtigung) geht vor. Gilt auch für
scrollende Tablets; bei „Bewegung reduzieren“ ohne Animation. Quelle: K-10, K-11. Offline: vollständig.

- AC-010: Angenommen Handy, heute So 22.11. · Wenn ich den Kalender öffne · Dann Woche 16.–22.11. mit
  „SO 22. NOV“ direkt unter den Tabs · Wenn ich zur nächsten Woche blättere · Dann steht „MO 23. NOV“
  oben.
- AC-011: Angenommen Handy · Wenn ich „Jahr“ wähle · Dann steht November 2026 oben · Wenn ich zu 2027
  blättere · Dann Januar 2027.

**REQ-005 — Kleinigkeiten in Monat, Jahr und Woche.** Das Tages-Fenster zeigt die Aufgaben des Tags
immer, unabhängig vom Schalter der Haushalt-Zeile im Monat. In Texten, die Einträge eines Tags zählen
(Screenreader-Text eines Tags, Spec 0016), zählen Freitext und Reste als „Essen“, nicht als „Rezept“;
die Punkte bleiben. In der Desktop-Woche bricht ein Aufgabenname auf bis zu zwei Zeilen um, ein
Reise-Streifen zeigt seinen Text ganz, solange er passt. Quelle: K-11. Offline: lesend; Abhaken nur
online.

- AC-012: Angenommen Handy, Monat, Haushalt-Zeile im Monat aus, „Bad putzen“ am 29.11. fällig · Wenn
  ich den 29.11. antippe · Dann zeigt das Tages-Fenster „Bad putzen“ über den Tageszeiten.
- AC-013: Angenommen am 27.11. „Essen bei Oma“ (Freitext), „Lasagne“, „Reste von Mittwoch“ · Dann
  sagt der Screenreader „Freitag, 27. November: 1 Rezept, 2 Essen“.
- AC-014: Angenommen Desktop 1440 × 900, Woche 23.–29.11., „Fenster Wohnzimmer“ am 24.11. · Dann
  steht der Name ganz auf höchstens zwei Zeilen ohne „…“ (Und in der Woche 30.11.–6.12. steht
  „Urlaub Mallorca · bis Do 10.12.“ ganz).

### Einträge

**REQ-006 — Esser, Gäste, Portionen, Varianten am Eintrag.** Das Eintragsfenster zeigt bei Rezept und
Sammlung „Wer isst mit?“, Gäste und einen Zähler „Portionen“, bei Rezepten mit Varianten einen
Zähler je Variante mit Summe darunter; bei Restaurants nur „Wer isst mit?“ und Gäste. Dieselben
Zähler ersetzen die feste Anzeige im Hinzufügen-Fenster und bei „Einplanen“ auf der Rezeptseite.
Eine Person oder ein Gast mehr oder weniger ändert die Portionen um eine (Person: die Variante, die
sie beim Einplanen bekäme; Gast: Standard; beim Weggehen notfalls die Variante mit den meisten
Portionen), Handgezähltes bleibt. Kein Zähler unter 0, Summe nicht unter 1, solange jemand mitisst;
höchstens 1000 Portionen, 100 Gäste. Gespeichert beim Schließen (REQ-009). Quelle: K-01. Offline:
lesend; Chips und Zähler ausgegraut.

- AC-015: Angenommen Sa 28.11. abends „Lasagne“ mit Enrico, 1 Portion · Wenn ich „Nadja“ wähle ·
  Dann 2 Portionen · Wenn ich „+“ und „Fertig“ wähle · Dann beim erneuten Öffnen Enrico, Nadja und
  3 Portionen · Wenn ich Nadja abwähle · Dann 2.
- AC-016: Angenommen „Mango-Curry“ mit Enrico und Nadja, „mit Tofu 1 · mit Hähnchen 1“ · Wenn ich
  Hähnchen „−“, Tofu „+“ und „Fertig“ wähle · Dann „mit Tofu 2“, „mit Hähnchen 0“, „2 Portionen“ ·
  Wenn ich einen Gast dazunehme · Dann „mit Tofu 3“, „3 Portionen“.
- AC-017: Angenommen ich plane Mo 23.11. „Lasagne“ für Enrico und Nadja · Wenn ich zweimal „+“ und
  „Einplanen“ wähle · Dann steht sie mit 4 Portionen im Kalender.
- AC-018: Angenommen „Lasagne“ mit Enrico, 1 Portion · Dann ist „−“ ausgegraut; abgewählt steht 0
  (Und ein Aufruf am Fenster vorbei mit 1001 Portionen oder einem Haushaltsfremden als Esser wird vom
  Server abgelehnt).

**REQ-007 — Die Einkaufsliste geht mit den Portionen.** Ändern sich Portionen oder Varianten, rechnet
die App im selben Aufruf die Beiträge mit der Herkunft dieses Eintrags auf nicht abgehakten Posten
neu, so wie „Auf die Einkaufsliste“ sie für den neuen Stand setzen würde; die Herkunft bleibt. Fällt
eine Zutat weg, geht ihr Beitrag (ein leerer Posten verschwindet); kommt eine dazu, kommt sie auf die
Liste, außer sie ist ein Vorrat-Artikel (ein Posten je Artikel nach Spec 0025 REQ-013). Eine im
Vorratscheck angepasste Menge (Spec 0025 REQ-007) wird mit neu gerechnet. Stand nichts vom Eintrag auf
der Liste, ändert sich nichts.
Danach „Einkaufsliste angepasst: Lasagne (Sa)“. Quelle: K-01, L-03. Offline: nur online.

- AC-019: Angenommen „Lasagne“ Sa, 2 Portionen, auf der Liste „Hackfleisch 250 g“ und
  „Lasagneplatten 1×“ von „Lasagne (Sa)“ · Wenn ich 4 Portionen speichere · Dann „Hackfleisch 500 g“,
  „Lasagneplatten 1×“ und „Einkaufsliste angepasst: Lasagne (Sa)“.
- AC-020: Angenommen „Mango-Curry“ „mit Tofu 1 · mit Hähnchen 1“, auf der Liste „Kokosmilch 400 ml“,
  „Tofu 100 g“, „Hähnchenbrust 150 g“ · Wenn ich „mit Tofu 2 · mit Hähnchen 0“ speichere · Dann
  „Kokosmilch 400 ml“, „Tofu 200 g“, keine „Hähnchenbrust“.
- AC-021: Angenommen „Hackfleisch 250 g“ ist abgehakt · Wenn ich 4 Portionen speichere · Dann bleibt
  es abgehakt und unverändert (Und lehnt der Server ab, bleiben Eintrag und Liste, wie sie waren).

**REQ-008 — Freitext ändern, Zusatz für jeden Eintrag.** Ein Freitext-Eintrag hat im Fenster das Feld
„Was gibt es?“ (höchstens 500 Zeichen, ohne Zeilenumbruch, leer: „Bitte etwas eintragen“). Jede Art
hat im Eintragsfenster und im zweiten Schritt des Hinzufügen-Fensters das Feld „Zusatz“ (höchstens
120 Zeichen, Hinweis „Steht im Kalender in Klammern hinter dem Namen.“). Der Zusatz steht überall, wo
der Name steht (Kalender, Tages-Fenster, Übersicht, Benachrichtigungen): „Lasagne (doppelte
Menge)“, „Grillabend (mit Nachbarn) · 3 Rezepte“, mit Uhrzeit „Trattoria Da Enzo (Tisch für 6) ·
19:30“; nicht in der Herkunft der Liste. Quelle: K-05. Offline: lesend.

- AC-022: Angenommen So 29.11. mittags Freitext „Essen bei Oam“ · Wenn ich „Essen bei Oma“ eintrage
  und „Fertig“ · Dann steht „Essen bei Oma“ im Kalender (Und geleert bleibt das Fenster offen mit
  „Bitte etwas eintragen“).
- AC-023: Angenommen Sa 28.11. „Lasagne“ · Wenn ich als Zusatz „doppelte Menge“ speichere · Dann
  „Lasagne (doppelte Menge)“ in der Woche, Herkunft auf der Liste bleibt „Lasagne (Sa)“; beim
  Einplanen von „Trattoria Da Enzo“ mit „Tisch für 6“ steht „Trattoria Da Enzo (Tisch für 6)“.
- AC-024: Wenn ein Aufruf am Fenster vorbei einen Zusatz mit Zeilenumbruch oder einen leeren Freitext
  speichern will · Dann lehnt der Server ab.

**REQ-009 — Schließen speichert.** Jedes Schließen des Eintragsfensters (Fertig, ✕, Escape, nach unten
Ziehen, Android-Zurück) speichert alle geänderten Felder (Freitext, Zusatz, Uhrzeit, Esser, Gäste,
Portionen, Varianten mit Liste, Text der Erinnerung) in einem Aufruf — geändert heißt: anders als
beim Öffnen des Fensters; ohne Änderung wird nichts gesendet (Entscheidung 24); Tag, Tageszeit, „Wer kocht?“
und Schalter, Tag und Uhrzeit der Erinnerung speichern weiter sofort. „Zusatz speichern“ entfällt;
Enter speichert ein Feld sofort. Ungültige Eingabe: Fenster bleibt offen mit dem Grund; ein zweites
✕/Escape schließt, speichert das Gültige und zeigt „Nicht gespeichert: Was gibt es?“. Ablehnung durch den
Server: Fenster bleibt offen, Getipptes bleibt, „Hat nicht geklappt – bitte noch einmal versuchen“.
Quelle: K-03, K-01, K-05. Offline: Schließen schließt nur.

- AC-025: Angenommen „Eislaufen“ offen, Zusatz „Hohenschönhausen“ getippt · Wenn ich ✕ wähle · Dann
  „Eislaufen (Hohenschönhausen)“ im Kalender, und es gab keinen Knopf „Zusatz speichern“.
- AC-026: Angenommen bei Freitext „Essen bei Oma“ Zusatz „mit Kuchen“ getippt und „Was gibt es?“
  geleert · Wenn ich „Fertig“ wähle · Dann bleibt das Fenster offen mit „Bitte etwas eintragen“ · Wenn
  ich ✕ wähle · Dann schließt es, „Essen bei Oma (mit Kuchen)“, „Nicht gespeichert: Was gibt es?“.
- AC-027: Angenommen Zusatz „doppelte Menge“ getippt, Nadja hat „Lasagne“ inzwischen entfernt · Wenn
  ich ✕ wähle · Dann bleibt das Fenster offen mit „doppelte Menge“ und „Hat nicht geklappt – bitte
  noch einmal versuchen“.
- AC-049: Angenommen „Lasagne“ offen, Nadja ändert inzwischen Portionen und Zusatz, und mein Gerät
  gleicht ab · Wenn ich ohne Änderung „Fertig“ wähle · Dann bleiben Nadjas Portionen und Zusatz · Wenn
  ich danach im neu geöffneten Fenster nur „+“ bei den Portionen wähle und Nadja den Zusatz wieder
  ändert · Dann wird nur die Portionenzahl gespeichert, Nadjas Zusatz bleibt; ein Feld, das ich
  zurück auf den alten Wert stelle, gilt als nicht geändert.

**REQ-010 — Tag und Tageszeit lassen das Fenster offen.** Tages-Chips, Tageszeit-Chips, „Vormerken“
und die Wahl in „Anderes Datum …“ verschieben sofort, das Fenster bleibt offen und zeigt den neuen
Stand (Tages-Chips der neuen Woche, Block „Erinnern“ fehlt nach „Vormerken“); der Hinweis aus Spec
0016 mit „Rückgängig“ bestätigt; Getipptes bleibt stehen. Quelle: K-08. Offline: nur online, Chips
ausgegraut.

- AC-028: Angenommen Mi 25.11. abends „Lasagne“, Fenster offen · Wenn ich „Fr 27“ wähle · Dann bleibt
  es offen und „Lasagne → Fr 27.11., Abend“ mit „Rückgängig“ · Wenn ich „Mittag“ wähle · Dann „Lasagne
  → Fr 27.11., Mittag“ und das Fenster ist weiter offen.
- AC-029: Angenommen Zusatz „doppelte Menge“ getippt · Wenn ich über „Anderes Datum …“ den 8.1.2027
  wähle · Dann zeigen die Chips „Mo 4“ bis „So 10“ mit „Fr 8“ gewählt, und „doppelte Menge“ steht noch
  im Feld.

**REQ-011 — Reste stehen oben.** Das Hinzufügen-Fenster hat den Tab „Reste“ an zweiter Stelle („Alle ·
Reste · Rezepte · Sammlungen · Restaurants · Aktivitäten“) mit allen Resten und am Ende „Ältere Reste
…“; in „Alle“ steht über den Treffern die Gruppe „Reste“ mit den drei jüngsten und „Alle Reste ›“, die
Gruppe am Ende entfällt. Die Suche filtert auch Reste nach ihrem Namen. Ohne Zieltag (unter
„Vorgemerkt“) weder Tab noch Gruppe. Quelle: K-06. Offline: nur online (Einplanen).

- AC-030: Angenommen für Mo 23.11. mittags, davor „Lasagne“ (18.11.), „Shakshuka“ (20.11.),
  „Mango-Curry“ (21.11.), „Linsen-Dal“ (22.11.) · Wenn ich „+ Hinzufügen“ wähle · Dann oben in „Alle“
  „Reste von Linsen-Dal (So 22.11.)“, „Reste von Mango-Curry (Sa 21.11.)“, „Reste von Shakshuka (Fr
  20.11.)“ und „Alle Reste ›“ · Wenn ich „Alle Reste ›“ wähle · Dann Tab „Reste“ mit allen vier und
  „Ältere Reste …“.
- AC-031: Wenn ich „lasa“ tippe · Dann in der Gruppe „Reste“ nur „Reste von Lasagne (Mi 18.11.)“
  (Und unter „Vorgemerkt“ gibt es weder Tab noch Gruppe).

**REQ-012 — Reste-Regeln.** Angeboten werden Rezepte und Freitexte der sieben Tage vor dem Zieltag
und desselben Tags in einer früheren Tageszeit als der gewählten (Name „Reste von Linsen-Dal
(Mittag)“). „Ältere Reste …“ zeigt alle früheren Gerichte ohne Zeitgrenze, jüngste zuerst, mit
Datum, durchsuchbar. Bindend ist nur noch: Reste stehen nach ihrem Gericht (späterer Tag oder
derselbe Tag in späterer Tageszeit); die Grenze „höchstens sieben Tage danach“ entfällt. Gilt beim
Ziehen, für die Chips, „Anderes Datum …“ und die Tageszeit-Chips im zweiten Schritt (zu frühe sind
ausgegraut). Quelle: K-07. Offline: nur online.

- AC-032: Angenommen So 22.11. mittags „Linsen-Dal“ · Wenn ich für So 22.11. abends hinzufüge · Dann
  steht „Reste von Linsen-Dal (Mittag)“ zuerst (Und für So vormittags wird es nicht angeboten).
- AC-033: Angenommen Mi 4.11. „Lasagne“ · Wenn ich im Tab „Reste“ „Ältere Reste …“ wähle · Dann steht
  „Reste von Lasagne (Mi 4.11.)“ zur Wahl, und eingeplant für So 22.11. ist es gültig.
- AC-034: Angenommen So mittags „Linsen-Dal“, abends seine Reste · Wenn ich „Linsen-Dal“ auf So abends
  ziehe · Dann „Reste von Linsen-Dal stehen schon am So 22.11.“ und nichts ändert sich · Wenn ich die
  Reste auf So vormittags ziehe · Dann „Reste stehen immer nach ihrem Gericht“ (Und auf den 10.12.
  ziehen ist erlaubt).

**REQ-013 — Uhrzeit für Restaurants und Aktivitäten.** Restaurant- und Aktivitäts-Einträge haben im
Eintragsfenster, im zweiten Schritt des Hinzufügen-Fensters und im Einplanen-Fenster (Spec 0024)
„Uhrzeit (optional)“ (Auswahl „Stunde“/„Minute“ in 5-Minuten-Schritten nach Spec 0027 REQ-007, ✕
entfernt; Hinweis Restaurant „Die Uhrzeit, für die ihr reserviert habt.“,
Aktivität „Wann es losgeht.“). Angezeigt wie heute die Reservierung: „Eislaufen (Hohenschönhausen) ·
10:30“, auf der Übersicht „Vormittag · 10:30“, im Tagesüberblick „Eislaufen (Hohenschönhausen,
Vormittag, 10:30)“, am Vortag „Morgen: Eislaufen (Hohenschönhausen), Vormittag, 10:30“. Verschieben
und Tageszeit-Wechsel lassen sie stehen. Andere Arten haben keine Uhrzeit. Quelle: K-09. Offline:
lesend.

- AC-035: Angenommen Sa 28.11. vormittags „Eislaufen“ · Wenn ich Uhrzeit „10:30“ speichere · Dann
  „Eislaufen · 10:30“ in der Woche und „Vormittag · 10:30“ auf der Übersicht am Samstag.
- AC-036: Wenn ich „Minute“ öffne · Dann bietet sie nur 00, 05, … 55 (Und ein Aufruf am Fenster
  vorbei mit 10:33 oder mit einer Uhrzeit an „Lasagne“ wird vom Server abgelehnt).

**REQ-014 — Eine Erinnerung je Eintrag.** Die Erinnerung aus Spec 0017 ist die einzige; „Erinnern n
vorher“ an der Reservierung und die Art „Restaurant-Reservierung“ auf „Benachrichtigungen“ entfallen.
Bekommt ein Eintrag ohne Erinnerung seine erste Uhrzeit, schaltet sich „Erinnern“ ein: „Am Tag“,
Uhrzeit minus 2 h (vor 02:00: „Am Vortag“), nur wenn das in der Zukunft liegt; abschaltbar. Beim
Einschalten von Hand mit Uhrzeit gilt derselbe Vorschlag statt der Tageszeit-Vorgabe. Eine spätere
Änderung der Uhrzeit verschiebt die Erinnerung nicht; liegt sie danach hinter der Uhrzeit, steht im
Block „Die Erinnerung liegt nach der Uhrzeit“. Mit Uhrzeit nennt die Nachricht sie statt der
Tageszeit: „Erinnerung: Trattoria Da Enzo · heute 19:30“, „… · morgen 19:30“, „… · Sa 28.11., 19:30“.
Empfänger, Ruhe auf Reisen, Planer wie Spec 0017. Quelle: K-09. Offline: nur online; Zustellung auf
dem Server.

- AC-037: Angenommen Sa 28.11. abends „Trattoria Da Enzo“ mit Enrico und Nadja · Wenn ich „19:30“
  setze · Dann ist „Erinnern“ an mit „Am Tag“ 17:30 · Wenn es Sa 17:30 wird · Dann bekommen beide
  „Erinnerung: Trattoria Da Enzo · heute 19:30“.
- AC-038: Angenommen es ist Sa 18:30 · Wenn ich „19:30“ setze · Dann bleibt „Erinnern“ aus · Und
  ändere ich bei einer Erinnerung 17:30 die Uhrzeit auf 17:00, bleibt 17:30 mit „Die Erinnerung liegt
  nach der Uhrzeit“.
- AC-039: Angenommen ich öffne „Benachrichtigungen“ · Dann gibt es „Erinnerungen an Einträgen“, aber
  keine „Restaurant-Reservierung“ (Und der Planer sendet keine Nachricht der Art
  `reservation_reminder` mehr).

**REQ-015 — Entfernen fragt nach der Liste.** Stehen Beiträge des Eintrags auf nicht abgehakten
Posten, fragt „Aus dem Plan nehmen“ in einem kleinen Fenster „Lasagne aus dem Plan nehmen?“ mit „Für
Lasagne (Sa) stehen 2 Zutaten auf der Einkaufsliste.“ und „Zutaten auch von der Liste nehmen“
(vorgewählt), „Nur aus dem Plan nehmen“, „Abbrechen“ (auch Escape, Android-Zurück). Weg gehen nur
diese Beiträge; ein Posten mit anderen Beiträgen bleibt mit ihnen. Danach „Lasagne entfernt · 2
Zutaten von der Liste genommen“ mit „Rückgängig“ (Eintrag, Erinnerung und Beiträge). Ohne Beiträge
wie bisher ohne Frage. Verschieben und Vormerken fragen nicht; die Herkunft nennt den neuen Tag bzw.
„(vorgemerkt)“ (Spec 0016, AC-017). Quelle: L-03. Offline: nur online.

- AC-040: Angenommen „Lasagne“ Sa mit „Hackfleisch 250 g“ und „Lasagneplatten 1×“ auf der Liste ·
  Wenn ich „Aus dem Plan nehmen“ und „Zutaten auch von der Liste nehmen“ wähle · Dann sind Eintrag und
  beide Beiträge weg, Hinweis „Lasagne entfernt · 2 Zutaten von der Liste genommen“ · Wenn ich
  „Rückgängig“ wähle · Dann ist alles wieder da.
- AC-041: Angenommen „Hackfleisch“ steht auch von Hand auf der Liste („von Hand: 1×“) · Wenn ich mit
  Zutaten entferne · Dann bleibt „Hackfleisch“ mit „von Hand: 1×“ (Und „Abbrechen“ ändert nichts; ein
  abgehakter Posten zählt nicht und bleibt).

### Nachtrag aus Review 0002

Vorgezogen aus Enricos Review 0002 (22.11.2026). Allgemeine Handy-Punkte (Hintergrund der Fenster,
Abstände unten, Wischen zwischen Tabs, Karten-Link) regelt Spec 0029; `Sheet`, `shell.tsx`,
`ViewTabs` und Karten-Links ändert diese Spec nicht.

**REQ-016 — Aufgaben im Kalender erledigen und verwalten.** Eine Aufgabe im Kalender (Haushalt-Zeile
der Woche, Monat, Tages-Fenster) lässt sich an jedem Tag abhaken, auch wenn sie erst in der Zukunft
fällig ist; Abhaken bucht wie unter „Haushalt“ (`complete_chore`) mit dem heutigen Datum als
Erledigt-Tag. Ein Tipp auf den Namen öffnet dasselbe Fenster der Aufgabe wie unter „Haushalt“
(Bearbeiten, Verlauf, Überspringen …), nicht nur das Abhaken. Erledigte Vorkommen bleiben
durchgestrichen wie bisher. Quelle: Review 0002. Offline: lesend; Abhaken und Fenster-Aktionen nur
online (ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“).

- AC-042: Angenommen heute So 22.11., „Bad putzen“ fällig am Fr 27.11. · Wenn ich im Kalender am
  27.11. „Bad putzen“ abhake · Dann ist sie mit Erledigt-Tag So 22.11. gebucht, wie unter „Haushalt“.
- AC-043: Wenn ich im Tages-Fenster des 27.11. auf „Bad putzen“ tippe · Dann öffnet sich das
  Fenster „Bad putzen“ wie unter „Haushalt“ (Und offline ist der Haken ausgegraut).

**REQ-017 — Aufgaben in Monat und Jahr.** Monat (Desktop und Tablet): mit eingeschalteter
Haushalt-Zeile stehen die Aufgaben eines Tags als eigene Zeilen unter den Einträgen und zählen in
„+n weitere“ mit; Handy-Monat: Aufgaben als Punkt der Art „Aufgabe“ (K-11). Jahr: jeder Tag mit
fälligen Aufgaben zeigt den Punkt „Aufgabe“, und das Tages-Fenster zeigt sie (REQ-005); das Jahr
bekommt keinen eigenen Schalter (der Punkt ist immer da). Quelle: Review 0002, K-11. Offline: lesend.

- AC-044: Angenommen Desktop, Monat November, Haushalt-Zeile an, am 29.11. „Bad putzen“ und zwei
  Einträge · Dann stehen am 29.11. beide Einträge und „Bad putzen“ als Zeile.
- AC-045: Angenommen Jahr 2026 · Dann trägt der 29.11. den Punkt „Aufgabe“, und ein Tipp zeigt „Bad
  putzen“ im Tages-Fenster.

**REQ-018 — Handy-Kopf des Kalenders steht fest.** Auf dem Handy steht der linke Pfeil am linken
Rand, der rechte am rechten Rand, die Beschriftung („16.–22. Nov“, „November 2026“, „2026“) mittig
in einem festen Platz; eine längere oder kürzere Beschriftung verschiebt die Pfeile nicht. Ist die
gezeigte Zeitspanne nicht die heutige, wird die Beschriftung zum Knopf „Zu heute“ (Unterzeile
„Heute ›“ im selben Platz, Bildschirmleser „Zurück zu heute“); in der heutigen Zeitspanne ist sie nur
Text. Tablet und Desktop bleiben, wie sie sind. Quelle: Review 0002. Offline: vollständig.

- AC-046: Angenommen Handy, Woche 16.–22.11. · Wenn ich zur Woche 23.–29.11. blättere · Dann stehen
  beide Pfeile an derselben Stelle wie vorher, und unter „23.–29. Nov“ steht „Heute ›“ · Wenn ich die
  Beschriftung antippe · Dann zeigt der Kalender die Woche 16.–22.11. ohne „Heute ›“.

**REQ-019 — Wischen blättert auf dem Handy.** Auf dem Handy blättert ein waagerechtes Wischen über
den Kalender zur nächsten (nach links) oder vorigen (nach rechts) Zeitspanne der Ansicht (Woche,
Monat, Jahr), wie die Pfeile. Ziehen eines Eintrags beginnt weiter erst nach Halten (Spec 0016) und
blättert nie; das Tages-Fenster behält sein eigenes Wischen. Bei „Bewegung reduzieren“ ohne
Animation. Die Pfeile bleiben. Quelle: Review 0002. Offline: vollständig.

- AC-047: Angenommen Handy, Monat November · Wenn ich nach links wische · Dann zeigt der Kalender
  Dezember 2026 · Wenn ich nach rechts wische · Dann wieder November.
- AC-048: Angenommen Handy, Woche · Wenn ich „Lasagne“ halte und waagerecht ziehe · Dann wird sie
  verschoben und die Woche blättert nicht.

## Entscheidungen

Entschieden von Claude nach Enricos Regel „Empfehlung nehmen“ (22.11.2026).

1. Mindesthöhen: Tageszeit 120 px, Monatszeile = drei Einträge + „+n weitere“, Jahr = heutige Größe
   — kleinste Werte, bei denen nichts abgeschnitten wird.
2. Wochenende im Monat ohne eigene Fläche (A) statt getönt (B) — die Woche ist das Vorbild.
3. Uhrzeit nur für Restaurant und Aktivität (A) statt für alle Arten (B) — nur dort gibt es einen
   Beginn; D43 bleibt für Rezepte.
4. Reservierungs-Erinnerung in die Erinnerung aus 0017 überführt (A) statt getrennt (B) — ein
   Konzept je Eintrag, ein Planer weniger. Vorschlag 2 h vorher ersetzt den Standard „an“ aus 0013
   (D36). Erinnerung folgt einer geänderten Uhrzeit nicht (nur Hinweis) — kein verstecktes Verhalten.
5. Zusatz für alle Arten (Spec 0004, Offene Frage 5 → B).
6. Jedes Schließen speichert (A) statt ✕ verwirft (B) — K-03: Eingaben gehen nie still verloren.
7. Portionen: Änderungen an Essern ±1 (A) statt Neuberechnung (B) — Handgezähltes („doppelt“) bleibt.
8. Liste folgt Portionen automatisch mit Hinweis (A) statt Rückfrage (B) — der Zähler sitzt im
   Fenster, eine Frage pro Schließen wäre zu viel; abgehakte Posten bleiben.
9. L-03: Frage nur beim Entfernen (A); Verschieben und Vormerken behalten die Beiträge (B wäre Frage
   auch dort) — das Gericht wird weiter gekocht.
10. Reste: Tab plus drei oben (A) statt nur Chips (B); „Ältere Reste …“ ohne Zeitgrenze, deshalb
    entfällt die 7-Tage-Bindung in `plan-move.ts` (`too-far`) — sonst wären ältere Reste nie gültig.
11. Freitext und Reste zählen als „Essen“ (A) statt „Freitext“/„Reste“ (B) — ein Wort, Einzahl und
    Mehrzahl gleich.

Geänderte Kriterien älterer Specs: 0013 REQ-008 (AC-027 bis AC-031), AC-011 (Art
„Restaurant-Reservierung“), AC-037 (Reservierung als eigene Nachricht), Nicht-Ziel „Keine Uhrzeit für
… Aktivitäten“; 0017 Nicht-Ziele „Keine Uhrzeit für den Eintrag“ und „Reservierungs-Erinnerung
ändert sich nicht“, REQ-003 (Anfangswerte mit Uhrzeit), REQ-005 (<Wann> mit Uhrzeit); 0018 AC-008
(Restaurant hat jetzt Zusatz und Uhrzeit) und Nicht-Ziel „Zusatz speichern bleibt, ✕ ändert sich
nicht“; 0016 REQ-004 und AC-015 (7-Tage-Grenze entfällt), REQ-006 (Aufgaben im Tages-Fenster nur mit
Haushalt-Zeile); 0010 REQ-004/AC-012 (höchstens drei je Tag → so viele, wie passen), REQ-011 (frühere
Tageszeit desselben Tags zählt); 0004 Nicht-Ziel „Kein Zusatz für Rezepte und Restaurants“.

12. Abgestimmt mit Spec 0027, 22.11.2026: Uhrzeit wird gewählt, nicht getippt (REQ-007 dort);
    AC-026 und AC-036 prüfen deshalb Freitext bzw. die Auswahl statt „19:33“.
13. Abgestimmt mit Spec 0024, 22.11.2026: Das Einplanen-Fenster für Restaurant und Aktivität
    übernimmt „Uhrzeit (optional)“ und „Zusatz“ von hier; „Reserviert um“ und „Erinnern n vorher“
    gibt es nirgends mehr.
14. Abgestimmt mit Spec 0025, 22.11.2026: Neu rechnen überschreibt auch eine im Vorratscheck
    angepasste Menge (kein Merkmal „von Hand angepasst“ am Beitrag); der Hinweis „Einkaufsliste
    angepasst“ sagt es. Vorwahl der Tageszeit kommt aus Spec 0020 (`addPresetSlot`).

Beim Bau entschieden (Claude, 22.11.2026, jeweils die einfachste zur Spec passende Lösung):

15. Der Text der Erinnerung geht beim Schließen im selben Aufruf mit (`saveEntry`, `reminderText`);
    Verlassen des Felds speichert ihn nicht mehr, Enter weiter sofort.
16. Eine Regel für die Liste: `recomputeEntryContributions` in `packages/core/src/entry-edit.ts`;
    der Reisende-raus-Weg aus Spec 0022 nutzt sie über `followEntryOnList`. Neu gerechnet wird nur,
    wenn sich Portionen oder Varianten ändern. Nach Spec 0025 (ein Posten je Artikel, REQ-013): eine
    neue Zutat kommt auf den offenen Posten ihres Artikels, öffnet einen abgehakten mit der neuen
    Menge wieder (wie „Auf die Einkaufsliste“) oder bekommt einen neuen; ein abgehakter Posten mit
    einem Beitrag des Eintrags bleibt, wie er ist (AC-021).
17. „Ältere Reste …“ zeigt alle früheren Gerichte, auch die der letzten sieben Tage.
18. Im Tagesüberblick steht der Zusatz als erste Angabe in der Klammer: „Hummus (doppelte Menge,
    Mittag, du kochst)“.
19. Das Fenster „… aus dem Plan nehmen?“ hat drei Knöpfe untereinander; „Zutaten auch von der Liste
    nehmen“ ist der Hauptknopf (vorgewählt).
20. REQ-004 nur im Browser (die App ist PWA-only); REQ-019 nutzt das vorhandene Wischen aus
    `packages/ui` (`SwipeArea`), sein Test liegt dort. Handy-Monat: der Punkt „Aufgabe“ folgt weiter
    dem Schalter der Haushalt-Zeile; im Jahr ist er immer da.

21. Liste und Eintrag in einem Aufruf ohne Löschgrenze: `apply_changes` kennt die Domänen-Operation
    `replace_entry_contributions` (Einträge, neue Beiträge). Sie nimmt die Beiträge der Einträge von
    offenen Posten, fügt die neuen wie `add_contributions` hinzu und löscht geleerte offene Posten;
    sie zählt als eine Löschung, gleich wie viele Beiträge (begrenzt durch höchstens 200 Einträge).
    So folgen auch Gerichte mit mehr als 20 Zutaten den Portionen (REQ-007), lassen sich mit ihren
    Zutaten entfernen (REQ-015) und Reisende aus vielen Gerichten nehmen (Spec 0022). Neu gerechnete
    Beiträge bekommen neue Kennungen; „Rückgängig“ setzt Zeilen und alte Beiträge im selben Aufruf
    zurück.
22. AC-009: Das ausgegraute „+“ im Desktop-Monat zeigt beim Klick den Hinweis „Offline – zum
    Bearbeiten brauchst du Netz“ als Toast (wie beim Ziehen offline, Spec 0016) und öffnet weder das
    Hinzufügen- noch das Tages-Fenster.
23. AC-014, Reise-Streifen: gemessen am 22.11. im Web-Export bei 1440 × 900, Woche 30.11.–6.12.: der
    Streifen „Urlaub Mallorca · bis Do 10.12.“ ist 435 px breit, sein Text 163 px und nicht gekürzt
    (`scrollWidth` = `clientWidth`). Gekürzt („…“) wird nur, wenn der Abschnitt der Woche schmaler
    ist als Abzeichen und Text (ein Tag ≈ 145 px) — das ist „solange er passt“; kein Umbau nötig.
    Der e2e-Rundgang prüft es (`rundgang-kalender-0021.spec.ts`).

Nachtrag e2e-Reparatur (27.11.2026, Claude):

24. Schließen sendet nur, was sich gegenüber dem Stand beim Öffnen geändert hat (A), statt alle
    Felder mit dem Cache beim Schließen zu vergleichen (B). Fehler: Das Fenster übernimmt seinen
    Entwurf beim Öffnen aus dem Cache und schrieb Esser, Gäste und Portionen immer zurück; kam
    während das Fenster offen war ein neuerer Stand per Abgleich (nach einem Neuladen vor dem
    Abgleich oder nach einer Änderung auf einem anderen Gerät), überschrieb ein bloßes Schließen
    ihn. Die Regel ist die reine Funktion `changedEntryFields` in `packages/core/src/entry-changes.ts`:
    Texte getrimmt, Esser als Menge, Varianten nach Portionen (Zeilen mit 0 zählen nicht); ohne
    Änderung kein Aufruf. Das Fenster zeigt weiter seinen Stand beim Öffnen, nicht geänderte Felder
    bleiben auf dem Server, wie sie sind (zuletzt Gespeichertes gilt je Feld).

OFFEN: keine.

## Daten

`meal_plan_entries`: `reserved_at` → `starts_at time` (5-Minuten-Schritte, nur `kind in
('restaurant','activity')`); Prüfregel `note_only_activity` entfällt (Zusatz für alle Arten);
`apply_changes`-Allowlist entsprechend. Planer: `plan_entry_title` mit Zusatz für alle Arten,
`entry_reminder_body` mit Uhrzeit statt Tageszeit, Tagesüberblick und Vortag mit `starts_at`.
Beiträge neu rechnen/entfernen über `apply_changes` im selben Aufruf, mit der Domänen-Operation
`replace_entry_contributions` (`private.replace_entry_contributions`, security invoker; Entscheidung
21).

Entfällt: Spalte `meal_plan_entries.remind_minutes_before` samt Prüfregel,
`notification_settings.reservation_reminders_enabled`, Funktion
`private.reservation_reminder_candidates`, Art `reservation_reminder` im Zustell-Protokoll; im Code
`RemindMinutes`, `REMIND_CHOICES`, `remindLabel`, `DEFAULT_REMIND_MINUTES`, `setReservation`,
`reservationTime`, `ReservationFields`, Art `reservationReminders` (core `notifications.ts`, App
`kinds-section.tsx`), `MoveBlockReason` `too-far`, Knopf „Zusatz speichern“. Glossar: „Reservierung“
neu fassen (Uhrzeit am Restaurant-Eintrag, ohne eigene Erinnerung), neu „Uhrzeit (Eintrag)“
(`startsAt`/`starts_at`); „Zusatz“ gilt für alle Planeinträge.

## Risiken

| Risiko                                                         | Gegenmaßnahme                                        | Test                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| Fremder Haushalt ändert Eintrag oder Beiträge                  | RLS und `apply_changes`-Mitgliedsprüfung unverändert | pgTAP `domain_isolation`, neue Fälle `starts_at`                 |
| Uhrzeit an Rezept, 19:33, Zusatz mit Steuerzeichen, 1001 Port. | Prüfregeln in der Datenbank                          | pgTAP `entry_reminders`/neu `plan_entry_fields`                  |
| Abgemeldet schreibt                                            | `apply_changes` nur für `authenticated`              | pgTAP `apply_changes`                                            |
| Liste und Eintrag laufen auseinander                           | ein Aufruf, beide oder keins (ADR-0011)              | api `commands-plan.backend.test.ts` (AC-019, AC-021)             |
| Entfernen löscht fremde oder abgehakte Beiträge                | nur Herkunft dieses Eintrags, nur nicht abgehakt     | core `entry-edit.test.ts`, pgTAP `entry_contributions` (AC-041)  |
| Mehr als 20 Zutaten scheitern an der Löschgrenze               | eine Domänen-Operation, zählt als eine Löschung      | pgTAP `entry_contributions`, api `commands-plan.backend.test.ts` |
| Nachricht in Core und SQL verschieden                          | Paritätstest                                         | pgTAP `notification_parity` (AC-037)                             |
| Alte Reservierungs-Nachricht kommt doppelt oder weiter         | Funktion und Art entfallen                           | pgTAP `notification_scheduler` (AC-039)                          |
| Veralteter Entwurf im Fenster überschreibt neueren Serverstand | nur seit dem Öffnen Geändertes senden (Entsch. 24)   | core `entry-changes.test.ts`, e2e `eintraege-0021` (AC-049)      |

## Umsetzung

- [x] 1. Migration: `starts_at`, Prüfregeln, Entfallenes, `apply_changes`, Planer; pgTAP (AC-018,
      AC-024, AC-036, AC-039)
- [x] 2. Core: Reste-Regeln und `plan-move` mit Tageszeit, ohne `too-far` (AC-032–AC-034);
      Portionen-Delta (AC-015–AC-018); Beiträge neu rechnen (AC-019–AC-021, AC-041); Zählen „Essen“
      (AC-013); Erinnerungsvorschlag und Text (AC-037, AC-038)
- [x] 3. Api: Speichern beim Schließen in einem Aufruf, Entfernen mit Beiträgen (AC-025–AC-027,
      AC-040)
- [x] 4. Eintragsfenster: Felder, Schließen, Chips offen (AC-015, AC-022–AC-029, AC-035)
- [x] 5. Hinzufügen-Fenster: Zähler, Zusatz, Uhrzeit, Tab „Reste“ (AC-017, AC-030, AC-031)
- [x] 6. Benachrichtigungen-Seite ohne Reservierung (AC-039)
- [x] 7. Kalender: Höhe, Monat-Aussehen, „+“, Scrollen zu heute, Kleinigkeiten (AC-001–AC-014)
- [x] 8. Aufräumen: Entfallenes aus „Daten“ im Code entfernen
- [x] 9. Nachtrag Review 0002: Aufgaben erledigen und Fenster im Kalender, Aufgaben in Monat und
      Jahr, fester Handy-Kopf mit „Heute ›“, Wischen blättert (AC-042–AC-048)
- [x] 10. Nachtrag e2e-Reparatur: Schließen sendet nur Geändertes (AC-049, Entscheidung 24)
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün, pgTAP 39 Dateien/2261 Tests
      grün (über den DB-Lock), e2e nur typgeprüft; `/security-check` (22.11.: 0 kritisch/hoch/mittel,
      der niedrige Befund „Format-Zeichen im Zusatz“ ist behoben, `*_no_format`); `/ui-verify` in 0028
