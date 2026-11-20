---
status: offen # offen | in-arbeit | erledigt
datum: JJJJ-MM-TT
spec: 0006
---

# NNNN — Plan

## Ansatz

Wie es gebaut wird, in drei bis fünf Sätzen. Betroffene Pakete (`core`, `api`, `ui`, `app`,
`supabase`).

## Datenbank und Sync

Neue oder geänderte Tabellen und Spalten, additiv oder expand/contract, Delta-Sync. Umsetzung
mit dem `db-change`-Skill. „Keine Änderung“ ist eine gültige Antwort.

## Risiken und Gegenmaßnahmen

Pflicht bei kritischen Pfaden (Login, RLS, Delta-Sync und Abhak-Warteschlange, Migrationen, Löschen), sonst kurz.

| Was könnte schiefgehen                       | Gegenmaßnahme | Getestet durch |
| -------------------------------------------- | ------------- | -------------- |
| Mitglied eines fremden Haushalts sieht Daten | RLS           | pgTAP `…`      |

## Aufgaben

Jede Aufgabe ist einzeln abschließbar: Test rot → Implementierung → Test grün → `pnpm check` →
Commit.

### Task 1 — Kurztitel

- **Deckt ab:** AC-001
- **Berührt:** `pfad/zur/datei`
- **Test:** was der Test prüft
- **Status:** offen

## Bewusst nicht Teil dieses Plans

…

## Nachweis

Wird am Ende ausgefüllt.

- [ ] Alle AC haben einen Test, der rot war und jetzt grün ist (spec-auditor)
- [ ] `pnpm format:check && pnpm check && pnpm build:web` grün
- [ ] `pnpm exec supabase test db` grün (falls Datenbank betroffen)
- [ ] `/ui-verify` gelaufen, Befunde behoben oder begründet (falls UI betroffen)
- [ ] `/security-check` gelaufen (falls kritischer Pfad)
- [ ] Offline-Verhalten wie in der Spec beschrieben geprüft
- [ ] Glossar und Rückverfolgbarkeitstabelle aktuell
