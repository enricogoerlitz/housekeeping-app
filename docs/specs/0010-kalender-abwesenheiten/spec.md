---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-20
---

# 0010 — Kalender und Abwesenheiten

## Problem

Der Tab „Plan“ zeigt nur eine Woche. Wer wissen will, was im nächsten Monat ansteht oder wann im
Sommer Urlaub ist, muss Woche für Woche blättern. Urlaub und Dienstreisen trägt man versteckt in den
Einstellungen ein und sieht sie im Plan nicht. Haushaltsaufgaben fehlen im Plan ganz, obwohl sie den
Tag mitbestimmen. Die Aktivitäten liegen als zweite Ansicht neben der Woche, gemischt mit den
Zeit-Ansichten.

## Ziel

- Der Tab heißt „Kalender“ und zeigt Woche, Monat und Jahr. Man blättert beliebig weit vor und
  zurück, „Heute“ führt zurück.
- Jeder Eintrag ist an Symbol und feiner Farbkante als Rezept, Sammlung, Restaurant, Aktivität oder
  Aufgabe erkennbar.
- Abwesenheiten stehen als Streifen mit Namen und Notiz im Kalender und werden dort eingetragen und
  bearbeitet.
- Aufgaben stehen in einer eigenen, abschaltbaren Haushalt-Zeile.
- Aktivitäten haben eine eigene Seite, erreichbar über ▲ im Kopf des Kalenders und über
  „Verwalten“.

## Nicht-Ziele

- **Keine Uhrzeiten** an Einträgen (die Reservierung am Restaurant-Eintrag kommt mit Spec 0013)
  und kein Import oder Export fremder Kalender.
- **Keine Reisetaschen und Packlisten.** Urlaubsseite und Taschen-Symbol am Streifen kommen mit
  Spec 0012; bis dahin öffnet ein Tipp auf den Streifen das Bearbeiten-Fenster.
- **Kein neues Feld „Anlass“** (D22) und **keine neue Tabelle** für mehrere Personen (D23).
- **„Auf die Einkaufsliste“ selbst** (Schritte, Vorauswahl D21, Vorratscheck) ist Spec 0006. Hier
  geht es nur um den Einstieg im Kopf des Kalenders.
- **„Heute“** (Tagesleiste mit Punkten und Abwesenheits-Streifen, Urlaubs-Hinweis) ist Spec 0011.
- **Keine neuen Regeln, wie Abwesenheiten auf Aufgaben wirken** (Rotation, feste Termine; siehe
  Offene Frage 1). Die Haushalt-Zeile zeigt, was der Haushalt berechnet.
- **Bestehende Planeinträge ändern sich nicht**, wenn eine Abwesenheit eingetragen wird. Wie heute
  berücksichtigt nur die Vorauswahl bei „Wer isst mit?“ die Abwesenheit.
- **Kein neues Verschieben per Ziehen**; Verschieben und Entfernen von Einträgen bleiben wie heute.

## Konzept in Kürze

Grundlage ist das freigegebene UI-Konzept v2 (`docs/product/ui-konzept-v2.md`), Abschnitte 2.3,
2.4, 2.5, 3.5, 3.6 und 4.4, mit den Entscheidungen D16 bis D20, D22 und D23 (alle ENTSCHIEDEN).
D21 (Vorauswahl bei „Auf die Einkaufsliste“) setzt Spec 0006 um.

- **Kalender statt Plan (D16).** Das Wort „Wochenplan“ bleibt für das, was in einer Woche geplant
  ist.
- **Kopf:** Ansichts-Tabs **Woche · Monat · Jahr** (D1, Spec 0005), ‹ ›, „Heute“; rechts
  ▲ Aktivitäten, ⊔ Auf die Einkaufsliste, ⋯ (Haushalt-Zeile ein/aus, Abwesenheit eintragen,
  Abwesenheiten).
- **Arten (D19):** Symbol plus 3-px-Farbkante bzw. Punkt; neue Farbrollen je Theme.
- **Monat (D20):** Handy mit Punkten und Tagesliste darunter; Desktop mit Zeilen und „+n weitere“
  mit kleinem Menü.
- **Jahr:** zwölf kleine Monate mit Punkten und zart gefärbten Abwesenheiten, darunter die Liste der
  Abwesenheiten.
- **Haushalt-Zeile (D18):** Woche an, Monat aus, Jahr nie; Wahl bleibt auf dem Gerät.
- **Abwesenheiten (D22, D23):** Streifen mit Notiz und Namensbadges, gleiche Zeiträume
  zusammengefasst; eintragen und bearbeiten im Kalender, verwalten auf der Seite „Abwesenheiten“.
- **Aktivitäten (D17):** eigene Seite im Kalender-Bereich statt zweiter Ansicht.
- **Hinzufügen-Fenster** in fester Größe mit Tabs und zweitem Schritt im selben Fenster.

**Abhängigkeiten:** Spec 0004 (Tageszeiten, Aktivitäten, „Neu anlegen beim Einplanen“) und Spec 0005
(Ansichts-Tabs, feste Fenstergrößen, Abhaken mit Sammel-Fenster, Navigation und die Einträge
„Aktivitäten“ und „Abwesenheiten“ unter „Verwalten“). Spec 0006 läuft parallel (Welle 2): ⊔
öffnet deren Fenster „Was soll auf die Liste?“; AC-002 ist deshalb erst ab Spec 0006 prüfbar. Auf
dieser Spec bauen auf: 0009 (Tab „Sammlungen“, ■), 0011 (Farbrollen der Arten auf „Heute“), 0012
(Urlaubsseite am Streifen, Packlisten an Abwesenheiten), 0013 (Reservierung am Restaurant-Eintrag).

Spec 0005 (AC-021) macht aus dem Umschalter „Woche · Aktivitäten“ zunächst Ansichts-Tabs und zieht
die Abwesenheiten mit ihrem bisherigen Inhalt aus den Einstellungen auf eine eigene Seite (AC-055,
AC-058). Diese Spec setzt D17 vollständig um (die Ansicht „Aktivitäten“ entfällt) und gestaltet die
Seite „Abwesenheiten“ neu.

**Ersetzt oder ändert:**

