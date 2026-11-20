---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-20
---

# 0011 — Übersicht und Haushalt

## Problem

Die Startseite (bis 21.11.2026 „Heute“, jetzt „Übersicht“) kennt nur die laufende Woche. Man kann
nicht nachsehen, was nächste Woche ansteht, und in der kleinen Wochenleiste passt je Tag nur ein
Eintrag, obwohl ein Tag jetzt Vormittag, Mittag und Abend mit mehreren Einträgen hat. „Wie war's?“
fragt nur das letzte Rezept von gestern ab, in ganzen Sternen; Restaurants und Aktivitäten vom
Wochenende gehen unter. Beim Abhaken einer Aufgabe rutscht die Liste sofort nach, und „Was anderes
erledigt?“ nimmt nur Freitext: Die passende Aufgabe wird nicht gefunden, und ihr nächster Termin
bleibt, als wäre nichts passiert. Im Haushalt lassen sich Aufgaben nicht bearbeiten, die Breite
springt zwischen den Ansichten, und der Verlauf ist eine lange, ungegliederte Liste.

## Ziel

- Auf der „Übersicht“ blättert man beliebig weit durch die Wochen, tippt einen Tag an und sieht
  alles, was an diesem Tag geplant und zu tun ist. Ein Tipp führt zurück zu heute, einer in den
  Kalender.
- „Wie war's?“ listet alles Unbewertete der letzten drei Tage: Rezepte, Sammlungen, Restaurants und
  Aktivitäten. Bewertet wird in halben Sternen; die Zeile räumt sich danach selbst weg.
- Aufgaben hakt man ab wie überall in der App: durchgestrichen, nochmal tippen nimmt zurück, zwei
  Sekunden nach dem letzten Tipp ist es gebucht.
- „Was anderes erledigt?“ findet vorhandene Aufgaben, rechnet ihren nächsten Termin richtig weiter
  und legt Fehlendes als Aufgabe „bei Bedarf“ an, die beim nächsten Mal gefunden wird.
- Im Haushalt öffnet ein Tipp die Aufgabe zum Bearbeiten, die Breite bleibt zwischen „Anstehend“,
  „Alle“ und „Verlauf“ gleich, und der Verlauf ist nach Monat und Woche gegliedert.

## Nicht-Ziele

- **Kein Kalender auf der „Übersicht“.** Woche, Monat und Jahr sind Spec 0010; die „Übersicht“
  verlinkt nur dorthin.
- **Keine Uhrzeiten an Aufgaben und keine Erinnerungen.** Kommen mit Spec 0013.
- **Keine Karte „Reisetasche“.** Kommt mit Spec 0012.
- **Keine weiteren Haushaltsplan-Funktionen aus F7:** kein „Abgeben“, kein „Neu verteilen“, keine
  Unteraufgaben, keine Filter im Verlauf.
- **Keine andere Auswahl in „Anstehend“, „Alle“ und „Zu tun“.** Welche Aufgaben dort stehen, bleibt
  wie gebaut; einzig der Rhythmus „bei Bedarf“ kommt dazu.
- **Kein Abhaken von Aufgaben ohne Netz.** Offline schreiben bleibt den Laden-Aktionen vorbehalten
  (ADR-0008, Nachtrag).
- **Keine Bewertung von Freitext und Resten**, und „Wie war's?“ fragt die Rezepte einer Sammlung
  nicht einzeln ab.
- **Keine Startseite, die sich der Tageszeit anpasst** („Heute Abend“ ab 16 Uhr aus F2).

## Konzept in Kürze

Grundlage ist das freigegebene UI-Konzept v2 (`docs/product/ui-konzept-v2.md`, Abschnitte 2.5, 3.1,
3.10, 4.5, 4.6; Entscheidungen D1, D3, D6 bis D9, D19, D27).

**Geändert am 21.11.2026 — „Übersicht“ statt „Heute“:** Weil die Seite durch die Wochen blättert,
heißt der Tab „Übersicht“ (Beschriftung: Spec 0005, AC-061). In dieser Spec ist der neue Name
überall eingesetzt, wo die Seite gemeint ist; die Kriterien ändern sich sonst nicht. „Heute“
bleibt der Knopf, der zum heutigen Tag zurückführt, und steckt in „Heute geplant“. Adresse `/`
und die Test-IDs `tab-index` und `today-*` bleiben (AC-062). Das Layout am Desktop heißt weiter
„Übersicht“ (Spec 0005); es ist das Layout dieser Seite.

- **Kopf der „Übersicht“:** Titel mit dem gezeigten Tag, darunter ‹ „Diese Woche · KW 47“ ›. Sobald
  eine andere Woche oder ein anderer Tag zu sehen ist, steht in der Mitte der Knopf „Heute“. Rechts
  das Kalender-Symbol (öffnet den Kalender in der gezeigten Woche), ⊞ Verwalten und der Avatar
  (Spec 0005).
- **Wochenleiste oben** statt „Diese Woche“ unten. Ein Tipp auf einen Tag zeigt die ganze Seite für
  diesen Tag, als wäre er heute (D6): „Geplant am Samstag“, „Zu tun am Samstag“, „Für morgen“ und
  eine ruhige Zeile zu Abwesenheiten. Je Tag bis zu drei Punkte in den Farben der Arten (D19),
  darunter Abwesenheiten als Streifen (Regeln aus Spec 0010). Am Desktop sind die Tage Kacheln mit
  Foto und Titel des ersten Eintrags und „+2“.
- **„Heute geplant“** bzw. „Geplant am …“: Karten in der Reihenfolge der Tageszeiten und Arten
  (Spec 0004) mit Kennzeichen (Rezept, Sammlung, Restaurant, Aktivität), Tageszeit, Zusatz, wer
  kocht und „Route“ bei Ort. Handy: waagerecht wischbar (D7), ab vier Einträgen „Alle n ›“.
  Desktop: Raster mit großen Fotos.
- **„Wie war's?“** (nur, wenn heute gezeigt wird; Offene Frage 2): die unbewerteten Einträge von
  gestern, vorgestern und dem Tag davor (D8), alle vier Arten, halbe Sterne (D9), „Nicht gemacht“
  je Zeile. Nach dem Bewerten gleitet die Zeile 2 s nach dem letzten Tipp weg (2.5).
- **Halbe Sterne:** Diese Spec bringt das Speichern in halben Schritten samt Übernahme der
  vorhandenen Bewertungen (Konzept 4.5) und baut den Sterne-Baustein mit seiner Bedienung
  (REQ-004). Sie kommt in Welle 3 vor Spec 0008 (Welle 4), die den Baustein auf der neu gestalteten
  Rezept- und Restaurantseite einsetzt (Spec 0008, REQ-011).
- **„Zu tun“ und Haushalt „Anstehend“:** Abhaken mit Sammel-Fenster (Spec 0005, D3). Gebucht wird
  erst, wenn das Fenster abläuft. Der Hinweis „Erledigt von dir · Nadja“ entfällt; wer es war,
  ändert man im Verlauf.
- **„Was anderes erledigt?“** (großes Fenster, auf der „Übersicht“ und im Haushalt): Suchen oder
  anlegen (Spec 0005) über alle Aufgaben, darunter „Erledigt von“ und „heute ▾“ (gestern,
  vorgestern). Kein Treffer: neue Aufgabe „bei Bedarf“ (D27); mit „Mehr Angaben ▸“ gleich eine
  geplante Aufgabe.
