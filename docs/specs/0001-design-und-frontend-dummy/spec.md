---
status: entwurf # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-20
---

# 0001 — Design-Fundament und Frontend mit Beispieldaten

## Problem

Das [Feature-Konzept](../../product/feature-konzept.md) beschreibt Version 1 auf vielen Seiten Text.
Ob Abläufe sich richtig anfühlen, ob etwas fehlt oder zu viel ist, lässt sich so kaum beurteilen.
Außerdem gibt es noch kein Aussehen: keine Farben, keine Schrift, keine Bausteine. Würden wir
jetzt Backend und Features bauen, fielen Fehlentscheidungen erst spät auf.

## Ziel

Enrico und Nadja klicken alle Kernabläufe von Version 1 auf dem Handy und am Desktop durch, mit
glaubwürdigen Beispieldaten und im endgültigen Design. Ein Video zeigt denselben Rundgang. Was
dabei entsteht, ist kein Wegwerf-Dummy: Es ist das echte Frontend, an das die folgenden Specs das
Backend anschließen.

## Nicht-Ziele

- **Kein Backend:** keine Anmeldung, kein Supabase, kein Sync. Änderungen leben nur bis zum
  Neuladen der Seite.
- **Keine echte KI und keine echte Spracherkennung:** Assistent, Vorschläge, KI-Suche und
  Spracheingabe zeigen hinterlegte Beispielantworten und sind als solche gekennzeichnet.
- **Kein echtes Offline:** kein Service Worker, keine PWA-Installation. Der Offline-Zustand wird
  über einen Demo-Schalter gezeigt.
- **Keine endgültigen Fachregeln:** Berechnungen gibt es nur, soweit ein Bildschirm sie zum
  Anzeigen braucht. Vollständige Regeln (Einheiten, Rhythmus-Randfälle, Zusammenführen von
  Artikeln) kommen mit den Feature-Specs.
- **Keine nativen Apps** und keine echten Benachrichtigungen. Die Tageszusammenfassung wird nur als
  Vorschau gezeigt.
- **Keine 150 Starter-Rezepte.** Der Beispielhaushalt hat eine kleinere, von Hand geschriebene
  Auswahl.

## Anforderungen und Akzeptanzkriterien

Die Kriterien beziehen sich auf den Beispielhaushalt aus REQ-004. Handybreite bedeutet 390 px,
Tablet 820 px, Desktop 1440 px.

### REQ-001 — Design-Richtung und DESIGN.md

> Es gibt eine von Enrico gewählte Design-Richtung, festgehalten in `docs/design/DESIGN.md`.

**AC-001**

```gherkin
Angenommen  drei Design-Richtungen liegen als Bilder vor, jede mit „Heute“ und „Einkaufsliste“
            in Handybreite und „Heute“ in Desktopbreite, jeweils hell und dunkel
Wenn        Enrico eine Richtung auswählt
Dann        beschreibt docs/design/DESIGN.md genau diese Richtung: Farben für hell und dunkel,
            Schriften, Abstände, Radien, Bewegung, Do und Don't
```

**AC-002 — Randfall: keine Richtung passt**

```gherkin
Angenommen  Enrico gefällt keine der drei Richtungen
Wenn        er das zurückmeldet
Dann        entsteht eine weitere Runde
Und         DESIGN.md wird vor einer Auswahl nicht geschrieben
```

**AC-003**

```gherkin
Angenommen  die Farben aus DESIGN.md
Wenn        Textfarben gegen ihre Hintergründe geprüft werden
Dann        erreicht Fließtext in hell und dunkel mindestens das Kontrastverhältnis 4,5:1
Und         große Überschriften und Symbole mindestens 3:1
```

### REQ-002 — Design-System und Showroom

> Alle Bildschirme bestehen aus Tokens und Bausteinen des Design-Systems; ein Showroom zeigt sie.

**AC-004**

```gherkin
Angenommen  die App läuft
Wenn        ich /showroom öffne
Dann        sehe ich jeden Baustein des Design-Systems mit seinen Zuständen
Und         kann zwischen hell und dunkel umschalten
```

**AC-005 — Fehlerfall: Farbe am Design-System vorbei**