| Bisher                                                                                       | Neu                                                                           |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Spec 0004, AC-004, in der Fassung von Spec 0005, AC-021: Ansicht „Aktivitäten“ neben „Woche“ | AC-025: ▲ im Kopf des Kalenders öffnet die Seite „Aktivitäten“                |
| Spec 0004, Konzept: Umschalter „Woche · Aktivitäten“ im Plan-Tab                             | entfällt; Kalender hat nur Woche · Monat · Jahr                               |
| Spec 0001, AC-007: Tab „Plan“                                                                | AC-001: Tab „Kalender“                                                        |
| Spec 0002, AC-011: im Hinzufügen-Sheet „Restaurant“ wählen                                   | AC-021: Tab „Restaurants“ im Hinzufügen-Fenster; das Verhalten bleibt         |
| Spec 0004, AC-021 bis AC-023: „Neue Aktivität“ / „Neues Rezept“ unter der Art                | AC-021: „Neu anlegen als …“ im Hinzufügen-Fenster; das Verhalten bleibt       |
| Spec 0004, AC-001: jeder Tag zeigt alle drei Tageszeiten                                     | auf dem Handy nur Tageszeiten mit Einträgen (AC-008; Annahme, Offene Frage 2) |
| Spec 0005, AC-058: Seite „Abwesenheiten“ mit dem bisherigen Inhalt der Einstellungen         | AC-037, AC-038: neu gestaltet mit „Kommend“ und „Vergangen“                   |

**Regeln, die diese Spec festlegt, weil das Konzept sie offenlässt:**

- **Freitext und Reste** gelten in Symbol und Farbe als Rezept, wie in der Reihenfolge der
  Tageszeit (Spec 0004).
- **Punkte** stehen für die Arten eines Tages, nicht für jeden Eintrag (Legende in Konzept 3.1):
  höchstens drei, in der Reihenfolge Aktivität → Rezept → Sammlung → Restaurant → Aufgabe.
- **Streifen zusammenfassen:** Abwesenheiten mit gleichem Von, gleichem Bis und gleicher Notiz
  bilden einen Streifen; sonst hat jede ihren eigenen (D22: die Notiz ist die Beschriftung).
- **Wechsel der Ansicht:** Woche → Monat zeigt den Monat, in dem die meisten Tage der Woche liegen.
  Monat → Woche zeigt die Woche mit heute, wenn heute im Monat liegt, sonst die Woche mit dem
  Ersten. Monat → Jahr zeigt dessen Jahr. „Heute“ führt in jeder Ansicht zum Zeitraum mit heute.
- **Die Adresse** des Bereichs heißt `/kalender`; alte Adressen unter `/plan` leiten dorthin.

## Anforderungen und Akzeptanzkriterien

„Heute“ ist in allen Beispielen Freitag, 20.11.2026 (KW 47). Der Haushalt „Enrico & Nadja“ hat die
Mitglieder Enrico (E) und Nadja (N); der Haushalt „WG“ hat Enrico, Nadja und Lena.

### REQ-001 — Kalender statt Plan

> Der Tab „Plan“ heißt „Kalender“; sein Kopf hat die Ansichts-Tabs „Woche · Monat · Jahr“, ‹ ›,
> „Heute“, ▲ Aktivitäten, ⊔ Auf die Einkaufsliste und ⋯.

**Offline:** offline lesend. Alle Ansichten lesen aus dem lokalen Speicher; Hinzufügen, Abwesenheit
eintragen und „Auf die Einkaufsliste“ brauchen Netz.

**AC-001** (ersetzt Spec 0001, AC-007, soweit es den Namen „Plan“ betrifft)

```gherkin
Angenommen  Handybreite
Wenn        ich die App öffne
Dann        lautet die Tab-Leiste „Heute“, „Essen“, „Kalender“, „Liste“, „Haushalt“
Wenn        ich „Kalender“ wähle
Dann        heißt die Seite „Kalender“ und zeigt die Ansichts-Tabs „Woche“, „Monat“, „Jahr“,
            „Woche“ aktiv
Und         der Kopf zeigt ‹, „KW 47 · 16.–22. Nov“, ›, „Heute“, ▲, ⊔ und ⋯, dazu wie jede
            Tab-Startseite ⊞ und den Avatar (Spec 0005, AC-054)
Und         ⋯ bietet „Haushalt-Zeile ausblenden“, „Abwesenheit eintragen“ und „Abwesenheiten“
Und         es gibt keinen Ansichts-Tab „Aktivitäten“
Angenommen  Desktopbreite
Dann        heißt der Eintrag in der Seitenleiste „Kalender“
```

**AC-002 — Auf die Einkaufsliste** (prüfbar ab Spec 0006, parallel in Welle 2)

```gherkin
Angenommen  der Kalender zeigt KW 48 und ich bin online
Wenn        ich ⊔ wähle
Dann        öffnet sich „Was soll auf die Liste?“ (Spec 0006) in KW 48
```

**AC-003 — Randfall: alte Adresse**

```gherkin
Angenommen  ein Lesezeichen auf /plan und eines auf /plan/aktivitaet/<id von „Bouldern“>
Wenn        ich sie öffne
Dann        sehe ich den Kalender in der Woche mit heute bzw. die Seite der Aktivität „Bouldern“
```

**AC-004 — Offline**

```gherkin
Angenommen  das Netz ist weg
Wenn        ich den Kalender öffne
Dann        kann ich Woche, Monat und Jahr ansehen und blättern
Und         „+ Hinzufügen“, „Abwesenheit eintragen“ und ⊔ sind ausgegraut mit
            „Offline – zum Bearbeiten brauchst du Netz“
Und         „Haushalt-Zeile ausblenden“ funktioniert
```

### REQ-002 — Woche

> Die Woche zeigt je Tag die Haushalt-Zeile und die Tageszeiten mit ihren Einträgen, darunter
> „Vorgemerkt“; ‹ › blättert beliebig weit in Vergangenheit und Zukunft.

**Offline:** offline lesend.

**AC-005 — Blättern**

```gherkin
Angenommen  der Kalender zeigt „KW 47 · 16.–22. Nov“
Wenn        ich › wähle
Dann        zeigt er „KW 48 · 23.–29. Nov“
Wenn        ich zweimal ‹ wähle
Dann        zeigt er „KW 46 · 9.–15. Nov“ mit den Einträgen dieser vergangenen Woche
Wenn        ich „Heute“ wähle
Dann        zeigt er wieder KW 47
```

**AC-006 — Randfall: Jahreswechsel**

```gherkin
Angenommen  der Kalender zeigt „KW 53 · 28. Dez – 3. Jan“
Wenn        ich › wähle
Dann        zeigt er „KW 1 · 4.–10. Jan“ des Jahres 2027
```

