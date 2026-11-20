---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-20
---

# 0005 — Globale Muster und Navigation

## Problem

Enrico hat die App am 20.11.2026 durchgesehen. Viele Seiten wirken unfertig: Rezept, Restaurant,
Märkte, Markt, Einstellungen und Feedback öffnen sich ohne Tab-Leiste bzw. Seitenleiste, oft ohne
richtige Kopfzeile. Kopfzeilen scrollen weg, sodass auf dem Handy „Neues Rezept“ nicht mehr
erreichbar ist. Fenster springen in der Höhe, sobald man einen Tab wechselt oder ein Fehler
erscheint. Breite Umschalter fressen Platz. Wer schnell mehrere Dinge abhakt, trifft die falsche
Zeile, weil die Liste sofort nachrutscht, und bekommt jedes Mal einen „Rückgängig“-Hinweis. Die
Einstellungen sind überladen, Märkte und Feedback schwer zu finden, „Frisch“ ist zu bunt, und die
noch nicht fertige KI steht überall im Weg.

## Ziel

- Jede Seite hat Tab-Leiste (Handy) bzw. Seitenleiste (ab Tablet) und eine Kopfzeile, die beim
  Scrollen oben bleibt. Nur Einkaufen und Kochen verdecken auf dem Handy die Tab-Leiste.
- Fenster behalten ihre Größe, egal welcher Tab offen ist, wie viele Treffer es gibt oder ob ein
  Fehler erscheint.
- Ansichten wechselt man über Ansichts-Tabs; den Segment-Balken gibt es nicht mehr.
- Abhaken mit Sammel-Fenster, „Suchen oder anlegen“, Filterzeile und Endlos-Liste gibt es als
  fertige Bausteine, die die Specs 0006 bis 0013 einsetzen.
- Alles, was den Haushalt verwaltet, steht unter „Verwalten“ (Desktop: Seitenleiste, Handy: ⊞).
  Die Einstellungen enthalten nur noch Persönliches.
- Keine KI-Bedienung ist sichtbar. „Frisch“ zeigt je Bildschirm eine einzige Bereichsfarbe.

## Nicht-Ziele

- **Keine neuen Inhalte in den Bereichen.** Filter mit Küche und Zufall, große Kacheln und der
  Rezept-Editor kommen mit Spec 0008, Kalender mit Monat und Jahr, die eigene Aktivitäten-Seite und
  die neue Abwesenheiten-Seite mit Spec 0010, Tagesauswahl und neue Haushalt-Ansichten mit Spec
  0011, Liste und Einkaufen mit Spec 0006, Artikel, Märkte und Bereiche mit Spec 0007.
- **Die Bausteine Abhaken, „Suchen oder anlegen“, Filterzeile und Endlos-Liste werden hier gebaut
  und im Showroom gezeigt, aber nicht in die Bereichsseiten eingesetzt.** Das machen die Specs der
  Bereiche (Tabelle „Wer setzt welchen Baustein ein“).
- **Keine Datenbankänderung und keine neue Offline-Aktion.**
- **Die KI wird nur ausgeblendet, nicht entfernt.** Daten, KI-Kontingent und Edge Functions bleiben
  unverändert.
- **Kein Bearbeiten des Profils** (Name, Farbe, Ernährung, Abneigungen); siehe Offene Frage 2.
- **Keine neuen Seiten für Artikel und Reisetaschen.** Sie kommen mit Spec 0007 und 0012 und
  bekommen dann ihren Eintrag unter „Verwalten“.

## Konzept in Kürze

Grundlage ist das freigegebene UI-Konzept v2 (`docs/product/ui-konzept-v2.md`), Abschnitt 2
(2.1 bis 2.11), 3.11 und 3.12, mit den Entscheidungen D1 bis D5, D28 und D30 (alle ENTSCHIEDEN).
Die Muster werden Bausteine in `packages/ui`; Bildschirme benutzen nur diese Bausteine
(ADR-0010).

**Jede Seite gehört zu einem Bereich** und öffnet sich in dessen Stapel (Konzept 2.1):

| Seite                                                                                       | gehört zu                                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Rezept, Restaurant                                                                          | Essen                                                         |
| Aktivität, Aktivitäten                                                                      | Plan (bis Spec 0010 daraus „Kalender“ macht)                  |
| Einkaufen                                                                                   | Liste (Vollbild-Modus, D5)                                    |
| Kochen                                                                                      | Essen (Vollbild-Modus, D5)                                    |
| Märkte, Markt, Abwesenheiten, Haushalt & Mitglieder, Feedback; später Artikel, Reisetaschen | Verwalten                                                     |
| Einstellungen (Profil, Darstellung, Abmelden; später Benachrichtigungen)                    | Avatar (Handy oben rechts, Desktop unten in der Seitenleiste) |

**Vollbild-Modi (D5):** Einkaufen und Kochen verdecken auf dem Handy die Tab-Leiste und haben oben
immer „Fertig“. Was „Fertig“ dort tut, regeln Spec 0006 (Einkaufen) und der heutige Kochmodus. Am
Desktop bleibt die Seitenleiste.

**Kopfzeile (2.2):** Handy: großer Titel, der beim Scrollen in eine schmale Leiste schrumpft
(Titel klein, Aktionen bleiben, halbtransparenter Hintergrund). Ansichts-Tabs kleben darunter.
Suchfeld und Filterzeile rutschen beim Runterscrollen weg und kommen beim Hochscrollen zurück.
Desktop: Titel, Tabs und Aktionen stehen fest; eine feine Kante erscheint erst, wenn Inhalt
darunter liegt. Gruppenüberschriften in langen Listen kleben, bis die nächste kommt.

**Fenster (2.3)** haben eine von drei festen Größen. Kopf (Titel, Tabs, Suchfeld) und Fuß
(Hauptknopf) stehen fest, nur die Mitte scrollt.

| Größe      | Wofür                                              | Handy                                        | Tablet und Desktop (Dialog in der Mitte) |
| ---------- | -------------------------------------------------- | -------------------------------------------- | ---------------------------------------- |
| **Klein**  | Bestätigen, eine Wahl aus wenigen (Markt wählen)   | so hoch wie der Inhalt, höchstens die Hälfte | 440 px breit, Höhe nach Inhalt           |
| **Mittel** | Formulare (Aufgabe, Abwesenheit, Posten, Filter)   | 90 % der Bildschirmhöhe, fest                | 560 × 640 px, fest                       |
| **Groß**   | Suchen und Auswählen mit Tabs (Hinzufügen im Plan) | 90 %, fest                                   | 760 × 720 px, fest, höchstens 85 % Höhe  |

Ausnahme: Aufklappen darf ein kleines Fenster einmal auf „Groß“ wachsen lassen; es springt danach
nicht zurück. In mittleren und großen Fenstern klappt ein Abschnitt einfach im Scrollbereich auf.
Bestätigungsdialoge gibt es nur für Löschen, das viel auf einmal trifft; sonst gilt „Rückgängig“ im
Hinweis (DESIGN.md). Jedes bestehende Fenster bekommt in dieser Spec seine Größe.

**Ein Muster je Aufgabe (2.4, D1):** `Segmented` verschwindet aus der App.

