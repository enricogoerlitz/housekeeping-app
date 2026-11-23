---
status: angenommen
datum: 2026-11-21
autor: agent
betrifft:
  [
    0003,
    0007,
    0008,
    0012,
    0014,
    .github/workflows,
    infra,
    scripts/release,
    scripts/backup,
    supabase/config.toml,
    supabase/migrations,
    AGENTS.md,
    .claude/rules/10-security.md,
    .claude/rules/31-sync.md,
  ]
---

# ADR-0015 — Auslieferung und Betrieb

## Status

`angenommen` · 21.11.2026, vom Eigentümer mit dem Plan zu Spec 0014 („Betrieb: Branching, CI/CD
und Release“) vorab freigegeben. Die Einzelheiten (Workflows, Befehle, Rechte) stehen in
`docs/specs/0014-betrieb-ci-cd-release/plan.md`; diese ADR hält fest, **wo** die App läuft, **wie**
ein Stand dorthin kommt, **woran** die App erkennt, dass sie zu alt ist, und **wo** die Sicherungen
liegen. Sie ersetzt die Zeile „Web-App: Cloudflare“ aus ADR-0007 (Nachtrag dort) und ergänzt
Regel 4 aus `AGENTS.md` um eine zweite Online-Lesung.

## Kontext

Bis Spec 0014 läuft die App nur auf Enricos Rechner. Enrico und Nadja sollen sie als PWA auf dem
iPhone nutzen, Benachrichtigungen (Spec 0013, ADR-0014) brauchen eine öffentliche HTTPS-Adresse,
und niemand sichert die Daten.

Gegeben ist:

- **Kosten:** möglichst 0 € (ADR-0007). Supabase Free erlaubt zwei aktive Projekte und hat keine
  automatischen Sicherungen; ein Projekt pausiert nach 7 Tagen ohne Nutzung.
- **Azure:** Enrico hat ein Azure-Abo mit der Ressourcengruppe `rg-housekeeping-app-weu-prd`; dort
  liegt bereits die Static Web App `swa-housekeeping-app-prd` (Free). West Europe nahm für das Abo
  beim ersten Versuch keine neue Static Web App an, sie liegt deshalb in East US 2.
- **GitHub:** Das Repo ist öffentlich. Umgebungen mit Branch-Policies, Rulesets und Secret Scanning
  sind damit ohne GitHub Pro verfügbar; dafür kann jeder den Code und jede PR von einem Fork sehen
  und auslösen.
- **Zwei Personen, kein Bereitschaftsdienst.** Fehler melden sich per GitHub-E-Mail; es gibt
  keine Überwachung (Nicht-Ziel der Spec).
- **Offline-lesbar** (ADR-0008): Geräte arbeiten mit ihrer Version und ihrem lokalen Speicher
  weiter, auch wenn inzwischen eine neue ausgeliefert wurde. Ältere Versionen müssen also eine Zeit
  lang mit der neuen Datenbank zurechtkommen (expand → migrate → contract).
- **Native Apps** sind noch nicht nutzbar: Es fehlen die native Google-Anmeldung und ein
  dauerhafter Speicher (Spec 0014, Offene Frage 3). Ein EAS-Token, über das ein
  Over-the-Air-Update alle Geräte erreicht, wäre heute das gefährlichste Secret der Pipeline, ohne
  dass jemand eine native App nutzt.
- **Migrationen:** Die Grundlage aus ADR-0012 darf bis zur ersten Veröffentlichung noch geändert
  werden; danach gilt „eine committete Migration wird nie geändert“.

## Entscheidung

Wir liefern die Web-App über **Azure Static Web Apps (Free)** aus, in zwei vollständig getrennten
Umgebungen **Vorschau** (aus `develop`) und **Produktion** (aus `main`), jede mit eigener Static
Web App und eigenem Supabase-Projekt. Die **Pipeline in GitHub Actions** ist der Regelweg, auf
dem sich die Cloud-Projekte ändern; sie meldet sich bei Azure per **OIDC** an. Versionen heißen
**`JJJJ.M.N`**, die **Mindestversion** liefert die SQL-Funktion `public.min_app_version()`, und
jede Nacht entsteht eine mit **`age`** verschlüsselte **Sicherung in Azure Storage**. Native Apps
kommen später mit eigener Spec in dieselbe Pipeline.

