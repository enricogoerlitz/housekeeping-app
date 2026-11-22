---
status: entwurf # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-22
---

# 0015 — Native Apps: Anmeldung und Speicher

## Problem

Enrico und Nadja nutzen die App heute nur im Browser bzw. als PWA. Die iPhone- und die
Android-App aus derselben Codebasis sind nicht nutzbar: „Mit Google anmelden“ ist dort ausgegraut,
und selbst mit einer Anmeldung wären Sitzung, Daten und offline abgehakte Posten nach dem Beenden
der App weg. Fotos lassen sich in der App nicht wählen, Benachrichtigungen kommen nur über den
Browser, und niemand hat geprüft, ob die Zurück-Taste unter Android das tut, was sie soll. Eine
installierbare Android-App gibt es nicht, weil die Pipeline keine nativen Apps baut.

## Ziel

- Auf dem Android-Handy und auf dem iPhone meldet man sich mit Google an, nur mit Einladung,
  und bleibt angemeldet, auch nach dem Beenden der App und ohne Netz.
- Lokaler Speicher, Laden-Warteschlange und geladene Fotos überstehen das Beenden der App; im
  Laden ohne Netz geht in der App alles, was in der PWA geht.
- Fotos für Rezepte und Aktivitäten kommen aus der Foto-Mediathek des Geräts.
- Die Zurück-Taste unter Android schließt immer zuerst das Oberste, was offen ist; im Emulator
  geprüft.
- Benachrichtigungen aus Spec 0013 kommen auch in der nativen App an, mit denselben Einstellungen.
- Die Veröffentlichung (Spec 0014) baut die Android-App, wenn es nötig ist, und liefert sonst ein
  Over-the-Air-Update; Enrico und Nadja installieren sie per Link. iOS läuft durch dieselbe
  Pipeline und bleibt aus, bis der Apple-Zugang da ist.
- Liegt die App unter der Mindestversion, sperrt sie das Bearbeiten wie das Web und bietet
  „Aktualisieren“ an.

## Nicht-Ziele

- **Kein öffentlicher Store-Eintrag.** Kein öffentlicher Eintrag im Play Store oder App Store;
  Android kommt per interner Verteilung (Offene Frage 4), iOS später per TestFlight.
- **Kein „Mit Apple anmelden“.** Einziger Anmeldeweg bleibt Google (ADR-0003, Nachtrag).
- **Keine iOS-Auslieferung auf echte iPhones ohne Apple-Developer-Account.** Der Code-Teil wird
  im iOS-Simulator geprüft; Builds für Geräte, TestFlight und Push auf dem iPhone warten auf den
  Account (Offene Frage 12, `BLOCKER` nur für die Auslieferung).
- **Keine native Vorschau.** Die Vorschau aus `develop` bleibt eine Web-App; native Stände werden
  lokal im Emulator bzw. Simulator geprüft (Offene Frage 11).
- **Keine Spracheingabe in der nativen App.** Die KI ist ausgeblendet (Spec 0005); die
  Spracheingabe bleibt nativ „nicht verfügbar“.
- **Kein Teilen aus anderen Apps in die native App.** Das Teilen-Ziel `/teilen` der PWA (Spec 0002)
  bekommt nativ kein Gegenstück.
- **Keine Kamera in der App** (Offene Frage 6, Annahme A): Fotos kommen aus der Mediathek.
- **Kein eigenes Layout für native Geräte.** Bildschirme sehen aus wie in der Web-App auf
  derselben Breite (Spec 0001, 0005); keine Widgets, keine Siri- oder App-Kurzbefehle.
- **Keine Änderung an Sync-Regeln, Offline-Aktionen oder Datenmodell der Fachdaten.** Die vier
  Laden-Aktionen und das Packen bleiben die einzigen Offline-Schreibwege (ADR-0008, ADR-0013).

## Konzept in Kürze

Die Spec hat zwei Teile, die getrennt fertig werden können:

| Teil             | Anforderungen       | Braucht von Enrico                                                                       |
| ---------------- | ------------------- | ---------------------------------------------------------------------------------------- |
| **Code**         | REQ-001 bis REQ-008 | für den Nachweis im Emulator: Google-OAuth-Client für Android und iOS (Offene Frage 13)  |
| **Auslieferung** | REQ-009, REQ-010    | EAS-Konto und `EXPO_TOKEN`, App-ID, später Apple-Developer-Account (Offene Fragen 12–15) |

Der Code-Teil ist nicht blockiert: Er wird gegen die lokale Supabase mit Testkonten und mit
Fälschungen (Fakes) für Google, sicheren Speicher und Push gebaut und getestet. Nur der Nachweis
der echten Google-Anmeldung im Emulator braucht die OAuth-Clients.

**Herkunft der Anforderungen**

| Herkunft                                                                                 | Hier                      |
| ---------------------------------------------------------------------------------------- | ------------------------- |
| Spec 0003, Nicht-Ziel „Secure Store und native Google-Anmeldung kommen später“           | REQ-001, REQ-002          |
| Spec 0003, Plattformen „Speicher und Sitzung hinter Schnittstellen in `packages/api`“    | REQ-002, REQ-003, REQ-004 |
| Spec 0004, Plattformen „Nativ (später): Bildauswahl über die Foto-Mediathek“             | REQ-005                   |
| Spec 0008, Plan E16 und Nachweis B3 (Zurück-Taste gebaut, nicht geprüft)                 | REQ-006                   |
| Spec 0013, Nicht-Ziel „Keine nativen Push-Nachrichten (Expo)“; ADR-0014 „Nativ (später)“ | REQ-007                   |
| Spec 0014, AC-025 (ohne „Aktualisieren (nativ)“); „native liest nur die Mindestversion“  | REQ-008                   |
| Spec 0014, REQ-008 mit AC-047 bis AC-051 (verschoben am 21.11.2026)                      | REQ-009, REQ-010          |

Die Kriterien **AC-047 bis AC-051 behalten ihre Nummern aus Spec 0014**, damit Verweise darauf
weiter stimmen. Deshalb stehen die Nummern in REQ-009 und REQ-010 nicht in aufsteigender Folge.

**Begriffe** (neu im Glossar): native App, Development Build, nativer Fingerabdruck,
Over-the-Air-Update, interne Verteilung. Das Push-Abo umfasst künftig auch das Expo-Push-Token
eines Geräts.

## Anforderungen und Akzeptanzkriterien

### REQ-001 — Mit Google anmelden in der iPhone- und Android-App

> In der nativen App meldet man sich mit einem Google-Konto über den Anmeldedialog des Systems an,
> unter denselben Regeln wie im Web: neue Konten nur mit Einladung (Weg: Annahme, Offene Frage 1).

