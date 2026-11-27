---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-27
---

# 0063 — Vorschläge beim Planen

**Quelle:** Review 0004, Konzept „Planen ohne Nachdenken“ (`tmp/review-0004/konzept-vorschlaege/`,
Bilder `variante-a.png`, `variante-c.png`, `empfehlung-desktop.png`), von Enrico am 27.11.2026
freigegeben: Variante A und C, „Höchstens 1 von 3 ‚Noch nie gekocht‘“, kein Slop. **Kritischer
Pfad:** nein (kein Schema, keine Rechte, kein neuer Sync; geschrieben wird über die bestehenden
Befehle).

## Ziel

Wer einen Abend füllen will, sieht im Hinzufügen-Fenster drei passende Rezepte mit einem
nachvollziehbaren Grund und plant eins mit einem Tipp ein, statt durch 582 Rezepte A–Z zu
scrollen. Wer die ganze Woche planen will, tippt in „Was kochen wir?“ an, worauf er Lust hat; die
App verteilt das auf die freien Abende, zeigt die Verteilung und speichert alles mit einem Tipp.
Nichts landet ungefragt im Plan, nichts muss weggeklickt werden.

## Nicht-Ziele

- Keine KI, keine Einstellungen, kein „Vorschlag ausblenden“, kein Badge, kein Push.
- Keine Geister-Einträge im Kalender (Variante B ist verworfen) und keine gestrichelte
  Vorschau mit Ziehen im Desktop-Raster (siehe Entscheidung 9).
- Kein Schema, keine Migration, nichts Gespeichertes über Vorschläge; sie werden auf dem Gerät
  berechnet.
- Keine Vorschläge für Restaurants, Aktivitäten oder Sammlungen (Sammlungen nur, wenn
  vorgemerkt); keine Vorschläge für vergangene Tage und ohne Tag („Vormerken“).
- Die Kalender-Kopfzeile und ihr ⋯ bleiben unberührt (Spec 0054).

## Anforderungen

Beispielhaushalt: Enrico isst alles, Nadja vegetarisch. Heute ist Fr 27.11.2026, 12:00. Abend ist
die letzte Tageszeit, Vormittag die erste.

### Auswahl (beide Varianten, `packages/core/src/plan-suggestions.ts`)

**REQ-001 — Harte Regeln.** Vorgeschlagen wird nur ein Rezept (Art „Rezept“; eine Sammlung nur,
wenn sie vorgemerkt ist), das Zutaten hat, dessen Gerichtart zur Tageszeit passt (erste Tageszeit
→ Frühstück, sonst Hauptgericht; eine vorgemerkte Sammlung nie zum Frühstück), das für **jeden**
Esser eine passende Variante ohne seine Abneigungen hat (Ernährung wie „Passt für alle“, Abneigung
im Titel, Artikelnamen oder Synonym), das kein Esser mit 2 ★ oder weniger bewertet hat, das in den
letzten 14 Tagen nicht gekocht wurde, nicht ±7 Tage um den Tag im Plan steht (auch nicht in einer
geplanten Sammlung) und dessen Vorlauf noch machbar ist. Esser sind alle des Haushalts (Spec 0030,
REQ-008). Offline: offline vollständig (rechnet nur mit dem Cache).

- AC-001: Angenommen „Butter Chicken“ (nur Fleisch) und „Pad See Ew“ mit den Varianten „Tofu“ und
  „Hähnchen“ · Wenn Vorschläge für Do 3.12. Abend berechnet werden · Dann fehlt „Butter Chicken“,
  „Pad See Ew“ kann vorkommen
- AC-002: Angenommen Nadja mag keine „Pilze“ und „Pilzrisotto“ hat den Artikel „Pilze“ ohne
  Variante · Dann wird „Pilzrisotto“ nie vorgeschlagen
- AC-003: Angenommen Nadja hat „Shakshuka“ mit 2 ★ bewertet · Dann wird „Shakshuka“ nie
  vorgeschlagen
- AC-004: Angenommen „Dal“ wurde am 20.11. gekocht und „Chili“ steht am Mo 7.12. im Plan · Dann
  kommen für Do 3.12. weder „Dal“ noch „Chili“ vor
