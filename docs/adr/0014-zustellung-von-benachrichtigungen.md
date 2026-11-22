---
status: angenommen
datum: 2026-11-21
autor: agent
betrifft:
  [
    0004,
    0007,
    0008,
    0009,
    supabase/migrations,
    supabase/functions/push-send,
    apps/app/scripts/sw-template.js,
    AGENTS.md,
  ]
---

# ADR-0014 — Zustellung von Benachrichtigungen

## Status

`angenommen` · 21.11.2026, vom Eigentümer mit dem Plan zu Spec 0013 („Benachrichtigungen“) vorab
freigegeben. Die fachlichen Entscheidungen D36 bis D43 (UI-Konzept v2, Abschnitt 6) sind
freigegeben, darunter D40 (Rechte des Zeitplaners). Diese ADR hält fest, **womit** zugestellt wird, **wer** plant und **wo** Schlüssel, Push-Abos und das
Zustell-Protokoll liegen. Sie präzisiert Regel 4 und Regel 5 aus `AGENTS.md`; ein eigener Nachtrag
zu ADR-0008 ist damit nicht nötig.

## Kontext

Die App meldet sich bisher nie von selbst. Spec 0013 bringt vier Arten von Nachrichten
(Tagesüberblick, Aktivitäten am Vortag, Aufgaben mit Uhrzeit, Restaurant-Reservierung), die
pünktlich, genau einmal und nur an Betroffene gehen sollen.

Gegeben ist:

- **Plattform:** Heute gibt es nur die Web-App bzw. PWA (ADR-0001). Native Builds mit Expo kommen
  später. Die PWA hat einen eigenen Service Worker (`apps/app/scripts/sw-template.js`, gebaut mit
  `workbox-build` `injectManifest`) und eine strenge CSP ohne fremde Skripte (ADR-0003,
  `finish-web-export.mjs`, `check-web-export.mjs`).
- **iPhone und iPad** empfangen Web Push nur, wenn die PWA über „Zum Home-Bildschirm“ installiert
  ist (ab iOS 16.4) und über HTTPS läuft. Android und Desktop (Chrome, Edge, Firefox) gehen im
  Browser; `localhost` und `127.0.0.1` gelten als sicher und gehen ohne HTTPS.
- **Kosten:** Es soll nichts kosten (ADR-0007): Supabase Free, keine zusätzlichen Dienste mit
  Abrechnung. Supabase Free pausiert ein Projekt nach 7 Tagen ohne Nutzung.
- **Kein `service_role` irgendwo** (`10-security.md`, D40). Alle bisherigen Edge Functions
  arbeiten unter der RLS des Aufrufers (ADR-0009). Ein Zeitplaner hat aber keinen Aufrufer: er
  muss Daten aller Haushalte lesen.
- **`pg_cron` läuft schon** (Aufräumen von Löschmarken, KI-Kontingent). `pg_net` und der Supabase
  Vault sind in jedem Supabase-Projekt verfügbar, auch lokal und im Free-Tarif.
- **Regel 5** verlangt, dass jede Tabelle einem Haushalt gehört und synchronisiert wird. Ein
  Push-Abo gehört aber einer Person und einem Gerät, nicht einem Haushalt; das Zustell-Protokoll
  gehört dem Server. `ai_usage` und `private.recipe_deletions` sind bereits begründete Ausnahmen.
- **Regel 4** verlangt, dass die UI nur aus dem lokalen Speicher liest. Die Liste „Deine Geräte“
  enthält Push-Abos, die nicht synchronisiert werden.

## Entscheidung

Wir stellen Benachrichtigungen per **Web Push mit VAPID** zu. **Die Datenbank plant**: `pg_cron`
startet alle 5 Minuten eine Datenbankfunktion, die fällige Nachrichten findet, jede mit
eindeutigem Schlüssel je Gerät ins Zustell-Protokoll schreibt und sie per `pg_net` mit einem
geteilten Geheimnis aus dem Vault an die Edge Function **`push-send`** gibt. `push-send` stellt
nur zu, mit dem privaten VAPID-Schlüssel, und hat **weder Datenbankzugang noch `service_role`**.

Im Einzelnen:

