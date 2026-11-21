---
status: in-arbeit # offen | in-arbeit | erledigt
datum: 2026-11-21
spec: 0006
---

# 0006 — Plan

## Ansatz

Eine Migration führt je Haushalt alle Listen in die eine Einkaufsliste zusammen und verhindert neue;
neue RPCs für Liste leeren, ± und Wiederherstellen; Vorauswahl und Herkunft als reine Logik in
`core`; „Liste“ wird Bearbeitungsansicht, „Einkaufen“ wählt den Markt auf dem Gerät. Betroffen:
`supabase`, `core`, `api`, `app`.

## Datenbank und Sync

1. **Listen zusammenführen** (idempotent, eine Transaktion): je Haushalt Ziel = `default_list_id`.
   Offene Posten weiterer Listen ziehen um (Kennung bleibt); gibt es denselben Artikel schon offen,
   wandern die Beiträge in diesen Posten und der leere Posten wird gelöscht. Abgehakte Posten weiterer
   Listen und die weiteren Listen werden gelöscht. Grabsteine entstehen über die vorhandenen Trigger.
2. **Höchstens eine Liste je Haushalt:** `unique (household_id)` auf `shopping_lists`; kein Insert
   mehr über `apply_changes`/Grants (alte Apps bekommen eine Ablehnung → ehrlicher Hinweis);
   `create_household` legt weiter genau eine an. `is_default`/`store_id` werden nicht mehr gelesen
   (expand → contract: Spalten bleiben vorerst).
3. **RPCs:** `clear_shopping_list(list)` (alle Posten inkl. Erledigt, liefert Zeilen für Rückgängig),
   `restore_cleared_items` erweitert: Wiederhergestelltes vereint sich mit inzwischen offenen Posten
   desselben Artikels (AC-037); `adjust_item_count(item, delta)` atomar je Tipp (AC-017, Regel 4a:
   erst der Anteil „von Hand“), Grenzen 0…99; Zusatz für den ganzen Posten über `apply_changes`.
4. **Warteschlange nach der Migration (AC-004):** `add_shopping_contributions` mit der Kennung einer
   gelöschten Liste findet über `deleted_records` den Haushalt und nimmt dessen eine Liste; Haken auf
   umgezogene Posten treffen dieselbe Kennung; Haken auf zusammengeführte (gelöschte) Posten werden
   ohne Fehler verworfen (wie AC-025 aus 0003).

## core / api

- core: Vorauswahl D21 (ab heute bis Wochenende, nur was noch nicht auf der Liste steht), Herkunft
  („Mango-Curry (Sa)“ vs. ohne Tag), ±-Aufteilung, „Nadja kauft gerade ein“ (Haken der letzten 15 min).
- api: eine Liste als Hook, Befehle für ±, Zusatz, Entfernen (mit Rückgängig), Liste leeren,
  Erledigt leeren; zuletzt gewählter Markt **nur auf dem Gerät** je Haushalt (beim Abmelden gelöscht);
  Vorratscheck startbar mit beliebigen Rezepten (für 0008/0009). `CACHE_VERSION` +1 — **dabei bleibt
  die Laden-Warteschlange erhalten** (bisher löschte ein Versionswechsel sie mit; das behebt auch den
  in Spec 0014 gefundenen Fehler).

## App

- **„Liste“** (D24): kein Abhaken; Zeilen mit „− 2× +“ bzw. „500 g ›“, Tipp → „Posten bearbeiten“
  (m: Zusatz, Bereich per „Suchen oder anlegen“, Entfernen), Wischen entfernt mit Rückgängig, ⋯ mit
  Erledigt leeren / Liste leeren (kleines Bestätigungsfenster) / Märkte & Bereiche; „Was fehlt?“
  immer sichtbar (F1, Test gegen echtes Backend).
- **„Einkaufen“** (D26): Markt-Chip → „Wo kaufst du ein?“, Abhaken mit Sammel-Fenster (0005),
  „Im Wagen (n)“, „Fertig“ mit „8 gekauft · 2 bleiben“.
- **„Auf die Einkaufsliste“** (D21): großes Fenster, Schritt 1 mit Wochen ‹ ›, Tag-Tipp wählt alle,
  „Vorgemerkt“, „Rezept wählen …“; Schritt 2 Vorratscheck ausgewählt = normal, abgewählt = blass.
  Direkt-Einstieg von der Rezeptseite (REQ-010).

## Risiken und Gegenmaßnahmen

| Risiko                                            | Gegenmaßnahme                                                                                      | Test                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Datenverlust bei der Zusammenführung              | eine Transaktion, Beiträge wandern einzeln, nur Erledigtes weiterer Listen wird gelöscht           | pgTAP mit Fixture (zwei Listen, gleicher Artikel offen/abgehakt) |
| Zusammenführung über Haushaltsgrenzen             | nur innerhalb `household_id`, zusammengesetzte FKs                                                 | pgTAP                                                            |
| Neue Listen über die API                          | Constraint + kein Insert-Grant/Allowlist                                                           | pgTAP Angriff                                                    |
| Fremder Haushalt leert/ändert Liste               | RPCs als invoker unter RLS bzw. Mitgliedsprüfung                                                   | pgTAP je RPC, anon                                               |
| ± verliert Tipps / läuft über                     | atomares Inkrement, Grenzen 0…99                                                                   | pgTAP + api-Test                                                 |
| Offline-Aktionen vor der Migration gehen verloren | Liste über `deleted_records` auflösen, gleiche Posten-IDs, Warteschlange übersteht Versionswechsel | pgTAP + api-Test                                                 |
| Rückgängig nach „Liste leeren“ dupliziert Posten  | Wiederherstellen vereint mit offenen Posten                                                        | pgTAP AC-037                                                     |
| Markt-Wahl verrät Aufenthalt                      | bleibt auf dem Gerät, beim Abmelden gelöscht                                                       | api-Test                                                         |

## Aufgaben

1. DB (Migrationen 1–4, pgTAP) ‖ core-Logik — parallel.
2. api (Hooks, Befehle, Warteschlange über Versionswechsel, Gerät-Marktwahl, Seed eine Liste).
3. App „Liste“ + „Posten bearbeiten“ ‖ App „Einkaufen“ + „Auf die Einkaufsliste“ — getrennte Dateien.
4. `/security-check`, Nachweis im plan.md. Keine volle E2E-Suite (kommt am Ende der Wellen);
   F1 wird gezielt gegen das echte Backend geprüft.

## Verifikation

`pnpm db:reset` + `pnpm exec supabase test db`, `pnpm check`, `pnpm e2e:dev`, gezielter
Klick-Durchlauf (Liste bearbeiten, ±, leeren + Rückgängig, Einkaufen mit Markt, Auf die Einkaufsliste
aus der Vorwoche, offline hinzufügen → Migration → online), Migration auf den Demo-Daten (zweite Liste
„Drogerie“ verschwindet, Posten landen in der einen Liste).

## Nachweis

Wird am Ende ausgefüllt.
