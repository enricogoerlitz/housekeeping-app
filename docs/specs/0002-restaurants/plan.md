---
status: in-arbeit # offen | in-arbeit | erledigt
datum: 2026-11-20
spec: 0002
---

# 0002 — Plan

## Ansatz

Restaurants entstehen zuerst im Frontend-Stand von Spec 0001, also mit Beispieldaten im
Speicher und ohne Supabase. Die reine Logik liegt in `core` (`restaurants.ts`: Karten-Link lesen,
Routen-Links bauen, Dubletten finden, Besuche aus dem Wochenplan ableiten). `api` bekommt
Befehle (`commands-restaurants.ts`) und Lese-Hooks, die Demo-Daten erhalten vier Restaurants mit
Besuchen. Die App baut den Umschalter „Rezepte · Restaurants“ im Tab „Essen“, Liste, Detail,
Hinzufügen-Sheet, Route-Sheet, die Route `/teilen` und den Modus „Restaurant“ im Wochenplan.
Betroffen: `core`, `api`, `app`; `ui` nur, falls ein Baustein fehlt.

## Datenbank und Sync

Im Frontend-Stand keine Änderung. Mit der ersten Daten-Spec folgen über den `db-change`-Skill:

- Tabelle `restaurants` (`household_id`, Name, Adresse, `lat`/`lng`, `maps_url`, Küche,
  Preisniveau, Schlagworte, Notiz), dazu `restaurant_ratings` und `restaurant_favorites` je
  Mitglied, damit sich zwei Personen nicht überschreiben;
- `meal_plan_entries.kind` um `restaurant` erweitern, Spalte `restaurant_id` mit
  zusammengesetztem Fremdschlüssel (`household_id`, `restaurant_id`);
- RLS, Grants, pgTAP-Isolationstest, `updated_at`-Trigger und Lösch-Trigger wie bei jeder Tabelle;
- Edge Function für Kurzlinks: folgt der Weiterleitung nur zu Hosts von Google Maps bzw. Apple
  Karten, mit Zeitlimit und ohne interne Adressen (Spec-Frage 3, Annahme A).

## Risiken und Gegenmaßnahmen

| Was könnte schiefgehen                         | Gegenmaßnahme                                                                       | Getestet durch                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------- |
| Ein präparierter Link öffnet eine fremde Seite | `routeLinks` baut die Ziel-URL selbst aus Koordinaten bzw. Name, nie aus dem Link   | Unit-Test `restaurants.test.ts` |
| Das Teilen-Ziel bekommt beliebigen Text        | `/teilen` liest nur `url`/`text` und füllt höchstens das Formular, speichert nichts | Rundgang AC-008                 |
| Kurzlink-Auflösung als offener Proxy (später)  | Edge Function nur für Karten-Hosts, Zeitlimit, keine privaten Adressen              | Edge-Function-Test (Daten-Spec) |
| Doppelte Restaurants nach erneutem Teilen      | `findDuplicateRestaurant` (Name oder Koordinaten nah beieinander)                   | Unit-Test, Rundgang AC-009      |

## Aufgaben

### Task 1 — Logik in core

- **Deckt ab:** AC-003 bis AC-006, AC-009, AC-012, AC-013
- **Berührt:** `packages/core/src/restaurants.ts`, `types.ts`
- **Test:** Link-Varianten (Google-Ort, Apple, Kurzlink, kein Link), Routen-Links, Dubletten,
  Besuche relativ zu heute
- **Status:** erledigt (Unit-Tests folgen mit Task 13 von Spec 0001)

### Task 2 — Befehle, Hooks und Beispieldaten in api

- **Deckt ab:** AC-005, AC-007, AC-010, AC-013
- **Berührt:** `packages/api/src/commands-restaurants.ts`, `queries.ts`, `seed/demo.ts`
- **Test:** „Name fehlt“, simulierter Kurzlink, Bewertung je Mitglied
- **Status:** erledigt

### Task 3 — Oberfläche

- **Deckt ab:** AC-001, AC-002, AC-008, AC-010 bis AC-012
- **Berührt:** `apps/app/src/features/restaurants/`, `features/recipes/recipes-screen.tsx`,
  `features/meal-plan/add-entry-sheet.tsx`, `features/today/today-meals.tsx`, `app/teilen.tsx`,
  `app/restaurant/[id].tsx`
- **Test:** Playwright-Rundgang (Spec 0001, Task 14) um die Restaurant-Schritte erweitert
- **Status:** in Arbeit

### Task 4 — Web-Share-Target (Android-PWA)

- **Deckt ab:** AC-008 auf dem Gerät
- **Berührt:** Web-Manifest der App (`share_target` → `/teilen`)
- **Test:** manuell auf einem Android-Gerät mit installierter PWA
- **Status:** offen (kommt mit der PWA-Auslieferung)

## Bewusst nicht Teil dieses Plans

Restaurantsuche über die Google Places API, Öffnungszeiten, Teilen-Erweiterung für iOS (native
App), echte Kurzlink-Auflösung (Daten-Spec).

## Nachweis

Wird am Ende ausgefüllt.

- [ ] Alle AC haben einen Test, der rot war und jetzt grün ist (spec-auditor)
- [ ] `pnpm format:check && pnpm check && pnpm build:web` grün
- [ ] `/ui-verify` gelaufen, Befunde behoben oder begründet
- [ ] Offline-Verhalten wie in der Spec beschrieben geprüft
- [ ] Glossar und Rückverfolgbarkeitstabelle aktuell