| Aufgabe                     | Muster                                                                         | heute betroffen                                                        |
| --------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Zwischen Ansichten wechseln | **Ansichts-Tabs:** nur Text, aktiver mit Akzentlinie, linksbündig, ohne Kasten | Rezepte · Restaurants; Woche · Aktivitäten; Anstehend · Alle · Verlauf |
| Reihenfolge wählen          | **Menü-Knopf** „↕ Zuletzt ▾“ mit kurzer Liste                                  | Sortieren in Rezepten und Restaurants                                  |
| Filtern                     | **Chips**, mehrfach wählbar                                                    | wie heute                                                              |
| Ein Wert aus wenigen        | **Auswahl-Chips**, genau einer aktiv                                           | Erscheinungsbild, Feedback-Art, Aufwand, Tageszeit, Variante           |
| An / aus                    | **Schalter** oder Symbol-Knopf                                                 | wie heute                                                              |

**Abhaken mit Sammel-Fenster (2.5, D3):** Tipp auf den Haken setzt ihn und streicht durch; die
Zeile bleibt stehen. Nochmal tippen nimmt ihn zurück, ohne Hinweis. Jeder Tipp startet die Uhr neu;
**2 Sekunden nach dem letzten Tipp** gleiten alle abgehakten Zeilen gemeinsam weg (nach „Erledigt“
oder ganz weg, je nach Bildschirm). Wer die Seite vorher verlässt, dem räumt die App sofort auf. Die
2 Sekunden stehen im Code an genau einer Stelle. Wann ein Haken gespeichert wird, legt der
Bildschirm fest, der den Baustein einsetzt: Einkaufsposten sofort beim Tipp (Spec 0006), Aufgaben
erst beim Aufräumen (Spec 0011). Nicht für den Vorratscheck: dort ist der Haken eine Auswahl.

**Suchen oder anlegen (2.6):** Suchfeld mit Treffern (fehlertolerant, mit Synonymen, offline);
darunter „„…“ neu anlegen“, je Art eine Zeile; bei ähnlichem Namen bremst die Zeile mit „Meinst du
…?“; optional „Mehr Angaben ▸“; das Neue ist danach ausgewählt. Die Suche findet wie heute Anfang,
Teilwort und Tippfehler und dazu, wie in der Skizze 2.6, Wortteile („Milchko“ findet „Kokosmilch“;
Offene Frage 5). „Ähnlich“ für die Bremse heißt: ein Tippfehler entfernt (Ähnlichkeit mindestens
0,8 zum Namen oder einem Synonym, wie beim heutigen „Meinst du …?“), Einzahl/Mehrzahl desselben
Worts oder ein Wortteil-Treffer. Wer nur den Anfang eines Namens tippt („Kokos“), wird nicht
gebremst. **Diese Trefferregel gilt für jedes Feld „Suchen oder anlegen“ und steht nur hier;** die
Specs, die den Baustein einsetzen, legen nur fest, worin gesucht wird (z. B. Spec 0007: Artikel
des Haushalts und Starter-Katalog). Gibt es mehrere Arten, darf die einsetzende Spec die Zeilen
verdichten: Im Hinzufügen-Fenster des Kalenders steht die erste Art als eigene Zeile und die
übrigen als Knöpfe in einer Zeile „+ als Restaurant · Aktivität“ (Spec 0010, AC-021; Skizze 3.5).

**Filterzeile (2.7):** höchstens zwei Zeilen Bedienung über einer Liste: Suchfeld, darunter
[Filter (n)], [↕ Sortierung ▾] und seitlich wischbare Schnell-Chips. Das Filterfeld öffnet auf dem
Handy als mittleres Fenster und klappt am Desktop unter der Zeile auf. **Endlos-Liste (2.8):** lädt
beim Scrollen nach statt in Seiten, zeichnet nur, was sichtbar ist, und merkt sich die Stelle.

**KI ausgeblendet (2.9):** ein Schalter im Code, Standard „aus“.

**Frisch ruhiger (2.10, D4):** eine Bereichsfarbe je Bildschirm (die des aktiven Tabs) für den
Akzent der Kopfzeile und den Hauptknopf; Abschnitte ohne Farbfläche (weiße Kacheln auf warmem
Grund, Titel in Tinte); Bereichsfarben gedämpft; höchstens drei Farben gleichzeitig (Tinte, eine
Bereichsfarbe, eine Zustandsfarbe); aktiver Tab in der Tab-Leiste als Tinten-Pille. Richtwerte
hell (der Kontrast-Test entscheidet): Essen `#F5E3DB`, Plan `#F3EACB`, Liste `#DCEDE3`, Haushalt
`#E0E5F4`, Sterne `#C9961C`.

**Desktop (2.11):** eine Inhaltsbreite je Bereich, nie abhängig von Tab oder Inhalt; der Inhalt
beginnt 36 px neben der Seitenleiste und füllt bis 1320 px, erst darüber wird zentriert; der Avatar
steht nur in der Seitenleiste. Drei Layouts: Übersicht (Heute), Raster (Essen, Aktivitäten), Liste
und Detail (Haushalt, Märkte, Artikel, Verwalten); der Kalender ist sein eigenes Raster.

**Verwalten (3.12, D2, D30) und Einstellungen (3.11, D28):** Die Seitenleiste hat unter den fünf
Bereichen die immer sichtbare Gruppe „Verwalten“ in drei Blöcken: Planen (Aktivitäten,
Reisetaschen, Abwesenheiten), Einkaufen (Artikel, Märkte & Bereiche), Haushalt (Haushalt &
Mitglieder, Feedback). Oben steht der Haushaltsname mit ▾ (wechseln, neu anlegen), unten der Avatar
(persönliche Einstellungen). Auf dem Handy öffnet der Knopf ⊞ im Kopf jeder Tab-Startseite die
Seite „Verwalten“ mit denselben Einträgen. In Entwicklungs-Builds kommt die Gruppe „Entwicklung“
(Showroom, Offline simulieren) dazu. Abkürzungen am Ort bleiben bzw. kommen mit ihren Specs:

| Abkürzung                                                               | kommt mit |
| ----------------------------------------------------------------------- | --------- |
| „Märkte verwalten“ beim Einkaufen, Liste ⋯ → Märkte & Bereiche, Artikel | 0006      |
| „Artikel bearbeiten“ an einer Zutat                                     | 0007      |
| ▲ im Kalender (Aktivitäten), Kalender ⋯ (Abwesenheiten)                 | 0010      |
| „Neue Reisetasche“ im Abwesenheit-Fenster                               | 0012      |

**Wer setzt welchen Baustein ein**

| Baustein            | eingesetzt in                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abhaken             | 0006 Einkaufen · 0010 Haushalt-Zeile im Kalender · 0011 „Zu tun“, „Anstehend“, „Wie war's?“ · 0012 Packliste                                                                              |
| Suchen oder anlegen | 0006 „Was fehlt?“, Bereich am Posten · 0007 Zutat, Bereich im Markt · 0008 Küche, Schlagworte · 0009 Rezepte in der Sammlung · 0010 Hinzufügen im Kalender · 0011 „Was anderes erledigt?“ |
| Filterzeile         | 0007 Artikel · 0008 Rezepte, Restaurants                                                                                                                                                  |
| Endlos-Liste        | 0007 Artikel · 0008 Rezepte, Restaurants · 0010 Aktivitäten · 0011 Verlauf                                                                                                                |

