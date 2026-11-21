---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-20
---

# 0008 — Essen und Rezept-Editor

## Problem

Auf „Essen“ stehen auf dem Handy rund 280 px Bedienelemente vor dem ersten Rezept: zwei breite
Umschalter, Suchfeld, KI-Schalter und eine Reihe Filter-Chips. Nach Küche lässt sich nicht
filtern, zufälliges Stöbern gibt es nicht, und am Desktop sind die Kacheln klein. Die Rezeptseite
wirkt unfertig: „Einplanen“ springt in den Plan, Notizen, Mengen und Schlagworte lassen sich nicht
bearbeiten, und ein Rezept lässt sich nicht löschen. Enrico und Nadja können ein Rezept also weder
vollständig pflegen noch dort einplanen, wo sie es gerade lesen.

## Ziel

- Auf dem Handy stehen zwischen den Ansichts-Tabs und der ersten Kachel nur ein Suchfeld, eine
  Filterzeile und die Zahl der Treffer.
- Rezepte lassen sich nach Küche filtern und in zufälliger Reihenfolge durchstöbern, ohne Seiten
  zu blättern.
- Auf der Rezeptseite ist jedes Feld bearbeitbar, Abschnitt für Abschnitt. Einplanen und „Auf die
  Liste“ passieren auf der Seite, ohne sie zu verlassen.
- Bewertungen gehen in halben Sternen, am Desktop mit Vorfüllen beim Darüberfahren.

## Nicht-Ziele

- **Keine KI.** Die KI-Suche bleibt ausgeblendet (Konzept 2.9, Spec 0005). Ihr späterer Platz als
  Symbol-Knopf im Suchfeld ist nur festgehalten.
- **Keine Sammlungen.** Kennzeichen „Sammlung“, der Filter „Art“, „Neu: Sammlung“ und „Zu Sammlung
  hinzufügen“ kommen mit Spec 0009.
- **Kein Artikel-Katalog und keine Migration der Zutaten.** Dass jede Zutat einen Artikel braucht,
  das Feld _Hinweis_ und die Zuordnung bestehender Freitext-Zutaten regelt Spec 0007. Diese Spec
  baut die Bedienung im Rezept darauf.
- **Keine neuen Navigationsbausteine.** Tab-Leiste und Seitenleiste auf jeder Seite, klebende
  Kopfzeile, Ansichts-Tabs, Fenstergrößen, „Suchen oder anlegen“ und die Filterzeile als Baustein
  kommen aus Spec 0005. Hier werden sie für „Essen“ und die Rezeptseite eingesetzt.
- **Kein neuer Kochmodus** und keine Änderung an „Ist alle“ (Spec 0001, AC-023).
- **Keine neue Restaurantseite.** Restaurants bekommen die Filterzeile, die Endlos-Liste und halbe
  Sterne; Einplanen von der Restaurantseite gehört nicht dazu.
- **Keine Datenbankänderung in dieser Spec.** Halbe Sterne brauchen eine; sie kommt mit Spec 0011,
  REQ-004 (Welle 3), zusammen mit dem Sterne-Baustein, den diese Spec einsetzt (REQ-011).
- **Kein eigener Ablauf „Auf die Liste“.** Vorratscheck, Herkunft und Übernehmen regelt Spec 0006,
  REQ-010; diese Spec setzt nur den Knopf in die neue Rezeptseite.

## Konzept in Kürze

Grundlage ist das freigegebene UI-Konzept v2 (`docs/product/ui-konzept-v2.md`), Abschnitte 2.4,
2.6 bis 2.9, 2.11, 3.2 und 3.3, mit den Entscheidungen D1, D9, D10, D11 und D12 (alle
ENTSCHIEDEN).

- **Kopf von „Essen“:** Titel, ⊞ Verwalten, „+“ und Avatar (Spec 0005). Darunter die Ansichts-Tabs
  **Rezepte · Restaurants** (D1). Der Segment-Balken entfällt.
- **Eine Such- und Filterzeile (D10):** Suchfeld; darunter [Filter (n)], [↕ Sortierung ▾] und
  seitlich wischbare Schnell-Chips. Das Filterfeld öffnet auf dem Handy als mittleres Fenster und
  klappt am Desktop unter der Zeile auf. Die Küche kommt aus den eigenen Rezepten, mit Anzahl.
- **Sortieren als Menü**, auch „Zufall“ mit „⟳ Neu mischen“.
- **Endlos-Liste** statt Seiten; am Desktop Kacheln ab 260 px Breite, Foto 4:3.
- **Rezeptseite als ganze Seite (D11)** im Bereich „Essen“, am Desktop innen zweispaltig. „Zurück“
  führt an dieselbe Stelle der Liste.
- **Abschnittsweise bearbeiten (D12):** Kopf, Einordnung, Zutaten, Zubereitung und Notizen haben je
  einen Stift; „Fertig“ speichert.
- **Einplanen** im Fenster auf der Rezeptseite; **Auf die Liste** startet direkt den Vorratscheck
  aus Spec 0006. **Löschen** im ⋯.
- **Halbe Sterne (D9)** auf Rezept- und Restaurantseite, mit dem Sterne-Baustein aus Spec 0011.

**Abhängigkeiten:** Spec 0005 (Bausteine und Navigation, Trefferregel von „Suchen oder anlegen“),
0006 (eine Einkaufsliste, Vorratscheck, „Auf die Liste“), 0007 (Zutaten aus dem Artikel-Katalog,
„Mehrere einfügen“, Hinweis), 0010 (Kalender als Ziel von „Einplanen“ und „Ansehen“), 0011
(Bewertungen in halben Schritten speichern, Sterne-Baustein). Alle liegen in früheren Wellen
(Konzept, Abschnitt 5: diese Spec ist Welle 4). Spec 0009 baut auf dieser Spec auf.

**Ersetzt oder ändert:**

| Bisher                                                                                                           | Neu                                                                             |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Spec 0001, AC-008: Rezeptliste und Rezept am Desktop nebeneinander                                               | AC-019: Rezept als ganze Seite (D11)                                            |
| Spec 0002, AC-001: „Umschalter Rezepte · Restaurants“ (schon durch Spec 0005, AC-020, als Ansichts-Tabs ersetzt) | AC-001 beschreibt „Essen“ im Detail; der Rest von Spec 0002, AC-001 gilt weiter |

**Regeln, die diese Spec festlegt, weil das Konzept sie offenlässt** (entschieden nach dem
bestehenden Code bzw. als kleinste Lösung):

- Die Bewertung eines Rezepts in Kacheln, Filter und Sortierung ist der **Durchschnitt aller
  Mitglieder**, wie heute bei der Sortierung „Bewertung“. Bei Restaurants zählt weiter die **eigene**
  Bewertung, wie heute in der Restaurantliste.
- Suche, Filter, Sortierung und Zufallsreihenfolge bleiben erhalten, solange die App offen ist (auch
  beim Öffnen eines Rezepts und beim Tab-Wechsel). Nach einem Neustart der App gilt wieder der
  Ausgangszustand: keine Filter, Sortierung „Zuletzt gekocht“ bzw. bei Restaurants „A–Z“.

## Anforderungen und Akzeptanzkriterien

Handybreite bedeutet 390 px, Desktop 1440 px (wie Spec 0001). Heute ist in allen Beispielen
Freitag, 20.11.2026 (KW 47). Der Haushalt heißt „Enrico & Nadja“.

**Geändert am 21.11.2026:** Die Seite „Heute“ heißt „Übersicht“ (Spec 0005, AC-061; Spec 0011). Der
neue Name ist in AC-027 eingesetzt; sonst ändern sich diese Kriterien nicht.

### REQ-001 — Kopf, Ansichts-Tabs und Suchzeile

> „Essen“ zeigt unter dem Kopf die Ansichts-Tabs „Rezepte · Restaurants“ und darunter nur ein
> Suchfeld, eine Filterzeile und die Zahl der Treffer.

**Offline:** offline vollständig (Anzeigen, Suchen und Filtern lesen nur aus dem lokalen Speicher).

**AC-001 — Kopf und Suchzeile** (beschreibt Spec 0005, AC-020, für „Essen“ im Detail; Spec 0005
ist Eigentümerin des Musters Ansichts-Tabs)

```gherkin
Angenommen  Handybreite und der Haushalt hat 24 Rezepte
Wenn        ich „Essen“ öffne
Dann        stehen unter dem Kopf die Ansichts-Tabs „Rezepte“ und „Restaurants“ als Text,
            „Rezepte“ aktiv mit einer Akzentlinie darunter
Und         zwischen den Ansichts-Tabs und der ersten Rezept-Kachel stehen nur das Suchfeld
            „Rezepte suchen …“, die Filterzeile und die Zeile „24 Rezepte“
Und         es gibt keinen Segment-Balken und kein KI-Symbol
```

