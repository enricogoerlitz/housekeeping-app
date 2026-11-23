---
status: freigegeben
datum: 2026-11-22
---

# 0028 — Aufräumen und erste produktive Version

**Quelle:** Enrico, 22.11.2026: Die Version nach den Specs 0019–0027 ist „die erste richtige
Version, die wir produktiv verwenden … sauberen Code und saubere DB-Strukturen …, ohne was komisch
workarounden … in Prod können wir zur Not auch noch alles droppen“. **Kritischer Pfad:** ja –
Migrationen, Löschen von Daten (Zurücksetzen der Produktion), Infrastruktur.

## Ziel

Nach den Specs 0019–0027 sieht der Stand so aus, als wäre er in einem Zug gebaut worden. Die
Datenbank hat eine saubere Migrationsbasis ohne tote Objekte. Im Code gibt es keine Altlasten. Die
volle e2e-Suite ist grün. Die Produktion läuft frisch auf dieser Basis, mit dem Haushalt „Enrico &
Nadja“ und funktionierender Sicherung. Danach gelten die Migrationsregeln ohne Ausnahme.

## Nicht-Ziele

- Keine neuen Funktionen. Was beim Aufräumen als Wunsch auffällt, kommt in eine neue Spec.
- Keine Übernahme von Daten aus v2026.11.1. Die Produktion enthält nur Testdaten (Enrico,
  22.11.2026).
- Keine nativen Apps (nur PWA).

## Anforderungen

### Datenbank

**REQ-001 — Neue Migrationsbasis.** Alle Migrationen bis zum Ende der Welle werden zu einer
sauberen Basis je Bereich zusammengefasst, wie bei ADR-0012. Der Zielstand jeder Tabelle steht in
einer Datei, ohne spätere `alter`-Schritte. Offline: –

- AC-001: Angenommen die Specs 0019–0027 sind auf `develop` · Wenn `supabase/migrations` neu
  aufgebaut ist · Dann gibt es je Bereich genau eine Migration, keine Datei ändert eine Tabelle
  einer früheren Datei, und `pnpm exec supabase test db` ist vollständig grün.
- AC-002: Angenommen die neue Basis · Wenn das Schema mit dem Stand vor dem Zusammenfassen
  verglichen wird (`supabase db diff` gegen eine Datenbank aus den alten Migrationen) · Dann gibt
  es keinen Unterschied außer den in REQ-002 entfernten Objekten.
- AC-003: Angenommen ein neuer Haushalt in der lokalen Datenbank · Wenn `pnpm db:reset` läuft ·
  Dann entstehen Seed-Daten und Einladung (`DEV_OWNER_EMAIL`) wie vorher.

**REQ-002 — Tote Objekte entfernen.** Was die Specs 0019–0027 unter „Entfällt“ nennen, ist aus
Datenbank, Code, Tests und Doku verschwunden. Offline: –

- AC-004: Angenommen die Liste „Entfällt“ aller Specs 0019–0027 (Sammlung unter „Daten“) · Wenn
  danach im Repository gesucht wird · Dann findet sich keiner der Namen mehr außer in Specs und
  ADRs als Geschichte.
- AC-005: Angenommen die neue Basis · Wenn ein Schema-Bericht unbenutzte Spalten, Funktionen,
  Grants und Indexe listet (Abgleich mit den Zugriffen in `packages/api` und den Funktionen) ·
  Dann ist jeder Treffer entfernt oder mit Grund in diese Spec eingetragen.
  _Nachtrag (Spec 0031, 23.11.2026):_ Schon entfernt durch eigene Migrationen vor dem
  Zusammenfassen (0031 REQ-013 bis REQ-017, Abschnitt „Daten“ dort): `*_stamp_restored`,
  `record_deletion` auf Mitgliedern und Einladungen samt Indexen, `profiles_email_idx`,
  `public.ai_usage` (jetzt `private.ai_usage`), `household_media_names` (jetzt
  `begin_household_deletion`), Grants auf `meal_slots`, `chore_events.chore_id` und
  `recipes.photo`.

### Code

