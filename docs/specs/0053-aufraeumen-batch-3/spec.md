---
status: freigegeben
datum: 2026-11-26
---

# 0053 — Aufräumen nach Batch 3

**Quelle:** Koordinator, 26.11.2026, nach dem Merge von 0044–0052 auf `develop`: die beiden
offenen Rückbauten (Spec 0046, Entscheidung 5; Spec 0051, Entscheidung 9) und der wackelnde Test
`seed-sql.test.ts`. Regel „Keine Altlasten vor v1“: nichts aus Batch 3 ist veröffentlicht
(Produktion: 2026.11.2). **Kritischer Pfad:** ja: Migration (Spalten löschen), RLS.

## Ziel

Die Datenbank trägt nichts mehr, was niemand liest: das einzelne Rezeptvideo von Spec 0043 ist
seit Spec 0046 eine Liste, die Einstellungen für Push gibt es seit Spec 0051 nicht mehr. Wer die
App benutzt, merkt davon nichts. Die Prüfungen in der Pipeline laufen ohne zufällige Ausfälle.

## Nicht-Ziele

- Keine Änderung an Verhalten, Oberfläche oder Synchronisation.
- Keine neue Mindestversion und keine Änderung am Prüfen der Mindestversion in der
  Veröffentlichung (siehe Entscheidung 3).
- Kein Aufräumen weiterer Altlasten außerhalb der zwei Rückbauten und des Tests.

## Anforderungen

**REQ-001 — `recipes.video_path` ist weg.** Spalte, ihre Prüfregeln (`recipes_video_path_valid`,
`recipes_video_path_retired`), der Eintrag in der Erlaubnisliste von `apply_changes` und die
Übergangsfunktion `private.videos_from_video_path` entfallen. Quelle: Spec 0046, Entscheidung 5.
Offline: entfällt.

- AC-001: Angenommen die Migration ist eingespielt · Wenn man `public.recipes` prüft · Dann gibt es
  weder `video_path` noch ihre Prüfregeln noch `private.videos_from_video_path`
- AC-002: Angenommen ein Mitglied · Wenn es über `apply_changes` ein Rezept mit `video_path` anlegt
  oder ändert · Dann wird es mit `invalid_change` abgewiesen und nichts ändert sich

**REQ-002 — Alte Push-Einstellungen sind weg.** Aus `notification_settings` entfallen
`daily_summary_enabled`, `daily_summary_at`, `daily_summary_parts`, `activities_eve_enabled`,
`activities_eve_at`, `chore_reminders_enabled`, `entry_reminders_enabled` samt Prüfregeln,
Spaltenrechten, Erlaubnisliste und der Richtlinie `notification_settings_update`; die Zeile je
Mitglied mit `acknowledged_notices` bleibt. Quelle: Spec 0051, Entscheidung 9. Offline: entfällt.

- AC-003: Angenommen die Migration ist eingespielt · Wenn man `public.notification_settings` prüft ·
  Dann hat sie nur `id`, `household_id`, `member_id`, `acknowledged_notices`, `created_at`,
  `updated_at`, und `authenticated` darf keine Spalte ändern
- AC-004: Angenommen Enrico · Wenn er über `apply_changes` seine Zeile mit `daily_summary_enabled`
  ändern will oder sie direkt ändert · Dann wird es abgewiesen (`invalid_change` bzw. `42501`); Nadja,
  ein fremdes Mitglied und Abgemeldete sehen und ändern weiter nichts
- AC-005: Angenommen Enrico bestätigt eine Mitteilung · Wenn er `acknowledge_notices` aufruft · Dann
  steht sie in seiner Zeile und `updated_at` ist neu (Spec 0051, AC-022, unverändert)
- AC-006: Angenommen im Gerätespeicher liegt noch eine Zeile mit den alten Spalten · Wenn die App
  sie liest · Dann sind es nur die bestätigten Mitteilungen, ohne Neuladen des Speichers

**REQ-003 — `apply_changes` sonst unverändert.** Die Funktion wird einmal neu definiert; außer den
zwei Erlaubnisregeln und ihren Kommentaren bleibt sie zeichengleich. Quelle: Auftrag. Offline:
entfällt.

- AC-007: Angenommen die Migration ist eingespielt · Wenn `pnpm exec supabase test db` läuft · Dann
  sind alle Tests grün (alle Schreibwege über `apply_changes`)

**REQ-004 — Der Seed-Test wackelt nicht.** „is the same SQL whatever day it is generated on“ läuft
je Tag als eigener Fall mit einer einzigen Erzeugung, so bleibt jeder Fall weit unter der Grenze
von 5 s. Quelle: Ausfälle in CI (Lauf 45863795034, 5,46 s). Offline: entfällt.

- AC-008: Angenommen der Seed vom 20.11.2026 · Wenn er am 16.11.2026, 22.11.2026, 31.01.2027,
  28.02.2027 oder 01.06.2027 erzeugt wird · Dann ist das SQL jeweils gleich, und jeder Tag ist ein
  eigener Testfall

## Entscheidungen

1. **Ein Rückbau für beide** in einer Migration, die `apply_changes` einmal neu definiert (Spec 0051,
   Entscheidung 9 wollte genau das). Kopf `-- contract: …; min_app_version: 2026.11.3` und
   `public.min_app_version()` neu mit demselben Wert, weil `scripts/ci/migrations.mjs` beides für
   jedes `drop column` verlangt.
