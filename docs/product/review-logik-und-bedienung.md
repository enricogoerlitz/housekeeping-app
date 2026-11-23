# Review: Logik und Bedienung

Stand: 22.11.2026, Branch `feat/0014-betrieb-ci-cd-release` (Commit `bd23fe5`), nach Abschluss
der Specs 0001–0014.

**Abgleich mit v2026.11.1 (erste Veröffentlichung, 22.11.2026):** Seit dem Rundgang hat sich am
App-Code nichts geändert (Oberfläche, Logik, Daten, Migrationen); alle Befunde gelten unverändert.
Neu sind X-08 und X-09 aus der Einrichtung von Produktion und Vorschau.

## Worum es geht

Die ganze App wurde einmal so durchgeklickt, wie ein Mensch sie benutzt. Dazu lief der echte
Web-Export gegen das lokale Backend: frische Beispieldaten vom 22.11., Test-Konten Enrico und
Nadja. Jeder Bereich wurde auf Handybreite (390 px) und Desktopbreite (1440 px) geprüft.

Die Leitfragen je Objekt:

- Kann ich es anlegen?
- Kann ich jedes Feld ändern, das ein Mensch ändern will?
- Kann ich es löschen oder einen Fehltipp rückgängig machen?
- Finde ich es wieder?

Gesucht wurde außerdem nach:

- Sackgassen und fehlenden Rückwegen,
- Zeitgrenzen (nur diese Woche, nur 14 Tage),
- Unterschieden zwischen ähnlichen Bildschirmen,
- Dingen, die nur auf dem Handy oder nur auf dem Desktop gehen.

Dazu kamen die offenen Notizen aus dem Bau: `tmp/brief/followups.md`, die `OFFEN`-Annahmen der
Specs 0005–0013 und die bekannten Punkte aus der letzten Welle.

Am App-Code wurde nichts geändert. Alles hier ist eine **Empfehlung**; du entscheidest, was
umgesetzt wird.

- **Screenshots:** liegen unter `tmp/review/shots/`. Das Verzeichnis ist git-ignoriert und nur
  lokal vorhanden.
- **Testdaten:** Was beim Testen angelegt wurde (Präfix „Rev-…“), ist wieder gelöscht.
  - Zwei Reste gingen nur per SQL weg, weil die App kein Löschen dafür hat: ein Test-Restaurant
    und zwei Verlaufseinträge einer gelöschten Aufgabe.
  - Bei „Bad putzen“ wurde ein versehentliches „Später“ per SQL zurückgesetzt, weil es dafür
    kein Feld gibt (siehe H-01).

**Schwere:**

- **hoch:** Eine häufige Aufgabe ist unmöglich, man landet in einer Sackgasse, oder Daten werden
  falsch.
- **mittel:** Es geht nur über einen Umweg, oder ähnliche Bildschirme verhalten sich
  verschieden.
- **niedrig:** Politur oder Text.

**Aufwand:** S = Stunden, M = ein bis zwei Tage, L = eigene Spec.

### Deine drei Beispiele

| Beispiel                                  | Stand heute                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reste nur in der aktuellen Woche wählbar  | **Behoben.** Angeboten werden die 7 Tage vor dem Zieltag, über Wochengrenzen hinweg. Sie stehen aber weit unten (K-06).                                                                                                                                                                       |
| Abwesenheiten nur innerhalb einer Woche   | **Behoben.** Freier Zeitraum mit Monatskalender, geprüft über den Jahreswechsel 28.12.–4.1.                                                                                                                                                                                                   |
| Aktivitäten nur über eine komische URL    | **Behoben.** Erreichbar über Kalender-Kopf, Verwalten, Desktop-Seitenleiste, Hinzufügen-Fenster und Eintrag. Auf dem Handy ist der Weg ein unbeschriftetes Berg-Symbol (A-02).                                                                                                                |
| **Neu gefunden, gleiche Art von Grenzen** | Verschieben eines Eintrags nur innerhalb der angezeigten Woche (K-04). Aktivität einplanen nur 14 Tage voraus (A-01). Einmalige Aufgabe nur 14 Tage voraus (H-02). Erledigung nachtragen nur bis vorgestern (H-06). „Aus Kalender“ auf der Liste startet immer in der laufenden Woche (L-05). |

Eine gemeinsame Lösung für die neuen Grenzen wäre **ein Baustein „Anderes Datum …“**. Er hängt am
Ende jeder Datums-Chip-Reihe und öffnet den Monatskalender, den das Abwesenheitsfenster schon hat.

## Entscheidungen von Enrico (22.11.2026)

Enrico übernimmt **alle Empfehlungen** dieses Dokuments. Die harten Änderungen hat er einzeln
entschieden:

| Befund | Entscheidung                                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H-03   | **Ja:** Die Rotation überspringt Reisende, feste Termine während einer Reise des ganzen Haushalts rücken auf den ersten Tag danach, „Zu tun“ bleibt in der Zeit leer    |
| V-04   | **Ja:** Haushalt umbenennen; „Haushalt löschen“ nur für das letzte Mitglied, mit Bestätigung, endgültig mit allen Daten und Fotos                                       |
| X-02   | **Ja:** Aktivitäten und Restaurants löschen mit Rückgängig; vergangene Einträge bleiben als Verlauf, künftige entfallen mit Hinweis                                     |
| X-08   | **Nein:** Die Google-Anmeldung bleibt auf „Testing“. Umgesetzt wird die Alternative: Hinweis im Fenster „Einladen“, neue Adressen bei Google als Testnutzer einzutragen |

Umsetzung nach den Kalender-Specs 0016 und 0017, in eigenen Specs je Bereich.

## Von Claude freigegeben (22.11.2026)

Auf Enricos Auftrag hat Claude die eindeutigsten Logikfehler ausgewählt und freigegeben: Fälle, in
denen das richtige Verhalten feststeht und keine Gestaltungsentscheidung nötig ist. Sie werden in
**Spec 0018** („Fehler aus dem Logik-Review, Welle 1“) umgesetzt:

E-01, E-02, K-03, V-01, V-06, H-07, K-13, U-05, K-12 (nur der Hinweistext), V-07, X-06, X-07, E-10.

Alle übrigen Befunde warten auf Enricos Entscheidung.

## Zusammenfassung

96 Befunde: **13 hoch, 32 mittel, 51 niedrig**.

### Die zehn wichtigsten

1. **E-01:** Beim Anlegen eines Rezepts gehen eingefügte Zutaten verloren.
2. **E-02:** Der Kochmodus ignoriert die gewählten Portionen; man kocht mit falschen Mengen.
3. **K-01:** Bei einem geplanten Gericht lassen sich „Wer isst mit?“, Gäste, Portionen und
   Varianten nachträglich nicht ändern.
4. **L-01:** Mengen mit Einheit („500 g“, „2 Kasten“) lassen sich auf der Liste nicht ändern.
5. **K-03:** „Fertig“ im Eintragsfenster verwirft einen getippten Zusatz still.
6. **X-01:** „Zurück“ von Rezept, Restaurant oder Aktivität führt nicht dorthin, wo man herkam.
7. **K-02:** Eine Abwesenheit passt geplante Mahlzeiten nicht an. Plan und Liste rechnen weiter
   für abwesende Personen.
8. **H-01:** Den nächsten Termin einer Aufgabe kann man nicht einstellen; neue Aufgaben sind
   sofort „heute“ fällig.
9. **R-01 und X-02:** Restaurants lassen sich nicht bearbeiten. Restaurants und Aktivitäten
   lassen sich nicht löschen.
10. **V-01:** „Entfernen“ und „Verlassen“ bei Mitgliedern wirken beim ersten Tipp, ohne Rückfrage.

### Alle Befunde

