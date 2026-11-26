---
status: freigegeben
datum: 2026-11-26
---

# 0051 — Mitteilungen in der App statt Push

**Quelle:** Enrico, 26.11.2026: „Wir brauchen keine Push-Benachrichtigungen mehr, kannst du komplett
entfernen! Gerne ein ‚Notification Center‘ einbauen, wo man in der App einfach so ein Notify-Icon hat
mit rotem Kreis mit Zahl drin, wenn was ansteht → soll man bestätigen können und alle bestätigen
können. Aber lightweight halten!“ **Kritischer Pfad:** ja: Migration, Löschen von Daten (Push-Abos,
Zustell-Protokoll, Vault-Einträge), RLS, Infrastruktur (Edge Function, Zeitplaner, Workflows),
Agenten-Regeln.

## Ziel

Wer die App öffnet, sieht an einer Glocke oben, ob gerade etwas ansteht: eine rote Zahl zählt die
offenen Mitteilungen. Ein Tipp zeigt sie als kurze Liste (was, wann), jede lässt sich öffnen und
bestätigen, alle auf einmal mit „Alle bestätigen“. Bestätigt ist bestätigt, auf allen eigenen
Geräten. Web Push mit allem, was dazugehört (Geräte, Schlüssel, Zeitplaner, Function), ist weg.

## Nicht-Ziele

- Keine Nachrichten außerhalb der App (kein Push, keine E-Mail, kein Badge am App-Symbol).
- Keine Einstellungen je Art und keine Uhrzeiten für Mitteilungen; geschaltet wird weiter je Eintrag
  („Erinnern“ am Planeintrag, „Erinnern“ an der Aufgabe).
- Keine Mitteilungen über andere Personen und keine aus anderen Haushalten als dem gezeigten.
- Kein Verlauf: Bestätigte und abgelaufene Mitteilungen sind nicht mehr zu sehen.
- Kein Bestätigen ohne Netz (Entscheidung 6).

## Anforderungen

### Web Push entfernen

**REQ-001 — Push ist vollständig entfernt.** Edge Function `push-send`, Zeitplaner (`pg_cron`
„notification-tick“, „purge-notification-deliveries“), Push-Abos, Zustell-Protokoll, Vault-Einträge
`push_send_secret`/`push_send_url`, RPCs der Geräte, die SQL-Zwillinge der Fachregeln, VAPID-Schlüssel
in Build, Workflows und Skripten, Service-Worker-Teile für Push und die Seite „Benachrichtigungen“
gibt es nicht mehr. Quelle: Enrico, 26.11.2026. Offline: entfällt.

- AC-001: Angenommen die Migration ist eingespielt · Wenn man Schema `private` und `cron.job` prüft ·
  Dann gibt es weder `push_subscriptions` noch `notification_deliveries`, keinen Job
  „notification-tick“ und keine Vault-Einträge `push_send_secret`/`push_send_url`
- AC-002: Angenommen ein angemeldetes Mitglied · Wenn es `register_push_subscription`,
  `list_push_subscriptions` oder `send_test_push` aufruft · Dann gibt es die Funktion nicht
- AC-003: Angenommen die Einstellungen · Wenn man sie öffnet · Dann gibt es keine Zeile
  „Benachrichtigungen“, und `/einstellungen/benachrichtigungen` zeigt „Seite nicht gefunden“
- AC-004: Angenommen der Web-Export · Wenn `check-web-export` läuft · Dann verlangt es keinen
  VAPID-Schlüssel und der Service Worker hat keine Handler für `push` und `notificationclick`
- AC-005: Angenommen die Workflows · Wenn `workflows.test.mjs` läuft · Dann nennt kein Workflow
  VAPID, `push-send` oder `push-keys`
- AC-006: Angenommen ein Planeintrag oder eine Aufgabe mit Uhrzeit · Wenn man „Erinnern“ einschaltet
  oder eine Uhrzeit setzt · Dann fragt der Browser nie nach einer Erlaubnis für Benachrichtigungen

