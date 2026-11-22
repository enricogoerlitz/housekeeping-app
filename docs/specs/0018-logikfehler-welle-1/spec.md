---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-22
---

# 0018 — Fehler aus dem Logik-Review, Welle 1

Freigegeben von Claude im Auftrag von Enrico (22.11.2026): Enrico hat Claude beauftragt, aus
`docs/product/review-logik-und-bedienung.md` die eindeutigsten Logikfehler auszuwählen, freizugeben
und umzusetzen. Eindeutig heißt: Das richtige Verhalten steht fest, es braucht weder eine
Gestaltungsentscheidung noch ein neues Datenmodell.

## Problem

Die App verliert an drei Stellen Eingaben (eingefügte Zutaten beim Anlegen, ein getippter Zusatz
beim „Fertig“, ungesendete Offline-Haken beim Abmelden), rechnet im Kochmodus mit der falschen
Portionenzahl und entfernt Mitglieder auf einen einzigen Fehltipp. Dazu kommen Texte, die einen
anderen Zustand beschreiben als den, der gerade gilt: wer bei einer Aufgabe dran ist, wann eine
Reise beginnt, ob dieses Gerät Benachrichtigungen bekommt, warum Knöpfe gesperrt sind.

## Ziel

- Was man eingibt, bleibt erhalten oder geht nur nach einer Rückfrage verloren.
- Mengen im Kochmodus passen zu den gewählten Portionen.
- Mitglieder entfernen und einen Haushalt verlassen braucht eine Bestätigung.
- Jede Anzeige beschreibt den Zustand, der gerade gilt.

## Nicht-Ziele

- **Keine Befunde, die eine Entscheidung brauchen**, z. B. K-01 (Esser nachträglich ändern), K-02
  (Abwesenheit und Esser), R-01 (Restaurant bearbeiten), X-02 (Aktivitäten und Restaurants löschen),
  H-01 bis H-03, L-01. Sie kommen mit Enricos UI/UX-Review in spätere Wellen.
- **Kein Portionen-Regler im Kochmodus** (Teil der Empfehlung zu E-02): Der Kochmodus übernimmt die
  gewählten Portionen; ein eigener Regler dort ist eine Gestaltungsfrage.
- **„Zusatz speichern“ bleibt**, und das Schließen mit ✕ ändert sich nicht (Teil der Empfehlung zu
  K-03). Hier wird nur der Datenverlust bei „Fertig“ behoben.
- **Kein „Anzeigen“ im Toast nach dem Eintragen einer Abwesenheit** (zweiter Teil von K-12).
- **Keine Änderung an Datenbank, Sync oder Warteschlange**; nur App, `packages/core` und
  `packages/api`.

**Ersetzt oder ändert:**

| Bisher                                                                      | Neu                                  |
| --------------------------------------------------------------------------- | ------------------------------------ |
| Spec 0012, AC-042 (Entscheidung 15): Packkarte zählt ab dem gewählten Tag   | AC-020: Packkarte zählt ab heute     |
| Spec 0001, AC-036: Aufgabe „abwechselnd“ erscheint „mit beiden Mitgliedern“ | AC-016: nur die Person, die dran ist |

## Anforderungen und Akzeptanzkriterien

Beispiele: Haushalt „Enrico & Nadja“, angemeldet ist Enrico. Heute ist Sonntag, 22.11.2026.

### REQ-001 — Eingefügte Zutaten beim Anlegen (E-01)

> Zutaten, die beim Anlegen eines Rezepts in „Zutaten einfügen“ stehen, sind nach „Anlegen“ Teil
> des Rezepts.

**Offline:** nur online (Anlegen ist ein Schreibvorgang, wie bisher).

**AC-001**

```gherkin
Angenommen  ich lege unter „Essen“ → „Neu“ → „Rezept“ das Rezept „Linsen-Dal“ an
Und         in „Zutaten einfügen“ stehen die Zeilen „200 g rote Linsen“ und „1 Dose Kokosmilch“
Wenn        ich „Anlegen“ wähle
Dann        zeigt die Rezeptseite „Linsen-Dal“ die Zutaten „200 g rote Linsen“ und „1 Dose Kokosmilch“
Und         nach dem Neuladen der Seite stehen beide Zutaten weiter da
```

**AC-002 — Rand: Rezept erscheint verzögert im lokalen Speicher**

