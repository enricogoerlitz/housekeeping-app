---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-22
---

# 0017 — Erinnerungen an Kalendereinträgen

> **Teilweise abgelöst durch Spec 0051 (26.11.2026):** REQ-005 (Zustellen per Web Push) und REQ-007
> (je Person und je Gerät) gelten nicht mehr; eine fällige Erinnerung erscheint als Mitteilung in
> der App (Glocke). REQ-001 bis REQ-004 und REQ-006 gelten weiter.

## Problem

Wer am Samstag Lasagne plant, muss selbst daran denken, am Freitag das Fleisch aus dem Tiefkühler zu
nehmen. Der Kalender weiß, was ansteht, meldet sich aber nur beim Restaurant mit Reservierung und
über den allgemeinen Tagesüberblick. Eine Erinnerung zu einem bestimmten Eintrag, an einem selbst
gewählten Tag und zu einer selbst gewählten Uhrzeit, gibt es nicht.

## Ziel

- Beim Anlegen eines Eintrags im Kalender lässt sich „Erinnern“ einschalten; der Schalter ist am
  Anfang aus.
- Eingeschaltet wählt man Tag und Uhrzeit und optional einen kurzen Text („Fleisch auftauen“).
- Zur gewählten Zeit kommt eine Benachrichtigung, die den Eintrag nennt und ihn beim Antippen im
  Kalender öffnet.
- Am Eintrag sieht man an einer Glocke, dass und wann erinnert wird, und kann es ändern oder
  ausschalten.
- Wird der Eintrag verschoben, wandert die Erinnerung mit.

## Nicht-Ziele

- **Keine Erinnerungen für Reisen.** Die „Übersicht“ kündigt sie an und zeigt die Karte zum Packen.
- **Keine Erinnerungen für Aufgaben.** Sie haben ihre eigene Uhrzeit (Spec 0013, REQ-007).
- **Keine zweite Erinnerung** am selben Eintrag, keine Wiederholung und kein „Später erinnern“.
- **Keine Knöpfe in der Nachricht** (Spec 0013).
- **Keine Uhrzeit für den Eintrag selbst.** D43 bleibt: Die Uhrzeit der Erinnerung ist nicht die
  Uhrzeit des Eintrags; Einträge stehen weiter nur in einer Tageszeit.
- **Kein Nachholen** verpasster Erinnerungen und **keine Einstellung der Zeitzone** (Spec 0013).
- **Die Reservierungs-Erinnerung** am Restaurant-Eintrag (Spec 0013, REQ-008) ändert sich nicht.

## Konzept in Kürze

- **Ein Block „Erinnern“** steht an zwei Stellen: im zweiten Schritt des Hinzufügen-Fensters (dort,
  wo „Wer isst mit?“ und „Einplanen“ stehen) und im Fenster des Eintrags (das mit „Fertig“
  schließt). Der Block besteht aus dem Schalter „Erinnern“ und, wenn er an ist, aus „Tag“,
  „Uhrzeit“ und „Woran erinnern? (optional)“.
- **Tag** wählt man mit den Chips „Am Tag“, „Am Vortag“ und „Anderes Datum …“. „Anderes Datum …“
  ist der Monatskalender aus Spec 0016 (REQ-005).
- **Gemerkt wird der Abstand**, nicht das Datum: „so viele Tage vor dem Tag des Eintrags, um diese
  Uhrzeit“. Deshalb wandert die Erinnerung mit, wenn der Eintrag verschoben wird.
- **Zustellen** übernimmt der Planer aus Spec 0013 unverändert im Verhalten: alle 5 Minuten, in der
  Zeitzone des Haushalts, höchstens einmal je Gerät, still während einer eigenen Reise.
- **Je Person abschaltbar:** Die Seite „Benachrichtigungen“ bekommt die Art „Erinnerungen an
  Einträgen“, am Anfang an.

| Beispiel                                              | Nachricht                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| Lasagne am Sa 28.11. abends, erinnern am Tag um 17:00 | „Erinnerung: Lasagne · heute Abend“                          |
| dieselbe, erinnern am Vortag um 18:00, Text dazu      | „Erinnerung: Lasagne · morgen Abend · Fleisch auftauen“      |
| dieselbe, erinnern am Do 26.11. um 09:00 (2 Tage vor) | „Erinnerung: Lasagne · Sa 28.11., Abend“                     |
| Eislaufen (Hohenschönhausen) am So 29.11. vormittags  | „Erinnerung: Eislaufen (Hohenschönhausen) · heute Vormittag“ |

In der Oberfläche heißt eine Abwesenheit ab Spec 0016 „Reise“; diese Spec verwendet das Wort so.

## Abhängigkeiten und kritischer Pfad

- **Spec 0013** (Benachrichtigungen): Planer, Zustellung, Seite „Benachrichtigungen“, das
  Uhrzeit-Feld in 5-Minuten-Schritten, die Frage nach der Erlaubnis nur bei einer Handlung (AC-007).