**AC-007 — Desktop**

```gherkin
Angenommen  Desktopbreite, KW 53, Enrico ist vom 1. bis 4.1. abwesend, die Haushalt-Zeile ist an
Und         am Donnerstag, 31.12., Abend stehen „Linsen-Dal“ und „Gemischter Salat“
Wenn        ich die Woche ansehe
Dann        stehen die Tage Mo 28 bis So 3 als Spalten nebeneinander
Und         die Zeilen lauten von oben „Urlaub“, „Haushalt“, „Vormittag“, „Mittag“, „Abend“,
            „Vorgemerkt“
Und         am Donnerstagabend stehen „Linsen-Dal“ und „Gemischter Salat“ untereinander
Und         ohne Abwesenheit in der gezeigten Woche gibt es keine Zeile „Urlaub“
```

**AC-008 — Handy (Annahme, Offene Frage 2)**

```gherkin
Angenommen  Handybreite, KW 47, am Montag steht nur abends „Linsen-Dal“, am Dienstag nichts
Wenn        ich die Woche ansehe
Dann        stehen die Tage untereinander, je mit Kopf „MO 16. NOV“
Und         unter Montag steht nur die Tageszeit „Abend“ mit „Linsen-Dal“ und „+ Hinzufügen“
Und         unter Dienstag steht nur „+ Hinzufügen“
Und         ganz unten steht „Vorgemerkt“ mit den Einträgen ohne Tag
```

### REQ-003 — Arten erkennbar

> Jeder Eintrag ist Symbol plus Text; Farbe zeigt die Art nur als 3-px-Kante bzw. als Punkt, nie
> als Fläche.

**Offline:** offline vollständig (reine Anzeige).

| Art                      | Symbol    | Farbrolle (je Theme, hell und dunkel) |
| ------------------------ | --------- | ------------------------------------- |
| Rezept (Freitext, Reste) | Kochmütze | Terrakotta                            |
| Sammlung (Spec 0009)     | Stapel    | Pflaume                               |
| Restaurant               | Besteck   | Ocker                                 |
| Aktivität                | Berg      | Moos                                  |
| Aufgabe                  | Haken     | Grau                                  |

**AC-009**

```gherkin
Angenommen  in KW 47 stehen „Lasagne“ (Rezept), „Trattoria Da Enzo“ (Restaurant), „Bouldern“
            (Aktivität), „Essen bei Oma“ (Freitext) und in der Haushalt-Zeile „Müll rausbringen“
Wenn        ich die Woche in den Themes „Markthalle“, „Klar“ und „Frisch“ ansehe
Dann        trägt jeder Eintrag das Symbol seiner Art vor dem Text und eine 3 px breite Kante in der
            Farbe seiner Art
Und         kein Eintrag hat eine farbige Fläche als Hintergrund
Und         „Essen bei Oma“ trägt Symbol und Farbe eines Rezepts
```

**AC-010 — Fehlerfall: Kontrast**

```gherkin
Angenommen  die Farbrollen der fünf Arten in allen Themes, hell und dunkel
Wenn        sie gegen den Hintergrund von Karten und Seite geprüft werden
Dann        erreicht jede mindestens das Kontrastverhältnis 3:1
Und         fehlt einem Theme eine Rolle, schlägt die Prüfung fehl und nennt Theme und Rolle
```

### REQ-004 — Monat

> Der Monat zeigt auf dem Handy ein Raster mit Punkten und darunter die Einträge des gewählten Tags;
> am Desktop Einträge als Zeilen, höchstens drei je Tag, danach „+n weitere“ mit kleinem Menü.

**Offline:** offline lesend.

**AC-011 — Handy**

```gherkin
Angenommen  Handybreite, Enrico ist vom 1. bis 4.1.2027 abwesend, Nadja vom 1. bis 7.1.2027,
            beide mit der Notiz „Urlaub Mallorca“
Und         am Freitag, 1.1., stehen vormittags „Strandtag“ (Aktivität) und abends „Paella“ (Rezept)
Wenn        ich „Monat“ wähle und zu „Januar 2027“ blättere
Dann        steht ein Raster Mo bis So, beginnend mit Montag, 28. Dezember
Und         unter dem 1. stehen ein Punkt in der Farbe „Aktivität“ und einer in der Farbe „Rezept“
Und         unter den Tagen stehen dünne Linien in Enricos Farbe (1.–4.) und in Nadjas Farbe (1.–7.)
Und         der 1. ist gewählt und unter dem Raster steht „FR 1. JANUAR“ mit
            „(E) Urlaub Mallorca bis Mo 4.1.“, „(N) Urlaub Mallorca bis Do 7.1.“,
            „Vormittag ▲ Strandtag“, „Abend ◆ Paella“ und „+ Hinzufügen“
Wenn        ich den 2. antippe
Dann        zeigt die Liste unter dem Raster die Einträge vom 2. Januar
```

**AC-012 — Desktop mit „+n weitere“**

```gherkin
Angenommen  Desktopbreite, am Freitag, 1.1.2027, stehen vormittags „Strandtag“ und „Schnorcheln“,
            mittags „Chiringuito“, abends „Paella“ und „Tomatensalat“
Wenn        ich den Monat Januar 2027 ansehe
Dann        stehen im Feld des 1. die Zeilen „▲ Strandtag“, „▲ Schnorcheln“, „● Chiringuito“ und
            darunter „+2 weitere“
Und         die Abwesenheiten stehen als Streifen über den Tagen
Wenn        ich „+2 weitere“ wähle
Dann        öffnet sich am Tag ein kleines Menü „Freitag, 1. Januar“ mit allen fünf Einträgen nach
            Tageszeit, „+ Hinzufügen“ und „Tag öffnen ›“
Wenn        ich „Tag öffnen ›“ wähle
Dann        zeigt der Kalender die Woche KW 53
```

**AC-013 — Randfall: genau drei Einträge, mehr als drei Arten**

```gherkin
Angenommen  Desktopbreite, am Donnerstag, 31.12., stehen genau drei Einträge
Dann        zeigt sein Feld alle drei und kein „+n weitere“
Angenommen  Handybreite, die Haushalt-Zeile ist im Monat an, und am Samstag, 2.1., stehen eine
            Aktivität, ein Rezept, ein Restaurant und eine Aufgabe
Dann        stehen unter dem 2. genau drei Punkte: Aktivität, Rezept, Restaurant
```