**AC-002 — Restaurants**

```gherkin
Angenommen  „Essen“ ist offen
Wenn        ich „Restaurants“ antippe
Dann        ist „Restaurants“ aktiv, das Suchfeld heißt „Restaurants suchen …“
            und darunter stehen die Restaurants des Haushalts
Wenn        ich „Trattoria Da Enzo“ öffne und „Zurück“ wähle
Dann        ist weiterhin „Restaurants“ aktiv
```

**AC-003 — Neu** (geändert durch Spec 0009, AC-001: das Menü bietet zusätzlich „Sammlung“, das
Fenster heißt „Neu“ und hat die Auswahl-Chips „Rezept · Sammlung“)

```gherkin
Angenommen  „Essen“ ist offen und ich bin online
Wenn        ich „+“ wähle
Dann        bietet ein Menü „Rezept“, „Restaurant“ und „Starter-Rezepte“
Wenn        ich „Rezept“ wähle
Dann        öffnet sich das Fenster für ein neues Rezept wie bisher (Spec 0001, AC-021)
```

**AC-004 — Fehlerfall: Suche ohne Treffer**

```gherkin
Angenommen  „Essen → Rezepte“ ist offen
Wenn        ich „xyzzy“ suche
Dann        steht statt der Kacheln „Keine Rezepte für „xyzzy““
Und         Suchfeld und Filterzeile bleiben sichtbar
```

Die Suche selbst bleibt, wie sie ist: fehlertolerant und mit Synonymen (Spec 0001, AC-019).

### REQ-002 — Schnell-Chips und Filterfeld mit Küche

> Häufige Filter liegen als Schnell-Chips in der Filterzeile; alle Filter, auch die Küche aus den
> eigenen Rezepten, stehen im Filterfeld.

**Offline:** offline vollständig.

**Regeln**

| Teil                           | Inhalt                                                                                                                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schnell-Chips (in der Zeile)   | Favoriten (eigene), < 30 Min, Vegetarisch, Vegan, Passt für alle, Lange nicht gekocht (21 Tage, wie heute)                                                                                                                                          |
| Filterfeld, Abschnitte         | Schnell (dieselben Chips), Ernährung, Gerichtart, Küche, Zeit (< 15 · < 30 · < 60 Min, jeweils „höchstens“), Bewertung (ab 4 ★ · ab 4,5 ★)                                                                                                          |
| Mehrere Werte                  | Gerichtart und Küche: mehrere wählbar, ein Rezept passt, wenn es einen davon hat. Ernährung, Zeit, Bewertung: genau ein Wert. Zwischen den Abschnitten müssen alle passen.                                                                          |
| Küche                          | Werte aus den Rezepten des Haushalts mit Anzahl, absteigend nach Anzahl, bei Gleichstand A–Z. Groß-/Kleinschreibung und Leerzeichen am Rand zählen nicht; gezeigt wird die häufigste Schreibweise. Hat kein Rezept eine Küche, fehlt der Abschnitt. |
| [Filter (n)]                   | n = Zahl aller aktiven Filterwerte, Schnell-Chips eingeschlossen; ohne aktive Filter nur „Filter“                                                                                                                                                   |
| Aktive Werte ohne Schnell-Chip | stehen als Chips mit ✕ in der Filterzeile; ✕ nimmt den Wert heraus                                                                                                                                                                                  |
| Fuß des Filterfelds            | „Zurücksetzen“ (alle Filter aus, Sortierung bleibt) und „n Rezepte zeigen“ mit der Zahl, die gerade passt („1 Rezept zeigen“)                                                                                                                       |

**AC-005 — Küche aus den Daten**

```gherkin
Angenommen  8 Rezepte mit der Küche „Italienisch“, 5 mit „Asiatisch“, 3 mit „Orientalisch“ und
            8 ohne Küche
Wenn        ich auf dem Handy „Filter“ wähle
Dann        öffnet sich das Filterfeld als mittleres Fenster
Und         unter „Küche“ stehen in dieser Reihenfolge „Italienisch 8“, „Asiatisch 5“, „Orientalisch 3“
Wenn        ich „Italienisch“ und „Asiatisch“ wähle
Dann        heißt der Knopf im Fuß „13 Rezepte zeigen“
Wenn        ich ihn wähle
Dann        schließt das Filterfeld und es stehen genau diese 13 Rezepte da
Und         die Filterzeile zeigt „Filter (2)“ und die Chips „✕ Italienisch“ und „✕ Asiatisch“
```

**AC-006 — Schnell-Chip und Filter zusammen**

```gherkin
Angenommen  der Filter Küche „Italienisch“ ist aktiv (8 Rezepte, 3 davon mit vegetarischer Variante)
Wenn        ich den Schnell-Chip „Vegetarisch“ antippe
Dann        stehen 3 Rezepte da und die Filterzeile zeigt „Filter (2)“
Wenn        ich danach „Vegan“ antippe
Dann        ist „Vegetarisch“ nicht mehr aktiv, weil Ernährung nur einen Wert hat
```

**AC-007 — Randfall: Schreibweisen der Küche**

```gherkin
Angenommen  5 Rezepte mit der Küche „Italienisch“ und 1 Rezept mit „italienisch “
Wenn        ich das Filterfeld öffne
Dann        gibt es unter „Küche“ genau einen Chip „Italienisch 6“
Wenn        ich ihn wähle
Dann        sehe ich alle 6 Rezepte
```

**AC-008 — Randfall: kein Rezept passt**

```gherkin
Angenommen  im Filterfeld sind Küche „Orientalisch“ und Zeit „< 15 Min“ gewählt und kein Rezept passt
Dann        heißt der Knopf im Fuß „0 Rezepte zeigen“
Wenn        ich ihn wähle
Dann        steht statt der Kacheln „Keine Rezepte für diese Filter“ mit „Filter zurücksetzen“
Wenn        ich „Filter zurücksetzen“ wähle
Dann        sind alle Filter aus, die Sortierung ist unverändert und alle 24 Rezepte stehen da
```

**AC-009 — Randfall: keine Küche eingetragen**

```gherkin
Angenommen  der Haushalt „Test“ hat 3 Rezepte, keines mit Küche
Wenn        ich das Filterfeld öffne
Dann        gibt es keinen Abschnitt „Küche“
```

### REQ-003 — Sortieren als Menü, mit Zufall

> Die Sortierung ist ein Menü-Knopf mit „Zuletzt gekocht“, „Am häufigsten“, „Bewertung“, „Neu“,
> „A–Z“ und „Zufall“; die Zufallsreihenfolge bleibt stabil, bis man neu mischt.

**Offline:** offline vollständig.

**Regeln:** Die Bedeutungen bleiben wie heute: „Zuletzt gekocht“ = zuletzt gekochtes zuerst, nie
gekochte am Ende; „Am häufigsten“ = am öfter gekochten zuerst; „Bewertung“ = bester Durchschnitt
zuerst, unbewertete am Ende; „Neu“ = zuletzt angelegt zuerst; bei Gleichstand A–Z. Standard ist
„Zuletzt gekocht“. „Zufall“ mischt beim Auswählen einmal und beim Tipp auf „⟳ Neu mischen“ erneut.
Rezepte, die während der Zufallsreihenfolge dazukommen, stehen am Ende.

**AC-010**

```gherkin
Angenommen  „Essen → Rezepte“ ist offen, Sortierung „Zuletzt gekocht“
Wenn        ich „↕ Zuletzt ▾“ wähle
Dann        öffnet ein Menü mit „Zuletzt gekocht“ (mit Haken), „Am häufigsten“, „Bewertung“, „Neu“,
            „A–Z“ und „Zufall“ in dieser Reihenfolge
Wenn        ich „A–Z“ wähle
Dann        heißt der Knopf „↕ A–Z ▾“ und die Rezepte stehen alphabetisch
```

**AC-011 — Zufall bleibt stabil**

```gherkin
Angenommen  „Essen → Rezepte“ mit 24 Rezepten
Wenn        ich „Zufall“ wähle
Dann        erscheint in der Filterzeile „⟳ Neu mischen“
Wenn        ich bis zum 15. Rezept scrolle, es öffne und „Zurück“ wähle
Dann        steht dieselbe Reihenfolge da und das 15. Rezept an derselben Stelle wie vorher
Wenn        ich „⟳ Neu mischen“ wähle
Dann        stehen die Rezepte in einer neuen Reihenfolge und die Liste beginnt oben
```

**AC-012 — Randfall: Filtern und neue Rezepte während „Zufall“**

