---
status: entwurf # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-23
---

# 0031 — Ultracode-Code-Review: sauber für die erste produktive Version

**Art:** Ultracode-Code-Review (Code, Datenbank, Sicherheit, Tests, Logik, UI/UX, Pipeline)

**Quelle:** Review des ganzen Repositorys am Stand `origin/develop` fe1e9ad (23.11.2026). Es lief
in sieben Dimensionen, und eine zweite Prüfung hat jeden Befund gegen den Code nachgeprüft. Hier
stehen nur bestätigte Befunde, die Ids (C-01, D-03, …) stammen aus dem Review. Dazu kommen
Enricos zwei Vorgaben: mindestens 80 % Zeilenabdeckung je Paket als CI-Hürde, und die volle
e2e-Suite als blockierender Job der Veröffentlichung. **Kritischer Pfad:** ja: Migration, Löschen
von Daten, RLS und Grants, Sync, Infrastruktur und Pipeline.

| Dimension  | hoch  | mittel | niedrig | bestätigt | verworfen                        |
| ---------- | ----- | ------ | ------- | --------- | -------------------------------- |
| Code       | 0     | 3      | 14      | 17        | 0                                |
| Datenbank  | 0     | 3      | 8       | 11        | 3 (D-07, D-08, D-10)             |
| Sicherheit | 0     | 0      | 0       | 0         | 2 (S-01, S-02)                   |
| Tests      | 2     | 4      | 6       | 12        | 2 (T-04, T-11), 2 zusammengelegt |
| Logik      | 0     | 2      | 7       | 9         | 1 (L-03)                         |
| UI/UX      | 3     | 3      | 7       | 13        | 0                                |
| Pipeline   | 1     | 5      | 4       | 10        | 0                                |
| **Summe**  | **6** | **20** | **46**  | **72**    | **8**                            |

## Ziel

Vor der ersten produktiven Version (Spec 0028) sind die bestätigten Befunde behoben. Danach
kommt die neue Migrationsbasis durch die Pipeline, alte Geräte werden gesperrt, und die volle
e2e-Suite ist grün und hält jede Veröffentlichung auf, wenn sie rot wird. Jedes Paket hat
mindestens 80 % Zeilenabdeckung. Auf dem Tablet sind Übersicht und Kalender benutzbar, und in der
Jahresansicht öffnet ein Tipp den richtigen Tag. Datenbank und Code sehen aus wie in einem Zug
gebaut.

## Nicht-Ziele

- Keine neuen Funktionen. Neue Wünsche aus dem Review (Tageszeiten bearbeiten, schmale
  Seitenleiste auf dem Tablet, zeitlich begrenzte Einladungen) bekommen eine eigene Spec.
- Kein Coverage-Gate für `apps/app` (die App deckt e2e ab) und für `supabase/functions` (heute
  98,8 %, nicht verlangt).
- Keine e2e-Suite in `checks.yml` und `preview.yml`. PRs nach `develop` bleiben ohne e2e.
- Die verworfenen Befunde: D-07, D-08, D-10, S-01, S-02, T-04, T-11, L-03 (Gründe unter
  „Entscheidungen“).
- Kein Zurücksetzen der Produktion in dieser Spec, das bleibt Spec 0028, Schritte 6–9.

## Anforderungen

„Handy“ = 390 px mit dem Finger, „Tablet“ = 700–1099 px (iPad hochkant 820 px), „Desktop“ = ab
1100 px mit Maus. Haushalt „Enrico & Nadja“.

### Pipeline und Veröffentlichung

**REQ-001 — Einmalige Ausnahme für die neue Migrationsbasis.** Eine Datei
`supabase/migrations-base.json` (`replaces`, `first`) erlaubt genau einmal, dass die alten
Migrationen ersetzt werden. Das gilt im Check „Migrationen“ (`scripts/ci/migrations.mjs`), im
Supabase-Wächter (`supabase-guard.mjs`) und für `min_app_version` (`version.mjs`: `min ≤ next`
statt `min ≤ published`). Mit dem nächsten Tag ist die Ausnahme verbraucht. Die neue Basis
bekommt neue Zeitstempel und setzt `min_app_version` auf „2026.11.2“. Quelle: P-01, P-02, D-01.
Offline: –

- AC-001: Angenommen Tag v2026.11.1 und `migrations-base.json` mit `replaces: "v2026.11.1"` · Wenn
  eine PR alle alten Migrationen löscht und nur Dateien mit Version ≥ `first` anlegt · Dann ist
  der Check „Migrationen“ grün.
- AC-002: Angenommen dieselbe PR · Wenn eine alte Datei liegen bleibt, eine neue Version < `first`
  ist oder `replaces` nicht den neuesten Tag nennt · Dann ist „Migrationen“ rot und nennt die
  Datei bzw. den Tag.
- AC-003: Angenommen nach v2026.11.1 gibt es einen neuen Tag · Wenn eine PR eine veröffentlichte
  Migration ändert oder löscht · Dann ist „Migrationen“ rot wie vor dieser Spec.
- AC-004: Angenommen die Remote-Historie ist leer oder ein Präfix der neuen Basis · Wenn
  `release.yml` läuft · Dann lässt der Wächter die Basis durch · Und enthält sie noch alte
  Versionen, bricht er mit „In Produktion …“ und der Version ab.
- AC-005: Angenommen die Ausnahme gilt und die Basis liefert „2026.11.2“ · Dann akzeptiert
  `version.mjs` den Wert · Und ohne Ausnahme bleibt `min > published` rot, `min > next` immer.
- AC-006: Angenommen ein Gerät mit v2026.11.1 nach der Veröffentlichung · Wenn es öffnet · Dann
  sperrt `VersionGate` das Schreiben · Und `redeploy-web.yml` lehnt v2026.11.1 ab.

**REQ-002 — Volle e2e-Suite blockiert die Veröffentlichung.** `release.yml` bekommt den Job
„e2e“. Er startet den lokalen Supabase-Stack im Runner, baut den Web-Export und lässt `pnpm e2e`
und `pnpm e2e:dev` in Shards auf Port 8790 laufen, ohne Secrets. „Sicherung“, „Supabase
ausliefern“ und „Web ausliefern“ hängen von ihm ab. Der Job ist von Hand startbar
(`workflow_dispatch`), so lässt sich `develop` vor der Release-PR prüfen. In `checks.yml` und
`preview.yml` läuft er nicht. Quelle: Enricos Vorgabe, P-03, T-11. Offline: –

- AC-007: Angenommen die Release-PR ist nach `main` gemergt · Wenn ein e2e-Test rot ist · Dann
  laufen „Sicherung“, „Supabase ausliefern“ und „Web ausliefern“ nicht, und kein Tag entsteht.
- AC-008: Angenommen alle Shards sind grün · Dann läuft die Veröffentlichung wie bisher weiter.
- AC-009: Angenommen `scripts/ci/workflows.test.mjs` · Dann prüft er: e2e läuft in `release.yml`
  und im manuellen Lauf, nie in `checks.yml` und `preview.yml`, und der Job liest kein `secrets.`.
- AC-010: Angenommen ein Hotfix nach `main` · Dann läuft derselbe e2e-Job vor der Auslieferung.

**REQ-003 — Checks laufen nach jedem Merge auf `develop`.** `checks.yml` läuft auch bei `push`
auf `develop`, mit eigener Concurrency-Gruppe. Quelle: P-06 (Spec 0014, AC-006). Offline: –

