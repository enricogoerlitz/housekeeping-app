---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-22
---

# 0023 — Rezepte bearbeiten, Kochmodus neu, Starter-Rezepte entfernt

**Quelle:** ER-15, ER-16, ER-18, ER-19, ER-20 (`docs/product/review-enrico-2026-11-22.md`); E-03 bis
E-09, E-11 bis E-15 (`docs/product/review-logik-und-bedienung.md`).

**Kritischer Pfad:** ja — Migration (neue Spalte `recipes.links` mit Prüfung, `recipes.source`
entfällt, neuer Wert der Ernährung, Prüfung der Schritt-Timer und Gruppen), fremde Eingaben (Links
dürfen nie als Skript wirken und werden nie abgerufen), Löschen (nur der Hinweis ändert sich).
Keine neue Tabelle, keine neue RLS.

## Ziel

Eine Zutat entsteht mit dem Artikel zuerst und lässt sich direkt aus der Leseansicht vollständig
bearbeiten; Abschnitte lassen sich abbrechen, Gruppen und Timer wirken, ein Rezept hat Links ins
Netz. Der Kochmodus zeigt den Schritt als ruhigen Lesetext mit den Zutaten daneben oder darunter.
Starter-Rezepte sind überall weg. Löschen, Einplanen und Zählen auf „Essen“ sagen, was gilt.

## Nicht-Ziele

- Keine Zuordnung von Zutaten zu Schritten, kein Portionen-Regler, kein Abhaken und kein Ton im
  Kochmodus.
- Die App lädt verlinkte Seiten nie: keine Vorschau, kein Bild, kein Symbol, kein Import.
- Kein Ersatz für die Starter-Rezepte; der Starter-Katalog der Artikel und Bereiche bleibt.
- Keine neue Löschlogik (Spec 0008, E3); Adress-Parameter, Menüs und Fokus regelt Spec 0019.

## Schon erledigt

- ER-17 / E-01 Zutaten beim Anlegen: Spec 0018, REQ-001, `createRecipeWithIngredients`
  (`packages/api/src/commands-recipes.ts`).
- E-02 Kochmodus mit Portionen: Spec 0018, REQ-002, `packages/core/src/cooking.ts`.
- E-10 Datum im Hinweis nach dem Einplanen: Spec 0018, AC-025, `plannedNotice`
  (`packages/core/src/plan-recipe.ts`).

## Anforderungen

Beispiele: Haushalt „Enrico & Nadja“, angemeldet Enrico, Nadja vegetarisch, heute Sonntag,
22.11.2026. „Lasagne“ (4 Portionen) hat „150 g Linsen“, „2 Zwiebeln · fein gehackt“ und in der Gruppe
„Béchamel“ „40 g Butter“, „40 g Mehl“, „500 ml Milch“. Offline-Hinweis überall „Offline – zum
Bearbeiten brauchst du Netz“; lehnt der Server ab: „Hat nicht geklappt – bitte noch einmal
versuchen“, die Anzeige springt zurück (ADR-0011).

### Rezept bearbeiten

**REQ-001 — Zutat anlegen: erst Artikel, dann Menge.** Das Fenster „Neue Zutat“ hat die Reihenfolge
(auch für Tab) Artikel, Menge, Einkaufsregel, Zusatz für die Liste, Hinweis fürs Kochen, Variante,
Gruppe, „Übernehmen“; das Artikelfeld hat beim Öffnen den Fokus, nach der Wahl springt er in
„Menge“ (Platzhalter „freiwillig, z. B. 400 ml“), Enter dort übernimmt; unter „Menge“ steht „Wird
mit den Portionen umgerechnet“ bzw. „Bleibt beim Umrechnen gleich“. Einfügen von Zeilen
(„200 ml Kokosmilch“) bleibt, wie es ist. Quelle: ER-18. Offline: nur online.

- AC-001: Angenommen „Zutaten“ von „Lasagne“ ist offen · Wenn ich „+ Zutat“ wähle, „Muskat“ tippe,
  „Muskatnuss“ mit Enter wähle, „1 Prise“ tippe und Enter drücke · Dann stand der Fokus zuerst im
  Artikelfeld, dann in „Menge“, unter „Menge“ stand „Bleibt beim Umrechnen gleich“, und der
  Abschnitt zeigt „1 Prise Muskatnuss“.
- AC-002: Angenommen „Neue Zutat“ ist offen · Wenn ich „Salz“ wähle und „Menge“ leer lasse · Dann
  steht nach „Fertig“ „Salz“ ohne Menge im Rezept.
- AC-003 (Fehler): Angenommen kein Artikel gewählt, „Menge“ = „400 ml“ · Wenn ich „Übernehmen“ wähle ·
  Dann bleibt das Fenster offen, das Artikelfeld zeigt „Artikel wählen“ und hat den Fokus, „400 ml“
  bleibt.

**REQ-002 — Zutat bearbeiten aus dem ⋯.** Das ⋯ einer Zutat bietet in der Leseansicht „Zutat
bearbeiten“, „Artikel bearbeiten“, „Entfernen“ und im offenen Abschnitt „Zutat bearbeiten“,
„Artikel bearbeiten“ (ausgegraut, solange der Artikel erst mit „Fertig“ entsteht), „Nach oben“,
„Nach unten“, „Entfernen“; „Zutat bearbeiten“ ist das Fenster aus REQ-001 mit allen Werten der Zutat
(Menge als gespeicherte Rezeptangabe mit „für 4 Portionen“, Gruppe mit den Gruppen des Rezepts als
Vorschläge) und speichert aus der Leseansicht sofort mit „Zutat gespeichert“ · „Rückgängig“ (ein
offener anderer Abschnitt wird vorher gespeichert); „Entfernen“ dort zeigt „Linsen entfernt“ ·
„Rückgängig“. Gilt auch für die eigenen Zutaten einer Sammlung (ohne Variante). „Ist alle“ bleibt.
Quelle: ER-19. Offline: nur online; die drei Einträge sind ausgegraut mit dem Offline-Hinweis.

