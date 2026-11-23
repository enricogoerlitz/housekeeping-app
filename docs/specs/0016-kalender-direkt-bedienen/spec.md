---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-22
---

# 0016 — Kalender direkt bedienen

## Problem

Wer im Kalender etwas umplant, öffnet heute den Eintrag und tippt sich durch Chips, und das geht nur
innerhalb der Woche des Eintrags. Monat und Jahr sind fast nur zum Anschauen da: Ein Tipp im Jahr
springt in den Monat, „Tag öffnen“ springt in die Woche, und man verliert den Überblick, den man
gerade hatte. Eine Reise trägt man über ein Menü und zwei Datumsfelder ein, obwohl man die Tage
vor sich sieht. Und das Wort „Abwesenheit“ klingt nach Büro, nicht nach Zuhause.

## Ziel

- Geplante und vorgemerkte Einträge lassen sich in Woche, Monat und Jahr mit dem Finger oder der
  Maus an einen anderen Platz ziehen: in der Woche auf Tag und Tageszeit, in Monat und Jahr auf den
  Tag.
- Ein Tipp auf einen Tag in Monat oder Jahr wechselt nicht die Ansicht, sondern öffnet das
  **Tages-Fenster**: alles von diesem Tag, zum Ansehen und Bearbeiten.
- Zieht man über mehrere Tage, entsteht eine Reise für genau diesen Zeitraum.
- Alles, was sich ziehen lässt, geht auch ohne Ziehen, und zwar über jede Woche hinaus.
- In der Oberfläche heißt die Abwesenheit „Reise“.

## Nicht-Ziele

- **Keine Erinnerungen.** Die optionale Erinnerung an einem Eintrag ist Spec 0017.
- **Aufgaben werden nicht gezogen.** Ihre Termine rechnet der Haushalt aus dem Rhythmus (Spec 0011);
  den nächsten Termin von Hand zu setzen ist der Befund H-01 im Review und eine eigene Änderung.
- **Reise-Streifen werden nicht gezogen**, weder verschoben noch an den Enden verlängert. Zeitraum
  und Personen ändert man weiter im Fenster „Reise bearbeiten“ (Offene Frage 4).
- **Kein Kopieren durch Ziehen** und kein Ziehen mehrerer Einträge auf einmal.
- **Keine Uhrzeiten und keine Stundenansicht.** Ein Eintrag hat weiter Tag und Tageszeit.
- **Keine eigene Reihenfolge innerhalb einer Tageszeit.** Die Reihenfolge der Arten bleibt
  (Spec 0004); ein verschobener Eintrag steht in seiner Art am Ende.
- **Wer mitisst, Gäste, Portionen und Varianten am Eintrag ändern** (Befund K-01) und **die Esser
  einer neuen Reise automatisch anpassen** (K-02) gehören nicht dazu. Diese Spec weist nur darauf
  hin (AC-016).
- **Keine neuen Offline-Schreibvorgänge.** Verschieben und Reise eintragen bleiben online
  (ADR-0008).
- **Im Code bleibt der Begriff** `Absence` / `absences`; nur Texte und Adressen ändern sich.

## Konzept in Kürze

**Drei Bausteine, die zusammengehören**

| Baustein          | Was man tut                                                             | Wo                                                     |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| **Ziehen**        | Eintrag anfassen, auf Tag (und Tageszeit) ablegen                       | Woche, Monat, Jahr, Tages-Fenster, Leiste „Vorgemerkt“ |
| **Tages-Fenster** | Tag antippen, alles vom Tag sehen und bearbeiten                        | Monat und Jahr                                         |
| **Reise ziehen**  | über mehrere Tage ziehen, das Fenster „Reise eintragen“ kommt vorbelegt | Monat, Jahr, Woche ab 700 px                           |

**Wie die Gesten sich nicht in die Quere kommen**

| Geste                                | auf einem Eintrag            | auf einem Tag (freie Fläche, Tageszahl) |
| ------------------------------------ | ---------------------------- | --------------------------------------- |
| Tippen / Klicken                     | Eintragsfenster (wie bisher) | Monat, Jahr: Tages-Fenster              |
| Finger: gedrückt halten, dann ziehen | Eintrag verschieben          | Reise über die überstrichenen Tage      |
| Maus: drücken und ziehen             | Eintrag verschieben          | Reise über die überstrichenen Tage      |
| Wischen / Scrollen (ohne Halten)     | scrollt wie bisher           | scrollt wie bisher                      |

- **Anfassen:** Mit dem Finger hält man den Eintrag gedrückt, bis er sich abhebt (kurzes
  Vibrieren); mit der Maus beginnt das Ziehen, sobald man sich mit gedrückter Taste bewegt. Die
  genaue Haltedauer legt der Plan fest und folgt dem Üblichen der Plattform.
- **Unterwegs:** Der Eintrag hängt am Finger, sein alter Platz bleibt als blasser Umriss. Das Ziel
  unter dem Finger ist hervorgehoben, und am Eintrag steht, wo er landen würde („Fr 27.11. ·
  Abend“), weil der Finger das Ziel verdeckt.
- **Ziele:** Woche = Tag und Tageszeit. Monat und Jahr = Tag; die Tageszeit bleibt, wie sie war.
  Das Feld „Vorgemerkt“ nimmt dem Eintrag den Tag.
- **Über den Rand:** Hält man den Eintrag an den linken oder rechten Rand der Ansicht, blättert sie
  eine Woche, einen Monat oder ein Jahr weiter; oben und unten scrollt sie mit.
- **Kleine Raster:** In der Handy-Ansicht von Monat und im Jahr stehen im Raster nur Punkte. Dort
  zieht man Einträge **aus dem Tages-Fenster** oder aus der Leiste „Vorgemerkt“ auf einen Tag des
  Rasters; das Fenster macht sich dabei klein.
- **Danach:** Ein Hinweis nennt das Ergebnis und bietet 5 Sekunden „Rückgängig“.
- **Ohne Ziehen:** Das Eintragsfenster bekommt unter „Verschieben“ den Chip „Anderes Datum …“ mit
  einem Monatskalender ohne Grenze. Derselbe Baustein ersetzt die 14-Tage-Grenze bei „Einplanen“
  auf der Seite einer Aktivität. Das behebt die Befunde K-04 und A-01 aus
  `docs/product/review-logik-und-bedienung.md`.

**Tages-Fenster**

- **Handy:** ein Fenster von unten in halber Höhe; das Raster darüber bleibt bedienbar (anderen Tag
  antippen, blättern, Eintrag hineinziehen). Nach oben gezogen wird es groß, nach unten gezogen
  schließt es.
