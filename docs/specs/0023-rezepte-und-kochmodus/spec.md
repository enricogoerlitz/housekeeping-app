---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-22
---

# 0023 — Rezepte bearbeiten, Kochmodus neu, Starter-Rezepte entfernt

Grundlage: Enricos Review `docs/product/review-enrico-2026-11-22.md` (ER-15, ER-16, ER-18 bis
ER-20) und das Logik-Review `docs/product/review-logik-und-bedienung.md` (E-03 bis E-09, E-11 bis
E-15). Beide sind freigegeben; bei einem Widerspruch gilt Enricos Review.

## Problem

Wer ein Rezept pflegt, stolpert an vielen kleinen Stellen. Beim Anlegen einer Zutat fragt das
Fenster zuerst nach der Menge, obwohl sie freiwillig ist und der Artikel nicht. Das ⋯ an einer
Zutat bietet nur „Artikel bearbeiten“; um die Menge zu erhöhen, muss man den ganzen Abschnitt
öffnen. Ein geöffneter Abschnitt lässt sich nicht abbrechen. Gruppen und Timer pflegt man, sieht sie
aber nicht oder kann sie nicht setzen. Ein Rezept aus dem Netz kann man nicht verlinken.

Beim Kochen wirkt ein kurzer Schritt wie eine Überschrift über einer leeren Seite, und die Zutaten
sind versteckt. Auf der Seite „Essen“ stehen Starter-Rezepte, die niemand braucht. Beim Löschen
verschwinden geplante Mahlzeiten ohne Hinweis, das Einplanen-Fenster zeigt keine Daten, und Zahlen
und Texte widersprechen sich.

## Ziel

- Eine Zutat entsteht mit dem Artikel zuerst; die Menge ist freiwillig.
- Jede Zutat lässt sich direkt aus der Leseansicht bearbeiten, mit allem, was sie hat.
- Ein geöffneter Abschnitt lässt sich mit „Abbrechen“ verlassen, ohne etwas zu speichern.
- Gruppen stehen in Lese- und Kochansicht, Timer lassen sich setzen.
- An einem Rezept stehen bis zu zehn Links zu Rezepten im Netz.
- Der Kochmodus zeigt den Schritt als ruhigen Lesetext und die Zutaten daneben oder darunter,
  ohne dass man sie erst einblenden muss.
- Die Starter-Rezepte sind aus App, Code, Daten und Dokumenten verschwunden.
- Löschen nennt die geplanten Einträge, die mitgehen; das Einplanen-Fenster zeigt Daten und
  erreicht jeden Tag.

## Nicht-Ziele

- **Keine Zuordnung von Zutaten zu Schritten.** Die Daten kennen sie nicht; der Kochmodus zeigt alle
  Zutaten der gewählten Variante (Offene Frage 3).
- **Kein Portionen-Regler im Kochmodus.** Die Portionen kommen weiter von der Rezeptseite (Spec 0018,
  REQ-002).
- **Kein Abhaken von Zutaten oder Schritten im Kochmodus**, kein Ton und keine Benachrichtigung,
  wenn ein Timer abläuft.
- **Die App lädt verlinkte Seiten nie**: keine Vorschau, kein Bild, kein Symbol der Seite, kein
  Import von Zutaten aus einem Link.
- **Kein Ersatz für die Starter-Rezepte** (kein Katalog, kein Import). Der Starter-Katalog der
  Artikel und Bereiche bleibt unverändert.
- **Keine neue Löschlogik.** Was beim Löschen eines Rezepts mit dem Kalender geschieht, bleibt wie in
  Spec 0008 (E3); neu ist nur der Hinweis.
- **Adresse, Auswahl, Fokus und Menüs** regelt Spec 0019. Was hier „steht in der Adresse“ heißt,
  bekommt seinen Namen dort.

## Konzept in Kürze

**Zutat anlegen und bearbeiten.** Das Fenster „Neue Zutat“ bzw. „Zutat bearbeiten“ beginnt mit dem
Artikel; danach kommen Menge, Einkaufsregel, Zusatz für die Liste, Hinweis fürs Kochen, Variante
und Gruppe. Das ⋯ einer Zutat beginnt überall mit „Zutat bearbeiten“, dann „Artikel bearbeiten“.
Aus der Leseansicht gespeichert wird mit „Übernehmen“ sofort, mit „Rückgängig“ im Hinweis.

**Abschnitte.** Neben „Fertig“ steht „Abbrechen“. Ein geöffneter Abschnitt rollt auf dem Handy ins
Bild.

**Links.** Ein eigener Abschnitt „Links“ unter „Notizen“ mit bis zu zehn Links. Gezeigt wird die
Bezeichnung oder der Name der Seite („chefkoch.de“); ein Tipp öffnet sie in einem neuen Tab.

**Kochmodus.** „Zurück“ und „Weiter“ bleiben unten. Oben stehen Rezept, Portionen und „Schritt 2 von
5“. Der Schritt ist großer, ruhiger Lesetext in der Schrift der Bedienung, keine Überschrift. Die
Zutaten der gewählten Variante sind von Anfang an sichtbar, nach Gruppen, in den gewählten
Portionen.

Handy (unter 700 px):

```
┌──────────────────────────────────┐
│ Kochmodus · 6 Portionen  [Fertig]│
│ Lasagne                          │
│                                  │
│ SCHRITT 2 VON 5                  │
│ Die Zwiebeln fein würfeln und in │
│ Olivenöl glasig anschwitzen.     │
│ [⏱ Timer 5 Min]                  │
│                                  │
│ Zutaten · 6 Portionen         ▴  │
│ ──────────────────────────────── │
│ 225 g   Linsen                   │
│ 3       Zwiebeln · fein gehackt  │
│ Béchamel                         │
│ 60 g    Butter                   │
│ …                                │
├──────────────────────────────────┤
│ [← Zurück]        [Weiter →]     │
└──────────────────────────────────┘
```

Desktop (ab 1100 px), Tablet wie Handy:

```
┌────────────────────────────────────────────────────────────────┐
│ Kochmodus · 6 Portionen                               [Fertig] │
│ Lasagne                                                        │
│                                                                │
│ SCHRITT 2 VON 5                     │ Zutaten · 6 Portionen    │
│ Die Zwiebeln fein würfeln und in    │ 225 g  Linsen            │
│ Olivenöl glasig anschwitzen.        │ 3      Zwiebeln · fein … │
│                                     │ Béchamel                 │
│ [⏱ Timer 5 Min]                     │ 60 g   Butter            │
│                                     │ 60 g   Mehl              │
│                                     │ …                        │
├────────────────────────────────────────────────────────────────┤
│ [← Zurück]                                         [Weiter →]  │
└────────────────────────────────────────────────────────────────┘
```

Läuft ein Timer, bleibt er beim Blättern als Chip oben sichtbar („⏱ Schritt 2 · 3:12“). Der
Bildschirm bleibt an, solange der Kochmodus offen ist und das Gerät es kann.

**Essen.** „Neu“ bietet „Rezept“, „Sammlung“ und „Restaurant“. Eine leere Seite „Essen“ bietet
„Rezept anlegen“, „Sammlung anlegen“ und, wenn die KI an ist, „Beschreiben ✨“. Löschen nennt die
geplanten Einträge, die mitgehen. Das Einplanen-Fenster zeigt unter jedem Tag das Datum und hat
„Anderes Datum …“ aus Spec 0016.

## Abhängigkeiten und kritischer Pfad

- **Spec 0008** (Rezept-Editor) und **Spec 0007** (Artikel, Einfügen): Abschnitte, Zutatenfenster,
  „Mehrere einfügen“, orange Zeilen. Diese Spec ändert sie, ersetzt sie nicht.
- **Spec 0009** (Sammlungen): „Enthält“, eigene Zutaten einer Sammlung, Zählung auf „Essen“.
- **Spec 0016** (Kalender direkt bedienen): der Baustein „Anderes Datum …“ mit Monatskalender
  (REQ-005) für das Einplanen-Fenster.
- **Spec 0018** (Welle 1): Kochmodus mit den gewählten Portionen (REQ-002), Datum im Hinweis nach
  dem Einplanen (AC-025), Zutaten beim Anlegen (REQ-001).