- **Haushalt:** Ansichts-Tabs Anstehend · Alle · Verlauf (D1) mit einer Inhaltsbreite; am Desktop
  „Alle“ und „Verlauf“ als Liste und Detail. Ein Tipp öffnet die Aufgabe mit Aktionen, „Bearbeiten“
  und „Löschen“. Der Verlauf gliedert sich in Monate und Wochen; eine Jahreszahl trennt die Jahre.
- **Reihenfolge der Seite:** Handy: Kopf, Wochenleiste, Geplant, Für morgen, Wie war's?, Zu tun,
  Einkauf. Desktop (Layout „Übersicht“, 1,6 : 1): links Wochenleiste, Geplant und Für morgen; rechts
  Wie war's?, Zu tun und Einkauf.
- **Unverändert:** „Einkauf“ (offen, Vorschau, „Einkaufen“; gilt für die eine Liste aus Spec 0006)
  und die Vorbereitung „Für morgen“ aus dem Vorlauf.

## Abhängigkeiten und kritischer Pfad

| Spec | Was diese Spec daraus braucht                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0004 | Vormittag, Aktivitäten, „Heute geplant“ mit Kennzeichen, Reihenfolge in der Tageszeit                                                             |
| 0005 | Abhak-Baustein mit Sammel-Fenster, Ansichts-Tabs, feste Fenstergrößen, „Suchen oder anlegen“ mit Bremse gegen Doppelte, Layout „Liste und Detail“ |
| 0006 | eine Einkaufsliste für die Karte „Einkauf“                                                                                                        |
| 0008 | nichts: 0008 kommt später (Welle 4) und setzt den hier gebauten Sterne-Baustein ein (Spec 0008, REQ-011)                                          |
| 0009 | Art „Sammlung“; AC-012, AC-024 und die Zeile „Grillabend“ in AC-015 sind erst damit prüfbar                                                       |
| 0010 | Kalender (Woche öffnen, Tag zeigen), Regeln der Abwesenheits-Streifen, berechnete künftige Aufgaben-Termine der Haushalt-Zeile                    |

**Kritischer Pfad:** Diese Spec enthält zwei Migrationen (Bewertungen in halben Schritten mit
Übernahme der vorhandenen Werte; ein Rhythmus-Wert mehr) und Löschen von Daten (Aufgabe löschen,
Verlaufseintrag entfernen). Der Plan braucht dafür ein kurzes Bedrohungsmodell, Negativtests
(fremder Haushalt, abgemeldet, ungültige Eingabe, Fehlerfall) und `/security-check`.

## Anforderungen und Akzeptanzkriterien

Beispieldatum ist, wenn nicht anders genannt, **Freitag, 20.11.2026** (KW 47). Der Haushalt
„Enrico & Nadja“ hat die Mitglieder Enrico (E) und Nadja (N). Handybreite ist 390 px,
Desktopbreite 1440 px.

### REQ-001 — Woche blättern und Tag wählen

> Auf der „Übersicht“ blättert man mit ‹ › beliebig weit durch die Wochen und wählt in der
> Wochenleiste einen Tag; die ganze Seite zeigt dann diesen Tag, als wäre er heute.

**Offline:** offline vollständig — liest nur aus dem lokalen Speicher, schreibt nichts.

**AC-001 — Start**

```gherkin
Angenommen  es ist Freitag, 20.11.2026, 8 Uhr, und Enrico öffnet die „Übersicht“
Dann        steht oben „Freitag, 20. November“ und „Guten Morgen, Enrico“
Und         zwischen ‹ und › steht „Diese Woche · KW 47“
Und         die Wochenleiste zeigt Mo 16. bis So 22., Freitag ist gewählt
```

**AC-002 — Anderen Tag wählen und zurück**

```gherkin
Angenommen  die „Übersicht“ zeigt Freitag, 20.11.2026
Wenn        ich in der Wochenleiste auf Samstag tippe
Dann        heißt der Titel „Morgen, Samstag 21. November“
Und         die Abschnitte heißen „Geplant am Samstag“ und „Zu tun am Samstag“
Und         zwischen ‹ und › steht statt „Diese Woche · KW 47“ der Knopf „Heute“
Wenn        ich auf „Heute“ tippe
Dann        ist wieder Freitag gewählt, und zwischen ‹ und › steht „Diese Woche · KW 47“
```

**AC-003 — Blättern (Annahme, Offene Frage 2)**

```gherkin
Angenommen  die „Übersicht“ zeigt Freitag, 20.11.2026
Wenn        ich zweimal auf › tippe
Dann        zeigt die Wochenleiste KW 49 mit Mo 30. November bis So 6. Dezember
Und         gewählt ist Freitag, 4. Dezember, und der Titel heißt „Freitag, 4. Dezember“
Wenn        ich fünfmal auf ‹ tippe
Dann        zeigt die Wochenleiste KW 46 mit Mo 9. bis So 15. November, gewählt ist Freitag, 13.
```

**AC-004 — In den Kalender**

```gherkin
Angenommen  die „Übersicht“ zeigt Samstag, 28.11.2026 (KW 48)
Wenn        ich oben rechts auf das Kalender-Symbol tippe
Dann        öffnet sich der Kalender in der Ansicht „Woche“ mit „KW 48 · 23.–29. Nov“
```

**AC-005 — Punkte und Streifen in der Wochenleiste**

```gherkin
Angenommen  am Donnerstag, 19.11., stehen die Rezepte „Shakshuka“ und „Linsen-Dal“ und das
            Restaurant „Trattoria Da Enzo“
Und         Nadja ist von Samstag, 21.11., bis Donnerstag, 26.11., abwesend
Wenn        ich die „Übersicht“ in Handybreite öffne
Dann        trägt Donnerstag genau zwei Punkte: einen in der Farbe für Rezepte, einen in der Farbe
            für Restaurants
Und         unter Samstag und Sonntag liegt ein Streifen in Nadjas Mitgliederfarbe
```

**AC-006 — Kacheln am Desktop**

```gherkin
Angenommen  heute stehen „Bouldern“ am Vormittag sowie „Lasagne“ und „Trattoria Da Enzo“ am Abend
Wenn        ich die „Übersicht“ in Desktopbreite öffne
Dann        zeigt die Kachel für Freitag das Foto und den Titel von „Bouldern“ und „+2“
```

**AC-007 — Abwesenheit als ruhige Zeile (Annahme, Offene Frage 2)**

```gherkin
Angenommen  Nadja ist von Samstag, 21.11., bis Donnerstag, 26.11., abwesend, Notiz „Urlaub Mallorca“
Wenn        ich auf der „Übersicht“ Montag, 23.11., wähle
Dann        steht auf der Seite die Zeile „Nadja · Urlaub Mallorca · bis Do 26.11.“
Wenn        ich Freitag, 27.11., wähle
Dann        fehlt die Zeile
Wenn        die Abwesenheit keine Notiz hat und ich Montag, 23.11., wähle
Dann        heißt die Zeile „Nadja ist abwesend bis Do 26.11.“
```

