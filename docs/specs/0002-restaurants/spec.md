---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-20
---

# 0002 — Restaurants

## Problem

Enrico und Nadja gehen gern essen. Im Wochenplan steht dann bisher nur Freitext („Essen beim
Italiener“): Man findet das Lokal nicht wieder, weiß nicht mehr, wie es war, und muss die Adresse
jedes Mal neu suchen. Restaurants von Google Maps abzutippen ist mühsam.

## Ziel

Restaurants sind ein eigener Bereich neben den Rezepten: in Sekunden aus einem geteilten
Karten-Link angelegt, mit eigener Bewertung, Favorit und Notiz je Person. Im Wochenplan lässt sich
statt eines Rezepts ein Restaurant eintragen, und von dort startet mit einem Tipp die Route in
Apple Karten oder Google Maps.

## Nicht-Ziele

- **Keine Restaurantsuche über Google** (Places-API): Sie bräuchte einen kostenpflichtigen
  API-Schlüssel. Wird bei Bedarf in einer eigenen Spec entschieden.
- **Keine Öffnungszeiten, Speisekarten oder Reservierungen.** Dafür gibt es die Karten-Apps.
- **Kein Teilen-Ziel auf dem iPhone in dieser Spec.** iOS erlaubt das für Web-Apps nicht; es kommt
  mit der nativen App (Teilen-Erweiterung). Android-PWA und der Link-Weg funktionieren vorher.
- **Keine Einkaufsliste für Restaurantbesuche**: Ein Restaurant im Plan erzeugt keine Posten.

## Konzept in Kürze

- Der Tab **„Rezepte“ heißt künftig „Essen“** und hat oben einen Umschalter **Rezepte ·
  Restaurants**. „Essen“ statt „Gerichte“, weil ein Restaurant kein Gericht ist und der Tab beides
  abdeckt.
- **Schnell hinzufügen**, in dieser Reihenfolge:
  1. **Teilen** (Android-PWA, später nativ auch iOS): In Google Maps oder Apple Karten auf „Teilen“
     → Housekeeping → das Formular ist vorausgefüllt → „Speichern“.
  2. **Link einfügen** (überall): Den geteilten Karten-Link ins Feld einfügen; Name, Ort und
     Koordinaten werden daraus gelesen.
  3. **Von Hand**: nur der Name ist Pflicht.
- **Kurzlinks** (`maps.app.goo.gl/…`) enthalten den Ort nicht selbst; sie muss später der Server
  auflösen (Edge Function, folgt der Weiterleitung). Im Frontend-Stand wird das mit Beispieldaten
  simuliert.

## Anforderungen und Akzeptanzkriterien

### REQ-001 — Bereich „Essen“ mit Rezepten und Restaurants

> Die Navigation führt zu „Essen“; dort wechselt ein Umschalter zwischen Rezepten und Restaurants.

**Offline:** offline lesend (Bearbeiten braucht Netz).

**AC-001**

```gherkin
Angenommen  die App ist geöffnet
Wenn        ich in der Navigation „Essen“ wähle
Dann        sehe ich die Rezepte und oben den Umschalter „Rezepte · Restaurants“
Wenn        ich „Restaurants“ wähle
Dann        sehe ich die Restaurants des Haushalts mit Name, Küche, Ort und meiner Bewertung
```

**AC-002 — Leerer Haushalt**

```gherkin
Angenommen  der Haushalt „Test“ ohne Restaurants
Wenn        ich „Restaurants“ öffne
Dann        sehe ich „Noch keine Restaurants“ mit „Link einfügen“ und „Von Hand anlegen“
Und         den Hinweis, dass man in Google Maps oder Apple Karten über „Teilen“ Orte schicken kann
```

### REQ-002 — Restaurant aus Karten-Link

> Ein eingefügter Link von Google Maps oder Apple Karten füllt das Formular vor.

**Offline:** nur online (Anlegen ist Bearbeiten).

**AC-003**

```gherkin
Angenommen  das Formular „Restaurant hinzufügen“
Wenn        ich den Link
            "https://www.google.com/maps/place/Trattoria+Da+Enzo/@50.9271,6.9580,17z" einfüge
Dann        steht „Trattoria Da Enzo“ im Namen
Und         die Koordinaten 50.9271, 6.958 sind übernommen
```

**AC-004**

```gherkin
Angenommen  das Formular „Restaurant hinzufügen“
Wenn        ich den Link "https://maps.apple.com/?q=Pho+Saigon&ll=50.94,6.95" einfüge
Dann        steht „Pho Saigon“ im Namen und die Koordinaten 50.94, 6.95 sind übernommen
```

**AC-005 — Kurzlink**

```gherkin
Angenommen  das Formular „Restaurant hinzufügen“
Wenn        ich einen Kurzlink "https://maps.app.goo.gl/AbC123" einfüge
Dann        sehe ich „Kurzlink erkannt – Ort wird beim Speichern abgerufen“
Und         nach „Speichern“ ist ein Restaurant mit Namen und Ort angelegt (im Frontend-Stand ein Beispielort)
```

**AC-006 — Fehlerfall: kein Karten-Link**

```gherkin
Angenommen  das Formular „Restaurant hinzufügen“
Wenn        ich "hallo welt" in das Link-Feld einfüge
Dann        sehe ich „Das ist kein Karten-Link“ und das Formular bleibt leer
```