```gherkin
Angenommen  im Code eines Bildschirms steht eine Farbe als Hex- oder rgb-Wert
Wenn        die Lint-Prüfung läuft
Dann        schlägt sie fehl und nennt die Stelle
```

**AC-006**

```gherkin
Angenommen  der Web-Build läuft lokal
Wenn        ich „Heute“, „Rezepte“ und ein Rezept öffne
Dann        gehen alle Netzwerkanfragen an denselben Host, Schriften und Bilder eingeschlossen
```

### REQ-003 — App-Gerüst und Navigation

> Die App hat fünf Bereiche, passt sich Handy, Tablet und Desktop an und zeigt ihren Zustand.

**AC-007**

```gherkin
Angenommen  Handybreite
Wenn        ich die App öffne
Dann        sehe ich „Heute“ und unten eine Leiste mit Heute, Rezepte, Plan, Liste, Haushalt
Und         einen Knopf für den Assistenten
```

**AC-008**

```gherkin
Angenommen  Desktopbreite
Wenn        ich „Rezepte“ öffne und „Mango-Curry“ wähle
Dann        steht die Navigation seitlich statt unten
Und         Rezeptliste und Rezept stehen nebeneinander
```

**AC-009**

```gherkin
Angenommen  das Betriebssystem steht auf dunkel
Wenn        ich die App öffne
Dann        erscheint sie im dunklen Design
Und         unter Einstellungen kann ich auf „Hell“, „Dunkel“ oder „System“ stellen
```

**AC-010 — Offline-Anzeige**

```gherkin
Angenommen  ich schalte unter Einstellungen den Demo-Schalter „Offline simulieren“ ein
Wenn        ich „Rezepte“ öffne
Dann        sehe ich einen orangen Hinweis „Offline – Lesen und Abhaken gehen“
Und         „Neues Rezept“ ist ausgegraut mit dem Hinweis „Offline – zum Bearbeiten brauchst du Netz“
Und         auf „Liste“ lassen sich Posten weiterhin abhaken
```

**AC-011 — Fehlerfall: unbekannte Adresse**

```gherkin
Angenommen  die App läuft
Wenn        ich /gibt-es-nicht öffne
Dann        sehe ich „Nicht gefunden“ und einen Weg zurück zu „Heute“
```

### REQ-004 — Beispieldaten-Schicht

> Bildschirme lesen und ändern Daten nur über eine Schnittstelle; dahinter liegt ein Beispielhaushalt.

**AC-012**

```gherkin
Angenommen  die App startet
Dann        ist der Haushalt „Enrico & Nadja“ aktiv
Und         hat die Mitglieder Enrico (flexibel) und Nadja (vegetarisch)
Und         mindestens 20 Rezepte, darunter „Mango-Curry“ mit den Varianten „mit Tofu“ und
            „mit Hähnchen“ und „Spaghetti Bolognese“ ohne vegetarische Variante
Und         einen Wochenplan für die laufende Woche, eine Standardliste mit offenen Posten,
            den Markt „Rewe Südstadt“ und mindestens 8 Aufgaben
```

**AC-013 — Starter-Katalog**

```gherkin
Angenommen  das Eingabefeld der Einkaufsliste
Wenn        ich „Karot“ tippe
Dann        wird „Möhren · auch: Karotten“ vorgeschlagen
Und         der Starter-Katalog hat mindestens 250 Artikel, jeder mit Bereich und
            Ernährungseigenschaft
```

**AC-014 — Randfall: Neuladen**

```gherkin
Angenommen  ich habe „Spülmittel“ auf die Standardliste gesetzt
Wenn        ich die Seite neu lade
Dann        ist der Ausgangszustand der Beispieldaten wiederhergestellt
```

**AC-015 — Fehlerfall: Bildschirm greift an der Schnittstelle vorbei**

```gherkin
Angenommen  ein Bildschirm importiert Beispieldaten direkt statt über die Daten-Schnittstelle
Wenn        die Lint-Prüfung läuft
Dann        schlägt sie fehl
```

**AC-016 — Leerer Haushalt**

```gherkin
Angenommen  ich wechsle über das Profil in den Haushalt „Test“
Wenn        ich „Rezepte“ öffne
Dann        sehe ich den leeren Zustand „Noch keine Rezepte“ mit den ersten Schritten
            „Titel eingeben“, „Starter-Rezepte ansehen“ und „Beschreiben ✨“
Und         der Starter-Katalog ist auch in diesem Haushalt verfügbar
```

