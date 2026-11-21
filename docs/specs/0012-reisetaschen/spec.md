---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-20
---

# 0012 — Reisetaschen

## Problem

Vor jedem Urlaub schreiben Enrico und Nadja dieselben Packlisten neu oder packen aus dem Kopf und
vergessen etwas: Ladekabel, Sonnencreme, die zweite Badehose. Wie viele T-Shirts mitmüssen, hängt
von der Länge der Reise ab und wird jedes Mal neu überlegt. Auf der Rückreise aus der Ferienwohnung
fehlt oft das Netz, und keiner weiß mehr genau, was alles mit war.

## Ziel

- Wiederverwendbare Reisetaschen wie „Strand“, „Wintersport“, „Kulturbeutel“ (für Nadja) oder
  „Technik“ liegen unter „Verwalten“ und lassen sich schnell pflegen.
- Beim Eintragen einer Abwesenheit hängt man eine oder mehrere an. Daraus entsteht in einem Schritt
  die Packliste dieser Abwesenheit, mit „je Tag“-Anzahlen passend zur Dauer.
- Auf der Urlaubsseite hakt man Packstücke ab, auch ohne Netz. Man sieht immer, was noch fehlt, und
  setzt die Liste für die Rückreise mit einem Schritt zurück.
- Die „Übersicht“ und der Kalender führen mit einem Tipp zur Packliste, sobald der Urlaub ansteht.

## Nicht-Ziele

- **Packstücke sind keine Artikel.** Kein Katalog, kein Bereich, nichts davon kommt auf die
  Einkaufsliste.
- **Keine Rückwirkung von Vorlagen** (D35): Eine geänderte Reisetasche ändert keine bestehende
  Packliste.
- **Kein Umbenennen und keine Anzahl-Änderung einzelner Packstücke in der Packliste.** Man entfernt
  das Packstück und legt es neu an.
- **Keine Erinnerung an die Packliste per Benachrichtigung** (Konzept, Anhang B; nicht in Spec 0013).
- **Keine Packliste ohne Abwesenheit** und kein Teilen mit Personen außerhalb des Haushalts.
- **Keine neuen Felder an der Abwesenheit** (D22): Die Notiz bleibt der Titel.

## Konzept in Kürze

Grundlage ist das freigegebene UI-Konzept v2 (`docs/product/ui-konzept-v2.md`, Abschnitte 3.6,
3.12, 3.13, 4.8; Entscheidungen D22, D23, D30 bis D35).

- **Begriffe:** _Reisetasche_ = die Vorlage. _Packliste_ = die Liste einer Abwesenheit, eine Kopie
  der angehängten Reisetaschen. _Packstück_ = eine Zeile mit Name und optionaler Anzahl, fest
  („2×“) oder je Tag („1 je Tag“). Packstücke sind Freitext.
- **Verwalten → Reisetaschen** (Liste und Detail): Name (eindeutig je Haushalt), „für“ (alle oder
  eine Person), Packstücke mit Anzahl. Eingabe wie auf der Liste: „2 Badehose“, Enter legt die
  nächste Zeile an; beim Tippen schlägt die App Namen aus anderen Taschen vor. Ziehen sortiert.
  ⋯: Duplizieren, Löschen (Packlisten behalten ihre Kopie).
- **Abwesenheit-Fenster** (Spec 0010): Abschnitt „Reisetaschen (optional)“ mit allen Taschen als
  Auswahl-Chips, zuletzt benutzte zuerst, „+ Neue“; nichts ist vorausgewählt. „Speichern · 21
  Packstücke“ legt Abwesenheit und Packliste in einem Schritt an.
- **„Je Tag“** rechnet mit der Dauer der Abwesenheit, erster und letzter Tag eingeschlossen
  (1.–7.1. = 7 Tage). Ändert sich die Dauer, rechnet die App offene „je Tag“-Packstücke neu;
  gepackte bleiben, wie sie sind.
- **Urlaubsseite:** Kopf (Notiz als Titel, wer, Zeitraum, Dauer, „beginnt in 12 Tagen“, ✎ öffnet
  das Abwesenheit-Fenster, ⋯ mit „Für die Rückreise zurücksetzen“ und „Abwesenheit löschen“),
  Fortschritt „12 von 30 gepackt“ mit Balken, ein Abschnitt je Tasche mit Zähler („Strand 4/9“)
  und Avatar, falls sie einer Person gehört. Gezählt werden Packstücke, nicht Stückzahlen.
- **Packen:** Abhaken mit Sammel-Fenster (Spec 0005); gespeichert wird sofort beim Tipp (Annahme,
  Offene Frage 3), 2 s nach dem letzten Tipp gleiten gepackte Stücke in „Gepackt (n)“ am Ende ihrer
  Tasche, eingeklappt (D31). „Alles einpacken“ je Tasche mit
  5 s „Rückgängig“. „Für die Rückreise zurücksetzen“ mit Bestätigungsdialog.
- **Ergänzen:** „+ Packstück“ je Tasche, wahlweise „auch in der Reisetasche ‚Strand‘ speichern“;
  „+ Reisetasche hinzufügen“; „Aus der Packliste entfernen“ je Tasche; ein Packstück entfernen.
- **Offline (D34):** Packen geht ohne Netz über die Laden-Warteschlange mit „Abhaken gewinnt“.
  Hinzufügen und Entfernen brauchen Netz.
- **„Übersicht“ und Kalender:** eine Karte je Packliste unten auf der „Übersicht“, wenn die gezeigte
  Woche einen Urlaubstag enthält oder der Urlaub in den 7 Tagen nach dem gezeigten Tag beginnt
  (D33); ein Taschen-Symbol am Abwesenheits-Streifen.
- **Desktop:** Taschen der Packliste als Spalten nebeneinander, der Kopf darüber.

## Abhängigkeiten und kritischer Pfad

| Spec | Was diese Spec daraus braucht                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------- |
| 0003 | Laden-Warteschlange, Überlagerung, Delta-Sync, Abmelden löscht Speicher und Warteschlange                                  |
| 0005 | Gruppe „Verwalten“ mit dem Eintrag „Reisetaschen“, Abhak-Baustein, Fenstergrößen, Auswahl-Chips, Layout „Liste und Detail“ |
| 0010 | Abwesenheit-Fenster, Seite „Abwesenheiten“, Abwesenheits-Streifen, Abwesenheit bearbeiten und löschen, Kalender            |
| 0011 | „Übersicht“ mit gezeigtem Tag und gezeigter Woche (Tagesauswahl), für die Karte „Reisetasche“                              |

Die Urlaubsseite entsteht mit dieser Spec. Bis dahin öffnet ein Tipp auf einen Streifen oder auf
eine Zeile in „Abwesenheiten“ das Fenster „Abwesenheit bearbeiten“ (Spec 0010, AC-032 und AC-038);
danach öffnet er die Urlaubsseite, und bearbeitet wird dort über ✎.

**Voraussetzung vor dem Bau:** ein **Nachtrag zu ADR-0008**, der Packen als weitere Aktion der
Laden-Warteschlange festlegt, mit der Regel „Abhaken gewinnt“ (`31-sync.md`: jede neue
Offline-Aktion braucht Spec und Nachtrag). Nach der Annahme in Offener Frage 1 gehören „Alles
einpacken“ und „Für die Rückreise zurücksetzen“ dazu.

