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

Freitext an einem Einkaufsposten, z. B. „laktosefrei“.

- **Im Code:** `note`

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