- AC-011: Angenommen eine PR wird nach `develop` squash-gemergt · Dann läuft `checks.yml` auf dem
  Push · Und `workflows.test.mjs` prüft den Trigger.

**REQ-004 — API-Integrationstests in CI.** Neuer Pflicht-Check „Integration (API)“: Er startet
`supabase start` ohne Studio, Logflare und Vector und führt `pnpm test:integration` mit
`SUPABASE_LOCAL=1` und den öffentlichen lokalen Werten aus, ohne `.env`. Vorher wird der
Seed-Test unabhängig von der Reihenfolge, und `recipe_deletion.test.sql` zählt nur die eigenen
Fixtures. Quelle: P-07, T-06, T-07. Offline: –

- AC-012: Angenommen die Integrationsdateien laufen in zufälliger Reihenfolge
  (`--sequence.shuffle`) · Dann ist `pnpm test:integration` dreimal hintereinander grün.
- AC-013: Angenommen `pnpm test:integration` lief auf derselben DB · Wenn danach
  `supabase test db` läuft · Dann ist `recipe_deletion.test.sql` grün.
- AC-014: Angenommen eine PR nach `develop` oder `main` · Dann ist „Integration (API)“ in beiden
  Rulesets Pflicht · Und der Ruleset-Abgleich in `workflows.test.mjs` kennt den Job.

**REQ-005 — Coverage-Hürde 80 % Zeilen je Paket.** `core`, `api` und `ui` messen in `pnpm check`
mit `@vitest/coverage-v8` über alle Quelldateien (`src/**/*.{ts,tsx}`) und brechen unter 80 %
Zeilen ab. Ausgenommen sind nur Tests, Test-Helfer und erzeugte Typen, und jede Ausnahme steht mit
Grund in der `vitest.config.ts`. `apps/app` deckt die e2e-Suite ab. `21-testing.md` hält beides
fest, die Zeile „jest-expo + RNTL“ entfällt. Quelle: Enricos Vorgabe, T-10, P-04, T-08. Offline: –

- AC-015: Angenommen `pnpm check` · Dann druckt jedes der drei Pakete eine Zusammenfassung über
  alle Quelldateien, auch über die, die kein Test lädt.
- AC-016: Angenommen eine Änderung senkt `ui` auf 79 % Zeilen · Dann ist der Check „Prüfungen“
  rot und nennt Paket und Wert.
- AC-017: Angenommen der Stand nach dieser Spec · Dann liegen `core`, `api` und `ui` je bei
  mindestens 80 % (heute 98,5 %, 94,0 %, 27,8 %).

**REQ-006 — Runbook für die erste produktive Version.** `betrieb.md` bekommt den Abschnitt „Erste
produktive Version (0028)“ mit fester Reihenfolge: Sicherung von Hand, Release-PR grün, Reset,
Merge, Bootstrap, Wiederherstellungstest. Er hält auch fest, dass „Re-run, Migrationen sind
abwärtsverträglich“ für dieses Release nicht gilt. Quelle: P-08. Offline: –

- AC-018: Angenommen Spec 0028, Schritt 6 · Dann steht der Abschnitt in `betrieb.md`, mit
  `gh workflow run backup.yml` vor dem Reset und `restore-test.yml` nach der ersten Nachtsicherung.
- AC-019: Angenommen `reset-app-data.mjs` entsteht · Dann prüft `conventions.test.mjs`, dass kein
  Workflow das Skript aufruft.

**REQ-007 — Kleinere Härtungen der Pipeline.** Release-Tags (`v*`) darf nur noch die
Veröffentlichung anlegen: Das Tag-Ruleset bekommt `creation` und die Actions-App als
bypass_actor (P-09). Die e2e-App-Version kommt aus einer Konstante weit über jeder Mindestversion
(„2099.12.1“), und `rundgang-version` leitet OWN/NEWER daraus ab (P-10). Offline: –

- AC-020: Angenommen jemand pusht von Hand einen Tag `v2026.12.9` · Dann lehnt GitHub ihn ab ·
  Und `release.yml` legt seinen Tag weiter an (vorher in einem Fork geprüft).
- AC-021: Angenommen eine Migration hebt `min_app_version` auf „2027.6.1“ · Dann bleiben alle
  e2e-Tests außer `rundgang-version` ohne Sperrbildschirm.

### Tests

**REQ-008 — Volle e2e-Suite grün.** Erst werden die Ursachen im Aufbau behoben: `freshSeed()` auf
Dateiebene in `rundgang-reise-fenster.spec.ts` (T-02), ein gemeinsamer Helfer `dayBlock` auf eine
neue testID `day-block-<datum>` statt `xpath=..` (T-03), und das Setup übernimmt nur einen Server,
der den eigenen Export ausliefert (T-05). Danach wird jeder rote Fall eingeordnet: veralteter Test
(Erwartung anpassen) oder Produktfehler (Fix mit rotem Test). Quelle: T-01, T-02, T-03, T-05.
Offline: –

- AC-022: Angenommen `pnpm e2e rundgang-reise-fenster` · Dann laufen alle 7 Tests, keiner endet
  mit „did not expect test.beforeAll()“.
- AC-023: Angenommen auf 8790 läuft ein `serve.mjs` mit fremdem `dist` · Wenn `pnpm e2e` startet
  · Dann bricht das Setup ab und nennt die PID · Und `/__e2e` liefert dist-Pfad und Hash von
  `index.html`.
- AC-024: Angenommen „Benachrichtigungen“ ab Werk · Dann erwartet AC-001 „2 an“ · Und
  `bedienung` AC-020 legt sich selbst einen Nutzer mit genau einem Haushalt an.
- AC-025: Angenommen der Stand nach allen Gruppen dieser Spec · Wenn `pnpm e2e` und
  `pnpm e2e:dev` laufen · Dann sind beide grün, und kein roter Fall ist übersprungen
  (erfüllt 0028 AC-009).

**REQ-009 — Reine Logik aus der App nach `core`.** `originFor`, `sectionHref` und das Lesen und
Schreiben der Parameter aus `url-state.ts` ziehen nach `packages/core`. Die Zustandsmaschine von
`use-section-editor.ts` wird ein reiner Reducer. `move-entry.ts`, `calendar-fill.ts` und
`shopping-run.ts` werden geprüft und, wo es reine Logik ist, verschoben. Jedes Stück bekommt Tests.
Quelle: T-08, P-04. Offline: –

- AC-026: Angenommen `apps/app/src/lib/url-state.ts` · Dann enthält es nur noch die Anbindung an
  den Router · Und `originFor` und `sectionHref` sind in `core` getestet.
- AC-027: Angenommen der Abschnitts-Editor · Dann laufen seine Übergänge über einen getesteten
  Reducer, und beide `eslint-disable` in `use-section-editor.ts` sind weg.

**REQ-010 — Komponententests in `ui`.** Jede `.tsx`-Datei in `packages/ui` lädt mindestens ein
Vitest-Test (jsdom, `react-native-web`, `@testing-library/react`). Er prüft die Rollen, Namen und
Zustände, die die Komponente verspricht. Quelle: T-08, Enricos Vorgabe. Offline: –

- AC-028: Angenommen `ListRow` mit `controls` · Wenn es rendert · Dann gibt es kein `button` in
  einem `button`.