- **Spec 0016** (Kalender direkt bedienen, entsteht parallel): der Baustein „Anderes Datum …“
  (REQ-005) und das Verschieben von Einträgen, auf das REQ-006 hier reagiert; außerdem das
  Tages-Fenster in Monat und Jahr und das Wort „Reise“. Ohne 0016 sind REQ-001 bis REQ-005 und
  REQ-007 mit den Chips „Am Tag“ und „Am Vortag“ baubar.
- **ADR-0014** (Zustellung) und Spec 0013, AC-040 (Inhalt der Nachrichten): Der optionale Text
  braucht einen Nachtrag, siehe Offene Frage 2.
- **Kritischer Pfad:** Benachrichtigungen und Planer sowie eine Änderung am Datenmodell der
  Planeinträge und der persönlichen Benachrichtigungs-Einstellungen. Seit der ersten Veröffentlichung
  (v2026.11.1, 22.11.2026) ist das eine neue, rein ergänzende Migration (Regel 30-database). Der Plan braucht ein kurzes
  Bedrohungsmodell, Negativtests (fremder Haushalt, abgemeldet, ungültige Uhrzeit, Zeitpunkt in der
  Vergangenheit, gelöschter Eintrag) und `/security-check`.

## Anforderungen und Akzeptanzkriterien

Wenn nichts anderes steht: Haushalt „Görlitz“ mit Enrico und Nadja, Zeitzone Europe/Berlin, heute ist
Mittwoch, der 25.11.2026, 12:00. Beide haben ein Gerät mit eingeschalteten Benachrichtigungen und die
Art „Erinnerungen an Einträgen“ an.

### REQ-001 — Beim Anlegen einschalten

> Der zweite Schritt des Hinzufügen-Fensters hat den Schalter „Erinnern“, der am Anfang aus ist;
> eingeschaltet erscheinen „Tag“, „Uhrzeit“ und „Woran erinnern?“.

**Offline:** nur online, wie jedes Anlegen eines Eintrags (ADR-0008).

**Regeln:** Ohne Schalter wird nichts gespeichert und nichts gesendet. Der Schalter merkt sich
nichts über das Fenster hinaus: Beim nächsten Anlegen ist er wieder aus. Wer „Vormerken“ statt
„Einplanen“ wählt, legt einen Eintrag ohne Tag an; dort gibt es den Block nicht (REQ-002).

**AC-001 — Am Anfang aus**

```gherkin
Angenommen  ich füge für Samstag, 28.11., abends „Lasagne“ hinzu und bin im zweiten Schritt
Dann        steht dort der Schalter „Erinnern“ und er ist aus
Und         „Tag“, „Uhrzeit“ und „Woran erinnern?“ sind nicht zu sehen
Wenn        ich „Einplanen“ wähle
Dann        hat der Eintrag keine Glocke und zu ihm wird keine Erinnerung gesendet
```

**AC-002 — Einschalten und einplanen**

```gherkin
Angenommen  ich bin im zweiten Schritt für „Lasagne“ am Samstag, 28.11., abends
Wenn        ich „Erinnern“ einschalte
Dann        erscheinen „Tag“ mit „Am Tag“, „Am Vortag“ und „Anderes Datum …“, „Uhrzeit“ und
            „Woran erinnern? (optional)“
Und         „Am Tag“ ist gewählt und die Uhrzeit steht auf 17:00
Wenn        ich „Einplanen“ wähle
Dann        steht „Lasagne“ am Samstagabend mit einer Glocke und „Erinnerung Sa 17:00“
```

**AC-003 — Vormerken ohne Erinnerung**

```gherkin
Angenommen  ich wähle „+ Hinzufügen“ unter „Vorgemerkt“ und wähle „Shakshuka“
Dann        gibt es im zweiten Schritt keinen Schalter „Erinnern“
```

**AC-004 — Offline**

```gherkin
Angenommen  das Gerät ist offline
Wenn        ich im Kalender „+ Hinzufügen“ ansehe
Dann        ist es ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“
Und         es entsteht weder ein Eintrag noch eine Erinnerung
```

### REQ-002 — Am bestehenden Eintrag sehen, ändern, ausschalten

> Das Fenster eines Eintrags zeigt denselben Block; Einträge mit Erinnerung tragen in der Woche, im
> Tages-Fenster und im Fenster des Eintrags eine Glocke mit Tag und Uhrzeit.

**Offline:** offline lesend; ändern nur online.

**Regeln**

- Ein Eintrag hat höchstens eine Erinnerung.
- Die Glocke zeigt Wochentag und Uhrzeit des Erinnerungstags („Erinnerung Fr 18:00“); liegt er mehr
  als sechs Tage vor dem Eintrag, mit Datum („Erinnerung Fr 20.11. 18:00“). In den Punkten von Monat
  und Jahr erscheint die Glocke nicht.
