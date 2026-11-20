---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-20
---

# 0013 — Benachrichtigungen

## Problem

Die App meldet sich nie von selbst. Wer morgens nicht hineinschaut, merkt erst am Abend, dass er
heute kocht; der Müll steht zu spät an der Straße, und an die Reservierung um 19:30 denkt man um
19:15. Gleichzeitig dürfen Erinnerungen nicht nerven: keine Nachrichten über die andere Person,
nichts während des Urlaubs, nichts doppelt.

## Ziel

- Jede Person stellt einmal ein, welche Benachrichtigungen sie wann bekommt; das gilt auf allen
  ihren Geräten. Je Gerät gibt es nur „an“ oder „aus“.
- Ein Tagesüberblick am Morgen, Aktivitäten am Vorabend, Aufgaben mit Uhrzeit und
  Restaurant-Reservierungen kommen pünktlich und genau einmal per Web Push.
- Nachrichten bekommt nur, wen sie betreffen; während einer eigenen Abwesenheit kommt nichts.
- Lokal lässt sich alles in Desktop-Chrome prüfen, und nirgends liegt ein `service_role`-Schlüssel.

## Nicht-Ziele

- **Keine nativen Push-Nachrichten (Expo).** Sie kommen mit den nativen Apps.
- **Keine Nachrichten auf iPhone, iPad und Handys vor der Betriebs- bzw. Cloud-Spec.** Web Push
  braucht eine öffentliche HTTPS-Adresse; nur `localhost` am Rechner geht ohne.
- **Keine E-Mail und keine SMS.**
- **Keine Nachrichten zwischen Personen** („Nadja erinnern“ gibt es nicht, F8).
- **Keine weiteren Arten aus F8:** keine Wochenvorschau, kein „Enrico ist bei Rewe – noch was?“,
  kein „Dein Feedback wurde umgesetzt“, keine Erinnerung an die Packliste (Konzept, Anhang B).
- **Keine Uhrzeit für Rezepte, Sammlungen und Aktivitäten** (D43; Spec 0004, Nicht-Ziel).
- **Keine Knöpfe in der Nachricht** („Erledigt“, „Später“); ein Tipp öffnet die passende Seite.
- **Keine Einstellung der Zeitzone in der Oberfläche.** Jeder Haushalt hat „Europe/Berlin“.
- **Kein Nachholen:** Was mehr als 30 Minuten zu spät käme, wird verworfen.

## Konzept in Kürze

Grundlage ist das freigegebene UI-Konzept v2 (`docs/product/ui-konzept-v2.md`, Abschnitte 3.11,
3.14, 4.9; Entscheidungen D28, D36 bis D43) und F8 des Feature-Konzepts.

| Art                         | Beispiel                                                                                                           | Wann                                                                | an wen (D39)                                                | am Anfang (D36) |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------- | --------------- |
| **Tagesüberblick**          | „Heute: Bouldern (Vormittag) · Lasagne (Abend, du kochst) · Bad putzen (du) · Für morgen: Kichererbsen einweichen“ | täglich zur eigenen Uhrzeit, Standard 7:30; nur, wenn es etwas gibt | jede Person ihren Teil                                      | aus             |
| **Aktivitäten am Vortag**   | „Morgen: Eislaufen (Hohenschönhausen), Vormittag“                                                                  | am Vortag zur eigenen Uhrzeit, Standard 19:00                       | alle, die am Tag der Aktivität nicht abwesend sind          | aus             |
| **Aufgaben mit Uhrzeit**    | „Müll rausbringen · 19:00 · du bist dran“                                                                          | zur Uhrzeit der Aufgabe am Fälligkeitstag                           | wer dran ist; bei „egal wer“ und „zu zweit“ alle Mitglieder | an              |
| **Restaurant-Reservierung** | „Trattoria Da Enzo um 19:30 · in 2 Stunden · Route ›“                                                              | n Stunden vor der Reservierung, Standard 2 h, je Eintrag änderbar   | wer mitisst                                                 | an              |

- **Tagesüberblick** ist eine einzige Nachricht (D37). Jede Person wählt die Teile: Essen
  (Rezepte, Sammlungen, Restaurants), Aktivitäten, Aufgaben (fällig und überfällig), Vorbereitung
  für morgen. Sammlungen gibt es erst mit Spec 0009, die in derselben Welle 5 entsteht; der Teil
  „Essen“ nennt sie, sobald es sie gibt, wie ein Rezept. Überfälliges steht nur hier, nie als eigene
  Nachricht, also höchstens einmal je Aufgabe und Tag.
- **Ruhe:** Während einer eigenen Abwesenheit (auch der des ganzen Haushalts) kommt nichts (F14).
  Wer den Haushalt verlässt, bekommt aus ihm nichts mehr.
- **Seite „Benachrichtigungen“** in den persönlichen Einstellungen über den Avatar (D41, D28):
  „Dieses Gerät“ (Status, Schalter, „Probe senden“), „Was und wann · gilt für alle Geräte“ (je Art
  Schalter, Uhrzeit, beim Tagesüberblick die Teile; D38), „Deine Geräte“ (mit „Entfernen“). Die
  App fragt die Erlaubnis nur, wenn man etwas einschaltet oder eine Uhrzeit setzt, nie beim Start.
- **Uhrzeiten setzen:** Aufgabe (Bearbeiten, Spec 0011) bekommt ein optionales Feld „Uhrzeit“ (D42);
  „Zu tun“ und die Haushalt-Zeile zeigen „19:00“. Ein Restaurant-Eintrag im Kalender bekommt
  „Reserviert um 19:30“ und „Erinnern 2 h vorher ▾“ (D43); die Karte auf der „Übersicht“ zeigt die
  Uhrzeit.