- AC-029: Angenommen `Switch`, `Button`, `Checkbox`, `Sheet`, `InfiniteList` · Dann prüft je ein
  Test Rolle, Namen und den Zustand deaktiviert bzw. gewählt.

**REQ-011 — Kleinere Testlücken (niedrig).** `startAuth` bekommt einen Test für seine
Verdrahtung (T-09). Jedes AC ohne Test bekommt einen mit der AC-Id im Namen, oder der Nachweis
der Spec begründet, warum es keinen gibt: 0019 AC-041/044/049, 0022 AC-004, 0023 AC-048, 0029
AC-003/004/006 (T-12). Tests, die je nach Datum oder Wochentag übersprungen werden, legen ihre
Daten selbst an, und feste Wartezeiten auf Animationen entfallen (T-13). Offline: –

- AC-030: Angenommen `startAuth` mit Fake-`cacheStorage` · Wenn abgemeldet wird · Dann ist
  `clear` aufgerufen · Und ein `online`-Ereignis löst `checkAccount` aus.
- AC-031: Angenommen der 1. eines Monats oder ein Sonntag · Wenn `rundgang-kalender-ziehen`
  AC-015 und `rundgang-kalender-0021` laufen · Dann prüfen sie und überspringen nichts.
- AC-032: Angenommen `rundgang-handy` · Dann wartet es mit `expect.poll`/`toPass` auf die
  Endlage, ohne `waitForTimeout(400)`.

**REQ-012 — Begriffs-Guard deckt e2e ab (niedrig).** `trip-words.test.mjs` prüft auch `e2e/`.
Nach dem Zusammenfassen in 0028 prüft er auch `supabase/migrations/`. Er kennt die konkreten
„Entfällt“-Bezeichner. Testnamen und Kommentare sagen „trip window“ bzw. „Reise“. Quelle: C-13,
T-15. Offline: –

- AC-033: Angenommen ein e2e-Testname enthält „absence window“ · Dann ist `pnpm test:scripts` rot
  · Und `expectNoAbsenceWord` und die Prüfung von `/abwesenheiten` stehen auf der Allowlist.
- AC-034: Angenommen `not_cooked`, `reservation_reminder`, `remind_minutes_before`,
  `recipe_deletions`, `StarterSheet`, `listStarterRecipes`, `QUICK_ADD` oder `parseTimeInput`
  steht im Code · Dann ist der Guard rot · Und „Starter-Katalog“/`starterCatalog` bleibt erlaubt.

### Datenbank (für die Basis aus Spec 0028)

**REQ-013 — Ein Weg, `created_at` beim Wiederherstellen zu behalten.** Nur `set_timestamps` mit
`housekeeping.keep_created_at` bleibt. `restore_recipe`, `restore_restaurant` und
`restore_activity` setzen diese GUC. `recipes_stamp_restored`, `stamp_restored` und die drei
`*_stamp_restored`-Trigger entfallen. Quelle: D-02. Offline: nur online (Wiederherstellen ist ein
Schreibzugriff).

- AC-035: Angenommen ein gelöschtes Rezept von gestern · Wenn „Rückgängig“ es wiederherstellt ·
  Dann hat es sein altes `created_at`.
- AC-036: Angenommen `authenticated` setzt `housekeeping.keep_created_at` selbst · Wenn es ein
  Rezept anlegt · Dann setzt der Server `created_at` auf jetzt.

**REQ-014 — `meal_slots` ist nicht mehr schreibbar.** `households.meal_slots` verschwindet aus
dem Update-Grant, aus der Allowlist von `apply_changes` und aus `db/tables.ts`. `create_household`
setzt die drei Tageszeiten weiter. Quelle: D-03. Offline: –

- AC-037: Angenommen ein Mitglied patcht `meal_slots` auf `[]` über `apply_changes` oder PostgREST
  · Dann lehnt der Server ab, und die Tageszeiten bleiben.

**REQ-015 — `ai_usage` liegt im Schema `private`.** Die Tabelle heißt `private.ai_usage`.
`consume_ai_quota` und `purge_ai_usage` werden umgestellt, die Ausnahme in `schema_lint` entfällt,
und die Typen werden neu erzeugt. Quelle: D-04. Offline: nur online (KI).

- AC-038: Angenommen `schema_lint.test.sql` · Dann hat `public` keine Tabelle ohne Sync-Trigger
  mehr · Und `ai_usage` fehlt in `types.gen.ts`.
- AC-039: Angenommen das Kontingent ist erschöpft · Wenn die KI aufgerufen wird · Dann kommt
  dieselbe Ablehnung wie heute.

**REQ-016 — Aufgabe löschen und wiederherstellen auf dem Server.** `delete_chore` und
`restore_chore` laufen über `private.deletions` mit einem Schnappschuss der Event-Ids, wie bei
Rezepten, Restaurants und Aktivitäten (Spec 0024). Danach verschwindet `update (chore_id)` von
`chore_events` aus Grant und Allowlist. Quelle: D-11. Offline: nur online.

- AC-040: Angenommen „Küche wischen“ mit drei Einträgen im Verlauf · Wenn sie gelöscht und mit
  „Rückgängig“ wiederhergestellt wird · Dann hängen genau diese drei Einträge wieder an ihr.
- AC-041: Angenommen ein verwaister Eintrag · Wenn ein Mitglied ihn per `apply_changes` einer
  anderen Aufgabe zuordnen will · Dann lehnt der Server ab.
- AC-042: Angenommen ein fremder Haushalt oder `anon` · Wenn `delete_chore`/`restore_chore`
  aufgerufen wird · Dann lehnt der Server ab, und nichts ändert sich.

**REQ-017 — Kleine Schema-Bereinigungen (niedrig).** Quelle: D-05, D-06, D-09, D-12, D-13.
Offline: –

- Die Löschprotokoll-Trigger und die `(household_id, updated_at)`-Indexe auf
  `household_members` und `household_invitations` entfallen. Der Kommentar sagt, dass kleine
  Tabellen vollständig kommen (D-05).
- `profiles_email_idx` entfällt, `households_default_store_fkey` ist nicht mehr `deferrable` (D-06).
- Neu: Index `meal_plan_entries_household_id_date_idx` auf `(household_id, date)` (D-09).
- `household_media_names` heißt `begin_household_deletion`, in Transport, Fake und
  `commands-household.ts` (D-12).
- `packing_items.per_day` heißt `per_day_quantity`. `maps_url` prüft bei Restaurants und
  Aktivitäten dieselbe Regel (`private.is_web_url`), passend zu `parseMapsLink` (D-13).

- AC-043: Angenommen ein Mitglied wird entfernt oder eine Einladung zurückgezogen · Wenn das andere
  Gerät synct · Dann ist sie dort weg, ohne Eintrag in `deleted_records`.
- AC-044: Angenommen eine Aktivität mit Kartenlink `http://maps.google.com/…` · Wenn sie
  gespeichert wird · Dann nimmt der Server ihn an wie beim Restaurant.
- AC-045: Angenommen „Haushalt löschen“ · Dann ruft die App `begin_household_deletion` auf, und
  `household_media_names` gibt es nicht mehr.