**AC-008 — Rückweg behält den Tag (Annahme, Offene Frage 2)**

```gherkin
Angenommen  die „Übersicht“ zeigt Samstag, 21.11.
Wenn        ich die Karte „Kürbissuppe“ öffne und zurückgehe
Dann        zeigt die „Übersicht“ wieder Samstag, 21.11.
Wenn        ich die App schließe und am nächsten Tag neu starte
Dann        zeigt die „Übersicht“ den neuen heutigen Tag
```

**AC-062 — Name „Übersicht“, Knopf „Heute“** (neu am 21.11.2026)

```gherkin
Angenommen  es ist Freitag, 20.11.2026, 8 Uhr, und die „Übersicht“ zeigt Freitag, 4.12.2026 (KW 49)
Dann        heißt der aktive Tab „Übersicht“, und zwischen ‹ und › steht der Knopf „Heute“
Wenn        ich auf „Heute“ tippe
Dann        zeigt die Seite Freitag, 20.11.2026, mit „Guten Morgen, Enrico“ und „Diese Woche · KW
            47“
Und         der Tab heißt weiter „Übersicht“, die Adresse ist `/`
Und         die Karten und Abschnitte tragen dieselben Test-IDs wie vor der Umbenennung (`today-*`)
```

### REQ-002 — Geplantes des gezeigten Tags

> Der gezeigte Tag listet alles Geplante als Karten in der Reihenfolge des Tages; auf dem Handy
> wischt man waagerecht durch sie.

**Offline:** offline vollständig — nur Anzeige; „Route“ öffnet eine Karten-App, die selbst Netz
braucht.

**AC-009 — Überblick** (ersetzt Spec 0001, AC-017; ergänzt Spec 0004, AC-019, das gültig bleibt)

```gherkin
Angenommen  heute stehen „Bouldern“ (Aktivität, Vormittag, Zusatz „Boulderhalle Ost“), „Lasagne“
            (Rezept, Abend, Enrico kocht) und „Trattoria Da Enzo“ (Restaurant, Abend)
Und         morgen steht ein Rezept mit dem Vorlauf „Kichererbsen einweichen, 12 Stunden vorher“
Und         „Bad putzen“ ist heute fällig, und auf der Einkaufsliste sind 12 Posten offen
Wenn        ich die „Übersicht“ öffne
Dann        stehen unter „Heute geplant“ die Karten „Bouldern (Boulderhalle Ost)“, „Lasagne“ und
            „Trattoria Da Enzo“ in dieser Reihenfolge
Und         jede Karte trägt ihr Kennzeichen und ihre Tageszeit, „Lasagne“ zusätzlich Enricos Avatar
Und         darunter stehen „Für morgen: Kichererbsen einweichen (12 h)“, unter „Zu tun“ „Bad
            putzen“ und bei „Einkauf“ „12 offen“ mit „Einkaufen“
```

**AC-010 — Waagerecht wischbar (D7)**

```gherkin
Angenommen  heute stehen drei Einträge
Wenn        ich die „Übersicht“ in Handybreite öffne
Dann        stehen die drei Karten nebeneinander in einer Zeile, die sich waagerecht wischen lässt,
            und die dritte ist am rechten Rand angeschnitten
Und         mit sechs statt drei Einträgen beginnt „Zu tun“ an derselben Stelle der Seite
Wenn        ich die „Übersicht“ in Desktopbreite öffne
Dann        stehen die Karten in einem Raster mit Fotos im Format 16:10
```

**AC-011 — Ab vier Einträgen „Alle n ›“**

```gherkin
Angenommen  am Samstag, 21.11., stehen fünf Einträge, am Sonntag, 22.11., drei
Wenn        ich Samstag wähle
Dann        steht rechts neben „Geplant am Samstag“ „Alle 5 ›“
Wenn        ich darauf tippe
Dann        öffnet sich der Kalender in der Woche mit Samstag, 21.11.
Wenn        ich stattdessen Sonntag wähle
Dann        fehlt „Alle 3 ›“
```

**AC-012 — Sammlung** (prüfbar ab Spec 0009)

```gherkin
Angenommen  am Sonntag, 22.11., ist die Sammlung „Grillabend“ zum Abend eingeplant
Wenn        ich Sonntag wähle
Dann        trägt ihre Karte das Kennzeichen „Sammlung“, das Foto der Sammlung und „Abend“
```

**AC-013 — Leerer Tag**

```gherkin
Angenommen  für Sonntag, 22.11., ist nichts geplant
Wenn        ich Sonntag wähle
Dann        steht unter „Geplant am Sonntag“ „Nichts geplant“ mit „Im Kalender planen ›“
Wenn        ich darauf tippe
Dann        öffnet sich der Kalender in der Woche mit Sonntag, 22.11.
```

**AC-014 — „Für morgen“ am gezeigten Tag**

```gherkin
Angenommen  für Sonntag, 22.11., ist „Hummus“ mit dem Vorlauf „Kichererbsen einweichen, 12 Stunden
            vorher“ geplant
Wenn        ich Samstag, 21.11., wähle
Dann        steht dort „Für morgen: Kichererbsen einweichen (12 h)“
Wenn        ich Freitag, 20.11., wähle
Dann        fehlt dieser Hinweis
```

### REQ-003 — „Wie war's?“ für alles Planbare der letzten drei Tage

> Zeigt die „Übersicht“ den heutigen Tag, fragt „Wie war's?“ jede Person nach ihren unbewerteten
> Rezepten, Sammlungen, Restaurants und Aktivitäten von gestern, vorgestern und dem Tag davor;
> bewertet wird in halben Sternen.

**Offline:** offline lesend — die Liste ist sichtbar; Bewerten und „Nicht gemacht“ schreiben und
brauchen deshalb Netz (ADR-0008).

**AC-015 — Was abgefragt wird (Reihenfolge: Annahme, Offene Frage 2)**

```gherkin
Angenommen  heute ist Montag, 23.11.2026, Enrico stand überall unter „Wer isst mit?“ und hat
            nichts davon bewertet
Und         Fr 20.11.: Rezept „Lasagne“; Sa 21.11.: Restaurant „Trattoria Da Enzo“;
            So 22.11.: Aktivität „Bouldern“ (Vormittag) und Sammlung „Grillabend“ (Abend)
Und         Do 19.11.: Rezept „Mango-Curry“
Wenn        Enrico die „Übersicht“ öffnet
Dann        listet „Wie war's?“ „Bouldern“, „Grillabend“, „Trattoria Da Enzo“ und „Lasagne“ in dieser
            Reihenfolge, jeweils mit Bild, Name, Kennzeichen und leeren Sternen
Und         „Mango-Curry“ fehlt, weil es vier Tage her ist
```

„Grillabend“ erscheint erst mit Spec 0009; bis dahin gilt das Kriterium ohne diese Zeile.

**AC-016 — Was nicht abgefragt wird (Teil „Wer isst mit?“: Annahme, Offene Frage 1)**