| Teil              | Festlegung                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web-Hosting       | Zwei Static Web Apps im Tarif Free in `rg-housekeeping-app-weu-prd`: „Produktion“ und „Vorschau“, ohne Vorschau-Umgebungen je PR. Sicherheits-Header, Cache-Regeln und SPA-Rückfall in `apps/app/public/staticwebapp.config.json`. Ausgeliefert wird das fertige `dist`; die Static Web App baut nichts.                                                                                                                                                          |
| Umgebungen        | **Vorschau:** eigenes Supabase-Projekt in eigener Free-Organisation, bei jedem Lauf neu aufgesetzt mit Beispieldaten ohne Testkonten, Push aus. **Produktion:** das bestehende Supabase-Projekt (Frankfurt), nie Seed, nie Reset. Lokal bleibt Docker mit Seed und Testkonten.                                                                                                                                                                                    |
| Zweige            | Feature-PRs per Squash nach `develop` (Standard-Zweig), Release-PR `develop` → `main` per Merge-Commit, Hotfix von `main` nach `main` mit automatischer Rückführung nach `develop`. Rulesets ohne Umgehung für `develop`, `main` und Tags `v*`.                                                                                                                                                                                                                   |
| Pipeline          | Ein wiederverwendbarer Check-Workflow vor allem anderen; nach `main`: Version → Web bauen und Supabase prüfen parallel → Pakete prüfen → Sicherung → Supabase ausliefern → Web ausliefern → Prüfung von außen → Tag und GitHub-Veröffentlichung. Jobs, die Pakete installieren oder bauen, haben keine Umgebung und kein Secret; Jobs mit Umgebung installieren keine Pakete.                                                                                     |
| Supabase-Zugang   | Je Projekt ein eingeschränktes Zugangstoken mit Ablaufdatum, nur in der Umgebung `production` bzw. `preview`. Kein Datenbank-Passwort für die Auslieferung (`--remote` arbeitet über das Token). Die Cloud-Konfiguration steht in `supabase/config.toml` (`[remotes.production]`, `[remotes.preview]`) und wird bei jeder Auslieferung gesetzt und geprüft.                                                                                                       |
| Azure-Zugang      | Je GitHub-Umgebung (`production`, `preview`, `backup`, `restore-test`) eine verwaltete Identität mit föderierten Anmeldedaten für genau diese Umgebung, mit eigenen Rollen nur an ihrer Ressource. Das Deployment-Token einer Static Web App wird zur Laufzeit geholt und maskiert; in GitHub liegt kein Azure-Schlüssel.                                                                                                                                         |
| App-Version       | Kalender-Version `JJJJ.M.N` (Monat ohne führende Null, Zählung je Monat ab 1, Monat in `Europe/Berlin`) aus den Git-Tags `v*`. Die App kennt ihre Version aus `EXPO_PUBLIC_APP_VERSION`, das Web nennt die ausgelieferte in `/version.json` (nie aus dem Cache des Service Workers). Lokal heißt sie `dev`, in der Vorschau `vorschau`.                                                                                                                           |
| Mindestversion    | `public.min_app_version()`, `language sql stable`, ohne Tabelle, ausführbar für `anon` und `authenticated`. Nur eine Rückbau-Migration (Kopf `-- contract: …; min_app_version: …`) hebt sie mit `create or replace`; die Pipeline bricht ab, wenn sie über der zuletzt veröffentlichten Version läge. Darunter sperrt die App das Bearbeiten und hält die Laden-Warteschlange an.                                                                                 |
| Online-Lesung     | Die App liest `/version.json` und `min_app_version` nur online, beim Start und beim Zurückholen in den Vordergrund. Das ist neben „Deine Geräte“ (ADR-0014) die zweite Lesung außerhalb des lokalen Speichers. Ohne Netz gilt kein Wert als Sperre; die App läuft mit ihrer Version weiter.                                                                                                                                                                       |
| Sicherung         | GitHub Action jede Nacht: Datenbank-Dump (Rollen, Schema, Daten) über den Session-Pooler mit einer nur lesenden Rolle, Fotos über die S3-Schnittstelle von Supabase Storage, als ein Archiv mit `age` an einen öffentlichen Schlüssel verschlüsselt, mit Begleitdatei (Zeilen je Tabelle, Fotoanzahl, Prüfsumme, keine Daten). Zusätzlich vor jeder Veröffentlichung.                                                                                             |
| Ablage            | Privates Storage-Konto (West Europe) ohne Kontoschlüssel und ohne öffentlichen Zugriff, Container mit Unveränderlichkeit 30 Tage; Lebenszyklus 31 Tage für tägliche, 366 Tage für monatliche Sicherungen. Die Identität der Sicherung darf nur schreiben, die des Tests nur lesen.                                                                                                                                                                                |
| Wiederherstellen  | Am Monatsersten spielt ein Wiederherstellungstest die neueste Sicherung in eine Wegwerf-Datenbank im Runner ein und vergleicht sie mit der Begleitdatei. Wiederherstellen in Produktion ist nie automatisch, sondern Enricos Entscheidung (Betriebsdoku `docs/architecture/betrieb.md`).                                                                                                                                                                          |
| Direkte Eingriffe | Standard sind Migrationen und die Pipeline. Agenten dürfen Supabase und Azure untersuchen und bei Bedarf direkt ändern, bevorzugt über Migrationen und vorbereitete Funktionen oder Skripte; sie geben nie Secrets aus und setzen `migration repair` oder einen Reset eines entfernten Projekts nur mit einem im Plan genannten Grund ab (`.claude/rules/10-security.md`). Es gibt keine Sperrliste in den Agent-Einstellungen (Entscheidung Enrico, 21.11.2026). |
| Native (später)   | Mit der Spec „Native Apps: Anmeldung und Speicher“: App-ID, EAS, Over-the-Air-Updates, TestFlight. Ihre Bau- und Verteil-Jobs rasten zwischen „Supabase prüfen“ und „Supabase ausliefern“ bzw. neben „Web ausliefern“ ein; dazu ein Nachtrag zu dieser ADR mit eigenem Bedrohungsmodell für das EAS-Token.                                                                                                                                                        |