**REQ-018 — Endstand in der Basis (niedrig).** Beim Zusammenfassen (0028, Schritt 4) legt die
Basis jede Tabelle im Endstand an, in logischer Spaltenreihenfolge und mit
`created_at`/`updated_at` am Ende. Alle Kopf- und Funktionskommentare beschreiben den Endstand:
Storage-Ordner inklusive `restaurants`, Standardwerte der Benachrichtigungen, `set_timestamps` mit
`keep_created_at`. Quelle: D-14. Offline: –

- AC-046: Angenommen die neue Basis · Dann nennt kein Kommentar `reservation_reminders`, und der
  Storage-Kopf nennt `activities|recipes|restaurants`.

### Code

**REQ-019 — Paketgrenzen und Lint-Regeln werden erzwungen.** `eslint.config.mjs` bekommt je Paket
`no-restricted-imports`. `core` verbietet `@housekeeping/*`, `react*`, `expo*`, `@supabase/*` und
`idb-keyval`, `ui` verbietet `@housekeeping/*`, und jedes Paket verbietet `@/*` und `**/apps/**`.
Alle Lint-Skripte laufen mit `--max-warnings=0`. Dazu kommen
`@typescript-eslint/ban-ts-comment: error` und eine Pflicht-Begründung für jedes Disable.
Quelle: C-01, C-17. Offline: –

- AC-047: Angenommen `import { useState } from 'react'` in `packages/core/src` · Wenn eslint
  läuft · Dann ist es rot (Probe über `eslint --stdin` als Test).
- AC-048: Angenommen ein `eslint-disable-next-line` ohne `-- Grund` oder eine neue Warnung ·
  Dann ist `pnpm lint` rot.

**REQ-020 — Ein „heute“ aus der Haushalts-Uhr.** `today` im AppState kommt aus
`householdClock(now, activeHousehold.timeZone).date`, und `berlinToday` entfällt. Komponenten
nutzen nur `useToday()` bzw. `useHouseholdClock()`, nirgends `new Date()` plus Zeitzone. Die
Begrüßung nimmt die Stunde des Haushalts. Die Edge-Funktion addiert Tage auf dem Datum, nicht in
Millisekunden. Quelle: C-03. Offline: offline vollständig.

- AC-049: Angenommen 00:00:30 in Berlin · Dann liefern Übersicht, Eintrags- und
  Einplanen-Fenster denselben Tag.
- AC-050: Angenommen ein Gerät in New York um 20:00, in Berlin 02:00 · Dann richtet sich die
  Begrüßung nach Berlin.
- AC-051: Angenommen der 27.3.2027 um 23:30 (vor der Sommerzeit) · Dann endet das Plan-Fenster der
  Edge-Funktion am richtigen Tag.

**REQ-021 — Suche und Sortierung von Restaurants und Aktivitäten in `core`.**
`restaurantMatches`, `activityMatches`, `sortActivities` und `ACTIVITY_SORTS` liegen getestet in
`packages/core`. Die Listen-Seiten und das Einplanen-Fenster nutzen dieselben Funktionen. Die
Beschriftungen gleichen sich an: „A–Z“, „Bewertung“, „Zuletzt besucht“. Die URL-Slugs bleiben.
Quelle: C-02, L-09. Offline: offline vollständig.

- AC-052: Angenommen ein Restaurant mit Adresse in „Kreuzberg“ und Schlagwort „Brunch“ · Wenn ich
  im Fenster „Einplanen“ „Kreuzberg“ oder „Brunch“ suche · Dann finde ich es wie auf seiner Seite.
- AC-053: Angenommen Aktivitäten, eine davon nie gemacht · Wenn ich nach „Zuletzt besucht“ sortiere
  · Dann steht sie zuletzt, und bei Gleichstand gilt der Name.

**REQ-022 — Tote Funktionen und Exporte entfernen.** Diese Funktionen nutzt die App nicht, sie
werden samt Tests gelöscht: `periodForDay`, `calendarDayParam`, `routeId`, `pageHref`,
`cookingServings`, `originSummary`, `variantSummary` und `splitSummary`. Dazu kommen die
ungenutzten Exporte aus C-05. `index.ts` in `api` und `ui` enthält nur, was die App braucht.
`createArea` nutzt `nextAreaSort`, `withoutTrips` zieht nach `test-fixtures`. Die Verweise auf
`tmp/brief/…` zeigen auf Migrationen und `docs/architecture` (C-14). knip läuft in `pnpm check`.
Quelle: C-04, C-05, C-14. Offline: –

- AC-054: Angenommen `pnpm check` · Dann meldet knip keinen ungenutzten Export und keine
  ungenutzte Datei.
- AC-055: Angenommen der Nachweis von Spec 0016 · Dann belegt kein Test mehr AC-023 über
  `periodForDay`, und die Nachweis-Zeile ist korrigiert.

**REQ-023 — Große Einheiten teilen (Refactor).** Der Zustand von `AddEntrySheet` wird ein reiner
Reducer `addEntryReducer` in `core` (Aktionen u. a. `choose`, `backToSearch`, `save`), mit Tests.
Suche, Anlegen je Art und Details werden Unterkomponenten. `backend.ts` teilt sich ohne
Verhaltensänderung in pull, queue, store-queue und persistence. Quelle: C-11. Offline: –

- AC-056: Angenommen ich wähle im Fenster „Einplanen“ ein Rezept, gehe zurück und wähle ein
  Restaurant · Dann trägt die zweite Wahl keine Portionen, Erinnerung oder Tageszeit der ersten
  mit (Reducer-Test).
- AC-057: Angenommen der Refactor · Dann liegen pull, queue, store-queue und persistence in
  eigenen Modulen · Und alle Tests von `api` sind unverändert grün.

**REQ-024 — Fake-Server schnell und gegen die DB geprüft.** `insertRows` und `withoutRows`
kopieren jede Tabelle einmal statt pro Zeile (P-05). Für die riskantesten RPCs prüft ein
Vertragstest dieselben Fälle gegen den Fake und die lokale DB: `apply_changes`-Allowlist,
`delete/restore_recipe`, `delete_restaurant/activity`, `complete_chore`, `delete/restore_chore`.
Die Namen im Fake folgen dem Schema (`deletions` mit `kind`). Quelle: P-05, C-12. Offline: –

- AC-058: Angenommen der Test „a clear with more than 5000 contributions …“ · Dann läuft er unter
  dem Standard-Timeout von Vitest, und das `30_000` ist entfernt.
- AC-059: Angenommen eine RPC verhält sich im Fake anders als in der DB · Dann ist der
  Vertragstest in „Integration (API)“ rot.

**REQ-025 — Doppelte Bausteine und Namen vereinheitlichen (niedrig).** Quelle: C-06, C-07, C-08,
C-09, C-10, C-15. Offline: –

- Ein Hook `useRefusedDays()` ersetzt `useRefusedDay`, `useRefused` und die Prüfung in
  `year-view`/`SlotTarget` (C-06).
- `addPlanEntry` filtert Varianten mit 0 Portionen selbst (`storedVariants`), die zwei
  Inline-Filter in der App entfallen (C-07).
- Ein `ConfirmDialog` in `features/shell` ersetzt `TripConfirmDialog` und
  `stores/ConfirmDialog` (C-08).
- `eatersForDay` heißt `householdEaters` (C-09).
- Ein Helfer `errorMessage(error, fallback = WRITE_REJECTED_MESSAGE)` in `features/shell` ersetzt
  die 28 Kopien. „Not signed in“ wird deutsch (C-10).