- Vorgemerkte Einträge (ohne Tag) und Einträge an vergangenen Tagen bieten den Block nicht an.
- Schalter, Tag-Chips und Uhrzeit speichern sofort; der Text speichert mit Enter, beim Verlassen des
  Felds und mit „Fertig“.

**AC-005 — Nachträglich einschalten**

```gherkin
Angenommen  am Samstag, 28.11., steht abends „Lasagne“ ohne Erinnerung
Wenn        ich den Eintrag öffne, „Erinnern“ einschalte, „Am Vortag“ wähle und 18:00 eintrage
Und         „Fertig“ wähle
Dann        zeigt der Eintrag in der Woche und im Tages-Fenster des 28.11. eine Glocke
Und         im Fenster des Eintrags steht „Erinnerung Fr 18:00“
```

**AC-006 — Ausschalten**

```gherkin
Angenommen  „Lasagne“ am Samstagabend hat die Erinnerung „Fr 18:00“ mit dem Text „Fleisch auftauen“
Wenn        ich den Eintrag öffne und „Erinnern“ ausschalte
Dann        verschwinden Glocke, Tag, Uhrzeit und Text
Und         am Freitag um 18:00 wird nichts gesendet
Wenn        ich „Erinnern“ wieder einschalte
Dann        stehen wieder die Anfangswerte und der Text ist leer
```

**AC-007 — Vorgemerkt und vergangen**

```gherkin
Angenommen  unter „Vorgemerkt“ steht „Shakshuka“ und am Montag, 23.11., steht abends „Linsen-Dal“
Wenn        ich „Shakshuka“ öffne
Dann        gibt es keinen Schalter „Erinnern“
Wenn        ich „Linsen-Dal“ öffne
Dann        gibt es keinen Schalter „Erinnern“
```

**AC-008 — Eintrag wurde inzwischen gelöscht**

```gherkin
Angenommen  ich habe „Lasagne“ am Samstagabend geöffnet
Und         Nadja entfernt den Eintrag auf ihrem Gerät
Wenn        ich „Erinnern“ einschalte
Dann        lehnt der Server ab und ich sehe „Hat nicht geklappt – bitte noch einmal versuchen“
Und         es gibt keine Erinnerung
```

### REQ-003 — Tag und Uhrzeit

> Der Tag wird mit „Am Tag“, „Am Vortag“ oder „Anderes Datum …“ gewählt, die Uhrzeit in
> 5-Minuten-Schritten; die Erinnerung liegt nie in der Vergangenheit und nie nach dem Tag des
> Eintrags.

**Offline:** nur online.

**Regeln**

- „Anderes Datum …“ öffnet den Monatskalender aus Spec 0016 (REQ-005). Wählbar sind die Tage von
  heute bis zum Tag des Eintrags; alle anderen sind ausgegraut. Nach der Wahl zeigt der Chip das
  Datum („Do 26.11.“). Trifft die Wahl den Tag des Eintrags oder den Vortag, ist stattdessen „Am
  Tag“ bzw. „Am Vortag“ gewählt.
- Gemerkt wird der Abstand in Tagen vor dem Tag des Eintrags und die Uhrzeit.
- Die Uhrzeit nutzt das Uhrzeit-Feld aus Spec 0013 mit dessen Regel und Meldung für
  5-Minuten-Schritte.
- Liegen Tag und Uhrzeit beim Speichern nicht in der Zukunft (Zeit des Haushalts), wird nicht
  gespeichert und unter der Uhrzeit steht „Liegt in der Vergangenheit“.
- Anfangswerte beim Einschalten: „Am Tag“ und je Tageszeit Vormittag 08:00, Mittag 11:00, Abend
  17:00 (Offene Frage 1, Annahme A). Liegt dieser Anfangswert schon in der Vergangenheit, bleibt die
  Uhrzeit leer und der Schalter speichert erst mit einer gültigen Uhrzeit.

**AC-009 — Am Vortag**

```gherkin
Angenommen  „Lasagne“ steht am Samstag, 28.11., abends, „Erinnern“ ist an mit „Am Tag“ 17:00
Wenn        ich „Am Vortag“ wähle und die Uhrzeit auf 18:00 ändere
Dann        steht am Eintrag „Erinnerung Fr 18:00“
```

**AC-010 — Anderes Datum**

```gherkin
Angenommen  „Lasagne“ steht am Samstag, 28.11., abends, „Erinnern“ ist an
Wenn        ich „Anderes Datum …“ wähle
Dann        öffnet sich der Monatskalender mit November 2026
Und         wählbar sind nur der 25., 26., 27. und 28.11.
Wenn        ich den 26. wähle und 09:00 eintrage
Dann        zeigt der Chip „Do 26.11.“ und am Eintrag steht „Erinnerung Do 09:00“
```

**AC-011 — In der Vergangenheit**