```gherkin
Angenommen  „Zufall“ zeigt „Shakshuka“, „Lasagne“, „Linsen-Dal“, „Mango-Curry“ in dieser Reihenfolge
Und         nur „Shakshuka“ und „Linsen-Dal“ sind vegetarisch
Wenn        ich „Vegetarisch“ antippe
Dann        steht „Shakshuka“ vor „Linsen-Dal“
Wenn        ich „Vegetarisch“ wieder ausschalte und Nadja auf ihrem Gerät „Kürbissuppe“ anlegt
Dann        steht „Kürbissuppe“ bei mir am Ende, die anderen vier behalten ihre Reihenfolge
```

### REQ-004 — Endlos-Liste und große Kacheln

> Rezepte und Restaurants laden beim Scrollen nach; am Desktop sind Rezept-Kacheln mindestens
> 260 px breit mit Foto 4:3.

**Offline:** offline vollständig (alle Daten liegen schon im lokalen Speicher).

**AC-013**

```gherkin
Angenommen  der Haushalt hat 150 Rezepte, Sortierung „A–Z“
Wenn        ich „Essen“ öffne und bis ans Ende scrolle
Dann        erscheinen beim Scrollen weitere Kacheln, ohne Knopf „Mehr laden“ und ohne Seitenzahlen
Und         am Ende steht das alphabetisch letzte der 150 Rezepte
```

**AC-014 — Kacheln je Breite**

```gherkin
Angenommen  Desktopbreite mit Seitenleiste
Wenn        ich „Essen → Rezepte“ öffne
Dann        stehen vier Kacheln in einer Reihe, jede mindestens 260 px breit,
            mit Foto im Format 4:3 und Titel in 20 px
Angenommen  Handybreite
Dann        stehen zwei Kacheln in einer Reihe
```

**AC-015 — Randfall: zurück an dieselbe Stelle**

```gherkin
Angenommen  ich habe in „Essen → Rezepte“ mit Filter „Vegetarisch“ bis zum 60. Rezept gescrollt
Wenn        ich es öffne und „Zurück“ wähle
Dann        steht das 60. Rezept an derselben Stelle wie vorher
Und         Suche, Filter und Sortierung sind unverändert
```

### REQ-005 — Restaurants mit derselben Filterzeile

> Die Restaurants haben dasselbe Suchfeld und dieselbe Filterzeile: Schnell-Chip „Favoriten“,
> Filterfeld mit Küche, Preisniveau und Bewertung, Sortieren nach „Zuletzt besucht“, „Bewertung“,
> „A–Z“ und „Zufall“.

**Offline:** offline vollständig.

**Regeln:** Küche wie in REQ-002, aus den Restaurants des Haushalts. Preisniveau € bis €€€€,
mehrere wählbar. Bewertung nach der eigenen Bewertung. „Zuletzt besucht“ nach dem letzten
_Besuch_ (Glossar), nie besuchte am Ende. Standard bleibt „A–Z“.
„Zufall“ wie in REQ-003. Der Knopf im Fuß heißt „n Restaurants zeigen“.

**AC-016**

```gherkin
Angenommen  die Restaurants „Trattoria Da Enzo“ (Italienisch, €€), „Pho Saigon“ (Vietnamesisch, €)
            und „Da Mario“ (Italienisch, €€€)
Wenn        ich im Filterfeld der Restaurants Küche „Italienisch“ und Preisniveau „€€“ wähle
Dann        heißt der Knopf „1 Restaurant zeigen“
Wenn        ich ihn wähle
Dann        steht nur „Trattoria Da Enzo“ da
```

**AC-017 — Zuletzt besucht**

```gherkin
Angenommen  „Pho Saigon“ stand vor 12 Tagen im Kalender, „Trattoria Da Enzo“ vor 30 Tagen,
            „Da Mario“ nie
Wenn        ich nach „Zuletzt besucht“ sortiere
Dann        lautet die Reihenfolge „Pho Saigon“, „Trattoria Da Enzo“, „Da Mario“
```

**AC-018 — Randfall: noch nichts angelegt**

```gherkin
Angenommen  der Haushalt „Test“ hat weder Rezepte noch Restaurants
Wenn        ich „Essen → Rezepte“ bzw. „Essen → Restaurants“ öffne
Dann        sind Suchfeld und Filterzeile ausgeblendet
Und         es steht der leere Zustand mit dem ersten Schritt da (Spec 0001, AC-016, in der Fassung
            von Spec 0005, AC-047; Spec 0002, AC-002)
```

### REQ-006 — Rezeptseite als ganze Seite

> Ein Rezept öffnet sich als ganze Seite im Bereich „Essen“; am Desktop innen zweispaltig, ohne
> Liste daneben.

**Offline:** offline lesend. Lesen, Portionen umrechnen, Variante wählen und „Kochen“ gehen ohne
Netz; alles, was schreibt, braucht Netz.

**AC-019** (ersetzt Spec 0001, AC-008)

```gherkin
Angenommen  Desktopbreite
Wenn        ich in „Essen“ „Mango-Curry“ wähle
Dann        füllt das Rezept die ganze Inhaltsfläche, die Seitenleiste bleibt mit „Essen“ hervorgehoben
Und         die Rezeptliste ist nicht zu sehen
Und         oben steht links das Foto und rechts der Kopf mit Titel, Einordnung und Bewertungen;
            darunter links „Zutaten“ und rechts „Zubereitung“ und „Notizen“
Und         die Kopfzeile zeigt „‹ Essen“, „Mango-Curry“, ♡, „Einplanen“, „Auf die Liste“,
            „Kochen“ und ⋯
```

**AC-020 — Handy**

```gherkin
Angenommen  Handybreite
Wenn        ich „Lasagne“ öffne
Dann        bleibt die Tab-Leiste sichtbar, „Essen“ ist aktiv
Und         die Kopfzeile zeigt „‹ Essen“, ♡ und ⋯ und bleibt beim Scrollen oben;
            nach dem Scrollen erscheint dort „Lasagne“
Und         unter dem Kopf stehen „Einplanen“, „Auf die Liste“ und „Kochen“
Und         ⋯ bietet „Foto ändern“ und „Löschen“
```

**AC-021 — Fehlerfall: Rezept gibt es nicht (mehr)**

```gherkin
Angenommen  ich habe „Halloumi-Pfanne“ offen
Wenn        Nadja „Halloumi-Pfanne“ auf ihrem Gerät löscht
Dann        zeigt meine Seite „Dieses Rezept gibt es nicht mehr“ mit „Zu Essen“
Und         dieselbe Anzeige erscheint, wenn ich die Adresse eines Rezepts aus einem anderen
            Haushalt öffne
```

**AC-022 — Offline**

```gherkin
Angenommen  das Netz ist weg
Wenn        ich „Lasagne“ öffne
Dann        sehe ich das Rezept vollständig und kann Portionen umrechnen und „Kochen“ starten
Und         „Einplanen“, „Auf die Liste“, alle Stifte, die eigenen Sterne, ♡ und „Löschen“ sind
            ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“
```

### REQ-007 — Abschnittsweise bearbeiten

> Kopf, Einordnung, Zutaten, Zubereitung und Notizen haben je einen Stift, der nur diesen Abschnitt
> bearbeitbar macht; „Fertig“ speichert ihn.

**Offline:** nur online (Bearbeiten ist Schreiben; siehe AC-022).

| Abschnitt   | Was bearbeitbar ist                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kopf        | Titel (Pflicht), Beschreibung, Portionen (1 bis 100), Zeit in Minuten                                                                                                        |
| Einordnung  | Gerichtart (genau eine), Küche (höchstens eine), Schlagworte (beliebig viele); Küche und Schlagworte per „Suchen oder anlegen“ über die Werte aus den Rezepten des Haushalts |
| Zutaten     | Varianten und Zutaten (REQ-008)                                                                                                                                              |
| Zubereitung | Schritte (anlegen, Text ändern, verschieben, entfernen) und Vorlauf (Text, Stunden vorher)                                                                                   |
| Notizen     | Freitext                                                                                                                                                                     |

**Regeln:** Es ist höchstens ein Abschnitt zugleich offen. Ohne offenen Abschnitt hat die Seite
keine Eingabefelder; der Portionen-Regler bei „Zutaten“ rechnet nur die Anzeige um (wie heute) und
ändert die gespeicherten Portionen nicht. Wer einen anderen Stift antippt oder die Seite verlässt,
speichert den offenen Abschnitt wie mit „Fertig“ (Annahme, Offene Frage 1). Die Längengrenzen der
Felder bleiben, wie sie heute in der Datenbank stehen.

**AC-023 — Notizen**

```gherkin
Angenommen  „Lasagne“ hat keine Notizen
Wenn        ich bei „Notizen“ den Stift wähle, „Mit doppelt Béchamel noch besser.“ schreibe und
            „Fertig“ wähle
Dann        steht der Text unter „Notizen“ ohne Eingabefeld
Und         Nadja sieht ihn auf ihrem Gerät, ohne neu zu laden
```