- **Technischer Rahmen (entschieden, D40):** Web Push an die installierte PWA bzw. den Browser,
  Service Worker zeigt die Nachricht an. Die Datenbank plant: `pg_cron` startet alle 5 Minuten eine
  Datenbankfunktion, die fällige Nachrichten in der Zeitzone des Haushalts findet, jede mit
  eindeutigem Schlüssel ins Zustell-Protokoll schreibt und sie per `pg_net` mit einem geteilten
  Geheimnis aus dem Supabase Vault an die Edge Function `push-send` gibt. `push-send` prüft
  Geheimnis und Inhalt und stellt mit dem privaten VAPID-Schlüssel zu; sie hat keinen
  Datenbankzugang und kein `service_role`. Der nächste Takt wertet die Antworten aus.

## Abhängigkeiten, Voraussetzungen und kritischer Pfad

| Spec bzw. Dokument                | Was diese Spec daraus braucht                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0003                              | Anmeldung, Mitgliedschaften, Service Worker der PWA, `pg_cron`, Edge Functions                                                   |
| 0005                              | persönliche Einstellungen hinter dem Avatar (Profil, Darstellung, Benachrichtigungen, Abmelden), Layout „Liste und Detail“       |
| 0010                              | Fenster eines Kalendereintrags (für die Reservierung), Haushalt-Zeile (zeigt die Uhrzeit), Abwesenheiten                         |
| 0011                              | „Aufgabe bearbeiten“ (für die Uhrzeit), „Übersicht“ mit Tagesauswahl, Rhythmus „bei Bedarf“                                      |
| Betriebs- bzw. Cloud-Spec (offen) | öffentliche HTTPS-Adresse; erst damit kommen Nachrichten auf iPhone, iPad (als installierte PWA, ab iOS 16.4) und Android-Handys |

**Voraussetzungen vor dem Bau:**

1. **Neue ADR „Benachrichtigungen per Web Push“:** Zeitplaner in der Datenbank (`pg_cron` +
   `pg_net`), Zustellung über `push-send` ohne Datenbankzugang, geteiltes Geheimnis im Vault,
   VAPID-Schlüsselpaar, Umgang mit Push-Abos und dem Zustell-Protokoll, Verhalten bei pausiertem
   Projekt (ADR-0007).
2. **Präzisierung von Regel 5 in `AGENTS.md`** (und der passenden Regeln in `.claude/rules/`):
   Push-Abos gehören einer Person, nicht einem Haushalt, und werden nicht synchronisiert; das
   Zustell-Protokoll gehört dem Server. Dazu Regel 4: Die Liste „Deine Geräte“ wird online gelesen,
   nicht aus dem lokalen Speicher. Das Feature-Konzept (Abschnitt 6) sieht dafür auch einen Nachtrag
   zu ADR-0008 vor, falls die neue ADR das nicht abdeckt.
3. **Neue Namen in `.env.example`** (nur Namen): öffentlicher VAPID-Schlüssel für den App-Build,
   privater VAPID-Schlüssel und geteiltes Geheimnis als Secrets der Function bzw. im Vault.

**Kritischer Pfad:** Sicherheit (neue personenbezogene Tabellen, eine Function, die von außen
aufgerufen werden kann, Push-Adressen als Ziel ausgehender Aufrufe) und Infrastruktur (Zeitplaner,
`pg_net`, Secrets). Der Plan braucht ein Bedrohungsmodell, Negativtests (fremder Haushalt,
abgemeldet, ungültiges Abo, gefälschter Aufruf der Function, ausgeschaltet, doppelt, abwesend) und
`/security-check`.

## Anforderungen und Akzeptanzkriterien

Beispieldatum ist, wenn nicht anders genannt, **Freitag, 20.11.2026**. Der Haushalt „Enrico &
Nadja“ hat die Mitglieder Enrico (E) und Nadja (N) und die Zeitzone „Europe/Berlin“. „Takt“ meint
den Lauf des Zeitplaners alle 5 Minuten. Alle Uhrzeiten sind Ortszeit des Haushalts.

**Geändert am 21.11.2026:** Die Seite „Heute“ heißt „Übersicht“ (Spec 0005, AC-061; Spec 0011). Der
neue Name ist in AC-027, AC-037 und AC-038 eingesetzt; sonst ändern sich diese Kriterien nicht. Der
Text des Tagesüberblicks beginnt weiter mit „Heute:“, weil er den heutigen Tag meint.

### REQ-001 — Seite „Benachrichtigungen“

> Die Seite „Benachrichtigungen“ liegt in den persönlichen Einstellungen (Avatar) und hat die
> Abschnitte „Dieses Gerät“, „Was und wann“ und „Deine Geräte“.

**Offline:** offline lesend — die eigenen Einstellungen kommen aus dem lokalen Speicher; Ändern,
„Probe senden“ und „Deine Geräte“ brauchen Netz.

**AC-001 — Erreichbar über den Avatar**

```gherkin
Angenommen  Enrico hat an den Benachrichtigungen nichts verändert
Wenn        er auf seinen Avatar tippt
Dann        steht in den Einstellungen die Zeile „Benachrichtigungen · 2 an ›“
Wenn        er darauf tippt
Dann        sieht er die Abschnitte „Dieses Gerät“, „Was und wann · gilt für alle Geräte“ und „Deine
            Geräte“ sowie den Satz „Während Abwesenheiten bist du stumm.“
Und         unter „Verwalten“ gibt es keinen Eintrag „Benachrichtigungen“
```