```gherkin
Angenommen  heute ist Mittwoch, 25.11., 12:00 und am Mittwochabend steht „Curry“
Wenn        ich „Erinnern“ einschalte und 11:00 eintrage
Dann        steht unter der Uhrzeit „Liegt in der Vergangenheit“
Und         der Eintrag hat keine Glocke und es wird nichts gesendet
Wenn        ich 16:00 eintrage
Dann        verschwindet der Hinweis und am Eintrag steht „Erinnerung Mi 16:00“
```

Gilt so im Hinzufügen-Fenster. Im Eintragsfenster speichert schon das Einschalten die vorgeschlagene
Uhrzeit (REQ-002, hier 17:00); eine danach abgelehnte Eingabe wie 11:00 lässt diese gespeicherte
Erinnerung stehen, wie bei AC-012 und AC-013 (geklärt bei der Umsetzung, 22.11.2026).

**AC-012 — Keine 5-Minuten-Uhrzeit**

```gherkin
Angenommen  „Erinnern“ ist an „Lasagne“ am Samstagabend an mit 17:00
Wenn        ich als Uhrzeit 17:03 eintrage
Dann        zeigt das Uhrzeit-Feld seine Meldung für 5-Minuten-Schritte (Spec 0013)
Und         die Erinnerung bleibt bei 17:00
```

**AC-013 — Der Server prüft selbst**

```gherkin
Angenommen  ein Aufruf am Fenster vorbei will für „Lasagne“ die Uhrzeit 17:03, einen Tag nach dem
            Eintrag oder einen Zeitpunkt in der Vergangenheit speichern
Dann        lehnt der Server jeden dieser Aufrufe ab und der Eintrag bleibt unverändert
```

### REQ-004 — Text zur Erinnerung

> „Woran erinnern?“ nimmt optional bis zu 80 Zeichen auf, die in der Nachricht stehen.

**Offline:** nur online.

**Regeln:** Der Text ist für die Nachricht geschrieben und hat nichts mit der Notiz eines Rezepts
oder Restaurants zu tun; die erscheint weiter nie in einer Nachricht (Spec 0013, AC-040). Der Name
des Eintrags steht in der Nachricht wie im Kalender, bei Aktivitäten also mit Zusatz, z. B.
„Eislaufen (Hohenschönhausen)“, wie schon im Tagesüberblick (geändert am 22.11.2026). Zeilenumbrüche und andere Steuerzeichen sind nicht erlaubt; Leerzeichen am
Anfang und Ende fallen weg. Der Text gilt unter Annahme A der Offenen Frage 2.

**AC-014 — Text steht in der Nachricht**

```gherkin
Angenommen  „Lasagne“ am Samstag, 28.11., abends hat die Erinnerung „Am Vortag“ 18:00
Wenn        ich bei „Woran erinnern?“ „Fleisch auftauen“ eintrage und „Fertig“ wähle
Und         es wird Freitag, 27.11., 18:00
Dann        bekommen Enrico und Nadja „Erinnerung: Lasagne · morgen Abend · Fleisch auftauen“
```

**AC-015 — Zu lang oder mit Steuerzeichen**

```gherkin
Angenommen  das Feld „Woran erinnern?“ ist leer
Wenn        ich 81 Zeichen eintippe
Dann        nimmt das Feld nur die ersten 80 an und zeigt „80/80“
Wenn        ein Aufruf am Fenster vorbei 81 Zeichen oder einen Zeilenumbruch speichern will
Dann        lehnt der Server ab und der Text bleibt, wie er war
```

### REQ-005 — Zustellen

> Zur gewählten Zeit bekommen die Empfänger auf jedem ihrer eingeschalteten Geräte genau eine
> Nachricht, die den Eintrag nennt und ihn beim Antippen im Kalender öffnet.

**Offline:** Die Zustellung geschieht auf dem Server und hängt nicht davon ab, ob das Gerät, das die
Erinnerung gesetzt hat, online ist.

**Regeln**

- **Wann:** über den Planer aus Spec 0013: alle 5 Minuten, in der Zeitzone des Haushalts. Was mehr
  als 30 Minuten zu spät wäre, entfällt; nachgeholt wird nichts.
- **Einmal:** höchstens eine Nachricht je Erinnerung und Gerät. Eine geänderte Erinnerung (anderer
  Tag oder andere Uhrzeit) zählt als neue.
- **An wen (Offene Frage 3, Annahme A):** alle, die bei „Wer isst mit?“ stehen; bei Einträgen ohne
  diese Angabe oder mit leerer Angabe alle Mitglieder.
- **Text:** Titel „Housekeeping“. Inhalt „Erinnerung: <Name des Eintrags wie im Kalender> ·
  <Wann>“, mit Text aus REQ-004 danach „ · <Text>“. <Wann> ist „heute <Tageszeit>“, wenn der Eintrag
  am Tag des Sendens liegt, „morgen <Tageszeit>“ am Vortag, sonst „<Wochentag> <Tag>.<Monat>.,
  <Tageszeit>“. Ein sehr langer Name wird mit „…“ gekürzt, sodass die Nachricht höchstens 400
  Zeichen hat.