## Betrachtete Optionen

### Web-Hosting

#### Option A — Azure Static Web Apps Free (gewählt)

- **Pro:** 0 €. Liegt beim selben Anbieter wie Sicherungen, Identitäten und Budget; Anmeldung
  per OIDC ohne gespeicherten Schlüssel. Header, Cache-Regeln und SPA-Rückfall als eine Datei im
  Repo, prüfbar im Build. Eigene Domain später kostenlos möglich.
- **Contra:** Das Deployment-Token gilt für alle Umgebungen einer Static Web App, deshalb zwei
  getrennte Apps statt Vorschau-Umgebungen. Für das Abo war West Europe zunächst nicht verfügbar;
  die App-Dateien liegen dann in East US 2 (keine Nutzerdaten). Kein SLA im Tarif Free.

#### Option B — Cloudflare Pages (ADR-0007)

- **Pro:** 0 €, weltweites CDN, Header über `_headers`, Vorschauen je Zweig eingebaut.
- **Contra:** Ein weiterer Anbieter mit eigenem Konto; die Auslieferung aus GitHub braucht ein
  dauerhaft gespeichertes API-Token. Sicherungen und Budget lägen trotzdem woanders.

#### Option C — GitHub Pages

- **Pro:** kein weiteres Konto, 0 € bei öffentlichem Repo.
- **Contra:** keine eigenen Antwort-Header (`frame-ancestors`, `nosniff`, Cache-Regeln je Datei)
  und kein echter SPA-Rückfall, nur eine 404-Seite; AC-035 bis AC-037 der Spec wären nicht
  erfüllbar.

### Mindestversion

#### Option A — SQL-Funktion in Supabase (gewählt)

- **Pro:** kommt atomar mit der Rückbau-Migration, die sie nötig macht; Web und spätere native Apps
  lesen dieselbe Quelle; ohne Tabelle keine Ausnahme von Regel 5 und nichts zu synchronisieren.
- **Contra:** eine zweite Online-Lesung neben „Deine Geräte“; der Wert ändert sich nur per
  Migration, nicht per Schalter.

#### Option B — Feld in `/version.json` der Static Web App

- **Pro:** keine Datenbank-Änderung.
- **Contra:** Das Web wird erst nach der Datenbank ausgeliefert; zwischen beiden Schritten würde die
  Sperre fehlen. Native Apps hingen am Web.

#### Option C — Tabelle mit einer Zeile Einstellungen

- **Pro:** änderbar ohne neue Funktion, erweiterbar um weitere Werte.
- **Contra:** eine Tabelle ohne Haushalt wäre eine neue Ausnahme von Regel 5 mit eigenen Policies;
  für einen einzigen Wert zu viel.

### Versionsschema

- **A — Kalender-Version `JJJJ.M.N` (gewählt):** jede Veröffentlichung bekommt ohne Streit eine
  Nummer, das Datum ist ablesbar, gültig für die Stores. Sagt nichts über Verträglichkeit; das
  regelt die Mindestversion.
- **B — SemVer aus den Commit-Typen:** verbreitet; aber Major und Minor bedeuten bei einer
  privaten App mit ständiger Auslieferung nichts, und ein falscher Commit-Typ verschiebt die Nummer.

### Vorschau

