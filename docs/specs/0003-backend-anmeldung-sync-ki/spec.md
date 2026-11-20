---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-20
---

# 0003 — Echtes Backend: Anmeldung, Daten, Sync und KI

## Problem

Die App aus Spec 0001 und 0002 läuft nur mit Beispieldaten im Speicher des Browsers. Was Enrico
oder Nadja eintragen, ist nach dem Neuladen weg, und die beiden sehen nicht, was der andere ändert.
Der Assistent antwortet nur mit hinterlegten Beispielen. Damit ist die App noch nicht im Alltag
nutzbar.

## Ziel

Alles, was die App zeigt, liegt in Supabase und ist für alle Mitglieder eines Haushalts gleich.
Anmelden geht mit Google, aber nur mit Einladung. Jedes Gerät hält eine Kopie der Daten, liest
auch ohne Netz und hakt im Laden offline ab. Der Assistent, die KI-Suche und die Spracheingabe
arbeiten mit der echten KI. Alles läuft zuerst lokal in Docker und ist automatisch getestet.

## Nicht-Ziele

- **Kein Betrieb in der Cloud** in dieser Spec: Supabase-Projekt in der Cloud, Web-Hosting,
  Domain und der nächtliche Datenbank-Dump (ADR-0007) kommen in einer eigenen Spec, sobald lokal
  alles läuft.
- **Keine nativen Apps.** Ziel ist die Web-App (auch als PWA auf dem Handy). Der Code bleibt
  plattformneutral, Secure Store und native Google-Anmeldung kommen später.
- **Kein Hochladen eigener Fotos.** Rezepte behalten die mitgelieferten Beispielfotos oder den
  Platzhalter.
- **Kein Offline-Bearbeiten** über die vier Laden-Aktionen hinaus (ADR-0008, Nachtrag).
- **Keine Benachrichtigungen** (Push, E-Mail) für Aufgaben oder Einladungen. Eine Einladung teilt
  man selbst mit („Ich hab dich eingeladen, melde dich mit Google an“).
- **Keine Neugestaltung der Oberfläche.** Bildschirme ändern sich nur dort, wo Anmeldung,
  Einladungen, Fehler- und Ladezustände es verlangen. Das Desktop-Design wird danach überarbeitet.

## Konzept in Kürze

- **Supabase lokal in Docker** ist die Quelle der Wahrheit: Postgres mit Row Level Security,
  Auth (Google), Realtime und Edge Functions. Die Datenstruktur folgt den Typen in
  `packages/core`.
- **Anmeldung:** nur Google. Neue Konten entstehen nur für Adressen auf der **Einladungsliste**
  (ADR-0003). Lokal gibt es zusätzlich **Testkonten** mit E-Mail und Passwort, damit Tests ohne
  Google laufen; in Produktion ist dieser Weg auf dem Server abgeschaltet.
- **Lesen** kommt immer aus dem **lokalen Speicher** des Geräts, der per Delta-Abgleich aktuell
  bleibt (`docs/architecture/sync.md`). **Schreiben** geht online direkt an Supabase; die Anzeige
  ändert sich sofort und stellt sich zurück, wenn der Server ablehnt.
- **Im Laden** gehen vier Aktionen offline über die **Laden-Warteschlange**: abhaken, „nicht da“,
  Posten hinzufügen, Bereich zuordnen.
- **KI** über Microsoft Foundry, nur aus Edge Functions (ADR-0009). Die App ruft die KI nie
  unbemerkt auf: nur nach einer ausdrücklichen Aktion oder bei eingeschalteter KI-Suche.

## Anforderungen und Akzeptanzkriterien

### REQ-001 — Anmelden mit Google, nur mit Einladung

> Nur eingeladene Google-Adressen können ein Konto anlegen; abmelden löscht die Daten vom Gerät.

**Offline:** nur online (Anmelden). Eine gespeicherte Sitzung startet auch offline.