**Was sich an älteren Specs ändert**

| Bisher                                                            | Neu                                                                    |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Spec 0001, AC-007: Tab-Leiste „und ein Knopf für den Assistenten“ | AC-044: kein Assistent-Knopf, solange die KI aus ist; dafür ⊞ (AC-054) |
| Spec 0001, AC-010: „Offline simulieren“ unter Einstellungen       | AC-059: unter „Verwalten“ → „Entwicklung“, nur in Entwicklungs-Builds  |
| Spec 0001, AC-016: leerer Zustand mit „Beschreiben ✨“            | AC-047: ohne „Beschreiben ✨“, solange die KI aus ist                  |
| Spec 0001, AC-039: Feedback „über das Profil“                     | AC-054: Feedback über „Verwalten“                                      |
| Spec 0001, REQ-009 und Spec 0003, REQ-008 (KI-Bedienung)          | ausgesetzt, solange der KI-Schalter aus ist (AC-044 bis AC-048)        |
| Spec 0002, AC-001: „Umschalter Rezepte · Restaurants“             | AC-020: Ansichts-Tabs (Spec 0008, AC-001 beschreibt „Essen“ im Detail) |
| Spec 0003, AC-008: Einladen „unter Einstellungen → Haushalt“      | AC-056: unter „Verwalten“ → „Haushalt & Mitglieder“; sonst unverändert |
| Spec 0004, AC-004: „Umschalter“ Woche · Aktivitäten               | AC-021: Ansichts-Tabs; Inhalt unverändert                              |

Wie das Rezept am Desktop aussieht (ganze Seite statt neben der Liste), regelt Spec 0008, AC-019;
sie ersetzt Spec 0001, AC-008.

## Anforderungen und Akzeptanzkriterien

Handybreite heißt 390 × 844 px, Desktop 1440 × 900 px, wenn nichts anderes steht. Daten wie im
Beispielhaushalt „Enrico & Nadja“ (Spec 0001, AC-012; Spec 0003, AC-033). Der **Showroom** ist die
Seite `/showroom` in Entwicklungs-Builds; er zeigt jeden neuen Baustein mit Beispieldaten.

### REQ-001 — Navigation auf jeder Seite

> Jede Seite öffnet sich im Stapel ihres Bereichs; Tab-Leiste bzw. Seitenleiste und „Zurück“
> bleiben sichtbar, nur Einkaufen und Kochen sind auf dem Handy Vollbild.

**Offline:** offline vollständig (reine Navigation).

**AC-001 — Rezept auf dem Handy**

```gherkin
Angenommen  Handybreite, „Essen“ ist offen und ich habe in der Rezeptliste nach unten gescrollt
Wenn        ich das Rezept „Lasagne“ öffne
Dann        sehe ich unten die Tab-Leiste mit „Essen“ als aktivem Tab
Und         oben links den Pfeil „Zurück“
Wenn        ich „Zurück“ wähle
Dann        bin ich wieder in „Essen“ an derselben Stelle der Rezeptliste
```

**AC-002 — Alle Detailseiten**

```gherkin
Angenommen  Handybreite
Wenn        ich nacheinander ein Restaurant, eine Aktivität, die Märkte, einen Markt, „Feedback“,
            „Haushalt & Mitglieder“, „Abwesenheiten“ und die Einstellungen öffne
Dann        hat jede dieser Seiten die Tab-Leiste und eine Kopfzeile mit Titel und „Zurück“
Und         hervorgehoben ist beim Restaurant „Essen“, bei der Aktivität „Plan“ und bei den übrigen
            Seiten kein Tab
```

**AC-003 — Desktop**

```gherkin
Angenommen  Desktopbreite
Wenn        ich über die Seitenleiste „Märkte & Bereiche“ und dort „Rewe Südstadt“ öffne
Dann        steht der Markt rechts der Seitenleiste, die Seitenleiste bleibt vollständig sichtbar
Und         die Kopfzeile hat „Zurück“ und den Titel „Rewe Südstadt“
```

**AC-004 — Randfall: Seite direkt aufgerufen**

```gherkin
Angenommen  ich öffne die Adresse des Markts „Rewe Südstadt“ direkt, z. B. durch Neuladen der Seite
Dann        sind Tab-Leiste bzw. Seitenleiste da
Und         „Zurück“ führt zu den Märkten, nicht aus der App heraus
```

**AC-005 — Zurück-Taste von Android und Browser**

```gherkin
Angenommen  ich bin über „Verwalten“ → „Märkte & Bereiche“ in den Markt „Rewe Südstadt“ gegangen
Wenn        ich die Zurück-Taste von Android oder des Browsers drücke
Dann        sehe ich wieder die Märkte
Wenn        ich sie noch einmal drücke
Dann        sehe ich wieder „Verwalten“
```

**AC-006 — Vollbild auf dem Handy (D5)**

```gherkin
Angenommen  Handybreite
Wenn        ich auf „Liste“ „Einkaufen“ starte
Dann        ist die Tab-Leiste verdeckt und oben steht „Fertig“
Wenn        ich „Einkaufen“ verlasse und im Rezept „Lasagne“ „Kochen“ starte
Dann        ist die Tab-Leiste verdeckt und oben steht „Fertig“
```

**AC-007 — Vollbild am Desktop**

```gherkin
Angenommen  Desktopbreite
Wenn        ich „Einkaufen“ oder „Kochen“ starte
Dann        bleibt die Seitenleiste sichtbar und oben steht „Fertig“
```

### REQ-002 — Seitenrahmen: Kopfzeile bleibt oben, Breite bleibt gleich

> Kopfzeile, Ansichts-Tabs und Gruppenüberschriften bleiben beim Scrollen sichtbar; am Desktop hat
> jeder Bereich eine feste Inhaltsbreite und der Avatar steht nur in der Seitenleiste.

**Offline:** offline vollständig.

**AC-008 — Handy: schmale Kopfleiste**

```gherkin
Angenommen  Handybreite, „Essen“ mit mindestens 20 Rezepten, ganz oben
Wenn        ich 1000 px nach unten scrolle
Dann        steht oben eine schmale Kopfleiste mit dem Titel „Essen“ und allen Knöpfen der Kopfzeile
Und         jeder dieser Knöpfe lässt sich antippen und tut dasselbe wie oben
Und         die Ansichts-Tabs „Rezepte · Restaurants“ kleben direkt darunter
Und         Suchfeld und Filterzeile sind aus dem Bild gerutscht
Wenn        ich ein Stück nach oben scrolle, ohne den Anfang zu erreichen
Dann        sind Suchfeld und Filterzeile wieder sichtbar
```

**AC-009 — Desktop: feste Kopfzeile**

```gherkin
Angenommen  Desktopbreite, „Haushalt“ → „Alle“ mit so vielen Aufgaben, dass die Seite scrollt, ganz
            oben
Dann        hat die Kopfzeile unten keine Kante
Wenn        ich 1000 px nach unten scrolle
Dann        stehen Titel, Ansichts-Tabs und Knöpfe unverändert an ihrem Platz
Und         unter der Kopfzeile erscheint eine feine Kante
```