| Teil              | Festlegung                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zustellweg        | Web Push (RFC 8030), Inhalt verschlüsselt nach RFC 8291 (`aes128gcm`), VAPID nach RFC 8292. Push-Dienste: Google (FCM), Mozilla, Apple, Microsoft (WNS). Der Service Worker der PWA zeigt die Nachricht an und öffnet beim Tipp eine geprüfte Seite der App.                                                                                                                                                                                                               |
| Zeitplaner        | `pg_cron` alle 5 Minuten → `private.run_notification_tick()` (`security definer`, nur für den Cron-Job). Uhrzeiten sind Ortszeit des Haushalts (`households.timezone`); umgerechnet wird erst im Takt. Was mehr als 30 Minuten zu spät käme, wird verworfen.                                                                                                                                                                                                               |
| Einmaligkeit      | Zustell-Protokoll mit eindeutigem Schlüssel je Nachricht und Push-Abo; „höchstens einmal“: ein Fehler wird vermerkt, nicht wiederholt.                                                                                                                                                                                                                                                                                                                                     |
| Übergabe          | `pg_net` → `push-send` mit Kopfzeile `x-push-secret`; Adresse und Geheimnis liegen im Vault (`push_send_url`, `push_send_secret`). Die Antwort (Status je Nachricht) wertet der nächste Takt aus: 404/410 schaltet das Abo ab.                                                                                                                                                                                                                                             |
| `push-send`       | `verify_jwt = false`, verschlüsselt und signiert mit der gepflegten Deno-Bibliothek `jsr:@negrel/webpush` (WebCrypto, Version festgenagelt; keine selbst gebaute Kryptografie), prüft das Geheimnis zeitkonstant, den Inhalt mit Zod und die Push-Adresse gegen eine Liste bekannter Push-Dienste; liest nur `PUSH_SEND_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Kein Supabase-Client, kein `SUPABASE_SERVICE_ROLE_KEY`, kein `SUPABASE_DB_URL`. |
| Schlüssel         | Ein VAPID-Schlüsselpaar je Umgebung (lokal, Produktion). Der öffentliche Schlüssel kommt als `EXPO_PUBLIC_VAPID_PUBLIC_KEY` in den App-Build; der private nur als Secret der Function. Werte setzt der Eigentümer selbst; Agenten sehen sie nie.                                                                                                                                                                                                                           |
| Push-Abos         | `private.push_subscriptions`: gehören einer Person (`profile_id`), nicht einem Haushalt; RLS an, keine Grants; nur über `security definer`-RPCs, die nach `auth.uid()` filtern. **Nicht synchronisiert.** Die Push-Adresse verlässt die Datenbank nur Richtung `push-send`, nie Richtung App.                                                                                                                                                                              |
| Zustell-Protokoll | `private.notification_deliveries`: gehört dem Server, für die App unerreichbar, 30 Tage aufbewahrt. **Nicht synchronisiert.**                                                                                                                                                                                                                                                                                                                                              |
| Einstellungen     | `public.notification_settings` je Mitglied und Haushalt: haushaltsbezogen und synchronisiert nach Regel 5, aber nur für das Mitglied selbst lesbar und änderbar.                                                                                                                                                                                                                                                                                                           |
| Lesen ohne Cache  | „Deine Geräte“ liest online über eine RPC, nicht aus dem lokalen Speicher; ohne Netz zeigt die Seite einen Hinweis. Das ist die einzige Ausnahme von Regel 4 beim Lesen.                                                                                                                                                                                                                                                                                                   |
| Nativ (später)    | Expo Push mit denselben Einstellungen und demselben Zeitplaner; nur der Zustellweg kommt dazu. Eigene Spec, eigener Nachtrag zu dieser ADR.                                                                                                                                                                                                                                                                                                                                |

## Betrachtete Optionen

Zwei Fragen waren zu entscheiden: der **Zustellweg** und **wer plant**.

### Zustellweg

#### Option A — Web Push mit VAPID aus einer Supabase Edge Function

- **Pro:** kostenlos; kein Konto bei einem Push-Anbieter, kein Apple-Developer-Account nötig. Geht
  heute schon in jedem Desktop-Browser und auf Android, nach der Betriebs-Spec (0014) auch auf dem
  iPhone als installierte PWA. Kein fremdes Skript in der Web-App, die CSP bleibt unverändert. Ein
  offener Standard: Die Verschlüsselung lässt sich mit den Testvektoren der RFCs prüfen. Für
  Verschlüsselung (RFC 8291) und VAPID-Signatur (RFC 8292) gibt es kleine, gepflegte Bibliotheken
  auf WebCrypto; wir nutzen `jsr:@negrel/webpush` statt eigener Kryptografie.
- **Contra:** Auf iPhone und iPad nur als installierte PWA ab iOS 16.4; im Safari-Tab gar nicht.
  Push-Dienste geben keine Zustellgarantie und löschen Abos ohne Vorwarnung. Der Inhalt läuft (Ende
  zu Ende verschlüsselt) über Server von Apple, Google, Mozilla bzw. Microsoft. Lokal braucht es
  den gebauten Export mit Service Worker; der Entwicklungsserver hat keinen.

#### Option B — Expo Push für native Apps jetzt

- **Pro:** zuverlässigere Zustellung, auch auf dem iPhone ohne Umweg über den Home-Bildschirm;
  der Expo-Push-Dienst ist kostenlos.
- **Contra:** Es gibt noch keine nativen Apps. iOS-Push braucht APNs und damit das Apple Developer
  Program (99 $/Jahr, ADR-0007) sowie eigene Builds; für die Web-App, die heute genutzt wird, hilft
  es nicht. Bleibt der Weg für später, mit demselben Zeitplaner.

#### Option C — E-Mail über einen Versanddienst (z. B. Resend oder Brevo, Free-Tarif)

- **Pro:** erreicht jedes Gerät ohne Installation; Free-Tarife reichen für zwei Personen.
- **Contra:** Ein weiterer Dienst mit eigenem Schlüssel, Domain-Bestätigung (DNS) und Zugriff auf
  E-Mail-Adressen. Eine Erinnerung „Müll rausbringen · 19:00“ im Posteingang ist nicht pünktlich
  sichtbar und wird schnell zu Lärm. Spec 0013 schließt E-Mail aus (Nicht-Ziel).

#### Option D — Ein fremder Push-Dienst mit SDK (z. B. OneSignal Free)

- **Pro:** Planung, Zustellung und Statistik fertig; Web und nativ aus einer Hand.
- **Contra:** Das Web-SDK ist ein fremdes Skript in der Web-App; ADR-0003 erlaubt die Sitzung im
  Browser-Speicher nur ohne fremde Skripte und mit strenger CSP. Die Daten (wer wann was macht)
  lägen bei einem weiteren Anbieter.

#### Option E — Keine Push-Nachrichten, nur Hinweise in der App

- **Pro:** nichts zu bauen, nichts zu betreiben, keine neuen personenbezogenen Daten.
- **Contra:** verfehlt das Ziel der Spec: Wer die App nicht öffnet, erfährt nichts.

### Wer plant

#### Option 1 — Die Datenbank plant, `push-send` stellt nur zu (D40 A)

- **Pro:** Kein `service_role`, nirgends. Die ganze Logik (wer, wann, abwesend, doppelt) steht in
  SQL und ist mit pgTAP bei fester Uhrzeit testbar. Die Function sieht nur, was sie zustellen soll,
  und kann nichts lesen. `pg_cron` läuft schon.
- **Contra:** `pg_net` arbeitet asynchron: Antworten der Push-Dienste kommen erst im nächsten Takt
  an, ein abgelaufenes Abo bekommt also höchstens noch eine weitere Nachricht. Das Bauen der Texte
  in SQL ist mühsamer als in TypeScript, und die Regeln „fällig“ und „wer ist dran“ stehen ein
  zweites Mal neben `packages/core` (Gleichlauf-Tests nötig). Ein Geheimnis und eine Adresse müssen
  in den Vault, je Umgebung von Hand.

#### Option 2 — `push-send` plant selbst und liest mit `service_role` (D40 B)

- **Pro:** Logik in TypeScript, nah an `packages/core`; ein Teil weniger.
- **Contra:** Ein Schlüssel, der jede Zeile jedes Haushalts lesen und schreiben kann, läge in einer
  von außen erreichbaren Function. Widerspricht `10-security.md` und dem Ziel der Spec.

#### Option 3 — Eigene Datenbankrolle mit eigenem Token (D40 C)

- **Pro:** engere Rechte als Option 2.
- **Contra:** Ein eigenes JWT zu signieren braucht wieder den JWT-Schlüssel des Projekts; das ist
  dasselbe Geheimnis in anderer Form.

#### Option 4 — Externer Zeitplaner (z. B. GitHub Actions `schedule`)

- **Pro:** kostenlos, außerhalb von Supabase sichtbar.
- **Contra:** GitHub startet geplante Läufe oft mit vielen Minuten Verspätung oder gar nicht; die
  Action bräuchte trotzdem einen Schlüssel mit Lesezugriff auf alle Haushalte.

## Begründung

**Zustellweg:** Den Ausschlag gibt, dass Web Push als einziger Weg **heute, kostenlos und ohne
fremden Code in der App** die vorhandene PWA erreicht. Expo Push bleibt der Weg für die nativen
Apps und nutzt dann denselben Zeitplaner.

**Planung:** Den Ausschlag gibt **kein `service_role` irgendwo**. Die Nachteile von Option 1
(Antwort erst im nächsten Takt, SQL statt TypeScript) sind bei zwei Personen und einem 5-Minuten-Takt
klein und mit Tests beherrschbar; ein allmächtiger Schlüssel in einer erreichbaren Function wäre es
nicht.

## Kosten

| Teil                                      | Free-Tarif               | Erwarteter Verbrauch (2 Personen, je 3 Geräte)        |
| ----------------------------------------- | ------------------------ | ----------------------------------------------------- |
| Web Push (FCM, Mozilla, Apple, Microsoft) | kostenlos, ohne Konto    | —                                                     |
| Supabase Edge Functions                   | 500 000 Aufrufe/Monat    | höchstens einige Hundert (`push-send` nur bei Bedarf) |
| `pg_cron`, `pg_net`, Vault                | enthalten                | 8 640 Takte/Monat, je wenige Millisekunden            |
| Datenbank (Zustell-Protokoll, 30 Tage)    | 500 MB enthalten         | wenige Tausend Zeilen                                 |
| Apple Developer Program                   | nicht nötig für Web Push | erst für native Apps (Option B)                       |

Stand 21.11.2026; vor einer Kostenentscheidung neu prüfen (ADR-0007).

## Konsequenzen

**Positiv:**

- Benachrichtigungen ohne laufende Kosten und ohne neuen Anbieter-Vertrag.
- Kein Schlüssel mit Vollzugriff; `push-send` kann nur zustellen, was ihr die Datenbank gibt.
- Die Regeln (wer, wann, abwesend, doppelt, zu spät) sind in pgTAP mit fester Uhrzeit prüfbar,
  auch die Zeitumstellung.
- Native Push später braucht nur einen zweiten Zustellweg, keine zweite Planung.

**Negativ:**

- **Pausiertes Free-Projekt = keine Nachrichten.** Nach der Pause wird nichts nachgeholt, was mehr
  als 30 Minuten zu spät käme. Ob die Takte selbst das Pausieren verhindern, ist nicht belegt; wir
  verlassen uns nicht darauf.
- **iPhone und iPad nur als installierte PWA**, und erst mit öffentlicher HTTPS-Adresse (Spec
  0014). Die Seite „Benachrichtigungen“ erklärt das.
- **Höchstens einmal statt genau einmal:** Scheitert eine Zustellung (Function nicht erreichbar,
  Push-Dienst antwortet mit Fehler), fehlt die Nachricht; es gibt keine Wiederholung. Bewusst
  gewählt, damit nie etwas doppelt kommt.
- **Zweite Stelle für Fachregeln:** „fällig“, „überfällig“, „wer ist dran“ und „wer isst mit“
  stehen in SQL und in `packages/core`. Gleichlauf-Tests mit denselben Fällen sind Pflicht; eine
  Änderung an einer Stelle braucht die andere.
- **Neue Abhängigkeit** `jsr:@negrel/webpush`, nur in `supabase/functions/push-send`, nicht in
  der App. Selbst gebaute Kryptografie wäre das größere Risiko; die Testvektoren aus RFC 8291 und
  RFC 8292 laufen als Tests gegen die Bibliothek. Version beim Bau festnageln, Aktualisierungen
  mit Blick auf den Diff.
- **Neue personenbezogene Daten:** Push-Adresse und Gerätename. Nachrichten enthalten nur Titel,
  Text und Ziel-Link; sie laufen verschlüsselt über die Server der Push-Dienste.
- **Ausnahmen von Regel 4 und 5** (siehe unten). Jede weitere Ausnahme braucht eine eigene ADR.
- **Handarbeit je Umgebung:** VAPID-Schlüsselpaar und geteiltes Geheimnis setzt der Eigentümer als
  Function-Secrets und im Vault. Ein neues Schlüsselpaar macht alle Abos ungültig; die Geräte melden
  sich beim nächsten Öffnen von selbst neu an, wenn die Erlaubnis noch besteht.
- **Lokal** geht Web Push nur im gebauten Export mit Service Worker (`127.0.0.1:8790`), nicht im
  Entwicklungsserver.

**Präzisierung der Regeln** (Text in `AGENTS.md` und `.claude/rules/`, Spec 0013, Task 0):

- Regel 4: „Deine Geräte“ (Push-Abos der eigenen Person) wird online gelesen, nicht aus dem Cache.
- Regel 5: Push-Abos gehören einer Person, das Zustell-Protokoll dem Server; beide liegen im Schema
  `private`, haben RLS ohne Grants, werden nicht synchronisiert und sind nur über
  `security definer`-RPCs bzw. den Zeitplaner erreichbar.

**Folgearbeiten:**

- Spec 0013 (Plan): Tabellen, RPCs, Zeitplaner, `push-send`, Service Worker, Seite.
- Spec 0014: Produktions-Secrets, Vault-Einträge, Deploy von `push-send`, öffentlicher Schlüssel im
  Build der Web-App, erster Test auf iPhone und Android.
- Native Apps: Expo Push als zweiter Zustellweg, Nachtrag zu dieser ADR.

## Wann diese Entscheidung neu bewertet wird

- Wenn die nativen Apps kommen (Expo Push dazu).
- Wenn Apple Web Push für installierte PWAs einschränkt oder Safari-Tabs es erlauben.
- Wenn Nachrichten wegen pausierter Projekte oder Fehler spürbar fehlen (dann: Supabase Pro oder
  Wiederholen im 30-Minuten-Fenster).
- Wenn die doppelten Fachregeln in SQL und `core` auseinanderlaufen oder deutlich wachsen (dann:
  Planung in eine Function mit eng begrenzter Rolle verlegen).
- Wenn Supabase `pg_net`, `pg_cron` oder den Vault im Free-Tarif einschränkt.
- Wenn `jsr:@negrel/webpush` nicht mehr gepflegt wird oder eine Sicherheitslücke hat (dann: andere
  gepflegte Bibliothek, nicht selbst bauen).

## Nachtrag 2026-11-21 — Signatur statt Geheimnis in der Übergabe

Der `/security-check` zum Abschluss der Spec 0013 hat gezeigt: Supabase gibt die Warteschlange
von `pg_net` (`net.http_request_queue`, `net._http_response`) an `PUBLIC` frei und `net.http_post`
an `anon` und `authenticated`; Eigentümer ist `supabase_admin`, eine Migration kann das nicht
zurücknehmen. Bis der Hintergrund-Prozess die Anfrage abschickt, liegen dort Kopfzeilen und
Inhalt. Die Zeile „Übergabe“ oben gilt deshalb mit dieser Änderung:

- Die Datenbank schickt das Geheimnis **nicht** mehr mit. `private.post_push_bundle` signiert
  jede Anfrage: `x-push-timestamp` (Unix-Sekunden, echte Uhr) und `x-push-signature` (hex,
  HMAC-SHA256 über `<timestamp>.<body>` mit `push_send_secret` aus dem Vault, `pgcrypto`).
- `push-send` prüft die Signatur zeitkonstant und weist Zeitstempel ab, die älter als 5 Minuten
  oder mehr als 1 Minute in der Zukunft sind (401).
- Eine abgegriffene Zeile der Warteschlange taugt damit nur für genau diesen Inhalt und höchstens
  5 Minuten; andere Nachrichten lassen sich damit nicht senden. Ein Wiederholen desselben Inhalts
  in diesem Zeitraum ist hingenommen (`push-send` hat keine Datenbank, um Wiederholungen zu
  merken; schlimmstenfalls kommt dieselbe Nachricht noch einmal an dieselben Geräte).
- Dass die API das Schema `net` nicht ausliefert, ist die eigentliche Grenze. Sie ist lokal
  getestet (`scripts/api-schemas.test.mjs`, `notifications.integration.test.ts`) und für die Cloud
  ein Prüfpunkt der Spec 0014.

## Nachtrag 22.11.2026: Erinnerungen an Einträgen (Spec 0017)

- **Neue Art** `entry_reminder`: eine Erinnerung, die eine Person an einem einzelnen Planeintrag mit
  Tag und Uhrzeit einschaltet. Sie läuft über denselben Planer (`pg_cron` alle 5 Minuten,
  Zeitzone des Haushalts, 30-Minuten-Fenster, kein Nachholen, höchstens einmal je Gerät) als
  weiterer Kandidat; Dringlichkeit hoch.
- **Ausnahme von „nur Titel, Text, Link“ (Spec 0013, AC-040):** Der Text einer Erinnerung darf einen
  kurzen, eigens für die Nachricht geschriebenen Text enthalten (höchstens 80 Zeichen, keine
  Steuerzeichen). Er erscheint auf den Sperrbildschirmen der Empfänger; das ist bewusst
  hingenommen, weil nur Mitglieder des Haushalts ihn bekommen und jede Person die Art abschalten
  kann. Notizen von Rezepten, Restaurants und Reisen bleiben ausgeschlossen. Der Text steht nie im
  Zustell-Protokoll.
- **Empfänger** rechnet allein der Server beim Senden aus „Wer isst mit?“ (leer = alle; bei
  Aktivitäten alle Mitglieder) und der Mitgliedschaft; kein Feld des Clients bestimmt sie.