**Offline:** nur online — Anmelden braucht Google und den Server. Eine gespeicherte Sitzung
startet auch offline (REQ-002).

**AC-001 — Android**

```gherkin
Angenommen  die Adresse von Enrico steht auf der Einladungsliste des Haushalts „Enrico & Nadja“
Und         in der Android-App ist niemand angemeldet
Wenn        Enrico „Mit Google anmelden“ wählt und im Google-Dialog des Systems sein Konto wählt
Dann        sieht er die „Übersicht“ mit den Daten von „Enrico & Nadja“
Und         die App hat dafür keinen Browser geöffnet
```

**AC-002 — iPhone**

```gherkin
Angenommen  die Adresse von Nadja steht auf der Einladungsliste von „Enrico & Nadja“
Und         in der iPhone-App (im iOS-Simulator) ist niemand angemeldet
Wenn        Nadja „Mit Google anmelden“ wählt und die Anmeldung bei Google abschließt
Dann        sieht sie die „Übersicht“ mit den Daten von „Enrico & Nadja“
```

**AC-003 — Fehlerfall: nicht eingeladen**

```gherkin
Angenommen  ein Google-Konto, dessen Adresse auf keiner Einladungsliste steht
Wenn        sich jemand damit in der Android-App anmeldet
Dann        entsteht kein Konto
Und         die Anmeldeseite zeigt „Diese Adresse ist nicht eingeladen. Bitte lass dich von
            jemandem aus deinem Haushalt einladen.“
Wenn        er danach erneut „Mit Google anmelden“ wählt
Dann        fragt Google wieder, mit welchem Konto
```

**AC-004 — Abbrechen**

```gherkin
Angenommen  die Anmeldeseite der Android-App
Wenn        Enrico „Mit Google anmelden“ wählt und den Google-Dialog ohne Konto schließt
Dann        steht die Anmeldeseite ohne Fehlermeldung da
Und         „Mit Google anmelden“ ist wieder wählbar
```

**AC-005 — Fehlerfall: ohne Netz**

```gherkin
Angenommen  in der Android-App ist niemand angemeldet, das Handy ist im Flugmodus
Wenn        Enrico „Mit Google anmelden“ wählt
Dann        zeigt die Anmeldeseite „Anmelden hat nicht geklappt – bitte noch einmal versuchen.“
Und         es entsteht keine Sitzung
```

**AC-006 — Ein anderes Konto nach dem Abmelden**

```gherkin
Angenommen  Enrico war in der Android-App angemeldet und hat sich abgemeldet
Wenn        Nadja auf demselben Handy „Mit Google anmelden“ wählt
Dann        fragt Google, mit welchem Konto, statt still Enricos Konto zu nehmen
Und         nach ihrer Wahl ist Nadja angemeldet, nicht Enrico
```

**AC-007 — Expo Go**

```gherkin
Angenommen  die App läuft lokal in Expo Go
Wenn        ich die Anmeldeseite öffne
Dann        ist „Mit Google anmelden“ ausgegraut mit dem Hinweis „In Expo Go gibt es keine
            Google-Anmeldung – nutze einen Development Build oder ein Testkonto.“
            (Text: Annahme, Offene Frage 9)
Und         mit Entwicklungs-Schalter und lokaler Supabase gehen die Testkonten
```

**AC-008 — Testkonten nur lokal, auch nativ**

```gherkin
Angenommen  ein Development Build mit Entwicklungs-Schalter im Android-Emulator bzw.
            iOS-Simulator, verbunden mit der lokalen Supabase auf dem Rechner
Wenn        ich „Als Test-Enrico anmelden“ wähle
Dann        bin ich als „Enrico (Test)“ im Haushalt „Enrico & Nadja“ angemeldet
Angenommen  derselbe Build zeigt mit Entwicklungs-Schalter auf eine Supabase-Adresse, die nicht
            zum Rechner bzw. Emulator gehört (Annahme, Offene Frage 10)
Wenn        er startet
Dann        bricht er mit einem Fehler ab, und es gibt keine Testkonten
```

### REQ-002 — Sitzung sicher und dauerhaft auf dem Gerät

> Die native App behält die Anmeldung über Neustarts, auch ohne Netz, und legt die Sitzung nur
> im sicheren Speicher des Systems ab (Schlüsselbund bzw. Keystore, `10-security.md`).

**Offline:** offline vollständig für den Start mit gespeicherter Sitzung; Erneuern der Sitzung
braucht Netz und passiert dann von selbst.

**AC-009 — Start ohne Netz nach dem Beenden**

```gherkin
Angenommen  Enrico war in der Android-App angemeldet, und der Abgleich ist durchgelaufen
Und         er hat die App über die Liste der offenen Apps beendet
Wenn        er sie im Flugmodus wieder öffnet
Dann        startet sie mit seiner Sitzung und den zuletzt abgeglichenen Daten
Und         zeigt den orangen Hinweis „Offline – Lesen und Abhaken gehen“
```

**AC-010 — Angemeldet bleiben**

```gherkin
Angenommen  Enrico war angemeldet, und sein Zugangstoken ist inzwischen abgelaufen
Wenn        er die App mit Netz öffnet
Dann        ist er weiterhin angemeldet, ohne Google erneut zu sehen
Und         sieht Änderungen, die Nadja inzwischen gemacht hat
```

**AC-011 — Kein Token im Klartext**

```gherkin
Angenommen  Enrico ist in der Android-App angemeldet
Wenn        man alles liest, was die App außerhalb des sicheren Speichers ablegt (AsyncStorage,
            Dateien und Datenbanken der App)
Dann        steht dort weder sein Zugangstoken noch sein Erneuerungstoken im Klartext
```

**AC-012 — Abmelden räumt das Gerät**

```gherkin
Angenommen  Enrico ist angemeldet, der lokale Speicher ist gefüllt, ein Haken wartet in der
            Laden-Warteschlange, und Fotos liegen auf dem Gerät
Wenn        er sich abmeldet und die App neu startet
Dann        sieht er die Anmeldeseite
Und         Sitzung, lokaler Speicher, Laden-Warteschlange und Fotos sind auf diesem Gerät gelöscht
```

**AC-013 — Fehlerfall: gespeicherte Sitzung nicht lesbar**

```gherkin
Angenommen  der sichere Speicher gibt die gespeicherte Sitzung nicht heraus, etwa nach dem
            Wiederherstellen der App auf einem neuen Handy oder einem geänderten Sperrbildschirm
Wenn        die App startet
Dann        zeigt sie die Anmeldeseite, ohne abzustürzen
Und         vom lokalen Speicher, der Laden-Warteschlange und den Fotos davor ist nichts mehr zu
            sehen
```

**AC-014 — Fehlerfall: Konto gelöscht**

