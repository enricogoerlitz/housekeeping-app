---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-20
---

# 0004 — Aktivitäten und eigene Fotos

## Problem

Enrico und Nadja planen nicht nur Essen, sondern auch Unternehmungen: Eislaufen, Bouldern,
Wandern. Im Wochenplan geht das bisher nur als Freitext. Man findet den Ort nicht wieder, hat kein
Bild dazu und weiß nicht mehr, wann man zuletzt dort war. Auch Rezepte haben bisher nur die
mitgelieferten Beispielfotos; ein eigenes Foto vom selbst gekochten Gericht lässt sich nicht
hochladen.

## Ziel

Aktivitäten sind eine eigene Sammlung im Plan-Tab: mit Foto, Name, Beschreibung und optionalem Ort,
schnell angelegt auch aus einem Karten-Link. Im Wochenplan stehen sie neben Rezepten und
Restaurants, mit einem Zusatz wie „Eislaufen (Hohenschönhausen)“. So sieht man, was man
unternommen hat und wann zuletzt. Rezepte und Aktivitäten bekommen eigene Fotos über dieselbe
Foto-Ablage.

## Nicht-Ziele

- **Keine Uhrzeiten, Tickets oder Öffnungszeiten.** Eine Aktivität gehört zu einer Tageszeit.
- **Keine KI-Vorschläge** für Aktivitäten.
- **Kein Foto je Schritt und keine Galerie:** ein Foto je Rezept bzw. Aktivität.
- **Keine Fotos für Restaurants** in dieser Spec.
- **Kein Zusatz für Rezepte und Restaurants im Plan** (siehe Offene Fragen).
- **Keine Neugestaltung von „Heute“, „Wie war's“ oder der Wochenleiste.** Die kommen mit dem
  UI-Konzept nach Enricos Review vom 20.11.2026; diese Spec zeigt Aktivitäten dort nur an.

## Konzept in Kürze

- Der Wochenplan hat je Tag drei **Tageszeiten**: **Vormittag, Mittag, Abend**. In jeder können
  mehrere Rezepte, Restaurants und Aktivitäten stehen, z. B. Vormittag: ein Restaurant und eine
  Aktivität; Abend: eine Aktivität und zwei Rezepte.
- Innerhalb einer Tageszeit gilt die feste Reihenfolge **Aktivitäten → Rezepte (auch Freitext und
  Reste) → Restaurants**; innerhalb einer Gruppe die Reihenfolge des Eintragens.
- Der Tab **„Plan“** bekommt oben den Umschalter **„Woche · Aktivitäten“**. Unter „Aktivitäten“
  liegt die Sammlung: anlegen, ansehen, bearbeiten, einplanen.
- Eine Aktivität hat **Name** (Pflicht), **Beschreibung**, **Foto**, **Ort** (optional, aus Karten-Link
  oder von Hand). Ein Ort ermöglicht „Route“ wie bei Restaurants (Spec 0002).
- Im Plan bekommt der Eintrag einen **Zusatz**, angezeigt in Klammern: „Eislaufen
  (Hohenschönhausen)“.
- Jede Person kann eine Aktivität **bewerten und favorisieren**, wie Restaurants (Spec 0002). Damit
  kann „Wie war's“ später auch Aktivitäten abfragen.
- **Neu anlegen beim Einplanen:** Im Hinzufügen-Fenster des Plans lässt sich ein neues Rezept, ein
  neues Restaurant oder eine neue Aktivität direkt anlegen; nach dem Speichern ist es sofort
  eingeplant.
- **„Heute“** zeigt Rezepte, Restaurants und Aktivitäten des Tages gemeinsam unter „Heute
  geplant“, jeweils mit einem Kennzeichen „Rezept“, „Restaurant“ oder „Aktivität“.
- **Fotos** für Aktivitäten **und Rezepte** werden hochgeladen, verkleinert und nur für den eigenen
  Haushalt gespeichert. Einmal geladene Fotos sind offline sichtbar. Ein eigenes Rezeptfoto ersetzt
  das mitgelieferte Beispielfoto.

## Anforderungen und Akzeptanzkriterien

### REQ-001 — Drei Tageszeiten mit mehreren Einträgen

> Jeder Tag hat Vormittag, Mittag und Abend; jede Tageszeit nimmt beliebig viele Einträge auf, in
> fester Reihenfolge nach Art.

**Offline:** offline lesend.

**AC-001**

```gherkin
Angenommen  der Wochenplan der laufenden Woche
Wenn        ich einen Tag ansehe
Dann        hat er die Tageszeiten „Vormittag“, „Mittag“ und „Abend“ in dieser Reihenfolge
```

**AC-002 — Reihenfolge in einer Tageszeit**