- **Antippen** öffnet den Kalender am Tag des Eintrags mit geöffnetem Eintrag (vorhandener Link aus
  Spec 0013).
- **Ruhe:** Wer am Tag des Sendens oder am Tag des Eintrags auf Reise ist (auch Reise des ganzen
  Haushalts), bekommt nichts. Wer den Haushalt verlassen hat, bekommt nichts. Zu einem gelöschten
  Eintrag kommt nichts.

**AC-016 — Pünktlich mit Sprung zum Eintrag**

```gherkin
Angenommen  „Lasagne“ am Samstag, 28.11., abends mit Enrico und Nadja bei „Wer isst mit?“ und der
            Erinnerung „Am Tag“ 17:00
Wenn        es Samstag, 28.11., 17:00 wird
Dann        bekommen Enrico und Nadja bis 17:05 „Erinnerung: Lasagne · heute Abend“
Wenn        Nadja die Nachricht antippt
Dann        öffnet sich der Kalender am 28.11. mit dem geöffneten Eintrag „Lasagne“
```

**AC-017 — Nur wer mitisst**

```gherkin
Angenommen  „Lasagne“ am Samstagabend, bei „Wer isst mit?“ steht nur Nadja, Erinnerung „Am Tag“ 17:00
Wenn        es Samstag, 17:00 wird
Dann        bekommt Nadja die Nachricht und Enrico keine
```

**AC-018 — Einmal und nicht nachträglich**

```gherkin
Angenommen  „Lasagne“ am Samstagabend mit der Erinnerung „Am Tag“ 17:00
Wenn        der Planer um 17:00 und um 17:05 läuft
Dann        hat jedes Gerät genau eine Nachricht bekommen
Angenommen  stattdessen läuft der Planer zwischen 16:55 und 17:35 gar nicht
Wenn        er um 17:35 wieder läuft
Dann        wird die Erinnerung nicht mehr gesendet
```

**AC-019 — Still auf Reise**

```gherkin
Angenommen  Enrico ist vom 27.11. bis 28.11. auf Reise, Nadja nicht
Und         „Lasagne“ am Sonntag, 29.11., mittags hat die Erinnerung „Am Vortag“ 18:00
Wenn        es Samstag, 28.11., 18:00 wird
Dann        bekommt Nadja „Erinnerung: Lasagne · morgen Mittag“ und Enrico nichts
```

**AC-020 — Gelöscht, ausgetreten, fremder Haushalt**

```gherkin
Angenommen  „Lasagne“ am Samstagabend mit der Erinnerung „Am Tag“ 17:00
Und         im Haushalt „Schmidt“ ist Jana Mitglied, die nicht zum Haushalt „Görlitz“ gehört
Wenn        Nadja den Eintrag um 16:00 entfernt und es 17:00 wird
Dann        bekommt niemand eine Nachricht
Angenommen  stattdessen verlässt Nadja um 16:00 den Haushalt
Wenn        es 17:00 wird
Dann        bekommt Enrico die Nachricht, Nadja und Jana bekommen keine
```

### REQ-006 — Die Erinnerung geht mit dem Eintrag

> Wird der Eintrag verschoben, verschiebt sich die Erinnerung um dieselbe Zahl von Tagen; wird er
> vorgemerkt oder gelöscht, verschwindet sie, und „Rückgängig“ bringt sie zurück.

**Offline:** nur online, wie das Verschieben selbst (Spec 0016).

**Regeln**

- Verschieben auf einen anderen Tag (per Ziehen oder „Verschieben …“, Spec 0016) lässt Abstand,
  Uhrzeit und Text unverändert. Ein Wechsel der Tageszeit ändert die Uhrzeit nicht.
- Liegt die Erinnerung nach dem Verschieben in der Vergangenheit, wird sie nicht gesendet. Der
  Hinweis nach dem Verschieben bekommt den Zusatz „Erinnerung liegt in der Vergangenheit“, und am
  Eintrag steht statt der Zeit „Erinnerung vorbei“. Dasselbe steht an jedem Eintrag, dessen
  Erinnerungszeit verstrichen ist.
- Zurücklegen nach „Vorgemerkt“ und Entfernen des Eintrags löschen die Erinnerung. „Rückgängig“
  stellt Eintrag und Erinnerung wieder her.

**AC-021 — Verschieben nimmt die Erinnerung mit**

```gherkin
Angenommen  „Lasagne“ am Samstag, 28.11., abends mit der Erinnerung „Am Vortag“ 18:00
Wenn        ich den Eintrag auf Sonntag, 29.11., mittags verschiebe
Dann        steht am Eintrag „Erinnerung Sa 18:00“
Und         am Freitag um 18:00 wird nichts gesendet
Und         am Samstag um 18:00 kommt „Erinnerung: Lasagne · morgen Mittag“
```

