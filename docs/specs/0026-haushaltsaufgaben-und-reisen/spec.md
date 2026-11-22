---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-22
---

# 0026 — Haushaltsaufgaben: Termine, Später, Nachtragen und Reisen

Freigegeben von Claude im Auftrag von Enrico (22.11.2026): Enrico übernimmt alle Empfehlungen aus
`docs/product/review-logik-und-bedienung.md` und hat H-03 einzeln entschieden („Die Rotation
überspringt Reisende, feste Termine während einer Reise des ganzen Haushalts rücken auf den ersten
Tag danach, „Zu tun“ bleibt in der Zeit leer“). Seine eigenen Wünsche ER-32 und ER-33 stehen in
`docs/product/review-enrico-2026-11-22.md`. Offene Gestaltungsfragen hat Claude nach Enricos Regel
„Empfehlung nehmen“ entschieden (Abschnitt „Offene Fragen“).

## Problem

Den Termin einer Aufgabe kann man nicht selbst setzen. Eine neue Aufgabe „alle 6 Monate“ ist sofort
heute fällig, „Matratze drehen, zuletzt im August“ lässt sich nicht erfassen, und ein versehentliches
„Später“ ist nach dem Hinweis nicht mehr zurückzuholen. „Einmalig“ geht nur 14 Tage voraus, eine
einmalige Aufgabe ohne Datum taucht unter „Anstehend“ nie auf, und „Später“ kennt nur „morgen“.
Nachtragen geht nur bis vorgestern, und ein falsches Datum im Verlauf bleibt falsch. Der Verlauf ist
eine lange Liste ohne Filter.

Vor allem wissen die Aufgaben nichts von Reisen: Während „Urlaub Mallorca“ laufen alle Termine in
„fällig seit“ auf, und nach der Rückkehr ist die Liste voll. Wer auf Dienstreise ist, steht als
„dran“ da und bekommt keine Erinnerung, die Person zu Hause aber auch nicht.

Dazu kommen Texte, die sich widersprechen: „fällig seit 1 Tag“ auf der Übersicht, „fällig seit
gestern“ im Haushalt, „überfällig“ im Tagesüberblick; „ca. 5 Punkte“ auf der Übersicht und „ca. 2
Punkte“ im Haushalt für denselben Tag.

## Ziel

- Beim Anlegen und Bearbeiten sieht und setzt man „Nächstes Mal“; beim Anlegen optional „Zuletzt
  erledigt“. Keine neue Aufgabe ist heute fällig, ohne dass „heute“ im Formular steht.
- „Einmalig“ nimmt jeden Tag ab heute („Datum …“ mit Monatskalender), „Später“ bietet morgen,
  übermorgen, Wochenende und „Datum …“.
- Unter „Anstehend“ stehen auch einmalige Aufgaben ohne Termin; der Link „n weitere Aufgaben später –
  alle ansehen“ ist weg, alles Weitere steht unter „Alle“.
- Nachtragen geht bis 30 Tage zurück, und das Datum eines Verlaufseintrags lässt sich ändern. Der
  Verlauf lässt sich nach Person und Aufgabe filtern.
- Fälliges heißt überall gleich: „heute“, „fällig seit gestern“, „fällig seit 3 Tagen“, auch in den
  Benachrichtigungen. Die Punkte für heute sind auf Übersicht und Haushalt dieselbe Zahl.
- Reisen wirken auf Aufgaben: Ist niemand da, der eine Aufgabe erledigen kann, rückt ihr Termin auf
  den ersten Tag danach und zählt bis dahin nicht als fällig. Bei „Abwechselnd“ übernimmt die nächste
  Person, die zu Hause ist. Während einer Reise des ganzen Haushalts bleibt „Zu tun“ leer, und es
  kommt keine Erinnerung. App und Zeitplaner rechnen dabei dasselbe.

## Nicht-Ziele

- **Keine gespeicherte Verschiebung durch Reisen.** Die Wirkung einer Reise wird aus Reise und
  Aufgabe abgeleitet, nichts wird umgeschrieben; eine geänderte oder gelöschte Reise wirkt sofort.
- **Kein Nachholen von Runden.** Wer bei „Abwechselnd“ wegen einer Reise übersprungen wird, muss
  danach nichts nachholen, und niemand bekommt einen Ausgleich gutgeschrieben.
- **Keine Pause der flexiblen Uhr während einer Reise.** „Etwa alle 3 Tage Pflanzen gießen“ ist nach
  einer Woche Urlaub fällig, nicht erst drei Tage nach der Rückkehr.
- **Keine Statistik und keine Fairness-Anzeige** (wer wie viele Punkte gemacht hat).
- **Kein Offline-Schreiben.** Aufgaben anlegen, ändern, abhaken, nachtragen und verschieben bleibt
  nur online (ADR-0008); nur Lesen geht offline.
- **Keine neue Darstellung der Reise selbst.** Anlegen, Ändern und Anzeigen von Reisen (Fenster,
  Streifen, Ziehen im Kalender) ist Spec 0022; diese Spec bestimmt nur, was eine Reise mit Aufgaben
  macht, und den Satz dazu im Reise-Fenster.
- **Keine Adress-Parameter.** Welche Ansicht, welcher Filter und welche Aufgabe offen ist, steht nach
  Spec 0019 in der Adresse; die Namen legt diese Spec nicht fest.

## Konzept in Kürze

**Termin im Formular („Neue Aufgabe“ und „Aufgabe bearbeiten“)**

- **Einmalig:** Chips „Ohne Datum“ · „Datum …“ · „heute“ · „morgen“ · „Di 24.11.“ … (14 Tage wie
  bisher). „Datum …“ klappt unter den Chips den Monatskalender aus Spec 0016 auf (Baustein
  `MonthCalendar`); Tage vor heute sind nicht wählbar. Danach trägt der Chip das Datum („Di 16.3.“,
  in einem anderen Jahr „Di 16.3.2027“) und ist gewählt.
- **Wöchentlich, Monatlich, Alle n Monate, Flexibel:** unter dem Rhythmus die Zeile „Nächstes Mal“
  mit denselben Chips ohne „Ohne Datum“ (bei „Flexibel“: „Nächstes Mal etwa“). Vorausgewählt ist der
  Vorschlag aus dem Rhythmus; ändert man den Rhythmus, rückt der Vorschlag mit, solange man den Tag
  nicht selbst gewählt hat.
- **Nur beim Anlegen:** „Zuletzt erledigt (optional)“ mit „Datum …“; der Vorschlag für „Nächstes
  Mal“ rechnet dann ab diesem Tag.
- **Abwechselnd:** darunter „Als Nächstes dran“ mit einem Chip je Person.
- **Bei Bedarf:** kein Termin, Zuständigkeit startet mit „Egal“.

```
Handy, „Neue Aufgabe“ (Ausschnitt)            Desktop: gleiches Fenster, mittlere Größe
Rhythmus
[Einmalig] [Wöchentlich] [Monatlich] …
Nächstes Mal                      ← nur bei Rhythmen mit Termin
[Ohne Datum][Datum …][heute][morgen][Di 24.11.] → (wischbar)
┌ November 2026          ‹ › ┐    ← nach „Datum …“
│ Mo Di Mi Do Fr Sa So       │
│ …  ░░ ░░ ░░ ░░ ░░ 22       │    ░ = vor heute, nicht wählbar
└────────────────────────────┘
Zuständigkeit
[Fest] [Abwechselnd] [Egal] [Zu zweit]
Als Nächstes dran   [Enrico] [Nadja]
```

**Aufgabe geöffnet (Fenster bzw. rechte Spalte)**

```
Bad putzen
wöchentlich Fr · abwechselnd, dran: Nadja · 2 Punkte
Nächstes Mal Fr 11.12. · nach der Reise           ← wenn eine Reise den Termin verschiebt
Zuletzt Fr 27.11. (E)
[✓ Erledigt]  [Später ▾]  [Überspringen]          ← nicht passende Knöpfe fehlen ganz
Bearbeiten ›   Alle Einträge ›   Löschen
```