```gherkin
Angenommen  Enricos Konto wurde auf dem Server gelöscht, während seine App geschlossen war
Wenn        er die App mit Netz öffnet
Dann        zeigt sie die Anmeldeseite mit „Dein Konto gibt es nicht mehr – bitte melde dich neu an.“
Und         Sitzung und lokaler Speicher sind auf diesem Gerät gelöscht
```

### REQ-003 — Lokaler Speicher und Laden-Warteschlange überdauern das Beenden

> Die native App hält lokalen Speicher, Laden-Warteschlange und geladene Fotos dauerhaft auf dem
> Gerät, so wie die Web-App im Browser.

**Offline:** offline vollständig — Lesen, die Laden-Aktionen und das Packen.

**AC-015 — Alles lesbar nach Neustart ohne Netz**

```gherkin
Angenommen  Enrico hat mit Netz Rezepte, die Einkaufsliste, den Kalender und die Aktivität
            „Eislaufen“ mit eigenem Foto angesehen
Wenn        er die App beendet und im Flugmodus neu startet
Dann        kann er alle Bildschirme öffnen und sieht dieselben Daten und das Foto von „Eislaufen“
Und         Bearbeiten ist ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“
```

**AC-016 — Die Laden-Warteschlange übersteht das Beenden**

```gherkin
Angenommen  Enrico ist im Einkaufsmodus ohne Netz, hakt „Milch“, „Brot“ und „Eier“ ab und fügt
            „Butter“ hinzu
Wenn        er die App beendet und im Flugmodus neu startet
Dann        sind die drei Posten abgehakt, und „Butter“ steht auf der Liste
Wenn        er wieder Netz hat
Dann        ist das auch auf Nadjas Gerät so, und „Butter“ steht dort genau einmal
```

**AC-017 — Neue Speicher-Version**

```gherkin
Angenommen  in der Laden-Warteschlange warten zwei Haken
Und         eine neue App-Version mit anderer Speicher-Version kommt auf das Gerät, als
            Over-the-Air-Update oder als neue App
Wenn        sie mit Netz startet
Dann        verwirft sie den alten lokalen Speicher und lädt einmal alles neu
Und         die zwei Haken bleiben erhalten und werden nachgereicht
```

**AC-018 — Fehlerfall: Beenden mitten im Abgleich**

```gherkin
Angenommen  der Abgleich schreibt gerade viele Änderungen in den lokalen Speicher
Wenn        das System die App in diesem Moment beendet
Dann        startet sie danach mit einem vollständigen Stand, entweder dem davor oder dem danach,
            nie mit einer Mischung aus beiden
Und         der nächste Abgleich holt nach, was fehlt
```

**AC-019 — Fremder Haushalt auf demselben Handy**

```gherkin
Angenommen  Enrico hat sich auf seinem Handy abgemeldet
Wenn        sich dort eine Person aus dem Haushalt „WG Bea“ anmeldet, die nicht zu „Enrico & Nadja“
            gehört
Dann        sieht sie nur „WG Bea“: keine Einträge, Fotos oder Laden-Aktionen aus „Enrico & Nadja“
```

### REQ-004 — Netz und Vordergrund erkennen

> Die native App merkt ohne Neustart, wenn das Netz wegfällt oder wiederkommt und wenn sie in den
> Vordergrund kommt, und verhält sich dann wie die Web-App.

**Offline:** betrifft den Wechsel selbst; Lesen und Laden-Aktionen gehen offline vollständig.

**AC-020 — Netz weg**

```gherkin
Angenommen  die App ist mit Netz offen
Wenn        Enrico den Flugmodus einschaltet
Dann        erscheint ohne Neustart der orange Hinweis „Offline – Lesen und Abhaken gehen“
Und         Bearbeiten ist ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“
```

**AC-021 — Netz zurück**

```gherkin
Angenommen  die App ist offline offen, ein Haken wartet in der Laden-Warteschlange
Wenn        Enrico den Flugmodus ausschaltet
Dann        verschwindet der Hinweis, der Haken wird nachgereicht
Und         Änderungen, die Nadja inzwischen gemacht hat, erscheinen ohne sein Zutun
```

**AC-022 — Zurück in den Vordergrund**

```gherkin
Angenommen  Enricos App liegt seit einer Stunde im Hintergrund, das Handy hat Netz
Und         Nadja hat inzwischen „Käse“ auf die Einkaufsliste gesetzt
Wenn        Enrico die App wieder öffnet
Dann        steht „Käse“ auf der Liste, ohne dass er etwas tun muss
Und         die App fragt die Mindestversion ab (REQ-008)
```

**AC-023 — Fehlerfall: WLAN ohne Internet**

```gherkin
Angenommen  das Handy ist mit einem WLAN verbunden, über das der Server nicht erreichbar ist
Wenn        Enrico ein Rezept umbenennt
Dann        steht wieder der alte Name da, und es erscheint „Hat nicht geklappt – bitte noch einmal
            versuchen“
Wenn        er im Einkaufsmodus „Milch“ abhakt
Dann        bleibt der Haken und wird nachgereicht, sobald der Server erreichbar ist
```

### REQ-005 — Fotos aus der Mediathek wählen

> In der nativen App wählt man Fotos für Rezepte und Aktivitäten aus der Foto-Mediathek des
> Geräts; sie werden wie im Web verkleinert und ohne Metadaten gespeichert (Spec 0004, REQ-004).

**Offline:** nur online für das Hochladen (Spec 0004); einmal geladene Fotos sind offline
sichtbar (REQ-003).

**AC-024 — Foto wählen**

```gherkin
Angenommen  die Aktivität „Eislaufen“ ohne Foto, die Android-App hat Netz
Wenn        Enrico „Foto ändern“ wählt und in der Fotoauswahl des Systems ein Foto antippt
Dann        zeigt „Eislaufen“ das Foto, auch auf Nadjas Gerät
Und         gespeichert ist ein JPEG, längste Seite höchstens 1600 Pixel, ohne Standort- und
            Kameradaten
```

**AC-025 — iPhone-Foto im Hochformat**

```gherkin
Angenommen  in der Mediathek des iPhones liegt ein hochkant aufgenommenes Foto im Format HEIC
Wenn        Nadja es für das Rezept „Spaghetti Bolognese“ wählt
Dann        zeigt das Rezept das Foto aufrecht
Und         gespeichert ist ein JPEG wie in AC-024
```

**AC-026 — Kein Zugriff auf die ganze Mediathek**

```gherkin
Angenommen  die App hat nie nach Zugriff auf Fotos gefragt
Wenn        Enrico „Foto ändern“ wählt und ein Foto auswählt
Dann        fragt das System nicht nach Zugriff auf alle Fotos
Und         die App erhält nur das gewählte Foto
```

**AC-027 — Abbrechen**