- AC-004: Angenommen „Lasagne“, kein Abschnitt offen · Wenn ich das ⋯ bei „Linsen“ öffne, „Zutat
  bearbeiten“ wähle, „150 g“ in „200 g“ ändere und „Übernehmen“ wähle · Dann standen im ⋯ in dieser
  Reihenfolge „Zutat bearbeiten“, „Artikel bearbeiten“, „Entfernen“, die Seite zeigt „200 g Linsen“,
  der Hinweis „Zutat gespeichert“ bietet „Rückgängig“, und Nadja sieht es ohne Neuladen.
- AC-005: Angenommen die Seite zeigt 6 Portionen („225 g Linsen“) · Wenn ich „Zutat bearbeiten“
  wähle · Dann steht in „Menge“ „150 g“ und darunter „für 4 Portionen“.
- AC-006: Angenommen ich bearbeite „Linsen“ aus der Leseansicht · Wenn ich den Vorschlag „Béchamel“
  antippe, „Übernehmen“ und dann im Hinweis „Rückgängig“ wähle · Dann stand „Linsen“ kurz unter
  „Béchamel“ und steht danach wieder ohne Gruppe.
- AC-007: Angenommen „Zutaten“ ist offen · Wenn ich das ⋯ von „150 g Linsen“ öffne · Dann stehen
  dort „Zutat bearbeiten“, „Artikel bearbeiten“, „Nach oben“, „Nach unten“, „Entfernen“.
- AC-008 (Offline): Angenommen offline · Wenn ich das ⋯ bei „Linsen“ öffne · Dann sind „Zutat
  bearbeiten“, „Artikel bearbeiten“ und „Entfernen“ ausgegraut mit dem Offline-Hinweis.

**REQ-003 — Abschnitt abbrechen, ins Bild rollen.** Neben „Fertig“ steht „Abbrechen“; es schließt den
offenen Abschnitt ohne Speichern und ohne Rückfrage, Escape wirkt ebenso (wenn kein Fenster oder Menü
darüber offen ist); ein anderer Stift, das Verlassen der Seite und Android-Zurück speichern weiter.
Auf dem Handy rollt ein geöffneter Abschnitt so, dass sein Kopf mit „Abbrechen“ und „Fertig“ oben im
Bild steht (ohne Animation bei „Bewegung reduzieren“). Quelle: E-04, E-15. Offline: „Abbrechen“
immer; Öffnen und „Fertig“ nur online.

- AC-009: Angenommen die Zubereitung von „Lasagne“ ist offen, Schritt 3 entfernt · Wenn ich
  „Abbrechen“ wähle · Dann ist der Abschnitt zu, Schritt 3 steht da, nichts ging an den Server.
- AC-010: Angenommen der Kopf ist offen, Titel geändert in „Lasagne neu“ · Wenn ich Escape drücke ·
  Dann heißt das Rezept „Lasagne“ und der Abschnitt ist zu.
- AC-011 (Rand): Angenommen über dem offenen Abschnitt ist „Zutat bearbeiten“ offen · Wenn ich
  Escape drücke · Dann schließt nur das Fenster, der Entwurf bleibt.
- AC-012: Angenommen Handybreite, Seite oben · Wenn ich den Stift bei „Zutaten“ wähle · Dann steht
  der Kopf von „Zutaten“ mit „Abbrechen“ und „Fertig“ oben im Bild.

**REQ-004 — Gruppen in Lese- und Kochansicht.** Zutaten ohne Gruppe stehen zuerst ohne Überschrift,
danach jede Gruppe in der Reihenfolge ihres ersten Vorkommens unter ihrer Überschrift; gleiche
Namen (Groß/Klein, Rand-Leerzeichen egal) werden zusammengefasst, geschrieben wie beim ersten
Vorkommen. Gilt für Rezepte, die gewählte Variante, eigene Zutaten einer Sammlung und den Kochmodus;
im offenen Abschnitt bleibt die Liste flach. Gruppe höchstens 60 Zeichen. Quelle: E-05. Offline:
offline vollständig.

- AC-013: Angenommen „Lasagne“ ist offen · Dann stehen „150 g Linsen“ und „2 Zwiebeln · fein
  gehackt“ ohne Überschrift, darunter „Béchamel“ mit „40 g Butter“, „40 g Mehl“, „500 ml Milch“.
- AC-014 (Rand): Angenommen Reihenfolge „Butter“ („Béchamel“), „Salz“ (ohne), „Milch“
  („béchamel “) · Dann zeigt die Seite „Salz“, darunter „Béchamel“ mit „Butter“ und „Milch“.

**REQ-005 — Timer eines Schritts setzen.** Das Fenster „Schritt“ hat „Text“ und „Timer (Min)“: ganze
Minuten 1 bis 600, leer = kein Timer. Quelle: E-06. Offline: nur online.

- AC-015: Angenommen die Zubereitung ist offen · Wenn ich bei Schritt 4 „Im Ofen backen“ „35“
  eintrage, „Übernehmen“ und „Fertig“ wähle · Dann zeigt Schritt 4 „⏱ 35 Min“ und im Kochmodus den
  Chip „Timer 35 Min“.
- AC-016 (Fehler): Wenn ich „0“, „601“ oder „1,5“ eintrage und „Übernehmen“ wähle · Dann bleibt
  das Fenster offen mit „1 bis 600 Minuten“.
- AC-017: Wenn ich das Feld leere und speichere · Dann hat Schritt 4 keinen Timer mehr.

**REQ-006 — Einfügen: sagen, was gespeichert ist; Dubletten markieren.** Eine eingefügte Zeile ist
eine Dublette, wenn ihr Artikel schon als Zutat derselben Variante im Rezept steht oder weiter oben
im selben Text vorkommt; sie steht wie eine orange Zeile oben mit „Steht schon im Rezept“,
„Weglassen“ und „Trotzdem hinzufügen“ und wird bis zur Entscheidung nicht gespeichert, auch nicht
beim Verlassen. Bleiben nach „Fertig“ offene Zeilen, sagt der Abschnitt in Teilen mit „·“: „5
Zutaten gespeichert“ (nur wenn etwas gespeichert wurde), „2 brauchen noch einen Artikel“, „1 steht
schon im Rezept“ (ohne Gespeichertes beginnt er mit „2 Zutaten brauchen …“). Gilt auch für „Zutaten
einfügen“ beim Anlegen. Quelle: E-08. Offline: nur online.