„Später ▾“ öffnet ein Menü: „Morgen · Mo 23.11.“, „Übermorgen · Di 24.11.“, „Am Wochenende · Sa
28.11.“, „Datum …“. Gewählt wird erst mit dem Tipp auf einen Eintrag; der Hinweis danach bietet 5
Sekunden „Rückgängig“, und den Termin kann man danach jederzeit unter „Bearbeiten“ zurücksetzen.

**Anstehend**

Abschnitte in dieser Reihenfolge: „Heute“, „Noch offen“ (fällig seit gestern oder länger),
„Flexibel“, „Diese Woche“, „Ohne Termin“. Darüber „Zu tun heute: ca. 5 Punkte“, dieselbe Zahl wie
auf der Übersicht. Den Link „n weitere Aufgaben später – alle ansehen“ gibt es nicht mehr; alles mit
späterem Termin steht unter dem Tab „Alle“.

**Reisen wirken auf Aufgaben (H-03)**

Eine Reise macht Tage „leer“ für bestimmte Personen. Für jede Aufgabe gilt eine Frage: **Ist an
diesem Tag jemand da, der sie erledigen kann?**

| Zuständigkeit | Wer kann sie erledigen                     | Termin rückt, wenn …                           |
| ------------- | ------------------------------------------ | ---------------------------------------------- |
| Fest          | die feste Person                           | diese Person reist                             |
| Abwechselnd   | jede Person der Reihenfolge, die da ist    | alle Personen der Reihenfolge reisen           |
| Egal          | jedes Mitglied, das da ist                 | der ganze Haushalt reist                       |
| Zu zweit      | nur alle Mitglieder gemeinsam              | mindestens ein Mitglied reist                  |

- **Termin rückt:** Fällt der Termin auf einen Tag, an dem niemand kann, gilt der erste Tag danach,
  an dem jemand kann. Gespeichert bleibt der alte Termin; die App zeigt „nach der Reise am Fr 11.12.“.
- **Bis dahin nicht fällig:** Die Aufgabe steht in der Zeit weder unter „Zu tun“ noch unter „Noch
  offen“; „fällig seit“ zählt ab dem neuen Tag.
- **Abwechselnd:** Reist die Person, die dran ist, ist die nächste Person der Reihenfolge dran, die
  da ist. Nach dem Erledigen geht es wie immer bei der Person nach der weiter, die erledigt hat. Die
  Reihenfolge ändert sich nie; wer übersprungen wurde, holt nichts nach.
- **Ganzer Haushalt:** An Tagen, an denen alle Mitglieder reisen, bleibt „Zu tun“ leer mit der Zeile
  „Ihr seid unterwegs – Aufgaben warten bis Fr 11.12.“, und es kommt keine Erinnerung.

```
Übersicht am Sa 5.12. (Urlaub Mallorca, ganzer Haushalt)
Zu tun
  Ihr seid unterwegs – Aufgaben warten bis Fr 11.12.
  Was anderes erledigt?

Übersicht am Fr 11.12.
Zu tun                                   ca. 6 Punkte
  ○ Bad putzen          wöchentlich Fr · heute, nach der Reise   (N)
  ○ Pflanzen gießen     etwa alle 3 Tage ▓▓▓▓▓▓ jetzt fällig     (E)
  ○ Fenster Wohnzimmer  alle 2 Monate · heute, nach der Reise    (E)
```

## Abhängigkeiten und kritischer Pfad

| Spec | Was diese Spec daraus braucht                                                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 0011 | Haushalt mit „Anstehend“, „Alle“, „Verlauf“, Formular, Abhaken, „Was anderes erledigt?“, Erledigung mit gemerktem Stand davor             |
| 0013 | Zeitplaner, Tagesüberblick, Erinnerung an Aufgaben mit Uhrzeit, „stumm während einer Reise“ (`private.is_silent`), Paritätstests          |
| 0016 | Monatskalender (`MonthCalendar`, „Anderes Datum …“), Tages-Fenster mit Haushalt-Zeile, Wort „Reise“ in der Oberfläche                     |
| 0018 | „Abwechselnd“ zeigt nur die Person, die dran ist (H-07)                                                                                   |
| 0019 | Zustand in der Adresse (Ansicht, Verlaufsfilter, offene Aufgabe), Menüs und Auswahl                                                       |
| 0020 | Neuer Aufbau der Übersicht; „Zu tun“ bleibt ein Abschnitt dort, diese Spec bestimmt seinen Inhalt während Reisen und die Punkte           |
| 0022 | Reise-Fenster und Tabelle der Reisen (ggf. umbenannt); diese Spec liefert den Satz zur Wirkung auf Aufgaben (REQ-015)                       |

**Kritischer Pfad:**

- **Migration:** Die Domänen-Operationen `complete_chore` (Tag bis 30 Tage zurück) und eine neue
  zum Ändern des Datums einer Erledigung (REQ-007).
- **Zeitplaner und Parität:** Tagesüberblick und Erinnerungen rechnen Reisen und Vertretung in SQL;
  dieselbe Regel steht in `packages/core` (ADR-0014: Regeln doppelt, Paritätstests Pflicht).
- **Tenancy:** Die neue Operation und die erweiterten Funktionen lesen Reisen und Mitglieder nur des
  eigenen Haushalts.

Der Plan braucht dafür ein Bedrohungsmodell, Negativtests (fremder Haushalt, abgemeldet, ungültige
Eingabe, Fehlerfall) und `/security-check`.

## Schon erledigt

| Punkt                                                                  | Beleg                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H-07: „Abwechselnd“ zeigt nur die Person, die dran ist                 | Spec 0018, REQ-006 (AC-016, AC-017); `choreMemberIds` und `choreTurnLabel` in `packages/core/src/chores.ts`                                                                                                        |
| Nicht erledigte Aufgaben bleiben an den Folgetagen als fällig sichtbar | Übersicht „Zu tun“ nimmt Überfälliges zuerst (`dueChores`, `packages/core/src/overview.ts`), Haushalt hat den Abschnitt dafür (`chores-screen.tsx`), die Haushalt-Zeile zeigt es heute (Spec 0010, AC-017). Nur die Texte weichen ab (REQ-009). |
| ER-32 an anderen Stellen                                               | Den Link gibt es nur in `apps/app/src/features/chores/chores-screen.tsx` („Anstehend“); weder Übersicht noch Kalender haben ihn. REQ-006 entfernt ihn dort.                                                          |

## Anforderungen und Akzeptanzkriterien

Beispieldatum ist, wenn nicht anders genannt, **Sonntag, 22.11.2026**. Der Haushalt „Enrico &
Nadja“ hat die Mitglieder Enrico (E) und Nadja (N), in dieser Reihenfolge. Die Reise „Urlaub
Mallorca“ geht vom Freitag, 4.12., bis Donnerstag, 10.12.2026, für Enrico und Nadja, also den ganzen
Haushalt. Die Reise „Dienstreise Hamburg“ geht vom Freitag, 18.12., bis Samstag, 19.12.2026, nur für
Enrico. Handybreite ist 390 px, Desktopbreite 1440 px.

### Termine und Bedienung

### REQ-001 — „Einmalig“ an jedem Tag ab heute

> Beim Rhythmus „Einmalig“ steht nach „Ohne Datum“ der Chip „Datum …“, der einen Monatskalender ohne
> Grenze nach vorn öffnet; danach folgen die Kurzwahl-Chips der nächsten 14 Tage, und ein gewählter
> Tag aus dem Kalender steht auf dem Chip.

**Quelle:** ER-33, H-02

**Offline:** nur online — Anlegen und Bearbeiten schreiben (ADR-0008); ohne Netz ist „Speichern“
ausgegraut mit dem Offline-Hinweis (wie bisher). Der Kalender selbst öffnet auch offline.