**AC-002 — Desktop**

```gherkin
Angenommen  Desktopbreite (1440 px)
Wenn        ich in den Einstellungen „Benachrichtigungen“ wähle
Dann        stehen die Einstellungen links als Liste und „Benachrichtigungen“ rechts daneben
```

### REQ-002 — Dieses Gerät anmelden

> Ein Gerät wird erst angemeldet, wenn die Person auf ihm etwas einschaltet oder eine Uhrzeit setzt;
> die Seite zeigt den Stand der Erlaubnis, und der Schalter „Auf diesem Gerät benachrichtigen“
> schaltet nur dieses Gerät an oder aus.

**Offline:** nur online — Anmelden braucht den Push-Dienst des Browsers und den Server; ohne Netz
ist der Schalter ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“.

**AC-003 — Nie beim Start fragen**

```gherkin
Angenommen  Enrico hat auf seinem Mac nie Benachrichtigungen erlaubt oder abgelehnt
Wenn        er die App startet und durch alle Bereiche geht
Dann        fragt der Browser nicht nach der Erlaubnis
```

**AC-004 — Einschalten erlaubt**

```gherkin
Angenommen  Enricos Mac (Chrome) ist nicht angemeldet
Wenn        er „Auf diesem Gerät benachrichtigen“ einschaltet und im Browser „Erlauben“ wählt
Dann        zeigt „Dieses Gerät“ „Mac · Chrome · ✓ erlaubt“ und den Schalter an
Und         unter „Deine Geräte“ steht „Mac · Chrome · dieses Gerät“
```

**AC-005 — Abgelehnt**

```gherkin
Angenommen  Enricos Mac ist nicht angemeldet
Wenn        er „Auf diesem Gerät benachrichtigen“ einschaltet und im Browser „Blockieren“ wählt
Dann        zeigt „Dieses Gerät“ „nicht erlaubt“ mit dem Hinweis, die Erlaubnis in den
            Browser-Einstellungen für diese Seite zu geben
Und         der Schalter bleibt aus, und unter „Deine Geräte“ kommt nichts dazu
```

**AC-006 — iPhone ohne Home-Bildschirm und ungeeigneter Browser**

```gherkin
Angenommen  Nadja öffnet die App in Safari auf dem iPhone, ohne sie zum Home-Bildschirm hinzugefügt
            zu haben
Wenn        sie „Benachrichtigungen“ öffnet
Dann        steht bei „Dieses Gerät“ „Auf dem iPhone erst die App zum Home-Bildschirm hinzufügen“,
            und der Schalter ist ausgegraut
Angenommen  ein Browser, der keine Push-Nachrichten kann
Dann        steht dort „Dieser Browser kann keine Benachrichtigungen empfangen“, und der Schalter ist
            ausgegraut
```

**AC-007 — Fragen beim Einschalten einer Art oder Setzen einer Uhrzeit**

```gherkin
Angenommen  Enricos Mac ist nicht angemeldet, und der Browser hat noch nie gefragt
Wenn        er den Tagesüberblick einschaltet
Dann        fragt der Browser nach der Erlaubnis
Angenommen  dasselbe Gerät, Enrico hat die Erlaubnis noch nicht beantwortet
Wenn        er bei „Müll rausbringen“ die Uhrzeit 19:00 setzt
Dann        fragt der Browser nach der Erlaubnis
```

**AC-008 — Nur dieses Gerät aus**

```gherkin
Angenommen  Enrico ist in Chrome und in Firefox auf seinem Mac angemeldet, beide an
Wenn        er in Chrome „Auf diesem Gerät benachrichtigen“ ausschaltet
Dann        bekommt Chrome keine Nachrichten mehr, Firefox weiterhin
Und         seine Einstellungen unter „Was und wann“ bleiben unverändert
```

### REQ-003 — Probe senden

> „Probe senden“ schickt sofort eine Probe-Nachricht an dieses Gerät, und nur an dieses.

**Offline:** nur online — ohne Netz ausgegraut.

**AC-009 — Probe**

```gherkin
Angenommen  Enrico ist in Chrome und in Firefox auf seinem Mac angemeldet, beide an
Wenn        er in Chrome „Probe senden“ tippt
Dann        zeigt Chrome die Nachricht „Probe: So sehen deine Benachrichtigungen aus.“
Und         Firefox zeigt nichts
```

**AC-010 — Nicht angemeldet**

```gherkin
Angenommen  „Auf diesem Gerät benachrichtigen“ ist aus
Dann        ist „Probe senden“ ausgegraut mit „Erst auf diesem Gerät einschalten“
```

### REQ-004 — Was und wann je Person

> Je Art gibt es einen Schalter und, wo es passt, eine Uhrzeit; beim Tagesüberblick wählt man die
> Teile. Die Einstellungen gelten je Person und Haushalt auf allen ihren Geräten (D38); am Anfang
> sind nur Aufgaben mit Uhrzeit und Reservierungen an (D36).

**Offline:** offline lesend — Ändern nur online.

**AC-011 — Am Anfang**

```gherkin
Angenommen  Nadja hat an den Benachrichtigungen nie etwas verändert
Wenn        sie „Benachrichtigungen“ öffnet
Dann        steht „Tagesüberblick“ auf aus mit „7:30 · Essen · Aktivitäten · Aufgaben · Vorbereitung“
Und         „Aktivitäten am Vortag“ steht auf aus mit „19:00“
Und         „Aufgaben mit Uhrzeit“ und „Restaurant-Reservierung“ stehen auf an, die Reservierung mit
            „2 h vorher, je Eintrag änderbar“
```

