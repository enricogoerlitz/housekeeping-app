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

| Teil                     | Stand                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zweige                   | `develop` ist der Standard-Zweig; `main` ist immer auslieferbar                                                                                                                                                                                         |
| GitHub-Umgebungen        | `preview` (nur Zweig `develop`), `production`, `backup`, `restore-test` (je nur Zweig `main`)                                                                                                                                                           |
| Static Web Apps          | `swa-housekeeping-app-prd` (Produktion) und `swa-housekeeping-app-preview` (Vorschau), beide Tarif Free in **East US 2** (West Europe am 21.11.2026 erneut abgelehnt; dort liegen nur App-Dateien), beide ohne Staging-Umgebungen (`Disabled`)          |
| Web-Adresse Produktion   | `https://brave-bush-089e7a80f.6.azurestaticapps.net` (Variable `PRODUCTION_WEB_ORIGIN`); Vorschau: Variable `PREVIEW_WEB_ORIGIN`                                                                                                                        |
| Storage für Sicherungen  | `sthousekeepingbkpger` in **Germany West Central** (West Europe abgelehnt), Container `backups`, Unveränderlichkeit 30 Tage (**noch nicht gesperrt**, siehe [unten](#unveränderlichkeit-sperren)), Lebenszyklus aus `infra/azure/backup-lifecycle.json` |
| Eigene Rollen            | „Housekeeping SWA Deploy Token Reader“ (je an einer SWA), „Housekeeping Backup Writer“ (am Container); Vorlagen in `infra/azure/`                                                                                                                       |
| Identitäten (Azure)      | `id-housekeeping-web-prd`, `id-housekeeping-web-preview`, `id-housekeeping-backup`, `id-housekeeping-restore` in Germany West Central, je mit föderierten Anmeldedaten für genau eine GitHub-Umgebung                                                   |
| Budget                   | 10 € im Monat, E-Mail bei 80 % und 100 %                                                                                                                                                                                                                |
| GitHub-Variablen gesetzt | `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_CLIENT_ID` (je Umgebung), `SWA_NAME` (je Umgebung), `SWA_RESOURCE_GROUP`, `BACKUP_STORAGE_ACCOUNT`, `PRODUCTION_WEB_ORIGIN`, `PREVIEW_WEB_ORIGIN`                                                    |
| Noch offen               | `SUPABASE_PROJECT_REF` (je Umgebung) und Runbook B5: die Supabase-CLI ist noch nicht angemeldet, beides macht Enrico. Dazu C1 bis C11 (Secrets, Google, Push, Sicherung) und B7 (Rulesets)                                                              |

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

Die Rulesets liegen als Dateien in `infra/github/` und gelten ohne Umgehung, auch für Enrico:

| Datei                  | Gilt für  | Regeln                                                                                    |
| ---------------------- | --------- | ----------------------------------------------------------------------------------------- |
| `ruleset-develop.json` | `develop` | nur per PR (Squash oder Merge-Commit), Pflicht-Checks grün, kein Force-Push, kein Löschen |
| `ruleset-main.json`    | `main`    | nur per PR (nur Merge-Commit), Pflicht-Checks grün, kein Force-Push, kein Löschen         |
| `ruleset-tags.json`    | Tags `v*` | nicht verschieben, nicht löschen; anlegen darf die Veröffentlichung                       |

Pflicht-Checks sind die Jobnamen aus `.github/workflows/checks.yml` ohne „Änderungen“:
`Konventionen`, `Geheimnisse`, `Migrationen`, `Prüfungen`, `Datenbank (pgTAP)`, `Deno-Lock`,
jeweils nur von GitHub Actions erfüllbar (`integration_id` 15368). „Up to date“ wird nicht
verlangt; Freigaben (Reviews) auch nicht, weil es nur einen Besitzer gibt. Ein Jobname und die
Rulesets ändern sich immer zusammen; `scripts/ci/workflows.test.mjs` prüft das.

Die E2E-Suiten (`pnpm e2e`, `pnpm e2e:dev`) laufen seit 22.11.2026 nicht mehr in der Pipeline, nur
lokal: vor jeder Veröffentlichung einmal beide ausführen (Spec 0014, AC-006).

```sh
# Anlegen (einmal, Runbook B7)
for f in ruleset-develop ruleset-main ruleset-tags; do gh api -X POST "repos/$R/rulesets" --input "infra/github/$f.json"; done
# Nach einer Änderung der Dateien: ID ablesen, dann ersetzen
gh api "repos/$R/rulesets" --jq '.[] | [.id, .name, .enforcement] | @tsv'
gh api -X PUT "repos/$R/rulesets/<id>" --input infra/github/ruleset-develop.json
```

## Alltag

### Feature oder Fix

```sh
git switch -c feat/NNNN-slug origin/develop
# … arbeiten, committen …
git push -u origin feat/NNNN-slug
gh pr create --base develop --title "feat: …"   # Beschreibung mit „Spec: NNNN“ (Vorlage)
```

Nach grünen Checks mit **„Squash and merge“** zusammenführen. Die Oberfläche schlägt auf `develop`
die zuletzt gewählte Art vor; für Feature-PRs immer Squash wählen. Danach baut `preview.yml` die
Vorschau neu auf (frische Beispieldaten, kein Testkonto); kurz darauf zeigt die Vorschau-Adresse den
neuen Stand.

### Freigabe (Veröffentlichung)

```sh
gh pr create --base main --head develop --title "chore: Veröffentlichung"
```

Nach grünen Checks mit **„Create a merge commit“** zusammenführen (auf `main` die einzige Art).
`release.yml` läuft dann ohne weiteren Handgriff: Version und Änderungsliste, Web bauen und
Supabase prüfen, Pakete prüfen, Sicherung, Supabase ausliefern, Web ausliefern, Prüfung von außen,
Tag `v<Version>` und GitHub-Veröffentlichung. Liegen seit dem letzten Tag nur Dokumentation und
Agent-Einstellungen vor, gibt es keine Veröffentlichung; von Hand erzwingen lässt sie sich mit
`gh workflow run release.yml --ref main -f erzwingen=true` (etwa nach einer Wiederherstellung, siehe
[Notfall](#notfall-wiederherstellen), Schritt 6).

Ist ein Lauf rot: die Fehlermeldung im Lauf lesen, beheben (Hotfix oder PR nach `develop` und neue
Freigabe). Scheitert nur ein Schritt nach „Supabase ausliefern“ (z. B. Web ausliefern), reicht
„Re-run failed jobs“: Migrationen sind abwärtsverträglich (expand → migrate → contract).

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
der Produktion.

```sh
gh workflow run redeploy-web.yml --ref main -f tag=v<Version>
gh run watch --exit-status "$(gh run list --workflow redeploy-web.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Das Paket enthält die Supabase-Adresse von damals; nach einem Wechsel des Supabase-Projekts hilft
das nicht (siehe Notfall, Schritt 6).

## Erste Anmeldung in einer leeren Produktion

Einmal nach der ersten Veröffentlichung (Runbook C11) und nach einer Neuanlage ohne Daten. Das
Skript fragt die Google-Adresse verdeckt ab, legt den Haushalt „Enrico & Nadja“ mit den
Standard-Tageszeiten und eine Einladung an, falls sie fehlen, und gibt nur aus, wie viel es angelegt
hat (`1` = angelegt, `0` = war schon da):

```sh
pnpm exec supabase link --project-ref "<prod-ref>" && node scripts/prod-bootstrap.mjs && pnpm exec supabase unlink
```

Danach auf der Web-Adresse mit Google anmelden, die Einladung annehmen und Nadja in der App
einladen. Ein zweiter Lauf legt nichts an.

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
gh workflow run release.yml --ref main -f erzwingen=true
gh run watch --exit-status "$(gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

**7. Prüfen und aufräumen:** `verify.mjs` läuft mit der Veröffentlichung; zusätzlich mit beiden
Konten anmelden, Daten und Fotos ansehen, „Probe senden“. Dann `rm -rf tmp/restore`. Das alte
Projekt erst löschen, wenn alles stimmt.

## Schlüsselwechsel

Bei Verdacht auf Abfluss sofort, sonst zum Ablaufdatum. Immer: neuen Wert setzen, einen Lauf
abwarten, dann den alten widerrufen.

| Was                                                    | Wo neu setzen                                                                                                                                                                 | Alten widerrufen                                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Supabase-Zugangstoken (ein Token für beide Umgebungen) | Account → Access Tokens, Rechte wie unter „Supabase-Zugangstoken: Einstellungen“, Ablauf 90 Tage → `gh secret set SUPABASE_ACCESS_TOKEN --env production` und `--env preview` | Access Tokens → altes löschen                                                                    |
| Google-Client-Secret                                   | Google Auth Platform → Client „Housekeeping Web“ → neues Secret → `GOOGLE_CLIENT_SECRET` in `production` und `preview`                                                        | nach der nächsten Veröffentlichung und Vorschau das alte deaktivieren                            |
| Deployment-Token einer SWA                             | `az staticwebapp secrets reset-api-key -n <SWA_NAME> -g "$RG"`; die Pipeline holt es zur Laufzeit                                                                             | entfällt (das alte ist damit ungültig)                                                           |
| Push-Geheimnis `PUSH_SEND_SECRET`                      | `supabase secrets set PUSH_SEND_SECRET=…` und im SQL-Editor `vault.update_secret(<id von push_send_secret>, '<neu>')`                                                         | entfällt                                                                                         |
| VAPID-Schlüsselpaar                                    | nur bei Abfluss: `node scripts/push-keys.mjs --out …`, Function-Secrets, `PRODUCTION_VAPID_PUBLIC_KEY`, neue Veröffentlichung                                                 | entfällt; alle Geräte müssen Benachrichtigungen neu einschalten                                  |
| Passwort von `backup_reader`                           | SQL-Editor: `alter role backup_reader with password '<neu>';` → `BACKUP_DB_URL` in `backup`                                                                                   | entfällt                                                                                         |
| S3-Schlüssel Storage                                   | Storage → Settings → S3 Connection → neuer Schlüssel → `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`                                                               | alten Schlüssel löschen                                                                          |
| Sicherungsschlüssel (`age`)                            | `age-keygen -o …` → `BACKUP_AGE_RECIPIENT` (`backup`), `BACKUP_AGE_IDENTITY` (`restore-test`)                                                                                 | **den alten privaten Schlüssel 12 Monate aufheben**: ältere Sicherungen sind damit verschlüsselt |
| Azure-Identitäten                                      | kein Schlüssel (OIDC); bei Verdacht die föderierte Anmeldung löschen und neu anlegen (Runbook B3, `ident`)                                                                    | `az identity federated-credential delete …`                                                      |

### Supabase-Zugangstoken: Einstellungen

Stand 22.11.2026. Ein Token für beide Umgebungen, Name `github-housekeeping-app-token`. Diese Seite
enthält keine Werte.

- **Ressourcenzugriff:** Organization, beide Organisationen (`housekeeping-prod`, `housekeeping-test`)
- **Ablauf:** 90 Tage
- **Berechtigungen** (Preset „Custom“); alles, was hier nicht steht, ist **None**:

| Bereich                     | Berechtigung                                                                                                           | Wofür                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Project                     | Project Settings: Read · Advisors: Read · Logs: Read                                                                   | Lesen für `supabase link` und Diagnose                              |
| Database                    | Database: Read-write · Migrations: Read-write · Backups: Read · Database Config: Read                                  | `db push`, Vorschau-Reset (`db reset`), `db dump` für die Sicherung |
| Application services        | Auth Config: Read-write · Data API Config: Read-write · Edge Functions: Read-write · Edge Function Secrets: Read-write | `config push`, `functions deploy`, `secrets set ALLOWED_ORIGINS`    |
| Infrastructure and delivery | alles None                                                                                                             | nicht gebraucht                                                     |
| Account and organization    | Organizations: Read · Projects (account-wide): Read · Organization Projects: Read                                      | Projekt-Auswahl für `supabase link`                                 |

Die Liste folgt den Befehlen in `.github/workflows/` (`preview.yml`, `release.yml`, `backup.yml`). Wenn
ein Lauf mit „permission denied“ scheitert, genau diese eine Berechtigung ergänzen und hier nachtragen.

**Abweichung vom Runbook C3:** Dort war je Umgebung ein eigenes Token vorgesehen. Entschieden am
22.11.2026: ein Token für beide Umgebungen. Die Vorschau läuft bei jedem Merge nach `develop` und
hat damit dieselben Rechte auf die Produktion. Das Risiko ist bewusst akzeptiert. Vor dem ersten
Produktivbetrieb mit echten Haushaltsdaten (Nadja) wieder auf zwei Tokens umstellen.

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

| Was                    | Wann                                         | Was tun                                                                           |
| ---------------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| Supabase-Zugangstokens | 90 Tage nach Anlage (im Kalender vorgemerkt) | Schlüsselwechsel, siehe oben                                                      |
| Zeitpläne in GitHub    | nach 60 Tagen ohne Aktivität im Repo         | [Zeitpläne wieder einschalten](#zeitpläne-wieder-einschalten)                     |
| Vorschau-Projekt       | pausiert nach 7 Tagen ohne Vorschau-Lauf     | Dashboard → „Restore project“; der nächste Lauf auf `develop` meldet es sonst rot |
| Wiederherstellungstest | jeden Monatsersten                           | rot → Meldung lesen; „Sicherung zu alt“ heißt meist: Zeitplan aus                 |
| Azure-Budget           | E-Mail bei 8 € und 10 €                      | Kosten im Portal prüfen (Cost Management)                                         |
| Dependabot-PRs         | wöchentlich                                  | Diff der Action lesen, dann Squash nach `develop`                                 |