**AC-010 — Gruppenüberschriften kleben**

```gherkin
Angenommen  die Einkaufsliste mit 12 offenen Posten unter „Obst & Gemüse“ und weiteren unter
            „Kühlregal & Molkerei“
Wenn        ich scrolle, bis die ersten Posten von „Obst & Gemüse“ oben verschwunden sind
Dann        steht „Obst & Gemüse“ direkt unter der Kopfzeile
Wenn        ich weiterscrolle, bis „Kühlregal & Molkerei“ oben ankommt
Dann        steht dort „Kühlregal & Molkerei“ statt „Obst & Gemüse“
```

**AC-011 — Breite springt nicht**

```gherkin
Angenommen  Desktopbreite, „Haushalt“ ist offen
Wenn        ich zwischen „Anstehend“, „Alle“ und „Verlauf“ wechsle
Dann        beginnt der Inhalt in allen drei Ansichten an derselben Stelle und ist gleich breit
```

**AC-012 — Inhaltsbreite**

```gherkin
Angenommen  ein Fenster von 1440 px Breite, „Heute“ ist offen
Dann        beginnt der Inhalt 36 px rechts der Seitenleiste und reicht bis 36 px vor den rechten
            Rand
Wenn        ich das Fenster auf 1920 px verbreitere
Dann        ist der Inhalt 1320 px breit und steht mittig im Raum rechts der Seitenleiste
```

**AC-013 — Avatar nur in der Seitenleiste**

```gherkin
Angenommen  Desktopbreite
Wenn        ich nacheinander die fünf Tab-Startseiten öffne
Dann        steht der Avatar auf keiner in der Kopfzeile, sondern nur unten in der Seitenleiste
```

### REQ-003 — Fenster mit fester Größe

> Jedes Fenster hat eine von drei festen Größen; Kopf und Fuß stehen fest, nur die Mitte scrollt.

**Offline:** offline vollständig (Darstellung).

**AC-014 — Tabs und Fehler ändern die Größe nicht**

```gherkin
Angenommen  Handybreite, im Plan ist das Hinzufügen-Fenster für Samstagabend offen (Größe „Groß“)
Wenn        ich nacheinander jede Art im Fenster wähle (Rezept, Restaurant, Aktivität, Freitext,
            Reste)
Dann        ist das Fenster jedes Mal 760 px hoch (90 % von 844 px)
Und         Titel und Auswahl der Art stehen oben fest
Wenn        ich unter „Aktivität“ „Neue Aktivität“ ohne Namen speichern will und „Name fehlt“
            erscheint
Dann        ist das Fenster weiter 760 px hoch
```

**AC-015 — Desktop-Größen**

```gherkin
Angenommen  ein Fenster von 1440 × 900 px
Wenn        ich nacheinander „Markt wählen“ (klein), „Aufgabe anlegen“ (mittel) und das
            Hinzufügen-Fenster im Plan (groß) öffne
Dann        steht jedes als Dialog in der Mitte
Und         „Markt wählen“ ist 440 px breit und so hoch wie sein Inhalt
Und         „Aufgabe anlegen“ ist 560 × 640 px und das Hinzufügen-Fenster 760 × 720 px groß
```

**AC-016 — Randfall: niedriges Fenster**

```gherkin
Angenommen  ein Fenster von 1440 × 700 px
Wenn        ich das Hinzufügen-Fenster im Plan öffne
Dann        ist es 760 px breit und 595 px hoch (85 % der Höhe)
```

**AC-017 — Randfall: kleines Fenster mit langem Inhalt**

```gherkin
Angenommen  Handybreite und ein kleines Fenster mit 30 Einträgen (Showroom)
Wenn        ich es öffne
Dann        ist es 422 px hoch (die Hälfte der Bildschirmhöhe) und scrollt innen
```

**AC-018 — Kopf und Fuß stehen**

```gherkin
Angenommen  das mittlere Fenster „Aufgabe anlegen“ mit mehr Feldern, als hineinpassen
Wenn        ich in der Mitte bis ans Ende scrolle
Dann        stehen der Titel oben und „Speichern“ unten unverändert an ihrem Platz
```

**AC-019 — Ausnahme: Aufklappen wächst einmal**

```gherkin
Angenommen  ein kleines Fenster mit einem eingeklappten Abschnitt (Showroom)
Wenn        ich den Abschnitt aufklappe und danach wieder einklappe
Dann        ist das Fenster nach dem Aufklappen „Groß“ und bleibt „Groß“, bis ich es schließe
```

### REQ-004 — Ansichts-Tabs, Menü und Auswahl-Chips statt Segment-Balken (D1)

> Jeder Segment-Balken wird durch das Muster seiner Aufgabe ersetzt; den Baustein `Segmented`
> gibt es nicht mehr.

**Offline:** offline vollständig.

**AC-020 — Ansichts-Tabs in Essen** (ersetzt Spec 0002, AC-001, in der Form des Umschalters)

```gherkin
Angenommen  „Essen“ ist offen
Dann        stehen oben die Ansichts-Tabs „Rezepte“ und „Restaurants“: nur Text, linksbündig, ohne
            Kasten, unter dem aktiven „Rezepte“ eine Linie in Akzentfarbe
Und         der Screenreader meldet beide als Tabs und „Rezepte“ als ausgewählt
Wenn        ich „Restaurants“ wähle
Dann        sehe ich die Restaurants und die Linie steht unter „Restaurants“
```

**AC-021 — Ansichts-Tabs in Plan und Haushalt** (ändert die Form von Spec 0004, AC-004)

```gherkin
Angenommen  die App ist offen
Wenn        ich „Plan“ und danach „Haushalt“ öffne
Dann        wechseln dort die Ansichts-Tabs „Woche · Aktivitäten“ bzw. „Anstehend · Alle · Verlauf“
            die Ansicht, mit demselben Inhalt wie bisher
```

**AC-022 — Sortieren als Menü**

```gherkin
Angenommen  „Essen“ → „Rezepte“, sortiert nach „Zuletzt“
Wenn        ich den Knopf „↕ Zuletzt ▾“ wähle
Dann        öffnet sich eine kurze Liste mit „Zuletzt“, „Neu“, „A–Z“ und „Bewertung“, „Zuletzt“ mit
            Haken
Wenn        ich „A–Z“ wähle
Dann        schließt sich die Liste, der Knopf heißt „↕ A–Z ▾“ und die Rezepte stehen alphabetisch
```

**AC-023 — Auswahl-Chips im Formular**

```gherkin
Angenommen  das Feedback-Formular ist offen
Dann        steht „Art“ als Auswahl-Chips „Idee“, „Problem“ und „Lob“, genau einer davon aktiv
Wenn        ich „Problem“ wähle
Dann        ist nur „Problem“ aktiv
Und         der Screenreader meldet die Chips als Auswahl, von der genau eine gewählt ist
```

**AC-024 — Randfall: viele Tabs auf schmalem Bildschirm**

```gherkin
Angenommen  320 px Breite und Ansichts-Tabs mit fünf Einträgen (Showroom)
Dann        lassen sich die Tabs seitlich wischen, ohne dass die Seite seitlich scrollt
Wenn        ich den fünften Tab wähle
Dann        ist er vollständig sichtbar und hervorgehoben
```

