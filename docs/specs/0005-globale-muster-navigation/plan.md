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
- **Status:** erledigt (`edfb492`)

### Task 2 — Navigation, Verwalten, Einstellungen, KI aus

- **Deckt ab:** REQ-001, REQ-008, REQ-010
- **Berührt:** `apps/app/src/app/**` (Routen), `(tabs)/_layout.tsx`, `features/settings/*`,
  `features/shell/*`, neue `features/manage/*`, KI-Einstiege
- **Test:** Typen, Dev-Smoke, gezielter Klick-Durchlauf
- **Status:** erledigt (`edfb492`)

### Task 3 — Bausteine in allen Bildschirmen einsetzen

- **Deckt ab:** REQ-004 (Einsatz), REQ-002/003 (Einsatz), Tabelle „wer setzt welchen Baustein ein“
- **Berührt:** `apps/app/src/features/**`, `packages/ui/src/{shell,overlay,controls,lists,icons}.tsx`
  (gruppierte `Sidebar`, `Sheet.size` Pflicht, `Segmented` entfernt, `layout-grid`),
  `docs/design/DESIGN.md`, `.agents/glossary.md`, Attribut-Selektoren in vier E2E-Dateien
- **Test:** Typen, Lint, vitest, `pnpm e2e:dev`, Klick-Durchlauf gegen den Web-Export
  (`tmp/0005-t3/probe.mjs`, 390 und 1440 px, drei Themes, hell und dunkel)
- **Status:** erledigt

## Bewusst nicht Teil dieses Plans

Neue E2E-Rundgänge (kommen gesammelt am Ende der Wellen), Einsatz der Bausteine in Bereichen, die
erst spätere Specs neu bauen (siehe Spec-Tabelle).

## Nachweis

Stand 21.11.2026 (Task 1 und 2 in `edfb492`, Task 3 im Arbeitsstand auf
`feat/0005-globale-muster-navigation`). Neue E2E-Rundgänge und der volle `pnpm e2e` laufen
gesammelt am Ende der Wellen 0005–0013; was dort anzupassen ist, steht in `tmp/brief/e2e-impact.md`.

| AC                | Nachweis                                                                                                                                                                                                                                        | offen für die E2E-Welle                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| AC-001 bis AC-007 | Task 2: Klick-Durchlauf `tmp/0005-t2/probe.mjs`; Task 3: jede Detailseite mit fester Kopfzeile (Zurück, Titel) im Bereichsstapel, Durchlauf `tmp/0005-t3/probe.mjs`                                                                             | Rundgang über alle Detailseiten, Zurück-Taste (AC-005) |
| AC-008, AC-009    | Durchlauf: auf allen Tab-Startseiten und Detailseiten steht der Titel nach 1000 px Scrollen oben (390 und 1440 px); Bildschirmfotos `tmp/0005-t3/shots/*-scrolled-*`                                                                            | Rundgang mit Knopf-Tipp in der schmalen Leiste         |
| AC-010            | Baustein (Task 1, Showroom); eingesetzt mit Spec 0006 in der Liste                                                                                                                                                                              | mit Spec 0006                                          |
| AC-011, AC-012    | Durchlauf: Haushalt „Anstehend · Alle · Verlauf“ beginnt und endet an derselben Stelle (1440: 292…1404 px); keine Höchstbreite je Tab mehr                                                                                                      | Rundgang                                               |
| AC-013            | Task 2; Durchlauf 1440 px: kein Avatar in Kopfzeilen                                                                                                                                                                                            | Rundgang                                               |
| AC-014 bis AC-016 | `sheet-size.test.ts` (Task 1); Durchlauf: Hinzufügen im Plan bleibt bei jeder Art 390 × 760 bzw. 760 × 720 px                                                                                                                                   | AC-014 „Name fehlt“, AC-016 als Rundgang               |
| AC-017 bis AC-019 | `sheet-size.test.ts`, Showroom (Task 1); jedes Fenster der App hat jetzt `size` (Pflicht-Prop); Vorratscheck wächst beim Aufklappen einmal auf „Groß“                                                                                           | Rundgang                                               |
| AC-020 bis AC-025 | Ansichts-Tabs in Essen, Plan, Haushalt (`aria-selected` im Durchlauf), Sortier-Menü in Rezepten (Durchlauf AC-022), Auswahl-Chips in Feedback, Aufwand, Erscheinungsbild, Tageszeit, Variante, Art; `Segmented` ist gelöscht, `pnpm check` grün | AC-023/024 als Rundgang                                |
| AC-026 bis AC-031 | `check-window.test.ts` (Task 1, rot zuerst: `tmp/0005-t1/red-check-window.log`), Showroom                                                                                                                                                       | Einsatz mit Spec 0006/0011                             |
| AC-032 bis AC-043 | vitest in core (Wortteil-Suche, rot zuerst: `tmp/0005-t1/red-core.log`), Showroom                                                                                                                                                               | Einsatz mit Spec 0006–0011                             |
| AC-044 bis AC-048 | Task 2: KI-Schalter, Durchlauf `tmp/0005-t2/probe-ai.mjs`                                                                                                                                                                                       | AC-045/048 im vollen `pnpm e2e`                        |
| AC-049 bis AC-051 | Task 1: Kontrast-Test `contrast.test.ts`; Task 3: Abschnitte ohne `tone`, `Screen tone` je Bereich, Seitenleiste neutral `accentSoft`; Bildschirmfotos „Frisch“                                                                                 | Rundgang                                               |
| AC-052 bis AC-060 | Task 2: Durchläufe `tmp/0005-t2/probe*.mjs`; Task 3: Seitenleiste als `Sidebar` aus `packages/ui`, ⊞ mit Symbol `layout-grid`                                                                                                                   | Rundgänge laut `e2e-impact.md`                         |
| AC-061, AC-062    | Tab und Seitenleiste „Übersicht“ (Durchlauf: erster Eintrag „Übersicht“ auf Handy und Desktop), „Zur Übersicht“ auf „Nicht gefunden“; E2E AC-007 angepasst                                                                                      | Rundgang AC-062                                        |