```gherkin
Angenommen  das neue Rezept erscheint erst einen Abgleich nach dem Öffnen der Rezeptseite im lokalen
            Speicher
Wenn        ich mit eingefügten Zutaten „Anlegen“ wähle
Dann        landen die Zutaten trotzdem im Rezept, ohne dass ich sie erneut eingeben muss
```

**AC-003 — Rand: ohne eingefügte Zutaten**

```gherkin
Angenommen  „Zutaten einfügen“ ist leer
Wenn        ich „Anlegen“ wähle
Dann        zeigt die Rezeptseite wie bisher „Noch keine Zutaten“
```

### REQ-002 — Kochmodus mit den gewählten Portionen (E-02)

> Der Kochmodus rechnet die Mengen mit den Portionen, die beim Öffnen gewählt sind, auf der
> Rezeptseite wie aus einem Planeintrag.

**Offline:** offline vollständig (nur Anzeige).

**AC-004**

```gherkin
Angenommen  die Lasagne hat 4 Grundportionen und 150 g Linsen
Und         auf ihrer Rezeptseite ist „6 Portionen“ gewählt, die Seite zeigt 225 g Linsen
Wenn        ich „Kochen“ und dann „Zutaten anzeigen“ wähle
Dann        zeigt der Kochmodus „225 g Linsen“
Und         der Kochmodus nennt „6 Portionen“
```

**AC-005 — aus einem Planeintrag**

```gherkin
Angenommen  im Kalender steht am Mittwoch abends „Lasagne“ mit 8 Portionen
Wenn        ich daraus den Kochmodus öffne
Dann        zeigt er „300 g Linsen“ und nennt „8 Portionen“
```

**AC-006 — Variante bleibt**

```gherkin
Angenommen  die Variante „vegetarisch“ und 6 Portionen sind gewählt
Wenn        ich den Kochmodus öffne
Dann        gelten Variante und 6 Portionen
```

### REQ-003 — „Fertig“ verliert keine Eingabe (K-03)

> „Fertig“ im Fenster eines Kalendereintrags speichert alle Felder, die noch nicht gespeichert sind
> (Zusatz und „Reserviert um“), bevor es schließt.

**Offline:** nur online (Bearbeiten eines Eintrags, wie bisher); offline ist „Fertig“ ein reines
Schließen, die Felder sind ausgegraut.

**AC-007**

```gherkin
Angenommen  ich habe den Eintrag „Bouldern“ geöffnet und als Zusatz „Halle Nord“ getippt, ohne
            „Zusatz speichern“
Wenn        ich „Fertig“ wähle
Dann        schließt das Fenster
Und         beim erneuten Öffnen steht als Zusatz „Halle Nord“
```

**AC-008 — Uhrzeit beim Restaurant** (geändert am 22.11.2026: Einen Zusatz gibt es nur bei
Aktivitäten; ein Restaurant-Eintrag hat stattdessen „Reserviert um“)

```gherkin
Angenommen  im Restaurant-Eintrag „Trattoria Da Enzo“ habe ich „Reserviert um“ auf 19:30 gesetzt
Wenn        ich „Fertig“ wähle
Dann        ist 19:30 gespeichert
```

**AC-009 — Fehlerfall**

```gherkin
Angenommen  das Speichern beim „Fertig“ scheitert am Server
Wenn        ich „Fertig“ wähle
Dann        bleibt das Fenster offen, der getippte Text steht noch im Feld
Und         es erscheint „Hat nicht geklappt – bitte noch einmal versuchen“
```

### REQ-004 — Mitglieder entfernen und Haushalt verlassen mit Rückfrage (V-01)

> „Entfernen“ bei einem Mitglied und „Verlassen“ bei mir selbst fragen erst nach; der Serveraufruf
> folgt nur auf die Bestätigung.

**Offline:** nur online (wie bisher).

**AC-010 — Entfernen**

```gherkin
Angenommen  ich bin auf „Haushalt & Mitglieder“
Wenn        ich bei Nadja „Entfernen“ wähle
Dann        fragt ein Fenster „Nadja aus „Enrico & Nadja“ entfernen?“ mit „Entfernen“ und „Abbrechen“
Und         bis zur Bestätigung geht kein Aufruf an den Server
Wenn        ich „Abbrechen“ wähle
Dann        ist Nadja weiter Mitglied
```

**AC-011 — Verlassen**

