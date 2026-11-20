---
status: angenommen
datum: 2026-11-20
autor: agent
betrifft: []
---

# ADR-0007 — Hosting und Kosten

## Status

`angenommen`

## Kontext

Die App soll möglichst wenig kosten. Später kommen eventuell weitere kleine Apps dazu, die
dasselbe Setup nutzen. Preise wurden am 20.11.2026 recherchiert und sollten vor jeder
Kostenentscheidung erneut geprüft werden.

## Entscheidung

Wir starten mit **kostenlosen Tarifen** und nennen für mehrere Apps einen klaren
Skalierungspfad.

| Teil                                                      | Dienst                                             | Kosten                                      |
| --------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------- |
| Datenbank, Auth, Storage, Functions                       | Supabase Free, Region Frankfurt                    | 0 €                                         |
| Sync                                                      | PowerSync Free                                     | 0 €                                         |
| Web-App                                                   | Cloudflare (statischer Export)                     | 0 €                                         |
| Native Builds                                             | lokal (Xcode / Android Studio) oder EAS Build Free | 0 €                                         |
| Updates ohne Store                                        | EAS Update Free                                    | 0 €                                         |
| Backups                                                   | GitHub Action, nächtlicher `pg_dump`               | 0 €                                         |
| iPhone-Installation (TestFlight) und „Mit Apple anmelden“ | Apple Developer Program                            | 99 $/Jahr                                   |
| Android-Installation                                      | APK direkt, ohne Store                             | 0 € (Play Store einmalig 25 $, nicht nötig) |

## Mehrere Apps

| Weg                                                                  | Kosten (Stand 11/2026)                                                                               | Wann sinnvoll                                                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Supabase Free**                                                    | 2 aktive Projekte gratis; pausieren nach 7 Tagen ohne Nutzung, keine automatischen Backups           | bis 2 Apps, die regelmäßig genutzt werden                                                |
| **Supabase Pro**                                                     | 25 $/Monat je Organisation, inkl. Rechenleistung für 1 kleines Projekt; jedes weitere ca. 10 $/Monat | ab App 3, wenn Ruhe vor Pausen und Backups gewünscht sind                                |
| **Ein Projekt, ein Postgres-Schema je App**                          | 0 € bzw. 25 $ gesamt                                                                                 | viele kleine private Apps derselben Personen; gemeinsame Nutzerkonten, gemeinsame Limits |
| **Selbst hosten** (Postgres + PowerSync Open Edition, z. B. Hetzner) | ca. 5–15 €/Monat fix für beliebig viele Apps                                                         | viele Apps; dafür Betrieb, Updates und Backups selbst                                    |

PowerSync: Free-Tier je Instanz, Pro ab 49 $/Monat. Bei mehreren Apps lohnt sich PowerSync selbst
gehostet neben einem Pro-Supabase oder auf demselben Server.

## Betrachtete Optionen

### Option A — Free-Tiers, später Pro oder selbst hosten

- **Pro:** 0 € zum Start, keine Betriebsarbeit, jederzeit migrierbar (beides Open Source).
- **Contra:** Pausieren nach Inaktivität; keine automatischen Backups im Free-Tier.

### Option B — Von Anfang an selbst hosten

- **Pro:** feste, niedrige Kosten, auch für viele Apps.
- **Contra:** Betrieb, Sicherheitsupdates und Backups selbst, ab Tag eins.

## Begründung

Ausschlaggebend ist **0 € ohne Betriebsaufwand, solange es nur diese App gibt**. Beide Dienste
sind Open Source, deshalb ist der Wechsel zu „selbst hosten“ später kein Neubau.

## Konsequenzen

**Positiv:** keine laufenden Kosten im ersten Schritt.

**Negativ:**

- Ein pausiertes Projekt muss man von Hand reaktivieren. Bei täglicher Nutzung tritt das nicht
  auf.
- Backups müssen wir selbst einrichten (GitHub Action).
- Der Apple-Developer-Account wird fällig, sobald die App mit nativen Modulen auf einem echten
  iPhone laufen soll. Expo Go reicht dafür nicht (ADR-0001).

**Folgearbeiten:** Backup-Workflow und Web-Deployment kommen mit der Fundament-Spec.

## Wann diese Entscheidung neu bewertet wird

Bei der dritten App, bei einer Pause trotz Nutzung, oder wenn ein Free-Tier-Limit erreicht wird.