### REQ-005 — Heute und Rezepte

> Heute zeigt den Tag auf einen Blick; Rezepte lassen sich finden, ansehen, anlegen und kochen.

**AC-017**

```gherkin
Angenommen  für heute ist abends „Lasagne“ geplant und für morgen ein Rezept mit Vorlauf
Wenn        ich „Heute“ öffne
Dann        sehe ich „Lasagne“ unter „Essen heute“, die Vorbereitung für morgen,
            die heute fälligen Aufgaben und die Zahl offener Posten der Standardliste
```

**AC-018**

```gherkin
Angenommen  die Rezeptliste
Wenn        ich den Filter „Vegetarisch“ wähle
Dann        sehe ich „Mango-Curry“, weil eine Variante vegetarisch ist
Und         „Spaghetti Bolognese“ sehe ich nicht
```

**AC-019 — Suche mit Tippfehler und Synonym**

```gherkin
Angenommen  die Rezeptliste
Wenn        ich „halumi“ suche
Dann        finde ich „Halloumi-Pfanne“
Wenn        ich „Karotten“ suche
Dann        finde ich Rezepte mit der Zutat „Möhren“
```

**AC-020**

```gherkin
Angenommen  „Mango-Curry“ ist geöffnet, 4 Portionen, Variante „mit Tofu“
Wenn        ich auf 6 Portionen stelle
Dann        wird aus „Kokosmilch 400 ml“ „Kokosmilch 600 ml“
Wenn        ich die Variante „mit Hähnchen“ wähle
Dann        steht „Hähnchen“ statt „Tofu“ in den Zutaten
Und         die Ernährungsform wechselt von „vegan“ zu „mit Fleisch“
```

**AC-021 — Schnellanlage**

```gherkin
Angenommen  die Rezeptliste, sortiert nach „Neu“
Wenn        ich ein Rezept mit dem Titel „Linsen-Dal“ anlege
Dann        steht „Linsen-Dal“ an erster Stelle
Wenn        ich ein Rezept ohne Titel anlegen will
Dann        ist Speichern nicht möglich und das Titelfeld zeigt „Titel fehlt“
```

**AC-022 — Zutaten einfügen**

```gherkin
Angenommen  ein Rezept in Bearbeitung
Wenn        ich als Zutaten „200 ml Kokosmilch“, „1 Mango“ und „1 Prise Salz“ als Block einfüge
Dann        entstehen drei Zutatenzeilen mit Rezeptangabe und Artikel:
            „200 ml · Kokosmilch“, „1 · Mango“, „1 Prise · Salz“
```

**AC-023 — Kochmodus und „Ist alle“**

```gherkin
Angenommen  „Mango-Curry“ ist geöffnet
Wenn        ich den Kochmodus starte
Dann        sehe ich Schritt 1 groß und komme mit „Weiter“ zu Schritt 2
Wenn        ich im Rezept bei „Kreuzkümmel“ „Ist alle“ wähle
Dann        steht „Kreuzkümmel“ auf der Standardliste
Und         ein Hinweis bietet fünf Sekunden „Rückgängig“ an
```

### REQ-006 — Wochenplan

> Rezepte oder Freitext lassen sich auf Tage legen; wer mitisst, bestimmt Portionen und Varianten.

**AC-024**

```gherkin
Angenommen  ein Tag ohne Abendessen in der laufenden Woche
Wenn        ich dort „Mango-Curry“ hinzufüge
Dann        sind bei „Wer isst mit?“ Enrico und Nadja vorausgewählt
Und         die Aufteilung lautet „mit Tofu 1 · mit Hähnchen 1“
Und         der Eintrag erscheint so im Wochenplan
```

**AC-025 — Randfall: keine passende Variante**

```gherkin
Angenommen  ein Tag ohne Abendessen
Wenn        ich „Spaghetti Bolognese“ für Enrico und Nadja hinzufüge
Dann        zeigt der Eintrag den Hinweis „Passt nicht für Nadja“
```

**AC-026**

