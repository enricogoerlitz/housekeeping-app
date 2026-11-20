---
status: in-arbeit # offen | in-arbeit | erledigt
datum: 2026-11-20
spec: 0005
---

# 0005 — Plan

## Ansatz

Keine Datenbankänderung. Die Muster entstehen als Bausteine in `packages/ui` (mit Showroom-Seite),
die Navigation in `apps/app` (alle Seiten innerhalb der Tabs, „Verwalten“), danach werden die
Bausteine in allen Bildschirmen eingesetzt. Betroffen: `ui`, `app`; `api` nur für den KI-Schalter.

## Datenbank und Sync

Keine Änderung.

## Risiken und Gegenmaßnahmen

Kein kritischer Pfad. Risiken: Umzug der Routen bricht Deep Links (Weiterleitungen alter Adressen,
E2E am Ende), feste Kopfzeile verdeckt Inhalte (Showroom + Dev-Smoke), Sammel-Fenster verliert
Haken bei Seitenwechsel (Haken werden sofort gespeichert, nur das Verschieben wartet; Unit-Test).

## Aufgaben

### Task 1 — Bausteine in `packages/ui`

- **Deckt ab:** REQ-002, REQ-003, REQ-004 (Bausteine), REQ-005, REQ-006, REQ-007, REQ-009
- **Berührt:** `packages/ui/src/*`, `apps/app/src/features/showroom/*`
- **Test:** vitest für reine Logik (Sammel-Fenster, Suche über Wortteile), Showroom-Durchlauf
- **Status:** in Arbeit

### Task 2 — Navigation, Verwalten, Einstellungen, KI aus

- **Deckt ab:** REQ-001, REQ-008, REQ-010
- **Berührt:** `apps/app/src/app/**` (Routen), `(tabs)/_layout.tsx`, `features/settings/*`,
  `features/shell/*`, neue `features/manage/*`, KI-Einstiege
- **Test:** Typen, Dev-Smoke, gezielter Klick-Durchlauf
- **Status:** in Arbeit

### Task 3 — Bausteine in allen Bildschirmen einsetzen

- **Deckt ab:** REQ-004 (Einsatz), REQ-002/003 (Einsatz), Tabelle „wer setzt welchen Baustein ein“
- **Berührt:** `apps/app/src/features/**`
- **Status:** offen (nach Task 1 und 2)

## Bewusst nicht Teil dieses Plans

Neue E2E-Rundgänge (kommen gesammelt am Ende der Wellen), Einsatz der Bausteine in Bereichen, die
erst spätere Specs neu bauen (siehe Spec-Tabelle).

## Nachweis

Wird am Ende ausgefüllt.