**AC-012 — Gilt für alle Geräte**

```gherkin
Angenommen  Enrico ist in Chrome und in Firefox auf seinem Mac angemeldet
Wenn        er in Chrome den Tagesüberblick einschaltet, 6:45 einstellt und nur „Essen“ und
            „Aufgaben“ wählt
Dann        zeigt Firefox unter „Was und wann“ dieselben Einstellungen
Und         am nächsten Morgen um 6:45 kommt der Tagesüberblick in beiden Browsern
```

**AC-013 — Jede Person für sich**

```gherkin
Angenommen  Enrico hat den Tagesüberblick eingeschaltet
Wenn        Nadja „Benachrichtigungen“ öffnet
Dann        steht ihr Tagesüberblick weiterhin auf aus
Wenn        Nadja über die Supabase-API Enricos Einstellungen lesen oder ändern will
Dann        wird das abgelehnt
```

**AC-014 — Ausgeschaltet heißt still**

```gherkin
Angenommen  Enrico hat „Aufgaben mit Uhrzeit“ ausgeschaltet; „Müll rausbringen“ ist am Sonntag,
            22.11., um 19:00 fällig, Enrico ist dran
Wenn        der Takt um 19:00 läuft
Dann        bekommt keines von Enricos Geräten eine Nachricht zu „Müll rausbringen“
```

### REQ-005 — Tagesüberblick

> Zur eigenen Uhrzeit kommt eine Nachricht mit dem eigenen Teil des Tages, aus den gewählten Teilen;
> gibt es nichts, kommt nichts.

**Offline:** Die Zustellung läuft auf dem Server und braucht kein Netz auf dem Gerät; das Gerät
zeigt die Nachricht, sobald es Netz hat (Offene Frage 1).

**AC-015 — Inhalt**

```gherkin
Angenommen  Enrico hat den Tagesüberblick um 7:30 mit allen vier Teilen an
Und         heute stehen „Bouldern“ am Vormittag und „Lasagne“ am Abend, Enrico kocht und isst mit
Und         „Bad putzen“ ist heute fällig, Enrico ist dran
Und         für morgen ist ein Rezept mit dem Vorlauf „Kichererbsen einweichen“ geplant, Enrico kocht
Wenn        der Takt um 7:30 läuft
Dann        bekommt Enrico eine Nachricht „Heute: Bouldern (Vormittag) · Lasagne (Abend, du kochst) ·
            Bad putzen (du) · Für morgen: Kichererbsen einweichen“
Und         der Takt um 7:25 hat noch nichts geschickt
```

**AC-016 — Nur der eigene Teil (D39; Vorbereitung: Annahme, Offene Frage 3)**

```gherkin
Angenommen  der Tag aus AC-015; Nadja isst bei „Lasagne“ nicht mit und hat den Tagesüberblick mit
            allen vier Teilen an
Wenn        der Takt zu Nadjas Uhrzeit läuft
Dann        nennt ihre Nachricht „Bouldern (Vormittag)“
Und         sie nennt weder „Lasagne“ noch „Bad putzen“ noch die Vorbereitung
```

**AC-017 — Gewählte Teile und leerer Tag**

```gherkin
Angenommen  Enrico hat nur den Teil „Aufgaben“ gewählt, und heute ist keine Aufgabe für ihn fällig
            oder überfällig, aber „Lasagne“ steht im Kalender
Wenn        der Takt zu seiner Uhrzeit läuft
Dann        bekommt Enrico keine Nachricht
```

**AC-018 — Überfälliges nur hier**

```gherkin
Angenommen  „Fenster Wohnzimmer“ ist seit 2 Tagen überfällig, Nadja ist zuständig und hat den
            Tagesüberblick mit „Aufgaben“ um 7:30 an
Wenn        die Takte des ganzen Tages laufen
Dann        nennt Nadjas Tagesüberblick „Fenster Wohnzimmer“
Und         zu „Fenster Wohnzimmer“ kommt an diesem Tag keine weitere Nachricht
```

### REQ-006 — Aktivitäten am Vortag

> Am Vortag einer Aktivität kommt zur eigenen Uhrzeit eine Nachricht mit den Aktivitäten des
> nächsten Tages, an alle, die an diesem Tag nicht abwesend sind.

**Offline:** wie REQ-005.

**AC-019 — Am Vorabend**

```gherkin
Angenommen  Enrico und Nadja haben „Aktivitäten am Vortag“ um 19:00 an
Und         morgen, Samstag, 21.11., steht „Eislaufen“ mit dem Zusatz „Hohenschönhausen“ am Vormittag
Wenn        der Takt heute um 19:00 läuft
Dann        bekommen beide die Nachricht „Morgen: Eislaufen (Hohenschönhausen), Vormittag“
```

**AC-020 — Abwesend am Tag der Aktivität**

```gherkin
Angenommen  der Fall aus AC-019, Nadja ist von Samstag, 21.11., bis Donnerstag, 26.11., abwesend
Wenn        der Takt heute um 19:00 läuft
Dann        bekommt nur Enrico die Nachricht
```

**AC-021 — Mehrere und keine Aktivität (Annahme, Offene Frage 3)**

```gherkin
Angenommen  morgen stehen „Eislaufen“ am Vormittag und „Kino“ am Abend
Wenn        der Takt um 19:00 läuft
Dann        kommt eine einzige Nachricht „Morgen: Eislaufen (Hohenschönhausen), Vormittag · Kino,
            Abend“
Angenommen  morgen steht keine Aktivität
Dann        kommt um 19:00 keine Nachricht
```