```gherkin
Angenommen  ein Tag ohne Abendessen
Wenn        ich den Freitext „Essen bei Oma“ hinzufüge
Dann        steht „Essen bei Oma“ an diesem Tag
Wenn        ich „Shakshuka“ ohne Tag vormerke
Dann        steht „Shakshuka“ unter „Vorgemerkt“
```

**AC-027**

```gherkin
Angenommen  „Lasagne“ steht am Montagabend
Wenn        ich den Eintrag auf Donnerstag verschiebe
Dann        steht „Lasagne“ am Donnerstagabend und nicht mehr am Montag
```

### REQ-007 — Einkaufsliste, Vorratscheck und Einkaufsmodus

> Die Liste füllt sich aus Eingabe oder Plan, lässt sich abhaken und im Laden nach Laufweg sortieren.

**AC-028 — Smart-Eingabe**

```gherkin
Angenommen  die Standardliste
Wenn        ich „2 Käse (Gouda oder Emmentaler)“ eingebe und bestätige
Dann        steht dort der Posten „Käse“ mit „2×“ und dem Zusatz „(Gouda oder Emmentaler)“
Und         das Eingabefeld ist leer und hat weiter den Fokus
```

**AC-029 — Randfälle der Eingabe**

```gherkin
Angenommen  „Milch“ steht offen mit „1×“ auf der Standardliste
Wenn        ich „Milch“ noch einmal eingebe
Dann        steht dort eine Zeile „Milch“ mit „2×“ und keine zweite Zeile
Wenn        ich ein leeres Feld bestätige
Dann        ändert sich die Liste nicht
```

**AC-030**

```gherkin
Angenommen  „Milch“ steht offen auf der Standardliste
Wenn        ich „Milch“ abhake
Dann        steht „Milch“ unter „Erledigt“
Wenn        ich „Milch“ dort antippe
Dann        ist „Milch“ wieder offen
```

**AC-031 — Aus dem Plan mit Vorratscheck**

```gherkin
Angenommen  „Mango-Curry“ ist für einen kommenden Tag geplant und steht auf keiner Liste
Wenn        ich „Auf die Einkaufsliste“ wähle und diesen Tag übernehme
Dann        zeigt der Vorratscheck „Mango“ und „Kokosmilch“ unter „Kommt auf die Liste“
Und         „Reis“ und „Kreuzkümmel“ abgewählt unter „Vorrat & Gewürze“
Wenn        ich „Mango“ abwähle und übernehme
Dann        steht „Kokosmilch“ auf der Standardliste
Und         „Mango“, „Reis“ und „Kreuzkümmel“ stehen dort nicht
```

**AC-032 — Einkaufsmodus**

```gherkin
Angenommen  die Standardliste hat offene Posten in mehreren Bereichen
Wenn        ich den Markt „Rewe Südstadt“ wähle und den Einkaufsmodus starte
Dann        sind die Posten nach der Laufreihenfolge dieses Markts gruppiert
Und         ein Fortschritt zeigt „erledigt / gesamt“
Und         Posten ohne Bereich stehen am Ende unter „Ohne Bereich“
```

**AC-033**

```gherkin
Angenommen  im Einkaufsmodus steht „Spülmittel“ unter „Ohne Bereich“
Wenn        ich „Bereich zuordnen“ wähle und „Haushalt & Reinigung“ antippe
Dann        steht „Spülmittel“ unter „Haushalt & Reinigung“
```

**AC-034 — Laufreihenfolge ändern**

```gherkin
Angenommen  bei „Rewe Südstadt“ steht „Getränke“ nach „Kühlregal & Molkerei“
Wenn        ich „Getränke“ an die erste Stelle der Laufreihenfolge setze
Dann        steht „Getränke“ im Einkaufsmodus als erste Gruppe
```

### REQ-008 — Haushaltsplan, Abwesenheit, Profil und Feedback

> Aufgaben lassen sich sehen, erledigen und anlegen; Profil, Abwesenheit und Feedback sind erreichbar.

**AC-035**

```gherkin
Angenommen  „Bad putzen“ ist heute fällig und Enrico zugeordnet
Wenn        ich „Bad putzen“ abhake
Dann        steht die Aufgabe nicht mehr unter „Heute“
Und         der Verlauf zeigt „Bad putzen · Enrico · heute“
Und         ein Hinweis bietet an, auf Nadja umzubuchen
```