**AC-001 — Datum aus dem Monatskalender**

```gherkin
Angenommen  ich öffne „Neue Aufgabe“ und wähle den Rhythmus „Einmalig“
Dann        stehen die Datums-Chips in dieser Reihenfolge: „Ohne Datum“, „Datum …“, „heute“,
            „morgen“, „Di 24.11.“ und weiter bis „Sa 5.12.“
Wenn        ich „Datum …“ wähle
Dann        klappt unter den Chips der Monat „November 2026“ auf, der 22. hat einen Ring, und der
            1. bis 21. November sind nicht wählbar
Wenn        ich mit › zu „März 2027“ blättere und den 16. wähle
Dann        klappt der Kalender zu, und der Chip heißt „Di 16.3.2027“ und ist gewählt
Wenn        ich den Titel „TÜV“ eingebe und speichere
Dann        zeigt die geöffnete Aufgabe „TÜV“ die Zeile „Nächstes Mal Di 16.3.2027“
```

**AC-002 — Kurzwahl nach dem Kalender und Bearbeiten**

```gherkin
Angenommen  im Formular ist über „Datum …“ der Sa 19.12. gewählt, der Chip heißt „Sa 19.12.“
Wenn        ich den Chip „morgen“ antippe
Dann        ist „morgen“ gewählt, und der zweite Chip heißt wieder „Datum …“
Angenommen  die einmalige Aufgabe „Winterreifen“ hat den Termin Sa 23.1.2027
Wenn        ich sie bearbeite
Dann        heißt der zweite Chip „Sa 23.1.2027“ und ist gewählt
Wenn        ich „Datum …“ erneut öffne
Dann        zeigt der Kalender „Januar 2027“ mit dem 23. markiert
```

**AC-003 — Tage vor heute**

```gherkin
Angenommen  der Kalender hinter „Datum …“ zeigt „November 2026“
Wenn        ich mit der Tastatur per Pfeiltaste vom 22. nach links gehe
Dann        bleibt der Fokus auf dem 22., weil davor kein Tag wählbar ist
Und         ‹ zum Oktober 2026 zeigt nur nicht wählbare Tage
```

### REQ-002 — „Nächstes Mal“ einstellen, „Zuletzt erledigt“ beim Anlegen

> Bei „Wöchentlich“, „Monatlich“, „Alle n Monate“ und „Flexibel“ zeigt das Formular die Zeile
> „Nächstes Mal“ (bei „Flexibel“: „Nächstes Mal etwa“) mit dem Vorschlag aus dem Rhythmus, den man
> mit denselben Chips wie in REQ-001 ändert; beim Anlegen gibt es zusätzlich „Zuletzt erledigt
> (optional)“, von dem aus der Vorschlag rechnet.

**Quelle:** H-01

**Offline:** nur online, wie REQ-001.

**Regeln**

- **Vorschlag ohne „Zuletzt erledigt“:** Wöchentlich: der nächste gewählte Wochentag ab heute (heute
  eingeschlossen). Monatlich: der gewählte Tag in diesem Monat, wenn er nicht vor heute liegt, sonst
  im nächsten. Alle n Monate: heute plus n Monate. Flexibel: heute plus die Tage des Rhythmus. Keine
  neue Aufgabe ist also heute fällig, außer der Vorschlag oder die eigene Wahl zeigt „heute“.
- **Mit „Zuletzt erledigt“:** Alle n Monate und Flexibel rechnen ab diesem Tag, nie vor heute;
  Wöchentlich und Monatlich wie ohne.
- **Rhythmus ändern:** Der Vorschlag rückt sofort im Formular mit (ab der letzten Erledigung, sonst
  ab heute), solange man den Tag in diesem Formular nicht selbst gewählt hat. Gespeichert wird, was
  im Feld steht.
- **„Zuletzt erledigt“** ist ein Tag bis heute, ohne Grenze nach hinten. Er legt keinen Eintrag im
  Verlauf an; die geöffnete Aufgabe zeigt ihn als „Zuletzt Sa 15.8.“ ohne Avatar, solange es keinen
  Eintrag gibt.
- **„Nächstes Mal“** ist ein Tag ab heute. Bei „Flexibel“ füllt sich der Balken bis zu diesem Tag
  wie nach einer Erledigung; nach jeder Erledigung rechnet der Termin wie bisher ab dem Tag der
  Erledigung.

**AC-004 — Anlegen mit „Zuletzt erledigt“**

```gherkin
Angenommen  ich lege „Matratze drehen“ an, Rhythmus „Alle n Monate“ mit 6 Monaten
Wenn        ich unter „Zuletzt erledigt (optional)“ über „Datum …“ den Sa 15.8.2026 wähle
Dann        ist unter „Nächstes Mal“ der Chip „Mo 15.2.2027“ gewählt
Wenn        ich speichere
Dann        steht „Matratze drehen“ weder unter „Zu tun“ noch unter „Anstehend“
Und         die geöffnete Aufgabe zeigt „Nächstes Mal Mo 15.2.2027“ und „Zuletzt Sa 15.8.“
Und         der Verlauf hat keinen Eintrag zu „Matratze drehen“
```

**AC-005 — Anlegen ohne „Zuletzt erledigt“ ist nicht heute fällig**

```gherkin
Angenommen  ich lege „Fenster Wohnzimmer“ an, Rhythmus „Alle n Monate“ mit 2 Monaten
Dann        ist unter „Nächstes Mal“ der Chip „Fr 22.1.2027“ gewählt
Angenommen  ich lege stattdessen „Bettwäsche wechseln“ mit „Flexibel“, etwa alle 14 Tage, an
Dann        ist unter „Nächstes Mal etwa“ der Chip „So 6.12.“ gewählt
Und         nach dem Speichern steht sie unter „Flexibel“ mit leerem Balken und nicht unter „Zu tun“
```

**AC-006 — Versehentliches „Später“ zurückholen**

```gherkin
Angenommen  „Bad putzen“ ist wöchentlich freitags, ihr Termin wurde versehentlich von Fr 27.11. auf
            Sa 28.11. verschoben, der Hinweis mit „Rückgängig“ ist weg
Wenn        ich „Bad putzen“ öffne, „Bearbeiten ›“ wähle, unter „Nächstes Mal“ „Fr 27.11.“ antippe
            und speichere
Dann        zeigt die Aufgabe „Nächstes Mal Fr 27.11.“, auch auf Nadjas Gerät
```

**AC-007 — Rhythmus ändern zeigt den neuen Termin vor dem Speichern** (ersetzt Spec 0011, AC-051)

```gherkin
Angenommen  „Bad putzen“ ist wöchentlich freitags, zuletzt erledigt Fr 20.11., nächstes Mal Fr 27.11.
Wenn        ich sie bearbeite und statt „Fr“ den Wochentag „Mo“ wähle
Dann        springt „Nächstes Mal“ auf „morgen“ (Mo 23.11.), noch bevor ich speichere
Wenn        ich unter „Nächstes Mal“ selbst „Mi 25.11.“ antippe und danach zusätzlich „Do“ wähle
Dann        bleibt „Mi 25.11.“ gewählt
Und         nach dem Speichern zeigt die Aufgabe „Nächstes Mal Mi 25.11.“
```

**AC-008 — Grenzen**

```gherkin
Angenommen  das Formular einer neuen Aufgabe mit „Alle n Monate“ ist offen
Wenn        ich „Datum …“ unter „Zuletzt erledigt“ öffne
Dann        sind Tage nach heute nicht wählbar, Tage im Jahr 2025 schon
Wenn        ich „Datum …“ unter „Nächstes Mal“ öffne
Dann        sind Tage vor heute nicht wählbar
Angenommen  der Rhythmus ist „Bei Bedarf“ oder „Einmalig“
Dann        gibt es weder „Nächstes Mal“ noch „Zuletzt erledigt“; „Einmalig“ hat seine Chips aus
            REQ-001
```