**AC-007 — Fehlerfall: Name fehlt**

```gherkin
Angenommen  das Formular „Restaurant hinzufügen“ ohne Namen
Wenn        ich „Speichern“ wähle
Dann        wird nichts angelegt und das Namensfeld zeigt „Name fehlt“
```

**AC-008 — Teilen-Ziel**

```gherkin
Angenommen  die App wird mit /teilen?text=Trattoria%20Da%20Enzo&url=https%3A%2F%2Fwww.google.com%2Fmaps%2Fplace%2FTrattoria%2BDa%2BEnzo%2F%4050.9271%2C6.958%2C17z geöffnet
Dann        öffnet sich „Restaurant hinzufügen“ im aktiven Haushalt mit „Trattoria Da Enzo“ vorausgefüllt
```

**AC-009 — Doppelt**

```gherkin
Angenommen  „Trattoria Da Enzo“ gibt es schon im Haushalt
Wenn        ich denselben Link noch einmal einfüge
Dann        sehe ich „Gibt es schon: Trattoria Da Enzo“ mit „Öffnen“ statt eines zweiten Eintrags
```

### REQ-003 — Bewerten, Favorit, Notiz

> Jede Person bewertet und favorisiert für sich; Notizen gelten für den Haushalt.

**Offline:** offline lesend.

**AC-010**

```gherkin
Angenommen  das Restaurant „Trattoria Da Enzo“ ist geöffnet
Wenn        ich 5 Sterne vergebe, es favorisiere und die Notiz „Trüffelpasta!“ schreibe
Dann        zeigt die Liste bei „Trattoria Da Enzo“ meine 5 Sterne und das Herz
Und         die Detailseite zeigt die Notiz
```

### REQ-004 — Restaurant im Wochenplan

> Statt eines Rezepts kann ein Restaurant eingeplant werden.

**Offline:** offline lesend.

**AC-011**

```gherkin
Angenommen  ein Abend ohne Eintrag
Wenn        ich im Hinzufügen-Sheet „Restaurant“ wähle und „Trattoria Da Enzo“ nehme
Dann        steht „Trattoria Da Enzo“ mit Restaurant-Symbol an diesem Abend
Und         „Auf die Einkaufsliste“ übernimmt für diesen Abend nichts
```

**AC-012 — Route**

```gherkin
Angenommen  „Trattoria Da Enzo“ steht heute Abend im Plan
Wenn        ich auf „Heute“ beim Restaurant „Route“ wähle
Dann        kann ich „Apple Karten“ oder „Google Maps“ wählen
Und         die gewählte App öffnet sich mit dem Ziel „Trattoria Da Enzo“ an seinen Koordinaten
```

**AC-013 — Letzter Besuch**

```gherkin
Angenommen  „Pho Saigon“ stand vor 12 Tagen im Plan
Wenn        ich „Pho Saigon“ öffne
Dann        steht dort „Zuletzt: vor 12 Tagen · 3 Besuche“
```

## Offline und Konflikte

Lesen geht offline, Anlegen und Ändern brauchen Netz (ADR-0008). Bewertungen und Favoriten sind je
Person getrennt gespeichert, zwei Personen überschreiben sich also nicht. Bei der Notiz gewinnt die
letzte Änderung. Die Route öffnet eine fremde App und braucht dort Netz.

## Plattformen

- **Web / PWA:** Link einfügen überall. Teilen-Ziel nur in der installierten Android-PWA
  (Web-Share-Target im Manifest); iOS-Safari unterstützt das nicht.
- **Nativ (später):** Teilen-Erweiterung auf iOS und Android, die dieselbe Route `/teilen` nutzt.
- **Route:** Apple Karten über `maps.apple.com`, Google Maps über `google.com/maps/dir/?api=1`;
  auf Geräten ohne die App öffnet sich die Web-Version.

## Daten

Restaurant: Name, Adresse (optional), Koordinaten (optional), Original-Link, Küche, Preisniveau,
Schlagworte, Notiz; je Person Favorit und Bewertung. Besuche werden aus dem Wochenplan abgeleitet.
Keine personenbezogenen Daten über die beiden Mitglieder hinaus.

## Offene Fragen

| #   | Frage                         | Optionen                                                      | Empfehlung                                   | Status                       |
| --- | ----------------------------- | ------------------------------------------------------------- | -------------------------------------------- | ---------------------------- |
| 1   | Tab-Name                      | A: „Essen“ · B: „Gerichte“ · C: „Kochen & Essen“              | A: kurz und deckt Rezepte und Restaurants ab | ENTSCHIEDEN: A (umbenennbar) |
| 2   | Google-Suche nach Restaurants | A: später mit Places-API · B: nie                             | A, als eigene Spec mit Kostenentscheidung    | OFFEN                        |
| 3   | Kurzlinks im echten Betrieb   | A: Edge Function folgt der Weiterleitung · B: nur lange Links | A: so teilt Google Maps standardmäßig        | OFFEN, Annahme A             |

## Rückverfolgbarkeit

| REQ     | AC                | Task (plan.md) | Test |
| ------- | ----------------- | -------------- | ---- |
| REQ-001 | AC-001, AC-002    | —              | —    |
| REQ-002 | AC-003 bis AC-009 | —              | —    |
| REQ-003 | AC-010            | —              | —    |
| REQ-004 | AC-011 bis AC-013 | —              | —    |