**AC-014 — Wechsel der Ansicht**

```gherkin
Angenommen  die Woche „KW 49 · 30. Nov – 6. Dez“
Wenn        ich „Monat“ wähle
Dann        zeigt der Kalender „Dezember 2026“
Angenommen  der Monat „Januar 2027“
Wenn        ich „Woche“ wähle
Dann        zeigt der Kalender „KW 53 · 28. Dez – 3. Jan“
Angenommen  der Monat „November 2026“
Wenn        ich „Woche“ wähle
Dann        zeigt der Kalender KW 47
```

### REQ-005 — Jahr

> Das Jahr zeigt zwölf kleine Monate mit Punkten an Tagen mit Einträgen und zart gefärbten
> Abwesenheiten, darunter die Abwesenheiten des Jahres als Liste; Aufgaben erscheinen nicht.

**Offline:** offline lesend.

**Regeln:** Ein Tag, an dem genau eine Person abwesend ist, ist zart in ihrer Farbe gefärbt. Sind
mehrere einzelne Personen abwesend, trägt der Tag je Person eine feine Linie in ihrer Farbe. Ist der
ganze Haushalt abwesend, ist der Tag neutral gefärbt. Ein Tipp auf einen Monat öffnet ihn in der
Ansicht „Monat“.

**AC-015**

```gherkin
Angenommen  2027: Enrico 1.–4.1. und Nadja 1.–7.1. „Urlaub Mallorca“, der ganze Haushalt
            9.–23.8. „Sommerurlaub“, und Einträge im Kalender am 1.1. und am 14.2.
Wenn        ich „Jahr“ wähle und zu 2027 blättere
Dann        stehen zwölf kleine Monate, auf dem Handy in drei Spalten, am Desktop in vier
Und         der 1.1. und der 14.2. tragen einen Punkt
Und         der 1. bis 4.1. tragen je eine feine Linie in Enricos und in Nadjas Farbe,
            der 5. bis 7.1. sind zart in Nadjas Farbe gefärbt, der 9. bis 23.8. neutral
Und         darunter steht „Abwesenheiten 2027“ mit „(E) 1.–4. Jan · Urlaub Mallorca“,
            „(N) 1.–7. Jan · Urlaub Mallorca“ und „Ganzer Haushalt · 9.–23. Aug · Sommerurlaub“
Und         keine Aufgabe ist zu sehen, auch wenn die Haushalt-Zeile in der Woche an ist
Wenn        ich auf „März“ tippe
Dann        zeigt der Kalender den Monat März 2027
```

**AC-016 — Randfall: über den Jahreswechsel, Jahr ohne Abwesenheit**

```gherkin
Angenommen  der ganze Haushalt ist vom 28.12.2026 bis 3.1.2027 abwesend
Dann        steht diese Abwesenheit in der Liste von 2026 und in der Liste von 2027
Angenommen  2028 hat keine Abwesenheit
Wenn        ich 2028 ansehe
Dann        steht unter den Monaten „Keine Abwesenheiten 2028“
```

### REQ-006 — Haushalt-Zeile

> Über den Tageszeiten steht eine dünne, graue Haushalt-Zeile mit Aufgaben: an vergangenen Tagen,
> was erledigt wurde; heute, was fällig und überfällig ist, zum Abhaken; an künftigen Tagen die
> berechneten Termine. Standard: Woche an, Monat aus, Jahr nie (D18).

**Offline:** offline lesend. Ein- und Ausblenden geht offline (Einstellung auf dem Gerät);
Abhaken braucht Netz, weil eine Erledigung keine Laden-Aktion ist (ADR-0008).

**Regeln**

- Eine Zeile ist Symbol, Titel und Avatar der Person, die dran ist bzw. die es erledigt hat.
- **Vergangene Tage:** Erledigungen aus dem Verlauf mit ✓.
- **Heute:** fällige und überfällige Aufgaben, abhakbar mit dem Sammel-Fenster (Konzept 2.5,
  Spec 0005): Haken setzt durch, nochmal tippen nimmt zurück, 2 Sekunden nach dem letzten Tipp
  wird gebucht und die Zeilen stehen als ✓ am Ende des Tages. Überfälliges steht nur heute, nicht
  an seinem ursprünglichen Tag.
- **Künftige Tage:** feste Rhythmen an jedem ihrer Termine; flexible am nächsten fälligen Tag und
  danach im Abstand ihres Rhythmus, mit „etwa“ und gestrichelt. Bei „abwechselnd“ wird die Person
  im Wechsel weitergerechnet. Aufgaben ohne Termin erscheinen nur, wenn sie erledigt wurden.
- **Ein und aus:** je Ansicht über ⋯ („Haushalt-Zeile ausblenden“ / „einblenden“), gespeichert auf
  dem Gerät. Im Monat steht eingeschaltet je Tag „n Aufgaben“; im Jahr gibt es die Zeile nicht.

**AC-017**

```gherkin
Angenommen  „Bad putzen“ hat Nadja am Montag, 16.11., erledigt
Und         „Blumen gießen“ (wöchentlich mittwochs, Enrico) ist seit Mittwoch, 18.11., überfällig
Und         „Fenster Küche“ (Nadja) ist heute fällig
Und         „Müll rausbringen“ (wöchentlich sonntags, abwechselnd, als Nächstes Enrico)
Und         „Bettwäsche wechseln“ (flexibel, etwa alle 14 Tage, Nadja) wurde am 12.11. erledigt
Wenn        ich KW 47 ansehe
Dann        steht am Montag „✓ Bad putzen (N)“
Und         am Mittwoch steht keine Aufgabe
Und         heute stehen „○ Blumen gießen (E)“ und „○ Fenster Küche (N)“
Und         am Sonntag steht „○ Müll rausbringen (E)“
Wenn        ich zu KW 48 blättere
Dann        steht am Donnerstag, 26.11., gestrichelt „○ Bettwäsche wechseln, etwa (N)“
Und         am Sonntag, 29.11., „○ Müll rausbringen (N)“
```

**AC-018 — Abhaken heute**