### REQ-003 — „Als Nächstes dran“ festlegen

> Bei „Abwechselnd“ zeigt das Formular unter der Zuständigkeit die Zeile „Als Nächstes dran“ mit
> einem Chip je Person der Reihenfolge; gewählt ist, wer gerade dran ist (bei einer neuen Aufgabe
> die erste Person), und die Wahl wird gespeichert.

**Quelle:** H-08

**Offline:** nur online, wie REQ-001.

**AC-009 — Wer dran ist, umstellen**

```gherkin
Angenommen  „Bad putzen“ wechselt zwischen Enrico und Nadja ab, dran ist Nadja
Wenn        Nadja „Bearbeiten ›“ wählt
Dann        steht unter „Zuständigkeit“ die Zeile „Als Nächstes dran“ mit „Enrico“ und „Nadja“,
            „Nadja“ ist gewählt
Wenn        sie „Enrico“ wählt und speichert
Dann        zeigt die Zeile von „Bad putzen“ Enricos Avatar, auch auf Enricos Gerät
Und         die geöffnete Aufgabe zeigt „abwechselnd, dran: Enrico“
```

**AC-010 — Nur bei „Abwechselnd“**

```gherkin
Angenommen  das Formular von „Bad putzen“ (abwechselnd, dran Nadja) ist offen
Wenn        ich die Zuständigkeit auf „Fest“ stelle
Dann        verschwindet „Als Nächstes dran“, und die Chips der festen Person erscheinen
Wenn        ich wieder „Abwechselnd“ wähle
Dann        ist unter „Als Nächstes dran“ wieder „Nadja“ gewählt
Angenommen  ich lege eine neue Aufgabe mit „Abwechselnd“ an und ändere nichts
Dann        ist unter „Als Nächstes dran“ „Enrico“ gewählt
```

### REQ-004 — „Bei Bedarf“ startet mit „Egal“, nicht passende Knöpfe fehlen

> Wählt man beim Anlegen „Bei Bedarf“, steht die Zuständigkeit auf „Egal“, solange man sie nicht
> selbst gewählt hat; in einer geöffneten Aufgabe fehlen Knöpfe, die für ihren Rhythmus nichts tun
> („Später“ und „Überspringen“ bei „Bei Bedarf“, „Überspringen“ bei „Einmalig“), statt ausgegraut zu
> sein.

**Quelle:** H-09

**Offline:** Anlegen nur online. Offline bleiben die vorhandenen Knöpfe ausgegraut mit dem
Offline-Hinweis; ausgeblendet wird nur, was für den Rhythmus nicht gilt.

**AC-011 — Standard „Egal“**

```gherkin
Angenommen  ich öffne „Neue Aufgabe“; die Zuständigkeit steht auf „Abwechselnd“
Wenn        ich den Rhythmus „Bei Bedarf“ wähle
Dann        steht die Zuständigkeit auf „Egal“
Angenommen  ich habe vorher selbst „Fest“ mit „Nadja“ gewählt
Wenn        ich danach „Bei Bedarf“ wähle
Dann        bleibt „Fest“ mit „Nadja“ gewählt
```

**AC-012 — Knöpfe je Rhythmus**

```gherkin
Angenommen  „Fenster Küche“ hat den Rhythmus „Bei Bedarf“
Wenn        ich sie öffne
Dann        stehen dort „Erledigt“, „Bearbeiten ›“, „Alle Einträge ›“ und „Löschen“
Und         „Später“ und „Überspringen“ fehlen, und kein Text erklärt einen gesperrten Knopf
Angenommen  „Glühbirne Flur tauschen“ ist einmalig ohne Datum
Wenn        ich sie öffne
Dann        stehen dort „Erledigt“ und „Später“, „Überspringen“ fehlt
Angenommen  das Gerät ist offline und ich öffne „Bad putzen“ (wöchentlich)
Dann        sind „Erledigt“, „Später“ und „Überspringen“ zu sehen und ausgegraut mit „Offline – zum
            Bearbeiten brauchst du Netz“
```

### REQ-005 — „Später“ mit Auswahl

> „Später“ öffnet ein Menü mit konkreten Tagen („Morgen“, „Übermorgen“, „Am Wochenende“) und
> „Datum …“; erst der Tipp auf einen Eintrag verschiebt den nächsten Termin dorthin, der Rhythmus
> bleibt, und ein Hinweis bietet 5 Sekunden „Rückgängig“.

**Quelle:** H-05

**Offline:** nur online. Offline ist „Später“ ausgegraut mit dem Offline-Hinweis; das Menü öffnet
nicht.

**Regeln**

- **Ausgangstag** ist der spätere von heute und dem nächsten Termin (nach REQ-011, also nach einer
  Reise der Tag danach).
- **Einträge:** Ausgangstag + 1 und + 2 Tage. Ist der Ausgangstag heute, heißen sie „Morgen · Mo
  23.11.“ und „Übermorgen · Di 24.11.“, sonst „Einen Tag später · Sa 28.11.“ und „Zwei Tage später ·
  So 29.11.“. Dann „Am Wochenende · Sa 28.11.“: der erste Samstag oder Sonntag nach dem
  Ausgangstag; ist das schon einer der ersten beiden Einträge, fehlt er. Zuletzt „Datum …“ mit dem
  Monatskalender, wählbar jeder Tag ab heute.
- **Wirkung:** setzt nur den nächsten Termin (auch bei „Flexibel“); Rhythmus, Zuständigkeit und
  „Zuletzt“ bleiben. Es entsteht kein Eintrag im Verlauf.
- **Hinweis:** „Verschoben auf Di 24.11.“ mit 5 Sekunden „Rückgängig“. Fällt der Tag in eine Reise,
  nach der die Aufgabe erst später dran ist (REQ-011), heißt er „Verschoben auf Sa 5.12. – wegen der
  Reise erst Fr 11.12.“.

**AC-013 — Auswahl am heutigen Termin**

```gherkin
Angenommen  „Müll rausbringen“ ist wöchentlich sonntags und heute fällig
Wenn        ich sie öffne und „Später“ antippe
Dann        zeigt ein Menü „Morgen · Mo 23.11.“, „Übermorgen · Di 24.11.“, „Am Wochenende · Sa
            28.11.“ und „Datum …“
Und         der Termin ist noch unverändert
Wenn        ich „Übermorgen · Di 24.11.“ wähle
Dann        zeigt die Aufgabe „Nächstes Mal Di 24.11.“, und unter „Zu tun“ steht sie nicht mehr
Und         ein Hinweis zeigt 5 Sekunden „Verschoben auf Di 24.11.“ mit „Rückgängig“
Wenn        ich „Rückgängig“ wähle
Dann        ist „Müll rausbringen“ wieder heute fällig
```

**AC-014 — Menü schließen verschiebt nichts**

```gherkin
Angenommen  das Menü von „Später“ bei „Müll rausbringen“ ist offen
Wenn        ich daneben tippe oder Escape drücke
Dann        schließt das Menü, der Termin bleibt heute, und es erscheint kein Hinweis
```

**AC-015 — Termin in der Zukunft und „Datum …“**

```gherkin
Angenommen  „Bad putzen“ ist wöchentlich freitags, nächstes Mal Fr 27.11.
Wenn        ich „Später“ antippe
Dann        zeigt das Menü „Einen Tag später · Sa 28.11.“, „Zwei Tage später · So 29.11.“ und
            „Datum …“, aber keinen Eintrag „Am Wochenende“
Wenn        ich „Datum …“ wähle
Dann        zeigt der Monatskalender „November 2026“ mit dem 27. markiert, Tage vor dem 22. sind nicht
            wählbar
Wenn        ich den Mi 25.11. wähle
Dann        zeigt die Aufgabe „Nächstes Mal Mi 25.11.“, und der Rhythmus ist weiter „wöchentlich Fr“
```

### REQ-006 — „Anstehend“ mit „Ohne Termin“ und ohne „weitere später“

