---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-20
---

# 0009 — Sammlungen

## Problem

Für einen Grillabend braucht der Haushalt mehrere Rezepte (Kartoffelsalat, Grillgemüse) und Dinge,
die zu keinem Rezept gehören (Grillkohle, Bier, Würstchen). Heute plant man jedes Rezept einzeln,
trägt den Rest von Hand auf die Liste und vergisst dabei leicht etwas. Bewerten lässt sich nur das
einzelne Rezept, nicht der Abend als Ganzes. Das Glossar kennt „Sammlung“ zwar als Artikel-Set,
gebaut wurde es nie.

## Ziel

Eine Sammlung „Grillabend“ = Grillkohle + Bier + Würstchen + Kartoffelsalat + Grillgemüse steht
unter „Essen → Rezepte“ mit dem Kennzeichen „Sammlung“. Sie wird mit einem Eintrag eingeplant, mit
einem Tipp durch den Vorratscheck auf die eine Einkaufsliste gesetzt (eigene Zutaten und alle
Zutaten der enthaltenen Rezepte, passend skaliert) und wie ein Rezept bewertet und favorisiert.

## Nicht-Ziele

- **Keine Sammlung in einer Sammlung** (D15). „Sommerfest = Grillabend + Kuchen“ geht nicht.
- **Keine Zubereitung, keine eigenen Varianten und kein eigener Kochmodus** der Sammlung. Die
  enthaltenen Rezepte behalten ihre Schritte und führen in ihren eigenen Kochmodus.
- **Kein Umwandeln** zwischen Rezept und Sammlung nach dem Anlegen.
- **Keine Küche, Gerichtart, Zeit und Schlagworte** an der Sammlung.
- **Keine Einkaufs-Vorlagen ohne Essen** als Ersatz für weitere Listen wie „Drogerie“: Deren
  Posten wandern in die eine Einkaufsliste (D25, Spec 0006).
- **Keine Bewertung der enthaltenen Rezepte über die Sammlung.** „Wie war's?“ fragt die Sammlung
  als Ganzes ab.

## Konzept in Kürze

Grundlage ist das freigegebene UI-Konzept v2 (`docs/product/ui-konzept-v2.md`), Abschnitte 3.2,
3.4, 3.5 und 4.3, mit den Entscheidungen D9, D14, D15 und D21 (alle ENTSCHIEDEN).

- **Eine Sammlung ist ein Rezept der Art „Sammlung“ (D14)** plus eine kleine Tabelle der
  enthaltenen Rezepte. Bewertung, Favorit, Foto, Suche, Filter, Einplanen und Vorratscheck gibt es
  damit schon; der Planeintrag zeigt wie bei einem Rezept auf die Sammlung.
- **Anlegen** über „+“ in „Essen“: Fenster „Neu“ mit Auswahl-Chips **Rezept · Sammlung** und Titel.
- **Inhalt:** enthaltene Rezepte (Suchen oder anlegen; Mehrfachauswahl) und eigene Zutaten aus dem
  Artikel-Katalog. Auf einer Rezeptseite fügt ⋯ → „Zu Sammlung hinzufügen“ das Rezept hinzu.
- **Portionen:** Die Sammlung hat Portionen, jedes enthaltene Rezept übernimmt sie oder hat eigene.
  Beim Einplanen skaliert alles im selben Verhältnis.
- **Auf die Liste** aus der Sammlung oder aus dem Kalender: eigene Zutaten plus Zutaten der
  enthaltenen Rezepte durch den Vorratscheck, mit Herkunft „Grillabend · Kartoffelsalat“.
- **Bewerten und Favorit** je Person; „Wie war's?“ fragt Sammlungen ab.

**Begriff:** Das Glossar definiert „Sammlung“ heute als „benanntes Set von Artikeln mit Zusätzen“
(`Collection`, `collections`). Diese Spec **definiert den Begriff neu:** Eine Sammlung ist ein
besonderes Rezept, das eigene Zutaten und andere Rezepte bündelt (Konzept 4.3). Einen eigenen Typ
`Collection` gibt es nicht. Das Glossar („Sammlung“, „Enthaltenes Rezept“, „Rezept“) ist
angepasst; das Feature-Konzept F5 („Sammlungen: benannte Sets mit Zusätzen“) trägt den Hinweis
„geändert durch UI-Konzept v2 / Spec 0009“. Die Seite der Aktivitäten, die Spec 0004 „Sammlung
‚Aktivitäten‘“ nennt, heißt ab hier Seite „Aktivitäten“ und hat mit diesem Begriff nichts zu tun.