- **A — eigenes Free-Projekt und eigene Static Web App, aus `develop` (gewählt):** echtes
  Ausprobieren mit Google-Anmeldung auf dem Handy, jede Migration läuft vor Produktion einmal auf
  gehosteter Infrastruktur. Belegt das zweite kostenlose Supabase-Projekt und pausiert nach 7 Tagen
  ohne Zusammenführen auf `develop`.
- **B — Supabase Branching:** braucht Pro (25 $ im Monat), und jede Branch hat eine neue Adresse,
  die Google nicht als Weiterleitung kennt.
- **C — Vorschau je PR gegen dasselbe Projekt:** jede PR bräuchte Zugang zur Umgebung `preview`;
  bei einem öffentlichen Repo heißt das, Code aus PR-Zweigen bekommt Secrets.

### Zugang der Pipeline zu Azure

- **A — OIDC mit verwalteten Identitäten je Umgebung (gewählt):** kein dauerhafter Schlüssel,
  jede Identität nur an ihrer Ressource, an genau eine GitHub-Umgebung gebunden. Mehr Einrichtung
  (vier Identitäten, zwei eigene Rollen).
- **B — Deployment-Token bzw. Client-Secret als GitHub-Secret:** schneller eingerichtet; aber ein
  gestohlener Wert gilt bis zum Widerruf, und das Token einer Static Web App kann sie vollständig
  ersetzen.

### Sicherung

- **A — GitHub Action, verschlüsselt mit `age`, in Azure Storage mit Unveränderlichkeit
  (gewählt):** wenige Cent im Monat, Sicherungen auch bei einem gestohlenen Pipeline-Zugang 30 Tage
  nicht löschbar, getrennt vom gesicherten Anbieter, monatlich geprüft. Eigene Arbeit an Workflow,
  Schlüsselverwaltung und Test.
- **B — Supabase Pro mit täglichen Sicherungen:** keine eigene Arbeit; 25 $ im Monat, Sicherungen
  beim selben Anbieter, Fotos nicht enthalten, Aufbewahrung nur 7 Tage.
- **C — Sicherung als GitHub-Artefakt:** keine Azure-Einrichtung; Artefakte höchstens 90 Tage und
  löschbar mit jedem Schreibzugang zum Repo.
- **Verschlüsselung `age` statt `gpg`:** ein kleines Werkzeug mit einem Schlüsselformat, ohne
  Schlüsselbund und Vertrauensmodell; `gpg` könnte dasselbe, mit mehr Möglichkeiten, Fehler zu
  machen.

### Native Apps in dieser Pipeline

- **A — später, mit eigener Spec (gewählt):** kein EAS-Token ohne Nutzen, die App-ID (für immer
  bindend) wird erst entschieden, wenn es eine nutzbare App gibt.
- **B — Android sofort mitbauen:** die Pipeline wäre vollständig; aber die App wäre ohne Anmeldung
  und dauerhaften Speicher nicht nutzbar, und das gefährlichste Secret läge ohne Gegenwert in
  GitHub.

## Begründung

Ausschlaggebend ist **ein Ort für alles außerhalb von Supabase, ohne gespeicherten Schlüssel und
ohne laufende Kosten**: Web, Sicherungen, Identitäten und Budget liegen in einer Ressourcengruppe,
die Pipeline meldet sich per OIDC an, und jede Identität kann nur ihre eigene Ressource berühren.
Bei der Mindestversion entscheidet, dass sie **atomar mit der Datenbank-Änderung** kommt, die sie
nötig macht. Bei der Vorschau entscheidet, dass sie **mit echter Google-Anmeldung** funktioniert,
ohne dass Code aus PR-Zweigen an Secrets kommt.

## Konsequenzen

**Positiv:**

- Ein Stand kommt nur über grüne Checks in die Vorschau und nach `main` in Produktion, ohne
  Handgriff; Datenbank, Konfiguration, Functions und Web passen zueinander.
- Eine Version unter der Mindestversion kann keine Daten mehr schreiben, die die neue Datenbank
  nicht versteht; Lesen und Abhaken gehen weiter.
- Sicherungen sind verschlüsselt, unveränderlich und werden monatlich auf Wiederherstellbarkeit
  geprüft.

**Negativ:**

- Mit Vorschau und Produktion sind **beide kostenlosen Supabase-Projekte belegt**. Eine weitere
  App geht zunächst als eigenes Schema ins Produktionsprojekt (ADR-0007, Nachtrag) oder braucht
  Pro.
- **Zweite Online-Lesung** neben „Deine Geräte“: Regel 4 hat damit zwei begründete Ausnahmen.
- Die Vorschau pausiert nach 7 Tagen ohne Zusammenführen auf `develop`; der nächste Lauf ist dann
  rot, bis Enrico das Projekt fortsetzt.