**AC-024 — Einordnung mit „Suchen oder anlegen“**

```gherkin
Angenommen  Rezepte mit der Küche „Italienisch“ und den Schlagworten „Ofen“ und „Familie“
Und         „Shakshuka“ hat keine Küche
Wenn        ich bei „Shakshuka“ die Einordnung bearbeite und unter „Küche“ „italienisch“ tippe
Dann        wird „Italienisch“ vorgeschlagen und es gibt keine Zeile „neu anlegen“
Wenn        ich stattdessen „Orientalisch“ tippe
Dann        gibt es die Zeile „„Orientalisch“ neu anlegen“
Wenn        ich sie wähle, als Schlagwort „Ofen“ aus den Vorschlägen hinzufüge und „Fertig“ wähle
Dann        zeigt die Einordnung „Orientalisch“ und das Schlagwort „Ofen“
Und         im Filterfeld steht unter „Küche“ auch „Orientalisch 1“
```

**AC-025 — Kopf**

```gherkin
Angenommen  „Lasagne“ für 4 Portionen, 60 Minuten, mit „Hackfleisch 500 g“ (Rezeptmenge)
Wenn        ich den Kopf bearbeite, 6 Portionen und 45 Minuten eintrage und „Fertig“ wähle
Dann        zeigt der Kopf „45 Min“ und die Zutaten stehen für 6 Portionen mit „Hackfleisch 500 g“
Und         auch auf Nadjas Gerät öffnet „Lasagne“ mit 6 Portionen
```

**AC-026 — Fehlerfall: Titel leer**

```gherkin
Angenommen  ich bearbeite den Kopf von „Lasagne“
Wenn        ich den Titel lösche und „Fertig“ wähle
Dann        bleibt der Abschnitt offen und das Titelfeld zeigt „Titel fehlt“
Und         gespeichert ist weiterhin „Lasagne“
```

**AC-027 — Zubereitung und Vorlauf**

```gherkin
Angenommen  „Hummus“ hat die Schritte 1 „Pürieren“, 2 „Abschmecken“, 3 „Kichererbsen kochen“
Wenn        ich die Zubereitung bearbeite, Schritt 3 an die erste Stelle ziehe, am Ende
            „Mit Olivenöl servieren“ anlege, als Vorlauf „Kichererbsen einweichen“ mit 12 Stunden
            eintrage und „Fertig“ wähle
Dann        lauten die Schritte 1 „Kichererbsen kochen“, 2 „Pürieren“, 3 „Abschmecken“,
            4 „Mit Olivenöl servieren“
Und         steht „Hummus“ morgen im Kalender, zeigt die „Übersicht“ den Vorlauf „Kichererbsen
            einweichen“
```

**AC-028 — Ruhige Leseansicht, ein Abschnitt zugleich**

```gherkin
Angenommen  „Lasagne“ ist offen und kein Abschnitt wird bearbeitet
Dann        hat die Seite kein Eingabefeld; nur der Portionen-Regler ist bedienbar
Wenn        ich auf 8 Portionen umrechne
Dann        stehen die Zutaten für 8 Portionen da, gespeichert bleiben 4
Wenn        ich „Notizen“ bearbeite und dann den Stift bei „Zubereitung“ antippe
Dann        ist die Notiz gespeichert, „Notizen“ ist zu und „Zubereitung“ ist offen
```

**AC-029 — Randfall: zweites Gerät ändert gleichzeitig**

```gherkin
Angenommen  Enrico bearbeitet die Notizen von „Lasagne“
Wenn        Nadja währenddessen den Titel in „Lasagne al forno“ ändert und speichert
Und         Enrico danach „Fertig“ wählt
Dann        heißt das Rezept „Lasagne al forno“ und hat Enricos Notiz
```

### REQ-008 — Zutaten und Varianten bearbeiten

> Im Abschnitt „Zutaten“ bekommt jede Zutat eine Menge und einen Artikel aus dem Katalog;
> Varianten lassen sich anlegen, umbenennen, als Standard setzen und entfernen.

**Offline:** nur online.

Grundlage aus Spec 0007: Jede Zutat verweist auf einen Artikel, die Suche findet Artikel des
Haushalts und des Starter-Katalogs, „Mehrere einfügen“ ordnet jeder Zeile einen Artikel zu oder
markiert sie orange (Spec 0007, REQ-002), und es gibt das Feld _Hinweis_. Trefferregel und
Doppelt-Bremse („Meinst du Kokosmilch?“) kommen aus „Suchen oder anlegen“ (Spec 0005, REQ-006).
Diese Spec legt nur fest, wie der Abschnitt „Zutaten“ sich dabei verhält.

**Aufbau im Bearbeiten:** je Zeile ≡ (verschieben), Menge (_Rezeptangabe_, Freitext wie „200 ml“),
Artikel und ⋯. Das ⋯ einer Zeile bietet: Einkaufsregel (Anzahl · Rezeptmenge · nicht übernehmen),
Zusatz für die Liste, Hinweis fürs Kochen, Variante (Basis oder eine Variante), Gruppe, Entfernen.
Unter den Zeilen: „+ Zutat“, „Mehrere einfügen“ und „+ Variante“. Jede Variante hat ⋯ mit
Umbenennen, „Als Standard“ und Entfernen.

**AC-030 — Menge und Artikel** (Treffer über den Wortteil „Milch“: Spec 0005, AC-034 und Offene
Frage 5)

```gherkin
Angenommen  „Linsen-Dal“ für 4 Portionen wird bearbeitet und der Artikel „Kokosmilch“ existiert
Wenn        ich „+ Zutat“ wähle, als Menge „400 ml“ tippe und im Artikelfeld „Milchko“
Dann        steht „Kokosmilch“ unter den Treffern und darunter „„Milchko“ neu anlegen“
Wenn        ich „Kokosmilch“ wähle und „Fertig“
Dann        steht unter „Zutaten“ „400 ml Kokosmilch“
Und         bei 8 Portionen steht dort „800 ml Kokosmilch“
```

**AC-031 — Zusatz und Hinweis**

```gherkin
Angenommen  „Linsen-Dal“ hat die Zutat „2 Zwiebeln“, Einkaufsregel „Anzahl“
Wenn        ich in ihrem ⋯ den Zusatz „rot“ und den Hinweis „fein gehackt“ eintrage und „Fertig“ wähle
Dann        steht unter „Zutaten“ „2 Zwiebeln · fein gehackt“
Wenn        ich „Linsen-Dal“ auf die Liste setze (REQ-010)
Dann        steht auf der Einkaufsliste „Zwiebeln (rot)“ und „fein gehackt“ steht dort nicht
```

**AC-032 — Fehlerfall: „Mehrere einfügen“ im Abschnitt „Zutaten“** (welche Zeilen ihren Artikel
bekommen und welche orange stehen: Spec 0007, AC-008 bis AC-010; hier nur das Verhalten des
Abschnitts)

```gherkin
Angenommen  im Abschnitt „Zutaten“ von „Linsen-Dal“ wurden „200 ml Kokosmilch“, „1 Mango“ und
            „1 TL Bockshornklee“ eingefügt, und „1 TL Bockshornklee“ steht orange mit
            „Artikel wählen“ (Spec 0007, AC-008)
Wenn        ich „Fertig“ wähle
Dann        sind „Kokosmilch“ und „Mango“ gespeichert
Und         der Abschnitt bleibt offen mit der orangen Zeile und dem Hinweis
            „1 Zutat braucht noch einen Artikel“
Wenn        ich für sie „„Bockshornklee“ neu anlegen“ wähle und „Fertig“
Dann        sind alle drei Zutaten gespeichert und der Abschnitt ist zu
```

Verlässt man die Seite, solange eine Zeile orange ist, wird nur diese Zeile nicht gespeichert (Spec
0007, AC-010).

**AC-033 — Varianten**

```gherkin
Angenommen  „Mango-Curry“ hat die Varianten „mit Tofu“ (Standard) und „mit Hähnchen“,
            mit den Zutaten „Tofu“ bzw. „Hähnchen“
Wenn        ich die Zutaten bearbeite, „+ Variante“ „mit Garnelen“ anlege, „300 g Garnelen“ dieser
            Variante zuordne, „mit Garnelen“ als Standard setze und „Fertig“ wähle
Dann        bietet die Variantenwahl auf der Seite „mit Tofu“, „mit Hähnchen“ und „mit Garnelen“,
            vorausgewählt ist „mit Garnelen“
Wenn        ich „mit Hähnchen“ entferne und „Fertig“ wähle
Dann        gibt es die Variante „mit Hähnchen“ und die Zutat „Hähnchen“ nicht mehr
            (Annahme, Offene Frage 2)
```