### REQ-007 — Aufgaben mit Uhrzeit

> Eine Aufgabe kann eine optionale Uhrzeit haben (D42); am Fälligkeitstag kommt zu dieser Uhrzeit
> eine Erinnerung an die, die dran sind, solange die Aufgabe offen ist.

**Offline:** Uhrzeit setzen nur online (Aufgabe bearbeiten, Spec 0011); Zustellung wie REQ-005.

**AC-022 — Uhrzeit setzen und anzeigen (Hinweis zur Einstellung: Annahme, Offene Frage 3)**

```gherkin
Angenommen  „Müll rausbringen“ (wöchentlich sonntags, abwechselnd E↔N) ist zum Bearbeiten geöffnet
Wenn        ich „Uhrzeit“ auf 19:00 setze und speichere
Dann        zeigen „Zu tun“ am Sonntag und die Haushalt-Zeile im Kalender „Müll rausbringen · 19:00“
Und         unter der Uhrzeit steht, ob die eigene Einstellung „Aufgaben mit Uhrzeit“ an ist
```

**AC-023 — Erinnerung an die Person, die dran ist**

```gherkin
Angenommen  „Müll rausbringen“ ist am Sonntag, 22.11., um 19:00 fällig, Enrico ist dran
Und         beide haben „Aufgaben mit Uhrzeit“ an
Wenn        der Takt am Sonntag um 19:00 läuft
Dann        bekommt Enrico „Müll rausbringen · 19:00 · du bist dran“
Und         Nadja bekommt nichts
```

**AC-024 — „Egal wer“ und „zu zweit“ (Text: Annahme, Offene Frage 3)**

```gherkin
Angenommen  „Blumen gießen“ (egal wer) und „Matratze drehen“ (zu zweit) sind heute um 18:00 fällig
Wenn        der Takt um 18:00 läuft
Dann        bekommen Enrico und Nadja je „Blumen gießen · 18:00“ und „Matratze drehen · 18:00“
```

**AC-025 — Schon erledigt, ohne Uhrzeit, bei Bedarf**

```gherkin
Angenommen  „Müll rausbringen“ ist heute um 19:00 fällig, und Enrico hat sie um 18:10 abgehakt
Wenn        der Takt um 19:00 läuft
Dann        kommt keine Erinnerung
Angenommen  „Müll rausbringen“ hat keine Uhrzeit mehr (✕)
Dann        kommt am Fälligkeitstag keine Erinnerung, und „Zu tun“ zeigt keine Uhrzeit
Angenommen  „Fenster Küche“ hat den Rhythmus „bei Bedarf“ und die Uhrzeit 10:00
Dann        kommt nie eine Erinnerung, weil sie nie fällig ist
```

**AC-026 — Zuständig, aber abwesend**

```gherkin
Angenommen  „Bad putzen“ ist fest Enrico zugeordnet, heute um 10:00 fällig, und Enrico ist abwesend
Wenn        der Takt um 10:00 läuft
Dann        bekommt niemand eine Erinnerung zu „Bad putzen“
```

### REQ-008 — Restaurant-Reservierung

> Ein Restaurant-Eintrag im Kalender kann eine Reservierungsuhrzeit und „Erinnern n vorher“ haben
> (D43, Standard 2 h); zur Erinnerungszeit bekommen die, die mitessen, eine Nachricht. Das ändert
> Spec 0002, Nicht-Ziel „Keine … Reservierungen“: Die Uhrzeit wird festgehalten, reserviert wird
> weiter in den Karten-Apps.

**Offline:** Eintragen nur online (wie das Bearbeiten eines Kalendereintrags); Zustellung wie
REQ-005.

**AC-027 — Eintragen und anzeigen**

```gherkin
Angenommen  am Samstag, 21.11., steht abends „Trattoria Da Enzo“, Enrico und Nadja essen mit
Wenn        ich den Eintrag öffne, „Reserviert um“ auf 19:30 setze und „Fertig“ wähle
Dann        steht „Erinnern 2 h vorher“ darunter
Und         die Karte auf der „Übersicht“ am Samstag und der Eintrag im Kalender zeigen „19:30“
```

**AC-028 — Erinnerung an die, die mitessen**

```gherkin
Angenommen  der Eintrag aus AC-027, beide haben „Restaurant-Reservierung“ an
Wenn        der Takt am Samstag um 17:30 läuft
Dann        bekommen Enrico und Nadja „Trattoria Da Enzo um 19:30 · in 2 Stunden · Route ›“
Angenommen  Nadja isst nicht mit
Dann        bekommt nur Enrico die Nachricht
```

**AC-029 — Andere Vorlaufzeit (Auswahl: Annahme, Offene Frage 2)**

```gherkin
Angenommen  der Eintrag aus AC-027
Wenn        ich „Erinnern“ auf „1 h vorher“ stelle
Dann        kommt die Nachricht um 18:30 statt um 17:30, mit „in 1 Stunde“
```

**AC-030 — Nur bei Restaurant-Einträgen**

```gherkin
Angenommen  am Samstag stehen „Lasagne“ (Rezept) und „Bouldern“ (Aktivität)
Wenn        ich ihre Einträge öffne
Dann        gibt es dort weder „Reserviert um“ noch „Erinnern“
Wenn        ein Mitglied über die Supabase-API bei „Lasagne“ eine Reservierungsuhrzeit setzen will
Dann        wird das abgelehnt
```

**AC-031 — Zu spät eingetragen**