2. **Sicher für 2026.11.2:** `video_path` gab es dort nie (Spec 0043 ist unveröffentlicht). Die
   alten Einstellungen liest 2026.11.2 über `sync_pull` als ganze Zeile und setzt für fehlende
   Spalten Vorgaben (`=== true`, `?? '07:30'`, `!== false`, `?? []` in `toNotificationSettings`,
   Tag v2026.11.2), stürzt also nicht ab; Push gibt es seit 0051 ohnehin nicht mehr. Schreiben
   sperrt die Mindestversion 2026.11.3 aus 0051 (dieselbe Veröffentlichung); und selbst ohne Sperre
   weist `apply_changes` die alten Spalten mit `invalid_change` ab. Beide Migrationen gehen mit
   derselben nächsten Veröffentlichung hinaus, deshalb braucht es keine eigene Mindestversion.
3. OFFEN (aus 0051, nicht hier gelöst): `scripts/release/version.mjs` bricht eine Veröffentlichung
   ab, wenn die Mindestversion über der zuletzt veröffentlichten liegt (Spec 0014, AC-026). Mit
   2026.11.3 (0051) und veröffentlicht 2026.11.2 ergibt `checkMinAppVersion` „Mindestversion
   2026.11.3 ist noch nicht veröffentlicht“: die nächste Veröffentlichung von `develop` scheitert
   so, mit oder ohne diese Spec. Entscheidung für Koordinator/Enrico.
4. **Richtlinie `notification_settings_update` entfällt:** ohne Spaltenrecht zum Ändern ist sie
   wirkungslos; `acknowledge_notices` schreibt als `security definer`. Ohne sie gilt „verboten“,
   falls je wieder ein Spaltenrecht dazukommt.
5. **Keine neue Cache-Version:** die Form im Gerätespeicher ändert sich nicht; alte Zeilen mit
   übrigen Spalten liest die Zuordnung schon heute nur auf `acknowledged_notices` hin (AC-006), der
   nächste Abgleich ersetzt sie.
6. **`private.videos_from_video_path` entfällt** mit ihren Tests (Spec 0046, AC-001): sie diente
   nur der einmaligen Übernahme in der Migration von 0046; `restore_recipe` nutzt sie nicht.
7. **Seed-Test je Tag ein Fall** (`it.each`) statt einer längeren Zeitgrenze: eine Erzeugung dauert
   lokal ~55 ms, in CI bis ~0,9 s; sechs in einem Fall rissen die 5 s. Die Grundlage wird wie
   bisher beim Sammeln erzeugt.

## Daten

Gelöscht: `recipes.video_path` (überall `null` seit 0046), die sieben Einstellungsspalten von
`notification_settings` (ohne Leser seit 0051), ihre Prüfregeln, Spaltenrechte und die Richtlinie
`notification_settings_update`, `private.videos_from_video_path`. Keine personenbezogenen Daten neu.

## Risiken

| Risiko                                              | Gegenmaßnahme                                                       | Test                                           |
| --------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| `apply_changes` ändert sich unbemerkt woanders      | Neudefinition aus der letzten Fassung, Rumpf vorher/nachher gedifft | `pnpm exec supabase test db`, Diff im PR       |
| Alte App 2026.11.2 stürzt an fehlenden Spalten ab   | alte Zuordnung setzt Vorgaben; Schreiben gesperrt (Entscheidung 2)  | Code-Lesung Tag v2026.11.2                     |
| Fremdes Mitglied, Abgemeldeter ändert Einstellung   | keine Spalte änderbar, keine Update-Richtlinie, RLS beim Lesen      | pgTAP `notification_settings` (AC-004)         |
| Ungültige Eingabe: alte Spalte über `apply_changes` | Erlaubnisliste ohne die Spalten, `invalid_change`                   | pgTAP `notification_settings`, `recipe_videos` |
| Kette bricht auf frischer Datenbank                 | alle Migrationen plus `seed.sql` in einer Wegwerf-Datenbank         | Nachweis                                       |

## Umsetzung

- [x] 1. pgTAP rot: `recipe_videos` (AC-001, AC-002), `notification_settings` (AC-003–AC-005)
- [x] 2. Migration, `pnpm exec supabase migration up`, pgTAP grün, `pnpm db:types` (AC-001–AC-005, AC-007)
- [x] 3. Client: Transport-Fake, Zuordnungstest, Kommentar `fetch-video` (AC-006)
- [x] 4. Seed-Test je Tag (AC-008)
- [x] 5. Kette auf frischer Wegwerf-Datenbank; `/security-check`; Spec 0046/0051 OFFEN erledigt
- [x] Nachweis (26.11.2026): pgTAP vorher rot (je 5 von 45 bzw. 44 in `notification_settings`,
      `recipe_videos`), nach `pnpm exec supabase migration up` grün; `pnpm exec supabase test db`
      grün (55 Dateien, 2.632 Tests); `pg_get_functiondef(apply_changes)` vorher/nachher: nur die
      Erlaubnisregeln `recipes` (ohne `video_path`), `notification_settings` (`patch: []`) und zwei
      Kommentare. Kette auf frischer Datenbank: Wegwerf-Stack (eigene `project_id`, Ports 554xx)
      mit allen 43 Migrationen und `supabase/seed.sql`, dort pgTAP grün (2.632), danach gestoppt
      ohne Sicherung und gelöscht. `pnpm format:check && pnpm check` grün (core 1.845, api 1.015,
      ui 1.133, edge 300, Skripte 414, knip); `pnpm build:web` grün (im Worktree ohne `.env`, mit
      den öffentlichen lokalen Werten aus `.env.example`). Seed-Test lokal 55–76 ms je Tag.
      `/security-check`: keine Befunde (Erlaubnisliste und Rechte werden nur enger; `apply_changes`
      bleibt `security invoker`, Rechte von `apply_changes`/`min_app_version` unverändert).