### REQ-009 — Einplanen von der Rezeptseite

> „Einplanen“ öffnet auf der Rezeptseite ein Fenster mit Woche, Tag, Tageszeit, „Wer isst mit?“,
> Variante und „Wer kocht?“; danach bleibt man auf der Rezeptseite.

**Offline:** nur online (siehe AC-022).

**Aufbau (mittleres Fenster, Konzept 3.3):** ‹ › blättert Wochen beliebig weit vor und zurück; Tage
Mo bis So als Auswahl-Chips; „Ohne Tag vormerken“; Tageszeit Vormittag · Mittag · Abend; „Wer isst
mit?“ mit allen Mitgliedern, die an dem Tag nicht abwesend sind, und „+ Gast“; die Aufteilung auf
Varianten wie im Kalender (nur bei Rezepten mit Varianten); „Wer kocht?“ (Mitglieder oder niemand).
Vorausgewählt sind heute und „Abend“ (Skizze in 3.3). Der Hauptknopf nennt das Ziel.

**AC-034**

```gherkin
Angenommen  „Lasagne“ ist offen und Enrico und Nadja sind diese Woche da
Wenn        ich „Einplanen“ wähle
Dann        zeigt das Fenster „KW 47 · 16.–22. Nov“, gewählt sind „Fr“ und „Abend“,
            bei „Wer isst mit?“ Enrico und Nadja
Wenn        ich „Sa“ wähle
Dann        heißt der Knopf „Am Sa Abend einplanen“
Wenn        ich ihn wähle
Dann        schließt das Fenster und ich bin weiter auf der Seite „Lasagne“
Und         der Hinweis „Eingeplant: Sa Abend · Ansehen“ erscheint
Und         im Kalender steht „Lasagne“ am Samstag, 21.11., Abend, für 2 Portionen
```

**AC-035 — Andere Woche und „Ansehen“**

```gherkin
Angenommen  das Einplanen-Fenster von „Lasagne“ ist offen
Wenn        ich mit › zu „KW 48 · 23.–29. Nov“ blättere, „Mi“ und „Mittag“ wähle und einplane
Und         im Hinweis „Ansehen“ wähle
Dann        öffnet der Kalender die Woche KW 48 mit „Lasagne“ am Mittwoch Mittag
```

**AC-036 — Randfall: Abwesenheit und unpassendes Rezept**

```gherkin
Angenommen  Nadja ist am Samstag, 28.11., abwesend
Wenn        ich im Einplanen-Fenster von „Lasagne“ KW 48 und „Sa“ wähle
Dann        ist bei „Wer isst mit?“ nur Enrico gewählt
Angenommen  das Einplanen-Fenster von „Spaghetti Bolognese“ (keine vegetarische Variante) für
            Enrico und Nadja (vegetarisch)
Dann        zeigt es „Passt nicht für Nadja“, und Einplanen bleibt möglich
```

**AC-037 — Vormerken**

```gherkin
Angenommen  das Einplanen-Fenster von „Shakshuka“ ist offen
Wenn        ich „Ohne Tag vormerken“ wähle
Dann        ist kein Tag mehr gewählt und der Knopf heißt „Vormerken“
Wenn        ich ihn wähle
Dann        steht „Shakshuka“ im Kalender unter „Vorgemerkt“ und ich bin weiter auf der Rezeptseite
```

### REQ-010 — Auf die Liste von der Rezeptseite

> „Auf die Liste“ steht auf der neu gestalteten Rezeptseite (AC-019, AC-020) und startet den Ablauf
> aus Spec 0006, REQ-010, mit der angezeigten Portionenzahl und Variante.

**Offline:** nur online (siehe AC-022).

Eigentümerin des Ablaufs ist Spec 0006 (Vorratscheck ohne Schritt 1, Herkunft ohne Tag,
Zusammenführen, Rezept ohne Zutaten). Diese Spec prüft nur, dass der Knopf der neuen Seite ihn mit
den Einstellungen der Seite startet.

**AC-038 — Knopf der neuen Rezeptseite** (Verhalten: Spec 0006, AC-058 und AC-059)

```gherkin
Angenommen  „Mango-Curry“ für 4 Portionen ist offen, auf der Seite sind 6 Portionen und die
            Variante „mit Tofu“ eingestellt
Wenn        ich „Auf die Liste“ wähle (Desktop in der Kopfzeile, Handy unter dem Kopf)
Dann        öffnet sich der Vorratscheck aus Spec 0006, AC-058, für 6 Portionen und „mit Tofu“
Wenn        ich übernehme
Dann        bin ich weiter auf der Seite „Mango-Curry“
```

**AC-039** — verworfen: siehe Spec 0006, AC-060 (Rezept ohne Zutaten, „Noch keine Zutaten“).

### REQ-011 — Halbe Sterne

> Auf Rezept- und Restaurantseite setzt jede Person ihre eigene Bewertung in halben Sternen (0,5 bis
> 5); die Bewertungen der anderen Mitglieder stehen daneben.

**Offline:** nur online (Bewerten ist Schreiben); die Anzeige geht offline.

**Sterne-Baustein:** Spec 0011 (Welle 3) baut ihn für „Wie war's?“ und legt seine Bedienung fest
(Maus mit Vorfüllen, Touch mit linker und rechter Hälfte und Ziehen, Tastatur und Screenreader;
Spec 0011, REQ-004). Diese Spec (Welle 4) setzt ihn auf der neu gestalteten Rezept- und
Restaurantseite ein und ändert seine Bedienung nicht.

- **Anzeige:** Kacheln zeigen den Durchschnitt mit höchstens einer Nachkommastelle (wie heute), die
  Restaurantliste die eigene Bewertung in Sternen.

**Datenbank:** Das Speichern in halben Schritten samt Übernahme der ganzen Sterne bringt Spec 0011,
REQ-004 (Konzept 4.5); es ist vor dieser Spec gebaut. Diese Spec ändert die Datenbank nicht.

**AC-040**

```gherkin
Angenommen  Desktopbreite, „Lasagne“ ist offen, Enrico hat nicht bewertet, Nadja hat 5 Sterne
Dann        zeigt der Kopf „Du“ mit fünf leeren Sternen und daneben „Nadja“ mit fünf vollen
Wenn        Enrico mit der Maus über die linke Hälfte des fünften Sterns fährt
Dann        sind vier Sterne voll und der fünfte halb gefüllt, gespeichert ist noch nichts
Wenn        er klickt
Dann        ist Enricos Bewertung 4,5, auch auf Nadjas Gerät
Und         die Kachel von „Lasagne“ zeigt „★ 4,8“ (Durchschnitt 4,75)
Und         Nadjas Sterne reagieren bei Enrico weder auf die Maus noch auf einen Klick
```

**AC-041 — Handy**

```gherkin
Angenommen  Handybreite, „Trattoria Da Enzo“ ist offen, Nadja hat noch nicht bewertet
Wenn        Nadja auf die rechte Hälfte des dritten Sterns tippt
Dann        ist ihre Bewertung 3
Wenn        sie danach vom ersten Stern bis auf die linke Hälfte des vierten Sterns zieht und loslässt
Dann        ist ihre Bewertung 3,5
Und         die Restaurantliste zeigt bei ihr für „Trattoria Da Enzo“ dreieinhalb Sterne
```

**AC-042 — Randfall: Durchschnitt in Filter und Sortierung**

```gherkin
Angenommen  „Lasagne“ hat 4,5 von Enrico und 5 von Nadja, „Mango-Curry“ nur 4 von Enrico,
            „Shakshuka“ keine Bewertung
Wenn        ich den Filter „ab 4,5 ★“ wähle
Dann        steht nur „Lasagne“ da
Wenn        ich stattdessen „ab 4 ★“ wähle
Dann        stehen „Lasagne“ und „Mango-Curry“ da
Wenn        ich ohne Filter nach „Bewertung“ sortiere
Dann        steht „Lasagne“ vor „Mango-Curry“ und „Shakshuka“ nach allen bewerteten Rezepten
```

### REQ-012 — Rezept löschen

> Im ⋯ der Rezeptseite lässt sich ein Rezept löschen, mit „Rückgängig“ im Hinweis statt einer
> Rückfrage.

**Offline:** nur online (siehe AC-022).

**Regeln:** Mit dem Rezept gehen seine Bewertungen, Favoriten und sein eigenes Foto (Spec 0004).
Was es im Kalender und auf der Einkaufsliste hinterlässt, regelt Offene Frage 3; die Kriterien
unten folgen der Annahme dort. Löschen und Rückgängig sind je ein Schreibvorgang, der ganz oder gar
nicht gelingt.