- **Ab 1100 px:** ein Bereich am rechten Rand neben dem Raster, mit ✕. Auf Tablets (700 bis
  1099 px) kommt es von unten wie auf dem Handy, damit das Raster breit bleibt (Offene Frage 8).
- **Inhalt:** Kopf mit Datum („FR 27. NOVEMBER“) und einer Wochenleiste Mo bis So zum Wechseln des
  Tags; Reise-Streifen des Tags; Aufgaben des Tags, wenn die Haushalt-Zeile für „Monat“
  eingeschaltet ist; danach **alle** Tageszeiten des Haushalts mit ihren Einträgen und je
  „+ Hinzufügen“; unten „Reise eintragen“ und „Woche anzeigen ›“.
- **Es ersetzt:** die Tagesliste unter dem Monatsraster auf dem Handy, das kleine Menü hinter
  „+n weitere“ samt „Tag öffnen ›“ am Desktop und den Sprung vom Jahr in den Monat beim Tipp auf
  einen Tag.

**Abhängigkeiten:** Spec 0010 (Kalender, Abwesenheiten, Reste), Spec 0004 (Tageszeiten), Spec 0005
(Fenstergrößen, „Rückgängig“-Hinweis), Spec 0012 (Urlaubsseite). Spec 0017 baut auf dem Baustein
„Anderes Datum …“ und auf dem Verschieben auf (Erinnerungen ziehen mit). Kein kritischer Pfad: Es
gibt keinen neuen Schreibweg und keine Änderung an der Datenbank; Verschieben und Reise eintragen
nutzen die vorhandenen Befehle.

**Ersetzt oder ändert:**

| Bisher                                                                                          | Neu                                                                                      |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Spec 0010, Nicht-Ziel „Kein neues Verschieben per Ziehen“                                       | REQ-001 bis REQ-004                                                                      |
| Spec 0010, AC-011: Tagesliste unter dem Monatsraster (Handy)                                    | AC-022: Tages-Fenster                                                                    |
| Spec 0010, REQ-004: „+n weitere“ mit kleinem Menü und „Tag öffnen ›“                            | AC-024: „+n weitere“ und die Tageszahl öffnen das Tages-Fenster                          |
| Spec 0010, REQ-005: ein Tipp auf einen Monat im Jahr öffnet den Monat                           | AC-023: Tipp auf einen Tag öffnet das Tages-Fenster, nur der Monatsname öffnet den Monat |
| Spec 0010, Regel „Wechsel der Ansicht“: Monat → Woche zeigt die Woche mit heute bzw. dem Ersten | AC-027: ist ein Tag gewählt, zeigt der Wechsel dessen Woche bzw. Monat                   |
| Gebauter Stand: „Verschieben“ nur auf die Tage der Woche des Eintrags                           | AC-019: „Anderes Datum …“ ohne Grenze                                                    |
| Gebauter Stand: „Einplanen“ einer Aktivität nur 14 Tage voraus                                  | AC-020                                                                                   |
| Spec 0010 und 0012: Texte „Abwesenheit“, „Abwesenheiten“, „abwesend“                            | REQ-008: „Reise“, „Reisen“, „unterwegs“                                                  |
| Adressen `/abwesenheiten` und `/kalender/urlaub/<id>`                                           | `/reisen` und `/kalender/reise/<id>`, ohne Weiterleitung (ADR-0012)                      |

## Anforderungen und Akzeptanzkriterien

Beispiele: Haushalt mit Enrico und Nadja, Tageszeiten Vormittag, Mittag, Abend. Heute ist Sonntag,
22.11.2026; die Woche darauf reicht von Montag, 23.11., bis Sonntag, 29.11.2026.

### REQ-001 — Einträge durch Ziehen verschieben

> Jeder Planeintrag (Rezept, Sammlung, Freitext, Reste, Restaurant, Aktivität) lässt sich mit Finger
> oder Maus anfassen und auf ein Ziel ablegen; tippen, scrollen und wischen bleiben, wie sie sind.

**Offline:** nur online. Offline lässt sich nichts anfassen; wer es versucht, sieht „Offline – zum
Bearbeiten brauchst du Netz“.

**Regeln:** Aufgaben der Haushalt-Zeile und Reise-Streifen lassen sich nicht anfassen. Abbrechen:
außerhalb eines Ziels loslassen, Escape, oder ein zweiter Finger. Ablegen auf dem alten Platz ändert
nichts und zeigt keinen Hinweis. Bei „Bewegung reduzieren“ gibt es keine Flug-Animation; der Eintrag
steht sofort am Ziel. Ein Screenreader hört „Lasagne angefasst“, das Ziel unter dem Finger und das
Ergebnis.

**AC-001 — Finger, Woche auf dem Handy**

```gherkin
Angenommen  Handybreite, Ansicht „Woche“ vom 23. bis 29.11.2026
Und         am Mittwoch, 25.11., steht abends „Lasagne“
Wenn        ich „Lasagne“ gedrückt halte, bis sie sich abhebt, und auf Freitag, 27.11., „Abend“ ziehe
Dann        ist das Feld „Fr 27.11. · Abend“ hervorgehoben und am Eintrag steht „Fr 27.11. · Abend“
Wenn        ich loslasse
Dann        steht „Lasagne“ am Freitag abends und nicht mehr am Mittwoch
Und         ein Hinweis zeigt „Lasagne → Fr 27.11., Abend“ mit „Rückgängig“
```

**AC-002 — Maus, Woche am Desktop**

```gherkin
Angenommen  Desktopbreite, Ansicht „Woche“ vom 23. bis 29.11.2026
Und         am Mittwoch steht abends „Lasagne“
Wenn        ich „Lasagne“ mit gedrückter Maustaste auf das Feld Donnerstag / Mittag ziehe und loslasse
Dann        steht „Lasagne“ am Donnerstag mittags
```

**AC-003 — Abbrechen**

```gherkin
Angenommen  ich ziehe „Lasagne“ vom Mittwoch weg
Wenn        ich sie über dem Kopf des Kalenders loslasse oder Escape drücke
Dann        gleitet sie an ihren Platz am Mittwoch abends zurück
Und         es wird nichts gespeichert und kein Hinweis erscheint
```

**AC-004 — Tippen und Scrollen bleiben**

```gherkin
Angenommen  Handybreite, Ansicht „Woche“
Wenn        ich „Lasagne“ kurz antippe
Dann        öffnet sich das Eintragsfenster wie bisher
Wenn        ich mit dem Finger auf „Lasagne“ beginne und ohne Halten nach oben wische
Dann        scrollt die Woche und nichts hebt sich ab
```

**AC-005 — Offline**