| ID   | Bereich                 | Befund                                                                                                                                        | Schwere | Empfehlung (kurz)                                                                      | Aufwand |
| ---- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------- | ------- |
| U-01 | Übersicht               | „Nicht gemacht“ ohne Rückgängig und danach nirgends umkehrbar                                                                                 | mittel  | Toast mit Rückgängig; Schalter „Nicht gekocht“ im Eintrag                              | S       |
| U-02 | Übersicht               | „Für morgen“: kein Vorlauf aus Sammlungen, Vorlauf über 24 h kommt zu spät, keine Uhrzeit                                                     | mittel  | Sammlungen auflösen; nach Vorlaufzeit statt „morgen“ auswählen; „heute bis ca. 18 Uhr“ | M       |
| U-03 | Übersicht               | „Wie war's?“: vorausgefüllte Sterne sehen bewertet aus                                                                                        | niedrig | Alte Bewertung blass, Knopf „Passt so“                                                 | S       |
| U-04 | Übersicht               | Punkte „ca. 5“ auf der Übersicht, „ca. 2“ in Haushalt für denselben Tag                                                                       | niedrig | Gleiche Rechnung oder getrennt benennen                                                | S       |
| U-05 | Übersicht               | Packkarte „beginnt in 7 Tagen“ zählt ab dem gewählten Tag, nicht ab heute (freigegeben, Spec 0018)                                            | niedrig | „beginnt am Fr 4.12.“                                                                  | S       |
| K-01 | Kalender                | Wer isst mit, Gäste, Portionen, Varianten im Eintrag nicht änderbar                                                                           | hoch    | Planfelder auch im Eintragsfenster, freier Portions-Stepper                            | S–M     |
| K-02 | Kalender/Abwesenheit    | Neue Abwesenheit lässt Esser in bestehenden Einträgen stehen                                                                                  | hoch    | Beim Speichern anbieten: „3 Gerichte im Zeitraum – Enrico rausnehmen?“                 | M       |
| K-03 | Kalender                | „Fertig“ verwirft getippten Zusatz; drei Speicherlogiken in einem Fenster (freigegeben, Spec 0018)                                            | hoch    | Ein Verhalten: alles sofort speichern, „Fertig“ = schließen und Felder sichern         | S       |
| K-04 | Kalender                | „Verschieben“ nur in die angezeigte Woche                                                                                                     | mittel  | „Anderes Datum …“ mit Monatskalender                                                   | S–M     |
| K-05 | Kalender                | Freitext-Eintrag nicht änderbar; Zusatz nur bei Aktivitäten                                                                                   | mittel  | Text editierbar; Zusatz für alle Arten                                                 | S       |
| K-06 | Kalender                | Reste stehen nach ~3 Bildschirmlängen ganz unten in „Alle“                                                                                    | mittel  | Tab „Reste“ oder Reste-Chips oben                                                      | S       |
| K-07 | Kalender                | Reste: mittags gekocht → abends Reste geht nicht; harte 7-Tage-Grenze                                                                         | niedrig | Frühere Tageszeit desselben Tags zulassen; „Ältere Reste …“                            | S       |
| K-08 | Kalender                | Tag- oder Tageszeit-Chip schließt das Fenster sofort                                                                                          | niedrig | Offen lassen, Bestätigung als Toast                                                    | S       |
| K-09 | Kalender                | Uhrzeit und Erinnerung nur bei Restaurants, nicht bei Aktivitäten                                                                             | niedrig | „Uhrzeit (optional)“ auch für Aktivitäten                                              | M       |
| K-10 | Kalender                | Handy-Woche öffnet bei Montag, heute liegt unten außer Sicht                                                                                  | niedrig | Zu heute scrollen                                                                      | S       |
| K-11 | Kalender                | Monat/Jahr: keine Aufgaben in der Monats-Tagesliste, Freitext zählt als „Rezept“, Jahr beginnt im Januar, Namen auf dem Desktop gekürzt       | niedrig | Einzeln glätten                                                                        | S       |
| K-12 | Abwesenheit             | Hinweis „Alle gewählt = ganzer Haushalt“ steht auch, wenn nur eine Person gewählt ist; Toast ohne „Anzeigen“ (freigegeben, Spec 0018)         | niedrig | Zustand beschreiben; Toast mit Sprung                                                  | S       |
| K-13 | Kalender                | Hinzufügen bietet „‚Lasagne‘ als Rezept anlegen“ trotz exaktem Treffer (freigegeben, Spec 0018)                                               | niedrig | Bei exaktem Treffer ausblenden                                                         | S       |
| A-01 | Aktivitäten             | „Einplanen“ aus der Aktivität nur 14 Tage voraus                                                                                              | mittel  | „Anderes Datum …“                                                                      | S       |
| A-02 | Aktivitäten             | Auf dem Handy nur über ein unbeschriftetes Berg-Symbol erreichbar                                                                             | niedrig | Zusätzlich ins ⋯-Menü des Kalenders                                                    | S       |
| E-01 | Rezepte                 | Beim Anlegen eingefügte Zutaten gehen verloren (freigegeben, Spec 0018)                                                                       | hoch    | Fehler beheben, E2E-Test ergänzen                                                      | S–M     |
| E-02 | Kochmodus               | Kochmodus zeigt Grundmengen statt der gewählten Portionen (freigegeben, Spec 0018)                                                            | hoch    | Portionen übergeben; Regler im Kochmodus                                               | S       |
| E-03 | Rezepte/Sammlungen      | Löschen entfernt künftige Planeinträge ohne Hinweis                                                                                           | mittel  | Toast nennt entfallende Termine                                                        | S       |
| E-04 | Rezepte                 | Abschnitts-Editoren ohne „Abbrechen“ und ohne Rückgängig                                                                                      | mittel  | „Verwerfen“ oder Toast „Gespeichert · Rückgängig“                                      | M       |
| E-05 | Rezepte                 | Zutaten-„Gruppe“ pflegbar, aber nie angezeigt                                                                                                 | mittel  | Gruppen in Lese- und Kochansicht                                                       | S       |
| E-06 | Rezepte                 | Schritt-Timer nicht bearbeitbar                                                                                                               | mittel  | Feld „Timer (Min)“ im Schritt                                                          | S–M     |
| E-07 | Rezepte/Artikel         | „unbekannt“ durch Non-Food (Grillkohle, Backpapier) macht nichts mehr vegetarisch                                                             | mittel  | Ernährung „kein Lebensmittel“; Grund am Chip zeigen                                    | S–M     |
| E-08 | Rezepte                 | Einfügen: „Fertig“ mit orangen Zeilen speichert still einen Teil; Dubletten unerkannt                                                         | mittel  | Hinweis „5 gespeichert, 2 offen“; Dubletten markieren                                  | S       |
| E-09 | Rezepte/Liste           | Einheiten fehlen (Flasche, Tüte, Liter, Pck. …); „1 kleine Dose“ nicht erkannt                                                                | niedrig | Einheiten und Adjektive ergänzen                                                       | S       |
| E-10 | Rezepte                 | Toast „Eingeplant: Mi Abend“ ohne Datum (freigegeben, Spec 0018)                                                                              | niedrig | Datum ergänzen                                                                         | S       |
| E-11 | Rezepte                 | Einplanen-Fenster: nur wochenweise blättern, Tage ohne Datum                                                                                  | niedrig | Datum unter den Chips, Monatssprung                                                    | S       |
| E-12 | Rezepte                 | Einplanen-Fenster einmal mit „0 Portionen“ und gesperrtem Knopf (sporadisch)                                                                  | niedrig | Vorauswahl neu rechnen, wenn Mitglieder geladen sind                                   | S       |
| E-13 | Essen                   | Liste „26 Rezepte · 2 Sammlungen“, Filterknopf „28 Rezepte zeigen“                                                                            | niedrig | Einheitlich zählen                                                                     | S       |
| E-14 | Sammlungen              | Zeile „übernimmt · 2 Port.“ unverständlich                                                                                                    | niedrig | „2 Port. (wie Sammlung)“                                                               | S       |
| E-15 | Rezepte                 | Geöffneter Abschnitt wird auf dem Handy nicht ins Bild gescrollt                                                                              | niedrig | Hineinscrollen                                                                         | S       |
| R-01 | Restaurants             | Name, Küche, Adresse, Preis, Schlagworte nicht bearbeitbar                                                                                    | hoch    | „Bearbeiten“-Fenster mit dem vorhandenen Formular                                      | M       |
| R-02 | Restaurants             | „Einplanen“ springt nur in den Kalender, nichts vorausgewählt                                                                                 | mittel  | Einplanen-Fenster wie beim Rezept, plus Uhrzeit                                        | S–M     |
| R-03 | Restaurants             | Besuche nur als Zahl, nicht ansehbar                                                                                                          | niedrig | „1 Besuch“ antippbar                                                                   | S–M     |
| R-04 | Restaurants             | Andere Muster als Rezept (Split-Ansicht, Notiz inline, Zurück ohne Ziel)                                                                      | niedrig | Ein Muster für Detailseiten                                                            | M       |
| L-01 | Liste                   | Mengen mit Einheit oder gemischte Mengen nicht änderbar                                                                                       | hoch    | Menge editierbar; Herkunftszeilen einzeln entfernbar                                   | M       |
| L-02 | Liste                   | Artikel eines Postens nicht aus der Liste änderbar                                                                                            | mittel  | Link „Artikel bearbeiten ›“ im Posten                                                  | S–M     |
| L-03 | Liste/Kalender          | Eintrag gelöscht oder verschoben → Zutaten bleiben auf der Liste                                                                              | mittel  | Toast „Zutaten auch von der Liste nehmen?“                                             | M       |
| L-04 | Vorratscheck            | Mengen nicht anpassbar, krumme Werte (57 g, 438 g), „schon auf der Liste“ nicht sichtbar                                                      | mittel  | Menge antippbar, sinnvoll runden, Bestand zeigen                                       | M       |
| L-05 | Liste                   | „Aus Kalender“ öffnet immer die laufende Woche                                                                                                | niedrig | Ab heute 7 Tage oder am Wochenende die Folgewoche                                      | S       |
| L-06 | Liste                   | „Liste leeren“ nennt 17, Kopfzeile 14                                                                                                         | niedrig | „14 offene und 3 erledigte“                                                            | S       |
| L-07 | Liste                   | Kopfzeile „14 offen · für Lasagne“ missverständlich                                                                                           | niedrig | „aus 4 Rezepten“, antippbar                                                            | S       |
| L-08 | Liste                   | Rückgängig stellt einen Posten an anderer Stelle wieder her                                                                                   | niedrig | Position erhalten                                                                      | S       |
| L-09 | Liste/Artikel           | Zwei verschiedene Bereichswähler (einer ohne „Ohne Bereich“)                                                                                  | niedrig | Eine Komponente                                                                        | S       |
| L-10 | Liste                   | „Mozzarella (Fior di Latte)“ eingetippt wird Artikel + Zusatz                                                                                 | niedrig | Exakte Namen vor der Klammer-Regel prüfen                                              | S       |
| L-11 | Liste                   | Zusatz ändern überschreibt Rezept-Zusätze still                                                                                               | niedrig | Annahme bestätigen oder Rezept-Zusatz weiter zeigen                                    | S       |
| L-12 | Liste                   | Kein Abhaken auf der Liste („hab ich doch noch“)                                                                                              | niedrig | Wischen = erledigt, oder Text anpassen                                                 | S       |
| L-13 | Liste/Artikel           | „Milchko“ findet „Kokosmilch“ nicht                                                                                                           | niedrig | Wortteile in beliebiger Reihenfolge                                                    | S–M     |
| S-01 | Einkaufen               | „Posten hinzufügen“ im Laden ohne Vorschläge und ohne Tippfehler-Bremse                                                                       | mittel  | Dasselbe Eingabefeld wie auf der Liste                                                 | S       |
| S-02 | Einkaufen               | Bereich im Laden nur für Posten ohne Bereich zuordenbar                                                                                       | mittel  | „Liegt woanders …“ an jedem Posten                                                     | S–M     |
| S-03 | Einkaufen               | Fortschritt zählt alte Erledigte mit; derselbe Artikel offen und erledigt                                                                     | niedrig | Nur beim Start offene zählen; Erledigtes wieder öffnen                                 | S       |
| M-01 | Artikel/Bereiche        | Artikel nicht nach Bereich filterbar; Bereichszeile nicht antippbar                                                                           | niedrig | Bereich antippen → gefilterte Artikel                                                  | S       |
| M-02 | Artikel                 | Löschen gesperrt, wenn der Artikel nur unter „Erledigt“ steht                                                                                 | niedrig | Erledigtes ignorieren                                                                  | S       |
| M-03 | Artikel                 | Tippfehler-Artikel bleiben, kein Filter „Unbenutzt“                                                                                           | niedrig | Filter „Unbenutzt“                                                                     | S       |
| M-04 | Märkte                  | Neuer Bereich in jedem Markt sichtbar am Ende, auch bei dm                                                                                    | niedrig | Hinweis-Toast oder ausgeblendet anlegen                                                | S       |
| M-05 | Märkte                  | Neuer Markt kann keine Reihenfolge übernehmen                                                                                                 | niedrig | „Reihenfolge übernehmen von …“                                                         | S       |
| H-01 | Haushalt                | Nächster Termin nicht einstellbar; neue Aufgaben sofort fällig                                                                                | hoch    | Datumsfeld „Nächstes Mal“, optional „Zuletzt erledigt“                                 | M       |
| H-02 | Haushalt                | „Einmalig“ nur in den nächsten 14 Tagen datierbar                                                                                             | hoch    | Monatskalender                                                                         | S       |
| H-03 | Haushalt/Abwesenheit    | Abwesenheiten wirken nicht auf Aufgaben (Rotation, Fälligkeit)                                                                                | hoch    | Eigene kleine Spec                                                                     | L       |
| H-04 | Haushalt                | Einmalige Aufgabe ohne Datum taucht nirgends auf                                                                                              | mittel  | Abschnitt „Ohne Termin“ unter „Anstehend“                                              | S       |
| H-05 | Haushalt                | „Später“ ist immer „morgen“ und wirkt sofort                                                                                                  | mittel  | Kleines Menü: morgen, übermorgen, Wochenende, Datum                                    | S       |
| H-06 | Haushalt                | Nachtragen nur bis vorgestern; Datum im Verlauf nicht änderbar                                                                                | mittel  | Bis ~30 Tage zurück; Datum im Verlauf editierbar                                       | S–M     |
| H-07 | Haushalt                | Bei „Abwechselnd“ zeigt die Zeile alle Avatare statt der Person, die dran ist (freigegeben, Spec 0018)                                        | mittel  | Nur den Avatar der Person, die dran ist                                                | S       |
| H-08 | Haushalt                | Wer als Nächstes dran ist, lässt sich nicht festlegen                                                                                         | niedrig | Auswahl „Als Nächstes dran“                                                            | S       |
| H-09 | Haushalt                | „Bei Bedarf“ startet mit „Abwechselnd“; ausgegraute Knöpfe ohne Grund                                                                         | niedrig | Standard „Egal“; ausblenden statt ausgrauen                                            | S       |
| H-10 | Haushalt                | Verlauf ohne Filter                                                                                                                           | niedrig | Chips Person/Aufgabe; Link aus der Aufgabe                                             | M       |
| T-01 | Reisetaschen            | Packstück in der Packliste nicht bearbeitbar (Anzahl, Name, je Tag)                                                                           | mittel  | Bearbeiten-Fenster wie in der Tasche                                                   | S–M     |
| T-02 | Reisetaschen            | Änderung an einer Tasche erreicht bestehende Packlisten nicht, ohne Hinweis                                                                   | mittel  | Hinweis plus „In kommende Packliste übernehmen“                                        | S/M     |
| T-03 | Reisetaschen            | Von „Reisetaschen“ kein Weg zu kommenden Packlisten                                                                                           | mittel  | Abschnitt „Kommende Packlisten“                                                        | S       |
| T-04 | Reisetaschen            | „Unterhose 1 je Tag“ wird zum Namen                                                                                                           | niedrig | „n je Tag“ erkennen                                                                    | S       |
| T-05 | Reisetaschen            | Urlaubsseite bietet keine „Neue Reisetasche“                                                                                                  | niedrig | Wie im Abwesenheitsfenster                                                             | S       |
| V-01 | Mitglieder              | „Entfernen“ und „Verlassen“ ohne Rückfrage, ohne Rückgängig (freigegeben, Spec 0018)                                                          | hoch    | Bestätigungsdialog mit Namen                                                           | S       |
| V-02 | Mitglieder              | Einladungen lassen sich nicht zurückziehen                                                                                                    | mittel  | „Zurückziehen“ je Einladung                                                            | M       |
| V-03 | Einstellungen           | Eigenes Profil (Name, Farbe, Ernährung, Abneigungen) nicht bearbeitbar                                                                        | mittel  | Kleine Spec „Profil bearbeiten“                                                        | M       |
| V-04 | Mitglieder              | Haushalt weder umbenennbar noch löschbar                                                                                                      | mittel  | ✎ am Namen; Löschen für das letzte Mitglied                                            | M       |
| V-05 | Feedback                | Eigenes Feedback nicht bearbeit- oder löschbar; Status setzt niemand                                                                          | niedrig | ⋯ mit Bearbeiten/Löschen; Satz zum Status                                              | S–M     |
| V-06 | Einstellungen           | Abmelden löscht ungesendete Offline-Haken ohne Warnung (freigegeben, Spec 0018)                                                               | mittel  | Rückfrage nur, wenn etwas ungesendet ist                                               | S       |
| V-07 | Benachrichtigungen      | „2 an“, obwohl kein Gerät angemeldet ist (freigegeben, Spec 0018)                                                                             | niedrig | „2 an · dieses Gerät aus“                                                              | S       |
| V-08 | Benachrichtigungen      | Uhrzeit als Textfeld; 5-Minuten-Regel erst im Fehler                                                                                          | niedrig | Zeitauswahl im 5-Minuten-Raster                                                        | S       |
| V-09 | Benachrichtigungen      | Dass Einstellungen je Haushalt gelten, ist schwer zu erkennen                                                                                 | niedrig | Haushaltsumschalter auf der Seite                                                      | S       |
| V-10 | Benachrichtigungen      | Aufgaben-Erinnerung nur für alle oder keine                                                                                                   | niedrig | Optional Schalter je Aufgabe                                                           | M       |
| V-11 | Einstellungen           | Kein „Jetzt abgleichen“                                                                                                                       | niedrig | Zeile „Zuletzt abgeglichen“ antippbar                                                  | S       |
| V-12 | Navigation              | Mehrdeutige Namen („Haushalt“ zweimal, „Einkaufen“ zweimal)                                                                                   | niedrig | Gruppen umbenennen                                                                     | S       |
| X-01 | Navigation              | „Zurück“ von Rezept, Restaurant oder Aktivität führt in einen anderen Bereich                                                                 | hoch    | Herkunft mitgeben wie bei der Packkarte                                                | M       |
| X-02 | Aktivitäten/Restaurants | Aktivitäten und Restaurants lassen sich nirgends löschen                                                                                      | hoch    | Löschen mit Rückgängig wie bei Rezepten                                                | M       |
| X-03 | Offline                 | Banner „Lesen und Abhaken gehen“ widerspricht gesperrten Aufgaben; Hinweise mehrfach je Seite; Liste: „+“ gesperrt, Eintippen erhöht trotzdem | mittel  | Banner präzisieren, ein Hinweis je Seite, Liste konsistent                             | S       |
| X-04 | Navigation              | Auf dem Handy ist nicht zu sehen, in welchem Haushalt man ist                                                                                 | mittel  | Haushaltsname auf der Übersicht, antippbar (nur bei mehreren)                          | S       |
| X-05 | Navigation              | Zurück-Beschriftungen uneinheitlich, Desktop „Zurück: Kalender“ falsch, falscher Tab hervorgehoben                                            | niedrig | Ziel immer aus der Herkunft ableiten                                                   | S       |
| X-06 | Version                 | Bei veralteter Version steht an Knöpfen der Offline-Text (freigegeben, Spec 0018)                                                             | niedrig | Eigener Hinweis „Bitte neu laden“                                                      | S       |
| X-07 | Offline                 | Toast „Offline – nichts wurde abgehakt“ sagt nicht, was zu tun ist (freigegeben, Spec 0018)                                                   | niedrig | „… Mit Netz noch einmal abhaken.“                                                      | S       |
| X-08 | Einladen                | Eingeladene scheitern an Google, solange die Google-App auf „Testing“ steht                                                                   | mittel  | Google-App auf „In Production“ (nur E-Mail/Profil, keine Prüfung)                      | S       |
| X-09 | Adressen                | Alte `azurestaticapps.net`-Adressen laden die App, Anmelden scheitert dort                                                                    | niedrig | Eigene Domain in Azure als Standard setzen (leitet um)                                 | S       |