- `weekdayHeads(false)` aus `core` ersetzt beide `WEEKDAY_HEADS`. `toHousehold` sortiert
  `mealSlots` einmal, die sieben Kopien entfallen (C-15).

- AC-060: Angenommen ein Fehler, der kein `Error` ist, oder ein `TransportError` · Dann zeigt die
  App „Das hat nicht geklappt.“ bzw. den Text von `WRITE_REJECTED_MESSAGE`, nie `String(error)`.
- AC-061: Angenommen Abmelden, Feedback löschen, Mitglied entfernen und einen Markt löschen ·
  Dann nutzen alle denselben `ConfirmDialog`, und offline ist Bestätigen gesperrt, wo es Netz
  braucht.

**REQ-026 — Beispielfotos nur in Dev und Vorschau.** Die 16 Beispielfotos (1,5 MB) bindet nur
das Seed-Modul ein. Der Produktiv-Build und der Precache des Service Workers enthalten sie nicht.
`photo` verschwindet aus `WRITABLE_COLUMNS` und aus dem Grant. Die Spalte bleibt für den Seed. Die
Seed-Typen ziehen nach `packages/api/src/seed/types.ts`. Quelle: C-16. Offline: –

- AC-062: Angenommen `pnpm build:web` für die Produktion · Dann enthält `dist` keines der
  Beispielfotos, und das Precache-Manifest nennt keins.
- AC-063: Angenommen `pnpm dev` mit Seed · Dann zeigen die Seed-Rezepte ihre Fotos wie heute.

### Logik

**REQ-027 — „+ Aus Kalender“ verdoppelt keine Mengen.** Für einen Eintrag, der schon Beiträge auf
einem offenen Posten hat, ersetzt `addPlannedToList` diese Beiträge, wie es
`replace_entry_contributions` tut. Steht er nur auf abgehakten Posten, kommt er neu dazu.
Quelle: L-01. Offline: nur online (Liste schreiben).

- AC-064: Angenommen „Lasagne“ steht mit 500 g Hackfleisch offen auf der Liste · Wenn ich sie über
  „+ Aus Kalender“ noch einmal übernehme · Dann stehen weiter 500 g da.
- AC-065: Angenommen das Hackfleisch der Lasagne ist abgehakt · Wenn ich sie noch einmal übernehme
  · Dann kommt ein neuer offener Posten mit 500 g dazu.

**REQ-028 — Vorratscheck ohne verschachtelte Buttons.** In „Was brauchst du wirklich?“ steht
`RowAmount` in `controls`. Die Zeile selbst ist das Häkchen: Der drückbare Teil hat die Rolle
`checkbox`, und `ListRow` lernt das zusammen mit `controls`. Der Smoke-Test öffnet das Fenster an
einem Rezept mit Zutaten und ändert eine Menge mit „+“. Quelle: L-02. Offline: nur online.

- AC-066: Angenommen das Fenster an „Lasagne“ ist offen · Dann gibt es kein `button` in einem
  `button`, und die Konsole zeigt keinen React-Fehler.
- AC-067: Angenommen ein Screenreader · Wenn er eine Zeile liest · Dann hört man Name und
  Zustand der Zeile · Und die Mengen-Knöpfe sind eigene, benannte Bedienelemente.

**REQ-029 — Reise-Fenster zeigt den eingestellten Zeitraum.** Solange „Speichern“ sichtbar ist,
kommen die Dauer und die Mengen je Tag aus dem eingestellten Zeitraum, nicht aus der gespeicherten
Reise. Quelle: L-06. Offline: offline lesend.

- AC-068: Angenommen „Mallorca“ 12.–19.12. (8 Tage) mit 1 Paar Socken je Tag · Wenn ich das Ende
  auf den 15.12. ziehe, ohne zu speichern · Dann steht „4 Tage“ da und bei den Socken 4.

**REQ-030 — Fenster und Texte (niedrig).** Quelle: L-04, L-07, L-08, L-10. Offline: offline
lesend.

- AC-069: Angenommen der Tab „Reste“ hat Kandidaten, aber keiner passt zu „Pizza“ · Dann steht
  „Keine Reste zu „Pizza““ da, mit „In allen suchen“, das den Tab wechselt und den Text behält
  (L-04).
- AC-070: Angenommen „Was hast du erledigt?“ mit leerem Suchfeld · Dann stehen die Aufgaben des
  Haushalts da, fällige und überfällige zuerst, dann nach Name (L-07, Nachtrag zu 0011 REQ-006).
- AC-071: Angenommen Nadja lädt eine neue Adresse ein · Dann lautet der Hinweis „… ist eingeladen.
  Ist die Adresse neu, muss Enrico sie bei Google eintragen.“ (L-08, ersetzt 0027 AC-006).
- AC-072: Angenommen ein Rezept ohne Varianten im Fenster „Einplanen“ · Dann steht „Portionen“
  einmal da, als Beschriftung des Zählers (L-10).

### UI/UX

**REQ-031 — Jahresansicht auf dem Handy öffnet nie den Nachbartag.** Mit dem Finger öffnet ein
Tipp in der Jahresansicht den Monat in der Monatsansicht. Die Mini-Tage bekommen
`data-dense`, und dort wächst die Trefferfläche nicht (`[data-dense]::before { display: none }`).
Mit der Maus bleibt jeder Tag anklickbar. Quelle: U-01 (ändert 0019 REQ-009 für die Jahresansicht).
Offline: offline vollständig.

- AC-073: Angenommen Handy, Jahr 2026 · Wenn ich mitten auf den 17.11. tippe · Dann öffnet sich
  „November 2026“ in der Monatsansicht, nie der 18.11. (e2e mit `hasTouch`).
- AC-074: Angenommen Desktop, Jahr 2026 · Wenn ich auf den 17.11. klicke · Dann öffnet sich das
  Tagesfenster für „Di 17. November“.

**REQ-032 — Übersicht und Kalender auf dem Tablet.** Unter 1100 px ist die Übersicht einspaltig
wie auf dem Handy, die sieben Tage dürfen ein Raster bleiben. Der Kalender zeigt die Woche als
Liste wie auf dem Handy, und Tabs und Navigation stehen auf zwei Zeilen. Zwei Spalten und das
Wochenraster mit sieben Spalten gibt es erst ab `bp === 'desktop'`. Quelle: U-02, U-03.
Offline: offline vollständig.

- AC-075: Angenommen Tablet 820 px, Übersicht · Dann bricht der Titel „Montag, 23. November“ nicht
  mitten im Wort um, und „Wie war's?“ zeigt alle fünf Sterne und „Passt so“ ganz.
- AC-076: Angenommen Tablet 820 px, Kalender · Dann sind die Tabs „Woche“, „Monat“ und „Jahr“ zu
  sehen, und die Einträge der Woche sind lesbar.
- AC-077: Angenommen Desktop 1100 px · Dann bleiben Übersicht und Kalender wie heute.

**REQ-033 — Lange Wörter werden getrennt, nicht zerschnitten.** Titel-Rollen (`caption`,
`rowTitle`, `cardTitle`) setzen im Web `hyphens: 'auto'` (`lang="de"` ist gesetzt), auch in
`KindLine`. In der Haushaltszeile der Woche steht der Avatar unter dem Titel, damit der Titel die
ganze Breite hat. Quelle: U-04, L-05. Offline: offline vollständig.