> „Anstehend“ zeigt nach „Diese Woche“ den Abschnitt „Ohne Termin“ mit den einmaligen Aufgaben ohne
> Datum; der Link „n weitere Aufgaben später – alle ansehen“ entfällt, Aufgaben mit späterem Termin
> und pausierte stehen nur unter „Alle“.

**Quelle:** H-04, ER-32

**Offline:** offline vollständig — nur Anzeige; Abhaken wie bisher nur online.

**AC-016 — Einmalige Aufgabe ohne Datum**

```gherkin
Angenommen  „Glühbirne Flur tauschen“ ist einmalig ohne Datum
Wenn        ich „Anstehend“ öffne
Dann        steht sie im letzten Abschnitt „Ohne Termin“ mit Haken
Wenn        ich sie abhake und 2 Sekunden warte
Dann        steht sie im Verlauf, und unter „Alle“ gibt es sie nicht mehr
Und         auf der Übersicht stand sie nie unter „Zu tun“
```

**AC-017 — Kein Link auf später**

```gherkin
Angenommen  „Matratze drehen“ ist erst am Fr 1.1.2027 dran, „Rasen mähen“ ist pausiert
Wenn        ich „Anstehend“ öffne
Dann        stehen beide dort nicht, und nirgends steht „weitere Aufgaben später“
Wenn        ich zum Tab „Alle“ wechsle
Dann        stehen „Matratze drehen“ mit „nächstes Mal Fr 1.1.2027“ und „Rasen mähen“ mit
            „pausiert“ da
```

**AC-018 — Leer**

```gherkin
Angenommen  heute und in dieser Woche ist nichts fällig, und es gibt keine Aufgabe ohne Termin
Wenn        ich „Anstehend“ öffne
Dann        steht „Alles erledigt“ mit „Für diese Woche steht nichts mehr an. Alles Weitere steht unter
            „Alle“.“
```

### REQ-007 — Nachtragen bis 30 Tage zurück, Datum im Verlauf ändern

> In „Was anderes erledigt?“ bietet der Tag „heute“, „gestern“, „vorgestern“ und „Datum …“ (die
> letzten 30 Tage); im Verlauf lässt sich der Tag eines Eintrags über „Datum ändern“ korrigieren, und
> bei der jüngsten Erledigung einer Aufgabe rechnen nächster Termin und „Zuletzt“ neu, als wäre sie an
> diesem Tag eingetragen worden.

**Quelle:** H-06

**Offline:** nur online — „Als erledigt eintragen“ und „Datum ändern“ sind ohne Netz ausgegraut mit
dem Offline-Hinweis; Suchen und Ansehen gehen offline.

**Regeln**

- **Wählbar:** heute − 30 Tage bis heute (Tag auf dem Gerät). Der Server nimmt heute − 31 bis heute
  + 1 nach seinem Datum an, als Puffer für Zeitzonen (wie bisher − 3 bis + 1).
- **Jüngste Erledigung** ist wie in Spec 0011 die zuletzt gebuchte. Nur bei ihr rechnet die Aufgabe
  neu, und zwar vom gemerkten Stand davor aus; bei älteren Einträgen ändert sich nur der Tag.
- **Gelöschte Aufgabe:** Der Tag ihres Eintrags lässt sich ändern; es rechnet nichts.
- **Übersprungen:** Ein übersprungener Eintrag lässt sich genauso ändern; als jüngster verschiebt
  er nur den nächsten Termin.

**AC-019 — Letzten Samstag nachtragen**

```gherkin
Angenommen  „Fenster Wohnzimmer“ ist alle 2 Monate, nächstes Mal Fr 20.11., also fällig seit 2 Tagen
Wenn        ich „Was anderes erledigt?“ öffne, „Fenster Wohnzimmer“ wähle, den Tag „heute ▾“ öffne
Dann        stehen dort „heute“, „gestern“, „vorgestern“ und „Datum …“
Wenn        ich „Datum …“ wähle, den Sa 14.11. antippe und „Als erledigt eintragen“ wähle
Dann        steht im Verlauf unter „KW 46“ „Fenster Wohnzimmer“ mit Enricos Avatar und „Sa 14.“
Und         die Aufgabe zeigt „Nächstes Mal Mi 20.1.2027“ und „Zuletzt Sa 14.11. (E)“
```

**AC-020 — Grenze 30 Tage**

```gherkin
Angenommen  das Fenster „Was hast du erledigt?“ ist offen und „Datum …“ zeigt „Oktober 2026“
Dann        ist der Fr 23.10. wählbar, der Do 22.10. und alle Tage davor nicht
Und         Tage nach heute sind nicht wählbar
Wenn        ein Aufruf über die Supabase-API eine Erledigung mit dem Tag 20.10.2026 bucht
Dann        lehnt der Server sie mit „invalid_change“ ab, und nichts wird gebucht
```

**AC-021 — Datum der jüngsten Erledigung ändern**

```gherkin
Angenommen  „Bettwäsche wechseln“ ist etwa alle 14 Tage; ihr jüngster Eintrag ist „erledigt Fr 20.11.
            (N)“, nächstes Mal etwa Fr 4.12.; gewechselt hat Nadja aber am Mi 18.11.
Wenn        ich den Eintrag im Verlauf öffne, „Datum ändern“ wähle und den Mi 18.11. antippe
Dann        zeigt der Eintrag „Mi 18.“ in KW 47
Und         die Aufgabe zeigt „Nächstes Mal etwa Mi 2.12.“ und „Zuletzt Mi 18.11. (N)“
```

**AC-022 — Älterer Eintrag**

```gherkin
Angenommen  „Bad putzen“ hat die Einträge „erledigt Fr 20.11. (E)“ (jüngster) und „erledigt Fr
            13.11. (N)“, nächstes Mal Fr 27.11.
Wenn        ich beim Eintrag vom 13.11. das Datum auf Do 12.11. ändere
Dann        steht er mit „Do 12.“ im Verlauf
Und         „Bad putzen“ zeigt weiter „Nächstes Mal Fr 27.11.“ und „Zuletzt Fr 20.11. (E)“
```

**AC-023 — Fehlerfälle**

```gherkin
Angenommen  Enrico hat den Eintrag „Bad putzen, Fr 20.11.“ geöffnet, und Nadja entfernt ihn in dieser
            Zeit
Wenn        Enrico das Datum auf Do 19.11. ändert
Dann        sieht er „Hat nicht geklappt – bitte noch einmal versuchen“, und der Eintrag bleibt
            entfernt
Wenn        ein Mitglied eines anderen Haushalts oder ein abgemeldeter Aufruf über die Supabase-API
            das Datum eines Eintrags von „Enrico & Nadja“ ändern will
Dann        wird das abgelehnt, und nichts ändert sich
Angenommen  das Gerät ist offline
Wenn        ich einen Verlaufseintrag öffne
Dann        ist „Datum ändern“ ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“
```

### REQ-008 — Verlauf nach Person und Aufgabe filtern

> Über dem Verlauf stehen Filter-Chips für die Person („Alle“, je Mitglied ein Chip) und ein Chip
> „Aufgabe ▾“, der eine Aufgabe zur Auswahl anbietet; die geöffnete Aufgabe hat den Link „Alle
> Einträge ›“, der den Verlauf mit dieser Aufgabe gefiltert öffnet. Die Filter stehen nach Spec 0019
> in der Adresse.

**Quelle:** H-10

**Offline:** offline vollständig — Filtern ist Anzeige.

**Regeln:** Beide Filter wirken zusammen. Gefiltert wird nach der Aufgabe, nicht nach dem Titel;
Einträge gelöschter Aufgaben erscheinen nur ohne Aufgaben-Filter. Gliederung nach Monat und Woche
bleibt (Spec 0011, REQ-010); leere Monate und Wochen entfallen.

**AC-024 — Nach Person**