**REQ-003 — Code-Review und Aufräumen.** Ein Review über den ganzen Code prüft Sauberkeit,
Schichten (`core` rein, `api` Datenzugriff, `ui` Bausteine), doppelte Logik, Benennung nach
Glossar, Testlücken und Lint-Regeln. Die Befunde werden behoben oder mit Grund hier vermerkt.
Offline: –

- AC-006: Angenommen das Review ist gelaufen · Wenn seine Befunde abgearbeitet sind · Dann steht
  jeder Befund hier unter „Risiken“ oder „Entscheidungen“ als behoben oder begründet offen.
- AC-007: Angenommen das Glossar nennt „Reise“ (`Trip`) und die übrigen Begriffe der Welle · Wenn
  im Code nach den alten Bezeichnern gesucht wird (`absence`, `Abwesenheit`, `urlaub`,
  `starter`, …) · Dann gibt es keinen Treffer außer in Tests, die genau das prüfen.
- AC-008: Angenommen der Stand nach dem Aufräumen · Wenn `pnpm format:check && pnpm check &&
pnpm build:web` läuft · Dann ist alles grün, ohne neue `eslint-disable` oder `@ts-expect-error`.

### Nachweis der Welle

**REQ-004 — Einmal alles prüfen.** Am Ende der Welle laufen die volle e2e-Suite und die
Sichtprüfung einmal über den ganzen Stand. Offline: –

- AC-009: Angenommen alle Specs der Welle sind gemergt · Wenn `pnpm e2e` und `pnpm e2e:dev` lokal
  laufen · Dann sind beide grün; rote Fälle sind behoben, nicht übersprungen.
- AC-010: Angenommen derselbe Stand · Wenn `/ui-verify` für Handy, Tablet und Desktop in hell und
  dunkel läuft · Dann sind die Befunde behoben oder hier begründet.
- AC-011: Angenommen die kritischen Pfade der Welle (0021, 0022, 0023, 0024, 0025, 0026, 0027) ·
  Wenn `/security-check` über den Diff der Welle läuft · Dann gibt es keinen offenen Befund
  „kritisch“ oder „hoch“.

### Produktion

**REQ-005 — Probe in der Vorschau.** Das Zurücksetzen und Neuaufsetzen wird zuerst an der
Vorschau geübt, mit demselben Skript und denselben Schritten wie später in der Produktion.
Offline: –

- AC-012: Angenommen die Vorschau läuft auf v2026.11.1-Schema · Wenn das Skript sie zurücksetzt,
  die neue Basis einspielt und den Haushalt anlegt · Dann melden sich Enrico und Nadja dort an,
  Benachrichtigungen kommen an, und der Planer läuft fehlerfrei.
  _Nachtrag (Spec 0031, P-2, 23.11.2026):_ Reihenfolge in der Vorschau: Skript, dann `preview.yml`
  (spielt die Migrationen ein und legt Testhaushalte und Einladungen an). Push ist in der Vorschau
  aus (Spec 0014, Entscheidung 8); Benachrichtigungen werden erst in der Produktion geprüft.

**REQ-006 — Produktion frisch aufsetzen.** Die Produktion wird zu einem Zeitpunkt, den Enrico
bestätigt, zurückgesetzt und auf der neuen Basis neu aufgesetzt. Offline: –

- AC-013: Angenommen Enrico hat den Zeitpunkt bestätigt und eine letzte Sicherung liegt in Azure ·
  Wenn das Skript die Produktion zurücksetzt · Dann sind alle Haushaltsdaten und Fotos gelöscht,
  die Migrationshistorie enthält nur die neue Basis, und Vault-Einträge sowie
  Anmelde-Einstellungen sind unverändert.
- AC-014: Angenommen die frische Produktion · Wenn `scripts/prod-bootstrap.mjs` läuft · Dann
  gibt es den Haushalt „Enrico & Nadja“ mit Einladung für Enricos Adresse, ohne Starter-Inhalte.
- AC-015: Angenommen das Skript läuft gegen ein Projekt, dessen Kennung nicht die der Produktion
  bzw. der Vorschau ist, die der Aufruf nennt · Wenn es startet · Dann bricht es vor jeder Änderung
  ab.