```gherkin
Angenommen  heute stehen „○ Blumen gießen (E)“ und „○ Fenster Küche (N)“, Enrico ist angemeldet
Wenn        Enrico „Blumen gießen“ und gleich danach „Fenster Küche“ antippt
Dann        sind beide abgehakt und durchgestrichen und stehen an ihrem Platz
Wenn        er innerhalb von 2 Sekunden „Fenster Küche“ noch einmal antippt
Dann        ist „Fenster Küche“ wieder offen
Und         2 Sekunden nach dem letzten Tipp steht „✓ Blumen gießen (E)“ am Ende des Tages und
            der Verlauf zeigt „Blumen gießen · Enrico · heute“
Und         für „Fenster Küche“ gibt es keinen Eintrag im Verlauf
Und         Aufgaben an vergangenen und künftigen Tagen lassen sich nicht abhaken
```

**AC-019 — Ein und aus**

```gherkin
Angenommen  ich habe die Haushalt-Zeile auf diesem Gerät nie umgestellt
Dann        ist sie in der Woche zu sehen und im Monat nicht, und im ⋯ des Jahres gibt es keinen
            Eintrag dafür
Wenn        ich in der Woche ⋯ → „Haushalt-Zeile ausblenden“ wähle und die App neu lade
Dann        ist die Haushalt-Zeile in der Woche weiter ausgeblendet
Und         auf Nadjas Gerät ist sie weiter zu sehen
Wenn        ich im Monat ⋯ → „Haushalt-Zeile einblenden“ wähle
Dann        steht am Desktop an jedem Tag mit Aufgaben „n Aufgaben“, z. B. „3 Aufgaben“
```

**AC-020 — Offline**

```gherkin
Angenommen  das Netz ist weg und heute ist „Fenster Küche“ fällig
Wenn        ich die Woche ansehe
Dann        steht „○ Fenster Küche (N)“ in der Haushalt-Zeile
Und         der Haken ist ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“
```

### REQ-007 — Hinzufügen-Fenster

> „+ Hinzufügen“ öffnet ein großes Fenster fester Größe mit Suchfeld „Was steht an?“ und den Tabs
> „Alle · Rezepte · Restaurants · Aktivitäten“; neu anlegen, Freitext und Reste gehen im selben
> Fenster, ebenso der zweite Schritt.

**Offline:** nur online (Einplanen ist Schreiben; siehe AC-004).

**Regeln:** Spec 0009 ergänzt den Tab „Sammlungen“. Ohne Suchbegriff stehen die Einträge eines Tabs
A–Z wie heute. Unter den Treffern stehen „+ „…“ als Rezept anlegen“, „+ als Restaurant · Aktivität“
(Neu anlegen beim Einplanen, Spec 0004, REQ-008) und „+ „…“ als Freitext eintragen“. „Alle“ zeigt
zusätzlich die Gruppe „Reste“ (frühere Einträge wie heute). Der zweite Schritt hat Tageszeit, „Wer
isst mit?“, Variante, „Wer kocht?“ und bei Aktivitäten den Zusatz. Aus einem Tag ohne Tageszeit
ist „Abend“ vorausgewählt.

**AC-021**

```gherkin
Angenommen  die Woche KW 53, am Samstag, 2.1., abends ist noch nichts
Wenn        ich dort „+ Hinzufügen“ wähle
Dann        öffnet sich das große Fenster „Sa 2. Jan · Abend“ mit dem Suchfeld „Was steht an?“ und
            den Tabs „Alle“, „Rezepte“, „Restaurants“, „Aktivitäten“
Wenn        ich in „Alle“ „paella“ tippe
Dann        stehen „◆ Paella“ und „◆ Paella vegetarisch“ als Treffer
Und         darunter „+ „paella“ als Rezept anlegen“, „+ als Restaurant · Aktivität“ und
            „+ „paella“ als Freitext eintragen“
Und         die Gruppe „Reste“ mit „Reste von Linsen-Dal (Mo)“
Wenn        ich „Restaurants“ wähle
Dann        stehen dort nur Restaurants
```

**AC-022 — Feste Größe**

```gherkin
Angenommen  Desktopbreite und das Hinzufügen-Fenster ist offen
Wenn        ich zwischen allen vier Tabs wechsle, einen Suchbegriff ohne und einen mit 40 Treffern
            tippe und in den zweiten Schritt gehe
Dann        bleibt das Fenster in jeder dieser Lagen 760 × 720 px groß (höchstens 85 % der Höhe)
Und         Kopf mit Titel, Suchfeld und Tabs sowie der Fuß stehen fest, nur die Mitte scrollt
Angenommen  Handybreite
Dann        bleibt es in denselben Lagen 90 % der Bildschirmhöhe hoch
```

**AC-023 — Zweiter Schritt im selben Fenster**

```gherkin
Angenommen  das Hinzufügen-Fenster „Sa 2. Jan · Abend“ mit dem Treffer „Paella“
Wenn        ich „Paella“ wähle
Dann        zeigt dasselbe Fenster Tageszeit („Abend“ gewählt), „Wer isst mit?“, „Wer kocht?“ und,
            falls es Varianten gibt, die Aufteilung
Wenn        ich „‹ Zurück“ wähle
Dann        sehe ich wieder die Treffer zu „paella“
Wenn        ich „Paella“ erneut wähle und „Einplanen“
Dann        steht „◆ Paella“ am Samstag, 2.1., abends
Angenommen  ich wähle stattdessen die Aktivität „Schnorcheln“
Dann        hat der zweite Schritt zusätzlich das Feld „Zusatz“
```

**AC-024 — Randfall: keine Treffer, Tag ohne Tageszeit**

```gherkin
Angenommen  das Hinzufügen-Fenster ist offen
Wenn        ich „qwertz“ suche
Dann        gibt es keine Treffer-Zeilen, nur „+ „qwertz“ als Rezept anlegen“,
            „+ als Restaurant · Aktivität“ und „+ „qwertz“ als Freitext eintragen“
Angenommen  ich wähle im Monat auf dem Handy unter „FR 1. JANUAR“ „+ Hinzufügen“
Dann        heißt das Fenster „Fr 1. Jan“ und im zweiten Schritt ist „Abend“ vorausgewählt
```

### REQ-008 — Aktivitäten als eigene Seite

> Die Aktivitäten liegen auf einer eigenen Seite im Kalender-Bereich, erreichbar über ▲ im Kopf des
> Kalenders und über „Verwalten“; die zweite Ansicht „Aktivitäten“ entfällt (D17).

**Offline:** offline lesend (Anlegen und Bearbeiten wie in Spec 0004: nur online).

**Regeln:** Inhalt der Seite wie in Spec 0004 (REQ-002, REQ-003), als Endlos-Liste (Spec 0005).