**AC-022 — Nach dem Verschieben in der Vergangenheit**

```gherkin
Angenommen  heute ist Mittwoch, 25.11., 12:00
Und         „Lasagne“ am Samstag, 28.11., abends hat die Erinnerung „Am Vortag“ 18:00
Wenn        ich den Eintrag auf heute Abend verschiebe
Dann        steht im Hinweis zum Verschieben zusätzlich „Erinnerung liegt in der Vergangenheit“
Und         am Eintrag steht „Erinnerung vorbei“ und es wird nichts gesendet
Wenn        ich „Rückgängig“ wähle
Dann        steht der Eintrag wieder am Samstagabend mit „Erinnerung Fr 18:00“
```

**AC-023 — Vormerken und zurück**

```gherkin
Angenommen  „Lasagne“ am Samstagabend mit der Erinnerung „Am Tag“ 17:00 und dem Text „Käse kaufen“
Wenn        ich den Eintrag nach „Vorgemerkt“ lege
Dann        hat er keine Glocke und am Samstag um 17:00 wird nichts gesendet
Wenn        ich innerhalb von 5 Sekunden „Rückgängig“ wähle
Dann        steht er wieder am Samstagabend mit „Erinnerung Sa 17:00“ und dem Text „Käse kaufen“
```

**AC-024 — Entfernen und zurück**

```gherkin
Angenommen  „Lasagne“ am Samstagabend mit der Erinnerung „Am Tag“ 17:00
Wenn        ich den Eintrag entferne und „Rückgängig“ wähle
Dann        steht er wieder da mit „Erinnerung Sa 17:00“
Wenn        ich ihn entferne und nicht „Rückgängig“ wähle
Dann        wird am Samstag um 17:00 nichts gesendet
```

Randfall (geklärt bei der Umsetzung, 22.11.2026): Ist die Erinnerung beim „Rückgängig“ schon
verstrichen, kommt der Eintrag ohne sie zurück. Die Datenbank lehnt eine Erinnerung in der
Vergangenheit beim Anlegen ab, und sonst ginge das ganze Rückgängig verloren; gesendet würde sie
ohnehin nicht mehr.

### REQ-007 — Je Person und je Gerät

> Die Seite „Benachrichtigungen“ hat die Art „Erinnerungen an Einträgen“, die jede Person für sich
> schaltet; wer an einem Eintrag „Erinnern“ einschaltet, wird auf diesem Gerät nach der Erlaubnis
> gefragt.

**Offline:** Einstellung ändern nur online; die Seite ist offline lesbar (Spec 0013).

**Regeln**

- Die Art steht unter „Was und wann“, ist am Anfang an und gilt für alle Geräte der Person. Sie hat
  keine eigene Uhrzeit.
- Die Erlaubnis für dieses Gerät wird beim Einschalten von „Erinnern“ gefragt, nie beim Start (Spec
  0013, AC-007). Wer ablehnt, kann die Erinnerung trotzdem speichern.
- Kann oder darf dieses Gerät keine Benachrichtigungen zeigen, steht unter dem Schalter „Auf diesem
  Gerät kommen keine Benachrichtigungen an“ mit dem Link „Benachrichtigungen“. Hat die Person die
  Art ausgeschaltet, steht dort „Erinnerungen an Einträgen sind bei dir aus“ mit demselben Link.

**AC-025 — Art ausschalten**

```gherkin
Angenommen  „Lasagne“ am Samstagabend, Enrico und Nadja essen mit, Erinnerung „Am Tag“ 17:00
Und         Enrico schaltet auf „Benachrichtigungen“ die Art „Erinnerungen an Einträgen“ aus
Wenn        es Samstag, 17:00 wird
Dann        bekommt Nadja die Nachricht und Enrico auf keinem seiner Geräte
```

**AC-026 — Erlaubnis erst beim Einschalten**

```gherkin
Angenommen  dieses Gerät wurde noch nie nach der Erlaubnis für Benachrichtigungen gefragt
Wenn        ich die App öffne und den Kalender ansehe
Dann        fragt das Gerät nicht
Wenn        ich an „Lasagne“ „Erinnern“ einschalte
Dann        fragt das Gerät nach der Erlaubnis
Wenn        ich ablehne
Dann        bleibt die Erinnerung gespeichert und unter dem Schalter steht „Auf diesem Gerät kommen
            keine Benachrichtigungen an“ mit dem Link „Benachrichtigungen“
```

**AC-027 — Einstellung einer anderen Person**

```gherkin
Angenommen  Nadja ist angemeldet
Wenn        ein Aufruf am Fenster vorbei Enricos Art „Erinnerungen an Einträgen“ ausschalten will
Dann        lehnt der Server ab und Enricos Einstellung bleibt an
```

## Offline und Konflikte

