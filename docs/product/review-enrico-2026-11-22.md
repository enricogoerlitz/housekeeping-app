# Review von Enrico: Bedienung und Oberfläche (22.11.2026)

Stand: 22.11.2026, 15:30 Uhr, Vorschau `https://test.house.kuschel-nest.de` mit v2026.11.1. Enrico
hat die erste Version am Desktop durchgesehen und seine Wünsche notiert; die Punkte fürs iPhone
reicht er nach. Dieses Dokument hält die Wünsche mit festen Kennungen (`ER-NN`) fest, damit Specs
darauf verweisen können.

## Rahmen

- Das Logik-Review (`review-logik-und-bedienung.md`) ist vollständig freigegeben. Seine offenen
  Befunde werden zusammen mit diesen Wünschen geplant.
- **Bei einem Widerspruch gilt dieses Dokument** vor der Empfehlung aus dem Logik-Review.
- Manche Punkte können seit dem Review schon behoben sein (Specs 0016, 0017 und 0018 kamen danach
  auf `develop`). Jede Spec prüft das am Code und vermerkt es.
- Es gibt keine nativen Apps: Auf dem Handy läuft die installierte Web-App. Die Web-App muss
  deshalb auf dem Handy in Aussehen und Bedienung überzeugen (ER-01).
- Die Version nach dieser Welle (Specs 0019–0028) ist die **erste, die Enrico und Nadja
  produktiv nutzen**. v2026.11.1 war nur die technische Erstauslieferung; in Produktion stehen
  keine Daten, die bleiben müssen. Code und Datenbank werden deshalb sauber auf den Zielstand
  gebracht, ohne Rücksicht auf v2026.11.1 und ohne Übergangslösungen (Spec 0028).

## Wünsche

Die Spalte „Befund“ nennt verwandte Befunde aus dem Logik-Review, „Spec“ die Spec, die den Wunsch
umsetzt.

### Allgemein

| ID    | Wunsch                                                                                                                                                                                                         | Befund     | Spec |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---- |
| ER-01 | Die Web-App ist fürs Handy optimiert: Aussehen, Antippen, Abstände. Sie ersetzt die nativen Apps.                                                                                                              | —          | 0019 |
| ER-02 | Viele Texte lassen sich mit der Maus markieren, wo das nicht sein soll: Seitenleiste, Kopfzeilen, „von – bis“ und KW auf der Übersicht. Einmal durchgehen und beheben.                                         | —          | 0019 |
| ER-03 | Angeklickte Elemente (auch in der Seitenleiste) bekommen einen Rahmen, der oft vom umgebenden Kasten abgeschnitten wird. Fast überall weg beim Klicken, auf dem Handy ganz.                                    | —          | 0019 |
| ER-04 | Am Desktop zeigen Elemente, dass die Maus darüber ist, z. B. Rezept-Kacheln. Nicht auf dem Handy.                                                                                                              | —          | 0019 |
| ER-05 | Der Zustand steht in der Adresse: offene Fenster, Filter und Suchen, Ansicht und Tag im Kalender, auch beim Sprung „Im Kalender planen“. Nach dem Neuladen ist alles wieder da. Durchgehen, wo es Sinn ergibt. | —          | 0019 |
| ER-06 | Jedes Aufklapp-Menü blitzt beim Schließen kurz links oben auf (Video `dropdown-flash.mov`). Beim Öffnen ist der erste Eintrag grau markiert, ohne dass die Maus darüber ist.                                   | —          | 0019 |
| ER-07 | Navigation: In „Essen“ ein Rezept öffnen, zu „Liste“ wechseln, zurück zu „Essen“ – man landet wieder im Rezept statt auf „Essen“. Das passiert an mehreren Stellen.                                            | X-01, X-05 | 0019 |
| ER-08 | In den Fenstern „Auf die Liste“ sind „Vorrat“ und „Gewürze“ eingeklappt. Sie sollen am Anfang ausgeklappt sein.                                                                                                | L-04       | 0025 |

### Übersicht

| ID    | Wunsch                                                                                                                                                                                                                                                                     | Befund | Spec |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- |
| ER-09 | Die Tagesleiste oben zeigt nicht die Kalenderwoche, sondern immer 7 Tage ab gestern: Am Sonntag interessiert der Montag davor nicht mehr, sondern was kommt, und noch gestern.                                                                                             | —      | 0020 |
| ER-10 | Blättern in der Leiste: Die Zeile „Guten Tag, <Name>“ verschwindet und alles darunter rutscht hoch. Zwischen den Pfeilen steht „Diese Woche · KW 47“, sonst ein links gesetzter Knopf „Heute“. Den Knopf braucht es, aber mit neuem Konzept; statt KW künftig „von – bis“. | —      | 0020 |
| ER-11 | Das Kalender-Symbol oben rechts entfällt; der Kalender steht schon in Seitenleiste und Tab-Leiste.                                                                                                                                                                         | —      | 0020 |
| ER-12 | „Für morgen: …“ steht nach der Tagesleiste und vor „Geplant“.                                                                                                                                                                                                              | U-02   | 0020 |
| ER-13 | Das Tagesfeld zeigt als Vorschau nicht den ersten Eintrag, sondern den wichtigsten: abends vor mittags vor morgens, darin Sammlung vor Rezept vor Restaurant; danach erst Aktivitäten und der Rest.                                                                        | —      | 0020 |
| ER-14 | Ein leeres Tagesfeld hat ein „+“. Es öffnet das Hinzufügen-Fenster des Kalenders (Vorauswahl „Abend“); danach bleibt man auf der Übersicht.                                                                                                                                | —      | 0020 |

### Essen