```gherkin
Angenommen  am Samstagabend stehen die Rezepte „Lasagne“ und „Gemischter Salat“
Wenn        ich zuerst das Restaurant „Trattoria Da Enzo“ und dann die Aktivität „Bouldern“ hinzufüge
Dann        lautet die Reihenfolge am Samstagabend: „Bouldern“, „Lasagne“, „Gemischter Salat“,
            „Trattoria Da Enzo“
```

**AC-003 — Bestehende Haushalte**

```gherkin
Angenommen  ein Haushalt mit den Tageszeiten „Mittag“ und „Abend“ und Einträgen darin
Wenn        die neue Version läuft
Dann        hat der Haushalt zusätzlich „Vormittag“ an erster Stelle
Und         alle bisherigen Einträge stehen unverändert in „Mittag“ bzw. „Abend“
```

### REQ-002 — Sammlung „Aktivitäten“ im Plan-Tab

> Unter „Plan → Aktivitäten“ liegen alle Aktivitäten des Haushalts mit Foto und letztem Mal.

**Offline:** offline lesend.

**AC-004**

```gherkin
Angenommen  der Haushalt hat die Aktivitäten „Eislaufen“ und „Bouldern“
Wenn        ich im Plan-Tab auf „Aktivitäten“ umschalte
Dann        sehe ich beide mit Foto oder Platzhalter-Symbol, Name und z. B. „Zuletzt: vor 3 Wochen · 5-mal“
```

**AC-005 — Leere Sammlung**

```gherkin
Angenommen  der Haushalt „Test“ hat keine Aktivitäten
Wenn        ich „Aktivitäten“ öffne
Dann        sehe ich „Noch keine Aktivitäten“ mit „Aktivität anlegen“
```

### REQ-003 — Aktivität anlegen und bearbeiten

> Name ist Pflicht; Ort kommt aus einem Karten-Link (wie Spec 0002) oder von Hand.

**Offline:** nur online.

**AC-006 — Aus Karten-Link**

```gherkin
Angenommen  das Formular „Aktivität anlegen“
Wenn        ich den Link "https://www.google.com/maps/place/Eisstadion+Hohensch%C3%B6nhausen/@52.55,13.5,17z" einfüge
Dann        steht „Eisstadion Hohenschönhausen“ als Ort mit Koordinaten im Formular
Und         der Name der Aktivität bleibt frei wählbar, z. B. „Eislaufen“
```

**AC-007 — Fehlerfall: Name fehlt**

```gherkin
Angenommen  das Formular „Aktivität anlegen“ ohne Namen
Wenn        ich „Speichern“ wähle
Dann        wird nichts angelegt und das Namensfeld zeigt „Name fehlt“
```

**AC-008 — Doppelt**

```gherkin
Angenommen  die Aktivität „Bouldern“ gibt es schon
Wenn        ich eine neue Aktivität „bouldern“ anlegen will
Dann        sehe ich „Gibt es schon: Bouldern“ mit „Öffnen“ statt eines zweiten Eintrags
```

### REQ-004 — Eigene Fotos für Aktivitäten und Rezepte

> Ein eigenes Foto je Aktivität und je Rezept, verkleinert gespeichert, nur im eigenen Haushalt
> sichtbar.

**Offline:** Hochladen nur online; einmal geladene Fotos offline sichtbar.

**AC-009**

```gherkin
Angenommen  die Aktivität „Eislaufen“ ohne Foto
Wenn        Enrico ein Foto auswählt und speichert
Dann        zeigt „Eislaufen“ das Foto, auch auf Nadjas Gerät
Und         gespeichert ist eine verkleinerte Fassung (längste Seite höchstens 1600 Pixel)
```

**AC-010 — Fehlerfall: ungeeignete Datei**

```gherkin
Angenommen  das Formular einer Aktivität
Wenn        ich eine Datei wähle, die kein Bild ist oder größer als 15 MB
Dann        wird nichts hochgeladen und ich sehe „Dieses Bild können wir nicht verwenden“
```

**AC-011 — Offline**

```gherkin
Angenommen  ich habe die Aktivitäten einmal mit Netz angesehen
Wenn        das Netz weg ist
Dann        sehe ich ihre Fotos weiterhin
Und         „Foto ändern“ ist ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“
```

**AC-012 — Fremder Haushalt**

```gherkin
Angenommen  ein Foto einer Aktivität von „Enrico & Nadja“
Wenn        ein Mitglied eines anderen Haushalts es über die Supabase-API abrufen, überschreiben oder
            löschen will
Dann        wird das abgelehnt
```

**AC-017 — Rezeptfoto**

