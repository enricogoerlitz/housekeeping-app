# Betrieb: Auslieferung, Sicherung, Notfall

> Entscheidung: [ADR-0015](../adr/0015-auslieferung-und-betrieb.md). Anforderungen und Begründungen:
> [Spec 0014](../specs/0014-betrieb-ci-cd-release/spec.md), Befehle der Ersteinrichtung:
> [Plan 0014](../specs/0014-betrieb-ci-cd-release/plan.md), Abschnitt „Runbook“ (B0 bis B7 für den
> Lead, C1 bis C11 für Enrico). Dieses Dokument beschreibt den Betrieb danach: Alltag, erneute
> Auslieferung, Notfall, Schlüsselwechsel und Ablaufdaten.

Kein Befehl hier gibt ein Secret aus. Geheime Werte gibt Enrico selbst ein:
`gh secret set NAME --env <umgebung>` fragt den Wert verdeckt ab. Platzhalter: `<prod-ref>` und
`<preview-ref>` (Projekt-Refs, nur lokal ablesen), `<Version>` im Format `JJJJ.M.N`.

```sh
R=enricogoerlitz/housekeeping-app
RG=rg-housekeeping-app-weu-prd
ST=sthousekeepingbkpger
```

## Stand der Einrichtung (21.11.2026)