```gherkin
Angenommen  das Gerät ist offline
Wenn        ich „Lasagne“ gedrückt halte oder mit der Maus ziehe
Dann        hebt sich nichts ab
Und         es erscheint „Offline – zum Bearbeiten brauchst du Netz“
```

### REQ-002 — Ziele je Ansicht

> In der Woche ist das Ziel Tag und Tageszeit; in Monat und Jahr ist es der Tag, und die Tageszeit
> des Eintrags bleibt.

**Offline:** wie REQ-001.

**Regeln:** Während des Ziehens zeigt die Handy-Woche bei jedem Tag alle Tageszeiten des Haushalts
als Ziele, auch die leeren (sonst zeigt sie nur Tageszeiten mit Einträgen, Spec 0010, AC-008). Am
linken und rechten Rand der Ansicht liegen Zonen mit ‹ und ›: Hält man den Eintrag dort, blättert
die Ansicht um einen Zeitraum und nach kurzem Halten wieder. Beginnt das Ziehen in einer solchen
Zone, blättert sie erst, wenn der Zeiger sie einmal verlassen hat (geändert am 22.11.2026: Im
Handy-Raster liegt der Montag in der linken Zone, und eine Reise für einen einzelnen Tag hält man
oft am Rand; ohne die Ausnahme blätterte die Ansicht schon beim Anfassen).
Vergangene Tage sind erlaubte Ziele.
Am Desktop-Monat fasst man die Zeilen im Tagesfeld an; im Handy-Monat und im Jahr die Zeilen im
Tages-Fenster (REQ-006) und in der Leiste „Vorgemerkt“ (REQ-003).

**AC-006 — Handy-Woche zeigt alle Tageszeiten als Ziel**

```gherkin
Angenommen  Handybreite, Ansicht „Woche“; am Samstag, 28.11., steht nur abends „Trattoria Da Enzo“
Wenn        ich „Lasagne“ vom Mittwoch anfasse
Dann        zeigt der Samstag die Felder „Vormittag“, „Mittag“ und „Abend“
Wenn        ich auf „Mittag“ am Samstag loslasse
Dann        steht „Lasagne“ am Samstag mittags
Und         der Samstag zeigt wieder nur „Mittag“ und „Abend“
```

**AC-007 — Monat am Desktop: Tag wechselt, Tageszeit bleibt**

```gherkin
Angenommen  Desktopbreite, Ansicht „Monat“, November 2026; am Mittwoch, 25.11., steht abends „Lasagne“
Wenn        ich die Zeile „Lasagne“ auf das Feld des 30.11. ziehe und loslasse
Dann        steht „Lasagne“ am Montag, 30.11., abends
Und         der Hinweis zeigt „Lasagne → Mo 30.11., Abend“
```

**AC-008 — Jahr und Handy-Monat: aus dem Tages-Fenster auf das Raster**

```gherkin
Angenommen  Handybreite, Ansicht „Jahr“ 2026, das Tages-Fenster zeigt Mittwoch, 25.11., mit „Lasagne“ am Abend
Wenn        ich „Lasagne“ im Tages-Fenster anfasse
Dann        schrumpft das Fenster auf eine Zeile und das Raster ist frei
Wenn        ich „Lasagne“ auf den 12. Dezember ziehe und loslasse
Dann        steht „Lasagne“ am Samstag, 12.12.2026, abends
Und         das Tages-Fenster zeigt wieder den 25.11., jetzt ohne „Lasagne“
```

**AC-009 — Über den Rand blättern**

```gherkin
Angenommen  Ansicht „Woche“ vom 23. bis 29.11.2026, ich ziehe „Lasagne“
Wenn        ich sie an den rechten Rand halte
Dann        blättert die Ansicht zur Woche vom 30.11. bis 6.12.2026 und der Eintrag hängt weiter am Finger
Wenn        ich auf Dienstag, 1.12., „Abend“ loslasse
Dann        steht „Lasagne“ am Dienstag, 1.12., abends, und die Ansicht bleibt in dieser Woche
```

**AC-010 — Was sich nicht ziehen lässt**

```gherkin
Angenommen  in der Haushalt-Zeile steht am Mittwoch „Bad putzen“, darüber der Streifen „Urlaub Mallorca“
Wenn        ich „Bad putzen“ oder den Streifen gedrückt halte oder mit der Maus ziehe
Dann        hebt sich nichts ab und nichts ändert sich
```

### REQ-003 — Vorgemerktes einplanen und zurücklegen

> Vorgemerkte Einträge lassen sich auf einen Tag ziehen und geplante Einträge auf „Vorgemerkt“; dafür
> ist „Vorgemerkt“ in allen drei Ansichten erreichbar.

**Offline:** wie REQ-001; die Leiste ist offline lesbar.

**Regeln:** Die Woche zeigt „Vorgemerkt“ wie bisher unten. Monat und Jahr bekommen unter dem Raster
die Leiste „Vorgemerkt · n“; ein Tipp klappt sie auf. Ohne vorgemerkte Einträge erscheint die Leiste
nur während des Ziehens, als Ziel. Ein vorgemerkter Eintrag hat schon eine Tageszeit; in Monat und
Jahr behält er sie, in der Woche bestimmt das Zielfeld sie. Die Leiste selbst ist ein einziges Ziel.

**AC-011 — Aus „Vorgemerkt“ auf einen Tag (Woche)**

```gherkin
Angenommen  Ansicht „Woche“ vom 23. bis 29.11.2026, unter „Vorgemerkt“ steht „Halloumi-Pfanne“
Wenn        ich „Halloumi-Pfanne“ auf Donnerstag, 26.11., „Mittag“ ziehe und loslasse
Dann        steht „Halloumi-Pfanne“ am Donnerstag mittags und nicht mehr unter „Vorgemerkt“
```

**AC-012 — Leiste in Monat und Jahr**

```gherkin
Angenommen  Ansicht „Monat“, November 2026; vorgemerkt ist „Halloumi-Pfanne“ mit der Tageszeit „Abend“
Dann        steht unter dem Raster „Vorgemerkt · 1“
Wenn        ich die Leiste antippe und „Halloumi-Pfanne“ auf den 27.11. ziehe
Dann        steht „Halloumi-Pfanne“ am Freitag, 27.11., abends
Und         die Leiste ist verschwunden, weil nichts mehr vorgemerkt ist
```

**AC-013 — Zurück auf „Vorgemerkt“**

```gherkin
Angenommen  Ansicht „Monat“, nichts ist vorgemerkt; am Mittwoch, 25.11., steht abends „Lasagne“
Wenn        ich „Lasagne“ anfasse
Dann        erscheint unter dem Raster das Ziel „Vormerken“
Wenn        ich sie dort loslasse
Dann        steht „Lasagne“ an keinem Tag mehr und unter dem Raster steht „Vorgemerkt · 1“
Und         der Hinweis zeigt „Lasagne vorgemerkt“ mit „Rückgängig“
```