```gherkin
Angenommen  das Rezept „Spaghetti Bolognese“ ohne Foto
Wenn        Nadja ein Foto ihres Gerichts hochlädt
Dann        zeigen Rezeptliste, Rezept, „Heute“ und Wochenplan dieses Foto, auch auf Enricos Gerät
```

**AC-018 — Foto entfernen**

```gherkin
Angenommen  das Rezept „Lasagne“ mit eigenem Foto
Wenn        ich „Foto entfernen“ wähle
Dann        zeigt „Lasagne“ wieder das Beispielfoto bzw. den Platzhalter
Und         das hochgeladene Foto ist gelöscht
```

### REQ-005 — Im Wochenplan mit Zusatz

> Aktivitäten werden in eine Tageszeit eingeplant, mit optionalem Zusatz in Klammern.

**Offline:** offline lesend.

**AC-013**

```gherkin
Angenommen  ein Samstag ohne Einträge
Wenn        ich am Vormittag „Eislaufen“ mit dem Zusatz „Hohenschönhausen“ einplane
Dann        steht am Samstagvormittag „Eislaufen (Hohenschönhausen)“ mit dem Foto der Aktivität
Und         „Auf die Einkaufsliste“ übernimmt für diesen Eintrag nichts
```

**AC-014 — Route**

```gherkin
Angenommen  „Eislaufen“ hat einen Ort und steht heute im Plan
Wenn        ich auf „Heute“ bei „Eislaufen“ „Route“ wähle
Dann        kann ich „Apple Karten“ oder „Google Maps“ wählen und die App öffnet das Ziel
```

**AC-015 — Ohne Ort**

```gherkin
Angenommen  „Spieleabend“ hat keinen Ort
Wenn        ich den Eintrag öffne
Dann        gibt es keinen „Route“-Knopf
```

**AC-019 — Heute**

```gherkin
Angenommen  heute stehen „Eislaufen“ am Vormittag, „Lasagne“ und „Trattoria Da Enzo“ am Abend
Wenn        ich „Heute“ öffne
Dann        stehen alle drei unter „Heute geplant“, in der Reihenfolge der Tageszeiten
Und         jede Karte trägt ihr Kennzeichen „Aktivität“, „Rezept“ bzw. „Restaurant“
```

### REQ-006 — Nachhalten, was man unternommen hat

> Vergangene Einträge im Plan zählen als „gemacht“.

**Offline:** offline lesend.

**AC-016**

```gherkin
Angenommen  „Bouldern“ stand vor 12, 30 und 45 Tagen im Plan und in 3 Tagen wieder
Wenn        ich „Bouldern“ öffne
Dann        steht dort „Zuletzt: vor 12 Tagen · 3-mal“
Und         der Abschnitt „Verlauf“ listet die drei vergangenen Tage, den neuesten zuerst
```

### REQ-007 — Bewerten und Favorit

> Jede Person bewertet und favorisiert eine Aktivität für sich, wie bei Restaurants.

**Offline:** offline lesend.

**AC-020**

```gherkin
Angenommen  die Aktivität „Bouldern“ ist geöffnet
Wenn        Nadja 4 Sterne vergibt und sie favorisiert
Dann        zeigt die Sammlung bei „Bouldern“ Nadjas 4 Sterne und das Herz auf Nadjas Gerät
Und         Enrico sieht Nadjas Bewertung in der Detailansicht, seine eigene bleibt leer
```

### REQ-008 — Neu anlegen beim Einplanen

> Im Hinzufügen-Fenster des Plans legt man ein neues Rezept, Restaurant oder eine neue Aktivität an,
> ohne den Plan zu verlassen; das Neue ist danach eingeplant.

**Offline:** nur online.

**AC-021**

```gherkin
Angenommen  das Hinzufügen-Fenster für Samstagvormittag, Art „Aktivität“
Wenn        ich „Neue Aktivität“ wähle, „Klettern im Wald“ eingebe und speichere
Dann        gibt es die Aktivität „Klettern im Wald“ in der Sammlung
Und         sie steht am Samstagvormittag im Plan
```

**AC-022**

```gherkin
Angenommen  das Hinzufügen-Fenster für Sonntagabend
Wenn        ich unter „Rezept“ „Neues Rezept“ wähle und „Kürbissuppe“ speichere
Dann        steht „Kürbissuppe“ am Sonntagabend und ist in der Rezeptsammlung
Wenn        ich unter „Restaurant“ einen Karten-Link einfüge und speichere
Dann        steht auch dieses Restaurant am Sonntagabend und ist in der Restaurantsammlung
```

**AC-023 — Fehlerfall**

```gherkin
Angenommen  „Neue Aktivität“ im Hinzufügen-Fenster ohne Namen
Wenn        ich „Speichern“ wähle
Dann        wird nichts angelegt und nichts eingeplant, das Namensfeld zeigt „Name fehlt“
```