```gherkin
Angenommen  heute ist Montag, 23.11.2026
Und         gestern standen der Freitext „Essen bei Oma“, „Reste von Lasagne“ und das Rezept „Pizza“,
            das als „nicht gekocht“ markiert ist
Und         vorgestern stand „Shakshuka“, bei dem Enrico nicht unter „Wer isst mit?“ stand
Wenn        Enrico die „Übersicht“ öffnet
Dann        erscheint keiner dieser Einträge unter „Wie war's?“
Und         bei Nadja, die bei „Shakshuka“ mitgegessen hat, steht „Shakshuka“ unter „Wie war's?“
```

**AC-017 — Halbe Sterne setzen**

```gherkin
Angenommen  „Lasagne“ steht unbewertet unter „Wie war's?“
Wenn        ich auf die linke Hälfte des fünften Sterns tippe
Dann        zeigt die Zeile viereinhalb Sterne
Und         2 Sekunden nach dem Tipp gleitet die Zeile aus „Wie war's?“
Und         die Rezeptseite „Lasagne“ zeigt meine Bewertung 4,5, auch auf Nadjas Gerät
```

**AC-018 — Vorfüllen beim Darüberfahren**

```gherkin
Angenommen  Desktopbreite, „Bouldern“ steht unbewertet unter „Wie war's?“
Wenn        ich mit der Maus über die linke Hälfte des vierten Sterns fahre
Dann        sind dreieinhalb Sterne gefüllt, bevor ich klicke
Wenn        ich die Maus wegbewege, ohne zu klicken
Dann        sind die Sterne wieder leer, und es ist nichts gespeichert
```

**AC-019 — Korrigieren im Sammel-Fenster**

```gherkin
Angenommen  „Trattoria Da Enzo“ steht unbewertet unter „Wie war's?“
Wenn        ich auf den dritten Stern tippe und eine Sekunde später auf den vierten
Dann        bleibt die Zeile stehen, bis 2 Sekunden nach dem letzten Tipp vergangen sind
Und         gespeichert ist meine Bewertung 4
```

**AC-020 — Wieder auf dem Plan (Annahme, Offene Frage 1)**

```gherkin
Angenommen  Enrico hat „Lasagne“ am 1.10.2026 mit 5 Sternen bewertet
Und         „Lasagne“ stand am Samstag, 21.11., wieder im Kalender, Enrico hat mitgegessen
Wenn        Enrico am Montag, 23.11., die „Übersicht“ öffnet
Dann        steht „Lasagne“ unter „Wie war's?“, seine 5 Sterne sind vorausgefüllt
Wenn        er auf die rechte Hälfte des vierten Sterns tippt
Dann        ist seine Bewertung 4, die Zeile gleitet nach 2 Sekunden weg
Und         am Dienstag, 24.11., fragt „Wie war's?“ „Lasagne“ nicht mehr ab
```

**AC-021 — Nicht gemacht**

```gherkin
Angenommen  heute ist Montag, 23.11.2026, „Bouldern“ vom Sonntag steht unter „Wie war's?“
Und         davor stand „Bouldern“ zuletzt am 1.11. im Kalender
Wenn        ich bei „Bouldern“ auf „Nicht gemacht“ tippe
Dann        verschwindet „Bouldern“ aus „Wie war's?“, auch bei Nadja
Und         die Aktivität „Bouldern“ zeigt „Zuletzt: vor 22 Tagen“
```

**AC-022 — Nur am heutigen Tag (Annahme, Offene Frage 2)**

```gherkin
Angenommen  unter „Wie war's?“ stehen Einträge
Wenn        ich auf der „Übersicht“ einen anderen Tag als heute wähle
Dann        gibt es auf der Seite keinen Abschnitt „Wie war's?“
```

**AC-023 — Nichts offen und offline**

```gherkin
Angenommen  ich habe alles der letzten drei Tage bewertet
Wenn        ich die „Übersicht“ öffne
Dann        gibt es keinen Abschnitt „Wie war's?“
Angenommen  unter „Wie war's?“ steht „Lasagne“, und das Gerät ist offline
Dann        sind die Sterne und „Nicht gemacht“ ausgegraut mit „Offline – zum Bearbeiten brauchst du
            Netz“
```

**AC-024 — Sammlung als Ganzes** (prüfbar ab Spec 0009)

```gherkin
Angenommen  die Sammlung „Grillabend“ enthält das Rezept „Kartoffelsalat“, das ich mit 3 bewertet
            habe, und „Grillabend“ steht unter „Wie war's?“
Wenn        ich „Grillabend“ mit 4 Sternen bewerte
Dann        hat „Grillabend“ meine Bewertung 4
Und         „Kartoffelsalat“ behält meine 3, und „Wie war's?“ fragt es nicht einzeln ab
```

### REQ-004 — Bewertungen in halben Schritten

> Bewertungen von Rezepten (auch Sammlungen), Restaurants und Aktivitäten werden in halben Schritten
> von 0,5 bis 5 gespeichert; vorhandene ganze Sterne bleiben erhalten.

**Offline:** nur online — Bewerten ist Schreiben (ADR-0008); die Anzeige geht offline.

**Sterne-Baustein (gebaut in dieser Spec, Eigentümerin der Bedienung):**

- **Maus:** Beim Darüberfahren füllen sich die Sterne vor. Die linke Hälfte eines Sterns steht für
  einen halben, die rechte für einen vollen Stern. Ein Klick setzt den Wert; wer die Sterne ohne
  Klick verlässt, sieht wieder den gespeicherten Wert (AC-018).
- **Touch:** Tipp auf die linke oder rechte Hälfte eines Sterns (AC-017); Ziehen mit dem Finger
  über die Sterne füllt mit, Loslassen setzt.
- **Tastatur und Screenreader:** einstellbares Element in Schritten von 0,5, angesagt als
  „4,5 von 5 Sternen“.
- **Wo:** „Wie war's?“ und überall, wo heute eine Bewertung gesetzt wird (Rezept-, Restaurant- und
  Aktivitätsseite in ihrer heutigen Form), damit gespeicherte halbe Werte überall richtig stehen
  (Konzept 4.5). Die neu gestaltete Rezept- und Restaurantseite setzt ihn mit Spec 0008, REQ-011
  ein.

**AC-025 — Vorhandene Bewertungen bleiben**

```gherkin
Angenommen  Enrico hat „Mango-Curry“ mit 4 Sternen, Nadja „Trattoria Da Enzo“ mit 5 Sternen und
            „Bouldern“ mit 3 Sternen bewertet
Wenn        die neue Version läuft
Dann        zeigen alle drei unverändert 4, 5 bzw. 3 Sterne, auf allen Geräten
```

**AC-026 — Ungültige Werte**

```gherkin
Angenommen  Enrico ist angemeldet
Wenn        er über die Supabase-API für „Mango-Curry“ die Bewertung 4,3, 0 oder 5,5 setzen will
Dann        wird das abgelehnt, und seine Bewertung bleibt, wie sie war
```

**AC-027 — Nur die eigene, nur im eigenen Haushalt**

```gherkin
Angenommen  Nadja hat „Trattoria Da Enzo“ mit 5 Sternen bewertet
Wenn        Enrico über die Supabase-API Nadjas Bewertung ändern will
Dann        wird das abgelehnt, und Nadjas 5 Sterne bleiben
Wenn        ein Mitglied eines anderen Haushalts oder ein abgemeldeter Aufruf eine Bewertung von
            „Enrico & Nadja“ lesen oder setzen will
Dann        wird das ebenfalls abgelehnt
```