**Kritischer Pfad:** neue Offline-Aktion in der Warteschlange, drei neue synchronisierte Tabellen
mit Mandantengrenze, mehrteilige Aktionen als eine RPC (Abwesenheit mit Packliste speichern, Tasche
hinzufügen, Alles einpacken, Zurücksetzen, Dauer ändern) und Löschen (Abwesenheit samt Packliste).
Der Plan braucht ein Bedrohungsmodell, Negativtests (fremder Haushalt, abgemeldet, ungültige
Eingabe, Fehlerfall) und `/security-check`.

## Anforderungen und Akzeptanzkriterien

Der Haushalt „Enrico & Nadja“ hat die Mitglieder Enrico (E) und Nadja (N). Handybreite ist 390 px,
Desktopbreite 1440 px.

**Geändert am 21.11.2026:** Die Seite „Heute“ heißt „Übersicht“ (Spec 0005, AC-061; Spec 0011). Der
neue Name ist in REQ-003, REQ-009, AC-042, AC-043 und AC-045 eingesetzt; sonst ändern sich diese
Kriterien nicht.

### REQ-001 — Reisetaschen verwalten

> Unter „Verwalten → Reisetaschen“ legt der Haushalt Reisetaschen mit Namen, optional „für“ eine
> Person, und Packstücken mit fester oder „je Tag“-Anzahl an, ändert, sortiert, dupliziert und
> löscht sie.

**Offline:** offline lesend — Anlegen, Ändern, Sortieren und Löschen brauchen Netz, weil sie
Vorlagen des ganzen Haushalts ändern (ADR-0008).

**AC-001 — Liste**

```gherkin
Angenommen  der Haushalt hat die Reisetaschen „Strand“ (12 Packstücke), „Wintersport“ (18) und
            „Kulturbeutel“ (9, für Nadja)
Wenn        ich „Verwalten → Reisetaschen“ öffne
Dann        sehe ich die drei mit Name und „12 Packstücke“, „18 Packstücke“ bzw. „9 Packstücke“
Und         „Kulturbeutel“ trägt Nadjas Avatar, und oben steht „+ Neue Reisetasche“
```

**AC-002 — Leer**

```gherkin
Angenommen  der Haushalt „Test“ hat keine Reisetaschen
Wenn        ich „Verwalten → Reisetaschen“ öffne
Dann        sehe ich „Noch keine Reisetaschen“ mit „Reisetasche anlegen“
```

**AC-003 — Packstücke eingeben**

```gherkin
Angenommen  die neue Reisetasche „Strand“ ist offen
Wenn        ich „2 Badehose“ tippe und Enter drücke
Dann        steht „Badehose 2×“ in der Tasche, und die Eingabezeile ist leer und bereit
Wenn        ich „Sonnenbrille“ tippe und Enter drücke
Dann        steht „Sonnenbrille“ ohne Anzahl darunter
Wenn        ich in der leeren Eingabezeile Enter drücke
Dann        entsteht kein Packstück
```

**AC-004 — Je Tag**

```gherkin
Angenommen  in „Strand“ steht „T-Shirts 1×“
Wenn        ich „T-Shirts“ antippe und „je Tag“ einschalte
Dann        steht dort „T-Shirts · 1 je Tag“
```

**AC-005 — Vorschläge aus anderen Taschen**

```gherkin
Angenommen  in „Wintersport“ steht „Sonnencreme“, in „Strand“ noch nicht
Wenn        ich in „Strand“ „Sonn“ tippe
Dann        schlägt die Eingabe „Sonnencreme“ vor
```

**AC-006 — Sortieren**

```gherkin
Angenommen  in „Strand“ steht „Sonnencreme“ vor „Strandtuch“
Wenn        ich „Strandtuch“ über „Sonnencreme“ ziehe
Dann        bleibt diese Reihenfolge, auch auf Nadjas Gerät
```

**AC-007 — Fehlerfälle beim Namen**

```gherkin
Angenommen  die Reisetasche „Strand“ gibt es
Wenn        ich eine neue Reisetasche „strand“ anlegen will
Dann        sehe ich „Gibt es schon: Strand“ mit „Öffnen“, und es entsteht keine zweite
Wenn        ich eine Reisetasche ohne Namen speichern will
Dann        wird nichts angelegt, und das Namensfeld zeigt „Name fehlt“
```

**AC-008 — Duplizieren (Annahme, Offene Frage 3)**

```gherkin
Angenommen  „Strand“ hat 12 Packstücke
Wenn        ich bei „Strand“ ⋯ → „Duplizieren“ wähle
Dann        gibt es die Reisetasche „Strand (Kopie)“ mit denselben 12 Packstücken, Anzahlen und
            derselben Reihenfolge
```

**AC-009 — Löschen**

```gherkin
Angenommen  „Strand“ hängt an der Packliste „Urlaub Mallorca“, dort sind 4 von 9 gepackt
Wenn        ich „Strand“ in Verwalten lösche
Dann        verschwindet „Strand“ aus „Reisetaschen“, ein Hinweis bietet 5 Sekunden „Rückgängig“
Und         die Packliste „Urlaub Mallorca“ zeigt den Abschnitt „Strand“ unverändert mit 4 von 9
            gepackt
```

**AC-010 — Fremder Haushalt und abgemeldet**

```gherkin
Angenommen  Reisetaschen und Packlisten von „Enrico & Nadja“
Wenn        ein Mitglied eines anderen Haushalts oder ein abgemeldeter Aufruf sie über die
            Supabase-API lesen, ändern, anlegen oder löschen will
Dann        wird das abgelehnt
Wenn        ein Mitglied eines anderen Haushalts in seiner Packliste auf eine Abwesenheit, eine
            Reisetasche oder ein Mitglied von „Enrico & Nadja“ verweisen will
Dann        wird das ebenfalls abgelehnt
```

### REQ-002 — Reisetaschen beim Eintragen einer Abwesenheit anhängen

> Das Abwesenheit-Fenster (Spec 0010) hat den Abschnitt „Reisetaschen (optional)“; „Speichern“ legt
> Abwesenheit und Packliste in einem Schritt an und rechnet „je Tag“ mit der Dauer aus.

**Offline:** nur online, wie das Eintragen der Abwesenheit selbst; ohne Netz ist „Speichern“
ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“.

**AC-011 — Anhängen**

```gherkin
Angenommen  „Strand“ hat 12 Packstücke, darunter „T-Shirts · 1 je Tag“; „Kulturbeutel“ hat 9 und
            gehört Nadja
Wenn        ich eine Abwesenheit für Enrico und Nadja (ganzer Haushalt) von Fr 1.1.2027 bis
            Do 7.1.2027 mit der Notiz „Urlaub Mallorca“ eintrage und „Strand“ und „Kulturbeutel“
            wähle
Dann        heißt der Knopf „Speichern · 21 Packstücke“
Wenn        ich speichere
Dann        gibt es die Abwesenheit und ihre Packliste mit 21 Packstücken in den Abschnitten „Strand“
            und „Kulturbeutel“, dieser mit Nadjas Avatar
Und         „T-Shirts“ steht dort mit „7×“
```

**AC-012 — Auswahl im Fenster**

```gherkin
Angenommen  „Technik“ hing zuletzt an der Abwesenheit „Dienstreise Hamburg“ (Oktober 2026),
            „Strand“ an einer früheren
Wenn        ich das Abwesenheit-Fenster öffne
Dann        stehen alle Reisetaschen als Auswahl-Chips, „Technik“ vor „Strand“, keine ist gewählt
Und         dahinter steht „+ Neue“
Wenn        ich ohne gewählte Tasche speichere
Dann        heißt der Knopf „Speichern“, und es entsteht keine Packliste
```

**AC-013 — Neue Reisetasche im Fenster**