- AC-018: Angenommen 7 eingefügte Zeilen in „Linsen-Dal“, 2 davon orange · Wenn ich „Fertig“ wähle ·
  Dann sind 5 gespeichert und der Abschnitt bleibt offen mit „5 Zutaten gespeichert · 2 brauchen
  noch einen Artikel“.
- AC-019: Angenommen „Mango-Curry“ hat „400 ml Kokosmilch“ · Wenn ich „400 ml Kokosmilch“ und
  „1 Mango“ einfüge, „Fertig“, dann „Weglassen“ und „Fertig“ wähle · Dann stand zuerst „1 Zutat
  gespeichert · 1 steht schon im Rezept“, am Ende steht „Kokosmilch“ genau einmal im Rezept und auf
  der Liste kommen für 2 Portionen 400 ml, nicht 800 ml.
- AC-020: Wenn ich bei der Dublette „Trotzdem hinzufügen“ und „Fertig“ wähle · Dann hat das Rezept
  „Kokosmilch“ zweimal.
- AC-021 (Rand): Angenommen ich lege „Zwiebelkuchen“ mit „1 Zwiebel“ und „2 Zwiebeln“ an · Dann hat
  es „1 Zwiebel“ und „Zutaten“ öffnet sich mit „2 Zwiebeln“ · „Steht schon im Rezept“.

**REQ-007 — Mehr Einheiten und Größenangaben.** Neue Schreibweisen (Groß/Klein egal) → Einheit:
Flasche(n), Tüte(n), Beutel, Netz(e), Würfel, Rolle(n), Tafel(n), Kopf/Köpfe, Knolle(n), Zweig(e),
Blatt/Blätter, Päckchen, Gläser → zählbare Einheiten (beim Einkaufen ganze Stück); Pck., Pck, Pkg.,
Pkg → Packung; Liter → l, Gramm → g, Kilo/Kilogramm → kg, Milliliter → ml; el/Esslöffel → EL,
tl/Teelöffel → TL. „klein“, „mittelgroß“, „groß“, „gehäuft“, „gestrichen“ in jeder Endung zwischen
Zahl und Einheit oder Artikel gehören zur Menge; beim Umrechnen bleiben sie, bei genau 1 wie
geschrieben, sonst auf „-e“. Gleiche Erkennung für Zutaten und Liste. Quelle: E-09. Offline: wie die
Stelle, an der getippt wird.

- AC-022: Wenn ich „1 kleine Dose Mais“ in ein Rezept für 2 Portionen einfüge und 4 Portionen
  anzeige · Dann ist die Zeile nicht orange, Artikel „Mais“, und die Seite zeigt „2 kleine Dosen
  Mais“.
- AC-023: Wenn ich „1 Flasche Weißwein“, „2 tl Zucker“, „0,5 Liter Brühe“, „1 Pck. Backpulver“
  einfüge · Dann entstehen „Weißwein“ (1 Flasche), „Zucker“ (TL), „Brühe“ (l), „Backpulver“
  (Packung), kein Artikel „Flasche Weißwein“.
- AC-024: Wenn ich „2 große Zwiebeln“ einfüge (2 Portionen) und 3 Portionen anzeige · Dann ist der
  Artikel „Zwiebeln“ und die Seite zeigt „3 große Zwiebeln“.
- AC-025 (Rand): Wenn ich „2 Würfelzucker“ einfüge · Dann ist „Würfelzucker“ der Artikel, „2“ die
  Menge.

**REQ-008 — Ernährung „kein Lebensmittel“, Grund für „unbekannt“.** Artikel haben zusätzlich die
Ernährung „kein Lebensmittel“; sie zählt beim Ableiten (Rezept, Variante, Sammlung, „Passt für
alle“, Filter, Vorauswahl der Varianten) nicht; nur solche Zutaten → „unbekannt“ ohne Chip. Im
Starter-Katalog stehen alle Einträge von „Drogerie & Hygiene“, „Haushalt & Reinigung“,
„Tierbedarf“, „Sonstiges“ und „Kaffeefilter“ darauf; „Tortellini“, „Maultaschen“, „Tiefkühlpizza“
bleiben „unbekannt“. Der Chip „unbekannt“ öffnet „Warum unbekannt?“ mit „Bei diesen Zutaten fehlt
die Ernährung:“ und je Artikel „Festlegen“ (öffnet „Artikel bearbeiten“). „Artikel“ bekommt den
Filter „Ernährung unbekannt (n)“. Quelle: E-07. Offline: Anzeige offline vollständig, Festlegen nur
online.

- AC-026: Angenommen „Grillgemüse“ mit „Zucchini“, „Paprika“, „Olivenöl“ (vegan) und „Grillkohle“
  („kein Lebensmittel“) · Dann zeigt es „vegan“, der Schnell-Chip „Vegan“ findet es, beim Einplanen
  fehlt „Passt nicht für Nadja“.
- AC-027: Angenommen zusätzlich „Grillanzünder“ („unbekannt“) · Wenn ich den Chip „unbekannt“
  antippe, bei „Grillanzünder“ „Festlegen“ wähle und „kein Lebensmittel“ speichere · Dann listete
  „Warum unbekannt?“ genau „Grillanzünder“, und der Chip zeigt danach „vegan“.
- AC-028: Angenommen ein neuer Haushalt „WG Köln“ · Dann haben „Backpapier“, „Grillkohle“,
  „Spülmittel“ „kein Lebensmittel“ und „Tortellini“ „unbekannt“.
- AC-029 (Rand): Angenommen „Ofen vorbereiten“ hat nur „Backpapier“ · Dann zeigt es keinen
  Ernährungs-Chip und „Vegan“ findet es nicht.