**AC-043**

```gherkin
Angenommen  „Halloumi-Pfanne“ steht am Montag, 16.11., und am Samstag, 21.11., im Kalender
Wenn        ich auf der Seite „Halloumi-Pfanne“ ⋯ → „Löschen“ wähle
Dann        bin ich zurück in „Essen“, „Halloumi-Pfanne“ ist in der Liste nicht mehr zu sehen
Und         der Hinweis „Halloumi-Pfanne gelöscht · Rückgängig“ erscheint für 5 Sekunden
Und         am Samstag, 21.11., steht nichts mehr; am Montag, 16.11., steht „Halloumi-Pfanne“ als
            Freitext (Annahme, Offene Frage 3)
Und         auch auf Nadjas Gerät ist das Rezept weg
```

**AC-044 — Rückgängig**

```gherkin
Angenommen  ich habe „Halloumi-Pfanne“ eben gelöscht und der Hinweis ist noch zu sehen
Wenn        ich „Rückgängig“ wähle
Dann        ist „Halloumi-Pfanne“ wieder da, mit Bewertungen, Favoriten, Foto und beiden Einträgen im
            Kalender als Rezept
```

**AC-045 — Fehlerfall: Server lehnt ab**

```gherkin
Angenommen  ich lösche „Halloumi-Pfanne“ und der Server lehnt das Löschen ab
Dann        steht „Halloumi-Pfanne“ wieder in der Liste und im Kalender, unverändert
Und         ein Hinweis sagt „Hat nicht geklappt – bitte noch einmal versuchen“
```

## Offline und Konflikte

| Bereich                                                 | Verhalten                                                                                                               |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Liste, Suche, Filter, Sortierung, Zufall, Rezept lesen  | offline vollständig aus dem lokalen Speicher                                                                            |
| Bearbeiten, Einplanen, Auf die Liste, Bewerten, Löschen | nur online; ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“ (ADR-0008); nichts wird still gesammelt          |
| Zwei Personen bearbeiten verschiedene Felder            | beide Änderungen bleiben: gesendet werden nur geänderte Felder, je Feld gewinnt die letzte Änderung (`sync.md`, AC-029) |
| Zwei Personen bearbeiten gleichzeitig die Zutaten       | die Zutatenliste gilt als ein Feld, die letzte Änderung gewinnt (Spec 0003, Entscheidung 8)                             |
| Bewertungen                                             | je Person getrennt, niemand überschreibt die Bewertung der anderen                                                      |
| Beide planen dieselbe Tageszeit ein                     | beide Einträge stehen da; eine Tageszeit nimmt beliebig viele Einträge auf (Spec 0004)                                  |
| Rezept wird gelöscht, während jemand es bearbeitet      | die Seite zeigt „Dieses Rezept gibt es nicht mehr“ (AC-021); die offene Bearbeitung wird nicht gespeichert              |
| Server lehnt eine Änderung ab                           | die Anzeige springt zurück, Hinweis „Hat nicht geklappt – bitte noch einmal versuchen“ (ADR-0011)                       |

Solange eine Änderung noch nicht bestätigt ist, zeigt die App sie schon an (Überlagerung,
ADR-0011). Die Zufallsreihenfolge und die Scroll-Position gibt es nur auf dem Gerät.

## Plattformen

- **Handy (< 700 px):** Filterfeld als mittleres Fenster, Einplanen als mittleres Fenster,
  Rezeptseite einspaltig, Tab-Leiste bleibt (außer im Kochmodus, D5).
- **Tablet und Desktop (ab 700 px, mit Seitenleiste):** Filterfeld klappt unter der Filterzeile
  auf und mit „Einklappen ▴“ wieder zu; Rezeptseite innen zweispaltig ab Desktopbreite; Vorfüllen
  der Sterne nur mit Maus.
- **Android:** Die Zurück-Taste schließt zuerst ein offenes Fenster, Menü oder Filterfeld, dann
  einen offenen Abschnitt (speichert ihn wie „Fertig“) und erst danach die Rezeptseite.
- **Tastatur:** Sortier-Menü mit Pfeiltasten und Enter, Escape schließt Menü, Fenster und
  Filterfeld. Verschieben von Zutaten und Schritten geht auch ohne Ziehen, über „Nach oben“ und
  „Nach unten“ im ⋯ (jede Wischgeste hat eine Alternative per Tipp, Spec 0001).

## Daten

- **Gelesen:** Rezepte, Artikel und Starter-Katalog, Bewertungen und Favoriten, Planeinträge,
  Abwesenheiten, Mitglieder, Restaurants und ihre Besuche.
- **Geschrieben:** Rezeptfelder (Titel, Beschreibung, Portionen, Zeit, Gerichtart, Küche,
  Schlagworte, Varianten, Zutaten, Schritte, Vorlauf, Notizen), Planeinträge, Beiträge auf der
  Einkaufsliste (über Spec 0006), die eigene Bewertung.
- **Gelöscht:** ein Rezept mit Bewertungen, Favoriten und eigenem Foto; Folgen für Kalender und
  Liste nach Offener Frage 3. Löschen ist ein kritischer Pfad: Der Plan braucht ein kurzes
  Bedrohungsmodell, Negativtests (fremder Haushalt, abgemeldet, Fehlerfall) und `/security-check`.
- **Nur auf dem Gerät, nur solange die App offen ist:** Suche, Filter, Sortierung,
  Zufallsreihenfolge, Scroll-Position.
- **Datenbank:** keine Änderung in dieser Spec. Halbe Sterne setzen die Migration aus Spec 0011,
  REQ-004 voraus (Welle 3, vor dieser Spec).
- **Personenbezogen:** nur die Bewertung je Mitglied, wie bisher; keine neuen Felder.

## Offene Fragen