- [x] Tests rot zuerst für die neue Logik (Task 1: Sammel-Fenster, Fenstergrößen, Wortteil-Suche).
      Task 3 ändert nur Darstellung und Einsatz; geprüft per Typen, Dev-Smoke und Durchlauf.
- [x] `pnpm format:check`, `pnpm check` (17/17), `pnpm build:web` (mit `EXPO_PUBLIC_DEV_LOGIN=1`)
      grün; `pnpm e2e:dev` grün (Dev-Smoke ohne React-Warnung)
- [x] Klick-Durchlauf gegen den Web-Export: 17 Seiten je 390 × 844 und 1440 × 900 px in Markthalle
      hell und dunkel, Frisch hell, Klar dunkel: 85/85 je Lauf, keine Konsolenfehler; Bildschirmfotos
      `tmp/0005-t3/shots/`
- [x] Glossar („Sammel-Fenster“ mit `useCheckWindow`, `CHECK_WINDOW_MS`) und DESIGN.md (Bausteine,
      Frisch, Breite 1320 px, Fenstergrößen) aktuell
- [ ] Voller `pnpm e2e` mit den Anpassungen aus `tmp/brief/e2e-impact.md` (am Ende der Wellen)
- [ ] `/ui-verify` und `impeccable`-Kritik der neuen Seitenrahmen (offen; Bildschirmfotos liegen vor)

**Bewusst so gelassen:** Kochen und Einkaufen behalten als Vollbild-Modi ihre Lesebreite (860 bzw.
760 px); Anmeldung und „Willkommen“ (ohne Haushalt) liegen außerhalb der Tabs und bleiben schmal.
„Haushalt wechseln“ bleibt ein kleines Fenster statt eines Menüs, weil es auch „Neuer Haushalt“
enthält. Abhaken, „Suchen oder anlegen“, Filterzeile und Endlos-Liste werden laut Spec-Tabelle
erst von den Specs 0006 bis 0011 eingesetzt. Die Kalenderwoche im Plan steht über der Woche statt
im Kopf, damit Titel und Ansichts-Tabs in „Woche“ und „Aktivitäten“ an derselben Stelle stehen.