**Abhängigkeiten:** Spec 0006 (eine Einkaufsliste, „Auf die Einkaufsliste“ mit Vorauswahl D21,
Vorratscheck), 0007 (Zutaten aus dem Artikel-Katalog), 0008 (Rezeptseite, abschnittsweises
Bearbeiten, Einplanen-Fenster, Filterfeld, Rezept löschen), 0010 (Kalender, Hinzufügen-Fenster mit
Tabs, Farbrolle „Sammlung“), 0011 („Wie war's?“ für alle Arten, Bewertungen in halben Schritten).

**Ersetzt oder ändert:**

| Bisher                                                                    | Neu                                                 |
| ------------------------------------------------------------------------- | --------------------------------------------------- |
| Glossar „Sammlung“: Set von Artikeln mit Zusätzen                         | besonderes Rezept der Art „Sammlung“ (diese Spec)   |
| Spec 0008, AC-003: Menü „+“ mit „Rezept“, „Restaurant“, „Starter-Rezepte“ | AC-001: zusätzlich „Sammlung“                       |
| Spec 0010, AC-021: Tabs im Hinzufügen-Fenster ohne „Sammlungen“           | AC-021: Tab „Sammlungen“ und „als Sammlung anlegen“ |

**Regeln, die diese Spec festlegt, weil das Konzept sie offenlässt:**

- Die **Ernährungsform** einer Sammlung wird wie bei jedem Rezept aus den Artikeln abgeleitet
  (Glossar „Ernährungsform“): aus den eigenen Zutaten und den enthaltenen Rezepten in der Variante,
  die in der Sammlung gewählt ist. Die Sammlung passt zu einer Ernährungsform nur, wenn alles passt.
- Filter nach Gerichtart, Küche und Zeit treffen keine Sammlung, weil sie diese Felder nicht hat;
  ohne bekannte Zeit fällt ein Rezept schon heute aus dem Zeit-Filter.

## Anforderungen und Akzeptanzkriterien

**Geändert am 21.11.2026:** Die Seite „Heute“ heißt „Übersicht“ (Spec 0005, AC-061; Spec 0011). Der
neue Name ist in AC-030 eingesetzt; sonst ändert sich dieses Kriterium nicht.

Heute ist in allen Beispielen Freitag, 20.11.2026 (KW 47). Der Haushalt „Enrico & Nadja“ hat
diese Rezepte:

| Rezept         | Portionen | Zutaten                                                                                                          |
| -------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| Kartoffelsalat | 4         | Kartoffeln 2 kg (Rezeptmenge), Mayonnaise (Anzahl)                                                               |
| Grillgemüse    | 4         | Zucchini 2 (Rezeptmenge), Olivenöl (Vorrat); Varianten „mit Halloumi“ (Standard, + Halloumi, Anzahl) und „vegan“ |
| Tzatziki       | 4         | Joghurt (Anzahl), Gurke (Anzahl)                                                                                 |

### REQ-001 — Sammlung anlegen

> Im Fenster „Neu“ wählt man per Auswahl-Chip „Rezept“ oder „Sammlung“; eine neue Sammlung öffnet
> sich danach auf ihrer Seite.

**Offline:** nur online (Anlegen ist Schreiben); offline sind die Einträge im Menü „+“ ausgegraut
mit „Offline – zum Bearbeiten brauchst du Netz“.

**AC-001** (ändert Spec 0008, AC-003)

```gherkin
Angenommen  „Essen“ ist offen und ich bin online
Wenn        ich „+“ wähle
Dann        bietet das Menü „Rezept“, „Sammlung“, „Restaurant“ und „Starter-Rezepte“
Wenn        ich „Sammlung“ wähle
Dann        öffnet sich das Fenster „Neu“ mit den Auswahl-Chips „Rezept · Sammlung“, „Sammlung“ gewählt
Wenn        ich den Titel „Grillabend“ eingebe und „Anlegen“ wähle
Dann        öffnet sich die Seite „Grillabend“ mit dem Kennzeichen „Sammlung“
Und         „Enthält“ ist leer mit „+ Rezept hinzufügen“, „Eigene Zutaten“ ist leer mit „+ Zutat“
```

**AC-002 — Wahl im Fenster ändern**

```gherkin
Angenommen  ich habe im Menü „+“ „Rezept“ gewählt, das Fenster „Neu“ zeigt „Rezept“ gewählt
Wenn        ich auf „Sammlung“ umschalte, „Raclette-Abend“ eingebe und „Anlegen“ wähle
Dann        ist „Raclette-Abend“ eine Sammlung und kein Rezept
```

**AC-003 — Fehlerfall: Titel fehlt**

```gherkin
Angenommen  das Fenster „Neu“ mit „Sammlung“ gewählt und leerem Titel
Wenn        ich „Anlegen“ wähle
Dann        wird nichts angelegt und das Titelfeld zeigt „Titel fehlt“
```

### REQ-002 — Seite einer Sammlung

> Eine Sammlung hat ihre Seite im Bereich „Essen“ mit Kopf, „Enthält“, „Eigene Zutaten“ und
> „Notizen“, abschnittsweise bearbeitbar wie ein Rezept (Spec 0008), ohne Zubereitung, Varianten
> und „Kochen“.

**Offline:** offline lesend.

**Aufbau (Skizze in Konzept 3.4):** Foto, Titel mit Kennzeichen „Sammlung“, Zeile „für 6 ·
2 Rezepte · 4 eigene Zutaten“, die Bewertungen, die Knöpfe „Einplanen“ und „Auf die Liste“; in der
Kopfzeile ♡ und ⋯ („Foto ändern“, „Löschen“). Der Kopf bearbeitet Titel, Beschreibung und
Portionen. **Foto:** das eigene Foto (Spec 0004); ohne eigenes Foto eine Collage aus den Fotos der
enthaltenen Rezepte in ihrer Reihenfolge; ohne jedes Foto der Platzhalter mit Stapel-Symbol.

**AC-004**

```gherkin
Angenommen  die Sammlung „Grillabend“ für 6 Portionen enthält „Kartoffelsalat“ und „Grillgemüse“
            (beide mit Foto) und die eigenen Zutaten Würstchen, Grillkohle, Bier, Grillanzünder
Wenn        ich „Grillabend“ öffne
Dann        steht unter dem Titel „für 6 · 2 Rezepte · 4 eigene Zutaten“
Und         das Foto ist eine Collage aus den Fotos von „Kartoffelsalat“ und „Grillgemüse“
Und         es gibt keinen Knopf „Kochen“ und keinen Abschnitt „Zubereitung“
Wenn        ich unter „Enthält“ „Kartoffelsalat“ antippe
Dann        öffnet sich die Rezeptseite „Kartoffelsalat“ mit „Kochen“
```

**AC-005 — Randfall: Fotos**

```gherkin
Angenommen  die Sammlung „Raclette-Abend“ enthält nur Rezepte ohne Foto
Dann        zeigt sie den Platzhalter mit Stapel-Symbol
Wenn        ich über ⋯ → „Foto ändern“ ein eigenes Foto hochlade
Dann        zeigen Sammlungsseite und Kachel dieses Foto statt Platzhalter oder Collage
```

### REQ-003 — Enthaltene Rezepte

> Rezepte kommen über „+ Rezept hinzufügen“ in der Sammlung oder über „Zu Sammlung hinzufügen“ auf
> der Rezeptseite in eine Sammlung; eine Sammlung enthält nur Rezepte, keine Sammlungen.

**Offline:** nur online.

**Regeln**

- „+ Rezept hinzufügen“ öffnet das große Fenster „Rezepte zu „Grillabend““: Suche über die Rezepte
  (keine Sammlungen), Mehrfachauswahl, „„…“ als neues Rezept“ (Suchen oder anlegen, Spec 0005),
  Fuß „n Rezepte übernehmen“. Schon enthaltene Rezepte stehen mit „schon enthalten“ und sind nicht
  wählbar.
- Auf einer Rezeptseite bietet ⋯ „Zu Sammlung hinzufügen“: ein kleines Fenster mit allen
  Sammlungen A–Z und „+ Neue Sammlung“. Sammlungen, die das Rezept schon enthalten, stehen mit
  „enthält es schon“ und sind nicht wählbar. Auf der Seite einer Sammlung fehlt dieser Eintrag.
- Ein neu hinzugefügtes Rezept übernimmt die Portionen der Sammlung und nutzt seine
  Standardvariante (REQ-005). Der Stift bei „Enthält“ ändert Reihenfolge, Portionen und Variante je
  Rezept und entfernt Rezepte aus der Sammlung; das Rezept selbst bleibt dabei unberührt.
- Der Server lehnt ab: eine Sammlung als enthaltenes Rezept, ein Rezept als Behälter, ein Rezept
  zweimal in derselben Sammlung und jedes Rezept oder jede Sammlung aus einem anderen Haushalt.

**AC-006**

```gherkin
Angenommen  die Sammlung „Grillabend“ für 6 Portionen ist leer
Wenn        ich „+ Rezept hinzufügen“ wähle, „Kartoffelsalat“ und „Grillgemüse“ ankreuze und
            „2 Rezepte übernehmen“ wähle
Dann        stehen unter „Enthält“ „Kartoffelsalat · 6 Port.“ und „Grillgemüse · 6 Port.“
```

**AC-007 — Neues Rezept beim Hinzufügen**

```gherkin
Angenommen  das Fenster „Rezepte zu „Grillabend““ ist offen und es gibt kein Rezept „Kräuterbutter“
Wenn        ich „Kräuterbutter“ suche und „„Kräuterbutter“ als neues Rezept“ wähle
Dann        gibt es das Rezept „Kräuterbutter“ in „Essen“ und es ist im Fenster angekreuzt
Wenn        ich übernehme
Dann        steht „Kräuterbutter“ unter „Enthält“
```

**AC-008 — Von der Rezeptseite**

```gherkin
Angenommen  die Sammlungen „Grillabend“ und „Raclette-Abend“, „Tzatziki“ ist in keiner
Wenn        ich auf der Seite „Tzatziki“ ⋯ → „Zu Sammlung hinzufügen“ wähle
Dann        stehen „Grillabend“ und „Raclette-Abend“ zur Wahl und „+ Neue Sammlung“
Wenn        ich „Grillabend“ wähle
Dann        erscheint der Hinweis „Zu „Grillabend“ hinzugefügt“ und „Grillabend“ enthält „Tzatziki“
Wenn        ich dort erneut „Zu Sammlung hinzufügen“ öffne, „+ Neue Sammlung“ wähle und
            „Sommerbuffet“ eingebe
Dann        gibt es die Sammlung „Sommerbuffet“ und sie enthält „Tzatziki“
```

**AC-009 — Fehlerfall: Sammlung in Sammlung**

```gherkin
Angenommen  die Sammlungen „Grillabend“ und „Raclette-Abend“
Wenn        ich im Fenster „Rezepte zu „Grillabend““ „Raclette“ suche
Dann        findet die Suche „Raclette-Abend“ nicht
Und         auf der Seite „Raclette-Abend“ bietet ⋯ kein „Zu Sammlung hinzufügen“
Wenn        jemand über die Supabase-API „Raclette-Abend“ in „Grillabend“ einfügen will
Dann        lehnt der Server das ab und „Grillabend“ bleibt unverändert
```

**AC-010 — Randfall: schon enthalten**

```gherkin
Angenommen  „Grillabend“ enthält „Kartoffelsalat“
Wenn        ich das Fenster „Rezepte zu „Grillabend““ öffne
Dann        steht „Kartoffelsalat“ mit „schon enthalten“ und lässt sich nicht ankreuzen
Und         im Fenster „Zu Sammlung hinzufügen“ der Seite „Kartoffelsalat“ steht „Grillabend“ mit
            „enthält es schon“ und lässt sich nicht wählen
```

**AC-011 — Fehlerfall: fremder Haushalt**

```gherkin
Angenommen  die Sammlung „Grillabend“ von „Enrico & Nadja“ und ein Rezept „Pizza“ des Haushalts „WG“
Wenn        ein Mitglied von „WG“ über die Supabase-API „Grillabend“ lesen, ändern oder „Pizza“
            hineinlegen will
Dann        wird das abgelehnt und kein Mitglied von „WG“ sieht, was „Grillabend“ enthält
Und         ein Mitglied von „Enrico & Nadja“ kann „Pizza“ nicht in „Grillabend“ legen
```

### REQ-004 — Eigene Zutaten

> Die eigenen Zutaten einer Sammlung sind Zutaten aus dem Artikel-Katalog mit Menge, Einkaufsregel
> und Zusatz, bearbeitet wie im Rezept (Spec 0008, REQ-008), ohne Varianten.

**Offline:** nur online.

**AC-012**

```gherkin
Angenommen  die Sammlung „Grillabend“ hat noch keine eigenen Zutaten
Wenn        ich bei „Eigene Zutaten“ den Stift wähle und „12 Würstchen“ (Rezeptmenge),
            „1 Sack Grillkohle“ (Anzahl), „1 Kasten Bier“ (Anzahl) und „Grillanzünder“ (Anzahl)
            mit Artikeln aus dem Katalog anlege und „Fertig“ wähle
Dann        stehen unter „Eigene Zutaten“ „12 Würstchen“, „1 Sack Grillkohle“, „1 Kasten Bier“ und
            „Grillanzünder“
Und         im Bearbeiten gibt es kein Feld „Variante“
```

**AC-013 — Fehlerfall: Zeile ohne Artikel** (Regel für „Mehrere einfügen“: Spec 0007, AC-008 bis
AC-010)

```gherkin
Angenommen  ich bearbeite die eigenen Zutaten von „Grillabend“
Wenn        ich „Mehrere einfügen“ mit „2 Packungen Holzspieße“ wähle und kein Artikel sicher passt
Dann        steht die Zeile orange mit „Artikel wählen“
Und         „Fertig“ speichert sie erst, wenn ein Artikel gewählt oder neu angelegt ist
```

### REQ-005 — Portionen und Skalierung

> Die Sammlung hat Portionen; jedes enthaltene Rezept übernimmt sie oder hat eigene. Beim Einplanen
> skaliert alles im Verhältnis „geplante Portionen : Portionen der Sammlung“; eigene Zutaten mit
> Einkaufsregel „Anzahl“ skalieren nicht.

**Offline:** offline lesend (die Anzeige rechnet offline; Ändern braucht Netz).

**Regeln**

- Ein enthaltenes Rezept ohne eigene Portionen übernimmt die Portionen der Sammlung, auch wenn sie
  sich später ändern. Ein Rezept mit eigenen Portionen behält sie.
- Geplante Portionen eines Eintrags = „Wer isst mit?“ plus Gäste, wie bei Rezepten.
- Faktor = geplante Portionen ÷ Portionen der Sammlung. Jedes enthaltene Rezept wird für
  „seine Portionen in der Sammlung × Faktor“ umgerechnet, eigene Zutaten mit Einkaufsregel
  „Rezeptmenge“ mit dem Faktor. Für Anzahl, Rezeptmenge und Rundung gelten die Regeln aus dem
  Glossar („Einkaufsregel“).
- **Rundung (Entscheidung beim Abschluss, Plan T10):** Auf der Einkaufsliste und im Vorratscheck
  werden umgerechnete Mengen auf kaufbare Werte aufgerundet: zählbare Einheiten (Glas, Dose,
  Becher, Packung, Stück, Bund, Sack, Kasten, …) auf ganze Stück, g und ml auf ganze Zahlen, kg
  und l auf eine Nachkommastelle („0,75 Glas“ → „1 Glas“, „56,25 g“ → „57 g“). Die Rezeptansicht
  zeigt weiter die genaue umgerechnete Menge. Das gilt für Rezepte wie für Sammlungen.
- Jedes enthaltene Rezept nutzt die Variante, die in der Sammlung gewählt ist (Standard: seine
  Standardvariante). Beim Einplanen einer Sammlung gibt es keine Aufteilung auf Varianten.

**AC-014**

```gherkin
Angenommen  „Grillabend“ für 6 Portionen enthält „Kartoffelsalat“ (übernimmt die Portionen) und
            „Grillgemüse“ mit eigenen 8 Portionen, Variante „mit Halloumi“
Und         die eigenen Zutaten „12 Würstchen“ (Rezeptmenge) und „1 Sack Grillkohle“ (Anzahl)
Und         „Grillabend“ steht am Samstag, 21.11., Abend, für Enrico, Nadja und 1 Gast
Wenn        ich diesen Eintrag auf die Einkaufsliste setze
Dann        zeigt der Vorratscheck „Kartoffeln 1,5 kg“, „Mayonnaise 1×“, „Zucchini 2×“, „Halloumi 1×“,
            „Würstchen 6×“ und „Grillkohle 1×“
Und         „Olivenöl“ steht abgewählt unter „Vorrat & Gewürze“
```

**AC-015 — Portionen der Sammlung ändern**

```gherkin
Angenommen  „Grillabend“ für 6 Portionen mit „Kartoffelsalat“ (übernimmt) und „Grillgemüse“
            (eigene 8 Portionen)
Wenn        ich im Kopf 10 Portionen eintrage und „Fertig“ wähle
Dann        steht unter „Enthält“ „Kartoffelsalat · 10 Port.“ und „Grillgemüse · 8 Port.“
```

**AC-016 — Variante in der Sammlung**

```gherkin
Angenommen  „Grillabend“ enthält „Grillgemüse“ mit eigenen 8 Portionen und der Standardvariante
            „mit Halloumi“
Wenn        ich bei „Enthält“ für „Grillgemüse“ die Variante „vegan“ wähle und „Fertig“
Dann        steht dort „Grillgemüse · vegan · 8 Port.“
Und         „Auf die Liste“ bringt „Zucchini“, aber kein „Halloumi“
Und         das Einplanen-Fenster von „Grillabend“ hat keinen Abschnitt „Variante“
```

**AC-017 — Fehlerfall: ungültige Portionen**

```gherkin
Angenommen  ich bearbeite den Kopf von „Grillabend“
Wenn        ich 0 Portionen eintrage und „Fertig“ wähle
Dann        bleibt der Abschnitt offen, das Feld zeigt „1 bis 100 Portionen“ und gespeichert bleiben 6
```

### REQ-006 — Unter „Essen → Rezepte“

> Sammlungen stehen in der Rezeptliste mit dem Kennzeichen „Sammlung“ und der Zahl ihrer Rezepte;
> Suche, Filter und Sortierung schließen sie ein, und das Filterfeld hat den Abschnitt „Art“.

**Offline:** offline vollständig.

**Regeln:** Die Kachel zeigt Foto (REQ-002), Titel, „Sammlung“ und „2 Rezepte“. Das Filterfeld
(Spec 0008, REQ-002) bekommt den Abschnitt „Art“ mit „Rezepte“ und „Sammlungen“, genau ein Wert
oder keiner. Favoriten, Bewertung, „Lange nicht gekocht“, Ernährung und „Passt für alle“ gelten für
Sammlungen wie für Rezepte; Gerichtart, Küche und Zeit treffen keine Sammlung. Die Suche findet
Sammlungen über ihren Titel. Alle Sortierungen schließen Sammlungen ein.

**AC-018**

```gherkin
Angenommen  die Sammlungen „Grillabend“ (2 Rezepte) und „Raclette-Abend“ (3 Rezepte) und 24 Rezepte
Wenn        ich „Essen → Rezepte“ öffne
Dann        trägt die Kachel „Grillabend“ das Kennzeichen „Sammlung“ und „2 Rezepte“
Wenn        ich im Filterfeld unter „Art“ „Sammlungen“ wähle
Dann        stehen nur „Grillabend“ und „Raclette-Abend“ da
Wenn        ich „grilabend“ suche
Dann        finde ich „Grillabend“
```

**AC-019 — Randfall: Filter, die eine Sammlung nicht hat**

```gherkin
Angenommen  „Grillabend“ und 24 Rezepte, keine Filter aktiv
Wenn        ich den Schnell-Chip „< 30 Min“ antippe
Dann        steht „Grillabend“ nicht da
Wenn        ich stattdessen im Filterfeld Küche „Italienisch“ wähle
Dann        steht „Grillabend“ auch nicht da
```

**AC-020 — Ernährung einer Sammlung**

```gherkin
Angenommen  „Grillabend“ hat die eigene Zutat „Würstchen“ (mit Fleisch)
Und         die Sammlung „Mezze-Abend“ enthält nur „Hummus“ (vegan) und „Tzatziki“ (vegetarisch)
Wenn        ich den Schnell-Chip „Vegetarisch“ antippe
Dann        steht „Mezze-Abend“ da und „Grillabend“ nicht
Wenn        ich stattdessen „Vegan“ antippe
Dann        steht keine der beiden Sammlungen da
```

### REQ-007 — Einplanen und im Kalender

> Eine Sammlung wird wie ein Rezept eingeplant, von ihrer Seite (Einplanen-Fenster aus Spec 0008)
> und im Kalender (Hinzufügen-Fenster aus Spec 0010), und steht dort als ein Eintrag mit ■, Titel
> und Zahl der Rezepte.

**Offline:** nur online (Einplanen ist Schreiben); der Kalender ist offline lesbar.

**Regeln:** Das Einplanen-Fenster einer Sammlung hat Woche, Tag, „Ohne Tag vormerken“, Tageszeit,
„Wer isst mit?“ und „Wer kocht?“, aber keine Variante. Im Hinzufügen-Fenster des Kalenders kommt
der Tab „Sammlungen“ zwischen „Rezepte“ und „Restaurants“ dazu, „Alle“ zeigt Sammlungen mit ■, und
„Neu anlegen als …“ bietet auch „Sammlung“. In einer Tageszeit stehen Sammlungen in der Gruppe der
Rezepte (Aktivitäten → Rezepte und Sammlungen → Restaurants), in der Reihenfolge des Eintragens.
Ein Tipp auf den Eintrag öffnet die Sammlung. Farbe der Art: „Sammlung“ (Spec 0010, D19).

**AC-021** (ändert Spec 0010, AC-021)

```gherkin
Angenommen  das Hinzufügen-Fenster des Kalenders für Samstag, 21.11., Abend
Wenn        ich den Tab „Sammlungen“ wähle
Dann        stehen dort „Grillabend“ und „Raclette-Abend“ mit ■
Wenn        ich „Sommerfest“ suche und „„Sommerfest“ als Sammlung anlegen“ wähle
Dann        gibt es die leere Sammlung „Sommerfest“ und sie steht am Samstagabend im Kalender
```

**AC-022 — Von der Seite der Sammlung**

```gherkin
Angenommen  die Seite „Grillabend“ (2 Rezepte) ist offen
Wenn        ich „Einplanen“ wähle, „Sa“ und „Abend“ wähle und „Am Sa Abend einplanen“
Dann        bin ich weiter auf der Seite „Grillabend“ und sehe „Eingeplant: Sa Abend · Ansehen“
Und         im Kalender steht am Samstag, 21.11., Abend „■ Grillabend · 2 Rezepte“
Und         ein Tipp auf den Eintrag öffnet die Seite „Grillabend“
Und         am 21.11. zeigt „Heute geplant“ eine Karte „Grillabend“ mit dem Kennzeichen „Sammlung“
```

**AC-023 — Reihenfolge in der Tageszeit**

```gherkin
Angenommen  am Samstagabend steht „Lasagne“
Wenn        ich nacheinander „Grillabend“, das Restaurant „Trattoria Da Enzo“ und die Aktivität
            „Bouldern“ hinzufüge
Dann        lautet die Reihenfolge „Bouldern“, „Lasagne“, „Grillabend“, „Trattoria Da Enzo“
```

**AC-024 — Randfall: Sammlung ohne Rezepte**

```gherkin
Angenommen  die Sammlung „Sommerfest“ enthält keine Rezepte, aber die eigene Zutat „Bier“
Wenn        sie am Samstag im Kalender steht
Dann        zeigt der Eintrag „■ Sommerfest“ ohne Zahl der Rezepte
```

### REQ-008 — Auf die Einkaufsliste

> „Auf die Liste“ auf der Seite der Sammlung und „Auf die Einkaufsliste“ im Kalender übernehmen die
> eigenen Zutaten und die Zutaten aller enthaltenen Rezepte durch den Vorratscheck in die eine
> Einkaufsliste, mit Herkunft.

**Offline:** nur online.

**Regeln:** Von der Seite der Sammlung geht es direkt zum Vorratscheck, für die Portionen der
Sammlung (derselbe direkte Einstieg wie bei einem Rezept: Spec 0006, REQ-010; der Knopf sitzt wie
auf der Rezeptseite, Spec 0008, REQ-010). Im Kalender gilt der Ablauf aus Spec 0006: Schritt 1
zeigt eine eingeplante Sammlung als einen wählbaren Eintrag „■ Grillabend (2 Rezepte)“ mit der
Vorauswahl D21; eine Sammlung ohne eigene Zutaten und ohne enthaltene Zutaten erscheint dort nicht
(dieselbe Regel wie für ein Rezept ohne Zutaten, Spec 0006, AC-061). Die Herkunft lautet
„Grillabend“ für eigene Zutaten und „Grillabend · Kartoffelsalat“ für Zutaten eines enthaltenen
Rezepts; bei eingeplanten Einträgen kommt der Tag dazu wie in Spec 0006. Gleiche Artikel aus
mehreren Herkünften werden ein Einkaufsposten mit mehreren Beiträgen.

**AC-025 — Von der Seite der Sammlung**

```gherkin
Angenommen  „Grillabend“ wie in AC-014, aber nicht eingeplant
Wenn        ich auf der Seite „Grillabend“ „Auf die Liste“ wähle
Dann        öffnet sich „Was brauchst du wirklich?“ ohne den Schritt „Was soll auf die Liste?“
Und         ausgewählt stehen „Würstchen 12×“ und „Grillkohle 1×“ mit Herkunft „Grillabend“,
            „Kartoffeln 3 kg“ und „Mayonnaise 1×“ mit „Grillabend · Kartoffelsalat“,
            „Zucchini 4×“ und „Halloumi 1×“ mit „Grillabend · Grillgemüse“
Und         „Olivenöl“ ist eingeklappt und abgewählt unter „Vorrat & Gewürze“
```

**AC-026 — Zusammenführen auf der Liste**

```gherkin
Angenommen  auf der Einkaufsliste steht „Kartoffeln 500 g“, von Hand
Wenn        ich aus AC-025 übernehme
Dann        gibt es eine Zeile „Kartoffeln 3,5 kg“
Und         ihre Herkunft zeigt „von Hand“ und „Grillabend · Kartoffelsalat“
```

**AC-027 — Aus dem Kalender**

```gherkin
Angenommen  „Grillabend“ steht wie in AC-014 am Samstag, 21.11., Abend und noch nicht auf der Liste
Wenn        ich im Kalender in KW 47 „Auf die Einkaufsliste“ wähle
Dann        steht in Schritt 1 „■ Grillabend (2 Rezepte)“ unter „SA 21“ und ist vorausgewählt
Wenn        ich „Weiter“ wähle
Dann        zeigt der Vorratscheck die Mengen aus AC-014
```

**AC-028 — Randfall: leere Sammlung**

```gherkin
Angenommen  die Sammlung „Leer“ hat weder enthaltene Rezepte noch eigene Zutaten
Wenn        ich ihre Seite öffne
Dann        ist „Auf die Liste“ ausgegraut mit dem Hinweis „Noch nichts enthalten“
```

### REQ-009 — Bewerten, Favorit und „Wie war's?“

> Jede Person bewertet eine Sammlung in halben Sternen und favorisiert sie, wie ein Rezept;
> „Wie war's?“ fragt eine eingeplante Sammlung als Ganzes ab.

**Offline:** nur online (Bewerten ist Schreiben); die Anzeige geht offline.

**Regeln:** Die Bewertung einer Sammlung ist unabhängig von den Bewertungen der enthaltenen Rezepte.
„Wie war's?“ (Spec 0011, D8: Unbewertetes der letzten 3 Tage) zeigt die Sammlung mit dem
Kennzeichen „Sammlung“ und fragt die enthaltenen Rezepte nicht einzeln ab. Ob die enthaltenen
Rezepte mit der Sammlung als gekocht gelten, regelt Offene Frage 2.

**AC-029**

```gherkin
Angenommen  die Seite „Grillabend“ ist auf Nadjas Gerät offen, „Kartoffelsalat“ hat von Nadja 3 Sterne
Wenn        Nadja 4,5 Sterne vergibt und ♡ antippt
Dann        zeigt die Kachel „Grillabend“ „★ 4,5“ und bei Nadja ist sie unter „Favoriten“
Und         „Kartoffelsalat“ hat weiter Nadjas 3 Sterne
Und         Enrico sieht Nadjas 4,5 Sterne auf der Seite „Grillabend“, seine eigenen bleiben leer
```

**AC-030 — „Wie war's?“** (derselbe Fall wie Spec 0011, AC-024, aus Sicht der Sammlung)

```gherkin
Angenommen  „Grillabend“ stand am Samstag, 21.11., im Kalender, heute ist Montag, 23.11.
Und         Enrico stand dort unter „Wer isst mit?“ und hat „Grillabend“ nicht bewertet
Wenn        Enrico die „Übersicht“ öffnet
Dann        steht unter „Wie war's?“ „Grillabend“ mit dem Kennzeichen „Sammlung“
Und         „Kartoffelsalat“ und „Grillgemüse“ stehen dort nicht wegen dieses Eintrags
Wenn        Enrico dort 4 Sterne vergibt
Dann        hat „Grillabend“ Enricos 4 Sterne und die enthaltenen Rezepte keine neue Bewertung
```

**AC-031 — Gekocht (Annahme, Offene Frage 2)**

```gherkin
Angenommen  „Kartoffelsalat“ wurde zuletzt am 1.10. gekocht
Wenn        der „Grillabend“ vom Samstag, 21.11., als gekocht gilt
Dann        gilt auch „Kartoffelsalat“ als zuletzt am 21.11. gekocht
Und         beim Schnell-Chip „Lange nicht gekocht“ steht „Kartoffelsalat“ nicht mehr
```

### REQ-010 — Löschen

> Das Löschen einer Sammlung lässt die enthaltenen Rezepte unberührt; wird ein enthaltenes Rezept
> gelöscht, verschwindet es aus allen Sammlungen.

**Offline:** nur online.

**Regeln:** Eine Sammlung wird gelöscht wie ein Rezept (Spec 0008, REQ-012, mit „Rückgängig“ im
Hinweis); ihre Einträge im Kalender behandelt die dortige Regel (Spec 0008, Offene Frage 3). Wie
das Verschwinden eines enthaltenen Rezepts angezeigt wird, regelt Offene Frage 1; die Kriterien
folgen der Annahme dort.

**AC-032**

```gherkin
Angenommen  „Grillabend“ enthält „Kartoffelsalat“ und „Grillgemüse“
Wenn        ich auf der Seite „Grillabend“ ⋯ → „Löschen“ wähle
Dann        ist „Grillabend“ aus „Essen“ verschwunden und der Hinweis „Grillabend gelöscht ·
            Rückgängig“ erscheint
Und         „Kartoffelsalat“ und „Grillgemüse“ gibt es unverändert weiter
Wenn        ich „Rückgängig“ wähle
Dann        ist „Grillabend“ wieder da und enthält wieder beide Rezepte mit ihren Portionen
```

**AC-033 — Enthaltenes Rezept wird gelöscht (Annahme, Offene Frage 1)**

```gherkin
Angenommen  „Kartoffelsalat“ ist in „Grillabend“ und „Sommerbuffet“ enthalten
Wenn        ich „Kartoffelsalat“ lösche
Dann        sagt der Hinweis „Kartoffelsalat gelöscht · auch aus 2 Sammlungen entfernt · Rückgängig“
Und         „Grillabend“ zeigt unter „Enthält“ nur noch „Grillgemüse“
Wenn        ich „Rückgängig“ wähle
Dann        ist „Kartoffelsalat“ wieder in beiden Sammlungen, mit seinen Portionen und seiner Variante
```

## Offline und Konflikte

| Bereich                                                             | Verhalten                                                                                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Sammlungen in der Liste, Seite, Kalender lesen                      | offline vollständig aus dem lokalen Speicher                                                                                  |
| Anlegen, Inhalt ändern, Einplanen, Auf die Liste, Bewerten          | nur online; ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“ (ADR-0008)                                             |
| Zwei Personen fügen gleichzeitig Rezepte hinzu                      | beide Rezepte sind enthalten; legen beide dasselbe Rezept hinein, bleibt es einmal enthalten (der Server lehnt das zweite ab) |
| Eine Person entfernt ein Rezept, die andere ändert dessen Portionen | die spätere Änderung gewinnt; ist das Rezept schon entfernt, lehnt der Server die Portionen ab und die Anzeige springt zurück |
| Eigene Zutaten von zwei Geräten gleichzeitig                        | die Zutatenliste gilt als ein Feld, die letzte Änderung gewinnt (Spec 0003, Entscheidung 8)                                   |
| Rezept wird gelöscht, während es in eine Sammlung gelegt wird       | der Server lehnt das Hineinlegen ab; Hinweis „Hat nicht geklappt – bitte noch einmal versuchen“ (ADR-0011)                    |
| Bewertungen und Favoriten                                           | je Person getrennt                                                                                                            |

Mehrteilige Änderungen (mehrere Rezepte übernehmen, Sammlung löschen samt Inhalt, Rückgängig) sind
je ein Schreibvorgang, der ganz oder gar nicht gelingt.

## Plattformen

- **Handy:** Seite einspaltig; „Rezepte zu …“ als großes Fenster (90 % Höhe), „Zu Sammlung
  hinzufügen“ als kleines Fenster.
- **Tablet und Desktop:** Seite wie die Rezeptseite zweispaltig (links „Enthält“, rechts „Eigene
  Zutaten“ und „Notizen“); Fenster als Dialog in der Mitte in den festen Größen aus Spec 0005.
- **Android:** Die Zurück-Taste schließt zuerst ein offenes Fenster, dann die Seite.
- **Tastatur:** Mehrfachauswahl im Fenster mit Leertaste; Reihenfolge unter „Enthält“ auch über
  „Nach oben“ und „Nach unten“ im ⋯ statt Ziehen.

## Daten

- **Neu gespeichert:**
  - am Rezept die **Art**: Rezept oder Sammlung; bestehende Rezepte sind „Rezept“;
  - je enthaltenem Rezept: Sammlung, Rezept, eigene Portionen (leer = wie die Sammlung), gewählte
    Variante (leer = Standardvariante) und Reihenfolge, in einer neuen Tabelle (D14). Sie ist
    relational, weil man auch rückwärts fragt („In welchen Sammlungen ist Kartoffelsalat?“) und
    Löschen sauber bleiben muss.
- **Wie jede Tabelle (Regel 5):** `household_id`, Row Level Security, ausdrückliche Grants,
  pgTAP-Isolationstest, vom Server gesetztes `updated_at`, Lösch-Trigger und Sync. Der Server sorgt
  dafür, dass Sammlung und Rezept zum selben Haushalt gehören, dass nur Rezepte enthalten sind,
  dass nur Sammlungen etwas enthalten und dass sich die Art nicht ändert.
- **Gelöscht:** Löschen einer Sammlung löscht ihre Zeilen „enthaltenes Rezept“, nicht die Rezepte.
  Löschen eines Rezepts löscht seine Zeilen in allen Sammlungen.
- **Bestehende Daten:** nichts zu migrieren außer der Art „Rezept“ für alle vorhandenen Rezepte.
  Der lokale Speicher bekommt eine neue Version und lädt einmal neu.
- **Kritischer Pfad:** neue Tabelle mit Mandantengrenze. Der Plan braucht ein kurzes
  Bedrohungsmodell, Negativtests (fremder Haushalt, abgemeldet, Sammlung in Sammlung, Fehlerfall)
  und `/security-check`.
- **Personenbezogen:** nur Bewertung und Favorit je Mitglied, wie bei Rezepten.

## Offene Fragen

| #   | Frage                                                                                                                                                                                           | Optionen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Empfehlung                                                                                                     | Status           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | Wie zeigt die App, dass ein enthaltenes Rezept gelöscht wurde (Konzept 4.3: „die Sammlung zeigt einen Hinweis“)?                                                                                | A: im Lösch-Hinweis des Rezepts („auch aus 2 Sammlungen entfernt · Rückgängig“), die Sammlung zeigt danach nichts — Pro: kein neuer gespeicherter Zustand, Rückgängig stellt alles her; Contra: die andere Person erfährt es nicht · B: die Sammlung merkt sich das gelöschte Rezept und zeigt „Kartoffelsalat wurde gelöscht“, bis jemand den Hinweis schließt — Pro: alle sehen es; Contra: zusätzlicher gespeicherter Zustand, der synchronisiert werden muss                                                                                                                                                                                  | A, weil der Hinweis die Person erreicht, die gerade löscht und es rückgängig machen kann, ohne neues Datenfeld | OFFEN, Annahme A |
| 2   | Gelten die enthaltenen Rezepte als gekocht, wenn die Sammlung als gekocht gilt?                                                                                                                 | A: ja, am selben Tag — Pro: „Zuletzt gekocht“ und „Lange nicht gekocht“ stimmen, der Kartoffelsalat wurde ja gemacht; Contra: eine Regel mehr · B: nein, nur die Sammlung — Pro: einfach; Contra: „Lange nicht gekocht“ schlägt Rezepte vor, die es gerade gab                                                                                                                                                                                                                                                                                                                                                                                    | A, weil die Filter sonst Falsches vorschlagen                                                                  | OFFEN, Annahme A |
| 3   | Woran erkennt die App, dass ein Rezept gekocht wurde (AC-031, Sortierung „Zuletzt gekocht“, „Lange nicht gekocht“)? Bisher setzen nur Beispieldaten und Starter-Rezepte diese Werte (Plan E10). | A: aus dem Kalender: jeder Eintrag mit Tag bis einschließlich heute ohne „nicht gekocht“ zählt für sein Rezept und bei einer Sammlung für jedes enthaltene Rezept; gespeicherte Werte bleiben die Vorgeschichte — Pro: stimmt ohne neuen Knopf, offline gerechnet, kein neues Datenfeld; Contra: ein geplantes, nicht gekochtes Essen zählt, bis jemand „Nicht gemacht“ wählt; die Reihenfolge ändert sich auch für Rezepte · B: neues Ereignis „gekocht“ (Knopf im Kochmodus) — Pro: genau; Contra: neue Schreibaktion und Spalten, außerhalb dieser Spec · C: AC-031 zurückstellen — Pro: kein Umbau; Contra: Offene Frage 2 bliebe wirkungslos | A, weil der Kalender schon sagt, was auf dem Tisch stand, und „Nicht gemacht“ es korrigiert                    | OFFEN, Annahme A |
| 4   | Was gilt, wenn im Rezept die Variante entfernt wird, die eine Sammlung gewählt hat?                                                                                                             | A: die Sammlung nutzt dann die Standardvariante; die gespeicherte Wahl bleibt stehen, bis jemand „Enthält“ bearbeitet — Pro: das Speichern des Rezepts bleibt bei einer Tabelle; Contra: eine verwaiste Kennung in der Datenbank · B: das Speichern des Rezepts leert die Wahl in allen Sammlungen im selben Aufruf — Pro: sauberer Bestand; Contra: der Abschnitt „Zutaten“ schreibt in eine zweite Tabelle                                                                                                                                                                                                                                      | A, weil das Ergebnis für alle gleich aussieht und das Speichern einfach bleibt                                 | OFFEN, Annahme A |
| 5   | Wie viele Rezepte darf eine Sammlung enthalten?                                                                                                                                                 | A: höchstens 50; „Fertig“ bei „Enthält“ entfernt höchstens 20 auf einmal (Grenze je Schreibvorgang) mit „Höchstens 20 Rezepte auf einmal entfernen“ — Pro: schützt vor Fehlern, kommt im Haushalt nie vor; Contra: zwei Meldungen mehr · B: keine eigene Grenze — Pro: nichts zu erklären; Contra: ein Fehler im Gerät kann riesige Sammlungen anlegen, Entfernen von mehr als 20 scheitert unerklärt                                                                                                                                                                                                                                             | A                                                                                                              | OFFEN, Annahme A |
| 6   | Wo erscheinen Sammlungen außerhalb von „Essen“?                                                                                                                                                 | A: im Hinzufügen-Fenster des Kalenders zeigt „Rezepte“ nur Rezepte, „Sammlungen“ nur Sammlungen, „Alle“ beide; „Rezept wählen …“ im Vorratscheck findet auch Sammlungen mit Kennzeichen; Reste von Sammlungen gibt es nicht (Glossar „Reste“) — Pro: klare Tabs, kein Mehraufwand im Vorratscheck; Contra: wer im Tab „Rezepte“ „Grillabend“ sucht, findet es dort nicht · B: Sammlungen auch im Tab „Rezepte“ — Pro: findet alles; Contra: der Tab „Sammlungen“ wäre doppelt                                                                                                                                                                     | A                                                                                                              | OFFEN, Annahme A |
| 7   | Zeigt „Für morgen“ (Übersicht, später der Tagesüberblick aus Spec 0013) den Vorlauf der enthaltenen Rezepte einer Sammlung?                                                                     | A: nein in dieser Spec, festgehalten für das Abschluss-Review — Pro: kein Kriterium verlangt es; Contra: „Kichererbsen einweichen“ für den Hummus im „Mezze-Abend“ fehlt · B: ja, mit Herkunft „Mezze-Abend · Hummus“ — Pro: hilfreich; Contra: Umfang ohne Kriterium, berührt Spec 0011 und 0013                                                                                                                                                                                                                                                                                                                                                 | A, weil es ohne Kriterium Umfang wäre; das Abschluss-Review entscheidet                                        | OFFEN, Annahme A |
| 8   | Was zählt die Zeile „n Rezepte“ in „Essen“, wenn Sammlungen dabei sind?                                                                                                                         | A: „24 Rezepte · 2 Sammlungen“, nur Sammlungen „2 Sammlungen“, ohne Sammlungen wie bisher — Pro: stimmt immer; Contra: längere Zeile · B: alles als „26 Rezepte“ — Pro: kurz; Contra: falsch benannt                                                                                                                                                                                                                                                                                                                                                                                                                                              | A                                                                                                              | OFFEN, Annahme A |

## Rückverfolgbarkeit

„E2E (Endwelle)“: reine Oberfläche, geprüft im Klick-Durchlauf bei 390 und 1440 px gegen den
lokalen Stack; die automatisierten e2e-Tests laufen einmal am Ende aller Wellen. „api“ meint
`packages/api/src/commands-collections.backend.test.ts`, wenn keine Datei genannt ist. Die Spalte
„Beleg“ nennt Bildschirmfotos und Protokolle in `tmp/0009/`. Die Konflikttabelle prüfen pgTAP
`collections.test.sql`, api „23505 …“, „row_not_found …“, „23503 …“ und core
`collection-editor.test.ts` „„Enthält“ after a change of another device …“ (Beleg
`tmp/0009/t8-390-conflict-removed.png`).

| REQ     | AC     | Task (plan.md) | Test                                                                                                                                                             | Beleg                                                                                 |
| ------- | ------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| REQ-001 | AC-001 | 3, 4, 6, 10    | core `collection-editor.test.ts` „AC-001 …“, api „AC-001, AC-002 …“; Menü, Seite und „+ Zutat“ E2E (Endwelle)                                                    | `tmp/0009/t6-390-new-menu.png`, `tmp/0009/t6-1440-new-collection-page.png`            |
| REQ-001 | AC-002 | 3, 4, 6        | core `collection-editor.test.ts` „AC-002 …“, api „AC-002 …“                                                                                                      | `tmp/0009/t6-390-new-collection.png`                                                  |
| REQ-001 | AC-003 | 3, 4, 6        | core `collection-editor.test.ts` „AC-003 …“, api „AC-003 …“                                                                                                      | `tmp/0009/t6-390-results.txt`                                                         |
| REQ-002 | AC-004 | 2, 5, 6        | core `collections.test.ts` „AC-004 …“, ui `collage-layout.test.ts` „AC-004 …“                                                                                    | `tmp/0009/t6-390-grillabend.png`, `tmp/0009/t6-1440-grillabend.png`                   |
| REQ-002 | AC-005 | 2, 5, 6        | core `collections.test.ts` „AC-005 …“, ui `collage-layout.test.ts` „AC-005 …“                                                                                    | `tmp/0009/t6-390-own-photo.png`, `tmp/0009/t6-1440-own-photo-tile.png`                |
| REQ-003 | AC-006 | 2, 3, 4, 8     | core `collections.test.ts`, core `collection-editor.test.ts` „AC-006 …“, api „AC-006 …“                                                                          | `tmp/0009/t8-390-picker.png`, `tmp/0009/t8-390-contents-saved.png`                    |
| REQ-003 | AC-007 | 8              | E2E (Endwelle); `createRecipe` aus Spec 0008                                                                                                                     | `tmp/0009/t8-390-picker-new.png`, `tmp/0009/t8-1440-picker-new.png`                   |
| REQ-003 | AC-008 | 3, 4, 9        | core `collection-editor.test.ts` „AC-008 …“, api „AC-008 …“, `collections.integration.test.ts` „AC-008 …“                                                        | `tmp/0009/t9-390-sheet.png`, `tmp/0009/t9-390-added.png`, `tmp/0009/t9-390-new.png`   |
| REQ-003 | AC-009 | 1, 3, 4, 9     | pgTAP `collections.test.sql` „AC-009 …“, core `collection-editor.test.ts`, api „AC-009 …“, `collections.integration.test.ts`                                     | `tmp/0009/t9-390-menu.png`                                                            |
| REQ-003 | AC-010 | 1, 3, 4, 8, 9  | pgTAP `collections.test.sql` „AC-010 …“, core `collection-editor.test.ts` „AC-010 …“, api „AC-010 …“, „23505 …“                                                  | `tmp/0009/t8-390-picker-contained.png`, `tmp/0009/t8-390-conflict-same-recipe.png`    |
| REQ-003 | AC-011 | 1, 4           | pgTAP `collections.test.sql` „AC-011 …“, `collections.integration.test.ts` „… AC-011 …“                                                                          | —                                                                                     |
| REQ-004 | AC-012 | 3, 8           | core `recipe-editor.test.ts` „AC-012 …“                                                                                                                          | `tmp/0009/t8-390-own-ingredients.png`, `tmp/0009/t8-390-own-ingredients-open-row.png` |
| REQ-004 | AC-013 | 3, 8           | core `recipe-editor.test.ts` „AC-013 …“                                                                                                                          | `tmp/0009/t8-390-row-sheet.png`                                                       |
| REQ-005 | AC-014 | 2, 4, 7, 10    | core `collections.test.ts` „AC-014 …“, api „AC-027 / AC-014 …“, core `amounts.test.ts`/`shopping.test.ts` „Spec 0009 REQ-005 …“ (Rundung)                        | `tmp/0009/t7-390-pantry.png`, `tmp/0009/t7-1440-pantry.png`                           |
| REQ-005 | AC-015 | 2, 3, 4, 8     | core `collections.test.ts`, core `collection-editor.test.ts`, `recipe-editor.test.ts` „AC-015 …“, api „AC-015 …“                                                 | `tmp/0009/t8-390-contents-saved.png`                                                  |
| REQ-005 | AC-016 | 2, 3, 4, 7, 8  | core `collections.test.ts`, core `collection-editor.test.ts` „AC-016 …“, api „AC-016 …“, „AC-016 (Einplanen) …“                                                  | `tmp/0009/t8-390-contents-edit.png`, `tmp/0009/t7-390-add-step-two.png`               |
| REQ-005 | AC-017 | 3, 4, 6, 8     | core `collection-editor.test.ts`, `recipe-editor.test.ts` „AC-017 …“, api „AC-017 …“                                                                             | `tmp/0009/t6-390-head-invalid.png`, `tmp/0009/t8-390-row-invalid.png`                 |
| REQ-006 | AC-018 | 2, 6           | core `recipe-list.test.ts` „AC-018 …“, core `collections.test.ts` „AC-018 …“                                                                                     | `tmp/0009/t6-390-filter-collections.png`, `tmp/0009/t6-1440-filter-panel.png`         |
| REQ-006 | AC-019 | 2, 6           | core `recipe-list.test.ts` „AC-019 …“                                                                                                                            | `tmp/0009/t6-390-filter-panel.png`                                                    |
| REQ-006 | AC-020 | 2, 6           | core `recipe-list.test.ts` „AC-020 …“, core `collections.test.ts` „AC-020 …“                                                                                     | `tmp/0009/t6-390-list.png`                                                            |
| REQ-007 | AC-021 | 3, 4, 7        | api „AC-021 …“                                                                                                                                                   | `tmp/0009/t7-390-add-collections.png`, `tmp/0009/t7-390-calendar-after-create.png`    |
| REQ-007 | AC-022 | 3, 6, 7        | core `calendar.test.ts` „AC-022 …“                                                                                                                               | `tmp/0009/t6-390-plan.png`, `tmp/0009/t7-390-calendar.png`                            |
| REQ-007 | AC-023 | 3, 7           | core `meal-plan.test.ts` „AC-023 …“                                                                                                                              | `tmp/0009/t7-1440-calendar.png`                                                       |
| REQ-007 | AC-024 | 2, 3, 7        | core `calendar.test.ts` „AC-022, AC-024 …“, `shopping-picker.test.ts` „AC-024 …“, core `collections.test.ts`                                                     | `tmp/0009/t6-390-sommerfest.png`, `tmp/0009/t7-390-calendar-after-create.png`         |
| REQ-008 | AC-025 | 2, 4, 6        | core `collections.test.ts` „AC-025 …“, core `shopping-list.test.ts` „AC-025, AC-027 …“, api „AC-025 …“                                                           | `tmp/0009/t6-390-pantry.png`, `tmp/0009/t6-1440-pantry.png`                           |
| REQ-008 | AC-026 | 2              | core `collections.test.ts` „AC-026 …“                                                                                                                            | —                                                                                     |
| REQ-008 | AC-027 | 2, 4, 7        | core `shopping-picker.test.ts` „AC-027 …“, core `collections.test.ts`, api „AC-027 / AC-014 …“                                                                   | `tmp/0009/t7-390-pick.png`, `tmp/0009/t7-1440-pick.png`                               |
| REQ-008 | AC-028 | 2, 6           | core `collections.test.ts` „AC-028 …“                                                                                                                            | `tmp/0009/t6-390-sommerfest.png`                                                      |
| REQ-009 | AC-029 | 4, 6, 10       | pgTAP `collections.test.sql` „AC-029 …“, api „AC-029 …“                                                                                                          | `tmp/0009/t6-1440-ac029-enrico.png`                                                   |
| REQ-009 | AC-030 | 3, 4, 7, 10    | core `recap.test.ts` „AC-030, spec 0011 AC-024 …“, api „AC-030, spec 0011 AC-024 …“                                                                              | `tmp/0009/t7-390-recap.png`, `tmp/0009/t7-1440-recap.png`                             |
| REQ-009 | AC-031 | 3, 6           | core `cooking-history.test.ts` „AC-031 …“                                                                                                                        | `tmp/0009/t6-390-list.png`                                                            |
| REQ-010 | AC-032 | 1, 3, 4, 9     | pgTAP `collections.test.sql` „AC-032 …“, core `recipe-deletion.test.ts` „AC-032 …“, api „AC-032 …“                                                               | `tmp/0009/t9-390-collection-deleted.png`, `tmp/0009/t9-390-collection-restored.png`   |
| REQ-010 | AC-033 | 1, 3, 4, 9, 10 | pgTAP `collections.test.sql` „AC-033 …“ und „T10 restore_recipe …“, core `recipe-deletion.test.ts` „AC-033 …“, api „AC-033 …“, `collections.integration.test.ts` | `tmp/0009/t9-390-deleted.png`, `tmp/0009/t9-1440-deleted.png`                         |