| Bereich                                                                | Verhalten                                                                                                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Glocke und „Erinnerung Fr 18:00“ lesen                                 | offline vollständig aus dem lokalen Speicher                                                                                                               |
| „Erinnern“ ein- und ausschalten, Tag, Uhrzeit, Text ändern             | nur online; ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“ (ADR-0008)                                                                          |
| Art „Erinnerungen an Einträgen“ schalten                               | nur online (wie Spec 0013, REQ-004)                                                                                                                        |
| Zustellen                                                              | auf dem Server; unabhängig davon, ob das einstellende Gerät online ist. Ein Gerät ohne Netz bekommt sie verspätet oder, nach Ablauf, gar nicht (Spec 0013) |
| Zwei Personen ändern dieselbe Erinnerung                               | je Feld gewinnt die letzte Änderung (`sync.md`)                                                                                                            |
| Eine Person setzt eine Erinnerung, die andere hat den Eintrag gelöscht | der Server lehnt ab, „Hat nicht geklappt – bitte noch einmal versuchen“ (AC-008, ADR-0011)                                                                 |
| Eine Person verschiebt den Eintrag, die andere ändert die Uhrzeit      | beide Änderungen gelten; die Erinnerung liegt am neuen Tag zur neuen Uhrzeit, weil nur der Abstand gemerkt ist                                             |
| Erinnerung wird kurz vor der Sendezeit geändert                        | gesendet wird, was beim Lauf des Planers gilt; die alte Zeit sendet nichts mehr                                                                            |

## Plattformen

- **Handy:** Der Block steht im zweiten Schritt des Hinzufügen-Fensters unter „Wer isst mit?“ und
  im Fenster des Eintrags über „Verschieben“; die Fenster behalten ihre feste Größe und rollen.
- **Tablet und Desktop:** gleicher Block; „Anderes Datum …“ öffnet den Monatskalender im selben
  Fenster.
- **Tastatur:** Schalter, Chips und Felder sind in dieser Reihenfolge erreichbar; Enter im
  Uhrzeit-Feld und im Textfeld speichert.
- **Screenreader:** Die Glocke hat eine Textfassung, z. B. „Lasagne, Erinnerung Freitag 18 Uhr“ bzw.
  „Erinnerung vorbei“. Der Schalter nennt seinen Zustand.
- **iPhone und iPad:** Benachrichtigungen kommen nur in der installierten App an (Spec 0013,
  AC-006); der Hinweis aus REQ-007 erklärt das mit dem Link „Benachrichtigungen“.
- **Native Apps** (Spec 0015, Entwurf): gleiche Regeln und derselbe Planer.

## Daten

- **Gelesen:** Planeinträge mit ihrer Erinnerung, Rezepte, Restaurants, Aktivitäten (für den Namen),
  Mitglieder, Reisen (für die Ruhe), die eigenen Benachrichtigungs-Einstellungen.
- **Geschrieben:** am Planeintrag Abstand in Tagen, Uhrzeit und Text der Erinnerung; in den eigenen
  Benachrichtigungs-Einstellungen der Schalter der neuen Art. Im Zustell-Protokoll des Servers je
  Nachricht ein Eintrag ohne Inhalt, wie bisher.
- **Gelöscht:** mit dem Eintrag, beim Vormerken und beim Ausschalten.
- **Personenbezogen:** Der Text ist frei geschrieben und erscheint auf Sperrbildschirmen der
  Empfänger; die App weist darauf nicht eigens hin. Ihn sehen nur Mitglieder des Haushalts. Unter
  Annahme A der Offenen Frage 3 entsteht kein neues personenbezogenes Feld; Variante B bräuchte „wer
  hat eingeschaltet“.
- **Nachricht:** enthält nur Titel, Text und Link (ADR-0014); keine Kennung anderer Mitglieder, kein
  Zusatz, keine Notiz.

## Offene Fragen