### Mitteilungen

**REQ-002 — Was ansteht.** Die Mitteilungen der angemeldeten Person im gezeigten Haushalt entstehen
allein aus dem lokalen Speicher, zur Uhrzeit des Haushalts, in fünf Arten (Entscheidung 2). Quelle:
Enrico; Arten aus Spec 0013 und 0017. Offline: offline vollständig (lesen).

- AC-007: Angenommen Freitag 20.11., 18:00, „Pizzeria Roma“ heute 19:30 mit Erinnerung am Tag um 17:30
  · Wenn man die Mitteilungen bildet · Dann steht dort „Pizzeria Roma“ mit „heute 19:30“, um 17:29
  noch nicht, am 21.11. nicht mehr
- AC-008: Angenommen „Müll rausbringen“ ist heute um 19:00 fällig, „Erinnern“ an, Enrico ist dran ·
  Wenn es 19:00 ist · Dann hat Enrico die Mitteilung „Müll rausbringen“ mit „19:00 · du bist dran“,
  Nadja keine; um 18:55 hat sie auch Enrico nicht; mit „Erinnern“ aus nie
- AC-009: Angenommen „Hummus“ morgen Mittag mit Vorlauf „Kichererbsen einweichen“ 16 h, Enrico kocht
  · Wenn man heute die Mitteilungen bildet · Dann hat Enrico „Kichererbsen einweichen“ mit „Heute
  Abend · Hummus (morgen Mittag)“, Nadja nicht
- AC-010: Angenommen heute Abend „Lasagne“, Enrico kocht · Wenn man die Mitteilungen bildet · Dann
  hat Enrico „Du kochst heute: Lasagne“ mit „Abend“; „Nicht gemacht“ oder morgen: keine
- AC-011: Angenommen morgen Vormittag „Eislaufen“ · Wenn es heute 19:00 ist · Dann haben beide
  „Eislaufen“ mit „morgen Vormittag“; um 18:55 keiner; morgen den ganzen Tag „heute Vormittag“
- AC-012: Angenommen Enrico ist heute auf einer Reise · Wenn man seine Mitteilungen bildet · Dann
  sind es keine; ist er nur morgen weg, fehlt „Eislaufen“ von morgen und die Erinnerung an einen
  Eintrag von morgen
- AC-013: Angenommen eine Erinnerung, die für Nadja allein gilt (nur sie isst mit) · Wenn man
  Enricos Mitteilungen bildet · Dann fehlt sie; bei einer Aktivität gilt sie für alle

**REQ-003 — Glocke mit Zähler.** Auf dem Handy steht die Glocke in der Kopfzeile jeder Startseite
links von ⊞, auf breiten Bildschirmen unten in der Seitenleiste neben dem Avatar; ein roter Kreis
zeigt die Zahl der offenen Mitteilungen. Quelle: Enrico. Offline: offline vollständig.

- AC-014: Angenommen drei offene Mitteilungen · Wenn man die Übersicht öffnet · Dann zeigt die
  Glocke „3“ und heißt für Screenreader „Mitteilungen, 3 offen“
- AC-015: Angenommen keine offene Mitteilung · Dann zeigt die Glocke keinen roten Kreis und heißt
  „Mitteilungen“; bei zwölf offenen steht „9+“ im Kreis
- AC-016: Angenommen es ist 18:59 und eine Aufgabe um 19:00 · Wenn die App offen bleibt · Dann zählt
  die Glocke spätestens eine Minute nach 19:00 eins mehr, ohne Neuladen

**REQ-004 — Liste, öffnen, bestätigen.** Ein Tipp auf die Glocke öffnet das Fenster
„Mitteilungen“ mit den offenen Mitteilungen, neueste zuerst: je Zeile Art-Symbol, was, wann, ein
Tipp öffnet das Ziel, ✓ „Bestätigen“ entfernt sie; „Alle bestätigen“ entfernt alle. Quelle: Enrico.
Offline: offline lesend — Bestätigen braucht Netz (Entscheidung 6).