- AC-030: Angenommen 3 Artikel auf „unbekannt“ · Wenn ich „Ernährung unbekannt (3)“ wähle · Dann
  stehen genau sie da. Offline öffnet „Warum unbekannt?“, „Festlegen“ ist ausgegraut.

### Links

**REQ-009 — Links zu Rezepten im Netz.** Rezept und Sammlung haben unter „Notizen“ den Abschnitt
„Links“ (Stift, „Abbrechen“, „Fertig“; leer „Noch keine Links.“) mit höchstens 10 Links; je Zeile
die Bezeichnung und darunter der Host ohne „www.“ oder nur der Host, mit Symbol „öffnet extern“; ein
Tipp öffnet in neuem Tab (`noopener`, `noreferrer`), die App bleibt. Fenster „Link“: „Adresse“
(Pflicht), „Bezeichnung (freiwillig)“. Prüfung auf dem Gerät und in der Datenbank (dieselbe Regel
gilt für die Webseite von Restaurant und Aktivität, Spec 0024 REQ-003): Rand-Leerzeichen weg, ohne
Schema („…:“ am Anfang) kommt „https://“ davor; nur `http`/`https` mit Rechnername mit Punkt, ohne
Leer- und Steuerzeichen, ≤ 2000 Zeichen; Bezeichnung ≤ 80 Zeichen ohne Steuerzeichen; keine Adresse doppelt. Meldungen „Nur
Adressen mit http:// oder https://“, „Keine gültige Adresse“, „Höchstens 2000 Zeichen“, „Höchstens
80 Zeichen“, „Diesen Link gibt es schon“, „Höchstens 10 Links“. Weder Gerät noch Server rufen die
Seite ab; ein Link, der die Prüfung auf dem Gerät nicht besteht, erscheint als Text ohne Tipp-Ziel.
Quelle: ER-20. Offline: lesen und öffnen offline, bearbeiten nur online.

- AC-031: Angenommen „Lasagne“ ohne Links · Wenn ich „https://www.chefkoch.de/rezepte/123/
  lasagne.html“ hinzufüge, „Fertig“ wähle und die Zeile antippe · Dann zeigt sie „chefkoch.de“ und
  die Adresse öffnet in einem neuen Tab, die App zeigt weiter „Lasagne“.
- AC-032: Wenn ich „chefkoch.de/r/1“ mit Bezeichnung „Omas Variante“ speichere · Dann ist
  „https://chefkoch.de/r/1“ gespeichert, die Zeile zeigt „Omas Variante“ über „chefkoch.de“, Nadja
  sieht sie ohne Neuladen.
- AC-033 (Fehler): Wenn ich „javascript:alert(1)“, „data:text/html,hallo“, „mailto:info@enzo.de“
  oder „ftp://server/datei“ übernehmen will · Dann bleibt das Fenster offen mit „Nur Adressen mit
  http:// oder https://“; bei „https://“, „https://chef koch.de“ oder „localhost“ mit „Keine gültige
  Adresse“; nichts ist gespeichert.
- AC-034 (Grenzen): Angenommen 10 Links · Dann ist „+ Link“ ausgegraut mit „Höchstens 10 Links“;
  eine schon vorhandene Adresse ergibt „Diesen Link gibt es schon“.
- AC-035 (Datenbank): Wenn ein Mitglied an der App vorbei „javascript:alert(1)“, 2001 Zeichen
  Adresse, 81 Zeichen Bezeichnung oder 11 Links speichert · Dann lehnt die Datenbank ab; ein
  ungültiger Link im lokalen Speicher erscheint als Text ohne Tipp-Ziel.
- AC-036 (Offline, fremd): Angenommen offline · Dann zeigt „Lasagne“ ihre Links, der Stift ist
  ausgegraut; Mitglieder eines anderen Haushalts lesen und ändern sie nicht.

### Kochmodus

**REQ-010 — Kochmodus: Schritt als Lesetext, Zutaten sichtbar.** Es bleiben unten „Zurück“ und
„Weiter“ (letzter Schritt „Fertig“), oben „Kochmodus · <Variante> · 6 Portionen“, Titel und „Fertig“.
Über dem Schritt „Schritt 2 von 5“; der Text in der Schrift der Bedienung (nicht der Titelschrift),
mindestens 20 pt auf dem Handy, 26 pt am Desktop, großzügiger Zeilenabstand, höchstens etwa 60
Zeichen je Zeile, für Screenreader keine Überschrift. Die Zutaten der gewählten Variante,
umgerechnet und nach Gruppen (REQ-004), mit Kopf „Zutaten · 6 Portionen“: am Desktop (ab 1100 px)
rechts neben dem Schritt, immer sichtbar, eigene Rolle; auf Handy und Tablet unter dem Schritt,
offen beim Start, Kopf klappt zu und auf, der Zustand bleibt beim Blättern. Ein Schritt mit Timer
hat den Chip „Timer 35 Min“ (Start, Pause, Zurücksetzen); laufende oder abgelaufene Timer anderer
Schritte stehen oben als „⏱ Schritt 4 · 34:58“ bzw. „⏱ Schritt 4 · abgelaufen“, Tipp springt hin;
mehrere gleichzeitig möglich; Verlassen beendet sie. Solange der Kochmodus sichtbar ist, hält die
App den Bildschirm wach (Screen Wake Lock), gibt ihn beim Verlassen frei, fragt nach Rückkehr in den
Tab neu; kann der Browser es nicht, kein Hinweis. Pfeil rechts/links = „Weiter“/„Zurück“. Ohne
Schritte „Noch keine Schritte“, die Zutaten stehen trotzdem da. Quelle: ER-16. Offline: offline
vollständig.

```
Handy                               Desktop
Kochmodus · 6 Portionen  [Fertig]   Kochmodus · 6 Portionen                  [Fertig]
SCHRITT 2 VON 5                     SCHRITT 2 VON 5             │ Zutaten · 6 Portionen
Zwiebeln würfeln und glasig         Zwiebeln würfeln und glasig │ 225 g  Linsen
anschwitzen.   [⏱ Timer 5 Min]      anschwitzen. [⏱ Timer 5 Min]│ Béchamel
Zutaten · 6 Portionen ▴ / 225 g …   [← Zurück]          [Weiter →]
```

