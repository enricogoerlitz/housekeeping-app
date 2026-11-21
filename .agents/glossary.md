# Glossar

Fachbegriffe dieses Projekts. Jede Spec und jeder Bezeichner im Code richtet sich danach. Neue
Begriffe kommen mit dem `glossary`-Skill hinzu.

> Die Code-Bezeichner sind **vorläufig**, bis die Spec, die den Begriff zuerst umsetzt, sie
> bestätigt. Danach gilt der Eintrag hier. Einträge mit „(vorläufig)“ stammen aus den Specs 0005
> bis 0013 (UI-Konzept v2) und sind noch nicht gebaut.

### Haushalt

Die Gruppe von Personen, die Rezepte, Pläne und Listen teilt. Mandant des Systems: Alle Fachdaten
gehören genau einem Haushalt.

- **Im Code:** `Household`, `households`, `household_id`
- **Nicht verwenden:** Familie, Team, Workspace, Tenant (außer in technischen Docs)

### Mitglied

Eine angemeldete Person, die zu einem Haushalt gehört. Eine Person kann Mitglied mehrerer
Haushalte sein.

- **Im Code:** `HouseholdMember`, `household_members`
- **Nicht verwenden:** Nutzer (für die Rolle im Haushalt), Bewohner

### Artikel

Alles, was man kaufen kann, Lebensmittel genauso wie Haushaltswaren. Im Kern nur ein Name,
eindeutig je Haushalt, optional mit Bereich. Auf der Liste entsteht er bei der ersten Eingabe eines
neuen Namens; im Rezept wählt man ihn per „Suchen oder anlegen“ und legt einen neuen bewusst an
(Spec 0007). Jede Rezeptzutat verweist auf einen Artikel.

- **Im Code:** `Article`, `articles`
- **Nicht verwenden:** Produkt, Item, Ware, Zutat (für den Katalogeintrag)
- **Abgrenzung:** Eine _Zutat_ ist ein Artikel im Kontext eines Rezepts (→ Rezeptzutat). Ein
  _Packstück_ ist kein Artikel (Spec 0012).
