---
status: entwurf # entwurf | freigegeben | umgesetzt | verworfen
datum: JJJJ-MM-TT
---

# NNNN — Feature-Titel

**Quelle:** Wunsch oder Befund (z. B. ER-09, K-01). **Kritischer Pfad:** nein · ja: Migration,
Löschen, RLS, Anmeldung, Sync, Infrastruktur.

## Ziel

Zwei bis vier Sätze aus Sicht der Nutzenden: welches Problem, woran man erkennt, dass es gelöst
ist. Keine Technik.

## Nicht-Ziele

- …
- …

## Schon erledigt

Nur wenn es das gibt: eine Zeile je Punkt mit Beleg (Spec, Datei).

## Anforderungen

### Bereich

**REQ-001 — Kurztitel.** Ein Satz, was gefordert ist. Quelle: … Offline: offline vollständig ·
offline lesend · nur online (mit Grund).

- AC-001: Angenommen <Ausgangszustand> · Wenn <Handlung> · Dann <beobachtbares Ergebnis>
- AC-002: Angenommen … · Wenn <Handlung, die schiefgehen kann> · Dann <definierte Reaktion>

## Entscheidungen

1. Entscheidung in ein, zwei Zeilen, mit Grund. Ändert sie ein AC einer älteren Spec, steht das
   hier („ersetzt Spec 0006, AC-012“).
2. OFFEN: Frage, Annahme, mit der gebaut wird.

## Daten

Was gelesen, geschrieben, gelöscht wird; Schema-Änderungen; personenbezogene Daten.
Entfällt: …

## Risiken

Nur bei kritischem Pfad.

| Risiko                                       | Gegenmaßnahme | Test      |
| -------------------------------------------- | ------------- | --------- |
| Mitglied eines fremden Haushalts sieht Daten | RLS           | pgTAP `…` |

## Umsetzung

- [ ] 1. Aufgabe (AC-001, AC-002)
- [ ] 2. …
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün
      (+ `pnpm exec supabase test db`, wenn die Datenbank betroffen ist)