- AC-037: Angenommen Handybreite, „Lasagne“ auf 6 Portionen, Schritt 2 „Zwiebeln würfeln.“ · Wenn
  ich „Kochen“ und „Weiter“ wähle · Dann steht „Schritt 2 von 5“, der Text in der Schrift der
  Bedienung mit mindestens 20 pt und ohne Überschrift-Rolle, darunter offen „Zutaten · 6 Portionen“
  mit „225 g Linsen“.
- AC-038: Angenommen 1440 px Breite · Dann stehen die Zutaten rechts neben dem Schritt, auch nach
  „Weiter“.
- AC-039: Angenommen Handybreite · Wenn ich „Zutaten · 4 Portionen“ antippe, „Weiter“ wähle, dann
  den Kochmodus verlasse und neu öffne · Dann bleibt der Bereich beim Blättern zu und ist beim
  Neuöffnen wieder offen.
- AC-040: Dann zeigt der Kochmodus von „Lasagne“ „Linsen“ und „Zwiebeln“ ohne Überschrift und darunter
  „Béchamel“ mit „Butter“, „Mehl“, „Milch“.
- AC-041: Angenommen Schritt 4 hat Timer 35 Min · Wenn ich ihn starte, nach 2 s „Weiter“ wähle und
  oben auf „⏱ Schritt 4 · 34:58“ tippe · Dann zählt der Chip weiter und Schritt 4 erscheint mit
  laufendem Timer.
- AC-042: Angenommen der Browser kann den Bildschirm wach halten · Dann hält der Kochmodus ihn wach
  und „Fertig“ gibt ihn frei; kann er es nicht, öffnet der Kochmodus ohne Hinweis.
- AC-043 (Offline, Rand): Angenommen offline · Dann gehen Schritte, Zutaten und Timer wie online;
  „Ofengemüse“ ohne Schritte zeigt „Noch keine Schritte“ und darunter seine Zutaten.
- AC-044: Angenommen Desktop, Schritt 1 von 5 · Wenn ich Pfeil rechts, dann Pfeil links drücke ·
  Dann stand „Schritt 2 von 5“, dann wieder „Schritt 1 von 5“.

### Essen

**REQ-011 — Starter-Rezepte entfallen.** „Neu“ bietet auf „Rezepte“ und „Restaurants“ genau
„Rezept“, „Sammlung“, „Restaurant“. Eine leere Seite „Essen“ zeigt „Noch keine Rezepte“, „Legt euer
erstes Rezept an. Ein Titel reicht; Zutaten, Schritte und Links kommen später dazu.“ und die Knöpfe
„Rezept anlegen“, „Sammlung anlegen“ (öffnen „Neu“ mit der Art) sowie „Beschreiben ✨“ nur mit KI.
Es entfallen Fenster, Befehle, Tests, Herkunft „Starter“ (`recipes.source`), Showroom-Text und
Glossar-Eintrag; der Starter-Katalog und die Rezepte der Beispieldaten (Entwicklung, Vorschau)
bleiben. Quelle: ER-15. Offline: Anlegen nur online, Knöpfe ausgegraut.

- AC-045: Wenn ich auf „Rezepte“ und auf „Restaurants“ „Neu“ wähle · Dann bietet das Menü jeweils
  genau „Rezept“, „Sammlung“, „Restaurant“.
- AC-046: Angenommen „WG Köln“ ohne Rezepte, KI aus · Wenn ich „Essen“ öffne und „Sammlung anlegen“
  wähle · Dann standen Text und die zwei Knöpfe da, kein „Starter-Rezepte ansehen“, kein
  „Beschreiben ✨“, und „Neu“ öffnet mit „Sammlung“.
- AC-047: Dann enthalten `apps/`, `packages/`, `supabase/`, `scripts/`, `e2e/` weder
  „Starter-Rezept“ noch `listStarterRecipes`, `adoptStarterRecipes`, `StarterSheet`; `recipes` hat
  keine Spalte `source`; ein neuer Haushalt hat weiter den Starter-Katalog.
- AC-048 (Offline): Angenommen offline, keine Rezepte · Dann sind beide Knöpfe ausgegraut mit dem
  Offline-Hinweis.

**REQ-012 — Löschen nennt die entfallenden Einträge.** Der Hinweis nach dem Löschen eines Rezepts
oder einer Sammlung lautet „<Titel> gelöscht“, dann „1 geplanter Eintrag entfällt“ bzw. „n geplante
Einträge entfallen“ (Einträge nach heute, vorgemerkte und davon abhängige Reste; nur wenn > 0), dann
wie bisher „auch aus n Sammlung(en) entfernt“, mit „Rückgängig“ für 5 s. Eine Funktion in
`packages/core` bildet den Text, auch für Restaurant und Aktivität (Spec 0024 REQ-010). Quelle:
E-03. Offline: nur online.

- AC-049: Angenommen „Lasagne“ am 20.11., 25.11. und 4.12. im Kalender · Wenn ich sie lösche und
  „Rückgängig“ wähle · Dann hieß es „Lasagne gelöscht · 2 geplante Einträge entfallen“, am 20.11.
  stand Freitext „Lasagne“, und danach ist alles wie vorher.
- AC-050: Angenommen „Grillabend“ morgen geplant und einmal vorgemerkt · Dann heißt es nach dem
  Löschen „Grillabend gelöscht · 2 geplante Einträge entfallen“.
- AC-051: Angenommen „Mango-Curry“ am 25.11. und in „Grillabend“ · Dann heißt es „Mango-Curry gelöscht
  · 1 geplanter Eintrag entfällt · auch aus 1 Sammlung entfernt“.
- AC-052 (Rand): Angenommen „Shakshuka“ nirgends geplant · Dann heißt es „Shakshuka gelöscht“.