**AC-001**

```gherkin
Angenommen  die Adresse von Enrico steht auf der Einladungsliste des Haushalts „Enrico & Nadja“
Wenn        Enrico „Mit Google anmelden“ wählt und die Anmeldung bei Google abschließt
Dann        sieht er „Heute“ mit den Daten von „Enrico & Nadja“
```

**AC-002 — Fehlerfall: nicht eingeladen**

```gherkin
Angenommen  eine Google-Adresse, die auf keiner Einladungsliste steht
Wenn        sich jemand damit anmeldet
Dann        entsteht kein Konto
Und         die Anmeldeseite zeigt „Diese Adresse ist nicht eingeladen. Bitte lass dich von
            jemandem aus deinem Haushalt einladen.“
```

**AC-003 — Abmelden**

```gherkin
Angenommen  Enrico ist angemeldet, der lokale Speicher ist gefüllt und ein Haken wartet offline
Wenn        er sich abmeldet
Dann        sind lokaler Speicher und Laden-Warteschlange auf diesem Gerät leer
Und         er sieht die Anmeldeseite
```

**AC-004 — Start ohne Netz**

```gherkin
Angenommen  Enrico war angemeldet und hat die App geschlossen
Wenn        er sie ohne Netz wieder öffnet (auch per Neuladen der Seite)
Dann        startet die App mit seiner Sitzung und den zuletzt abgeglichenen Daten
Und         zeigt den orangen Hinweis „Offline – Lesen und Abhaken gehen“
```

**AC-005 — Ohne Anmeldung kein Zugriff**

```gherkin
Angenommen  niemand ist angemeldet
Wenn        jemand Daten oder eine Edge Function direkt über die Supabase-API abfragt
Dann        bekommt er keine Zeilen bzw. die Antwort 401
```

### REQ-002 — Testkonten nur in der lokalen Umgebung

> Lokal gibt es Testkonten mit E-Mail und Passwort für automatische Tests; in Produktion nicht.

**Offline:** nur online.

**AC-006**

```gherkin
Angenommen  die lokale Supabase läuft und die App ist mit dem Entwicklungs-Schalter gebaut
Wenn        ich auf der Anmeldeseite „Als Test-Enrico anmelden“ wähle
Dann        bin ich als Testkonto „Enrico (Test)“ im Haushalt „Enrico & Nadja“ angemeldet
```

**AC-007 — Fehlerfall: Testzugang außerhalb der Entwicklung**

```gherkin
Angenommen  ein Build ohne Entwicklungs-Schalter
Wenn        ich die Anmeldeseite öffne
Dann        gibt es nur „Mit Google anmelden“
Und         die Supabase-Konfiguration für Produktion hat die E-Mail-Anmeldung abgeschaltet
```

### REQ-003 — Haushalte und Einladungen

> Mitglieder laden per Google-Adresse ein, legen Haushalte an und sehen nur ihre eigenen Haushalte.

**Offline:** nur online (Einladen, Anlegen, Entfernen); die Liste der Mitglieder ist offline lesbar.

**AC-008 — Einladen**

```gherkin
Angenommen  Enrico ist Mitglied von „Enrico & Nadja“, Nadja hat noch kein Konto
Wenn        er unter Einstellungen → Haushalt Nadjas Google-Adresse einlädt
Dann        steht sie dort als „Eingeladen“
Wenn        Nadja sich mit dieser Adresse anmeldet
Dann        ist sie Mitglied von „Enrico & Nadja“ und sieht dieselben Daten
```

**AC-009 — Fehlerfall: ungültige Adresse**

```gherkin
Angenommen  die Einladen-Maske
Wenn        ich „nadja@“ eingebe und „Einladen“ wähle
Dann        wird nichts gespeichert und das Feld zeigt „Das ist keine E-Mail-Adresse“
```

**AC-010 — Neuer Haushalt**