- AC-017: Angenommen die Mitteilung „Pizzeria Roma“ · Wenn man sie antippt · Dann schließt das
  Fenster und der Kalender zeigt den Tag mit dem Fenster des Eintrags; „Müll rausbringen“ öffnet die
  Aufgabe unter „Haushalt“
- AC-018: Angenommen drei offene Mitteilungen · Wenn man bei einer ✓ tippt · Dann verschwindet sie
  sofort, die Glocke zeigt „2“, und nach dem Abgleich ist sie auch auf Enricos zweitem Gerät weg
- AC-019: Angenommen drei offene Mitteilungen · Wenn man „Alle bestätigen“ tippt · Dann ist die
  Liste leer mit „Gerade steht nichts an.“ und die Glocke ohne Kreis
- AC-020: Angenommen offline · Wenn man das Fenster öffnet · Dann sind die Mitteilungen zu sehen, ✓
  und „Alle bestätigen“ ausgegraut mit „Offline – zum Bestätigen brauchst du Netz“
- AC-021: Angenommen eine bestätigte Erinnerung, deren Uhrzeit danach geändert wird · Wenn die neue
  Uhrzeit erreicht ist · Dann ist sie wieder offen

### Bestätigungen speichern

**REQ-005 — Je Person, synchronisiert, aufgeräumt.** Bestätigungen liegen in der eigenen Zeile von
`notification_settings` (`acknowledged_notices`) und werden nur über `acknowledge_notices`
geschrieben; dabei fallen Bestätigungen weg, deren Tag mehr als 14 Tage zurückliegt. Quelle:
Auftrag. Offline: nur online.

- AC-022: Angenommen Enrico bestätigt „chore:<id>:2026-11-20“ · Wenn er `acknowledge_notices` aufruft
  · Dann steht der Schlüssel in seiner Zeile, `updated_at` ist neu, Nadjas Zeile ist unverändert
- AC-023: Angenommen eine Bestätigung vom 01.11. und heute der 20.11. · Wenn Enrico etwas bestätigt
  · Dann ist die vom 01.11. weg, eine vom 06.11. bleibt
- AC-024: Angenommen ein Mitglied eines fremden Haushalts, ein Abgemeldeter oder ein ungültiger
  Schlüssel („x“, 201 Zeichen, mehr als 100 auf einmal) · Wenn er `acknowledge_notices` aufruft ·
  Dann wird es abgewiesen und keine Zeile ändert sich
- AC-025: Angenommen ein Mitglied · Wenn es `acknowledged_notices` direkt über die API ändern will
  oder Nadjas Zeile liest · Dann wird das abgewiesen bzw. sieht es keine Zeile

## Entscheidungen

1. **Ersetzt Spec 0013 (REQ-001 bis REQ-010) und Spec 0017, REQ-005/REQ-007 (Zustellung, Art „Erinnerungen
   an Einträgen“)**: keine Zustellung außerhalb der App mehr. Die Erinnerung am Eintrag
   (Tag, Uhrzeit, Text) und „Erinnern“ an Aufgaben bleiben und speisen jetzt die Mitteilungen. Neue
   ADR-0017 löst ADR-0014 ab.
2. **Fünf Arten**, alle für die angemeldete Person, alle im gezeigten Haushalt:
   `entryReminder` (ab dem Zeitpunkt der Erinnerung bis Ende des Eintragstags; Restaurants mit
   Uhrzeit haben seit Spec 0021 keine eigene Art), `chore` (Aufgabe mit Uhrzeit und „Erinnern“ an,
   am Fälligkeitstag ab der Uhrzeit, für wer dran ist, bei „egal wer“ alle; erledigt → weg),
   `prep` (jeder Vorlauf, der heute beginnt oder schon fällig ist, für wer kocht, sonst wer
   mitisst), `cook` („Du kochst heute“ für jedes Rezept heute mit mir als Koch), `activity`
   (Aktivitäten, auch Termine einer Serie, ab 19:00 am Vortag bis Ende des Tags, für alle).
   Der Tagesüberblick als Sammelnachricht entfällt: die Übersicht zeigt den Tag schon.