**REQ-013 — Einplanen-Fenster: Datum, jeder Tag, Esser.** Im Einplanen-Fenster von Rezept und
Sammlung zeigen die Tages-Chips Wochentag und Datum („Mi“ über „25.11.“); hinter „Ohne Tag
vormerken“ steht „Anderes Datum …“ (Spec 0016, REQ-005: Monatskalender im Fenster, Start im Monat
der Woche, ‹ › ohne Grenze; Tipp wählt den Tag und zeigt seine Woche); der Knopf heißt „Am Mi 25.11.
Abend einplanen“. Zähler für Portionen und Varianten: Spec 0021 REQ-006. Solange „Wer isst mit?“ unberührt ist, rechnet das Fenster die Vorauswahl neu,
wenn Mitglieder oder Reisen später ankommen. Quelle: E-11, E-12. Offline: nur online.

- AC-053: Wenn ich am 22.11. auf „Lasagne“ „Einplanen“ wähle · Dann zeigt das Fenster „KW 47 ·
  16.–22. Nov“, die Tage „Mo 16.11.“ bis „So 22.11.“, gewählt „So 22.11.“, Knopf „Am So 22.11. Abend
  einplanen“.
- AC-054: Wenn ich „Anderes Datum …“ wähle, zu „Februar 2027“ blättere, den 14. wähle und einplane ·
  Dann zeigte das Fenster „KW 6 · 8.–14. Feb“ mit „So 14.2.“ und „Am So 14.2. Abend einplanen“, und
  „Lasagne“ steht am 14.2.2027 abends im Kalender.
- AC-055: Angenommen nach dem Neuladen fehlen die Mitglieder noch · Wenn sie nach dem Öffnen
  ankommen · Dann sind Enrico und Nadja gewählt und der Knopf ist bedienbar.
- AC-056 (Rand): Angenommen ich habe Nadja abgewählt · Wenn ein Abgleich eine neue Reise bringt ·
  Dann bleibt meine Wahl.

**REQ-014 — Einheitlich zählen, verständlich benennen.** Der Knopf im Filterfeld zählt wie die Zeile
über der Liste („26 Rezepte · 2 Sammlungen zeigen“, „13 Rezepte zeigen“, „2 Sammlungen zeigen“, ohne
Treffer „0 Rezepte zeigen“). In „Enthält“ heißt ein Rezept ohne eigene Portionen „6 Port. (wie
Sammlung)“; im Fenster „Portionen und Variante“ Platzhalter „wie Sammlung (6)“, Hinweis „Leer
lassen: so viele Portionen wie die Sammlung (6)“. Quelle: E-13, E-14. Offline: Anzeige offline,
Bearbeiten nur online.

- AC-057: Angenommen 26 Rezepte, 2 Sammlungen · Wenn ich „Filter“ öffne und dann „Art: Rezepte“ wähle
  · Dann hieß der Knopf „26 Rezepte · 2 Sammlungen zeigen“, danach „26 Rezepte zeigen“.
- AC-058: Angenommen „Grillabend“ (6 Portionen) mit „Kartoffelsalat“ ohne eigene Portionen und
  „Grillgemüse“ mit 8 · Wenn ich „Enthält“ bearbeite · Dann steht „6 Port. (wie Sammlung)“ bzw.
  „8 Port.“, nirgends „übernimmt“.

## Entscheidungen

Alle ENTSCHIEDEN von Claude nach Enricos Regel „Empfehlung nehmen“, 22.11.2026.

1. **Links als Spalte `recipes.links jsonb`** (Liste von `{url, label?}`), keine eigene Tabelle:
   Links gehören nur zum Rezept, haben keine eigene Kennung und folgen dem Muster von `ingredients`
   und `steps`; Tabelle bräuchte RLS, Löschtrigger, Sync-Eintrag und pgTAP ohne Nutzen.
2. **Eine Prüffunktion für Web-Adressen in `packages/core`** und eine in SQL
   (`private.is_web_url`), gemeinsam mit der Webseite von Spec 0024; wer zuerst baut, legt sie an.
   Adresse ohne Schema bekommt „https://“ (bequem beim Einfügen). Abgestimmt mit Spec 0024,
   22.11.2026: eine Regel und ein Meldungssatz für beide; Rechnername mit Punkt aus 0024 übernommen.
   Lösch-Hinweis „n geplante Einträge entfallen“ gilt auch für Restaurant und Aktivität.
3. **Kochmodus zeigt alle Zutaten**, weil die Daten keine Zuordnung zu Schritten kennen. Erkennen
   per Name im Schrittext (unsicher bei Beugung) und ein neues Datenfeld (Pflegeaufwand) verworfen.
4. **Kochmodus-Layout:** zwei Spalten erst ab 1100 px; das Tablet im Hochformat hat neben der
   Seitenleiste zu wenig Platz. Auf dem Handy Schritt oben, Zutaten darunter, damit ein kurzer
   Schritt nicht über leerer Fläche steht.
5. **Bildschirm wach halten neu** (bisher nicht vorhanden), mit stillem Rückfall; laufende Timer
   bleiben beim Blättern (bisher endeten sie beim Schrittwechsel). Kein Portionen-Regler (wie Spec
   0018).
6. **E-04: „Abbrechen“** statt Toast „Gespeichert · Rückgängig“ (erste Option im Review); Verlassen
   speichert weiter (Spec 0008, Offene Frage 1).
7. **ER-19:** Aus der Leseansicht speichert „Zutat bearbeiten“ sofort mit „Rückgängig“; „Entfernen“
   kommt dort dazu. Menge bleibt ein Feld mit Einheit („2–3 EL“, „etwas“ müssen gehen), daher der
   Hinweis zum Umrechnen statt eines Einheiten-Felds.
8. **E-07:** neuer Wert `non_food` („kein Lebensmittel“) statt „unbekannt beim Ableiten ignorieren“
   (erste Option), weil echte Lebensmittel ohne Angabe sonst still vegan wirken. Filter „Ernährung
   unbekannt“ gehört zur Empfehlung und liegt deshalb hier, nicht in Spec 0025.