```gherkin
Wenn        ich bei mir selbst „Verlassen“ wähle
Dann        fragt ein Fenster „„Enrico & Nadja“ verlassen?“ und sagt „Zurück kommst du nur mit einer
            neuen Einladung.“
Und         erst „Verlassen“ im Fenster führt die Aktion aus
```

**AC-012 — einziger Haushalt**

```gherkin
Angenommen  „Enrico & Nadja“ ist mein einziger Haushalt
Wenn        ich „Verlassen“ wähle
Dann        sagt das Fenster zusätzlich „Das ist dein einziger Haushalt.“
```

### REQ-005 — Abmelden mit ungesendeten Änderungen (V-06)

> Stehen beim Abmelden noch Änderungen in der Warteschlange (Laden-Aktionen, Packen), fragt die App
> nach; sonst meldet sie wie bisher sofort ab.

**Offline:** gilt online wie offline.

**AC-013**

```gherkin
Angenommen  im Laden habe ich offline 3 Posten abgehakt, die noch nicht gesendet sind
Wenn        ich „Abmelden“ wähle
Dann        fragt ein Fenster „3 Änderungen sind noch nicht gesendet. Beim Abmelden gehen sie
            verloren.“ mit „Trotzdem abmelden“ und „Abbrechen“
Wenn        ich „Abbrechen“ wähle
Dann        bin ich weiter angemeldet und die 3 Änderungen stehen weiter in der Warteschlange
```

**AC-014 — nichts ungesendet**

```gherkin
Angenommen  die Warteschlange ist leer
Wenn        ich „Abmelden“ wähle
Dann        werde ich ohne Rückfrage abgemeldet, wie bisher
```

**AC-015 — Trotzdem abmelden**

```gherkin
Angenommen  das Fenster aus AC-013 ist offen
Wenn        ich „Trotzdem abmelden“ wähle
Dann        werde ich abgemeldet, lokaler Speicher und Warteschlange sind geleert (wie bisher)
```

### REQ-006 — Bei „Abwechselnd“ sieht man, wer dran ist (H-07)

> Eine Aufgabe mit der Zuständigkeit „Abwechselnd“ zeigt in den Zeilen von Haushalt und Übersicht
> nur die Person, die gerade dran ist; „Zu zweit“ zeigt weiter alle.

**Offline:** offline vollständig (Anzeige).

**AC-016**

```gherkin
Angenommen  „Bad putzen“ wechselt zwischen Enrico und Nadja ab, dran ist Nadja
Wenn        ich die Zeile in „Haushalt“ oder auf der „Übersicht“ sehe
Dann        zeigt sie nur Nadjas Avatar
Und         der Screenreader liest „dran: Nadja“
```

**AC-017 — „Zu zweit“ unverändert**

```gherkin
Angenommen  „Fenster putzen“ machen Enrico und Nadja zu zweit
Dann        zeigt die Zeile beide Avatare
```

### REQ-007 — Keine Neuanlage bei exaktem Treffer (K-13)

> Im Hinzufügen-Fenster fehlt „+ „…“ als <Art> anlegen“, wenn es von dieser Art schon einen Eintrag
> mit genau diesem Namen gibt (Groß- und Kleinschreibung und Leerzeichen am Rand egal).

**Offline:** wie das Hinzufügen-Fenster (nur online).

**AC-018**

```gherkin
Angenommen  es gibt das Rezept „Lasagne“
Wenn        ich im Hinzufügen-Fenster „lasagne “ suche
Dann        steht „Lasagne“ als Treffer da
Und         „+ „lasagne“ als Rezept anlegen“ fehlt
```

**AC-019 — ähnlich, aber nicht gleich**

```gherkin
Wenn        ich „Lasagne vegetarisch“ suche und es kein Rezept mit genau diesem Namen gibt
Dann        bietet das Fenster „+ „Lasagne vegetarisch“ als Rezept anlegen“ weiter an
```

### REQ-008 — Texte beschreiben den Zustand, der gilt (U-05, K-12, V-07, X-06, X-07, E-10)

> Hinweise, Zusammenfassungen und Toasts beschreiben den Zustand, der gerade gilt.

**Offline:** offline vollständig (Anzeige).

**AC-020 — Packkarte zählt ab heute (U-05)**

```gherkin
Angenommen  die Abwesenheit „Mallorca“ mit Packliste beginnt am Freitag, 4.12.2026
Und         in der Wochenleiste der „Übersicht“ ist Freitag, 27.11., gewählt
Dann        sagt die Packkarte „beginnt in 12 Tagen“
```