```gherkin
Angenommen  das Abwesenheit-Fenster ist offen
Wenn        ich „+ Neue“ tippe und „Camping“ eingebe
Dann        gibt es die Reisetasche „Camping“ ohne Packstücke, und ihr Chip ist gewählt
Wenn        ich „Camping“ eingebe, obwohl es „Camping“ schon gibt
Dann        wird die vorhandene „Camping“ gewählt, und es entsteht keine zweite
```

**AC-014 — Getrennte Abwesenheiten**

```gherkin
Angenommen  Enrico ist vom 1. bis 4.1.2027 abwesend, Nadja vom 1. bis 7.1.2027, beide als eigene
            Abwesenheit mit „Strand“ eingetragen
Dann        hat jede Abwesenheit ihre eigene Packliste
Und         „T-Shirts“ steht in Enricos Packliste mit „4×“, in Nadjas mit „7×“
```

**AC-015 — Alles oder nichts**

```gherkin
Angenommen  ich trage eine Abwesenheit mit „Strand“ ein
Wenn        beim Speichern auf dem Server ein Fehler passiert
Dann        gibt es weder die Abwesenheit noch eine Packliste
Und         ich sehe „Hat nicht geklappt – bitte noch einmal versuchen“
```

### REQ-003 — Urlaubsseite mit Packliste

> Ein Tipp auf einen Abwesenheits-Streifen, auf eine Abwesenheit in „Abwesenheiten“ oder auf die
> Karte auf der „Übersicht“ öffnet die Urlaubsseite: Kopf mit Zeitraum und Dauer, Fortschritt und
> die Packliste, gruppiert nach Tasche.

**Offline:** offline vollständig zum Lesen; Packen siehe REQ-004.

**Geändert am 21.11.2026 (Plan, Task 12, vom Eigentümer entschieden):** „Zurück“ auf der
Urlaubsseite führt dorthin, woher man kam: aus „Abwesenheiten“ mit „‹ Abwesenheiten“ zurück
dorthin, von der Karte der „Übersicht“ mit „‹ Übersicht“ zurück zur „Übersicht“, sonst (Streifen im
Kalender) mit „‹ Kalender“ in den Kalender. Das folgt der Regel von Spec 0010 für „Aktivitäten“.

**AC-016 — Aufbau** (ersetzt Spec 0010, AC-032, und den letzten Schritt von Spec 0010, AC-038)

```gherkin
Angenommen  heute ist So 20.12.2026; „Urlaub Mallorca“ (ganzer Haushalt, Fr 1.1. bis Do 7.1.2027)
            hat 30 Packstücke, davon 12 gepackt
Wenn        ich im Kalender auf den Streifen „Urlaub Mallorca“ tippe
Dann        zeigt die Urlaubsseite den Titel „Urlaub Mallorca“, „(E)(N) · Fr 1.1. – Do 7.1. · 7 Tage“
            und „beginnt in 12 Tagen“
Und         darunter „Packliste · 12 von 30 gepackt“ mit Balken
Und         je Tasche einen Abschnitt mit Name, Zähler (z. B. „Strand 4/9“) und ⋯, „Kulturbeutel“ mit
            Nadjas Avatar
```

**AC-017 — Zählt Packstücke, nicht Stückzahlen**

```gherkin
Angenommen  eine Packliste mit „T-Shirts 7×“, „Badehose 2×“ und „Sonnenbrille“, nur „T-Shirts“ ist
            gepackt
Dann        zeigt der Fortschritt „1 von 3 gepackt“
```

**AC-018 — Desktop**

```gherkin
Angenommen  Desktopbreite, „Urlaub Mallorca“ mit den Taschen „Strand“, „Kulturbeutel“ und „Technik“
Wenn        ich die Urlaubsseite öffne
Dann        stehen die drei Taschen als Spalten nebeneinander, Kopf und Fortschritt darüber
```

**AC-019 — Ohne Packliste**

```gherkin
Angenommen  die Abwesenheit „Dienstreise Hamburg“ hat keine Reisetaschen
Wenn        ich sie in „Abwesenheiten“ öffne
Dann        steht unter dem Kopf „Noch keine Packliste“ mit „+ Reisetasche hinzufügen“
```

### REQ-004 — Packen mit Sammel-Fenster, auch ohne Netz

> Packstücke hakt man ab wie überall (Spec 0005); 2 Sekunden nach dem letzten Tipp gleiten gepackte
> in „Gepackt (n)“ am Ende ihrer Tasche, eingeklappt. Das geht auch ohne Netz und folgt „Abhaken
> gewinnt“.

**Offline:** offline vollständig über die Laden-Warteschlange (D34, Nachtrag zu ADR-0008).

**AC-020 — Packen**

```gherkin
Angenommen  im Abschnitt „Strand“ sind 6 von 9 Packstücken offen, darunter „Badehose 2×“, und
            „Gepackt (3)“ ist eingeklappt
Wenn        ich auf den Haken bei „Badehose“ tippe
Dann        ist „Badehose“ durchgestrichen und bleibt an ihrer Stelle
Und         2 Sekunden nach dem letzten Tipp gleitet sie in „Gepackt (4)“, der Zähler zeigt
            „Strand 4/9“, und der Fortschritt oben steigt um eins
```

**AC-021 — Zurücknehmen**

```gherkin
Angenommen  „Badehose“ steht unter „Gepackt (4)“
Wenn        ich „Gepackt (4)“ aufklappe und den Haken bei „Badehose“ entferne
Dann        steht „Badehose“ 2 Sekunden später wieder bei den offenen Packstücken von „Strand“
```

**AC-022 — Ohne Netz**

```gherkin
Angenommen  Nadjas Handy hat in der Ferienwohnung kein Netz
Wenn        sie fünf Packstücke abhakt, die App schließt und später mit Netz wieder öffnet
Dann        zeigte ihr Gerät die fünf die ganze Zeit als gepackt
Und         nach dem Abgleich sind die fünf auch auf Enricos Gerät gepackt
```

**AC-023 — Abhaken gewinnt**

```gherkin
Angenommen  „Ladekabel“ ist gepackt, Enricos Gerät ist offline
Wenn        Enrico den Haken bei „Ladekabel“ entfernt
Und         Nadja „Ladekabel“ inzwischen online erneut gepackt hat
Und         Enricos Gerät wieder online ist
Dann        bleibt „Ladekabel“ gepackt
```

**AC-024 — Inzwischen entfernt**

```gherkin
Angenommen  Enrico packt offline „Kopfhörer“, Nadja entfernt „Kopfhörer“ online aus der Packliste
Wenn        Enrico wieder online ist
Dann        ist „Kopfhörer“ aus der Packliste verschwunden, und es erscheint kein Fehler
```

**AC-025 — Fremder Haushalt und abgemeldet**

```gherkin
Angenommen  ein Packstück der Packliste „Urlaub Mallorca“ von „Enrico & Nadja“
Wenn        ein Mitglied eines anderen Haushalts oder ein abgemeldeter Aufruf es über die
            Supabase-API als gepackt oder nicht gepackt markieren will
Dann        wird das abgelehnt, und das Packstück bleibt, wie es war
```

### REQ-005 — Alles einpacken

> „Alles einpacken“ (⋯ am Abschnitt) packt alle offenen Packstücke einer Tasche auf einmal; danach
> gibt es 5 Sekunden „Rückgängig“.

**Offline:** offline vollständig (Annahme, Offene Frage 1) — es ändert nur „gepackt“, je Packstück
nach „Abhaken gewinnt“.

**AC-026 — Alles einpacken und Rückgängig**