### REQ-004 — Was beim Verschieben mitgeht und was es verhindert

> Ein verschobener Eintrag behält alles, was an ihm hängt; die App macht den Schritt rückgängig,
> wenn man es will, und verhindert Ziele, die Reste vor ihr Gericht stellen würden.

**Offline:** wie REQ-001.

**Regeln**

- **Bleibt am Eintrag:** wer mitisst, Gäste, Portionen, Varianten, wer kocht, Zusatz, die
  Reservierungsuhrzeit mit „Erinnern n vorher“ (Spec 0013) und die Beiträge auf der Einkaufsliste.
  Die Herkunft auf der Liste nennt danach den neuen Wochentag, z. B. „Lasagne (Fr)“.
- **Rückgängig:** 5 Sekunden; stellt Tag und Tageszeit wieder her.
- **Reste:** Reste stehen immer nach ihrem Gericht und höchstens sieben Tage danach (Spec 0010,
  REQ-011). Ziele, die das brechen würden, sind während des Ziehens blass und nehmen den Eintrag
  nicht an; das gilt für das Gericht wie für seine Reste. Vorgemerkt werden kann ein Gericht mit
  geplanten Resten nicht (Offene Frage 1).
- **Jemand ist auf Reise:** Steht am Zieltag jemand aus „Wer isst mit?“ auf Reise, bleibt er
  eingetragen; der Hinweis nennt es (Offene Frage 2).
- **Gleichzeitig:** Hat jemand den Eintrag inzwischen gelöscht, lehnt der Server ab (ADR-0011).

**AC-014 — Rückgängig**

```gherkin
Angenommen  ich habe „Lasagne“ von Mittwoch abends auf Freitag mittags gezogen
Wenn        ich im Hinweis innerhalb von 5 Sekunden „Rückgängig“ wähle
Dann        steht „Lasagne“ wieder am Mittwoch abends
```

**AC-015 — Reste bleiben hinter ihrem Gericht**

```gherkin
Angenommen  am Mittwoch, 25.11., steht abends „Lasagne“ und am Freitag, 27.11., mittags „Reste von Lasagne“
Wenn        ich „Lasagne“ anfasse
Dann        sind Freitag, Samstag und Sonntag als Ziele blass
Wenn        ich „Lasagne“ auf Samstag loslasse
Dann        gleitet sie zurück und es erscheint „Reste von Lasagne stehen schon am Fr 27.11.“
Wenn        ich stattdessen „Reste von Lasagne“ auf Donnerstag, 3.12., ziehe
Dann        gleitet der Eintrag zurück und es erscheint „Reste gehen bis sieben Tage nach dem Gericht“
```

**AC-016 — Hinweis, wenn jemand auf Reise ist**

```gherkin
Angenommen  bei „Lasagne“ essen Enrico und Nadja mit; Nadja ist vom 27. bis 29.11.2026 auf Reise
Wenn        ich „Lasagne“ auf Freitag, 27.11., abends ziehe
Dann        steht „Lasagne“ am Freitag abends, weiter mit Enrico und Nadja
Und         der Hinweis zeigt „Lasagne → Fr 27.11., Abend · Nadja ist dann auf Reise“
```

**AC-017 — Reservierung und Einkaufsliste gehen mit**

```gherkin
Angenommen  am Samstag, 28.11., steht abends „Trattoria Da Enzo“ mit „Reserviert um 19:30“
Und         „Mango-Curry“ am Samstag hat Beiträge auf der Einkaufsliste mit der Herkunft „Mango-Curry (Sa)“
Wenn        ich beide Einträge auf Sonntag, 29.11., ziehe
Dann        zeigt „Trattoria Da Enzo“ am Sonntag weiter „19:30“
Und         die Einkaufsliste zeigt dieselben Mengen mit der Herkunft „Mango-Curry (So)“
```

**AC-018 — Der Eintrag ist inzwischen weg**

```gherkin
Angenommen  Nadja hat „Lasagne“ gerade auf ihrem Gerät gelöscht, bei mir steht sie noch
Wenn        ich „Lasagne“ auf Freitag ziehe
Dann        springt die Anzeige zurück und es erscheint „Hat nicht geklappt – bitte noch einmal versuchen“
Und         nach dem nächsten Abgleich steht „Lasagne“ nicht mehr im Kalender
```

### REQ-005 — Verschieben ohne Ziehen, über jede Woche hinaus

> Alles, was Ziehen kann, geht auch mit Tippen und mit der Tastatur: Das Eintragsfenster bietet
> unter „Verschieben“ den Chip „Anderes Datum …“ mit einem Monatskalender ohne Grenze.

**Offline:** nur online; die Chips sind ausgegraut mit dem Offline-Hinweis.

**Regeln:** „Anderes Datum …“ steht hinter den Tagen der Woche und „Vormerken“. Der Monatskalender
beginnt mit dem Monat des Eintrags (vorgemerkt: mit heute), ‹ › blättert ohne Grenze; ein Tipp auf
einen Tag verschiebt sofort, die Tageszeit bleibt. Tage, die die Reste-Regel aus REQ-004 brechen
würden, sind nicht wählbar. Hinweis, „Rückgängig“ und Reise-Hinweis wie beim Ziehen. Derselbe
Baustein steht am Ende der Tages-Chips bei „Einplanen“ auf der Seite einer Aktivität.

**AC-019 — Anderes Datum im Eintragsfenster**

```gherkin
Angenommen  am Mittwoch, 25.11.2026, steht abends „Lasagne“ und ich habe ihr Eintragsfenster geöffnet
Wenn        ich „Anderes Datum …“ wähle
Dann        erscheint im selben Fenster der Monat „November 2026“, der 25. ist markiert
Wenn        ich mit › zu „Januar 2027“ blättere und den 8. wähle
Dann        steht „Lasagne“ am Freitag, 8.1.2027, abends
Und         der Hinweis zeigt „Lasagne → Fr 8.1.2027, Abend“ mit „Rückgängig“
```

**AC-020 — Aktivität weiter als 14 Tage voraus einplanen**

```gherkin
Angenommen  ich bin auf der Seite der Aktivität „Eislaufen“ und wähle „Einplanen“
Wenn        ich „Anderes Datum …“ wähle, zu „Januar 2027“ blättere, den 16. wähle und „Vormittag“
Dann        steht „Eislaufen“ am Samstag, 16.1.2027, vormittags im Kalender
```

**AC-021 — Tastatur und nicht wählbare Tage**