## Übersicht

#### U-01 „Nicht gemacht“ ohne Rückgängig · mittel · S · beide

- **Getan:** „Nicht gemacht“ in „Wie war's?“ geprüft, in der Oberfläche und im Code (es gibt
  genau einen Schreibzugriff dafür).
- **Ergebnis:** Der Eintrag verschwindet sofort, ohne Rückfrage und ohne Toast mit „Rückgängig“.
  Danach ist die Markierung nirgends sichtbar und nirgends umkehrbar.
- **Problem:** Ein Fehltipp verfälscht still „Zuletzt gekocht“, „Lange nicht gekocht“ und die
  Reste-Auswahl. Sonst bietet die App fast überall „Rückgängig“.
- **Empfehlung:** Toast „Als nicht gekocht markiert · Rückgängig“. Im Eintragsfenster eines
  vergangenen Tags zusätzlich der Schalter „Nicht gekocht“.
- **Screenshot:** `tmp/review/shots/phone-01-uebersicht.png`

#### U-02 „Für morgen“ ist unvollständig · mittel · M · beide

Das ist der bekannte Punkt „Sammlungen zeigen den Vorlauf der enthaltenen Rezepte nicht“; er ist
bestätigt.

- **Getan:** Code und Anzeige von „Für morgen“ geprüft (`today-meals.tsx` und das SQL des
  Tagesüberblicks).
- **Ergebnis:**
  1. Bei einer Sammlung zählt nur ihr eigener Vorlauf, nicht der ihrer Rezepte. Das gilt für die
     Übersicht und genauso für die Push-Nachricht.
  2. Geprüft wird nur der nächste Tag. Ein Vorlauf von „48 h marinieren“ (erlaubt sind bis 168 h)
     erscheint erst am Vortag, also zu spät.
  3. Statt einer Uhrzeit steht nur „(12 h)“.
- **Problem:** Genau die Erinnerung, für die es die Zeile gibt, kommt bei Sammlungen gar nicht und
  bei langem Vorlauf zu spät.
- **Empfehlung:**
  - Sammlungen in ihre Rezepte auflösen.
  - Auswählen nach „Start der Vorbereitung liegt heute“: Tag + Tageszeit − Vorlauf.
  - Text: „Heute bis ca. 18 Uhr: Kichererbsen einweichen · Eintopf (morgen Mittag)“.
- **Screenshot:** `tmp/review/shots/phone-01-uebersicht.png`

#### U-03 Vorausgefüllte Sterne bei „Wie war's?“ · niedrig · S

- **Ergebnis:** Mango-Curry zeigt fünf volle Sterne, Shakshuka vier. Die Zeile bleibt trotzdem
  offen, bis man denselben Wert noch einmal antippt (0011 OFFEN 1 und 7).
- **Problem:** Es sieht bewertet aus und ist es nicht.
- **Empfehlung:** Alte Bewertung blass zeigen („letztes Mal ★ 4“) plus einen Knopf „Passt so“.
- **Screenshot:** `tmp/review/shots/A-desktop-d01-uebersicht.png`

#### U-04 Punkte widersprechen sich · niedrig · S

- **Ergebnis:** Für denselben Tag zeigt die Übersicht unter „Zu tun“ „ca. 5 Punkte“ (mit
  Überfälligem), Haushalt → Heute „ca. 2 Punkte“ (nur heute fällig).
- **Empfehlung:** An beiden Stellen dieselbe Rechnung, oder „heute 2 · überfällig 3“.
- **Screenshot:** `tmp/review/shots/D-phone-01-haushalt.png`

#### U-05 Packkarte zählt ab dem gewählten Tag · niedrig · S

- **Ergebnis:** In der Wochenleiste Fr 27. gewählt. Mallorca beginnt am 4.12., die Karte sagt
  „beginnt in 7 Tagen“, von heute aus sind es aber 12.
- **Empfehlung:** „beginnt am Fr 4.12.“
- **Screenshot:** `tmp/review/shots/A-phone-u02-naechste-woche.png`

## Kalender, Einträge und Abwesenheiten

#### K-01 Eingeplantes Gericht: Esser, Gäste, Portionen und Varianten nicht änderbar · hoch · S–M · beide

- **Getan:** Butter Chicken für zwei eingeplant („mit Hähnchen 1 · mit Paneer 1“), dann den
  Eintrag geöffnet.
- **Ergebnis:**
  - Das Fenster bietet nur: Verschieben, Tageszeit, Wer kocht, Entfernen.
  - Nicht änderbar sind „Wer isst mit?“, Gäste, Portionen und die Aufteilung auf Varianten.
  - Schon beim Einplanen gibt es keine freie Portionszahl („doppelt, für Reste“). Die Aufteilung
    auf Varianten rechnet die App selbst.
  - Die Schnittstelle (`updatePlanEntry`) kann all das schon; nur die Oberfläche fehlt.
- **Problem:** Ein spontaner Gast, „Nadja isst doch mit“, „beide wollen Paneer“: Das geht nur über
  Löschen und neu Einplanen. Bis dahin rechnet die Einkaufsliste falsch.
- **Empfehlung:** Die Planfelder aus dem Hinzufügen-Fenster (Wer isst mit, Gäste, Aufteilung) auch
  im Eintragsfenster zeigen, dazu einen freien Portions-Stepper.
- **Screenshots:** `tmp/review/shots/A-phone-k05-add-step2.png`,
  `tmp/review/shots/A-phone-k10-entry-collection.png`

#### K-02 Abwesenheit passt geplante Mahlzeiten nicht an · hoch · M · beide

- **Getan:** Eine Abwesenheit über heute eingetragen, dann Übersicht und Kalender angesehen.
  Außerdem während „Urlaub Mallorca“ ein Gericht eingeplant.
- **Ergebnis:**
  - Die Lasagne von heute bleibt mit zwei Essern und „Enrico kocht“ stehen.
  - Abwesenheit wirkt nur als Vorbelegung beim **neuen** Einplanen. Während des Urlaubs des
    ganzen Haushalts steht dort „0 Portionen“, ohne Erklärung.
  - Der Text im Abwesenheitsfenster, „Wer weg ist, fehlt bei ‚Wer isst mit?‘“, klingt, als würde
    der Plan angepasst.
- **Problem:** Man fährt weg, und Plan und Einkaufsliste rechnen weiter für Abwesende. Zusammen mit
  K-01 lässt sich das nur durch Löschen und neu Einplanen korrigieren.
- **Empfehlung:** Beim Speichern einer Abwesenheit die betroffenen Einträge nennen: „3 Gerichte in
  dem Zeitraum – Enrico rausnehmen?“
- **Alternative:** Nur ein Warnhinweis an den betroffenen Einträgen („Enrico ist abwesend“).
- **Screenshots:** `tmp/review/shots/A-desktop-d01-uebersicht.png`,
  `tmp/review/shots/A-phone-k22-add-waehrend-urlaub.png`

#### K-03 „Fertig“ verwirft einen getippten Zusatz · hoch · S · beide

Bekannter Punkt aus 0013 („Fertig“ in jedem Eintragsfenster). Er ist bestätigt, und es ist
schlimmer als gedacht.

- **Getan:** Bei der Aktivität „Bouldern“ als Zusatz „Halle Nord“ getippt, dann „Fertig“.
- **Ergebnis:** Es kommt kein Toast, der Zusatz ist weg. Beim erneuten Öffnen ist das Feld leer.
  Grund: Drei Speicherlogiken stecken in einem Fenster.
  - Chips (Tag, Tageszeit, Wer kocht) speichern sofort.
  - Der Zusatz hat einen eigenen Knopf „Zusatz speichern“.
  - „Fertig“ speichert nur die Restaurant-Uhrzeit „Reserviert um“ und schließt sonst nur.
- **Problem:** Der auffälligste Knopf heißt „Fertig“ und verliert Eingaben.
- **Empfehlung:** „Fertig“ speichert alle offenen Felder (Zusatz und Uhrzeit), die Felder
  speichern zusätzlich beim Verlassen. „Zusatz speichern“ entfällt.
- **Alternative:** „Fertig“ streichen, nur ✕ lassen und alle Felder beim Verlassen speichern.
- **Screenshot:** `tmp/review/shots/A-phone-k24-zusatz-getippt.png`

#### K-04 „Verschieben“ nur in die angezeigte Woche · mittel · S–M · beide

- **Getan:** Einen Eintrag auf einen Tag der nächsten Woche verlegen wollen.
- **Ergebnis:** Zur Wahl stehen nur die sieben Tage der gerade angezeigten Woche plus
  „Vormerken“. Der Umweg funktioniert, ist aber versteckt: vormerken, zur Zielwoche blättern,
  unter „Vorgemerkt“ öffnen, Tag wählen.
- **Problem:** „Lasagne auf nächsten Dienstag“ ist Alltag. Das ist dieselbe Art Grenze wie deine
  Beispiele.
- **Empfehlung:** „Anderes Datum …“ mit Monatskalender, mindestens Pfeile für Vor- und Folgewoche.
- **Screenshot:** `tmp/review/shots/A-phone-k23-vorgemerkt-sheet.png`

#### K-05 Freitext nicht änderbar, Zusatz nur bei Aktivitäten · mittel · S · beide

- **Getan:** Einen Freitext-Eintrag („Essen bei Oma“) geöffnet.
- **Ergebnis:** Der Text selbst ist nicht editierbar; ein Tippfehler bleibt. Einen Zusatz oder eine
  Notiz haben nur Aktivitäten, nicht Rezepte, Sammlungen, Freitext oder Restaurants.
