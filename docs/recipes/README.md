# Rezepte

Ausformulierte Rezepte als Markdown. Sie kommen nach Freigabe mit dem Skill `recipe-crud` in die
Datenbank (`.claude/skills/recipe-crud/SKILL.md`); dort steht auch der Ablauf.

| Ordner / Datei     | Inhalt                                                                         |
| ------------------ | ------------------------------------------------------------------------------ |
| `bestand/`         | die Rezepte aus dem Haushalt „Teddy & Nadja“, ausformuliert                    |
| `katalog/<küche>/` | Rezeptkatalog je Küche                                                         |
| `katalog/salate/`  | Salatideen quer durch alle Küchen                                              |
| `eigene/`          | neue Rezepte, die im Chat entstehen                                            |
| `pictures/`        | ein Foto je Rezept, `<dateiname>.jpg`, 1024 × 1024 (nicht im Git)              |
| `db.json`          | was schon bearbeitet ist: je Projekt und Haushalt Rezept-ID → Datei, Zeitpunkt |
| `UEBERSICHT.md`    | alle Rezepte mit offenen Punkten, erzeugt                                      |

Dateinamen: Rezeptname klein, Umlaute als `ae`/`oe`/`ue`/`ss`, Wörter mit `-` getrennt. Gibt es
ein Gericht mehrfach, heißen die Dateien `name-1`, `name-2`, `name-3`.

## Aufbau einer Datei

```markdown
---
titel: Spaghetti aglio e olio
art: rezept # rezept | sammlung
quelle: katalog # bestand | katalog
bestand_id: null # nur bestand: id des Rezepts in der Datenbank
titel_alt: null # nur bestand, wenn der Titel korrigiert wurde: der alte Titel
gang: Hauptgericht # Frühstück | Hauptgericht | Beilage | Dessert | Snack | Getränk
kueche: Italienisch
portionen: 2
dauer_min: 20 # Gesamtzeit in Minuten
vorlauf: null # oder { text: "Teig über Nacht gehen lassen", stunden_vorher: 24 }
tags: [schnell, pasta]
varianten: # leer = keine Varianten; genau eine mit standard: true
  - { name: Vegetarisch, standard: true }
  - { name: Mit Garnelen, standard: false }
links: [] # vorhandene Links (z. B. TikTok) bleiben erhalten
umbau: null # z. B. "Sammlung → Rezept, Pizzateig als Zutatengruppe übernommen"
bild: pictures/spaghetti-aglio-e-olio.jpg
bild_referenz: null # nur bestand: Pfad zum bisherigen Foto, wenn es als Vorlage taugt
bild_prompt: >-
  Englische Beschreibung nur des Gerichts und seines Anrichtens (Stil kommt automatisch dazu)
---

# Spaghetti aglio e olio

![Spaghetti aglio e olio](../../pictures/spaghetti-aglio-e-olio.jpg) <!-- in bestand/: ../pictures/… -->

Ein bis drei Sätze, was das Gericht ausmacht.

## Zutaten

| Menge | Zutat     | Gruppe | Variante     | Hinweis     | Einkauf |
| ----- | --------- | ------ | ------------ | ----------- | ------- |
| 250 g | Spaghetti |        |              |             | Menge   |
| 4     | Knoblauch |        |              | Zehen, dünn |         |
| 200 g | Garnelen  |        | Mit Garnelen | aufgetaut   | Menge   |

## Zubereitung

1. Nudelwasser aufsetzen, kräftig salzen. ⏱ 10
2. [Mit Garnelen] Garnelen im Knoblauchöl 2 Minuten braten.

## Notizen

Tipps, Austausch, Vorrat.
```

**Zutaten**

- **Zutat** ist der Artikelname, wie er auf dem Einkaufszettel stehen soll: Grundform, Einzahl,
  ohne Menge und ohne Zubereitung („Zwiebel“, „Olivenöl“, „Passierte Tomaten“).
- **Gruppe** gliedert die Zutaten („Teig“, „Sauce“, „Pizzateig“). Leer = keine Gruppe.
- **Variante** leer = für alle Varianten; sonst genau der Name aus `varianten`.
- **Hinweis** gilt nur fürs Kochen („fein gehackt“), nie für den Einkauf.
- **Einkauf**: leer = Standard des Artikels; `Menge` = die (umgerechnete) Rezeptmenge kaufen;
  `1×` = einmal auf die Liste, ohne Menge (z. B. eine Packung Feta); `nie` = nicht auf die Liste
  (Wasser).

**Zubereitung**: `[Variantenname]` am Anfang = Schritt nur für diese Variante; `⏱ 10` am Ende =
Kochtimer mit 10 Minuten.

**Sammlungen** (`art: sammlung`) haben statt Zubereitung einen Abschnitt `## Enthält` mit Links
auf die enthaltenen Rezepte und optional eigene Zutaten (ohne Variante).

## Bilder

Alle Bilder entstehen mit `FLUX.2-pro` (Foundry). `bild_prompt` beschreibt nur das Gericht; der
einheitliche Bildstil (Tageslicht, rustikaler Tisch, Keramik, geringe Schärfentiefe, ohne Text,
Hände und Personen) wird beim Erzeugen angehängt. Mit `bild_referenz` wird das bisherige Foto
verbessert statt ein neues erzeugt.