```gherkin
Angenommen  der Verlauf hat Einträge von Enrico und Nadja
Wenn        ich „Verlauf“ öffne
Dann        stehen über der Liste „Alle“ (gewählt), „Enrico“, „Nadja“ und „Aufgabe ▾“
Wenn        ich „Nadja“ wähle
Dann        stehen nur Einträge mit Nadjas Avatar da, weiter nach Monat und Woche gegliedert
```

**AC-025 — Aus der Aufgabe**

```gherkin
Angenommen  „Bad putzen“ hat sechs Einträge im Verlauf
Wenn        ich „Bad putzen“ öffne und „Alle Einträge ›“ wähle
Dann        zeigt der Tab „Verlauf“ nur die sechs Einträge von „Bad putzen“, der Chip heißt „Bad
            putzen ✕“
Wenn        ich die Seite neu lade
Dann        ist der Filter „Bad putzen“ noch gesetzt
Wenn        ich auf ✕ am Chip tippe
Dann        zeigt der Verlauf wieder alle Einträge
```

**AC-026 — Nichts gefunden**

```gherkin
Angenommen  Nadja hat „Fenster Küche“ nie erledigt
Wenn        ich „Nadja“ und die Aufgabe „Fenster Küche“ wähle
Dann        steht „Keine Einträge für diese Auswahl“ mit dem Knopf „Filter zurücksetzen“
Wenn        ich „Filter zurücksetzen“ wähle
Dann        sind „Alle“ gewählt und kein Aufgaben-Filter gesetzt
```

### REQ-009 — Eine Formulierung für Fälliges, überall

> Wann eine Aufgabe dran ist, heißt auf der Übersicht, im Haushalt und im Tagesüberblick gleich:
> „heute“, „fällig seit gestern“, „fällig seit n Tagen“ (ab 2), nach einer Reise „heute, nach der
> Reise“ bzw. vorher „nach der Reise am Fr 11.12.“; „überfällig“ und „fällig seit 1 Tag“ gibt es
> nicht mehr, und der Abschnitt dafür im Haushalt heißt „Noch offen“.

**Quelle:** Frage von Enrico vom 22.11.2026 (Begleittext zu dieser Spec), U-04 (Abgleich der Texte)

**Offline:** offline vollständig — nur Anzeige. Die Benachrichtigungen rechnet der Zeitplaner.

**Regeln**

- **Bleibt sichtbar:** Eine Aufgabe mit festem Termin, die an ihrem Tag nicht erledigt wurde, steht
  an jedem folgenden Tag unter „Zu tun“ (Übersicht), unter „Noch offen“ (Haushalt) und heute in der
  Haushalt-Zeile, bis sie erledigt, übersprungen oder verschoben ist. Das gilt schon (siehe „Schon
  erledigt“); diese Spec vereinheitlicht nur den Text.
- **Gezählt** wird ab dem Termin, nach einer Reise ab dem Tag danach (REQ-011).
- **Flexibel** behält den Balken; sein Text heißt überall „jetzt fällig“ (Intervall erreicht) bzw.
  „bald fällig“ (ab 80 %), darunter im Haushalt wie bisher „n % bis fällig“.
- **Tagesüberblick:** „Fenster Wohnzimmer (du, fällig seit 2 Tagen)“; eine heute fällige Aufgabe mit
  Uhrzeit wie bisher „Müll rausbringen (du, 19:00)“.
- **Eine Quelle:** Die Texte entstehen an einer Stelle in `packages/core` und an einer im
  Zeitplaner; ein Paritätstest hält beide gleich.

**AC-027 — Gleicher Text auf Übersicht und im Haushalt**

```gherkin
Angenommen  „Fenster Wohnzimmer“ (alle 2 Monate) war am Sa 21.11. dran, „Müll rausbringen“
            (wöchentlich do) am Do 19.11., „Bad putzen“ ist heute dran; keine ist erledigt
Wenn        ich die Übersicht und danach „Anstehend“ im Haushalt ansehe
Dann        steht an beiden Stellen bei „Fenster Wohnzimmer“ „fällig seit gestern“, bei „Müll
            rausbringen“ „fällig seit 3 Tagen“ und bei „Bad putzen“ „heute“
Und         im Haushalt stehen die ersten beiden im Abschnitt „Noch offen“
Und         nirgends steht „fällig seit 1 Tag“ oder „überfällig“
```

**AC-028 — Nicht erledigt bleibt sichtbar**

```gherkin
Angenommen  „Bad putzen“ (wöchentlich fr, Enrico) war am Fr 20.11. dran und wurde nicht erledigt
Wenn        ich am Sa 21.11. die Übersicht ansehe
Dann        steht „Bad putzen“ unter „Zu tun“ mit „fällig seit gestern“
Wenn        ich am So 22.11. die Übersicht ansehe
Dann        steht dort „fällig seit 2 Tagen“
Und         in der Haushalt-Zeile der Woche steht „Bad putzen“ heute, am 20. und 21. nicht
```

**AC-029 — Tagesüberblick mit demselben Text**

```gherkin
Angenommen  der Fall aus AC-027; Enrico ist bei allen drei zuständig und hat den Tagesüberblick mit
            „Aufgaben“ um 7:30 an
Wenn        der Takt um 7:30 läuft
Dann        lautet seine Nachricht „Heute: Fenster Wohnzimmer (du, fällig seit gestern) · Müll
            rausbringen (du, fällig seit 3 Tagen) · Bad putzen (du)“
```

**AC-030 — Flexibel**

```gherkin
Angenommen  „Pflanzen gießen“ (etwa alle 10 Tage) ist seit 12 Tagen nicht gegossen, „Bettwäsche
            wechseln“ (etwa alle 10 Tage) seit 8 Tagen
Dann        steht auf der Übersicht und im Haushalt bei „Pflanzen gießen“ „jetzt fällig“ und bei
            „Bettwäsche wechseln“ „bald fällig“
Und         keine der beiden zeigt „fällig seit“
```

### REQ-010 — Dieselben Punkte für heute

> Die Punkte für heute sind eine Rechnung: die Summe des Aufwands aller Aufgaben, die heute unter
> „Zu tun“ stehen (heute fällig, noch offen, flexibel bald fällig); sie steht auf der Übersicht
> neben „Zu tun“ und im Haushalt über den Abschnitten von „Anstehend“ als „Zu tun heute: ca. 5
> Punkte“.

**Quelle:** U-04

**Offline:** offline vollständig — nur Anzeige.

**AC-031 — Gleiche Zahl**

```gherkin
Angenommen  heute fällig ist „Bad putzen“ (2 Punkte), noch offen sind „Fenster Wohnzimmer“ (2 Punkte)
            und „Müll rausbringen“ (1 Punkt)
Wenn        ich die Übersicht ansehe
Dann        steht neben „Zu tun“ „ca. 5 Punkte“
Wenn        ich „Anstehend“ im Haushalt öffne
Dann        steht über den Abschnitten „Zu tun heute: ca. 5 Punkte“
Und         neben der Überschrift „Heute“ steht keine Zahl
```

**AC-032 — Ein Punkt und keiner**

```gherkin
Angenommen  heute steht nur „Müll rausbringen“ (1 Punkt) unter „Zu tun“
Dann        steht auf der Übersicht „ca. 1 Punkt“ und im Haushalt „Zu tun heute: ca. 1 Punkt“
Wenn        ich sie abhake und das Sammel-Fenster abläuft
Dann        stehen weder auf der Übersicht noch im Haushalt Punkte
```

### Reisen wirken auf Aufgaben

Die Regeln dieses Teils gelten in der App (`packages/core`) und im Zeitplaner gleich. Eine **Reise**
ist hier jeder Eintrag „Reise“ des Haushalts (heute die Tabelle der Abwesenheiten; Spec 0022 kann sie
umbenennen). Eine Person **ist an einem Tag weg**, wenn eine Reise des Haushalts sie oder den ganzen
Haushalt an diesem Tag einschließt (Von und Bis zählen mit). Der **ganze Haushalt ist weg**, wenn an
diesem Tag jedes Mitglied weg ist, egal ob über eine gemeinsame Reise oder mehrere einzelne.