9. **E-08:** Dubletten sind offene Zeilen mit Entscheidung, weil nur Markieren den Fehler
   (Kokosmilch doppelt) nicht verhindert.
10. **E-09:** Größenangaben stehen in der Menge und bekommen beim Umrechnen bei ≠ 1 die Endung „-e“;
    kein neues Feld an `Amount`, die Angabe wird aus dem Text gelesen.
11. **E-03:** nur Hinweis mit Zahl, keine Rückfrage (erste Option); „geplante Einträge“ umfasst
    vorgemerkte.
12. **Leere Seite „Essen“:** „Rezept anlegen“ und „Sammlung anlegen“ statt „Starter-Rezepte
    ansehen“; Beispieldaten behalten ihre Rezepte (Vorschau zum Testen), ohne Herkunft. Die Spalte
    `recipes.photo` (mitgelieferte Beispielfotos) bleibt für die Beispieldaten.
13. **Ändert ältere AC:** Spec 0001 AC-016 und Spec 0005 AC-047 („Starter-Rezepte ansehen“), Spec
    0008 AC-003 und Spec 0009 AC-001 (Menü mit „Starter-Rezepte“), Spec 0007 AC-016 (umgesetzt als
    Übernahme von Starter-Rezepten, Test entfällt), Spec 0008 AC-032 (Text des Hinweises), Spec 0008
    REQ-008 (Reihenfolge im Zutatenfenster, ⋯-Einträge), Spec 0008 REQ-009 (Tage mit Datum), Spec
    0008 Nicht-Ziel „Kein neuer Kochmodus“ und Spec 0001 AC-023 („Zutaten anzeigen“ entfällt). Spec
    0003 hat kein AC zu Starter-Rezepten.
14. **Ein Einplanen-Fenster für alles** (Claude nach Enricos Regel „Empfehlung nehmen“, 22.11.2026):
    Rezept, Sammlung, Restaurant und Aktivität nutzen das Fenster aus REQ-013 – Woche mit
    Tages-Chips und Datum, KW blättern, „Anderes Datum …“, Tageszeit, „Wer isst mit?“. Restaurant
    und Aktivität zeigen zusätzlich „Uhrzeit (optional)“ und „Zusatz“ (Spec 0021). Wochen statt „14
    Tage ab heute“, weil der Kalender in KW bleibt (ER-27/Kalender). 0023 baut das Fenster, 0024
    nutzt es.
15. **Zutaten beim Löschen eines Rezepts oder einer Sammlung** (Claude, 22.11.2026): Entfallen
    künftige Einträge, bietet der Hinweis dieselbe Wahl wie beim Löschen eines Eintrags („Zutaten
    auch von der Liste nehmen“, Spec 0021); gleiche Funktion aus `packages/core`.
16. ERLEDIGT (22.11.2026, nach dem Merge von 0021): Entscheidung 15 ist gebaut. Stehen Zutaten der
    entfallenden Einträge auf offenen Posten, fragt „Löschen“ zuerst in einem kleinen Fenster wie
    beim Entfernen eines Eintrags: „Lasagne löschen?“, „Für 2 geplante Einträge stehen 3 Zutaten auf
    der Einkaufsliste.“, „Zutaten auch von der Liste nehmen“ (Hauptknopf), „Nur löschen“,
    „Abbrechen“; ohne solche Zutaten löscht es wie bisher ohne Frage. Danach „Lasagne gelöscht · 2
    geplante Einträge entfallen · 3 Zutaten von der Liste genommen“. Die Zutaten gehen im selben
    Aufruf (`delete_recipe(…, with_list)` mit `replace_entry_contributions` aus 0021), „Rückgängig“
    bringt sie mit den Einträgen zurück (`restore_recipe`, `restore_cleared_items`). Zählen und
    Text in `packages/core` (`entriesOnList`, `deletionListQuestion`, `deletedNotice`).
17. Beim Bau entschieden (Claude, 22.11.2026, einfachste Lösung): Gruppe ≤ 60 Zeichen ist der Check
    `recipes_ingredients_group_valid` (23514) statt einer Erweiterung des Triggers
    `recipes_check_ingredients`; Schritt-Timer der Check `recipes_steps_timer_valid`.
18. Größenangaben in der Eingabezeile der Liste landen im Zusatz („2 große Zwiebeln“ → Zwiebeln, 2,
    Zusatz „große“), weil ein Listenposten keine Mengenangabe als Text hat. „Gläser“ → Glas; „Glas“
    behält wie bisher keine Mehrzahl.
19. Fenster „Link“: leere Adresse „Adresse fehlt“; Steuerzeichen in der Bezeichnung entfernt das
    Gerät (unsichtbar), die Datenbank lehnt sie ab; doppelt heißt: dieselbe normalisierte Adresse.
20. Unter „Menge“ steht bei leerem Feld nichts; aus der Leseansicht „für 4 Portionen · Wird mit den
    Portionen umgerechnet“.
21. Einplanen-Fenster: ein anderer Tag oder ‹ › setzt „Wer isst mit?“ auf die Anwesenden zurück
    (E11) und gilt danach wieder als unberührt.
22. Kochmodus: pausierte Timer stehen nicht oben; „Zurücksetzen“ ist ein Link neben dem Chip, ein
    abgelaufener Timer setzt sich mit einem Tipp auf den Chip zurück.
23. „+ Zutat“ markiert keine Dubletten, nur eingefügte Zeilen (`addPastedRows`).

## Daten

- `recipes.links jsonb not null default '[]'` mit Check (Array ≤ 10; je Element Objekt mit `url`,
  geprüft mit `private.is_web_url(url)` (http/https, Rechnername mit Punkt, ohne Leer- und Steuerzeichen,
  ≤ 2000 Zeichen; auch für `website_url` in Spec 0024); `label` optional,
  1–80 Zeichen, ohne Steuerzeichen; keine `url` doppelt), Grants für insert/update, in der Allowlist
  von `apply_changes`; Sync und Cache (`CACHE_VERSION` +1), Typen neu erzeugen.
