# Glossar

Fachbegriffe dieses Projekts. Jede Spec und jeder Bezeichner im Code richtet sich danach. Neue
Begriffe kommen mit dem `glossary`-Skill hinzu.

> Die Code-Bezeichner sind **vorläufig**, bis die Spec, die den Begriff zuerst umsetzt, sie
> bestätigt. Danach gilt der Eintrag hier.

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
eindeutig je Haushalt, optional mit Bereich. Entsteht automatisch bei der ersten Eingabe eines
neuen Namens.

- **Im Code:** `Article`, `articles`
- **Nicht verwenden:** Produkt, Item, Ware, Zutat (für den Katalogeintrag)
- **Abgrenzung:** Eine _Zutat_ ist ein Artikel im Kontext eines Rezepts (→ Rezeptzutat).

### Rezept

Eine Anleitung zum Kochen mit Titel, Portionen, Zutaten und Schritten.

- **Im Code:** `Recipe`, `recipes`

### Rezeptzutat

Ein Artikel in einem Rezept, mit Rezeptangabe und Einkaufsregel. In der Oberfläche heißt sie
einfach „Zutat“.

- **Im Code:** `RecipeIngredient`, `recipe_ingredients`
- **Nicht verwenden:** Ingredient (allein), Zutatenzeile

### Rezeptangabe

Die Menge, die zum Kochen gebraucht wird, z. B. „200 ml“ oder „1 Prise“. Freitext. Ist sie als
Zahl + Einheit erkennbar, wird sie beim Umrechnen der Portionen mitskaliert.

- **Im Code:** `recipeAmount`
- **Abgrenzung:** Nicht die Menge auf der Einkaufsliste (→ Einkaufsregel).

### Einkaufsregel

Legt fest, wie eine Rezeptzutat auf die Einkaufsliste kommt: **Anzahl** (Standard 1×),
**Rezeptmenge** oder **nicht übernehmen**.

- **Im Code:** `ShoppingRule` mit `count` · `recipeAmount` · `skip`

### Wochenplan

Die Zuordnung von Rezepten oder Freitext zu Tagen und Mahlzeiten.

- **Im Code:** `MealPlan`, Einträge `MealPlanEntry`, `meal_plan_entries`
- **Nicht verwenden:** Speiseplan, Menüplan

### Mahlzeit

Ein konfigurierbarer Platz im Tag des Wochenplans, z. B. Mittag oder Abend.

- **Im Code:** `MealSlot`, `meal_slots`

### Einkaufsliste

Eine Liste von Einkaufsposten. Ein Haushalt kann mehrere haben, eine davon ist die
**Standardliste**, in die der Wochenplan schreibt.

- **Im Code:** `ShoppingList`, `shopping_lists`, `isDefault`

### Einkaufsposten

Ein Artikel auf einer Einkaufsliste, eine Zeile je Artikel. Setzt sich aus **Beiträgen**
zusammen (je Rezept im Wochenplan und manuell), die beim Anzeigen zusammengerechnet werden.

- **Im Code:** `ShoppingItem`, `shopping_items`; Beiträge `ShoppingContribution`
- **Nicht verwenden:** Eintrag, Position

### Zusatz

Freitext zu einem Beitrag eines Einkaufspostens, z. B. „laktosefrei“ oder „Gouda oder
Emmentaler“. In der Liste steht er in Klammern hinter dem Artikel. Bringen mehrere Beiträge
verschiedene Zusätze mit, stehen sie nebeneinander.

- **Im Code:** `note` (am `ShoppingContribution`)
- **Nicht verwenden:** Notiz (die gehört zum Rezept), Kommentar

### Markt

Ein Supermarkt oder Laden, in dem der Haushalt einkauft.

- **Im Code:** `Store`, `stores`
- **Nicht verwenden:** Geschäft, Filiale, Shop

### Bereich

Eine Abteilung im Laden, z. B. „Obst & Gemüse“ oder „Kühlung“. Gehört dem Haushalt, nicht dem
Markt.

- **Im Code:** `Area`, `areas`
- **Nicht verwenden:** Kategorie, Abteilung, Gang, Regal

### Laufreihenfolge

Die Reihenfolge der Bereiche in einem bestimmten Markt. Jeder Markt hat seine eigene und kann
Bereiche ausblenden.

- **Im Code:** `StoreArea` mit `sortKey`, `store_areas`

### Einkaufsmodus

Die Ansicht der Einkaufsliste im Laden: sortiert nach der Laufreihenfolge des gewählten Markts,
optimiert zum Abhaken mit einer Hand.