### REQ-011 — Ein Termin wartet, solange niemand da ist, der die Aufgabe erledigen kann

> Fällt der Termin einer Aufgabe auf einen Tag, an dem niemand da ist, der sie erledigen kann, gilt
> der erste Tag danach, an dem jemand da ist; bis dahin ist sie nirgends fällig, und „fällig seit“
> zählt erst ab diesem Tag. Gespeichert wird nichts: Die App und der Zeitplaner leiten es aus Reisen
> und Aufgabe ab.

**Quelle:** H-03 (Entscheidung von Enrico, 22.11.2026)

**Offline:** offline lesend — die Wirkung wird auf dem Gerät aus dem lokalen Speicher berechnet und
ist offline zu sehen. Reisen ändern geht nur online (Spec 0022).

**Regeln**

1. **Wer kann:** Fest: die feste Person. Abwechselnd: jede Person der Reihenfolge. Egal: jedes
   Mitglied. Zu zweit: alle Mitglieder gemeinsam.
2. **Freier Tag:** Ein Tag ist für eine Aufgabe frei, wenn mindestens eine Person, die kann, nicht
   weg ist; bei „Zu zweit“ nur, wenn kein Mitglied weg ist.
3. **Termin nach Reisen:** der gespeicherte Termin, wenn er frei ist, sonst der erste freie Tag
   danach, auch über mehrere aneinander anschließende oder überlappende Reisen hinweg.
4. **Gilt für** alle Rhythmen mit Termin: Einmalig mit Datum, Wöchentlich, Monatlich, Alle n Monate
   und Flexibel (dort der Tag „Nächstes Mal etwa“). Nicht für „Bei Bedarf“ und „Einmalig“ ohne Datum.
5. **Schon vorher offen:** Ein Termin vor der Reise bleibt, wie er ist. An Tagen, die für die
   Aufgabe nicht frei sind, ist sie aber nirgends fällig (Zu tun, Noch offen, Haushalt-Zeile,
   Tagesüberblick); am ersten freien Tag ist sie wieder da, gezählt ab ihrem Termin.
6. **Mehrere am selben Tag:** Aufgaben, die auf denselben Tag rücken, stehen dort unter „Heute“ bzw.
   „Zu tun“ nach ihrem gespeicherten Termin, dann nach Titel, mit „heute, nach der Reise“; sie
   zählen nicht als „Noch offen“. Eine Aufgabe hat immer nur einen nächsten Termin: Fallen mehrere
   ihrer Termine in eine Reise, steht sie danach einmal da, und nach dem Erledigen geht ihr Rhythmus
   normal weiter.
7. **Flexibel:** Die Uhr läuft während der Reise weiter. An Tagen, die nicht frei sind, steht die
   Aufgabe nicht unter „Zu tun“; danach mit ihrem Balken („jetzt fällig“), ohne „nach der Reise“.
8. **Saison:** Liegt der Termin nach Reisen außerhalb der Saison, ist die Aufgabe dann pausiert wie
   jede Aufgabe außerhalb ihrer Saison.
9. **„Später“** setzt den gespeicherten Termin; die Regel gilt danach genauso (Hinweis in REQ-005).
10. **Erledigen während einer Reise** ist erlaubt (Abhaken, „Erledigt“ in der Aufgabe, Nachtragen,
    Überspringen) und rechnet wie immer ab dem gewählten Tag.
11. **Reise neu, geändert, gelöscht:** wirkt sofort und auf allen Geräten nach dem Abgleich, weil
    nichts gespeichert ist. Eine gelöschte vergangene Reise macht verschobene Aufgaben wieder ab
    ihrem gespeicherten Termin fällig.
12. **Beginnt heute, endet heute:** Der erste und der letzte Tag einer Reise zählen voll; was heute
    dran ist und heute eine Reise beginnt, wartet.
13. **Künftige Tage im Kalender:** Termine an Tagen, die nicht frei sind, stehen am ersten freien Tag
    danach; mehrere Termine derselben Aufgabe werden dort einer.
14. **Nur der eigene Haushalt:** Es zählen nur Reisen des Haushalts, zu dem die Aufgabe gehört.

**AC-033 — Reise des ganzen Haushalts: feste Termine rücken**

```gherkin
Angenommen  „Bad putzen“ (wöchentlich fr, fest Nadja) ist nächstes Mal Fr 4.12.
Und         „Fenster Wohnzimmer“ (alle 2 Monate, fest Enrico) ist nächstes Mal Mo 7.12.
Wenn        ich am Do 3.12. „Alle“ ansehe
Dann        steht bei beiden „nach der Reise am Fr 11.12.“
Und         die geöffnete „Bad putzen“ zeigt „Nächstes Mal Fr 11.12. · nach der Reise“
Wenn        ich am Sa 5.12. die Übersicht und „Anstehend“ ansehe
Dann        steht keine der beiden unter „Zu tun“, „Heute“ oder „Noch offen“
Wenn        ich am Fr 11.12. „Anstehend“ ansehe
Dann        stehen unter „Heute“ „Bad putzen“ und danach „Fenster Wohnzimmer“, beide mit „heute, nach
            der Reise“
Und         am Sa 12.12., noch nicht erledigt, steht bei beiden „fällig seit gestern“
```

**AC-034 — Mehrere Termine derselben Aufgabe werden einer**

```gherkin
Angenommen  „Staubsaugen“ (wöchentlich mo und do, egal) ist nächstes Mal Mo 7.12.
Wenn        ich am Fr 11.12. „Zu tun“ ansehe
Dann        steht „Staubsaugen“ dort genau einmal
Wenn        ich sie abhake und das Sammel-Fenster abläuft
Dann        ist „Staubsaugen“ nächstes Mal Mo 14.12.
```

**AC-035 — Eine Person reist: je nach Zuständigkeit**

```gherkin
Angenommen  „Müll rausbringen“ (wöchentlich sa, fest Enrico) ist nächstes Mal Sa 19.12.
Und         „Blumen gießen“ (wöchentlich fr, egal) ist nächstes Mal Fr 18.12.
Und         „Fenster putzen“ (monatlich am 19., zu zweit) ist nächstes Mal Sa 19.12.
Wenn        ich am Do 17.12. „Alle“ ansehe
Dann        steht bei „Müll rausbringen“ und „Fenster putzen“ „nach der Reise am So 20.12.“
Und         bei „Blumen gießen“ „nächstes Mal morgen“
Wenn        Nadja am Fr 18.12. die Übersicht ansieht
Dann        steht „Blumen gießen“ mit „heute“ unter „Zu tun“, die anderen beiden nicht
```

**AC-036 — Schon vor der Reise offen**

```gherkin
Angenommen  „Keller aufräumen“ (einmalig, fest Enrico) war am Mo 30.11. dran und ist nicht erledigt
Wenn        ich am Sa 5.12. die Übersicht ansehe
Dann        steht „Keller aufräumen“ nicht unter „Zu tun“
Wenn        ich am Fr 11.12. die Übersicht ansehe
Dann        steht „Keller aufräumen“ unter „Zu tun“ mit „fällig seit 11 Tagen“
```

**AC-037 — Flexibel über eine Reise**

```gherkin
Angenommen  „Pflanzen gießen“ (etwa alle 3 Tage, egal) wurde am Do 3.12. gegossen, nächstes Mal etwa
            So 6.12.
Wenn        ich vom So 6.12. bis Do 10.12. die Übersicht ansehe
Dann        steht „Pflanzen gießen“ nicht unter „Zu tun“
Wenn        ich am Fr 11.12. die Übersicht ansehe
Dann        steht „Pflanzen gießen“ unter „Zu tun“ mit vollem Balken und „jetzt fällig“
Und         in der Haushalt-Zeile der Woche steht „Pflanzen gießen, etwa“ gestrichelt nicht am 6.12.
```