```gherkin
Angenommen  es ist Samstag, 18:30
Wenn        ich bei „Trattoria Da Enzo“ „Reserviert um“ 19:30 mit „2 h vorher“ eintrage
Dann        kommt keine Erinnerung, weil sie schon um 17:30 fällig gewesen wäre (mehr als 30 Minuten
            zu spät)
```

### REQ-009 — Zuverlässig zustellen: einmal, pünktlich, ruhig

> Der Zeitplaner stellt jede fällige Nachricht genau einmal je Gerät zu, in der Ortszeit des
> Haushalts, verwirft, was mehr als 30 Minuten zu spät wäre, schweigt bei Abwesenheit und nach dem
> Verlassen des Haushalts; ein Tipp öffnet die passende Seite.

**Offline:** Der Server stellt unabhängig vom Gerät zu; ohne Netz zeigt das Gerät die Nachricht
später (Offene Frage 1).

**AC-032 — Nie doppelt**

```gherkin
Angenommen  Enricos Tagesüberblick um 7:30 wurde zugestellt
Wenn        derselbe Takt ein zweites Mal läuft
Dann        bekommt jedes von Enricos Geräten den Tagesüberblick genau einmal
Und         das Zustell-Protokoll hat je Gerät genau einen Eintrag dafür
Wenn        Enrico um 7:45 die Uhrzeit auf 8:00 ändert
Dann        kommt an diesem Tag kein zweiter Tagesüberblick
```

**AC-033 — Zeitumstellung**

```gherkin
Angenommen  Enrico hat den Tagesüberblick um 7:30 an
Wenn        am Sonntag, 28.3.2027, die Sommerzeit beginnt
Dann        kommt der Tagesüberblick an diesem Tag und am Montag, 29.3., jeweils um 7:30 Ortszeit
```

**AC-034 — Zu spät wird verworfen**

```gherkin
Angenommen  der Takt lief am Freitag von 7:00 bis 9:00 nicht (z. B. weil das Projekt pausiert war)
Und         Enrico hat den Tagesüberblick um 7:30 an, und „Paket abholen“ ist um 8:45 fällig,
            Enrico ist dran
Wenn        der Takt um 9:00 wieder läuft
Dann        kommt kein Tagesüberblick für diesen Tag
Und         die Erinnerung „Paket abholen · 8:45 · du bist dran“ kommt um 9:00
```

**AC-035 — Abwesend heißt stumm**

```gherkin
Angenommen  Enrico ist von Samstag, 21.11., bis Donnerstag, 26.11., abwesend und hat alle Arten an
Wenn        in dieser Zeit Takte mit fälligen Nachrichten für ihn laufen
Dann        bekommt Enrico keine Nachricht, auch nicht zu Aufgaben, für die er fest zuständig ist
Und         Nadja bekommt ihre Nachrichten wie gewohnt
Angenommen  stattdessen ist der ganze Haushalt abwesend
Dann        bekommt in dieser Zeit niemand eine Nachricht
```

**AC-036 — Haushalt verlassen**

```gherkin
Angenommen  Nadja wurde aus „Enrico & Nadja“ entfernt, ihr Laptop ist weiter angemeldet
Wenn        Takte mit Aufgaben, Planeinträgen oder Reservierungen dieses Haushalts laufen
Dann        bekommt Nadja daraus keine Nachricht mehr
```

**AC-037 — Tipp öffnet die passende Seite (Ziel bei Aktivitäten: Annahme, Offene Frage 3)**

```gherkin
Angenommen  auf Enricos Gerät liegen die vier Arten von Nachrichten
Wenn        er auf den Tagesüberblick tippt
Dann        öffnet sich die „Übersicht“
Wenn        er auf „Müll rausbringen · 19:00 · du bist dran“ tippt
Dann        öffnet sich die Aufgabe „Müll rausbringen“
Wenn        er auf die Reservierung oder auf „Morgen: Eislaufen …“ tippt
Dann        öffnet sich der Eintrag im Kalender, mit „Route“, wenn es einen Ort gibt
```

**AC-038 — Ungültiges Ziel**

```gherkin
Angenommen  eine Nachricht, deren Ziel-Link verändert wurde und auf keine Seite der App passt
Wenn        Enrico darauf tippt
Dann        öffnet sich die „Übersicht“
```

**AC-039 — Abgelaufenes Abo**

```gherkin
Angenommen  Enricos altes Handy ist angemeldet, der Push-Dienst antwortet für sein Abo mit „gibt es
            nicht mehr“ (404 oder 410)
Wenn        der nächste Takt die Antwort auswertet
Dann        ist das Abo abgeschaltet, und es gehen keine weiteren Nachrichten dorthin
Und         „Deine Geräte“ zeigt das Gerät als „nicht erreichbar“
Wenn        sich auf einem Gerät mit erteilter Erlaubnis das Abo geändert hat und Enrico dort die App
            mit Netz öffnet
Dann        meldet sich das Gerät von selbst neu an
```

**AC-040 — Minimaler Inhalt**

```gherkin
Angenommen  der Zeitplaner baut eine Nachricht für Enrico
Dann        enthält sie nur Titel, Text, Ziel-Link und die Push-Adresse des Geräts
Und         keine E-Mail-Adresse, keine Notiz eines Rezepts, Restaurants oder einer Abwesenheit und
            keine Kennung eines anderen Mitglieds
```

### REQ-010 — Geräte und Sicherheit

> Push-Abos gehören der Person: Sie sieht und entfernt nur ihre eigenen Geräte; Abmelden meldet das
> Gerät ab; ungültige Abos und Aufrufe ohne Berechtigung werden abgewiesen; `push-send` hat weder
> `service_role` noch Datenbankzugang.