**AC-025 — Kein Segment-Balken mehr**

```gherkin
Angenommen  der Code in `packages/ui` und `apps/app`
Wenn        `pnpm check` läuft
Dann        gibt es keinen Baustein `Segmented` mehr und keine Stelle, die ihn verwendet
```

### REQ-005 — Abhaken mit Sammel-Fenster (D3)

> Ein Baustein zum Abhaken: Haken setzt und streicht durch, nochmal tippen nimmt ihn zurück, 2 s
> nach dem letzten Tipp räumt er alle abgehakten Zeilen gemeinsam weg.

**Offline:** offline vollständig für den Baustein selbst. Ob und wann ein Haken offline gespeichert
wird, legt die Spec fest, die ihn einsetzt.

**AC-026 — Abhaken und zurücknehmen**

```gherkin
Angenommen  der Abhak-Baustein im Showroom mit den offenen Zeilen „Milch“, „Brot“ und „Eier“
Wenn        ich „Milch“ abhake
Dann        hat „Milch“ einen Haken, ist durchgestrichen und steht an derselben Stelle
Und         es erscheint kein Hinweis und kein „Rückgängig“
Wenn        ich „Milch“ eine Sekunde später noch einmal antippe
Dann        ist „Milch“ wieder offen und nicht durchgestrichen
```

**AC-027 — Gesammelt aufräumen**

```gherkin
Angenommen  dieselben drei offenen Zeilen
Wenn        ich bei 0,0 s „Milch“, bei 0,8 s „Brot“ und bei 1,5 s noch einmal „Milch“ antippe
Dann        steht bei 3,4 s „Brot“ noch durchgestrichen an seiner Stelle
Und         bei 3,5 s ist „Brot“ aus den offenen Zeilen verschwunden
Und         „Milch“ und „Eier“ stehen offen in ihrer Reihenfolge
```

**AC-028 — Mehrere Haken gehen gemeinsam**

```gherkin
Angenommen  dieselben drei offenen Zeilen
Wenn        ich bei 0,0 s „Milch“, bei 0,5 s „Brot“ und bei 1,0 s „Eier“ abhake
Dann        stehen bei 2,9 s alle drei noch durchgestrichen an ihrer Stelle
Und         bei 3,0 s sind alle drei gemeinsam verschwunden
```

**AC-029 — Seite vorher verlassen**

```gherkin
Angenommen  „Brot“ ist abgehakt, das Sammel-Fenster läuft noch
Wenn        ich die Seite verlasse und gleich wieder öffne
Dann        steht „Brot“ nicht mehr unter den offenen Zeilen
```

**AC-030 — Bewegung und Screenreader**

```gherkin
Angenommen  im System ist „Bewegung reduzieren“ eingeschaltet
Wenn        ich „Milch“ abhake und das Sammel-Fenster abläuft
Dann        blendet „Milch“ nur aus, ohne zu gleiten
Und         beim Abhaken sagt der Screenreader „Milch abgehakt“, beim Zurücknehmen „Milch wieder
            offen“
```

**AC-031 — Randfall: Haken von einem anderen Gerät** (Offene Frage 3)

```gherkin
Angenommen  ich habe „Milch“ abgehakt, mein Sammel-Fenster läuft
Wenn        ein Haken von Nadjas Gerät bei „Eier“ ankommt
Dann        steht „Eier“ durchgestrichen an seiner Stelle und verschwindet gemeinsam mit „Milch“
Wenn        später ein Haken von Nadja bei „Brot“ ankommt, während bei mir kein Sammel-Fenster läuft
Dann        verschwindet „Brot“ sofort aus den offenen Zeilen
```

### REQ-006 — Suchen oder anlegen

> Ein Baustein zum Auswählen: Suchfeld mit Treffern, darunter „neu anlegen“ je Art, eine Bremse
> gegen Doppelte und optional „Mehr Angaben“; was neu angelegt wird, ist danach ausgewählt.

**Offline:** Suchen offline vollständig (lokaler Speicher). Anlegen nur online, außer die Spec, die
den Baustein einsetzt, erlaubt es offline (z. B. Posten hinzufügen, ADR-0008 Nachtrag).

**AC-032 — Treffer mit Synonym**

```gherkin
Angenommen  der Baustein im Showroom über Artikel, darunter „Möhren“ (Synonym „Karotten“, Bereich
            „Obst & Gemüse“), „Kokosmilch“ und „Kokosmilch light“ (beide „Konserven & Saucen“)
Wenn        ich „Karot“ tippe
Dann        steht „Möhren“ mit „auch: Karotten“ und „Obst & Gemüse“ unter den Treffern
Wenn        ich stattdessen „Kokos“ tippe
Dann        stehen „Kokosmilch“ und „Kokosmilch light“ unter den Treffern, je mit ihrem Bereich
```

**AC-033 — Neu anlegen**

```gherkin
Angenommen  derselbe Baustein, es gibt keinen Artikel „Drachenfrucht“
Wenn        ich „Drachenfrucht“ tippe
Dann        steht unter den Treffern die Zeile „„Drachenfrucht“ neu anlegen“
Wenn        ich sie wähle
Dann        gibt es den Artikel „Drachenfrucht“ und er ist im Feld ausgewählt
```

**AC-034 — Bremse gegen Doppelte**

```gherkin
Angenommen  derselbe Baustein mit dem Artikel „Kokosmilch“
Wenn        ich „Kokosmilsch“ tippe
Dann        steht an der Zeile „neu anlegen“ „Meinst du Kokosmilch?“ mit „Ja“ und „Trotzdem neu“
Wenn        ich „Ja“ wähle
Dann        ist „Kokosmilch“ ausgewählt und nichts wurde angelegt
Wenn        ich stattdessen „Trotzdem neu“ wähle
Dann        gibt es den Artikel „Kokosmilsch“ und er ist ausgewählt
Wenn        ich in einem neuen Baustein „Milchko“ tippe (Offene Frage 5)
Dann        steht „Kokosmilch“ unter den Treffern und an „„Milchko“ neu anlegen“ steht „Meinst du
            Kokosmilch?“
Wenn        ich „Kokos“ tippe
Dann        steht an „„Kokos“ neu anlegen“ keine Bremse
```

**AC-035 — Randfall: Name gibt es schon, leeres Feld**

```gherkin
Angenommen  derselbe Baustein mit „Möhren“ (Synonym „Karotten“)
Wenn        ich „karotten“ tippe
Dann        gibt es keine Zeile „neu anlegen“, nur den Treffer „Möhren“
Wenn        ich das Feld leere
Dann        gibt es weder Treffer noch „neu anlegen“
```

**AC-036 — Mehrere Arten und „Mehr Angaben“**

```gherkin
Angenommen  der Baustein über Rezepte, Restaurants und Aktivitäten (Showroom), nichts heißt
            „Paella“, das Fenster bietet „Mehr Angaben ▸“
Wenn        ich „Paella“ tippe
Dann        gibt es je Art eine Zeile: „„Paella“ als Rezept anlegen“, „… als Restaurant anlegen“ und
            „… als Aktivität anlegen“
Wenn        ich „Mehr Angaben ▸“ wähle
Dann        klappen die zusätzlichen Felder im selben Fenster auf, ohne dass es seine Größe ändert
```