**REQ-007 — Alte Geräte.** Installierte Web-Apps mit v2026.11.1 laden die neue Version, bevor sie
schreiben. Offline: offline lesend; der alte Stand im Gerät wird verworfen.

- AC-016: Angenommen ein iPhone mit installierter v2026.11.1 · Wenn es nach der Veröffentlichung
  öffnet · Dann sieht es „Neue Version verfügbar“ (`min_app_version`, Spec 0014), lädt neu, und
  `CACHE_VERSION` leert den lokalen Speicher samt Warteschlange.
  _Nachtrag (Spec 0031, REQ-001, Entscheidung 3, 23.11.2026):_ Die neue Basis setzt
  `min_app_version` auf „2026.11.2“. Das ist mehr als ein Hinweis: Bis zum Neuladen sperrt
  `VersionGate` das Schreiben, und `redeploy-web.yml` lehnt v2026.11.1 ab (0031 AC-006).

**REQ-008 — Veröffentlichung und Sicherung.** Die Version geht über den normalen Freigabeweg nach
`main`, und Sicherung sowie Wiederherstellungstest laufen auf der neuen Basis. Offline: –

- AC-017: Angenommen der Release-PR `develop` → `main` · Wenn Enrico ihn zusammenführt · Dann
  läuft `release.yml` grün durch und taggt die Version.
- AC-018: Angenommen die erste nächtliche Sicherung nach der Veröffentlichung · Wenn
  `restore-test.yml` läuft · Dann stellt er sie in einer leeren Datenbank vollständig her.

## Entscheidungen

1. **Zusammenfassen erst am Ende der Welle.** Während 0019–0027 entstehen neue Migrationsdateien.
   Das Zusammenfassen passiert einmal, wenn alle gemergt sind. Sonst müsste jede Spec die Basis
   neu schreiben, und die Specs kämen sich in die Quere.
2. **ADR-0012 bekommt einen Nachtrag** („Zweiter Neuaufbau vor der produktiven Version“) statt
   einer neuen ADR. Die Regel „eine eingespielte Migration wird nie geändert“ gilt ab dieser
   Veröffentlichung ohne Ausnahme. `.claude/rules/30-database.md` und der Skill `db-change` werden
   angepasst.
3. **Zurücksetzen nur der App-Daten.** Gelöscht werden die Schemas `public` und `private`, die
   Objekte im Fotospeicher und die Migrationshistorie. Vault-Einträge (Push-Konfiguration),
   Auth-Einstellungen und Function-Secrets bleiben. Ob bestehende Konten in `auth.users` bleiben,
   entscheidet die Probe in der Vorschau (REQ-005). Empfehlung: Konten bleiben, Haushalt und
   Einladung entstehen neu.
4. **Ein Skript für Vorschau und Produktion** (`scripts/reset-app-data.mjs`). Es nimmt die
   Projektkennung als Pflichtangabe, vergleicht sie mit dem verlinkten Projekt und fragt vor dem
   Löschen nach dem Projektnamen. Kein Secret im Aufruf oder in der Ausgabe.
   _Nachtrag 23.11.2026:_ Jeder Befehl nennt das Projekt ausdrücklich (`--remote=<ref>`), ein
   `supabase link` ist nicht nötig; ein anders verlinktes Projekt bricht ab. In CI und ohne Terminal
   bricht es ab (Security-Check 0031). Die Daten löscht eine einzige Anweisung (eine Transaktion);
   Konten, Vault und Function-Secrets bleiben (Empfehlung aus Entscheidung 3 übernommen).
5. **Code-Review:** Enrico kann `/code-review ultra` selbst starten (kostenpflichtig, nur durch
   ihn). Tut er das nicht, läuft `/code-review` je Paket auf Stufe „high“.
6. **Alte Sicherungen** (Schema v2026.11.1) bleiben in Azure, bis die erste Sicherung auf der neuen
   Basis den Wiederherstellungstest bestanden hat. Danach gilt die normale Aufbewahrung.