```gherkin
Angenommen  das Rezept „Lasagne“ mit eigenem Foto
Wenn        Enrico „Foto ändern“ wählt und die Fotoauswahl ohne Foto schließt
Dann        zeigt „Lasagne“ weiter das bisherige Foto, und nichts wird hochgeladen
```

**AC-028 — Fehlerfall: ungeeignetes Bild**

```gherkin
Angenommen  in der Mediathek liegt ein Bild, das größer als 15 MB ist oder sich nicht öffnen lässt
Wenn        Enrico es für „Eislaufen“ wählt
Dann        wird nichts hochgeladen, und er sieht „Dieses Bild können wir nicht verwenden“
```

**AC-029 — Offline**

```gherkin
Angenommen  die App ist offline
Wenn        Enrico die Aktivität „Eislaufen“ öffnet
Dann        ist „Foto ändern“ ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“
Und         die Fotoauswahl des Systems öffnet sich nicht
```

### REQ-006 — Zurück-Taste unter Android

> Unter Android schließt die Zurück-Taste immer zuerst das Oberste, was offen ist (Menü, Fenster,
> Filterfeld, offener Abschnitt), und geht erst dann eine Seite zurück. Das in Spec 0008 (Plan, E16)
> Gebaute wird im Android-Emulator nachgewiesen.

**Offline:** offline vollständig, reine Bedienung. Speichert die Taste einen Abschnitt, gilt für
dieses Speichern dasselbe wie für „Fertig“ (Spec 0008).

**AC-030 — Rezeptseite (Spec 0008)**

```gherkin
Angenommen  auf dem Android-Handy ist die Rezeptseite „Lasagne“ mit Netz offen, der Abschnitt
            „Zutaten“ ist im Bearbeiten, und das ⋯-Menü einer Zutat ist offen
Wenn        Enrico die Zurück-Taste drückt
Dann        schließt sich das Menü, und der Abschnitt bleibt offen
Wenn        er sie noch einmal drückt
Dann        ist der Abschnitt gespeichert und geschlossen wie mit „Fertig“
Wenn        er sie noch einmal drückt
Dann        ist er wieder auf der Seite, von der aus er die „Lasagne“ geöffnet hat
```

**AC-031 — Filterfeld und Fenster**

```gherkin
Angenommen  in „Essen“ ist auf dem Handy das Filterfeld offen
Wenn        Enrico die Zurück-Taste drückt
Dann        schließt sich das Filterfeld, und „Essen“ bleibt offen
Angenommen  ein Hinzufügen-Fenster mit eingetipptem Namen ist offen
Wenn        er die Zurück-Taste drückt
Dann        schließt sich das Fenster, und es wird nichts angelegt
```

**AC-032 — Zwischen Tabs und aus der App**

```gherkin
Angenommen  nach dem Start ist die „Übersicht“ offen, und Enrico wechselt zu „Liste“
Wenn        er die Zurück-Taste drückt
Dann        ist die „Übersicht“ wieder offen
Wenn        er sie noch einmal drückt
Dann        geht die App in den Hintergrund
Und         öffnet er sie wieder, ist er angemeldet, und nichts ist verloren
```

### REQ-007 — Benachrichtigungen in der nativen App

> Die native App empfängt dieselben Benachrichtigungen wie die Web-App (Spec 0013) über Expo Push,
> mit denselben Einstellungen, demselben Zeitplaner und denselben Regeln für Geräte (Zustellweg:
> Annahme, Offene Frage 3).

**Offline:** nur online — Gerät anmelden, abmelden und „Deine Geräte“ brauchen den Server; ohne
Netz ist der Schalter ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“. Nachrichten
kommen nur an, wenn das Handy Netz hat.

**AC-033 — Einschalten erlaubt**

```gherkin
Angenommen  Enricos Android-App ist für Benachrichtigungen nicht angemeldet
Wenn        er in „Benachrichtigungen“ „Auf diesem Gerät benachrichtigen“ einschaltet und im
            System „Zulassen“ wählt
Dann        zeigt „Dieses Gerät“ „Android · native App · ✓ erlaubt“ und den Schalter an
Und         unter „Deine Geräte“ steht „Android · native App · dieses Gerät“
            (Gerätename: Annahme, Offene Frage 9)
```

**AC-034 — Nie beim Start fragen**

```gherkin
Angenommen  die Android-App ist frisch installiert und Enrico ist angemeldet
Wenn        er durch alle Bereiche geht
Dann        fragt das System nicht nach der Erlaubnis für Mitteilungen
```

**AC-035 — Zustellen und Tippen bei geschlossener App**

```gherkin
Angenommen  Enricos Android-App ist angemeldet und an, sein Tagesüberblick ist an, und die App ist
            beendet
Wenn        die Uhrzeit seines Tagesüberblicks kommt
Dann        zeigt das Handy den Tagesüberblick als Mitteilung von „Housekeeping“
Wenn        er darauf tippt
Dann        startet die App und öffnet die „Übersicht“
Und         ein Tipp auf „Müll rausbringen · 19:00 · du bist dran“ öffnet die Aufgabe, ein Tipp auf
            eine Nachricht mit verändertem Ziel die „Übersicht“ (Spec 0013, AC-037, AC-038)
```

**AC-036 — Abgelehnt**

```gherkin
Angenommen  Enricos Android-App ist für Benachrichtigungen nicht angemeldet
Wenn        er „Auf diesem Gerät benachrichtigen“ einschaltet und im System „Nicht zulassen“ wählt
Dann        zeigt „Dieses Gerät“ „nicht erlaubt“ mit dem Hinweis, die Erlaubnis in den
            Einstellungen des Handys für „Housekeeping“ zu geben
Und         der Schalter bleibt aus, und unter „Deine Geräte“ kommt nichts dazu
```

**AC-037 — PWA und native App auf demselben Handy**

```gherkin
Angenommen  auf Enricos Android-Handy sind die PWA und die native App für Benachrichtigungen
            angemeldet und an
Dann        stehen unter „Deine Geräte“ beide als eigene Geräte
Wenn        er in der PWA „Auf diesem Gerät benachrichtigen“ ausschaltet
Dann        bekommt nur noch die native App Nachrichten, und seine Einstellungen unter „Was und
            wann“ bleiben unverändert
```

**AC-038 — Abmelden meldet das Gerät ab**

```gherkin
Angenommen  Nadjas Android-App ist für Benachrichtigungen angemeldet und an
Wenn        sie sich in der App abmeldet, mit oder ohne Netz
Dann        zeigt das Handy keine Nachrichten aus der App mehr an
Und         mit Netz verschwindet das Gerät aus ihren „Deine Geräte“
```

**AC-039 — Abgelaufenes Abo**