```gherkin
Angenommen  „Kulturbeutel“ hat 9 Packstücke, 7 offen und 2 gepackt
Wenn        ich bei „Kulturbeutel“ ⋯ → „Alles einpacken“ wähle
Dann        stehen alle 9 unter „Gepackt (9)“, der Zähler zeigt „Kulturbeutel 9/9“
Und         ein Hinweis bietet 5 Sekunden „Rückgängig“
Wenn        ich „Rückgängig“ tippe
Dann        sind genau die 7 wieder offen, und die 2 vorher gepackten bleiben gepackt
```

**AC-027 — Ohne Netz (Annahme, Offene Frage 1)**

```gherkin
Angenommen  Nadjas Handy ist offline, „Kulturbeutel“ hat 7 offene Packstücke
Wenn        sie „Alles einpacken“ wählt und später wieder Netz hat
Dann        sind die 7 auch auf Enricos Gerät gepackt
```

### REQ-006 — Für die Rückreise zurücksetzen

> „Für die Rückreise zurücksetzen“ (⋯ oben) nimmt nach einer Bestätigung alle Haken der Packliste
> auf einmal weg.

**Offline:** offline vollständig (Annahme, Offene Frage 1) — genau dafür ist es da: in der
Ferienwohnung ohne Netz.

**AC-028 — Zurücksetzen**

```gherkin
Angenommen  „Urlaub Mallorca“ zeigt „30 von 30 gepackt“
Wenn        ich ⋯ → „Für die Rückreise zurücksetzen“ wähle
Dann        fragt ein Dialog „Alle 30 Haken entfernen?“ mit „Zurücksetzen“ und „Abbrechen“
Wenn        ich „Zurücksetzen“ wähle
Dann        zeigt die Packliste „0 von 30 gepackt“, und alle Packstücke stehen offen in ihren Taschen
```

**AC-029 — Abbrechen**

```gherkin
Angenommen  der Dialog „Alle 30 Haken entfernen?“ ist offen
Wenn        ich „Abbrechen“ wähle
Dann        bleiben alle 30 gepackt
```

**AC-030 — Ohne Netz, Abhaken gewinnt (Annahme, Offene Frage 1)**

```gherkin
Angenommen  Enricos Gerät ist offline und zeigt 30 von 30 gepackt
Und         Nadja hat „Reisepass“ inzwischen online erneut gepackt
Wenn        Enrico zurücksetzt und später wieder Netz hat
Dann        sind 29 Packstücke offen, und „Reisepass“ bleibt gepackt
```

### REQ-007 — Packliste ergänzen und kürzen

> Auf der Urlaubsseite fügt man je Tasche Packstücke hinzu, kopiert weitere Reisetaschen dazu und
> entfernt Packstücke oder ganze Taschen; die Vorlage ändert sich nur über den Haken „auch in der
> Reisetasche speichern“.

**Offline:** nur online — Hinzufügen und Entfernen sind keine Laden-Aktion (D34); ohne Netz
ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“, Packen geht weiter.

**AC-031 — Packstück ergänzen**

```gherkin
Angenommen  die Packliste „Urlaub Mallorca“ hat den Abschnitt „Strand“ mit 4 von 9 gepackt
Wenn        ich bei „Strand“ „+ Packstück“ wähle und „Schnorchel“ eingebe
Dann        steht „Schnorchel“ offen am Ende von „Strand“, und der Zähler zeigt „Strand 4/10“
Und         die Reisetasche „Strand“ in Verwalten bleibt unverändert
```

**AC-032 — Auch in die Vorlage**

```gherkin
Angenommen  „Strand“ hängt an „Urlaub Mallorca“ und an „Sommerurlaub“
Wenn        ich in „Urlaub Mallorca“ bei „Strand“ „Schnorchel“ ergänze und „auch in der Reisetasche
            ‚Strand‘ speichern“ einschalte
Dann        steht „Schnorchel“ zusätzlich am Ende der Reisetasche „Strand“
Und         die Packliste „Sommerurlaub“ bleibt unverändert (D35)
```

**AC-033 — Reisetasche hinzufügen**

```gherkin
Angenommen  die Packliste „Urlaub Mallorca“ (7 Tage) hat „Strand“, nicht aber „Kleidung“ mit 6
            Packstücken, darunter „Socken · 1 je Tag“
Wenn        ich „+ Reisetasche hinzufügen“ wähle
Dann        stehen alle Reisetaschen außer „Strand“ zur Wahl
Wenn        ich „Kleidung“ wähle
Dann        kommt der Abschnitt „Kleidung“ mit 6 offenen Packstücken dazu, „Socken“ mit „7×“
```

**AC-034 — Tasche aus der Packliste entfernen**

```gherkin
Angenommen  die Packliste hat den Abschnitt „Technik“ mit 6 Packstücken, 2 davon gepackt
Wenn        ich bei „Technik“ ⋯ → „Aus der Packliste entfernen“ wähle
Dann        verschwindet der Abschnitt mit allen 6 Packstücken, ein Hinweis bietet 5 Sekunden
            „Rückgängig“
Und         die Reisetasche „Technik“ in Verwalten bleibt
```

**AC-035 — Packstück entfernen**

```gherkin
Angenommen  im Abschnitt „Strand“ steht „Schnorchel“
Wenn        ich auf dem Handy auf „Schnorchel“ nach links wische (am Desktop: ⋯ → „Entfernen“)
Dann        verschwindet „Schnorchel“, und ein Hinweis bietet 5 Sekunden „Rückgängig“
```

**AC-036 — Offline**

```gherkin
Angenommen  das Gerät ist offline
Wenn        ich die Urlaubsseite öffne
Dann        sind „+ Packstück“, „+ Reisetasche hinzufügen“, „Aus der Packliste entfernen“ und das
            Entfernen von Packstücken ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“
Und         die Haken lassen sich weiter setzen
```

### REQ-008 — Dauer ändern und Abwesenheit löschen

> Ändert sich die Dauer einer Abwesenheit, rechnet die App offene „je Tag“-Packstücke neu, gepackte
> bleiben; ändern sich die Personen, bleibt die Packliste erhalten; das Löschen einer Abwesenheit
> löscht ihre Packliste, und ein Dialog nennt sie.

**Offline:** nur online, wie Bearbeiten und Löschen der Abwesenheit selbst (Spec 0010).

**AC-037 — Dauer ändern**

```gherkin
Angenommen  „Urlaub Mallorca“ geht vom 1. bis 7.1.2027; „T-Shirts 7×“ ist offen, „Socken 7×“ ist
            gepackt, beide „1 je Tag“; „Badehose 2×“ ist offen
Wenn        ich das Ende auf Di 5.1.2027 ändere und speichere
Dann        zeigt die Packliste „T-Shirts 5×“, „Socken 7×“ (weiter gepackt) und „Badehose 2×“
```

**AC-038 — Abwesenheit löschen** (ändert Spec 0010, AC-037, für Abwesenheiten mit Packliste)

```gherkin
Angenommen  „Urlaub Mallorca“ hat eine Packliste mit 30 Packstücken
Wenn        ich auf der Urlaubsseite ⋯ → „Abwesenheit löschen“ wähle
Dann        nennt der Dialog „Die Packliste mit 30 Packstücken wird mit gelöscht.“
Wenn        ich bestätige
Dann        sind Abwesenheit und Packliste weg, auch auf Nadjas Gerät
Und         die Reisetaschen in Verwalten bleiben unverändert
Wenn        ich „Urlaub Mallorca“ stattdessen auf der Seite „Abwesenheiten“ lösche
Dann        erscheint derselbe Dialog statt des Hinweises mit „Rückgängig“
Und         eine Abwesenheit ohne Packliste löscht die Seite weiter mit 5 Sekunden „Rückgängig“
```