3. **Ruhe bei Abwesenheit:** Wer heute auf einer Reise ist, hat keine Mitteilungen; Mitteilungen zu
   einem Tag, an dem man weg ist, fehlen (wie `is_silent`, Spec 0013/0022).
4. **Keine Einstellungen je Art** (Nicht-Ziel): die Glocke drängt sich nicht auf, deshalb braucht es
   kein Abschalten; der Rest der Seite „Benachrichtigungen“ (Geräte, Probe) hat ohne Push keinen
   Sinn. Die alten Spalten der Einstellungen bleiben bis zum Rückbau (Entscheidung 9) ungenutzt.
5. **Schlüssel** `<art>:<id>[:<zusatz>]:<JJJJ-MM-TT>` mit dem Tag, zu dem die Mitteilung gehört
   (Eintragstag, Fälligkeitstag); bei Erinnerungen mit der Uhrzeit als Zusatz (`1730`), damit eine
   geänderte Uhrzeit wieder meldet (AC-021). Der Tag am Ende dient dem Aufräumen.
6. **Bestätigen ist ein Schreiben online** (Regel 4): keine neue Offline-Schreibart, kein ADR-Nachtrag.
   Das Bestätigen erscheint sofort (Überlagerung, ADR-0011) und geht als eine RPC.
7. **Speicher:** neue Spalte `acknowledged_notices text[]` in der vorhandenen, synchronisierten
   Zeile je Mitglied (`notification_settings`, nur für das Mitglied selbst lesbar) statt einer neuen
   Tabelle. Geschrieben nur über `public.acknowledge_notices(p_household_id, p_keys)`
   (`security definer`, filtert nach `auth.uid()`, kein Update-Recht auf die Spalte); sie vereinigt
   atomar, so verliert kein Gerät die Bestätigung eines anderen. Höchstens 100 Schlüssel je Aufruf,
   400 in der Zeile (älteste fallen zuerst), je Schlüssel höchstens 200 Zeichen.
8. **Aufräumen beim Schreiben**, nicht per Zeitplaner: Bestätigungen, deren Tag mehr als 14 Tage vor
   heute (Zeitzone des Haushalts) liegt, fallen bei jedem `acknowledge_notices` weg. Ohne Schreiben
   wächst nichts.
9. **Expand → contract:** Die Spalten der alten Einstellungen (`daily_summary_*`, `activities_eve_*`,
   `*_reminders_enabled`) bleiben in dieser Migration stehen, weil die veröffentlichte Version
   2026.11.2 sie liest und `apply_changes` sie in der Erlaubnisliste führt; eine Neudefinition von
   `apply_changes` würde mit der parallelen Spec 0046 kollidieren. Rückbau in einer späteren
   Migration, die `apply_changes` ohnehin neu definiert. OFFEN: Rückbau der Spalten (eigene kleine
   Migration nach der nächsten Veröffentlichung).
10. **Mindestversion 2026.11.3:** Die Migration löscht Tabellen und Funktionen, die 2026.11.2 aufruft
    (Geräte, Probe); ältere Apps schreiben danach nicht mehr und werden zum Aktualisieren aufgefordert.
11. **SQL-Zwillinge entfallen:** Die Fachregeln in SQL (`private.chore_*`, `prep_items`,
    `plan_entry_title`, Texte des Planers u. a.) gab es nur für den Zeitplaner (ADR-0014,
    „zweite Stelle für Fachregeln“). Was nach dem Entfernen von nichts mehr benutzt wird, fällt weg,
    samt Gleichlauf-Tests; `is_silent` bleibt (Aufgaben warten auf Reisen).