**Offline:** nur online — „Deine Geräte“ wird nicht synchronisiert und ohne Netz nicht angezeigt
(„Offline – deine Geräte siehst du mit Netz“).

**AC-041 — Eigene Geräte entfernen**

```gherkin
Angenommen  Enrico ist in Chrome und in Firefox auf seinem Mac angemeldet und öffnet die Seite in
            Firefox
Dann        steht unter „Deine Geräte“ „Mac · Firefox · dieses Gerät“ und „Mac · Chrome · Entfernen“
Wenn        er bei „Mac · Chrome“ „Entfernen“ wählt
Dann        verschwindet es aus der Liste, und Chrome bekommt keine Nachrichten mehr
```

**AC-042 — Abmelden meldet das Gerät ab**

```gherkin
Angenommen  Nadjas Laptop ist angemeldet und an
Wenn        sie sich in der App abmeldet
Dann        zeigt der Laptop keine Nachrichten aus der App mehr
Und         das gilt auch, wenn sie sich ohne Netz abmeldet
```

**AC-043 — Fremde Abos**

```gherkin
Angenommen  Enricos Push-Abos
Wenn        Nadja (derselbe Haushalt), ein Mitglied eines anderen Haushalts oder ein abgemeldeter
            Aufruf sie über die Supabase-API lesen, ändern oder löschen will
Dann        wird das abgelehnt
Wenn        ein abgemeldeter Aufruf ein Abo anlegen, Einstellungen lesen oder „Probe senden“ auslösen
            will
Dann        wird das ebenfalls abgelehnt
```

**AC-044 — Ungültiges Abo**

```gherkin
Angenommen  Enrico ist angemeldet
Wenn        er ein Abo mit der Push-Adresse „http://127.0.0.1:54321/x“, einer Adresse, die zu keinem
            bekannten Push-Dienst gehört, oder mit fehlerhaften Schlüsseln anlegen will
Dann        wird nichts gespeichert
Und         die Seite zeigt „Dieses Gerät konnte nicht angemeldet werden“
```

**AC-045 — Gefälschter Aufruf von `push-send`**

```gherkin
Angenommen  die Edge Function `push-send`
Wenn        jemand sie ohne oder mit falschem geteiltem Geheimnis aufruft
Dann        antwortet sie mit 401 und stellt nichts zu
Wenn        sie mit richtigem Geheimnis, aber ungültigem Inhalt aufgerufen wird
Dann        antwortet sie mit 400 und stellt nichts zu
```

**AC-046 — Kein Schlüssel, kein Datenbankzugang**

```gherkin
Angenommen  der Code von `push-send` und die Rechte der Zeitplaner-Funktion
Dann        liest `push-send` weder den `service_role`-Schlüssel noch die Datenbank-Adresse und
            greift nicht auf die Datenbank zu
Und         ein angemeldetes Mitglied oder ein abgemeldeter Aufruf kann die Zeitplaner-Funktion und
            das Zustell-Protokoll über die API weder aufrufen noch lesen
Und         die App enthält nur den öffentlichen VAPID-Schlüssel, nie den privaten
```

## Offline und Konflikte

| Bereich                                   | Verhalten                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Eigene Einstellungen                      | synchronisiert, offline lesbar, Ändern nur online; ändert dieselbe Person auf zwei Geräten gleichzeitig, gewinnt die letzte Änderung je Feld  |
| Dieses Gerät, „Probe senden“, Geräteliste | nur online; „Deine Geräte“ wird nicht synchronisiert (Voraussetzung 2)                                                                        |
| Uhrzeit an Aufgabe, Reservierung          | wie das Bearbeiten von Aufgabe und Kalendereintrag: nur online, letzte Änderung gewinnt je Feld                                               |
| Zustellung                                | läuft auf dem Server; ein Gerät ohne Netz bekommt die Nachricht, wenn es wieder Netz hat, solange sie noch passt (Offene Frage 1)             |
| Änderung kurz vor einem Takt              | maßgeblich ist der Stand in der Datenbank beim Takt; eine schon zugestellte Nachricht wird nicht wiederholt (AC-032)                          |
| Abmelden ohne Netz                        | das Gerät meldet sich beim Browser sofort ab und zeigt nichts mehr; der Server schaltet das Abo bei der nächsten Antwort des Push-Dienstes ab |

## Plattformen

- **Desktop (Chrome, Edge, Firefox):** volle Unterstützung. Lokal ist alles in Desktop-Chrome auf
  `localhost` prüfbar, auch „Probe senden“ und der Zeitplaner.
- **Android (Chrome):** geht, braucht aber wie jede Adresse außer `localhost` HTTPS; also erst mit
  der Betriebs- bzw. Cloud-Spec.
- **iPhone und iPad:** nur als zum Home-Bildschirm hinzugefügte PWA über HTTPS, ab iOS 16.4; erst
  mit der Betriebs- bzw. Cloud-Spec. Die Seite erklärt das (AC-006).
- **Nativ (später):** Expo Push mit denselben Einstellungen; nicht Teil dieser Spec.
- **Service Worker:** zeigt die Nachricht an und öffnet beim Tipp die Seite; der Ziel-Link wird
  geprüft, bevor er geöffnet wird (AC-038).
- **Barrierefreiheit:** Schalter mit Beschriftung je Art; Uhrzeitwahl per Tastatur bedienbar.

## Daten