**AC-025** (ersetzt Spec 0004, AC-004, und Spec 0005, AC-021)

```gherkin
Angenommen  der Haushalt hat die Aktivitäten „Eislaufen“ und „Bouldern“, der Kalender zeigt KW 48
Wenn        ich im Kopf des Kalenders ▲ wähle
Dann        öffnet sich die Seite „Aktivitäten“ mit „‹ Kalender“ in der Kopfzeile
Und         dort stehen beide mit Foto oder Platzhalter-Symbol, Name und z. B.
            „Zuletzt: vor 3 Wochen · 5-mal“
Wenn        ich „‹ Kalender“ wähle
Dann        zeigt der Kalender wieder KW 48 in der Ansicht „Woche“
```

**AC-026 — Über „Verwalten“**

```gherkin
Angenommen  Desktopbreite
Wenn        ich in der Seitenleiste unter „Verwalten“ „Aktivitäten“ wähle
Dann        öffnet sich dieselbe Seite „Aktivitäten“
Wenn        ich dort „Bouldern“ wähle
Dann        öffnet sich die Seite der Aktivität „Bouldern“ unter der Adresse
            /kalender/aktivitaet/<id>, und „Zurück“ führt zur Seite „Aktivitäten“
```

**AC-027 — Randfall: keine Aktivitäten**

```gherkin
Angenommen  der Haushalt „Test“ hat keine Aktivitäten
Wenn        ich im Kalender ▲ wähle
Dann        sehe ich „Noch keine Aktivitäten“ mit „Aktivität anlegen“ (Spec 0004, AC-005)
```

### REQ-009 — Abwesenheiten im Kalender

> Abwesenheiten stehen in allen Ansichten als Streifen mit Notiz, Ende und Namensbadges; gleiche
> Zeiträume werden ein Streifen (D22, D23).

**Offline:** offline lesend.

**Regeln:** Die Beschriftung ist die Notiz, ohne Notiz „abwesend“; jeder Streifen trägt sein Ende
(„bis Mo 4.1.“). Der Streifen einer Person ist zart in ihrer Mitgliederfarbe, ein gemeinsamer
Streifen neutral mit allen Avataren, der ganze Haushalt neutral mit Haus-Symbol und allen Avataren.
Desktop: eigene Zeile „Urlaub“ ganz oben, Streifen über mehrere Tage. Handy: senkrechte Leiste links
neben den Tagen, beschriftet am ersten Tag der Abwesenheit und, wenn sie früher begann, am ersten
Tag der gezeigten Woche. Ein Tipp auf einen Streifen öffnet das Fenster „Abwesenheit bearbeiten“
(REQ-010); Spec 0012 ersetzt das durch die Urlaubsseite.

**AC-028 — Desktop, zwei Zeiträume**

```gherkin
Angenommen  Desktopbreite; Enrico ist vom 1. bis 4.1.2027 abwesend, Nadja vom 1. bis 7.1.2027,
            beide mit der Notiz „Urlaub Mallorca“
Wenn        ich KW 53 ansehe
Dann        stehen in der Zeile „Urlaub“ zwei Streifen von Freitag bis Sonntag, die über den Rand der
            Woche weiterlaufen
Und         sie lauten „(E) Urlaub Mallorca · bis Mo 4.1.“ in Enricos Farbe und
            „(N) Urlaub Mallorca · bis Do 7.1.“ in Nadjas Farbe
Wenn        ich zu KW 1 blättere
Dann        steht Enricos Streifen nur am Montag, Nadjas von Montag bis Donnerstag
```

**AC-029 — Zusammenfassen**

```gherkin
Angenommen  im Haushalt „WG“ sind Enrico und Nadja je mit eigener Abwesenheit vom 1. bis 7.1.
            mit der Notiz „Urlaub Mallorca“ eingetragen
Dann        steht in KW 53 ein Streifen „(E)(N) Urlaub Mallorca · bis Do 7.1.“, neutral
Angenommen  der ganze Haushalt „Enrico & Nadja“ ist vom 1. bis 4.1. „Urlaub Mallorca“ abwesend
Dann        steht ein Streifen mit Haus-Symbol, beiden Avataren und „Urlaub Mallorca · bis Mo 4.1.“
Angenommen  Enrico ist vom 1. bis 4.1. „Urlaub Mallorca“ und Nadja vom 1. bis 4.1.
            „Dienstreise Hamburg“ abwesend
Dann        stehen zwei Streifen
```

**AC-030 — Randfall: ohne Notiz**

```gherkin
Angenommen  Enrico ist vom 1. bis 4.1. abwesend, ohne Notiz
Dann        lautet sein Streifen „(E) abwesend · bis Mo 4.1.“
```

**AC-031 — Handy**

```gherkin
Angenommen  Handybreite und die Abwesenheiten aus AC-028
Wenn        ich KW 53 ansehe
Dann        stehen links neben Freitag bis Sonntag zwei senkrechte Leisten in Enricos und Nadjas Farbe
Und         am Freitag, 1.1., stehen „(E) Urlaub Mallorca bis Mo 4.1.“ und
            „(N) Urlaub Mallorca bis Do 7.1.“
Wenn        ich zu KW 1 blättere
Dann        stehen beide Beschriftungen am Montag, 4.1., erneut
```

**AC-032 — Tipp auf den Streifen**

```gherkin
Angenommen  der Streifen „(N) Urlaub Mallorca · bis Do 7.1.“
Wenn        ich ihn antippe
Dann        öffnet sich „Abwesenheit bearbeiten“ mit Nadja, 1.1.2027, 7.1.2027 und „Urlaub Mallorca“
```

### REQ-010 — Abwesenheiten eintragen, bearbeiten und verwalten

> Abwesenheiten werden im Kalender (⋯ → „Abwesenheit eintragen“, Tipp auf den Streifen) und auf der
> Seite „Abwesenheiten“ eingetragen, bearbeitet und gelöscht; sind alle Mitglieder gewählt, gilt
> die Abwesenheit für den ganzen Haushalt, sonst entsteht je Person eine (D23).

**Offline:** nur online (Schreiben); die Seite „Abwesenheiten“ ist offline lesbar.

**Regeln**