- **Im Code:** `ShoppingMode`

### Sync

Der automatische Abgleich zwischen der lokalen Datenbank eines Geräts und dem Server.

- **In der Oberfläche:** „wird synchronisiert“, „alles gespeichert“
- **Siehe:** `docs/architecture/sync.md`

### Synonym

Ein weiterer Name für denselben Artikel, z. B. „Karotten“ für „Möhren“. Name und Synonyme sind je
Haushalt eindeutig. Suche und Autovervollständigung treffen beide.

- **Im Code:** `ArticleName` mit `isPrimary`, `article_names`
- **Nicht verwenden:** Alias (außer im Code-Kommentar), Schreibweise

### Vorrat

Ausdrückliche Markierung an einem Artikel, der meist im Haus ist (Gewürze, Öl, Mehl). Im
Vorratscheck sind Vorrat-Posten abgewählt. Die App setzt die Markierung nie von selbst.

- **Im Code:** `isPantry`
- **Abgrenzung:** kein Bestand mit Mengen. Die Einkaufsregel „nicht übernehmen“ ist etwas anderes:
  Sie blendet eine Zutat ganz aus.

### Vorratscheck

Der Schritt vor dem Übernehmen auf eine Einkaufsliste: Alle Posten werden gezeigt, normale sind
angewählt, Vorrat-Posten abgewählt. Was abgewählt wird, kommt nicht auf die Liste.

- **Im Code:** `PantryCheck`

### Starter-Katalog

Rund 300 gängige Artikel mit Bereich, Ernährungseigenschaft, Vorrat und Synonymen, die fest in der
App liegen. Ein Artikel des Haushalts entsteht erst bei der ersten Nutzung.

- **Im Code:** `starterCatalog`
- **Nicht verwenden:** Stammdaten, Standardartikel

### Starter-Rezept

Ein mitgeliefertes Rezept, das man ins eigene Rezeptbuch übernehmen kann. Danach ist es ein
normales Rezept mit Herkunft „Starter“.

- **Im Code:** `starterRecipes`

### Ernährungsform

Wie sich eine Person ernährt (vegan, vegetarisch, flexibel) bzw. was ein Rezept oder eine Variante
enthält (vegan, vegetarisch, mit Fisch, mit Fleisch, unbekannt). Bei Rezepten wird sie aus den
Ernährungseigenschaften der Artikel abgeleitet.

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
vorher“. Erscheint am Vortag auf „Heute“.

- **Im Code:** `leadTime`

### Dauerposten

Ein Artikel, der nach einem eigenen Rhythmus von selbst auf die Einkaufsliste kommt, z. B. „Milch
montags“.

- **Im Code:** `RecurringItem`, `recurring_items`
- **Nicht verwenden:** Abo, Standardposten

### Sammlung

Ein benanntes Set von Artikeln mit Zusätzen, das mit einem Tipp auf eine Einkaufsliste geht, z. B.
„Grillabend“.

- **Im Code:** `Collection`, `collections`
- **Nicht verwenden:** Vorlage (ist für Wochen reserviert), Paket

### Aufgabe

Etwas, das im Haushalt zu tun ist, einmalig oder wiederkehrend, z. B. „Bad putzen“.

- **Im Code:** `Chore`, `chores`
- **Nicht verwenden:** To-do, Task (bezeichnet im Plan einer Spec etwas anderes), Pflicht

### Rhythmus

Die Regel, wann eine Aufgabe oder ein Dauerposten wiederkehrt: fest (z. B. wöchentlich freitags)
oder flexibel (z. B. etwa alle zwei Wochen nach der letzten Erledigung).

- **Im Code:** `Recurrence`
- **Nicht verwenden:** Intervall, Turnus, Wiederholung

### Zuständigkeit

Wer eine Aufgabe erledigt: fest eine Person, abwechselnd, egal wer, oder zu zweit.

- **Im Code:** `Assignment` mit `fixed` · `rotating` · `anyone` · `together`

### Erledigung

Ein Eintrag im Verlauf des Haushaltsplans: wer hat wann was erledigt, übersprungen oder spontan
gemacht.

- **Im Code:** `ChoreEvent`, `chore_events`

### Abwesenheit

Ein Zeitraum, in dem eine Person oder der ganze Haushalt nicht da ist. Wirkt auf „Wer isst mit?“,
Rotation, Termine und Benachrichtigungen.

- **Im Code:** `Absence`, `absences`
- **Nicht verwenden:** Urlaub (ist nur ein Fall davon), Pause

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