```gherkin
Angenommen  Enricos altes Handy ist angemeldet, und Expo Push meldet für sein Push-Abo, dass es
            das Gerät nicht mehr gibt
Wenn        der nächste Takt die Antwort auswertet
Dann        ist das Abo abgeschaltet, es gehen keine Nachrichten mehr dorthin, und „Deine Geräte“
            zeigt es als „nicht erreichbar“
Wenn        sich auf einem Handy mit erteilter Erlaubnis das Push-Token geändert hat und Enrico die
            App dort mit Netz öffnet
Dann        meldet sich das Gerät von selbst neu an
```

**AC-040 — Fehlerfall: fremde Zustelladresse**

```gherkin
Angenommen  jemand meldet über die Supabase-API ein natives Push-Abo an, dessen Push-Adresse kein
            Expo-Push-Token ist, etwa „https://angreifer.example/push“
Dann        lehnt der Server ab, und es entsteht kein Push-Abo
Und         „push-send“ stellt natives Push nur an den Expo-Push-Dienst zu, weiterhin ohne
            „service_role“ und ohne Datenbankzugang (Spec 0013, AC-045, AC-046)
```

**AC-041 — iPhone ohne Apple-Zugang**

```gherkin
Angenommen  die iPhone-App hat keine Push-Berechtigung von Apple (kein Apple-Developer-Account)
Wenn        Nadja „Benachrichtigungen“ öffnet
Dann        steht bei „Dieses Gerät“ „In der iPhone-App kommen Benachrichtigungen später – nutze bis
            dahin die App vom Home-Bildschirm.“, und der Schalter ist ausgegraut
            (Text: Annahme, Offene Frage 9)
```

### REQ-008 — Versionsprüfung in der nativen App

> Die native App liest nur die Mindestversion (Spec 0014, ADR-0015); liegt sie darunter, sperrt sie
> das Bearbeiten wie das Web und bietet „Aktualisieren“ an. Neuere Versionen kommen ohne Hinweis
> als Over-the-Air-Update (REQ-009) oder als neue App (REQ-010).

**Offline:** nur online; ohne Netz kein Hinweis, keine Fehlermeldung, keine Sperre
(`31-sync.md`).

**AC-042 — Unter der Mindestversion**

```gherkin
Angenommen  der Server verlangt mindestens „2026.12.5“, Enricos Android-App läuft mit
            „2026.12.4“ und hat Netz
Wenn        die App den Server erreicht, beim Start oder beim Zurückholen in den Vordergrund
Dann        steht dauerhaft „Diese Version wird nicht mehr unterstützt“ mit „Aktualisieren“
Und         Lesen und Abhaken gehen weiter, Bearbeiten ist gesperrt, und die Laden-Warteschlange
            wird nicht nachgereicht
```

**AC-043 — Aktualisieren mit passendem Over-the-Air-Update**

```gherkin
Angenommen  wie in AC-042, und für den nativen Fingerabdruck von Enricos App gibt es ein
            Over-the-Air-Update „2026.12.5“
Wenn        er „Aktualisieren“ wählt
Dann        lädt die App das Update, startet neu und läuft mit „2026.12.5“
Und         er ist weiterhin angemeldet, und die wartenden Laden-Aktionen werden nachgereicht
```

**AC-044 — Fehlerfall: Es braucht eine neue App**

```gherkin
Angenommen  wie in AC-042, aber „2026.12.5“ hat einen anderen nativen Fingerabdruck, es gibt also
            kein passendes Over-the-Air-Update
Wenn        Enrico „Aktualisieren“ wählt
Dann        steht „Für diese Version brauchst du die neue App.“ mit „Zur neuesten Veröffentlichung“
            (Annahme, Offene Frage 8)
Wenn        er „Zur neuesten Veröffentlichung“ wählt
Dann        öffnet sich im Browser die GitHub-Seite der neuesten Veröffentlichung mit dem
            Installations-Link
Und         in der App gehen Lesen und Abhaken weiter
```

**AC-045 — Ohne Netz**

```gherkin
Angenommen  das Handy ist offline, die App liegt unter der Mindestversion
Wenn        Enrico die App startet oder in den Vordergrund holt
Dann        erscheinen weder Hinweis noch Fehlermeldung, und nichts ist gesperrt, was offline sonst
            geht
```

**AC-046 — Kein Hinweis „Neue Version verfügbar“**

```gherkin
Angenommen  die native App läuft mit „2026.12.4“, das Web mit „2026.12.5“, die Mindestversion
            ist „2026.12.1“
Wenn        Enrico die App mit Netz startet
Dann        erscheint kein Hinweis „Neue Version verfügbar“
Und         ganz unten in den persönlichen Einstellungen steht „Version 2026.12.4“
```

### REQ-009 — Native Apps in der Veröffentlichung bauen und aktualisieren

> Die Veröffentlichung (Spec 0014, REQ-005) baut die Android-App mit EAS neu, wenn sich ihr
> nativer Fingerabdruck geändert hat, und liefert sonst ein Over-the-Air-Update; native Builds
> sprechen nur mit Produktion. (Aus Spec 0014, REQ-008; Over-the-Air-Updates: Annahme, Offene
> Frage 5)

**Offline:** betrifft die Pipeline; ein Gerät bekommt Updates nur mit Netz und läuft ohne Netz
mit seiner Version weiter.

**AC-047 — Neuer Build nur bei nativer Änderung** (aus Spec 0014)

```gherkin
Angenommen  seit der letzten Veröffentlichung hat sich der native Fingerabdruck der App geändert,
            etwa durch ein neues natives Modul
Wenn        „2026.12.5“ veröffentlicht wird
Dann        baut EAS eine signierte Android-APK mit dem Versionsnamen „2026.12.5“ und einem höheren
            Versionscode als die vorige
Und         die GitHub-Veröffentlichung nennt den Installations-Link der internen Verteilung
```

**AC-048 — Sonst Over-the-Air-Update** (aus Spec 0014)

```gherkin
Angenommen  der native Fingerabdruck ist unverändert
Wenn        „2026.12.5“ veröffentlicht wird
Dann        entsteht kein neuer Android-Build, sondern ein Over-the-Air-Update auf dem Kanal
            „production“
Und         eine installierte App mit demselben Fingerabdruck zeigt nach höchstens zwei Starts mit
            Netz „Version 2026.12.5“
```

**AC-049 — Produktionswerte, kein Testzugang** (aus Spec 0014, ohne den Hinweis zur fehlenden
Anmeldung)

```gherkin
Angenommen  die APK aus der Veröffentlichung ist auf einem Android-Handy installiert
Wenn        ich sie starte
Dann        heißt sie „Housekeeping“, hat die App-ID aus Offener Frage 2 und spricht mit dem
            Produktionsprojekt
Und         die Anmeldeseite bietet nur „Mit Google anmelden“, keine Testkonten
```