### REQ-005 — Aufgaben abhaken mit Sammel-Fenster

> In „Zu tun“ auf der „Übersicht“ und in „Anstehend“ im Haushalt hakt man Aufgaben mit dem
> Sammel-Fenster ab (Spec 0005); gebucht wird 2 Sekunden nach dem letzten Tipp oder sofort beim
> Verlassen der Seite.

**Offline:** nur online — eine Erledigung schreibt Verlauf und nächsten Termin, und Aufgaben sind
keine Laden-Aktion (ADR-0008). Ohne Netz sind die Haken ausgegraut mit Hinweis.

**AC-028 — Abhaken** (ersetzt Spec 0001, AC-035)

```gherkin
Angenommen  „Bad putzen“ ist heute fällig und Enrico zugeordnet
Wenn        Enrico unter „Zu tun“ auf den Haken bei „Bad putzen“ tippt
Dann        ist „Bad putzen“ abgehakt und durchgestrichen und bleibt an seiner Stelle
Und         2 Sekunden später gleitet die Zeile weg, und der Verlauf zeigt „Bad putzen · Enrico ·
            heute“
Und         es erscheint kein Hinweis mit „Rückgängig“ und keiner mit „Erledigt von dir · Nadja“
```

**AC-029 — Zurücknehmen im Fenster**

```gherkin
Angenommen  „Bad putzen“ und „Müll rausbringen“ sind heute fällig
Wenn        ich „Bad putzen“ abhake, nach 0,8 s „Müll rausbringen“ und nach 1,5 s noch einmal
            „Bad putzen“ antippe
Dann        ist „Bad putzen“ wieder offen und nicht durchgestrichen
Und         bei 3,5 s gleitet nur „Müll rausbringen“ weg
Und         der Verlauf enthält „Müll rausbringen“, aber keinen Eintrag zu „Bad putzen“
```

**AC-030 — Seite vorher verlassen**

```gherkin
Angenommen  ich habe „Bad putzen“ vor einer Sekunde abgehakt
Wenn        ich zum Tab „Essen“ wechsle
Dann        steht „Bad putzen · Enrico · heute“ sofort im Verlauf
```

**AC-031 — Andere Person war schneller**

```gherkin
Angenommen  „Bad putzen“ ist heute fällig, Nadja hat es um 10:02 erledigt, und Enricos Gerät zeigt
            das noch nicht
Wenn        Enrico „Bad putzen“ abhakt und das Fenster abläuft
Dann        entsteht keine zweite Erledigung, und der nächste Termin rückt nicht noch einmal weiter
Und         ein Hinweis sagt „Nadja war schneller (10:02)“
```

**AC-032 — Andere Tage nur zur Ansicht (Überschrift „Erledigt am …“: Annahme, Offene Frage 2)**

```gherkin
Angenommen  „Küche wischen“ (Enrico) ist laut Rhythmus am Samstag, 21.11., fällig
Und         Nadja hat am Mittwoch, 18.11., „Fenster Wohnzimmer“ erledigt
Wenn        ich auf der „Übersicht“ Samstag, 21.11., wähle
Dann        steht unter „Zu tun am Samstag“ „Küche wischen“ mit Enricos Avatar, ohne Haken zum
            Antippen, und „Was anderes erledigt?“ fehlt
Wenn        ich Mittwoch, 18.11., wähle
Dann        steht unter „Erledigt am Mittwoch“ „✓ Fenster Wohnzimmer“ mit Nadjas Avatar, ohne Haken
            zum Antippen
```

**AC-033 — „Anstehend“ im Haushalt**

```gherkin
Angenommen  „Bettwäsche wechseln“ steht im Haushalt unter „Anstehend“
Wenn        ich auf ihren Haken tippe
Dann        ist sie durchgestrichen, gleitet 2 Sekunden später weg und steht im Verlauf
```

**AC-034 — Offline und Abbruch**

```gherkin
Angenommen  das Gerät ist offline
Dann        sind die Haken unter „Zu tun“ ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“
Angenommen  ich habe „Bad putzen“ abgehakt, und das Netz bricht ab, bevor das Fenster abläuft
Wenn        das Buchen deshalb scheitert
Dann        steht „Bad putzen“ wieder offen da, mit „Hat nicht geklappt – bitte noch einmal versuchen“
```

### REQ-006 — „Was anderes erledigt?“ mit Suche

> Im großen Fenster „Was hast du erledigt?“ sucht man über alle Aufgaben; ein Treffer gilt als am
> gewählten Tag (heute, gestern, vorgestern) von der gewählten Person erledigt, und sein nächster
> Termin rechnet wie beim Abhaken weiter. Ohne Treffer entsteht eine neue Aufgabe.

**Offline:** nur online — Suchen geht offline, „Als erledigt eintragen“ ist ohne Netz ausgegraut
mit Hinweis.

**AC-035 — Suchen**

```gherkin
Angenommen  es gibt die Aufgaben „Fenster Wohnzimmer“ (alle 2 Monate) und „Fenster Küche“ (bei
            Bedarf)
Wenn        ich auf der „Übersicht“ „Was anderes erledigt?“ öffne und „fenster“ tippe
Dann        stehen unter „Aufgaben“ „Fenster Wohnzimmer · alle 2 Monate“ und „Fenster Küche · bei
            Bedarf“
Und         darunter steht „+ „fenster“ als neue Aufgabe“ mit „▸ Mehr Angaben (Rhythmus, wer)“
Und         unten stehen „Erledigt von“ mit (E) gewählt, „heute ▾“ und „Als erledigt eintragen“
```

**AC-036 — Flexibler Rhythmus rechnet ab dem Tag**

```gherkin
Angenommen  „Bettwäsche wechseln“ hat den Rhythmus „etwa alle 14 Tage“, zuletzt erledigt am 10.11.,
            nächster Termin 24.11.
Wenn        ich sie wähle, „Erledigt von“ auf Nadja stelle und „Als erledigt eintragen“ tippe
Dann        zeigt der Verlauf „Bettwäsche wechseln · Nadja · heute“
Und         der nächste Termin ist der 4.12.
```

**AC-037 — Fester Rhythmus zählt für den anstehenden Termin**

```gherkin
Angenommen  heute ist Mittwoch, 18.11.2026, „Bad putzen“ ist wöchentlich freitags, nächster Termin
            Freitag, 20.11.
Wenn        ich „Bad putzen“ über „Was anderes erledigt?“ als heute erledigt eintrage
Dann        ist der nächste Termin Freitag, 27.11.
Und         am Freitag, 20.11., steht „Bad putzen“ nicht unter „Zu tun“
```

**AC-038 — Gestern**

```gherkin
Angenommen  „Bettwäsche wechseln“ wie in AC-036
Wenn        ich sie wähle, „heute ▾“ auf „gestern“ stelle und eintrage
Dann        steht der Eintrag im Verlauf am Donnerstag, 19.11., und der nächste Termin ist der 3.12.
```

**AC-039 — Kein Treffer: neue Aufgabe „bei Bedarf“** (D27; ersetzt Spec 0001, AC-037)