| #   | Frage                                                                                                                                                                                                              | Optionen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Empfehlung                                                                                                                      | Status           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | Was passiert mit einem offenen Abschnitt, wenn man einen anderen Stift antippt oder die Seite verlässt?                                                                                                            | A: wird gespeichert wie mit „Fertig“; Ungültiges (leerer Titel, orange Zutat) bleibt ungespeichert — Pro: kein Datenverlust, ein Knopf genügt; Contra: versehentliche Änderungen landen ohne „Rückgängig“ · B: wird ohne Rückfrage verworfen — Pro: einfach; Contra: Text geht verloren · C: Dialog „Änderungen speichern?“ — Pro: bewusst; Contra: Dialog für Alltägliches, gegen DESIGN.md                                                                                             | A, weil „Fertig“ der einzige Knopf im Abschnitt ist und Verlieren von Getipptem mehr ärgert als eine kleine ungewollte Änderung | OFFEN, Annahme A |
| 2   | Was passiert beim Entfernen einer Variante mit ihren Zutaten, Schritten und Planeinträgen?                                                                                                                         | A: ihre Zutaten und Schritte entfallen mit ihr; Planeinträge zählen ihre Portionen zur Standardvariante — Pro: nichts zeigt ins Leere; Contra: Zutaten sind weg · B: Entfernen geht erst, wenn ihr keine Zutat und kein Schritt mehr zugeordnet ist — Pro: nichts geht unbemerkt verloren; Contra: umständlich                                                                                                                                                                           | A, weil der Abschnitt bis „Fertig“ zeigt, was entfällt, und der Plan stimmig bleibt                                             | OFFEN, Annahme A |
| 3   | Was passiert beim Löschen eines Rezepts mit seinen Einträgen im Kalender und seinen Beiträgen auf der Liste?                                                                                                       | A: vergangene Einträge bleiben als Freitext mit dem Rezepttitel, künftige und vorgemerkte entfallen; Beiträge auf der Liste bleiben mit ihrer Herkunft als Text — Pro: Verlauf bleibt, Löschen geht in einem Schritt; Contra: aufwendigere Umkehrung · B: Löschen geht nur, wenn das Rezept nirgends im Kalender steht — Pro: einfach; Contra: jedes je gekochte Rezept wäre unlöschbar · C: alle Einträge entfallen — Pro: einfach; Contra: Verlauf und „Wie war's?“ verlieren Einträge | A, weil die Datenbank verhindert, dass ein gekochtes Essen still verschwindet, und der Verlauf erhalten bleiben soll            | OFFEN, Annahme A |
| 4   | Braucht das Löschen eine Datenbankänderung, obwohl die Spec keine vorsieht (Nicht-Ziele, „Daten“)? Planeinträge verweisen mit `on delete restrict` auf das Rezept, und Bewertungen anderer darf niemand schreiben. | A: zwei RPCs `delete_recipe`/`restore_recipe` in der Grundlage (ADR-0012), Löschen nur noch darüber; keine neue öffentliche Tabelle, kein Sync-Umbau — Pro: Löschen und Rückgängig je in einer Transaktion, Bewertungen kommen ehrlich zurück; Contra: Abweichung vom Nicht-Ziel · B: Löschen ohne Rückgängig der Bewertungen anderer — Pro: weniger Datenbank; Contra: AC-044 nicht erfüllbar                                                                                           | A, weil AC-043 bis AC-045 sonst nicht gehen (Plan E1, E2)                                                                       | OFFEN, Annahme A |
| 5   | Wo liegt beim Löschen die Grenze zwischen Verlauf und Zukunft?                                                                                                                                                     | A: Einträge bis einschließlich heute (Datum des Geräts, vom Server auf ±1 Tag geprüft) werden Freitext, Reste „Reste von <Titel>“; spätere und vorgemerkte entfallen — Pro: das heutige Essen kann schon gegessen sein und bleibt für „Wie war's?“; Contra: ein noch nicht gekochtes Essen von heute bleibt als Freitext · B: nur bis gestern — Pro: genau „vergangen“; Contra: das heutige Essen verschwindet aus dem Verlauf                                                           | A, weil Freitext harmlos ist und sich entfernen lässt, ein verlorener Eintrag nicht (Plan E3)                                   | OFFEN, Annahme A |
| 6   | Wie lange und für wen geht „Rückgängig“, und was passiert mit dem eigenen Foto?                                                                                                                                    | A: nur für die Person, die gelöscht hat, 1 Stunde lang über einen Schnappschuss auf dem Server; das Foto löscht die App erst, wenn der Hinweis ohne „Rückgängig“ ausläuft (bricht die App vorher ab, bleibt die Datei im Ordner des Haushalts liegen) — Pro: Bewertungen anderer lassen sich nicht fälschen, Foto kommt mit zurück; Contra: selten eine verwaiste Datei · B: Foto sofort löschen — Pro: nie eine Waise; Contra: „Rückgängig“ bringt das Foto nicht zurück (gegen AC-044) | A (Plan E4, E5)                                                                                                                 | OFFEN, Annahme A |
| 7   | Welche Grenzen gelten für Felder, die in der Datenbank keine eigene Grenze haben?                                                                                                                                  | A: Schritt 1–1000 Zeichen, Vorlauf-Text 1–200 Zeichen und 1–168 Stunden (leerer Text entfernt den Vorlauf), Variantenname 1–60 Zeichen und je Rezept eindeutig; alle übrigen Grenzen wie in der Datenbank — Pro: klare Meldung statt „Hat nicht geklappt“; Contra: neue Zahlen · B: nur die Grenzen der Datenbank — Pro: nichts Neues; Contra: ein zu langer Schritt scheitert erst am Server                                                                                            | A (Plan E8)                                                                                                                     | OFFEN, Annahme A |
| 8   | Welche Planeinträge betrifft das Entfernen einer Variante (Offene Frage 2)?                                                                                                                                        | A: alle Einträge des Rezepts, an jedem Tag; die Portionen gehen an die (neue) Standardvariante, ohne verbleibende Variante wird die Aufteilung leer; wird der Standard entfernt, wird die erste verbleibende Variante Standard — Pro: nichts zeigt ins Leere; Contra: ändert auch vergangene Einträge · B: nur künftige Einträge — Pro: Verlauf unverändert; Contra: vergangene Einträge zeigen auf eine Variante, die es nicht gibt                                                     | A (Plan E10)                                                                                                                    | OFFEN, Annahme A |
| 9   | Kleinigkeiten im Einplanen-Fenster, die die Spec offenlässt                                                                                                                                                        | A: ein anderer Tag setzt „Wer isst mit?“ auf die Anwesenden zurück, Gäste bleiben; „Wer kocht?“ steht anfangs auf „niemand“; vergangene Tage sind wählbar; nach „Vormerken“ kommt „Vorgemerkt · Ansehen“ (öffnet den Kalender) — Pro: wie im Kalender; Contra: eine Handänderung an den Essern geht beim Tagwechsel verloren · B: Esser bleiben beim Tagwechsel — Pro: nichts geht verloren; Contra: Abwesende bleiben still gewählt (gegen AC-036)                                      | A (Plan E11)                                                                                                                    | OFFEN, Annahme A |
| 10  | Kleinigkeiten im Filtermodell                                                                                                                                                                                      | A: der Schnell-Chip „< 30 Min“ ist derselbe Wert wie Zeit „< 30“; die Zahlen an der Küche zählen alle Rezepte, nicht die gefilterten; bei Gleichstand der Schreibweisen zählt die erste nach A–Z; neue Rezepte in „Zufall“ stehen untereinander A–Z — Pro: eindeutig und testbar; Contra: Zahlen am Chip passen nicht zur gefilterten Liste · B: Zahlen nach den übrigen Filtern — Pro: genauer; Contra: Zahlen springen beim Wählen                                                     | A (Plan E13, E14)                                                                                                               | OFFEN, Annahme A |

## Rückverfolgbarkeit

„E2E (Endwelle)“: reine Oberfläche, geprüft im Klick-Durchlauf bei 390 und 1440 px gegen den
lokalen Stack; die automatisierten e2e-Tests laufen einmal am Ende aller Wellen. „api“ meint
`packages/api/src/commands-recipes.backend.test.ts`, wenn keine Datei genannt ist. Die Spalte
„Beleg“ nennt Bildschirmfotos und Protokolle in `tmp/0008/`.