**AC-052 — Fehlerfall: Build scheitert**

```gherkin
Angenommen  der Android-Build bei EAS scheitert
Wenn        die Veröffentlichung läuft
Dann        bricht sie vor „Supabase ausliefern“ ab
Und         weder Supabase noch Web noch ein Over-the-Air-Update werden ausgeliefert, und es
            entsteht kein Tag
```

**AC-053 — Fehlerfall: EAS-Zugang fehlt**

```gherkin
Angenommen  der Schalter „Android“ ist an, aber „EXPO_TOKEN“ fehlt in der Umgebung „production“
Wenn        die Veröffentlichung startet
Dann        bricht sie vor jeder Auslieferung mit „Android ist an, aber der EAS-Zugang fehlt“ ab
```

**AC-054 — Kein Update für eine unpassende App**

```gherkin
Angenommen  auf Nadjas Handy läuft eine App mit älterem nativem Fingerabdruck
Wenn        ein Over-the-Air-Update für den neuen Fingerabdruck veröffentlicht wird
Dann        lädt ihre App es nicht und läuft unverändert weiter, bis sie die neue APK installiert
```

**AC-055 — Nur die Veröffentlichung liefert native Updates aus**

```gherkin
Angenommen  ein Workflow-Lauf aus einem Feature-Zweig, einer PR oder für die Vorschau
Wenn        er läuft
Dann        hat er keinen Zugang zu „EXPO_TOKEN“
Und         auf dem Kanal „production“ erscheint kein Update, das nicht aus einer Veröffentlichung
            von „main“ stammt
```

### REQ-010 — Verteilung: Android intern, iOS hinter einem Schalter

> Die Android-App kommt über die interne Verteilung von EAS per Link auf die Handys; iOS läuft
> durch dieselbe Pipeline und bleibt ausgeschaltet, bis der Apple-Developer-Account da ist. Beide
> Plattformen haben einen Schalter (Android: an, iOS: aus). (Aus Spec 0014, REQ-008; Verteilweg:
> Annahme, Offene Frage 4)

**Offline:** Installieren braucht Netz; danach gilt REQ-003.

**AC-050 — iOS ausgeschaltet** (aus Spec 0014)

```gherkin
Angenommen  der Schalter „iOS“ ist aus
Wenn        die Veröffentlichung läuft
Dann        sind „iOS bauen“ und „iOS verteilen“ als übersprungen markiert, und die Veröffentlichung
            ist trotzdem grün
```

**AC-051 — Fehlerfall: iOS an ohne Apple-Zugang** (aus Spec 0014)

```gherkin
Angenommen  der Schalter „iOS“ ist an, aber die Apple-Zugangsdaten fehlen in der Umgebung
            „production“
Wenn        die Veröffentlichung startet
Dann        bricht sie vor jeder Auslieferung mit „iOS ist an, aber der Apple-Zugang fehlt“ ab
```

**AC-056 — Installieren per Link**

```gherkin
Angenommen  die GitHub-Veröffentlichung „2026.12.5“ nennt den Installations-Link
Wenn        Nadja den Link auf ihrem Android-Handy öffnet, die Installation aus dieser Quelle einmal
            erlaubt und installiert
Dann        startet „Housekeeping“ mit der Anmeldeseite
```

**AC-057 — Neue App über die alte installieren**

```gherkin
Angenommen  auf Nadjas Handy ist „2026.12.4“ installiert, sie ist angemeldet, und ein Haken wartet
            in der Laden-Warteschlange
Wenn        sie die APK „2026.12.5“ darüber installiert und die App mit Netz startet
Dann        ist sie weiterhin angemeldet, und der Haken wird nachgereicht
```

**AC-058 — Fehlerfall: anders signierte APK**

```gherkin
Angenommen  eine APK „Housekeeping“, die nicht mit dem Signaturschlüssel der Veröffentlichung
            signiert ist
Wenn        jemand sie über die installierte App installieren will
Dann        lehnt Android die Installation ab, und die installierte App mit ihren Daten bleibt
            unverändert
```

## Offline und Konflikte

Diese Spec ändert keine Regel aus `docs/architecture/sync.md` und fügt keine Offline-Aktion hinzu.
Die native App erbt das Verhalten der Web-App; neu ist nur, wo Sitzung und lokaler Speicher liegen
und wie Netz und Vordergrund erkannt werden.

| Lage                                                     | Verhalten                                                                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Zwei Geräte haken offline dasselbe ab bzw. zurück        | wie bisher: „Abhaken gewinnt“; native App und PWA sind zwei Geräte                                                                      |
| Zwei Geräte bearbeiten online dasselbe                   | wie bisher: „letzte Änderung gewinnt je Feld“                                                                                           |
| App wird beendet, während die Laden-Warteschlange wartet | die Warteschlange liegt dauerhaft auf dem Gerät und wird beim nächsten Start mit Netz nachgereicht (AC-016)                             |
| App wird mitten im Abgleich beendet                      | der lokale Speicher hat danach einen vollständigen Stand; der Cursor ist erst nach einem vollständig gelungenen Schritt weiter (AC-018) |
| Neue Speicher-Version per Over-the-Air-Update oder APK   | voll neu laden, die Laden-Warteschlange bleibt (AC-017)                                                                                 |
| Gerät unter der Mindestversion                           | Lesen und Abhaken lokal weiter; Nachreichen und Bearbeiten erst nach dem Update (AC-042)                                                |
| WLAN ohne Internet                                       | Schreiben scheitert mit Hinweis, Laden-Aktionen bleiben in der Warteschlange (AC-023)                                                   |
| Sitzung lässt sich offline nicht erneuern                | die App startet mit der gespeicherten Sitzung und erneuert sie, sobald Netz da ist (AC-009, AC-010)                                     |

Was noch nicht abgeglichen ist, zeigt die App wie im Web: Laden-Aktionen erscheinen sofort lokal,
der orange Hinweis sagt, dass das Gerät offline ist.

## Plattformen

- **Android:** erste native Plattform. Development Build im Emulator für die Entwicklung, APK über
  die interne Verteilung für Enrico und Nadja (Offene Frage 4). Zurück-Taste nach REQ-006; die
  „vorhersagende Zurück-Geste“ bleibt aus (`predictiveBackGestureEnabled: false`), die Zurück-Geste
  verhält sich wie die Taste. Mitteilungen brauchen ab Android 13 eine Erlaubnis, gefragt nur nach
  REQ-007. Die App wird von der Android-Gerätesicherung ausgenommen (Annahme, Offene Frage 7).
- **iOS und iPadOS:** Code und Nachweise im iOS-Simulator, ohne Apple-Developer-Account. Auf echte
  Geräte, über TestFlight und mit Push erst mit Account (Offene Frage 12). Das iPad nutzt das
  Layout der Web-App für diese Breite.