```gherkin
Angenommen  keine Aufgabe passt zu „Fenster putzen“
Wenn        ich „Fenster putzen“ tippe, „+ „Fenster putzen“ als neue Aufgabe“ wähle und eintrage
Dann        zeigt der Verlauf „Fenster putzen · Enrico · heute“ als Erledigung, nicht als „spontan“
Und         unter „Alle“ steht „Fenster putzen · bei Bedarf“, unter „Anstehend“ nicht
Und         beim nächsten Öffnen von „Was anderes erledigt?“ findet „fens“ die Aufgabe
            „Fenster putzen“
```

**AC-040 — Mit „Mehr Angaben“ gleich geplant**

```gherkin
Angenommen  es gibt keine Aufgabe „Pflanzen düngen“
Wenn        ich „Pflanzen düngen“ tippe, „▸ Mehr Angaben“ öffne, Rhythmus „etwa alle 14 Tage“ und
            Zuständigkeit „abwechselnd (E↔N)“ wähle und als von Enrico heute erledigt eintrage
Dann        gibt es die Aufgabe „Pflanzen düngen“ mit nächstem Termin 4.12., dran ist Nadja
Und         der Verlauf zeigt „Pflanzen düngen · Enrico · heute“
```

**AC-041 — Ähnlicher Name**

```gherkin
Angenommen  es gibt die Aufgabe „Fenster Küche“
Wenn        ich „Fenster Kuche“ tippe und „als neue Aufgabe“ wähle
Dann        fragt die Zeile „Meinst du Fenster Küche? [Ja] [Trotzdem neu]“
Wenn        ich „Ja“ wähle
Dann        ist „Fenster Küche“ gewählt, und es entsteht keine neue Aufgabe
```

**AC-042 — Leer und offline**

```gherkin
Angenommen  das Fenster ist offen, das Suchfeld ist leer und nichts ist gewählt
Dann        lässt sich „Als erledigt eintragen“ nicht wählen
Angenommen  das Gerät ist offline
Wenn        ich „fenster“ tippe
Dann        erscheinen die Treffer, und „Als erledigt eintragen“ ist ausgegraut mit „Offline – zum
            Bearbeiten brauchst du Netz“
```

### REQ-007 — Rhythmus „bei Bedarf“

> Eine Aufgabe kann den Rhythmus „bei Bedarf“ haben: Sie wird nie fällig, steht in „Alle“ und wird
> in „Was anderes erledigt?“ gefunden; wählbar beim Anlegen und Bearbeiten.

**Offline:** offline lesend; Anlegen und Ändern nur online.

**AC-043 — Nie fällig**

```gherkin
Angenommen  „Fenster Küche“ hat den Rhythmus „bei Bedarf“
Wenn        ich „Zu tun“ an beliebigen Tagen, „Anstehend“ und die Haushalt-Zeile im Kalender ansehe
Dann        erscheint „Fenster Küche“ dort nie als fällig oder geplant
Und         unter „Alle“ steht „Fenster Küche · bei Bedarf“
```

**AC-044 — Erledigen lässt den Rhythmus, wie er ist**

```gherkin
Angenommen  „Fenster Küche“ (bei Bedarf) wurde noch nie erledigt
Wenn        ich sie über „Was anderes erledigt?“ als heute erledigt eintrage
Dann        zeigt die Aufgabe „Zuletzt Fr 20.11.“ und weiterhin keinen nächsten Termin
```

**AC-045 — Umstellen und Bestand**

```gherkin
Angenommen  „Fenster Küche“ ist „monatlich am 1.“ und hat zwei Einträge im Verlauf
Und         im Verlauf stehen ältere Einträge „Fenster geputzt · spontan“
Wenn        ich den Rhythmus von „Fenster Küche“ auf „bei Bedarf“ ändere
Dann        verschwindet „Fenster Küche“ aus „Anstehend“, ihre zwei Verlaufseinträge bleiben
Und         die „spontan“-Einträge stehen unverändert im Verlauf
```

### REQ-008 — Haushalt mit Ansichts-Tabs und fester Breite

> Der Haushalt wechselt mit Ansichts-Tabs zwischen „Anstehend“, „Alle“ und „Verlauf“; alle drei
> nutzen dieselbe Inhaltsbreite, am Desktop stehen „Alle“ und „Verlauf“ als Liste und Detail.

**Offline:** offline vollständig — nur Anzeige.

**AC-046 — Tabs und gleiche Breite**

```gherkin
Angenommen  Desktopbreite, Haushalt „Anstehend“
Wenn        ich zu „Alle“ und dann zu „Verlauf“ wechsle
Dann        stehen „Anstehend · Alle · Verlauf“ als Ansichts-Tabs (Text, der aktive mit Akzentlinie),
            ohne Segment-Balken
Und         linker Rand und Breite des Inhalts sind in allen drei Tabs gleich
```

**AC-047 — Liste und Detail am Desktop**

```gherkin
Angenommen  Desktopbreite, Haushalt „Alle“, noch keine Aufgabe gewählt
Dann        steht links die Liste und rechts „Wähl eine Aufgabe aus“
Wenn        ich „Bad putzen“ wähle
Dann        steht „Bad putzen“ mit Details rechts, und die Liste bleibt links sichtbar
```

**AC-048 — Leerer Haushalt**

```gherkin
Angenommen  der Haushalt „Test“ hat keine Aufgaben
Wenn        ich „Alle“ öffne
Dann        sehe ich „Noch keine Aufgaben“ mit „Aufgabe anlegen“
```

### REQ-009 — Aufgabe öffnen, bearbeiten und löschen

> Ein Tipp auf eine Aufgabe öffnet sie (Handy: mittleres Fenster, Desktop: rechte Spalte) mit
> Rhythmus, Zuständigkeit, Aufwand, nächstem Termin, letzten Erledigungen und den Aktionen
> Erledigt, Später, Überspringen; im selben Fenster lassen sich Titel, Rhythmus, Zuständigkeit,
> Aufwand, Raum und Saison bearbeiten, und die Aufgabe lässt sich löschen.

**Offline:** offline lesend; Aktionen, Bearbeiten und Löschen nur online.

**AC-049 — Öffnen**

```gherkin
Angenommen  „Bad putzen“ ist wöchentlich freitags, Enrico, 2 Punkte, zuletzt erledigt am Fr 20.11.
            von Enrico
Wenn        ich in „Alle“ auf „Bad putzen“ tippe
Dann        zeigt das Fenster „wöchentlich Fr · Enrico · 2 Punkte“, „Nächstes Mal Fr 27.11.“ und
            „Zuletzt Fr 20.11. (E)“
Und         die Knöpfe „Erledigt“, „Später“, „Überspringen“, „Bearbeiten ›“ und „Löschen“
```

**AC-050 — Bearbeiten**

```gherkin
Angenommen  „Bad putzen“ ist geöffnet
Wenn        ich „Bearbeiten ›“ wähle, den Titel in „Bad gründlich putzen“, die Zuständigkeit in
            „abwechselnd (E↔N)“, den Aufwand in 3 Punkte, den Raum in „Bad“ und die Saison in
            „April–September“ ändere und speichere
Dann        zeigen „Alle“ und Nadjas Gerät „Bad gründlich putzen“ mit „E↔N“, 3 Punkten und Raum „Bad“
Und         das Fenster behält beim Wechsel zu „Bearbeiten“ und zurück seine Größe
```