## Offline und Konflikte

Lesen geht offline aus dem lokalen Speicher (Spec 0003). Anlegen, Bearbeiten, Foto hochladen und
Einplanen brauchen Netz. Bei gleichzeitiger Änderung derselben Aktivität gewinnt die letzte
Änderung je Feld; ein neues Foto ersetzt das alte.

## Plattformen

- **Web:** Foto per Dateiauswahl (auf dem Handy auch Kamera), Verkleinern im Browser vor dem
  Hochladen.
- **Nativ (später):** Bildauswahl über die Foto-Mediathek; dieselbe Ablage.
- **Navigation:** Sammlung und Detailansicht einer Aktivität liegen innerhalb der Tabs; Seitenleiste
  bzw. Tab-Leiste und Kopfzeile bleiben sichtbar.

## Daten

Rezept: zusätzlich ein eigenes Foto. Aktivität: Name, Beschreibung, Foto, Ort, je Person Bewertung und Favorit; (Name, Koordinaten, Original-Link), angelegt von. Plan-
eintrag: Art „Aktivität“, Verweis, Zusatz. Fotos liegen in Supabase Storage in einem privaten
Bereich je Haushalt; Löschen einer Aktivität oder eines Rezepts löscht sein Foto. Fotos können Personen zeigen; sie sind
nur für Mitglieder des Haushalts sichtbar.

## Offene Fragen

| #   | Frage                                           | Optionen                                                                   | Empfehlung                                                              | Status                                                                                               |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Wo stehen Aktivitäten im Plan                   | A: eigene Zeile · B: im Slot · C: Tageszeit                                | —                                                                       | ENTSCHIEDEN: Slots Vormittag, Mittag, Abend mit Reihenfolge Aktivität → Rezept → Restaurant (Enrico) |
| 2   | Wo liegt die Sammlung                           | A: Plan-Tab · B: neuer Tab · C: unter „Essen“                              | A                                                                       | ENTSCHIEDEN: A                                                                                       |
| 3   | Bild                                            | A: Foto hochladen · B: Symbol · C: erst Symbol                             | A                                                                       | ENTSCHIEDEN: A                                                                                       |
| 4   | Grenzen fürs Foto                               | A: bis 15 MB, gespeichert längste Seite 1600 px als JPEG · B: andere Werte | A: Handyfotos passen, gespeichert ca. 300 KB                            | OFFEN, Annahme A                                                                                     |
| 6   | Wo liegen die Fotos                             | A: Supabase Storage · B: Azure Storage Account                             | A: dieselben Haushalts-Rechte (RLS) wie alle Daten, kein zweiter Dienst | ENTSCHIEDEN: A (Enrico: „wenn in Supabase geht, gerne dort“)                                         |
| 5   | Zusatz auch für Rezepte und Restaurants im Plan | A: nur Aktivitäten · B: für alle Einträge                                  | A jetzt; B ist eine kleine Erweiterung, wenn ihr sie vermisst           | OFFEN, Annahme A                                                                                     |

## Rückverfolgbarkeit

| REQ     | AC                                | Task (plan.md) | Test                                               |
| ------- | --------------------------------- | -------------- | -------------------------------------------------- |
| REQ-001 | AC-001 bis AC-003                 | siehe plan.md  | `e2e/rundgang-aktivitaeten.spec.ts`, pgTAP, vitest |
| REQ-002 | AC-004, AC-005                    | siehe plan.md  | `e2e/rundgang-aktivitaeten.spec.ts`, pgTAP, vitest |
| REQ-003 | AC-006 bis AC-008                 | siehe plan.md  | `e2e/rundgang-aktivitaeten.spec.ts`, pgTAP, vitest |
| REQ-004 | AC-009 bis AC-012, AC-017, AC-018 | siehe plan.md  | `e2e/rundgang-aktivitaeten.spec.ts`, pgTAP, vitest |
| REQ-005 | AC-013 bis AC-015                 | siehe plan.md  | `e2e/rundgang-aktivitaeten.spec.ts`, pgTAP, vitest |
| REQ-005 | AC-019                            | siehe plan.md  | `e2e/rundgang-aktivitaeten.spec.ts`, pgTAP, vitest |
| REQ-006 | AC-016                            | siehe plan.md  | `e2e/rundgang-aktivitaeten.spec.ts`, pgTAP, vitest |
| REQ-007 | AC-020                            | siehe plan.md  | `e2e/rundgang-aktivitaeten.spec.ts`, pgTAP, vitest |
| REQ-008 | AC-021 bis AC-023                 | siehe plan.md  | `e2e/rundgang-aktivitaeten.spec.ts`, pgTAP, vitest |