- **Web und PWA:** unverändert; alle Änderungen an gemeinsamem Code müssen das Web-Verhalten
  erhalten (bestehende E2E-Suite).
- **Expo Go:** nur für schnelle Versuche; ohne Google-Anmeldung (AC-007), mit Testkonten.
- **Barrierefreiheit:** System-Dialoge (Google, Fotoauswahl, Erlaubnis) sind die des Systems; neue
  Hinweise (AC-007, AC-041, AC-044) werden von VoiceOver und TalkBack vorgelesen.

## Daten

- **Neu auf dem Gerät:** die Supabase-Sitzung im sicheren Speicher des Systems (Schlüsselbund bzw.
  Android Keystore); lokaler Speicher, Laden-Warteschlange und Fotos (Budget wie im Web, 50 MB) im
  App-eigenen Speicher, nicht in der Gerätesicherung (Annahme, Offene Frage 7). Alles wird beim
  Abmelden gelöscht (AC-012).
- **Neu auf dem Server:** Push-Abos der nativen App mit Expo-Push-Token und Gerätename
  („Android · native App“); personenbezogen wie die Web-Push-Abos, gehören der Person, nicht
  synchronisiert (ADR-0014). Keine neuen Fachdaten.
- **Fotos:** wie Spec 0004; die App erhält nur das gewählte Foto, Standort- und Kameradaten werden
  vor dem Hochladen entfernt.
- **An Dritte:**
  - **Google:** native Anmeldung über die Google-Dienste des Systems (Adresse, Name), wie bisher
    im Web.
  - **Expo (EAS):** App-Code für Builds und Over-the-Air-Updates, der Signaturschlüssel der
    Android-App, Expo-Push-Token; Nachrichten (Titel, Text, Ziel-Link) laufen über den
    Expo-Push-Dienst und Google (FCM) bzw. später Apple (APNs). Keine Inhalte der Haushalte
    außerhalb der Nachrichten (Spec 0013, AC-040).
  - **Apple:** erst mit Account (TestFlight, APNs).
- **Gelöscht:** beim Abmelden alles auf dem Gerät; ein Push-Abo, das Expo als nicht mehr
  vorhanden meldet, wird abgeschaltet (AC-039).

## Was Enrico bereitstellen muss

| Was                                                                                                                                                     | Wofür                                 | Blockiert                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| Entscheidung App-ID (Offene Frage 2)                                                                                                                    | OAuth-Clients, erster Build           | Auslieferung; Code nur im Namen      |
| Google Cloud: OAuth-Client „Android“ (Paketname, SHA-1 von Debug- und EAS-Schlüssel) und „iOS“ (Bundle-ID); Client-IDs in Supabase lokal und Produktion | native Anmeldung                      | Nachweis AC-001/AC-002, Auslieferung |
| Expo-Konto, Projekt, `EXPO_TOKEN` in der GitHub-Umgebung `production`                                                                                   | Builds, Over-the-Air-Updates          | Auslieferung (REQ-009, REQ-010)      |
| Firebase-Projekt und FCM-Zugang (V1) für Expo Push, in EAS hinterlegt                                                                                   | Push auf Android (Offene Frage 3)     | Nachweis AC-035 auf dem Gerät        |
| Sicherungskopie des Android-Signaturschlüssels nach dem ersten Build (Runbook Spec 0014, Abschnitt 6)                                                   | Updates über die installierte App     | —                                    |
| Apple Developer Program (99 $ im Jahr), App Store Connect, APNs-Schlüssel                                                                               | iOS auf Geräten, TestFlight, iOS-Push | nur iOS-Auslieferung                 |
| Play Console (25 $ einmalig), nur falls Offene Frage 4 B                                                                                                | Play-Store-Testkanal                  | nur bei Option B                     |

Geheime Werte setzt Enrico selbst; Agenten sehen sie nie (`10-security.md`).

## Offene Fragen

Nach Enricos Vorab-Freigabe gilt bei `OFFEN` die genannte Annahme A, bis er anders entscheidet.
`BLOCKER` betrifft nur die Auslieferung (REQ-009, REQ-010 und Nachweise auf echten Geräten), nie
den Code-Teil.