- AC-005: Angenommen „Kichererbsen-Curry“ braucht 12 h Vorlauf (Abend 17 Uhr → Vorabend) · Wenn
  es heute 20:00 oder später ist · Dann wird es für morgen Abend nicht vorgeschlagen, um 19:55 schon
- AC-006: Angenommen ein Rezept hat nur einen Titel (keine Zutaten) · Dann wird es nie
  vorgeschlagen
- AC-007: Angenommen der Vormittag · Dann kommen nur Frühstücke vor, am Abend nur Hauptgerichte

**REQ-002 — Gründe statt Punkte.** Jeder Vorschlag hat einen Grund aus echten Daten (die zwei
stärksten aus: „Vorgemerkt“, „Favorit von Nadja“ / „Euer Favorit“, „4,5 ★“ / „5 ★ von beiden“,
„zuletzt vor 8 Wochen“, „Noch nie gekocht“, „am Wochenende“) und eine Faktenzeile („35 Min ·
vegetarisch“, „Tofu für Nadja“, „Vorlauf: Linsen einweichen“). Es gibt keine Punktzahl und keine
Wertungsworte. Offline: offline vollständig.

- AC-008: Angenommen Nadja hat „Kokos-Curry“ als Favorit, es wurde vor 56 Tagen zuletzt gekocht ·
  Dann lautet der Grund „Favorit von Nadja · zuletzt vor 8 Wochen“
- AC-009: Angenommen „Shakshuka“ hat von Enrico und Nadja 5 ★ · Dann beginnt der Grund mit „5 ★
  von beiden“
- AC-010: Angenommen „Pad See Ew“ (25 Min) und Nadja braucht die Variante „Tofu“ · Dann lautet
  die Faktenzeile „25 Min · Tofu für Nadja“

**REQ-003 — Stabil und unabhängig von der Reihenfolge.** Gleiche Daten in derselben Woche ergeben
dieselben Vorschläge, auf jedem Gerät und nach jedem Neustart, auch wenn der Sync die Rezepte anders
sortiert. Zufall entsteht nur aus Haushalt, Woche, Tageszeit und Runde. Offline: offline vollständig.

- AC-011: Angenommen dieselben Daten · Wenn die Rezepte in umgekehrter Reihenfolge kommen oder
  ein anderer Tag derselben Woche gewählt wird · Dann sind die Vorschläge dieselben (bis auf
  Tagesregeln wie Vorlauf und Wochenende)

**REQ-004 — Abwechslung, Grenzen.** Die 3 Vorschläge haben verschiedene Beilagen (Nudeln, Reis,
Kartoffeln, Brot, Hülsenfrüchte, abgeleitet aus den Zutaten; „sonst“ zählt nicht) und höchstens
einer ist „Noch nie gekocht“. Die Wochenkarte hat je Beilage, je Küche und für „Noch nie gekocht“
höchstens 2. Reichen die passenden Rezepte nicht, werden die weichen Grenzen nacheinander gelockert
(Küche, Beilage, neu); die harten Regeln nie. Gibt es weniger als 3 passende Rezepte, gibt es keine
Vorschläge. Unter der Woche (Mo–Fr) stehen Gerichte über 45 Min hinten an. Offline: offline
vollständig.

- AC-012: Angenommen 10 passende Rezepte, 2 davon schon gekocht · Dann sind unter den 3 Vorschlägen
  höchstens 1 „Noch nie gekocht“
- AC-013: Angenommen kein passendes Rezept wurde je gekocht · Dann gibt es trotzdem 3 Vorschläge
  (Grenze gelockert) und der Satz „Noch wenig gekocht und bewertet. Mit jedem „Wie war’s?“ werden
  die Vorschläge persönlicher.“ steht darunter
- AC-014: Angenommen „Pad See Ew“ mit „Reisnudeln“ · Dann ist die Beilage Nudeln, nicht Reis; ein
  Rezept mit „Preiselbeeren“ hat keine Reis-Beilage
- AC-015: Angenommen nur 2 passende Rezepte · Dann gibt es keine Vorschläge (Block und Zeile
  fehlen)

### Variante A — im Hinzufügen-Fenster