- AC-078: Angenommen Desktop 1440 px und 1024 px, Woche mit „Kichererbsen-Eintopf“ und einer
  Aufgabe „Bettwäsche …“ · Dann steht dort „Kichererbsen-|Eintopf“ bzw. „Bett-|wäsche“, nie
  „Kichererbse|n“ oder „Bettwäsc|he“.

**REQ-034 — Fokusrahmen in Listen ganz sichtbar.** `InfiniteList` übernimmt das Muster von
`ScrollRow`: `margin: -FOCUS_RING_ROOM` an der Liste, `padding: FOCUS_RING_ROOM` im Inhalt.
Quelle: U-05 (Spec 0019 REQ-002). Offline: offline vollständig.

- AC-079: Angenommen Desktop, Rezepte · Wenn ich mit Tab auf die Kachel am linken Rand gehe ·
  Dann ist der Fokusrahmen auf allen vier Seiten zu sehen · Und ebenso bei Aufgaben, Verlauf,
  Artikeln und Restaurants.

**REQ-035 — Schalter „aus“ ist erkennbar.** Ein neues Token `switchOff` für die Spur hat in allen
drei Themes hell und dunkel mindestens 3 : 1 gegen `bg` und `surface`. `contrast.test.ts` prüft
das Paar. Quelle: U-07. Offline: offline vollständig.

- AC-080: Angenommen „Benachrichtigungen“ mit einem Schalter aus, Thema „Markthalle“ hell · Dann
  hebt sich die Spur mit mindestens 3 : 1 vom Hintergrund ab, ohne Schatten zu brauchen.

**REQ-036 — Einheitliche Navigation (niedrig).** Alle Verwalten-Seiten nutzen
`useOriginBack(params.von, 'verwalten')` mit „‹ Verwalten“, `useBackToManage` entfällt (U-06).
„Heute“ im Kalender steht wie in der Übersicht links von „‹“, als `Button variant="secondary"
size="sm"`, deaktiviert, solange heute zu sehen ist (U-08, Spec 0020). Offline: offline
vollständig.

- AC-081: Angenommen „Reisen“, „Märkte“, „Mitglieder“, „Feedback“, „Reisetaschen“ · Dann steht
  oben „‹ Verwalten“.
- AC-082: Angenommen Kalender, Woche mit heute · Dann ist „Heute“ ausgegraut · Und eine Woche
  später ist es aktiv und springt zurück.

**REQ-037 — Darstellung angleichen (niedrig).** Quelle: U-09, U-10, U-11, U-12, U-13. Offline:
offline vollständig.

- AC-083: Angenommen Einkaufsmodus · Dann stehen Posten in der Bedienschrift (`rowTitle`), nicht
  in Fraunces (U-09).
- AC-084: Angenommen Einkaufsmodus ab Tablet · Dann ist die Eingabeleiste genau so breit wie die
  Zeilen (U-10).
- AC-085: Angenommen ein leerer Haushalt · Dann stehen die Knöpfe der Leerzustände mittig, und
  Aufgaben sagt „Legt eure erste Aufgabe an oder nehmt eine Vorlage.“ (U-11).
- AC-086: Angenommen eine Aktivität · Dann zeigt sie die Bewertungen mit `MemberRatings` wie
  Rezept und Restaurant, die eigene nur einmal (U-12).
- AC-087: Angenommen Handy, Rezeptseite · Dann steht „Kochen“ zuerst über die volle Breite,
  darunter „Einplanen“ und „Auf die Liste“ nebeneinander (U-13).

## Entscheidungen

1. **Reihenfolge zu Spec 0028:** Diese Spec ist der Code-Review aus 0028, Schritt 3, und läuft
   vor 0028, Schritt 4. Die Schritte 4–9 von 0028 bleiben, nur Schritt 8 nutzt REQ-001.
2. **Schemaänderungen als eigene Migrationen vor dem Zusammenfassen** (REQ-013 bis REQ-017), je
   mit rotem pgTAP-Test zuerst. So bleibt das Zusammenfassen frei von Verhaltensänderungen, und
   der `db diff` von 0028 AC-002 zeigt nur die Objekte aus 0028 REQ-002. REQ-018 gehört in den
   Zusammenfassungs-Schritt selbst.
3. **Ausnahme für die Basis:** Variante aus P-02 statt D-01 b. Eine Ausnahme in
   `migrations-base.json` gilt für Migrationen, Wächter und `min_app_version` und ist mit dem
   nächsten Tag verbraucht. Die Mindestversion 2026.11.2 liegt immer ≤ der nächsten Version, egal
   ob das Release im November oder Dezember läuft, und sperrt trotzdem v2026.11.1. Das kurze
   Fenster zwischen „Supabase ausliefern“ und „Web ausliefern“ ist akzeptiert. Ändert 0028 AC-016
   (Sperre statt nur Hinweis) und die Risikozeile „Alte App schreibt in das neue Schema“.
4. **e2e in `release.yml`, nicht als Pflicht-Check der Release-PR:** So ist es Enricos Vorgabe
   („blockierender Job in der Veröffentlichung“). Hotfixes laufen ebenfalls durch, und der
   manuelle Lauf prüft `develop` vorab. Es gibt 4 Shards zu je etwa 30 Minuten, und ein roter
   Shard blockiert, bis jemand ihn neu startet. Ändert Spec 0014 AC-006 („E2E laufen nur lokal“)
   und die Assertion in `workflows.test.mjs`. Je Spec bleibt es dabei: e2e nur typprüfen.
5. **Coverage:** 80 % Zeilen je Paket für `core`, `api` und `ui`. Für Zweige gibt es keine
   Schwelle, weil Enrico nur Zeilen genannt hat. Gemessen wird über alle Quelldateien, sonst zählt
   v8 nur geladene Dateien. `apps/app` deckt e2e ab. `21-testing.md` wird angepasst und die
   jest-expo-Zeile gestrichen (beantwortet T-08, Stufe 2).
6. **Neue devDependencies**, mit der Freigabe dieser Spec genehmigt: `@vitest/coverage-v8`
   (passend zu Vitest 5.1.1), `jsdom` und `@testing-library/react` für `ui`, `knip`,
   `@eslint-community/eslint-plugin-eslint-comments` und `fake-indexeddb`.
7. **Integrationstests als eigener Job** „Integration (API)“ und nicht im Job „Datenbank
   (pgTAP)“. Der braucht `supabase start` statt `db start`, und ein Fehler ist so klar
   zuzuordnen. `edge-smoke.mjs` bleibt lokal, weil es echte KI-Secrets braucht.
8. **Tablet:** Behoben wird über den Breakpoint `desktop` (REQ-032). Eine schmale Seitenleiste
   unter 1100 px bekommt eine eigene Spec.
9. **Jahresansicht mit dem Finger:** Ein Tipp öffnet den Monat statt den Mini-Tag (REQ-031). Das
   ändert 0019 REQ-009 für die Jahresansicht: Die Tage dort haben mit dem Finger keine eigene
   44-pt-Fläche mehr.
10. **`periodForDay` wird gelöscht** (C-04). Das Raster folgt weiter dem gewählten Tag, wie es die
    App heute macht. 0016 AC-023 verlangt nichts anderes. Bestätigt Enrico das nicht, wird
    stattdessen die Funktion im `calendar-screen` genutzt.