**AC-038 — Einmalig in der Reise, einmalig ohne Datum**

```gherkin
Angenommen  „Paket abholen“ ist einmalig am Sa 5.12., „Glühbirne Flur tauschen“ einmalig ohne Datum
Wenn        ich am Do 3.12. „Alle“ und „Anstehend“ ansehe
Dann        steht bei „Paket abholen“ „nach der Reise am Fr 11.12.“
Und         „Glühbirne Flur tauschen“ steht unverändert unter „Ohne Termin“
```

**AC-039 — Reise beginnt heute, Erledigen unterwegs**

```gherkin
Angenommen  heute ist Fr 4.12., „Urlaub Mallorca“ beginnt heute, „Bad putzen“ (wöchentlich fr) ist
            heute dran
Wenn        ich die Übersicht ansehe
Dann        steht „Bad putzen“ nicht unter „Zu tun“, und die Aufgabe zeigt „Nächstes Mal Fr 11.12. · nach
            der Reise“
Wenn        Nadja „Bad putzen“ unter „Alle“ öffnet und „Erledigt“ wählt
Dann        steht im Verlauf „Bad putzen“ mit Nadjas Avatar und „Fr 4.“
Und         „Bad putzen“ ist nächstes Mal Fr 11.12., am 11.12. mit „heute“ ohne „nach der Reise“
```

**AC-040 — Reise später geändert oder gelöscht**

```gherkin
Angenommen  der Fall aus AC-033 am Do 3.12.
Wenn        Enrico „Urlaub Mallorca“ bis Sa 12.12. verlängert
Dann        zeigt „Bad putzen“ nach dem Abgleich auf beiden Geräten „nach der Reise am So 13.12.“
Wenn        Enrico „Urlaub Mallorca“ löscht
Dann        zeigt „Bad putzen“ wieder „nächstes Mal Fr 4.12.“
Und         der gespeicherte nächste Termin von „Bad putzen“ war die ganze Zeit Fr 4.12.
```

**AC-041 — Überlappende und einzelne Reisen**

```gherkin
Angenommen  Enrico hat zusätzlich die Reise „Messe“ von Di 1.12. bis Sa 5.12.
Und         „Keller aufräumen“ (einmalig, fest Enrico) ist am Mi 2.12. dran, „Blumen gießen“
            (wöchentlich mi, egal) auch
Dann        zeigt „Keller aufräumen“ „nach der Reise am Fr 11.12.“
Und         „Blumen gießen“ steht am Mi 2.12. unter „Zu tun“, weil Nadja da ist
Angenommen  statt „Urlaub Mallorca“ haben Enrico und Nadja je eine eigene Reise vom 4.12. bis 10.12.
Dann        wirken sie wie eine Reise des ganzen Haushalts: am Sa 5.12. bleibt „Zu tun“ leer
```

**AC-042 — Saison**

```gherkin
Angenommen  „Rasen mähen“ (wöchentlich sa, April–September, egal) ist nächstes Mal Sa 25.9.2027
Und         der ganze Haushalt ist vom Sa 25.9. bis So 3.10.2027 auf Reise
Wenn        ich am Mo 4.10.2027 die Übersicht und „Alle“ ansehe
Dann        steht „Rasen mähen“ nicht unter „Zu tun“, und unter „Alle“ trägt sie „pausiert“
```

**AC-043 — „Später“ in eine Reise**

```gherkin
Angenommen  „Müll rausbringen“ (wöchentlich so) ist heute, So 22.11., dran
Wenn        ich „Später“ → „Datum …“ wähle und den Sa 5.12. antippe
Dann        zeigt der Hinweis „Verschoben auf Sa 5.12. – wegen der Reise erst Fr 11.12.“
Und         die Aufgabe zeigt „Nächstes Mal Fr 11.12. · nach der Reise“
```

**AC-044 — Reisen anderer Haushalte zählen nicht**

```gherkin
Angenommen  Enrico ist auch Mitglied von „WG Berlin“, und dort steht eine Reise für Enrico vom 4.12.
            bis 10.12.; in „Enrico & Nadja“ steht keine Reise
Wenn        ich in „Enrico & Nadja“ am Sa 5.12. „Zu tun“ ansehe
Dann        stehen Enricos fällige Aufgaben dort wie an jedem anderen Tag
```

### REQ-012 — „Abwechselnd“ überspringt, wer weg ist

> Ist bei „Abwechselnd“ die Person, die dran ist, am Termin weg, ist die nächste Person der
> Reihenfolge dran, die da ist; nach dem Erledigen geht es wie immer bei der Person nach der weiter,
> die erledigt hat. Die Reihenfolge ändert sich nie, und niemand holt eine Runde nach.

**Quelle:** H-03 (Entscheidung von Enrico, 22.11.2026), H-08

**Offline:** offline lesend, wie REQ-011.

**Regeln**

- **Wer dran ist**, gilt für den nächsten Termin nach REQ-011: Die Zeile zeigt schon vor der Reise,
  wer an diesem Termin dran sein wird, die Haushalt-Zeile ebenso für jeden künftigen Termin.
- **Gespeichert** bleibt die Person, die regulär dran ist; „Als Nächstes dran“ (REQ-003) zeigt und
  ändert sie. Die Vertretung wird abgeleitet.
- **Fairness:** Wer übersprungen wurde, ist nach der vertretenden Person wieder an der Reihe, wie es
  die Reihenfolge ergibt; Runden werden weder nachgeholt noch gutgeschrieben.

**AC-045 — Dienstreise: Nadja übernimmt**

```gherkin
Angenommen  „Bad putzen“ (wöchentlich fr, abwechselnd Enrico ↔ Nadja) ist nächstes Mal Fr 18.12.,
            regulär ist Enrico dran
Wenn        ich am Mi 16.12. „Alle“ ansehe
Dann        zeigt die Zeile von „Bad putzen“ Nadjas Avatar, der Screenreader liest „dran: Nadja“
Und         die geöffnete Aufgabe zeigt „abwechselnd, dran: Nadja (für Enrico, unterwegs)“
Wenn        Nadja „Bad putzen“ am Fr 18.12. abhakt
Dann        ist „Bad putzen“ nächstes Mal Fr 25.12., und dran ist Enrico
```

**AC-046 — Drei Personen**

```gherkin
Angenommen  der Haushalt „WG Berlin“ hat Enrico, Nadja und Vera; „Küche wischen“ wechselt in dieser
            Reihenfolge ab, dran ist Enrico, der am nächsten Termin weg ist
Dann        ist Nadja dran
Wenn        Nadja erledigt
Dann        ist als Nächstes Vera dran, danach Enrico
Angenommen  am nächsten Termin sind Enrico und Nadja weg
Dann        ist Vera dran
```

**AC-047 — Selbst erledigt, obwohl unterwegs**

```gherkin
Angenommen  der Fall aus AC-045; Enrico hakt „Bad putzen“ am Fr 18.12. in Hamburg selbst ab
Dann        steht im Verlauf „Bad putzen“ mit Enricos Avatar und „Fr 18.“
Und         dran ist als Nächstes Nadja
```

**AC-048 — Haushalt-Zeile im Kalender**

```gherkin
Angenommen  der Fall aus AC-045 und „Bad putzen“ wird am 18.12. von Nadja erledigt
Wenn        ich am Mo 14.12. die Woche KW 51 im Kalender ansehe
Dann        steht am Fr 18.12. „○ Bad putzen (N)“
Und         in KW 52 steht am Fr 25.12. „○ Bad putzen (E)“
```

_weitere in Arbeit_

## Ersetzt

_in Arbeit_

## Offline und Konflikte

_in Arbeit_

## Plattformen

_in Arbeit_

## Daten

_in Arbeit_

## Offene Fragen

_in Arbeit_

## Rückverfolgbarkeit

_in Arbeit_