- Der S3-Schlüssel von Supabase Storage kann auch schreiben und löschen; ein Nur-Lesen gibt es
  nicht. Er liegt nur in der Umgebung `backup`, und die Sicherung kopiert nur Richtung Runner.
- Sicherungen enthalten alle personenbezogenen Daten; Gelöschtes bleibt bis zu 12 Monate in
  monatlichen Sicherungen.
- Zugangstokens laufen ab (Supabase 90 Tage) und müssen erneuert werden; GitHub schaltet Zeitpläne
  nach 60 Tagen ohne Aktivität ab (der Wiederherstellungstest meldet eine zu alte Sicherung).
- GitHub kann die vorgeschlagene Merge-Art nicht je Quellzweig festlegen: Auf `develop` sind Squash
  und Merge-Commit erlaubt (Merge-Commit nur für die Rückführung), die Oberfläche schlägt die
  zuletzt gewählte Art vor.
- Direkte Eingriffe durch Agenten sind nicht technisch gesperrt, sondern nur durch die Regel
  begrenzt. Eine Änderung von Hand an Konfiguration oder Functions überschreibt die nächste
  Veröffentlichung wieder; was bleiben soll, muss ins Repo.
- Mit der ersten Veröffentlichung endet die Ausnahme der Grundlage (ADR-0012); ab dann gilt
  expand → migrate → contract ohne Ausnahme.

**Folgearbeiten:** Umsetzung in Spec 0014 (Tasks 1 bis 15 im Plan); Betriebsdoku
`docs/architecture/betrieb.md` (Task 10); Nachtrag zu dieser ADR mit der Spec „Native Apps:
Anmeldung und Speicher“; Lock-Dateien für weitere Functions, wenn die KI eingeschaltet wird.

## Wann diese Entscheidung neu bewertet wird

- Eine dritte App oder ein drittes Supabase-Projekt wird gebraucht, oder Produktion pausiert trotz
  Nutzung (dann Supabase Pro, ADR-0007).
- Die Spec „Native Apps“ startet (EAS-Token, Over-the-Air-Updates, App-ID).
- Eine eigene Domain kommt (Adresse, Google-Quellen, Weiterleitungen und PWA ändern sich).
- Die Fotos wachsen so, dass eine Sicherung aller Fotos je Nacht teuer oder langsam wird, oder das
  Azure-Budget (10 € im Monat) meldet sich.
- Azure Static Web Apps ändert den Tarif Free, oder West Europe wird für das Abo verfügbar.

## Nachtrag 2026-11-21 — Regionen bei der Einrichtung

Bei der Einrichtung am 21.11.2026 nahm West Europe für das Abo erneut keine neuen Ressourcen an.
Die Regionen weichen deshalb von „Ablage: Privates Storage-Konto (West Europe)“ in der Entscheidung
ab; alles andere gilt unverändert.

| Teil                   | Ressource                                                                                                     | Region                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Ablage der Sicherungen | Storage-Konto `sthousekeepingbkpger`                                                                          | **Germany West Central** |
| Identitäten            | `id-housekeeping-web-prd`, `id-housekeeping-web-preview`, `id-housekeeping-backup`, `id-housekeeping-restore` | **Germany West Central** |
| Web (beide Apps)       | Static Web Apps `swa-housekeeping-app-prd` und `swa-housekeeping-app-preview`, Tarif Free                     | **East US 2**            |

- Die Sicherungen, also die einzigen Nutzerdaten außerhalb von Supabase, bleiben in der EU.
- In East US 2 liegen nur die gebauten App-Dateien, keine Nutzerdaten (wie schon für die
  Produktions-App in „Kontext“ beschrieben).
- Der Auslöser „West Europe wird für das Abo verfügbar“ unter „Wann diese Entscheidung neu
  bewertet wird“ gilt jetzt für beide Static Web Apps; Storage und Identitäten müssen dafür nicht
  umziehen.

## Nachtrag 2026-11-23 — Tags `v*` legt nur die Veröffentlichung an

Spec 0031 (REQ-007, AC-020): Bisher durfte jeder mit Schreibrecht einen Tag `v*` von Hand anlegen,
und ein solcher Tag hätte die nächste App-Version bestimmt. Das Tag-Ruleset verbietet jetzt auch
das Anlegen (`creation`). Die einzige Ausnahme in einem Ruleset ist die GitHub-Actions-App
(`integration_id` 15368) für die Tags: Mit ihrem `GITHUB_TOKEN` legt der Job „Tag und
GitHub-Veröffentlichung“ in `release.yml` den Tag an. `develop` und `main` bleiben ohne Umgehung.