- **Spec 0019** (Bedienung und Adresse, entsteht parallel): Menüs, Fokus, Zustand in der Adresse
  (z. B. das offene Zutatenfenster, der Schritt im Kochmodus). Diese Spec legt keine
  Adress-Parameter fest.
- **Spec 0024** (Restaurants, entsteht parallel): Die Webseite eines Restaurants (ER-22) braucht
  dieselbe Prüfung von Web-Adressen wie die Links hier (REQ-009). Es gibt dafür genau eine Funktion
  in `packages/core`; wer zuerst baut, legt sie an. Das Einplanen-Fenster eines Restaurants (ER-21)
  sollte dieselbe Tagesauswahl wie REQ-013 nutzen.
- **Spec 0025** (Einkauf, entsteht parallel): Die neuen Einheiten (REQ-007) wirken auch beim
  Hinzufügen auf der Liste, weil beide dieselbe Erkennung nutzen. Der neue Filter „Ernährung
  unbekannt“ auf „Artikel“ (REQ-008) steht neben den Filtern, die 0025 dort ändert.
- **Spec 0028** (Aufräumen und v1): fasst die Migrationen zusammen; die hier entfallenden Objekte
  stehen unter „Daten“.
- **Kritischer Pfad:**
  - **Migration:** neue Spalte `links` an `recipes` mit Prüfung in der Datenbank, Spalte `source`
    entfällt, neuer Wert der Ernährung an Artikeln, Prüfung der Schritt-Timer.
  - **Fremde Eingaben:** Links sind Adressen, die Menschen tippen oder einfügen. Sie dürfen nie als
    Skript wirken (`javascript:`, `data:`), werden nie vom Server oder vom Gerät abgerufen und
    öffnen ohne Zugriff auf die App (`noopener`).
  - **Löschen:** nur der Hinweistext ändert sich; die Löschlogik bleibt.
  - Keine neue Tabelle, keine neue RLS. Der Plan braucht trotzdem die Risiko-Tabelle mit
    Negativtests (fremder Haushalt, abgemeldet, ungültige Eingabe, Fehlerfall) und
    `/security-check`.

## Schon erledigt

| Punkt                                              | Stand                                                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| ER-17 / E-01: Zutaten beim Anlegen gehen verloren  | Spec 0018, REQ-001; `createRecipeWithIngredients` in `packages/api/src/commands-recipes.ts`                                 |
| E-02: Kochmodus ignoriert die Portionen            | Spec 0018, REQ-002; `cookingServings`, `cookingIngredients` in `packages/core/src/cooking.ts`                               |
| E-10: Hinweis nach dem Einplanen ohne Datum        | Spec 0018, AC-025; `plannedNotice` in `packages/core/src/plan-recipe.ts`                                                    |
| Kochmodus: Wechsel auf die Rezeptseite, Fertig-Knopf | unverändert gut; „Zurück“ und „Weiter“ bleiben (ER-16), `apps/app/src/features/recipes/cooking-screen.tsx`                 |

Alle anderen Punkte dieser Spec sind am Code geprüft (Stand 22.11.2026, Branch
`docs/specs-review-welle-2`) und offen.

## Anforderungen und Akzeptanzkriterien

Beispiele: Haushalt „Enrico & Nadja“, angemeldet ist Enrico, Nadja ist vegetarisch. Heute ist
Sonntag, 22.11.2026. „Lasagne“ hat 4 Portionen und die Zutaten „150 g Linsen“, „2 Zwiebeln · fein
gehackt“ sowie in der Gruppe „Béchamel“ „40 g Butter“, „40 g Mehl“ und „500 ml Milch“. Der Artikel
„Linsen“ hat die Standard-Einkaufsregel „Rezeptmenge“. Offline-Hinweis an gesperrten Knöpfen ist
überall „Offline – zum Bearbeiten brauchst du Netz“; lehnt der Server ab, erscheint „Hat nicht
geklappt – bitte noch einmal versuchen“ und die Anzeige springt zurück (ADR-0011).

### Rezept bearbeiten

### REQ-001 — Zutat anlegen: erst der Artikel, dann die Menge

> Das Fenster „Neue Zutat“ beginnt mit dem Artikel; die Menge folgt danach und ist freiwillig.

**Quelle:** ER-18

**Offline:** nur online, wie das Bearbeiten des Abschnitts „Zutaten“ (Spec 0008, REQ-008).

**Regeln:**

- Reihenfolge im Fenster und für die Tab-Taste: Artikel, Menge, Einkaufsregel, Zusatz für die
  Liste, Hinweis fürs Kochen, Variante (nur bei Rezepten mit Varianten), Gruppe, „Übernehmen“.
- Beim Öffnen hat das Artikelfeld den Fokus. Ist ein Artikel gewählt (Tipp, Enter oder „„…“ neu
  anlegen“), springt der Fokus in „Menge“. Enter in „Menge“ wählt „Übernehmen“.
- Das Feld heißt „Menge“ mit dem Platzhalter „freiwillig, z. B. 400 ml“. Darunter steht, ob die
  Menge mit den Portionen umgerechnet wird: „Wird mit den Portionen umgerechnet“ oder „Bleibt beim
  Umrechnen gleich“; ohne Eingabe steht dort nichts.
- Das ist die einzige Stelle mit getrennten Feldern. „Mehrere einfügen“ und „Zutaten einfügen“ beim
  Anlegen nehmen weiter Zeilen in der gewohnten Schreibweise „200 ml Kokosmilch“.

**AC-001 — Artikel zuerst, mit Tastatur**

```gherkin
Angenommen  der Abschnitt „Zutaten“ von „Lasagne“ ist offen
Wenn        ich „+ Zutat“ wähle
Dann        öffnet sich „Neue Zutat“, das Feld „Artikel“ steht oben und hat den Fokus
Und         darunter steht „Menge“ mit dem Platzhalter „freiwillig, z. B. 400 ml“
Wenn        ich „Muskat“ tippe und den Treffer „Muskatnuss“ mit Enter wähle
Dann        steht der Fokus in „Menge“
Wenn        ich „1 Prise“ tippe
Dann        steht unter „Menge“ „Bleibt beim Umrechnen gleich“
Wenn        ich Enter drücke
Dann        schließt das Fenster und der Abschnitt zeigt die Zeile „1 Prise Muskatnuss“
```

**AC-002 — ohne Menge**

```gherkin
Angenommen  „Neue Zutat“ ist offen
Wenn        ich den Artikel „Salz“ wähle, „Menge“ leer lasse und „Übernehmen“ wähle
Dann        steht im Abschnitt die Zeile „Salz“ ohne Menge
Und         nach „Fertig“ zeigt die Rezeptseite „Salz“ ohne Mengenangabe davor
```

**AC-003 — Fehlerfall: Menge ohne Artikel**

```gherkin
Angenommen  „Neue Zutat“ ist offen und kein Artikel ist gewählt
Wenn        ich in „Menge“ „400 ml“ tippe und „Übernehmen“ wähle
Dann        bleibt das Fenster offen, am Artikelfeld steht „Artikel wählen“ und es hat den Fokus
Und         in „Menge“ steht weiter „400 ml“
```

### REQ-002 — Zutat bearbeiten aus dem ⋯

> Das ⋯ jeder Zutat beginnt mit „Zutat bearbeiten“; das Fenster zeigt alles, was eine Zutat hat,
> und speichert aus der Leseansicht sofort.

**Quelle:** ER-19

**Offline:** nur online. Offline sind „Zutat bearbeiten“, „Artikel bearbeiten“ und „Entfernen“ im ⋯
ausgegraut mit dem Offline-Hinweis; „Ist alle“ bleibt, wie es ist.

**Regeln:**

- **⋯ in der Leseansicht:** „Zutat bearbeiten“, „Artikel bearbeiten“, „Entfernen“. „Ist alle“ bleibt
  das Symbol neben dem ⋯.
- **⋯ im offenen Abschnitt:** „Zutat bearbeiten“, „Artikel bearbeiten“, „Nach oben“, „Nach unten“,
  „Entfernen“. „Artikel bearbeiten“ ist ausgegraut, solange der Artikel erst mit „Fertig“ entsteht
  („neu“).