| Teil                     | Stand                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zweige                   | `develop` ist der Standard-Zweig; `main` ist immer auslieferbar                                                                                                                                                                                                                                                                                                                    |
| GitHub-Umgebungen        | `preview` (nur Zweig `develop`), `production`, `backup`, `restore-test` (je nur Zweig `main`)                                                                                                                                                                                                                                                                                      |
| Static Web Apps          | `swa-housekeeping-app-prd` (Produktion) und `swa-housekeeping-app-preview` (Vorschau), beide Tarif Free in **East US 2** (West Europe am 21.11.2026 erneut abgelehnt; dort liegen nur App-Dateien), beide ohne Staging-Umgebungen (`Disabled`)                                                                                                                                     |
| Web-Adressen             | Produktion `https://house.kuschel-nest.de` (Variable `PRODUCTION_WEB_ORIGIN`), Vorschau `https://test.house.kuschel-nest.de` (Variable `PREVIEW_WEB_ORIGIN`)                                                                                                                                                                                                                       |
| Alte Adressen            | `https://brave-bush-089e7a80f.6.azurestaticapps.net` (Produktion) und die `azurestaticapps.net`-Adresse der Vorschau: leitet um (Variablen `PRODUCTION_OLD_WEB_ORIGIN`, `PREVIEW_OLD_WEB_ORIGIN`), siehe [Eigene Domain als Standard](#eigene-domain-als-standard)                                                                                                                 |
| Storage für Sicherungen  | `sthousekeepingbkpger` in **Germany West Central** (West Europe abgelehnt), Container `backups`, Unveränderlichkeit 30 Tage (**noch nicht gesperrt**, siehe [unten](#unveränderlichkeit-sperren)), Lebenszyklus aus `infra/azure/backup-lifecycle.json`                                                                                                                            |
| Eigene Rollen            | „Housekeeping SWA Deploy Token Reader“ (je an einer SWA), „Housekeeping Backup Writer“ (am Container); Vorlagen in `infra/azure/`                                                                                                                                                                                                                                                  |
| Identitäten (Azure)      | `id-housekeeping-web-prd`, `id-housekeeping-web-preview`, `id-housekeeping-backup`, `id-housekeeping-restore` in Germany West Central, je mit föderierten Anmeldedaten für genau eine GitHub-Umgebung                                                                                                                                                                              |
| Budget                   | 10 € im Monat, E-Mail bei 80 % und 100 %                                                                                                                                                                                                                                                                                                                                           |
| GitHub-Variablen gesetzt | `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_CLIENT_ID` (je Umgebung), `SWA_NAME` (je Umgebung), `SWA_RESOURCE_GROUP`, `BACKUP_STORAGE_ACCOUNT`, `PRODUCTION_WEB_ORIGIN`, `PREVIEW_WEB_ORIGIN`                                                                                                                                                                               |
| Noch offen               | `SUPABASE_PROJECT_REF` (je Umgebung) und Runbook B5: die Supabase-CLI ist noch nicht angemeldet, beides macht Enrico. Dazu C1 bis C11 (Secrets, Google, Push, Sicherung) und B7 (Rulesets). Spec 0027: eigene Domain als Standard in beiden Static Web Apps und die Variablen `PRODUCTION_OLD_WEB_ORIGIN`, `PREVIEW_OLD_WEB_ORIGIN` (Enrico, [unten](#eigene-domain-als-standard)) |

## Zweige und Schutz

```mermaid
flowchart LR
  F["feat/… · fix/… · …"] -->|PR, Squash| D[develop]
  D -->|Vorschau-Lauf| V[Vorschau]
  D -->|Release-PR, Merge-Commit| M[main]
  H["hotfix/…"] -->|PR, Merge-Commit| M
  M -->|Veröffentlichung| P[Produktion]
  M -.->|nach Hotfix: Rückführung| D
```

Die Rulesets liegen als Dateien in `infra/github/` und gelten auch für Enrico. Umgehen darf nur die
GitHub-Actions-App das Tag-Ruleset, damit die Veröffentlichung ihren Tag anlegt (ADR-0015, Nachtrag
2026-11-23):

| Datei                  | Gilt für  | Regeln                                                                                          |
| ---------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| `ruleset-develop.json` | `develop` | nur per PR (Squash oder Merge-Commit), Pflicht-Checks grün, kein Force-Push, kein Löschen       |
| `ruleset-main.json`    | `main`    | nur per PR (nur Merge-Commit), Pflicht-Checks grün, kein Force-Push, kein Löschen               |
| `ruleset-tags.json`    | Tags `v*` | nicht von Hand anlegen, nicht verschieben, nicht löschen; anlegen darf nur die Veröffentlichung |

Pflicht-Checks sind die Jobnamen aus `.github/workflows/checks.yml` ohne „Änderungen“:
`Konventionen`, `Geheimnisse`, `Migrationen`, `Prüfungen`, `Datenbank (pgTAP)`,
`Integration (API)` (Spec 0031, REQ-004), `Deno-Lock`, jeweils nur von GitHub Actions erfüllbar (`integration_id` 15368). „Up to date“ wird nicht
verlangt; Freigaben (Reviews) auch nicht, weil es nur einen Besitzer gibt. Ein Jobname und die
Rulesets ändern sich immer zusammen; `scripts/ci/workflows.test.mjs` prüft das. Nach jedem Merge
nach `develop` laufen dieselben Checks noch einmal auf dem Merge-Commit, je Commit in einer eigenen
Gruppe, ohne Abbruch (Spec 0031, AC-011). Ein roter Lauf dort heißt: Die Kombination zweier PRs ist
kaputt, der nächste Fix geht per PR.

Die E2E-Suiten (`pnpm e2e` in sechs Shards und `pnpm e2e:dev`) laufen nicht in Pull Requests,
sondern als blockierender Job „e2e“ in `release.yml` und von Hand mit
`gh workflow run e2e.yml --ref develop` (Spec 0031, REQ-002). Ein roter Shard verhindert Sicherung,
Auslieferung und Tag.

```sh
# Anlegen (einmal, Runbook B7)
for f in ruleset-develop ruleset-main ruleset-tags; do gh api -X POST "repos/$R/rulesets" --input "infra/github/$f.json"; done
# Nach einer Änderung der Dateien: ID ablesen, dann ersetzen
gh api "repos/$R/rulesets" --jq '.[] | [.id, .name, .enforcement] | @tsv'
gh api -X PUT "repos/$R/rulesets/<id>" --input infra/github/ruleset-develop.json
```

Bevor `ruleset-tags.json` mit `creation` und der Ausnahme für GitHub Actions ersetzt wird (Spec
0031, AC-020), wird es in einem Test-Repository geprüft: Ein von Hand gepushter Tag `v2026.12.9`
wird abgelehnt, und ein Workflow mit `contents: write` legt mit `gh release create` seinen Tag
trotzdem an. Erst dann `gh api -X PUT` auf das Tag-Ruleset dieses Repositorys.

## Alltag

### Feature oder Fix

```sh
git switch -c feat/NNNN-slug origin/develop
# … arbeiten, committen …
git push -u origin feat/NNNN-slug
gh pr create --base develop --title "feat: …"   # Beschreibung mit „Spec: NNNN“ (Vorlage)
```

Nach grünen Checks mit **„Squash and merge“** zusammenführen. Die Oberfläche schlägt auf `develop`
die zuletzt gewählte Art vor; für Feature-PRs immer Squash wählen. `develop` sammelt die Arbeit; die Vorschau startet
nicht mehr von selbst (seit 22.11.2026). Wer den Stand von `develop` auf
https://test.house.kuschel-nest.de sehen will, startet sie von Hand:

```sh
gh workflow run preview.yml --ref develop
```

Sie baut die Vorschau neu auf (frische Beispieldaten, kein Testkonto). Zum Ausprobieren reicht oft
der lokale Stand (`pnpm dev`).

### Freigabe (Veröffentlichung)

```sh
gh pr create --base main --head develop --title "chore: Veröffentlichung"
```

Nach grünen Checks mit **„Create a merge commit“** zusammenführen (auf `main` die einzige Art).
`release.yml` läuft dann ohne weiteren Handgriff: Version und Änderungsliste, Web bauen,
Supabase prüfen und e2e, Pakete prüfen, Sicherung, Supabase ausliefern, Web ausliefern, Prüfung von außen,
Tag `v<Version>` und GitHub-Veröffentlichung. Liegen seit dem letzten Tag nur Dokumentation und
Agent-Einstellungen vor, gibt es keine Veröffentlichung; von Hand erzwingen lässt sie sich mit
`gh workflow run release.yml --ref main -f erzwingen=true` (etwa nach einer Wiederherstellung, siehe
[Notfall](#notfall-wiederherstellen), Schritt 6).

Ist ein Lauf rot: die Fehlermeldung im Lauf lesen, beheben (Hotfix oder PR nach `develop` und neue
Freigabe). Scheitert nur ein Schritt nach „Supabase ausliefern“ (z. B. Web ausliefern), reicht
„Re-run failed jobs“: Migrationen sind abwärtsverträglich (expand → migrate → contract).
Ausnahme: die erste produktive Version, siehe [unten](#erste-produktive-version-0028).

### Hotfix

```sh
git fetch origin && git switch -c hotfix/<slug> origin/main
# … Fix, Test …
git push -u origin hotfix/<slug>
gh pr create --base main --title "fix: …"
```

Nach grünen Checks mit „Create a merge commit“ zusammenführen. Nach der Veröffentlichung legt der
Job `rueckfuehrung` den Zweig `chore/rueckfuehrung-v<Version>` an, öffnet die PR
„chore: main nach develop zurückführen“, startet ihre Checks und führt sie bei Grün per
Merge-Commit zusammen.

### Rückführung mit Konflikt

Bleibt die Rückführungs-PR offen und der Job rot (GitHub schickt eine E-Mail), hat der Hotfix
dieselben Zeilen geändert wie etwas, das nur auf `develop` liegt:

```sh
git fetch origin
git switch chore/rueckfuehrung-v<Version>
git merge origin/develop          # Konflikte lösen, Tests laufen lassen
git commit && git push
```

Dann die PR nach grünen Checks mit **„Create a merge commit“** zusammenführen, nie per Squash, sonst
fehlt `develop` die Historie von `main` und die nächste Release-PR hat Konflikte.

## Web erneut ausliefern

Liefert das Web-Paket einer früheren Veröffentlichung erneut aus, ohne Supabase zu ändern (z. B.
nach einem versehentlich überschriebenen Stand). Abgelehnt wird ein Tag unter der Mindestversion
der Produktion, und solange eine Veröffentlichung wartet oder läuft (dann danach erneut starten):
GitHub hält je Gruppe nur einen wartenden Lauf und ersetzt ihn durch einen neueren. Aus demselben
Grund ersetzt ein zweiter Push auf `main` einen noch wartenden ersten; dann nach dem Lauf
`gh workflow run release.yml --ref main` starten, damit nichts liegen bleibt (Spec 0031, P-1).

```sh
since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gh workflow run redeploy-web.yml --ref main -f tag=v<Version>
sleep 15
id="$(gh run list --workflow redeploy-web.yml --event workflow_dispatch --limit 20 --json databaseId,createdAt \
  --jq "[.[] | select(.createdAt >= \"$since\")] | sort_by(.createdAt) | last | .databaseId // empty")"
gh run watch "$id" --exit-status
```

Das Paket enthält die Supabase-Adresse von damals; nach einem Wechsel des Supabase-Projekts hilft
das nicht (siehe Notfall, Schritt 6).

## Eigene Domain als Standard

Spec 0027, REQ-011: Die eigene Domain ist in beiden Static Web Apps Standard, sodass die
`azurestaticapps.net`-Adresse dauerhaft (301 oder 308) auf dieselbe Seite der eigenen Domain
umleitet. `az staticwebapp hostname` kennt kein „Standard setzen“; der Schritt geht im Portal und
macht Enrico:

1. Azure-Portal → `swa-housekeeping-app-prd` → „Benutzerdefinierte Domänen“ → `house.kuschel-nest.de`
   → „Als Standard festlegen“.
2. Dasselbe in `swa-housekeeping-app-preview` mit `test.house.kuschel-nest.de`.
3. Die alten Adressen als GitHub-Variablen setzen (keine Secrets):
   `gh variable set PRODUCTION_OLD_WEB_ORIGIN --env production --body https://brave-bush-089e7a80f.6.azurestaticapps.net -R "$R"`
   und `gh variable set PREVIEW_OLD_WEB_ORIGIN --env preview --body https://victorious-island-00341950f.3.azurestaticapps.net -R "$R"`.
   Erst nach Schritt 1 und 2 setzen: Ab dann prüft jeder Lauf die Umleitung.
4. Prüfen (gibt nur Statuszeile und Ziel aus, kein Secret):

```sh
curl -sI https://brave-bush-089e7a80f.6.azurestaticapps.net/kalender | grep -i -E '^(HTTP|location)'
curl -sI https://house.kuschel-nest.de/ | grep -i '^HTTP'
```

Erwartet: `HTTP/2 301` oder `308` mit `location: https://house.kuschel-nest.de/kalender`, die eigene
Domain antwortet mit `200`. Jeder Lauf von Veröffentlichung, Vorschau und erneuter
Web-Auslieferung prüft das (`verify.mjs --old-origin`, Prüfung „Alte Adresse“); antwortet die alte
Adresse mit `200`, ist der Lauf rot mit „Alte Adresse leitet nicht um“. Solange die Variable fehlt,
entfällt nur diese Prüfung; der übrige Lauf ist davon nicht betroffen. Supabase lässt als Rücksprung schon nur die eigenen Domains zu
(`supabase/config.toml`).

## Neue Person einladen

Spec 0027, REQ-002: Die Google-Anmeldung steht auf „Testen“ (Enricos Entscheidung zu X-08). Wer
neu dazukommt, braucht deshalb zwei Einträge:

1. In der App einladen: „Verwalten“ → „Haushalt & Mitglieder“ → „Einladen“.
2. Google Cloud Console → „Google Auth Platform“ → „Zielgruppe“ → „Testnutzer“ → Adresse hinzufügen.
   Das kann nur Enrico als Inhaber des Projekts.
3. Danach meldet sich die Person mit Google an und nimmt die Einladung an.

Fehlt der Eintrag bei Google, zeigt Google beim Anmelden seine Seite „Zugriff blockiert“ mit
„Fehler 403: access_denied“; die App erfährt davon nichts. Späteres Eintragen genügt, die Einladung
bleibt offen. Google erlaubt höchstens 100 Testnutzer.

## Erste Anmeldung in einer leeren Produktion

Einmal nach der ersten Veröffentlichung (Runbook C11) und nach einer Neuanlage ohne Daten. Das
Skript fragt die Google-Adresse verdeckt ab, legt den Haushalt „Enrico & Nadja“ mit den
Standard-Tageszeiten und eine Einladung an, falls sie fehlen, und gibt nur aus, wie viel es angelegt
hat (`1` = angelegt, `0` = war schon da):

Die Arbeitskopie bleibt nie mit der Produktion verlinkt, auch wenn das Skript scheitert oder
abgebrochen wird (`trap`):

```sh
(trap 'pnpm exec supabase unlink' EXIT; pnpm exec supabase link --project-ref "<prod-ref>" && node scripts/prod-bootstrap.mjs)
```

Danach auf der Web-Adresse mit Google anmelden, die Einladung annehmen und Nadja in der App
einladen. Ein zweiter Lauf legt nichts an.

## Erste produktive Version (0028)

Einmalig für die erste produktiv genutzte Version (Spec 0028, Schritte 6 bis 9). Die Produktion
enthält bis dahin nur Testdaten. Sie wird zurückgesetzt und läuft danach auf der neuen
Migrationsbasis, die die Migrationen von v2026.11.1 ersetzt (`supabase/migrations-base.json`,
[ADR-0012, Nachtrag 23.11.2026](../adr/0012-neuaufbau-der-migrationen-vor-der-ersten-auslieferung.md)).
Den Zeitpunkt bestätigt Enrico. Die Schritte laufen genau in dieser Reihenfolge, jeder erst, wenn der
vorige grün ist:

1. **Probe in der Vorschau** (Spec 0028, AC-012; Reihenfolge nach Spec 0031, P-2). Das Skript setzt
   die Vorschau zurück, `preview.yml` spielt die Migrationen (dann die neue Basis) ein und legt die
   Testhaushalte aus `preview-seed.sql` und die Einladungen an. Push bleibt in der Vorschau aus
   (Entscheidung 8 von Spec 0014); Benachrichtigungen werden erst in der Produktion geprüft:

   ```sh
   node scripts/reset-app-data.mjs --project "<preview-ref>"
   gh workflow run preview.yml --ref develop
   ```

   Danach melden sich Enrico und Nadja auf der Vorschau an, und der Planer läuft fehlerfrei.

2. **Sicherung von Hand.** Die letzte Sicherung der alten Produktion. Sie bleibt in Azure, bis der
   Wiederherstellungstest auf der neuen Basis grün ist (Spec 0028, Entscheidung 6):

   Erst weiter, wenn **dieser** Lauf grün ist. `gh run list` direkt nach dem Start findet sonst
   leicht den vorigen Lauf, und `gh run watch` ohne `--exit-status` meldet auch Rot als Erfolg:

   ```sh
   since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   gh workflow run backup.yml --ref main
   sleep 15
   id="$(gh run list --workflow backup.yml --event workflow_dispatch --limit 20 --json databaseId,createdAt \
     --jq "[.[] | select(.createdAt >= \"$since\")] | sort_by(.createdAt) | last | .databaseId // empty")"
   gh run watch "$id" --exit-status
   ```

3. **Release-PR grün.** Vorher `develop` mit der vollen e2e-Suite prüfen, dann die Release-PR öffnen,
   aber **noch nicht zusammenführen**:

   ```sh
   since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   gh workflow run e2e.yml --ref develop
   sleep 15
   id="$(gh run list --workflow e2e.yml --event workflow_dispatch --limit 20 --json databaseId,createdAt \
     --jq "[.[] | select(.createdAt >= \"$since\")] | sort_by(.createdAt) | last | .databaseId // empty")"
   gh run watch "$id" --exit-status
   gh pr create --base main --head develop --title "chore: Veröffentlichung"
   ```

   Schritt 4 erst nach einem grünen e2e-Lauf: Ein roter e2e-Job in `release.yml` hielte die
   Produktion sonst nach dem Zurücksetzen ohne Schema fest.

4. **Produktion zurücksetzen** mit `scripts/reset-app-data.mjs` (Spec 0028, Schritt 6). Es läuft nur
   von Hand in einem Terminal, nie in CI (das Skript bricht dort ab; `conventions.mjs` verbietet es in
   Workflows, Spec 0031, AC-019). Es nimmt die Projektkennung als Pflichtangabe und richtet jeden
   Befehl ausdrücklich an dieses Projekt (`--remote=<ref>`, kein `supabase link` nötig); ist ein
   anderes Projekt verlinkt, bricht es ab. Vor dem Löschen fragt es nach dem Projektnamen (braucht
   `supabase login`). Gelöscht werden die Objekte in `public` und `private`, die pg_cron-Aufträge, die
   Migrationshistorie und die Fotos. Konten, Vault, Auth-Einstellungen und Function-Secrets bleiben:

   ```sh
   node scripts/reset-app-data.mjs --project "<prod-ref>"
   ```

5. **Release-PR zusammenführen** („Create a merge commit“). `release.yml` läuft mit e2e, Sicherung,
   Supabase-Wächter (leere Historie), neuer Basis und Web. Die Mindestversion 2026.11.2 sperrt Geräte
   mit v2026.11.1 für das Schreiben, bis sie neu laden.
6. **Bootstrap.** Wie in [Erste Anmeldung in einer leeren Produktion](#erste-anmeldung-in-einer-leeren-produktion):
   `node scripts/prod-bootstrap.mjs` legt den Haushalt „Enrico & Nadja“ und Enricos Einladung an.
7. **Wiederherstellungstest** nach der ersten Nachtsicherung auf der neuen Basis. Erst danach dürfen
   die alten Sicherungen ablaufen:

   ```sh
   gh workflow run restore-test.yml --ref main
   ```

8. **Aufräumen.** In einer PR nach `develop` `supabase/migrations-base.json` löschen. Mit dem neuen
   Tag ist die Ausnahme ohnehin verbraucht.

**Ausnahme vom Alltag:** Für dieses Release gilt „Re-run failed jobs, Migrationen sind
abwärtsverträglich“ (siehe [Freigabe](#freigabe-veröffentlichung)) **nicht**. Die neue Basis ist
nicht mit dem alten Schema verträglich. Scheitert ein Schritt nach „Supabase ausliefern“, erst den
Zustand der Produktion prüfen (`pnpm exec supabase migration list --linked`). Fehlt dort die neue
Basis ganz oder teilweise, das Projekt nach Schritt 4 erneut zurücksetzen und den Lauf neu starten.
Die Historie nie mit `migration repair` flicken.

## Sicherung und Wiederherstellungstest

- **Jede Nacht** (02:17 UTC) startet `schedule.yml` die Sicherung `backup.yml` auf `main`, **am
  Monatsersten** (04:47 UTC) den Wiederherstellungstest `restore-test.yml`. Vor jeder
  Veröffentlichung sichert `release.yml` zusätzlich nach `release/v<Version>/`.
- Ablage im Container `backups`: `daily/<JJJJ-MM-TT>/<Lauf>/`, `monthly/<JJJJ-MM>/<Lauf>/`,
  `release/v<Version>/<Lauf>/`, je mit `backup.tar.gz.age` und `manifest.json`. Tägliche und
  Release-Sicherungen bleiben 31 Tage, monatliche 366 Tage; jede ist 30 Tage unveränderlich.
- Inhalt des Archivs: `roles.sql`, `schema.sql`, `data.sql` (Datenbank) und `media/` (Fotos aus
  `household-media`). **Nicht enthalten** sind die Function-Secrets und die Vault-Einträge
  `push_send_secret` und `push_send_url`.
- Von Hand: `gh workflow run backup.yml --ref main` bzw. `gh workflow run restore-test.yml --ref main`.

### Unveränderlichkeit sperren

Erst nach dem ersten grünen Wiederherstellungstest (Plan, Task 14). Danach lässt sich die Frist nicht
mehr verkürzen und der Container nicht vor Ablauf löschen.

```sh
ETAG=$(az storage container immutability-policy show --account-name "$ST" -g "$RG" -c backups --query etag -o tsv)
az storage container immutability-policy lock --account-name "$ST" -g "$RG" -c backups --if-match "$ETAG"
```

### Zeitpläne wieder einschalten

GitHub schaltet Zeitpläne in öffentlichen Repos nach 60 Tagen ohne Aktivität ab und schickt vorher
eine E-Mail. Der Wiederherstellungstest wird rot, wenn die neueste Sicherung älter als 36 Stunden
ist („Sicherung zu alt“).

```sh
gh workflow enable schedule.yml
gh workflow run backup.yml --ref main
```

## Notfall: Wiederherstellen

Nie automatisch, immer Enricos Entscheidung. Erst lokal einspielen und prüfen, dann in ein **neues**
Supabase-Projekt; das alte bleibt bis zur Prüfung unangetastet. Arbeitsordner ist `tmp/restore/`
(git-ignoriert); er wird am Ende gelöscht, denn er enthält alle Daten unverschlüsselt.

**1. Sicherung wählen und laden** (mit dem eigenen Azure-Login; Enrico darf lesen):

```sh
mkdir -p tmp/restore/download tmp/restore/backup
az storage blob list --account-name "$ST" -c backups --prefix daily/ --auth-mode login -o table
F="daily/<Datum>/<Lauf>"   # oder monthly/… bzw. release/v<Version>/…
for file in backup.tar.gz.age manifest.json; do
  az storage blob download --account-name "$ST" -c backups --auth-mode login -n "$F/$file" -f "tmp/restore/download/$file" -o none
done
node scripts/backup/compare.mjs checksum --manifest tmp/restore/download/manifest.json --archive tmp/restore/download/backup.tar.gz.age
```

**2. Entschlüsseln** mit dem privaten Schlüssel aus dem Passwort-Manager (als Datei nur für diesen
Schritt):

```sh
age -d -i <Schlüsseldatei> tmp/restore/download/backup.tar.gz.age | tar -xz -C tmp/restore/backup
rm <Schlüsseldatei>
```

**3. Lokal einspielen und prüfen** (wie der Wiederherstellungstest; der lokale Stack des Repos
belegt dieselben Ports, deshalb vorher `pnpm exec supabase stop`):

```sh
mkdir -p tmp/restore/db && (cd tmp/restore/db && pnpm exec supabase init > /dev/null && pnpm exec supabase db start)
LOCAL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
(cd tmp/restore/backup && psql "$LOCAL" -X --single-transaction -v ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql > /dev/null)
node scripts/backup/compare.mjs query --manifest tmp/restore/download/manifest.json > tmp/restore/count.sql
psql "$LOCAL" -X -At -v ON_ERROR_STOP=1 -f tmp/restore/count.sql > tmp/restore/counts.txt
node scripts/backup/compare.mjs counts --manifest tmp/restore/download/manifest.json \
  --counts tmp/restore/counts.txt --media tmp/restore/backup/media
```

Stimmt alles, mit `psql "$LOCAL"` stichprobenartig nachsehen (`supabase db start` startet nur die
Datenbank, kein Studio), dann `(cd tmp/restore/db && pnpm exec supabase stop --no-backup)`.

**4. Neues Supabase-Projekt** (Dashboard, Region Frankfurt, Tarif Free). Free erlaubt zwei aktive
Projekte; sind beide belegt, zuerst das Vorschau-Projekt pausieren. Dann einspielen über den
Session-Pooler des neuen Projekts (Connect → „Session pooler“, Benutzer `postgres`):

```sh
read -rs DB_URL   # Verbindungs-URL mit Passwort einfügen, wird nicht angezeigt
(cd tmp/restore/backup && psql "$DB_URL" -X --single-transaction -v ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql > /dev/null)
unset DB_URL
```

Fotos: Storage → Settings → S3 Connection → neuen Schlüssel anlegen, dann mit dem Endpunkt des
neuen Projekts hochladen (die einzige Stelle, an der in Richtung Bucket synchronisiert wird):

```sh
read -rs AWS_ACCESS_KEY_ID; read -rs AWS_SECRET_ACCESS_KEY; export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
aws s3 sync tmp/restore/backup/media s3://household-media \
  --endpoint-url "https://<neue-ref>.storage.supabase.co/storage/v1/s3" --region "<Region aus S3 Connection>"
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
```

**5. Was die Sicherung nicht enthält, neu setzen** (Runbook C3 bis C8 im Plan, jeweils für das neue
Projekt):

- **Vault-Einträge `push_send_secret` und `push_send_url` müssen nach jeder Wiederherstellung neu
  gesetzt werden**, sonst stellt der Zeitplaner keine Benachrichtigungen zu. Im SQL-Editor des
  neuen Projekts: `select vault.create_secret('<PUSH_SEND_SECRET>', 'push_send_secret');` und
  `select vault.create_secret('https://<neue-ref>.supabase.co/functions/v1/push-send', 'push_send_url');`
  (gibt es sie schon, `vault.update_secret(<id>, '<Wert>')`). Der Wert von `push_send_secret` muss
  dem Function-Secret `PUSH_SEND_SECRET` entsprechen.
- Function-Secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_SEND_SECRET`
  (`supabase secrets set --env-file …`, Runbook C6). Dieselben VAPID-Schlüssel wie vorher behalten,
  dann bleiben die Push-Anmeldungen der Geräte gültig.
- Session-Pooler-Adresse des neuen Projekts (Benutzer `postgres.<neue-ref>`, Datenbank-Passwort) →
  `SUPABASE_POOLER_URL` in `production`.
- Neues eingeschränktes Zugangstoken → `SUPABASE_ACCESS_TOKEN` in `production`; Variablen
  `SUPABASE_PROJECT_REF` (`production`), `PRODUCTION_SUPABASE_URL`,
  `PRODUCTION_SUPABASE_PUBLISHABLE_KEY`.
- Google: Weiterleitungs-URI `https://<neue-ref>.supabase.co/auth/v1/callback` eintragen.
- Sicherung: Rolle `backup_reader` neu anlegen (Runbook C8), `BACKUP_DB_URL`, S3-Schlüssel,
  `BACKUP_S3_ENDPOINT` und `BACKUP_S3_REGION` in `backup`.
- Vor dem ersten Lauf gegen das neue Projekt `pnpm exec supabase migration list --remote` prüfen:
  Die Spalte „Remote“ muss alle Migrationen bis zum letzten Tag zeigen. Fehlt die Historie, nicht
  weitermachen und mit dem Lead klären; `supabase migration repair` nur mit einem im Plan
  genannten Grund (`.claude/rules/10-security.md`).

**6. Web neu bauen.** Das Web-Paket enthält die Supabase-Adresse; nach dem Wechsel braucht es eine
neue Veröffentlichung mit den neuen Variablen. `redeploy-web.yml` genügt dafür nicht. Ohne
Code-Änderung startet Enrico die Veröffentlichung von Hand mit der Eingabe `erzwingen`; sie läuft
wie jede andere (Sicherung, Migrationen, Konfiguration, Functions, Web, Prüfung) und bekommt die
nächste Version:

```sh
since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gh workflow run release.yml --ref main -f erzwingen=true
sleep 15
id="$(gh run list --workflow release.yml --event workflow_dispatch --limit 20 --json databaseId,createdAt \
  --jq "[.[] | select(.createdAt >= \"$since\")] | sort_by(.createdAt) | last | .databaseId // empty")"
gh run watch "$id" --exit-status
```

**7. Prüfen und aufräumen:** `verify.mjs` läuft mit der Veröffentlichung; zusätzlich mit beiden
Konten anmelden, Daten und Fotos ansehen, „Probe senden“. Dann `rm -rf tmp/restore`. Das alte
Projekt erst löschen, wenn alles stimmt.

## Schlüsselwechsel

Bei Verdacht auf Abfluss sofort, sonst zum Ablaufdatum. Immer: neuen Wert setzen, einen Lauf
abwarten, dann den alten widerrufen.

| Was                                                    | Wo neu setzen                                                                                                                                                                        | Alten widerrufen                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Supabase-Zugangstoken (ein Token für beide Umgebungen) | Account → Access Tokens, Einstellungen wie unter „Supabase-Zugangstoken: Einstellungen“, Ablauf 90 Tage → `gh secret set SUPABASE_ACCESS_TOKEN --env production` und `--env preview` | Access Tokens → altes löschen                                                                    |
| Google-Client-Secret                                   | Google Auth Platform → Client „Housekeeping Web“ → neues Secret → `GOOGLE_CLIENT_SECRET` in `production` und `preview`                                                               | nach der nächsten Veröffentlichung und Vorschau das alte deaktivieren                            |
| Deployment-Token einer SWA                             | `az staticwebapp secrets reset-api-key -n <SWA_NAME> -g "$RG"`; die Pipeline holt es zur Laufzeit                                                                                    | entfällt (das alte ist damit ungültig)                                                           |
| Push-Geheimnis `PUSH_SEND_SECRET`                      | `supabase secrets set PUSH_SEND_SECRET=…` und im SQL-Editor `vault.update_secret(<id von push_send_secret>, '<neu>')`                                                                | entfällt                                                                                         |
| VAPID-Schlüsselpaar                                    | nur bei Abfluss: `node scripts/push-keys.mjs --out …`, Function-Secrets, `PRODUCTION_VAPID_PUBLIC_KEY`, neue Veröffentlichung                                                        | entfällt; alle Geräte müssen Benachrichtigungen neu einschalten                                  |
| Passwort von `backup_reader`                           | SQL-Editor: `alter role backup_reader with password '<neu>';` → `BACKUP_DB_URL` in `backup`                                                                                          | entfällt                                                                                         |
| S3-Schlüssel Storage                                   | Storage → Settings → S3 Connection → neuer Schlüssel → `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`                                                                      | alten Schlüssel löschen                                                                          |
| Sicherungsschlüssel (`age`)                            | `age-keygen -o …` → `BACKUP_AGE_RECIPIENT` (`backup`), `BACKUP_AGE_IDENTITY` (`restore-test`)                                                                                        | **den alten privaten Schlüssel 12 Monate aufheben**: ältere Sicherungen sind damit verschlüsselt |
| Azure-Identitäten                                      | kein Schlüssel (OIDC); bei Verdacht die föderierte Anmeldung löschen und neu anlegen (Runbook B3, `ident`)                                                                           | `az identity federated-credential delete …`                                                      |

### Supabase-Zugangstoken: Einstellungen

Stand 22.11.2026. Ein Token für beide Umgebungen, Name `github-housekeeping-app-token`. Diese Seite
enthält keine Werte.

- **Ressourcenzugriff:** Organization, beide Organisationen (`housekeeping-prod`, `housekeeping-test`)
- **Ablauf:** 90 Tage
- **Berechtigungen:** Preset „Full access“

**Warum Full access:** Eine eingeschränkte Auswahl scheiterte im ersten Vorschau-Lauf zweimal an
Rechten, die die CLI erst beim Ausführen meldet (`infra_add_ons_read`, dann `project_admin_write`
bei `config push`). Eine vollständige Minimal-Liste lässt sich vorab nicht ermitteln. Das Risiko ist
bewusst akzeptiert und begrenzt: nur die zwei Organisationen, 90 Tage Laufzeit, Secret nur in den
Umgebungen `preview` und `production`.

**Abweichung vom Runbook C3:** Dort waren je Umgebung ein eigenes, eingeschränktes Token vorgesehen.
Die Vorschau läuft auf `develop` und hat damit dieselben Rechte auf die Produktion.
Am 22.11.2026 nach der ersten Veröffentlichung bestätigt: Es bleibt bei einem Token (Entscheidung
Enrico).

### Pooler-Adresse für Datenbank-Befehle

Die GitHub-Runner haben kein IPv6. Alles, was die Pipeline direkt an der Datenbank tut (`db reset`
der Vorschau, `migration list`, `db push`; die Beispieldaten gehen über die Management-API), läuft deshalb über den Session-Pooler
(Plan 0014, Entscheidung beim Bauen 10). Je Umgebung `preview` und `production` gibt es das Secret
`SUPABASE_POOLER_URL`:

1. Im Dashboard des Projekts Connect → Direct → „Session pooler“, Type „URI“, Adresse kopieren.
2. `[YOUR-PASSWORD]` durch das Datenbank-Passwort des Projekts ersetzen. Wer es nicht mehr weiß:
   dort „Reset database password“; das betrifft nur den Benutzer `postgres`, nicht `backup_reader`.
3. Im Terminal (die Adresse in der lokalen `.env` als `SUPABASE_POOLER_URL_<ENV>=…` ablegen):
   `grep '^SUPABASE_POOLER_URL_PREVIEW=' .env | cut -d= -f2- | gh secret set SUPABASE_POOLER_URL --env preview`
   bzw. mit `_PRODUCTION` und `--env production`.

Fehlt das Secret, bricht der Lauf vor dem ersten Datenbank-Befehl mit „Secret SUPABASE_POOLER_URL
fehlt“ ab.

## Ablaufdaten und regelmäßige Aufgaben

| Was                    | Wann                                         | Was tun                                                                      |
| ---------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| Supabase-Zugangstokens | 90 Tage nach Anlage (im Kalender vorgemerkt) | Schlüsselwechsel, siehe oben                                                 |
| Zeitpläne in GitHub    | nach 60 Tagen ohne Aktivität im Repo         | [Zeitpläne wieder einschalten](#zeitpläne-wieder-einschalten)                |
| Vorschau-Projekt       | pausiert nach 7 Tagen ohne Vorschau-Lauf     | Dashboard → „Restore project“; der nächste Vorschau-Lauf meldet es sonst rot |
| Wiederherstellungstest | jeden Monatsersten                           | rot → Meldung lesen; „Sicherung zu alt“ heißt meist: Zeitplan aus            |
| Azure-Budget           | E-Mail bei 8 € und 10 €                      | Kosten im Portal prüfen (Cost Management)                                    |
| Dependabot-PRs         | wöchentlich                                  | Diff der Action lesen, dann Squash nach `develop`                            |