7. ~~OFFEN: Zeitpunkt des Zurücksetzens der Produktion~~ – bestätigt am 23.11.2026, 22:07.
8. **Weg D statt Zusammenfassen (Entscheidung des Inhabers, 23.11.2026):** Die Produktion wird
   nicht neu aufgebaut, sondern nur geleert (`reset-app-data.mjs --data-only`: alle Tabellen in
   `public` und `private` außer Profilen und Push-Geräten, dazu die Fotos). Schema, Aufträge und
   Migrationshistorie bleiben; das normale Release spielt die neuen Migrationen oben drauf.
   Damit sind REQ-001 (neue Basis), AC-012 (Probe des Neuaufbaus) und die Mindestversion 2026.11.2
   aus REQ-007 **verworfen**: Die Migrationshistorie bleibt bei 34 Dateien, die Mindestversion bei
   2026.11.1 (eure Geräte laden einmal neu). Grund: dasselbe Schema am Ende, weniger Schritte und
   Risiko, heute produktiv. Die Ausnahme `migrations-base.json` wird nicht benutzt.

## Daten

Entfällt in der Produktion: alle Haushaltsdaten und Fotos aus v2026.11.1 (Testdaten). Die
gesammelten „Entfällt“-Listen der Specs 0019–0027 (Stand der Planung; maßgeblich bleibt der
Abschnitt „Daten“ jeder Spec):

- 0019: `focusRing`, Stores des Listen-Moduls, alte Parameternamen (`view`, `rid`, …).
- 0020: `not_cooked` (→ `not_done`), `weekNav`, `dayTile`, `CalendarButton`, doppelte
  Kennzeichen-Tabellen.
- 0021: `remind_minutes_before`, `reservation_reminders_enabled`,
  `reservation_reminder_candidates`, Art `reservation_reminder`, `note_only_activity`; Code
  `REMIND_CHOICES`, `setReservation`, `too-far`.
- 0022: Tabelle `absences` (→ `trips`, `trip_members`), `packing_list_bags_recalc`,
  `planAbsenceWrite` samt Umhängen der Packliste, Route `/kalender/reise/<id>`, `TripScreen`.
- 0023: `recipes.source`, Starter-Rezepte in Code, Daten und Tests, doppeltes „Neu“-Menü
  (`recipes-screen.tsx`, `restaurants-panel.tsx`).
- 0024: `activities.tags`, direktes Löschrecht auf Restaurants und Aktivitäten,
  `recipe_deletions` (→ `private.deletions`); Code `ManageEntry.pathPrefix`, `von=verwalten`,
  alte Kalender-Routen der Aktivitäten, Inline-Notizfeld.
- 0025: `recurring`, `searchArticles`, `QUICK_ADD`, zweiter Bereichswähler, Zweig „Abhaken
  zurücknehmen und zusammenführen“.
- 0026: siehe dort unter „Daten → Entfällt“.
- 0027: `household_invitations.accepted_at`, Wieder-Öffnen in `invite_member`, Feedback-Grants
  auf `status`/`reason`/`spec_ref`, `parseTimeInput` mit `TIME_ERRORS`, `timeFieldA11yValue`,
  `kindsSectionTitle`.

## Risiken

| Risiko                                              | Gegenmaßnahme                                                                  | Test                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------- |
| Falsches Projekt wird zurückgesetzt                 | Pflichtangabe der Kennung, Abgleich mit dem verlinkten Projekt, Namensabfrage  | AC-015, Probe in der Vorschau           |
| Basis weicht vom gebauten Schema ab                 | `db diff` gegen die alten Migrationen, volle pgTAP-Suite                       | AC-002, AC-001                          |
| Vault oder Secrets gehen beim Zurücksetzen verloren | nur `public`, `private`, Fotos und Migrationshistorie löschen                  | AC-013, Benachrichtigung nach der Probe |
| Alte App schreibt in das neue Schema                | Weg D: Produktion leer, Geräte laden einmal neu; `CACHE_VERSION` erhöht (0031) | AC-016, 0031 AC-005                     |
| Sicherung lässt sich nicht wiederherstellen         | Wiederherstellungstest vor dem Löschen alter Sicherungen                       | AC-018                                  |
| Aufräumen entfernt etwas, das noch genutzt wird     | Suche über alle Pakete, volle Tests, e2e-Suite                                 | AC-004, AC-008, AC-009                  |