- **Siehe auch:** [Artikel-Katalog](#artikel-katalog), [Neu aus Rezepten](#neu-aus-rezepten)

### Artikel-Katalog

Alles, was „Suchen oder anlegen“ bei einer Zutat durchsucht: die Artikel des Haushalts und der
Starter-Katalog. Wählt man einen Eintrag des Starter-Katalogs, entsteht dabei der Haushalts-Artikel
mit dessen Angaben (Spec 0007). Gepflegt wird er auf der Seite „Artikel“ unter „Verwalten“.

- **Im Code:** kein eigener Typ; die Suche läuft über `articles` und `starterCatalog`
- **Nicht verwenden:** Produktkatalog, Stammdaten (meint mehr, siehe dort)
- **Abgrenzung:** Der _Starter-Katalog_ ist nur der mitgelieferte Teil.

### Neu aus Rezepten

Markierung an einem Artikel, den die Migration aus Spec 0007 für eine Freitext-Zutat neu angelegt
hat, weil kein Artikel und kein Eintrag des Starter-Katalogs passte. Die Seite „Artikel“ zeigt
diese zum Prüfen und Zusammenführen. Die Markierung fällt weg, sobald jemand den Artikel speichert,
bestätigt, zusammenführt oder löscht (Spec 0007, Offene Frage 1).

- **Im Code (vorläufig):** `Article.needsReview`
- **Abgrenzung:** Ein Artikel, den man im Rezept bewusst neu anlegt, ist nicht „Neu aus Rezepten“.

### Stammdaten

Sammelwort in Dokumenten für die Artikel, Märkte und Bereiche eines Haushalts (Spec 0007). In der
App stehen die Seiten unter „Verwalten“ → „Einkaufen“; das Wort selbst erscheint dort nicht.

- **Im Code:** kein Bezeichner
- **Abgrenzung:** Nicht der _Starter-Katalog_; für ihn ist „Stammdaten“ verboten.

### Rezept

Eine Anleitung zum Kochen mit Titel, Portionen, Zutaten und Schritten. Jedes Rezept hat eine
**Art**: „Rezept“ oder „Sammlung“ (Spec 0009); bestehende Rezepte sind von der Art „Rezept“, und
die Art ändert sich nach dem Anlegen nicht.

- **Im Code:** `Recipe`, `recipes`; Art (vorläufig) `kind: 'recipe' | 'collection'`
- **Siehe auch:** [Sammlung](#sammlung), [Küche](#küche), [Schlagwort](#schlagwort)

### Küche

Die Länderküche oder Stilrichtung eines Rezepts oder Restaurants, z. B. „Italienisch“. Höchstens
eine je Rezept, Freitext, gewählt per „Suchen oder anlegen“ über die Werte des Haushalts. Der
Filter fasst Schreibweisen zusammen, die sich nur in Groß/Klein oder Leerzeichen am Rand
unterscheiden (Spec 0008).

- **Im Code:** `cuisine` (an `Recipe` und `Restaurant`)
- **Nicht verwenden:** Kategorie, Stil
- **Abgrenzung:** Die _Gerichtart_ (Hauptgericht, Beilage …) ist ein eigenes Feld. Sammlungen
  haben keine Küche.

### Schlagwort

Ein frei vergebenes Stichwort an einem Rezept oder Restaurant, z. B. „Ofen“ oder „Familie“;
beliebig viele. Vorgeschlagen werden die Werte aus dem Haushalt (Spec 0008).

- **Im Code:** `tags`
- **Nicht verwenden:** Tag (in der Oberfläche), Label, Kategorie
- **Abgrenzung:** _Küche_ und _Gerichtart_ sind eigene Felder.

### Rezeptzutat

Ein Artikel in einem Rezept, mit Rezeptangabe, Einkaufsregel, optionalem Zusatz für die Liste und
optionalem Hinweis fürs Kochen. Verweist immer auf einen Artikel des eigenen Haushalts (Spec 0007);
angezeigt wird der Artikelname. In der Oberfläche heißt sie einfach „Zutat“.

- **Im Code:** `RecipeIngredient`, gespeichert als Liste in `recipes.ingredients` (Spec 0003,
  Entscheidung 8); der Verweis `articleId` wird mit Spec 0007 Pflicht
- **Nicht verwenden:** Ingredient (allein), Zutatenzeile
- **Siehe auch:** [Hinweis](#hinweis), [Zusatz](#zusatz)

### Hinweis

Freitext an einer Rezeptzutat nur fürs Kochen, z. B. „fein gehackt“ oder „zimmerwarm“. Steht im
Rezept hinter der Zutat („2 Zwiebeln · fein gehackt“) und geht nie auf die Einkaufsliste (Spec
0007).

- **Im Code (vorläufig):** `RecipeIngredient.prepNote`
- **Nicht verwenden:** Notiz (die gehört zu Rezept, Restaurant oder Abwesenheit), Kommentar,
  Anmerkung
- **Abgrenzung:** Der _Zusatz_ geht auf die Liste („Frischkäse (Philadelphia)“), der Hinweis nicht.

### Rezeptangabe

Die Menge, die zum Kochen gebraucht wird, z. B. „200 ml“ oder „1 Prise“. Freitext. Ist sie als
Zahl + Einheit erkennbar, wird sie beim Umrechnen der Portionen mitskaliert.

- **Im Code:** `recipeAmount`
- **Abgrenzung:** Nicht die Menge auf der Einkaufsliste (→ Einkaufsregel).

### Einkaufsregel

Legt fest, wie eine Rezeptzutat auf die Einkaufsliste kommt: **Anzahl** (Standard 1×),
**Rezeptmenge** oder **nicht übernehmen**.

- **Im Code:** `ShoppingRule` mit `count` · `recipeAmount` · `skip`
- **Siehe auch:** [Standard-Einkaufsregel](#standard-einkaufsregel)

### Standard-Einkaufsregel

Die Einkaufsregel, die ein Artikel für eine neue Rezeptzutat vorschlägt. Sie steht am Artikel, ist
in „Artikel bearbeiten“ änderbar, und jede Wahl in einem Rezept setzt sie neu (Spec 0007, Offene
Frage 2; Vision: „zuletzt gewählte Regel wird vorgeschlagen“).

- **Im Code (vorläufig):** `Article.defaultShoppingRule`
- **Abgrenzung:** Sie gilt nur für neue Zutaten; bestehende Zutaten behalten ihre Einkaufsregel.

### Wochenplan

Die Zuordnung von Rezepten oder Freitext zu Tagen und Mahlzeiten.

- **Im Code:** `MealPlan`, Einträge `MealPlanEntry`, `meal_plan_entries`
- **Nicht verwenden:** Speiseplan, Menüplan
- **Abgrenzung:** Der _Kalender_ ist der Tab, der den Wochenplan in Woche, Monat und Jahr zeigt;
  „Wochenplan“ bleibt das Wort für das, was in einer Woche geplant ist (Spec 0010).

### Kalender

Der Tab, der bis Spec 0010 „Plan“ hieß. Zeigt Planeinträge, Abwesenheiten und Aufgaben in den
Ansichten Woche, Monat und Jahr (D16).

- **Im Code:** Adresse `/kalender`, alte Adressen unter `/plan` leiten dorthin (Spec 0010); kein
  eigener Datentyp, die Einträge bleiben `MealPlanEntry`
- **Nicht verwenden:** Plan (für den Tab, ab Spec 0010), Planer
- **Siehe auch:** [Haushalt-Zeile](#haushalt-zeile), [Abwesenheits-Streifen](#abwesenheits-streifen)

### Übersicht

Der erste Tab und die Startseite der App, bis 21.11.2026 „Heute“. Zeigt einen Tag mit allem, was
geplant und zu tun ist, und blättert durch die Wochen; ohne Auswahl ist es der heutige Tag (Spec
0011). Umbenannt, weil die Seite nicht mehr nur heute zeigt (Spec 0005, AC-061).

- **Im Code:** Adresse `/`, Route `index`, Test-IDs `tab-index` und `today-*` und der Ordner
  `features/today` bleiben (kein Umbenennen im Code nötig)
- **Nicht verwenden:** Heute (für den Tab oder die Seite), Start, Dashboard, Home
- **Abgrenzung:** „Heute“ bleibt das Wort für den heutigen Tag: der Knopf „Heute“ führt in der
  Übersicht und im Kalender zum heutigen Tag zurück; „Heute geplant“ ist ein Abschnitt. Das
  _Layout „Übersicht“_ (Spec 0005) ist das Desktop-Layout dieser Seite, kein zweiter Begriff. Der
  _Tagesüberblick_ ist eine Benachrichtigung (Spec 0013).
- **Siehe auch:** [Kalender](#kalender), [Tagesüberblick](#tagesüberblick)

### Tageszeit

Ein Platz im Tag des Wochenplans: Vormittag, Mittag oder Abend. Nimmt beliebig viele Einträge
auf, in der Reihenfolge Aktivitäten → Rezepte (auch Sammlungen, Freitext und Reste) → Restaurants
(Spec 0004, Spec 0009).

- **Im Code:** `MealSlot`, `meal_slots` (Name aus der Zeit, als nur Essen geplant wurde)
- **Nicht verwenden:** Mahlzeit (für den Platz im Plan), Slot (in der Oberfläche)

### Reste

Ein Planeintrag, der ein früher geplantes Gericht noch einmal auf den Tisch bringt, z. B. „Reste von
Linsen-Dal“. Angeboten werden die Rezepte und Freitexte der sieben Tage vor dem Zieltag, über
Wochen- und Jahresgrenzen hinweg; die jüngsten zuerst (Spec 0010, REQ-011, geändert am 21.11.2026,
vorher nur die gezeigte Woche). Gilt in Symbol und Farbe als Rezept, wird nicht bewertet.

- **Im Code:** `MealPlanEntry` mit `kind: 'leftovers'` und `leftoversOfEntryId` (Verweis auf das
  Gericht)
- **Nicht verwenden:** Restessen, Leftovers (in der Oberfläche), Aufgewärmtes
- **Abgrenzung:** Der _Zieltag_ ist der Tag, für den man hinzufügt; Gerichte desselben Tags und
  danach zählen nicht. Reste von Resten, Restaurants, Aktivitäten und Sammlungen gibt es nicht.

### Haushalt-Zeile

Die dünne, graue Zeile im Kalender über den Tageszeiten mit den Aufgaben eines Tages: an
vergangenen Tagen die Erledigungen, heute das Fällige zum Abhaken, an künftigen Tagen die
berechneten Termine (bei flexiblem Rhythmus gestrichelt mit „etwa“). Standard: Woche an, Monat aus,
Jahr nie; die Wahl liegt auf dem Gerät (Spec 0010, D18).

- **Im Code (vorläufig):** `HouseholdRow` (Baustein); künftige Termine berechnet `packages/core`
  aus `Recurrence`, gespeichert wird nichts
- **Nicht verwenden:** Aufgabenzeile, Haushaltsleiste
- **Abgrenzung:** Aufgaben stehen nie in einer Tageszeit.

### Restaurant

Ein Lokal, in das der Haushalt essen geht: Name, optional Adresse, Koordinaten, Karten-Link,
Küche, Preisniveau, Schlagworte und eine Notiz für den Haushalt. Bewertung und Favorit gelten je
Mitglied. Wird meist aus einem geteilten Link von Google Maps oder Apple Karten angelegt und kann
statt eines Rezepts im Wochenplan stehen.

- **Im Code:** `Restaurant`, `restaurants`; im Wochenplan `MealPlanEntry` mit `kind: 'restaurant'`
  und `restaurantId`
- **Nicht verwenden:** Lokal, Location, Gaststätte, Ort (für das Restaurant selbst)

### Besuch

Ein Restaurant, das an einem Tag bis heute im Wochenplan stand. Besuche werden nicht eigens
gespeichert, sondern aus den Einträgen des Wochenplans abgeleitet („Zuletzt: vor 12 Tagen · 3
Besuche“).

- **Im Code:** abgeleitet mit `restaurantVisits` aus `MealPlanEntry` mit `kind: 'restaurant'`
- **Nicht verwenden:** Termin, Check-in
- **Abgrenzung:** Eine _Reservierung_ ist die Uhrzeit an einem Restaurant-Eintrag (Spec 0013), kein
  Besuch und kein Ersatz dafür.

### Reservierung

Die Uhrzeit, für die an einem Restaurant-Eintrag im Kalender reserviert ist („Reserviert um
19:30“), mit der Vorlaufzeit der Erinnerung („Erinnern 2 h vorher“, Standard 120 Minuten). Nur bei
Restaurant-Einträgen. Reserviert wird weiter in den Karten-Apps; die App hält nur die Uhrzeit fest
(Spec 0013, D43).

- **Im Code (vorläufig):** am `MealPlanEntry` mit `kind: 'restaurant'`: `reservedAt`,
  `remindMinutesBefore`
- **Nicht verwenden:** Buchung, Termin
- **Abgrenzung:** Ein _Besuch_ wird aus dem Wochenplan abgeleitet und hat keine Uhrzeit.

### Einkaufsliste

Die Liste der Einkaufsposten des Haushalts. **Genau eine je Haushalt** (Spec 0006, D25): Sie ist
die Menge der Einkaufsposten des Haushalts und hat keinen eigenen Namen und keine eigene Zeile
(ADR-0012). Auf der Seite „Liste“ wird sie bearbeitet, in „Einkaufen“ abgehakt.

- **Im Code:** keine eigene Tabelle; `shopping_items.household_id` (`ShoppingItem` ohne Listen-Kennung)
- **Nicht verwenden:** Standardliste (historisch, bis Spec 0006: die Liste, in die der Wochenplan
  schrieb), Einkaufszettel
- **Siehe auch:** [Einkaufsposten](#einkaufsposten), [Standardmarkt](#standardmarkt)

### Einkaufsposten

Ein Artikel auf der Einkaufsliste, eine Zeile je Artikel. Setzt sich aus **Beiträgen** zusammen
(je Rezept bzw. Eintrag im Kalender und von Hand), die beim Anzeigen zusammengerechnet werden.

- **Im Code:** `ShoppingItem`, `shopping_items`; Beiträge `ShoppingContribution`
- **Nicht verwenden:** Eintrag, Position
- **Siehe auch:** [Herkunft](#herkunft)

### Herkunft

Woher ein Beitrag eines Einkaufspostens kommt, wie es beim Antippen steht: „Lasagne (Fr): 1× · von
Hand: 1×“. Ein Beitrag aus dem Kalender trägt den Wochentag in Klammern, einer direkt von der
Rezeptseite oder über „Rezept wählen …“ steht ohne Tag („Mango-Curry“); aus einer Sammlung
„Grillabend“ bzw. „Grillabend · Kartoffelsalat“ (Spec 0006, Spec 0009).

- **Im Code:** `ShoppingContribution.source` (`ContributionSource`: `manual` · `recipe` mit
  `label` · `recurring`)
- **Nicht verwenden:** Quelle (in der Oberfläche), Ursprung

### Zusatz

Freitext zu einem Beitrag eines Einkaufspostens, z. B. „laktosefrei“ oder „Gouda oder
Emmentaler“. In der Liste steht er in Klammern hinter dem Artikel. Bringen mehrere Beiträge
verschiedene Zusätze mit, stehen sie nebeneinander. Auch ein Planeintrag einer Aktivität kann
einen Zusatz haben: „Eislaufen (Hohenschönhausen)“ (Spec 0004).

- **Im Code:** `note` (am `ShoppingContribution` und am `MealPlanEntry`); an der Rezeptzutat
  `shoppingNote`
- **Nicht verwenden:** Notiz (die gehört zu Rezept, Restaurant oder Abwesenheit), Kommentar
- **Abgrenzung:** Der _Hinweis_ an einer Zutat ist nur fürs Kochen und geht nicht auf die Liste.

### Notiz

Freitext des Haushalts an einem Rezept („Notizen“), einem Restaurant („Notiz“, z. B.
„Trüffelpasta!“) oder einer Abwesenheit. An der Abwesenheit ist sie die Beschriftung des Streifens,
z. B. „Urlaub Mallorca“ (Spec 0010, D22). Optional; gilt für alle Mitglieder, anders als Bewertung
und Favorit.

- **Im Code:** `notes` an `Recipe` und `Restaurant`, `note` an `Absence`
- **Nicht verwenden:** Kommentar, Anmerkung, Beschreibung
- **Abgrenzung:** Der _Zusatz_ steht an einem Beitrag der Einkaufsliste oder einem Planeintrag, der
  _Hinweis_ an einer Rezeptzutat fürs Kochen; beide heißen nie „Notiz“. Die Beschreibung eines
  Rezepts oder einer Aktivität (`description`) ist ein eigenes Feld.
- **Siehe auch:** [Zusatz](#zusatz), [Hinweis](#hinweis), [Abwesenheit](#abwesenheit)

### Markt

Ein Supermarkt oder Laden, in dem der Haushalt einkauft.

- **Im Code:** `Store`, `stores`
- **Nicht verwenden:** Geschäft, Filiale, Shop

### Standardmarkt

Der Markt, den „Einkaufen“ vorauswählt, wenn auf dem Gerät noch nie ein Markt gewählt wurde oder
der gewählte gelöscht ist. Gehört dem Haushalt und liegt in der Datenbank; der zuletzt gewählte
Markt liegt nur auf dem Gerät (Spec 0006, D26).

- **Im Code:** `Household.defaultStoreId`, `households.default_store_id`
- **Nicht verwenden:** Hauptmarkt, Lieblingsmarkt
- **Abgrenzung:** Ohne Standardmarkt und ohne Wahl gilt „Ohne Markt – nach Bereichen“.

### Bereich

Eine Abteilung im Laden, z. B. „Obst & Gemüse“ oder „Kühlung“. Gehört dem Haushalt, nicht dem
Markt.

- **Im Code:** `Area`, `areas`
- **Nicht verwenden:** Kategorie, Abteilung, Gang, Regal

### Laufreihenfolge

Die Reihenfolge der Bereiche in einem bestimmten Markt. Jeder Markt hat seine eigene und kann
Bereiche ausblenden. Ohne Markt gilt die Reihenfolge der Bereiche selbst („Reihenfolge ohne
Markt“).

- **Im Code:** `Store.areaOrder` und `Store.hiddenAreaIds` (`stores.area_order`,
  `stores.hidden_area_ids`); ohne Markt `Area.sort`
- **Nicht verwenden:** Laufweg (steht im UI-Konzept 3.9, gemeint ist dasselbe)

### Einkaufsmodus

Die Ansicht der Einkaufsliste im Laden: sortiert nach der Laufreihenfolge des gewählten Markts,
optimiert zum Abhaken mit einer Hand. In der Oberfläche „Einkaufen“, auf dem Handy als Vollbild
mit „Fertig“ (Spec 0005, D5).

- **Im Code:** `ShoppingMode`

### Sync

Der automatische Abgleich zwischen der lokalen Datenbank eines Geräts und dem Server.

- **In der Oberfläche:** „wird synchronisiert“, „alles gespeichert“
- **Siehe:** `docs/architecture/sync.md`

### Synonym

Ein weiterer Name für denselben Artikel, z. B. „Karotten“ für „Möhren“. Name und Synonyme sind je
Haushalt eindeutig. Suche und Autovervollständigung treffen beide.

- **Im Code:** `Article.synonyms` (`articles.synonyms`, eindeutig über `synonym_keys`)
- **Nicht verwenden:** Alias (außer im Code-Kommentar), Schreibweise

### Vorrat

Ausdrückliche Markierung an einem Artikel, der meist im Haus ist (Gewürze, Öl, Mehl). Im
Vorratscheck sind Vorrat-Posten abgewählt. Die App setzt die Markierung nie von selbst.

- **Im Code:** `isPantry`
- **Abgrenzung:** kein Bestand mit Mengen. Die Einkaufsregel „nicht übernehmen“ ist etwas anderes:
  Sie blendet eine Zutat ganz aus.

### Vorratscheck

Der Schritt vor dem Übernehmen auf die Einkaufsliste („Was brauchst du wirklich?“): Alle Posten
werden gezeigt; Ausgewähltes ist normaler Text mit Haken, Abgewähltes („haben wir“) blass und
durchgestrichen; Vorrat-Posten sind eingeklappt und abgewählt. Was abgewählt ist, kommt nicht auf
die Liste. Von der Seite eines Rezepts oder einer Sammlung startet er direkt, sonst nach dem
Schritt „Was soll auf die Liste?“ (Spec 0006, Spec 0009).

- **Im Code:** `PantryCheck`

### Starter-Katalog

Rund 300 gängige Artikel mit Bereich, Ernährungseigenschaft, Vorrat und Synonymen, die fest in der
App liegen. Ein Artikel des Haushalts entsteht erst bei der ersten Nutzung.

- **Im Code:** `starterCatalog`
- **Nicht verwenden:** Stammdaten (meint die eigenen Artikel, Märkte und Bereiche, siehe dort),
  Standardartikel
- **Siehe auch:** [Artikel-Katalog](#artikel-katalog)

### Starter-Rezept

Ein mitgeliefertes Rezept, das man ins eigene Rezeptbuch übernehmen kann. Danach ist es ein
normales Rezept mit Herkunft „Starter“.

- **Im Code:** `starterRecipes`

### Ernährungsform

Wie sich eine Person ernährt (vegan, vegetarisch, flexibel) bzw. was ein Rezept oder eine Variante
enthält (vegan, vegetarisch, mit Fisch, mit Fleisch, unbekannt). Bei Rezepten wird sie aus den
Ernährungseigenschaften der Artikel abgeleitet, bei Sammlungen aus allem, was sie enthalten (Spec
0009).

- **Im Code:** `Diet`; am Artikel `diet` (Ernährungseigenschaft), am Mitglied `dietPreference`
- **Nicht verwenden:** Kostform, Diät

### Variante

Eine Ausprägung eines Rezepts, die Zutaten ergänzt, z. B. „mit Tofu“ oder „mit Hähnchen“. Zutaten
ohne Variante bilden die Basis. Ein Wochenplan-Eintrag kann mehrere Varianten mit eigenen
Portionen haben.

- **Im Code:** `RecipeVariant`, `recipe_variants`
- **Nicht verwenden:** Version, Abwandlung, Option

### Gerichtart

Die Einordnung eines Rezepts: Frühstück, Hauptgericht, Beilage, Dessert, Snack, Getränk.

- **Im Code:** `course`
- **Nicht verwenden:** Gang (bedeutet im Supermarkt etwas anderes), Kategorie

### Vorlauf

Eine Vorbereitung, die vor dem Kochtag nötig ist, z. B. „Kichererbsen einweichen, 12 Stunden
vorher“. Erscheint am Vortag auf der „Übersicht“.

- **Im Code:** `leadTime`

### Dauerposten

Ein Artikel, der nach einem eigenen Rhythmus von selbst auf die Einkaufsliste kommt, z. B. „Milch
montags“.

- **Im Code:** `RecurringItem`, `recurring_items`
- **Nicht verwenden:** Abo, Standardposten

### Sammlung

Ein besonderes Rezept der Art „Sammlung“, das eigene Zutaten und andere Rezepte bündelt, z. B.
„Grillabend“ = Grillkohle, Bier, Würstchen + Kartoffelsalat + Grillgemüse. Wird wie ein Rezept
eingeplant, bewertet und favorisiert; „Auf die Liste“ bringt die eigenen Zutaten und die Zutaten
der enthaltenen Rezepte, skaliert, durch den Vorratscheck. Hat keine Zubereitung, keine Varianten,
keine Küche und enthält keine Sammlungen (Spec 0009, D14, D15).

- **Im Code (vorläufig):** `Recipe` mit `kind: 'collection'`; enthaltene Rezepte siehe
  [Enthaltenes Rezept](#enthaltenes-rezept). Einen eigenen Typ `Collection` bzw. eine Tabelle
  `collections` gibt es nicht.
- **Nicht verwenden:** Vorlage (ist für Wochen reserviert), Paket, Menü
- **Abgrenzung:** Bis Spec 0009 hieß „Sammlung“ hier „ein benanntes Set von Artikeln mit
  Zusätzen“; das wurde nie gebaut und ist ersetzt. Spec 0004 nennt die Seite der Aktivitäten
  „Sammlung ‚Aktivitäten‘“; gemeint ist die Seite „Aktivitäten“, keine Sammlung in diesem Sinn.
  Eine _Reisetasche_ ist ebenfalls keine Sammlung.

### Enthaltenes Rezept

Ein Rezept in einer Sammlung, mit eigenen Portionen (leer = wie die Sammlung), gewählter Variante
(leer = Standardvariante) und Reihenfolge. Wird das Rezept gelöscht, verschwindet es aus allen
Sammlungen; das Rezept selbst bleibt unberührt, wenn man es aus einer Sammlung entfernt (Spec
0009).

- **Im Code (vorläufig):** `CollectionRecipe`, `collection_recipes`
- **Nicht verwenden:** Unterrezept, Bestandteil

### Aufgabe

Etwas, das im Haushalt zu tun ist, einmalig oder wiederkehrend, z. B. „Bad putzen“. Kann eine
optionale Uhrzeit haben, zu der am Fälligkeitstag erinnert wird (Spec 0013, D42).

- **Im Code:** `Chore`, `chores`; Uhrzeit (vorläufig) `Chore.dueTime`
- **Nicht verwenden:** To-do, Task (bezeichnet im Plan einer Spec etwas anderes), Pflicht

### Rhythmus

Die Regel, wann eine Aufgabe oder ein Dauerposten wiederkehrt: fest (z. B. wöchentlich freitags),
flexibel (z. B. etwa alle zwei Wochen nach der letzten Erledigung) oder **bei Bedarf**: nie fällig,
steht nur unter „Alle“ und wird in „Was anderes erledigt?“ gefunden (Spec 0011, D27).

- **Im Code:** `Recurrence`; „bei Bedarf“ `type: 'asNeeded'` (eigener Topf `asNeeded` in
  `choreBucket`)
- **Nicht verwenden:** Intervall, Turnus, Wiederholung; für „bei Bedarf“ auch: spontan, ohne
  Termin

### Zuständigkeit

Wer eine Aufgabe erledigt: fest eine Person, abwechselnd, egal wer, oder zu zweit.

- **Im Code:** `Assignment` mit `fixed` · `rotating` · `anyone` · `together`

### Erledigung

Ein Eintrag im Verlauf des Haushaltsplans: wer hat wann was erledigt oder übersprungen. Eine Art
„spontan“ gibt es nicht (Spec 0011, Offene Frage 6): Was ohne passende Aufgabe erledigt wurde, legt
eine Aufgabe „bei Bedarf“ an und ist eine normale Erledigung. „Erledigt von“ lässt sich im Verlauf
ändern. Die _jüngste_ Erledigung einer Aufgabe ist die zuletzt gebuchte, nicht die mit dem
jüngsten Tag. Nur bei ihr verschiebt „Erledigt von“ die Zuständigkeit, und nur wenn sie entfernt
wird, gelten nächster Termin und Zuständigkeit wieder wie davor (Spec 0011, Offene Fragen 3 und 9).

- **Im Code:** `ChoreEvent`, `chore_events` mit `kind: 'done' | 'skipped'`; der Stand davor
  (Termin, letzte Erledigung, Person) als `ChoreEvent.previous` (Spalten `prev_*`, nur vom Server
  gesetzt); gebucht um `ChoreEvent.createdAt`; jüngste Erledigung `latestBookedEvent`
- **Nicht verwenden:** Buchung, Abhakung

### Abwesenheit

Ein Zeitraum, in dem eine Person oder der ganze Haushalt nicht da ist. Sind beim Eintragen alle
Mitglieder gewählt, entsteht eine Abwesenheit des ganzen Haushalts, sonst je Person eine (D23); die
Notiz ist ihre Beschriftung (D22). Wirkt auf „Wer isst mit?“ und Benachrichtigungen (Spec 0013);
Rotation und feste Termine bleiben vorerst unberührt (Spec 0010, Offene Frage 1). Von und Bis sind
frei wählbar, auch über Monats- und Jahresgrenzen und in der Vergangenheit (Spec 0010, AC-042 bis
AC-044). Kann eine Packliste haben (Spec 0012).

- **Im Code:** `Absence`, `absences`; ganzer Haushalt = ohne `memberId`
- **Nicht verwenden:** Urlaub (ist nur ein Fall davon), Pause
- **Siehe auch:** [Abwesenheits-Streifen](#abwesenheits-streifen), [Packliste](#packliste)

### Abwesenheits-Streifen

Die Darstellung einer oder mehrerer Abwesenheiten im Kalender und auf der „Übersicht“: ein Streifen
mit Notiz (ohne Notiz „abwesend“), Ende („bis Mo 4.1.“) und Avataren. Abwesenheiten mit gleichem
Von, Bis und gleicher Notiz bilden einen Streifen. Eine Person: zart in ihrer Farbe; mehrere oder
der ganze Haushalt: neutral (Spec 0010). Ein Tipp öffnet ab Spec 0012 die Urlaubsseite, vorher
„Abwesenheit bearbeiten“; mit Packliste trägt er ein Taschen-Symbol.

- **Im Code (vorläufig):** `AbsenceStripe`, abgeleitet aus `Absence`, nicht gespeichert
- **Nicht verwenden:** Urlaubsstreifen, Balken
- **Abgrenzung:** Die _Urlaubsseite_ ist die Seite einer Abwesenheit mit ihrer Packliste (Spec
  0012); der Name steht im Konzept und gilt für jede Abwesenheit, nicht nur für Urlaub.

### Reisetasche

Eine wiederverwendbare Vorlage für Packlisten, z. B. „Strand“ oder „Kulturbeutel“: Name (eindeutig
je Haushalt), optional „für“ ein Mitglied, Packstücke mit Anzahl. Liegt unter „Verwalten“ →
„Reisetaschen“. Eine Änderung wirkt nie auf bestehende Packlisten (Spec 0012, D35).

- **Im Code (vorläufig):** `PackingBag`, `packing_bags`
- **Nicht verwenden:** Packvorlage, Koffer, Sammlung
- **Abgrenzung:** Die _Packliste_ ist die Kopie für eine Abwesenheit.

### Packliste

Die Liste zum Abhaken einer Abwesenheit: eine Kopie der angehängten Reisetaschen, gruppiert nach
Tasche, auf der Urlaubsseite. Packen geht auch ohne Netz (Laden-Warteschlange, „Abhaken gewinnt“);
„Für die Rückreise zurücksetzen“ nimmt alle Haken weg. Wird mit ihrer Abwesenheit gelöscht und zieht
mit, wenn das Bearbeiten die Abwesenheit ersetzt (Spec 0012, AC-039; Spec 0010, REQ-010).

- **Im Code (vorläufig):** kein eigener Datensatz; alle `packing_items` einer Abwesenheit
- **Nicht verwenden:** Checkliste, Kofferliste

### Packstück

Eine Zeile einer Reisetasche oder Packliste: Name als Freitext und optionale Anzahl, fest („2×“)
oder je Tag („1 je Tag“, gerechnet mit der Dauer der Abwesenheit, erster und letzter Tag
eingeschlossen). In der Packliste zusätzlich „gepackt“ (Spec 0012, D32).

- **Im Code (vorläufig):** in der Reisetasche `PackingBagItem`, `packing_bag_items`; in der
  Packliste `PackingItem`, `packing_items`
- **Nicht verwenden:** Artikel, Posten, Gegenstand
- **Abgrenzung:** Packstücke sind keine Artikel und kommen nie auf die Einkaufsliste.

### Vorschlag

Eine Änderung, die der Assistent anbietet und die erst nach dem Annehmen ausgeführt wird. Ein
Vorschlag kann aus mehreren Teilen bestehen, die sich einzeln abwählen lassen.

- **Im Code:** `Proposal`, `ai_proposals`
- **Nicht verwenden:** Empfehlung, Aktion

### Vorschlagszeile

Ein Vorschlag, der als gestrichelte Zeile direkt in einer Liste oder im Wochenplan erscheint. Im
Konzept auch „Geisterzeile“ genannt.

- **Im Code:** `GhostRow`

### Haushaltsgedächtnis

Was der Assistent über den Haushalt weiß, z. B. „unter der Woche höchstens 30 Minuten“. Sichtbar,
änderbar und löschbar.

- **Im Code:** `HouseholdMemory`, `household_memory`

### Einladung

Die Freigabe einer Google-Adresse für einen Haushalt. Nur eingeladene Adressen können ein Konto
anlegen; Mitglied wird die Person erst, wenn sie die Einladung annimmt (auch bei der ersten
Anmeldung). Die Gesamtheit der offenen
Einladungen ist die **Einladungsliste** (ADR-0003: „Allowlist“).

- **Im Code:** `Invitation`, `household_invitations`
- **Nicht verwenden:** Whitelist, Freischaltung

### Testkonto

Ein Konto mit E-Mail und Passwort, das es nur in der lokalen Entwicklungsumgebung gibt, damit
automatische Tests ohne Google anmelden können. In Produktion abgeschaltet.

- **Im Code:** `devLogin`, `TEST_ACCOUNTS`

### Lokaler Speicher

Die Kopie aller Daten der eigenen Haushalte auf dem Gerät. Die Oberfläche liest nur daraus; der
[Sync](#sync) hält ihn aktuell. Wegwerfbar: Bei einer neuen Speicher-Version wird er neu geladen.

- **Im Code:** `SyncCache` (`packages/core/src/sync-delta.ts`), `cache`
- **Nicht verwenden:** Offline-Datenbank, Store (für den Gerätespeicher)

### Laden-Warteschlange

Die auf dem Gerät gespeicherte Reihe von Aktionen, die offline gemacht wurden: abhaken, „nicht
da“, Posten hinzufügen, Bereich zuordnen (ADR-0008, Nachtrag) und ab Spec 0012 Packstücke packen
und zurücknehmen, auch „Alles einpacken“ und „Für die Rückreise zurücksetzen“ (eigener Nachtrag zu
ADR-0008). Wird mit Netz der Reihe nach nachgereicht.

- **Im Code:** `StoreQueueEntry` (`packages/core/src/store-queue.ts`), auf dem Gerät unter dem
  Schlüssel `queue`
- **Nicht verwenden:** Abhak-Warteschlange (alter Name), Outbox

### KI-Kontingent

Die Höchstmenge an KI-Nutzung je Mitglied und Tag, die der Server durchsetzt.

- **Im Code:** `ai_usage`, `consume_ai_quota` (Grenze je Art in der Funktion)

### Überlagerung

Was die App anzeigt, solange Änderungen noch nicht vom Server bestätigt sind: die Serverzeilen
plus Laden-Warteschlange plus ausstehende Änderungssätze (ADR-0011). Lehnt der Server ab, fällt
die Änderung aus der Überlagerung und die Anzeige springt zurück.

- **Im Code:** `Changeset` (`packages/core/src/sync-overlay.ts`), `visibleTables`
- **Nicht verwenden:** Optimistic Update (außer in technischen Docs)

### Aktivität

Eine Unternehmung, die der Haushalt plant und nachhält, z. B. Eislaufen oder Bouldern. Hat Name,
Beschreibung, Foto und optional einen Ort; steht im Wochenplan in einer Tageszeit, mit Zusatz in
Klammern, z. B. „Eislaufen (Hohenschönhausen)“. Alle Aktivitäten stehen auf der Seite
„Aktivitäten“ (ab Spec 0010 im Kalender-Bereich unter `/kalender/aktivitaeten`, erreichbar über ▲
im Kalender und über „Verwalten“; Spec 0010, REQ-008).

- **Im Code:** `Activity`, `activities`; Planeintrag `kind: 'activity'`
- **Nicht verwenden:** Event, Termin, Freizeit (als Begriff für den Eintrag); „Sammlung
  ‚Aktivitäten‘“ (so heißt die Seite in Spec 0004)

### Verwalten

Die Gruppe der Seiten, die den Haushalt verwalten, in drei Blöcken: Planen (Aktivitäten,
Reisetaschen, Abwesenheiten), Einkaufen (Artikel, Märkte & Bereiche), Haushalt (Haushalt &
Mitglieder, Feedback). Am Desktop immer sichtbar in der Seitenleiste, auf dem Handy hinter ⊞ im Kopf
jeder Tab-Startseite (Spec 0005, D2, D30).

- **Im Code (vorläufig):** Adresse `/verwalten` (Handy-Seite)
- **Nicht verwenden:** Mehr, Admin, Stammdaten (für die Gruppe)
- **Abgrenzung:** Persönliches steht in den _Einstellungen_.

### Einstellungen

Die persönlichen Einstellungen hinter dem Avatar: Profil, Darstellung, ab Spec 0013
Benachrichtigungen, Abmelden. Alles, was den Haushalt betrifft, steht unter „Verwalten“ (Spec
0005, D28).

- **Im Code:** Adresse `/einstellungen`
- **Nicht verwenden:** Profil (für die ganze Seite), Optionen
- **Abgrenzung:** Haushalte, Mitglieder, Einladungen, Märkte, Feedback und Abwesenheiten gehören zu
  _Verwalten_.

### Sammel-Fenster

Die 2 Sekunden nach dem letzten Tipp beim Abhaken (D3): Ein Haken streicht durch und lässt die Zeile
stehen, nochmal tippen nimmt ihn ohne Hinweis zurück; erst wenn das Fenster abläuft, gleiten alle
abgehakten Zeilen gemeinsam weg. Wann gespeichert wird, legt der Bildschirm fest: Einkaufsposten
und Packstücke sofort beim Tipp (Spec 0006; Spec 0012, Offene Frage 3), Aufgaben erst beim Ablauf
(Spec 0011); Spec 0005, REQ-005.

- **Im Code:** `useCheckWindow` mit `RowTransition` in `packages/ui`; die 2 Sekunden stehen an
  genau einer Stelle, `CHECK_WINDOW_MS`
- **Nicht verwenden:** Verzögerung, Debounce (außer im Code), Rückgängig-Fenster
- **Abgrenzung:** Im Vorratscheck ist der Haken eine Auswahl, kein Abhaken.

### Tagesüberblick

Die eine Benachrichtigung am Morgen mit dem eigenen Teil des Tages: Essen (Rezepte, Sammlungen,
Restaurants), Aktivitäten, fällige und überfällige Aufgaben, Vorbereitung für morgen; je Person
Uhrzeit (Standard 7:30) und Teile wählbar, am Anfang aus. Kommt nur, wenn es etwas gibt (Spec 0013,
D37).

- **Im Code (vorläufig):** Art `dailySummary` in den Benachrichtigungs-Einstellungen
- **Nicht verwenden:** Tageszusammenfassung (Feature-Konzept F1), Morgen-Nachricht, Digest

### Benachrichtigungs-Einstellungen

Was eine Person wann bekommt: je Art an/aus, Uhrzeiten, beim Tagesüberblick die Teile. Gilt je
Mitglied und Haushalt auf allen Geräten der Person; je Gerät gibt es nur „an“ oder „aus“ (Spec
0013, D38). Nur die Person selbst liest und schreibt sie; synchronisiert.

- **Im Code (vorläufig):** `NotificationSettings`, `notification_settings`
- **Nicht verwenden:** Push-Einstellungen, Profil-Einstellungen

### Push-Abo

Die Anmeldung eines Geräts bzw. Browsers für Web Push: Push-Adresse, Schlüssel, Gerätename,
an/aus, letzter Erfolg. Gehört einer Person, nicht einem Haushalt, und wird nicht synchronisiert
(Ausnahme von Regel 5, Spec 0013). In der Oberfläche „Deine Geräte“.

- **Im Code (vorläufig):** `PushSubscription`, `push_subscriptions`
- **Nicht verwenden:** Abo (allein, das meint nichts), Gerät (für den Datensatz), Token

### Zustell-Protokoll

Ein Eintrag je zugestellter Nachricht und Gerät mit eindeutigem Schlüssel, Zeitpunkt und Status;
verhindert doppelte Nachrichten. 30 Tage aufbewahrt, nur für den Zeitplaner, nie aus der App
lesbar (Spec 0013).

- **Im Code (vorläufig):** `notification_deliveries`
- **Nicht verwenden:** Log, Versandliste

### Zeitplaner

Die Datenbankfunktion, die `pg_cron` alle 5 Minuten startet („Takt“): Sie findet fällige
Nachrichten in der Zeitzone des Haushalts, schreibt sie ins Zustell-Protokoll und gibt sie per
`pg_net` an die Edge Function `push-send`, die nur zustellt und keinen Datenbankzugang hat (Spec
0013, D40).

- **Im Code (vorläufig):** Datenbankfunktion mit `pg_cron`-Job; Edge Function `push-send`
- **Nicht verwenden:** Cronjob (für das Ganze), Scheduler (in der Oberfläche)