**AC-037 — Randfall: offline**

```gherkin
Angenommen  das Gerät ist offline, der Baustein erlaubt kein Anlegen ohne Netz
Wenn        ich „Paella“ tippe
Dann        sehe ich die Treffer aus dem lokalen Speicher
Und         die Zeilen „anlegen“ sind ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“
```

### REQ-007 — Filterzeile und Endlos-Liste

> Listen mit Filtern haben höchstens zwei Zeilen Bedienung; lange Listen zeichnen nur, was sichtbar
> ist, kennen keine Seiten und merken sich die Stelle.

**Offline:** offline vollständig (alles liest aus dem lokalen Speicher).

**AC-038 — Eine Filterzeile**

```gherkin
Angenommen  Handybreite, die Filterzeile im Showroom über 40 Beispielrezepte mit den Schnell-Chips
            „Favoriten“, „Vegan“ und „< 30 Min“
Dann        stehen über der Liste genau zwei Zeilen: das Suchfeld und eine Zeile mit „Filter“, „↕
            Zuletzt ▾“ und den Schnell-Chips, die sich seitlich wischen lassen
Wenn        ich „Vegan“ antippe
Dann        ist „Vegan“ aktiv, die Liste zeigt nur vegane Beispielrezepte und der Knopf heißt
            „Filter (1)“
```

**AC-039 — Filterfeld auf dem Handy**

```gherkin
Angenommen  dieselbe Filterzeile auf dem Handy
Wenn        ich „Filter“ wähle
Dann        öffnet sich das Filterfeld als mittleres Fenster mit „Zurücksetzen“ und „n Rezepte
            zeigen“ im Fuß, n ist die Zahl der Treffer der aktuellen Auswahl
Und         n passt sich bei jeder Änderung im Filterfeld sofort an
Wenn        ich „n Rezepte zeigen“ wähle
Dann        schließt sich das Fenster und jeder aktive Filter steht als Chip mit ✕ in der
            Filterzeile
Wenn        ich an einem dieser Chips ✕ wähle
Dann        ist dieser Filter aus und die Liste zeigt wieder die passenden Rezepte
```

**AC-040 — Filterfeld am Desktop**

```gherkin
Angenommen  dieselbe Filterzeile am Desktop
Wenn        ich „Filter“ wähle
Dann        klappt das Filterfeld unter der Zeile auf, mit „Einklappen ▴“
Und         es öffnet sich kein Dialog und die Liste rückt nach unten
```

**AC-041 — Randfall: keine Treffer**

```gherkin
Angenommen  das Filterfeld mit einer Auswahl, auf die kein Beispielrezept passt
Dann        heißt der Knopf „0 Rezepte zeigen“
Wenn        ich ihn wähle
Dann        zeigt die Liste einen leeren Zustand mit „Filter zurücksetzen“
```

**AC-042 — Endlos-Liste**

```gherkin
Angenommen  die Endlos-Liste im Showroom mit 1000 Beispielzeilen
Dann        gibt es keine Seiten und keinen Knopf „Mehr laden“
Und         gezeichnet sind nur die sichtbaren Zeilen und ein kleiner Vorrat davor und danach, nie
            alle 1000
Wenn        ich bis ans Ende scrolle
Dann        ist Zeile 1000 sichtbar
```

**AC-043 — Stelle bleibt**

```gherkin
Angenommen  ich habe in der Endlos-Liste des Showrooms bis Zeile 400 gescrollt
Wenn        ich Zeile 400 öffne (Beispiel-Detailseite) und mit „Zurück“ zurückkehre
Dann        steht Zeile 400 an derselben Stelle wie vorher
```

### REQ-008 — KI ausgeblendet

> Ein Schalter im Code, Standard „aus“, blendet jeden Zugang zur KI aus; Daten, KI-Kontingent und
> Server-Funktionen bleiben unverändert.

**Offline:** nicht anwendbar (es wird nur weniger angezeigt).

**AC-044 — Nichts zu sehen** (setzt Spec 0001, REQ-009 und Spec 0003, REQ-008 aus, solange der
Schalter aus ist; ersetzt den Assistent-Knopf aus Spec 0001, AC-007)

```gherkin
Angenommen  ein Build mit KI-Schalter „aus“ (Standard)
Wenn        ich auf Handy und Desktop Heute, Essen, ein Rezept, Plan, Liste, Haushalt und die
            Einstellungen öffne
Dann        gibt es nirgends: den Assistent-Knopf, „Assistent“ in der Seitenleiste, den Schalter
            „KI-Suche“, „Beschreiben ✨“, „Anpassen“ im Rezept, Mikrofon und ✨ in der Eingabezeile
            der Liste, Vorschlagszeilen und den Abschnitt „KI“ in den Einstellungen
```

**AC-045 — Keine Anfrage an die KI**

```gherkin
Angenommen  derselbe Build
Wenn        alle Rundgänge (`pnpm e2e`) laufen
Dann        geht keine Anfrage an eine KI-Funktion des Servers
```

**AC-046 — Randfall: gespeicherte KI-Einstellung**

```gherkin
Angenommen  auf dem Gerät war die KI-Suche vor dem Update eingeschaltet
Wenn        ich in „Essen“ „was Schnelles mit Tofu“ suche
Dann        sehe ich nur Stichworttreffer und es geht keine Anfrage an die KI
Und         die gespeicherte Einstellung bleibt auf dem Gerät erhalten
```

**AC-047 — Leerer Zustand ohne KI** (ersetzt Spec 0001, AC-016, im Punkt „Beschreiben ✨“)

```gherkin
Angenommen  der Haushalt „Test“ ohne Rezepte, KI-Schalter „aus“
Wenn        ich „Essen“ öffne
Dann        zeigt „Noch keine Rezepte“ die ersten Schritte „Titel eingeben“ und „Starter-Rezepte
            ansehen“, ohne „Beschreiben ✨“
```

**AC-048 — Schalter an**

```gherkin
Angenommen  ein Entwicklungs-Build mit KI-Schalter „an“
Wenn        ich dieselben Seiten wie in AC-044 öffne
Dann        sind alle dort genannten Zugänge wieder da
Und         die Tests zu Spec 0003, REQ-008 laufen in diesem Build grün
```

### REQ-009 — Frisch ruhiger (D4)

> Im Theme „Frisch“ färbt je Bildschirm nur die Bereichsfarbe des aktiven Tabs den Akzent der
> Kopfzeile und den Hauptknopf; Abschnitte haben keine Farbfläche.

**Offline:** nicht anwendbar.

**AC-049 — Keine Farbflächen**

```gherkin
Angenommen  Theme „Frisch“ hell, „Heute“ ist offen
Dann        ist kein Abschnitt farbig ausgemalt: alle stehen als Kacheln in `surface` auf dem Grund
            `bg`, Abschnittstitel in Tinte
Und         auf dem Bildschirm erscheint keine zweite Bereichsfarbe neben der von „Heute“
```

**AC-050 — Bereichsfarbe folgt dem Tab, Tab-Leiste in Tinte**