```gherkin
Angenommen  Enrico ist angemeldet
Wenn        er den Haushalt „WG Köln“ anlegt
Dann        ist er dessen einziges Mitglied
Und         der Haushalt hat die Starter-Bereiche, den Starter-Katalog, eine Standardliste und
            die Mahlzeiten „Mittag“ und „Abend“
```

**AC-011 — Fremder Haushalt**

```gherkin
Angenommen  Nadja ist nur Mitglied von „Enrico & Nadja“, nicht von „WG Köln“
Wenn        sie über die Supabase-API Zeilen von „WG Köln“ liest, ändert, löscht oder eine Zeile
            mit dessen household_id anlegt
Dann        bekommt sie keine Zeilen und jede Änderung wird abgelehnt — für jede Tabelle
```

**AC-012 — Mitglied entfernen**

```gherkin
Angenommen  Nadja ist Mitglied von „WG Köln“ und hat den Haushalt im lokalen Speicher
Wenn        Enrico sie aus „WG Köln“ entfernt
Dann        verschwindet „WG Köln“ beim nächsten Abgleich von Nadjas Gerät, samt aller Daten
```

### REQ-004 — Alle Daten liegen in Supabase und sind für alle gleich

> Rezepte, Wochenplan, Listen, Märkte, Aufgaben, Restaurants, Abwesenheiten und Feedback werden
> gespeichert und erreichen die anderen Geräte ohne Neuladen.

**Offline:** offline lesend (Schreiben siehe REQ-006).

**AC-013 — Zweites Gerät**

```gherkin
Angenommen  Enrico und Nadja haben „Essen“ offen, jeder auf seinem Gerät
Wenn        Enrico das Rezept „Linsen-Dal“ anlegt
Dann        erscheint „Linsen-Dal“ bei Nadja, ohne dass sie neu lädt
```

**AC-014 — Bleibt gespeichert** (ersetzt Spec 0001, AC-014, für den Betrieb mit Backend)

```gherkin
Angenommen  ich habe „Spülmittel“ auf die Standardliste gesetzt
Wenn        ich die Seite neu lade
Dann        steht „Spülmittel“ weiter auf der Liste
```

**AC-015 — Löschen erreicht andere Geräte**

```gherkin
Angenommen  „Halloumi-Pfanne“ steht im Wochenplan, Nadja hat den Plan offen
Wenn        Enrico den Eintrag entfernt
Dann        verschwindet er auch bei Nadja
```

### REQ-005 — Offline lesen aus dem lokalen Speicher

> Jedes Gerät hält eine Kopie seiner Haushalte und liest nur daraus.

**Offline:** offline vollständig (lesen).

**AC-016**

```gherkin
Angenommen  Enrico war angemeldet und der Abgleich ist durchgelaufen
Wenn        das Netz wegfällt
Dann        kann er alle Bildschirme öffnen und sieht dieselben Daten wie vorher
Und         Bearbeiten ist ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“
```

**AC-017 — Lange offline**

```gherkin
Angenommen  ein Gerät war länger offline als die Aufbewahrungsfrist des Löschprotokolls
Wenn        es wieder Netz hat
Dann        lädt es alle Daten neu statt nur die Änderungen
```

**AC-018 — Neue Speicher-Version**

```gherkin
Angenommen  eine neue App-Version speichert die Daten in anderer Form
Wenn        sie startet
Dann        verwirft sie den alten lokalen Speicher und lädt einmal alles neu
```

### REQ-006 — Schreiben online, sofort sichtbar, ehrlich bei Fehlern

> Änderungen erscheinen sofort, gehen an den Server und werden zurückgenommen, wenn er ablehnt.

**Offline:** nur online (außer REQ-007).

**AC-019 — Fehlerfall: Server lehnt ab**