- **Problem:** „Doppelte Menge“, „Tisch für 6“ oder „mit Oma“ lassen sich nirgends notieren.
- **Empfehlung:** Den Freitext im Eintragsfenster editierbar machen und den Zusatz für alle Arten
  freigeben; das Feld gibt es in der Datenbank schon.
- **Screenshot:** `tmp/review/shots/A-phone-k07-entry-freitext.png`

#### K-06 Reste stehen ganz unten · mittel · S · beide (vor allem Handy)

- **Getan:** Für Dienstagmittag Reste gesucht.
- **Ergebnis:** Die Gruppe „Reste“ beginnt im Hinzufügen-Fenster nach rund drei Bildschirmlängen,
  unter allen Rezepten, Restaurants, Aktivitäten und „Neu“. Es gibt keinen Tab „Reste“, und die
  Suche nach „Reste“ filtert nicht.
- **Problem:** Reste sind ein häufiger Mittagsfall, man muss sie aber suchen.
- **Empfehlung:** Tab „Reste“, oder die zwei bis drei jüngsten Reste als Chips direkt unter dem
  Suchfeld.
- **Screenshots:** `tmp/review/shots/A-phone-k04-add-sheet.png`,
  `tmp/review/shots/A-phone-k26-reste-step2.png`

#### K-07 Reste-Regeln · niedrig · S

- **Ergebnis:**
  - Frühere Tageszeiten desselben Tags werden nicht angeboten; „mittags gekocht, abends Reste“
    geht also nicht.
  - Eingefrorenes, das älter als 7 Tage ist, und Take-away-Reste fehlen (0010 OFFEN 3).
- **Empfehlung:** Frühere Tageszeiten desselben Tags zulassen, optional „Ältere Reste …“ mit
  Suche.

#### K-08 Tag- oder Tageszeit-Chip schließt das Fenster · niedrig · S

- **Ergebnis:** Nach jedem Tipp auf Tag oder Tageszeit schließt das Fenster. Wer beides ändern
  will, öffnet zweimal. „Wer kocht“ schließt dagegen nicht.
- **Empfehlung:** Fenster offen lassen und eine kurze Bestätigung zeigen; passt zu K-03.

#### K-09 Uhrzeit nur bei Restaurants · niedrig · M

- **Ergebnis:** Restaurants haben „Reserviert um“ samt Erinnerung, Aktivitäten (Kino 20:15) nur
  die Tageszeit.
- **Empfehlung:** „Uhrzeit (optional)“ samt Erinnerung auch für Aktivitäten.
- **Screenshots:** `tmp/review/shots/A-phone-k08-entry-restaurant.png`,
  `tmp/review/shots/A-phone-k09-entry-activity.png`

#### K-10 Handy-Woche springt nicht zu heute · niedrig · S

- **Ergebnis:** Die Woche öffnet bei Montag; Sonntag (heute) liegt unterhalb des sichtbaren
  Bereichs.
- **Empfehlung:** Beim Öffnen der laufenden Woche zu heute scrollen.
- **Screenshot:** `tmp/review/shots/A-phone-k01-woche.png`

#### K-11 Monat und Jahr: Kleinigkeiten · niedrig · S

- **Ergebnis:**
  - Die Tagesliste der Monatsansicht auf dem Handy zeigt keine Aufgaben; die Woche zeigt sie.
  - Ein Freitext zählt im Tages-Label als „1 Rezept“.
  - Die Jahresansicht beginnt auf dem Handy im Januar, der aktuelle Monat liegt weit unten.
  - In der Desktop-Woche sind Aufgaben- und Abwesenheitsnamen trotz 1440 px stark gekürzt.
- **Empfehlung:** Einzeln glätten.
- **Screenshots:** `tmp/review/shots/A-phone-k11-monat.png`,
  `tmp/review/shots/A-phone-k12-jahr.png`, `tmp/review/shots/A-desktop-d02-kalender-woche.png`

#### K-12 Abwesenheitsfenster: Hinweis und Rückmeldung · niedrig · S

- **Ergebnis:**
  - Vorgewählt ist nur die eigene Person, darunter steht trotzdem „Alle gewählt = ganzer
    Haushalt“. Ein Tipp auf „Nadja“ machte daraus unerwartet „Ganzer Haushalt“.
  - Nach dem Speichern bleibt man in der aktuellen Woche; der Toast „Abwesenheit eingetragen“ hat
    keinen Sprung zum Zeitraum.
- **Empfehlung:** Den Zustand beschreiben („Nur Enrico“ / „Ganzer Haushalt“) und im Toast
  „Anzeigen“ anbieten.
- **Screenshots:** `tmp/review/shots/A-phone-k13-abwesenheit-neu.png`,
  `tmp/review/shots/A-phone-k15-abwesenheit-ausgefuellt.png`

#### K-13 Neuanlage trotz exaktem Treffer · niedrig · S

- **Ergebnis:** Bei der Suche „Lasagne“ steht neben dem Treffer „+ ‚Lasagne‘ als Rezept anlegen“.
  Das lädt zu Dubletten ein.
- **Empfehlung:** Bei exaktem Treffer ausblenden oder „trotzdem neu anlegen“ schreiben.

### Aktivitäten

#### A-01 „Einplanen“ aus der Aktivität nur 14 Tage voraus · mittel · S · beide

- **Getan:** Auf der Aktivitätsseite „Einplanen“ geöffnet.
- **Ergebnis:** „Wann?“ bietet nur Chips von heute bis in 13 Tagen.
- **Problem:** Ein Konzert in sechs Wochen geht nur über den Kalender. Dieselbe Art Grenze wie bei
  deinen Beispielen.
- **Empfehlung:** „Anderes Datum …“ am Ende der Chips.
- **Screenshot:** `tmp/review/shots/A-phone-a01-einplanen.png`

#### A-02 Aktivitäten-Seite auf dem Handy nur hinter einem Berg-Symbol · niedrig · S · Handy

- **Ergebnis:** Im Kalender-Kopf stehen drei Symbole ohne Beschriftung: Berg, Korb, ⋯. Dass der
  Berg „Aktivitäten“ heißt, errät man kaum. Der zweite Weg über ⊞ Verwalten funktioniert.
- **Empfehlung:** „Aktivitäten“ zusätzlich ins ⋯-Menü, wo schon die Abwesenheiten stehen.
- **Screenshots:** `tmp/review/shots/A-phone-k01-woche.png`,
  `tmp/review/shots/A-phone-k03-aktivitaeten.png`

Zum Löschen von Aktivitäten siehe X-02.

## Essen: Rezepte, Kochmodus, Sammlungen

#### E-01 Beim Anlegen eingefügte Zutaten gehen verloren · hoch · S–M · beide

- **Getan:** Essen → Neu → Rezept, Titel eingegeben, im Feld „Zutaten einfügen“ zwei bis sechs
  Zeilen eingefügt, dann „Anlegen“. Dreimal reproduziert: zweimal auf dem Handy, einmal auf dem
  Desktop.
- **Ergebnis:** Die Rezeptseite öffnet mit „Noch keine Zutaten“; auch in der Datenbank ist die
  Zutatenliste leer.
- **Problem:** Das Formular verspricht ausdrücklich, die Zutaten mitzunehmen. Der Text ist ohne
  Hinweis weg, und man tippt alles noch einmal.
- **Vermutete Ursache:** Die Übergabe an die Rezeptseite liegt nur im Speicher
  (`sections/ingredient-handover.ts`). Die Seite holt sie einmal beim ersten Aufbau ab; wenn das
  Rezept dann noch nicht im lokalen Speicher ist, geht sie ins Leere.
- **Empfehlung:** Fehler beheben und einen E2E-Test ergänzen.
- **Alternative:** Nach „Anlegen“ den Abschnitt „Zutaten“ mit vorausgefülltem Einfüge-Fenster
  öffnen.
- **Screenshots:** `tmp/review/shots/B-phone-13-new-recipe.png`,
  `tmp/review/shots/B-phone-14-after-create.png`

#### E-02 Kochmodus ignoriert die gewählten Portionen · hoch · S · beide

- **Getan:** Lasagne von 4 auf 6 Portionen gestellt (die Seite zeigt 225 g Linsen), dann „Kochen“
  → „Zutaten anzeigen“.
- **Ergebnis:** Der Kochmodus zeigt 150 g, also die Grundmenge, und hat keinen Portionen-Regler.
  Die Variante wird übernommen, die Portionen nicht.
- **Problem:** Man kocht mit falschen Mengen, genau in dem Moment, in dem man der App vertraut.
  „Auf die Liste“ rechnet richtig.
- **Empfehlung:** Portionen an den Kochmodus übergeben, auch aus einem Planeintrag heraus, und dort
  einen Regler zeigen.
- **Screenshots:** `tmp/review/shots/B-phone-29-cook.png`,
  `tmp/review/shots/B-phone-30-cook-step2.png`

#### E-03 Löschen entfernt künftige Termine ohne Hinweis · mittel · S · beide

- **Getan:** Eine Sammlung für morgen eingeplant und gelöscht. Ein Rezept mit zwei Terminen im
  Dezember gelöscht.
- **Ergebnis:** Es gibt keine Rückfrage. Der Toast sagt nur „… gelöscht · Rückgängig“, die
  Termine sind aus dem Kalender verschwunden (0008 OFFEN 3 und 5).
- **Problem:** Das Essen für morgen verschwindet unbemerkt. Ist der Toast weg, merkt man es erst am
  Tag selbst.
- **Empfehlung:** „Lasagne gelöscht · 2 geplante Termine entfallen · Rückgängig“.
- **Alternative:** Bei künftigen Terminen kurz nachfragen.

#### E-04 Abschnitts-Editoren ohne „Abbrechen“ · mittel · M · beide

- **Getan:** Den Titel geändert, dann Escape bzw. „Zurück“; außerdem „Fertig“.
- **Ergebnis:** Escape tut nichts, Verlassen speichert still (0008 OFFEN 1). Nach „Fertig“ kommt
  kein Toast mit „Rückgängig“.
- **Problem:** Versehentlich gelöschter Text oder gelöschte Schritte lassen sich weder verwerfen
  noch zurückholen.
- **Empfehlung:** „Verwerfen“ neben „Fertig“, oder ein Toast „Gespeichert · Rückgängig“.
- **Screenshot:** `tmp/review/shots/B-phone-04-head-edit.png`

#### E-05 Zutaten-„Gruppe“ wird nie angezeigt · mittel · S

- **Ergebnis:** Im Editor stehen die Gruppen „Ragù“, „Béchamel“ und „Zum Schichten“. Lese- und
  Kochansicht zeigen eine flache Liste ohne Gruppen.
- **Problem:** Man pflegt ein Feld, das nirgends wirkt. Gerade beim Kochen helfen Gruppen („40 g
  Butter für die Béchamel“).
- **Empfehlung:** Gruppenüberschriften in Lese- und Kochansicht zeigen, oder das Feld entfernen.
- **Screenshots:** `tmp/review/shots/B-phone-07-ingr-view.png`,
  `tmp/review/shots/B-phone-08-ingr-editmode.png`

#### E-06 Schritt-Timer nicht bearbeitbar · mittel · S–M

- **Ergebnis:** Das Schritt-Fenster hat nur ein Textfeld. Timer gibt es nur in den Beispiel- und
  Starter-Rezepten.
- **Problem:** Eigene Rezepte haben im Kochmodus nie einen Timer.
- **Empfehlung:** Optionales Feld „Timer (Min)“.
- **Alternative:** „15 Minuten köcheln“ im Text erkennen und als Timer vorschlagen.
- **Screenshot:** `tmp/review/shots/B-phone-11-steps-edit.png`

#### E-07 Ernährung „unbekannt“ durch Non-Food · mittel · S–M · beide

Das ist der bekannte Punkt „Grillabend nie vegetarisch“. Der Mechanismus ist bestätigt; der
Grillabend selbst ist wegen der Bratwurst ohnehin „mit Fleisch“.

- **Getan:** Den Grillabend geprüft (Grillkohle und Grillanzünder stehen auf „unbekannt“) und ein
  Testrezept mit einem neuen Gewürz angelegt.
- **Ergebnis:**
  - „unbekannt“ schlägt vegan und vegetarisch.
  - 68 Artikel stehen auf „unbekannt“, darunter Alufolie, Backpapier und Spülmittel.
  - Neue Artikel starten ebenfalls auf „unbekannt“.
  - Eine Stufe „kein Lebensmittel“ gibt es nicht, und die Rezeptseite sagt nicht, welcher Artikel
    schuld ist.