## Umsetzung

- [x] 1. Liste „Entfällt“ aus 0019–0027 hier eintragen (AC-004; beim Bau gegen die Specs prüfen)
- [x] 2. Tote Objekte in Datenbank und Code entfernen (AC-004, AC-005, AC-007) – durch die Specs
      0019–0027 und 0031 (REQ-013–REQ-017); Suche am 23.11.2026: die Namen aus „Daten“ stehen in
      `apps`, `packages` und `scripts` nur noch in Tests, die ihr Fehlen prüfen
- [x] 3. Code-Review, Befunde beheben (AC-006, AC-008) – Spec 0031
- [x] 4. ~~Migrationen zu neuer Basis zusammenfassen, ADR-0012-Nachtrag, Regeln anpassen
      (AC-001–AC-003)~~ – verworfen durch Entscheidung 8 (Weg D)
- [x] 5. Volle e2e-Suite, `/ui-verify`, `/security-check` über die Welle (AC-009–AC-011) – Spec
      0031 (Gruppen F und H); volle e2e-Suite in `release.yml` grün
- [x] 6. Skript `reset-app-data.mjs`, Probe in der Vorschau (AC-012, AC-015) – mit `--data-only`
      in der Vorschau geprobt (#64); AC-012 verworfen (Entscheidung 8)
      _Stand 23.11.2026:_ Skript mit Tests fertig (`reset-app-data.test.mjs`: Kennung, CI/Terminal,
      verlinktes Projekt, Inhalt der Anweisung). Lokal geprobt: Skript-SQL gegen die lokale
      Datenbank, danach alle Tabellen, Funktionen, `private`, Aufträge und Historie weg, Konten und
      Vault da; `supabase migration up` spielt alle Migrationen wieder ein, pgTAP grün (nach
      `db:reset` mit Seed). Offen: Probe in der Vorschau mit dem Inhaber (braucht `supabase login`).
- [x] 7. Mit Enrico: Zeitpunkt, letzte Sicherung, Produktion zurücksetzen, Bootstrap (AC-013, AC-014)
- [x] 8. `min_app_version`, Release-PR, Veröffentlichung (AC-016, AC-017) – Mindestversion bleibt
      2026.11.1 (Entscheidung 8)
- [ ] 9. Wiederherstellungstest auf der neuen Basis (AC-018)
      _Nachtrag (Spec 0031, 23.11.2026):_ Schritt 3 ist Spec 0031 (Ultracode-Code-Review). Schritt 4
      legt zusätzlich `supabase/migrations-base.json` an (`replaces: "v2026.11.1"`, `first` = erste
      Version der neuen Basis). Damit lassen der Check „Migrationen“, der Supabase-Wächter und
      `version.mjs` die neue Basis einmal zu (0031 REQ-001). Schritt 8 setzt `min_app_version` in der
      neuen Basis auf „2026.11.2“. Die Reihenfolge der Schritte 6 bis 9 steht als Runbook in
      `docs/architecture/betrieb.md`, Abschnitt „Erste produktive Version (0028)“.

- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web`, `pnpm exec supabase test db`,
      `pnpm e2e`, `pnpm e2e:dev` grün
      _Stand 23.11.2026 (Weg D):_ Sicherung `backup.yml` 45273513499 grün. Produktion mit
      `reset-app-data.mjs --data-only` geleert: 0 Haushalte, Profile, 5 Aufträge und der Fotospeicher
      blieben. Release-PR #65 mit Merge-Commit nach `main`; `release.yml` 45276859535 grün (Checks,
      e2e 6 Shards und dev, Sicherung, Supabase, Web, Prüfung von außen), Tag `v2026.11.2`.
      `house.kuschel-nest.de/version.json` meldet 2026.11.2. `prod-bootstrap.mjs`: Haushalt
      „Enrico & Nadja“, Einladung, Startbereiche und Artikelkatalog (keine Starter-Rezepte, 0023)
      angelegt. Offen: Schritt 9 nach der ersten Nachtsicherung.