```gherkin
Angenommen  am 25.11. steht „Lasagne“, am 27.11. „Reste von Lasagne“; ich bediene den Kalender mit der Tastatur
Wenn        ich „Lasagne“ mit Tab erreiche, Enter drücke und „Anderes Datum …“ wähle
Dann        sind der 27.11. und alle späteren Tage nicht wählbar und werden übersprungen
Wenn        ich mit den Pfeiltasten den 26.11. wähle und Enter drücke
Dann        steht „Lasagne“ am Donnerstag, 26.11., abends
```

### REQ-006 — Tages-Fenster in Monat und Jahr

> Ein Tipp auf einen Tag in Monat oder Jahr öffnet das Tages-Fenster mit allem, was an diesem Tag
> ansteht; dort fügt man hinzu, öffnet Einträge und hakt Aufgaben ab, ohne die Ansicht zu wechseln.

**Offline:** offline lesend. „+ Hinzufügen“, „Reise eintragen“ und das Abhaken sind offline
ausgegraut, mit einem Offline-Hinweis im Fenster.

**Regeln**

- **Öffnen:** Tipp auf einen Tag im Raster; am Desktop-Monat auch „+n weitere“ und die Tageszahl.
  Der gewählte Tag ist im Raster markiert. Ein Tipp auf einen anderen Tag wechselt den Inhalt.
- **Schließen:** ✕, auf dem Handy nach unten ziehen, Escape, Android-Zurück. Blättern mit ‹ ›
  schließt es nicht: So lässt sich ein Eintrag in einen anderen Monat ziehen.
- **Wochenleiste:** Mo bis So der Woche des Tags, jeder Tag mindestens 44 × 44 pt, der gewählte
  hervorgehoben. Auf dem Handy wechselt auch Wischen nach links oder rechts den Tag. Im Jahr gleicht
  sie aus, dass die Tage im Raster klein sind (Offene Frage 3).
- **Reihenfolge im Fenster:** Reise-Streifen, Aufgaben, Tageszeiten. Ein Tipp auf einen Streifen
  öffnet die Seite der Reise, ein Tipp auf einen Eintrag das Eintragsfenster; nach dessen Schließen
  ist das Tages-Fenster wieder da.
- **Jahr:** Ein Tipp auf den Namen eines Monats öffnet weiter die Ansicht „Monat“.
- **Ansicht wechseln:** Ist ein Tag gewählt, zeigt „Woche“ dessen Woche und „Monat“ dessen Monat.

**AC-022 — Monat auf dem Handy**

```gherkin
Angenommen  Handybreite, Ansicht „Monat“, November 2026
Und         am Freitag, 27.11., stehen vormittags „Bouldern“ (Aktivität) und abends „Lasagne“; Nadja ist
            vom 27. bis 29.11. auf Reise mit der Notiz „Hamburg“
Dann        steht unter dem Raster keine Tagesliste
Wenn        ich den 27. antippe
Dann        bleibt die Ansicht „Monat“, der 27. ist markiert und von unten kommt das Tages-Fenster in halber Höhe
Und         es zeigt „FR 27. NOVEMBER“, die Wochenleiste 23 bis 29, „(N) Hamburg bis So 29.11.“,
            „Vormittag ▲ Bouldern“, „Mittag“ mit „+ Hinzufügen“ und „Abend ◆ Lasagne“
Wenn        ich im Raster den 28. antippe
Dann        zeigt das Tages-Fenster „SA 28. NOVEMBER“
```

**AC-023 — Jahr**

```gherkin
Angenommen  Ansicht „Jahr“ 2026
Wenn        ich im kleinen November den 27. antippe
Dann        bleibt die Ansicht „Jahr“ und das Tages-Fenster zeigt „FR 27. NOVEMBER“
Wenn        ich in der Wochenleiste „Sa 28“ antippe
Dann        zeigt das Fenster „SA 28. NOVEMBER“ und im Raster ist der 28. markiert
Wenn        ich das Fenster schließe und den Monatsnamen „November“ antippe
Dann        öffnet sich die Ansicht „Monat“ mit November 2026
```

**AC-024 — Desktop**

```gherkin
Angenommen  Desktopbreite, Ansicht „Monat“; der 27.11. hat fünf Einträge, drei sind sichtbar, darunter „+2 weitere“
Wenn        ich „+2 weitere“ oder die Tageszahl „27“ anklicke
Dann        öffnet sich rechts neben dem Raster das Tages-Fenster mit allen fünf Einträgen
Und         es gibt kein kleines Menü und kein „Tag öffnen ›“ mehr
Wenn        ich Escape drücke
Dann        schließt das Tages-Fenster und der Fokus steht wieder auf dem 27.
```

**AC-025 — Im Tages-Fenster bearbeiten**

```gherkin
Angenommen  das Tages-Fenster zeigt Freitag, 27.11., in der Ansicht „Monat“
Wenn        ich bei „Mittag“ „+ Hinzufügen“ wähle und „Linsen-Dal“ auswähle
Dann        steht „Linsen-Dal“ im Tages-Fenster unter „Mittag“ und der 27. zeigt im Raster einen Rezept-Punkt
Wenn        ich „Lasagne“ antippe, im Eintragsfenster „Entfernen“ wähle
Dann        ist das Tages-Fenster weiter offen und zeigt „Lasagne“ nicht mehr
```

**AC-026 — Leerer Tag und offline**

```gherkin
Angenommen  am Dienstag, 1.12.2026, ist nichts geplant
Wenn        ich den 1.12. antippe
Dann        zeigt das Tages-Fenster „Noch nichts geplant“ und je Tageszeit „+ Hinzufügen“
Wenn        das Gerät offline ist
Dann        sind „+ Hinzufügen“ und „Reise eintragen“ ausgegraut
Und         im Fenster steht einmal „Offline – zum Bearbeiten brauchst du Netz“
```

**AC-027 — Ansicht wechseln nimmt den Tag mit**

```gherkin
Angenommen  heute ist der 22.11.2026; in der Ansicht „Jahr“ 2027 ist der 8. Januar gewählt
Wenn        ich „Monat“ wähle
Dann        zeigt die Ansicht „Januar 2027“ und der 8. ist gewählt
Wenn        ich „Woche“ wähle
Dann        zeigt die Ansicht die Woche vom 4. bis 10.1.2027
```

### REQ-007 — Reise durch Ziehen über Tage eintragen

> Zieht man in Monat oder Jahr über mehrere Tage, öffnet sich „Reise eintragen“ mit genau diesem
> Zeitraum; etwas anderes als eine Reise lässt sich so nicht anlegen.