| ID    | Wunsch                                                                                                                                                                                                    | Befund | Spec |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- |
| ER-15 | Die Starter-Rezepte entfallen samt allen Verweisen.                                                                                                                                                       | —      | 0023 |
| ER-16 | Kochmodus: Der Text eines kurzen Schritts sieht aus wie eine Überschrift, darunter ist nichts. Besseres Konzept; Zutaten eher eingeblendet als ausgeblendet. „Weiter“ und „Zurück“ bleiben, die sind gut. | —      | 0023 |
| ER-17 | Beim Anlegen eines Rezepts werden die Zutaten nicht gespeichert.                                                                                                                                          | E-01   | 0018 |
| ER-18 | Zutat anlegen: erst der Artikel, dann die Menge – die Menge ist freiwillig, der Artikel nicht.                                                                                                            | —      | 0023 |
| ER-19 | Zutat ⋯: Als Erstes „Zutat bearbeiten“ (z. B. Menge erhöhen), nicht nur „Artikel bearbeiten“.                                                                                                             | —      | 0023 |
| ER-20 | Am Rezept lassen sich Links zu Rezepten im Netz hinterlegen, auch mehrere.                                                                                                                                | —      | 0023 |
| ER-21 | „Einplanen“ an einem Restaurant öffnet ein Fenster und springt nicht in den Kalender.                                                                                                                     | R-02   | 0024 |
| ER-22 | Am Restaurant lässt sich ein Link zur Webseite hinterlegen.                                                                                                                                               | R-01   | 0024 |
| ER-23 | Am Restaurant lässt sich in der Oberfläche ein Bild hinzufügen. Denkbar als Ersatz: das Symbol der Webseite, wenn ein Link hinterlegt ist.                                                                | —      | 0024 |

### Kalender (Desktop; die Handy-Ansicht gefällt)

Der Kalender ist die wichtigste Ansicht. Er bleibt bei Kalenderwochen, anders als die Übersicht.

| ID    | Wunsch                                                                                                                                                                                                                                                 | Befund | Spec |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---- |
| ER-24 | Der Kalender füllt die ganze Höhe der Seite, abzüglich „Vorgemerkt“ unten (als Raster). Es gibt eine Mindesthöhe; erst wenn sie unterschritten wird, scrollt die Seite.                                                                                | —      | 0021 |
| ER-25 | Reisen wie in Outlook: über die Tage ziehen (Woche, Monat, Jahr) und direkt im Kalender in einem Fenster anlegen und verwalten – von wann bis wann, wer, Reisetaschen, alles. Ein Klick auf eine Reise öffnet dieses Fenster, nicht eine andere Seite. | —      | 0022 |
| ER-26 | Monat: In einer Zeile mit Reise ist die senkrechte Linie in der ganzen Zeile unterbrochen. Die feste Kasten-Form ist nicht schick; die Woche ist das Vorbild. Die Einträge selbst gefallen.                                                            | K-11   | 0021 |
| ER-27 | Jahr: Ein Tag ist nur ein Link in den Monat. Auch hier alles direkt im Kalender.                                                                                                                                                                       | —      | 0016 |
| ER-28 | Monat und Jahr: Aktivitäten, Restaurants usw. hinzufügen wie in der Woche.                                                                                                                                                                             | —      | 0021 |
| ER-29 | Aktivitäten werden unter `/kalender/aktivitaeten` verwaltet. Das wird entkoppelt; der Link im Kopf des Kalenders entfällt.                                                                                                                             | A-02   | 0024 |

### Liste

| ID    | Wunsch                                                                                                                                                   | Befund | Spec |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- |
| ER-30 | „+ Aus Kalender“ zeigt auch „Vorbei“. Stattdessen: ab heute 7 Tage, weiterblättern in 7-Tage-Schritten nach vorn, nichts Vergangenes; nach KW gruppiert. | L-05   | 0025 |
| ER-31 | Der Bereich unten: „Vorschläge“ entfallen; statt des Symbols „Senden“ ein Plus.                                                                          | —      | 0025 |

### Haushalt

| ID    | Wunsch                                                                                                   | Befund | Spec |
| ----- | -------------------------------------------------------------------------------------------------------- | ------ | ---- |
| ER-32 | „6 weitere Aufgaben später – alle ansehen“ entfällt überall.                                             | —      | 0026 |
| ER-33 | „Neue Aufgabe“: Nach „Ohne Datum“ kommt als Zweites „Datum“, damit sich ein beliebiger Tag wählen lässt. | H-02   | 0026 |

### Aktivitäten

| ID    | Wunsch                                                                                  | Befund | Spec |
| ----- | --------------------------------------------------------------------------------------- | ------ | ---- |
| ER-34 | Aufbau wie bei Restaurants: die Aktivität rechts neben der Liste, zum schnellen Ändern. | R-04   | 0024 |

### iPhone (installierte Web-App)

Enrico reicht die Punkte fürs iPhone nach; diese zwei stehen schon fest.

| ID    | Wunsch                                                                                                  | Befund | Spec |
| ----- | ------------------------------------------------------------------------------------------------------- | ------ | ---- |
| ER-35 | Oben stimmt die Fläche unter der Statusleiste nicht (Enrico: „oben ist etwas gebleut“); Details folgen. | —      | 0019 |
| ER-36 | Die Tab-Leiste sitzt ganz unten und wird von den runden Ecken des iPhones abgeschnitten.                | —      | 0019 |

## Was Enrico ausdrücklich gefällt

- Die Handy-Ansicht des Kalenders und die Wochenansicht am Desktop.
- Die Einträge in der Monatsansicht.
- „Weiter“ und „Zurück“ im Kochmodus.
- Die Liste insgesamt.