**REQ-005 — Block „Vorschläge für …“.** Im Hinzufügen-Fenster eines Tages ab heute steht bei leerem
Suchfeld in „Alle“ und „Rezepte“ oben der Block „Vorschläge für Donnerstagabend“ (Frühstück: „…
fürs Frühstück“) mit 3 Zeilen (Foto, Name, Grund, Fakten, „+“), Vorgemerktes zuerst. Darunter
folgt alles wie bisher. Beim ersten getippten Buchstaben verschwindet der Block. Offline: offline
lesend (sichtbar; „+“ ausgegraut mit „Einplanen geht nur online“, siehe REQ-006).

- AC-016: Angenommen „+ Hinzufügen“ am Do 3.12. Abend · Dann steht „Vorschläge für
  Donnerstagabend“ mit 3 Zeilen über den Rezepten A–Z
- AC-017: Angenommen der Block steht · Wenn ich „L“ tippe oder „Restaurants“ wähle · Dann ist der
  Block weg
- AC-018: Angenommen „+ Hinzufügen“ an einem vergangenen Tag oder „vormerken“ · Dann gibt es keinen
  Block
- AC-019: Angenommen „Dal Makhani“ ist vorgemerkt und passt · Dann steht es als erste Zeile mit
  „Vorgemerkt“

**REQ-006 — „+“ plant sofort, „Rückgängig“.** „+“ plant mit den Vorgaben des zweiten Schritts
(alle Esser, ihre Portionen und Varianten, die Tageszeit des Fensters), schließt das Fenster und
zeigt „„Dal Makhani“ steht am Do 3.12.“ mit „Rückgängig“. Ein vorgemerktes Rezept wird dabei auf
den Tag gelegt (kein zweiter Eintrag, seine Zutaten auf der Liste bleiben). Ein Tipp auf die Zeile
öffnet den zweiten Schritt wie ein Suchtreffer. Offline: nur online (Schreiben; „+“ ausgegraut).

- AC-020: Angenommen der Block für Do 3.12. Abend · Wenn ich bei „Shakshuka“ auf „+“ tippe · Dann
  schließt das Fenster, „Shakshuka“ steht am Do 3.12. Abend für Enrico und Nadja, und der Hinweis
  hat „Rückgängig“
- AC-021: Angenommen „Dal Makhani“ ist vorgemerkt · Wenn ich bei ihm auf „+“ tippe · Dann steht es
  am Do 3.12. Abend und nicht mehr unter „Vorgemerkt“, es gibt keinen zweiten Eintrag
- AC-022: Angenommen ich habe gerade mit „+“ eingeplant · Wenn ich „Rückgängig“ tippe · Dann ist
  der Tag wieder wie vorher
- AC-023: Angenommen offline · Dann ist der Block sichtbar und „+“ ausgegraut mit dem Hinweis
  „Einplanen geht nur online“

**REQ-007 — „Andere“.** „Andere“ zeigt die nächsten 3; bereits gezeigte kommen erst wieder, wenn
alle durch sind. „Andere“ gibt es nur bei mehr als 3 passenden Rezepten. Offline: offline
vollständig.

- AC-024: Angenommen 9 passende Rezepte · Wenn ich zweimal „Andere“ tippe · Dann habe ich 9
  verschiedene gesehen, beim dritten Mal kommen wieder bekannte

### Variante C — „Was kochen wir?“

**REQ-008 — Zeile über der Woche.** In der Woche steht über dem Plan die ruhige Zeile „5 Abende
frei · Was kochen wir? ›“, wenn ab heute mindestens 2 Abende der gezeigten Woche frei sind (kein
Rezept, Restaurant, Freitext und keine Reste am Abend) und mindestens 4 passende Gerichte
existieren. Offline: offline lesend (die Zeile bleibt, „einplanen“ im Fenster ist ausgegraut).

- AC-025: Angenommen in der Woche 30.11.–6.12. sind Mo, Di, Do, Fr, So abends frei · Dann steht
  „5 Abende frei“ und „Was kochen wir?“ über der Woche
- AC-026: Angenommen nur 1 Abend ist frei oder die Woche liegt ganz in der Vergangenheit · Dann
  fehlt die Zeile