**Offline:** nur online. Offline markiert das Ziehen nichts und zeigt den Offline-Hinweis.

**Regeln**

- **Beginn:** auf der freien Fläche oder der Tageszahl eines Tags; mit dem Finger gedrückt halten,
  bis der Tag markiert ist, dann ziehen; mit der Maus drücken und ziehen. Beginnt man auf einem
  Eintrag, verschiebt man den Eintrag (REQ-001).
- **Unterwegs:** Alle Tage vom Start- bis zum aktuellen Tag sind markiert, auch über Zeilen und
  rückwärts; oben steht „Mo 7.12. – Fr 11.12. · 5 Tage“. Am Rand des Monats blättert die Ansicht
  weiter, die Markierung bleibt. Im Jahr endet das Ziehen am Jahresrand.
- **Loslassen:** Das Fenster „Reise eintragen“ öffnet sich: „Von“ und „Bis“ belegt, ich bin
  vorausgewählt, der Cursor steht in „Notiz“. Speichern legt die Reise an wie bisher (Spec 0010,
  REQ-010); „Von“, „Bis“ und „Wer?“ lassen sich dort noch ändern.
- **Ein einzelner Tag:** Mit dem Finger gehalten und ohne Bewegung losgelassen: Reise für diesen
  Tag. Mit der Maus ist ein Klick ohne Bewegung ein Tipp (Tages-Fenster).
- **Abbrechen:** Escape oder ein zweiter Finger während des Ziehens; im Fenster ✕. Die Markierung
  verschwindet, nichts ist gespeichert.
- **Woche ab 700 px:** Dasselbe über die Kopfzeile der Tage. In der Handy-Woche gibt es das Ziehen
  nicht, weil die Tage untereinander stehen und die Liste scrollt.
- **Ohne Ziehen:** „Reise eintragen“ im Tages-Fenster belegt „Von“ und „Bis“ mit dem Tag des
  Fensters; ⋯ → „Reise eintragen“ bleibt.

**AC-028 — Maus im Monat**

```gherkin
Angenommen  Desktopbreite, Ansicht „Monat“, Dezember 2026, ich bin als Enrico angemeldet
Wenn        ich auf der freien Fläche des 7.12. die Maustaste drücke und bis zum 11.12. ziehe
Dann        sind der 7. bis 11. markiert und oben steht „Mo 7.12. – Fr 11.12. · 5 Tage“
Wenn        ich loslasse
Dann        öffnet sich „Reise eintragen“ mit „Von Mo 7.12.2026“, „Bis Fr 11.12.2026“ und „Enrico“ gewählt
Wenn        ich als Notiz „Hamburg“ eintrage und „Speichern“ wähle
Dann        steht vom 7. bis 11.12. der Streifen „Hamburg“ mit Enricos Badge im Kalender
```

**AC-029 — Finger im Jahr, über die Monatsgrenze und rückwärts**

```gherkin
Angenommen  Handybreite, Ansicht „Jahr“ 2027
Wenn        ich den 4. Januar gedrückt halte, bis er markiert ist, und zurück auf den 1. Januar ziehe
Dann        sind der 1. bis 4. Januar markiert und oben steht „Fr 1.1. – Mo 4.1. · 4 Tage“
Wenn        ich stattdessen vom 29. Januar bis zum 2. Februar ziehe und loslasse
Dann        öffnet sich „Reise eintragen“ mit „Von Fr 29.1.2027“ und „Bis Di 2.2.2027“
```

**AC-030 — Abbrechen speichert nichts**

```gherkin
Angenommen  ich habe vom 7. bis 11.12. gezogen und „Reise eintragen“ ist offen
Wenn        ich das Fenster mit ✕ schließe
Dann        ist die Markierung weg und im Kalender steht keine neue Reise
```

**AC-031 — Nur eine Reise, und nur online**

```gherkin
Angenommen  ich ziehe im Monat über den 7. bis 11.12.
Wenn        ich loslasse
Dann        öffnet sich ausschließlich „Reise eintragen“, ohne Auswahl anderer Arten
Angenommen  das Gerät ist offline
Wenn        ich über mehrere Tage ziehe
Dann        wird nichts markiert und es erscheint „Offline – zum Bearbeiten brauchst du Netz“
```

**AC-032 — Ohne Ziehen aus dem Tages-Fenster**

```gherkin
Angenommen  das Tages-Fenster zeigt Montag, 7.12.2026
Wenn        ich „Reise eintragen“ wähle
Dann        öffnet sich „Reise eintragen“ mit „Von Mo 7.12.2026“ und „Bis Mo 7.12.2026“
Wenn        ich „Bis“ auf den 11.12. setze und speichere
Dann        steht der Streifen vom 7. bis 11.12. im Kalender
```

### REQ-008 — „Reise“ statt „Abwesenheit“ in der Oberfläche

> Überall, wo die App „Abwesenheit“, „Abwesenheiten“ oder „abwesend“ zeigt, steht „Reise“, „Reisen“
> oder „unterwegs“; Regeln und Daten bleiben unverändert.

**Offline:** offline vollständig (nur Texte).

**Regeln**

| Bisher                                                   | Neu                                    |
| -------------------------------------------------------- | -------------------------------------- |
| „Abwesenheit eintragen“ / „Abwesenheit bearbeiten“       | „Reise eintragen“ / „Reise bearbeiten“ |
| Seite und Menüpunkte „Abwesenheiten“                     | „Reisen“                               |
| Jahresansicht „Abwesenheiten 2027“                       | „Reisen 2027“                          |
| Streifen ohne Notiz: „abwesend“                          | „unterwegs“                            |
| Screenreader: „Enrico abwesend, Urlaub Mallorca, …“      | „Enrico unterwegs, Urlaub Mallorca, …“ |
| Benachrichtigungen: Hinweis auf Ruhe während Abwesenheit | „Während einer Reise kommt nichts.“    |
| Adresse `/abwesenheiten`                                 | `/reisen`                              |
| Adresse `/kalender/urlaub/<id>`                          | `/kalender/reise/<id>`                 |

Die Notiz bleibt die Beschriftung des Streifens („Urlaub Mallorca“, „Dienstreise“). Die alten
Adressen leiten nicht weiter (geändert am 22.11.2026: Die App ist seit v2026.11.1 veröffentlicht;
es gibt zwei Nutzer und keine Links von außen, alte Lesezeichen zeigen „Nicht gefunden“). Das Wort gilt auch für
einen Tag bei den Eltern oder im Krankenhaus; die Notiz sagt, was es ist.

**AC-033 — Texte**