- **Problem:** Jedes Gericht mit Backpapier oder Grillkohle wird nie „vegetarisch“. Ein neu
  angelegter Artikel nimmt einem veganen Rezept still sein Label und den Filter-Treffer.
- **Empfehlung:**
  - Ernährung „kein Lebensmittel“, die beim Ableiten ignoriert wird; den Starterkatalog für
    Haushalt und Drogerie entsprechend setzen.
  - Den Chip „unbekannt“ antippbar machen: „wegen Grillkohle → festlegen“.
  - In Artikel einen Filter „Ernährung unbekannt“.
- **Alternative:** „unbekannt“ beim Ableiten ignorieren.
- **Screenshots:** `tmp/review/shots/B-phone-19-grillabend.png`,
  `tmp/review/shots/C-phone-14-artikel-detail.png`

#### E-08 Einfügen: Teil-Speichern und Dubletten · mittel · S

- **Getan:** Bei „Mehrere einfügen“ „Fertig“ getippt, solange noch orange Zeilen offen waren;
  dann dieselben Zeilen noch einmal eingefügt.
- **Ergebnis:** „Fertig“ speichert die sicheren Zeilen und bleibt offen. Erneutes Einfügen hängt
  alles ein zweites Mal an (Kokosmilch 2×, auf der Liste 400 ml).
- **Problem:** Man glaubt, nichts sei gespeichert, und erzeugt doppelte Zutaten und Mengen.
- **Empfehlung:** Hinweis „5 Zutaten gespeichert, 2 brauchen noch einen Artikel“ und Dubletten
  markieren („steht schon im Rezept“).
- **Screenshot:** `tmp/review/shots/B-phone-17-pasted-rows.png`

#### E-09 Einheiten unvollständig · niedrig · S

- **Ergebnis:**
  - Sack und Kasten werden inzwischen erkannt (der Followup ist erledigt).
  - Nicht erkannt werden Flasche, Tüte, Netz, Würfel, Beutel, Rolle, Tafel, Liter, „Pck.“ sowie
    klein geschriebenes „tl“/„el“. „1 Flasche Wein“ legt deshalb den Artikel „Flasche Wein“ an.
  - „1 kleine Dose Mais“ wird orange.
- **Empfehlung:** Einheiten in `packages/core/src/amounts.ts` ergänzen und Adjektive vor der
  Einheit überspringen (klein, groß, gehäuft).

#### E-10 bis E-15 Kleinigkeiten · niedrig · S

- **E-10:** Der Toast nach dem Einplanen sagt „Eingeplant: Mi Abend“, auch fünf Wochen voraus.
  Datum ergänzen. (`tmp/review/shots/B-phone-22-after-plan.png`)
- **E-11:** Im Einplanen-Fenster stehen die Tage ohne Datum („Mo … So“), und es geht nur
  wochenweise. Für einen Termin in drei Monaten braucht man rund 13 Tipps. Datum unter die Chips,
  optional ein Monatssprung. (`tmp/review/shots/B-phone-21-plan-sheet.png`)
- **E-12:** Einmal direkt nach dem Neuladen war „Wer isst mit?“ leer, der Knopf grau, ohne
  sichtbaren Grund; nicht stabil reproduzierbar. Vermutlich waren die Mitglieder noch nicht
  geladen. Die Vorauswahl neu berechnen, sobald sie da sind.
- **E-13:** Die Liste sagt „26 Rezepte · 2 Sammlungen“, der Filterknopf „28 Rezepte zeigen“
  (0009 OFFEN 8). Einheitlich zählen. (`tmp/review/shots/B-phone-20-filter.png`)
- **E-14:** In einer Sammlung steht „Kichererbsen-Eintopf übernimmt · 2 Port.“. Besser „2 Port.
  (wie Sammlung)“. (`tmp/review/shots/B-phone-35-contents-row.png`)
- **E-15:** Tippt man auf dem Handy auf den Stift bei „Zutaten“, wird der Abschnitt nicht ins Bild
  gescrollt; man sieht nur „Fertig“ am unteren Rand. Hineinscrollen.
  (`tmp/review/shots/B-phone-06-ingr-edit.png`)

## Restaurants

#### R-01 Restaurant nicht bearbeitbar · hoch · M · beide

- **Getan:** Ein Restaurant mit Tippfehler in der Küche („Grieschisch“) angelegt und auf der
  Detailseite nach „Bearbeiten“ gesucht.
- **Ergebnis:** Es gibt keinen Stift und kein ⋯-Menü; nur die Notiz ist editierbar. Schlagworte
  kann man nirgends setzen, auch nicht beim Anlegen.
- **Problem:** Tippfehler, Umzug oder Preisänderung lassen sich nicht korrigieren. Der Tippfehler
  stand danach dauerhaft als Filter-Chip „Grieschisch 1“ in der Liste.
- **Empfehlung:** „Bearbeiten“ als Fenster mit dem vorhandenen Anlege-Formular, nach dem Muster
  des Rezeptkopfs.
- **Screenshots:** `tmp/review/shots/B-phone-37-restaurant-detail.png`,
  `tmp/review/shots/B-desktop-04-restaurants.png`

#### R-02 „Einplanen“ springt nur in den Kalender · mittel · S–M · beide

- **Getan:** Auf der Restaurant-Seite „Einplanen“ getippt.
- **Ergebnis:** Die App öffnet die laufende Kalenderwoche, ohne Fenster und ohne Vorauswahl. Man
  sucht das Restaurant im Hinzufügen-Fenster noch einmal.
- **Problem:** Beim Rezept öffnet derselbe Knopf ein fertiges Einplanen-Fenster.
- **Empfehlung:** Dasselbe Einplanen-Fenster wie beim Rezept, plus „Reserviert um“ und
  Erinnerung.
- **Alternative:** Das Kalender-Hinzufügen mit dem Restaurant vorausgewählt öffnen.
- **Screenshot:** `tmp/review/shots/B-phone-39-restaurant-plan.png`

#### R-03 Besuche nur als Zahl · niedrig · S–M

- **Ergebnis:** „Zuletzt: vor 19 Tagen · 1 Besuch“ ist nicht antippbar.
- **Empfehlung:** Antippen zeigt die Termine mit Sprung in den Kalender.

#### R-04 Andere Muster als beim Rezept · niedrig · M

- **Ergebnis:** Rezept und Restaurant verhalten sich an drei Stellen verschieden.

  | Wo                         | Rezept                 | Restaurant                            |
  | -------------------------- | ---------------------- | ------------------------------------- |
  | Öffnen auf dem Desktop     | ganze Seite            | geteilte Ansicht mit „schließen“      |
  | Notiz bearbeiten           | per Stift und „Fertig“ | Inline-Feld, speichert beim Verlassen |
  | Zurück-Knopf auf dem Handy | „Essen“                | nur ein Pfeil                         |

- **Empfehlung:** Ein Muster für Detailseiten festlegen, mindestens die Notiz gleich behandeln.
- **Screenshots:** `tmp/review/shots/B-desktop-02-lasagne.png`,
  `tmp/review/shots/B-desktop-05-restaurant-detail.png`

Zum Löschen von Restaurants siehe X-02.

## Einkaufsliste und Vorratscheck

#### L-01 Mengen mit Einheit oder gemischte Mengen nicht änderbar · hoch · M · beide

- **Getan:** „1 Kasten Bier“ zweimal hinzugefügt, ergibt „2 Kasten“. Dann die Posten „Möhren
  1× · 500 g“ und „Reibekäse 75 g“ geöffnet.
- **Ergebnis:** „Menge“ ist bei solchen Posten nur Text, ohne ± und ohne Eingabefeld. ± gibt es nur
  bei reinen Anzahlen.
- **Problem:** „Nur 1 Kasten“ oder „1 kg statt 200 g Kartoffeln“ geht nicht; einzig Entfernen und
  neu Tippen hilft. Vom Rezeptanteil kann man nichts streichen.
- **Empfehlung:** Die Menge im Posten editierbar machen: Textfeld für den Anteil „von Hand“
  („500 g“ → „1 kg“), Stepper für Anzahlen. In der Herkunft jede Zeile mit „×“ einzeln
  entfernbar.
- **Alternative:** Ein Feld „Menge überschreiben“, das die Summe ersetzt.
- **Screenshots:** `tmp/review/shots/C-phone-03-item-moehren.png`,
  `tmp/review/shots/C-phone-05-sheet-bier.png`

#### L-02 Artikel eines Postens nicht aus der Liste änderbar · mittel · S–M · beide

- **Ergebnis:** Der Titel im Posten-Fenster ist fest. Umbenennen geht nur über ⊞ → Artikel → Suche
  → Name ändern.
- **Problem:** Drei Ebenen Umweg für einen häufigen Fehler.
- **Empfehlung:** Link „Artikel bearbeiten ›“ im Posten, der das vorhandene Artikel-Fenster öffnet.
  Alternativ „Anderen Artikel wählen“.
- **Screenshot:** `tmp/review/shots/C-phone-03-item-moehren.png`

#### L-03 Änderungen im Kalender erreichen die Liste nicht · mittel · M · beide

- **Getan:** Datenmodell und Code geprüft. In der Oberfläche nicht ausgeführt, um die
  Beispieleinträge nicht zu löschen.
- **Ergebnis:** Wird ein Eintrag gelöscht, verschoben oder in den Portionen geändert, bleiben seine
  Zutaten auf der Liste, mit Herkunft „Lasagne (So)“. Ein „Liste erneut erzeugen“, wie in der
  Vision beschrieben, gibt es nicht.
- **Problem:** Wer ein Essen absagt, kauft trotzdem dessen Zutaten oder muss sie einzeln suchen.
- **Empfehlung:**
  - Beim Löschen oder Verschieben eines Eintrags, dessen Zutaten auf der Liste stehen, ein Toast
    „Zutaten auch von der Liste nehmen?“.
  - In „Aus Kalender“ bei „steht schon auf der Liste“ ein „aktualisieren“.

#### L-04 Vorratscheck: Mengen nicht anpassbar, krumme Werte · mittel · M · beide

- **Getan:** Lasagne und KW 48 (mit Grillabend) im Vorratscheck bis Schritt 2, dann „19
  übernehmen“ und Rückgängig. Rückgängig funktioniert.
- **Ergebnis:**
  - Zeilen lassen sich nur an- und abwählen, nicht in der Menge ändern.
  - Skalierte Werte erscheinen krumm, etwa „Rucola 57 g“ oder „Mozzarella 438 g“. Der Followup
    „0,75 Glas / 56,25 g“ ist damit nur teilweise erledigt: Es sind jetzt ganze Gramm.
  - Was schon auf der Liste steht, sieht man nicht. Zwiebeln 1× wurden zu 3× ohne Hinweis.
- **Problem:** Nach dem Übernehmen muss man nachkorrigieren, was wegen L-01 oft gar nicht geht.
- **Empfehlung:** Menge in der Zeile antippbar, sinnvoll runden (g/ml auf 10 bzw. 50, Stück und
  Gläser aufrunden) und „schon auf der Liste: 1×“ anzeigen.
- **Screenshots:** `tmp/review/shots/B-phone-28-step2.png`,
  `tmp/review/shots/C-phone-08-pantry-step2.png`

#### L-05 „Aus Kalender“ startet in der laufenden Woche · niedrig · S · beide

- **Ergebnis:** Am Sonntag öffnet KW 47 mit sechs vergangenen Tagen; die gemeinte nächste Woche
  erreicht man mit ›. Vom Kalender aus geht „Auf die Einkaufsliste“ für jede angezeigte Woche.
- **Empfehlung:** Standard „ab heute 7 Tage“, oder ab Samstag die Folgewoche.
- **Screenshots:** `tmp/review/shots/C-phone-07-aus-kalender.png`,
  `tmp/review/shots/B-phone-26-list-from-plan.png`

#### L-06 bis L-13 Kleinigkeiten · niedrig · S

- **L-06:** „Liste leeren“ sagt „Alle 17 Posten“, die Kopfzeile „14 offen“. Besser „14 offene und
  3 erledigte Posten“. (`tmp/review/shots/C-phone-22-liste-leeren.png`)
- **L-07:** Die Kopfzeile „14 offen · für Lasagne“ zählt alle Rezepttitel auf und wird
  abgeschnitten. Sie wirkt, als wäre die ganze Liste für Lasagne. Besser „aus 4 Rezepten“,
  antippbar.
- **L-08:** Nach „−“ und Rückgängig steht Zahnpasta hinter Duschgel. Die ursprüngliche Position
  erhalten.
- **L-09:** Der Bereichswähler im Posten hat kein „Ohne Bereich“ und markiert den aktuellen
  Bereich nicht; der im Artikel-Fenster schon. Eine gemeinsame Komponente verwenden.
  (`tmp/review/shots/C-phone-06-area-picker.png`)