```gherkin
Angenommen  Theme „Frisch“ hell, Handybreite, „Liste“ ist offen
Dann        ist der aktive Tab in der Tab-Leiste eine Pille in Tinte
Und         Akzent der Kopfzeile und Hauptknopf haben die Farbe von „Liste“
Wenn        ich zu „Haushalt“ wechsle
Dann        haben Akzent und Hauptknopf die Farbe von „Haushalt“ und nichts mehr die von „Liste“
```

**AC-051 — Randfall: Kontrast**

```gherkin
Angenommen  die gedämpften Farben von „Frisch“ in hell und dunkel
Wenn        der Kontrast-Test läuft
Dann        erreicht jedes Paar aus Text und Hintergrund mindestens 4,5:1 und jedes große Element
            mindestens 3:1 (wie Spec 0001, AC-003)
```

### REQ-010 — Verwalten und persönliche Einstellungen (D2, D28, D30)

> Die Seiten zum Verwalten des Haushalts stehen als „Verwalten“ in der Seitenleiste bzw. hinter
> ⊞; die Einstellungen hinter dem Avatar enthalten nur Persönliches.

**Offline:** offline lesend. Navigation und Lesen gehen ohne Netz; Bearbeiten auf den Seiten braucht
Netz wie bisher.

**AC-052 — Seitenleiste**

```gherkin
Angenommen  Desktopbreite
Dann        steht in der Seitenleiste unter den fünf Bereichen die Gruppe „Verwalten“ mit drei durch
            feine Linien getrennten Blöcken: „Aktivitäten“ und „Abwesenheiten“; „Märkte & Bereiche“;
            „Haushalt & Mitglieder“ und „Feedback“
Wenn        ich „Märkte & Bereiche“ wähle
Dann        öffnen sich die Märkte rechts der Seitenleiste und „Märkte & Bereiche“ ist hervorgehoben
Wenn        ich dort „Rewe Südstadt“ öffne
Dann        bleibt „Märkte & Bereiche“ hervorgehoben
```

**AC-053 — Randfall: niedriges Fenster**

```gherkin
Angenommen  ein Fenster von 1440 × 600 px
Wenn        ich in der Seitenleiste nach unten scrolle
Dann        bleiben die fünf Bereiche oben stehen und nur der Teil darunter scrollt
Und         der Avatar unten ist erreichbar
```

**AC-054 — Handy: Knopf ⊞ und Seite „Verwalten“** (ersetzt Spec 0001, AC-039, im Weg zum
Feedback)

```gherkin
Angenommen  Handybreite
Dann        hat jede Tab-Startseite (Heute, Essen, Plan, Liste, Haushalt) im Kopf den Knopf
            „Verwalten“ (⊞) links neben dem Avatar
Wenn        ich auf „Heute“ ⊞ wähle
Dann        öffnet sich die Seite „Verwalten“ mit denselben Einträgen wie am Desktop, in den Blöcken
            „Planen“, „Einkaufen“ und „Haushalt“
Und         die Tab-Leiste ist sichtbar und kein Tab ist hervorgehoben
Wenn        ich „Feedback“ wähle und danach „Zurück“
Dann        bin ich wieder auf „Verwalten“
```

**AC-055 — Einstellungen nur persönlich**

```gherkin
Angenommen  ich wähle den Avatar (Handy oben rechts, Desktop unten in der Seitenleiste)
Dann        zeigen die Einstellungen nur „Profil“, „Darstellung“ (Theme; Hell, Dunkel, System) und
            „Abmelden“
Und         nicht mehr: Haushalte, Mitglieder, Einladungen, Märkte, Feedback, Abwesenheit, KI,
            Showroom und „Offline simulieren“
```

**AC-056 — Haushalt & Mitglieder** (ersetzt Spec 0003, AC-008, im Weg „Einstellungen → Haushalt“)

```gherkin
Angenommen  Enrico ist Mitglied von „Enrico & Nadja“ und „WG Köln“, eine Einladung an ihn ist offen
Wenn        er „Verwalten“ → „Haushalt & Mitglieder“ öffnet
Dann        sieht er den Namen des aktiven Haushalts, dessen Mitglieder, „Einladen“, die offenen
            Einladungen, die Einladungen an ihn und die weiteren Haushalte mit „Wechseln“ und „Neuer
            Haushalt“
Und         Einladen, Annehmen, Ablehnen und Anlegen verhalten sich wie in Spec 0003, AC-008 bis
            AC-010
```

**AC-057 — Haushaltsname oben in der Seitenleiste**

```gherkin
Angenommen  Desktopbreite, Enrico ist Mitglied von „Enrico & Nadja“ und „WG Köln“
Wenn        er oben in der Seitenleiste „Enrico & Nadja ▾“ wählt
Dann        bietet ein Menü „WG Köln“ zum Wechseln und „Neuer Haushalt“ an
Wenn        er „WG Köln“ wählt
Dann        zeigt die App die Daten von „WG Köln“ und oben steht „WG Köln ▾“
```

**AC-058 — Abwesenheiten als eigene Seite**

```gherkin
Angenommen  im Haushalt ist eine Abwesenheit von Nadja eingetragen
Wenn        ich „Verwalten“ → „Abwesenheiten“ öffne
Dann        sehe ich Nadjas Abwesenheit und kann Abwesenheiten so eintragen und ändern wie bisher in
            den Einstellungen
```

**AC-059 — Entwicklung nur in Entwicklungs-Builds** (ersetzt Spec 0001, AC-010, im Ort des
Schalters „Offline simulieren“)

```gherkin
Angenommen  ein Entwicklungs-Build
Dann        hat „Verwalten“ eine dritte Gruppe „Entwicklung“ mit „Showroom“ und „Offline simulieren“
Wenn        ich denselben Stand ohne Entwicklungs-Schalter baue und öffne
Dann        fehlt die Gruppe „Entwicklung“ und `/showroom` zeigt „Nicht gefunden“
```

**AC-060 — Randfall: offline**

```gherkin
Angenommen  das Gerät ist offline
Wenn        ich „Verwalten“ → „Haushalt & Mitglieder“ öffne
Dann        sehe ich Mitglieder und Einladungen aus dem lokalen Speicher
Und         „Einladen“ ist ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“
```

## Offline und Konflikte

Diese Spec ändert nichts daran, was offline geht (`docs/architecture/sync.md`, ADR-0008):

| Bereich                               | Verhalten                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Navigation, Kopfzeilen, Fenster, Tabs | offline vollständig; es wird nichts geladen                                                       |
| Suchen oder anlegen                   | Suche offline aus dem lokalen Speicher; Anlegen nur online, außer die einsetzende Spec erlaubt es |
| Filterzeile, Endlos-Liste             | offline vollständig                                                                               |
| Abhak-Baustein                        | wirkt offline sofort; ob der Haken offline gespeichert wird, regelt die einsetzende Spec          |
| Verwalten, Einstellungen              | offline lesend; Bearbeiten ausgegraut mit Hinweis                                                 |

**Konflikt:** Kommt während meines Sammel-Fensters ein Haken oder ein Zurücknehmen von einem anderen
Gerät an, wartet die Zeile mit meinen Haken und räumt gemeinsam mit ihnen auf (AC-031). So rutscht
die Liste nicht unter dem Finger weg. Für das Speichern gelten unverändert die Regeln aus `sync.md`
(„Abhaken gewinnt“ bzw. letzte Änderung je Feld).