- **Neu (Konzept 4.9):**
  - _Zeitzone am Haushalt:_ neue Spalte, Standard „Europe/Berlin“; bestehende Haushalte bekommen
    den Standard.
  - _Uhrzeit an der Aufgabe:_ optional.
  - _Reservierung am Restaurant-Eintrag:_ Uhrzeit (optional) und Minuten vorher (Standard 120); nur
    bei Art „Restaurant“ erlaubt.
  - _Benachrichtigungs-Einstellungen:_ je Mitglied und Haushalt: Arten an/aus, Uhrzeiten, Teile des
    Tagesüberblicks. Haushaltsbezogen nach Regel 5 und synchronisiert, aber nur für das Mitglied
    selbst lesbar und schreibbar.
  - _Push-Abos:_ je Person und Gerät: Push-Adresse, Schlüssel, Gerätename, an/aus, letzter Erfolg.
    Nur die Person selbst, nur über Datenbankfunktionen; nicht synchronisiert (Ausnahme von
    Regel 5, Voraussetzung 2).
  - _Zustell-Protokoll:_ eindeutiger Schlüssel je Nachricht und Gerät, Zeitpunkt, Status; 30 Tage
    aufbewahrt, per `pg_cron` aufgeräumt. Niemand aus der App, nur der Zeitplaner (Ausnahme von
    Regel 5).
- **Gelöscht:** „Entfernen“ und Abmelden löschen das Abo des Geräts; wer den Haushalt verlässt,
  verliert dessen Einstellungen; Protokolleinträge nach 30 Tagen.
- **Personenbezogen:** Push-Adresse und Gerätename (z. B. „iPhone · Safari“) sind neue
  personenbezogene Daten (`10-security.md`: so wenig wie möglich). Nachrichten enthalten nur Titel,
  Text und Ziel-Link (AC-040); sie laufen verschlüsselt über die Push-Dienste von Apple, Google bzw.
  Mozilla.
- **Secrets:** Der private VAPID-Schlüssel liegt nur bei `push-send`, das geteilte Geheimnis im
  Vault und bei `push-send`. Supabase stellt Edge Functions standardmäßig Zugangsdaten wie den
  `service_role`-Schlüssel bereit; `push-send` darf sie nicht verwenden (AC-046).
- **Kosten:** Web Push ist kostenlos; `push-send` läuft nur, wenn es etwas zu senden gibt. Pausiert
  das Free-Projekt, kommen keine Nachrichten (ADR-0007).

## Offene Fragen

| #   | Frage                                                                          | Optionen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Empfehlung                                                                                                | Status           |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | Wie lange darf eine Nachricht beim Push-Dienst auf ein Gerät ohne Netz warten? | A: solange sie passt — Tagesüberblick, Aktivitäten am Vortag und Aufgaben bis Mitternacht des Tages, Reservierung bis zur Reservierungsuhrzeit — Pro: nichts Veraltetes erscheint; Contra: je Art eine eigene Frist · B: 30 Minuten wie beim Takt — Pro: eine Regel; Contra: ein Handy im Flugmodus verpasst alles · C: Standard des Push-Dienstes (bis zu Wochen) — Pro: nichts zu tun; Contra: Erinnerungen von gestern tauchen auf                                                                                                                                     | A, weil eine Erinnerung nur nützt, solange sie noch stimmt                                                | OFFEN, Annahme A |
| 2   | Welche Werte bietet „Erinnern … vorher“ beim Restaurant-Eintrag?               | A: 30 Min · 1 h · 2 h · 3 h · 4 h — Pro: kurze Auswahl, deckt Anfahrt und Vorbereitung ab; Contra: kein „am Vortag“ · B: freie Eingabe in Minuten — Pro: alles möglich; Contra: mehr Tippen, mehr Fehler                                                                                                                                                                                                                                                                                                                                                                  | A, weil 2 h der Standard ist und die Nachbarwerte die üblichen Fälle abdecken                             | OFFEN, Annahme A |
| 3   | Kleinigkeiten, die das Konzept offenlässt                                      | A: (a) „Vorbereitung für morgen“ geht an den Koch des morgigen Eintrags, ohne Koch an alle, die mitessen; (b) „Aktivitäten am Vortag“ ist eine Nachricht mit allen Aktivitäten des nächsten Tages; (c) bei „egal wer“ und „zu zweit“ fehlt „du bist dran“ im Text; (d) kein eigener Schalter „Erinnern“ je Aufgabe (das Datenmodell in 4.9 hat keinen; die Skizze zeigt den Stand der persönlichen Einstellung); (e) die Seite zeigt die Einstellungen des gewählten Haushalts; (f) ein Tipp auf „Aktivitäten am Vortag“ öffnet den Kalendereintrag · B: anders festlegen | A, weil es D37 (eine Nachricht statt vieler) und D39 (nur Betroffene) folgt und keine neuen Daten braucht | OFFEN, Annahme A |

## Rückverfolgbarkeit

| REQ     | AC                | Task (plan.md) | Test |
| ------- | ----------------- | -------------- | ---- |
| REQ-001 | AC-001, AC-002    | —              | —    |
| REQ-002 | AC-003 bis AC-008 | —              | —    |
| REQ-003 | AC-009, AC-010    | —              | —    |
| REQ-004 | AC-011 bis AC-014 | —              | —    |
| REQ-005 | AC-015 bis AC-018 | —              | —    |
| REQ-006 | AC-019 bis AC-021 | —              | —    |
| REQ-007 | AC-022 bis AC-026 | —              | —    |
| REQ-008 | AC-027 bis AC-031 | —              | —    |
| REQ-009 | AC-032 bis AC-040 | —              | —    |
| REQ-010 | AC-041 bis AC-046 | —              | —    |