**AC-039 — Personen ändern (Annahme, Offene Frage 4; Spec 0010, REQ-010 verweist hierher)**

```gherkin
Angenommen  Enrico ist vom 1. bis 7.1.2027 allein abwesend, seine Packliste hat 21 Packstücke,
            davon 5 gepackt
Wenn        ich die Abwesenheit bearbeite, Nadja dazu wähle und speichere, sodass sie für den ganzen
            Haushalt gilt (Spec 0010, AC-036)
Dann        hat die Abwesenheit des Haushalts dieselbe Packliste mit 21 Packstücken, davon 5 gepackt
Wenn        ich danach Enrico abwähle, sodass nur Nadjas Abwesenheit bleibt
Dann        bleibt die Packliste bei Nadjas Abwesenheit
```

**AC-040 — Offline gepackt, inzwischen gelöscht**

```gherkin
Angenommen  Enrico packt offline drei Packstücke von „Urlaub Mallorca“, Nadja löscht die
            Abwesenheit online
Wenn        Enrico wieder online ist
Dann        ist „Urlaub Mallorca“ samt Packliste auch bei ihm verschwunden, und es erscheint kein
            Fehler
```

**AC-041 — Fremder Haushalt**

```gherkin
Angenommen  die Abwesenheit „Urlaub Mallorca“ von „Enrico & Nadja“ mit Packliste
Wenn        ein Mitglied eines anderen Haushalts sie über die Supabase-API löschen oder ihre Dauer
            ändern will
Dann        wird das abgelehnt, und Abwesenheit und Packliste bleiben unverändert
```

### REQ-009 — Karte auf der „Übersicht“ und Taschen-Symbol im Kalender

> Die „Übersicht“ zeigt unten, nach „Einkauf“, je Packliste eine Karte mit Fortschritt, wenn die
> gezeigte Woche einen Tag der Abwesenheit enthält oder sie in den 7 Tagen nach dem gezeigten Tag
> beginnt (D33); im Kalender trägt ein Abwesenheits-Streifen mit Packliste ein Taschen-Symbol.

**Offline:** offline vollständig — nur Anzeige.

**AC-042 — Ab 7 Tagen vorher**

```gherkin
Angenommen  „Urlaub Mallorca“ geht von Mo 30.11. bis Fr 4.12.2026 und hat eine Packliste mit 12
            von 30 gepackt; heute ist Mo 16.11.2026
Wenn        ich die „Übersicht“ öffne
Dann        gibt es keine Karte „Reisetasche“
Wenn        ich in die nächste Woche blättere und Mo 23.11. wähle
Dann        steht unten nach „Einkauf“ die Karte „Reisetasche · Urlaub Mallorca“ mit Balken,
            „12/30 gepackt ›“ und „beginnt in 7 Tagen“
```

**AC-043 — Woche mit Urlaubstag**

```gherkin
Angenommen  dieselbe Packliste
Wenn        ich auf der „Übersicht“ in KW 49 Samstag, 5.12., wähle
Dann        steht die Karte da, weil KW 49 Urlaubstage enthält
Wenn        ich in KW 50 Montag, 7.12., wähle
Dann        gibt es keine Karte
```

**AC-044 — Alles gepackt und Tipp**

```gherkin
Angenommen  die Packliste „Urlaub Mallorca“ ist vollständig gepackt, und die Karte ist zu sehen
Dann        steht auf der Karte „alles gepackt ✓“
Wenn        ich auf die Karte tippe
Dann        öffnet sich die Urlaubsseite „Urlaub Mallorca“
```

**AC-045 — Mehrere und keine Packliste**

```gherkin
Angenommen  Enrico (1.–4.1.2027) und Nadja (1.–7.1.2027) haben je eine Abwesenheit mit Packliste
Und         Nadjas „Dienstreise Hamburg“ am 28. und 29.12.2026 hat keine Packliste
Wenn        ich auf der „Übersicht“ Montag, 28.12.2026, wähle
Dann        stehen zwei Karten „Reisetasche“, je eine für Enricos und Nadjas Packliste
Und         für „Dienstreise Hamburg“ gibt es keine Karte
```

**AC-046 — Taschen-Symbol im Kalender**

```gherkin
Angenommen  „Urlaub Mallorca“ hat eine Packliste, „Dienstreise Hamburg“ nicht
Wenn        ich den Kalender in einer Woche mit beiden Abwesenheiten öffne
Dann        trägt der Streifen „Urlaub Mallorca“ ein Taschen-Symbol, der Streifen „Dienstreise
            Hamburg“ nicht
Wenn        ich auf den Streifen „Urlaub Mallorca“ tippe
Dann        öffnet sich seine Urlaubsseite
```

## Offline und Konflikte

Lesen geht offline aus dem lokalen Speicher (Spec 0003). Packen ist die einzige Offline-Aktion
dieser Spec und läuft über die Laden-Warteschlange; alles andere braucht Netz und ist ohne Netz
ausgegraut. Bis der Server bestätigt, zeigt das Gerät seinen eigenen Stand (Überlagerung, ADR-0011).

| Fall                                                                   | Regel                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Packen und Zurücknehmen offline                                        | Laden-Warteschlange, „Abhaken gewinnt“ wie beim Einkaufsposten (`sync.md`); hin und her Getipptes wird zum Endzustand zusammengefasst |
| „Alles einpacken“ und „Zurücksetzen“ offline (Annahme, Offene Frage 1) | je Packstück dieselbe Regel; ein Packstück, das jemand anderes seit dem letzten Abgleich neu gepackt hat, bleibt gepackt              |
| Packstück, Tasche oder Abwesenheit inzwischen entfernt                 | die Aktion wird verworfen, ohne Fehler (wie Spec 0003, AC-025)                                                                        |
| Dauer geändert, während jemand offline packt                           | offene „je Tag“-Packstücke bekommen die neue Anzahl; ein danach gepacktes Stück behält sie                                            |
| Zwei Personen ergänzen gleichzeitig dasselbe Packstück                 | es entstehen zwei Zeilen; Packstücke sind Freitext und werden nicht zusammengeführt                                                   |
| Zwei Personen bearbeiten dieselbe Reisetasche                          | letzte Änderung gewinnt je Feld; die Reihenfolge gilt je Packstück (Abweichung, Offene Frage 6)                                       |
| Abmelden mit ungesendeten Haken                                        | Speicher und Warteschlange werden gelöscht, die Haken gehen verloren (Regel aus `sync.md`)                                            |

## Plattformen

- **Handy:** Urlaubsseite einspaltig, Taschen untereinander; Wischen nach links entfernt ein
  Packstück. Eine Reisetasche öffnet sich als Seite unter „Verwalten“, mit Tab-Leiste.
- **Tablet und Desktop:** „Reisetaschen“ als Liste und Detail; die Urlaubsseite zeigt die Taschen
  als Spalten. Entfernen über ⋯ statt Wischen.
- **Web und PWA:** Packen ohne Netz setzt voraus, dass die App-Hülle offline startet (Service
  Worker, Spec 0003) und die Warteschlange ein Neuladen übersteht.
- **Barrierefreiheit:** Sortieren geht auch ohne Ziehen („Nach oben“, „Nach unten“ für Screenreader
  und Tastatur); der Screenreader sagt „Badehose gepackt“. Mit „Bewegung reduzieren“ werden Zeilen
  nur ausgeblendet.