## Plattformen

- **Handy (< 700 px):** Tab-Leiste unten, ⊞ und Avatar im Kopf der Tab-Startseiten, Fenster von
  unten. Die schmale Kopfleiste respektiert die sicheren Ränder (Notch, Statusleiste). Bei großer
  Schrift (Dynamic Type) darf der große Titel umbrechen; die schmale Leiste kürzt ihn mit „…“.
- **Tablet und iPad (ab 700 px) und Desktop:** Seitenleiste mit „Verwalten“, Fenster als Dialog in
  der Mitte mit den Desktop-Größen, Avatar nur unten in der Seitenleiste.
- **Tastatur (Web):** Ansichts-Tabs wechseln mit den Pfeiltasten; Esc schließt ein Fenster; der
  Fokus bleibt im offenen Fenster und kehrt danach zum auslösenden Knopf zurück; Menüs sind mit
  Pfeiltasten und Enter bedienbar.
- **Android:** Die Zurück-Taste geht im Stapel des Bereichs zurück und schließt ein offenes Fenster
  zuerst.
- **Web und PWA:** Die bisherigen Adressen der Seiten bleiben gültig und lassen sich direkt öffnen
  (AC-004).
- **Bewegung reduzieren:** Kopfleiste ohne Animation, Abhaken nur ausblenden (AC-030).
- Jede Wischgeste (Tabs, Chips) hat eine Alternative per Tipp oder Tastatur.

## Daten

- **Keine Änderung an der Datenbank und am lokalen Speicher.** Gelesen und geschrieben wird dasselbe
  wie bisher; Seiten ziehen nur um.
- Der KI-Schalter ist ein Wert im Code, keine Einstellung auf dem Gerät. Gespeicherte
  KI-Einstellungen (z. B. „KI-Suche an“) bleiben auf dem Gerät liegen und wirken nicht, solange der
  Schalter aus ist.
- Keine neuen personenbezogenen Daten.

## Offene Fragen

| #   | Frage                                                                                                                                                                                                                                                                                                                    | Optionen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Empfehlung                                                                                                         | Status                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| 1   | Wann erscheinen die Einträge „Artikel“ (Spec 0007) und „Reisetaschen“ (Spec 0012) unter „Verwalten“?                                                                                                                                                                                                                     | A: erst mit ihrer Spec — Pro: keine toten Einträge; Contra: die Gruppe wächst schrittweise · B: sofort, mit Platzhalter „Kommt bald“ — Pro: Aufbau sofort wie im Konzept; Contra: Einträge, die nichts tun                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | A, weil ein Eintrag ohne Seite wie ein Fehler wirkt                                                                | OFFEN, Annahme A            |
| 2   | Gehört Profil bearbeiten (Name, Farbe, Ernährung, Abneigungen; ✎ in der Skizze 3.11) in diese Spec?                                                                                                                                                                                                                      | A: nein, eigene kleine Spec — Pro: 0005 bleibt ohne Datenänderung; Contra: ✎ fehlt vorerst · B: ja — Pro: Einstellungen gleich vollständig; Contra: neue Schreibwege, Spec wird größer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | A, weil 0005 schon groß ist und sonst nur Oberfläche ändert                                                        | OFFEN, Annahme A            |
| 3   | Was passiert mit Haken von einem anderen Gerät, während mein Sammel-Fenster läuft?                                                                                                                                                                                                                                       | A: sie warten und räumen mit meinen auf — Pro: nichts rutscht unter dem Finger; Contra: fremde Haken bleiben bis zu 2 s länger sichtbar · B: sie verschwinden sofort — Pro: einfacher; Contra: genau das Nachrutschen, das das Muster verhindern soll                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A, weil es Enricos Ziel trifft („nicht versehentlich auf den falschen klicken“)                                    | OFFEN, Annahme A            |
| 4   | Kleinere Auslegungen, die das Konzept offenlässt                                                                                                                                                                                                                                                                         | (a) „Frisch“: Regel 5 (Tab-Leiste in Tinte) geht vor Regel 1; die Bereichsfarbe färbt die Linie der Ansichts-Tabs, den Akzent der Kopfzeile und den Hauptknopf · (b) Seiten unter „Verwalten“ und die Einstellungen haben in „Frisch“ keine Bereichsfarbe, nur Tinte · (c) Screenreader beim Zurücknehmen: „Milch wieder offen“ · (d) Filterfeld ohne Treffer: „0 Rezepte zeigen“ und leerer Zustand mit „Filter zurücksetzen“ (wie Spec 0008) · (e) Sortier-Menüs zeigen zunächst die heutigen Optionen; Spec 0008, AC-010 ergänzt „Am häufigsten“ und „Zufall“ und nennt „Zuletzt“ im Menü „Zuletzt gekocht“ · (f) `/showroom` ist in Produktion „Nicht gefunden“ · (g) „Abwesenheiten“ zieht mit dem heutigen Inhalt aus den Einstellungen auf eine eigene Seite; Spec 0010 gestaltet sie neu | wie beschrieben, weil es die kleinste Lösung ist, die zum Konzept passt                                            | OFFEN, Annahmen (a) bis (g) |
| 5   | Wie fehlertolerant ist die Suche in „Suchen oder anlegen“? Die Skizze 2.6 zeigt „Milchko“ → „Kokosmilch“ (Spec 0007, REQ-001 und Spec 0008, AC-030 verweisen auf diese Regel); die heutige Suche (Anfang, Teilwort, ein bis zwei Tippfehler) findet das nicht. Die Regel gilt nur hier, für jedes Feld dieses Bausteins. | A: heutige Regeln behalten — Pro: erprobt, wenige Fehltreffer; Contra: Skizze und Spec 0008, AC-030 nicht erfüllt · B: zusätzlich Wortteil-Treffer — ein zusammenhängendes Stück des Suchbegriffs mit mindestens 5 Buchstaben steht im Namen oder einem Synonym; solche Treffer stehen hinter allen anderen und lösen die Bremse aus — Pro: findet vertauschte Wortteile wie in der Skizze; Contra: mehr Treffer, die Grenze von 5 Buchstaben ist geschätzt                                                                                                                                                                                                                                                                                                                                      | B, weil die freigegebene Skizze es so zeigt; ab 5 Buchstaben, damit kurze Wörter wie „Brot“ nichts Fremdes treffen | OFFEN, Annahme B            |

## Rückverfolgbarkeit

| REQ     | AC                | Task (plan.md) | Test |
| ------- | ----------------- | -------------- | ---- |
| REQ-001 | AC-001 bis AC-007 | —              | —    |
| REQ-002 | AC-008 bis AC-013 | —              | —    |
| REQ-003 | AC-014 bis AC-019 | —              | —    |
| REQ-004 | AC-020 bis AC-025 | —              | —    |
| REQ-005 | AC-026 bis AC-031 | —              | —    |
| REQ-006 | AC-032 bis AC-037 | —              | —    |
| REQ-007 | AC-038 bis AC-043 | —              | —    |
| REQ-008 | AC-044 bis AC-048 | —              | —    |
| REQ-009 | AC-049 bis AC-051 | —              | —    |
| REQ-010 | AC-052 bis AC-060 | —              | —    |