```gherkin
Angenommen  Enrico ist vom 1. bis 4.1.2027 eingetragen, ohne Notiz
Wenn        ich im Kalender ⋯ öffne
Dann        stehen dort „Reise eintragen“ und „Reisen“
Und         der Streifen im Januar 2027 zeigt „unterwegs bis Mo 4.1.“
Und         die Ansicht „Jahr“ 2027 zeigt die Liste „Reisen 2027“
Und         nirgends in der App steht „Abwesenheit“, „Abwesenheiten“ oder „abwesend“
```

**AC-034 — Adressen**

```gherkin
Angenommen  ich bin angemeldet
Wenn        ich unter „Verwalten“ „Reisen“ wähle
Dann        zeigt die Adresse `/reisen`
Wenn        ich den Streifen „Urlaub Mallorca“ antippe
Dann        zeigt die Adresse `/kalender/reise/<id>` und die Seite mit Packliste öffnet sich
Wenn        ich `/abwesenheiten` aufrufe
Dann        erscheint die Seite „Nicht gefunden“
```

## Offline und Konflikte

| Bereich                                                                 | Verhalten                                                                                                                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tages-Fenster, Leiste „Vorgemerkt“ lesen                                | offline vollständig aus dem lokalen Speicher                                                                                                               |
| Eintrag ziehen, „Anderes Datum …“, Vormerken                            | nur online (ADR-0008); nichts hebt sich ab bzw. ausgegraut, mit „Offline – zum Bearbeiten brauchst du Netz“                                                |
| Reise durch Ziehen, „Reise eintragen“                                   | nur online, wie bisher                                                                                                                                     |
| Das Netz bricht zwischen Loslassen und Antwort ab                       | die Anzeige springt zurück, „Hat nicht geklappt – bitte noch einmal versuchen“ (ADR-0011); nichts wird später nachgeholt                                   |
| Zwei Personen verschieben denselben Eintrag                             | je Feld gewinnt die letzte Änderung (`sync.md`); Tag und Tageszeit sind zwei Felder, im seltenen Fall mischen sie sich                                     |
| Eine Person verschiebt, die andere hat den Eintrag gelöscht             | der Server lehnt ab, die Anzeige springt zurück (AC-018)                                                                                                   |
| Eine Person verschiebt ein Gericht, die andere plant gleichzeitig Reste | beide Änderungen bleiben; die Reste-Regel prüft das Gerät, nicht der Server. Ein so entstandener Verstoß bleibt stehen und lässt sich von Hand korrigieren |
| Zwei Personen tragen dieselbe Reise ein                                 | beide stehen da, wie bisher (Spec 0010)                                                                                                                    |

## Plattformen

- **Handy (< 700 px):** Ziehen mit Halten. Woche: alle Tageszeiten als Ziele während des Ziehens.
  Monat und Jahr: Tages-Fenster von unten, Einträge aus dem Fenster auf das Raster. Kein Reise-Ziehen
  in der Woche.
- **Tablet und Desktop (ab 700 px):** Tages-Fenster rechts neben dem Raster, auf Tablets unter 1100 px unten wie am Handy (Offene Frage 8). Mit dem Finger auf dem
  Tablet gelten dieselben Halte-Gesten wie auf dem Handy, mit der Maus das direkte Ziehen.
- **Maus und Tastatur:** Der Mauszeiger zeigt über Einträgen die greifende Hand. Escape bricht jedes
  Ziehen ab. Mit der Tastatur verschiebt man über das Eintragsfenster (REQ-005) und trägt Reisen
  über das Tages-Fenster oder ⋯ ein; ein Ziehen mit der Tastatur gibt es nicht.
- **Android:** Die Zurück-Taste bricht zuerst ein Ziehen ab, schließt dann ein Fenster, dann das
  Tages-Fenster.
- **iPhone als installierte Web-App:** Das Halten darf weder Text markieren noch das Kontextmenü
  des Browsers öffnen; das Ziehen an den Rand darf nicht die Zurück-Geste des Systems auslösen.
- **Screenreader:** Jeder Eintrag hat die Aktion „Verschieben“, die das Eintragsfenster bei
  „Verschieben“ öffnet. Die Tage im Jahr haben eine Textfassung („Freitag, 27. November: 1 Aktivität,
  1 Rezept, Nadja unterwegs“).
- **Bewegung reduzieren:** keine Flug- und Rückgleit-Animation, Hervorhebungen bleiben.

## Daten

- **Gelesen:** Planeinträge (auch vorgemerkte), Tageszeiten, Aufgaben, Abwesenheiten, Mitglieder.
- **Geschrieben:** Tag und Tageszeit eines Planeintrags (vorhandener Befehl zum Verschieben);
  Abwesenheiten über das vorhandene Fenster. Keine neuen Felder, keine neue Tabelle, keine Änderung
  an der Datenbank.
- **Nur auf dem Gerät:** der gewählte Tag und ob die Leiste „Vorgemerkt“ aufgeklappt ist.
- **Personenbezogen:** nichts Neues. Das Tages-Fenster zeigt Reisen und Notizen, die Mitglieder des
  Haushalts schon heute sehen.

## Offene Fragen