- **L-10:** Wer den Beispielartikel „Mozzarella (Fior di Latte)“ eintippt, bekommt Artikel
  „Mozzarella“ mit Zusatz „Fior di Latte“. Exakte Namenstreffer vor der Klammer-Regel prüfen.
- **L-11:** Ein geänderter Zusatz steht danach an allen Beiträgen; Zusätze aus Rezepten gehen
  still verloren (0006 OFFEN 2, Annahme A). Bestätigen oder den Rezept-Zusatz in der Herkunft
  weiter zeigen.
- **L-12:** Auf der Liste gibt es kein Abhaken; das ist entschieden (D24). Wer zu Hause merkt „hab
  ich doch noch“, muss entfernen, und das geht offline nicht. Vorschlag: Wischen nach rechts =
  erledigt, oder so lassen und den Offline-Text anpassen (X-03).
- **L-13:** „Milchko“ findet „Kokosmilch“ nicht, das Beispiel aus dem Konzept (0005 OFFEN 5).
  Wortteile in beliebiger Reihenfolge suchen.

## Einkaufen

#### S-01 Hinzufügen im Laden ohne Vorschläge und Tippfehler-Bremse · mittel · S · beide

- **Getan:** Auf der Liste „Zwiebelm“ getippt: Es kommen Vorschläge und „Meinst du Zwiebeln?“. Im
  Einkaufsmodus dasselbe getippt.
- **Ergebnis:** Im Laden legt das Feld direkt einen neuen Artikel an, ohne Vorschläge.
- **Problem:** Gleiche Aufgabe, anderes Verhalten, und das gerade im Laden mit einer Hand.
  Tippfehler landen dauerhaft im Katalog (M-03).
- **Empfehlung:** Dasselbe Eingabefeld wie auf der Liste.
- **Screenshot:** `tmp/review/shots/C-desktop-05-einkaufen.png`

#### S-02 Bereich im Laden nur für Posten ohne Bereich · mittel · S–M · beide

- **Ergebnis:** „Bereich zuordnen“ gibt es nur unter „Ohne Bereich“. Das Bereichsfenster bietet
  weder einen neuen Bereich noch „Ohne Bereich“.
- **Problem:** „Ingwer liegt hier bei den Gewürzen“ lässt sich vor Ort nicht korrigieren, die
  Laufreihenfolge bleibt falsch. Die Vision sagt: Wird ein Posten im Laden einem Bereich
  zugeordnet, gilt das künftig.
- **Empfehlung:** An jedem Posten „Liegt woanders …“ (lange drücken oder ⋯), im Fenster eine Suche
  mit „neu anlegen“.
- **Screenshot:** `tmp/review/shots/C-phone-12-area-sheet.png`

#### S-03 Fortschritt und Doppelposten · niedrig · S

- **Ergebnis:** Beim Start steht „2/17“, weil Brot und Butter von früher abgehakt sind. Butter
  steht zugleich offen und unter „Erledigt“.
- **Empfehlung:** Den Fortschritt nur über die beim Start offenen Posten rechnen. Wird ein
  erledigter Artikel neu hinzugefügt, den erledigten Posten wieder öffnen.
- **Screenshot:** `tmp/review/shots/C-desktop-05-einkaufen.png`

## Artikel, Märkte und Bereiche

Kleinigkeiten, alle niedrig, Aufwand S, beide Breiten:

- **M-01:** Bei 456 Artikeln gibt es keinen Filter nach Bereich. In „Bereiche“ steht „85 Artikel“,
  die Zeile ist aber nicht antippbar. Antippen sollte die Artikel dieses Bereichs zeigen.
  (`tmp/review/shots/C-phone-20-bereiche.png`)
- **M-02:** „Löschen“ ist gesperrt mit „Steht auf der Einkaufsliste“, auch wenn der Posten nur
  unter „Erledigt“ steht, und es gibt keinen Weg weiter. Erledigtes ignorieren, oder „Von der
  Liste nehmen und löschen“ anbieten.
- **M-03:** Artikel aus „Trotzdem neu“ oder aus dem Laden-Feld (S-01) bleiben für immer im Katalog.
  Ein Filter „Unbenutzt“ hilft beim Aufräumen.
- **M-04:** Ein neuer Bereich erscheint in jedem Markt sichtbar am Ende, auch bei dm, wo 14 Bereiche
  ausgeblendet sind (0007 OFFEN 6g). Toast „In Rewe am Ende einsortiert – Reihenfolge anpassen ›“.
- **M-05:** Ein neuer Markt startet immer mit der Standardreihenfolge. „Reihenfolge übernehmen von
  …“ anbieten. (`tmp/review/shots/C-phone-17-neuer-markt.png`)

## Haushalt: Aufgaben und Verlauf

#### H-01 Nächster Termin nicht einstellbar · hoch · M · beide

- **Getan:** Aufgaben mit „Alle 3 Monate“ und „Monatlich“ angelegt und das Fenster „Bearbeiten“
  durchgesehen.
- **Ergebnis:**
  - Es gibt kein Feld „Nächstes Mal“ und keins „Zuletzt erledigt“.
  - Neue Aufgaben mit „Alle n Monate“ oder „Flexibel“ sind sofort heute fällig.
  - Den Termin bewegen nur „Erledigt“, „Später“ (immer +1 Tag) und „Überspringen“.
  - Eine Rhythmusänderung rechnet den Termin neu und verwirft ein „Später“ (0011 OFFEN 4 und 11).
- **Problem:** „Matratze drehen alle 6 Monate, zuletzt im August“ lässt sich nicht erfassen. Ein
  versehentlich verschobener Termin lässt sich nicht zurückholen; im Test musste das per SQL
  geschehen.
- **Empfehlung:** Datumsfeld „Nächstes Mal“ im Formular, mit dem Monatskalender aus dem
  Abwesenheitsfenster. Beim Anlegen optional „Zuletzt erledigt am“.
- **Screenshots:** `tmp/review/shots/D-phone-04-new-chore.png`,
  `tmp/review/shots/D-phone-06-edit.png`

#### H-02 „Einmalig“ nur 14 Tage voraus · hoch · S · beide

- **Getan:** Rhythmus „Einmalig“ gewählt.
- **Ergebnis:** Datums-Chips von heute bis in 13 Tagen, mehr nicht.
- **Problem:** „Winterreifen im Oktober“ oder „TÜV im März“ lässt sich nicht datieren. Dieselbe
  Art Grenze wie bei deinen Beispielen.
- **Empfehlung:** Monatskalender, die Chips höchstens als Kurzwahl behalten.
- **Screenshot:** `tmp/review/shots/D-phone-04-new-chore.png`

#### H-03 Abwesenheiten wirken nicht auf Aufgaben · hoch · L · beide

- **Getan:** Urlaub für den ganzen Haushalt eingetragen und Übersicht, Haushalt und Kalender
  angesehen.
- **Ergebnis:**
  - Aufgaben bleiben fällig und laufen in „fällig seit“ auf.
  - Die Rotation teilt abwesenden Personen Aufgaben zu.
  - Während „Urlaub Mallorca“ stehen „Pflanzen gießen“ und „Bad putzen · E“ im Kalender.
- **Problem:** Nach jedem Urlaub ist die Liste voller Überfälligem. Wer auf Dienstreise ist, steht
  als „dran“ da. Das Konzept (3.6) versprach „Rotation pausiert, feste Termine entfallen“; 0010
  OFFEN 1 hat es auf eine eigene Spec verschoben, die es noch nicht gibt.
- **Empfehlung:** Eigene kleine Spec:
  - Die Rotation überspringt Abwesende.
  - Feste Termine in einer Abwesenheit des ganzen Haushalts rücken auf den ersten Tag danach.
  - „Zu tun“ bleibt während der Abwesenheit leer.
- **Alternative:** Nur ein Hinweis im Abwesenheitsfenster: „4 Aufgaben fallen in diese Zeit –
  verschieben?“
- **Screenshots:** `tmp/review/shots/A-phone-k21-woche-urlaub.png`,
  `tmp/review/shots/D-phone-29-uebersicht-card.png`

#### H-04 Einmalige Aufgabe ohne Datum taucht nirgends auf · mittel · S · beide

- **Ergebnis:** „Glühbirne Flur tauschen“ (einmalig, ohne Datum) steht weder unter „Anstehend“
  noch auf der Übersicht, nur unter „Alle“ mit „Noch kein Termin“.
- **Problem:** Genau so etwas wird vergessen.
- **Empfehlung:** Abschnitt „Ohne Termin“ unter „Anstehend“ (wie „Flexibel“).
- **Screenshot:** `tmp/review/shots/D-phone-05-alle.png`

#### H-05 „Später“ ist immer „morgen“ und wirkt sofort · mittel · S · beide

- **Ergebnis:** Ein Tipp verschiebt sofort auf morgen, mit Toast „Auf morgen verschoben ·
  Rückgängig“. Es gibt keine Wahl. Ist der Toast weg, lässt es sich nicht mehr zurücknehmen
  (wegen H-01).
- **Empfehlung:** „Später“ öffnet ein kleines Menü: morgen, übermorgen, Wochenende, Datum …
- **Screenshot:** `tmp/review/shots/D-phone-03-postpone.png`

#### H-06 Nachtragen nur bis vorgestern, Datum im Verlauf fest · mittel · S–M · beide

- **Ergebnis:**
  - „Was anderes erledigt?“ bietet als Tag nur heute, gestern und vorgestern; der Server nimmt
    nur −3 bis +1 Tag an (0011 OFFEN 10).
  - Im Verlauf lassen sich nur Person und Löschen ändern, nicht das Datum.
- **Problem:** „Letzten Samstag Fenster geputzt“ lässt sich nicht nachtragen, ein falsches Datum
  nicht korrigieren.
- **Empfehlung:** Tag frei wählbar bis etwa 30 Tage zurück, Datum im Verlauf editierbar. Bei der
  jüngsten Erledigung wird der nächste Termin dann neu gerechnet.
- **Screenshots:** `tmp/review/shots/D-phone-08-day.png`,
  `tmp/review/shots/D-phone-10-history-entry.png`

#### H-07 „Abwechselnd“: nicht zu sehen, wer dran ist · mittel · S · beide

- **Ergebnis:** Die Zeilen in Haushalt und Übersicht zeigen die Avatare aller Rotationsmitglieder,
  genau wie bei „Zu zweit“. Nur das Detail sagt „dran: Enrico“.
- **Empfehlung:** In der Zeile nur den Avatar der Person zeigen, die dran ist, eventuell mit ↻.
- **Screenshot:** `tmp/review/shots/D-desktop-14-alle-detail.png`

#### H-08 bis H-10 Kleinigkeiten · niedrig

- **H-08 (S):** Wer als Nächstes dran ist, lässt sich weder festlegen noch sehen, nur ableiten
  („wer nach der Person kommt, die zuletzt erledigt hat“). Bei „Abwechselnd“ eine Auswahl „Als
  Nächstes dran“ anbieten.
- **H-09 (S):** Eine neue Aufgabe steht auch bei „Bei Bedarf“ auf „Abwechselnd“. Bei „Bei Bedarf“
  sind „Später“ und „Überspringen“ ausgegraut, ohne Erklärung. Standard „Egal“; nicht anwendbare
  Knöpfe ausblenden.
- **H-10 (M):** Der Verlauf ist eine lange Liste bis 2025 zurück, ohne Filter. Chips für Person und
  Aufgabe, im Detail der Aufgabe „Alle Einträge ansehen“.
  (`tmp/review/shots/D-phone-09-verlauf.png`)

## Reisetaschen und Urlaubsseite

#### T-01 Packstück in der Packliste nicht bearbeitbar · mittel · S–M · beide

- **Ergebnis:** Das ⋯ an einem Packstück auf der Urlaubsseite enthält nur „Entfernen“.
- **Problem:** „Diesmal 3 Socken statt 2“ geht nur über Entfernen und neu Eintippen, und dabei geht
  der Haken verloren.
- **Empfehlung:** Antippen öffnet dasselbe Fenster wie in der Tasche (Name, Anzahl, je Tag), mit
  dem schon vorhandenen Schalter „auch in der Reisetasche speichern“.
- **Screenshot:** `tmp/review/shots/D-phone-31-checked.png`

#### T-02 Taschen-Änderungen erreichen bestehende Packlisten nicht · mittel · S (Hinweis) / M (Übernehmen) · beide

- **Ergebnis:** Ein Packstück, das in einer Tasche ergänzt wird, fehlt in der schon angelegten
  Packliste für Mallorca. Das ist so entschieden (D35), aber die Taschenseite sagt es nirgends.