| #   | Frage                                               | Optionen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Empfehlung                                                                                                 | Status                                                                                            |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Wie meldet sich die native App bei Google an?       | A: Google-Anmeldedialog des Systems (natives Google-Sign-in-Modul), ID-Token an Supabase — Pro: wie in ADR-0003 vorgesehen, Kontoauswahl des Systems, kein Browser; Contra: OAuth-Clients je Plattform, SHA-1 des Signaturschlüssels, geht nicht in Expo Go · B: Browser-Fenster mit PKCE über Supabase und Rücksprung per `housekeeping://` — Pro: kein neuer Google-Client, geht auch in Expo Go; Contra: Browser-Fenster statt Systemdialog, Weiterleitungs-Adresse in Supabase, weicht von ADR-0003 ab                                                                                                                                  | A, weil es ADR-0003 folgt und sich wie eine App anfühlt; B bleibt Rückfall, falls A an Google scheitert    | OFFEN, Annahme A                                                                                  |
| 2   | App-ID für Android und iOS (aus Spec 0014, Frage 4) | A: `de.enricogoerlitz.housekeeping` — Pro: eindeutig, keine Domain nötig · B: rückwärts geschriebene eigene Domain — Contra: Domain muss es geben                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | A; bindet nach dem ersten installierten Build für immer, deshalb vor dem ersten Build bestätigen           | OFFEN, Annahme A                                                                                  |
| 3   | Zustellweg für native Benachrichtigungen            | A: Expo Push (Expo-Push-Token als Push-Abo, `push-send` stellt zusätzlich an den Expo-Push-Dienst zu; Nachtrag zu ADR-0014) — Pro: kostenlos, ein Weg für Android und iOS, keine FCM- oder APNs-Schlüssel in unseren Functions; Contra: ein weiterer Anbieter im Zustellweg, Android braucht trotzdem ein Firebase-Projekt (in EAS) · B: FCM und APNs direkt aus `push-send` — Pro: kein Expo im Zustellweg; Contra: Dienstkonto-Schlüssel von Google und APNs-Schlüssel als Function-Secrets, zwei Protokolle · C: kein nativer Push, die PWA bleibt dafür zuständig — Pro: nichts zu bauen; Contra: wer nur die App nutzt, bekommt nichts | A, wie in ADR-0014 schon vorgesehen; der Nachtrag hält die Erweiterung der Prüfung in `push-send` fest     | OFFEN, Annahme A                                                                                  |
| 4   | Wie kommt die Android-App auf die Handys?           | A: interne Verteilung von EAS (APK, Link in der GitHub-Veröffentlichung) — Pro: kostenlos, kein Play-Konto; Contra: einmal „unbekannte Quellen“ erlauben, neue APKs von Hand installieren · B: Play Console, interner Testkanal — Pro: Updates über den Play Store; Contra: 25 $, Play-Konto, AAB statt APK, Testerliste                                                                                                                                                                                                                                                                                                                    | A, weil Over-the-Air-Updates die meisten Änderungen ohnehin bringen; B, wenn neue APKs zu oft nötig werden | OFFEN, Annahme A                                                                                  |
| 5   | Over-the-Air-Updates                                | A: ja, Kanal `production`, veröffentlicht nur von der Veröffentlichung aus `main` (AC-055) — Pro: reine JavaScript-Änderungen ohne neue APK; Contra: `EXPO_TOKEN` kann ein Update an alle Geräte schicken (Bedrohungsmodell im Plan, Nachtrag zu ADR-0015) · B: nein, jede Veröffentlichung baut eine neue APK — Pro: kleinere Angriffsfläche; Contra: jede Änderung von Hand installieren, Build-Kontingent von EAS · C: wie A, zusätzlich signierte Updates (Code-Signierung von `expo-updates`) — Pro: ein gestohlenes Token reicht nicht; Contra: ob es im kostenlosen Tarif geht, ist nicht belegt                                     | A; der Plan prüft C und nimmt es, wenn es kostenlos geht                                                   | OFFEN, Annahme A                                                                                  |
| 6   | Kamera in der App                                   | A: nur Mediathek — Pro: keine Kamera-Erlaubnis, wie Spec 0004 „Nativ (später)“ · B: auch „Foto aufnehmen“ — Pro: wie die Dateiauswahl im Handy-Browser; Contra: Kamera-Erlaubnis, mehr Fälle                                                                                                                                                                                                                                                                                                                                                                                                                                                | A, weil Fotos meist schon in der Mediathek liegen                                                          | OFFEN, Annahme A                                                                                  |
| 7   | Android-Gerätesicherung                             | A: App von der Gerätesicherung ausnehmen — Pro: Daten der Haushalte und Push-Daten landen nicht im Google-Konto; nach Wiederherstellung meldet man sich neu an, der Speicher lädt neu; Contra: nach Handywechsel neu anmelden · B: Standard des Systems — Contra: die Sitzung ließe sich ohnehin nicht wiederherstellen (Keystore), Daten lägen ungefragt bei Google                                                                                                                                                                                                                                                                        | A, weil der lokale Speicher wegwerfbar ist                                                                 | OFFEN, Annahme A                                                                                  |
| 8   | „Aktualisieren“, wenn eine neue App nötig ist       | A: Text und Knopf „Zur neuesten Veröffentlichung“, öffnet die GitHub-Seite der neuesten Veröffentlichung (Repo ist öffentlich) — Pro: der Link zur APK steht dort; Contra: GitHub-Seite statt App-Seite · B: nur Text „Lade die neue App“ — Contra: man muss den Link selbst suchen                                                                                                                                                                                                                                                                                                                                                         | A                                                                                                          | OFFEN, Annahme A                                                                                  |
| 9   | Neue Texte                                          | A: wie in AC-007, AC-033, AC-041 und AC-044; Gerätename der nativen App „Android · native App“ bzw. „iPhone · native App“, damit er sich von der PWA („Android · App“) unterscheidet · B: andere Texte                                                                                                                                                                                                                                                                                                                                                                                                                                      | A                                                                                                          | OFFEN, Annahme A                                                                                  |
| 10  | Testkonten in nativen Development Builds            | A: nur gegen eine Supabase auf dem Rechner bzw. im Emulator (`localhost`, `127.0.0.1` und die Emulator-Adresse des Rechners `10.0.2.2`) — Pro: Spec 0003, AC-007 bleibt gültig; Contra: Testkonten auf einem echten Handy im WLAN gehen nicht · B: auch private Adressen im Heimnetz — Pro: echtes Handy mit lokaler Supabase; Contra: weicht die Sperre auf                                                                                                                                                                                                                                                                                | A                                                                                                          | OFFEN, Annahme A                                                                                  |
| 11  | Native Vorschau                                     | A: keine; native Stände lokal im Emulator prüfen — Pro: kein zweites EAS-Projekt, Build-Kontingent bleibt für Produktion; Contra: eine native Änderung sieht Enrico auf seinem Handy erst nach der Veröffentlichung · B: Vorschau-APK gegen das Supabase-Projekt „Vorschau“ — Contra: zweiter Kanal, zweite App-ID oder Variante, Google-Client für die Vorschau                                                                                                                                                                                                                                                                            | A                                                                                                          | OFFEN, Annahme A                                                                                  |
| 12  | Apple Developer Program                             | Enrico bucht es (99 $ im Jahr) oder nicht                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | erst buchen, wenn Android im Alltag läuft                                                                  | BLOCKER (nur iOS-Auslieferung, iOS-Push, AC-050/AC-051 mit Schalter an)                           |
| 13  | Google-OAuth-Clients für Android und iOS            | Enrico legt sie in der Google Cloud Console an (Paketname bzw. Bundle-ID aus Frage 2, SHA-1 von Debug- und EAS-Schlüssel) und trägt die Client-IDs in Supabase ein                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | sobald Frage 2 bestätigt ist                                                                               | BLOCKER (nur Nachweis AC-001, AC-002 und Auslieferung; Code und Tests mit Fälschungen gehen ohne) |
| 14  | EAS-Konto und `EXPO_TOKEN`                          | Enrico legt Konto und Projekt an und setzt das Token in `production`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | vor der ersten Veröffentlichung mit Android                                                                | BLOCKER (nur REQ-009, REQ-010)                                                                    |
| 15  | Play Console                                        | nur bei Frage 4 B                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                                                                                                          | BLOCKER nur, falls Frage 4 B gewählt wird                                                         |

## Rückverfolgbarkeit

| REQ     | AC                                   | Task (plan.md) | Test |
| ------- | ------------------------------------ | -------------- | ---- |
| REQ-001 | AC-001 bis AC-008                    | —              | —    |
| REQ-002 | AC-009 bis AC-014                    | —              | —    |
| REQ-003 | AC-015 bis AC-019                    | —              | —    |
| REQ-004 | AC-020 bis AC-023                    | —              | —    |
| REQ-005 | AC-024 bis AC-029                    | —              | —    |
| REQ-006 | AC-030 bis AC-032                    | —              | —    |
| REQ-007 | AC-033 bis AC-041                    | —              | —    |
| REQ-008 | AC-042 bis AC-046                    | —              | —    |
| REQ-009 | AC-047 bis AC-049, AC-052 bis AC-055 | —              | —    |
| REQ-010 | AC-050, AC-051, AC-056 bis AC-058    | —              | —    |