**AC-051 — Rhythmus ändern (Annahme, Offene Frage 4)**

```gherkin
Angenommen  „Bad putzen“ ist wöchentlich freitags, zuletzt erledigt am Fr 20.11.
Wenn        ich den Rhythmus in „wöchentlich montags“ ändere und speichere
Dann        ist der nächste Termin Montag, 23.11.
Angenommen  „Keller aufräumen“ wurde noch nie erledigt
Wenn        ich ihren Rhythmus in „monatlich am 1.“ ändere
Dann        ist der nächste Termin Dienstag, 1.12.
```

**AC-052 — Fehlerfall: Titel leer**

```gherkin
Angenommen  „Bad putzen“ ist zum Bearbeiten geöffnet
Wenn        ich den Titel leere und speichern will
Dann        wird nichts gespeichert, und das Titelfeld zeigt „Titel fehlt“
```

**AC-053 — Löschen**

```gherkin
Angenommen  „Fenster Küche“ hat zwei Einträge im Verlauf
Wenn        ich „Fenster Küche“ öffne und „Löschen“ wähle
Dann        verschwindet sie aus „Anstehend“ und „Alle“, auch auf Nadjas Gerät
Und         ein Hinweis bietet 5 Sekunden lang „Rückgängig“
Und         die zwei Verlaufseinträge bleiben mit dem Titel „Fenster Küche“ stehen
```

**AC-054 — Gleichzeitig gelöscht**

```gherkin
Angenommen  Enrico bearbeitet „Fenster Küche“, und Nadja löscht sie in dieser Zeit
Wenn        Enrico speichert
Dann        bleibt „Fenster Küche“ gelöscht, und Enrico sieht „Hat nicht geklappt – bitte noch einmal
            versuchen“
```

**AC-055 — Fremder Haushalt und abgemeldet**

```gherkin
Angenommen  Aufgaben und Verlauf von „Enrico & Nadja“
Wenn        ein Mitglied eines anderen Haushalts oder ein abgemeldeter Aufruf über die Supabase-API
            eine Aufgabe oder einen Verlaufseintrag lesen, ändern, löschen oder anlegen will
Dann        wird das abgelehnt
```

### REQ-010 — Verlauf nach Monat und Woche

> Der Verlauf gliedert die Einträge in Monate, darin in Wochen, mit einer Jahreszahl beim
> Jahreswechsel; ein Tipp auf einen Eintrag ändert „Erledigt von“ oder entfernt ihn.

**Offline:** offline lesend; Ändern und Entfernen nur online.

**AC-056 — Gliederung**

```gherkin
Angenommen  Verlaufseinträge am Fr 20.11., Mi 18.11., Mo 16.11., So 15.11., So 1.11. und
            Fr 30.10.2026
Wenn        ich „Verlauf“ öffne
Dann        stehen die Überschriften in dieser Reihenfolge: „November 2026“, „KW 47 · 16.–22. Nov“
            (drei Einträge), „KW 46 · 9.–15. Nov“, „KW 44 · 1. Nov“, „Oktober 2026“,
            „KW 44 · 26.–31. Okt“
Und         es gibt keine Überschrift für KW 45, und nichts ist eingeklappt
```

**AC-057 — Jahreszahl**

```gherkin
Angenommen  der Verlauf aus AC-056 und ein Eintrag am Fr 12.12.2025
Wenn        ich zum Ende des Verlaufs scrolle
Dann        steht vor „Dezember 2025“ die Trennzeile „2025“
Und         für 2026 gibt es keine Trennzeile
```

**AC-058 — Zeile und klebende Überschrift**

```gherkin
Angenommen  der Verlauf aus AC-056
Dann        zeigt jede Zeile das Symbol der Art (erledigt, übersprungen, spontan), den Titel, den
            Avatar und den Tag, z. B. „Fr 20.“
Wenn        ich durch den November scrolle
Dann        bleibt „November 2026“ oben stehen, bis „Oktober 2026“ es ablöst
```

**AC-059 — „Erledigt von“ ändern**

```gherkin
Angenommen  „Bad putzen“ (abwechselnd E↔N) wurde zuletzt am Fr 20.11. von Enrico erledigt, dran ist
            Nadja
Wenn        ich den Eintrag antippe und „Erledigt von“ auf Nadja ändere
Dann        zeigt der Eintrag Nadjas Avatar, und dran ist jetzt Enrico
```

**AC-060 — Eintrag entfernen (Annahme, Offene Frage 3)**

```gherkin
Angenommen  „Bad putzen“ (wöchentlich freitags, Enrico) wurde heute versehentlich abgehakt; der
            nächste Termin ist dadurch Fr 27.11.
Wenn        ich den Eintrag im Verlauf antippe und „Eintrag entfernen“ wähle
Dann        ist der Eintrag weg, und „Bad putzen“ ist wieder heute fällig, zuständig Enrico
Angenommen  „Bad putzen“ hat außerdem einen Eintrag vom Fr 13.11.
Wenn        ich diesen älteren Eintrag entferne
Dann        ändern sich nächster Termin und Zuständigkeit nicht
```

**AC-061 — Leer und offline**

```gherkin
Angenommen  der Haushalt „Test“ hat keine Verlaufseinträge
Wenn        ich „Verlauf“ öffne
Dann        sehe ich „Noch nichts erledigt“
Angenommen  das Gerät ist offline
Wenn        ich einen Verlaufseintrag antippe
Dann        sind „Erledigt von“ und „Eintrag entfernen“ ausgegraut mit „Offline – zum Bearbeiten
            brauchst du Netz“
```

## Offline und Konflikte

Alles ist offline lesbar (Spec 0003). Geschrieben wird nur online; ohne Netz sind die Aktionen
ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“. Diese Spec fügt **keine** Offline-Aktion
hinzu. Bis der Server bestätigt, zeigt die App die Änderung schon an (Überlagerung, ADR-0011); lehnt
er ab, springt die Anzeige zurück mit „Hat nicht geklappt – bitte noch einmal versuchen“.

| Fall                                                      | Regel                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Zwei Personen bewerten dasselbe                           | keine Kollision: Bewertungen gelten je Person                                                                      |
| Zwei Personen haken dieselbe fällige Aufgabe ab           | eine Erledigung; die zweite Person sieht „Nadja war schneller (10:02)“ (F7). Braucht eine eigene RPC mit Bedingung |
| „Nicht gemacht“ und Bewerten gleichzeitig                 | „Nicht gemacht“ gilt für den Planeintrag, die Bewertung für die Person; beides bleibt bestehen                     |
| Zwei Personen bearbeiten dieselbe Aufgabe                 | letzte Änderung gewinnt je Feld (`sync.md`); der Rhythmus gilt als ein Feld                                        |
| Aufgabe gelöscht, während jemand sie bearbeitet oder hakt | Löschen bleibt; die andere Änderung wird abgelehnt und springt mit Hinweis zurück                                  |
| Netz bricht im Sammel-Fenster ab                          | Buchen scheitert, die Zeile steht wieder offen da, mit Hinweis (AC-034)                                            |
| Zwei Personen ändern denselben Verlaufseintrag            | letzte Änderung gewinnt; Entfernen gewinnt gegen Ändern                                                            |