- **Problem:** Wer zwei Tage vor Abreise „Sonnencreme“ in „Strand“ ergänzt, erwartet sie auf der
  Packliste.
- **Empfehlung:** Hinweis auf der Taschenseite: „Gilt für neue Packlisten. In ‚Urlaub Mallorca‘
  übernehmen?“, mit Knopf.
- **Screenshot:** `tmp/review/shots/D-phone-22-items.png`

#### T-03 Kein Weg von „Reisetaschen“ zu kommenden Packlisten · mittel · S · beide

- **Ergebnis:**
  - Die Packliste für Mallorca (in 12 Tagen) erreicht man nur über den Kalender (in den Dezember
    blättern) oder über Verwalten → Abwesenheiten.
  - Die Karte auf der Übersicht erscheint erst 7 Tage vorher.
  - Die Liste der Abwesenheiten zeigt nicht, welche eine Packliste hat.
- **Empfehlung:** Oben auf „Reisetaschen“ ein Abschnitt „Kommende Packlisten“ mit Name, Datum und
  „x/y gepackt“. In der Abwesenheitsliste ein Koffer-Symbol.
- **Screenshots:** `tmp/review/shots/D-phone-20-taschen.png`,
  `tmp/review/shots/D-phone-24-abwesenheiten.png`

#### T-04 und T-05 Kleinigkeiten · niedrig · S

- **T-04:** Die Schnelleingabe „Unterhose 1 je Tag“ wird zum Namen „Unterhose 1 je Tag“. „2
  Socken“ wird dagegen richtig erkannt. Auch „n je Tag“ bzw. „n/Tag“ erkennen.
  (`tmp/review/shots/D-phone-22-items.png`)
- **T-05:** Das Abwesenheitsfenster bietet „Neue Reisetasche“, die Urlaubsseite bei „Reisetasche
  hinzufügen“ nur bestehende Taschen. Dort gleich anbieten.
  (`tmp/review/shots/D-phone-32-add-bag.png`)

## Verwalten, Einstellungen, Mitglieder, Benachrichtigungen

#### V-01 „Entfernen“ und „Verlassen“ ohne Rückfrage · hoch · S · beide

- **Getan:** Unter Haushalt & Mitglieder bei Nadja „Entfernen“ getippt; der Serveraufruf wurde
  abgefangen.
- **Ergebnis:** Die Aktion geht beim ersten Tipp an den Server, ohne Rückfrage und ohne
  Rückgängig. „Verlassen“ bei sich selbst läuft über denselben Weg.
- **Problem:** Die Knöpfe sind kleine Links direkt neben dem Namen. Ein Fehltipp sperrt die
  Partnerin oder einen selbst aus; zurück geht es nur über eine neue Einladung.
- **Empfehlung:** Bestätigungsdialog mit Namen („Nadja aus ‚Enrico & Nadja‘ entfernen?“). Bei
  „Verlassen“ deutlicher warnen, besonders beim einzigen Haushalt.
- **Alternative:** Die Aktionen hinter ein ⋯ je Mitglied legen.
- **Screenshots:** `tmp/review/shots/E-phone-03-mitglieder.png`,
  `tmp/review/shots/E-phone-04-entfernen.png`

#### V-02 Einladungen lassen sich nicht zurückziehen · mittel · M · beide

- **Ergebnis:** Eine offene Einladung hat keine Aktion; die Schnittstelle kennt nur einladen,
  annehmen und ablehnen. Die Test-Einladung musste per SQL entfernt werden.
- **Problem:** Ein Tippfehler in der Adresse oder eine falsche Person bleibt für immer eingeladen.
- **Empfehlung:** „Zurückziehen“ an jeder Einladung.
- **Screenshot:** `tmp/review/shots/E-phone-03-mitglieder.png`

#### V-03 Eigenes Profil nicht bearbeitbar · mittel · M · beide

- **Ergebnis:** In den Einstellungen steht „Enrico (Test) · E-Mail · Ernährung: isst alles“. Es
  gibt kein ✎, und die Zeile reagiert nicht.
- **Problem:** Die Ernährung steuert „Passt für alle“, Vegetarisch-Hinweise und die Vorbelegung
  beim Einplanen, lässt sich aber nirgends ändern. Das ist 0005 OFFEN 2; die dort angenommene
  eigene Spec kam nie.
- **Empfehlung:** Kleine Spec „Profil bearbeiten“: Anzeigename, Farbe, Ernährung, Abneigungen.
- **Screenshots:** `tmp/review/shots/E-phone-02-einstellungen.png`,
  `tmp/review/shots/E-desktop-24-einstellungen.png`

#### V-04 Haushalt weder umbenennbar noch löschbar · mittel · M · beide

- **Ergebnis:** Anlegen und Wechseln gehen, Umbenennen und Löschen nicht.
- **Problem:** Ein Tippfehler im Namen bleibt, ein versehentlich angelegter Haushalt bleibt für
  immer im Wechsler.
- **Empfehlung:** ✎ am Namen. „Haushalt löschen“ nur für das letzte Mitglied und mit Bestätigung.

#### V-06 Abmelden verwirft ungesendete Offline-Haken · mittel · S · beide

- **Ergebnis:** Abmelden wirkt sofort und löscht den lokalen Speicher samt Warteschlange. So ist
  es für den Datenschutz gewollt.
- **Problem:** Wer im Laden offline abgehakt hat und sich dann abmeldet, verliert diese Haken ohne
  Hinweis.
- **Empfehlung:** Nur wenn noch etwas ungesendet ist, nachfragen: „3 Haken noch nicht gesendet –
  trotzdem abmelden?“
- **Screenshot:** `tmp/review/shots/E-phone-10-abmelden.png`

#### V-05, V-07 bis V-12 Kleinigkeiten · niedrig

- **V-05 (S–M):** Eigenes Feedback lässt sich weder bearbeiten noch löschen, und den Status
  („angenommen“, „umgesetzt“) setzt in der App niemand. ⋯ mit Bearbeiten und Löschen; ein Satz,
  wer den Status pflegt. (`tmp/review/shots/E-phone-09-feedback.png`)
- **V-07 (S):** Die Zeile „Benachrichtigungen · 2 an“ steht da, obwohl auf diesem Gerät nichts
  eingeschaltet und kein Gerät angemeldet ist. Besser „2 an · dieses Gerät aus“.
  (`tmp/review/shots/E-phone-05-benachrichtigungen.png`)
- **V-08 (S):** Die Uhrzeit ist ein Textfeld. Die 5-Minuten-Regel erfährt man erst aus der
  Fehlermeldung (0013 OFFEN 5). Eine Zeitauswahl im 5-Minuten-Raster wäre besser, mindestens der
  Hinweis gleich unter dem Feld. (`tmp/review/shots/E-phone-08-zeit-picker.png`)
- **V-09 (S):** Dass die Einstellungen je Haushalt gelten, steht nur klein in der Überschrift
  (0013 OFFEN 3e). Bei mehreren Haushalten einen Umschalter direkt auf der Seite.
- **V-10 (M):** Aufgaben-Erinnerungen gibt es nur für alle Aufgaben mit Uhrzeit oder für keine
  (0013 OFFEN 3d). Das ist deine Entscheidung; falls gewünscht, ein Schalter je Aufgabe.
- **V-11 (S):** „Zuletzt abgeglichen: heute, 00:05“ ist nicht antippbar, Ziehen zum Aktualisieren
  gibt es nicht. Die Zeile als „Jetzt abgleichen“ antippbar machen.
- **V-12 (S):** Doppelte Namen in der Navigation.
  - Der Tab „Haushalt“ meint die Aufgaben, die Verwalten-Gruppe „Haushalt“ Mitglieder und
    Feedback; daneben steht noch „Haushalt & Mitglieder“.
  - Die Gruppe „Einkaufen“ heißt wie der Einkaufsmodus.
  - Vorschlag: die Gruppen „Haushalt & Konto“ und „Einkauf“ nennen.

## Navigation und Offline (bereichsübergreifend)

#### X-01 „Zurück“ führt nicht dorthin, wo man herkam · hoch · M · beide

- **Getan:** Übersicht → Karte „Lasagne“ → Zurück. Ebenso Kalender → Eintrag → „Rezept öffnen“,
  Kalender → Trattoria → „Restaurant öffnen“ und Übersicht → „Eislaufen“, jeweils mit Zurück.
- **Ergebnis:** Man landet in der Wurzel eines anderen Bereichs:
  - Rezept → „Zurück: Essen“ (`/rezepte`),
  - Restaurant → Restaurantliste,
  - Aktivität → Kalender.
- **Problem:** „Übersicht → Rezept ansehen → zurück“ ist ein täglicher Weg; danach steht man in
  Essen und muss den Tab wechseln. Für die Packkarte wurde genau das schon behoben.
- **Empfehlung:** Die Herkunft genauso mitgeben wie bei der Packkarte, Beschriftung „Zurück:
  Übersicht“ bzw. „Zurück: Kalender“.
- **Screenshots:** `tmp/review/shots/A-phone-u03-rezept-von-uebersicht.png`,
  `tmp/review/shots/A-desktop-u03-rezept-von-uebersicht.png`

#### X-02 Aktivitäten und Restaurants lassen sich nirgends löschen · hoch · M · beide

- **Getan:** Auf beiden Detailseiten, in den Listen und in den Bearbeiten-Fenstern nach „Löschen“
  gesucht; die Schnittstelle verglichen.
- **Ergebnis:** Rezepte, Sammlungen, Artikel, Märkte, Bereiche, Aufgaben, Taschen und Abwesenheiten
  lassen sich löschen, meist mit „Rückgängig“. Für Aktivitäten und Restaurants gibt es weder einen
  Knopf noch einen Befehl. Das Test-Restaurant musste per SQL entfernt werden.
- **Problem:** Doppelte, falsch geschriebene oder geschlossene Restaurants und Aktivitäten bleiben
  für immer in Listen, Filtern und im Hinzufügen-Fenster.
- **Empfehlung:** „Löschen“ mit Rückgängig nach dem Muster der Rezepte. Vergangene Einträge bleiben
  im Verlauf, künftige entfallen mit Hinweis (siehe E-03).
- **Screenshots:** `tmp/review/shots/A-phone-a02-bearbeiten.png`,
  `tmp/review/shots/B-phone-37-restaurant-detail.png`

#### X-03 Offline-Texte widersprechen sich · mittel · S · beide

- **Getan:** Offline geschaltet, einmal mit „Offline simulieren“ und einmal mit echtem Netzverlust,
  dann durch Übersicht, Haushalt und Liste.
- **Ergebnis:**
  - Oben steht „Offline – Lesen und Abhaken gehen“.
  - Darunter sind auf Übersicht und Haushalt gerade die Aufgaben-Haken ausgegraut, ebenso die
    Sterne bei „Wie war's?“.
  - Pro Abschnitt steht zusätzlich „Offline – zum Bearbeiten brauchst du Netz“, auf einem
    Bildschirm mehrmals.
  - Auf der Liste gibt es gar keine Haken (die gibt es nur in „Einkaufen“).
  - „+“ und „−“ sind auf der Liste gesperrt; „Milch“ eintippen geht offline und erhöht die Menge
    trotzdem. Einen falsch hinzugefügten Posten kann man offline nicht entfernen.
- **Problem:** Das Banner verspricht das, was auf dem Bildschirm darunter gerade nicht geht.
- **Empfehlung:**
  - Banner „Offline – Lesen, Einkaufen und Packen gehen“.
  - Ein Hinweis je Bildschirm statt je Abschnitt.
  - Auf der Liste „+“ wie das Eintippen behandeln (über die Warteschlange) oder beides sperren.
- **Alternative:** Aufgaben-Haken offline über die Warteschlange erlauben; das braucht einen
  ADR-Nachtrag.
- **Screenshots:** `tmp/review/shots/E-phone-17-offline-uebersicht.png`,
  `tmp/review/shots/E-phone-17-offline-haushalt.png`,
  `tmp/review/shots/C-phone-25-offline-liste.png`

#### X-04 Auf dem Handy ist der aktive Haushalt unsichtbar · mittel · S · Handy

- **Ergebnis:** Auf dem Desktop steht der Haushaltsname oben in der Seitenleiste und öffnet den
  Wechsler. Auf dem Handy fehlt beides; wechseln geht nur über ⊞ → Haushalt & Mitglieder.
- **Problem:** Bei zwei Haushalten (die Beispieldaten haben „Test“) merkt man nicht, wo man gerade
  plant oder einkauft.
- **Empfehlung:** Den Haushaltsnamen als kleine, antippbare Zeile auf der Übersicht zeigen, nur bei
  mehr als einem Haushalt.
- **Screenshots:** `tmp/review/shots/E-phone-01-verwalten.png`,
  `tmp/review/shots/E-desktop-01-uebersicht.png`