11. **Beispielfotos:** Die Produktion braucht sie nicht (REQ-026). Die Spalte `recipes.photo`
    bleibt für den Seed, Clients schreiben sie nicht mehr.
12. **Aufgabe löschen auf dem Server** (REQ-016) kommt in diese Spec und bleibt nicht als
    offenes Risiko in 0028.
13. **Verworfen:**
    - D-07: `to_jsonb` in `set_timestamps` kostet bei zwei Personen Bruchteile einer
      Millisekunde.
    - D-08: Das Volumen im Löschprotokoll ist klein, und eine Änderung würde in `sync-delta`
      eingreifen.
    - D-10: Eine Grenze für `remove_contributions` würde „Rückgängig“ großer Zugaben brechen.
    - S-01: Für `resolve-maps-link` ist kein Kontingent dokumentiert gewollt, es entstehen keine
      Kosten.
    - S-02: Einladungen laufen bewusst nicht ab, solange Google-Anmeldung auf „Testing“ steht.
      Geht sie auf „In Production“, wird das neu bewertet.
    - T-04: Die Beispiele sind veraltete Erwartungen, keine Reihenfolge-Fehler. Sie stehen in
      REQ-008.
    - T-11: Ersetzt durch Enricos Vorgabe in REQ-002.
    - L-03: Nachrichten bleiben während einer Reise still (0030 REQ-008). Ob eine ausdrücklich
      gesetzte Erinnerung trotzdem kommen soll, ist eine Produktfrage für eine spätere Spec.
14. **Geänderte Kriterien älterer Specs:**
    - 0014 AC-006 (REQ-002, REQ-003)
    - 0019 REQ-009 (REQ-031)
    - 0011 REQ-006 (AC-070)
    - 0027 AC-006 (AC-071)
    - 0016, Nachweis (AC-055)
    - 0028 AC-016, Risiken und Schritte 3, 4 und 8 (REQ-001)
    - 0028 AC-005: die entfernten Objekte aus REQ-013 bis REQ-017

    Jede betroffene Spec bekommt einen Nachtrag mit Verweis auf 0031.

- **REQ-027, im Bau entschieden:** Ersetzt werden nur die Beiträge auf den Artikeln, die man im
  Vorratscheck übernimmt. Abgewählte Artikel des Eintrags („haben wir“) bleiben auf der Liste, wie
  sie waren. Weil `replace_entry_contributions` alle offenen Beiträge des Eintrags entfernt, gehen
  sie im selben Aufruf mit neuer Id wieder mit. Undo stellt die alten Beiträge her.
- **REQ-030, im Bau entschieden:** „Fällige und überfällige zuerst“ heißt in der Reihenfolge von
  „Zu tun“ (`dueChores`), der Rest nach Name.

## Daten

Personenbezogene Daten kommen nicht dazu. Die Migrationen kommen vor das Zusammenfassen
(Entscheidung 2), die Liste geht an Spec 0028 AC-005.

- **Neu:**
  - Index `meal_plan_entries_household_id_date_idx (household_id, date)`
  - RPCs `delete_chore(uuid)` und `restore_chore(uuid)` über `private.deletions` (Art `chore`)
  - RPC `begin_household_deletion(uuid)` (ersetzt `household_media_names`)
  - Tabelle `private.ai_usage` (ersetzt `public.ai_usage`)
- **Geändert:**
  - `restore_recipe/restaurant/activity` setzen `housekeeping.keep_created_at`
  - `packing_items.per_day` → `per_day_quantity`
  - `activities.maps_url` und `restaurants.maps_url` prüfen beide `private.is_web_url`
  - `consume_ai_quota` und `purge_ai_usage` auf `private.ai_usage`
  - `households_default_store_fkey` nicht mehr `deferrable`
  - `min_app_version()` liefert „2026.11.2“
- **Grants und Allowlist von `apply_changes`:**
  - weg sind `households.meal_slots`, `chore_events.chore_id` und `recipes.photo`
  - Spalten-Grants und Allowlist bleiben deckungsgleich (pgTAP)
- **Entfällt:**
  - `private.recipes_stamp_restored`, `private.stamp_restored` und die Trigger
    `recipes/restaurants/activities_stamp_restored`
  - die Trigger `record_deletion` auf `household_members` und `household_invitations` sowie ihre
    `(household_id, updated_at)`-Indexe
  - `profiles_email_idx`
  - `public.ai_usage` und die Ausnahme dafür in `schema_lint.test.sql`
  - `household_media_names`
- **Nur im Zusammenfassen (REQ-018):** Spaltenreihenfolge im Endstand, Kopf- und
  Funktionskommentare.
- **Sync und Cache:** Die Umbenennung von `per_day` und der Wegfall von `meal_slots` in
  `db/tables.ts` erhöhen `CACHE_VERSION`. `sync_pull` bleibt, nur ohne die Tabelle `ai_usage`, die
  ohnehin nicht synchronisiert wurde.
- **Datei:** `supabase/migrations-base.json` (`replaces`, `first`), wird nach dem nächsten Tag
  gelöscht.

## Risiken

| Risiko                                                                                                   | Gegenmaßnahme                                                                               | Test                                                                                   |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Die Ausnahme in `migrations.mjs` bleibt offen, und veröffentlichte Migrationen lassen sich später ändern | Sie gilt nur, solange `replaces` gleich dem neuesten Tag ist                                | `migrations.test.mjs`: alte Datei bleibt, falsches `replaces`, Ausnahme nach neuem Tag |
| Ein nicht zurückgesetztes Projekt überspringt still die neue Basis                                       | Neue Zeitstempel. Der Wächter verlangt eine leere Historie oder ein Präfix der Basis        | `supabase-guard.test.mjs`: Remote mit alten Versionen ist rot                          |
| v2026.11.1 schreibt gegen die neue Basis                                                                 | `min_app_version` 2026.11.2 sperrt das Schreiben, `redeploy-web` lehnt ab                   | `version.test.mjs`, `app-version.test.ts`, AC-006                                      |
| Der e2e-Job braucht Secrets oder leakt sie                                                               | Nur lokaler Stack und öffentliche lokale Werte                                              | `workflows.test.mjs`: kein `secrets.` im Job                                           |
| Ein wackliger e2e-Test blockiert jede Veröffentlichung                                                   | Suite vorher grün (REQ-008), keine Datums-Abhängigkeit (REQ-011), Neustart nur von Hand     | dreimal grüner manueller Lauf vor der Release-PR                                       |
| Ein Mitglied eines fremden Haushalts löscht oder stellt eine Aufgabe wieder her                          | `delete_chore`/`restore_chore` prüfen `auth.uid()` und Mitgliedschaft über `my_deletion`    | pgTAP `chore_deletion.test.sql`: fremder Haushalt, `anon`, abgelaufener Schnappschuss  |
| Entzogene Grants brechen Schreibwege der App                                                             | Allowlist und Grants gemeinsam ändern, `api` schreibt die Spalten nicht mehr                | pgTAP: `permission denied` für `meal_slots`, `chore_id`, `photo`; `api`-Tests grün     |
| Ein Client behält `created_at` mit eigener GUC                                                           | Nur `current_user = 'postgres'` darf die GUC nutzen                                         | pgTAP AC-036                                                                           |
| Ohne Löschprotokoll sieht ein entferntes Mitglied den Haushalt weiter                                    | Kleine Tabellen kommen bei jedem Pull vollständig, der Verlust der Mitgliedschaft fällt auf | `sync-delta`-Test und pgTAP AC-043                                                     |
| Das Umbenennen von `household_media_names` trennt Transport, Fake und DB                                 | Vertragstest für die Lösch-RPCs                                                             | REQ-024, AC-059                                                                        |
| Das Kontingent für die KI geht beim Umzug von `ai_usage` verloren oder ist nicht mehr atomar             | Dieselbe Funktion, nur das Schema ändert sich                                               | pgTAP `ai_usage.test.sql`, AC-039                                                      |
| Das Coverage-Gate wird mit Ausnahmen umgangen                                                            | Ausnahmen nur für Tests, Helfer und erzeugte Typen, je mit Grund in der Konfiguration       | Review der `vitest.config.ts`                                                          |
| Das Tag-Ruleset blockiert auch `release.yml`                                                             | Vorher mit einem Testtag in einem Fork prüfen, dann `gh api -X PUT`                         | AC-020                                                                                 |