- **Das Fenster „Zutat bearbeiten“** ist das Fenster aus REQ-001 mit den Werten der Zutat:
  - Artikel mit „Ändern“, Menge (die gespeicherte Rezeptangabe, nicht die umgerechnete), darunter
    „für 4 Portionen“;
  - Einkaufsregel „Anzahl · Rezeptmenge · nicht übernehmen“;
  - Zusatz für die Liste, Hinweis fürs Kochen;
  - Variante „Basis“ oder eine Variante (nur bei Rezepten mit Varianten);
  - Gruppe, mit den Gruppen des Rezepts als Vorschläge zum Antippen.
- **Speichern:** Aus der Leseansicht speichert „Übernehmen“ nur diese Zutat sofort und zeigt
  „Zutat gespeichert“ mit „Rückgängig“ für 5 Sekunden. Ist gerade ein anderer Abschnitt offen, wird
  er vorher gespeichert wie bei einem anderen Stift (Spec 0008, REQ-007). Im offenen Abschnitt
  ändert „Übernehmen“ nur den Entwurf; „Fertig“ speichert wie bisher.
- **„Entfernen“ in der Leseansicht** entfernt die Zutat sofort mit „Linsen entfernt“ und
  „Rückgängig“.
- Eine Sammlung hat für ihre eigenen Zutaten dasselbe ⋯ ohne „Variante“ (Spec 0009, AC-012).

**AC-004 — Menge erhöhen ohne den Abschnitt zu öffnen**

```gherkin
Angenommen  „Lasagne“ ist offen, kein Abschnitt wird bearbeitet
Wenn        ich das ⋯ bei „Linsen“ öffne
Dann        stehen dort in dieser Reihenfolge „Zutat bearbeiten“, „Artikel bearbeiten“, „Entfernen“
Wenn        ich „Zutat bearbeiten“ wähle
Dann        zeigt das Fenster „Zutat bearbeiten“ den Artikel „Linsen“, die Menge „150 g“ mit
            „für 4 Portionen“ und die Einkaufsregel „Rezeptmenge“
Wenn        ich die Menge auf „200 g“ ändere und „Übernehmen“ wähle
Dann        steht unter „Zutaten“ „200 g Linsen“, ohne dass der Abschnitt offen war
Und         der Hinweis „Zutat gespeichert“ bietet „Rückgängig“
Und         Nadja sieht „200 g Linsen“ auf ihrem Gerät, ohne neu zu laden
```

**AC-005 — umgerechnete Anzeige, gespeicherte Menge**

```gherkin
Angenommen  auf der Seite von „Lasagne“ ist „6 Portionen“ gewählt, sie zeigt „225 g Linsen“
Wenn        ich bei „Linsen“ „Zutat bearbeiten“ wähle
Dann        steht in „Menge“ „150 g“ und darunter „für 4 Portionen“
```

**AC-006 — Gruppe, Zusatz und Rückgängig**

```gherkin
Angenommen  ich bearbeite die Zutat „Linsen“ aus der Leseansicht
Wenn        ich als Gruppe den Vorschlag „Béchamel“ antippe, als Zusatz „rot“ eintrage und
            „Übernehmen“ wähle
Dann        steht „Linsen“ unter der Überschrift „Béchamel“
Wenn        ich im Hinweis „Rückgängig“ wähle
Dann        steht „Linsen“ wieder ohne Gruppe und ohne Zusatz da
```

**AC-007 — Menü im offenen Abschnitt**

```gherkin
Angenommen  der Abschnitt „Zutaten“ von „Lasagne“ ist offen
Wenn        ich das ⋯ der Zeile „150 g Linsen“ öffne
Dann        stehen dort in dieser Reihenfolge „Zutat bearbeiten“, „Artikel bearbeiten“,
            „Nach oben“, „Nach unten“, „Entfernen“
```

**AC-008 — Offline**

```gherkin
Angenommen  das Gerät ist offline und „Lasagne“ ist offen
Wenn        ich das ⋯ bei „Linsen“ öffne
Dann        sind „Zutat bearbeiten“, „Artikel bearbeiten“ und „Entfernen“ ausgegraut
Und         sie nennen „Offline – zum Bearbeiten brauchst du Netz“
```

**AC-009 — Fehlerfall: Server lehnt ab**

```gherkin
Angenommen  Nadja hat „Lasagne“ gerade gelöscht, mein Gerät zeigt sie noch
Wenn        ich bei „Linsen“ die Menge auf „200 g“ ändere und „Übernehmen“ wähle
Dann        erscheint „Hat nicht geklappt – bitte noch einmal versuchen“
Und         danach zeigt die Seite „Dieses Rezept gibt es nicht mehr“ (Spec 0008, AC-021)
```

### REQ-003 — Abschnitt abbrechen und ins Bild rollen

> Ein offener Abschnitt hat neben „Fertig“ ein „Abbrechen“, das den Entwurf verwirft; auf dem Handy
> rollt ein geöffneter Abschnitt ins Bild.

**Quelle:** E-04, E-15

**Offline:** „Abbrechen“ geht immer, auch offline; Öffnen und „Fertig“ bleiben nur online.

**Regeln:**

- „Abbrechen“ steht links neben „Fertig“, als Zweitknopf. Es schließt den Abschnitt ohne zu
  speichern; die Seite zeigt den gespeicherten Stand. Keine Rückfrage.
- Escape im offenen Abschnitt wirkt wie „Abbrechen“, wenn kein Fenster und kein Menü darüber offen
  ist. Die Android-Zurück-Taste speichert weiter (Spec 0008, E16).
- Ein anderer Stift oder das Verlassen der Seite speichert den Abschnitt weiter wie mit „Fertig“
  (Spec 0008, Offene Frage 1).
- Auf dem Handy rollt die Seite nach dem Öffnen so, dass der Kopf des Abschnitts mit „Abbrechen“
  und „Fertig“ oben im Bild steht. Steht er schon ganz im Bild, rollt nichts. Bei „Bewegung
  reduzieren“ springt die Seite ohne Animation.

**AC-010 — Abbrechen verwirft**

```gherkin
Angenommen  ich bearbeite die Zubereitung von „Lasagne“ und habe Schritt 3 entfernt
Wenn        ich „Abbrechen“ wähle
Dann        ist der Abschnitt zu und Schritt 3 steht wieder da
Und         es ging nichts an den Server
```

**AC-011 — Escape**

```gherkin
Angenommen  am Desktop ist der Kopf von „Lasagne“ offen und ich habe den Titel in „Lasagne neu“
            geändert
Wenn        ich Escape drücke
Dann        ist der Abschnitt zu und der Titel heißt „Lasagne“
```

**AC-012 — Rand: Fenster über dem Abschnitt**

```gherkin
Angenommen  im offenen Abschnitt „Zutaten“ ist „Zutat bearbeiten“ offen
Wenn        ich Escape drücke
Dann        schließt nur das Fenster, der Abschnitt bleibt mit seinem Entwurf offen
```

**AC-013 — Handy: Abschnitt rollt ins Bild**

```gherkin
Angenommen  Handybreite, die Seite „Lasagne“ ist ganz nach oben gerollt
Wenn        ich den Stift bei „Zutaten“ wähle
Dann        steht der Kopf des Abschnitts „Zutaten“ mit „Abbrechen“ und „Fertig“ oben im Bild
```

### REQ-004 — Gruppen in Lese- und Kochansicht

> Zutaten mit einer Gruppe stehen in Leseansicht und Kochmodus unter der Überschrift ihrer Gruppe.

**Quelle:** E-05

**Offline:** offline vollständig (nur Anzeige).

**Regeln:**

- Zuerst stehen die Zutaten ohne Gruppe, ohne Überschrift. Danach folgt jede Gruppe in der
  Reihenfolge, in der sie im Rezept zuerst vorkommt, mit ihren Zutaten in Rezept-Reihenfolge.
- Gruppen gleichen Namens werden zusammengefasst; Groß- und Kleinschreibung und Leerzeichen am Rand
  zählen nicht. Die Überschrift schreibt den Namen wie die erste Zutat der Gruppe.
- Gilt für Rezepte, Varianten (nur die Zutaten der gewählten Variante) und die eigenen Zutaten
  einer Sammlung. Im offenen Abschnitt bleibt die Liste flach zum Verschieben; die Gruppe steht dort
  wie bisher unter der Zeile.
