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

Alles, was man kaufen kann, Lebensmittel genauso wie Haushaltswaren. Im Kern ein Name, eindeutig
je Haushalt, mit Synonymen, optional Bereich, Vorrat, Ernährungseigenschaft und
Standard-Einkaufsregel. Auf der Liste entsteht er bei der ersten Eingabe eines neuen Namens; im
Rezept wählt man ihn per „Suchen oder anlegen“ und legt einen neuen bewusst an (Spec 0007). Jede
Rezeptzutat verweist auf einen Artikel. Gelöscht wird nur ein unbenutzter Artikel, sonst führt man
ihn mit einem anderen zusammen.

- **Im Code:** `Article`, `articles`; Löschen nur über `delete_article`, Zusammenführen über
  `merge_articles`
- **Nicht verwenden:** Produkt, Item, Ware, Zutat (für den Katalogeintrag)
- **Abgrenzung:** Eine _Zutat_ ist ein Artikel im Kontext eines Rezepts (→ Rezeptzutat). Ein
  _Packstück_ ist kein Artikel (Spec 0012).
- **Siehe auch:** [Artikel-Katalog](#artikel-katalog), [Neu aus Rezepten](#neu-aus-rezepten)

### Artikel-Katalog

Alles, was „Suchen oder anlegen“ bei einer Zutat durchsucht: die Artikel des Haushalts und der
Starter-Katalog. Wählt man einen Eintrag des Starter-Katalogs, entsteht dabei der Haushalts-Artikel
mit dessen Angaben (Spec 0007). Gepflegt wird er auf der Seite „Artikel“ unter „Verwalten“.

- **Im Code:** kein eigener Typ; die Suche ist `searchArticleCatalog` (`packages/core`) über
  `articles` und `starterCatalogEntries`
- **Nicht verwenden:** Produktkatalog, Stammdaten (meint mehr, siehe dort)
- **Abgrenzung:** Der _Starter-Katalog_ ist nur der mitgelieferte Teil.

### Neu aus Rezepten

Markierung an einem Artikel, der für eine Zutat ohne Wahl eines Menschen neu entstanden ist, weil
kein Artikel des Haushalts und kein Eintrag des Starter-Katalogs zum Namen passte: bei Vorschlägen
des Assistenten und in den Beispieldaten (Spec 0007, E1; es gibt keine Migration). Starter-Rezepte
gibt es nicht mehr (Spec 0023, REQ-011). Die Seite „Artikel“ zeigt diese zum Prüfen und
Zusammenführen. Die Markierung fällt weg, sobald jemand den Artikel speichert, bestätigt („Passt
so“), zusammenführt oder löscht (Spec 0007, Offene Frage 1).

- **Im Code:** `Article.needsReview` (`articles.needs_review`); die Zuordnungsregel ist
  `resolveIngredientArticle` in `packages/core`
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

„Zuletzt gekocht“ und wie oft gekocht rechnet das Gerät aus dem Kalender: Jeder Eintrag mit Tag
bis einschließlich heute ohne „nicht gekocht“ zählt für sein Rezept, bei einer Sammlung auch für
jedes Rezept, das sie enthält; die gespeicherten Werte sind die Vorgeschichte (Spec 0009, E10).

- **Im Code:** `Recipe`, `recipes`; Art `RecipeKind` (`Recipe.kind: 'recipe' | 'collection'`,
  `recipes.kind`); gekocht `lastCookedOn`, `cookedCount`, aus dem Kalender `cookingHistory`,
  `withCookingHistory`
- **Siehe auch:** [Sammlung](#sammlung), [Küche](#küche), [Schlagwort](#schlagwort)

### Küche

Die Länderküche oder Stilrichtung eines Rezepts oder Restaurants, z. B. „Italienisch“. Höchstens
eine je Rezept, Freitext, gewählt per „Suchen oder anlegen“ über die Werte des Haushalts. Der
Filter fasst Schreibweisen zusammen, die sich nur in Groß/Klein oder Leerzeichen am Rand
unterscheiden (Spec 0008). Gezeigt wird die häufigste Schreibweise, bei Gleichstand die erste
nach A–Z.

- **Im Code:** `cuisine` (an `Recipe` und `Restaurant`); Schlüssel zum Zusammenfassen
  `cuisineKey` (nur `trim` und Kleinschreibung, nicht `normalizeText`), Filterwerte mit Anzahl
  `cuisineFacets`
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
  Entscheidung 8); `articleId` ist Pflicht, einen eigenen Namen hat die Zutat nicht (Spec 0007,
  E2). Der Trigger `recipes_check_ingredients` lehnt Zutaten ohne Artikel des eigenen Haushalts ab
- **Nicht verwenden:** Ingredient (allein), Zutatenzeile
- **Siehe auch:** [Hinweis](#hinweis), [Zusatz](#zusatz)

### Hinweis

Freitext an einer Rezeptzutat nur fürs Kochen, z. B. „fein gehackt“ oder „zimmerwarm“. Steht im
Rezept hinter der Zutat („2 Zwiebeln · fein gehackt“) und geht nie auf die Einkaufsliste (Spec
0007).

- **Im Code:** `RecipeIngredient.prepNote` (höchstens 200 Zeichen)
- **Nicht verwenden:** Notiz (die gehört zu Rezept, Restaurant oder Reise), Kommentar,
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

Bei „Rezeptmenge“ wird die Menge auf die geplanten Portionen umgerechnet und für Liste und
Vorratscheck auf eine kaufbare Menge **aufgerundet** (Spec 0009, REQ-005): zählbare Einheiten
(Glas, Dose, Becher, Packung, Stück, Bund, Sack, Kasten, …) und Mengen ohne Einheit auf ganze
Stück, g und ml auf ganze Zahlen, kg und l auf eine Nachkommastelle („0,75 Glas“ → „1 Glas“,
„56,25 g“ → „57 g“). EL und TL behalten zwei Nachkommastellen, Prise, Msp. und Handvoll bleiben,
wie sie sind. Das Rezept selbst zeigt die genaue umgerechnete Menge.

- **Im Code:** `ShoppingRule` mit `count` · `recipeAmount` · `skip`; Aufrunden `buyableQty`
- **Siehe auch:** [Standard-Einkaufsregel](#standard-einkaufsregel)

### Standard-Einkaufsregel

Die Einkaufsregel, die ein Artikel für eine neue Rezeptzutat vorschlägt. Sie steht am Artikel, ist
in „Artikel bearbeiten“ änderbar, und jede Wahl in einem Rezept setzt sie neu (Spec 0007, Offene
Frage 2; Vision: „zuletzt gewählte Regel wird vorgeschlagen“).

- **Im Code:** `Article.defaultShoppingRule` (`articles.default_shopping_rule`); nicht gesetzt
  (`null`) gilt: Vorrat → Anzahl, Rezeptangabe mit Einheit → Rezeptmenge, sonst Anzahl
- **Abgrenzung:** Sie gilt nur für neue Zutaten; bestehende Zutaten behalten ihre Einkaufsregel.

### Wochenplan

Die Zuordnung von Rezepten oder Freitext zu Tagen und Mahlzeiten.

- **Im Code:** `MealPlan`, Einträge `MealPlanEntry`, `meal_plan_entries`
- **Nicht verwenden:** Speiseplan, Menüplan
- **Abgrenzung:** Der _Kalender_ ist der Tab, der den Wochenplan in Woche, Monat und Jahr zeigt;
  „Wochenplan“ bleibt das Wort für das, was in einer Woche geplant ist (Spec 0010).

### Kalender

Der Tab, der bis Spec 0010 „Plan“ hieß. Zeigt Planeinträge, Reisen und Aufgaben in den
Ansichten Woche, Monat und Jahr (D16).

- **Im Code:** Adresse `/kalender`, alte Adressen unter `/plan` leiten dorthin (Spec 0010); kein
  eigener Datentyp, die Einträge bleiben `MealPlanEntry`
- **Nicht verwenden:** Plan (für den Tab, ab Spec 0010), Planer
- **Siehe auch:** [Haushalt-Zeile](#haushalt-zeile), [Reise-Streifen](#reise-streifen)

### Übersicht

Der erste Tab und die Startseite der App, bis 21.11.2026 „Heute“. Zeigt einen Tag mit allem, was
geplant und zu tun ist; ohne Auswahl ist es der heutige Tag. Die [Tagesleiste](#tagesleiste) oben
wählt den Tag, darunter stehen die [Vorbereitungszeilen](#vorbereitungszeile) und „Geplant“ (Spec
0011, Spec 0020). Umbenannt, weil die Seite nicht mehr nur heute zeigt (Spec 0005, AC-061).

- **Im Code:** Adresse `/`, Route `index`, Test-IDs `tab-index` und `today-*` und der Ordner
  `features/today` bleiben (kein Umbenennen im Code nötig)
- **Nicht verwenden:** Heute (für den Tab oder die Seite), Start, Dashboard, Home
- **Abgrenzung:** „Heute“ bleibt das Wort für den heutigen Tag: der Knopf „Heute“ führt in der
  Übersicht und im Kalender zum heutigen Tag zurück; „Heute geplant“ ist ein Abschnitt. Das
  _Layout „Übersicht“_ (Spec 0005) ist das Desktop-Layout dieser Seite, kein zweiter Begriff. Der
  _Tagesüberblick_ ist eine Benachrichtigung (Spec 0013).
- **Siehe auch:** [Kalender](#kalender), [Tagesüberblick](#tagesüberblick)

### Tagesleiste

Die Leiste oben auf der „Übersicht“ mit sieben Tagen ab gestern (gestern bis heute + 5); ‹ › verschieben
sie und den gewählten Tag um sieben Tage (Spec 0020, REQ-001).

- **Im Code:** `DayStrip`; Test-IDs bleiben vorerst
- **Nicht verwenden:** Wochenleiste (alter Name, Mo–So), Tagesliste (so heißt die Liste am Handy im
  Monat, Spec 0021)
- **Abgrenzung:** Sie zeigt nicht die Kalenderwoche; der _Abschnitt_ ist ihr Zeitraum.

### Abschnitt (Tagesleiste)

Der Zeitraum, den die [Tagesleiste](#tagesleiste) gerade zeigt: sieben aufeinanderfolgende Tage, am
Anfang gestern bis heute + 5 („heutiger Abschnitt“). Die Leiste springt um ganze Abschnitte (Spec
0020).

- **Im Code:** kein eigener Typ
- **Nicht verwenden:** Woche (für diesen Zeitraum), Seite
- **Abgrenzung:** Nicht der _Bearbeitungsmodus_ der Rezeptseite und nicht die Gruppen der Seiten „Heute
  geplant“, „Noch offen“ usw.

### Kochbeginn

Die feste Uhrzeit, ab der eine Tageszeit „losgeht“: Vormittag 8, Mittag 11, Abend 17 Uhr, sonst 8 Uhr.
Dient dazu, den spätesten Start einer Vorbereitung auszurechnen, und ist zugleich der
Erinnerungsvorschlag aus Spec 0017. Wird nicht gespeichert und nicht eingestellt (Spec 0020, E8).

- **Im Code:** `slotStartTime` (`packages/core`, aus `reminder.ts`), in SQL gespiegelt als
  `private.slot_start_time`
- **Nicht verwenden:** Essenszeit, Startzeit der Tageszeit
- **Abgrenzung:** Die _Uhrzeit (Eintrag)_ gehört einem einzelnen Eintrag und wird eingegeben.

### Vorbereitungszeile

Eine Zeile unter der [Tagesleiste](#tagesleiste), die an dem Tag steht, an dem man spätestens mit
einer Vorbereitung anfangen muss: Tag des Eintrags + [Kochbeginn](#kochbeginn) − [Vorlauf](#vorlauf).
Beispiel: „Heute bis ca. 23 Uhr: Kichererbsen einweichen · Hummus (morgen Mittag)“. Für den ganzen
Haushalt; ersetzt „Für morgen“ (Spec 0020, REQ-006).

- **Im Code:** `prepLines` (`packages/core`)
- **Nicht verwenden:** Vorbereitung für morgen, Vortagszeile

### Wie war's?

Der Abschnitt der Übersicht, der am heutigen Tag die unbewerteten Rezepte, Sammlungen,
Restaurants und Aktivitäten der letzten drei Tage abfragt, in halben Sternen, mit „Nicht gemacht“
je Zeile (Spec 0011, REQ-003). Gefragt wird nur, wer unter „Wer isst mit?“ stand.

- **Im Code:** `TodayRecap` (App), Auswahl `recapItems` (`packages/core`); Test-IDs `today-recap`,
  `recap-<entryId>-stars`, `recap-<entryId>-not-done`
- **Nicht verwenden:** Rückblick, Feedback (bezeichnet die Rückmeldung an die Entwickler)

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
[Webseite](#webseite), Foto, Küche, Preisniveau, Schlagworte und eine Notiz für den Haushalt. Bewertung und Favorit gelten je
Mitglied. Wird meist aus einem geteilten Link von Google Maps oder Apple Karten angelegt und kann
statt eines Rezepts im Wochenplan stehen.

- **Im Code:** `Restaurant`, `restaurants` (Foto `photoPath`/`photo_path`, Spec 0024); im Wochenplan
  `MealPlanEntry` mit `kind: 'restaurant'` und `restaurantId`
- **Nicht verwenden:** Lokal, Location, Gaststätte, Ort (für das Restaurant selbst)

### Besuch

Ein Restaurant, das an einem Tag bis heute im Wochenplan stand. Besuche werden nicht eigens
gespeichert, sondern aus den Einträgen des Wochenplans abgeleitet („Zuletzt: vor 12 Tagen · 3
Besuche“).

- **Im Code:** abgeleitet mit `restaurantVisits` aus `MealPlanEntry` mit `kind: 'restaurant'`
- **Nicht verwenden:** Termin, Check-in
- **Abgrenzung:** Eine _Reservierung_ ist die Uhrzeit an einem Restaurant-Eintrag (Spec 0021), kein
  Besuch und kein Ersatz dafür.

### Reservierung

Die Uhrzeit, für die an einem Restaurant-Eintrag reserviert ist; in der Oberfläche steht dafür das
Feld „Uhrzeit (optional)“ mit dem Hinweis „Die Uhrzeit, für die ihr reserviert habt.“. Reserviert
wird weiter in den Karten-Apps; die App hält nur die [Uhrzeit (Eintrag)](#uhrzeit-eintrag) fest. Eine
eigene Reservierungs-Erinnerung gibt es seit Spec 0021 nicht mehr: Wer die Uhrzeit setzt, bekommt die
[Erinnerung](#erinnerung) an dem Eintrag.

- **Im Code:** kein eigener Bezeichner mehr; `meal_plan_entries.reserved_at` heißt seit Spec 0021
  `starts_at` (siehe Uhrzeit (Eintrag)); `remind_minutes_before`, `REMIND_CHOICES` und
  `reservation_reminders_enabled` entfallen
- **Nicht verwenden:** Buchung, Termin
- **Abgrenzung:** Ein _Besuch_ wird aus dem Wochenplan abgeleitet und hat keine Uhrzeit.

### Uhrzeit (Eintrag)

Die optionale Uhrzeit eines Restaurant- oder Aktivitäts-Eintrags im Kalender, in 5-Minuten-Schritten,
Ortszeit des Haushalts: bei Restaurants die Reservierung, bei Aktivitäten „Wann es losgeht.“.
Angezeigt als „Eislaufen (Hohenschönhausen) · 10:30“; Verschieben und Tageszeit-Wechsel lassen sie
stehen. Andere Arten haben keine Uhrzeit (Spec 0021, REQ-013).

- **Im Code:** `MealPlanEntry.startsAt` (`meal_plan_entries.starts_at`, `TimeOfDay`; nur bei
  `kind` `restaurant` oder `activity`); vorher `reserved_at`
- **Nicht verwenden:** Termin, Reservierungszeit (als Feldname)
- **Abgrenzung:** Die _Uhrzeit (Aufgabe)_ gehört einer Aufgabe. Die _Tageszeit_ ist der Platz im Tag
  (Vormittag, Mittag, Abend), keine Uhrzeit.

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
  `label`; `recurring` entfällt, Spec 0025)
- **Nicht verwenden:** Quelle (in der Oberfläche), Ursprung

### Zusatz

Freitext zu einem Beitrag eines Einkaufspostens oder zu einem Planeintrag, z. B. „laktosefrei“ oder
„Gouda oder Emmentaler“. In der Liste steht er in Klammern hinter dem Artikel; bringen mehrere
Beiträge verschiedene Zusätze mit, stehen sie nebeneinander. Seit Spec 0021 hat **jede Art** von
Planeintrag einen Zusatz (höchstens 120 Zeichen) und zeigt ihn überall, wo der Name steht: „Lasagne
(doppelte Menge)“, „Eislaufen (Hohenschönhausen)“. In der Herkunft der Liste steht er nicht.

- **Im Code:** `note` (am `ShoppingContribution` und am `MealPlanEntry`); an der Rezeptzutat
  `shoppingNote`
- **Nicht verwenden:** Notiz (die gehört zu Rezept, Restaurant oder Reise), Kommentar
- **Abgrenzung:** Der _Hinweis_ an einer Zutat ist nur fürs Kochen und geht nicht auf die Liste.

### Notiz

Freitext des Haushalts an einem Rezept („Notizen“), einem Restaurant („Notiz“, z. B.
„Trüffelpasta!“) oder einer Reise. An der Reise ist sie die Beschriftung des Streifens und der Titel des Fensters,
z. B. „Urlaub Mallorca“ (Spec 0010, D22). Optional; gilt für alle Mitglieder, anders als Bewertung
und Favorit.

- **Im Code:** `notes` an `Recipe` und `Restaurant`, `note` an `Trip`
- **Nicht verwenden:** Kommentar, Anmerkung, Beschreibung
- **Abgrenzung:** Der _Zusatz_ steht an einem Beitrag der Einkaufsliste oder einem Planeintrag, der
  _Hinweis_ an einer Rezeptzutat fürs Kochen; beide heißen nie „Notiz“. Die Beschreibung eines
  Rezepts oder einer Aktivität (`description`) ist ein eigenes Feld.
- **Siehe auch:** [Zusatz](#zusatz), [Hinweis](#hinweis), [Reise](#reise)

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
Markt. Der Name ist je Haushalt eindeutig, ohne Groß/Klein (Spec 0007). Bereiche lassen sich
zusammenlegen; beim Löschen verlieren ihre Artikel den Bereich („Ohne Bereich“).

- **Im Code:** `Area`, `areas` (eindeutig über `lower(name)` je Haushalt); Zusammenlegen
  `merge_areas`
- **Nicht verwenden:** Kategorie, Abteilung, Gang, Regal

### Laufreihenfolge

Die Reihenfolge der Bereiche in einem bestimmten Markt. Jeder Markt hat seine eigene und kann
Bereiche ausblenden; ein wieder eingeblendeter Bereich steht an seiner früheren Stelle. Ohne Markt
gilt die Reihenfolge der Bereiche selbst („Reihenfolge ohne Markt“). Die Laufreihenfolge eines
Markts ist ein Feld: Ordnen zwei Personen gleichzeitig, gilt die letzte Änderung (Spec 0007,
AC-050).

- **Im Code:** `Store.areaOrder` und `Store.hiddenAreaIds` (`stores.area_order`,
  `stores.hidden_area_ids`); ohne Markt `Area.sort`
- **Nicht verwenden:** Laufweg (steht im UI-Konzept 3.9, gemeint ist dasselbe)

### Einkaufsmodus

Die Ansicht der Einkaufsliste im Laden: sortiert nach der Laufreihenfolge des gewählten Markts,
optimiert zum Abhaken mit einer Hand. In der Oberfläche „Einkaufen“, auf dem Handy als Vollbild
mit „Fertig“ (Spec 0005, D5).

- **Im Code:** `ShoppingMode`
- **Siehe auch:** [Einkaufsgang](#einkaufsgang)

### Einkaufsgang

Ein Einkauf im Laden von „Einkaufen“ öffnen bis „Fertig“ oder Verlassen. Er übersteht ein
Neuladen. Fortschritt („3/15“) und „Im Wagen“ zählen nur, was beim Start offen war oder unterwegs
dazukam; Erledigtes vom letzten Mal zählt nicht (Spec 0025, REQ-013).

- **Im Code:** `ShoppingRun` (nicht `ShoppingTrip`: `trip` heißt nur die Reise)
- **Nicht verwenden:** Trip, Tour, Einkaufstour, Einkaufsreise
- **Abgrenzung:** Eine _Reise_ ist ein Zeitraum, in dem Personen unterwegs sind.

### Sync

Der automatische Abgleich zwischen der lokalen Datenbank eines Geräts und dem Server.

- **In der Oberfläche:** „wird synchronisiert“, „alles gespeichert“
- **Siehe:** `docs/architecture/sync.md`

### Synonym

Ein weiterer Name für denselben Artikel, z. B. „Karotten“ für „Möhren“. Name und Synonyme sind je
Haushalt eindeutig: Kein Synonym darf Name oder Synonym eines anderen Artikels sein. Höchstens 30
je Artikel. Suche und Autovervollständigung treffen beide; beim Zusammenführen werden Name und
Synonyme der Quelle Synonyme des Ziels.

- **Im Code:** `Article.synonyms` (`articles.synonyms`, verglichen über `synonym_keys`; die
  Datenbank prüft die Eindeutigkeit im Trigger `articles_keys_unique`)
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
durchgestrichen; Vorrat-Posten sind ausgeklappt, aber abgewählt (Spec 0025, E11; früher eingeklappt). Was abgewählt ist, kommt nicht auf
die Liste. Von der Seite eines Rezepts oder einer Sammlung startet er direkt, sonst nach dem
Schritt „Was soll auf die Liste?“ (Spec 0006, Spec 0009).

- **Im Code:** `PantryCheck`

### Starter-Katalog

Rund 450 gängige Artikel mit Bereich, Ernährungseigenschaft, Vorrat und Synonymen, die fest in der
App liegen. Ein neuer Haushalt bekommt sie beim Anlegen als eigene Artikel. „Suchen oder anlegen“
zeigt einen Eintrag des Starter-Katalogs nur, solange kein Artikel des Haushalts einen seiner
Namen trägt; wählt man ihn, entsteht der Haushalts-Artikel mit seinen Angaben (Spec 0007, E10).

- **Im Code:** `starterCatalog` (`packages/api/src/starter`); für die Suche
  `starterCatalogEntries`
- **Nicht verwenden:** Stammdaten (meint die eigenen Artikel, Märkte und Bereiche, siehe dort),
  Standardartikel
- **Siehe auch:** [Artikel-Katalog](#artikel-katalog)

### Ernährungsform

Wie sich eine Person ernährt (vegan, vegetarisch, flexibel) bzw. was ein Rezept oder eine Variante
enthält (vegan, vegetarisch, mit Fisch, mit Fleisch, unbekannt).
Artikel können zusätzlich „kein Lebensmittel“ sein (Grillanzünder, Kaffeefilter); sie zählen beim
Ableiten nicht mit (Spec 0023, REQ-008). Bei Rezepten wird sie aus den
Ernährungseigenschaften der Artikel abgeleitet, bei Sammlungen aus allem, was sie enthalten (Spec
0009).

- **Im Code:** `Diet` (mit `non_food` = „kein Lebensmittel“); am Artikel `diet` (Ernährungseigenschaft), am Mitglied `dietPreference`
- **Nicht verwenden:** Kostform, Diät

### Variante

Eine Ausprägung eines Rezepts, die Zutaten ergänzt, z. B. „mit Tofu“ oder „mit Hähnchen“. Zutaten
ohne Variante bilden die Basis. Ein Wochenplan-Eintrag kann mehrere Varianten mit eigenen
Portionen haben. Genau eine Variante ist „Standard“ und auf der Rezeptseite vorausgewählt; wird
eine Variante entfernt, gehen ihre Zutaten und Schritte mit, und Planeinträge geben ihre Portionen
an die Standardvariante ab (Spec 0008).

- **Im Code:** `RecipeVariant`, gespeichert als Liste in `recipes.variants` (`Recipe.variants`,
  keine eigene Tabelle); Standard `isDefault`, `defaultVariantId`; im Planeintrag `variants`
  (`{ variantId, portions }`)
- **Nicht verwenden:** Version, Abwandlung, Option

### Bearbeitungsmodus

Der Zustand der Rezept- oder Sammlungsseite, in dem alle Blöcke (Kopf, Einordnung, Zutaten,
Zubereitung, Notizen, Links, bei Sammlungen „Enthält“) zugleich bearbeitet werden. Der Stift oben
rechts öffnet ihn, „Speichern“ sichert alle geänderten Blöcke in einem Schritt, „Abbrechen“ fragt
„Änderungen verwerfen?“. Im Lesemodus hat die Seite keine Stifte in den Blöcken (Spec 0037,
REQ-001; ersetzt den „Abschnitt der Rezeptseite“ aus Spec 0008, REQ-007).

- **Im Code:** `PageDraft`, `pageEditorReducer` (`packages/core`, `page-editor.ts`), Block-Entwurf
  `RecipeSectionDraft` mit `RecipeSection`, Speichern `saveRecipePage` / `save_recipe_page`, in
  der App `usePageEditor`
- **Nicht verwenden:** Abschnitt der Rezeptseite, Formular, Editiermodus
- **Abgrenzung:** Die Abschnitte der _Packliste_ (`packingSections`) und „Heute geplant“ auf der
  _Übersicht_ sind Gruppen zum Lesen. Ein Fenster („Neue Zutat“) im Bearbeitungsmodus speichert
  nichts selbst.

### Gerichtart

Die Einordnung eines Rezepts: Frühstück, Hauptgericht, Beilage, Dessert, Snack, Getränk.

- **Im Code:** `course`
- **Nicht verwenden:** Gang (bedeutet im Supermarkt etwas anderes), Kategorie

### Vorlauf

Eine Vorbereitung, die vor dem Kochtag nötig ist, z. B. „Kichererbsen einweichen, 12 Stunden
vorher“. Erscheint seit Spec 0020 als [Vorbereitungszeile](#vorbereitungszeile) auf der „Übersicht“ an
dem Tag, an dem man spätestens anfangen muss (nicht mehr nur am Vortag).

- **Im Code:** `leadTime`

### Dauerposten

Ein Artikel, der nach einem eigenen Rhythmus von selbst auf die Einkaufsliste kommt, z. B. „Milch
montags“. **Nicht gebaut** (Spec 0025: Keine Dauerposten; die Herkunft `recurring` entfällt).

- **Im Code:** keiner; der frühere Entwurf `RecurringItem`, `recurring_items` besteht nicht
- **Nicht verwenden:** Abo, Standardposten

### Sammlung

Ein besonderes Rezept der Art „Sammlung“, das eigene Zutaten und andere Rezepte bündelt, z. B.
„Grillabend“ = Grillkohle, Bier, Würstchen + Kartoffelsalat + Grillgemüse. Wird wie ein Rezept
eingeplant, bewertet und favorisiert; „Auf die Liste“ bringt die eigenen Zutaten und die Zutaten
der enthaltenen Rezepte, skaliert, durch den Vorratscheck. Hat keine Zubereitung, keine Varianten,
keine Küche und enthält keine Sammlungen (Spec 0009, D14, D15).

- **Im Code:** `Recipe` mit `kind: 'collection'`; enthaltene Rezepte siehe
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

- **Im Code:** `CollectionRecipe`, `collection_recipes`
- **Nicht verwenden:** Unterrezept, Bestandteil

### Aufgabe

Etwas, das im Haushalt zu tun ist, einmalig oder wiederkehrend, z. B. „Bad putzen“. Kann eine
optionale Uhrzeit haben, zu der am Fälligkeitstag erinnert wird (Spec 0013, D42).

- **Im Code:** `Chore`, `chores`; Uhrzeit siehe [Uhrzeit (Aufgabe)](#uhrzeit-aufgabe)
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
- **Siehe auch:** [Vertretung](#vertretung), [Termin nach Reisen](#termin-nach-reisen)

### Termin nach Reisen

Der Termin, ab dem eine Aufgabe tatsächlich fällig ist: statt des gespeicherten Termins der erste
[freie Tag](#freier-tag) ab ihm, auch über überlappende Reisen. Gespeichert wird nichts, er wird
berechnet; Ändern und Löschen einer Reise wirken sofort. Angezeigt als „nach der Reise am Fr 11.12.“,
am Tag selbst „heute, nach der Reise“. Fälligkeitstexte: „heute“, „fällig seit gestern“, „fällig
seit n Tagen“ (ab 2); der Haushalt-Abschnitt dafür heißt „Noch offen“ (früher „Fällig seit“, Wort
„überfällig“ entfällt) (Spec 0026, REQ-009, REQ-011).

- **Im Code:** `choreDueOn` (`packages/core/src/chore-schedule.ts`), in SQL
  `private.chore_count_day`; `chores.next_due_on` bleibt unverändert
- **Nicht verwenden:** verschobener Termin (das ist „Später“), überfällig, Nachholtermin
- **Abgrenzung:** „Später“ verschiebt von Hand; der Termin nach Reisen rechnet die App.

### Freier Tag

Ein Tag, an dem jemand Zuständiges zu Hause ist: bei fester Zuständigkeit die Person, bei „Egal“ ein
beliebiges Mitglied, bei „Zu zweit“ beide. An nicht freien Tagen ist die Aufgabe nirgends fällig
(Spec 0026, REQ-011).

- **Im Code:** `canDoChoreOn`, `firstFreeDay` (`packages/core`), in SQL `private.chore_can_do_on`,
  `private.chore_first_free_day`; liest `trips`/`trip_members`
- **Nicht verwenden:** Ruhetag, Anwesenheitstag
- **Abgrenzung:** Der _Termin nach Reisen_ ist der erste freie Tag ab dem gespeicherten Termin.

### Vertretung

Bei „Abwechselnd“ die nächste Person der Reihenfolge, die zu Hause ist, wenn die reguläre Person auf
einer Reise ist. Gespeichert bleibt die reguläre Person; die Reihenfolge ändert sich nie, nichts wird
nachgeholt (Spec 0026, REQ-012).

- **Im Code:** `choreTurn` (`actingId`) in `packages/core`, in SQL `private.chore_acting_assignee`;
  `nextAssignee` bleibt unverändert
- **Nicht verwenden:** Ersatz, Stellvertreter
- **Abgrenzung:** Wer erledigt, bleibt die Person, die abhakt; die Vertretung ist nur, wer „dran“
  ist.

### Erledigung

Ein Eintrag im Verlauf des Haushaltsplans: wer hat wann was erledigt oder übersprungen. Eine Art
„spontan“ gibt es nicht (Spec 0011, Offene Frage 6): Was ohne passende Aufgabe erledigt wurde, legt
eine Aufgabe „bei Bedarf“ an und ist eine normale Erledigung. „Erledigt von“ lässt sich im Verlauf
ändern. Die _jüngste_ Erledigung einer Aufgabe ist die zuletzt gebuchte, nicht die mit dem
jüngsten Tag. Nur bei ihr verschiebt „Erledigt von“ die Zuständigkeit, und nur wenn sie entfernt
wird, gelten nächster Termin und Zuständigkeit wieder wie davor (Spec 0011, Offene Fragen 3 und 9).

- **Im Code:** `ChoreEvent`, `chore_events` mit `kind: 'done' | 'skipped'`; der Stand davor
  (Termin, letzte Erledigung, Person) als `ChoreEvent.previous` (Spalten `prev_*`, nur vom Server
  gesetzt); eingetragen um `ChoreEvent.createdAt` (Uhrzeit des Servers beim Eintragen,
  `clock_timestamp()`); jüngste Erledigung `latestBookedEvent`
- **Nicht verwenden:** Buchung, Abhakung

### Verlauf

Die Liste aller Erledigungen eines Haushalts im Haushaltsplan, neueste zuerst, gegliedert nach Monat
und Woche, mit einer Trennzeile beim Jahreswechsel (Spec 0011, REQ-010). Ein Tipp auf einen Eintrag
ändert „Erledigt von“ oder entfernt ihn.

- **Im Code:** Ansicht `history` im Haushalt, `ChoreHistory` (App), Gliederung `historyGroups`
  (`packages/core`); Test-IDs `history-*`
- **Nicht verwenden:** Historie, Log, Protokoll
- **Abgrenzung:** An einer Aktivität heißt der Abschnitt mit den Tagen, an denen sie im Plan stand,
  ebenfalls „Verlauf“ (Spec 0024); beim Restaurant heißt er „Besuche“. Der _Verlauf_ des
  Haushaltsplans listet Erledigungen von Aufgaben, nicht Planeinträge.

### Reise

Ein Zeitraum, in dem eine oder mehrere Personen unterwegs sind (Urlaub, Dienstreise, Besuch). Eine
Reise hat Von, Bis, eine optionale Notiz (Titel, ohne Notiz „unterwegs“) und mindestens eine Person;
stehen alle Mitglieder darauf, heißt sie „Ganzer Haushalt“ (nur abgeleitet, nicht gespeichert).
Wirkt nur auf Aufgaben ([Termin nach Reisen](#termin-nach-reisen), [Vertretung](#vertretung)) und
schaltet Benachrichtigungen still, nicht auf Essen, Esser oder Einkauf (Spec 0030, REQ-008). Von und Bis sind frei wählbar, auch über Monats- und Jahresgrenzen und in
der Vergangenheit. Kann eine Packliste haben (Spec 0022). Hieß bis Spec 0022 „Abwesenheit“.

- **Im Code:** `Trip`, `trips` (eine Zeile je Reise) und `trip_members` (Person je Reise); vorher
  `Absence`/`absences` (Spec 0022 benennt um, bis dahin gilt der alte Code)
- **In der Oberfläche:** „Reise“, „Reisen“, ohne Notiz „unterwegs“ (Spec 0016, REQ-008)
- **Adressen:** die Seite „Reisen“ unter `/reisen`; die Reise selbst ist ein Fenster über der
  aktuellen Seite, in der Adresse als `reise=<ID>` (Spec 0019, Spec 0022); `/kalender/reise/<id>`
  entfällt
- **Nicht verwenden:** Abwesenheit (alter Name), Urlaub (ist nur ein Fall davon), Pause
- **Siehe auch:** [Reise-Streifen](#reise-streifen), [Reise-Fenster](#reise-fenster),
  [Packliste](#packliste), [Reise-Entwurf](#reise-entwurf)

### Reise-Entwurf

Eine [Reise](#reise), die noch geplant wird (Urlaubsplanung). Sie steht schraffiert und mit
„Entwurf“ überall, wo Reisen stehen, wirkt aber noch nicht: Aufgaben warten nicht, Nachrichten
kommen weiter, keine Pack-Karte auf der Übersicht. Ausschalten von „Entwurf“ bestätigt die Reise
(Spec 0030, REQ-004).

- **Im Code:** `Trip.draft`, Spalte `trips.draft`
- **In der Oberfläche:** „Entwurf“, „Entwurf gespeichert“, „Reise bestätigt“
- **Nicht verwenden:** vorläufige Reise, geplante Reise

### Tages-Fenster

Das Fenster, das in den Ansichten „Monat“ und „Jahr“ nach einem Tipp auf einen Tag alles von diesem
Tag zeigt: Reisen, Aufgaben und alle Tageszeiten mit ihren Einträgen, zum Ansehen und
Bearbeiten, ohne die Ansicht zu wechseln. Auf dem Handy kommt es von unten und lässt das Raster
bedienbar, ab 700 px steht es rechts neben dem Raster (Spec 0016, REQ-006, Entwurf).

- **Im Code:** noch nicht gebaut
- **Nicht verwenden:** Tagesansicht (es gibt keine vierte Ansicht), Dropup, Tagesliste (die
  ersetzt es)
- **Siehe auch:** [Kalender](#kalender), [Tageszeit](#tageszeit)

### Erinnerung

Eine Benachrichtigung, die jemand an einem einzelnen Planeintrag einschaltet, mit Tag und Uhrzeit;
ohne Einschalten kommt keine (Spec 0017). Sie geht mit, wenn der Eintrag verschoben wird. Die Art
auf der Seite „Benachrichtigungen“ heißt „Erinnerungen an Einträgen“.

- **Im Code:** Spalten `reminder_day_offset`, `reminder_at`, `reminder_text` an `meal_plan_entries`;
  Einstellung `entry_reminders_enabled`; Art `entry_reminder`; core `reminder.ts`
- **Abgrenzung:** Eine eigene _Reservierungs-Erinnerung_ („Erinnern 2 h vorher“, Spec 0013) gibt es
  seit Spec 0021 nicht mehr; sie geht in diese Erinnerung auf (Uhrzeit am Eintrag setzen schaltet sie
  ein, 2 Stunden vorher). Der _Tagesüberblick_ und „Aktivitäten am Vortag“
  sind Arten von Benachrichtigungen je Person, keine Erinnerungen an einem Eintrag.
- **Nicht verwenden:** Alarm, Wecker, Termin

### Reise-Streifen

Die Darstellung einer oder mehrerer Reisen im Kalender und auf der „Übersicht“: ein Streifen mit
Notiz (ohne Notiz „unterwegs“), Ende („bis Mo 4.1.“) und Avataren. Reisen mit gleichem Von, Bis und
gleicher Notiz bilden einen Streifen. Eine Person: zart in ihrer Farbe; mehrere oder der ganze
Haushalt: neutral (Spec 0010). Ein Tipp öffnet das [Reise-Fenster](#reise-fenster); mit Packliste
trägt er ein Taschen-Symbol. Hieß „Abwesenheits-Streifen“.

- **Im Code:** `TripStripe` (vorher `AbsenceStripe`), abgeleitet aus `Trip`, nicht gespeichert
- **Nicht verwenden:** Abwesenheits-Streifen (alter Name), Urlaubsstreifen, Balken
- **Abgrenzung:** Das _Reise-Fenster_ ist das Fenster mit allen Angaben der Reise.

### Reisetasche

Eine wiederverwendbare Vorlage für Packlisten, z. B. „Strand“ oder „Kulturbeutel“: Name (eindeutig
je Haushalt), optional „für“ ein Mitglied, Packstücke mit Anzahl. Liegt unter „Verwalten“ →
„Reisetaschen“. Eine Änderung wirkt nie auf bestehende Packlisten (Spec 0012, D35).

- **Im Code:** `PackingBag`, `packing_bags`; Regeln in `packages/core/src/packing.ts`
- **Nicht verwenden:** Packvorlage, Koffer, Sammlung
- **Abgrenzung:** Die _Packliste_ ist die Kopie für eine Reise.

### Packliste

Die Liste zum Abhaken einer Reise: eine Kopie der angehängten Reisetaschen, gruppiert nach
Tasche, im [Reise-Fenster](#reise-fenster). Packen geht auch ohne Netz (Laden-Warteschlange, „Abhaken gewinnt“);
„Für die Rückreise zurücksetzen“ nimmt alle Haken weg. Wird mit ihrer Reise gelöscht; das Bearbeiten einer Reise ersetzt sie nicht mehr (Spec 0012,
AC-039; Spec 0022).

- **Im Code:** kein eigener Datensatz; alle [Taschen der Packliste](#tasche-der-packliste)
  (`packing_list_bags`) einer Reise mit ihren `packing_items`; Abschnitte `packingSections`
- **Nicht verwenden:** Checkliste, Kofferliste

### Kommende Packliste

Eine Zeile oben auf der Seite „Reisetaschen“ je kommender Reise mit Packliste (früheste zuerst):
Titel, Zeitraum, Packstand („12/30 gepackt“ oder „alles gepackt ✓“), Avatare. Vergangene Reisen
erscheinen nicht; ein Tipp öffnet das [Reise-Fenster](#reise-fenster) (Spec 0022, REQ-013).

- **Im Code:** noch nicht gebaut (Spec 0022)
- **Nicht verwenden:** Packübersicht, Packliste (für die Zeile; die Liste selbst ist die _Packliste_)

### Tasche der Packliste

Eine an eine Reise angehängte Reisetasche: Abschnitt der Packliste mit Name und Mitglied als
Kopie, Reihenfolge und Verweis auf die Herkunftstasche, der leer wird, wenn die Reisetasche gelöscht
wird. „Aus der Packliste entfernen“ löscht sie samt ihren Packstücken (Spec 0012, Entscheidung 2).

- **Im Code:** `PackingListBag`, `packing_list_bags`
- **Nicht verwenden:** Listentasche, Abschnitt (für den Datensatz)
- **Abgrenzung:** Die _Reisetasche_ ist die Vorlage; ihre Änderung wirkt nie auf die Tasche der
  Packliste (D35).

### Reise-Fenster

Das Fenster einer Reise mit Kopf (Titel = Notiz, „beginnt in 12 Tagen“, ⋯), den direkt änderbaren
Feldern Wer?, Von, Bis und Notiz, Fortschritt und [Packliste](#packliste). Öffnet sich über der
aktuellen Seite: aus dem [Reise-Streifen](#reise-streifen), dem Tages-Fenster, der Liste „Reisen“,
der Karte „Reisetasche“ der „Übersicht“ und den [kommenden Packlisten](#kommende-packliste). Am Handy
von unten in voller Höhe, ab 700 px in der Mitte (Spec 0022, REQ-001, REQ-002). Hieß „Urlaubsseite“
und war eine eigene Seite.

- **Im Code:** `TripWindow` (vorher Adresse `/kalender/urlaub/[id]`, `TripScreen`); Kopf `tripHeader`
- **Nicht verwenden:** Urlaubsseite, Reiseseite, Abwesenheitsdetail
- **Abgrenzung:** Das _Tages-Fenster_ zeigt einen Tag, nicht eine Reise.

### Packstück

Eine Zeile einer Reisetasche oder Packliste: Name als Freitext und optionale Anzahl, fest („2×“)
oder je Tag („1 je Tag“, gerechnet mit der Dauer der Reise, erster und letzter Tag
eingeschlossen). In der Packliste zusätzlich „gepackt“ (Spec 0012, D32).

- **Im Code:** in der Reisetasche `PackingBagItem`, `packing_bag_items`; in der Packliste
  `PackingItem`, `packing_items` (Anzahl je Tag in `perDay`, ausgerechnet in `quantity`; Verweis auf
  das Packstück der Tasche `bagItemId`, Herkunft `fromBag`, Spec 0022)
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
Anmeldung). Eine Einladung lebt nur, solange sie **offen** ist: Annehmen löscht sie, Zurückziehen
auch; einen Zustand „angenommen“ gibt es nicht (Spec 0027, E1). Die Gesamtheit der offenen
Einladungen ist die **Einladungsliste** (ADR-0003: „Allowlist“).

- **Im Code:** `Invitation`, `household_invitations` (ohne `accepted_at`, Spec 0027)
- **Nicht verwenden:** Whitelist, Freischaltung, angenommene Einladung

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
und zurücknehmen, auch „Alles einpacken“ und „Für die Rückreise zurücksetzen“ (ADR-0013). Wird mit
Netz der Reihe nach nachgereicht; eine zusammenhängende Folge von Pack-Einträgen eines Haushalts
geht als ein Aufruf.

- **Im Code:** `StoreQueueEntry` (`packages/core/src/store-queue.ts`) mit den Arten `check`,
  `notAvailable`, `add`, `assignArea` und `pack` (Folge: `packBatch`), auf dem Gerät unter dem
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
Beschreibung, Foto, [Webseite](#webseite) und optional einen Ort; steht im Wochenplan in einer
Tageszeit, mit Zusatz in Klammern, z. B. „Eislaufen (Hohenschönhausen)“, und optional mit
[Uhrzeit](#uhrzeit-eintrag). Alle Aktivitäten stehen auf der Seite „Aktivitäten“ unter „Verwalten“
(Adresse `/aktivitaeten`, kein Berg-Symbol im Kalender mehr; Spec 0024, REQ-009).

- **Im Code:** `Activity`, `activities`; Planeintrag `kind: 'activity'`
- **Nicht verwenden:** Event, Termin, Freizeit (als Begriff für den Eintrag); „Sammlung
  ‚Aktivitäten‘“ (so heißt die Seite in Spec 0004)
- **Abgrenzung:** Die Adressen `/kalender/aktivitaeten` und `/kalender/aktivitaet/<id>` (Spec 0010)
  entfallen.

### Webseite

Die optionale Internetadresse eines Restaurants oder einer Aktivität (http oder https), in der
Oberfläche „Webseite“. Geprüft nach einer gemeinsamen Regel, nie abgerufen (Spec 0024, REQ-003; Spec
0023, REQ-009).

- **Im Code:** `websiteUrl`, Spalte `website_url` an `restaurants` und `activities`; Prüfung
  `private.is_web_url`
- **Nicht verwenden:** Homepage, Link (die „Links“ am Rezept sind ein eigenes Feld, `recipes.links`),
  Karten-Link (der führt zur Karten-App)

### Verwalten

Die Gruppe der Seiten, die den Haushalt verwalten, in drei Blöcken: Planen (Aktivitäten,
Reisetaschen, Reisen), Einkaufen (Artikel, Märkte & Bereiche), Haushalt (Haushalt &
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
- **Abgrenzung:** Haushalte, Mitglieder, Einladungen, Märkte, Feedback und Reisen gehören zu
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

- **Im Code:** Art `dailySummary` (`NotificationKind`); Felder `dailySummaryEnabled`,
  `dailySummaryAt`, `dailySummaryParts` (`DailySummaryPart`: `meals`, `activities`, `chores`,
  `prep`), Spalten `daily_summary_*`
- **Nicht verwenden:** Tageszusammenfassung (Feature-Konzept F1), Morgen-Nachricht, Digest

### Benachrichtigungs-Einstellungen

Was eine Person wann bekommt: je Art an/aus, Uhrzeiten, beim Tagesüberblick die Teile. Gilt je
Mitglied und Haushalt auf allen Geräten der Person; je Gerät gibt es nur „an“ oder „aus“ (Spec
0013, D38). Nur die Person selbst liest und schreibt sie; synchronisiert.

- **Im Code:** `NotificationSettings` (Zod-Schema `NotificationSettingsSchema`),
  `notification_settings`; Arten `NotificationKind`
- **Nicht verwenden:** Push-Einstellungen, Profil-Einstellungen

### Push-Abo

Die Anmeldung eines Geräts bzw. Browsers für Web Push: Push-Adresse, Schlüssel, Gerätename,
an/aus, letzter Erfolg. Gehört einer Person, nicht einem Haushalt, und wird nicht synchronisiert
(Ausnahme von Regel 5, Spec 0013). In der Oberfläche „Deine Geräte“. Mit Spec 0015 (Entwurf) ist
auch die Anmeldung einer [nativen App](#native-app) über ihr Expo-Push-Token ein Push-Abo, mit
Gerätename „Android · native App“ bzw. „iPhone · native App“.

- **Im Code:** Tabelle `private.push_subscriptions`; die eigene Liste ohne Push-Adresse und
  Schlüssel `OwnPushSubscription` (aus `list_push_subscriptions`). Nicht `PushSubscription`: Das
  ist der Typ des Browsers.
- **Nicht verwenden:** Abo (allein, das meint nichts), Gerät (für den Datensatz), Token

### Zustell-Protokoll

Ein Eintrag je zugestellter Nachricht und Gerät mit eindeutigem Schlüssel, Zeitpunkt und Status;
verhindert doppelte Nachrichten. 30 Tage aufbewahrt, nur für den Zeitplaner, nie aus der App
lesbar (Spec 0013).

- **Im Code:** `private.notification_deliveries`
- **Nicht verwenden:** Log, Versandliste

### Zeitplaner

Die Datenbankfunktion, die `pg_cron` alle 5 Minuten startet („Takt“): Sie findet fällige
Nachrichten in der Zeitzone des Haushalts, schreibt sie ins Zustell-Protokoll und gibt sie per
`pg_net` an die Edge Function `push-send`, die nur zustellt und keinen Datenbankzugang hat (Spec
0013, D40).

- **Im Code:** `private.run_notification_tick` (`pg_cron`-Job `notification-tick`), Kandidaten aus
  `private.notification_candidates`; Edge Function `push-send`
- **Nicht verwenden:** Cronjob (für das Ganze), Scheduler (in der Oberfläche)

### Takt

Ein Lauf des Zeitplaners, alle 5 Minuten zur vollen 5. Minute. Eine Nachricht kommt in dem Takt,
der ihre Uhrzeit erreicht; was mehr als 30 Minuten zu spät käme, entfällt (Spec 0013).

- **Im Code:** `private.run_notification_tick(p_now)`
- **Nicht verwenden:** Tick (in der Oberfläche), Durchlauf

### Probe

Eine Nachricht „Probe: So sehen deine Benachrichtigungen aus.“, die „Probe senden“ sofort an
dieses Gerät schickt, und nur an dieses (Spec 0013, REQ-003). Höchstens 3 in 10 Minuten.

- **Im Code:** `send_test_push`; Art `test` im Zustell-Protokoll
- **Nicht verwenden:** Test-Nachricht (in der Oberfläche), Ping

### Uhrzeit (Aufgabe)

Die optionale Uhrzeit einer Aufgabe, zu der am Fälligkeitstag erinnert wird, wer dran ist („Müll
rausbringen · 19:00“). In 5-Minuten-Schritten, Ortszeit des Haushalts; ✕ entfernt sie (Spec 0013,
D42). Rezepte und Sammlungen haben keine Uhrzeit; Restaurants und Aktivitäten haben die _Uhrzeit
(Eintrag)_. Mit dem Schalter „Erinnern“ je Aufgabe (Spec 0027, REQ-009) lässt sich die Erinnerung
ausschalten; die Uhrzeit wird dann nur angezeigt.

- **Im Code:** `Chore.dueTime` (`TimeOfDay`, „HH:MM“), `chores.due_time`; Schalter
  „Erinnern“ `chores.remind_at_due_time` (Spec 0027); anzeigen mit `withTime`/`formatTime`, wählen mit
  `TimeField` (Auswahl „Stunde“/„Minute“, Spec 0027, REQ-007)
- **Nicht verwenden:** Termin, Deadline, Fälligkeitszeit

### Produktion

Die Umgebung, in der die Haushalte die App mit echten Daten nutzen: die Static Web App
„Produktion“ und das bestehende Supabase-Projekt (Frankfurt). Ändert sich nur über die
Veröffentlichung aus `main`; nie Seed, nie Reset, keine Testkonten (Spec 0014, ADR-0015).

- **Im Code:** GitHub-Umgebung `production`, Variablen `PRODUCTION_*`, Static Web App
  `swa-housekeeping-app-prd`, Abschnitt `[remotes.production]` in `supabase/config.toml`
- **Nicht verwenden:** Live, Prod, Live-System
- **Abgrenzung:** _Lokal_ ist die Entwicklungsumgebung in Docker mit Seed und Testkonten; die
  _Vorschau_ hat nur Beispieldaten.
- **Siehe auch:** [Vorschau](#vorschau), [Veröffentlichung](#veröffentlichung)

### Vorschau

Die eine Umgebung, die immer den neuesten Stand von `develop` zeigt, zum Ausprobieren auf dem Handy
vor der Freigabe: eigene Static Web App und eigenes Supabase-Projekt, bei jedem Vorschau-Lauf neu
aufgesetzt mit Beispieldaten ohne Testkonten, Anmeldung nur mit Google und Einladung, Push aus
(Spec 0014). Feature-Zweige und PRs haben keine eigene Vorschau.

- **Im Code:** GitHub-Umgebung `preview`, Variablen `PREVIEW_*`, Workflow `preview.yml`, Static
  Web App `swa-housekeeping-app-preview`, `supabase/preview-seed.sql`, App-Version `vorschau`
- **Nicht verwenden:** Staging, Testumgebung, Preview (in deutschen Texten), PR-Vorschau
- **Abgrenzung:** Die _Vorschau_ ist keine Veröffentlichung; ihre Daten sind wegwerfbar.

### Veröffentlichung

Ein Stand von `main`, der mit Versionsnummer ausgeliefert ist: Checks, Sicherung, Supabase
ausliefern, Web ausliefern, Prüfung von außen, dann Git-Tag `v<Version>` und GitHub-Veröffentlichung
mit Änderungsliste. Entsteht nach jeder Release-PR und jedem Hotfix, außer wenn sich seit dem
letzten Tag nur Doku geändert hat (Spec 0014, REQ-005).

- **Im Code:** Workflow `release.yml`, Tag `v<Version>`, `scripts/release/` (vorläufig)
- **Nicht verwenden:** Release (in deutschen Texten, außer „Release-PR“), Deployment (für das
  Ganze), Rollout
- **Abgrenzung:** _Ausliefern_ ist ein einzelner Schritt darin („Web ausliefern“, „Supabase
  ausliefern“) und kommt auch in der Vorschau vor; eine _Veröffentlichung_ gibt es nur in Produktion.

### Release-PR

Die PR von `develop` nach `main`, Titel „chore: Veröffentlichung“, zusammengeführt per
Merge-Commit. Sie ist die einzige Freigabe für Produktion; ihr Zusammenführen startet die
Veröffentlichung (Spec 0014, AC-066). Sie selbst steht nicht in der Änderungsliste.

- **Im Code:** kein eigener Bezeichner; PR mit Kopf `develop` und Basis `main`
- **Nicht verwenden:** Freigabe-PR, Deploy-PR, Merge-Request

### Hotfix

Eine dringende Korrektur, die an `develop` vorbei nach `main` geht: Zweig `hotfix/<slug>` von
`main`, PR nach `main` mit Titel `fix: …`, Merge-Commit. Danach folgen Veröffentlichung und
Rückführung (Spec 0014, AC-067, AC-072).

- **Im Code:** Zweigpräfix `hotfix/`
- **Nicht verwenden:** Bugfix-Release, Patch, Notfall-Release
- **Abgrenzung:** Ein Zweig `fix/…` ist eine normale Korrektur und geht nach `develop`.
- **Siehe auch:** [Rückführung](#rückführung)

### Rückführung

Das Zurückbringen von `main` nach `develop` nach einem Hotfix: Die Pipeline legt den Zweig
`chore/rueckfuehrung-v<Version>` vom Stand von `main` an, öffnet die PR „chore: main nach develop
zurückführen“ und führt sie bei grünen Checks per Merge-Commit zusammen; bei Konflikt bleibt sie
offen (Spec 0014, AC-067, AC-068).

- **Im Code:** Job `rueckfuehrung` in `release.yml`, Zweig `chore/rueckfuehrung-v<Version>`
  (vorläufig)
- **Nicht verwenden:** Back-Merge, Rück-Merge, Sync (meint den Delta-Abgleich, siehe [Sync](#sync))

### App-Version

Die Versionsnummer einer Veröffentlichung im Format `JJJJ.M.N`: Jahr, Monat ohne führende Null
(Berliner Zeit), laufende Nummer im Monat ab 1, z. B. `2026.12.4`. Die App zeigt sie ganz unten in
den Einstellungen; das Web nennt die ausgelieferte in `/version.json`. Lokal heißt sie `dev`, in der
Vorschau `vorschau` (Spec 0014, ADR-0015).

- **Im Code (vorläufig):** `EXPO_PUBLIC_APP_VERSION`, `/version.json`; `parseAppVersion`,
  `compareAppVersions`, `nextAppVersion`, `appVersionState` in `packages/core/src/app-version.ts`
- **Nicht verwenden:** Build-Nummer, Release-Nummer, Versionscode (der ist nur für Android)
- **Abgrenzung:** Die _Speicher-Version_ (`CACHE_VERSION`) gehört zum lokalen Speicher, nicht zur
  App; sie ändert sich nur, wenn sich dessen Form ändert.
- **Siehe auch:** [Mindestversion](#mindestversion)

### Mindestversion

Die älteste App-Version, die noch mit dem Server arbeiten darf. Sie steigt nur mit einer
Rückbau-Migration (contract) und nie über die zuletzt veröffentlichte Version. Liegt die App
darunter, steht „Diese Version wird nicht mehr unterstützt“; Lesen und Abhaken gehen weiter,
Bearbeiten ist gesperrt, die Laden-Warteschlange wartet. Die App liest sie nur online (Spec 0014,
AC-025, ADR-0015).

- **Im Code:** SQL-Funktion `public.min_app_version()`; Migrationskopf
  `-- contract: <Begründung>; min_app_version: <Version>`; Zustand `nicht-unterstuetzt` von
  `appVersionState` (vorläufig)
- **Nicht verwenden:** Pflicht-Update, Force-Update, Mindest-Build

### Sicherung

Die nächtliche, mit `age` verschlüsselte Kopie von Datenbank (Rollen, Schema, Daten) und allen
Fotos im Azure-Storage-Konto, mit einer Begleitdatei ohne Daten (Zeilen je Tabelle, Fotoanzahl,
Prüfsumme). Zusätzlich vor jeder Veröffentlichung. 30 Tage unveränderlich; tägliche bleiben 30
Tage, die vom Monatsersten 12 Monate (Spec 0014, REQ-009).

- **Im Code:** Workflow `backup.yml`, GitHub-Umgebung `backup`, Container `backups` mit den Pfaden
  `daily/`, `monthly/`, `release/`, Begleitdatei `manifest.json` (vorläufig)
- **Nicht verwenden:** Backup (in deutschen Texten), Snapshot, Dump (meint nur den Datenbank-Teil)
- **Siehe auch:** [Wiederherstellungstest](#wiederherstellungstest)

### Wiederherstellungstest

Die monatliche Probe, ob sich die neueste Sicherung einspielen lässt: entschlüsseln, in eine
Wegwerf-Datenbank im Runner einspielen, mit der Begleitdatei vergleichen. Rot bei der ersten
Abweichung oder wenn die neueste Sicherung älter als 36 Stunden ist (Spec 0014, AC-056).

- **Im Code:** Workflow `restore-test.yml`, GitHub-Umgebung `restore-test`,
  `scripts/backup/compare.mjs` (vorläufig)
- **Nicht verwenden:** Restore-Probe, Backup-Test
- **Abgrenzung:** _Wiederherstellen im Notfall_ ist ein Handschritt und immer Enricos Entscheidung;
  der Test berührt Produktion nie.

### Native App

Die App aus derselben Codebasis als installierte iPhone- bzw. Android-App, im Unterschied zur
Web-App im Browser und zur PWA auf dem Home-Bildschirm. Anmeldung mit dem Google-Dialog des
Systems, Sitzung im sicheren Speicher, lokaler Speicher dauerhaft auf dem Gerät (Spec 0015,
Entwurf).

- **Im Code:** `Platform.OS !== 'web'` (vorläufig)
- **Nicht verwenden:** Mobile App (meint auch die PWA), Handy-App, Native (allein)
- **Abgrenzung:** Die _PWA_ ist die Web-App vom Home-Bildschirm; sie ist keine native App, auch
  wenn ihr Gerätename „App“ enthält.

### Development Build

Eine native App mit Entwicklungswerkzeugen, gebaut für den Emulator, Simulator oder ein eigenes
Gerät, gegen die lokale Supabase. Anders als Expo Go enthält sie alle nativen Module der App, also
auch die Google-Anmeldung (Spec 0015).

- **Im Code:** EAS-Profil `development` (vorläufig)
- **Nicht verwenden:** Debug-App, Dev-Client (allein), Testversion
- **Abgrenzung:** _Expo Go_ ist die allgemeine Expo-App ohne die eigenen nativen Module; dort gibt
  es keine Google-Anmeldung.

### Nativer Fingerabdruck

Eine Prüfsumme über alles Native einer App-Version (native Module, Konfiguration). Gleicher
Fingerabdruck heißt: Ein Over-the-Air-Update passt; geänderter heißt: Die Veröffentlichung baut
eine neue App (Spec 0015, AC-047, AC-048).

- **Im Code:** `runtimeVersion` mit der Regel `fingerprint` von `expo-updates` (vorläufig)
- **Nicht verwenden:** Build-Hash, native Version, Laufzeit (allein)
- **Abgrenzung:** Die _App-Version_ (`JJJJ.M.N`) zählt jede Veröffentlichung; der Fingerabdruck
  ändert sich nur mit nativen Änderungen.

### Over-the-Air-Update

Neuer JavaScript-Stand einer Veröffentlichung, den eine installierte native App mit passendem
nativem Fingerabdruck selbst lädt, ohne neue App zu installieren. Kanal `production`; nur die
Veröffentlichung aus `main` liefert es aus (Spec 0015, REQ-009).

- **Im Code:** `expo-updates`, EAS Update, Kanal `production` (vorläufig)
- **Nicht verwenden:** OTA (in deutschen Texten), Hot-Update, Live-Update, Patch
- **Abgrenzung:** Eine _neue App_ (APK) braucht es nur bei geändertem nativem Fingerabdruck.

### Interne Verteilung

Der Weg, auf dem die Android-App ohne Store auf die Handys kommt: EAS baut eine signierte APK und
gibt einen Installations-Link, den die GitHub-Veröffentlichung nennt (Spec 0015, REQ-010,
Annahme).

- **Im Code:** EAS-Profil `production` mit `distribution: internal` (vorläufig)
- **Nicht verwenden:** Sideload (in deutschen Texten), Beta, Testkanal (meint die Play Console)
- **Abgrenzung:** Der _interne Testkanal der Play Console_ ist ein anderer Weg (Spec 0015, Offene
  Frage 4 B).