12. **Glocke:** neue Komponente `CountBadge` in `packages/ui`; auf dem Handy in `StartPageActions`,
    sonst im Fuß der Seitenleiste. Das Fenster ist das vorhandene `Sheet` (Größe s). Die Zeit läuft
    in der Glocke minütlich weiter (AC-016).
13. **Tipp aufs Ziel** nutzt die vorhandenen Ziele `NotificationTarget`/`notificationTargetHref`
    (Kalender mit Tag und Eintrag, Aufgabe unter „Haushalt“); Termine einer Serie öffnen den Tag.

## Daten

Neu: `notification_settings.acknowledged_notices text[] not null default '{}'` (Schlüssel ohne
Inhalte; keine neuen personenbezogenen Daten). Gelöscht: `private.push_subscriptions` (Push-Adressen,
Gerätenamen), `private.notification_deliveries`, Vault-Einträge `push_send_secret` und
`push_send_url`, Cron-Jobs, alle Push-RPCs und Planer-Funktionen. Cache-Version steigt (neue Form der
Einstellungen). Gelesen für Mitteilungen: Planeinträge, Serien, Rezepte, Aufgaben, Reisen,
Mitglieder (alles schon im Cache).

## Risiken

| Risiko                                                     | Gegenmaßnahme                                                             | Test                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| Fremdes Mitglied bestätigt in meiner Zeile                 | RPC filtert `member_id = auth.uid()` und Mitgliedschaft, sonst `not_found` | pgTAP `notification_settings` (AC-024)             |
| Abgemeldeter Aufruf                                        | `revoke … from public, anon`; nur `authenticated`                         | pgTAP (AC-024)                                     |
| Zeile wächst unbegrenzt / riesige Schlüssel                | Prüfung Format und Länge, 100 je Aufruf, 400 je Zeile, Aufräumen 14 Tage  | pgTAP (AC-023, AC-024)                             |
| Direktes Schreiben an der RPC vorbei                       | kein Update-Recht auf `acknowledged_notices`, Policy nur Lesen            | pgTAP (AC-025)                                     |
| Alte App (2026.11.2) ruft gelöschte RPCs                   | Mindestversion 2026.11.3 sperrt das Schreiben, Fehler zeigen den Hinweis  | `migrations.test.mjs` (Kopf `contract`)            |
| Löschen trifft etwas, das noch gebraucht wird              | Abhängigkeiten per Abfrage ermittelt; `is_silent` bleibt; Tests aller Funktionen | `pnpm exec supabase test db`                 |
| Vault-Löschung scheitert in der Cloud                      | `delete from vault.secrets where name in (…)` als Eigentümer `postgres`   | lokale Migration; Enrico-Schritte prüfen          |
| Mitteilung verrät fremde Daten                              | nur aus dem eigenen Cache (RLS), nur eigene Person                         | core `notices.test.ts` (AC-008, AC-013)            |

## Umsetzung

- [ ] 1. Migration: Push entfernen, Spalte und RPC, Mindestversion; pgTAP rot → grün (AC-001,
      AC-002, AC-022–AC-025)
- [ ] 2. `packages/core` `notices.ts` mit Tests rot → grün; Push-Teile aus `notifications.ts`
      (AC-006–AC-013, AC-015, AC-021)
- [ ] 3. `packages/api`: Mapping, Transport, `acknowledgeNotices`, Cache-Version; Push-Befehle weg
      (AC-018, AC-020)
- [ ] 4. `packages/ui` `CountBadge`; App: Glocke, Fenster, Seite „Benachrichtigungen“ weg, keine
      Erlaubnisfragen (AC-003, AC-006, AC-014–AC-020)
- [ ] 5. Function, Service Worker, Skripte, Workflows, Doku, ADR-0017, Regeln (AC-004, AC-005)
- [ ] 6. Screenshots Handy 390×844 und Desktop 1440×900; `/security-check`
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` und
      `pnpm exec supabase test db` grün