**REQ-009 — Karte auswählen.** Das Fenster „Was kochen wir?“ zeigt oben die freien Abende als
gewählte Chips (ein Tipp nimmt einen Abend heraus und wieder hinein), dann „Vorgemerkt“ und
„Für euch ausgesucht“ mit höchstens 6 Gerichten, jedes mit Grund und Fakten; passt ein Gericht nur
an einzelnen Abenden, sagt der Grund das („nur Fr/So“). Man tippt an, worauf man Lust hat. „Mehr“
hängt die nächsten 6 an, gewählte bleiben gewählt. Ein inzwischen belegter Abend fällt heraus
(„Do ist inzwischen belegt“). Offline: offline lesend.

- AC-027: Angenommen das Fenster ist offen · Dann sind alle freien Abende als Chips gewählt, kein
  Gericht ist gewählt, und unter „Für euch ausgesucht“ stehen höchstens 6
- AC-028: Angenommen „Mehr“ · Dann stehen weitere Gerichte darunter, die gewählten bleiben gewählt

**REQ-010 — Verteilung nach Regeln.** Die Leiste unten zeigt sofort, welches Gericht an welchem
Abend steht. Verteilt wird nach festen Regeln: nur an Abenden, an denen es passt; möglichst keine
gleiche Beilage an benachbarten Abenden (bestehende Einträge zählen als Nachbarn); Gerichte über
45 Min eher am Wochenende; Vorgemerktes eher früh; frühe Abende zuerst; bei Gleichstand Datum, dann
Rezept-ID. Mehr gewählt als Abende frei → der Rest wird vorgemerkt („4 Abende einplanen · 1
vormerken“). „Verteilung ändern“ legt ein Gericht per Menü auf einen anderen freien Abend oder
„Vormerken“. Offline: offline vollständig (Berechnung).

- AC-029: Angenommen Mo und Di frei, „Risotto“ und „Paella“ (beide Reis) und „Pasta“ gewählt, Mi
  ebenfalls frei · Dann stehen die beiden Reisgerichte nicht an benachbarten Abenden
- AC-030: Angenommen ein 90-Minuten-Gericht und ein 20-Minuten-Gericht, frei sind Fr und Sa · Dann
  steht das lange am Sa
- AC-031: Angenommen 2 Abende frei und 3 Gerichte gewählt · Dann heißt der Knopf „2 Abende
  einplanen · 1 vormerken“

**REQ-011 — Ein Tipp speichert, ein Rückgängig.** „4 Abende einplanen“ speichert alle Einträge in
einem Änderungssatz (ADR-0011) mit den Vorgaben wie in REQ-006; Vorgemerktes wird verschoben, der
Rest vorgemerkt. Danach „4 Abende eingeplant · Rückgängig“; die Zeile über der Woche heißt dann
„4 Gerichte nicht auf der Liste · Auf die Liste ›“ (öffnet „Auf die Einkaufsliste“), solange davon
etwas nicht auf der Liste ist. Offline: nur online (Knopf ausgegraut mit Hinweis).

- AC-032: Angenommen 2 Gerichte gewählt · Wenn ich „2 Abende einplanen“ tippe · Dann stehen beide
  im Plan, das Fenster ist zu und der Hinweis „2 Abende eingeplant“ hat „Rückgängig“
- AC-033: Angenommen gerade eingeplant · Wenn ich „Rückgängig“ tippe · Dann ist die Woche wieder
  wie vorher, auch ein verschobenes Vorgemerktes steht wieder unter „Vorgemerkt“
- AC-034: Angenommen gerade eingeplant · Dann steht über der Woche „2 Gerichte nicht auf der Liste“
  mit „Auf die Liste ›“

## Entscheidungen

1. **Esser = ganzer Haushalt** (Spec 0030, REQ-008: Reisen ändern nichts an Essen). Das Konzept
   zeigte „Nadja in Hamburg“ mit nur Enrico; das widerspräche Enricos Entscheidung vom 23.11. und
   dem, was „+“ vorbelegt. Darum gibt es auch keinen Grund „nur Mo/Di, Nadja ist weg“ und keine
   Avatare an den Abend-Chips. Die Kernfunktion nimmt Esser je Abend, falls das je anders sein soll.
2. „Noch nie gekocht“: höchstens 1 von 3 (A), 2 auf der Karte (C) — Enricos Wahl; „ohne Verlauf
   ohne Grenze“ ergibt sich aus der Lockerung (REQ-004).