## Daten

- **Neue Tabellen** (Konzept 4.8), jede mit `household_id`, Row Level Security, Grants,
  pgTAP-Isolationstest, vom Server gesetztem `updated_at`, Lösch-Trigger und Sync (Regel 5):
  - _Reisetaschen:_ Name (eindeutig je Haushalt), optional „für“ ein Mitglied, Reihenfolge.
  - _Packstücke einer Reisetasche:_ Tasche, Name, Anzahl (optional), „je Tag“, Reihenfolge.
  - _Packstücke einer Packliste:_ Abwesenheit, Herkunftstasche (leer, wenn die Vorlage gelöscht
    wird), Name der Tasche und Mitglied als Kopie, Name, ausgerechnete Anzahl, „je Tag“ mit der
    Anzahl je Tag, gepackt (ja/nein, wann, von wem, Zähler wie beim Einkaufsposten), Reihenfolge.
  - **Geändert am 21.11.2026 (Plan, Entscheidung 2; Offene Frage 5):** Abwesenheit,
    Herkunftstasche, Name der Tasche und Mitglied als Kopie stehen nicht an jedem Packstück, sondern
    einmal je angehängter Tasche in einer vierten Tabelle _Taschen der Packliste_, mit Reihenfolge;
    die Packstücke der Packliste zeigen darauf. Für sie gilt dasselbe wie oben.
- **Eine RPC je Aktion, eine Transaktion:** Abwesenheit mit Packliste speichern, Tasche hinzufügen,
  Alles einpacken, Zurücksetzen, Dauer ändern.
- **Gelöscht:** Abwesenheit löschen löscht ihre Packliste. Reisetasche löschen lässt Packlisten
  unberührt. Tasche aus der Packliste entfernen löscht deren Packstücke dieser Packliste.
- **Personenbezogen:** „für“ eine Person und wer wann gepackt hat. Verlässt eine Person den
  Haushalt, wird der Verweis geleert, wie bei anderen Verweisen auf Mitglieder; die Tasche gilt dann
  für alle.
- **Bestehende Daten:** nichts zu migrieren.

## Offene Fragen

| #   | Frage                                                                                                                                                                       | Optionen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Empfehlung                                                                                                       | Status                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Gehen „Alles einpacken“ und „Für die Rückreise zurücksetzen“ auch ohne Netz? D34 nennt das Abhaken, Konzept 4.8 nur „gepackt / nicht gepackt“.                              | A: ja, beide über die Laden-Warteschlange, je Packstück „Abhaken gewinnt“ — Pro: Zurücksetzen in der Ferienwohnung ohne Netz geht (Begründung von D34); nur „gepackt“ ändert sich; Contra: Der ADR-Nachtrag umfasst eine Sammel-Aktion · B: nur online — Pro: kleinerer Nachtrag; Contra: Ohne Netz am Urlaubsort lässt sich die Rückreise nicht packen                                                                                                                                                                                                                                                                             | A, weil genau dieser Fall der Grund für D34 ist                                                                  | OFFEN, Annahme A                                                                                                                  |
| 2   | Mehrere Einzel-Abwesenheiten aus einem Speichern (geht nur bei drei oder mehr Mitgliedern, D23): Welche Taschen gehen wohin, und was öffnet ein zusammengefasster Streifen? | A: Eine Tasche „für“ eine gewählte Person geht nur in deren Packliste, alle anderen Taschen in jede Packliste; ein Streifen, der mehrere Abwesenheiten zusammenfasst, öffnet eine Urlaubsseite mit ihren Packlisten untereinander, je mit Avatar · B: Jede Packliste bekommt alle gewählten Taschen; der Streifen öffnet zuerst eine Auswahl der Person                                                                                                                                                                                                                                                                             | A, weil niemand die Tasche einer anderen Person packt; im Haushalt mit zwei Mitgliedern tritt der Fall nicht auf | OFFEN, Annahme A                                                                                                                  |
| 3   | Kleinigkeiten, die das Konzept offenlässt                                                                                                                                   | A: Duplizieren heißt „Strand (Kopie)“, bei Bedarf „Strand (Kopie 2)“; Anzahl ist eine ganze Zahl ab 1, „je Tag“ beginnt mit 1; Packstücke stehen in der Reihenfolge der Vorlage, Ergänztes am Ende der Tasche; nie benutzte Taschen stehen im Abwesenheit-Fenster in der Reihenfolge der Seite „Reisetaschen“; ein Haken geht wie beim Einkaufsposten sofort beim Tipp in die Laden-Warteschlange, das Sammel-Fenster regelt nur die Anzeige (Spec 0005, REQ-005: das legt die einsetzende Spec fest) · B: anders festlegen                                                                                                         | A, weil es das Gewohnte aus Liste und Verwalten fortsetzt                                                        | OFFEN, Annahme A                                                                                                                  |
| 4   | Was passiert mit Packlisten, wenn das Bearbeiten nach D23 Abwesenheiten ersetzt (Spec 0010, AC-036: einzelne Person wird ganzer Haushalt oder umgekehrt)?                   | A: Die Packliste zieht mit zu der Abwesenheit, die an ihre Stelle tritt; fallen mehrere zusammen, stehen ihre Taschen nebeneinander in einer Packliste; entfällt eine Person ganz, nennt der Dialog ihre Packliste, die mit gelöscht wird — Pro: nichts Gepacktes geht still verloren; Contra: das Speichern der Abwesenheit wird aufwendiger · B: Solange eine Packliste besteht, lässt sich „Wer?“ nicht ändern — Pro: einfach; Contra: Wer jemanden vergessen hat, muss die Abwesenheit samt Packliste neu anlegen                                                                                                               | A, weil „Wer?“ zu korrigieren alltäglich ist und Packfortschritt nicht verloren gehen darf                       | OFFEN, Annahme A                                                                                                                  |
| 5   | Wo stehen Name der Tasche und Mitglied einer Packliste? (beim Planen aufgekommen, 21.11.2026)                                                                               | A: eigene Tabelle „Taschen der Packliste“ (eine Zeile je angehängter Tasche: Abwesenheit, Herkunftstasche, Name und Mitglied als Kopie, Reihenfolge), Packstücke zeigen darauf — Pro: „Aus der Packliste entfernen“ ist eine Löschung, die Reihenfolge der Taschen ist ein Feld, ein leerer Abschnitt bleibt stehen, zwei gleichnamige Taschen bleiben getrennt; Contra: eine vierte Tabelle mit allem, was dazugehört · B: Kopien an jedem Packstück, wie in „Daten“ zuerst beschrieben — Pro: drei Tabellen; Contra: Entfernen einer Tasche sind viele Löschungen (über der Grenze je Aufruf), Gruppieren über Namen ist unscharf | A, weil Entfernen und Rückgängig dann je eine Zeile betreffen                                                    | OFFEN, Annahme A                                                                                                                  |
| 6   | Kleinigkeiten, die beim Planen festgelegt wurden (21.11.2026)                                                                                                               | A: Zwei gleichzeitige Umsortierungen derselben Reisetasche dürfen sich mischen (Reihenfolge je Zeile, nicht als ein Feld; das Ergebnis ist immer eine gültige Reihenfolge); die Karte auf der „Übersicht“ zählt „beginnt in n Tagen“ ab dem gezeigten Tag (AC-042), die Urlaubsseite ab heute (AC-016); während der Abwesenheit steht „läuft bis Do 7.1.“, danach „vorbei“; der Abschnitt „Reisetaschen“ im Abwesenheit-Fenster erscheint nur beim Eintragen; höchstens 100 Packstücke je Reisetasche · B: anders festlegen                                                                                                         | A, weil es die Spec ohne zusätzliches Feld und ohne zweiten Weg zum Ergänzen umsetzt                             | entschieden (21.11.2026, Task 12): A; die Reihenfolge je Packstück statt als ein Feld ist eine hingenommene Abweichung von AC-006 |