```gherkin
Angenommen  ich benenne ein Rezept um und der Server lehnt die Änderung ab
Dann        steht wieder der alte Name da
Und         ein Hinweis sagt „Hat nicht geklappt – bitte noch einmal versuchen“
```

**AC-020 — Alles oder nichts**

```gherkin
Angenommen  ich übernehme im Vorratscheck zehn Zutaten auf die Liste
Wenn        dabei auf dem Server ein Fehler passiert
Dann        steht keine der zehn Zutaten auf der Liste
```

### REQ-007 — Laden-Warteschlange

> Abhaken, „nicht da“, Posten hinzufügen und Bereich zuordnen gehen offline und werden später
> nach festen Regeln nachgereicht (`docs/architecture/sync.md`, ADR-0008 Nachtrag).

**Offline:** offline vollständig für diese vier Aktionen.

**AC-021 — Abhaken offline**

```gherkin
Angenommen  Enrico ist im Einkaufsmodus ohne Netz
Wenn        er „Milch“ abhakt und später wieder Netz hat
Dann        ist „Milch“ auch bei Nadja abgehakt
```

**AC-022 — Abhaken gewinnt**

```gherkin
Angenommen  „Butter“ ist abgehakt, Enricos Gerät ist offline
Wenn        Enrico den Haken bei „Butter“ zurücknimmt
Und         Nadja „Butter“ inzwischen erneut abgehakt hat
Und         Enricos Gerät wieder online ist
Dann        bleibt „Butter“ abgehakt
```

**AC-023 — Kein doppelter Posten**

```gherkin
Angenommen  Enrico ist offline, Nadja online, „Brot“ steht nicht auf der Liste
Wenn        beide „Brot“ hinzufügen und Enrico wieder online ist
Dann        steht „Brot“ einmal auf der Liste, mit beiden Beiträgen
```

**AC-024 — Übersteht Neuladen**

```gherkin
Angenommen  Enrico hat offline drei Posten abgehakt
Wenn        er die Seite ohne Netz neu lädt
Dann        sind die drei Posten weiterhin abgehakt
Und         werden nachgereicht, sobald Netz da ist
```

**AC-025 — Posten inzwischen gelöscht**

```gherkin
Angenommen  Enrico hakt offline „Eier“ ab, Nadja löscht „Eier“ online
Wenn        Enrico wieder online ist
Dann        ist „Eier“ von der Liste verschwunden und es erscheint kein Fehler
```

### REQ-008 — Echte KI

> Assistent, KI-Suche und Spracheingabe nutzen die KI über Edge Functions; Vorschläge ändern
> erst nach „Übernehmen“ etwas.

**Offline:** nur online. Offline sind KI-Aktionen ausgegraut mit Hinweis.

**AC-026 — Vorschlag**

```gherkin
Angenommen  „Mango-Curry“ ist geöffnet, 4 Portionen
Wenn        ich den Assistenten bitte „Mach das vegan und für 6 Personen“
Dann        erscheint eine Vorschlagskarte mit den Änderungen, ohne den Hinweis „Beispielantwort“
Und         das Rezept ist unverändert
Wenn        ich „Übernehmen“ wähle
Dann        hat „Mango-Curry“ 6 Portionen und ist auch bei Nadja so gespeichert
```

**AC-027 — KI-Suche nur eingeschaltet**

```gherkin
Angenommen  der Schalter „KI-Suche“ ist aus
Wenn        ich „was Schnelles mit Tofu“ suche
Dann        geht keine Anfrage an die KI
Wenn        ich den Schalter einschalte
Dann        zeigt die Suche die Deutung als Chips und Treffer mit Begründung
```

**AC-028 — Spracheingabe**

```gherkin
Angenommen  die Standardliste und ein Mikrofon
Wenn        ich „Milch, sechs Eier und Brot“ spreche
Dann        erscheinen drei Vorschlagszeilen, die ich übernehmen oder verwerfen kann
Und         im Browser taucht der Foundry-Schlüssel nirgends auf, nur ein kurzlebiges Token
```

