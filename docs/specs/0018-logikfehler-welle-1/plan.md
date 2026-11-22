# Plan 0018 — Fehler aus dem Logik-Review, Welle 1

Spec: `docs/specs/0018-logikfehler-welle-1/spec.md` (8 REQ, 24 AC, AC-005 verworfen). Branch
`feat/0018-logikfehler-welle-1`. Keine Datenbank-Änderung, kein neuer Schreibweg.

## Vorgehen

Testgetrieben je Befund: erst der rote Test (core/api mit Vitest, die Verdrahtung in der App mit
einem e2e-Fall), dann die kleinste Änderung. `apps/app` hat keine Komponententests (jest-expo ist
nicht eingerichtet); was dort geprüft werden muss, prüfen e2e-Tests mit Playwright. Logik so weit wie möglich nach `packages/core`
(Auswahl des Avatars bei „Abwechselnd“, Treffer-Vergleich, Texte aus Zuständen, Zählung ab heute).

## Aufgaben

| Task | Inhalt                                                                                                                                                          | Befunde                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1    | Essen: Zutaten beim Anlegen, Kochmodus mit Portionen, keine Neuanlage bei exaktem Treffer, Toast mit Datum                                                      | E-01, E-02, K-13, E-10       |
| 2    | Kalender, Haushalt, Übersicht: „Fertig“ speichert alles, Avatar bei „Abwechselnd“, Packkarte ab heute, Hinweis im Abwesenheitsfenster, Toast beim Abbruch       | K-03, H-07, U-05, K-12, X-07 |
| 3    | Verwalten und Sitzung: Rückfrage bei Entfernen und Verlassen, Rückfrage beim Abmelden mit Warteschlange, Zeile „Benachrichtigungen“, Text bei zu alter Version  | V-01, V-06, V-07, X-06       |
| 4    | Nachweis: `pnpm format:check && pnpm check && pnpm build:web`, `pnpm e2e:dev`, `/ui-verify` der geänderten Stellen, spec-auditor, `/security-check` über Task 3 | —                            |

Tasks 1 bis 3 berühren getrennte Feature-Ordner und laufen parallel.

## Risiken und Gegenmaßnahmen (kritische Pfade in Task 3)

Wo „Komponententest“ geplant war, prüft ein e2e-Test dasselbe (siehe „Vorgehen“).

| Risiko                                                                                              | Gegenmaßnahme                                                                          | Test                                                       |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Rückfrage beim Entfernen wird umgangen (Aufruf vor der Bestätigung)                                 | Der Befehl wird erst im Bestätigungs-Handler aufgerufen                                | e2e: Abbrechen → kein Aufruf an `remove_member`            |
| Die Rückfrage handelt an einem anderen Haushalt, als sie nennt (er wechselt, während sie offen ist) | Wechselt der aktive Haushalt, schließt die Rückfrage                                   | e2e: Nadja wird entfernt, während ihre Rückfrage offen ist |
| Die Rückfrage ersetzt die Rechteprüfung                                                             | Sie ist nur Bedienung; Entfernen prüft weiter der Server (RLS, bestehende pgTAP-Tests) | bestehende pgTAP-Tests bleiben grün                        |
| Abmelden lässt nach „Abbrechen“ halbe Zustände zurück                                               | Abmelden beginnt erst nach der Bestätigung; Abbrechen ändert nichts                    | api-Test und e2e: Warteschlange unverändert                |
| „Trotzdem abmelden“ löscht nicht mehr alles                                                         | derselbe Abmeldeweg wie bisher (Sitzung, lokaler Speicher, Warteschlange)              | bestehender Test „Sign-out clears cache and queue“         |
| Zählung der Warteschlange falsch (zeigt 0, obwohl etwas wartet)                                     | Zählung aus der Warteschlange selbst, als reine Funktion in core                       | core-Test mit Laden- und Pack-Einträgen                    |

## Nachweis

- [ ] Je AC ein Test, der rot war und jetzt grün ist (oder begründet: nur Klick-Durchlauf)
- [x] e2e-Tests der Verdrahtung rot → grün (am 22.11.2026 einzeln gelaufen): AC-004/AC-006 in
      `e2e/rundgang-essen.spec.ts`; AC-007/AC-009 und REQ-004 (Rückfrage schließt beim
      Haushaltswechsel) in `e2e/rundgang-backend-sync.spec.ts`; AC-011, AC-012 in
      `e2e/rundgang-backend-anmeldung.spec.ts`; AC-018/AC-019, AC-021 in `e2e/rundgang-plan.spec.ts`
- [x] `pnpm format`, `pnpm lint`, `pnpm typecheck` und die Unit-Tests von core und api grün
- [ ] `pnpm format:check && pnpm check && pnpm build:web` grün
- [ ] `pnpm e2e:dev` grün
- [ ] `/ui-verify` für Kochmodus, Eintragsfenster, Mitglieder, Abmelden
- [ ] spec-auditor ohne fehlende AC
- [ ] `/security-check` über Task 3
