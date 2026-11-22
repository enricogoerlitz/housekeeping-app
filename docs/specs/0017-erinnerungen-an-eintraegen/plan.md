# Plan 0017 — Erinnerungen an Kalendereinträgen

Spec: `docs/specs/0017-erinnerungen-an-eintraegen/spec.md`. Branch `feat/0017-erinnerungen`. Baut
auf Spec 0016 auf („Anderes Datum …“ mit `MonthCalendar`, Verschieben). Kritischer Pfad:
Benachrichtigungen, Planer, neue Migration nach der ersten Veröffentlichung.

## Entscheidungen

1. **Drei Spalten an `public.meal_plan_entries`, keine eigene Tabelle.** Höchstens eine Erinnerung
   je Eintrag (1:1). Verschieben, Rückgängig und Löschen tragen sie ohne zusätzlichen Schreibvorgang
   mit; keine neue RLS, keine neue Sync-Registrierung.
   - `reminder_day_offset smallint` (`between 0 and 366`, Tage vor dem Tag des Eintrags)
   - `reminder_at time` (`private.is_five_minute_time`)
   - `reminder_text text` (1–80 Zeichen, ohne Rand-Leerzeichen, keine Steuerzeichen)
   - Check: Abstand und Uhrzeit nur zusammen; Text nur mit Uhrzeit; Erinnerung nur mit Tag.
2. **Neue, rein ergänzende Migration** `…_entry_reminders.sql` (Regel 30-database nach der ersten
   Veröffentlichung). Darin:
   - Trigger „Vormerken leert die Erinnerung“ (`date` wird null → drei Felder null). Sicherheitsnetz
     für die ausgelieferte v2026.11.1, die die Spalten nicht kennt.
   - Trigger „nicht in der Vergangenheit“ beim Setzen oder Ändern der Erinnerung bei gleichem Tag
     und bei Insert (Fehler `reminder_in_past`), in `households.timezone`. Verschieben in die
     Vergangenheit bleibt erlaubt (AC-022), Rückgängig nach Vormerken auch (AC-023).
   - Index `(household_id, (date - reminder_day_offset)) where reminder_at is not null`.
   - Grants für `authenticated` auf die drei Spalten; `apply_changes` per `create or replace` mit
     erweiterter Allowlist (auch `notification_settings.entry_reminders_enabled`).
   - `notification_settings.entry_reminders_enabled boolean not null default true` mit Grant.
   - `notification_deliveries`: Art `entry_reminder` im Check.
3. **Planer:** `private.entry_reminder_candidates(p_now)` im `union all` von
   `notification_candidates`; `run_notification_tick` per `create or replace` mit Dringlichkeit
   `high` für `entry_reminder`.
   - Sendetag `date − offset` in {heute − 1, heute}, 30-Minuten-Fenster, kein Nachholen.
   - Dedupe `entry:<id>:<Sendetag>:<HH24:MI>`; geänderter Tag oder Uhrzeit ist neu.
   - Empfänger: Mitglieder mit `entry_reminders_enabled`; bei Aktivitäten alle, sonst wer in
     `eater_ids` steht (leer = alle). Ausgetretene fallen über den Join weg.
   - Ruhe: `is_silent` am Sendetag und am Tag des Eintrags.
   - Ablauf: Ende des Sendetags. Text „Erinnerung: <Name> · heute/morgen <Tageszeit>“ bzw.
     „<Mo> <T>.<M>., <Tageszeit>“, dann „ · <Text>“; Name wie im Kalender (Aktivität mit Zusatz),
     gekürzt auf 400 Zeichen. Link `/kalender?tag&eintrag&haushalt`.
   - Gleichlauf: `planEntryTitle` und `reminderMessage` in core; gleiche Fälle in
     `notification_parity.test.sql`.
4. **Schreiben über `apply_changes` (Diff), keine eigene RPC:** `setEntryReminder(entryId, {offsetDays,
at, text} | null)`, Erinnerung als optionales Feld in `addPlanEntry`, `movePlanEntry(id, null)`
   leert sie im selben Patch. `CACHE_VERSION` 8 → 9 (neue Spalten und Default).
5. **Zeitzone:** Alle Rechnungen in `households.timezone`; die Spalte kommt read-only in den Cache.
6. **Bei der Umsetzung entschieden (22.11.2026):**
   - „Am Vortag“ ist bei einem Eintrag von heute ausgegraut mit „Liegt in der Vergangenheit“.
   - Die Formulare „Anlegen und einplanen“ (neues Rezept, Restaurant, Aktivität) haben keinen Block
     „Erinnern“; REQ-001 nennt nur den zweiten Schritt des Hinzufügen-Fensters. Die Erinnerung lässt
     sich danach im Eintragsfenster setzen (REQ-002).
   - `setEntryReminder` wartet auf die Bestätigung des Servers wie `saveEntryFields`, damit „Fertig“
     bei einer Ablehnung offen bleibt.

## Aufgaben