**AC-036**

```gherkin
Angenommen  der Haushaltsplan
Wenn        ich die Aufgabe „Staubsaugen“ mit Rhythmus „wöchentlich, Samstag“ und Zuständigkeit
            „abwechselnd“ anlege
Dann        erscheint „Staubsaugen“ unter „Diese Woche“ mit beiden Mitgliedern
Wenn        ich eine Aufgabe ohne Titel anlegen will
Dann        ist Speichern nicht möglich
```

**AC-037 — Spontan erledigt**

```gherkin
Angenommen  „Heute“
Wenn        ich „Was anderes erledigt?“ wähle und „Fenster geputzt“ eingebe
Dann        zeigt der Verlauf „Fenster geputzt · spontan · Enrico · heute“
```

**AC-038 — Abwesenheit**

```gherkin
Angenommen  ich trage für Enrico eine Abwesenheit ein, die den kommenden Samstag enthält
Wenn        ich am Samstag ein Rezept hinzufüge
Dann        ist bei „Wer isst mit?“ nur Nadja vorausgewählt
```

**AC-039 — Feedback**

```gherkin
Angenommen  ich öffne über das Profil „Feedback“
Wenn        ich die Idee „Liste nach Rezept gruppieren“ abschicke
Dann        erscheint sie mit dem Status „neu“
Wenn        ich ein leeres Feedback abschicken will
Dann        ist Senden nicht möglich
```

### REQ-009 — KI-Bedienung, simuliert

> Assistent, Vorschläge, KI-Suche und Spracheingabe sind bedienbar und zeigen Beispielantworten.

**AC-040 — Vorschlag annehmen**

```gherkin
Angenommen  „Mango-Curry“ ist geöffnet, 4 Portionen
Wenn        ich im Assistenten die Beispielanfrage „Mach das vegan und für 6 Personen“ wähle
Dann        erscheint eine Vorschlagskarte, die nur die Änderungen zeigt
Und         sie ist als „Beispielantwort – KI ist noch nicht angeschlossen“ gekennzeichnet
Wenn        ich „Übernehmen“ wähle
Dann        hat „Mango-Curry“ 6 Portionen
```

**AC-041 — Vorschläge als Zeilen in der Liste**

```gherkin
Angenommen  die Standardliste
Wenn        ich die simulierte Spracheingabe „Milch, sechs Eier und Brot“ auslöse
Dann        erscheinen drei gestrichelte Vorschlagszeilen
Wenn        ich „Alle übernehmen“ wähle
Dann        stehen „Milch“, „Eier“ mit „6×“ und „Brot“ als Posten auf der Liste
Wenn        ich stattdessen eine Vorschlagszeile verwerfe
Dann        verschwindet nur diese Zeile
```

**AC-042 — KI-Suche muss eingeschaltet werden**

```gherkin
Angenommen  ich öffne die App zum ersten Mal
Wenn        ich in der Rezeptsuche „was Schnelles mit Tofu“ eingebe
Dann        sehe ich nur Stichworttreffer und den ausgeschalteten Schalter „KI-Suche“
Wenn        ich den Schalter einschalte
Dann        zeigt die Suche die Deutung als Chips und Treffer mit Begründung
Und         nach dem Neuladen der Seite ist der Schalter weiterhin eingeschaltet
```

**AC-043 — Randfall: Anfrage ohne hinterlegte Antwort**

```gherkin
Angenommen  der Assistent ist geöffnet
Wenn        ich eine eigene Nachricht schreibe, für die keine Beispielantwort hinterlegt ist
Dann        antwortet der Assistent „Im Dummy sind nur die Beispielanfragen hinterlegt“
Und         es geht keine Netzwerkanfrage an einen fremden Host
```

### REQ-010 — Video-Rundgang

> Ein Befehl nimmt die Abläufe als Video mit eingeblendeten Erklärungen auf.

**AC-044**

```gherkin
Angenommen  der Web-Build ist erzeugt
Wenn        ich den Rundgang-Befehl starte
Dann        entsteht unter tmp/demo/ ein Video in Handybreite
Und         es zeigt Abläufe aus REQ-005 bis REQ-009 in fester Reihenfolge
Und         jeder Abschnitt blendet einen deutschen Erklärtext ein
```