**AC-029 — Fehlerfall: KI nicht erreichbar**

```gherkin
Angenommen  der KI-Dienst antwortet nicht
Wenn        ich den Assistenten etwas frage
Dann        sehe ich „Der Assistent ist gerade nicht erreichbar“ und nichts wird geändert
```

**AC-030 — Fehlerfall: Kontingent aufgebraucht**

```gherkin
Angenommen  ein Mitglied hat heute sein KI-Kontingent verbraucht
Wenn        es den Assistenten etwas fragt
Dann        sieht es „Für heute ist das KI-Kontingent aufgebraucht“ und es geht keine Anfrage an Foundry
```

### REQ-009 — Kurzlinks von Google Maps

> Ein geteilter Kurzlink wird auf dem Server aufgelöst; die App erhält Name und Ort.

**Offline:** nur online.

**AC-031**

```gherkin
Angenommen  das Formular „Restaurant hinzufügen“
Wenn        ich einen Kurzlink "https://maps.app.goo.gl/…" einfüge und speichere
Dann        hat das neue Restaurant den Namen und die Koordinaten des geteilten Orts
```

**AC-032 — Fehlerfall: fremde Adresse**

```gherkin
Angenommen  ein Link, dessen Weiterleitung nicht zu Google Maps führt oder auf eine interne
            Adresse zeigt
Wenn        der Server ihn auflösen soll
Dann        folgt er ihm nicht weiter und die App zeigt „Das ist kein Karten-Link“
```

### REQ-010 — Lokale Umgebung mit Beispieldaten

> Ein Befehl baut die lokale Datenbank mit allen Regeln und dem Demo-Haushalt auf; die Tests
> laufen gegen sie.

**Offline:** —

**AC-033**

```gherkin
Angenommen  Docker läuft
Wenn        ich `pnpm db:reset` ausführe
Dann        enthält die lokale Datenbank den Haushalt „Enrico & Nadja“ mit den Beispieldaten aus
            Spec 0001 und 0002, den leeren Haushalt „Test“ und die beiden Testkonten
Und         eine in `.env` hinterlegte eigene Google-Adresse steht auf der Einladungsliste von
            „Enrico & Nadja“
```

**AC-034**

```gherkin
Angenommen  die lokale Supabase läuft mit frischen Beispieldaten
Wenn        ich `pnpm e2e` ausführe
Dann        laufen die Rundgänge aus Spec 0001 und 0002 angemeldet gegen die echte Datenbank
Und         die Zwei-Geräte-Fälle aus REQ-004 und REQ-007 mit zwei Browsern
```

## Offline und Konflikte

| Bereich                                  | Verhalten                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Lesen aller Daten                        | offline vollständig aus dem lokalen Speicher                                                 |
| Abhaken, „nicht da“, hinzufügen, Bereich | offline vollständig über die Laden-Warteschlange; Regeln aus `sync.md` und ADR-0008-Nachtrag |
| Alles andere Schreiben, KI, Einladen     | nur online, ausgegraut mit Hinweis                                                           |
| Gleichzeitige Änderungen online          | letzte Änderung gewinnt je Feld; Bewertungen und Favoriten sind je Person getrennt           |
| Mitgliedschaft entzogen                  | Haushalt verschwindet beim nächsten Abgleich vom Gerät                                       |
| Abmelden                                 | lokaler Speicher und Warteschlange werden gelöscht                                           |

## Plattformen

- **Web und PWA:** Die App-Hülle wird per Service Worker vorgehalten, damit sie ohne Netz startet
  (AC-004). Der lokale Speicher liegt im Browser (IndexedDB).
- **iOS Safari:** Speicher einer nicht installierten Website kann verfallen; die App empfiehlt
  einmalig „Zum Home-Bildschirm“.