- **Fenster (mittel):** „Wer?“ mit allen Mitgliedern als Auswahl-Chips, mehrfach wählbar, ich bin
  vorausgewählt, darunter „alle gewählt = ganzer Haushalt“; „Von“ und „Bis“, beide heute
  vorausgewählt; „Notiz“ (optional); der Hinweis „Wer weg ist, fehlt bei „Wer isst mit?“.“
  (Offene Frage 1); „Speichern“.
- **Bearbeiten** eines Streifens bearbeitet alle Abwesenheiten, für die er steht. Das Ergebnis
  folgt derselben Regel wie beim Eintragen. Jede Änderung ist ein Schreibvorgang, der ganz oder gar
  nicht gelingt.
- **Packlisten ziehen mit:** Ersetzt das Bearbeiten Abwesenheiten (AC-036: einzelne Personen werden
  ganzer Haushalt oder umgekehrt), zieht eine angehängte Packliste mit allem Gepackten zu der
  Abwesenheit, die an ihre Stelle tritt; fällt eine Person ganz heraus, nennt der Dialog ihre
  Packliste, die mit gelöscht wird. Eigentümerin dieser Regel ist Spec 0012 (AC-039, Offene Frage
  4); prüfbar ab Spec 0012, weil es vorher keine Packlisten gibt.
- **Seite „Abwesenheiten“** (über Kalender ⋯ und „Verwalten“): Abschnitte „Kommend“ (laufende und
  künftige, früheste zuerst) und „Vergangen“ (neueste zuerst); Zeilen zusammengefasst wie die
  Streifen; „+“ öffnet das Fenster, ein Tipp auf eine Zeile bearbeitet sie, „Löschen“ entfernt alle
  Abwesenheiten der Zeile mit 5 Sekunden „Rückgängig“.

**AC-033 — Ganzer Haushalt**

```gherkin
Angenommen  der Haushalt „Enrico & Nadja“, Enrico ist angemeldet und online
Wenn        er im Kalender ⋯ → „Abwesenheit eintragen“ wählt
Dann        öffnet sich ein mittleres Fenster, bei „Wer?“ ist Enrico gewählt, „Von“ und „Bis“ sind
            der 20.11.2026
Wenn        er zusätzlich Nadja wählt, 1.1.2027 bis 4.1.2027 und die Notiz „Urlaub Mallorca“
            einträgt und „Speichern“ wählt
Dann        gibt es genau eine Abwesenheit, und zwar für den ganzen Haushalt
Und         im Kalender steht der Streifen mit Haus-Symbol „Urlaub Mallorca · bis Mo 4.1.“
Und         bei „Wer isst mit?“ am 2.1. ist niemand vorausgewählt
```

**AC-034 — Einzelne Personen**

```gherkin
Angenommen  der Haushalt „WG“ mit Enrico, Nadja und Lena
Wenn        ich Enrico und Nadja wähle, 1.1. bis 7.1.2027, Notiz „Urlaub Mallorca“, und speichere
Dann        gibt es zwei Abwesenheiten, je eine für Enrico und für Nadja, mit denselben Daten
Und         im Kalender steht ein Streifen „(E)(N) Urlaub Mallorca · bis Do 7.1.“
Und         bei „Wer isst mit?“ am 2.1. ist nur Lena vorausgewählt
```

**AC-035 — Fehlerfall: ungültige Eingabe**

```gherkin
Angenommen  das Fenster „Abwesenheit eintragen“
Wenn        ich „Von“ 4.1.2027 und „Bis“ 1.1.2027 wähle und „Speichern“ wähle
Dann        wird nichts gespeichert und das Feld „Bis“ zeigt „„Bis“ liegt vor „Von““
Wenn        ich bei „Wer?“ alle abwähle
Dann        ist „Speichern“ ausgegraut mit dem Hinweis „Wähle, wer weg ist“
```

**AC-036 — Zusammengefassten Streifen bearbeiten** (was dabei mit Packlisten geschieht: Spec 0012,
AC-039)

```gherkin
Angenommen  im Haushalt „WG“ der Streifen „(E)(N) Urlaub Mallorca · bis Do 7.1.“ aus AC-034
Wenn        ich ihn antippe
Dann        zeigt „Abwesenheit bearbeiten“ Enrico und Nadja gewählt, Lena nicht, 1.1. bis 7.1.2027
Wenn        ich „Bis“ auf 5.1.2027 ändere und speichere
Dann        enden beide Abwesenheiten am 5.1.2027
Wenn        ich den Streifen erneut öffne, Nadja abwähle und speichere
Dann        gibt es nur noch Enricos Abwesenheit vom 1. bis 5.1.
Wenn        ich sie erneut öffne, Nadja und Lena dazu wähle und speichere
Dann        gibt es statt Enricos Abwesenheit genau eine für den ganzen Haushalt vom 1. bis 5.1.
```

**AC-037 — Seite „Abwesenheiten“**

```gherkin
Angenommen  Nadja ist vom 16. bis 24.11.2026 auf „Dienstreise Hamburg“, der ganze Haushalt vom
            28.12.2026 bis 3.1.2027 im „Urlaub“, Enrico war vom 2. bis 6.11.2026 auf „Fortbildung“
Wenn        ich im Kalender ⋯ → „Abwesenheiten“ wähle
Dann        stehen unter „Kommend“ zuerst Nadjas Dienstreise, dann der Urlaub des Haushalts
Und         unter „Vergangen“ steht Enricos Fortbildung
Wenn        ich bei der Dienstreise „Löschen“ wähle
Dann        verschwindet sie aus Liste und Kalender und der Hinweis „Abwesenheit gelöscht ·
            Rückgängig“ erscheint für 5 Sekunden
Wenn        ich „Rückgängig“ wähle
Dann        ist die Dienstreise wieder da
```

**AC-038 — Ein Ort, zwei Wege** (ändert Spec 0005, AC-058, im Aufbau der Seite)

```gherkin
Angenommen  Nadjas Dienstreise aus AC-037
Wenn        ich „Verwalten“ → „Abwesenheiten“ öffne
Dann        sehe ich dieselbe Seite wie über Kalender ⋯ → „Abwesenheiten“, mit „Kommend“ und
            „Vergangen“
Wenn        ich dort die Dienstreise antippe
Dann        öffnet sich „Abwesenheit bearbeiten“ wie beim Tipp auf ihren Streifen im Kalender
```

Dass die Einstellungen keinen Abschnitt „Abwesenheit“ mehr haben, regelt Spec 0005, AC-055.

## Offline und Konflikte