#### X-05 bis X-07 Kleinigkeiten · niedrig · S

- **X-05:** Die Zurück-Beschriftung ist uneinheitlich.
  - Manche Seiten nennen das Ziel („Zurück: Märkte“), andere nur „Zurück“ oder einen Pfeil.
  - Auf dem Desktop heißt der Knopf auf „Aktivitäten“ „Zurück: Kalender“, führt aber richtig
    zurück, z. B. zu Haushalt. Das ist der Rest von 0010 Plan OFFEN: Das Ziel stimmt jetzt, der
    Text nicht.
  - Die Urlaubsseite hebt immer „Kalender“ hervor, auch wenn man von der Übersicht kam.
  - Empfehlung: Text und Hervorhebung aus der tatsächlichen Herkunft ableiten.
  - Screenshots: `tmp/review/shots/A-desktop-d04-aktivitaeten-sidebar.png`,
    `tmp/review/shots/D-desktop-29-trip-from-card.png`
- **X-06:** Bei zu alter App-Version steht oben richtig „Diese Version wird nicht mehr unterstützt
  · Neu laden“. An den gesperrten Knöpfen steht aber „Offline – zum Bearbeiten brauchst du Netz“,
  obwohl Netz da ist. Eigener Text: „Bitte neu laden, um zu bearbeiten“.
  (`tmp/review/shots/E-phone-25-mindestversion.png`)
- **X-07:** Bricht das Netz beim Abhaken einer Aufgabe ab, ist das Verhalten richtig (AC-034 aus
  0011): Die Zeile steht wieder offen, gebucht wird nichts. Der Toast „Offline – nichts wurde
  abgehakt“ sagt aber nicht, was zu tun ist. Besser: „… Mit Netz noch einmal abhaken.“
  (`tmp/review/shots/E-phone-21-ac034-abbruch.png`)
- **X-08 Einladen scheitert an Google · mittel · S · beide:** Wer in der App eingeladen wird, kommt
  trotzdem nicht hinein, solange die Google-Anmeldung auf „Testing“ steht: Google weist jede Adresse
  ab, die nicht in der Google-Konsole unter „Zielgruppe → Testnutzer“ steht, und zwar mit einer
  eigenen Fehlerseite, bevor die App die Einladung überhaupt prüft. Wer einlädt, erfährt davon
  nichts. **Empfehlung:** Die Google-App auf „In Production“ stellen. Weil sie nur E-Mail und Profil
  abfragt, verlangt Google dafür keine Prüfung; danach entscheidet allein die Einladung der App.
  Sonst wenigstens im Fenster „Einladen“ der Hinweis „Neue Adressen zusätzlich bei Google als
  Testnutzer eintragen“.
- **X-09 Alte Adressen · niedrig · S · beide:** Seit den eigenen Domains (`<Produktions-Domain>`,
  `<Vorschau-Domain>`) laden die alten Adressen `*.azurestaticapps.net` die App weiter. Die
  Anmeldung dort scheitert mit „Anmelden hat nicht geklappt“, weil Supabase nach Google auf die
  eingetragene Domain zurückleitet und der Browser dort den Anmeldestart nicht kennt (so am
  22.11. in der Vorschau passiert). **Empfehlung:** In Azure bei beiden Static Web Apps die eigene
  Domain als Standard setzen („Set default“); dann leiten die alten Adressen auf sie um.

## Bekannte Punkte aus dem Bau

| Punkt                                                                       | Status                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| „Zurück“ nach Tipp auf die Packkarte der Übersicht                          | **Behoben**, auf Handy und Desktop zurück zur Übersicht. Ebenso Kalender-Streifen → Kalender, Abwesenheiten → Abwesenheiten. Für Rezept, Restaurant und Aktivität fehlt das noch (X-01). |
| Grillabend nie „vegetarisch“ wegen Grillkohle                               | **Bestätigt** als Mechanismus, betrifft alle Non-Food-Artikel (E-07).                                                                                                                    |
| Gericht doppelt gezählt, wenn direkt und in einer Sammlung geplant          | **Bestätigt** im Code (`cooking-history.ts`). Sichtbar nur in der Sortierung „Am häufigsten“. Geringe Wirkung, kein eigener Befund.                                                      |
| „Für morgen“ ohne Vorlauf der Rezepte einer Sammlung (0009 OFFEN 7)         | **Bestätigt**, auf der Übersicht und in der Push-Nachricht (U-02).                                                                                                                       |
| 0013: „Fertig“ in jedem Eintragsfenster                                     | **Bestätigt problematisch**: Es verwirft einen getippten Zusatz (K-03).                                                                                                                  |
| AC-034 (0011), Offline-Text beim Abhaken                                    | **Funktioniert**. Offline sind die Haken gesperrt; ein Abbruch im Sammel-Fenster stellt die Zeile wieder her. Kleine Textverbesserung X-07, Widerspruch zum Banner X-03.                 |
| 0010 Plan OFFEN: Aufgaben mit festem Rhythmus erscheinen an künftigen Tagen | Mit den Beispieldaten **nicht reproduzierbar**. Überfälliges steht heute und erst wieder am nächsten regulären Termin.                                                                   |
| 0010 Plan OFFEN: Desktop-„Zurück“ von Aktivitäten geht immer zum Kalender   | **Teilweise behoben**: Das Ziel stimmt, die Beschriftung nicht (X-05).                                                                                                                   |

### Followups aus `tmp/brief/followups.md`

| Notiz                                                    | Status                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| a11y: Auf- und Zuklappen ohne `aria-expanded` im Web     | **Erledigt** mit Commit `bd23fe5`.                                                                                              |
| KI-Kontext liest Sammlungen als Rezepte                  | **Erledigt**: `supabase/functions/_shared/context.ts` markiert sie als `kind: 'collection'`.                                    |
| Spec 0009: „0,75 Glas“ / „56,25 g“ im Vorratscheck       | **Teilweise**: jetzt ganze Gramm, aber weiter krumme Werte (L-04).                                                              |
| Spec 0007: „Sack“ und „Kasten“ werden nicht erkannt      | **Erledigt**. Andere Einheiten fehlen noch (E-09).                                                                              |
| `push-send/deno.lock` fehlt                              | **Erledigt** (22.11.): aus dem CI-Lauf erzeugt und committet.                                                                   |
| Schema `net` in der Cloud nicht über PostgREST freigeben | Technisch, nicht in der Oberfläche prüfbar. In Spec 0014 und `docs/architecture/sync.md` erwähnt; beim Cloud-Setup gegenprüfen. |

### OFFEN-Annahmen der Specs 0005–0013

Alle `OFFEN`-Annahmen wurden gegen das echte Verhalten geprüft. Für einen Menschen spürbar sind
nur die folgenden; sie stehen oben als Befund:

| Spec | Annahme                                                         | Befund     |
| ---- | --------------------------------------------------------------- | ---------- |
| 0005 | 2: Profil bearbeiten in eigene Spec                             | V-03       |
| 0005 | 5: Suche „Milchko“                                              | L-13       |
| 0006 | 2: Zusatz bei mehreren Beiträgen                                | L-11       |
| 0006 | 3: Liste leeren nimmt auch Erledigtes mit                       | L-06       |
| 0007 | 6g: neue Bereiche überall sichtbar                              | M-04       |
| 0008 | 1: Verlassen speichert, kein Abbrechen                          | E-04       |
| 0008 | 3 und 5: Löschen entfernt künftige Einträge                     | E-03       |
| 0009 | 7: Vorlauf bei Sammlungen                                       | U-02       |
| 0009 | 8: Zählung der Rezepte                                          | E-13       |
| 0010 | 1: Abwesenheit wirkt nur auf „Wer isst mit?“                    | H-03, K-02 |
| 0010 | 3: Reste-Regeln                                                 | K-07       |
| 0011 | 1 und 7: „Wie war's?“ gilt erst nach erneutem Tipp als bewertet | U-03       |
| 0011 | 4 und 11: Termin nach Rhythmusänderung bzw. bei neuer Aufgabe   | H-01       |
| 0011 | 10: Server nimmt nur −3 bis +1 Tag an                           | H-06       |
| 0013 | 3d: Erinnerungen für alle oder keine Aufgaben                   | V-10       |
| 0013 | 3e: Einstellungen je Haushalt                                   | V-09       |
| 0013 | 5: Uhrzeit in 5-Minuten-Schritten                               | V-08       |

Alle übrigen Annahmen fallen im Gebrauch nicht auf oder verhalten sich vernünftig. Du kannst sie
so bestätigen. Das gilt zum Beispiel für:

- 0011 Nr. 3 und 9: „Eintrag entfernen“ macht die Aufgabe korrekt wieder fällig.
- 0012 Nr. 1: „Alles einpacken“ geht offline.
- 0007 Nr. 3: Zusammenführen mit Bestätigungsfenster.

**Nicht geprüft** wurden 0012 Nr. 4 (Packliste beim Personenwechsel einer Abwesenheit) und die
Push-Zustellung selbst: Der Testbrowser erlaubt keine Benachrichtigungen.

## Was gut funktioniert

- **Übersicht:** Die Wochenleiste blättert unbegrenzt, und ein Tag tauscht den ganzen Inhalt
  („Geplant am Freitag“, „Zu tun am Freitag“). Route-Fenster öffnen direkt Apple Karten oder
  Google Maps.
- **Hinzufügen im Kalender:** ein Fenster für alles: Suche, Tabs, Neuanlage von Rezept, Sammlung,
  Restaurant und Aktivität vor Ort, Freitext, Reste, „Ohne Tag vormerken“. Esser werden sinnvoll
  vorbelegt, Abwesende ausgenommen. Entfernen hat „Rückgängig“.
- **Abwesenheiten:** freier Zeitraum über Monate und Jahre, Personen, Datum und Notiz editierbar,
  Löschen mit „Rückgängig“. Bänder erscheinen in Woche, Monat und Jahr.
- **Rezepte:**
  - Die Suche ist fehlertolerant („bolgnese“) und findet Zutaten und Schlagworte.
  - Das Zutat-Fenster ist sehr vollständig: Menge, Artikel, Einkaufsregel mit Erklärung, Zusatz,
    Kochhinweis, Variante.
  - Varianten schalten den Ernährungs-Chip richtig um.
  - Einplanen ist ohne Zeitgrenze, „Ansehen“ springt in die richtige Woche.
- **Sammlungen:** schnell angelegt, mehrere Rezepte auf einmal, je Rezept Portionen und Variante.
- **Liste:**
  - Das Eingabefeld „Was fehlt?“ zeigt live, was es erkennt (Menge, Artikel, Zusatz). Es schlägt
    Artikel vor und bremst bei Tippfehlern.
  - Gleiche Artikel werden zusammengeführt, die Herkunft ist klar beschriftet.
  - „Rückgängig“ gibt es überall, wo es zählt.
- **Einkaufsmodus:** große Zeilen, Abhaken mit einem Tipp, „nicht da“, „Im Wagen“, Markt-Chip mit
  „Woanders kaufen“, Abschluss-Toast „3 gekauft · 14 bleiben“.
- **Artikel und Märkte:**
  - Das Artikel-Fenster ist vollständig, mit Konfliktprüfung beim Umbenennen und Zusammenführen.
  - Die Laufreihenfolge lässt sich ziehen oder per Pfeil sortieren.
  - Löschdialoge sagen, was passiert („4 Artikel stehen danach unter ‚Ohne Bereich‘“).
- **Haushalt:** Erledigt, Später, Überspringen mit „Rückgängig“. Die Rotation wechselt korrekt.
  „Was anderes erledigt?“ ist schnell. „Eintrag entfernen“ im Verlauf macht die Aufgabe wieder
  fällig.
- **Reisetaschen:**
  - „je Tag“ rechnet beim Verlängern der Reise neu (T-Shirts 3× → 5×).
  - Packen, „Alles einpacken“ und „Für die Rückreise zurücksetzen“ gehen offline.
  - Der Lösch-Dialog einer Abwesenheit nennt die betroffenen Packstücke.
- **Navigation:**
  - Jede Unterseite lässt sich direkt aufrufen und neu laden.
  - Unbekannte Adressen und gelöschte Rezepte haben klare Leerseiten.
  - ⊞ Verwalten steht im Kopf jedes Tab-Startbildschirms.
  - Die Desktop-Seitenleiste enthält alle Verwalten-Seiten.
- **Offline:** Die Sperre greift durchgängig, mit gleichem Text, und das Banner kommt und geht
  sofort mit dem Netz.
- **Desktop:** Zwei Spalten auf der Liste, Liste plus Detail bei Artikel, Märkten, Haushalt und
  Reisetaschen, gut lesbare Monatsansicht.