- `articles.diet`: Check um `non_food` erweitert; Starter-Katalog setzt ihn (REQ-008).
- `recipes.steps`: Check `timerMinutes` ganzzahlig 1–600; `recipes_check_ingredients`: `group` ≤ 60
  Zeichen.
- **Entfällt:** `recipes.source` (Spalte, Check `recipes_source_length`, Grants, Allowlist,
  `source` in `seed.sql`/`preview-seed.sql`/`seed/demo.ts`, `Recipe.source`, `createRecipe`-Option);
  `listStarterRecipes`, `adoptStarterRecipes`, `StarterRecipeInfo`
  (`packages/api/src/commands-recipes.ts`), `apps/app/src/features/recipes/starter-sheet.tsx`, Menü-
  und Leerzustands-Code in `recipes-screen.tsx` und `restaurants-panel.tsx`, Tests in
  `commands-recipes.backend.test.ts` (Übernahme), `e2e/rundgang-essen.spec.ts` (Option `starter`),
  `e2e/rundgang-shell.spec.ts` (`empty-starter`), Text in `showroom-screen.tsx`, Kommentar in
  `packages/core/src/cooking-history.ts`.
- **Aufräumen:** Das Menü „Neu“ steht doppelt in `recipes-screen.tsx` und `restaurants-panel.tsx`;
  daraus wird ein Baustein. Glossar: „Starter-Rezept“ streichen, „Neu aus Rezepten“ ohne
  Starter-Rezepte; Produkt-Dokumente (`feature-konzept.md` F3, `ui-konzept-v2.md`) nennen sie
  nicht mehr.

## Risiken

| Risiko                                              | Gegenmaßnahme                                                              | Test                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `javascript:`/`data:`-Link wird als Skript geöffnet | nur http(s) auf Gerät und in DB; vor dem Öffnen erneut geprüft; `noopener` | core `web-link.test.ts` (AC-033, AC-035), pgTAP `recipe_links.test.sql`                       |
| Seite greift über `window.opener` auf die App zu    | `noopener`, `noreferrer`, `opener = null`                                  | ui `open-in-new-tab.test.ts`                                                                  |
| App oder Server ruft fremde Seite ab (SSRF, Spur)   | kein Abruf, keine Vorschau; Edge Functions unverändert                     | `/security-check` 22.11.2026: keine Befunde über „niedrig“ (s. u.)                            |
| Fremder Haushalt liest oder ändert Links            | bestehende RLS auf `recipes`                                               | pgTAP `recipe_links.test.sql` „AC-036 …“ (fremder Haushalt, `anon`, `apply_changes`)          |
| Riesige oder viele Links                            | Check ≤ 10, ≤ 2000/80 Zeichen                                              | pgTAP „AC-035 …“, „AC-034 …“                                                                  |
| Migration bricht Seeds oder Sync                    | Seeds ohne `source`, Allowlist und Cache-Version 11                        | `supabase test db` grün, api `backend.test.ts` „spec 0023: version 11 …“, `seed-sql` Check    |
| Löschen entfernt mehr als angezeigt                 | Zahl aus `recipeDeletionEffect`, dieselbe Regel wie der Server             | core `recipe-deletion.test.ts` (AC-049–AC-052), api `commands-recipes-0023.backend.test.ts`   |
| Löschen mit Liste nimmt fremde/abgehakte Beiträge   | nur Beiträge der entfallenden Einträge auf offenen Posten, ein Aufruf      | pgTAP `recipe_deletion_list.test.sql`, api `commands-recipes.backend.test.ts` „Decision 15 …“ |
| Server lehnt Speichern ab                           | Overlay springt zurück, Hinweis (ADR-0011)                                 | api „AC-004 (Fehler) …“, „AC-008 (Offline) …“                                                 |

`/security-check` (22.11.2026, Diff gegen `develop`): [hinweis] `is_web_url` lässt IP- und
IDN-Rechnernamen zu, ohne Folgen, weil nie abgerufen wird und der Host unter der Bezeichnung steht;
[niedrig] `toRecipe` übernimmt `links` ohne Zod, abgesichert durch den DB-Check
`recipes_links_valid` (wie `ingredients`, `steps`). Sonst keine Befunde.

## Umsetzung

- [x] 1. Migration: `links`, Checks für Timer, Gruppe, `non_food`; `source` raus; Allowlist; Seeds;
      pgTAP rot zuerst (AC-035, AC-028, AC-047)
- [x] 2. core: Web-Adresse prüfen, Gruppen ordnen, Einheiten und Größenangaben, `non_food` im
      Ableiten, Dubletten und Einfüge-Hinweis, Lösch-Hinweis, Zählung, Texte (AC-013–AC-030,
      AC-049–AC-052, AC-057, AC-058)
- [x] 3. api: Links speichern, Zutat einzeln speichern/entfernen, Starter-Rezepte und `source`
      entfernen, Starter-Katalog-Ernährung, Cache-Version (AC-004, AC-028, AC-032, AC-047)
- [x] 4. Rezeptseite: Zutatenfenster, ⋯-Menüs, „Abbrechen“, Rollen, Gruppen, Schritt-Timer,
      Einfügen, Abschnitt „Links“, Chip „unbekannt“ (AC-001–AC-021, AC-026–AC-027, AC-031–AC-036)
- [x] 5. Kochmodus neu mit Wake Lock und Timern (AC-037–AC-044)
- [x] 6. Essen: Menü „Neu“ als ein Baustein, leere Seite, Lösch-Hinweis, Einplanen-Fenster,
      Filterknopf, „Enthält“, Filter auf „Artikel“ (AC-030, AC-045–AC-058)
- [x] 7. Dokumente: Glossar, `feature-konzept.md`, ältere Specs nach Entscheidung 13
- [x] 8. `/security-check` (s. Risiken); `/ui-verify` läuft nach den Regeln der Welle 2 einmal in
      Spec 0028
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` und `pnpm exec supabase test db`