| Bereich                                                                                  | Verhalten                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Woche, Monat, Jahr, Abwesenheiten, Aktivitäten lesen                                     | offline vollständig aus dem lokalen Speicher, der alle Planeinträge, Aufgaben und Abwesenheiten des Haushalts enthält                                                                       |
| Haushalt-Zeile ein- und ausblenden                                                       | offline vollständig; nur auf dem Gerät gespeichert                                                                                                                                          |
| Hinzufügen, Abwesenheit eintragen/ändern/löschen, ⊔                                      | nur online; ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“ (ADR-0008)                                                                                                           |
| Aufgabe in der Haushalt-Zeile abhaken                                                    | nur online; eine Erledigung ist keine Laden-Aktion. Wird während des 2-Sekunden-Fensters das Netz getrennt, wird nichts gebucht und der Haken springt zurück                                |
| Zwei Personen ändern dieselbe Abwesenheit                                                | je Feld gewinnt die letzte Änderung (`sync.md`)                                                                                                                                             |
| Eine Person bearbeitet einen Streifen, die andere hat eine seiner Abwesenheiten gelöscht | der Server lehnt die Änderung ab, die Anzeige springt zurück, Hinweis „Hat nicht geklappt – bitte noch einmal versuchen“ (ADR-0011)                                                         |
| Zwei Personen haken dieselbe Aufgabe heute ab                                            | dieselbe Regel wie beim Abhaken auf „Heute“ und im Haushalt; die Haushalt-Zeile bringt keine eigene. „Nadja war schneller“ kommt mit Spec 0011, AC-031 (Welle 3) und gilt ab dann auch hier |
| Zwei Personen planen dieselbe Tageszeit ein                                              | beide Einträge stehen da (Spec 0004)                                                                                                                                                        |

## Plattformen

- **Handy (< 700 px):** Woche als Liste der Tage, Monat als Punkte-Raster mit Tagesliste (D20),
  Jahr in drei Spalten; Fenster in den festen Größen aus Spec 0005.
- **Tablet und Desktop (ab 700 px, mit Seitenleiste):** Woche als Raster aus Tagen und Zeilen, Monat
  mit Einträgen als Zeilen und „+n weitere“, Jahr in vier Spalten. Breite Texte im Monat werden mit
  „…“ gekürzt.
- **Maus und Tastatur:** Das Menü hinter „+n weitere“ öffnet per Klick oder Enter und schließt mit
  Escape oder ✕. Ein leeres Feld der Woche zeigt „+“ beim Darüberfahren und beim Fokus.
- **Android:** Die Zurück-Taste schließt zuerst ein offenes Menü oder Fenster, dann die Seite
  „Aktivitäten“ bzw. „Abwesenheiten“.
- **Screenreader:** Punkte und Streifen haben eine Textfassung, z. B. „Freitag, 1. Januar:
  1 Aktivität, 1 Rezept“ und „Enrico abwesend, Urlaub Mallorca, 1. bis 4. Januar“.

## Daten

- **Gelesen:** Planeinträge, Rezepte, Restaurants, Aktivitäten, Aufgaben, Erledigungen,
  Abwesenheiten, Mitglieder mit ihren Farben.
- **Geschrieben:** Abwesenheiten (anlegen, ändern, löschen; mehrere Zeilen in einem
  Schreibvorgang), Planeinträge über das Hinzufügen-Fenster, Erledigungen über die Haushalt-Zeile.
- **Nur auf dem Gerät:** Haushalt-Zeile ein/aus je Ansicht.
- **Datenbank:** keine Änderung (Konzept 4.4). Künftige Termine der Haushalt-Zeile werden aus dem
  Rhythmus berechnet und nicht gespeichert.
- **Personenbezogen:** Abwesenheiten zeigen, wann eine Person nicht da ist, und die Notiz kann
  Persönliches enthalten. Beides sehen wie bisher nur Mitglieder des eigenen Haushalts (RLS aus
  Spec 0003); neue Felder gibt es nicht.

## Offene Fragen

| #   | Frage                                                                                                                                                                                                             | Optionen                                                                                                                                                                                                                                                                                                                                       | Empfehlung                                                                                                          | Status           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | Das Konzept (3.6) schreibt ins Fenster „die Rotation überspringt ihn“ und „wirkt wie heute: Rotation pausiert, feste Termine entfallen“. Im Code wirkt eine Abwesenheit bisher nur auf „Wer isst mit?“. Was gilt? | A: Hinweis nennt nur, was wirkt („Wer weg ist, fehlt bei „Wer isst mit?“.“); Rotation und feste Termine bekommen eine eigene Spec — Pro: ehrlich, Umfang bleibt klein; Contra: F14 bleibt offen · B: diese Spec baut Rotation und Termine nach F14 mit — Pro: alles auf einmal; Contra: Haushaltslogik in einer Kalender-Spec, größerer Umfang | A, weil die Regeln für Aufgaben in den Haushalt gehören und der Hinweis nichts versprechen soll, was nicht passiert | OFFEN, Annahme A |
| 2   | Zeigt die Woche auf dem Handy leere Tageszeiten?                                                                                                                                                                  | A: nur Tageszeiten mit Einträgen, dazu je Tag ein „+ Hinzufügen“ (Skizze in 3.5) — Pro: kurze Woche, alles auf einen Blick; Contra: ändert Spec 0004, AC-001 auf dem Handy · B: immer alle drei Tageszeiten je Tag — Pro: wie Spec 0004; Contra: 21 Zeilen plus Haushalt, viel Scrollen                                                        | A, weil die Skizze es so zeigt und die Woche auf dem Handy sonst sehr lang wird                                     | OFFEN, Annahme A |

## Rückverfolgbarkeit

| REQ     | AC                | Task (plan.md) | Test |
| ------- | ----------------- | -------------- | ---- |
| REQ-001 | AC-001 bis AC-004 | —              | —    |
| REQ-002 | AC-005 bis AC-008 | —              | —    |
| REQ-003 | AC-009, AC-010    | —              | —    |
| REQ-004 | AC-011 bis AC-014 | —              | —    |
| REQ-005 | AC-015, AC-016    | —              | —    |
| REQ-006 | AC-017 bis AC-020 | —              | —    |
| REQ-007 | AC-021 bis AC-024 | —              | —    |
| REQ-008 | AC-025 bis AC-027 | —              | —    |
| REQ-009 | AC-028 bis AC-032 | —              | —    |
| REQ-010 | AC-033 bis AC-038 | —              | —    |