- Eine Gruppe hat höchstens 60 Zeichen; mehr zeigt das Fenster als „Höchstens 60 Zeichen“.

**AC-014 — Leseansicht**

```gherkin
Angenommen  „Lasagne“ ist offen
Dann        stehen unter „Zutaten“ zuerst „150 g Linsen“ und „2 Zwiebeln · fein gehackt“ ohne
            Überschrift
Und         danach die Überschrift „Béchamel“ mit „40 g Butter“, „40 g Mehl“ und „500 ml Milch“
```

**AC-015 — Rand: Gruppen durcheinander eingegeben**

```gherkin
Angenommen  ein Rezept hat in dieser Reihenfolge „Butter“ (Gruppe „Béchamel“), „Salz“ (ohne
            Gruppe) und „Milch“ (Gruppe „béchamel “)
Dann        zeigt die Leseansicht „Salz“ ohne Überschrift
Und         darunter eine Überschrift „Béchamel“ mit „Butter“ und „Milch“
```

**AC-016 — Rand: keine Gruppen**

```gherkin
Angenommen  „Shakshuka“ hat Zutaten ohne Gruppe
Dann        zeigt die Leseansicht eine Liste ohne Überschrift, wie bisher
```

### REQ-005 — Timer eines Schritts setzen

> Jeder Schritt hat ein freiwilliges Feld „Timer (Min)“, das den Timer im Kochmodus setzt.

**Quelle:** E-06

**Offline:** nur online (Bearbeiten der Zubereitung).

**Regeln:** Das Fenster eines Schritts heißt „Schritt“ bzw. „Neuer Schritt“ und hat „Text“ und
„Timer (Min)“. Erlaubt sind ganze Minuten von 1 bis 600; leer heißt kein Timer. Die Leseansicht
zeigt den Timer wie bisher als „⏱ 15 Min“ am Schritt.

**AC-017 — Timer setzen**

```gherkin
Angenommen  die Zubereitung von „Lasagne“ ist offen
Wenn        ich Schritt 4 „Im Ofen backen“ öffne, „Timer (Min)“ auf „35“ setze, „Übernehmen“ und
            „Fertig“ wähle
Dann        steht an Schritt 4 „⏱ 35 Min“
Und         im Kochmodus zeigt Schritt 4 den Timer „Timer 35 Min“
```

**AC-018 — Fehlerfall: ungültige Minuten**

```gherkin
Angenommen  das Fenster „Schritt“ ist offen
Wenn        ich in „Timer (Min)“ „0“, „601“ oder „1,5“ eingebe und „Übernehmen“ wähle
Dann        bleibt das Fenster offen und das Feld zeigt „1 bis 600 Minuten“
```

**AC-019 — Timer entfernen**

```gherkin
Angenommen  Schritt 4 hat den Timer 35 Minuten
Wenn        ich „Timer (Min)“ leere, „Übernehmen“ und „Fertig“ wähle
Dann        hat Schritt 4 keinen Timer, weder auf der Seite noch im Kochmodus
```

### REQ-006 — Einfügen: sagen, was gespeichert ist, Dubletten markieren

> Nach „Fertig“ mit offenen Zeilen sagt der Abschnitt, wie viele Zutaten gespeichert sind und was
> noch offen ist; eingefügte Zeilen, deren Artikel schon im Rezept steht, sind markiert und werden
> erst nach einer Entscheidung gespeichert.

**Quelle:** E-08

**Offline:** nur online (Bearbeiten der Zutaten).

**Regeln:**

- Eine eingefügte Zeile ist eine **Dublette**, wenn ihr Artikel im Rezept schon als Zutat derselben
  Variante steht (bei Rezepten ohne Varianten: überhaupt) oder weiter oben im selben eingefügten
  Text vorkommt. Die Menge spielt keine Rolle.
- Eine Dublette steht wie eine orange Zeile oben im Abschnitt, mit „Steht schon im Rezept“ und den
  Knöpfen „Weglassen“ und „Trotzdem hinzufügen“. Bis zur Entscheidung wird sie nicht gespeichert,
  auch nicht beim Verlassen der Seite.
- „Fertig“ speichert alle fertigen Zeilen. Bleiben offene Zeilen, bleibt der Abschnitt offen und
  sagt, was geschah, in einem Satz aus diesen Teilen, durch „·“ getrennt: „5 Zutaten gespeichert“
  (nur wenn etwas gespeichert wurde), „2 brauchen noch einen Artikel“, „1 steht schon im Rezept“.
  Ohne gespeicherte Zeilen beginnt der Satz mit „2 Zutaten brauchen noch einen Artikel“ (wie
  bisher, Spec 0008, AC-032).
- Dasselbe gilt für „Zutaten einfügen“ beim Anlegen eines Rezepts; dort gibt es nur Dubletten
  innerhalb des eingefügten Texts.

**AC-020 — Was gespeichert ist**

```gherkin
Angenommen  im Abschnitt „Zutaten“ von „Linsen-Dal“ habe ich 7 Zeilen eingefügt
Und         „1 TL Bockshornklee“ und „1 Stück Galgant“ stehen orange mit „Artikel wählen“
Wenn        ich „Fertig“ wähle
Dann        sind die 5 anderen Zutaten gespeichert
Und         der Abschnitt bleibt offen mit „5 Zutaten gespeichert · 2 brauchen noch einen Artikel“
```

**AC-021 — Dublette weglassen**

```gherkin
Angenommen  „Mango-Curry“ hat die Zutat „400 ml Kokosmilch“
Wenn        ich „400 ml Kokosmilch“ und „1 Mango“ einfüge
Dann        steht „400 ml Kokosmilch“ oben mit „Steht schon im Rezept“, „Weglassen“ und
            „Trotzdem hinzufügen“
Wenn        ich „Fertig“ wähle
Dann        ist „Mango“ gespeichert und der Abschnitt sagt „1 Zutat gespeichert · 1 steht schon im
            Rezept“
Wenn        ich „Weglassen“ und dann „Fertig“ wähle
Dann        ist der Abschnitt zu und „Kokosmilch“ steht genau einmal im Rezept
Und         „Mango-Curry“ für 2 Portionen bringt auf die Liste „400 ml Kokosmilch“, nicht 800 ml
```

**AC-022 — Trotzdem hinzufügen**

```gherkin
Angenommen  die Dublette „400 ml Kokosmilch“ steht oben im Abschnitt
Wenn        ich „Trotzdem hinzufügen“ und „Fertig“ wähle
Dann        hat „Mango-Curry“ „Kokosmilch“ zweimal
```

**AC-023 — Rand: Dublette im eingefügten Text beim Anlegen**

```gherkin
Angenommen  ich lege „Zwiebelkuchen“ an und füge „1 Zwiebel“ und „2 Zwiebeln“ ein
Wenn        ich „Anlegen“ wähle
Dann        hat das Rezept „1 Zwiebel“
Und         der Abschnitt „Zutaten“ öffnet sich mit „2 Zwiebeln“ und „Steht schon im Rezept“
```

### REQ-007 — Mehr Einheiten und Adjektive erkennen

> Die Erkennung von Mengen kennt weitere Einheiten und überspringt Größenangaben vor der Einheit
> oder dem Artikel.

**Quelle:** E-09

**Offline:** wie die Stelle, an der getippt wird (Zutaten: nur online). Die Erkennung selbst läuft
auf dem Gerät.

**Regeln:**