| #   | Inhalt                                                                                                                             | parallel zu |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 0   | Dokumente: ADR-0014 Nachtrag, Spec 0013 AC-040, Spec 0017, Glossar (erledigt mit diesem Plan)                                      | 1, 3        |
| 1   | Migration und pgTAP `entry_reminders.test.sql` (rot zuerst)                                                                        | 3           |
| 2   | Planer-Kandidaten, `notification_scheduler`- und Gleichlauf-Tests (nach 1)                                                         | 4           |
| 3   | core `reminder.ts` (Anfangszeiten, Tag-Chips, Beschriftungen, Prüfung, Nachricht), `planEntryTitle`                                | 1           |
| 4   | api: Mapping, Typen, Fake-Transport, `setEntryReminder`, `addPlanEntry`, `movePlanEntry`, Einstellung, `CACHE_VERSION` (nach 1, 3) | 2           |
| 5   | `ReminderBlock` (Schalter, Tag-Chips, Uhrzeit, Text mit Zähler, Hinweise, Erlaubnis)                                               | 7, 8        |
| 6   | Einbau ins Hinzufügen-Fenster (zweiter Schritt) und ins Eintragsfenster (nach 5)                                                   | 7, 8        |
| 7   | Glocke in Woche, Tages-Fenster und Eintragsfenster (Tages-Fenster nach 0016)                                                       | 5, 6        |
| 8   | Zeile „Erinnerungen an Einträgen“ auf „Benachrichtigungen“                                                                         | 5, 6        |
| 9   | Zusatz im Hinweis nach dem Verschieben („Erinnerung liegt in der Vergangenheit“, nach 0016)                                        | —           |
| 10  | `/security-check`, spec-auditor; e2e gesammelt am Ende aller Specs                                                                 | —           |

## Bedrohungsmodell

| Risiko                                        | Gegenmaßnahme                                                                                                                                   | Test                                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Text auf Sperrbildschirmen anderer Mitglieder | bewusst hingenommen (ADR-0014 Nachtrag): nur Haushaltsmitglieder, Art je Person abschaltbar, Text nie im Zustell-Protokoll                      | pgTAP: Protokoll ohne Text                                                                     |
| Untergeschobene Empfänger                     | Empfänger nur vom Server beim Senden aus `eater_ids` und Mitgliedschaft; kein Feld dafür                                                        | pgTAP: fremde Kennung in `eater_ids` abgelehnt (vorhandene Prüfung), nur Mitesser bekommen sie |
| Fremder Haushalt, abgemeldet                  | RLS; `apply_changes` erzwingt `p_household_id`                                                                                                  | pgTAP: fremder Haushalt, `anon`                                                                |
| Ungültige Eingabe                             | Checks in der Datenbank (Uhrzeit, Abstand, Länge, Steuerzeichen), Zod im Client                                                                 | pgTAP + core                                                                                   |
| Erinnerung in der Vergangenheit               | Trigger beim Setzen; Verschieben bleibt erlaubt                                                                                                 | pgTAP                                                                                          |
| Viele Erinnerungen (Spam)                     | höchstens eine je Eintrag, Bündel ≤ 50, nur eingeladene Mitglieder; je Haushalt und Planerlauf höchstens 50 Einträge, der Rest im nächsten Lauf | pgTAP Planer: 55 Einträge → 50, dann 5                                                         |
| Zeitzonenfehler, Zeitumstellung               | nur `households.timezone`; Test 28.3.2027                                                                                                       | pgTAP Planer                                                                                   |
| Doppelt oder verspätet                        | eindeutiger Dedupe-Schlüssel, 30-Minuten-Fenster, Ablauf am Ende des Sendetags                                                                  | pgTAP Planer                                                                                   |
| Alte App v2026.11.1 nach dem Einspielen       | rein ergänzende Spalten; Vormerken leert per Trigger                                                                                            | pgTAP: Patch nur `date = null`                                                                 |
| Gelöschter Eintrag, ausgetretenes Mitglied    | fällt im Kandidaten-Join weg                                                                                                                    | pgTAP Planer                                                                                   |

## Sicherheitsprüfung 22.11.2026

`/security-check` über Migration, Planer, api und die neuen Fenster: 0 kritisch, 0 hoch, 0 mittel.

| Befund                                                                                       | Stufe   | Umgang                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beliebig viele Erinnerungen je Haushalt und Lauf verdrängen die Zustellung anderer Haushalte | niedrig | behoben: höchstens 50 Einträge je Haushalt und Lauf, bereits zugestellte zählen nicht mit; nie zustellbare (kein Gerät, Art aus, Ruhe) belegen im 30-Minuten-Fenster weiter einen Platz, das trifft nur den eigenen Haushalt; pgTAP |
| Unsichtbare und richtungsändernde Unicode-Zeichen im Text („Woran erinnern?“)                | niedrig | behoben: Datenbank, core und Fake-Transport weisen dieselbe Zeichenliste ab, ohne Locale; pgTAP und core                                                                                                                            |
| „Nicht in der Vergangenheit“ greift nicht, wenn ein Patch zugleich den Tag ändert            | Hinweis | hingenommen: nötig für AC-022 und AC-023; Datenqualität, keine Sicherheitsgrenze                                                                                                                                                    |
| Alte App v2026.11.1: Art ist an, aber dort nicht abschaltbar                                 | Hinweis | hingenommen (ADR-0014 Nachtrag)                                                                                                                                                                                                     |
| Text steht bis zum Senden in der Warteschlange von `pg_net`                                  | Hinweis | bekannt seit Spec 0013; nicht im Zustell-Protokoll                                                                                                                                                                                  |

Die Migration `20261122143506_entry_reminders.sql` wurde dafür direkt geändert: Sie lag nur auf dem
Feature-Branch und war weder in der Vorschau noch in der Produktion eingespielt.

## Nachweis

- [ ] pgTAP rot zuerst, dann grün: `entry_reminders.test.sql`, Planer, Gleichlauf
- [ ] core und api rot zuerst, dann grün
- [ ] `pnpm format:check && pnpm check && pnpm build:web` grün
- [x] `/security-check` über Migration, Planer und api (22.11.2026, siehe oben)
- [x] spec-auditor (22.11.2026): 27 AC umgesetzt; AC-011 im Eintragsfenster und der Randfall zu AC-024 in der Spec geklärt
- [ ] e2e gesammelt am Ende aller Specs