| #   | Frage                                                                                             | Optionen                                                                                                                                                                                                                                                                                                                                                                                                          | Empfehlung                                                                                                  | Status                                                                     |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | Was passiert, wenn ein Verschieben Reste vor ihr Gericht oder mehr als sieben Tage danach stellt? | A: Ziel wird nicht angenommen, mit Begründung — Pro: der Kalender bleibt stimmig, nichts geht kaputt; Contra: man muss erst die Reste verschieben · B: Reste wandern um dieselbe Zahl Tage mit — Pro: ein Griff; Contra: verschiebt etwas, das man nicht angefasst hat · C: alles erlauben — Pro: einfach; Contra: „Reste“ vor dem Gericht                                                                        | A, weil es nichts ungefragt ändert und die Regel aus Spec 0010 hält                                         | OFFEN, Annahme A                                                           |
| 2   | Was passiert mit „Wer isst mit?“, wenn am Zieltag jemand auf Reise ist?                           | A: nur Hinweis, Esser bleiben — Pro: klein, ändert nichts ungefragt; Contra: man muss selbst nachziehen, und das geht erst mit K-01 · B: Hinweis mit „Rausnehmen“ — Pro: ein Tipp; Contra: ändert Portionen und Liste mit, gehört zu K-01/K-02                                                                                                                                                                    | A, und K-01/K-02 aus dem Review als nächste Spec, weil erst dort Esser und Portionen sauber änderbar werden | OFFEN, Annahme A                                                           |
| 3   | Wie trifft man im Jahr auf dem Handy einen Tag, wenn die Tage dort sehr klein sind?               | A: drei Spalten bleiben, Fehl-Tipps korrigiert die Wochenleiste im Tages-Fenster — Pro: das ganze Jahr bleibt auf einen Blick; Contra: erster Tipp trifft nicht immer · B: zwei Spalten auf dem Handy — Pro: größere Tage; Contra: mehr Scrollen, anderes Bild als bisher                                                                                                                                         | A, weil der Überblick der Zweck der Jahresansicht ist                                                       | OFFEN, Annahme A                                                           |
| 4   | Sollen Reise-Streifen selbst ziehbar sein (verschieben, Enden verlängern)?                        | A: nein, nur über „Reise bearbeiten“ — Pro: keine dritte Zieh-Geste, Packliste und Zusammenfassen der Streifen bleiben einfach; Contra: weniger direkt als in Outlook · B: ja — Pro: direkt; Contra: Streifen stehen für mehrere Personen, Enden sind auf dem Handy kaum zu treffen                                                                                                                               | A für diese Spec; B später, wenn das Ziehen sich bewährt hat                                                | OFFEN, Annahme A                                                           |
| 5   | Heißt die leere Beschriftung „unterwegs“?                                                         | A: „unterwegs“ · B: „Reise“ · C: „weg“                                                                                                                                                                                                                                                                                                                                                                            | A, weil „Enrico unterwegs bis Mo 4.1.“ ein Satz ist                                                         | OFFEN, Annahme A                                                           |
| 6   | Darf man Reste vormerken, und was gilt für Reste eines vorgemerkten Gerichts?                     | A: beides erlaubt, ohne Tag wird keine Regel verletzt — Pro: einfach; Contra: Reste stehen ohne Bezug · B: sperren — Pro: streng; Contra: mehr Hinweistexte                                                                                                                                                                                                                                                       | A, weil ohne Tag nichts verletzt wird                                                                       | OFFEN, Annahme A (Claude, 22.11.2026)                                      |
| 7   | Eigene Zieh-Logik oder react-native-gesture-handler?                                              | A: eigene Logik in `packages/ui` (Pointer-Events im Web, PanResponder nativ) — Pro: keine neue Abhängigkeit, volle Kontrolle über Halten, Markieren und Scrollen im iPhone-Web; Contra: nativ weniger erprobt · B: react-native-gesture-handler — Pro: nativ robust; Contra: Root-Wrapper, Umbau des ScrollView, das iPhone-Web-Problem bleibt                                                                    | A; neu entscheiden, falls native Apps wieder Thema werden                                                   | ENTSCHIEDEN: A (Claude nach Enricos Regel „Empfehlung nehmen“, 22.11.2026) |
| 8   | Wo steht das Tages-Fenster auf dem Tablet?                                                        | A: rechts ab 700 px, wie oben beschrieben — Pro: wie am Desktop; Contra: im iPad-Hochformat bleiben neben Seitenleiste und Fenster nur 120–250 px fürs Raster · B: unten wie am Handy bis 1099 px, rechts ab 1100 px — Pro: das Raster bleibt breit; Contra: Tablet im Querformat unter 1100 px ebenfalls unten · C: schmaleres Fenster — Pro: rechts bleibt; Contra: Wochenleiste und Einträge passen nicht mehr | B, weil das Raster der Zweck der Ansicht ist                                                                | ENTSCHIEDEN: B (Claude nach Enricos Regel „Empfehlung nehmen“, 22.11.2026) |

## Rückverfolgbarkeit

| REQ     | AC                | Task (plan.md) | Test                                                                                                                                                                                                                                               |
| ------- | ----------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 | AC-001 bis AC-005 | 2, 5, 9, 11    | core `plan-move.test.ts` (AC-001 bis AC-003); ui `drag-gesture-state.test.ts` (AC-003 bis AC-005), `drag-controller.test.ts` (AC-001 bis AC-003), `drop-targets.test.ts` (AC-003); e2e `rundgang-kalender-ziehen.spec.ts` (AC-001, AC-002, AC-005) |
| REQ-002 | AC-006 bis AC-010 | 1, 2, 5, 9, 11 | core `plan-move.test.ts` (AC-006 bis AC-008); ui `drag-controller.test.ts` (AC-007, AC-009), `edge-pager.test.ts` (AC-009), `docked-panel-state.test.ts` (AC-008); e2e `rundgang-kalender-ziehen.spec.ts` (AC-006 bis AC-010)                      |
| REQ-003 | AC-011 bis AC-013 | 1, 9           | core `plan-move.test.ts` (AC-011 bis AC-013); e2e `rundgang-kalender-ziehen.spec.ts` (AC-011 bis AC-013)                                                                                                                                           |
| REQ-004 | AC-014 bis AC-018 | 1, 7, 9        | core `plan-move.test.ts` (AC-015, AC-016), `shopping-list.test.ts` (AC-017); ui `drag-controller.test.ts` (AC-015); api `commands-plan.backend.test.ts` (AC-014, AC-017, AC-018); e2e `rundgang-kalender-ziehen.spec.ts` (AC-015)                  |
| REQ-005 | AC-019 bis AC-021 | 1, 2, 4, 7     | core `plan-move.test.ts` (AC-019, AC-021), `calendar.test.ts` (AC-019); ui `month-calendar-nav.test.ts` (AC-019, AC-021); e2e `rundgang-kalender-verschieben.spec.ts` (AC-019 bis AC-021)                                                          |
| REQ-006 | AC-022 bis AC-027 | 1, 6, 8        | core `calendar.test.ts` (AC-022, AC-026, AC-027); ui `docked-panel-state.test.ts` (AC-022, AC-024); e2e `rundgang-kalender-tag.spec.ts` (AC-022 bis AC-027)                                                                                        |
| REQ-007 | AC-028 bis AC-032 | 1, 10          | core `calendar.test.ts` (AC-028, AC-029), `plan-move.test.ts` (AC-028); ui `drag-controller.test.ts` (AC-029); e2e `rundgang-kalender-ziehen.spec.ts` (AC-028 bis AC-031), `rundgang-kalender-tag.spec.ts` (AC-032)                                |
| REQ-008 | AC-033, AC-034    | 3              | core `absences.test.ts`, `overview.test.ts` (AC-033); e2e `rundgang-plan.spec.ts` (AC-033, AC-034)                                                                                                                                                 |

**Nachtrag (Spec 0031, AC-055):** AC-023 belegte ein Test von `periodForDay` in
`calendar.test.ts`. Die App hat die Funktion nie genutzt. Mit Spec 0031 (REQ-022, Entscheidung 10)
sind Funktion und Test gelöscht. Das Raster folgt weiter dem gewählten Tag, AC-023 belegt nur noch
der e2e-Test `rundgang-kalender-tag.spec.ts`.