- **Neue Einheiten** (Schreibweise → gespeicherte Einheit, Mehrzahl in der Anzeige):

  | Geschrieben                                  | Einheit   | Mehrzahl  | zählbar (ganze Stück beim Einkaufen) |
  | -------------------------------------------- | --------- | --------- | ------------------------------------ |
  | Flasche, Flaschen                            | Flasche   | Flaschen  | ja                                   |
  | Tüte, Tüten                                  | Tüte      | Tüten     | ja                                   |
  | Beutel                                       | Beutel    | Beutel    | ja                                   |
  | Netz, Netze                                  | Netz      | Netze     | ja                                   |
  | Würfel                                       | Würfel    | Würfel    | ja                                   |
  | Rolle, Rollen                                | Rolle     | Rollen    | ja                                   |
  | Tafel, Tafeln                                | Tafel     | Tafeln    | ja                                   |
  | Kopf, Köpfe                                  | Kopf      | Köpfe     | ja                                   |
  | Knolle, Knollen                              | Knolle    | Knollen   | ja                                   |
  | Zweig, Zweige                                | Zweig     | Zweige    | ja                                   |
  | Blatt, Blätter                               | Blatt     | Blätter   | ja                                   |
  | Päckchen                                     | Päckchen  | Päckchen  | ja                                   |
  | Pck., Pck, Pkg., Pkg                         | Packung   | Packungen | ja                                   |
  | Gläser (Mehrzahl zu Glas)                    | Glas      | Gläser    | ja                                   |
  | Liter                                        | l         | l         | nein (eine Nachkommastelle)          |
  | Gramm                                        | g         | g         | nein                                 |
  | Kilo, Kilogramm                              | kg        | kg        | nein                                 |
  | Milliliter                                   | ml        | ml        | nein                                 |
  | el, Esslöffel / tl, Teelöffel                | EL / TL   | EL / TL   | nein (zwei Nachkommastellen)         |

  Groß- und Kleinschreibung zählt bei diesen Schreibweisen nicht. Bestehende Einheiten bleiben.
- **Größenangaben** „klein“, „mittelgroß“, „groß“, „gehäuft“, „gestrichen“ in jeder Endung
  („kleine“, „großer“, „gehäuftes“ …) zwischen Zahl und Einheit oder zwischen Zahl und Artikel
  gehören zur Menge. Beim Umrechnen bleibt die Angabe: bei genau 1 so, wie sie geschrieben ist,
  sonst mit der Endung „-e“ („2 kleine Dosen“, „2 gehäufte EL“, „3 große“).
- Die Erkennung ist dieselbe für Zutaten und für das Hinzufügen auf der Liste.

**AC-024 — Größenangabe vor der Einheit**

```gherkin
Angenommen  ich füge im Abschnitt „Zutaten“ eines Rezepts für 2 Portionen „1 kleine Dose Mais“ ein
Dann        hat die Zeile den Artikel „Mais“ und die Menge „1 kleine Dose“, nicht orange
Wenn        ich nach „Fertig“ auf der Seite 4 Portionen wähle
Dann        steht dort „2 kleine Dosen Mais“
```

**AC-025 — neue Einheiten**

```gherkin
Wenn        ich „1 Flasche Weißwein“, „2 tl Zucker“, „0,5 Liter Brühe“ und „1 Pck. Backpulver“
            einfüge
Dann        entstehen die Zutaten „Weißwein“ mit „1 Flasche“, „Zucker“ mit Einheit „TL“, „Brühe“ mit
            Einheit „l“ und „Backpulver“ mit Einheit „Packung“
Und         kein Artikel heißt „Flasche Weißwein“
```

**AC-026 — Größenangabe ohne Einheit**

```gherkin
Wenn        ich „2 große Zwiebeln“ in ein Rezept für 2 Portionen einfüge
Dann        hat die Zeile den Artikel „Zwiebeln“ und die Menge „2 große“
Und         bei 3 Portionen zeigt die Seite „3 große Zwiebeln“
```

**AC-027 — Rand: Wort ist keine Einheit**

```gherkin
Wenn        ich „2 Würfelzucker“ einfüge
Dann        ist „Würfelzucker“ der Artikel und „2“ die Menge
```

### REQ-008 — Ernährung „kein Lebensmittel“ und der Grund für „unbekannt“

> Artikel können die Ernährung „kein Lebensmittel“ haben, die beim Ableiten der Ernährung von
> Rezepten, Varianten und Sammlungen nicht zählt; steht ein Rezept auf „unbekannt“, nennt die
> Rezeptseite die Artikel, die das verursachen.

**Quelle:** E-07

**Offline:** Anzeige und Gründe offline vollständig; „Artikel bearbeiten“ und Festlegen nur online.

**Regeln:**

- Die Ernährung eines Artikels hat die Werte „vegan“, „vegetarisch“, „mit Fisch“, „mit Fleisch“,
  „kein Lebensmittel“ und „unbekannt“; neue Artikel starten weiter mit „unbekannt“.
- Beim Ableiten (Rezept, Variante, Sammlung, „Passt für alle“, Filter, Vorauswahl der Varianten im
  Kalender) werden Zutaten mit „kein Lebensmittel“ übersprungen. Hat ein Rezept nur solche Zutaten,
  gilt es als „unbekannt“ und zeigt keinen Chip, wie ein Rezept ohne Zutaten.
- Im Starter-Katalog stehen alle Einträge der Bereiche „Drogerie & Hygiene“, „Haushalt &
  Reinigung“, „Tierbedarf“ und „Sonstiges“ sowie „Kaffeefilter“ auf „kein Lebensmittel“. Lebensmittel
  ohne feste Ernährung („Tortellini“, „Maultaschen“, „Tiefkühlpizza“) bleiben „unbekannt“.
- Der Chip „unbekannt“ auf der Rezeptseite ist ein Knopf. Er öffnet ein kleines Fenster „Warum
  unbekannt?“ mit dem Satz „Bei diesen Zutaten fehlt die Ernährung:“ und je Artikel einer Zeile mit
  „Festlegen“, das „Artikel bearbeiten“ öffnet. Nach dem Speichern dort ist der Chip neu berechnet.
- Die Seite „Artikel“ bekommt den Filter „Ernährung unbekannt (n)“; er steht wie die anderen Filter
  in der Adresse (Spec 0019).

**AC-028 — Non-Food zählt nicht**

```gherkin
Angenommen  „Grillgemüse“ hat die Zutaten „Zucchini“, „Paprika“, „Olivenöl“ (alle vegan) und
            „Grillkohle“ mit „kein Lebensmittel“
Dann        zeigt „Grillgemüse“ den Chip „vegan“
Und         der Schnell-Chip „Vegan“ auf „Essen“ findet „Grillgemüse“
Und         im Einplanen-Fenster steht für Nadja kein „Passt nicht für Nadja“
```

**AC-029 — Grund am Chip und festlegen**

```gherkin
Angenommen  „Grillgemüse“ hat zusätzlich den neuen Artikel „Grillanzünder“ mit „unbekannt“
Dann        zeigt die Seite den Chip „unbekannt“
Wenn        ich ihn antippe
Dann        öffnet „Warum unbekannt?“ mit „Bei diesen Zutaten fehlt die Ernährung:“ und der Zeile
            „Grillanzünder“ mit „Festlegen“
Wenn        ich „Festlegen“ wähle, im Fenster „Artikel bearbeiten“ „kein Lebensmittel“ setze und
            speichere
Dann        zeigt „Grillgemüse“ den Chip „vegan“
```

**AC-030 — Starter-Katalog**

```gherkin
Angenommen  ein neuer Haushalt „WG Köln“ wird angelegt
Dann        haben dort „Backpapier“, „Grillkohle“ und „Spülmittel“ die Ernährung „kein Lebensmittel“
Und         „Tortellini“ hat „unbekannt“
```

**AC-031 — Rand: nur Non-Food**

```gherkin
Angenommen  ein Rezept „Ofen vorbereiten“ hat nur die Zutat „Backpapier“ („kein Lebensmittel“)
Dann        zeigt seine Seite keinen Ernährungs-Chip
Und         der Schnell-Chip „Vegan“ findet es nicht
```

**AC-032 — Filter auf „Artikel“ und Offline**

```gherkin
Angenommen  3 Artikel des Haushalts haben „unbekannt“
Wenn        ich auf „Artikel“ den Filter „Ernährung unbekannt (3)“ wähle
Dann        stehen genau diese 3 Artikel da
Angenommen  das Gerät ist offline
Wenn        ich auf „Grillgemüse“ den Chip „unbekannt“ antippe
Dann        öffnet „Warum unbekannt?“, und „Festlegen“ ist ausgegraut mit dem Offline-Hinweis
```

### Links

### REQ-009 — Links zu Rezepten im Netz

> Ein Rezept oder eine Sammlung hat einen Abschnitt „Links“ mit bis zu zehn Web-Adressen, jede mit
> freiwilliger Bezeichnung; ein Tipp öffnet die Seite in einem neuen Tab.

**Quelle:** ER-20