- **Nativ:** nicht Teil dieser Spec; Speicher und Sitzung liegen hinter Schnittstellen in
  `packages/api`.

## Daten

- **Neu gespeichert:** Google-Adresse und Name der Mitglieder, Einladungen (Adresse, Haushalt,
  einladende Person, Zeitpunkt), alle Fachdaten aus Spec 0001 und 0002, Zähler für die KI-Nutzung
  je Mitglied und Tag.
- **An Dritte:** Für KI-Funktionen gehen Rezepttexte, Listeninhalte, Suchanfragen und
  Sprachaufnahmen an Microsoft Foundry (Azure, Region `westeurope`). Nichts davon wird dort von uns
  gespeichert.
- **Gelöscht:** Abmelden löscht die Daten vom Gerät. Konto- und Haushalt-Löschung kommen mit der
  Spec für den Betrieb.

## Offene Fragen

| #   | Frage                                       | Optionen                                                                                    | Empfehlung                                                                                                              | Status                  |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1   | Testkonten oder nur Google beim Testen      | A: Testkonten nur lokal · B: nur Google, Sitzung per Admin-API · C: Enrico meldet sich an   | A                                                                                                                       | ENTSCHIEDEN: A          |
| 2   | KI in dieser Spec oder danach               | A: danach · B: alles in einem                                                               | A                                                                                                                       | ENTSCHIEDEN: B (Enrico) |
| 3   | Höhe des KI-Kontingents                     | je Mitglied und Tag: A: 200 Anfragen und 20 Sprach-Sitzungen (Token) · B: kein Limit        | A: schützt vor Kosten durch Fehler oder Schleifen; Minuten sind nicht messbar, weil der Browser direkt zu Azure streamt | ENTSCHIEDEN: A          |
| 4   | Woher kommt die eigene Google-Adresse lokal | A: `.env` (`DEV_OWNER_EMAIL`), nie im Repo · B: Einladung per Hand in der lokalen Datenbank | A: wiederholbar nach jedem `db:reset`, die Adresse bleibt privat                                                        | ENTSCHIEDEN: A          |
| 5   | „Offline simulieren“ mit echtem Backend     | A: bleibt in Entwicklungs-Builds · B: entfällt                                              | A: macht Offline-Fälle ohne Netztrennung prüfbar                                                                        | ENTSCHIEDEN: A          |

Weitere Entscheidungen (20.11.2026, nach Enricos Regel „deine Empfehlung“):

| #   | Frage                                           | Entscheidung                                                                                                   |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 6   | „Fertig“ im Einkaufsmodus ohne Netz             | Verlässt nur den Modus mit „Abgehakte räumen wir auf, sobald du Netz hast“; keine fünfte Offline-Aktion        |
| 7   | Einladung einer Person, die schon ein Konto hat | Sie muss die Einladung annehmen (schützt ihr Profil); neue Konten treten bei der Erstanmeldung automatisch bei |
| 8   | Zwei Personen ändern gleichzeitig Zutaten       | Die Zutatenliste eines Rezepts gilt als ein Feld: die letzte Änderung gewinnt                                  |

## Rückverfolgbarkeit

| REQ     | AC                | Task (plan.md) | Test |
| ------- | ----------------- | -------------- | ---- |
| REQ-001 | AC-001 bis AC-005 | —              | —    |
| REQ-002 | AC-006, AC-007    | —              | —    |
| REQ-003 | AC-008 bis AC-012 | —              | —    |
| REQ-004 | AC-013 bis AC-015 | —              | —    |
| REQ-005 | AC-016 bis AC-018 | —              | —    |
| REQ-006 | AC-019, AC-020    | —              | —    |
| REQ-007 | AC-021 bis AC-025 | —              | —    |
| REQ-008 | AC-026 bis AC-030 | —              | —    |
| REQ-009 | AC-031, AC-032    | —              | —    |
| REQ-010 | AC-033, AC-034    | —              | —    |