**AC-021 — Wer ist abwesend (K-12)**

```gherkin
Angenommen  das Fenster „Abwesenheit eintragen“ ist offen, gewählt ist nur Enrico
Dann        steht unter den Personen „Nur Enrico“
Wenn        ich zusätzlich Nadja wähle
Dann        steht dort „Ganzer Haushalt“
```

**AC-022 — dieses Gerät (V-07)**

```gherkin
Angenommen  zwei Arten von Benachrichtigungen sind an, dieses Gerät ist nicht angemeldet
Dann        zeigt die Zeile „Benachrichtigungen“ in den Einstellungen „2 an · dieses Gerät aus“
Wenn        ich dieses Gerät anmelde
Dann        zeigt sie „2 an“
```

**AC-023 — zu alte Version (X-06)**

```gherkin
Angenommen  die App ist älter als die Mindestversion und das Gerät ist online
Dann        steht an gesperrten Knöpfen „Bitte neu laden, um zu bearbeiten“
Und         nicht „Offline – zum Bearbeiten brauchst du Netz“
```

**AC-024 — Abbruch beim Abhaken (X-07)**

```gherkin
Angenommen  beim Abhaken einer Aufgabe bricht das Netz ab
Dann        sagt der Toast „Offline – nichts wurde abgehakt. Mit Netz noch einmal abhaken.“
```

**AC-025 — Einplanen mit Datum (E-10)**

```gherkin
Wenn        ich von der Rezeptseite „Lasagne“ für Mittwoch, 25.11., abends einplane
Dann        sagt der Toast „Eingeplant: Mi 25.11., Abend“
```

## Offline und Konflikte

| Bereich                                  | Verhalten                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Anlegen mit Zutaten, „Fertig“, Entfernen | nur online wie bisher; offline ausgegraut mit dem bekannten Hinweis                         |
| Abmelden mit Warteschlange               | die Rückfrage zählt die Warteschlange auf dem Gerät, online wie offline                     |
| Anzeigen (Kochmodus, Avatar, Texte)      | offline vollständig aus dem lokalen Speicher                                                |
| Zwei Geräte entfernen dasselbe Mitglied  | wie bisher: der zweite Aufruf scheitert, „Hat nicht geklappt – bitte noch einmal versuchen“ |

## Plattformen

- Die Rückfragen (REQ-004, REQ-005) sind kleine Fenster nach Spec 0005; Escape und Android-Zurück
  wirken wie „Abbrechen“.
- Der Kochmodus nennt die Portionen auf Handy und Desktop an derselben Stelle.

## Daten

- **Gelesen:** Rezepte, Planeinträge, Aufgaben mit Zuständigkeit, Abwesenheiten, Einstellungen zu
  Benachrichtigungen, Warteschlange, Mindestversion.
- **Geschrieben:** Zutaten eines neuen Rezepts (vorhandener Befehl), Zusatz und Uhrzeit eines
  Eintrags (vorhandene Befehle), Entfernen und Verlassen (vorhandene Befehle).
- **Datenbank:** keine Änderung. **Personenbezogen:** nichts Neues.

## Offene Fragen

| #   | Frage                                                                         | Optionen                                                                                                                                                                                     | Empfehlung                                                         | Status           |
| --- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------- |
| 1   | Zählt die Packkarte ab heute als „in n Tagen“ oder als Datum („am Fr 4.12.“)? | A: „beginnt in 12 Tagen“, ab heute — Pro: gleich wie auf der Urlaubsseite; Contra: muss man umrechnen · B: „beginnt am Fr 4.12.“ — Pro: eindeutig; Contra: anderer Text als die Urlaubsseite | A, weil es nur den Fehler behebt und die Texte einheitlich bleiben | OFFEN, Annahme A |

## Rückverfolgbarkeit

| REQ     | AC                | Task (plan.md) | Test |
| ------- | ----------------- | -------------- | ---- |
| REQ-001 | AC-001 bis AC-003 | —              | —    |
| REQ-002 | AC-004 bis AC-006 | —              | —    |
| REQ-003 | AC-007 bis AC-009 | —              | —    |
| REQ-004 | AC-010 bis AC-012 | —              | —    |
| REQ-005 | AC-013 bis AC-015 | —              | —    |
| REQ-006 | AC-016, AC-017    | —              | —    |
| REQ-007 | AC-018, AC-019    | —              | —    |
| REQ-008 | AC-020 bis AC-025 | —              | —    |