**Offline:** Lesen und Öffnen offline (die Seite selbst lädt dann der Browser nicht); Bearbeiten nur
online.

**Regeln:**

- **Ort:** ein eigener Abschnitt der Rezeptseite „Links“ unter „Notizen“, mit Stift, „Abbrechen“
  und „Fertig“ wie die anderen (REQ-003). Ohne Links steht dort „Noch keine Links.“
- **Lesen:** je Link eine Zeile. Mit Bezeichnung: die Bezeichnung, darunter der Name der Seite;
  ohne: nur der Name der Seite. Der Name der Seite ist der Host ohne „www.“ („chefkoch.de“), so wie
  der Browser ihn aus der Adresse liest. Die Zeile hat ein Symbol „öffnet extern“.
- **Öffnen:** in einem neuen Tab bzw. im Browser des Systems, ohne Zugriff der Seite auf die App
  (`noopener`, `noreferrer`). Die App bleibt, wo sie war.
- **Bearbeiten:** Zeilen mit ⋯ („Bearbeiten“, „Nach oben“, „Nach unten“, „Entfernen“) und
  „+ Link“. Das Fenster „Link“ hat „Adresse“ (Pflicht) und „Bezeichnung (freiwillig)“.
- **Prüfung** auf dem Gerät beim „Übernehmen“ und in der Datenbank beim Speichern:
  - Leerzeichen am Rand fallen weg. Eine Adresse ohne „://“ bekommt „https://“ vorangestellt
    („chefkoch.de/r/1“ → „https://chefkoch.de/r/1“).
  - Erlaubt sind nur `http://` und `https://` mit einem Host; keine Leerzeichen und keine
    Steuerzeichen in der Adresse; höchstens 2000 Zeichen.
  - Bezeichnung höchstens 80 Zeichen, ohne Steuerzeichen; leer heißt keine Bezeichnung.
  - Höchstens 10 Links je Rezept; dieselbe Adresse nur einmal.
  - Meldungen: „Nur Adressen mit http:// oder https://“, „Keine gültige Adresse“, „Höchstens 2000
    Zeichen“, „Höchstens 80 Zeichen“, „Diesen Link gibt es schon“, „Höchstens 10 Links“.
- **Die App ruft die Seite nie ab**, weder das Gerät noch der Server, und zeigt nichts von ihr an.
  Ein Link, der die Prüfung auf dem Gerät nicht besteht (Daten von außen), erscheint als Text ohne
  Tipp-Ziel.

**AC-033 — Link anlegen und öffnen**

```gherkin
Angenommen  „Lasagne“ hat keine Links
Wenn        ich bei „Links“ den Stift, dann „+ Link“ wähle
Und         als Adresse „https://www.chefkoch.de/rezepte/123/lasagne.html“ eingebe, „Übernehmen“ und
            „Fertig“ wähle
Dann        zeigt „Links“ die Zeile „chefkoch.de“
Wenn        ich sie antippe
Dann        öffnet sich „https://www.chefkoch.de/rezepte/123/lasagne.html“ in einem neuen Tab
Und         die App zeigt weiter „Lasagne“
```

**AC-034 — Bezeichnung und Adresse ohne https**

```gherkin
Wenn        ich als Adresse „chefkoch.de/r/1“ und als Bezeichnung „Omas Variante“ eintrage und
            speichere
Dann        ist „https://chefkoch.de/r/1“ gespeichert
Und         die Zeile zeigt „Omas Variante“ und darunter „chefkoch.de“
Und         Nadja sieht den Link auf ihrem Gerät, ohne neu zu laden
```

**AC-035 — Fehlerfall: gefährliche oder kaputte Adressen**

```gherkin
Angenommen  das Fenster „Link“ ist offen
Wenn        ich „javascript:alert(1)“, „data:text/html,hallo“ oder „ftp://server/datei“ eintrage und
            „Übernehmen“ wähle
Dann        bleibt das Fenster offen mit „Nur Adressen mit http:// oder https://“
Wenn        ich „https://“ oder „https://chef koch.de“ eintrage
Dann        zeigt das Feld „Keine gültige Adresse“
Und         es wurde nichts gespeichert
```

**AC-036 — Grenzen**

```gherkin
Angenommen  „Lasagne“ hat 10 Links und „Links“ ist offen
Dann        ist „+ Link“ ausgegraut mit „Höchstens 10 Links“
Angenommen  „Lasagne“ hat den Link „https://chefkoch.de/r/1“
Wenn        ich dieselbe Adresse noch einmal eintrage
Dann        zeigt das Feld „Diesen Link gibt es schon“
```

**AC-037 — Datenbank prüft selbst**

```gherkin
Angenommen  ein Mitglied schreibt an der App vorbei direkt in die Datenbank
Wenn        es an „Lasagne“ den Link „javascript:alert(1)“, eine Adresse mit 2001 Zeichen, eine
            Bezeichnung mit 81 Zeichen oder 11 Links speichern will
Dann        lehnt die Datenbank ab und „Lasagne“ bleibt unverändert
Angenommen  im lokalen Speicher steht trotzdem ein Link „javascript:alert(1)“
Dann        zeigt die Rezeptseite ihn als Text ohne Tipp-Ziel
```

**AC-038 — Offline und fremder Haushalt**

```gherkin
Angenommen  das Gerät ist offline
Dann        zeigt „Lasagne“ ihre Links, und der Stift bei „Links“ ist ausgegraut mit dem
            Offline-Hinweis
Angenommen  Mitglieder eines anderen Haushalts
Dann        sehen und ändern sie die Links von „Lasagne“ nicht (wie alle Felder eines Rezepts)
```

### Kochmodus

### REQ-010 — Kochmodus: Schritt als Lesetext, Zutaten sichtbar

> Der Kochmodus zeigt den Schritt als großen, ruhigen Lesetext mit Schrittzähler und die Zutaten der
> gewählten Variante in den gewählten Portionen von Anfang an: am Desktop neben dem Schritt, auf
> Handy und Tablet darunter in einem Bereich, der offen beginnt und sich zuklappen lässt.

**Quelle:** ER-16, E-05 (Gruppen)

**Offline:** offline vollständig (nur Anzeige und Timer auf dem Gerät).

**Regeln:**

- **Bleibt:** „Zurück“ und „Weiter“ unten, am letzten Schritt „Fertig“; oben „Kochmodus · <Variante>
  · 6 Portionen“, der Titel und „Fertig“ (Spec 0005, D5; Spec 0018, AC-004).
- **Schritt:** darüber „Schritt 2 von 5“. Der Text steht in der Schrift der Bedienung, nicht in der
  Titelschrift, mindestens 20 pt auf dem Handy und 26 pt am Desktop, mit großzügigem
  Zeilenabstand, linksbündig, höchstens etwa 60 Zeichen je Zeile. Für Screenreader ist er keine
  Überschrift.
- **Zutaten:** alle Zutaten der gewählten Variante (die Daten kennen keine Zuordnung zu Schritten),
  umgerechnet auf die gewählten Portionen, nach Gruppen wie REQ-004, mit Menge vorn und Hinweis
  hinter „·“. Kopf: „Zutaten · 6 Portionen“.
  - **Desktop (ab 1100 px):** rechts neben dem Schritt, immer sichtbar; eine lange Liste rollt für
    sich.
  - **Handy und Tablet:** unter dem Schritt. Der Kopf ist ein Knopf zum Zu- und Aufklappen; der
    Bereich beginnt offen und bleibt beim Blättern so, wie man ihn gelassen hat. Beim nächsten
    Öffnen des Kochmodus ist er wieder offen.
  - Ohne Zutaten gibt es keinen Bereich.
- **Timer:** Ein Schritt mit Timer zeigt unter dem Text den Chip „Timer 35 Min“ (Start, Pause,
  Zurücksetzen wie bisher). Ein laufender oder abgelaufener Timer eines anderen Schritts steht oben
  als Chip „⏱ Schritt 4 · 34:58“ bzw. „⏱ Schritt 4 · abgelaufen“; ein Tipp darauf zeigt Schritt 4.
  Mehrere Timer können gleichzeitig laufen. Verlässt man den Kochmodus, enden alle Timer.
- **Bildschirm bleibt an:** Solange der Kochmodus offen und sichtbar ist, bittet die App das Gerät,
  den Bildschirm nicht abzuschalten; beim Verlassen gibt sie das frei, und nach dem Zurückkehren in
  den Tab bittet sie erneut. Kann das Gerät es nicht oder lehnt es ab, passiert nichts und es
  erscheint kein Hinweis.
- **Tastatur:** Pfeil rechts wirkt wie „Weiter“, Pfeil links wie „Zurück“; am letzten Schritt tut
  Pfeil rechts nichts.
- **Ohne Schritte:** „Noch keine Schritte“ wie bisher; die Zutaten stehen trotzdem da.

**AC-039 — Kurzer Schritt auf dem Handy**

```gherkin
Angenommen  Handybreite, „Lasagne“ ist auf 6 Portionen gestellt, Schritt 2 heißt „Zwiebeln würfeln.“
Wenn        ich „Kochen“ wähle und dann „Weiter“
Dann        steht oben „Schritt 2 von 5“
Und         „Zwiebeln würfeln.“ steht in der Schrift der Bedienung mit mindestens 20 pt und ist keine
            Überschrift
Und         darunter ist der Bereich „Zutaten · 6 Portionen“ offen und zeigt „225 g Linsen“, ohne
            dass ich etwas eingeblendet habe
```

**AC-040 — Desktop: Zutaten neben dem Schritt**

```gherkin
Angenommen  ein Fenster mit 1440 px Breite und der Kochmodus von „Lasagne“ mit 4 Portionen
Dann        stehen die Zutaten rechts neben dem Schritt
Und         nach „Weiter“ stehen sie weiter dort
```

**AC-041 — Zuklappen bleibt beim Blättern**

```gherkin
Angenommen  Handybreite, der Kochmodus von „Lasagne“ ist offen
Wenn        ich „Zutaten · 4 Portionen“ antippe
Dann        ist der Bereich zugeklappt
Wenn        ich „Weiter“ wähle
Dann        bleibt er zugeklappt
Wenn        ich den Kochmodus mit „Fertig“ verlasse und erneut „Kochen“ wähle
Dann        ist er wieder offen
```

**AC-042 — Gruppen**

```gherkin
Angenommen  der Kochmodus von „Lasagne“ ist offen
Dann        zeigen die Zutaten „150 g Linsen“ und „2 Zwiebeln · fein gehackt“ ohne Überschrift
Und         darunter die Überschrift „Béchamel“ mit „40 g Butter“, „40 g Mehl“, „500 ml Milch“
```

**AC-043 — Timer läuft beim Blättern weiter**

```gherkin
Angenommen  Schritt 4 „Im Ofen backen“ hat den Timer 35 Minuten
Wenn        ich den Timer starte und nach 2 Sekunden „Weiter“ wähle
Dann        steht oben „⏱ Schritt 4 · 34:58“ und zählt weiter
Wenn        ich darauf tippe
Dann        zeigt der Kochmodus Schritt 4 mit dem laufenden Timer
```

**AC-044 — Bildschirm bleibt an**

```gherkin
Angenommen  der Browser kann den Bildschirm wach halten
Wenn        ich den Kochmodus öffne
Dann        hält die App den Bildschirm wach
Wenn        ich „Fertig“ wähle
Dann        gibt sie ihn frei
Angenommen  der Browser kann das nicht
Dann        öffnet sich der Kochmodus wie sonst und zeigt keinen Hinweis
```

**AC-045 — Offline und ohne Schritte**

```gherkin
Angenommen  das Gerät ist offline
Wenn        ich „Lasagne“ öffne und „Kochen“ wähle
Dann        gehen Schritte, Zutaten und Timer wie online
Angenommen  „Ofengemüse“ hat Zutaten, aber keine Schritte
Wenn        ich „Kochen“ wähle
Dann        steht „Noch keine Schritte“ und darunter stehen die Zutaten
```

**AC-046 — Tastatur**

```gherkin
Angenommen  am Desktop ist Schritt 1 von 5 im Kochmodus offen
Wenn        ich Pfeil rechts drücke
Dann        steht „Schritt 2 von 5“ da
Wenn        ich Pfeil links drücke
Dann        steht „Schritt 1 von 5“ da
```

### Essen

### REQ-011 — Starter-Rezepte entfallen

> Starter-Rezepte gibt es nicht mehr: nicht im Menü „Neu“, nicht im leeren Zustand, nicht im Code,
> nicht in Daten, Tests und Dokumenten; eine leere Seite „Essen“ bietet stattdessen „Rezept
> anlegen“ und „Sammlung anlegen“.

**Quelle:** ER-15

**Offline:** wie bisher: Anlegen nur online, die Knöpfe sind offline ausgegraut mit dem
Offline-Hinweis.

**Regeln:**

- „Neu“ bietet auf beiden Ansichten („Rezepte“, „Restaurants“) genau „Rezept“, „Sammlung“ und
  „Restaurant“.
- **Leere Seite „Essen“** (der Haushalt hat weder Rezepte noch Sammlungen): Überschrift „Noch keine
  Rezepte“, Text „Legt euer erstes Rezept an. Ein Titel reicht; Zutaten, Schritte und Links kommen
  später dazu.“, Knöpfe „Rezept anlegen“ (öffnet „Neu“ mit „Rezept“), „Sammlung anlegen“ (öffnet
  „Neu“ mit „Sammlung“) und, nur wenn die KI an ist, „Beschreiben ✨“.
- Es entfallen: das Fenster „Starter-Rezepte“, die Befehle zum Auflisten und Übernehmen, ihre
  Tests, die Herkunft „Starter“ an Rezepten (Spalte `recipes.source`, siehe „Daten“), die
  Erwähnung im Showroom und der Glossar-Eintrag „Starter-Rezept“.
- **Bleibt:** der Starter-Katalog der Artikel und Bereiche, mit dem jeder neue Haushalt beginnt
  (Spec 0003, Spec 0007). Die Beispieldaten der Entwicklung und der Vorschau behalten ihre Rezepte
  als gewöhnliche Rezepte des Beispielhaushalts.

**AC-047 — Menü „Neu“**

```gherkin
Angenommen  „Essen“ ist offen, Ansicht „Rezepte“
Wenn        ich „Neu“ wähle
Dann        bietet das Menü genau „Rezept“, „Sammlung“ und „Restaurant“
Wenn        ich zur Ansicht „Restaurants“ wechsle und „Neu“ wähle
Dann        bietet das Menü dieselben drei Einträge
```

**AC-048 — Leere Seite „Essen“**

```gherkin
Angenommen  der Haushalt „WG Köln“ hat keine Rezepte und keine Sammlungen, die KI ist aus
Wenn        ich „Essen“ öffne
Dann        steht „Noch keine Rezepte“ mit „Legt euer erstes Rezept an. Ein Titel reicht; Zutaten,
            Schritte und Links kommen später dazu.“
Und         es gibt die Knöpfe „Rezept anlegen“ und „Sammlung anlegen“, keinen „Starter-Rezepte
            ansehen“ und kein „Beschreiben ✨“
Wenn        ich „Sammlung anlegen“ wähle
Dann        öffnet sich „Neu“ mit der Auswahl „Sammlung“
```

**AC-049 — Keine Spuren, Starter-Katalog bleibt**

```gherkin
Angenommen  der Stand nach dieser Spec
Dann        enthalten `apps/`, `packages/`, `supabase/`, `scripts/` und `e2e/` weder
            „Starter-Rezept“ noch `listStarterRecipes`, `adoptStarterRecipes` oder `StarterSheet`
Und         die Tabelle `recipes` hat keine Spalte `source`
Und         ein neuer Haushalt „WG Köln“ hat weiter die Bereiche und Artikel des Starter-Katalogs
```

**AC-050 — Offline**

```gherkin
Angenommen  das Gerät ist offline und der Haushalt hat keine Rezepte
Dann        sind „Rezept anlegen“ und „Sammlung anlegen“ ausgegraut mit dem Offline-Hinweis
```

### REQ-012 — Löschen nennt die geplanten Einträge, die entfallen

> Der Hinweis nach dem Löschen eines Rezepts oder einer Sammlung sagt, wie viele geplante Einträge
> mit entfallen, und „Rückgängig“ holt sie zurück.

**Quelle:** E-03

**Offline:** nur online, wie bisher (Spec 0008, REQ-012).

**Regeln:**

- Was entfällt, regelt weiter Spec 0008 (E3): Einträge nach heute, vorgemerkte Einträge und Reste,
  die nur an ihnen hängen. Einträge bis einschließlich heute bleiben als Freitext und zählen nicht.
- Der Hinweis setzt sich aus Teilen zusammen, durch „·“ getrennt: „Lasagne gelöscht“, dann „1
  geplanter Eintrag entfällt“ bzw. „2 geplante Einträge entfallen“ (nur wenn welche entfallen), dann
  wie bisher „auch aus 1 Sammlung entfernt“ (Spec 0009, AC-033). Dazu „Rückgängig“ für 5 Sekunden.
- Lehnt der Server ab, gilt Spec 0008, AC-045.

**AC-051 — Rezept mit künftigen und vergangenen Einträgen**

```gherkin
Angenommen  „Lasagne“ steht am Freitag, 20.11., am Mittwoch, 25.11., und am Freitag, 4.12.,
            abends im Kalender und ist in keiner Sammlung
Wenn        ich „Lasagne“ lösche
Dann        sagt der Hinweis „Lasagne gelöscht · 2 geplante Einträge entfallen“ mit „Rückgängig“
Und         am 20.11. steht „Lasagne“ als Freitext, am 25.11. und 4.12. steht nichts
Wenn        ich „Rückgängig“ wähle
Dann        stehen „Lasagne“ und alle drei Einträge wieder da wie vorher
```

**AC-052 — Sammlung mit vorgemerktem Eintrag**

```gherkin
Angenommen  „Grillabend“ steht morgen, Montag 23.11., abends im Kalender und ist einmal vorgemerkt
Wenn        ich „Grillabend“ lösche
Dann        sagt der Hinweis „Grillabend gelöscht · 2 geplante Einträge entfallen“
```

**AC-053 — Ein Eintrag und Sammlungen**

```gherkin
Angenommen  „Mango-Curry“ steht am 25.11. im Kalender und ist in „Grillabend“ enthalten
Wenn        ich „Mango-Curry“ lösche
Dann        sagt der Hinweis „Mango-Curry gelöscht · 1 geplanter Eintrag entfällt · auch aus
            1 Sammlung entfernt“
```

**AC-054 — Rand: nichts geplant**

```gherkin
Angenommen  „Shakshuka“ steht nicht im Kalender und in keiner Sammlung
Wenn        ich „Shakshuka“ lösche
Dann        sagt der Hinweis „Shakshuka gelöscht“, wie bisher
```

### REQ-013 — Einplanen-Fenster: Datum an jedem Tag, jeder Tag erreichbar, Esser stimmen

> Das Einplanen-Fenster von Rezept und Sammlung zeigt unter jedem Tag sein Datum, erreicht mit
> „Anderes Datum …“ jeden Tag und berechnet „Wer isst mit?“ neu, sobald Mitglieder und Reisen
> geladen sind.

**Quelle:** E-11, E-12

**Offline:** nur online, wie bisher (Spec 0008, REQ-009).

**Regeln:**

- Die Tages-Chips zeigen zwei Zeilen: Wochentag und Datum („Mi“ über „25.11.“).
- Hinter „Ohne Tag vormerken“ steht „Anderes Datum …“ (Spec 0016, REQ-005): ein Monatskalender im
  Fenster, beginnend mit dem Monat der angezeigten Woche, ‹ › ohne Grenze. Ein Tipp auf einen Tag
  wählt ihn, zeigt dessen Woche mit dem gewählten Chip und schließt den Monatskalender.
- Der Hauptknopf nennt das Datum: „Am Mi 25.11. Abend einplanen“; ohne Tag weiter „Vormerken“.
- Solange niemand „Wer isst mit?“ angefasst hat, rechnet das Fenster die Vorauswahl neu, wenn
  Mitglieder oder Reisen erst nach dem Öffnen ankommen. Hat man dort etwas gewählt, bleibt die
  eigene Wahl.

**AC-055 — Datum unter den Tagen**

```gherkin
Angenommen  heute ist Sonntag, 22.11.2026, und ich wähle auf „Lasagne“ „Einplanen“
Dann        zeigt das Fenster „KW 47 · 16.–22. Nov“ und die Tage „Mo 16.11.“ bis „So 22.11.“
Und         gewählt ist „So 22.11.“, der Knopf heißt „Am So 22.11. Abend einplanen“
```

**AC-056 — Anderes Datum**

```gherkin
Angenommen  das Einplanen-Fenster von „Lasagne“ ist offen
Wenn        ich „Anderes Datum …“ wähle
Dann        erscheint im Fenster der Monat „November 2026“
Wenn        ich mit › zu „Februar 2027“ blättere und den 14. wähle
Dann        zeigt das Fenster „KW 6 · 8.–14. Feb“ mit gewähltem „So 14.2.“
Und         der Knopf heißt „Am So 14.2. Abend einplanen“
Wenn        ich ihn wähle
Dann        steht „Lasagne“ am Sonntag, 14.2.2027, abends im Kalender
```

**AC-057 — Mitglieder kommen später (E-12)**

```gherkin
Angenommen  direkt nach dem Neuladen sind die Mitglieder noch nicht im lokalen Speicher
Wenn        ich auf „Lasagne“ „Einplanen“ wähle und die Mitglieder danach ankommen
Dann        sind bei „Wer isst mit?“ Enrico und Nadja gewählt
Und         der Knopf „Am So 22.11. Abend einplanen“ ist bedienbar
```

**AC-058 — Rand: eigene Wahl bleibt**

```gherkin
Angenommen  im Einplanen-Fenster habe ich bei „Wer isst mit?“ Nadja abgewählt
Wenn        danach ein Abgleich eine neue Reise von Enrico bringt
Dann        bleibt bei „Wer isst mit?“ meine Wahl: Enrico gewählt, Nadja nicht
```

### REQ-014 — Einheitlich zählen, verständlich benennen

> Der Knopf im Filterfeld zählt wie die Zeile über der Liste, und die Portionen eines enthaltenen
> Rezepts heißen „(wie Sammlung)“ statt „übernimmt“.

**Quelle:** E-13, E-14

**Offline:** offline vollständig (nur Anzeige); „Enthält“ bearbeiten nur online.

**Regeln:**

- Der Knopf im Filterfeld heißt „<Zählung> zeigen“ mit derselben Zählung wie über der Liste:
  „26 Rezepte · 2 Sammlungen zeigen“, „13 Rezepte zeigen“, „2 Sammlungen zeigen“; ohne Treffer
  „0 Rezepte zeigen“.
- In „Enthält“ (offen) heißt die Zeile eines Rezepts ohne eigene Portionen „6 Port. (wie
  Sammlung)“, mit Variante „vegan · 6 Port. (wie Sammlung)“. Im Fenster „Portionen und Variante“
  ist der Platzhalter „wie Sammlung (6)“ und der Hinweis „Leer lassen: so viele Portionen wie die
  Sammlung (6)“.

**AC-059 — Filterknopf zählt wie die Liste**

```gherkin
Angenommen  der Haushalt hat 26 Rezepte und 2 Sammlungen, kein Filter ist gesetzt
Wenn        ich „Filter“ öffne
Dann        heißt der Knopf „26 Rezepte · 2 Sammlungen zeigen“
Und         über der Liste steht „26 Rezepte · 2 Sammlungen“
Wenn        ich „Art: Rezepte“ wähle
Dann        heißt der Knopf „26 Rezepte zeigen“
```

**AC-060 — „wie Sammlung“**

```gherkin
Angenommen  „Grillabend“ für 6 Portionen enthält „Kartoffelsalat“ ohne eigene Portionen und
            „Grillgemüse“ mit 8 Portionen
Wenn        ich „Enthält“ bearbeite
Dann        steht unter „Kartoffelsalat“ „6 Port. (wie Sammlung)“ und unter „Grillgemüse“ „8 Port.“
Und         nirgends steht „übernimmt“
```

## Ersetzt

_in Arbeit_

## Offline und Konflikte

_in Arbeit_

## Plattformen

_in Arbeit_

## Daten

_in Arbeit_

## Offene Fragen

_in Arbeit_

## Rückverfolgbarkeit

_in Arbeit_