**AC-045 — Fehlerfall: ein Schritt scheitert**

```gherkin
Angenommen  ein Bildschirm aus dem Rundgang fehlt oder ein Element ist nicht auffindbar
Wenn        ich den Rundgang-Befehl starte
Dann        endet er mit einem Fehler, der den Schritt nennt
```

## Offline und Konflikte

Dieser Stand hat keine Netzanbindung, also weder echtes Offline noch Konflikte zwischen Geräten.
Alle Anforderungen gelten deshalb als **nicht anwendbar**. Gezeigt wird nur die **Darstellung**:
Der Demo-Schalter aus AC-010 schaltet den orangen Hinweis ein und graut Bearbeiten-Aktionen aus.
Das Abhaken und die übrigen Laden-Aktionen bleiben bedienbar, wie es der Nachtrag zu ADR-0008
vorsieht. Die echten Regeln setzt die erste Daten-Spec um.

## Plattformen

- **Web** in Handy-, Tablet- und Desktopbreite ist Gegenstand dieser Spec. Geprüft wird in
  Chromium (automatisch) und in Safari auf dem iPhone (von Hand).
- **Nativ** wird nicht gebaut. Der Code der Bildschirme bleibt aber plattformneutral, damit die
  nativen Apps später aus derselben Codebasis entstehen.
- Jede Wischgeste hat eine Alternative per Tipp.

## Daten

Alle Daten sind erfunden und liegen fest im Code. Der Beispielhaushalt verwendet die Vornamen
Enrico und Nadja; weitere personenbezogene Daten gibt es nicht. Nichts wird gespeichert oder
übertragen, mit einer Ausnahme: Die Einstellungen „KI-Suche“ und „Erscheinungsbild“ liegen im
lokalen Speicher des Browsers.

## Offene Fragen

| #   | Frage                                 | Optionen                                                                                                             | Empfehlung                                                                 | Status                                       |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | Welche Design-Richtung?               | drei Richtungen aus der ersten Aufgabe des Plans                                                                     | —                                                                          | BLOCKER für alles nach REQ-001; Enrico wählt |
| 2   | Woher kommen die Rezeptfotos?         | A: wenige lizenzfreie Fotos (Unsplash-Lizenz) im Repo · B: gestaltete Platzhalter ohne Foto · C: fremde Bildadressen | A: Fotos prägen den Eindruck; C widerspricht AC-006                        | OFFEN, Annahme A                             |
| 3   | Bleiben Änderungen nach dem Neuladen? | A: nein, Ausgangszustand · B: im Browser speichern                                                                   | A: jede Vorführung startet gleich                                          | OFFEN, Annahme A (AC-014)                    |
| 4   | Umfang des Videos                     | A: ein Video in Handybreite, 3–5 Minuten, Erklärtexte, ohne Ton · B: zusätzlich Desktop-Teil                         | B: zeigt auch, dass die Web-Version gut aussieht                           | OFFEN, Annahme B                             |
| 5   | Läuft der Rundgang auch in der CI?    | A: ja, ohne Videoaufnahme, als Test · B: nur lokal                                                                   | A: schützt alle Abläufe vor Regressionen; kostet etwa zwei Minuten je Lauf | OFFEN, Annahme A                             |

## Rückverfolgbarkeit

| REQ     | AC                | Task (plan.md) | Test |
| ------- | ----------------- | -------------- | ---- |
| REQ-001 | AC-001 bis AC-003 | —              | —    |
| REQ-002 | AC-004 bis AC-006 | —              | —    |
| REQ-003 | AC-007 bis AC-011 | —              | —    |
| REQ-004 | AC-012 bis AC-016 | —              | —    |
| REQ-005 | AC-017 bis AC-023 | —              | —    |
| REQ-006 | AC-024 bis AC-027 | —              | —    |
| REQ-007 | AC-028 bis AC-034 | —              | —    |
| REQ-008 | AC-035 bis AC-039 | —              | —    |
| REQ-009 | AC-040 bis AC-043 | —              | —    |
| REQ-010 | AC-044, AC-045    | —              | —    |