## Rückverfolgbarkeit

Stand 21.11.2026, nach Task 12. „E2E (Endwelle)“: die Bedienung ist im Klick-Durchlauf belegt
(Bildschirmfotos in `tmp/0012/`) und kommt in die volle e2e-Suite am Ende aller Wellen;
`pnpm e2e:dev` (`e2e/dev/smoke.spec.ts`) prüft die genannten Teile schon jetzt. Dateien ohne Pfad
liegen in `packages/core/src` (core), `packages/api/src` (api), `packages/ui/src` (ui) oder
`supabase/tests` (pgTAP).

| REQ     | AC     | Task (plan.md)    | Test                                                                                                                                                                                                                                                                                                   |
| ------- | ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REQ-001 | AC-001 | 3, 6, 8           | core `packing.test.ts` (`bagSummary`), api `seed/demo.test.ts`; E2E (Endwelle) `tmp/0012/t8-*-list.png`; e2e:dev öffnet „Reisetaschen“                                                                                                                                                                 |
| REQ-001 | AC-002 | 6, 8              | api `seed/demo.test.ts` (Haushalt „Test“ ohne Reisetaschen); E2E (Endwelle) `tmp/0012/t8-*-empty.png`                                                                                                                                                                                                  |
| REQ-001 | AC-003 | 3, 6, 8           | core `packing.test.ts` (`parsePackingLine`), api `commands-packing.backend.test.ts`; E2E (Endwelle) `tmp/0012/t8-*-new-bag.png`                                                                                                                                                                        |
| REQ-001 | AC-004 | 3, 8              | core `packing.test.ts` (`packingItemLabel`); E2E (Endwelle) `tmp/0012/t8-*-per-day.png`, `t8-*-item-sheet.png`                                                                                                                                                                                         |
| REQ-001 | AC-005 | 3, 8              | core `packing.test.ts` (`packingNameSuggestions`), api `seed/demo.test.ts`; E2E (Endwelle) `tmp/0012/t8-*-suggestions.png`; e2e:dev (Vorschlag beim Tippen)                                                                                                                                            |
| REQ-001 | AC-006 | 1, 3, 5, 6, 8     | core `packing.test.ts` (`moveInOrder`), api `transport-fake.test.ts`; E2E (Endwelle) `tmp/0012/t8-*-reordered.png`. Abweichung: Reihenfolge je Packstück, nicht als ein Feld (Offene Frage 6, entschieden)                                                                                             |
| REQ-001 | AC-007 | 1, 3, 6, 8        | pgTAP `packing_tables.test.sql` (23505, 23514), core `packing.test.ts` (`validateBagName`); E2E (Endwelle) `tmp/0012/t8-*-name-taken.png`, `t8-*-name-missing.png`                                                                                                                                     |
| REQ-001 | AC-008 | 3, 6, 8           | core `packing.test.ts` (`copyName`, `duplicateBag`), api `commands-packing.backend.test.ts`; E2E (Endwelle) `tmp/0012/t8-*-duplicate.png`                                                                                                                                                              |
| REQ-001 | AC-009 | 1, 5, 6, 8        | pgTAP `packing_tables.test.sql` (4 von 9 bleiben), api `commands-packing.backend.test.ts` (Rückgängig verknüpft neu), `changes.test.ts`; E2E (Endwelle) `tmp/0012/t8-*-deleted.png`                                                                                                                    |
| REQ-001 | AC-010 | 1, 2              | pgTAP `packing_tables.test.sql` (`tests.tenant_isolation` je Tabelle, 23503 je Verweis, `anon`), `packing_rpcs.test.sql`                                                                                                                                                                               |
| REQ-002 | AC-011 | 1, 2, 3, 6, 10    | pgTAP `packing_tables.test.sql` (7×), `packing_rpcs.test.sql` (21 Packstücke in einem Aufruf), core `packing.test.ts` (`planPackingLists`, `saveLabel`), api `commands-household.backend.test.ts`; E2E (Endwelle) `tmp/0012/t10/t10-*-1-fenster-reisetaschen.png`, `t10-*-2-zwei-taschen-gewaehlt.png` |
| REQ-002 | AC-012 | 3, 6, 10          | core `packing.test.ts` (`bagChipOrder`, `saveLabel`), api `commands-household.backend.test.ts`, `seed/demo.test.ts`; E2E (Endwelle) `tmp/0012/t10/t10-*-1-fenster-reisetaschen.png`; e2e:dev (Chips, Knopftext)                                                                                        |
| REQ-002 | AC-013 | 3, 10             | core `packing.test.ts` (`findBagByName`), api `seed/demo.test.ts`; E2E (Endwelle) `tmp/0012/t10/t10-*-8-neue-tasche.png`; e2e:dev („+ Neue“)                                                                                                                                                           |
| REQ-002 | AC-014 | 1, 3, 6           | pgTAP `packing_tables.test.sql` (4×), core `packing.test.ts`, api `transport-fake.test.ts`                                                                                                                                                                                                             |
| REQ-002 | AC-015 | 2, 6, 10          | pgTAP `packing_rpcs.test.sql` (nichts gespeichert), api `commands-household.backend.test.ts` (abgelehnt, Hinweis); E2E (Endwelle) `tmp/0012/t10/t10-*-9-serverfehler.png`                                                                                                                              |
| REQ-003 | AC-016 | 3, 9, 10          | core `packing.test.ts` (`tripHeader`, `startsInLabel`, `packingProgress`, `packingSections`); E2E (Endwelle) `tmp/0012/t9/t9-phone-1-aufbau.png`, `tmp/0012/t10/t10-*-3-streifen-mit-tasche.png`, `t10-*-4-urlaubsseite.png`; e2e:dev (Kopf, Fortschritt)                                              |
| REQ-003 | AC-017 | 3, 9              | core `packing.test.ts` (`packingProgress` zählt Packstücke), api `transport-fake.test.ts`                                                                                                                                                                                                              |
| REQ-003 | AC-018 | 9                 | E2E (Endwelle) `tmp/0012/t9/t9-desktop-1-spalten.png`, `tmp/0012/t12/pwa/b4-1440-*.png`                                                                                                                                                                                                                |
| REQ-003 | AC-019 | 3, 9              | core `packing.test.ts`; E2E (Endwelle) `tmp/0012/t9/t9-phone-12-ohne-packliste.png`, `tmp/0012/t10/t10-*-10-hamburg-ohne-tasche.png`                                                                                                                                                                   |
| REQ-004 | AC-020 | 2, 4, 5, 7, 9     | pgTAP `packing_rpcs.test.sql`, api `commands-packing.backend.test.ts`, core `packing.test.ts`, ui `check-window.test.ts`; E2E (Endwelle) `tmp/0012/t9/t9-phone-2-gepackt-durchgestrichen.png`; e2e:dev (Haken → „Gepackt (5)“)                                                                         |
| REQ-004 | AC-021 | 4, 7, 9           | core `store-queue.test.ts`, ui `check-window.test.ts` („keep in done“), `disclosure-state.test.ts`, pgTAP `packing_rpcs.test.sql`; E2E (Endwelle) `tmp/0012/t11/t11-*-11-ausgepackt-in-gruppe.png`                                                                                                     |
| REQ-004 | AC-022 | 4, 5, 9, 12       | core `store-queue.test.ts`, api `packing.integration.test.ts`; PWA neu laden ohne Netz `tmp/0012/t12/pwa/` (Task 12); E2E (Endwelle) `tmp/0012/t9/t9-phone-5-offline-fuenf-gepackt.png`, `t9-phone-7-zweites-geraet.png`                                                                               |
| REQ-004 | AC-023 | 2, 4, 5           | pgTAP `packing_rpcs.test.sql` (Regeltabelle), core `store-queue.test.ts`, api `backend.test.ts`, `packing.integration.test.ts`                                                                                                                                                                         |
| REQ-004 | AC-024 | 2, 4, 5           | pgTAP `packing_rpcs.test.sql`, core `store-queue.test.ts`, `packing-actions.test.ts`, api `backend.test.ts`                                                                                                                                                                                            |
| REQ-004 | AC-025 | 2                 | pgTAP `packing_rpcs.test.sql` (`not_member`, fremde Kennung, `anon`)                                                                                                                                                                                                                                   |
| REQ-005 | AC-026 | 2, 4, 6, 9        | pgTAP `packing_rpcs.test.sql`, core `packing-actions.test.ts`, `store-queue.test.ts`, api `backend.test.ts`, `commands-packing.backend.test.ts`; E2E (Endwelle) `tmp/0012/t9/t9-phone-6-alles-einpacken-offline.png`; e2e:dev (⋯ „Alles einpacken“)                                                    |
| REQ-005 | AC-027 | 4, 6, 12          | core `packing-actions.test.ts`, api `commands-packing.backend.test.ts` („AC-027: … the other device sees all seven packed“, Task 12), `packing.integration.test.ts` (Schritt AC-027, Task 12), `backend.test.ts` (Security-Check: 503 während einer Folge)                                             |
| REQ-006 | AC-028 | 2, 4, 6, 9        | core `packing-actions.test.ts`, api `commands-packing.backend.test.ts`; E2E (Endwelle) `tmp/0012/t9/t9-phone-10-zuruecksetzen-dialog.png`                                                                                                                                                              |
| REQ-006 | AC-029 | 9, 12             | e2e:dev `e2e/dev/smoke.spec.ts` („Abbrechen“: Dialog weg, „7 von 21 gepackt“ und „Gepackt (5)“ unverändert; Task 12)                                                                                                                                                                                   |
| REQ-006 | AC-030 | 2, 4, 5, 6        | pgTAP `packing_rpcs.test.sql`, core `packing-actions.test.ts`, api `commands-packing.backend.test.ts`, `packing.integration.test.ts`                                                                                                                                                                   |
| REQ-007 | AC-031 | 3, 6, 9           | core `packing.test.ts`, api `commands-packing.backend.test.ts`; E2E (Endwelle) `tmp/0012/t9/t9-phone-8-packstueck-fenster.png`                                                                                                                                                                         |
| REQ-007 | AC-032 | 3, 6, 9           | core `packing.test.ts`, api `commands-packing.backend.test.ts`; E2E (Endwelle) `tmp/0012/t9/t9-phone-14-vorlage-strand.png`                                                                                                                                                                            |
| REQ-007 | AC-033 | 3, 6, 9           | core `packing.test.ts` (`addableBags`), api `transport-fake.test.ts`, `seed/demo.test.ts`; E2E (Endwelle) `tmp/0012/t9/t9-phone-9-reisetasche-hinzufuegen.png`                                                                                                                                         |
| REQ-007 | AC-034 | 2, 6, 9           | pgTAP `packing_rpcs.test.sql` (`restore_packing_items`), api `commands-packing.backend.test.ts`; E2E (Endwelle) `tmp/0012/t9/`                                                                                                                                                                         |
| REQ-007 | AC-035 | 2, 6, 9           | pgTAP `packing_rpcs.test.sql`, api `commands-packing.backend.test.ts`; E2E (Endwelle) `tmp/0012/t9/t9-desktop-2-zeilen-menue.png`, `tmp/0012/t11/t11-*-10-zeile-menue.png`                                                                                                                             |
| REQ-007 | AC-036 | 6, 8, 9, 10       | api `commands-household.backend.test.ts`, `transport-fake.test.ts` (`OfflineError`); E2E (Endwelle) `tmp/0012/t8-*-offline-*.png`, `tmp/0012/t9/t9-phone-4-offline-menue.png`, `tmp/0012/t10/t10-*-12-offline-abwesenheiten.png`, `tmp/0012/t11/t11-*-9-offline-reisetasche.png`                       |
| REQ-008 | AC-037 | 1, 3, 6, 10       | pgTAP `packing_tables.test.sql` (offen 5×, gepackt 7×), core `packing.test.ts` (`recalcPerDay`), api `commands-household.backend.test.ts`; E2E (Endwelle) `tmp/0012/t10/t10-*-5-dauer-geaendert.png`                                                                                                   |
| REQ-008 | AC-038 | 1, 3, 5, 6, 9, 10 | pgTAP `packing_tables.test.sql` (Kaskade, Grabsteine), core `packing.test.ts` (`absenceDeleteDialog`), api `changes.test.ts`, `commands-packing.backend.test.ts`; E2E (Endwelle) `tmp/0012/t9/t9-phone-11-loeschen-dialog.png`, `tmp/0012/t10/t10-*-6-loeschen-dialog.png`                             |
| REQ-008 | AC-039 | 3, 6, 10          | core `absences.test.ts` (`planAbsenceWrite`), api `commands-household.backend.test.ts`                                                                                                                                                                                                                 |
| REQ-008 | AC-040 | 2, 4, 5           | pgTAP `packing_rpcs.test.sql`, core `store-queue.test.ts`, api `backend.test.ts`                                                                                                                                                                                                                       |
| REQ-008 | AC-041 | 1                 | pgTAP `packing_tables.test.sql`, api `transport-fake.test.ts`                                                                                                                                                                                                                                          |
| REQ-009 | AC-042 | 3, 11             | core `packing.test.ts` (`packingCards`); E2E (Endwelle) `tmp/0012/t11/t11-*-1-heute-keine-karte.png`, `t11-*-2-do-26-11-eine-karte.png`; e2e:dev (Karte eine Woche weiter)                                                                                                                             |
| REQ-009 | AC-043 | 3, 11             | core `packing.test.ts`; E2E (Endwelle) `tmp/0012/t11/t11-*-4-kw49-laeuft.png`, `t11-*-5-kw51-hamburg-keine-karte.png`                                                                                                                                                                                  |
| REQ-009 | AC-044 | 3, 11, 12         | core `packing.test.ts`; E2E (Endwelle) `tmp/0012/t11/t11-*-3-sa-28-11-zwei-karten.png`, `t11-*-7-urlaubsseite.png`; e2e:dev (Tipp, „‹ Übersicht“ zurück, Task 12)                                                                                                                                      |
| REQ-009 | AC-045 | 3, 11             | core `packing.test.ts`; E2E (Endwelle) `tmp/0012/t11/t11-*-3-sa-28-11-zwei-karten.png`, `t11-*-5-kw51-hamburg-keine-karte.png`                                                                                                                                                                         |
| REQ-009 | AC-046 | 3, 7, 10          | core `packing.test.ts` (`stripeHasPackingList`); E2E (Endwelle) `tmp/0012/t10/t10-*-3-streifen-mit-tasche.png`, `t10-*-11-monat.png`                                                                                                                                                                   |