## Umsetzung

Die Gruppen A–F sind unabhängig und laufen parallel, mit einer PR je Gruppe oder Teilgruppe.
Innerhalb einer Gruppe geht es der Reihe nach. G kommt nach A–F, H zuletzt vor 0028, Schritt 4.
Weil `add-entry-sheet.tsx` mehrere Gruppen berührt, gehören alle Änderungen daran zu D.

- [ ] 1. Spec, Eintrag in `docs/specs/README.md`.

**A — Pipeline-Grundlagen**

- [ ] 2. Fake-Server `insertRows`/`withoutRows` einmal je Tabelle kopieren, Timeouts zurück
      (AC-058).
- [ ] 3. `checks.yml` auf `push` nach `develop` (AC-011).
- [ ] 4. Lint: Paketgrenzen, `--max-warnings=0`, `ban-ts-comment`, Pflicht-Begründung (AC-047,
      AC-048).
- [ ] 5. Tag-Ruleset `creation`, e2e-App-Version als Konstante (AC-020, AC-021).

**B — e2e-Suite**

- [ ] 6. `freshSeed()` in `rundgang-reise-fenster`, `dayBlock` mit testID, Server-Identität in
      `global-setup` (AC-022, AC-023).
- [ ] 7. Lauf auf 8790, jeden roten Fall einordnen, veraltete Tests anpassen (AC-024).
- [ ] 8. Begriffs-Guard für e2e und Wortliste, Testnamen (AC-033, AC-034).
- [ ] 9. Datums-Unabhängigkeit, Warten auf die Endlage, fehlende AC-Tests (AC-031, AC-032, T-12).

**C — Datenbank** (je Punkt eine Migration mit rotem pgTAP zuerst, `db-change`-Skill)

- [ ] 10. `created_at` beim Wiederherstellen (AC-035, AC-036).
- [ ] 11. `meal_slots`, `recipes.photo` aus Grant und Allowlist (AC-037, REQ-026).
- [ ] 12. `private.ai_usage` (AC-038, AC-039).
- [ ] 13. `delete_chore`/`restore_chore`, `chore_id` aus Grant und Allowlist; UI auf die RPCs
      (AC-040–AC-042).
- [ ] 14. Kleine Bereinigungen D-05, D-06, D-09, D-12, D-13, `CACHE_VERSION` (AC-043–AC-045).
- [ ] 15. `recipe_deletion.test.sql` auf Fixtures, Seed-Test unabhängig, Job „Integration (API)“,
      Rulesets (AC-012–AC-014).

**D — Code-Struktur und Logik im Einplanen**

- [ ] 16. `addEntryReducer` in `core`, `AddEntrySheet` zerlegen, `backend.ts` teilen (AC-056,
      AC-057).
- [ ] 17. Suche und Sortierung in `core` (AC-052, AC-053), Varianten-Filter (C-07), Reste-Leerzustand
      (AC-069), „Portionen“ einmal (AC-072).
- [ ] 18. Ein „heute“ aus der Haushalts-Uhr, Edge-Funktion mit Kalenderarithmetik
      (AC-049–AC-051).
- [ ] 19. Tote Funktionen und Exporte, knip, Kommentar-Verweise, 0016-Nachweis (AC-054, AC-055).
- [ ] 20. Doppelte Bausteine: `useRefusedDays`, `ConfirmDialog`, `errorMessage`, `householdEaters`,
      `weekdayHeads`, sortierte `mealSlots` (AC-060, AC-061).
- [ ] 21. Beispielfotos nur im Seed, Seed-Typen verschieben (AC-062, AC-063).

**E — Logik**

- [x] 22. „+ Aus Kalender“ ersetzt statt anzuhängen (AC-064, AC-065).
- [x] 23. Vorratscheck mit `controls` und Rolle `checkbox`, Smoke-Test bis zu den Zeilen (AC-066,
      AC-067).
- [x] 24. Reise-Fenster live (AC-068), „Was hast du erledigt?“ mit Liste (AC-070),
      Einladungs-Hinweis samt Nachtrag in 0027 (AC-071).

**F — UI/UX** (danach `/ui-verify` bei 390, 820, 1024 und 1440 px, hell und dunkel)

- [ ] 25. Jahresansicht mit dem Finger, `data-dense`, Nachtrag in 0019 (AC-073, AC-074).
- [ ] 26. Tablet: Übersicht einspaltig, Kalender-Liste und zwei Zeilen unter 1100 px
      (AC-075–AC-077).
- [ ] 27. Silbentrennung und Avatar in der Wochenzeile (AC-078), Fokusrahmen in `InfiniteList`
      (AC-079), Token `switchOff` (AC-080).
- [ ] 28. Navigation und Darstellung angleichen (AC-081–AC-087).

**G — Abdeckung** (nach A–F, weil die Gruppen Code verschieben)

- [ ] 29. Logik aus `apps/app` nach `core` (AC-026, AC-027).
- [ ] 30. Komponententests in `ui` (AC-028, AC-029), Test für `startAuth` (AC-030).
- [ ] 31. `vitest.config.ts` mit Coverage für `core`, `api` und `ui`, Schwelle 80 %, `21-testing.md`
      (AC-015–AC-017).
- [ ] 32. Vertragstest Fake gegen DB (AC-059).

**H — Weg zur Veröffentlichung** (zuletzt, vor 0028, Schritt 4)

- [ ] 33. `migrations-base.json`, `migrations.mjs`, `supabase-guard.mjs`, `version.mjs` mit
      negativen Tests, Nachtrag zu ADR-0012 (AC-001–AC-005).
- [ ] 34. Job „e2e“ in `release.yml` mit Shards und manuellem Lauf, `workflows.test.mjs`, Nachtrag
      in 0014 (AC-007–AC-010).
- [ ] 35. Runbook in `betrieb.md` (AC-018, AC-019), Nachträge in 0028 (AC-016, AC-005, Schritte).
- [ ] 36. Volle e2e-Suite lokal und im manuellen Lauf grün (AC-025), `/security-check` über den
      Diff der Gruppen A, C und H.
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün mit Coverage ≥ 80 % in
      `core`, `api` und `ui`, `pnpm exec supabase test db` und `pnpm test:integration` über das
      Schloss grün, `pnpm test:scripts` grün, `pnpm e2e` und `pnpm e2e:dev` grün.