3. Gleichheit über Geräte: gewichtetes Ziehen ohne Zurücklegen (Gumbel-Top-k) mit FNV-Hash aus
   Haushalt, Montag der Woche, Tageszeit, Runde und Rezept-ID, τ = 1,5; Punkte wie im Konzept
   (Vorgemerkt +100, Favorit +3 je Esser, (Ø − 3) × 2, ab 21 Tagen min(d, 90)/30, neu +1,
   Mo–Fr über 45 Min −2, ohne Zeit −0,5, Sa/So über 45 Min +0,5).
4. Vorlauf: Beginn wie in `prep.ts` (Kochbeginn der Tageszeit − Stunden); „am Vorabend“ zählt bis
   20:00. Ein Abend von heute zählt als frei, auch wenn es schon spät ist (man kann den Chip
   abwählen).
5. Vorgemerkte Gerichte erscheinen in C alle (sie sind die eigene Auswahl des Haushalts), müssen
   aber die harten Regeln erfüllen; sie zählen nicht gegen die Grenzen der Abwechslung.
6. Verteilung als vollständige Suche über die gewählten Gerichte (bei mehr Gerichten als Abenden
   die ersten nach Vorgemerkt und Kartenreihenfolge, Rest vorgemerkt) mit den Kosten aus dem
   Konzept: gleiche Beilage benachbart +5, über 45 Min Mo–Fr +2, Vorgemerktes je Tag später +0,5,
   übersprungener früherer Abend +1. Deterministisch, geprüft in Vitest.
7. Rezepte kommen mit dem Kalender als Kochverlauf (`withCookingHistory`), wie in der Liste
   „Essen“.
8. „Andere“ hat das Symbol „Neu laden“ (es gibt kein Würfelsymbol im Satz; kein neues Symbol, um
   `icons.ts` nicht parallel zu ändern).
9. Die Desktop-Vorschau im Raster mit Ziehen (Konzept, Empfehlung Punkt 3) entfällt in dieser
   Spec: Das Fenster zeigt die Verteilung als Leiste, „Verteilung ändern“ erledigt das Tauschen.
   Kann als eigene Spec folgen, wenn sich C bewährt.
10. Die Zeile „n Gerichte nicht auf der Liste“ erscheint nur nach „einplanen“ aus C in derselben
    Sitzung (kein dauerhafter Hinweis, kein Slop); sie zählt die eben geplanten Einträge, die
    noch keine Zutat auf der Liste haben (`entriesOnList`).

## Daten

Gelesen: Rezepte, Sammlungsinhalte, Artikel, Mitglieder (Ernährung, Abneigungen), Planeinträge,
Tageszeiten aus dem Cache. Geschrieben: Planeinträge über `addPlanEntry`/`movePlanEntry` (A) und
den neuen Befehl `planSuggested` (ein `apply_changes` für alle Gerichte, A und C). Keine Schema-Änderung, keine neuen
personenbezogenen Daten.

## Umsetzung

- [x] 1. `plan-suggestions.ts` in core mit Vitest, rot zuerst (AC-001–AC-015, AC-024–AC-031)
- [x] 2. Block in `add-entry-search.tsx` mit „+“, „Andere“, Rückgängig (AC-016–AC-023)
- [x] 3. `planSuggested` in api, ein Änderungssatz (AC-021, AC-023, AC-032, AC-033)
- [x] 4. Zeile (im festen Kopf unter der Wochen-Navigation, damit sie beim Scrollen zum Tag sichtbar
      bleibt) und Fenster „Was kochen wir?“ im Kalender (AC-025–AC-034); am Handy zeigt der
      Fensterkopf die Verteilung zusätzlich in einer Zeile, weil die Leiste dort am Ende des Inhalts
      steht
- [x] 5. e2e `e2e/rundgang-vorschlaege-0063.spec.ts` (geschrieben, läuft beim Mergen)
- [x] Nachweis: `pnpm format:check && pnpm check` grün (core 54 neue Tests, api 3); `pnpm build:web`
      exportiert, scheitert im Worktree nur am fehlenden `EXPO_PUBLIC_SUPABASE_URL` (CI setzt ihn);
      Bildschirmfotos Handy 390 × 844 hell/dunkel und Desktop 1440 × 900 in `tmp/review-0004/0063/`