## Plattformen

- **Handy:** Wochenleiste mit Punkten, „Heute geplant“ waagerecht wischbar, Aufgabe im mittleren
  Fenster, „Was anderes erledigt?“ im großen Fenster (Spec 0005).
- **Tablet und Desktop:** Layout „Übersicht“ auf der Seite „Übersicht“ mit Tageskacheln; Haushalt
  als „Liste und Detail“ in einer festen Inhaltsbreite. Die Sterne füllen sich beim Darüberfahren
  mit der Maus vor.
- **Zurück:** Zurück aus einer Detailseite führt zum zuvor gezeigten Tag; die Android-Zurück-Taste
  schließt zuerst ein offenes Fenster.
- **Barrierefreiheit:** Der Screenreader sagt „Bad putzen abgehakt“ bzw. „Haken entfernt“; die
  Sterne sind ein einstellbares Element in Schritten von 0,5 („4,5 von 5 Sternen“). Mit „Bewegung
  reduzieren“ werden Zeilen nur ausgeblendet, nicht verschoben.

## Daten

- **Gelesen:** Planeinträge, Rezepte, Sammlungen, Restaurants, Aktivitäten, Bewertungen,
  Abwesenheiten, Aufgaben, Verlauf, Einkaufsliste, Mitglieder.
- **Geschrieben:** Bewertungen je Person in halben Schritten, „nicht gekocht“ am Planeintrag,
  Erledigungen (neu, „Erledigt von“ geändert, entfernt), Aufgaben (neu, auch mit „bei Bedarf“,
  bearbeitet, gelöscht).
- **Datenbankänderungen:**
  - Bewertungen von Rezepten, Restaurants und Aktivitäten in halben Schritten (0,5 bis 5). Erweitern
    → umziehen → aufräumen: Vorhandene ganze Sterne werden übernommen (4 → 4,0); die alte Spalte
    fällt erst weg, wenn keine App-Version sie mehr liest (Konzept 4.5).
  - Ein Rhythmus-Wert mehr: „bei Bedarf“ (Konzept 4.6). Bestehende Daten bleiben, alte
    „spontan“-Einträge im Verlauf auch.
  - Nach der Annahme in Offener Frage 3 merkt sich eine Erledigung den Termin und die zuständige
    Person von davor.
- **Gelöscht:** Aufgaben (ihr Verlauf bleibt, der Verweis wird geleert, wie heute) und einzelne
  Verlaufseinträge.
- **Nur auf dem Gerät:** gezeigte Woche und gewählter Tag, solange die App läuft.
- **Personenbezogen:** wer was wann erledigt hat und wer wie bewertet; bleibt im Haushalt, keine
  neuen Felder zur Person.

## Offene Fragen

| #   | Frage                                                                                                                                      | Optionen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Empfehlung                                                                                       | Status           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------- |
| 1   | Wann gilt ein Eintrag für „Wie war's?“ als bewertet? Bewertungen hängen am Rezept, Restaurant oder an der Aktivität, nicht am Planeintrag. | A: Gefragt wird nur, wer unter „Wer isst mit?“ steht; ein Eintrag gilt als bewertet, wenn die eigene Bewertung am Tag des Eintrags oder später gesetzt wurde; Wiederholtes kommt mit den bisherigen Sternen vorausgefüllt — Pro: keine neue Tabelle, Lieblingsgerichte werden wieder gefragt; Contra: wer zwischendurch auf der Rezeptseite bewertet, wird nicht mehr gefragt · B: nur, was ich noch nie bewertet habe — Pro: am einfachsten; Contra: Wiederholtes wird nie mehr gefragt · C: eigener Merker je Eintrag und Person — Pro: genau; Contra: neue Tabelle mit Sync | A, weil es ohne Datenänderung auskommt und dem Ziel „Wochenende nicht vergessen“ (D8) entspricht | OFFEN, Annahme A |
| 2   | Kleinigkeiten der Tagesauswahl, die das Konzept offenlässt                                                                                 | A: (a) Blättern behält den Wochentag; (b) „Wie war's?“ nur, wenn heute gezeigt wird; (c) Titel: heute mit Gruß, gestern und morgen mit „Gestern, “ bzw. „Morgen, “, sonst Wochentag und Datum, in einem anderen Jahr mit Jahreszahl; (d) vergangene Tage heißen „Erledigt am …“ und zeigen den Verlauf; (e) Abwesenheitszeile mit der Notiz statt eines Anlasses (D22), ohne Notiz „ist abwesend“; (f) Zurück behält den Tag, ein neuer Start zeigt heute; (g) „Wie war's?“ zeigt den jüngsten Tag zuerst · B: anders festlegen                                                | A, weil es dem Muster „als wäre der Tag heute“ folgt und keine neuen Daten braucht               | OFFEN, Annahme A |
| 3   | Was bewirkt „Eintrag entfernen“ im Verlauf?                                                                                                | A: Entfernen der jüngsten Erledigung einer Aufgabe stellt nächsten Termin und Zuständigkeit wie davor wieder her; ältere Einträge verschwinden nur — Pro: Ein versehentlicher Haken lässt sich wirklich zurücknehmen (Konzept 2.5, Punkt 5); Contra: Die Erledigung muss sich den vorigen Stand merken (kleine Datenänderung) · B: nur den Eintrag entfernen — Pro: keine Datenänderung; Contra: Die Aufgabe bleibt bis zum nächsten Termin „erledigt“                                                                                                                         | A, weil „im Verlauf zurücknehmen“ der einzige Weg ist, nachdem das Sammel-Fenster abgelaufen ist | OFFEN, Annahme A |
| 4   | Was passiert mit dem nächsten Termin, wenn man den Rhythmus ändert?                                                                        | A: neu gerechnet — fester Rhythmus: der nächste passende Tag ab heute; flexibler Rhythmus: ab der letzten Erledigung, ohne Erledigung ab heute — Pro: vorhersehbar, nutzt die vorhandene Rechnung; Contra: ein bewusst verschobener Termin geht verloren · B: bleibt, bis man ihn verschiebt — Pro: nichts ändert sich ungefragt; Contra: Termin passt nicht zum neuen Rhythmus                                                                                                                                                                                                | A, weil ein Termin, der nicht zum Rhythmus passt, mehr verwirrt als ein verlorenes „Später“      | OFFEN, Annahme A |

## Rückverfolgbarkeit

| REQ     | AC                        | Task (plan.md) | Test |
| ------- | ------------------------- | -------------- | ---- |
| REQ-001 | AC-001 bis AC-008, AC-062 | —              | —    |
| REQ-002 | AC-009 bis AC-014         | —              | —    |
| REQ-003 | AC-015 bis AC-024         | —              | —    |
| REQ-004 | AC-025 bis AC-027         | —              | —    |
| REQ-005 | AC-028 bis AC-034         | —              | —    |
| REQ-006 | AC-035 bis AC-042         | —              | —    |
| REQ-007 | AC-043 bis AC-045         | —              | —    |
| REQ-008 | AC-046 bis AC-048         | —              | —    |
| REQ-009 | AC-049 bis AC-055         | —              | —    |
| REQ-010 | AC-056 bis AC-061         | —              | —    |