| REQ     | AC     | Task (plan.md) | Test                                                                                                                                                                                           | Beleg                                                                                                        |
| ------- | ------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| REQ-001 | AC-001 | 2, 5           | core `recipe-list.test.ts` „AC-001 …“                                                                                                                                                          | `tmp/0008/t5-390-top.png`, `tmp/0008/t5-1440-top.png`                                                        |
| REQ-001 | AC-002 | 5, 8           | E2E (Endwelle)                                                                                                                                                                                 | `tmp/0008/t8-390-list.png`, `tmp/0008/t8-1440-list.png`                                                      |
| REQ-001 | AC-003 | 5              | E2E (Endwelle)                                                                                                                                                                                 | `tmp/0008/t5-390-new-menu.png`, `tmp/0008/t5-1440-new-menu.png`                                              |
| REQ-001 | AC-004 | 2, 5           | core `recipe-list.test.ts` „AC-004 …“                                                                                                                                                          | `tmp/0008/t5-390-no-results-search.png`                                                                      |
| REQ-002 | AC-005 | 2, 5           | core `recipe-list.test.ts` „AC-005 …“ (3 Tests)                                                                                                                                                | `tmp/0008/t5-1440-filter-panel.png`, `tmp/0008/t5-1440-filter-two-cuisines.png`                              |
| REQ-002 | AC-006 | 2, 5           | core `recipe-list.test.ts` „AC-006 …“ (2 Tests)                                                                                                                                                | `tmp/0008/t5-390-filtered.png`                                                                               |
| REQ-002 | AC-007 | 2, 5           | core `recipe-list.test.ts` „AC-007 …“ (2 Tests)                                                                                                                                                | `tmp/0008/t5-1440-filter-panel.png`                                                                          |
| REQ-002 | AC-008 | 2, 5           | core `recipe-list.test.ts` „AC-008 …“ (2 Tests)                                                                                                                                                | `tmp/0008/t5-390-no-results-filter.png`, `tmp/0008/t5-1440-no-results-filter.png`                            |
| REQ-002 | AC-009 | 2, 5           | core `recipe-list.test.ts` „AC-009 …“                                                                                                                                                          | `tmp/0008/t5-1440-empty-household.png`                                                                       |
| REQ-003 | AC-010 | 2, 4, 5        | core `recipe-list.test.ts` „AC-010 …“, ui `menu-keys.test.ts` „AC-010 …“                                                                                                                       | `tmp/0008/t5-390-sort-menu.png`, `tmp/0008/t5-1440-sort-menu.png`                                            |
| REQ-003 | AC-011 | 2, 5           | core `recipe-list.test.ts` „AC-011 …“ (3 Tests)                                                                                                                                                | `tmp/0008/t5-390-random.png`, `tmp/0008/t5-1440-random.png`                                                  |
| REQ-003 | AC-012 | 2, 5           | core `recipe-list.test.ts` „AC-012 …“                                                                                                                                                          | `tmp/0008/t5-click-390.log`                                                                                  |
| REQ-004 | AC-013 | 4, 5           | E2E (Endwelle)                                                                                                                                                                                 | `tmp/0008/t4-390-grid-end.png`, `tmp/0008/t5-390-end.png`, `tmp/0008/t5-1440-end.png`                        |
| REQ-004 | AC-014 | 4, 5           | ui `grid-columns.test.ts` „AC-014: desktop width …“, „AC-014: phone width …“                                                                                                                   | `tmp/0008/t5-390-top.png`, `tmp/0008/t5-1440-top.png`                                                        |
| REQ-004 | AC-015 | 5              | E2E (Endwelle)                                                                                                                                                                                 | `tmp/0008/t5-390-back.png`, `tmp/0008/t5-1440-back.png`                                                      |
| REQ-005 | AC-016 | 2, 8           | core `restaurant-list.test.ts` „AC-016 …“ (5 Tests)                                                                                                                                            | `tmp/0008/t8-1440-filtered.png`, `tmp/0008/t8-1440-sort-menu.png`                                            |
| REQ-005 | AC-017 | 2, 8           | core `restaurant-list.test.ts` „AC-017: "Zuletzt besucht" …“                                                                                                                                   | `tmp/0008/t8-390-list.png`                                                                                   |
| REQ-005 | AC-018 | 5, 8           | E2E (Endwelle)                                                                                                                                                                                 | `tmp/0008/t5-1440-empty-household.png`, `tmp/0008/t8-1440-empty-household.png`                               |
| REQ-006 | AC-019 | 6              | E2E (Endwelle); `e2e/dev/smoke.spec.ts` öffnet die Seite                                                                                                                                       | `tmp/0008/t6-1440-page-top.png`                                                                              |
| REQ-006 | AC-020 | 4, 6           | E2E (Endwelle); `e2e/dev/smoke.spec.ts`                                                                                                                                                        | `tmp/0008/t6-390-page-top.png`, `tmp/0008/t6-390-page-scrolled.png`                                          |
| REQ-006 | AC-021 | 1, 6           | pgTAP `recipe_deletion.test.sql` „AC-021 …“ (5 Tests); Seite: E2E (Endwelle)                                                                                                                   | `tmp/0008/t6-1440-not-found.png`, `tmp/0008/t6-1440-nadja-gone.png`                                          |
| REQ-006 | AC-022 | 3, 6, 7        | api `commands-recipes.backend.test.ts` „negative: … OfflineError“ (2 Tests); Seite: E2E (Endwelle)                                                                                             | `tmp/0008/t6-390-offline.png`, `tmp/0008/t7-390-18-offline.png`                                              |
| REQ-007 | AC-023 | 2, 3, 7        | core `recipe-editor.test.ts` „AC-023 …“, api „AC-023, AC-029: …“                                                                                                                               | `tmp/0008/t7-two-nadja-ac023.png`, `tmp/0008/t7-1440-02-notes-open.png`                                      |
| REQ-007 | AC-024 | 2, 7           | core `recipe-editor.test.ts` „AC-024 …“ (3 Tests)                                                                                                                                              | `tmp/0008/t7-1440-04-cuisine-italienisch.png`, `tmp/0008/t7-1440-04b-cuisine-new.png`                        |
| REQ-007 | AC-025 | 2, 3, 7        | core `recipe-editor.test.ts` „AC-025: 6 servings …“, api „AC-025 …“                                                                                                                            | `tmp/0008/t7-390-10-servings-scaled.png`                                                                     |
| REQ-007 | AC-026 | 2, 3, 7        | core `recipe-editor.test.ts` „AC-026 …“, api „AC-026 …“                                                                                                                                        | `tmp/0008/t7-390-03-head-title-missing.png`                                                                  |
| REQ-007 | AC-027 | 2, 3, 7        | core `recipe-editor.test.ts` „AC-027 …“ (2 Tests), api „AC-027 …“                                                                                                                              | `tmp/0008/t7-1440-12-steps-open.png`, `tmp/0008/t7-1440-13-steps-saved.png`                                  |
| REQ-007 | AC-028 | 2, 4, 7        | core `recipe-editor.test.ts` „AC-028 …“ und „AC-032/E7 …“ (Regeln); Wechsel und Verlassen im Hook: E2E (Endwelle)                                                                              | `tmp/0008/t7-1440-01-read.png`, `tmp/0008/t7-1440-13b-head-invalid-before-leaving.png`                       |
| REQ-007 | AC-029 | 2, 3, 7        | core `recipe-editor.test.ts` „AC-029 …“, api „AC-023, AC-029: …“                                                                                                                               | `tmp/0008/t7-two-nadja-ac023.png`                                                                            |
| REQ-008 | AC-030 | 2, 3, 7        | core `recipe-editor.test.ts` „AC-030 …“, api „AC-030, AC-032 …“                                                                                                                                | `tmp/0008/t7-1440-06-ingredient-milchko.png`                                                                 |
| REQ-008 | AC-031 | 2, 3, 7        | core `recipe-editor.test.ts` „AC-031 …“, api „AC-031, E7 …“                                                                                                                                    | `tmp/0008/t7-two-ac031-sheet.png`, `tmp/0008/t7-two-ac031-pantry.png`                                        |
| REQ-008 | AC-032 | 2, 3, 7        | core `recipe-editor.test.ts` „AC-032 …“ (3 Tests), api „AC-030, AC-032 …“                                                                                                                      | `tmp/0008/t7-1440-07-ingredients-open-row.png`, `tmp/0008/t7-1440-08-ingredients-after-done.png`             |
| REQ-008 | AC-033 | 2, 3, 7, 9     | core `recipe-editor.test.ts` „AC-033 …“ (2 Tests), core `recipe-variants.test.ts` „AC-033 …“ (2 Tests, Vorauswahl), api „AC-033, E10 …“                                                        | `tmp/0008/t7-1440-16-variants-open.png`, `tmp/0008/t7-1440-17-variants-saved.png`                            |
| REQ-009 | AC-034 | 2, 6           | core `plan-recipe.test.ts` „AC-034 …“ (3 Tests)                                                                                                                                                | `tmp/0008/t6-1440-plan-open.png`, `tmp/0008/t6-1440-plan-done.png`                                           |
| REQ-009 | AC-035 | 2, 6           | core `plan-recipe.test.ts` „AC-035 …“ (2 Tests)                                                                                                                                                | `tmp/0008/t6-1440-plan-kw48.png`, `tmp/0008/t6-1440-ansehen-calendar.png`                                    |
| REQ-009 | AC-036 | 2, 6           | core `plan-recipe.test.ts` „AC-036 …“ (2 Tests)                                                                                                                                                | `tmp/0008/t6-1440-plan-misfit.png`                                                                           |
| REQ-009 | AC-037 | 2, 6           | core `plan-recipe.test.ts` „AC-037 …“                                                                                                                                                          | `tmp/0008/t6-1440-log.txt`                                                                                   |
| REQ-010 | AC-038 | 6              | E2E (Endwelle); Verhalten: Spec 0006, AC-058 und AC-059                                                                                                                                        | `tmp/0008/t6-1440-pantry-check.png`, `tmp/0008/t6-390-pantry-check.png`                                      |
| REQ-010 | AC-039 | —              | verworfen (Spec 0006, AC-060)                                                                                                                                                                  | —                                                                                                            |
| REQ-011 | AC-040 | 2, 4, 6        | core `recipe-list.test.ts` „AC-040 …“, core `ratings.test.ts` „AC-040 …“ (3 Tests)                                                                                                             | `tmp/0008/t6-1440-rating-hover.png`                                                                          |
| REQ-011 | AC-041 | 8              | E2E (Endwelle)                                                                                                                                                                                 | `tmp/0008/t8-390-detail.png`                                                                                 |
| REQ-011 | AC-042 | 2, 5           | core `recipe-list.test.ts` „AC-042 …“ (2 Tests)                                                                                                                                                | `tmp/0008/t5-click-1440.log`                                                                                 |
| REQ-012 | AC-043 | 1, 2, 3, 4, 6  | pgTAP `recipe_deletion.test.sql` „AC-043 …“, core `recipe-deletion.test.ts` „AC-043 …“, ui `toast-state.test.ts` „AC-043 …“, api „AC-043 …“, Integration `recipe-deletion.integration.test.ts` | `tmp/0008/t6-1440-deleted.png`, `tmp/0008/t6-1440-calendar-after-delete.png`, `tmp/0008/t6-1440-expired.png` |
| REQ-012 | AC-044 | 1, 3, 4, 6     | pgTAP „AC-044 …“, ui `toast-state.test.ts` „AC-044 …“, api „AC-044 …“, Integration `recipe-deletion.integration.test.ts`                                                                       | `tmp/0008/t6-1440-undone.png`, `tmp/0008/t6-1440-undo-photo.png`                                             |
| REQ-012 | AC-045 | 3, 6, 9        | api `commands-recipes.backend.test.ts` „AC-045 …“ (2 Tests, auch `false` vom Rückgängig)                                                                                                       | `tmp/0008/t6-1440-refused.png`, `tmp/0008/t6-390-refused.png`                                                |