| #   | Frage                                                                                           | Optionen                                                                                                                                                                                                                                                                                                       | Empfehlung                                                                                              | Status                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Welche Werte stehen beim Einschalten?                                                           | A: „Am Tag“, Vormittag 08:00, Mittag 11:00, Abend 17:00 — Pro: ein Tipp genügt meist, Vorlauf zum Kochen; Contra: vier erfundene Standardzeiten · B: Tag und Uhrzeit leer, beides muss gewählt werden — Pro: nichts geraten; Contra: immer drei Tipps mehr                                                     | A, weil „einschalten und fertig“ der häufigste Fall ist und alles änderbar bleibt                       | OFFEN, Annahme A                                                                                                                                                                              |
| 2   | Darf ein frei geschriebener Text in der Nachricht stehen (Spec 0013, AC-040 verbietet Notizen)? | A: ja, nur dieser eigens dafür geschriebene Text, 80 Zeichen — Pro: „Fleisch auftauen“ ist der eigentliche Nutzen; Contra: Nachtrag zu ADR-0014 und AC-040 nötig, Text auf dem Sperrbildschirm · B: kein Text, nur Name und Zeit — Pro: Regel bleibt unverändert; Contra: man muss raten, woran                | A, weil der Text bewusst für die Nachricht geschrieben wird; Notizen und Zusätze bleiben ausgeschlossen | OFFEN, Annahme A                                                                                                                                                                              |
| 3   | Wer bekommt die Erinnerung?                                                                     | A: alle bei „Wer isst mit?“, leer oder ohne Angabe alle Mitglieder — Pro: wie die Reservierungs-Erinnerung (D39), kein neues Feld; Contra: Nadja bekommt Enricos „Fleisch auftauen“ auch · B: nur wer eingeschaltet hat — Pro: wie in Outlook; Contra: neues personenbezogenes Feld, der andere erfährt nichts | A, weil Einträge dem Haushalt gehören und jede Person die Art für sich ausschalten kann                 | OFFEN, Annahme A                                                                                                                                                                              |
| 4   | Reservierungs-Erinnerung und neue Erinnerung am Restaurant-Eintrag: zwei Blöcke oder einer?     | A: beide bleiben nebeneinander („Erinnern 2 h vorher“ an der Reservierung, „Erinnern“ für Tag und Uhrzeit) — Pro: Spec 0013 bleibt unberührt; Contra: zwei ähnliche Zeilen · B: zu einem Block zusammenlegen — Pro: ein Begriff; Contra: Umbau von gebautem Verhalten und Daten                                | A, weil B gebautes Verhalten ändert, ohne dass ein Problem bekannt ist; später neu bewerten             | OFFEN, Annahme A                                                                                                                                                                              |
| 5   | Haben Aktivitäten eine Angabe, wer dabei ist, die für Frage 3 zählt?                            | A: nein, bei Aktivitäten bekommen alle Mitglieder die Erinnerung (wie „Aktivitäten am Vortag“) · B: die Angabe am Eintrag zählt, falls es sie gibt                                                                                                                                                             | Im Plan am gebauten Stand prüfen; die Regel in REQ-005 deckt beide Fälle ab                             | ENTSCHIEDEN: bei Aktivitäten alle Mitglieder; ihre Liste „Wer isst mit?“ wird beim Einplanen still gesetzt und ist nicht änderbar (Claude nach Enricos Regel „Empfehlung nehmen“, 22.11.2026) |
| 6   | Anfangsuhrzeit bei umbenannten oder eigenen Tageszeiten?                                        | A: nach Namen (Vormittag 08:00, Mittag 11:00, Abend 17:00), sonst 08:00 · B: nach Reihenfolge                                                                                                                                                                                                                  | A, weil der Name die Bedeutung trägt                                                                    | ENTSCHIEDEN: A (22.11.2026)                                                                                                                                                                   |
| 7   | Höchster Abstand zwischen Erinnerung und Eintrag?                                               | A: 366 Tage · B: unbegrenzt                                                                                                                                                                                                                                                                                    | A, weil es ein Jahr Vorlauf abdeckt und die Datenbank eine Grenze prüfen kann                           | ENTSCHIEDEN: A (22.11.2026)                                                                                                                                                                   |
| 8   | Dringlichkeit der Nachricht?                                                                    | A: hoch, wie Aufgabe und Reservierung · B: normal                                                                                                                                                                                                                                                              | A, weil sie zu einer Uhrzeit ankommen soll                                                              | ENTSCHIEDEN: A (22.11.2026)                                                                                                                                                                   |

## Rückverfolgbarkeit

| REQ     | AC             | Task (plan.md) | Test                                                                                                                    |
| ------- | -------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| REQ-001 | AC-001–AC-004  | 5, 6           | e2e `rundgang-erinnerungen` AC-001–AC-003; core `reminder-form.test`; api `commands-plan.backend.test` AC-002–AC-004    |
| REQ-002 | AC-005–AC-008  | 5–7            | e2e `rundgang-erinnerungen` AC-005–AC-007, Glocke; pgTAP `entry_reminders.test`; api AC-006, AC-008                     |
| REQ-003 | AC-009–AC-013  | 3, 5           | core `reminder.test`, `reminder-form.test` AC-009–AC-012; pgTAP `entry_reminders.test` AC-011–AC-013; e2e AC-010–AC-012 |
| REQ-004 | AC-014, AC-015 | 1–3            | Planer-pgTAP AC-014; pgTAP AC-015; core `reminder.test` AC-015; e2e AC-014, AC-015                                      |
| REQ-005 | AC-016–AC-020  | 2              | pgTAP `entry_reminder_scheduler.test` AC-016–AC-020; `notification_parity.test`                                         |
| REQ-006 | AC-021–AC-024  | 4, 9           | core `plan-move.test` AC-021–AC-023; api AC-022, AC-024; pgTAP AC-021, AC-023, AC-024; e2e AC-021–AC-023                |
| REQ-007 | AC-025–AC-027  | 4, 8           | api `commands-notifications.test` AC-025; pgTAP AC-027; e2e AC-026, `rundgang-benachrichtigungen`                       |
